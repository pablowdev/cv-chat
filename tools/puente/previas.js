// Las vistas previas de los enlaces, al instante (parte del puente). Haven las pide una por una
// recien cuando dibuja el mensaje (/api/link-preview, de a 3 a la vez) y las recuerda solo media
// hora en memoria: pasado ese rato, o despues de reiniciar, cada una volvia a buscarse en la pagina
// del enlace y la tarjeta aparecia un segundo despues que el mensaje. Ahora:
//
//  - Lo que contesta /api/link-preview se guarda en la base (puente_previas): 3 dias las tarjetas,
//    6 horas cuando no hay nada para mostrar, 1 hora las del foro (cambian con las respuestas).
//    Se contesta desde ahi sin preguntarle a Haven.
//  - Los mensajes que llegan (al abrir un canal o un hilo, y los nuevos) traen las tarjetas que ya
//    estan guardadas (puentePrevias): web/aviso.js las pone en la memoria de Haven antes de que
//    dibuje el mensaje, asi salen junto con el.
//  - Un enlace nuevo en un mensaje se busca en seguida (para los que lo vean despues). El que lo
//    escribe la pide mientras escribe (web/aviso.js), asi casi siempre ya esta cuando lo manda.
// Las del Marketplace no se guardan (muestran las ultimas publicaciones).

const http = require('http');

const DIA = 864e5;
const TTL = 3 * DIA, TTL_VACIA = 6 * 3600e3, TTL_FORO = 3600e3;
const MAX_FILAS = 20000;
const URL_RE = /https?:\/\/[^\s<>()"'`]+/g;
let db = null, warn = () => {}, generateToken = null;
let qGet = null, qSet = null;
const buscando = new Set();

function setup(ctx) {
  ({ db, warn } = ctx);
  db.exec('CREATE TABLE IF NOT EXISTS puente_previas (url TEXT PRIMARY KEY, datos TEXT NOT NULL, vence INTEGER NOT NULL)');
  qGet = db.prepare('SELECT datos, vence FROM puente_previas WHERE url = ?');
  qSet = db.prepare('INSERT OR REPLACE INTO puente_previas (url, datos, vence) VALUES (?, ?, ?)');
  try { ({ generateToken } = require('/app/src/auth')); } catch (err) { warn('previas: sin auth de Haven:', err.message); }
  // Las vencidas se borran de vez en cuando (y si hay demasiadas, las mas viejas)
  const limpiar = () => {
    try {
      db.prepare('DELETE FROM puente_previas WHERE vence < ?').run(Date.now());
      const n = db.prepare('SELECT COUNT(*) n FROM puente_previas').get().n;
      if (n > MAX_FILAS) db.prepare('DELETE FROM puente_previas WHERE url IN (SELECT url FROM puente_previas ORDER BY vence LIMIT ?)').run(n - MAX_FILAS);
    } catch (err) { warn('previas: limpieza:', err.message); }
  };
  setTimeout(limpiar, 60e3).unref();
  setInterval(limpiar, 6 * 3600e3).unref();
  if (ctx.io) escuchar(ctx.io);
}

const vacia = (d) => !d || (!d.title && !d.description && !d.text);
const permitida = (url) => { try { return require('/app/src/automod').previewAllowed(url); } catch { return true; } };
function guardada(url) {
  if (!qGet) return null;
  try {
    const r = qGet.get(url);
    if (!r || r.vence < Date.now()) return null;
    return JSON.parse(r.datos);
  } catch { return null; }
}
function guardar(url, d) {
  if (!qSet || !url || url.length > 2000) return;
  let ttl = vacia(d) ? TTL_VACIA : TTL;
  try { if (/^foro\./i.test(new URL(url).hostname)) ttl = Math.min(ttl, TTL_FORO); } catch { return; }
  try { qSet.run(url, JSON.stringify(d), Date.now() + ttl); } catch (err) { warn('previas:', err.message); }
}

// GET /api/link-preview?url=...: si esta guardada (y vigente), se contesta desde aca y true. Si no,
// se anota lo que conteste Haven (o el resto del puente) y false, para que siga como siempre
function handle(req, res, user) {
  let url = '';
  try { url = (new URL(req.url, 'http://x').searchParams.get('url') || '').trim(); } catch { return false; }
  if (!url || !user) return false;
  const d = guardada(url);
  if (d && permitida(url)) {
    const body = Buffer.from(JSON.stringify(d));
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': body.length, 'Cache-Control': 'no-store' });
    res.end(body);
    return true;
  }
  anotar(res, url);
  return false;
}
function anotar(res, url) {
  const chunks = [];
  const { write, end, writeHead } = res;
  let cab = {}; // las cabeceras que van directo en writeHead (asi contesta el resto del puente) no las da getHeader
  res.writeHead = function (s, a, b) { const h = typeof a === 'object' && a ? a : b; if (h && typeof h === 'object' && !Array.isArray(h)) for (const k of Object.keys(h)) cab[k.toLowerCase()] = h[k]; return writeHead.apply(this, arguments); };
  res.write = function (c, enc, cb) { try { if (c && typeof c !== 'function') chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c, typeof enc === 'string' ? enc : 'utf8')); } catch { /* sigue */ } return write.apply(this, arguments); };
  res.end = function (c, enc, cb) {
    try {
      if (c && typeof c !== 'function') chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c, typeof enc === 'string' ? enc : 'utf8'));
      const tipo = String(res.getHeader('content-type') || cab['content-type'] || '');
      const comprimida = res.getHeader('content-encoding') || cab['content-encoding'];
      if (res.statusCode === 200 && /json/.test(tipo) && !comprimida) {
        const d = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (d && typeof d === 'object' && !d.error) guardar(url, d);
      }
    } catch { /* no se guarda */ }
    return end.apply(this, arguments);
  };
}

