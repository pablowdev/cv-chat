// Leído en todos lados: Haven guarda hasta dónde leyó cada uno (read_positions), pero no les
// avisa a los otros dispositivos abiertos de la misma persona (el navegador, la app del
// celular, la de la PC), y el que queda abierto sigue mostrando en negrita lo que ya se leyó
// en otro lado. Acá:
//  - después de cada "leído" (mark-read, mark-read-channel, mark-all-read) se manda a los
//    otros dispositivos de esa persona cuántos le quedan sin leer en ese canal;
//  - puente-no-leidos: la app pide la cuenta de todos sus canales al volver a primer plano o
//    al reconectarse (aviso.js), con la misma cuenta que usa Haven para la lista de canales.
//  - puente-dm-recientes: cuando fue el ultimo mensaje de cada conversacion privada, para
//    ordenarlas como Discord (la mas reciente arriba). Haven tiene ese orden pero nunca le
//    manda a la app la fecha, asi que no ordenaba nada.

const READ_EVENTS = new Set(['mark-read', 'mark-read-channel', 'mark-all-read']);

function setup({ db, io, warn }) {
  // Lo mismo que cuenta Haven (socketHandlers/index.js): sin respuestas de hilos, sin los
  // propios, sin avisos; hasta 1000
  const countQ = db.prepare("SELECT COUNT(*) AS cnt FROM (SELECT 1 FROM messages WHERE channel_id = ? AND id > ? AND (user_id IS NULL OR user_id != ?) AND thread_id IS NULL AND COALESCE(type, 'user') != 'notice' LIMIT 1000)");
  const readQ = db.prepare('SELECT last_read_message_id AS r FROM read_positions WHERE user_id = ? AND channel_id = ?');
  const chanQ = db.prepare('SELECT id FROM channels WHERE code = ?');
  const dmsQ = db.prepare("SELECT c.code, c.created_at AS creado, (SELECT m.created_at FROM messages m WHERE m.channel_id = c.id AND m.thread_id IS NULL ORDER BY m.id DESC LIMIT 1) AS ultimo FROM channel_members cm JOIN channels c ON c.id = cm.channel_id WHERE cm.user_id = ? AND c.is_dm = 1");
  const ms = (t) => { const v = t ? Date.parse(String(t).replace(' ', 'T') + (/Z$|[+-]\d\d:?\d\d$/.test(String(t)) ? '' : 'Z')) : NaN; return Number.isFinite(v) ? v : 0; };
  const mineQ = db.prepare('SELECT c.id, c.code FROM channel_members cm JOIN channels c ON c.id = cm.channel_id WHERE cm.user_id = ?');
  const unread = (userId, channelId) => {
    const row = readQ.get(userId, channelId);
    return countQ.get(channelId, row ? row.r : 0, userId).cnt;
  };
  const others = (socket) => {
    const out = [];
    for (const [, s] of io.sockets.sockets) if (s !== socket && s.user && s.user.id === socket.user.id) out.push(s);
    return out;
  };

  io.on('connection', (socket) => {
    socket.use((packet, next) => {
      next();
      const [event, data] = packet;
      if (!READ_EVENTS.has(event) || !socket.user) return;
      // Despues de que Haven lo guarde
      setImmediate(() => {
        try {
          const peers = others(socket);
          if (!peers.length) return;
          if (event === 'mark-all-read') {
            const counts = {};
            for (const c of mineQ.all(socket.user.id)) counts[c.code] = unread(socket.user.id, c.id);
            for (const s of peers) s.emit('puente-leido', { counts });
            return;
          }
          const code = data && typeof data.code === 'string' ? data.code.trim() : '';
          const ch = code && chanQ.get(code);
          if (!ch) return;
          const n = unread(socket.user.id, ch.id);
          for (const s of peers) s.emit('puente-leido', { counts: { [code]: n } });
        } catch (err) { warn('leidos:', err.message); }
      });
    });

    socket.on('puente-no-leidos', (data, ack) => {
      if (typeof ack !== 'function' || !socket.user) return;
      try {
        const counts = {};
        for (const c of mineQ.all(socket.user.id)) counts[c.code] = unread(socket.user.id, c.id);
        ack({ counts });
      } catch (err) { warn('leidos:', err.message); ack({ error: true }); }
    });

    socket.on('puente-dm-recientes', (data, ack) => {
      if (typeof ack !== 'function' || !socket.user) return;
      try {
        const dms = {};
        for (const d of dmsQ.all(socket.user.id)) dms[d.code] = ms(d.ultimo) || ms(d.creado);
        ack({ dms });
      } catch (err) { warn('dm recientes:', err.message); ack({ error: true }); }
    });
  });
}

module.exports = { setup };
