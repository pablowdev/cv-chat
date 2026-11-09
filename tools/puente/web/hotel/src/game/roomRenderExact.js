// Dibujo de la sala: pisos, paredes, zocalo y patrones de decoracion. Sale del renderer de
// PawHotel tal cual (solo cambian los comentarios y se saco renderRoomExact, que no se usa).

import { drawDiamondPathCtx, appendDiamondPathCtx } from './iso.js';
import { adjustColor } from './draw.js';


// ── Normalize functions  ──
export function normalizeFloorPatternId(id){
  const v = String(id || '').trim().toLowerCase();
  if(!v) return 'solid';
  if(['iso_brick','tablones','planks','wood_planks','madera'].includes(v)) return 'iso_brick';
  if(['tile_sm','mosaico_fino','mosaic_small'].includes(v)) return 'tile_sm';
  if(['parquet','espiga','herringbone'].includes(v)) return 'parquet';
  if(['brick_floor','ladrillo_chico','small_brick'].includes(v)) return 'brick_floor';
  if(['stripe_h','rayas_h','rayas'].includes(v)) return 'stripe_h';
  return v;
}

export function normalizeWallPatternId(id){
  const v = String(id || '').trim().toLowerCase();
  if(!v) return 'plain';
  if(['brick','ladrillo'].includes(v)) return 'brick';
  if(['brick_sm','ladrillo_fino','ladrillo chico'].includes(v)) return 'brick_sm';
  if(['stripe','rayas'].includes(v)) return 'stripe';
  if(['panel'].includes(v)) return 'panel';
  if(['diamond','rombos'].includes(v)) return 'diamond';
  return v;
}

// ── drawWallPatIso  ──
export function drawWallPatIso(ctx2, ax, ay, bx, by, h, pat, baseHex){
  const dark  = adjustColor(baseHex,-38);
  const light = adjustColor(baseHex, 12);
  const mid   = adjustColor(baseHex, 4);

  const dx = bx - ax, dy = by - ay;
  const segLen = Math.sqrt(dx*dx + dy*dy) || 1;
  const ux = dx/segLen, uy = dy/segLen;
  const upX = 0, upY = -1;

  if(pat==='brick' || pat==='brick_sm'){
    const bh = pat==='brick' ? 13 : 8;
    const bw = pat==='brick' ? 25 : 14;

    // Base face
    ctx2.fillStyle = baseHex;
    ctx2.beginPath();
    ctx2.moveTo(ax, ay-h); ctx2.lineTo(bx, by-h);
    ctx2.lineTo(bx, by); ctx2.lineTo(ax, ay);
    ctx2.closePath();
    ctx2.fill();

    // Horizontal mortar lines
    const rows = Math.ceil(h / bh) + 1;
    ctx2.strokeStyle = dark;
    ctx2.lineWidth = 1.1;
    for(let row=0; row<=rows; row++){
      const y = row * bh + 0.5;
      const p0x = ax + upX*y, p0y = ay + upY*y;
      const p1x = bx + upX*y, p1y = by + upY*y;
      ctx2.beginPath();
      ctx2.moveTo(p0x, p0y);
      ctx2.lineTo(p1x, p1y);
      ctx2.stroke();
    }

    // Vertical mortar joints with alternating offset
    for(let row=0; row<rows; row++){
      const y0 = row * bh;
      const y1 = Math.min(h, (row + 1) * bh);
      const offset = (row % 2) ? bw/2 : 0;
      for(let x=-bw; x<segLen + bw; x += bw){
        const xx = x + offset;
        const p0x = ax + ux*xx + upX*y0, p0y = ay + uy*xx + upY*y0;
        const p1x = ax + ux*xx + upX*y1, p1y = ay + uy*xx + upY*y1;
        ctx2.beginPath();
        ctx2.moveTo(p0x, p0y);
        ctx2.lineTo(p1x, p1y);
        ctx2.stroke();
      }
    }

 // un brillo suave por fila de ladrillos
    ctx2.strokeStyle = light;
    ctx2.lineWidth = 0.45;
    for(let row=0; row<rows; row++){
      const y = row * bh + 1.8;
      const p0x = ax + upX*y, p0y = ay + upY*y;
      const p1x = bx + upX*y, p1y = by + upY*y;
      ctx2.beginPath();
      ctx2.moveTo(p0x, p0y);
      ctx2.lineTo(p1x, p1y);
      ctx2.stroke();
    }

  } else if(pat==='stripe'){
    const sw = 7;
    ctx2.fillStyle = adjustColor(baseHex,-18);
    for(let i=0; i<segLen+sw*2; i+=sw*2){
      const p0x = ax + ux*i, p0y = ay + uy*i;
      const p1x = ax + ux*(i+sw), p1y = ay + uy*(i+sw);
      ctx2.beginPath();
      ctx2.moveTo(p0x, p0y);
      ctx2.lineTo(p1x, p1y);
      ctx2.lineTo(p1x+upX*h, p1y+upY*h);
      ctx2.lineTo(p0x+upX*h, p0y+upY*h);
      ctx2.closePath();
      ctx2.fill();
    }

  } else if(pat==='diamond'){
    ctx2.strokeStyle = adjustColor(baseHex,-35);
    ctx2.lineWidth = 1.25;
    const dw=18, dh=12;
    const rows = Math.ceil(h/dh)+2;
    const cols = Math.ceil(segLen/dw)+2;
    for(let row=-1; row<rows; row++){
      for(let col=-1; col<cols; col++){
        const cx = (col + (row%2)*0.5) * dw;
        const cy = row * dh;
        const wx = ax + ux*cx + upX*(-cy+h/2);
        const wy = ay + uy*cx + upY*(-cy+h/2);
        const hw2 = dw/2, hh2 = dh/2;
        ctx2.beginPath();
        ctx2.moveTo(wx + upX*(-hh2), wy + upY*(-hh2));
        ctx2.lineTo(wx + ux*hw2, wy + uy*hw2);
        ctx2.lineTo(wx + upX*(hh2), wy + upY*(hh2));
        ctx2.lineTo(wx - ux*hw2, wy - uy*hw2);
        ctx2.closePath();
        ctx2.stroke();
      }
    }
  }
}

