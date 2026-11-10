// WORGS online (antes se llamaba Shoppa; el modulo y los eventos shoppa:* conservan el nombre de antes), para la
// seccion Juegos de la app. El juego en si corre en web/worgs/ (dentro de un iframe del mismo origen). Aca viven las salas:
// quien esta, los listos, el mapa, el turno y el chat. La fisica la simula el jugador que tiene el
// turno y les manda snapshots a los demas; el servidor solo valida el orden y retransmite.
//
// Por el socket de Haven (con respuesta):
//   shoppa:inicio                     -> { abiertas, mias }
//   shoppa:crear    { modo, mapa? }   -> { id }   (modo: shopper | normal; el normal, en una isla. Shoppa: en la
//                                                  fabrica, o en el mapa de Shoppa que se pida, o 'shoppaAzar': uno al azar
//                                                  cada vez que empieza, la revancha tambien; o uno de la comunidad
//                                                  ('c-...'), o 'comunidadAzar')
//   shoppa:unirse   { id }            -> { id }
//   shoppa:ver      { id }            -> { partida }  (con snapshot si esta en juego)
//   shoppa:listo    { id, listo }     -> { ok }
//   shoppa:empezar  { id }            -> { ok }
//   shoppa:chat     { id, texto }     -> { ok }
//   shoppa:revancha { id }            -> { ok, id? }  (cuando la piden todos, sala nueva)
//   shoppa:abandonar{ id }            -> { ok }
//   shoppa:sinMapa  { id, mapa }      -> { ok }   (no se pudo bajar ese mapa de la comunidad: la sala va a la fabrica)
// Y sin respuesta:
//   shoppa:snapshot { id, snapshot }  (solo el que tiene el turno)
//   shoppa:finTurno { id, snapshot }  (solo el que tiene el turno)
// El servidor avisa:
//   shoppa:estado   (la sala, distinta para cada uno)   shoppa:cambio (algo cambio en el lobby)
//   shoppa:turno    (empieza el turno de alguien)       shoppa:snapshot (como va el turno)
//   shoppa:fin      (termino la partida)                shoppa:revancha (sala nueva)

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const CP = require('./chat-partida.js');

const MIN = 2;
const MAX = 5;
// los mapas de Shoppa (los mismos ids que web/worgs/mapas.js: SHOPPA)
const MAPAS_SHOPPA = ['fabrica', 'torres', 'laberinto', 'colgantes', 'pozo', 'escalera', 'camaras', 'jaula', 'abandonada', 'barco', 'colmena', 'reloj', 'mina'];
const MAPAS = new Set(['isla'].concat(MAPAS_SHOPPA));
const AZAR = 'shoppaAzar';
// los mapas de Shopper de la comunidad: solo en el servidor, en web/worgs/comunidad/ (comunidad.json y un .bin por mapa).
// La lista se vuelve a leer si cambia el archivo. 'comunidadAzar': uno de ellos al azar (elegido al crear la sala, asi
// todos lo bajan antes de empezar; en la revancha, otro). Si alguien no lo puede bajar (shoppa:sinMapa), la sala pasa a la
// fabrica (y si ya estaba en juego, vuelve a empezar ahi para todos)
const AZAR_C = 'comunidadAzar';
const DIR_COMUNIDAD = path.join(__dirname, 'web', 'worgs', 'comunidad');
const esComunidad = (id) => typeof id === 'string' && /^c-[a-z0-9-]{1,60}$/.test(id);
let comunidad = { t: -1, ids: [] };
function mapasComunidad() {
  try {
    const f = path.join(DIR_COMUNIDAD, 'comunidad.json'), t = fs.statSync(f).mtimeMs;
    if (t !== comunidad.t) {
      const j = JSON.parse(fs.readFileSync(f, 'utf8'));
      const ids = (Array.isArray(j && j.mapas) ? j.mapas : [])
        .filter(e => e && esComunidad(e.id) && typeof e.archivo === 'string' && /^[a-z0-9-]+\.bin$/.test(e.archivo) && fs.existsSync(path.join(DIR_COMUNIDAD, e.archivo)))
        .map(e => e.id);
      comunidad = { t, ids: [...new Set(ids)] };
    }
  } catch { comunidad = { t: -1, ids: [] }; }
  return comunidad.ids;
}
// los modos de juego y su mapa: Shopper en la fabrica; el normal en una isla al azar (sale de la semilla)
const MODOS = { shopper: 'fabrica', normal: 'isla' };
const esModo = (m) => typeof m === 'string' && Object.prototype.hasOwnProperty.call(MODOS, m);
const MAX_SNAPSHOT = 262144;       // 256 KB: mas que eso es un estado roto
const ESPERA_TURNO = 90e3;         // anti-trabado: 30 s de turno + 10 de retirada y margen
const GRACIA_SALA = 24 * 3600e3;   // una sala esperando sin empezar se borra al dia
const GRACIA_FIN = 3600e3;         // una partida terminada queda una hora (para la revancha)
const GRACIA_JUEGO = 6 * 3600e3;   // una partida abandonada del todo se cierra a las 6 horas

