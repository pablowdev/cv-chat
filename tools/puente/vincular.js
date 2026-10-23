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
//  /puente/tema-fijo.js        el tema y el diseño del servidor para todos (tema-fijo.js)
//  /puente/api/ui-fija         POST -> un administrador publica su diseño (tema-fijo.js)
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
const email = require('./email.js');
const nombres = require('./nombres.js');

const STATE_TTL_MS = 10 * 60 * 1000;
const states = new Map(); // state -> { purpose: 'link' | 'recover', userId, exp }
const recoveries = new Map(); // token -> { userId, username, exp } (un solo uso)
const RECOVERY_TTL_MS = 10 * 60 * 1000;
// "Entrar con Discord" (/puente/entrar): la sesion pasa por un codigo de un solo
// uso (nunca por la URL), y la cuenta nueva espera a que acepte las condiciones.
const handoffs = new Map(); // codigo -> { token, user, exp }
const signups = new Map();  // codigo -> { me, exp }
const HANDOFF_TTL_MS = 2 * 60 * 1000, SIGNUP_TTL_MS = 15 * 60 * 1000;
// El registro que hace el puente al crear la cuenta con Discord no pasa por el
// control del email del formulario (el email lo pone despues, ya confirmado por Discord)
const INTERNAL = crypto.randomBytes(16).toString('hex');
let generateToken = null;

let db, io, api, log, warn, publicUrl, clientId = null, clientSecret, verifyToken, onLinked, onUnlinked;

function setup(ctx) {
  ({ db, io, api, log, warn, publicUrl, onLinked = () => {}, onUnlinked = () => {} } = ctx);
  clientSecret = process.env.DISCORD_CLIENT_SECRET || '';
  try { verifyToken = require('/app/src/auth').verifyToken; } catch (err) { warn('no encuentro verifyToken de Haven:', err.message); return; }
  try { generateToken = require('/app/src/auth').generateToken; } catch (err) { warn('no encuentro generateToken de Haven (sin "Entrar con Discord"):', err.message); }
  try { nombres.ensureColumn(db); } catch (err) { warn('nombres:', err.message); }

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

  email.setup({ db, log, warn, publicUrl, appName, setPassword });
  hookHttp();
  log('vinculacion de cuentas lista en /puente/vincular');
}

