// Pool (8 bolas) en la seccion Juegos: la sala, crear una partida, las reglas y la mesa. Lo carga
// aviso.js (el marco de Juegos) la primera vez que se abre el juego; el servidor es pool.js y la
// fisica, pool-motor.js (el servidor simula cada tiro y aca se ve el recorrido, cuadro por cuadro).
// La mesa es la del pool que hizo el dueño del servidor: apuntar con el mouse, la fuerza con la
// barra (y espacio para tirar) o arrastrando hacia atras, el efecto con la bola de la derecha y la
// bola en mano arrastrando la blanca.
(function () {
  'use strict';
  let A = null; // lo que presta el marco de Juegos (aviso.js)
  let M = null; // la mesa abierta
  const el = (t, c, x) => A.el(t, c, x);
  const btn = (texto, cls, fn) => { const b = el('button', 'jg-btn' + (cls ? ' ' + cls : ''), texto); b.type = 'button'; if (fn) b.addEventListener('click', fn); return b; };
  const accion = async (d) => { const r = await A.emit('pool:accion', { id: M && M.id, ...d }); if (r.error) A.toast(r.error, 'error'); return r; };
  const esInvitado = () => !!(window.app && window.app.user && window.app.user.isGuest);

  // ── La mesa (las mismas medidas que pool-motor.js: las del Yahoo, medidas en los videos) ──
  const W = 1000, H = 500, TL = 50, TR = 950, TT = 54.5, TB = 445.5, TW = TR - TL, TH = TB - TT;
  const R = 16, D = R * 2, POCKET_R = 25, HEAD_X = TL + TW / 4;
  const MEDIO_AFUERA = 22, BX = 10, BY = 10, BOCA = POCKET_R, BOCA_M = 26;
  const XMIN = TL + BX + R, XMAX = TR - BX - R, YMIN = TT + BY + R, YMAX = TB - BY - R;
  const POCKETS = [{ x: TL, y: TT }, { x: TL + TW / 2, y: TT - MEDIO_AFUERA }, { x: TR, y: TT }, { x: TL, y: TB }, { x: TL + TW / 2, y: TB + MEDIO_AFUERA }, { x: TR, y: TB }];
  const COLOR = {
    1: '#f6d31a', 2: '#2a6fe8', 3: '#e8231c', 4: '#8a3ad8', 5: '#f28a1e', 6: '#3cc43a', 7: '#e2389e', 8: '#0c0c0c',
    9: '#f6d31a', 10: '#2a6fe8', 11: '#e8231c', 12: '#8a3ad8', 13: '#f28a1e', 14: '#3cc43a', 15: '#e2389e',
  };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  // El marco de madera: como en el diseño del dueño, la madera que se ve ocupa un 6,3% del largo de la mesa a
  // cada lado. La mesa de juego no cambia: el lienzo crece alrededor
  // Medido en la imagen de referencia del dueño: la madera mide 58 y la banda verde 15, igual en los cuatro lados
  // (74 y 19 px sobre un paño de 1099 px). MARCO es del centro de las troneras al borde de afuera
  const BANDA_VIS = 15, MADERA = 58;
  const MARCO = MADERA + BANDA_VIS - BX, MARCO_Y = MADERA + BANDA_VIS - BY, OX = MARCO - TL, OY = MARCO_Y - TT, CW = W + 2 * OX, CH = H + 2 * OY;
  const FX0 = -OX, FY0 = -OY, FX1 = W + OX, FY1 = H + OY;

  // La mesa se dibuja una sola vez (en un lienzo aparte) y cada cuadro se copia: la madera con volumen, las
  // esquineras, las bandas con su borde iluminado, el paño con textura y las troneras con su borde
  let fondoMesa = null;
  // El paño y las bandas igual que la fisica (pool-motor.js), como el Yahoo: las bandas son rectas hasta el agujero
  // (en las esquinas las corta el agujero) y en las del medio se cortan a BOCA_M del centro, con un bisel corto hasta
  // el agujero. d: cuanto se corre el contorno hacia la madera (0 = el borde del paño; BANDA_VIS = el borde de la banda)
  const WX = BX - BANDA_VIS, WY = BY - BANDA_VIS;
  // el bisel de las del medio: de la punta (a BOCA_M, sobre la banda) al borde del agujero
  const BISEL = { x0: BOCA_M, y0: BY + MEDIO_AFUERA, x1: POCKET_R - 2, y1: 0 };
  const bisel = (d) => { const y = BISEL.y0 - d, t = (BISEL.y0 - y) / (BISEL.y0 - BISEL.y1); return BISEL.x0 + (BISEL.x1 - BISEL.x0) * t; };
  function contornoPano(c, afuera) {
    const d = afuera === true ? BANDA_VIS : afuera || 0;
    const x0 = TL + BX - d, x1 = TR - BX + d, y0 = TT + BY - d, y1 = TB - BY + d, m = TL + TW / 2, a = bisel(d);
    const mt = TT - MEDIO_AFUERA, mb = TB + MEDIO_AFUERA, h = BISEL.x1;
    c.beginPath();
    c.moveTo(x0, y0); c.lineTo(m - a, y0); c.lineTo(m - h, mt); c.lineTo(m + h, mt); c.lineTo(m + a, y0); c.lineTo(x1, y0);
    c.lineTo(x1, y1); c.lineTo(m + a, y1); c.lineTo(m + h, mb); c.lineTo(m - h, mb); c.lineTo(m - a, y1); c.lineTo(x0, y1);
    c.closePath();
  }
  function pintarMesa(c) {
    // ── El aspecto: madera roja con volumen (oscura afuera y adentro, brillante al medio), esquineras doradas
    // con un filo claro alrededor de cada tronera, bandas y paño verde. Las medidas son las de siempre. ──
    let sem = 11; const rnd = () => (sem = (sem * 16807) % 2147483647) / 2147483647;
    // madera con vetas: un degradé de base y muchas lineas finas onduladas, a lo largo de la pieza
    const madera = (x, y, w, h, acostada, tonos, vetas) => {
      c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip();
      const g = acostada ? c.createLinearGradient(0, y, 0, y + h) : c.createLinearGradient(x, 0, x + w, 0);
      tonos.forEach(([p, col]) => g.addColorStop(p, col));
      c.fillStyle = g; c.fillRect(x, y, w, h);
      const largo = acostada ? w : h, ancho = acostada ? h : w;
      for (let k = 0; k < vetas.n; k++) {
        const pos = rnd() * ancho, amp = 0.6 + rnd() * 2.4, frec = 0.004 + rnd() * 0.012, fase = rnd() * 6.28;
        c.strokeStyle = rnd() < 0.5 ? vetas.oscura : vetas.clara;
        c.globalAlpha = 0.18 + rnd() * 0.35; c.lineWidth = 0.6 + rnd() * 1.4;
        c.beginPath();
        for (let t = 0; t <= largo; t += 6) {
          const d = pos + Math.sin(t * frec + fase) * amp + Math.sin(t * frec * 3.1 + fase) * amp * 0.3;
          if (acostada) (t ? c.lineTo(x + t, y + d) : c.moveTo(x + t, y + d)); else (t ? c.lineTo(x + d, y + t) : c.moveTo(x + d, y + t));
        }
        c.stroke();
      }
      c.globalAlpha = 1; c.restore();
    };
    const CAOBA = [[0, '#3f0303'], [0.3, '#8e0c0c'], [0.55, '#9c1010'], [1, '#4a0404']];
    const VETA_CAOBA = { n: 0, oscura: '#4a0505', clara: '#a81818' };
    const CLARA = [[0, '#f4a62c'], [0.5, '#ec9a1e'], [1, '#d98612']];
    const VETA_CLARA = { n: 0, oscura: '#c07a10', clara: '#ffd070' };
    // el fondo (lo que queda detras de todo) y la madera de los cuatro lados
    c.fillStyle = '#4e0505'; c.fillRect(FX0, FY0, CW, CH);
    // donde la madera se junta con las bandas: pegada al verde, como en el diseño
    const ARR = TT + WY, ABA = TB - WY, IZQ = TL + WX, DER = TR - WX;
    madera(FX0, FY0, CW, ARR - FY0, true, CAOBA, VETA_CAOBA);
    madera(FX0, ABA, CW, FY1 - ABA, true, CAOBA.map(([p, col]) => [1 - p, col]), VETA_CAOBA);
    madera(FX0, FY0, IZQ - FX0, CH, false, CAOBA, VETA_CAOBA);
    madera(DER, FY0, FX1 - DER, CH, false, CAOBA.map(([p, col]) => [1 - p, col]), VETA_CAOBA);
    // el satinado: rayas rectas finas y muy suaves a lo largo de cada lado
    const satinar = (x, y, w, h, acostada) => {
      c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip();
      const ancho = acostada ? h : w;
      for (let k = 0; k < ancho; k += 1.5) { c.globalAlpha = 0.03 + rnd() * 0.07; c.fillStyle = rnd() < 0.5 ? '#000' : '#ff8080'; if (acostada) c.fillRect(x, y + k, w, 1); else c.fillRect(x + k, y, 1, h); }
      c.globalAlpha = 1; c.restore();
    };
    satinar(FX0, FY0, CW, ARR - FY0, true); satinar(FX0, ABA, CW, FY1 - ABA, true);
    satinar(FX0, FY0, IZQ - FX0, CH, false); satinar(DER, FY0, FX1 - DER, CH, false);
    // el canto de la madera hacia adentro: un filo claro y una sombra
    c.strokeStyle = 'rgba(255,200,170,0.22)'; c.lineWidth = 2; c.strokeRect(IZQ + 1, ARR + 1, DER - IZQ - 2, ABA - ARR - 2);
    c.strokeStyle = 'rgba(0,0,0,0.5)'; c.lineWidth = 2; c.strokeRect(FX0 + 2, FY0 + 2, CW - 4, CH - 4);
    // las esquineras: un cuadrado dorado prolijo en cada esquina (hasta un poco pasando la tronera), con bisel
    // y un filo claro donde se juntan con la madera roja
    // una pieza dorada con la forma que se le pase (un camino), con bisel y su filo claro
    const dorado = (forma, x, y, w, h) => {
      c.save(); forma(); c.clip();
      madera(x, y, w, h, true, CLARA, VETA_CLARA);
      c.lineJoin = 'round';
      forma(); c.strokeStyle = 'rgba(255,225,160,0.7)'; c.lineWidth = 8; c.stroke();
      forma(); c.strokeStyle = 'rgba(170,95,10,0.35)'; c.lineWidth = 2.5; c.stroke();
      c.restore();
      forma(); c.lineJoin = 'round'; c.strokeStyle = '#f3c99a'; c.lineWidth = 2; c.stroke();
    };
    const rectRedondo = (x, y, w, h, r) => () => { c.beginPath(); c.roundRect(x, y, w, h, r); };
    const Q = 30; // cuanto pasa la esquinera del centro de la tronera
    for (const [px, py, sx, sy] of [[TL, TT, 1, 1], [TR, TT, -1, 1], [TL, TB, 1, -1], [TR, TB, -1, -1]]) {
      const x0 = sx > 0 ? FX0 : px - Q, y0 = sy > 0 ? FY0 : py - Q, w = (sx > 0 ? px + Q : FX1) - x0, h = (sy > 0 ? py + Q : FY1) - y0;
      // la esquina de adentro (la que da al paño) redondeada
      const r = [sx < 0 && sy < 0 ? 14 : 0, sx > 0 && sy < 0 ? 14 : 0, sx > 0 && sy > 0 ? 14 : 0, sx < 0 && sy > 0 ? 14 : 0];
      dorado(rectRedondo(x0, y0, w, h, r), x0, y0, w, h);
    }
    // las del medio: una pieza dorada alrededor de la tronera
    for (const p of POCKETS) {
      if (p.x !== TL + TW / 2) continue;
      // las del medio: un arco dorado que envuelve el agujero del lado de la madera
      const arriba = p.y < H / 2, rr = POCKET_R + 13, yb = arriba ? FY0 : FY1;
      const forma = () => { c.beginPath(); c.moveTo(p.x - rr, yb); c.lineTo(p.x - rr, p.y); c.arc(p.x, p.y, rr, Math.PI, 0, arriba); c.lineTo(p.x + rr, yb); c.closePath(); };
      dorado(forma, p.x - rr, Math.min(yb, p.y - rr), rr * 2, Math.abs(yb - p.y) + rr);
    }
    // las bandas: la franja verde finita entre la madera y el paño (con su quijada en cada boca)
    c.save();
    contornoPano(c, true);
    c.fillStyle = '#1c7a2e'; c.fill();
    contornoPano(c, BANDA_VIS * 10 / 19);
    c.fillStyle = '#0f5622'; c.fill();
    c.restore();
    // el aro claro de las troneras (del lado de la madera: el paño lo tapa del otro lado)
    for (const p of POCKETS) {
      const aro = c.createRadialGradient(p.x, p.y, POCKET_R - 1, p.x, p.y, POCKET_R + 5);
      aro.addColorStop(0, '#0a0a0a'); aro.addColorStop(0.55, '#2a2622'); aro.addColorStop(0.8, '#4a423a'); aro.addColorStop(1, '#1a1612');
      c.fillStyle = aro; c.beginPath(); c.arc(p.x, p.y, POCKET_R + 5, 0, Math.PI * 2); c.fill();
    }
    // el paño: verde oscuro parejo, con una textura fina de fieltro y apenas mas oscuro en los bordes
    c.save();
    contornoPano(c);
    c.clip();
    c.fillStyle = '#18682a'; c.fillRect(0, 0, W, H);
    const tex = document.createElement('canvas'); tex.width = tex.height = 96;
    const tc = tex.getContext('2d'), td = tc.createImageData(96, 96);
    for (let i = 0; i < td.data.length; i += 4) { const k = (rnd() - 0.5) * 26; td.data[i] = 24 + k * 0.5; td.data[i + 1] = 104 + k; td.data[i + 2] = 42 + k * 0.6; td.data[i + 3] = 255; }
    tc.putImageData(td, 0, 0);
    c.fillStyle = c.createPattern(tex, 'repeat'); c.fillRect(0, 0, W, H);
    const vin = c.createRadialGradient(W / 2, H / 2, 120, W / 2, H / 2, W * 0.62);
    vin.addColorStop(0, 'rgba(255,255,255,0.04)'); vin.addColorStop(1, 'rgba(0,0,0,0.2)');
    c.fillStyle = vin; c.fillRect(0, 0, W, H);
    // la sombra que hacen las bandas sobre el paño
    contornoPano(c);
    c.strokeStyle = 'rgba(0,0,0,0.42)'; c.lineWidth = 8; c.stroke();
    c.restore();
    // el filo de las bandas
    contornoPano(c);
    c.lineJoin = 'round'; c.strokeStyle = 'rgba(110,190,110,0.45)'; c.lineWidth = 1.3; c.stroke();
    // el filo del bisel de las del medio, de la punta al agujero
    {
      const seg = [];
      const m = TL + TW / 2;
      for (const [yb, yp] of [[TT + BY, TT - MEDIO_AFUERA], [TB - BY, TB + MEDIO_AFUERA]]) for (const s of [-1, 1]) seg.push([m + s * BOCA_M, yb, m + s * BISEL.x1, yp]);
      c.lineCap = 'round';
      for (const [x1, y1, x2, y2] of seg) { c.strokeStyle = 'rgba(140,210,140,0.35)'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); }
      c.lineCap = 'butt';
    }
    // las troneras: negras, con un borde apenas mas claro y la sombra adentro
    for (const p of POCKETS) {
      const g = c.createRadialGradient(p.x + 4, p.y + 4, 2, p.x, p.y, POCKET_R);
      g.addColorStop(0, '#000'); g.addColorStop(0.75, '#020202'); g.addColorStop(1, '#151515');
      c.fillStyle = g; c.beginPath(); c.arc(p.x, p.y, POCKET_R, 0, Math.PI * 2); c.fill();
      c.strokeStyle = 'rgba(255,255,255,0.12)'; c.lineWidth = 1.2; c.beginPath(); c.arc(p.x, p.y, POCKET_R - 1, Math.PI * 0.15, Math.PI * 0.85); c.stroke();
    }
    // la linea de cabecera: fina, amarillo verdosa
    c.strokeStyle = 'rgba(200,210,60,0.7)'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(HEAD_X + 0.5, TT + BY); c.lineTo(HEAD_X + 0.5, TB - BY); c.stroke();
  }
  function dibujarMesa(c) {
    if (!fondoMesa) { fondoMesa = document.createElement('canvas'); fondoMesa.width = CW; fondoMesa.height = CH; const fc = fondoMesa.getContext('2d'); fc.translate(OX, OY); pintarMesa(fc); }
    c.setTransform(1, 0, 0, 1, OX, OY);
    c.clearRect(FX0, FY0, CW, CH);
    c.drawImage(fondoMesa, FX0, FY0);
  }

  // ── Las bolas en 3D ──
  // Cada bola tiene su orientacion (una matriz de giro) y, al moverse, gira lo que rodo (distancia / radio)
  // alrededor del eje perpendicular al movimiento. Se dibuja pixel por pixel: la normal de cada punto de la
  // esfera, girada a la bola, dice de que color es (la franja, el circulo del numero) y la luz le da el volumen.
  const LUZ = (() => { const l = [-0.45, -0.6, 0.66], n = Math.hypot(...l); return l.map(v => v / n); })();
  const MEDIO = (() => { const h = [LUZ[0], LUZ[1], LUZ[2] + 1], n = Math.hypot(...h); return h.map(v => v / n); })();
  const LADO = D + 2;
  const NORMALES = (() => {
    const out = [];
    for (let py = 0; py < LADO; py++) for (let px = 0; px < LADO; px++) {
      const dx = (px + 0.5 - LADO / 2) / R, dy = (py + 0.5 - LADO / 2) / R, r2 = dx * dx + dy * dy;
      if (r2 > 1.0) continue;
      const nz = Math.sqrt(Math.max(0, 1 - r2));
      const dif = Math.max(0, dx * LUZ[0] + dy * LUZ[1] + nz * LUZ[2]);
      const spec = Math.pow(Math.max(0, dx * MEDIO[0] + dy * MEDIO[1] + nz * MEDIO[2]), 40);
      const borde = clamp((1 - Math.sqrt(r2)) * R * 1.2, 0, 1); // el borde suavizado
      out.push({ i: (py * LADO + px) * 4, n: [dx, dy, nz], luz: 0.28 + 0.8 * dif, spec, borde });
    }
    return out;
  })();
  const rgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const COLOR_RGB = Object.fromEntries(Object.entries(COLOR).map(([k, v]) => [k, rgb(v)]));
  const BLANCO = [244, 243, 236];
  const lienzos = new Map();
  function giroInicial(n) {
    // cada bola arranca con el numero mas o menos para arriba, girado distinto
    let s = (n * 9301 + 49297) % 233280; const r = () => (s = (s * 9301 + 49297) % 233280) / 233280;
    let m = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    m = girar(m, [r() - 0.5, r() - 0.5, 0], 0.5 + r() * 0.7);
    return girar(m, [0, 0, 1], r() * Math.PI * 2);
  }
  // m (columnas = los ejes de la bola en el mundo) girada un angulo alrededor del eje e (en el mundo)
  function girar(m, e, ang) {
    const n = Math.hypot(e[0], e[1], e[2]); if (!n || !ang) return m;
    const x = e[0] / n, y = e[1] / n, z = e[2] / n, c = Math.cos(ang), s = Math.sin(ang), t = 1 - c;
    const g = [t * x * x + c, t * x * y - s * z, t * x * z + s * y, t * x * y + s * z, t * y * y + c, t * y * z - s * x, t * x * z - s * y, t * y * z + s * x, t * z * z + c];
    const o = new Array(9);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) o[i * 3 + j] = g[i * 3] * m[j] + g[i * 3 + 1] * m[3 + j] + g[i * 3 + 2] * m[6 + j];
    // que no se deforme con el tiempo: se vuelve a ortonormalizar
    const col = (k) => [o[k], o[3 + k], o[6 + k]];
    let a = col(0), b = col(1);
    const na = Math.hypot(...a); a = a.map(v => v / na);
    const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; b = b.map((v, i) => v - d * a[i]); const nb = Math.hypot(...b); b = b.map(v => v / nb);
    const cc = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    return [a[0], b[0], cc[0], a[1], b[1], cc[1], a[2], b[2], cc[2]];
  }
  function dibujarBola(c, n, x, y, m, alfa = 1) {
    let L = lienzos.get(n);
    if (!L) { const cv = document.createElement('canvas'); cv.width = cv.height = LADO; const cx = cv.getContext('2d'); L = { cv, cx, img: cx.createImageData(LADO, LADO) }; lienzos.set(n, L); }
    const px = L.img.data;
    px.fill(0);
    const col = n === 0 ? BLANCO : COLOR_RGB[n], raya = n >= 9;
    for (const P of NORMALES) {
      // la normal en los ejes de la bola (la traspuesta de m)
      const [nx, ny, nz] = P.n;
      const bx = m[0] * nx + m[3] * ny + m[6] * nz, by = m[1] * nx + m[4] * ny + m[7] * nz, bz = m[2] * nx + m[5] * ny + m[8] * nz;
      let k = col;
      if (n > 0) {
        if (raya && Math.abs(by) > 0.52) k = BLANCO;                 // las tapas blancas de las rayadas
        if (Math.abs(bz) > 0.9) k = BLANCO;                          // el circulo del numero (de los dos lados)
      }
      const l = P.luz;
      px[P.i] = Math.min(255, k[0] * l + 255 * P.spec * 0.85);
      px[P.i + 1] = Math.min(255, k[1] * l + 255 * P.spec * 0.85);
      px[P.i + 2] = Math.min(255, k[2] * l + 255 * P.spec * 0.85);
      px[P.i + 3] = 255 * P.borde;
    }
    L.cx.putImageData(L.img, 0, 0);
    c.save(); c.globalAlpha = alfa;
    c.fillStyle = 'rgba(0,0,0,0.32)'; c.beginPath(); c.ellipse(x + 3, y + 4, R * 0.98, R * 0.9, 0, 0, Math.PI * 2); c.fill();
    c.drawImage(L.cv, x - LADO / 2, y - LADO / 2);
    // el numero, sobre el circulo que mira para arriba (achicado segun lo de costado que este)
    if (n > 0) for (const sg of [1, -1]) {
      const sx = m[2] * sg, sy = m[5] * sg, sz = m[8] * sg;
      if (sz < 0.45) continue;
      c.save();
      c.translate(x + sx * R * 0.92, y + sy * R * 0.92);
      c.rotate(Math.atan2(sy, sx) + Math.PI / 2);
      c.scale(1, sz);
      c.fillStyle = '#111'; c.font = `bold ${n > 9 ? 8 : 9}px Verdana, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(String(n), 0, 0.5);
      c.restore();
    }
    c.restore();
  }

  function dibujarTaco(c, x, y, ang, fuerza, alfa = 1) {
    const dx = Math.cos(ang), dy = Math.sin(ang), back = R + 2 + fuerza * 80;
    const sx = x - dx * back, sy = y - dy * back, ex = sx - dx * 540, ey = sy - dy * 540;
    c.save(); c.globalAlpha = alfa; c.lineCap = 'butt';
    c.strokeStyle = 'rgba(0,0,0,0.25)'; c.lineWidth = 7; c.beginPath(); c.moveTo(sx + 2, sy + 3); c.lineTo(ex + 2, ey + 3); c.stroke();
    const g = c.createLinearGradient(sx, sy, ex, ey);
    g.addColorStop(0, '#f2f0ea'); g.addColorStop(0.015, '#f2f0ea'); g.addColorStop(0.02, '#d9b07a'); g.addColorStop(0.6, '#b98049'); g.addColorStop(1, '#7a4a22');
    c.strokeStyle = g; c.lineWidth = 6; c.beginPath(); c.moveTo(sx, sy); c.lineTo(ex, ey); c.stroke();
    c.restore();
  }
  // Hasta donde llega la guia: la primera bola o banda en la direccion del tiro
  function guia(bolas, x, y, ang) {
    const dx = Math.cos(ang), dy = Math.sin(ang);
    let best = Infinity;
    for (const b of bolas) {
      if (b.n === 0 || !b.on) continue;
      const fx = b.x - x, fy = b.y - y, t = fx * dx + fy * dy;
      if (t <= 0) continue;
      const p2 = fx * fx + fy * fy - t * t;
      if (p2 > D * D) continue;
      best = Math.min(best, t - Math.sqrt(D * D - p2));
    }
    const ws = [];
    if (dx > 0) ws.push((XMAX - x) / dx); if (dx < 0) ws.push((XMIN - x) / dx);
    if (dy > 0) ws.push((YMAX - y) / dy); if (dy < 0) ws.push((YMIN - y) / dy);
    best = Math.min(best, ...ws.filter(t => t > 0));
    return { x: x + dx * best, y: y + dy * best };
  }
  function sePuedePoner(bolas, cabecera, x, y) {
    if (!(x >= XMIN && x <= XMAX && y >= YMIN && y <= YMAX)) return false;
    if (cabecera && x > HEAD_X) return false;
    for (const b of bolas) if (b.n !== 0 && b.on && (b.x - x) ** 2 + (b.y - y) ** 2 < D * D) return false;
    for (const p of POCKETS) if ((p.x - x) ** 2 + (p.y - y) ** 2 < (POCKET_R + R) ** 2) return false;
    return true;
  }

  // ── Los sonidos: los propios del dueño (web/pool/*.wav, recortados de su grabacion) ──
  //   taco: el taco contra la blanca · bola: el choque entre bolas (tambien la banda, mas grave y suave)
  //   tronera: la bola que cae y recorre el tunel · tunel: el golpe al llegar al final · campana: el cambio de turno
  const audio = {
    ctx: null, master: null, ultimo: 0, buf: {},
    init() {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
      try { const AC = window.AudioContext || window.webkitAudioContext; this.ctx = new AC(); this.master = this.ctx.createGain(); this.master.gain.value = 0.9; this.master.connect(this.ctx.destination); } catch { this.ctx = null; return; }
      for (const k of ['taco', 'bola', 'tronera', 'tunel', 'campana']) {
        fetch(`/puente/pool/${k}.wav?v=1`).then(r => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.status))))
          .then(a => new Promise((ok, mal) => this.ctx.decodeAudioData(a, ok, mal))).then(b => { this.buf[k] = b; }).catch(() => {});
      }
    },
    on() { try { return localStorage.getItem('pool-sonido') !== '0'; } catch { return true; } },
    sonar(k, vol, vel = 1, cuando = 0) {
      const b = this.buf[k]; if (!b) return;
      const s = this.ctx.createBufferSource(); s.buffer = b; s.playbackRate.value = vel;
      const g = this.ctx.createGain(); g.gain.value = clamp(vol, 0, 1.2);
      s.connect(g).connect(this.master); s.start(this.ctx.currentTime + cuando);
    },
    play(tipo, k) {
      if (!this.ctx || !this.on()) return;
      k = clamp(k == null ? 0.6 : k, 0.05, 1);
      const t = this.ctx.currentTime;
      if (tipo === 'bola') { if (t - this.ultimo < 0.02) return; this.ultimo = t; this.sonar('bola', 0.25 + k * 0.9); }
      else if (tipo === 'banda') this.sonar('bola', 0.12 + k * 0.45, 0.62);
      else if (tipo === 'taco') this.sonar('taco', 0.35 + k * 0.75);
      else if (tipo === 'tronera') this.sonar('tronera', 0.9);
      else if (tipo === 'tunel') this.sonar('tunel', 0.9);
      else if (tipo === 'campana') this.sonar('campana', 0.8);
    },
  };

  // ── La sala ──
  async function inicio() {
    const page = A.page();
    page.appendChild(A.head('Pool', A.botonEnlace('/app?juegos=pool', 'Pool · __PUENTE_APP__')));
    const b = el('div', 'jg-cuerpo jg-inicio pl-ui'); page.appendChild(b);
    const hero = el('div', 'jg-hero pl-hero');
    const dib = el('div', 'pl-hero-dibujo'); dib.innerHTML = tapaSvg();
    hero.append(dib, el('div', 'jg-hero-t', 'Pool'), el('div', 'jg-hero-s', '8 bolas, 1 contra 1'));
    // la portada (web/pool/tapa.jpg, solo en el servidor): la mesa con el cartel; si no esta, el dibujo de siempre
    const ban = el('img', 'jg-banner'); ban.alt = 'Pool'; ban.src = '/puente/pool/tapa.jpg?v=2';
    ban.addEventListener('load', () => { dib.remove(); hero.querySelector('.jg-hero-t')?.remove(); hero.classList.add('jg-con-banner'); });
    ban.addEventListener('error', () => ban.remove());
    hero.prepend(ban);
    const acc = el('div', 'jg-acciones');
    acc.append(
      btn('Crear partida', 'jg-primario', () => A.go('plCrear')),
      btn('Jugar con la compu', '', async () => { const r = await A.emit('pool:crear', { modo: 'compu', nivel: 2 }); if (r.error) return A.toast(r.error, 'error'); A.go('plMesa', r.id); }),
      btn('Cómo se juega', 'jg-suave', () => A.go('plReglas')),
    );
    hero.appendChild(acc);
    b.appendChild(hero);
    const box = el('div'); box.appendChild(el('div', 'jg-estado', 'Cargando…')); b.appendChild(box);
    const d = await A.emit('pool:inicio');
    if (!box.isConnected) return;
    box.textContent = '';
    if (d.error) { box.appendChild(el('div', 'jg-estado', d.error)); return; }
    const section = (title, items, render) => { if (!items.length) return; box.appendChild(el('div', 'jg-sub', title)); const l = el('div', 'jg-lista'); items.forEach(x => l.appendChild(render(x))); box.appendChild(l); };
    const row = (who, top, bottom, label, cls, fn) => {
      const r = el('button', 'jg-fila'); r.type = 'button';
      const t = el('div', 'jg-ftexto'); t.append(el('div', 'jg-fnombre', top), el('div', 'jg-fmeta', bottom));
      r.append(A.avatar(who), t);
      if (label) r.appendChild(el('span', 'jg-chip ' + (cls || ''), label));
      r.addEventListener('click', fn);
      return r;
    };
    const rules = (m) => '8 bolas' + (m.amistosa ? ' · amistosa' : '');
    const grupoTxt = (g) => g === 'lisas' ? 'con las lisas' : g === 'rayadas' ? 'con las rayadas' : 'mesa abierta';
    section('Te desafiaron', d.abiertas.filter(a => a.paraVos), (a) => row(a.creador, a.creador.nombre + ' te desafía', rules(a), 'Jugar', 'azul', () => unirse(a.id)));
    section('Tus partidas', d.mias, (m) => {
      const who = m.rival || m.invitado || { nombre: '?' };
      const top = m.estado === 'esperando' ? (m.invitado ? `Esperando a ${m.invitado.nombre}` : 'Esperando rival') : `vs ${who.nombre}`;
      const bottom = m.estado === 'terminada' ? (m.ganaste ? 'Ganaste' : 'Perdiste') : m.estado === 'jugando' ? `Vos ${grupoTxt(m.grupo)}` + (m.amistosa ? ' · amistosa' : '') : rules(m);
      return row(m.estado === 'esperando' && !m.invitado ? { nombre: '?' } : who, top, bottom, m.teToca ? 'Te toca' : '', 'amarillo', () => A.go('plMesa', m.id));
    });
    section('Mesas esperando rival', d.abiertas.filter(a => !a.paraVos), (a) => row(a.creador, a.creador.nombre, rules(a), 'Jugar', 'azul', () => unirse(a.id)));
    if (!d.abiertas.length && !d.mias.length) box.appendChild(el('div', 'jg-vacio', 'No hay mesas esperando. ¡Creá una partida o jugá con la compu!'));
    const s = d.stats;
    box.appendChild(el('div', 'jg-sub', 'Tu récord'));
    const st = el('div', 'jg-stats');
    for (const [n, l] of [[s.ganadas, 'ganadas'], [s.perdidas, 'perdidas'], [`${s.compuGanadas}-${s.compuPerdidas}`, 'vs la compu']]) { const x = el('div', 'jg-stat'); x.append(el('div', 'jg-stat-n', String(n)), el('div', 'jg-stat-l', l)); st.appendChild(x); }
    box.appendChild(st);
    if (s.amistosasGanadas || s.amistosasPerdidas) box.appendChild(el('div', 'jg-ayuda', `Amistosas: ${s.amistosasGanadas} ${s.amistosasGanadas === 1 ? 'ganada' : 'ganadas'} y ${s.amistosasPerdidas} ${s.amistosasPerdidas === 1 ? 'perdida' : 'perdidas'} (no suman al ranking).`));
    const rk = el('div', 'jg-rankings'); b.appendChild(rk);
    for (const [k, title] of [['mes', 'Ranking del mes'], ['total', 'Ranking histórico']]) {
      const list = d.ranking[k];
      rk.appendChild(el('div', 'jg-sub', title));
      if (!list.length) { rk.appendChild(el('div', 'jg-vacio', 'Todavía nadie ganó una partida contra otra persona.')); continue; }
      const l = el('div', 'jg-lista');
      list.forEach((p, i) => { const r = el('div', 'jg-fila jg-rank'); r.append(el('span', 'jg-pos', ['🥇', '🥈', '🥉'][i] || String(i + 1)), A.avatar(p), el('span', 'jg-fnombre', p.nombre), el('span', 'jg-chip', `${p.ganadas} ${p.ganadas === 1 ? 'victoria' : 'victorias'}`)); l.appendChild(r); });
      rk.appendChild(l);
    }
  }
  async function unirse(id) {
    const r = await A.emit('pool:unirse', { id });
    if (r.error) return A.toast(r.error, 'error');
    A.go('plMesa', r.id);
  }
  // El dibujo de la tapa: un pedazo de mesa con la blanca y el triangulo
  function tapaSvg() {
    const bola = (x, y, c, raya) => raya
      ? `<circle cx="${x}" cy="${y}" r="9" fill="#f7f7f2"/><path d="M${x - 7.8} ${y - 4.5}h15.6a9 9 0 0 1 0 9h-15.6a9 9 0 0 1 0-9z" fill="${c}"/><circle cx="${x}" cy="${y}" r="9" fill="url(#plb)"/>`
      : `<circle cx="${x}" cy="${y}" r="9" fill="${c}"/><circle cx="${x}" cy="${y}" r="9" fill="url(#plb)"/>`;
    const tri = [[0, 0, 1], [1, -1, 2], [1, 1, 9], [2, -2, 3], [2, 0, 8], [2, 2, 10]];
    return '<svg viewBox="0 0 200 100" aria-hidden="true"><defs><radialGradient id="plb" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#fff" stop-opacity=".8"/><stop offset=".3" stop-color="#fff" stop-opacity=".1"/><stop offset="1" stop-color="#000" stop-opacity=".45"/></radialGradient></defs>'
      + '<rect width="200" height="100" rx="8" fill="#8c1714"/><rect x="10" y="10" width="180" height="80" fill="#2f7a2c"/>'
      + '<circle cx="10" cy="10" r="7" fill="#060606"/><circle cx="190" cy="10" r="7" fill="#060606"/><circle cx="10" cy="90" r="7" fill="#060606"/><circle cx="190" cy="90" r="7" fill="#060606"/><circle cx="100" cy="10" r="6" fill="#060606"/><circle cx="100" cy="90" r="6" fill="#060606"/>'
      + '<line x1="62" y1="50" x2="128" y2="50" stroke="#e6dc78" stroke-width="1" opacity=".8"/>'
      + bola(56, 50, '#f7f7f2') + tri.map(([c, r, n]) => bola(136 + c * 16, 50 + r * 9.5, COLOR[n], n >= 9)).join('')
      + '<line x1="44" y1="50" x2="0" y2="50" stroke="#9a5a2a" stroke-width="4"/></svg>';
  }

  // ── Crear partida ──
  function crear() {
    const page = A.page();
    page.appendChild(A.head('Nueva partida de Pool'));
    const b = el('div', 'jg-cuerpo pl-ui'); page.appendChild(b);
    const f = el('div', 'jg-form'); b.appendChild(f);
    const data = { modo: 'abierta', nivel: 2, rival: null, amistosa: false };
    const seg = (label, key, opts, onChange) => {
      const w = el('div', 'jg-campo'); w.appendChild(el('span', 'jg-etq', label));
      const s = el('div', 'jg-seg');
      for (const [v, l] of opts) {
        const x = el('button', 'jg-seg-op', l); x.type = 'button'; x.classList.toggle('on', data[key] === v);
        x.addEventListener('click', () => { data[key] = v; s.querySelectorAll('.jg-seg-op').forEach(y => y.classList.toggle('on', y === x)); if (onChange) onChange(); });
        s.appendChild(x);
      }
      w.appendChild(s); f.appendChild(w); return w;
    };
    const HINT = {
      abierta: 'La mesa queda en la sala y la toma el primero que quiera jugar.',
      desafio: 'Le mandás un mensaje directo con el enlace a la mesa.',
      compu: 'Para practicar. No cuenta para el ranking.',
    };
    seg('Contra quién', 'modo', [['abierta', 'Mesa abierta'], ['desafio', 'Desafiar a alguien'], ['compu', 'La compu']], () => { pick.hidden = data.modo !== 'desafio'; lvl.hidden = data.modo !== 'compu'; hint.textContent = HINT[data.modo]; verAm(); });
    const hint = el('div', 'jg-ayuda', HINT.abierta); f.appendChild(hint);
    const lvl = seg('Nivel de la compu', 'nivel', [[1, 'Fácil'], [2, 'Normal'], [3, 'Difícil']]); lvl.hidden = true;
    const pick = el('div', 'jg-campo'); pick.hidden = true;
    const sbox = el('label', 'jg-buscar'); sbox.insertAdjacentHTML('beforeend', A.svg(A.I.buscar, 20));
    const q = el('input'); q.type = 'search'; q.placeholder = 'Buscar a quién desafiar'; sbox.appendChild(q);
    const list = el('div', 'jg-lista'), chosen = el('div', 'jg-elegido');
    pick.append(sbox, chosen, list); f.appendChild(pick);
    let t = null, seq = 0;
    q.addEventListener('input', () => {
      clearTimeout(t);
      t = setTimeout(async () => {
        const my = ++seq;
        let ps = [];
        if (q.value.trim().length >= 2) {
          try { ps = ((await (await fetch('/puente/api/mercado/personas?q=' + encodeURIComponent(q.value.trim()), { headers: { Authorization: 'Bearer ' + localStorage.getItem('haven_token') } })).json()).personas) || []; } catch { ps = []; }
        }
        if (my !== seq || !list.isConnected) return;
        list.textContent = '';
        for (const p of ps) {
          const r = el('button', 'jg-fila'); r.type = 'button';
          const tx = el('div', 'jg-ftexto'); tx.append(el('div', 'jg-fnombre', p.nombre), el('div', 'jg-fmeta', '@' + p.usuario));
          r.append(A.avatar(p), tx);
          r.addEventListener('click', () => { data.rival = p; chosen.textContent = 'Vas a desafiar a ' + p.nombre; list.textContent = ''; q.value = ''; err.textContent = ''; });
          list.appendChild(r);
        }
      }, 300);
    });
    // Competitiva (suma al ranking) o amistosa (queda en el récord, sin sumar). Con la compu no hace falta
    const AHINT = { false: 'Suma al ranking del mes y al histórico.', true: 'Queda en tu récord como amistosa, pero no suma al ranking.' };
    const am = seg('Ranking', 'amistosa', [[false, 'Competitiva'], [true, 'Amistosa']], () => { ah.textContent = AHINT[data.amistosa]; });
    const ah = el('div', 'jg-ayuda', AHINT.false); f.appendChild(ah);
    const verAm = () => { am.hidden = ah.hidden = data.modo === 'compu' || esInvitado(); }; verAm();
    const err = el('div', 'jg-error'); f.appendChild(err);
    const go2 = btn('Crear partida', 'jg-primario jg-ancho'); f.appendChild(go2);
    go2.addEventListener('click', async () => {
      err.textContent = '';
      if (data.modo === 'desafio' && !data.rival) { err.textContent = 'Elegí a quién desafiar.'; return; }
      go2.disabled = true;
      const r = await A.emit('pool:crear', { modo: data.modo, nivel: data.nivel, rival: data.rival && data.rival.id, amistosa: data.amistosa });
      go2.disabled = false;
      if (r.error) { err.textContent = r.error; return; }
      if (data.modo === 'desafio') { A.desafio(data.rival, `¡Te desafío a un pool${data.amistosa ? ' amistoso (no suma al ranking)' : ''}! Entrá acá: ${location.origin}/app?pool=${r.id}`); return; }
      A.stack().pop(); A.go('plMesa', r.id);
    });
  }

  // ── Reglas ──
  function reglas() {
    const page = A.page();
    page.appendChild(A.head('Cómo se juega'));
    const b = el('div', 'jg-cuerpo jg-reglas pl-ui'); page.appendChild(b);
    const sec = (t, x) => { b.appendChild(el('div', 'jg-sub', t)); b.appendChild(el('p', null, x)); };
    sec('El objetivo', 'Pool de 8 bolas: uno se queda con las lisas (1 a 7) y el otro con las rayadas (9 a 15). Gana el que mete todas las suyas y después la 8.');
    sec('Tirar', 'Apuntás con el mouse (la línea muestra hasta dónde va la blanca). La fuerza la elegís en la barra de la derecha y tirás con la barra espaciadora. También podés apretar sobre la mesa, arrastrar hacia atrás y soltar: cuanto más arrastrás, más fuerte. En el celular o la tablet: arrastrá el dedo sobre la mesa para apuntar, afiná con la rueda y arrastrá la barra de fuerza; al soltarla, tirás.');
    sec('El efecto', 'En la bola de arriba a la derecha elegís dónde le pega el taco a la blanca. Arriba: después del choque la blanca sigue de largo. Abajo: vuelve para atrás. A un costado: sale más abierta o más cerrada de la primera banda. Doble clic la vuelve al centro.');
    sec('La salida', 'El que rompe tiene la bola en mano detrás de la línea: arrastrá la blanca adonde quieras antes de tirar. Si entra la 8 en la salida, se rearma el triángulo y rompe de nuevo.');
    sec('Los grupos', 'Mientras la mesa está abierta podés pegarle a cualquier bola menos a la 8. El primero que mete una bola sin falta se queda con ese grupo (lisas o rayadas).');
    sec('El turno', 'Si metés una de tus bolas, seguís tirando. Si no metés ninguna, le toca al otro.');
    sec('Las faltas', 'Es falta si la blanca entra en una tronera, si no le pegás a ninguna bola, si le pegás primero a una del rival o a la 8 antes de tiempo. Con una falta le toca al otro, con bola en mano en cualquier lugar de la mesa.');
    sec('La 8', 'Cuando metiste todas las tuyas, vas por la 8. Si la metés sin falta, ganás. Si la metés antes de tiempo o con falta, perdés.');
  }

  // ── La mesa ──
  async function mesa(id) {
    salir();
    const page = A.page();
    M = {
      id, s: null, cv: null, ctx: null, bolas: [], ang: 0, fuerza: 0, barra: 0.5, efecto: { x: 0, y: 0 },
      apuntando: false, desde: null, arrastra: false, valido: true, anim: null, visto: undefined, enviando: false,
      rival: null, raf: 0, ultimoApunta: 0, finVisto: false, giros: new Map(),
    };
    const yo = M;
    const salirBtn = el('button', 'jg-btn jg-salir'); salirBtn.type = 'button'; salirBtn.style.visibility = 'hidden';
    salirBtn.addEventListener('click', menuSalir);
    page.appendChild(A.head('Pool', salirBtn));
    M.salirBtn = salirBtn;
    const b = el('div', 'jg-cuerpo pl-ui pl-mesa'); page.appendChild(b);
    // la mesa con sus paneles (como el pool original): arriba el aviso y los jugadores, a la derecha efecto y fuerza
    const juego = el('div', 'pl-juego');
    const centro = el('div', 'pl-centro');
    M.msg = el('div', 'pl-msg');
    const barra = el('div', 'pl-barra');
    M.j0 = jugador(); M.j1 = jugador(true);
    M.reloj = el('div', 'pl-reloj', '0:00');
    barra.append(M.j0.w, M.reloj, M.j1.w);
    M.cv = el('canvas', 'pl-lienzo'); M.cv.width = CW; M.cv.height = CH;
    M.cv.setAttribute('role', 'img'); M.cv.setAttribute('aria-label', 'Mesa de pool');
    M.ctx = M.cv.getContext('2d');
    M.bandeja = el('div', 'pl-bandeja');
    M.bjCv = el('canvas', 'pl-tunel'); M.bjCv.width = BJ_W; M.bjCv.height = BJ_H; M.bjCtx = M.bjCv.getContext('2d');
    M.bandeja.appendChild(M.bjCv);
    M.fin = el('div', 'pl-fin'); M.fin.hidden = true;
    centro.append(M.msg, barra, M.cv, M.bandeja, M.fin);
    const der = el('div', 'pl-der');
    M.efectoEl = el('div', 'pl-efecto'); M.efectoEl.title = 'Efecto: tocá dónde le pega el taco a la blanca (doble clic: al centro)';
    M.punto = el('div', 'pl-punto'); M.efectoEl.appendChild(M.punto);
    M.medidor = el('div', 'pl-fuerza'); const tubo = el('div', 'pl-tubo'); M.lleno = el('div', 'pl-lleno'); tubo.appendChild(M.lleno); M.medidor.append(tubo, el('div', 'pl-marcas'));
    M.sonidoBtn = btn(audio.on() ? '🔊' : '🔇', 'jg-suave pl-sonido', () => { try { localStorage.setItem('pool-sonido', audio.on() ? '0' : '1'); } catch { /* sin almacenamiento */ } M.sonidoBtn.textContent = audio.on() ? '🔊' : '🔇'; audio.init(); });
    M.sonidoBtn.title = 'Sonido';
    // la rueda para afinar la punteria (solo se ve con pantalla tactil)
    M.fino = el('div', 'pl-fino'); M.fino.title = 'Afinar: arrastrá para girar el taco de a poquito';
    const afinar = el('div', 'pl-afinar'); afinar.append(M.fino, el('div', 'pl-etq', 'Afinar'));
    der.append(M.efectoEl, el('div', 'pl-etq', 'Efecto'), M.medidor, el('div', 'pl-etq', 'Fuerza'), afinar, M.sonidoBtn);
    M.mesaEl = b;
    try { if (matchMedia('(pointer: coarse)').matches) tactil(); } catch { /* sin matchMedia */ }
    juego.append(centro, der);
    b.appendChild(juego);
    M.pie = el('div', 'pl-pie');
    M.chatBox = el('div', 'pl-chat');
    b.append(M.pie, M.chatBox);
    controles();
    M.msg.textContent = 'Cargando…';
    const d = await A.emit('pool:ver', { id });
    if (M !== yo) return;
    if (d.error) { M.msg.textContent = d.error; return; }
    render(d.partida);
    const loop = () => { if (M !== yo) return; dibujar(); M.raf = requestAnimationFrame(loop); };
    M.raf = requestAnimationFrame(loop);
  }
  function jugador(der) {
    const w = el('div', 'pl-jug' + (der ? ' der' : ''));
    const flecha = el('span', 'pl-flecha', '➡'), cara = el('span', 'pl-cara'), nombre = el('span', 'pl-nombre'), grupo = el('span', 'pl-grupo');
    w.append(flecha, cara, nombre, grupo);
    return { w, cara, nombre, grupo };
  }
  function salir() {
    if (!M) return;
    cancelAnimationFrame(M.raf);
    if (M.teclas) document.removeEventListener('keydown', M.teclas);
    M = null;
  }

  function menuSalir() {
    const s = M && M.s;
    if (!s) return;
    if (s.estado === 'esperando' && s.soyCreador) { A.confirmar('¿Cancelar la partida?', 'La mesa se cierra y nadie más puede entrar.', 'Cancelar partida', 'Volver').then(ok => { if (ok) A.emit('pool:cancelar', { id: s.id }).then(r => { if (r.error) A.toast(r.error, 'error'); else A.back(); }); }); return; }
    if (s.estado === 'jugando' && s.soyJugador) { A.confirmar('¿Abandonar la partida?', 'Si abandonás, perdés.', 'Abandonar', 'Seguir jugando').then(ok => { if (ok) accion({ tipo: 'abandonar' }); }); return; }
    const url = `${location.origin}/app?pool=${s.id}`;
    if (navigator.clipboard) navigator.clipboard.writeText(url).then(() => A.toast('Enlace copiado', 'success'), () => prompt('Copiá el enlace:', url));
    else prompt('Copiá el enlace:', url);
  }

  const bolasDe = (s) => (s.bolas || []).map(([n, x, y, on]) => ({ n, x, y, on: !!on }));

  function render(s) {
    if (!M || !s || s.id !== M.id) return;
    const antes = M.s;
    M.s = s;
    M.rival = null;
    const t = s.estado === 'esperando' && s.soyCreador ? 'Cancelar partida' : s.estado === 'jugando' && s.soyJugador ? 'Abandonar' : 'Copiar enlace';
    M.salirBtn.textContent = t; M.salirBtn.style.visibility = '';
    M.salirBtn.classList.toggle('jg-peligro', t !== 'Copiar enlace');
    // El tiro nuevo: se ve el recorrido (la primera vez que se abre la mesa, no: queda como esta)
    const nuevo = s.ultima && M.visto !== undefined && s.ultima.n !== M.visto;
    if (M.visto === undefined) M.visto = s.ultima ? s.ultima.n : 0;
    // si todavia se esta viendo el tiro anterior, este espera su turno (se ven todos, en orden)
    if (nuevo) { M.visto = s.ultima.n; if (M.anim) (M.cola = M.cola || []).push(s); else reproducir(s); }
    else if (!M.anim) M.bolas = bolasDe(s);
    if (s.estado === 'jugando' && s.teToca && (!antes || !antes.teToca)) { M.fuerza = 0; M.enviando = false; }
    if (antes && antes.estado === 'esperando' && s.estado === 'jugando' && s.teToca) audio.play('campana');
    M.enviando = false;
    hud();
    pie();
    if (A.chat) A.chat(M.chatBox, s, (texto) => A.emit('pool:accion', { id: s.id, tipo: 'chat', texto }));
  }

  // El recorrido del ultimo tiro, cuadro por cuadro (30 por segundo), con sus sonidos. Los tiros del rival se
  // ven mas despacio (VEL_RIVAL), para poder seguirlos; los propios, a velocidad real.
  const VEL_RIVAL = 0.6;
  function reproducir(s) {
    const u = s.ultima;
    const base = u.desde.map(b => ({ ...b }));
    // la bandeja: las que ya estaban y las que entran en este tiro (van apareciendo cuando caen)
    const fin = u.frames[u.frames.length - 1] || [];
    const total = base.filter((b, j) => b.on && b.n !== 0 && fin[j * 2] < 0).length;
    const bj = s.bandeja || [];
    M.anim = { s, u, base, t0: performance.now(), vel: u.mio ? 1 : VEL_RIVAL, sonado: 0, metidas: 0, antes: bj.slice(0, Math.max(0, bj.length - total)), nuevas: bj.slice(Math.max(0, bj.length - total)) };
    bandeja(M.anim.antes);
    M.bolas = base;
    if (!u.mio) audio.play('taco', u.fuerza);
  }
  function avanzarAnim() {
    const a = M.anim;
    if (!a) return;
    const fr = a.u.frames, f = (performance.now() - a.t0) / 1000 * 30 * a.vel;
    const i = Math.floor(f);
    // los sonidos hasta este cuadro
    while (a.sonado < a.u.sonidos.length && a.u.sonidos[a.sonado][0] <= i) { const [, tipo, k] = a.u.sonidos[a.sonado++]; if (tipo !== 'taco') audio.play(tipo, k); }
    if (i >= fr.length - 1) {
      // quietas: medio segundo con la mesa asi y recien ahi cambia el turno
      if (!a.quietas) { a.quietas = performance.now(); M.bolas = bolasDe(a.s); return; }
      if (performance.now() - a.quietas < 500 / a.vel) return;
      M.anim = null;
      if (M.cola && M.cola.length) { reproducir(M.cola.shift()); return; }
      M.bolas = bolasDe(M.s);
      hud(); pie();
      if (M.s.estado === 'terminada') finDeJuego();
      else if (M.s.teToca && !a.u.mio) audio.play('campana');
      return;
    }
    const A0 = fr[i], A1 = fr[i + 1], k = f - i;
    M.bolas = a.base.map((b, j) => {
      const x0 = A0[j * 2], y0 = A0[j * 2 + 1], x1 = A1[j * 2], y1 = A1[j * 2 + 1];
      if (x0 < 0) return { ...b, on: false };
      if (x1 < 0) return { ...b, x: x0, y: y0, on: true };
      return { ...b, x: x0 + (x1 - x0) * k, y: y0 + (y1 - y0) * k, on: true };
    });
    // en la bandeja van entrando las que ya cayeron
    const metidas = a.base.filter((b, j) => b.on && b.n !== 0 && A0[j * 2] < 0).length;
    if (metidas !== a.metidas) { a.metidas = metidas; bandeja(a.antes.concat(a.nuevas.slice(0, metidas))); }
  }

  const puedoTirar = () => M && M.s && M.s.estado === 'jugando' && M.s.teToca && !M.anim && !M.enviando;
  const blanca = () => M.bolas.find(b => b.n === 0);

  function hud() {
    const s = M.s;
    const pinta = (J, p, activo) => {
      J.w.classList.toggle('activo', !!activo);
      J.nombre.textContent = p ? (p === s.yo && s.soyJugador ? `${p.nombre} (vos)` : p.nombre) : 'Esperando…';
      J.cara.textContent = '';
      if (p) J.cara.appendChild(A.avatar(p));
      const g = p && p.grupo;
      J.grupo.className = 'pl-grupo' + (g ? ' ' + g : '');
      J.grupo.title = g === 'lisas' ? 'Lisas (1-7)' : g === 'rayadas' ? 'Rayadas (9-15)' : '';
    };
    const jugando = s.estado === 'jugando' && !M.anim;
    pinta(M.j0, s.yo, jugando && s.turno === 'yo');
    pinta(M.j1, s.rival, jugando && s.turno === 'rival');
    M.msg.textContent = mensaje();
    if (!M.anim) bandeja(s.bandeja || []);
  }
  function mensaje() {
    const s = M.s;
    if (M.anim) return M.anim.u.mio ? 'Tiraste…' : `Tira ${s.rival ? s.rival.nombre : 'el rival'}…`;
    if (s.estado === 'esperando') return s.invitado ? `Esperando a ${s.invitado.nombre}…` : 'Esperando rival… Pasale el enlace a alguien o esperá que alguien entre desde la sala.';
    if (s.estado === 'terminada') {
      const por = s.motivo === 'abandono' ? (s.ganador === 'yo' ? ' (tu rival abandonó)' : ' (abandonaste)') : '';
      return s.soyJugador ? (s.ganador === 'yo' ? `¡Ganaste!${por}` : `Perdiste.${por}`) : 'Terminó la partida.';
    }
    // como en el original: "Shoot!", "Shoot Again!" si metió una suya, la bola en mano despues de una falta,
    // y mientras juega el otro, "esperando al rival" (lo que paso queda abajo, en el registro)
    if (s.teToca) return s.enMano ? 'Podés mover la blanca antes de tirar.' : s.ultima && s.ultima.mio ? '¡Tirá de nuevo!' : '¡Tirá!';
    return `Esperando a ${s.rival ? s.rival.nombre : 'el rival'}…`;
  }
  // La bandeja (el tunel): las bolas metidas, en 3D como en la mesa. La primera queda a la derecha y las
  // nuevas entran por la izquierda y ruedan hasta su lugar, girando lo que recorren; al llegar, el golpe del final
  const BJ_W = 900, BJ_H = D + 8;
  function bandeja(lista) {
    const ahora = performance.now();
    if (!M.tray || lista.length < M.tray.length || lista.some((n, i) => M.tray[i] && M.tray[i].n !== n)) {
      // otra lista (partida nueva, o se abre la mesa): se ponen en su lugar sin animar
      M.tray = lista.map((n, i) => ({ n, x: lugarBandeja(i), m: (M.giros.get(n) || {}).m || giroInicial(n), llego: true }));
      return;
    }
    for (let i = M.tray.length; i < lista.length; i++) {
      const n = lista[i];
      M.tray.push({ n, x: -R, desde: -R, hasta: lugarBandeja(i), t0: ahora, m: (M.giros.get(n) || {}).m || giroInicial(n), llego: false });
    }
  }
  const lugarBandeja = (i) => BJ_W - 10 - R - i * (D + 1);
  function dibujarBandeja() {
    const c = M.bjCtx; if (!c) return;
    c.clearRect(0, 0, BJ_W, BJ_H);
    // el tunel: negro, redondeado, con un poco de brillo arriba
    const g = c.createLinearGradient(0, 0, 0, BJ_H);
    g.addColorStop(0, '#1a1a1a'); g.addColorStop(0.35, '#050505'); g.addColorStop(1, '#000');
    c.fillStyle = g; c.beginPath(); c.roundRect(0, 0, BJ_W, BJ_H, BJ_H / 2); c.fill();
    const ahora = performance.now();
    for (const b of M.tray || []) {
      if (!b.llego) {
        // entra rodando y se frena al llegar (dura segun la distancia, como mucho un segundo)
        const dur = Math.min(1000, (b.hasta - b.desde) / 1.1);
        const u = Math.min(1, (ahora - b.t0) / dur), e = 1 - (1 - u) * (1 - u);
        const x = b.desde + (b.hasta - b.desde) * e, dx = x - b.x;
        if (dx > 0) b.m = girar(b.m, [0, dx, 0], dx / R);
        b.x = x;
        if (u >= 1) { b.llego = true; audio.play('tunel'); }
      }
      dibujarBola(c, b.n, b.x, BJ_H / 2, b.m);
    }
  }
  function pie() {
    const s = M.s;
    M.pie.textContent = '';
    if (s.estado === 'terminada' && s.soyJugador) {
      if (s.siguiente) M.pie.appendChild(btn('Ir a la revancha', 'jg-primario', () => { A.stack().pop(); A.go('plMesa', s.siguiente); }));
      else if (s.revancha && s.revancha.yo) M.pie.appendChild(el('div', 'jg-estado', 'Esperando que el otro acepte la revancha…'));
      else M.pie.appendChild(btn(s.revancha && s.revancha.rival ? 'Aceptar la revancha' : 'Revancha', 'jg-primario', async () => { const r = await accion({ tipo: 'revancha' }); if (r.id) { A.stack().pop(); A.go('plMesa', r.id); } }));
    }
    const ult = (s.log || []).slice(-3);
    if (ult.length) { const l = el('div', 'pl-log'); for (const x of ult) l.appendChild(el('div', null, x)); M.pie.appendChild(l); }
    if (M.tactil && s.estado === 'jugando' && s.soyJugador) M.pie.appendChild(el('div', 'jg-ayuda', 'Apuntá arrastrando el dedo sobre la mesa y afiná con la rueda. Para tirar, arrastrá la barra de fuerza y soltá (si volvés al principio antes de soltar, no tira).'));
    if (s.compu && s.nivel) M.pie.appendChild(el('div', 'jg-ayuda', `Contra la compu (${s.nivel.toLowerCase()}).`));
    else if (s.amistosa) M.pie.appendChild(el('div', 'jg-ayuda', 'Partida amistosa: no suma al ranking.'));
  }
  function finDeJuego() {
    const s = M.s;
    if (M.finVisto || !s.soyJugador) return;
    M.finVisto = true;
    audio.play('campana');
    M.fin.textContent = '';
    const ok = btn('Aceptar', '', () => { M.fin.hidden = true; });
    M.fin.append(el('div', 'pl-fin-t', 'Fin del juego'), el('div', 'pl-fin-c', s.ganador === 'yo' ? `¡Ganaste la partida!` : `${s.rival ? s.rival.nombre : 'Tu rival'} ganó la partida.`), el('div', 'pl-fin-a'));
    M.fin.lastChild.appendChild(ok);
    M.fin.hidden = false;
  }

  // ── Dibujar (cada cuadro) ──
  function dibujar() {
    if (!M || !M.ctx) return;
    avanzarAnim();
    dibujarBandeja();
    const c = M.ctx, s = M.s;
    dibujarMesa(c);
    if (!s) return;
    const cue = blanca();
    const mio = puedoTirar();
    // bola en mano: la zona de la cabecera y un aro alrededor de la blanca
    if (s.estado === 'jugando' && s.enMano && !M.anim && cue) {
      // (sin pintar encima de las troneras)
      if (s.cabecera) { c.save(); c.beginPath(); c.rect(TL + BX, TT + BY, HEAD_X - TL - BX, TH - 2 * BY); for (const p of POCKETS) { c.moveTo(p.x + POCKET_R + 1, p.y); c.arc(p.x, p.y, POCKET_R + 1, 0, Math.PI * 2); } c.clip('evenodd'); c.fillStyle = 'rgba(255,255,255,0.05)'; c.fillRect(TL + BX, TT + BY, HEAD_X - TL - BX, TH - 2 * BY); c.restore(); }
      c.save(); c.setLineDash([2, 3]); c.strokeStyle = M.valido ? '#e8e050' : '#ff5050'; c.lineWidth = 1.5;
      c.beginPath(); c.arc(cue.x, cue.y, R + 4, 0, Math.PI * 2); c.stroke(); c.restore();
    }
    // cada bola gira lo que rodo desde el cuadro anterior (eje perpendicular al movimiento, angulo = distancia / radio)
    for (const b of M.bolas) {
      if (!b.on) continue;
      const g = M.giros.get(b.n) || { m: giroInicial(b.n), x: b.x, y: b.y };
      const dx = b.x - g.x, dy = b.y - g.y, d = Math.hypot(dx, dy);
      if (d > 0.01 && d < 120) g.m = girar(g.m, [-dy, dx, 0], d / R);
      g.x = b.x; g.y = b.y;
      M.giros.set(b.n, g);
    }
    for (const b of M.bolas) if (b.on && b.n !== 0) dibujarBola(c, b.n, b.x, b.y, M.giros.get(b.n).m);
    if (cue && cue.on) dibujarBola(c, 0, cue.x, cue.y, M.giros.get(0).m);
    if (!cue || !cue.on || M.anim || s.estado !== 'jugando') return;
    if (mio && !M.arrastra) {
      const g = guia(M.bolas, cue.x, cue.y, M.ang);
      // la guia punteada hasta el circulo de donde va a pegar (como en el video de referencia)
      c.save(); c.strokeStyle = 'rgba(240,225,20,0.9)'; c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(cue.x, cue.y); c.lineTo(g.x, g.y); c.stroke();
      c.strokeStyle = '#f0dc14'; c.lineWidth = 2;
      c.beginPath(); c.arc(g.x, g.y, R, 0, Math.PI * 2); c.stroke(); c.restore();
      dibujarTaco(c, cue.x, cue.y, M.ang, M.apuntando || M.cargando ? M.fuerza : 0);
    } else if (!s.teToca && M.rival && performance.now() - M.rival.t < 4000) {
      // como apunta el rival (y donde pone la blanca si tiene bola en mano)
      const x = M.rival.x != null ? M.rival.x : cue.x, y = M.rival.y != null ? M.rival.y : cue.y;
      if (s.enMano && M.rival.x != null) { cue.x = x; cue.y = y; }
      dibujarTaco(c, x, y, M.rival.ang, M.rival.fuerza || 0, 0.85);
    }
    // la barra de fuerza (en el celular va acostada)
    const pc = ((M.apuntando || M.cargando ? M.fuerza : M.barra) * 100) + '%';
    if (M.medidor.offsetWidth > M.medidor.offsetHeight) { M.lleno.style.width = pc; M.lleno.style.height = ''; } else { M.lleno.style.height = pc; M.lleno.style.width = ''; }
    if (s.inicio) { const sg = Math.max(0, Math.floor((Date.now() - s.inicio) / 1000)); M.reloj.textContent = `${Math.floor(sg / 60)}:${String(sg % 60).padStart(2, '0')}`; }
  }

  // ── Los controles ──
  function controles() {
    const cv = M.cv;
    const punto = (e) => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * (CW / r.width) - OX, y: (e.clientY - r.top) * (CH / r.height) - OY }; };
    const apuntarA = (x, y) => { const cue = blanca(); if (!cue) return; const dx = x - cue.x, dy = y - cue.y; if (Math.hypot(dx, dy) > 1) M.ang = Math.atan2(dy, dx); };
    const apuntarDedo = (p) => { const cue = blanca(); if (cue && Math.hypot(p.x - cue.x, p.y - cue.y) > R * 2) apuntarA(p.x, p.y); };
    const contar = () => {
      // la mira, para que el rival la vea (pool.js la reparte; como mucho 12 por segundo)
      const now = performance.now();
      if (now - M.ultimoApunta < 85 || !M.s || M.s.compu) return;
      M.ultimoApunta = now;
      const cue = blanca();
      A.emit('pool:accion', { id: M.id, tipo: 'apunta', ang: M.ang, fuerza: M.apuntando || M.cargando ? M.fuerza : 0, x: cue && cue.x, y: cue && cue.y }).catch(() => {});
    };
    cv.addEventListener('pointermove', (e) => {
      if (!puedoTirar()) return;
      const p = punto(e);
      if (M.arrastra) {
        const q = { x: clamp(p.x, TL + R, TR - R), y: clamp(p.y, TT + R, TB - R) };
        M.valido = sePuedePoner(M.bolas, M.s.cabecera, q.x, q.y);
        if (M.valido) { const cue = blanca(); cue.x = q.x; cue.y = q.y; cue.on = true; }
        contar(); return;
      }
      if (M.dedo) { apuntarDedo(p); contar(); return; }
      if (e.pointerType === 'touch') return;
      if (M.apuntando) {
        // arrastrar hacia atras (en contra del tiro) carga la fuerza
        const pull = (M.desde.x - p.x) * Math.cos(M.ang) + (M.desde.y - p.y) * Math.sin(M.ang);
        M.fuerza = clamp(pull / 200, 0, 1);
      } else apuntarA(p.x, p.y);
      contar();
    });
    cv.addEventListener('pointerdown', (e) => {
      audio.init();
      if (!puedoTirar()) return;
      const p = punto(e);
      try { cv.setPointerCapture(e.pointerId); } catch { /* sin captura */ }
      const cue = blanca();
      const toque = e.pointerType === 'touch';
      if (toque) tactil();
      if (M.s.enMano && cue && Math.hypot(p.x - cue.x, p.y - cue.y) < R * (toque ? 3.2 : 2.2)) { M.arrastra = true; M.valido = true; return; }
      if (toque) { M.dedo = true; apuntarDedo(p); contar(); return; }
      M.apuntando = true; M.fuerza = 0; M.desde = p;
    });
    const soltar = (e) => {
      try { cv.releasePointerCapture(e.pointerId); } catch { /* ya suelto */ }
      if (M.arrastra) { M.arrastra = false; M.valido = true; return; }
      if (M.dedo) { M.dedo = false; return; }
      if (!M.apuntando) return;
      M.apuntando = false;
      if (M.fuerza > 0.02) { M.barra = M.fuerza; tirar(M.fuerza); }
      M.fuerza = 0;
    };
    cv.addEventListener('pointerup', soltar);
    cv.addEventListener('pointercancel', () => { M.apuntando = false; M.arrastra = false; M.dedo = false; M.fuerza = 0; });
    // espacio: tira con la fuerza de la barra (si no se esta escribiendo en el chat)
    M.teclas = (e) => {
      if (e.code !== 'Space' || e.repeat || !M) return;
      const a = document.activeElement;
      if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable)) return;
      if (!document.body.contains(M.cv)) return;
      e.preventDefault();
      audio.init();
      if (!puedoTirar() || M.apuntando || M.arrastra) return;
      tirar(Math.max(0.03, M.barra));
    };
    document.addEventListener('keydown', M.teclas);
    // la barra de fuerza: tocar o arrastrar (abajo poca, arriba mucha)
    const desdeBarra = (e) => {
      const r = M.medidor.querySelector('.pl-tubo').getBoundingClientRect();
      M.barra = clamp(r.width > r.height ? (e.clientX - r.left) / r.width : 1 - (e.clientY - r.top) / r.height, 0.03, 1);
    };
    M.medidor.addEventListener('pointerdown', (e) => {
      try { M.medidor.setPointerCapture(e.pointerId); } catch { /* sin captura */ }
      if (e.pointerType === 'touch') {
        tactil(); audio.init();
        if (!puedoTirar() || M.arrastra) return;
        const r = M.medidor.querySelector('.pl-tubo').getBoundingClientRect();
        M.cargando = { x: e.clientX, y: e.clientY, largo: Math.max(60, r.width > r.height ? r.width : r.height), acostada: r.width > r.height };
        M.fuerza = 0; return;
      }
      desdeBarra(e);
    });
    M.medidor.addEventListener('pointermove', (e) => {
      if (M.cargando) {
        const k = M.cargando, d = k.acostada ? Math.abs(e.clientX - k.x) : Math.abs(e.clientY - k.y);
        M.fuerza = clamp(d / (k.largo * 0.9), 0, 1); contar(); return;
      }
      if (e.buttons && e.pointerType !== 'touch') desdeBarra(e);
    });
    const soltarBarra = (tira) => {
      if (!M.cargando) return;
      M.cargando = null;
      if (tira && M.fuerza > 0.03 && puedoTirar()) { M.barra = M.fuerza; tirar(M.fuerza); }
      M.fuerza = 0;
    };
    M.medidor.addEventListener('pointerup', () => soltarBarra(true));
    M.medidor.addEventListener('pointercancel', () => soltarBarra(false));
    // la rueda para afinar: arrastrarla gira el taco de a poquito (unos 0,07 grados por pixel)
    let finoDesde = null, finoPos = 0;
    M.fino.addEventListener('pointerdown', (e) => {
      try { M.fino.setPointerCapture(e.pointerId); } catch { /* sin captura */ }
      finoDesde = { x: e.clientX, y: e.clientY };
    });
    M.fino.addEventListener('pointermove', (e) => {
      if (!finoDesde) return;
      const r = M.fino.getBoundingClientRect(), acostada = r.width > r.height;
      const d = acostada ? e.clientX - finoDesde.x : e.clientY - finoDesde.y;
      finoDesde = { x: e.clientX, y: e.clientY };
      finoPos += d;
      M.fino.style.backgroundPosition = acostada ? finoPos + 'px 0' : '0 ' + finoPos + 'px';
      if (!puedoTirar() || M.arrastra || M.cargando) return;
      M.ang += d * 0.0012;
      contar();
    });
    const finoFin = () => { finoDesde = null; };
    M.fino.addEventListener('pointerup', finoFin);
    M.fino.addEventListener('pointercancel', finoFin);
    // el efecto
    const ponerEfecto = (x, y) => { const d = Math.hypot(x, y); if (d > 0.8) { x *= 0.8 / d; y *= 0.8 / d; } M.efecto = { x, y }; M.punto.style.left = (50 + x * 50) + '%'; M.punto.style.top = (50 + y * 50) + '%'; };
    const desdeEfecto = (e) => { const r = M.efectoEl.getBoundingClientRect(); ponerEfecto((e.clientX - r.left) / r.width * 2 - 1, (e.clientY - r.top) / r.height * 2 - 1); };
    M.efectoEl.addEventListener('pointerdown', (e) => { try { M.efectoEl.setPointerCapture(e.pointerId); } catch { /* sin captura */ } desdeEfecto(e); });
    M.efectoEl.addEventListener('pointermove', (e) => { if (e.buttons) desdeEfecto(e); });
    M.efectoEl.addEventListener('dblclick', () => ponerEfecto(0, 0));
    M.ponerEfecto = ponerEfecto;
  }
  function tactil() {
    if (!M || M.tactil) return;
    M.tactil = true;
    if (M.mesaEl) M.mesaEl.classList.add('pl-tactil');
    if (M.s) pie();
  }
  async function tirar(fuerza) {
    const s = M.s, cue = blanca();
    if (!cue) return;
    M.enviando = true;
    audio.play('taco', fuerza);
    const yo = M;
    const r = await A.emit('pool:accion', { id: M.id, tipo: 'tirar', ang: M.ang, fuerza, efecto: M.efecto, blanca: s.enMano ? { x: cue.x, y: cue.y } : null });
    if (M !== yo) return;
    if (r.error) { M.enviando = false; A.toast(r.error, 'error'); return; }
    // el efecto vuelve al centro despues de cada tiro
    M.ponerEfecto(0, 0);
  }

  // ── Para aviso.js ──
  window.puentePool = {
    usar(api) { A = api; },
    inicio, crear, reglas, mesa, salir,
    estado(s) { if (M && s && s.id === M.id) render(s); },
    apunta(m) { if (M && m && m.id === M.id && M.s && !M.s.teToca) M.rival = { ...m, t: performance.now() }; },
    abierta: () => M && M.id,
  };
})();
