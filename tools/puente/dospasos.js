// Verificacion en dos pasos para todos: un codigo por email al entrar desde un dispositivo nuevo (la
// cuenta unica: vale para la web, el chat y el foro, que entran todos por aca). El dispositivo queda
// recordado 30 dias (la cookie cv_disp, del dominio). Quien tiene la verificacion con la app de codigos
// (TOTP de Haven) sigue con esa.
//
// Donde se abre una sesion (vincular.js): el inicio de sesion de Haven (/api/auth/login y el paso del
// codigo de la app, /api/auth/totp/validate), entrar con Discord o con el foro (/puente/api/entrar/sesion)
// y la entrada sola desde el foro (foro.js). En un dispositivo nuevo, en vez de la sesion vuelve
// { puenteCodigo, ticket, email } y la pagina (web/codigo.js) pide el codigo:
//   POST /puente/api/auth/codigo            { ticket, codigo }  -> la sesion que se estaba abriendo
//   POST /puente/api/auth/codigo/reenviar   { ticket }
//   POST /puente/api/auth/codigo/email      { ticket, email }   (cuenta sin email: se manda ahi, y queda confirmado)
// Una cuenta nueva (registrarse) deja recordado el dispositivo donde se creo.

const crypto = require('crypto');
const DISP_DIAS = 30;
const DISP_MS = DISP_DIAS * 24 * 60 * 60 * 1000;
const CODIGO_MS = 10 * 60 * 1000;
const INTENTOS = 5;
let db, log, warn, email, dominio = () => '', appName = () => 'CV Chat';
const tickets = new Map(); // ticket -> { userId, final, exp, hash, intentos, para, enviados }

function setup(ctx) {
  ({ db, log, warn, email } = ctx);
  if (ctx.dominio) dominio = ctx.dominio;
  if (ctx.appName) appName = ctx.appName;
  db.exec(`CREATE TABLE IF NOT EXISTS puente_dispositivos (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    disp TEXT NOT NULL,
    creado INTEGER NOT NULL,
    visto INTEGER NOT NULL,
    PRIMARY KEY (user_id, disp)
  )`);
  setInterval(() => {
    const now = Date.now();
    for (const [k, t] of tickets) if (t.exp < now) tickets.delete(k);
    try { db.prepare('DELETE FROM puente_dispositivos WHERE creado < ?').run(now - DISP_MS); } catch { /* */ }
  }, 10 * 60 * 1000).unref();
  log('dos pasos: codigo por email en cada dispositivo nuevo, listo');
}
const on = () => !!(db && email && email.on && email.on());

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
function cookieDe(req) {
  const m = String(req.headers.cookie || '').match(/(?:^|;\s*)cv_disp=([A-Za-z0-9_-]{20,100})/);
  return m ? m[1] : null;
}
function confiable(req, userId) {
  const c = cookieDe(req);
  if (!c) return false;
  const r = db.prepare('SELECT creado FROM puente_dispositivos WHERE user_id = ? AND disp = ?').get(userId, sha(c));
  if (!r || Date.now() - r.creado > DISP_MS) return false;
  db.prepare('UPDATE puente_dispositivos SET visto = ? WHERE user_id = ? AND disp = ?').run(Date.now(), userId, sha(c));
  return true;
}
// Recuerda este dispositivo para esta cuenta (devuelve el Set-Cookie)
function recordar(req, userId) {
  const c = cookieDe(req) || crypto.randomBytes(32).toString('base64url');
  const now = Date.now();
  db.prepare('INSERT INTO puente_dispositivos (user_id, disp, creado, visto) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, disp) DO UPDATE SET creado = excluded.creado, visto = excluded.visto')
    .run(userId, sha(c), now, now);
  const d = dominio();
  return `cv_disp=${c}; ${d ? `Domain=${d}; ` : ''}Path=/; Max-Age=${DISP_DIAS * 24 * 60 * 60}; HttpOnly; Secure; SameSite=Lax`;
}
const tieneTotp = (userId) => !!(db.prepare('SELECT totp_enabled FROM users WHERE id = ?').get(userId) || {}).totp_enabled;
const tapar = (e) => { const [u, d] = String(e).split('@'); return (u.length <= 2 ? u[0] + '*' : u.slice(0, 2) + '*'.repeat(Math.min(6, u.length - 2))) + '@' + d; };

