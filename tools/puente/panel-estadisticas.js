// Estadisticas para los administradores (panel-estadisticas.js; la pestaña "Estadisticas" de la pagina "Miembros",
// web/aviso.js): nuevos miembros, el termometro de la mudanza (mensajes escritos desde CV Chat o
// desde Discord), mapa de horas, canales, el embudo de los nuevos, totales con su variacion,
// activos por dia y dispositivos.
//
// Con casi un millon de mensajes no se cuenta todo en cada pedido: un resumen por dia, hora y
// canal (puente_est) se arma de a 5.000 mensajes con pausas (asi nunca frena el servidor) y
// despues suma solo los nuevos cada 5 minutos. Las horas son las de Argentina (UTC-3).
// Quien estuvo conectado cada dia (puente_activos) se anota al conectarse.
//
//  GET /puente/api/estadisticas?rango=7d|4s|3m|1a   (solo administradores)

const RANGOS = { '7d': { dias: 7, paso: 'dia' }, '4s': { dias: 28, paso: 'dia' }, '3m': { dias: 91, paso: 'semana' }, '1a': { dias: 365, paso: 'mes' } };
const TANDA = 5000;
const AR = 3 * 3600 * 1000; // Argentina, UTC-3 todo el año

let db = null, warn = () => {}, log = () => {};
let corriendo = false, timer = null;
const cache = new Map();

// 'YYYY-MM-DD HH:MM:SS' (UTC, como lo guarda Haven) -> dia y hora de Argentina
function diaHora(s) {
  const t = Date.parse(String(s || '').replace(' ', 'T') + (String(s).endsWith('Z') ? '' : 'Z'));
  if (!Number.isFinite(t)) return null;
  const d = new Date(t - AR);
  return { dia: d.toISOString().slice(0, 10), hora: d.getUTCHours() };
}
const hoyAR = () => new Date(Date.now() - AR).toISOString().slice(0, 10);
const diaDeMs = (ms) => new Date(ms - AR).toISOString().slice(0, 10);

function setup(ctx) {
  ({ db, warn, log } = ctx);
  db.exec(`
    CREATE TABLE IF NOT EXISTS puente_est (
      dia TEXT NOT NULL, hora INTEGER NOT NULL, canal_id INTEGER NOT NULL, origen TEXT NOT NULL, n INTEGER NOT NULL,
      PRIMARY KEY (dia, hora, canal_id, origen)
    ) WITHOUT ROWID;
    CREATE TABLE IF NOT EXISTS puente_est_estado (clave TEXT PRIMARY KEY, valor INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS puente_activos (dia TEXT NOT NULL, user_id INTEGER NOT NULL, PRIMARY KEY (dia, user_id)) WITHOUT ROWID;
    -- Por persona (cuenta de Haven), mes y canal: para el "Ranking del mes" (actividad.js)
    CREATE TABLE IF NOT EXISTS puente_est_u (
      user_id INTEGER NOT NULL, mes TEXT NOT NULL, canal_id INTEGER NOT NULL, n INTEGER NOT NULL,
      PRIMARY KEY (user_id, mes, canal_id)
    ) WITHOUT ROWID;
  `);
  // Quien se conecto hoy
  const activo = db.prepare('INSERT OR IGNORE INTO puente_activos (dia, user_id) VALUES (?, ?)');
  if (ctx.io) ctx.io.on('connection', (socket) => {
    const id = socket.user && socket.user.id;
    if (id) { try { activo.run(hoyAR(), id); } catch { /* nada */ } }
  });
  timer = setTimeout(avanzar, 20 * 1000); // un rato despues de arrancar
}

