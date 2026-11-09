// Marcas sobre los muñecos: "escribiendo", ausente, gestos y nombre. drawTypingIndicator sale de PawHotel.
export function drawTypingIndicator(ctx, p, time, tileToScreen) {
  if (!p || !p.typing) return;
  const { x, y } = tileToScreen(p.px ?? p.x ?? 0, p.py ?? p.y ?? 0);
  const floatOffset = Math.sin(time * 0.008) * 3;
  const bx = Math.round(x) + 35;
  const by = Math.round(y) - 75 + floatOffset;
  const bw = 36, bh = 22, r = 8;
  ctx.save();
  ctx.fillStyle = 'white';
  ctx.strokeStyle = '#aaa';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(bx - bw / 2 + r, by);
  ctx.lineTo(bx + bw / 2 - r, by);
  ctx.quadraticCurveTo(bx + bw / 2, by, bx + bw / 2, by + r);
  ctx.lineTo(bx + bw / 2, by + bh - r);
  ctx.quadraticCurveTo(bx + bw / 2, by + bh, bx + bw / 2 - r, by + bh);
  ctx.lineTo(bx + 4, by + bh);
  ctx.lineTo(bx - 2, by + bh + 7);
  ctx.lineTo(bx - 8, by + bh);
  ctx.lineTo(bx - bw / 2 + r, by + bh);
  ctx.quadraticCurveTo(bx - bw / 2, by + bh, bx - bw / 2, by + bh - r);
  ctx.lineTo(bx - bw / 2, by + r);
  ctx.quadraticCurveTo(bx - bw / 2, by, bx - bw / 2 + r, by);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  const t = Date.now() / 400;
  const dots = [{ ox: -9, phase: 0 }, { ox: 0, phase: 1 }, { ox: 9, phase: 2 }];
  for (const d of dots) {
    const pulse = Math.sin(t + d.phase * 1.2);
    const radius = 2.5 + pulse * 0.8;
    const alpha = 0.5 + pulse * 0.5;
    ctx.fillStyle = `rgba(80,80,80,${alpha})`;
    ctx.beginPath();
    ctx.arc(bx + d.ox, by + bh / 2, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// Lo nuevo de CV Hotel: marcas arriba de la cabeza (sx, sy en el mundo, arriba del pelo).
export function dibujarAusente(ctx, sx, sy, time) {
  const f = Math.sin(time * 0.003) * 2;
  ctx.save();
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(0,0,0,0.7)';
  ctx.fillStyle = '#bcd8ff';
  ctx.strokeText('z', sx + 14, sy + 6 + f); ctx.fillText('z', sx + 14, sy + 6 + f);
  ctx.font = 'bold 17px system-ui, sans-serif';
  ctx.strokeText('Z', sx + 24, sy - 6 - f); ctx.fillText('Z', sx + 24, sy - 6 - f);
  ctx.restore();
}

export function dibujarGesto(ctx, sx, sy, texto, resta) {
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, resta / 400));
  ctx.font = '22px system-ui, "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(texto, sx, sy - 2 - (1 - Math.min(1, resta / 3000)) * 10);
  ctx.restore();
}

export function dibujarNombre(ctx, sx, sy, nombre, mio) {
  ctx.save();
  ctx.font = 'bold 12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  const w = ctx.measureText(nombre).width + 10;
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.fillRect(Math.round(sx - w / 2), Math.round(sy - 17), Math.round(w), 16);
  ctx.fillStyle = mio ? '#ffd166' : '#f2f2f6';
  ctx.fillText(nombre, sx, sy - 3);
  ctx.restore();
}
