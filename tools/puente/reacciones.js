// Reacciones en vivo entre Discord y Haven (parte del puente).
//
// En Haven cada reaccion pertenece a un usuario, y en Discord un bot solo puede
// reaccionar una vez por emoji. Por eso:
//  Discord -> Haven: la reaccion de una cuenta vinculada aparece como suya en
//    Haven. La de una cuenta sin vincular aparece a nombre del usuario tecnico
//    "Discord" (el emoji se ve, pero cuenta una sola vez).
//  Haven -> Discord: mientras al menos una persona de Haven tenga ese emoji en
//    el mensaje, el bot lo pone en Discord (una vez); cuando ya nadie lo tiene,
//    lo saca.
// Las reacciones que llegan desde Discord se anotan en puente_reacciones_origen,
// para no devolverlas a Discord ni confundirlas con las de Haven.

let db, io, api, log, warn, adjuntos, botUserId;

function setup(ctx) {
  ({ db, io, api, log, warn, adjuntos, getBotUserId: botUserId } = ctx);
  db.exec(`
    CREATE TABLE IF NOT EXISTS puente_reacciones_origen (
      message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL,
      emoji TEXT NOT NULL,
      PRIMARY KEY (message_id, user_id, emoji)
    );
    CREATE TABLE IF NOT EXISTS puente_reacciones_bot (
      message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      emoji TEXT NOT NULL,
      PRIMARY KEY (message_id, emoji)
    );
    -- Quien reacciono en Discord, persona por persona (el usuario "Discord" de
    -- Haven cuenta una sola vez). Revisadas: mensajes ya consultados a Discord;
    -- desde ahi se mantienen al dia con los eventos del gateway.
    CREATE TABLE IF NOT EXISTS puente_reacciones_discord (
      message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      emoji TEXT NOT NULL,
      discord_user_id TEXT NOT NULL,
      name TEXT,
      avatar TEXT,
      PRIMARY KEY (message_id, emoji, discord_user_id)
    );
    CREATE TABLE IF NOT EXISTS puente_reacciones_revisadas (
      message_id INTEGER PRIMARY KEY REFERENCES messages(id) ON DELETE CASCADE,
      at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

// ── Cuantas personas reaccionaron en Discord ─────────────────────────────
const discordName = u => (u && (u.global_name || u.username)) || 'Discord';
const discordAvatar = u => (u && u.avatar ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=64` : null);

// En que canal (o hilo) de Discord esta un mensaje de Haven, y con que id
function discordRef(messageId) {
  const m = db.prepare(`SELECT m.thread_id, c.discord_channel_id ch, COALESCE(m.discord_message_id, s.discord_message_id) did, s.discord_thread_id th
    FROM messages m JOIN channels c ON c.id = m.channel_id LEFT JOIN puente_salientes s ON s.haven_message_id = m.id WHERE m.id = ?`).get(messageId);
  if (!m || !m.ch || !m.did || !/^\d+$/.test(String(m.did))) return null;
  let channel = m.ch;
  if (m.thread_id) {
    const root = db.prepare('SELECT discord_message_id did FROM messages WHERE id = ?').get(m.thread_id);
    channel = m.th || (root && root.did ? String(root.did).replace(/^thread-/, '') : null);
    if (!channel) return null;
  }
  return { channel, did: String(m.did) };
}

// Los pedidos a Discord van de a uno, para no pasarse del limite de Discord
let chain = Promise.resolve();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const queued = fn => (chain = chain.then(fn, fn).then(async (v) => { await sleep(150); return v; }));
const inFlight = new Map();

function isReviewed(messageId) { return !!db.prepare('SELECT 1 FROM puente_reacciones_revisadas WHERE message_id = ?').get(messageId); }

// Le pregunta a Discord quien reacciono a un mensaje y lo guarda. true si cambio algo.
function refreshFromDiscord(messageId, force = false) {
  if (!force && isReviewed(messageId)) return Promise.resolve(false);
  if (inFlight.has(messageId)) return inFlight.get(messageId);
  const p = queued(async () => {
    const ref = discordRef(messageId);
    if (!ref) { db.prepare('INSERT OR IGNORE INTO puente_reacciones_revisadas (message_id) VALUES (?)').run(messageId); return false; }
    const emojis = db.prepare('SELECT DISTINCT emoji FROM reactions WHERE message_id = ?').all(messageId).map(r => r.emoji);
    const bot = botUserId();
    const rows = [];
    for (const emoji of emojis) {
      const param = adjuntos.discordReactionParam(db, emoji);
      if (!param) continue;
      let after = null;
      for (let page = 0; page < 10; page++) {
        const r = await api('GET', `/channels/${ref.channel}/messages/${ref.did}/reactions/${encodeURIComponent(param)}?limit=100${after ? '&after=' + after : ''}`);
        if (r && r.__error) {
          if (r.__error === 404 || r.__error === 403 || r.__error === 400) break; // mensaje o emoji que ya no esta
          return false; // error temporal: se reintenta otra vez
        }
        const users = Array.isArray(r) ? r : [];
        for (const u of users) if (u && u.id && u.id !== bot) rows.push({ emoji, id: u.id, name: discordName(u), avatar: discordAvatar(u) });
        if (users.length < 100) break;
        after = users[users.length - 1].id;
      }
    }
    db.transaction(() => {
      db.prepare('DELETE FROM puente_reacciones_discord WHERE message_id = ?').run(messageId);
      const put = db.prepare('INSERT OR REPLACE INTO puente_reacciones_discord (message_id, emoji, discord_user_id, name, avatar) VALUES (?, ?, ?, ?, ?)');
      for (const x of rows) put.run(messageId, x.emoji, x.id, x.name, x.avatar);
      db.prepare('INSERT OR REPLACE INTO puente_reacciones_revisadas (message_id, at) VALUES (?, CURRENT_TIMESTAMP)').run(messageId);
    })();
    return true;
  }).finally(() => inFlight.delete(messageId));
  inFlight.set(messageId, p);
  return p;
}

// Lista de reacciones de Haven ([{ emoji, user_id, username }]) con las de
// Discord persona por persona en vez del usuario "Discord", si ya se consulto.
// Las cuentas vinculadas aparecen con su usuario de Haven (asi se marca la propia).
let fakeId = 0;
function expandReactions(messageId, reactions) {
  if (!Array.isArray(reactions) || !reactions.length || !isReviewed(messageId)) return reactions;
  if (reactions.some(r => r && r.user_id < 0)) return reactions; // ya expandida
  const ghost = ghostId();
  const rows = db.prepare(`SELECT d.emoji, d.discord_user_id, d.name, v.haven_user_id, COALESCE(u.display_name, u.username) hname
    FROM puente_reacciones_discord d LEFT JOIN puente_vinculos v ON v.discord_user_id = d.discord_user_id
    LEFT JOIN users u ON u.id = v.haven_user_id WHERE d.message_id = ?`).all(messageId);
  const groups = new Map(); // emoji -> entradas, en el orden de Haven
  for (const r of reactions) {
    if (!groups.has(r.emoji)) groups.set(r.emoji, []);
    if (r.user_id !== ghost) groups.get(r.emoji).push(r);
  }
  for (const x of rows) {
    if (!groups.has(x.emoji)) groups.set(x.emoji, []);
    const list = groups.get(x.emoji);
    if (x.haven_user_id) {
      if (!list.some(r => r.user_id === x.haven_user_id)) list.push({ emoji: x.emoji, user_id: x.haven_user_id, username: x.hname });
    } else {
      list.push({ emoji: x.emoji, user_id: -(++fakeId), username: x.name || 'Discord', discord: true });
    }
  }
  if (fakeId > 1e9) fakeId = 0;
  return [...groups.values()].flat();
}

// Para la ventana de "quien reacciono": por emoji, con avatar
function reactorsOf(messageId, viewerId) {
  const ghost = ghostId();
  const out = new Map();
  const add = (emoji, u) => { if (!out.has(emoji)) out.set(emoji, []); out.get(emoji).push(u); };
  const haven = db.prepare(`SELECT r.emoji, r.user_id, COALESCE(u.display_name, u.username) name, u.avatar
    FROM reactions r JOIN users u ON u.id = r.user_id WHERE r.message_id = ? ORDER BY r.id`).all(messageId);
  let ghostEmojis = new Set();
  for (const r of haven) {
    if (r.user_id === ghost) { ghostEmojis.add(r.emoji); if (!out.has(r.emoji)) out.set(r.emoji, []); continue; }
    add(r.emoji, { id: r.user_id, name: r.name, avatar: r.avatar || null, propio: r.user_id === viewerId });
  }
  if (isReviewed(messageId)) {
    const rows = db.prepare(`SELECT d.emoji, d.name, d.avatar, v.haven_user_id FROM puente_reacciones_discord d
      LEFT JOIN puente_vinculos v ON v.discord_user_id = d.discord_user_id WHERE d.message_id = ?`).all(messageId);
    for (const x of rows) {
      if (x.haven_user_id && (out.get(x.emoji) || []).some(u => u.id === x.haven_user_id)) continue;
      add(x.emoji, x.haven_user_id
        ? { id: x.haven_user_id, name: x.name, avatar: x.avatar, propio: x.haven_user_id === viewerId }
        : { name: x.name, avatar: x.avatar, discord: true });
    }
  } else {
    for (const e of ghostEmojis) add(e, { name: 'Discord', avatar: null, discord: true });
  }
  return [...out.entries()].filter(([, users]) => users.length).map(([emoji, users]) => ({ emoji, users }));
}

// Si el mensaje tiene reacciones del usuario "Discord" sin consultar todavia
function needsReview(messageId) {
  const ghost = ghostId();
  return !!ghost && !isReviewed(messageId) && !!db.prepare('SELECT 1 FROM reactions WHERE message_id = ? AND user_id = ? LIMIT 1').get(messageId, ghost);
}

const ghostId = () => (db.prepare("SELECT id FROM users WHERE username = 'discord-historial'").get() || {}).id;

function emitReactions(messageId) {
  const m = db.prepare('SELECT m.id, c.code FROM messages m JOIN channels c ON c.id = m.channel_id WHERE m.id = ?').get(messageId);
  if (!m) return;
  const reactions = db.prepare(`SELECT r.emoji, r.user_id, COALESCE(u.display_name, u.username) AS username
    FROM reactions r JOIN users u ON r.user_id = u.id WHERE r.message_id = ? ORDER BY r.id`).all(messageId);
  io.to(`channel:${m.code}`).emit('reactions-updated', { channelCode: m.code, messageId, reactions, fromPuente: true });
}

// ── Discord -> Haven ─────────────────────────────────────────────────────
function onDiscordReaction(t, d) {
  if (!d || !d.message_id) return;
  if (d.user_id && d.user_id === botUserId()) return; // la nuestra, puesta desde Haven
  const msg = db.prepare('SELECT id FROM messages WHERE discord_message_id = ?').get(d.message_id);
  if (!msg) return;

  if (t === 'MESSAGE_REACTION_REMOVE_ALL' || t === 'MESSAGE_REACTION_REMOVE_EMOJI') {
    const key = t === 'MESSAGE_REACTION_REMOVE_EMOJI' ? adjuntos.reactionKey(db, d.emoji) : null;
    db.transaction(() => {
      const rows = db.prepare(`SELECT user_id, emoji FROM puente_reacciones_origen WHERE message_id = ?${key ? ' AND emoji = ?' : ''}`).all(...(key ? [msg.id, key] : [msg.id]));
      for (const r of rows) {
        db.prepare('DELETE FROM reactions WHERE message_id = ? AND user_id = ? AND emoji = ?').run(msg.id, r.user_id, r.emoji);
        db.prepare('DELETE FROM puente_reacciones_origen WHERE message_id = ? AND user_id = ? AND emoji = ?').run(msg.id, r.user_id, r.emoji);
      }
      // Tambien las de Discord persona por persona y la del usuario "Discord" del historial
      const ghost = ghostId();
      db.prepare(`DELETE FROM puente_reacciones_discord WHERE message_id = ?${key ? ' AND emoji = ?' : ''}`).run(...(key ? [msg.id, key] : [msg.id]));
      if (ghost) db.prepare(`DELETE FROM reactions WHERE message_id = ? AND user_id = ?${key ? ' AND emoji = ?' : ''}`).run(...(key ? [msg.id, ghost, key] : [msg.id, ghost]));
    })();
    return emitReactions(msg.id);
  }

  const key = adjuntos.reactionKey(db, d.emoji);
  if (!key) return; // emoji de otro servidor que no esta en Haven
  const link = db.prepare('SELECT haven_user_id FROM puente_vinculos WHERE discord_user_id = ?').get(d.user_id);
  const userId = link ? link.haven_user_id : ghostId();
  if (!userId) return;

  if (t === 'MESSAGE_REACTION_ADD') {
    // Quien fue, persona por persona (para contar bien a los de Discord)
    const u = d.member && d.member.user ? d.member.user : { id: d.user_id };
    const name = (d.member && d.member.nick) || discordName(u);
    db.prepare('INSERT OR REPLACE INTO puente_reacciones_discord (message_id, emoji, discord_user_id, name, avatar) VALUES (?, ?, ?, ?, ?)')
      .run(msg.id, key, d.user_id, name, discordAvatar(u));
    const r = db.prepare('INSERT OR IGNORE INTO reactions (message_id, user_id, emoji) VALUES (?, ?, ?)').run(msg.id, userId, key);
    if (r.changes) db.prepare('INSERT OR IGNORE INTO puente_reacciones_origen (message_id, user_id, emoji) VALUES (?, ?, ?)').run(msg.id, userId, key);
    // La primera vez que se toca un mensaje viejo, completar con lo que ya tenia en Discord
    if (!isReviewed(msg.id)) refreshFromDiscord(msg.id).then(changed => { if (changed) emitReactions(msg.id); });
    emitReactions(msg.id);
  } else if (t === 'MESSAGE_REACTION_REMOVE') {
    db.prepare('DELETE FROM puente_reacciones_discord WHERE message_id = ? AND emoji = ? AND discord_user_id = ?').run(msg.id, key, d.user_id);
    if (link) {
      const was = db.prepare('DELETE FROM puente_reacciones_origen WHERE message_id = ? AND user_id = ? AND emoji = ?').run(msg.id, userId, key);
      if (was.changes) db.prepare('DELETE FROM reactions WHERE message_id = ? AND user_id = ? AND emoji = ?').run(msg.id, userId, key);
    } else if (isReviewed(msg.id)) {
      // El usuario "Discord" representa a todos los de Discord sin vincular: se
      // saca recien cuando ya no queda ninguno con ese emoji.
      const left = db.prepare(`SELECT 1 FROM puente_reacciones_discord d LEFT JOIN puente_vinculos v ON v.discord_user_id = d.discord_user_id
        WHERE d.message_id = ? AND d.emoji = ? AND v.haven_user_id IS NULL LIMIT 1`).get(msg.id, key);
      if (!left) {
        db.prepare('DELETE FROM reactions WHERE message_id = ? AND user_id = ? AND emoji = ?').run(msg.id, userId, key);
        db.prepare('DELETE FROM puente_reacciones_origen WHERE message_id = ? AND user_id = ? AND emoji = ?').run(msg.id, userId, key);
      }
    }
    emitReactions(msg.id);
  }
}

// ── Haven -> Discord ─────────────────────────────────────────────────────
// Se llama con cada 'reactions-updated' que emite Haven (una persona reacciono
// o saco una reaccion en Haven).
async function onHavenReactions(payload, discordTargetFor) {
  const messageId = payload && payload.messageId;
  if (!messageId) return;
  if (payload.fromPuente) return; // lo emitio el puente (vino de Discord)
  // Una imagen que el puente junto con el texto anterior en un solo mensaje de
  // Discord solo tiene ese id en puente_salientes.
  const m = db.prepare(`SELECT m.id, m.channel_id, m.thread_id, COALESCE(m.discord_message_id, s.discord_message_id) discord_message_id
    FROM messages m LEFT JOIN puente_salientes s ON s.haven_message_id = m.id WHERE m.id = ?`).get(messageId);
  if (!m || !m.discord_message_id || !/^\d+$/.test(m.discord_message_id)) return;
  const target = await discordTargetFor(m);
  if (!target) return;
  const channelForApi = target.threadId || target.channelId;

  // Emojis que alguien de Haven tiene en el mensaje (sin las que vinieron de Discord)
  const ghost = ghostId();
  const fromHaven = new Set(db.prepare(`SELECT DISTINCT r.emoji FROM reactions r
    WHERE r.message_id = ? AND r.user_id != ? AND NOT EXISTS (
      SELECT 1 FROM puente_reacciones_origen o WHERE o.message_id = r.message_id AND o.user_id = r.user_id AND o.emoji = r.emoji)`).all(messageId, ghost || -1).map(r => r.emoji));
  const botHas = new Set(db.prepare('SELECT emoji FROM puente_reacciones_bot WHERE message_id = ?').all(messageId).map(r => r.emoji));

  for (const emoji of fromHaven) {
    if (botHas.has(emoji)) continue;
    const param = adjuntos.discordReactionParam(db, emoji);
    if (!param) continue; // emoji propio de Haven que Discord no tiene
    const r = await api('PUT', `/channels/${channelForApi}/messages/${m.discord_message_id}/reactions/${encodeURIComponent(param)}/@me`);
    if (r && r.__error) { warn('no pude reaccionar en Discord:', r.__error); continue; }
    db.prepare('INSERT OR IGNORE INTO puente_reacciones_bot (message_id, emoji) VALUES (?, ?)').run(messageId, emoji);
  }
  for (const emoji of botHas) {
    if (fromHaven.has(emoji)) continue;
    const param = adjuntos.discordReactionParam(db, emoji);
    if (param) {
      const r = await api('DELETE', `/channels/${channelForApi}/messages/${m.discord_message_id}/reactions/${encodeURIComponent(param)}/@me`);
      if (r && r.__error && r.__error !== 404) { warn('no pude sacar la reaccion en Discord:', r.__error); continue; }
    }
    db.prepare('DELETE FROM puente_reacciones_bot WHERE message_id = ? AND emoji = ?').run(messageId, emoji);
  }
}

module.exports = { setup, onDiscordReaction, onHavenReactions, expandReactions, refreshFromDiscord, reactorsOf, needsReview, emitReactions };