// Los dos resumenes: cada uno con su propio contador (el numero del ultimo mensaje que ya sumo),
// asi uno nuevo arranca de cero aunque el otro ya este al dia
const RESUMENES = [
  { clave: 'ultimo', nombre: 'mensajes por dia y canal', sumar: (f, dh, suma) => {
    const origen = f.is_dm ? 'dm' : (f.dc || f.imported_from) ? 'dc' : 'cv';
    const k = dh.dia + '|' + dh.hora + '|' + (f.is_dm ? -1 : f.channel_id) + '|' + origen;
    suma.set(k, (suma.get(k) || 0) + 1);
  }, guardar: () => {
    const put = db.prepare('INSERT INTO puente_est (dia, hora, canal_id, origen, n) VALUES (?, ?, ?, ?, ?) ON CONFLICT(dia, hora, canal_id, origen) DO UPDATE SET n = n + excluded.n');
    return (k, n) => { const [dia, hora, canal, origen] = k.split('|'); put.run(dia, Number(hora), Number(canal), origen, n); };
  } },
  { clave: 'ultimo_u', nombre: 'mensajes por persona y mes', sumar: (f, dh, suma) => {
    if (f.is_dm) return; // los privados no cuentan para nada que vean otros
    const k = f.user_id + '|' + dh.dia.slice(0, 7) + '|' + f.channel_id;
    suma.set(k, (suma.get(k) || 0) + 1);
  }, guardar: () => {
    const put = db.prepare('INSERT INTO puente_est_u (user_id, mes, canal_id, n) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, mes, canal_id) DO UPDATE SET n = n + excluded.n');
    return (k, n) => { const [u, mes, canal] = k.split('|'); put.run(Number(u), mes, Number(canal), n); };
  } },
];
const armandoDe = new Set();
// Suma a un resumen la proxima tanda de mensajes (por numero de mensaje). Devuelve si quedan mas
function paso(r) {
  const desde = (db.prepare('SELECT valor FROM puente_est_estado WHERE clave = ?').get(r.clave) || { valor: 0 }).valor;
  const filas = db.prepare(`SELECT m.id, m.channel_id, m.created_at, m.user_id, m.is_webhook, m.imported_from, c.is_dm, (a.message_id IS NOT NULL) dc
                            FROM messages m LEFT JOIN channels c ON c.id = m.channel_id LEFT JOIN puente_autores a ON a.message_id = m.id
                            WHERE m.id > ? ORDER BY m.id LIMIT ?`).all(desde, TANDA);
  if (!filas.length) return false;
  const suma = new Map();
  for (const f of filas) {
    if (f.is_webhook || !f.user_id) continue; // bots, avisos del servidor
    const dh = diaHora(f.created_at);
    if (dh) r.sumar(f, dh, suma);
  }
  const put = r.guardar();
  db.transaction(() => {
    for (const [k, n] of suma) put(k, n);
    db.prepare('INSERT INTO puente_est_estado (clave, valor) VALUES (?, ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor').run(r.clave, filas[filas.length - 1].id);
  })();
  const lleno = filas.length === TANDA;
  if (lleno) armandoDe.add(r.clave);
  else if (armandoDe.delete(r.clave)) log('estadisticas: resumen de ' + r.nombre + ' al dia (hasta el mensaje ' + filas[filas.length - 1].id + ')');
  return lleno;
}
function avanzar() {
  if (corriendo || !db) return;
  corriendo = true;
  let lleno = false;
  for (const r of RESUMENES) {
    try { if (paso(r)) lleno = true; } catch (err) { warn('estadisticas (' + r.nombre + '):', err.message); }
  }
  corriendo = false;
  clearTimeout(timer);
  timer = setTimeout(avanzar, lleno ? 40 : 5 * 60 * 1000);
}

// Los periodos del grafico (dias, semanas que empiezan el lunes, o meses), del mas viejo al de hoy
function periodos(rango) {
  const r = RANGOS[rango];
  const hoy = new Date(hoyAR() + 'T00:00:00Z');
  const out = [];
  if (r.paso === 'dia') {
    for (let i = r.dias - 1; i >= 0; i--) { const d = new Date(hoy.getTime() - i * 864e5).toISOString().slice(0, 10); out.push({ desde: d, hasta: d, etiqueta: d }); }
  } else if (r.paso === 'semana') {
    const lunes = new Date(hoy.getTime() - ((hoy.getUTCDay() + 6) % 7) * 864e5);
    for (let i = 12; i >= 0; i--) {
      const a = new Date(lunes.getTime() - i * 7 * 864e5), b = new Date(a.getTime() + 6 * 864e5);
      out.push({ desde: a.toISOString().slice(0, 10), hasta: b.toISOString().slice(0, 10), etiqueta: a.toISOString().slice(0, 10) });
    }
  } else {
    for (let i = 11; i >= 0; i--) {
      const a = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() - i, 1)), b = new Date(Date.UTC(a.getUTCFullYear(), a.getUTCMonth() + 1, 0));
      out.push({ desde: a.toISOString().slice(0, 10), hasta: b.toISOString().slice(0, 10), etiqueta: a.toISOString().slice(0, 7) });
    }
  }
  return out;
}
const enPeriodo = (ps, dia) => { for (let i = 0; i < ps.length; i++) if (dia >= ps[i].desde && dia <= ps[i].hasta) return i; return -1; };

