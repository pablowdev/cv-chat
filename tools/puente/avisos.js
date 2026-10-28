// Notificaciones (push) de los mensajes que llegan desde Discord.
//
// Haven avisa de lo que se escribe en Haven, pero los mensajes que trae el
// puente no pasan por su codigo de mensajes, asi que nadie se enteraba si lo
// mencionaban desde Discord. Aca, como en Discord, se avisa a quien:
//  - mencionan (@persona, con la cuenta vinculada),
//  - le responden un mensaje suyo,
//  - esta en el canal cuando hay un @everyone o @here.
// Con las mismas reglas que Haven: no a quien tiene la app abierta y enfocada,
// ni a quien silencio el canal, ni a quien escribio. Usa las suscripciones y
// las claves de Haven (web-push ya viene configurado por Haven).

let db, io, log, warn, webpush = null;

function setup(ctx) {
  ({ db, io, log, warn } = ctx);
  try { webpush = require('/app/node_modules/web-push'); } catch { warn('avisos: sin web-push, no hay notificaciones de Discord'); }
  brand();
  // La app de la PC (aviso.js) dice cual es su suscripcion: mientras esta conectada (aunque este
  // escondida junto al reloj) ya avisa ella, con su sonido y un cartel de Windows sin sonido, como
  // Discord. Si ademas llegaba la notificacion del servidor, sonaba dos veces lo mismo.
  io.on('connection', (socket) => {
    socket.on('puente-push-propio', (data) => {
      if (!socket.user || !data || typeof data.endpoint !== 'string' || data.endpoint.length > 2000) return;
      try {
        const mio = db.prepare('SELECT 1 FROM push_subscriptions WHERE endpoint = ? AND user_id = ?').get(data.endpoint, socket.user.id);
        socket.puentePushPropio = mio ? data.endpoint : null;
      } catch { /* sin la tabla */ }
    });
  });
}

// Esa suscripcion es de una app de la PC abierta ahora
function avisaLaApp(endpoint) {
  if (!endpoint || !io) return false;
  for (const [, s] of io.sockets.sockets) if (s.connected && s.puentePushPropio === endpoint) return true;
  return false;
}

