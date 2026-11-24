// De donde salen las monedas del club (la economia, paso 2). Un liquidador que corre cada 10 minutos, mira lo que
// paso en CV Chat y paga con monedas.js. No toca nada de los juegos ni del chat: lee sus tablas. Cada pago lleva una
// clave, asi nada se paga dos veces aunque se reinicie el servidor o se corra de nuevo.
// Las reglas son las del plan, calibradas con lo que paso en el club en octubre y noviembre de 2026:
//
//  - Bienvenida: 100 al confirmar el email (una vez por cuenta).
//  - Primeros pasos (una vez cada uno): armar el muñeco en CV Hotel 15, el primer mensaje en un canal 15, la primera
//    partida contra una persona 20, tener 3 muebles puestos en una sala del hotel 20.
//  - Partidas contra personas (truco, pool, ajedrez, funball, curveball y GlobalSiege): por jugar, segun lo que duro
//    (1 por minuto, de 3 a 20); por ganar, 1,5 por minuto (de 5 a 40) por lo que rinde el rival (ganarle a uno mejor
//    paga mas). Contra el mismo rival paga menos (2 seguidas entero, despues 60%, 30%, 10% y nada; se recupera en
//    un dia). Con invitados no paga. Menos de un minuto no paga. El que abandona no cobra.
//  - Contra la computadora: la quinta parte, con tope de 30 por dia; ganarle en el juego del dia, 20 una vez por dia.
//  - Tiempo en CV Hotel: 2 cada 10 minutos, hasta 20 por dia.
//  - Tope suave por dia (partidas, compu, desafio y tiempo): hasta 300 entero, de 300 a 500 la mitad, despues nada.
//  - Dia activo (3 mensajes validos, una partida o 10 minutos en el hotel o en Capa 2): 5; cada 7 dias seguidos, 30.
//  - Por semana: dias con 3 mensajes validos (2: 20, 3: 50, 5: 80, 7: 120); reacciones de personas distintas a tus
//    mensajes (5 cada una, hasta 10 personas; solo cuentas de 7 dias o mas); el podio de la semana 150, 100 y 50.
//  - Curveball: quien sale primero en el ranking de puntajes (supera el record del primero) cobra 100, como mucho una
//    vez por mes (pedido del dueño, 20/11/2026: es bastante dificil).
//  - CS 1.6: podio semanal de kills (150, 100 y 50). Se paga el lunes como el podio del chat, con mínimo 10 kills del
//    primero y 3 cuentas registradas con kills. El ranking del juego se pide por la red interna con el secreto
//    compartido (cs16-premios.js tiene los montos).
//  - Invitaciones: 50 cuando la persona invitada confirma su cuenta, 150 cuando usa CV Chat 3 dias en sus primeras 2
//    semanas y 100 si sigue (2 dias entre la semana 3 y la 5).
// Un mensaje vale si tiene 8 letras o 2 palabras (o un link o una imagen), no repite uno de los ultimos 5 de esa
// persona y no llega a menos de 3 segundos del anterior. Los mensajes directos no cuentan.
//
// MONEDAS_FUENTES=0 lo apaga.

const M = require('./monedas.js');
const CS16 = require('./cs16-premios.js'); // podio semanal de CS 1.6

