// Vinculacion de cuentas Haven <-> Discord (parte del puente).
//
//  /puente/vincular            pagina para vincular o desvincular la cuenta
//  /puente/discord/callback    vuelta del inicio de sesion de Discord (OAuth2)
//  /puente/api/estado          GET  -> { vinculado, discord }   (requiere sesion de Haven)
//  /puente/api/iniciar         POST -> { url } para ir a Discord (requiere sesion)
//  /puente/api/desvincular     POST                              (requiere sesion)
//  /puente/aviso.js            aviso "Vincula tu cuenta" que se inyecta en /app
//  /puente/login.js            enlace "¿Olvidaste tu contraseña?" que se inyecta en el login
//  /puente/api/recuperar/*     recuperar la contraseña iniciando sesion con Discord
//  /puente/tema-fijo.js        el tema del servidor para todos (tema-fijo.js)
//  /manifest.webmanifest       app instalable con el nombre e icono del servidor (instalable.js)
//
// Recuperar con Discord: quien entra con la cuenta de Discord vinculada puede
// poner una contraseña nueva a su cuenta de Haven. Igual que un codigo de
// recuperacion de Haven: cierra todas las sesiones y borra las claves de los
// mensajes directos cifrados. Por seguridad NO se permite si la cuenta es de
// administrador o tiene la verificacion en dos pasos activada (alguien que le
// robara el Discord no debe poder saltarse eso).
//
// Al vincular, los mensajes historicos de esa cuenta de Discord (tabla
// puente_autores) pasan a la cuenta de Haven; al desvincular vuelven a quedar
// como importados. Una cuenta de Discord solo puede estar vinculada a una de
// Haven, y viceversa.
//
// Necesita DISCORD_CLIENT_SECRET en /opt/haven/.env y, en el Developer Portal,
// el redirect <PUBLIC_URL>/puente/discord/callback.

const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const adjuntos = require('./adjuntos.js');
const instalable = require('./instalable.js');
const temaFijo = require('./tema-fijo.js');

const STATE_TTL_MS = 10 * 60 * 1000;
const states = new Map(); // state -> { purpose: 'link' | 'recover', userId, exp }
const recoveries = new Map(); // token -> { userId, username, exp } (un solo uso)
const RECOVERY_TTL_MS = 10 * 60 * 1000;

let db, io, api, log, warn, publicUrl, clientId = null, clientSecret, verifyToken, onLinked, onUnlinked;

function setup(ctx) {
  ({ db, io, api, log, warn, publicUrl, onLinked = () => {}, onUnlinked = () => {} } = ctx);
  clientSecret = process.env.DISCORD_CLIENT_SECRET || '';
  try { verifyToken = require('/app/src/auth').verifyToken; } catch (err) { warn('no encuentro verifyToken de Haven:', err.message); return; }

  db.exec(`
    CREATE TABLE IF NOT EXISTS puente_autores (
      message_id INTEGER PRIMARY KEY REFERENCES messages(id) ON DELETE CASCADE,
      discord_user_id TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_puente_autores_user ON puente_autores(discord_user_id);
  `);

  api('GET', '/oauth2/applications/@me').then(app => {
    if (app && app.id) clientId = app.id;
    else warn('no pude leer el ID de la aplicacion de Discord');
  });
  if (!clientSecret) warn('falta DISCORD_CLIENT_SECRET: la vinculacion de cuentas no funcionara hasta guardarlo');

  hookHttp();
  log('vinculacion de cuentas lista en /puente/vincular');
}

