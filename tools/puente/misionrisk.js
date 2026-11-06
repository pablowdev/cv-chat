// GlobalSiege (antes MissionRisk, de Doug Burner, GNU GPL v3: https://github.com/labarks/globalsiege)
// para la seccion Juegos de la app: la guerra por el mundo de 2 a 6 ejercitos, con gente del
// chat y la compu. Las reglas estan en misionrisk-motor.js y el mapa en web/misionrisk/.
//
// Por el socket de Haven (con respuesta):
//   mr:inicio                           -> { abiertas, mias, stats, ranking }
//   mr:crear  { total, modo: 'compu'|'gente', nivel, invitados: [ids], misiones, buitre }
//             (con gente no hay total: la mesa crece con los que entran, hasta 6, y el que la armo la
//             empieza cuando quiere con los que haya, al menos 2: "flexible". Las de antes, de un total fijo,
//             siguen como eran)
//   mr:unirse { id }   mr:cancelar { id }   mr:empezar { id }   mr:ver { id }
//   mr:accion { id, tipo, ... }  (las jugadas del motor, y 'abandonar' y 'volver')
// Y el servidor avisa:
//   mr:estado (la partida)   mr:cambio (algo cambio en la sala)
//
// Con mas de una persona en la mesa, cada turno tiene TURNO_MS: si se pasa, la compu juega ese
// turno por el ejercito y lo sigue haciendo hasta que su dueño vuelva (boton "Volver a jugar").

const crypto = require('crypto');
const M = require('./misionrisk-motor.js');
const MAPA = require('./web/misionrisk/mapa.js');
const CP = require('./chat-partida.js');

const NIVELES = ['Promedio', 'Sagaz'];
const MAX = 6;
const TURNO_MS = 4 * 60e3;
const ESPERA_MS = 24 * 3600e3;

let db, io, log, warn, webpush = null;
const games = new Map(); // id -> partida
const timers = new Map(); // id -> la proxima jugada de la compu o el fin del turno
const pushed = new Map(); // "id:user" -> ultimo aviso
const rng = (n) => crypto.randomInt(n);

function setup(ctx) {
  ({ db, io, log, warn } = ctx);
  db.exec(`
    CREATE TABLE IF NOT EXISTS puente_mr_mesas (id TEXT PRIMARY KEY, estado TEXT NOT NULL, actualizado INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS puente_mr_partidas (
      id TEXT PRIMARY KEY, jugadores TEXT NOT NULL, ganador INTEGER, humanos INTEGER NOT NULL,
      rondas INTEGER, inicio INTEGER, fin INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS puente_mr_resultados (partida TEXT NOT NULL, user_id INTEGER NOT NULL, gano INTEGER NOT NULL, humanos INTEGER NOT NULL, fin INTEGER NOT NULL, PRIMARY KEY (partida, user_id));
    CREATE INDEX IF NOT EXISTS idx_puente_mr_res_user ON puente_mr_resultados(user_id);
  `);
  // Las amistosas no suman al ranking (las elige quien arma la mesa; con un invitado siempre lo son)
  try { db.exec('ALTER TABLE puente_mr_partidas ADD COLUMN amistosa INTEGER NOT NULL DEFAULT 0'); } catch { /* ya estaba */ }
  try { db.exec('ALTER TABLE puente_mr_resultados ADD COLUMN amistosa INTEGER NOT NULL DEFAULT 0'); } catch { /* ya estaba */ }
  try { webpush = require('/app/node_modules/web-push'); } catch { /* sin avisos al celular */ }
  for (const r of db.prepare('SELECT id, estado FROM puente_mr_mesas').all()) {
    try {
      const g = JSON.parse(r.estado);
      if (g.estado === 'terminada' && Date.now() - (g.fin || 0) > 3600e3) { db.prepare('DELETE FROM puente_mr_mesas WHERE id = ?').run(r.id); continue; }
      if (g.estado === 'esperando' && Date.now() - g.creado > ESPERA_MS) { db.prepare('DELETE FROM puente_mr_mesas WHERE id = ?').run(r.id); continue; }
      games.set(g.id, g);
      if (g.estado === 'jugando') { g.deadline = g.deadline ? Math.max(g.deadline, Date.now() + 60e3) : null; arm(g); }
    } catch { /* fila rota */ }
  }
  setInterval(sweep, 10 * 60 * 1000).unref();
  io.on('connection', (socket) => {
    const on = (ev, fn) => socket.on(ev, (data, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      const me = socket.user && socket.user.id;
      if (!me) return reply({ error: 'sin sesion' });
      try { reply(fn(me, data || {}, socket) || { ok: true }); } catch (err) { warn('globalsiege:', err.message); reply({ error: 'Algo salió mal.' }); }
    });
    on('mr:inicio', (me) => lobby(me));
    on('mr:crear', create);
    on('mr:unirse', join);
    on('mr:cancelar', cancel);
    on('mr:empezar', (me, d) => {
      const g = games.get(String(d.id));
      if (!g || g.creador !== me || g.estado !== 'esperando') return { error: 'No se puede empezar.' };
      // (la flexible arranca con los que estan: hace falta alguien mas)
      if (g.flexible && humanos(g).length < 2) return { error: 'Hace falta que entre alguien más para empezar. Si querés, jugá con la compu.' };
      start(g); return { ok: true };
    });
    // el que mira una partida (aunque no juegue) recibe sus cambios
    on('mr:ver', (me, d, socket) => { const g = games.get(String(d.id)); if (!g) return { error: 'Esa partida ya no está.' }; if (!canSee(g, me)) return { error: 'Esa partida es privada.' }; socket.mrMirando = g.id; return { partida: view(g, me) }; });
    on('mr:accion', act);
  });
  log(`globalsiege: listo (${games.size} partidas en curso)`);
}