let db = null, log = () => {}, warn = () => {};
const AR = 3 * 3600e3, DIA = 864e5;
const R = Math.round, clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const REG = {
  bienvenida: 100,
  pasos: { muneco: 15, mensaje: 15, partida: 20, sala: 20 },
  partMin: 1.0, partLo: 3, partHi: 20, vicMin: 1.5, vicLo: 5, vicHi: 40, eloLo: 0.5, eloHi: 1.5, eloK: 32,
  durTope: 30, durMinima: 1.0,
  par: [[2, 1], [3, 0.6], [4, 0.3], [5, 0.1], [Infinity, 0]], parVidaMedia: DIA,
  compu: 0.2, compuTopeDia: 30, desafio: 20,
  suave1: 300, suave2: 500,
  tiempoCada: 600, tiempoPago: 2, tiempoTope: 20,
  diaActivo: 5, racha7: 30,
  semanal: (d) => (d >= 7 ? 120 : d >= 5 ? 80 : d >= 3 ? 50 : d >= 2 ? 20 : 0),
  reaccion: 5, reaccionTope: 10, reaccionEdad: 7 * DIA,
  podio: [150, 100, 50], podioMinimo: 30,
  inv1: 50, inv2: 150, inv3: 100,
  curveballPrimero: 100,
  cs16: CS16,
};
const JUEGOS_DESAFIO = ['truco', 'pool', 'curveball', 'ajedrez', 'globalsiege', 'funball'];
const TABLAS = [
  ['truco', 'puente_truco_partidas', 'j1', 'j2'], ['pool', 'puente_pool_partidas', 'j1', 'j2'],
  ['ajedrez', 'puente_ajedrez_partidas', 'blancas', 'negras'], ['funball', 'puente_funball_partidas', 'j1', 'j2'],
  ['curveball', 'puente_curveball_partidas', 'j1', 'j2'],
];

const diaAR = (ms) => new Date(ms - AR).toISOString().slice(0, 10);
const inicioDia = (dia) => Date.parse(dia + 'T00:00:00Z') + AR;
const lunesDe = (ms) => { const d = new Date(ms - AR); const dow = (d.getUTCDay() + 6) % 7; return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dow)).toISOString().slice(0, 10); };
const sumarDias = (dia, n) => new Date(Date.parse(dia + 'T00:00:00Z') + n * DIA).toISOString().slice(0, 10);
const textoUTC = (ms) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
const msDeTexto = (s) => Date.parse(String(s).replace(' ', 'T') + 'Z');
const juegoDelDia = (ms) => JUEGOS_DESAFIO[Math.floor((ms - AR) / DIA) % JUEGOS_DESAFIO.length];

const leer = (k, d) => { const r = db.prepare('SELECT valor FROM puente_monedas_estado WHERE clave = ?').get(k); return r ? r.valor : d; };
const poner = (k, v) => db.prepare('INSERT INTO puente_monedas_estado (clave, valor) VALUES (?, ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor').run(k, String(v));
const esCuenta = (u) => { const r = db.prepare('SELECT IFNULL(is_guest, 0) g FROM users WHERE id = ?').get(Number(u)); return !!r && !r.g; };
const pagar = (u, n, tipo, origen, clave, detalle) => (n > 0 && esCuenta(u) ? M.dar(Number(u), R(n), { tipo, origen, clave, detalle }) : null);

// el tope suave del dia (partidas, compu, desafio y tiempo): lo que se paga sale de lo "bruto" acumulado ese dia
const pagoSuave = (x) => Math.min(x, REG.suave1) + 0.5 * clamp(x - REG.suave1, 0, REG.suave2 - REG.suave1);
function pagarConTope(u, dia, n, tipo, origen, clave, detalle) {
  if (!(n > 0) || !esCuenta(u)) return;
  if (db.prepare('SELECT 1 FROM puente_monedas_mov WHERE clave = ?').get(clave) || db.prepare('SELECT 1 FROM puente_monedas_estado WHERE clave = ?').get('tope:' + clave)) return;
  const r = db.prepare('SELECT bruto FROM puente_monedas_bruto WHERE user_id = ? AND dia = ?').get(Number(u), dia);
  const antes = r ? r.bruto : 0, despues = antes + n;
  db.prepare('INSERT INTO puente_monedas_bruto (user_id, dia, bruto) VALUES (?, ?, ?) ON CONFLICT(user_id, dia) DO UPDATE SET bruto = excluded.bruto').run(Number(u), dia, despues);
  const paga = R(pagoSuave(despues) - pagoSuave(antes));
  if (paga > 0) pagar(u, paga, tipo, origen, clave, detalle);
  else db.prepare('INSERT OR IGNORE INTO puente_monedas_estado (clave, valor) VALUES (?, ?)').run('tope:' + clave, '0'); // (para no volver a sumarla)
}

