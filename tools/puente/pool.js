// Pool (parte del puente), para la seccion Juegos de la app: pool de 8 bolas, 1 contra 1, contra
// otra persona o contra la compu. La fisica y las reglas estan en pool-motor.js: el servidor
// simula cada tiro y les manda a los dos el recorrido de las bolas (los dos ven lo mismo).
// La pantalla es web/pool/juego.js (la carga aviso.js).
//
// Por el socket de Haven (con respuesta):
//   pool:inicio                      -> { niveles, abiertas, mias, ranking, stats }
//   pool:crear  { modo: 'abierta'|'compu'|'desafio', rival, nivel, amistosa }
//   pool:unirse { id }   pool:cancelar { id }   pool:ver { id }
//   pool:accion { id, tipo: 'tirar'|'apunta'|'abandonar'|'revancha'|'chat', ... }
//     tirar: { ang, fuerza, efecto: {x,y}, blanca: {x,y} }   apunta: { ang, x, y, fuerza } (se le pasa al rival)
// Y el servidor avisa:
//   pool:estado (la partida)   pool:apunta (como apunta el rival)   pool:cambio (algo cambio en la sala)

const crypto = require('crypto');
const M = require('./pool-motor.js');
const CP = require('./chat-partida.js');

const BOT = -1;
const BOT_NAME = 'La Compu';
const NIVELES = ['Fácil', 'Normal', 'Difícil'];

let db, io, log, warn, webpush = null;
const games = new Map(); // id -> partida
const timers = new Map(); // id -> el tiro pendiente de la compu
const pushed = new Map(); // "id:user" -> ultimo aviso
const apuntado = new Map(); // id -> ultima vez que se paso la mira (para no saturar)
const rng = (n) => crypto.randomInt(n);
const rnd = () => crypto.randomInt(1e9) / 1e9;

function setup(ctx) {
  ({ db, io, log, warn } = ctx);
  db.exec(`
    CREATE TABLE IF NOT EXISTS puente_pool_mesas (id TEXT PRIMARY KEY, estado TEXT NOT NULL, actualizado INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS puente_pool_partidas (
      id TEXT PRIMARY KEY, j1 INTEGER NOT NULL, j2 INTEGER NOT NULL, ganador INTEGER, motivo TEXT, tiros INTEGER,
      inicio INTEGER, fin INTEGER NOT NULL, compu INTEGER NOT NULL DEFAULT 0, amistosa INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_puente_pool_fin ON puente_pool_partidas(fin);
  `);
  try { webpush = require('/app/node_modules/web-push'); } catch { /* sin avisos al celular */ }
  for (const r of db.prepare('SELECT id, estado FROM puente_pool_mesas').all()) {
    try {
      const g = JSON.parse(r.estado);
      if (g.estado === 'terminada' && Date.now() - (g.fin || 0) > 3600e3) { db.prepare('DELETE FROM puente_pool_mesas WHERE id = ?').run(r.id); continue; }
      if (g.estado === 'esperando' && Date.now() - g.creado > 24 * 3600e3) { db.prepare('DELETE FROM puente_pool_mesas WHERE id = ?').run(r.id); continue; }
      games.set(g.id, g);
      if (g.estado === 'jugando') arm(g);
    } catch { /* fila rota */ }
  }
  setInterval(sweep, 60 * 1000).unref(); // (cada minuto: asi las mesas de los que se fueron no quedan colgadas)
  setTimeout(sweep, 60e3).unref();
  io.on('connection', (socket) => {
    const on = (ev, fn) => socket.on(ev, (data, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      const me = socket.user && socket.user.id;
      if (!me) return reply({ error: 'sin sesion' });
      try { reply(fn(me, data || {}, socket) || { ok: true }); } catch (err) { warn('pool:', err.message); reply({ error: 'Algo salió mal.' }); }
    });
    on('pool:inicio', (me) => lobby(me));
    on('pool:crear', create);
    on('pool:unirse', join);
    on('pool:cancelar', cancel);
    on('pool:ver', (me, d, socket) => {
      const g = games.get(String(d.id));
      if (!g) return { error: 'Esa partida ya no está.' };
      if (!canSee(g, me)) return { error: 'Esa partida es privada.' };
      // el que mira (no juega) recibe las jugadas mientras tenga la mesa abierta
      socket.jgMirando = g.jugadores.includes(me) ? null : 'pool:' + g.id;
      return { partida: view(g, me) };
    });
    on('pool:accion', act);
  });
  log(`pool: listo (${games.size} partidas en curso)`);
}

