// Ajedrez (parte del puente): las reglas completas, sin bibliotecas de afuera, y la compu.
//  - Jugadas legales: enroque (sin pasar por casillas atacadas), captura al paso, coronacion.
//  - Fin: jaque mate, ahogado, material insuficiente, 50 jugadas y triple repeticion.
//  - Notacion en castellano (R rey, D dama, T torre, A alfil, C caballo): "Cf3", "exd5", "O-O", "e8=D+".
//  - La compu: alfa-beta con quiescencia y tablas de posicion, en 4 niveles. Piensa en un hilo
//    aparte (pensarEnHilo), asi el servidor del chat no se traba mientras busca.
// El tablero: 64 casillas, a1 = 0, h1 = 7, a8 = 56. Piezas como en FEN: mayuscula blancas, minuscula negras.

const INICIAL = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const COLS = 'abcdefgh';
const nombre = (i) => COLS[i & 7] + ((i >> 3) + 1);
const casilla = (s) => (typeof s === 'string' && /^[a-h][1-8]$/.test(s) ? (s.charCodeAt(0) - 97) + (s.charCodeAt(1) - 49) * 8 : -1);
const colorDe = (p) => (!p ? null : p === p.toUpperCase() ? 'w' : 'b');
const otro = (c) => (c === 'w' ? 'b' : 'w');
const tipo = (p) => p.toLowerCase();

// ── Casillas vecinas, precalculadas ──
const SALTOS = [], REY = [], RAYOS = []; // RAYOS[i][d] = casillas en la direccion d
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]; // 0-3 torre, 4-7 alfil
for (let i = 0; i < 64; i++) {
  const f = i & 7, r = i >> 3;
  SALTOS[i] = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]].map(([a, b]) => [f + a, r + b]).filter(([x, y]) => x >= 0 && x < 8 && y >= 0 && y < 8).map(([x, y]) => y * 8 + x);
  REY[i] = DIRS.map(([a, b]) => [f + a, r + b]).filter(([x, y]) => x >= 0 && x < 8 && y >= 0 && y < 8).map(([x, y]) => y * 8 + x);
  RAYOS[i] = DIRS.map(([a, b]) => { const out = []; for (let x = f + a, y = r + b; x >= 0 && x < 8 && y >= 0 && y < 8; x += a, y += b) out.push(y * 8 + x); return out; });
}
// Al mover desde o hacia estas casillas se pierde el enroque (1 = K, 2 = Q, 4 = k, 8 = q)
const ENROQUE_PIERDE = new Array(64).fill(15);
ENROQUE_PIERDE[0] = 15 & ~2; ENROQUE_PIERDE[7] = 15 & ~1; ENROQUE_PIERDE[4] = 15 & ~3;
ENROQUE_PIERDE[56] = 15 & ~8; ENROQUE_PIERDE[63] = 15 & ~4; ENROQUE_PIERDE[60] = 15 & ~12;