// ── Partidas ──
const rating = (j, u) => { const r = db.prepare('SELECT rating FROM puente_monedas_elo WHERE juego = ? AND user_id = ?').get(j, u); return r ? r.rating : 1200; };
const ponerRating = (j, u, v) => db.prepare('INSERT INTO puente_monedas_elo (juego, user_id, rating) VALUES (?, ?, ?) ON CONFLICT(juego, user_id) DO UPDATE SET rating = excluded.rating').run(j, u, v);
const clavePar = (a, b) => (a < b ? a + '-' + b : b + '-' + a);
const contadorPar = (a, b, t) => { const p = db.prepare('SELECT c, t FROM puente_monedas_pares WHERE par = ?').get(clavePar(a, b)); return p ? p.c * Math.pow(0.5, (t - p.t) / REG.parVidaMedia) : 0; };
const sumarPar = (a, b, t) => db.prepare('INSERT INTO puente_monedas_pares (par, c, t) VALUES (?, ?, ?) ON CONFLICT(par) DO UPDATE SET c = excluded.c, t = excluded.t').run(clavePar(a, b), contadorPar(a, b, t) + 1, t);
const multPar = (c) => { for (const [lim, m] of REG.par) if (c < lim) return m; return 0; };

function partidasNuevas(desde) {
  const lista = [];
  const hay = (t) => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(t);
  for (const [juego, tabla, a, b] of TABLAS) {
    if (!hay(tabla)) continue;
    for (const r of db.prepare(`SELECT id, ${a} a, ${b} b, ganador, motivo, inicio, fin, compu FROM ${tabla} WHERE fin > ? ORDER BY fin`).all(desde)) {
      lista.push({ juego, id: r.id, ids: [r.a, r.b].map(Number).filter((x) => x > 0), compu: !!r.compu, ganador: Number(r.ganador) || 0, motivo: r.motivo || '', inicio: Number(r.inicio) || 0, fin: Number(r.fin) });
    }
  }
  if (hay('puente_mr_partidas')) {
    for (const r of db.prepare('SELECT id, jugadores, ganador, inicio, fin FROM puente_mr_partidas WHERE fin > ? ORDER BY fin').all(desde)) {
      let js = []; try { js = JSON.parse(r.jugadores).map(Number); } catch { /* sin jugadores */ }
      const ids = js.filter((x) => x > 0);
      lista.push({ juego: 'globalsiege', id: r.id, ids, compu: ids.length < 2, ganador: Number(r.ganador) || 0, motivo: '', inicio: Number(r.inicio) || 0, fin: Number(r.fin), varios: true });
    }
  }
  return lista.sort((x, y) => x.fin - y.fin);
}
function medianas() {
  const out = {};
  for (const [juego, tabla] of TABLAS) {
    try {
      const l = db.prepare(`SELECT (fin - inicio) / 60000.0 m FROM ${tabla} WHERE fin > 0 AND inicio > 0 AND IFNULL(compu, 0) = 0 ORDER BY m`).all().map((r) => r.m);
      if (l.length) out[juego] = l[Math.floor(l.length / 2)];
    } catch { /* sin tabla */ }
  }
  return out;
}

