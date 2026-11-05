// Cuentas sin contraseña conocida y entrar con un codigo por mail.
//
// 1. "Poné una contraseña": las cuentas que crea el puente (entrar con Discord o con el foro,
//    registerThroughHaven en vincular.js) tienen una contraseña al azar que la persona nunca supo, asi
//    que el "Cambiar contraseña" de Haven (pide la actual) no le sirve. Quedan anotadas en
//    puente_sin_clave; con la sesion abierta y un codigo que llega a su email confirmado, ponen una.
//    No sube password_version, no toca las claves E2E ni cierra sesiones: sigue adentro en todos lados.
//      GET  /puente/api/clave/estado   (sesion) -> { sinClave, email }
//      POST /puente/api/clave/codigo   (sesion) -> manda el codigo al email confirmado
//      POST /puente/api/clave/poner    (sesion) { codigo, password }
//    Se borra la marca al poner una contraseña por el puente (aca, o la recuperacion: setPassword en
//    vincular.js). Si Haven sube password_version por su cuenta (codigos de recuperacion), tambien deja
//    de contar (se guarda la version del momento de la marca).
//
// 2. "Entrar con un codigo por mail" en la pagina de inicio (web/login.js):
//      POST /puente/api/entrar/codigo  { usuario }  (sin sesion; usuario o email confirmado)
//    Contesta siempre lo mismo ({ puenteCodigo, ticket, motivo: 'mail' }) exista o no la cuenta, y la
//    pagina pide el codigo con el mismo paso de dospasos.js (web/codigo.js). Sin admins, cuentas con la
//    app de codigos, invitados ni suspendidas: esas entran con usuario y contraseña.

const crypto = require('crypto');
const CODIGO_MS = 10 * 60 * 1000;
const INTENTOS = 5;
const VENTANA_MS = 15 * 60 * 1000;
const ENVIOS_POR_CUENTA = 3;    // codigos de "Poné una contraseña" por cuenta cada 15 minutos
const ENTRAR_POR_IP = 5;        // pedidos de "Entrar con un codigo" por IP cada 15 minutos
const ENTRAR_POR_CUENTA = 3;    // y por cuenta (o por lo que se escribio, si no existe)
let db, log = () => {}, warn = () => {}, email, appName = () => 'CV Chat', dominio = () => '';
const codigos = new Map();      // user id -> { hash, exp, intentos }
const pedidos = new Map();      // clave -> [ms, ...] (limites)

function setup(ctx) {
  ({ db, log, warn, email } = ctx);
  if (ctx.appName) appName = ctx.appName;
  if (ctx.dominio) dominio = ctx.dominio;
  try {
    const habia = !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'puente_sin_clave'").get();
    db.exec(`CREATE TABLE IF NOT EXISTS puente_sin_clave (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      desde INTEGER NOT NULL,
      version INTEGER NOT NULL DEFAULT 1
    )`);
    // Una sola vez (al crear la tabla): las cuentas de antes que se crearon con Discord o con el foro.
    // Vinculadas a los pocos minutos de crearse y sin cambiar nunca la contraseña (password_version <= 1)
    if (!habia) {
      let n = 0;
      const now = Date.now();
      for (const [tabla, col, campo] of [['puente_vinculos', 'haven_user_id', 'linked_at'], ['puente_foro', 'haven_user_id', 'vinculado']]) {
        try {
          n += db.prepare(`INSERT OR IGNORE INTO puente_sin_clave (user_id, desde, version)
            SELECT u.id, ?, IFNULL(u.password_version, 1) FROM ${tabla} v JOIN users u ON u.id = v.${col}
            WHERE IFNULL(u.password_version, 1) <= 1 AND IFNULL(u.is_guest, 0) = 0
              AND v.${campo} IS NOT NULL AND u.created_at IS NOT NULL
              AND abs(julianday(v.${campo}) - julianday(u.created_at)) * 1440 <= 5`).run(now).changes;
        } catch (err) { warn(`sin clave: no pude revisar ${tabla}:`, err.message); }
      }
      log(`sin clave: ${n} cuentas creadas con Discord o el foro quedan para "Poné una contraseña"`);
    }
  } catch (err) { warn('sin clave: no pude preparar la tabla:', err.message); }
  setInterval(() => {
    const now = Date.now();
    for (const [k, c] of codigos) if (c.exp < now) codigos.delete(k);
    for (const [k, l] of pedidos) { const x = l.filter(t => now - t < VENTANA_MS); if (x.length) pedidos.set(k, x); else pedidos.delete(k); }
  }, 10 * 60 * 1000).unref();
}

