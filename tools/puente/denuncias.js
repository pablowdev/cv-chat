// Denunciar un mensaje (el menu del mensaje, web/aviso.js): le llega a los administradores al
// canal de avisos (AVISO_CANAL, como las denuncias del Marketplace), con el motivo, quien lo
// escribio, quien lo denuncio y el enlace. Lo pide Google Play (normas de proteccion infantil):
// que se pueda denunciar desde adentro de la app.
//
//  POST /puente/api/denunciar   { mensaje, motivo, detalle?, texto? }   (sesion)
//    - Solo mensajes de canales o conversaciones donde esta la persona.
//    - En los mensajes privados cifrados el servidor no puede leer el texto: lo manda quien
//      denuncia (lo que ve en su pantalla), si quiere.
//    - Una vez por mensaje y persona; hasta 20 por hora.

const MOTIVOS = {
  menores: 'Abuso o explotación de menores',
  acoso: 'Acoso o amenazas',
  odio: 'Odio o violencia',
  sexual: 'Contenido sexual no deseado',
  spam: 'Spam o estafa',
  otro: 'Otro motivo',
};
const POR_HORA = 20;
const ADMIN_CHANNEL = () => process.env.AVISO_CANAL || 'admilinks';
const publicUrl = () => String(process.env.PUBLIC_URL || '').replace(/\/+$/, '');

let db, io, log, warn;

function setup(ctx) {
  ({ db, io, log, warn } = ctx);
  db.exec(`
    CREATE TABLE IF NOT EXISTS puente_denuncias (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mensaje_id INTEGER NOT NULL,
      canal_id INTEGER NOT NULL,
      autor_id INTEGER,
      denunciante_id INTEGER NOT NULL,
      motivo TEXT NOT NULL,
      detalle TEXT,
      texto TEXT,
      creado INTEGER NOT NULL,
      UNIQUE (mensaje_id, denunciante_id)
    );
  `);
}

const limpio = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, n);
const una = s => s.replace(/\s*\n\s*/g, ' ');

function nombre(userId) {
  const u = userId && db.prepare('SELECT username, display_name FROM users WHERE id = ?').get(userId);
  return u ? (u.display_name || u.username) : null;
}

function aviso(text) {
  const ch = db.prepare('SELECT id, code FROM channels WHERE name = ? AND is_dm = 0').get(ADMIN_CHANNEL());
  if (!ch) { warn(`denuncias: no esta el canal #${ADMIN_CHANNEL()} para avisar`); return false; }
  const r = db.prepare('INSERT INTO messages (channel_id, user_id, content, is_webhook, webhook_username) VALUES (?, NULL, ?, 1, ?)').run(ch.id, text, 'Denuncias');
  io.to(`channel:${ch.code}`).emit('new-message', { channelCode: ch.code, message: {
    id: r.lastInsertRowid, content: text, created_at: new Date().toISOString(), username: 'Denuncias', user_id: null,
    is_webhook: 1, webhook_username: 'Denuncias', reactions: [], reply_to: null, replyContext: null, edited_at: null, thread: null } });
  return true;
}

async function handle(req, res, p, u, h) {
  if (p !== '/puente/api/denunciar') return false;
  if (req.method !== 'POST') return h.json(res, 405, { error: 'metodo' });
  const user = h.sessionUser(req);
  if (!user) return h.json(res, 401, { error: 'sin sesion' });
  const body = (await h.readJson(req, 8000)) || {};
  const motivo = MOTIVOS[body.motivo] ? body.motivo : null;
  if (!motivo) return h.json(res, 400, { error: 'Elegí un motivo.' });
  const m = db.prepare('SELECT m.id, m.channel_id, m.user_id, m.content, m.webhook_username, m.persona_username, c.name, c.code, c.is_dm FROM messages m JOIN channels c ON c.id = m.channel_id WHERE m.id = ?')
    .get(Number(body.mensaje) || 0);
  // Solo lo que la persona puede ver
  if (!m || !db.prepare('SELECT 1 FROM channel_members WHERE channel_id = ? AND user_id = ?').get(m.channel_id, user.id)) {
    return h.json(res, 404, { error: 'Ese mensaje ya no está.' });
  }
  if (m.user_id && m.user_id === user.id) return h.json(res, 400, { error: 'No podés denunciar tu propio mensaje.' });
  const ahora = Date.now();
  if (db.prepare('SELECT COUNT(*) n FROM puente_denuncias WHERE denunciante_id = ? AND creado > ?').get(user.id, ahora - 3600e3).n >= POR_HORA) {
    return h.json(res, 429, { error: 'Mandaste muchas denuncias seguidas. Probá de nuevo en un rato.' });
  }
  const detalle = limpio(body.detalle, 500);
  const texto = m.is_dm ? limpio(body.texto, 1000) : '';
  const nueva = db.prepare('INSERT OR IGNORE INTO puente_denuncias (mensaje_id, canal_id, autor_id, denunciante_id, motivo, detalle, texto, creado) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(m.id, m.channel_id, m.user_id || null, user.id, motivo, detalle || null, texto || null, ahora).changes;
  if (!nueva) return h.json(res, 200, { ok: true, ya: true });

  const autor = nombre(m.user_id) || m.persona_username || m.webhook_username || 'alguien';
  const quien = nombre(user.id) || user.username;
  const total = db.prepare('SELECT COUNT(*) n FROM puente_denuncias WHERE mensaje_id = ?').get(m.id).n;
  const urgente = motivo === 'menores';
  // En los canales el texto se lee del mensaje; en los privados (cifrados), lo que mando quien denuncia
  const extracto = m.is_dm ? (texto || '(mensaje privado cifrado: quien denuncia no mandó el texto)') : limpio(m.content, 300);
  const lineas = [
    `${urgente ? '🚨' : '🚩'} **Denuncia de un mensaje**${total > 1 ? ` (${total} denuncias)` : ''}: ${MOTIVOS[motivo]}`,
    `Escrito por **${autor}** en ${m.is_dm ? 'un mensaje privado' : `#${m.name}`} · lo denunció **${quien}**`,
    `> ${una(extracto).slice(0, 300)}`,
  ];
  if (detalle) lineas.push(`Comentario: ${una(detalle)}`);
  if (!m.is_dm) lineas.push(`${publicUrl()}/app?channel=${m.code}&message=${m.id}`);
  if (urgente) lineas.push('Si es material de abuso infantil: borrarlo, bloquear la cuenta y denunciarlo (ver circulovicioso.club/seguridad-infantil). No reenviarlo.');
  try { aviso(lineas.join('\n')); } catch (err) { warn('denuncias: aviso a admins:', err.message); }
  log(`denuncia: mensaje ${m.id} (${motivo}) por ${user.username}`);
  return h.json(res, 200, { ok: true });
}

module.exports = { setup, handle, MOTIVOS };
