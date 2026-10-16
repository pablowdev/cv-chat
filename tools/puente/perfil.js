// "Nitro gratis": el estilo del nombre (color, degradé y fuente), el tema del
// perfil (degradé de dos colores en la tarjeta) y el banner, lo que en Discord es
// de Nitro. Tabla puente_perfil; web/aviso.js los muestra (mensajes, lista de
// miembros, tarjeta de perfil) y los edita en "Editar perfil".
//
//  GET  /puente/api/perfil/todos   { "<id>": { c, c2, f, t1, t2, b } } (solo lo que cada uno eligio)
//  POST /puente/api/perfil/estilo  { color, color2, fuente, tema1, tema2 } (null = sin eso)
//  POST /puente/api/perfil/color   { color } (lo de antes: solo el color)
//  POST /puente/api/perfil/banner  { imagen } (data:image/...;base64, hasta 6 MB) o { quitar: true }
//  GET  /puente/fuentes/<nombre>.woff2   las fuentes de los nombres (tools/puente/vendor/fuentes)
//
// El banner se guarda achicado (960x384, WebP; los GIF siguen animados) en
// /data/uploads/puente-banners. Los cambios llegan a todos al momento
// (evento "puente-perfil").

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

let db, io, log, warn, sharp = null;
const DIR = '/data/uploads/puente-banners';
const FONTS_DIR = path.join(__dirname, 'vendor', 'fuentes');
const MAX_BYTES = 6 * 1024 * 1024;
// Las fuentes del nombre (como las de Discord). "pixel" es la VT323 que ya trae Haven.
const FONTS = new Set(['redondeada', 'manuscrita', 'moderna', 'medieval', 'pixel', 'terror', 'angosta']);
const COLS = ['color', 'color2', 'fuente', 'tema1', 'tema2', 'banner'];

function setup(ctx) {
  ({ db, io, log, warn } = ctx);
  db.exec(`CREATE TABLE IF NOT EXISTS puente_perfil (
    haven_user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    color TEXT,
    banner TEXT,
    updated INTEGER NOT NULL
  )`);
  const have = new Set(db.prepare("SELECT name FROM pragma_table_info('puente_perfil')").all().map(c => c.name));
  for (const c of ['color2', 'fuente', 'tema1', 'tema2']) if (!have.has(c)) db.exec(`ALTER TABLE puente_perfil ADD COLUMN ${c} TEXT`);
  try { sharp = require('./vendor/node_modules/sharp'); } catch { warn('perfil: sin sharp, no se pueden subir banners'); }
}

// Que se lea sobre el fondo oscuro: ni casi negro ni gris oscuro
function readable(hex) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b >= 0.06;
}
const isHex = v => typeof v === 'string' && /^#[0-9a-f]{6}$/.test(v);

function all() {
  const out = {};
  for (const r of db.prepare('SELECT haven_user_id id, color, color2, fuente, tema1, tema2, banner FROM puente_perfil').all()) {
    const v = {};
    if (r.color) v.c = r.color;
    if (r.color && r.color2) v.c2 = r.color2;
    if (r.fuente) v.f = r.fuente;
    if (r.tema1 && r.tema2) { v.t1 = r.tema1; v.t2 = r.tema2; }
    if (r.banner) v.b = r.banner;
    if (Object.keys(v).length) out[r.id] = v;
  }
  return out;
}