// Los enlaces de un texto, como los arma el navegador (a.href), que es como los busca Haven
function enlaces(texto) {
  const out = new Set();
  for (let m of String(texto || '').match(URL_RE) || []) {
    m = m.replace(/[.,;:!?*_~|>\]]+$/, '');
    try { out.add(new URL(m).href); } catch { /* no es una direccion */ }
    if (out.size >= 10) break;
  }
  return [...out];
}
function previasDe(mensajes) {
  const out = {};
  let n = 0;
  for (const m of mensajes) {
    if (!m || typeof m.content !== 'string' || m.content.indexOf('http') < 0) continue;
    for (const u of enlaces(m.content)) {
      if (u in out) continue;
      const d = guardada(u);
      if (d && permitida(u)) { out[u] = d; if (++n >= 120) return out; }
    }
  }
  return n ? out : null;
}

// Un enlace nuevo se pide en seguida, por dentro, como si lo pidiera el que lo escribio
function buscar(mensaje) {
  if (!generateToken || !mensaje || !mensaje.user_id || typeof mensaje.content !== 'string') return;
  const nuevos = enlaces(mensaje.content).filter(u => !buscando.has(u) && !guardada(u) && !/\.(jpe?g|png|gif|webp)(\?|$)/i.test(u)).slice(0, 4);
  if (!nuevos.length) return;
  let token;
  try {
    const u = db.prepare('SELECT id, username, display_name, is_admin FROM users WHERE id = ?').get(mensaje.user_id);
    if (!u) return;
    token = generateToken({ id: u.id, username: u.username, isAdmin: !!u.is_admin, displayName: u.display_name || u.username });
  } catch { return; }
  for (const url of nuevos) {
    buscando.add(url);
    const r = http.get({ host: '127.0.0.1', port: process.env.PORT || 3000, path: '/api/link-preview?url=' + encodeURIComponent(url), headers: { Authorization: 'Bearer ' + token }, timeout: 15000 }, (resp) => { resp.resume(); resp.on('end', () => buscando.delete(url)); });
    r.on('error', () => buscando.delete(url));
    r.on('timeout', () => { r.destroy(); buscando.delete(url); });
  }
}

function escuchar(io) {
  // El historial de un canal o de un hilo, a uno solo
  io.on('connection', socket => {
    const emit = socket.emit;
    socket.emit = function (event, payload, ...rest) {
      if ((event === 'message-history' || event === 'thread-messages') && payload && Array.isArray(payload.messages) && !payload.puentePrevias) {
        try { const p = previasDe(payload.messages); if (p) payload = { ...payload, puentePrevias: p }; } catch (err) { warn('previas:', err.message); }
      }
      return emit.call(this, event, payload, ...rest);
    };
  });
  // Los mensajes nuevos, a todo el canal
  for (const metodo of ['to', 'in']) {
    const orig = io[metodo].bind(io);
    io[metodo] = function (room) {
      const op = orig(room);
      const emit = op.emit.bind(op);
      op.emit = function (event, payload, ...rest) {
        if ((event === 'new-message' || event === 'new-thread-message') && payload && payload.message && !payload.puentePrevias) {
          try {
            const p = previasDe([payload.message]);
            if (p) payload = { ...payload, puentePrevias: p };
            const m = payload.message;
            setImmediate(() => { try { buscar(m); } catch (err) { warn('previas:', err.message); } });
          } catch (err) { warn('previas:', err.message); }
        }
        return emit(event, payload, ...rest);
      };
      return op;
    };
  }
}

module.exports = { setup, handle, enlaces };
