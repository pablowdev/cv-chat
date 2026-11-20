// CV Club: la suscripcion del club, que se paga con monedas (monedas.js). 200 monedas cada 30 dias. Da lo que en
// Discord es de Nitro y aca era gratis hasta el 20/11/2026: el estilo del nombre (color, degradé y fuente), el tema y el
// banner del perfil (perfil.js), la forma del avatar (que no sea el circulo) y la insignia "CV Club" en el perfil.
// Asi lo tiene quien viene seguido: una persona activa junta 200 en una o dos semanas; la bienvenida sola no alcanza.
//
//  - Se paga desde la pastilla de las monedas. Dura 30 dias (si ya lo tenia, se suma al final).
//  - Se renueva solo si alcanza (se puede apagar); 3 dias antes llega un aviso a la campanita.
//  - Si se vence: lo elegido queda guardado pero no se ve (la forma del avatar vuelve al circulo hasta que renueve).
//  - Quienes ya usaban algo de esto cuando se lanzo tienen el primer mes gratis (una sola vez).
//  - Los invitados no.
//
//  GET  /puente/api/cvclub          (sesion) { precio, activo, hasta, auto, gratis, saldo }
//  POST /puente/api/cvclub/pagar    (sesion) se cobra y suma 30 dias
//  POST /puente/api/cvclub/auto     (sesion) { auto: true|false } renovar solo
//  activo(uid) -> true/false (lo usa perfil.js)

const PRECIO = 200, DIAS = 30, DIA = 864e5;
let db = null, io = null, log = () => {}, warn = () => {};
const M = () => require('./monedas.js');

function setup(ctx) {
  ({ db, io, log, warn } = ctx);
  db.exec(`CREATE TABLE IF NOT EXISTS puente_cvclub (
    user_id INTEGER PRIMARY KEY, hasta INTEGER NOT NULL, auto INTEGER NOT NULL DEFAULT 1, desde INTEGER NOT NULL,
    gratis INTEGER NOT NULL DEFAULT 0, forma TEXT, avisado INTEGER, actualizado INTEGER NOT NULL)`);
  regalarPrimerMes();
  // La forma del avatar: Haven la cambia por el socket (set-avatar-shape); sin CV Club solo se puede el circulo
  if (io) io.on('connection', (socket) => {
    socket.use((paquete, next) => {
      try {
        const [ev, d] = paquete;
        if (ev === 'set-avatar-shape' && d && d.shape && d.shape !== 'circle' && socket.user && !activo(socket.user.id)) {
          socket.emit('avatar-shape-updated', { shape: 'circle' });
          socket.emit('puente-cvclub', { falta: 'forma' });
          return;
        }
      } catch { /* sigue */ }
      next();
    });
  });
  setInterval(() => { try { revisar(); } catch (err) { warn('cvclub:', err.message); } }, 10 * 60e3).unref?.();
  setTimeout(() => { try { revisar(); } catch (err) { warn('cvclub:', err.message); } }, 90e3).unref?.();
}

function activo(uid) {
  try { const r = db.prepare('SELECT hasta FROM puente_cvclub WHERE user_id = ?').get(Number(uid)); return !!r && r.hasta > Date.now(); } catch { return false; }
}
function fila(uid) { return db.prepare('SELECT * FROM puente_cvclub WHERE user_id = ?').get(Number(uid)) || null; }

// Lo que se ve de alguien: al entrar (o renovar) vuelve su estilo y su forma; al vencerse, se esconden
function prender(uid) {
  const f = fila(uid);
  if (f && f.forma && f.forma !== 'circle') {
    try { db.prepare('UPDATE users SET avatar_shape = ? WHERE id = ?').run(f.forma, Number(uid)); } catch { /* sin columna */ }
  }
  try { const p = require('./perfil.js'); if (io && p.estiloDe) io.emit('puente-perfil', { id: Number(uid), ...p.estiloDe(uid) }); } catch { /* sin perfil */ }
}
function apagar(uid) {
  try {
    const u = db.prepare('SELECT avatar_shape s FROM users WHERE id = ?').get(Number(uid));
    if (u && u.s && u.s !== 'circle') {
      db.prepare('UPDATE puente_cvclub SET forma = ? WHERE user_id = ?').run(u.s, Number(uid));
      db.prepare("UPDATE users SET avatar_shape = 'circle' WHERE id = ?").run(Number(uid));
    }
  } catch { /* sin columna */ }
  if (io) io.emit('puente-perfil', { id: Number(uid) });
}

