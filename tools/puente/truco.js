// Truco argentino (parte del puente), para la seccion Juegos de la app.
// 1 contra 1, contra otra persona o contra la compu, a 15 o 30 puntos, con o
// sin flor, con 2 minutos por jugada o sin limite (cada uno juega cuando puede y le
// avisa al celular cuando le toca; si pasan 7 dias sin que juegue, pierde por abandono). El servidor reparte (sorteo con crypto), conoce las reglas y decide
// que puede hacer cada uno: a cada jugador le manda solo lo que puede ver (nunca
// las cartas del otro). Las partidas en curso se guardan en la base (sobreviven
// a un reinicio) y las terminadas quedan para las estadisticas y el ranking.
//
// Por el socket de Haven (con respuesta):
//   truco:inicio                      -> { abiertas, mias, ranking, stats }
//   truco:crear  { puntos, flor, modo: 'abierta'|'compu'|'desafio', rival, libre }
//   truco:unirse { id }   truco:cancelar { id }   truco:ver { id }
//   truco:accion { id, tipo, carta?, grito? }   (jugar, truco, retruco, vale4,
//       envido, real, falta, flor, quiero, noquiero, mazo, grito, abandonar, revancha,
//       tanto { valor }, buenas, ver, chicana)
// El envido querido se canta como en la mesa: el mano dice su tanto, el otro contesta "son
// buenas" o "X son mejores", y se puede mentir. El que pierde puede pedir "las quiero ver en
// mesa": al final de la mano se muestran las cartas y, si el ganador mintio, pierde esos puntos.
// Y el servidor avisa:
//   truco:estado (la partida, como la ve cada uno)   truco:cambio (algo cambio en la sala)
//
// Pensado para crecer a 2 contra 2 y 3 contra 3: los jugadores van en una lista
// y los equipos son "jugador % 2".

const crypto = require('crypto');

const BOT = -1;
const BOT_NAME = 'La Compu';
const TURNO_MS = 2 * 60 * 1000;
const LIBRE_MS = 7 * 24 * 3600e3; // sin limite: si el que tiene que jugar no juega en 7 dias, pierde por abandono
const PALOS = ['espada', 'basto', 'oro', 'copa'];
const NUMS = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12];
const GRITOS = ['¡Mirá lo que tengo!', '¡Qué suerte!', 'Buena jugada', 'Jajaja', 'Dale que se enfría', 'Me voy a dormir', '¿Y ahora?', 'Uh, me la hiciste'];
// Las chicanas: al pedir verlas, el otro tiene unos segundos para contestar la primera, y el que
// las pidio, la segunda. No cambian nada del juego
const CHICANAS = ['En mesa las verás, y el culo cerrarás', 'Si en mesa no las veo, el culo te pateo'];
const CHICANA_MS = 6000;
const TRUCO_VAL = { truco: 2, retruco: 3, vale4: 4 };
const TRUCO_SIG = { truco: 'retruco', retruco: 'vale4' };
const ENV_VAL = { envido: 2, real: 3 };
const NOMBRE = { truco: '¡Truco!', retruco: '¡Quiero retruco!', vale4: '¡Quiero vale cuatro!', envido: 'Envido', real: 'Real envido', falta: 'Falta envido', flor: '¡Flor!' };

let db, io, log, warn, webpush = null;
const games = new Map(); // id -> partida
const timers = new Map(); // id -> timeout del turno
const pushed = new Map(); // "id:user" -> ultima notificacion

function setup(ctx) {
  ({ db, io, log, warn } = ctx);
  db.exec(`
    CREATE TABLE IF NOT EXISTS puente_truco_mesas (id TEXT PRIMARY KEY, estado TEXT NOT NULL, actualizado INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS puente_truco_partidas (
      id TEXT PRIMARY KEY, j1 INTEGER NOT NULL, j2 INTEGER NOT NULL, puntos INTEGER NOT NULL, flor INTEGER NOT NULL,
      p1 INTEGER NOT NULL, p2 INTEGER NOT NULL, ganador INTEGER, motivo TEXT, inicio INTEGER, fin INTEGER NOT NULL, compu INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_puente_truco_fin ON puente_truco_partidas(fin);
  `);
  try { webpush = require('/app/node_modules/web-push'); } catch { /* sin avisos al celular */ }
  // Las partidas que estaban en curso (por ejemplo, antes de un reinicio)
  for (const r of db.prepare('SELECT id, estado FROM puente_truco_mesas').all()) {
    try {
      const g = JSON.parse(r.estado);
      if (g.estado === 'terminada' && Date.now() - (g.fin || 0) > 3600e3) { db.prepare('DELETE FROM puente_truco_mesas WHERE id = ?').run(r.id); continue; }
      if (g.estado === 'esperando' && Date.now() - g.creado > 24 * 3600e3) { db.prepare('DELETE FROM puente_truco_mesas WHERE id = ?').run(r.id); continue; }
      games.set(g.id, g);
      if (g.estado === 'jugando') { g.deadline = g.libre ? null : Date.now() + TURNO_MS; arm(g); }
    } catch { /* fila rota */ }
  }
  setInterval(sweep, 10 * 60 * 1000).unref();
  io.on('connection', (socket) => {
    const on = (ev, fn) => socket.on(ev, (data, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      const me = socket.user && socket.user.id;
      if (!me) return reply({ error: 'sin sesion' });
      try { reply(fn(me, data || {}, socket) || { ok: true }); } catch (err) { warn('truco:', err.message); reply({ error: 'Algo salió mal.' }); }
    });
    on('truco:inicio', (me) => lobby(me));
    on('truco:crear', create);
    on('truco:unirse', join);
    on('truco:cancelar', cancel);
    on('truco:ver', (me, d) => { const g = games.get(String(d.id)); if (!g) return { error: 'Esa partida ya no está.' }; if (!canSee(g, me)) return { error: 'Esa partida es privada.' }; return { partida: view(g, me) }; });
    on('truco:accion', act);
  });
  log(`truco: listo (${games.size} partidas en curso)`);
}

