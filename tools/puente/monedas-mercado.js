// Las monedas del Marketplace (aprobado por el dueño el 27/11/2026). Lo llama monedas-fuentes.js en cada vuelta.
// No hay forma de comprobar que una compra fue de verdad: la idea es que inventarla cueste mas de lo que paga.
//
//  - Primera publicacion 15 (primer paso) y cada publicacion nueva 10: con al menos una foto propia (que no este en
//    otra publicacion), 60 letras de descripcion, un precio que no sea 0 o 1 (o "a convenir") y sin repetir el titulo
//    de otra suya de los ultimos 30 dias. Se paga a las 24 h si sigue publicada y no la oculto un administrador;
//    hasta 3 por semana. Publicar marca el dia activo.
//  - Venta confirmada (el que vende marca "Vendido a @alguien" y esa persona confirma): 20 al que vende y 10 al que
//    compra, a los 7 dias. Si salta alguna señal no se paga sola: queda "para revisar" en Admin → Marketplace, donde se
//    puede "Pagar igual"; a las normales se les puede tocar "No pagar" mientras esperan. Señales: la misma IP (user_ips),
//    no hablaron por privado despues de publicado el aviso (mensajes de los dos lados; se ve la fecha aunque esten
//    cifrados), el aviso tenia menos de 24 h o se borro despues de la venta, alguna cuenta con menos de 14 dias o menos
//    de 5 dias activos, la misma pareja (en cualquier sentido) en los ultimos 60 dias, una foto repetida, un precio
//    absurdo.
//  - La opinion de esa venta: 5 a cada uno, buena o mala (paga lo mismo), con 30 letras de comentario, a los 7 dias y
//    solo si la venta se pago.
//  - Tope de todo el Marketplace: 100 por persona y por mes (de Argentina). Lo pagado no se quita nunca: lo que espera
//    todavia no se pago.
//
//  GET  /puente/api/admin/mercado-monedas            (administradores) las ventas esperando y las ultimas resueltas
//  POST /puente/api/admin/mercado-monedas { clave, accion: 'pagar' | 'no' }

'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const M = require('./monedas.js');
const DIA = 864e5, AR = 3 * 3600e3;
const DIR = '/data/uploads/puente-mercado';
const REG = {
  primera: 15, publicacion: 10, pubSemana: 3, pubLargo: 60, pubEspera: DIA, tituloDias: 30,
  venta: 20, compra: 10, opinion: 5, opinionLargo: 30, espera: 7 * DIA,
  edad: 14 * DIA, diasActivos: 5, parDias: 60, previa: DIA, topeMes: 100,
};
let db = null, log = () => {}, warn = () => {};

const diaAR = (ms) => new Date(ms - AR).toISOString().slice(0, 10);
const mesAR = (ms) => diaAR(ms).slice(0, 7);
const lunesDe = (ms) => { const d = new Date(ms - AR); const dow = (d.getUTCDay() + 6) % 7; return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dow)).toISOString().slice(0, 10); };
const textoUTC = (ms) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
const msDeTexto = (s) => Date.parse(String(s || '').replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(String(s || '')) ? '' : 'Z'));
const esCuenta = (u) => { const r = db.prepare('SELECT IFNULL(is_guest, 0) g FROM users WHERE id = ?').get(Number(u)); return !!r && !r.g; };
const normal = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const fotosDe = (it) => { try { const f = JSON.parse(it.fotos || '[]'); return Array.isArray(f) ? f.filter((x) => typeof x === 'string') : []; } catch { return []; } };
const json = (x) => JSON.stringify(x || []);
const leerJson = (s) => { try { return JSON.parse(s || '[]'); } catch { return []; } };