// ── drawFloorTileGeneric  ──
export function drawFloorTileGeneric(ctx2, tileToScreenFn, tx, ty, theme, hw, hh){
  const {x,y} = tileToScreenFn(tx,ty);
  const pat = normalizeFloorPatternId(theme._floorPattern || 'checker');
  const fa = theme.floorA, fb = theme.floorB || adjustColor(fa,-18);
  const dark = adjustColor(fa,-40);
  const light = adjustColor(fa, 14);

  function diamond(){ drawDiamondPathCtx(ctx2, x, y, hw, hh); }

  if(pat==='solid'){
    diamond(); ctx2.fillStyle=fa; ctx2.fill();
    ctx2.strokeStyle='rgba(255,255,255,0.06)'; ctx2.lineWidth=1; ctx2.stroke();

  } else if(pat==='checker'){
    diamond(); ctx2.fillStyle=((tx+ty)%2===0)?fa:fb; ctx2.fill();
    ctx2.strokeStyle='rgba(255,255,255,0.06)'; ctx2.lineWidth=1; ctx2.stroke();

  } else if(pat==='tile'){
    diamond(); ctx2.fillStyle=fa; ctx2.fill();
    ctx2.strokeStyle=dark; ctx2.lineWidth=2.6; ctx2.stroke();
    ctx2.strokeStyle=light; ctx2.lineWidth=0.7; ctx2.stroke();

  } else if(pat==='tile_sm'){
    diamond(); ctx2.fillStyle=fa; ctx2.fill();
    ctx2.save(); ctx2.clip();
    ctx2.strokeStyle = dark;
    ctx2.lineWidth = 0.95;

    const leftMid = [x - hw*0.52, y];
    const rightMid = [x + hw*0.52, y];
    const topMid = [x, y - hh*0.52];
    const botMid = [x, y + hh*0.52];
    const q1 = [x - hw*0.26, y - hh*0.26];
    const q2 = [x + hw*0.26, y - hh*0.26];
    const q3 = [x + hw*0.26, y + hh*0.26];
    const q4 = [x - hw*0.26, y + hh*0.26];

    ctx2.beginPath(); ctx2.moveTo(leftMid[0],leftMid[1]); ctx2.lineTo(topMid[0],topMid[1]); ctx2.stroke();
    ctx2.beginPath(); ctx2.moveTo(topMid[0],topMid[1]); ctx2.lineTo(rightMid[0],rightMid[1]); ctx2.stroke();
    ctx2.beginPath(); ctx2.moveTo(rightMid[0],rightMid[1]); ctx2.lineTo(botMid[0],botMid[1]); ctx2.stroke();
    ctx2.beginPath(); ctx2.moveTo(botMid[0],botMid[1]); ctx2.lineTo(leftMid[0],leftMid[1]); ctx2.stroke();

    ctx2.beginPath(); ctx2.moveTo(q1[0], q1[1]); ctx2.lineTo(q2[0], q2[1]); ctx2.lineTo(q3[0], q3[1]); ctx2.lineTo(q4[0], q4[1]); ctx2.closePath(); ctx2.stroke();

    ctx2.strokeStyle = light;
    ctx2.lineWidth = 0.35;
    ctx2.beginPath(); ctx2.moveTo(leftMid[0]+2,leftMid[1]); ctx2.lineTo(topMid[0],topMid[1]+1.2); ctx2.stroke();
    ctx2.beginPath(); ctx2.moveTo(topMid[0]+1.2,topMid[1]+1.2); ctx2.lineTo(rightMid[0]-2,rightMid[1]); ctx2.stroke();

    ctx2.restore();
    ctx2.strokeStyle='rgba(0,0,0,0.12)'; ctx2.lineWidth=0.9; ctx2.stroke();

  } else if(pat==='brick_floor'){
    diamond(); ctx2.fillStyle=fa; ctx2.fill();
    ctx2.save(); ctx2.clip();
    ctx2.strokeStyle=dark; ctx2.lineWidth=1.6;
    ctx2.beginPath(); ctx2.moveTo(x-hw,y); ctx2.lineTo(x+hw,y); ctx2.stroke();
    if((tx+ty)%2===0){
      ctx2.beginPath(); ctx2.moveTo(x,y-hh); ctx2.lineTo(x,y); ctx2.stroke();
    } else {
      ctx2.beginPath(); ctx2.moveTo(x,y); ctx2.lineTo(x,y+hh); ctx2.stroke();
    }
    ctx2.restore();
    ctx2.strokeStyle=adjustColor(dark,12); ctx2.lineWidth=0.8; ctx2.stroke();

  } else if(pat==='iso_brick'){
    // this base fill is intentionally plain; the real plank look is painted later
    diamond(); ctx2.fillStyle=fa; ctx2.fill();

  } else if(pat==='stripe_h'){
    diamond(); ctx2.fillStyle=((tx%2)===0)?fa:adjustColor(fa,-18); ctx2.fill();
    ctx2.strokeStyle='rgba(0,0,0,0.07)'; ctx2.lineWidth=1; ctx2.stroke();

  } else if(pat==='stripe_v'){
    diamond(); ctx2.fillStyle=((ty%2)===0)?fa:adjustColor(fa,-18); ctx2.fill();
    ctx2.save(); ctx2.clip();
    ctx2.strokeStyle=adjustColor(fa,-28); ctx2.lineWidth=1.6;
    ctx2.beginPath(); ctx2.moveTo(x-hw,y); ctx2.lineTo(x,y-hh); ctx2.stroke();
    ctx2.beginPath(); ctx2.moveTo(x,y+hh); ctx2.lineTo(x+hw,y); ctx2.stroke();
    ctx2.restore();
    ctx2.strokeStyle='rgba(0,0,0,0.06)'; ctx2.lineWidth=1; ctx2.stroke();

  } else if(pat==='parquet'){
    diamond(); ctx2.fillStyle=fa; ctx2.fill();
    ctx2.save(); ctx2.clip();
    const a = adjustColor(fa, 10), b = adjustColor(fa, -10), seam = adjustColor(fa, -28);

    ctx2.fillStyle = ((tx+ty)%2===0) ? a : b;
    ctx2.beginPath(); ctx2.moveTo(x-hw, y); ctx2.lineTo(x-hw*0.15, y-hh*0.15); ctx2.lineTo(x, y); ctx2.lineTo(x-hw*0.15, y+hh*0.15); ctx2.closePath(); ctx2.fill();

    ctx2.fillStyle = ((tx+ty)%2===0) ? b : a;
    ctx2.beginPath(); ctx2.moveTo(x, y-hh); ctx2.lineTo(x+hw*0.15, y-hh*0.15); ctx2.lineTo(x, y); ctx2.lineTo(x-hw*0.15, y-hh*0.15); ctx2.closePath(); ctx2.fill();

    ctx2.fillStyle = ((tx+ty)%2===0) ? b : a;
    ctx2.beginPath(); ctx2.moveTo(x+hw, y); ctx2.lineTo(x+hw*0.15, y+hh*0.15); ctx2.lineTo(x, y); ctx2.lineTo(x+hw*0.15, y-hh*0.15); ctx2.closePath(); ctx2.fill();

    ctx2.fillStyle = ((tx+ty)%2===0) ? a : b;
    ctx2.beginPath(); ctx2.moveTo(x, y+hh); ctx2.lineTo(x-hw*0.15, y+hh*0.15); ctx2.lineTo(x, y); ctx2.lineTo(x+hw*0.15, y+hh*0.15); ctx2.closePath(); ctx2.fill();

    ctx2.strokeStyle = seam;
    ctx2.lineWidth = 0.85;
    ctx2.beginPath(); ctx2.moveTo(x-hw,y); ctx2.lineTo(x,y-hh); ctx2.lineTo(x+hw,y); ctx2.lineTo(x,y+hh); ctx2.closePath(); ctx2.stroke();
    ctx2.beginPath(); ctx2.moveTo(x-hw*0.15,y-hh*0.15); ctx2.lineTo(x+hw*0.15,y+hh*0.15); ctx2.stroke();
    ctx2.beginPath(); ctx2.moveTo(x+hw*0.15,y-hh*0.15); ctx2.lineTo(x-hw*0.15,y+hh*0.15); ctx2.stroke();

    ctx2.restore();
    ctx2.strokeStyle='rgba(0,0,0,0.08)'; ctx2.lineWidth=0.8; ctx2.stroke();

  } else if(pat==='carpet'){
    diamond(); ctx2.fillStyle=fa; ctx2.fill();
    ctx2.save(); ctx2.clip();
    ctx2.strokeStyle=adjustColor(fa,-10); ctx2.lineWidth=0.35;
    for(let i=-hw; i<=hw; i+=3){
      ctx2.beginPath(); ctx2.moveTo(x+i, y-hh); ctx2.lineTo(x+i+hh*0.45, y+hh); ctx2.stroke();
    }
    ctx2.restore();
    ctx2.strokeStyle=adjustColor(fa,-28); ctx2.lineWidth=0.9; ctx2.stroke();

  } else {
    diamond(); ctx2.fillStyle=fa; ctx2.fill();
    ctx2.strokeStyle='rgba(255,255,255,0.05)'; ctx2.lineWidth=1; ctx2.stroke();
  }
}

