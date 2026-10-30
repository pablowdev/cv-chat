// Ajedrez (parte del puente), para la seccion Juegos de la app: 1 contra 1, contra otra persona
// o contra la compu (4 niveles), con las reglas completas de ajedrez-motor.js.
// Sin reloj (por turnos: se juega de a ratos y avisa cuando te toca) o con reloj (3+2, 5+0, 10+5,
// 15+10: minutos por jugador + segundos que se suman por jugada). Con reloj, cada uno tiene un
// minuto para su primera jugada; si no la hace, la partida se anula (no cuenta).
//
// Por el socket de Haven (con respuesta):
//   ajedrez:inicio                      -> { ritmos, niveles, abiertas, mias, ranking, stats }
//   ajedrez:crear  { modo: 'abierta'|'compu'|'desafio', ritmo, color: 'w'|'b'|null, rival, nivel }
//   ajedrez:unirse { id }   ajedrez:cancelar { id }   ajedrez:ver { id }
//   ajedrez:accion { id, tipo: 'mover'|'abandonar'|'tablas'|'aceptar'|'rechazar'|'revancha', de, a, cor }
// Y el servidor avisa:
//   ajedrez:estado (la partida)   ajedrez:cambio (algo cambio en la sala)

const crypto = require('crypto');
const M = require('./ajedrez-motor.js');

const BOT = -1;
const BOT_NAME = 'La Compu';
const RITMOS = { libre: null, '3+2': [3, 2], '5+0': [5, 0], '10+5': [10, 5], '15+10': [15, 10] };
const PRIMERA_MS = 60e3;

let db, io, log, warn, webpush = null;
const games = new Map(); // id -> partida
const relojes = new Map(); // id -> timeout del reloj (o de la primera jugada)
const pensando = new Map(); // id -> timeout de la compu
const pushed = new Map(); // "id:user" -> ultimo aviso
const rng = (n) => crypto.randomInt(n);

function setup(ctx) {
  ({ db, io, log, warn } = ctx);
  db.exec(`
    CREATE TABLE IF NOT EXISTS puente_ajedrez_mesas (id TEXT PRIMARY KEY, estado TEXT NOT NULL, actualizado INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS puente_ajedrez_partidas (
      id TEXT PRIMARY KEY, blancas INTEGER NOT NULL, negras INTEGER NOT NULL, ganador INTEGER, resultado TEXT, motivo TEXT,
      jugadas INTEGER, ritmo TEXT, inicio INTEGER, fin INTEGER NOT NULL, compu INTEGER NOT NULL DEFAULT 0, movidas TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_puente_ajedrez_fin ON puente_ajedrez_partidas(fin);
  `);
  try { webpush = require('/app/node_modules/web-push'); } catch { /* sin avisos al celular */ }
  for (const r of db.prepare('SELECT id, estado FROM puente_ajedrez_mesas').all()) {
    try {
      const g = JSON.parse(r.estado);
      if (g.estado === 'terminada' && Date.now() - (g.fin || 0) > 3600e3) { db.prepare('DELETE FROM puente_ajedrez_mesas WHERE id = ?').run(r.id); continue; }
      if (g.estado === 'esperando' && Date.now() - g.creado > 24 * 3600e3) { db.prepare('DELETE FROM puente_ajedrez_mesas WHERE id = ?').run(r.id); continue; }
      games.set(g.id, g);
      // el reloj no corre mientras el servidor se reinicia
      if (g.estado === 'jugando') { if (g.desde) g.desde = Date.now(); if (g.primera) g.primera = Date.now() + PRIMERA_MS; arm(g); }
    } catch { /* fila rota */ }
  }
  setInterval(sweep, 10 * 60 * 1000).unref();
  io.on('connection', (socket) => {
    const on = (ev, fn) => socket.on(ev, (data, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      const me = socket.user && socket.user.id;
      if (!me) return reply({ error: 'sin sesion' });
      try { reply(fn(me, data || {}, socket) || { ok: true }); } catch (err) { warn('ajedrez:', err.message); reply({ error: 'Algo salió mal.' }); }
    });
    on('ajedrez:inicio', (me) => lobby(me));
    on('ajedrez:crear', create);
    on('ajedrez:unirse', join);
    on('ajedrez:cancelar', cancel);
    on('ajedrez:ver', (me, d) => { const g = games.get(String(d.id)); if (!g) return { error: 'Esa partida ya no está.' }; if (!canSee(g, me)) return { error: 'Esa partida es privada.' }; return { partida: view(g, me) }; });
    on('ajedrez:accion', act);
  });
  log(`ajedrez: listo (${games.size} partidas en curso)`);
}

