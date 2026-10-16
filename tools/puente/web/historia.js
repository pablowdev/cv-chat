// "Tu historia en Círculo Vicioso" (/puente/historia): los datos vienen de
// logros.js (/puente/api/logros/historia) y la tarjeta para compartir se dibuja
// aca, en un canvas, como imagen.
(function () {
  'use strict';
  const APP = '__PUENTE_APP__';
  const main = document.getElementById('historia');
  const token = (() => { try { return localStorage.getItem('haven_token'); } catch { return null; } })();
  if (!token) { location.replace('/'); return; }

  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const DIAS = ['domingos', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados'];
  const num = n => Number(n || 0).toLocaleString('es-AR');
  const parse = s => new Date(String(s).replace(' ', 'T') + (/[zZ]$/.test(s) ? '' : 'Z'));
  const fecha = s => { const d = parse(s); return `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`; };
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const card = (title) => { const c = el('section', 'tarjeta'); c.appendChild(el('h2', null, title)); main.appendChild(c); return c; };
  function momento(horas) {
    const franjas = [['de la madrugada', [0, 1, 2, 3, 4, 5]], ['de la mañana', [6, 7, 8, 9, 10, 11]], ['de la tarde', [12, 13, 14, 15, 16, 17, 18, 19]], ['de la noche', [20, 21, 22, 23]]];
    let best = franjas[0], max = -1;
    for (const f of franjas) { const n = f[1].reduce((a, h) => a + horas[h], 0) / f[1].length; if (n > max) { max = n; best = f; } }
    return best[0];
  }

  fetch('/puente/api/logros/historia', { headers: { Authorization: 'Bearer ' + token } })
    .then(r => { if (r.status === 401) { location.replace('/'); throw new Error('sin sesion'); } return r.json(); })
    .then(render)
    .catch(err => { if (err.message !== 'sin sesion') document.getElementById('estado').textContent = 'No se pudo cargar tu historia. Probá de nuevo en un rato.'; });

  function render(d) {
    main.textContent = '';
    // Portada
    const top = el('section', 'portada');
    if (d.avatar) { const img = el('img'); img.src = d.avatar; img.alt = ''; top.appendChild(img); }
    else top.appendChild(el('div', 'inicial', (d.nombre || '?').slice(0, 1).toUpperCase()));
    top.appendChild(el('h1', null, d.nombre));
    top.appendChild(el('p', 'sub', d.desde ? `En Círculo Vicioso desde el ${fecha(d.desde)}` : `Tu historia en ${APP} recién empieza`));
    if (d.medallas && d.medallas.length) {
      const ul = el('ul', 'medallas');
      for (const m of d.medallas) { const li = el('li', 'medalla'); li.title = m.detalle; li.append(el('span', null, m.emoji), el('span', null, m.nombre)); ul.appendChild(li); }
      top.appendChild(ul);
    }
    main.appendChild(top);

    if (!d.vinculado) {
      const c = card('Te falta tu historia de Discord');
      c.classList.add('aviso');
      c.appendChild(el('p', null, 'Vinculá tu cuenta de Discord y acá aparecen todos tus mensajes de Círculo Vicioso, desde el primero.'));
      const a = el('a', 'boton', 'Vincular Discord'); a.href = '/puente/vincular'; c.appendChild(a);
    }

    if (!d.mensajes) { main.appendChild(el('p', 'cargando', 'Todavía no escribiste nada. ¡Mandá tu primer mensaje!')); return buttons(d); }

    // Cuanto
    let c = card('Lo que escribiste');
    const big = el('div', 'grande'); big.append(num(d.mensajes) + ' ', el('small', null, 'mensajes')); c.appendChild(big);
    const cifras = el('div', 'cifras');
    const cifra = (b, s) => { const x = el('div', 'cifra'); x.append(el('b', null, b), el('span', null, s)); cifras.appendChild(x); };
    cifra(`#${num(d.puesto)}`, `de ${num(d.de)} personas que escribieron`);
    cifra(num(d.palabras), 'palabras');
    cifra(num(d.reacciones), 'reacciones que recibiste');
    if (d.desdeApp) cifra(num(d.desdeApp), `desde ${APP}`);
    c.appendChild(cifras);

    // El primero
    if (d.primero) {
      c = card('Tu primer mensaje');
      c.appendChild(el('div', 'cita', d.primero.texto || '(una imagen o un archivo)'));
      const meta = el('div', 'meta', `#${d.primero.canal} · ${fecha(d.primero.fecha)} · `);
      const a = el('a', null, 'ver mensaje'); a.href = d.primero.url; meta.appendChild(a); c.appendChild(meta);
    }

    // Canales
    if (d.canales.length) {
      c = card('Tus canales');
      const ul = el('ul', 'lista');
      for (const x of d.canales) { const li = el('li'); li.append(el('span', null, '#' + x.nombre), el('span', null, num(x.n) + ' mensajes')); ul.appendChild(li); }
      c.appendChild(ul);
    }

    // Por año
    if (d.anios.length > 1) {
      c = card('Año por año');
      const max = Math.max(...d.anios.map(a => a.n));
      const bars = el('div', 'barras'), axis = el('div', 'ejes');
      for (const a of d.anios) {
        const b = el('div', a.n === max ? 'top' : ''); b.style.height = Math.max(2, Math.round(100 * a.n / max)) + '%'; b.title = `${a.anio}: ${num(a.n)} mensajes`;
        bars.appendChild(b); axis.appendChild(el('span', null, "'" + String(a.anio).slice(2)));
      }
      c.append(bars, axis);
      const best = d.anios.find(a => a.n === max);
      c.appendChild(el('p', 'meta', `Tu año: ${best.anio}, con ${num(best.n)} mensajes.`));
    }

    // Cuando
    c = card('Cuándo escribís');
    const dmax = Math.max(...d.dias);
    c.appendChild(el('p', null, `Sos ${momento(d.horas)}, y los ${DIAS[d.dias.indexOf(dmax)]} son tu día.`));
    const hmax = Math.max(...d.horas);
    const bars = el('div', 'barras'), axis = el('div', 'ejes');
    d.horas.forEach((n, h) => {
      const b = el('div', n === hmax ? 'top' : ''); b.style.height = Math.max(2, Math.round(100 * n / (hmax || 1))) + '%'; b.title = `${h} h: ${num(n)}`;
      bars.appendChild(b); axis.appendChild(el('span', null, h % 6 === 0 ? String(h) : ''));
    });
    c.append(bars, axis);

    // Con quien
    if (d.respuestas.length) {
      c = card('A quién más le respondés');
      const ul = el('ul', 'lista');
      for (const x of d.respuestas) { const li = el('li'); li.append(el('span', null, x.nombre), el('span', null, num(x.n) + ' respuestas')); ul.appendChild(li); }
      c.appendChild(ul);
    }

    if (d.emojis.length) {
      c = card('Tus emojis');
      c.appendChild(el('div', 'grande', d.emojis.map(e => e.e).join(' ')));
    }

    if (d.masReaccionado) {
      c = card('Tu mensaje más reaccionado');
      c.appendChild(el('div', 'cita', d.masReaccionado.texto || '(una imagen o un archivo)'));
      const meta = el('div', 'meta', `${num(d.masReaccionado.n)} reacciones · #${d.masReaccionado.canal} · `);
      const a = el('a', null, 'ver mensaje'); a.href = d.masReaccionado.url; meta.appendChild(a); c.appendChild(meta);
    }

    // Racha
    c = card(`Tu racha en ${APP}`);
    const r = el('div', 'racha');
    const r2 = el('div');
    r2.appendChild(el('div', 'grande', d.racha.actual ? `${d.racha.actual} ${d.racha.actual === 1 ? 'día' : 'días'}` : '0 días'));
    r2.appendChild(el('div', 'meta', d.racha.actual && !d.racha.hoy ? '¡Escribí algo hoy para no perderla!' : `Tu mejor racha: ${d.racha.mejor} ${d.racha.mejor === 1 ? 'día' : 'días'} seguidos`));
    r.append(el('div', 'fuego', '🔥'), r2);
    c.appendChild(r);

    buttons(d);
  }

  function buttons(d) {
    const box = el('div', 'botones');
    const share = el('button', 'boton', 'Compartir mi tarjeta');
    share.type = 'button';
    const back = el('a', 'boton gris', `Volver a ${APP}`); back.href = '/app';
    box.append(share, back);
    main.appendChild(box);
    const preview = el('img', 'vista-tarjeta'); preview.alt = 'Tu tarjeta'; preview.hidden = true;
    main.appendChild(preview);
    share.addEventListener('click', async () => {
      share.disabled = true;
      try {
        const blob = await drawCard(d);
        const file = new File([blob], 'mi-historia-cv.png', { type: 'image/png' });
        preview.src = URL.createObjectURL(blob); preview.hidden = false;
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: `Mi historia en Círculo Vicioso`, text: `Mi historia en Círculo Vicioso · ${location.origin}` }).catch(() => {});
        } else {
          const a = el('a'); a.href = preview.src; a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
        }
      } finally { share.disabled = false; }
    });
  }

  // La tarjeta: 1080 x 1350 (la de Instagram), con lo mas lindo de la historia
  function drawCard(d) {
    return new Promise(async (resolve) => {
      const W = 1080, H = 1350, cv = document.createElement('canvas');
      cv.width = W; cv.height = H;
      const x = cv.getContext('2d');
      const g = x.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, '#5865f2'); g.addColorStop(1, '#eb459e');
      x.fillStyle = g; x.fillRect(0, 0, W, H);
      x.fillStyle = 'rgba(30,31,34,.88)'; roundRect(x, 60, 60, W - 120, H - 120, 40); x.fill();
      const font = (w, s) => `normal ${w} ${s}px "gg sans",system-ui,"Segoe UI",Roboto,Arial,sans-serif`;
      x.textAlign = 'center'; x.fillStyle = '#b5bac1'; x.font = font(600, 34);
      x.fillText('MI HISTORIA EN CÍRCULO VICIOSO', W / 2, 150);
      // Foto
      const img = d.avatar ? await load(d.avatar) : null;
      x.save(); x.beginPath(); x.arc(W / 2, 300, 110, 0, Math.PI * 2); x.closePath(); x.clip();
      if (img) x.drawImage(img, W / 2 - 110, 190, 220, 220); else { x.fillStyle = '#5865f2'; x.fillRect(W / 2 - 110, 190, 220, 220); x.fillStyle = '#fff'; x.font = font(800, 110); x.fillText((d.nombre || '?')[0].toUpperCase(), W / 2, 340); }
      x.restore();
      x.fillStyle = '#f2f3f5'; x.font = font(800, 64); fitText(x, d.nombre, W / 2, 490, W - 200);
      x.fillStyle = '#b5bac1'; x.font = font(500, 34);
      if (d.desde) x.fillText(`Desde el ${fecha(d.desde)}`, W / 2, 545);
      // Cifras
      const cells = [[num(d.mensajes), 'mensajes'], [`#${num(d.puesto)}`, `de ${num(d.de)}`], [num(d.reacciones), 'reacciones'], [d.racha.mejor + ' días', 'mejor racha']];
      cells.forEach(([big, small], i) => {
        const cx = i % 2 ? W * 0.72 : W * 0.28, cy = 680 + Math.floor(i / 2) * 190;
        x.fillStyle = 'rgba(255,255,255,.06)'; roundRect(x, cx - 220, cy - 95, 440, 165, 24); x.fill();
        x.fillStyle = '#f2f3f5'; x.font = font(800, 66); fitText(x, big, cx, cy, 400);
        x.fillStyle = '#b5bac1'; x.font = font(500, 32); x.fillText(small, cx, cy + 48);
      });
      x.fillStyle = '#f2f3f5'; x.font = font(600, 36);
      const canal = d.canales[0] ? `Mi canal: #${d.canales[0].nombre}` : '';
      if (canal) fitText(x, canal, W / 2, 1090, W - 200);
      if (d.medallas.length) { x.font = font(500, 54); x.fillText(d.medallas.map(m => m.emoji).join('  '), W / 2, 1175); }
      x.fillStyle = '#80848e'; x.font = font(500, 30); x.fillText(location.host, W / 2, 1250);
      cv.toBlob(resolve, 'image/png');
    });
  }
  function load(src) { return new Promise(r => { const i = new Image(); i.onload = () => r(i); i.onerror = () => r(null); i.src = src; }); }
  function fitText(x, t, cx, y, max) { let s = String(t); while (x.measureText(s).width > max && s.length > 1) s = s.slice(0, -2) + '…'; x.fillText(s, cx, y); }
  function roundRect(x, X, Y, w, h, r) { x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + w, Y, X + w, Y + h, r); x.arcTo(X + w, Y + h, X, Y + h, r); x.arcTo(X, Y + h, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath(); }
})();
