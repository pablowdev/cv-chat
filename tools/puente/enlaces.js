// Enlaces a mensajes entre CV Chat y Discord.
//
// "Copiar enlace del mensaje" en CV Chat (web/aviso.js) da un enlace de Haven:
//   https://<CV Chat>/app?channel=<codigo>&message=<id>[&thread=<id>]
// Cuando un mensaje con ese enlace pasa a Discord, el puente lo cambia por el
// enlace del mismo mensaje en Discord, para que alla tambien sirva. Si el
// mensaje no esta en Discord (por ejemplo, un canal que no se sincroniza), el
// enlace queda como esta. Los enlaces de Discord que llegan a CV Chat no se
// tocan: web/aviso.js los abre en CV Chat.

function messageLinksToDiscord(db, publicUrl, guildId, text) {
  let host = null;
  try { host = publicUrl ? new URL(publicUrl).host : null; } catch { /* sin PUBLIC_URL */ }
  if (!host || !guildId || !text || !text.includes(host)) return text;
  const esc = host.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`https?://${esc}/app(?:\\.html)?\\?channel=([a-f0-9]{8})&message=(\\d+)(?:&thread=\\d+)?`, 'gi');
  const msg = db.prepare('SELECT m.discord_message_id did, m.thread_id, c.discord_channel_id dch FROM messages m JOIN channels c ON c.id = m.channel_id WHERE m.id = ?');
  const root = db.prepare('SELECT discord_message_id did FROM messages WHERE id = ?');
  return text.replace(re, (full, code, id) => {
    try {
      const m = msg.get(Number(id));
      if (!m || !m.did || !m.dch) return full;
      const did = String(m.did).replace(/^thread-/, '');
      // El mensaje de origen de un hilo de foro ("thread-<id>"): el hilo mismo
      if (!m.thread_id) return String(m.did).startsWith('thread-') ? `https://discord.com/channels/${guildId}/${did}` : `https://discord.com/channels/${guildId}/${m.dch}/${did}`;
      // Una respuesta en un hilo: en Discord el hilo es un canal con el id de su mensaje de origen
      const r = root.get(m.thread_id);
      return r && r.did ? `https://discord.com/channels/${guildId}/${String(r.did).replace(/^thread-/, '')}/${did}` : full;
    } catch { return full; }
  });
}

module.exports = { messageLinksToDiscord };
