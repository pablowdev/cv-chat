// Shoppa: la pagina de prueba de la fisica (etapa 1). Un mapa propio de prueba, una serpiente, la soga y
// una granada, con los controles del juego y un panel para ajustar las medidas en vivo.
(function () {
  'use strict';
  const M = window.ShoppaMotor, C = M.C;
  const PASO = 20; // ms: 50 pasos por segundo

  // ── El mapa de prueba (propio): techo, pilares, plataformas flotantes y agua abajo, estilo Shopper ──
  function azar(semilla) { let a = semilla >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function mapaPrueba() {
    const W = 1920, H = 696, T = new M.Terreno(W, H, 650), r = azar(17);
    const pon = (x, y) => { if (x >= 0 && y >= 0 && x < W && y < H) T.m[y * W + x] = 1; };
    const circulo = (cx, cy, rad) => { for (let y = Math.floor(cy - rad); y <= cy + rad; y++) for (let x = Math.floor(cx - rad); x <= cx + rad; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= rad * rad) pon(x, y); };
    const caja = (x0, y0, w, h) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) pon(x, y); };
    // el techo: grueso arriba, con el borde de abajo irregular (para engancharse)
    let g = 40;
    for (let x = 0; x < W; x++) { g += (r() - 0.5) * 3; g = Math.max(26, Math.min(70, g)); for (let y = 0; y < g; y++) pon(x, y); }
    for (let k = 0; k < 14; k++) { const x = 60 + r() * (W - 120); for (let i = 0; i < 4; i++) circulo(x + (r() - 0.5) * 30, 50 + i * 14 + r() * 10, 16 - i * 3); }
    // pilares que cuelgan del techo
    for (const x of [380, 960, 1540]) { caja(x - 18, 0, 36, 300); circulo(x, 300, 30); }
    // plataformas flotantes (islas de circulos)
    const islas = [[180, 520, 9], [520, 420, 7], [760, 560, 8], [1160, 420, 7], [1400, 560, 8], [1740, 500, 9], [960, 470, 5], [250, 260, 4], [1680, 250, 4]];
    for (const [cx, cy, n] of islas) for (let i = 0; i < n; i++) circulo(cx + (i - n / 2) * 14 + (r() - 0.5) * 8, cy + (r() - 0.5) * 10, 16 + r() * 10);
    // un par de barras finas
    caja(600, 230, 160, 10); caja(1160, 230, 160, 10);
    return T;
  }

  // ── El dibujo del terreno (propio): roca violeta con borde claro arriba ──
  function pintarTerreno(T) {
    const cv = document.createElement('canvas'); cv.width = T.w; cv.height = T.h;
    const x = cv.getContext('2d'), img = x.createImageData(T.w, T.h), d = img.data;
    for (let y = 0; y < T.h; y++) for (let i = 0; i < T.w; i++) {
      const k = y * T.w + i;
      if (!T.m[k]) continue;
      const borde = (y > 0 && !T.m[k - T.w]) ? 1 : (y > 1 && !T.m[k - 2 * T.w]) ? 2 : (y > 2 && !T.m[k - 3 * T.w]) ? 3 : 0;
      const ruido = ((i * 7919 + y * 104729) % 23) / 23;
      let c;
      if (borde) c = [120 + 40 * ruido, 200 - borde * 18, 120 - borde * 10];
      else c = [70 + 22 * ruido, 52 + 14 * ruido, 92 + 26 * ruido];
      d[k * 4] = c[0]; d[k * 4 + 1] = c[1]; d[k * 4 + 2] = c[2]; d[k * 4 + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    return cv;
  }

  // ── La serpiente (dibujo propio): cuerpo de bolitas que sigue la cabeza, ojo y lengua ──
  function pintarSerpiente(x, s, t) {
    if (s.estado === 'muerta') return;
    const col = ['#58c23a', '#47a82e', '#3a9426'];
    // el cuerpo: si esta quieta, enroscada y erguida; si se mueve, sigue su recorrido
    let pts = [];
    const quieta = s.estado === 'suelo' && s.cola.length && Math.hypot(s.cola[Math.min(6, s.cola.length - 1)][0] - s.x, s.cola[Math.min(6, s.cola.length - 1)][1] - s.y) < 2;
    if (quieta || s.estado === 'suelo') {
      const ond = Math.sin(t / 180) * 0.6;
      for (let i = 0; i < 9; i++) {
        const u = i / 8;
        pts.push([s.x - s.dir * (Math.sin(u * 3.4 + ond) * 3 + u * 2), s.y - 6 + u * 13]);
      }
    } else {
      pts.push([s.x, s.y - 4]);
      let dist = 0, k = 0;
      for (let i = 1; i < 9; i++) {
        const quiero = i * 1.7;
        while (k < s.cola.length - 1 && dist < quiero) { dist += Math.hypot(s.cola[k + 1][0] - s.cola[k][0], s.cola[k + 1][1] - s.cola[k][1]); k++; }
        const c = s.cola[k] || [s.x, s.y + i];
        pts.push([c[0], c[1] - 4 + i * 0.4]);
      }
    }
    for (let i = pts.length - 1; i >= 1; i--) {
      x.fillStyle = col[i % 3];
      x.beginPath(); x.arc(pts[i][0], pts[i][1], 3.3 - i * 0.18, 0, Math.PI * 2); x.fill();
    }
    // la cabeza
    const h = pts[0];
    x.fillStyle = '#6bd94a'; x.beginPath(); x.ellipse(h[0] + s.dir * 0.8, h[1], 3.6, 3, 0, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#fff'; x.fillRect(Math.round(h[0] + s.dir * 1.5) - 1, Math.round(h[1]) - 2, 2, 2);
    x.fillStyle = '#111'; x.fillRect(Math.round(h[0] + s.dir * 2), Math.round(h[1]) - 2, 1, 1);
    if (Math.floor(t / 400) % 4 === 0) { x.strokeStyle = '#e8335a'; x.lineWidth = 0.7; x.beginPath(); x.moveTo(h[0] + s.dir * 3.5, h[1] + 1); x.lineTo(h[0] + s.dir * 6, h[1] + 1.5); x.stroke(); }
  }

  // ── La pagina ──
  const cv = document.getElementById('lienzo'), x = cv.getContext('2d');
  let T, J, s, fondo, zoom = 2, cam = { x: 0, y: 0 }, herramienta = 'soga', carga = null;
  function empezar() {
    T = mapaPrueba(); fondo = pintarTerreno(T);
    J = M.nuevoJuego(T);
    s = new M.Serpiente(180, 470); J.serps = [s];
    cam.x = s.x; cam.y = s.y;
  }
  empezar();

  function tam() { const d = Math.min(2, devicePixelRatio || 1); cv.width = innerWidth * d; cv.height = innerHeight * d; cv.style.width = innerWidth + 'px'; cv.style.height = innerHeight + 'px'; }
  tam(); addEventListener('resize', tam);

  // ── Los controles: los del juego clasico ──
  const apretada = {}, recien = {};
  const TECLAS = { ArrowLeft: 'izq', ArrowRight: 'der', ArrowUp: 'arr', ArrowDown: 'aba', Enter: 'enter', Backspace: 'retro', ' ': 'espacio' };
  addEventListener('keydown', (e) => {
    if (e.target && /input|textarea/i.test(e.target.tagName)) return;
    const k = TECLAS[e.key];
    if (k) { e.preventDefault(); if (!apretada[k]) recien[k] = true; apretada[k] = true; return; }
    if (e.key === 'Tab') { e.preventDefault(); herramienta = herramienta === 'soga' ? 'granada' : 'soga'; }
    if (e.key === 'r' || e.key === 'R') empezar();
    if (/^[1-5]$/.test(e.key)) J.mecha = Number(e.key);
    if (e.key === '+' || e.key === '=') zoom = Math.min(4, zoom + 0.5);
    if (e.key === '-') zoom = Math.max(1, zoom - 0.5);
  });
  addEventListener('keyup', (e) => { const k = TECLAS[e.key]; if (k) apretada[k] = false; });
  addEventListener('blur', () => { for (const k in apretada) apretada[k] = false; });
  // los botones tactiles mandan lo mismo
  for (const b of document.querySelectorAll('[data-k]')) {
    const k = b.dataset.k;
    const on = (e) => { e.preventDefault(); if (k === 'tab') { herramienta = herramienta === 'soga' ? 'granada' : 'soga'; return; } if (!apretada[k]) recien[k] = true; apretada[k] = true; };
    const off = (e) => { e.preventDefault(); apretada[k] = false; };
    b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('pointerleave', off);
  }

  function entradaDelPaso() {
    const e = { izq: apretada.izq, der: apretada.der, arr: apretada.arr, aba: apretada.aba, enter: recien.enter, retro: recien.retro, soga: false };
    // Espacio: con la soga, la tira (o la suelta); con la granada, se mantiene para cargar
    if (herramienta === 'soga') e.soga = recien.espacio;
    else {
      if (recien.espacio && s.estado !== 'muerta') carga = 0;
      if (carga !== null) {
        if (apretada.espacio && carga < 1) carga = Math.min(1, carga + 1 / C.CARGA);
        else { M.lanzar(J, s, carga); carga = null; }
      }
    }
    // en la soga, Enter tira la granada (atacar desde la soga)
    if (s.estado === 'soga' && e.enter && herramienta === 'granada') { M.lanzar(J, s, 0.5); e.enter = false; }
    for (const k in recien) recien[k] = false;
    return e;
  }

  // ── El bucle: 50 pasos por segundo fijos, dibujo en cada cuadro ──
  let acc = 0, ant = performance.now(), cuadros = 0, fps = 0, tf = ant;
  function bucle(ahora) {
    acc += Math.min(200, ahora - ant); ant = ahora;
    while (acc >= PASO) { M.pasoJuego(J, [entradaDelPaso()]); acc -= PASO; }
    dibujar(ahora);
    cuadros++; if (ahora - tf > 1000) { fps = cuadros; cuadros = 0; tf = ahora; }
    requestAnimationFrame(bucle);
  }
  requestAnimationFrame(bucle);

  function dibujar(t) {
    const W = cv.width, H = cv.height, d = Math.min(2, devicePixelRatio || 1), z = zoom * d;
    // la camara sigue a la serpiente, suave
    cam.x += (s.x - cam.x) * 0.12; cam.y += (s.y - cam.y) * 0.12;
    const vx = Math.max(W / z / 2, Math.min(T.w - W / z / 2, cam.x)), vy = Math.max(H / z / 2 - 60, Math.min(T.h - H / z / 2 + 40, cam.y));
    x.setTransform(1, 0, 0, 1, 0, 0);
    const cielo = x.createLinearGradient(0, 0, 0, H); cielo.addColorStop(0, '#1b1530'); cielo.addColorStop(1, '#3b2a55');
    x.fillStyle = cielo; x.fillRect(0, 0, W, H);
    x.setTransform(z, 0, 0, z, Math.round(W / 2 - vx * z), Math.round(H / 2 - vy * z));
    x.imageSmoothingEnabled = false;
    x.drawImage(fondo, 0, 0);
    // la soga
    if (s.soga) {
      x.strokeStyle = '#d9c38a'; x.lineWidth = 1; x.beginPath();
      x.moveTo(s.soga.piv[0].x, s.soga.piv[0].y);
      for (const p of s.soga.piv) x.lineTo(p.x, p.y);
      x.lineTo(s.x, s.y - 3); x.stroke();
      x.fillStyle = '#eee'; x.fillRect(s.soga.piv[0].x - 1, s.soga.piv[0].y - 1, 2, 2);
    }
    if (s.gancho) { x.strokeStyle = '#d9c38a'; x.lineWidth = 1; x.beginPath(); x.moveTo(s.x, s.y - 4); x.lineTo(s.gancho.x, s.gancho.y); x.stroke(); x.fillStyle = '#eee'; x.fillRect(s.gancho.x - 1, s.gancho.y - 1, 2, 2); }
    pintarSerpiente(x, s, t);
    // la granada y las explosiones
    for (const g of J.cosas) { x.fillStyle = '#2f5d2a'; x.beginPath(); x.arc(g.x, g.y, 2.5, 0, Math.PI * 2); x.fill(); }
    for (const e of J.efectos) { e.t++; x.fillStyle = `rgba(255,${180 - e.t * 6},60,${Math.max(0, 0.8 - e.t / 20)})`; x.beginPath(); x.arc(e.x, e.y, e.r * Math.min(1, e.t / 5), 0, Math.PI * 2); x.fill(); }
    J.efectos = J.efectos.filter(e => e.t < 20);
    if (J.borrados.length) { const fx = fondo.getContext('2d'); fx.globalCompositeOperation = 'destination-out'; for (const [bx, by, br] of J.borrados) { fx.beginPath(); fx.arc(bx, by, br, 0, Math.PI * 2); fx.fill(); } fx.globalCompositeOperation = 'source-over'; J.borrados = []; }
    // la mira
    if (s.estado !== 'soga' && s.estado !== 'muerta') {
      const a = herramienta === 'soga' ? Math.min(0, s.mira) : s.mira;
      x.strokeStyle = '#ff4d6d'; x.lineWidth = 1; x.beginPath(); x.arc(s.x + Math.cos(a) * s.dir * 26, s.y - 4 + Math.sin(a) * 26, 2.5, 0, Math.PI * 2); x.stroke();
    }
    // el agua
    const ag = T.agua;
    x.fillStyle = 'rgba(40,90,170,0.85)'; x.beginPath(); x.moveTo(0, T.h + 50);
    for (let i = 0; i <= T.w; i += 8) x.lineTo(i, ag + Math.sin(i / 30 + t / 400) * 2);
    x.lineTo(T.w, T.h + 50); x.closePath(); x.fill();
    // el texto
    x.setTransform(d, 0, 0, d, 0, 0);
    x.fillStyle = 'rgba(0,0,0,0.55)'; x.fillRect(8, 8, 270, 104);
    x.fillStyle = '#fff'; x.font = '12px monospace';
    const v = Math.hypot(s.vx, s.vy);
    const lin = [
      `estado: ${s.estado}${s.salto ? ' (saltando…)' : ''}`,
      `vida: ${s.vida}${s.caida ? '  (última caída: -' + s.caida + ')' : ''}`,
      `velocidad: ${v.toFixed(2)} px/paso`,
      s.soga ? `soga: ${Math.round(s.soga.L)} px · esquinas: ${s.soga.piv.length - 1}` : 'soga: —',
      `herramienta: ${herramienta}${herramienta === 'granada' ? ' · mecha ' + J.mecha + ' s' : ''}`,
      `cuadros/s: ${fps}`,
    ];
    lin.forEach((l, i) => x.fillText(l, 16, 26 + i * 15));
    if (carga !== null) { x.fillStyle = '#333'; x.fillRect(16, 116, 200, 8); x.fillStyle = '#ff9b2f'; x.fillRect(16, 116, 200 * carga, 8); }
  }

  // ── El panel de ajustes: las medidas en vivo (y un boton para copiarlas) ──
  const AJUSTES = [
    ['GRAV', 'Gravedad', 0.05, 0.6, 0.005], ['CAMINAR', 'Caminar (px/paso)', 0.5, 3, 0.1],
    ['SOGA_EMPUJE', 'Soga: balanceo', 0, 0.4, 0.01], ['SOGA_ROCE', 'Soga: roce (lo que conserva)', 0.98, 1, 0.0005],
    ['SOGA_VMAX', 'Soga: velocidad máxima', 6, 32, 1], ['SOGA_REBOTE', 'Soga: rebote contra paredes', 0, 1, 0.05],
    ['SOGA_ACORTA', 'Soga: acortar (px/paso)', 0.5, 8, 0.1], ['SOGA_ALARGA', 'Soga: alargar (px/paso)', 0.5, 8, 0.1],
    ['SOGA_LARGO', 'Soga: largo máximo', 150, 700, 2], ['SOGA_VEL', 'Soga: velocidad del gancho', 6, 40, 1],
    ['REBOTE', 'Rebote volando', 0, 1, 0.05], ['ROCE', 'Deslizar: lo que conserva', 0.8, 1, 0.005],
    ['CAIDA_DESDE', 'Caída: lastima desde (px/paso)', 4, 16, 0.5],
  ];
  const panel = document.getElementById('ajustes');
  for (const [k, nom, a, b, p] of AJUSTES) {
    const fila = document.createElement('label'); fila.className = 'aj';
    const n = document.createElement('span'); n.textContent = nom;
    const val = document.createElement('b'); val.textContent = C[k];
    const r = document.createElement('input'); r.type = 'range'; r.min = a; r.max = b; r.step = p; r.value = C[k];
    r.addEventListener('input', () => { C[k] = Number(r.value); val.textContent = r.value; });
    fila.append(n, val, r); panel.appendChild(fila);
  }
  document.getElementById('copiar').addEventListener('click', () => {
    const t = AJUSTES.map(([k]) => `${k}: ${C[k]}`).join('\n');
    if (navigator.clipboard) navigator.clipboard.writeText(t).then(() => { document.getElementById('copiar').textContent = '¡Copiado!'; });
  });
  document.getElementById('verAjustes').addEventListener('click', () => panel.parentElement.classList.toggle('abierto'));
})();
