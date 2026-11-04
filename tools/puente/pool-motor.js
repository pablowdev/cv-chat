// Motor del Pool (8 bolas): la fisica y las reglas, sin pantalla. Lo usa pool.js: el servidor
// simula cada tiro de punta a punta y les manda a los dos jugadores el recorrido de las bolas
// cuadro por cuadro, asi los dos ven exactamente lo mismo y nadie puede hacer trampa.
//
// Las medidas y la fisica salen de medir cuadro por cuadro los dos videos de referencia (Yahoo
// Pool League 001 y 002; cada pixel del video son 2,332 unidades de aca):
//  - La mesa: 900 x 391 entre los centros de las troneras (385,9 x 167,5 px). Las bolas, radio 16
//    (7 px). El agujero de las troneras, radio 25 (10,6 px); las del medio, 22 mas afuera.
//  - Las bandas estan metidas hacia adentro de la linea de las troneras: 21 en las cortas y 12 en
//    las largas, cortadas cerca de cada tronera (la boca). Las puntas de la boca tambien rebotan.
//  - Rodando, la bola frena casi parejo: ROCE + ROCE_V * velocidad (ajustado a 9 rodadas limpias:
//    error medio de 9 unidades). Justo despues de un golpe patina y queda con 5/7 de la velocidad
//    (como el pool de verdad; en el video los tiros fuertes pierden un 30-45% enseguida).
//  - En las bandas sale con el mismo angulo y el 60% de la velocidad (medido en dos rebotes).
//  - La fuerza: fuerza^2.7 (la barra por la mitad es un tiro suave, como en el video).
// Mas el efecto: arriba/abajo despues del primer choque y al costado en la primera banda.

'use strict';

const W = 1000, H = 500;
const TL = 50, TR = 950, TT = 54.5, TB = 445.5;
const TW = TR - TL, TH = TB - TT;
const R = 16, D = R * 2, POCKET_R = 25;
// la bola cae cuando su centro entra en la boca: en las esquinas a menos de 42 del centro de la tronera,
// en las del medio a menos de 33 (asi entra la que viene pegada a la banda, como en el video)
const CAE_ESQ = 42, CAE_MEDIO = 33;
const MEDIO_AFUERA = 22;           // las troneras del medio, mas afuera que la linea de las esquinas
const BX = 21, BY = 12;            // cuanto entran las bandas (cortas y largas)
const BOCA = 75, BOCA_M = 31;      // la boca: en las esquinas, a menos de BOCA del centro no hay banda (cortadas en diagonal); en las del medio, a menos de BOCA_M
const MAX_POWER = 8000;
const CURVA = 2.7;
const ROCE = 80;                   // frenado rodando (unidades/s²)
const ROCE_V = 0.15;               // y el que crece con la velocidad (1/s)
const DESLIZ = 9000;               // frenado mientras patina, despues de un golpe (unidades/s²)
const RODAR = 5 / 7;               // la velocidad con la que empieza a rodar
const BANDA = 0.6;                 // lo que conserva al rebotar en una banda
const BALL_REST = 0.96;
const MAX_PASO = 4;                // a mucha velocidad el paso se parte para que nada se atraviese
const MIN_SPEED = 6;
const STEP = 1 / 180;
const MAX_STEPS = 180 * 40;        // un tiro no dura mas de 40 segundos
const FRAME_EVERY = 6;             // un cuadro cada 6 pasos: 30 por segundo
const HEAD_X = TL + TW / 4;        // la linea de cabecera

