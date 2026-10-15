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

// Lineas de todos los adjuntos de un mensaje (incluidos los del mensaje
// reenviado, si lo es), en orden: Map id -> linea.
async function localizeAll(msg) {
  const out = new Map();
  for (const a of msg.attachments || []) out.set(a.id, await localize(a));
  for (const s of msg.message_snapshots || []) {
    for (const a of (s.message && s.message.attachments) || []) out.set(a.id, await localize(a));
  }
  return out;
}

// Mensaje reenviado (Discord manda el original aparte, en message_snapshots):
//   ↪ *Reenviado*
//   > texto original
//   /uploads/discord/123.mp4   (sus adjuntos, cada uno en su linea)
function forwarded(msg, attLines) {
  const parts = [];
  for (const s of msg.message_snapshots || []) {
    const m = s.message || {};
    const lines = ['↪ *Reenviado*'];
    const text = String(m.content || '').trim();
    if (text) for (const l of text.split('\n')) lines.push('> ' + l);
    for (const a of m.attachments || []) lines.push((attLines && attLines.get(a.id)) || fallback(a));
    if (lines.length > 1) parts.push(lines.join('\n'));
  }
  return parts.join('\n');
}

// Avatar de Discord -> archivo de Haven (/uploads/discord/avatar-<id>-<hash>.png).
// Devuelve la ruta para users.avatar, o null.
async function avatar(discordUserId, hash) {
  if (!/^\d+$/.test(String(discordUserId || '')) || !/^(a_)?[0-9a-f]{32}$/i.test(String(hash || ''))) return null;
  ensureDir();
  const file = `avatar-${discordUserId}-${hash}.png`;
  const dest = path.join(DIR, file);
  try { if (fs.statSync(dest).size > 0) return `/uploads/discord/${file}`; } catch { /* hay que bajarlo */ }
  try {
    const res = await fetch(`https://cdn.discordapp.com/avatars/${discordUserId}/${hash}.png?size=256`, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length || buf.length > 5 * 1024 * 1024) return null;
    fs.writeFileSync(dest + '.part', buf);
    fs.renameSync(dest + '.part', dest);
    return `/uploads/discord/${file}`;
  } catch { return null; }
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

// ── Emojis personalizados (tabla puente_emojis, la llena tools/emojis-discord.js) ──
let emojiCache = null, emojiCacheAt = 0;
function emojiMaps(db) {
  if (!emojiCache || Date.now() - emojiCacheAt > 60000) {
    let rows = [];
    try { rows = db.prepare('SELECT discord_id, discord_name, name, animated FROM puente_emojis').all(); } catch { /* sin tabla todavia */ }
    emojiCache = { byId: new Map(rows.map(r => [r.discord_id, r])), byName: new Map(rows.map(r => [r.name, r])) };
    emojiCacheAt = Date.now();
  }
  return emojiCache;
}
const havenEmojiName = n => String(n).toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 30) || 'emoji';
// Discord -> Haven: <:nombre:id> y <a:nombre:id> -> :nombre: (como los dibuja Haven)
function emojisToHaven(db, text) {
  if (!text || text.indexOf('<') < 0) return text;
  const { byId } = emojiMaps(db);
  return text.replace(/<a?:([A-Za-z0-9_~]{1,32}):(\d{5,25})>/g, (full, n, id) => `:${(byId.get(id) || {}).name || havenEmojiName(n)}:`);
}
// Haven -> Discord: :nombre: -> <:nombre:id> si el emoji vino de Discord
function emojisToDiscord(db, text) {
  if (!text || text.indexOf(':') < 0) return text;
  const { byName } = emojiMaps(db);
  return text.replace(/:([a-z0-9_-]{1,30}):/g, (full, n) => {
    const e = byName.get(n);
    return e ? `<${e.animated ? 'a' : ''}:${e.discord_name}:${e.discord_id}>` : full;
  });
}
// Clave de reaccion en Haven para un emoji de Discord ({id, name}): unicode tal cual,
// personalizado como :nombre: (solo si se copio a Haven; si no, null).
function reactionKey(db, emoji) {
  if (!emoji) return null;
  if (!emoji.id) return emoji.name || null;
  const e = emojiMaps(db).byId.get(String(emoji.id));
  return e ? `:${e.name}:` : null;
}
// Clave de Haven -> emoji para la API de Discord ("😂" o "nombre:id"), o null.
function discordReactionParam(db, key) {
  const m = /^:([a-z0-9_-]{1,30}):$/.exec(key || '');
  if (!m) return key || null;
  const e = emojiMaps(db).byName.get(m[1]);
  return e ? `${e.discord_name}:${e.discord_id}` : null;
}

