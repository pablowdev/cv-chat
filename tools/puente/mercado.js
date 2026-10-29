// Marketplace (parte del puente): publicar cosas para vender, nuevas o usadas,
// y servicios, como el Marketplace de Facebook. Solo dentro de la app (no va a
// Discord). La app no cobra ni participa: compra, pago y entrega quedan entre
// las personas; aca solo estan las publicaciones, la conversacion (por mensaje
// directo, en la app) y la reputacion.
//
//  - Publicar: tipo (producto o servicio), titulo, descripcion, hasta 6 fotos,
//    precio en pesos, dolares o USDT (o "a convenir"), nuevo/usado y zona.
//    Solo cuentas con el email confirmado (y los admins). Duran 30 dias y se
//    renuevan con un toque.
//  - Reputacion atada a una venta de verdad: quien vende marca "Vendido a
//    @alguien", esa persona confirma que compro, y recien ahi los dos pueden
//    dejarse una opinion (👍 o 👎 y un comentario), una sola vez cada uno. Se
//    muestra todo: porcentaje, cantidades y comentarios.
//  - Guardados, denuncias (llegan al canal de admins, solo en la app) y, para
//    los admins, ocultar una publicacion.
//
// Las fotos se guardan achicadas (hasta 1280 px, WebP) en /data/uploads/puente-mercado.
//
// Con la compra/venta del foro ("tejemanejes", foro-mercado.js): los avisos del foro estan aca con su
// fecha (origen 'foro'; no vencen a los 30 dias) y lo que se publica aca sale tambien en el foro. Si quien
// lo publico en el foro no tiene cuenta unida, es del usuario discord-historial y se muestra con su
// nombre del foro (foro_autor) y "Ver en el foro" en vez de escribirle.
//
//  GET  /puente/api/mercado/lista?q&tipo&estado&moneda&min&max&zona&orden&ver=mias|guardados&desde
//  GET  /puente/api/mercado/item?id
//  POST /puente/api/mercado/foto        { imagen: data:image/...;base64 }  -> { foto }
//  POST /puente/api/mercado/publicar    { id?, tipo, estado, titulo, descripcion, precio, moneda, zona, fotos[] }
//  POST /puente/api/mercado/renovar     { id }
//  POST /puente/api/mercado/borrar      { id }
//  POST /puente/api/mercado/vendido     { id, comprador (id de cuenta) | fuera: true }
//  POST /puente/api/mercado/reactivar   { id }
//  POST /puente/api/mercado/confirmar   { venta, si }
//  POST /puente/api/mercado/opinar      { venta, positiva, comentario }
//  POST /puente/api/mercado/guardar     { id, si }
//  POST /puente/api/mercado/denunciar   { id, motivo }
//  POST /puente/api/mercado/ocultar     { id, si }            (admins)
//  GET  /puente/api/mercado/reputacion?u
//  GET  /puente/api/mercado/pendientes
//  GET  /puente/api/mercado/personas?q  (para elegir a quien se le vendio)

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DIR = '/data/uploads/puente-mercado';
const URL_DIR = '/uploads/puente-mercado/';
const DAY = 864e5;
const DURA = 30 * DAY;
const MAX_FOTOS = 6;
const MAX_BYTES = 12 * 1024 * 1024;
const MAX_ACTIVAS = 20, MAX_POR_DIA = 15;
const MONEDAS = new Set(['ARS', 'USD', 'USDT']);
const PAGE = 30;
const ADMIN_CHANNEL = () => process.env.AVISO_CANAL || 'admilinks';

let db, io, log, warn, sharp = null;