function calcular(rango) {
  const r = RANGOS[rango];
  const ps = periodos(rango);
  const ini = ps[0].desde, fin = hoyAR();
  // el periodo anterior, del mismo largo, para la variacion
  const largo = Math.round((Date.parse(fin) - Date.parse(ini)) / 864e5) + 1;
  const iniAnt = new Date(Date.parse(ini) - largo * 864e5).toISOString().slice(0, 10);
  const finAnt = new Date(Date.parse(ini) - 864e5).toISOString().slice(0, 10);
  const vacio = () => ps.map(() => 0);

  // Mensajes: por periodo y origen, mapa de horas, canales
  const serie = { cv: vacio(), dc: vacio(), dm: vacio() };
  const calor = Array.from({ length: 7 }, () => Array(24).fill(0)); // lunes..domingo x 0..23
  const canales = new Map();
  const tot = { cv: 0, dc: 0, dm: 0 }, totAnt = { cv: 0, dc: 0, dm: 0 };
  for (const f of db.prepare('SELECT dia, hora, canal_id, origen, n FROM puente_est WHERE dia >= ?').all(iniAnt)) {
    if (f.dia < ini) { if (f.dia <= finAnt) { totAnt[f.origen] += f.n; if (f.canal_id > 0) { const c = canales.get(f.canal_id) || { n: 0, ant: 0 }; c.ant += f.n; canales.set(f.canal_id, c); } } continue; }
    tot[f.origen] += f.n;
    const i = enPeriodo(ps, f.dia);
    if (i >= 0) serie[f.origen][i] += f.n;
    if (f.origen !== 'dm') {
      const dow = (new Date(f.dia + 'T00:00:00Z').getUTCDay() + 6) % 7;
      calor[dow][f.hora] += f.n;
    }
    if (f.canal_id > 0) { const c = canales.get(f.canal_id) || { n: 0, ant: 0 }; c.n += f.n; canales.set(f.canal_id, c); }
  }
  const nombres = new Map(db.prepare('SELECT id, name, code FROM channels WHERE is_dm = 0').all().map(c => [c.id, c]));
  const listaCanales = [...canales].filter(([id]) => nombres.has(id))
    .map(([id, c]) => ({ nombre: nombres.get(id).name, code: nombres.get(id).code, n: c.n, ant: c.ant }))
    .sort((a, b) => b.n - a.n);

  // Nuevos miembros
  const nuevos = vacio(); let nuevosTot = 0, nuevosAnt = 0;
  for (const u of db.prepare("SELECT created_at FROM users WHERE username != 'discord-historial' AND created_at >= ?").all(iniAnt + ' 00:00:00')) {
    const dh = diaHora(u.created_at); if (!dh) continue;
    if (dh.dia < ini) { if (dh.dia <= finAnt) nuevosAnt++; continue; }
    nuevosTot++; const i = enPeriodo(ps, dh.dia); if (i >= 0) nuevos[i]++;
  }

  // Activos (desde que se empezo a anotar)
  const activos = vacio();
  const porPeriodo = ps.map(() => new Set());
  let activosTot = new Set(), activosAnt = new Set();
  for (const a of db.prepare('SELECT dia, user_id FROM puente_activos WHERE dia >= ?').all(iniAnt)) {
    if (a.dia < ini) { if (a.dia <= finAnt) activosAnt.add(a.user_id); continue; }
    activosTot.add(a.user_id); const i = enPeriodo(ps, a.dia); if (i >= 0) porPeriodo[i].add(a.user_id);
  }
  porPeriodo.forEach((s, i) => { activos[i] = s.size; });
  const desdeActivos = (db.prepare('SELECT MIN(dia) d FROM puente_activos').get() || {}).d || null;

  // Reacciones, partidas y Marketplace (tablas chicas)
  const contar = (sql, a, b) => { try { return db.prepare(sql).get(a, b).n; } catch { return 0; } };
  const sqlIni = ini + ' 03:00:00', sqlFin = '9999-12-31 23:59:59', sqlIniAnt = iniAnt + ' 03:00:00';
  // Solo las reacciones a mensajes del mismo periodo: las del historial de Discord se cargaron todas
  // juntas al importarlo y tienen la fecha de la importacion
  const reac = (a, b) => { try { return db.prepare('SELECT COUNT(*) n FROM reactions r JOIN messages m ON m.id = r.message_id WHERE r.created_at >= ? AND r.created_at < ? AND m.created_at >= ?').get(a, b, a).n; } catch { return 0; } };
  const reacciones = reac(sqlIni, sqlFin);
  const reaccionesAnt = reac(sqlIniAnt, sqlIni);
  const msIni = Date.parse(ini + 'T03:00:00Z'), msIniAnt = Date.parse(iniAnt + 'T03:00:00Z');
  // (todos los juegos, con la tabla de partidas que dice cada uno; si una tabla no esta todavia, cuenta 0)
  let tablasPartidas = [];
  try { tablasPartidas = require('./juegos-registro.js').conChat().map(x => x.chat.partidas && x.chat.partidas.tabla).filter(Boolean); } catch { /* sin el registro */ }
  const partidasDe = (a, b) => tablasPartidas
    .reduce((s, t) => s + contar(`SELECT COUNT(*) n FROM ${t} WHERE fin >= ? AND fin < ?`, a, b), 0);
  const partidas = partidasDe(msIni, 9e15), partidasAnt = partidasDe(msIniAnt, msIni);
  const publicaciones = contar("SELECT COUNT(*) n FROM puente_mercado WHERE creado >= ? AND creado < ? AND IFNULL(origen, '') != 'foro'", msIni, 9e15);
  const publicacionesAnt = contar("SELECT COUNT(*) n FROM puente_mercado WHERE creado >= ? AND creado < ? AND IFNULL(origen, '') != 'foro'", msIniAnt, msIni);

  // Embudo de los que entraron en el periodo (con los datos de la pagina Miembros)
  let lista = [];
  try { lista = require('./vincular.js').members(); } catch { /* sin lista */ }
  const msIniDia = Date.parse(ini + 'T00:00:00Z') + AR;
  const nuevosLista = lista.filter(m => !m.invitado && m.desde && Date.parse(m.desde) >= msIniDia);
  const volvio = (m) => { const desde = Date.parse(m.desde); const ult = Math.max(m.visto ? Date.parse(m.visto) : 0, m.ultimo ? Date.parse(m.ultimo) : 0); return ult > desde + 864e5; };
  const embudo = [
    ['Se registraron', nuevosLista.length],
    ['Confirmaron el email', nuevosLista.filter(m => m.email === 'confirmado').length],
    ['Vincularon Discord', nuevosLista.filter(m => m.discord).length],
    ['Escribieron en CV Chat', nuevosLista.filter(m => m.mensajes > 0).length],
    ['Volvieron otro día', nuevosLista.filter(volvio).length],
  ];

  // Dispositivos: cuanta gente uso cada uno en el periodo (alguien con la app de PC y la de Android
  // cuenta en los dos; personasDispositivo es cuantas personas distintas, para los porcentajes)
  const dispositivos = {};
  let personasDispositivo = 0;
  let presencia = new Map();
  try { presencia = require('./presencia.js').todas(); } catch { /* sin presencia */ }
  for (const p of presencia.values()) {
    const usados = Object.entries(p.cuando || {}).filter(([, ms]) => ms >= msIniDia);
    if (usados.length) personasDispositivo++;
    for (const [k] of usados) dispositivos[k] = (dispositivos[k] || 0) + 1;
  }

  // Tiempo de uso (uso.js): cuanto, en que y cuanto por persona, contra el periodo anterior
  let tiempo = null;
  try {
    const U = require('./uso.js');
    const a = U.entre(ini, fin), b = U.entre(iniAnt, finAnt);
    // (el nombre de cada juego, de su ficha: los de las estadisticas, WORGS con sus dos modos)
    const juegos = {};
    for (const f of require('./juegos-registro.js').lista()) for (const e of f.estadisticas) juegos[e.id] = e.nombre;
    const nombreSec = (k) => k.startsWith('c:') ? (nombres.has(Number(k.slice(2))) ? '#' + nombres.get(Number(k.slice(2))).name : 'Otro canal')
      : k === 'dm' ? 'Mensajes privados' : k.startsWith('j:') ? (juegos[k.slice(2)] ? 'Juegos · ' + juegos[k.slice(2)] : 'Juegos (el menú)') : k === 'mercado' ? 'Marketplace'
        : k === 'foro' ? 'Foro' : k === 'miembros' ? 'Panel de administradores' : 'Otras pantallas';
    const secciones = new Map();
    for (const [k, s] of a.porSeccion) { const n = nombreSec(k); secciones.set(n, (secciones.get(n) || 0) + s); }
    const minutos = s => Math.round(s / 60);
    tiempo = {
      desde: U.medidoDesde(),
      minutos: [minutos(a.seg), minutos(b.seg)],
      personas: [a.porPersona.size, b.porPersona.size],
      // por persona y por dia en que la uso
      porDia: [a.personaDias ? Math.round(a.seg / a.personaDias / 60 * 10) / 10 : 0, b.personaDias ? Math.round(b.seg / b.personaDias / 60 * 10) / 10 : 0],
      visitas: [a.visitas, b.visitas],
      porVisita: [a.visitas ? Math.round(a.seg / a.visitas / 60 * 10) / 10 : 0, b.visitas ? Math.round(b.seg / b.visitas / 60 * 10) / 10 : 0],
      secciones: [...secciones].map(([nombre, s]) => ({ nombre, minutos: minutos(s) })).filter(x => x.minutos > 0).sort((x, y) => y.minutos - x.minutos).slice(0, 15),
    };
  } catch (err) { warn('estadisticas (tiempo):', err.message); }

  // Retencion: de los que llegaron cada semana, cuantos volvieron a entrar en las semanas siguientes.
  // Volver: conectarse (puente_activos) o, para los dias de antes de que se anotara, escribir en CV Chat
  // (esas semanas quedan como aproximadas: no cuentan a quien solo leyo)
  const retencion = [];
  const diasDe = new Map(); // persona -> dias (ms) en que se conecto o escribio en CV Chat
  try {
    const hoyMs = Date.parse(hoyAR() + 'T00:00:00Z');
    const lunesHoy = hoyMs - ((new Date(hoyMs).getUTCDay() + 6) % 7) * 864e5;
    const desdeAct = desdeActivos ? Date.parse(desdeActivos + 'T00:00:00Z') : hoyMs;
    const anotar = (uid, ms) => { if (!diasDe.has(uid)) diasDe.set(uid, []); diasDe.get(uid).push(ms); };
    for (const a of db.prepare('SELECT dia, user_id FROM puente_activos').all()) anotar(a.user_id, Date.parse(a.dia + 'T00:00:00Z'));
    for (const m of db.prepare(`SELECT m.user_id, m.created_at FROM messages m LEFT JOIN puente_autores pa ON pa.message_id = m.id
                                WHERE m.created_at >= ? AND m.user_id IS NOT NULL AND m.imported_from IS NULL AND COALESCE(m.is_webhook, 0) = 0 AND pa.message_id IS NULL
                                GROUP BY m.user_id, substr(m.created_at, 1, 13)`).all(new Date(lunesHoy - 9 * 7 * 864e5).toISOString().slice(0, 10))) {
      const dh = diaHora(m.created_at); if (dh) anotar(m.user_id, Date.parse(dh.dia + 'T00:00:00Z'));
    }
    const altas = db.prepare("SELECT id, created_at FROM users WHERE username != 'discord-historial' AND COALESCE(is_guest, 0) = 0 AND created_at >= ?")
      .all(new Date(lunesHoy - 8 * 7 * 864e5).toISOString().slice(0, 10) + ' 00:00:00');
    for (let w = 8; w >= 1; w--) {
      const ini = lunesHoy - w * 7 * 864e5;
      const grupo = altas.map(u => ({ id: u.id, dh: diaHora(u.created_at) })).filter(u => u.dh)
        .map(u => ({ id: u.id, ms: Date.parse(u.dh.dia + 'T00:00:00Z') })).filter(u => u.ms >= ini && u.ms < ini + 7 * 864e5);
      if (!grupo.length) continue;
      // semana k despues de la de su alta: dias [alta + 7k - 6, alta + 7k] (k = 1..4), si ya paso
      const semanas = [];
      for (let k = 1; k <= 4; k++) {
        if (ini + (k + 1) * 7 * 864e5 > hoyMs + 864e5) break;
        const vuelven = grupo.filter(u => (diasDe.get(u.id) || []).some(d => d > u.ms + (7 * (k - 1)) * 864e5 && d <= u.ms + 7 * k * 864e5)).length;
        semanas.push(Math.round((vuelven / grupo.length) * 100));
      }
      // aproximada si alguna de sus semanas cae antes de que se anotaran las conexiones
      retencion.push({ semana: new Date(ini).toISOString().slice(0, 10), personas: grupo.length, semanas, aprox: ini + 7 * 864e5 < desdeAct });
    }
  } catch (err) { warn('estadisticas (retencion):', err.message); }

  // ── Lo de mas: retencion segun de donde llegaron, quienes dejaron de venir, grupos, que tan pegada
  // es la comunidad, quien trajo a quien, que tipo de mensajes se escriben y medidas.js ──
  const extra = {};
  const r1 = (x) => Math.round(x * 10) / 10;
  try {
    const DIA = 864e5, hoyMs = Date.parse(hoyAR() + 'T00:00:00Z');
    const iniMs = Date.parse(ini + 'T00:00:00Z');
    const desdeAct = desdeActivos ? Date.parse(desdeActivos + 'T00:00:00Z') : hoyMs;
    const dias = (uid) => diasDe.get(uid) || [];
    const usuarios = db.prepare("SELECT id, username, COALESCE(display_name, username) nombre, avatar, created_at FROM users WHERE username != 'discord-historial' AND COALESCE(is_guest, 0) = 0").all();
    const creadoDe = new Map(usuarios.map(u => { const dh = diaHora(u.created_at); return [u.id, dh ? Date.parse(dh.dia + 'T00:00:00Z') : 0]; }));
    let origenes = new Map();
    try { origenes = require('./origenes.js').deCadaUno(); } catch { /* sin origenes */ }

    // Si vuelven, segun de donde llegaron: los que llegaron hace entre 8 y 56 dias
    const porFuente = new Map();
    for (const u of usuarios) {
      const c = creadoDe.get(u.id);
      if (!c || c > hoyMs - 8 * DIA || c < hoyMs - 56 * DIA) continue;
      const fu = (origenes.get(u.id) || {}).fuente || 'Sin dato';
      const x = porFuente.get(fu) || { fuente: fu, personas: 0, semana1: 0, siguen: 0 };
      x.personas++;
      const d = dias(u.id);
      if (d.some(t => t > c && t <= c + 7 * DIA)) x.semana1++;
      if (d.some(t => t > hoyMs - 14 * DIA)) x.siguen++;
      porFuente.set(fu, x);
    }
    extra.retencionOrigen = [...porFuente.values()].filter(x => x.personas >= 2)
      .map(x => ({ fuente: x.fuente, personas: x.personas, semana1: Math.round((x.semana1 / x.personas) * 100), siguen: Math.round((x.siguen / x.personas) * 100) }))
      .sort((a, b) => b.personas - a.personas);

    // Dejaron de venir: entraron al menos 3 dias entre hace 15 y 56 dias, y ninguno en los ultimos 14
    const riesgo = [];
    for (const u of usuarios) {
      const d = dias(u.id);
      if (!d.length) continue;
      const ult = Math.max(...d);
      if (ult > hoyMs - 14 * DIA) continue;
      const antes = new Set(d.filter(t => t > hoyMs - 56 * DIA)).size;
      if (antes < 3) continue;
      riesgo.push({ id: u.id, nombre: u.nombre, usuario: u.username, avatar: u.avatar || null, ultimo: new Date(ult).toISOString().slice(0, 10), dias: antes });
    }
    extra.enRiesgo = riesgo.sort((a, b) => b.dias - a.dias || (a.ultimo < b.ultimo ? 1 : -1)).slice(0, 40);
    extra.enRiesgoTotal = riesgo.length;

    // Grupos: los activos del periodo, por dispositivo, antiguedad y de donde llegaron
    const activosP = new Map();
    for (const [uid, d] of diasDe) { const n = new Set(d.filter(t => t >= iniMs && t <= hoyMs)).size; if (n && creadoDe.has(uid)) activosP.set(uid, n); }
    let segDe = new Map();
    try { segDe = require('./uso.js').entre(ini, fin).porPersona; } catch { /* sin medir */ }
    const msjDe = new Map(db.prepare(`SELECT m.user_id, COUNT(*) n FROM messages m LEFT JOIN puente_autores pa ON pa.message_id = m.id LEFT JOIN channels c ON c.id = m.channel_id
                                      WHERE m.created_at >= ? AND m.user_id IS NOT NULL AND m.imported_from IS NULL AND COALESCE(m.is_webhook, 0) = 0 AND pa.message_id IS NULL AND COALESCE(c.is_dm, 0) = 0
                                      GROUP BY m.user_id`).all(ini + ' 03:00:00').map(x => [x.user_id, x.n]));
    let pres = new Map();
    try { pres = require('./presencia.js').todas(); } catch { /* sin presencia */ }
    const grupos = new Map();
    const sumar = (g, tipo, uid) => {
      const x = grupos.get(g) || { grupo: g, tipo, personas: 0, dias: 0, seg: 0, msj: 0 };
      x.personas++; x.dias += activosP.get(uid); x.seg += segDe.get(uid) || 0; x.msj += msjDe.get(uid) || 0;
      grupos.set(g, x);
    };
    for (const uid of activosP.keys()) {
      const p = pres.get(uid);
      for (const [k, ms] of Object.entries((p && p.cuando) || {})) if (ms >= msIniDia) sumar(k, 'dispositivo', uid);
      sumar(creadoDe.get(uid) > hoyMs - 30 * DIA ? 'Nuevos (menos de 30 días)' : 'Veteranos (más de 30 días)', 'antiguedad', uid);
      const fu = (origenes.get(uid) || {}).fuente;
      if (fu) sumar('Llegaron desde ' + fu, 'origen', uid);
    }
    const deOrigen = [...grupos.values()].filter(g => g.tipo === 'origen').sort((a, b) => b.personas - a.personas).slice(0, 4);
    extra.grupos = [...grupos.values()].filter(g => g.tipo !== 'origen').concat(deOrigen).filter(g => g.personas >= 3)
      .map(g => ({ grupo: g.grupo, tipo: g.tipo, personas: g.personas, dias: r1(g.dias / g.personas), minutos: g.dias ? r1(g.seg / 60 / g.dias) : 0, mensajes: r1(g.msj / g.personas) }));

    // Que tan pegada es: promedio de activos por dia sobre los activos del mes (DAU/MAU), y cuantos dias
    // de la ultima semana entro cada uno de los que entraron (con los dias desde que se anotan las conexiones)
    const desdeP = Math.max(desdeAct, hoyMs - 29 * DIA);
    const porDia = new Map(), mes = new Set();
    for (const [uid, d] of diasDe) for (const t of new Set(d)) if (t >= desdeP && t <= hoyMs) { mes.add(uid); porDia.set(t, (porDia.get(t) || 0) + 1); }
    const nDias = Math.max(1, Math.round((hoyMs - desdeP) / DIA) + 1);
    const dau = [...porDia.values()].reduce((a, b) => a + b, 0) / nDias;
    const semana = [0, 0, 0, 0, 0, 0, 0];
    for (const [, d] of diasDe) { const n = new Set(d.filter(t => t > hoyMs - 7 * DIA && t <= hoyMs)).size; if (n) semana[Math.min(7, n) - 1]++; }
    extra.pegada = { dau: r1(dau), mau: mes.size, pct: mes.size ? Math.round((dau / mes.size) * 100) : 0, dias: nDias, semana };

    // Quien trajo a quien: las invitaciones y los enlaces ?invita=, y cuantos de esos siguen viniendo
    const traidos = new Map();
    const anotarInv = (quien, uid) => { if (!quien || !uid) return; if (!traidos.has(quien)) traidos.set(quien, new Set()); traidos.get(quien).add(uid); };
    try { for (const x of db.prepare('SELECT invita_id, invitado_id FROM puente_invitaciones').all()) anotarInv(x.invita_id, x.invitado_id); } catch { /* sin la tabla */ }
    const porUsuario = new Map(usuarios.map(u => [u.username.toLowerCase(), u.id]));
    for (const [uid, o] of origenes) if (o && o.fuente === 'Invitación' && o.detalle) anotarInv(porUsuario.get(String(o.detalle).replace(/^@/, '').toLowerCase()), uid);
    const nombreDe = new Map(usuarios.map(u => [u.id, u]));
    extra.invitadores = [...traidos].filter(([id]) => nombreDe.has(id)).map(([id, set]) => ({
      id, nombre: nombreDe.get(id).nombre, usuario: nombreDe.get(id).username, trajo: set.size,
      siguen: [...set].filter(uid => dias(uid).some(t => t > hoyMs - 14 * DIA)).length,
    })).sort((a, b) => b.siguen - a.siguen || b.trajo - a.trajo).slice(0, 20);

    // Que tipo de mensajes se escriben en los canales desde CV Chat
    const t = db.prepare(`SELECT COUNT(*) total, SUM(m.reply_to IS NOT NULL) respuestas, SUM(m.content LIKE '%/uploads/%') archivos, SUM(m.poll_data IS NOT NULL) encuestas,
                                 SUM(m.content LIKE '%tenor.com%' OR m.content LIKE '%giphy.com%') gifs, SUM(m.content LIKE '%http%') enlaces
                          FROM messages m LEFT JOIN puente_autores pa ON pa.message_id = m.id LEFT JOIN channels c ON c.id = m.channel_id
                          WHERE m.created_at >= ? AND m.user_id IS NOT NULL AND m.imported_from IS NULL AND COALESCE(m.is_webhook, 0) = 0 AND pa.message_id IS NULL AND COALESCE(c.is_dm, 0) = 0`).get(ini + ' 03:00:00');
    extra.tipos = t;

    // Llegadas desde los mails y las notificaciones (las visitas con esa etiqueta)
    const vis = (fu) => (db.prepare('SELECT COALESCE(SUM(n), 0) n FROM puente_origen_visitas WHERE fuente = ? AND dia >= ?').get(fu, ini) || {}).n || 0;
    extra.desdeMail = vis('Email');
    extra.desdeNotificacion = (db.prepare("SELECT COALESCE(SUM(n), 0) n FROM puente_contadores WHERE clave = 'notificacion' AND dia >= ?").get(ini) || {}).n || 0;
  } catch (err) { warn('estadisticas (extra):', err.message); }
  try { extra.medidas = require('./medidas.js').datos(ini, fin, iniAnt, finAnt); } catch (err) { warn('estadisticas (medidas):', err.message); }

  return {
    rango, desde: ini, hasta: fin, paso: r.paso, tiempo, retencion, extra,
    etiquetas: ps.map(p => p.etiqueta),
    serie: { nuevos, cv: serie.cv, dc: serie.dc, dm: serie.dm, activos },
    totales: {
      nuevos: [nuevosTot, nuevosAnt], cv: [tot.cv, totAnt.cv], dc: [tot.dc, totAnt.dc], dm: [tot.dm, totAnt.dm],
      reacciones: [reacciones, reaccionesAnt], partidas: [partidas, partidasAnt], publicaciones: [publicaciones, publicacionesAnt],
      activos: [activosTot.size, activosAnt.size],
    },
    calor, canales: listaCanales.slice(0, 25), embudo, dispositivos, personasDispositivo,
    activosDesde: desdeActivos,
    resumenListo: resumenListo(),
  };
}
// El resumen de mensajes ya llego (casi) hasta el ultimo mensaje
function resumenListo() {
  const hecho = (db.prepare("SELECT valor FROM puente_est_estado WHERE clave = 'ultimo'").get() || { valor: 0 }).valor;
  const ultimo = (db.prepare('SELECT MAX(id) m FROM messages').get() || { m: 0 }).m || 0;
  return hecho > 0 && hecho >= ultimo - TANDA * 2;
}

