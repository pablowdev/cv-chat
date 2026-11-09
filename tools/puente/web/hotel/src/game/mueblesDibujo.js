// Los muebles de CV Hotel se dibujan por codigo: cajas isometricas y unas pocas formas, con
// colores propios. No hay imagenes. Los muebles nuevos (fase 2) llegan del catalogo como grilla
// de pixeles y los dibuja grilla.js.
//
// Un mueble de piso se describe girado 0 sobre su huella de W x D baldosas: la baldosa (0,0) es
// el ancla y cada caja va en coordenadas de baldosa (u a lo largo de x, v a lo largo de y, el
// centro de la baldosa ancla es 0,0; z en pixeles hacia arriba). Para girar, la huella entera
// gira 90 grados y se vuelve a apoyar en (0,0), igual que las formas de shapeByRot del catalogo.
import { adjustColor } from './draw.js';
import { dibujarGrilla, revisarArte } from './grilla.js';

function pt(X, Y, u, v, z, hw, hh) { return [X + (u - v) * hw, Y + (u + v) * hh - z]; }

function poligono(ctx, pts, fill) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

// Una caja con sus tres caras visibles (arriba, la de adelante a la izquierda y la de adelante a la derecha).
function caja(ctx, X, Y, b, hw, hh, caja2) {
  const { u0, v0, u1, v1, z0, z1, c } = b;
  const top = [pt(X, Y, u0, v0, z1, hw, hh), pt(X, Y, u1, v0, z1, hw, hh), pt(X, Y, u1, v1, z1, hw, hh), pt(X, Y, u0, v1, z1, hw, hh)];
  if (z1 > z0) {
    poligono(ctx, [pt(X, Y, u0, v1, z0, hw, hh), pt(X, Y, u1, v1, z0, hw, hh), pt(X, Y, u1, v1, z1, hw, hh), pt(X, Y, u0, v1, z1, hw, hh)], b.cIzq || c);
    poligono(ctx, [pt(X, Y, u1, v0, z0, hw, hh), pt(X, Y, u1, v1, z0, hw, hh), pt(X, Y, u1, v1, z1, hw, hh), pt(X, Y, u1, v0, z1, hw, hh)], b.cDer || adjustColor(c, -30));
  }
  poligono(ctx, top, b.cArriba || adjustColor(c, 24));
  for (const p of top) caja2.push(p);
  caja2.push(pt(X, Y, u0, v1, z0, hw, hh), pt(X, Y, u1, v1, z0, hw, hh), pt(X, Y, u1, v0, z0, hw, hh));
}

// Gira una caja r veces sobre una huella de W x D.
function girarCaja(b, r, W, D) {
  let o = Object.assign({}, b), w = W, d = D;
  for (let i = 0; i < r; i++) {
    o = Object.assign({}, o, { u0: (d - 1) - o.v1, u1: (d - 1) - o.v0, v0: o.u0, v1: o.u1 });
    const t = w; w = d; d = t;
  }
  return o;
}

// Las formas de cada mueble de piso (giro 0). huella: [W, D].
const L = '#3a2414'; // patas oscuras
function patas(u0, v0, u1, v1, z, g, c) {
  return [
    { u0, v0, u1: u0 + g, v1: v0 + g, z0: 0, z1: z, c: c || L },
    { u0: u1 - g, v0, u1, v1: v0 + g, z0: 0, z1: z, c: c || L },
    { u0, v0: v1 - g, u1: u0 + g, v1, z0: 0, z1: z, c: c || L },
    { u0: u1 - g, v0: v1 - g, u1, v1, z0: 0, z1: z, c: c || L },
  ];
}