let db, io, log, warn;
const games = new Map();   // id -> sala
const timers = new Map();  // id -> watchdog del turno
const rng = (n) => crypto.randomInt(n);

function setup(ctx) {
  ({ db, io, log, warn } = ctx);
  db.exec(`
    CREATE TABLE IF NOT EXISTS puente_shoppa_mesas (id TEXT PRIMARY KEY, estado TEXT NOT NULL, actualizado INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS puente_worgs_partidas (id TEXT PRIMARY KEY, modo TEXT NOT NULL, jugadores TEXT NOT NULL, ganador INTEGER, motivo TEXT, inicio INTEGER, fin INTEGER NOT NULL);
  `);
  for (const r of db.prepare('SELECT id, estado FROM puente_shoppa_mesas').all()) {
    try {
      const g = JSON.parse(r.estado);
      if (!g || !g.id || typeof g.id !== 'string') continue;
      if (g.estado === 'terminada' && Date.now() - (g.fin || 0) > GRACIA_FIN) { borrarFila(r.id); continue; }
      if (g.estado === 'esperando' && Date.now() - (g.creado || 0) > GRACIA_SALA) { borrarFila(r.id); continue; }
      normalizar(g);
      games.set(g.id, g);
      if (g.estado === 'jugando') armar(g);
    } catch { /* fila rota */ }
  }
  setInterval(sweep, 10 * 60 * 1000).unref();
  io.on('connection', (socket) => {
    const on = (ev, fn) => socket.on(ev, (data, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      const me = socket.user && socket.user.id;
      if (!me) return reply({ error: 'sin sesion' });
      try { reply(fn(me, data || {}, socket) || { ok: true }); } catch (err) { warn('shoppa:', err.message); reply({ error: 'Algo salió mal.' }); }
    });
    on('shoppa:inicio', (me) => lobby(me));
    on('shoppa:crear', create);
    on('shoppa:unirse', join);
    on('shoppa:ver', (me, d) => {
      const g = games.get(String(d.id || ''));
      if (!g) return { error: 'Esa sala ya no está.' };
      if (!canSee(g, me)) return { error: 'Esa sala es privada.' };
      return { partida: view(g, me, true) };
    });
    on('shoppa:listo', listo);
    on('shoppa:empezar', empezar);
    on('shoppa:chat', chat);
    on('shoppa:revancha', revancha);
    on('shoppa:abandonar', abandonar);
    on('shoppa:sinMapa', sinMapa);
    on('shoppa:snapshot', snapshot);
    on('shoppa:finTurno', finTurno);
  });
  log(`shoppa: listo (${games.size} salas en curso)`);
}

// ── Salas ──
const nameOf = (id) => {
  const u = db.prepare('SELECT id, COALESCE(display_name, username) nombre, avatar FROM users WHERE id = ?').get(id);
  return u ? { id: u.id, nombre: u.nombre, avatar: u.avatar || null } : { id, nombre: 'Alguien', avatar: null };
};
const seat = (g, me) => g.jugadores.indexOf(me);
const activo = (g, i) => i >= 0 && !(g.fuera || [])[i];
const jugadoresActivos = (g) => g.jugadores.map((id, i) => ({ id, i })).filter(x => activo(g, x.i));
const canSee = (g, me) => seat(g, me) >= 0 || (g.estado === 'esperando' && g.publica);