function save(userId, fields) {
  const cur = db.prepare('SELECT color, color2, fuente, tema1, tema2, banner FROM puente_perfil WHERE haven_user_id = ?').get(userId) || {};
  const next = {};
  for (const c of COLS) next[c] = c in fields ? fields[c] : (cur[c] || null);
  db.prepare('INSERT OR REPLACE INTO puente_perfil (haven_user_id, color, color2, fuente, tema1, tema2, banner, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(userId, next.color, next.color2, next.fuente, next.tema1, next.tema2, next.banner, Date.now());
  const v = all()[userId] || {};
  if (io) io.emit('puente-perfil', { id: userId, ...v });
  return v;
}

function removeFile(url) {
  if (!url || !url.startsWith('/uploads/puente-banners/')) return;
  fs.promises.unlink(path.join(DIR, path.basename(url))).catch(() => {});
}

// Valida lo que llega del editor: { campos } o { error }
function cleanStyle(body) {
  const out = {};
  const hex = k => { const v = body[k]; if (v == null || v === '') return null; const s = String(v).trim().toLowerCase(); return isHex(s) ? s : undefined; };
  for (const k of ['color', 'color2', 'tema1', 'tema2']) {
    if (!(k in body)) continue;
    const v = hex(k);
    if (v === undefined) return { error: 'Color inválido.' };
    out[k] = v;
  }
  for (const k of ['color', 'color2']) if (out[k] && !readable(out[k])) return { error: 'Ese color es muy oscuro: no se leería sobre el fondo.' };
  if ('fuente' in body) {
    const f = body.fuente == null || body.fuente === '' || body.fuente === 'normal' ? null : String(body.fuente);
    if (f && !FONTS.has(f)) return { error: 'Fuente inválida.' };
    out.fuente = f;
  }
  // Sin color no hay degradé; el tema va de a dos colores
  if ('color' in out && !out.color) out.color2 = null;
  if (('tema1' in out || 'tema2' in out) && !(out.tema1 && out.tema2)) { out.tema1 = null; out.tema2 = null; }
  return { fields: out };
}

async function handle(req, res, p, u, h) {
  if (p.startsWith('/puente/fuentes/') && req.method === 'GET') {
    const name = path.basename(p);
    if (!/^[a-z-]+\.woff2$/.test(name)) return h.json(res, 404, { error: 'no existe' });
    let data;
    try { data = await fs.promises.readFile(path.join(FONTS_DIR, name)); } catch { return h.json(res, 404, { error: 'no existe' }); }
    res.writeHead(200, { 'Content-Type': 'font/woff2', 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' });
    return res.end(data);
  }
  if (p === '/puente/api/perfil/todos' && req.method === 'GET') {
    if (!h.sessionUser(req)) return h.json(res, 401, { error: 'sin sesion' });
    return h.json(res, 200, all());
  }
  if ((p === '/puente/api/perfil/estilo' || p === '/puente/api/perfil/color') && req.method === 'POST') {
    const user = h.sessionUser(req);
    if (!user) return h.json(res, 401, { error: 'sin sesion' });
    const body = (await h.readJson(req)) || {};
    const c = cleanStyle(p.endsWith('/color') ? { color: body.color } : body);
    if (c.error) return h.json(res, 400, { error: c.error });
    const v = save(user.id, c.fields);
    log(`perfil: ${user.username} cambio su estilo`);
    return h.json(res, 200, { ok: true, perfil: v });
  }
  if (p === '/puente/api/perfil/banner' && req.method === 'POST') {
    const user = h.sessionUser(req);
    if (!user) return h.json(res, 401, { error: 'sin sesion' });
    const body = (await h.readJson(req, Math.ceil(MAX_BYTES * 1.4) + 1000)) || {};
    const cur = db.prepare('SELECT banner FROM puente_perfil WHERE haven_user_id = ?').get(user.id);
    if (body.quitar) {
      if (cur) removeFile(cur.banner);
      save(user.id, { banner: null });
      return h.json(res, 200, { ok: true, banner: null });
    }
    if (!sharp) return h.json(res, 503, { error: 'Todavía no se pueden subir banners en este servidor.' });
    const m = /^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/=]+)$/.exec(String(body.imagen || ''));
    if (!m) return h.json(res, 400, { error: 'La imagen tiene que ser PNG, JPG, WebP o GIF.' });
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length > MAX_BYTES) return h.json(res, 400, { error: 'La imagen es muy pesada (hasta 6 MB).' });
    let out;
    try {
      out = await sharp(buf, { animated: m[1] === 'gif' || m[1] === 'webp', limitInputPixels: 40e6 })
        .resize(960, 384, { fit: 'cover', position: 'attention' })
        .webp({ quality: 82, effort: 3 })
        .toBuffer();
    } catch { return h.json(res, 400, { error: 'No se pudo leer la imagen.' }); }
    await fs.promises.mkdir(DIR, { recursive: true });
    const name = `${user.id}-${crypto.randomBytes(6).toString('hex')}.webp`;
    await fs.promises.writeFile(path.join(DIR, name), out);
    if (cur) removeFile(cur.banner);
    const url = `/uploads/puente-banners/${name}`;
    save(user.id, { banner: url });
    log(`perfil: ${user.username} subio un banner (${Math.round(out.length / 1024)} KB)`);
    return h.json(res, 200, { ok: true, banner: url });
  }
  return false;
}

module.exports = { setup, handle, all, FONTS };
