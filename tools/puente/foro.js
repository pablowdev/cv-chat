// Cuentas del foro (vBulletin) en CV Chat: entrar, crear la cuenta y vincularla,
// igual que con Discord (vincular.js).
//
//  POST /puente/api/foro/iniciar      { para: 'entrar' | 'vincular' } -> { url } del foro
//  GET  /puente/foro/vuelta           vuelta del foro con quien es, firmado
//  GET  /puente/api/foro/nuevo        datos para "Crear tu cuenta" (codigo de un solo uso)
//  POST /puente/api/foro/crear        crea la cuenta de CV Chat con la del foro
//  GET  /puente/api/foro/estado       { disponible, vinculado, foro } (requiere sesion)
//  POST /puente/api/foro/desvincular  (requiere sesion)
//  POST /puente/api/foro/unir         une la cuenta del foro a una de CV Chat que ya existe (usuario y contraseña)
//  GET  /puente/foro/sso              cuenta unica (cuenta.js): entra al foro con la cuenta de CV Chat
//  GET  /puente/foro/sso-vuelta       el foro avisa con que cuenta del foro quedo (la une)
//  GET  /puente/foro/auto             quien entro solo al foro: entra tambien a CV Chat, sin preguntar
//
// El foro no se conecta con CV Chat (estan en redes separadas): todo pasa por el
// navegador. CV Chat manda a <FORO_URL>/cvchat.php (deploy/foro/cvchat.php) con un
// "estado" de un solo uso, firmado; el foro pide iniciar sesion si hace falta,
// pregunta si se quiere seguir y vuelve con { estado, id, usuario, email, foto },
// firmado con FORO_PUENTE_SECRETO (la misma clave en los dos lados). La firma
// solo la puede hacer el foro, y el estado solo sirve una vez y por 10 minutos.
//
// Al vincular, el foro muestra con que cuenta de CV Chat se va a vincular (va
// firmado por CV Chat), asi nadie puede hacer que otro vincule su foro a una
// cuenta ajena. Una cuenta del foro va con una sola de CV Chat, y viceversa.
//
// Entrar con el foro, como con Discord: no para administradores ni cuentas con
// verificacion en dos pasos, ni para quien esta baneado en el foro o en CV Chat.
//
// Cuenta unica (cuenta.js): con la sesion de CV Chat, el foro entra solo a la
// cuenta del foro unida. Si todavia no hay una, el foro busca la del mismo email
// (confirmado en los dos lados) y las une; si no, pregunta "¿ya tenes cuenta en
// el foro?" (entrar con ella las une) o crea una nueva con el mismo usuario.
// Esos pedidos van firmados y vencen a los 2 minutos; el foro los usa una vez.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const STATE_TTL_MS = 10 * 60 * 1000, SIGNUP_TTL_MS = 15 * 60 * 1000, HANDOFF_TTL_MS = 2 * 60 * 1000;
const BANNED_GROUP = 8;             // "Banned Users" de vBulletin
const UNCONFIRMED_GROUPS = [3, 4];  // esperando confirmar el email / moderacion
const AVATAR_DIR = path.join(path.dirname(process.env.PUENTE_ADJUNTOS_DIR || '/data/uploads/discord'), 'foro');

const states = new Map();   // estado -> { para, userId, exp }
const signups = new Map();  // codigo -> { f, exp }

let db, log, warn, h, cuenta, foroUrl = '', secret = '';

