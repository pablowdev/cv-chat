// "Tu historia" (/puente/historia): los datos vienen de
// logros.js (/puente/api/logros/historia) y la tarjeta para compartir se dibuja
// aca, en un canvas, como imagen.
(function () {
  'use strict';
  const APP = '__PUENTE_APP__';
  const main = document.getElementById('historia');
  const token = (() => { try { return localStorage.getItem('haven_token'); } catch { return null; } })();
  if (!token) { location.replace('/'); return; }
  // Abierta en una ventana sobre la app (aviso.js): "Cerrar" y los enlaces a
  // mensajes los maneja la app, sin volver a cargarla
  const EMBED = new URLSearchParams(location.search).has('embebida') && window.parent !== window;
  const tell = (msg) => window.parent.postMessage({ puente: 'historia', ...msg }, location.origin);
  if (EMBED) {
    document.documentElement.classList.add('embebida');
    const back = document.querySelector('.volver');
    if (back) {
      back.querySelector('span').textContent = 'Cerrar';
      back.setAttribute('aria-label', 'Cerrar');
      back.addEventListener('click', (e) => { e.preventDefault(); tell({ accion: 'cerrar' }); });
    }
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') tell({ accion: 'cerrar' }); });
    document.addEventListener('click', (e) => {
      const a = e.target instanceof Element && e.target.closest('a[href]');
      if (!a || a.classList.contains('volver') || a.hasAttribute('download')) return;
      const u = new URL(a.href, location.href);
      // Un mensaje de la app (aunque el enlace tenga la direccion publica): se abre en la app
      const msg = /^\/app(?:\.html)?$/.test(u.pathname) && u.searchParams.has('message');
      if (u.origin !== location.origin && !msg) return; // enlaces de afuera: como siempre
      e.preventDefault();
      tell({ accion: 'abrir', url: location.origin + u.pathname + u.search });
    });
  }

  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const DIAS = ['domingos', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados'];
  const num = n => Number(n || 0).toLocaleString('es-AR');
  const parse = s => new Date(String(s).replace(' ', 'T') + (/[zZ]$/.test(s) ? '' : 'Z'));
  const fecha = s => { const d = parse(s); return `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`; };
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  // Un emoji: el normal como texto, el personalizado como su imagen
  const emojiEl = (x) => {
    if (!x.url) return el('span', null, x.e);
    const i = el('img', 'emoji-img'); i.src = x.url; i.alt = ':' + x.nombre + ':'; i.title = ':' + x.nombre + ':';
    return i;
  };
  // Texto de una cita, con los :nombre: de los emojis personalizados como imagen
  const rich = (box, text, map) => {
    let last = 0;
    for (const m of text.matchAll(/:([\w~-]+):/g)) {
      if (!map || !map[m[1]]) continue;
      box.appendChild(document.createTextNode(text.slice(last, m.index)));
      box.appendChild(emojiEl({ nombre: m[1], url: map[m[1]] }));
      last = m.index + m[0].length;
    }
    box.appendChild(document.createTextNode(text.slice(last)));
    return box;
  };
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
    top.appendChild(el('p', 'sub', d.desde ? `En ${d.comunidad} desde el ${fecha(d.desde)}` : `Tu historia en ${APP} recién empieza`));
    if (d.medallas && d.medallas.length) {
      const ul = el('ul', 'medallas');
      for (const m of d.medallas) { const li = el('li', 'medalla'); li.title = m.detalle; li.append(el('span', null, m.emoji), el('span', null, m.nombre)); ul.appendChild(li); }
      top.appendChild(ul);
    }
    main.appendChild(top);

    if (!d.vinculado) {
      const c = card('¿Ya escribías en Discord?');
      c.classList.add('aviso');
      c.appendChild(el('p', null, `Vinculá tu cuenta de Discord y acá aparecen todos tus mensajes de ${d.comunidad}, desde el primero.`));
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
      c.appendChild(rich(el('div', 'cita'), d.primero.texto || '(una imagen o un archivo)', d.personalizados));
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
      const row = el('div', 'grande emojis-fila');
      for (const e of d.emojis) row.appendChild(emojiEl(e));
      c.appendChild(row);
    }

    if (d.masReaccionado) {
      c = card('Tu mensaje más reaccionado');
      c.appendChild(rich(el('div', 'cita'), d.masReaccionado.texto || '(una imagen o un archivo)', d.personalizados));
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
    const note = el('p', 'meta nota-tarjeta');
    const preview = el('img', 'vista-tarjeta'); preview.alt = 'Tu tarjeta para compartir'; preview.hidden = true;
    // La tarjeta se arma enseguida: asi "Compartir" y "Copiar" responden al toque
    // (si se arma recien al tocar, el celular cancela el compartir por la demora)
    const ready = drawCard(d);
    let file = null;
    ready.then(blob => {
      file = new File([blob], 'mi-historia-cv.png', { type: 'image/png' });
      preview.src = URL.createObjectURL(blob); preview.hidden = false;
    });
    const say = (t) => { note.textContent = t; };
    const add = (label, cls, fn) => { const b = el('button', 'boton' + (cls ? ' ' + cls : ''), label); b.type = 'button'; b.addEventListener('click', fn); box.appendChild(b); return b; };
    if (navigator.share && navigator.canShare) {
      add('Compartir', '', async () => {
        if (!file) { say('Un segundo, se está armando la tarjeta…'); await ready; }
        if (!navigator.canShare({ files: [file] })) { say('Este navegador no comparte imágenes: usá "Descargar".'); return; }
        try { await navigator.share({ files: [file], title: `Mi historia en ${d.comunidad}` }); say(''); }
        catch (err) { if (err && err.name !== 'AbortError') say('No se pudo compartir: usá "Copiar imagen" o "Descargar".'); }
      });
    }
    if (navigator.clipboard && navigator.clipboard.write && window.ClipboardItem) {
      add('Copiar imagen', navigator.share ? 'gris' : '', async () => {
        try {
          // Con la promesa adentro, el permiso del clic no se pierde mientras se arma
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': ready })]);
          say('¡Copiada! Pegala donde quieras (Ctrl+V).');
        } catch { say('Este navegador no deja copiar imágenes: usá "Descargar".'); }
      });
    }
    add('Descargar', 'gris', async () => {
      const blob = await ready;
      const a = el('a'); a.href = URL.createObjectURL(blob); a.download = 'mi-historia-cv.png';
      document.body.appendChild(a); a.click(); a.remove();
      say('Listo, quedó en tus descargas.');
    });
    if (!EMBED) { const back = el('a', 'boton gris', `Volver a ${APP}`); back.href = '/app'; box.appendChild(back); }
    main.append(el('h2', 'titulo-tarjeta', 'Tu tarjeta para compartir'), box, note, preview);
  }

  // La tarjeta, en formato de historia (1080 x 1920), con lo mas lindo de todo
  async function drawCard(d) {
    const W = 1080, H = 1920, cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const x = cv.getContext('2d');
    const font = (w, s) => `normal ${w} ${s}px "gg sans",system-ui,"Haven Emoji","Segoe UI",Roboto,Arial,sans-serif`;
    // Los emojis de la tarjeta con Twemoji: la fuente tiene que estar cargada antes de dibujar
    try { await document.fonts.load('60px "Haven Emoji"', [d.medallas.map(m => m.emoji).join(''), d.emojis.map(e => e.e || '').join(''), d.nombre, (d.respuestas[0] || {}).nombre || ''].join('')); } catch { /* sin la fuente: los del sistema */ }
    const g = x.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#5865f2'); g.addColorStop(0.55, '#9b51e0'); g.addColorStop(1, '#eb459e');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    x.fillStyle = 'rgba(24,25,28,.9)'; roundRect(x, 50, 50, W - 100, H - 100, 44); x.fill();
    x.textAlign = 'center';
    x.fillStyle = '#b5bac1'; x.font = font(700, 32);
    fitText(x, `MI HISTORIA EN ${String(d.comunidad).toUpperCase()}`, W / 2, 135, W - 200);
    // Foto y nombre
    const img = d.avatar ? await load(d.avatar) : null;
    x.save(); x.beginPath(); x.arc(W / 2, 320, 125, 0, Math.PI * 2); x.closePath(); x.clip();
    if (img) x.drawImage(img, W / 2 - 125, 195, 250, 250);
    else { x.fillStyle = '#5865f2'; x.fillRect(W / 2 - 125, 195, 250, 250); x.fillStyle = '#fff'; x.font = font(800, 120); x.fillText((d.nombre || '?')[0].toUpperCase(), W / 2, 363); }
    x.restore();
    x.fillStyle = '#f2f3f5'; x.font = font(800, 70); fitText(x, d.nombre, W / 2, 530, W - 180);
    x.fillStyle = '#b5bac1'; x.font = font(500, 34);
    if (d.desde) x.fillText(`Desde el ${fecha(d.desde)}`, W / 2, 585);
    // Medallas, en una o dos filas
    let y = 650;
    if (d.medallas.length) {
      x.font = font(700, 30);
      const pills = d.medallas.map(m => ({ t: m.emoji + ' ' + m.nombre, w: x.measureText(m.emoji + ' ' + m.nombre).width + 44 }));
      const rows = []; let row = [], rw = 0;
      for (const p of pills) { if (rw + p.w > W - 180 && row.length) { rows.push(row); row = []; rw = 0; } row.push(p); rw += p.w + 14; }
      if (row.length) rows.push(row);
      for (const r of rows.slice(0, 2)) {
        const total = r.reduce((a, p) => a + p.w, 0) + 14 * (r.length - 1);
        let px = (W - total) / 2;
        for (const p of r) {
          x.fillStyle = 'rgba(255,255,255,.09)'; roundRect(x, px, y, p.w, 56, 28); x.fill();
          x.fillStyle = '#f2f3f5'; x.textAlign = 'left'; x.fillText(p.t, px + 22, y + 39); x.textAlign = 'center';
          px += p.w + 14;
        }
        y += 70;
      }
    }
    // Cifras: 3 filas de 2
    const best = d.anios.length ? d.anios.reduce((a, b) => (b.n > a.n ? b : a)) : null;
    const cells = [
      [num(d.mensajes), 'mensajes'], [`#${num(d.puesto)}`, `de ${num(d.de)} personas`],
      [num(d.palabras), 'palabras'], [num(d.reacciones), 'reacciones recibidas'],
      [`${d.racha.mejor} ${d.racha.mejor === 1 ? 'día' : 'días'}`, 'mejor racha'], [best ? String(best.anio) : '-', best ? `mi año: ${num(best.n)} mensajes` : 'mi año'],
    ];
    const top = Math.max(y + 20, 800);
    cells.forEach(([big, small], i) => {
      const cx = i % 2 ? W * 0.735 : W * 0.265, cy = top + Math.floor(i / 2) * 185;
      x.fillStyle = 'rgba(255,255,255,.07)'; roundRect(x, cx - 225, cy, 450, 165, 26); x.fill();
      x.fillStyle = '#f2f3f5'; x.font = font(800, 62); fitText(x, big, cx, cy + 82, 410);
      x.fillStyle = '#b5bac1'; x.font = font(500, 29); fitText(x, small, cx, cy + 128, 410);
    });
    // Lista
    const dmax = Math.max(...d.dias);
    const lines = [
      ['Mi canal', d.canales[0] ? `#${d.canales[0].nombre}` : null],
      ['Escribo', `${momento(d.horas)}, los ${DIAS[d.dias.indexOf(dmax)]}`],
      ['Le respondo más a', d.respuestas[0] ? d.respuestas[0].nombre : null],
      ['Mis emojis', d.emojis.length ? d.emojis : null],
    ].filter(l => l[1]);
    // Las imagenes de los emojis personalizados, antes de dibujar
    const pics = new Map();
    for (const e of d.emojis) if (e.url) pics.set(e.url, await load(e.url));
    let ly = top + 3 * 185 + 30;
    x.fillStyle = 'rgba(255,255,255,.07)'; roundRect(x, 90, ly, W - 180, lines.length * 82 + 26, 26); x.fill();
    ly += 68;
    for (const [k, v] of lines) {
      x.textAlign = 'left'; x.fillStyle = '#b5bac1'; x.font = font(600, 32); x.fillText(k, 130, ly);
      x.textAlign = 'right'; x.fillStyle = '#f2f3f5'; x.font = font(700, 36);
      if (Array.isArray(v)) {
        // Emojis de derecha a izquierda: los normales como texto, los personalizados como imagen
        let rx = W - 130;
        x.font = font(700, 44);
        for (const e of v.slice().reverse()) {
          const pic = e.url && pics.get(e.url);
          if (pic) {
            const h = 52, w = Math.min(90, h * (pic.naturalWidth / pic.naturalHeight || 1));
            x.drawImage(pic, rx - w, ly - h + 10, w, h); rx -= w + 18;
          } else if (e.e) { x.fillText(e.e, rx, ly + 4); rx -= x.measureText(e.e).width + 18; }
        }
        ly += 82;
        continue;
      }
      let s = String(v); while (x.measureText(s).width > 500 && s.length > 1) s = s.slice(0, -2) + '…';
      x.fillText(s, W - 130, ly);
      ly += 82;
    }
    x.textAlign = 'center';
    x.fillStyle = '#80848e'; x.font = font(600, 32); x.fillText(location.host, W / 2, H - 82);
    return await new Promise(r => cv.toBlob(r, 'image/png'));
  }
  function load(src) { return new Promise(r => { const i = new Image(); i.onload = () => r(i); i.onerror = () => r(null); i.src = src; }); }
  function fitText(x, t, cx, y, max) { let s = String(t); while (x.measureText(s).width > max && s.length > 1) s = s.slice(0, -2) + '…'; x.fillText(s, cx, y); }
  function roundRect(x, X, Y, w, h, r) { x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + w, Y, X + w, Y + h, r); x.arcTo(X + w, Y + h, X, Y + h, r); x.arcTo(X, Y + h, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath(); }
})();
