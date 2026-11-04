// Motor del Pool (8 bolas): la fisica y las reglas, sin pantalla. Lo usa pool.js: el servidor
// simula cada tiro de punta a punta y les manda a los dos jugadores el recorrido de las bolas
// cuadro por cuadro, asi los dos ven exactamente lo mismo y nadie puede hacer trampa.
// La fisica es la del pool que hizo el dueño del servidor (un paso fijo de 1/180 s, roce
// constante, rebotes con perdida y choques elasticos entre bolas), mas el efecto:
// arriba/abajo despues del primer choque y al costado en la primera banda.
//
// La mesa mide 1000 x 500; el paño va de (50, 50) a (950, 450).

'use strict';

const W = 1000, H = 500;
const TL = 50, TR = 950, TT = 50, TB = 450;
const TW = TR - TL, TH = TB - TT;
const R = 10, D = R * 2, POCKET_R = 24;
const MAX_POWER = 1700;
const FRICTION = 450;
const MIN_SPEED = 8;
const WALL_REST = 0.85;
const BALL_REST = 0.96;
const STEP = 1 / 180;
const MAX_STEPS = 180 * 40;        // un tiro no dura mas de 40 segundos
const FRAME_EVERY = 6;             // un cuadro cada 6 pasos: 30 por segundo
const HEAD_X = TL + TW / 4;        // la linea de cabecera

const POCKETS = [
  { x: TL, y: TT }, { x: TL + TW / 2, y: TT }, { x: TR, y: TT },
  { x: TL, y: TB }, { x: TL + TW / 2, y: TB }, { x: TR, y: TB },
];

// ── La mesa ──
function rack() {
  const balls = [{ n: 0, x: HEAD_X, y: TT + TH / 2, on: true }];
  const ax = TL + TW * 3 / 4, ay = TT + TH / 2, dx = Math.sqrt(3) * R;
  const filas = [[1], [2, 9], [3, 8, 10], [11, 4, 12, 5], [6, 13, 7, 14, 15]];
  filas.forEach((f, row) => f.forEach((n, i) => balls.push({ n, x: ax + row * dx, y: ay - (row * D) / 2 + i * D, on: true })));
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
  if (!(x >= TL + R && x <= TR - R && y >= TT + R && y <= TB - R)) return false;
  if (S.cabecera && x > HEAD_X) return false;
  for (const b of S.bolas) if (b.n !== 0 && b.on && (b.x - x) ** 2 + (b.y - y) ** 2 < D * D) return false;
  for (const p of POCKETS) if ((p.x - x) ** 2 + (p.y - y) ** 2 < (POCKET_R + R) ** 2) return false;
  return true;
}
function lugarLibre(S) {
  if (sePuedePoner(S, HEAD_X, TT + TH / 2)) return { x: HEAD_X, y: TT + TH / 2 };
  for (let x = TL + R + 5; x < TR - R; x += 20) for (let y = TT + R + 5; y < TB - R; y += 20) if (sePuedePoner(S, x, y)) return { x, y };
  return { x: HEAD_X, y: TT + TH / 2 };
}

