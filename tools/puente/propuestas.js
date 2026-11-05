// Emojis y stickers propuestos por la gente (web/aviso.js: "Proponer" en el selector de emojis y en
// la pestaña "Propuestas" de Admin).
//  - Puede proponer quien tiene la cuenta hace 2 semanas y 50 mensajes escritos (los admins siempre;
//    los invitados nunca). Hasta 3 propuestas esperando por persona.
//  - La imagen (PNG, GIF, WebP o JPG, se mira por los primeros bytes): un emoji hasta max_emoji_kb
//    (lo mismo que /api/upload-emoji de Haven, 256 KB si no se cambio), un sticker hasta 512 KB.
//    Nombres como en Haven: [a-z0-9_-], emoji hasta 30 letras, sticker hasta 40. Ni repetidos con
//    los que ya hay ni con los que esperan; tampoco la misma imagen otra vez.
//  - Cada propuesta se avisa en #que-paso (JUEGOS_CANAL / FORO_CANAL, como juegos-aviso.js) con la
//    imagen, y se vota con 👍 o 👎 en ese mensaje (sin contar a quien la propuso). Queda "lista para
//    aprobar" con 5 👍 o mas y mas 👍 que 👎 dentro de las 72 horas: se avisa una vez a los admins.
//  - El admin aprueba (el emoji va a custom_emojis, el sticker a stickers, paquete "Del club", con
//    uploaded_by = quien lo propuso) o rechaza (con un motivo si quiere). Se avisa en el canal y a
//    quien lo propuso.
// La imagen que espera queda en /data/uploads/puente-propuestas (PUENTE_PROPUESTAS_DIR): asi Haven
// la dibuja en el aviso como cualquier imagen subida (/uploads/...). Al resolverse se borra (la
// aprobada queda copiada en /data/uploads o /data/uploads/stickers y el aviso pasa a mostrar esa).
//
//  GET  /puente/api/propuestas/estado              (sesion: si puede proponer, limites)
//  POST /puente/api/propuestas/proponer            { tipo: 'emoji'|'sticker', nombre, imagen: data:...;base64 }
//  GET  /puente/api/propuestas/admin?ver=todas     (admins; sin ver, solo las que esperan)
//  POST /puente/api/propuestas/aprobar             { id }            (admins)
//  POST /puente/api/propuestas/rechazar            { id, motivo? }   (admins)

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DIR = process.env.PUENTE_PROPUESTAS_DIR || '/data/uploads/puente-propuestas';
const URL_DIR = process.env.PUENTE_PROPUESTAS_URL || '/uploads/puente-propuestas/';
const UPLOADS = process.env.PUENTE_UPLOADS_DIR || '/data/uploads';
const STICKERS = process.env.PUENTE_STICKERS_DIR || path.join(UPLOADS, 'stickers');
const CANAL = () => String(process.env.JUEGOS_CANAL || process.env.FORO_CANAL || 'que-paso').trim().toLowerCase();
const QUIEN = 'Propuestas';
const DIAS_MIN = 14, MENSAJES_MIN = 50, MAX_PENDIENTES = 3;
const STICKER_KB = 512;
const VOTOS_MIN = 5, VENTANA = 72 * 3600e3, CADA = 2 * 60e3;
const PACK = 'Del club';

let db = null, io = null, log = () => {}, warn = () => {};

function setup(ctx) {
  ({ db, io, log = () => {}, warn = () => {} } = ctx);
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS puente_propuestas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo TEXT NOT NULL,
      nombre TEXT NOT NULL,
      archivo TEXT NOT NULL,
      hash TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      estado TEXT NOT NULL DEFAULT 'pendiente',
      motivo TEXT,
      mensaje_id INTEGER,
      lista_avisada INTEGER NOT NULL DEFAULT 0,
      creado INTEGER NOT NULL,
      resuelto INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_puente_propuestas_estado ON puente_propuestas(estado);
    CREATE INDEX IF NOT EXISTS idx_puente_propuestas_msg ON puente_propuestas(mensaje_id);`);
  } catch (err) { warn('propuestas: tabla:', err.message); return; }
  setInterval(revisarTodas, CADA).unref();
  setTimeout(revisarTodas, 30e3).unref();
}

// ── Ayudas ──
const sqlMs = (s) => Date.parse(String(s || '').replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(String(s || '')) ? '' : 'Z'));
const limpio = (t) => String(t || '').replace(/[*_~`|[\]\\]/g, '');
function usuario(id) {
  try { return db.prepare('SELECT id, username, display_name, is_admin, is_guest, created_at FROM users WHERE id = ?').get(id) || null; } catch (err) { warn('propuestas: usuario:', err.message); return null; }
}
const nombreDe = (u) => (u ? u.display_name || u.username : 'Alguien');
const esAdmin = (id) => { const u = usuario(id); return !!(u && u.is_admin); };
function maxEmojiKb() {
  try {
    const r = db.prepare("SELECT value FROM server_settings WHERE key = 'max_emoji_kb'").get();
    const n = Number(r && r.value);
    return n > 0 ? Math.min(n, 10240) : 256;
  } catch { return 256; }
}
const maxKb = (tipo) => (tipo === 'sticker' ? STICKER_KB : maxEmojiKb());

