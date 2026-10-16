// Email para recuperar la contraseña (parte del puente).
//
// Haven no tiene email. Con PUENTE_RESEND_KEY en /opt/haven/.env (una clave de
// https://resend.com con permiso solo de envio) el puente agrega:
//
//  - Registro con email obligatorio: el formulario de Haven suma el campo
//    (web/login.js) y el servidor no deja crear la cuenta sin un email valido.
//    Despues llega un mail con un enlace para confirmarlo.
//  - Cartel en /app (web/email.js) para quien todavia no tiene un email
//    confirmado: lo escribe, o usa el de su cuenta de Discord (ya confirmado
//    por Discord, sin mail de confirmacion).
//  - "¿Olvidaste tu contraseña?" (/puente/olvide): un enlace por mail, de un
//    solo uso y que vale 1 hora, para elegir una contraseña nueva. Hace lo mismo
//    que un codigo de recuperacion de Haven (cierra las sesiones y borra las
//    claves de los mensajes directos cifrados). Como la recuperacion con
//    Discord, no vale para administradores ni cuentas con verificacion en dos
//    pasos.
//
// PUENTE_EMAIL_DE es el remitente, por ejemplo "CV Chat <no-responder@tudominio>",
// con un dominio verificado en Resend. Los emails quedan solo en la base de datos
// (tabla puente_emails); los enlaces se guardan como hash.
//
//  GET  /puente/api/email/estado        { email, confirmado, pendiente, discord }   (sesion)
//  POST /puente/api/email/guardar       { email } -> manda el mail de confirmacion   (sesion)
//  POST /puente/api/email/reenviar      vuelve a mandar el de confirmacion          (sesion)
//  POST /puente/api/email/discord       { url } para usar el email de Discord        (sesion)
//  GET  /puente/email/confirmar?t=      enlace del mail de confirmacion
//  POST /puente/api/email/olvide        { email } -> manda el enlace para cambiar la contraseña
//  GET  /puente/api/email/restablecer?t=   { usuario }
//  POST /puente/api/email/restablecer   { t, password }

const crypto = require('crypto');

const VERIFY_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;
const DAILY_CAP = 90; // el plan gratis de Resend manda hasta 100 por dia
const EMAIL_RE = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]{2,}$/;

let db, log, warn, publicUrl, appName, setPassword;
let key = '', from = '';

function setup(ctx) {
  ({ db, log, warn, publicUrl, appName, setPassword } = ctx);
  key = String(process.env.PUENTE_RESEND_KEY || '').trim();
  from = String(process.env.PUENTE_EMAIL_DE || '').trim();
  if (!key) return;
  if (!from) { warn('falta PUENTE_EMAIL_DE (el remitente de los mails): el email queda apagado'); key = ''; return; }
  db.exec(`
    CREATE TABLE IF NOT EXISTS puente_emails (
      haven_user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      email TEXT NOT NULL,
      confirmado INTEGER NOT NULL DEFAULT 0,
      origen TEXT,
      token_hash TEXT,
      token_vence INTEGER,
      actualizado TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_puente_emails_email ON puente_emails(email);
    CREATE TABLE IF NOT EXISTS puente_email_cambios (
      token_hash TEXT PRIMARY KEY,
      haven_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      vence INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS puente_email_envios (
      enviado INTEGER NOT NULL,
      tipo TEXT NOT NULL,
      clave TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_puente_email_envios ON puente_email_envios(enviado);
  `);
  log('email de recuperacion encendido');
}

const on = () => !!key;
const hash = t => crypto.createHash('sha256').update(String(t)).digest('hex');
const norm = e => String(e || '').trim().toLowerCase();
const valid = e => e.length <= 200 && EMAIL_RE.test(e);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Otra cuenta ya tiene ese email confirmado
function takenByOther(email, userId) {
  return !!db.prepare('SELECT 1 FROM puente_emails WHERE email = ? AND confirmado = 1 AND haven_user_id != ?').get(email, userId);
}

function status(userId) {
  const r = db.prepare('SELECT email, confirmado FROM puente_emails WHERE haven_user_id = ?').get(userId);
  return { email: r ? r.email : null, confirmado: !!(r && r.confirmado) };
}