const PISO = {
  alfombra: { huella: [2, 2], plano: true, cajas: () => [
    { u0: -0.46, v0: -0.46, u1: 1.46, v1: 1.46, z0: 0, z1: 2, c: '#8f1a22' },
    { u0: -0.3, v0: -0.3, u1: 1.3, v1: 1.3, z0: 2, z1: 2.5, c: '#cc0020', cArriba: '#cc0020' },
    { u0: 0.1, v0: 0.1, u1: 0.9, v1: 0.9, z0: 2.5, z1: 3, c: '#e0b820', cArriba: '#e0b820' },
  ] },
  alfombra_chica: { huella: [1, 1], plano: true, cajas: () => [
    { u0: -0.4, v0: -0.4, u1: 0.4, v1: 0.4, z0: 0, z1: 2, c: '#1d3f9a' },
    { u0: -0.25, v0: -0.25, u1: 0.25, v1: 0.25, z0: 2, z1: 2.5, c: '#2f6fe0', cArriba: '#2f6fe0' },
    { u0: -0.1, v0: -0.1, u1: 0.1, v1: 0.1, z0: 2.5, z1: 3, c: '#bcd8ff', cArriba: '#bcd8ff' },
  ] },
  alfombra_redonda: { huella: [1, 1], plano: true, dibujo(ctx, X, Y, hw, hh) {
    const capas = [['#1e6b30', 4, 2], ['#2fa04a', 14, 7], ['#b8f0a8', 26, 13]];
    for (const [c, dw, dh] of capas) { ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(X, Y, hw - dw, hh - dh, 0, 0, Math.PI * 2); ctx.fill(); }
    return { x1: X - hw, y1: Y - hh, x2: X + hw, y2: Y + hh };
  } },
  sofa: { huella: [2, 1], cajas: () => [
    ...patas(-0.42, -0.38, 1.42, 0.42, 5, 0.08),
    { u0: -0.45, v0: -0.45, u1: 1.45, v1: -0.18, z0: 5, z1: 40, c: '#5228a0' },
    { u0: -0.45, v0: -0.18, u1: -0.22, v1: 0.45, z0: 5, z1: 26, c: '#5228a0' },
    { u0: 1.22, v0: -0.18, u1: 1.45, v1: 0.45, z0: 5, z1: 26, c: '#5228a0' },
    { u0: -0.22, v0: -0.18, u1: 1.22, v1: 0.45, z0: 5, z1: 18, c: '#8a5ce0' },
  ] },
  mesa: { huella: [1, 1], cajas: () => [
    ...patas(-0.36, -0.36, 0.36, 0.36, 26, 0.08, '#5a3820'),
    { u0: -0.42, v0: -0.42, u1: 0.42, v1: 0.42, z0: 26, z1: 31, c: '#9a6a40' },
  ] },
  silla: { huella: [1, 1], cajas: () => [
    ...patas(-0.28, -0.28, 0.28, 0.28, 16, 0.07, '#5a3820'),
    { u0: -0.3, v0: -0.3, u1: 0.3, v1: 0.3, z0: 16, z1: 20, c: '#9a6a40' },
    { u0: -0.3, v0: -0.3, u1: 0.3, v1: -0.2, z0: 20, z1: 46, c: '#7a5030' },
  ] },
  planta: { huella: [1, 1], dibujo(ctx, X, Y, hw, hh, cajasBbox) {
    const b = [];
    caja(ctx, X, Y, { u0: -0.17, v0: -0.17, u1: 0.17, v1: 0.17, z0: 0, z1: 18, c: '#bf8a58', cDer: '#8a3a0a', cIzq: '#d9661a' }, hw, hh, b);
    const hojas = [[-10, -30, 10, '#1e6b30'], [9, -33, 10, '#1e6b30'], [0, -44, 12, '#2fa04a'], [-7, -38, 8, '#2fa04a'], [8, -42, 7, '#6fd07a'], [-2, -52, 7, '#6fd07a']];
    for (const [dx, dy, r, c] of hojas) { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(X + dx, Y + dy, r, 0, Math.PI * 2); ctx.fill(); }
    void cajasBbox;
    return { x1: X - 22, y1: Y - 60, x2: X + 22, y2: Y + 10 };
  } },
  parlante: { huella: [1, 1], cajas: () => [
    { u0: -0.24, v0: -0.2, u1: 0.24, v1: 0.2, z0: 0, z1: 52, c: '#26262e' },
  ], despues(ctx, X, Y, hw, hh) {
    // los conos en la cara de adelante
    const cx = X - 0.2 * hw - 0.0, base = Y + 0.2 * hh;
    ctx.fillStyle = '#585866'; ctx.beginPath(); ctx.ellipse(cx, base - 16, 6, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#0b0b10'; ctx.beginPath(); ctx.ellipse(cx, base - 16, 3, 3.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#585866'; ctx.beginPath(); ctx.ellipse(cx, base - 36, 4, 4.5, 0, 0, Math.PI * 2); ctx.fill();
  } },
  lampara: { huella: [1, 1], dibujo(ctx, X, Y, hw, hh, _b, estado) {
    const b = [];
    caja(ctx, X, Y, { u0: -0.15, v0: -0.15, u1: 0.15, v1: 0.15, z0: 0, z1: 3, c: '#3d3d48' }, hw, hh, b);
    caja(ctx, X, Y, { u0: -0.03, v0: -0.03, u1: 0.03, v1: 0.03, z0: 3, z1: 50, c: '#7a7a8a' }, hw, hh, b);
    const prendida = estado === 1;
    if (prendida) {
      const g = ctx.createRadialGradient(X, Y - 58, 4, X, Y - 58, 46);
      g.addColorStop(0, 'rgba(255,224,102,0.55)'); g.addColorStop(1, 'rgba(255,224,102,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(X, Y - 58, 46, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = prendida ? '#ffe066' : '#e0b080';
    ctx.beginPath(); ctx.moveTo(X - 9, Y - 70); ctx.lineTo(X + 9, Y - 70); ctx.lineTo(X + 15, Y - 50); ctx.lineTo(X - 15, Y - 50); ctx.closePath(); ctx.fill();
    ctx.fillStyle = prendida ? '#e0b820' : '#bf8a58';
    ctx.beginPath(); ctx.ellipse(X, Y - 50, 15, 4, 0, 0, Math.PI * 2); ctx.fill();
    return { x1: X - 18, y1: Y - 74, x2: X + 18, y2: Y + 8 };
  } },
  separador: { huella: [1, 1], cajas: () => [
    { u0: -0.46, v0: -0.06, u1: -0.36, v1: 0.06, z0: 0, z1: 30, c: '#a0a0ae' },
    { u0: 0.36, v0: -0.06, u1: 0.46, v1: 0.06, z0: 0, z1: 30, c: '#a0a0ae' },
    { u0: -0.46, v0: -0.03, u1: 0.46, v1: 0.03, z0: 22, z1: 27, c: '#cc0020' },
    { u0: -0.5, v0: -0.1, u1: -0.32, v1: 0.1, z0: 0, z1: 3, c: '#585866' },
    { u0: 0.32, v0: -0.1, u1: 0.5, v1: 0.1, z0: 0, z1: 3, c: '#585866' },
  ] },
};

// Muebles de pared: se dibujan con el corte de la pared (north sube hacia la derecha, west baja).
const PARED = {
  poster(ctx) {
    ctx.fillStyle = '#26262e'; ctx.fillRect(-18, -22, 36, 44);
    ctx.fillStyle = '#f2f2f6'; ctx.fillRect(-16, -20, 32, 40);
    ctx.fillStyle = '#2f6fe0'; ctx.fillRect(-16, -20, 32, 22);
    ctx.fillStyle = '#ffe066'; ctx.beginPath(); ctx.arc(6, -12, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1e6b30'; ctx.beginPath(); ctx.moveTo(-16, 2); ctx.lineTo(-6, -8); ctx.lineTo(2, 0); ctx.lineTo(8, -5); ctx.lineTo(16, 2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#585866'; ctx.fillRect(-12, 8, 24, 2); ctx.fillRect(-12, 13, 16, 2);
    return [-18, -22, 18, 22];
  },
  bandera(ctx) {
    ctx.fillStyle = '#7a7a8a'; ctx.fillRect(-14, -26, 3, 50);
    ctx.fillStyle = '#cc0020'; ctx.fillRect(-11, -26, 26, 7);
    ctx.fillStyle = '#f2f2f6'; ctx.fillRect(-11, -19, 26, 7);
    ctx.fillStyle = '#0b0b10'; ctx.fillRect(-11, -12, 26, 7);
    ctx.fillStyle = '#585866'; ctx.fillRect(-17, 22, 9, 3);
    return [-17, -26, 15, 25];
  },
  cartel_cv(ctx) {
    ctx.fillStyle = '#0b0b10'; ctx.fillRect(-30, -34, 60, 68);
    ctx.fillStyle = '#26262e'; ctx.fillRect(-27, -31, 54, 62);
    ctx.fillStyle = '#cc0020'; ctx.beginPath(); ctx.arc(0, -2, 21, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#0b0b10'; ctx.beginPath(); ctx.arc(0, -2, 13, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f2f2f6'; ctx.font = 'bold 13px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('CV', 0, -1);
    ctx.fillStyle = '#cc0020'; ctx.fillRect(-20, 23, 40, 3);
    return [-30, -34, 30, 34];
  },
  ventana(ctx) {
    ctx.fillStyle = '#5a3820'; ctx.fillRect(-22, -28, 44, 52);
    const g = ctx.createLinearGradient(0, -24, 0, 20);
    g.addColorStop(0, '#6fa8ff'); g.addColorStop(1, '#bcd8ff');
    ctx.fillStyle = g; ctx.fillRect(-18, -24, 36, 44);
    ctx.fillStyle = '#f2f2f6'; ctx.fillRect(-12, -14, 10, 4); ctx.fillRect(-15, -12, 9, 3);
    ctx.fillStyle = '#5a3820'; ctx.fillRect(-2, -24, 4, 44); ctx.fillRect(-18, -4, 36, 4);
    ctx.fillStyle = '#9a6a40'; ctx.fillRect(-25, 22, 50, 5);
    return [-25, -28, 25, 27];
  },
};

export const DIBUJOS_PISO = Object.freeze(Object.keys(PISO));
export const DIBUJOS_PARED = Object.freeze(Object.keys(PARED));

function nombreDibujo(fila) { return (fila && (fila.dibujo || fila.id)) || ''; }

// ¿El mueble va tirado en el piso (se dibuja antes que la gente)?
export function esPlano(fila) {
  const d = PISO[nombreDibujo(fila)];
  return !!(d && d.plano) || !!(fila && fila.plano);
}

function dibujoGenerico(ctx, X, Y, hw, hh) {
  const b = [];
  caja(ctx, X, Y, { u0: -0.3, v0: -0.3, u1: 0.3, v1: 0.3, z0: 0, z1: 30, c: '#7a7a8a' }, hw, hh, b);
  return b;
}

// Dibuja un mueble de piso con su ancla en el centro de pantalla (X, Y) de la baldosa ancla.
// o: { hw, hh, rot, estado, alfa }. Devuelve el rectangulo { x1, y1, x2, y2 }.
export function dibujarMueblePiso(ctx, fila, X, Y, o) {
  const hw = o.hw, hh = o.hh, rot = ((o.rot || 0) % 4 + 4) % 4;
  ctx.save();
  if (o.alfa != null) ctx.globalAlpha *= o.alfa;
  let bbox = null;
  try {
    if (fila && fila.arte && revisarArte(fila.arte).ok) {
      bbox = dibujarGrilla(ctx, fila.id, fila.arte, rot, X, Y + hh, { alfa: 1 });
      return bbox;
    }
    const d = PISO[nombreDibujo(fila)];
    const pts = [];
    if (!d) {
      for (const p of dibujoGenerico(ctx, X, Y, hw, hh)) pts.push(p);
    } else if (d.dibujo) {
      return (bbox = d.dibujo(ctx, X, Y, hw, hh, pts, o.estado || 0));
    } else {
      const [W, D] = d.huella;
      const cajas = d.cajas().map((b) => girarCaja(b, rot, W, D));
      cajas.sort((a, b) => ((a.u0 + a.u1 + a.v0 + a.v1) - (b.u0 + b.u1 + b.v0 + b.v1)) || (a.z0 - b.z0));
      for (const b of cajas) caja(ctx, X, Y, b, hw, hh, pts);
      if (d.despues && rot === 0) d.despues(ctx, X, Y, hw, hh);
    }
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const [x, y] of pts) { if (x < x1) x1 = x; if (y < y1) y1 = y; if (x > x2) x2 = x; if (y > y2) y2 = y; }
    bbox = { x1, y1, x2, y2 };
    return bbox;
  } finally {
    ctx.restore();
  }
}

// Dibuja un mueble de pared centrado en (cx, cy), del lado 'north' o 'west'.
export function dibujarMuebleParedEn(ctx, fila, cx, cy, lado, alfa) {
  const corte = lado === 'north' ? 0.5 : lado === 'west' ? -0.5 : 0;
  ctx.save();
  if (alfa != null) ctx.globalAlpha *= alfa;
  ctx.translate(Math.round(cx), Math.round(cy));
  ctx.transform(1, corte, 0, 1, 0, 0);
  let r;
  if (fila && fila.arte && revisarArte(fila.arte).ok) {
    const b = dibujarGrilla(ctx, fila.id, fila.arte, lado === 'north' ? 1 : 0, 0, 0, {});
    r = [b.x1, b.y1, b.x2, b.y2];
  } else {
    const f = PARED[nombreDibujo(fila)];
    if (f) r = f(ctx);
    else { ctx.fillStyle = '#7a7a8a'; ctx.fillRect(-15, -15, 30, 30); r = [-15, -15, 15, 15]; }
  }
  ctx.restore();
  // el rectangulo en pantalla (con el corte aplicado a las cuatro esquinas)
  const xs = [r[0], r[2]], ys = [r[1], r[3]];
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const x of xs) for (const y of ys) {
    const sx = cx + x, sy = cy + y + corte * x;
    if (sx < x1) x1 = sx; if (sx > x2) x2 = sx; if (sy < y1) y1 = sy; if (sy > y2) y2 = sy;
  }
  return { x1, y1, x2, y2 };
}

// Miniatura para el inventario, el catalogo y el panel del mueble.
export function dibujarMiniatura(canvas, fila, rot) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;
  const pared = fila && fila.clase === 'pared';
  // primero a un lienzo grande y despues se acomoda al tamaño
  const tmp = document.createElement('canvas');
  tmp.width = 240; tmp.height = 200;
  const t = tmp.getContext('2d');
  let b;
  if (pared) b = dibujarMuebleParedEn(t, fila, 120, 100, 'west', 1);
  else b = dibujarMueblePiso(t, fila, 120, 130, { hw: 46, hh: 23, rot: rot || 0, estado: 0 });
  const w = Math.max(1, b.x2 - b.x1), h = Math.max(1, b.y2 - b.y1);
  const esc = Math.min((canvas.width - 6) / w, (canvas.height - 6) / h, 1.6);
  const dw = w * esc, dh = h * esc;
  ctx.drawImage(tmp, b.x1, b.y1, w, h, (canvas.width - dw) / 2, (canvas.height - dh) / 2, dw, dh);
}

// Las baldosas (desplazamientos desde el ancla) que tapa el dibujo de un mueble de piso girado:
// tienen que ser las mismas que da motor.getShapeForRotation (lo prueba pruebas/hotel/muebles.prueba.js).
export function huellaDibujo(dibujo, rot) {
  const d = PISO[dibujo];
  if (!d) return null;
  let [W, D] = d.huella || [1, 1];
  if ((((rot || 0) % 4) + 4) % 2 === 1) { const t = W; W = D; D = t; }
  const out = [];
  for (let dy = 0; dy < D; dy++) for (let dx = 0; dx < W; dx++) out.push({ dx, dy });
  return out;
}
