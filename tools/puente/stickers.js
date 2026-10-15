// Stickers del servidor de Discord -> stickers de Haven.
//
// Al conectarse a Discord y despues cada 6 horas, copia los stickers del
// servidor a los de Haven (tabla stickers, archivos en /data/uploads/stickers),
// en un paquete con el nombre del servidor. Asi aparecen en la pestaña
// Stickers y se pueden mandar desde CV Chat (a Discord llegan como imagen).
//   - Los nuevos se descargan una sola vez; los renombrados en Discord se
//     renombran; los borrados en Discord se sacan del selector (el archivo
//     queda, para los mensajes viejos que lo usan).
//   - Solo toca los stickers que copio el (tabla puente_stickers): los que se
//     suban a mano en Haven no se tocan.
//   - Los stickers animados en formato Lottie no se pueden mostrar como imagen
//     y se saltean.
// Ademas, un sticker que llega en un mensaje de Discord se muestra como imagen
// (adjuntos.stickerLines).

const fs = require('fs');
const path = require('path');

const DIR = process.env.PUENTE_STICKERS_DIR || '/data/uploads/stickers';
const EVERY_MS = 6 * 3600e3;
const MAX_BYTES = 2 * 1024 * 1024;

let db, io, api, log, warn, getGuildId;
let guildName = '';
let running = false, timer = null;

// Nombre valido en Haven: [a-z0-9_-] (sin tildes ni espacios), hasta 40 caracteres.
const havenName = n => String(n || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/\s+/g, '-').replace(/[^a-z0-9_-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'sticker';

function setup(opts) {
  ({ db, io, api, log, warn, getGuildId } = opts);
  db.exec(`CREATE TABLE IF NOT EXISTS puente_stickers (
    discord_id TEXT PRIMARY KEY,
    sticker_id INTEGER,
    filename TEXT NOT NULL
  )`);
}

// Lo llama el puente cuando Discord manda los datos del servidor
function onGuild(d) {
  if (d && d.name) guildName = String(d.name).slice(0, 40);
  if (!timer) {
    setTimeout(() => sync().catch(err => warn('stickers:', err.message)), 15000).unref();
    timer = setInterval(() => sync().catch(err => warn('stickers:', err.message)), EVERY_MS);
    timer.unref();
  }
}

async function download(st) {
  const ext = st.format_type === 4 ? 'gif' : 'png'; // 1 PNG, 2 APNG (animado, sigue siendo .png), 4 GIF
  const url = `https://media.discordapp.net/stickers/${st.id}.${ext}?size=320`;
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) }).catch(() => null);
  if (!res || !res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.length || buf.length > MAX_BYTES) return null;
  fs.mkdirSync(DIR, { recursive: true });
  const filename = `discord-${st.id}.${ext}`;
  fs.writeFileSync(path.join(DIR, filename), buf);
  return filename;
}

async function sync() {
  const gid = getGuildId();
  if (!gid || running) return;
  running = true;
  try {
    const list = await api('GET', `/guilds/${gid}/stickers`);
    if (!Array.isArray(list)) { warn('stickers: Discord no devolvio la lista', list && list.__error); return; }
    const pack = guildName || 'Discord';
    const ours = new Map(db.prepare('SELECT discord_id, sticker_id, filename FROM puente_stickers').all().map(r => [r.discord_id, r]));
    const byId = db.prepare('SELECT id, name, pack_name FROM stickers WHERE id = ?');
    const nameTaken = db.prepare('SELECT id FROM stickers WHERE name = ?');
    const freeName = (base, ownId) => {
      let name = base, i = 2;
      for (;;) {
        const row = nameTaken.get(name);
        if (!row || row.id === ownId) return name;
        name = base.slice(0, 37) + '-' + i++;
      }
    };
    let added = 0, renamed = 0, removed = 0, lottie = 0;
    const seen = new Set();
    for (const st of list) {
      if (!st || !st.id) continue;
      if (st.format_type === 3) { lottie++; continue; }
      seen.add(st.id);
      const prev = ours.get(st.id);
      const row = prev && prev.sticker_id ? byId.get(prev.sticker_id) : null;
      if (row) {
        const want = freeName(havenName(st.name), row.id);
        if (want !== row.name || row.pack_name !== pack) {
          db.prepare('UPDATE stickers SET name = ?, pack_name = ? WHERE id = ?').run(want, pack, row.id);
          renamed++;
        }
        continue;
      }
      // Nuevo (o lo borraron a mano del selector de Haven: se vuelve a poner)
      let filename = prev && fs.existsSync(path.join(DIR, prev.filename)) ? prev.filename : null;
      if (!filename) filename = await download(st);
      if (!filename) { warn(`stickers: no pude descargar "${st.name}"`); continue; }
      const r = db.prepare('INSERT INTO stickers (name, pack_name, filename, uploaded_by) VALUES (?, ?, ?, NULL)')
        .run(freeName(havenName(st.name), null), pack, filename);
      db.prepare('INSERT OR REPLACE INTO puente_stickers (discord_id, sticker_id, filename) VALUES (?, ?, ?)')
        .run(st.id, r.lastInsertRowid, filename);
      added++;
    }
    // Borrados en Discord: fuera del selector (el archivo queda para los mensajes viejos)
    for (const [did, r] of ours) {
      if (seen.has(did) || !r.sticker_id) continue;
      db.prepare('DELETE FROM stickers WHERE id = ?').run(r.sticker_id);
      db.prepare('UPDATE puente_stickers SET sticker_id = NULL WHERE discord_id = ?').run(did);
      removed++;
    }
    if (added || renamed || removed) {
      log(`stickers de Discord: ${added} nuevos, ${renamed} renombrados, ${removed} sacados${lottie ? ` (${lottie} animados Lottie salteados)` : ''}`);
      try { io.emit('library-updated', { kind: 'stickers' }); } catch { /* los clientes lo ven al recargar */ }
    }
  } finally { running = false; }
}

// Para mostrar un sticker que llega en un mensaje de Discord: su archivo en Haven, si se copio
function localFile(discordId) {
  try { const r = db.prepare('SELECT filename FROM puente_stickers WHERE discord_id = ?').get(String(discordId)); return r ? r.filename : null; } catch { return null; }
}

module.exports = { setup, onGuild, sync, localFile, havenName };
