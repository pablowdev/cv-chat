// Los invitados (jugar sin cuenta, login.js), parte del puente:
//
//  - Un rato para volver. Haven borra la cuenta de invitado 5 segundos despues de su ultima conexion (#5381,
//    socketHandlers/index.js): en el celular alcanzaba con irse a WhatsApp a pasar el enlace de la mesa, o con una
//    recarga lenta, para volver y encontrarse afuera, con otro nombre y sin la mesa. Ahora se borra recien si pasan
//    30 minutos sin que vuelva: el borrado de Haven (su DELETE, siempre el mismo) no hace nada, y lo hace esto cada
//    minuto, igual que Haven (los mensajes protegidos quedan sin autor). Tambien los que quedaron de antes de un
//    reinicio (con el de Haven, si se reiniciaba en esos 5 segundos, la cuenta quedaba para siempre). Las mesas
//    tienen sus propios plazos (invitados-fuera.js).
//
//  - "Quedate con este nombre": el invitado pasa a ser una cuenta, con el mismo nombre, sin salir de donde esta
//    (la misma cuenta, asi sigue en su mesa). Pide lo mismo que el registro: email (email.js; le llega el mail para
//    confirmarlo) y contraseña (las reglas de Haven), y que el nombre no sea de otra persona de la comunidad
//    (identidad.js). Hace lo que Haven le hace a una cuenta nueva (provisionNewUser: los roles automaticos y la
//    bienvenida, que no se puede llamar desde afuera) y deja recordado el dispositivo (dospasos.js), como al
//    registrarse. Los canales llegan solos al reconectarse (accesos.js), como a cualquier cuenta nueva.
//
//   POST /puente/api/invitado/cuenta  { email, clave }  (con la sesion del invitado)
//     -> { ok, token, user }  |  { error }
'use strict';

const GRACIA_MS = 30 * 60e3;
const SQL_HAVEN = 'DELETE FROM users WHERE id = ? AND is_guest = 1'; // (el de Haven, tal cual)
let db, io, log = () => {}, warn = () => {};
const fuera = new Map(); // id del invitado -> desde cuando no tiene ninguna conexion

function conectados() {
  const s = new Set();
  try { for (const [, x] of io.of('/').sockets) if (x.user && x.user.id) s.add(x.user.id); } catch { /* sin io */ }
  return s;
}

// El borrado de Haven no hace nada: anota desde cuando no esta (lo borra barrer, si no vuelve)
function margen() {
  const prepare = db.prepare;
  if (prepare.__puenteInvitados) return;
  const envuelto = function (sql, ...rest) {
    if (sql === SQL_HAVEN) return { run: (id) => { if (!fuera.has(Number(id))) fuera.set(Number(id), Date.now()); return { changes: 0, lastInsertRowid: 0 }; } };
    return prepare.call(this, sql, ...rest);
  };
  envuelto.__puenteInvitados = true;
  db.prepare = envuelto;
}

function borrar(g) {
  let kept = null;
  try { kept = require('/app/src/protectedMessages').keptSql('m'); } catch { /* sin el modulo: no hay protegidos */ }
  db.transaction(() => {
    if (kept) db.prepare(`UPDATE messages SET user_id = NULL WHERE id IN (SELECT m.id FROM messages m WHERE m.user_id = ? AND ${kept})`).run(g.id);
    db.prepare('DELETE FROM users WHERE id = ? AND is_guest = 1 -- puente: invitados.js').run(g.id);
  })();
}

function barrer() {
  const vivos = conectados(), ahora = Date.now();
  const filas = db.prepare('SELECT id, username FROM users WHERE is_guest = 1').all();
  const siguen = new Set();
  for (const g of filas) {
    siguen.add(g.id);
    if (vivos.has(g.id)) { fuera.delete(g.id); continue; }
    const desde = fuera.get(g.id);
    if (!desde) { fuera.set(g.id, ahora); continue; }
    if (ahora - desde < GRACIA_MS) continue;
    try {
      borrar(g);
      fuera.delete(g.id);
      log(`invitados: ${g.username} (#${g.id}) no volvió en ${GRACIA_MS / 60e3} minutos: se borró y su nombre quedó libre`);
    } catch (err) { warn(`invitados: no se pudo borrar a ${g.username} (#${g.id}):`, err.message); }
  }
  for (const id of [...fuera.keys()]) if (!siguen.has(id)) fuera.delete(id);
}