// ── Partidas ──
const nameOf = (id) => {
  const u = db.prepare('SELECT id, COALESCE(display_name, username) nombre, avatar FROM users WHERE id = ?').get(id);
  return u ? { id: u.id, nombre: u.nombre, avatar: u.avatar || null } : { id, nombre: 'Alguien', avatar: null };
};
const humanos = (g) => g.asientos.filter(a => a.uid).map(a => a.uid);
const seatOf = (g, me) => g.asientos.findIndex(a => a.uid === me);
const canSee = (g, me) => seatOf(g, me) >= 0 || g.publica || g.invitados.includes(me);

function save(g) {
  try { db.prepare('INSERT OR REPLACE INTO puente_mr_mesas (id, estado, actualizado) VALUES (?, ?, ?)').run(g.id, JSON.stringify(g), Date.now()); } catch (err) { warn('globalsiege: guardar:', err.message); }
}
function drop(g) { games.delete(g.id); clearTimeout(timers.get(g.id)); timers.delete(g.id); try { db.prepare('DELETE FROM puente_mr_mesas WHERE id = ?').run(g.id); } catch { /* ya no estaba */ } }
function sweep() {
  const now = Date.now();
  for (const g of [...games.values()]) {
    if (g.estado === 'terminada' && now - (g.fin || 0) > 3600e3) drop(g);
    else if (g.estado === 'esperando' && now - g.creado > ESPERA_MS) { drop(g); changed(); }
  }
}