function setup(ctx) {
  ({ db, log, warn } = ctx);
  db.exec(`CREATE TABLE IF NOT EXISTS puente_monedas_mercado (
      clave TEXT PRIMARY KEY, tipo TEXT NOT NULL, item_id INTEGER, venta_id INTEGER, user_id INTEGER NOT NULL, otro_id INTEGER,
      t INTEGER NOT NULL, pagar_en INTEGER NOT NULL, estado TEXT NOT NULL, senales TEXT NOT NULL DEFAULT '[]',
      resuelto_por INTEGER, resuelto_en INTEGER, nota TEXT);
    CREATE INDEX IF NOT EXISTS puente_monedas_mercado_e ON puente_monedas_mercado (estado, pagar_en);
    CREATE TABLE IF NOT EXISTS puente_monedas_mercado_fotos (hash TEXT NOT NULL, item_id INTEGER NOT NULL, PRIMARY KEY (hash, item_id));`);
}

// ── Lo que se paga: con el tope del mes ──
function pagado(u, ms) {
  const ini = Date.parse(mesAR(ms) + '-01T00:00:00Z') + AR;
  return db.prepare("SELECT COALESCE(SUM(delta), 0) n FROM puente_monedas_mov WHERE user_id = ? AND origen = 'mercado' AND delta > 0 AND t >= ?").get(Number(u), ini).n;
}
function pagar(u, n, tipo, clave, detalle, ahora) {
  if (!(n > 0) || !esCuenta(u)) return 0;
  const queda = Math.max(0, REG.topeMes - pagado(u, ahora));
  const x = Math.min(n, queda);
  if (x <= 0) return 0;
  const r = M.dar(Number(u), x, { tipo, origen: 'mercado', clave, detalle });
  return r && r.ok && !r.repetido ? x : 0;
}

// ── Las fotos: su huella, para ver si una ya esta en otra publicacion ──
function huellas(it) {
  const out = [];
  for (const f of fotosDe(it)) {
    const p = path.join(DIR, path.basename(f));
    try { out.push(crypto.createHash('sha1').update(fs.readFileSync(p)).digest('hex')); } catch { /* sin el archivo */ }
  }
  return out;
}
function anotarFotos(it) {
  const hs = huellas(it);
  const ins = db.prepare('INSERT OR IGNORE INTO puente_monedas_mercado_fotos (hash, item_id) VALUES (?, ?)');
  for (const h of hs) ins.run(h, it.id);
  return hs;
}
const fotoRepetida = (it) => {
  const hs = db.prepare('SELECT hash FROM puente_monedas_mercado_fotos WHERE item_id = ?').all(it.id).map((r) => r.hash);
  return hs.some((h) => db.prepare('SELECT 1 FROM puente_monedas_mercado_fotos WHERE hash = ? AND item_id != ?').get(h, it.id));
};
const precioAbsurdo = (it) => it.precio != null && Number(it.precio) <= 1;

// ── Las señales de una venta ──
function mismaIP(a, b) {
  try { return !!db.prepare('SELECT 1 FROM user_ips x JOIN user_ips y ON y.ip = x.ip WHERE x.user_id = ? AND y.user_id = ? LIMIT 1').get(a, b); } catch { return false; }
}
function charlaron(a, b, desde, hasta) {
  const canales = db.prepare(`SELECT c.id FROM channels c JOIN channel_members x ON x.channel_id = c.id AND x.user_id = ? JOIN channel_members y ON y.channel_id = c.id AND y.user_id = ?
    WHERE c.is_dm = 1 AND IFNULL(c.is_group, 0) = 0`).all(a, b).map((r) => r.id);
  if (!canales.length) return false;
  const de = (u) => canales.some((c) => db.prepare('SELECT 1 FROM messages WHERE channel_id = ? AND user_id = ? AND created_at >= ? AND created_at <= ? LIMIT 1').get(c, u, textoUTC(desde), textoUTC(hasta)));
  return de(a) && de(b);
}
function cuentaFloja(u, cuando) {
  const r = db.prepare('SELECT created_at FROM users WHERE id = ?').get(u);
  const alta = r ? msDeTexto(r.created_at) : 0;
  const dias = db.prepare('SELECT COUNT(*) n FROM puente_monedas_activos WHERE user_id = ?').get(u).n;
  return !(alta && cuando - alta >= REG.edad) || dias < REG.diasActivos;
}
function senalesVenta(v, it) {
  const s = [];
  if (mismaIP(v.vendedor_id, v.comprador_id)) s.push('Se conectaron desde la misma IP');
  if (!charlaron(v.vendedor_id, v.comprador_id, it.creado, v.creado + 60e3)) s.push('No hablaron por privado antes de la venta');
  if (v.creado - it.creado < REG.previa) s.push('La publicación tenía menos de 24 h');
  if (it.estado === 'borrada') s.push('La publicación se borró');
  if (cuentaFloja(v.vendedor_id, v.creado)) s.push('El que vende tiene una cuenta nueva o poco usada');
  if (cuentaFloja(v.comprador_id, v.creado)) s.push('El que compra tiene una cuenta nueva o poco usada');
  const par = db.prepare(`SELECT 1 FROM puente_mercado_ventas WHERE id != ? AND estado = 'confirmada' AND creado >= ?
    AND ((vendedor_id = ? AND comprador_id = ?) OR (vendedor_id = ? AND comprador_id = ?)) LIMIT 1`)
    .get(v.id, v.creado - REG.parDias * DIA, v.vendedor_id, v.comprador_id, v.comprador_id, v.vendedor_id);
  if (par) s.push('Ya hubo una venta entre los dos en los últimos 60 días');
  if (fotoRepetida(it)) s.push('Una foto está también en otra publicación');
  if (precioAbsurdo(it)) s.push('Precio de 0 o 1');
  return s;
}