const POCKETS = [
  { x: TL, y: TT }, { x: TL + TW / 2, y: TT - MEDIO_AFUERA }, { x: TR, y: TT },
  { x: TL, y: TB }, { x: TL + TW / 2, y: TB + MEDIO_AFUERA }, { x: TR, y: TB },
];
// donde puede estar el centro de una bola sobre el paño (contra las bandas)
const XMIN = TL + BX + R, XMAX = TR - BX - R, YMIN = TT + BY + R, YMAX = TB - BY - R;
// las puntas de las bandas en cada boca (rebotan como un punto)
const PUNTAS = [];
const ESQ = [[TL, TT, 1, 1], [TR, TT, -1, 1], [TL, TB, 1, -1], [TR, TB, -1, -1]];
for (const [px, py, sx, sy] of ESQ) {
  PUNTAS.push({ x: px + sx * BX, y: py + sy * Math.sqrt(BOCA * BOCA - BX * BX) }, { x: px + sx * Math.sqrt(BOCA * BOCA - BY * BY), y: py + sy * BY });
}
for (const [py, sy] of [[TT, 1], [TB, -1]]) PUNTAS.push({ x: TL + TW / 2 - BOCA_M, y: py + sy * BY }, { x: TL + TW / 2 + BOCA_M, y: py + sy * BY });
// las quijadas: de cada punta al borde del agujero, apuntando al centro de la tronera. Cierran la boca como un
// embudo: la bola que entra cae o rebota, nunca puede quedar parada fuera del paño (sobre la banda)
const QUIJADAS = [];
for (const [i, t] of PUNTAS.entries()) {
  const p = i < 8 ? POCKETS[[0, 0, 2, 2, 3, 3, 5, 5][i]] : POCKETS[i < 10 ? 1 : 4];
  const dx = t.x - p.x, dy = t.y - p.y, d = Math.hypot(dx, dy);
  let ux = dx / d, uy = dy / d;
  if (i < 8) { const a = 45 * Math.PI / 180, sx = Math.sign(p.x - 500) * -1, sy = Math.sign(p.y - 250) * -1, larga = i % 2 === 1;
    ux = larga ? sx * Math.cos(a) : -sx * Math.sin(a); uy = larga ? -sy * Math.sin(a) : sy * Math.cos(a); }
  QUIJADAS.push({ x1: t.x, y1: t.y, x2: p.x + ux * (POCKET_R - 2), y2: p.y + uy * (POCKET_R - 2) });
}
// en la boca no hay banda recta: la bola puede pasar la linea (entre las quijadas) y caer
const enEsquina = (x, y) => ESQ.some(([px, py]) => (x - px) ** 2 + (y - py) ** 2 < BOCA * BOCA);
const enBocaLado = (x, y) => enEsquina(x, y);                                                   // bandas cortas
const enBocaLargo = (x, y) => enEsquina(x, y) || Math.abs(x - (TL + TW / 2)) < BOCA_M;           // bandas largas

// ── La mesa ──
function rack() {
  const balls = [{ n: 0, x: HEAD_X, y: TT + TH / 2, on: true }];
  const ax = TL + TW * 3 / 4, ay = TT + TH / 2, dx = Math.sqrt(3) * R + 0.01;
  const filas = [[1], [2, 9], [3, 8, 10], [11, 4, 12, 5], [6, 13, 7, 14, 15]];
  filas.forEach((f, row) => f.forEach((n, i) => balls.push({ n, x: ax + row * dx, y: ay - (row * (D + 0.02)) / 2 + i * (D + 0.02), on: true })));
  return balls;
}

// El estado de una partida (lo guarda pool.js tal cual, en JSON)
function nueva(empieza) {
  return {
    bolas: rack(), turno: empieza, grupos: [null, null], salida: true,
    enMano: true, cabecera: true, bandeja: [], ganador: null, motivo: null, texto: '',
  };
}

const enGrupo = (n, g) => (g === 'lisas' ? n >= 1 && n <= 7 : g === 'rayadas' ? n >= 9 && n <= 15 : false);
const limpio = (S, g) => !S.bolas.some(b => b.on && b.n !== 0 && b.n !== 8 && enGrupo(b.n, g));
const blanca = (S) => S.bolas.find(b => b.n === 0);

// Donde se puede poner la blanca (bola en mano; en la salida, solo detras de la cabecera)
function sePuedePoner(S, x, y) {
  if (!(x >= XMIN && x <= XMAX && y >= YMIN && y <= YMAX)) return false;
  if (S.cabecera && x > HEAD_X) return false;
  for (const b of S.bolas) if (b.n !== 0 && b.on && (b.x - x) ** 2 + (b.y - y) ** 2 < D * D) return false;
  for (const p of POCKETS) if ((p.x - x) ** 2 + (p.y - y) ** 2 < (POCKET_R + R) ** 2) return false;
  return true;
}
function lugarLibre(S) {
  if (sePuedePoner(S, HEAD_X, TT + TH / 2)) return { x: HEAD_X, y: TT + TH / 2 };
  for (let x = XMIN + 2; x < XMAX; x += 20) for (let y = YMIN + 2; y < YMAX; y += 20) if (sePuedePoner(S, x, y)) return { x, y };
  return { x: HEAD_X, y: TT + TH / 2 };
}