async function mandarCodigo(t) {
  const codigo = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  t.hash = sha(t.userId + ':' + codigo);
  t.intentos = 0;
  t.exp = Date.now() + CODIGO_MS;
  t.enviados = (t.enviados || 0) + 1;
  // Solo en la copia de prueba (prueba-todo.sh): el codigo va al registro, no por mail
  if (process.env.PUENTE_PRUEBA === '1') { log(`dos pasos (prueba): codigo para Haven #${t.userId}: ${codigo}`); return true; }
  const u = db.prepare('SELECT username FROM users WHERE id = ?').get(t.userId) || {};
  const ok = await email.sendMail(t.para, `${codigo} es tu código para entrar a ${appName()}`, 'Tu código para entrar',
    [`Hola ${u.username || ''}: alguien (seguramente vos) está entrando a tu cuenta de Círculo Vicioso desde un dispositivo nuevo.`, `Tu código es: ${codigo}`, 'Vence en 10 minutos. Si no fuiste vos, no lo compartas con nadie y cambiá tu contraseña.'],
    ['Abrir CV Chat', 'https://chat.' + (dominio() || 'circulovicioso.club') + '/'], 'Te llega este mail porque la cuenta pide un código al entrar desde un dispositivo nuevo.');
  return ok;
}

// Abrir una sesion en un dispositivo nuevo: en vez de la sesion, el paso del codigo.
// final: lo que se devuelve cuando el codigo esta bien ({ token, user } o lo que tocara)
async function pedir(req, userId, final) {
  const t = { userId, final, exp: Date.now() + CODIGO_MS, enviados: 0 };
  const ticket = crypto.randomBytes(24).toString('base64url');
  tickets.set(ticket, t);
  const em = email.status(userId);
  if (!em.email) return { puenteCodigo: true, ticket, sinEmail: true };
  t.para = em.email;
  // Sin confirmar: poner el codigo que llego ahi tambien lo confirma
  if (!em.confirmado) t.nuevoEmail = em.email;
  const ok = await mandarCodigo(t);
  return { puenteCodigo: true, ticket, email: tapar(em.email), ...(ok ? {} : { noSalio: true }) };
}

async function handle(req, res, p, h) {
  const { json, readJson } = h;
  if (!['/puente/api/auth/codigo', '/puente/api/auth/codigo/reenviar', '/puente/api/auth/codigo/email'].includes(p) || req.method !== 'POST') return false;
  const body = await readJson(req) || {};
  const t = tickets.get(String(body.ticket || ''));
  if (!t || t.exp < Date.now()) return json(res, 404, { error: 'Se venció el paso: volvé a iniciar sesión.' });
  if (p === '/puente/api/auth/codigo/reenviar') {
    if (!t.para) return json(res, 400, { error: 'Poné tu email primero.' });
    if (t.enviados >= 4) return json(res, 429, { error: 'Ya te mandamos varios códigos: revisá tu correo (y la carpeta de spam), o volvé a iniciar sesión en un rato.' });
    const ok = await mandarCodigo(t);
    return json(res, ok ? 200 : 502, ok ? { ok: true } : { error: 'No se pudo mandar el mail. Probá de nuevo en un momento.' });
  }
  if (p === '/puente/api/auth/codigo/email') {
    // Cuentas sin email: se manda a ese (y queda confirmado al poner el codigo)
    const e = String(body.email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) || e.length > 200) return json(res, 400, { error: 'Ese email no parece válido.' });
    if (email.takenByOther && email.takenByOther(e, t.userId)) return json(res, 409, { error: 'Ese email ya es de otra cuenta.' });
    if (t.enviados >= 4) return json(res, 429, { error: 'Demasiados intentos: volvé a iniciar sesión en un rato.' });
    t.para = e; t.nuevoEmail = e;
    const ok = await mandarCodigo(t);
    return json(res, ok ? 200 : 502, ok ? { ok: true, email: tapar(e) } : { error: 'No se pudo mandar el mail. Revisá el email y probá de nuevo.' });
  }
  // El codigo
  const codigo = String(body.codigo || '').replace(/\D/g, '');
  if (!t.hash) return json(res, 400, { error: 'Poné tu email primero.' });
  if (++t.intentos > INTENTOS) { tickets.delete(String(body.ticket)); return json(res, 429, { error: 'Demasiados intentos: volvé a iniciar sesión.' }); }
  if (codigo.length !== 6 || !crypto.timingSafeEqual(Buffer.from(sha(t.userId + ':' + codigo)), Buffer.from(t.hash))) return json(res, 400, { error: 'Ese código no es. Revisá el último mail que te llegó.' });
  tickets.delete(String(body.ticket));
  if (t.nuevoEmail && email.confirmarDirecto) email.confirmarDirecto(t.userId, t.nuevoEmail);
  res.setHeader('Set-Cookie', [].concat(res.getHeader('Set-Cookie') || [], recordar(req, t.userId)));
  log(`dos pasos: dispositivo nuevo verificado para Haven #${t.userId}`);
  return json(res, 200, t.final);
}

