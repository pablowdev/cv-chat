// Las tarjetas de acciones, cripto, monedas y dolar en los mensajes: quien escribe $UMAC, $BTC, $BLUE o $DÓLAR ve
// debajo del mensaje una tarjeta con el precio y un graficito (las arma web/aviso.js; los datos salen de aca).
//
//  - El precio es el del momento del mensaje, el mismo para todos aunque lo lean dias despues. Lo que se pide en los
//    primeros minutos (lo pide el que lo escribe, al mandarlo) se guarda tal cual (puente_cotiza_fotos); si no, sale
//    de la historia: la barra de ese momento (acciones, cripto, monedas) o el valor de ese dia (el dolar).
//  - El grafico es del periodo elegido, hasta ese momento: 1D (la rueda de ese dia; 24 horas en cripto y monedas),
//    1S, 1M y 1A. El dolar: 1S, 1M, 6M y 1A (hay un dato por dia).
//  - Fuentes gratis y sin clave: Yahoo Finanzas (acciones, ETF, cripto y monedas), DolarApi (el dolar de ahora) y
//    ArgentinaDatos (la historia del dolar). Se guarda en memoria lo que se trae, para no pedir lo mismo dos veces.
//
//  GET /puente/api/cotiza?s=UMAC,BTC&t=<ms del mensaje>&p=<periodo>&m=<id del mensaje>   (con sesion; hasta 3)
//   -> { cartas: { UMAC: {...}, BTC: null } }   (null: no existe; { falla: true }: la fuente no contesto)
//   -> { cartas: {}, quitada: true }   (a ese mensaje le quitaron la vista previa)

let db = null, log = () => {}, warn = () => {};
const DIA = 864e5, RECIENTE = 5 * 60e3, AR = 'America/Argentina/Buenos_Aires';
const YH = 'https://query1.finance.yahoo.com/v8/finance/chart/';
const YH_BUSCAR = 'https://query2.finance.yahoo.com/v1/finance/search?quotesCount=6&newsCount=0&q=';
const DOLARAPI = 'https://dolarapi.com/v1/dolares';
const ARGDATOS = 'https://api.argentinadatos.com/v1/cotizaciones/dolares/';

// ── Los simbolos ──
// El dolar (DolarApi + ArgentinaDatos): simbolo -> [casa, nombre]
const DOLARES = {
  BLUE: ['blue', 'Dólar blue'], MEP: ['bolsa', 'Dólar MEP'], CCL: ['contadoconliqui', 'Dólar contado con liqui'],
  OFICIAL: ['oficial', 'Dólar oficial'], USDARS: ['oficial', 'Dólar oficial'], ARSUSD: ['oficial', 'Dólar oficial'],
  MAYORISTA: ['mayorista', 'Dólar mayorista'], TARJETA: ['tarjeta', 'Dólar tarjeta'], CRIPTO: ['cripto', 'Dólar cripto'],
};
const TABLA = new Set(['DOLAR', 'DOLARES']); // $DÓLAR: todos juntos
const FILAS = [['oficial', 'Oficial'], ['blue', 'Blue'], ['bolsa', 'MEP'], ['contadoconliqui', 'CCL'], ['cripto', 'Cripto'], ['tarjeta', 'Tarjeta'], ['mayorista', 'Mayorista']];
// Las monedas (Yahoo): pesos por cada una, como se dice aca; y los pares de dos monedas ($EURUSD)
const DIVISAS = new Set(['USD', 'EUR', 'BRL', 'ARS', 'GBP', 'JPY', 'CHF', 'CLP', 'UYU', 'MXN', 'CNY', 'CAD', 'AUD', 'COP', 'PEN', 'PYG', 'BOB']);
const NOMBRE_DIVISA = { USD: 'Dólar', EUR: 'Euro', BRL: 'Real', GBP: 'Libra', JPY: 'Yen', CHF: 'Franco suizo', CLP: 'Peso chileno', UYU: 'Peso uruguayo', MXN: 'Peso mexicano', CNY: 'Yuan', CAD: 'Dólar canadiense', AUD: 'Dólar australiano', COP: 'Peso colombiano', PEN: 'Sol', PYG: 'Guaraní', BOB: 'Boliviano', ARS: 'Peso' };
// Las cripto conocidas van antes que una accion con el mismo simbolo ($BTC tambien es un ETF)
const CRIPTO = new Set(['BTC', 'ETH', 'SOL', 'XRP', 'DOGE', 'ADA', 'BNB', 'USDT', 'USDC', 'TRX', 'DOT', 'AVAX', 'LINK', 'LTC', 'SHIB', 'TON',
  'XLM', 'BCH', 'ATOM', 'UNI', 'NEAR', 'APT', 'ARB', 'OP', 'PEPE', 'SUI', 'HBAR', 'POL', 'MATIC', 'ETC', 'FIL', 'ICP', 'AAVE', 'XMR', 'ALGO',
  'VET', 'SAND', 'MANA', 'AXS', 'CRO', 'KAS', 'TAO', 'WIF', 'BONK', 'FET', 'RENDER', 'INJ', 'SEI', 'TIA', 'STX', 'IMX', 'GRT', 'LDO', 'DAI',
  'WLD', 'JUP', 'ENA', 'ONDO', 'HYPE', 'TRUMP']);
