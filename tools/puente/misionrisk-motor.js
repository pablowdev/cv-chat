// Motor de GlobalSiege (antes MissionRisk), de Doug Burner (GNU GPL v3):
// https://github.com/labarks/globalsiege . Las reglas son las del codigo original (Risk4.frm,
// modDice.bas, modCards.bas, modMissions.bas, modCheckWin.bas) con el juego de fabrica
// (Default War.mrk): 2 a 6 ejercitos, los 42 paises repartidos al azar con 1 tropa cada uno
// (sin que nadie empiece con un continente entero), 1 tropa cada 3 paises (minimo 3) mas los
// continentes, dados 3 contra 2 ordenados (el empate lo gana el que defiende), cartas de
// valor fijo (4, 6, 8 y 10; con 5 en la mano hay que canjear), movimientos limitados y misiones.
// El ataque es el del original: se elige el pais a atacar, se juntan tropas de uno o varios
// paises vecinos, se tiran los dados las veces que se quiera y, si se gana, entran todas las
// tropas juntadas (las que sobran se pueden retirar a un pais vecino).
// La compu (compuAccion) sigue las ideas de la del original: continentes y sus puertas,
// conseguir la carta del turno, defender las puertas de lo que tiene y acercar las tropas
// del interior a la frontera.
'use strict';
const MAPA = require('./web/misionrisk/mapa.js');

const N = 42;
const P = MAPA.paises;
const CONT = MAPA.continentes;
const MAZO = [14, 14, 14, 2]; // artilleria, infanteria, caballeria y comodines (udCardDeck)
const VALOR_CARTAS = { 1: 4, 2: 6, 3: 8, distintas: 10 }; // udFixedValues
const MINIMO = 3, CADA = 3; // udNewUnitClac: 1 tropa cada 3 paises, minimo 3
const PAISES_MISION = 18; // gcMission14
const CARTA = { 1: 'Artillería', 2: 'Infantería', 3: 'Caballería', 4: 'Comodín' };

// Las misiones (modMissions.bas): 0 dominar el mundo, 1-6 aniquilar un ejercito,
// 7-13 conquistar y mantener dos continentes, 14 ocupar 18 paises
const MISIONES = [{ texto: 'Conquistar el mundo: aniquilar a todos los demás ejércitos.' }];
for (let e = 1; e <= 6; e++) MISIONES.push({ ejercito: e, texto: `Aniquilar al ${MAPA.ejercitos[e].nombre}.` });
for (const [a, b] of [[1, 2], [1, 6], [2, 3], [3, 6], [2, 4], [4, 6], [2, 6]]) {
  MISIONES.push({ conts: [a, b], texto: `Conquistar ${CONT[a - 1].nombre} y ${CONT[b - 1].nombre} y mantenerlos hasta tu próximo turno.` });
}
MISIONES.push({ paises: PAISES_MISION, texto: `Ocupar ${PAISES_MISION} países cualesquiera y mantenerlos hasta tu próximo turno.` });

const vecinos = (a, b) => P[a].vecinos.includes(b);
const paisesDe = (S, e) => { let n = 0; for (let i = 1; i <= N; i++) if (S.dueno[i] === e) n++; return n; };
const tropasDe = (S, e) => { let n = 0; for (let i = 1; i <= N; i++) if (S.dueno[i] === e) n += S.tropas[i]; return n; };
const tieneCont = (S, e, c) => { for (let i = c.de; i <= c.a; i++) if (S.dueno[i] !== e) return false; return true; };
const nombre = (S, e) => (S.ej[e] && S.ej[e].nombre) || MAPA.ejercitos[e].nombre;

function nota(S, texto) { S.log.push(texto); if (S.log.length > 40) S.log.splice(0, S.log.length - 40); }
function mezclar(l, rng) { for (let i = l.length - 1; i > 0; i--) { const j = rng(i + 1); [l[i], l[j]] = [l[j], l[i]]; } return l; }