// ── FEN ──
function desdeFen(fen) {
  const [pos, t, c, ep, h, n] = String(fen || INICIAL).trim().split(/\s+/);
  const b = new Array(64).fill('');
  const filas = pos.split('/');
  if (filas.length !== 8) throw new Error('FEN invalido');
  filas.forEach((fila, k) => {
    let f = 0;
    for (const ch of fila) {
      if (/[1-8]/.test(ch)) f += +ch;
      else if (/[pnbrqkPNBRQK]/.test(ch)) { if (f > 7) throw new Error('FEN invalido'); b[(7 - k) * 8 + f] = ch; f++; }
      else throw new Error('FEN invalido');
    }
    if (f !== 8) throw new Error('FEN invalido');
  });
  let cm = 0;
  if (c && c !== '-') { if (c.includes('K')) cm |= 1; if (c.includes('Q')) cm |= 2; if (c.includes('k')) cm |= 4; if (c.includes('q')) cm |= 8; }
  const S = { b, t: t === 'b' ? 'b' : 'w', c: cm, ep: casilla(ep), h: +h || 0, n: +n || 1, reyes: { w: b.indexOf('K'), b: b.indexOf('k') } };
  if (S.reyes.w < 0 || S.reyes.b < 0) throw new Error('FEN sin rey');
  return S;
}
function posicion(S) {
  let out = '';
  for (let r = 7; r >= 0; r--) {
    let vac = 0;
    for (let f = 0; f < 8; f++) {
      const p = S.b[r * 8 + f];
      if (!p) { vac++; continue; }
      if (vac) { out += vac; vac = 0; }
      out += p;
    }
    if (vac) out += vac;
    if (r) out += '/';
  }
  const c = (S.c & 1 ? 'K' : '') + (S.c & 2 ? 'Q' : '') + (S.c & 4 ? 'k' : '') + (S.c & 8 ? 'q' : '');
  return `${out} ${S.t} ${c || '-'}`;
}
const aFen = (S) => `${posicion(S)} ${S.ep >= 0 ? nombre(S.ep) : '-'} ${S.h} ${S.n}`;
const copiar = (S) => ({ b: S.b.slice(), t: S.t, c: S.c, ep: S.ep, h: S.h, n: S.n, reyes: { ...S.reyes } });

// ── Ataques ──
function atacada(b, i, por) {
  const blanco = por === 'w';
  // peones
  const f = i & 7, peon = blanco ? 'P' : 'p', dr = blanco ? -8 : 8;
  if (f > 0 && b[i + dr - 1] === peon && i + dr - 1 >= 0 && i + dr - 1 < 64) return true;
  if (f < 7 && b[i + dr + 1] === peon && i + dr + 1 >= 0 && i + dr + 1 < 64) return true;
  const N = blanco ? 'N' : 'n', K = blanco ? 'K' : 'k', B = blanco ? 'B' : 'b', R = blanco ? 'R' : 'r', Q = blanco ? 'Q' : 'q';
  for (const j of SALTOS[i]) if (b[j] === N) return true;
  for (const j of REY[i]) if (b[j] === K) return true;
  for (let d = 0; d < 8; d++) {
    const recta = d < 4;
    for (const j of RAYOS[i][d]) {
      const p = b[j];
      if (!p) continue;
      if (p === Q || (recta ? p === R : p === B)) return true;
      break;
    }
  }
  return false;
}
const enJaque = (S, c = S.t) => atacada(S.b, S.reyes[c], otro(c));

