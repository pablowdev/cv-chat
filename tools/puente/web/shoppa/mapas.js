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
    return { id: 'fabrica', nombre: 'Fábrica', w: W, h: H, agua: 860, piezas, salidas, cajas,
      cielo: ['#1a1310', '#3a1a12', '#5a2414'], metal: ['#8d939c', '#6b717b', '#b9bec6', '#4b5059'] };
  }

  const MAPAS = { fabrica };

  // la mascara de terreno del mapa
  function terreno(M, def) {
    const T = new M.Terreno(def.w, def.h, def.agua);
    for (const [x, y, w, h] of def.piezas) for (let j = Math.max(0, y); j < Math.min(def.h, y + h); j++) for (let i = Math.max(0, x); i < Math.min(def.w, x + w); i++) T.m[j * def.w + i] = 1;
    return T;
  }

  // el dibujo (solo en el navegador): chapas de metal con juntas, remaches y borde claro arriba
  function pintar(def, T) {
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

  const API = { MAPAS, terreno, pintar, porId: (id) => (MAPAS[id] || MAPAS.fabrica)() };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else raiz.ShoppaMapas = API;
})(typeof window !== 'undefined' ? window : globalThis);