function setup(ctx) {
  ({ db, io, log, warn } = ctx);
  db.exec(`
    CREATE TABLE IF NOT EXISTS puente_mercado (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      tipo TEXT NOT NULL,
      condicion TEXT,
      titulo TEXT NOT NULL,
      descripcion TEXT NOT NULL DEFAULT '',
      precio REAL,
      moneda TEXT,
      zona TEXT,
      fotos TEXT NOT NULL DEFAULT '[]',
      creado INTEGER NOT NULL,
      renovado INTEGER NOT NULL,
      estado TEXT NOT NULL DEFAULT 'activa',
      oculta INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_puente_mercado_lista ON puente_mercado(estado, oculta, renovado);
    CREATE INDEX IF NOT EXISTS idx_puente_mercado_user ON puente_mercado(user_id);
    CREATE TABLE IF NOT EXISTS puente_mercado_fotos (
      nombre TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      creado INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS puente_mercado_ventas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL,
      vendedor_id INTEGER NOT NULL,
      comprador_id INTEGER NOT NULL,
      creado INTEGER NOT NULL,
      estado TEXT NOT NULL DEFAULT 'pendiente'
    );
    CREATE INDEX IF NOT EXISTS idx_puente_mercado_ventas_c ON puente_mercado_ventas(comprador_id, estado);
    CREATE TABLE IF NOT EXISTS puente_mercado_opiniones (
      venta_id INTEGER NOT NULL,
      de_id INTEGER NOT NULL,
      para_id INTEGER NOT NULL,
      rol TEXT NOT NULL,
      positiva INTEGER NOT NULL,
      comentario TEXT,
      creado INTEGER NOT NULL,
      PRIMARY KEY (venta_id, de_id)
    );
    CREATE INDEX IF NOT EXISTS idx_puente_mercado_op_para ON puente_mercado_opiniones(para_id);
    CREATE TABLE IF NOT EXISTS puente_mercado_guardados (
      user_id INTEGER NOT NULL,
      item_id INTEGER NOT NULL,
      PRIMARY KEY (user_id, item_id)
    );
    CREATE TABLE IF NOT EXISTS puente_mercado_denuncias (
      item_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      motivo TEXT,
      creado INTEGER NOT NULL,
      PRIMARY KEY (item_id, user_id)
    );
  `);
  // Con el foro (foro-mercado.js)
  const cols = new Set(db.prepare('PRAGMA table_info(puente_mercado)').all().map(c => c.name));
  for (const [c, t] of [['origen', "TEXT NOT NULL DEFAULT 'cv'"], ['foro_nodo', 'INTEGER'], ['foro_url', 'TEXT'], ['foro_autor', 'TEXT'], ['foro_hash', 'TEXT'], ['foro_editado', 'INTEGER']]) {
    if (!cols.has(c)) db.exec(`ALTER TABLE puente_mercado ADD COLUMN ${c} ${t}`);
  }
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_puente_mercado_foro ON puente_mercado(foro_nodo) WHERE foro_nodo IS NOT NULL');
  try { sharp = require('./vendor/node_modules/sharp'); } catch { warn('mercado: sin sharp, no se pueden subir fotos'); }
  // Fotos subidas que nunca se publicaron: afuera al dia
  setInterval(cleanup, 6 * 3600e3).unref();
  setTimeout(cleanup, 60e3).unref();
}

// ── Ayudas ──
const now = () => Date.now();
const clean = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, n);
const isAdmin = id => !!(db.prepare('SELECT is_admin FROM users WHERE id = ?').get(id) || {}).is_admin;
function canPublish(id) {
  if (isAdmin(id)) return true;
  try { return !!db.prepare('SELECT 1 FROM puente_emails WHERE haven_user_id = ? AND confirmado = 1').get(id); } catch { return false; }
}
const person = id => {
  const u = db.prepare("SELECT id, username, COALESCE(display_name, username) nombre, avatar FROM users WHERE id = ?").get(id);
  return u ? { id: u.id, usuario: u.username, nombre: u.nombre, avatar: u.avatar || null } : null;
};
const fotosOf = r => { try { return JSON.parse(r.fotos || '[]').filter(f => typeof f === 'string'); } catch { return []; } };
const vence = r => r.renovado + DURA;
const delForoSinCuenta = r => r.origen === 'foro' && r.foro_autor && (db.prepare('SELECT username FROM users WHERE id = ?').get(r.user_id) || {}).username === 'discord-historial';
// El aviso del foro: { url, autor, sinCuenta } (sinCuenta: quien lo publico no tiene cuenta en CV Chat)
const foroDe = r => (r.foro_url ? { url: r.foro_url, autor: r.foro_autor || null, sinCuenta: delForoSinCuenta(r) } : null);