// ── HTTP: atiende /puente/* antes que Haven, e inyecta el aviso en /app ──
function hookHttp() {
  const origEmit = http.Server.prototype.emit;
  http.Server.prototype.emit = function (event, req, res, ...rest) {
    if (event === 'request' && req && typeof req.url === 'string') {
      const url = req.url;
      if (url.startsWith('/manifest.webmanifest') || url.startsWith('/puente/icono-')) {
        try { if (instalable.handle(db, req, res)) return true; } catch (err) { warn('error en', url, err.message); }
      }
      if (url.startsWith('/puente/')) {
        handle(req, res).catch(err => { warn('error en', url, err.message); send(res, 500, 'text/plain', 'Error interno'); });
        return true;
      }
      if (url === '/app' || url.startsWith('/app?')) injectScript(req, res, '/puente/aviso.js');
      else if (url === '/' || url.startsWith('/?')) injectScript(req, res, '/puente/login.js');
      else if (url.startsWith('/api/link-preview?')) req.url = twitterProxyToX(url);
    }
    return origEmit.call(this, event, req, res, ...rest);
  };
}

// Haven arma una tarjeta completa (autor, texto, video, estadisticas) para los
// enlaces de x.com / twitter.com, pero no reconoce los dominios que se usan en
// Discord para que los tuits se vean bien (fixupx, fxtwitter, vxtwitter, fixvx...).
// Para esos usa un lector generico con un resultado pobre. Antes de que Haven
// pida la vista previa, se traduce el enlace al de x.com equivalente.
const TWITTER_PROXY = /^https?:\/\/(?:[a-z0-9-]+\.)?(?:fxtwitter|fixupx|vxtwitter|fixvx|twittpr)\.com\/([A-Za-z0-9_]{1,20})\/status(?:es)?\/(\d+)/i;
function twitterProxyToX(reqUrl) {
  try {
    const u = new URL(reqUrl, 'http://x');
    const target = u.searchParams.get('url') || '';
    const m = target.match(TWITTER_PROXY);
    if (!m) return reqUrl;
    u.searchParams.set('url', `https://x.com/${m[1]}/status/${m[2]}`);
    return u.pathname + u.search;
  } catch { return reqUrl; }
}

// Agrega <script src> antes de </body> en una pagina HTML de Haven, tanto si se
// envia de una vez (res.send) como por partes (res.sendFile).
function injectScript(req, res, src) {
  delete req.headers['if-none-match'];      // siempre la pagina completa, nunca un 304
  delete req.headers['if-modified-since'];  // de una copia vieja sin el script
  const tag = `<script src="${src}" defer></script>`;
  const chunks = [];
  const isHtml = () => String(res.getHeader('Content-Type') || '').includes('text/html');
  const toBuf = (c, enc) => (Buffer.isBuffer(c) ? c : Buffer.from(c, typeof enc === 'string' ? enc : 'utf8'));
  const origSetHeader = res.setHeader, origWrite = res.write, origEnd = res.end;
  res.setHeader = function (name, value) {
    if (String(name).toLowerCase() === 'content-length' && isHtml()) return this; // se calcula al final
    return origSetHeader.call(this, name, value);
  };
  res.write = function (chunk, encoding, cb) {
    if (!isHtml() || res.headersSent) return origWrite.call(this, chunk, encoding, cb);
    if (chunk) chunks.push(toBuf(chunk, encoding));
    const done = typeof encoding === 'function' ? encoding : cb;
    if (typeof done === 'function') process.nextTick(done);
    return true;
  };
  res.end = function (chunk, encoding, cb) {
    const done = typeof chunk === 'function' ? chunk : typeof encoding === 'function' ? encoding : cb;
    if (chunk && typeof chunk !== 'function') chunks.push(toBuf(chunk, encoding));
    let body = Buffer.concat(chunks);
    try {
      if (isHtml() && !res.headersSent) {
        let html = body.toString('utf8');
        if (html.includes('</body>') && !html.includes(src)) html = html.replace('</body>', tag + '</body>');
        body = Buffer.from(temaFijo.pageHead(db, instalable.pageHead(db, html)), 'utf8');
        origSetHeader.call(this, 'Content-Length', body.length);
      }
    } catch { /* si algo falla, se sirve la pagina tal cual */ }
    return origEnd.call(this, body.length ? body : undefined, done);
  };
}