// Que imagen es, por los primeros bytes
function formato(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0x89 && buf.slice(1, 4).toString('latin1') === 'PNG' && buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a) return 'png';
  const g = buf.slice(0, 6).toString('latin1');
  if (g === 'GIF87a' || g === 'GIF89a') return 'gif';
  if (buf.slice(0, 4).toString('latin1') === 'RIFF' && buf.slice(8, 12).toString('latin1') === 'WEBP') return 'webp';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  return null;
}

// Nombre como en Haven: [a-z0-9_-]; emoji 2 a 30, sticker 2 a 40
function nombreValido(tipo, n) {
  const max = tipo === 'sticker' ? 40 : 30;
  const s = String(n || '').trim().toLowerCase();
  if (s.length < 2) return { error: 'El nombre tiene que tener al menos 2 letras.' };
  if (s.length > max) return { error: `El nombre puede tener hasta ${max} letras.` };
  if (!/^[a-z0-9_-]+$/.test(s)) return { error: 'El nombre solo puede tener letras sin tilde, números, _ y -.' };
  return { nombre: s };
}
function nombreOcupado(tipo, nombre) {
  try {
    const tabla = tipo === 'sticker' ? 'stickers' : 'custom_emojis';
    if (db.prepare(`SELECT 1 FROM ${tabla} WHERE name = ?`).get(nombre)) return true;
  } catch (err) { warn('propuestas: nombre:', err.message); }
  return !!db.prepare("SELECT 1 FROM puente_propuestas WHERE tipo = ? AND nombre = ? AND estado = 'pendiente'").get(tipo, nombre);
}

// Si puede proponer: { puede, motivo?, pendientes }
function estado(userId) {
  const u = usuario(userId);
  if (!u || u.is_guest) return { puede: false, motivo: 'Para proponer necesitás una cuenta.', pendientes: 0 };
  const pendientes = db.prepare("SELECT COUNT(*) n FROM puente_propuestas WHERE user_id = ? AND estado = 'pendiente'").get(userId).n;
  const base = { pendientes, maxPendientes: MAX_PENDIENTES, emojiKb: maxEmojiKb(), stickerKb: STICKER_KB, admin: !!u.is_admin };
  if (!u.is_admin) {
    const dias = Math.floor((Date.now() - sqlMs(u.created_at)) / 864e5);
    let mensajes = 0;
    try { mensajes = db.prepare('SELECT COUNT(*) n FROM (SELECT 1 FROM messages WHERE user_id = ? AND IFNULL(is_webhook, 0) = 0 LIMIT ?)').get(userId, MENSAJES_MIN).n; } catch (err) { warn('propuestas: mensajes:', err.message); }
    const falta = [];
    if (!(dias >= DIAS_MIN)) { const d = Number.isFinite(dias) ? DIAS_MIN - Math.max(0, dias) : DIAS_MIN; falta.push(d === 1 ? '1 día' : d + ' días'); }
    if (mensajes < MENSAJES_MIN) { const m = MENSAJES_MIN - mensajes; falta.push(m === 1 ? '1 mensaje' : m + ' mensajes'); }
    if (falta.length) return { ...base, puede: false, motivo: `Podés proponer cuando tu cuenta tenga 2 semanas y ${MENSAJES_MIN} mensajes (te faltan ${falta.join(' y ')}).` };
  }
  if (pendientes >= MAX_PENDIENTES) return { ...base, puede: false, motivo: `Ya tenés ${MAX_PENDIENTES} propuestas esperando. Cuando se resuelva alguna, podés mandar otra.` };
  return { ...base, puede: true };
}

