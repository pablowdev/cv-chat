import { bodyDirToSittingPose, clampHeadDir } from './directionHelpers.js';
import { readPoseOffset } from '../config/avatarPoseTuning.js';
import { readSeatPose, resolveColor } from '../config/avatarSeatPoses.js';

// Dibujo del muñeco en pixel art (sale de PawHotel).
// - Parado: 8 direcciones de cuerpo (p.dir 0..7).
// - Sentado: 4 poses de cuerpo (de p.sentado.d con bodyDirToSittingPose).
// - Cabeza: 8 direcciones (p.cabeza) que nunca muestran la nuca de frente (clampHeadDir).
// Cambios para CV Hotel: no escribe nada a la red (la mirada y la lata vencen por reloj, con lo
// que manda el servidor en ms relativos) y dibuja el pantalon y los zapatos elegidos
// (pantsV/shoesV), igual que la vista previa del creador.

function drawHead(ctx, opts) {
  const { headDir, avatar, colors, headL, headTop, headW, headH, ox, px, adjustColor } = opts;
  const d = ((headDir % 8) + 8) % 8;
  // Convención (iso):
  //   0 = N ↗ (nuca 3/4 derecha)    1 = NW ↑ (nuca pura)
  //   2 = W ↖ (nuca 3/4 izquierda)  3 = SW ← (perfil izquierdo)
  //   4 = S ↙ (cara 3/4 izq)        5 = SE ↓ (cara frontal)
  //   6 = E ↘ (cara 3/4 der)        7 = NE → (perfil derecho)
  const isBack = (d === 0 || d === 1 || d === 2);
  const isSide = (d === 3 || d === 7);
  // flipHead: espejar cuando el lado izquierdo del rostro/cabeza está más expuesto
  const flipHead = (d === 2 || d === 3 || d === 4);

  const skinC = (avatar && colors.face) ? (colors.face[avatar.faceC || 0] || '#f2c38a') : '#f2c38a';
  const hairC = (avatar && colors.hair) ? (colors.hair[avatar.hairC || 0] || '#2b2b2b') : '#2b2b2b';
  const hairStyle = avatar ? (avatar.hairV || 0) : 0;

  ctx.save();
  let effOx = ox;
  let effHeadL = headL;
  if (flipHead) {
    ctx.scale(-1, 1);
    effOx = -ox;
    effHeadL = -headL - headW;
  }

  if (isBack) {
    // NUCA: pelo cubre casi toda la cabeza, apenas un borde de piel (hairline) al final.
    // Base skin (hairline y cuello sutil)
    px(effHeadL, headTop, headW, headH, skinC);
    // Orejas peek a los costados (sin cara visible)
    px(effHeadL - 1, headTop + 9, 2, 4, skinC);
    px(effHeadL + headW - 1, headTop + 9, 2, 4, skinC);
    // Pelo cubriendo la cabeza entera menos el hairline inferior
    if (hairStyle === 0) {
      // Short hair: cubre casi todo
      px(effHeadL, headTop, headW, headH - 6, hairC);
      px(effHeadL, headTop + headH - 6, 4, 4, hairC);
      px(effHeadL + headW - 4, headTop + headH - 6, 4, 4, hairC);
    } else if (hairStyle === 1) {
      // Medium hair: cubre toda la cabeza y baja un poco
      px(effHeadL - 2, headTop, headW + 4, headH - 2, hairC);
      px(effHeadL - 3, headTop + 4, 5, 14, hairC);
      px(effHeadL + headW - 2, headTop + 4, 5, 14, hairC);
    } else {
      // Long hair: cubre cabeza + cuello (nuca larga)
      px(effHeadL - 3, headTop - 4, headW + 6, headH + 2, hairC);
      px(effHeadL - 3, headTop + 4, 5, 18, hairC);
      px(effHeadL + headW - 2, headTop + 4, 5, 18, hairC);
      // Cuello tapado por el pelo
      px(effHeadL + 2, headTop + headH, headW - 4, 6, hairC);
    }
  } else if (isSide) {
    const hw2 = 16;
    px(effHeadL + 3, headTop, hw2, headH, skinC);
    px(effHeadL + hw2 - 1, headTop + 8, 3, 6, skinC);
    px(effHeadL + hw2 + 1, headTop + 10, 4, 3, skinC);
    px(effHeadL + hw2 - 3, headTop + 9, 3, 3, '#222');
    px(effHeadL + hw2 - 2, headTop + 9, 1, 1, '#fff');
    px(effHeadL + 2, headTop, hw2 + 1, 6, hairC);
    if (hairStyle === 1) px(effHeadL + 2, headTop + 6, 4, headH - 6, hairC);
    else if (hairStyle === 2) {
      px(effHeadL + 2, headTop + 6, 4, headH - 4, hairC);
      px(effHeadL + hw2 - 1, headTop + headH, 5, 6, hairC);
    }
  } else {
    // FRONT (4,5,6): cara visible
    px(effHeadL, headTop, headW, headH, skinC);
    const faceStyleR = avatar ? (avatar.faceV || 0) : 0;
    if (faceStyleR === 0) {
      px(effHeadL + 4, headTop + 9, 4, 4, '#222'); px(effHeadL + 14, headTop + 9, 4, 4, '#222');
      px(effHeadL + 5, headTop + 9, 1, 1, '#fff'); px(effHeadL + 15, headTop + 9, 1, 1, '#fff');
    } else if (faceStyleR === 1) {
      px(effHeadL + 4, headTop + 9, 4, 4, '#222'); px(effHeadL + 14, headTop + 9, 4, 4, '#222');
      px(effHeadL + 5, headTop + 9, 1, 1, '#fff'); px(effHeadL + 15, headTop + 9, 1, 1, '#fff');
      px(effHeadL + 6, headTop + 14, 6, 1, '#222');
      px(effHeadL + 5, headTop + 15, 1, 1, '#222'); px(effHeadL + 12, headTop + 15, 1, 1, '#222');
    } else if (faceStyleR === 2) {
      px(effHeadL + 3, headTop + 8, 5, 4, '#333'); px(effHeadL + 13, headTop + 8, 5, 4, '#333');
      px(effHeadL + 4, headTop + 9, 3, 2, '#fff'); px(effHeadL + 14, headTop + 9, 3, 2, '#fff');
      px(effHeadL + 8, headTop + 9, 3, 1, '#333');
    } else {
      px(effHeadL + 4, headTop + 9, 4, 4, '#222'); px(effHeadL + 14, headTop + 9, 4, 4, '#222');
      px(effHeadL + 5, headTop + 9, 1, 1, '#fff'); px(effHeadL + 15, headTop + 9, 1, 1, '#fff');
      px(effHeadL + 3, headTop + 14, 10, 4, adjustColor(skinC, -35));
      px(effHeadL + 2, headTop + 17, 11, 3, adjustColor(skinC, -35));
    }
    if (hairStyle === 0) {
      px(effHeadL, headTop, headW, 7, hairC);
      px(effHeadL, headTop + 7, 4, 4, hairC);
      px(effHeadL + 18, headTop + 7, 4, 4, hairC);
    } else if (hairStyle === 1) {
      px(effHeadL, headTop, headW, 9, hairC);
      px(effHeadL - 3, headTop + 4, 5, 12, hairC);
      px(effHeadL + 20, headTop + 4, 5, 12, hairC);
    } else {
      px(effHeadL - 2, headTop - 4, headW + 4, 10, hairC);
      px(effHeadL - 3, headTop + 4, 5, 16, hairC);
      px(effHeadL + 20, headTop + 4, 5, 16, hairC);
      px(effHeadL, headTop + headH, 6, 8, hairC);
      px(effHeadL + 16, headTop + headH, 6, 8, hairC);
    }
  }

  ctx.restore();
  void effOx;
}