function setup(ctx) {
  ({ db, log, warn, helpers: h } = ctx);
  cuenta = require('./cuenta.js');
  foroUrl = String(process.env.FORO_URL || '').replace(/\/+$/, '');
  secret = String(process.env.FORO_PUENTE_SECRETO || '');
  db.exec(`
    CREATE TABLE IF NOT EXISTS puente_foro (
      haven_user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      foro_user_id INTEGER NOT NULL UNIQUE,
      foro_username TEXT NOT NULL,
      foro_avatar TEXT,
      vinculado TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);
  if (on()) log(`cuentas del foro: listo (${foroUrl})`);
  else if (foroUrl || secret) warn('cuentas del foro: falta FORO_URL o FORO_PUENTE_SECRETO');
}
const on = () => !!(foroUrl && secret.length >= 32 && h.canLogin());

const sign = (text) => crypto.createHmac('sha256', secret).update(text).digest('hex');
function signedOk(text, sig) {
  const a = Buffer.from(sign(text)), b = Buffer.from(String(sig || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
// Agrega una cookie a las que ya tenga la respuesta (la de la cuenta unica, por ejemplo)
function addCookie(res, value) {
  const prev = res.getHeader('Set-Cookie');
  res.setHeader('Set-Cookie', [...(prev ? [].concat(prev) : []), value]);
}
const b64 = obj => Buffer.from(JSON.stringify(obj)).toString('base64url');
// Salir del foro (cuenta.js): cvchat.php cierra la sesion del foro y vuelve a "volver"
function salirUrl(volver) {
  if (!on()) return null;
  const t = String(Math.floor(Date.now() / 1000));
  return `${foroUrl}/cvchat.php?${new URLSearchParams({ salir: '1', volver, t, firma: sign(`salir|${volver}|${t}`) })}`;
}
function cookie(req, name) {
  const m = String(req.headers.cookie || '').match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)'));
  return m ? m[1] : null;
}
function clean(maps) {
  const now = Date.now();
  for (const m of maps) for (const [k, v] of m) if (v.exp < now) m.delete(k);
}

// Lo que mando el foro, ya comprobado: { estado, para, id, usuario, nombre, email, grupos, foto }
function readReturn(u) {
  const d = u.searchParams.get('d') || '', s = u.searchParams.get('s') || '';
  if (!d || !signedOk(d, s)) return null;
  let f;
  try { f = JSON.parse(Buffer.from(d, 'base64url').toString('utf8')); } catch { return null; }
  if (!f || typeof f !== 'object' || !Number.isInteger(f.id) || f.id <= 0 || typeof f.usuario !== 'string') return null;
  if (!Number.isFinite(f.t) || Math.abs(Date.now() / 1000 - f.t) > 600) return null;
  f.grupos = Array.isArray(f.grupos) ? f.grupos.map(Number).filter(Number.isInteger) : [];
  return f;
}
const bannedInForo = f => f.grupos.includes(BANNED_GROUP);
const emailConfirmed = f => !f.grupos.some(g => UNCONFIRMED_GROUPS.includes(g));

// La foto del foro como avatar de CV Chat (solo la direccion del foro, solo imagenes)
async function saveAvatar(f) {
  if (!f.foto || typeof f.foto !== 'string' || !f.foto.startsWith(foroUrl + '/')) return null;
  try {
    const res = await fetch(f.foto, { signal: AbortSignal.timeout(20000), redirect: 'error' });
    const type = String(res.headers.get('content-type') || '').split(';')[0].trim();
    const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' }[type];
    if (!res.ok || !ext) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length || buf.length > 5 * 1024 * 1024) return null;
    fs.mkdirSync(AVATAR_DIR, { recursive: true });
    const file = `avatar-${f.id}-${crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16)}.${ext}`;
    const dest = path.join(AVATAR_DIR, file);
    fs.writeFileSync(dest + '.part', buf);
    fs.renameSync(dest + '.part', dest);
    return `/uploads/foro/${file}`;
  } catch (err) { warn('foto del foro:', err.message); return null; }
}
async function avatarIfMissing(havenUserId, f) {
  const u = db.prepare('SELECT avatar FROM users WHERE id = ?').get(havenUserId);
  if (!u || u.avatar) return;
  const av = await saveAvatar(f);
  if (av) db.prepare('UPDATE users SET avatar = ? WHERE id = ? AND avatar IS NULL').run(av, havenUserId);
}

function saveLink(havenUserId, f) {
  db.prepare(`INSERT INTO puente_foro (haven_user_id, foro_user_id, foro_username, foro_avatar) VALUES (?, ?, ?, ?)
              ON CONFLICT(haven_user_id) DO UPDATE SET foro_user_id = excluded.foro_user_id, foro_username = excluded.foro_username,
                foro_avatar = excluded.foro_avatar, vinculado = CURRENT_TIMESTAMP`)
    .run(havenUserId, f.id, f.usuario, typeof f.foto === 'string' ? f.foto : null);
}

// El usuario del foro, adaptado a las reglas de CV Chat y libre
function proposeUsername(f) {
  let base = String(f.usuario).replace(/[^a-zA-Z0-9_]+/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '').slice(0, 20);
  if (base.length < 3) base = (base + '_cv').replace(/^_+/, '').padEnd(3, '0').slice(0, 20);
  if (!h.usernameTaken(base)) return base;
  for (let i = 2; i < 1000; i++) { const c = base.slice(0, 20 - String(i).length) + i; if (!h.usernameTaken(c)) return c; }
  return base.slice(0, 14) + crypto.randomBytes(3).toString('hex');
}

// Quien volvio del foro para entrar: { listo } (entra), { nuevo } (crear la cuenta) o { error }
// Ir al foro a entrar o a vincular (con la cuenta de CV Chat que vincula, y a donde volver)
function start(res, para, user, volver) {
  clean([states]);
  const estado = crypto.randomBytes(24).toString('hex');
  states.set(estado, { para, userId: user ? user.id : null, volver: volver || null, exp: Date.now() + STATE_TTL_MS });
  // Al vincular, el foro muestra con que cuenta de CV Chat (firmado: no se puede cambiar)
  const q = new URLSearchParams({ estado, para });
  if (user) q.set('cuenta', user.display_name || user.username);
  q.set('firma', sign(`${estado}|${para}|${q.get('cuenta') || ''}`));
  addCookie(res, `puente_foro=${estado}; Path=/puente/foro; Max-Age=${STATE_TTL_MS / 1000}; HttpOnly; Secure; SameSite=Lax`);
  return `${foroUrl}/cvchat.php?${q}`;
}
// Para "Mi cuenta" en la web (cuenta.js)
function info(havenUserId) {
  const l = db.prepare('SELECT foro_user_id, foro_username, foro_avatar FROM puente_foro WHERE haven_user_id = ?').get(havenUserId);
  return l ? { id: l.foro_user_id, usuario: l.foro_username, avatar: l.foro_avatar, perfil: `${foroUrl}/member/${l.foro_user_id}` } : null;
}
function unlink(havenUserId) {
  const n = db.prepare('DELETE FROM puente_foro WHERE haven_user_id = ?').run(havenUserId).changes;
  if (n) log(`desvinculado del foro: Haven #${havenUserId}`);
  return n;
}

