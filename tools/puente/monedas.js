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
//  GET /puente/api/monedas/mias     (sesion) el saldo y los ultimos movimientos propios; por ahora solo para administradores
//  GET /puente/api/admin/monedas   (solo administradores) el resumen: cuantas cuentas, cuanto hay, de donde sale, los
//                                   que mas tienen y los ultimos movimientos
//  Y para las otras partes de Admin → Economia (economia-admin.js), tambien solo administradores:
//  GET /puente/api/admin/monedas/movimientos?q=&uid=&origen=&tipo=&n=   los movimientos (los mas nuevos primero) con
//      filtros: por nombre (sin importar tildes) o por cuenta, por lugar y por tipo; con cuantos hay de cada lugar y tipo
//  GET /puente/api/admin/monedas/saldos                                  el saldo de cada cuenta (y si es de CV Club)
//  GET /puente/api/admin/monedas/origen?periodo=1|7|30|todo              de donde salen y en que se gastan

let db = null, log = () => {}, warn = () => {};
const ORIGENES = new Set(['chat', 'juegos', 'hotel', 'capa2', 'foro', 'admin', 'sistema']);
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
  const nombre = "COALESCE(NULLIF(u.display_name, ''), u.username)";
  const top = db.prepare(`SELECT m.user_id uid, ${nombre} nombre, m.saldo, m.ganado, m.gastado FROM puente_monedas m JOIN users u ON u.id = m.user_id ORDER BY m.saldo DESC LIMIT 20`).all();
  const ultimos = db.prepare(`SELECT v.id, v.user_id uid, ${nombre} nombre, v.delta, v.saldo, v.tipo, v.origen, v.detalle, v.t FROM puente_monedas_mov v JOIN users u ON u.id = v.user_id ORDER BY v.id DESC LIMIT 40`).all();
  // lo de hoy (desde la medianoche de Argentina) y cuantos son de CV Club
  const AR0 = 3 * 3600e3, medianoche = Math.floor((Date.now() - AR0) / 864e5) * 864e5 + AR0;
  const hoy = db.prepare('SELECT COUNT(*) movimientos, COUNT(DISTINCT user_id) gente FROM puente_monedas_mov WHERE t >= ?').get(medianoche);
  let socios = 0;
  try { socios = db.prepare('SELECT COUNT(*) n FROM puente_cvclub WHERE hasta > ?').get(Date.now()).n; } catch { /* sin CV Club */ }
  // por dia (fecha de Argentina), los ultimos 30: lo que entro y lo que salio; sin la bienvenida, que es de una vez
  const AR = 3 * 3600e3;
  const dias = db.prepare(`SELECT date((t - ${AR}) / 1000, 'unixepoch') dia,
      SUM(CASE WHEN delta > 0 AND tipo != 'bienvenida' THEN delta ELSE 0 END) entra, SUM(CASE WHEN delta < 0 THEN -delta ELSE 0 END) sale,
      SUM(CASE WHEN tipo = 'bienvenida' THEN delta ELSE 0 END) bienvenida, COUNT(DISTINCT user_id) gente
    FROM puente_monedas_mov WHERE t >= ? GROUP BY dia ORDER BY dia`).all(Date.now() - 30 * 864e5);
  // lo que gano cada uno en los ultimos 7 dias (sin bienvenida ni primeros pasos): como se reparte
  const sem = db.prepare(`SELECT ${nombre} nombre, SUM(v.delta) n FROM puente_monedas_mov v JOIN users u ON u.id = v.user_id
    WHERE v.t >= ? AND v.delta > 0 AND v.tipo NOT IN ('bienvenida', 'primer-paso') GROUP BY v.user_id ORDER BY n DESC`).all(semana);
  const valores = sem.map((x) => x.n).sort((a, b) => a - b), pct = (q) => (valores.length ? valores[Math.min(valores.length - 1, Math.floor(q * valores.length))] : 0);
  const sumaSem = valores.reduce((a, b) => a + b, 0), top10 = valores.slice(Math.floor(valores.length * 0.9)).reduce((a, b) => a + b, 0);
  const reparto = { gente: valores.length, p50: pct(0.5), p75: pct(0.75), p90: pct(0.9), max: valores[valores.length - 1] || 0, total: sumaSem, top10pct: sumaSem ? Math.round((top10 / sumaSem) * 100) : 0, quienes: sem.slice(0, 10) };
  return { modo: modo(), ...tot, porOrigen, top, ultimos, dias, reparto, hoy, socios, descuadres: revisar().length };
}