// ── Avisos en el canal (como juegos-aviso.js) ──
function canal() {
  try { return db.prepare('SELECT id, code FROM channels WHERE LOWER(name) = ? AND is_dm = 0 ORDER BY id LIMIT 1').get(CANAL()) || null; } catch { return null; }
}
function avisar(content) {
  try {
    const ch = canal();
    if (!ch) { warn(`propuestas: no esta el canal #${CANAL()}`); return null; }
    const r = db.prepare('INSERT INTO messages (channel_id, user_id, content, is_webhook, webhook_username) VALUES (?, NULL, ?, 1, ?)').run(ch.id, content, QUIEN);
    io.to(`channel:${ch.code}`).emit('new-message', { channelCode: ch.code, message: {
      id: r.lastInsertRowid, content, created_at: new Date().toISOString(), username: QUIEN, user_id: null,
      is_webhook: 1, webhook_username: QUIEN, reactions: [], reply_to: null, replyContext: null, edited_at: null, thread: null } });
    return { id: Number(r.lastInsertRowid), code: ch.code };
  } catch (err) { warn(`propuestas: aviso en #${CANAL()}:`, err.message); return null; }
}
// Cambia el aviso de la propuesta: la imagen que esperaba ya no esta, y la votacion se cerro
const VOTAR = 'Votá con 👍 o 👎 en este mensaje (hay 72 horas).';
function editarAviso(p, buscar, poner, cierre) {
  try {
    if (!p.mensaje_id) return;
    const m = db.prepare('SELECT m.content, c.code FROM messages m JOIN channels c ON c.id = m.channel_id WHERE m.id = ?').get(p.mensaje_id);
    if (!m || !m.content.includes(buscar)) return;
    const content = m.content.split(buscar).join(poner).split(VOTAR).join(cierre);
    db.prepare("UPDATE messages SET content = ? WHERE id = ?").run(content, p.mensaje_id);
    io.to(`channel:${m.code}`).emit('message-edited', { channelCode: m.code, messageId: p.mensaje_id, content, editedAt: null, fromPuente: true });
  } catch (err) { warn('propuestas: editar aviso:', err.message); }
}
function enlaceAviso(p) {
  try {
    const m = p.mensaje_id && db.prepare('SELECT c.code FROM messages m JOIN channels c ON c.id = m.channel_id WHERE m.id = ?').get(p.mensaje_id);
    return m ? `/app?channel=${m.code}&message=${p.mensaje_id}` : '/app';
  } catch { return '/app'; }
}
function avisarA(userId, datos) {
  try { require('./avisos.js').avisarUsuario(userId, { ...datos, tag: 'puente-propuestas' }); } catch (err) { warn('propuestas: avisar:', err.message); }
}