// ── HTTP: atiende /puente/* antes que Haven, e inyecta el aviso en /app ──
function hookHttp() {
  const origEmit = http.Server.prototype.emit;
  http.Server.prototype.emit = function (event, req, res, ...rest) {
    if (event === 'request' && req && typeof req.url === 'string') {
      const url = req.url;
      if (url.startsWith('/manifest.webmanifest') || url.startsWith('/puente/icono-') || url.startsWith('/icon-192.svg') || url.startsWith('/icon-512.svg') || url.startsWith('/locales/')) {
        try { if (instalable.handle(db, req, res)) return true; } catch (err) { warn('error en', url, err.message); }
      }
      // App de Android (Trusted Web Activity): sin esto se ve la barra del navegador arriba.
      // PUENTE_ANDROID_PAQUETE y PUENTE_ANDROID_SHA256 (la huella del certificado con que se firma)
      if (url === '/.well-known/assetlinks.json' && process.env.PUENTE_ANDROID_PAQUETE && process.env.PUENTE_ANDROID_SHA256) {
        const huellas = String(process.env.PUENTE_ANDROID_SHA256).split(',').map(x => x.trim().toUpperCase()).filter(x => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(x));
        json(res, 200, [{ relation: ['delegate_permission/common.handle_all_urls'], target: { namespace: 'android_app', package_name: String(process.env.PUENTE_ANDROID_PAQUETE).replace(/[^a-zA-Z0-9_.]/g, ''), sha256_cert_fingerprints: huellas } }]);
        return true;
      }
      // "Personas" de Haven (escribir con otro nombre y foto): solo los administradores
      if (req.method === 'POST' && (url === '/api/personas' || url.startsWith('/api/personas?'))) {
        const who = sessionUser(req);
        const admin = who && db.prepare('SELECT is_admin FROM users WHERE id = ?').get(who.id);
        if (!admin || !admin.is_admin) { send(res, 403, 'application/json', JSON.stringify({ error: 'Las personas son solo para administradores.' })); return true; }
      }
      // Registro con email obligatorio (email.js)
      if (req.method === 'POST' && (url === '/api/auth/register' || url.startsWith('/api/auth/register?')) && email.on() && req.headers['x-puente-interno'] !== INTERNAL) {
        const server = this;
        // Nombres reservados (identidad.js): no crearse la cuenta con el nombre de otra persona
        email.hookRegister(req, res, () => origEmit.call(server, event, req, res, ...rest), (body) => require('./identidad.js').problem(0, String(body.username || '')));
        return true;
      }
      if (url.startsWith('/puente/')) {
        handle(req, res).catch(err => { warn('error en', url, err.message); send(res, 500, 'text/plain', 'Error interno'); });
        return true;
      }
      if (url === '/app' || url.startsWith('/app?')) injectScript(req, res, '/puente/aviso.js');
      else if (url === '/' || url.startsWith('/?')) injectScript(req, res, '/puente/login.js');
      else if (url.startsWith('/api/link-preview?')) {
        // Un enlace a un mensaje (de CV Chat o de Discord) se ve como "#canal › mensaje"
        // (web/aviso.js): sin tarjeta de vista previa
        if (isMessageLink(url)) { json(res, 400, { error: 'enlace a un mensaje' }); return true; }
        req.url = twitterProxyToX(url);
        const server = this;
        if (tweetPreview(req, res, () => origEmit.call(server, event, req, res, ...rest))) return true;
      }
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

// Tarjeta de los tuits: Haven la pide a la API publica de fxtwitter una sola vez
// (6 s) y, si en ese momento falla, se queda 30 minutos con una vista previa
// vacia: el enlace sale pelado. Aca se pide con un reintento, se guardan solo
// las que salieron bien y, si igual falla, sigue Haven como siempre. Misma
// tarjeta que arma Haven (mismos datos), y con su misma regla de dominios.
const TWEET_RE = /^https?:\/\/(?:(?:www\.|mobile\.)?(?:twitter|x)\.com)\/([A-Za-z0-9_]{1,20})\/status(?:es)?\/(\d+)/i;
const tweetCache = new Map(); // id del tuit -> { at, data }
const TWEET_TTL_MS = 30 * 60 * 1000;
function tweetPreview(req, res, next) {
  if (req.method !== 'GET') return false;
  let target;
  try { target = new URL(req.url, 'http://x').searchParams.get('url') || ''; } catch { return false; }
  const m = TWEET_RE.exec(target.trim());
  if (!m || !verifyToken) return false;
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ') || !verifyToken(auth.slice(7))) return false; // Haven contesta "sin sesion"
  try { if (!require('/app/src/automod').previewAllowed(target)) return false; } catch { return false; }
  const reply = (data) => send(res, 200, 'application/json', JSON.stringify({ ...data, url: target }));
  const hit = tweetCache.get(m[2]);
  if (hit && Date.now() - hit.at < TWEET_TTL_MS) { reply(hit.data); return true; }
  (async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const r = await fetch(`https://api.fxtwitter.com/${m[1]}/status/${m[2]}`, {
          signal: AbortSignal.timeout(8000), headers: { 'User-Agent': 'Mozilla/5.0 (compatible; HavenBot/2.1; +https://github.com/ancsemi/Haven)' } });
        const tw = r.ok ? (await r.json())?.tweet : null;
        if (tw) {
          const a = tw.author || {};
          const photos = (tw.media?.photos || []).map(p => p.url).filter(Boolean);
          const vid = tw.media?.videos?.[0] || null;
          const text = tw.text || '';
          const data = {
            kind: 'twitter', siteName: 'X / Twitter', accentColor: '#1d9bf0',
            author: a.name || null, handle: a.screen_name ? `@${a.screen_name}` : null, avatar: a.avatar_url || null,
            title: a.name ? `${a.name} on X` : 'X / Twitter', text: text || null, description: text.slice(0, 280) || null,
            image: vid?.thumbnail_url || photos[0] || null, images: photos.length >= 2 ? photos.slice(0, 4) : undefined,
            video: vid?.url || null, videoType: vid?.url ? 'video/mp4' : undefined,
            stats: { replies: tw.replies ?? -1, reposts: tw.retweets ?? -1, likes: tw.likes ?? -1, views: tw.views ?? -1 },
          };
          tweetCache.set(m[2], { at: Date.now(), data });
          if (tweetCache.size > 2000) tweetCache.delete(tweetCache.keys().next().value);
          return reply(data);
        }
        if (r.status === 404) break; // el tuit no existe (o lo borraron): que siga Haven
      } catch { /* se vuelve a intentar */ }
      if (attempt === 0) await new Promise(ok => setTimeout(ok, 1500));
    }
    next();
  })().catch(() => { if (!res.headersSent) next(); });
  return true;
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
        // Pantalla de inicio de sesion ("/"): el logo y el nombre del servidor en vez
        // de "HAVEN" y su lema, con el aspecto de la app (login.css). "by Haven" queda
        // chiquito abajo, junto a la version.
        if (html.includes('data-haven-page="auth"') && !html.includes('puente-login-logo')) {
          const row = db.prepare("SELECT value FROM server_settings WHERE key = 'server_name'").get();
          const name = String((row && row.value) || 'Haven').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
          html = html.replace('<div class="logo">⬡</div>', '<img class="puente-login-logo" src="/puente/logo-carga.png" alt="">')
            .replace('<h1>HAVEN</h1>', `<h1>${name}</h1><p class="puente-login-sub">¡Qué bueno verte por acá!</p>`)
            .replace('</head>', '<link rel="preload" href="/puente/logo-carga.png" as="image"><link rel="stylesheet" href="/puente/login.css">' +
              (email.on() ? '<meta name="puente-email" content="1">' : '') + '</head>');
        }
        // La pantalla "Bienvenido a Haven" (y el banner del servidor que la
        // acompana) no se muestra ni un instante: aviso.js abre un canal enseguida.
        // Va dentro de la pagina para que valga antes de que cargue el tema.
        if (html.includes('id="no-channel-msg"') && !html.includes('puente-sin-bienvenida')) {
          html = html.replace('</head>', '<style id="puente-sin-bienvenida">html:not(.puente-bienvenida) #no-channel-msg,' +
            'html:not(.puente-bienvenida):not(.puente-con-canal) #server-banner-display,' +
            'html:not(.puente-bienvenida):not(.puente-con-canal) #channel-header-name{visibility:hidden!important}</style></head>');
        }
        // Pantalla de carga con el logo, como Discord: tapa la pagina vacia de Haven
        // mientras se conecta y se acomoda todo, con el logo grande girando como las
        // agujas del reloj; aviso.js la saca con un fundido cuando ya cargaron los canales y los
        // mensajes. Si algo falla, se va sola a los 8 s.
        if (html.includes('id="no-channel-msg"') && !html.includes('puente-carga')) {
          const size = 'min(62vmin,520px)';
          html = html.replace('</head>', '<link rel="preload" href="/puente/logo-carga.png" as="image">' +
            '<style id="puente-carga">' +
            'html::before,html::after{content:"";position:fixed;opacity:1;visibility:visible;' +
            'transition:opacity .3s ease,visibility 0s linear .3s}' +
            'html::before{inset:0;z-index:2147483645;background:#121214;animation:puente-carga-fin .3s ease 8s forwards}' +
            'html::after{left:50%;top:50%;width:' + size + ';height:' + size + ';margin:calc(' + size + ' / -2) 0 0 calc(' + size + ' / -2);' +
            'z-index:2147483646;background:url(/puente/logo-carga.png) center/contain no-repeat;' +
            'animation:puente-carga-gira 2.4s linear infinite,puente-carga-fin .3s ease 8s forwards}' +
            'html.puente-listo::before,html.puente-listo::after{opacity:0;visibility:hidden;pointer-events:none}' +
            '@keyframes puente-carga-gira{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}' +
            '@keyframes puente-carga-fin{to{opacity:0;visibility:hidden}}</style></head>');
        }
        // Cartel para agregar un email de recuperacion (email.js)
        if (email.on() && html.includes('id="no-channel-msg"') && !html.includes('/puente/email.js')) {
          html = html.replace('</body>', '<script src="/puente/email.js" defer></script></body>');
        }
        html = shareTags(html);
        body = Buffer.from(temaFijo.pageHead(db, instalable.pageHead(db, html)), 'utf8');
        origSetHeader.call(this, 'Content-Length', body.length);
      }
    } catch { /* si algo falla, se sirve la pagina tal cual */ }
    return origEnd.call(this, body.length ? body : undefined, done);
  };
}

