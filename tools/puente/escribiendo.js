// "Está escribiendo…" de los dos lados (parte del puente).
//
//  - Discord -> app: cuando alguien escribe en un canal de Discord, Discord avisa
//    (TYPING_START, dura 10 segundos) y en la app se ve "Fulano está escribiendo…"
//    en ese canal, con su nombre (el de su cuenta si la vinculo).
//  - App -> Discord: cuando alguien escribe en la app, en Discord se ve que el bot
//    esta escribiendo ("CV Chat está escribiendo…"). Discord no deja mostrar el
//    nombre de otra persona: solo el bot puede "escribir".
//
// Lo que no se puede sincronizar: los mensajes leidos. Discord no deja que un bot
// marque canales como leidos para otra persona (solo se puede con la cuenta de
// cada uno, y eso va contra las reglas de Discord).

let db, io, api, log, warn, isBridged, getBotUserId;
const DISCORD_MS = 10000;
const lastSent = new Map(); // canal de Discord -> ultima vez que el bot "escribio"

function setup(ctx) {
  ({ db, io, api, log, warn, isBridged, getBotUserId } = ctx);
  const chByCode = db.prepare('SELECT id, discord_channel_id d FROM channels WHERE code = ?');
  io.on('connection', (socket) => {
    socket.use((packet, next) => {
      next();
      if (!packet || packet[0] !== 'typing' || !socket.user) return;
      try {
        const data = packet[1] || {};
        if (typeof data.code !== 'string' || data.code !== socket.currentChannel) return;
        const ch = chByCode.get(data.code);
        if (!ch || !ch.d || !isBridged(ch.d)) return;
        // Discord muestra el "escribiendo" 10 segundos: alcanza con avisar cada 8
        const now = Date.now();
        if (now - (lastSent.get(ch.d) || 0) < 8000) return;
        lastSent.set(ch.d, now);
        api('POST', `/channels/${ch.d}/typing`).then(r => { if (r && r.__error && r.__error !== 429) warn('escribiendo: Discord respondió', r.__error); }).catch(() => {});
      } catch (err) { warn('escribiendo:', err.message); }
    });
  });
}

// Alguien escribe en Discord
function onDiscordTyping(d) {
  try {
    if (!d || !d.channel_id || !d.user_id) return;
    if (d.user_id === getBotUserId()) return; // el bot, por lo que se escribe en la app
    const m = d.member || {};
    if (m.user && m.user.bot) return;
    const ch = db.prepare('SELECT code FROM channels WHERE discord_channel_id = ?').get(d.channel_id);
    if (!ch) return; // (los hilos de Discord no)
    let name = null;
    const link = db.prepare('SELECT haven_user_id FROM puente_vinculos WHERE discord_user_id = ?').get(d.user_id);
    if (link) {
      const u = db.prepare('SELECT COALESCE(display_name, username) n FROM users WHERE id = ?').get(link.haven_user_id);
      name = u && u.n;
    }
    if (!name) name = m.nick || (m.user && (m.user.global_name || m.user.username)) || null;
    if (!name) return;
    io.to(`channel:${ch.code}`).emit('puente-escribiendo', { channelCode: ch.code, username: String(name).slice(0, 40), ms: DISCORD_MS });
  } catch (err) { warn('escribiendo:', err.message); }
}

module.exports = { setup, onDiscordTyping };