const NADA = new Set(['USD', 'ARS', 'US', 'AR']); // ($USD 100, $ARS: no)
const sinTildes = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
// el simbolo tal como se busca: DÓLAR -> DOLAR, mayusculas; null si no sirve
function normal(s) {
  const x = sinTildes(String(s || '').trim()).toUpperCase();
  if (!/^[A-Z][A-Z0-9]{0,9}(?:[.\-=][A-Z]{1,4})?$/.test(x) || NADA.has(x)) return null;
  return x;
}

// ── Pedir afuera: con limite de tiempo, de a pocos a la vez y sin repetir lo que ya esta en camino ──
const memo = new Map(); // url -> { vence, datos }
const enCamino = new Map();
let activos = 0; const cola = [];
const turno = () => new Promise((ok) => { if (activos < 4) { activos++; ok(); } else cola.push(ok); });
const listo = () => { const sig = cola.shift(); if (sig) sig(); else activos--; };
async function traer(url, ttl) {
  const m = memo.get(url);
  if (m && m.vence > Date.now()) return m.datos;
  if (enCamino.has(url)) return enCamino.get(url);
  const p = (async () => {
    await turno();
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (CV Chat)', Accept: 'application/json' }, signal: AbortSignal.timeout(9000) });
      // (404 de Yahoo: el simbolo no existe; eso tambien se recuerda)
      const datos = r.ok || r.status === 404 ? await r.json().catch(() => null) : null;
      if (!r.ok && r.status !== 404) throw new Error('HTTP ' + r.status);
      memo.set(url, { vence: Date.now() + ttl, datos });
      if (memo.size > 600) for (const k of [...memo.keys()].slice(0, 150)) memo.delete(k);
      return datos;
    } finally { listo(); enCamino.delete(url); }
  })();
  enCamino.set(url, p);
  return p;
}

// ── Las fotos: el precio de un mensaje en el momento en que se mando ──
function foto(sim, t) {
  const s = Math.floor(t / 1000);
  // (el que lo escribio puede tener la hora con milisegundos y el resto sin: un segundo para cada lado)
  const r = db.prepare('SELECT precio, compra, extra FROM puente_cotiza_fotos WHERE clave IN (?, ?, ?) LIMIT 1').get(sim + '|' + s, sim + '|' + (s - 1), sim + '|' + (s + 1));
  return r || null;
}
function guardarFoto(sim, t, f) {
  try { db.prepare('INSERT OR IGNORE INTO puente_cotiza_fotos (clave, precio, compra, extra, creado) VALUES (?, ?, ?, ?, ?)').run(sim + '|' + Math.floor(t / 1000), f.precio == null ? null : f.precio, f.compra == null ? null : f.compra, f.extra == null ? null : f.extra, Date.now()); } catch (err) { warn('cotiza: foto:', err.message); }
}
const reciente = (t) => Math.abs(Date.now() - t) <= RECIENTE;