// Cuerpo sentado por datos: la forma de cada pose sale de las poses del catalogo (o de
// DEFAULT_SEAT_POSES). Ver src/config/avatarSeatPoses.js.
function drawSeatedBody(pose, opts) {
  const { ox, oy, px, shirt, dark, pantsC, shoesC, skinC, adjustColor, rawCatalog, furniId } = opts;
  const poseData = readSeatPose({ rawCatalog, furniId, pose });
  const colorCtx = { shirt, dark, pantsC, shoesC, skinC, adjustColor };
  for (const part of poseData.parts) {
    px(ox + part.x, oy + part.y, part.w, part.h, resolveColor(part.color, colorCtx));
  }
  return { headBottomY: poseData.headBottomY, chairOnTop: poseData.chairOnTop };
}

// Pantalon segun pantsV: 0 largo, 1 corto (con botamanga y pierna a la vista), 2 ancho.
function pierna(px, x, y, w, h, estilo, pantsC, skinC, adjustColor) {
  if (estilo === 2) { px(x - 2, y, w + 3, h, pantsC); return; }
  px(x, y, w, h, pantsC);
  if (estilo === 1) {
    px(x - 1, y + h - 8, w + 2, 3, adjustColor(pantsC, 25));
    px(x, y + h - 5, w, 5, skinC);
  }
}