// Limites: cuantos mails de un tipo y clave (usuario, IP, email) en la ultima hora
function recent(tipo, clave, ms = 60 * 60 * 1000) {
  return db.prepare('SELECT COUNT(*) n FROM puente_email_envios WHERE tipo = ? AND clave = ? AND enviado > ?').get(tipo, clave, Date.now() - ms).n;
}
function note(tipo, clave) {
  db.prepare('INSERT INTO puente_email_envios (enviado, tipo, clave) VALUES (?, ?, ?)').run(Date.now(), tipo, clave);
  db.prepare('DELETE FROM puente_email_envios WHERE enviado < ?').run(Date.now() - 2 * 24 * 60 * 60 * 1000);
}

async function sendMail(to, subject, title, paragraphs, button, footer) {
  if (db.prepare('SELECT COUNT(*) n FROM puente_email_envios WHERE enviado > ?').get(Date.now() - 24 * 60 * 60 * 1000).n >= DAILY_CAP) {
    warn('email: se llego al limite de mails del dia; no se manda');
    return false;
  }
  const name = appName();
  const logo = publicUrl ? `${publicUrl}/puente/logo-carga.png` : '';
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f2f3f5">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f3f5;padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:12px;padding:32px 28px;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#2e3035">
${logo ? `<tr><td align="center" style="padding-bottom:16px"><img src="${esc(logo)}" width="88" height="88" alt="" style="display:block;border:0"></td></tr>` : ''}
<tr><td style="font-size:22px;font-weight:700;text-align:center;padding-bottom:16px">${esc(title)}</td></tr>
${paragraphs.map(p => `<tr><td style="font-size:15px;line-height:1.5;padding-bottom:12px">${esc(p)}</td></tr>`).join('')}
<tr><td align="center" style="padding:12px 0 20px"><a href="${esc(button[1])}" style="display:inline-block;background:#5865f2;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 24px;border-radius:8px">${esc(button[0])}</a></td></tr>
<tr><td style="font-size:12px;line-height:1.5;color:#80848e">${esc(footer)}<br><br>Si el botón no funciona, copiá este enlace en el navegador:<br><span style="word-break:break-all">${esc(button[1])}</span></td></tr>
</table>
<div style="font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:12px;color:#80848e;padding-top:12px">${esc(name)}</div>
</td></tr></table></body></html>`;
  const text = `${title}\n\n${paragraphs.join('\n\n')}\n\n${button[0]}: ${button[1]}\n\n${footer}\n\n${name}`;
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, html, text }),
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) { warn('email: Resend respondio', r.status, (await r.text().catch(() => '')).slice(0, 200)); return false; }
    return true;
  } catch (err) { warn('email: no pude mandar el mail:', err.message); return false; }
}

// Guarda el email (sin confirmar) y manda el enlace para confirmarlo
async function saveAndVerify(userId, rawEmail) {
  const email = norm(rawEmail);
  if (!valid(email)) return { error: 'Ese email no parece válido.' };
  if (takenByOther(email, userId)) return { error: 'Ese email ya está en uso en otra cuenta.' };
  const cur = db.prepare('SELECT email, confirmado FROM puente_emails WHERE haven_user_id = ?').get(userId);
  if (cur && cur.confirmado && cur.email === email) return { ok: true, confirmado: true };
  if (recent('confirmar', String(userId)) >= 4) return { error: 'Mandamos varios mails seguidos. Probá de nuevo en un rato.' };
  const token = crypto.randomBytes(24).toString('hex');
  db.prepare(`INSERT INTO puente_emails (haven_user_id, email, confirmado, origen, token_hash, token_vence, actualizado)
              VALUES (?, ?, 0, 'manual', ?, ?, CURRENT_TIMESTAMP)
              ON CONFLICT(haven_user_id) DO UPDATE SET email = excluded.email, confirmado = 0, origen = 'manual',
                token_hash = excluded.token_hash, token_vence = excluded.token_vence, actualizado = CURRENT_TIMESTAMP`)
    .run(userId, email, hash(token), Date.now() + VERIFY_TTL_MS);
  note('confirmar', String(userId));
  const u = db.prepare('SELECT username FROM users WHERE id = ?').get(userId);
  const ok = await sendMail(email, `Confirmá tu email en ${appName()}`, 'Confirmá tu email',
    [`¡Hola${u ? ' ' + u.username : ''}!`, `Tocá el botón para confirmar que este es tu email en ${appName()}. Lo vas a poder usar para recuperar tu contraseña si alguna vez la olvidás.`],
    ['Confirmar mi email', `${publicUrl}/puente/email/confirmar?t=${token}`],
    'Si no fuiste vos, ignorá este mail: sin confirmarlo no pasa nada.');
  if (ok) log(`email: mail de confirmacion para Haven #${userId}`);
  return ok ? { ok: true, confirmado: false } : { error: 'No pudimos mandar el mail. Probá de nuevo en un rato.' };
}