function create(me, d) {
  const mine = [...games.values()].filter(g => g.estado !== 'terminada' && seatOf(g, me) >= 0);
  if (mine.length >= 8) return { error: 'Tenés muchas partidas abiertas. Terminá o cancelá alguna.' };
  const modo = d.modo === 'gente' ? 'gente' : 'compu';
  const total = modo === 'gente' ? MAX : Math.max(2, Math.min(MAX, Number(d.total) || 4));
  const nivel = Number(d.nivel) === 1 ? 1 : 2;
  const invitados = modo === 'gente' && Array.isArray(d.invitados)
    ? [...new Set(d.invitados.map(Number))].filter(x => x > 0 && x !== me && db.prepare('SELECT 1 FROM users WHERE id = ?').get(x)).slice(0, total - 1)
    : [];
  const g = {
    id: crypto.randomBytes(5).toString('hex'), creado: Date.now(), creador: me, estado: 'esperando',
    publica: modo === 'gente' && d.privada !== true, invitados, nivel, amistosa: modo === 'gente' && d.amistosa === true,
    opciones: { misiones: d.misiones !== false, buitre: !!d.buitre },
    asientos: modo === 'gente' ? [{ uid: me }] : Array.from({ length: total }, (_, i) => i === 0 ? { uid: me } : { uid: null }),
    flexible: modo === 'gente',
    S: null, deadline: null, ausente: {}, compuPor: {},
  };
  games.set(g.id, g);
  if (modo === 'compu') start(g);
  else {
    save(g); changed();
    for (const uid of invitados) notify(uid, 'GlobalSiege', `${nameOf(me).nombre} te invitó a una guerra`, g.id);
    // La mesa abierta, en #que-paso (juegos-aviso.js)
    if (g.publica) require('./juegos-aviso.js').anunciar(db, io, warn, { juego: 'globalsiege', quien: me, enlace: `/app?globalsiege=${g.id}`,
      texto: `armó una guerra${g.amistosa ? ' amistosa' : ''} de **GlobalSiege** (hasta ${MAX}${g.opciones.misiones ? ', con misiones secretas' : ''})` });
  }
  log(`globalsiege: ${nameOf(me).nombre} creó una partida (${modo}, ${g.flexible ? 'de 2 a ' + MAX : total + ' ejércitos'}${g.amistosa ? ', amistosa' : ''})`);
  return { ok: true, id: g.id };
}

function join(me, d) {
  const g = games.get(String(d.id));
  if (!g) return { error: 'Esa partida ya no está.' };
  if (seatOf(g, me) >= 0) return { ok: true, id: g.id };
  if (g.estado !== 'esperando') return { error: 'Esa partida ya empezó.' };
  if (!g.publica && !g.invitados.includes(me)) return { error: 'Esa partida es privada.' };
  if (g.flexible) {
    if (g.asientos.length >= MAX) return { error: 'La mesa está completa.' };
    g.asientos.push({ uid: me });
  } else {
    const libre = g.asientos.find(a => !a.uid);
    if (!libre) return { error: 'La mesa está completa.' };
    libre.uid = me;
  }
  if (g.asientos.length >= MAX ? g.asientos.every(a => a.uid) : !g.flexible && g.asientos.every(a => a.uid)) start(g);
  else { push(g); changed(); }
  return { ok: true, id: g.id };
}

function cancel(me, d) {
  const g = games.get(String(d.id));
  if (!g || g.estado !== 'esperando') return { error: 'No se puede cancelar.' };
  if (g.creador === me) { drop(g); changed(); return { ok: true }; }
  // Los demas se levantan de la mesa
  const i = seatOf(g, me);
  if (i < 0) return { error: 'No estás en esta partida.' };
  if (g.flexible) g.asientos.splice(i, 1); else g.asientos[i].uid = null;
  push(g); changed();
  return { ok: true };
}

// Los asientos vacios quedan para la compu; el orden de los ejercitos es el de los asientos
function start(g) {
  g.estado = 'jugando';
  g.inicio = Date.now();
  g.asientos = g.asientos.map(a => a.uid ? a : { uid: null, compu: true, nivel: g.nivel });
  // Las personas en lugares al azar (el Rojo no siempre es el que creo la mesa)
  for (let i = g.asientos.length - 1; i > 0; i--) { const j = rng(i + 1); [g.asientos[i], g.asientos[j]] = [g.asientos[j], g.asientos[i]]; }
  const jugadores = g.asientos.map((a, i) => ({ nombre: a.uid ? nameOf(a.uid).nombre : `La Compu (${MAPA.ejercitos[i + 1].corto})` }));
  g.S = M.nueva(jugadores, g.opciones, rng);
  tick(g, true);
  changed();
}