// Todas las notificaciones (las de Haven tambien: usan este mismo modulo) salen
// con la imagen propia del servidor a la derecha (web/icono-notificacion.png; si
// no hay, el icono de la app) en vez de la "H" de Haven, y en castellano:
// "Fulano en #canal" en vez de "Fulano in #canal".
//
// Y como en Discord, Haven ya no avisa de cada mensaje de un canal: solo de los
// mensajes directos y de los que te mencionan, te responden o tienen @everyone/@here.
const ICON = '/puente/icono-notificacion.png';
function brand() {
  if (!webpush || webpush.__puenteMarca) return;
  const send = webpush.sendNotification.bind(webpush);
  webpush.sendNotification = function (sub, payload, ...rest) {
    try {
      if (sub && avisaLaApp(sub.endpoint)) return Promise.resolve(); // ya aviso la app abierta
      if (typeof payload === 'string' && payload.startsWith('{')) {
        const p = JSON.parse(payload);
        if (p.__puente) delete p.__puente; // de onInbound: ya viene filtrado
        else if (!wanted(sub, p)) return Promise.resolve();
        if (typeof p.title === 'string') p.title = p.title.replace(/^(.+) in #(.+)$/, '$1 en #$2');
        if (!p.icon) p.icon = ICON;
        payload = JSON.stringify(p);
      }
    } catch { /* se manda como venia */ }
    return send(sub, payload, ...rest);
  };
  webpush.__puenteMarca = true;
}

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// Notificacion de Haven: si a quien le llega le corresponde. Ante la duda (sin
// canal o sin saber de quien es la suscripcion) se manda, como hacia Haven.
function wanted(sub, p) {
  if (!p.channelCode || !sub || !sub.endpoint) return true;
  const ch = db.prepare('SELECT id, is_dm, is_group FROM channels WHERE code = ?').get(p.channelCode);
  if (!ch || ch.is_dm || ch.is_group) return true;
  const ps = db.prepare('SELECT user_id FROM push_subscriptions WHERE endpoint = ?').get(sub.endpoint);
  if (!ps) return true;
  const me = db.prepare('SELECT username, display_name FROM users WHERE id = ?').get(ps.user_id);
  if (!me) return true;
  // El mensaje entero (Haven corta el texto a 120): el ultimo del canal que empiece igual
  const body = String(p.body || '');
  const start = body.endsWith('...') ? body.slice(0, -3) : body;
  const recent = db.prepare('SELECT content, reply_to FROM messages WHERE channel_id = ? ORDER BY id DESC LIMIT 8').all(ch.id);
  const m = recent.find(r => String(r.content || '').startsWith(start)) || { content: body, reply_to: null };
  const text = String(m.content || '');
  if (/@(everyone|here)\b/i.test(text)) return true;
  for (const n of [me.username, me.display_name]) {
    if (n && new RegExp('@' + escapeRe(n) + '(?![\\p{L}\\p{N}_])', 'iu').test(text)) return true;
  }
  if (m.reply_to) {
    const r = db.prepare('SELECT user_id FROM messages WHERE id = ?').get(m.reply_to);
    if (r && r.user_id === ps.user_id) return true;
  }
  return false;
}

function strip(text) {
  return String(text || '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '🖼️')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_~`>|]+/g, '')
    .replace(/\s+/g, ' ').trim();
}

// d: { channel: { id, code, name }, content, msg, replyToId, author }
function onInbound(d) {
  if (!webpush || !d || !d.channel) return;
  try {
    const msg = d.msg || {};
    const want = new Set();
    const byDiscord = db.prepare('SELECT haven_user_id FROM puente_vinculos WHERE discord_user_id = ?');
    for (const u of msg.mentions || []) {
      const l = u && byDiscord.get(String(u.id));
      if (l) want.add(l.haven_user_id);
    }
    if (d.replyToId) {
      const p = db.prepare(`SELECT m.user_id, pa.discord_user_id d FROM messages m LEFT JOIN puente_autores pa ON pa.message_id = m.id WHERE m.id = ?`).get(d.replyToId);
      if (p) {
        const l = p.d ? byDiscord.get(String(p.d)) : null;
        if (l) want.add(l.haven_user_id);
        else if (p.user_id && !p.d) want.add(p.user_id);
      }
    }
    if (msg.mention_everyone) {
      for (const r of db.prepare('SELECT user_id FROM channel_members WHERE channel_id = ?').all(d.channel.id)) want.add(r.user_id);
    }
    // Nunca a quien escribio
    if (msg.author) { const me = byDiscord.get(String(msg.author.id)); if (me) want.delete(me.haven_user_id); }
    if (!want.size) return;

    const active = new Set();
    for (const [, s] of io.sockets.sockets) if (s.user && s.hasFocus !== false) active.add(s.user.id);
    let muted = new Set();
    try { muted = new Set(db.prepare('SELECT user_id FROM user_channel_prefs WHERE channel_code = ? AND muted = 1').all(d.channel.code).map(r => r.user_id)); } catch { /* sin la tabla */ }
    const member = db.prepare('SELECT 1 FROM channel_members WHERE channel_id = ? AND user_id = ?');

    const body = strip(d.content);
    const payload = JSON.stringify({
      title: `${d.author || 'Alguien'} en #${d.channel.name}`,
      body: body.length > 120 ? body.slice(0, 117) + '...' : body || 'Te mencionó',
      channelCode: d.channel.code, tag: `haven-${d.channel.code}`, url: '/app', __puente: 1,
    });
    let sent = 0;
    for (const uid of want) {
      if (active.has(uid) || muted.has(uid) || !member.get(d.channel.id, uid)) continue;
      for (const sub of db.prepare('SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?').all(uid)) {
        sent++;
        webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, { TTL: 3600 })
          .catch(err => {
            if (err && (err.statusCode === 404 || err.statusCode === 410)) {
              try { db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(sub.endpoint); } catch { /* otra vez sera */ }
            }
          });
      }
    }
    if (sent) log(`avisos: ${sent} notificacion${sent === 1 ? '' : 'es'} de un mensaje de Discord en #${d.channel.name}`);
  } catch (err) { warn('avisos:', err.message); }
}

module.exports = { setup, onInbound };