// ── Una partida nueva ──
// jugadores: [{ nombre }] en el orden de los ejercitos (Rojo, Verde, Azul...)
function nueva(jugadores, opciones, rng) {
  const n = jugadores.length;
  if (n < 2 || n > 6) throw new Error('De 2 a 6 ejércitos.');
  const S = {
    n, dueno: Array(N + 1).fill(0), tropas: Array(N + 1).fill(0),
    ej: [null], turno: 0, fase: 'poner', poner: 0, mazo: MAZO.slice(), conquisto: false,
    movidas: Array(N + 1).fill(0), salidas: Array(N + 1).fill(0), ataque: null, dados: null,
    ganaProximo: [], ganador: null, log: [], ronda: 1, jugada: 0, pasos: 0,
    opciones: { misiones: opciones.misiones !== false, buitre: !!opciones.buitre },
  };
  for (let e = 1; e <= 6; e++) S.ej.push(e <= n ? { nombre: jugadores[e - 1].nombre, vivo: true, cartas: [], mision: 0, inicial: 0, conquistas: 0, perdidas: 0, bajas: 0 } : null);
  // Reparto (initializePlayers): 42 / n paises para cada uno, hasta que nadie tenga un continente entero
  const cuantos = Array(n + 1).fill(Math.floor(N / n));
  const orden = mezclar([...Array(n).keys()].map(i => i + 1), rng);
  for (let i = 0; i < N % n; i++) cuantos[orden[i]]++;
  for (let intento = 0; intento < 400; intento++) {
    const lista = mezclar([...Array(N).keys()].map(i => i + 1), rng);
    let k = 0;
    for (let e = 1; e <= n; e++) for (let c = 0; c < cuantos[e]; c++) { S.dueno[lista[k]] = e; S.tropas[lista[k]] = 1; k++; }
    if (!CONT.some(c => { const d = S.dueno[c.de]; return tieneCont(S, d, c); })) break;
  }
  if (S.opciones.misiones) repartirMisiones(S, rng);
  for (let e = 1; e <= n; e++) S.ej[e].inicial = S.ej[e].mision;
  S.turno = S.primero = 1 + rng(n);
  nota(S, 'Empieza la guerra.');
  empezarTurno(S, S.turno, true);
  return S;
}

// DealNewMissions: al azar, sin repetir y sin que nadie tenga que aniquilarse a si mismo. Las de
// aniquilar solo con 3 o mas ejercitos; la de 18 paises no con 2 (cada uno ya arranca con 21)
function repartirMisiones(S, rng) {
  const activa = MISIONES.map((m, i) => i > 0 && (!m.ejercito || (S.n >= 3 && m.ejercito <= S.n)) && !(m.paises && S.n <= 2));
  for (let e = 1; e <= S.n; e++) {
    const posibles = [];
    for (let i = 1; i < MISIONES.length; i++) if (activa[i] && MISIONES[i].ejercito !== e) posibles.push(i);
    const m = posibles.length ? posibles[rng(posibles.length)] : 0;
    S.ej[e].mision = m;
    if (m) activa[m] = false;
  }
}

// GetPlayerValue: 1 cada 3 paises (minimo 3) mas los continentes enteros
function valor(S, e) {
  const n = paisesDe(S, e);
  if (!n) return 0;
  let v = Math.max(MINIMO, Math.floor(n / CADA));
  for (const c of CONT) if (tieneCont(S, e, c)) v += c.extra;
  return v;
}

function empezarTurno(S, e, primero) {
  S.turno = e; S.ataque = null; S.dados = null; S.conquisto = false; S.pasos = 0;
  S.movidas.fill(0); S.salidas.fill(0);
  if (!primero && ganaAlEmpezar(S, e)) return;
  S.poner = valor(S, e);
  S.fase = S.ej[e].cartas.length >= 5 ? 'canje' : 'poner';
}