// ── La fisica de un tiro ──
// tiro: { ang (radianes), fuerza (0..1), efecto: { x, y } (-1..1; y negativo = arriba) }
// Devuelve lo que paso (primera bola tocada, metidas, si se metio la blanca) y, si grabar,
// los cuadros (x, y de cada bola; -1 si ya entro) y los sonidos (cuadro, tipo, fuerza)
function simular(bolas, tiro, grabar) {
  const B = bolas.map(b => ({ n: b.n, x: b.x, y: b.y, vx: 0, vy: 0, on: b.on, rueda: 0 }));
  const cue = B.find(b => b.n === 0);
  const dir = { x: Math.cos(tiro.ang), y: Math.sin(tiro.ang) };
  const v0 = Math.pow(Math.max(0.03, Math.min(1, tiro.fuerza)), CURVA) * MAX_POWER;
  cue.vx = dir.x * v0; cue.vy = dir.y * v0; cue.rueda = v0 * RODAR; // patina hasta 5/7 y ahi rueda
  const ef = { x: tiro.efecto.x, y: tiro.efecto.y, bola: false, banda: false };
  const out = { primera: null, metidas: [], blanca: false, bandas: 0, frames: [], sonidos: [] };
  const sonido = (tipo, f) => { if (grabar && out.sonidos.length < 400) out.sonidos.push([out.frames.length, tipo, Math.round(Math.min(1, f) * 100) / 100]); };
  const foto = () => { const f = []; for (const b of B) { f.push(b.on ? Math.round(b.x * 10) / 10 : -1, b.on ? Math.round(b.y * 10) / 10 : -1); } out.frames.push(f); };
  if (grabar) { foto(); sonido('taco', tiro.fuerza); }

  const rebote = (b, v) => {
    if (v > 30) sonido('banda', v / 1500);
    b.rueda = 0;
    if (b === cue) out.bandas++;
    // efecto al costado: en la primera banda la blanca sale mas abierta o mas cerrada
    if (b === cue && !ef.banda && Math.abs(ef.x) > 0.05) {
      ef.banda = true;
      const a = ef.x * 0.35, c = Math.cos(a), s = Math.sin(a);
      const vx = b.vx * c - b.vy * s, vy = b.vx * s + b.vy * c;
      b.vx = vx; b.vy = vy;
    }
  };
  const pared = (b) => {
    // las bandas cortas (izquierda y derecha) y las largas (arriba y abajo), salvo en las bocas
    if (!enBocaLado(b.x, b.y)) {
      if (b.x < XMIN && b.vx < 0) { const v = -b.vx; b.x = XMIN; b.vx = v * BANDA; b.vy *= BANDA; rebote(b, v); }
      else if (b.x > XMAX && b.vx > 0) { const v = b.vx; b.x = XMAX; b.vx = -v * BANDA; b.vy *= BANDA; rebote(b, v); }
    }
    if (!enBocaLargo(b.x, b.y)) {
      if (b.y < YMIN && b.vy < 0) { const v = -b.vy; b.y = YMIN; b.vy = v * BANDA; b.vx *= BANDA; rebote(b, v); }
      else if (b.y > YMAX && b.vy > 0) { const v = b.vy; b.y = YMAX; b.vy = -v * BANDA; b.vx *= BANDA; rebote(b, v); }
    }
    // las quijadas (con sus puntas): el punto del segmento mas cercano a la bola
    for (const q of QUIJADAS) {
      const sx = q.x2 - q.x1, sy = q.y2 - q.y1, l2 = sx * sx + sy * sy;
      const t = Math.max(0, Math.min(1, ((b.x - q.x1) * sx + (b.y - q.y1) * sy) / l2));
      const cx = q.x1 + sx * t, cy = q.y1 + sy * t, dx = b.x - cx, dy = b.y - cy, d2 = dx * dx + dy * dy;
      if (d2 >= R * R || d2 === 0) continue;
      const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, vn = b.vx * nx + b.vy * ny;
      b.x = cx + nx * R; b.y = cy + ny * R;
      if (vn < 0) { b.vx -= (1 + BANDA) * vn * nx; b.vy -= (1 + BANDA) * vn * ny; b.vx *= 0.85; b.vy *= 0.85; rebote(b, -vn); }
    }
    // por las dudas: nunca fuera de la mesa (la boca termina en el agujero)
    if (b.x < TL - 10) { b.x = TL - 10; b.vx = Math.abs(b.vx) * BANDA; }
    if (b.x > TR + 10) { b.x = TR + 10; b.vx = -Math.abs(b.vx) * BANDA; }
    if (b.y < TT - MEDIO_AFUERA - 8) { b.y = TT - MEDIO_AFUERA - 8; b.vy = Math.abs(b.vy) * BANDA; }
    if (b.y > TB + MEDIO_AFUERA + 8) { b.y = TB + MEDIO_AFUERA + 8; b.vy = -Math.abs(b.vy) * BANDA; }
  };
  const choque = (a, b) => {
    const dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy;
    if (d2 >= D * D || d2 === 0) return;
    const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, ov = (D - d) / 2 + 0.01;
    a.x -= nx * ov; a.y -= ny * ov; b.x += nx * ov; b.y += ny * ov;
    const vn = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
    if (vn <= 0) return;
    if (out.primera === null) { if (a === cue) out.primera = b.n; else if (b === cue) out.primera = a.n; }
    if (vn > 20) sonido('bola', vn / 1500);
    const j = (1 + BALL_REST) * vn / 2;
    a.vx -= j * nx; a.vy -= j * ny; b.vx += j * nx; b.vy += j * ny;
    // despues del golpe las dos patinan un instante y siguen rodando con 5/7
    a.rueda = Math.hypot(a.vx, a.vy) * RODAR; b.rueda = Math.hypot(b.vx, b.vy) * RODAR;
    // efecto arriba/abajo: despues del primer choque la blanca sigue (arriba) o vuelve (abajo)
    if (!ef.bola && (a === cue || b === cue)) {
      ef.bola = true;
      if (Math.abs(ef.y) > 0.05) { const k = -ef.y * 0.7 * j; cue.vx += dir.x * k; cue.vy += dir.y * k; cue.rueda = Math.hypot(cue.vx, cue.vy) * RODAR; }
    }
  };

  for (let paso = 1; paso <= MAX_STEPS; paso++) {
    // si alguna va muy rapido, el paso se parte en pedazos (que ninguna avance mas de MAX_PASO por pedazo)
    let vmax = 0;
    for (const b of B) if (b.on) vmax = Math.max(vmax, Math.abs(b.vx), Math.abs(b.vy));
    const partes = Math.max(1, Math.ceil(vmax * STEP / MAX_PASO)), dt = STEP / partes;
    for (let k = 0; k < partes; k++) {
      for (const b of B) {
        if (!b.on) continue;
        b.x += b.vx * dt; b.y += b.vy * dt;
        const sp = Math.hypot(b.vx, b.vy);
        if (sp > 0) {
          // patinando (hasta llegar a la velocidad de rodar) frena fuerte; rodando, casi parejo
          let ns = b.rueda > 0 && sp > b.rueda ? Math.max(b.rueda, sp - DESLIZ * dt) : sp - (ROCE + ROCE_V * sp) * dt;
          if (b.rueda > 0 && ns <= b.rueda) b.rueda = 0;
          if (ns < MIN_SPEED) { b.vx = 0; b.vy = 0; b.rueda = 0; } else { b.vx = b.vx / sp * ns; b.vy = b.vy / sp * ns; }
        }
      }
      for (const b of B) if (b.on) pared(b);
      for (let i = 0; i < B.length; i++) { if (!B[i].on) continue; for (let j = i + 1; j < B.length; j++) if (B[j].on) choque(B[i], B[j]); }
      for (const b of B) {
        if (!b.on) continue;
        for (const [pi, p] of POCKETS.entries()) {
          const cae = pi === 1 || pi === 4 ? CAE_MEDIO : CAE_ESQ;
          if ((b.x - p.x) ** 2 + (b.y - p.y) ** 2 < cae * cae) {
            b.on = false; b.vx = 0; b.vy = 0;
            if (b.n === 0) out.blanca = true; else out.metidas.push(b.n);
            sonido('tronera', 1);
            break;
          }
        }
      }
    }
    const quietas = !B.some(b => b.on && (b.vx || b.vy));
    if (grabar && (paso % FRAME_EVERY === 0 || quietas)) foto();
    if (quietas) break;
  }
  out.bolas = B.map(b => ({ n: b.n, x: Math.round(b.x * 100) / 100, y: Math.round(b.y * 100) / 100, on: b.on }));
  return out;
}

