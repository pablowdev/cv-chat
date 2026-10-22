// Motor de Funball: las reglas del juego original (DOS, 1995), rehechas en JavaScript
// para jugarlo en la app. Cada funcion sigue al procedimiento del original que reemplaza
// (entre corchetes, la direccion en el programa original), asi el resultado de cada jugada
// es el mismo: movimientos, choques, desbordes, las 13 bases, la arania y la compu.
//
// Tablero 8x8: cells[c][r] (columna 0..7, fila 0..7). Cada celda:
//   b  tipo de base, k color de la bola ('R', 'G', 'S' = huevo de la arania, '' = vacia),
//   s  tamanio (1..15), bc base que habia cuando se puso la bola, sp arania (o null).
// El rojo defiende (0,7) y quiere llegar a (7,0); el verde al reves.

'use strict';

const NORMAL = 0, HOLE = 1, SMALL = 2, PUMP = 3, ARMOR = 4, TELEPORT = 5, DRAIN = 6,
  SPRING = 7, SLIDE = 8, SOAP = 9, MAGNET = 10, CANNON = 11, MINE = 12;
const BASES = ['normal', 'agujero', 'chica', 'bomba', 'blindada', 'teletransportador', 'desague',
  'resorte', 'tobogan', 'jabon', 'iman', 'canion', 'mina'];
const DIRS = [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]];
// Reglas por defecto del original: crecer al atacar 1.0, al fusionar 1.0, al reventar a uno
// mas grande 0.5; al pasar de 15 la bola se parte en dos mitades
const ATTACK_F = 1.0, MERGE_F = 1.0, DEFECT_F = 0.5;
const EGG = { k: 'S', s: 3 };
const MAX_LAND = 30;

// Round de Turbo Pascal: al entero mas cercano, los .5 lejos del cero
const pRound = (x) => (x < 0 ? -Math.floor(-x + 0.5) : Math.floor(x + 0.5));
const sign = (x) => (x > 0 ? 1 : x < 0 ? -1 : 0);
const idiv = (a, b) => Math.trunc(a / b);
const other = (k) => (k === 'R' ? 'G' : 'R');
const i16 = (x) => ((x << 16) >> 16);

// ---------- celdas ----------
function at(S, c, r) { return c >= 0 && c < 8 && r >= 0 && r < 8 ? S.cells[c][r] : null; }
// [0389:0a1a] vacia: sin arania ni bola (un huevo cuenta como bola)
const isEmpty = (x) => !x.sp && !x.k;
const rec = (x) => ({ k: x.k, s: x.s, bc: x.bc });
function log(ctx, e) { if (ctx.log) ctx.log.push(e); }
// [0389:0f10] poner bola (color y tamanio); tamanio 0 = sin bola
function setBall(ctx, x, k, s) {
  x.k = k; x.s = s; x.bc = x.b;
  if (!x.k) x.s = 0; else if (!x.s) x.k = '';
  log(ctx, { t: 'bola', c: x.c, r: x.r, k: x.k, s: x.s });
}
function clearBall(ctx, x) { setBall(ctx, x, '', 0); }
function setBase(ctx, x, b) { x.b = b; log(ctx, { t: 'base', c: x.c, r: x.r, b }); }

// [0389:1083] puede caer ahi
function canLand(x, k) {
  if (x.sp || x.b === HOLE) return false;
  if (x.s > 0 && x.b === CANNON && x.k !== 'S') return false;
  if ((x.b === ARMOR || x.b === MAGNET) && x.s > 0 && x.k !== k && x.k !== 'S') return false;
  return true;
}
// [0389:0d23] es una bola propia que se puede mover (en el iman, las de 3 o menos quedan pegadas)
function isMine(x, k) {
  if (!x.s || x.k !== k) return false;
  return !(x.b === MAGNET && x.s < 4);
}