// ── Fechas ──
const fmtFechas = new Map();
function fechaEn(t, tz) { // 'YYYY-MM-DD' en esa zona
  let f = fmtFechas.get(tz);
  if (!f) { f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }); fmtFechas.set(tz, f); }
  return f.format(new Date(t));
}
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
function diaCorto(fecha) { const d = new Date(fecha + 'T12:00:00Z'); return DIAS[d.getUTCDay()] + ' ' + fecha.slice(8, 10) + '/' + fecha.slice(5, 7); }
// (hasta 180 puntos: alcanza para un grafico chico y la respuesta queda liviana; el ultimo siempre esta)
function reducir(p, max = 180) {
  if (p.length <= max) return p;
  const out = [], paso = (p.length - 1) / (max - 1);
  for (let i = 0; i < max - 1; i++) out.push(p[Math.round(i * paso)]);
  out.push(p[p.length - 1]);
  return out;
}

// ── Yahoo: que es cada simbolo y sus velas ──
const TIPOS = { EQUITY: ['accion', 'Acción'], ETF: ['etf', 'ETF'], MUTUALFUND: ['fondo', 'Fondo'], CRYPTOCURRENCY: ['cripto', 'Cripto'], CURRENCY: ['moneda', 'Moneda'], INDEX: ['indice', 'Índice'], FUTURE: ['futuro', 'Futuro'] };
function limpiarNombre(n) {
  let s = String(n || '').trim();
  for (let i = 0; i < 2; i++) s = s.replace(/,?\s+(Inc\.?|Incorporated|Corp\.?|Corporation|Ltd\.?|Limited|S\.A\.?(?:\s?de\s?C\.V\.)?|S\.A\.B\.?|plc|N\.V\.?|AG|SE|Co\.?|Company|Holdings?|Group)$/i, '').trim();
  return s.replace(/\s+USD$/, '').trim();
}
async function velas(sym, desde, hasta, intervalo) {
  const ttl = hasta > Date.now() - 10 * 60e3 ? 60e3 : 6 * 3600e3;
  // (las dos puntas redondeadas al minuto: los mensajes de un mismo minuto usan lo mismo)
  const url = YH + encodeURIComponent(sym) + '?period1=' + Math.floor(desde / 60e3) * 60 + '&period2=' + Math.ceil(hasta / 60e3) * 60 + '&interval=' + intervalo + '&includePrePost=false&events=';
  const d = await traer(url, ttl);
  const r = d && d.chart && d.chart.result && d.chart.result[0];
  if (!r || !r.meta) return null;
  const ts = r.timestamp || [], q = (r.indicators && r.indicators.quote && r.indicators.quote[0]) || {}, cl = q.close || [];
  const puntos = [];
  for (let i = 0; i < ts.length; i++) { const v = cl[i], tt = ts[i] * 1000; if (v != null && isFinite(v) && tt >= desde - 60e3 && tt <= hasta) puntos.push([tt, v]); }
  return { meta: r.meta, puntos };
}
// que es un simbolo de Yahoo (con datos de verdad), o null
async function probar(sym) {
  const d = await traer(YH + encodeURIComponent(sym) + '?range=5d&interval=1d', 6 * 3600e3);
  const r = d && d.chart && d.chart.result && d.chart.result[0];
  if (!r || !r.meta || !isFinite(r.meta.regularMarketPrice) || !(r.timestamp || []).length) return null;
  const m = r.meta, tipo = TIPOS[m.instrumentType] || ['accion', 'Acción'];
  return { y: sym, tipo: tipo[0], tipoTxt: tipo[1], nombre: limpiarNombre(m.longName || m.shortName || sym), bolsa: m.fullExchangeName || m.exchangeName || '', moneda: m.currency || 'USD', tz: m.exchangeTimezoneName || 'America/New_York', h24: tipo[0] === 'cripto' || tipo[0] === 'moneda' };
}
async function probarCripto(s) {
  const a = await probar(s + '-USD');
  if (a) return a;
  // (algunas tienen numero: SUI20947-USD)
  const d = await traer(YH_BUSCAR + encodeURIComponent(s), 24 * 3600e3);
  const q = ((d && d.quotes) || []).find((x) => x.quoteType === 'CRYPTOCURRENCY' && new RegExp('^' + s + '\\d*-USD$').test(String(x.symbol || '')));
  return q ? probar(q.symbol) : null;
}
const resueltos = new Map(); // sim -> { vence, info }
async function resolver(sim) {
  const r = resueltos.get(sim);
  if (r && r.vence > Date.now()) return r.info;
  let info = null;
  const par = /^([A-Z]{3})([A-Z]{3})$/.exec(sim);
  if (par && DIVISAS.has(par[1]) && DIVISAS.has(par[2]) && par[1] !== par[2]) {
    // pesos por cada moneda ($EURARS o $ARSEUR); otro par, como se escribe ($EURUSD)
    const [a, b] = par[2] === 'ARS' || par[1] !== 'ARS' ? [par[1], par[2]] : [par[2], par[1]];
    info = await probar(a + b + '=X');
    if (info) { info.nombre = NOMBRE_DIVISA[a] + ' en ' + (b === 'ARS' ? 'pesos' : b === 'USD' ? 'dólares' : (NOMBRE_DIVISA[b] || b).toLowerCase()); info.tipoTxt = 'Moneda'; }
  } else if (DIVISAS.has(sim) && sim !== 'USD' && sim !== 'ARS') {
    info = await probar(sim + 'ARS=X'); // $EUR: el euro en pesos
    if (info) { info.nombre = NOMBRE_DIVISA[sim] + ' en pesos'; info.tipoTxt = 'Moneda'; }
  } else {
    if (CRIPTO.has(sim)) info = await probarCripto(sim);
    if (!info) info = await probar(sim);
    if (!info && !CRIPTO.has(sim) && /^[A-Z0-9]{2,10}$/.test(sim)) info = await probarCripto(sim);
  }
  resueltos.set(sim, { vence: Date.now() + (info ? 24 * 3600e3 : 3600e3), info });
  if (resueltos.size > 3000) resueltos.clear();
  return info;
}