// ── Las reglas: que pasa despues de un tiro (las del pool original del dueño) ──
// Devuelve { falta, razon, sigue, gano, perdio, rearma } y deja el estado listo para el siguiente
function aplicar(S, r) {
  const yo = S.turno, otro = 1 - yo, grupo = S.grupos[yo];
  let falta = false, razon = '';
  if (r.blanca) { falta = true; razon = 'la blanca se fue a la tronera'; }
  else if (r.primera === null) { falta = true; razon = 'no le pegó a ninguna bola'; }
  else if (r.primera === 8) { if (!(grupo && limpio(S, grupo))) { falta = true; razon = 'le pegó primero a la 8'; } }
  else if (grupo && !enGrupo(r.primera, grupo)) { falta = true; razon = 'le pegó primero a una bola del rival'; }

  S.bolas = r.bolas;
  for (const n of r.metidas) S.bandeja.push(n);

  // La 8
  if (r.metidas.includes(8)) {
    if (S.salida) {
      // la 8 en la salida: se rearma y vuelve a romper el mismo
      Object.assign(S, nueva(yo));
      S.texto = 'Entró la 8 en la salida: se rearma el triángulo y rompe de nuevo.';
      return { rearma: true };
    }
    const bien = grupo && limpio(S, grupo) && !falta;
    S.ganador = bien ? yo : otro;
    S.motivo = bien ? 'la8' : 'la8-antes';
    S.texto = bien ? 'Metió la 8: ganó la partida.' : (falta ? `Metió la 8 con falta (${razon}): perdió la partida.` : 'Metió la 8 antes de tiempo: perdió la partida.');
    return { fin: true };
  }

  // Los grupos: el primero que mete sin falta se queda con el de esa bola
  if (!grupo && !falta && r.metidas.length) {
    const g = r.metidas[0] <= 7 ? 'lisas' : 'rayadas';
    S.grupos[yo] = g; S.grupos[otro] = g === 'lisas' ? 'rayadas' : 'lisas';
  }
  S.salida = false;
  S.cabecera = false;
  if (falta) {
    S.turno = otro;
    S.enMano = true;
    const c = S.bolas.find(b => b.n === 0);
    c.on = true;
    const p = lugarLibre(S); c.x = p.x; c.y = p.y;
    S.texto = `Falta: ${razon}.`;
    return { falta: true, razon };
  }
  S.enMano = false;
  if (r.metidas.length) {
    S.texto = r.metidas.length === 1 ? `Metió la ${r.metidas[0]}.` : `Metió ${r.metidas.length} bolas.`;
    return { sigue: true };
  }
  S.turno = otro;
  S.texto = '';
  return { pasa: true };
}