async function handle(req, res, p, u, h) {
  if (p !== '/puente/api/estadisticas') return false;
  if (req.method !== 'GET') return h.json(res, 405, { error: 'metodo' });
  const user = h.sessionUser(req);
  if (!user) return h.json(res, 401, { error: 'sin sesion' });
  const admin = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(user.id);
  if (!admin || !admin.is_admin) return h.json(res, 403, { error: 'solo administradores' });
  const rango = RANGOS[u.searchParams.get('rango')] ? u.searchParams.get('rango') : '4s';
  const c = cache.get(rango);
  if (c && Date.now() - c.at < 5 * 60 * 1000) return h.json(res, 200, c.datos);
  let datos;
  try { datos = calcular(rango); } catch (err) { warn('estadisticas:', err.message); return h.json(res, 500, { error: 'No se pudieron calcular las estadísticas.' }); }
  cache.set(rango, { at: Date.now(), datos });
  return h.json(res, 200, datos);
}

// Para el informe semanal y las alertas (informe.js): los mismos datos, con el mismo cache
function datos(rango) {
  const c = cache.get(rango);
  if (c && Date.now() - c.at < 5 * 60 * 1000) return c.datos;
  const d = calcular(rango);
  cache.set(rango, { at: Date.now(), datos: d });
  return d;
}

module.exports = { setup, handle, datos };