const PERIODOS = { y: ['1D', '1S', '1M', '1A'], dolar: ['1S', '1M', '6M', '1A'] };
const DURA = { '1D': DIA, '1S': 7 * DIA, '1M': 30 * DIA, '6M': 182 * DIA, '1A': 365 * DIA };
const ETIQ = { '1S': 'en 1 semana', '1M': 'en 1 mes', '6M': 'en 6 meses', '1A': 'en 1 año' };
const HACE = { '1S': 'hace 1 semana', '1M': 'hace 1 mes', '6M': 'hace 6 meses', '1A': 'hace 1 año' };
// la serie de un periodo hasta t (y su referencia: el cierre anterior o el principio del periodo)
async function serieYahoo(info, t, p) {
  const edad = Date.now() - t;
  if (p === '1D' && !info.h24) {
    // la rueda de ese dia (o la ultima antes): de a 5 minutos; la referencia, el cierre de la anterior
    const iv = edad < 50 * DIA ? '5m' : edad < 650 * DIA ? '1h' : null;
    if (!iv) return null;
    const v = await velas(info.y, t - 6 * DIA, t, iv);
    if (!v || !v.puntos.length) return null;
    const dia = fechaEn(v.puntos[v.puntos.length - 1][0], info.tz);
    const hoy = v.puntos.filter((q) => fechaEn(q[0], info.tz) === dia), antes = v.puntos.filter((q) => fechaEn(q[0], info.tz) < dia);
    const ref = antes.length ? antes[antes.length - 1][1] : v.meta.chartPreviousClose;
    if (hoy.length < 2 || !isFinite(ref)) return null;
    return { meta: v.meta, puntos: hoy, ref, etiqueta: diaCorto(dia), refTxt: 'cierre anterior' };
  }
  const iv = p === '1A' ? '1d' : p === '1D' ? (edad < 50 * DIA ? '15m' : edad < 650 * DIA ? '1h' : null) : (edad < 650 * DIA ? '1h' : '1d');
  if (!iv) return null;
  const v = await velas(info.y, t - DURA[p], t, iv);
  if (!v || v.puntos.length < 2) return null;
  return { meta: v.meta, puntos: v.puntos, ref: v.puntos[0][1], etiqueta: p === '1D' ? 'en 24 h' : ETIQ[p], refTxt: p === '1D' ? 'hace 24 h' : HACE[p] };
}
async function cartaYahoo(sim, info, t, p) {
  if (!PERIODOS.y.includes(p)) p = '1D';
  const s = await serieYahoo(info, t, p);
  if (!s) return p === '1D' ? null : { sim, sinDatos: true, periodo: p };
  // el precio del momento del mensaje: la foto, o el de ahora (y se guarda), o el ultimo de la historia hasta ahi
  let precio = null;
  const f = foto(sim, t);
  if (f && isFinite(f.precio)) precio = f.precio;
  else if (reciente(t) && isFinite(s.meta.regularMarketPrice)) { precio = s.meta.regularMarketPrice; guardarFoto(sim, t, { precio }); }
  else {
    const fino = p === '1D' ? s : await serieYahoo(info, t, '1D').catch(() => null);
    precio = (fino || s).puntos[(fino || s).puntos.length - 1][1];
  }
  const puntos = s.puntos.slice();
  puntos[puntos.length - 1] = [puntos[puntos.length - 1][0], precio];
  return {
    sim, tipo: info.tipo, sitio: info.tipo === 'cripto' ? 'Cripto' : info.tipo === 'moneda' ? 'Moneda' : info.tipoTxt + (info.bolsa ? ' · ' + info.bolsa : ''),
    nombre: info.nombre, moneda: info.moneda, precio, ref: s.ref, etiqueta: s.etiqueta, refTxt: s.refTxt,
    periodo: p, periodos: PERIODOS.y, serie: reducir(puntos), fuente: 'Yahoo Finanzas', url: 'https://finance.yahoo.com/quote/' + encodeURIComponent(info.y),
  };
}

