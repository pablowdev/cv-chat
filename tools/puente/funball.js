// Funball (parte del puente), para la seccion Juegos de la app: el juego de DOS de 1995
// con sus reglas de siempre (funball-motor.js), ahora para jugar online 1 contra 1, contra
// otra persona o contra la compu (4 niveles, la misma que tenia el original).
// Los tableros son los del juego original y van en funball-tableros.json, propio de cada
// servidor (no va al repositorio); sin ese archivo, el juego no aparece.
//
// Por el socket de Haven (con respuesta):
//   funball:inicio                      -> { tableros, abiertas, mias, ranking, stats }
//   funball:crear  { tablero, arania, modo: 'abierta'|'compu'|'desafio', rival, nivel }
//   funball:unirse { id }   funball:cancelar { id }   funball:ver { id }
//   funball:accion { id, tipo: 'mover'|'abandonar'|'revancha', de: [c,r], a: [c,r] }
// Y el servidor avisa:
//   funball:estado (la partida)   funball:cambio (algo cambio en la sala)

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const M = require('./funball-motor.js');

const BOT = -1;
const BOT_NAME = 'La Compu';
const TURNO_MS = 60 * 1000;
const NIVELES = ['Fácil', 'Normal', 'Difícil', 'Imposible'];

let db, io, log, warn, webpush = null;
let boards = [];
const games = new Map(); // id -> partida
const timers = new Map(); // id -> reloj del turno
const pushed = new Map(); // "id:user" -> ultimo aviso
const rng = (n) => crypto.randomInt(n);

function titleCase(s) { return String(s).toLowerCase().replace(/(^|\s)(\S)/g, (m, a, b) => a + b.toUpperCase()); }

function setup(ctx) {
  ({ db, io, log, warn } = ctx);
  try {
    boards = JSON.parse(fs.readFileSync(path.join(__dirname, 'funball-tableros.json'), 'utf8'))
      .map(b => ({ nombre: titleCase(b.nombre), celdas: b.celdas }));
  } catch { boards = []; }
  db.exec(`
    CREATE TABLE IF NOT EXISTS puente_funball_mesas (id TEXT PRIMARY KEY, estado TEXT NOT NULL, actualizado INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS puente_funball_partidas (
      id TEXT PRIMARY KEY, j1 INTEGER NOT NULL, j2 INTEGER NOT NULL, tablero INTEGER NOT NULL,
      ganador INTEGER, motivo TEXT, jugadas INTEGER, inicio INTEGER, fin INTEGER NOT NULL, compu INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_puente_funball_fin ON puente_funball_partidas(fin);
  `);
  try { webpush = require('/app/node_modules/web-push'); } catch { /* sin avisos al celular */ }
  for (const r of db.prepare('SELECT id, estado FROM puente_funball_mesas').all()) {
    try {
      const g = JSON.parse(r.estado);
      if (g.estado === 'terminada' && Date.now() - (g.fin || 0) > 3600e3) { db.prepare('DELETE FROM puente_funball_mesas WHERE id = ?').run(r.id); continue; }
      if (g.estado === 'esperando' && Date.now() - g.creado > 24 * 3600e3) { db.prepare('DELETE FROM puente_funball_mesas WHERE id = ?').run(r.id); continue; }
      games.set(g.id, g);
      if (g.estado === 'jugando') { g.deadline = Date.now() + TURNO_MS; arm(g); }
    } catch { /* fila rota */ }
  }
  setInterval(sweep, 10 * 60 * 1000).unref();
  io.on('connection', (socket) => {
    const on = (ev, fn) => socket.on(ev, (data, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      const me = socket.user && socket.user.id;
      if (!me) return reply({ error: 'sin sesion' });
      try { reply(fn(me, data || {}, socket) || { ok: true }); } catch (err) { warn('funball:', err.message); reply({ error: 'Algo salió mal.' }); }
    });
    on('funball:inicio', (me) => lobby(me));
    on('funball:crear', create);
    on('funball:unirse', join);
    on('funball:cancelar', cancel);
    on('funball:ver', (me, d) => { const g = games.get(String(d.id)); if (!g) return { error: 'Esa partida ya no está.' }; if (!canSee(g, me)) return { error: 'Esa partida es privada.' }; return { partida: view(g, me) }; });
    on('funball:accion', act);
  });
  log(`funball: listo (${boards.length} tableros, ${games.size} partidas en curso)`);
}