// La cuenta se creo con una contraseña al azar (registerThroughHaven)
function marcar(userId) {
  try {
    const u = db.prepare('SELECT password_version FROM users WHERE id = ?').get(userId);
    if (!u) return;
    db.prepare('INSERT OR REPLACE INTO puente_sin_clave (user_id, desde, version) VALUES (?, ?, ?)').run(userId, Date.now(), u.password_version || 1);
  } catch (err) { warn('sin clave: marcar:', err.message); }
}
function desmarcar(userId) {
  try { db.prepare('DELETE FROM puente_sin_clave WHERE user_id = ?').run(userId); codigos.delete(userId); } catch (err) { warn('sin clave: desmarcar:', err.message); }
}
function sinClave(userId) {
  try {
    const r = db.prepare('SELECT s.version, u.password_version FROM puente_sin_clave s JOIN users u ON u.id = s.user_id WHERE s.user_id = ?').get(userId);
    return !!r && (r.password_version || 1) <= r.version;
  } catch { return false; }
}

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const tapar = (e) => { const [u, d] = String(e).split('@'); if (!d) return null; return (u.length <= 2 ? u[0] + '*' : u.slice(0, 2) + '*'.repeat(Math.min(6, u.length - 2))) + '@' + d; };
const ipDe = (req) => String(req.headers['x-forwarded-for'] || '').split(',').pop().trim() || (req.socket && req.socket.remoteAddress) || '?';
// Limite: true si todavia hay lugar (y lo anota)
function hayLugar(clave, max) {
  const now = Date.now();
  const l = (pedidos.get(clave) || []).filter(t => now - t < VENTANA_MS);
  if (l.length >= max) { pedidos.set(clave, l); return false; }
  l.push(now); pedidos.set(clave, l);
  return true;
}
const emailConfirmado = (userId) => { try { const e = email.status(userId); return e.confirmado && e.email ? e.email : null; } catch { return null; } };

// El problema con la contraseña, con las reglas de Haven (o null)
function problemaClave(password, username) {
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) return 'La contraseña tiene que tener entre 8 y 128 caracteres.';
  if (username && password.toLowerCase().includes(String(username).toLowerCase())) return 'La contraseña no puede tener tu nombre de usuario adentro.';
  return null;
}

async function mandarCodigo(user, para) {
  const codigo = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  codigos.set(user.id, { hash: sha(user.id + ':' + codigo), exp: Date.now() + CODIGO_MS, intentos: 0 });
  // Solo en la copia de prueba: el codigo va al registro, no por mail
  if (process.env.PUENTE_PRUEBA === '1') { log(`sin clave (prueba): codigo para Haven #${user.id}: ${codigo}`); return true; }
  return email.sendMail(para, `${codigo} es tu código para poner tu contraseña`, 'Tu código para poner una contraseña',
    [`Hola ${user.username}: pediste poner una contraseña en tu cuenta de ${appName()}.`, `Tu código es: ${codigo}`, 'Vence en 10 minutos. Si no fuiste vos, no lo compartas con nadie.'],
    ['Abrir CV Chat', 'https://chat.' + (dominio() || 'circulovicioso.club') + '/app'], 'Te llega este mail porque alguien con tu sesión abierta pidió poner una contraseña.');
}

async function handle(req, res, p, u, h) {
  const { sessionUser, json, readJson } = h;
  if (!['/puente/api/clave/estado', '/puente/api/clave/codigo', '/puente/api/clave/poner'].includes(p)) return false;
  try {
    const user = sessionUser(req);
    if (!user) return json(res, 401, { error: 'sin sesion' });
    if (p === '/puente/api/clave/estado' && req.method === 'GET') {
      const e = emailConfirmado(user.id);
      const sc = sinClave(user.id);
      // Con que se creo (para el texto): el foro si no tiene Discord vinculado
      let via = 'discord';
      if (sc) { try { if (!db.prepare('SELECT 1 FROM puente_vinculos WHERE haven_user_id = ?').get(user.id) && db.prepare('SELECT 1 FROM puente_foro WHERE haven_user_id = ?').get(user.id)) via = 'foro'; } catch { /* sin foro */ } }
      return json(res, 200, { sinClave: sc, email: e ? tapar(e) : null, via });
    }
    if (req.method !== 'POST') return false;
    if (!sinClave(user.id)) return json(res, 409, { error: 'Tu cuenta ya tiene contraseña: cambiala con tu contraseña actual.' });
    if (p === '/puente/api/clave/codigo') {
      if (!email || !email.on || !email.on()) return json(res, 503, { error: 'Ahora no podemos mandar mails. Probá más tarde.' });
      const para = emailConfirmado(user.id);
      if (!para) return json(res, 400, { error: 'Primero agregá y confirmá un email: el código te llega ahí.', sinEmail: true });
      if (!hayLugar('clave:' + user.id, ENVIOS_POR_CUENTA)) return json(res, 429, { error: 'Ya te mandamos varios códigos: revisá tu correo (y el spam) o probá en un rato.' });
      const ok = await mandarCodigo(user, para);
      if (!ok) return json(res, 502, { error: 'No se pudo mandar el mail. Probá de nuevo en un momento.' });
      return json(res, 200, { ok: true, email: tapar(para) });
    }
    // poner
    const body = await readJson(req) || {};
    const full = db.prepare('SELECT id, username FROM users WHERE id = ?').get(user.id);
    if (!full) return json(res, 401, { error: 'sin sesion' });
    // Primero la contraseña (sin gastar un intento del codigo)
    const problema = problemaClave(body.password, full.username);
    if (problema) return json(res, 400, { error: problema });
    const c = codigos.get(user.id);
    if (!c || c.exp < Date.now()) { codigos.delete(user.id); return json(res, 400, { error: 'El código venció: pedí otro.' }); }
    if (++c.intentos > INTENTOS) { codigos.delete(user.id); return json(res, 429, { error: 'Demasiados intentos: pedí otro código.' }); }
    const codigo = String(body.codigo || '').replace(/\D/g, '');
    if (codigo.length !== 6 || !crypto.timingSafeEqual(Buffer.from(sha(user.id + ':' + codigo)), Buffer.from(c.hash))) return json(res, 400, { error: 'Ese código no es. Revisá el último mail que te llegó.' });
    const bcrypt = require('/app/node_modules/bcryptjs');
    const hash = await bcrypt.hash(body.password, 12);
    // Solo el hash: sin subir password_version (las sesiones siguen) y sin tocar las claves E2E
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, user.id);
    codigos.delete(user.id);
    desmarcar(user.id);
    log(`sin clave: "${full.username}" (Haven #${user.id}) puso su contraseña con un codigo por mail`);
    return json(res, 200, { ok: true });
  } catch (err) {
    warn('sin clave:', err.message);
    return json(res, 500, { error: 'Algo falló. Probá de nuevo en un momento.' });
  }
}

