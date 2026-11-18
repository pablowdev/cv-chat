// Los juegos de cada persona, para su tarjeta de perfil (web/aviso.js, debajo de sus mensajes): cuantas partidas
// jugo de cada juego y cuantas gano, de todos los juegos juntos (las partidas terminadas que cada juego le pasa al
// chat, juegos-registro.js conChat). Y la medalla que cruza juegos (logros.js): "Todoterreno", ganarle a otra
// persona en 3 juegos distintos.
//
//  GET /puente/api/perfil/juegos?u=ID   (sesion) -> { juegos: [{ id, nombre, partidas, ganadas }], total }
//
// Solo numeros: ni contra quien ni cuando. Se arma una vez para todos y se guarda 10 minutos.

const COMPU = -1;
const CACHE_MS = 10 * 60e3;
let warn = () => {};
let hecho = { at: 0, por: new Map(), nombres: new Map() };

function setup(ctx) { ({ warn } = ctx); }

function armar() {
  if (Date.now() - hecho.at < CACHE_MS) return hecho;
  const por = new Map(); // uid -> Map(juego -> { partidas, ganadas, ganadasAGente })
  const nombres = new Map();
  let js = [];
  try { js = require('./juegos-registro.js').conChat(); } catch (err) { warn('perfil juegos:', err.message); }
  for (const { ficha, chat } of js) {
    if (!chat.partidas) continue;
    let filas = [];
    try { filas = chat.partidas.leer() || []; } catch { continue; }
    for (const p of filas) {
      if (!p || !Array.isArray(p.humanos)) continue;
      const id = p.juego || ficha.id;
      if (!nombres.has(id)) nombres.set(id, ficha.nombre);
      const contraGente = p.humanos.length > 1;
      for (const h of new Set(p.humanos)) {
        if (!(h > 0)) continue;
        if (!por.has(h)) por.set(h, new Map());
        const m = por.get(h);
        if (!m.has(id)) m.set(id, { partidas: 0, ganadas: 0, ganadasAGente: 0 });
        const x = m.get(id);
        x.partidas++;
        if (p.ganador === h) { x.ganadas++; if (contraGente && p.ganador !== COMPU) x.ganadasAGente++; }
      }
    }
  }
  // (WORGS tiene dos modos con su propio id: el nombre de cada uno sale de las estadisticas de su ficha)
  try {
    for (const f of require('./juegos-registro.js').lista()) for (const e of f.estadisticas || []) if (e && e.id && e.nombre) nombres.set(e.id, e.nombre);
  } catch { /* sin registro */ }
  hecho = { at: Date.now(), por, nombres };
  return hecho;
}

function de(uid) {
  const { por, nombres } = armar();
  const m = por.get(Number(uid));
  if (!m) return { juegos: [], total: 0 };
  const juegos = [...m].map(([id, x]) => ({ id, nombre: nombres.get(id) || id, partidas: x.partidas, ganadas: x.ganadas, ganadasAGente: x.ganadasAGente }))
    .sort((a, b) => b.partidas - a.partidas || b.ganadas - a.ganadas);
  return { juegos, total: juegos.reduce((s, j) => s + j.partidas, 0) };
}

// Para logros.js: [[id, emoji, nombre, detalle]]
function insignias(uid) {
  const { juegos } = de(uid);
  const ganados = juegos.filter((j) => j.ganadasAGente > 0);
  if (ganados.length >= 3) return [['todoterreno', '🎲', 'Todoterreno', `Le ganó a otra persona en ${ganados.length} juegos distintos: ${ganados.map((j) => j.nombre).join(', ')}`]];
  return [];
}

async function handle(req, res, p, u, h) {
  if (p !== '/puente/api/perfil/juegos') return false;
  if (req.method !== 'GET') return h.json(res, 405, { error: 'metodo' });
  if (!h.sessionUser(req)) return h.json(res, 401, { error: 'sin sesion' });
  const id = Number(u.searchParams.get('u'));
  if (!(id > 0)) return h.json(res, 400, { error: 'falta u' });
  try {
    const r = de(id);
    return h.json(res, 200, { juegos: r.juegos.map(({ id: j, nombre, partidas, ganadas }) => ({ id: j, nombre, partidas, ganadas })), total: r.total });
  } catch (err) { warn('perfil juegos:', err.message); return h.json(res, 500, { error: 'No se pudo cargar.' }); }
}

module.exports = { setup, handle, de, insignias };