// ── Partidas ──
const nameOf = (id) => {
  if (id === BOT) return { id: BOT, nombre: BOT_NAME, avatar: null, compu: true };
  const u = db.prepare('SELECT id, COALESCE(display_name, username) nombre, avatar FROM users WHERE id = ?').get(id);
  return u ? { id: u.id, nombre: u.nombre, avatar: u.avatar || null } : { id, nombre: 'Alguien', avatar: null };
};
const canSee = (g, me) => g.jugadores.includes(me) || (g.estado === 'esperando' && (g.publica || g.invitado === me));
const seat = (g, me) => g.jugadores.indexOf(me);
const colorOf = (g, i) => (i === g.blancas ? 'w' : 'b');
const seatOfColor = (g, k) => (k === 'w' ? g.blancas : 1 - g.blancas);
const turno = (g) => g.fen.split(' ')[1];
const ritmoNombre = (r) => (RITMOS[r] ? r : 'Sin reloj');

function save(g) {
  try { db.prepare('INSERT OR REPLACE INTO puente_ajedrez_mesas (id, estado, actualizado) VALUES (?, ?, ?)').run(g.id, JSON.stringify(g), Date.now()); } catch (err) { warn('ajedrez: guardar:', err.message); }
}
function parar(g) { clearTimeout(relojes.get(g.id)); relojes.delete(g.id); clearTimeout(pensando.get(g.id)); pensando.delete(g.id); }
function drop(g) { games.delete(g.id); parar(g); try { db.prepare('DELETE FROM puente_ajedrez_mesas WHERE id = ?').run(g.id); } catch { /* ya no estaba */ } }
function sweep() {
  const now = Date.now();
  for (const g of [...games.values()]) {
    if (g.estado === 'terminada' && now - (g.fin || 0) > 3600e3) drop(g);
    else if (g.estado === 'esperando' && now - g.creado > 24 * 3600e3) { drop(g); changed(); }
  }
}