// [0389:10fc] destino en una direccion
function targetInDir(S, x, flag, ball, dx, dy) {
  if (flag && x.b !== CANNON) {
    const d = dx - dy;
    if (ball.k === 'R' && d < 0) return null;
    if (ball.k === 'G' && d > 0) return null;
  }
  if (x.b === PUMP || x.b === SLIDE || x.b === CANNON) {
    let res = null;
    for (let k = 1; ; k++) {
      if (x.b === CANNON && idiv(ball.s - 1, 5) * 2 + 2 < k) return res;
      const c = x.c + k * dx, r = x.r + k * dy;
      if (c < 0 || c > 7 || r < 0 || r > 7) return res;
      const y = S.cells[c][r];
      if (x.b === CANNON) {
        if (y.b !== HOLE && y.b !== ARMOR) res = y;
        if (!isEmpty(y)) return res;
      } else if (x.b === SLIDE) {
        if (y.b !== HOLE && y.b !== SLIDE) res = y;
        if (y.b !== SLIDE) return res;
      } else {
        if (canLand(y, ball.k)) res = y;
        if (!(isEmpty(y) && y.b === NORMAL)) return res;
      }
    }
  }
  const y = at(S, x.c + dx, x.r + dy);
  if (!y || !canLand(y, ball.k)) return null;
  if (y.b === SLIDE && !targetInDir(S, y, flag, ball, dx, dy)) return null;
  return y;
}

// [0389:0d6d] destinos posibles de la bola de una celda
function getTargets(S, x, flag, ball) {
  const out = [];
  if (x.b === SOAP) {
    for (let dx = -2; dx <= 2; dx++) {
      for (let dy = -2; dy <= 2; dy++) {
        const d = dx - dy;
        if ((ball.k === 'R' && d < 0) || (ball.k === 'G' && d > 0)) continue;
        const y = at(S, x.c + dx, x.r + dy);
        if (!y || y === x || y.b === HOLE) continue;
        out.push(y);
      }
    }
    return out;
  }
  for (const [dx, dy] of DIRS) {
    const y = targetInDir(S, x, flag, ball, dx, dy);
    if (y) out.push(y);
  }
  return out;
}

// [0389:0c5d]
function canMove(S, x, flag, y, ball) {
  if (!y || y === x) return false;
  let ok = targetInDir(S, x, flag, ball, sign(y.c - x.c), sign(y.r - x.r)) === y;
  if (x.b === PUMP && canLand(y, ball.k)) ok = true;
  return ok;
}

// [0512:072e] la celda siguiente en la misma direccion, rebotando en el borde;
// si no se puede, vuelve a la de origen
function springNext(S, flag, ball, cur, from) {
  const dx = sign(cur.c - from.c), dy = sign(cur.r - from.r);
  const nc = cur.c === 0 && dx < 0 ? 1 : cur.c === 7 && dx > 0 ? 6 : cur.c + dx;
  const nr = cur.r === 0 && dy < 0 ? 1 : cur.r === 7 && dy > 0 ? 6 : cur.r + dy;
  const next = at(S, nc, nr);
  if (!next) return from;
  if (next.b === SLIDE) return targetInDir(S, cur, flag, ball, next.c - cur.c, next.r - cur.r) || from;
  return canMove(S, cur, flag, next, ball) ? next : from;
}

// [0881:293d] hacia atras desde 'cur' (pasando por 'from'): la primera celda que no es agujero
function backCell(S, from, cur) {
  const dx = sign(cur.c - from.c), dy = sign(cur.r - from.r);
  for (let k = 1; k < 16; k++) {
    const y = at(S, cur.c - k * dx, cur.r - k * dy);
    if (y && y.b !== HOLE) return y;
  }
  return from;
}

// ---------- la jugada ----------
// [0881:3251]
function move(ctx, src, dst) {
  if (src.b === CANNON) return shoot(ctx, dst, src);
  if (src.b === PUMP) return pump(ctx, dst, src);
  const ball = rec(src);
  let moving = ball.s;
  if (src.b === MAGNET && ball.s > 3) moving = pRound(ball.s * 0.5);
  if (moving === ball.s) clearBall(ctx, src);
  else setBall(ctx, src, ball.k, ball.s - moving);
  log(ctx, { t: 'mueve', de: [src.c, src.r], a: [dst.c, dst.r], k: ball.k, s: moving });
  land(ctx, { k: ball.k, s: moving }, dst, src);
}