function avisar(uid, titulo, texto) {
  try { require('./campana.js').registrar(Number(uid), { origen: 'chat', titulo, texto, url: '/app', clave: 'cvclub-' + uid + '-' + Date.now() }); } catch (err) { warn('cvclub: campanita:', err.message); }
  try { require('./avisos.js').avisarUsuario(Number(uid), { title: titulo, body: texto, url: '/app', tag: 'puente-cvclub' }); } catch { /* sin push */ }
}

// Cobrar 30 dias (desde hoy o desde que se vence, si todavia lo tiene)
function pagar(uid, renovacion = false) {
  const u = db.prepare('SELECT IFNULL(is_guest, 0) g FROM users WHERE id = ?').get(Number(uid));
  if (!u || u.g) return { error: 'CV Club es para cuentas del club.' };
  const ahora = Date.now(), f = fila(uid), desde = f && f.hasta > ahora ? f.hasta : ahora, hasta = desde + DIAS * DIA;
  const r = M().cobrar(Number(uid), PRECIO, { tipo: 'cvclub', origen: 'chat', clave: `cvclub:${uid}:${new Date(desde).toISOString().slice(0, 10)}`, detalle: renovacion ? 'CV Club (se renovó solo)' : 'CV Club (30 días)' });
  if (!r.ok) return { error: r.falta ? `Te faltan ${r.falta} monedas.` : 'No se pudo cobrar.', falta: r.falta || 0 };
  const estaba = f && f.hasta > ahora;
  db.prepare(`INSERT INTO puente_cvclub (user_id, hasta, auto, desde, gratis, avisado, actualizado) VALUES (?, ?, 1, ?, 0, NULL, ?)
    ON CONFLICT(user_id) DO UPDATE SET hasta = excluded.hasta, avisado = NULL, actualizado = excluded.actualizado`).run(Number(uid), hasta, ahora, ahora);
  if (!estaba) prender(uid);
  log(`cvclub: ${uid} ${renovacion ? 'renovó' : 'pagó'} hasta ${new Date(hasta).toISOString().slice(0, 10)}`);
  return { ok: true, hasta, saldo: r.saldo };
}

// Cada 10 minutos: los que se vencen (renovar o apagar) y el aviso de 3 dias antes
function revisar() {
  const ahora = Date.now();
  for (const f of db.prepare('SELECT * FROM puente_cvclub WHERE hasta <= ? AND hasta > ?').all(ahora, ahora - 7 * DIA)) {
    if (f.auto) {
      const r = pagar(f.user_id, true);
      if (r.ok) { avisar(f.user_id, '✨ Se renovó tu CV Club', `Se cobraron ${PRECIO} monedas: lo tenés 30 días más.`); continue; }
    }
    apagar(f.user_id);
    // (marca de que ya se apago: hasta queda en el pasado y no se vuelve a procesar)
    db.prepare('UPDATE puente_cvclub SET hasta = ?, actualizado = ? WHERE user_id = ?').run(ahora - 7 * DIA - 1, ahora, f.user_id);
    avisar(f.user_id, 'Se terminó tu CV Club', f.auto ? `No te alcanzaron las monedas para renovarlo (${PRECIO}). Tu estilo queda guardado: vuelve cuando lo renueves.` : 'Tu estilo queda guardado: vuelve cuando lo renueves desde la pastilla de monedas.');
  }
  for (const f of db.prepare('SELECT * FROM puente_cvclub WHERE hasta > ? AND hasta <= ? AND avisado IS NULL').all(ahora, ahora + 3 * DIA)) {
    db.prepare('UPDATE puente_cvclub SET avisado = ? WHERE user_id = ?').run(ahora, f.user_id);
    const s = M().saldo(f.user_id);
    avisar(f.user_id, 'Tu CV Club se vence en 3 días', f.auto ? (s >= PRECIO ? `Se renueva solo: se cobran ${PRECIO} monedas.` : `Para renovarlo hacen falta ${PRECIO} monedas y tenés ${s}.`) : 'Renovalo desde la pastilla de monedas para no perder tu estilo.');
  }
}