// ── Jugadas ──
// Una jugada: { de, a, p (pieza), x (comida), cor (coronacion: 'q','r','b','n'), al: al paso, enr: 'k'|'q', doble }
function pseudo(S, soloCapturas) {
  const b = S.b, c = S.t, out = [];
  const mia = (p) => p && colorDe(p) === c;
  const suya = (p) => p && colorDe(p) !== c;
  for (let i = 0; i < 64; i++) {
    const p = b[i];
    if (!mia(p)) continue;
    const t = tipo(p);
    if (t === 'p') {
      const dir = c === 'w' ? 8 : -8, ini = c === 'w' ? 1 : 6, fin = c === 'w' ? 7 : 0, f = i & 7;
      const add = (a, x, al) => {
        if ((a >> 3) === fin) for (const cor of ['q', 'r', 'b', 'n']) out.push({ de: i, a, p, x, cor });
        else out.push({ de: i, a, p, x, al });
      };
      const a1 = i + dir;
      if (!soloCapturas && a1 >= 0 && a1 < 64 && !b[a1]) {
        add(a1, '');
        const a2 = a1 + dir;
        if ((i >> 3) === ini && !b[a2]) out.push({ de: i, a: a2, p, x: '', doble: true });
      } else if (soloCapturas && a1 >= 0 && a1 < 64 && !b[a1] && (a1 >> 3) === fin) add(a1, '');
      for (const df of [-1, 1]) {
        if (f + df < 0 || f + df > 7) continue;
        const a = i + dir + df;
        if (a < 0 || a > 63) continue;
        if (suya(b[a])) add(a, b[a]);
        else if (a === S.ep) add(a, c === 'w' ? 'p' : 'P', true);
      }
      continue;
    }
    if (t === 'n' || t === 'k') {
      for (const a of (t === 'n' ? SALTOS : REY)[i]) {
        if (mia(b[a])) continue;
        if (soloCapturas && !b[a]) continue;
        out.push({ de: i, a, p, x: b[a] });
      }
      if (t === 'k' && !soloCapturas) enroques(S, i, out);
      continue;
    }
    const d0 = t === 'b' ? 4 : 0, d1 = t === 'r' ? 4 : 8;
    for (let d = d0; d < d1; d++) {
      for (const a of RAYOS[i][d]) {
        if (!b[a]) { if (!soloCapturas) out.push({ de: i, a, p, x: '' }); continue; }
        if (suya(b[a])) out.push({ de: i, a, p, x: b[a] });
        break;
      }
    }
  }
  return out;
}
function enroques(S, i, out) {
  const c = S.t, b = S.b, ene = otro(c);
  const base = c === 'w' ? 0 : 56;
  if (i !== base + 4) return;
  const corto = c === 'w' ? 1 : 4, largo = c === 'w' ? 2 : 8, T = c === 'w' ? 'R' : 'r';
  if ((S.c & corto) && b[base + 7] === T && !b[base + 5] && !b[base + 6]
    && !atacada(b, base + 4, ene) && !atacada(b, base + 5, ene) && !atacada(b, base + 6, ene)) out.push({ de: i, a: base + 6, p: b[i], x: '', enr: 'k' });
  if ((S.c & largo) && b[base] === T && !b[base + 1] && !b[base + 2] && !b[base + 3]
    && !atacada(b, base + 4, ene) && !atacada(b, base + 3, ene) && !atacada(b, base + 2, ene)) out.push({ de: i, a: base + 2, p: b[i], x: '', enr: 'q' });
}

// Hacer y deshacer (sobre el mismo tablero, para que la compu sea rapida)
function hacer(S, m) {
  const b = S.b, c = S.t;
  const u = { c: S.c, ep: S.ep, h: S.h, n: S.n };
  b[m.de] = '';
  if (m.al) b[m.a + (c === 'w' ? -8 : 8)] = '';
  b[m.a] = m.cor ? (c === 'w' ? m.cor.toUpperCase() : m.cor) : m.p;
  if (m.enr) {
    const base = c === 'w' ? 0 : 56;
    if (m.enr === 'k') { b[base + 5] = b[base + 7]; b[base + 7] = ''; } else { b[base + 3] = b[base]; b[base] = ''; }
  }
  if (tipo(m.p) === 'k') S.reyes[c] = m.a;
  S.c &= ENROQUE_PIERDE[m.de] & ENROQUE_PIERDE[m.a];
  S.ep = m.doble ? (m.de + m.a) >> 1 : -1;
  S.h = tipo(m.p) === 'p' || m.x ? 0 : S.h + 1;
  if (c === 'b') S.n++;
  S.t = otro(c);
  return u;
}
function deshacer(S, m, u) {
  const b = S.b, c = otro(S.t);
  S.t = c; S.c = u.c; S.ep = u.ep; S.h = u.h; S.n = u.n;
  b[m.de] = m.p;
  if (m.al) { b[m.a] = ''; b[m.a + (c === 'w' ? -8 : 8)] = m.x; } else b[m.a] = m.x;
  if (m.enr) {
    const base = c === 'w' ? 0 : 56;
    if (m.enr === 'k') { b[base + 7] = b[base + 5]; b[base + 5] = ''; } else { b[base] = b[base + 3]; b[base + 3] = ''; }
  }
  if (tipo(m.p) === 'k') S.reyes[c] = m.de;
}
function legales(S, soloCapturas) {
  const out = [], c = S.t;
  for (const m of pseudo(S, soloCapturas)) {
    const u = hacer(S, m);
    if (!atacada(S.b, S.reyes[c], otro(c))) out.push(m);
    deshacer(S, m, u);
  }
  return out;
}