function liquidarPartidas() {
  const desde = Number(leer('partidas', leer('inicio', Date.now())));
  const lista = partidasNuevas(desde);
  if (!lista.length) return 0;
  const med = medianas();
  let hechas = 0;
  for (const p of lista) {
    const dur = p.inicio > 0 ? (p.fin - p.inicio) / 60000 : 0, durR = Math.min(dur, REG.durTope), dia = diaAR(p.fin);
    const humanos = p.ids.filter((x) => db.prepare('SELECT 1 FROM users WHERE id = ?').get(x));
    for (const u of humanos) db.prepare('INSERT OR IGNORE INTO puente_monedas_activos (user_id, dia) VALUES (?, ?)').run(u, dia);
    const conInvitado = p.ids.some((x) => !esCuenta(x));
    const k = (u, que) => `${que}:${p.juego}:${p.id}:${u}`;
    if (!p.compu && humanos.length >= 2) {
      if (!conInvitado && dur >= REG.durMinima) {
        const base = clamp(R(durR * REG.partMin), REG.partLo, REG.partHi), vicBase = clamp(R(durR * REG.vicMin), REG.vicLo, REG.vicHi);
        const abandono = p.motivo === 'abandono', largaParaAbandono = dur >= 0.5 * (med[p.juego] || 0);
        for (const u of humanos) {
          const otros = humanos.filter((x) => x !== u);
          const m = otros.reduce((s, o) => s + multPar(contadorPar(u, o, p.fin)), 0) / otros.length;
          const gano = p.ganador === u;
          let n = 0;
          if (abandono && !gano) n = 0;
          else if (abandono && gano) n = largaParaAbandono ? base * m : 0;
          else {
            n = base * m;
            if (gano) {
              let f = 1;
              if (!p.varios) { const E = 1 / (1 + Math.pow(10, (rating(p.juego, otros[0]) - rating(p.juego, u)) / 400)); f = clamp(2 * (1 - E), REG.eloLo, REG.eloHi); }
              n += vicBase * f * (p.varios ? Math.min(otros.length, 3) : 1) * m;
            }
          }
          pagarConTope(u, dia, n, gano ? 'partida-ganada' : 'partida', 'juegos', k(u, 'partida'), p.juego);
          if (!abandono || gano) pagar(u, REG.pasos.partida, 'primer-paso', 'sistema', 'paso:partida:' + u, 'Primera partida contra una persona');
        }
        for (let i = 0; i < humanos.length; i++) for (let j = i + 1; j < humanos.length; j++) sumarPar(humanos[i], humanos[j], p.fin);
        if (!p.varios && humanos.length === 2 && humanos.includes(p.ganador)) {
          const g = p.ganador, l = humanos.find((x) => x !== g);
          const E = 1 / (1 + Math.pow(10, (rating(p.juego, l) - rating(p.juego, g)) / 400));
          ponerRating(p.juego, g, rating(p.juego, g) + REG.eloK * (1 - E)); ponerRating(p.juego, l, rating(p.juego, l) - REG.eloK * (1 - E));
        }
      }
    } else if (humanos.length === 1 && esCuenta(humanos[0]) && dur >= 0.3 && p.motivo !== 'abandono') {
      const u = humanos[0], gano = p.ganador === u;
      let n = REG.compu * clamp(R(durR * REG.partMin), REG.partLo, REG.partHi) + (gano ? REG.compu * clamp(R(durR * REG.vicMin), REG.vicLo, REG.vicHi) : 0);
      const ya = db.prepare("SELECT COALESCE(SUM(delta), 0) n FROM puente_monedas_mov WHERE user_id = ? AND tipo IN ('compu', 'compu-ganada') AND t >= ?").get(u, inicioDia(dia)).n;
      n = Math.min(n, Math.max(0, REG.compuTopeDia - ya));
      pagarConTope(u, dia, n, gano ? 'compu-ganada' : 'compu', 'juegos', k(u, 'compu'), p.juego);
      if (gano && juegoDelDia(p.fin) === p.juego) pagarConTope(u, dia, REG.desafio, 'desafio', 'juegos', `desafio:${u}:${dia}`, p.juego);
    }
    poner('partidas', p.fin);
    hechas++;
  }
  return hechas;
}

// ── Bienvenida y primeros pasos ──
function liquidarBienvenidas() {
  let n = 0;
  for (const r of db.prepare(`SELECT e.haven_user_id u FROM puente_emails e JOIN users x ON x.id = e.haven_user_id
      WHERE e.confirmado = 1 AND IFNULL(x.is_guest, 0) = 0 AND NOT EXISTS (SELECT 1 FROM puente_monedas_mov v WHERE v.clave = 'bienvenida:' || e.haven_user_id)`).all()) {
    const x = pagar(r.u, REG.bienvenida, 'bienvenida', 'sistema', 'bienvenida:' + r.u, 'Bienvenida al confirmar el email');
    if (x && x.ok) n++;
  }
  // el muñeco del hotel y 3 muebles puestos en una sala
  try {
    for (const r of db.prepare(`SELECT user_id u FROM puente_hotel_jugadores WHERE datos LIKE '%"avatar":{%'
        AND NOT EXISTS (SELECT 1 FROM puente_monedas_mov v WHERE v.clave = 'paso:muneco:' || user_id)`).all()) pagar(r.u, REG.pasos.muneco, 'primer-paso', 'sistema', 'paso:muneco:' + r.u, 'Armaste tu muñeco en CV Hotel');
    for (const r of db.prepare(`SELECT CAST(dueno AS INTEGER) u FROM puente_hotel_items WHERE sala IS NOT NULL AND sala != '' GROUP BY dueno HAVING COUNT(*) >= 3`).all()) {
      if (!db.prepare('SELECT 1 FROM puente_monedas_mov WHERE clave = ?').get('paso:sala:' + r.u)) pagar(r.u, REG.pasos.sala, 'primer-paso', 'sistema', 'paso:sala:' + r.u, 'Decoraste una sala en CV Hotel');
    }
  } catch (err) { warn('monedas fuentes: hotel:', err.message); }
  return n;
}

