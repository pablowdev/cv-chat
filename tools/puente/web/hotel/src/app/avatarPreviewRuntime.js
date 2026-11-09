// Vista previa del muñeco (creador y fichas). Sale de PawHotel tal cual.
export function drawCharPreviewRuntime(tCtx, feetX, feetY, cfg, deps) {
  const { colors, adjustColor } = deps;
  const shirt = colors.shirt[cfg.shirtC || 0] || '#7c5cbf';
  const dark = adjustColor(shirt, -40);
  const skinC = colors.face[cfg.faceC || 0] || '#f2c38a';
  const hairC = colors.hair[cfg.hairC || 0] || '#2b2b2b';
  const pantsC = colors.pants[cfg.pantsC || 0] || '#1a1a2e';
  const shoesC = colors.shoes[cfg.shoesC || 0] || '#111111';
  const pxp = (x, y, w, h, c) => { tCtx.fillStyle = c; tCtx.fillRect(x, y, w, h); };

  tCtx.fillStyle = 'rgba(0,0,0,0.25)';
  tCtx.beginPath(); tCtx.ellipse(feetX, feetY + 3, 20, 7, 0, 0, Math.PI * 2); tCtx.fill();

  const shoeStyle = cfg.shoesV || 0;
  if (shoeStyle === 0) { pxp(feetX - 14, feetY - 6, 10, 6, shoesC); pxp(feetX + 2, feetY - 4, 10, 4, shoesC); }
  else if (shoeStyle === 1) { pxp(feetX - 14, feetY - 6, 11, 7, shoesC); pxp(feetX + 2, feetY - 6, 11, 7, shoesC); pxp(feetX - 13, feetY - 7, 7, 2, adjustColor(shoesC, 30)); pxp(feetX + 3, feetY - 7, 7, 2, adjustColor(shoesC, 30)); }
  else if (shoeStyle === 2) { pxp(feetX - 14, feetY - 14, 9, 14, shoesC); pxp(feetX + 3, feetY - 14, 9, 14, shoesC); pxp(feetX - 12, feetY - 15, 6, 3, adjustColor(shoesC, 25)); pxp(feetX + 5, feetY - 15, 6, 3, adjustColor(shoesC, 25)); }
  else { pxp(feetX - 12, feetY - 6, 14, 5, shoesC); pxp(feetX + 4, feetY - 4, 14, 3, shoesC); pxp(feetX + 14, feetY - 5, 3, 2, adjustColor(shoesC, -25)); }

  const legH = 26, legTop = feetY - 6 - legH;
  const pantsStyle = cfg.pantsV || 0;
  if (pantsStyle === 0) {
    pxp(feetX - 12, legTop, 8, legH, pantsC); pxp(feetX + 3, legTop, 8, legH, pantsC);
  } else if (pantsStyle === 1) {
    pxp(feetX - 12, legTop, 8, legH, pantsC); pxp(feetX + 3, legTop, 8, legH, pantsC);
    pxp(feetX - 14, legTop + legH - 8, 12, 3, adjustColor(pantsC, 25)); pxp(feetX + 1, legTop + legH - 8, 12, 3, adjustColor(pantsC, 25));
    pxp(feetX - 12, legTop + legH - 5, 8, 5, skinC); pxp(feetX + 3, legTop + legH - 5, 8, 5, skinC);
  } else {
    pxp(feetX - 14, legTop, 11, legH, pantsC); pxp(feetX + 2, legTop, 11, legH, pantsC);
  }

  const torsoH = 26, torsoTop = legTop - torsoH;
  const shirtStyle = cfg.shirtV || 0;
  if (shirtStyle === 0) {
    pxp(feetX - 12, torsoTop, 24, torsoH, shirt); pxp(feetX - 12, torsoTop, 24, 3, dark);
    pxp(feetX - 4, torsoTop + 4, 8, torsoH - 8, adjustColor(shirt, 18));
  } else if (shirtStyle === 1) {
    pxp(feetX - 9, torsoTop, 18, torsoH, shirt); pxp(feetX - 9, torsoTop, 18, 3, dark);
    pxp(feetX - 4, torsoTop + 4, 8, torsoH - 8, adjustColor(shirt, 18));
  } else if (shirtStyle === 2) {
    pxp(feetX - 13, torsoTop, 26, torsoH, shirt); pxp(feetX - 13, torsoTop, 26, 3, dark);
    pxp(feetX - 3, torsoTop - 5, 6, 6, adjustColor(shirt, -15));
    pxp(feetX - 13, torsoTop + torsoH - 6, 26, 2, adjustColor(shirt, -20));
  } else {
    pxp(feetX - 12, torsoTop, 24, torsoH, shirt);
    pxp(feetX - 12, torsoTop, 24, 4, adjustColor(shirt, 35));
    pxp(feetX - 12, torsoTop + 8, 24, 4, adjustColor(shirt, 35));
    pxp(feetX - 12, torsoTop + 16, 24, 4, adjustColor(shirt, 35));
    pxp(feetX - 12, torsoTop, 24, 3, dark);
  }

  pxp(feetX - 17, torsoTop + 17, 5, 5, skinC); pxp(feetX + 12, torsoTop + 17, 5, 5, skinC);
  const headW = 22, headH = 22, headTop = torsoTop - headH - 2;
  const headL = feetX - Math.round(headW / 2);
  pxp(feetX - 4, torsoTop - 3, 8, 5, skinC);
  pxp(headL, headTop, headW, headH, skinC);

  const faceStyle = cfg.faceV || 0;
  if (faceStyle === 0) {
    pxp(headL + 4, headTop + 9, 4, 4, '#222'); pxp(headL + 14, headTop + 9, 4, 4, '#222');
    pxp(headL + 5, headTop + 9, 1, 1, '#fff'); pxp(headL + 15, headTop + 9, 1, 1, '#fff');
  } else if (faceStyle === 1) {
    pxp(headL + 4, headTop + 9, 4, 4, '#222'); pxp(headL + 14, headTop + 9, 4, 4, '#222');
    pxp(headL + 5, headTop + 9, 1, 1, '#fff'); pxp(headL + 15, headTop + 9, 1, 1, '#fff');
    pxp(headL + 6, headTop + 14, 6, 1, '#222'); pxp(headL + 5, headTop + 15, 1, 1, '#222'); pxp(headL + 12, headTop + 15, 1, 1, '#222');
  } else if (faceStyle === 2) {
    pxp(headL + 3, headTop + 8, 5, 4, '#333'); pxp(headL + 13, headTop + 8, 5, 4, '#333');
    pxp(headL + 4, headTop + 9, 3, 2, '#fff'); pxp(headL + 14, headTop + 9, 3, 2, '#fff');
    pxp(headL + 8, headTop + 9, 3, 1, '#333');
  } else {
    pxp(headL + 4, headTop + 9, 4, 4, '#222'); pxp(headL + 14, headTop + 9, 4, 4, '#222');
    pxp(headL + 5, headTop + 9, 1, 1, '#fff'); pxp(headL + 15, headTop + 9, 1, 1, '#fff');
    pxp(headL + 3, headTop + 14, 10, 4, adjustColor(skinC, -35));
    pxp(headL + 2, headTop + 17, 11, 3, adjustColor(skinC, -35));
  }

  const hairStyle = cfg.hairV || 0;
  if (hairStyle === 0) {
    pxp(headL, headTop, headW, 7, hairC); pxp(headL, headTop + 7, 4, 4, hairC); pxp(headL + 18, headTop + 7, 4, 4, hairC);
  } else if (hairStyle === 1) {
    pxp(headL, headTop, headW, 9, hairC); pxp(headL - 3, headTop + 4, 5, 12, hairC); pxp(headL + 20, headTop + 4, 5, 12, hairC);
  } else {
    pxp(headL - 2, headTop - 4, headW + 4, 10, hairC); pxp(headL - 3, headTop + 4, 5, 16, hairC);
    pxp(headL + 20, headTop + 4, 5, 16, hairC); pxp(headL, headTop + headH, 6, 8, hairC); pxp(headL + 16, headTop + headH, 6, 8, hairC);
  }
}