// ── Partidas ──
const nameOf = (id) => {
  if (id === BOT) return { id: BOT, nombre: BOT_NAME, avatar: null, compu: true };
  const u = db.prepare('SELECT id, COALESCE(display_name, username) nombre, avatar FROM users WHERE id = ?').get(id);
  return u ? { id: u.id, nombre: u.nombre, avatar: u.avatar || null } : { id, nombre: 'Alguien', avatar: null };
};
// (las publicas que ya empezaron se pueden mirar)
const canSee = (g, me) => g.jugadores.includes(me) || (g.estado === 'esperando' && (g.publica || g.invitado === me)) || (g.estado !== 'esperando' && g.publica);
const seat = (g, me) => g.jugadores.indexOf(me);

function save(g) {
  try { db.prepare('INSERT OR REPLACE INTO puente_pool_mesas (id, estado, actualizado) VALUES (?, ?, ?)').run(g.id, JSON.stringify(g), Date.now()); } catch (err) { warn('pool: guardar:', err.message); }
}
function drop(g) { games.delete(g.id); clearTimeout(timers.get(g.id)); timers.delete(g.id); apuntado.delete(g.id); try { db.prepare('DELETE FROM puente_pool_mesas WHERE id = ?').run(g.id); } catch { /* ya no estaba */ } }
function sweep() {
  const now = Date.now();
  for (const g of [...games.values()]) {
    if (g.estado === 'terminada' && now - (g.fin || 0) > 3600e3) drop(g);
    else if (g.estado === 'esperando' && now - g.creado > 24 * 3600e3) { drop(g); changed(); }
    // la mesa de alguien que ya no esta (un invitado que se fue): se cierra, no se puede jugar (juegos-aviso.js)
    else if (g.estado === 'esperando' && require('./juegos-aviso.js').seFue(db, g.jugadores, BOT)) { drop(g); changed(); }
    else if (g.estado === 'jugando') {
      // Con alguien que ya no esta (juegos-aviso.js)
      const sf = require('./juegos-aviso.js').seFue(db, g.jugadores, BOT);
      if (sf && sf.borrar) { drop(g); changed(); }
      else if (sf) { note(g, 'Tu rival se fue del club.'); finish(g, sf.gana, 'abandono'); push(g, true); }
    }
  }
}

function create(me, d) {
  const modo = ['abierta', 'compu', 'desafio'].includes(d.modo) ? d.modo : 'abierta';
  const mine = [...games.values()].filter(g => g.estado !== 'terminada' && g.jugadores.includes(me));
  if (mine.length >= 10) return { error: 'Tenés muchas partidas abiertas. Terminá o cancelá alguna.' };
  let rival = null;
  if (modo === 'desafio') {
    rival = Number(d.rival);
    if (!(rival > 0) || rival === me || !db.prepare('SELECT 1 FROM users WHERE id = ?').get(rival)) return { error: 'Elegí a quién desafiar.' };
  }
  const g = {
    id: crypto.randomBytes(5).toString('hex'), creado: Date.now(), publica: modo === 'abierta', invitado: rival,
    compu: modo === 'compu', amistosa: modo !== 'compu' && d.amistosa === true, nivel: Math.max(1, Math.min(3, Number(d.nivel) || 2)),
    jugadores: [me], estado: 'esperando', log: [], revancha: [false, false], tiros: 0,
  };
  games.set(g.id, g);
  if (modo === 'compu') { g.jugadores.push(BOT); start(g); }
  else { save(g); changed(); }
  // La mesa abierta, en #que-paso (juegos-aviso.js)
  if (g.publica) require('./juegos-aviso.js').anunciar(db, io, warn, { juego: 'pool', quien: me, enlace: `/app?pool=${g.id}`,
    texto: `armó una partida${g.amistosa ? ' amistosa' : ''} de **Pool** (8 bolas) y busca rival` });
  log(`pool:${nameOf(me).nombre} creó una partida (${modo}${g.amistosa ? ', amistosa' : ''})`);
  return { ok: true, id: g.id };
}

