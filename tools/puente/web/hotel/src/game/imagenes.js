// Muebles con imagen propia (el arte original del dueño: cartel CV, cocina, mesa chica). Las PNG
// viven en web/hotel/arte/ y se sirven del mismo sitio que el hotel (CSP img-src 'self'); nunca
// se pide nada de otro lado.
//
// Formato del campo `arte` del catalogo cuando es imagen (el otro formato, la grilla de pixeles,
// lo dibuja grilla.js):
//   {
//     tipo: 'imagen',
//     vistas: [ { src: 'cocina-1.png', w: 69, h: 90, dx: -8, dy: -7 } ],
//     rot:   [0, 1],                       // piso: que vista usa cada giro (sin rot: giro % vistas)
//     pared: { west: 0, north: 1 },        // pared: que vista usa cada cara
//     muestra: 0,                          // la vista de la mochila y el catalogo (opcional)
//   }
// src es el nombre de un archivo de web/hotel/arte/ (se busca al lado del cliente, con su huella)
// o una ruta del mismo sitio debajo de /puente/ o /uploads/ (la guardia de rutas del catalogo).
// Igual que PawHotel (getFloorDrawBox / getWallDrawBox): en el piso la imagen apoya el centro de
// su borde de abajo en la punta de abajo de la baldosa ancla, en la pared va centrada en el punto
// de la pared, y en los dos casos se corre (dx, dy). Escala 1: un pixel de la imagen es un pixel
// del mundo, sin suavizado (ver poner).
import { rutaPermitida } from '../app/catalogo.js';

const NOMBRE_RE = /^[a-z0-9][a-z0-9-]{0,60}\.(png|webp)$/;
const BASE = new URL('../../arte/', import.meta.url);
const MAX_LADO = 512;

// La direccion (string) de una imagen, o null si no es del mismo sitio.
export function urlArte(src) {
  if (typeof src !== 'string') return null;
  if (NOMBRE_RE.test(src)) return new URL(src, BASE).href;
  if (!rutaPermitida(src)) return null;
  return src;
}

const entero = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;

export function esArteImagen(arte) { return !!(arte && typeof arte === 'object' && arte.tipo === 'imagen'); }

// -> { ok: true } o { error }
export function revisarArteImagen(arte) {
  if (!esArteImagen(arte)) return { error: 'No es un arte con imagen.' };
  if (!Array.isArray(arte.vistas) || arte.vistas.length < 1 || arte.vistas.length > 8) return { error: 'El arte no tiene vistas.' };
  for (const v of arte.vistas) {
    if (!v || !urlArte(v.src)) return { error: 'Una imagen no es del hotel.' };
    if (!entero(v.w, 1, MAX_LADO) || !entero(v.h, 1, MAX_LADO)) return { error: 'Una imagen tiene medidas raras.' };
    if ((v.dx != null && !entero(v.dx, -200, 200)) || (v.dy != null && !entero(v.dy, -200, 200))) return { error: 'Una imagen está corrida de más.' };
  }
  return { ok: true };
}

const n = (arte) => arte.vistas.length;
const valida = (arte, i) => Number.isInteger(i) && i >= 0 && i < n(arte);

export function vistaDeGiro(arte, rot) {
  const r = ((Number(rot) || 0) % 4 + 4) % 4;
  const regla = Array.isArray(arte.rot) ? arte.rot[r % arte.rot.length] : undefined;
  return arte.vistas[valida(arte, regla) ? regla : r % n(arte)];
}
export function vistaDePared(arte, lado) {
  const i = arte.pared && arte.pared[lado];
  return arte.vistas[valida(arte, i) ? i : (lado === 'north' && n(arte) > 1 ? 1 : 0)];
}
export function vistaDeMuestra(arte) { return arte.vistas[valida(arte, arte.muestra) ? arte.muestra : 0]; }

// ── Carga (una vez por imagen) ──
const cache = new Map(); // url -> { img, lista, error, esperan: [] }
const oyentes = new Set();

// Avisa cuando termina de cargar cualquier imagen (para volver a dibujar).
export function alCargarImagenes(fn) { oyentes.add(fn); return () => oyentes.delete(fn); }

function pedir(url) {
  let c = cache.get(url);
  if (c) return c;
  c = { img: null, lista: false, error: false, esperan: [] };
  cache.set(url, c);
  if (typeof Image === 'undefined') { c.error = true; return c; }
  const img = new Image();
  img.decoding = 'async';
  img.onload = () => {
    c.lista = true;
    const fns = c.esperan.splice(0);
    for (const fn of fns) { try { fn(); } catch (e) { /* una miniatura que ya no esta */ } }
    for (const fn of oyentes) { try { fn(); } catch (e) { /* idem */ } }
  };
  img.onerror = () => { c.error = true; c.esperan.length = 0; };
  img.src = url;
  c.img = img;
  return c;
}

// La imagen lista de una vista, o null (y la empieza a bajar).
export function imagenDe(vista) {
  const url = urlArte(vista && vista.src);
  if (!url) return null;
  const c = pedir(url);
  return c.lista ? c.img : null;
}

// Llama fn cuando la vista este lista (una sola vez).
export function cuandoCargue(vista, fn) {
  const url = urlArte(vista && vista.src);
  if (!url) return;
  const c = pedir(url);
  if (c.lista) fn(); else if (!c.error) c.esperan.push(fn);
}

// Todas las imagenes de un arte, para bajarlas antes de que se vean.
export function precargar(arte) {
  if (!esArteImagen(arte) || !revisarArteImagen(arte).ok) return;
  for (const v of arte.vistas) imagenDe(v);
}

// Sin suavizado (pixel art nitido) salvo cuando la camara la achica (zoom * pantalla < 1): ahi
// el vecino mas cercano se come pixeles sueltos y el cartel queda roto.
function poner(ctx, img, x, y, w, h, alfa) {
  ctx.save();
  const t = typeof ctx.getTransform === 'function' ? ctx.getTransform() : null;
  const achica = !!t && Math.hypot(t.a, t.b) < 0.99;
  ctx.imageSmoothingEnabled = achica;
  if (achica) ctx.imageSmoothingQuality = 'high';
  if (alfa != null) ctx.globalAlpha *= alfa;
  ctx.drawImage(img, x, y, w, h);
  ctx.restore();
}

// Piso: (X, Y) es el centro de la baldosa ancla y hh la mitad de su alto. Devuelve el rectangulo
// (aunque la imagen todavia no haya llegado: asi se puede tocar) y si se dibujo.
export function dibujarImagenPiso(ctx, arte, rot, X, Y, hh, alfa) {
  const v = vistaDeGiro(arte, rot);
  const sx = Math.round(X), sy = Math.round(Y + hh);
  const x = Math.round(sx - v.w / 2 + (v.dx | 0)), y = Math.round(sy - v.h + (v.dy | 0));
  const img = imagenDe(v);
  if (img) poner(ctx, img, x, y, v.w, v.h, alfa);
  return { x1: x, y1: y, x2: x + v.w, y2: y + v.h, listo: !!img };
}

// Pared: (cx, cy) es el punto de la pared (centroPared de escena.js).
export function dibujarImagenPared(ctx, arte, lado, cx, cy, alfa) {
  const v = vistaDePared(arte, lado);
  const x = Math.round(cx - v.w / 2 + (v.dx | 0)), y = Math.round(cy - v.h / 2 + (v.dy | 0));
  const img = imagenDe(v);
  if (img) poner(ctx, img, x, y, v.w, v.h, alfa);
  return { x1: x, y1: y, x2: x + v.w, y2: y + v.h, listo: !!img };
}