// ── Notacion ──
const LETRA = { k: 'R', q: 'D', r: 'T', b: 'A', n: 'C' };
function notacion(S, m, todas) {
  let s;
  const t = tipo(m.p);
  if (m.enr) s = m.enr === 'k' ? 'O-O' : 'O-O-O';
  else if (t === 'p') {
    s = (m.x ? COLS[m.de & 7] + 'x' : '') + nombre(m.a) + (m.cor ? '=' + LETRA[m.cor] : '');
  } else {
    const rivales = (todas || legales(S)).filter(o => o.a === m.a && o.p === m.p && o.de !== m.de);
    let dis = '';
    if (rivales.length) {
      const mismaCol = rivales.some(o => (o.de & 7) === (m.de & 7)), mismaFila = rivales.some(o => (o.de >> 3) === (m.de >> 3));
      dis = !mismaCol ? COLS[m.de & 7] : !mismaFila ? String((m.de >> 3) + 1) : nombre(m.de);
    }
    s = LETRA[t] + dis + (m.x ? 'x' : '') + nombre(m.a);
  }
  const u = hacer(S, m);
  if (enJaque(S)) s += legales(S).length ? '+' : '#';
  deshacer(S, m, u);
  return s;
}

// ── Fin de la partida ──
function sinMaterial(S) {
  const resto = [];
  for (let i = 0; i < 64; i++) { const p = S.b[i]; if (p && tipo(p) !== 'k') resto.push([tipo(p), i]); }
  if (!resto.length) return true;
  if (resto.length === 1 && (resto[0][0] === 'n' || resto[0][0] === 'b')) return true;
  // solo alfiles, todos en casillas del mismo color
  if (resto.every(([t]) => t === 'b')) { const k = resto.map(([, i]) => ((i & 7) + (i >> 3)) & 1); return k.every(x => x === k[0]); }
  return false;
}
// Si a un color se le acaba el tiempo y el otro no puede dar mate de ninguna forma, son tablas
function puedeDarMate(S, c) {
  let menores = 0;
  for (const p of S.b) {
    if (!p || colorDe(p) !== c) continue;
    const t = tipo(p);
    if (t === 'p' || t === 'r' || t === 'q') return true;
    if (t === 'n' || t === 'b') menores++;
  }
  return menores >= 2;
}
// La clave para la triple repeticion: la posicion, el turno, los enroques y el al paso solo si se puede comer
function clave(S) {
  let ep = '-';
  if (S.ep >= 0) {
    const peon = S.t === 'w' ? 'P' : 'p', dr = S.t === 'w' ? -8 : 8, f = S.ep & 7;
    if ((f > 0 && S.b[S.ep + dr - 1] === peon) || (f < 7 && S.b[S.ep + dr + 1] === peon)) ep = nombre(S.ep);
  }
  return posicion(S) + ' ' + ep;
}
// { fin: 'mate'|'ahogado'|'material'|'50'|'repeticion', ganador: 'w'|'b'|null } o null si sigue
function estado(S, claves) {
  const ms = legales(S);
  if (!ms.length) return enJaque(S) ? { fin: 'mate', ganador: otro(S.t) } : { fin: 'ahogado', ganador: null };
  if (sinMaterial(S)) return { fin: 'material', ganador: null };
  if (S.h >= 100) return { fin: '50', ganador: null };
  if (claves) { const k = clave(S); if (claves.filter(x => x === k).length >= 3) return { fin: 'repeticion', ganador: null }; }
  return null;
}

// Una jugada pedida desde afuera ('e2', 'e4', 'q'): la legal que corresponde, o null
function buscar(S, de, a, cor) {
  const i = casilla(de), j = casilla(a);
  if (i < 0 || j < 0) return null;
  const ms = legales(S).filter(m => m.de === i && m.a === j);
  if (!ms.length) return null;
  if (ms[0].cor) return ms.find(m => m.cor === (['q', 'r', 'b', 'n'].includes(cor) ? cor : 'q')) || null;
  return ms[0];
}

