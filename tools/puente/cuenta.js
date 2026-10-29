// Cuenta unica: una sola sesion para la web, el chat y el foro.
//
// Quien entra al chat (con contraseña, Discord o el foro) recibe tambien una
// cookie "cv_cuenta" para todo el dominio (CUENTA_DOMINIO, por ejemplo
// circulovicioso.club): asi la web y el foro saben quien es, y el chat la usa
// para volver a entrar solo. La cookie es un numero al azar (HttpOnly); la
// sesion vive en puente_sesiones, vence a los 30 dias sin usarse y se corta si
// cambia la contraseña (password_version), si lo banean o al salir.
//
//  POST /puente/api/cuenta/sesion   (con la sesion del chat) da la cookie
//  GET  /puente/api/cuenta/yo       quien es (la web y el foro, con CORS)
//  POST /puente/api/cuenta/token    la sesion del chat a partir de la cookie (solo el chat)
//  POST /puente/api/cuenta/salir    corta la sesion (la web y el foro, con CORS); el chat sale
//                                   tambien la proxima vez que se abre (cookie cv_salio)
//  GET  /puente/cuenta/salir        corta la sesion, sale del foro y vuelve a ?volver=
//  GET  /puente/barra.js|css        la barra de arriba de la web y del foro (web/barra.*)
//  GET  /puente/api/cuenta/perfil   "Mi cuenta" en la web (circulovicioso.club/cuenta): quien es y que tiene vinculado
//  POST /puente/api/cuenta/conectar { con: 'discord' | 'foro', volver } -> { url } (y despues vuelve a "volver")
//  POST /puente/api/cuenta/desconectar { con }

const crypto = require('crypto');

const COOKIE = 'cv_cuenta';
const TTL_MS = 30 * 24 * 60 * 60 * 1000;

let db, log, warn, h, dominio = '', publicUrl = '', foroUrl = '';