function join(me, d) {
  const g = games.get(String(d.id));
  if (!g) return { error: 'Esa partida ya no está.' };
  if (g.jugadores.includes(me)) return { ok: true, id: g.id };
  if (g.estado !== 'esperando') return { error: 'Esa partida ya empezó.' };
  if (!g.publica && g.invitado !== me) return { error: 'Esa partida es privada.' };
  g.jugadores.push(me);
  start(g);
  changed();
  return { ok: true, id: g.id };
}

function cancel(me, d) {
  const g = games.get(String(d.id));
  if (!g || g.jugadores[0] !== me || g.estado !== 'esperando') return { error: 'No se puede cancelar.' };
  drop(g); changed();
  return { ok: true };
}

// Quien rompe, con una moneda
function start(g, rompe) {
  g.estado = 'jugando';
  g.inicio = Date.now();
  g.S = M.nueva(rompe === undefined ? rng(2) : rompe);
  g.ultima = null;
  note(g, `Rompe ${nameOf(g.jugadores[g.S.turno]).nombre}.`);
  tick(g);
}

function note(g, text) { g.log.push({ t: Date.now(), text }); if (g.log.length > 30) g.log.shift(); }

function finish(g, winnerSeat, motivo) {
  if (g.estado === 'terminada') return;
  g.estado = 'terminada'; g.ganador = winnerSeat; g.motivo = motivo; g.fin = Date.now();
  clearTimeout(timers.get(g.id)); timers.delete(g.id);
  note(g, `🏆 Ganó ${nameOf(g.jugadores[winnerSeat]).nombre}.`);
  // (las de los invitados quedan como amistosas: juegos-aviso.js)
  const amistosa = g.amistosa || require('./juegos-aviso.js').conInvitado(db, g.jugadores);
  if (amistosa && !g.compu) note(g, g.amistosa ? 'Partida amistosa: no suma al ranking.' : 'Jugó un invitado: queda como amistosa, no suma al ranking.');
  try {
    db.prepare('INSERT OR REPLACE INTO puente_pool_partidas (id, j1, j2, ganador, motivo, tiros, inicio, fin, compu, amistosa) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(g.id, g.jugadores[0], g.jugadores[1], g.jugadores[winnerSeat], motivo, g.tiros, g.inicio || null, g.fin, g.compu ? 1 : 0, amistosa ? 1 : 0);
  } catch (err) { warn('pool: guardar resultado:', err.message); }
  changed();
}

// Un tiro: lo simula el motor, se fija si termino y pasa el turno (o sigue el mismo)
function shot(g, i, t) {
  const r = M.tirar(g.S, t);
  if (r.error) return r;
  g.tiros++;
  g.ultima = { n: g.tiros, quien: i, ...r.recorrido };
  const nom = nameOf(g.jugadores[i]).nombre;
  if (r.res.falta) note(g, `Falta de ${nom}: ${r.res.razon}.`);
  else if (r.res.rearma) note(g, g.S.texto);
  if (g.S.ganador !== null) {
    note(g, `${nom}: ${g.S.texto}`);
    finish(g, g.S.ganador, g.S.motivo);
    push(g, true);
    return { ok: true };
  }
  tick(g);
  return { ok: true };
}

function act(me, d, socket) {
  const g = games.get(String(d.id));
  if (!g) return { error: 'Esa partida ya no está.' };
  const i = seat(g, me);
  if (i < 0) return { error: 'No estás en esta partida.' };
  if (d.tipo === 'chat') {
    if (g.compu) return { error: 'Contra la compu no hay chat.' };
    const err = CP.chatear(g, i, d.texto);
    if (err) return { error: err };
    push(g, false);
    return { ok: true };
  }
  if (d.tipo === 'revancha') {
    if (g.estado !== 'terminada') return { error: 'La partida no terminó.' };
    if (g.siguiente) return { ok: true, id: g.siguiente };
    g.revancha[i] = true;
    if (g.compu || g.revancha.every(Boolean)) return rematch(g);
    push(g, false);
    return { ok: true };
  }
  if (g.estado !== 'jugando') return { error: 'La partida no está en juego.' };
  if (d.tipo === 'zumbido') {
    if (g.compu) return { error: 'Contra la compu no hay zumbidos.' };
    const r = CP.zumbar({ g, juego: 'pool', titulo: 'Pool', url: `/app?pool=${g.id}`, yo: me, de: nameOf(me).nombre, quien: i, para: g.jugadores[g.S.turno], jugada: g.tiros, io, db, webpush });
    if (r.ok) push(g, false);
    return r;
  }
  if (d.tipo === 'abandonar') {
    note(g, `${nameOf(me).nombre} abandonó.`);
    finish(g, 1 - i, 'abandono'); push(g, true);
    return { ok: true };
  }
  if (g.S.turno !== i) return { error: 'No es tu turno.' };
  if (d.tipo === 'apunta') {
    // la mira del que tira, para que el otro la vea moverse (sin guardar, como mucho 12 por segundo)
    const now = Date.now();
    if (now - (apuntado.get(g.id) || 0) < 80) return { ok: true };
    apuntado.set(g.id, now);
    const n = (v, a, b) => { v = Number(v); return Number.isFinite(v) ? Math.max(a, Math.min(b, v)) : null; };
    // (tambien la barra de fuerza y el efecto que eligio, para que el que mira vea el panel como lo tiene el que tira)
    const m = { id: g.id, ang: n(d.ang, -10, 10), fuerza: n(d.fuerza, 0, 1), x: n(d.x, 0, M.W), y: n(d.y, 0, M.H), barra: n(d.barra, 0, 1), ex: n(d.ex, -1, 1), ey: n(d.ey, -1, 1) };
    if (m.ang === null) return { ok: true };
    const otro = g.jugadores[1 - i], mira = 'pool:' + g.id;
    for (const [, s] of io.sockets.sockets) if (s !== socket && s.user && (s.user.id === otro || s.jgMirando === mira)) { try { s.emit('pool:apunta', m); } catch { /* sesion cerrada */ } }
    return { ok: true };
  }
  if (d.tipo !== 'tirar') return { error: 'No entendí.' };
  return shot(g, i, d);
}

function rematch(g) {
  const n = {
    id: crypto.randomBytes(5).toString('hex'), creado: Date.now(), publica: false, invitado: null,
    compu: g.compu, amistosa: !!g.amistosa, nivel: g.nivel, jugadores: g.jugadores.slice(), estado: 'esperando', log: [], revancha: [false, false], tiros: 0,
  };
  // La charla sigue en la revancha (los mismos jugadores, en los mismos lugares)
  if (g.chat) n.chat = g.chat.slice();
  games.set(n.id, n);
  // en la revancha rompe el que perdio
  start(n, 1 - g.ganador);
  g.siguiente = n.id; push(g, true);
  changed();
  return { ok: true, id: n.id };
}

// ── Despues de cada cambio: guardar, avisar y la compu (sin limite de tiempo por turno) ──
function tick(g) { arm(g); push(g, false); }

function arm(g) {
  clearTimeout(timers.get(g.id));
  if (g.estado !== 'jugando') return;
  if (g.jugadores[g.S.turno] !== BOT) return;
  // la compu espera a que termine de verse el tiro anterior, y piensa un poco
  // (si el tiro fue de la compu, la persona lo ve mas despacio: a 0.6, como VEL_RIVAL en web/pool/juego.js)
  const vel = g.ultima && g.jugadores[g.ultima.quien] === BOT ? 0.6 : 1;
  const espera = (g.ultima ? (g.ultima.frames.length / 30) * 1000 / vel + 500 / vel - 500 : 0) + 1500 + rng(1200);
  timers.set(g.id, setTimeout(() => botMove(g), espera));
}

function botMove(g) {
  if (g.estado !== 'jugando' || g.jugadores[g.S.turno] !== BOT) return;
  let t = null;
  try { t = M.compu(g.S, g.nivel, rnd); } catch (err) { warn('pool: compu:', err.message); }
  if (!t) return;
  const r = shot(g, g.S.turno, t);
  if (r && r.error) { warn('pool: compu tiró mal:', r.error); shot(g, g.S.turno, { ...t, blanca: null }); }
}

// La partida como la ve cada uno
function view(g, me) {
  const i = seat(g, me);
  const pov = i >= 0 ? i : 0;
  const o = 1 - pov;
  const P = g.jugadores.map(nameOf);
  const S = g.S;
  const out = {
    id: g.id, estado: g.estado, compu: g.compu, nivel: NIVELES[g.nivel - 1], publica: g.publica, amistosa: !!g.amistosa,
    yo: P[pov] ? { ...P[pov], grupo: S ? S.grupos[pov] : null } : null,
    rival: P[o] ? { ...P[o], grupo: S ? S.grupos[o] : null } : null,
    invitado: g.invitado ? nameOf(g.invitado) : null, soyJugador: i >= 0, soyCreador: g.jugadores[0] === me,
    chat: i >= 0 && !g.compu ? CP.mensajes(g, i, (k) => ({ quien: k === i ? 'Vos' : (P[k] ? P[k].nombre : 'Rival') })) : null,
    log: g.log.slice(-6).map(x => x.text),
    ganador: g.estado === 'terminada' ? (g.ganador === pov ? 'yo' : 'rival') : null, motivo: g.motivo || null,
    revancha: g.estado === 'terminada' ? { yo: !!g.revancha[pov], rival: !!g.revancha[o] } : null, siguiente: g.siguiente || null,
    inicio: g.inicio || null, tiros: g.tiros,
  };
  if (S) {
    out.bolas = S.bolas.map(b => [b.n, Math.round(b.x * 10) / 10, Math.round(b.y * 10) / 10, b.on ? 1 : 0]);
    out.bandeja = S.bandeja;
    out.texto = S.texto;
    out.enMano = S.enMano; out.cabecera = S.cabecera; out.salida = S.salida;
    // la tronera de la 8 de cada uno (cuando ya metio todas las suyas; null: todavia no, o en cualquiera)
    const la8 = (k) => (S.grupos[k] && M.limpio(S, S.grupos[k]) ? M.troneraLa8(S, S.grupos[k]) : null);
    out.la8 = { yo: la8(pov), rival: la8(o) };
    out.ultima = g.ultima ? { ...g.ultima, mio: g.ultima.quien === pov } : null;
    if (g.estado === 'jugando') { out.teToca = i >= 0 && S.turno === i; out.turno = S.turno === pov ? 'yo' : 'rival'; }
  }
  return out;
}

function push(g, big) {
  if (g.estado === 'jugando') CP.turno(g, g.jugadores[g.S.turno], g.tiros); // (para el zumbido)
  save(g);

  const ids = g.jugadores.filter(x => x !== BOT);
  for (const [, s] of io.sockets.sockets) {
    if (s.user && (ids.includes(s.user.id) || s.jgMirando === 'pool:' + g.id)) { try { s.emit('pool:estado', view(g, s.user.id)); } catch { /* sesion cerrada */ } }
  }
  if (g.estado === 'jugando') notifyTurn(g);
  if (big) changed();
}

// "Te toca", al celular: 30 segundos despues, si todavia no tiro y no tiene la app delante (asi no llega
// mientras juega en la PC y mira otra ventana un momento). Prioridad alta, para que Android no lo demore,
// y si no llega en 2 minutos ya no sirve
const esperando = new Map(); // "id:user" -> el aviso que espera
function notifyTurn(g) {
  if (!webpush) return;
  const uid = g.jugadores[g.S.turno];
  if (uid === BOT) return;
  const key = g.id + ':' + uid, tiro = g.tiros;
  if (esperando.has(key)) return;
  esperando.set(key, setTimeout(() => {
    esperando.delete(key);
    if (games.get(g.id) !== g || g.estado !== 'jugando' || g.tiros !== tiro || g.jugadores[g.S.turno] !== uid) return;
    for (const [, s] of io.sockets.sockets) if (s.user && s.user.id === uid && s.hasFocus !== false) return;
    if (Date.now() - (pushed.get(key) || 0) < 3 * 60e3) return;
    pushed.set(key, Date.now());
    const rival = nameOf(g.jugadores[1 - g.S.turno]).nombre;
    const payload = JSON.stringify({ title: 'Pool', body: `Te toca contra ${rival}`, url: `/app?pool=${g.id}`, tag: 'pool-' + g.id, __puente: 1 });
    for (const sub of db.prepare('SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?').all(uid)) {
      webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, { TTL: 120, urgency: 'high' }).catch(() => {});
    }
  }, 30e3));
}