// ── Cartas ──
// GetCardValue (valores fijos): tres iguales 4, 6 u 8; una de cada una o con dos comodines 10;
// un comodin con un par vale lo del par
function valorCartas(c) {
  if (!Array.isArray(c) || c.length !== 3) return 0;
  const com = c.filter(x => x === 4).length;
  const resto = c.filter(x => x !== 4);
  if (com >= 2) return VALOR_CARTAS.distintas;
  if (com === 1) return resto[0] === resto[1] ? VALOR_CARTAS[resto[0]] : VALOR_CARTAS.distintas;
  if (c[0] === c[1] && c[1] === c[2]) return VALOR_CARTAS[c[0]];
  if (new Set(c).size === 3) return VALOR_CARTAS.distintas;
  return 0;
}
// El mejor canje posible con las cartas de la mano (posiciones), o null
function mejorCanje(cartas) {
  let mejor = null;
  for (let i = 0; i < cartas.length; i++) for (let j = i + 1; j < cartas.length; j++) for (let k = j + 1; k < cartas.length; k++) {
    const v = valorCartas([cartas[i], cartas[j], cartas[k]]);
    // a igual valor, gastar los comodines lo mas tarde posible
    const com = [cartas[i], cartas[j], cartas[k]].filter(x => x === 4).length;
    if (v && (!mejor || v > mejor.v || (v === mejor.v && com < mejor.com))) mejor = { v, com, pos: [i, j, k] };
  }
  return mejor;
}
// DealACard: una carta al azar del mazo; si no quedan, se juntan las usadas y se mezclan
function darCarta(S, e, rng) {
  let total = S.mazo.reduce((a, b) => a + b, 0);
  if (!total) {
    S.mazo = MAZO.slice();
    for (let j = 1; j <= S.n; j++) for (const c of S.ej[j].cartas) S.mazo[c - 1]--;
    total = S.mazo.reduce((a, b) => a + b, 0);
    nota(S, 'Se mezclaron otra vez las cartas usadas.');
    if (!total) return;
  }
  let r = rng(total), tipo = 1;
  while (r >= S.mazo[tipo - 1]) { r -= S.mazo[tipo - 1]; tipo++; }
  S.mazo[tipo - 1]--;
  S.ej[e].cartas.push(tipo);
}

// ── Victorias (modCheckWin.bas) ──
function gana(S, e, texto) {
  if (S.ganador) return;
  S.ganador = { ej: e, texto };
  S.fase = 'fin'; S.ataque = null;
  nota(S, `🏆 ¡${nombre(S, e)} ganó la guerra ${texto}!`);
}
// Durante el turno: dominar el mundo, o aniquilar al ejercito de la mision
function revisarDurante(S) {
  if (S.ganador) return;
  for (let e = 1; e <= S.n; e++) if (S.ej[e].vivo && paisesDe(S, e) === N) return gana(S, e, 'dominando el mundo');
  for (let e = 1; e <= S.n; e++) {
    const m = MISIONES[S.ej[e].mision];
    if (!S.ej[e].vivo || !m.ejercito || paisesDe(S, m.ejercito) > 0) continue;
    // Si lo aniquilo otro, hay que cumplir otra mision: ocupar 18 paises (chkMsnMustComplete)
    if (S.turno !== e && !S.ganaProximo.includes(e)) {
      S.ej[e].mision = MISIONES.length - 1;
      nota(S, `${nombre(S, e)} se quedó sin su misión: ahora tiene otra.`);
      continue;
    }
    // Lo aniquilo el mismo: gana al empezar su proximo turno
    if (!S.ganaProximo.includes(e)) S.ganaProximo.push(e);
  }
}
// Al empezar el turno: las misiones de aniquilar, mantener continentes y ocupar 18 paises
function ganaAlEmpezar(S, e) {
  const m = MISIONES[S.ej[e].mision];
  if (m.ejercito && S.ganaProximo.includes(e)) { gana(S, e, `aniquilando al ${MAPA.ejercitos[m.ejercito].nombre}`); return true; }
  if (m.paises && paisesDe(S, e) >= m.paises) { gana(S, e, `ocupando y manteniendo ${m.paises} países`); return true; }
  if (m.conts && m.conts.every(c => tieneCont(S, e, CONT[c - 1]))) { gana(S, e, `conquistando y manteniendo ${CONT[m.conts[0] - 1].nombre} y ${CONT[m.conts[1] - 1].nombre}`); return true; }
  return false;
}