// ── Proponer ──
function proponer(userId, body) {
  const e = estado(userId);
  if (!e.puede) return { status: 403, error: e.motivo };
  const tipo = body && body.tipo === 'sticker' ? 'sticker' : body && body.tipo === 'emoji' ? 'emoji' : null;
  if (!tipo) return { status: 400, error: 'Elegí si es un emoji o un sticker.' };
  const n = nombreValido(tipo, body.nombre);
  if (n.error) return { status: 400, error: n.error };
  const nombre = n.nombre;
  const m = /^data:[\w.+/-]*;base64,([A-Za-z0-9+/=\s]+)$/.exec(String(body.imagen || ''));
  if (!m) return { status: 400, error: 'Elegí la imagen.' };
  const buf = Buffer.from(m[1], 'base64');
  const ext = formato(buf);
  if (!ext) return { status: 400, error: 'La imagen tiene que ser PNG, GIF, WebP o JPG.' };
  const kb = maxKb(tipo);
  if (buf.length > kb * 1024) return { status: 400, error: `La imagen pesa ${Math.ceil(buf.length / 1024)} KB: ${tipo === 'sticker' ? 'un sticker' : 'un emoji'} puede pesar hasta ${kb} KB.` };
  if (nombreOcupado(tipo, nombre)) return { status: 409, error: `Ya hay ${tipo === 'sticker' ? 'un sticker' : 'un emoji'} con ese nombre (o uno esperando). Probá con otro.` };
  const hash = crypto.createHash('sha256').update(buf).digest('hex');
  if (db.prepare("SELECT 1 FROM puente_propuestas WHERE hash = ? AND estado IN ('pendiente', 'aprobada')").get(hash)) return { status: 409, error: 'Esa imagen ya se propuso.' };
  const archivo = `${userId}-${crypto.randomBytes(8).toString('hex')}.${ext}`;
  try {
    fs.mkdirSync(DIR, { recursive: true });
    fs.writeFileSync(path.join(DIR, archivo), buf);
  } catch (err) { warn('propuestas: guardar imagen:', err.message); return { status: 500, error: 'No se pudo guardar la imagen.' }; }
  let id;
  try {
    id = Number(db.prepare('INSERT INTO puente_propuestas (tipo, nombre, archivo, hash, user_id, creado) VALUES (?, ?, ?, ?, ?, ?)').run(tipo, nombre, archivo, hash, userId, Date.now()).lastInsertRowid);
  } catch (err) {
    warn('propuestas: guardar:', err.message);
    try { fs.unlinkSync(path.join(DIR, archivo)); } catch { /* ya no esta */ }
    return { status: 500, error: 'No se pudo guardar la propuesta.' };
  }
  const quien = limpio(nombreDe(usuario(userId)));
  const que = tipo === 'sticker' ? `un sticker nuevo: **${nombre}**` : `un emoji nuevo: **:${nombre}:**`;
  const aviso = avisar(`🎨 **${quien}** propuso ${que}\n${URL_DIR}${archivo}\n${VOTAR}`);
  if (aviso) { try { db.prepare('UPDATE puente_propuestas SET mensaje_id = ? WHERE id = ?').run(aviso.id, id); } catch (err) { warn('propuestas: mensaje:', err.message); } }
  log(`propuestas: #${id} ${tipo} "${nombre}" de #${userId}`);
  return { status: 200, ok: true, id, enlace: aviso ? `/app?channel=${aviso.code}&message=${aviso.id}` : null };
}

// ── Votos: las reacciones del aviso ──
function votos(p) {
  const out = { si: 0, no: 0 };
  if (!p.mensaje_id) return out;
  try {
    const si = new Set(), no = new Set();
    for (const r of db.prepare('SELECT user_id, emoji FROM reactions WHERE message_id = ? AND user_id != ?').all(p.mensaje_id, p.user_id)) {
      const e = String(r.emoji || '');
      // (con o sin tono de piel)
      if (e.startsWith('👍') || e === ':thumbsup:' || e === ':+1:') si.add(r.user_id);
      else if (e.startsWith('👎') || e === ':thumbsdown:' || e === ':-1:') no.add(r.user_id);
    }
    out.si = si.size; out.no = no.size;
  } catch (err) { warn('propuestas: votos:', err.message); }
  return out;
}
const enPlazo = (p) => Date.now() - p.creado <= VENTANA;
const esLista = (p, v) => !!p.lista_avisada || (enPlazo(p) && v.si >= VOTOS_MIN && v.si > v.no);

function revisar(p) {
  if (!p || p.estado !== 'pendiente' || p.lista_avisada || !enPlazo(p)) return;
  const v = votos(p);
  if (!esLista(p, v)) return;
  try {
    if (!db.prepare('UPDATE puente_propuestas SET lista_avisada = 1 WHERE id = ? AND lista_avisada = 0').run(p.id).changes) return;
    const admins = db.prepare('SELECT id FROM users WHERE is_admin = 1').all();
    for (const a of admins) avisarA(a.id, { title: 'Propuesta lista para aprobar', body: `${p.tipo === 'sticker' ? 'Sticker' : 'Emoji'} "${p.nombre}": ${v.si} 👍 y ${v.no} 👎. Está en Admin → Propuestas.`, url: enlaceAviso(p) });
    log(`propuestas: #${p.id} lista para aprobar (${v.si}/${v.no})`);
  } catch (err) { warn('propuestas: revisar:', err.message); }
}
function revisarTodas() {
  try {
    for (const p of db.prepare("SELECT * FROM puente_propuestas WHERE estado = 'pendiente' AND lista_avisada = 0 AND creado >= ?").all(Date.now() - VENTANA)) revisar(p);
  } catch (err) { warn('propuestas: revisar todas:', err.message); }
}
// Lo llama puente.js con cada 'reactions-updated' de Haven
function onReactions(messageId) {
  try {
    const p = db.prepare("SELECT * FROM puente_propuestas WHERE mensaje_id = ? AND estado = 'pendiente'").get(Number(messageId) || 0);
    if (p) revisar(p);
  } catch (err) { warn('propuestas: reacciones:', err.message); }
}