function reputation(userId) {
  const rows = db.prepare('SELECT rol, positiva FROM puente_mercado_opiniones WHERE para_id = ?').all(userId);
  const pos = rows.filter(r => r.positiva).length, neg = rows.length - pos;
  const ventas = db.prepare("SELECT COUNT(*) n FROM puente_mercado_ventas WHERE vendedor_id = ? AND estado = 'confirmada'").get(userId).n;
  const compras = db.prepare("SELECT COUNT(*) n FROM puente_mercado_ventas WHERE comprador_id = ? AND estado = 'confirmada'").get(userId).n;
  return { positivas: pos, negativas: neg, porcentaje: rows.length ? Math.round(100 * pos / rows.length) : null, ventas, compras };
}

function card(r, me) {
  const f = fotosOf(r);
  const s = person(r.user_id);
  return {
    id: r.id, tipo: r.tipo, condicion: r.condicion, titulo: r.titulo, precio: r.precio, moneda: r.moneda, zona: r.zona,
    foto: f[0] ? URL_DIR + f[0] : null, creado: r.creado, renovado: r.renovado, vence: vence(r),
    estado: r.estado, oculta: !!r.oculta, vencida: r.origen !== 'foro' && vence(r) < now(), mia: r.user_id === me,
    vendedor: delForoSinCuenta(r) ? { id: null, nombre: r.foro_autor, avatar: null } : s ? { id: s.id, nombre: s.nombre, avatar: s.avatar } : null,
    foro: foroDe(r),
  };
}

function full(r, me) {
  const c = card(r, me);
  c.descripcion = r.descripcion;
  c.fotos = fotosOf(r).map(f => URL_DIR + f);
  if (!delForoSinCuenta(r)) {
    c.vendedor = person(r.user_id);
    if (c.vendedor) c.vendedor.reputacion = reputation(r.user_id);
  }
  c.guardada = !!db.prepare('SELECT 1 FROM puente_mercado_guardados WHERE user_id = ? AND item_id = ?').get(me, r.id);
  c.denunciada = !!db.prepare('SELECT 1 FROM puente_mercado_denuncias WHERE user_id = ? AND item_id = ?').get(me, r.id);
  if (c.mia || isAdmin(me)) c.denuncias = db.prepare('SELECT COUNT(*) n FROM puente_mercado_denuncias WHERE item_id = ?').get(r.id).n;
  const v = db.prepare("SELECT id, comprador_id, estado FROM puente_mercado_ventas WHERE item_id = ? AND estado != 'rechazada' ORDER BY id DESC LIMIT 1").get(r.id);
  if (v && (c.mia || v.comprador_id === me)) c.venta = { id: v.id, estado: v.estado, comprador: person(v.comprador_id) };
  return c;
}

function removeFiles(names) {
  for (const n of names) {
    if (!/^[\w-]+\.webp$/.test(n)) continue;
    fs.promises.unlink(path.join(DIR, n)).catch(() => {});
    db.prepare('DELETE FROM puente_mercado_fotos WHERE nombre = ?').run(n);
  }
}

function cleanup() {
  try {
    const used = new Set();
    for (const r of db.prepare("SELECT fotos FROM puente_mercado WHERE estado != 'borrada'").all()) for (const f of fotosOf(r)) used.add(f);
    const old = db.prepare('SELECT nombre FROM puente_mercado_fotos WHERE creado < ?').all(now() - DAY).map(r => r.nombre).filter(n => !used.has(n));
    if (old.length) { removeFiles(old); log(`mercado: ${old.length} fotos sin publicar borradas`); }
  } catch (err) { warn('mercado: limpieza:', err.message); }
}

// Aviso a una persona (si tiene la app abierta), para que se actualice el numerito
function ping(userId) {
  try { for (const [, s] of io.sockets.sockets) if (s.user && s.user.id === userId) s.emit('puente-mercado', { pendientes: pending(userId).total }); } catch { /* sin conexiones */ }
}

// Lo que la persona tiene que hacer: confirmar compras y opinar
function pending(me) {
  const confirmar = db.prepare(`SELECT v.id venta, v.item_id, m.titulo, v.vendedor_id FROM puente_mercado_ventas v JOIN puente_mercado m ON m.id = v.item_id
    WHERE v.comprador_id = ? AND v.estado = 'pendiente' ORDER BY v.id DESC`).all(me)
    .map(r => ({ venta: r.venta, item: r.item_id, titulo: r.titulo, otro: person(r.vendedor_id) }));
  const opinar = db.prepare(`SELECT v.id venta, v.item_id, m.titulo, v.vendedor_id, v.comprador_id FROM puente_mercado_ventas v JOIN puente_mercado m ON m.id = v.item_id
    WHERE v.estado = 'confirmada' AND (v.vendedor_id = ? OR v.comprador_id = ?)
      AND NOT EXISTS (SELECT 1 FROM puente_mercado_opiniones o WHERE o.venta_id = v.id AND o.de_id = ?) ORDER BY v.id DESC`).all(me, me, me)
    .map(r => ({ venta: r.venta, item: r.item_id, titulo: r.titulo, rol: r.vendedor_id === me ? 'vendedor' : 'comprador', otro: person(r.vendedor_id === me ? r.comprador_id : r.vendedor_id) }));
  return { confirmar, opinar, total: confirmar.length + opinar.length };
}