// ── Las jugadas ──
// Devuelve null si salio bien o el texto del error
function aplicar(S, e, a, rng) {
  if (S.ganador) return 'La guerra terminó.';
  if (S.turno !== e) return 'No es tu turno.';
  const t = a && a.tipo;
  const pais = (x) => { const n = Number(x); return n >= 1 && n <= N && Number.isInteger(n) ? n : 0; };
  const cant = (x, max) => Math.max(1, Math.min(max, Math.floor(Number(x)) || 1));
  S.jugada++; S.pasos++;
  if (t === 'canjear') {
    if (!['canje', 'poner', 'atacar'].includes(S.fase)) return 'Ahora no se pueden canjear cartas.';
    if (S.ataque) return 'Primero terminá el ataque.';
    const pos = Array.isArray(a.cartas) ? [...new Set(a.cartas.map(Number))] : [];
    const mano = S.ej[e].cartas;
    if (pos.length !== 3 || pos.some(i => !(i >= 0 && i < mano.length))) return 'Elegí tres cartas.';
    const v = valorCartas(pos.map(i => mano[i]));
    if (!v) return 'Esas tres cartas no forman un canje.';
    S.ej[e].cartas = mano.filter((c, i) => !pos.includes(i));
    S.poner += v;
    S.fase = S.ej[e].cartas.length >= 5 ? 'canje' : 'poner';
    nota(S, `${nombre(S, e)} canjeó cartas por ${v} tropas.`);
    return null;
  }
  if (S.fase === 'canje') return 'Con cinco cartas hay que canjear.';
  if (t === 'poner') {
    if (S.fase !== 'poner') return 'Ya pusiste todas las tropas.';
    const p = pais(a.pais);
    if (!p || S.dueno[p] !== e) return 'Las tropas van en un país tuyo.';
    const n = cant(a.n, S.poner);
    S.tropas[p] += n; S.poner -= n;
    if (!S.poner) S.fase = 'atacar';
    return null;
  }
  if (S.fase === 'poner') return 'Primero poné las tropas nuevas.';
  if (t === 'objetivo') {
    if (S.fase !== 'atacar') return 'Ya no podés atacar en este turno.';
    if (S.ataque && S.ataque.juntadas) return 'Terminá el ataque que empezaste (o retirate).';
    const p = pais(a.pais);
    if (!p || S.dueno[p] === e) return 'Elegí un país enemigo.';
    if (!P[p].vecinos.some(v => S.dueno[v] === e && S.tropas[v] > 1)) return 'No tenés un país vecino con tropas para atacarlo.';
    S.ataque = { objetivo: p, juntadas: 0, origenes: {} };
    S.dados = null;
    return null;
  }
  if (t === 'juntar') {
    const A = S.ataque;
    if (S.fase !== 'atacar' || !A) return 'Primero elegí el país a atacar.';
    const p = pais(a.pais);
    if (!p || S.dueno[p] !== e || !vecinos(p, A.objetivo)) return 'Las tropas tienen que salir de un país tuyo vecino.';
    if (S.tropas[p] <= 1) return 'En ese país queda una sola tropa.';
    const n = cant(a.n, S.tropas[p] - 1);
    S.tropas[p] -= n; A.juntadas += n; A.origenes[p] = (A.origenes[p] || 0) + n;
    return null;
  }
  if (t === 'retirar') {
    const A = S.ataque;
    if (!A || !A.juntadas) return 'No hay tropas para retirar.';
    const p = pais(a.pais) || Number(Object.keys(A.origenes)[0]);
    if (!p || S.dueno[p] !== e || !vecinos(p, A.objetivo)) return 'Se retiran a un país tuyo vecino.';
    const n = a.n === 'todas' ? A.juntadas : cant(a.n, A.juntadas);
    S.tropas[p] += n; A.juntadas -= n;
    if (!A.juntadas) S.ataque = null;
    return null;
  }
  if (t === 'tirar') {
    const A = S.ataque;
    if (S.fase !== 'atacar' || !A || !A.juntadas) return 'Juntá tropas para atacar.';
    const veces = a.todo ? 999 : Math.max(1, Math.min(20, Number(a.veces) || 1));
    for (let i = 0; i < veces && S.ataque && !S.ganador; i++) tirar(S, e, rng);
    return null;
  }
  if (t === 'mover' || t === 'pasar') {
    // Lo juntado y no usado vuelve a su pais
    if (S.ataque) devolver(S);
    if (t === 'pasar') { if (S.fase === 'atacar') S.fase = 'mover'; return null; }
    if (S.fase === 'atacar') S.fase = 'mover';
    const de = pais(a.de), al = pais(a.a);
    if (!de || !al || S.dueno[de] !== e || S.dueno[al] !== e || !vecinos(de, al)) return 'Se mueve entre dos países tuyos vecinos.';
    if (S.tropas[de] <= 1) return 'En ese país queda una sola tropa.';
    let n = limitar(S, de, al, cant(a.n, S.tropas[de] - 1));
    if (S.tropas[de] - n < 1) n = S.tropas[de] - 1;
    if (n <= 0) return 'Esas tropas ya se movieron este turno.';
    S.tropas[de] -= n; S.tropas[al] += n;
    return null;
  }
  if (t === 'terminar') {
    if (S.ataque) devolver(S);
    if (S.conquisto) darCarta(S, e, rng);
    siguiente(S);
    return null;
  }
  S.jugada--; S.pasos--;
  return 'No entendí la jugada.';
}