// ── Admin ──
function lista(ver) {
  const filas = ver === 'todas'
    ? db.prepare('SELECT * FROM puente_propuestas ORDER BY id DESC LIMIT 100').all()
    : db.prepare("SELECT * FROM puente_propuestas WHERE estado = 'pendiente' ORDER BY id").all();
  return filas.map(p => {
    const v = votos(p), u = usuario(p.user_id);
    return {
      id: p.id, tipo: p.tipo, nombre: p.nombre, estado: p.estado, motivo: p.motivo || null,
      imagen: p.estado === 'pendiente' ? URL_DIR + p.archivo : null,
      quien: { id: p.user_id, nombre: nombreDe(u), usuario: u ? u.username : null },
      creado: p.creado, resuelto: p.resuelto || null, si: v.si, no: v.no,
      lista: p.estado === 'pendiente' && esLista(p, v), enPlazo: enPlazo(p), enlace: enlaceAviso(p),
    };
  });
}
function pendiente(id) {
  const p = db.prepare('SELECT * FROM puente_propuestas WHERE id = ?').get(Number(id) || 0);
  if (!p) return { error: 'Esa propuesta ya no está.' };
  if (p.estado !== 'pendiente') return { error: 'Esa propuesta ya se resolvió.' };
  return { p };
}
function borrarPendiente(p) { try { fs.unlinkSync(path.join(DIR, p.archivo)); } catch { /* ya no esta */ } }

function aprobar(adminId, id) {
  const { p, error } = pendiente(id);
  if (error) return { status: 409, error };
  let ocupado = false;
  try { ocupado = !!db.prepare(`SELECT 1 FROM ${p.tipo === 'sticker' ? 'stickers' : 'custom_emojis'} WHERE name = ?`).get(p.nombre); } catch (err) { warn('propuestas: nombre:', err.message); }
  if (ocupado) {
    return { status: 409, error: `Ya existe ${p.tipo === 'sticker' ? 'un sticker' : 'un emoji'} "${p.nombre}". Rechazala o pedí otro nombre.` };
  }
  const ext = path.extname(p.archivo) || '.png';
  const destDir = p.tipo === 'sticker' ? STICKERS : UPLOADS;
  const final = `${p.tipo === 'sticker' ? 'sticker' : 'emoji'}-${p.nombre}-${crypto.randomBytes(4).toString('hex')}${ext}`;
  try {
    fs.mkdirSync(destDir, { recursive: true });
    fs.copyFileSync(path.join(DIR, p.archivo), path.join(destDir, final));
  } catch (err) { warn('propuestas: copiar:', err.message); return { status: 500, error: 'No se pudo copiar la imagen (¿se borró?).' }; }
  try {
    db.transaction(() => {
      if (!db.prepare("UPDATE puente_propuestas SET estado = 'aprobada', resuelto = ? WHERE id = ? AND estado = 'pendiente'").run(Date.now(), p.id).changes) throw new Error('ya resuelta');
      if (p.tipo === 'sticker') db.prepare('INSERT INTO stickers (name, pack_name, filename, uploaded_by) VALUES (?, ?, ?, ?)').run(p.nombre, PACK, final, p.user_id);
      else db.prepare('INSERT INTO custom_emojis (name, filename, uploaded_by) VALUES (?, ?, ?)').run(p.nombre, final, p.user_id);
    })();
  } catch (err) {
    warn('propuestas: aprobar:', err.message);
    try { fs.unlinkSync(path.join(destDir, final)); } catch { /* */ }
    return { status: 500, error: 'No se pudo aprobar.' };
  }
  try { io.emit('library-updated', { kind: p.tipo === 'sticker' ? 'stickers' : 'emojis' }); } catch { /* los clientes lo ven al recargar */ }
  editarAviso(p, URL_DIR + p.archivo, (p.tipo === 'sticker' ? '/uploads/stickers/' : '/uploads/') + final, '✅ Aprobado.');
  borrarPendiente(p);
  const quien = limpio(nombreDe(usuario(p.user_id)));
  avisar(p.tipo === 'sticker'
    ? `✅ Se aprobó el sticker **${p.nombre}** que propuso **${quien}**. Ya está en Stickers, en «${PACK}».`
    : `✅ Se aprobó el emoji :${p.nombre}: que propuso **${quien}**. Para usarlo escribí \`:${p.nombre}:\`.`);
  avisarA(p.user_id, { title: '¡Se aprobó tu propuesta!', body: p.tipo === 'sticker' ? `Tu sticker "${p.nombre}" ya está en Stickers.` : `Tu emoji :${p.nombre}: ya se puede usar.`, url: enlaceAviso(p) });
  log(`propuestas: #${p.id} aprobada por #${adminId}`);
  return { status: 200, ok: true };
}