// ── La vuelta ──
function liquidar(ahora = Date.now(), marcarActivo = () => {}) {
  const ini = Number((db.prepare("SELECT valor FROM puente_monedas_estado WHERE clave = 'mercado_inicio'").get() || {}).valor || 0);
  if (!ini) { db.prepare("INSERT OR IGNORE INTO puente_monedas_estado (clave, valor) VALUES ('mercado_inicio', ?)").run(String(ahora)); log('monedas del Marketplace: pagan desde ahora'); return; }
  const poner = db.prepare(`INSERT OR IGNORE INTO puente_monedas_mercado (clave, tipo, item_id, venta_id, user_id, otro_id, t, pagar_en, estado, senales)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const item = db.prepare('SELECT * FROM puente_mercado WHERE id = ?');

  // 1. publicaciones nuevas (del chat, no las que se trajeron del foro)
  for (const it of db.prepare("SELECT * FROM puente_mercado WHERE IFNULL(origen, 'cv') = 'cv' AND creado >= ? AND NOT EXISTS (SELECT 1 FROM puente_monedas_mercado x WHERE x.clave = 'pub:' || puente_mercado.id)").all(ini)) {
    anotarFotos(it);
    const s = [];
    if (!fotosDe(it).length) s.push('Sin foto');
    if (String(it.descripcion || '').replace(/\s+/g, ' ').trim().length < REG.pubLargo) s.push('Descripción corta');
    if (precioAbsurdo(it)) s.push('Precio de 0 o 1');
    if (fotoRepetida(it)) s.push('Una foto está también en otra publicación');
    const t = normal(it.titulo);
    const otra = db.prepare('SELECT titulo FROM puente_mercado WHERE user_id = ? AND id != ? AND creado < ? AND creado >= ?').all(it.user_id, it.id, it.creado, it.creado - REG.tituloDias * DIA);
    if (otra.some((o) => normal(o.titulo) === t)) s.push('Repite el título de otra publicación suya');
    poner.run('pub:' + it.id, 'pub', it.id, null, it.user_id, null, it.creado, it.creado + REG.pubEspera, s.length ? 'no' : 'espera', json(s));
    if (!s.length && esCuenta(it.user_id)) marcarActivo(it.user_id, diaAR(it.creado));
  }
  // 2. ventas confirmadas nuevas
  for (const v of db.prepare("SELECT * FROM puente_mercado_ventas WHERE estado = 'confirmada' AND creado >= ? AND NOT EXISTS (SELECT 1 FROM puente_monedas_mercado x WHERE x.clave = 'venta:' || puente_mercado_ventas.id)").all(ini)) {
    const it = item.get(v.item_id);
    if (!it) continue;
    const s = senalesVenta(v, it);
    poner.run('venta:' + v.id, 'venta', it.id, v.id, v.vendedor_id, v.comprador_id, ahora, ahora + REG.espera, s.length ? 'revisar' : 'espera', json(s));
  }
  // 3. opiniones nuevas
  for (const o of db.prepare("SELECT * FROM puente_mercado_opiniones WHERE creado >= ?").all(ini)) {
    const clave = 'op:' + o.venta_id + ':' + o.de_id;
    if (db.prepare('SELECT 1 FROM puente_monedas_mercado WHERE clave = ?').get(clave)) continue;
    const s = [];
    if (String(o.comentario || '').replace(/\s+/g, ' ').trim().length < REG.opinionLargo) s.push('Comentario corto');
    if (!db.prepare('SELECT 1 FROM puente_monedas_mercado WHERE clave = ?').get('venta:' + o.venta_id)) s.push('La venta es de antes');
    poner.run(clave, 'op', null, o.venta_id, o.de_id, o.para_id, o.creado, o.creado + REG.espera, s.length ? 'no' : 'espera', json(s));
  }

  // 4. lo que ya cumplio la espera
  const marcar = db.prepare('UPDATE puente_monedas_mercado SET estado = ?, senales = ?, nota = ?, resuelto_en = COALESCE(resuelto_en, ?) WHERE clave = ?');
  for (const r of db.prepare("SELECT * FROM puente_monedas_mercado WHERE estado IN ('espera', 'aprobado') AND pagar_en <= ? ORDER BY pagar_en").all(ahora)) {
    if (r.tipo === 'pub') {
      const it = item.get(r.item_id);
      if (!it || it.estado === 'borrada' || it.oculta) { marcar.run('no', json([...leerJson(r.senales), 'Se borró o se ocultó antes de las 24 h']), null, ahora, r.clave); continue; }
      const semana = db.prepare("SELECT COUNT(*) n FROM puente_monedas_mercado WHERE tipo = 'pub' AND user_id = ? AND estado = 'pagado' AND t >= ?").get(r.user_id, Date.parse(lunesDe(r.t) + 'T00:00:00Z') + AR).n;
      if (semana >= REG.pubSemana) { marcar.run('no', json(['Ya cobró 3 publicaciones esa semana']), null, ahora, r.clave); continue; }
      let n = 0;
      if (!db.prepare("SELECT 1 FROM puente_monedas_mov WHERE clave = ?").get('paso:mercado:' + r.user_id)) n += pagar(r.user_id, REG.primera, 'primer-paso', 'paso:mercado:' + r.user_id, 'Tu primera publicación en el Marketplace', ahora);
      n += pagar(r.user_id, REG.publicacion, 'mercado-publicacion', 'mercado-pub:' + r.item_id, it.titulo.slice(0, 80), ahora);
      marcar.run('pagado', r.senales, n ? null : 'Llegó al tope del mes', ahora, r.clave);
    } else if (r.tipo === 'venta') {
      const v = db.prepare('SELECT * FROM puente_mercado_ventas WHERE id = ?').get(r.venta_id), it = item.get(r.item_id);
      if (!v || v.estado !== 'confirmada') { marcar.run('no', json([...leerJson(r.senales), 'La venta ya no está confirmada']), null, ahora, r.clave); continue; }
      // (si mientras esperaba se borro la publicacion, vuelve a revisar, salvo que un administrador ya la aprobo)
      if (r.estado === 'espera' && it && it.estado === 'borrada') { marcar.run('revisar', json([...leerJson(r.senales), 'La publicación se borró']), null, null, r.clave); continue; }
      const titulo = it ? it.titulo.slice(0, 80) : 'Marketplace';
      const a = pagar(r.user_id, REG.venta, 'mercado-venta', 'mercado-venta:' + r.venta_id + ':v', titulo, ahora);
      const b = pagar(r.otro_id, REG.compra, 'mercado-compra', 'mercado-venta:' + r.venta_id + ':c', titulo, ahora);
      marcar.run('pagado', r.senales, a + b ? null : 'Llegaron al tope del mes', ahora, r.clave);
    } else if (r.tipo === 'op') {
      const venta = db.prepare('SELECT estado FROM puente_monedas_mercado WHERE clave = ?').get('venta:' + r.venta_id);
      if (!venta || venta.estado === 'no') { marcar.run('no', json([...leerJson(r.senales), 'La venta no se pagó']), null, ahora, r.clave); continue; }
      if (venta.estado !== 'pagado') continue; // (la venta todavia espera o esta para revisar)
      const n = pagar(r.user_id, REG.opinion, 'mercado-opinion', 'mercado-op:' + r.venta_id + ':' + r.user_id, 'Dejaste tu opinión', ahora);
      marcar.run('pagado', r.senales, n ? null : 'Llegó al tope del mes', ahora, r.clave);
    }
  }
}

// ── Admin → Marketplace: las ventas esperando o para revisar ──
const nombre = (u) => { const r = db.prepare('SELECT username, COALESCE(display_name, username) n FROM users WHERE id = ?').get(Number(u)); return r ? { id: Number(u), nombre: r.n, usuario: r.username } : { id: Number(u), nombre: 'alguien que ya no está' }; };
function admin(ahora = Date.now()) {
  const filas = db.prepare(`SELECT * FROM puente_monedas_mercado WHERE tipo = 'venta' AND (estado IN ('espera', 'revisar', 'aprobado') OR resuelto_en >= ?)
    ORDER BY CASE estado WHEN 'revisar' THEN 0 WHEN 'espera' THEN 1 WHEN 'aprobado' THEN 1 ELSE 2 END, t DESC LIMIT 100`).all(ahora - 30 * DIA);
  const item = db.prepare('SELECT titulo FROM puente_mercado WHERE id = ?');
  const ini = Date.parse(mesAR(ahora) + '-01T00:00:00Z') + AR;
  const mes = db.prepare("SELECT COUNT(DISTINCT user_id) personas, COALESCE(SUM(delta), 0) monedas FROM puente_monedas_mov WHERE origen = 'mercado' AND delta > 0 AND t >= ?").get(ini);
  return {
    mes, tope: REG.topeMes,
    ventas: filas.map((r) => ({ clave: r.clave, estado: r.estado, senales: leerJson(r.senales), titulo: ((item.get(r.item_id) || {}).titulo) || 'Publicación borrada',
      item: r.item_id, vende: nombre(r.user_id), compra: nombre(r.otro_id), t: r.t, pagarEn: r.pagar_en, nota: r.nota, resueltoPor: r.resuelto_por ? nombre(r.resuelto_por).nombre : null })),
  };
}
async function handle(req, res, p, u, h) {
  if (p !== '/puente/api/admin/mercado-monedas') return false;
  const user = h.sessionUser(req);
  if (!user) return h.json(res, 401, { error: 'sin sesion' });
  const yo = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(user.id);
  if (!yo || !yo.is_admin) return h.json(res, 403, { error: 'solo administradores' });
  if (req.method === 'GET') { res.setHeader('Cache-Control', 'no-store'); return h.json(res, 200, admin()); }
  if (req.method !== 'POST') return h.json(res, 405, { error: 'metodo' });
  const b = (await h.readJson(req)) || {};
  const r = db.prepare("SELECT * FROM puente_monedas_mercado WHERE clave = ? AND tipo = 'venta'").get(String(b.clave || ''));
  if (!r) return h.json(res, 404, { error: 'No está esa venta.' });
  if (r.estado === 'pagado') return h.json(res, 409, { error: 'Ya se pagó: lo pagado no se quita.' });
  if (b.accion === 'no') db.prepare("UPDATE puente_monedas_mercado SET estado = 'no', resuelto_por = ?, resuelto_en = ?, nota = 'No pagar (administrador)' WHERE clave = ?").run(user.id, Date.now(), r.clave);
  else if (b.accion === 'pagar') db.prepare("UPDATE puente_monedas_mercado SET estado = 'aprobado', resuelto_por = ?, resuelto_en = ?, nota = 'Pagar igual (administrador)' WHERE clave = ?").run(user.id, Date.now(), r.clave);
  else return h.json(res, 400, { error: 'accion' });
  return h.json(res, 200, { ok: true, ...admin() });
}

module.exports = { setup, liquidar, handle, admin, REG };