// ── Menciones de Discord -> texto de Haven ──
// <@id> -> @usuario de Haven si esa cuenta de Discord esta vinculada (Haven la
// resalta como mencion); si no, @Nombre de Discord. <#id> -> #canal, <@&id> -> @rol.
// Los nombres salen del propio mensaje de Discord (msg.mentions), de los
// canales y roles que va viendo el puente, o del historial importado.
const roleNames = new Map();     // id de rol -> nombre
const channelNames = new Map();  // id de canal o hilo de Discord -> nombre
const userNames = new Map();     // id de usuario de Discord -> nombre (vistos o buscados)
function rememberRoles(roles) { for (const r of roles || []) if (r && r.id && r.name) roleNames.set(String(r.id), r.name); }
function rememberChannel(c) { if (c && c.id && c.name) channelNames.set(String(c.id), c.name); }
function rememberUser(id, name) { if (id && name) userNames.set(String(id), String(name)); }

const mentionStmts = new WeakMap();
function stmts(db) {
  let s = mentionStmts.get(db);
  if (!s) {
    s = {
      linked: db.prepare('SELECT u.username FROM puente_vinculos v JOIN users u ON u.id = v.haven_user_id WHERE v.discord_user_id = ?'),
      author: db.prepare(`SELECT m.webhook_username n FROM puente_autores pa JOIN messages m ON m.id = pa.message_id
        WHERE pa.discord_user_id = ? AND m.webhook_username IS NOT NULL AND m.webhook_username != '' ORDER BY pa.message_id DESC LIMIT 1`),
      channel: db.prepare('SELECT name FROM channels WHERE discord_channel_id = ?'),
    };
    mentionStmts.set(db, s);
  }
  return s;
}

// Nombre para @ de un usuario de Discord, o null si no se conoce
function mentionUser(db, id, fromMsg) {
  const s = stmts(db);
  const link = s.linked.get(id);
  if (link) return link.username;
  if (fromMsg && fromMsg.has(id)) return fromMsg.get(id);
  if (userNames.has(id)) return userNames.get(id);
  const a = s.author.get(id);
  return a ? a.n : null;
}
function mentionChannel(db, id) {
  const c = stmts(db).channel.get(id);
  return c ? c.name : channelNames.get(id) || null;
}

function mentionsToHaven(db, text, msg) {
  if (!text || text.indexOf('<') < 0) return text;
  const fromMsg = new Map();
  for (const u of (msg && msg.mentions) || []) {
    if (u && u.id) fromMsg.set(String(u.id), (u.member && u.member.nick) || u.global_name || u.username);
  }
  try { stmts(db); } catch { return text; } // sin las tablas del puente: se deja como esta
  return text
    .replace(/<@!?(\d{5,25})>/g, (full, id) => '@' + (mentionUser(db, id, fromMsg) || 'usuario'))
    .replace(/<@&(\d{5,25})>/g, (full, id) => '@' + (roleNames.get(id) || 'rol'))
    .replace(/<#(\d{5,25})>/g, (full, id) => '#' + (mentionChannel(db, id) || 'canal'));
}

// ── Stickers de un mensaje de Discord ──
// El sticker del servidor ya copiado (tabla puente_stickers, ver stickers.js) se
// muestra como sticker de Haven; otro (de Discord o sin copiar todavia), como
// imagen de Discord; uno animado Lottie, que no es una imagen, con su nombre.
function stickerLines(db, msg) {
  const lines = [];
  for (const st of msg.sticker_items || []) {
    if (!st || !/^\d+$/.test(String(st.id))) continue;
    let row = null;
    try { row = db.prepare('SELECT filename FROM puente_stickers WHERE discord_id = ?').get(String(st.id)); } catch { /* sin tabla todavia */ }
    if (row) lines.push(`/uploads/stickers/${row.filename}`);
    else if (st.format_type === 3) lines.push(`*[sticker: ${String(st.name || '').replace(/[*\]\[]/g, '')}]*`);
    else lines.push(`https://media.discordapp.net/stickers/${st.id}.${st.format_type === 4 ? 'gif' : 'png'}?size=160`);
  }
  return lines;
}

module.exports = { stickerLines, localize, localizeAll, gifInstead, forwarded, avatar, fallback,
  emojisToHaven, emojisToDiscord, reactionKey, discordReactionParam,
  mentionsToHaven, mentionUser, mentionChannel, rememberRoles, rememberChannel, rememberUser };