// ── Partidas ──
const nameOf = (id) => {
  if (id === BOT) return { id: BOT, nombre: BOT_NAME, avatar: null, compu: true };
  const u = db.prepare('SELECT id, COALESCE(display_name, username) nombre, avatar FROM users WHERE id = ?').get(id);
  return u ? { id: u.id, nombre: u.nombre, avatar: u.avatar || null } : { id, nombre: 'Alguien', avatar: null };
};
const canSee = (g, me) => g.jugadores.includes(me) || (g.estado === 'esperando' && (g.publica || g.invitado === me));
const seat = (g, me) => g.jugadores.indexOf(me);
const colorOf = (g, i) => g.colores[i];
const seatOfColor = (g, k) => g.colores.indexOf(k);

function save(g) {
  try { db.prepare('INSERT OR REPLACE INTO puente_funball_mesas (id, estado, actualizado) VALUES (?, ?, ?)').run(g.id, JSON.stringify(g), Date.now()); } catch (err) { warn('funball: guardar:', err.message); }
}
function drop(g) { games.delete(g.id); clearTimeout(timers.get(g.id)); timers.delete(g.id); try { db.prepare('DELETE FROM puente_funball_mesas WHERE id = ?').run(g.id); } catch { /* ya no estaba */ } }
function sweep() {
  const now = Date.now();
  for (const g of [...games.values()]) {
    if (g.estado === 'terminada' && now - (g.fin || 0) > 3600e3) drop(g);
    else if (g.estado === 'esperando' && now - g.creado > 24 * 3600e3) { drop(g); changed(); }
  }
}