function devolver(S) {
  const A = S.ataque;
  const o = Object.keys(A.origenes).map(Number).filter(p => S.dueno[p] === S.turno);
  if (A.juntadas && o.length) S.tropas[o[0]] += A.juntadas;
  S.ataque = null;
}

// Una tirada (AttackCountry y DiceBattleDamage): hasta 3 dados contra 2, ordenados de mayor a
// menor; cada par lo gana el mas alto y el empate el que defiende
function tirar(S, e, rng) {
  const A = S.ataque, p = A.objetivo, def = S.dueno[p];
  const da = Array.from({ length: Math.min(3, A.juntadas) }, () => 1 + rng(6)).sort((x, y) => y - x);
  const dd = Array.from({ length: Math.min(2, S.tropas[p]) }, () => 1 + rng(6)).sort((x, y) => y - x);
  let pa = 0, pd = 0;
  for (let i = 0; i < Math.min(da.length, dd.length); i++) { if (da[i] > dd[i]) pd++; else pa++; }
  A.juntadas -= pa; S.tropas[p] -= pd;
  S.ej[e].bajas += pd; S.ej[def].bajas += pa;
  S.dados = { a: da, d: dd, objetivo: p, atacante: e, defensor: def, pa, pd, n: (S.dados && S.dados.objetivo === p ? S.dados.n : 0) + 1 };
  if (S.tropas[p] <= 0) {
    // Conquistado: entran todas las tropas juntadas
    S.dueno[p] = e; S.tropas[p] = A.juntadas; S.ataque = null; S.conquisto = true;
    S.ej[e].conquistas++; S.ej[def].perdidas++;
    S.dados.conquista = true;
    nota(S, `${nombre(S, e)} conquistó ${P[p].nombre}.`);
    if (!paisesDe(S, def)) {
      S.ej[def].vivo = false;
      nota(S, `💀 ${nombre(S, def)} fue aniquilado.`);
      // Cartas del vencido (chkCardsVulture, si esta la opcion)
      if (S.opciones.buitre && S.ej[def].cartas.length) {
        S.ej[e].cartas.push(...S.ej[def].cartas); S.ej[def].cartas = [];
        if (S.ej[e].cartas.length >= 5) S.fase = 'canje';
      }
    }
    revisarDurante(S);
  } else if (A.juntadas <= 0) {
    S.ataque = null;
    nota(S, `${nombre(S, e)} perdió el ataque a ${P[p].nombre}.`);
  }
}

// limitMoves (movimientos limitados, el de fabrica): de un pais que no recibio tropas se mueve
// todo; uno que recibio puede pasar hasta 5 mas; y uno que ya paso 5, una sola
function limitar(S, de, al, n) {
  const T = S.movidas, I = S.salidas;
  if (T[de] === 0) { if (T[al] === 0) T[al] = 1; return n; }
  if (T[de] === 1) {
    if (T[al] < 2) T[al] = 2;
    if (I[de] + n >= 5) { n = 5 - I[de]; I[de] = 5; T[de] = 2; return n; }
    I[de] += n; return n;
  }
  if (T[al] < 2) { T[al] = 2; return 1; }
  return 0;
}

function siguiente(S) {
  let e = S.turno;
  for (let i = 0; i < 6; i++) { e = e % S.n + 1; if (S.ej[e].vivo) break; }
  // Una ronda nueva cada vez que se da la vuelta (contando desde el que empezo, aunque ya no este)
  const lugar = (x) => (x - S.primero + S.n) % S.n;
  if (lugar(e) <= lugar(S.turno)) S.ronda++;
  empezarTurno(S, e, false);
}

// ── La compu ──
// Una jugada por vez: el servidor la aplica y vuelve a preguntar. nivel 1 promedio, 2 sagaz
function compuAccion(S, e, nivel, rng) {
  if (S.ganador || S.turno !== e) return null;
  if (S.pasos > 400) return { tipo: 'terminar' };
  const yo = S.ej[e];
  if (S.fase === 'canje') { const c = mejorCanje(yo.cartas); return { tipo: 'canjear', cartas: c.pos }; }
  if (S.fase === 'poner') {
    const c = mejorCanje(yo.cartas);
    if (c && (nivel >= 2 || yo.cartas.length >= 4)) return { tipo: 'canjear', cartas: c.pos };
    return compuPoner(S, e, nivel, rng);
  }
  if (S.fase === 'atacar') return compuAtacar(S, e, nivel, rng);
  if (S.fase === 'mover') return compuMover(S, e, nivel) || { tipo: 'terminar' };
  return { tipo: 'terminar' };
}

