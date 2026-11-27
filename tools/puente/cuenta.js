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
//  GET  /puente/api/cuenta/avisos   la campanita (campana.js); POST .../avisos/leer las marca vistas
//  GET  /puente/api/cuenta/monedas  las monedas del club en la barra de la web y del foro (monedas.js mias: saldo y movimientos)
//  GET  /puente/cuenta/autorizar?app=hotel|capa2//  GET  /puente/cuenta/autorizar?app=hotel&volver=/...   "Entrar con CV Chat" desde otra pagina propia (CV Hotel envolver=/...   "Entrar con CV Chat" desde otra pagina propia (CV Hotel en
//       hotel.<dominio>, Capa 2 en capa2.<dominio>): en el chat, "¿Entrar a CV Hotel como X?". Con "Sí, entrar" (POST, solo desde el chat) vuelve
//       a esa pagina con #cvcodigo=<codigo> (sirve una vez, un minuto); sin la sesion de la cuenta, vuelve con #cvsin=1
//  POST /puente/api/cuenta/canje { codigo }   (solo desde la pagina de ese codigo) -> la sesion del chat { token, user }

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

// Las paginas propias que pueden preguntar quien es: la web (con y sin www), el Marketplace, el foro y el chat
function origins() {
  const list = [`https://${dominio}`, `https://www.${dominio}`, `https://marketplace.${dominio}`];
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
// El saldo para la barra (null si no se muestra: invitados, o antes del lanzamiento a quien no es admin)
function saldoVisible(uid) {
  try { const m = require('./monedas.js').mias(uid); return m.visible ? m.saldo : null; } catch { return null; }
}

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

// ── "Entrar con CV Chat" desde otra pagina propia ──
// La sesion del chat no sale sola a otras paginas (/token es solo del chat): la persona lo confirma en una pagina del
// chat (que no se puede meter adentro de otra: frame-ancestors 'none'), y la otra pagina recibe un codigo de un solo uso
// que cambia por la sesion (canje), solo desde su propio origen.
const APPS = {
  hotel: { nombre: 'CV Hotel', sub: 'hotel' },
  capa2: { nombre: 'Capa 2', sub: 'capa2' },
  cs16: { nombre: 'Counter-Strike 1.6', sub: 'cs' },
  hanzi: { nombre: 'Hanzi Quest', sub: 'hanzi' },
};
const origenApp = (a) => `https://${APPS[a].sub}.${dominio}`;
const permisos = new Map(), codigos = new Map(); // nonce del boton -> { uid, app, volver, vence }; codigo -> { uid, app, vence }
function podar(m) { const t = Date.now(); for (const [k, v] of m) if (v.vence < t) m.delete(k); while (m.size > 5000) m.delete(m.keys().next().value); }
const volverLimpio = (v) => { v = String(v || '/'); return /^\/(?!\/)[A-Za-z0-9\-._~/?=&%]{0,200}$/.test(v) ? v : '/'; };
const escHtml = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function leerForm(req) {
  return new Promise((ok) => {
    let b = '';
    req.on('data', (c) => { b += c; if (b.length > 4000) { b = ''; req.destroy(); } });
    req.on('end', () => ok(new URLSearchParams(b)));
    req.on('error', () => ok(new URLSearchParams()));
  });
}
function paginaAutorizar(res, app, user, nonce) {
  const a = APPS[app];
  const nombre = escHtml(user.display_name || user.username);
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Entrar a ${a.nombre} · CV Chat</title><style>
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#1e1f22;color:#dbdee1;font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;padding:16px;box-sizing:border-box}
.c{background:#2b2d31;border-radius:12px;padding:28px 24px;max-width:380px;width:100%;text-align:center;box-shadow:0 8px 30px rgba(0,0,0,.4)}
h1{font-size:20px;margin:0 0 8px;color:#fff}p{margin:0 0 20px;color:#b5bac1}b{color:#fff}
button{display:block;width:100%;border:0;border-radius:8px;padding:12px;font:600 15px system-ui,sans-serif;cursor:pointer;margin-top:10px}
.si{background:#5865f2;color:#fff}.si:hover{background:#4752c4}.no{background:transparent;color:#b5bac1}.no:hover{text-decoration:underline}
</style></head><body><form class="c" method="post" action="/puente/cuenta/autorizar">
<h1>Entrar a ${a.nombre}</h1><p>Vas a entrar a ${a.nombre} con tu cuenta de CV Chat: <b>${nombre}</b>.</p>
<input type="hidden" name="n" value="${nonce}">
<button class="si" type="submit" name="ok" value="1">Sí, entrar</button>
<button class="no" type="submit" name="ok" value="0">No, volver</button>
</form></body></html>`;
  return h.send(res, 200, 'text/html; charset=utf-8', html, {
    'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'same-origin',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self' https:; frame-ancestors 'none'; base-uri 'none'",
  });
}
async function autorizar(req, res, u) {
  const { json, send } = h;
  if (!on()) return json(res, 404, { error: 'no' });
  if (req.method === 'GET') {
    const app = u.searchParams.get('app');
    if (!Object.prototype.hasOwnProperty.call(APPS, app)) return send(res, 404, 'text/plain; charset=utf-8', 'No está.');
    const volver = volverLimpio(u.searchParams.get('volver'));
    const user = userFromCookie(req);
    // sin la sesion de la cuenta en este navegador: vuelve y entra con su usuario
    if (!user) return send(res, 302, 'text/plain', '', { Location: origenApp(app) + volver + '#cvsin=1', 'Cache-Control': 'no-store' });
    podar(permisos);
    const nonce = crypto.randomBytes(24).toString('base64url');
    permisos.set(nonce, { uid: user.id, app, volver, vence: Date.now() + 10 * 60e3 });
    return paginaAutorizar(res, app, user, nonce);
  }
  if (req.method !== 'POST') return json(res, 405, { error: 'metodo' });
  // Solo el boton de la pagina del chat (otra pagina, aunque sea del mismo dominio, no lo puede mandar). La pagina va con
  // Referrer-Policy same-origin: con no-referrer el navegador manda Origin: null y no pasaria
  if (req.headers.origin !== new URL(publicUrl).origin) return json(res, 403, { error: 'no' });
  const f = await leerForm(req);
  const n = String(f.get('n') || '');
  const p = permisos.get(n);
  if (p) permisos.delete(n);
  const user = userFromCookie(req);
  if (!p || p.vence < Date.now() || !user || user.id !== p.uid) return send(res, 400, 'text/plain; charset=utf-8', 'Se venció: volvé a la página y tocá "Entrar con CV Chat" de nuevo.', { 'Cache-Control': 'no-store' });
  if (f.get('ok') !== '1') return send(res, 303, 'text/plain', '', { Location: origenApp(p.app) + p.volver, 'Cache-Control': 'no-store' });
  podar(codigos);
  const codigo = crypto.randomBytes(32).toString('base64url');
  codigos.set(codigo, { uid: user.id, app: p.app, vence: Date.now() + 60e3 });
  log(`entrar con CV Chat: ${user.username} (Haven #${user.id}) a ${p.app}`);
  return send(res, 303, 'text/plain', '', { Location: origenApp(p.app) + p.volver + '#cvcodigo=' + codigo, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
}
async function canje(req, res) {
  const { json, readJson } = h;
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return json(res, 405, { error: 'metodo' });
  if (!/^application\/json/.test(String(req.headers['content-type'] || ''))) return json(res, 403, { error: 'no' });
  const b = (await readJson(req, 1000)) || {};
  const k = String(b.codigo || '');
  const c = codigos.get(k);
  const vencido = { error: 'Se venció: tocá "Entrar con CV Chat" de nuevo.' };
  if (!c) return json(res, 404, vencido);
  // solo la pagina para la que se dio
  if (req.headers.origin !== origenApp(c.app)) return json(res, 403, { error: 'no' });
  codigos.delete(k);
  if (c.vence < Date.now() || banned(c.uid)) return json(res, 404, vencido);
  return json(res, 200, h.sessionFor(c.uid));
}

async function handle(req, res, p, u) {
  const { json, send, sessionUser } = h;

  if (p === '/puente/cuenta/autorizar') return autorizar(req, res, u);
  if (p === '/puente/api/cuenta/canje') return canje(req, res);

  if (['/puente/api/cuenta/yo', '/puente/api/cuenta/salir', '/puente/api/cuenta/perfil', '/puente/api/cuenta/conectar', '/puente/api/cuenta/desconectar', '/puente/api/cuenta/avisos', '/puente/api/cuenta/avisos/leer', '/puente/api/cuenta/monedas'].includes(p)) {
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
      avisos: require('./campana.js').sinLeer(user.id),
      monedas: saldoVisible(user.id),
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
      // La verificacion en dos pasos de CV Chat vale para todo (el foro entra solo por CV Chat, cvpuerta.php)
      dosPasos: !!(db.prepare('SELECT totp_enabled FROM users WHERE id = ?').get(user.id) || {}).totp_enabled,
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

  // ── Las monedas del club (la pastilla de la barra) ──
  if (p === '/puente/api/cuenta/monedas' && req.method === 'GET') {
    res.setHeader('Cache-Control', 'no-store');
    const user = userFromCookie(req);
    if (!user) return json(res, 401, { error: 'sin sesion' });
    const m = require('./monedas.js').mias(user.id);
    if (!m.visible) return json(res, 200, { visible: false });
    return json(res, 200, { visible: true, saldo: m.saldo, ganado: m.ganado, gastado: m.gastado, movimientos: (m.movimientos || []).slice(0, 15) });
  }

  // ── La campanita ──
  if (p === '/puente/api/cuenta/avisos' && req.method === 'GET') {
    res.setHeader('Cache-Control', 'no-store');
    const user = userFromCookie(req);
    if (!user) return json(res, 401, { error: 'sin sesion' });
    const c = require('./campana.js');
    return json(res, 200, { sinLeer: c.sinLeer(user.id), avisos: c.lista(user.id) });
  }
  if (p === '/puente/api/cuenta/avisos/leer' && req.method === 'POST') {
    if (!req.headers.origin || !origins().includes(req.headers.origin)) return json(res, 403, { error: 'no' });
    const user = userFromCookie(req);
    if (!user) return json(res, 401, { error: 'sin sesion' });
    require('./campana.js').leer(user.id);
    return json(res, 200, { ok: true });
  }

  if (p === '/puente/api/cuenta/sesion' && req.method === 'POST') {
    const user = sessionUser(req);
    if (!user) return json(res, 401, { error: 'sin sesion' });
    if (!on()) return json(res, 200, { ok: false });
    // los invitados (el truco sin cuenta) no tienen la web ni el foro: su cuenta se borra al irse
    if ((db.prepare('SELECT is_guest FROM users WHERE id = ?').get(user.id) || {}).is_guest) return json(res, 200, { ok: false });
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

module.exports = { setup, handle, on, userFromCookie, open, close, safeReturn, allowedOrigin: o => origins().includes(o), origins, dominio: () => dominio };