// ── Las otras partes de Admin → Economia: los movimientos con filtros, el saldo de cada uno y de donde salen ──
const sinTildes = (s) => String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const NOMBRE_DE = (a) => `COALESCE(NULLIF(u.display_name, ''), u.username, '#' || ${a}.user_id)`;
// las cuentas con monedas cuyo nombre (o usuario) tiene lo buscado, sin importar tildes ni mayusculas
function cuentasQue(q) {
  const b = sinTildes(q).trim();
  if (!b) return null;
  return db.prepare('SELECT u.id, u.username, u.display_name FROM puente_monedas m JOIN users u ON u.id = m.user_id').all()
    .filter((x) => sinTildes(x.display_name).includes(b) || sinTildes(x.username).includes(b)).map((x) => x.id);
}
function movimientosAdmin(o = {}) {
  const n = Math.max(1, Math.min(600, parseInt(o.n, 10) || 30));
  const origen = ORIGENES.has(o.origen) ? o.origen : '';
  const tipo = /^[a-z0-9_-]{1,30}$/.test(String(o.tipo || '')) ? String(o.tipo) : '';
  const q = String(o.q || '').slice(0, 60);
  const uid = parseInt(o.uid, 10) > 0 ? parseInt(o.uid, 10) : 0;
  // de quien: una cuenta (uid) o las que coinciden con lo buscado
  const base = [], args = [];
  let quien = null;
  if (uid) {
    base.push('v.user_id = ?'); args.push(uid);
    const r = db.prepare("SELECT COALESCE(NULLIF(display_name, ''), username) nombre FROM users WHERE id = ?").get(uid);
    quien = { uid, nombre: r ? r.nombre : '#' + uid };
  } else {
    const ids = cuentasQue(q);
    if (ids) { base.push('v.user_id IN (SELECT value FROM json_each(?))'); args.push(JSON.stringify(ids)); }
  }
  const donde = (mas) => {
    const c = base.concat(mas.map((x) => x[0]));
    return { sql: c.length ? 'WHERE ' + c.join(' AND ') : '', args: args.concat(mas.map((x) => x[1])) };
  };
  const fOrigen = origen ? [['v.origen = ?', origen]] : [], fTipo = tipo ? [['v.tipo = ?', tipo]] : [];
  const w = donde([...fOrigen, ...fTipo]);
  const tot = db.prepare(`SELECT COUNT(*) n, COALESCE(SUM(CASE WHEN v.delta > 0 THEN v.delta ELSE 0 END), 0) entra,
      COALESCE(SUM(CASE WHEN v.delta < 0 THEN -v.delta ELSE 0 END), 0) sale FROM puente_monedas_mov v ${w.sql}`).get(...w.args);
  const items = db.prepare(`SELECT v.id, v.user_id uid, ${NOMBRE_DE('v')} nombre, v.delta, v.saldo, v.tipo, v.origen, v.detalle, v.t
    FROM puente_monedas_mov v LEFT JOIN users u ON u.id = v.user_id ${w.sql} ORDER BY v.id DESC LIMIT ?`).all(...w.args, n);
  // para los filtros: cuantos hay de cada lugar (sin elegir lugar ni tipo) y de cada tipo (en el lugar elegido)
  const wl = donde([]), wt = donde(fOrigen);
  const origenes = db.prepare(`SELECT v.origen, COUNT(*) n FROM puente_monedas_mov v ${wl.sql} GROUP BY v.origen ORDER BY n DESC`).all(...wl.args);
  const tipos = db.prepare(`SELECT v.tipo, COUNT(*) n FROM puente_monedas_mov v ${wt.sql} GROUP BY v.tipo ORDER BY n DESC`).all(...wt.args);
  return { total: tot.n, entra: tot.entra, sale: tot.sale, n, items, origenes, tipos, quien, filtro: { q: uid ? '' : q, uid, origen, tipo } };
}
function saldosAdmin() {
  const malos = new Map(revisar().map((r) => [r.uid, r.suma]));
  let socios = new Set();
  try { socios = new Set(db.prepare('SELECT user_id FROM puente_cvclub WHERE hasta > ?').all(Date.now()).map((r) => r.user_id)); } catch { /* sin CV Club */ }
  const items = db.prepare(`SELECT m.user_id uid, ${NOMBRE_DE('m')} nombre, u.username usuario, m.saldo, m.ganado, m.gastado, m.actualizado t
    FROM puente_monedas m LEFT JOIN users u ON u.id = m.user_id ORDER BY m.saldo DESC, m.user_id`).all()
    .map((x) => Object.assign(x, { club: socios.has(x.uid) }, malos.has(x.uid) ? { noCierra: true, suma: malos.get(x.uid) } : {}));
  return { items };
}
const PERIODOS = { 1: 864e5, 7: 7 * 864e5, 30: 30 * 864e5, todo: 0 };
function origenAdmin(periodo) {
  const p = Object.prototype.hasOwnProperty.call(PERIODOS, String(periodo)) ? String(periodo) : '7';
  const desde = PERIODOS[p] ? Date.now() - PERIODOS[p] : 0;
  const cols = `COUNT(*) n, COUNT(DISTINCT user_id) gente, COALESCE(SUM(CASE WHEN delta > 0 THEN delta ELSE 0 END), 0) entra,
    COALESCE(SUM(CASE WHEN delta < 0 THEN -delta ELSE 0 END), 0) sale`;
  const filas = db.prepare(`SELECT origen, tipo, ${cols} FROM puente_monedas_mov WHERE t >= ? GROUP BY origen, tipo ORDER BY entra + sale DESC, n DESC`).all(desde);
  const lugares = db.prepare(`SELECT origen, ${cols} FROM puente_monedas_mov WHERE t >= ? GROUP BY origen ORDER BY entra + sale DESC, n DESC`).all(desde);
  const total = db.prepare(`SELECT ${cols} FROM puente_monedas_mov WHERE t >= ?`).get(desde);
  return { periodo: p, filas, lugares, total };
}