function normalizar(g) {
  g.fuera = Array.isArray(g.fuera) ? g.fuera : [];
  g.listos = Array.isArray(g.listos) ? g.listos : [];
  g.revancha = Array.isArray(g.revancha) ? g.revancha : [];
  while (g.fuera.length < g.jugadores.length) g.fuera.push(false);
  while (g.listos.length < g.jugadores.length) g.listos.push(false);
  while (g.revancha.length < g.jugadores.length) g.revancha.push(false);
  g.chat = Array.isArray(g.chat) ? g.chat : [];
  g.chatT = g.chatT && typeof g.chatT === 'object' ? g.chatT : {};
  if (!esModo(g.modo)) g.modo = 'shopper';
  // (uno de la comunidad que ya estaba en la sala se respeta aunque lo hayan sacado de la lista: no se cambia a mitad de partida)
  if (!g.mapa || !(MAPAS.has(g.mapa) || (esComunidad(g.mapa) && g.modo === 'shopper')) || (g.modo === 'normal') !== (g.mapa === 'isla')) g.mapa = MODOS[g.modo];
  if ((g.eleccion !== AZAR && g.eleccion !== AZAR_C) || g.modo !== 'shopper') delete g.eleccion;
  if (g.ronda == null) g.ronda = 1;
  if (g.viento == null) g.viento = 0;
  if (g.ultimoMovimiento == null) g.ultimoMovimiento = Date.now();
}

function save(g) {
  try {
    db.prepare('INSERT OR REPLACE INTO puente_shoppa_mesas (id, estado, actualizado) VALUES (?, ?, ?)')
      .run(g.id, JSON.stringify(g), Date.now());
  } catch (err) { warn('shoppa: guardar:', err.message); }
}
function borrarFila(id) {
  try { db.prepare('DELETE FROM puente_shoppa_mesas WHERE id = ?').run(id); } catch { /* ya no estaba */ }
}
function drop(g) {
  games.delete(g.id);
  clearTimeout(timers.get(g.id));
  timers.delete(g.id);
  borrarFila(g.id);
}
function sweep() {
  const now = Date.now();
  for (const g of [...games.values()]) {
    if (g.estado === 'terminada' && now - (g.fin || 0) > GRACIA_FIN) drop(g);
    else if (g.estado === 'esperando' && now - (g.creado || 0) > GRACIA_SALA) { drop(g); changed(); }
    else if (g.estado === 'jugando' && now - (g.ultimoMovimiento || 0) > GRACIA_JUEGO) {
      finish(g, null, 'abandono', { abandono: 'Todos' });
    }
  }
}

function conectado(uid) {
  for (const [, s] of io.sockets.sockets) if (s.user && s.user.id === uid) return true;
  return false;
}

function jugadoresDe(g, me) {
  return g.jugadores.map((id, i) => {
    const n = nameOf(id);
    return { ...n, creador: i === 0, listo: !!g.listos[i], conectado: !(g.fuera || [])[i] && conectado(id), yo: id === me };
  });
}

function view(g, me, conSnapshot) {
  normalizar(g);
  const i = seat(g, me);
  const soy = activo(g, i);
  const jugadores = jugadoresDe(g, me);
  const nombre = (k) => ({ quien: k === me ? 'Vos' : nameOf(k).nombre });
  const rival = jugadores.find((_, k) => k !== i) || null;
  const out = {
    id: g.id, estado: g.estado, mapa: g.mapa, modo: g.modo, eleccion: g.eleccion || null, creado: g.creado || null, inicio: g.inicio || null,
    sinMapa: g.sinMapa || null, fin: g.fin || null, ganador: g.ganador != null ? g.ganador : null, motivo: g.motivo || null,
    abandono: g.abandono || null, ronda: g.ronda || 1, turno: g.turno != null ? g.turno : null,
    viento: g.viento || 0, semilla: g.semilla || 0, jugadores, rival,
    miSeat: i, soyJugador: soy, soyCreador: soy && i === 0, listo: soy && !!g.listos[i],
    todosListos: jugadoresActivos(g).length >= MIN && jugadoresActivos(g).every(x => !!g.listos[x.i]),
    revancha: g.revancha.map(Boolean),
    yoRevancha: soy && (!!g.revancha[i] || !!g.siguiente),
    siguiente: g.siguiente || null,
    chat: soy ? CP.mensajes(g, me, nombre) : [],
  };
  if (g.estado === 'jugando') out.teToca = soy && g.turno === i;
  if (g.estado === 'terminada') out.ganaste = soy ? g.ganador === i : null;
  if (conSnapshot && g.estado === 'jugando' && soy) { out.snapshot = g.ultimo || null; out.cr = g.cr || []; }
  return out;
}

