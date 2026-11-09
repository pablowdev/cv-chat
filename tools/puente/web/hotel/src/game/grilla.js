// Dibujante de grillas de pixeles con paleta (para la fase 2: los muebles nuevos llegan en el
// catalogo como datos, nunca como imagenes). Cada vista se arma una sola vez en un canvas chico
// (con su espejo si hace falta) y despues se copia con drawImage, sin suavizado.
//
// Formato de `arte` (campo del catalogo):
//   {
//     paleta: 'cv1',                      // nombre de la paleta (PALETAS)
//     escala: 2,                          // opcional, pixeles de pantalla por pixel de la grilla
//     vistas: [ { w, h, ax, ay, px } ],   // px: w*h caracteres del alfabeto de la paleta ('.' = vacio)
//                                         // (ax, ay): el pixel que se apoya en el centro de la baldosa
//     rot: [ 0, 1, { v: 0, espejo: true }, { v: 1, espejo: true } ]   // opcional: que vista usa cada giro
//   }
// Sin `rot`, el giro r usa la vista r % vistas.length.

export const ALFABETO = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKL';

// Paleta propia de CV (48 colores): grises, maderas, rojos, naranjas, amarillos, verdes, turquesas,
// azules, violetas, rosas y pieles. El indice es la posicion en ALFABETO.
export const PALETAS = Object.freeze({
  cv1: Object.freeze([
    '#0b0b10', '#26262e', '#3d3d48', '#585866', '#7a7a8a', '#a0a0ae', '#c8c8d2', '#f2f2f6',
    '#3a2414', '#5a3820', '#7a5030', '#9a6a40', '#bf8a58', '#e0b080',
    '#5c0f14', '#8f1a22', '#cc0020', '#ff4d5a',
    '#8a3a0a', '#d9661a', '#ff9a3c',
    '#9a7a10', '#e0b820', '#ffe066',
    '#123d1c', '#1e6b30', '#2fa04a', '#6fd07a', '#b8f0a8',
    '#0e4a4a', '#1a8a86', '#5fd6cc',
    '#0f1f5a', '#1d3f9a', '#2f6fe0', '#6fa8ff', '#bcd8ff',
    '#2e145a', '#5228a0', '#8a5ce0', '#c8a8ff',
    '#7a1446', '#d63384', '#ff9fc8',
    '#613c1e', '#b9734a', '#e6a56b', '#fddbb4',
  ]),
});

const VACIO = '.';
const MAX_LADO = 256;

// Revisa la forma de un arte. Devuelve { ok:true } o { error }.
export function revisarArte(arte) {
  if (!arte || typeof arte !== 'object') return { error: 'El dibujo no es válido.' };
  const pal = PALETAS[arte.paleta];
  if (!pal) return { error: 'Esa paleta no existe.' };
  if (!Array.isArray(arte.vistas) || arte.vistas.length < 1 || arte.vistas.length > 8) return { error: 'El dibujo no tiene vistas.' };
  for (const v of arte.vistas) {
    if (!v || !Number.isInteger(v.w) || !Number.isInteger(v.h) || v.w < 1 || v.h < 1 || v.w > MAX_LADO || v.h > MAX_LADO) return { error: 'Una vista tiene medidas raras.' };
    if (typeof v.px !== 'string' || v.px.length !== v.w * v.h) return { error: 'Una vista no tiene todos sus pixeles.' };
    for (let i = 0; i < v.px.length; i++) {
      const c = v.px[i];
      if (c === VACIO) continue;
      const k = ALFABETO.indexOf(c);
      if (k < 0 || k >= pal.length) return { error: 'Hay un pixel con un color que no existe.' };
    }
  }
  return { ok: true };
}

// Que vista y si va espejada para un giro.
export function vistaParaGiro(arte, rot) {
  const n = arte.vistas.length;
  const r = ((Number(rot) || 0) % 4 + 4) % 4;
  const regla = Array.isArray(arte.rot) ? arte.rot[r] : undefined;
  if (typeof regla === 'number' && regla >= 0 && regla < n) return { v: regla, espejo: false };
  if (regla && typeof regla === 'object' && Number.isInteger(regla.v) && regla.v >= 0 && regla.v < n) return { v: regla.v, espejo: !!regla.espejo };
  return { v: r % n, espejo: false };
}

const cache = new Map();

function lienzo(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

// El canvas de una vista (cacheado por id + vista + espejo).
export function lienzoDeVista(id, arte, v, espejo) {
  const k = id + '|' + v + '|' + (espejo ? 1 : 0);
  const hay = cache.get(k);
  if (hay) return hay;
  const vista = arte.vistas[v];
  const pal = PALETAS[arte.paleta];
  const c = lienzo(vista.w, vista.h);
  const g = c.getContext('2d');
  const img = g.createImageData(vista.w, vista.h);
  for (let y = 0; y < vista.h; y++) {
    for (let x = 0; x < vista.w; x++) {
      const ch = vista.px[y * vista.w + x];
      if (ch === VACIO) continue;
      const hex = pal[ALFABETO.indexOf(ch)];
      if (!hex) continue;
      const dx = espejo ? vista.w - 1 - x : x;
      const o = (y * vista.w + dx) * 4;
      img.data[o] = parseInt(hex.slice(1, 3), 16);
      img.data[o + 1] = parseInt(hex.slice(3, 5), 16);
      img.data[o + 2] = parseInt(hex.slice(5, 7), 16);
      img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const out = { c, w: vista.w, h: vista.h, ax: espejo ? vista.w - 1 - (vista.ax | 0) : (vista.ax | 0), ay: vista.ay | 0 };
  cache.set(k, out);
  return out;
}

export function vaciarCache() { cache.clear(); }

// Dibuja el arte con su punto de apoyo en (x, y). Devuelve el rectangulo que ocupo.
export function dibujarGrilla(ctx, id, arte, rot, x, y, o = {}) {
  const { v, espejo } = vistaParaGiro(arte, rot);
  const l = lienzoDeVista(id, arte, v, espejo);
  const esc = o.escala || arte.escala || 2;
  const dx = Math.round(x - l.ax * esc), dy = Math.round(y - l.ay * esc);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  if (o.alfa != null) ctx.globalAlpha *= o.alfa;
  ctx.drawImage(l.c, dx, dy, l.w * esc, l.h * esc);
  ctx.restore();
  return { x1: dx, y1: dy, x2: dx + l.w * esc, y2: dy + l.h * esc };
}
