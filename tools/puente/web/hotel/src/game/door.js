export function getDoorGeometry({
  wallH,
  tileW,
  tileH,
  tileToScreen,
  isLShapeLayout,
  isHexRoomLayout,
  getLShapeDoorTile,
  getHexDoorTile,
  getDoorTy,
}) {
  const dH = wallH * 0.74;

  if(isLShapeLayout()) {
    const { tx, ty } = getLShapeDoorTile();
    const p = tileToScreen(tx, ty);
    const p2 = tileToScreen(tx, ty + 1);
    const bL = { x: p.x - tileW / 2, y: p.y };
    const bR = { x: p2.x - tileW / 2, y: p2.y };
    return { bL, bR, tL: { x: bL.x, y: bL.y - dH }, tR: { x: bR.x, y: bR.y - dH } };
  }

  if(isHexRoomLayout()) {
    const { tx, ty } = getHexDoorTile();
    const p = tileToScreen(tx, ty);
    const bL = { x: p.x, y: p.y - tileH / 2 };
    const bR = { x: p.x - tileW / 2, y: p.y };
    return { bL, bR, tL: { x: bL.x, y: bL.y - dH }, tR: { x: bR.x, y: bR.y - dH } };
  }

  const doorTy = getDoorTy();
  const p = tileToScreen(0, doorTy);
  const bL = { x: p.x, y: p.y - tileH / 2 };
  const bR = { x: p.x - tileW / 2, y: p.y };
  return { bL, bR, tL: { x: bL.x, y: bL.y - dH }, tR: { x: bR.x, y: bR.y - dH } };
}

export function drawDoor(ctx, geometry) {
  if(!geometry) return;
  const { bL, bR, tL, tR } = geometry;
  ctx.fillStyle = '#050505';
  ctx.beginPath();
  ctx.moveTo(bL.x, bL.y);
  ctx.lineTo(bR.x, bR.y);
  ctx.lineTo(tR.x, tR.y);
  ctx.lineTo(tL.x, tL.y);
  ctx.closePath();
  ctx.fill();
}
