// Las monedas del club: una sola moneda para todo CV Chat (el chat, los juegos, CV Hotel y Capa 2). Paso 1 del plan
// de la economia: el nucleo. Guarda el saldo de cada cuenta y cada movimiento (cuanto, por que y de donde), sin que se
// vea nada todavia: lo usan los otros modulos para dar y cobrar, y los administradores ven el resumen.
//
// Reglas:
//  - El saldo nunca queda negativo: cobrar() no cobra si no alcanza.
//  - Nada se paga dos veces: un movimiento con "clave" (por ejemplo 'bienvenida:123' o 'partida:truco:abc') se
//    anota una sola vez; la segunda vez no cambia nada y avisa que estaba repetido.
//  - El saldo es siempre la suma de los movimientos (revisar() lo comprueba).
//  - Los invitados (cuentas de juego sin registrarse) no tienen monedas.
//  - Modo "sombra" (hasta el lanzamiento): se anota todo, pero nadie lo ve ni lo puede gastar. Al lanzar, lo juntado
//    queda acreditado (es el mismo saldo).
//
//  dar(uid, n, { tipo, origen, detalle, clave })     -> { ok, saldo, repetido } | { ok: false, error }
//  cobrar(uid, n, { tipo, origen, detalle, clave })  -> { ok, saldo, repetido } | { ok: false, error, falta }
//  saldo(uid) -> numero;  movimientos(uid, n) -> [...];  revisar() -> [{ uid, saldo, suma }] (las que no cierran)
//  modo() -> 'sombra' | 'activo'
//  GET /puente/api/admin/monedas   (solo administradores) el resumen: cuantas cuentas, cuanto hay, de donde sale, los
//                                   que mas tienen y los ultimos movimientos

let db = null, log = () => {}, warn = () => {};
const ORIGENES = new Set(['chat', 'juegos', 'hotel', 'capa2', 'admin', 'sistema']);
const MAXIMO = 100000; // (un movimiento mas grande que esto es un error de quien llama)

function setup(ctx) {
  ({ db, log, warn } = ctx);
  db.exec(`CREATE TABLE IF NOT EXISTS puente_monedas (
      user_id INTEGER PRIMARY KEY, saldo INTEGER NOT NULL DEFAULT 0, ganado INTEGER NOT NULL DEFAULT 0,
      gastado INTEGER NOT NULL DEFAULT 0, actualizado INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS puente_monedas_mov (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, delta INTEGER NOT NULL, saldo INTEGER NOT NULL,
      tipo TEXT NOT NULL, origen TEXT NOT NULL, detalle TEXT, clave TEXT UNIQUE, t INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_puente_monedas_mov_user ON puente_monedas_mov(user_id, id);
    CREATE INDEX IF NOT EXISTS idx_puente_monedas_mov_t ON puente_monedas_mov(t);`);
  const descuadres = revisar();
  if (descuadres.length) warn(`monedas: ${descuadres.length} cuentas no cierran con sus movimientos`);
  log(`monedas: listas (modo ${modo()})`);
}

function modo() {
  try { const r = db.prepare("SELECT value FROM server_settings WHERE key = 'puente_monedas_modo'").get(); return r && r.value === 'activo' ? 'activo' : 'sombra'; } catch { return 'sombra'; }
}

const limpio = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n);
function revisarPedido(uid, n, o) {
  if (!Number.isInteger(uid) || uid <= 0) return 'cuenta';
  if (!Number.isInteger(n) || n <= 0 || n > MAXIMO) return 'cantidad';
  if (!o || !/^[a-z0-9_-]{1,30}$/.test(String(o.tipo || ''))) return 'tipo';
  if (!ORIGENES.has(o.origen)) return 'origen';
  if (o.clave != null && !/^[\w:.\-]{1,120}$/.test(String(o.clave))) return 'clave';
  const u = db.prepare('SELECT IFNULL(is_guest, 0) g FROM users WHERE id = ?').get(uid);
  if (!u) return 'cuenta';
  if (u.g) return 'invitado';
  return null;
}