function finish(g) {
  if (g.estado === 'terminada') return;
  g.estado = 'terminada'; g.fin = Date.now(); g.deadline = null;
  clearTimeout(timers.get(g.id)); timers.delete(g.id);
  const gan = g.S.ganador ? g.asientos[g.S.ganador.ej - 1] : null;
  const hum = humanos(g).length;
  // (las de los invitados quedan como amistosas: juegos-aviso.js)
  const amistosa = g.amistosa || require('./juegos-aviso.js').conInvitado(db, g.asientos.map(a => a.uid || 0));
  try {
    db.prepare('INSERT OR REPLACE INTO puente_mr_partidas (id, jugadores, ganador, humanos, rondas, inicio, fin, amistosa) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(g.id, JSON.stringify(g.asientos.map(a => a.uid || 0)), gan && gan.uid ? gan.uid : null, hum, g.S.ronda, g.inicio || null, g.fin, amistosa ? 1 : 0);
    for (const a of g.asientos) {
      if (!a.uid) continue;
      db.prepare('INSERT OR REPLACE INTO puente_mr_resultados (partida, user_id, gano, humanos, fin, amistosa) VALUES (?, ?, ?, ?, ?, ?)').run(g.id, a.uid, gan && gan.uid === a.uid && !a.abandono ? 1 : 0, hum, g.fin, amistosa ? 1 : 0);
    }
  } catch (err) { warn('globalsiege: guardar resultado:', err.message); }
  changed();
}

// ¿Juega la compu este turno? Si el asiento es de la compu, si su dueño abandono o si se le paso el tiempo
const juegaCompu = (g, e) => { const a = g.asientos[e - 1]; return !a.uid || a.abandono || !!g.ausente[e]; };

function act(me, d) {
  const g = games.get(String(d.id));
  if (!g) return { error: 'Esa partida ya no está.' };
  const i = seatOf(g, me);
  if (i < 0) return { error: 'No estás en esta partida.' };
  // El zumbido para apurar al que le toca (chat-partida.js)
  if (d.tipo === 'zumbido') {
    if (g.estado !== 'jugando') return { error: 'La partida no está en juego.' };
    const t = g.S.turno, para = juegaCompu(g, t) ? null : g.asientos[t - 1].uid;
    const r = CP.zumbar({ g, juego: 'globalsiege', titulo: 'GlobalSiege', url: `/app?globalsiege=${g.id}`, yo: me, de: nameOf(me).nombre, quien: me, para, io, db, webpush });
    if (r.ok) push(g);
    return r;
  }
  // El chat entre las personas de la mesa (chat-partida.js): desde la espera hasta que se cierra la mesa
  if (d.tipo === 'chat') {
    if (humanos(g).length < 2) return { error: 'El chat es para cuando hay más personas en la mesa.' };
    const err = CP.chatear(g, me, d.texto);
    if (err) return { error: err };
    push(g);
    return { ok: true };
  }
  if (g.estado !== 'jugando') return { error: 'La partida no está en juego.' };
  const e = i + 1, S = g.S;
  if (d.tipo === 'abandonar') {
    if (g.asientos[i].abandono) return { ok: true };
    g.asientos[i].abandono = true;
    M.nota(S, `${S.ej[e].nombre} abandonó: la compu sigue con su ejército.`);
    if (humanos(g).every(uid => g.asientos[seatOf(g, uid)].abandono || !S.ej[seatOf(g, uid) + 1].vivo)) {
      // No queda nadie: se termina sin ganador
      S.ganador = S.ganador || { ej: 0, texto: 'sin nadie que siga jugando' };
      finish(g); push(g, true);
      return { ok: true };
    }
    tick(g);
    return { ok: true };
  }
  if (d.tipo === 'volver') {
    if (g.asientos[i].abandono) return { error: 'Abandonaste esta partida.' };
    if (g.ausente[e]) { delete g.ausente[e]; M.nota(S, `${S.ej[e].nombre} volvió a jugar.`); tick(g); }
    return { ok: true };
  }
  if (g.asientos[i].abandono) return { error: 'Abandonaste esta partida.' };
  if (S.turno !== e) return { error: 'No es tu turno.' };
  if (g.ausente[e]) { delete g.ausente[e]; M.nota(S, `${S.ej[e].nombre} volvió a jugar.`); }
  const err = M.aplicar(S, e, d, rng);
  if (err) return { error: err };
  // Cada jugada estira un poco el tiempo del turno
  if (g.deadline) g.deadline = Math.max(g.deadline, Date.now() + 90e3);
  after(g);
  return { ok: true };
}

// Despues de cada jugada: si termino la guerra, si cambio el turno, avisar
function after(g) {
  const S = g.S;
  if (S.ganador) { finish(g); push(g, true); return; }
  if (S.turno !== g.turnoVisto) tick(g, true);
  else { arm(g); push(g); }
}

// ── El turno ──
// Con mas de una persona, el turno de cada persona tiene tiempo; la compu juega sola
function tick(g, nuevo) {
  const S = g.S;
  if (nuevo) {
    g.turnoVisto = S.turno;
    g.deadline = !juegaCompu(g, S.turno) && humanos(g).filter(uid => !g.asientos[seatOf(g, uid)].abandono).length > 1 ? Date.now() + TURNO_MS : null;
  }
  arm(g);
  push(g);
}

function arm(g) {
  clearTimeout(timers.get(g.id));
  if (g.estado !== 'jugando') return;
  const S = g.S, e = S.turno;
  if (juegaCompu(g, e)) {
    // Mas rapido si ya no queda ninguna persona en la guerra
    const vivos = g.asientos.some((a, i) => a.uid && !a.abandono && S.ej[i + 1].vivo);
    timers.set(g.id, setTimeout(() => botStep(g), vivos ? 450 + rng(250) : 120));
  } else if (g.deadline) {
    timers.set(g.id, setTimeout(() => timeout(g), Math.max(0, g.deadline - Date.now())));
  }
}

// Se le paso el tiempo: la compu juega por el hasta que vuelva
function timeout(g) {
  if (g.estado !== 'jugando') return;
  const S = g.S, e = S.turno;
  if (juegaCompu(g, e)) return arm(g);
  if (g.deadline && Date.now() < g.deadline - 500) return arm(g);
  g.ausente[e] = true;
  M.nota(S, `⏰ A ${S.ej[e].nombre} se le pasó el tiempo: la compu juega por su ejército hasta que vuelva.`);
  g.deadline = null;
  arm(g); push(g);
}

function botStep(g) {
  if (g.estado !== 'jugando') return;
  const S = g.S, e = S.turno;
  if (!juegaCompu(g, e)) return arm(g);
  const a = g.asientos[e - 1];
  let accion = null;
  try { accion = M.compuAccion(S, e, a.uid ? 2 : a.nivel || 2, rng); } catch (err) { warn('globalsiege: compu:', err.message); }
  let err = accion ? M.aplicar(S, e, accion, rng) : 'sin jugada';
  // Por las dudas: si la compu se traba, termina el turno (o pone todo en su primer pais)
  if (err) {
    warn('globalsiege: la compu no pudo jugar:', err, JSON.stringify(accion));
    err = M.aplicar(S, e, S.fase === 'poner' ? { tipo: 'poner', pais: S.dueno.indexOf(e), n: S.poner } : { tipo: 'terminar' }, rng);
    if (err && S.fase === 'canje') { const c = M.mejorCanje(S.ej[e].cartas); if (c) M.aplicar(S, e, { tipo: 'canjear', cartas: c.pos }, rng); }
  }
  after(g);
}

// ── La partida como la ve cada uno ──
function view(g, me) {
  const i = seatOf(g, me), e = i + 1;
  const S = g.S;
  const out = {
    id: g.id, estado: g.estado, publica: g.publica, soyJugador: i >= 0, soyCreador: g.creador === me, flexible: !!g.flexible, maximo: MAX,
    nivel: NIVELES[g.nivel - 1], opciones: g.opciones, miEj: i >= 0 ? e : null,
    invitados: g.invitados.map(nameOf),
    // el chat, con el nombre y el color del ejercito de cada uno (en la espera todavia no tienen)
    chat: i >= 0 && humanos(g).length > 1 ? CP.mensajes(g, me, (uid) => {
      const k = seatOf(g, uid);
      return { quien: uid === me ? 'Vos' : nameOf(uid).nombre, color: S && k >= 0 ? MAPA.ejercitos[k + 1].color : null };
    }) : null,
    asientos: g.asientos.map((a, k) => {
      const p = a.uid ? nameOf(a.uid) : null;
      const x = { ej: k + 1, color: MAPA.ejercitos[k + 1].color, ejercito: MAPA.ejercitos[k + 1].nombre, nombre: p ? p.nombre : (g.estado === 'esperando' ? null : 'La Compu'), avatar: p ? p.avatar : null, compu: !a.uid, nivel: !a.uid && a.nivel ? NIVELES[a.nivel - 1] : null, yo: a.uid === me };
      if (S) {
        const ej = S.ej[k + 1];
        Object.assign(x, { vivo: ej.vivo, paises: M.paisesDe(S, k + 1), tropas: M.tropasDe(S, k + 1), cartas: ej.cartas.length, ausente: !!g.ausente[k + 1], abandono: !!a.abandono, conquistas: ej.conquistas, bajas: ej.bajas });
        if (g.estado === 'terminada') x.mision = M.MISIONES[ej.inicial].texto;
      }
      return x;
    }),
  };
  if (S) {
    Object.assign(out, {
      dueno: S.dueno, tropas: S.tropas, turno: S.turno, fase: S.fase, poner: S.poner, ronda: S.ronda,
      ataque: S.ataque, dados: S.dados, log: S.log.slice(-14), deadline: g.deadline, jugada: S.jugada,
      teToca: i >= 0 && S.turno === e && g.estado === 'jugando' && !g.asientos[i].abandono,
      ausente: i >= 0 && !!g.ausente[e], abandone: i >= 0 && !!g.asientos[i].abandono,
      movidas: S.turno === e ? S.movidas : null,
      ganador: S.ganador ? { ej: S.ganador.ej, texto: S.ganador.texto, yo: S.ganador.ej === e } : null,
    });
    if (i >= 0) {
      out.misCartas = S.ej[e].cartas;
      out.miMision = S.opciones.misiones ? M.MISIONES[S.ej[e].mision].texto : M.MISIONES[0].texto;
      out.canje = M.mejorCanje(S.ej[e].cartas);
      out.valorTurno = M.valor(S, e);
    }
  }
  return out;
}

function push(g, big) {
  if (g.estado === 'jugando' && g.S) CP.turno(g, g.asientos[g.S.turno - 1].uid || 0, undefined, true); // (para el zumbido y la ultima jugada)
  save(g);
  const ids = humanos(g);
  for (const [, s] of io.sockets.sockets) {
    if (s.user && (ids.includes(s.user.id) || (s.mrMirando === g.id))) { try { s.emit('mr:estado', view(g, s.user.id)); } catch { /* sesion cerrada */ } }
  }
  if (g.estado === 'jugando') notifyTurn(g);
  if (big) changed();
}

function notify(uid, title, body, id) {
  if (!webpush) return;
  const payload = JSON.stringify({ title, body, url: `/app?globalsiege=${id}`, tag: 'globalsiege-' + id, __puente: 1 });
  for (const sub of db.prepare('SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?').all(uid)) {
    webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, { TTL: 600 }).catch(() => {});
  }
}
function notifyTurn(g) {
  const S = g.S, a = g.asientos[S.turno - 1];
  if (!a.uid || juegaCompu(g, S.turno)) return;
  for (const [, s] of io.sockets.sockets) if (s.user && s.user.id === a.uid && s.hasFocus !== false) return;
  const key = g.id + ':' + a.uid;
  if (Date.now() - (pushed.get(key) || 0) < 3 * 60e3) return;
  pushed.set(key, Date.now());
  notify(a.uid, 'GlobalSiege', `Te toca: sos el ${MAPA.ejercitos[S.turno].nombre}`, g.id);
}