function nueva(me, extra) {
  return {
    id: crypto.randomBytes(5).toString('hex'), creado: Date.now(), ritmo: 'libre', publica: false, invitado: null, compu: false, nivel: 2,
    jugadores: [me], color: null, blancas: 0, estado: 'esperando', log: [], revancha: [false, false], ...extra,
  };
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
  const g = nueva(me, {
    ritmo: Object.prototype.hasOwnProperty.call(RITMOS, d.ritmo) ? d.ritmo : 'libre',
    publica: modo === 'abierta', invitado: rival, compu: modo === 'compu',
    nivel: Math.max(1, Math.min(4, Number(d.nivel) || 2)), color: d.color === 'w' || d.color === 'b' ? d.color : null,
  });
  games.set(g.id, g);
  if (modo === 'compu') { g.jugadores.push(BOT); start(g); }
  else { save(g); changed(); }
  log(`ajedrez: ${nameOf(me).nombre} creó una partida (${modo}, ${ritmoNombre(g.ritmo)})`);
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

// El que creo la mesa elige color (o al azar); en la revancha se dan vuelta
function start(g, blancas) {
  g.estado = 'jugando';
  g.inicio = Date.now();
  g.blancas = blancas != null ? blancas : g.color === 'w' ? 0 : g.color === 'b' ? 1 : rng(2);
  g.fen = M.INICIAL;
  g.claves = [M.clave(M.desdeFen(g.fen))];
  g.san = []; g.uci = []; g.ultima = null; g.tablas = null;
  const R = RITMOS[g.ritmo];
  g.reloj = R ? { w: R[0] * 60e3, b: R[0] * 60e3 } : null;
  g.desde = null;
  g.primera = R ? Date.now() + PRIMERA_MS : null;
  note(g, `${nameOf(g.jugadores[g.blancas]).nombre} juega con blancas.`);
  tick(g);
}

function note(g, text) { g.log.push({ t: Date.now(), text }); if (g.log.length > 30) g.log.shift(); }

const RESULTADO = { mate: 'jaque mate', abandono: 'por abandono', tiempo: 'por tiempo', ahogado: 'ahogado', material: 'material insuficiente', '50': '50 jugadas sin capturas ni peones', repeticion: 'triple repetición', acuerdo: 'de común acuerdo', 'tiempo-tablas': 'se acabó el tiempo, pero no había material para ganar', anulada: 'no se hizo la primera jugada' };
function finish(g, winnerSeat, motivo) {
  if (g.estado === 'terminada') return;
  if (g.reloj && g.desde) { const k = turno(g); g.reloj[k] = Math.max(0, g.reloj[k] - (Date.now() - g.desde)); }
  g.estado = 'terminada'; g.ganador = winnerSeat; g.motivo = motivo; g.fin = Date.now(); g.desde = null; g.primera = null; g.tablas = null;
  parar(g);
  if (motivo === 'anulada') note(g, 'Partida anulada: no cuenta.');
  else if (winnerSeat === null) note(g, `🤝 Tablas (${RESULTADO[motivo] || motivo}).`);
  else note(g, `🏆 Ganó ${nameOf(g.jugadores[winnerSeat]).nombre} (${RESULTADO[motivo] || motivo}).`);
  if (motivo !== 'anulada') {
    try {
      const w = g.jugadores[g.blancas], b = g.jugadores[1 - g.blancas];
      const res = winnerSeat === null ? '½-½' : winnerSeat === g.blancas ? '1-0' : '0-1';
      db.prepare('INSERT OR REPLACE INTO puente_ajedrez_partidas (id, blancas, negras, ganador, resultado, motivo, jugadas, ritmo, inicio, fin, compu, movidas) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(g.id, w, b, winnerSeat === null ? null : g.jugadores[winnerSeat], res, motivo, g.san.length, g.ritmo, g.inicio || null, g.fin, g.compu ? 1 : 0, g.uci.join(' '));
    } catch (err) { warn('ajedrez: guardar resultado:', err.message); }
  }
  changed();
}

// Una jugada: la valida el motor, descuenta el reloj, se fija si termino y pasa el turno
function play(g, i, de, a, cor) {
  const S = M.desdeFen(g.fen);
  const k = colorOf(g, i);
  if (S.t !== k) return { error: 'No es tu turno.' };
  const m = M.buscar(S, de, a, cor);
  if (!m) return { error: 'Esa jugada no vale.' };
  const now = Date.now();
  if (g.reloj && g.desde) {
    g.reloj[k] -= now - g.desde;
    if (g.reloj[k] <= 0) { g.reloj[k] = 0; flag(g, k); return { error: 'Se te acabó el tiempo.' }; }
    g.reloj[k] += RITMOS[g.ritmo][1] * 1000;
  }
  const san = M.notacion(S, m);
  M.hacer(S, m);
  g.fen = M.aFen(S);
  g.claves.push(M.clave(S));
  g.san.push(san);
  g.uci.push(de + a + (m.cor || ''));
  g.ultima = { de: M.nombre(m.de), a: M.nombre(m.a) };
  g.tablas = null;
  const fin = M.estado(S, g.claves);
  if (fin) {
    finish(g, fin.ganador ? seatOfColor(g, fin.ganador) : null, fin.fin);
    push(g, true);
    return { ok: true };
  }
  if (g.reloj) {
    // el reloj arranca cuando los dos hicieron su primera jugada
    if (g.san.length === 1) { g.primera = now + PRIMERA_MS; g.desde = null; } else { g.primera = null; g.desde = now; }
  }
  tick(g);
  return { ok: true };
}

function flag(g, k) {
  if (g.estado !== 'jugando') return;
  const o = M.otro(k);
  note(g, `A ${nameOf(g.jugadores[seatOfColor(g, k)]).nombre} se le acabó el tiempo.`);
  if (!M.puedeDarMate(M.desdeFen(g.fen), o)) finish(g, null, 'tiempo-tablas');
  else finish(g, seatOfColor(g, o), 'tiempo');
  push(g, true);
}

function act(me, d) {
  const g = games.get(String(d.id));
  if (!g) return { error: 'Esa partida ya no está.' };
  const i = seat(g, me);
  if (i < 0) return { error: 'No estás en esta partida.' };
  if (d.tipo === 'revancha') {
    if (g.estado !== 'terminada') return { error: 'La partida no terminó.' };
    if (g.siguiente) return { ok: true, id: g.siguiente };
    g.revancha[i] = true;
    if (g.compu || g.revancha.every(Boolean)) return rematch(g);
    push(g, false);
    return { ok: true };
  }
  if (g.estado !== 'jugando') return { error: 'La partida no está en juego.' };
  const k = colorOf(g, i);
  if (d.tipo === 'abandonar') {
    // antes de que cada uno haga su primera jugada, se anula en vez de perderse
    if (g.san.length < 2) { note(g, `${nameOf(me).nombre} se fue antes de empezar.`); finish(g, null, 'anulada'); }
    else { note(g, `${nameOf(me).nombre} abandonó.`); finish(g, 1 - i, 'abandono'); }
    push(g, true);
    return { ok: true };
  }
  if (d.tipo === 'tablas') {
    if (g.tablas === k) return { ok: true };
    if (g.tablas) return drawAccepted(g);
    g.tablas = k;
    note(g, `${nameOf(me).nombre} ofrece tablas.`);
    if (g.compu) setTimeout(() => botDraw(g, k), 900);
    push(g, false);
    return { ok: true };
  }
  if (d.tipo === 'aceptar') {
    if (!g.tablas || g.tablas === k) return { error: 'No hay tablas para aceptar.' };
    return drawAccepted(g);
  }
  if (d.tipo === 'rechazar') {
    if (!g.tablas || g.tablas === k) return { ok: true };
    g.tablas = null; note(g, `${nameOf(me).nombre} no acepta tablas.`);
    push(g, false);
    return { ok: true };
  }
  if (d.tipo !== 'mover') return { error: 'No entendí.' };
  if (turno(g) !== k) return { error: 'No es tu turno.' };
  const de = String(d.de || ''), a = String(d.a || ''), cor = d.cor ? String(d.cor) : null;
  if (M.casilla(de) < 0 || M.casilla(a) < 0) return { error: 'Jugada inválida.' };
  return play(g, i, de, a, cor);
}
function drawAccepted(g) { finish(g, null, 'acuerdo'); push(g, true); return { ok: true }; }

// La compu acepta tablas si va perdiendo, o si la partida esta pareja y ya es larga
function botDraw(g, k) {
  if (g.estado !== 'jugando' || g.tablas !== k) return;
  let v = 0;
  try { const S = M.desdeFen(g.fen); v = M.valoracion(g.fen); if (S.t === k) v = -v; } catch { v = 0; }
  if (v < -150 || (Math.abs(v) < 40 && g.san.length >= 60)) { note(g, `${BOT_NAME} acepta tablas.`); finish(g, null, 'acuerdo'); push(g, true); return; }
  g.tablas = null; note(g, `${BOT_NAME} no acepta tablas.`);
  push(g, false);
}

function rematch(g) {
  const n = nueva(g.jugadores[0], { ritmo: g.ritmo, compu: g.compu, nivel: g.nivel, jugadores: g.jugadores.slice() });
  games.set(n.id, n);
  start(n, 1 - g.blancas);
  g.siguiente = n.id; push(g, true);
  changed();
  return { ok: true, id: n.id };
}

// ── Despues de cada cambio: guardar, avisar, el reloj y la compu ──
function tick(g) { arm(g); push(g, false); }

function arm(g) {
  parar(g);
  if (g.estado !== 'jugando') return;
  const now = Date.now();
  if (g.primera) relojes.set(g.id, setTimeout(() => { if (g.estado === 'jugando' && g.primera && Date.now() >= g.primera - 50) { note(g, 'Nadie hizo la primera jugada a tiempo.'); finish(g, null, 'anulada'); push(g, true); } }, Math.max(0, g.primera - now) + 100));
  else if (g.reloj && g.desde) {
    const k = turno(g);
    relojes.set(g.id, setTimeout(() => {
      if (g.estado !== 'jugando' || turno(g) !== k || !g.desde) return;
      if (g.reloj[k] - (Date.now() - g.desde) <= 0) { g.reloj[k] = 0; g.desde = Date.now(); flag(g, k); } else arm(g);
    }, Math.max(0, g.reloj[k] - (now - g.desde)) + 100));
  }
  if (g.jugadores[seatOfColor(g, turno(g))] === BOT) pensando.set(g.id, setTimeout(() => botMove(g), 500 + rng(700)));
}

// La compu piensa en otro hilo (ajedrez-motor.js); con poco tiempo en el reloj, piensa menos
async function botMove(g) {
  if (g.estado !== 'jugando') return;
  const k = turno(g), i = seatOfColor(g, k);
  if (g.jugadores[i] !== BOT) return;
  const fen = g.fen;
  let nivel = g.nivel;
  if (g.reloj) { const left = g.reloj[k] - (g.desde ? Date.now() - g.desde : 0); if (left < 20e3) nivel = Math.min(nivel, 2); if (left < 5e3) nivel = 1; }
  let mv = null;
  try { mv = await M.pensarEnHilo(fen, nivel); } catch (err) { warn('ajedrez: compu:', err.message); }
  if (g.estado !== 'jugando' || g.fen !== fen) return;
  if (!mv) { note(g, `${BOT_NAME} abandonó.`); finish(g, 1 - i, 'abandono'); push(g, true); return; }
  if (g.tablas && g.tablas !== k) { g.tablas = null; note(g, `${BOT_NAME} no acepta tablas.`); }
  const r = play(g, i, mv.de, mv.a, mv.cor);
  if (r && r.error && g.estado === 'jugando') warn('ajedrez: compu jugó mal:', r.error, fen, JSON.stringify(mv));
}

// La partida como la ve cada uno
function view(g, me) {
  const i = seat(g, me);
  const pov = i >= 0 ? i : 0;
  const o = 1 - pov;
  const P = g.jugadores.map(nameOf);
  const jugando = g.estado === 'jugando';
  const out = {
    id: g.id, estado: g.estado, compu: g.compu, nivel: M.NIVELES[g.nivel - 1], publica: g.publica, ritmo: ritmoNombre(g.ritmo), conReloj: !!RITMOS[g.ritmo],
    yo: P[pov] ? { ...P[pov], color: g.estado === 'esperando' ? g.color : colorOf(g, pov) } : null,
    rival: P[o] ? { ...P[o], color: g.estado === 'esperando' ? null : colorOf(g, o) } : null,
    invitado: g.invitado ? nameOf(g.invitado) : null, soyJugador: i >= 0, soyCreador: g.jugadores[0] === me,
    log: g.log.slice(-6).map(x => x.text),
    ganador: g.estado === 'terminada' ? (g.ganador === null || g.ganador === undefined ? 'empate' : g.ganador === pov ? 'yo' : 'rival') : null, motivo: g.motivo || null,
    motivoTexto: g.motivo ? RESULTADO[g.motivo] || '' : '',
    revancha: g.estado === 'terminada' ? { yo: !!g.revancha[pov], rival: !!g.revancha[o] } : null, siguiente: g.siguiente || null,
    ahora: Date.now(),
  };
  if (g.fen) {
    const S = M.desdeFen(g.fen);
    out.fen = g.fen;
    out.san = g.san;
    out.ultima = g.ultima;
    out.turno = S.t;
    out.jaque = M.enJaque(S) ? M.nombre(S.reyes[S.t]) : null;
    if (g.reloj) {
      const r = { ...g.reloj };
      if (g.desde && jugando) r[S.t] = Math.max(0, r[S.t] - (Date.now() - g.desde));
      out.reloj = { w: r.w, b: r.b, corre: jugando && g.desde ? S.t : null, primera: jugando && g.primera ? Math.max(0, g.primera - Date.now()) : null };
    }
    if (jugando) {
      out.teToca = i >= 0 && colorOf(g, i) === S.t;
      out.tablas = g.tablas ? (i >= 0 && g.tablas === colorOf(g, i) ? 'yo' : 'rival') : null;
      if (out.teToca) {
        const moves = {};
        for (const m of M.legales(S)) { const de = M.nombre(m.de), a = M.nombre(m.a); const l = (moves[de] = moves[de] || []); if (!l.includes(a)) l.push(a); }
        out.posibles = moves;
      }
    }
  }
  return out;
}

function push(g, big) {
  save(g);
  const ids = g.jugadores.filter(x => x !== BOT);
  for (const [, s] of io.sockets.sockets) {
    if (s.user && ids.includes(s.user.id)) { try { s.emit('ajedrez:estado', view(g, s.user.id)); } catch { /* sesion cerrada */ } }
  }
  if (g.estado === 'jugando') notifyTurn(g);
  if (big) changed();
}

function notifyTurn(g) {
  if (!webpush) return;
  const i = seatOfColor(g, turno(g));
  const uid = g.jugadores[i];
  if (uid === BOT) return;
  for (const [, s] of io.sockets.sockets) if (s.user && s.user.id === uid && s.hasFocus !== false) return;
  const key = g.id + ':' + uid;
  if (Date.now() - (pushed.get(key) || 0) < 3 * 60e3) return;
  pushed.set(key, Date.now());
  const rival = nameOf(g.jugadores[1 - i]).nombre;
  const payload = JSON.stringify({ title: 'Ajedrez', body: `Te toca contra ${rival}`, url: `/app?ajedrez=${g.id}`, tag: 'ajedrez-' + g.id, __puente: 1 });
  for (const sub of db.prepare('SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?').all(uid)) {
    webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, { TTL: 600 }).catch(() => {});
  }
}

let changeTimer = null;
function changed() {
  clearTimeout(changeTimer);
  changeTimer = setTimeout(() => { try { io.emit('ajedrez:cambio', {}); } catch { /* sin conexiones */ } }, 300);
}

// ── Sala ──
function stats(userId) {
  const q = (compu) => db.prepare(`SELECT SUM(CASE WHEN ganador = ? THEN 1 ELSE 0 END) g, SUM(CASE WHEN ganador IS NULL THEN 1 ELSE 0 END) t, COUNT(*) n
    FROM puente_ajedrez_partidas WHERE compu = ? AND (blancas = ? OR negras = ?)`).get(userId, compu, userId, userId);
  const r = q(0), c = q(1);
  return { ganadas: r.g || 0, tablas: r.t || 0, perdidas: (r.n || 0) - (r.g || 0) - (r.t || 0), compuGanadas: c.g || 0, compuPerdidas: (c.n || 0) - (c.g || 0) - (c.t || 0) };
}
function ranking(since) {
  return db.prepare(`SELECT ganador id, COUNT(*) n FROM puente_ajedrez_partidas WHERE compu = 0 AND ganador IS NOT NULL AND fin >= ?
    GROUP BY ganador ORDER BY n DESC LIMIT 10`).all(since).map(r => ({ ...nameOf(r.id), ganadas: r.n }));
}
function lobby(me) {
  const all = [...games.values()];
  const abiertas = all.filter(g => g.estado === 'esperando' && (g.publica || g.invitado === me) && !g.jugadores.includes(me))
    .sort((a, b) => b.creado - a.creado).slice(0, 30)
    .map(g => ({ id: g.id, ritmo: ritmoNombre(g.ritmo), color: g.color ? M.otro(g.color) : null, creador: nameOf(g.jugadores[0]), paraVos: g.invitado === me }));
  const mias = all.filter(g => g.jugadores.includes(me) && (g.estado !== 'terminada' || Date.now() - g.fin < 10 * 60e3))
    .sort((a, b) => b.creado - a.creado)
    .map(g => {
      const i = seat(g, me), o = 1 - i;
      return {
        id: g.id, estado: g.estado, ritmo: ritmoNombre(g.ritmo), compu: g.compu, color: g.estado === 'esperando' ? g.color : colorOf(g, i), jugadas: g.san ? g.san.length : 0,
        rival: g.jugadores[o] !== undefined ? nameOf(g.jugadores[o]) : null, invitado: g.invitado ? nameOf(g.invitado) : null,
        teToca: g.estado === 'jugando' && colorOf(g, i) === turno(g),
        ganaste: g.estado === 'terminada' ? (g.ganador === null || g.ganador === undefined ? null : g.ganador === i) : null, motivo: g.motivo || null,
      };
    });
  const d = new Date();
  const mes = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) + 3 * 3600e3;
  return { ritmos: Object.keys(RITMOS).map(r => [r, ritmoNombre(r)]), niveles: M.NIVELES, abiertas, mias, stats: stats(me), ranking: { mes: ranking(mes), total: ranking(0) } };
}

module.exports = { setup, stats, _test: { games, create, join, act, view, botMove, arm, BOT } };