function send(res, status, type, body, headers = {}) {
  if (res.headersSent) return;
  res.writeHead(status, { 'Content-Type': type + '; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers });
  res.end(body);
}
const json = (res, status, obj) => send(res, status, 'application/json', JSON.stringify(obj));

function sessionUser(req) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const decoded = token ? verifyToken(token) : null;
  if (!decoded || !decoded.id) return null;
  return db.prepare('SELECT id, username, display_name FROM users WHERE id = ?').get(decoded.id) || null;
}

// Reacciones rapidas del menu del celular (web/aviso.js), como la fila de
// Discord: las que mas usa la persona y, para completar, las mas usadas del
// servidor. Los emojis del servidor van con su imagen.
const FREQ_N = 7, FREQ_TTL_MS = 10 * 60 * 1000;
const freqCache = new Map(); // user id (0 = servidor) -> { at, list }
function topReactions(userId) {
  const hit = freqCache.get(userId);
  if (hit && Date.now() - hit.at < FREQ_TTL_MS) return hit.list;
  const list = (userId
    ? db.prepare('SELECT emoji, COUNT(*) n FROM reactions WHERE user_id = ? GROUP BY emoji ORDER BY n DESC LIMIT 40').all(userId)
    : db.prepare('SELECT emoji, COUNT(*) n FROM reactions GROUP BY emoji ORDER BY n DESC LIMIT 40').all()).map(r => r.emoji);
  freqCache.set(userId, { at: Date.now(), list });
  return list;
}
function frequentReactions(userId, n = FREQ_N) {
  const custom = new Map(db.prepare('SELECT name, filename FROM custom_emojis').all().map(r => [r.name, r.filename]));
  const out = [], seen = new Set();
  for (const e of [...topReactions(userId), ...topReactions(0), '👍', '❤️', '😂', '😮', '😢', '🔥', '👀']) {
    if (out.length >= n || seen.has(e)) continue;
    const m = /^:([a-z0-9_-]+):$/.exec(e);
    if (m && !custom.has(m[1])) continue; // emoji que ya no existe
    seen.add(e);
    out.push(m ? { emoji: e, url: '/uploads/' + custom.get(m[1]) } : { emoji: e });
  }
  return out;
}

// Quien reacciono a un mensaje, por emoji, como la ventana de Discord (web/aviso.js).
// En Haven, las reacciones que vinieron de cuentas de Discord sin vincular (y las
// del historial) estan todas a nombre del usuario tecnico "discord-historial";
// para esas se le pregunta a Discord quien fue. El bot del puente no se lista:
// su reaccion en Discord es la de la gente de Haven, que ya aparece con su nombre.
const reactorsCache = new Map(); // "mensaje|emoji" -> { at, users }
async function whoReacted(user, messageId) {
  const m = db.prepare(`SELECT m.id, m.channel_id, m.thread_id, c.discord_channel_id,
      COALESCE(m.discord_message_id, s.discord_message_id) did, s.discord_thread_id
    FROM messages m JOIN channels c ON c.id = m.channel_id
    LEFT JOIN puente_salientes s ON s.haven_message_id = m.id WHERE m.id = ?`).get(messageId);
  if (!m) return null;
  const admin = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(user.id);
  const member = db.prepare('SELECT 1 FROM channel_members WHERE channel_id = ? AND user_id = ?').get(m.channel_id, user.id);
  if (!member && !(admin && admin.is_admin)) return null;

  const ghost = (db.prepare("SELECT id FROM users WHERE username = 'discord-historial'").get() || {}).id;
  const rows = db.prepare(`SELECT r.emoji, r.user_id, u.username, COALESCE(u.display_name, u.username) name, u.avatar
    FROM reactions r JOIN users u ON u.id = r.user_id WHERE r.message_id = ? ORDER BY r.id`).all(messageId);
  const byEmoji = new Map();
  for (const r of rows) {
    if (!byEmoji.has(r.emoji)) byEmoji.set(r.emoji, { emoji: r.emoji, users: [], ghost: false });
    const e = byEmoji.get(r.emoji);
    if (r.user_id === ghost) { e.ghost = true; continue; }
    e.users.push({ id: r.user_id, name: r.name, avatar: r.avatar || null, propio: r.user_id === user.id });
  }

  // Los de Discord: solo si el mensaje esta en Discord (y no en un hilo que no conocemos)
  const channelForApi = m.thread_id ? m.discord_thread_id : m.discord_channel_id;
  if (m.did && /^\d+$/.test(String(m.did)) && channelForApi) {
    const linked = new Set(db.prepare('SELECT discord_user_id FROM puente_vinculos').all().map(r => r.discord_user_id));
    const bot = await botId();
    for (const e of byEmoji.values()) {
      const param = adjuntos.discordReactionParam(db, e.emoji);
      if (!param) continue;
      const key = m.did + '|' + param;
      let hit = reactorsCache.get(key);
      if (!hit || Date.now() - hit.at > 60000) {
        const r = await api('GET', `/channels/${channelForApi}/messages/${m.did}/reactions/${encodeURIComponent(param)}?limit=100`);
        hit = { at: Date.now(), users: Array.isArray(r) ? r : [] };
        reactorsCache.set(key, hit);
        if (reactorsCache.size > 2000) reactorsCache.delete(reactorsCache.keys().next().value);
      }
      for (const du of hit.users) {
        if (!du || du.id === bot || linked.has(du.id)) continue; // el bot o alguien que ya figura con su cuenta de Haven
        e.users.push({ name: du.global_name || du.username, avatar: du.avatar ? `https://cdn.discordapp.com/avatars/${du.id}/${du.avatar}.png?size=64` : null, discord: true });
      }
    }
  }
  return [...byEmoji.values()].map(e => {
    // Si Discord no respondio, al menos queda "Discord" para las que vinieron de ahi
    if (e.ghost && !e.users.some(x => x.discord)) e.users.push({ name: 'Discord', avatar: null, discord: true });
    return { emoji: e.emoji, users: e.users };
  });
}
let cachedBotId = null;
async function botId() {
  if (cachedBotId) return cachedBotId;
  const me = await api('GET', '/users/@me');
  if (me && me.id) cachedBotId = me.id;
  return cachedBotId;
}

const STATIC = path.join(__dirname, 'web');
async function handle(req, res) {
  const u = new URL(req.url, 'http://x');
  const p = u.pathname;

  if (req.method === 'GET' && (p === '/puente/vincular' || p === '/puente/vincular.js' || p === '/puente/aviso.js' || p === '/puente/login.js' || p === '/puente/instalar.js' || p === '/puente/vincular.css')) {
    const file = p === '/puente/vincular' ? 'vincular.html' : p.slice('/puente/'.length);
    const type = file.endsWith('.html') ? 'text/html' : file.endsWith('.css') ? 'text/css' : 'application/javascript';
    let body = fs.readFileSync(path.join(STATIC, file));
    // Titulo de la pestana (PUENTE_TITULO): se escribe en aviso.js y login.js al servirlos.
    if (file.endsWith('.js')) {
      // Solo letras, numeros, espacios y signos simples (va dentro de un string de JS).
      const title = String(process.env.PUENTE_TITULO || '').replace(/[^\p{L}\p{N} ._!?¡¿-]/gu, '').slice(0, 60);
      // Canales que se abren al entrar por primera vez (PUENTE_CANAL_INICIO): nombres separados por comas.
      const start = String(process.env.PUENTE_CANAL_INICIO || '').replace(/[^\p{L}\p{N}_,-]/gu, '').slice(0, 200);
      body = body.toString('utf8').replace(/__PUENTE_TITULO__/g, title).replace(/__PUENTE_CANAL_INICIO__/g, start);
    }
    return send(res, 200, type, body);
  }

  if (p === '/puente/tema-fijo.js' && req.method === 'GET') {
    return send(res, 200, 'application/javascript', temaFijo.script(db));
  }

  if (p === '/puente/api/reacciones-frecuentes' && req.method === 'GET') {
    const user = sessionUser(req);
    if (!user) return json(res, 401, { error: 'sin sesion' });
    const n = Math.max(1, Math.min(36, parseInt(u.searchParams.get('n'), 10) || FREQ_N));
    return json(res, 200, { emojis: frequentReactions(user.id, n) });
  }

  if (p === '/puente/api/reacciones' && req.method === 'GET') {
    const user = sessionUser(req);
    if (!user) return json(res, 401, { error: 'sin sesion' });
    const id = parseInt(u.searchParams.get('mensaje'), 10);
    if (!id) return json(res, 400, { error: 'falta el mensaje' });
    const list = await whoReacted(user, id);
    return list ? json(res, 200, { reacciones: list }) : json(res, 404, { error: 'no encontrado' });
  }

  if (p === '/puente/api/estado' && req.method === 'GET') {
    const user = sessionUser(req);
    if (!user) return json(res, 401, { error: 'sin sesion' });
    const link = db.prepare('SELECT discord_user_id, discord_username, discord_global_name, discord_avatar FROM puente_vinculos WHERE haven_user_id = ?').get(user.id);
    return json(res, 200, {
      vinculado: !!link,
      haven: user.display_name || user.username,
      discord: link ? { id: link.discord_user_id, nombre: link.discord_global_name || link.discord_username, usuario: link.discord_username,
        avatar: link.discord_avatar ? `https://cdn.discordapp.com/avatars/${link.discord_user_id}/${link.discord_avatar}.png?size=128` : null } : null,
      disponible: !!(clientId && clientSecret),
    });
  }

  if (p === '/puente/api/iniciar' && req.method === 'POST') {
    const user = sessionUser(req);
    if (!user) return json(res, 401, { error: 'sin sesion' });
    if (!clientId || !clientSecret) return json(res, 503, { error: 'La vinculacion todavia no esta configurada en el servidor.' });
    const now = Date.now();
    for (const [k, v] of states) if (v.exp < now) states.delete(k);
    const state = crypto.randomBytes(24).toString('hex');
    return json(res, 200, { url: authorizeUrl({ purpose: 'link', userId: user.id }) });
  }

  if (p === '/puente/api/desvincular' && req.method === 'POST') {
    const user = sessionUser(req);
    if (!user) return json(res, 401, { error: 'sin sesion' });
    const link = db.prepare('SELECT discord_user_id FROM puente_vinculos WHERE haven_user_id = ?').get(user.id);
    if (!link) return json(res, 200, { ok: true });
    const restored = unlink(user.id, link.discord_user_id);
    try { onUnlinked(user.id); } catch (err) { warn('accesos al desvincular:', err.message); }
    log(`desvinculado: Haven #${user.id} <-> Discord ${link.discord_user_id} (${restored} mensajes devueltos al historial importado)`);
    return json(res, 200, { ok: true, mensajes: restored });
  }

  if (p === '/puente/api/recuperar/iniciar' && req.method === 'POST') {
    if (!clientId || !clientSecret) return json(res, 503, { error: 'La recuperación todavía no está configurada en el servidor.' });
    return json(res, 200, { url: authorizeUrl({ purpose: 'recover' }) });
  }

  if (p === '/puente/api/recuperar/estado' && req.method === 'GET') {
    const r = recoveries.get(u.searchParams.get('token') || '');
    if (!r || r.exp < Date.now()) return json(res, 404, { error: 'El enlace de recuperación caducó. Volvé a empezar.' });
    return json(res, 200, { usuario: r.username });
  }

  if (p === '/puente/api/recuperar/confirmar' && req.method === 'POST') {
    const body = await readJson(req);
    const token = body && typeof body.token === 'string' ? body.token : '';
    const password = body && typeof body.password === 'string' ? body.password : '';
    const r = recoveries.get(token);
    if (!r || r.exp < Date.now()) return json(res, 404, { error: 'El enlace de recuperación caducó. Volvé a empezar.' });
    if (password.length < 8 || password.length > 128) return json(res, 400, { error: 'La contraseña tiene que tener entre 8 y 128 caracteres.' });
    recoveries.delete(token); // un solo uso
    const user = db.prepare('SELECT id, username, is_admin, totp_enabled, password_version FROM users WHERE id = ?').get(r.userId);
    if (!user || user.is_admin || user.totp_enabled) return json(res, 403, { error: 'Esta cuenta no se puede recuperar con Discord.' });
    const bcrypt = require('/app/node_modules/bcryptjs');
    const hash = await bcrypt.hash(password, 12);
    // Lo mismo que hace Haven al usar un codigo de recuperacion.
    db.prepare(`UPDATE users SET password_hash = ?, password_version = ?, temp_password_hash = NULL, must_change_password = 0,
                  public_key = NULL, encrypted_private_key = NULL, e2e_key_salt = NULL, e2e_secret = NULL, e2e_passphrase = 0
                WHERE id = ?`).run(hash, (user.password_version || 1) + 1, user.id);
    // Cerrar las sesiones abiertas (Haven deja de aceptar sus tokens en unos
    // segundos, al subir password_version).
    try {
      for (const so of io.of('/').sockets.values()) {
        if (so.user && so.user.id === user.id) { so.emit('force-logout', { reason: 'password_changed' }); so.disconnect(true); }
      }
    } catch { /* sin sesiones abiertas */ }
    log(`recuperacion con Discord: contraseña nueva para "${user.username}" (Haven #${user.id}); sesiones cerradas y claves E2E borradas`);
    return json(res, 200, { ok: true, usuario: user.username });
  }

  if (p === '/puente/discord/callback' && req.method === 'GET') {
    const back = (params) => send(res, 302, 'text/plain', '', { Location: `/puente/vincular?${new URLSearchParams(params)}` });
    const state = u.searchParams.get('state') || '';
    const entry = states.get(state);
    states.delete(state);
    if (u.searchParams.get('error')) return back({ error: 'cancelado' });
    if (!entry || entry.exp < Date.now()) return back({ error: 'caducado' });
    const code = u.searchParams.get('code');
    if (!code) return back({ error: 'cancelado' });

    const tokenRes = await fetch('https://discord.com/api/v10/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: 'authorization_code', code, redirect_uri: redirectUri() }),
      signal: AbortSignal.timeout(15000),
    });
    const tok = await tokenRes.json().catch(() => ({}));
    if (!tokenRes.ok || !tok.access_token) { warn('OAuth: Discord rechazo el codigo', tokenRes.status, tok.error || ''); return back({ error: 'discord' }); }
    const meRes = await fetch('https://discord.com/api/v10/users/@me', { headers: { Authorization: `Bearer ${tok.access_token}` }, signal: AbortSignal.timeout(15000) });
    const me = await meRes.json().catch(() => ({}));
    // El token solo hacia falta para saber quien es: se revoca enseguida.
    fetch('https://discord.com/api/v10/oauth2/token/revoke', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, token: tok.access_token }),
    }).catch(() => {});
    if (!me.id) return back({ error: 'discord' });

    if (entry.purpose === 'recover') {
      const l = db.prepare('SELECT haven_user_id FROM puente_vinculos WHERE discord_user_id = ?').get(me.id);
      if (!l) return back({ error: 'sin-vinculo' });
      const user = db.prepare('SELECT id, username, is_admin, totp_enabled FROM users WHERE id = ?').get(l.haven_user_id);
      if (!user) return back({ error: 'sin-vinculo' });
      if (user.is_admin) return back({ error: 'recuperar-admin' });
      if (user.totp_enabled) return back({ error: 'recuperar-2fa' });
      const token = crypto.randomBytes(24).toString('hex');
      recoveries.set(token, { userId: user.id, username: user.username, exp: Date.now() + RECOVERY_TTL_MS });
      return back({ recuperar: token });
    }

    if (entry.purpose !== 'link') return back({ error: 'caducado' });
    const other = db.prepare('SELECT haven_user_id FROM puente_vinculos WHERE discord_user_id = ?').get(me.id);
    if (other && other.haven_user_id !== entry.userId) return back({ error: 'ocupada' });

    const moved = link(entry.userId, me);
    // Sin avatar en Haven: usar el de Discord (no pisa uno elegido en Haven).
    try {
      const u = db.prepare('SELECT avatar FROM users WHERE id = ?').get(entry.userId);
      if (u && !u.avatar && me.avatar) {
        const av = await adjuntos.avatar(me.id, me.avatar);
        if (av) db.prepare('UPDATE users SET avatar = ? WHERE id = ? AND avatar IS NULL').run(av, entry.userId);
      }
    } catch (err) { warn('avatar de Discord:', err.message); }
    try { await onLinked(me.id); } catch (err) { warn('accesos al vincular:', err.message); }
    log(`vinculado: Haven #${entry.userId} <-> Discord ${me.username} (${me.id}); ${moved} mensajes historicos pasados a su cuenta`);
    return back({ ok: '1', mensajes: String(moved) });
  }

  return send(res, 404, 'text/plain', 'No encontrado');
}

