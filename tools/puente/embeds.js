// Vistas previas de enlaces como en Discord, y al instante.
//
// Haven arma la vista previa de cada enlace pidiendola a internet cuando se
// muestra el mensaje (de a 3 por vez), y por eso tarda. Discord ya la tiene:
// cuando alguien pone un enlace, Discord arma su "embed" (autor con foto, texto,
// imagen, pie con logo y fecha; en los videos, la miniatura) y se lo manda al
// bot en el mensaje o en una actualizacion enseguida. Aca se guarda ese embed
// por mensaje (tabla puente_embeds) y web/aviso.js lo dibuja igual que Discord.
//  - Mensajes de Discord y mensajes de CV Chat que pasaron a Discord: el embed
//    llega solo (MESSAGE_CREATE / MESSAGE_UPDATE, o la respuesta al publicar).
//  - Mensajes viejos: se le pide a Discord una vez, cuando alguien los ve, y
//    queda guardado.
//  - Donde no hay embed de Discord (mensajes directos, canales que no se
//    sincronizan), queda la vista previa de Haven.

let db, io, api, log, warn;
const MAX_WAIT_MS = 800; // lo que se espera a Discord por los mensajes viejos

function setup(ctx) {
  ({ db, io, api, log, warn } = ctx);
  db.exec(`CREATE TABLE IF NOT EXISTS puente_embeds (
    haven_message_id INTEGER PRIMARY KEY REFERENCES messages(id) ON DELETE CASCADE,
    embeds TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  )`);
  // Mensajes sin vista previa: quien lo escribio (o un admin) la quito con la ✕, como en Discord
  db.exec(`CREATE TABLE IF NOT EXISTS puente_sin_vista (
    haven_message_id INTEGER PRIMARY KEY REFERENCES messages(id) ON DELETE CASCADE,
    por INTEGER, fecha INTEGER NOT NULL
  )`);
}