const amenaza = (S, p) => P[p].vecinos.reduce((t, v) => t + (S.dueno[v] !== S.dueno[p] ? S.tropas[v] - 1 : 0), 0);
const frontera = (S, p) => P[p].vecinos.some(v => S.dueno[v] !== S.dueno[p]);

// El continente al que apunta: el que tiene mas a mano (los chicos y los de la mision primero)
function contObjetivo(S, e) {
  const m = MISIONES[S.ej[e].mision];
  let mejor = null;
  for (const c of CONT) {
    const tam = c.a - c.de + 1;
    let mios = 0, enemigos = 0;
    for (let i = c.de; i <= c.a; i++) { if (S.dueno[i] === e) mios++; else enemigos += S.tropas[i]; }
    if (mios === tam) continue;
    let s = (mios / tam) * 10 + (c.extra / tam) * 3 - enemigos / tam;
    if (m.conts && m.conts.includes(c.id)) s += 6;
    if (!mejor || s > mejor.s) mejor = { c, s };
  }
  return mejor && mejor.c;
}

function compuPoner(S, e, nivel, rng) {
  const mios = [];
  for (let i = 1; i <= N; i++) if (S.dueno[i] === e) mios.push(i);
  const borde = mios.filter(p => frontera(S, p));
  if (!borde.length) return { tipo: 'poner', pais: mios[0], n: S.poner };
  if (nivel < 2) {
    // Promedio: de a pocas, en paises de la frontera, mejor los que ya tienen tropas
    borde.sort((a, b) => S.tropas[b] - S.tropas[a]);
    const p = borde[rng(Math.min(3, borde.length))];
    return { tipo: 'poner', pais: p, n: Math.min(S.poner, 1 + rng(3)) };
  }
  // Sagaz: primero las puertas de los continentes que tiene (la mitad de lo que las amenaza)
  for (const c of CONT) {
    if (!tieneCont(S, e, c)) continue;
    let peor = null;
    for (let i = c.de; i <= c.a; i++) {
      if (!frontera(S, i)) continue;
      const falta = Math.ceil(amenaza(S, i) / 2) + 1 - S.tropas[i];
      if (falta > 0 && (!peor || falta > peor.falta)) peor = { p: i, falta };
    }
    if (peor) return { tipo: 'poner', pais: peor.p, n: Math.min(S.poner, peor.falta) };
  }
  // El resto, todo junto en el pais desde donde va a atacar: en el continente objetivo
  const obj = contObjetivo(S, e);
  let base = null;
  for (const p of borde) {
    let s = S.tropas[p];
    const c = MAPA.continenteDe(p);
    if (obj && c.id === obj.id) s += 20;
    if (obj && P[p].vecinos.some(v => MAPA.continenteDe(v).id === obj.id && S.dueno[v] !== e)) s += 15;
    s -= Math.max(0, ...P[p].vecinos.filter(v => S.dueno[v] !== e).map(v => S.tropas[v])) * 0.3;
    if (!base || s > base.s) base = { p, s };
  }
  return { tipo: 'poner', pais: base.p, n: S.poner };
}

// Las tropas que un pais puede sumar a un ataque: deja algo si tiene otros enemigos al lado
function disponible(S, p, objetivo, nivel) {
  const libre = S.tropas[p] - 1;
  if (nivel < 2) return Math.max(0, libre);
  const otros = P[p].vecinos.filter(v => v !== objetivo && S.dueno[v] !== S.dueno[p]).reduce((m, v) => Math.max(m, S.tropas[v]), 0);
  return Math.max(0, libre - Math.ceil(otros / 3));
}