function redirectUri() { return `${publicUrl}/puente/discord/callback`; }

function authorizeUrl(entry) {
  const now = Date.now();
  for (const [k, v] of states) if (v.exp < now) states.delete(k);
  for (const [k, v] of recoveries) if (v.exp < now) recoveries.delete(k);
  const state = crypto.randomBytes(24).toString('hex');
  states.set(state, { ...entry, exp: now + STATE_TTL_MS });
  const q = new URLSearchParams({ client_id: clientId, response_type: 'code', scope: 'identify', redirect_uri: redirectUri(), state, prompt: 'consent' });
  return `https://discord.com/oauth2/authorize?${q}`;
}

function readJson(req, limit = 10000) {
  return new Promise(resolve => {
    let size = 0; const parts = [];
    req.on('data', c => { size += c.length; if (size > limit) { req.destroy(); resolve(null); } else parts.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(parts).toString('utf8'))); } catch { resolve(null); } });
    req.on('error', () => resolve(null));
  });
}


function ghostId() {
  const g = db.prepare("SELECT id FROM users WHERE username = 'discord-historial'").get();
  return g ? g.id : null;
}

function link(havenUserId, me) {
  return db.transaction(() => {
    const prev = db.prepare('SELECT discord_user_id FROM puente_vinculos WHERE haven_user_id = ?').get(havenUserId);
    if (prev && prev.discord_user_id !== me.id) unlink(havenUserId, prev.discord_user_id);
    db.prepare(`INSERT INTO puente_vinculos (discord_user_id, haven_user_id, discord_username, discord_global_name, discord_avatar)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(discord_user_id) DO UPDATE SET discord_username = excluded.discord_username,
                  discord_global_name = excluded.discord_global_name, discord_avatar = excluded.discord_avatar`)
      .run(me.id, havenUserId, me.username, me.global_name || null, me.avatar || null);
    return db.prepare(`UPDATE messages SET user_id = ?, imported_from = NULL
                       WHERE id IN (SELECT message_id FROM puente_autores WHERE discord_user_id = ?) AND imported_from = 'discord'`)
      .run(havenUserId, me.id).changes;
  })();
}

function unlink(havenUserId, discordUserId) {
  return db.transaction(() => {
    const restored = db.prepare(`UPDATE messages SET user_id = ?, imported_from = 'discord'
                                 WHERE id IN (SELECT message_id FROM puente_autores WHERE discord_user_id = ?) AND user_id = ?`)
      .run(ghostId(), discordUserId, havenUserId).changes;
    db.prepare('DELETE FROM puente_vinculos WHERE haven_user_id = ?').run(havenUserId);
    return restored;
  })();
}

// El puente y la sincronizacion apuntan aqui el autor de cada mensaje de Discord.
function recordAuthor(messageId, discordUserId) {
  if (messageId && discordUserId) db.prepare('INSERT OR IGNORE INTO puente_autores (message_id, discord_user_id) VALUES (?, ?)').run(messageId, discordUserId);
}

module.exports = { setup, recordAuthor, whoReacted };