const DESCARGAS = { android: 'CV-Chat-Android.apk', windows: 'CV-Chat-Windows.exe' };
let versionCache = null;
function appVersion() {
  if (versionCache && Date.now() - versionCache.t < 5000) return versionCache.v;
  const huella = (files) => {
    const h = crypto.createHash('sha1');
    for (const f of files) { try { const st = fs.statSync(f); h.update(f + ':' + st.size + ':' + st.mtimeMs + ';'); } catch { h.update(f + ':-;'); } }
    return h.digest('hex').slice(0, 12);
  };
  let haven = '';
  try { haven = require('/app/package.json').version || ''; } catch { /* fuera del contenedor */ }
  const v = {
    js: huella([path.join(STATIC, 'aviso.js'), path.join(STATIC, 'instalar.js'), path.join(__dirname, 'tema-fijo.js')]) + '-' + haven,
    css: huella(['/app/themes/discord-plus.theme.css']),
  };
  versionCache = { t: Date.now(), v };
  return v;
}
function send(res, status, type, body, headers = {}) {
  if (res.headersSent) return;
  res.writeHead(status, { 'Content-Type': type + '; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers });
  res.end(body);
}
const json = (res, status, obj) => send(res, status, 'application/json', JSON.stringify(obj));

// /api/link-preview?url=... de un enlace a un mensaje o canal de Discord, o a CV Chat mismo
function isMessageLink(previewUrl) {
  let target;
  try { target = new URL(new URL(previewUrl, 'http://x').searchParams.get('url') || ''); } catch { return false; }
  if (/^(?:(?:ptb|canary)\.)?discord(?:app)?\.com$/i.test(target.hostname) && target.pathname.startsWith('/channels/')) return true;
  let own = null;
  try { own = publicUrl ? new URL(publicUrl).hostname : null; } catch { /* sin PUBLIC_URL */ }
  return !!own && target.hostname === own && /^\/app(?:\.html)?$/.test(target.pathname);
}

// Canales de Discord que ve cualquiera del servidor y esta cuenta todavia no (para el aviso de vincular)
function hiddenChannels(havenUserId) {
  let locked = new Set();
  try { locked = require('./accesos.js').lockedChannelIds(); } catch { /* sin accesos */ }
  const rows = db.prepare(`SELECT id FROM channels WHERE discord_channel_id IS NOT NULL AND is_dm = 0 AND parent_channel_id IS NULL
    AND id NOT IN (SELECT channel_id FROM channel_members WHERE user_id = ?)`).all(havenUserId);
  return rows.filter(r => !locked.has(r.id)).length;
}

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
// Las de Discord salen persona por persona (reacciones.js las consulta a Discord
// la primera vez y despues las mantiene al dia).
function canSeeMessage(user, messageId) {
  const m = db.prepare('SELECT channel_id FROM messages WHERE id = ?').get(messageId);
  if (!m) return false;
  const admin = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(user.id);
  if (admin && admin.is_admin) return true;
  return !!db.prepare('SELECT 1 FROM channel_members WHERE channel_id = ? AND user_id = ?').get(m.channel_id, user.id);
}
async function whoReacted(user, messageId) {
  if (!canSeeMessage(user, messageId)) return null;
  const reacciones = require('./reacciones.js');
  try { if (await reacciones.refreshFromDiscord(messageId)) reacciones.emitReactions(messageId); } catch { /* sin Discord: lo que ya se sabe */ }
  return reacciones.reactorsOf(messageId, user.id);
}
// La aplicacion avisa que mensajes se estan viendo; los que tienen reacciones de
// Discord sin consultar se consultan (de a uno) y se actualizan para todos.
function reviewReactions(user, ids) {
  const reacciones = require('./reacciones.js');
  let n = 0;
  for (const id of ids) {
    if (!reacciones.needsReview(id) || !canSeeMessage(user, id)) continue;
    n++;
    reacciones.refreshFromDiscord(id).then(changed => { if (changed) reacciones.emitReactions(id); }).catch(() => {});
  }
  return n;
}

const STATIC = path.join(__dirname, 'web');
async function handle(req, res) {
  const u = new URL(req.url, 'http://x');
  const p = u.pathname;

  if (req.method === 'GET' && (p === '/puente/vincular' || p === '/puente/vincular.js' || p === '/puente/aviso.js' || p === '/puente/login.js' || p === '/puente/instalar.js' || p === '/puente/vincular.css' || p === '/puente/login.css' || p === '/puente/email.js' || p === '/puente/olvide.js' || p === '/puente/olvide' || p === '/puente/entrar' || p === '/puente/entrar.js' || p === '/puente/historia' || p === '/puente/historia.js' || p === '/puente/historia.css' || p === '/puente/descargar' || p === '/puente/descargar.js' || p === '/puente/descargar.css')) {
    const file = p === '/puente/descargar' ? 'descargar.html' : p === '/puente/vincular' ? 'vincular.html' : p === '/puente/olvide' ? 'olvide.html' : p === '/puente/entrar' ? 'entrar.html' : p === '/puente/historia' ? 'historia.html' : p.slice('/puente/'.length);
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
    // Nombre de la app ("CV Chat") en las paginas y sus textos, en vez de "Haven"
    if (file.endsWith('.html') || file.endsWith('.js')) {
      const app = file.endsWith('.html')
        ? appName().replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
        : appName().replace(/[\\'"`\r\n<>]/g, ''); // va dentro de un string de JS
      body = body.toString('utf8').replace(/__PUENTE_APP__/g, app);
    }
    return send(res, 200, type, body);
  }

  // Logo de la pantalla de carga: tools/puente/web/logo-carga.png (propio de cada servidor,
  // no va al repositorio); si no esta, el icono de la app
  // Imagen grande de las notificaciones (avisos.js): tools/puente/web/icono-notificacion.png,
  // propia de cada servidor (no va al repositorio); si no esta, el icono de la app
  if (p === '/puente/icono-notificacion.png' && req.method === 'GET') {
    const file = path.join(STATIC, 'icono-notificacion.png');
    if (!fs.existsSync(file)) { res.writeHead(302, { Location: '/puente/icono-192.png' }); return res.end(); }
    return send(res, 200, 'image/png', fs.readFileSync(file), { 'Cache-Control': 'public, max-age=604800' });
  }

  // Iconos del Marketplace y Juegos en la columna de la izquierda: tools/puente/web/icono-<cual>.webp,
  // propios de cada servidor (no van al repositorio); si no estan, aviso.js usa los dibujados
  const icoCol = req.method === 'GET' && /^\/puente\/icono-(mercado|juegos)\.webp$/.exec(p);
  if (icoCol) {
    const file = path.join(STATIC, 'icono-' + icoCol[1] + '.webp');
    if (!fs.existsSync(file)) return send(res, 404, 'text/plain; charset=utf-8', 'Sin icono');
    return send(res, 200, 'image/webp', fs.readFileSync(file), { 'Cache-Control': 'public, max-age=604800' });
  }

  if (p === '/puente/logo-carga.png' && req.method === 'GET') {
    const file = path.join(STATIC, 'logo-carga.png');
    if (!fs.existsSync(file)) { res.writeHead(302, { Location: '/puente/icono-512.png' }); return res.end(); }
    return send(res, 200, 'image/png', fs.readFileSync(file), { 'Cache-Control': 'public, max-age=604800' });
  }

  // Dibujos de las cartas del truco: tools/puente/web/cartas/<palo>-<n>.webp y dorso.webp, propios de
  // cada servidor (no van al repositorio); si no estan, el juego usa las cartas simples
  const naipe = req.method === 'GET' && /^\/puente\/cartas\/((?:espada|basto|oro|copa)-(?:[1-7]|1[012])|dorso|banner)\.webp$/.exec(p);
  if (naipe) {
    const file = path.join(STATIC, 'cartas', naipe[1] + '.webp');
    if (!fs.existsSync(file)) return send(res, 404, 'text/plain; charset=utf-8', 'Sin dibujo');
    return send(res, 200, 'image/webp', fs.readFileSync(file), { 'Cache-Control': 'public, max-age=604800' });
  }

  // Dibujos del Funball: tools/puente/web/funball/ (piezas, piedra, logo, losa y fondo .webp), propios de cada
  // servidor (no van al repositorio); si no estan, el juego usa sus graficos dibujados
  const fbArte = req.method === 'GET' && /^\/puente\/funball\/(piezas|piedra|logo|losa|fondo)\.webp$/.exec(p);
  if (fbArte) {
    const file = path.join(STATIC, 'funball', fbArte[1] + '.webp');
    if (!fs.existsSync(file)) return send(res, 404, 'text/plain; charset=utf-8', 'Sin dibujo');
    return send(res, 200, 'image/webp', fs.readFileSync(file), { 'Cache-Control': 'public, max-age=604800' });
  }

  // Sonidos del Funball: tools/puente/web/funball/sonidos/<nombre>.mp3, propios de cada servidor
  if (p === '/puente/funball/sonidos.json' && req.method === 'GET') {
    let l = [];
    try { l = fs.readdirSync(path.join(STATIC, 'funball', 'sonidos')).filter(n => /^[a-z-]{1,30}\.mp3$/.test(n)).map(n => n.slice(0, -4)); } catch { /* sin sonidos */ }
    return send(res, 200, 'application/json', JSON.stringify(l), { 'Cache-Control': 'public, max-age=3600' });
  }
  const fbSon = req.method === 'GET' && /^\/puente\/funball\/sonidos\/([a-z-]{1,30})\.mp3$/.exec(p);
  if (fbSon) {
    const file = path.join(STATIC, 'funball', 'sonidos', fbSon[1] + '.mp3');
    if (!fs.existsSync(file)) return send(res, 404, 'text/plain; charset=utf-8', 'Sin sonido');
    return send(res, 200, 'audio/mpeg', fs.readFileSync(file), { 'Cache-Control': 'public, max-age=604800' });
  }

  // Las apps para descargar (pagina /puente/descargar): web/descargas/CV-Chat-Android.apk y
  // CV-Chat-Windows.exe, propias de cada servidor (no van al repositorio), con su version en
  // web/descargas/versiones.json ({ "android": "1.0.0", "windows": "1.0.0" })
  if (p === '/puente/descargas.json' && req.method === 'GET') {
    const dir = path.join(STATIC, 'descargas');
    let ver = {}; try { ver = JSON.parse(fs.readFileSync(path.join(dir, 'versiones.json'), 'utf8')); } catch { /* sin versiones */ }
    const out = {};
    for (const [k, archivo] of Object.entries(DESCARGAS)) { try { out[k] = { tam: fs.statSync(path.join(dir, archivo)).size, version: ver[k] || null }; } catch { /* no esta */ } }
    return json(res, 200, out);
  }
  // (la app de Windows se actualiza sola con latest.yml y el .blockmap, de electron-builder)
  const bajar = req.method === 'GET' && /^\/puente\/descargas\/([A-Za-z0-9-]+\.(?:apk|exe|exe\.blockmap|yml))$/.exec(p);
  if (bajar && (Object.values(DESCARGAS).includes(bajar[1]) || bajar[1] === 'latest.yml' || bajar[1] === DESCARGAS.windows + '.blockmap')) {
    const file = path.join(STATIC, 'descargas', bajar[1]);
    if (!fs.existsSync(file)) return send(res, 404, 'text/plain; charset=utf-8', 'Todavía no está disponible');
    const st = fs.statSync(file);
    res.writeHead(200, { 'Content-Type': bajar[1].endsWith('.apk') ? 'application/vnd.android.package-archive' : bajar[1].endsWith('.yml') ? 'text/yaml; charset=utf-8' : 'application/octet-stream', 'Content-Length': st.size, 'Content-Disposition': `attachment; filename="${bajar[1]}"`, 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
    fs.createReadStream(file).pipe(res);
    return;
  }

  // Version de lo que ve la app (web/aviso.js con el tema, y Haven): la app abierta la consulta
  // cada tanto y se actualiza sola cuando cambia (aviso.js, "Actualizar sola")
  if (p === '/puente/version' && req.method === 'GET') {
    return json(res, 200, appVersion());
  }

  if (p === '/puente/tema-fijo.js' && req.method === 'GET') {
    return send(res, 200, 'application/javascript', temaFijo.script(db));
  }

  // Un administrador publica su diseño para todos (tema-fijo.js)
  if (p === '/puente/api/ui-fija' && req.method === 'POST') {
    if (!temaFijo.on()) return json(res, 404, { error: 'apagado' });
    const user = sessionUser(req);
    if (!user) return json(res, 401, { error: 'sin sesion' });
    const admin = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(user.id);
    if (!admin || !admin.is_admin) return json(res, 403, { error: 'solo administradores' });
    const body = await readJson(req, 200000);
    if (!body || !temaFijo.publish(db, body.forma, body.valores)) return json(res, 400, { error: 'datos invalidos' });
    return json(res, 200, { ok: true });
  }

  // Pagina "Miembros" (web/aviso.js), como la de Discord: solo administradores
  if (p === '/puente/api/miembros' && req.method === 'GET') {
    const user = sessionUser(req);
    if (!user) return json(res, 401, { error: 'sin sesion' });
    const admin = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(user.id);
    if (!admin || !admin.is_admin) return json(res, 403, { error: 'solo administradores' });
    return json(res, 200, { miembros: members() });
  }

  // Los emails de las cuentas, en una planilla (CSV con ";", se abre directo en Excel o
  // Google Sheets): solo administradores, desde la pagina "Miembros"
  if (p === '/puente/api/miembros/emails.csv' && req.method === 'GET') {
    const user = sessionUser(req);
    if (!user) return json(res, 401, { error: 'sin sesion' });
    const admin = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(user.id);
    if (!admin || !admin.is_admin) return json(res, 403, { error: 'solo administradores' });
    let rows = [];
    try {
      rows = db.prepare(`SELECT u.username, u.display_name, u.created_at, e.email, e.confirmado, e.origen, v.discord_username
                         FROM puente_emails e JOIN users u ON u.id = e.haven_user_id
                         LEFT JOIN puente_vinculos v ON v.haven_user_id = u.id
                         WHERE e.email IS NOT NULL AND e.email != '' ORDER BY u.created_at`).all();
    } catch { /* sin la tabla de emails */ }
    const cell = v => { const s = String(v == null ? '' : v); return /[;"\n\r]/.test(s) || /^[=+\-@]/.test(s) ? '"' + s.replace(/^([=+\-@])/, "'$1").replace(/"/g, '""') + '"' : s; };
    const lines = [['usuario', 'nombre', 'email', 'confirmado', 'de donde salio', 'registrado', 'discord'].join(';')];
    for (const r of rows) {
      lines.push([r.username, r.display_name || r.username, r.email, r.confirmado ? 'si' : 'no', r.origen === 'discord' ? 'Discord' : 'lo escribio',
        String(r.created_at || '').slice(0, 10), r.discord_username || ''].map(cell).join(';'));
    }
    const body = '﻿' + lines.join('\r\n') + '\r\n';
    log(`emails: ${user.username} descargo la lista (${rows.length})`);
    res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Cache-Control': 'no-store',
      'Content-Disposition': `attachment; filename="emails-${new Date().toISOString().slice(0, 10)}.csv"` });
    return res.end(body);
  }

  // Personas para completar from: y mentions: del buscador (buscar.js)
  if (p === '/puente/api/buscar/personas' && req.method === 'GET') {
    const user = sessionUser(req);
    if (!user) return json(res, 401, { error: 'sin sesion' });
    return json(res, 200, { personas: require('./buscar.js').people(u.searchParams.get('q') || '') });
  }

  // Cuales de estos mensajes son de un bot o webhook de Discord (etiqueta "APP", web/aviso.js)
  if (p === '/puente/api/apps' && req.method === 'GET') {
    const user = sessionUser(req);
    if (!user) return json(res, 401, { error: 'sin sesion' });
    const ids = [...new Set(String(u.searchParams.get('ids') || '').split(',').map(x => parseInt(x, 10)).filter(x => x > 0))].slice(0, 200);
    if (!ids.length) return json(res, 200, { apps: [] });
    const ph = ids.map(() => '?').join(',');
    let apps = [];
    try {
      apps = db.prepare(`SELECT message_id id FROM puente_apps WHERE message_id IN (${ph})
                          UNION SELECT pa.message_id FROM puente_autores pa JOIN puente_bots b ON b.discord_user_id = pa.discord_user_id
                          WHERE pa.message_id IN (${ph})`).all(...ids, ...ids).map(r => r.id);
    } catch { /* sin las tablas todavia */ }
    return json(res, 200, { apps });
  }

  if (p === '/puente/api/reacciones-frecuentes' && req.method === 'GET') {
    const user = sessionUser(req);
    if (!user) return json(res, 401, { error: 'sin sesion' });
    const n = Math.max(1, Math.min(36, parseInt(u.searchParams.get('n'), 10) || FREQ_N));
    return json(res, 200, { emojis: frequentReactions(user.id, n) });
  }

  // Avatares para la lista de mensajes directos del celular (web/aviso.js)
  if (p === '/puente/api/avatares' && req.method === 'GET') {
    const user = sessionUser(req);
    if (!user) return json(res, 401, { error: 'sin sesion' });
    const ids = String(u.searchParams.get('ids') || '').split(',').map(x => parseInt(x, 10)).filter(x => x > 0).slice(0, 200);
    const out = {};
    const q = db.prepare('SELECT id, avatar, COALESCE(display_name, username) name FROM users WHERE id = ?');
    for (const id of ids) { const r = q.get(id); if (r) out[id] = { avatar: r.avatar || null, nombre: r.name }; }
    return json(res, 200, out);
  }

  // A donde lleva un enlace a un mensaje o a un canal, de CV Chat (?id= o ?codigo=)
  // o de Discord (?discord=<mensaje>&canal=<canal o hilo>), para abrirlo aca mismo
  // (web/aviso.js). Solo si la persona puede ver ese canal; si no, la misma
  // respuesta que si no existiera.
  // Imagenes livianas para el chat (miniaturas.js): publicas, como /uploads
  if (p.startsWith('/puente/mini/') && req.method === 'GET') return require('./miniaturas.js').serve(req, res, p);

  // Embeds de Discord de estos mensajes (embeds.js), para dibujar las vistas previas al instante
  if (p === '/puente/api/embeds' && req.method === 'GET') {
    const user = sessionUser(req);
    if (!user) return json(res, 401, { error: 'sin sesion' });
    const ids = [...new Set(String(u.searchParams.get('ids') || '').split(',').map(x => parseInt(x, 10)).filter(x => x > 0))].slice(0, 100);
    return json(res, 200, await require('./embeds.js').forUser(user, ids));
  }

  if (p === '/puente/api/mensaje' && req.method === 'GET') {
    const user = sessionUser(req);
    if (!user) return json(res, 401, { error: 'sin sesion' });
    const sp = u.searchParams, snow = v => /^\d{5,25}$/.test(v || '');
    const byMsg = db.prepare('SELECT id, channel_id, thread_id FROM messages WHERE id = ?');
    const didQ = db.prepare('SELECT id, channel_id, thread_id FROM messages WHERE discord_message_id = ?');
    const byDid = did => didQ.get(did) || didQ.get('thread-' + did) || null; // dos busquedas por el indice (con OR recorre todo)
    let m = null, chId = null;
    const id = parseInt(sp.get('id'), 10);
    if (id > 0) m = byMsg.get(id) || null;
    else if (snow(sp.get('discord'))) m = byDid(sp.get('discord'));
    if (m) chId = m.channel_id;
    else if (/^[a-f0-9]{8}$/i.test(sp.get('codigo') || '')) chId = (db.prepare('SELECT id FROM channels WHERE code = ?').get(sp.get('codigo')) || {}).id || null;
    if (!chId && snow(sp.get('canal'))) {
      const c = db.prepare('SELECT id FROM channels WHERE discord_channel_id = ?').get(sp.get('canal'));
      if (c) chId = c.id;
      else { m = byDid(sp.get('canal')); if (m) chId = m.channel_id; } // un hilo: su mensaje de origen
    }
    const ch = chId ? db.prepare('SELECT id, code, name, is_dm FROM channels WHERE id = ?').get(chId) : null;
    const admin = (db.prepare('SELECT is_admin FROM users WHERE id = ?').get(user.id) || {}).is_admin;
    const member = ch && db.prepare('SELECT 1 FROM channel_members WHERE channel_id = ? AND user_id = ?').get(ch.id, user.id);
    if (!ch || !(member || (admin && !ch.is_dm))) return json(res, 404, { error: 'no esta' });
    return json(res, 200, { codigo: ch.code, canal: ch.is_dm ? null : ch.name, mensaje: m ? m.id : null, hilo: m && m.thread_id ? m.thread_id : null });
  }

  // Canales con candadito en la lista (accesos.js): solo de los canales que la persona ya ve
  if (p === '/puente/api/canales-cerrados' && req.method === 'GET') {
    const user = sessionUser(req);
    if (!user) return json(res, 401, { error: 'sin sesion' });
    const locked = require('./accesos.js').lockedChannelIds();
    const admin = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(user.id);
    const rows = admin && admin.is_admin
      ? db.prepare('SELECT id, code FROM channels WHERE is_dm = 0').all()
      : db.prepare('SELECT c.id, c.code FROM channel_members m JOIN channels c ON c.id = m.channel_id WHERE m.user_id = ? AND c.is_dm = 0').all(user.id);
    return json(res, 200, { codigos: rows.filter(r => locked.has(r.id)).map(r => r.code) });
  }

  if (p === '/puente/api/permisos' && req.method === 'GET') {
    const user = sessionUser(req);
    if (!user) return json(res, 401, { error: 'sin sesion' });
    const accesos = require('./accesos.js');
    const code = String(u.searchParams.get('canal') || '');
    const admin = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(user.id);
    const perms = accesos.isEnabled() && /^[a-f0-9]{8}$/i.test(code) ? accesos.channelPermissions(user.id, !!(admin && admin.is_admin), code) : null;
    return json(res, 200, perms || { enviar: true, hilos: true, reaccionar: true, adjuntar: true });
  }

  if (p === '/puente/api/reacciones/revisar' && req.method === 'GET') {
    const user = sessionUser(req);
    if (!user) return json(res, 401, { error: 'sin sesion' });
    const ids = String(u.searchParams.get('mensajes') || '').split(',').map(x => parseInt(x, 10)).filter(x => x > 0).slice(0, 60);
    return json(res, 200, { revisando: reviewReactions(user, ids) });
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
      // Para el menu lateral del celular (como Discord): miembros y avatar propio
      miembros: db.prepare("SELECT COUNT(*) n FROM users WHERE username != 'discord-historial'").get().n,
      avatar: (db.prepare('SELECT avatar FROM users WHERE id = ?').get(user.id) || {}).avatar || null,
      // Sin vincular: cuantos canales de Discord (de los que ve cualquiera) veria al vincular
      canalesOcultos: link ? 0 : hiddenChannels(user.id),
    });
  }

  if (p === '/puente/api/iniciar' && req.method === 'POST') {
    const user = sessionUser(req);
    if (!user) return json(res, 401, { error: 'sin sesion' });
    if (!clientId || !clientSecret) return json(res, 503, { error: 'La vinculacion todavia no esta configurada en el servidor.' });
    const now = Date.now();
    for (const [k, v] of states) if (v.exp < now) states.delete(k);
    const state = crypto.randomBytes(24).toString('hex');
    return json(res, 200, { url: authorizeUrl({ purpose: 'link', userId: user.id }, email.on() ? 'identify email' : 'identify') });
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
    await setPassword(user, password, 'con Discord');
    return json(res, 200, { ok: true, usuario: user.username });
  }

  // ── Email de recuperacion (email.js) ──
  if (p.startsWith('/puente/api/email/') || p === '/puente/email/confirmar') {
    if (!email.on()) return json(res, 404, { error: 'apagado' });
    if (p === '/puente/email/confirmar' && req.method === 'GET') {
      const r = email.confirm(u.searchParams.get('t') || '');
      return send(res, r.ok ? 200 : 400, 'text/html', resultPage(r.ok ? 'Email confirmado' : 'No se pudo confirmar',
        r.ok ? `Listo: ${r.email} quedó confirmado. Si alguna vez olvidás tu contraseña, la podés recuperar con él.` : r.error));
    }
    if (p === '/puente/api/email/olvide' && req.method === 'POST') {
      const body = await readJson(req);
      // Detras de Caddy: la ultima direccion de X-Forwarded-For es la de quien pide
      const ip = String(req.headers['x-forwarded-for'] || '').split(',').pop().trim() || req.socket.remoteAddress || '?';
      const r = await email.forgot(body && body.email, ip);
      return json(res, r.ok ? 200 : 400, r);
    }
    if (p === '/puente/api/email/restablecer' && req.method === 'GET') {
      const r = email.resetInfo(u.searchParams.get('t') || '');
      return r ? json(res, 200, r) : json(res, 404, { error: 'El enlace caducó o ya se usó. Pedí uno nuevo.' });
    }
    if (p === '/puente/api/email/restablecer' && req.method === 'POST') {
      const body = await readJson(req);
      const r = await email.reset(body && typeof body.t === 'string' ? body.t : '', body && typeof body.password === 'string' ? body.password : '');
      return json(res, r.ok ? 200 : r.status, r);
    }
    const user = sessionUser(req);
    if (!user) return json(res, 401, { error: 'sin sesion' });
    if (p === '/puente/api/email/estado' && req.method === 'GET') {
      const linked = !!db.prepare('SELECT 1 FROM puente_vinculos WHERE haven_user_id = ?').get(user.id);
      // Con PUENTE_EMAIL_OBLIGATORIO=1, quien no tiene email (salvo los invitados) no puede cerrar el cartel sin poner uno
      const guest = (db.prepare('SELECT is_guest FROM users WHERE id = ?').get(user.id) || {}).is_guest;
      const obligatorio = process.env.PUENTE_EMAIL_OBLIGATORIO === '1' && !guest;
      return json(res, 200, { ...email.status(user.id), discord: !!(clientId && clientSecret), vinculado: linked, obligatorio });
    }
    if (p === '/puente/api/email/guardar' && req.method === 'POST') {
      const body = await readJson(req);
      const r = await email.saveAndVerify(user.id, body && body.email);
      return json(res, r.ok ? 200 : 400, r);
    }
    if (p === '/puente/api/email/reenviar' && req.method === 'POST') {
      const r = await email.resend(user.id);
      return json(res, r.ok ? 200 : 400, r);
    }
    if (p === '/puente/api/email/discord' && req.method === 'POST') {
      if (!clientId || !clientSecret) return json(res, 503, { error: 'Discord no está configurado en el servidor.' });
      return json(res, 200, { url: authorizeUrl({ purpose: 'email', userId: user.id }, 'identify email') });
    }
    return send(res, 404, 'text/plain', 'No encontrado');
  }

  // ── Entrar con Discord ──
  if (p === '/puente/api/entrar/iniciar' && req.method === 'POST') {
    if (!clientId || !clientSecret || !generateToken) return json(res, 503, { error: 'Entrar con Discord todavía no está configurado en el servidor.' });
    return json(res, 200, { url: authorizeUrl({ purpose: 'login' }, 'identify email') });
  }
  if (p === '/puente/api/entrar/sesion' && req.method === 'POST') {
    const body = await readJson(req);
    const code = body && typeof body.codigo === 'string' ? body.codigo : '';
    const h = handoffs.get(code);
    handoffs.delete(code); // un solo uso
    if (!h || h.exp < Date.now()) return json(res, 404, { error: 'El paso caducó. Volvé a tocar "Entrar con Discord".' });
    return json(res, 200, { token: h.token, user: h.user });
  }
  if (p === '/puente/api/entrar/nuevo' && req.method === 'GET') {
    const sg = signups.get(u.searchParams.get('codigo') || '');
    if (!sg || sg.exp < Date.now()) return json(res, 404, { error: 'El paso caducó. Volvé a tocar "Entrar con Discord".' });
    return json(res, 200, { nombre: sg.me.global_name || sg.me.username, discord: sg.me.username, avatar: discordAvatarUrl(sg.me), usuario: proposeUsername(sg.me), app: appName() });
  }
  if (p === '/puente/api/entrar/crear' && req.method === 'POST') {
    const body = await readJson(req);
    const code = body && typeof body.codigo === 'string' ? body.codigo : '';
    const sg = signups.get(code);
    if (!sg || sg.exp < Date.now()) return json(res, 404, { error: 'El paso caducó. Volvé a tocar "Entrar con Discord".' });
    if (!body.acepto) return json(res, 400, { error: 'Tenés que aceptar las condiciones y confirmar que tenés 18 años o más.' });
    const username = String(body.usuario || '').trim();
    const problem = usernameProblem(username) || require('./identidad.js').problem(0, username, sg.me.id);
    if (problem) return json(res, 400, { error: problem });
    if (db.prepare('SELECT 1 FROM puente_vinculos WHERE discord_user_id = ?').get(sg.me.id)) { signups.delete(code); return json(res, 409, { error: 'Ese Discord ya tiene una cuenta. Volvé a tocar "Entrar con Discord".' }); }
    const r = await registerThroughHaven(req, username);
    if (!r.ok) return json(res, 400, { error: r.error });
    signups.delete(code);
    const me = sg.me;
    const moved = link(r.user.id, me);
    try {
      const av = me.avatar ? await adjuntos.avatar(me.id, me.avatar) : null;
      if (av) db.prepare('UPDATE users SET avatar = ? WHERE id = ? AND avatar IS NULL').run(av, r.user.id);
    } catch (err) { warn('avatar de Discord:', err.message); }
    try { await onLinked(me.id); } catch (err) { warn('accesos al vincular:', err.message); }
    try { email.fromDiscordIfMissing(r.user.id, me); } catch (err) { warn('email de Discord:', err.message); }
    log(`cuenta nueva con Discord: ${username} (Haven #${r.user.id}) <-> Discord ${me.username} (${me.id}); ${moved} mensajes historicos pasados a su cuenta`);
    return json(res, 200, sessionFor(r.user.id));
  }

  // Solo en la copia de prueba (PUENTE_PRUEBA_ENTRAR=1): la vuelta de Discord, simulada
  if (p === '/puente/api/entrar/prueba' && req.method === 'POST' && process.env.PUENTE_PRUEBA_ENTRAR === '1') {
    const body = await readJson(req);
    if (!body || !body.me || !body.me.id) return json(res, 400, { error: 'falta me' });
    return json(res, 200, loginWithDiscord(body.me));
  }

  if (p === '/puente/discord/callback' && req.method === 'GET') {
    const state = u.searchParams.get('state') || '';
    const entry = states.get(state);
    states.delete(state);
    // Al entrar con Discord, los avisos van a /puente/entrar; el resto, a /puente/vincular
    const back = (params) => send(res, 302, 'text/plain', '', { Location: `${entry && entry.purpose === 'login' ? '/puente/entrar' : '/puente/vincular'}?${new URLSearchParams(params)}` });
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

    if (entry.purpose === 'login') return back(loginWithDiscord(me));

    if (entry.purpose === 'email') {
      const r = email.on() ? email.fromDiscord(entry.userId, me) : { error: 'sin-email' };
      return send(res, 302, 'text/plain', '', { Location: `/app?puente_email=${r.ok ? 'ok' : r.error}` });
    }

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
    email.fromDiscordIfMissing(entry.userId, me);
    log(`vinculado: Haven #${entry.userId} <-> Discord ${me.username} (${me.id}); ${moved} mensajes historicos pasados a su cuenta`);
    return back({ ok: '1', mensajes: String(moved) });
  }

  if (p.startsWith('/puente/api/perfil/') || p.startsWith('/puente/fuentes/')) {
    const r = await require('./perfil.js').handle(req, res, p, u, { sessionUser, json, readJson });
    if (r !== false) return;
  }
  if (p.startsWith('/puente/api/mercado/')) {
    const r = await require('./mercado.js').handle(req, res, p, u, { sessionUser, json, readJson });
    if (r !== false) return;
  }
  if (p.startsWith('/puente/api/invitacion/')) {
    const r = await require('./invitaciones.js').handle(req, res, p, u, { sessionUser, json, readJson });
    if (r !== false) return;
  }
  if (p.startsWith('/puente/api/logros/')) {
    const r = await require('./logros.js').handle(req, res, p, u, { sessionUser, json });
    if (r !== false) return;
  }

  return send(res, 404, 'text/plain', 'No encontrado');
}

// Titulo y vista previa al compartir el enlace (WhatsApp, Telegram, X, Discord):
// esos sitios leen la pagina sin ejecutarla, asi que va escrito en el HTML. En
// lugar de "Haven | Login", el nombre de la app (PUENTE_TITULO) con el logo y
// una descripcion corta.
function shareTags(html) {
  if (!process.env.PUENTE_TITULO || html.includes('property="og:title"')) return html;
  const esc = v => String(v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const row = db.prepare("SELECT value FROM server_settings WHERE key = 'server_name'").get();
  const title = appName();
  const server = String((row && row.value) || '').trim();
  const desc = server ? `El chat de ${server}. Entrá y creá tu cuenta.` : 'Entrá y creá tu cuenta.';
  const image = publicUrl ? `${publicUrl}/puente/logo-carga.png` : '/puente/logo-carga.png';
  const tags = `<meta property="og:type" content="website"><meta property="og:title" content="${esc(title)}">` +
    `<meta property="og:site_name" content="${esc(server || title)}"><meta property="og:description" content="${esc(desc)}">` +
    `<meta name="description" content="${esc(desc)}"><meta property="og:image" content="${esc(image)}">` +
    (publicUrl ? `<meta property="og:url" content="${esc(publicUrl + '/')}">` : '') +
    `<meta name="twitter:card" content="summary"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(desc)}">`;
  return html.replace(/<title[^>]*>[^<]*<\/title>/i, `<title>${esc(title)}</title>`).replace('</head>', tags + '</head>');
}

function appName() {
  const row = db.prepare("SELECT value FROM server_settings WHERE key = 'server_name'").get();
  return String(process.env.PUENTE_TITULO || (row && row.value) || 'Haven').trim() || 'Haven';
}

// Contraseña nueva, lo mismo que hace Haven al usar un codigo de recuperacion:
// borra las claves de los mensajes directos cifrados y cierra las sesiones
// abiertas (Haven deja de aceptar sus tokens al subir password_version).
async function setPassword(user, password, how) {
  const bcrypt = require('/app/node_modules/bcryptjs');
  const hash = await bcrypt.hash(password, 12);
  db.prepare(`UPDATE users SET password_hash = ?, password_version = ?, temp_password_hash = NULL, must_change_password = 0,
                public_key = NULL, encrypted_private_key = NULL, e2e_key_salt = NULL, e2e_secret = NULL, e2e_passphrase = 0
              WHERE id = ?`).run(hash, (user.password_version || 1) + 1, user.id);
  try {
    for (const so of io.of('/').sockets.values()) {
      if (so.user && so.user.id === user.id) { so.emit('force-logout', { reason: 'password_changed' }); so.disconnect(true); }
    }
  } catch { /* sin sesiones abiertas */ }
  log(`recuperacion ${how}: contraseña nueva para "${user.username}" (Haven #${user.id}); sesiones cerradas y claves E2E borradas`);
}

// Pagina chiquita de resultado (confirmar el email), con el aspecto del ingreso
function resultPage(title, text) {
  const esc = v => String(v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(appName())}</title><link rel="stylesheet" href="/puente/login.css"></head>
<body class="auth-page"><div class="auth-container"><div class="auth-card"><div class="auth-header">
<img class="puente-login-logo" src="/puente/logo-carga.png" alt=""><h1>${esc(title)}</h1><p class="puente-login-sub">${esc(text)}</p></div>
<a class="btn-primary puente-boton" href="/app">Ir a ${esc(appName())}</a></div></div></body></html>`;
}

// Todos los usuarios con lo que muestra la pagina "Miembros": desde cuando
// estan, su cuenta de Discord (y su antiguedad, que va en el numero de la
// cuenta), con que invitacion entraron, roles, mensajes y algunas señales.
let membersCache = null;
function members() {
  if (membersCache && Date.now() - membersCache.at < 60 * 1000) return membersCache.list;
  const users = db.prepare(`SELECT id, username, display_name, avatar, created_at, is_admin, is_guest, totp_enabled
                            FROM users WHERE username != 'discord-historial'`).all();
  const counts = new Map(db.prepare(`SELECT user_id, COUNT(*) n, MAX(created_at) ultimo FROM messages
                                     WHERE user_id IS NOT NULL AND imported_from IS NULL GROUP BY user_id`).all().map(r => [r.user_id, r]));
  const roles = new Map();
  for (const r of db.prepare(`SELECT ur.user_id, r.name, r.color FROM user_roles ur JOIN roles r ON r.id = ur.role_id
                              WHERE ur.channel_id IS NULL ORDER BY r.level DESC`).all()) {
    if (!roles.has(r.user_id)) roles.set(r.user_id, []);
    if (!roles.get(r.user_id).some(x => x.nombre === r.name)) roles.get(r.user_id).push({ nombre: r.name, color: r.color || null });
  }
  const invites = new Map(db.prepare(`SELECT u.user_id, c.code, c.label FROM invite_code_uses u JOIN invite_codes c ON c.id = u.invite_code_id`)
    .all().map(r => [r.user_id, r.label || r.code]));
  const links = new Map(db.prepare('SELECT haven_user_id, discord_user_id, discord_username, discord_global_name, linked_at FROM puente_vinculos').all()
    .map(r => [r.haven_user_id, r]));
  let emails = new Map();
  try { emails = new Map(db.prepare('SELECT haven_user_id, confirmado FROM puente_emails').all().map(r => [r.haven_user_id, r.confirmado ? 'confirmado' : 'pendiente'])); } catch { /* sin email */ }
  const online = new Set();
  try { for (const so of io.of('/').sockets.values()) if (so.user && so.user.id) online.add(so.user.id); } catch { /* sin conexiones */ }
  const utc = s => (!s ? null : s.endsWith('Z') ? s : s.replace(' ', 'T') + 'Z');
  const discordCreated = id => { try { return new Date(Number((BigInt(id) >> 22n) + 1420070400000n)).toISOString(); } catch { return null; } };
  const list = users.map(u => {
    const c = counts.get(u.id), l = links.get(u.id);
    return {
      id: u.id, nombre: u.display_name || u.username, usuario: u.username, avatar: u.avatar || null,
      desde: utc(u.created_at), admin: !!u.is_admin, invitado: !!u.is_guest, dosPasos: !!u.totp_enabled,
      mensajes: c ? c.n : 0, ultimo: c ? utc(c.ultimo) : null,
      roles: roles.get(u.id) || [], invitacion: invites.get(u.id) || null,
      discord: l ? { usuario: l.discord_username, nombre: l.discord_global_name || null, desde: discordCreated(l.discord_user_id), vinculado: utc(l.linked_at) } : null,
      email: emails.get(u.id) || null, enLinea: online.has(u.id),
    };
  });
  membersCache = { at: Date.now(), list };
  return list;
}

function redirectUri() { return `${publicUrl}/puente/discord/callback`; }

function authorizeUrl(entry, scope = 'identify') {
  const now = Date.now();
  for (const [k, v] of states) if (v.exp < now) states.delete(k);
  for (const [k, v] of recoveries) if (v.exp < now) recoveries.delete(k);
  const state = crypto.randomBytes(24).toString('hex');
  states.set(state, { ...entry, exp: now + STATE_TTL_MS });
  const q = new URLSearchParams({ client_id: clientId, response_type: 'code', scope, redirect_uri: redirectUri(), state, prompt: 'consent' });
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


// ── Entrar con Discord: ayudas ──
// Que hacer con quien volvio de Discord: { listo } (entra), { nuevo } (crear la cuenta) o { error }
function loginWithDiscord(me) {
  const now = Date.now();
  for (const m of [handoffs, signups]) for (const [k, v] of m) if (v.exp < now) m.delete(k);
  const code = crypto.randomBytes(24).toString('hex');
  const l = db.prepare('SELECT haven_user_id FROM puente_vinculos WHERE discord_user_id = ?').get(String(me.id));
  if (!l) {
    if (require('./baneos.js').isDiscordBanned(me.id)) return { error: 'ban' };
    signups.set(code, { me, exp: now + SIGNUP_TTL_MS }); return { nuevo: code };
  }
  const user = db.prepare('SELECT id, username, is_admin, totp_enabled FROM users WHERE id = ?').get(l.haven_user_id);
  if (!user) return { error: 'discord' };
  // Como en la recuperacion: los admins y las cuentas con verificacion en dos pasos, con contraseña
  if (user.is_admin) return { error: 'admin' };
  if (user.totp_enabled) return { error: '2fa' };
  if (db.prepare('SELECT 1 FROM bans WHERE user_id = ?').get(user.id)) return { error: 'ban' };
  handoffs.set(code, { ...sessionFor(user.id), exp: now + HANDOFF_TTL_MS });
  log(`entro con Discord: ${user.username} (Haven #${user.id})`);
  return { listo: code };
}
// La sesion de Haven para una cuenta (como la da su inicio de sesion)
function sessionFor(userId) {
  const u = db.prepare('SELECT id, username, display_name, is_admin FROM users WHERE id = ?').get(userId);
  const user = { id: u.id, username: u.username, isAdmin: !!u.is_admin, displayName: u.display_name || u.username };
  return { token: generateToken({ id: user.id, username: user.username, isAdmin: user.isAdmin, displayName: user.displayName }), user };
}
function discordAvatarUrl(me) {
  if (me.avatar) return `https://cdn.discordapp.com/avatars/${me.id}/${me.avatar}.png?size=128`;
  return `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(me.id) >> 22n) % 6}.png`;
}
const RESERVED = () => String(process.env.ADMIN_USERNAME || '').toLowerCase();
const usernameTaken = name => !!db.prepare('SELECT 1 FROM users WHERE LOWER(username) = LOWER(?)').get(name) || name.toLowerCase() === RESERVED() || name.toLowerCase() === 'discord-historial';
// Las reglas de usuario de Haven: 3 a 20 caracteres, letras, numeros y "_"
function usernameProblem(name) {
  if (name.length < 3 || name.length > 20) return 'El nombre de usuario tiene que tener entre 3 y 20 caracteres.';
  if (!/^[a-zA-Z0-9_]+$/.test(name)) return 'El nombre de usuario solo puede tener letras, números y "_".';
  if (usernameTaken(name)) return 'Ese nombre de usuario ya existe: elegí otro.';
  return null;
}
// El de Discord, adaptado a esas reglas y libre
function proposeUsername(me) {
  let base = String(me.username || '').replace(/[^a-zA-Z0-9_]+/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '').slice(0, 20);
  if (base.length < 3) base = (base + '_cv').replace(/^_+/, '').padEnd(3, '0').slice(0, 20);
  if (!usernameTaken(base)) return base;
  for (let i = 2; i < 1000; i++) { const c = base.slice(0, 20 - String(i).length) + i; if (!usernameTaken(c)) return c; }
  return base.slice(0, 14) + crypto.randomBytes(3).toString('hex');
}
// Crear la cuenta con el registro de Haven (sus reglas, roles y canales de entrada),
// con una contraseña al azar: se entra con Discord, y si quiere una contraseña, la
// pone con "¿Olvidaste tu contraseña?"
async function registerThroughHaven(req, username) {
  const ip = String(req.headers['x-forwarded-for'] || '').split(',').pop().trim() || req.socket.remoteAddress || '';
  const password = crypto.randomBytes(24).toString('base64url');
  try {
    const r = await fetch(`http://127.0.0.1:${process.env.PORT || 3000}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip, 'X-Puente-Interno': INTERNAL },
      body: JSON.stringify({ username, password, eulaVersion: '2.0', ageVerified: true }),
      signal: AbortSignal.timeout(20000),
    });
    const data = await r.json().catch(() => ({}));
    if (r.ok && data.user && data.user.id) return { ok: true, user: data.user };
    if (data.code === 'username_unavailable') return { ok: false, error: 'Ese nombre de usuario ya existe: elegí otro.' };
    if (r.status === 429) return { ok: false, error: 'Hubo demasiados intentos. Esperá un rato y probá de nuevo.' };
    if (r.status === 403) return { ok: false, error: 'El registro de cuentas nuevas está cerrado ahora. Pedile ayuda a un administrador.' };
    warn('entrar con Discord: Haven no creo la cuenta:', r.status, data.error || '');
    return { ok: false, error: 'No se pudo crear la cuenta. Probá de nuevo en un momento.' };
  } catch (err) {
    warn('entrar con Discord:', err.message);
    return { ok: false, error: 'No se pudo crear la cuenta. Probá de nuevo en un momento.' };
  }
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
    // Sin el nombre de Discord guardado en cada mensaje: se ven con el de la cuenta (nombres.js)
    const moved = db.prepare(`UPDATE messages SET user_id = ?, imported_from = NULL, webhook_username = NULL
                       WHERE id IN (SELECT message_id FROM puente_autores WHERE discord_user_id = ?) AND imported_from = 'discord'`)
      .run(havenUserId, me.id).changes;
    nombres.applyName(db, havenUserId, me.global_name || me.username);
    return moved;
  })();
}

function unlink(havenUserId, discordUserId) {
  return db.transaction(() => {
    const l = db.prepare('SELECT discord_username, discord_global_name FROM puente_vinculos WHERE haven_user_id = ?').get(havenUserId);
    const restored = db.prepare(`UPDATE messages SET user_id = ?, imported_from = 'discord', webhook_username = COALESCE(webhook_username, ?)
                                 WHERE id IN (SELECT message_id FROM puente_autores WHERE discord_user_id = ?) AND user_id = ?`)
      .run(ghostId(), (l && (l.discord_global_name || l.discord_username)) || 'Discord', discordUserId, havenUserId).changes;
    nombres.releaseName(db, havenUserId);
    db.prepare('DELETE FROM puente_vinculos WHERE haven_user_id = ?').run(havenUserId);
    return restored;
  })();
}

// El puente y la sincronizacion apuntan aqui el autor de cada mensaje de Discord.
function recordAuthor(messageId, discordUserId) {
  if (messageId && discordUserId) db.prepare('INSERT OR IGNORE INTO puente_autores (message_id, discord_user_id) VALUES (?, ?)').run(messageId, discordUserId);
}

module.exports = { setup, recordAuthor, whoReacted };