// Zapatos segun shoesV: 0 comunes, 1 zapatillas, 2 botas, 3 puntudos. x es el borde izquierdo del
// pie, y la linea del piso y alto el del pie apoyado (6) o levantado (4).
function zapato(px, x, y, w, alto, estilo, shoesC, adjustColor) {
  if (estilo === 1) { px(x, y - alto - 1, w + 1, alto + 1, shoesC); px(x + 1, y - alto - 2, w - 3, 2, adjustColor(shoesC, 30)); return; }
  if (estilo === 2) { px(x + 1, y - 14, w - 1, 14, shoesC); px(x + 2, y - 15, w - 4, 3, adjustColor(shoesC, 25)); return; }
  if (estilo === 3) { px(x + 2, y - alto, w + 3, alto, shoesC); px(x + w + 3, y - 2, 3, 2, adjustColor(shoesC, -25)); return; }
  px(x, y - alto, w, alto, shoesC);
}

function coloresDe(p, colors, adjustColor) {
  const a = p.avatar || {};
  const shirt = p.color || colors.shirt[a.shirtC || 0] || '#7c5cbf';
  return {
    shirt,
    dark: adjustColor(shirt, -40),
    skinC: colors.face[a.faceC || 0] || '#f2c38a',
    pantsC: colors.pants[a.pantsC || 0] || '#1a1a2e',
    shoesC: colors.shoes[a.shoesC || 0] || '#111111',
  };
}