// Los que ya usaban algo de esto: el primer mes gratis, una sola vez
function regalarPrimerMes() {
  if (db.prepare("SELECT 1 FROM puente_cvclub WHERE gratis = 1 LIMIT 1").get()) return;
  try { if (db.prepare("SELECT value FROM server_settings WHERE key = 'puente_cvclub_regalo'").get()) return; } catch { return; }
  const ids = new Set();
  try { for (const r of db.prepare("SELECT haven_user_id id FROM puente_perfil WHERE color IS NOT NULL OR banner IS NOT NULL OR fuente IS NOT NULL OR tema1 IS NOT NULL").all()) ids.add(r.id); } catch { /* sin perfil */ }
  try { for (const r of db.prepare("SELECT id FROM users WHERE avatar_shape IS NOT NULL AND avatar_shape != 'circle' AND IFNULL(is_guest, 0) = 0").all()) ids.add(r.id); } catch { /* sin columna */ }
  const ahora = Date.now(), hasta = ahora + DIAS * DIA;
  for (const id of ids) {
    if (!db.prepare('SELECT 1 FROM users WHERE id = ? AND IFNULL(is_guest, 0) = 0').get(id)) continue;
    // (sin renovarse solo: no lo pidieron; al terminar, si quieren, lo pagan desde la pastilla)
    db.prepare('INSERT OR IGNORE INTO puente_cvclub (user_id, hasta, auto, desde, gratis, actualizado) VALUES (?, ?, 0, ?, 1, ?)').run(id, hasta, ahora, ahora);
    avisar(id, '✨ Tenés un mes gratis de CV Club', `El estilo de tu nombre, el banner, el tema y la forma del avatar ahora son de CV Club (${PRECIO} monedas por mes). Como ya los usabas, el primer mes es gratis; después, si querés seguir, lo renovás desde la pastilla de monedas.`);
  }
  try { db.prepare("INSERT OR REPLACE INTO server_settings (key, value) VALUES ('puente_cvclub_regalo', ?)").run(String(ahora)); } catch { /* sin settings */ }
  if (ids.size) log(`cvclub: un mes gratis para ${ids.size} que ya lo usaban`);
}

function estado(uid) {
  const f = fila(uid), ahora = Date.now();
  return { precio: PRECIO, dias: DIAS, activo: !!f && f.hasta > ahora, hasta: f && f.hasta > ahora ? f.hasta : 0, auto: f ? !!f.auto : true, gratis: !!(f && f.gratis && f.hasta > ahora), saldo: M().saldo(uid) };
}

async function handle(req, res, p, u, h) {
  if (!p.startsWith('/puente/api/cvclub')) return false;
  const user = h.sessionUser(req);
  if (!user) return h.json(res, 401, { error: 'sin sesion' });
  res.setHeader('Cache-Control', 'no-store');
  if (p === '/puente/api/cvclub' && req.method === 'GET') return h.json(res, 200, estado(user.id));
  if (p === '/puente/api/cvclub/pagar' && req.method === 'POST') {
    const r = pagar(user.id);
    return r.ok ? h.json(res, 200, { ok: true, ...estado(user.id) }) : h.json(res, 400, r);
  }
  if (p === '/puente/api/cvclub/auto' && req.method === 'POST') {
    const b = (await h.readJson(req, 1000)) || {};
    if (!fila(user.id)) return h.json(res, 400, { error: 'Todavía no tenés CV Club.' });
    db.prepare('UPDATE puente_cvclub SET auto = ?, actualizado = ? WHERE user_id = ?').run(b.auto ? 1 : 0, Date.now(), user.id);
    return h.json(res, 200, { ok: true, ...estado(user.id) });
  }
  return h.json(res, 404, { error: 'no existe' });
}

// La insignia en el perfil (logros.js)
function insignias(uid) {
  return activo(uid) ? [['cvclub', '✨', 'CV Club', 'Es parte de CV Club: viene seguido y lo banca con sus monedas']] : [];
}

module.exports = { setup, handle, activo, insignias, estado, PRECIO, _revisar: revisar };
