// Curveball (parte del puente), para la seccion Juegos de la app: el 1 contra 1 de tres
// vidas, contra otra persona o contra la compu. La fisica online la trae el motor del juego
// (web/curveball, compilado a curveball-servidor.cjs): el servidor simula cada mesa a 30 Hz
// y les manda snapshots a los dos (y a los que miran). La pantalla es web/curveball/juego.html,
// que aviso.js abre en un iframe del mismo origen.
//
// Por el socket de Haven (con respuesta):
//   curveball:inicio                      -> { niveles, abiertas, mias, enJuego, ranking, stats }
//   curveball:crear  { modo: 'abierta'|'compu'|'desafio', rival, nivel, amistosa }
//   curveball:unirse { id }   curveball:cancelar { id }   curveball:ver { id }   curveball:salir { id }
//   curveball:accion { id, tipo: 'objetivo'|'chat'|'abandonar'|'revancha'|'pedirChat'|'aceptarChat'|'rechazarChat', ... }
//     objetivo: { x, y } en coordenadas de la cancha (350 x 250); se manda 30 veces por segundo
// Y el servidor avisa:
//   curveball:estado (la sala y la partida)   curveball:snap (cada tick)   curveball:cambio (la biblioteca)

const crypto = require('crypto');
const CP = require('./chat-partida.js');

// El motor viaja aparte (lo despliega el repo del juego). Si todavía no está, el resto del
// puente sigue andando y Curveball contesta que no está disponible.
let M = null;
try { M = require('./curveball-servidor.cjs'); }
catch {
  try { M = require('./web/curveball/servidor/curveball-servidor.cjs'); }
  catch { M = null; }
}

const BOT = -1;
const BOT_NAME = 'La Compu';
const NIVELES = ['Fácil', 'Normal', 'Difícil'];
const HZ = 30;
const TICK_MS = 1000 / HZ;
const SIN_OBJETIVO_MS = 12e3; // sin noticias de una paleta: se fue y pierde
const GUARDAR_MS = 5e3;

let db, io, log, warn;
const games = new Map(); // id -> partida
let loop = null;
const rng = (n) => crypto.randomInt(n);
const rnd = () => crypto.randomInt(1e9) / 1e9;