// ── La fisica de un tiro ──
// tiro: { ang (radianes), fuerza (0..1), efecto: { x, y } (-1..1; y negativo = arriba) }
// Devuelve lo que paso (primera bola tocada, metidas, si se metio la blanca) y, si grabar,
// los cuadros (x, y de cada bola; -1 si ya entro) y los sonidos (cuadro, tipo, fuerza)
function simular(bolas, tiro, grabar) {
  const B = bolas.map(b => ({ n: b.n, x: b.x, y: b.y, vx: 0, vy: 0, on: b.on }));
  const cue = B.find(b => b.n === 0);
  const dir = { x: Math.cos(tiro.ang), y: Math.sin(tiro.ang) };
  const v0 = Math.max(0.03, Math.min(1, tiro.fuerza)) * MAX_POWER;
  cue.vx = dir.x * v0; cue.vy = dir.y * v0;
  const ef = { x: tiro.efecto.x, y: tiro.efecto.y, bola: false, banda: false };
  const out = { primera: null, metidas: [], blanca: false, bandas: 0, frames: [], sonidos: [] };
  const sonido = (tipo, f) => { if (grabar && out.sonidos.length < 400) out.sonidos.push([out.frames.length, tipo, Math.round(Math.min(1, f) * 100) / 100]); };
  const foto = () => { const f = []; for (const b of B) { f.push(b.on ? Math.round(b.x * 10) / 10 : -1, b.on ? Math.round(b.y * 10) / 10 : -1); } out.frames.push(f); };
  if (grabar) { foto(); sonido('taco', tiro.fuerza); }

  const pared = (b) => {
    const l = TL + R, rr = TR - R, t = TT + R, bb = TB - R;
    let reboto = false;
    if (b.x < l) { const v = Math.abs(b.vx); b.x = l; b.vx = v * WALL_REST; reboto = v; }
    else if (b.x > rr) { const v = Math.abs(b.vx); b.x = rr; b.vx = -v * WALL_REST; reboto = v; }
    if (b.y < t) { const v = Math.abs(b.vy); b.y = t; b.vy = v * WALL_REST; reboto = Math.max(reboto || 0, v); }
    else if (b.y > bb) { const v = Math.abs(b.vy); b.y = bb; b.vy = -v * WALL_REST; reboto = Math.max(reboto || 0, v); }
    if (reboto === false) return;
    if (reboto > 40) sonido('banda', reboto / 800);
    if (b === cue) out.bandas++;
    // efecto al costado: en la primera banda la blanca sale mas abierta o mas cerrada
    if (b === cue && !ef.banda && Math.abs(ef.x) > 0.05) {
      ef.banda = true;
      const a = ef.x * 0.35, c = Math.cos(a), s = Math.sin(a);
      const vx = b.vx * c - b.vy * s, vy = b.vx * s + b.vy * c;
      b.vx = vx; b.vy = vy;
    }
  };
  const choque = (a, b) => {
    const dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy;
    if (d2 >= D * D || d2 === 0) return;
    const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, ov = (D - d) / 2 + 0.01;
    a.x -= nx * ov; a.y -= ny * ov; b.x += nx * ov; b.y += ny * ov;
    const vn = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
    if (vn <= 0) return;
    if (out.primera === null) { if (a === cue) out.primera = b.n; else if (b === cue) out.primera = a.n; }
    if (vn > 25) sonido('bola', vn / 900);
    const j = (1 + BALL_REST) * vn / 2;
    a.vx -= j * nx; a.vy -= j * ny; b.vx += j * nx; b.vy += j * ny;
    // efecto arriba/abajo: despues del primer choque la blanca sigue (arriba) o vuelve (abajo)
    if (!ef.bola && (a === cue || b === cue)) {
      ef.bola = true;
      if (Math.abs(ef.y) > 0.05) { const k = -ef.y * 0.7 * j; cue.vx += dir.x * k; cue.vy += dir.y * k; }
    }
  };

  for (let paso = 1; paso <= MAX_STEPS; paso++) {
    for (const b of B) {
      if (!b.on) continue;
      b.x += b.vx * STEP; b.y += b.vy * STEP;
      const sp = Math.hypot(b.vx, b.vy);
      if (sp > 0) { const ns = sp - FRICTION * STEP; if (ns < MIN_SPEED) { b.vx = 0; b.vy = 0; } else { b.vx = b.vx / sp * ns; b.vy = b.vy / sp * ns; } }
    }
    for (const b of B) if (b.on) pared(b);
    for (let i = 0; i < B.length; i++) { if (!B[i].on) continue; for (let k = i + 1; k < B.length; k++) if (B[k].on) choque(B[i], B[k]); }
    for (const b of B) {
      if (!b.on) continue;
      for (const p of POCKETS) {
        if ((b.x - p.x) ** 2 + (b.y - p.y) ** 2 < POCKET_R * POCKET_R) {
          b.on = false; b.vx = 0; b.vy = 0;
          if (b.n === 0) out.blanca = true; else out.metidas.push(b.n);
          sonido('tronera', 1);
          break;
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
      const gx = o.x - ux / u * D, gy = o.y - uy / u * D;
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
  for (const t of tiros.slice(0, 18)) for (const f of [0.35, 0.55, 0.8]) probar(t.L, t.ang, Math.min(1, f + t.dist / 4000));
  if (!mejor || mejor.p < 0) {
    // ningun tiro bueno: le pega derecho a la bola propia mas cercana
    for (const o of objetivos.slice(0, 8)) for (const L of lugares.slice(0, 3)) probar(L, Math.atan2(o.y - L.y, o.x - L.x), 0.45);
  }
  if (!mejor) mejor = { L: { x: c.x, y: c.y }, ang: rnd() * Math.PI * 2, fuerza: 0.6 };
  const err = ERROR[nivel] || ERROR[2];
  return { ang: mejor.ang + (rnd() * 2 - 1) * err, fuerza: mejor.fuerza, efecto: { x: 0, y: 0 }, blanca: S.enMano ? { x: mejor.L.x, y: mejor.L.y } : null };
}

module.exports = { W, H, TL, TR, TT, TB, R, POCKET_R, POCKETS, HEAD_X, nueva, tirar, compu, sePuedePoner, enGrupo, limpio, simular, aplicar };
