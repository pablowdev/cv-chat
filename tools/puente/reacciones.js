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
  `);
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
    })();
    return emitReactions(msg.id);
  }

  const key = adjuntos.reactionKey(db, d.emoji);
  if (!key) return; // emoji de otro servidor que no esta en Haven
  const link = db.prepare('SELECT haven_user_id FROM puente_vinculos WHERE discord_user_id = ?').get(d.user_id);
  const userId = link ? link.haven_user_id : ghostId();
  if (!userId) return;

  if (t === 'MESSAGE_REACTION_ADD') {
    const r = db.prepare('INSERT OR IGNORE INTO reactions (message_id, user_id, emoji) VALUES (?, ?, ?)').run(msg.id, userId, key);
    if (!r.changes) return;
    db.prepare('INSERT OR IGNORE INTO puente_reacciones_origen (message_id, user_id, emoji) VALUES (?, ?, ?)').run(msg.id, userId, key);
    emitReactions(msg.id);
  } else if (t === 'MESSAGE_REACTION_REMOVE' && link) {
    // Solo las cuentas vinculadas: la del usuario "Discord" puede ser de varias personas.
    const was = db.prepare('DELETE FROM puente_reacciones_origen WHERE message_id = ? AND user_id = ? AND emoji = ?').run(msg.id, userId, key);
    if (!was.changes) return;
    db.prepare('DELETE FROM reactions WHERE message_id = ? AND user_id = ? AND emoji = ?').run(msg.id, userId, key);
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
  const m = db.prepare('SELECT id, channel_id, thread_id, discord_message_id FROM messages WHERE id = ?').get(messageId);
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

module.exports = { setup, onDiscordReaction, onHavenReactions };