// [0881:4198] la bola cae en una celda
function land(ctx, ball, dst, src) {
  if (!dst) return;
  if (++ctx.depth >= MAX_LAND) return;
  if (ball.k === 'S') return eggLand(ctx, ball, dst, src);
  if (src && src.b === SOAP) return bubble(ctx, ball, dst, src);
  if (isEmpty(dst) || dst.k === 'S') return placeOnBase(ctx, ball, dst, src);
  if (dst.b === SOAP) { log(ctx, { t: 'revienta', c: dst.c, r: dst.r }); return placeOnBase(ctx, ball, dst, src); }
  if (dst.k === ball.k) {
    return merge(ctx, ball.k, ball.s + pRound(dst.s * MERGE_F), dst, src);
  }
  const d = sign(ball.s - dst.s);
  if (d < 0) return defect(ctx, ball, dst, src);
  if (d === 0) return cancel(ctx, dst);
  return attack(ctx, ball.k, ball.s + pRound(dst.s * ATTACK_F), dst, src);
}

// [0881:345e] dos bolas iguales se anulan
function cancel(ctx, dst) {
  log(ctx, { t: 'anulan', c: dst.c, r: dst.r });
  clearBall(ctx, dst);
}
// [0881:365e] se juntan dos propias
function merge(ctx, k, size, dst, src) {
  log(ctx, { t: 'fusion', c: dst.c, r: dst.r });
  setBall(ctx, dst, dst.k, size);
  if (dst.s > 15) overflow(ctx, dst.s, springNext(ctx.S, 0, { k, s: dst.s - 15 }, dst, src), dst);
}
// [0881:37a0] se come a una enemiga mas chica
function attack(ctx, k, size, dst, src) {
  log(ctx, { t: 'ataque', c: dst.c, r: dst.r });
  setBall(ctx, dst, k, size);
  if (dst.s > 15) overflow(ctx, dst.s, springNext(ctx.S, 0, { k, s: dst.s - 15 }, dst, src), dst);
}
// [0881:38d9] salta sobre una enemiga mas grande: la agranda (y si pasa de 15, revienta)
function defect(ctx, ball, dst) {
  const grown = pRound(ball.s * DEFECT_F) + dst.s;
  if (grown > 15) {
    log(ctx, { t: 'explota', c: dst.c, r: dst.r });
    setBall(ctx, dst, ball.k, idiv(ball.s, 2) - (15 - dst.s));
  } else {
    log(ctx, { t: 'deserta', c: dst.c, r: dst.r });
    setBall(ctx, dst, dst.k, grown);
  }
}
// [0881:29fd] pasa de 15: queda la mitad y la otra mitad sigue (rebota en el borde)
function overflow(ctx, size, next, dst) {
  if (size <= 15) return setBall(ctx, dst, dst.k, size);
  let keep = idiv(size, 2);
  if (dst.b === MAGNET) keep = 15;
  const over = size - keep, k = dst.k;
  setBall(ctx, dst, k, keep);
  const t = at(ctx.S, dst.c + sign(next.c - dst.c), dst.r + sign(next.r - dst.r));
  log(ctx, { t: 'desborda', c: dst.c, r: dst.r });
  if (t) { log(ctx, { t: 'mueve', de: [dst.c, dst.r], a: [t.c, t.r], k, s: over }); land(ctx, { k, s: over }, t, dst); }
}
// [0881:2bc5] cae sobre un huevo: +3
function eggAbsorb(ctx, ball, x, src) {
  const size = ball.s + 3;
  log(ctx, { t: 'huevo', c: x.c, r: x.r });
  setBall(ctx, x, ball.k, size);
  if (size > 15) overflow(ctx, size, springNext(ctx.S, 0, { k: ball.k, s: size - 15 }, x, src), x);
}
// [0881:3b4f] un huevo empujado
function eggLand(ctx, ball, dst, src) {
  if (isEmpty(dst)) return placeOnBase(ctx, { k: 'S', s: 3 }, dst, src);
  if (dst.k === 'R' || dst.k === 'G') return eggAbsorb(ctx, rec(dst), dst, src);
}
// [0881:1baf] sale de una base de jabon: es una burbuja que flota y revienta con cualquier cosa
function bubble(ctx, ball, dst, src) {
  if (!isEmpty(dst)) { log(ctx, { t: 'revienta', c: dst.c, r: dst.r }); return; }
  setBall(ctx, dst, ball.k, ball.s);
  if (dst.b === SPRING || dst.b === SLIDE) { log(ctx, { t: 'revienta', c: dst.c, r: dst.r }); return clearBall(ctx, dst); }
  if (dst.b === SOAP) return;
  placeOnBase(ctx, ball, dst, src);
}