// ── Cartas ──
// Jerarquia del truco: ancho de espada, ancho de basto, siete de espada, siete de oro, treses...
function rank(c) {
  const [n, p] = [c.n, c.p];
  if (n === 1 && p === 'espada') return 14;
  if (n === 1 && p === 'basto') return 13;
  if (n === 7 && p === 'espada') return 12;
  if (n === 7 && p === 'oro') return 11;
  return { 3: 10, 2: 9, 1: 8, 12: 7, 11: 6, 10: 5, 7: 4, 6: 3, 5: 2, 4: 1 }[n];
}
const envVal = c => (c.n >= 10 ? 0 : c.n);
function envido(cards) {
  let best = 0;
  for (const p of PALOS) {
    const vs = cards.filter(c => c.p === p).map(envVal).sort((a, b) => b - a);
    if (vs.length >= 2) best = Math.max(best, 20 + vs[0] + vs[1]);
  }
  return best || Math.max(...cards.map(envVal));
}
// Las cartas con las que se hace el tanto (las dos del mismo palo, o la mas alta)
function envidoCartas(cards) {
  let best = null, bv = -1;
  for (const p of PALOS) {
    const cs = cards.filter(c => c.p === p).sort((a, b) => envVal(b) - envVal(a));
    if (cs.length >= 2 && 20 + envVal(cs[0]) + envVal(cs[1]) > bv) { bv = 20 + envVal(cs[0]) + envVal(cs[1]); best = cs.slice(0, 2); }
  }
  return best || [cards.slice().sort((a, b) => envVal(b) - envVal(a))[0]];
}
const tantoValido = v => Number.isInteger(v) && ((v >= 0 && v <= 7) || (v >= 20 && v <= 33));
const hasFlor = cards => cards.length === 3 && cards.every(c => c.p === cards[0].p);
const florVal = cards => 20 + cards.reduce((s, c) => s + envVal(c), 0);
function deal() {
  const deck = [];
  for (const p of PALOS) for (const n of NUMS) deck.push({ n, p });
  for (let i = deck.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [deck[i], deck[j]] = [deck[j], deck[i]]; }
  return [deck.slice(0, 3), deck.slice(3, 6)];
}

// ── Partidas ──
const other = i => 1 - i;
const nameOf = (id) => {
  if (id === BOT) return { id: BOT, nombre: BOT_NAME, avatar: null, compu: true };
  const u = db.prepare('SELECT id, COALESCE(display_name, username) nombre, avatar FROM users WHERE id = ?').get(id);
  return u ? { id: u.id, nombre: u.nombre, avatar: u.avatar || null } : { id, nombre: 'Alguien', avatar: null };
};
const canSee = (g, me) => g.jugadores.includes(me) || (g.estado === 'esperando' && (g.publica || g.invitado === me));
const seat = (g, me) => g.jugadores.indexOf(me);

function save(g) {
  try { db.prepare('INSERT OR REPLACE INTO puente_truco_mesas (id, estado, actualizado) VALUES (?, ?, ?)').run(g.id, JSON.stringify(g), Date.now()); } catch (err) { warn('truco: guardar:', err.message); }
}
function drop(g) { games.delete(g.id); clearTimeout(timers.get(g.id)); timers.delete(g.id); try { db.prepare('DELETE FROM puente_truco_mesas WHERE id = ?').run(g.id); } catch { /* ya no estaba */ } }
function sweep() {
  const now = Date.now();
  for (const g of [...games.values()]) {
    if (g.estado === 'terminada' && now - (g.fin || 0) > 3600e3) drop(g);
    else if (g.estado === 'jugando' && g.libre && now - (g.movido || g.inicio || now) > LIBRE_MS && g.jugadores[actor(g)] !== BOT) {
      const i = actor(g);
      note(g, `${nameOf(g.jugadores[i]).nombre} no jugó en 7 días.`);
      finish(g, other(i), 'abandono'); push(g, true);
    }
    else if (g.estado === 'esperando' && now - g.creado > 24 * 3600e3) { drop(g); changed(); }
  }
}