function push(g, big) {
  normalizar(g);
  save(g);
  for (const [, s] of io.sockets.sockets) {
    if (!s.user || !s.user.id) continue;
    const i = seat(g, s.user.id);
    if (i < 0) continue;
    try { s.emit('shoppa:estado', view(g, s.user.id, false)); } catch { /* sesion cerrada */ }
  }
  if (big) changed();
}

let changeTimer = null;
function changed() {
  clearTimeout(changeTimer);
  changeTimer = setTimeout(() => { try { io.emit('shoppa:cambio', {}); } catch { /* sin conexiones */ } }, 300);
}

// ── Lobby ──
function lobby(me) {
  const all = [...games.values()];
  const abiertas = all
    .filter(g => g.estado === 'esperando' && g.publica && jugadoresActivos(g).length < MAX && !g.jugadores.includes(me))
    .sort((a, b) => (b.creado || 0) - (a.creado || 0)).slice(0, 30)
    .map(g => {
      const activos = jugadoresActivos(g);
      return { id: g.id, mapa: g.mapa, modo: g.modo, eleccion: g.eleccion || null, jugadores: activos.length, creador: nameOf(activos[0] ? activos[0].id : g.jugadores[0]) };
    });
  const mias = all
    .filter(g => g.jugadores.includes(me))
    .filter(g => g.estado !== 'terminada' || Date.now() - (g.fin || 0) < 10 * 60e3)
    .sort((a, b) => (b.creado || 0) - (a.creado || 0)).slice(0, 10)
    .map(g => {
      const i = seat(g, me);
      const jugadores = g.jugadores.map(nameOf);
      return {
        id: g.id, estado: g.estado, mapa: g.mapa, modo: g.modo, eleccion: g.eleccion || null, jugadores: jugadoresActivos(g).length,
        teToca: g.estado === 'jugando' && g.turno === i,
        ganaste: g.estado === 'terminada' ? g.ganador === i : null,
        rival: jugadores.find((_, k) => k !== i) || null,
        invitado: null,
      };
    });
  return { abiertas, mias };
}

function create(me, d) {
  const otra = [...games.values()].find(g => g.estado !== 'terminada' && activo(g, seat(g, me)));
  if (otra) return { error: 'Ya estás en una partida de WORGS. Terminá esa o salí de la sala.' };
  if ([...games.values()].filter(g => g.jugadores[0] === me && g.estado === 'esperando').length >= 10) {
    return { error: 'Tenés muchas salas abiertas. Cerrá alguna.' };
  }
  const modo = esModo(d.modo) ? d.modo : 'shopper';
  // (Shoppa: el mapa pedido, si es uno de Shoppa o de la comunidad; 'al azar' se elige al empezar; 'comunidad al azar',
  // ahora: asi todos lo bajan antes)
  const com = modo === 'shopper' ? mapasComunidad() : [];
  const azar = modo === 'shopper' && d.mapa === AZAR, azarC = modo === 'shopper' && d.mapa === AZAR_C && com.length > 0;
  const mapa = azar ? MAPAS_SHOPPA[rng(MAPAS_SHOPPA.length)] : azarC ? com[rng(com.length)]
    : modo === 'shopper' && (MAPAS_SHOPPA.includes(d.mapa) || com.includes(d.mapa)) ? d.mapa : MODOS[modo];
  const g = {
    id: crypto.randomBytes(5).toString('hex'), creado: Date.now(), publica: true, mapa, modo, ...(azar ? { eleccion: AZAR } : azarC ? { eleccion: AZAR_C } : {}),
    jugadores: [me], listos: [false], fuera: [false], revancha: [false],
    estado: 'esperando', ronda: 1, turno: null, viento: 0, ultimo: null,
    chat: [], chatT: {}, ultimoMovimiento: Date.now(),
  };
  games.set(g.id, g);
  save(g); changed();
  const nombre = nameOf(me).nombre;
  // (en prueba: sin aviso en #que-paso)
  log(`shoppa: ${nombre} creó una sala (${modo}${modo === 'shopper' ? ', ' + (azar ? 'al azar' : azarC ? 'comunidad al azar: ' + mapa : mapa) : ''})`);
  return { ok: true, id: g.id };
}