// [0881:3c27] la bola queda en una base vacia: efecto de la base
function placeOnBase(ctx, ball, dst, src) {
  const S = ctx.S;
  if (ball.k !== 'S' && dst.k === 'S') {
    eggAbsorb(ctx, ball, dst, src);
    ball = rec(dst);
  }
  setBall(ctx, dst, ball.k, ball.s);
  switch (dst.b) {
    case TELEPORT: return teleport(ctx, dst);
    case DRAIN: if (ball.s > 0) { log(ctx, { t: 'desague', c: dst.c, r: dst.r }); clearBall(ctx, dst); } return;
    case SPRING: {
      const next = springNext(S, 0, ball, dst, src);
      log(ctx, { t: 'resorte', c: dst.c, r: dst.r });
      return move(ctx, dst, next);
    }
    case SLIDE: {
      const t = targetInDir(S, dst, 0, ball, sign(dst.c - src.c), sign(dst.r - src.r));
      return slide(ctx, t || src, dst);
    }
    case SOAP:
      if (ball.k === 'S') clearBall(ctx, dst);
      return;
    case CANNON:
      if (ball.k === 'S') return;
      log(ctx, { t: 'canion', c: dst.c, r: dst.r });
      return setBall(ctx, dst, dst.k, (idiv(ball.s - 1, 5) + 1) * 5);
    case MINE: return mine(ctx, dst);
    default: return;
  }
}

// [0881:19df] teletransportador: al siguiente libre hacia la meta enemiga
function teleport(ctx, x) {
  if (isEmpty(x) || x.k === 'S') return;
  let c = x.c, r = x.r, t = null;
  for (;;) {
    if (x.k === 'R') { if (c === 7) { if (r === 0) break; c = 0; r--; } else c++; } else { if (c === 0) { if (r === 7) break; c = 7; r++; } else c--; }
    const y = ctx.S.cells[c][r];
    if (y.b === TELEPORT && isEmpty(y)) { t = y; break; }
  }
  if (!t) return;
  log(ctx, { t: 'teletransporta', de: [x.c, x.r], a: [t.c, t.r] });
  setBall(ctx, t, x.k, x.s);
  clearBall(ctx, x);
}

// [0881:2ce7] tobogan: la bola sigue de largo y empuja lo que haya
function slide(ctx, next, cur) {
  const S = ctx.S;
  const ball = rec(cur);
  clearBall(ctx, cur);
  let free = isEmpty(next) || next.b === SOAP;
  const nb = rec(next);
  const can = canLand(next, ball.k);
  log(ctx, { t: 'mueve', de: [cur.c, cur.r], a: [next.c, next.r], k: ball.k, s: ball.s });
  if (next.b === ARMOR && nb.s > 0 && ball.k === nb.k) return land(ctx, ball, next, cur);
  if (can) setBall(ctx, next, ball.k, ball.s); else free = false;
  if (nb.k === 'S') return eggAbsorb(ctx, ball, next, cur);
  if (free) { if (can) placeOnBase(ctx, ball, next, cur); return; }
  if (can) {
    let nn = springNext(S, 0, nb, next, cur);
    if (!nn || !canLand(nn, nb.k)) nn = backCell(S, cur, next);
    log(ctx, { t: 'mueve', de: [next.c, next.r], a: [nn.c, nn.r], k: nb.k, s: nb.s });
    return land(ctx, nb, nn, next);
  }
  const nn = backCell(S, cur, next);
  log(ctx, { t: 'mueve', de: [next.c, next.r], a: [nn.c, nn.r], k: ball.k, s: ball.s });
  return land(ctx, ball, nn, next);
}

// [0881:1e39] mina (y lo que dispara el canion)
function mine(ctx, x) {
  const S = ctx.S, near = [];
  if (x.b === MINE) {
    for (let dc = -1; dc <= 1; dc++) {
      for (let dr = -1; dr <= 1; dr++) {
        const y = at(S, x.c + dc, x.r + dr);
        if (!y || y === x) continue;
        if (y.b === MINE || (y.s && y.b !== ARMOR && y.b !== CANNON)) near.push(y);
      }
    }
  }
  log(ctx, { t: 'explota', c: x.c, r: x.r });
  const goal = (x.c === 0 && x.r === 7) || (x.c === 7 && x.r === 0);
  if (!goal && x.b !== ARMOR) setBase(ctx, x, (x.b === HOLE || x.b === SMALL || x.b === MINE) ? HOLE : SMALL);
  clearBall(ctx, x);
  for (const y of near) {
    if (isEmpty(y)) continue;
    if (y.bc === SOAP) { clearBall(ctx, y); continue; }
    setBall(ctx, y, y.k, y.s > 5 ? y.s - 5 : 0);
  }
  for (const y of near) if (y.b === MINE) mine(ctx, y);
}