function login(f) {
  clean([signups]);
  if (bannedInForo(f)) return { error: 'ban' };
  const code = crypto.randomBytes(24).toString('hex');
  const l = db.prepare('SELECT haven_user_id FROM puente_foro WHERE foro_user_id = ?').get(f.id);
  if (!l) { signups.set(code, { f, exp: Date.now() + SIGNUP_TTL_MS }); return { nuevo: code }; }
  const user = db.prepare('SELECT id, username, is_admin, totp_enabled FROM users WHERE id = ?').get(l.haven_user_id);
  if (!user) return { error: 'foro' };
  if (user.is_admin) return { error: 'admin' };
  if (user.totp_enabled) return { error: '2fa' };
  if (db.prepare('SELECT 1 FROM bans WHERE user_id = ?').get(user.id)) return { error: 'ban' };
  saveLink(user.id, f); // nombre y foto del foro al dia
  h.handoff(code, user.id);
  log(`entro con el foro: ${user.username} (Haven #${user.id}) <- foro #${f.id}`);
  return { listo: code };
}

async function handle(req, res, p, u) {
  const { json, send, readJson, sessionUser } = h;

  if (p === '/puente/api/foro/iniciar' && req.method === 'POST') {
    if (!on()) return json(res, 503, { error: 'Entrar con el foro todavía no está configurado en el servidor.' });
    const body = await readJson(req) || {};
    const para = body.para === 'vincular' ? 'vincular' : 'entrar';
    const user = para === 'vincular' ? sessionUser(req) : null;
    if (para === 'vincular' && !user) return json(res, 401, { error: 'sin sesion' });
    return json(res, 200, { url: start(res, para, user, null) });
  }

  if (p === '/puente/foro/vuelta' && req.method === 'GET') {
    const estado = u.searchParams.get('estado') || '';
    const entry = states.get(estado);
    const go = (to, params) => {
      addCookie(res, 'puente_foro=; Path=/puente/foro; Max-Age=0; HttpOnly; Secure; SameSite=Lax');
      return send(res, 302, 'text/plain', '', { Location: params ? `${to}?${new URLSearchParams(params)}` : to });
    };
    // Entrada automatica (cuenta unica): siempre vuelve a la pagina de donde vino, sin carteles
    if (entry && entry.auto) {
      states.delete(estado);
      const f = readReturn(u);
      if (f && f.estado === estado && entry.exp >= Date.now() && f.para === 'entrar') {
        const r = login(f);
        if (r.listo) cuenta.open(req, res, h.takeHandoff(r.listo));
      }
      return go(entry.volver);
    }
    // Desde "Mi cuenta" de la web: vuelve ahi
    const back = (params) => (entry && entry.volver ? go(((to, params) => { const v = new URL(to); for (const [k, x] of Object.entries(params)) v.searchParams.set(k, x); return v.href; })(entry.volver, { vinculo: 'foro', ...params }))
      : go(entry && entry.para === 'vincular' ? '/puente/vincular' : '/puente/entrar', { via: 'foro', ...params }));
    if (u.searchParams.get('error') === 'cancelado') { states.delete(estado); return back({ error: 'cancelado' }); }
    const f = readReturn(u);
    if (!f || f.estado !== estado) return back({ error: 'foro' });
    states.delete(estado); // un solo uso
    if (!entry || entry.exp < Date.now() || entry.para !== f.para) return back({ error: 'caducado' });
    // Empezado en otro navegador: no sigue (con la cookie del que lo empezo)
    const c = cookie(req, 'puente_foro');
    if (c && c !== estado) return back({ error: 'caducado' });

    if (entry.para === 'entrar') return back(login(f));

    const other = db.prepare('SELECT haven_user_id FROM puente_foro WHERE foro_user_id = ?').get(f.id);
    if (other && other.haven_user_id !== entry.userId) return back({ error: 'ocupada' });
    if (bannedInForo(f)) return back({ error: 'ban' });
    saveLink(entry.userId, f);
    await avatarIfMissing(entry.userId, f);
    if (emailConfirmed(f)) h.emailIfMissing(entry.userId, f.email);
    log(`vinculado: Haven #${entry.userId} <-> foro ${f.usuario} (#${f.id})`);
    return back({ ok: '1' });
  }

  if (p === '/puente/api/foro/nuevo' && req.method === 'GET') {
    const sg = signups.get(u.searchParams.get('codigo') || '');
    if (!sg || sg.exp < Date.now()) return json(res, 404, { error: 'El paso caducó. Volvé a tocar "Entrar con el foro".' });
    const f = sg.f;
    return json(res, 200, { nombre: f.nombre || f.usuario, cuenta: f.usuario, avatar: f.foto || null, usuario: proposeUsername(f), app: h.appName() });
  }

  if (p === '/puente/api/foro/crear' && req.method === 'POST') {
    const body = await readJson(req) || {};
    const code = typeof body.codigo === 'string' ? body.codigo : '';
    const sg = signups.get(code);
    if (!sg || sg.exp < Date.now()) return json(res, 404, { error: 'El paso caducó. Volvé a tocar "Entrar con el foro".' });
    if (!body.acepto) return json(res, 400, { error: 'Tenés que aceptar las condiciones y confirmar que tenés 18 años o más.' });
    const username = String(body.usuario || '').trim();
    const problem = h.usernameProblem(username) || require('./identidad.js').problem(0, username, null);
    if (problem) return json(res, 400, { error: problem });
    const f = sg.f;
    if (db.prepare('SELECT 1 FROM puente_foro WHERE foro_user_id = ?').get(f.id)) { signups.delete(code); return json(res, 409, { error: 'Esa cuenta del foro ya tiene una cuenta. Volvé a tocar "Entrar con el foro".' }); }
    const r = await h.register(req, username);
    if (!r.ok) return json(res, 400, { error: r.error });
    signups.delete(code);
    saveLink(r.user.id, f);
    await avatarIfMissing(r.user.id, f);
    if (emailConfirmed(f)) h.emailIfMissing(r.user.id, f.email);
    log(`cuenta nueva con el foro: ${username} (Haven #${r.user.id}) <-> foro ${f.usuario} (#${f.id})`);
    return json(res, 200, h.sessionFor(r.user.id));
  }

  // Unir la cuenta del foro (que volvio sin cuenta de CV Chat) a una que ya existe
  if (p === '/puente/api/foro/unir' && req.method === 'POST') {
    const body = await readJson(req) || {};
    const code = typeof body.codigo === 'string' ? body.codigo : '';
    const sg = signups.get(code);
    if (!sg || sg.exp < Date.now()) return json(res, 404, { error: 'El paso caducó. Volvé a tocar "Entrar con el foro".' });
    const r = await h.checkPassword(req, String(body.usuario || ''), String(body.password || ''), String(body.codigo2fa || ''));
    if (!r.ok) return json(res, r.status || 400, { error: r.error, pideCodigo: !!r.pideCodigo });
    const f = sg.f;
    const mine = db.prepare('SELECT foro_user_id FROM puente_foro WHERE haven_user_id = ?').get(r.userId);
    if (mine && mine.foro_user_id !== f.id) return json(res, 409, { error: 'Esa cuenta de CV Chat ya está unida a otra cuenta del foro.' });
    if (db.prepare('SELECT 1 FROM puente_foro WHERE foro_user_id = ? AND haven_user_id != ?').get(f.id, r.userId)) { signups.delete(code); return json(res, 409, { error: 'Esa cuenta del foro ya está unida a otra cuenta.' }); }
    signups.delete(code);
    saveLink(r.userId, f);
    await avatarIfMissing(r.userId, f);
    if (emailConfirmed(f)) h.emailIfMissing(r.userId, f.email);
    log(`unidas: Haven #${r.userId} <-> foro ${f.usuario} (#${f.id})`);
    return json(res, 200, { token: r.token, user: r.user });
  }

  // ── Cuenta unica ──
  // Entrar al foro con la sesion de CV Chat (la barra del foro manda aca a quien no entro al foro)
  if (p === '/puente/foro/sso' && req.method === 'GET') {
    const volver = cuenta.safeReturn(u.searchParams.get('volver'), `${foroUrl}/`);
    const user = on() ? cuenta.userFromCookie(req) : null;
    if (!user) return send(res, 302, 'text/plain', '', { Location: volver });
    const l = db.prepare('SELECT foro_user_id FROM puente_foro WHERE haven_user_id = ?').get(user.id);
    const d = b64({
      accion: 'sso', haven: user.id, foro: l ? l.foro_user_id : null, usuario: user.username, nombre: user.display_name || user.username,
      email: h.confirmedEmail(user.id), volver, t: Math.floor(Date.now() / 1000), n: crypto.randomBytes(12).toString('hex'),
    });
    return send(res, 302, 'text/plain', '', { Location: `${foroUrl}/cvchat.php?${new URLSearchParams({ sso: d, s: sign(d) })}` });
  }
  // El foro unio (o creo) la cuenta del foro: se guarda, si es la misma persona que tiene la sesion aca
  if (p === '/puente/foro/sso-vuelta' && req.method === 'GET') {
    const f = readReturn(u);
    const volver = cuenta.safeReturn(f && f.volver, `${foroUrl}/`);
    const user = on() ? cuenta.userFromCookie(req) : null;
    if (!f || f.para !== 'sso' || !user || user.id !== f.haven) return send(res, 302, 'text/plain', '', { Location: volver });
    const other = db.prepare('SELECT haven_user_id FROM puente_foro WHERE foro_user_id = ?').get(f.id);
    const mine = db.prepare('SELECT foro_user_id FROM puente_foro WHERE haven_user_id = ?').get(user.id);
    if ((!other || other.haven_user_id === user.id) && (!mine || mine.foro_user_id === f.id) && !bannedInForo(f)) {
      saveLink(user.id, f);
      await avatarIfMissing(user.id, f);
      log(`unidas (${f.como || 'foro'}): Haven #${user.id} <-> foro ${f.usuario} (#${f.id})`);
    }
    return send(res, 302, 'text/plain', '', { Location: volver });
  }
  // Quien tiene sesion en el foro pero no en CV Chat: entra tambien a CV Chat, sin preguntar
  // (si la cuenta del foro no esta unida, vuelve igual, sin nada)
  if (p === '/puente/foro/auto' && req.method === 'GET') {
    const volver = cuenta.safeReturn(u.searchParams.get('volver'), `${foroUrl}/`);
    if (!on()) return send(res, 302, 'text/plain', '', { Location: volver });
    clean([states]);
    const estado = crypto.randomBytes(24).toString('hex');
    states.set(estado, { para: 'entrar', auto: true, volver, exp: Date.now() + 2 * 60 * 1000 });
    const q = new URLSearchParams({ estado, para: 'entrar', cuenta: '', auto: '1', firma: sign(`${estado}|entrar||auto`) });
    return send(res, 302, 'text/plain', '', { Location: `${foroUrl}/cvchat.php?${q}` });
  }

  if (p === '/puente/api/foro/estado' && req.method === 'GET') {
    const user = sessionUser(req);
    if (!user) return json(res, 401, { error: 'sin sesion' });
    const l = db.prepare('SELECT foro_user_id, foro_username, foro_avatar FROM puente_foro WHERE haven_user_id = ?').get(user.id);
    return json(res, 200, { disponible: on(), vinculado: !!l, foro: l ? { id: l.foro_user_id, usuario: l.foro_username, avatar: l.foro_avatar, perfil: `${foroUrl}/member/${l.foro_user_id}` } : null });
  }

  if (p === '/puente/api/foro/desvincular' && req.method === 'POST') {
    const user = sessionUser(req);
    if (!user) return json(res, 401, { error: 'sin sesion' });
    unlink(user.id);
    return json(res, 200, { ok: true });
  }

  return false;
}

module.exports = { setup, handle, salirUrl, start, info, unlink, on: () => on(), _test: { readReturn, sign } };
