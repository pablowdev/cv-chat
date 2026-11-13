// Estadisticas de los juegos para los administradores (la pestaña "Juegos" de la pagina de administracion,
// web/aviso.js): que juegos se juegan, quien los juega, cuanto tiempo, contra quien y como terminan.
//
// Salen de lo que ya se guarda: las partidas terminadas de cada juego (las lee su modulo de servidor, el "chat" que
// exporta: quien jugo, contra quien o contra la compu, cuando empezo y termino, quien gano y por que)
// y el tiempo de uso (uso.js: los segundos que cada persona tuvo cada juego abierto y lo estaba usando, desde
// que se mide). Las partidas con invitados se guardan desde el 2026-11-03 (como amistosas); antes, de ellos quedaba solo el tiempo.
//
//  GET /puente/api/estadisticas/juegos?rango=7d|4s|3m|1a|todo   (solo administradores)

const AR = 3 * 3600 * 1000; // Argentina, UTC-3 todo el año
const DIA = 864e5;
const RANGOS = { '7d': { dias: 7, paso: 'dia' }, '4s': { dias: 28, paso: 'dia' }, '3m': { dias: 91, paso: 'semana' }, '1a': { dias: 365, paso: 'mes' }, todo: { dias: 0, paso: 'mes' } };
// Los juegos de las estadisticas: los de las fichas, con su nombre (WORGS: los dos modos como dos juegos; BACITY no tiene
// partidas, es una ciudad abierta: de ella queda el tiempo con el juego abierto). medianas: lo que se cuenta por
// partida en cada juego ("jugadas" en el ajedrez, "rondas" en GlobalSiege), de su "chat"
function juegos() {
  const registro = require('./juegos-registro.js');
  const medianas = new Map();
  try { for (const { ficha, chat } of registro.conChat()) medianas.set(ficha.id, chat.medianas); } catch { /* sin el registro */ }
  return registro.lista().flatMap((f) => f.estadisticas.map((e) => ({ id: e.id, nombre: e.nombre, medianas: medianas.get(f.id) || [] })));
}
const COMPU = -1;
const TOPE_PARTIDA = 2 * 3600 * 1000; // una partida que quedo abierta dias (el truco por turnos) no cuenta como horas jugando

let db = null, warn = () => {};
const cache = new Map();

function setup(ctx) { ({ db, warn } = ctx); }

const diaAR = (ms) => new Date(ms - AR).toISOString().slice(0, 10);
const inicioDiaAR = (dia) => Date.parse(dia + 'T00:00:00Z') + AR; // el dia de Argentina, en ms
const filas = (sql, ...a) => { try { return db.prepare(sql).all(...a); } catch { return []; } };

// Todas las partidas terminadas, de todos los juegos, con la misma forma (cada juego las lee de sus tablas)
function partidas() {
  const out = [];
  let js = [];
  try { js = require('./juegos-registro.js').conChat(); } catch (err) { warn('estadisticas de juegos: registro:', err.message); }
  for (const { chat } of js) {
    if (!chat.partidas) continue;
    try { for (const p of chat.partidas.leer()) if (p) out.push(p); } catch { /* sin la tabla todavia */ }
  }
  // (en el orden en que terminaron: los empates, como el juego favorito de alguien que jugo lo mismo a dos, van por la
  // primera partida, no por el orden de las fichas)
  return out.sort((a, b) => (a.fin || 0) - (b.fin || 0));
}

// Los cortes de la serie (dia, semana o mes) entre dos dias de Argentina
function cortes(desde, hasta, paso) {
  const out = [];
  let t = inicioDiaAR(desde);
  const fin = inicioDiaAR(hasta);
  if (paso === 'mes') { const d = new Date(t - AR); t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) + AR; }
  while (t <= fin) {
    let sig;
    if (paso === 'dia') sig = t + DIA;
    else if (paso === 'semana') sig = t + 7 * DIA;
    else { const d = new Date(t - AR); sig = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) + AR; }
    const etiqueta = paso === 'mes' ? diaAR(t).slice(0, 7) : diaAR(t);
    out.push({ desde: t, hasta: sig, etiqueta });
    t = sig;
  }
  return out;
}