// [0881:241d] el canion dispara: destruye la base de destino; la bola del canion se gasta
function shoot(ctx, target, cannon) {
  log(ctx, { t: 'dispara', de: [cannon.c, cannon.r], a: [target.c, target.r] });
  mine(ctx, target);
  clearBall(ctx, cannon);
}

// [0881:27eb] bomba: la bola sale disparada en linea hasta el destino
function pump(ctx, target, src) {
  const ball = rec(src);
  const dx = sign(target.c - src.c), dy = sign(target.r - src.r);
  clearBall(ctx, src);
  let cur = src;
  for (let i = 0; i < 16; i++) {
    const n = at(ctx.S, cur.c + dx, cur.r + dy);
    if (!n || n === target) break;
    cur = n;
  }
  log(ctx, { t: 'mueve', de: [src.c, src.r], a: [target.c, target.r], k: ball.k, s: ball.s });
  land(ctx, { k: ball.k, s: ball.s }, target, cur);
}

// ---------- la arania [0cca] ----------
function spiderNext(S, x, avoid, rng) {
  const cand = [];
  for (const [dx, dy] of DIRS) {
    const y = at(S, x.c + dx, x.r + dy);
    if (!y) continue;
    if (!(isEmpty(y) || y.k === 'S')) continue;
    if (y.b === DRAIN || y.b === MINE || y.b === HOLE || y === avoid) continue;
    cand.push(y);
  }
  if (!cand.length) return avoid;
  return cand[rng(cand.length)];
}
function spiderMove(ctx, from, to, rng) {
  let x = from;
  for (let guard = 0; to && guard < 20; guard++) {
    to.sp = x.sp; x.sp = null;
    log(ctx, { t: 'arania', de: [x.c, x.r], a: [to.c, to.r] });
    const prev = x; x = to;
    if (!(x.b === PUMP || x.b === SPRING || x.b === SLIDE)) break;
    to = spiderNext(ctx.S, x, prev, rng);
  }
  return x;
}
function spiderAct(ctx, x, rng) {
  const sp = x.sp;
  if (x.b === HOLE) return;
  if (sp.st === 1) {
    if (sp.ct > 0) {
      const n = spiderNext(ctx.S, x, null, rng);
      if (n) { x = spiderMove(ctx, x, n, rng); sp.ct--; } else sp.ct = 0;
    }
    if (sp.ct === 0) {
      if (x.b === ARMOR || (x.b >= SOAP && x.b <= CANNON)) sp.ct = 2;
      else { sp.st = 0; sp.ct = rng(2) * 2 + 1; }
    }
  } else if (sp.ct > 0) sp.ct--;
  else {
    const n = spiderNext(ctx.S, x, null, rng);
    if (n) {
      setBall(ctx, x, 'S', 3);
      log(ctx, { t: 'pone', c: x.c, r: x.r });
      sp.st = 1; sp.ct = rng(2) * 2 + 4;
      spiderMove(ctx, x, n, rng);
      sp.ct--;
    }
  }
}

// [0881:3f60] fin del turno: las bases chicas achican a 5 y la arania hace lo suyo
function endTurn(ctx, rng) {
  const S = ctx.S, spiders = [];
  for (let c = 0; c < 8; c++) {
    for (let r = 0; r < 8; r++) {
      const x = S.cells[c][r];
      if (x.b === SMALL && x.s > 5) { log(ctx, { t: 'achica', c, r }); setBall(ctx, x, x.k, 5); }
      if (x.sp && spiders.length < 5) spiders.push(x);
    }
  }
  for (const x of spiders) if (x.sp) spiderAct(ctx, x, rng);
}

// [0881:440b] una jugada completa
function doMove(S, from, to, rng, withLog) {
  const ctx = { S, depth: 0, log: withLog ? [] : null };
  const x = S.cells[from[0]][from[1]], y = S.cells[to[0]][to[1]];
  move(ctx, x, y);
  endTurn(ctx, rng);
  return ctx.log;
}