// ── drawIsoBrickFloorGeneric  ──
export function drawIsoBrickFloorGeneric(ctx2, tileToScreenFn, tileExistsFn, cols, rows, hw, hh, theme){
  const fillBase = '#f3dfab';
  const fillAlt  = '#ecd89d';
  const grain    = '#e2ca87';
  const seam     = '#d2b66d';
  const hi       = '#fff1c7';
  const skirt    = '#c7ae70';

  const overlay = document.createElement('canvas');
  overlay.width = ctx2.canvas.width;
  overlay.height = ctx2.canvas.height;
  const octx = overlay.getContext('2d');

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for(let tx=0; tx<cols; tx++) for(let ty=0; ty<rows; ty++){
    if(!tileExistsFn(tx,ty)) continue;
    const p = tileToScreenFn(tx,ty);
    minX = Math.min(minX, p.x-hw);
    maxX = Math.max(maxX, p.x+hw);
    minY = Math.min(minY, p.y-hh);
    maxY = Math.max(maxY, p.y+hh);
  }

  octx.save();
  octx.beginPath();
  for(let tx=0; tx<cols; tx++) for(let ty=0; ty<rows; ty++){
    if(!tileExistsFn(tx,ty)) continue;
    const p = tileToScreenFn(tx,ty);
    appendDiamondPathCtx(octx, p.x, p.y, hw, hh);
  }
  octx.clip();

  octx.fillStyle = fillBase;
  octx.fillRect(minX-24, minY-24, (maxX-minX)+48, (maxY-minY)+48);

  // Draw planks on the isometric plane itself.
  const p00 = tileToScreenFn(0, 0);
  const planeToScreen = (u, v) => ({
    x: p00.x + (u - v) * hw,
    y: p00.y + (u + v) * hh,
  });

  const plankW = 0.34;
  const boardLen = 1.18;
  const uStart = -rows - 2;
  const uEnd = cols + 2;
  const vStart = -cols - 2;
  const vEnd = rows + cols + 2;
  const offsetPattern = [0.16, 0.62, 0.34, 0.82];

  for(let u = uStart, row = 0; u <= uEnd; u += plankW, row++){
    const u0 = u;
    const u1 = u + plankW;
    const a = planeToScreen(u0, vStart);
    const b = planeToScreen(u1, vStart);
    const c = planeToScreen(u1, vEnd);
    const d = planeToScreen(u0, vEnd);

    octx.beginPath();
    octx.moveTo(a.x, a.y);
    octx.lineTo(b.x, b.y);
    octx.lineTo(c.x, c.y);
    octx.lineTo(d.x, d.y);
    octx.closePath();
    octx.fillStyle = (row % 2 === 0) ? fillBase : fillAlt;
    octx.fill();

    const leftA = planeToScreen(u0, vStart);
    const leftB = planeToScreen(u0, vEnd);
    octx.strokeStyle = seam;
    octx.lineWidth = 0.95;
    octx.beginPath();
    octx.moveTo(leftA.x, leftA.y);
    octx.lineTo(leftB.x, leftB.y);
    octx.stroke();

    const hiA = planeToScreen(u0 + plankW * 0.08, vStart);
    const hiB = planeToScreen(u0 + plankW * 0.08, vEnd);
    octx.strokeStyle = hi;
    octx.lineWidth = 0.38;
    octx.beginPath();
    octx.moveTo(hiA.x, hiA.y);
    octx.lineTo(hiB.x, hiB.y);
    octx.stroke();

    for(const frac of [0.36, 0.68]){
      const gA = planeToScreen(u0 + plankW * frac, vStart);
      const gB = planeToScreen(u0 + plankW * frac, vEnd);
      octx.strokeStyle = grain;
      octx.lineWidth = 0.26;
      octx.beginPath();
      octx.moveTo(gA.x, gA.y);
      octx.lineTo(gB.x, gB.y);
      octx.stroke();
    }

    const offset = boardLen * offsetPattern[row % offsetPattern.length];
    for(let v = vStart + offset; v <= vEnd; v += boardLen){
      const j0 = planeToScreen(u0, v);
      const j1 = planeToScreen(u1, v);
      const jh0 = planeToScreen(u0, v + 0.03);
      const jh1 = planeToScreen(u1, v + 0.03);

      octx.strokeStyle = seam;
      octx.lineWidth = 0.8;
      octx.beginPath();
      octx.moveTo(j0.x, j0.y);
      octx.lineTo(j1.x, j1.y);
      octx.stroke();

      octx.strokeStyle = hi;
      octx.lineWidth = 0.24;
      octx.beginPath();
      octx.moveTo(jh0.x, jh0.y);
      octx.lineTo(jh1.x, jh1.y);
      octx.stroke();
    }
  }

  octx.restore();

  ctx2.drawImage(overlay, 0, 0);

  drawFloorSkirtGeneric(ctx2, tileToScreenFn, tileExistsFn, cols, rows, hw, hh, {
    skirt,
    skirtOutline: 'rgba(0,0,0,0.72)',
    topOutline: 'rgba(0,0,0,0.34)'
  });
}