function adminNotice(text) {
  try {
    const ch = db.prepare('SELECT id, code FROM channels WHERE name = ? AND is_dm = 0').get(ADMIN_CHANNEL());
    if (!ch) return;
    const r = db.prepare('INSERT INTO messages (channel_id, user_id, content, is_webhook, webhook_username) VALUES (?, NULL, ?, 1, ?)').run(ch.id, text, 'Marketplace');
    io.to(`channel:${ch.code}`).emit('new-message', { channelCode: ch.code, message: {
      id: r.lastInsertRowid, content: text, created_at: new Date().toISOString(), username: 'Marketplace', user_id: null,
      is_webhook: 1, webhook_username: 'Marketplace', reactions: [], reply_to: null, replyContext: null, edited_at: null, thread: null } });
  } catch (err) { warn('mercado: aviso a admins:', err.message); }
}

function validate(body, me, existing) {
  const tipo = body.tipo === 'servicio' ? 'servicio' : 'producto';
  const titulo = clean(body.titulo, 80);
  if (titulo.length < 3) return { error: 'Poné un título (al menos 3 letras).' };
  const descripcion = clean(body.descripcion, 2000);
  let precio = null, moneda = null;
  if (body.precio !== null && body.precio !== undefined && body.precio !== '') {
    precio = Number(String(body.precio).replace(/\./g, '').replace(',', '.'));
    if (!Number.isFinite(precio) || precio < 0 || precio > 1e12) return { error: 'El precio no es válido.' };
    precio = Math.round(precio * 100) / 100;
    moneda = MONEDAS.has(body.moneda) ? body.moneda : 'ARS';
  }
  const condicion = tipo === 'producto' ? (body.condicion === 'nuevo' ? 'nuevo' : body.condicion === 'usado' ? 'usado' : null) : null;
  const zona = clean(body.zona, 60) || null;
  const fotos = (Array.isArray(body.fotos) ? body.fotos : []).map(String).filter(f => /^[\w-]+\.webp$/.test(f)).slice(0, MAX_FOTOS);
  const mine = new Set(existing ? fotosOf(existing) : []);
  const own = db.prepare('SELECT 1 FROM puente_mercado_fotos WHERE nombre = ? AND user_id = ?');
  for (const f of fotos) if (!mine.has(f) && !own.get(f, me)) return { error: 'Una de las fotos no es válida. Volvé a subirla.' };
  if (tipo === 'producto' && !fotos.length) return { error: 'Agregá al menos una foto.' };
  return { fields: { tipo, titulo, descripcion, precio, moneda, condicion, zona, fotos } };
}

