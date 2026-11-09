// Geometria de pantalla de la sala (toques sobre baldosas y paredes, contorno). Sale de PawHotel.
import { tileExistsInRoom, getLayoutState, getDoorTyForRoom, isHexRoom, isLShapeRoom, getLShapeDoorTile as getLShapeDoorTileBase, getHexDoorTileForRoom, getDoorSpawnForRoom, isDoorPlayerAtSpawn } from './rooms.js';
import { bfsPath as bfsPathBase, createIsBlocked } from './pathfinding.js';
import { tileToScreenPoint, screenToTilePoint } from './iso.js';
import { getDoorGeometry, drawDoor as drawDoorBase } from './door.js';

export function tileExists(tx, ty, roomW, roomH, roomMask) {
  return tileExistsInRoom(tx, ty, roomW, roomH, roomMask);
}

export function applyLayout(layoutId, roomLayouts, setRoomState) {
  const next = getLayoutState(roomLayouts, layoutId, 'small');
  setRoomState(next);
}

export function getDoorTy(roomW, tileExistsFn) {
  return getDoorTyForRoom(roomW, tileExistsFn);
}

export function isHexRoomLayout(roomW, roomH, roomMask, isLShapeLayoutFn) {
  return isHexRoom(roomW, roomH, roomMask, isLShapeLayoutFn);
}

export function isLShapeLayout(roomW, roomH, roomMask, tileExistsFn) {
  return isLShapeRoom(roomW, roomH, roomMask, tileExistsFn);
}

export function getLShapeDoorTile() {
  return getLShapeDoorTileBase();
}

export function getHexDoorTile(roomW, roomH, tileExistsFn, getDoorTyFn) {
  return getHexDoorTileForRoom(roomW, roomH, tileExistsFn, getDoorTyFn);
}

export function getDoorSpawn(deps) {
  return getDoorSpawnForRoom(deps);
}

export function isDoorPlayer(player, spawn) {
  return isDoorPlayerAtSpawn(player, spawn);
}

export function tileToScreen(tx, ty, deps) {
  const { canvasWidth, roomW, roomH, tileW, tileH, offsetY } = deps;
  return tileToScreenPoint({ tx, ty, canvasWidth, roomW, roomH, tileW, tileH, offsetY });
}

export function screenToTile(sx, sy, deps) {
  const { canvasWidth, roomW, roomH, tileW, tileH, offsetY } = deps;
  return screenToTilePoint({ sx, sy, canvasWidth, roomW, roomH, tileW, tileH, offsetY });
}

export function pointInDiamondScreen(sx, sy, tx, ty, deps) {
  const { tileToScreenFn, tileW, tileH } = deps;
  const { x, y } = tileToScreenFn(tx, ty);
  const hw = tileW / 2;
  const hh = tileH / 2;
  // Exact diamond hit test - no epsilon to avoid overlap between adjacent tiles
  return (Math.abs(sx - x) / hw) + (Math.abs(sy - y) / hh) <= 1;
}

export function pickVisibleFloorTileAtScreen(sx, sy, deps) {
  const { roomW, roomH, tileExistsFn, pointInDiamondScreenFn } = deps;
  for (let sum = roomW + roomH - 2; sum >= 0; sum--) {
    for (let tx = roomW - 1; tx >= 0; tx--) {
      const ty = sum - tx;
      if (!tileExistsFn(tx, ty)) continue;
      if (pointInDiamondScreenFn(sx, sy, tx, ty)) return { tx, ty };
    }
  }
  return null;
}

export function isBlocked(furnitureMap, walkableFurniTypes, normalizeFurniType, furnitureFlipped, secondaryTilesMap) {
  return createIsBlocked({ furnitureMap, walkableFurniTypes, normalizeFurniType, furnitureFlipped, secondaryTilesMap });
}

export function bfsPath(sx, sy, ex, ey, tileExistsFn, isBlockedFn, occupiedTiles, walkableTileOverride) {
  return bfsPathBase({ startX: sx, startY: sy, endX: ex, endY: ey, tileExists: tileExistsFn, isBlocked: isBlockedFn, occupiedTiles, walkableTileOverride });
}