// ── drawFloorSkirtGeneric  ──
export function drawFloorSkirtGeneric(ctx2, tileToScreenFn, tileExistsFn, cols, rows, hw, hh, theme = {}){
  const edgeDepth = 5;
  const skirt = theme.skirt || adjustColor(theme.floorA || theme.floorEdge || '#b8aa72', -28);
  const skirtHi = adjustColor(skirt, 10);
  const skirtOutline = theme.skirtOutline || 'rgba(0,0,0,0.42)';
  const topOutline = theme.topOutline || null;
  for(let tx=0; tx<cols; tx++) for(let ty=0; ty<rows; ty++){
    if(!tileExistsFn(tx,ty)) continue;
    const p = tileToScreenFn(tx,ty);

    if(!tileExistsFn(tx,ty+1)){
      const x0=p.x-hw, y0=p.y, x1=p.x, y1=p.y+hh;
      ctx2.beginPath();
      ctx2.moveTo(x0,y0); ctx2.lineTo(x1,y1); ctx2.lineTo(x1,y1+edgeDepth); ctx2.lineTo(x0,y0+edgeDepth);
      ctx2.closePath(); ctx2.fillStyle=skirt; ctx2.fill();
      ctx2.strokeStyle = skirtOutline; ctx2.lineWidth = 0.9;
      ctx2.beginPath(); ctx2.moveTo(x0, y0 + edgeDepth); ctx2.lineTo(x1, y1 + edgeDepth); ctx2.stroke();
      ctx2.strokeStyle = topOutline || skirtHi; ctx2.lineWidth = 0.8;
      ctx2.beginPath(); ctx2.moveTo(x0, y0); ctx2.lineTo(x1, y1); ctx2.stroke();
    }
    if(!tileExistsFn(tx+1,ty)){
      const x0=p.x, y0=p.y+hh, x1=p.x+hw, y1=p.y;
      ctx2.beginPath();
      ctx2.moveTo(x0,y0); ctx2.lineTo(x1,y1); ctx2.lineTo(x1,y1+edgeDepth); ctx2.lineTo(x0,y0+edgeDepth);
      ctx2.closePath(); ctx2.fillStyle=skirt; ctx2.fill();
      ctx2.strokeStyle = skirtOutline; ctx2.lineWidth = 0.9;
      ctx2.beginPath(); ctx2.moveTo(x0, y0 + edgeDepth); ctx2.lineTo(x1, y1 + edgeDepth); ctx2.stroke();
      ctx2.strokeStyle = topOutline || skirtHi; ctx2.lineWidth = 0.8;
      ctx2.beginPath(); ctx2.moveTo(x0, y0); ctx2.lineTo(x1, y1); ctx2.stroke();
    }
  }
}