// ── Pedidos ──
async function handle(req, res, p, u, h) {
  if (!p.startsWith('/puente/api/mercado/')) return false;
  const user = h.sessionUser(req);
  if (!user) return h.json(res, 401, { error: 'sin sesion' });
  const me = user.id;
  const body = req.method === 'POST' ? ((await h.readJson(req, p.endsWith('/foto') ? Math.ceil(MAX_BYTES * 1.4) + 1000 : 20000)) || {}) : {};
  const item = id => db.prepare("SELECT * FROM puente_mercado WHERE id = ? AND estado != 'borrada'").get(Number(id) || 0);
  const ownItem = id => { const r = item(id); return r && r.user_id === me ? r : null; };

  if (p === '/puente/api/mercado/lista' && req.method === 'GET') {
    const q = u.searchParams;
    const ver = q.get('ver');
    const cond = [], params = [];
    if (ver === 'mias') { cond.push("m.user_id = ? AND m.estado != 'borrada'"); params.push(me); }
    else {
      cond.push("m.estado = 'activa' AND (m.renovado >= ? OR m.origen = 'foro')"); params.push(now() - DURA);
      if (!isAdmin(me)) { cond.push('(m.oculta = 0 OR m.user_id = ?)'); params.push(me); }
      if (ver === 'guardados') { cond.push('m.id IN (SELECT item_id FROM puente_mercado_guardados WHERE user_id = ?)'); params.push(me); }
    }
    const vendedor = Number(q.get('u'));
    if (vendedor > 0) { cond.push('m.user_id = ?'); params.push(vendedor); }
    const text = clean(q.get('q'), 80);
    if (text) for (const w of text.split(/\s+/).slice(0, 6)) {
      const like = '%' + w.replace(/[\\%_]/g, c => '\\' + c) + '%';
      cond.push("(m.titulo LIKE ? ESCAPE '\\' OR m.descripcion LIKE ? ESCAPE '\\' OR m.zona LIKE ? ESCAPE '\\')"); params.push(like, like, like);
    }
    if (['producto', 'servicio'].includes(q.get('tipo'))) { cond.push('m.tipo = ?'); params.push(q.get('tipo')); }
    if (['nuevo', 'usado'].includes(q.get('condicion'))) { cond.push('m.condicion = ?'); params.push(q.get('condicion')); }
    const zona = clean(q.get('zona'), 60);
    if (zona) { cond.push("m.zona LIKE ? ESCAPE '\\'"); params.push('%' + zona.replace(/[\\%_]/g, c => '\\' + c) + '%'); }
    if (MONEDAS.has(q.get('moneda'))) {
      cond.push('m.moneda = ?'); params.push(q.get('moneda'));
      const min = Number(q.get('min')), max = Number(q.get('max'));
      if (q.get('min') && Number.isFinite(min)) { cond.push('m.precio >= ?'); params.push(min); }
      if (q.get('max') && Number.isFinite(max)) { cond.push('m.precio <= ?'); params.push(max); }
    }
    const order = q.get('orden') === 'barato' ? 'm.precio IS NULL, m.precio ASC' : q.get('orden') === 'caro' ? 'm.precio IS NULL, m.precio DESC' : 'm.renovado DESC';
    const desde = Math.max(0, Number(q.get('desde')) || 0);
    const rows = db.prepare(`SELECT m.* FROM puente_mercado m WHERE ${cond.join(' AND ')} ORDER BY ${order}, m.id DESC LIMIT ${PAGE + 1} OFFSET ?`).all(...params, desde);
    return h.json(res, 200, { items: rows.slice(0, PAGE).map(r => card(r, me)), mas: rows.length > PAGE, pendientes: pending(me).total, puedePublicar: canPublish(me) });
  }

  if (p === '/puente/api/mercado/item' && req.method === 'GET') {
    const r = item(u.searchParams.get('id'));
    if (!r || (r.oculta && r.user_id !== me && !isAdmin(me))) return h.json(res, 404, { error: 'Esa publicación ya no está.' });
    return h.json(res, 200, { item: full(r, me), admin: isAdmin(me) });
  }

  if (p === '/puente/api/mercado/foto' && req.method === 'POST') {
    if (!canPublish(me)) return h.json(res, 403, { error: 'Para publicar tenés que confirmar tu email.' });
    if (!sharp) return h.json(res, 503, { error: 'Todavía no se pueden subir fotos en este servidor.' });
    const m = /^data:image\/(png|jpeg|webp|gif|heic|heif|avif);base64,([A-Za-z0-9+/=]+)$/.exec(String(body.imagen || ''));
    if (!m) return h.json(res, 400, { error: 'La foto tiene que ser JPG, PNG o WebP.' });
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length > MAX_BYTES) return h.json(res, 400, { error: 'La foto es muy pesada (hasta 12 MB).' });
    const today = db.prepare('SELECT COUNT(*) n FROM puente_mercado_fotos WHERE user_id = ? AND creado > ?').get(me, now() - DAY).n;
    if (today >= 60 && !isAdmin(me)) return h.json(res, 429, { error: 'Subiste muchas fotos hoy. Probá mañana.' });
    let out;
    try {
      out = await sharp(buf, { limitInputPixels: 60e6 }).rotate()
        .resize(1280, 1280, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 80, effort: 3 }).toBuffer();
    } catch { return h.json(res, 400, { error: 'No se pudo leer la foto.' }); }
    await fs.promises.mkdir(DIR, { recursive: true });
    const name = `${me}-${crypto.randomBytes(8).toString('hex')}.webp`;
    await fs.promises.writeFile(path.join(DIR, name), out);
    db.prepare('INSERT INTO puente_mercado_fotos (nombre, user_id, creado) VALUES (?, ?, ?)').run(name, me, now());
    return h.json(res, 200, { foto: name, url: URL_DIR + name });
  }

  if (p === '/puente/api/mercado/publicar' && req.method === 'POST') {
    if (!canPublish(me)) return h.json(res, 403, { error: 'Para publicar tenés que confirmar tu email.' });
    const existing = body.id ? ownItem(body.id) : null;
    if (body.id && !existing) return h.json(res, 404, { error: 'Esa publicación no es tuya o ya no está.' });
    const v = validate(body, me, existing);
    if (v.error) return h.json(res, 400, { error: v.error });
    const f = v.fields;
    if (existing) {
      const gone = fotosOf(existing).filter(x => !f.fotos.includes(x));
      db.prepare('UPDATE puente_mercado SET tipo = ?, condicion = ?, titulo = ?, descripcion = ?, precio = ?, moneda = ?, zona = ?, fotos = ? WHERE id = ?')
        .run(f.tipo, f.condicion, f.titulo, f.descripcion, f.precio, f.moneda, f.zona, JSON.stringify(f.fotos), existing.id);
      removeFiles(gone);
      return h.json(res, 200, { ok: true, id: existing.id });
    }
    if (!isAdmin(me)) {
      const act = db.prepare("SELECT COUNT(*) n FROM puente_mercado WHERE user_id = ? AND estado = 'activa' AND renovado >= ?").get(me, now() - DURA).n;
      if (act >= MAX_ACTIVAS) return h.json(res, 429, { error: `Podés tener hasta ${MAX_ACTIVAS} publicaciones activas.` });
      const day = db.prepare('SELECT COUNT(*) n FROM puente_mercado WHERE user_id = ? AND creado > ?').get(me, now() - DAY).n;
      if (day >= MAX_POR_DIA) return h.json(res, 429, { error: 'Publicaste mucho hoy. Probá mañana.' });
    }
    const t = now();
    const r = db.prepare('INSERT INTO puente_mercado (user_id, tipo, condicion, titulo, descripcion, precio, moneda, zona, fotos, creado, renovado) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(me, f.tipo, f.condicion, f.titulo, f.descripcion, f.precio, f.moneda, f.zona, JSON.stringify(f.fotos), t, t);
    log(`mercado: ${user.username} publicó "${f.titulo}"`);
    return h.json(res, 200, { ok: true, id: r.lastInsertRowid });
  }

  if (p === '/puente/api/mercado/renovar' && req.method === 'POST') {
    const r = ownItem(body.id);
    if (!r) return h.json(res, 404, { error: 'Esa publicación no es tuya o ya no está.' });
    db.prepare("UPDATE puente_mercado SET renovado = ?, estado = CASE WHEN estado = 'vendida' THEN estado ELSE 'activa' END WHERE id = ?").run(now(), r.id);
    return h.json(res, 200, { ok: true });
  }

  if (p === '/puente/api/mercado/borrar' && req.method === 'POST') {
    const r = item(body.id);
    if (!r || (r.user_id !== me && !isAdmin(me))) return h.json(res, 404, { error: 'Esa publicación no es tuya o ya no está.' });
    // Se marca borrada (las ventas y opiniones siguen valiendo); las fotos se van
    db.prepare("UPDATE puente_mercado SET estado = 'borrada', fotos = '[]' WHERE id = ?").run(r.id);
    removeFiles(fotosOf(r));
    db.prepare('DELETE FROM puente_mercado_guardados WHERE item_id = ?').run(r.id);
    return h.json(res, 200, { ok: true });
  }

  if (p === '/puente/api/mercado/vendido' && req.method === 'POST') {
    const r = ownItem(body.id);
    if (!r) return h.json(res, 404, { error: 'Esa publicación no es tuya o ya no está.' });
    if (body.fuera) {
      db.prepare("UPDATE puente_mercado SET estado = 'vendida' WHERE id = ?").run(r.id);
      return h.json(res, 200, { ok: true });
    }
    const buyer = Number(body.comprador);
    if (!(buyer > 0) || buyer === me || !person(buyer)) return h.json(res, 400, { error: 'Elegí a quién se lo vendiste.' });
    if (db.prepare("SELECT 1 FROM puente_mercado_ventas WHERE item_id = ? AND comprador_id = ? AND estado != 'rechazada'").get(r.id, buyer)) {
      return h.json(res, 409, { error: 'Ya marcaste esta venta para esa persona.' });
    }
    // Un servicio se puede vender muchas veces: sigue activo. Un producto pasa a vendido.
    if (r.tipo === 'producto') db.prepare("UPDATE puente_mercado SET estado = 'vendida' WHERE id = ?").run(r.id);
    db.prepare('INSERT INTO puente_mercado_ventas (item_id, vendedor_id, comprador_id, creado) VALUES (?, ?, ?, ?)').run(r.id, me, buyer, now());
    ping(buyer);
    return h.json(res, 200, { ok: true });
  }

  if (p === '/puente/api/mercado/reactivar' && req.method === 'POST') {
    const r = ownItem(body.id);
    if (!r) return h.json(res, 404, { error: 'Esa publicación no es tuya o ya no está.' });
    db.prepare("UPDATE puente_mercado SET estado = 'activa', renovado = ? WHERE id = ?").run(now(), r.id);
    return h.json(res, 200, { ok: true });
  }

  if (p === '/puente/api/mercado/confirmar' && req.method === 'POST') {
    const v = db.prepare("SELECT * FROM puente_mercado_ventas WHERE id = ? AND comprador_id = ? AND estado = 'pendiente'").get(Number(body.venta) || 0, me);
    if (!v) return h.json(res, 404, { error: 'No hay nada para confirmar.' });
    db.prepare('UPDATE puente_mercado_ventas SET estado = ? WHERE id = ?').run(body.si ? 'confirmada' : 'rechazada', v.id);
    if (!body.si) {
      // Si no la compro, el producto vuelve a estar a la venta (si no hay otra venta confirmada)
      const other = db.prepare("SELECT 1 FROM puente_mercado_ventas WHERE item_id = ? AND estado = 'confirmada'").get(v.item_id);
      if (!other) db.prepare("UPDATE puente_mercado SET estado = 'activa' WHERE id = ? AND estado = 'vendida'").run(v.item_id);
    }
    ping(v.vendedor_id); ping(me);
    return h.json(res, 200, { ok: true });
  }

  if (p === '/puente/api/mercado/opinar' && req.method === 'POST') {
    const v = db.prepare("SELECT * FROM puente_mercado_ventas WHERE id = ? AND estado = 'confirmada' AND (vendedor_id = ? OR comprador_id = ?)").get(Number(body.venta) || 0, me, me);
    if (!v) return h.json(res, 404, { error: 'Solo se puede opinar sobre una venta confirmada.' });
    if (db.prepare('SELECT 1 FROM puente_mercado_opiniones WHERE venta_id = ? AND de_id = ?').get(v.id, me)) return h.json(res, 409, { error: 'Ya dejaste tu opinión.' });
    const para = v.vendedor_id === me ? v.comprador_id : v.vendedor_id;
    const rol = v.vendedor_id === me ? 'comprador' : 'vendedor'; // el rol de quien recibe la opinion
    db.prepare('INSERT INTO puente_mercado_opiniones (venta_id, de_id, para_id, rol, positiva, comentario, creado) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(v.id, me, para, rol, body.positiva ? 1 : 0, clean(body.comentario, 300) || null, now());
    ping(me);
    return h.json(res, 200, { ok: true });
  }

  if (p === '/puente/api/mercado/guardar' && req.method === 'POST') {
    const r = item(body.id);
    if (!r) return h.json(res, 404, { error: 'Esa publicación ya no está.' });
    if (body.si) db.prepare('INSERT OR IGNORE INTO puente_mercado_guardados (user_id, item_id) VALUES (?, ?)').run(me, r.id);
    else db.prepare('DELETE FROM puente_mercado_guardados WHERE user_id = ? AND item_id = ?').run(me, r.id);
    return h.json(res, 200, { ok: true });
  }

  if (p === '/puente/api/mercado/denunciar' && req.method === 'POST') {
    const r = item(body.id);
    if (!r) return h.json(res, 404, { error: 'Esa publicación ya no está.' });
    if (r.user_id === me) return h.json(res, 400, { error: 'No podés denunciar tu propia publicación.' });
    const motivo = clean(body.motivo, 300);
    const added = db.prepare('INSERT OR IGNORE INTO puente_mercado_denuncias (item_id, user_id, motivo, creado) VALUES (?, ?, ?, ?)').run(r.id, me, motivo || null, now()).changes;
    if (added) {
      const n = db.prepare('SELECT COUNT(*) n FROM puente_mercado_denuncias WHERE item_id = ?').get(r.id).n;
      const s = person(r.user_id);
      adminNotice(`🚩 **Denuncia en el Marketplace** (${n} en total): "${r.titulo}" de ${s ? s.nombre : 'alguien'}` +
        (motivo ? `\n> ${motivo.replace(/\n/g, ' ')}` : '') + `\nRevisala desde el Marketplace (como admin podés ocultarla o borrarla).`);
    }
    return h.json(res, 200, { ok: true });
  }

  if (p === '/puente/api/mercado/ocultar' && req.method === 'POST') {
    if (!isAdmin(me)) return h.json(res, 403, { error: 'Solo administradores.' });
    const r = item(body.id);
    if (!r) return h.json(res, 404, { error: 'Esa publicación ya no está.' });
    db.prepare('UPDATE puente_mercado SET oculta = ? WHERE id = ?').run(body.si ? 1 : 0, r.id);
    log(`mercado: ${user.username} ${body.si ? 'ocultó' : 'mostró'} "${r.titulo}"`);
    return h.json(res, 200, { ok: true });
  }

  if (p === '/puente/api/mercado/reputacion' && req.method === 'GET') {
    const id = Number(u.searchParams.get('u'));
    const who = id > 0 && person(id);
    if (!who) return h.json(res, 404, { error: 'No existe.' });
    const opiniones = db.prepare('SELECT o.*, m.titulo FROM puente_mercado_opiniones o JOIN puente_mercado_ventas v ON v.id = o.venta_id JOIN puente_mercado m ON m.id = v.item_id WHERE o.para_id = ? ORDER BY o.creado DESC LIMIT 50').all(id)
      .map(o => ({ positiva: !!o.positiva, comentario: o.comentario, rol: o.rol, creado: o.creado, titulo: o.titulo, de: person(o.de_id) }));
    return h.json(res, 200, { persona: who, reputacion: reputation(id), opiniones });
  }

  if (p === '/puente/api/mercado/pendientes' && req.method === 'GET') return h.json(res, 200, pending(me));

  if (p === '/puente/api/mercado/personas' && req.method === 'GET') {
    const q = clean(u.searchParams.get('q'), 40);
    if (q.length < 2) return h.json(res, 200, { personas: [] });
    const like = '%' + q.replace(/[\\%_]/g, c => '\\' + c) + '%';
    const rows = db.prepare(`SELECT id FROM users WHERE id != ? AND username != 'discord-historial' AND COALESCE(is_guest, 0) = 0
      AND (username LIKE ? ESCAPE '\\' OR display_name LIKE ? ESCAPE '\\') ORDER BY username COLLATE NOCASE LIMIT 10`).all(me, like, like);
    return h.json(res, 200, { personas: rows.map(r => person(r.id)) });
  }

  return h.json(res, 404, { error: 'no existe' });
}

// Para la tarjeta de perfil (logros.js): la reputacion y la medalla
// Guardar una foto (la de un aviso del foro): achicada a WebP como las que se suben aca
async function guardarFoto(buf, userId) {
  if (!sharp) throw new Error('sin sharp');
  const out = await sharp(buf, { limitInputPixels: 60e6 }).rotate()
    .resize(1280, 1280, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 80, effort: 3 }).toBuffer();
  await fs.promises.mkdir(DIR, { recursive: true });
  const name = `${userId}-${crypto.randomBytes(8).toString('hex')}.webp`;
  await fs.promises.writeFile(path.join(DIR, name), out);
  db.prepare('INSERT INTO puente_mercado_fotos (nombre, user_id, creado) VALUES (?, ?, ?)').run(name, userId, now());
  return name;
}

function summary(userId) {
  try { return reputation(userId); } catch { return null; }
}

module.exports = { guardarFoto, URL_DIR, setup, handle, summary };
