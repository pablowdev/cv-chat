// Mazo de truco en pixel art con el diseño clasico de la baraja española (el patron castellano de
// Fournier, de dominio publico): copas, oros, espadas y bastos como los de siempre, y sota, caballo y
// rey clasicos. Cada carta se arma con formas (poligonos y ovalos) sobre una grilla de 80x120 que se
// pasan a pixeles con contorno negro, y se dibuja agrandada 6 veces (480x720).
// Corre en el navegador: mazoPixel.dibujar(palo, numero) devuelve un <canvas>.
(function () {
  const W = 80, H = 120, ESCALA = 6;
  const COL = {
    k: '#1b1512', c: '#f6efd8', C: '#e6d8b2',
    y: '#f2c12e', Y: '#c2861a', w: '#fff3b8',
    r: '#d33528', R: '#8c2117', q: '#ef7a63',
    b: '#4f86d9', B: '#2a4a94', l: '#bcd6f6', L: '#7fa8e4',
    g: '#4fa23a', G: '#2c6a22', h: '#9fd35f',
    n: '#9a6432', N: '#5f3a17',
    f: '#f2c7a0', F: '#d39b73',
    s: '#e9e6e0', S: '#a9a59c', e: '#ffffff', E: '#cfcac0',
    // Magaiba: tegu rosa, ojo naranja, lengua violeta
    p: '#ec8ea4', P: '#c8657f', d: '#8e3a52', m: '#b04a8c', o: '#f08a24',
  };

  // ── Rasterizar formas en la grilla ──
  function nuevo() { return { px: new Array(W * H).fill(null) }; }
  let TR = null; // mientras se dibuja una figura: [escala, dx, dy]
  const tr = ([x, y]) => { if (!TR) return [x, y]; const nx = TR[1] + x * TR[0]; return [TR[3] ? W - nx : nx, TR[2] + y * TR[0]]; };
  function marcar(L, set, color, borde) {
    for (const i of set) {
      const x = i % W, y = (i / W) | 0;
      const fuera = (xx, yy) => xx < 0 || yy < 0 || xx >= W || yy >= H || !set.has(yy * W + xx);
      L.px[i] = borde && (fuera(x - 1, y) || fuera(x + 1, y) || fuera(x, y - 1) || fuera(x, y + 1)) ? 'k' : color;
    }
  }
  function poli(L, pts, color, borde = true) {
    pts = pts.map(tr);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const [x, y] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const set = new Set();
    for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(H - 1, Math.ceil(y1)); y++)
      for (let x = Math.max(0, Math.floor(x0)); x <= Math.min(W - 1, Math.ceil(x1)); x++) {
        const px = x + 0.5, py = y + 0.5;
        let dentro = false;
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
          const [xi, yi] = pts[i], [xj, yj] = pts[j];
          if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) dentro = !dentro;
        }
        if (dentro) set.add(y * W + x);
      }
    marcar(L, set, color, borde);
  }
  function ovalo(L, cx, cy, rx, ry, color, borde = true) {
    if (TR) { [cx, cy] = tr([cx, cy]); rx *= TR[0]; ry *= TR[0]; }
    const set = new Set();
    for (let y = Math.max(0, Math.floor(cy - ry - 1)); y <= Math.min(H - 1, Math.ceil(cy + ry + 1)); y++)
      for (let x = Math.max(0, Math.floor(cx - rx - 1)); x <= Math.min(W - 1, Math.ceil(cx + rx + 1)); x++) {
        const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) set.add(y * W + x);
      }
    marcar(L, set, color, borde);
  }
  const pix = (L, x, y, c) => { [x, y] = tr([x, y]); x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < W && y < H) L.px[y * W + x] = c; };

  // Un dibujo "local" (en su propia caja) puesto en (ox, oy), agrandado s veces y, si se pide, dado vuelta
  function lugar(ox, oy, s, ancho, alto, invertido) {
    const T = ([x, y]) => (invertido ? [ox + (ancho - x) * s, oy + (alto - y) * s] : [ox + x * s, oy + y * s]);
    return {
      p: (L, pts, c, b) => poli(L, pts.map(T), c, b),
      o: (L, cx, cy, rx, ry, c, b) => { const [x, y] = T([cx, cy]); ovalo(L, x, y, rx * s, ry * s, c, b); },
      x: (L, x, y, c) => { const [a, b] = T([x, y]); pix(L, a, b, c); },
    };
  }

  // ── Los palos ──
  const PALO = {
    // Copa: borde dorado, cuerpo rojo con una franja dorada, nudo azul, pie dorado
    copa: { ancho: 16, alto: 24, dibujar(L, t) {
      t.p(L, [[1.5, 3], [14.5, 3], [14, 8], [12, 11.5], [9.5, 13.5], [6.5, 13.5], [4, 11.5], [2, 8]], 'r');
      t.p(L, [[2.6, 6.5], [13.4, 6.5], [13, 9], [3, 9]], 'y');
      t.p(L, [[0.5, 0.5], [15.5, 0.5], [15.5, 3.5], [0.5, 3.5]], 'y');
      t.o(L, 8, 15, 2.8, 2, 'b');
      t.p(L, [[6.3, 16.5], [9.7, 16.5], [9.7, 20], [6.3, 20]], 'y');
      t.p(L, [[2.5, 24], [13.5, 24], [11, 19.5], [5, 19.5]], 'y');
      t.x(L, 4.5, 4.5, 'q');
    } },
    // Oro: moneda dorada con aro rojo y una cara de perfil en el medio
    oro: { ancho: 18, alto: 18, dibujar(L, t) {
      t.o(L, 9, 9, 9, 9, 'r');
      t.o(L, 9, 9, 7, 7, 'y');
      t.o(L, 9.4, 9, 3.6, 4.4, 'Y');
      t.p(L, [[6.2, 9.5], [5.2, 10.5], [6.4, 11]], 'Y', false);
      t.x(L, 3.5, 6, 'w'); t.x(L, 4, 5, 'w');
    } },
    // Espada: hoja celeste derecha, guarda dorada, empuñadura roja y pomo dorado (de punta hacia arriba)
    espada: { ancho: 10, alto: 32, dibujar(L, t) {
      t.p(L, [[2, 3.5], [5, 0], [8, 3.5], [8, 21], [2, 21]], 'l');
      t.p(L, [[4.4, 3.5], [5.6, 3.5], [5.6, 20], [4.4, 20]], 'L', false);
      t.p(L, [[3, 24], [7, 24], [7, 29], [3, 29]], 'r');
      t.p(L, [[0, 20.5], [10, 20.5], [10, 24.5], [0, 24.5]], 'y');
      t.o(L, 5, 30.5, 2.2, 1.8, 'y');
    } },
    // Basto: garrote verde con franjas rojas, nudos y hojitas
    basto: { ancho: 16, alto: 32, dibujar(L, t) {
      // eje de abajo (3.5, 31) a arriba (11.5, 2.5); ancho de 1.8 a 3.6
      const B = [3.5, 31], Tp = [11.5, 2.5], d = [Tp[0] - B[0], Tp[1] - B[1]], len = Math.hypot(d[0], d[1]);
      const u = [d[0] / len, d[1] / len], nn = [-u[1], u[0]];
      const at = (k, w) => [B[0] + d[0] * k + nn[0] * w, B[1] + d[1] * k + nn[1] * w];
      const ancho = (k) => 1.8 + 1.8 * k;
      // nudos y hojas atras del palo
      t.o(L, ...at(0.42, ancho(0.42) + 0.9), 1.6, 1.6, 'g');
      t.o(L, ...at(0.68, -ancho(0.68) - 0.8), 1.6, 1.6, 'g');
      t.p(L, [at(0.25, -ancho(0.25)), at(0.17, -ancho(0.17) - 3.4), at(0.31, -ancho(0.31) - 1.2)], 'h');
      t.p(L, [at(0.55, ancho(0.55)), at(0.5, ancho(0.5) + 3.6), at(0.62, ancho(0.62) + 1)], 'h');
      t.p(L, [at(0, -ancho(0)), at(0, ancho(0)), at(0.93, ancho(0.93)), at(1, ancho(1) * 0.6), at(1.03, 0), at(1, -ancho(1) * 0.6), at(0.93, -ancho(0.93))], 'g');
      // franjas rojas en diagonal
      for (const k of [0.3, 0.72]) {
        const w = ancho(k) - 0.2, e = 0.045;
        t.p(L, [at(k - e, -w), at(k + e + 0.04, -w), at(k + e, w), at(k - e - 0.04, w)], 'r', false);
      }
      t.x(L, ...at(0.9, ancho(0.9) * 0.4), 'h');
    } },
  };
  function pinta(L, palo, cx, cy, s = 1, invertido = false) {
    const d = PALO[palo];
    d.dibujar(L, lugar(cx - (d.ancho * s) / 2, cy - (d.alto * s) / 2, s, d.ancho, d.alto, invertido));
  }

  // ── Las figuras (sota, caballo y rey), clasicas ──
  // Colores de la ropa por palo, como en el mazo de Fournier
  const ROPA = {
    oro: { T: 'r', U: 'y', V: 'b' }, copa: { T: 'g', U: 'r', V: 'y' },
    espada: { T: 'b', U: 'r', V: 'y' }, basto: { T: 'r', U: 'g', V: 'b' },
  };
  function cabeza(L, cx, cy, barba) {
    ovalo(L, cx, cy, 5.5, 6.5, 'f');
    if (barba) {
      poli(L, [[cx - 5.5, cy + 1], [cx + 5.5, cy + 1], [cx + 4.5, cy + 8], [cx, cy + 11], [cx - 4.5, cy + 8]], 's');
      poli(L, [[cx - 2.5, cy + 3.2], [cx + 2.5, cy + 3.2], [cx + 2, cy + 4.2], [cx - 2, cy + 4.2]], 'S', false);
      poli(L, [[cx - 6, cy - 4], [cx - 3.5, cy - 4], [cx - 4, cy + 3], [cx - 6.3, cy + 2]], 's');
      poli(L, [[cx + 6, cy - 4], [cx + 3.5, cy - 4], [cx + 4, cy + 3], [cx + 6.3, cy + 2]], 's');
    } else {
      poli(L, [[cx - 6, cy - 4], [cx - 3, cy - 4], [cx - 4.5, cy + 4], [cx - 6.5, cy + 3]], 'n');
      poli(L, [[cx + 6, cy - 4], [cx + 3, cy - 4], [cx + 4.5, cy + 4], [cx + 6.5, cy + 3]], 'n');
      pix(L, cx, cy + 3.5, 'F');
    }
    pix(L, cx - 2, cy - 0.5, 'k'); pix(L, cx + 2, cy - 0.5, 'k');
    pix(L, cx, cy + 1, 'F');
  }
  // La cara de Magaiba (el tegu rosa del club): trompa larga hacia la izquierda, papada enorme y redonda,
  // ojito naranja arriba y la lengua bifida afuera
  function magaiba(L, cx, cy, z = 1) {
    const P = ([x, y]) => [cx + x * z, cy + y * z];
    const pl = (pts, c, b) => poli(L, pts.map(P), c, b);
    const pt = (x, y, c) => { const [a, b] = P([x, y]); pix(L, a, b, c); };
    ovalo(L, cx + 1.5 * z, cy + 5 * z, 8 * z, 7 * z, 'p');
    pl([[-4, 8], [8, 6], [6, 11], [-1, 12]], 'P', false);
    pl([[-11, 0], [-4, -5.5], [4, -6.5], [7.5, -2.5], [3, 2.5], [-10.5, 2.5]], 'p');
    for (let x = -9; x <= 1; x += 0.5) pt(x, 1.2, 'd');
    pt(-9, -1, 'd');
    ovalo(L, cx + 1.8 * z, cy - 2.6 * z, 1.9 * z, 1.7 * z, 'o');
    pt(2.1, -2.6, 'k'); pt(2.1, -2.0, 'k');
    pl([[-10.5, 0.8], [-15, 2.2], [-15, 3.4], [-10.5, 2.2]], 'm', false);
    pl([[-15, 2.2], [-17, 0.8], [-17.5, 1.6], [-15.4, 2.8]], 'm', false);
    pl([[-15, 3.4], [-17, 4.8], [-17.5, 4], [-15.4, 2.8]], 'm', false);
    for (const [x, y] of [[-2, -3], [5, 1], [6, 4], [-1, 6], [3, 8], [-5, -1], [1, 4], [-3, 3]]) pt(x, y, 'P');
  }
  function corona(L, cx, cy) {
    poli(L, [[cx - 7, cy + 3], [cx + 7, cy + 3], [cx + 7.5, cy - 4], [cx + 4.5, cy - 0.5], [cx + 2, cy - 6], [cx, cy - 1.5], [cx - 2, cy - 6], [cx - 4.5, cy - 0.5], [cx - 7.5, cy - 4]], 'y');
    pix(L, cx, cy + 1, 'r'); pix(L, cx - 4, cy + 1, 'b'); pix(L, cx + 4, cy + 1, 'b');
  }
  function gorro(L, cx, cy, col, pluma) {
    poli(L, [[cx - 7.5, cy + 2], [cx + 7, cy + 2], [cx + 6, cy - 3.5], [cx - 5, cy - 4]], col);
    poli(L, [[cx + 3, cy - 3], [cx + 12, cy - 11], [cx + 13, cy - 8], [cx + 5, cy - 1]], pluma);
  }
  function rey(L, palo) {
    // capa azul atras, tunica roja larga con franja dorada, armiño abajo y en los hombros
    poli(L, [[25, 34], [55, 34], [66, 108], [14, 108]], 'b');
    poli(L, [[27, 36], [53, 36], [58, 104], [22, 104]], 'r');
    poli(L, [[37, 40], [43, 40], [45, 104], [35, 104]], 'y');
    for (let y = 46; y < 102; y += 7) { pix(L, 40, y, 'r'); pix(L, 39, y + 3, 'b'); pix(L, 41, y + 3, 'b'); }
    poli(L, [[22, 100], [58, 100], [59, 107], [21, 107]], 'e');
    for (let x = 24; x < 58; x += 4) pix(L, x, 103, 'k');
    poli(L, [[29, 58], [51, 58], [51.5, 61.5], [28.5, 61.5]], 'Y');
    poli(L, [[25, 34], [55, 34], [57, 41], [23, 41]], 'e');
    for (let x = 27; x < 55; x += 4) pix(L, x, 37, 'k');
    poli(L, [[52, 40], [60, 44], [66, 108], [56, 108]], 'B');
    // brazo levantado (a la izquierda de la carta) con la pinta, y el otro apoyado
    poli(L, [[27, 38], [20, 46], [15, 54], [19, 57], [27, 48]], 'r');
    ovalo(L, 16.5, 56.5, 2.6, 2.6, 'p');
    poli(L, [[51, 40], [56, 52], [53, 60], [49, 58], [51, 50]], 'r');
    ovalo(L, 52, 60, 2.5, 2.5, 'p');
    corona(L, 44, 12);
    magaiba(L, 40, 22, 1.6);
    ovalo(L, 32, 109, 4, 2, 'N'); ovalo(L, 48, 109, 4, 2, 'N');
    pinta(L, palo, 15, 42, palo === 'espada' || palo === 'basto' ? 0.95 : 0.85);
  }
  function sota(L, palo) {
    const R = ROPA[palo];
    // calzas de dos colores, zapatos, calzon abullonado, jubon, cuello blanco
    poli(L, [[31, 70], [39.5, 70], [38.5, 104], [32, 104]], R.U);
    poli(L, [[40.5, 70], [49, 70], [48, 104], [41.5, 104]], R.T);
    ovalo(L, 34, 106, 4.2, 2, 'N'); ovalo(L, 46, 106, 4.2, 2, 'N');
    poli(L, [[28, 60], [52, 60], [54, 72], [26, 72]], R.U);
    for (let x = 31; x < 52; x += 5) poli(L, [[x, 61], [x + 2, 61], [x + 2, 71], [x, 71]], R.V, false);
    poli(L, [[29, 36], [51, 36], [53, 62], [27, 62]], R.T);
    poli(L, [[38, 37], [42, 37], [42, 61], [38, 61]], R.V, false);
    poli(L, [[28, 58], [52, 58], [52, 61], [28, 61]], 'Y');
    poli(L, [[32, 33], [48, 33], [46, 38], [34, 38]], 'e');
    // brazo levantado con la pinta, y el otro en la cintura
    poli(L, [[30, 38], [22, 44], [16, 50], [20, 53], [29, 46]], R.T);
    ovalo(L, 17.5, 52, 2.6, 2.6, 'f');
    poli(L, [[50, 38], [56, 48], [53, 58], [49, 56], [51, 48]], R.T);
    ovalo(L, 51, 58, 2.4, 2.4, 'f');
    cabeza(L, 40, 26, false);
    gorro(L, 40, 20, R.U, R.V === 'y' ? 'y' : 'q');
    pinta(L, palo, 16, 38, palo === 'espada' || palo === 'basto' ? 0.95 : 0.85);
  }
  function caballo(L, palo) {
    const R = ROPA[palo];
    // el caballo gris de costado, con la manta roja y flecos dorados
    // patas (las de atras un poco mas oscuras), cuerpo, cola, cuello y cabeza mirando a la izquierda
    poli(L, [[24, 76], [28.5, 76], [27, 104], [23, 104]], 'S'); poli(L, [[53, 76], [57.5, 76], [59, 104], [55, 104]], 'S');
    poli(L, [[30, 76], [34.5, 76], [33.5, 104], [29.5, 104]], 's'); poli(L, [[59, 74], [63.5, 74], [65, 104], [61, 104]], 's');
    poli(L, [[62, 64], [69, 66], [72, 88], [67, 90], [64, 74]], 'S');
    ovalo(L, 44, 70, 21, 11.5, 's');
    poli(L, [[24, 72], [20, 52], [27, 47], [34, 64]], 's');
    poli(L, [[22, 48], [9, 52], [5, 60], [9, 64], [24, 59], [28, 47]], 's');
    poli(L, [[22, 49], [22, 41], [26, 46]], 's');
    poli(L, [[5, 58], [9, 60], [9, 64], [5, 61]], 'S', false);
    poli(L, [[27, 47], [31, 50], [35, 64], [32, 66]], 'S');
    pix(L, 16, 52, 'k'); pix(L, 7, 60, 'k');
    // la montura: una manta roja con flecos, solo en el medio del lomo
    poli(L, [[36, 60], [55, 60], [57, 76], [34, 76]], 'r');
    poli(L, [[34, 74], [57, 74], [57, 78], [34, 78]], 'y');
    for (let x = 35; x < 57; x += 3) pix(L, x, 79, 'Y');
    ovalo(L, 25, 105, 3, 1.6, 'k'); ovalo(L, 31.5, 105, 3, 1.6, 'k'); ovalo(L, 57, 105, 3, 1.6, 'k'); ovalo(L, 63, 105, 3, 1.6, 'k');
    // el jinete
    poli(L, [[40, 58], [48, 58], [47, 80], [42, 82], [40, 70]], R.U);
    ovalo(L, 44, 83, 3.6, 2, 'N');
    poli(L, [[37, 38], [53, 38], [54, 62], [36, 62]], R.T);
    poli(L, [[40, 35], [50, 35], [49, 40], [41, 40]], 'e');
    poli(L, [[38, 41], [31, 44], [27, 48], [31, 51], [37, 48]], R.T);
    ovalo(L, 28, 50, 2.4, 2.4, 'f');
    cabeza(L, 45, 28, false);
    gorro(L, 45, 22, R.U, R.V === 'y' ? 'y' : 'q');
    pinta(L, palo, 26, 37, palo === 'espada' || palo === 'basto' ? 0.85 : 0.75);
  }

  // ── La carta ──
  const DIG = {
    0: ['kkk', 'k.k', 'k.k', 'k.k', 'kkk'], 1: ['.k.', 'kk.', '.k.', '.k.', 'kkk'], 2: ['kkk', '..k', 'kkk', 'k..', 'kkk'],
    3: ['kkk', '..k', '.kk', '..k', 'kkk'], 4: ['k.k', 'k.k', 'kkk', '..k', '..k'], 5: ['kkk', 'k..', 'kkk', '..k', 'kkk'],
    6: ['kkk', 'k..', 'kkk', 'k.k', 'kkk'], 7: ['kkk', '..k', '.k.', '.k.', '.k.'],
  };
  function numero(L, n, x, y, invertido) {
    const ds = String(n).split('');
    const filas = DIG[0].map((_, f) => ds.map(d => DIG[d][f]).join('.'));
    const ancho = filas[0].length, alto = filas.length, z = 2;
    for (let f = 0; f < alto; f++) for (let i = 0; i < ancho; i++) {
      if (filas[f][i] !== 'k') continue;
      const cx = invertido ? ancho - 1 - i : i, cy = invertido ? alto - 1 - f : f;
      for (let a = 0; a < z; a++) for (let b = 0; b < z; b++) pix(L, x + cx * z + a, y + cy * z + b, 'k');
    }
  }
  const CORTES = { oro: 0, copa: 1, espada: 2, basto: 3 };
  function fondo(L, palo) {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const dx = Math.min(x, W - 1 - x), dy = Math.min(y, H - 1 - y);
      if (dx + dy < 2) continue; // esquinas redondeadas
      const borde = dx === 0 || dy === 0 || (dx === 1 && dy === 1);
      L.px[y * W + x] = borde ? 'k' : (dx <= 1 || dy <= 1 ? 'C' : 'c');
    }
    // las "pintas" del borde: cortes en la linea de arriba y de abajo segun el palo
    const n = CORTES[palo], x0 = 16, x1 = W - 17, cortes = [];
    for (let i = 1; i <= n; i++) cortes.push(Math.round(x0 + (x1 - x0) * i / (n + 1)));
    for (const y of [5, H - 6]) for (let x = x0; x <= x1; x++) if (!cortes.some(c => Math.abs(c - x) <= 2)) pix(L, x, y, 'k');
  }
  const FY = [31, 60, 89];
  const LUGARES = {
    2: [[40, 32], [40, 88, 1]], 3: [[40, 28], [40, 60], [40, 92, 1]], 4: [[26, 34], [54, 34], [26, 86, 1], [54, 86, 1]],
    5: [[26, 31], [54, 31], [40, 60], [26, 89, 1], [54, 89, 1]], 6: [[26, FY[0]], [54, FY[0]], [26, FY[1]], [54, FY[1]], [26, FY[2], 1], [54, FY[2], 1]],
    7: [[26, 28], [54, 28], [40, 47], [26, 66], [54, 66], [26, 92, 1], [54, 92, 1]],
  };
  const FILA = { 2: [[28, 60], [52, 60]], 3: [[20, 60], [40, 60], [60, 60]] };
  function dibujar(palo, n) {
    const L = nuevo();
    fondo(L, palo);
    if (n === 1) pinta(L, palo, W / 2, H / 2, palo === 'oro' ? 2.9 : palo === 'copa' ? 2.6 : 2.5);
    else if (n <= 7) {
      const s = palo === 'oro' ? (n <= 3 ? 1.6 : n === 4 ? 1.45 : n <= 6 ? 1.2 : 1) : palo === 'copa' ? (n === 2 ? 1.6 : n === 3 ? 1.3 : n === 4 ? 1.45 : n <= 6 ? 1.05 : 0.85) : 1;
      const largo = palo === 'espada' || palo === 'basto';
      if (largo && n <= 3) for (const [cx, cy] of FILA[n]) pinta(L, palo, cx, cy, 1.7);
      else for (const [cx, cy, inv] of LUGARES[n]) pinta(L, palo, cx, cy, largo ? (n <= 4 ? 1.15 : n === 5 ? 0.9 : 0.8) : s, !!inv && largo);
    } else {
      TR = [0.88, 4.8, 4, n === 11 && (palo === 'espada' || palo === 'basto')];
      if (n === 10) sota(L, palo); else if (n === 11) caballo(L, palo); else rey(L, palo);
      TR = null;
    }
    numero(L, n, 5, 6, false);
    const ancho = (String(n).length * 4 - 1) * 2;
    numero(L, n, W - 5 - ancho, H - 16, true);
    return pintar(L);
  }
  function pintar(L) {
    const cv = document.createElement('canvas');
    cv.width = W * ESCALA; cv.height = H * ESCALA;
    const ctx = cv.getContext('2d');
    for (let i = 0; i < L.px.length; i++) {
      const c = L.px[i];
      if (!c) continue;
      ctx.fillStyle = COL[c] || c;
      ctx.fillRect((i % W) * ESCALA, ((i / W) | 0) * ESCALA, ESCALA, ESCALA);
    }
    return cv;
  }
  function dorso() {
    const L = nuevo();
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const dx = Math.min(x, W - 1 - x), dy = Math.min(y, H - 1 - y);
      if (dx + dy < 2) continue;
      if (dx === 0 || dy === 0 || (dx === 1 && dy === 1)) { L.px[y * W + x] = 'k'; continue; }
      if (dx <= 3 || dy <= 3) { L.px[y * W + x] = 'c'; continue; }
      if (dx === 4 || dy === 4) { L.px[y * W + x] = 'B'; continue; }
      L.px[y * W + x] = ((x + y) % 8 === 0 || (x - y + 240) % 8 === 0) ? 'l' : 'b';
    }
    return pintar(L);
  }

  window.mazoPixel = { dibujar, dorso, PALOS: ['oro', 'copa', 'espada', 'basto'], NUMEROS: [1, 2, 3, 4, 5, 6, 7, 10, 11, 12] };
})();