// ── "Quedate con este nombre" ──
const intentos = new Map(); // ip -> [momentos]
function demasiados(ip) {
  const ahora = Date.now(), l = (intentos.get(ip) || []).filter((t) => ahora - t < 10 * 60e3);
  l.push(ahora); intentos.set(ip, l);
  if (intentos.size > 5000) for (const [k, v] of intentos) if (!v.some((t) => ahora - t < 10 * 60e3)) intentos.delete(k);
  return l.length > 8;
}
const ajuste = (k) => { try { const r = db.prepare('SELECT value FROM server_settings WHERE key = ?').get(k); return r ? String(r.value) : ''; } catch { return ''; } };

// Lo que Haven le hace a una cuenta nueva (auth.js provisionNewUser), paso por paso
function preparar(userId, username) {
  try {
    const auto = db.prepare("SELECT id, link_channel_access FROM roles WHERE auto_assign = 1 AND scope = 'server'").all();
    const rol = db.prepare('INSERT OR IGNORE INTO user_roles (user_id, role_id, channel_id, granted_by) VALUES (?, ?, NULL, NULL)');
    const canal = db.prepare('INSERT OR IGNORE INTO channel_members (channel_id, user_id) VALUES (?, ?)');
    for (const r of auto) {
      rol.run(userId, r.id);
      if (r.link_channel_access) for (const c of db.prepare('SELECT channel_id FROM role_channel_access WHERE role_id = ? AND grant_on_promote = 1').all(r.id)) canal.run(c.channel_id, userId);
    }
  } catch (err) { warn('invitados: roles automaticos:', err.message); }
  try {
    const tpl = ajuste('welcome_message').trim();
    if (!tpl) return;
    const texto = tpl.replace(/\{user\}/gi, username).slice(0, 500);
    const ins = db.prepare("INSERT INTO messages (channel_id, user_id, content, type) VALUES (?, ?, ?, 'welcome')");
    for (const ch of db.prepare('SELECT id, code FROM channels WHERE is_dm = 0 AND show_welcome = 1').all()) {
      const info = ins.run(ch.id, userId, texto);
      io.to(`channel:${ch.code}`).emit('welcome-message', { channelCode: ch.code, message: { id: info.lastInsertRowid, user_id: userId, content: texto, type: 'welcome', created_at: new Date().toISOString() } });
    }
  } catch (err) { warn('invitados: bienvenida:', err.message); }
}