const mediana = (l) => { if (!l.length) return 0; const s = [...l].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const r1 = (x) => Math.round(x * 10) / 10;

function calcular(rango) {
  const R = RANGOS[rango];
  const todas = partidas();
  const ahora = Date.now();
  const hasta = diaAR(ahora);
  const primera = todas.length ? Math.min(...todas.map(p => p.fin)) : ahora;
  const desde = R.dias ? diaAR(ahora - (R.dias - 1) * DIA) : diaAR(primera);
  const iniMs = inicioDiaAR(desde), finMs = inicioDiaAR(hasta) + DIA;
  const largo = finMs - iniMs;
  const enPeriodo = todas.filter(p => p.fin >= iniMs && p.fin < finMs);
  const antes = R.dias ? todas.filter(p => p.fin >= iniMs - largo && p.fin < iniMs) : [];
  const desdeAnt = diaAR(iniMs - largo), hastaAnt = diaAR(iniMs - 1);

  // Las personas (con cuenta); los que ya no estan o eran invitados, aparte
  const gente = new Map(filas('SELECT id, username, display_name, avatar, COALESCE(is_guest, 0) invitado FROM users').map(u => [u.id, u]));
  const esPersona = (id) => { const u = gente.get(id); return !!u && !u.invitado; };
  const quien = (id) => { const u = gente.get(id); return u ? { id: u.id, nombre: u.display_name || u.username, usuario: u.username, avatar: u.avatar || null } : { id, nombre: 'Alguien que ya no está', usuario: '', avatar: null }; };

  // Tiempo de uso de cada juego (uso.js); "j:juegos" es la sala, donde se elige el juego
  const uso = filas("SELECT dia, user_id, seccion, seg FROM puente_uso WHERE seccion LIKE 'j:%' AND dia >= ? AND dia <= ?", desde, hasta);
  const usoAnt = R.dias ? filas("SELECT user_id, seg FROM puente_uso WHERE seccion LIKE 'j:%' AND seccion != 'j:juegos' AND dia >= ? AND dia <= ?", desdeAnt, hastaAnt) : [];
  const usoDesde = (filas("SELECT MIN(dia) d FROM puente_uso WHERE seccion LIKE 'j:%'")[0] || {}).d || null;
  const segJuego = new Map(), segPersona = new Map(), segPersonaJuego = new Map(), personasJuego = new Map(), salaPersonas = new Set(), jugaronUso = new Set();
  let segInvitados = 0; const invitados = new Set();
  for (const r of uso) {
    const j = r.seccion.slice(2);
    if (!esPersona(r.user_id)) { if (j !== 'juegos') { segInvitados += r.seg; invitados.add(r.user_id); } else invitados.add(r.user_id); continue; }
    if (j === 'juegos') { salaPersonas.add(r.user_id); continue; }
    segJuego.set(j, (segJuego.get(j) || 0) + r.seg);
    segPersona.set(r.user_id, (segPersona.get(r.user_id) || 0) + r.seg);
    const k = r.user_id + '|' + j; segPersonaJuego.set(k, (segPersonaJuego.get(k) || 0) + r.seg);
    if (!personasJuego.has(j)) personasJuego.set(j, new Set()); personasJuego.get(j).add(r.user_id);
    jugaronUso.add(r.user_id);
  }
  const segTotal = [...segJuego.values()].reduce((a, b) => a + b, 0);
  const segTotalAnt = usoAnt.filter(r => esPersona(r.user_id)).reduce((a, r) => a + r.seg, 0);

  // Quien jugo (partidas terminadas) y cuando fue su primera partida de todas
  const primeraDe = new Map();
  for (const p of todas) for (const h of p.humanos) if (!primeraDe.has(h) || p.fin < primeraDe.get(h)) primeraDe.set(h, p.fin);
  const jugadores = (l) => new Set(l.flatMap(p => p.humanos).filter(esPersona));
  const jugadoresP = jugadores(enPeriodo), jugadoresAnt = jugadores(antes);
  const nuevos = [...jugadoresP].filter(id => primeraDe.get(id) >= iniMs);
  const vsPersonas = (l) => l.filter(p => p.humanos.length >= 2).length;
  // lo que duraron las partidas, sumado (con el tope): el tiempo jugando desde antes de que se midiera el uso
  const durTotal = (l) => Math.round(l.reduce((a, p) => a + Math.min(TOPE_PARTIDA, Math.max(0, p.fin - p.inicio)), 0) / 60000);

  // Por juego
  const JUEGOS = juegos();
  const porJuego = JUEGOS.map(J => {
    const l = enPeriodo.filter(p => p.juego === J.id), la = antes.filter(p => p.juego === J.id);
    const conCompu = l.filter(p => p.compu && p.humanos.length);
    // contra la compu: cuantas gana la persona (en GlobalSiege, si gano alguien de la mesa)
    const ganadasCompu = conCompu.filter(p => p.ganador && p.ganador !== COMPU && p.humanos.includes(p.ganador)).length;
    const decididasCompu = conCompu.filter(p => p.ganador != null).length;
    const dur = l.map(p => Math.min(TOPE_PARTIDA, Math.max(0, p.fin - p.inicio)) / 60000).filter(x => x > 0);
    const motivos = new Map(), detalles = new Map();
    for (const p of l) {
      const m = p.empate ? 'tablas' : p.motivo || ''; if (m) motivos.set(m, (motivos.get(m) || 0) + 1);
      for (const d of p.detalle || []) detalles.set(d, (detalles.get(d) || 0) + 1);
    }
    const abandonos = l.filter(p => /abandon|rend/.test(p.motivo)).length;
    const extra = {};
    for (const k of J.medianas) extra[k] = Math.round(mediana(l.map(p => p[k]).filter(x => x > 0)));
    return {
      id: J.id, nombre: J.nombre, partidas: l.length, antes: la.length, contraCompu: conCompu.length, contraPersonas: vsPersonas(l),
      jugadores: jugadores(l).size, minutos: Math.round((segJuego.get(J.id) || 0) / 60), minutosPartidas: Math.round(dur.reduce((a, b) => a + b, 0)), personasUso: (personasJuego.get(J.id) || new Set()).size,
      duracion: r1(mediana(dur)), abandonos: l.length ? Math.round((abandonos / l.length) * 100) : 0,
      ganaCompu: decididasCompu ? Math.round(((decididasCompu - ganadasCompu) / decididasCompu) * 100) : null,
      motivos: [...motivos].map(([m, n]) => ({ m, n })).sort((a, b) => b.n - a.n),
      detalles: [...detalles].map(([d, n]) => ({ d, n })).sort((a, b) => b.n - a.n).slice(0, 6), ...extra,
    };
  });

  // La serie: partidas de cada juego por dia, semana o mes
  const cs = cortes(desde, hasta, R.paso);
  const serie = { etiquetas: cs.map(c => c.etiqueta), paso: R.paso, juegos: {} };
  for (const J of JUEGOS) serie.juegos[J.id] = cs.map(c => enPeriodo.filter(p => p.juego === J.id && p.fin >= c.desde && p.fin < c.hasta).length);

  // Cuando se juega: hora del dia y dia de la semana (al terminar la partida, hora de Argentina)
  const horas = Array(24).fill(0), dias = Array(7).fill(0);
  for (const p of enPeriodo) { const d = new Date(p.fin - AR); horas[d.getUTCHours()]++; dias[(d.getUTCDay() + 6) % 7]++; }

  // Por persona
  const pp = new Map();
  const de = (id) => { if (!pp.has(id)) pp.set(id, { id, partidas: 0, ganadas: 0, perdidas: 0, compu: 0, personas: 0, juegos: new Map(), ultimo: 0, ms: 0 }); return pp.get(id); };
  for (const p of enPeriodo) {
    for (const h of p.humanos) {
      if (!esPersona(h)) continue;
      const x = de(h);
      x.partidas++; x.juegos.set(p.juego, (x.juegos.get(p.juego) || 0) + 1); x.ultimo = Math.max(x.ultimo, p.fin);
      x.ms += Math.min(TOPE_PARTIDA, Math.max(0, p.fin - p.inicio));
      if (p.humanos.length >= 2) x.personas++; else x.compu++;
      if (p.ganador === h) x.ganadas++; else if (p.ganador != null) x.perdidas++;
    }
  }
  for (const id of jugaronUso) de(id); // tuvieron un juego abierto aunque no terminaran ninguna partida
  const personas = [...pp.values()].map(x => {
    const fav = [...x.juegos].sort((a, b) => b[1] - a[1])[0];
    // el juego en el que mas tiempo estuvo, si no termino partidas
    let favUso = null, max = 0;
    for (const J of JUEGOS) { const s = segPersonaJuego.get(x.id + '|' + J.id) || 0; if (s > max) { max = s; favUso = J.id; } }
    const decididas = x.ganadas + x.perdidas;
    return { ...quien(x.id), partidas: x.partidas, ganadas: x.ganadas, victorias: decididas ? Math.round((x.ganadas / decididas) * 100) : null,
      compu: x.compu, personas: x.personas, minutos: Math.round((segPersona.get(x.id) || 0) / 60), minutosPartidas: Math.round(x.ms / 60000), favorito: fav ? fav[0] : favUso,
      ultimo: x.ultimo || null, nuevo: (primeraDe.get(x.id) || 0) >= iniMs };
  }).sort((a, b) => b.partidas - a.partidas || b.minutos - a.minutos).slice(0, 40);

  // Los que mas se enfrentan (entre personas)
  const pares = new Map();
  for (const p of enPeriodo) {
    const hs = p.humanos.filter(esPersona);
    if (hs.length < 2) continue;
    for (let i = 0; i < hs.length; i++) for (let k = i + 1; k < hs.length; k++) {
      const [a, b] = hs[i] < hs[k] ? [hs[i], hs[k]] : [hs[k], hs[i]];
      const key = a + '|' + b;
      const x = pares.get(key) || { a, b, partidas: 0, ganaA: 0, ganaB: 0, juegos: new Map() };
      x.partidas++; if (p.ganador === a) x.ganaA++; if (p.ganador === b) x.ganaB++;
      x.juegos.set(p.juego, (x.juegos.get(p.juego) || 0) + 1);
      pares.set(key, x);
    }
  }
  const rivales = [...pares.values()].sort((x, y) => y.partidas - x.partidas).slice(0, 10)
    .map(x => ({ a: quien(x.a), b: quien(x.b), partidas: x.partidas, ganaA: x.ganaA, ganaB: x.ganaB, juego: [...x.juegos].sort((m, n) => n[1] - m[1])[0][0] }));

  // Las ultimas partidas
  const recientes = [...enPeriodo].sort((a, b) => b.fin - a.fin).slice(0, 15).map(p => ({
    juego: p.juego, fin: p.fin, minutos: r1(Math.min(TOPE_PARTIDA, Math.max(0, p.fin - p.inicio)) / 60000),
    jugadores: p.humanos.map(quien), compu: p.compu, ganador: p.ganador === COMPU ? 'compu' : p.ganador ? quien(p.ganador).nombre : null,
    motivo: p.empate ? 'tablas' : p.motivo, detalle: (p.detalle || [])[0] || '',
  }));

  // Ahora: las mesas esperando rival y las partidas en juego
  const ahoraJ = { esperando: 0, jugando: 0 };
  let tablas = [];
  try { tablas = require('./juegos-registro.js').conChat().map(x => x.chat.mesas).filter(Boolean); } catch { /* sin el registro */ }
  for (const t of tablas) {
    // ("jugando": las que se movieron en el ultimo dia; las que quedaron abandonadas no cuentan)
    for (const r of filas(`SELECT estado, actualizado FROM ${t}`)) {
      let g; try { g = JSON.parse(r.estado); } catch { continue; }
      if (g.estado === 'esperando') ahoraJ.esperando++; else if (g.estado === 'jugando' && r.actualizado > ahora - DIA) ahoraJ.jugando++;
    }
  }

  // De los que abrieron la sala de juegos, cuantos jugaron algo (tiempo en un juego o una partida terminada)
  const salaJugaron = [...salaPersonas].filter(id => jugaronUso.has(id) || jugadoresP.has(id)).length;

  return {
    rango, desde, hasta, paso: R.paso, usoDesde, primera: todas.length ? diaAR(primera) : null,
    resumen: {
      partidas: [enPeriodo.length, antes.length], jugadores: [jugadoresP.size, jugadoresAnt.size],
      minutos: [Math.round(segTotal / 60), Math.round(segTotalAnt / 60)], minutosPartidas: [durTotal(enPeriodo), durTotal(antes)], contraPersonas: [vsPersonas(enPeriodo), vsPersonas(antes)],
      nuevos: nuevos.length, invitados: invitados.size, invitadosMin: Math.round(segInvitados / 60),
      sala: salaPersonas.size, salaJugaron, ahora: ahoraJ,
      minutosPorJugador: jugaronUso.size ? r1(segTotal / 60 / jugaronUso.size) : 0,
    },
    juegos: porJuego, serie, horas, dias, personas, rivales, recientes,
  };
}

async function handle(req, res, p, u, h) {
  if (p !== '/puente/api/estadisticas/juegos') return false;
  if (req.method !== 'GET') return h.json(res, 405, { error: 'metodo' });
  const user = h.sessionUser(req);
  if (!user) return h.json(res, 401, { error: 'sin sesion' });
  const admin = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(user.id);
  if (!admin || !admin.is_admin) return h.json(res, 403, { error: 'solo administradores' });
  const rango = RANGOS[u.searchParams.get('rango')] ? u.searchParams.get('rango') : '4s';
  const c = cache.get(rango);
  if (c && Date.now() - c.at < 2 * 60 * 1000) return h.json(res, 200, c.datos);
  let datos;
  try { datos = calcular(rango); } catch (err) { warn('estadisticas de juegos:', err.message); return h.json(res, 500, { error: 'No se pudieron calcular las estadísticas de los juegos.' }); }
  cache.set(rango, { at: Date.now(), datos });
  return h.json(res, 200, datos);
}

module.exports = { setup, handle, calcular };