// ── El dolar: el de ahora (DolarApi) y su historia, un dato por dia (ArgentinaDatos) ──
async function dolarAhora() {
  const d = await traer(DOLARAPI, 60e3);
  return Array.isArray(d) ? d : null;
}
const historias = new Map(); // casa -> { vence, filas: [[fecha, compra, venta]] }
async function historia(casa) {
  const h = historias.get(casa);
  if (h && h.vence > Date.now()) return h.filas;
  const d = await traer(ARGDATOS + casa, 30 * 60e3);
  if (!Array.isArray(d)) return h ? h.filas : null;
  const filas = d.filter((x) => x && typeof x.fecha === 'string' && isFinite(x.venta)).map((x) => [x.fecha, isFinite(x.compra) ? x.compra : null, x.venta]).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  historias.set(casa, { vence: Date.now() + 30 * 60e3, filas });
  memo.delete(ARGDATOS + casa); // (ya esta aca, mas chico)
  return filas;
}
// la ultima fila con fecha <= f (o < f)
function filaHasta(filas, f, estricto) {
  let lo = 0, hi = filas.length - 1, r = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (estricto ? filas[m][0] < f : filas[m][0] <= f) { r = m; lo = m + 1; } else hi = m - 1; }
  return r;
}
// el dolar de una casa en el momento t: { compra, venta } (la foto, el de ahora o el de ese dia)
async function dolarEn(sim, casa, t) {
  const f = foto(sim, t);
  if (f && isFinite(f.precio)) return { compra: f.compra, venta: f.precio };
  if (reciente(t)) {
    const a = await dolarAhora(), x = a && a.find((y) => y.casa === casa);
    if (x && isFinite(x.venta)) {
      const r = { compra: casa === 'tarjeta' || !isFinite(x.compra) ? null : x.compra, venta: x.venta };
      guardarFoto(sim, t, { precio: r.venta, compra: r.compra });
      return r;
    }
  }
  const filas = await historia(casa);
  if (!filas) return null;
  const i = filaHasta(filas, fechaEn(t, AR));
  return i < 0 ? null : { compra: casa === 'tarjeta' ? null : filas[i][1], venta: filas[i][2] };
}
async function cartaDolar(sim, casa, nombre, t, p) {
  if (!PERIODOS.dolar.includes(p)) p = '1M';
  const [ahora, filas] = await Promise.all([dolarEn(sim, casa, t), historia(casa)]);
  if (!ahora || !filas) return null;
  const hasta = fechaEn(t, AR), desde = fechaEn(t - DURA[p], AR);
  const puntos = filas.filter((x) => x[0] >= desde && x[0] < hasta).map((x) => [Date.parse(x[0] + 'T12:00:00-03:00'), x[2]]);
  puntos.push([t, ahora.venta]);
  if (puntos.length < 2) return { sim, sinDatos: true, periodo: p };
  return {
    sim, tipo: 'dolar', sitio: 'Dólar · Argentina', nombre, moneda: 'ARS', precio: ahora.venta, compra: ahora.compra,
    ref: puntos[0][1], etiqueta: ETIQ[p], refTxt: HACE[p], periodo: p, periodos: PERIODOS.dolar, serie: reducir(puntos), fuente: 'DolarApi', url: null,
  };
}
// $DÓLAR: todos, con lo que cambio la venta en el dia (contra el ultimo dia anterior con dato)
async function tablaDolar(t) {
  const f = foto('DOLAR', t);
  if (f && f.extra) { try { return JSON.parse(f.extra); } catch { /* se arma de nuevo */ } }
  const hoyAr = fechaEn(t, AR);
  let filas = null, cuando = t;
  if (reciente(t)) {
    const a = await dolarAhora();
    if (a) {
      filas = []; cuando = 0;
      for (const [casa, nombre] of FILAS) {
        const x = a.find((y) => y.casa === casa);
        if (!x || !isFinite(x.venta)) continue;
        // (contra el ultimo dato de antes de hoy: un sabado, el oficial muestra lo que se movio el viernes)
        const h = await historia(casa).catch(() => null), i = h ? filaHasta(h, hoyAr, true) : -1;
        filas.push({ nombre, compra: casa === 'tarjeta' || !isFinite(x.compra) ? null : x.compra, venta: x.venta, varDia: i >= 0 && h[i][2] ? ((x.venta / h[i][2]) - 1) * 100 : null });
        cuando = Math.max(cuando, Date.parse(x.fechaActualizacion) || 0);
      }
    }
  }
  if (!filas) {
    filas = [];
    for (const [casa, nombre] of FILAS) {
      const h = await historia(casa).catch(() => null);
      if (!h) continue;
      const i = filaHasta(h, hoyAr);
      if (i < 0) continue;
      const prev = i > 0 ? h[i - 1][2] : null;
      filas.push({ nombre, compra: casa === 'tarjeta' ? null : h[i][1], venta: h[i][2], varDia: prev ? ((h[i][2] / prev) - 1) * 100 : null });
    }
  }
  if (!filas.length) return null;
  const tabla = { sim: 'DOLAR', tipo: 'tabla', sitio: 'Dólar · Argentina', nombre: 'Todas las cotizaciones', filas, cuando: cuando || t, fuente: 'DolarApi' };
  if (reciente(t)) guardarFoto('DOLAR', t, { extra: JSON.stringify(tabla) });
  return tabla;
}