const str = (v, n) => (typeof v === 'string' && v ? v.slice(0, n) : undefined);
const url = v => (typeof v === 'string' && /^https?:\/\//i.test(v) ? v.slice(0, 2048) : undefined);
const media = m => (m && (url(m.proxy_url) || url(m.url)) ? { url: url(m.proxy_url) || url(m.url), w: Number(m.width) || undefined, h: Number(m.height) || undefined } : undefined);

// Solo lo que se muestra, con limites
function clean(embeds) {
  if (!Array.isArray(embeds)) return [];
  return embeds.slice(0, 10).map(e => {
    if (!e || typeof e !== 'object') return null;
    const out = {
      type: str(e.type, 20) || 'rich',
      url: url(e.url),
      title: str(e.title, 256),
      description: str(e.description, 4096),
      color: Number.isInteger(e.color) ? e.color : undefined,
      timestamp: str(e.timestamp, 40),
      author: e.author && str(e.author.name, 256) ? { name: str(e.author.name, 256), url: url(e.author.url), icon: url(e.author.proxy_icon_url) || url(e.author.icon_url) } : undefined,
      provider: e.provider && str(e.provider.name, 256) ? { name: str(e.provider.name, 256), url: url(e.provider.url) } : undefined,
      footer: e.footer && str(e.footer.text, 2048) ? { text: str(e.footer.text, 2048), icon: url(e.footer.proxy_icon_url) || url(e.footer.icon_url) } : undefined,
      image: media(e.image),
      thumbnail: media(e.thumbnail),
      video: e.video && (url(e.video.url) || url(e.video.proxy_url)) ? { url: url(e.video.url), proxy: url(e.video.proxy_url), w: Number(e.video.width) || undefined, h: Number(e.video.height) || undefined } : undefined,
      fields: Array.isArray(e.fields) ? e.fields.slice(0, 25).filter(f => f && f.name && f.value).map(f => ({ name: String(f.name).slice(0, 256), value: String(f.value).slice(0, 1024), inline: !!f.inline })) : undefined,
    };
    for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
    return out;
  }).filter(Boolean);
}

function store(havenMessageId, embeds) {
  const list = clean(embeds);
  db.prepare('INSERT OR REPLACE INTO puente_embeds (haven_message_id, embeds, updated_at) VALUES (?, ?, ?)')
    .run(havenMessageId, JSON.stringify(list), Date.now());
  return list;
}

const sinVista = (id) => !!db.prepare('SELECT 1 FROM puente_sin_vista WHERE haven_message_id = ?').get(id);
// Avisar a los que tienen el canal abierto (sin vista previa: una lista vacia, que la saca)
function emit(havenMessageId, list) {
  if (sinVista(havenMessageId)) list = [];
  try {
    const ch = db.prepare('SELECT c.code FROM messages m JOIN channels c ON c.id = m.channel_id WHERE m.id = ?').get(havenMessageId);
    if (ch) io.to(`channel:${ch.code}`).emit('puente-embeds', { channelCode: ch.code, messageId: havenMessageId, embeds: list });
  } catch (err) { warn('embeds:', err.message); }
}

// Un mensaje de Discord que se acaba de guardar, o la respuesta al publicar uno de CV Chat
function capture(havenMessageId, embeds, notify = true) {
  if (!havenMessageId || !Array.isArray(embeds)) return;
  try {
    const list = store(havenMessageId, embeds);
    if (notify) emit(havenMessageId, list);
  } catch (err) { warn('embeds:', err.message); }
}

// MESSAGE_UPDATE de Discord: ahi suele llegar el embed de un enlace (de los dos lados)
const SUPPRESS_EMBEDS = 1 << 2;
function onDiscordUpdate(d, retried = false) {
  if (!d || !d.id || !Array.isArray(d.embeds)) return;
  const row = db.prepare('SELECT id FROM messages WHERE discord_message_id = ?').get(String(d.id));
  // La quitaron en Discord: tambien aca
  if (row && (Number(d.flags) & SUPPRESS_EMBEDS) && !sinVista(row.id)) {
    try { db.prepare('INSERT OR IGNORE INTO puente_sin_vista (haven_message_id, por, fecha) VALUES (?, NULL, ?)').run(row.id, Date.now()); } catch (err) { warn('embeds:', err.message); }
  }
  if (row) return capture(row.id, d.embeds);
  // Un mensaje de CV Chat cuyo id de Discord se guarda un instante despues
  if (!retried) setTimeout(() => onDiscordUpdate(d, true), 3000).unref();
}

// En que canal de Discord esta un mensaje de Haven, para pedirlo
function discordLocation(m) {
  const did = String(m.discord_message_id || '').replace(/^thread-/, '');
  if (!/^\d{5,25}$/.test(did)) return null;
  if (String(m.discord_message_id).startsWith('thread-')) return { channel: did, message: did };
  if (m.thread_id) {
    const root = db.prepare('SELECT discord_message_id FROM messages WHERE id = ?').get(m.thread_id);
    const rid = root && String(root.discord_message_id || '').replace(/^thread-/, '');
    return rid && /^\d{5,25}$/.test(rid) ? { channel: rid, message: did } : null;
  }
  return m.dch ? { channel: m.dch, message: did } : null;
}

async function fetchFromDiscord(m) {
  const loc = discordLocation(m);
  if (!loc) return [];
  const r = await api('GET', `/channels/${loc.channel}/messages/${loc.message}`);
  if (r && !r.__error) return Array.isArray(r.embeds) ? r.embeds : [];
  if (r && (r.__error === 404 || r.__error === 403)) return []; // ya no esta, o el bot no lo ve: sin embed
  return null; // Discord no contesto: otra vez despues
}

// Pedidos a Discord de mensajes viejos: de a pocos, sin repetir, y cada uno que
// llega se avisa al canal (asi la tarjeta aparece aunque haya tardado)
const pending = new Map(); // id de Haven -> Promise
const backlog = [];
let running = 0;
function fetchLater(m) {
  if (pending.has(m.id)) return pending.get(m.id);
  const p = new Promise(resolve => { backlog.push({ m, resolve }); pumpBacklog(); });
  pending.set(m.id, p);
  p.finally(() => pending.delete(m.id));
  return p;
}
function pumpBacklog() {
  while (running < 4 && backlog.length) {
    const { m, resolve } = backlog.shift();
    running++;
    fetchFromDiscord(m)
      .then(e => { if (e) { const list = store(m.id, e); emit(m.id, list); return list; } return null; })
      .catch(err => { warn('embeds:', err.message); return null; })
      .then(resolve)
      .finally(() => { running--; pumpBacklog(); });
  }
}

// Los embeds de estos mensajes, para una persona (solo de canales que ve).
// Devuelve { id: [embeds] }; los que no estan usan la vista previa de Haven
// (y si despues llega el de Discord, se reemplaza al vuelo).
async function forUser(user, ids) {
  const admin = !!(db.prepare('SELECT is_admin FROM users WHERE id = ?').get(user.id) || {}).is_admin;
  const msgQ = db.prepare(`SELECT m.id, m.content, m.thread_id, m.discord_message_id, c.id cid, c.is_dm, c.discord_channel_id dch
                           FROM messages m JOIN channels c ON c.id = m.channel_id WHERE m.id = ?`);
  const memberQ = db.prepare('SELECT 1 FROM channel_members WHERE channel_id = ? AND user_id = ?');
  const storedQ = db.prepare('SELECT embeds FROM puente_embeds WHERE haven_message_id = ?');
  const out = {}, waits = [];
  for (const id of ids) {
    const m = msgQ.get(id);
    if (!m) continue;
    if (!(memberQ.get(m.cid, user.id) || (admin && !m.is_dm))) continue;
    if (sinVista(m.id)) { out[id] = []; continue; }
    const s = storedQ.get(id);
    if (s) { try { out[id] = JSON.parse(s.embeds); } catch { /* se vuelve a pedir */ } continue; }
    if (m.discord_message_id && /https?:\/\//i.test(m.content || '')) waits.push(fetchLater(m).then(list => { if (list) out[m.id] = list; }));
  }
  // Se espera un poco a los viejos; los que tarden mas llegan despues por el socket
  if (waits.length) await Promise.race([Promise.all(waits), new Promise(r => setTimeout(r, MAX_WAIT_MS))]);
  return out;
}

// La ✕ de la vista previa: solo quien escribio el mensaje, o un admin. Queda el enlace solo, para
// todos; y en Discord tambien, si el mensaje esta alla (el bot puede, con "gestionar mensajes").
async function quitar(user, id) {
  const m = db.prepare(`SELECT m.id, m.user_id, m.thread_id, m.discord_message_id, c.discord_channel_id dch
                        FROM messages m JOIN channels c ON c.id = m.channel_id WHERE m.id = ?`).get(id);
  if (!m) return { status: 404, error: 'Ese mensaje ya no está.' };
  const admin = !!(db.prepare('SELECT is_admin FROM users WHERE id = ?').get(user.id) || {}).is_admin;
  if (m.user_id !== user.id && !admin) return { status: 403, error: 'Solo quien escribió el mensaje puede quitar la vista previa.' };
  db.prepare('INSERT OR IGNORE INTO puente_sin_vista (haven_message_id, por, fecha) VALUES (?, ?, ?)').run(m.id, user.id, Date.now());
  emit(m.id, []);
  const loc = discordLocation(m);
  if (loc) api('PATCH', `/channels/${loc.channel}/messages/${loc.message}`, { flags: SUPPRESS_EMBEDS })
    .then(r => { if (r && r.__error) warn('embeds: no se pudo quitar en Discord:', r.__error); }).catch(() => {});
  return { ok: true };
}

module.exports = { setup, capture, onDiscordUpdate, forUser, clean, quitar };