// el movimiento, todo junto o nada
let mover = null;
function moverTx(uid, delta, o) {
  if (!mover) {
    mover = db.transaction((u, d, op) => {
      if (op.clave != null && db.prepare('SELECT 1 FROM puente_monedas_mov WHERE clave = ?').get(String(op.clave))) return { ok: true, saldo: saldo(u), repetido: true };
      const ahora = Date.now();
      db.prepare('INSERT OR IGNORE INTO puente_monedas (user_id, saldo, ganado, gastado, actualizado) VALUES (?, 0, 0, 0, ?)').run(u, ahora);
      const c = db.prepare('SELECT saldo FROM puente_monedas WHERE user_id = ?').get(u);
      if (c.saldo + d < 0) return { ok: false, error: 'No te alcanzan las monedas.', falta: -(c.saldo + d) };
      const nuevo = c.saldo + d;
      db.prepare('UPDATE puente_monedas SET saldo = ?, ganado = ganado + ?, gastado = gastado + ?, actualizado = ? WHERE user_id = ?')
        .run(nuevo, d > 0 ? d : 0, d < 0 ? -d : 0, ahora, u);
      db.prepare('INSERT INTO puente_monedas_mov (user_id, delta, saldo, tipo, origen, detalle, clave, t) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(u, d, nuevo, op.tipo, op.origen, limpio(op.detalle, 160) || null, op.clave != null ? String(op.clave) : null, ahora);
      return { ok: true, saldo: nuevo, repetido: false };
    });
  }
  return mover(uid, delta, o);
}

function dar(uid, n, o = {}) {
  uid = Number(uid);
  const mal = revisarPedido(uid, n, o);
  if (mal) return { ok: false, error: mal };
  try { return moverTx(uid, n, o); } catch (err) { warn('monedas: dar:', err.message); return { ok: false, error: 'interno' }; }
}
function cobrar(uid, n, o = {}) {
  uid = Number(uid);
  const mal = revisarPedido(uid, n, o);
  if (mal) return { ok: false, error: mal };
  try { return moverTx(uid, -n, o); } catch (err) { warn('monedas: cobrar:', err.message); return { ok: false, error: 'interno' }; }
}
function saldo(uid) {
  const r = db.prepare('SELECT saldo FROM puente_monedas WHERE user_id = ?').get(Number(uid));
  return r ? r.saldo : 0;
}
function movimientos(uid, n = 30) {
  return db.prepare('SELECT delta, saldo, tipo, origen, detalle, t FROM puente_monedas_mov WHERE user_id = ? ORDER BY id DESC LIMIT ?')
    .all(Number(uid), Math.max(1, Math.min(200, n | 0)));
}
function revisar() {
  return db.prepare(`SELECT m.user_id uid, m.saldo, COALESCE((SELECT SUM(delta) FROM puente_monedas_mov v WHERE v.user_id = m.user_id), 0) suma
    FROM puente_monedas m`).all().filter((r) => r.saldo !== r.suma || r.saldo < 0);
}

function resumen() {
  const tot = db.prepare('SELECT COUNT(*) cuentas, COALESCE(SUM(saldo), 0) total, COALESCE(SUM(ganado), 0) ganado, COALESCE(SUM(gastado), 0) gastado FROM puente_monedas').get();
  const semana = Date.now() - 7 * 864e5;
  const porOrigen = db.prepare(`SELECT origen, tipo, SUM(CASE WHEN delta > 0 THEN delta ELSE 0 END) entra, SUM(CASE WHEN delta < 0 THEN -delta ELSE 0 END) sale, COUNT(*) n
    FROM puente_monedas_mov WHERE t >= ? GROUP BY origen, tipo ORDER BY entra + sale DESC LIMIT 40`).all(semana);
  const nombre = 'COALESCE(u.display_name, u.username)';
  const top = db.prepare(`SELECT ${nombre} nombre, m.saldo, m.ganado, m.gastado FROM puente_monedas m JOIN users u ON u.id = m.user_id ORDER BY m.saldo DESC LIMIT 20`).all();
  const ultimos = db.prepare(`SELECT ${nombre} nombre, v.delta, v.saldo, v.tipo, v.origen, v.detalle, v.t FROM puente_monedas_mov v JOIN users u ON u.id = v.user_id ORDER BY v.id DESC LIMIT 40`).all();
  return { modo: modo(), ...tot, porOrigen, top, ultimos, descuadres: revisar().length };
}

async function handle(req, res, p, u, h) {
  if (p !== '/puente/api/admin/monedas') return false;
  if (req.method !== 'GET') return h.json(res, 405, { error: 'metodo' });
  const user = h.sessionUser(req);
  if (!user) return h.json(res, 401, { error: 'sin sesion' });
  const yo = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(user.id);
  if (!yo || !yo.is_admin) return h.json(res, 403, { error: 'solo administradores' });
  res.setHeader('Cache-Control', 'no-store');
  return h.json(res, 200, resumen());
}

module.exports = { setup, handle, dar, cobrar, saldo, movimientos, revisar, resumen, modo };
