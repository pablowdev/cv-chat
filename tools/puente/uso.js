// Cuanto tiempo se usa CV Chat y en que (parte del puente), para las estadisticas de los administradores
// (panel-estadisticas.js) y la pagina "Miembros" (vincular.js).
//
// web/aviso.js cuenta, en cada pestaña abierta de CV Chat, los segundos que la persona la tiene a la
// vista y la esta usando (movio el mouse, toco o escribio en los ultimos 2 minutos), y cada minuto los
// manda juntos: cuantos en cada seccion (un canal, los mensajes privados, un juego, el Marketplace, el
// foro...) y si empezo una visita nueva (despues de 30 minutos sin usarlo). Solo se guarda el total por
// persona, dia y seccion: nada de lo que se escribe ni de lo que se lee.
//
//  POST /puente/api/uso   (sesion) { s: { <seccion>: segundos }, v: visitas nuevas }

const AR = 3 * 3600 * 1000; // Argentina, UTC-3
const hoyAR = () => new Date(Date.now() - AR).toISOString().slice(0, 10);
const SECCION = /^(c:\d{1,9}|dm|j:[a-z]{2,20}|mercado|foro|miembros|otros)$/;
const MAX_POR_ENVIO = 150; // un minuto de una pestaña (con margen); mas que eso no se cuenta
const MAX_DIA = 20 * 3600;

let db = null, warn = () => {};
let poner = null, cuantoHoy = null, activo = null;

function setup(ctx) {
  ({ db, warn } = ctx);
  db.exec(`
    CREATE TABLE IF NOT EXISTS puente_uso (
      dia TEXT NOT NULL, user_id INTEGER NOT NULL, seccion TEXT NOT NULL, seg INTEGER NOT NULL DEFAULT 0, visitas INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (dia, user_id, seccion)
    ) WITHOUT ROWID;
  `);
  poner = db.prepare(`INSERT INTO puente_uso (dia, user_id, seccion, seg, visitas) VALUES (?, ?, ?, ?, ?)
                      ON CONFLICT(dia, user_id, seccion) DO UPDATE SET seg = seg + excluded.seg, visitas = visitas + excluded.visitas`);
  cuantoHoy = db.prepare('SELECT COALESCE(SUM(seg), 0) n FROM puente_uso WHERE dia = ? AND user_id = ?');
  // quien uso CV Chat hoy cuenta como activo, aunque tenga la pestaña abierta desde otro dia
  activo = db.prepare('INSERT OR IGNORE INTO puente_activos (dia, user_id) VALUES (?, ?)');
}

async function handle(req, res, p, u, h) {
  if (p !== '/puente/api/uso') return false;
  if (req.method !== 'POST') return h.json(res, 405, { error: 'metodo' });
  const user = h.sessionUser(req);
  if (!user) return h.json(res, 401, { error: 'sin sesion' });
  const body = await h.readJson(req, 4000).catch(() => null);
  if (!body || typeof body !== 'object') return h.json(res, 400, { error: 'datos' });
  const dia = hoyAR();
  let lugar = Math.max(0, MAX_DIA - cuantoHoy.get(dia, user.id).n);
  let total = 0;
  const filas = [];
  for (const [k, v] of Object.entries(body.s || {}).slice(0, 12)) {
    const seg = Math.floor(Number(v));
    // (j:gusanos: el juego que WORGS reemplazo; una pestaña vieja abierta lo seguiria mandando)
    if (!SECCION.test(k) || k === 'j:gusanos' || !Number.isFinite(seg) || seg <= 0) continue;
    const n = Math.min(seg, MAX_POR_ENVIO - total, lugar);
    if (n <= 0) break;
    total += n; lugar -= n;
    filas.push([k, n]);
  }
  const visitas = Math.min(3, Math.max(0, Math.floor(Number(body.v) || 0)));
  try {
    db.transaction(() => {
      for (const [k, n] of filas) poner.run(dia, user.id, k, n, 0);
      if (visitas) poner.run(dia, user.id, filas.length ? filas[0][0] : 'otros', 0, visitas);
      if (total || visitas) activo.run(dia, user.id);
    })();
  } catch (err) { warn('uso:', err.message); }
  return h.json(res, 200, { ok: true });
}

// Para las estadisticas: tiempo y visitas entre dos dias (incluidos), por seccion y por persona
function entre(desde, hasta) {
  const porSeccion = new Map(), porPersona = new Map(), dias = new Map();
  let seg = 0, visitas = 0;
  for (const r of db.prepare('SELECT dia, user_id, seccion, seg, visitas FROM puente_uso WHERE dia >= ? AND dia <= ?').all(desde, hasta)) {
    seg += r.seg; visitas += r.visitas;
    porSeccion.set(r.seccion, (porSeccion.get(r.seccion) || 0) + r.seg);
    porPersona.set(r.user_id, (porPersona.get(r.user_id) || 0) + r.seg);
    if (r.seg) { const k = r.dia + '|' + r.user_id; dias.set(k, (dias.get(k) || 0) + r.seg); }
  }
  return { seg, visitas, porSeccion, porPersona, personaDias: dias.size };
}
// Desde cuando se mide (el primer dia con algo)
const medidoDesde = () => { try { return (db.prepare('SELECT MIN(dia) d FROM puente_uso').get() || {}).d || null; } catch { return null; } };
// Para "Miembros": minutos de cada persona en los ultimos 7 dias
function minutos7() {
  const desde = new Date(Date.now() - AR - 6 * 864e5).toISOString().slice(0, 10);
  try {
    return new Map(db.prepare('SELECT user_id, SUM(seg) s FROM puente_uso WHERE dia >= ? GROUP BY user_id').all(desde).map(r => [r.user_id, Math.round(r.s / 60)]));
  } catch { return new Map(); }
}

module.exports = { setup, handle, entre, medidoDesde, minutos7 };