function setup(ctx) {
  ({ db, io, log, warn } = ctx);
  db.exec(`
    CREATE TABLE IF NOT EXISTS puente_curveball_mesas (id TEXT PRIMARY KEY, estado TEXT NOT NULL, actualizado INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS puente_curveball_partidas (
      id TEXT PRIMARY KEY, j1 INTEGER NOT NULL, j2 INTEGER NOT NULL, ganador INTEGER, motivo TEXT, vidas TEXT,
      inicio INTEGER, fin INTEGER NOT NULL, compu INTEGER NOT NULL DEFAULT 0, amistosa INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_puente_curveball_fin ON puente_curveball_partidas(fin);
  `);
  if (M) {
    for (const r of db.prepare('SELECT id, estado FROM puente_curveball_mesas').all()) {
      try {
        const g = JSON.parse(r.estado);
        if (!g || !g.id) { db.prepare('DELETE FROM puente_curveball_mesas WHERE id = ?').run(r.id); continue; }
        if (g.estado === 'terminada' && Date.now() - (g.fin || 0) > 3600e3) { db.prepare('DELETE FROM puente_curveball_mesas WHERE id = ?').run(r.id); continue; }
        if (g.estado === 'esperando' && Date.now() - g.creado > 24 * 3600e3) { db.prepare('DELETE FROM puente_curveball_mesas WHERE id = ?').run(r.id); continue; }
        // una partida en juego sin la simulacion no se puede retomar: se descarta (nadie pierde)
        if (g.estado === 'jugando' && (!g.S || !Array.isArray(g.S.localPaddles))) { db.prepare('DELETE FROM puente_curveball_mesas WHERE id = ?').run(r.id); continue; }
        g.log = g.log || []; g.chat = g.chat || []; g.chatT = {};
        g.visto = [Date.now(), Date.now()]; g.movido = Date.now(); g.ultimoGuardado = 0;
        games.set(g.id, g);
      } catch { /* fila rota */ }
    }
  }
  io.on('connection', (socket) => {
    const on = (ev, fn) => socket.on(ev, (data, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      const me = socket.user && socket.user.id;
      if (!M) return reply({ error: 'Curveball todavía no está instalado en este servidor.' });
      if (!me) return reply({ error: 'sin sesion' });
      try { reply(fn(me, data || {}, socket) || { ok: true }); }
      catch (err) { warn('curveball:', err.message); reply({ error: 'Algo salió mal.' }); }
    });
    on('curveball:inicio', (me) => lobby(me));
    on('curveball:crear', create);
    on('curveball:unirse', join);
    on('curveball:cancelar', cancel);
    on('curveball:ver', (me, d, socket) => {
      const g = games.get(String(d.id));
      if (!g) return { error: 'Esa partida ya no está.' };
      if (!canSee(g, me)) return { error: 'Esa partida es privada.' };
      const key = 'curveball:' + g.id;
      if (socket.cbMesa && socket.cbMesa !== key) socket.cbMesa = null;
      socket.cbMesa = key;
      marcarVisto(g, me);
      return { partida: view(g, me) };
    });
    on('curveball:salir', (me, d, socket) => {
      if (socket.cbMesa === 'curveball:' + String(d.id)) socket.cbMesa = null;
      return { ok: true };
    });
    on('curveball:accion', act);
  });
  if (M && !loop) {
    loop = setInterval(tickAll, TICK_MS);
    loop.unref();
  }
  setInterval(sweep, 60 * 1000).unref();
  setTimeout(sweep, 60e3).unref();
  log(`curveball: listo (${games.size} partidas)${M ? '' : ' (sin el motor: falta curveball-servidor.cjs)'}`);
}

// ── Partidas ──
const nameOf = (id) => {
  if (id === BOT) return { id: BOT, nombre: BOT_NAME, avatar: null, compu: true };
  const u = db.prepare('SELECT id, COALESCE(display_name, username) nombre, avatar FROM users WHERE id = ?').get(id);
  return u ? { id: u.id, nombre: u.nombre, avatar: u.avatar || null } : { id, nombre: 'Alguien', avatar: null };
};
// Cualquier partida que ya empezo se puede mirar; la que espera, solo si es publica o te invitaron.
const canSee = (g, me) => g.jugadores.includes(me) || (g.estado === 'esperando' && (g.publica || g.invitado === me)) || g.estado !== 'esperando';
const seat = (g, me) => g.jugadores.indexOf(me);

function save(g) {
  if (!M) return;
  try {
    db.prepare('INSERT OR REPLACE INTO puente_curveball_mesas (id, estado, actualizado) VALUES (?, ?, ?)').run(g.id, JSON.stringify(g), Date.now());
    g.ultimoGuardado = Date.now();
  } catch (err) { warn('curveball: guardar:', err.message); }
}
function drop(g) {
  games.delete(g.id);
  try { db.prepare('DELETE FROM puente_curveball_mesas WHERE id = ?').run(g.id); } catch { /* ya no estaba */ }
}
function note(g, text) {
  g.log.push({ t: Date.now(), text });
  if (g.log.length > 30) g.log.shift();
  g.movido = Date.now();
}

