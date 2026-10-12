// Adjuntos de Discord -> archivos de Haven (lo usan el puente y la sincronizacion).
//
// Los enlaces a adjuntos de Discord (cdn.discordapp.com/attachments/...) estan
// firmados y caducan, y Haven solo dibuja una imagen o un reproductor cuando el
// archivo esta en su propio servidor. Por eso cada adjunto se descarga una vez a
// /data/uploads/discord/<id del adjunto>.<ext> y en el mensaje se escribe con el
// formato que usa Haven para lo que suben sus usuarios:
//   imagen ->  /uploads/discord/123.png            (se ve la imagen)
//   otros  ->  [file:video.mp4](/uploads/discord/123.mp4|4.2 MB)  (reproductor o descarga)
// Si no se puede descargar (muy grande, disco casi lleno, error), queda el enlace
// de Discord como antes: "📎 [nombre](url)".

const fs = require('fs');
const path = require('path');

const DIR = process.env.PUENTE_ADJUNTOS_DIR || '/data/uploads/discord';
const MAX_BYTES = Number(process.env.PUENTE_ADJUNTO_MAX_MB || 100) * 1024 * 1024;
const MIN_FREE_BYTES = Number(process.env.PUENTE_DISCO_MIN_LIBRE_GB || 5) * 1024 ** 3;
const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp']);
const EXT_ALIASES = { jfif: 'jpg', jpe: 'jpg' };

let ready = false;
function ensureDir() {
  if (!ready) { fs.mkdirSync(DIR, { recursive: true }); ready = true; }
}

function extOf(name) {
  const m = String(name || '').toLowerCase().match(/\.([a-z0-9]{1,8})$/);
  const ext = m ? m[1] : 'bin';
  return EXT_ALIASES[ext] || ext;
}

function human(bytes) {
  if (bytes >= 1024 ** 3) return (bytes / 1024 ** 3).toFixed(1) + ' GB';
  if (bytes >= 1024 ** 2) return (bytes / 1024 ** 2).toFixed(1) + ' MB';
  if (bytes >= 1024) return Math.round(bytes / 1024) + ' KB';
  return bytes + ' B';
}

function freeBytes() {
  try { const s = fs.statfsSync(DIR); return s.bavail * s.bsize; } catch { return Infinity; }
}

// El nombre se muestra dentro de [file:...](...|...): sin ] ( ) | ni saltos de linea.
const safeName = n => String(n || 'archivo').replace(/[\]\[()|\r\n]/g, '_').slice(0, 120) || 'archivo';
const fallback = a => `📎 ${a.url ? '[' + a.filename + '](' + a.url + ')' : a.filename}`;

function lineFor(a, file, size) {
  const ext = extOf(file);
  const rel = `/uploads/discord/${file}`;
  return IMAGE_EXTS.has(ext) ? rel : `[file:${safeName(a.filename)}](${rel}|${human(size)})`;
}

// Devuelve la linea de Haven para un adjunto, descargandolo si hace falta.
async function localize(a) {
  if (!a || !a.id || !/^\d+$/.test(String(a.id))) return fallback(a);
  ensureDir();
  const file = `${a.id}.${extOf(a.filename)}`;
  const dest = path.join(DIR, file);
  try {
    const st = fs.statSync(dest);
    if (st.size > 0) return lineFor(a, file, st.size); // ya descargado
  } catch { /* no existe todavia */ }
  if (!a.url || (a.size && a.size > MAX_BYTES) || freeBytes() - (a.size || 0) < MIN_FREE_BYTES) return fallback(a);
  const tmp = dest + '.part';
  try {
    const res = await fetch(a.url, { signal: AbortSignal.timeout(180000) });
    if (!res.ok || !res.body) return fallback(a);
    const len = Number(res.headers.get('content-length') || 0);
    if (len > MAX_BYTES) return fallback(a);
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length || buf.length > MAX_BYTES) return fallback(a);
    fs.writeFileSync(tmp, buf);
    fs.renameSync(tmp, dest);
    return lineFor(a, file, buf.length);
  } catch {
    try { fs.unlinkSync(tmp); } catch { /* */ }
    return fallback(a);
  }
}

// Lineas de todos los adjuntos de un mensaje, en orden: Map id -> linea.
async function localizeAll(msg) {
  const out = new Map();
  for (const a of msg.attachments || []) out.set(a.id, await localize(a));
  return out;
}

// GIFs de Tenor / Giphy: cuando el mensaje es solo el enlace a la pagina del GIF,
// Discord oculta el enlace y muestra la animacion. Se hace lo mismo poniendo la
// direccion del GIF (Haven la dibuja como imagen). Si no hay un .gif, queda el enlace.
function gifInstead(msg) {
  const text = String(msg.content || '').trim();
  if (!/^https?:\/\/\S+$/.test(text)) return null;
  for (const e of msg.embeds || []) {
    if (e.type !== 'gifv' && e.type !== 'image') continue;
    if (e.url && e.url !== text) continue;
    for (const u of [e.thumbnail && e.thumbnail.url, e.image && e.image.url]) {
      if (u && /^https:\/\/\S+\.gif(\?\S*)?$/i.test(u)) return u;
    }
  }
  return null;
}

module.exports = { localize, localizeAll, gifInstead, fallback };