// el saldo de quien lo pide (la pastilla al lado de la campanita): por ahora solo lo ven los administradores; para
// todos cuando la economia este activa
function mias(uid) {
  const yo = db.prepare('SELECT is_admin, IFNULL(is_guest, 0) g FROM users WHERE id = ?').get(Number(uid));
  if (!yo || yo.g) return { visible: false };
  const visible = !!yo.is_admin || modo() === 'activo';
  if (!visible) return { visible: false };
  const c = db.prepare('SELECT saldo, ganado, gastado FROM puente_monedas WHERE user_id = ?').get(Number(uid)) || { saldo: 0, ganado: 0, gastado: 0 };
  // los primeros pasos (los paga monedas-fuentes.js, una vez cada uno): cuales ya hizo
  const hechos = new Set(db.prepare("SELECT clave FROM puente_monedas_mov WHERE user_id = ? AND clave LIKE 'paso:%'").all(Number(uid)).map((r) => String(r.clave).split(':')[1]));
  const confirmado = !!db.prepare("SELECT 1 FROM puente_monedas_mov WHERE clave = ?").get('bienvenida:' + Number(uid));
  const pasos = [
    { id: 'bienvenida', texto: 'Confirmá tu email', monedas: 100, hecho: confirmado },
    ...PASOS.map((p) => ({ ...p, hecho: hechos.has(p.id) })),
  ];
  return { visible: true, modo: modo(), ...c, pasos, movimientos: movimientos(uid, 50) };
}
// (los mismos que paga monedas-fuentes.js: REG.pasos)
const PASOS = [
  { id: 'muneco', texto: 'Armá tu muñeco en CV Hotel', monedas: 15 },
  { id: 'mensaje', texto: 'Escribí tu primer mensaje en un canal (llega al otro día)', monedas: 15 },
  { id: 'partida', texto: 'Jugá una partida contra otra persona', monedas: 20 },
  { id: 'sala', texto: 'Poné 3 muebles en una sala de CV Hotel', monedas: 20 },
];

async function handle(req, res, p, u, h) {
  if (p === '/puente/api/monedas/mias') {
    if (req.method !== 'GET') return h.json(res, 405, { error: 'metodo' });
    const user = h.sessionUser(req);
    if (!user) return h.json(res, 401, { error: 'sin sesion' });
    res.setHeader('Cache-Control', 'no-store');
    return h.json(res, 200, mias(user.id));
  }
  if (p !== '/puente/api/admin/monedas' && !p.startsWith('/puente/api/admin/monedas/')) return false;
  if (req.method !== 'GET') return h.json(res, 405, { error: 'metodo' });
  const user = h.sessionUser(req);
  if (!user) return h.json(res, 401, { error: 'sin sesion' });
  const yo = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(user.id);
  if (!yo || !yo.is_admin) return h.json(res, 403, { error: 'solo administradores' });
  res.setHeader('Cache-Control', 'no-store');
  const par = (k) => (u && u.searchParams ? u.searchParams.get(k) : null);
  if (p === '/puente/api/admin/monedas') return h.json(res, 200, resumen());
  if (p === '/puente/api/admin/monedas/movimientos') return h.json(res, 200, movimientosAdmin({ q: par('q'), uid: par('uid'), origen: par('origen'), tipo: par('tipo'), n: par('n') }));
  if (p === '/puente/api/admin/monedas/saldos') return h.json(res, 200, saldosAdmin());
  if (p === '/puente/api/admin/monedas/origen') return h.json(res, 200, origenAdmin(par('periodo')));
  return h.json(res, 404, { error: 'no existe' });
}

module.exports = { setup, handle, dar, cobrar, saldo, movimientos, revisar, resumen, modo, mias, movimientosAdmin, saldosAdmin, origenAdmin };