function rechazar(adminId, id, motivo) {
  const { p, error } = pendiente(id);
  if (error) return { status: 409, error };
  const m = String(motivo || '').replace(/\s+/g, ' ').trim().slice(0, 300) || null;
  try {
    if (!db.prepare("UPDATE puente_propuestas SET estado = 'rechazada', motivo = ?, resuelto = ? WHERE id = ? AND estado = 'pendiente'").run(m, Date.now(), p.id).changes) return { status: 409, error: 'Esa propuesta ya se resolvió.' };
  } catch (err) { warn('propuestas: rechazar:', err.message); return { status: 500, error: 'No se pudo rechazar.' }; }
  editarAviso(p, URL_DIR + p.archivo, '*(esta propuesta no se aprobó)*', 'Votación cerrada.');
  borrarPendiente(p);
  avisar(`❌ No se aprobó ${p.tipo === 'sticker' ? 'el sticker' : 'el emoji'} **${p.nombre}**. ¡Gracias por proponer!`);
  avisarA(p.user_id, { title: 'Tu propuesta no se aprobó', body: `${p.tipo === 'sticker' ? 'El sticker' : 'El emoji'} "${p.nombre}" no se aprobó.${m ? ' Motivo: ' + m : ''}`, url: enlaceAviso(p) });
  log(`propuestas: #${p.id} rechazada por #${adminId}`);
  return { status: 200, ok: true };
}

// ── HTTP ──
async function handle(req, res, p, u, h) {
  if (!p.startsWith('/puente/api/propuestas/')) return false;
  if (!db) return h.json(res, 503, { error: 'No disponible.' });
  const user = h.sessionUser(req);
  if (!user) return h.json(res, 401, { error: 'sin sesion' });
  try {
    if (p === '/puente/api/propuestas/estado') {
      if (req.method !== 'GET') return h.json(res, 405, { error: 'metodo' });
      return h.json(res, 200, estado(user.id));
    }
    if (p === '/puente/api/propuestas/proponer') {
      if (req.method !== 'POST') return h.json(res, 405, { error: 'metodo' });
      // base64 ocupa 4/3: el limite mas grande, con margen
      const body = await h.readJson(req, Math.ceil(Math.max(maxEmojiKb(), STICKER_KB) * 1024 * 1.37) + 4096);
      if (!body) return h.json(res, 413, { error: 'La imagen es muy pesada.' });
      const r = proponer(user.id, body);
      return h.json(res, r.status, r.error ? { error: r.error } : { ok: true, id: r.id, enlace: r.enlace });
    }
    if (p === '/puente/api/propuestas/admin' || p === '/puente/api/propuestas/aprobar' || p === '/puente/api/propuestas/rechazar') {
      if (!esAdmin(user.id)) return h.json(res, 403, { error: 'Solo para administradores.' });
      if (p === '/puente/api/propuestas/admin') {
        if (req.method !== 'GET') return h.json(res, 405, { error: 'metodo' });
        return h.json(res, 200, { propuestas: lista(u.searchParams.get('ver')), votosMin: VOTOS_MIN });
      }
      if (req.method !== 'POST') return h.json(res, 405, { error: 'metodo' });
      const body = await h.readJson(req);
      if (!body) return h.json(res, 400, { error: 'Pedido inválido.' });
      const r = p.endsWith('/aprobar') ? aprobar(user.id, body.id) : rechazar(user.id, body.id, body.motivo);
      return h.json(res, r.status, r.error ? { error: r.error } : { ok: true });
    }
    return h.json(res, 404, { error: 'No existe.' });
  } catch (err) {
    warn('propuestas:', err.message);
    return h.json(res, 500, { error: 'No se pudo.' });
  }
}

module.exports = { setup, handle, onReactions, formato };