function join(me, d) {
  const g = games.get(String(d.id || ''));
  if (!g) return { error: 'Esa sala ya no está.' };
  const i = seat(g, me);
  if (i >= 0) {
    if ((g.fuera || [])[i]) return { error: 'Saliste de esa partida.' };
    return { ok: true, id: g.id };
  }
  if (g.estado !== 'esperando') return { error: 'Esa partida ya empezó.' };
  if (!g.publica) return { error: 'Esa sala es privada.' };
  if (jugadoresActivos(g).length >= MAX) return { error: 'La sala está llena (5 jugadores).' };
  const otra = [...games.values()].find(x => x !== g && x.estado !== 'terminada' && activo(x, seat(x, me)));
  if (otra) return { error: 'Ya estás en otra partida de WORGS. Terminá esa primero.' };
  g.jugadores.push(me);
  g.listos.push(false);
  g.fuera.push(false);
  g.revancha.push(false);
  normalizar(g);
  save(g); changed();
  push(g, true);
  log(`shoppa: ${nameOf(me).nombre} entró a la sala ${g.id}`);
  return { ok: true, id: g.id };
}

function listo(me, d) {
  const g = games.get(String(d.id || ''));
  if (!g) return { error: 'Esa sala ya no está.' };
  const i = seat(g, me);
  if (!activo(g, i)) return { error: 'No estás en esta sala.' };
  if (g.estado !== 'esperando') return { error: 'La partida ya empezó.' };
  g.listos[i] = d.listo == null ? !g.listos[i] : !!d.listo;
  push(g, false);
  return { ok: true };
}

function empezar(me, d) {
  const g = games.get(String(d.id || ''));
  if (!g) return { error: 'Esa sala ya no está.' };
  const i = seat(g, me);
  if (!activo(g, i) || i !== 0) return { error: 'Solo el creador puede empezar.' };
  if (g.estado !== 'esperando') return { error: 'La partida ya empezó.' };
  const activos = jugadoresActivos(g);
  if (activos.length < MIN) return { error: 'Faltan jugadores: son de 2 a 5.' };
  if (!activos.every(x => !!g.listos[x.i])) return { error: 'Falta que todos estén listos.' };
  comenzar(g, false);
  return { ok: true };
}

function comenzar(g, revancha) {
  normalizar(g);
  const activos = jugadoresActivos(g);
  const elegidos = activos.map(x => x.i);
  g.estado = 'jugando';
  g.inicio = Date.now();
  g.ultimoMovimiento = Date.now();
  g.fin = null;
  g.ganador = null;
  g.motivo = null;
  g.abandono = null;
  g.ronda = revancha ? (g.ronda || 1) + 1 : 1;
  g.turno = elegidos[rng(elegidos.length)];
  g.semilla = rng(1e9); // (las cajas caen en el mismo orden para todos)
  if (g.eleccion === AZAR) g.mapa = MAPAS_SHOPPA[rng(MAPAS_SHOPPA.length)];
  else if (g.eleccion === AZAR_C && revancha) { const com = mapasComunidad(); if (com.length) g.mapa = com[rng(com.length)]; }
  delete g.sinMapa;
  g.viento = rng(141) - 70;
  g.ultimo = null;
  g.cr = [];
  g.turnoDesde = Date.now();
  g.revancha = g.jugadores.map(() => false);
  for (const i of elegidos) g.listos[i] = true;
  save(g);
  armar(g); // (el anti-trabado, desde el primer turno)
  enviarTurno(g, true);
  push(g, true);
  const nombres = activos.map(x => nameOf(x.id).nombre).join(', ');
  log(`shoppa: empezó la sala ${g.id} (${nombres})`);
}

// ── Turnos ──
function enviarTurno(g, inicio) {
  normalizar(g);
  for (const [, s] of io.sockets.sockets) {
    if (!s.user || !s.user.id) continue;
    const i = seat(g, s.user.id);
    if (!activo(g, i)) continue;
    const d = {
      id: g.id, turno: g.turno, viento: g.viento, ronda: g.ronda, inicio: !!inicio, semilla: g.semilla || 0, mapa: g.mapa, modo: g.modo, sinMapa: g.sinMapa || null,
      miSeat: i, jugadores: jugadoresDe(g, s.user.id), snapshot: g.ultimo || null, cr: g.cr || [],
    };
    try { s.emit('shoppa:turno', d); } catch { /* sesion cerrada */ }
  }
}