async function resend(userId) {
  const cur = db.prepare('SELECT email, confirmado FROM puente_emails WHERE haven_user_id = ?').get(userId);
  if (!cur) return { error: 'Todavía no agregaste un email.' };
  if (cur.confirmado) return { ok: true, confirmado: true };
  return saveAndVerify(userId, cur.email);
}

function confirm(token) {
  const r = token && db.prepare('SELECT haven_user_id, email, token_vence FROM puente_emails WHERE token_hash = ?').get(hash(token));
  if (!r || r.token_vence < Date.now()) return { error: 'El enlace caducó o ya se usó. Pedí uno nuevo desde CV Chat.' };
  if (takenByOther(r.email, r.haven_user_id)) return { error: 'Ese email ya está confirmado en otra cuenta.' };
  db.prepare('UPDATE puente_emails SET confirmado = 1, token_hash = NULL, token_vence = NULL, actualizado = CURRENT_TIMESTAMP WHERE haven_user_id = ?').run(r.haven_user_id);
  log(`email: confirmado para Haven #${r.haven_user_id}`);
  return { ok: true, email: r.email };
}

// El email que Discord ya confirmo (al vincular, o con el boton del cartel)
function fromDiscord(userId, me) {
  const email = norm(me && me.email);
  if (!me || !me.verified || !valid(email)) return { error: 'sin-email' };
  if (takenByOther(email, userId)) return { error: 'email-ocupado' };
  db.prepare(`INSERT INTO puente_emails (haven_user_id, email, confirmado, origen, actualizado)
              VALUES (?, ?, 1, 'discord', CURRENT_TIMESTAMP)
              ON CONFLICT(haven_user_id) DO UPDATE SET email = excluded.email, confirmado = 1, origen = 'discord',
                token_hash = NULL, token_vence = NULL, actualizado = CURRENT_TIMESTAMP`).run(userId, email);
  log(`email: tomado de Discord para Haven #${userId}`);
  return { ok: true };
}
// Al vincular: solo si todavia no tiene uno confirmado (no pisa el que eligio)
function fromDiscordIfMissing(userId, me) {
  if (!on() || status(userId).confirmado) return;
  try { fromDiscord(userId, me); } catch (err) { warn('email de Discord:', err.message); }
}

// "¿Olvidaste tu contraseña?": siempre la misma respuesta, exista o no la cuenta
async function forgot(rawEmail, ip) {
  const email = norm(rawEmail);
  if (!valid(email)) return { error: 'Ese email no parece válido.' };
  if (recent('olvide-ip', ip) >= 6 || recent('olvide', email) >= 3) return { error: 'Pediste varios enlaces seguidos. Probá de nuevo en un rato.' };
  note('olvide-ip', ip);
  const r = db.prepare(`SELECT u.id, u.username, u.is_admin, u.totp_enabled FROM puente_emails e JOIN users u ON u.id = e.haven_user_id
                        WHERE e.email = ? AND e.confirmado = 1`).get(email);
  if (!r) return { ok: true };
  note('olvide', email);
  if (r.is_admin || r.totp_enabled) {
    await sendMail(email, `Recuperar tu contraseña en ${appName()}`, 'Recuperar tu contraseña',
      [`¡Hola ${r.username}!`, 'Pediste recuperar tu contraseña, pero esta cuenta no se puede recuperar por email porque ' +
        (r.is_admin ? 'es de administrador.' : 'tiene la verificación en dos pasos activada.') + ' Usá una de tus claves de recuperación.'],
      ['Ir a ' + appName(), publicUrl + '/'], 'Si no fuiste vos, ignorá este mail: tu contraseña no cambió.');
    return { ok: true };
  }
  db.prepare('DELETE FROM puente_email_cambios WHERE vence < ?').run(Date.now());
  const token = crypto.randomBytes(24).toString('hex');
  db.prepare('INSERT INTO puente_email_cambios (token_hash, haven_user_id, vence) VALUES (?, ?, ?)').run(hash(token), r.id, Date.now() + RESET_TTL_MS);
  const ok = await sendMail(email, `Recuperar tu contraseña en ${appName()}`, 'Recuperar tu contraseña',
    [`¡Hola ${r.username}!`, 'Tocá el botón para elegir una contraseña nueva. El enlace vale por 1 hora y sirve una sola vez.'],
    ['Elegir una contraseña nueva', `${publicUrl}/puente/olvide?t=${token}`],
    'Si no fuiste vos, ignorá este mail: tu contraseña no cambia hasta que uses el enlace.');
  if (ok) log(`email: enlace para cambiar la contraseña de "${r.username}" (Haven #${r.id})`);
  return { ok: true };
}

