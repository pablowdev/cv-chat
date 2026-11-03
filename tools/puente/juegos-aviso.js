// Las partidas nuevas de los Juegos, en #que-paso (JUEGOS_CANAL, o el canal de los avisos del foro): quien
// armo una mesa abierta, de que juego, y el enlace para entrar (/app?truco=<id> y los demas: aviso.js abre
// la mesa ahi mismo). Las de la compu y las de solo invitados no se avisan. Como mucho un aviso cada
// 10 minutos por persona y juego (armar y cancelar seguido no llena el canal). Se escribe como los avisos
// del Marketplace (mercado.js): un mensaje del canal a nombre de "Juegos".

const CANAL = () => String(process.env.JUEGOS_CANAL || process.env.FORO_CANAL || 'que-paso').trim().toLowerCase();
const CADA = 10 * 60e3;
const ultimo = new Map(); // "juego:usuario" -> cuando se aviso

// db, io: los de cada juego. quien: el id de quien armo la mesa. texto: lo que sigue a su nombre
// ("armó una partida de **Truco** (a 30)"). enlace: /app?truco=<id>
function anunciar(db, io, warn, { juego, quien, texto, enlace }) {
  try {
    const k = juego + ':' + quien;
    if (Date.now() - (ultimo.get(k) || 0) < CADA) return;
    const ch = db.prepare('SELECT id, code FROM channels WHERE LOWER(name) = ? AND is_dm = 0 ORDER BY id LIMIT 1').get(CANAL());
    const u = db.prepare('SELECT COALESCE(display_name, username) nombre FROM users WHERE id = ?').get(quien);
    if (!ch || !u) return;
    ultimo.set(k, Date.now());
    if (ultimo.size > 500) ultimo.delete(ultimo.keys().next().value);
    const base = String(process.env.PUBLIC_URL || '').replace(/\/+$/, '');
    const nombre = String(u.nombre).replace(/[*_~`|[\]]/g, '');
    const content = `🎮 **${nombre}** ${texto}: [entrar a la partida](${base}${enlace})`;
    const r = db.prepare('INSERT INTO messages (channel_id, user_id, content, is_webhook, webhook_username) VALUES (?, NULL, ?, 1, ?)').run(ch.id, content, 'Juegos');
    io.to(`channel:${ch.code}`).emit('new-message', { channelCode: ch.code, message: {
      id: r.lastInsertRowid, content, created_at: new Date().toISOString(), username: 'Juegos', user_id: null,
      is_webhook: 1, webhook_username: 'Juegos', reactions: [], reply_to: null, replyContext: null, edited_at: null, thread: null } });
  } catch (err) { if (warn) warn(`juegos: aviso en #${CANAL()}:`, err.message); }
}

module.exports = { anunciar };
