// "Nitro gratis": color del nombre y banner de perfil (lo que en Discord es de
// Nitro). Tabla puente_perfil; web/aviso.js los muestra en los mensajes, la
// lista de miembros y la tarjeta de perfil, y tiene la ventana para elegirlos.
//
//  GET  /puente/api/perfil/todos            { "<id>": { c: "#rrggbb", b: "/uploads/..." } }
//  POST /puente/api/perfil/color   { color } ("#rrggbb", o null para sacarlo)
//  POST /puente/api/perfil/banner  { imagen } (data:image/...;base64, hasta 6 MB) o { quitar: true }
//
// El banner se guarda achicado (960x384, WebP; los GIF siguen animados) en
// /data/uploads/puente-banners. Los cambios llegan a todos al momento
// (evento "puente-perfil").

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

let db, io, log, warn, sharp = null;
const DIR = '/data/uploads/puente-banners';
const MAX_BYTES = 6 * 1024 * 1024;

function setup(ctx) {
  ({ db, io, log, warn } = ctx);
  db.exec(`CREATE TABLE IF NOT EXISTS puente_perfil (
    haven_user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    color TEXT,
    banner TEXT,
    updated INTEGER NOT NULL
  )`);
  try { sharp = require('./vendor/node_modules/sharp'); } catch { warn('perfil: sin sharp, no se pueden subir banners'); }
}

// Que se lea sobre el fondo oscuro: ni casi negro ni gris oscuro
function readable(hex) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b >= 0.06;
}

function all() {
  const out = {};
  for (const r of db.prepare('SELECT haven_user_id id, color c, banner b FROM puente_perfil').all()) {
    const v = {};
    if (r.c) v.c = r.c;
    if (r.b) v.b = r.b;
    if (v.c || v.b) out[r.id] = v;
  }
  return out;
}

function save(userId, fields) {
  const cur = db.prepare('SELECT color, banner FROM puente_perfil WHERE haven_user_id = ?').get(userId) || {};
  const next = { color: cur.color || null, banner: cur.banner || null, ...fields };
  db.prepare('INSERT OR REPLACE INTO puente_perfil (haven_user_id, color, banner, updated) VALUES (?, ?, ?, ?)').run(userId, next.color, next.banner, Date.now());
  if (io) io.emit('puente-perfil', { id: userId, c: next.color || null, b: next.banner || null });
  return next;
}

function removeFile(url) {
  if (!url || !url.startsWith('/uploads/puente-banners/')) return;
  const f = path.join(DIR, path.basename(url));
  fs.promises.unlink(f).catch(() => {});
}

async function handle(req, res, p, u, h) {
  if (p === '/puente/api/perfil/todos' && req.method === 'GET') {
    if (!h.sessionUser(req)) return h.json(res, 401, { error: 'sin sesion' });
    return h.json(res, 200, all());
  }
  if (p === '/puente/api/perfil/color' && req.method === 'POST') {
    const user = h.sessionUser(req);
    if (!user) return h.json(res, 401, { error: 'sin sesion' });
    const body = (await h.readJson(req)) || {};
    let color = body.color == null ? null : String(body.color).trim().toLowerCase();
    if (color !== null) {
      if (!/^#[0-9a-f]{6}$/.test(color)) return h.json(res, 400, { error: 'Color inválido.' });
      if (!readable(color)) return h.json(res, 400, { error: 'Ese color es muy oscuro: no se leería sobre el fondo.' });
    }
    save(user.id, { color });
    log(`perfil: ${user.username} ${color ? 'eligio el color ' + color : 'saco su color'}`);
    return h.json(res, 200, { ok: true, color });
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

module.exports = { setup, handle, all };