function resetInfo(token) {
  const r = token && db.prepare('SELECT c.vence, u.username FROM puente_email_cambios c JOIN users u ON u.id = c.haven_user_id WHERE c.token_hash = ?').get(hash(token));
  if (!r || r.vence < Date.now()) return null;
  return { usuario: r.username };
}

async function reset(token, password) {
  const r = token && db.prepare('SELECT haven_user_id, vence FROM puente_email_cambios WHERE token_hash = ?').get(hash(token));
  if (!r || r.vence < Date.now()) return { status: 404, error: 'El enlace caducó o ya se usó. Pedí uno nuevo.' };
  const user = db.prepare('SELECT id, username, is_admin, totp_enabled, password_version FROM users WHERE id = ?').get(r.haven_user_id);
  if (!user || user.is_admin || user.totp_enabled) return { status: 403, error: 'Esta cuenta no se puede recuperar por email.' };
  if (password.length < 8 || password.length > 128) return { status: 400, error: 'La contraseña tiene que tener entre 8 y 128 caracteres.' };
  if (password.toLowerCase().includes(user.username.toLowerCase())) return { status: 400, error: 'La contraseña no puede contener tu nombre de usuario.' };
  db.prepare('DELETE FROM puente_email_cambios WHERE haven_user_id = ?').run(user.id); // un solo uso
  await setPassword(user, password, 'por email');
  return { ok: true, usuario: user.username };
}

// Registro de Haven (POST /api/auth/register): sin un email valido no se crea la
// cuenta. Se lee el cuerpo antes que Haven (que entonces no lo vuelve a leer) y,
// si la cuenta se crea, se guarda el email y se manda el mail de confirmacion.
function hookRegister(req, res, next, validate) {
  const parts = []; let size = 0, over = false;
  req.on('data', c => { size += c.length; if (size > 128 * 1024) over = true; else parts.push(c); });
  req.on('error', () => {});
  req.on('end', () => {
    let body = null;
    try { body = over ? null : JSON.parse(Buffer.concat(parts).toString('utf8') || '{}'); } catch { body = null; }
    const reply = (status, error) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify({ error })); };
    if (!body || typeof body !== 'object') return reply(400, 'Solicitud inválida.');
    const other = typeof validate === 'function' ? validate(body) : null;
    if (other) return reply(400, other);
    const email = norm(body.email);
    if (!email) return reply(400, 'Poné tu email: sirve para recuperar la contraseña si la olvidás.');
    if (!valid(email)) return reply(400, 'Ese email no parece válido.');
    if (takenByOther(email, 0)) return reply(400, 'Ese email ya está en uso en otra cuenta.');
    delete body.email;
    req.body = body;
    req._body = true; // express.json no lo vuelve a leer
    const origEnd = res.end;
    res.end = function (chunk, ...rest) {
      try {
        if (res.statusCode === 200 && chunk) {
          const data = JSON.parse(Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk));
          const id = data && data.user && data.user.id;
          if (id) setImmediate(() => saveAndVerify(id, email).catch(err => warn('email al registrarse:', err.message)));
        }
      } catch { /* la cuenta igual se creo */ }
      return origEnd.call(this, chunk, ...rest);
    };
    next();
  });
}

module.exports = { setup, on, status, saveAndVerify, resend, confirm, fromDiscord, fromDiscordIfMissing, forgot, resetInfo, reset, hookRegister };