// [0512:0612] ganador: 'R', 'G', 'empate' o null
function winner(S) {
  if (S.cells[0][7].k === 'G') return 'G';
  if (S.cells[7][0].k === 'R') return 'R';
  let red = false, green = false;
  for (let c = 0; c < 8; c++) for (let r = 0; r < 8; r++) {
    const x = S.cells[c][r];
    if (!x.s) continue;
    if (x.k === 'R') red = true; else if (x.k === 'G') green = true;
    if (red && green) return null;
  }
  return red ? 'R' : green ? 'G' : 'empate';
}

// Jugadas legales del jugador k: lista de [[c,r],[c2,r2]]
function legalFrom(S, c, r, k) {
  const x = S.cells[c][r];
  if (!isMine(x, k)) return [];
  return getTargets(S, x, 1, rec(x)).map(y => [y.c, y.r]);
}
function legalMoves(S, k) {
  const out = [];
  for (let c = 0; c < 8; c++) for (let r = 0; r < 8; r++) for (const t of legalFrom(S, c, r, k)) out.push([[c, r], t]);
  return out;
}

// ---------- la compu [overlay 07f2] ----------
function aiTable(S, k) {
  const s = k === 'R' ? -1 : 1;
  const t = Array.from({ length: 8 }, () => new Array(8).fill(0));
  for (let c = 0; c < 8; c++) for (let r = 0; r < 8; r++) {
    t[c][r] = i16((r - c) * s);
    if (S.cells[c][r].b === CANNON) t[c][r] += 4;
  }
  if (k === 'R') { t[0][7] = 1000; t[1][7] = 400; t[0][6] = 400; t[1][6] = 400; } else { t[7][0] = 1000; t[7][1] = 400; t[6][0] = 400; t[6][1] = 400; }
  return t;
}
// [07f2:0615] evaluacion desde el punto de vista de 'k'
function evaluate(S, k, t) {
  if (k === 'G') { if (S.cells[0][7].k === 'G') return 32767; if (S.cells[7][0].k === 'R') return -32767; }
  if (k === 'R') { if (S.cells[7][0].k === 'R') return 32767; if (S.cells[0][7].k === 'G') return -32767; }
  let sum = 0, own = false, enemy = false;
  for (let c = 0; c < 8; c++) for (let r = 0; r < 8; r++) {
    const x = S.cells[c][r];
    if (!x.s || !x.k || x.k === 'S') continue;
    if (x.k === k) { sum = i16(sum + i16(x.s * 100 + t[c][r])); own = true; } else { sum = i16(sum + i16(x.s * -90 - t[c][r])); enemy = true; }
  }
  if (!own) return -32767;
  if (!enemy) return 32767;
  return sum;
}
// [07f2:0173] jugadas ordenadas como el original: primero las que comen, despues los choques, al final el resto
function genMoves(S, k) {
  const list = []; let wins = 0, quiet = 0;
  for (let c = 0; c < 8; c++) for (let r = 0; r < 8; r++) {
    const x = S.cells[c][r];
    if (!isMine(x, k)) continue;
    for (const y of getTargets(S, x, 1, rec(x))) {
      if (list.length >= 512) break;
      if (x.b === SOAP && ((y.b >= SPRING && y.b <= SLIDE) || y.s)) continue;
      const mv = [[c, r], [y.c, y.r]];
      if (y.k !== x.k && y.s) {
        if (y.s < x.s) { wins++; list.unshift(mv); } else list.splice(wins, 0, mv);
      } else { quiet++; list.push(mv); }
    }
  }
  return { list, wins, quiet };
}
const clone = (S) => ({ ...S, cells: S.cells.map(col => col.map(x => ({ ...x, sp: x.sp ? { ...x.sp } : null }))) });