// ── Una tarjeta ──
async function carta(simCrudo, t, p) {
  const sim = normal(simCrudo);
  if (!sim) return null;
  // (en minusculas solo las palabras del dolar y las monedas: "$hola" no es el ETF HOLA)
  const crudo = String(simCrudo).trim();
  if (crudo !== crudo.toUpperCase() && !TABLA.has(sim) && !DOLARES[sim] && !DIVISAS.has(sim)) return null;
  if (TABLA.has(sim)) return tablaDolar(t);
  if (DOLARES[sim]) return cartaDolar(sim, DOLARES[sim][0], DOLARES[sim][1], t, p);
  const info = await resolver(sim);
  return info ? cartaYahoo(sim, info, t, p) : null;
}

// ── Para no abusar: cuantos simbolos por minuto pide cada uno ──
const pedidos = new Map(); // uid -> [minuto, cuantos]
function permitido(uid, n) {
  const min = Math.floor(Date.now() / 60e3), r = pedidos.get(uid);
  if (!r || r[0] !== min) { pedidos.set(uid, [min, n]); if (pedidos.size > 5000) pedidos.clear(); return true; }
  r[1] += n;
  return r[1] <= 150;
}

function setup(ctx) {
  ({ db, log, warn } = ctx);
  db.exec(`CREATE TABLE IF NOT EXISTS puente_cotiza_fotos (
    clave TEXT PRIMARY KEY, precio REAL, compra REAL, extra TEXT, creado INTEGER NOT NULL)`);
  log('cotiza: listo');
}