let changeTimer = null;
function changed() {
  clearTimeout(changeTimer);
  changeTimer = setTimeout(() => { try { io.emit('mr:cambio', {}); } catch { /* sin conexiones */ } }, 300);
}

// ── Sala ──
function stats(userId) {
  const r = db.prepare('SELECT SUM(gano) g, COUNT(*) n FROM puente_mr_resultados WHERE user_id = ? AND humanos > 1 AND amistosa = 0').get(userId);
  const a = db.prepare('SELECT SUM(gano) g, COUNT(*) n FROM puente_mr_resultados WHERE user_id = ? AND humanos > 1 AND amistosa = 1').get(userId);
  const c = db.prepare('SELECT SUM(gano) g, COUNT(*) n FROM puente_mr_resultados WHERE user_id = ? AND humanos = 1').get(userId);
  return { ganadas: r.g || 0, perdidas: (r.n || 0) - (r.g || 0), compuGanadas: c.g || 0, compuPerdidas: (c.n || 0) - (c.g || 0),
    amistosasGanadas: a.g || 0, amistosasPerdidas: (a.n || 0) - (a.g || 0) };
}
function ranking(since) {
  return db.prepare(`SELECT user_id id, SUM(gano) n FROM puente_mr_resultados WHERE humanos > 1 AND amistosa = 0 AND fin >= ?
    GROUP BY user_id HAVING n > 0 ORDER BY n DESC LIMIT 10`).all(since).map(r => ({ ...nameOf(r.id), ganadas: r.n }));
}
function resumen(g, me) {
  const otros = g.asientos.filter(a => a.uid && a.uid !== me).map(a => nameOf(a.uid).nombre);
  const compus = g.estado === 'esperando' ? 0 : g.asientos.filter(a => !a.uid).length;
  const partes = [...otros];
  if (compus) partes.push(compus === 1 ? 'la compu' : `${compus} compus`);
  return partes.length ? partes.join(', ') : 'nadie todavía';
}
function lobby(me) {
  const all = [...games.values()];
  const abiertas = all.filter(g => g.estado === 'esperando' && (g.publica || g.invitados.includes(me)) && seatOf(g, me) < 0 && (g.flexible ? g.asientos.length < MAX : g.asientos.some(a => !a.uid)))
    .sort((a, b) => b.creado - a.creado).slice(0, 30)
    .map(g => ({ id: g.id, total: g.flexible ? MAX : g.asientos.length, flexible: !!g.flexible, sentados: g.asientos.filter(a => a.uid).length, misiones: g.opciones.misiones, amistosa: !!g.amistosa, creador: nameOf(g.creador), paraVos: g.invitados.includes(me) }));
  const mias = all.filter(g => seatOf(g, me) >= 0 && (g.estado !== 'terminada' || Date.now() - g.fin < 10 * 60e3))
    .sort((a, b) => b.creado - a.creado)
    .map(g => {
      const e = seatOf(g, me) + 1;
      return {
        id: g.id, estado: g.estado, total: g.flexible && g.estado === 'esperando' ? MAX : g.asientos.length, flexible: !!g.flexible, amistosa: !!g.amistosa, sentados: g.asientos.filter(a => a.uid).length,
        rival: { nombre: resumen(g, me) }, ejercito: g.S ? MAPA.ejercitos[e].nombre : null, color: g.S ? MAPA.ejercitos[e].color : null,
        teToca: g.estado === 'jugando' && g.S.turno === e && !g.asientos[e - 1].abandono,
        vivo: g.S ? g.S.ej[e].vivo : true, ronda: g.S ? g.S.ronda : 0,
        ganaste: g.estado === 'terminada' ? !!(g.S.ganador && g.S.ganador.ej === e) : null,
      };
    });
  const d = new Date();
  const mes = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) + 3 * 3600e3;
  return { niveles: NIVELES, abiertas, mias, stats: stats(me), ranking: { mes: ranking(mes), total: ranking(0) } };
}

module.exports = { setup, stats, _test: { games, create, join, act, view, start, botStep, timeout } };
