// Canales contador (parte del puente), como los canales "contador de miembros"
// que muchos servidores de Discord tienen (un bot les cambia el nombre):
//   👥 <app>-N          usuarios registrados en Haven (<app>: PUENTE_TITULO en
//                       minusculas con guiones, "cv-chat"; sin titulo, "haven")
// (el de las cuentas vinculadas con Discord, "discord-link-N", se saco: si quedo, se retira solo)
// Son canales propios de Haven (no vienen de Discord), de solo lectura y
// visibles para todos, en la misma categoria que el contador de Discord.
// Se actualizan como mucho cada INTERVAL_MS y solo si cambio el numero.
//
// Ademas, el nombre de los canales que vienen de Discord se copia de Discord
// en vivo (asi un canal contador de Discord sigue mostrando su numero en Haven).
//
// PUENTE_CONTADOR_DISCORD: principio del nombre del canal contador de Discord
// (por ejemplo "miembros"), para poner los contadores de Haven a su lado.

const crypto = require('crypto');

const INTERVAL_MS = 5 * 60 * 1000;
const appSlug = () => String(process.env.PUENTE_TITULO || '').normalize('NFKD').replace(/\p{M}/gu, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'haven';
const STATS = [
  { key: 'haven', label: n => `👥 ${appSlug()}-${n}`, count: db => db.prepare("SELECT COUNT(*) n FROM users WHERE username != 'discord-historial' AND COALESCE(is_guest, 0) = 0").get().n },
];
const SETTING = 'puente_canales_contador';

let db, io, log, warn, timer = null;

function setup(ctx) {
  ({ db, io, log, warn } = ctx);
  retirar();
  ensureChannels();
  update();
  timer = setInterval(update, INTERVAL_MS);
  timer.unref();
}

function ids() {
  try { return JSON.parse((db.prepare('SELECT value FROM server_settings WHERE key = ?').get(SETTING) || {}).value || '{}'); }
  catch { return {}; }
}

// Los contadores que ya no estan (discord-link): su canal se retira, si nunca tuvo mensajes (es solo el contador)
function retirar() {
  try {
    const map = ids(), vigentes = new Set(STATS.map(s => s.key));
    let changed = false;
    for (const [k, id] of Object.entries(map)) {
      if (vigentes.has(k)) continue;
      const ch = db.prepare('SELECT id, name FROM channels WHERE id = ?').get(id);
      if (ch && !db.prepare('SELECT 1 FROM messages WHERE channel_id = ? LIMIT 1').get(id)) {
        db.prepare('DELETE FROM channels WHERE id = ?').run(id);
        log(`estadisticas: canal contador "${ch.name}" retirado`);
      }
      delete map[k]; changed = true;
    }
    if (changed) { db.prepare('INSERT OR REPLACE INTO server_settings (key, value) VALUES (?, ?)').run(SETTING, JSON.stringify(map)); refreshAllChannelLists(); }
  } catch (err) { warn('estadisticas: retirar:', err.message); }
}

function ensureChannels() {
  const map = ids();
  const admin = db.prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE').get(process.env.ADMIN_USERNAME || '');
  // Misma categoria y lugar que el contador de Discord, si existe.
  const prefix = process.env.PUENTE_CONTADOR_DISCORD || '';
  const ref = (prefix && db.prepare("SELECT category, position FROM channels WHERE name LIKE ? AND discord_channel_id IS NOT NULL").get(prefix + '%'))
    || { category: '📊 SERVER STATS 📊', position: 1 };
  let changed = false;
  STATS.forEach((s, i) => {
    if (map[s.key] && db.prepare('SELECT 1 FROM channels WHERE id = ?').get(map[s.key])) return;
    let code;
    do { code = crypto.randomBytes(4).toString('hex'); } while (db.prepare('SELECT 1 FROM channels WHERE code = ?').get(code));
    const id = db.prepare(`INSERT INTO channels (name, code, created_by, topic, is_private, read_only, category, position)
                           VALUES (?, ?, ?, 'Contador automático', 0, 1, ?, ?)`)
      .run(s.label(s.count(db)), code, admin ? admin.id : null, ref.category, (ref.position || 0) + i + 1).lastInsertRowid;
    if (admin) db.prepare('INSERT OR IGNORE INTO channel_members (channel_id, user_id) VALUES (?, ?)').run(id, admin.id);
    map[s.key] = id;
    changed = true;
    log(`estadisticas: canal contador "${s.key}" creado`);
  });
  if (changed) db.prepare('INSERT OR REPLACE INTO server_settings (key, value) VALUES (?, ?)').run(SETTING, JSON.stringify(map));
}

function update() {
  try {
    const map = ids();
    let renamed = false;
    for (const s of STATS) {
      if (!map[s.key]) continue;
      const ch = db.prepare('SELECT id, name, code FROM channels WHERE id = ?').get(map[s.key]);
      if (!ch) continue;
      const name = s.label(s.count(db));
      if (ch.name !== name) { rename(ch, name); renamed = true; }
    }
    if (renamed) refreshAllChannelLists();
  } catch (err) { warn('estadisticas:', err.message); }
}

function rename(ch, name) {
  db.prepare('UPDATE channels SET name = ? WHERE id = ?').run(name, ch.id);
  try { io.to(ch.code).emit('channel-renamed', { code: ch.code, name, fromPuente: true }); } catch { /* sin clientes */ }
}

// Un canal de Discord cambio de nombre: copiarlo en Haven.
function onDiscordChannelUpdate(d) {
  if (!d || !d.id || !d.name) return;
  const ch = db.prepare('SELECT id, name, code FROM channels WHERE discord_channel_id = ?').get(d.id);
  const name = [...d.name].slice(0, 50).join('');
  if (!ch || ch.name === name) return;
  rename(ch, name);
  refreshAllChannelLists();
}

// Vuelve a mandar la lista de canales a todas las sesiones abiertas, como hace
// Haven al renombrar un canal.
let refreshTimer = null;
function refreshAllChannelLists() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    for (const s of io.of('/').sockets.values()) {
      if (!s.user || s.user.isBot) continue;
      const fns = s.listeners('get-channels');
      try { for (const fn of fns) fn(); } catch { /* sesion cerrada */ }
    }
  }, 500);
}

module.exports = { setup, update, onDiscordChannelUpdate };