function sweep() {
  if (!M) return;
  const now = Date.now();
  for (const g of [...games.values()]) {
    if (g.estado === 'terminada' && now - (g.fin || 0) > 3600e3) drop(g);
    else if (g.estado === 'esperando' && now - (g.creado || 0) > 24 * 3600e3) { drop(g); changed(); }
    // la mesa de alguien que ya no esta (un invitado que se fue): se cierra
    else if (g.estado === 'esperando' && require('./juegos-aviso.js').seFue(db, g.jugadores, BOT)) { drop(g); changed(); }
    else if (g.estado === 'jugando') {
      const sf = require('./juegos-aviso.js').seFue(db, g.jugadores, BOT);
      if (sf && sf.borrar) { drop(g); changed(); }
      else if (sf) { note(g, 'Tu rival se fue del club.'); finishGame(g, sf.gana, 'abandono'); }
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
    jugadores: [me], estado: 'esperando', log: [], revancha: [false, false], S: null, rallies: 0,
    // (el visto de los dos asientos: la mesa que espera todavia no paso por start())
    visto: [Date.now(), 0],
  };
  games.set(g.id, g);
  if (modo === 'compu') { g.jugadores.push(BOT); start(g); }
  else { save(g); changed(); }
  // La mesa abierta, en #que-paso (juegos-aviso.js)
  if (g.publica) require('./juegos-aviso.js').anunciar(db, io, warn, { juego: 'curveball', quien: me, enlace: `/app?curveball=${g.id}`,
    texto: `armó una partida de **Curveball** (1 contra 1, 3 vidas) y busca rival` });
  log(`curveball:${nameOf(me).nombre} creó una partida (${modo}${g.amistosa ? ', amistosa' : ''})`);
  return { ok: true, id: g.id };
}

function join(me, d) {
  const g = games.get(String(d.id));
  if (!g) return { error: 'Esa partida ya no está.' };
  if (g.jugadores.includes(me)) return { ok: true, id: g.id };
  if (g.estado !== 'esperando') return { error: 'Esa partida ya empezó.' };
  if (!g.publica && g.invitado !== me) return { error: 'Esa partida es privada.' };
  if (g.jugadores.length !== 1) return { error: 'La mesa está llena.' };
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

function start(g, saque) {
  g.estado = 'jugando';
  g.inicio = Date.now();
  g.fin = null; g.ganador = null; g.motivo = null; g.siguiente = null;
  g.revancha = [false, false]; g.rallies = 0;
  g.visto = [Date.now(), Date.now()]; g.movido = Date.now(); g.ultimoGuardado = 0;
  g.S = M.createOnline();
  M.startMatch(g.S, saque === undefined ? rng(2) : saque);
  g.botRally = -1;
  note(g, 'Arranca la partida.');
  save(g);
}

function finishGame(g, winnerSide, motivo) {
  if (g.estado === 'terminada') return;
  g.estado = 'terminada'; g.ganador = winnerSide; g.motivo = motivo; g.fin = Date.now();
  note(g, `🏆 Ganó ${nameOf(g.jugadores[winnerSide] || BOT).nombre}.`);
  // (las de invitados y las amistosas no suman al ranking; la compu no cuenta para el ranking)
  const amistosa = g.amistosa || require('./juegos-aviso.js').conInvitado(db, g.jugadores);
  if (amistosa && !g.compu) note(g, g.amistosa ? 'Partida amistosa: no suma al ranking.' : 'Jugó un invitado: queda como amistosa, no suma al ranking.');
  try {
    db.prepare('INSERT OR REPLACE INTO puente_curveball_partidas (id, j1, j2, ganador, motivo, vidas, inicio, fin, compu, amistosa) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(g.id, g.jugadores[0], g.jugadores[1] === undefined ? BOT : g.jugadores[1], g.jugadores[winnerSide] === undefined ? BOT : g.jugadores[winnerSide],
        motivo, g.S ? g.S.lives.join('-') : '', g.inicio || null, g.fin, g.compu ? 1 : 0, amistosa ? 1 : 0);
  } catch (err) { warn('curveball: guardar resultado:', err.message); }
  // El ultimo snapshot congela la mesa (el cliente deja de ver la bola en movimiento).
  if (g.S) { g.S.ball.vx = g.S.ball.vy = g.S.ball.vz = g.S.ball.cx = g.S.ball.cy = 0; g.S.phase = 'MatchEnded'; }
  save(g);
  push(g, true);
  snap(g, []);
}

function rematch(g) {
  const n = {
    id: crypto.randomBytes(5).toString('hex'), creado: Date.now(), publica: false, invitado: null,
    compu: g.compu, amistosa: !!g.amistosa, nivel: g.nivel, jugadores: g.jugadores.slice(), estado: 'esperando',
    log: [], revancha: [false, false], S: null, rallies: 0,
  };
  // La charla sigue en la revancha (los mismos jugadores, en los mismos lugares).
  if (g.chat) n.chat = g.chat.slice();
  games.set(n.id, n);
  // En la revancha saca el que perdio.
  start(n, 1 - g.ganador);
  g.siguiente = n.id;
  save(g); push(g, true); changed();
  return { ok: true, id: n.id };
}

// ── El bucle de las mesas (30 Hz) ──
function tickAll() {
  const now = Date.now();
  for (const g of games.values()) {
    if (g.estado !== 'jugando' || !g.S) continue;
    try { tickGame(g, now); }
    catch (err) { warn('curveball: tick:', err.message); }
  }
}

function tickGame(g, now) {
  const S = g.S;
  // La compu: predice la trayectoria hasta su plano y le agrega error segun el nivel.
  if (g.compu) {
    if (g.botRally !== S.rallyId) {
      g.botRally = S.rallyId;
      g.botErr = { x: rnd() * 2 - 1, y: rnd() * 2 - 1 };
    }
    const o = M.compuObjetivo(S, 1, g.nivel, (g.botErr && g.botErr.x) || 0, (g.botErr && g.botErr.y) || 0);
    if (o) { try { M.target(S.localPaddles[1], o.x, o.y); } catch { /* coordenada rara */ } }
  }
  const events = M.step(S);
  if (events.length) {
    g.movido = now;
    for (const e of events) {
      if (e.type === 'miss') {
        note(g, `Perdió una vida ${nameOf(g.jugadores[e.side] === undefined ? BOT : g.jugadores[e.side]).nombre}.`);
      } else if (e.type === 'finish') {
        finishGame(g, S.result ? S.result.winner : (S.lives[0] === 0 ? 1 : 0), 'vidas');
        return;
      }
    }
    if (S.phase === 'MatchEnded' && g.estado === 'jugando') { finishGame(g, S.result ? S.result.winner : 0, 'vidas'); return; }
    if (S.rallyId !== (g.rallyVisto || 0)) { g.rallyVisto = S.rallyId; g.rallies = (g.rallies || 0) + 1; }
  }
  // Si una paleta dejo de mandar objetivos, el otro gana por abandono (no se queda colgada).
  for (let i = 0; i < 2; i++) {
    const uid = g.jugadores[i];
    if (uid === BOT || uid === undefined) continue;
    if (now - (g.visto[i] || 0) > SIN_OBJETIVO_MS) {
      note(g, `${nameOf(uid).nombre} no siguió jugando.`);
      finishGame(g, 1 - i, 'abandono');
      return;
    }
  }
  if (now - (g.ultimoGuardado || 0) > GUARDAR_MS) save(g);
  snap(g, events);
}

// ── Snapshots ──
function snap(g, events) {
  if (!g.S) return;
  const key = 'curveball:' + g.id;
  const ev = events.map(e => ({ t: e.type, s: e.side }));
  const vistas = [0, 1].map(side => {
    const v = M.vistaLado(g.S, side);
    const p = g.S.localPaddles[side];
    return {
      id: g.id, tick: g.S.tick, matchId: g.S.matchId, rallyId: g.S.rallyId,
      phase: g.S.phase, deadline: g.S.phaseDeadline, lives: [...g.S.lives], serving: g.S.servingSide,
      v: {
        ball: v.ball, own: v.own, remote: v.remote,
        z: Math.round(v.z * 100) / 100, speed: Math.round(v.speed * 1000) / 1000,
        spin: Math.round(v.spin * 1000) / 1000, bias: Math.round(v.bias * 1000) / 1000,
      },
      p: [Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10, Math.round(p.tx * 10) / 10, Math.round(p.ty * 10) / 10],
      ev,
    };
  });
  for (const [, s] of io.sockets.sockets) {
    if (!s.user || s.cbMesa !== key) continue;
    const i = g.jugadores.indexOf(s.user.id);
    try { s.emit('curveball:snap', i === 1 ? vistas[1] : vistas[0]); } catch { /* sesion cerrada */ }
  }
}

// ── La partida como la ve cada uno ──
function view(g, me) {
  const i = seat(g, me);
  const pov = i >= 0 ? i : 0;
  const o = 1 - pov;
  const P = g.jugadores.map(nameOf);
  const S = g.S;
  const out = {
    id: g.id, estado: g.estado, compu: g.compu, nivel: NIVELES[g.nivel - 1], publica: !!g.publica, amistosa: !!g.amistosa,
    yo: P[pov] || null, rival: P[o] || null, nombres: P,
    invitado: g.invitado ? nameOf(g.invitado) : null, soyJugador: i >= 0, soyCreador: g.jugadores[0] === me,
    lado: i >= 0 ? i : undefined,
    chat: i >= 0 && !g.compu ? CP.mensajes(g, i, (k) => ({ quien: k === i ? 'Vos' : (P[k] ? P[k].nombre : 'Rival') })) : null,
    ...(!g.compu && g.estado !== 'esperando' ? CP.vistaEsp(g, me, i >= 0, (k) => ({ quien: P[k] ? P[k].nombre : 'Alguien' })) : {}),
    log: g.log.slice(-6).map(x => x.text),
    ganador: g.estado === 'terminada' && i >= 0 ? (g.ganador === i ? 'yo' : 'rival') : null,
    ganadorNombre: g.estado === 'terminada' && g.ganador != null && P[g.ganador] ? P[g.ganador].nombre : null,
    motivo: g.motivo || null,
    revancha: g.estado === 'terminada' ? { yo: !!g.revancha[pov], rival: !!g.revancha[o] } : null,
    siguiente: g.siguiente || null, inicio: g.inicio || null,
    lives: S ? [...S.lives] : [3, 3], phase: S ? S.phase : null, rallies: g.rallies || 0,
  };
  return out;
}

function marcarVisto(g, me) {
  const i = seat(g, me);
  if (i >= 0) (g.visto = g.visto || [0, 0])[i] = Date.now();
}

function push(g, big) {
  save(g);
  const key = 'curveball:' + g.id;
  for (const [, s] of io.sockets.sockets) {
    if (!s.user || s.cbMesa !== key) continue;
    try { s.emit('curveball:estado', view(g, s.user.id)); } catch { /* sesion cerrada */ }
  }
  if (big) changed();
}

let changeTimer = null;
function changed() {
  clearTimeout(changeTimer);
  changeTimer = setTimeout(() => { try { io.emit('curveball:cambio', {}); } catch { /* sin conexiones */ } }, 300);
}

// ── Acciones ──
function act(me, d, socket) {
  const g = games.get(String(d.id));
  if (!g) return { error: 'Esa partida ya no está.' };
  const i = seat(g, me);
  // el que mira: pedir participar en el chat y, si lo aceptaron, escribir (chat-partida.js)
  if (i < 0 && g.estado !== 'esperando') { const r = CP.accionEsp(g, me, nameOf(me).nombre, d); if (r) { if (r.ok) push(g, false); return r; } }

  if (d.tipo === 'objetivo') {
    if (i < 0) return { error: 'No estás en esta partida.' };
    if (g.estado !== 'jugando' || !g.S) return { error: 'La partida no está en juego.' };
    g.visto[i] = Date.now();
    const x = Number(d.x), y = Number(d.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return { ok: true };
    try { M.target(g.S.localPaddles[i], Math.max(-20, Math.min(370, x)), Math.max(-20, Math.min(270, y))); } catch { /* coordenada rara */ }
    return { ok: true };
  }

  if (i < 0) return { error: 'No estás en esta partida.' };
  // el que juega: aceptar (o no) al que pidio participar en el chat
  { const r = CP.respuestaEsp(g, d); if (r) { if (r.ok) push(g, false); return r; } }
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
  if (d.tipo === 'abandonar') {
    note(g, `${nameOf(me).nombre} abandonó.`);
    finishGame(g, 1 - i, 'abandono');
    return { ok: true };
  }
  return { error: 'No entendí.' };
}

// ── Sala ──
function stats(userId) {
  const q = (where) => db.prepare(`SELECT SUM(CASE WHEN ganador = ? THEN 1 ELSE 0 END) g, COUNT(*) n FROM puente_curveball_partidas WHERE ${where} AND (j1 = ? OR j2 = ?)`).get(userId, userId, userId);
  const r = q('compu = 0 AND amistosa = 0'), a = q('compu = 0 AND amistosa = 1'), c = q('compu = 1');
  return { ganadas: r.g || 0, perdidas: (r.n || 0) - (r.g || 0), compuGanadas: c.g || 0, compuPerdidas: (c.n || 0) - (c.g || 0),
    amistosasGanadas: a.g || 0, amistosasPerdidas: (a.n || 0) - (a.g || 0) };
}
function ranking(since) {
  return db.prepare(`SELECT ganador id, COUNT(*) n FROM puente_curveball_partidas WHERE compu = 0 AND amistosa = 0 AND ganador IS NOT NULL AND fin >= ?
    GROUP BY ganador ORDER BY n DESC LIMIT 10`).all(since).map(r => ({ ...nameOf(r.id), ganadas: r.n }));
}
// Las partidas que se estan jugando (todas: con invitados o con la compu tambien), para mirarlas
function mirables(me) {
  return [...games.values()]
    .filter(g => g.estado === 'jugando' && !g.jugadores.includes(me) && g.jugadores.length === 2
      && Date.now() - CP.ultimaJugada(g) < 30 * 60e3)
    .sort((a, b) => (b.inicio || b.creado || 0) - (a.inicio || a.creado || 0)).slice(0, 10)
    .map(g => ({ id: g.id, jugadores: g.jugadores.map(nameOf) }));
}

function lobby(me) {
  const all = [...games.values()];
  const abiertas = all.filter(g => g.estado === 'esperando' && (g.publica || g.invitado === me) && !g.jugadores.includes(me))
    .sort((a, b) => b.creado - a.creado).slice(0, 30)
    .map(g => ({ id: g.id, amistosa: !!g.amistosa, creador: nameOf(g.jugadores[0]), paraVos: g.invitado === me }));
  const mias = all.filter(g => g.jugadores.includes(me) && (g.estado !== 'terminada' || Date.now() - (g.fin || 0) < 10 * 60e3))
    .sort((a, b) => b.creado - a.creado)
    .map(g => {
      const i = seat(g, me), o = 1 - i;
      return {
        id: g.id, estado: g.estado, compu: g.compu, amistosa: !!g.amistosa,
        rival: g.jugadores[o] !== undefined ? nameOf(g.jugadores[o]) : null, invitado: g.invitado ? nameOf(g.invitado) : null,
        ganaste: g.estado === 'terminada' ? g.ganador === i : null,
      };
    });
  const d = new Date();
  const mes = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) + 3 * 3600e3;
  const res = { niveles: NIVELES, abiertas, mias, enJuego: mirables(me), stats: stats(me), ranking: { mes: ranking(mes), total: ranking(0) } };
  return CP.paraBiblioteca(res, games, { io, db });
}

module.exports = { setup, stats, _test: { games, create, join, act, view, finishGame, BOT } };