// ── La compu ──
const VALOR = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
// Tablas de posicion (desde las blancas, a8 primero), como las clasicas de "evaluacion simplificada"
const PST = {
  p: [0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5, 0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0],
  n: [-50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30, -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50],
  b: [-20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10, -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20],
  r: [0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0],
  q: [-20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10, -5, 0, 5, 5, 5, 5, 0, -5, 0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20],
  k: [-30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20, -20, -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20],
  kf: [-50, -40, -30, -20, -20, -30, -40, -50, -30, -20, -10, 0, 0, -10, -20, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -30, 0, 0, 0, 0, -30, -30, -50, -30, -30, -30, -30, -30, -30, -50],
};
// indice en la tabla: las blancas la leen dada vuelta (a8 primero), las negras como espejo
const idx = (i, c) => (c === 'w' ? (7 - (i >> 3)) * 8 + (i & 7) : i);
function evaluar(S) {
  let mat = 0, menores = 0, s = 0;
  for (const p of S.b) if (p && tipo(p) !== 'k' && tipo(p) !== 'p') { mat += VALOR[tipo(p)]; if (tipo(p) !== 'q') menores++; }
  const final = mat <= 1300 || (mat <= 2000 && menores <= 2);
  for (let i = 0; i < 64; i++) {
    const p = S.b[i];
    if (!p) continue;
    const c = colorDe(p), t = tipo(p);
    const v = VALOR[t] + (t === 'k' && final ? PST.kf : PST[t])[idx(i, c)];
    s += c === 'w' ? v : -v;
  }
  return S.t === 'w' ? s : -s;
}
const MATE = 100000;
const orden = (m) => (m.x ? 10 * VALOR[tipo(m.x)] - VALOR[tipo(m.p)] + 1000 : 0) + (m.cor === 'q' ? 900 : 0);
const ordenar = (ms) => { for (const m of ms) m.o = orden(m); return ms.sort((a, b) => b.o - a.o); };

