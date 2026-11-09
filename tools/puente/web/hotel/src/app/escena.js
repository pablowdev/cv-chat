// El dibujo de la sala. Junta lo que en PawHotel hacian renderFrameRuntime, renderSceneRuntime,
// renderVisualRuntime, mainRenderRuntime y doorCharacterRuntime:
//  - el fondo (piso, zocalo, paredes y puerta) se arma una sola vez por sala, decoracion y escala
//    en un canvas aparte (asi "Tablones" ya no arma un canvas nuevo en cada cuadro);
//  - arriba van los muebles de pared, las alfombras y despues muebles y gente ordenados por
//    profundidad; los sentados en una silla con respaldo quedan detras del respaldo;
//  - todos se mueven con su camino (p.pasos) y nadie escribe nada a la red desde aca.
import { tileToScreenPoint, drawDiamondPathCtx } from '../game/iso.js';
import { getDoorGeometry, drawDoor } from '../game/door.js';
import { adjustColor, fillPixelRect } from '../game/draw.js';
import { drawFloorTileGeneric, drawIsoBrickFloorGeneric, drawFloorSkirtGeneric, drawRoomWallsGeneric, normalizeFloorPatternId, buildThemeFromDecor } from '../game/roomRenderExact.js';
import { hitTestWall as hitTestWallBase, pickVisibleFloorTileAtScreen, pointInDiamondScreen, drawFloorHoverOutline } from '../game/roomCanvasRuntime.js';
import { drawPixelCharRuntime } from '../game/drawPixelCharRuntime.js';
import { drawTypingIndicator, dibujarAusente, dibujarGesto, dibujarNombre } from '../game/characterRuntime.js';
import { dibujarMueblePiso, dibujarMuebleParedEn, esPlano } from '../game/mueblesDibujo.js';
import { readSeatPose } from '../config/avatarSeatPoses.js';
import { bodyDirToSittingPose } from '../game/directionHelpers.js';
import { COLORS } from '../config/avatar.js';
import { TILE_W, TILE_H, WALL_H, WALL_THICK, MUNDO_W, MUNDO_OFFSET_Y, TEMA_BASE, COLORES_DECO } from '../config/hotel.js';
import { posicionDe } from '../red/salaEventos.js';

const HW = TILE_W / 2, HH = TILE_H / 2;

// La decoracion de la sala (meta.decor del servidor) -> el tema de PawHotel.
export function temaDeSala(meta, colores) {
  const lista = colores || COLORES_DECO;
  const idx = (c) => {
    if (typeof c === 'number') return c;
    const i = lista.findIndex((x) => x.id === c);
    return i < 0 ? 0 : i;
  };
  const d = (meta && meta.decor) || {};
  const decor = {
    wall: d.pared ? { patternId: d.pared.patron, colorIdx: idx(d.pared.color) } : null,
    floor: d.piso ? { patternId: d.piso.patron, colorIdx: idx(d.piso.color) } : null,
  };
  return buildThemeFromDecor(TEMA_BASE, decor, lista);
}

// Todo lo que depende solo de la forma de la sala.
export function geometriaDe(M, sala) {
  const capa = sala.capa, pu = sala.puerta;
  const tts = (tx, ty) => tileToScreenPoint({ tx, ty, canvasWidth: MUNDO_W, roomW: capa.w, roomH: capa.h, tileW: TILE_W, tileH: TILE_H, offsetY: MUNDO_OFFSET_Y });
  const existe = (tx, ty) => M.existe(capa, tx, ty);
  const esL = pu.tipo === 'l', esHex = pu.tipo === 'hex';
  const puertaDeps = (fn) => ({
    wallH: WALL_H, tileW: TILE_W, tileH: TILE_H, tileToScreen: fn,
    isLShapeLayout: () => esL, isHexRoomLayout: () => esHex,
    getLShapeDoorTile: () => M.getLShapeDoorTile(), getHexDoorTile: () => ({ tx: pu.x, ty: pu.y }), getDoorTy: () => pu.ty,
  });
  const puerta = getDoorGeometry(puertaDeps(tts));
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const sumar = (tx, ty) => {
    const p = tts(tx, ty);
    minX = Math.min(minX, p.x - HW); maxX = Math.max(maxX, p.x + HW);
    minY = Math.min(minY, p.y - WALL_H - HH - 8); maxY = Math.max(maxY, p.y + HH + 8);
  };
  for (let tx = 0; tx < capa.w; tx++) for (let ty = 0; ty < capa.h; ty++) if (existe(tx, ty)) sumar(tx, ty);
  sumar(pu.afuera.x, pu.afuera.y);
  return { capa, pu, tts, existe, puerta, puertaDeps, bounds: { minX, maxX, minY, maxY } };
}