// Valida y juega un tiro: { ang, fuerza, efecto: {x,y}, blanca: {x,y} (si tiene bola en mano) }
function tirar(S, t) {
  const ang = Number(t.ang), fuerza = Number(t.fuerza);
  if (!Number.isFinite(ang) || !Number.isFinite(fuerza)) return { error: 'Tiro inválido.' };
  let ex = Number(t.efecto && t.efecto.x) || 0, ey = Number(t.efecto && t.efecto.y) || 0;
  const de = Math.hypot(ex, ey); if (de > 0.8) { ex *= 0.8 / de; ey *= 0.8 / de; }
  const c = blanca(S);
  if (S.enMano && t.blanca) {
    const x = Number(t.blanca.x), y = Number(t.blanca.y);
    if (!sePuedePoner(S, x, y)) return { error: 'La blanca no se puede poner ahí.' };
    c.x = x; c.y = y; c.on = true;
  }
  const desde = S.bolas.map(b => ({ n: b.n, x: b.x, y: b.y, on: b.on }));
  const r = simular(S.bolas, { ang, fuerza: Math.max(0.03, Math.min(1, fuerza)), efecto: { x: ex, y: ey } }, true);
  const quien = S.turno;
  const res = aplicar(S, r);
  return { ok: true, quien, res, recorrido: { desde, frames: r.frames, sonidos: r.sonidos, ang, fuerza, efecto: { x: ex, y: ey } } };
}