let changeTimer = null;
function changed() {
  clearTimeout(changeTimer);
  changeTimer = setTimeout(() => { try { io.emit('pool:cambio', {}); } catch { /* sin conexiones */ } }, 300);
}

// ── Sala ──
function stats(userId) {
  const q = (where) => db.prepare(`SELECT SUM(CASE WHEN ganador = ? THEN 1 ELSE 0 END) g, COUNT(*) n FROM puente_pool_partidas WHERE ${where} AND (j1 = ? OR j2 = ?)`).get(userId, userId, userId);
  const r = q('compu = 0 AND amistosa = 0'), a = q('compu = 0 AND amistosa = 1'), c = q('compu = 1');
  return { ganadas: r.g || 0, perdidas: (r.n || 0) - (r.g || 0), compuGanadas: c.g || 0, compuPerdidas: (c.n || 0) - (c.g || 0),
    amistosasGanadas: a.g || 0, amistosasPerdidas: (a.n || 0) - (a.g || 0) };
}
function ranking(since) {
  return db.prepare(`SELECT ganador id, COUNT(*) n FROM puente_pool_partidas WHERE compu = 0 AND amistosa = 0 AND ganador IS NOT NULL AND fin >= ?
    GROUP BY ganador ORDER BY n DESC LIMIT 10`).all(since).map(r => ({ ...nameOf(r.id), ganadas: r.n }));
}
// Las partidas publicas que se estan jugando entre dos personas, para mirarlas desde la sala
function mirables(me) {
  return [...games.values()]
    .filter(g => g.estado === 'jugando' && g.publica && !g.compu && !g.jugadores.includes(me) && g.jugadores.length === 2 && g.jugadores.every(x => x > 0))
    .sort((a, b) => (b.inicio || b.creado || 0) - (a.inicio || a.creado || 0)).slice(0, 10)
    .map(g => ({ id: g.id, jugadores: g.jugadores.map(nameOf) }));
}