function armar(g, corto) {
  clearTimeout(timers.get(g.id));
  if (g.estado !== 'jugando') return;
  const desde = g.ultimoMovimiento || Date.now();
  const espera = corto ? 10e3 : Math.max(5000, ESPERA_TURNO - (Date.now() - desde));
  timers.set(g.id, setTimeout(() => {
    const x = games.get(g.id);
    if (!x || x.estado !== 'jugando') return;
    if (Date.now() - (x.ultimoMovimiento || 0) < 20e3 && Date.now() - (x.turnoDesde || 0) < 180e3) { armar(x, true); return; }
    x.pasesSolos = (x.pasesSolos || 0) + 1;
    if (x.pasesSolos >= Math.max(4, 2 * jugadoresActivos(x).length)) {
      warn(`shoppa: la sala ${x.id} no juega nadie; se cierra`);
      finish(x, null, 'abandono', { abandono: 'Todos' });
      return;
    }
    warn(`shoppa: se trabó el turno de la sala ${x.id}; pasa al siguiente`);
    pasarTurno(x);
  }, espera));
}

function vivosDelSnapshot(g) {
  const s = g.ultimo;
  if (!s || !Array.isArray(s.gusanos)) return null;
  const set = new Set();
  for (const w of s.gusanos) {
    if (!w || w.muerto) continue;
    const eq = Number(w.equipo);
    if (Number.isInteger(eq) && eq >= 0 && eq < g.jugadores.length && activo(g, eq)) set.add(eq);
  }
  return [...set];
}

function pasarTurno(g) {
  normalizar(g);
  const vivos = vivosDelSnapshot(g);
  if (vivos && vivos.length <= 1) {
    finish(g, vivos.length === 1 ? vivos[0] : null, 'ultimo');
    return;
  }
  const n = g.jugadores.length;
  let next = g.turno;
  const libres = vivos && vivos.length ? vivos : jugadoresActivos(g).map(x => x.i);
  if (libres.length) {
    for (let k = 1; k <= n; k++) {
      const j = ((g.turno == null ? -1 : g.turno) + k) % n;
      if (libres.includes(j)) { next = j; break; }
    }
  }
  if (next == null || next === g.turno) {
    finish(g, null, 'ultimo');
    return;
  }
  g.turno = next;
  g.turnoDesde = Date.now();
  g.ronda = (g.ronda || 1) + 1;
  g.viento = rng(141) - 70;
  g.ultimoMovimiento = Date.now();
  save(g);
  armar(g);
  enviarTurno(g, false);
  push(g, true);
}

function snapshot(me, d) {
  const g = games.get(String(d.id || ''));
  if (!g || g.estado !== 'jugando') return { ok: true };
  if (!normalizeSnapshot(g, me, d)) return { ok: true };
  const s = g.ultimo;
  if (!s) return { ok: true };
  g.ultimoMovimiento = Date.now();
  // como mucho 25 por segundo; el cliente manda uno cada ~80 ms
  const ahora = Date.now();
  if (g.snapT && ahora - g.snapT < 40) return { ok: true };
  g.snapT = ahora;
  for (const [, sock] of io.sockets.sockets) {
    if (!sock.user || !sock.user.id || sock.user.id === me) continue;
    const i = seat(g, sock.user.id);
    if (!activo(g, i)) continue;
    try { sock.emit('shoppa:snapshot', { id: g.id, snapshot: s }); } catch { /* sesion cerrada */ }
  }
  return { ok: true };
}

function normalizeSnapshot(g, me, d) {
  const i = seat(g, me);
  if (!activo(g, i) || g.turno !== i) return false;
  const s = d.snapshot;
  if (!s || typeof s !== 'object' || !Array.isArray(s.gusanos)) return false;
  let raw;
  try { raw = JSON.stringify(s); } catch { return false; }
  if (raw.length > MAX_SNAPSHOT) return false;
  if (s.mapa && s.mapa !== g.mapa) return false;
  g.ultimo = s;
  g.pasesSolos = 0;
  guardarCrateres(g, s);
  return true;
}

