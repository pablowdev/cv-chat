// La camara del hotel: el mundo (coordenadas de PawHotel, 1440 de ancho) se dibuja con una
// escala y un corrimiento sobre un canvas del tamaño de la pantalla (por devicePixelRatio, sin
// suavizado). Reemplaza el corte de 1200 px y el ontouchstart de canvasViewRuntime.js.
//  - Pointer Events: un dedo o el mouse arrastran la sala; dos dedos hacen zoom; la rueda tambien.
//  - Un toque corto (menos de 8 px de movimiento) es un "toque" (caminar, elegir, poner).
//  - Encajar: acomoda la sala entera entre la barra de arriba y la de abajo.

export function crearVista(o) {
  const canvas = o.canvas;
  const ZMIN = 0.35, ZMAX = 3;
  let zoom = 1, panX = 0, panY = 0, dpr = 1, ancho = 1, alto = 1;
  let manual = false;          // la persona movio la camara: no seguirla sola hasta Encajar
  const punteros = new Map();  // id -> {x, y, x0, y0, t0}
  let pinza = null;            // { d0, z0, cx, cy, wx, wy }
  let arrastre = false;
  const gruesa = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

  function medir() {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(3, window.devicePixelRatio || 1);
    ancho = Math.max(1, Math.round(r.width)); alto = Math.max(1, Math.round(r.height));
    const w = Math.round(ancho * dpr), h = Math.round(alto * dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  }

  function aplicar(ctx) {
    ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, dpr * panX, dpr * panY);
    ctx.imageSmoothingEnabled = false;
  }
  function aPantalla(wx, wy) { return { x: wx * zoom + panX, y: wy * zoom + panY }; }
  function aMundo(sx, sy) { return { x: (sx - panX) / zoom, y: (sy - panY) / zoom }; }

  // El lugar libre para la sala (sin las barras).
  function hueco() {
    const arriba = o.margenArriba ? o.margenArriba() : 56;
    const abajo = o.margenAbajo ? o.margenAbajo() : 110;
    return { x: 8, y: arriba, w: Math.max(50, ancho - 16), h: Math.max(50, alto - arriba - abajo) };
  }

  // Encaja la sala entera. En pantallas chicas no achica de mas (minimo 0,45): si asi no entra,
  // centra en `foco` (la persona, en coordenadas del mundo) sin salirse de la sala.
  function encajar(b, foco) {
    medir();
    if (!b) return;
    const h = hueco();
    const bw = Math.max(1, b.maxX - b.minX), bh = Math.max(1, b.maxY - b.minY);
    let z = Math.min(h.w / bw, h.h / bh);
    z = Math.max(o.zoomMinEncajar || 0.45, Math.min(o.zoomMaxEncajar || 1.6, z));
    // escalones de 0,05 para que el pixel art no tiemble
    zoom = Math.floor(z * 20) / 20 || ZMIN;
    const centrar = (ini, largo, bmin, blargo, f) => {
      if (blargo * zoom <= largo || f == null) return Math.round(ini + (largo - blargo * zoom) / 2 - bmin * zoom);
      const p = ini + largo / 2 - f * zoom;
      return Math.round(Math.min(ini - bmin * zoom, Math.max(ini + largo - (bmin + blargo) * zoom, p)));
    };
    panX = centrar(h.x, h.w, b.minX, bw, foco ? foco.x : null);
    panY = centrar(h.y, h.h, b.minY, bh, foco ? foco.y : null);
    manual = false;
    cambio();
  }

  // Si la sala no entra, mantiene a la persona (wx, wy del mundo) a la vista.
  function seguir(wx, wy) {
    if (manual) return;
    const h = hueco();
    const p = aPantalla(wx, wy);
    const mx = Math.min(120, h.w * 0.25), my = Math.min(90, h.h * 0.25);
    let dx = 0, dy = 0;
    if (p.x < h.x + mx) dx = h.x + mx - p.x; else if (p.x > h.x + h.w - mx) dx = h.x + h.w - mx - p.x;
    if (p.y < h.y + my) dy = h.y + my - p.y; else if (p.y > h.y + h.h - my) dy = h.y + h.h - my - p.y;
    if (dx || dy) { panX += dx * 0.12; panY += dy * 0.12; cambio(); }
  }

  function zoomEn(sx, sy, nz) {
    nz = Math.max(ZMIN, Math.min(ZMAX, nz));
    const w = aMundo(sx, sy);
    zoom = nz;
    panX = sx - w.x * zoom; panY = sy - w.y * zoom;
    manual = true;
    cambio();
  }

  function cambio() { if (o.alCambiar) o.alCambiar(); }
  function pos(e) { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }

  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
    const p = pos(e);
    punteros.set(e.pointerId, { x: p.x, y: p.y, x0: p.x, y0: p.y, t0: performance.now() });
    arrastre = false;
    if (punteros.size === 2) {
      const [a, b] = [...punteros.values()];
      const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      pinza = { d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, z0: zoom, cx, cy };
      arrastre = true;
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = pos(e);
    const q = punteros.get(e.pointerId);
    if (!q) { if (e.pointerType === 'mouse' && o.alMover) o.alMover(p.x, p.y); return; }
    const dx = p.x - q.x, dy = p.y - q.y;
    q.x = p.x; q.y = p.y;
    if (pinza && punteros.size >= 2) {
      const [a, b] = [...punteros.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      panX += cx - pinza.cx; panY += cy - pinza.cy;
      pinza.cx = cx; pinza.cy = cy;
      zoomEn(cx, cy, pinza.z0 * d / pinza.d0);
      return;
    }
    if (!arrastre && Math.hypot(p.x - q.x0, p.y - q.y0) > (gruesa ? 10 : 6)) arrastre = true;
    if (arrastre) { panX += dx; panY += dy; manual = true; cambio(); }
    else if (e.pointerType === 'mouse' && o.alMover) o.alMover(p.x, p.y);
  });
  function soltar(e) {
    const q = punteros.get(e.pointerId);
    punteros.delete(e.pointerId);
    if (punteros.size < 2) pinza = null;
    if (q && !arrastre && punteros.size === 0 && e.type === 'pointerup' && o.alTocar) o.alTocar(q.x0, q.y0, e);
    if (punteros.size === 0) arrastre = false;
  }
  canvas.addEventListener('pointerup', soltar);
  canvas.addEventListener('pointercancel', soltar);
  canvas.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && o.alSalir) o.alSalir(); });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const p = pos(e);
    zoomEn(p.x, p.y, zoom * Math.exp(-e.deltaY * 0.0015));
  }, { passive: false });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  medir();
  return {
    medir, aplicar, aPantalla, aMundo, encajar, seguir, zoomEn,
    get zoom() { return zoom; }, get dpr() { return dpr; }, get ancho() { return ancho; }, get alto() { return alto; },
    get manual() { return manual; },
    gruesa,
  };
}
