// De donde es cada cuenta (la pestaña "Países" de Admin): el pais, la provincia y la ciudad aproximados de la IP con
// que se conecto por ultima vez (la tabla user_ips de Haven, que ya la anota para la seguridad de las cuentas).
// La busqueda es adentro del servidor, en la base gratuita de DB-IP (geo-armar.js la arma una vez por mes en
// /data/puente-geo): ninguna IP se manda a otro lado. Es aproximado: con VPN o con los datos del celular puede
// marcar otra ciudad (o hasta otro pais).
//   GET /puente/api/estadisticas/paises   (solo administradores)
'use strict';
const fs = require('fs');
const path = require('path');
const { fork } = require('child_process');

const DIR = process.env.PUENTE_GEO_DIR || '/data/puente-geo';
const SIN = 0xFFFFFFFF;
const DIA = 24 * 60 * 60 * 1000;
let db, log, warn;
let armando = false, ultimoIntento = 0;

function base() { try { return JSON.parse(fs.readFileSync(path.join(DIR, 'base.json'), 'utf8')); } catch { return null; } }

// Una vez por mes (desde el dia 3, cuando DB-IP ya publico la del mes), o si no hay ninguna
function revisar() {
  if (armando || process.env.PUENTE_GEO === '0') return;
  const b = base(), hoy = new Date();
  const mes = hoy.toISOString().slice(0, 7);
  const vieja = !b || (b.mes !== mes && b.mes !== 'local' && hoy.getUTCDate() >= 3);
  if (!vieja || Date.now() - ultimoIntento < 6 * 60 * 60 * 1000) return;
  ultimoIntento = Date.now(); armando = true;
  let hijo;
  try { hijo = fork(path.join(__dirname, 'geo-armar.js'), [DIR], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'], execArgv: ['--max-old-space-size=256'] }); } catch (err) { armando = false; warn('geo: no arranco:', err.message); return; }
  let respuesta = null;
  hijo.on('message', (m) => { respuesta = m; });
  hijo.stderr.on('data', () => {});
  hijo.on('exit', () => {
    armando = false; lugares = null;
    if (respuesta && respuesta.ok) log('geo: base de ubicaciones ' + respuesta.mes + ' (' + respuesta.tramos + ' tramos)');
    else warn('geo: no se pudo armar la base:', respuesta ? respuesta.error : 'sin respuesta');
  });
}

function setup(ctx) {
  ({ db, log, warn } = ctx);
  setTimeout(revisar, 3 * 60 * 1000).unref();
  setInterval(revisar, 12 * 60 * 60 * 1000).unref();
}

// Los lugares en memoria solo mientras se usan (son unos 6 MB)
let lugares = null, lugaresT = null;
function cargarLugares() {
  if (!lugares) lugares = JSON.parse(fs.readFileSync(path.join(DIR, 'lugares.json'), 'utf8'));
  clearTimeout(lugaresT); lugaresT = setTimeout(() => { lugares = null; }, 10 * 60 * 1000); lugaresT.unref();
  return lugares;
}

const num = (ip) => {
  const m = /^(?:::ffff:)?(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/i.exec(String(ip || '').trim());
  if (!m || m.slice(1).some(x => +x > 255)) return -1;
  return ((+m[1] << 24) >>> 0) + (+m[2] << 16) + (+m[3] << 8) + (+m[4]);
};
const privada = (n) => n >>> 24 === 10 || n >>> 24 === 127 || n >>> 24 === 0 || (n >>> 20) === 0xAC1 || (n >>> 16) === 0xC0A8 || (n >>> 16) === 0xA9FE || (n >>> 22) === 0x191;

// Busca muchas IP de una vez en v4.bin (busqueda binaria leyendo del disco, sin cargarlo entero)
function buscar(ips) {
  const out = new Map();
  let fd;
  try { fd = fs.openSync(path.join(DIR, 'v4.bin'), 'r'); } catch { return out; }
  try {
    const n = fs.fstatSync(fd).size / 8, b = Buffer.alloc(8), L = cargarLugares();
    const leer = (i) => { fs.readSync(fd, b, 0, 8, i * 8); return [b.readUInt32BE(0), b.readUInt32BE(4)]; };
    for (const ip of ips) {
      const x = num(ip);
      if (x < 0 || privada(x) || out.has(ip)) continue;
      let lo = 0, hi = n - 1, lugar = SIN;
      while (lo <= hi) { // el ultimo tramo que empieza antes o en x
        const mid = (lo + hi) >> 1, [ini, l] = leer(mid);
        if (ini <= x) { lugar = l; lo = mid + 1; } else hi = mid - 1;
      }
      if (lugar !== SIN && L[lugar]) out.set(ip, L[lugar]);
    }
  } finally { fs.closeSync(fd); }
  return out;
}

// (la base trae los nombres sin acentos)
const PROVINCIA = { 'Buenos Aires F.D.': 'Ciudad de Buenos Aires', Cordoba: 'Córdoba', 'Entre Rios': 'Entre Ríos', 'Rio Negro': 'Río Negro', Neuquen: 'Neuquén', Tucuman: 'Tucumán' };
const visto = (s) => { const t = Date.parse(String(s || '').replace(' ', 'T') + 'Z'); return Number.isFinite(t) ? t : 0; };

function calcular() {
  const b = base();
  if (!b) return { sinBase: true, armando };
  const cuentas = db.prepare("SELECT id, username, COALESCE(display_name, username) nombre, avatar, created_at FROM users WHERE username != 'discord-historial' AND COALESCE(is_guest, 0) = 0").all();
  const ipsDe = new Map();
  for (const r of db.prepare('SELECT user_id, ip, last_seen FROM user_ips ORDER BY last_seen DESC').all()) {
    if (!ipsDe.has(r.user_id)) ipsDe.set(r.user_id, []);
    ipsDe.get(r.user_id).push(r);
  }
  const todas = [];
  for (const l of ipsDe.values()) for (const r of l) todas.push(r.ip);
  const donde = buscar(todas);
  const ahora = Date.now();
  const personas = [], paises = new Map(), provincias = new Map();
  let sinIp = 0, sinDato = 0;
  for (const c of cuentas) {
    const l = ipsDe.get(c.id) || [];
    if (!l.length) { sinIp++; continue; }
    const conLugar = l.filter(r => donde.has(r.ip));
    if (!conLugar.length) { sinDato++; continue; }
    const ult = conLugar[0], [pais, prov, ciudad] = donde.get(ult.ip), t = visto(ult.last_seen);
    const otros = [...new Set(conLugar.map(r => donde.get(r.ip)[0]))].filter(x => x !== pais);
    const provincia = PROVINCIA[prov] || prov;
    personas.push({ id: c.id, username: c.username, nombre: c.nombre, avatar: c.avatar || null, pais, provincia, ciudad, visto: t, otros });
    const p = paises.get(pais) || { pais, personas: 0, activas: 0 };
    p.personas++; if (ahora - t < 30 * DIA) p.activas++;
    paises.set(pais, p);
    if (pais === 'AR' && provincia) {
      const q = provincias.get(provincia) || { nombre: provincia, personas: 0, activas: 0 };
      q.personas++; if (ahora - t < 30 * DIA) q.activas++;
      provincias.set(provincia, q);
    }
  }
  const orden = (a, b) => b.personas - a.personas || b.activas - a.activas;
  personas.sort((a, b) => b.visto - a.visto);
  return {
    base: { mes: b.mes }, total: cuentas.length, conLugar: personas.length, sinIp, sinDato,
    paises: [...paises.values()].sort(orden), provincias: [...provincias.values()].sort(orden), personas,
  };
}

// Para la lista de Miembros: id de la cuenta -> { pais, provincia, ciudad } de su ultima conexion con ubicacion
function lugarDeCada() {
  const out = new Map();
  if (!base()) return out;
  const filas = db.prepare('SELECT user_id, ip FROM user_ips ORDER BY last_seen DESC').all();
  const donde = buscar(filas.map(r => r.ip));
  for (const r of filas) {
    if (out.has(r.user_id) || !donde.has(r.ip)) continue;
    const [pais, prov, ciudad] = donde.get(r.ip);
    out.set(r.user_id, { pais, provincia: PROVINCIA[prov] || prov, ciudad });
  }
  return out;
}

let cache = null;
async function handle(req, res, p, u, h) {
  if (p !== '/puente/api/estadisticas/paises') return false;
  if (req.method !== 'GET') return h.json(res, 405, { error: 'metodo' });
  const user = h.sessionUser(req);
  if (!user) return h.json(res, 401, { error: 'sin sesion' });
  const admin = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(user.id);
  if (!admin || !admin.is_admin) return h.json(res, 403, { error: 'solo administradores' });
  if (cache && Date.now() - cache.at < 2 * 60 * 1000) return h.json(res, 200, cache.datos);
  let datos;
  try { datos = calcular(); } catch (err) { warn('geo:', err.message); return h.json(res, 500, { error: 'No se pudieron calcular los países.' }); }
  if (!datos.sinBase) cache = { at: Date.now(), datos };
  return h.json(res, 200, datos);
}

module.exports = { setup, handle, calcular, buscar, lugarDeCada };