function setup(ctx) {
  ({ db, log, warn, publicUrl, helpers: h } = ctx);
  foroUrl = String(process.env.FORO_URL || '').replace(/\/+$/, '');
  dominio = String(process.env.CUENTA_DOMINIO || '').replace(/^\.+/, '').toLowerCase();
  if (!dominio) {
    // chat.ejemplo.com -> ejemplo.com
    try { const parts = new URL(publicUrl).hostname.split('.'); if (parts.length >= 3) dominio = parts.slice(1).join('.'); } catch { /* sin dominio */ }
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS puente_sesiones (
      id TEXT PRIMARY KEY,
      haven_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      pwv INTEGER,
      creada INTEGER NOT NULL,
      vista INTEGER NOT NULL,
      vence INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_puente_sesiones_user ON puente_sesiones(haven_user_id);
  `);
  db.prepare('DELETE FROM puente_sesiones WHERE vence < ?').run(Date.now());
  if (dominio) log(`cuenta unica: lista para ${dominio}`);
}
const on = () => !!dominio;

// Las paginas propias que pueden preguntar quien es: la web (con y sin www), el foro y el chat
function origins() {
  const list = [`https://${dominio}`, `https://www.${dominio}`];
  if (foroUrl) list.push(new URL(foroUrl).origin);
  if (publicUrl) list.push(new URL(publicUrl).origin);
  return list;
}
// A donde se puede volver despues de entrar o salir: solo a las paginas propias
function safeReturn(url, fallback) {
  try {
    const u = new URL(String(url || ''));
    if (u.protocol === 'https:' && origins().includes(u.origin)) return u.href;
  } catch { /* no es una direccion */ }
  return fallback;
}
function cors(req, res) {
  const o = req.headers.origin;
  if (o && origins().includes(o)) {
    res.setHeader('Access-Control-Allow-Origin', o);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
  }
}

const hash = t => crypto.createHash('sha256').update(t).digest('hex');
function readCookie(req) {
  const m = String(req.headers.cookie || '').match(/(?:^|;\s*)cv_cuenta=([A-Za-z0-9_-]{20,100})/);
  return m ? m[1] : null;
}
function cookieHeader(value, maxAgeS) {
  return `${COOKIE}=${value}; Domain=${dominio}; Path=/; Max-Age=${maxAgeS}; HttpOnly; Secure; SameSite=Lax`;
}
function addCookie(res, value) {
  const prev = res.getHeader('Set-Cookie');
  res.setHeader('Set-Cookie', [...(prev ? [].concat(prev) : []), value]);
}
const pwvOf = id => { const u = db.prepare('SELECT password_version FROM users WHERE id = ?').get(id); return u ? (u.password_version || 1) : null; };
const banned = id => !!db.prepare('SELECT 1 FROM bans WHERE user_id = ?').get(id);

// Quien es, segun la cookie (null si no hay sesion valida). Renueva el vencimiento.
function userFromCookie(req) {
  if (!on()) return null;
  const c = readCookie(req);
  if (!c) return null;
  const s = db.prepare('SELECT id, haven_user_id, pwv, vence, vista FROM puente_sesiones WHERE id = ?').get(hash(c));
  if (!s) return null;
  const now = Date.now();
  if (s.vence < now || pwvOf(s.haven_user_id) !== s.pwv || banned(s.haven_user_id)) {
    db.prepare('DELETE FROM puente_sesiones WHERE id = ?').run(s.id);
    return null;
  }
  if (now - s.vista > 60 * 60 * 1000) db.prepare('UPDATE puente_sesiones SET vista = ?, vence = ? WHERE id = ?').run(now, now + TTL_MS, s.id);
  return db.prepare('SELECT id, username, display_name, avatar, is_admin FROM users WHERE id = ?').get(s.haven_user_id) || null;
}

// Abre la sesion de la cuenta (y cierra la anterior de este navegador)
function open(req, res, userId) {
  if (!on()) return;
  const old = readCookie(req);
  if (old) db.prepare('DELETE FROM puente_sesiones WHERE id = ?').run(hash(old));
  const value = crypto.randomBytes(32).toString('base64url');
  const now = Date.now();
  db.prepare('INSERT INTO puente_sesiones (id, haven_user_id, pwv, creada, vista, vence) VALUES (?, ?, ?, ?, ?, ?)')
    .run(hash(value), userId, pwvOf(userId), now, now, now + TTL_MS);
  addCookie(res, cookieHeader(value, TTL_MS / 1000));
  addCookie(res, saliHeader('', 0));
}
// "cv_salio" (la puede leer el chat): cuando se salio desde la web o el foro. El chat
// (aviso.js) cierra su sesion si es de antes de esa hora.
function saliHeader(value, maxAgeS) {
  return `cv_salio=${value}; Domain=${dominio}; Path=/; Max-Age=${maxAgeS}; Secure; SameSite=Lax`;
}
function close(req, res) {
  const c = readCookie(req);
  if (c) db.prepare('DELETE FROM puente_sesiones WHERE id = ?').run(hash(c));
  if (on()) { addCookie(res, cookieHeader('', 0)); addCookie(res, saliHeader(String(Math.floor(Date.now() / 1000)), 365 * 24 * 3600)); }
}

// Para la barra: cuantas conversaciones de mensajes directos tienen algo sin leer
function dmSinLeer(userId) {
  try {
    return db.prepare(`SELECT COUNT(*) n FROM channels c JOIN channel_members cm ON cm.channel_id = c.id AND cm.user_id = ?
      LEFT JOIN read_positions rp ON rp.user_id = cm.user_id AND rp.channel_id = c.id
      WHERE c.is_dm = 1 AND EXISTS (SELECT 1 FROM messages m WHERE m.channel_id = c.id AND m.id > COALESCE(rp.last_read_message_id, 0) AND COALESCE(m.user_id, 0) != cm.user_id)`).get(userId).n;
  } catch { return 0; }
}
// Para la barra de los administradores: propuestas de la wiki por revisar (wiki.js)
function wikiPendientes() {
  try { return db.prepare("SELECT COUNT(*) n FROM puente_wiki_rev WHERE estado = 'pendiente'").get().n; } catch { return 0; }
}
const absolute = p => (!p ? null : /^https?:\/\//.test(p) ? p : `${publicUrl}${p.startsWith('/') ? '' : '/'}${p}`);

async function handle(req, res, p, u) {
  const { json, send, sessionUser } = h;

  if (['/puente/api/cuenta/yo', '/puente/api/cuenta/salir', '/puente/api/cuenta/perfil', '/puente/api/cuenta/conectar', '/puente/api/cuenta/desconectar'].includes(p)) {
    cors(req, res);
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      return send(res, 204, 'text/plain', '');
    }
  }

  if (p === '/puente/api/cuenta/yo' && req.method === 'GET') {
    res.setHeader('Cache-Control', 'no-store');
    const user = userFromCookie(req);
    if (!user) return json(res, 200, { conectado: false, chat: publicUrl });
    const foro = db.prepare('SELECT foro_user_id FROM puente_foro WHERE haven_user_id = ?').get(user.id);
    return json(res, 200, {
      conectado: true, chat: publicUrl, id: user.id, usuario: user.username, nombre: user.display_name || user.username,
      avatar: absolute(user.avatar), admin: !!user.is_admin, foro: foro ? foro.foro_user_id : null,
      wikiPendientes: user.is_admin ? wikiPendientes() : 0,
      mensajes: dmSinLeer(user.id),
    });
  }

  // ── "Mi cuenta" en la web ──
  if (p === '/puente/api/cuenta/perfil' && req.method === 'GET') {
    res.setHeader('Cache-Control', 'no-store');
    const user = userFromCookie(req);
    if (!user) return json(res, 401, { error: 'sin sesion', chat: publicUrl });
    const em = h.email ? h.email(user.id) : {};
    return json(res, 200, {
      chat: publicUrl, usuario: user.username, nombre: user.display_name || user.username, avatar: absolute(user.avatar), admin: !!user.is_admin,
      email: em && em.email ? { confirmado: !!em.confirmado } : null,
      discord: h.discord.info(user.id), foro: h.foro.info(user.id),
      disponible: { discord: h.discord.on(), foro: h.foro.on() },
    });
  }
  if ((p === '/puente/api/cuenta/conectar' || p === '/puente/api/cuenta/desconectar') && req.method === 'POST') {
    // Solo desde las paginas propias, y en JSON: otra pagina no lo puede mandar
    if (!req.headers.origin || !origins().includes(req.headers.origin) || !/^application\/json/.test(String(req.headers['content-type'] || ''))) return json(res, 403, { error: 'no' });
    const user = userFromCookie(req);
    if (!user) return json(res, 401, { error: 'Iniciá sesión de nuevo.' });
    const body = await h.readJson(req) || {};
    const con = body.con === 'foro' ? 'foro' : body.con === 'discord' ? 'discord' : null;
    if (!con) return json(res, 400, { error: 'con' });
    if (p === '/puente/api/cuenta/desconectar') {
      if (con === 'discord') h.discord.unlink(user.id); else h.foro.unlink(user.id);
      return json(res, 200, { ok: true });
    }
    const volver = safeReturn(body.volver, `https://${dominio}/cuenta`);
    if (con === 'discord') {
      if (!h.discord.on()) return json(res, 503, { error: 'La vinculación con Discord no está disponible ahora.' });
      return json(res, 200, { url: h.discord.start(user.id, volver) });
    }
    if (!h.foro.on()) return json(res, 503, { error: 'La vinculación con el foro no está disponible ahora.' });
    return json(res, 200, { url: h.foro.start(res, 'vincular', user, volver) });
  }

  if (p === '/puente/api/cuenta/sesion' && req.method === 'POST') {
    const user = sessionUser(req);
    if (!user) return json(res, 401, { error: 'sin sesion' });
    if (!on()) return json(res, 200, { ok: false });
    const cur = userFromCookie(req);
    if (!cur || cur.id !== user.id) open(req, res, user.id);
    return json(res, 200, { ok: true });
  }

  if (p === '/puente/api/cuenta/token' && req.method === 'POST') {
    // Solo desde el chat mismo: la sesion del chat no sale a otras paginas
    if (req.headers.origin && req.headers.origin !== new URL(publicUrl).origin) return json(res, 403, { error: 'no' });
    const user = userFromCookie(req);
    if (!user) return json(res, 401, { error: 'sin sesion' });
    return json(res, 200, h.sessionFor(user.id));
  }

  if (p === '/puente/api/cuenta/salir' && req.method === 'POST') {
    close(req, res);
    return json(res, 200, { ok: true });
  }

  if (p === '/puente/cuenta/salir' && req.method === 'GET') {
    const user = userFromCookie(req);
    close(req, res);
    if (user) log(`salio de la cuenta unica: ${user.username} (Haven #${user.id})`);
    const volver = safeReturn(u.searchParams.get('volver'), `${publicUrl}/`);
    // Sale tambien del foro (cvchat.php) y de ahi vuelve
    const foroSalir = foroUrl && h.foroSalir ? h.foroSalir(volver) : null;
    return send(res, 302, 'text/plain', '', { Location: foroSalir || volver, 'Cache-Control': 'no-store' });
  }

  return false;
}

module.exports = { setup, handle, on, userFromCookie, open, close, safeReturn, allowedOrigin: o => origins().includes(o), dominio: () => dominio };