// los huecos: la foto completa trae todos; las otras, los del turno desde cr0
function guardarCrateres(g, s) {
  const ok = (l) => Array.isArray(l) && l.every(c => Array.isArray(c) && c.length === 3 && c.every(Number.isFinite));
  const base = Array.isArray(g.cr) ? g.cr : [];
  if (ok(s.cr)) { if (s.cr.length >= base.length) g.cr = s.cr; return; }
  if (ok(s.crU) && Number.isInteger(s.cr0) && s.cr0 >= 0 && s.cr0 <= base.length && s.cr0 + s.crU.length >= base.length) g.cr = base.slice(0, s.cr0).concat(s.crU);
}

function finTurno(me, d) {
  const g = games.get(String(d.id || ''));
  if (!g || g.estado !== 'jugando') return { ok: true };
  const i = seat(g, me);
  if (!activo(g, i) || g.turno !== i) return { error: 'No es tu turno.' };
  // el snapshot final es el que manda: sin el no se puede saber quien quedo vivo
  if (d.snapshot && typeof d.snapshot === 'object' && (!d.snapshot.mapa || d.snapshot.mapa === g.mapa)) {
    try {
      if (JSON.stringify(d.snapshot).length <= MAX_SNAPSHOT) { g.ultimo = d.snapshot; guardarCrateres(g, d.snapshot); }
    } catch { /* snapshot roto: se usa el anterior */ }
  }
  g.ultimoMovimiento = Date.now();
  pasarTurno(g);
  return { ok: true };
}