export function doorGeometry(deps) {
  return getDoorGeometry(deps);
}

export function drawDoor(ctx, geometry) {
  return drawDoorBase(ctx, geometry);
}

export function hitTestWall(sx, sy, deps) {
  const { wallH, tileW, tileH, roomW, roomH, tileExistsFn, tileToScreenFn } = deps;
  const hw = tileW / 2;
  const hh = tileH / 2;
  function pointInPoly(px, py, pts) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
      if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }
  for (let tx = 0; tx < roomW; tx++) for (let ty = 0; ty < roomH; ty++) {
    if (!tileExistsFn(tx, ty) || tileExistsFn(tx, ty - 1)) continue;
    const p = tileToScreenFn(tx, ty);
    const wallPts = [
      [p.x - hw, p.y], [p.x, p.y - hh], [p.x + hw, p.y],
      [p.x + hw, p.y - wallH], [p.x, p.y - hh - wallH], [p.x - hw, p.y - wallH],
    ];
    if (pointInPoly(sx, sy, wallPts)) {
      const ox = Math.round(((sx - (p.x - hw)) / tileW) * 100);
      const oy = Math.round(((p.y - sy) / wallH) * 100);
      return { side: 'north', tx, ty, ox: Math.max(0, Math.min(100, ox)), oy: Math.max(0, Math.min(100, oy)), anchorX: p.x - hw, anchorY: p.y };
    }
  }
  for (let tx = 0; tx < roomW; tx++) for (let ty = 0; ty < roomH; ty++) {
    if (!tileExistsFn(tx, ty) || tileExistsFn(tx - 1, ty)) continue;
    const p = tileToScreenFn(tx, ty);
    const wallPts = [[p.x - hw, p.y], [p.x, p.y - hh], [p.x, p.y - hh - wallH], [p.x - hw, p.y - wallH]];
    if (pointInPoly(sx, sy, wallPts)) {
      const ox = Math.round(((sx - (p.x - hw)) / hw) * 100);
      const oy = Math.round(((p.y - sy) / wallH) * 100);
      return { side: 'west', tx, ty, ox: Math.max(0, Math.min(100, ox)), oy: Math.max(0, Math.min(100, oy)), anchorX: p.x - hw, anchorY: p.y };
    }
  }
  return null;
}

export function drawIsoBrickFloor(ctx, tileToScreenFn, tileExistsFn, roomW, roomH, tileW, tileH, theme, drawIsoBrickFloorGeneric) {
  drawIsoBrickFloorGeneric(ctx, tileToScreenFn, tileExistsFn, roomW, roomH, tileW / 2, tileH / 2, theme);
}

export function drawFloorHoverOutline(ctx, tile, deps) {
  const { tileExistsFn, tileToScreenFn, tileW, tileH, alpha, drawDiamondPathCtx } = deps;
  if (!tile || !tileExistsFn(tile.tx, tile.ty)) return;
  const { x, y } = tileToScreenFn(tile.tx, tile.ty);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = '#e0b400';
  ctx.lineWidth = 2;
  drawDiamondPathCtx(ctx, x, y, tileW / 2, tileH / 2);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255, 244, 170, 0.98)';
  ctx.lineWidth = 0.8;
  drawDiamondPathCtx(ctx, x, y, tileW / 2 - 1.5, tileH / 2 - 1);
  ctx.stroke();
  ctx.restore();
}

export function drawWallFurnis(furnitureMap, isWallFurniKey, furnitureMoveMode, selectedFurnitureKey, placingFromInventory, wallH, drawWallFurniKey) {
  for (const [key, type] of Object.entries(furnitureMap)) {
    if (!isWallFurniKey(key)) continue;
    const alpha = (!placingFromInventory && furnitureMoveMode && key === selectedFurnitureKey) ? 0.28 : 1;
    drawWallFurniKey(key, type, wallH, alpha);
  }
}
