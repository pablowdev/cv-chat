function createTileToScreen({ canvasWidth, roomW, roomH, tileW, tileH, offsetY = 170 }) {
  const ox = canvasWidth / 2 - (roomW - roomH) * (tileW / 4);
  const oy = offsetY;
  return function tileToScreen(tx, ty) {
    return { x: ox + (tx - ty) * (tileW / 2), y: oy + (tx + ty) * (tileH / 2) };
  };
}

export function tileToScreenPoint({ tx, ty, canvasWidth, roomW, roomH, tileW, tileH, offsetY = 170 }) {
  return createTileToScreen({ canvasWidth, roomW, roomH, tileW, tileH, offsetY })(tx, ty);
}

export function screenToTilePoint({ sx, sy, canvasWidth, roomW, roomH, tileW, tileH, offsetY = 170 }) {
  const ox = canvasWidth / 2 - (roomW - roomH) * (tileW / 4);
  const oy = offsetY;
  const relX = sx - ox;
  const relY = sy - oy;
  const tx = Math.floor((relX / (tileW / 2) + relY / (tileH / 2)) / 2 + 0.00001);
  const ty = Math.floor((relY / (tileH / 2) - relX / (tileW / 2)) / 2 + 0.00001);
  return { tx, ty };
}

export function diamondCornerFromScreen(x, y, hw, hh, which) {
  if(which === 'top') return { x, y: y - hh };
  if(which === 'right') return { x: x + hw, y };
  if(which === 'bottom') return { x, y: y + hh };
  return { x: x - hw, y };
}

export function drawDiamondPathCtx(ctx2, x, y, hw, hh) {
  ctx2.beginPath();
  ctx2.moveTo(x, y - hh);
  ctx2.lineTo(x + hw, y);
  ctx2.lineTo(x, y + hh);
  ctx2.lineTo(x - hw, y);
  ctx2.closePath();
}

export function appendDiamondPathCtx(ctx2, x, y, hw, hh) {
  ctx2.moveTo(x, y - hh);
  ctx2.lineTo(x + hw, y);
  ctx2.lineTo(x, y + hh);
  ctx2.lineTo(x - hw, y);
  ctx2.closePath();
}