function create(me, d) {
  const puntos = Number(d.puntos) === 15 ? 15 : 30;
  const modo = ['abierta', 'compu', 'desafio'].includes(d.modo) ? d.modo : 'abierta';
  const mine = [...games.values()].filter(g => g.estado !== 'terminada' && g.jugadores.includes(me));
  if (mine.length >= 10) return { error: 'Tenés muchas partidas abiertas. Terminá o cancelá alguna.' };
  let rival = null;
  if (modo === 'desafio') {
    rival = Number(d.rival);
    if (!(rival > 0) || rival === me || !db.prepare('SELECT 1 FROM users WHERE id = ?').get(rival)) return { error: 'Elegí a quién desafiar.' };
  }
  const g = {
    id: crypto.randomBytes(5).toString('hex'), creado: Date.now(), puntos, flor: !!d.flor, publica: modo === 'abierta',
    invitado: rival, compu: modo === 'compu', jugadores: [me], puntaje: [0, 0], manoDe: 0, manos: 0,
    estado: 'esperando', log: [], grito: null, revancha: [false, false], timeouts: [0, 0], libre: d.libre !== false,
  };
  games.set(g.id, g);
  if (modo === 'compu') { g.jugadores.push(BOT); start(g); }
  else { save(g); changed(); }
  log(`truco: ${nameOf(me).nombre} creó una partida (${modo}, a ${puntos}${g.flor ? ', con flor' : ''}${g.libre ? ', sin límite' : ''})`);
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

function start(g) {
  g.estado = 'jugando';
  g.inicio = Date.now();
  g.manoDe = crypto.randomInt(2); // quien es mano en la primera, al azar
  newHand(g, true);
}

function newHand(g, first) {
  if (!first && cerrarTanto(g)) return; // al mostrar el tanto, el que mintio pudo perder la partida
  if (!first) g.manoDe = other(g.manoDe);
  g.manos++;
  const cartas = deal();
  g.h = {
    cartas, bazas: [{}, {}, {}], baza: 0, turno: g.manoDe,
    truco: { nivel: 1, quien: null, pend: null },
    env: { cantos: [], de: null, pend: null, hecho: false },
    flor: { cantada: [false, false], hecho: false },
  };
  g.timeouts = g.timeouts || [0, 0];
  note(g, `Mano ${g.manos}: es mano ${nameOf(g.jugadores[g.manoDe]).nombre}.`);
  tick(g);
}

function note(g, text) { g.log.push({ t: Date.now(), text }); if (g.log.length > 30) g.log.shift(); }

function addPoints(g, i, n, why) {
  g.puntaje[i] += n;
  note(g, `${nameOf(g.jugadores[i]).nombre} suma ${n} ${n === 1 ? 'punto' : 'puntos'} (${why}).`);
  // Si con esto termina la partida, antes se muestra el tanto que pidieron ver
  if (g.puntaje[i] >= g.puntos && cerrarTanto(g)) return true;
  if (g.puntaje[i] >= g.puntos) { g.puntaje[i] = Math.min(g.puntaje[i], g.puntos); finish(g, i, 'puntos'); return true; }
  return false;
}

// El envido querido ya cantado: gana w con lo que dijo. Si con esos puntos gana la partida, las
// cartas se muestran en el momento; si no, quedan para el final de la mano (si las piden)
function resolverTanto(g, w) {
  const h = g.h, e = h.env, o = other(w);
  e.canta.turno = null;
  e.ganador = w; e.dijo = e.canta.dicho[w];
  const cards = h.cartas[w].concat(h.bazas[0][w] ? [h.bazas[0][w]] : []);
  e.real = envido(cards); e.cartas = envidoCartas(cards);
  if (g.puntaje[w] + e.pts >= g.puntos) {
    e.ver = true; e.cerrado = true; mostrarTanto(g);
    return e.real >= e.dijo ? addPoints(g, w, e.pts, 'envido') : addPoints(g, o, e.pts, 'tanto mentido');
  }
  const fin = addPoints(g, w, e.pts, 'envido');
  // La compu, cuando pierde, a veces las quiere ver (mas cuanto mas alto le cantaron)
  const b = seat(g, BOT);
  if (!fin && b === o) {
    const p = e.dijo >= 31 ? 0.65 : e.dijo >= 28 ? 0.4 : e.dijo >= 25 ? 0.25 : 0.1;
    if (Math.random() < p) setTimeout(() => { if (g.estado === 'jugando' && g.h === h && allowed(g, b).includes('ver')) doAct(g, b, { tipo: 'ver' }); }, 1200 + crypto.randomInt(800));
  }
  return fin;
}
function mostrarTanto(g) {
  const e = g.h.env, w = e.ganador, name = nameOf(g.jugadores[w]).nombre;
  g.muestra = { de: w, dijo: e.dijo, tenia: e.real, cartas: e.cartas, mintio: e.real < e.dijo, pts: e.pts, t: Date.now() };
  g.pausa = Date.now() + 5000;
  note(g, e.real >= e.dijo ? `${name} mostró las cartas: tenía ${e.real}.` : `¡${name} mintió! Cantó ${e.dijo} y tenía ${e.real}.`);
}
// Al final de la mano: si pidieron ver el tanto, se muestra; si el ganador mintio, los puntos
// del envido pasan al otro. Devuelve true si con eso termino la partida
function cerrarTanto(g) {
  const e = g.h && g.h.env;
  if (!e || e.ganador == null || e.cerrado) return false;
  e.cerrado = true;
  if (!e.ver) return false;
  mostrarTanto(g);
  if (e.real >= e.dijo) return false;
  const w = e.ganador;
  g.puntaje[w] = Math.max(0, g.puntaje[w] - e.pts);
  note(g, `${nameOf(g.jugadores[w]).nombre} pierde los ${e.pts} del envido.`);
  return addPoints(g, other(w), e.pts, 'tanto mentido');
}

// La chicana numero paso, para el jugador i (la compu a veces la dice sola)
function abrirChicana(g, paso, i) {
  if (paso >= CHICANAS.length) { g.chicana = null; return; }
  const c = g.chicana = { paso, para: i, hasta: Date.now() + CHICANA_MS };
  if (g.jugadores[i] === BOT && Math.random() < 0.7) setTimeout(() => { if (g.chicana === c) doAct(g, i, { tipo: 'chicana' }); }, 1300 + crypto.randomInt(1200));
}

function finish(g, winner, motivo) {
  if (g.estado === 'terminada') return;
  g.estado = 'terminada'; g.ganador = winner; g.motivo = motivo; g.fin = Date.now(); g.deadline = null;
  clearTimeout(timers.get(g.id)); timers.delete(g.id);
  note(g, `🏆 Ganó ${nameOf(g.jugadores[winner]).nombre}, ${g.puntaje[winner]} a ${g.puntaje[other(winner)]}.`);
  try {
    db.prepare('INSERT OR REPLACE INTO puente_truco_partidas (id, j1, j2, puntos, flor, p1, p2, ganador, motivo, inicio, fin, compu) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(g.id + '-' + g.manos, g.jugadores[0], g.jugadores[1], g.puntos, g.flor ? 1 : 0, g.puntaje[0], g.puntaje[1], g.jugadores[winner], motivo, g.inicio || null, g.fin, g.compu ? 1 : 0);
  } catch (err) { warn('truco: guardar resultado:', err.message); }
  changed();
}

// Quien tiene que actuar ahora (contestar un canto, o jugar)
function actor(g) {
  const h = g.h;
  if (h.env.canta && h.env.canta.turno != null) return h.env.canta.turno;
  if (h.env.pend) return h.env.pend.para;
  if (h.truco.pend) return h.truco.pend.para;
  return h.turno;
}
const played = (h, i, b) => h.bazas[b][i] !== undefined;
function canEnvido(g, i) {
  const h = g.h;
  if (h.env.hecho || h.env.pend || h.baza !== 0) return false;
  // Despues de tirar la primera carta ya no se canta… salvo para contestar un truco:
  // "el envido está primero" (por ejemplo, el mano que jugo sin cantar y le cantan truco)
  if (played(h, i, 0) && !(h.truco.pend && h.truco.pend.para === i)) return false;
  if (h.truco.nivel > 1) return false; // con el truco querido ya no se canta envido
  if (h.flor.cantada[0] || h.flor.cantada[1]) return false;
  return true;
}
function canFlor(g, i) {
  const h = g.h;
  return g.flor && !h.flor.hecho && h.baza === 0 && !played(h, i, 0) && hasFlor(h.cartas[i].concat(h.bazas[0][i] ? [h.bazas[0][i]] : [])) && !h.flor.cantada[i];
}
function envRaises(cantos) {
  if (cantos.includes('falta')) return [];
  if (cantos.includes('real')) return ['falta'];
  const e = cantos.filter(c => c === 'envido').length;
  return e >= 2 ? ['real', 'falta'] : ['envido', 'real', 'falta'];
}

// Lo que puede hacer el jugador i en este momento (y el que perdio el envido, pedir verlas)
function allowed(g, i) {
  if (g.estado !== 'jugando') return g.estado === 'terminada' && !g.siguiente ? ['revancha'] : [];
  const e = g.h.env;
  if (e.canta && e.canta.turno != null) return e.canta.turno !== i ? [] : i === g.manoDe ? ['tanto'] : ['tanto', 'buenas'];
  const out = jugadas(g, i);
  if (e.ganador != null && e.ganador !== i && !e.ver && !e.cerrado) out.push('ver');
  return out;
}
function jugadas(g, i) {
  const h = g.h, out = [];
  if (h.env.pend) {
    if (h.env.pend.para !== i) return ['mazo'];
    out.push('quiero', 'noquiero', ...envRaises(h.env.cantos));
    if (canFlor(g, i)) out.push('flor');
    return out;
  }
  if (h.truco.pend) {
    if (h.truco.pend.para !== i) return ['mazo'];
    out.push('quiero', 'noquiero');
    if (TRUCO_SIG[h.truco.pend.canto]) out.push(TRUCO_SIG[h.truco.pend.canto]);
    if (h.truco.pend.canto === 'truco' && canEnvido(g, i)) out.push('envido', 'real', 'falta'); // el envido esta primero
    if (canFlor(g, i)) out.push('flor');
    out.push('mazo');
    return out;
  }
  if (h.turno !== i) return ['mazo'];
  out.push('jugar');
  if (h.truco.nivel === 1) out.push('truco');
  else if (h.truco.quien === i && TRUCO_SIG[{ 2: 'truco', 3: 'retruco' }[h.truco.nivel]]) out.push(TRUCO_SIG[{ 2: 'truco', 3: 'retruco' }[h.truco.nivel]]);
  if (canEnvido(g, i)) out.push('envido', 'real', 'falta');
  if (canFlor(g, i)) out.push('flor');
  out.push('mazo');
  return out;
}

function faltaPoints(g) { return Math.max(1, g.puntos - Math.max(...g.puntaje)); }

function act(me, d) {
  const g = games.get(String(d.id));
  if (!g) return { error: 'Esa partida ya no está.' };
  const i = seat(g, me);
  if (i < 0) return { error: 'No estás en esta partida.' };
  return doAct(g, i, d) || { ok: true };
}

function doAct(g, i, d) {
  const tipo = String(d.tipo || '');
  if (tipo === 'chat') {
    const text = String(d.texto || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 200);
    if (!text) return { error: 'Escribí algo.' };
    const now = Date.now();
    g.chatT = g.chatT || [0, 0];
    if (now - g.chatT[i] < 700) return { error: 'Más despacio.' };
    g.chatT[i] = now;
    g.chat = (g.chat || []).concat({ de: i, text, t: now }).slice(-60);
    push(g, false); return null;
  }
  if (tipo === 'grito') {
    const k = Number(d.grito);
    if (!(k >= 0 && k < GRITOS.length)) return { error: 'grito' };
    g.grito = { de: i, text: GRITOS[k], t: Date.now() };
    push(g, false); return null;
  }
  if (tipo === 'chicana') {
    const c = g.chicana;
    if (!c || c.para !== i || Date.now() > c.hasta) return { error: 'Ya pasó el momento.' };
    const text = CHICANAS[c.paso];
    g.grito = { de: i, text, t: Date.now() };
    note(g, `${nameOf(g.jugadores[i]).nombre}: ${text}`);
    abrirChicana(g, c.paso + 1, other(i));
    push(g, false); return null;
  }
  if (tipo === 'abandonar') {
    if (g.estado !== 'jugando') return { error: 'La partida no está en juego.' };
    note(g, `${nameOf(g.jugadores[i]).nombre} abandonó.`);
    finish(g, other(i), 'abandono'); push(g, true); return null;
  }
  if (tipo === 'revancha') {
    if (g.estado !== 'terminada') return { error: 'La partida no terminó.' };
    g.revancha[i] = true;
    if (g.compu || (g.revancha[0] && g.revancha[1])) return rematch(g);
    note(g, `${nameOf(g.jugadores[i]).nombre} quiere la revancha.`);
    push(g, false); return null;
  }
  if (g.estado !== 'jugando') return { error: 'La partida no está en juego.' };
  if (!allowed(g, i).includes(tipo)) return { error: 'Ahora no podés hacer eso.' };
  const h = g.h, o = other(i), name = nameOf(g.jugadores[i]).nombre;
  g.timeouts[i] = 0;

  if (tipo === 'jugar') {
    const k = Number(d.carta);
    if (!(k >= 0 && k < h.cartas[i].length)) return { error: 'Esa carta no está.' };
    const [c] = h.cartas[i].splice(k, 1);
    h.bazas[h.baza][i] = c;
    note(g, `${name} jugó el ${c.n} de ${c.p}.`);
    if (played(h, o, h.baza)) resolveBaza(g);
    else { h.turno = o; tick(g); }
    return null;
  }
  if (tipo === 'mazo') {
    note(g, `${name} se fue al mazo.`);
    // Si tenia un canto de truco por contestar, es como no quererlo
    const pts = h.truco.pend && h.truco.pend.para === i ? TRUCO_VAL[h.truco.pend.canto] - 1 : h.truco.nivel;
    if (!addPoints(g, o, pts, 'se fue al mazo')) newHand(g);
    push(g, true); return null;
  }
  if (TRUCO_VAL[tipo]) {
    h.truco.pend = { canto: tipo, de: i, para: o };
    note(g, `${name}: ${NOMBRE[tipo]}`);
    tick(g); return null;
  }
  if (tipo === 'envido' || tipo === 'real' || tipo === 'falta') {
    if (h.env.pend) { h.env.cantos.push(tipo); h.env.pend = { de: i, para: o }; }
    else {
      h.env.cantos = [tipo]; h.env.de = i; h.env.pend = { de: i, para: o };
      // "El envido está primero": el truco que le habian cantado se cae; si el otro lo
      // quiere, lo tiene que volver a cantar despues del envido
      if (h.truco.pend && h.truco.pend.para === i) h.truco.pend = null;
    }
    note(g, `${name}: ${NOMBRE[tipo]}`);
    tick(g); return null;
  }
  if (tipo === 'tanto' || tipo === 'buenas') {
    const c = h.env.canta, mano = g.manoDe;
    if (tipo === 'buenas') {
      note(g, `${name}: Son buenas.`);
      if (resolverTanto(g, mano)) { push(g, true); return null; }
      tick(g); return null;
    }
    const v = Number(d.valor);
    if (!tantoValido(v)) return { error: 'Ese tanto no existe.' };
    if (i === mano) { c.dicho[i] = v; c.turno = o; note(g, `${name}: Tengo ${v}.`); tick(g); return null; }
    if (v <= c.dicho[mano]) return { error: `Para ganar tenés que cantar más de ${c.dicho[mano]}.` };
    c.dicho[i] = v;
    note(g, `${name}: ${v} son mejores.`);
    if (resolverTanto(g, i)) { push(g, true); return null; }
    tick(g); return null;
  }
  if (tipo === 'ver') {
    h.env.ver = true;
    note(g, `${name}: ¡Las quiero ver en mesa!`);
    g.grito = { de: i, text: '¡Las quiero ver en mesa!', t: Date.now() };
    abrirChicana(g, 0, o);
    push(g, false); return null;
  }
  if (tipo === 'flor') {
    h.flor.cantada[i] = true; h.flor.hecho = true;
    h.env.pend = null; h.env.hecho = true; // la flor tapa el envido
    note(g, `${name}: ${NOMBRE.flor}`);
    const mine = h.cartas[i].concat(h.bazas[0][i] ? [h.bazas[0][i]] : []);
    const theirs = h.cartas[o].concat(h.bazas[0][o] ? [h.bazas[0][o]] : []);
    if (hasFlor(theirs)) {
      // Flor contra flor: gana la mas alta (empate: el que es mano) y se lleva 6
      const a = florVal(mine), b = florVal(theirs);
      const w = a > b ? i : b > a ? o : g.manoDe;
      note(g, `${nameOf(g.jugadores[o]).nombre} también tiene flor: ${a} contra ${b}.`);
      if (addPoints(g, w, 6, 'flor contra flor')) { push(g, true); return null; }
    } else if (addPoints(g, i, 3, 'flor')) { push(g, true); return null; }
    tick(g); return null;
  }
  if (tipo === 'quiero' || tipo === 'noquiero') {
    if (h.env.pend) {
      const cantos = h.env.cantos, caller = h.env.pend.de;
      h.env.pend = null; h.env.hecho = true;
      if (tipo === 'noquiero') {
        const prev = cantos.slice(0, -1).reduce((s, c) => s + (c === 'falta' ? faltaPoints(g) : ENV_VAL[c]), 0);
        note(g, `${name}: No quiero.`);
        if (addPoints(g, caller, Math.max(1, prev), 'envido no querido')) { push(g, true); return null; }
      } else {
        // Querido: ahora se canta el tanto, empezando por el mano
        h.env.pts = cantos.includes('falta') ? faltaPoints(g) : cantos.reduce((s, c) => s + ENV_VAL[c], 0);
        h.env.canta = { turno: g.manoDe, dicho: [null, null] };
        note(g, `${name}: ¡Quiero!`);
      }
      tick(g); return null;
    }
    if (h.truco.pend) {
      const p = h.truco.pend;
      h.truco.pend = null;
      if (tipo === 'noquiero') {
        note(g, `${name}: No quiero.`);
        if (!addPoints(g, p.de, TRUCO_VAL[p.canto] - 1, NOMBRE[p.canto].replace(/[¡!]/g, '') + ' no querido')) newHand(g);
        push(g, true); return null;
      }
      h.truco.nivel = TRUCO_VAL[p.canto];
      h.truco.quien = i; // el que quiso es el que puede subir
      note(g, `${name}: ¡Quiero!`);
      tick(g); return null;
    }
  }
  return { error: 'Ahora no podés hacer eso.' };
}

function resolveBaza(g) {
  const h = g.h, b = h.baza, c0 = h.bazas[b][0], c1 = h.bazas[b][1];
  const r0 = rank(c0), r1 = rank(c1);
  h.bazas[b].gana = r0 > r1 ? 0 : r1 > r0 ? 1 : 'parda';
  const res = h.bazas.slice(0, b + 1).map(x => x.gana);
  const w = handWinner(res, g.manoDe);
  if (w !== null) {
    note(g, `${nameOf(g.jugadores[w]).nombre} gana la mano.`);
    if (!addPoints(g, w, h.truco.nivel, h.truco.nivel > 1 ? NOMBRE[{ 2: 'truco', 3: 'retruco', 4: 'vale4' }[h.truco.nivel]].replace(/[¡!]/g, '').replace('Quiero ', '') : 'la mano')) {
      g.ultimaMano = { bazas: h.bazas.map(x => ({ 0: x[0], 1: x[1], gana: x.gana })) };
      newHand(g);
    }
    push(g, true);
    return;
  }
  h.baza = b + 1;
  h.turno = h.bazas[b].gana === 'parda' ? g.manoDe : h.bazas[b].gana;
  tick(g);
}

// Quien gana la mano con los resultados de las bazas (0, 1 o 'parda'); null si sigue
function handWinner(r, mano) {
  if (r.length < 2) return null;
  const [a, b, c] = r;
  if (r.length === 2) {
    if (a !== 'parda' && a === b) return a;
    if (a === 'parda' && b !== 'parda') return b;
    if (a !== 'parda' && b === 'parda') return a;
    return null;
  }
  if (c !== 'parda') return c;
  if (a !== 'parda') return a; // primera gana
  if (b !== 'parda') return b;
  return mano; // todo parda: gana el mano
}

function rematch(g) {
  const n = {
    id: crypto.randomBytes(5).toString('hex'), creado: Date.now(), puntos: g.puntos, flor: g.flor, libre: !!g.libre, publica: false, invitado: null, compu: g.compu,
    jugadores: g.jugadores.slice(), puntaje: [0, 0], manoDe: 0, manos: 0, estado: 'esperando', log: [], grito: null, revancha: [false, false], timeouts: [0, 0],
  };
  games.set(n.id, n);
  start(n);
  g.siguiente = n.id; push(g, true);
  changed();
  return { ok: true, id: n.id };
}

// ── Despues de cada cambio: guardar, avisar, el reloj y la compu ──
function tick(g) {
  g.deadline = g.estado === 'jugando' && !g.libre ? Date.now() + TURNO_MS : null;
  g.movido = Date.now();
  arm(g);
  push(g, false);
}

function arm(g) {
  clearTimeout(timers.get(g.id));
  if (g.estado !== 'jugando') return;
  const who = actor(g);
  if (g.jugadores[who] === BOT) { timers.set(g.id, setTimeout(() => botMove(g), 900 + crypto.randomInt(900) + Math.max(0, (g.pausa || 0) - Date.now()))); return; }
  if (g.libre) return; // sin limite: nadie juega por vos (sweep, a los 7 dias)
  timers.set(g.id, setTimeout(() => timeout(g), Math.max(1000, (g.deadline || Date.now()) - Date.now())));
}

// Se le termino el tiempo: un canto se toma como "no quiero"; si tenia que jugar, pierde la mano.
// Tres veces seguidas: abandona.
function timeout(g) {
  if (g.estado !== 'jugando') return;
  const i = actor(g);
  g.timeouts[i] = (g.timeouts[i] || 0) + 1;
  note(g, `⏰ A ${nameOf(g.jugadores[i]).nombre} se le terminó el tiempo.`);
  if (g.timeouts[i] >= 3) { finish(g, other(i), 'abandono'); push(g, true); return; }
  const n = g.timeouts[i];
  const a = allowed(g, i);
  // Cantando el tanto: el mano dice el suyo de verdad; el otro, son buenas
  const h = g.h, real = envido(h.cartas[i].concat(h.bazas[0][i] ? [h.bazas[0][i]] : []));
  doAct(g, i, a.includes('buenas') ? { tipo: 'buenas' } : a.includes('tanto') ? { tipo: 'tanto', valor: real } : { tipo: a.includes('noquiero') ? 'noquiero' : 'mazo' });
  g.timeouts[i] = n; // la jugada automatica no cuenta como que volvio
  save(g);
}

// La compu: juega razonable, sin ver tus cartas
function botMove(g) {
  if (g.estado !== 'jugando') return;
  const i = seat(g, BOT);
  if (i < 0 || actor(g) !== i) return;
  const h = g.h, a = allowed(g, i);
  const mine = h.cartas[i];
  const all = mine.concat(h.bazas[0][i] ? [h.bazas[0][i]] : []);
  const ev = envido(all), top = Math.max(...mine.map(rank), 0);
  const strong = mine.filter(c => rank(c) >= 10).length;
  // Si por algo la jugada no vale, al mazo (para que nunca se trabe)
  const pick = (t, extra) => {
    const r = doAct(g, i, { tipo: t, ...extra });
    if (r && r.error && t !== 'mazo') { const al = allowed(g, i); doAct(g, i, al.includes('buenas') ? { tipo: 'buenas' } : al.includes('tanto') ? { tipo: 'tanto', valor: ev } : { tipo: al.includes('noquiero') ? 'noquiero' : 'mazo' }); }
    return r;
  };
  // Cantar el tanto: casi siempre la verdad; a veces miente para arriba
  if (h.env.canta && h.env.canta.turno === i) {
    if (i === g.manoDe) return pick('tanto', { valor: ev < 26 && Math.random() < 0.22 ? 26 + crypto.randomInt(6) : ev });
    const dm = h.env.canta.dicho[g.manoDe];
    if (ev > dm) return pick('tanto', { valor: ev });
    if (dm < 31 && Math.random() < 0.15) return pick('tanto', { valor: dm < 20 ? 21 + crypto.randomInt(6) : dm + 1 + crypto.randomInt(Math.min(3, 33 - dm)) });
    return pick('buenas');
  }
  if (a.includes('flor')) return pick('flor');
  if (h.env.pend) {
    if (ev >= 30 && a.includes('falta') && Math.random() < 0.3) return pick('falta');
    if (ev >= 28 && a.includes('real') && Math.random() < 0.4) return pick('real');
    return pick(ev >= 26 || (ev >= 24 && Math.random() < 0.4) ? 'quiero' : 'noquiero');
  }
  if (h.truco.pend) {
    if (a.includes('envido') && ev >= 27) return pick(ev >= 31 ? 'real' : 'envido');
    const sig = TRUCO_SIG[h.truco.pend.canto];
    if (sig && a.includes(sig) && strong >= 2) return pick(sig);
    return pick(top >= 10 || strong >= 1 || Math.random() < 0.2 ? 'quiero' : 'noquiero');
  }
  if (a.includes('envido') && ev >= 27 && Math.random() < 0.85) return pick(ev >= 31 ? 'real' : 'envido');
  if (a.includes('truco') && (strong >= 2 || (top >= 12 && Math.random() < 0.6) || Math.random() < 0.08)) return pick('truco');
  if ((a.includes('retruco') || a.includes('vale4')) && strong >= 2 && Math.random() < 0.5) return pick(a.includes('retruco') ? 'retruco' : 'vale4');
  // Jugar: si el otro ya jugo, ganarle con la mas baja que alcance (o tirar la peor)
  const theirs = h.bazas[h.baza][other(i)];
  const order = mine.map((c, k) => ({ c, k, r: rank(c) })).sort((x, y) => x.r - y.r);
  let choice;
  if (theirs) {
    const beat = order.find(x => x.r > rank(theirs));
    choice = beat || order[0];
  } else {
    choice = h.baza === 0 ? order[Math.floor(order.length / 2)] : order[order.length - 1];
  }
  if (!a.includes('jugar')) return pick('mazo');
  return pick('jugar', { carta: choice.k });
}

// La partida como la ve el jugador i (sin las cartas del otro)
function view(g, me) {
  const i = seat(g, me);
  const pov = i >= 0 ? i : 0;
  const o = other(pov);
  const P = g.jugadores.map(nameOf);
  const out = {
    id: g.id, estado: g.estado, puntos: g.puntos, flor: g.flor, libre: !!g.libre, compu: g.compu, publica: g.publica,
    yo: P[pov] ? { ...P[pov], puntos: g.puntaje[pov] } : null, rival: P[o] ? { ...P[o], puntos: g.puntaje[o] } : null,
    invitado: g.invitado ? nameOf(g.invitado) : null, soyJugador: i >= 0, soyCreador: g.jugadores[0] === me,
    log: g.log.slice(-6).map(x => x.text), grito: g.grito && Date.now() - g.grito.t < 6000 ? { mio: g.grito.de === pov, text: g.grito.text } : null,
    gritos: GRITOS, ganador: g.estado === 'terminada' ? (g.ganador === pov ? 'yo' : 'rival') : null, motivo: g.motivo || null,
    revancha: g.estado === 'terminada' ? { yo: !!g.revancha[pov], rival: !!g.revancha[o] } : null, siguiente: g.siguiente || null,
    chat: (g.chat || []).map(x => ({ mio: x.de === pov, text: x.text, t: x.t })), manos: g.manos || 0,
  };
  if (g.estado === 'jugando' && g.h) {
    const h = g.h;
    const who = actor(g);
    out.mano = g.manoDe === pov;
    out.cartas = i >= 0 ? h.cartas[pov] : [];
    out.rivalCartas = h.cartas[o].length;
    out.bazas = h.bazas.map(b => ({ yo: b[pov] || null, rival: b[o] || null, gana: b.gana === undefined ? null : b.gana === 'parda' ? 'parda' : b.gana === pov ? 'yo' : 'rival' }));
    out.baza = h.baza;
    out.turno = who === pov ? 'yo' : 'rival';
    out.acciones = i >= 0 ? allowed(g, pov) : [];
    out.truco = h.truco.nivel;
    out.pendiente = h.env.pend ? { tipo: 'envido', canto: h.env.cantos[h.env.cantos.length - 1], cantos: h.env.cantos, de: h.env.pend.de === pov ? 'yo' : 'rival' }
      : h.truco.pend ? { tipo: 'truco', canto: h.truco.pend.canto, de: h.truco.pend.de === pov ? 'yo' : 'rival' } : null;
    const c = h.env.canta;
    if (c && c.turno != null) out.tanto = { turno: c.turno === pov ? 'yo' : 'rival', yo: c.dicho[pov], rival: c.dicho[o] };
    out.tantoVer = !!h.env.ver && !h.env.cerrado;
    out.miEnvido = i >= 0 ? envido(h.cartas[pov].concat(h.bazas[0][pov] ? [h.bazas[0][pov]] : [])) : null;
    out.deadline = g.deadline;
  }
  if (i >= 0 && g.chicana && g.chicana.para === pov && Date.now() < g.chicana.hasta) out.chicana = { text: CHICANAS[g.chicana.paso], ms: g.chicana.hasta - Date.now() };
  // Las cartas del tanto que se mostraron (un rato despues de mostrarlas)
  if (g.muestra && Date.now() - g.muestra.t < 20000) out.muestra = { ...g.muestra, de: g.muestra.de === pov ? 'yo' : 'rival' };
  return out;
}

// Manda el estado a los dos (cada uno con lo suyo) y, si hace falta, un aviso al celular
function push(g, big) {
  save(g);
  const ids = g.jugadores.filter(x => x !== BOT);
  for (const [, s] of io.sockets.sockets) {
    if (s.user && ids.includes(s.user.id)) { try { s.emit('truco:estado', view(g, s.user.id)); } catch { /* sesion cerrada */ } }
  }
  if (g.estado === 'jugando') notifyTurn(g);
  if (big) changed();
}

function notifyTurn(g) {
  if (!webpush) return;
  const uid = g.jugadores[actor(g)];
  if (uid === BOT) return;
  for (const [, s] of io.sockets.sockets) if (s.user && s.user.id === uid && s.hasFocus !== false) return; // la tiene abierta
  const key = g.id + ':' + uid;
  if (Date.now() - (pushed.get(key) || 0) < 3 * 60e3) return;
  pushed.set(key, Date.now());
  const rival = nameOf(g.jugadores[other(actor(g))]).nombre;
  const payload = JSON.stringify({ title: 'Truco', body: `Te toca contra ${rival}`, url: `/app?truco=${g.id}`, tag: 'truco-' + g.id, __puente: 1 });
  for (const sub of db.prepare('SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?').all(uid)) {
    webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, { TTL: g.libre ? 24 * 3600 : 600 }).catch(() => {});
  }
}

// La sala cambio (mesas nuevas, partidas que empiezan o terminan): que se actualice
let changeTimer = null;
function changed() {
  clearTimeout(changeTimer);
  changeTimer = setTimeout(() => { try { io.emit('truco:cambio', {}); } catch { /* sin conexiones */ } }, 300);
}

// ── Sala: mesas abiertas, tus partidas, ranking ──
function stats(userId) {
  const r = db.prepare(`SELECT SUM(CASE WHEN ganador = ? THEN 1 ELSE 0 END) g, COUNT(*) n FROM puente_truco_partidas
    WHERE compu = 0 AND (j1 = ? OR j2 = ?)`).get(userId, userId, userId);
  const c = db.prepare(`SELECT SUM(CASE WHEN ganador = ? THEN 1 ELSE 0 END) g, COUNT(*) n FROM puente_truco_partidas
    WHERE compu = 1 AND (j1 = ? OR j2 = ?)`).get(userId, userId, userId);
  return { ganadas: r.g || 0, perdidas: (r.n || 0) - (r.g || 0), compuGanadas: c.g || 0, compuPerdidas: (c.n || 0) - (c.g || 0) };
}

function ranking(since) {
  return db.prepare(`SELECT ganador id, COUNT(*) n FROM puente_truco_partidas WHERE compu = 0 AND ganador IS NOT NULL AND fin >= ?
    GROUP BY ganador ORDER BY n DESC LIMIT 10`).all(since).map(r => ({ ...nameOf(r.id), ganadas: r.n }));
}

function lobby(me) {
  const all = [...games.values()];
  const abiertas = all.filter(g => g.estado === 'esperando' && (g.publica || g.invitado === me) && !g.jugadores.includes(me))
    .sort((a, b) => b.creado - a.creado).slice(0, 30)
    .map(g => ({ id: g.id, puntos: g.puntos, flor: g.flor, libre: !!g.libre, creador: nameOf(g.jugadores[0]), paraVos: g.invitado === me }));
  const mias = all.filter(g => g.jugadores.includes(me) && (g.estado !== 'terminada' || Date.now() - g.fin < 10 * 60e3))
    .sort((a, b) => b.creado - a.creado)
    .map(g => {
      const i = seat(g, me), o = other(i);
      return {
        id: g.id, estado: g.estado, puntos: g.puntos, flor: g.flor, libre: !!g.libre, compu: g.compu, rival: g.jugadores[o] !== undefined ? nameOf(g.jugadores[o]) : null,
        invitado: g.invitado ? nameOf(g.invitado) : null, yo: g.puntaje[i], el: g.puntaje[o],
        teToca: g.estado === 'jugando' && actor(g) === i, ganaste: g.estado === 'terminada' ? g.ganador === i : null,
      };
    });
  const d = new Date();
  const mes = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) + 3 * 3600e3; // el mes en hora de Argentina
  return { abiertas, mias, stats: stats(me), ranking: { mes: ranking(mes), total: ranking(0) } };
}

module.exports = { setup, stats, _test: { rank, envido, hasFlor, florVal, handWinner, allowed, doAct, games, view, newHand, create, join, actor, botMove, sweep, BOT } };
