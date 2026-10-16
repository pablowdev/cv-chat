// Imagenes livianas en el chat, como Discord.
//
// Haven muestra las fotos subidas (y las que llegan de Discord) con su tamaño
// original: muchas pesan varios MB y tardan en verse, sobre todo en el celular.
// Aca se sirve una version reducida para el chat:
//   GET /puente/mini/960/<ruta dentro de /uploads>  ->  WebP de hasta 960 px de ancho
// Se genera una sola vez (con sharp, en tools/puente/vendor) y queda guardada en
// /data/puente-mini. Las imagenes nuevas se preparan apenas llegan (warm), asi
// la primera persona que las ve tampoco espera. Al abrir la imagen (o
// descargarla) se usa la original: eso lo resuelve web/aviso.js.
//
// Si algo falla (sin sharp, imagen rara, disco), se sirve la original: nunca
// queda una imagen sin verse. Los GIF y las imagenes chicas van tal cual.
//
// Instalar sharp (una vez, en el servidor; con la misma imagen de Haven):
//   docker run --rm -v /opt/haven/tools/puente/vendor:/v -w /v --entrypoint sh <imagen de haven> \n//     -c "npm init -y && npm install sharp@0.34"

const fs = require('fs');
const path = require('path');

const UPLOADS = process.env.PUENTE_UPLOADS_DIR || '/data/uploads';
const CACHE = process.env.PUENTE_MINI_DIR || '/data/puente-mini';
const WIDTHS = new Set([480, 960]);
const SMALL_BYTES = 150 * 1024;     // mas chicas que esto: la original (ya es liviana)
const MAX_SOURCE_BYTES = 40 * 1024 * 1024;
const CONCURRENCY = 2;
const REL_RE = /^(?!deleted-attachments\/)(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+\.(png|jpe?g|webp)$/i;
const TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };

let sharp = null;
try { sharp = require('./vendor/node_modules/sharp'); sharp.concurrency(1); sharp.cache(false); } catch { /* sin sharp: siempre la original */ }
let log = () => {}, warn = () => {};

function setup(ctx) {
  ({ log = log, warn = warn } = ctx || {});
  if (!sharp) warn('miniaturas: no encuentro sharp (tools/puente/vendor); las imagenes van con su tamaño original');
  else log('miniaturas: imagenes livianas en el chat');
}

const inflight = new Map(); // archivo de salida -> Promise
const queue = [];
let active = 0;
function runQueued(fn) {
  return new Promise((resolve, reject) => {
    queue.push({ fn, resolve, reject });
    pump();
  });
}
function pump() {
  while (active < CONCURRENCY && queue.length) {
    const job = queue.shift();
    active++;
    job.fn().then(job.resolve, job.reject).finally(() => { active--; pump(); });
  }
}

// Genera (una sola vez) la reducida; devuelve su ruta, o null si conviene la original
function ensure(rel, width) {
  if (!sharp || !REL_RE.test(rel) || rel.includes('..') || !WIDTHS.has(width)) return Promise.resolve(null);
  const src = path.join(UPLOADS, rel);
  if (!src.startsWith(UPLOADS + path.sep)) return Promise.resolve(null);
  const out = path.join(CACHE, String(width), rel + '.webp');
  if (fs.existsSync(out)) return Promise.resolve(out);
  if (inflight.has(out)) return inflight.get(out);
  const p = runQueued(async () => {
    let st;
    try { st = fs.statSync(src); } catch { return null; }
    if (!st.isFile() || st.size <= SMALL_BYTES || st.size > MAX_SOURCE_BYTES) return null;
    const img = sharp(src, { failOn: 'none', limitInputPixels: 100e6 });
    const meta = await img.metadata();
    if ((meta.pages || 1) > 1) return null; // animada: la original
    if (meta.width && meta.width <= width && st.size <= SMALL_BYTES * 3) return null;
    const buf = await img.rotate().resize({ width, withoutEnlargement: true }).webp({ quality: 80, effort: 3 }).toBuffer();
    if (buf.length >= st.size) return null; // no gana nada
    fs.mkdirSync(path.dirname(out), { recursive: true });
    const tmp = out + '.' + process.pid + '.tmp';
    fs.writeFileSync(tmp, buf);
    fs.renameSync(tmp, out);
    return out;
  }).catch(err => { warn('miniaturas:', rel, err.message); return null; })
    .finally(() => inflight.delete(out));
  inflight.set(out, p);
  return p;
}

function sendFile(res, file, type) {
  res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' });
  fs.createReadStream(file).on('error', () => res.end()).pipe(res);
}

// GET /puente/mini/<ancho>/<ruta>
async function serve(req, res, pathname) {
  const m = /^\/puente\/mini\/(\d+)\/(.+)$/.exec(pathname);
  let rel = null, width = 0;
  if (m) { width = Number(m[1]); try { rel = decodeURIComponent(m[2]); } catch { rel = null; } }
  if (!rel || !REL_RE.test(rel) || rel.includes('..')) { res.writeHead(404); res.end(); return; }
  const src = path.join(UPLOADS, rel);
  if (!src.startsWith(UPLOADS + path.sep) || !fs.existsSync(src)) { res.writeHead(404); res.end(); return; }
  const out = await ensure(rel, WIDTHS.has(width) ? width : 960);
  if (out) return sendFile(res, out, 'image/webp');
  // La original, con la misma cache que /uploads
  return sendFile(res, src, TYPES[rel.split('.').pop().toLowerCase()] || 'application/octet-stream');
}

// Preparar las de un mensaje nuevo, en segundo plano
function warmFromContent(content) {
  if (!sharp || typeof content !== 'string' || !content.includes('/uploads/')) return;
  for (const mm of content.matchAll(/(?:^|[\s(])\/uploads\/([^\s)|]+)/g)) {
    if (REL_RE.test(mm[1])) ensure(mm[1], 960);
  }
}

module.exports = { setup, serve, ensure, warmFromContent };