function finish(g, ganador, motivo, extra) {
  if (g.estado === 'terminada') return;
  normalizar(g);
  g.estado = 'terminada';
  g.ganador = ganador != null ? ganador : null;
  g.motivo = motivo || 'ultimo';
  g.fin = Date.now();
  if (extra && extra.abandono) g.abandono = extra.abandono;
  clearTimeout(timers.get(g.id)); timers.delete(g.id);
  save(g);
  // la partida, para las estadisticas de los juegos (juegos-estadisticas.js): WORGS: Shoppa o WORGS: Normal
  try {
    if (g.inicio) {
      db.prepare('INSERT OR REPLACE INTO puente_worgs_partidas (id, modo, jugadores, ganador, motivo, inicio, fin) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(g.id, g.modo === 'normal' ? 'normal' : 'shopper', JSON.stringify(g.jugadores), g.ganador != null && g.jugadores[g.ganador] ? g.jugadores[g.ganador] : null, g.motivo, g.inicio, g.fin);
    }
  } catch (err) { warn('shoppa: guardar la partida:', err.message); }
  const nombreGanador = g.ganador != null && g.jugadores[g.ganador] ? nameOf(g.jugadores[g.ganador]).nombre : null;
  for (const [, s] of io.sockets.sockets) {
    if (!s.user || !s.user.id) continue;
    const i = seat(g, s.user.id);
    if (!activo(g, i)) continue;
    try {
      s.emit('shoppa:fin', {
        id: g.id, ganador: g.ganador, motivo: g.motivo, abandono: g.abandono || null,
        snapshot: g.ultimo || null,
      });
    } catch { /* sesion cerrada */ }
  }
  if (nombreGanador) log(`shoppa: terminó la sala ${g.id}; ganó ${nombreGanador}`);
  else log(`shoppa: terminó la sala ${g.id} (${g.motivo})`);
  push(g, true);
}

// ── Un mapa de la comunidad que alguien no pudo bajar: la sala pasa a la fabrica (si ya se jugaba, empieza de nuevo ahi,
// para todos: los snapshots del mapa de antes ya no valen) ──
function sinMapa(me, d) {
  const g = games.get(String(d.id || ''));
  if (!g) return { error: 'Esa sala ya no está.' };
  const i = seat(g, me);
  if (!activo(g, i)) return { error: 'No estás en esta sala.' };
  if (!esComunidad(g.mapa) || d.mapa !== g.mapa || g.estado === 'terminada') return { ok: true };
  log(`shoppa: ${nameOf(me).nombre} no pudo bajar el mapa ${g.mapa}; la sala ${g.id} pasa a la fabrica`);
  g.sinMapa = g.mapa;
  g.mapa = 'fabrica';
  delete g.eleccion;
  if (g.estado === 'jugando') {
    g.ultimo = null; g.cr = []; g.turnoDesde = Date.now(); g.ultimoMovimiento = Date.now();
    save(g); armar(g); enviarTurno(g, true);
  }
  push(g, true);
  return { ok: true };
}

// ── Chat, abandono y revancha ──
function chat(me, d) {
  const g = games.get(String(d.id || ''));
  if (!g) return { error: 'Esa sala ya no está.' };
  const i = seat(g, me);
  if (!activo(g, i)) return { error: 'No estás en esta sala.' };
  const err = CP.chatear(g, me, d.texto);
  if (err) return { error: err };
  push(g, false);
  return { ok: true };
}

function abandonar(me, d) {
  const g = games.get(String(d.id || ''));
  if (!g) return { ok: true };
  const i = seat(g, me);
  if (i < 0) return { ok: true };
  normalizar(g);

  if (g.estado === 'esperando') {
    g.jugadores.splice(i, 1);
    g.listos.splice(i, 1);
    g.fuera.splice(i, 1);
    g.revancha.splice(i, 1);
    if (!g.jugadores.length) { drop(g); changed(); return { ok: true }; }
    g.listos = g.listos.map(() => false);
    save(g); push(g, true);
    log(`shoppa: ${nameOf(me).nombre} salió de la sala ${g.id}`);
    return { ok: true };
  }

  if (g.estado === 'jugando') {
    if (g.fuera[i]) return { ok: true };
    g.fuera[i] = true;
    const activos = jugadoresActivos(g);
    const nombre = nameOf(me).nombre;
    if (activos.length <= 1) {
      finish(g, activos.length === 1 ? activos[0].i : null, 'abandono', { abandono: nombre });
    } else {
      // En Shopper, si se va uno, la partida termina para el resto (no se sigue con un gusano menos).
      finish(g, null, 'abandono', { abandono: nombre });
    }
    return { ok: true };
  }

  // terminada: sale de la revancha, pero la sala queda un rato por si vuelve
  g.fuera[i] = true;
  save(g); push(g, false);
  return { ok: true };
}

function revancha(me, d) {
  const g = games.get(String(d.id || ''));
  if (!g) return { error: 'Esa sala ya no está.' };
  const i = seat(g, me);
  if (!activo(g, i)) return { error: 'No estás en esta partida.' };
  if (g.estado !== 'terminada') return { error: 'La partida todavía no terminó.' };
  if (g.siguiente) return { ok: true, id: g.siguiente };
  g.revancha[i] = true;
  const activos = jugadoresActivos(g);
  if (!activos.every(x => !!g.revancha[x.i])) {
    push(g, false);
    return { ok: true };
  }
  if (activos.length < MIN) return { error: 'Faltan jugadores para la revancha.' };

  // Sala nueva (los que se quedaron, con los asientos acomodados) y arranca enseguida.
  const n = {
    id: crypto.randomBytes(5).toString('hex'), creado: Date.now(), publica: true, mapa: g.mapa, modo: g.modo, ...(g.eleccion ? { eleccion: g.eleccion } : {}),
    jugadores: activos.map(x => g.jugadores[x.i]),
    listos: [], fuera: [], revancha: [], estado: 'esperando', ronda: g.ronda || 1,
    turno: null, viento: 0, ultimo: null, chat: [], chatT: {}, ultimoMovimiento: Date.now(),
  };
  n.listos = n.jugadores.map(() => true);
  n.fuera = n.jugadores.map(() => false);
  n.revancha = n.jugadores.map(() => false);
  normalizar(n);
  games.set(n.id, n);
  g.siguiente = n.id;
  save(g);
  save(n);
  // Primero les avisamos que la sala cambió; recién después empieza, para que el turno
  // les llegue con el id nuevo ya puesto.
  for (const [, s] of io.sockets.sockets) {
    if (!s.user || !s.user.id) continue;
    const k = seat(g, s.user.id);
    if (!activo(g, k)) continue;
    try { s.emit('shoppa:revancha', { de: g.id, id: n.id }); } catch { /* sesion cerrada */ }
  }
  comenzar(n, true);
  changed();
  return { ok: true, id: n.id };
}

module.exports = { setup, _test: { games, create, join, listo, empezar, snapshot, finTurno, abandonar, revancha, sinMapa, view, lobby, seat, mapasComunidad, DIR_COMUNIDAD } };