// ── La compu: busca un tiro que meta una bola suya sin falta (con un error segun el nivel) ──
const ERROR = { 1: 0.05, 2: 0.02, 3: 0.006 };
function compu(S, nivel, rnd = Math.random) {
  const g = S.grupos[S.turno];
  const objetivos = S.bolas.filter(b => b.on && b.n !== 0 && (g ? (limpio(S, g) ? b.n === 8 : enGrupo(b.n, g)) : b.n !== 8));
  const c = blanca(S);
  // Con bola en mano: prueba poner la blanca detras de cada bola, en linea con una tronera
  const lugares = [{ x: c.x, y: c.y }];
  if (S.enMano) {
    for (const o of objetivos.slice(0, 6)) for (const p of POCKETS) {
      const ux = o.x - p.x, uy = o.y - p.y, u = Math.hypot(ux, uy) || 1;
      const x = o.x + ux / u * 120, y = o.y + uy / u * 120;
      if (sePuedePoner(S, x, y)) lugares.push({ x, y });
    }
  }
  const tiros = [];
  for (const L of lugares.slice(0, 8)) {
    for (const o of objetivos) for (const p of POCKETS) {
      // la "bola fantasma": donde tiene que estar la blanca al pegarle para mandarla a la tronera
      const ux = p.x - o.x, uy = p.y - o.y, u = Math.hypot(ux, uy) || 1;
      const gx = o.x - ux / u * D, gy = o.y - uy / u * D; // (D: dos radios)
      const ax = gx - L.x, ay = gy - L.y;
      const corte = (ax * ux + ay * uy) / ((Math.hypot(ax, ay) || 1) * u);
      if (corte < 0.25) continue; // muy finito
      tiros.push({ L, ang: Math.atan2(ay, ax), dist: Math.hypot(ax, ay) + u, corte });
    }
  }
  tiros.sort((a, b) => b.corte - a.corte);
  let mejor = null;
  const probar = (L, ang, fuerza) => {
    const Sb = JSON.parse(JSON.stringify(S));
    const cb = blanca(Sb); cb.x = L.x; cb.y = L.y; cb.on = true;
    const r = simular(Sb.bolas, { ang, fuerza, efecto: { x: 0, y: 0 } }, false);
    const res = aplicar(Sb, r);
    let p = 0;
    if (res.fin) p = Sb.ganador === S.turno ? 1000 : -1000;
    else if (res.rearma) p = 5;
    else if (res.falta) p = -50;
    else p = (res.sigue ? 40 * r.metidas.length : 0) + (r.primera !== null ? 2 : 0);
    p += rnd() * 3;
    if (!mejor || p > mejor.p) mejor = { p, L, ang, fuerza };
  };
  // la fuerza segun la distancia (con la curva de la fuerza, la mitad de la barra es un tiro suave)
  for (const t of tiros.slice(0, 18)) for (const f of [-0.06, 0.02, 0.12]) probar(t.L, t.ang, Math.max(0.3, Math.min(1, 0.36 + t.dist / 3000 + f)));
  if (!mejor || mejor.p < 0) {
    // ningun tiro bueno: le pega derecho a la bola propia mas cercana
    for (const o of objetivos.slice(0, 8)) for (const L of lugares.slice(0, 3)) probar(L, Math.atan2(o.y - L.y, o.x - L.x), 0.45);
  }
  if (!mejor) mejor = { L: { x: c.x, y: c.y }, ang: rnd() * Math.PI * 2, fuerza: 0.7 };
  const err = ERROR[nivel] || ERROR[2];
  return { ang: mejor.ang + (rnd() * 2 - 1) * err, fuerza: mejor.fuerza, efecto: { x: 0, y: 0 }, blanca: S.enMano ? { x: mejor.L.x, y: mejor.L.y } : null };
}

module.exports = { W, H, TL, TR, TT, TB, R, POCKET_R, POCKETS, HEAD_X, BX, BY, BOCA, BOCA_M, MEDIO_AFUERA, XMIN, XMAX, YMIN, YMAX, PUNTAS, QUIJADAS, nueva, tirar, compu, sePuedePoner, enGrupo, limpio, simular, aplicar };