function buscarMejor(S, opts) {
  const { prof = 3, ms: limite = 2000, ruido = 0, quies = true, azar = Math.random } = opts || {};
  const hasta = Date.now() + limite;
  let nodos = 0, corto = false;
  const tiempo = () => { if ((++nodos & 1023) === 0 && Date.now() > hasta) corto = true; return corto; };
  // jugadas pseudo-legales y la legalidad recien al hacerlas (el rey propio no puede quedar atacado)
  const ilegal = (c) => atacada(S.b, S.reyes[c], otro(c));
  const killers = [];
  function q(alfa, beta, d) {
    const pie = evaluar(S);
    if (pie >= beta) return pie;
    if (pie > alfa) alfa = pie;
    if (d > 6 || tiempo()) return alfa;
    const c = S.t;
    for (const m of ordenar(pseudo(S, true))) {
      const u = hacer(S, m);
      if (ilegal(c)) { deshacer(S, m, u); continue; }
      const v = -q(-beta, -alfa, d + 1); deshacer(S, m, u);
      if (v >= beta) return v;
      if (v > alfa) alfa = v;
    }
    return alfa;
  }
  function ab(d, alfa, beta, ply) {
    if (tiempo()) return 0;
    if (S.h >= 100) return 0;
    const c = S.t, jaque = ilegal(c);
    if (d <= 0 && (!jaque || d < -3)) return quies ? q(alfa, beta, 0) : evaluar(S);
    const ms = pseudo(S);
    ordenar(ms);
    const k = killers[ply];
    if (k) for (const m of ms) if (!m.x && m.de === k.de && m.a === k.a) m.o = 500;
    ms.sort((a, b) => b.o - a.o);
    let mejor = -Infinity, alguna = false;
    for (const m of ms) {
      const u = hacer(S, m);
      if (ilegal(c)) { deshacer(S, m, u); continue; }
      alguna = true;
      const v = -ab(d - 1, -beta, -alfa, ply + 1); deshacer(S, m, u);
      if (v > mejor) mejor = v;
      if (v > alfa) alfa = v;
      if (alfa >= beta) { if (!m.x) killers[ply] = m; break; }
    }
    if (!alguna) return jaque ? -MATE + ply : 0;
    return mejor;
  }
  let raiz = ordenar(legales(S));
  if (!raiz.length) return null;
  if (raiz.length === 1) return raiz[0];
  let elegida = raiz[0], puntos = [];
  for (let d = 1; d <= prof; d++) {
    const res = [];
    let alfa = -Infinity;
    for (const m of raiz) {
      const u = hacer(S, m); const v = -ab(d - 1, -Infinity, -alfa + (ruido ? ruido : 0), 1); deshacer(S, m, u);
      if (corto) break;
      res.push([m, v]);
      if (v > alfa) alfa = v;
    }
    if (corto && d > 1) break;
    res.sort((a, b) => b[1] - a[1]);
    puntos = res;
    raiz = res.map(r => r[0]).concat(raiz.filter(m => !res.some(r => r[0] === m)));
    if (corto || Math.abs(res[0][1]) > MATE - 100) break;
  }
  // un poco de variedad (y de errores en los niveles bajos): cualquiera cerca de la mejor
  if (puntos.length) {
    const top = puntos[0][1];
    const cerca = puntos.filter(([, v]) => v >= top - ruido);
    elegida = cerca[Math.floor(azar() * cerca.length)][0];
  }
  return elegida;
}
const NIVELES = [
  { nombre: 'Fácil', prof: 1, ms: 400, ruido: 120, quies: false, torpe: 0.2 },
  { nombre: 'Normal', prof: 2, ms: 800, ruido: 25, quies: true, torpe: 0.03 },
  { nombre: 'Difícil', prof: 3, ms: 1500, ruido: 15, quies: true, torpe: 0 },
  { nombre: 'Muy difícil', prof: 6, ms: 2500, ruido: 0, quies: true, torpe: 0 },
];
// Aperturas conocidas, para que la compu no arranque con cualquier cosa (y para que varie)
const LIBRO = new Map();
for (const linea of [
  'e2e4 e7e5 g1f3 b8c6 f1b5 a7a6 b5a4 g8f6 e1g1', 'e2e4 e7e5 g1f3 b8c6 f1c4 f8c5 c2c3 g8f6', 'e2e4 e7e5 g1f3 b8c6 d2d4 e5d4 f3d4',
  'e2e4 e7e5 g1f3 g8f6 f3e5 d7d6 e5f3 f6e4', 'e2e4 e7e5 b1c3 g8f6 g1f3 b8c6', 'e2e4 c7c5 g1f3 d7d6 d2d4 c5d4 f3d4 g8f6 b1c3 a7a6',
  'e2e4 c7c5 g1f3 b8c6 d2d4 c5d4 f3d4 g8f6', 'e2e4 c7c5 g1f3 e7e6 d2d4 c5d4 f3d4', 'e2e4 c7c5 b1c3 b8c6 g2g3 g7g6',
  'e2e4 e7e6 d2d4 d7d5 b1c3 g8f6', 'e2e4 e7e6 d2d4 d7d5 e4e5 c7c5', 'e2e4 c7c6 d2d4 d7d5 b1c3 d5e4 c3e4', 'e2e4 d7d5 e4d5 d8d5 b1c3 d5a5',
  'e2e4 g7g6 d2d4 f8g7 b1c3 d7d6', 'd2d4 d7d5 c2c4 e7e6 b1c3 g8f6 c1g5 f8e7', 'd2d4 d7d5 c2c4 c7c6 g1f3 g8f6 b1c3', 'd2d4 d7d5 c2c4 d5c4 g1f3 g8f6 e2e3',
  'd2d4 g8f6 c2c4 e7e6 b1c3 f8b4 e2e3', 'd2d4 g8f6 c2c4 e7e6 g1f3 d7d5', 'd2d4 g8f6 c2c4 g7g6 b1c3 f8g7 e2e4 d7d6', 'd2d4 g8f6 g1f3 g7g6 c1f4',
  'd2d4 d7d5 g1f3 g8f6 c1f4 e7e6 e2e3', 'c2c4 e7e5 b1c3 g8f6 g1f3 b8c6', 'c2c4 g8f6 b1c3 e7e6', 'g1f3 d7d5 g2g3 g8f6 f1g2', 'g1f3 g8f6 c2c4 g7g6',
]) {
  const S = desdeFen(INICIAL);
  for (const uci of linea.split(' ')) {
    const k = clave(S);
    if (!LIBRO.has(k)) LIBRO.set(k, []);
    if (!LIBRO.get(k).includes(uci)) LIBRO.get(k).push(uci);
    const m = buscar(S, uci.slice(0, 2), uci.slice(2, 4));
    if (!m) throw new Error('libro: ' + linea);
    hacer(S, m);
  }
}
// La jugada de la compu para un FEN: { de, a, cor } en nombres de casillas
function jugadaCompu(fen, nivel, azar = Math.random) {
  const S = desdeFen(fen);
  const N = NIVELES[Math.max(0, Math.min(3, (nivel | 0) - 1))];
  let m;
  const ms = legales(S);
  if (!ms.length) return null;
  const libro = nivel > 1 && LIBRO.get(clave(S));
  if (libro) { const uci = libro[Math.floor(azar() * libro.length)]; return { de: uci.slice(0, 2), a: uci.slice(2, 4), cor: null }; }
  if (N.torpe && azar() < N.torpe) m = ms[Math.floor(azar() * ms.length)];
  else m = buscarMejor(S, { ...N, azar });
  return m && { de: nombre(m.de), a: nombre(m.a), cor: m.cor || null };
}
// Que tan bien esta la compu (para aceptar tablas): centipeones desde el lado que mueve
function valoracion(fen) { const S = desdeFen(fen); return buscarMejorValor(S); }
function buscarMejorValor(S) {
  const ms = legales(S);
  if (!ms.length) return enJaque(S) ? -MATE : 0;
  let mejor = -Infinity;
  for (const m of ms) { const u = hacer(S, m); const v = -evaluar(S); deshacer(S, m, u); if (v > mejor) mejor = v; }
  return mejor;
}

