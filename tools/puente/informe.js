// El informe semanal y las alertas por mail (parte del puente), para los administradores con el email
// confirmado (con el envio de email.js):
//
//  - Los lunes a partir de las 9 (hora de Argentina): el resumen escrito de los ultimos 7 dias, como el de
//    arriba de la pestaña "Estadisticas", y lo mas importante de lo demas.
//  - Todos los dias a las 10, mirando el dia anterior, un aviso si algo se cayo de golpe: nadie se registro
//    en dos dias (cuando suele haber), muchos mas errores que de costumbre, o mucha menos gente que entro.
//
// Cada envio se anota (puente_informe), asi no se repite aunque el servidor se reinicie.
// PUENTE_INFORME=0 lo apaga.

const AR = 3 * 3600 * 1000;
const DIA = 864e5;
let db = null, log = () => {}, warn = () => {}, publicUrl = '';

function setup(ctx) {
  ({ db, log, warn, publicUrl } = ctx);
  if (String(process.env.PUENTE_INFORME || '1').trim() === '0') return;
  db.exec('CREATE TABLE IF NOT EXISTS puente_informe (clave TEXT PRIMARY KEY, cuando INTEGER NOT NULL)');
  // La primera vez no manda nada el mismo dia: el primer informe sale el lunes que viene
  if (!db.prepare('SELECT 1 FROM puente_informe LIMIT 1').get()) {
    const hoy = ahoraAR().toISOString().slice(0, 10);
    marcar('semana:' + hoy); marcar('alertas:' + hoy);
  }
  setInterval(() => revisar().catch(err => warn('informe:', err.message)), 15 * 60 * 1000).unref();
  setTimeout(() => revisar().catch(err => warn('informe:', err.message)), 3 * 60 * 1000).unref();
}

const ahoraAR = () => new Date(Date.now() - AR);
const yaHecho = (clave) => !!db.prepare('SELECT 1 FROM puente_informe WHERE clave = ?').get(clave);
const marcar = (clave) => db.prepare('INSERT OR IGNORE INTO puente_informe (clave, cuando) VALUES (?, ?)').run(clave, Date.now());
const fmt = (n) => Number(n || 0).toLocaleString('es-AR');
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const dur = (min) => { min = Math.round(min || 0); const h = Math.floor(min / 60), r = min % 60; return h ? h + ' h' + (r ? ' ' + r + ' min' : '') : min + ' min'; };
const cambio = (act, ant) => { if (!ant) return ''; const p = Math.round(((act - ant) / ant) * 100); return p > 4 ? ` (${p}% más que la semana anterior)` : p < -4 ? ` (${Math.abs(p)}% menos que la semana anterior)` : ' (casi igual que la semana anterior)'; };

function admins() {
  try { return db.prepare('SELECT e.email FROM puente_emails e JOIN users u ON u.id = e.haven_user_id WHERE u.is_admin = 1 AND e.confirmado = 1').all().map(r => r.email); } catch { return []; }
}
async function mandar(asunto, titulo, parrafos) {
  const email = require('./email.js');
  if (!email.on()) return 0;
  let ok = 0;
  for (const a of admins()) if (await email.sendMail(a, asunto, titulo, parrafos, ['Abrir las estadísticas', (publicUrl || '') + '/app'], 'Te llega porque sos administrador de CV Chat.')) ok++;
  return ok;
}

// El resumen escrito, en frases (las mismas reglas que el de la pestaña "Estadisticas")
function frases(d, o) {
  const T = d.totales, out = [], x = d.extra || {};
  let p = `En los últimos 7 días llegaron ${fmt(T.nuevos[0])} personas nuevas${cambio(T.nuevos[0], T.nuevos[1])}`;
  const top = o && o.fuentes ? o.fuentes.filter(f => f.fuente !== 'Sin dato' && f.cuentas > 0).slice(0, 2) : [];
  if (top.length) p += `; la mayoría desde ${top[0].fuente} (${fmt(top[0].cuentas)})` + (top[1] ? ` y después ${top[1].fuente} (${fmt(top[1].cuentas)})` : '');
  out.push(p + '.');
  const E = Object.fromEntries(d.embudo || []);
  if (E['Se registraron']) out.push(`De ellas, el ${pct(E['Escribieron en CV Chat'], E['Se registraron'])}% escribió en CV Chat y el ${pct(E['Volvieron otro día'], E['Se registraron'])}% volvió otro día.`);
  p = `Entraron ${fmt(T.activos[0])} personas`;
  if (d.tiempo && d.tiempo.minutos[0]) {
    p += `; cada una pasó en promedio ${dur(d.tiempo.porDia[0])} por día que entró`;
    const sec = (d.tiempo.secciones || []).filter(s => s.nombre !== 'Panel de administradores').slice(0, 3).map(s => s.nombre);
    if (sec.length) p += ', sobre todo en ' + sec.join(', ').replace(/, ([^,]*)$/, ' y $1');
  }
  out.push(p + '.');
  const cv = T.cv[0], dc = T.dc[0];
  if (cv + dc) out.push(`Se escribieron ${fmt(cv + dc)} mensajes en los canales${cambio(cv + dc, T.cv[1] + T.dc[1])}; el ${pct(cv, cv + dc)}% desde CV Chat.`);
  if (d.canales && d.canales.length) out.push(`El canal más activo fue #${d.canales[0].nombre} (${fmt(d.canales[0].n)} mensajes).`);
  if (x.pegada && x.pegada.mau) out.push(`Cada día entra, en promedio, el ${x.pegada.pct}% de los que entraron en el mes (${fmt(x.pegada.dau)} de ${fmt(x.pegada.mau)}).`);
  if (x.enRiesgoTotal) out.push(`${fmt(x.enRiesgoTotal)} personas que venían seguido no entran hace más de 2 semanas (la lista está en Estadísticas).`);
  const m = x.medidas;
  if (m && m.erroresTotal) out.push(`Hubo ${fmt(m.erroresTotal)} ${m.erroresTotal === 1 ? 'error' : 'errores'} en los dispositivos de la gente` + (m.errores[0] ? `; el más repetido: "${m.errores[0].mensaje.slice(0, 80)}" (${fmt(m.errores[0].n)} ${m.errores[0].n === 1 ? 'vez' : 'veces'}).` : '.'));
  if (m && m.sinResultado && m.sinResultado.length) out.push('Búsquedas que no encontraron nada: ' + m.sinResultado.slice(0, 5).map(b => `"${b.termino}"`).join(', ') + '.');
  out.push(`Se jugaron ${fmt(T.partidas[0])} partidas y se publicaron ${fmt(T.publicaciones[0])} cosas en el Marketplace.`);
  return out;
}