// ── Mensajes validos (de un rango de tiempo) ──
function mensajes(desdeMs, hastaMs) {
  const dm = new Set(db.prepare('SELECT id FROM channels WHERE is_dm = 1').all().map((r) => r.id));
  const ult = new Map(), out = [];
  for (const m of db.prepare(`SELECT id, channel_id, user_id, content, reply_to, created_at FROM messages
      WHERE imported_from IS NULL AND is_webhook = 0 AND type = 'user' AND created_at >= ? AND created_at < ? ORDER BY created_at, id`).all(textoUTC(desdeMs), textoUTC(hastaMs))) {
    if (dm.has(m.channel_id) || !esCuenta(m.user_id)) continue;
    const t = msDeTexto(m.created_at), txt = String(m.content || '').trim().toLowerCase().replace(/\s+/g, ' ');
    const ant = ult.get(m.user_id) || { t: 0, textos: [] }, palabras = txt ? txt.split(' ').length : 0;
    const ok = (txt.length >= 8 || palabras >= 2 || /https?:\/\/|\/uploads\//.test(txt)) && !ant.textos.includes(txt) && t - ant.t >= 3000;
    ult.set(m.user_id, { t, textos: [txt, ...ant.textos].slice(0, 5) });
    out.push({ id: m.id, u: m.user_id, t, ok, reply: m.reply_to });
  }
  return out;
}

// ── Lo del dia (cuando termina) ──
function liquidarDia(dia) {
  const ini = inicioDia(dia), fin = ini + DIA;
  const porU = new Map();
  for (const m of mensajes(ini, fin)) if (m.ok) {
    porU.set(m.u, (porU.get(m.u) || 0) + 1);
    pagar(m.u, REG.pasos.mensaje, 'primer-paso', 'sistema', 'paso:mensaje:' + m.u, 'Tu primer mensaje en un canal');
  }
  for (const [u, n] of porU) {
    db.prepare('INSERT INTO puente_monedas_chat (user_id, dia, validos) VALUES (?, ?, ?) ON CONFLICT(user_id, dia) DO UPDATE SET validos = excluded.validos').run(u, dia, n);
    if (n >= 3) db.prepare('INSERT OR IGNORE INTO puente_monedas_activos (user_id, dia) VALUES (?, ?)').run(u, dia);
  }
  for (const r of db.prepare("SELECT user_id u, seccion, SUM(seg) seg FROM puente_uso WHERE dia = ? AND seccion IN ('j:hotel', 'j:bacity') GROUP BY user_id, seccion").all(dia)) {
    if (r.seg >= 600) db.prepare('INSERT OR IGNORE INTO puente_monedas_activos (user_id, dia) VALUES (?, ?)').run(r.u, dia);
    if (r.seccion === 'j:hotel') pagarConTope(r.u, dia, Math.min(REG.tiempoTope, Math.floor(r.seg / REG.tiempoCada) * REG.tiempoPago), 'tiempo-hotel', 'hotel', `tiempo:hotel:${r.u}:${dia}`, 'Tiempo en CV Hotel');
  }
  // dia activo y racha
  const ayer = sumarDias(dia, -1);
  for (const r of db.prepare('SELECT user_id u FROM puente_monedas_activos WHERE dia = ?').all(dia)) {
    if (!esCuenta(r.u)) continue;
    pagar(r.u, REG.diaActivo, 'dia-activo', 'chat', `dia:${r.u}:${dia}`, 'Día activo');
    const prev = db.prepare('SELECT ultimo, racha FROM puente_monedas_racha WHERE user_id = ?').get(r.u);
    const racha = prev && prev.ultimo === ayer ? prev.racha + 1 : prev && prev.ultimo === dia ? prev.racha : 1;
    db.prepare('INSERT INTO puente_monedas_racha (user_id, ultimo, racha) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET ultimo = excluded.ultimo, racha = excluded.racha').run(r.u, dia, racha);
    if (racha % 7 === 0) pagar(r.u, REG.racha7, 'racha', 'chat', `racha:${r.u}:${dia}`, `${racha} días seguidos`);
  }
}

// ── Lo de la semana (cuando termina, el lunes) ──
function liquidarSemana(lunes) {
  const ini = inicioDia(lunes), fin = ini + 7 * DIA, dom = sumarDias(lunes, 6);
  const dias = new Map();
  for (const r of db.prepare('SELECT user_id u, COUNT(*) d FROM puente_monedas_chat WHERE dia >= ? AND dia <= ? AND validos >= 3 GROUP BY user_id').all(lunes, dom)) dias.set(r.u, r.d);
  for (const [u, d] of dias) pagar(u, REG.semanal(d), 'semanal', 'chat', `semanal:${u}:${lunes}`, `${d} días charlando`);
  const msgs = mensajes(ini - 14 * DIA, fin), autor = new Map(msgs.map((m) => [m.id, m]));
  const resp = new Map();
  for (const m of msgs) if (m.ok && m.t >= ini && m.reply) { const a = autor.get(m.reply); if (a && a.u !== m.u) { if (!resp.has(a.u)) resp.set(a.u, new Set()); resp.get(a.u).add(m.u); } }
  const reac = new Map();
  for (const r of db.prepare(`SELECT x.message_id, x.user_id, x.created_at, u.created_at alta FROM reactions x JOIN users u ON u.id = x.user_id
      WHERE x.created_at >= ? AND x.created_at < ? AND IFNULL(u.is_guest, 0) = 0`).all(textoUTC(ini), textoUTC(fin))) {
    const a = autor.get(r.message_id); if (!a || a.u === r.user_id) continue;
    if (msDeTexto(r.created_at) - msDeTexto(r.alta) < REG.reaccionEdad) continue;
    if (!reac.has(a.u)) reac.set(a.u, new Set()); reac.get(a.u).add(r.user_id);
  }
  const gente = new Set([...dias.keys(), ...reac.keys(), ...resp.keys()]), puntaje = [];
  for (const u of gente) {
    const nr = reac.has(u) ? reac.get(u).size : 0;
    pagar(u, Math.min(nr, REG.reaccionTope) * REG.reaccion, 'reacciones', 'chat', `reacciones:${u}:${lunes}`, `${nr} personas reaccionaron a tus mensajes`);
    puntaje.push([u, (dias.get(u) || 0) * 10 + nr * 5 + (resp.has(u) ? resp.get(u).size : 0) * 5]);
  }
  puntaje.sort((a, b) => b[1] - a[1]);
  puntaje.slice(0, 3).forEach(([u, p], i) => { if (p >= REG.podioMinimo) pagar(u, REG.podio[i], 'podio', 'chat', `podio:${lunes}:${i + 1}`, `Puesto ${i + 1} de la semana`); });
}

// ── Invitaciones (en tramos) ──
function liquidarInvitaciones() {
  for (const r of db.prepare('SELECT invitado_id, invita_id, at FROM puente_invitaciones').all()) {
    const ok = db.prepare('SELECT 1 FROM puente_emails WHERE haven_user_id = ? AND confirmado = 1').get(r.invitado_id) || db.prepare('SELECT 1 FROM puente_vinculos WHERE haven_user_id = ?').get(r.invitado_id);
    if (!ok || !esCuenta(r.invita_id) || !esCuenta(r.invitado_id)) continue;
    const at = Number(r.at) > 1e12 ? Number(r.at) : Number(r.at) * 1000;
    pagar(r.invita_id, REG.inv1, 'invitacion', 'chat', `inv1:${r.invitado_id}`, 'Tu invitado confirmó su cuenta');
    const dias = db.prepare('SELECT dia FROM puente_monedas_activos WHERE user_id = ? ORDER BY dia').all(r.invitado_id).map((x) => inicioDia(x.dia) + DIA / 2);
    if (dias.filter((t) => t >= at - DIA && t <= at + 14 * DIA).length >= 3) pagar(r.invita_id, REG.inv2, 'invitacion', 'chat', `inv2:${r.invitado_id}`, 'Tu invitado ya usa CV Chat');
    if (dias.filter((t) => t >= at + 21 * DIA && t <= at + 35 * DIA).length >= 2) pagar(r.invita_id, REG.inv3, 'invitacion', 'chat', `inv3:${r.invitado_id}`, 'Tu invitado sigue en CV Chat');
  }
}

// ── Primero en el ranking de Curveball ──
function liquidarCurveball(ahora) {
  let top = null;
  try { top = db.prepare('SELECT user_id u, puntaje FROM puente_curveball_puntajes ORDER BY puntaje DESC, actualizado ASC LIMIT 1').get(); } catch { return; } // (sin Curveball)
  if (!top || !(top.puntaje > Number(leer('curveball_record', 0)))) return;
  poner('curveball_record', top.puntaje);
  pagar(top.u, REG.curveballPrimero, 'ranking-primero', 'juegos', `curveball-primero:${top.u}:${diaAR(ahora).slice(0, 7)}`, 'Primero en el ranking de Curveball');
}

// ── Podio semanal de CS 1.6 ──
// El ranking del juego es el que sabe quién mató más cada semana. Se le pide
// por la red interna de Docker, con el secreto compartido, y se paga el podio.
// La función de reparto es pura para poder probarla: empates se llevan la suma
// de los puestos que ocupan (dos primeros: (150+100)/2 = 125 cada uno).
function repartirCS16(top, reg = CS16) {
  const gente = (Array.isArray(top) ? top : [])
    .map((j) => ({ uid: Number(j && j.uid), nombre: String((j && j.nombre) || 'Jugador'), kills: Math.max(0, Number(j && j.kills) || 0) }))
    .filter((j) => Number.isInteger(j.uid) && j.uid > 0 && j.kills > 0)
    .sort((a, b) => b.kills - a.kills || a.nombre.localeCompare(b.nombre, 'es'));
  if (gente.length < reg.participantes || !gente.length || gente[0].kills < reg.minimo) return [];
  const out = [];
  let i = 0;
  while (i < gente.length && i < reg.premios.length) {
    // Todos los que empatan con este puesto comparten la suma de los premios
    // de los puestos que ocupan (aunque el empate pase del tercero).
    let j = i + 1;
    while (j < gente.length && gente[j].kills === gente[i].kills) j++;
    const puestos = reg.premios.slice(i, Math.min(j, reg.premios.length));
    if (!puestos.length) break;
    const suma = puestos.reduce((a, b) => a + b, 0);
    const cuantos = j - i;
    const base = Math.floor(suma / cuantos);
    let resto = suma - base * cuantos;
    for (let k = i; k < j; k++) {
      const monedas = base + (resto > 0 ? 1 : 0);
      if (resto > 0) resto--;
      out.push({ uid: gente[k].uid, nombre: gente[k].nombre, kills: gente[k].kills, puesto: i + 1, monedas });
    }
    i = j;
  }
  return out;
}

async function liquidarCS16(lunes) {
  const base = String(process.env.CS16_INTERNO || '').replace(/\/+$/, '');
  const clave = String(process.env.CS16_SECRETO || '');
  if (!base || clave.length < 24) return true; // sin juego configurado: nada que pagar
  let d = null;
  try {
    const r = await fetch(`${base}/api/ranking/semana?semana=${encodeURIComponent(lunes)}`, {
      headers: { 'x-cvchat-clave': clave },
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) { warn('monedas fuentes: cs16: HTTP ' + r.status); return false; }
    d = await r.json();
  } catch (err) {
    warn('monedas fuentes: cs16:', err.message);
    return false;
  }
  if (!d || d.semana !== lunes) { warn('monedas fuentes: cs16: respuesta inesperada para ' + lunes); return false; }
  for (const p of repartirCS16(d.top)) {
    pagar(p.uid, p.monedas, 'cs16-semana', 'juegos', `cs16:semana:${lunes}:${p.uid}`, `Puesto ${p.puesto} de la semana en CS 1.6 (${p.kills} kills)`);
  }
  return true;
}

// ── El ciclo ──
let corriendo = false;
async function ciclo(ahora = Date.now()) {
  if (corriendo) return; corriendo = true;
  const paso = (nombre, fn) => { try { fn(); } catch (err) { warn(`monedas fuentes: ${nombre}:`, err.message); } };
  try {
    if (!leer('inicio', null)) { poner('inicio', ahora); poner('dia', diaAR(ahora)); poner('semana', lunesDe(ahora)); poner('cs16_semana', lunesDe(ahora)); log('monedas fuentes: arrancan (modo ' + M.modo() + ')'); }
    paso('bienvenidas', liquidarBienvenidas);
    paso('partidas', liquidarPartidas);
    // los dias que ya terminaron (desde el primero sin liquidar)
    let dia = leer('dia', diaAR(ahora));
    while (dia < diaAR(ahora)) { const d = dia; paso('dia ' + d, () => liquidarDia(d)); dia = sumarDias(dia, 1); poner('dia', dia); }
    let sem = leer('semana', lunesDe(ahora));
    while (sem < lunesDe(ahora)) { const s = sem; paso('semana ' + s, () => liquidarSemana(s)); sem = sumarDias(sem, 7); poner('semana', sem); }
    // CS 1.6 va aparte: si el juego no contesta, se reintenta sin frenar lo del chat
    let cs = leer('cs16_semana', null);
    if (!cs) { poner('cs16_semana', lunesDe(ahora)); cs = lunesDe(ahora); }
    while (cs < lunesDe(ahora)) {
      let ok = false;
      try { ok = await liquidarCS16(cs); } catch (err) { warn('monedas fuentes: cs16:', err.message); }
      if (!ok) break;
      cs = sumarDias(cs, 7); poner('cs16_semana', cs);
    }
    paso('invitaciones', liquidarInvitaciones);
    paso('curveball', () => liquidarCurveball(ahora));
  } catch (err) {
    warn('monedas fuentes:', err.message);
  } finally { corriendo = false; }
}

function setup(ctx) {
  ({ db, log, warn } = ctx);
  db.exec(`CREATE TABLE IF NOT EXISTS puente_monedas_estado (clave TEXT PRIMARY KEY, valor TEXT);
    CREATE TABLE IF NOT EXISTS puente_monedas_elo (juego TEXT NOT NULL, user_id INTEGER NOT NULL, rating REAL NOT NULL, PRIMARY KEY (juego, user_id));
    CREATE TABLE IF NOT EXISTS puente_monedas_pares (par TEXT PRIMARY KEY, c REAL NOT NULL, t INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS puente_monedas_bruto (user_id INTEGER NOT NULL, dia TEXT NOT NULL, bruto REAL NOT NULL, PRIMARY KEY (user_id, dia));
    CREATE TABLE IF NOT EXISTS puente_monedas_chat (user_id INTEGER NOT NULL, dia TEXT NOT NULL, validos INTEGER NOT NULL, PRIMARY KEY (user_id, dia));
    CREATE TABLE IF NOT EXISTS puente_monedas_activos (user_id INTEGER NOT NULL, dia TEXT NOT NULL, PRIMARY KEY (user_id, dia));
    CREATE TABLE IF NOT EXISTS puente_monedas_racha (user_id INTEGER PRIMARY KEY, ultimo TEXT NOT NULL, racha INTEGER NOT NULL);`);
  if (process.env.MONEDAS_FUENTES === '0' || ctx.sinReloj) return;
  setTimeout(() => ciclo(), 60e3).unref?.();
  setInterval(() => ciclo(), 10 * 60e3).unref?.();
}

module.exports = { setup, ciclo, REG, _pagoSuave: pagoSuave, _repartirCS16: repartirCS16 };