function compuAtacar(S, e, nivel, rng) {
  const A = S.ataque;
  if (A) {
    const def = S.tropas[A.objetivo];
    // Junta de los vecinos que todavia pueden aportar
    const quiere = nivel >= 2 ? def * 2 + 3 : def + 3;
    if (A.juntadas < quiere) {
      for (const v of P[A.objetivo].vecinos) {
        if (S.dueno[v] !== e) continue;
        const d = disponible(S, v, A.objetivo, nivel);
        if (d > 0) return { tipo: 'juntar', pais: v, n: d };
      }
    }
    if (!A.juntadas) return { tipo: 'pasar' };
    // Sigue mientras le convenga; si no, se retira al pais de donde salieron mas
    const sigue = nivel >= 2 ? A.juntadas >= Math.max(2, def * 0.8) : A.juntadas >= 2 || def <= 1;
    if (sigue) return { tipo: 'tirar', veces: 3 };
    const o = Object.entries(A.origenes).sort((x, y) => y[1] - x[1]).map(x => Number(x[0])).find(p => S.dueno[p] === e);
    return { tipo: 'retirar', pais: o, n: 'todas' };
  }
  const m = MISIONES[S.ej[e].mision];
  const obj = nivel >= 2 ? contObjetivo(S, e) : null;
  let mejor = null;
  for (let t = 1; t <= N; t++) {
    if (S.dueno[t] === e) continue;
    let disp = 0;
    for (const v of P[t].vecinos) if (S.dueno[v] === e) disp += disponible(S, v, t, nivel);
    const def = S.tropas[t];
    if (!disp) continue;
    // Sagaz: con buena ventaja, o la justa para ganarse la carta del turno
    const necesita = nivel >= 2 ? Math.min(def * 1.5 + 2, S.conquisto ? 999 : def + 2) : def + 1;
    if (disp < necesita) continue;
    let s = disp / def + rng(100) / 100;
    if (nivel >= 2) {
      const c = MAPA.continenteDe(t), duenoT = S.dueno[t];
      if (obj && c.id === obj.id) s += 4;
      let faltan = 0; for (let i = c.de; i <= c.a; i++) if (S.dueno[i] !== e) faltan++;
      if (faltan === 1) s += 8 + c.extra;
      if (tieneCont(S, duenoT, c)) s += 5;
      if (m.ejercito === duenoT) s += 4;
      if (m.conts && m.conts.includes(c.id)) s += 4;
      if (paisesDe(S, duenoT) <= 2) s += 3;
    }
    if (!mejor || s > mejor.s) mejor = { t, s };
  }
  if (!mejor) return { tipo: 'pasar' };
  return { tipo: 'objetivo', pais: mejor.t };
}

// Acerca a la frontera las tropas del interior (las que no tienen enemigos al lado)
function compuMover(S, e, nivel) {
  if (S.pasos > 300) return null;
  const dist = Array(N + 1).fill(99);
  const cola = [];
  for (let i = 1; i <= N; i++) if (S.dueno[i] === e && frontera(S, i)) { dist[i] = 0; cola.push(i); }
  while (cola.length) {
    const p = cola.shift();
    for (const v of P[p].vecinos) if (S.dueno[v] === e && dist[v] > dist[p] + 1) { dist[v] = dist[p] + 1; cola.push(v); }
  }
  for (let i = 1; i <= N; i++) {
    if (S.dueno[i] !== e || dist[i] === 0 || dist[i] === 99 || S.tropas[i] <= 1 || S.movidas[i] !== 0) continue;
    const al = P[i].vecinos.filter(v => S.dueno[v] === e && dist[v] < dist[i]).sort((a, b) => S.tropas[b] - S.tropas[a])[0];
    if (al) return { tipo: 'mover', de: i, a: al, n: S.tropas[i] - 1 };
  }
  // Sagaz: una puerta muy amenazada recibe de un vecino tranquilo
  if (nivel >= 2) {
    for (let i = 1; i <= N; i++) {
      if (S.dueno[i] !== e || !frontera(S, i) || S.movidas[i] !== 0) continue;
      if (S.tropas[i] * 2 >= amenaza(S, i)) continue;
      const de = P[i].vecinos.find(v => S.dueno[v] === e && S.movidas[v] === 0 && S.tropas[v] > 2 && S.tropas[v] * 2 > amenaza(S, v) + 4);
      if (de) return { tipo: 'mover', de, a: i, n: Math.floor((S.tropas[de] - 1) / 2) };
    }
  }
  return null;
}

module.exports = {
  N, MISIONES, CARTA, nueva, aplicar, nota, valor, valorCartas, mejorCanje, compuAccion,
  paisesDe, tropasDe, vecinos,
};
