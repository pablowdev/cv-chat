// Atajos: cada persona arma su fila de accesos directos debajo de los iconos fijos de la columna de la
// izquierda (web/aviso.js). Son solo suyos y se guardan en su cuenta, asi los ve igual en la PC, el celular
// y la app.
//
//  GET  /puente/api/atajos            { atajos: [...], gente: { <juego>: n } }                 (sesion)
//  POST /puente/api/atajos { atajos } guarda la lista entera (hasta MAXIMO, sin repetidos)       (sesion)
//
// Un atajo es uno de estos (lo demas se descarta):
//   { tipo: 'juego', id }        un juego de la seccion Juegos (el id de su ficha)
//   { tipo: 'canal', code }      un canal del chat (el codigo de 8 letras de Haven)
//   { tipo: 'foro' } | { tipo: 'wiki' } | { tipo: 'mercado' } | { tipo: 'guardados' }   otras partes de la app
//
// gente: cuantas personas hay ahora en cada juego (las partidas y mesas de portada.js, la ciudad de Capa 2 y las
// salas de CV Hotel), solo de los juegos que esa persona puede ver. Se arma como mucho cada 15 segundos.

const MAXIMO = 8;
const PARTES = new Set(['foro', 'wiki', 'mercado', 'guardados']);
const ID = /^[a-z0-9-]{2,24}$/, CODIGO = /^[a-f0-9]{8}$/i;
let db = null, warn = () => {};

function setup(ctx) {
  ({ db, warn } = ctx);
  db.exec(`
    CREATE TABLE IF NOT EXISTS puente_atajos (
      user_id INTEGER PRIMARY KEY,
      lista TEXT NOT NULL,
      actualizado INTEGER NOT NULL
    );
  `);
}

// La lista limpia: solo lo conocido, sin repetidos y como mucho MAXIMO
function limpiar(l) {
  const out = [], vistos = new Set();
  for (const a of Array.isArray(l) ? l : []) {
    if (!a || typeof a !== 'object') continue;
    let x = null;
    if (a.tipo === 'juego' && ID.test(String(a.id || ''))) x = { tipo: 'juego', id: String(a.id) };
    else if (a.tipo === 'canal' && CODIGO.test(String(a.code || ''))) x = { tipo: 'canal', code: String(a.code).toLowerCase() };
    else if (PARTES.has(a.tipo)) x = { tipo: a.tipo };
    if (!x) continue;
    const k = x.tipo + ':' + (x.id || x.code || '');
    if (vistos.has(k)) continue;
    vistos.add(k); out.push(x);
    if (out.length >= MAXIMO) break;
  }
  return out;
}

function leer(userId) {
  try {
    const r = db.prepare('SELECT lista FROM puente_atajos WHERE user_id = ?').get(userId);
    return r ? limpiar(JSON.parse(r.lista)) : [];
  } catch { return []; }
}

// Cuantos hay en cada juego (cache corta, una para todos; Capa 2 y el hotel dependen de quien pregunta)
let mesasCache = { at: 0, d: {} };
function enMesas() {
  if (Date.now() - mesasCache.at < 15e3) return mesasCache.d;
  const d = {};
  try {
    const m = require('./portada.js').mesas(db, true);
    for (const x of [...(m.enJuego || []), ...(m.abiertas || [])]) {
      const n = (x.uids || []).length || (x.quienes || []).length || 1;
      d[x.juego] = (d[x.juego] || 0) + n;
    }
  } catch (err) { warn('atajos: mesas:', err.message); }
  mesasCache = { at: Date.now(), d };
  return d;
}
async function gente(userId) {
  const d = Object.assign({}, enMesas());
  try {
    const club = require('./club.js');
    if (club.veCiudad && club.veCiudad(db, userId)) { const c = await club.enLaCiudad(db); if (c && c.gente > 0) d.bacity = c.gente; }
  } catch (err) { warn('atajos: ciudad:', err.message); }
  try {
    let H = null; try { H = require('./hotel.js'); } catch { /* sin hotel */ }
    const a = H && typeof H.ahora === 'function' ? H.ahora(userId) : null;
    if (a && a.gente > 0) d.hotel = a.gente;
  } catch (err) { warn('atajos: hotel:', err.message); }
  return d;
}

async function handle(req, res, p, u, { sessionUser, json, readJson }) {
  if (p !== '/puente/api/atajos') return false;
  const user = sessionUser(req);
  if (!user) return json(res, 401, { error: 'sin sesion' });
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'GET') return json(res, 200, { atajos: leer(user.id), gente: await gente(user.id), maximo: MAXIMO });
  if (req.method === 'POST') {
    let body = null;
    try { body = await readJson(req); } catch { return json(res, 400, { error: 'pedido invalido' }); }
    const lista = limpiar(body && body.atajos);
    try { db.prepare('INSERT INTO puente_atajos (user_id, lista, actualizado) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET lista = excluded.lista, actualizado = excluded.actualizado').run(user.id, JSON.stringify(lista), Date.now()); }
    catch (err) { warn('atajos: guardar:', err.message); return json(res, 500, { error: 'no se pudo guardar' }); }
    return json(res, 200, { ok: true, atajos: lista });
  }
  return json(res, 405, { error: 'solo GET y POST' });
}

module.exports = { setup, handle, limpiar, MAXIMO };