function lobby(me) {
  const all = [...games.values()];
  const abiertas = all.filter(g => g.estado === 'esperando' && (g.publica || g.invitado === me) && !g.jugadores.includes(me))
    .sort((a, b) => b.creado - a.creado).slice(0, 30)
    .map(g => ({ id: g.id, amistosa: !!g.amistosa, creador: nameOf(g.jugadores[0]), paraVos: g.invitado === me }));
  const mias = all.filter(g => g.jugadores.includes(me) && (g.estado !== 'terminada' || Date.now() - g.fin < 10 * 60e3))
    .sort((a, b) => b.creado - a.creado)
    .map(g => {
      const i = seat(g, me), o = 1 - i;
      return {
        id: g.id, estado: g.estado, compu: g.compu, amistosa: !!g.amistosa, grupo: g.S ? g.S.grupos[i] : null,
        rival: g.jugadores[o] !== undefined ? nameOf(g.jugadores[o]) : null, invitado: g.invitado ? nameOf(g.invitado) : null,
        teToca: g.estado === 'jugando' && g.S.turno === i, ganaste: g.estado === 'terminada' ? g.ganador === i : null,
      };
    });
  const d = new Date();
  const mes = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) + 3 * 3600e3;
  return { enJuego: mirables(me), niveles: NIVELES, abiertas, mias, stats: stats(me), ranking: { mes: ranking(mes), total: ranking(0) } };
}

module.exports = { setup, stats, _test: { games, create, join, act, view, botMove, BOT } };