async function handle(req, res, p, u, h) {
  if (p !== '/puente/api/cotiza') return false;
  if (req.method !== 'GET') return h.json(res, 405, { error: 'metodo' });
  const user = h.sessionUser(req);
  if (!user) return h.json(res, 401, { error: 'sin sesion' });
  const sims = [...new Set(String(u.searchParams.get('s') || '').split(',').map((x) => x.trim()).filter(Boolean))].slice(0, 3);
  let t = Number(u.searchParams.get('t'));
  if (!sims.length) return h.json(res, 400, { error: 'simbolo' });
  // (la hora del mensaje: no del futuro ni de antes de 1990)
  if (!Number.isFinite(t) || t <= 631152000000) t = Date.now();
  t = Math.min(t, Date.now());
  const per = String(u.searchParams.get('p') || '').toUpperCase();
  // (si al mensaje le quitaron la vista previa con la ✕, no va ninguna tarjeta: embeds.js)
  const msg = parseInt(u.searchParams.get('m'), 10);
  if (msg > 0) {
    let quitada = false;
    try { quitada = !!db.prepare('SELECT 1 FROM puente_sin_vista WHERE haven_message_id = ?').get(msg); } catch { /* sin la tabla */ }
    if (quitada) return h.json(res, 200, { cartas: {}, quitada: true });
  }
  if (!permitido(user.id, sims.length)) return h.json(res, 429, { error: 'Demasiados pedidos: esperá un minuto.' });
  const cartas = {};
  await Promise.all(sims.map(async (s) => {
    try { cartas[s] = await carta(s, t, per); } catch (err) { warn('cotiza:', s, err.message); cartas[s] = { falla: true }; }
  }));
  // (sin guardar en el navegador: si le quitan la vista previa al mensaje, que se sepa al toque; lo de las fuentes ya
  // se guarda aca, y el chat tiene su memoria)
  res.setHeader('Cache-Control', 'no-store');
  return h.json(res, 200, { cartas });
}

module.exports = { setup, handle, carta, normal };