// ── drawRoomWallsGeneric  ──
export function drawRoomWallsGeneric(ctx2, theme, cfg){
  const cols = cfg.cols, rows = cfg.rows;
  const tileExistsFn = cfg.tileExists;
  const tileToScreenFn = cfg.tileToScreen;
  const hw = cfg.hw, hh = cfg.hh;
  const wallH = cfg.wallH ?? 118;
  const wallThick = cfg.wallThick ?? 7;

  const OFF_N = { x:-wallThick, y: wallThick/2 };
  const OFF_W = { x: wallThick, y: wallThick/2 };

  function key(pt){ return `${Math.round(pt[0]*10)/10},${Math.round(pt[1]*10)/10}`; }
  function samePt(a,b){ return Math.abs(a[0]-b[0]) < 0.01 && Math.abs(a[1]-b[1]) < 0.01; }
  function addPt(a, off){ return [a[0] + off.x, a[1] + off.y]; }
  function topPt(a){ return [a[0], a[1] - wallH]; }

  function fillPoly(pts, fill){
    if(!pts || pts.length < 3) return;
    ctx2.beginPath();
    ctx2.moveTo(pts[0][0], pts[0][1]);
    for(let i=1;i<pts.length;i++) ctx2.lineTo(pts[i][0], pts[i][1]);
    ctx2.closePath();
    ctx2.fillStyle = fill;
    ctx2.fill();
  }
  function strokeLine(a, b, color='rgba(0,0,0,0.78)', width=1.2){
    ctx2.beginPath();
    ctx2.moveTo(a[0], a[1]);
    ctx2.lineTo(b[0], b[1]);
    ctx2.strokeStyle = color;
    ctx2.lineWidth = width;
    ctx2.lineJoin = 'miter';
    ctx2.lineCap = 'butt';
    ctx2.stroke();
  }
  function strokePath(pts, color='rgba(0,0,0,0.78)', width=1.2){
    if(!pts || pts.length < 2) return;
    ctx2.beginPath();
    ctx2.moveTo(pts[0][0], pts[0][1]);
    for(let i=1;i<pts.length;i++) ctx2.lineTo(pts[i][0], pts[i][1]);
    ctx2.strokeStyle = color;
    ctx2.lineWidth = width;
    ctx2.lineJoin = 'miter';
    ctx2.lineCap = 'butt';
    ctx2.stroke();
  }
  function faceQuad(a, b, fill){
    const at = topPt(a), bt = topPt(b);
    fillPoly([a, b, bt, at], fill);
  }
  function endCap(v, off, fill){
    const vt = topPt(v);
    fillPoly([v, vt, addPt(vt, off), addPt(v, off)], fill);
  }
  function makeNorthSegment(tx, ty){
    const p = tileToScreenFn(tx, ty);
    return { a:[p.x, p.y - hh], b:[p.x + hw, p.y], off:OFF_N, faceFill:theme.wallB, topFill:'#5a6472' };
  }
  function makeWestSegment(tx, ty){
    const p = tileToScreenFn(tx, ty);
    return { a:[p.x, p.y - hh], b:[p.x - hw, p.y], off:OFF_W, faceFill:theme.wallA, topFill:'#5a6472' };
  }

  const segments = [];
  for(let tx=0; tx<cols; tx++){
    for(let ty=0; ty<rows; ty++){
      if(!tileExistsFn(tx,ty)) continue;
      if(!tileExistsFn(tx,ty-1)) segments.push(makeNorthSegment(tx,ty));
      if(!tileExistsFn(tx-1,ty)) segments.push(makeWestSegment(tx,ty));
    }
  }

  const adj = new Map();
  function addAdj(seg, pt){
    const k = key(pt);
    const arr = adj.get(k) || [];
    arr.push(seg);
    adj.set(k, arr);
  }
  for(const seg of segments){ addAdj(seg, seg.a); addAdj(seg, seg.b); }

  const degree1 = [];
  for(const [k, arr] of adj.entries()){
    if(arr.length === 1){
      const seg = arr[0];
      degree1.push(key(seg.a) === k ? seg.a : seg.b);
    }
  }

  let start = degree1[0] || null;
  for(const pt of degree1){
    if(!start || pt[0] < start[0] || (pt[0] === start[0] && pt[1] < start[1])) start = pt;
  }

  const orderedSegs = [];
  const orderedPts = [];
  if(start){
    let current = start;
    let prevSeg = null;
    orderedPts.push(current);
    while(true){
      const list = adj.get(key(current)) || [];
      let nextSeg = null;
      for(const seg of list){ if(seg !== prevSeg){ nextSeg = seg; break; } }
      if(!nextSeg) break;
      const reversed = samePt(current, nextSeg.b);
      const a = reversed ? nextSeg.b : nextSeg.a;
      const b = reversed ? nextSeg.a : nextSeg.b;
      orderedSegs.push({ a, b, off: nextSeg.off, faceFill: nextSeg.faceFill, topFill: nextSeg.topFill });
      current = b;
      orderedPts.push(current);
      prevSeg = nextSeg;
    }
  }

  const wp = theme._wallPattern || null;
  for(const seg of orderedSegs) faceQuad(seg.a, seg.b, seg.faceFill);
  if(wp && wp !== 'plain'){
    const runs = [];
    for(const seg of orderedSegs){
      const prev = runs[runs.length - 1];
      const sameOff = prev && prev.off.x === seg.off.x && prev.off.y === seg.off.y;
      const sameFill = prev && prev.faceFill === seg.faceFill;
      const continues = prev && Math.abs(prev.b[0] - seg.a[0]) < 0.01 && Math.abs(prev.b[1] - seg.a[1]) < 0.01;
      if(sameOff && sameFill && continues){
        prev.b = seg.b;
      } else {
        runs.push({ a: seg.a, b: seg.b, off: seg.off, faceFill: seg.faceFill });
      }
    }
    for(const run of runs){
      const ax=run.a[0], ay=run.a[1], bx=run.b[0], by=run.b[1];
      ctx2.save();
      ctx2.beginPath();
      ctx2.moveTo(ax,ay-wallH); ctx2.lineTo(bx,by-wallH); ctx2.lineTo(bx,by); ctx2.lineTo(ax,ay);
      ctx2.closePath(); ctx2.clip();
      drawWallPatIso(ctx2, ax, ay, bx, by, wallH, wp, run.faceFill);
      ctx2.restore();
    }
  }

  function lineIntersection(p1, p2, p3, p4){
    const x1=p1[0], y1=p1[1], x2=p2[0], y2=p2[1], x3=p3[0], y3=p3[1], x4=p4[0], y4=p4[1];
    const den = (x1-x2)*(y3-y4) - (y1-y2)*(x3-x4);
    if(Math.abs(den) < 0.0001) return null;
    const px = ((x1*y2 - y1*x2)*(x3-x4) - (x1-x2)*(x3*y4 - y3*x4)) / den;
    const py = ((x1*y2 - y1*x2)*(y3-y4) - (y1-y2)*(x3*y4 - y3*x4)) / den;
    return [px, py];
  }

  const frontTop = orderedPts.map(pt => topPt(pt));
  const backTop = [];
  if(orderedSegs.length){
    backTop.push(addPt(frontTop[0], orderedSegs[0].off));
    for(let i=1; i<frontTop.length-1; i++){
      const v = frontTop[i];
      const prevOff = orderedSegs[i-1].off;
      const nextOff = orderedSegs[i].off;
      if(prevOff.x === nextOff.x && prevOff.y === nextOff.y){
        backTop.push(addPt(v, prevOff));
      } else {
        const prevA = addPt(frontTop[i-1], prevOff);
        const prevB = addPt(v, prevOff);
        const nextA = addPt(v, nextOff);
        const nextB = addPt(frontTop[i+1], nextOff);
        const hit = lineIntersection(prevA, prevB, nextA, nextB);
        backTop.push(hit || addPt(v, nextOff));
      }
    }
    backTop.push(addPt(frontTop[frontTop.length-1], orderedSegs[orderedSegs.length-1].off));
    fillPoly([...frontTop, ...backTop.slice().reverse()], '#5a6472');
  }

  if(orderedSegs.length){
    endCap(orderedPts[0], orderedSegs[0].off, '#5a6472');
    endCap(orderedPts[orderedPts.length-1], orderedSegs[orderedSegs.length-1].off, '#5a6472');
  }

  strokePath(frontTop);
  if(orderedSegs.length){
    strokePath(backTop);
    strokeLine(frontTop[0], backTop[0]);
    strokeLine(frontTop[frontTop.length-1], backTop[backTop.length-1]);
  }

  ctx2.strokeStyle = 'rgba(0,0,0,0.85)';
  ctx2.lineWidth = 1.2;
  function drawOuterEndVerticalAt(pt, off){
    const a = addPt(pt, off);
    const b = addPt(topPt(pt), off);
    ctx2.beginPath(); ctx2.moveTo(a[0], a[1]); ctx2.lineTo(b[0], b[1]); ctx2.stroke();
  }
  if(orderedSegs.length){
    drawOuterEndVerticalAt(orderedPts[0], orderedSegs[0].off);
    drawOuterEndVerticalAt(orderedPts[orderedPts.length - 1], orderedSegs[orderedSegs.length - 1].off);
  }
}

// ── buildRoomTheme  ──
// baseTheme = tema base por defecto (como ROOM_THEME.default del juego)
// decor = { wall: { patternId, colorIdx, colorHex? }, floor: { patternId, colorIdx, colorHex? } }
// decorColors = array de colores [{hex}, ...]
export function buildThemeFromDecor(baseTheme, decor, decorColors){
  const t = Object.assign({}, baseTheme);
  const d = decor;
  if(d.wall){
    const hex = decorColors?.[d.wall.colorIdx]?.hex || d.wall.colorHex || '#8a96a8';
    t.wallA    = hex;
    t.wallB    = hex;
    t.wallTop  = adjustColor(hex, 30);
    t._wallPattern = normalizeWallPatternId(d.wall.patternId || 'plain');
  }
  if(d.floor){
    const hex = decorColors?.[d.floor.colorIdx]?.hex || d.floor.colorHex || '#878c58';
    t.floorA   = hex;
    const floorPat = normalizeFloorPatternId(d.floor.patternId);
    t.floorB   = floorPat === 'solid' ? hex : adjustColor(hex, -18);
    t.floorEdge= adjustColor(hex, -30);
    t._floorPattern = floorPat;
  }
  return t;
}