// Las respuestas de Haven que abren sesion (/api/auth/login, /api/auth/totp/validate, /api/auth/register):
// se mira el JSON antes de mandarlo. cambiar(body, status) -> { body, cookie } o null (sigue igual)
function envolver(req, res, cambiar) {
  const chunks = [];
  const orig = { writeHead: res.writeHead, write: res.write, end: res.end, setHeader: res.setHeader };
  let estado = null, cabeceras = null;
  res.writeHead = function (s, a, b) { estado = s; cabeceras = typeof a === 'object' ? a : b; return this; };
  res.setHeader = function (n, v) { if (String(n).toLowerCase() === 'content-length') return this; return orig.setHeader.call(this, n, v); };
  res.write = function (c, enc, cb) { if (c) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c, typeof enc === 'string' ? enc : 'utf8')); if (typeof enc === 'function') enc(); else if (typeof cb === 'function') cb(); return true; };
  res.end = function (c, enc, cb) {
    if (c && typeof c !== 'function') chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c, typeof enc === 'string' ? enc : 'utf8'));
    const done = typeof c === 'function' ? c : typeof enc === 'function' ? enc : cb;
    const restaurar = () => { res.writeHead = orig.writeHead; res.write = orig.write; res.end = orig.end; res.setHeader = orig.setHeader; };
    let cuerpo = Buffer.concat(chunks);
    const status = estado || res.statusCode;
    const seguir = (buf) => {
      restaurar();
      if (cabeceras) for (const [k, v] of Object.entries(cabeceras)) if (String(k).toLowerCase() !== 'content-length') res.setHeader(k, v);
      res.setHeader('Content-Length', buf.length);
      res.writeHead(status);
      res.end(buf, done);
    };
    let d = null;
    try { d = JSON.parse(cuerpo.toString('utf8')); } catch { return seguir(cuerpo); }
    Promise.resolve().then(() => cambiar(d, status)).then((r) => {
      if (r && r.cookie) res.setHeader('Set-Cookie', [].concat(res.getHeader('Set-Cookie') || [], r.cookie));
      seguir(r && r.body ? Buffer.from(JSON.stringify(r.body)) : cuerpo);
    }).catch((err) => { warn('dos pasos:', err.message); seguir(cuerpo); });
    return this;
  };
}
// Inicio de sesion de Haven: con sesion, y dispositivo nuevo, se pide el codigo
function alEntrar(req, res) {
  envolver(req, res, async (d, status) => {
    if (status >= 300 || !d || !d.token || !d.user || !d.user.id) return null;
    if (tieneTotp(d.user.id)) return { cookie: recordar(req, d.user.id) }; // ya paso el codigo de la app
    if (confiable(req, d.user.id)) return null;
    return { body: await pedir(req, d.user.id, d) };
  });
}
// El paso del codigo de la app de Haven: ese dispositivo queda recordado
function alTotp(req, res) {
  envolver(req, res, (d, status) => (status < 300 && d && d.token && d.user && d.user.id ? { cookie: recordar(req, d.user.id) } : null));
}
// Cuenta nueva: el dispositivo donde se creo queda recordado
function alRegistrar(req, res) {
  envolver(req, res, (d, status) => (status < 300 && d && d.token && d.user && d.user.id ? { cookie: recordar(req, d.user.id) } : null));
}

module.exports = { setup, on, handle, confiable, recordar, pedir, alEntrar, alTotp, alRegistrar, tieneTotp };