// En un hilo aparte: el servidor sigue atendiendo mientras la compu piensa
function pensarEnHilo(fen, nivel) {
  return new Promise((resolve) => {
    let W;
    try { W = new (require('worker_threads').Worker)(__filename, { workerData: { ajedrezCompu: true, fen, nivel } }); }
    catch { try { resolve(jugadaCompu(fen, Math.min(nivel, 2))); } catch { resolve(null); } return; }
    const t = setTimeout(() => { W.terminate(); resolve(null); }, 15000);
    W.once('message', (m) => { clearTimeout(t); resolve(m); W.terminate(); });
    W.once('error', () => { clearTimeout(t); try { resolve(jugadaCompu(fen, 1)); } catch { resolve(null); } });
  });
}
{
  const wt = require('worker_threads');
  if (!wt.isMainThread && wt.workerData && wt.workerData.ajedrezCompu) {
    let r = null;
    try { r = jugadaCompu(wt.workerData.fen, wt.workerData.nivel); } catch { r = null; }
    wt.parentPort.postMessage(r);
  }
}

module.exports = {
  INICIAL, NIVELES: NIVELES.map(n => n.nombre), desdeFen, aFen, copiar, legales, hacer, notacion, estado, clave, buscar,
  enJaque, puedeDarMate, nombre, casilla, colorDe, otro, jugadaCompu, pensarEnHilo, valoracion,
};