// nivel 1..4 (1 = al azar, 4 = el mas dificil). Devuelve [[c,r],[c2,r2]] o null si no tiene jugadas
function aiMove(S, k, level, rng) {
  const depth = Math.max(0, Math.min(3, level - 1));
  if (depth === 0) {
    const { list } = genMoves(S, k);
    return list.length ? list[rng(list.length)] : null;
  }
  const t = aiTable(S, k);
  let best = []; let nodes = 0;
  // [07f2:0820] minimax con poda; 'side' es quien mueve en este nodo
  function search(B, ply, mv, parentBest, side) {
    nodes++;
    let e, val, cur = B;
    if (mv) {
      cur = clone(B);
      doMove(cur, mv[0], mv[1], rng, false);
      e = evaluate(cur, k, t);
      val = ply & 1 ? 32767 : -32767;
    } else { e = evaluate(B, k, t); val = -32767; }
    if (ply === depth || Math.abs(e) === 32767) {
      let v = e;
      if (e === 32767) v -= ply; else if (e === -32767) v += ply;
      return { ok: true, v };
    }
    const g = genMoves(cur, side);
    let n = g.list.length;
    if (ply === depth - 1 && g.wins > 0) n -= g.quiet;
    for (let i = 0; i < n; i++) {
      if (nodes > 60000) break;
      const res = search(cur, ply + 1, g.list[i], val, other(side));
      if (!res.ok) continue;
      const improved = ply & 1 ? res.v < val : res.v > val;
      if (improved) {
        val = res.v;
        if (mv && ((ply & 1) ? val < parentBest : val > parentBest)) return { ok: false };
        if (ply === 0) best = [];
      }
      if (ply === 0 && res.v === val && best.length < 10) best.push(g.list[i]);
    }
    return { ok: true, v: val };
  }
  search(S, 0, null, 32767, k);
  return best.length ? best[rng(best.length)] : null;
}

// ---------- partidas ----------
function fromBoard(def) {
  const cells = [];
  for (let c = 0; c < 8; c++) {
    cells.push([]);
    for (let r = 0; r < 8; r++) {
      const d = def[c][r];
      cells[c].push({ c, r, b: d[0], k: d[1] || '', s: d[2] || 0, bc: d[0], sp: null });
    }
  }
  return { cells };
}
// [0512:0a4d] la arania aparece en una celda vacia al azar (no metas ni bases que la mueven)
function placeSpider(S, rng) {
  const cand = [];
  for (let c = 0; c < 8; c++) for (let r = 0; r < 8; r++) {
    if ((c === 0 && r === 7) || (c === 7 && r === 0)) continue;
    const x = S.cells[c][r];
    if (!isEmpty(x)) continue;
    if (x.b === HOLE || x.b === PUMP || (x.b >= DRAIN && x.b <= SOAP) || x.b === MINE) continue;
    cand.push(x);
  }
  if (cand.length) cand[rng(cand.length)].sp = { st: 1, ct: rng(2) * 2 + 4 };
}
function newGame(def, opts, rng) {
  const S = fromBoard(def);
  if (opts && opts.spider) placeSpider(S, rng);
  return S;
}
// estado compacto para mandar (64 celdas: [base, color, tamanio, arania])
function pack(S) {
  const out = [];
  for (let c = 0; c < 8; c++) for (let r = 0; r < 8; r++) {
    const x = S.cells[c][r];
    out.push([x.b, x.k, x.s, x.sp ? 1 : 0]);
  }
  return out;
}
function unpack(p) {
  const cells = [];
  for (let c = 0; c < 8; c++) {
    cells.push([]);
    for (let r = 0; r < 8; r++) {
      const v = p[c * 8 + r];
      cells[c].push({ c, r, b: v[0], k: v[1] || '', s: v[2] || 0, bc: v[0], sp: v[3] ? (typeof v[3] === 'object' ? v[3] : { st: 1, ct: 4 }) : null });
    }
  }
  return { cells };
}
function save(S) {
  const out = [];
  for (let c = 0; c < 8; c++) for (let r = 0; r < 8; r++) {
    const x = S.cells[c][r];
    out.push([x.b, x.k, x.s, x.bc, x.sp ? [x.sp.st, x.sp.ct] : 0]);
  }
  return out;
}
function load(p) {
  const cells = [];
  for (let c = 0; c < 8; c++) {
    cells.push([]);
    for (let r = 0; r < 8; r++) {
      const v = p[c * 8 + r];
      cells[c].push({ c, r, b: v[0], k: v[1] || '', s: v[2] || 0, bc: v[3], sp: v[4] ? { st: v[4][0], ct: v[4][1] } : null });
    }
  }
  return { cells };
}

module.exports = {
  NORMAL, HOLE, SMALL, PUMP, ARMOR, TELEPORT, DRAIN, SPRING, SLIDE, SOAP, MAGNET, CANNON, MINE, BASES,
  pRound, newGame, fromBoard, doMove, winner, legalFrom, legalMoves, aiMove, evaluate, genMoves,
  pack, unpack, save, load, clone, other, isMine,
};
