// Capa 2 en Admin (la pestaña "Capa 2" del panel de administradores, web/capa2-admin.html): lo que pasa en la ciudad.
//
//   GET /puente/api/capa2/estadisticas   (solo administradores) -> { ok, ahora, capa2, error, serie }
//     capa2: lo que manda el juego en /interno/estadisticas (puente/bacity.js, en su repositorio; con la clave
//            BACITY_SECRETO): el servidor, quienes estan ahora, el mundo, las cuentas, las carreras, los ultimos eventos
//            y los totales por dia. null si el juego no contesta (error dice por que)
//     serie: cuanta gente hubo, de lo que anota este modulo cada minuto (el juego no guarda eso):
//            horas: las ultimas 24 h, de a 10 minutos: [{ t, max, inv }] (max null: ese rato no hubo dato)
//            dias:  los ultimos 30 dias (dia de Argentina): [{ dia, max, horas, conGente }] (horas: horas jugadas,
//                   sumando a todos; conGente: minutos con alguien adentro)
//
// Cada minuto se le pregunta al juego /interno/estado (unos 100 bytes) y se guarda en puente_capa2_minutos (35 dias).
'use strict';

let db = null, warn = () => {}, log = () => {};
const MIN = 60e3, GUARDA_DIAS = 35;
const AR = 180; // Argentina: UTC-3 todo el año (en minutos)
const interno = () => String(process.env.BACITY_INTERNO || 'http://bacity:8787/bacity').replace(/\/+$/, '');
const clave = () => String(process.env.BACITY_SECRETO || '');
let listo = false, ultimaLimpieza = 0, guardado = { at: 0, d: null, pidiendo: null };

function setup(ctx) {
  db = ctx.db; warn = ctx.warn || warn; log = ctx.log || log;
  try {
    db.exec('CREATE TABLE IF NOT EXISTS puente_capa2_minutos (minuto INTEGER PRIMARY KEY, jugadores INTEGER NOT NULL, invitados INTEGER NOT NULL DEFAULT 0)');
    listo = true;
  } catch (err) { warn('capa2-admin: no se pudo crear la tabla:', err.message); return; }
  if (clave().length < 24) { log('capa2-admin: sin BACITY_SECRETO (no se anota la gente de Capa 2)'); return; }
  const t = setInterval(anotar, MIN); if (t.unref) t.unref();
  const p = setTimeout(anotar, 20e3); if (p.unref) p.unref();
}

// Un minuto: cuanta gente hay (si el juego no contesta, ese minuto queda sin dato)
async function anotar() {
  let e = null;
  try {
    const r = await fetch(interno() + '/interno/estado', { headers: { 'x-bacity-clave': clave() }, signal: AbortSignal.timeout(5000) });
    if (r.ok) e = await r.json();
  } catch { /* sin respuesta */ }
  if (!e || typeof e.jugadores !== 'number') return;
  const minuto = Math.floor(Date.now() / MIN);
  try {
    db.prepare('INSERT OR REPLACE INTO puente_capa2_minutos (minuto, jugadores, invitados) VALUES (?, ?, ?)')
      .run(minuto, Math.max(0, e.jugadores | 0), Math.max(0, e.invitados | 0));
    if (Date.now() - ultimaLimpieza > 3600e3) {
      ultimaLimpieza = Date.now();
      db.prepare('DELETE FROM puente_capa2_minutos WHERE minuto < ?').run(minuto - GUARDA_DIAS * 1440);
    }
  } catch (err) { warn('capa2-admin:', err.message); }
}

// Las series para los graficos (de lo anotado)
function serie() {
  if (!listo) return { horas: [], dias: [] };
  const ahora = Math.floor(Date.now() / MIN);
  // 24 h de a 10 minutos: el maximo de cada rato
  const desde = Math.floor((ahora - 1440) / 10) + 1, hasta = Math.floor(ahora / 10);
  const porRato = new Map();
  for (const r of db.prepare('SELECT minuto / 10 AS b, MAX(jugadores) AS m, MAX(invitados) AS i FROM puente_capa2_minutos WHERE minuto >= ? GROUP BY b').all(desde * 10)) porRato.set(r.b, r);
  const horas = [];
  for (let b = desde; b <= hasta; b++) { const r = porRato.get(b); horas.push({ t: b * 10 * MIN, max: r ? r.m : null, inv: r ? r.i : null }); }
  // 30 dias (de Argentina): el maximo a la vez, las horas jugadas (sumando a todos) y los minutos con gente
  const hoy = Math.floor((ahora - AR) / 1440), primero = hoy - 29;
  const porDia = new Map();
  // (AR va escrito en la consulta: como parametro llega como numero con decimales y la division deja de ser entera)
  for (const r of db.prepare('SELECT (minuto - ' + AR + ') / 1440 AS d, MAX(jugadores) AS m, SUM(jugadores) AS s, SUM(CASE WHEN jugadores > 0 THEN 1 ELSE 0 END) AS g FROM puente_capa2_minutos WHERE minuto >= ? GROUP BY d').all(primero * 1440 + AR)) porDia.set(r.d, r);
  const dias = [];
  for (let d = primero; d <= hoy; d++) {
    const r = porDia.get(d);
    dias.push({ dia: new Date(d * 86400e3).toISOString().slice(0, 10), max: r ? r.m : null, horas: r ? Math.round(r.s / 6) / 10 : null, conGente: r ? r.g : null });
  }
  return { horas, dias };
}

// Lo que manda el juego (se reusa unos segundos: varias pestañas abiertas no le piden de mas)
function delJuego() {
  if (clave().length < 24) return Promise.resolve({ d: null, error: 'Falta la clave de Capa 2 (BACITY_SECRETO).' });
  if (Date.now() - guardado.at < 5000 && guardado.d) return Promise.resolve({ d: guardado.d, error: null });
  if (!guardado.pidiendo) {
    guardado.pidiendo = fetch(interno() + '/interno/estadisticas', { headers: { 'x-bacity-clave': clave() }, signal: AbortSignal.timeout(6000) })
      .then(async (r) => (r.ok ? { d: await r.json(), error: null } : { d: null, error: 'Capa 2 contestó ' + r.status + '.' }))
      .catch((err) => ({ d: null, error: err && err.name === 'TimeoutError' ? 'Capa 2 tardó demasiado en contestar.' : 'Capa 2 no contesta.' }))
      .then((x) => { guardado = { at: x.d ? Date.now() : 0, d: x.d, pidiendo: null }; return x; });
  }
  return guardado.pidiendo;
}

async function handle(req, res, p, u, h) {
  if (p !== '/puente/api/capa2/estadisticas') return false;
  if (req.method !== 'GET') return h.json(res, 405, { error: 'metodo' });
  const user = h.sessionUser(req);
  if (!user) return h.json(res, 401, { error: 'sin sesion' });
  const a = db && db.prepare('SELECT is_admin FROM users WHERE id = ?').get(user.id);
  if (!a || !a.is_admin) return h.json(res, 403, { error: 'solo administradores' });
  const x = await delJuego();
  let s = { horas: [], dias: [] };
  try { s = serie(); } catch (err) { warn('capa2-admin: serie:', err.message); }
  return h.json(res, 200, { ok: true, ahora: Date.now(), capa2: x.d, error: x.error, serie: s });
}

module.exports = { setup, handle, _serie: serie, _anotar: anotar };