// p: { px, py, dir, caminando, fase, cabeza (0..7 o null), avatar, color, lata, sorbo,
//      sentado: null | { tx, ty, d, ox, oy, mueble } }
// deps: { ctx, tileToScreen, adjustColor, colors, px, rawCatalog, puntoPuerta (o null) }
export function drawPixelCharRuntime(p, deps) {
  const { ctx, tileToScreen, adjustColor, colors, px, rawCatalog, puntoPuerta } = deps;
  const { shirt, dark, skinC, pantsC, shoesC } = coloresDe(p, colors, adjustColor);

  // ── SENTADO ─────────────────────────────────────────────────────────────
  if (p.sentado) {
    const s = p.sentado;
    const { x: sx, y: sy } = tileToScreen(s.tx, s.ty);
    const bodyDir = s.d ?? 4;
    const pose = bodyDirToSittingPose(bodyDir);
    const tune = readPoseOffset({ rawCatalog, furniId: s.mueble || null, pose });
    const feetX = Math.round(sx + (s.ox ?? 0) + tune.dx);
    const feetY = Math.round(sy + (s.oy ?? -8) + tune.dy);
    const headDir = clampHeadDir(p.cabeza ?? bodyDir, bodyDir);

    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath(); ctx.ellipse(feetX, feetY + 2, 18, 6, 0, 0, Math.PI * 2); ctx.fill();

    const body = drawSeatedBody(pose, {
      ox: feetX, oy: feetY, px, shirt, dark, pantsC, shoesC, skinC, adjustColor,
      rawCatalog, furniId: s.mueble || null,
    });
    const headW = 22, headH = 22;
    const headBottomAbs = feetY + body.headBottomY;
    const headTop = headBottomAbs - headH - 2;
    const headL = feetX - Math.round(headW / 2);
    drawHead(ctx, { headDir, avatar: p.avatar, colors, headL, headTop, headW, headH, ox: feetX, px, adjustColor });
    const regions = [
      { x1: feetX - headW / 2, y1: headTop, x2: feetX + headW / 2, y2: headTop + headH },
      { x1: feetX - 12, y1: headBottomAbs, x2: feetX + 12, y2: headBottomAbs + 26 },
    ];
    return { sx: feetX, sy: feetY, headSy: headTop - 32, regions };
  }

  // ── PARADO ──────────────────────────────────────────────────────────────
  const { x, y } = puntoPuerta || tileToScreen(p.px, p.py);
  const feetX = Math.round(x);
  const feetY = Math.round(y);
  const a = p.avatar || {};
  const pantsV = a.pantsV || 0, shoesV = a.shoesV || 0;

  const walking = !!p.caminando;
  const legAlt = walking ? (Math.sin(p.fase || 0) > 0 ? 1 : 0) : 0;
  const bob = walking ? Math.round(Math.sin(p.fase || 0) * 1.5) : 0;
  const bodyDir = p.dir ?? 4;
  const headDir = clampHeadDir(p.cabeza ?? bodyDir, bodyDir);

  const isSide = (bodyDir === 3 || bodyDir === 7);
  const facingRight = (bodyDir === 0 || bodyDir === 6 || bodyDir === 7 || bodyDir === 5);
  const flip = !facingRight;

  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.ellipse(feetX, feetY + 3, 20, 7, 0, 0, Math.PI * 2); ctx.fill();

  ctx.save();
  if (flip) ctx.scale(-1, 1);
  const ox = flip ? -feetX : feetX;
  const oy = feetY;
  const zap = (zx, zw, alto) => zapato(px, zx, oy, zw, alto, shoesV, shoesC, adjustColor);

  // Zapatos primero (como en la vista previa: el pantalon los tapa arriba)
  if (isSide) {
    if (legAlt) { zap(ox - 4, 12, 6); zap(ox - 10, 8, 4); } else { zap(ox - 10, 8, 6); zap(ox - 4, 12, 4); }
  } else {
    if (legAlt) { zap(ox - 14, 10, 6); zap(ox + 2, 10, 4); } else { zap(ox - 14, 10, 4); zap(ox + 2, 10, 6); }
  }

  const legH = 26;
  const legTop = oy - 6 - legH + bob;
  const pie = (lx, ly, lw, lh) => pierna(px, lx, ly, lw, lh, pantsV, pantsC, skinC, adjustColor);
  if (isSide) {
    if (legAlt) { pie(ox - 8, legTop, 10, legH); pie(ox - 14, legTop + 4, 8, legH - 4); }
    else { pie(ox - 14, legTop, 8, legH); pie(ox - 8, legTop + 4, 10, legH - 4); }
  } else {
    if (legAlt) { pie(ox - 12, legTop, 8, legH); pie(ox + 3, legTop + 4, 8, legH - 4); }
    else { pie(ox - 12, legTop + 4, 8, legH - 4); pie(ox + 3, legTop, 8, legH); }
  }
  // Las botas van arriba del pantalon (si no, quedan tapadas)
  if (shoesV === 2) {
    if (isSide) { zap(ox - 10, 8, 6); zap(ox - 4, 12, 6); } else { zap(ox - 14, 10, 6); zap(ox + 2, 10, 6); }
  }

  const torsoH = 26;
  const torsoTop = legTop - torsoH;
  const shirtStyleR = a.shirtV || 0;
  if (isSide) {
    if (shirtStyleR === 1) {
      px(ox - 7, torsoTop, 14, torsoH, shirt); px(ox - 7, torsoTop, 14, 2, dark);
    } else if (shirtStyleR === 2) {
      px(ox - 11, torsoTop, 22, torsoH, shirt); px(ox - 11, torsoTop, 22, 2, dark); px(ox - 2, torsoTop - 3, 6, 4, adjustColor(shirt, -15)); px(ox - 11, torsoTop + torsoH - 6, 22, 2, adjustColor(shirt, -20));
    } else if (shirtStyleR === 3) {
      px(ox - 10, torsoTop, 20, torsoH, shirt); px(ox - 10, torsoTop, 20, 4, adjustColor(shirt, 35)); px(ox - 10, torsoTop + 8, 20, 4, adjustColor(shirt, 35)); px(ox - 10, torsoTop + 16, 20, 4, adjustColor(shirt, 35)); px(ox - 10, torsoTop, 20, 2, dark);
    } else {
      px(ox - 10, torsoTop, 20, torsoH, shirt); px(ox - 10, torsoTop, 20, 2, dark); px(ox - 6, torsoTop + 4, 10, torsoH - 8, adjustColor(shirt, 18));
    }
  } else {
    if (shirtStyleR === 1) {
      px(ox - 9, torsoTop, 18, torsoH, shirt); px(ox - 9, torsoTop, 18, 2, dark); px(ox - 4, torsoTop + 4, 8, torsoH - 8, adjustColor(shirt, 18));
    } else if (shirtStyleR === 2) {
      px(ox - 13, torsoTop, 26, torsoH, shirt); px(ox - 13, torsoTop, 26, 2, dark); px(ox - 3, torsoTop - 4, 6, 5, adjustColor(shirt, -15)); px(ox - 13, torsoTop + torsoH - 6, 26, 2, adjustColor(shirt, -20));
    } else if (shirtStyleR === 3) {
      px(ox - 12, torsoTop, 24, torsoH, shirt); px(ox - 12, torsoTop, 24, 4, adjustColor(shirt, 35)); px(ox - 12, torsoTop + 8, 24, 4, adjustColor(shirt, 35)); px(ox - 12, torsoTop + 16, 24, 4, adjustColor(shirt, 35)); px(ox - 12, torsoTop, 24, 2, dark);
    } else {
      px(ox - 12, torsoTop, 24, torsoH, shirt); px(ox - 12, torsoTop, 24, 2, dark); px(ox - 4, torsoTop + 4, 8, torsoH - 8, adjustColor(shirt, 18));
    }
  }

  const armH = 20;
  const armTop = torsoTop + 2;
  const hasLata = !!p.lata;
  const isSipping = hasLata && !!p.sorbo;
  if (isSide) {
    px(ox - 14, armTop, 5, armH, dark);
    if (isSipping) {
      px(ox + 3, armTop - 8, 5, armH, dark); px(ox + 8, armTop - 10, 5, 9, '#e33'); px(ox + 8, armTop - 12, 5, 3, '#aaa'); px(ox + 9, armTop - 14, 3, 3, '#888');
    } else {
      px(ox + 3, armTop + (legAlt ? 2 : 0), 5, armH, dark);
      if (hasLata) { px(ox + 5, armTop + armH - 8, 5, 8, '#e33'); px(ox + 5, armTop + armH - 10, 5, 3, '#aaa'); }
    }
    px(ox - 14, armTop + armH - 5, 5, 5, skinC); px(ox + 3, armTop + armH - 5, 5, 5, skinC);
  } else {
    if (isSipping) {
      px(ox - 17, armTop + 2, 5, armH - 2, dark); px(ox + 12, armTop - 8, 5, armH, dark); px(ox - 17, armTop + armH - 3, 5, 5, skinC); px(ox + 12, armTop - 3, 5, 5, skinC); px(ox + 17, armTop - 10, 5, 9, '#e33'); px(ox + 17, armTop - 12, 5, 3, '#aaa'); px(ox + 18, armTop - 14, 3, 3, '#888');
    } else if (legAlt) {
      px(ox - 17, armTop, 5, armH, dark); px(ox + 12, armTop + 2, 5, armH - 2, dark); px(ox - 17, armTop + armH - 5, 5, 5, skinC); px(ox + 12, armTop + armH - 5, 5, 5, skinC);
    } else {
      px(ox - 17, armTop + 2, 5, armH - 2, dark); px(ox + 12, armTop, 5, armH, dark); px(ox - 17, armTop + armH - 5, 5, 5, skinC); px(ox + 12, armTop + armH - 5, 5, 5, skinC);
    }
    if (hasLata && !isSipping) { px(ox + 14, armTop + armH - 8, 5, 8, '#e33'); px(ox + 14, armTop + armH - 10, 5, 3, '#aaa'); }
  }

  const headW = 22;
  const headH = 22;
  const headTop = torsoTop - headH - 2 + bob;
  px(ox - 4, torsoTop - 3 + bob, 8, 5, skinC);
  ctx.restore();

  // La cabeza va fuera del espejo del cuerpo: tiene su propia direccion.
  drawHead(ctx, { headDir, avatar: p.avatar, colors, headL: feetX - Math.round(headW / 2), headTop, headW, headH, ox: feetX, px, adjustColor });

  const regions = [
    { x1: feetX - headW / 2, y1: headTop, x2: feetX + headW / 2, y2: headTop + headH },
    { x1: feetX - 12, y1: torsoTop, x2: feetX + 12, y2: torsoTop + torsoH },
    { x1: feetX - 12, y1: torsoTop + torsoH, x2: feetX + 12, y2: feetY },
    { x1: feetX - 17, y1: armTop, x2: feetX - 12, y2: armTop + armH },
    { x1: feetX + 12, y1: armTop, x2: feetX + 17, y2: armTop + armH },
  ];
  return { sx: feetX, sy: feetY, headSy: headTop - 32, regions };
}