// Donde va en pantalla (mundo) un mueble de pared, igual que drawWallFurniKey de PawHotel.
export function centroPared(g, v) {
  const p = g.tts(v.tx, v.ty);
  const t = v.ox / 100;
  if (v.lado === 'north') {
    const bx0 = p.x - HW, bx1 = p.x + HW, by0 = p.y, by1 = p.y - HH;
    return { x: bx0 + (bx1 - bx0) * t, y: by0 + (by1 - by0) * t - WALL_H * (v.oy / 100) - 14 };
  }
  return { x: (p.x - HW) + HW * t, y: (p.y - HH * t) - WALL_H * (v.oy / 100) - 14 };
}

export function crearEscena(o) {
  const { canvas, vista, M } = o;
  const ctx = canvas.getContext('2d');
  let fondo = null; // { clave, c, ox, oy, esc }
  let geo = null, geoDe = null;
  const ultimo = { jugadores: [], muebles: [], paredes: [] }; // para tocar cosas (coordenadas del mundo)

  function geometria(sala) {
    if (geoDe !== sala) { geo = geometriaDe(M, sala); geoDe = sala; fondo = null; }
    return geo;
  }

  function armarFondo(sala, g, tema) {
    const esc = Math.max(1, Math.min(4, Math.round(vista.zoom * vista.dpr * 4) / 4));
    const clave = sala.slug + '|' + JSON.stringify(sala.meta.decor || {}) + '|' + esc;
    if (fondo && fondo.clave === clave) return fondo;
    const pad = 16;
    const ox = Math.floor(g.bounds.minX - pad), oy = Math.floor(g.bounds.minY - pad);
    const w = Math.ceil(g.bounds.maxX - g.bounds.minX + pad * 2), h = Math.ceil(g.bounds.maxY - g.bounds.minY + pad * 2);
    const c = document.createElement('canvas');
    c.width = Math.ceil(w * esc); c.height = Math.ceil(h * esc);
    const f = c.getContext('2d');
    f.setTransform(esc, 0, 0, esc, 0, 0);
    // coordenadas locales: el mundo corrido (ox, oy)
    const tts = (tx, ty) => { const p = g.tts(tx, ty); return { x: p.x - ox, y: p.y - oy }; };
    const cols = g.capa.w, rows = g.capa.h;
    for (let sum = 0; sum < cols + rows; sum++) {
      for (let tx = 0; tx < cols; tx++) {
        const ty = sum - tx;
        if (!g.existe(tx, ty)) continue;
        drawFloorTileGeneric(f, tts, tx, ty, tema, HW, HH);
      }
    }
    if (normalizeFloorPatternId(tema._floorPattern) === 'iso_brick') drawIsoBrickFloorGeneric(f, tts, g.existe, cols, rows, HW, HH, tema);
    else drawFloorSkirtGeneric(f, tts, g.existe, cols, rows, HW, HH, tema);
    drawFloorTileGeneric(f, tts, g.pu.afuera.x, g.pu.afuera.y, tema, HW, HH);
    drawRoomWallsGeneric(f, tema, { cols, rows, tileExists: g.existe, tileToScreen: tts, hw: HW, hh: HH, wallH: WALL_H, wallThick: WALL_THICK });
    drawDoor(f, getDoorGeometry(g.puertaDeps(tts)));
    fondo = { clave, c, ox, oy, esc, w, h };
    return fondo;
  }

  function jugadorParaDibujo(p, ahora) {
    posicionDe(M, p, ahora);
    if (p.cabezaHasta && ahora > p.cabezaHasta) { p.cabeza = null; p.cabezaHasta = 0; }
    if (p.escribeHasta && ahora > p.escribeHasta) { p.escribe = false; p.escribeHasta = 0; }
    p.lata = p.lataHasta > ahora;
    p.sorbo = p.lata && (ahora % 8000) < 1500;
    return p;
  }

  // ¿Esta parado en la baldosa de afuera de la puerta? (se dibuja recortado por el marco)
  function enPuerta(g, p) { return !p.sentado && Math.round(p.px) === g.pu.afuera.x && Math.round(p.py) === g.pu.afuera.y; }

  // o2: { sala, yo, ahora, hover:{tx,ty}|null, colocar:{fila, rot, m?}|null, elegido:{tipo,id}|null, entrada(c), fila(c), rawCatalog, ocultar:m }
  function dibujar(o2) {
    const sala = o2.sala, ahora = o2.ahora;
    vista.medir();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ultimo.jugadores = []; ultimo.muebles = []; ultimo.paredes = [];
    if (!sala) return { anima: false };
    const g = geometria(sala);
    const tema = temaDeSala(sala.meta, o2.colores);
    const f = armarFondo(sala, g, tema);
    vista.aplicar(ctx);
    ctx.drawImage(f.c, f.ox, f.oy, f.c.width / f.esc, f.c.height / f.esc);
    const px = (x, y, w, h, c) => fillPixelRect(ctx, x, y, w, h, c);

    // contorno de la baldosa debajo del mouse
    if (o2.hover && g.existe(o2.hover.tx, o2.hover.ty)) {
      drawFloorHoverOutline(ctx, o2.hover, { tileExistsFn: g.existe, tileToScreenFn: g.tts, tileW: TILE_W, tileH: TILE_H, alpha: 0.95, drawDiamondPathCtx });
    }

    // muebles de pared
    const lista = Object.values(sala.muebles);
    for (const mu of lista) {
      if (!mu.pared || mu.m === o2.ocultar) continue;
      const c = centroPared(g, mu.pared);
      const b = dibujarMuebleParedEn(ctx, o2.fila(mu.c), c.x, c.y, mu.pared.lado, o2.elegido && o2.elegido.id === mu.m ? 1 : 1);
      ultimo.paredes.push({ m: mu.m, bbox: b });
    }

    // lo de piso: primero lo plano (alfombras) y despues todo ordenado por profundidad
    const cosas = [];
    for (const mu of lista) {
      if (mu.pared || mu.x == null || mu.m === o2.ocultar) continue;
      const fila = o2.fila(mu.c), e = o2.entrada(mu.c);
      const bs = e ? M.baldosasDeMueble(mu.x, mu.y, mu.rot, e) : [{ tx: mu.x, ty: mu.y }];
      let prof = -Infinity;
      for (const b of bs) prof = Math.max(prof, b.tx + b.ty);
      cosas.push({ tipo: esPlano(fila) ? 'plano' : 'mueble', prof, mu, fila, e, bs });
    }
    const porMueble = {};
    for (const c of cosas) porMueble[c.mu.m] = c;
    const gente = [];
    for (const p of Object.values(sala.jugadores)) {
      jugadorParaDibujo(p, ahora);
      let prof = p.px + p.py;
      if (p.sentado) { const c = porMueble[p.sentado.m]; prof = c ? c.prof + 0.5 : (p.sentado.tx + p.sentado.ty + 0.5); }
      const item = { tipo: 'jugador', prof, p };
      gente.push(item);
      cosas.push(item);
    }
    const peso = { plano: 0, mueble: 1, jugador: 2 };
    cosas.sort((a, b) => (a.tipo === 'plano') !== (b.tipo === 'plano') ? (a.tipo === 'plano' ? -1 : 1) : (a.prof - b.prof) || (peso[a.tipo] - peso[b.tipo]));

    let anima = false;
    const deps = { ctx, tileToScreen: g.tts, adjustColor, colors: COLORS, px, rawCatalog: o2.rawCatalog || null, puntoPuerta: null };
    for (const c of cosas) {
      if (c.tipo !== 'jugador') {
        const sc = g.tts(c.mu.x, c.mu.y);
        const b = dibujarMueblePiso(ctx, c.fila, Math.round(sc.x), Math.round(sc.y), { hw: HW, hh: HH, rot: c.mu.rot, estado: c.mu.s });
        c.bbox = b;
        ultimo.muebles.push({ m: c.mu.m, bbox: b, bs: c.bs, plano: c.tipo === 'plano' });
        continue;
      }
      const p = c.p;
      if (p.caminando) anima = true;
      let r;
      if (enPuerta(g, p)) {
        const { bL, bR, tL, tR } = g.puerta;
        ctx.save();
        ctx.beginPath(); ctx.moveTo(bL.x, bL.y); ctx.lineTo(bR.x, bR.y); ctx.lineTo(tR.x, tR.y); ctx.lineTo(tL.x, tL.y); ctx.closePath(); ctx.clip();
        r = drawPixelCharRuntime(p, Object.assign({}, deps, { puntoPuerta: g.pu.tipo === 'hex' ? { x: (bL.x + bR.x) / 2, y: (bL.y + bR.y) / 2 } : null }));
        ctx.restore();
      } else {
        r = drawPixelCharRuntime(p, deps);
      }
      // el respaldo tapa al que esta sentado de espaldas (pose con chairOnTop). La pose sale de para
      // donde mira el cuerpo (la misma que usa el dibujo), no del giro de la silla.
      if (p.sentado) {
        const cm = porMueble[p.sentado.m];
        if (cm && cm.e && (cm.e.sittable || cm.e.seats || cm.e.seatsByRot) && cm.bbox) {
          const pose = readSeatPose({ rawCatalog: o2.rawCatalog || null, furniId: cm.mu.c, pose: bodyDirToSittingPose(p.sentado.d ?? 4) });
          if (pose.chairOnTop && pose.chairCoverHeightRatio > 0) {
            const sc = g.tts(cm.mu.x, cm.mu.y), b = cm.bbox;
            ctx.save();
            ctx.beginPath(); ctx.rect(b.x1, b.y1, b.x2 - b.x1, (b.y2 - b.y1) * Math.min(1, pose.chairCoverHeightRatio)); ctx.clip();
            dibujarMueblePiso(ctx, cm.fila, Math.round(sc.x), Math.round(sc.y), { hw: HW, hh: HH, rot: cm.mu.rot, estado: cm.mu.s });
            ctx.restore();
          }
        }
      }
      ultimo.jugadores.push({ u: p.u, regions: r.regions, sx: r.sx, sy: r.sy, headSy: r.headSy, prof: c.prof });
    }

    // fantasma del mueble que se esta poniendo o moviendo
    if (o2.colocar && o2.hover) {
      const k = o2.colocar;
      if (k.fila && k.fila.clase === 'pared') {
        const h = o2.hoverPared;
        if (h) { const c = centroPared(g, h); dibujarMuebleParedEn(ctx, k.fila, c.x, c.y, h.lado, h.ok ? 0.6 : 0.3); }
      } else if (k.fila && g.existe(o2.hover.tx, o2.hover.ty)) {
        const sc = g.tts(o2.hover.tx, o2.hover.ty);
        ctx.save();
        ctx.globalAlpha = 0.55;
        dibujarMueblePiso(ctx, k.fila, Math.round(sc.x), Math.round(sc.y), { hw: HW, hh: HH, rot: k.rot || 0, estado: 0 });
        ctx.restore();
      }
    }

    // marcas arriba de las cabezas
    for (const j of ultimo.jugadores) {
      const p = sala.jugadores[j.u];
      if (!p) continue;
      if (p.escribe) { drawTypingIndicator(ctx, p.sentado ? Object.assign({}, p, { px: p.sentado.tx, py: p.sentado.ty }) : p, ahora, g.tts); anima = true; }
      if (p.ausente) { dibujarAusente(ctx, j.sx, j.headSy + 20, ahora); anima = true; }
      if (p.gesto && p.gesto.hasta > ahora) { dibujarGesto(ctx, j.sx, j.headSy + 26, o2.textoGesto(p.gesto.tipo), p.gesto.hasta - ahora); anima = true; }
      else if (p.gesto) p.gesto = null;
      const mostrarNombre = (o2.hoverJugador && o2.hoverJugador === p.u) || (o2.elegido && o2.elegido.tipo === 'jugador' && o2.elegido.id === p.u);
      if (mostrarNombre) dibujarNombre(ctx, j.sx, j.headSy + 30, p.nombre, String(o2.yo) === p.u);
    }
    return { anima, geo: g };
  }

  // ── Tocar cosas (sx, sy en pixeles de pantalla) ──
  function queHay(sala, sx, sy) {
    if (!sala) return null;
    const g = geometria(sala);
    const w = vista.aMundo(sx, sy);
    const extra = vista.gruesa ? 6 : 0;
    const dentro = (b) => b && w.x >= b.x1 - extra && w.x <= b.x2 + extra && w.y >= b.y1 - extra && w.y <= b.y2 + extra;
    // gente (de adelante para atras)
    const js = ultimo.jugadores.slice().sort((a, b) => b.prof - a.prof);
    for (const j of js) for (const r of j.regions) if (dentro(r)) return { tipo: 'jugador', u: j.u, w };
    // muebles de piso que no son alfombras (de adelante para atras)
    const ms = ultimo.muebles.slice().reverse();
    for (const m of ms) if (!m.plano && dentro(m.bbox)) return { tipo: 'mueble', m: m.m, w };
    for (const m of ultimo.paredes.slice().reverse()) if (dentro(m.bbox)) return { tipo: 'mueble', m: m.m, w, pared: true };
    // la puerta
    const pts = [g.puerta.bL, g.puerta.bR, g.puerta.tR, g.puerta.tL];
    if (puntoEnPoligono(w.x, w.y, pts)) return { tipo: 'puerta', w };
    // una baldosa
    const t = baldosaEn(sala, sx, sy);
    if (t) {
      // si en esa baldosa hay una alfombra, igual se camina
      return { tipo: 'baldosa', tx: t.tx, ty: t.ty, w };
    }
    return null;
  }

  function baldosaEn(sala, sx, sy) {
    if (!sala) return null;
    const g = geometria(sala);
    const w = vista.aMundo(sx, sy);
    return pickVisibleFloorTileAtScreen(w.x, w.y, {
      roomW: g.capa.w, roomH: g.capa.h, tileExistsFn: g.existe,
      pointInDiamondScreenFn: (x, y, tx, ty) => pointInDiamondScreen(x, y, tx, ty, { tileToScreenFn: g.tts, tileW: TILE_W, tileH: TILE_H }),
    });
  }

  function paredEn(sala, sx, sy) {
    if (!sala) return null;
    const g = geometria(sala);
    const w = vista.aMundo(sx, sy);
    return hitTestWallBase(w.x, w.y, { wallH: WALL_H, tileW: TILE_W, tileH: TILE_H, roomW: g.capa.w, roomH: g.capa.h, tileExistsFn: g.existe, tileToScreenFn: g.tts });
  }

  return {
    dibujar, queHay, baldosaEn, paredEn,
    geometria,
    limites: (sala) => (sala ? geometria(sala).bounds : null),
    pantallaDeJugador: (u) => ultimo.jugadores.find((j) => j.u === String(u)) || null,
    olvidarFondo: () => { fondo = null; },
    _ultimo: ultimo, // para las pruebas
  };
}

function puntoEnPoligono(x, y, pts) {
  let dentro = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].x, yi = pts[i].y, xj = pts[j].x, yj = pts[j].y;
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) dentro = !dentro;
  }
  return dentro;
}
