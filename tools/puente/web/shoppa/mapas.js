// Shoppa: los mapas (propios, al estilo de los mapas de Shopper: estructuras de metal con techo, pilares,
// plataformas y repisas para engancharse, huecos abajo para caer al agua). Cada mapa se arma con piezas
// (rectangulos) y trae sus puntos: donde aparecen las serpientes y donde caen las cajas, en orden.
(function (raiz) {
  'use strict';

  // ── "Fabrica": 1920x900, agua a 860 ──
  function fabrica() {
    const W = 1920, H = 900;
    const piezas = [];
    const R = (x, y, w, h) => piezas.push([x, y, w, h]);
    // el techo, con dientes que bajan (para engancharse)
    R(0, 0, W, 26);
    for (let x = 60; x < W - 60; x += 150) R(x, 26, 14, 26 + ((x / 150) % 3) * 12);
    // las paredes de los costados (hasta la mitad: abajo, el hueco al agua)
    R(0, 0, 24, 470); R(W - 24, 0, 24, 470);
    // la torre del medio: cuelga del techo, con repisas
    R(940, 26, 40, 470); R(880, 200, 60, 10); R(980, 300, 60, 10); R(880, 400, 60, 10); R(920, 496, 80, 14);
    // los dos "pods" de los costados: un marco abierto con estantes adentro
    for (const [x0, lado] of [[150, 1], [1350, -1]]) {
      R(x0, 150, 420, 18);                    // el techo del pod
      R(x0 + (lado > 0 ? 0 : 402), 150, 18, 230); // la pared de afuera
      R(x0 + (lado > 0 ? 402 : 0), 150, 18, 120); // la pared de adentro (corta: se entra por abajo)
      R(x0, 380, 300, 16);                    // el piso del pod
      R(x0 + 100, 270, 140, 10);              // un estante
      R(x0 + (lado > 0 ? 300 : 102), 420, 18, 120); // un pilar que cuelga del piso
    }
    // plataformas flotantes y repisas finas (los "¬" de los mapas de Shopper)
    R(640, 250, 150, 22); R(1130, 250, 150, 22);
    R(700, 560, 120, 18); R(1100, 560, 120, 18);
    R(420, 600, 70, 8); R(420, 592, 8, 8); R(1430, 600, 70, 8); R(1492, 592, 8, 8);
    R(300, 470, 60, 8); R(1560, 470, 60, 8);
    R(800, 120, 80, 8); R(1040, 120, 80, 8);
    // abajo: tres islas sobre el agua, con huecos entre ellas
    R(120, 760, 380, 40); R(160, 740, 80, 20);
    R(780, 790, 360, 30); R(900, 760, 120, 30);
    R(1420, 760, 380, 40); R(1680, 740, 80, 20);
    // donde aparecen las serpientes (arriba de algo) y donde caen las cajas (en este orden)
    const salidas = [[230, 360], [1690, 360], [700, 230], [1210, 230], [300, 740], [1600, 740]];
    const cajas = [[960, 480], [520, 360], [1400, 360], [715, 540], [1205, 540], [960, 770], [455, 590], [1465, 590],
      [840, 100], [1080, 100], [330, 460], [1590, 460], [220, 740], [1700, 740], [910, 190], [1010, 290], [910, 390]];
    return { id: 'fabrica', nombre: 'Fábrica', w: W, h: H, agua: 860, techo: true, piezas, salidas, cajas,
      cielo: ['#1a1310', '#3a1a12', '#5a2414'], metal: ['#8d939c', '#6b717b', '#b9bec6', '#4b5059'] };
  }

  // ── "Isla": una isla de tierra al azar para el modo normal. Sale de la semilla de la partida, asi es la misma en
  // todas las compus (solo cuentas exactas: sumas, productos y raices, nada de senos), con cuevas adentro, islotes
  // flotantes arriba (para engancharse) y canales al agua. Los colores cambian con la semilla ──
  function azar(s) { let a = s >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const TEMAS = [
    { id: 'pradera', cielo: ['#2c5cc0', '#7fb2ee', '#d6ecff'], tope: ['#7ad35c', '#5fb847', '#47993a'], tierra: ['#7a4b2c', '#6a3f24', '#8c5b37'], piedra: '#a39486', borde: '#3b2414' },
    { id: 'atardecer', cielo: ['#2a1b4a', '#9c4468', '#f0a35a'], tope: ['#b5d65a', '#97b948', '#7a9a39'], tierra: ['#8a5532', '#734528', '#9e6c42'], piedra: '#b39a84', borde: '#3d2213' },
    { id: 'nieve', cielo: ['#1d3557', '#5d8fc4', '#cfe3f5'], tope: ['#ffffff', '#e6eef8', '#c8d5e8'], tierra: ['#6c7686', '#5b6474', '#7f8999'], piedra: '#a3adbb', borde: '#2c3340' },
    { id: 'arena', cielo: ['#c8562a', '#f1a35c', '#ffe1ae'], tope: ['#f2d895', '#e0c179', '#c9a55a'], tierra: ['#b9844a', '#a2713c', '#cc985c'], piedra: '#e1c7a0', borde: '#5a3a1a' },
    { id: 'noche', cielo: ['#04071a', '#121a46', '#2a3170'], tope: ['#5cc07c', '#46a263', '#33824c'], tierra: ['#4d3d5e', '#3f3150', '#5e4c70'], piedra: '#8a7c9c', borde: '#1c1426' },
  ];
  function isla(semilla) {
    const s = (semilla >>> 0) || 1, r = azar((s ^ 0x5bd1e995) >>> 0);
    const tema = TEMAS[Math.floor(r() * TEMAS.length)];
    return { id: 'isla', nombre: 'Isla', w: 1920, h: 900, agua: 860, semilla: s, gen: true, tema, cielo: tema.cielo, salidas: [], cajas: [], minas: [], barriles: [] };
  }
  function genIsla(T, def) {
    const W = def.w, H = def.h, AG = def.agua, m = T.m, r = azar((Math.imul(def.semilla | 0, 0x9E3779B1) + 12345) >>> 0);
    const ruido = (paso, amp) => {
      const n = Math.ceil(W / paso) + 2, v = [];
      for (let i = 0; i < n; i++) v.push((r() * 2 - 1) * amp);
      return (x) => { const i = Math.floor(x / paso), u = x / paso - i, s = u * u * (3 - 2 * u); return v[i] + (v[i + 1] - v[i]) * s; };
    };
    // 1) el suelo: una altura por columna (ruido suave en tres escalas); las puntas y los canales bajan al agua
    const base = 500 + r() * 70, n1 = ruido(300, 150), n2 = ruido(90, 50), n3 = ruido(22, 7);
    const x0 = 60 + r() * 90, x1 = W - 60 - r() * 90;
    const cortes = [], nc = r() < 0.55 ? 1 : 2;
    for (let k = 0; k < nc; k++) cortes.push([W * (nc === 1 ? 0.5 : 0.3 + 0.4 * k) + (r() - 0.5) * 200, 30 + r() * 50]);
    const alto = new Float64Array(W);
    for (let x = 0; x < W; x++) {
      let y = base + n1(x) + n2(x) + n3(x);
      const b = Math.min(x - x0, x1 - x);
      if (b < 0) y = H + 50; else if (b < 170) { const u = 1 - b / 170; y += u * u * 450; }
      for (const [c, a] of cortes) { const d = Math.abs(x - c); if (d < a) y = H + 50; else if (d < a + 130) { const u = 1 - (d - a) / 130; y += u * u * 400; } }
      alto[x] = Math.max(170, y);
    }
    for (let x = 0; x < W; x++) for (let y = Math.max(0, Math.ceil(alto[x])); y < H; y++) m[y * W + x] = 1;
    // 2) las cuevas (algunas con el techo finito: se rompen y quedan aleros)
    const elipse = (cx, cy, rx, ry, val) => {
      for (let y = Math.max(0, Math.floor(cy - ry)); y <= Math.min(H - 1, Math.ceil(cy + ry)); y++) {
        const dy = (y + 0.5 - cy) / ry, q = 1 - dy * dy; if (q < 0) continue;
        for (let x = Math.max(0, Math.floor(cx - rx)); x <= Math.min(W - 1, Math.ceil(cx + rx)); x++) { const dx = (x + 0.5 - cx) / rx; if (dx * dx <= q) m[y * W + x] = val; }
      }
    };
    const nCuevas = 3 + Math.floor(r() * 4);
    for (let k = 0; k < nCuevas; k++) {
      const cx = x0 + 160 + r() * Math.max(1, x1 - x0 - 320), rx = 45 + r() * 85, ry = 24 + r() * 34, prof = 26 + r() * 60;
      const cy = alto[Math.max(0, Math.min(W - 1, Math.floor(cx)))] + prof + ry;
      if (cy + ry > AG - 30) continue;
      elipse(cx, cy, rx, ry, 0);
    }
    // 3) los islotes flotantes: arriba casi planos, abajo en punta con el borde irregular
    const nFlot = 2 + Math.floor(r() * 3);
    for (let k = 0; k < nFlot; k++) {
      const cx = 220 + r() * (W - 440), rx = 55 + r() * 85, arriba = 10 + r() * 10, abajo = 30 + r() * 40, cy = 140 + r() * 150, nb = ruido(12, 5);
      let suelo = H;
      for (let x = Math.max(0, Math.floor(cx - rx)); x <= Math.min(W - 1, Math.ceil(cx + rx)); x++) suelo = Math.min(suelo, alto[x]);
      if (cy + abajo + 70 > suelo) continue;
      for (let x = Math.max(0, Math.floor(cx - rx)); x <= Math.min(W - 1, Math.ceil(cx + rx)); x++) {
        const u = Math.abs(x + 0.5 - cx) / rx; if (u >= 1) continue;
        const ya = cy - arriba * (1 - u * u), yb = cy + abajo * (1 - u) * (1 - u * 0.3) + nb(x) * (1 - u);
        for (let y = Math.max(0, Math.ceil(ya)); y <= Math.min(H - 1, Math.floor(yb)); y++) m[y * W + x] = 1;
      }
    }
    // 4) los lugares: donde se puede parar una serpiente (un pixel de piso con lugar arriba y piso a los costados)
    const en = (x, y) => m[y * W + x];
    const parada = (x, y) => {
      if (!en(x, y) || en(x, y - 1)) return false;
      for (let dy = 3; dy <= 30; dy++) for (let dx = -4; dx <= 4; dx++) if (en(x + dx, y - dy)) return false;
      if (en(x - 1, y - 1) || en(x + 1, y - 1) || en(x, y - 2)) return false;
      return (en(x - 4, y) + en(x - 4, y + 1) + en(x - 4, y + 2)) > 0 && (en(x + 4, y) + en(x + 4, y + 1) + en(x + 4, y + 2)) > 0;
    };
    const puntos = [];
    for (let x = 16; x < W - 16; x += 5) for (let y = 31; y < AG - 30; y++) if (parada(x, y)) puntos.push([x, y]);
    const mezcla = puntos.map(p => [r(), p]).sort((a, b) => a[0] - b[0]).map(z => z[1]);
    const d2 = (p, q) => (p[0] - q[0]) * (p[0] - q[0]) + (p[1] - q[1]) * (p[1] - q[1]);
    const elegir = (lista, n, dmin, lejos, dl) => {
      const out = [];
      for (const p of lista) {
        if (out.length >= n) break;
        if (out.some(q => d2(p, q) < dmin * dmin) || (lejos && lejos.some(q => d2(p, q) < dl * dl))) continue;
        out.push(p);
      }
      return out;
    };
    let sal = elegir(mezcla, 20, 64);
    if (sal.length < 20) sal = elegir(mezcla, 20, 40);
    if (sal.length < 20) sal = elegir(mezcla, 20, 22);
    if (sal.length < 20) sal = elegir(mezcla, 20, 12);
    if (sal.length < 20) sal = elegir(mezcla, 20, 10);
    if (sal.length < 20) sal = elegir(mezcla, 20, 0);
    def.puntos = puntos.length;
    const barriles = elegir(mezcla.slice(Math.floor(mezcla.length / 2)).concat(mezcla.slice(0, Math.floor(mezcla.length / 2))), 4, 110, sal, 40);
    const minas = elegir(mezcla.slice().reverse(), 8, 60, sal.concat(barriles), 40);
    def.salidas = sal.map(([x, y]) => [x, y - 12]);
    def.minas = minas; def.barriles = barriles;
    // las cajas caen desde arriba: el primer piso de cada columna
    def.cajas = [];
    for (let x = 40; x < W - 40; x += 41) for (let y = 0; y < AG - 20; y++) if (m[y * W + x]) { def.cajas.push([x, y]); break; }
  }

  const MAPAS = { fabrica, isla };

  // la mascara de terreno del mapa
  function terreno(M, def) {
    const T = new M.Terreno(def.w, def.h, def.agua);
    if (def.gen) { genIsla(T, def); return T; }
    for (const [x, y, w, h] of def.piezas) for (let j = Math.max(0, y); j < Math.min(def.h, y + h); j++) for (let i = Math.max(0, x); i < Math.min(def.w, x + w); i++) T.m[j * def.w + i] = 1;
    return T;
  }

  // el dibujo de la isla: pasto (o nieve, o arena) arriba, tierra con piedritas adentro, borde oscuro abajo y a
  // los costados, y pastitos sueltos arriba del piso (solo dibujo)
  function pintarIsla(def, T) {
    const W = def.w, H = def.h, tm = def.tema;
    const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
    const tope = tm.tope.map(hex), tierra = tm.tierra.map(hex), piedra = hex(tm.piedra), borde = hex(tm.borde);
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const x = cv.getContext('2d'), img = x.createImageData(W, H), d = img.data;
    const prof = new Int32Array(W);
    const hs = (i, j) => (Math.imul(i, 73856093) ^ Math.imul(j, 19349663)) >>> 0;
    const pon = (k, c, f) => { d[k * 4] = Math.min(255, c[0] * f); d[k * 4 + 1] = Math.min(255, c[1] * f); d[k * 4 + 2] = Math.min(255, c[2] * f); d[k * 4 + 3] = 255; };
    // un ruido suave (valores al azar en una grilla, interpolados) para las manchas grandes de la tierra y las vetas
    const grilla = (paso) => {
      const gw = Math.ceil(W / paso) + 2, gh = Math.ceil(2 * H / paso) + 2, v = new Float32Array(gw * gh);
      for (let q = 0; q < v.length; q++) v[q] = (hs(q, paso * 31) % 1000) / 1000;
      return (i, j) => {
        const fx = i / paso, fy = j / paso, x0 = Math.floor(fx), y0 = Math.floor(fy), u = fx - x0, w = fy - y0;
        const su = u * u * (3 - 2 * u), sw = w * w * (3 - 2 * w), a = v[y0 * gw + x0], b = v[y0 * gw + x0 + 1], c = v[(y0 + 1) * gw + x0], e = v[(y0 + 1) * gw + x0 + 1];
        return (a + (b - a) * su) * (1 - sw) + (c + (e - c) * su) * sw;
      };
    };
    // (n1 se usa con la altura estirada: la grilla llega al doble de alto)
    const n1 = grilla(28), n2 = grilla(9);
    const mezcla = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t];
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const k = j * W + i;
      if (!T.m[k]) { prof[i] = 0; continue; }
      const p = ++prof[i], hh = hs(i, j);
      let c, f = 1;
      if (p <= 3) c = tope[p === 1 ? 0 : 1];
      else if (p <= 6) c = mezcla(tope[2], tierra[2], (p - 3) / 4);
      else {
        // la tierra: manchas grandes claras y oscuras, vetas finas (donde el ruido cruza la mitad) y alguna piedra
        const m1 = n1(i, j * 1.6), m2 = n2(i, j);
        c = m1 < 0.4 ? mezcla(tierra[1], tierra[0], m1 / 0.4) : mezcla(tierra[0], tierra[2], (m1 - 0.4) / 0.6);
        if (Math.abs(m2 - 0.5) < 0.035) c = tierra[1];
        else if (m2 > 0.9) c = mezcla(c, piedra, 0.7);
        f = 0.95 + (hh % 11) / 100;
      }
      if ((i > 0 && !T.m[k - 1]) || (i < W - 1 && !T.m[k + 1]) || (j < H - 1 && !T.m[k + W])) { c = borde; f = 1; }
      pon(k, c, f);
      // pastitos
      if (p === 1 && j > 3 && hh % 5 === 0) { const n = 1 + (hh >> 5) % 3; for (let q = 1; q <= n; q++) pon(k - q * W, tope[q === n ? 0 : 1], 1); }
    }
    x.putImageData(img, 0, 0);
    return cv;
  }

  // el dibujo (solo en el navegador): chapas de metal con juntas, remaches y borde claro arriba
  function pintar(def, T) {
    if (def.gen) return pintarIsla(def, T);
    const cv = document.createElement('canvas'); cv.width = def.w; cv.height = def.h;
    const x = cv.getContext('2d'), img = x.createImageData(def.w, def.h), d = img.data;
    const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
    const [base, oscuro, claro, junta] = def.metal.map(hex);
    for (let j = 0; j < def.h; j++) for (let i = 0; i < def.w; i++) {
      const k = j * def.w + i;
      if (!T.m[k]) continue;
      const arriba = j > 0 && !T.m[k - def.w], abajo = j < def.h - 1 && !T.m[k + def.w];
      const izq = i > 0 && !T.m[k - 1], der = i < def.w - 1 && !T.m[k + 1];
      let c;
      if (arriba || izq) c = claro;
      else if (abajo || der) c = junta;
      else {
        // chapas de 32x24 con juntas y remaches en las esquinas
        const u = i % 32, v = j % 24;
        if (u === 0 || v === 0) c = junta;
        else if ((u === 3 || u === 28) && (v === 3 || v === 20)) c = claro;
        else { const r = ((i * 7919 + j * 104729) % 17) / 17; c = r > 0.82 ? oscuro : base; }
      }
      d[k * 4] = c[0]; d[k * 4 + 1] = c[1]; d[k * 4 + 2] = c[2]; d[k * 4 + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    return cv;
  }

  const API = { MAPAS, terreno, pintar, porId: (id, semilla) => (MAPAS[id] || MAPAS.fabrica)(semilla) };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else raiz.ShoppaMapas = API;
})(typeof window !== 'undefined' ? window : globalThis);