async function cuenta(req, res, h) {
  const ip = String(req.headers['x-forwarded-for'] || '').split(',').pop().trim() || req.socket.remoteAddress || '';
  const auth = req.headers.authorization || '';
  let dec = null;
  try { dec = require('/app/src/auth').verifyToken(auth.startsWith('Bearer ') ? auth.slice(7) : ''); } catch { dec = null; }
  if (!dec || !dec.id) return h.json(res, 401, { error: 'Tu sesión de invitado se cerró. Entrá de nuevo.' });
  const u = db.prepare('SELECT id, username, display_name, is_guest FROM users WHERE id = ?').get(dec.id);
  if (!u) return h.json(res, 401, { error: 'Tu sesión de invitado se cerró. Entrá de nuevo.' });
  if (!u.is_guest) return h.json(res, 409, { error: 'Esta cuenta ya no es de invitado.' });
  try { if (db.prepare('SELECT 1 FROM bans WHERE user_id = ?').get(u.id)) return h.json(res, 403, { error: 'No se puede.' }); } catch { /* sin la tabla */ }
  if (demasiados(ip)) return h.json(res, 429, { error: 'Hubo demasiados intentos. Esperá un rato y probá de nuevo.' });
  // (si el registro esta cerrado o con invitacion, tambien esto: que use el formulario de siempre)
  if (ajuste('registration_token_enabled') === 'true' || ajuste('whitelist_enabled') === 'true') return h.json(res, 403, { error: 'El registro de cuentas nuevas está cerrado ahora.' });
  const body = await h.readJson(req);
  if (!body || typeof body !== 'object') return h.json(res, 400, { error: 'Solicitud inválida.' });
  const email = require('./email.js');
  const correo = email.norm(body.email);
  const clave = typeof body.clave === 'string' ? body.clave : '';
  if (!correo) return h.json(res, 400, { error: 'Poné tu email: sirve para recuperar la contraseña si la olvidás.', campo: 'email' });
  if (!email.valid(correo)) return h.json(res, 400, { error: 'Ese email no parece válido.', campo: 'email' });
  if (email.takenByOther(correo, u.id)) return h.json(res, 400, { error: 'Ese email ya está en uso en otra cuenta.', campo: 'email' });
  if (clave.length < 8 || clave.length > 128) return h.json(res, 400, { error: 'La contraseña tiene que tener entre 8 y 128 caracteres.', campo: 'clave' });
  if (clave.toLowerCase().includes(u.username.toLowerCase())) return h.json(res, 400, { error: 'La contraseña no puede contener tu nombre.', campo: 'clave' });
  let otro = null;
  try { otro = require('./identidad.js').problem(0, u.username); } catch { otro = null; }
  if (otro) return h.json(res, 400, { error: otro, campo: 'nombre' });
  const hash = await require('/app/node_modules/bcryptjs').hash(clave, 12);
  const r = db.prepare('UPDATE users SET password_hash = ?, is_guest = 0 WHERE id = ? AND is_guest = 1').run(hash, u.id);
  if (!r.changes) return h.json(res, 409, { error: 'Esta cuenta ya no es de invitado.' });
  fuera.delete(u.id);
  // las conexiones que tiene abiertas ya no son de invitado (si no, al cerrarlas Haven la trataria como uno)
  try { for (const [, s] of io.of('/').sockets) if (s.user && s.user.id === u.id) s.user.isGuest = false; } catch { /* sin io */ }
  preparar(u.id, u.username);
  try { const x = await email.saveAndVerify(u.id, correo); if (x && x.error) warn(`invitados: email de ${u.username}:`, x.error); } catch (err) { warn('invitados: email:', err.message); }
  try { const dp = require('./dospasos.js'); if (dp.on()) res.setHeader('Set-Cookie', [].concat(res.getHeader('Set-Cookie') || [], dp.recordar(req, u.id))); } catch (err) { warn('invitados: dispositivo:', err.message); }
  const user = { id: u.id, username: u.username, isAdmin: false, displayName: u.display_name || u.username };
  const token = require('/app/src/auth').generateToken({ id: u.id, username: u.username, isAdmin: false, displayName: user.displayName });
  log(`invitados: ${u.username} (#${u.id}) se quedó con su nombre: ahora es una cuenta`);
  return h.json(res, 200, { ok: true, token, user });
}

async function handle(req, res, p, u, h) {
  if (p !== '/puente/api/invitado/cuenta') return false;
  if (req.method !== 'POST') return h.json(res, 405, { error: 'metodo' });
  return cuenta(req, res, h);
}

function setup(ctx) {
  ({ db, io } = ctx);
  log = ctx.log || log; warn = ctx.warn || warn;
  margen();
  setInterval(() => { try { barrer(); } catch (err) { warn('invitados:', err.message); } }, 60e3).unref();
  log(`invitados: tienen ${GRACIA_MS / 60e3} minutos para volver antes de que se borre su nombre`);
}

module.exports = { setup, handle, _test: { barrer, fuera, GRACIA_MS, SQL_HAVEN } };