function create(me, d) {
  if (!boards.length) return { error: 'El Funball no está disponible en este servidor.' };
  const modo = ['abierta', 'compu', 'desafio'].includes(d.modo) ? d.modo : 'abierta';
  const mine = [...games.values()].filter(g => g.estado !== 'terminada' && g.jugadores.includes(me));
  if (mine.length >= 10) return { error: 'Tenés muchas partidas abiertas. Terminá o cancelá alguna.' };
  let tablero = Number(d.tablero);
  if (!(tablero >= 0 && tablero < boards.length)) tablero = rng(boards.length);
  let rival = null;
  if (modo === 'desafio') {
    rival = Number(d.rival);
    if (!(rival > 0) || rival === me || !db.prepare('SELECT 1 FROM users WHERE id = ?').get(rival)) return { error: 'Elegí a quién desafiar.' };
  }
  const nivel = Math.max(1, Math.min(4, Number(d.nivel) || 2));
  const g = {
    id: crypto.randomBytes(5).toString('hex'), creado: Date.now(), tablero, arania: d.arania !== false,
    publica: modo === 'abierta', invitado: rival, compu: modo === 'compu', nivel,
    jugadores: [me], colores: ['R', 'G'], estado: 'esperando', log: [], revancha: [false, false], timeouts: [0, 0], jugadas: 0,
  };
  games.set(g.id, g);
  if (modo === 'compu') { g.jugadores.push(BOT); start(g); }
  else { save(g); changed(); }
  log(`funball: ${nameOf(me).nombre} creó una partida (${modo}, ${boards[tablero].nombre})`);
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

// Colores al azar y quien empieza, con una moneda (como "let's flip a coin" del original)
function start(g) {
  g.estado = 'jugando';
  g.inicio = Date.now();
  g.colores = rng(2) ? ['R', 'G'] : ['G', 'R'];
  g.turno = rng(2) ? 'R' : 'G';
  g.tab = M.save(M.newGame(boards[g.tablero].celdas, { spider: g.arania }, rng));
  g.ultima = null;
  note(g, `Empieza ${nameOf(g.jugadores[seatOfColor(g, g.turno)]).nombre} (${g.turno === 'R' ? 'rojas' : 'verdes'}).`);
  tick(g);
}

function note(g, text) { g.log.push({ t: Date.now(), text }); if (g.log.length > 30) g.log.shift(); }

function finish(g, winnerSeat, motivo) {
  if (g.estado === 'terminada') return;
  g.estado = 'terminada'; g.ganador = winnerSeat; g.motivo = motivo; g.fin = Date.now(); g.deadline = null;
  clearTimeout(timers.get(g.id)); timers.delete(g.id);
  if (winnerSeat === null) note(g, '🤝 Empate: no quedó ninguna bola.');
  else note(g, `🏆 Ganó ${nameOf(g.jugadores[winnerSeat]).nombre}.`);
  try {
    db.prepare('INSERT OR REPLACE INTO puente_funball_partidas (id, j1, j2, tablero, ganador, motivo, jugadas, inicio, fin, compu) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(g.id, g.jugadores[0], g.jugadores[1], g.tablero, winnerSeat === null ? null : g.jugadores[winnerSeat], motivo, g.jugadas, g.inicio || null, g.fin, g.compu ? 1 : 0);
  } catch (err) { warn('funball: guardar resultado:', err.message); }
  changed();
}

// Una jugada: la aplica el motor, se fija si alguien gano y pasa el turno
function play(g, i, de, a) {
  const S = M.load(g.tab);
  const k = colorOf(g, i);
  const ok = M.legalFrom(S, de[0], de[1], k).some(t => t[0] === a[0] && t[1] === a[1]);
  if (!ok) return { error: 'Esa jugada no vale.' };
  const ev = M.doMove(S, de, a, rng, true);
  g.tab = M.save(S);
  g.jugadas++;
  g.ultima = { n: g.jugadas, k, de, a, ev };
  const w = M.winner(S);
  if (w) {
    if (w === 'empate') finish(g, null, 'empate');
    else finish(g, seatOfColor(g, w), S.cells[0][7].k === 'G' || S.cells[7][0].k === 'R' ? 'meta' : 'bolas');
    push(g, true);
    return { ok: true };
  }
  g.turno = M.other(g.turno);
  // Sin jugadas posibles: pierde (como en el original, se le borran las bolas)
  if (!M.legalMoves(S, g.turno).length) {
    note(g, `${nameOf(g.jugadores[seatOfColor(g, g.turno)]).nombre} no tiene jugadas.`);
    finish(g, seatOfColor(g, M.other(g.turno)), 'sin-jugadas');
    push(g, true);
    return { ok: true };
  }
  tick(g);
  return { ok: true };
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
  if (d.tipo === 'abandonar') {
    note(g, `${nameOf(me).nombre} abandonó.`);
    finish(g, 1 - i, 'abandono'); push(g, true);
    return { ok: true };
  }
  if (d.tipo !== 'mover') return { error: 'No entendí.' };
  if (colorOf(g, i) !== g.turno) return { error: 'No es tu turno.' };
  const de = Array.isArray(d.de) ? d.de.map(Number) : null, a = Array.isArray(d.a) ? d.a.map(Number) : null;
  if (!de || !a || de.length !== 2 || a.length !== 2 || [...de, ...a].some(v => !(v >= 0 && v <= 7))) return { error: 'Jugada inválida.' };
  g.timeouts[i] = 0;
  return play(g, i, de, a);
}

function rematch(g) {
  const n = {
    id: crypto.randomBytes(5).toString('hex'), creado: Date.now(), tablero: g.tablero, arania: g.arania, publica: false, invitado: null,
    compu: g.compu, nivel: g.nivel, jugadores: g.jugadores.slice(), colores: ['R', 'G'], estado: 'esperando', log: [], revancha: [false, false], timeouts: [0, 0], jugadas: 0,
  };
  games.set(n.id, n);
  start(n);
  g.siguiente = n.id; push(g, true);
  changed();
  return { ok: true, id: n.id };
}

// ── Despues de cada cambio: guardar, avisar, el reloj y la compu ──
function tick(g) {
  g.deadline = g.estado === 'jugando' ? Date.now() + TURNO_MS : null;
  arm(g);
  push(g, false);
}

function arm(g) {
  clearTimeout(timers.get(g.id));
  if (g.estado !== 'jugando') return;
  const i = seatOfColor(g, g.turno);
  if (g.jugadores[i] === BOT) { timers.set(g.id, setTimeout(() => botMove(g), 1400 + rng(800))); return; }
  timers.set(g.id, setTimeout(() => timeout(g), Math.max(1000, (g.deadline || Date.now()) - Date.now())));
}

// Se le termino el tiempo: juega por el una jugada al azar. Tres veces seguidas: abandona.
function timeout(g) {
  if (g.estado !== 'jugando') return;
  const i = seatOfColor(g, g.turno);
  g.timeouts[i] = (g.timeouts[i] || 0) + 1;
  note(g, `⏰ A ${nameOf(g.jugadores[i]).nombre} se le terminó el tiempo.`);
  if (g.timeouts[i] >= 3) { finish(g, 1 - i, 'abandono'); push(g, true); return; }
  const mv = M.aiMove(M.load(g.tab), g.turno, 1, rng);
  if (!mv) { finish(g, 1 - i, 'sin-jugadas'); push(g, true); return; }
  play(g, i, mv[0], mv[1]);
}

// La compu: la misma del original (busca 0 a 3 jugadas adelante segun el nivel)
function botMove(g) {
  if (g.estado !== 'jugando') return;
  const i = seatOfColor(g, g.turno);
  if (g.jugadores[i] !== BOT) return;
  let mv = null;
  try { mv = M.aiMove(M.load(g.tab), g.turno, g.nivel, rng); } catch (err) { warn('funball: compu:', err.message); }
  if (!mv) { finish(g, 1 - i, 'sin-jugadas'); push(g, true); return; }
  play(g, i, mv[0], mv[1]);
}

// La partida como la ve cada uno
function view(g, me) {
  const i = seat(g, me);
  const pov = i >= 0 ? i : 0;
  const o = 1 - pov;
  const P = g.jugadores.map(nameOf);
  const out = {
    id: g.id, estado: g.estado, compu: g.compu, nivel: NIVELES[g.nivel - 1], publica: g.publica,
    tablero: boards[g.tablero] ? boards[g.tablero].nombre : '', arania: g.arania,
    yo: P[pov] ? { ...P[pov], color: g.estado === 'esperando' ? null : colorOf(g, pov) } : null,
    rival: P[o] ? { ...P[o], color: g.estado === 'esperando' ? null : colorOf(g, o) } : null,
    invitado: g.invitado ? nameOf(g.invitado) : null, soyJugador: i >= 0, soyCreador: g.jugadores[0] === me,
    log: g.log.slice(-6).map(x => x.text),
    ganador: g.estado === 'terminada' ? (g.ganador === null ? 'empate' : g.ganador === pov ? 'yo' : 'rival') : null, motivo: g.motivo || null,
    revancha: g.estado === 'terminada' ? { yo: !!g.revancha[pov], rival: !!g.revancha[o] } : null, siguiente: g.siguiente || null,
  };
  if (g.tab) {
    const S = M.load(g.tab);
    out.celdas = M.pack(S);
    out.ultima = g.ultima;
    out.jugadas = g.jugadas;
    if (g.estado === 'jugando') {
      out.turno = g.turno;
      out.teToca = i >= 0 && colorOf(g, i) === g.turno;
      out.deadline = g.deadline;
      if (out.teToca) {
        const moves = {};
        for (const [de, a] of M.legalMoves(S, g.turno)) (moves[de.join(',')] = moves[de.join(',')] || []).push(a);
        out.jugadasPosibles = moves;
      }
    }
  }
  return out;
}

function push(g, big) {
  save(g);
  const ids = g.jugadores.filter(x => x !== BOT);
  for (const [, s] of io.sockets.sockets) {
    if (s.user && ids.includes(s.user.id)) { try { s.emit('funball:estado', view(g, s.user.id)); } catch { /* sesion cerrada */ } }
  }
  if (g.estado === 'jugando') notifyTurn(g);
  if (big) changed();
}

function notifyTurn(g) {
  if (!webpush) return;
  const i = seatOfColor(g, g.turno);
  const uid = g.jugadores[i];
  if (uid === BOT) return;
  for (const [, s] of io.sockets.sockets) if (s.user && s.user.id === uid && s.hasFocus !== false) return;
  const key = g.id + ':' + uid;
  if (Date.now() - (pushed.get(key) || 0) < 3 * 60e3) return;
  pushed.set(key, Date.now());
  const rival = nameOf(g.jugadores[1 - i]).nombre;
  const payload = JSON.stringify({ title: 'Funball', body: `Te toca contra ${rival}`, url: `/app?funball=${g.id}`, tag: 'funball-' + g.id, __puente: 1 });
  for (const sub of db.prepare('SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?').all(uid)) {
    webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, { TTL: 600 }).catch(() => {});
  }
}

let changeTimer = null;
function changed() {
  clearTimeout(changeTimer);
  changeTimer = setTimeout(() => { try { io.emit('funball:cambio', {}); } catch { /* sin conexiones */ } }, 300);
}

// ── Sala ──
function stats(userId) {
  const r = db.prepare(`SELECT SUM(CASE WHEN ganador = ? THEN 1 ELSE 0 END) g, COUNT(*) n FROM puente_funball_partidas WHERE compu = 0 AND (j1 = ? OR j2 = ?)`).get(userId, userId, userId);
  const c = db.prepare(`SELECT SUM(CASE WHEN ganador = ? THEN 1 ELSE 0 END) g, COUNT(*) n FROM puente_funball_partidas WHERE compu = 1 AND (j1 = ? OR j2 = ?)`).get(userId, userId, userId);
  return { ganadas: r.g || 0, perdidas: (r.n || 0) - (r.g || 0), compuGanadas: c.g || 0, compuPerdidas: (c.n || 0) - (c.g || 0) };
}
function ranking(since) {
  return db.prepare(`SELECT ganador id, COUNT(*) n FROM puente_funball_partidas WHERE compu = 0 AND ganador IS NOT NULL AND fin >= ?
    GROUP BY ganador ORDER BY n DESC LIMIT 10`).all(since).map(r => ({ ...nameOf(r.id), ganadas: r.n }));
}
function lobby(me) {
  const all = [...games.values()];
  const abiertas = all.filter(g => g.estado === 'esperando' && (g.publica || g.invitado === me) && !g.jugadores.includes(me))
    .sort((a, b) => b.creado - a.creado).slice(0, 30)
    .map(g => ({ id: g.id, tablero: boards[g.tablero] ? boards[g.tablero].nombre : '', arania: g.arania, creador: nameOf(g.jugadores[0]), paraVos: g.invitado === me }));
  const mias = all.filter(g => g.jugadores.includes(me) && (g.estado !== 'terminada' || Date.now() - g.fin < 10 * 60e3))
    .sort((a, b) => b.creado - a.creado)
    .map(g => {
      const i = seat(g, me), o = 1 - i;
      return {
        id: g.id, estado: g.estado, tablero: boards[g.tablero] ? boards[g.tablero].nombre : '', compu: g.compu,
        rival: g.jugadores[o] !== undefined ? nameOf(g.jugadores[o]) : null, invitado: g.invitado ? nameOf(g.invitado) : null,
        teToca: g.estado === 'jugando' && colorOf(g, i) === g.turno, ganaste: g.estado === 'terminada' ? (g.ganador === null ? null : g.ganador === i) : null,
      };
    });
  const d = new Date();
  const mes = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) + 3 * 3600e3;
  return { tableros: boards.map(b => b.nombre), niveles: NIVELES, abiertas, mias, stats: stats(me), ranking: { mes: ranking(mes), total: ranking(0) } };
}

module.exports = { setup, stats, _test: { games, create, join, act, view, botMove, BOT, boards: () => boards } };