async function revisar() {
  if (!db) return;
  const a = ahoraAR(), hoy = a.toISOString().slice(0, 10), hora = a.getUTCHours();
  // El informe de los lunes
  if (a.getUTCDay() === 1 && hora >= 9 && !yaHecho('semana:' + hoy)) {
    marcar('semana:' + hoy);
    const d = require('./panel-estadisticas.js').datos('7d');
    let o = null;
    try { o = require('./origenes.js').resumen('7d'); } catch { /* sin origenes */ }
    const n = await mandar('CV Chat: la semana en números', 'La semana en CV Chat', frases(d, o));
    log(`informe: el de la semana, a ${n} administrador(es)`);
  }
  // Las alertas, mirando el dia anterior
  if (hora >= 10 && !yaHecho('alertas:' + hoy)) {
    marcar('alertas:' + hoy);
    const avisos = alertas(hoy);
    if (avisos.length) {
      const n = await mandar('CV Chat: algo cambió de golpe', 'Algo para mirar', avisos.concat('Puede ser algo pasajero, pero conviene mirarlo.'));
      log(`informe: ${avisos.length} alerta(s), a ${n} administrador(es)`);
    }
  }
}

function alertas(hoy) {
  const out = [];
  const hoyMs = Date.parse(hoy + 'T00:00:00Z');
  const dia = (k) => new Date(hoyMs - k * DIA).toISOString().slice(0, 10);
  const ayer = dia(1);
  const q = (sql, ...x) => { try { return db.prepare(sql).get(...x); } catch { return null; } };
  // Registros: nadie en los ultimos 2 dias, cuando en las 2 semanas anteriores hubo al menos 1 por dia
  const altas = (desde, hasta) => (q("SELECT COUNT(*) n FROM users WHERE username != 'discord-historial' AND COALESCE(is_guest, 0) = 0 AND created_at >= ? AND created_at < ?",
    desde + ' 03:00:00', hasta + ' 03:00:00') || {}).n || 0;
  const ult2 = altas(dia(2), hoy), antes14 = altas(dia(16), dia(2));
  if (!ult2 && antes14 >= 14) out.push(`Nadie se creó una cuenta en los últimos 2 días, y en las 2 semanas anteriores hubo ${fmt(antes14)}. Conviene probar que el registro y el mail de confirmación anden.`);
  // Errores: el dia anterior, mas de 20 y mas del triple de lo de costumbre
  const err = (q('SELECT COALESCE(SUM(n), 0) n FROM puente_errores WHERE dia = ?', ayer) || {}).n || 0;
  const errAntes = (q('SELECT COALESCE(SUM(n), 0) n FROM puente_errores WHERE dia >= ? AND dia < ?', dia(8), ayer) || {}).n || 0;
  if (err > 20 && err > 3 * (errAntes / 7)) {
    const top = q('SELECT mensaje, SUM(n) n FROM puente_errores WHERE dia = ? GROUP BY firma ORDER BY n DESC LIMIT 1', ayer);
    out.push(`Ayer hubo ${fmt(err)} errores en los dispositivos de la gente (lo normal es unos ${fmt(Math.round(errAntes / 7))} por día)` + (top ? `; el más repetido: "${String(top.mensaje).slice(0, 100)}".` : '.'));
  }
  // Gente que entro: el dia anterior, menos de la mitad del promedio de los 14 dias anteriores (con datos)
  const act = (q('SELECT COUNT(*) n FROM puente_activos WHERE dia = ?', ayer) || {}).n || 0;
  const prev = q('SELECT COUNT(*) n, COUNT(DISTINCT dia) d FROM puente_activos WHERE dia >= ? AND dia < ?', dia(15), ayer) || { n: 0, d: 0 };
  if (prev.d >= 5) {
    const prom = prev.n / prev.d;
    if (prom >= 10 && act < prom / 2) out.push(`Ayer entraron ${fmt(act)} personas, menos de la mitad de lo normal (unas ${fmt(Math.round(prom))} por día).`);
  }
  return out;
}

module.exports = { setup, frases, alertas };
