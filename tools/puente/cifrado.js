// El cifrado de los mensajes directos, para todos y sin que nadie tenga que hacer nada (web/aviso.js):
//
//  - Las claves de cada persona se crean en su dispositivo, protegidas con un secreto que tambien queda
//    solo en sus dispositivos (sin depender de haber escrito la contraseña: Discord, el foro, la pagina).
//  - Un dispositivo nuevo recibe ese secreto de otro de sus dispositivos abiertos: el nuevo manda una clave
//    publica de un solo uso, el otro le devuelve el secreto cifrado para esa clave (ECDH). Aca solo se pasan
//    esos datos de un dispositivo al otro de la misma cuenta; el servidor no puede leer el secreto.
//      puente-llave-pedir  {pub}               (dispositivo nuevo)  -> puente-llave-pedido {de, pub} a los otros
//      puente-llave-dar    {para, pub, iv, ct} (otro dispositivo)   -> puente-llave-recibida {pub, iv, ct} al nuevo
//  - Un mensaje a quien todavia no tiene claves no sale sin cifrar: queda esperando en el dispositivo de
//    quien lo escribio y se manda cifrado apenas la otra persona entra. A ella se le avisa por email, en la
//    campanita de la web y el foro, y en CV Chat:
//      puente-pm-espera    {code}              -> el aviso (una vez cada 12 horas por conversacion)

const PEDIDO_MS = 10 * 60 * 1000;
const AVISO_CADA_MS = 12 * 60 * 60 * 1000;
let db, io, log, warn, publicUrl = '', email, campana, avisarUsuario;
const pedidos = new Map(); // socket id -> { uid, pub, t }

function setup(ctx) {
  ({ db, io, log, warn, publicUrl, email, campana, avisarUsuario } = ctx);
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS puente_pm_espera_avisos (
      para INTEGER NOT NULL, de INTEGER NOT NULL, avisado INTEGER NOT NULL, PRIMARY KEY (para, de)
    )`);
  } catch (err) { warn('cifrado: no arranco:', err.message); return; }
  io.on('connection', (socket) => {
    // Un dispositivo nuevo: los pedidos que hay de la misma cuenta
    setTimeout(() => {
      if (!socket.user || !socket.connected) return;
      for (const [id, p] of pedidos) if (p.uid === socket.user.id && id !== socket.id && Date.now() - p.t < PEDIDO_MS) socket.emit('puente-llave-pedido', { de: id, pub: p.pub });
    }, 3000);
    socket.on('puente-llave-pedir', (d) => {
      if (!socket.user || !d || typeof d.pub !== 'object' || JSON.stringify(d.pub).length > 1000) return;
      pedidos.set(socket.id, { uid: socket.user.id, pub: d.pub, t: Date.now() });
      for (const [, s] of io.sockets.sockets) if (s.user && s.user.id === socket.user.id && s.id !== socket.id) s.emit('puente-llave-pedido', { de: socket.id, pub: d.pub });
    });
    socket.on('puente-llave-dar', (d) => {
      if (!socket.user || !d || typeof d.para !== 'string') return;
      const p = pedidos.get(d.para), destino = io.sockets.sockets.get(d.para);
      if (!p || !destino || p.uid !== socket.user.id || !destino.user || destino.user.id !== socket.user.id) return;
      if (typeof d.iv !== 'string' || typeof d.ct !== 'string' || d.ct.length > 2000 || JSON.stringify(d.pub || '').length > 1000) return;
      pedidos.delete(d.para);
      destino.emit('puente-llave-recibida', { pub: d.pub, iv: d.iv, ct: d.ct });
    });
    socket.on('disconnect', () => { pedidos.delete(socket.id); });
    socket.on('puente-pm-espera', (d, ack) => {
      const fin = (r) => { if (typeof ack === 'function') ack(r); };
      try { fin(espera(socket.user, d && d.code)); } catch (err) { warn('cifrado: aviso:', err.message); fin({ error: true }); }
    });
  });
  setInterval(() => { for (const [id, p] of pedidos) if (Date.now() - p.t > PEDIDO_MS) pedidos.delete(id); }, 60 * 1000).unref();
  log('cifrado: claves para todos y mensajes que esperan, listo');
}

// Le avisa a quien tiene un mensaje esperando que entre a CV Chat (asi se crean sus claves)
function espera(user, code) {
  if (!user || typeof code !== 'string') return { error: true };
  const ch = db.prepare('SELECT id FROM channels WHERE code = ? AND is_dm = 1').get(code);
  if (!ch || !db.prepare('SELECT 1 FROM channel_members WHERE channel_id = ? AND user_id = ?').get(ch.id, user.id)) return { error: true };
  const otro = db.prepare('SELECT u.id, u.username, u.public_key FROM channel_members m JOIN users u ON u.id = m.user_id WHERE m.channel_id = ? AND m.user_id != ?').get(ch.id, user.id);
  if (!otro) return { error: true };
  if (otro.public_key) return { tiene: true };
  const ya = db.prepare('SELECT avisado FROM puente_pm_espera_avisos WHERE para = ? AND de = ?').get(otro.id, user.id);
  if (ya && Date.now() - ya.avisado < AVISO_CADA_MS) return { ok: true, avisado: true };
  db.prepare('INSERT INTO puente_pm_espera_avisos (para, de, avisado) VALUES (?, ?, ?) ON CONFLICT(para, de) DO UPDATE SET avisado = excluded.avisado').run(otro.id, user.id, Date.now());
  const yo = db.prepare('SELECT username, display_name FROM users WHERE id = ?').get(user.id) || {};
  const de = yo.display_name || yo.username || 'Alguien';
  const url = `${publicUrl}/app?mensajes=1`;
  const titulo = `${de} te mandó un mensaje privado`;
  const texto = 'Entrá a CV Chat para leerlo: los mensajes privados están cifrados y se abren cuando entrás.';
  try { avisarUsuario(otro.id, { title: titulo, body: texto, url, tag: 'puente-pm-espera-' + user.id }); } catch (err) { warn('cifrado: aviso en el chat:', err.message); }
  try { campana.registrar(otro.id, { origen: 'chat', titulo, texto, url, clave: `pm-espera-${user.id}-${Math.floor(Date.now() / AVISO_CADA_MS)}` }); } catch (err) { warn('cifrado: campanita:', err.message); }
  const em = email.status(otro.id);
  if (em.email && em.confirmado) {
    email.sendMail(em.email, titulo, 'Tenés un mensaje privado', [`${de} te escribió un mensaje privado en CV Chat.`, 'Para leerlo, entrá a CV Chat: los mensajes privados están cifrados de punta a punta y se abren solo en tus dispositivos.'],
      ['Entrar a CV Chat', url], 'Te llega este aviso porque alguien te escribió por mensaje privado.')
      .catch(err => warn('cifrado: email:', err.message));
  }
  log(`cifrado: mensaje esperando para Haven #${otro.id} (sin claves todavia), de #${user.id}`);
  return { ok: true };
}

module.exports = { setup };