// ── Entrar con un codigo por mail ──
const espera = (ms) => new Promise(r => setTimeout(r, ms));
async function entrar(req, res, h) {
  const { json, readJson, sessionFor, dospasos } = h;
  try {
    const body = await readJson(req) || {};
    const dato = String(body.usuario || '').trim().slice(0, 200);
    if (!dato) return json(res, 400, { error: 'Escribí tu usuario o tu mail.' });
    if (!dospasos || !dospasos.on()) return json(res, 503, { error: 'Entrar con un código no está disponible ahora. Entrá con tu usuario y contraseña.' });
    if (!hayLugar('entrar-ip:' + ipDe(req), ENTRAR_POR_IP)) return json(res, 429, { error: 'Pediste varios códigos seguidos. Esperá un rato y probá de nuevo.' });
    let user = null;
    if (!dato.includes('@')) user = db.prepare('SELECT id, username, is_admin, totp_enabled, is_guest FROM users WHERE lower(username) = lower(?)').get(dato) || null;
    else user = db.prepare(`SELECT u.id, u.username, u.is_admin, u.totp_enabled, u.is_guest FROM puente_emails e JOIN users u ON u.id = e.haven_user_id
                            WHERE lower(e.email) = ? AND e.confirmado = 1`).get(dato.toLowerCase()) || null;
    if (!hayLugar('entrar-cuenta:' + (user ? user.id : dato.toLowerCase()), ENTRAR_POR_CUENTA)) return json(res, 429, { error: 'Pediste varios códigos seguidos. Esperá un rato y probá de nuevo.' });
    // La misma respuesta para todos: no se sabe si la cuenta existe ni a que mail va
    const respuesta = (ticket) => ({ puenteCodigo: true, ticket, motivo: 'mail', email: dato.includes('@') ? tapar(dato.toLowerCase()) : null });
    let apta = !!user && !user.is_admin && !user.totp_enabled && !user.is_guest && user.username !== 'discord-historial';
    if (apta) { try { if (db.prepare('SELECT 1 FROM bans WHERE user_id = ?').get(user.id)) apta = false; } catch { /* sin la tabla */ } }
    if (apta && !emailConfirmado(user.id)) apta = false;
    if (!apta) {
      await espera(300 + crypto.randomInt(0, 900)); // como lo que tarda mandar el mail
      return json(res, 200, respuesta(dospasos.senuelo()));
    }
    const u = user;
    const r = await dospasos.pedir(req, u.id, sessionFor(u.id), { fijo: true, alListo: () => log(`entro con codigo por mail: ${u.username} (Haven #${u.id})`) });
    if (r.noSalio) warn(`entrar con codigo: no salio el mail para Haven #${u.id}`);
    return json(res, 200, respuesta(r.ticket));
  } catch (err) {
    warn('entrar con codigo:', err.message);
    return json(res, 500, { error: 'Algo falló. Probá de nuevo en un momento.' });
  }
}

module.exports = { setup, marcar, desmarcar, sinClave, handle, entrar };
