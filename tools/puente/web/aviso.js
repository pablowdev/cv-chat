// El enlace de un canal (o de un mensaje) abierto sin sesion: Haven manda a la pagina de entrar sin
// el ?channel=, y al entrar o crearse la cuenta quedaba en el canal de inicio. Se guarda aca (en la
// pestaña) y al volver a /app con la sesion abierta se lo vuelve a poner, antes de que Haven lo lea
(function () {
  'use strict';
  try {
    const q = new URLSearchParams(location.search);
    const tk = localStorage.getItem('haven_token');
    const ch = q.get('channel'), msg = q.get('message');
    if (!tk) {
      if (ch && /^[a-f0-9]{8}$/i.test(ch)) {
        sessionStorage.setItem('haven_pending_channel', ch);
        if (msg && /^\d+$/.test(msg)) sessionStorage.setItem('haven_pending_message', msg); else sessionStorage.removeItem('haven_pending_message');
      }
      return;
    }
    const guardado = sessionStorage.getItem('haven_pending_channel');
    if (!guardado || ch || q.get('invite') || !/^[a-f0-9]{8}$/i.test(guardado)) return;
    const m = sessionStorage.getItem('haven_pending_message');
    q.set('channel', guardado);
    if (m && /^\d+$/.test(m)) q.set('message', m);
    history.replaceState(history.state, '', location.pathname + '?' + q.toString() + location.hash);
  } catch { /* sin almacenamiento */ }
})();

// Vibracion cortita al abrir el perfil o el menu de una persona en el celular,
// como en la app de Discord (Android; en iPhone el navegador no lo permite)
function haptic() {
  try { if (navigator.vibrate && matchMedia('(pointer: coarse)').matches) navigator.vibrate(10); } catch { /* sin vibracion */ }
}

// Las fichas de los juegos (juegos-registro.js; cada juego tiene la suya en su repositorio), pedidas una sola vez
// para todo el chat. Si no contestan, se vuelven a pedir la proxima vez.
let registroJuegosP = null;
function registroJuegos() {
  return registroJuegosP || (registroJuegosP = fetch('/puente/api/juegos/registro', { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error('registro ' + r.status))))
    .then((d) => (d.juegos || []).slice().sort((a, b) => a.orden - b.orden))
    .catch((e) => { registroJuegosP = null; throw e; }));
}

// Manija de las hojas que suben desde abajo (pantallas tactiles), igual en
// todas, como en Discord: arrastrando hacia arriba la hoja se agranda hasta casi
// toda la pantalla (y ahi el contenido se desplaza normal); hacia abajo se
// achica y, si se baja bastante, se cierra. El arrastre empieza solo con el
// contenido desplazado arriba del todo (o donde diga canStart).
//   sheet: la hoja; opts.close(): cerrarla; opts.scroller: lo que se desplaza
//   adentro (por defecto la hoja); opts.canStart(e): donde puede empezar;
//   opts.snap: al soltar queda abierta como al principio o agrandada del todo.
function sheetDrag(sheet, opts) {
  'use strict';
  const scroller = opts.scroller || sheet;
  const canStart = opts.canStart || (() => scroller.scrollTop <= 0);
  const max = () => window.innerHeight * 0.95;
  let x0 = 0, y0 = null, dy = 0, h0 = 0, base = 0, active = false;
  sheet.addEventListener('touchstart', (e) => {
    y0 = null;
    if (e.touches.length !== 1 || !canStart(e)) return;
    x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; dy = 0; active = false;
    h0 = sheet.getBoundingClientRect().height;
    if (!sheet.__puenteBase) sheet.__puenteBase = h0; // el alto con el que se abrio
    base = sheet.__puenteBase;
    sheet.style.transition = 'none';
  }, { passive: true });
  sheet.addEventListener('touchmove', (e) => {
    if (y0 === null) return;
    dy = e.touches[0].clientY - y0;
    if (!active && Math.abs(dy) < 6) return;
    // Para el costado (la barra de categorias, por ejemplo): no es arrastrar la hoja
    if (!active && Math.abs(e.touches[0].clientX - x0) > Math.abs(dy)) { y0 = null; sheet.style.transition = ''; return; }
    // Ya esta al maximo y sigue para arriba: que se desplace el contenido
    if (!active && dy < 0 && h0 >= max() - 1) { y0 = null; sheet.style.transition = ''; return; }
    active = true;
    const target = h0 - dy;
    if (target >= base) {
      sheet.style.maxHeight = '95vh';
      sheet.style.height = Math.min(max(), target) + 'px';
      sheet.style.transform = '';
    } else {
      sheet.style.height = base + 'px';
      sheet.style.transform = 'translateY(' + (base - target) + 'px)';
    }
    if (e.cancelable) e.preventDefault();
  }, { passive: false });
  const end = () => {
    if (y0 === null) return;
    sheet.style.transition = '';
    const h = h0 - dy;
    if (active && base - h > 90) opts.close();
    else {
      sheet.style.transform = '';
      if (active && opts.snap && h > base) {
        // Para arriba un poco: del todo; para abajo un poco: como se abrio
        const up = dy < 0 ? h - h0 > 40 : h0 - h < 40 && h0 >= max() - 1;
        sheet.style.height = (up ? max() : base) + 'px';
      }
    }
    y0 = null; active = false;
  };
  sheet.addEventListener('touchend', end, { passive: true });
  sheet.addEventListener('touchcancel', end, { passive: true });
}

// Aviso "Vinculá tu cuenta de Discord" dentro de Haven (/app), para quien
// todavia no la vinculo. Sin vincular solo se ven los canales propios de Haven,
// asi que el aviso lo dice claro:
//  - Al entrar, una tarjeta en el medio ("Te falta un paso") con el boton de
//    Discord, que lleva directo a Discord. "Ahora no" la esconde hasta el otro dia.
//  - Arriba de los canales, un recuadro con cuantos canales mas se ven al
//    vincular (asi el chat vacio no queda sin explicacion). Tiene una X: quien
//    lo cierra no lo vuelve a ver (puede vincular igual desde /puente/vincular).
(function () {
  'use strict';
  const HIDE_KEY = 'puente_aviso_oculto_hasta';
  const HIDE_MS = 20 * 3600 * 1000; // hasta el otro dia
  const CAJA_KEY = 'puente_caja_discord_cerrada';
  const DISCORD_SVG = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M20.32 4.37a19.8 19.8 0 0 0-4.89-1.52.07.07 0 0 0-.08.04c-.21.38-.44.87-.61 1.25a18.27 18.27 0 0 0-5.49 0 12.64 12.64 0 0 0-.62-1.25.08.08 0 0 0-.08-.04 19.74 19.74 0 0 0-4.89 1.52.07.07 0 0 0-.03.03C.53 9.05-.32 13.58.1 18.06a.08.08 0 0 0 .03.06 19.9 19.9 0 0 0 5.99 3.03.08.08 0 0 0 .08-.03c.46-.63.87-1.3 1.23-1.99a.08.08 0 0 0-.04-.11 13.1 13.1 0 0 1-1.87-.89.08.08 0 0 1-.01-.13l.37-.29a.07.07 0 0 1 .08-.01c3.93 1.79 8.18 1.79 12.06 0a.07.07 0 0 1 .08.01l.37.29a.08.08 0 0 1-.01.13c-.6.35-1.22.65-1.87.89a.08.08 0 0 0-.04.11c.36.7.77 1.36 1.22 1.99a.08.08 0 0 0 .09.03 19.84 19.84 0 0 0 6-3.03.08.08 0 0 0 .03-.06c.5-5.18-.84-9.67-3.55-13.66a.06.06 0 0 0-.03-.03ZM8.02 15.33c-1.18 0-2.16-1.08-2.16-2.42 0-1.33.96-2.42 2.16-2.42 1.21 0 2.18 1.1 2.16 2.42 0 1.34-.96 2.42-2.16 2.42Zm7.97 0c-1.18 0-2.15-1.08-2.15-2.42 0-1.33.95-2.42 2.15-2.42 1.21 0 2.18 1.1 2.16 2.42 0 1.34-.95 2.42-2.16 2.42Z"/></svg>';

  function storage(fn) { try { return fn(); } catch { return null; } }
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const canales = (n) => n === 1 ? '1 canal más' : n + ' canales más';

  // Directo a Discord (sin pasar por la pagina de vincular)
  async function start(btn) {
    const token = storage(() => localStorage.getItem('haven_token'));
    if (btn) btn.disabled = true;
    try {
      const r = await fetch('/puente/api/iniciar', { method: 'POST', headers: { Authorization: 'Bearer ' + token } });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.url) { location.href = d.url; return; }
    } catch { /* abajo */ }
    location.href = '/puente/vincular';
  }

  async function check() {
    const token = storage(() => localStorage.getItem('haven_token'));
    if (!token) return false; // todavia en el login: volver a probar
    // Los invitados (jugar sin cuenta) no tienen Discord que vincular: sin el cartel
    try { if (JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).isGuest) return true; } catch { /* sigue */ }
    const res = await fetch('/puente/api/estado', { headers: { Authorization: 'Bearer ' + token } }).catch(() => null);
    if (!res || !res.ok) return res && res.status === 401 ? false : true;
    const st = await res.json().catch(() => null);
    if (!st || st.vinculado || !st.disponible) return true;
    if (!storage(() => localStorage.getItem(CAJA_KEY))) sidebarBox(st.canalesOcultos || 0);
    const until = Number(storage(() => localStorage.getItem(HIDE_KEY)) || 0);
    if (until <= Date.now()) card(st.canalesOcultos || 0);
    return true;
  }

  function card(hidden) {
    if (document.getElementById('puente-vincular-capa')) return;
    const back = el('div'); back.id = 'puente-vincular-capa';
    const box = el('div', 'pv-tarjeta');
    box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-labelledby', 'pv-titulo');
    const icon = el('div', 'pv-icono'); icon.innerHTML = DISCORD_SVG;
    const title = el('h2', 'pv-titulo', hidden ? 'Te falta un paso' : '¿Estabas en Discord?'); title.id = 'pv-titulo';
    const text = el('p', 'pv-texto', hidden
      ? `Vinculá tu cuenta de Discord para ver ${canales(hidden)} y todo tu historial de mensajes. Es un clic.`
      : 'Vinculá tu cuenta y recuperá todos tus mensajes de Discord. Es un clic.');
    const list = el('ul', 'pv-lista');
    const items = hidden
      ? ['Todos los canales del servidor, con su historial', 'Tus mensajes de Discord pasan a tu cuenta', 'Lo que escribas acá sale en Discord con tu nombre y tu foto']
      : ['Tu historial de mensajes de Discord pasa a tu cuenta', 'Lo que escribas sale en Discord verificado, sin "sin verificar"', 'Ves también los canales de tus roles de Discord'];
    for (const t of items) list.appendChild(el('li', null, t));
    const go = el('button', 'pv-boton'); go.type = 'button'; go.innerHTML = DISCORD_SVG; go.appendChild(el('span', null, 'Vincular con Discord'));
    go.addEventListener('click', () => start(go));
    const later = el('button', 'pv-luego', 'Ahora no'); later.type = 'button';
    // Si ya ve los canales, el recordatorio vuelve en una semana (no al otro dia)
    const close = () => { storage(() => localStorage.setItem(HIDE_KEY, String(Date.now() + (hidden ? HIDE_MS : 7 * 24 * 3600 * 1000)))); back.remove(); document.removeEventListener('keydown', onKey, true); };
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    later.addEventListener('click', close);
    back.addEventListener('click', (e) => { if (e.target === back) close(); });
    document.addEventListener('keydown', onKey, true);
    box.append(icon, title, text, list, go, later);
    back.appendChild(box);
    document.body.appendChild(back);
  }

  // Recuadro fijo arriba de la lista de canales
  function sidebarBox(hidden) {
    let tries = 0;
    (function put() {
      const list = document.getElementById('channel-list');
      if (!list) { if (++tries < 60) setTimeout(put, 500); return; }
      if (document.getElementById('puente-vincular-caja')) return;
      const box = el('div'); box.id = 'puente-vincular-caja';
      const x = el('button', 'pvc-cerrar'); x.type = 'button'; x.title = 'Cerrar'; x.setAttribute('aria-label', 'Cerrar');
      x.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M18.3 5.7a1 1 0 0 0-1.4 0L12 10.6 7.1 5.7a1 1 0 0 0-1.4 1.4l4.9 4.9-4.9 4.9a1 1 0 1 0 1.4 1.4l4.9-4.9 4.9 4.9a1 1 0 0 0 1.4-1.4L13.4 12l4.9-4.9a1 1 0 0 0 0-1.4Z"/></svg>';
      x.addEventListener('click', () => { storage(() => localStorage.setItem(CAJA_KEY, '1')); box.remove(); });
      box.appendChild(x);
      box.appendChild(el('div', 'pvc-titulo', hidden ? `🔒 Hay ${canales(hidden)}` : '🔗 ¿Estabas en Discord?'));
      box.appendChild(el('div', 'pvc-texto', hidden ? 'Vinculá tu Discord para verlos y recuperar tu historial.' : 'Vinculá tu cuenta para recuperar tu historial y verificar tu nombre.'));
      const go = el('button', 'pvc-boton'); go.type = 'button'; go.innerHTML = DISCORD_SVG; go.appendChild(el('span', null, 'Vincular con Discord'));
      go.addEventListener('click', () => start(go));
      box.appendChild(go);
      const ref = document.getElementById('puente-atajos') || list;
      ref.parentElement.insertBefore(box, ref);
    })();
  }

  const style = el('style');
  style.textContent = `
    #puente-vincular-capa { position: fixed; inset: 0; z-index: 100003; display: flex; align-items: center; justify-content: center; padding: 16px; background: rgba(0,0,0,.7); animation: puente-fade .18s ease-out; }
    #puente-vincular-capa .pv-tarjeta { width: 100%; max-width: 26rem; box-sizing: border-box; padding: 1.75rem 1.5rem 1.25rem; border-radius: 1rem; background: #242429; color: #dbdee1; text-align: center; box-shadow: 0 16px 48px rgba(0,0,0,.5); font-family: inherit; }
    #puente-vincular-capa .pv-icono { display: inline-flex; align-items: center; justify-content: center; width: 4rem; height: 4rem; border-radius: 50%; background: #5865f2; color: #fff; }
    #puente-vincular-capa .pv-icono svg { width: 2.25rem; height: 2.25rem; }
    #puente-vincular-capa .pv-titulo { margin: 1rem 0 .5rem; font-size: 1.5rem; font-weight: 800; color: #f2f3f5; }
    #puente-vincular-capa .pv-texto { margin: 0 0 1rem; font-size: 1rem; line-height: 1.45; color: #b5bac1; }
    #puente-vincular-capa .pv-lista { margin: 0 0 1.25rem; padding: 0; list-style: none; text-align: left; }
    #puente-vincular-capa .pv-lista li { position: relative; padding: .375rem 0 .375rem 1.75rem; font-size: .9375rem; color: #dbdee1; }
    #puente-vincular-capa .pv-lista li::before { content: '✓'; position: absolute; left: .25rem; top: .375rem; color: #23a55a; font-weight: 800; }
    #puente-vincular-capa .pv-boton, #puente-vincular-caja .pvc-boton { display: flex; align-items: center; justify-content: center; gap: .5rem; width: 100%; min-height: 3rem; border: 0; border-radius: .625rem; background: #5865f2; color: #fff; font: inherit; font-size: 1rem; font-weight: 700; cursor: pointer; }
    #puente-vincular-capa .pv-boton:hover, #puente-vincular-caja .pvc-boton:hover { background: #4752c4; }
    #puente-vincular-capa .pv-boton:disabled, #puente-vincular-caja .pvc-boton:disabled { opacity: .7; cursor: default; }
    #puente-vincular-capa .pv-luego { margin-top: .5rem; padding: .75rem; width: 100%; border: 0; background: transparent; color: #b5bac1; font: inherit; font-size: .9375rem; cursor: pointer; }
    #puente-vincular-capa .pv-luego:hover { color: #f2f3f5; text-decoration: underline; }
    #puente-vincular-caja { position: relative; margin: .5rem .5rem .375rem; padding: .75rem; border-radius: .625rem; background: rgba(88,101,242,.14); border: 1px solid rgba(88,101,242,.45); }
    #puente-vincular-caja .pvc-titulo { font-size: .9375rem; font-weight: 700; color: #f2f3f5; padding-right: 1.5rem; }
    #puente-vincular-caja .pvc-cerrar { position: absolute; top: .375rem; right: .375rem; display: flex; align-items: center; justify-content: center; width: 1.75rem; height: 1.75rem; padding: 0; border: 0; border-radius: 50%; background: transparent; color: #b5bac1; cursor: pointer; }
    #puente-vincular-caja .pvc-cerrar:hover { background: rgba(255,255,255,.08); color: #f2f3f5; }
    #puente-vincular-caja .pvc-texto { margin: .25rem 0 .625rem; font-size: .8125rem; line-height: 1.35; color: #b5bac1; }
    #puente-vincular-caja .pvc-boton { min-height: 2.5rem; font-size: .9375rem; }
    #puente-vincular-caja .pvc-boton svg { width: 1.25rem; height: 1.25rem; }`;
  document.head.appendChild(style);

  // Tras registrarse o iniciar sesion la sesion aparece sin recargar la pagina.
  let tries = 0;
  (async function loop() {
    if (await check()) return;
    if (++tries < 120) setTimeout(loop, 5000);
  })();
})();

// Videos como en Discord (solo con el tema Discord+): sin barra de controles
// hasta darle play, con un boton de play en el centro. El <video> sigue siendo
// el de Haven (su miniatura y su cambio a enlace de descarga si no se puede
// reproducir siguen funcionando); solo se ocultan los controles al principio.
(function () {
  'use strict';
  // El tema ya puesto, o el que va a cargar (con el tema fijo queda guardado antes de que Haven
  // agregue la hoja de estilos): asi los mensajes se arreglan apenas aparecen y no un rato despues,
  // que hacia saltar apenas las reacciones y las respuestas
  const themeOn = () => !!document.querySelector('link[href*="discord-plus.theme.css"]') ||
    (() => { try { return /discord-plus.theme.css/.test(localStorage.getItem('haven_theme') || ''); } catch { return false; } })();

  function enhance(video) {
    if (video.dataset.puentePlay) return;
    const wrap = video.closest('.file-video-wrap');
    if (!wrap) return;
    video.dataset.puentePlay = '1';
    video.controls = false;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'puente-play';
    btn.setAttribute('aria-label', 'Reproducir');
    btn.textContent = '▶';
    const start = () => {
      btn.remove();
      video.controls = true;
      const p = video.play();
      if (p && p.catch) p.catch(() => {});
    };
    btn.addEventListener('click', (e) => { e.stopPropagation(); start(); });
    video.addEventListener('click', () => { if (!video.controls) start(); });
    // Si algo lo reproduce por otro lado (atajos, PiP), mostrar los controles igual.
    video.addEventListener('play', () => { if (!video.controls) { btn.remove(); video.controls = true; } });
    wrap.appendChild(btn);
  }

  // Vista previa de una respuesta a un adjunto: en vez de la ruta del archivo
  // ("/uploads/discord/123.jpg" o "[file:video.mp4](...)"), lo que muestra
  // Discord. Solo cambia el texto que se ve; el mensaje original no se toca.
  const IMG_LINE = /^(?:spoiler-img:)?(?:\/uploads\/\S+|https?:\/\/\S+)\.(?:jpe?g|png|gif|webp|svg)(?:\?\S*)?$|^https:\/\/(?:media\d*\.giphy\.com|(?:media\d*|c)\.tenor\.com)\/\S+$/i;
  const FILE_LINE = /^\[file:([^\]\n]+)\]\(\/uploads\/[^\s|)]+\|[^)\n]*\)$/;
  const VIDEO_EXT = /\.(mp4|webm|mov|m4v|ogv|mkv|avi)$/i;
  function cleanReply(el) {
    const raw = el.dataset.puenteRaw || el.textContent;
    if (!/\/uploads\/|\[file:|tenor\.com|giphy\.com|\.(jpe?g|png|gif|webp)\b/i.test(raw)) return;
    el.dataset.puenteRaw = raw;
    let media = null;
    // Primero los archivos (su nombre puede tener espacios), luego palabra por palabra.
    const noFiles = raw.replace(new RegExp(FILE_LINE.source.slice(1, -1), 'g'), (_, name) => {
      media = media || (VIDEO_EXT.test(name) ? '🎬 Video' : '📎 ' + name);
      return ' ';
    });
    const kept = noFiles.split(/\s+/).filter((w) => {
      if (!w) return false;
      if (IMG_LINE.test(w)) { media = media || '🖼 Clic para ver el adjunto'; return false; }
      return true;
    });
    if (!media) return; // no habia adjuntos: dejar el texto como esta
    const text = kept.length ? kept.join(' ') : media;
    if (el.textContent !== text) el.textContent = text;
  }

  // Avatar mini de quien escribio el mensaje citado, como en Discord. Se copia
  // del mensaje original si esta cargado, o de otro mensaje de esa persona.
  function replyAvatar(banner) {
    if (banner.dataset.puenteAvatar) return;
    banner.dataset.puenteAvatar = '1';
    const id = banner.dataset.replyMsgId;
    let av = id ? document.querySelector(`[data-msg-id="${CSS.escape(id)}"] .message-avatar`) : null;
    if (!av) {
      const name = (banner.querySelector('.reply-author') || {}).textContent;
      if (name) {
        for (const a of document.querySelectorAll('.message .message-author')) {
          if (a.textContent === name) { av = a.closest('.message').querySelector('.message-avatar'); if (av) break; }
        }
      }
    }
    if (!av) return;
    const mini = av.cloneNode(true);
    mini.removeAttribute('id');
    mini.className = 'puente-reply-avatar' + (av.tagName === 'IMG' ? '' : ' avatar-circle');
    mini.setAttribute('aria-hidden', 'true');
    const author = banner.querySelector('.reply-author');
    banner.insertBefore(mini, author || banner.firstChild);
  }

  // Reaccion con emoji comun ("👍 2" en un solo texto): el emoji va en su
  // propio <span> para que el tema lo muestre grande y el numero chico, como
  // en Discord. Los emojis del servidor ya son una imagen aparte.
  function splitReaction(badge) {
    // Sin el cartelito del navegador con los nombres (ya los muestra la ventanita de Haven)
    if (badge.hasAttribute('title')) { badge.setAttribute('aria-label', badge.getAttribute('title')); badge.removeAttribute('title'); }
    badge.querySelectorAll('img[title]').forEach(i => i.removeAttribute('title'));
    const first = badge.firstChild;
    if (!first || first.nodeType !== 3) return;
    const m = /^(\s*)(\S+)(\s+\d+\s*)$/.exec(first.nodeValue);
    if (!m || /^\d+$/.test(m[2])) return;
    const span = document.createElement('span');
    span.className = 'puente-reaction-emoji';
    span.textContent = m[2];
    first.nodeValue = m[3];
    badge.insertBefore(span, first);
  }

  function scan(root) {
    if (!root || !root.querySelectorAll) return;
    root.querySelectorAll('.reply-preview, .reply-bar-text').forEach(cleanReply);
    if (!themeOn()) return;
    if (root.matches && root.matches('.reaction-badge')) splitReaction(root);
    root.querySelectorAll('.reaction-badge').forEach(splitReaction);
    if (root.matches && root.matches('.reply-banner')) replyAvatar(root);
    root.querySelectorAll('.reply-banner').forEach(replyAvatar);
    if (root.matches && root.matches('video.file-video')) enhance(root);
    root.querySelectorAll('video.file-video').forEach(enhance);
  }

  function startObserving() {
    new MutationObserver((muts) => {
      for (const m of muts) {
        for (const n of m.addedNodes) if (n.nodeType === 1) scan(n);
        // La barra "Respondiendo a..." reusa el mismo elemento y solo cambia su texto.
        const t = m.target;
        if (m.type === 'childList' && t.nodeType === 1 && t.matches && t.matches('.reaction-badge') && themeOn()) splitReaction(t);
        if (m.type === 'childList' && t.nodeType === 1 && t.matches && t.matches('.reply-preview, .reply-bar-text')) {
          if (t.textContent !== t.dataset.puenteShown) { delete t.dataset.puenteRaw; cleanReply(t); t.dataset.puenteShown = t.textContent; }
        }
      }
    }).observe(document.body, { childList: true, subtree: true });
    scan(document);
    // El tema puede terminar de cargar despues que los primeros mensajes.
    setTimeout(() => scan(document), 2000);
    setTimeout(() => scan(document), 6000);
  }
  if (document.body) startObserving();
  else document.addEventListener('DOMContentLoaded', startObserving);
})();

// Titulo de la ventana, como Discord: "#canal | <servidor>" (o "@persona" en un
// mensaje directo) en vez del "Haven: <servidor>" de Haven. En el navegador
// queda el contador de no leidos adelante ("(3) #canal | ..."); en la app
// instalada no, porque ahi los no leidos van en el icono de la barra de tareas
// (abajo). Si no hay titulo configurado (PUENTE_TITULO en .env), no se toca nada.
(function () {
  'use strict';
  const TITLE = '__PUENTE_TITULO__';
  if (!TITLE || TITLE.indexOf('__PUENTE') === 0) return;
  const desc = Object.getOwnPropertyDescriptor(Document.prototype, 'title');
  if (!desc || !desc.set) return;
  const installed = () => matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: window-controls-overlay)').matches;
  const place = () => {
    const app = window.app;
    if (!app || !app.currentChannel) return '';
    const ch = (app.channels || []).find(c => c.code === app.currentChannel);
    if (!ch) return '';
    if (ch.is_dm) {
      const who = ch.dm_target && (ch.dm_target.display_name || ch.dm_target.username);
      const head = ((document.getElementById('channel-header-name') || {}).textContent || '').trim().replace(/^@/, '');
      return (who || head) ? '@' + (who || head) : '';
    }
    return ch.name ? '#' + ch.name : '';
  };
  const fix = (v) => {
    const m = /^(\(\d+\)\s*)?Haven(?::\s*(.*))?$/.exec(String(v));
    if (!m) return v;
    const server = ((window.app && window.app.serverSettings && window.app.serverSettings.server_name) || m[2] || '').trim();
    const where = place();
    const base = where ? where + (server ? ' | ' + server : '') : (server || TITLE);
    return (installed() ? '' : (m[1] || '')) + base;
  };
  // Al cambiar de canal Haven no vuelve a poner el titulo: se pide de nuevo
  let tries = 0;
  (function wait() {
    const app = window.app;
    if (!app || typeof app.switchChannel !== 'function' || typeof app._updateTabTitle !== 'function') { if (++tries < 120) setTimeout(wait, 500); return; }
    const orig = app.switchChannel;
    app.switchChannel = function (...args) {
      const r = orig.apply(this, args);
      const again = () => { try { app._updateTabTitle(); } catch { /* despues */ } };
      const after = () => { setTimeout(again, 0); setTimeout(again, 800); };
      Promise.resolve(r).then(after, after);
      return r;
    };
    try { app._updateTabTitle(); } catch { /* despues */ }
  })();
  try {
    Object.defineProperty(document, 'title', {
      configurable: true,
      get() { return desc.get.call(document); },
      set(v) { desc.set.call(document, fix(v)); },
    });
  } catch { return; }
  document.title = desc.get.call(document);
})();

// App instalada en la PC: los no leidos en el icono de la barra de tareas, como
// Discord. Un numero con los mensajes directos sin leer y, si solo hay mensajes
// sin leer en canales, un punto. Los canales silenciados no cuentan (igual que
// en Haven). Haven ya calcula esto para su app de escritorio; aca se usa el
// globito que el navegador le pone al icono de las apps instaladas.
(function () {
  'use strict';
  if (!('setAppBadge' in navigator)) return;
  let last = null;
  function update(app) {
    let muted;
    try { muted = new Set(JSON.parse(localStorage.getItem('haven_muted_channels') || '[]')); } catch { muted = new Set(); }
    const serverMute = (typeof app._serverMuteMode === 'function' && app._serverMuteMode()) || 'off';
    let dms = 0, channels = 0;
    for (const ch of app.channels || []) {
      const n = (app.unreadCounts || {})[ch.code] || 0;
      if (!n || muted.has(ch.code)) continue;
      if (ch.is_dm) dms += n;
      else if (serverMute === 'off') channels += n;
    }
    const value = dms > 0 ? dms : channels > 0 ? 0 : -1; // 0 = punto, -1 = nada
    if (value === last) return;
    last = value;
    try {
      const p = value < 0 ? navigator.clearAppBadge() : value === 0 ? navigator.setAppBadge() : navigator.setAppBadge(value);
      if (p && p.catch) p.catch(() => {});
    } catch { /* el navegador no lo permite */ }
  }
  let tries = 0;
  (function wait() {
    const app = window.app;
    if (!app || typeof app._updateDesktopBadge !== 'function') { if (++tries < 120) setTimeout(wait, 500); return; }
    const orig = app._updateDesktopBadge;
    app._updateDesktopBadge = function (...args) {
      const r = orig.apply(this, args);
      try { update(this); } catch { /* sin globito */ }
      return r;
    };
    try { update(app); } catch { /* despues */ }
  })();
})();

// Al entrar, abrir un canal en vez de la pantalla "Bienvenido a Haven": el
// ultimo canal que abriste en este navegador (nunca un mensaje privado) o, si
// no, el canal de inicio
// (PUENTE_CANAL_INICIO en .env: nombres separados por comas, se usa el primero
// que la persona puede ver). Los enlaces a un canal (?channel=) o de
// invitacion (?invite=) siguen mandando, y si el canal ya no esta disponible
// se usa el de inicio.
(function () {
  'use strict';
  const START = '__PUENTE_CANAL_INICIO__';
  const KEY = 'puente_ultimo_canal';
  const store = (fn) => { try { return fn(localStorage); } catch { return null; } };
  const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/^#/, '');
  const params = new URLSearchParams(location.search);
  let opened = !!(params.get('channel') || params.get('invite'));

  // El tema oculta la pantalla de bienvenida de Haven (y el "Selecciona un
  // canal" de arriba) hasta que esta clase diga lo contrario: solo si de verdad
  // no hay ningun canal para abrir.
  const showWelcome = () => document.documentElement.classList.add('puente-bienvenida');

  // Haven vuelve a abrir al entrar la ventanita del ultimo mensaje privado: tampoco
  try { localStorage.removeItem('haven_active_dm_pip'); } catch { /* sin almacenamiento */ }

  // Mensaje privado (de a dos o en grupo): al entrar nunca se abre uno
  function isPrivateChat(app, code) {
    const ch = app.channels.find(c => c && c.code === code);
    return !!(ch && (ch.is_dm || ch.is_group || ch.is_self_dm));
  }

  function pick(app) {
    const fuera = (code) => !!(window.puenteClub && window.puenteClub.oculto(code)); // (club: la Guia y SERVER STATS)
    const has = (code) => app.channels.some(c => c && c.code === code) && !fuera(code);
    const last = store(s => s.getItem(KEY));
    // Nunca una conversacion privada: en ese caso, el canal de inicio
    if (last && has(last) && !isPrivateChat(app, last)) return last;
    if (START && START.indexOf('__PUENTE') !== 0) {
      for (const name of START.split(',')) {
        const ch = app.channels.find(c => c && !c.is_dm && norm(c.name) === norm(name) && !fuera(c.code));
        if (ch) return ch.code;
      }
    }
    const first = app.channels.find(c => c && !c.is_dm && !c.is_group && !fuera(c.code)) || app.channels.find(c => c && !c.is_dm && !c.is_group);
    return first ? first.code : null;
  }

  let tries = 0;
  (function wait() {
    const app = window.app;
    if (!app || typeof app.switchChannel !== 'function' || !Array.isArray(app.channels) || !app.channels.length) {
      if (++tries < 300) setTimeout(wait, 100); else showWelcome(); // 30 s sin canales
      return;
    }
    // Recordar cada canal que se abre
    const orig = app.switchChannel;
    app.switchChannel = function (code, ...rest) {
      if (code) store(s => s.setItem(KEY, String(code)));
      return orig.call(this, code, ...rest);
    };
    if (app.currentChannel) store(s => s.setItem(KEY, String(app.currentChannel)));
    if (!opened && !app.currentChannel) {
      opened = true;
      const target = pick(app);
      if (target) app.switchChannel(target); else showWelcome();
    }
    // Por si un enlace (?channel= / ?invite=) no llego a abrir nada
    setTimeout(() => {
      if (app.currentChannel) return;
      const target = pick(app);
      if (target) app.switchChannel(target); else showWelcome();
    }, 5000);
    // Si mas tarde Haven vuelve a la bienvenida (por ejemplo, borraron el canal
    // abierto o te sacaron el acceso), abrir otro en vez de dejarla.
    const welcome = document.getElementById('no-channel-msg');
    if (welcome) {
      new MutationObserver(() => {
        if (welcome.style.display === 'none' || app.currentChannel) return;
        const target = Array.isArray(app.channels) && app.channels.length ? pick(app) : null;
        if (target) app.switchChannel(target); else showWelcome();
      }).observe(welcome, { attributes: true, attributeFilter: ['style'] });
    }
  })();
})();

// Celular: los paneles de canales (izquierda) y de miembros (derecha) siguen
// al dedo, como en la app de Discord. Se arrastra desde cualquier parte del
// chat: hacia la derecha abre los canales, hacia la izquierda los miembros; con
// un panel abierto, arrastrando al reves se cierra. Al soltar se abre o se
// cierra segun cuanto se arrastro o lo rapido del movimiento. Haven solo
// abria los paneles empezando desde el borde de la pantalla, y de golpe.
// No se activa sobre algo que se desplaza de costado (codigo, tablas), videos,
// el cuadro de escribir o los selectores de emojis y GIF.
(function () {
  'use strict';
  const LOCK_PX = 10;     // movimiento minimo para decidir si es de costado o vertical
  const DECIDE_PX = 60;   // lo mismo que usa Haven al soltar
  const FLICK = 0.45;     // px/ms: un movimiento rapido alcanza aunque sea corto
  const SKIP = 'input, textarea, select, [contenteditable="true"], video, audio, pre, table, ' +
    '.gif-picker, .emoji-picker, .reaction-full-picker, .reaction-picker, [role="slider"]';
  let g = null; // gesto en curso

  const $ = (id) => document.getElementById(id);
  const left = () => document.querySelector('[data-haven-region="navigation-sidebar"]');
  const right = () => document.querySelector('.right-sidebar');

  function scrollsSideways(el) {
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      if (n.scrollWidth > n.clientWidth + 2) {
        const o = getComputedStyle(n).overflowX;
        if (o === 'auto' || o === 'scroll') return true;
      }
    }
    return false;
  }

  document.addEventListener('touchstart', (e) => {
    g = null;
    if (e.touches.length !== 1 || window.innerWidth > 768) return;
    const body = $('app-body');
    const target = e.target instanceof Element ? e.target : null;
    if (!body || !target || target.closest('.modal-overlay')) return;
    const t = e.touches[0];
    const base = { x: t.clientX, y: t.clientY, t: Date.now(), locked: false, dx: 0 };
    if (body.classList.contains('mobile-sidebar-open')) g = { ...base, mode: 'close', side: 'left' };
    else if (body.classList.contains('mobile-right-open')) g = { ...base, mode: 'close', side: 'right' };
    else if (target.closest('[data-haven-region="main"]') && !target.closest(SKIP) && !scrollsSideways(target)) g = { ...base, mode: 'open', side: null };
    // Dentro de un panel abierto, solo se cierra arrastrando sobre algo que no se desplaza de costado
    if (g && g.mode === 'close' && (target.closest(SKIP) || scrollsSideways(target))) g = null;
  }, { passive: true, capture: true });

  function place(dx) {
    const el = g.el, w = g.w;
    let x; // posicion del panel: 0 = abierto
    if (g.side === 'left') x = g.mode === 'open' ? Math.min(0, -w + Math.max(0, dx)) : Math.min(0, Math.max(-w, dx));
    else x = g.mode === 'open' ? Math.max(0, w + Math.min(0, dx)) : Math.max(0, Math.min(w, dx));
    el.style.transform = 'translateX(' + x + 'px)';
    g.overlay.style.opacity = String(Math.max(0, Math.min(1, 1 - Math.abs(x) / w)));
  }

  document.addEventListener('touchmove', (e) => {
    if (!g || e.touches.length !== 1) return;
    const t = e.touches[0];
    const dx = t.clientX - g.x, dy = t.clientY - g.y;
    if (!g.locked) {
      if (Math.abs(dx) < LOCK_PX && Math.abs(dy) < LOCK_PX) return;
      if (Math.abs(dx) < Math.abs(dy) * 1.2) { g = null; return; } // es un desplazamiento vertical
      if (g.mode === 'open') g.side = dx > 0 ? 'left' : 'right';
      // Cerrar: solo hacia afuera (izquierda para el panel izquierdo)
      if (g.mode === 'close' && ((g.side === 'left' && dx > 0) || (g.side === 'right' && dx < 0))) { g = null; return; }
      g.el = g.side === 'left' ? left() : right();
      g.overlay = $('mobile-overlay');
      if (!g.el || !g.overlay) { g = null; return; }
      g.w = g.el.getBoundingClientRect().width || window.innerWidth * 0.85;
      g.locked = true;
      g.x = t.clientX; // el panel arranca desde donde se decidio el gesto
      g.el.style.transition = 'none';
      g.overlay.classList.add('active');
    }
    if (e.cancelable) e.preventDefault(); // que el chat no se desplace mientras se arrastra
    g.dx = t.clientX - g.x;
    g.v = g.dx / Math.max(1, Date.now() - g.t);
    place(g.dx);
  }, { passive: false, capture: true });

  function finish(e) {
    if (!g) return;
    const s = g;
    g = null;
    if (!s.locked) return;
    // El gesto ya se resolvio aca: que Haven no lo procese tambien (si empezo
    // cerca de un borde, abriria el panel del otro lado)
    e.stopPropagation();
    const body = $('app-body');
    const dir = s.side === 'left' ? 1 : -1;             // sentido de "abrir"
    const moved = s.dx * (s.mode === 'open' ? dir : -dir); // cuanto se avanzo hacia la meta
    const fast = Math.abs(s.v || 0) > FLICK && moved > 0;
    const done = e.type !== 'touchcancel' && (moved >= DECIDE_PX || fast);
    const open = s.mode === 'open' ? done : !done;
    // Se sacan los estilos del arrastre y la clase deja el panel en su lugar, con la animacion de Haven
    s.el.style.transition = '';
    s.el.style.transform = '';
    s.overlay.style.opacity = '';
    const cls = s.side === 'left' ? 'mobile-sidebar-open' : 'mobile-right-open';
    body.classList.remove('mobile-sidebar-open', 'mobile-right-open');
    if (open) { body.classList.add(cls); s.overlay.classList.add('active'); }
    else s.overlay.classList.remove('active');
  }
  document.addEventListener('touchend', finish, { passive: true, capture: true });
  document.addEventListener('touchcancel', finish, { passive: true, capture: true });
})();

// Pantallas tactiles: el menu de un mensaje (mantener apretado o el boton ⋯)
// como la hoja de la app de Discord: sube desde abajo, con una fila de
// reacciones rapidas (las que mas usas) y las opciones en filas grandes,
// agrupadas. Las opciones son las del menu de Haven (mismos permisos y mismas
// acciones); solo cambian el aspecto y el orden, y se agrega "Copiar texto".
// Se cierra tocando afuera o deslizando la hoja hacia abajo.
(function () {
  'use strict';
  if (!matchMedia('(pointer: coarse)').matches) return;
  const GROUPS = [
    ['reply', 'thread', 'quote'],
    ['edit', 'copy-text', 'copy-link', 'puente-guardar', 'pin', 'unpin'],
    [], // el resto (proteger, mensaje oficial, etiquetas...)
    ['puente-denunciar', 'delete'],
  ];
  let quick = null; // reacciones rapidas [{ emoji, url? }]

  function loadQuick() {
    let token = null;
    try { token = localStorage.getItem('haven_token'); } catch { /* sin almacenamiento */ }
    if (!token) return;
    fetch('/puente/api/reacciones-frecuentes?n=5', { headers: { Authorization: 'Bearer ' + token } })
      .then(r => (r.ok ? r.json() : null)).then(d => { if (d && Array.isArray(d.emojis)) quick = d.emojis; }).catch(() => {});
  }

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.textContent = text;
    return n;
  }

  function hide(app) {
    document.getElementById('puente-sheet-backdrop')?.remove();
    if (app && typeof app._hideMessageContextMenu === 'function') app._hideMessageContextMenu();
  }

  function toggleReaction(app, msgEl, msgId, emoji) {
    const own = [...msgEl.querySelectorAll('.reaction-badge.own')].some(b => b.dataset.emoji === emoji);
    app.socket.emit(own ? 'remove-reaction' : 'add-reaction', { messageId: msgId, emoji });
  }

  const SPANISH = {
    'Thread': 'Hilo', 'Mark as official': 'Marcar como oficial', 'Unmark as official': 'Quitar de oficial',
    'Remove official': 'Quitar de oficial', 'Edit tags': 'Editar etiquetas',
  };

  function toSheet(app, msgEl) {
    const menu = document.getElementById('message-context-menu');
    if (!menu || menu.classList.contains('puente-sheet')) return;
    const msgId = parseInt(msgEl.dataset.msgId, 10);
    menu.classList.add('puente-sheet');
    haptic();
    menu.style.left = ''; menu.style.top = '';

    const buttons = [...menu.querySelectorAll('button[data-action]')];
    const reactBtn = buttons.find(b => b.dataset.action === 'react');
    menu.textContent = '';

    // Icono (el emoji del texto de Haven) y nombre, separados para alinearlos
    for (const b of buttons) {
      const first = b.firstChild;
      if (first && first.nodeType === 3 && first.nodeValue.trim()) {
        b.replaceChild(el('span', 'puente-sheet-icon', first.nodeValue.trim()), first);
      }
      // Los que Haven no tiene traducidos
      const walk = document.createTreeWalker(b, NodeFilter.SHOW_TEXT);
      for (let n = walk.nextNode(); n; n = walk.nextNode()) {
        const es = SPANISH[n.nodeValue.trim()];
        if (es) n.nodeValue = n.nodeValue.replace(n.nodeValue.trim(), es);
      }
    }

    menu.appendChild(el('div', 'puente-sheet-handle'));

    // Fila de reacciones rapidas, como en Discord: 5 frecuentes y una carita gris
    // que abre el selector completo, 6 cuadrados iguales
    const row = el('div', 'puente-sheet-reactions');
    for (const q of (quick || []).slice(0, 5)) {
      const b = el('button', 'puente-sheet-react');
      b.type = 'button';
      b.title = q.emoji;
      if (q.url) { const img = el('img'); img.src = q.url; img.alt = q.emoji; b.appendChild(img); }
      else b.textContent = q.emoji;
      b.addEventListener('click', (ev) => { ev.stopPropagation(); toggleReaction(app, msgEl, msgId, q.emoji); hide(app); });
      row.appendChild(b);
    }
    if (reactBtn) {
      // Dibujada (no un emoji de texto: con la fuente de emojis salia amarilla y parecia una reaccion mas)
      const more = el('button', 'puente-sheet-react puente-sheet-react-more');
      more.innerHTML = '<svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="currentColor"/>' +
        '<circle cx="8.3" cy="9.6" r="1.6" fill="#333237"/><circle cx="15.7" cy="9.6" r="1.6" fill="#333237"/>' +
        '<path d="M7 14.2c1.1 1.9 2.9 3 5 3s3.9-1.1 5-3" fill="none" stroke="#333237" stroke-width="1.8" stroke-linecap="round"/></svg>';
      more.type = 'button';
      more.dataset.action = 'react'; // la accion de Haven: abre el selector de emojis
      more.setAttribute('aria-label', reactBtn.textContent.trim());
      row.appendChild(more);
    }
    if (row.children.length) menu.appendChild(row);

    // "Copiar texto", como en Discord
    // sin las lineas que son solo una imagen o un archivo subido (/uploads/...): eso no es texto
    const raw = String(msgEl.dataset.rawContent || '').split('\n').filter(l => !/^\s*(\S*\/uploads\/\S+|\[file:[^\]]*\]\([^)]*\))\s*$/.test(l)).join('\n').trim();
    if (raw) {
      const copy = el('button', 'channel-ctx-item');
      copy.type = 'button';
      copy.dataset.puenteAction = 'copy-text';
      copy.append(el('span', 'puente-sheet-icon', '📋'), el('span', '', 'Copiar texto'));
      copy.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const done = () => { if (app._showToast) app._showToast('Texto copiado', 'success'); };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(raw).then(done, () => {});
        hide(app);
      });
      buttons.push(copy);
    }

    // "Copiar enlace del mensaje", en todos los canales (el de Haven, solo en los publicos)
    if (window.puenteEnlaces) {
      for (let i = buttons.length - 1; i >= 0; i--) if (buttons[i].dataset.action === 'copy-link') buttons.splice(i, 1);
      const lk = el('button', 'channel-ctx-item');
      lk.type = 'button';
      lk.dataset.puenteAction = 'copy-link';
      lk.append(el('span', 'puente-sheet-icon', '🔗'), el('span', '', 'Copiar enlace del mensaje'));
      lk.addEventListener('click', (ev) => { ev.stopPropagation(); window.puenteEnlaces.copiar(app, msgEl); hide(app); });
      buttons.push(lk);
    }

    // Denunciar (no en los mensajes propios)
    if (window.puenteDenunciar && !window.puenteDenunciar.propio(app, msgEl)) {
      const den = el('button', 'channel-ctx-item');
      den.type = 'button';
      den.dataset.puenteAction = 'puente-denunciar';
      den.append(el('span', 'puente-sheet-icon', '🚩'), el('span', '', 'Denunciar mensaje'));
      den.addEventListener('click', (ev) => { ev.stopPropagation(); hide(app); window.puenteDenunciar.abrir(app, msgEl); });
      buttons.push(den);
    }

    // Guardar (como el marcador de X) o quitar de guardados
    if (window.puenteGuardados && msgId) {
      const g = el('button', 'channel-ctx-item');
      g.type = 'button';
      g.dataset.puenteAction = 'puente-guardar';
      g.append(el('span', 'puente-sheet-icon', '🔖'), el('span', '', window.puenteGuardados.es(msgId) ? 'Quitar de guardados' : 'Guardar mensaje'));
      g.addEventListener('click', (ev) => { ev.stopPropagation(); hide(app); window.puenteGuardados.alternar(msgId); });
      buttons.push(g);
    }

    const actionOf = (b) => b.dataset.action || b.dataset.puenteAction;
    const groupOf = (b) => {
      const i = GROUPS.findIndex(g => g.includes(actionOf(b)));
      return i < 0 ? 2 : i;
    };
    GROUPS.forEach((g, gi) => {
      const items = buttons.filter(b => b !== reactBtn && groupOf(b) === gi)
        .sort((x, y) => g.indexOf(actionOf(x)) - g.indexOf(actionOf(y)));
      if (!items.length) return;
      const box = el('div', 'puente-sheet-group');
      items.forEach(b => box.appendChild(b));
      menu.appendChild(box);
    });

    if (!document.getElementById('puente-sheet-backdrop')) {
      const back = el('div');
      back.id = 'puente-sheet-backdrop';
      back.addEventListener('click', () => hide(app));
      document.body.appendChild(back);
    }

    // Manija: hacia arriba se agranda del todo, hacia abajo se cierra
    sheetDrag(menu, { close: () => hide(app), snap: true });
  }

  let tries = 0;
  (function wait() {
    const app = window.app;
    if (!app || typeof app._showMessageContextMenu !== 'function') { if (++tries < 120) setTimeout(wait, 500); return; }
    loadQuick();
    setInterval(loadQuick, 10 * 60 * 1000);
    const show = app._showMessageContextMenu;
    app._showMessageContextMenu = function (e, msgEl, ...rest) {
      const r = show.call(this, e, msgEl, ...rest);
      try { toSheet(this, msgEl); } catch (err) { console.warn('[puente] hoja del mensaje:', err); }
      return r;
    };
    const hideOrig = app._hideMessageContextMenu;
    if (typeof hideOrig === 'function') {
      app._hideMessageContextMenu = function (...a) {
        const b = document.getElementById('puente-sheet-backdrop');
        if (b) b.remove();
        if (typeof this._hideImageContextMenu === 'function') this._hideImageContextMenu();
        return hideOrig.apply(this, a);
      };
    }
    // Mantener apretada una imagen de un mensaje: como en Discord, el mismo menu del
    // mensaje (reacciones, responder...), con las opciones de la imagen al final
    // ("Guardar imagen", "Copiar imagen"...), en vez del menucito aparte de Haven.
    // Las opciones son las de Haven: su menu se arma escondido y cada boton lo usa.
    const IMG_LABELS = {
      view: ['🔍', 'Ver imagen'], save: ['💾', 'Guardar imagen'], copy: ['📋', 'Copiar imagen'],
      open: ['🔗', 'Abrir en el navegador'], 'edit-tags': ['🏷️', 'Editar etiquetas'], hide: ['🙈', 'Ocultar imagen'],
    };
    const showImg = app._showImageContextMenu;
    if (typeof showImg === 'function') {
      app._showImageContextMenu = function (e, src, opts = {}, ...rest) {
        const img = opts && opts.sourceImg;
        const msgEl = img && !opts.viewImage && img.closest('#messages .message[data-msg-id], #messages .message-compact[data-msg-id], #thread-panel [data-msg-id]');
        if (!msgEl) return showImg.call(this, e, src, opts, ...rest);
        this._showMessageContextMenu(e, msgEl);
        const sheet = document.getElementById('message-context-menu');
        if (!sheet || !sheet.classList.contains('puente-sheet')) return showImg.call(this, e, src, opts, ...rest);
        const r = showImg.call(this, e, src, opts, ...rest);
        const hidden = document.getElementById('image-context-menu');
        if (!hidden) return r;
        hidden.style.display = 'none';
        const group = el('div', 'puente-sheet-group puente-sheet-imagen');
        for (const b of hidden.querySelectorAll('button[data-action]')) {
          if (b.dataset.action === 'edit-tags' && sheet.querySelector('[data-action="edit-tags"]')) continue; // ya esta en el menu del mensaje
          const [icon, label] = IMG_LABELS[b.dataset.action] || ['', b.textContent.trim()];
          const it = el('button', 'channel-ctx-item');
          it.type = 'button';
          it.append(el('span', 'puente-sheet-icon', icon), el('span', '', label));
          it.addEventListener('click', (ev) => { ev.stopPropagation(); b.click(); hide(this); });
          group.appendChild(it);
        }
        if (group.children.length) {
          // Antes de "Eliminar", como Discord
          const groups = [...sheet.querySelectorAll(':scope > .puente-sheet-group')];
          const last = groups[groups.length - 1];
          if (last && last.querySelector('[data-action="delete"]')) sheet.insertBefore(group, last); else sheet.appendChild(group);
        }
        return r;
      };
    }
    // El boton ⋯ de cada mensaje abre la misma hoja (en vez de la barrita de iconos)
    document.addEventListener('click', (e) => {
      const dots = e.target instanceof Element && e.target.closest('.msg-dots-btn');
      if (!dots) return;
      const msgEl = dots.closest('.message, .message-compact');
      if (!msgEl || !msgEl.dataset.msgId) return;
      e.stopPropagation(); e.preventDefault();
      const r = dots.getBoundingClientRect();
      app._showMessageContextMenu({ clientX: r.left, clientY: r.top, preventDefault() {}, target: dots }, msgEl);
    }, true);
  })();
})();

// Pantallas tactiles: mantener apretado un mensaje abre su menu un poco antes,
// como en Discord (350 ms). El navegador lo detecta recien a ~500 ms; aca se
// adelanta mandando ese mismo "contextmenu" (asi va por los mismos caminos: el
// menu del mensaje, el de una imagen, el de la persona, quien reacciono), y el
// del navegador que llega despues, y el toque al soltar, se ignoran.
(function () {
  'use strict';
  if (!matchMedia('(pointer: coarse)').matches) return;
  const DELAY = 350, SLOP = 10;
  const LISTS = '#messages, #thread-messages, #dm-pip-messages';
  let timer = null, start = null, fired = false, until = 0;
  const cancel = () => { clearTimeout(timer); timer = null; };
  document.addEventListener('touchstart', (e) => {
    cancel(); fired = false;
    if (e.touches.length !== 1) return;
    const target = e.target instanceof Element ? e.target : null;
    if (!target || !target.closest(LISTS) || !target.closest('.message, .message-compact')) return;
    if (target.closest('textarea, input, [contenteditable="true"], video, audio')) return;
    const t = e.touches[0];
    start = { x: t.clientX, y: t.clientY };
    timer = setTimeout(() => {
      timer = null;
      if (!target.isConnected) return;
      fired = true; until = Date.now() + 1500;
      target.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: start.x, clientY: start.y, button: 2 }));
    }, DELAY);
  }, { passive: true, capture: true });
  document.addEventListener('touchmove', (e) => {
    if (!timer || !start) return;
    const t = e.touches[0];
    if (Math.abs(t.clientX - start.x) > SLOP || Math.abs(t.clientY - start.y) > SLOP) cancel();
  }, { passive: true, capture: true });
  document.addEventListener('scroll', cancel, { passive: true, capture: true });
  document.addEventListener('touchcancel', cancel, { passive: true, capture: true });
  document.addEventListener('touchend', (e) => {
    cancel();
    // Soltar despues de abrir el menu: que no sea un toque (cerraria la hoja recien abierta)
    if (fired && e.cancelable) e.preventDefault();
    fired = false;
  }, { passive: false, capture: true });
  // El del navegador, que llega despues con el dedo todavia apoyado: ya se abrio el menu
  document.addEventListener('contextmenu', (e) => {
    if (e.isTrusted && fired && Date.now() < until) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);
  // Y con el dedo todavia apoyado, el navegador seleccionaba la palabra que quedaba
  // debajo (en el menu recien abierto): ahi no se selecciona nada
  document.addEventListener('selectstart', (e) => { if (fired) e.preventDefault(); }, true);
  document.addEventListener('selectionchange', () => {
    if (!fired) return;
    const sel = getSelection();
    if (sel && !sel.isCollapsed) sel.removeAllRanges();
  });
})();

// Pantallas tactiles: elegir una reaccion como en la app de Discord. En vez de
// la barrita de Haven (8 emojis y un "..." que abre un panel chico), una hoja
// que sube desde abajo con buscador, "Usados frecuentemente", los emojis del
// servidor y todas las categorias, con una barra abajo para saltar entre ellas.
// Tocar un emoji reacciona (o saca la reaccion si ya estaba) y cierra.
(function () {
  'use strict';
  if (!matchMedia('(pointer: coarse)').matches) return;
  const tr = (key, fallback) => {
    try { const v = typeof t === 'function' ? t(key) : null; return v && v !== key ? v : fallback; } catch { return fallback; }
  };
  let frequent = null;

  function loadFrequent() {
    let token = null;
    try { token = localStorage.getItem('haven_token'); } catch { /* sin almacenamiento */ }
    if (!token) return;
    fetch('/puente/api/reacciones-frecuentes?n=24', { headers: { Authorization: 'Bearer ' + token } })
      .then(r => (r.ok ? r.json() : null)).then(d => { if (d && Array.isArray(d.emojis)) frequent = d.emojis; }).catch(() => {});
  }

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.textContent = text;
    return n;
  }

  function close() {
    document.getElementById('puente-react-picker')?.remove();
    document.getElementById('puente-react-backdrop')?.remove();
  }

  function open(app, msgEl, msgId) {
    close();
    const root = msgEl && msgEl.closest('#dm-pip-messages, #messages, #thread-messages');
    const code = root && root.id === 'dm-pip-messages' ? app._activeDMPip : app.currentChannel;
    if (app._channelAllowsReactions && !app._channelAllowsReactions(code)) {
      if (app._showToast) app._showToast(tr('channel_functions.reactions_disabled', 'Las reacciones están desactivadas en este canal'), 'info');
      return;
    }
    const react = (emoji) => {
      const own = [...msgEl.querySelectorAll('.reaction-badge.own')].some(b => b.dataset.emoji === emoji);
      app.socket.emit(own ? 'remove-reaction' : 'add-reaction', { messageId: msgId, emoji });
      close();
    };
    const tone = (e) => (typeof app._toneEmoji === 'function' ? app._toneEmoji(e) : e);
    const named = (e) => {
      const m = typeof e === 'string' && /^:([a-zA-Z0-9_-]+):$/.exec(e);
      return m && typeof app._findNamedEmoji === 'function' ? app._findNamedEmoji(m[1]) : null;
    };

    const back = el('div');
    back.id = 'puente-react-backdrop';
    back.addEventListener('click', close);
    const sheet = el('div', 'puente-react-picker');
    sheet.id = 'puente-react-picker';
    sheet.appendChild(el('div', 'puente-sheet-handle'));
    const search = el('input', 'puente-react-search');
    search.type = 'search';
    search.placeholder = tr('reactions.search_placeholder', 'Buscar emojis...');
    sheet.appendChild(search);
    const body = el('div', 'puente-react-body');
    const tabs = el('div', 'puente-react-tabs');
    sheet.append(body, tabs);

    // Secciones: [{ id, title, tab (texto o url), items: [{ value, url?, label }] }]
    const sections = [];
    if (frequent && frequent.length) {
      sections.push({ id: 'freq', title: tr('emoji.frequent', 'Usados frecuentemente'), tab: '🕒',
        items: frequent.map(f => ({ value: f.emoji, url: f.url, label: f.emoji })) });
    }
    if (Array.isArray(app.customEmojis) && app.customEmojis.length) {
      const server = (app.serverSettings && app.serverSettings.server_name) || tr('emoji.categories.custom', 'Personalizado');
      sections.push({ id: 'custom', title: server, tab: { url: '/puente/icono-192.png' },
        items: app.customEmojis.map(ce => ({ value: `:${ce.name}:`, url: ce.url, label: ce.name })) });
    }
    for (const [cat, list] of Object.entries(app.emojiCategories || {})) {
      if (!Array.isArray(list) || !list.length) continue;
      const items = list.map(e => {
        const n = named(e);
        return n ? { value: e, url: n.url, label: e } : { value: tone(e), label: (app.emojiNames && app.emojiNames[e]) || '', raw: e };
      });
      const first = items[0];
      sections.push({ id: 'cat-' + cat, title: tr('emoji.categories.' + cat.toLowerCase(), cat), tab: first.url ? { url: first.url } : first.value, items });
    }

    const button = (it) => {
      const b = el('button', 'puente-react-btn');
      b.type = 'button';
      b.title = it.label || it.value;
      if (it.url) { const img = el('img'); img.src = it.url; img.alt = it.value; img.loading = 'lazy'; b.appendChild(img); }
      else b.textContent = it.value;
      b.addEventListener('click', () => react(it.value));
      return b;
    };

    function render(filter) {
      body.textContent = '';
      const q = (filter || '').trim().toLowerCase();
      for (const s of sections) {
        if (q && s.id === 'freq') continue;
        const items = q ? s.items.filter(it => {
          if (it.raw && typeof app._emojiSearchMatch === 'function') return app._emojiSearchMatch(it.raw, it.label, q);
          return String(it.label || it.value).toLowerCase().includes(q);
        }) : s.items;
        if (!items.length) continue;
        const head = el('div', 'puente-react-title', s.title);
        head.id = 'puente-react-' + s.id;
        const grid = el('div', 'puente-react-grid');
        items.forEach(it => grid.appendChild(button(it)));
        body.append(head, grid);
      }
      if (!body.children.length) body.appendChild(el('div', 'puente-react-empty', tr('emoji.no_results', 'No se encontraron emojis')));
    }

    for (const s of sections) {
      const b = el('button', 'puente-react-tab');
      b.type = 'button';
      b.title = s.title;
      if (s.tab && s.tab.url) { const img = el('img'); img.src = s.tab.url; img.alt = ''; b.appendChild(img); }
      else b.textContent = s.tab;
      b.addEventListener('click', () => {
        if (search.value) { search.value = ''; render(''); }
        const target = document.getElementById('puente-react-' + s.id);
        if (target) body.scrollTo({ top: target.offsetTop - body.offsetTop, behavior: 'smooth' });
      });
      tabs.appendChild(b);
    }

    let timer = null;
    search.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => render(search.value), 120); });
    render('');

    // Como en Discord: se abre por la mitad; arrastrando para arriba (de la manija,
    // el buscador, la barra de abajo o los emojis si estan arriba del todo) se
    // agranda del todo, y para abajo vuelve o se cierra
    sheetDrag(sheet, { close, scroller: body, snap: true, canStart: (e) => !body.contains(e.target) || body.scrollTop <= 0 });

    document.body.append(back, sheet);
  }

  let tries = 0;
  (function wait() {
    const app = window.app;
    if (!app || typeof app._showReactionPicker !== 'function') { if (++tries < 120) setTimeout(wait, 500); return; }
    loadFrequent();
    setInterval(loadFrequent, 10 * 60 * 1000);
    const orig = app._showReactionPicker;
    app._showReactionPicker = function (msgEl, msgId, ...rest) {
      try { open(this, msgEl, msgId); } catch (err) {
        console.warn('[puente] selector de reacciones:', err);
        close();
        return orig.call(this, msgEl, msgId, ...rest); // el de Haven, si algo falla
      }
    };
  })();
})();

// PC: el panel de emojis de Discord, en todos lados. Para reaccionar (en vez de
// la barrita de Haven con 8 emojis y un "..." que abre un panel chico) y para
// escribir (el boton de la carita del cuadro de escribir, tambien al editar, en
// los hilos y en la ventanita de mensajes directos; ahi con la pestaña de
// stickers del servidor): buscador arriba, categorias a la izquierda, "Usados
// frecuentemente", los emojis del servidor y todas las categorias, y abajo el
// nombre del emoji que esta debajo del mouse. Un clic reacciona (o saca la
// reaccion si ya estaba) o escribe el emoji, y cierra; con Shift queda abierto
// para poner varios, como en Discord.
(function () {
  'use strict';
  if (matchMedia('(pointer: coarse)').matches) return;
  const tr = (key, fallback) => {
    try { const v = typeof t === 'function' ? t(key) : null; return v && v !== key ? v : fallback; } catch { return fallback; }
  };
  let frequent = null;
  function loadFrequent() {
    let token = null;
    try { token = localStorage.getItem('haven_token'); } catch { /* sin almacenamiento */ }
    if (!token) return;
    fetch('/puente/api/reacciones-frecuentes?n=36', { headers: { Authorization: 'Bearer ' + token } })
      .then(r => (r.ok ? r.json() : null)).then(d => { if (d && Array.isArray(d.emojis)) frequent = d.emojis; }).catch(() => {});
  }
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text) n.textContent = text; return n; };

  let current = null; // { key, msgEl?, target?, pop, off }
  let anchorEl = null; // el boton gris al lado de las reacciones, si se abrio desde ahi
  function close() {
    if (!current) return;
    const c = current;
    current = null;
    c.off();
    c.pop.remove();
    if (c.msgEl) c.msgEl.classList.remove('puente-rp-abierto');
    if (c.target) focusBox(c.target);
  }
  // El cuadro de escribir (o el editor con emojis que lo tapa)
  function focusBox(ta) {
    const ed = ta.id === 'message-input' && document.getElementById('puente-editor');
    try { (ed && ed.isConnected ? ed : ta).focus(); } catch { /* ya no esta */ }
  }
  // Escribe el emoji donde estaba el cursor, como el selector de Haven
  function insertInto(ta, value) {
    if (!ta || !ta.isConnected) return;
    const start = ta.selectionStart ?? ta.value.length, end = ta.selectionEnd ?? start;
    ta.value = ta.value.substring(0, start) + value + ta.value.substring(end);
    ta.selectionStart = ta.selectionEnd = start + value.length;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // opts: { msgEl, msgId } para reaccionar, o { insert: true, anchor, target } para escribir
  function open(app, opts) {
    const msgEl = opts.msgEl || null, msgId = opts.msgId;
    const insert = !!opts.insert;
    const openKey = insert ? 'escribir' : 'm' + msgId;
    if (current && current.key === openKey) { close(); return; } // el mismo boton lo cierra
    close();
    if (!insert) {
      const root = msgEl && msgEl.closest('#dm-pip-messages, #messages, #thread-messages');
      const code = root && root.id === 'dm-pip-messages' ? app._activeDMPip : app.currentChannel;
      if (app._channelAllowsReactions && !app._channelAllowsReactions(code)) {
        if (app._showToast) app._showToast(tr('channel_functions.reactions_disabled', 'Las reacciones están desactivadas en este canal'), 'info');
        return;
      }
    }
    const tone = (e) => (typeof app._toneEmoji === 'function' ? app._toneEmoji(e) : e);
    const named = (e) => {
      const m = typeof e === 'string' && /^:([a-zA-Z0-9_-]+):$/.exec(e);
      return m && typeof app._findNamedEmoji === 'function' ? app._findNamedEmoji(m[1]) : null;
    };
    const nameOf = (raw) => { const n = app.emojiNames && app.emojiNames[raw]; return n ? ':' + String(n).trim().replace(/\s+/g, '_') + ':' : raw; };

    // Secciones: [{ id, title, tab (texto o { url }), items: [{ value, url?, label, raw? }] }]
    const sections = [];
    if (frequent && frequent.length) {
      sections.push({ id: 'freq', title: tr('emoji.frequent', 'Usados frecuentemente'), tab: '🕒',
        items: frequent.map(f => (f.url ? { value: f.emoji, url: f.url, label: f.emoji } : { value: tone(f.emoji), label: nameOf(f.emoji), raw: f.emoji })) });
    }
    if (Array.isArray(app.customEmojis) && app.customEmojis.length) {
      const server = (app.serverSettings && app.serverSettings.server_name) || tr('emoji.categories.custom', 'Personalizado');
      sections.push({ id: 'custom', title: server, tab: { url: '/puente/icono-192.png' },
        items: app.customEmojis.map(ce => ({ value: `:${ce.name}:`, url: ce.url, label: `:${ce.name}:` })) });
    }
    for (const [cat, list] of Object.entries(app.emojiCategories || {})) {
      if (!Array.isArray(list) || !list.length) continue;
      const items = list.map(e => {
        const n = named(e);
        return n ? { value: e, url: n.url, label: e } : { value: tone(e), label: nameOf(e), raw: e };
      });
      const first = items[0];
      sections.push({ id: 'cat-' + cat, title: tr('emoji.categories.' + cat.toLowerCase(), cat), tab: first.url ? { url: first.url } : first.value, items });
    }

    const pop = el('div', 'puente-rp');
    pop.id = 'puente-rp';
    const head = el('div', 'puente-rp-head');
    const searchBox = el('label', 'puente-rp-search');
    const search = el('input');
    search.type = 'text';
    search.placeholder = insert ? 'Buscá el emoji perfecto' : 'Buscá la reacción perfecta';
    search.spellcheck = false;
    searchBox.append(el('span', 'puente-rp-lupa'), search);
    // Al escribir: pestañas Stickers / Emoji arriba, como en Discord
    const stickers = insert && Array.isArray(app.stickers) ? app.stickers.filter(st => st && st.url) : [];
    let showStickers = false;
    if (stickers.length) {
      const tabsRow = el('div', 'puente-rp-modos');
      const mk = (label, on) => {
        const b = el('button', 'puente-rp-modo' + (on ? ' actual' : ''), label);
        b.type = 'button';
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          showStickers = label === 'Stickers';
          tabsRow.querySelectorAll('.puente-rp-modo').forEach(x => x.classList.toggle('actual', x === b));
          search.placeholder = showStickers ? 'Buscar stickers' : 'Buscá el emoji perfecto';
          search.value = '';
          render('');
          search.focus();
        });
        return b;
      };
      tabsRow.append(mk('Stickers', false), mk('Emoji', true));
      head.appendChild(tabsRow);
    }
    head.appendChild(searchBox);
    const main = el('div', 'puente-rp-main');
    const side = el('div', 'puente-rp-side');
    const body = el('div', 'puente-rp-body');
    main.append(side, body);
    const foot = el('div', 'puente-rp-foot');
    const footIcon = el('span', 'puente-rp-foot-icon');
    const footName = el('span', 'puente-rp-foot-name');
    foot.append(footIcon, footName);
    pop.append(head, main, foot);

    const preview = (it) => {
      footIcon.textContent = '';
      if (!it) { footName.textContent = ''; return; }
      if (it.url) { const img = el('img'); img.src = it.url; img.alt = ''; footIcon.appendChild(img); } else footIcon.textContent = it.value;
      footName.textContent = it.label || it.value;
    };
    const react = (it, keep) => {
      if (insert) {
        insertInto(opts.target, it.value);
        if (!keep) close();
        return;
      }
      const own = [...msgEl.querySelectorAll('.reaction-badge.own')].some(b => b.dataset.emoji === it.value);
      app.socket.emit(own ? 'remove-reaction' : 'add-reaction', { messageId: msgId, emoji: it.value });
      if (!keep) close();
    };
    const button = (it) => {
      const b = el('button', 'puente-rp-btn');
      b.type = 'button';
      b.setAttribute('aria-label', it.label || it.value);
      if (it.url) { const img = el('img'); img.src = it.url; img.alt = it.value; img.loading = 'lazy'; img.draggable = false; b.appendChild(img); }
      else b.textContent = it.value;
      b.addEventListener('mouseenter', () => preview(it));
      b.addEventListener('click', (e) => { e.stopPropagation(); react(it, e.shiftKey); });
      return b;
    };

    const tabs = new Map();
    function renderStickers(q) {
      const list = q ? stickers.filter(st => String(st.name || '').toLowerCase().includes(q) || String(st.pack_name || '').toLowerCase().includes(q)) : stickers;
      const packs = [...new Set(list.map(st => st.pack_name || 'General'))];
      for (const pack of packs) {
        const h = el('div', 'puente-rp-title', pack);
        const grid = el('div', 'puente-rp-grid puente-rp-stickers');
        for (const st of list.filter(x => (x.pack_name || 'General') === pack)) {
          const b = el('button', 'puente-rp-sticker');
          b.type = 'button';
          b.setAttribute('aria-label', st.name || 'sticker');
          const img = el('img'); img.src = st.url; img.alt = st.name || ''; img.loading = 'lazy'; img.draggable = false;
          b.appendChild(img);
          b.addEventListener('mouseenter', () => preview({ url: st.url, label: st.name || '' }));
          b.addEventListener('click', (e) => { e.stopPropagation(); close(); app._sendStickerMessage(st.url); });
          grid.appendChild(b);
        }
        body.append(h, grid);
      }
      if (!body.children.length) body.appendChild(el('div', 'puente-rp-empty', 'No se encontraron stickers'));
      body.scrollTop = 0;
      preview(list[0] ? { url: list[0].url, label: list[0].name || '' } : null);
    }
    function render(filter) {
      body.textContent = '';
      const q = (filter || '').trim().toLowerCase();
      pop.classList.toggle('puente-rp-con-stickers', showStickers);
      if (showStickers) { renderStickers(q); return; }
      let firstItem = null;
      for (const s of sections) {
        if (q && s.id === 'freq') continue;
        const items = q ? s.items.filter(it => {
          if (it.raw && typeof app._emojiSearchMatch === 'function') return app._emojiSearchMatch(it.raw, app.emojiNames && app.emojiNames[it.raw] || '', q);
          return String(it.label || it.value).toLowerCase().includes(q);
        }) : s.items;
        if (!items.length) continue;
        if (!firstItem) firstItem = items[0];
        const h = el('div', 'puente-rp-title', s.title);
        h.dataset.sec = s.id;
        const grid = el('div', 'puente-rp-grid');
        items.forEach(it => grid.appendChild(button(it)));
        body.append(h, grid);
      }
      if (!body.children.length) body.appendChild(el('div', 'puente-rp-empty', tr('emoji.no_results', 'No se encontraron emojis')));
      body.scrollTop = 0;
      preview(firstItem);
      markTab();
    }
    // La categoria que se esta viendo queda marcada a la izquierda
    function markTab() {
      let id = null;
      for (const h of body.querySelectorAll('.puente-rp-title')) { if (h.offsetTop - body.offsetTop <= body.scrollTop + 8) id = h.dataset.sec; else break; }
      if (!id) { const h = body.querySelector('.puente-rp-title'); id = h && h.dataset.sec; }
      for (const [sid, b] of tabs) b.classList.toggle('actual', sid === id);
    }
    for (const s of sections) {
      const b = el('button', 'puente-rp-tab');
      b.type = 'button';
      b.title = s.title;
      if (s.tab && s.tab.url) { const img = el('img'); img.src = s.tab.url; img.alt = ''; b.appendChild(img); }
      else b.textContent = s.tab;
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        if (search.value) { search.value = ''; render(''); }
        const target = body.querySelector(`.puente-rp-title[data-sec="${s.id}"]`);
        if (target) body.scrollTop = target.offsetTop - body.offsetTop;
      });
      tabs.set(s.id, b);
      side.appendChild(b);
    }
    body.addEventListener('scroll', markTab, { passive: true });

    let timer = null;
    search.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => render(search.value), 120); });
    search.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { const first = body.querySelector('.puente-rp-btn, .puente-rp-sticker'); if (first) first.click(); e.preventDefault(); }
    });

    document.body.appendChild(pop);
    render('');

    // Al lado de la barrita del mensaje (a su izquierda, como Discord), sin salirse de la pantalla
    // (el boton de Haven esta escondido detras de la barrita nueva: se usa el que se ve)
    const visible = (n) => { if (!n) return null; const r = n.getBoundingClientRect(); return r.width && r.height ? r : null; };
    const pw = pop.offsetWidth, ph = pop.offsetHeight;
    const fromRow = visible(anchorEl && msgEl && msgEl.contains(anchorEl) ? anchorEl : null);
    anchorEl = null;
    let left, top;
    const fromBox = insert ? (visible(opts.anchor) || visible(opts.target)) : null;
    if (fromBox) {
      // Desde el cuadro de escribir: arriba del boton, alineado a su derecha, como Discord
      left = fromBox.right - pw;
      top = fromBox.top - ph - 8;
      if (top < 8) top = fromBox.bottom + 8;
    } else if (fromRow) {
      // Desde el boton al lado de las reacciones: abajo de el (o arriba si no entra)
      left = Math.min(fromRow.left, innerWidth - pw - 8);
      top = fromRow.bottom + 6;
      if (top + ph > innerHeight - 8) top = fromRow.top - ph - 6;
    } else {
      const ar = visible(msgEl.querySelector('.puente-tb-row [data-action="react"]')) || visible(msgEl.querySelector('.msg-toolbar')) ||
        msgEl.getBoundingClientRect();
      left = ar.left - pw - 8;
      if (left < 8) left = Math.min(innerWidth - pw - 8, ar.right + 8);
      top = ar.top;
    }
    if (top + ph > innerHeight - 8) top = innerHeight - ph - 8;
    pop.style.left = Math.max(8, left) + 'px';
    pop.style.top = Math.max(8, top) + 'px';
    if (msgEl) msgEl.classList.add('puente-rp-abierto');

    const outside = (e) => {
      if (pop.contains(e.target)) return;
      // El boton que lo abrio lo cierra solo (open)
      if (msgEl && msgEl.contains(e.target) && e.target.closest('[data-action="react"], .puente-rp-add')) return;
      if (insert && opts.anchor && opts.anchor.contains(e.target)) return;
      close();
    };
    const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    document.addEventListener('mousedown', outside, true);
    document.addEventListener('keydown', key, true);
    addEventListener('resize', close);
    current = { key: openKey, msgEl, target: insert ? opts.target : null, pop, off() { document.removeEventListener('mousedown', outside, true); document.removeEventListener('keydown', key, true); removeEventListener('resize', close); } };
    search.focus();
  }

  let tries = 0;
  (function wait() {
    const app = window.app;
    if (!app || typeof app._showReactionPicker !== 'function') { if (++tries < 120) setTimeout(wait, 500); return; }
    loadFrequent();
    setInterval(loadFrequent, 10 * 60 * 1000);
    // Boton gris para agregar otra reaccion, al final de las que ya hay (se ve al pasar el mouse, como en Discord)
    const ADD_ICON = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16Zm-3.5-9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm7 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM12 17.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5Z"/></svg>';
    document.addEventListener('mouseover', (e) => {
      const msgEl = e.target instanceof Element && e.target.closest('.message, .message-compact');
      if (!msgEl || !msgEl.dataset.msgId || msgEl.closest('.dm-pip-panel, .thread-panel.pip')) return;
      const row = msgEl.querySelector('.reactions-row');
      if (!row || row.querySelector('.puente-rp-add') || !row.querySelector('.reaction-badge')) return;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'puente-rp-add';
      b.title = 'Agregar reacción';
      b.innerHTML = ADD_ICON;
      b.addEventListener('click', (ev) => {
        ev.stopPropagation(); ev.preventDefault();
        anchorEl = b;
        app._showReactionPicker(msgEl, parseInt(msgEl.dataset.msgId, 10));
      });
      row.appendChild(b);
    }, { passive: true });
    const orig = app._showReactionPicker;
    app._showReactionPicker = function (msgEl, msgId, ...rest) {
      // Dentro de la ventanita flotante de mensajes directos queda el de Haven
      if (!msgEl || msgEl.closest('.dm-pip-panel, .thread-panel.pip')) return orig.call(this, msgEl, msgId, ...rest);
      try { open(this, { msgEl, msgId }); } catch (err) {
        console.warn('[puente] selector de reacciones (PC):', err);
        close();
        return orig.call(this, msgEl, msgId, ...rest); // el de Haven, si algo falla
      }
    };
    // El boton de la carita para escribir: el mismo panel en lugar del selector de Haven
    if (typeof app._toggleEmojiPicker === 'function') {
      const origToggle = app._toggleEmojiPicker;
      app._toggleEmojiPicker = function (anchor, ...rest) {
        const havenPicker = document.getElementById('emoji-picker');
        if (havenPicker && havenPicker.style.display === 'flex') return origToggle.call(this, anchor, ...rest); // el de Haven ya abierto: lo cierra
        try {
          const target = typeof this._emojiInsertTarget === 'function' ? this._emojiInsertTarget() : document.getElementById('message-input');
          if (!target) return origToggle.call(this, anchor, ...rest);
          let a = anchor instanceof Element ? anchor : null;
          if (!a && target.id === 'message-input') a = document.getElementById('emoji-btn');
          open(this, { insert: true, anchor: a, target });
        } catch (err) {
          console.warn('[puente] selector de emojis (PC):', err);
          close();
          return origToggle.call(this, anchor, ...rest);
        }
      };
    }
  })();
})();

// PC: el buscador como el de Discord. La caja "Buscar en <servidor>" queda
// siempre a la derecha del encabezado del canal (la de Haven estaba escondida
// detras de la lupa) y al hacer clic abre la lista de Discord: "Filtros" (de un
// usuario, en un canal, con un tipo de contenido, que menciona a alguien, y mas
// filtros con fechas y fijados) y el "Historial" de busquedas. Escribiendo
// from:, in:, has: o mentions: aparecen sugerencias (personas, tambien las de
// Discord; canales; tipos). Busca con Enter, como Discord (Haven buscaba a cada
// tecla). Los resultados salen en el panel de Haven, a la derecha; buscar.js
// del puente los arma con los autores de Discord.
(function () {
  'use strict';
  if (matchMedia('(pointer: coarse)').matches) return;
  const svg = d => `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="${d}"/></svg>`;
  const IC = {
    from: svg('M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2c-4.4 0-8 2.2-8 5v1a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-1c0-2.8-3.6-5-8-5Z'),
    in: svg('M10.9 3.2a1 1 0 0 1 .8 1.2L11 8h4l.8-4.2a1 1 0 1 1 2 .4L17 8h3a1 1 0 1 1 0 2h-3.4l-.8 4H19a1 1 0 1 1 0 2h-3.6l-.8 4.2a1 1 0 1 1-2-.4L13.4 16h-4l-.8 4.2a1 1 0 1 1-2-.4L7.4 16H4a1 1 0 1 1 0-2h3.8l.8-4H5a1 1 0 0 1 0-2h4l.7-4a1 1 0 0 1 1.2-.8ZM10.6 10l-.8 4h4l.8-4h-4Z'),
    has: svg('M16.5 6v11.5a4 4 0 0 1-8 0V5a2.5 2.5 0 0 1 5 0v10.5a1 1 0 0 1-2 0V6H10v9.5a2.5 2.5 0 0 0 5 0V5a4 4 0 0 0-8 0v12.5a5.5 5.5 0 0 0 11 0V6h-1.5Z'),
    mentions: svg('M12 2a10 10 0 1 0 4.3 19 1 1 0 1 0-.9-1.8A8 8 0 1 1 20 12v1a2 2 0 0 1-4 0V8h-2v.8A5 5 0 1 0 15 16a4 4 0 0 0 7-3v-1A10 10 0 0 0 12 2Zm0 13a3 3 0 1 1 0-6 3 3 0 0 1 0 6Z'),
    more: svg('M4 6h9v2H4V6Zm13 0h3v2h-3v1.5h-2v-5h2V6ZM4 16h3v2H4v-2Zm7 0h9v2h-9v1.5H9v-5h2V16Zm-7-5h9v2H4v-2Zm13 0h3v2h-3v1.5h-2v-5h2V11Z'),
    hist: svg('M10 2a8 8 0 1 0 4.9 14.3l5.4 5.4 1.4-1.4-5.4-5.4A8 8 0 0 0 10 2Zm0 2a6 6 0 1 1 0 12 6 6 0 0 1 0-12Z'),
    trash: svg('M9 3h6l1 2h4v2H4V5h4l1-2Zm-3 6h12l-1 12H7L6 9Zm4 2v8h2v-8h-2Zm4 0v8h2v-8h-2Z'),
    cal: svg('M7 2v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2V2h-2v2H9V2H7ZM5 9h14v11H5V9Z'),
    pin: svg('M16 3a1 1 0 0 1 .7 1.7L15 6.4v4.1l2.7 2.7A1 1 0 0 1 17 15h-4v6l-1 1-1-1v-6H7a1 1 0 0 1-.7-1.7L9 10.5V6.4L7.3 4.7A1 1 0 0 1 8 3h8Z'),
  };
  const HAS = [['enlace', 'Enlace'], ['imagen', 'Imagen'], ['video', 'Video'], ['archivo', 'Archivo'], ['audio', 'Audio']];
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text) n.textContent = text; return n; };
  const quote = v => (/\s/.test(v) ? `"${v}"` : v);
  const token = () => { try { return localStorage.getItem('haven_token'); } catch { return null; } };

  let app = null, input = null, drop = null, items = [], active = -1, timer = null, seq = 0;
  // Filtros ya elegidos: van como fichas en la caja, como Discord ("from: astro")
  const TOKEN = /^(from|in|has|mentions|before|after|during|pinned):("[^"]+"|[^\s"]+)$/i;
  let chips = [], chipBox = null, box = null;
  function drawChips() {
    if (!chipBox) return;
    chipBox.textContent = '';
    chips.forEach((tk, i) => {
      const m = TOKEN.exec(tk);
      const c = el('button', 'puente-busca-ficha'); c.type = 'button'; c.title = 'Quitar este filtro';
      c.append(el('b', '', (m ? m[1] : tk) + ':'), document.createTextNode(' ' + (m ? m[2].replace(/^"|"$/g, '') : '')));
      c.addEventListener('mousedown', (e) => e.preventDefault());
      c.addEventListener('click', (e) => { e.stopPropagation(); chips.splice(i, 1); drawChips(); input.focus(); render(); });
      chipBox.appendChild(c);
    });
    if (box) box.classList.toggle('con-texto', !!(chips.length || input.value));
  }
  function addChip(tk) { if (!chips.includes(tk)) chips.push(tk); drawChips(); }
  const fullQuery = () => [...chips, input.value.trim()].filter(Boolean).join(' ');
  // Una busqueda guardada (historial) vuelve a la caja con sus fichas
  function setQuery(q) {
    chips = [];
    const rest = String(q || '').replace(/(?:^|\s)((?:from|in|has|mentions|before|after|during|pinned):(?:"[^"]+"|[^\s"]+))/gi, (_, tk) => { chips.push(tk); return ' '; });
    input.value = rest.replace(/\s+/g, ' ').trim();
    drawChips();
  }
  const isDm = () => { const ch = (app.channels || []).find(c => c.code === app.currentChannel); return !!(ch && ch.is_dm); };

  function hide() { if (drop) drop.style.display = 'none'; items = []; active = -1; }
  function place() {
    const r = input.closest('.search-container').getBoundingClientRect();
    drop.style.top = (r.bottom + 6) + 'px';
    drop.style.left = Math.max(8, Math.min(r.right - drop.offsetWidth, innerWidth - drop.offsetWidth - 8)) + 'px';
  }
  function mark(i) {
    active = i;
    items.forEach((it, j) => it.classList.toggle('actual', j === i));
    if (items[i]) items[i].scrollIntoView({ block: 'nearest' });
  }
  function row(icon, title, sub, onPick, cls) {
    const b = el('button', 'puente-busca-item' + (cls ? ' ' + cls : ''));
    b.type = 'button';
    const ic = el('span', 'puente-busca-icon');
    if (icon && icon.url) { const img = el('img'); img.src = icon.url; img.alt = ''; ic.classList.add('avatar'); ic.appendChild(img); }
    else if (icon && icon.letter) { ic.classList.add('avatar'); ic.textContent = icon.letter; }
    else ic.innerHTML = icon || '';
    const txt = el('span', 'puente-busca-txt');
    txt.appendChild(el('span', 'puente-busca-title', title));
    if (sub) { const s = el('span', 'puente-busca-sub'); if (sub.nodeType) s.appendChild(sub); else s.textContent = sub; txt.appendChild(s); }
    b.append(ic, txt);
    b.addEventListener('mousedown', (e) => e.preventDefault()); // sin perder el foco de la caja
    b.addEventListener('click', (e) => { e.stopPropagation(); onPick(); });
    b.addEventListener('mouseenter', () => mark(items.indexOf(b)));
    items.push(b);
    return b;
  }
  function section(title, extra) {
    const h = el('div', 'puente-busca-sec');
    h.appendChild(el('span', '', title));
    if (extra) h.appendChild(extra);
    drop.appendChild(h);
  }
  // Pone el filtro (o su valor) en la caja, reemplazando lo que se estaba escribiendo
  function put(text, run) {
    const v = input.value;
    const m = /(?:^|\s)(\w+:(?:"[^"]*"?|\S*))$/.exec(v);
    const base = m && !/\s$/.test(v) ? v.slice(0, v.length - m[1].length) : v.replace(/\s*$/, v.trim() ? ' ' : '');
    if (run && TOKEN.test(text)) { input.value = base.replace(/\s+$/, ''); addChip(text); }
    else input.value = base + text + (run ? ' ' : '');
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
    if (run) { hide(); go(); } else render();
  }
  function go() {
    const q = fullQuery();
    if (!q) return;
    hide();
    try { app._searchSaveRecent(q); app._searchRun(q); } catch (err) { console.warn('[puente] buscador:', err); }
  }

  function renderRoot() {
    if (!isDm()) {
      section('Filtros');
      drop.appendChild(row(IC.from, 'De un usuario específico', exampleSub('from:', 'usuario'), () => put('from:')));
      drop.appendChild(row(IC.in, 'Enviado en un canal específico', exampleSub('in:', 'canal'), () => put('in:')));
      drop.appendChild(row(IC.has, 'Incluye un tipo de contenido', exampleSub('has:', 'enlace, imagen, video o archivo'), () => put('has:')));
      drop.appendChild(row(IC.mentions, 'Menciona a un usuario', exampleSub('mentions:', 'usuario'), () => put('mentions:')));
      drop.appendChild(row(IC.more, 'Más filtros', 'fechas y mensajes fijados', () => renderMore()));
    }
    const recent = (app._searchLoadRecent ? app._searchLoadRecent() : []).filter(Boolean);
    if (recent.length) {
      if (!isDm()) drop.appendChild(el('div', 'puente-busca-sep'));
      const clear = el('button', 'puente-busca-borrar'); clear.type = 'button'; clear.title = 'Borrar el historial'; clear.innerHTML = IC.trash;
      clear.addEventListener('mousedown', (e) => e.preventDefault());
      clear.addEventListener('click', (e) => { e.stopPropagation(); try { localStorage.removeItem('haven_recent_searches'); } catch { /* nada */ } render(); });
      section('Historial', clear);
      for (const q of recent) drop.appendChild(row(IC.hist, q, null, () => { setQuery(q); go(); }, 'historial'));
    }
  }
  function exampleSub(key, what) {
    const s = document.createDocumentFragment();
    s.appendChild(el('b', '', key));
    s.appendChild(document.createTextNode(' ' + what));
    const w = el('span'); w.appendChild(s); return w;
  }
  function renderMore() {
    drop.textContent = ''; items = []; active = -1;
    section('Más filtros');
    drop.appendChild(row(IC.cal, 'Antes de una fecha', exampleSub('before:', 'fecha'), () => put('before:')));
    drop.appendChild(row(IC.cal, 'Después de una fecha', exampleSub('after:', 'fecha'), () => put('after:')));
    drop.appendChild(row(IC.cal, 'En una fecha', exampleSub('during:', 'fecha'), () => put('during:')));
    drop.appendChild(row(IC.pin, 'Mensajes fijados', exampleSub('pinned:', 'true'), () => put('pinned:true', true)));
    show();
  }
  function renderPeople(key, term) {
    const my = ++seq;
    clearTimeout(timer);
    timer = setTimeout(() => {
      fetch('/puente/api/buscar/personas?q=' + encodeURIComponent(term), { headers: { Authorization: 'Bearer ' + token() } })
        .then(r => (r.ok ? r.json() : null)).then(d => {
          if (my !== seq || !d) return;
          drop.textContent = ''; items = []; active = -1;
          section(key === 'from' ? 'De' : 'Menciona a');
          for (const p of d.personas || []) {
            const sub = p.discord ? 'Discord' : (p.usuario || '');
            drop.appendChild(row(p.avatar ? { url: p.avatar } : { letter: String(p.nombre).charAt(0).toUpperCase() }, p.nombre, sub,
              () => put(key + ':' + quote(p.nombre), true)));
          }
          if (!items.length) drop.appendChild(el('div', 'puente-busca-vacio', term ? 'No encontramos a nadie con ese nombre' : 'Escribí un nombre'));
          else mark(0);
          show();
        }).catch(() => {});
    }, 150);
  }
  function renderDate(key) {
    drop.textContent = ''; items = []; active = -1;
    section(key === 'before' ? 'Antes de' : key === 'after' ? 'Después de' : 'En la fecha');
    const box = el('div', 'puente-busca-fecha');
    const d = el('input'); d.type = 'date';
    d.max = new Date().toISOString().slice(0, 10);
    const ok = el('button', 'puente-busca-ok', 'Aplicar'); ok.type = 'button';
    const apply = () => { if (d.value) put(key + ':' + d.value, true); };
    ok.addEventListener('click', (e) => { e.stopPropagation(); apply(); });
    d.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); apply(); } if (e.key === 'Escape') { input.focus(); hide(); } });
    box.append(d, ok);
    drop.appendChild(box);
    show();
  }
  function render() {
    if (!drop) return;
    drop.textContent = ''; items = []; active = -1;
    const v = input.value;
    const m = !isDm() && /(?:^|\s)(from|mentions|in|has|before|after|during):("?)([^"]*)$/.exec(v);
    if (m && !(m[2] === '' && /\s/.test(m[3]))) {
      const key = m[1], term = m[3].trim().toLowerCase();
      if (key === 'from' || key === 'mentions') { renderPeople(key, m[3].trim()); return; }
      if (key === 'in') {
        section('En');
        for (const c of (app.channels || []).filter(c => !c.is_dm && c.name && String(c.name).toLowerCase().startsWith(term)).slice(0, 12)) {
          drop.appendChild(row(IC.in, c.name, null, () => put('in:' + c.name, true)));
        }
      } else if (key === 'has') {
        section('Incluye');
        for (const [val, label] of HAS.filter(([val]) => val.startsWith(term))) drop.appendChild(row(IC.has, label, 'has:' + val, () => put('has:' + val, true)));
      } else { renderDate(key); return; }
      if (!items.length) drop.appendChild(el('div', 'puente-busca-vacio', 'Sin coincidencias'));
      else mark(0);
      show();
      return;
    }
    renderRoot();
    if (drop.children.length) show(); else hide();
  }
  function show() { drop.style.display = 'block'; place(); }

  function setup() {
    input = document.getElementById('search-input');
    box = input && input.closest('.search-container');
    if (!box) return false;
    chipBox = el('span', 'puente-busca-fichas');
    box.insertBefore(chipBox, input);
    // A la derecha de todo en el encabezado, siempre visible
    if (box.parentElement && box.parentElement.lastElementChild !== box) box.parentElement.appendChild(box);
    box.classList.add('puente-busca-caja');
    // "Buscar en <servidor>" (el nombre llega un poco despues que la pagina)
    input.removeAttribute('data-i18n-placeholder');
    const named = () => {
      const server = app.serverSettings && app.serverSettings.server_name;
      input.placeholder = 'Buscar en ' + (server || 'el servidor');
      return !!server;
    };
    if (!named()) { let n = 0; const iv = setInterval(() => { if (named() || ++n > 60) clearInterval(iv); }, 1000); }
    const lupa = el('span', 'puente-busca-lupa'); lupa.innerHTML = IC.hist;
    const x = el('button', 'puente-busca-x'); x.type = 'button'; x.title = 'Borrar la búsqueda';
    x.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M18.3 5.7a1 1 0 0 0-1.4 0L12 10.6 7.1 5.7a1 1 0 0 0-1.4 1.4l4.9 4.9-4.9 4.9a1 1 0 1 0 1.4 1.4l4.9-4.9 4.9 4.9a1 1 0 0 0 1.4-1.4L13.4 12l4.9-4.9a1 1 0 0 0 0-1.4Z"/></svg>';
    x.addEventListener('mousedown', (e) => e.preventDefault());
    x.addEventListener('click', (e) => { e.stopPropagation(); hide(); try { app._searchClose(); } catch { /* nada */ } input.value = ''; chips = []; drawChips(); });
    // Al cerrar la busqueda desde el panel, tambien se van las fichas
    if (typeof app._searchClose === 'function') {
      const origClose = app._searchClose;
      app._searchClose = function (...a) { const r = origClose.apply(this, a); chips = []; drawChips(); return r; };
    }
    box.append(lupa, x);
    // Con resultados, la columna de la derecha se ensancha (como el panel de Discord)
    const panel = document.getElementById('search-panel');
    const column = panel && panel.parentElement;
    if (column && column !== document.body) {
      const wide = () => column.classList.toggle('puente-busca-ancha', panel.style.display !== 'none' && panel.style.display !== '');
      new MutationObserver(wide).observe(panel, { attributes: true, attributeFilter: ['style'] });
      wide();
    }
    drop = el('div', 'puente-busca');
    drop.id = 'puente-busca';
    drop.style.display = 'none';
    document.body.appendChild(drop);

    // Antes que Haven: sin buscar a cada tecla, Enter busca, flechas eligen
    document.addEventListener('input', (e) => {
      if (e.target !== input) return;
      e.stopPropagation();
      // Un filtro escrito a mano y seguido de un espacio pasa a ser ficha
      const done = /(?:^|\s)((?:from|in|has|mentions|before|after|during|pinned):(?:"[^"]+"|[^\s"]+))\s$/i.exec(input.value);
      if (done) { input.value = input.value.slice(0, input.value.length - done[0].length).replace(/\s+$/, '') + (input.value.slice(0, input.value.length - done[0].length).trim() ? ' ' : ''); addChip(done[1]); }
      box.classList.toggle('con-texto', !!(input.value || chips.length));
      render();
    }, true);
    document.addEventListener('keydown', (e) => {
      if (e.target !== input) return;
      const open = drop.style.display !== 'none' && items.length;
      if (e.key === 'ArrowDown' && open) { e.preventDefault(); e.stopPropagation(); mark((active + 1) % items.length); return; }
      if (e.key === 'ArrowUp' && open) { e.preventDefault(); e.stopPropagation(); mark((active - 1 + items.length) % items.length); return; }
      if (e.key === 'Enter') {
        e.preventDefault(); e.stopPropagation();
        const v = input.value;
        const typing = /(?:^|\s)(from|mentions|in|has):("?)[^"\s]*$/.test(v) || /(?:^|\s)(from|mentions):"[^"]*$/.test(v);
        if (open && active >= 0 && (typing || !v.trim())) items[active].click();
        else go();
        return;
      }
      // Borrar con la caja vacia saca la ultima ficha
      if (e.key === 'Backspace' && chips.length && input.selectionStart === 0 && input.selectionEnd === 0) {
        e.preventDefault(); e.stopPropagation(); chips.pop(); drawChips(); render(); return;
      }
      if (e.key === 'Escape') {
        e.stopPropagation();
        if (drop.style.display !== 'none') hide();
        else input.blur();
      }
    }, true);
    input.addEventListener('focus', () => { box.classList.add('enfocada'); render(); });
    input.addEventListener('blur', () => { box.classList.remove('enfocada'); setTimeout(() => { if (document.activeElement !== input && !drop.contains(document.activeElement)) hide(); }, 150); });
    document.addEventListener('mousedown', (e) => { if (drop.style.display !== 'none' && !drop.contains(e.target) && !box.contains(e.target)) hide(); }, true);
    addEventListener('resize', () => { if (drop.style.display !== 'none') place(); });
    return true;
  }

  let tries = 0;
  (function wait() {
    app = window.app;
    if (!app || typeof app._searchRun !== 'function' || !app.serverSettings || !document.getElementById('search-input')) { if (++tries < 120) setTimeout(wait, 500); return; }
    try { setup(); } catch (err) { console.warn('[puente] buscador:', err); }
  })();
})();

// Cuando la barra de escribir crece (varias lineas, la barra de "respondiendo
// a", archivos adjuntos) o se achica, los mensajes se corren para arriba en vez
// de quedar tapados, como en Discord: lo que esta al final de la conversacion
// queda en el mismo lugar arriba de la barra.
(function () {
  'use strict';
  let tries = 0;
  (function wait() {
    const msgs = document.getElementById('messages');
    const area = document.getElementById('message-input-area');
    if (!msgs || !area || typeof ResizeObserver !== 'function') { if (++tries < 120) setTimeout(wait, 500); return; }
    // Lo que crecio la barra es lo que se achico la lista: se corre exactamente eso
    // Solo mientras se usa la barra (escribir, Enter, pegar, adjuntar, responder): al
    // cargar la pagina o cambiar de canal la barra tambien cambia y ahi manda Haven
    let height = area.offsetHeight, used = 0;
    const mark = () => { used = Date.now(); };
    for (const t of ['input', 'keydown', 'paste', 'drop', 'click']) area.addEventListener(t, mark, true);
    msgs.addEventListener('click', (e) => { if (e.target instanceof Element && e.target.closest('[data-action="reply"], [data-action="quote"], [data-action="edit"]')) mark(); }, true);
    // Al achicarse, el navegador ya corre la lista si estaba al final: ahi se vuelve a la
    // distancia al final que habia (al crecer, se corre lo que crecio)
    const gapNow = () => msgs.scrollHeight - msgs.scrollTop - msgs.clientHeight;
    let gap = gapNow();
    msgs.addEventListener('scroll', () => { gap = gapNow(); }, { passive: true });
    new ResizeObserver(() => {
      const h = area.offsetHeight;
      const d = h - height;
      height = h;
      if (!d || Date.now() - used > 3000) { gap = gapNow(); return; }
      // La barra solo mueve el chat si se estaba leyendo el final. Si la persona
      // subio a leer mas arriba, escribir o que aparezca la barra de "respondiendo
      // a" no le mueve nada de lo que esta mirando (antes se corria lo que crecia).
      if (gap > 40) { gap = gapNow(); return; }
      if (d > 0) msgs.scrollTop = Math.max(0, msgs.scrollTop + d);
      else msgs.scrollTop = Math.max(0, msgs.scrollHeight - msgs.clientHeight - Math.max(0, gap));
      gap = gapNow();
    }).observe(area);
  })();
})();

// El mensaje que se esta leyendo: el primero que empieza dentro de la pantalla. El de mas arriba,
// cortado por el borde, casi no se ve: si se toma ese y le crece algo (una imagen que termina de
// cargar, una vista previa, un video), empuja para abajo justo lo que se esta leyendo. Si ninguno
// empieza adentro (uno muy alto ocupa toda la pantalla), el que se ve.
function leido(sc) {
  'use strict';
  const top = sc.getBoundingClientRect().top, bottom = top + sc.clientHeight;
  let first = null;
  for (const el of sc.querySelectorAll(':scope > [data-msg-id]')) {
    const r = el.getBoundingClientRect();
    if (r.height <= 0 || r.bottom <= top + 1) continue;
    if (!first) first = el;
    if (r.top >= top - 1) return r.top < bottom ? el : first;
  }
  return first;
}

// Anclaje del chat (scroll anchoring): lo que se esta leyendo no se mueve solo. Haven le apaga al
// chat el del navegador (se peleaba con su manera de cargar los mensajes viejos) y trae uno propio
// (app-feed-anchor.js) que mira cada mensaje y corrige cuando alguno cambia de alto. Este es el
// mismo, con una diferencia: se queda quieto el mensaje que se esta leyendo (leido(), arriba), no
// el que esta cortado por el borde de arriba. Quien esta leyendo lo ultimo sigue pegado abajo.
// Se apaga el de Haven y queda este, con sus mismas reglas (pegado abajo, la edicion que se
// agranda, los mensajes viejos que carga Haven).
(function () {
  'use strict';
  let tries = 0;
  (function wait() {
    const app = window.app, sc = document.getElementById('messages');
    const listo = app && sc && app._feedAnchor && app._feedAnchor.ro && typeof app._feedShouldStick === 'function' && typeof app._feedGapBefore === 'function';
    if (!listo || typeof ResizeObserver !== 'function') { if (++tries < 120) setTimeout(wait, 500); return; }
    try { app._feedAnchor.ro.disconnect(); app._feedAnchor.mo.disconnect(); } catch { return; }
    // El que acomoda cuando termina de cargar una imagen (app-media.js) tiene su propia nota del
    // mensaje de arriba: que sea la misma, asi las dos correcciones no se suman
    if (typeof app._lazyRecordAnchor === 'function') {
      const lazy = app._lazyRecordAnchor;
      app._lazyRecordAnchor = function (box) {
        const L = this._lazyMedia;
        if (box !== sc || !L || !L.anchors) return lazy.call(this, box);
        const el = leido(sc);
        if (el) L.anchors.set(sc, { el, top: el.getBoundingClientRect().top }); else L.anchors.delete(sc);
      };
      try { app._lazyRecordAnchor(sc); } catch { /* sigue */ }
    }
    const heights = new WeakMap();
    let anc = null, ancTop = 0, st = sc.scrollTop;
    const record = () => {
      st = sc.scrollTop;
      anc = leido(sc);
      ancTop = anc ? anc.getBoundingClientRect().top : 0;
    };
    const stick = () => { sc.scrollTop = sc.scrollHeight; st = sc.scrollTop; };
    const hold = (grew) => {
      // Un mensaje que se edita y se agranda a mano crece para abajo (como en Haven)
      const pin = app._feedPinnedEdit;
      if (pin && pin.el && pin.el.isConnected && sc.contains(pin.el)) {
        const d = pin.el.getBoundingClientRect().top - pin.top;
        if (Math.abs(d) >= 1) sc.scrollTop += d;
        st = sc.scrollTop;
        return;
      }
      if (app._suppressCoupleCheck) return; // Haven esta cargando mensajes viejos y acomoda solo
      const gapBefore = app._feedGapBefore(sc, grew, st);
      const live = app._noMoreFuture !== false && !(app._isForumFeed && app._isForumFeed());
      if (app._feedShouldStick({ live, coupled: app._coupledToBottom, gapBefore, startsAtEnd: true })) {
        app._coupledToBottom = true;
        stick();
        return;
      }
      if (!anc || !anc.isConnected || !sc.contains(anc)) { record(); return; }
      const drift = anc.getBoundingClientRect().top - ancTop;
      st = sc.scrollTop;
      if (Math.abs(drift) < 1) return;
      sc.scrollTop += drift;
      st = sc.scrollTop;
      ancTop = anc.getBoundingClientRect().top;
    };
    // Corre despues de acomodar la pagina y antes de dibujarla: no se llega a ver el salto
    const ro = new ResizeObserver((entries) => {
      if (sc.clientHeight <= 0) { for (const e of entries) heights.delete(e.target); return; }
      let grew = 0, changed = false;
      for (const e of entries) {
        const h = e.borderBoxSize && e.borderBoxSize[0] ? e.borderBoxSize[0].blockSize : e.contentRect.height;
        const before = heights.get(e.target);
        heights.set(e.target, h);
        if (before !== undefined && Math.abs(before - h) >= 0.5) { changed = true; grew += h - before; }
      }
      if (changed) hold(grew);
    });
    const watch = (n) => { if (n.nodeType === 1 && n.dataset && n.dataset.msgId) ro.observe(n); };
    [...sc.children].forEach(watch);
    new MutationObserver((muts) => {
      for (const m of muts) {
        m.removedNodes.forEach((n) => { if (n.nodeType === 1) ro.unobserve(n); });
        m.addedNodes.forEach(watch);
      }
      st = sc.scrollTop;
    }).observe(sc, { childList: true });
    sc.addEventListener('scroll', () => { if (app._suppressCoupleCheck) { st = sc.scrollTop; return; } record(); }, { passive: true });
    addEventListener('resize', record);
    record();
    app._puenteAnclaje = true; // (lo usa el de abajo)
  })();
})();

// Subir a leer sin que el chat te devuelva a un mensaje. Al cargar mensajes viejos (al llegar arriba de
// todo), Haven se anota el mensaje que se veia y, durante 15 segundos, cada vez que algo cambia adentro de
// los que agrego (llega una vista previa, termina de cargar una imagen, una reaccion) lo vuelve a poner
// donde estaba en ese momento. Si la persona siguio subiendo, eso la tiraba de vuelta a ese mensaje, por
// mas rapido que subiera. Esas vueltas se apagan: lo que crece ya lo acomoda el anclaje de arriba, con el
// mensaje que se esta leyendo ahora. Lo que Haven acomoda en el momento de agregarlos queda igual.
// (Si Haven cambia y su codigo ya no se reconoce, queda todo como era.)
(function () {
  'use strict';
  const deHaven = (fn) => { try { return typeof fn === 'function' && /\brealign\(\)/.test(String(fn)); } catch { return false; } };
  let tries = 0;
  (function wait() {
    const app = window.app;
    if (!app || typeof app._prependMessages !== 'function' || !app._puenteAnclaje) { if (++tries < 120) setTimeout(wait, 500); return; }
    const orig = app._prependMessages;
    app._prependMessages = function (...a) {
      const MO = window.MutationObserver, add = EventTarget.prototype.addEventListener;
      try {
        window.MutationObserver = class extends MO { constructor(cb) { super(deHaven(cb) ? () => {} : cb); } };
        EventTarget.prototype.addEventListener = function (type, fn, opts) {
          if (this instanceof HTMLImageElement && (type === 'load' || type === 'error') && deHaven(fn)) return;
          return add.call(this, type, fn, opts);
        };
      } catch { window.MutationObserver = MO; EventTarget.prototype.addEventListener = add; }
      try { return orig.apply(this, a); } finally { window.MutationObserver = MO; EventTarget.prototype.addEventListener = add; }
    };
  })();
})();

// El chat nunca baja solo hasta el final si la persona subio a leer. Haven lo
// bajaba al volver a la app (recarga el canal), cuando llegaba un mensaje y se
// estaba "cerca" del final (a menos de 150 px), o cuando terminaban de cargar
// imagenes. Ahora, si se subio con el dedo, la rueda o el teclado, se queda en
// el mismo mensaje que se estaba leyendo; baja solo con el boton de ir al final,
// al mandar un mensaje, al cambiar de canal o volviendo abajo a mano.
(function () {
  'use strict';
  const AWAY_PX = 80;
  let tries = 0;
  (function wait() {
    const app = window.app;
    const msgs = document.getElementById('messages');
    if (!app || !msgs || typeof app._scrollToBottom !== 'function') { if (++tries < 120) setTimeout(wait, 500); return; }
    let away = false, awayChannel = null, anchor = null; // anchor: { id, top }
    let touching = false, gestureUntil = 0, allowUntil = 0;
    let lastMut = 0, restoringUntil = 0, resyncUntil = 0;
    const dist = () => msgs.scrollHeight - msgs.clientHeight - msgs.scrollTop;
    const userScrolling = () => touching || Date.now() < gestureUntil;

    // El mensaje que se esta leyendo y a que altura esta (el mismo que usa el anclaje, abajo)
    function saveAnchor() {
      const top = msgs.getBoundingClientRect().top;
      const m = leido(msgs);
      anchor = m ? { id: m.dataset.msgId, top: m.getBoundingClientRect().top - top } : null;
    }
    function restoreAnchor() {
      if (!anchor) return;
      const m = msgs.querySelector(`[data-msg-id="${CSS.escape(anchor.id)}"]`);
      if (!m) return;
      const d = (m.getBoundingClientRect().top - msgs.getBoundingClientRect().top) - anchor.top;
      if (Math.abs(d) > 1) { restoringUntil = Date.now() + 150; msgs.scrollTop += d; }
    }

    msgs.addEventListener('touchstart', () => { touching = true; }, { passive: true });
    const endTouch = () => { touching = false; gestureUntil = Date.now() + 2500; }; // el envion sigue un rato
    msgs.addEventListener('touchend', endTouch, { passive: true });
    msgs.addEventListener('touchcancel', endTouch, { passive: true });
    msgs.addEventListener('wheel', () => { gestureUntil = Date.now() + 800; }, { passive: true });
    msgs.addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse') gestureUntil = Date.now() + 1500; }, { passive: true }); // la barra de desplazamiento
    document.addEventListener('keydown', (e) => {
      if (['PageUp', 'PageDown', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key) && !(e.target instanceof Element && e.target.closest('input, textarea, [contenteditable="true"]'))) gestureUntil = Date.now() + 800;
    }, true);
    msgs.addEventListener('scroll', () => {
      if (userScrolling()) {
        away = dist() > AWAY_PX;
        awayChannel = app.currentChannel;
        if (away) saveAnchor();
        return;
      }
      // Haven llevo a otro mensaje (tocar una respuesta, un resultado de busqueda):
      // ese es el que se esta leyendo ahora. No cuando recien redibujo la lista.
      const now = Date.now();
      if (away && now > restoringUntil && now - lastMut > 1000) saveAnchor();
    }, { passive: true });

    // Mandar un mensaje: ahi si, al final (como en Discord)
    const allow = () => { allowUntil = Date.now() + 4000; away = false; };
    document.addEventListener('click', (e) => { if (e.target instanceof Element && e.target.closest('#send-btn')) allow(); }, true);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && e.target instanceof Element && e.target.closest('#message-input-area')) allow();
    }, true);

    const blocked = (self) => {
      if (!away) return false;
      if (self.currentChannel !== awayChannel) { away = false; return false; } // otro canal: empieza abajo
      if (Date.now() < allowUntil) { away = false; return false; }
      return true;
    };
    const orig = app._scrollToBottom;
    app._scrollToBottom = function (...a) {
      if (blocked(this)) { restoreAnchor(); return; }
      return orig.apply(this, a);
    };
    if (typeof app._jumpToLatest === 'function') {
      const jump = app._jumpToLatest;
      app._jumpToLatest = function (...a) { away = false; return jump.apply(this, a); };
    }
    if (typeof app._reloadChannelFromPresent === 'function') {
      // Al volver a la app Haven recarga el canal: despues, de nuevo en el mensaje que se leia
      const reload = app._reloadChannelFromPresent;
      app._reloadChannelFromPresent = function (...a) { if (Date.now() < allowUntil) away = false; return reload.apply(this, a); };
    }
    // Haven recarga los mensajes tambien al volver a la app o reconectarse (y si hay
    // sin leer salta a la linea de "nuevos", sin pasar por _scrollToBottom): en ese
    // rato, despues de cada redibujo, de vuelta al mensaje que se estaba leyendo
    const resync = () => { resyncUntil = Date.now() + 8000; };
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') resync(); });
    if (app.socket && typeof app.socket.on === 'function') app.socket.on('connect', resync);
    new MutationObserver(() => {
      lastMut = Date.now();
      if (!away || app.currentChannel !== awayChannel || userScrolling() || lastMut > resyncUntil) return;
      requestAnimationFrame(restoreAnchor);
      setTimeout(restoreAnchor, 350); // Haven vuelve a bajar a los 300 ms
    }).observe(msgs, { childList: true });
  })();
})();

// En el celular, abrir la app no abre el teclado. Si se salio de la app con el teclado abierto, la caja
// de escribir quedaba elegida y al volver Android lo volvia a abrir solo, tapando media pantalla. Al irse
// de la app (o al volver, sin haber tocado nada todavia) se suelta la caja: lo escrito queda, y el
// teclado sale al tocarla, como en Discord. En la PC no cambia nada.
(function () {
  'use strict';
  const tactil = () => matchMedia('(pointer: coarse)').matches;
  const escribiendo = () => {
    const a = document.activeElement;
    return a && a !== document.body && (a.tagName === 'TEXTAREA' || (a.tagName === 'INPUT' && !/^(button|checkbox|radio|range|submit|file|color)$/i.test(a.type)) || a.isContentEditable) ? a : null;
  };
  let toco = 0;
  for (const t of ['pointerdown', 'touchstart', 'keydown']) document.addEventListener(t, () => { toco = Date.now(); }, { capture: true, passive: true });
  const soltar = () => { if (!tactil()) return; const a = escribiendo(); if (a) try { a.blur(); } catch { /* sigue */ } };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { soltar(); return; }
    const vuelta = Date.now();
    // (al volver, Android puede elegirla de nuevo un instante despues)
    for (const ms of [0, 150, 500]) setTimeout(() => { if (toco < vuelta) soltar(); }, ms);
  });
  addEventListener('pagehide', soltar);
  // Al abrir la app desde cero, lo mismo durante el primer momento
  const inicio = Date.now();
  for (const ms of [300, 1000, 2500]) setTimeout(() => { if (toco < inicio) soltar(); }, ms);
})();

// Arriba de la lista de canales: la "Guía del club" y la tarjeta "Ahora en el club" (club.js).
//  - #bienvenida y #das-deglas salen de la lista: sus mensajes se ven en la Guía, los mismos (con sus
//    reacciones, que se pueden tocar como en el chat; el enlace al mensaje de las reglas con su
//    tarjeta, que lleva al original). Los canales siguen existiendo: para cambiar la bienvenida o las
//    reglas se edita el mensaje ahi (los administradores tienen el atajo en la Guía). Si hay algo
//    nuevo en esos canales, la fila de la Guía lo marca con un puntito.
//  - La Guía se abre sola la primera vez que alguien entra a CV Chat en ese dispositivo.
//  - La categoria "SERVER STATS" (canales que solo mostraban un numero en el nombre) sale de la lista:
//    la tarjeta muestra quienes estan conectados y alguna mesa esperando rival; tocandola se abre
//    "El club hoy" (mensajes de hoy, cuantos hay en Discord y en CV Chat, mesas, los que se sumaron).
(function () {
  'use strict';
  const GUIA = [{ canal: 'bienvenida', titulo: 'Bienvenida' }, { canal: 'das-deglas', titulo: 'Reglas' }];
  const STATS = /server\s*stats/i;
  const BIENVENIDA_EN = 'cosas'; // a donde lleva "Darles la bienvenida"
  // los juegos, de sus fichas (registroJuegos): su dibujito, si sus mesas son de a dos y como sumarse
  let clubJuegos = [];
  const fichaClub = (id) => clubJuegos.find((j) => j.id === id) || {};
  const icono = (id) => fichaClub(id).icono || '🎲';
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/^#/, '').trim();
  const token = () => { try { return localStorage.getItem('haven_token'); } catch { return null; } };
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null && text !== '') n.textContent = text; return n; };
  const num = (n) => Number(n || 0).toLocaleString('es-AR');
  // Primera vez en este dispositivo (antes de que se anote el primer canal abierto)
  let primeraVez = false;
  try { primeraVez = !localStorage.getItem('puente_ultimo_canal') && !localStorage.getItem('puente_guia_vista'); } catch { /* sin almacenamiento */ }

  let app = null, datos = null, arriba = null, fila = null, tarjeta = null, hoja = null;

  const canalDe = (nombre) => (app.channels || []).find(c => c && !c.is_dm && !c.is_group && norm(c.name) === norm(nombre));
  const guia = () => GUIA.map(g => { const c = canalDe(g.canal); return c ? { ...g, code: c.code, ch: c } : null; }).filter(Boolean);
  function ocultos() {
    const s = new Set(guia().map(g => g.code));
    for (const c of app.channels || []) if (c && !c.is_dm && STATS.test(String(c.category || ''))) s.add(c.code);
    return s;
  }
  window.puenteClub = { cerrar: () => cerrar(), oculto: (code) => { if (!app) app = window.app; return !!(app && Array.isArray(app.channels) && ocultos().has(code)); } };

  // ── La lista ──
  function pintar() {
    const list = document.getElementById('channel-list');
    if (!list) return;
    const fuera = ocultos();
    const porCat = new Map();
    for (const it of list.querySelectorAll('.channel-item[data-code]')) {
      const o = fuera.has(it.dataset.code);
      if (it.classList.contains('puente-oculto') !== o) it.classList.toggle('puente-oculto', o);
      const cat = it.dataset.catGroup;
      if (cat != null) { const v = porCat.get(cat) || { todos: 0, fuera: 0 }; v.todos++; if (o) v.fuera++; porCat.set(cat, v); }
    }
    for (const h of list.querySelectorAll('.category-label[data-category]')) {
      const v = porCat.get(h.dataset.category);
      const o = !!(v && v.todos && v.todos === v.fuera);
      if (h.classList.contains('puente-oculto') !== o) h.classList.toggle('puente-oculto', o);
    }
    if (!guia().length && !datos) return;
    if (!arriba) armarArriba();
    if (list.firstElementChild !== arriba) list.insertBefore(arriba, list.firstChild);
    // Algo nuevo en la bienvenida o las reglas: el puntito
    const nuevo = guia().some(g => (app.unreadCounts && app.unreadCounts[g.code]) > 0);
    fila.classList.toggle('puente-guia-nuevo', nuevo);
    fila.hidden = !guia().length;
  }

  function armarArriba() {
    arriba = el('div', 'puente-club-arriba');
    fila = el('button', 'puente-guia-fila');
    fila.type = 'button';
    fila.append(el('span', 'puente-guia-icono', '📖'), el('span', 'puente-guia-nombre', 'Guía del club'), el('span', 'puente-guia-sub', 'bienvenida y reglas'), el('span', 'puente-guia-punto'));
    fila.addEventListener('click', abrirGuia);
    tarjeta = el('div', 'puente-club-tarjeta');
    tarjeta.setAttribute('role', 'button'); tarjeta.tabIndex = 0; tarjeta.hidden = true;
    tarjeta.addEventListener('click', (e) => { if (e.target instanceof Element && e.target.closest('a[href]')) return; abrirHoy(); });
    tarjeta.addEventListener('keydown', (e) => { if (e.key === 'Enter') abrirHoy(); });
    arriba.append(fila, tarjeta);
  }

  function foto(p, cls) {
    const c = el('span', 'puente-club-foto' + (cls ? ' ' + cls : ''));
    if (p && p.foto) { const i = el('img'); i.src = p.foto; i.alt = ''; i.loading = 'lazy'; i.onerror = () => { i.remove(); c.textContent = inicial(p); }; c.append(i); }
    else c.textContent = inicial(p);
    if (p && p.nombre) c.title = p.nombre;
    return c;
  }
  const inicial = (p) => String((p && p.nombre) || '?').trim().charAt(0).toUpperCase() || '?';
  const mesaTexto = (m) => m.quien + (fichaClub(m.juego).jugadores === 2 ? ' espera rival' : ' espera jugadores');
  // (una mesa que espera rival: el boton pregunta si jugar o mirar, en la ventanita)
  function entrar(m) { const b = el('button', 'puente-club-entrar', 'Entrar'); b.type = 'button'; b.addEventListener('click', (e) => { e.stopPropagation(); ventanaMesa(m, true); }); return b; }
  // Abre un enlace del club aca mismo (lo agarra el que abre las mesas de los juegos); antes cierra la hoja de "El club hoy" si estaba abierta
  const irA = (href) => { cerrar(); const a = document.createElement('a'); a.href = href; a.hidden = true; document.body.append(a); a.click(); a.remove(); };
  // Sumarse a una mesa que espera rival: el evento de cada juego, y despues se abre la mesa
  function jugar(x, boton, cerrar) {
    const s = window.app && window.app.socket, ev = (fichaClub(x.juego).eventos || {}).unirse;
    let id = null; try { id = new URL(x.enlace, location.origin).searchParams.get(x.juego); } catch { /* sin id */ }
    if (!s || !s.connected || !ev || !id) { if (cerrar) cerrar(); irA(x.enlace); return; }
    boton.disabled = true;
    s.emit(ev, { id }, (r) => {
      boton.disabled = false;
      if (r && r.error) { try { window.app._showToast(r.error, 'error'); } catch { /* sin aviso */ } return; }
      if (cerrar) cerrar();
      irA(x.enlace);
    });
  }

  function pintarTarjeta() {
    if (!tarjeta || !datos) return;
    tarjeta.replaceChildren();
    const cab = el('div', 'puente-club-cab');
    const n = el('span', 'puente-club-n');
    n.append(el('span', 'puente-club-punto'), document.createTextNode(datos.conectados === 1 ? '1 conectado' : num(datos.conectados) + ' conectados'));
    cab.append(el('span', 'puente-club-titulo', 'AHORA EN EL CLUB'), el('span', 'puente-club-flecha', '›'));
    tarjeta.append(cab);
    const fotos = el('div', 'puente-club-fotos');
    tarjeta.append(fotos);
    if (datos.fotos && datos.fotos.length) {
      const caras = el('div', 'puente-club-caras');
      const MAX = 4;
      datos.fotos.slice(0, MAX).forEach(p => caras.append(foto(p)));
      const resto = datos.conectados - Math.min(MAX, datos.fotos.length);
      if (resto > 0) caras.append(el('span', 'puente-club-foto puente-club-mas', '+' + resto));
      fotos.append(caras);
    }
    fotos.append(n);
    // Una partida propia (la que se esta jugando o la que espera rival): primero, con "Volver"
    const mia = (datos.mias || [])[0];
    if (mia && mia.enlace) {
      const r = el('div', 'puente-club-mesa');
      const t = el('span', 'puente-club-mesa-txt');
      const yo = String((window.app && window.app.user && (window.app.user.displayName || window.app.user.username)) || '').toLowerCase();
      const otros = (mia.quienes || []).filter(q => String(q).toLowerCase() !== yo);
      t.append(el('b', '', mia.nombre + ':'), document.createTextNode(' ' + (mia.quienes ? (otros.length ? 'tu partida con ' + otros.join(', ') : 'tu partida') : 'tu mesa espera rival')));
      // (si ya te toca: 'Te toca', titilando suave)
      const b = el('button', 'puente-club-entrar' + (mia.teToca ? ' puente-club-tetoca' : ''), mia.teToca ? 'Te toca' : 'Volver'); b.type = 'button'; b.title = mia.teToca ? 'Te toca jugar' : 'Volver a tu partida';
      r.append(el('span', 'puente-club-mesa-ico', icono(mia.juego)), t, b);
      r.title = 'Volver a tu partida';
      r.addEventListener('click', (e) => { e.stopPropagation(); irA(mia.enlace); });
      tarjeta.append(r);
      tarjeta.hidden = false;
      return;
    }
    const m = (datos.abiertas || [])[0];
    // (si no hay ninguna esperando rival: la que se esta jugando ahora entre gente del club)
    const j = m ? null : (datos.enJuego || [])[0];
    if (m || j) {
      const r = el('div', 'puente-club-mesa');
      const t = el('span', 'puente-club-mesa-txt');
      const q = j && j.quienes;
      t.append(el('b', '', (m || j).nombre + ':'), document.createTextNode(' ' + (m ? mesaTexto(m) : q.slice(0, -1).join(', ') + ' y ' + q[q.length - 1] + ' están jugando')));
      r.append(el('span', 'puente-club-mesa-ico', icono((m || j).juego)), t);
      if (m) r.append(entrar(m));
      else if (j.enlace) { const a = el('a', 'puente-club-entrar', 'Mirar'); a.href = j.enlace; a.title = 'Mirar la partida'; r.append(a); }
      // tocar la partida (no el boton): la ventanita con el detalle (en el celular el renglon queda cortado)
      r.title = 'Ver la partida';
      r.addEventListener('click', (e) => {
        if (e.target instanceof Element && e.target.closest('a[href]')) { e.stopPropagation(); return; }
        e.stopPropagation(); ventanaMesa(m || j, !!m);
      });
      tarjeta.append(r);
    }
    tarjeta.hidden = false;
  }

  // La ventanita de una partida de la tarjeta: el juego, como esta, quienes juegan y el boton (Mirar o Entrar)
  function ventanaMesa(x, abierta) {
    document.querySelector('.puente-club-ventana-fondo')?.remove();
    const fondo = el('div', 'puente-club-ventana-fondo');
    const v = el('div', 'puente-club-ventana');
    v.setAttribute('role', 'dialog'); v.setAttribute('aria-label', x.nombre);
    const cerrar = () => { fondo.remove(); document.removeEventListener('keydown', esc); };
    const esc = (e) => { if (e.key === 'Escape') cerrar(); };
    document.addEventListener('keydown', esc);
    fondo.addEventListener('click', (e) => { if (e.target === fondo) cerrar(); });
    const cab = el('div', 'puente-club-ventana-cab');
    cab.append(el('span', 'puente-club-ventana-ico', icono(x.juego)), el('span', 'puente-club-ventana-t', x.nombre));
    v.append(cab);
    if (abierta) {
      v.append(el('div', 'puente-club-ventana-s', mesaTexto(x) + (x.detalle ? ' · ' + x.detalle : '')));
      v.append(el('div', 'puente-club-ventana-sub', 'Arma la mesa'));
      const l = el('ul', 'puente-club-ventana-lista'); l.append(el('li', '', x.quien)); v.append(l);
    } else {
      v.append(el('div', 'puente-club-ventana-s', 'Se está jugando ahora'));
      v.append(el('div', 'puente-club-ventana-sub', (x.quienes || []).length === 1 ? 'Juega' : 'Juegan'));
      const l = el('ul', 'puente-club-ventana-lista');
      for (const q of x.quienes || []) l.append(el('li', '', q));
      v.append(l);
    }
    const acc = el('div', 'puente-club-ventana-acc');
    const c = el('button', 'puente-club-ventana-cerrar', 'Cerrar'); c.type = 'button'; c.addEventListener('click', cerrar);
    acc.append(c);
    // (los botones abren la mesa aca mismo y cierran la ventanita; una que espera rival: jugarla o solo mirarla)
    if (x.enlace && abierta) {
      v.append(el('div', 'puente-club-ventana-pregunta', '¿Querés jugar esta partida o solo mirarla?'));
      const mi = el('button', 'puente-club-ventana-cerrar', '👀 Mirar'); mi.type = 'button';
      mi.addEventListener('click', () => { cerrar(); irA(x.enlace); });
      const ju = el('button', 'puente-club-entrar', 'Jugar'); ju.type = 'button';
      ju.addEventListener('click', () => jugar(x, ju, cerrar));
      acc.append(mi, ju);
    } else if (x.enlace) {
      const a = el('button', 'puente-club-entrar', '👀 Mirar'); a.type = 'button';
      a.addEventListener('click', () => { cerrar(); irA(x.enlace); });
      acc.append(a);
    }
    v.append(acc);
    fondo.append(v);
    document.body.append(fondo);
  }

  let pidiendo = false;
  async function traerDatos() {
    const tk = token();
    if (!tk || pidiendo) return;
    pidiendo = true;
    try {
      const r = await fetch('/puente/api/club', { headers: { Authorization: 'Bearer ' + tk } });
      if (r.ok) { datos = await r.json(); pintar(); pintarTarjeta(); if (hoja && hoja.dataset.que === 'hoy') llenarHoy(); }
    } catch { /* la proxima */ }
    pidiendo = false;
  }

  // ── Las hojas (la Guía y "El club hoy"): toda la pantalla en el celular, una ventana en la PC ──
  function cerrar() {
    if (!hoja) return;
    // (se va con un fundido corto: si desaparece de golpe debajo del dedo, Android pinta un destello)
    const h = hoja; hoja = null;
    h.classList.add('puente-hoja-saliendo');
    setTimeout(() => h.remove(), matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 160);
    document.removeEventListener('keydown', tecla, true);
  }
  function tecla(e) { if (e.key === 'Escape') { e.stopPropagation(); cerrar(); } }
  function abrirHoja(que, titulo, icono) {
    cerrar();
    hoja = el('div', 'puente-hoja-fondo');
    hoja.dataset.que = que;
    const h = el('div', 'puente-hoja');
    h.id = que === 'guia' ? 'puente-guia' : 'puente-club-hoy';
    h.setAttribute('role', 'dialog'); h.setAttribute('aria-label', titulo);
    const cab = el('div', 'puente-hoja-cab');
    if (icono) cab.append(el('span', 'puente-hoja-icono', icono));
    cab.append(el('span', 'puente-hoja-titulo', titulo));
    const x = el('button', 'puente-hoja-x', '✕'); x.type = 'button'; x.title = 'Cerrar'; x.addEventListener('click', cerrar);
    cab.append(x);
    const cuerpo = el('div', 'puente-hoja-cuerpo');
    h.append(cab, cuerpo);
    hoja.append(h);
    hoja.addEventListener('click', (e) => { if (e.target === hoja) cerrar(); });
    document.body.append(hoja);
    document.addEventListener('keydown', tecla, true);
    return cuerpo;
  }
  // Lo que lleva a otro lado (un canal, un mensaje, una mesa): se cierra la hoja y el panel de canales del celular
  document.addEventListener('click', (e) => {
    const t = e.target instanceof Element ? e.target : null;
    if (!t) return;
    const enHoja = hoja && hoja.contains(t), enTarjeta = tarjeta && tarjeta.contains(t);
    if (!enHoja && !enTarjeta) return;
    if (!t.closest('a[href], .puente-vista-chat, [data-ir]')) return;
    setTimeout(() => { if (enHoja) cerrar(); try { app && app._closeMobilePanels && app._closeMobilePanels(); } catch { /* sigue */ } }, 0);
  }, true);

  // ── La Guía ──
  // Los mensajes de un canal, como los manda Haven (con sus reacciones y autores)
  function traer(code, actual) {
    return new Promise((res) => {
      const s = app.socket;
      if (!s) return res(null);
      let t = null;
      const on = (d) => { if (!d || d.channelCode !== code || d.around) return; s.off('message-history', on); clearTimeout(t); res(Array.isArray(d.messages) ? d.messages : []); };
      s.on('message-history', on);
      t = setTimeout(() => { s.off('message-history', on); res(null); }, 8000);
      // (si justo es el canal abierto, se pide como lo pide Haven: le llega lo mismo)
      s.emit('get-messages', actual ? { code } : { code, limit: 20 });
    });
  }
  function marcarLeido(g) {
    const ch = g.ch;
    if (!ch || !(app.unreadCounts && app.unreadCounts[g.code] > 0) || !ch.latestMessageId) return;
    try { app.socket.emit('mark-read', { code: g.code, messageId: ch.latestMessageId }); } catch { return; }
    app.unreadCounts[g.code] = 0;
    try { app._updateBadge && app._updateBadge(g.code); } catch { /* sigue */ }
    pintar();
  }
  async function abrirGuia() {
    try { localStorage.setItem('puente_guia_vista', '1'); } catch { /* sin almacenamiento */ }
    const cuerpo = abrirHoja('guia', 'Guía del club', '📖');
    const lista = guia();
    const cajas = lista.map(g => {
      const sec = el('section', 'puente-guia-sec');
      sec.dataset.code = g.code;
      const cab = el('div', 'puente-guia-sec-cab');
      cab.append(el('span', 'puente-guia-sec-titulo', g.titulo.toUpperCase()));
      if (app.user && app.user.isAdmin) {
        const ed = el('button', 'puente-guia-editar', 'Editar en #' + g.ch.name); ed.type = 'button'; ed.dataset.ir = '1';
        ed.addEventListener('click', () => { cerrar(); app.switchChannel(g.code); });
        cab.append(ed);
      }
      const msgs = el('div', 'puente-guia-msgs', 'Cargando…');
      sec.append(cab, msgs);
      cuerpo.append(sec);
      return { g, msgs };
    });
    const pie = el('div', 'puente-guia-pie', 'La volvés a ver tocando "Guía del club", arriba de los canales');
    cuerpo.append(pie);
    for (const { g, msgs } of cajas) {
      const lista = await traer(g.code, app.currentChannel === g.code);
      if (!hoja || !msgs.isConnected) return;
      msgs.replaceChildren();
      if (!lista) { msgs.textContent = 'No se pudo cargar. Probá de nuevo en un momento.'; continue; }
      const orden = lista.slice().sort((a, b) => a.id - b.id);
      let prev = null;
      for (const m of orden) {
        try { msgs.append(app._createMessageEl(m, prev)); prev = m; } catch (err) { console.warn('[puente] guia: mensaje', err); }
      }
      if (!orden.length) msgs.textContent = 'Todavía no hay nada acá.';
      try { app._fetchLinkPreviews && app._fetchLinkPreviews(msgs); } catch { /* sin vistas previas */ }
      marcarLeido(g);
    }
  }
  // Las reacciones de la Guía: tocarlas suma o saca la propia, como en el chat
  function reaccionesDe(id, reacciones) {
    if (!hoja || hoja.dataset.que !== 'guia') return;
    const m = hoja.querySelector('.message[data-msg-id="' + id + '"], .message-compact[data-msg-id="' + id + '"]');
    if (!m) return;
    const viejo = m.querySelector('.reactions-row'); if (viejo) viejo.remove();
    let html = '';
    try { html = app._renderReactions(id, reacciones || []); } catch { return; }
    const cont = m.querySelector('.message-content');
    if (html && cont) cont.insertAdjacentHTML('afterend', html);
  }
  document.addEventListener('click', (e) => {
    const b = hoja && hoja.dataset.que === 'guia' && e.target instanceof Element && e.target.closest('#puente-guia .reaction-badge');
    if (!b) return;
    e.preventDefault(); e.stopPropagation();
    const m = b.closest('.message, .message-compact');
    const id = m && parseInt(m.dataset.msgId, 10), emoji = b.dataset.emoji;
    if (!id || !emoji) return;
    app.socket.emit(b.classList.contains('own') ? 'remove-reaction' : 'add-reaction', { messageId: id, emoji });
    // (la respuesta llega con "reactions-updated"; si no llega, se vuelve a pedir el canal)
    const sec = b.closest('.puente-guia-sec');
    const code = sec && sec.dataset.code;
    setTimeout(async () => {
      if (!code || !hoja) return;
      const lista = await traer(code, app.currentChannel === code);
      const msg = lista && lista.find(x => x.id === id);
      if (msg) reaccionesDe(id, msg.reactions);
    }, 900);
  }, true);

  // ── El club hoy ──
  function caja(titulo) { const c = el('div', 'puente-club-caja'); c.append(el('div', 'puente-club-caja-tit', titulo)); return c; }
  function dato(titulo, valor, punto, unidad) {
    const c = el('div', 'puente-club-dato');
    c.append(el('div', 'puente-club-caja-tit', titulo));
    const v = el('div', 'puente-club-valor');
    if (punto) v.append(el('span', 'puente-club-punto'));
    v.append(document.createTextNode(num(valor)));
    if (unidad) v.append(el('span', 'puente-club-unidad', unidad)); // (que se entienda que son personas, no mensajes)
    c.append(v);
    return c;
  }
  function llenarHoy() {
    const cuerpo = hoja && hoja.querySelector('.puente-hoja-cuerpo');
    if (!cuerpo || !datos) return;
    cuerpo.replaceChildren();
    const grilla = el('div', 'puente-club-datos');
    grilla.append(dato('CONECTADOS', datos.conectados, true), dato('MENSAJES HOY', datos.mensajesHoy));
    if (datos.discord) grilla.append(dato('EN DISCORD', datos.discord, false, 'miembros'));
    grilla.append(dato('EN CV CHAT', datos.cuentas, false, datos.cuentas === 1 ? 'miembro' : 'miembros'));
    cuerpo.append(grilla);
    if (datos.fotos && datos.fotos.length) {
      const c = caja('CONECTADOS AHORA');
      const g = el('div', 'puente-club-gente');
      for (const p of datos.fotos) { const x = el('span', 'puente-club-persona'); x.append(foto(p, 'chica'), el('span', '', p.nombre)); g.append(x); }
      if (datos.conectados > datos.fotos.length) g.append(el('span', 'puente-club-persona puente-club-gris', 'y ' + num(datos.conectados - datos.fotos.length) + ' más'));
      c.append(g); cuerpo.append(c);
    }
    const mesas = caja('ESPERANDO RIVAL');
    if (datos.abiertas && datos.abiertas.length) {
      for (const m of datos.abiertas) {
        const r = el('div', 'puente-club-mesa');
        const t = el('span', 'puente-club-mesa-txt');
        t.append(el('b', '', m.nombre), document.createTextNode((m.detalle ? ' ' + m.detalle : '') + ' · ' + m.quien));
        r.append(el('span', 'puente-club-mesa-ico', icono(m.juego)), t, entrar(m));
        mesas.append(r);
      }
    } else {
      const r = el('div', 'puente-club-gris', 'Ninguna mesa esperando ahora. ');
      const a = el('a', 'puente-club-link', 'Armar una partida ›'); a.href = '/app?juegos';
      r.append(a); mesas.append(r);
    }
    cuerpo.append(mesas);
    if (datos.nuevos && datos.nuevos.length) {
      const c = caja(datos.nuevos.length === 1 ? 'SE SUMÓ HOY' : 'SE SUMARON HOY');
      const g = el('div', 'puente-club-gente');
      for (const p of datos.nuevos) { const x = el('span', 'puente-club-persona'); x.append(foto(p, 'chica'), el('span', '', p.nombre)); g.append(x); }
      c.append(g);
      const destino = canalDe(BIENVENIDA_EN);
      if (destino) {
        const b = el('button', 'puente-club-link', (datos.nuevos.length === 1 ? 'Darle' : 'Darles') + ' la bienvenida en #' + destino.name + ' ›');
        b.type = 'button'; b.dataset.ir = '1';
        b.addEventListener('click', () => { cerrar(); app.switchChannel(destino.code); });
        c.append(b);
      }
      cuerpo.append(c);
    }
  }
  function abrirHoy() {
    abrirHoja('hoy', 'El club hoy');
    llenarHoy();
    traerDatos();
  }

  let tries = 0;
  (function wait() {
    app = window.app;
    if (!app || !app.socket || typeof app.switchChannel !== 'function' || typeof app._createMessageEl !== 'function' || !Array.isArray(app.channels) || !app.channels.length || !document.getElementById('channel-list')) {
      if (++tries < 240) setTimeout(wait, 500); return;
    }
    if (app.user && app.user.isGuest) return; // (los invitados del Truco no ven canales)
    const list = document.getElementById('channel-list');
    let pend = false;
    new MutationObserver(() => { if (!pend) { pend = true; requestAnimationFrame(() => { pend = false; pintar(); }); } }).observe(list, { childList: true });
    // Los numeritos de sin leer cambian sin redibujar la lista
    if (typeof app._updateBadge === 'function') {
      const orig = app._updateBadge;
      app._updateBadge = function (...a) { const r = orig.apply(this, a); try { if (fila) fila.classList.toggle('puente-guia-nuevo', guia().some(g => (this.unreadCounts && this.unreadCounts[g.code]) > 0)); } catch { /* sigue */ } return r; };
    }
    app.socket.on('reactions-updated', (d) => { if (d && d.messageId) reaccionesDe(d.messageId, d.reactions); });
    pintar();
    traerDatos();
    setInterval(() => { if (document.visibilityState === 'visible') traerDatos(); }, 60e3);
    // Cuando se arma, empieza o termina una partida (los juegos avisan a todos): la tarjeta al dia, sin
    // pedir de mas (como mucho una vez cada 3 segundos)
    let cambioT = null;
    // (y cuando cambia el turno de una partida propia: para el 'Te toca')
    // (los "cambio" de todos los juegos; los "estado" solo de los de pantalla: los de ventana mandan la partida en vivo)
    const alCambio = () => { if (!cambioT) cambioT = setTimeout(() => { cambioT = null; if (document.visibilityState === 'visible') traerDatos(); }, 3000); };
    (function conFichas() {
      registroJuegos().then((js) => {
        clubJuegos = js;
        for (const j of js) {
          const ev = j.eventos || {};
          if (ev.cambio) app.socket.on(ev.cambio, alCambio);
          if (ev.estado && j.cliente && j.cliente.tipo === 'pantalla') app.socket.on(ev.estado, alCambio);
        }
        pintarTarjeta();
      }).catch(() => setTimeout(conFichas, 10000));
    })();
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') traerDatos(); });
    document.getElementById('mobile-menu-btn')?.addEventListener('click', () => traerDatos());
    // La primera vez en este dispositivo, la Guía sola
    // (espera a que no haya otra ventana abierta, como el aviso de las notificaciones, hasta medio minuto)
    if (primeraVez && guia().length) {
      let n = 0;
      const probar = () => {
        const otra = [...document.querySelectorAll('.modal-overlay, .modal')].some(m => m.offsetParent !== null && getComputedStyle(m).display !== 'none');
        if (!otra && !hoja) { abrirGuia(); return; }
        if (++n < 30) setTimeout(probar, 1000);
      };
      setTimeout(probar, 1500);
    }
  })();
})();

// Candadito en el # de los canales cerrados, como en Discord: los de Discord que
// @everyone no ve y los privados propios de Haven (el puente sabe cuales,
// /puente/api/canales-cerrados). Se vuelve a poner cada vez que Haven redibuja
// la lista de canales.
(function () {
  'use strict';
  let locked = new Set();
  const token = () => { try { return localStorage.getItem('haven_token'); } catch { return null; } };
  function paint() {
    for (const item of document.querySelectorAll('#channel-list .channel-item[data-code]')) {
      const on = locked.has(item.dataset.code);
      if (item.classList.contains('puente-cerrado') !== on) item.classList.toggle('puente-cerrado', on);
    }
  }
  function load() {
    const tk = token();
    if (!tk) return;
    fetch('/puente/api/canales-cerrados', { headers: { Authorization: 'Bearer ' + tk } })
      .then(r => (r.ok ? r.json() : null)).then(d => { if (d && Array.isArray(d.codigos)) { locked = new Set(d.codigos); paint(); } }).catch(() => {});
  }
  let tries = 0;
  (function wait() {
    const list = document.getElementById('channel-list');
    if (!list || !token()) { if (++tries < 120) setTimeout(wait, 500); return; }
    let pending = false;
    new MutationObserver(() => { if (!pending) { pending = true; requestAnimationFrame(() => { pending = false; paint(); }); } })
      .observe(list, { childList: true, subtree: true });
    load();
    setInterval(load, 5 * 60 * 1000);
  })();
})();

// La campanita adentro de la app (campana.js), a la derecha del nombre del servidor: las respuestas
// y menciones de CV Chat y las del foro, las mismas de la campanita de la web. El numerito se
// actualiza en el momento ("puente-campana"); al abrirla quedan vistas. Tocar un aviso lleva al
// mensaje, o al post del foro adentro de la app. En el celular la lista ocupa toda la pantalla.
(function () {
  'use strict';
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null && text !== '') n.textContent = text; return n; };
  const token = () => { try { return localStorage.getItem('haven_token'); } catch { return null; } };
  const celular = () => matchMedia('(max-width: 768px), (pointer: coarse)').matches;
  const CAMPANA = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm7-6V11a7 7 0 0 0-5.5-6.84V3.5a1.5 1.5 0 0 0-3 0v.66A7 7 0 0 0 5 11v5l-1.7 1.7A1 1 0 0 0 4 19.4h16a1 1 0 0 0 .7-1.7L19 16Z"/></svg>';
  let btn = null, badge = null, panel = null, n = 0;
  function ago(ms) {
    const s = Math.max(0, (Date.now() - ms) / 1000);
    for (const [sec, one, many] of [[86400, 'día', 'días'], [3600, 'hora', 'horas'], [60, 'minuto', 'minutos']]) if (s >= sec) { const k = Math.floor(s / sec); return 'hace ' + k + ' ' + (k === 1 ? one : many); }
    return 'recién';
  }
  function pintar() {
    if (!badge) return;
    badge.textContent = n > 99 ? '99+' : String(n);
    badge.hidden = !n;
    if (btn) btn.title = n ? 'Notificaciones (' + n + ' sin leer)' : 'Notificaciones';
  }
  function contar() {
    const tk = token(); if (!tk) return;
    fetch('/puente/api/campana', { headers: { Authorization: 'Bearer ' + tk } })
      .then(r => (r.ok ? r.json() : null)).then(d => { if (d) { n = d.sinLeer || 0; pintar(); } }).catch(() => {});
  }
  function cerrar() {
    if (!panel) return;
    panel.remove(); panel = null;
    document.removeEventListener('mousedown', fuera, true); document.removeEventListener('keydown', tecla, true);
  }
  function fuera(e) { if (panel && !panel.contains(e.target) && !(btn && btn.contains(e.target))) cerrar(); }
  function tecla(e) { if (e.key === 'Escape') { e.stopPropagation(); cerrar(); } }
  function ir(a) {
    cerrar();
    const url = String(a.url || '');
    const foro = /^https?:\/\/foro\./.test(url);
    if (foro && window.puenteForo) { try { const u = new URL(url); window.puenteForo.abrir(u.pathname + u.search + u.hash); return; } catch { /* abajo */ } }
    if (!foro && window.puenteEnlaces && window.puenteEnlaces.abrir(url)) return;
    if (url) location.href = url;
  }
  function abrir() {
    if (panel) { cerrar(); return; }
    panel = el('div', 'puente-campana-panel' + (celular() ? ' pc-celular' : ''));
    panel.id = 'puente-campana-panel';
    const cab = el('div', 'pc-cab');
    cab.appendChild(el('span', 'pc-titulo', 'Notificaciones'));
    const x = el('button', 'pc-cerrar'); x.type = 'button'; x.setAttribute('aria-label', 'Cerrar'); x.textContent = '✕';
    x.addEventListener('click', cerrar);
    cab.appendChild(x);
    const lista = el('div', 'pc-lista');
    lista.appendChild(el('div', 'pc-vacio', 'Cargando…'));
    panel.append(cab, lista);
    if (!celular() && btn) {
      const r = btn.getBoundingClientRect();
      panel.style.top = (r.bottom + 6) + 'px';
      panel.style.left = Math.max(8, Math.min(r.left - 8, innerWidth - 400)) + 'px';
    }
    document.body.appendChild(panel);
    document.addEventListener('mousedown', fuera, true); document.addEventListener('keydown', tecla, true);
    fetch('/puente/api/campana', { headers: { Authorization: 'Bearer ' + token() } })
      .then(r => (r.ok ? r.json() : Promise.reject(r.status))).then(d => {
        if (!panel) return;
        lista.textContent = '';
        const avisos = (d && d.avisos) || [];
        if (!avisos.length) lista.appendChild(el('div', 'pc-vacio', 'Todavía no tenés notificaciones. Acá vas a ver cuando te respondan o te mencionen, en CV Chat y en el foro.'));
        for (const a of avisos) {
          const it = el('button', 'pc-item' + (a.leido ? '' : ' pc-nueva')); it.type = 'button';
          it.appendChild(el('span', 'pc-icono', a.origen === 'foro' ? '🗨️' : '💬'));
          const tx = el('span', 'pc-textos');
          tx.appendChild(el('span', 'pc-t1', a.titulo));
          if (a.texto) tx.appendChild(el('span', 'pc-t2', a.texto));
          tx.appendChild(el('span', 'pc-t3', (a.origen === 'foro' ? 'Foro · ' : 'CV Chat · ') + ago(a.fecha)));
          it.appendChild(tx);
          it.addEventListener('click', () => ir(a));
          lista.appendChild(it);
        }
        // Abierta: quedan vistas
        if (d && d.sinLeer) fetch('/puente/api/campana/leer', { method: 'POST', headers: { Authorization: 'Bearer ' + token() } }).catch(() => {});
        n = 0; pintar();
      }).catch(() => { if (panel) { lista.textContent = ''; lista.appendChild(el('div', 'pc-vacio', 'No se pudieron cargar las notificaciones.')); } });
  }
  function poner() {
    const brand = document.querySelector('[data-haven-region="navigation-sidebar"] .sidebar-header .brand');
    if (!brand) return false;
    if (document.getElementById('puente-campana-btn')) return true;
    btn = el('button', 'puente-campana-btn'); btn.id = 'puente-campana-btn'; btn.type = 'button';
    btn.innerHTML = CAMPANA;
    badge = el('span', 'puente-campana-n'); badge.hidden = true;
    btn.appendChild(badge);
    btn.addEventListener('click', (e) => { e.stopPropagation(); abrir(); });
    brand.appendChild(btn);
    pintar();
    return true;
  }
  let tries = 0, enganchado = null;
  (function wait() {
    const app = window.app;
    if (!app || !app.socket || !token() || !poner()) { if (++tries < 120) setTimeout(wait, 500); return; }
    contar();
    if (enganchado !== app.socket) {
      enganchado = app.socket;
      app.socket.on('puente-campana', (d) => { n = (d && d.sinLeer) || 0; pintar(); });
      app.socket.on('connect', contar);
    }
    document.addEventListener('visibilitychange', () => { if (!document.hidden) contar(); });
    // Haven a veces vuelve a armar la barra: si se perdio el boton, se vuelve a poner
    setInterval(() => { if (!document.getElementById('puente-campana-btn')) poner(); }, 3000);
  })();
})();

// Desde donde se entra (app de Android, app de PC, iPhone, navegador del celular o de la PC): se le
// avisa al servidor una vez por apertura, para la pagina "Miembros" (presencia.js)
(function () {
  'use strict';
  const ses = (k) => { try { return sessionStorage.getItem(k); } catch { return null; } };
  const q = new URLSearchParams(location.search);
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const instalada = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  let plataforma;
  if (window.puenteApp || /CVChat\//.test(ua)) plataforma = 'pc-app';
  else if (q.get('app') === 'android' || q.get('app') === 'play' || ses('puente_app_android') || ses('puente_app_play') ||
    /^android-app:\/\/club\.circulovicioso\.chat/.test(document.referrer || '')) plataforma = 'android-app';
  else if (ios && instalada) plataforma = 'iphone-app';
  else plataforma = /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || ios ? 'celular-web' : 'pc-web';
  window.__puentePlataforma = plataforma; // (para los errores y la velocidad: mas abajo)
  let tries = 0;
  (function avisar() {
    let tk = null;
    try { tk = localStorage.getItem('haven_token'); } catch { /* sin almacenamiento */ }
    if (!tk) { if (++tries < 60) setTimeout(avisar, 2000); return; }
    fetch('/puente/api/presencia', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tk }, body: JSON.stringify({ plataforma }) }).catch(() => {});
  })();
})();

// PC: pagina "Miembros" como la de Discord (solo administradores): arriba de
// los canales, "Miembros" abre una tabla con todos los usuarios, su email (y si
// esta confirmado), desde cuando estan, su @usuario de Discord y la antiguedad de
// esa cuenta, cuantos mensajes escribieron y cuando fue el ultimo, y señales
// (administrador, sin vincular, denuncias...). La invitacion, si entraron con una, va al lado del nombre.
// Arriba, un resumen (nuevos de hoy y de la semana, cuantos confirmaron el email, vincularon Discord
// y escribieron) y filtros rapidos. "Ultima vez": cuando se conecto y desde donde entra (presencia.js);
// debajo de los mensajes, cuantos de Discord pasaron a su cuenta al vincular. Se busca por nombre y se ordena
// tocando las columnas. Tocar a alguien abre su perfil.
// En el celular: pantalla completa con una lista (como la app de Discord), un
// menu para ordenar, y el boton "atras" del telefono la cierra.
(function () {
  'use strict';
  const mobile = () => matchMedia('(max-width: 768px), (pointer: coarse)').matches;
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null && text !== '') n.textContent = text; return n; };
  const token = () => { try { return localStorage.getItem('haven_token'); } catch { return null; } };
  const ICON = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M9 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 2c-3.3 0-7 1.7-7 4.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-1.5C16 15.7 12.3 14 9 14Zm8-2a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm.5 2c-.6 0-1.2.1-1.7.2 1.3 1 2.2 2.4 2.2 4.3V20a3 3 0 0 1-.2 1H21a1 1 0 0 0 1-1v-1.2c0-2.6-2.4-4.8-4.5-4.8Z"/></svg>';
  function ago(iso) {
    if (!iso) return '—';
    const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
    const units = [[31536000, 'año', 'años'], [2592000, 'mes', 'meses'], [86400, 'día', 'días'], [3600, 'hora', 'horas'], [60, 'minuto', 'minutos']];
    for (const [sec, one, many] of units) if (s >= sec) { const n = Math.floor(s / sec); return 'hace ' + n + ' ' + (n === 1 ? one : many); }
    return 'recién';
  }
  const fecha = iso => (iso ? new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
  // minutos -> "45 min", "3 h 20 min"
  const duracion = (min) => { min = Math.round(min || 0); const h = Math.floor(min / 60), r = min % 60; return h ? h + ' h' + (r ? ' ' + r + ' min' : '') : min + ' min'; };

  let page = null, data = [], sortKey = 'desde', sortDir = -1, term = '', filtro = 'todos';
  const inicioHoy = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const FILTROS = [
    ['todos', 'Todos', () => true],
    ['hoy', 'Nuevos de hoy', m => m.desde && Date.parse(m.desde) >= inicioHoy()],
    ['sinEmail', 'Sin email confirmado', m => !m.invitado && m.email !== 'confirmado'],
    ['sinDiscord', 'Sin Discord', m => !m.discord && !m.invitado],
    ['nunca', 'No escribieron en CV Chat', m => !m.mensajes],
  ];
  const COLS = [
    ['nombre', 'NOMBRE'], ['correo', 'EMAIL'], ['desde', 'MIEMBRO DESDE'], ['discord', 'DISCORD'],
    ['mensajes', 'MENSAJES'], ['ultimo', 'ÚLTIMO MENSAJE'], ['visto', 'ÚLTIMA VEZ'], ['senales', 'SEÑALES'],
  ];
  const value = (m, k) => k === 'nombre' ? String(m.nombre).toLowerCase() : k === 'discord' ? String((m.discord && m.discord.usuario) || '').toLowerCase() :
    k === 'correo' ? String(m.correo || '').toLowerCase() : k === 'senales' ? signals(m).length : (m[k] ?? '');
  // Cada tipo de etiqueta tiene su color de fondo (Discord, email, admin...); cuando falta, el texto va
  // en rojo sobre ese mismo fondo (" falta"). Siempre en el mismo orden: (email,) Discord, si nunca
  // escribio, 2 pasos, admin, invitado, denuncias
  function signals(m, conDiscord) {
    const out = [];
    // ("En línea" ya va en la columna "Última vez")
    if (conDiscord && m.discord) out.push(['@' + m.discord.usuario, 'discord']);
    else if (!m.discord && !m.invitado) out.push(['Sin Discord', 'discord falta']);
    // Entro hace entre 1 y 7 dias y nunca mando un mensaje en CV Chat: para darle la bienvenida (a
    // todos los que nunca escribieron los muestra el filtro "No escribieron en CV Chat")
    const hace = m.desde ? Date.now() - Date.parse(m.desde) : 0;
    if (!m.invitado && !m.mensajes && hace > 864e5 && hace <= 7 * 864e5) out.push(['Todavía no escribió', 'actividad falta']);
    if (m.dosPasos) out.push(['2 pasos', 'dospasos']);
    if (m.admin) out.push(['Admin', 'admin']);
    if (m.invitado) out.push(['Invitado', 'gris']);
    if (m.denuncias) out.push([m.denuncias + (m.denuncias === 1 ? ' denuncia' : ' denuncias'), 'mal']);
    return out;
  }
  // El email: confirmado, sin confirmar o sin email (los invitados no tienen)
  function emailSenal(m, corto) {
    if (m.invitado) return null;
    if (!m.correo) return ['Sin email', 'email falta'];
    return m.email === 'confirmado' ? [corto ? 'Confirmado' : 'Email confirmado', 'email'] : [corto ? 'Sin confirmar' : 'Email sin confirmar', 'email falta'];
  }
  // Boton para volver a mandarle el mail de confirmacion (solo si tiene email y no lo confirmo)
  function botonReenviar(m) {
    if (m.invitado || !m.correo || m.email === 'confirmado') return null;
    const b = el('button', 'pm-reenviar', 'Reenviar mail');
    b.type = 'button';
    b.title = 'Volver a mandarle el mail para confirmar su email';
    b.addEventListener('click', (e) => {
      e.stopPropagation(); // la fila abre el perfil
      if (b.disabled) return;
      b.disabled = true; b.textContent = 'Mandando…';
      fetch('/puente/api/miembros/reenviar', { method: 'POST', headers: { Authorization: 'Bearer ' + token(), 'Content-Type': 'application/json' }, body: JSON.stringify({ id: m.id }) })
        .then(r => r.json().catch(() => ({}))).then(d => {
          if (d && d.confirmado) { m.email = 'confirmado'; b.textContent = 'Ya lo confirmó'; return; }
          if (d && d.ok) { b.textContent = 'Mail enviado ✓'; b.classList.add('listo'); return; }
          b.textContent = (d && d.error) || 'No se pudo mandar'; b.classList.add('error'); b.title = b.textContent;
          setTimeout(() => { if (b.isConnected) { b.disabled = false; b.textContent = 'Reenviar mail'; b.classList.remove('error'); } }, 6000);
        }).catch(() => { b.disabled = false; b.textContent = 'Sin conexión, probá de nuevo'; });
    });
    return b;
  }

  let pushed = false;
  function close(fromBack) {
    if (!page) return;
    page.remove(); page = null; document.removeEventListener('keydown', onKey, true);
    if (pushed) { pushed = false; if (fromBack !== true && history.state && history.state.puenteMiembros) history.back(); }
  }
  addEventListener('popstate', () => { if (page && pushed) { pushed = false; close(true); } });
  // Escape cierra la pagina (si hay un perfil abierto, primero ese, como siempre)
  function onKey(e) {
    if (e.key !== 'Escape' || !page) return;
    const pop = [...document.querySelectorAll('.profile-popup, .user-profile-popup')].some(p => p.isConnected && getComputedStyle(p).display !== 'none' && p.getClientRects().length);
    e.stopPropagation();
    if (pop) { try { window.app._closeProfilePopup(); } catch { /* nada */ } return; }
    close();
  }

  // Resumen: nuevos de hoy y de la semana, y que parte confirmo el email, vinculo Discord y escribio
  function resumen() {
    const box = page && page.querySelector('.pm-resumen');
    if (!box || !data.length) return;
    const hoy = inicioHoy(), semana = Date.now() - 7 * 864e5;
    const personas = data.filter(m => !m.invitado);
    const n = personas.length || 1;
    const pct = (x) => Math.round((x / n) * 100) + '%';
    const datos = [
      [data.filter(m => m.desde && Date.parse(m.desde) >= hoy).length, 'nuevos hoy'],
      [data.filter(m => m.desde && Date.parse(m.desde) >= semana).length, 'en los últimos 7 días'],
      [pct(personas.filter(m => m.email === 'confirmado').length), 'confirmaron el email'],
      [pct(personas.filter(m => m.discord).length), 'vincularon Discord'],
      [pct(personas.filter(m => m.mensajes > 0).length), 'escribieron en CV Chat'],
      [data.filter(m => m.enLinea).length, 'en línea ahora'],
    ];
    box.textContent = '';
    for (const [num, label] of datos) { const d = el('div', 'pm-dato'); d.append(el('div', 'pm-dato-n', String(num)), el('div', 'pm-dato-l', label)); box.appendChild(d); }
  }

  function renderRows() {
    const body = page.querySelector('.pm-filas');
    body.textContent = '';
    const q = term.trim().toLowerCase();
    const pasa = (FILTROS.find(x => x[0] === filtro) || FILTROS[0])[2];
    const list = data.filter(m => pasa(m) && (!q || String(m.nombre).toLowerCase().includes(q) || String(m.usuario).toLowerCase().includes(q) ||
      String(m.correo || '').toLowerCase().includes(q) || (m.discord && String(m.discord.usuario || '').toLowerCase().includes(q))));
    resumen();
    page.querySelectorAll('.pm-filtro').forEach(b => b.classList.toggle('actual', b.dataset.f === filtro));
    list.sort((a, b) => { const x = value(a, sortKey), y = value(b, sortKey); return (x > y ? 1 : x < y ? -1 : 0) * sortDir; });
    page.querySelector('.pm-total').textContent = list.length === data.length ? data.length + ' miembros' : list.length + ' de ' + data.length;
    page.querySelectorAll('.pm-th').forEach(th => {
      th.classList.toggle('actual', th.dataset.k === sortKey);
      th.dataset.dir = th.dataset.k === sortKey ? (sortDir > 0 ? '▲' : '▼') : '';
    });
    if (mobile()) { renderList(body, list); if (!list.length) body.appendChild(el('div', 'pm-sin', 'No hay nadie así.')); return; }
    for (const m of list) {
      const tr = el('div', 'pm-fila');
      const who = el('div', 'pm-c pm-nombre');
      const av = el('div', 'pm-avatar');
      if (m.avatar) { const img = el('img'); img.src = m.avatar; img.alt = ''; img.loading = 'lazy'; av.appendChild(img); }
      else av.textContent = String(m.nombre).charAt(0).toUpperCase();
      if (m.enLinea) av.appendChild(el('span', 'pm-punto'));
      const names = el('div', 'pm-nombres');
      const n2 = el('div', 'pm-n2', m.usuario);
      if (m.invitacion) n2.appendChild(el('span', 'pm-chip pm-invitacion', m.invitacion));
      names.append(el('div', 'pm-n1', m.nombre), n2);
      who.append(av, names);
      // Email: la direccion y la etiqueta (confirmado o no)
      const mail = el('div', 'pm-c pm-dos');
      if (m.correo) { const dir = el('div', 'pm-n1 pm-correo', m.correo); dir.title = m.correo; mail.appendChild(dir); }
      const es = emailSenal(m, true);
      if (es) mail.appendChild(el('span', 'pm-senal ' + es[1], es[0]));
      else mail.appendChild(el('span', 'pm-vacio', '—'));
      const rb = botonReenviar(m);
      if (rb) mail.appendChild(rb);
      const since = el('div', 'pm-c pm-dos'); since.appendChild(el('div', 'pm-n1 pm-correo', ago(m.desde))); since.title = fecha(m.desde);
      // y de donde llego (origenes.js)
      if (m.origen) { since.appendChild(el('div', 'pm-n2', 'llegó desde ' + m.origen.fuente + (m.origen.estimado ? ' (estimado)' : ''))); since.title += ' · llegó desde ' + m.origen.fuente + (m.origen.detalle ? ' (' + m.origen.detalle + ')' : ''); }
      // Discord: el @usuario y la antiguedad de esa cuenta
      const dc = el('div', 'pm-c pm-dos');
      if (m.discord) {
        dc.appendChild(el('div', 'pm-n1 pm-correo', '@' + m.discord.usuario));
        if (m.discord.desde) dc.appendChild(el('div', 'pm-n2', 'cuenta de ' + ago(m.discord.desde)));
        dc.title = '@' + m.discord.usuario + (m.discord.desde ? ' · cuenta creada el ' + fecha(m.discord.desde) : '');
      } else dc.appendChild(el('span', 'pm-vacio', '—'));
      // Mensajes en CV Chat y, debajo, los de Discord que pasaron a su cuenta
      const msgs = el('div', 'pm-c pm-num pm-dos');
      msgs.appendChild(el('div', 'pm-n1 pm-correo', m.mensajes.toLocaleString('es-AR')));
      if (m.recuperados) msgs.appendChild(el('div', 'pm-n2', '+' + m.recuperados.toLocaleString('es-AR') + ' de Discord'));
      const last = el('div', 'pm-c', ago(m.ultimo)); last.title = fecha(m.ultimo);
      // Ultima vez conectado y desde donde entra
      const seen = el('div', 'pm-c pm-dos');
      seen.appendChild(el('div', 'pm-n1 pm-correo' + (m.enLinea ? ' pm-ok-txt' : ''), m.enLinea ? 'En línea' : m.visto ? ago(m.visto) : '—'));
      if (m.entraDesde) seen.appendChild(el('div', 'pm-n2', m.entraDesde));
      if (m.minutos7) seen.appendChild(el('div', 'pm-n2', 'Usó ' + duracion(m.minutos7) + ' en 7 días'));
      seen.title = (m.visto && !m.enLinea ? fecha(m.visto) : '') + (m.usa && m.usa.length ? (m.visto && !m.enLinea ? ' · ' : '') + 'Usó: ' + m.usa.join(', ') : '');
      const sig = el('div', 'pm-c pm-roles');
      for (const [label, kind] of signals(m)) sig.appendChild(el('span', 'pm-senal ' + kind, label));
      tr.append(who, mail, since, dc, msgs, last, seen, sig);
      tr.addEventListener('click', () => {
        const app = window.app;
        if (!app || !app.socket) return;
        app._isHoverPopup = false; app._hoverTarget = null; app._profilePopupAnchor = av;
        app.socket.emit('get-user-profile', { userId: m.id });
      });
      body.appendChild(tr);
    }
    if (!list.length) body.appendChild(el('div', 'pm-sin', 'No hay nadie con ese nombre.'));
  }

  // Lista del celular: foto, nombre, @usuario, una linea con los datos y las señales
  function avatarOf(m) {
    const av = el('div', 'pm-avatar');
    if (m.avatar) { const img = el('img'); img.src = m.avatar; img.alt = ''; img.loading = 'lazy'; av.appendChild(img); }
    else av.textContent = String(m.nombre).charAt(0).toUpperCase();
    if (m.enLinea) av.appendChild(el('span', 'pm-punto'));
    return av;
  }
  function renderList(body, list) {
    for (const m of list) {
      const row = el('div', 'pm-item');
      const av = avatarOf(m);
      const info = el('div', 'pm-item-info');
      const names = el('div', 'pm-item-nombres');
      names.append(el('span', 'pm-n1', m.nombre), el('span', 'pm-n2', m.usuario));
      // Dos lineas: lo que hace en CV Chat, y desde donde entra y de donde llego
      const bits = ['Desde ' + ago(m.desde).replace(/^hace /, 'hace '), m.mensajes.toLocaleString('es-AR') + (m.mensajes === 1 ? ' mensaje' : ' mensajes')];
      if (m.recuperados) bits[1] += ' (+' + m.recuperados.toLocaleString('es-AR') + ' de Discord)';
      if (m.ultimo) bits.push('último ' + ago(m.ultimo));
      if (m.minutos7) bits.push('usó ' + duracion(m.minutos7) + ' en 7 días');
      const bits2 = [m.enLinea ? 'En línea' : m.visto ? 'Conectado ' + ago(m.visto) : 'Sin conexiones registradas'];
      if (m.entraDesde) bits2.push(m.entraDesde);
      if (m.origen) bits2.push('llegó desde ' + m.origen.fuente);
      const meta = el('div', 'pm-item-meta', bits.join(' · '));
      const meta2 = el('div', 'pm-item-meta', bits2.join(' · '));
      const correo = m.correo ? el('div', 'pm-item-meta pm-correo', m.correo) : null;
      const chips = el('div', 'pm-roles');
      const es = emailSenal(m);
      if (es) chips.appendChild(el('span', 'pm-senal ' + es[1], es[0]));
      for (const [label, kind] of signals(m, true)) chips.appendChild(el('span', 'pm-senal ' + kind, label));
      if (m.invitacion) chips.appendChild(el('span', 'pm-chip pm-invitacion', m.invitacion));
      const rb = botonReenviar(m);
      if (rb) chips.appendChild(rb);
      info.append(names, meta, meta2);
      if (correo) info.appendChild(correo);
      if (chips.childNodes.length) info.appendChild(chips);
      row.append(av, info);
      row.addEventListener('click', () => {
        const app = window.app;
        if (!app || !app.socket) return;
        app._isHoverPopup = false; app._hoverTarget = null; app._profilePopupAnchor = av;
        app.socket.emit('get-user-profile', { userId: m.id });
      });
      body.appendChild(row);
    }
  }

  // ── Pestaña "Estadisticas" (estadisticas.js): solo administradores, en la misma pagina ──
  let rangoEst = '4s', vista = 'miembros';
  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
  const fmt = n => Number(n || 0).toLocaleString('es-AR');
  function etiqueta(e, paso) {
    if (paso === 'mes') { const [, m] = e.split('-'); return MESES[Number(m) - 1]; }
    const [, m, d] = e.split('-'); return Number(d) + '/' + Number(m);
  }
  function variacion(act, ant) {
    // (sin nada en el periodo anterior, por ejemplo antes de que existiera, no hay con que comparar)
    if (!ant) return act ? ['sin datos de antes', ''] : ['', ''];
    const p = Math.round(((act - ant) / ant) * 100);
    return [(p > 0 ? '↑ +' : p < 0 ? '↓ ' : '') + p + '%', p > 0 ? 'sube' : p < 0 ? 'baja' : ''];
  }
  // Barras en SVG; con dos series quedan apiladas (la primera abajo)
  function barras(series, etiquetas, paso, colores) {
    const W = 640, H = 200, izq = 34, abajo = 22, arriba = 8;
    const n = etiquetas.length, tot = etiquetas.map((_, i) => series.reduce((s, v) => s + (v[i] || 0), 0));
    const max = Math.max(1, ...tot);
    const ancho = (W - izq) / n, barra = Math.max(2, ancho * 0.62);
    const y = v => H - abajo - ((H - abajo - arriba) * v) / max;
    let svg = `<svg viewBox="0 0 ${W} ${H}" class="pe-svg" role="img">`;
    for (const f of [0, 0.5, 1]) {
      const v = Math.round(max * f), yy = y(v);
      svg += `<line x1="${izq}" x2="${W}" y1="${yy}" y2="${yy}" class="pe-guia"/><text x="${izq - 6}" y="${yy + 4}" class="pe-eje" text-anchor="end">${fmt(v)}</text>`;
    }
    const cada = Math.ceil(n / 12);
    etiquetas.forEach((e, i) => {
      const x = izq + i * ancho + (ancho - barra) / 2;
      let base = 0;
      series.forEach((s, k) => {
        const v = s[i] || 0; if (!v) return;
        const y1 = y(base + v), y0 = y(base);
        svg += `<rect x="${x}" y="${y1}" width="${barra}" height="${Math.max(1, y0 - y1)}" rx="2" fill="${colores[k]}"><title>${etiqueta(e, paso)}: ${fmt(v)}</title></rect>`;
        base += v;
      });
      if (i % cada === 0) svg += `<text x="${x + barra / 2}" y="${H - 6}" class="pe-eje" text-anchor="middle">${etiqueta(e, paso)}</text>`;
    });
    return svg + '</svg>';
  }
  function tarjeta(titulo, cuerpo, extra) {
    const c = el('div', 'pe-caja' + (extra ? ' ' + extra : ''));
    c.appendChild(el('div', 'pe-titulo', titulo));
    if (typeof cuerpo === 'string') { const d = el('div'); d.innerHTML = cuerpo; c.appendChild(d); } else if (cuerpo) c.appendChild(cuerpo);
    return c;
  }
  function filaBarra(nombre, valor, total, texto) {
    const f = el('div', 'pe-fila');
    const top = el('div', 'pe-fila-top'); top.append(el('span', 'pe-fila-n', nombre), el('span', 'pe-fila-v', texto || fmt(valor)));
    const fondo = el('div', 'pe-fila-fondo'); const llena = el('div', 'pe-fila-llena'); llena.style.width = (total ? Math.max(1, (valor / total) * 100) : 0) + '%';
    fondo.appendChild(llena); f.append(top, fondo); return f;
  }
  // ── El resumen escrito, arriba de todo: lo principal del periodo en pocas frases (con reglas fijas) ──
  const PERIODO = { '7d': 'los últimos 7 días', '4s': 'las últimas 4 semanas', '3m': 'los últimos 3 meses', '1a': 'el último año' };
  // una frase con partes en negrita: ['texto ', ['b', 'numero'], ' mas texto']
  function frase(partes) {
    const li = el('li');
    for (const p of partes) { if (Array.isArray(p)) li.appendChild(el('b', '', p[1])); else li.appendChild(document.createTextNode(p)); }
    return li;
  }
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const cambio = (act, ant) => { if (!ant) return ''; const p = Math.round(((act - ant) / ant) * 100); return p > 4 ? ' (' + p + '% más que en el período anterior)' : p < -4 ? ' (' + Math.abs(p) + '% menos que en el período anterior)' : ' (casi igual que en el período anterior)'; };
  function resumenEscrito(d, o) {
    const T = d.totales, out = [];
    const per = PERIODO[d.rango] || 'este período';
    // Llegadas y de donde
    const [nv, nvAnt] = T.nuevos;
    const p1 = ['En ' + per + ' llegaron ', ['b', fmt(nv)], nv === 1 ? ' persona nueva' : ' personas nuevas', cambio(nv, nvAnt)];
    if (o && o.fuentes) {
      const top = o.fuentes.filter(f => f.fuente !== 'Sin dato' && f.cuentas > 0).slice(0, 2);
      if (top.length) { p1.push('; la mayoría desde ', ['b', top[0].fuente], ' (' + fmt(top[0].cuentas) + ')'); if (top[1]) p1.push(' y después ', ['b', top[1].fuente], ' (' + fmt(top[1].cuentas) + ')'); }
    }
    out.push(frase(p1.concat('.')));
    // Embudo
    const E = Object.fromEntries(d.embudo || []);
    const base = E['Se registraron'] || 0;
    if (base) out.push(frase(['De ellas, el ', ['b', pct(E['Escribieron en CV Chat'], base) + '%'], ' escribió en CV Chat y el ', ['b', pct(E['Volvieron otro día'], base) + '%'], ' volvió otro día.']));
    // Activos y tiempo
    const t = d.tiempo;
    const p3 = ['Entraron ', ['b', fmt(T.activos[0])], ' personas'];
    if (t && t.minutos[0]) {
      p3.push('; cada una pasó en promedio ', ['b', duracion(t.porDia[0])], ' por día que entró');
      if (t.porDia[1]) { const c = Math.round(((t.porDia[0] - t.porDia[1]) / t.porDia[1]) * 100); if (Math.abs(c) > 4) p3.push(' (' + (c > 0 ? c + '% más' : Math.abs(c) + '% menos') + ' que antes)'); }
      const sec = (t.secciones || []).filter(s => s.nombre !== 'Panel de administradores').slice(0, 3).map(s => s.nombre);
      if (sec.length) p3.push(', sobre todo en ', ['b', sec.join(', ').replace(/, ([^,]*)$/, ' y $1')]);
    }
    out.push(frase(p3.concat('.')));
    // Mensajes y la mudanza
    const cv = T.cv[0], dc = T.dc[0];
    if (cv + dc) out.push(frase(['Se escribieron ', ['b', fmt(cv + dc)], ' mensajes en los canales', cambio(cv + dc, T.cv[1] + T.dc[1]), '; el ', ['b', pct(cv, cv + dc) + '%'], ' desde CV Chat. Mensajes privados: ' + fmt(T.dm[0]) + '.']));
    // Canales: el mas activo, y lo que mas subio y bajo (con algo de movimiento)
    if (d.canales && d.canales.length) {
      const p5 = ['El canal más activo fue ', ['b', '#' + d.canales[0].nombre], ' (' + fmt(d.canales[0].n) + ' mensajes)'];
      const mov = d.canales.filter(c => c.ant >= 20).map(c => ({ c, v: Math.round(((c.n - c.ant) / c.ant) * 100) }));
      const sube = mov.filter(x => x.v >= 20).sort((a, b) => b.v - a.v)[0], baja = mov.filter(x => x.v <= -20).sort((a, b) => a.v - b.v)[0];
      if (sube) p5.push('; el que más creció, ', ['b', '#' + sube.c.nombre], ' (+' + sube.v + '%)');
      if (baja) p5.push('; el que más bajó, ', ['b', '#' + baja.c.nombre], ' (' + baja.v + '%)');
      out.push(frase(p5.concat('.')));
    }
    // El momento de mas actividad
    let mx = 0, dia = 0, hora = 0;
    (d.calor || []).forEach((f, i) => f.forEach((v, h) => { if (v > mx) { mx = v; dia = i; hora = h; } }));
    if (mx) out.push(frase(['El momento de más actividad: los ', ['b', ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados', 'domingos'][dia] + ' a las ' + hora + ' h'], '.']));
    // Juegos y Marketplace
    out.push(frase(['Se jugaron ', ['b', fmt(T.partidas[0])], ' partidas', cambio(T.partidas[0], T.partidas[1]), ' y se publicaron ', ['b', fmt(T.publicaciones[0])], ' cosas en el Marketplace.']));
    // Retencion: el grupo mas reciente que ya tiene su semana siguiente
    const ret = (d.retencion || []).filter(r => r.semanas.length).slice(-1)[0];
    if (ret) out.push(frase(['De los que llegaron la semana del ' + etiqueta(ret.semana, 'dia') + ', el ', ['b', ret.semanas[0] + '%'], ' volvió a entrar la semana siguiente.']));
    // Dispositivo
    const dis = Object.entries(d.dispositivos || {}).sort((a, b) => b[1] - a[1])[0];
    if (dis && d.personasDispositivo) out.push(frase(['El dispositivo más usado: ', ['b', dis[0]], ' (' + pct(dis[1], d.personasDispositivo) + '% de quienes entraron).']));
    const ul = el('ul', 'pe-resumen');
    out.forEach(li => ul.appendChild(li));
    const c = tarjeta('Resumen', ul, 'pe-ancha pe-resumen-caja');
    if (t && t.desde && t.desde > d.desde) c.appendChild(el('div', 'pe-nota', 'El tiempo de uso se mide desde el ' + etiqueta(t.desde, 'dia') + '.'));
    return c;
  }
  // ── Tiempo de uso (uso.js) ──
  function tarjetaTiempo(d) {
    const t = d.tiempo, box = el('div');
    if (!t || !t.minutos[0]) { box.appendChild(el('div', 'pe-nota', 'Todavía no hay datos: se empezó a medir hace poco. Cuenta solo el tiempo con CV Chat a la vista y en uso.')); return tarjeta('Tiempo de uso', box); }
    const datos = el('div', 'pe-totales');
    const dato = (l, v, act, ant) => {
      const c = el('div', 'pe-total'); c.appendChild(el('div', 'pe-total-l', l));
      const f = el('div', 'pe-total-fila'); f.appendChild(el('span', 'pe-total-n', v));
      if (ant) { const [txt, cls] = variacion(act, ant); if (txt) f.appendChild(el('span', 'pe-var ' + cls, txt)); }
      c.appendChild(f); datos.appendChild(c);
    };
    dato('En total', duracion(t.minutos[0]), t.minutos[0], t.minutos[1]);
    dato('Por persona, por día', duracion(t.porDia[0]), t.porDia[0], t.porDia[1]);
    dato('Visitas', fmt(t.visitas[0]), t.visitas[0], t.visitas[1]);
    dato('Cada visita, en promedio', duracion(t.porVisita[0]), t.porVisita[0], t.porVisita[1]);
    box.appendChild(datos);
    const maxS = Math.max(1, ...t.secciones.map(s => s.minutos));
    for (const s of t.secciones.slice(0, 10)) box.appendChild(filaBarra(s.nombre, s.minutos, maxS, duracion(s.minutos) + ' · ' + pct(s.minutos, t.minutos[0]) + '%'));
    box.appendChild(el('div', 'pe-nota', 'Solo el tiempo con CV Chat a la vista y en uso (sin tocar nada por 2 minutos, deja de contar). Una visita nueva es volver después de 30 minutos.'));
    return tarjeta('Tiempo de uso', box, 'pe-ancha');
  }
  // ── Retencion: de cada semana de llegada, que parte volvio en las semanas siguientes ──
  function tarjetaRetencion(d) {
    const box = el('div', 'pe-ret');
    const filas = d.retencion || [];
    if (!filas.length) { box.appendChild(el('div', 'pe-nota', 'Todavía no hay semanas completas para medir.')); return tarjeta('¿Vuelven?', box); }
    const cab = el('div', 'pe-ret-fila pe-ret-cab');
    for (const t of ['Llegaron la semana del', 'Personas', '1.ª semana', '2.ª', '3.ª', '4.ª']) cab.appendChild(el('span', '', t));
    box.appendChild(cab);
    for (const r of filas) {
      const f = el('div', 'pe-ret-fila');
      f.append(el('span', '', etiqueta(r.semana, 'dia') + (r.aprox ? ' ≈' : '')), el('span', '', fmt(r.personas)));
      for (let k = 0; k < 4; k++) {
        const v = r.semanas[k];
        const c = el('span', 'pe-ret-c', v == null ? '' : v + '%');
        if (v != null) c.style.background = 'rgba(88, 101, 242, ' + (0.12 + 0.75 * (v / 100)).toFixed(2) + ')';
        f.appendChild(c);
      }
      box.appendChild(f);
    }
    box.appendChild(el('div', 'pe-nota', 'Qué parte de los que llegaron cada semana volvió a entrar en cada una de las semanas siguientes.' + (filas.some(r => r.aprox) ? ' ≈: aproximado; antes del ' + etiqueta(d.activosDesde, 'dia') + ' solo cuenta a quien escribió (no a quien entró a leer).' : '')));
    return tarjeta('¿Vuelven?', box, 'pe-ancha');
  }
  // ── Lo de mas (panel-estadisticas.js "extra" y medidas.js) ──
  // Una tabla chica: cabecera y filas de celdas (texto); la primera columna, mas ancha
  function tablaChica(cab, filas, nota) {
    const box = el('div', 'pe-tabla');
    const fila = (celdas, cls) => { const f = el('div', 'pe-tabla-fila' + (cls ? ' ' + cls : '')); f.style.gridTemplateColumns = 'minmax(8rem, 2fr) repeat(' + (cab.length - 1) + ', minmax(4.5rem, 1fr))'; celdas.forEach(c => f.appendChild(c instanceof Node ? c : el('span', '', c))); return f; };
    box.appendChild(fila(cab, 'pe-tabla-cab'));
    filas.forEach(c => box.appendChild(fila(c)));
    if (nota) box.appendChild(el('div', 'pe-nota', nota));
    return box;
  }
  const abrirPerfil = (id) => { const app = window.app; if (app && app.socket) { app._isHoverPopup = false; app._hoverTarget = null; app.socket.emit('get-user-profile', { userId: id }); } };
  function tarjetasExtra(box, d) {
    const x = d.extra || {}, m = x.medidas || {};
    const desdeM = m.medidoDesde && m.medidoDesde > d.desde ? 'Se mide desde el ' + etiqueta(m.medidoDesde, 'dia') + '.' : '';
    // Si vuelven, segun de donde llegaron
    if (x.retencionOrigen) {
      const filas = x.retencionOrigen.map(r => [r.fuente, fmt(r.personas), r.semana1 + '%', r.siguen + '%']);
      box.appendChild(tarjeta('¿Vuelven? Según de dónde llegaron', filas.length ? tablaChica(['Llegaron desde', 'Personas', 'Volvieron la 1.ª semana', 'Siguen viniendo'], filas,
        'Los que llegaron hace entre 1 y 8 semanas. "Siguen viniendo": entraron en las últimas 2 semanas.') : el('div', 'pe-nota', 'Todavía no hay datos.'), 'pe-ancha'));
    }
    // Quienes dejaron de venir
    if (x.enRiesgo) {
      const lista = el('div', 'pe-riesgo');
      for (const p of x.enRiesgo) {
        const f = el('button', 'pe-riesgo-fila'); f.type = 'button';
        f.append(el('span', 'pe-riesgo-n', p.nombre), el('span', 'pe-riesgo-u', '@' + p.usuario), el('span', 'pe-riesgo-d', 'última vez: ' + etiqueta(p.ultimo, 'dia') + ' · ' + p.dias + ' días en las 8 semanas'));
        f.addEventListener('click', () => abrirPerfil(p.id));
        lista.appendChild(f);
      }
      if (!x.enRiesgo.length) lista.appendChild(el('div', 'pe-nota', 'Nadie: todos los que venían seguido siguen viniendo.'));
      else lista.appendChild(el('div', 'pe-nota', (x.enRiesgoTotal > x.enRiesgo.length ? 'Los primeros ' + x.enRiesgo.length + ' de ' + fmt(x.enRiesgoTotal) + '. ' : '') + 'Entraron al menos 3 días en las últimas 8 semanas y ninguno en las últimas 2. Tocá a alguien para ver su perfil y escribirle.'));
      box.appendChild(tarjeta('Dejaron de venir' + (x.enRiesgoTotal ? ' (' + fmt(x.enRiesgoTotal) + ')' : ''), lista));
    }
    // Que tan pegada es la comunidad
    if (x.pegada && x.pegada.mau) {
      const p = x.pegada, c = el('div');
      const cab = el('div', 'pe-mudanza'); cab.append(el('span', 'pe-mudanza-n', p.pct + '%'), el('span', 'pe-mudanza-l', 'de los que entran en el mes entra cada día (' + fmt(p.dau) + ' de ' + fmt(p.mau) + ')'));
      c.appendChild(cab);
      const tot = p.semana.reduce((a, b) => a + b, 0), maxS = Math.max(1, ...p.semana);
      p.semana.forEach((n, i) => c.appendChild(filaBarra((i + 1) + (i ? ' días' : ' día') + ' de 7', n, maxS, fmt(n) + ' · ' + pct(n, tot) + '%')));
      c.appendChild(el('div', 'pe-nota', 'Arriba: el promedio de gente por día sobre la gente del mes (más es mejor; 20% ya es bueno). Abajo: cuántos días de la última semana entró cada uno de los que entraron.' + (p.dias < 30 ? ' Con ' + p.dias + ' días de datos.' : '')));
      box.appendChild(tarjeta('¿Qué tan pegada es la comunidad?', c));
    }
    // Comparar grupos
    if (x.grupos && x.grupos.length) {
      const filas = x.grupos.map(g => [g.grupo, fmt(g.personas), String(g.dias).replace('.', ','), duracion(g.minutos), String(g.mensajes).replace('.', ',')]);
      box.appendChild(tarjeta('Comparar grupos', tablaChica(['Grupo', 'Personas', 'Días que entró', 'Tiempo por día', 'Mensajes por persona'], filas,
        'De los que entraron en este período. Alguien que usa celular y PC cuenta en los dos.'), 'pe-ancha'));
    }
    // Uso de funciones
    if (m.funciones) {
      const c = el('div');
      const base = m.usuariosFn || Math.max(1, ...m.funciones.map(f => f.personas));
      for (const f of m.funciones.slice(0, 20)) {
        const [txt] = f.antes ? variacion(f.personas, f.antes) : [''];
        c.appendChild(filaBarra(f.funcion, f.personas, base, fmt(f.personas) + (f.personas === 1 ? ' persona' : ' personas') + ' · ' + fmt(f.veces) + (f.veces === 1 ? ' vez' : ' veces') + (txt ? '  ' + txt : '')));
      }
      if (!m.funciones.length) c.appendChild(el('div', 'pe-nota', 'Todavía no hay datos.'));
      if (m.nunca && m.nunca.length && m.funciones.length) c.appendChild(el('div', 'pe-nota', 'Nadie usó en este período: ' + m.nunca.join(', ') + '.'));
      if (x.tipos && x.tipos.total) {
        const t = x.tipos;
        c.appendChild(el('div', 'pe-nota', 'De los ' + fmt(t.total) + ' mensajes escritos desde CV Chat en los canales: ' + pct(t.respuestas, t.total) + '% respuestas, ' + pct(t.archivos, t.total) + '% con fotos o archivos, ' +
          pct(t.enlaces, t.total) + '% con enlaces, ' + fmt(t.gifs) + ' GIF y ' + fmt(t.encuestas) + ' encuestas.'));
      }
      if (desdeM) c.appendChild(el('div', 'pe-nota', desdeM));
      box.appendChild(tarjeta('Uso de cada función', c, 'pe-ancha'));
    }
    // Errores y velocidad
    if (m.cargas) {
      const c = el('div');
      if (m.cargas.length) c.appendChild(tablaChica(['Dispositivo', 'Aperturas', 'Tarda en abrir', 'Más de 8 s'], m.cargas.map(k => [k.dispositivo, fmt(k.veces), String(k.segundos).replace('.', ',') + ' s', fmt(k.lentas)])));
      const e = el('div', 'pe-errores');
      e.appendChild(el('div', 'pe-sub', m.erroresTotal ? fmt(m.erroresTotal) + (m.erroresTotal === 1 ? ' error' : ' errores') + ' en los dispositivos de la gente' : 'Sin errores anotados en este período.'));
      for (const r of m.errores || []) {
        const f = el('div', 'pe-error');
        f.append(el('div', 'pe-error-m', r.mensaje), el('div', 'pe-error-d', fmt(r.n) + (r.n === 1 ? ' vez · ' : ' veces · ') + r.dispositivos.join(', ') + (r.donde ? ' · ' + r.donde : '') + ' · último: ' + etiqueta(r.ultimo, 'dia')));
        e.appendChild(f);
      }
      c.appendChild(e);
      if (desdeM) c.appendChild(el('div', 'pe-nota', desdeM));
      box.appendChild(tarjeta('Errores y velocidad', c, 'pe-ancha'));
    }
    // Que se mira en la web, la wiki y el foro, y las busquedas
    if (m.paginas) {
      const c = el('div');
      const lindo = (p) => p.replace(/^circulovicioso\.club/, 'web').replace(/^foro\.circulovicioso\.club/, 'foro').replace(/^chat\.circulovicioso\.club/, 'chat').replace(/^(web|foro|chat)$/, '$1 (portada)');
      const maxV = Math.max(1, ...m.paginas.map(p => p.vistas));
      for (const p of m.paginas.slice(0, 15)) c.appendChild(filaBarra(lindo(p.pagina), p.vistas, maxV, fmt(p.vistas) + (p.vistas === 1 ? ' vista · ' : ' vistas · ') + (p.seg >= 60 ? Math.round(p.seg / 60) + ' min' : p.seg + ' s') + ' · leída ' + p.lectura + '%'));
      if (!m.paginas.length) c.appendChild(el('div', 'pe-nota', 'Todavía no hay datos.'));
      else c.appendChild(el('div', 'pe-nota', 'Tiempo promedio a la vista y hasta dónde se bajó en la página, en promedio.' + (desdeM ? ' ' + desdeM : '')));
      box.appendChild(tarjeta('Lo más visto en la web, la wiki y el foro', c));
      const b = el('div');
      const DONDE = { wiki: 'Wiki', ffs: 'Full Fat Search', mercado: 'Marketplace', chat: 'Chat' };
      if (m.sinResultado && m.sinResultado.length) {
        b.appendChild(el('div', 'pe-sub', 'No encontraron nada'));
        for (const s of m.sinResultado.slice(0, 10)) b.appendChild(el('div', 'pe-busq pe-busq-sin', '“' + s.termino + '” · ' + (DONDE[s.donde] || s.donde) + ' · ' + fmt(s.sin) + (s.sin === 1 ? ' vez' : ' veces')));
      }
      if (m.busquedas && m.busquedas.length) {
        b.appendChild(el('div', 'pe-sub', 'Lo más buscado'));
        for (const s of m.busquedas.slice(0, 12)) b.appendChild(el('div', 'pe-busq', '“' + s.termino + '” · ' + (DONDE[s.donde] || s.donde) + ' · ' + fmt(s.veces) + (s.veces === 1 ? ' vez' : ' veces')));
      } else b.appendChild(el('div', 'pe-nota', 'Todavía no hay búsquedas anotadas.'));
      b.appendChild(el('div', 'pe-nota', 'En la wiki, Full Fat Search, el Marketplace y el buscador del chat.'));
      box.appendChild(tarjeta('Búsquedas', b));
    }
    // Mails, notificaciones e invitaciones
    const mi = el('div');
    mi.appendChild(filaBarra('Llegaron desde un mail', x.desdeMail || 0, Math.max(1, x.desdeMail || 0, x.desdeNotificacion || 0), fmt(x.desdeMail || 0) + (x.desdeMail === 1 ? ' visita' : ' visitas')));
    mi.appendChild(filaBarra('Tocaron una notificación', x.desdeNotificacion || 0, Math.max(1, x.desdeMail || 0, x.desdeNotificacion || 0), fmt(x.desdeNotificacion || 0) + (x.desdeNotificacion === 1 ? ' vez' : ' veces')));
    mi.appendChild(el('div', 'pe-nota', 'Mails: los enlaces de los mails de CV Chat. Notificaciones: las tocadas con CV Chat abierto en la PC o el navegador (las de la app de Android no se ven). Cuántos mails se abren solo lo saben Resend y Brevo.'));
    if (x.invitadores && x.invitadores.length) {
      mi.appendChild(el('div', 'pe-sub', 'Quién trajo a quién'));
      for (const i of x.invitadores) {
        const f = el('button', 'pe-riesgo-fila'); f.type = 'button';
        f.append(el('span', 'pe-riesgo-n', i.nombre), el('span', 'pe-riesgo-d', 'trajo ' + fmt(i.trajo) + ' · siguen viniendo ' + fmt(i.siguen)));
        f.addEventListener('click', () => abrirPerfil(i.id));
        mi.appendChild(f);
      }
    }
    box.appendChild(tarjeta('Mails, notificaciones e invitaciones', mi));
  }
  // ── Bajar en planilla (CSV, con ; para que Excel en castellano lo abra bien) ──
  function bajarCSV(nombre, filas) {
    const celda = (v) => { const s = v == null ? '' : String(v); return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const txt = '﻿' + filas.map(f => f.map(celda).join(';')).join('\r\n');
    const a = el('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'text/csv;charset=utf-8' })); a.download = nombre;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  function csvEstadisticas(d) {
    const f = [['Estadísticas de CV Chat', d.desde + ' a ' + d.hasta], []];
    f.push(['Totales', 'Este período', 'Período anterior']);
    for (const [k, l] of [['nuevos', 'Nuevos miembros'], ['activos', 'Activos'], ['cv', 'Mensajes desde CV Chat'], ['dc', 'Mensajes desde Discord'], ['dm', 'Mensajes privados'], ['reacciones', 'Reacciones'], ['partidas', 'Partidas'], ['publicaciones', 'Publicaciones del Marketplace']])
      f.push([l].concat(d.totales[k] || []));
    f.push([], ['Por período', 'Nuevos', 'Mensajes CV Chat', 'Mensajes Discord', 'Privados', 'Activos']);
    d.etiquetas.forEach((e, i) => f.push([e, d.serie.nuevos[i], d.serie.cv[i], d.serie.dc[i], d.serie.dm[i], d.serie.activos[i]]));
    f.push([], ['Canal', 'Mensajes', 'Período anterior']); for (const c of d.canales) f.push(['#' + c.nombre, c.n, c.ant]);
    if (d.tiempo) { f.push([], ['Tiempo de uso', 'Minutos']); for (const s of d.tiempo.secciones) f.push([s.nombre, s.minutos]); }
    const x = d.extra || {}, m = x.medidas || {};
    if (m.funciones) { f.push([], ['Función', 'Personas', 'Veces']); for (const r of m.funciones) f.push([r.funcion, r.personas, r.veces]); }
    if (x.grupos) { f.push([], ['Grupo', 'Personas', 'Días que entró', 'Minutos por día', 'Mensajes por persona']); for (const g of x.grupos) f.push([g.grupo, g.personas, g.dias, g.minutos, g.mensajes]); }
    if (x.retencionOrigen) { f.push([], ['Llegaron desde', 'Personas', '% volvió la 1.ª semana', '% sigue viniendo']); for (const r of x.retencionOrigen) f.push([r.fuente, r.personas, r.semana1, r.siguen]); }
    if (m.paginas) { f.push([], ['Página', 'Vistas', 'Segundos promedio', '% leído']); for (const p of m.paginas) f.push([p.pagina, p.vistas, p.seg, p.lectura]); }
    if (m.busquedas) { f.push([], ['Búsqueda', 'Dónde', 'Veces', 'Sin resultado']); for (const b of m.busquedas) f.push([b.termino, b.donde, b.veces, b.sin]); }
    if (x.enRiesgo) { f.push([], ['Dejaron de venir', 'Usuario', 'Última vez', 'Días en 8 semanas']); for (const p of x.enRiesgo) f.push([p.nombre, p.usuario, p.ultimo, p.dias]); }
    bajarCSV('estadisticas-cv-chat-' + d.rango + '-' + d.hasta + '.csv', f);
  }
  function csvMiembros(lista) {
    const f = [['Nombre', 'Usuario', 'Email', 'Email confirmado', 'Miembro desde', 'Discord', 'Mensajes en CV Chat', 'Mensajes de Discord', 'Último mensaje', 'Última vez', 'Entra desde', 'Usó en 7 días (min)', 'Llegó desde', 'Admin']];
    for (const m of lista) f.push([m.nombre, m.usuario, m.correo || '', m.email === 'confirmado' ? 'sí' : 'no', (m.desde || '').slice(0, 10), m.discord ? m.discord.usuario : '', m.mensajes, m.recuperados || 0,
      (m.ultimo || '').slice(0, 10), m.enLinea ? 'en línea' : (m.visto || '').slice(0, 10), m.entraDesde || '', m.minutos7 || 0, m.origen ? m.origen.fuente : '', m.admin ? 'sí' : '']);
    bajarCSV('miembros-cv-chat-' + new Date().toISOString().slice(0, 10) + '.csv', f);
  }
  function botonesCSV(d) {
    const c = el('div', 'pe-csv');
    const b1 = el('button', 'pe-csv-btn', 'Bajar estas estadísticas (planilla)'); b1.type = 'button'; b1.addEventListener('click', () => csvEstadisticas(d));
    const b2 = el('button', 'pe-csv-btn', 'Bajar la lista de miembros (planilla)'); b2.type = 'button';
    b2.addEventListener('click', () => {
      if (data && data.length) return csvMiembros(data);
      fetch('/puente/api/miembros', { headers: { Authorization: 'Bearer ' + token() } }).then(r => r.json()).then(j => csvMiembros(j.miembros || [])).catch(() => {});
    });
    c.append(b1, b2);
    return c;
  }
  function pintarEstadisticas(box, d, o) {
    box.textContent = '';
    if (!d.resumenListo) box.appendChild(el('div', 'pe-aviso', 'Armando el resumen de mensajes por primera vez: los números de mensajes pueden estar incompletos unos minutos.'));
    try { box.appendChild(resumenEscrito(d, o)); } catch (err) { console.warn('resumen:', err); }
    box.appendChild(botonesCSV(d));
    // Totales con su variacion respecto del periodo anterior
    const T = d.totales;
    const totales = el('div', 'pe-totales');
    for (const [k, label] of [['nuevos', 'Nuevos miembros'], ['activos', 'Activos'], ['cv', 'Mensajes desde CV Chat'], ['dc', 'Mensajes desde Discord'],
      ['dm', 'Mensajes privados'], ['reacciones', 'Reacciones'], ['partidas', 'Partidas jugadas'], ['publicaciones', 'Publicaciones del Marketplace']]) {
      const [act, ant] = T[k] || [0, 0];
      const c = el('div', 'pe-total');
      c.appendChild(el('div', 'pe-total-l', label));
      const fila = el('div', 'pe-total-fila'); fila.appendChild(el('span', 'pe-total-n', fmt(act)));
      const [txt, cls] = variacion(act, ant);
      if (txt && !(k === 'activos' && d.activosDesde && d.activosDesde > d.desde)) {
        const v = el('span', 'pe-var ' + cls, txt);
        v.title = ant ? 'Comparado con el período anterior del mismo largo' : 'En el período anterior no hubo nada para comparar (todavía no existía o no se contaba)';
        fila.appendChild(v);
      }
      c.appendChild(fila);
      totales.appendChild(c);
    }
    box.appendChild(totales);
    const S = d.serie;
    // Termometro de la mudanza
    const cvT = T.cv[0], dcT = T.dc[0], pct = cvT + dcT ? Math.round((cvT / (cvT + dcT)) * 100) : 0;
    const mud = el('div');
    const cab = el('div', 'pe-mudanza'); cab.append(el('span', 'pe-mudanza-n', pct + '%'), el('span', 'pe-mudanza-l', 'de los mensajes de los canales se escribieron desde CV Chat'));
    const ley = el('div', 'pe-leyenda'); ley.innerHTML = '<span><i style="background:#5865f2"></i>Desde CV Chat</span><span><i style="background:#9b84ec"></i>Desde Discord</span>';
    const g = el('div'); g.innerHTML = barras([S.cv, S.dc], d.etiquetas, d.paso, ['#5865f2', '#9b84ec']);
    mud.append(cab, ley, g);
    box.appendChild(tarjeta('Termómetro de la mudanza', mud, 'pe-ancha'));
    // Nuevos miembros, segun de donde llegaron (origenes.js); si eso no cargo, solo cuantos
    box.appendChild(o ? nuevosPorOrigen(o) : tarjeta('Nuevos miembros', barras([S.nuevos], d.etiquetas, d.paso, ['#3ba55d'])));
    const act = el('div'); act.innerHTML = barras([S.activos], d.etiquetas, d.paso, ['#f0b232']);
    if (d.activosDesde && d.activosDesde > d.desde) act.appendChild(el('div', 'pe-nota', 'Se anota desde el ' + etiqueta(d.activosDesde, 'dia') + ': antes no hay datos.'));
    box.appendChild(tarjeta(d.paso === 'dia' ? 'Activos por día' : d.paso === 'semana' ? 'Activos por semana' : 'Activos por mes', act));
    // Mapa de horas (de Argentina)
    const max = Math.max(1, ...d.calor.flat());
    const mapa = el('div', 'pe-calor');
    mapa.appendChild(el('div', 'pe-calor-esq'));
    for (let hh = 0; hh < 24; hh++) mapa.appendChild(el('div', 'pe-calor-h', hh % 3 === 0 ? String(hh) : ''));
    d.calor.forEach((fila, i) => {
      mapa.appendChild(el('div', 'pe-calor-d', DIAS[i]));
      fila.forEach((v, hh) => { const c = el('div', 'pe-calor-c'); c.style.opacity = String(0.08 + 0.92 * (v / max)); c.title = DIAS[i] + ' ' + hh + ' h: ' + fmt(v) + ' mensajes'; mapa.appendChild(c); });
    });
    box.appendChild(tarjeta('Horas de actividad (hora de Argentina)', mapa, 'pe-ancha'));
    // Canales
    const can = el('div');
    const maxC = Math.max(1, ...d.canales.map(c => c.n));
    for (const c of d.canales.slice(0, 12)) {
      const [txt] = c.ant ? variacion(c.n, c.ant) : [''];
      const f = filaBarra('#' + c.nombre, c.n, maxC, fmt(c.n) + (txt ? '  ' + txt : ''));
      f.classList.add('pe-clic'); f.addEventListener('click', () => { if (window.app) window.app.switchChannel(c.code); });
      can.appendChild(f);
    }
    if (!d.canales.length) can.appendChild(el('div', 'pe-nota', 'Sin mensajes en este período.'));
    box.appendChild(tarjeta('Canales más activos', can));
    // Embudo
    const emb = el('div');
    const base = d.embudo[0][1] || 0;
    for (const [label, v] of d.embudo) emb.appendChild(filaBarra(label, v, base, fmt(v) + (base ? ' · ' + Math.round((v / base) * 100) + '%' : '')));
    emb.appendChild(el('div', 'pe-nota', 'De quienes se registraron en este período.'));
    box.appendChild(tarjeta('Embudo de los nuevos', emb));
    // Dispositivos
    const dis = el('div');
    const lista = Object.entries(d.dispositivos).sort((a, b) => b[1] - a[1]);
    const totD = d.personasDispositivo || lista.reduce((s, [, v]) => s + v, 0);
    for (const [k, v] of lista) dis.appendChild(filaBarra(k, v, totD, Math.round((v / totD) * 100) + '% · ' + fmt(v)));
    if (!lista.length) dis.appendChild(el('div', 'pe-nota', 'Todavía no hay datos: se empezó a anotar hace poco.'));
    else if (d.personasDispositivo) dis.appendChild(el('div', 'pe-nota', 'De las ' + fmt(d.personasDispositivo) + ' personas que entraron en este período. Quien usa más de uno cuenta en cada uno.'));
    box.appendChild(tarjeta('Dispositivo', dis));
    box.appendChild(tarjetaTiempo(d));
    box.appendChild(tarjetaRetencion(d));
    try { tarjetasExtra(box, d); } catch (err) { console.warn('estadisticas (extra):', err); }
  }
  function cargarEstadisticas() {
    const box = page && page.querySelector('.pe-cuerpo');
    if (!box) return;
    page.querySelectorAll('.pe-rango').forEach(b => b.classList.toggle('actual', b.dataset.r === rangoEst));
    box.textContent = ''; box.appendChild(el('div', 'pm-sin', 'Calculando…'));
    const pedir = u => fetch(u, { headers: { Authorization: 'Bearer ' + token() } }).then(r => (r.ok ? r.json() : Promise.reject(r.status)));
    Promise.all([pedir('/puente/api/estadisticas?rango=' + rangoEst), pedir('/puente/api/origen/admin?rango=' + rangoEst).catch(() => null)])
      .then(([d, o]) => { if (page) { pintarEstadisticas(box, d, o); if (o) pintarOrigen(box, o); } })
      .catch(() => { if (page) { box.textContent = ''; box.appendChild(el('div', 'pm-sin', 'No se pudieron cargar las estadísticas.')); } });
  }
  function verVista(v) {
    vista = v;
    if (!page) return;
    page.querySelectorAll('.pm-pestana').forEach(b => b.classList.toggle('actual', b.dataset.v === v));
    page.querySelector('.pm-card').hidden = v !== 'miembros';
    page.querySelector('.pe-vista').hidden = v !== 'estadisticas';
    const mz = page.querySelector('.pmz-vista'); if (mz) mz.hidden = v !== 'mudanza';
    const mk = page.querySelector('.pk-vista'); if (mk) mk.hidden = v !== 'marketplace';
    const jg = page.querySelector('.pj-vista'); if (jg) jg.hidden = v !== 'juegos';
    if (v === 'juegos' && !page.querySelector('.pj-cuerpo').childNodes.length) cargarJuegosEst();
    if (v === 'mudanza') cargarMudanza();
    // Propuestas de emojis y stickers (la arma el bloque de las propuestas, al final)
    const pp = page.querySelector('.ppz-vista'); if (pp) pp.hidden = v !== 'propuestas';
    if (v === 'propuestas' && pp && window.puentePropuestas) window.puentePropuestas.admin(pp);
    // (las de los juegos: su pagina se carga la primera vez que se abre)
    page.querySelectorAll('.pja-vista').forEach(x => {
      x.hidden = x.dataset.v !== v;
      if (x.hidden || x.firstChild) return;
      const f = document.createElement('iframe');
      f.src = x.dataset.url; f.title = x.dataset.nombre || 'Admin';
      f.style.cssText = 'position: absolute; inset: 0; width: 100%; height: 100%; border: 0; background: #1a1a1e;';
      x.appendChild(f);
    });
    if (v === 'marketplace') cargarMarketplace();
    if (v === 'estadisticas' && !page.querySelector('.pe-cuerpo').childNodes.length) cargarEstadisticas();
  }
  // Pestaña "Mudanza" (mudanza-plan.js): el cronograma que el servidor cumple solo, como va, y los
  // botones para pausar, posponer, hacer un paso ahora, cambiar un texto o deshacer lo de Discord
  function armarVistaMudanza() {
    const v = el('div', 'pmz-vista'); v.hidden = true;
    v.appendChild(el('div', 'pmz-cuerpo'));
    return v;
  }
  const fechaMz = (ms) => new Date(ms).toLocaleString('es-AR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Argentina/Buenos_Aires' });
  const ESTADOS_MZ = { pendiente: 'Programado', 'en curso': 'En curso', hecho: 'Hecho', error: 'Con error', vencido: 'Se salteó', salteado: 'Salteado' };
  async function mudanzaApi(body) {
    const r = await fetch('/puente/api/mudanza', body
      ? { method: 'POST', headers: { Authorization: 'Bearer ' + token(), 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
      : { headers: { Authorization: 'Bearer ' + token() } });
    const d = await r.json().catch(() => null);
    if (!r.ok) throw new Error((d && d.error) || 'No se pudo.');
    return d;
  }
  function cargarMudanza(datos) {
    const cuerpo = page && page.querySelector('.pmz-cuerpo');
    if (!cuerpo) return;
    if (!datos) {
      if (!cuerpo.childNodes.length) cuerpo.appendChild(el('div', 'pm-sin', 'Cargando…'));
      mudanzaApi().then(cargarMudanza).catch(e => { cuerpo.textContent = ''; cuerpo.appendChild(el('div', 'pm-sin', e.message)); });
      return;
    }
    const aviso = (t) => { if (window.app && window.app._showToast) window.app._showToast(t, 'error'); };
    const hacer = (body, pregunta) => {
      if (pregunta && !confirm(pregunta)) return;
      mudanzaApi(body).then(d => { cargarMudanza(d); if (body.accion === 'ejecutar') setTimeout(() => cargarMudanza(), 4000); }).catch(e => aviso(e.message));
    };
    cuerpo.textContent = '';
    // Como esta y los botones generales
    const cab = el('div', 'pmz-cab');
    cab.appendChild(el('div', 'pmz-estado' + (datos.estado === 'activo' ? ' activo' : ''),
      datos.estado === 'activo' ? 'En marcha: el servidor cumple el cronograma solo, aunque nadie tenga la compu prendida.' : 'En pausa: no se hace nada hasta que lo reanudes.'));
    if (datos.ensayo) cab.appendChild(el('div', 'pmz-ensayo', 'Copia de prueba: no toca Discord ni manda emails, solo anota lo que haría.'));
    if (datos.esperarPlay) cab.appendChild(el('div', 'pmz-ensayo', 'El anuncio principal espera a que la app esté publicada en Google Play: si a esa hora todavía no está, todo lo que falta se corre un día.'));
    const acc = el('div', 'pmz-acciones');
    const boton = (txt, cls, fn) => { const b = el('button', 'pmz-btn' + (cls ? ' ' + cls : ''), txt); b.type = 'button'; b.addEventListener('click', fn); acc.appendChild(b); };
    boton(datos.estado === 'activo' ? 'Pausar todo' : 'Reanudar', datos.estado === 'activo' ? '' : 'pmz-azul', () => hacer({ accion: datos.estado === 'activo' ? 'pausar' : 'reanudar' }));
    boton('Posponer una semana', '', () => hacer({ accion: 'posponer', dias: 7 }, 'Se corre una semana todo lo que falta. Las fechas escritas con {corte} se acomodan solas; si escribiste otras a mano, después revisá esos textos. ¿Seguimos?'));
    if (datos.soloLectura || datos.lento) boton('Deshacer en Discord', 'pmz-rojo', () => hacer({ accion: 'deshacer' }, 'Los permisos y el modo lento de Discord vuelven a como estaban antes de la mudanza. ¿Seguimos?'));
    cab.appendChild(acc);
    cuerpo.appendChild(cab);
    // Numeros
    const n = datos.numeros || {};
    const nums = el('div', 'pm-resumen pmz-numeros');
    for (const [num, label] of [[n.discordPorcentaje + '%', 'escrito desde Discord (7 días)'], [n.enDiscordConCuenta, 'escriben en Discord teniendo cuenta'],
      [n.enDiscordSinCuenta, 'escriben en Discord sin cuenta'], [n.cuentas, 'cuentas en CV Chat'], [n.fundadores, 'fundadores'], [n.privados + ' · ' + n.emails, 'privados · emails mandados']]) {
      const d = el('div', 'pm-dato'); d.append(el('div', 'pm-dato-n', String(num)), el('div', 'pm-dato-l', label)); nums.appendChild(d);
    }
    cuerpo.appendChild(nums);
    // El cronograma
    const lista = el('div', 'pmz-pasos');
    for (const p of datos.pasos || []) {
      const fila = el('div', 'pmz-paso pmz-' + p.estado.replace(' ', '-'));
      const top = el('div', 'pmz-paso-top');
      top.append(el('span', 'pmz-cuando', fechaMz(p.cuando)), el('span', 'pmz-nombre', p.nombre), el('span', 'pmz-chip', ESTADOS_MZ[p.estado] || p.estado));
      fila.appendChild(top);
      if (p.detalle) fila.appendChild(el('div', 'pmz-detalle', p.detalle + (p.hecho ? ' · ' + fechaMz(p.hecho) : '')));
      const ops = el('div', 'pmz-paso-ops');
      const link = (txt, fn) => { const b = el('button', 'pmz-link', txt); b.type = 'button'; b.addEventListener('click', fn); ops.appendChild(b); };
      if (p.texto) link(p.estado === 'pendiente' ? 'Ver o cambiar el texto' : 'Ver el texto', () => editor(fila, p));
      if (p.estado === 'pendiente') {
        link('Hacerlo ahora', () => hacer({ accion: 'ejecutar', clave: p.clave }, '¿Hacer "' + p.nombre + '" ahora, sin esperar al ' + fechaMz(p.cuando) + '?'));
        link('Saltear', () => hacer({ accion: 'saltear', clave: p.clave }, '¿Saltear "' + p.nombre + '"? No se va a hacer.'));
      }
      if (ops.childNodes.length) fila.appendChild(ops);
      lista.appendChild(fila);
    }
    cuerpo.appendChild(lista);
    function editor(fila, p) {
      const ya = fila.querySelector('.pmz-editor');
      if (ya) { ya.remove(); return; }
      const box = el('div', 'pmz-editor');
      const ta = el('textarea', 'pmz-texto'); ta.value = p.texto; ta.readOnly = p.estado !== 'pendiente'; ta.rows = Math.min(16, p.texto.split('\n').length + 2);
      box.appendChild(ta);
      box.appendChild(el('div', 'pmz-ayuda', '{enlace} es el enlace para pasarse; {corte} es el día del corte ("martes 1/12") y {corte_fecha} solo la fecha ("1/12"); {play} es la app en Google Play; {cuentas} y {fundadores} se completan solos al mandarlo.'));
      if (p.estado === 'pendiente') { const g = el('button', 'pmz-btn pmz-azul', 'Guardar el texto'); g.type = 'button'; g.addEventListener('click', () => hacer({ accion: 'texto', clave: p.clave, texto: ta.value })); box.appendChild(g); }
      fila.appendChild(box);
    }
  }

  // Pestaña "Marketplace" (mercado.js, /admin): numeros, ventas con lo que opinaron, las publicaciones de
  // cada uno, denuncias y reputacion. Tocar una publicacion la abre en el Marketplace
  // ── De donde llega la gente (origenes.js), dentro de "Estadisticas" ──
  const COLORES_ORIGEN = ['#5865f2', '#3ba55d', '#f0b232', '#ee2d6f', '#9b84ec', '#80848e', '#4e5058'];
  const estimadoTxt = 'Las cuentas de antes de que se empezara a anotar (el 1/11/2026) están estimadas: quien entró con Discord o con el foro, o los vinculó al crear la cuenta, vino de ahí.';
  function nuevosPorOrigen(d) {
    const colorDe = new Map(d.serie.map((s, i) => [s.fuente, s.fuente === 'Sin dato' ? '#3a3940' : COLORES_ORIGEN[i % COLORES_ORIGEN.length]]));
    const g = el('div');
    const ley = el('div', 'pe-leyenda po-leyenda');
    for (const s of d.serie) { const sp = el('span'); const i = el('i'); i.style.background = colorDe.get(s.fuente); sp.append(i, s.fuente); ley.appendChild(sp); }
    const graf = el('div'); graf.innerHTML = barras(d.serie.map(s => s.v), d.etiquetas, d.paso, d.serie.map(s => colorDe.get(s.fuente)));
    g.append(ley, graf);
    if (d.estimadas) g.appendChild(el('div', 'pe-nota', estimadoTxt));
    return tarjeta('Nuevos miembros, según de dónde llegaron', g, 'pe-ancha');
  }
  function pintarOrigen(box, d) {
    // Cada fuente: cuentas, visitas y cuantos de los que llegaron se crearon la cuenta
    const lista = el('div');
    const maxF = Math.max(1, ...d.fuentes.map(f => f.cuentas));
    for (const f of d.fuentes) {
      // Que parte de las visitas termino en una cuenta: solo con las cuentas anotadas (las estimadas son de
      // antes de que se contaran las visitas) y si da algo con sentido; si no, solo cuantas visitas hubo
      const medidas = f.cuentas - (f.estimadas || 0);
      const nVis = fmt(f.visitas) + (f.visitas === 1 ? ' visita' : ' visitas');
      const pct = !f.visitas ? '' : medidas > 0 && medidas <= f.visitas ? ' · ' + Math.round((medidas / f.visitas) * 100) + '% de ' + nVis : ' · ' + nVis;
      const est = f.estimadas ? ' (' + (f.estimadas === f.cuentas ? 'estimado' : fmt(f.estimadas) + ' estimadas') + ')' : '';
      lista.appendChild(filaBarra(f.fuente, f.cuentas, maxF, fmt(f.cuentas) + (f.cuentas === 1 ? ' cuenta' : ' cuentas') + est + pct));
    }
    if (!d.fuentes.length) lista.appendChild(el('div', 'pe-nota', 'Todavía no hay datos en este período.'));
    box.appendChild(tarjeta('De dónde llegan los nuevos', lista));
    const vis = el('div'); vis.innerHTML = barras([d.visitasSerie], d.etiquetas, d.paso, ['#f0b232']);
    vis.appendChild(el('div', 'pe-nota', 'Navegadores que llegaron a la web, el foro o el chat desde algún lado (sin contar a los miembros que ya tenían la sesión abierta).'));
    box.appendChild(tarjeta(d.paso === 'dia' ? 'Visitas por día' : d.paso === 'semana' ? 'Visitas por semana' : 'Visitas por mes', vis));
    // Los sitios y las campañas
    if (d.detalles.length) {
      const det = el('div');
      const maxD = Math.max(1, ...d.detalles.map(x => x.cuentas));
      for (const x of d.detalles) det.appendChild(filaBarra(x.detalle, x.cuentas, maxD, fmt(x.cuentas)));
      box.appendChild(tarjeta('Sitios y enlaces', det));
    }
    // Los enlaces de canales (el botón de la cadenita): cuántos entraron por cada uno y desde dónde
    if (d.canales && d.canales.length) {
      const can = el('div');
      const maxC = Math.max(1, ...d.canales.map(x => x.visitas));
      for (const x of d.canales) {
        can.appendChild(filaBarra(x.canal, x.visitas, maxC, fmt(x.visitas) + (x.visitas === 1 ? ' visita' : ' visitas') + (x.cuentas ? ' · ' + fmt(x.cuentas) + (x.cuentas === 1 ? ' cuenta' : ' cuentas') : '')));
        if (x.fuentes) can.appendChild(el('div', 'pe-nota', 'Desde: ' + x.fuentes));
      }
      can.appendChild(el('div', 'pe-nota', 'Para saber de qué publicación vino cada uno, agregale al enlace una etiqueta: &de=x, &de=whatsapp, &de=instagram...'));
      box.appendChild(tarjeta('Enlaces a canales', can));
    }
    // Las ultimas cuentas, una por una
    const rec = el('div', 'po-lista');
    for (const r of d.recientes) {
      const f = el('div', 'po-item');
      const av = el('div', 'pm-avatar');
      if (r.avatar) { const im = el('img'); im.src = r.avatar; im.alt = ''; im.loading = 'lazy'; av.appendChild(im); } else av.textContent = String(r.nombre).charAt(0).toUpperCase();
      const info = el('div', 'po-info');
      info.append(el('div', 'pm-n1', r.nombre + ' · ' + r.fuente + (r.estimado ? ' (estimado)' : '')), el('div', 'pm-n2', [r.detalle, r.campania, r.dispositivo, r.aterrizaje ? 'entró por ' + r.aterrizaje : '', ago(r.desde)].filter(Boolean).join(' · ')));
      f.append(av, info);
      f.title = fecha(r.desde);
      f.addEventListener('click', () => { const app = window.app; if (!app || !app.socket) return; app._isHoverPopup = false; app._hoverTarget = null; app._profilePopupAnchor = av; app.socket.emit('get-user-profile', { userId: r.id }); });
      rec.appendChild(f);
    }
    if (!d.recientes.length) rec.appendChild(el('div', 'pe-nota', 'No hay cuentas nuevas en este período.'));
    box.appendChild(tarjeta('Los nuevos, uno por uno', rec, 'pe-ancha'));
    // Enlaces con etiqueta: para saber cuantos llegan por WhatsApp, Telegram o una publicacion
    const arma = el('div', 'po-arma');
    const nombre = el('input', 'pm-buscar po-etiqueta'); nombre.type = 'text'; nombre.placeholder = 'Etiqueta: whatsapp, x, instagram, video-220…'; nombre.maxLength = 40;
    const dest = el('select', 'pm-orden po-destino');
    const dom = d.dominio || 'circulovicioso.club';
    for (const [v, label] of [['https://' + dom + '/', 'La página de inicio'], ['https://chat.' + dom + '/?registro=1&', 'Crear una cuenta en CV Chat'], ['https://foro.' + dom + '/', 'El foro']]) {
      const o = el('option', null, label); o.value = v; dest.appendChild(o);
    }
    const sale = el('div', 'po-sale');
    const copiar = el('button', 'pe-rango', 'Copiar'); copiar.type = 'button';
    const armar = () => {
      const tag = nombre.value.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      const base = dest.value;
      sale.textContent = tag ? base + (base.endsWith('&') ? '' : '?') + 'de=' + tag : 'Escribí una etiqueta';
      copiar.disabled = !tag;
    };
    nombre.addEventListener('input', armar); dest.addEventListener('change', armar);
    copiar.addEventListener('click', () => { const t = sale.textContent; if (navigator.clipboard) navigator.clipboard.writeText(t).then(() => { if (window.app && window.app._showToast) window.app._showToast('Enlace copiado', 'success'); }); });
    const filaB = el('div', 'po-fila'); filaB.append(nombre, dest);
    const filaS = el('div', 'po-fila'); filaS.append(sale, copiar);
    arma.append(filaB, filaS, el('div', 'pe-nota', 'WhatsApp y Telegram no dicen de dónde viene la gente: con un enlace así, todo el que entre por ahí queda anotado con esa etiqueta.'));
    armar();
    box.appendChild(tarjeta('Armá un enlace con etiqueta', arma, 'pe-ancha'));
  }

  function armarVistaMarketplace() {
    const v = el('div', 'pk-vista'); v.hidden = true;
    const barra = el('div', 'pe-barra');
    barra.appendChild(el('div', 'pm-sub', 'Marketplace'));
    const act = el('button', 'pe-rango', 'Actualizar'); act.type = 'button'; act.addEventListener('click', () => cargarMarketplace(true));
    barra.appendChild(act);
    v.append(barra, el('div', 'pk-cuerpo'));
    return v;
  }
  const fechaMk = (ms) => (ms ? new Date(ms).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Argentina/Buenos_Aires' }) : '—');
  const precioMk = (it) => (it.precio == null ? 'A convenir' : ({ ARS: '$', USD: 'US$', USDT: 'USDT ' }[it.moneda] || '$') + fmt(it.precio));
  const quienMk = (p) => (p ? p.nombre + (p.usuario && p.usuario !== p.nombre ? ' (@' + p.usuario + ')' : '') : 'alguien que ya no está');
  const ESTADO_PUB = { activa: 'Activa', vendida: 'Vendida', borrada: 'Borrada' };
  const ESTADO_VENTA = { pendiente: 'Esperando que el comprador confirme', confirmada: 'Confirmada', rechazada: 'El comprador dijo que no' };
  function cargarMarketplace(forzar) {
    const cuerpo = page && page.querySelector('.pk-cuerpo');
    if (!cuerpo || (cuerpo.childNodes.length && !forzar)) return;
    cuerpo.textContent = ''; cuerpo.appendChild(el('div', 'pm-sin', 'Cargando…'));
    fetch('/puente/api/mercado/admin', { headers: { Authorization: 'Bearer ' + token() } })
      .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(d => { if (page) pintarMarketplace(cuerpo, d); })
      .catch(() => { if (page) { cuerpo.textContent = ''; cuerpo.appendChild(el('div', 'pm-sin', 'No se pudo cargar la actividad del Marketplace.')); } });
  }
  function pintarMarketplace(box, d) {
    box.textContent = '';
    const abrir = (id) => { close(); setTimeout(() => { const a = document.createElement('a'); a.href = location.origin + '/app?mercado=' + id; document.body.appendChild(a); a.click(); a.remove(); }, 50); };
    const enlace = (it) => { const a = el('button', 'pk-link', it.titulo); a.type = 'button'; a.title = 'Abrir en el Marketplace'; a.addEventListener('click', () => abrir(it.id)); return a; };
    const R = d.resumen;
    const tot = el('div', 'pe-totales');
    for (const [n, label] of [[R.activas, 'Publicaciones activas'], [R.vendidas, 'Marcadas como vendidas'], [R.ventasConfirmadas, 'Ventas confirmadas'],
      [R.ventasPendientes, 'Ventas sin confirmar'], [R.opinionesPositivas + ' 👍 · ' + R.opinionesNegativas + ' 👎', 'Opiniones'], [R.denuncias, 'Denuncias'],
      [R.guardados, 'Guardadas por alguien'], [R.personas, 'Personas que usaron el Marketplace']]) {
      const c = el('div', 'pe-total'); c.appendChild(el('div', 'pe-total-l', label));
      const f = el('div', 'pe-total-fila'); f.appendChild(el('span', 'pe-total-n', typeof n === 'number' ? fmt(n) : n)); c.appendChild(f);
      tot.appendChild(c);
    }
    box.appendChild(tot);
    // Ventas, con lo que se escribieron
    const vs = el('div');
    for (const v of d.ventas) {
      const f = el('div', 'pmz-paso pk-venta pk-' + v.estado);
      const top = el('div', 'pmz-paso-top');
      top.append(el('span', 'pmz-cuando', fechaMk(v.creado)), enlace(v.item), el('span', 'pk-precio', precioMk(v.item)), el('span', 'pmz-chip', ESTADO_VENTA[v.estado] || v.estado));
      f.appendChild(top);
      f.appendChild(el('div', 'pmz-detalle', 'Vendió ' + quienMk(v.vendedor) + ' · compró ' + quienMk(v.comprador)));
      for (const o of v.opiniones) {
        const op = el('div', 'pk-opinion' + (o.positiva ? '' : ' pk-mala'));
        op.append(el('span', 'pk-op-q', (o.positiva ? '👍 ' : '👎 ') + quienMk(o.de) + ' sobre ' + quienMk(o.para) + ' (' + (o.rol === 'vendedor' ? 'como vendedor' : 'como comprador') + ') · ' + fechaMk(o.creado)));
        if (o.comentario) op.appendChild(el('div', 'pk-op-t', '“' + o.comentario + '”'));
        f.appendChild(op);
      }
      if (v.estado === 'confirmada' && v.opiniones.length < 2) f.appendChild(el('div', 'pmz-detalle', v.opiniones.length ? 'Falta que opine uno de los dos.' : 'Todavía no opinó ninguno.'));
      vs.appendChild(f);
    }
    if (!d.ventas.length) vs.appendChild(el('div', 'pe-nota', 'Todavía nadie marcó una venta a otra persona del club (eso es lo que habilita confirmar y opinar).'));
    if (d.fuera.length) {
      vs.appendChild(el('div', 'pk-sub', 'Marcadas como "vendido fuera de la app" (sin comprador, así que sin opiniones)'));
      for (const it of d.fuera) {
        const f = el('div', 'pmz-paso pk-fuera'); const top = el('div', 'pmz-paso-top');
        top.append(el('span', 'pmz-cuando', it.vendidaEn ? fechaMk(it.vendidaEn) : 'fecha no anotada'), enlace(it), el('span', 'pk-precio', precioMk(it)));
        f.append(top, el('div', 'pmz-detalle', 'De ' + quienMk(it.vendedor)));
        vs.appendChild(f);
      }
    }
    box.appendChild(tarjeta('Ventas y opiniones', vs, 'pe-ancha'));
    // Denuncias
    if (d.denuncias.length) {
      const dn = el('div');
      for (const x of d.denuncias) {
        const f = el('div', 'pmz-paso pk-denuncia'); const top = el('div', 'pmz-paso-top');
        top.append(el('span', 'pmz-cuando', fechaMk(x.creado)), enlace(x.item), el('span', 'pmz-chip', x.item.oculta ? 'Oculta' : ESTADO_PUB[x.item.estado] || x.item.estado));
        f.append(top, el('div', 'pmz-detalle', 'Denunció ' + quienMk(x.de) + (x.motivo ? ': “' + x.motivo + '”' : ' (sin motivo)')));
        dn.appendChild(f);
      }
      box.appendChild(tarjeta('Denuncias', dn, 'pe-ancha'));
    }
    // Personas: lo que publico cada una y su reputacion
    const ps = el('div', 'pk-tabla');
    const cab = el('div', 'pk-fila pk-cab'); for (const t of ['Persona', 'Publicó', 'Activas', 'Ventas', 'Compras', 'Reputación']) cab.appendChild(el('span', '', t)); ps.appendChild(cab);
    for (const x of d.personas) {
      const f = el('div', 'pk-fila');
      f.append(el('span', 'pk-nombre', quienMk(x.persona)), el('span', '', fmt(x.publicaciones)), el('span', '', fmt(x.activas)), el('span', '', fmt(x.ventas)), el('span', '', fmt(x.compras)),
        el('span', '', x.porcentaje == null ? 'sin opiniones' : x.porcentaje + '% · ' + x.positivas + ' 👍 ' + x.negativas + ' 👎'));
      ps.appendChild(f);
    }
    box.appendChild(tarjeta('Personas', ps, 'pe-ancha'));
    // Todas las publicaciones de CV Chat
    const pb = el('div');
    for (const it of d.publicaciones) {
      const f = el('div', 'pmz-paso pk-pub pk-' + it.estado + (it.vencida ? ' pk-vencida' : ''));
      const top = el('div', 'pmz-paso-top');
      top.append(el('span', 'pmz-cuando', fechaMk(it.creado)), it.estado === 'borrada' ? el('span', 'pmz-nombre', it.titulo) : enlace(it), el('span', 'pk-precio', precioMk(it)),
        el('span', 'pmz-chip', it.oculta ? 'Oculta' : it.vencida ? 'Vencida' : ESTADO_PUB[it.estado] || it.estado));
      f.appendChild(top);
      const det = ['De ' + quienMk(it.vendedor), it.tipo === 'servicio' ? 'servicio' : it.condicion || 'producto', it.zona, it.fotos + (it.fotos === 1 ? ' foto' : ' fotos'),
        it.guardados ? 'guardada por ' + it.guardados : '', it.denuncias ? it.denuncias + (it.denuncias === 1 ? ' denuncia' : ' denuncias') : '',
        it.renovado !== it.creado ? 'renovada ' + fechaMk(it.renovado) : '', it.vendidaEn ? 'vendida ' + fechaMk(it.vendidaEn) : ''].filter(Boolean);
      f.appendChild(el('div', 'pmz-detalle', det.join(' · ')));
      pb.appendChild(f);
    }
    if (!d.publicaciones.length) pb.appendChild(el('div', 'pe-nota', 'Todavía no hay publicaciones.'));
    pb.appendChild(el('div', 'pe-nota', 'Los ' + fmt(R.delForo) + ' avisos que se habían traído de tejemanejes quedan guardados pero no se muestran.'));
    box.appendChild(tarjeta('Publicaciones (' + fmt(d.publicaciones.length) + ')', pb, 'pe-ancha'));
  }

  // ── Pestaña "Juegos" (juegos-estadisticas.js): que juegos se juegan, quien, cuanto tiempo, contra quien y como
  // terminan, con las partidas terminadas y el tiempo de uso ──
  let rangoJg = '4s';
  // id -> [nombre, color], de las fichas (y los que traigan las estadisticas sin ficha, en gris)
  let JG = {}, JG_ORDEN = [];
  function armarJG(js, d) {
    JG = {}; JG_ORDEN = [];
    const sumar = (id, nombre, color) => { if (!JG[id]) { JG[id] = [nombre, color || '#949ba4']; JG_ORDEN.push(id); } };
    for (const j of js) for (const e of j.estadisticas || [{ id: j.id, nombre: j.nombre }]) sumar(e.id, e.nombre, e.color);
    for (const j of d.juegos || []) sumar(j.id, j.nombre || j.id);
  }
  const MOTIVO_JG = { puntos: 'Llegó a los puntos', ultimo: 'Quedó un solo equipo',abandono: 'Abandonó alguien', mate: 'Jaque mate', ahogado: 'Ahogado (tablas)', tablas: 'Tablas',
    tiempo: 'Se acabó el reloj', meta: 'Llegó a la meta', bolas: 'Sin bolas', rendicion: 'Se rindió alguien', inactividad: 'No jugó a tiempo' };
  const PERIODO_JG = { '7d': 'los últimos 7 días', '4s': 'las últimas 4 semanas', '3m': 'los últimos 3 meses', '1a': 'el último año', todo: 'todo este tiempo' };
  const nombreJg = (id) => (JG[id] || [id])[0];
  const cuandoJg = (ms) => (ms ? new Date(ms).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Argentina/Buenos_Aires' }) : '—');
  function armarVistaJuegos() {
    const v = el('div', 'pj-vista'); v.hidden = true;
    const barra = el('div', 'pe-barra');
    barra.appendChild(el('div', 'pm-sub', 'Juegos'));
    const rangos = el('div', 'pe-rangos');
    for (const [k, label] of [['7d', '7D'], ['4s', '4S'], ['3m', '3M'], ['1a', '1A'], ['todo', 'Todo']]) {
      const b = el('button', 'pe-rango pj-rango', label); b.type = 'button'; b.dataset.r = k;
      b.title = { '7d': 'Últimos 7 días', '4s': 'Últimas 4 semanas', '3m': 'Últimos 3 meses', '1a': 'Último año', todo: 'Desde la primera partida' }[k];
      b.addEventListener('click', () => { rangoJg = k; cargarJuegosEst(); });
      rangos.appendChild(b);
    }
    barra.appendChild(rangos);
    v.append(barra, el('div', 'pe-cuerpo pj-cuerpo'));
    return v;
  }
  function cargarJuegosEst() {
    const box = page && page.querySelector('.pj-cuerpo');
    if (!box) return;
    page.querySelectorAll('.pj-rango').forEach(b => b.classList.toggle('actual', b.dataset.r === rangoJg));
    box.textContent = ''; box.appendChild(el('div', 'pm-sin', 'Calculando…'));
    Promise.all([fetch('/puente/api/estadisticas/juegos?rango=' + rangoJg, { headers: { Authorization: 'Bearer ' + token() } })
      .then(r => (r.ok ? r.json() : Promise.reject(r.status))), registroJuegos().catch(() => [])])
      .then(([d, js]) => { armarJG(js, d); if (page) pintarJuegos(box, d); })
      .catch(() => { if (page) { box.textContent = ''; box.appendChild(el('div', 'pm-sin', 'No se pudieron cargar las estadísticas de los juegos.')); } });
  }
  // Barritas chicas en SVG (las horas del dia)
  function barritas(valores, etiquetas, color) {
    const W = 640, H = 150, izq = 26, abajo = 20, arriba = 8, n = valores.length, max = Math.max(1, ...valores);
    const ancho = (W - izq) / n, b = Math.max(2, ancho * 0.7);
    const y = v => H - abajo - ((H - abajo - arriba) * v) / max;
    let svg = `<svg viewBox="0 0 ${W} ${H}" class="pe-svg" role="img">`;
    for (const f of [0, 1]) { const v = Math.round(max * f), yy = y(v); svg += `<line x1="${izq}" x2="${W}" y1="${yy}" y2="${yy}" class="pe-guia"/><text x="${izq - 6}" y="${yy + 4}" class="pe-eje" text-anchor="end">${fmt(v)}</text>`; }
    valores.forEach((v, i) => {
      const x = izq + i * ancho + (ancho - b) / 2;
      if (v) svg += `<rect x="${x}" y="${y(v)}" width="${b}" height="${Math.max(1, y(0) - y(v))}" rx="2" fill="${color}"><title>${etiquetas[i]}: ${fmt(v)}</title></rect>`;
      if (i % 3 === 0) svg += `<text x="${x + b / 2}" y="${H - 5}" class="pe-eje" text-anchor="middle">${etiquetas[i]}</text>`;
    });
    return svg + '</svg>';
  }
  function pintarJuegos(box, d) {
    box.textContent = '';
    const R = d.resumen, per = PERIODO_JG[d.rango] || 'este período';
    const usoParcial = d.usoDesde && d.usoDesde > d.desde;
    const juegos = JG_ORDEN.map(id => d.juegos.find(j => j.id === id)).filter(Boolean);
    const totP = R.partidas[0];
    if (!totP && !R.minutos[0]) { box.appendChild(el('div', 'pm-sin', 'Todavía no se jugó nada en ' + per + '.')); return; }

    // 1. Lo principal, en pocas frases
    const ul = el('ul', 'pe-resumen');
    const masJugado = [...juegos].sort((a, b) => b.partidas - a.partidas)[0];
    ul.appendChild(frase(['En ' + per + ' se terminaron ', ['b', fmt(totP)], totP === 1 ? ' partida' : ' partidas', cambio(totP, R.partidas[1]), '.']));
    if (masJugado && masJugado.partidas) ul.appendChild(frase(['El más jugado: ', ['b', masJugado.nombre], ' (' + pct(masJugado.partidas, totP) + '% de las partidas, ' + fmt(masJugado.jugadores) + (masJugado.jugadores === 1 ? ' persona' : ' personas') + ').']));
    ul.appendChild(frase([['b', fmt(R.jugadores[0])], R.jugadores[0] === 1 ? ' persona jugó' : ' personas jugaron', cambio(R.jugadores[0], R.jugadores[1]), R.nuevos ? '; ' : '.', ...(R.nuevos ? [['b', fmt(R.nuevos)], ' por primera vez.'] : [])]));
    if (totP) ul.appendChild(frase([['b', pct(totP - R.contraPersonas[0], totP) + '%'], ' fueron contra la compu y ', ['b', pct(R.contraPersonas[0], totP) + '%'], ' entre personas (' + fmt(R.contraPersonas[0]) + ').']));
    if (R.minutos[0]) ul.appendChild(frase(['Con un juego abierto estuvieron ', ['b', duracion(R.minutos[0])], ' en total (' + duracion(R.minutosPorJugador) + ' por persona)' + (usoParcial ? ', medido desde el ' + etiqueta(d.usoDesde, 'dia') : '') + '.']));
    if (R.sala) ul.appendChild(frase(['De las ', ['b', fmt(R.sala)], ' personas que abrieron la sala de juegos, ', ['b', pct(R.salaJugaron, R.sala) + '%'], ' llegó a jugar algo.']));
    if (R.invitados) ul.appendChild(frase(['Sin cuenta: ', ['b', fmt(R.invitados)], R.invitados === 1 ? ' invitado' : ' invitados', ' entraron a jugar' + (R.invitadosMin ? ' (' + duracion(R.invitadosMin) + ' en total)' : '') + '.']));
    box.appendChild(tarjeta('En pocas palabras', ul, 'pe-ancha pe-resumen-caja'));

    // 2. Los totales
    const tot = el('div', 'pe-totales');
    const dato = (l, v, act, ant, nota) => {
      const c = el('div', 'pe-total'); c.appendChild(el('div', 'pe-total-l', l));
      const f = el('div', 'pe-total-fila'); f.appendChild(el('span', 'pe-total-n', v));
      if (ant != null && d.rango !== 'todo') { const [txt, cls] = variacion(act, ant); if (txt) f.appendChild(el('span', 'pe-var ' + cls, txt)); }
      c.appendChild(f); if (nota) c.appendChild(el('div', 'pe-nota', nota)); tot.appendChild(c);
    };
    dato('Partidas terminadas', fmt(totP), totP, R.partidas[1]);
    dato('Personas que jugaron', fmt(R.jugadores[0]), R.jugadores[0], R.jugadores[1]);
    dato('Entre personas', fmt(R.contraPersonas[0]), R.contraPersonas[0], R.contraPersonas[1]);
    dato('Jugaron por primera vez', fmt(R.nuevos));
    dato('Tiempo en partidas', duracion(R.minutosPartidas[0]), R.minutosPartidas[0], R.minutosPartidas[1], 'De que empieza a que termina cada una');
    dato('Con un juego abierto', duracion(R.minutos[0]), R.minutos[0], usoParcial ? null : R.minutos[1], usoParcial ? 'Se mide desde el ' + etiqueta(d.usoDesde, 'dia') : 'A la vista y en uso');
    dato('Invitados (sin cuenta)', fmt(R.invitados), null, null, R.invitadosMin ? duracion(R.invitadosMin) + ' jugando' : '');
    dato('Ahora', fmt(R.ahora.jugando) + ' · ' + fmt(R.ahora.esperando), null, null, 'Partidas en juego (último día) · mesas esperando rival');
    box.appendChild(tot);

    // 3. Partidas por dia, semana o mes, de cada juego (apiladas)
    const g = el('div');
    g.innerHTML = barras(JG_ORDEN.map(id => d.serie.juegos[id] || []), d.serie.etiquetas, d.serie.paso, JG_ORDEN.map(id => JG[id][1]));
    const ley = el('div', 'pj-leyenda');
    for (const id of JG_ORDEN) { const s = el('span', 'pj-ley'); const c = el('i'); c.style.background = JG[id][1]; s.append(c, document.createTextNode(JG[id][0])); ley.appendChild(s); }
    g.appendChild(ley);
    box.appendChild(tarjeta('Partidas por ' + ({ dia: 'día', semana: 'semana', mes: 'mes' }[d.serie.paso] || 'período'), g, 'pe-ancha'));

    // 4. Cada juego, comparado
    const cab = ['Juego', 'Partidas', 'Personas', 'Contra la compu', 'Entre personas', 'En partidas', 'Con el juego abierto', 'Una partida dura', 'Abandonos'];
    const t = el('div', 'pe-tabla');
    const fila = (celdas, cls) => { const f = el('div', 'pe-tabla-fila' + (cls ? ' ' + cls : '')); f.style.gridTemplateColumns = 'minmax(7rem, 1.5fr) repeat(' + (cab.length - 1) + ', minmax(5rem, 1fr))'; f.style.minWidth = '52rem'; celdas.forEach(c => f.appendChild(c instanceof Node ? c : el('span', '', c))); return f; };
    t.appendChild(fila(cab, 'pe-tabla-cab'));
    for (const j of juegos) {
      const n = el('span', 'pj-juego'); const c = el('i'); c.style.background = JG[j.id][1]; n.append(c, document.createTextNode(j.nombre));
      const [vtxt] = d.rango !== 'todo' ? variacion(j.partidas, j.antes) : [''];
      t.appendChild(fila([n, fmt(j.partidas) + (vtxt ? ' (' + vtxt + ')' : ''), fmt(j.jugadores), fmt(j.contraCompu), fmt(j.contraPersonas), duracion(j.minutosPartidas),
        j.minutos ? duracion(j.minutos) + ' · ' + fmt(j.personasUso) + ' pers.' : '—', j.duracion ? duracion(j.duracion) : '—', j.partidas ? j.abandonos + '%' : '—']));
    }
    const nota = el('div', 'pe-nota', '"Una partida dura": la mitad dura menos que eso (la mediana). Las partidas que quedan abiertas mucho tiempo cuentan hasta 2 horas. Con invitados no se guardan: de ellos queda solo el tiempo.');
    const cj = el('div'); cj.append(t, nota);
    box.appendChild(tarjeta('Cada juego', cj, 'pe-ancha'));

    // 5. El detalle de cada juego: como terminan, como se juegan y cuanto le gana la compu
    for (const j of juegos) {
      if (!j.partidas) continue;
      const c = el('div');
      const top = el('div', 'pe-totales');
      const mini = (l, v) => { const x = el('div', 'pe-total'); x.append(el('div', 'pe-total-l', l), el('div', 'pe-total-n', v)); top.appendChild(x); };
      mini('Partidas', fmt(j.partidas));
      if (j.ganaCompu != null) mini('La compu gana', j.ganaCompu + '%');
      if (j.jugadas) mini('Jugadas por partida', fmt(j.jugadas));
      if (j.rondas) mini('Rondas por partida', fmt(j.rondas));
      c.appendChild(top);
      if (j.motivos.length) {
        c.appendChild(el('div', 'pe-sub', 'Cómo terminan'));
        for (const m of j.motivos.slice(0, 5)) c.appendChild(filaBarra(MOTIVO_JG[m.m] || m.m, m.n, j.partidas, fmt(m.n) + ' · ' + pct(m.n, j.partidas) + '%'));
      }
      if (j.detalles.length) {
        c.appendChild(el('div', 'pe-sub', 'Cómo se juega'));
        for (const x of j.detalles) c.appendChild(filaBarra(x.d, x.n, j.partidas, fmt(x.n) + ' · ' + pct(x.n, j.partidas) + '%'));
      }
      box.appendChild(tarjeta(j.nombre, c));
    }

    // 6. Cuando se juega
    const cu = el('div');
    const hs = [...Array(24).keys()].map(h => h + ' h');
    const hw = el('div'); hw.innerHTML = barritas(d.horas, hs, '#5865f2'); cu.appendChild(hw);
    cu.appendChild(el('div', 'pe-sub', 'Por día de la semana'));
    const maxD = Math.max(1, ...d.dias);
    DIAS.forEach((n, i) => cu.appendChild(filaBarra(n, d.dias[i], maxD, fmt(d.dias[i]))));
    cu.appendChild(el('div', 'pe-nota', 'Hora de Argentina, cuando terminó cada partida.'));
    box.appendChild(tarjeta('Cuándo se juega', cu));

    // 7. Los que mas se enfrentan
    const rv = el('div');
    if (!d.rivales.length) rv.appendChild(el('div', 'pe-nota', 'Todavía no hubo partidas entre personas en ' + per + '.'));
    for (const r of d.rivales) {
      const f = el('button', 'pe-riesgo-fila'); f.type = 'button'; f.title = 'Ver el perfil de ' + r.a.nombre;
      f.append(el('span', 'pe-riesgo-n', r.a.nombre + ' vs ' + r.b.nombre), el('span', 'pe-riesgo-d', fmt(r.partidas) + (r.partidas === 1 ? ' partida' : ' partidas') + ' · ' + r.ganaA + ' a ' + r.ganaB + ' · ' + nombreJg(r.juego)));
      f.addEventListener('click', () => abrirPerfil(r.a.id));
      rv.appendChild(f);
    }
    box.appendChild(tarjeta('Los que más se enfrentan', rv));

    // 8. Quien juega
    const cabP = ['Persona', 'Partidas', 'Gana', 'Contra la compu', 'Entre personas', 'En partidas', 'Con el juego abierto', 'Su juego', 'Última'];
    const tp = el('div', 'pe-tabla pj-personas');
    const filaP = (celdas, cls) => { const f = el(cls === 'pe-tabla-cab' ? 'div' : 'button', 'pe-tabla-fila' + (cls ? ' ' + cls : '')); f.style.gridTemplateColumns = 'minmax(9rem, 1.6fr) repeat(' + (cabP.length - 1) + ', minmax(4.75rem, 1fr))'; f.style.minWidth = '54rem'; celdas.forEach(c => f.appendChild(c instanceof Node ? c : el('span', '', c))); return f; };
    tp.appendChild(filaP(cabP, 'pe-tabla-cab'));
    for (const p of d.personas) {
      const n = el('span', 'pj-persona');
      if (p.avatar) { const i = el('img'); i.src = p.avatar; i.alt = ''; i.loading = 'lazy'; n.appendChild(i); }
      n.appendChild(el('span', '', p.nombre));
      if (p.nuevo) n.appendChild(el('span', 'pj-nuevo', 'nuevo'));
      const f = filaP([n, fmt(p.partidas), p.victorias == null ? '—' : p.victorias + '%', fmt(p.compu), fmt(p.personas), p.minutosPartidas ? duracion(p.minutosPartidas) : '—',
        p.minutos ? duracion(p.minutos) : '—', p.favorito ? nombreJg(p.favorito) : '—', p.ultimo ? cuandoJg(p.ultimo) : '—']);
      f.type = 'button'; f.title = 'Ver el perfil de ' + p.nombre;
      f.addEventListener('click', () => abrirPerfil(p.id));
      tp.appendChild(f);
    }
    const cp = el('div'); cp.appendChild(tp);
    cp.appendChild(el('div', 'pe-nota', '"Gana": de sus partidas con ganador (sin tablas ni las que no terminaron). "nuevo": jugó por primera vez en este período. Tocá una persona para ver su perfil.'));
    box.appendChild(tarjeta('Quién juega (' + fmt(d.personas.length) + ')', cp, 'pe-ancha'));

    // 9. Las ultimas partidas
    const ur = el('div');
    for (const p of d.recientes) {
      const f = el('div', 'pe-error');
      const quienes = p.jugadores.map(x => x.nombre).join(' vs ') + (p.compu ? (p.jugadores.length ? ' vs ' : '') + 'la compu' : '');
      const gano = p.ganador === 'compu' ? 'ganó la compu' : p.ganador ? 'ganó ' + p.ganador : p.motivo === 'tablas' || p.motivo === 'ahogado' ? 'tablas' : '';
      f.append(el('div', 'pj-partida-t', nombreJg(p.juego) + ' · ' + quienes),
        el('div', 'pe-error-d', [cuandoJg(p.fin), p.minutos ? duracion(p.minutos) : '', gano, MOTIVO_JG[p.motivo] || p.motivo || '', p.detalle].filter(Boolean).join(' · ')));
      ur.appendChild(f);
    }
    box.appendChild(tarjeta('Últimas partidas', ur, 'pe-ancha'));

    // 10. Para bajar en planilla
    const csv = el('div', 'pe-csv');
    const b = el('button', 'pe-csv-btn', 'Bajar en planilla (CSV)'); b.type = 'button';
    b.addEventListener('click', () => {
      const f = [['Juegos de CV Chat', d.desde + ' a ' + d.hasta], [], ['Juego', 'Partidas', 'Período anterior', 'Personas', 'Contra la compu', 'Entre personas', 'Minutos en partidas', 'Minutos con el juego abierto', 'Duración típica (min)', '% abandonos', '% gana la compu']];
      for (const j of juegos) f.push([j.nombre, j.partidas, j.antes, j.jugadores, j.contraCompu, j.contraPersonas, j.minutosPartidas, j.minutos, j.duracion, j.abandonos, j.ganaCompu == null ? '' : j.ganaCompu]);
      f.push([], ['Persona', 'Usuario', 'Partidas', '% gana', 'Contra la compu', 'Entre personas', 'Minutos en partidas', 'Minutos con un juego abierto', 'Su juego', 'Última partida']);
      for (const p of d.personas) f.push([p.nombre, p.usuario, p.partidas, p.victorias == null ? '' : p.victorias, p.compu, p.personas, p.minutosPartidas, p.minutos, p.favorito ? nombreJg(p.favorito) : '', p.ultimo ? new Date(p.ultimo).toISOString().slice(0, 16).replace('T', ' ') : '']);
      f.push([], ['Período', ...JG_ORDEN.map(nombreJg)]);
      d.serie.etiquetas.forEach((e, i) => f.push([e, ...JG_ORDEN.map(id => (d.serie.juegos[id] || [])[i] || 0)]));
      f.push([], ['Hora', 'Partidas']); d.horas.forEach((n, h) => f.push([h, n]));
      bajarCSV('juegos-cv-chat-' + d.rango + '-' + d.hasta + '.csv', f);
    });
    csv.appendChild(b);
    box.appendChild(csv);
  }

  function armarVistaEstadisticas() {
    const v = el('div', 'pe-vista'); v.hidden = true;
    const barra = el('div', 'pe-barra');
    barra.appendChild(el('div', 'pm-sub', 'Estadísticas'));
    const rangos = el('div', 'pe-rangos');
    for (const [k, label] of [['7d', '7D'], ['4s', '4S'], ['3m', '3M'], ['1a', '1A']]) {
      const b = el('button', 'pe-rango', label); b.type = 'button'; b.dataset.r = k;
      b.title = { '7d': 'Últimos 7 días', '4s': 'Últimas 4 semanas', '3m': 'Últimos 3 meses', '1a': 'Último año' }[k];
      b.addEventListener('click', () => { rangoEst = k; cargarEstadisticas(); });
      rangos.appendChild(b);
    }
    barra.appendChild(rangos);
    v.append(barra, el('div', 'pe-cuerpo'));
    return v;
  }

  function open() {
    close();
    const side = document.querySelector('aside.sidebar');
    page = el('div', 'puente-miembros');
    page.id = 'puente-miembros';
    const small = mobile();
    if (small) page.classList.add('pm-celular');
    const left = small ? 0 : side ? side.getBoundingClientRect().right : 0;
    page.style.left = left + 'px';
    const head = el('div', 'pm-head');
    // Dos pestañas: la lista de miembros (lo primero que se ve) y las estadisticas
    const title = el('div', 'pm-titulo'); title.innerHTML = ICON;
    const tabs = el('div', 'pm-pestanas');
    for (const [v, label] of [['miembros', 'Miembros'], ['estadisticas', 'Estadísticas'], ['juegos', 'Juegos'], ['marketplace', 'Marketplace'], ['propuestas', 'Propuestas'], ['mudanza', 'Mudanza']]) {
      const t = el('button', 'pm-pestana', label); t.type = 'button'; t.dataset.v = v;
      t.addEventListener('click', () => verVista(v));
      tabs.appendChild(t);
    }
    title.appendChild(tabs);
    const x = el('button', 'pm-cerrar'); x.type = 'button'; x.title = 'Cerrar (Esc)';
    x.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M18.3 5.7a1 1 0 0 0-1.4 0L12 10.6 7.1 5.7a1 1 0 0 0-1.4 1.4l4.9 4.9-4.9 4.9a1 1 0 1 0 1.4 1.4l4.9-4.9 4.9 4.9a1 1 0 0 0 1.4-1.4L13.4 12l4.9-4.9a1 1 0 0 0 0-1.4Z"/></svg>';
    x.addEventListener('click', close);
    head.append(title, x);
    const card = el('div', 'pm-card');
    // Si la copia de seguridad de la noche fallo (o hace mas de un dia y medio que no hay): un aviso arriba
    const avisoRespaldo = el('div', 'pm-respaldo'); avisoRespaldo.hidden = true; card.appendChild(avisoRespaldo);
    fetch('/puente/api/respaldo', { headers: { Authorization: 'Bearer ' + (localStorage.getItem('haven_token') || '') } })
      .then(r => (r.ok ? r.json() : null)).then(d => {
        if (!d || (d.ok && !d.aviso)) return;
        const cuando = d.fecha ? new Date(d.fecha).toLocaleString('es-AR', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }) : null;
        avisoRespaldo.textContent = d.ok ? `⚠️ La copia de seguridad principal está bien, pero ${d.aviso}.` : `⚠️ La copia de seguridad no salió bien${cuando ? ' (última: ' + cuando + ')' : ''}: ${d.error || 'revisá tools/backup.log en el servidor'}.`;
        avisoRespaldo.classList.toggle('leve', !!d.ok);
        avisoRespaldo.hidden = false;
      }).catch(() => {});
    const bar = el('div', 'pm-bar');
    const h = el('div', 'pm-sub'); h.append(el('span', '', 'Miembros recientes'), el('span', 'pm-total', ''));
    const search = el('input', 'pm-buscar'); search.type = 'text'; search.placeholder = 'Buscar por nombre, usuario o email';
    search.addEventListener('input', () => { term = search.value; renderRows(); });
    bar.append(h, search);
    if (small) {
      const order = el('select', 'pm-orden');
      order.setAttribute('aria-label', 'Ordenar');
      for (const [v, label] of [['desde:-1', 'Más nuevos primero'], ['desde:1', 'Más viejos primero'], ['nombre:1', 'Por nombre'], ['mensajes:-1', 'Más mensajes'], ['ultimo:-1', 'Escribieron hace poco'], ['visto:-1', 'Conectados hace poco']]) {
        const o = el('option', null, label); o.value = v; order.appendChild(o);
      }
      order.value = sortKey + ':' + sortDir;
      if (order.value !== sortKey + ':' + sortDir) order.value = 'desde:-1';
      order.addEventListener('change', () => { const [k, dir] = order.value.split(':'); sortKey = k; sortDir = Number(dir); renderRows(); });
      bar.appendChild(order);
    }
    // Resumen (se llena con los datos) y filtros rapidos
    const stats = el('div', 'pm-resumen');
    // Una flechita pliega todo lo de arriba (buscador, orden, resumen y filtros) para ver mas lista;
    // se recuerda en este dispositivo
    const plegar = el('button', 'pm-plegar'); plegar.type = 'button';
    plegar.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M12 8.6l6.3 6.3-1.4 1.4L12 11.4l-4.9 4.9-1.4-1.4L12 8.6Z"/></svg>';
    const plegado = (si) => {
      card.classList.toggle('pm-plegado', si);
      plegar.title = si ? 'Mostrar el buscador, el resumen y los filtros' : 'Esconder el buscador, el resumen y los filtros';
      plegar.setAttribute('aria-label', plegar.title);
      plegar.setAttribute('aria-expanded', String(!si));
    };
    let oculto = false;
    try { oculto = localStorage.getItem('puente_pm_menu') === 'plegado'; } catch { /* sin almacenamiento */ }
    plegado(oculto);
    plegar.addEventListener('click', () => {
      oculto = !card.classList.contains('pm-plegado');
      plegado(oculto);
      try { localStorage.setItem('puente_pm_menu', oculto ? 'plegado' : 'abierto'); } catch { /* sin almacenamiento */ }
    });
    h.appendChild(plegar);
    const filtros = el('div', 'pm-filtros');
    for (const [k, label] of FILTROS) {
      const b = el('button', 'pm-filtro', label); b.type = 'button'; b.dataset.f = k;
      b.addEventListener('click', () => { filtro = k; renderRows(); });
      filtros.appendChild(b);
    }
    const table = el('div', 'pm-tabla');
    const thead = el('div', 'pm-fila pm-encabezado');
    for (const [k, label] of COLS) {
      const th = el('button', 'pm-c pm-th', label); th.type = 'button'; th.dataset.k = k;
      th.addEventListener('click', () => { if (sortKey === k) sortDir = -sortDir; else { sortKey = k; sortDir = k === 'nombre' ? 1 : -1; } renderRows(); });
      thead.appendChild(th);
    }
    const rows = el('div', 'pm-filas');
    rows.appendChild(el('div', 'pm-sin', 'Cargando…'));
    table.append(thead, rows);
    card.append(bar, stats, filtros, table);
    page.append(head, card, armarVistaEstadisticas(), armarVistaJuegos(), armarVistaMarketplace(), (() => { const v = el('div', 'ppz-vista'); v.hidden = true; return v; })(), armarVistaMudanza());
    document.body.appendChild(page);
    verVista('miembros');
    // Las pestañas de los juegos que traen la suya (en su ficha, "admin": Admin → Hotel): una pagina del juego en un marco
    fetch('/puente/api/juegos/registro').then(r => (r.ok ? r.json() : null)).then(d => {
      if (!page || !d || !Array.isArray(d.juegos)) return;
      for (const j of d.juegos) {
        const v = 'ja-' + j.id;
        if (!j.admin || page.querySelector('.pja-vista[data-v="' + v + '"]')) continue;
        const t = el('button', 'pm-pestana', j.admin.nombre); t.type = 'button'; t.dataset.v = v;
        t.addEventListener('click', () => verVista(v));
        tabs.appendChild(t);
        const box = el('div', 'pja-vista'); box.hidden = true;
        box.dataset.v = v; box.dataset.url = j.admin.url; box.dataset.nombre = j.admin.nombre;
        box.style.cssText = 'flex: 1 1 auto; min-height: 0; position: relative;';
        page.appendChild(box);
      }
    }).catch(() => {});
    document.addEventListener('keydown', onKey, true);
    if (small) { try { history.pushState({ puenteMiembros: 1 }, ''); pushed = true; } catch { /* sin historial */ } }
    else search.focus(); // en el celular no: abriria el teclado
    fetch('/puente/api/miembros', { headers: { Authorization: 'Bearer ' + token() } })
      .then(r => (r.ok ? r.json() : null)).then(d => {
        if (!page) return;
        if (!d || !Array.isArray(d.miembros)) { rows.textContent = ''; rows.appendChild(el('div', 'pm-sin', 'No se pudo cargar la lista.')); return; }
        data = d.miembros;
        renderRows();
      }).catch(() => { if (page) { rows.textContent = ''; rows.appendChild(el('div', 'pm-sin', 'No hay conexión.')); } });
  }

  // "Admin" arriba de los canales (la pagina de miembros y estadisticas)
  function addEntry(app) {
    if (!app.user || !app.user.isAdmin) return;
    const pane = document.getElementById('channels-pane');
    const list = document.getElementById('channel-list');
    if (!pane || !list || document.getElementById('puente-miembros-btn')) return;
    const b = el('button', 'puente-miembros-btn');
    b.id = 'puente-miembros-btn'; b.type = 'button';
    b.innerHTML = ICON;
    b.appendChild(el('span', '', 'Admin'));
    b.addEventListener('click', () => (page ? close() : open()));
    // Admin, Actividad y Guardados van juntos en una fila arriba de los canales (#puente-atajos)
    let fila = document.getElementById('puente-atajos');
    if (!fila) { fila = el('div'); fila.id = 'puente-atajos'; list.parentElement.insertBefore(fila, list); }
    fila.appendChild(b);
  }
  let tries = 0;
  (function wait() {
    const app = window.app;
    if (!app || !app.user || !document.getElementById('channel-list')) { if (++tries < 120) setTimeout(wait, 500); return; }
    addEntry(app);
    // Al elegir un canal (o un mensaje directo) se vuelve al chat
    if (typeof app.switchChannel === 'function') {
      const orig = app.switchChannel;
      app.switchChannel = function (...args) { close(); return orig.apply(this, args); };
    }
    addEventListener('resize', () => { if (page && !page.classList.contains('pm-celular')) { const s = document.querySelector('aside.sidebar'); page.style.left = (s ? s.getBoundingClientRect().right : 0) + 'px'; } });
  })();
})();

// "Actividad" para todos (actividad.js y "Tu historia" de logros.js): arriba de los canales, al lado
// de "Miembros". Cuatro pestañas: lo ultimo (los mensajes mas nuevos de tus canales, la primera),
// lo mejor de la semana (los mensajes con mas reacciones, de los canales que ve cada uno), tu resumen (lo de "Tu historia", en corto) y el ranking del mes. En
// diciembre (y hasta el 21 de enero) se suma "Tu año": el año entero de cada uno.
// En la PC va al lado de los canales; en el celular ocupa la pantalla y el "atras" la cierra.
(function () {
  'use strict';
  const mobile = () => matchMedia('(max-width: 768px), (pointer: coarse)').matches;
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null && text !== '') n.textContent = text; return n; };
  const token = () => { try { return localStorage.getItem('haven_token'); } catch { return null; } };
  const fmt = n => Number(n || 0).toLocaleString('es-AR');
  const ICON = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M4 20h16v2H4v-2Zm1-2V10h3v8H5Zm5.5 0V4h3v14h-3ZM16 18v-6h3v6h-3Z"/></svg>';
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const pedir = (url) => fetch(url, { headers: { Authorization: 'Bearer ' + token() } }).then(r => (r.ok ? r.json() : Promise.reject(r.status)));
  function ago(iso) {
    const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
    for (const [sec, one, many] of [[86400, 'día', 'días'], [3600, 'hora', 'horas'], [60, 'minuto', 'minutos']]) if (s >= sec) { const k = Math.floor(s / sec); return 'hace ' + k + ' ' + (k === 1 ? one : many); }
    return 'recién';
  }
  // Texto con los emojis del servidor (:nombre:) como imagen, sin meter HTML de nadie
  function conEmojis(texto, pers) {
    const span = el('span');
    let ultimo = 0;
    const t = String(texto || '');
    for (const m of t.matchAll(/:([\w~-]+):/g)) {
      if (!pers[m[1]]) continue;
      span.appendChild(document.createTextNode(t.slice(ultimo, m.index)));
      const img = el('img', 'pa-emoji'); img.src = pers[m[1]]; img.alt = m[0]; span.appendChild(img);
      ultimo = m.index + m[0].length;
    }
    span.appendChild(document.createTextNode(t.slice(ultimo)));
    return span;
  }
  function avatar(p) {
    const av = el('div', 'pm-avatar pa-avatar');
    if (p && p.avatar) { const i = el('img'); i.src = p.avatar; i.alt = ''; i.loading = 'lazy'; av.appendChild(i); }
    else av.textContent = String((p && p.nombre) || '?').charAt(0).toUpperCase();
    return av;
  }

  let page = null, pushed = false, tab = 'ultimo', mesRanking = null;
  function close(fromBack) {
    if (!page) return;
    page.remove(); page = null; document.removeEventListener('keydown', onKey, true);
    if (pushed) { pushed = false; if (fromBack !== true && history.state && history.state.puenteActividad) history.back(); }
  }
  addEventListener('popstate', () => { if (page && pushed) { pushed = false; close(true); } });
  function onKey(e) { if (e.key === 'Escape' && page) { e.stopPropagation(); close(); } }
  function ir(url) { close(); if (!(window.puenteEnlaces && window.puenteEnlaces.abrir(url))) location.href = url; }

  // ── Lo ultimo: los mensajes mas nuevos de tus canales, del mas nuevo al mas viejo ──
  function itemUltimo(m, pers) {
    const it = el('button', 'pa-msg'); it.type = 'button';
    it.appendChild(avatar(m.autor));
    const cuerpo = el('div', 'pa-msg-c');
    const cab = el('div', 'pa-msg-cab');
    cab.append(el('span', 'pa-msg-n', m.autor.nombre), el('span', 'pa-ult-canal', '#' + m.canal), el('span', 'pa-msg-f', ago(m.fecha)));
    cuerpo.appendChild(cab);
    if (m.texto || !m.foto) { const tx = el('div', 'pa-msg-t'); tx.appendChild(conEmojis(m.texto || '[sin texto]', pers)); cuerpo.appendChild(tx); }
    if (m.foto) { const foto = el('img', 'pa-foto'); foto.src = m.foto; foto.alt = ''; foto.loading = 'lazy'; cuerpo.appendChild(foto); }
    it.appendChild(cuerpo);
    it.addEventListener('click', () => ir(m.url));
    return it;
  }
  function pintarUltimo(box, d) {
    box.textContent = '';
    if (!d.mensajes.length) { box.appendChild(el('div', 'pm-sin', 'Todavía no hay mensajes en tus canales.')); return; }
    box.appendChild(el('div', 'pa-intro', 'Lo último que se escribió en tus canales.'));
    const lista = el('div', 'pe-caja pa-ultimo');
    for (const m of d.mensajes) lista.appendChild(itemUltimo(m, d.personalizados || {}));
    box.appendChild(lista);
    if (!d.mas) return;
    const mas = el('button', 'pa-boton pa-ult-mas', 'Ver más'); mas.type = 'button';
    mas.addEventListener('click', () => {
      mas.disabled = true; mas.textContent = 'Cargando…';
      pedir('/puente/api/actividad/ultimos?antes=' + d.mensajes[d.mensajes.length - 1].id).then(d2 => {
        if (!page || tab !== 'ultimo') return;
        for (const m of d2.mensajes) lista.appendChild(itemUltimo(m, d2.personalizados || {}));
        d.mensajes = d.mensajes.concat(d2.mensajes);
        if (d2.mas && d2.mensajes.length) { mas.disabled = false; mas.textContent = 'Ver más'; } else mas.remove();
      }).catch(() => { mas.disabled = false; mas.textContent = 'Ver más'; });
    });
    box.appendChild(mas);
  }

  // ── Lo mejor de la semana ──
  // Los canales encajan como ladrillos: cada tarjeta ocupa las filas chiquitas (4 px) que mide, asi la de
  // abajo sube hasta donde termina la de arriba en su columna; se reacomoda sola cuando cargan las fotos
  const FILA = 4, HUECO = 16;
  let ladrillos = null;
  const acomodar = (t) => { t.style.gridRowEnd = 'span ' + Math.max(1, Math.ceil((t.getBoundingClientRect().height + HUECO) / FILA)); };
  function pintarMejor(box, d) {
    box.textContent = '';
    if (!d.canales.length) { box.appendChild(el('div', 'pm-sin', 'Esta semana todavía no hay mensajes con reacciones en tus canales.')); return; }
    box.appendChild(el('div', 'pa-intro', 'Los mensajes con más reacciones de los últimos 7 días, en tus canales.'));
    for (const c of d.canales) {
      const sec = el('div', 'pe-caja pa-canal');
      const t = el('button', 'pa-canal-t', '#' + c.canal); t.type = 'button';
      t.addEventListener('click', () => { close(); if (window.app) window.app.switchChannel(c.code); });
      sec.appendChild(t);
      for (const m of c.mensajes) {
        const it = el('button', 'pa-msg'); it.type = 'button';
        it.appendChild(avatar(m.autor));
        const cuerpo = el('div', 'pa-msg-c');
        const cab = el('div', 'pa-msg-cab'); cab.append(el('span', 'pa-msg-n', m.autor.nombre), el('span', 'pa-msg-f', ago(m.fecha)));
        const tx = el('div', 'pa-msg-t'); if (m.texto || !m.foto) tx.appendChild(conEmojis(m.texto || '[sin texto]', d.personalizados));
        const foto = m.foto ? el('img', 'pa-foto') : null;
        if (foto) { foto.src = m.foto; foto.alt = ''; foto.loading = 'lazy'; }
        const rs = el('div', 'pa-reacs');
        for (const r of m.reacciones) {
          const chip = el('span', 'pa-reac');
          const k = /^:([\w~-]+):$/.exec(r.emoji);
          if (k && d.personalizados[k[1]]) { const i = el('img', 'pa-emoji'); i.src = d.personalizados[k[1]]; i.alt = r.emoji; chip.appendChild(i); }
          else chip.appendChild(document.createTextNode(r.emoji));
          chip.appendChild(el('span', '', fmt(r.n)));
          rs.appendChild(chip);
        }
        cuerpo.append(cab);
        if (tx.childNodes.length) cuerpo.appendChild(tx);
        if (foto) cuerpo.appendChild(foto);
        cuerpo.appendChild(rs);
        it.appendChild(cuerpo);
        it.addEventListener('click', () => ir(m.url));
        sec.appendChild(it);
      }
      box.appendChild(sec);
    }
    box.classList.add('pa-ladrillos');
    const tarjetas = [...box.children];
    tarjetas.forEach(acomodar);
    if (typeof ResizeObserver === 'function') {
      ladrillos = new ResizeObserver((cambios) => { for (const c of cambios) acomodar(c.target); });
      tarjetas.forEach(t => ladrillos.observe(t));
    }
  }

  // ── Tu resumen (lo de "Tu historia") ──
  function pintarResumen(box, h) {
    box.textContent = '';
    if (!h || !h.mensajes) {
      box.appendChild(el('div', 'pm-sin', 'Todavía no escribiste en los canales. Cuando escribas, acá vas a ver tu resumen: tus canales, tu horario, tus reacciones y tu racha.'));
      return;
    }
    const datos = el('div', 'pe-totales');
    const dato = (l, v, extra) => { const c = el('div', 'pe-total'); c.appendChild(el('div', 'pe-total-l', l)); const f = el('div', 'pe-total-fila'); f.appendChild(el('span', 'pe-total-n', v)); if (extra) f.appendChild(el('span', 'pe-var', extra)); c.appendChild(f); datos.appendChild(c); };
    dato('Mensajes', fmt(h.mensajes), h.puesto ? 'puesto ' + fmt(h.puesto) + ' de ' + fmt(h.de) : '');
    dato('Reacciones que recibiste', fmt(h.reacciones));
    dato('Palabras', fmt(h.palabras));
    if (h.racha) dato('Racha', fmt(h.racha.actual) + (h.racha.actual === 1 ? ' día' : ' días'), 'la mejor: ' + fmt(h.racha.mejor));
    box.appendChild(datos);
    // Tus canales
    if (h.canales && h.canales.length) {
      const c = el('div');
      const max = h.canales[0].n || 1;
      for (const x of h.canales) {
        const f = el('div', 'pe-fila');
        const top = el('div', 'pe-fila-top'); top.append(el('span', 'pe-fila-n', '#' + x.nombre), el('span', 'pe-fila-v', fmt(x.n)));
        const fondo = el('div', 'pe-fila-fondo'); const llena = el('div', 'pe-fila-llena'); llena.style.width = Math.max(2, (x.n / max) * 100) + '%'; fondo.appendChild(llena);
        f.append(top, fondo); c.appendChild(f);
      }
      const caja = el('div', 'pe-caja'); caja.append(el('div', 'pe-titulo', 'Tus canales'), c); box.appendChild(caja);
    }
    // Tu horario (hora de Argentina)
    if (h.horas) {
      const max = Math.max(1, ...h.horas);
      const pico = h.horas.indexOf(Math.max(...h.horas));
      const g = el('div', 'pa-horas');
      h.horas.forEach((v, i) => { const b = el('div', 'pa-hora' + (i === pico ? ' pico' : '')); b.style.height = Math.max(4, (v / max) * 100) + '%'; b.title = i + ' h: ' + fmt(v); g.appendChild(b); });
      const ej = el('div', 'pa-horas-eje'); for (const t of ['0', '6', '12', '18', '23']) ej.appendChild(el('span', '', t));
      const caja = el('div', 'pe-caja'); caja.append(el('div', 'pe-titulo', 'Tu horario'), el('div', 'pa-intro', 'Escribís más a las ' + pico + ' h.'), g, ej); box.appendChild(caja);
    }
    // Tus emojis y a quien mas le respondes
    const otros = el('div', 'pe-caja');
    otros.appendChild(el('div', 'pe-titulo', 'Lo tuyo'));
    if (h.emojis && h.emojis.length) {
      const f = el('div', 'pa-linea'); f.appendChild(el('span', 'pa-linea-l', 'Tus emojis:'));
      for (const e of h.emojis) { if (e.url) { const i = el('img', 'pa-emoji'); i.src = e.url; i.alt = ':' + e.nombre + ':'; f.appendChild(i); } else f.appendChild(el('span', 'pa-emoji-t', e.e)); }
      otros.appendChild(f);
    }
    if (h.respuestas && h.respuestas.length) otros.appendChild(el('div', 'pa-linea', 'A quien más le respondés: ' + h.respuestas.map(r => r.nombre).join(', ')));
    if (h.masReaccionado) {
      const b = el('button', 'pa-msg'); b.type = 'button';
      const cuerpo = el('div', 'pa-msg-c');
      cuerpo.append(el('div', 'pa-msg-cab', 'Tu mensaje con más reacciones (' + fmt(h.masReaccionado.n) + ') · #' + h.masReaccionado.canal));
      const tx = el('div', 'pa-msg-t'); tx.appendChild(conEmojis(h.masReaccionado.texto, h.personalizados || {})); cuerpo.appendChild(tx);
      b.appendChild(cuerpo);
      b.addEventListener('click', () => ir(h.masReaccionado.url));
      otros.appendChild(b);
    }
    box.appendChild(otros);
    if (window.puenteHistoria) {
      const ver = el('button', 'pa-boton', '📖 Ver tu historia completa'); ver.type = 'button';
      ver.addEventListener('click', () => { close(); window.puenteHistoria.abrir(); });
      box.appendChild(ver);
    }
  }

  // ── Ranking del mes ──
  function pintarRanking(box, d) {
    box.textContent = '';
    const [a, m] = d.mes.split('-').map(Number);
    const hoy = new Date();
    const actual = a === hoy.getFullYear() && m === hoy.getMonth() + 1;
    const cab = el('div', 'pa-mes');
    const ant = el('button', 'pe-rango', '‹'); ant.type = 'button'; ant.title = 'Mes anterior';
    ant.addEventListener('click', () => { const d2 = new Date(Date.UTC(a, m - 2, 1)); mesRanking = d2.toISOString().slice(0, 7); cargar(); });
    const sig = el('button', 'pe-rango', '›'); sig.type = 'button'; sig.title = 'Mes siguiente'; sig.disabled = actual;
    sig.addEventListener('click', () => { const d2 = new Date(Date.UTC(a, m, 1)); mesRanking = d2.toISOString().slice(0, 7); cargar(); });
    cab.append(ant, el('span', 'pa-mes-n', MESES[m - 1] + ' ' + a + (actual ? ' (hasta hoy)' : '')), sig);
    box.appendChild(cab);
    const col = (titulo, r, unidad) => {
      const caja = el('div', 'pe-caja');
      caja.appendChild(el('div', 'pe-titulo', titulo));
      if (!r.top.length) caja.appendChild(el('div', 'pe-nota', 'Todavía nadie este mes.'));
      for (const p of r.top) {
        const f = el('div', 'pa-rank' + (p.yo ? ' yo' : ''));
        f.appendChild(el('span', 'pa-rank-p', p.puesto <= 3 ? ['🥇', '🥈', '🥉'][p.puesto - 1] : String(p.puesto)));
        f.appendChild(avatar(p));
        f.appendChild(el('span', 'pa-rank-n', p.nombre + (p.yo ? ' (vos)' : '')));
        f.appendChild(el('span', 'pa-rank-v', fmt(p.n) + ' ' + unidad));
        caja.appendChild(f);
      }
      if (r.yo && r.yo.puesto > 10) caja.appendChild(el('div', 'pe-nota', 'Vos: puesto ' + fmt(r.yo.puesto) + ' de ' + fmt(r.yo.de) + ' (' + fmt(r.yo.n) + ' ' + unidad + ').'));
      else if (!r.yo) caja.appendChild(el('div', 'pe-nota', 'Vos todavía no entrás en este ranking.'));
      return caja;
    };
    box.appendChild(col('Los que más escribieron', d.mensajes, 'mensajes'));
    box.appendChild(col('Los que más reacciones recibieron', d.reacciones, 'reacciones'));
    box.appendChild(el('div', 'pe-nota pa-pie', 'Cuentan los mensajes de los canales abiertos a todos, escritos desde CV Chat o desde Discord con la cuenta vinculada.'));
  }

  // ── Tu año en CV Chat: en diciembre y las primeras semanas de enero (el año que termino) ──
  function anioVisible() {
    const d = new Date(Date.now() - 3 * 3600 * 1000); // hora de Argentina
    const m = d.getUTCMonth(), dia = d.getUTCDate(), a = d.getUTCFullYear();
    if (m === 11) return a;
    if (m === 0 && dia <= 21) return a - 1;
    return window.puenteAnioSiempre ? a : null;
  }
  function pintarAnio(box, d) {
    box.textContent = '';
    const tapa = el('div', 'pe-caja pa-anio-tapa');
    tapa.append(el('div', 'pa-anio-a', String(d.anio)), el('div', 'pa-anio-s', 'Tu año en CV Chat'));
    box.appendChild(tapa);
    if (!d.mensajes) {
      box.appendChild(el('div', 'pm-sin', 'Este año no escribiste en los canales abiertos. ¡El que viene puede ser tu año!'));
      return;
    }
    const datos = el('div', 'pe-totales');
    const dato = (l, v, extra) => { const c = el('div', 'pe-total'); c.appendChild(el('div', 'pe-total-l', l)); const f = el('div', 'pe-total-fila'); f.appendChild(el('span', 'pe-total-n', v)); if (extra) f.appendChild(el('span', 'pe-var', extra)); c.appendChild(f); datos.appendChild(c); };
    dato('Mensajes', fmt(d.mensajes), d.puesto ? 'puesto ' + fmt(d.puesto) + ' de ' + fmt(d.de) : '');
    dato('Reacciones que recibiste', fmt(d.reacciones));
    if (d.dias) dato('Días que escribiste desde la app', fmt(d.dias));
    if (d.mejorMes != null) dato('Tu mejor mes', MESES[d.mejorMes], fmt(d.meses[d.mejorMes]) + ' mensajes');
    box.appendChild(datos);
    // Mes a mes
    const max = Math.max(1, ...d.meses);
    const g = el('div', 'pa-horas pa-meses');
    d.meses.forEach((v, i) => { const b = el('div', 'pa-hora' + (i === d.mejorMes ? ' pico' : '')); b.style.height = Math.max(4, (v / max) * 100) + '%'; b.title = MESES[i] + ': ' + fmt(v); g.appendChild(b); });
    const ej = el('div', 'pa-horas-eje pa-meses-eje'); for (const t of MESES) ej.appendChild(el('span', '', t.charAt(0).toUpperCase()));
    const caja = el('div', 'pe-caja'); caja.append(el('div', 'pe-titulo', 'Mes a mes'), g, ej); box.appendChild(caja);
    // Tus canales del año
    if (d.canales && d.canales.length) {
      const c = el('div');
      const top = d.canales[0].n || 1;
      for (const x of d.canales) {
        const f = el('div', 'pe-fila');
        const t = el('div', 'pe-fila-top'); t.append(el('span', 'pe-fila-n', '#' + x.name), el('span', 'pe-fila-v', fmt(x.n)));
        const fondo = el('div', 'pe-fila-fondo'); const llena = el('div', 'pe-fila-llena'); llena.style.width = Math.max(2, (x.n / top) * 100) + '%'; fondo.appendChild(llena);
        f.append(t, fondo); c.appendChild(f);
      }
      const cc = el('div', 'pe-caja'); cc.append(el('div', 'pe-titulo', 'Donde más escribiste'), c); box.appendChild(cc);
    }
    box.appendChild(el('div', 'pe-nota pa-pie', 'Cuentan los mensajes de los canales abiertos a todos, escritos desde CV Chat o desde Discord con la cuenta vinculada.'));
  }

  function cargar() {
    if (!page) return;
    page.querySelectorAll('.pm-pestana').forEach(b => b.classList.toggle('actual', b.dataset.v === tab));
    const box = page.querySelector('.pa-cuerpo');
    if (ladrillos) { ladrillos.disconnect(); ladrillos = null; }
    box.classList.remove('pa-ladrillos');
    box.textContent = ''; box.appendChild(el('div', 'pm-sin', 'Cargando…'));
    const fallo = () => { if (page) { box.textContent = ''; box.appendChild(el('div', 'pm-sin', 'No se pudo cargar. Probá de nuevo en un rato.')); } };
    if (tab === 'ultimo') pedir('/puente/api/actividad/ultimos').then(d => { if (page && tab === 'ultimo') pintarUltimo(box, d); }).catch(fallo);
    else if (tab === 'mejor') pedir('/puente/api/actividad/destacados').then(d => { if (page && tab === 'mejor') pintarMejor(box, d); }).catch(fallo);
    else if (tab === 'resumen') pedir('/puente/api/logros/historia').then(d => { if (page && tab === 'resumen') pintarResumen(box, d); }).catch(fallo);
    else if (tab === 'anio') pedir('/puente/api/actividad/anio?anio=' + anioVisible()).then(d => { if (page && tab === 'anio') pintarAnio(box, d); }).catch(fallo);
    else pedir('/puente/api/actividad/ranking' + (mesRanking ? '?mes=' + mesRanking : '')).then(d => { if (page && tab === 'ranking') pintarRanking(box, d); }).catch(fallo);
  }
  function open() {
    close();
    const otra = document.getElementById('puente-miembros'); if (otra) { const x = otra.querySelector('.pm-cerrar'); if (x) x.click(); }
    const side = document.querySelector('aside.sidebar');
    page = el('div', 'puente-miembros puente-actividad'); page.id = 'puente-actividad';
    const small = mobile();
    if (small) page.classList.add('pm-celular');
    page.style.left = (small ? 0 : side ? side.getBoundingClientRect().right : 0) + 'px';
    const head = el('div', 'pm-head');
    const title = el('div', 'pm-titulo'); title.innerHTML = ICON;
    const tabs = el('div', 'pm-pestanas');
    const anio = anioVisible();
    tab = 'ultimo'; // siempre abre en "Lo ultimo"
    const pestanas = [['ultimo', 'Lo último'], ['mejor', 'Lo mejor de la semana'], ['resumen', 'Tu resumen'], ['ranking', 'Ranking del mes']];
    if (anio) pestanas.push(['anio', 'Tu ' + anio]);
    for (const [v, label] of pestanas) {
      const t = el('button', 'pm-pestana', label); t.type = 'button'; t.dataset.v = v;
      t.addEventListener('click', () => { tab = v; cargar(); });
      tabs.appendChild(t);
    }
    title.appendChild(tabs);
    const x = el('button', 'pm-cerrar'); x.type = 'button'; x.title = 'Cerrar (Esc)';
    x.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M18.3 5.7a1 1 0 0 0-1.4 0L12 10.6 7.1 5.7a1 1 0 0 0-1.4 1.4l4.9 4.9-4.9 4.9a1 1 0 1 0 1.4 1.4l4.9-4.9 4.9 4.9a1 1 0 0 0 1.4-1.4L13.4 12l4.9-4.9a1 1 0 0 0 0-1.4Z"/></svg>';
    x.addEventListener('click', close);
    head.append(title, x);
    const vista = el('div', 'pe-vista pa-vista');
    vista.appendChild(el('div', 'pa-cuerpo'));
    page.append(head, vista);
    document.body.appendChild(page);
    document.addEventListener('keydown', onKey, true);
    if (small) { try { history.pushState({ puenteActividad: 1 }, ''); pushed = true; } catch { /* sin historial */ } }
    cargar();
  }

  function addEntry() {
    const list = document.getElementById('channel-list');
    if (!list || document.getElementById('puente-actividad-btn')) return;
    const b = el('button', 'puente-miembros-btn'); b.id = 'puente-actividad-btn'; b.type = 'button';
    b.innerHTML = ICON; b.appendChild(el('span', '', 'Actividad'));
    b.addEventListener('click', () => (page ? close() : open()));
    // Admin, Actividad y Guardados van juntos en una fila arriba de los canales (#puente-atajos)
    let fila = document.getElementById('puente-atajos');
    if (!fila) { fila = el('div'); fila.id = 'puente-atajos'; list.parentElement.insertBefore(fila, list); }
    fila.appendChild(b);
  }
  let tries = 0;
  (function wait() {
    const app = window.app;
    if (!app || !app.user || !document.getElementById('channel-list')) { if (++tries < 120) setTimeout(wait, 500); return; }
    // despues de "Miembros" (los admins lo tienen), asi quedan en ese orden
    setTimeout(addEntry, 600);
    if (typeof app.switchChannel === 'function') {
      const orig = app.switchChannel;
      app.switchChannel = function (...args) { close(); return orig.apply(this, args); };
    }
    // Si se abre "Miembros", esta se cierra
    new MutationObserver(() => { if (page && document.getElementById('puente-miembros')) close(); }).observe(document.body, { childList: true });
    addEventListener('resize', () => { if (page && !page.classList.contains('pm-celular')) { const s = document.querySelector('aside.sidebar'); page.style.left = (s ? s.getBoundingClientRect().right : 0) + 'px'; } });
  })();
})();

// Guardados (guardados.js), como los marcadores de X: cada uno guarda mensajes desde la barrita del
// mensaje (el marcador), el menu del mensaje o la hoja del celular, y los ve en "Guardados", arriba de
// los canales al lado de "Actividad": lo ultimo guardado primero, tocando uno se va al mensaje.
// window.puenteGuardados lo usan la barrita y los menus (mas abajo) para guardar y pintar el marcador.
(function () {
  'use strict';
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null && text !== '') n.textContent = text; return n; };
  const token = () => { try { return localStorage.getItem('haven_token'); } catch { return null; } };
  const mobile = () => matchMedia('(max-width: 768px), (pointer: coarse)').matches;
  const VACIO = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M6 2h12a1 1 0 0 1 1 1v19l-7-4.5L5 22V3a1 1 0 0 1 1-1Zm1 2v14.3l5-3.2 5 3.2V4H7Z"/></svg>';
  const LLENO = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M6 2h12a1 1 0 0 1 1 1v19l-7-4.5L5 22V3a1 1 0 0 1 1-1Z"/></svg>';
  const ids = new Set();
  let cargados = false;

  function cargarIds() {
    const tk = token();
    if (!tk) return Promise.resolve(false);
    return fetch('/puente/api/guardados/ids', { headers: { Authorization: 'Bearer ' + tk } })
      .then(r => (r.ok ? r.json() : null)).then(d => {
        if (!d || !Array.isArray(d.ids)) return false;
        ids.clear(); d.ids.forEach(i => ids.add(i)); cargados = true;
        document.querySelectorAll('[data-guardar-id]').forEach(pintar);
        return true;
      }).catch(() => false);
  }
  // Un boton o item con data-guardar-id: el marcador lleno si esta guardado
  function pintar(b) {
    const si = ids.has(Number(b.dataset.guardarId));
    b.classList.toggle('puente-guardado', si);
    const ic = b.querySelector('.puente-guardar-ico') || (b.classList.contains('puente-tb-guardar') ? b : null);
    if (ic) ic.innerHTML = si ? LLENO : VACIO;
    const lb = b.querySelector('.puente-guardar-txt');
    if (lb) lb.textContent = si ? 'Quitar de guardados' : 'Guardar mensaje';
    if (b.classList.contains('puente-tb-guardar')) b.dataset.tip = si ? 'Quitar de guardados' : 'Guardar';
  }
  function alternar(id) {
    id = Number(id);
    const tk = token();
    if (!id || !tk) return Promise.resolve(null);
    const si = !ids.has(id);
    const toast = (t, k) => { try { window.app && window.app._showToast && window.app._showToast(t, k); } catch { /* sin aviso */ } };
    return fetch('/puente/api/guardados', { method: 'POST', headers: { Authorization: 'Bearer ' + tk, 'Content-Type': 'application/json' }, body: JSON.stringify({ id, si }) })
      .then(r => r.json().catch(() => ({})).then(d => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!ok) { toast(d.error || 'No se pudo guardar.', 'error'); return null; }
        if (si) ids.add(id); else ids.delete(id);
        document.querySelectorAll('[data-guardar-id="' + id + '"]').forEach(pintar);
        toast(si ? '🔖 Guardado en Guardados' : 'Se quitó de Guardados', 'success');
        return si;
      }).catch(() => { toast('No se pudo guardar. Probá de nuevo.', 'error'); return null; });
  }

  // ── La seccion "Guardados" ──
  let page = null, pushed = false, antes = null;
  function ago(iso) {
    const s = Math.max(0, (Date.now() - (typeof iso === 'number' ? iso : Date.parse(iso))) / 1000);
    for (const [sec, one, many] of [[31536000, 'año', 'años'], [2592000, 'mes', 'meses'], [86400, 'día', 'días'], [3600, 'hora', 'horas'], [60, 'minuto', 'minutos']]) if (s >= sec) { const k = Math.floor(s / sec); return 'hace ' + k + ' ' + (k === 1 ? one : many); }
    return 'recién';
  }
  function conEmojis(texto, pers) {
    const span = el('span');
    let ultimo = 0;
    const t = String(texto || '');
    for (const m of t.matchAll(/:([\w~-]+):/g)) {
      if (!pers[m[1]]) continue;
      span.appendChild(document.createTextNode(t.slice(ultimo, m.index)));
      const img = el('img', 'pa-emoji'); img.src = pers[m[1]]; img.alt = m[0]; span.appendChild(img);
      ultimo = m.index + m[0].length;
    }
    span.appendChild(document.createTextNode(t.slice(ultimo)));
    return span;
  }
  function avatar(p) {
    const av = el('div', 'pm-avatar pa-avatar');
    if (p && p.avatar) { const i = el('img'); i.src = p.avatar; i.alt = ''; i.loading = 'lazy'; av.appendChild(i); }
    else av.textContent = String((p && p.nombre) || '?').charAt(0).toUpperCase();
    return av;
  }
  function close(fromBack) {
    if (!page) return;
    page.remove(); page = null; document.removeEventListener('keydown', onKey, true);
    if (pushed) { pushed = false; if (fromBack !== true && history.state && history.state.puenteGuardados) history.back(); }
  }
  addEventListener('popstate', () => { if (page && pushed) { pushed = false; close(true); } });
  function onKey(e) { if (e.key === 'Escape' && page) { e.stopPropagation(); close(); } }
  function ir(url) { close(); if (!(window.puenteEnlaces && window.puenteEnlaces.abrir(url))) location.href = url; }

  function item(m, pers) {
    const caja = el('div', 'pe-caja pg-item');
    const cab = el('div', 'pg-cab');
    cab.appendChild(el('span', 'pg-canal', m.privado ? '🔒 ' + m.canal : '#' + m.canal));
    cab.appendChild(el('span', 'pg-cuando', 'guardado ' + ago(m.guardado)));
    const q = el('button', 'pg-quitar'); q.type = 'button'; q.title = 'Quitar de guardados'; q.setAttribute('aria-label', 'Quitar de guardados'); q.innerHTML = LLENO;
    q.addEventListener('click', (e) => {
      e.stopPropagation();
      alternar(m.id).then(si => { if (si === false) { caja.classList.add('pg-sale'); setTimeout(() => { caja.remove(); vacio(); }, 200); } });
    });
    cab.appendChild(q);
    const msg = el('button', 'pa-msg'); msg.type = 'button';
    msg.appendChild(avatar(m.autor));
    const cuerpo = el('div', 'pa-msg-c');
    const c2 = el('div', 'pa-msg-cab'); c2.append(el('span', 'pa-msg-n', m.autor.nombre), el('span', 'pa-msg-f', ago(m.fecha)));
    cuerpo.appendChild(c2);
    if (m.privado) cuerpo.appendChild(el('div', 'pa-msg-t pg-privado', 'Mensaje privado cifrado: tocalo para verlo.'));
    else {
      if (m.texto || !m.foto) { const tx = el('div', 'pa-msg-t'); tx.appendChild(conEmojis(m.texto || '[sin texto]', pers)); cuerpo.appendChild(tx); }
      if (m.foto) { const f = el('img', 'pa-foto'); f.src = m.foto; f.alt = ''; f.loading = 'lazy'; cuerpo.appendChild(f); }
    }
    msg.appendChild(cuerpo);
    msg.addEventListener('click', () => ir(m.url));
    caja.append(cab, msg);
    return caja;
  }
  function vacio() {
    const box = page && page.querySelector('.pg-lista');
    if (box && !box.querySelector('.pg-item') && !box.querySelector('.pm-sin')) {
      box.appendChild(el('div', 'pm-sin', 'Todavía no guardaste mensajes. Tocá el marcador 🔖 de un mensaje (en el celular, mantenelo apretado) y lo vas a encontrar acá.'));
    }
  }
  function cargar(mas) {
    if (!page) return;
    const box = page.querySelector('.pg-lista');
    const boton = page.querySelector('.pg-mas');
    if (!mas) { box.textContent = ''; box.appendChild(el('div', 'pm-sin', 'Cargando…')); antes = null; }
    if (boton) boton.disabled = true;
    fetch('/puente/api/guardados' + (mas && antes ? '?antes=' + antes : ''), { headers: { Authorization: 'Bearer ' + token() } })
      .then(r => (r.ok ? r.json() : Promise.reject(r.status))).then(d => {
        if (!page) return;
        if (!mas) box.textContent = '';
        for (const m of d.mensajes) box.appendChild(item(m, d.personalizados || {}));
        antes = d.antes;
        if (boton) { boton.hidden = !d.mas; boton.disabled = false; }
        vacio();
      }).catch(() => { if (page && !mas) { box.textContent = ''; box.appendChild(el('div', 'pm-sin', 'No se pudo cargar. Probá de nuevo en un rato.')); } if (boton) boton.disabled = false; });
  }
  function open() {
    close();
    // Una sola pagina a la vez: se cierran Actividad y Miembros
    const act = document.getElementById('puente-actividad'); if (act) document.getElementById('puente-actividad-btn')?.click();
    const mie = document.getElementById('puente-miembros'); if (mie && !mie.classList.contains('puente-actividad')) mie.querySelector('.pm-cerrar')?.click();
    const side = document.querySelector('aside.sidebar');
    page = el('div', 'puente-miembros puente-actividad puente-guardados'); page.id = 'puente-guardados';
    const small = mobile();
    if (small) page.classList.add('pm-celular');
    page.style.left = (small ? 0 : side ? side.getBoundingClientRect().right : 0) + 'px';
    const head = el('div', 'pm-head');
    const title = el('div', 'pm-titulo'); title.innerHTML = LLENO; title.appendChild(el('span', 'pg-titulo', 'Guardados'));
    const x = el('button', 'pm-cerrar'); x.type = 'button'; x.title = 'Cerrar (Esc)';
    x.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M18.3 5.7a1 1 0 0 0-1.4 0L12 10.6 7.1 5.7a1 1 0 0 0-1.4 1.4l4.9 4.9-4.9 4.9a1 1 0 1 0 1.4 1.4l4.9-4.9 4.9 4.9a1 1 0 0 0 1.4-1.4L13.4 12l4.9-4.9a1 1 0 0 0 0-1.4Z"/></svg>';
    x.addEventListener('click', close);
    head.append(title, x);
    const vista = el('div', 'pe-vista pa-vista');
    const col = el('div', 'pg-columna');
    col.appendChild(el('div', 'pa-intro', 'Los mensajes que guardaste. Solo los ves vos.'));
    col.appendChild(el('div', 'pg-lista'));
    const mas = el('button', 'pa-boton pg-mas', 'Ver más'); mas.type = 'button'; mas.hidden = true;
    mas.addEventListener('click', () => cargar(true));
    col.appendChild(mas);
    vista.appendChild(col);
    page.append(head, vista);
    document.body.appendChild(page);
    document.addEventListener('keydown', onKey, true);
    if (small) { try { history.pushState({ puenteGuardados: 1 }, ''); pushed = true; } catch { /* sin historial */ } }
    cargar(false);
  }

  window.puenteGuardados = { es: (id) => ids.has(Number(id)), alternar, pintar, abrir: open, VACIO, LLENO, cargados: () => cargados };

  function addEntry() {
    const list = document.getElementById('channel-list');
    if (!list || document.getElementById('puente-guardados-btn')) return;
    const b = el('button', 'puente-miembros-btn'); b.id = 'puente-guardados-btn'; b.type = 'button';
    b.innerHTML = LLENO; b.appendChild(el('span', '', 'Guardados'));
    b.addEventListener('click', () => (page ? close() : open()));
    // Admin, Actividad y Guardados van juntos en una fila arriba de los canales (#puente-atajos)
    let fila = document.getElementById('puente-atajos');
    if (!fila) { fila = el('div'); fila.id = 'puente-atajos'; list.parentElement.insertBefore(fila, list); }
    fila.appendChild(b);
  }
  let tries = 0;
  (function wait() {
    const app = window.app;
    if (!app || !app.user || !document.getElementById('channel-list')) { if (++tries < 120) setTimeout(wait, 500); return; }
    cargarIds();
    // despues de "Miembros" y "Actividad", asi quedan en ese orden
    setTimeout(addEntry, 900);
    if (typeof app.switchChannel === 'function') {
      const orig = app.switchChannel;
      app.switchChannel = function (...args) { close(); return orig.apply(this, args); };
    }
    // Si se abre Actividad o Miembros, esta se cierra
    new MutationObserver(() => {
      if (!page) return;
      const otra = document.getElementById('puente-actividad') || [...document.querySelectorAll('#puente-miembros')].find(p => p !== page);
      if (otra) close();
    }).observe(document.body, { childList: true });
    addEventListener('resize', () => { if (page && !page.classList.contains('pm-celular')) { const s = document.querySelector('aside.sidebar'); page.style.left = (s ? s.getBoundingClientRect().right : 0) + 'px'; } });
  })();
})();

// PC: los resultados de la busqueda como los de Discord. Arriba "N resultados"
// con los botones Filtros y Ordenar; los mensajes agrupados por canal (con su
// categoria a la derecha), cada uno con la foto de quien lo escribio y las
// vistas previas de los enlaces ya abiertas; abajo las paginas numeradas con
// Anterior y Siguiente. Es el mismo panel de Haven (la busqueda, saltar al
// mensaje y las paginas son las suyas); solo cambia como se ve.
(function () {
  'use strict';
  if (matchMedia('(pointer: coarse)').matches) return;
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null && text !== '') n.textContent = text; return n; };
  const PAGE = 25;
  const SORTS = [['newest', 'Más nuevos'], ['oldest', 'Más viejos'], ['relevant', 'Más relevantes']];
  const svg = d => `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="${d}"/></svg>`;
  const IC_FILTER = svg('M3 5h18v2H3V5Zm3 6h12v2H6v-2Zm4 6h4v2h-4v-2Z');
  const IC_SORT = svg('M8 3 4 7h3v10h2V7h3L8 3Zm8 18 4-4h-3V7h-2v10h-3l4 4Z');

  function closeSortMenu() { document.getElementById('puente-sr-orden')?.remove(); }
  function sortMenu(app, anchor, current) {
    closeSortMenu();
    const m = el('div', 'puente-sr-orden');
    m.id = 'puente-sr-orden';
    for (const [k, label] of SORTS) {
      const b = el('button', 'puente-sr-orden-item' + (k === current ? ' actual' : ''), label); b.type = 'button';
      b.addEventListener('click', (e) => { e.stopPropagation(); closeSortMenu(); try { app._searchSetSort(k); } catch { /* nada */ } });
      m.appendChild(b);
    }
    document.body.appendChild(m);
    const r = anchor.getBoundingClientRect();
    m.style.top = (r.bottom + 6) + 'px';
    m.style.left = Math.max(8, r.right - m.offsetWidth) + 'px';
    setTimeout(() => document.addEventListener('mousedown', function off(e) { if (!m.contains(e.target)) { closeSortMenu(); document.removeEventListener('mousedown', off, true); } }, true), 0);
  }

  function decorate(app) {
    const panel = document.getElementById('search-panel');
    if (!panel || panel.style.display === 'none') return;
    const st = app._searchGetState && app._searchGetState(app._searchContextKey());
    if (!st || st.stale) return;
    const total = st.serverPaged ? (st.total || 0) : (st.results || []).length;

    // Encabezado
    const count = document.getElementById('search-panel-count');
    if (count) {
      count.textContent = '';
      count.classList.add('puente-sr-cabeza');
      count.appendChild(el('span', 'puente-sr-total', total.toLocaleString('es-AR') + (total === 1 ? ' resultado' : ' resultados')));
      const tools = el('span', 'puente-sr-botones');
      const nf = (st.filters ? Object.values(st.filters).filter(v => v && v !== 'false').length : 0);
      const fb = el('button', 'puente-sr-boton'); fb.type = 'button'; fb.innerHTML = IC_FILTER;
      fb.appendChild(el('span', '', 'Filtros' + (nf ? ' (' + nf + ')' : '')));
      fb.addEventListener('click', (e) => { e.stopPropagation(); const i = document.getElementById('search-input'); if (i) i.focus(); });
      const sb = el('button', 'puente-sr-boton'); sb.type = 'button'; sb.innerHTML = IC_SORT;
      sb.appendChild(el('span', '', 'Ordenar'));
      if (!st.isDM) { sb.addEventListener('click', (e) => { e.stopPropagation(); sortMenu(app, sb, st.sort || 'newest'); }); tools.append(fb, sb); }
      count.appendChild(tools);
    }

    // Mensajes: agrupados por canal, con la foto
    const list = document.getElementById('search-panel-list');
    if (list) {
      const byId = new Map((st.results || []).map(r => [String(r.id), r]));
      const cats = new Map((app.channels || []).map(c => [c.code, c.category || '']));
      let prev = null;
      for (const item of list.querySelectorAll('.search-result-item')) {
        const r = byId.get(String(item.dataset.msgId)) || {};
        const code = item.dataset.channelCode || '';
        const old = item.querySelector('.search-result-channel');
        if (old) old.remove();
        if (code && code !== prev) {
          const h = el('div', 'puente-sr-canal');
          h.append(el('span', 'puente-sr-canal-nombre', '# ' + (r.channel_name || code)));
          const cat = r.channel_category || cats.get(code);
          if (cat) h.append(el('span', 'puente-sr-canal-cat', cat));
          item.before(h);
        }
        prev = code || prev;
        if (!item.querySelector('.puente-sr-avatar')) {
          const av = el('div', 'puente-sr-avatar');
          if (r.avatar) { const img = el('img'); img.src = r.avatar; img.alt = ''; img.loading = 'lazy'; av.appendChild(img); }
          else av.textContent = String(r.username || (item.querySelector('.search-result-author') || {}).textContent || '?').trim().charAt(0).toUpperCase();
          item.prepend(av);
          item.classList.add('puente-sr');
        }
      }
      // Las vistas previas abiertas, como Discord (Haven las deja detras de un boton)
      list.querySelectorAll('.search-load-embed').forEach((b, i) => setTimeout(() => { if (b.isConnected) b.click(); }, 50 * i));
    }

    // Paginas numeradas
    const pager = document.getElementById('search-panel-pager');
    if (pager) {
      pager.classList.add('puente-sr-paginas');
      pager.querySelector('.puente-sr-nums')?.remove();
      const pages = Math.max(1, Math.ceil(total / PAGE));
      const cur = Math.min(st.page || 1, pages);
      const nums = el('div', 'puente-sr-nums');
      const go = (n) => { if (n !== cur) try { app._searchGoToPageAbsolute(String(n)); } catch { /* nada */ } };
      const btn = (label, n, cls) => { const b = el('button', 'puente-sr-num' + (cls ? ' ' + cls : ''), label); b.type = 'button'; if (n) b.addEventListener('click', () => go(n)); else b.disabled = true; return b; };
      nums.appendChild(btn('‹ Anterior', cur > 1 ? cur - 1 : 0, 'puente-sr-flecha'));
      const want = new Set([1, pages, cur - 1, cur, cur + 1].filter(n => n >= 1 && n <= pages));
      if (cur <= 3) [2, 3].forEach(n => n <= pages && want.add(n));
      let last = 0;
      for (const n of [...want].sort((a, b) => a - b)) {
        if (n - last > 1) nums.appendChild(el('span', 'puente-sr-puntos', '…'));
        nums.appendChild(btn(String(n), n === cur ? 0 : n, n === cur ? 'actual' : ''));
        last = n;
      }
      nums.appendChild(btn('Siguiente ›', cur < pages ? cur + 1 : 0, 'puente-sr-flecha'));
      pager.appendChild(nums);
    }
  }

  let tries = 0;
  (function wait() {
    const app = window.app;
    if (!app || typeof app._searchRenderPanel !== 'function') { if (++tries < 120) setTimeout(wait, 500); return; }
    const orig = app._searchRenderPanel;
    app._searchRenderPanel = function (...args) {
      const r = orig.apply(this, args);
      try { decorate(this); } catch (err) { console.warn('[puente] resultados de la busqueda:', err); }
      return r;
    };
  })();
})();

// PC: el boton + del cuadro de escribir como en Discord: un menu con iconos
// ("Subir un archivo", "Crear encuesta"...) en lugar de la fila de botones de
// Haven, que ademas repetia la carita y el GIF de la derecha. Cada opcion usa el
// boton de Haven, asi que hace lo mismo que antes; solo aparecen las que Haven
// muestra en ese canal (por ejemplo, sin archivos si el canal no los permite).
// Con el mensaje que se autodestruye (o el de borrar al leer) encendido, el +
// queda marcado.
(function () {
  'use strict';
  if (matchMedia('(pointer: coarse)').matches) return;
  const svg = d => `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="${d}"/></svg>`;
  const ITEMS = [
    ['upload-btn', 'Subir un archivo', svg('M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h6.3a6.5 6.5 0 0 1-.3-2H6V4h7v5h5v2.1a6.5 6.5 0 0 1 2 .6V8l-6-6Zm4 12-3.5 3.5 1.4 1.4 1.1-1.1V22h2v-4.2l1.1 1.1 1.4-1.4L18 14Z')],
    ['poll-btn', 'Crear encuesta', svg('M4 5h11a1.5 1.5 0 0 1 0 3H4a1.5 1.5 0 0 1 0-3Zm0 5.5h16a1.5 1.5 0 0 1 0 3H4a1.5 1.5 0 0 1 0-3ZM4 16h7a1.5 1.5 0 0 1 0 3H4a1.5 1.5 0 0 1 0-3Z')],
    ['voice-btn', 'Mensaje de voz', svg('M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.9V21h2v-3.1A7 7 0 0 0 19 11h-2Z')],
    ['time-btn', 'Insertar fecha y hora', svg('M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16Zm1-13h-2v6l5 3 1-1.7-4-2.3V7Z')],
    ['format-btn', 'Formato y comandos', svg('M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25ZM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83Z')],
    ['self-destruct-btn', 'Mensaje que se autodestruye', svg('M13.5 1s.7 2.6.7 4.7c0 2-1.3 3.7-3.4 3.7S7.4 7.7 7.4 5.7V5.4C5.3 7.9 4 11.2 4 14.7A8 8 0 0 0 20 14.7c0-5.4-2.6-10.2-6.5-13.7ZM12 20a3 3 0 0 1-3-2.9c0-1.4.9-2.4 2.5-2.7 1.6-.3 3.2-1.1 4.1-2.3.4 1.2.6 2.5.6 3.9A4.2 4.2 0 0 1 12 20Z'), true],
    ['burn-btn', 'Borrar al leer', svg('M13.5 1s.7 2.6.7 4.7c0 2-1.3 3.7-3.4 3.7S7.4 7.7 7.4 5.7V5.4C5.3 7.9 4 11.2 4 14.7A8 8 0 0 0 20 14.7c0-5.4-2.6-10.2-6.5-13.7Z'), true],
    ['highlight-btn', 'Mensaje oficial', svg('M12 2 9.2 8.6 2 9.2l5.5 4.7L5.8 21 12 17.3 18.2 21l-1.7-7.1L22 9.2l-7.2-.6L12 2Z'), true],
  ];
  const shown = (b) => b && b.style.display !== 'none' && !b.closest('[style*="display: none"]') && !b.disabled;
  const armed = (b) => b && (b.classList.contains('active') || b.getAttribute('aria-pressed') === 'true');

  let menu = null;
  function close() {
    if (!menu) return;
    menu.remove(); menu = null;
    document.getElementById('composer-plus-btn')?.setAttribute('aria-expanded', 'false');
  }
  function mark() {
    const plus = document.getElementById('composer-plus-btn');
    if (plus) plus.classList.toggle('puente-armado', ['self-destruct-btn', 'burn-btn'].some(id => armed(document.getElementById(id))));
  }
  function open(plus) {
    close();
    menu = document.createElement('div');
    menu.id = 'puente-mas';
    menu.className = 'puente-mas';
    for (const [id, label, icon, toggle] of ITEMS) {
      const btn = document.getElementById(id);
      if (!shown(btn)) continue;
      const it = document.createElement('button');
      it.type = 'button';
      it.className = 'puente-mas-item' + (toggle && armed(btn) ? ' activo' : '');
      it.innerHTML = icon;
      const text = document.createElement('span');
      text.textContent = label;
      it.appendChild(text);
      if (toggle) { const st = document.createElement('span'); st.className = 'puente-mas-estado'; st.textContent = armed(btn) ? 'Activado' : ''; it.appendChild(st); }
      it.addEventListener('click', (e) => {
        e.stopPropagation();
        close();
        // Despues de este clic, para que los selectores de Haven no se cierren con el
        setTimeout(() => { btn.click(); setTimeout(mark, 50); }, 0);
      });
      menu.appendChild(it);
    }
    if (!menu.children.length) { menu = null; return; }
    document.body.appendChild(menu);
    const r = plus.getBoundingClientRect();
    menu.style.left = Math.max(8, Math.min(r.left, innerWidth - menu.offsetWidth - 8)) + 'px';
    menu.style.top = Math.max(8, r.top - menu.offsetHeight - 8) + 'px';
    plus.setAttribute('aria-expanded', 'true');
  }

  // Antes que Haven: el + abre este menu y no la fila de botones
  document.addEventListener('click', (e) => {
    const plus = e.target instanceof Element && e.target.closest('#composer-plus-btn');
    if (plus) { e.stopPropagation(); e.preventDefault(); if (menu) close(); else open(plus); return; }
    if (menu && !menu.contains(e.target)) close();
  }, true);
  document.addEventListener('keydown', (e) => { if (menu && e.key === 'Escape') { e.stopPropagation(); close(); } }, true);
  addEventListener('resize', close);
  // El + marcado mientras el mensaje que se autodestruye esta encendido (Haven lo apaga al cambiar de canal)
  let tries = 0;
  (function wait() {
    const ids = ['self-destruct-btn', 'burn-btn'].map(id => document.getElementById(id)).filter(Boolean);
    if (!ids.length) { if (++tries < 120) setTimeout(wait, 500); return; }
    const mo = new MutationObserver(mark);
    ids.forEach(b => mo.observe(b, { attributes: true, attributeFilter: ['class', 'aria-pressed', 'style'] }));
    mark();
  })();
})();

// Pantallas tactiles: el boton + del cuadro de escribir como en la app de
// Discord: una hoja que sube desde abajo con la camara y la galeria arriba
// (una pagina web no puede mostrar las fotos del telefono adentro, asi que
// "Galeria" abre el selector de fotos del telefono), las demas opciones de
// Haven en el medio, y abajo la barra flotante (Fotos, Encuesta, Voz,
// Archivos). Cada opcion usa el boton de Haven, asi que hace lo mismo que antes
// y solo aparecen las que Haven muestra en ese canal.
(function () {
  'use strict';
  if (!matchMedia('(pointer: coarse)').matches) return;
  const svg = (d, s = 26) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" aria-hidden="true"><path fill="currentColor" d="${d}"/></svg>`;
  const I = {
    camara: 'M9.4 4 8 6H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-3l-1.4-2H9.4ZM12 17.5a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9Zm0-2a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
    fotos: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm0 13.6V19h14v-3.4l-4-4-4.5 4.5-2.5-2.5-3 3Zm3.5-6.1a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
    encuesta: 'M4 5h11a1.5 1.5 0 0 1 0 3H4a1.5 1.5 0 0 1 0-3Zm0 5.5h16a1.5 1.5 0 0 1 0 3H4a1.5 1.5 0 0 1 0-3ZM4 16h7a1.5 1.5 0 0 1 0 3H4a1.5 1.5 0 0 1 0-3Z',
    voz: 'M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.9V21h2v-3.1A7 7 0 0 0 19 11h-2Z',
    archivos: 'M16.5 6.5v10.1a4.5 4.5 0 0 1-9 0V5.8a3 3 0 0 1 6 0v9.6a1.5 1.5 0 0 1-3 0V6.5H9v8.9a3 3 0 0 0 6 0V5.8a4.5 4.5 0 0 0-9 0v10.8a6 6 0 0 0 12 0V6.5h-1.5Z',
    hora: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16Zm1-13h-2v6l5 3 1-1.7-4-2.3V7Z',
    formato: 'M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25ZM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83Z',
    fuego: 'M13.5 1s.7 2.6.7 4.7c0 2-1.3 3.7-3.4 3.7S7.4 7.7 7.4 5.7V5.4C5.3 7.9 4 11.2 4 14.7A8 8 0 0 0 20 14.7c0-5.4-2.6-10.2-6.5-13.7ZM12 20a3 3 0 0 1-3-2.9c0-1.4.9-2.4 2.5-2.7 1.6-.3 3.2-1.1 4.1-2.3.4 1.2.6 2.5.6 3.9A4.2 4.2 0 0 1 12 20Z',
    emoji: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm-3.5 6a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Zm7 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM12 18a5.5 5.5 0 0 1-5-3.2h10A5.5 5.5 0 0 1 12 18Z',
    gif: 'M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm4.3 11.2c1 0 1.8-.3 2.4-.9v-2.8H8.2v1.1h1.2v1.1c-.3.2-.6.3-1 .3-.9 0-1.4-.7-1.4-1.9s.6-1.9 1.5-1.9c.5 0 .9.2 1.2.5l.8-.9a2.7 2.7 0 0 0-2-.8C6.8 8.9 5.6 10 5.6 12.1c0 2 1.1 3.1 2.7 3.1Zm3.6-.1h1.4V9h-1.4v6.1Zm2.7 0H16v-2.4h2.2v-1.2H16v-1.3h2.5V9h-3.9v6.1Z',
    oficial: 'M12 2 9.2 8.6 2 9.2l5.5 4.7L5.8 21 12 17.3 18.2 21l-1.7-7.1L22 9.2l-7.2-.6L12 2Z',
  };
  // [boton de Haven, nombre, icono, se prende y apaga]
  const LIST = [
    ['emoji-btn', 'Emoji', I.emoji],
    ['gif-btn', 'GIF', I.gif],
    ['time-btn', 'Insertar fecha y hora', I.hora],
    ['format-btn', 'Formato y comandos', I.formato],
    ['self-destruct-btn', 'Mensaje que se autodestruye', I.fuego, true],
    ['burn-btn', 'Borrar al leer', I.fuego, true],
    ['highlight-btn', 'Mensaje oficial', I.oficial, true],
  ];
  const BAR = [
    ['galeria', 'Fotos', I.fotos],
    ['poll-btn', 'Encuesta', I.encuesta],
    ['voice-btn', 'Voz', I.voz],
    ['upload-btn', 'Archivos', I.archivos],
  ];
  const byId = (id) => document.getElementById(id);
  const shown = (b) => b && b.style.display !== 'none' && !b.closest('[style*="display: none"]') && !b.disabled;
  const armed = (b) => b && (b.classList.contains('active') || b.getAttribute('aria-pressed') === 'true');
  const el = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html) n.innerHTML = html; return n; };

  function close() {
    byId('puente-adjuntar')?.remove();
    byId('puente-adjuntar-fondo')?.remove();
    byId('composer-plus-btn')?.setAttribute('aria-expanded', 'false');
  }
  window.puenteAdjuntar = { abierto: () => !!byId('puente-adjuntar'), cerrar: close };

  // Fotos de la camara o de la galeria: a la cola de adjuntos de Haven, como su boton
  function pickMedia(camera) {
    const app = window.app;
    if (!app || typeof app._queueComposerFiles !== 'function') { byId('upload-btn')?.click(); return; }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,video/*';
    if (camera) { input.accept = 'image/*'; input.setAttribute('capture', 'environment'); } else input.multiple = true;
    input.style.display = 'none';
    input.addEventListener('change', () => {
      if (input.files && input.files.length) app._queueComposerFiles(input.files);
      input.remove();
    });
    document.body.appendChild(input);
    input.click();
  }

  function run(id) {
    close();
    const app = window.app;
    if ((id === 'camara' || id === 'galeria') && app && !app.currentChannel) { app._showToast && app._showToast('Elegí un canal primero', 'error'); return; }
    // Despues de este toque, para que los selectores de Haven no se cierren con el
    setTimeout(() => {
      if (id === 'camara') pickMedia(true);
      else if (id === 'galeria') pickMedia(false);
      else byId(id)?.click();
    }, 0);
  }

  function open() {
    close();
    const filesOk = shown(byId('upload-btn'));
    const sheet = el('div', 'puente-adjuntar');
    sheet.id = 'puente-adjuntar';
    sheet.appendChild(el('div', 'puente-sheet-handle'));

    const scroll = el('div', 'puente-adj-cuerpo');
    if (filesOk) {
      const tiles = el('div', 'puente-adj-mosaico');
      for (const [id, label, icon] of [['camara', 'Cámara', I.camara], ['galeria', 'Galería', I.fotos]]) {
        const b = el('button', 'puente-adj-cuadro', svg(icon, 34));
        b.type = 'button';
        b.appendChild(el('span', '', label));
        b.addEventListener('click', (e) => { e.stopPropagation(); run(id); });
        tiles.appendChild(b);
      }
      scroll.appendChild(tiles);
    }
    const group = el('div', 'puente-sheet-group');
    for (const [id, label, icon, toggle] of LIST) {
      const btn = byId(id);
      if (!shown(btn)) continue;
      // La carita y el GIF, solo si no estan ya a la vista en el cuadro de escribir
      if ((id === 'emoji-btn' || id === 'gif-btn') && btn.getClientRects().length) continue;
      const it = el('button', 'channel-ctx-item puente-adj-fila' + (toggle && armed(btn) ? ' activo' : ''), svg(icon, 22));
      it.type = 'button';
      it.appendChild(el('span', '', label));
      if (toggle && armed(btn)) it.appendChild(el('span', 'puente-adj-estado', 'Activado'));
      it.addEventListener('click', (e) => { e.stopPropagation(); run(id); });
      group.appendChild(it);
    }
    if (group.children.length) scroll.appendChild(group);
    sheet.appendChild(scroll);

    const bar = el('div', 'puente-adj-barra');
    for (const [id, label, icon] of BAR) {
      if (id === 'galeria' ? !filesOk : !shown(byId(id))) continue;
      const b = el('button', 'puente-adj-accion', svg(icon, 26));
      b.type = 'button';
      b.appendChild(el('span', '', label));
      b.addEventListener('click', (e) => { e.stopPropagation(); run(id); });
      bar.appendChild(b);
    }
    if (bar.children.length) sheet.appendChild(bar);
    if (!scroll.children.length && !bar.children.length) return;

    const back = el('div');
    back.id = 'puente-adjuntar-fondo';
    back.addEventListener('click', close);
    // Como en Discord: se esconde el teclado
    if (document.activeElement && document.activeElement.id === 'message-input') document.activeElement.blur();
    document.body.append(back, sheet);
    byId('composer-plus-btn')?.setAttribute('aria-expanded', 'true');
    if (typeof haptic === 'function') haptic();
    sheetDrag(sheet, { close, scroller: scroll });
  }

  // Antes que Haven: el + abre esta hoja y no su menu
  document.addEventListener('click', (e) => {
    const plus = e.target instanceof Element && e.target.closest('#composer-plus-btn');
    if (!plus) return;
    e.stopPropagation(); e.preventDefault();
    window.app && window.app._closeComposerMenu && window.app._closeComposerMenu();
    if (byId('puente-adjuntar')) close(); else open();
  }, true);

  // Al lado del +, un boton de fotos: un toque y se abre el selector de fotos del telefono (una
  // pagina no puede mostrar la galeria adentro, como la app de Discord). El + sigue abriendo la
  // hoja con todo lo demas. Mientras se escribe se esconde, para dejarle lugar al texto (como
  // Discord), y no aparece donde no se pueden subir archivos.
  (function botonFotos() {
    const plus = byId('composer-plus-btn'), area = byId('message-input-area'), input = byId('message-input');
    if (!plus || !area || !input) { setTimeout(botonFotos, 1000); return; }
    if (byId('puente-fotos-btn')) return;
    const b = el('button', 'puente-fotos-btn', svg(I.fotos, 24));
    b.id = 'puente-fotos-btn';
    b.type = 'button';
    b.title = 'Fotos';
    b.setAttribute('aria-label', 'Mandar fotos o videos');
    b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); run('galeria'); });
    plus.after(b);
    const ver = () => {
      const escribe = !!(input.value && input.value.trim());
      const ok = shown(byId('upload-btn')) && !input.disabled && !area.classList.contains('puente-sin-permiso');
      b.hidden = escribe || !ok;
    };
    input.addEventListener('input', ver);
    document.addEventListener('selectionchange', ver);
    setInterval(ver, 700); // Haven vacia el cuadro al mandar, cambia de canal, etc.
    ver();
  })();
})();

// Pantallas tactiles: el selector de emojis y stickers del cuadro de escribir
// (tambien al editar un mensaje) como en la app de Discord: una hoja que sube
// desde abajo a media pantalla, con "Usados frecuentemente" arriba de todo.
// Deslizando la lista (o la manija) hacia arriba se agranda hasta casi toda la
// pantalla; hacia abajo se achica y, muy abajo, se cierra. Tocar afuera tambien
// la cierra. Es el mismo selector de Haven (emojis, stickers, buscador, tono de
// piel); solo cambia donde y como se muestra. El teclado no aparece mientras
// esta abierta, como en Discord, y el emoji se escribe donde estaba el cursor.
// Las hojas de emojis y de GIFs en el celu se abren debajo del cuadro de escribir, como en Discord:
// el cuadro sube y queda arriba de la hoja (el chat se achica), asi se ve lo que se va escribiendo.
// vh: el alto de la hoja; null: se cerro (si no quedo abierta la otra, que la reemplaza).
function puenteHojaAlto(vh) {
  'use strict';
  const root = document.documentElement, sc = document.getElementById('messages'), area = document.getElementById('message-input-area');
  const e = document.getElementById('emoji-picker'), g = document.getElementById('gif-picker');
  const abierta = (e && e.style.display === 'flex') || (g && g.classList.contains('puente-gif-sheet') && g.style.display && g.style.display !== 'none');
  if (vh == null && abierta) return;
  const abajo = !!sc && sc.scrollHeight - sc.clientHeight - sc.scrollTop <= 40;
  if (vh == null) {
    root.classList.remove('puente-hoja-abierta');
    root.style.removeProperty('--puente-hoja-alto');
  } else {
    root.style.setProperty('--puente-hoja-alto', vh + 'vh');
    if (area) root.style.setProperty('--puente-cuadro-alto', area.offsetHeight + 'px');
    root.classList.add('puente-hoja-abierta');
  }
  // Si se estaba leyendo lo ultimo, sigue viendose (el chat se achico o se agrando por abajo)
  if (abajo) requestAnimationFrame(() => { sc.scrollTop = sc.scrollHeight; });
}
// Arrastrar una hoja (emojis o GIFs) tiene que ser fluido: cambiar su alto en cada movimiento del dedo
// vuelve a acomodar los miles de emojis y todo el chat (el cuadro de escribir sube con la hoja), y se
// traba. Mientras se arrastra, la hoja queda del alto maximo y se corre hacia abajo, y el cuadro de
// escribir la acompaña. Se corren con una animacion en pausa que el dedo adelanta o atrasa: no se toca
// el atributo style en cada movimiento (los estilos de Haven miran ese atributo y cada cambio cuesta).
// Al soltar, el alto de verdad, una sola vez.
const puenteArrastre = {
  inicio(p, variable, vh, max) {
    if (p._puenteArrastre) return;
    const area = document.documentElement.classList.contains('puente-hoja-abierta') ? document.getElementById('message-input-area') : null;
    p.style.transition = 'none';
    p.style.setProperty(variable, max + 'vh');
    // translate (no transform: la hoja de GIFs tiene transform fijo en el tema). 1 ms = 0,1vh
    const hoja = p.animate([{ translate: '0 0' }, { translate: '0 ' + max + 'vh' }], { duration: max * 10, fill: 'both' });
    hoja.pause();
    const cuadro = area ? area.animate([{ translate: '0 -100vh' }, { translate: '0 100vh' }], { duration: 2000, fill: 'both' }) : null;
    if (cuadro) cuadro.pause();
    p._puenteArrastre = { max, h0: vh, hoja, cuadro };
    this.mover(p, vh);
  },
  mover(p, vh) {
    const a = p._puenteArrastre;
    if (!a) return;
    a.hoja.currentTime = (a.max - vh) * 10;
    if (a.cuadro) a.cuadro.currentTime = (a.h0 - vh + 100) * 10;
  },
  // Despues de esto, el que llama pone el alto final (setHeight); la animacion de alto vuelve despues
  fin(p) {
    const a = p._puenteArrastre;
    if (!a) return;
    p._puenteArrastre = null;
    a.hoja.cancel();
    if (a.cuadro) a.cuadro.cancel();
    requestAnimationFrame(() => requestAnimationFrame(() => { if (!p._puenteArrastre) p.style.transition = ''; }));
  },
};
// Tocar el cuadro de escribir con una hoja abierta: se cierra y aparece el teclado, como en Discord
document.addEventListener('pointerdown', (ev) => {
  if (!document.documentElement.classList.contains('puente-hoja-abierta')) return;
  if (!(ev.target instanceof Element) || !ev.target.closest('#message-input')) return;
  const app = window.app;
  const e = document.getElementById('emoji-picker'), g = document.getElementById('gif-picker');
  if (e && e.style.display === 'flex' && app && typeof app._toggleEmojiPicker === 'function') app._toggleEmojiPicker();
  if (g && g.style.display && g.style.display !== 'none') { if (app && typeof app._closeGifPicker === 'function') app._closeGifPicker(); else g.style.display = 'none'; }
}, true);

(function () {
  'use strict';
  if (!matchMedia('(pointer: coarse)').matches) return;
  const MIN_VH = 30, MAX_VH = 92, DEFAULT_VH = 50;
  let height = DEFAULT_VH; // como en Discord, siempre abre a media pantalla
  let frequent = null, frequentAt = 0;

  const picker = () => document.getElementById('emoji-picker');
  const isOpen = (p) => p && p.style.display === 'flex';
  const setHeight = (p, vh) => {
    p.style.setProperty('--puente-emojis-alto', vh + 'vh');
    if (document.documentElement.classList.contains('puente-hoja-abierta')) document.documentElement.style.setProperty('--puente-hoja-alto', vh + 'vh'); // el cuadro sigue a la manija
  };
  const token = () => { try { return localStorage.getItem('haven_token'); } catch { return null; } };

  function loadFrequent() {
    if (frequent && Date.now() - frequentAt < 10 * 60 * 1000) return;
    const tk = token();
    if (!tk) return;
    frequentAt = Date.now();
    fetch('/puente/api/reacciones-frecuentes?n=27', { headers: { Authorization: 'Bearer ' + tk } })
      .then(r => (r.ok ? r.json() : null)).then(d => { if (d && Array.isArray(d.emojis)) frequent = d.emojis; }).catch(() => {});
  }

  function closeBackdrop() { document.getElementById('puente-emoji-backdrop')?.remove(); }
  function hideKeyboard(p) {
    const a = document.activeElement;
    if (a && (a.tagName === 'TEXTAREA' || a.tagName === 'INPUT') && !(p.contains(a) && a.classList.contains('emoji-search-input') && a.value)) a.blur();
  }

  // Escribir un emoji donde estaba el cursor (como los botones de Haven), sin abrir el teclado
  function insert(app, value) {
    const input = app._activeEditTextarea || document.getElementById('message-input');
    if (!input) return;
    const start = input.selectionStart ?? input.value.length, end = input.selectionEnd ?? start;
    input.value = input.value.substring(0, start) + value + input.value.substring(end);
    input.selectionStart = input.selectionEnd = start + value.length;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function addFrequent(app, p) {
    const grid = p.querySelector('.emoji-grid');
    if (!grid || !frequent || !frequent.length || grid.querySelector('.puente-emoji-frequent')) return;
    const sec = document.createElement('div');
    sec.className = 'emoji-cat puente-emoji-frequent';
    const head = document.createElement('div');
    head.className = 'emoji-cat-header';
    head.textContent = 'Usados frecuentemente';
    const cg = document.createElement('div');
    cg.className = 'emoji-cat-grid';
    for (const f of frequent) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'emoji-item';
      b.title = f.emoji;
      const value = f.url ? f.emoji : (typeof app._toneEmoji === 'function' ? app._toneEmoji(f.emoji) : f.emoji);
      if (f.url) { const img = document.createElement('img'); img.src = f.url; img.alt = f.emoji; img.className = 'custom-emoji'; b.appendChild(img); }
      else b.textContent = value;
      b.addEventListener('click', (e) => { e.stopPropagation(); insert(app, value); });
      cg.appendChild(b);
    }
    sec.append(head, cg);
    grid.insertBefore(sec, grid.firstChild);
    grid.scrollTop = 0;
    const tabs = p.querySelector('.emoji-tab-row');
    if (tabs && !tabs.querySelector('.puente-emoji-tab-frequent')) {
      const t = document.createElement('button');
      t.type = 'button';
      t.className = 'emoji-tab puente-emoji-tab-frequent';
      t.title = 'Usados frecuentemente';
      t.textContent = '🕒';
      t.addEventListener('click', (e) => { e.stopPropagation(); grid.scrollTo({ top: 0, behavior: 'smooth' }); });
      tabs.insertBefore(t, tabs.firstChild);
    }
  }

  // Arrastrar para cambiar el alto: con la manija siempre; con la lista, hacia
  // arriba mientras no este a pantalla completa, y hacia abajo si esta arriba de todo;
  // con la parte de arriba (pestañas, buscador), cuando el dedo va para arriba o para
  // abajo (no de costado, que es para desplazar las pestañas).
  function dragResize(app, p, el, fromList) {
    let y0 = null, x0 = 0, h0 = height, active = false;
    const zone = fromList === 'zona';
    el.addEventListener('touchstart', (e) => { y0 = e.touches[0].clientY; x0 = e.touches[0].clientX; h0 = height; active = !fromList; if (!fromList) p.style.transition = 'none'; }, { passive: true });
    el.addEventListener('touchmove', (e) => {
      if (y0 === null) return;
      const dy = y0 - e.touches[0].clientY; // > 0 hacia arriba
      if (zone && !active) {
        if (Math.abs(dy) < 8) return;
        if (Math.abs(e.touches[0].clientX - x0) > Math.abs(dy)) { y0 = null; return; } // de costado: no es para la hoja
        active = true; y0 = e.touches[0].clientY; h0 = height; p.style.transition = 'none';
      } else if (fromList && !active) {
        const grid = el;
        if ((dy > 6 && height < MAX_VH - 0.5) || (dy < -6 && grid.scrollTop <= 0)) { active = true; y0 = e.touches[0].clientY; h0 = height; p.style.transition = 'none'; }
        else return;
      }
      const vh = h0 + ((y0 - e.touches[0].clientY) / window.innerHeight) * 100;
      puenteArrastre.inicio(p, '--puente-emojis-alto', h0, MAX_VH);
      height = Math.max(10, Math.min(MAX_VH, vh));
      puenteArrastre.mover(p, height);
      if (e.cancelable) e.preventDefault();
    }, { passive: false });
    const soltar = () => {
      const was = active;
      y0 = null; active = false;
      if (!p._puenteArrastre) p.style.transition = '';
      puenteArrastre.fin(p);
      if (!was) return;
      if (height < MIN_VH - 5) { height = DEFAULT_VH; close(app); return; }
      height = Math.max(MIN_VH, height);
      setHeight(p, height);
    };
    el.addEventListener('touchend', soltar, { passive: true });
    el.addEventListener('touchcancel', soltar, { passive: true });
  }

  function decorate(app) {
    const p = picker();
    if (!isOpen(p)) { closeBackdrop(); return; }
    // A la capa de arriba: dentro del cuadro de escribir quedaba debajo del fondo oscuro
    if (p.parentElement !== document.body) {
      p._havenOrigParent = p.parentElement;
      document.body.appendChild(p);
    }
    p.classList.add('puente-emoji-sheet');
    if (document.documentElement.classList.contains('puente-hoja-cambio')) p.classList.add('puente-sin-subir'); // cambio de pestaña: aparece sin subir
    setHeight(p, height);
    puenteHojaAlto(height);
    if (!p.querySelector(':scope > .puente-sheet-handle')) {
      const h = document.createElement('div');
      h.className = 'puente-sheet-handle puente-emoji-handle';
      p.insertBefore(h, p.firstChild);
      dragResize(app, p, h, false);
      const grid = p.querySelector('.emoji-grid, .sticker-grid');
      if (grid) dragResize(app, p, grid, true);
      for (const top of p.querySelectorAll(':scope > .emoji-section-row, :scope > .emoji-search-row, :scope > .emoji-tab-row')) dragResize(app, p, top, 'zona');
    }
    addFrequent(app, p);
    addGifTab(app, p);
    if (!document.getElementById('puente-emoji-backdrop')) {
      const back = document.createElement('div');
      back.id = 'puente-emoji-backdrop';
      if (document.documentElement.classList.contains('puente-hoja-cambio')) back.classList.add('puente-sin-subir'); // cambio de pestaña: aparece sin subir
      back.addEventListener('click', () => setTimeout(() => close(app), 0));
      document.body.appendChild(back);
    }
    hideKeyboard(p);
  }

  function close(app) {
    const p = picker();
    if (isOpen(p) && typeof app._toggleEmojiPicker === 'function') app._toggleEmojiPicker();
    closeBackdrop();
  }

  // Como en la app de Discord, un solo boton (la carita) con tres pestañas:
  // Emoji, GIFs y Stickers. GIFs abre la ventanita de GIFs en el mismo lugar y
  // del mismo alto, sin la animacion de abrir (ver la hoja de GIFs, abajo).
  // Al editar un mensaje no va: un GIF sale como mensaje nuevo.
  function addGifTab(app, p) {
    const row = p.querySelector(':scope > .emoji-section-row');
    const edit = app._activeEditTextarea;
    if (!row || row.querySelector('.puente-tab-gifs') || !document.getElementById('gif-picker') || (edit && edit.isConnected)) return;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'emoji-section-tab puente-tab-gifs';
    b.textContent = 'GIFs';
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      const hojas = window.puenteHojas;
      if (!hojas || !hojas.abrirGifs) return;
      hojas.sinAnimacion();
      hojas.abrirGifs(app, height); // la de GIFs esconde esta
    });
    row.insertBefore(b, row.children[1] || null);
  }
  window.puenteHojas = Object.assign(window.puenteHojas || {}, {
    // Desde la hoja de GIFs: abrir esta en la seccion pedida ('emoji' o 'sticker') y del mismo alto
    abrirEmojis(app, vh, section) {
      const p = picker();
      if (!p || typeof app._toggleEmojiPicker !== 'function') return;
      height = vh;
      app._emojiPickerSection = section;
      if (isOpen(p)) p.style.display = 'none'; // asi se arma de nuevo en esa seccion
      app._toggleEmojiPicker();
    },
    // Las dos hojas se reemplazan una a otra sin bajar y volver a subir
    sinAnimacion() {
      const root = document.documentElement;
      root.classList.add('puente-hoja-cambio');
      clearTimeout(root._puenteHojaCambio);
      root._puenteHojaCambio = setTimeout(() => root.classList.remove('puente-hoja-cambio'), 600);
    },
  });

  let tries = 0;
  (function wait() {
    const app = window.app;
    const p = picker();
    if (!app || typeof app._toggleEmojiPicker !== 'function' || !p) { if (++tries < 120) setTimeout(wait, 500); return; }
    loadFrequent();
    const orig = app._toggleEmojiPicker;
    app._toggleEmojiPicker = function (...args) {
      loadFrequent();
      const r = orig.apply(this, args);
      try { decorate(this); } catch (err) { console.warn('[puente] selector de emojis:', err); }
      return r;
    };
    // Despues de tocar un emoji, Haven vuelve a enfocar el cuadro de escribir (y
    // aparece el teclado): mientras la hoja esta abierta, se vuelve a esconder.
    // Pasar de Emoji a Stickers: Haven la cierra y la vuelve a abrir; que no se note
    p.addEventListener('click', (e) => {
      if (e.target instanceof Element && e.target.closest('.emoji-section-tab') && window.puenteHojas) window.puenteHojas.sinAnimacion();
    }, true);
    p.addEventListener('click', (e) => {
      if (!(e.target instanceof Element) || !e.target.closest('.emoji-item')) return;
      setTimeout(() => { if (isOpen(p) && p.classList.contains('puente-emoji-sheet')) hideKeyboard(p); }, 0);
    });
    // Haven lo cierra solo (tocar afuera, enviar, cambiar de canal): sacar el fondo oscuro
    new MutationObserver(() => {
      const el = picker();
      if (!isOpen(el)) { closeBackdrop(); height = DEFAULT_VH; if (el) el.classList.remove('puente-sin-subir'); puenteHojaAlto(null); }
      else if (!el.querySelector(':scope > .puente-sheet-handle')) { try { decorate(app); } catch { /* se reintenta en el proximo cambio */ } }
    }).observe(p, { attributes: true, attributeFilter: ['style'], childList: true });
  })();
})();

// Pantallas tactiles: la ventanita de GIFs como hoja desde abajo, igual que la de
// los emojis: abre a media pantalla y con la manija (o la parte de arriba, o la
// lista estando arriba de todo) se agranda hasta casi toda la pantalla o se
// achica; muy abajo se cierra. Tocar afuera tambien la cierra. Es el mismo
// selector de GIFs de Haven; solo cambia donde y como se muestra.
(function () {
  'use strict';
  if (!matchMedia('(pointer: coarse)').matches) return;
  const MIN_VH = 30, MAX_VH = 92, DEFAULT_VH = 50;
  let height = DEFAULT_VH;
  const picker = () => document.getElementById('gif-picker');
  const isOpen = (p) => !!p && p.style.display !== 'none' && p.style.display !== '';
  const setHeight = (p, vh) => {
    p.style.setProperty('--puente-gifs-alto', vh + 'vh');
    if (document.documentElement.classList.contains('puente-hoja-abierta')) document.documentElement.style.setProperty('--puente-hoja-alto', vh + 'vh');
  };
  function closeBackdrop() { document.getElementById('puente-gif-backdrop')?.remove(); }
  function close(app) {
    const p = picker();
    if (isOpen(p)) { if (typeof app._closeGifPicker === 'function') app._closeGifPicker(); else p.style.display = 'none'; }
    closeBackdrop();
  }
  function drag(app, p, el, mode) { // mode: 'manija' | 'lista' | 'zona'
    let y0 = null, x0 = 0, h0 = height, active = false;
    el.addEventListener('touchstart', (e) => { y0 = e.touches[0].clientY; x0 = e.touches[0].clientX; h0 = height; active = mode === 'manija'; if (active) p.style.transition = 'none'; }, { passive: true });
    el.addEventListener('touchmove', (e) => {
      if (y0 === null) return;
      const dy = y0 - e.touches[0].clientY;
      if (!active) {
        if (mode === 'zona') {
          if (Math.abs(dy) < 8) return;
          if (Math.abs(e.touches[0].clientX - x0) > Math.abs(dy)) { y0 = null; return; }
        } else if (!((dy > 6 && height < MAX_VH - 0.5) || (dy < -6 && el.scrollTop <= 0))) return;
        active = true; y0 = e.touches[0].clientY; h0 = height; p.style.transition = 'none';
      }
      puenteArrastre.inicio(p, '--puente-gifs-alto', h0, MAX_VH);
      height = Math.max(10, Math.min(MAX_VH, h0 + ((y0 - e.touches[0].clientY) / window.innerHeight) * 100));
      puenteArrastre.mover(p, height);
      if (e.cancelable) e.preventDefault();
    }, { passive: false });
    const soltar = () => {
      const was = active; y0 = null; active = false;
      if (!p._puenteArrastre) p.style.transition = '';
      puenteArrastre.fin(p);
      if (!was) return;
      if (height < MIN_VH - 5) { height = DEFAULT_VH; close(app); return; }
      height = Math.max(MIN_VH, height);
      setHeight(p, height);
    };
    el.addEventListener('touchend', soltar, { passive: true });
    el.addEventListener('touchcancel', soltar, { passive: true });
  }
  function decorate(app) {
    const p = picker();
    if (!isOpen(p)) { closeBackdrop(); return; }
    if (p.parentElement !== document.body) document.body.appendChild(p);
    p.classList.add('puente-gif-sheet');
    if (document.documentElement.classList.contains('puente-hoja-cambio')) p.classList.add('puente-sin-subir'); // cambio de pestaña: aparece sin subir
    setHeight(p, height);
    puenteHojaAlto(height);
    if (!p.querySelector(':scope > .puente-gif-handle')) {
      const h = document.createElement('div');
      h.className = 'puente-sheet-handle puente-gif-handle';
      p.insertBefore(h, p.firstChild);
      drag(app, p, h, 'manija');
      const grid = p.querySelector('.gif-picker-grid');
      if (grid) drag(app, p, grid, 'lista');
      for (const top of p.querySelectorAll(':scope > .gif-picker-tabs, :scope > .gif-picker-header')) drag(app, p, top, 'zona');
    }
    // Las mismas pestañas que la hoja de emojis: Emoji, GIFs (esta) y Stickers
    if (!p.querySelector(':scope > .puente-hoja-secciones')) {
      const row = document.createElement('div');
      row.className = 'puente-hoja-secciones';
      for (const [key, label] of [['emoji', 'Emoji'], ['gifs', 'GIFs'], ['sticker', 'Stickers']]) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'puente-hoja-seccion' + (key === 'gifs' ? ' active' : '');
        b.textContent = label;
        if (key !== 'gifs') {
          b.addEventListener('click', (e) => {
            e.stopPropagation();
            const hojas = window.puenteHojas;
            if (!hojas || !hojas.abrirEmojis) return;
            hojas.sinAnimacion();
            hojas.abrirEmojis(app, height, key);
            close(app);
          });
        }
        row.appendChild(b);
      }
      p.querySelector(':scope > .puente-gif-handle').after(row);
      drag(app, p, row, 'zona');
    }
    // Como en Discord, el teclado no aparece solo al abrir (Haven pone el cursor en el buscador)
    const search = document.getElementById('gif-search-input');
    if (search && document.activeElement === search && !search.value) search.blur();
    if (!document.getElementById('puente-gif-backdrop')) {
      const back = document.createElement('div');
      back.id = 'puente-gif-backdrop';
      if (document.documentElement.classList.contains('puente-hoja-cambio')) back.classList.add('puente-sin-subir'); // cambio de pestaña: aparece sin subir
      back.addEventListener('click', () => setTimeout(() => close(app), 0));
      document.body.appendChild(back);
    }
  }
  window.puenteHojas = Object.assign(window.puenteHojas || {}, {
    // Desde la hoja de emojis (pestaña GIFs): abrir esta del mismo alto
    abrirGifs(app, vh) {
      const p = picker();
      if (!p || typeof app._toggleGifPicker !== 'function') return;
      height = vh;
      setHeight(p, height);
      if (!isOpen(p)) app._toggleGifPicker('main', document.getElementById('gif-btn'));
    },
  });
  let tries = 0;
  (function wait() {
    const app = window.app;
    const p = picker();
    // Antes de que arranque Haven, window.app es el <div id="app"> de la pagina
    if (!app || typeof app._toggleGifPicker !== 'function' || !p) { if (++tries < 120) setTimeout(wait, 500); return; }
    // Haven la abre y la cierra cambiando su display: se acomoda cada vez que se abre
    new MutationObserver(() => {
      const el = picker();
      if (!isOpen(el)) { closeBackdrop(); height = DEFAULT_VH; if (el) el.classList.remove('puente-sin-subir'); puenteHojaAlto(null); }
      else if (!el._puenteArrastre) { try { decorate(app); } catch (err) { console.warn('[puente] selector de GIFs:', err); } } // arrastrando: se corre sola (puenteArrastre)
    }).observe(p, { attributes: true, attributeFilter: ['style'] });
  })();
})();

// Pantallas tactiles: Enter del teclado del celular hace un salto de linea, como
// en la app de Discord; el mensaje se manda con el boton de enviar. Vale para el
// cuadro de escribir, los hilos, los mensajes directos y al editar un mensaje.
// Si esta abierta una lista de sugerencias (@, #, :, /) con una marcada, Enter la elige.
// (puente-enter-salto)
(function () {
  'use strict';
  if (!matchMedia('(pointer: coarse)').matches) return;
  const BOXES = '#message-input, #thread-input, #dm-pip-input, textarea.edit-textarea';
  const LISTS = ['mention-dropdown', 'channel-dropdown', 'emoji-dropdown', 'slash-dropdown', 'persona-dropdown', 'ferry-dropdown'];
  const listOpen = () => LISTS.some(id => { const d = document.getElementById(id); return d && d.style.display !== 'none' && d.getClientRects().length > 0 && !!d.querySelector('.active'); });
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.altKey || e.metaKey || e.isComposing) return;
    const t = e.target;
    if (!(t instanceof HTMLTextAreaElement) || !t.matches(BOXES)) return;
    if (listOpen()) return;
    // Que no lo vea Haven (que lo manda): el navegador escribe el salto de linea solo
    e.stopImmediatePropagation();
  }, true);
})();

// El buscador de GIFs decia siempre "Buscar en GIPHY..." (texto fijo de Haven),
// aunque los GIFs salgan de KLIPY. Ahora dice el mismo que la linea de abajo
// ("Powered by KLIPY"), que Haven actualiza con cada busqueda. (puente-gif-texto)
(function () {
  'use strict';
  const LABELS = { klipy: 'KLIPY', giphy: 'GIPHY', tenor: 'Tenor' };
  function setPlaceholder(text) {
    const input = document.getElementById('gif-search-input');
    if (!input) return;
    input.removeAttribute('data-i18n-placeholder'); // si no, Haven le vuelve a poner el texto fijo
    input.placeholder = text;
  }
  let tries = 0;
  (function wait() {
    const app = window.app;
    if (!app || typeof app._setGifFooter !== 'function' || !document.getElementById('gif-search-input')) { if (++tries < 120) setTimeout(wait, 500); return; }
    setPlaceholder('Buscar GIFs...');
    const orig = app._setGifFooter;
    app._setGifFooter = function (provider) {
      const r = orig.apply(this, arguments);
      try { if (LABELS[provider]) setPlaceholder('Buscar en ' + LABELS[provider] + '...'); } catch { /* queda el texto anterior */ }
      return r;
    };
  })();
})();

// Enlaces a mensajes, como en Discord (puente-enlaces-mensajes):
//  - "Copiar enlace del mensaje" en el menu del mensaje (PC y celular), en todos
//    los canales (el de Haven solo aparece en los publicos). Es el enlace de
//    Haven (/app?channel=...&message=...), mas &thread= si esta en un hilo.
//  - Tocar un enlace a un mensaje o canal, de CV Chat o de Discord, lo abre aca
//    mismo, en el mensaje (tambien dentro de un hilo), sin recargar. Nunca abre
//    Discord: si el mensaje no esta en CV Chat (o no lo podes ver), lo avisa.
//  - Esos enlaces se ven como "#canal › mensaje", como en Discord.
//  - Al entrar con un enlace de un mensaje de un hilo, se abre el hilo.
//  Al pasar a Discord, el puente cambia los enlaces de CV Chat por los de alla.
(function () {
  'use strict';
  const DISCORD = /^https?:\/\/(?:(?:ptb|canary)\.)?discord(?:app)?\.com\/channels\/(\d+|@me)\/(\d+)(?:\/(\d+))?\/?$/i;
  const cache = new Map();
  const token = () => { try { return localStorage.getItem('haven_token'); } catch { return null; } };

  // Que enlace es: { key, q } para preguntarle al servidor, o null
  function parse(href) {
    let u;
    try { u = new URL(href, location.href); } catch { return null; }
    const d = DISCORD.exec(u.origin + u.pathname);
    if (d) return d[3] ? { key: 'd' + d[3], q: 'discord=' + d[3] + '&canal=' + d[2], discord: true } : { key: 'c' + d[2], q: 'canal=' + d[2], discord: true };
    if (u.origin === location.origin && /^\/app(?:\.html)?$/.test(u.pathname)) {
      const m = u.searchParams.get('message'), c = u.searchParams.get('channel');
      if (m && /^\d+$/.test(m)) return { key: 'm' + m, q: 'id=' + m };
      if (c && /^[a-f0-9]{8}$/i.test(c)) return { key: 'k' + c, q: 'codigo=' + c };
    }
    return null;
  }

  // A donde lleva: { data } si esta, { missing: true } si no esta (o no lo podes
  // ver), { failed: true } si el servidor no contesto. Solo se recuerdan las dos
  // primeras: un fallo (por ejemplo, mientras se reinicia el servidor) se vuelve a
  // intentar la proxima vez.
  function resolve(p) {
    if (cache.has(p.key)) return cache.get(p.key);
    const tk = token();
    if (!tk) return Promise.resolve({ failed: true });
    const pr = fetch('/puente/api/mensaje?' + p.q, { headers: { Authorization: 'Bearer ' + tk } })
      .then(r => (r.ok ? r.json().then(data => ({ data })) : r.status === 404 ? { missing: true } : { failed: true }))
      .catch(() => ({ failed: true }))
      .then(res => { if (res.failed) cache.delete(p.key); return res; });
    cache.set(p.key, pr);
    return pr;
  }

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  function flash(el) {
    el.scrollIntoView({ block: 'center' });
    el.classList.add('highlight-flash');
    setTimeout(() => el.classList.remove('highlight-flash'), 2000);
  }

  // Cambiar de canal y esperar a que Haven dibuje sus mensajes. Antes se esperaba un tiempo fijo:
  // si el canal tardaba mas en llegar (en el celular, seguido), se dibujaba despues del salto y
  // dejaba todo abajo de todo, lejos del mensaje
  function switchAndWait(app, code) {
    return new Promise((done) => {
      const s = app.socket;
      let over = false, timer = null;
      const finish = () => { if (over) return; over = true; clearTimeout(timer); if (s) s.off('message-history', onHistory); setTimeout(done, 150); };
      const onHistory = (d) => { if (d && d.channelCode === code && !d.around) finish(); };
      if (s) s.on('message-history', onHistory);
      timer = setTimeout(finish, 8000);
      app.switchChannel(code);
    });
  }
  // Saltar al mensaje y fijarse que haya quedado a la vista: si no estaba dibujado, Haven trae los de
  // alrededor y lo marca; si algo lo volvio a mandar abajo, se lo vuelve a buscar
  async function jump(app, id) {
    app._jumpToMessage(id);
    let el = null;
    for (let i = 0; i < 40 && !el; i++) { await sleep(150); el = document.querySelector('#messages [data-msg-id="' + id + '"]'); }
    if (!el) return;
    await sleep(500);
    el = document.querySelector('#messages [data-msg-id="' + id + '"]');
    const box = document.getElementById('messages');
    if (!el || !box) return;
    const a = el.getBoundingClientRect(), b = box.getBoundingClientRect();
    if (a.bottom > b.top + 20 && a.top < b.bottom - 20) return;
    app._coupledToBottom = false;
    flash(el);
  }

  // Ir al canal y al mensaje (o al hilo y a su mensaje)
  async function open(app, r) {
    if (!r || !r.codigo) return;
    // En el celular, el panel de los canales tapa el chat (al tocar una notificacion o un enlace desde ahi)
    try { if (document.getElementById('app-body')?.classList.contains('mobile-sidebar-open')) app._closeMobilePanels?.(); } catch { /* sigue */ }
    if (app.currentChannel !== r.codigo) await switchAndWait(app, r.codigo);
    if (r.hilo) {
      app._jumpToMessage(r.hilo);
      if (typeof app._openThread === 'function') app._openThread(r.hilo);
      for (let i = 0; i < 40; i++) {
        const el = document.querySelector('#thread-panel [data-msg-id="' + r.mensaje + '"]');
        if (el) { flash(el); return; }
        await sleep(100);
      }
    } else if (r.mensaje) await jump(app, r.mensaje);
  }

  function messageLink(app, msgEl) {
    const id = msgEl && msgEl.dataset.msgId;
    if (!id || !app.currentChannel) return null;
    const inThread = msgEl.closest('#thread-panel');
    const root = inThread && app._activeThreadParent && String(app._activeThreadParent) !== String(id) ? app._activeThreadParent : null;
    return location.origin + '/app?channel=' + app.currentChannel + '&message=' + id + (root ? '&thread=' + root : '');
  }
  function copyLink(app, msgEl) {
    const url = messageLink(app, msgEl);
    if (!url) return;
    const done = () => { if (app._showToast) app._showToast('Enlace del mensaje copiado', 'success'); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, () => { if (app._copyTextFallback) app._copyTextFallback(url, done); });
    else if (app._copyTextFallback) app._copyTextFallback(url, done);
  }
  // abrir(url): ir a un mensaje de la app sin recargar (lo usa la ventana de "Tu historia")
  // Si el mensaje ya no esta (lo borraron), se abre el canal igual y se avisa
  function openUrl(href) {
    const p = parse(href); if (!p) return false;
    resolve(p).then(res => {
      const app = window.app;
      if (!app) return;
      if (res.data) { open(app, res.data); return; }
      let code = null;
      try { code = new URL(href, location.href).searchParams.get('channel'); } catch { /* sin canal */ }
      const known = code && (app.channels || []).some(c => c && c.code === code);
      if (known) open(app, { codigo: code });
      if (app._showToast) app._showToast(res.failed ? 'No se pudo abrir el mensaje. Probá de nuevo en un momento.' : 'Ese mensaje ya no está: lo borraron' + (known ? '' : ', o no tenés acceso a ese canal'), 'error');
    });
    return true;
  }
  window.puenteEnlaces = { copiar: copyLink, abrir: openUrl };

  // El enlace pasa a ser el de CV Chat (asi tampoco lleva a Discord al abrirlo en
  // otra pestaña) y, si se veia la direccion tal cual, dice "#canal › mensaje"
  // En Discord un enlace entre < > se muestra sin vista previa; Haven dejaba los
  // signos a la vista ("<https://...>"): se sacan, como se ve en Discord
  function unbracket(a) {
    if (a.dataset.puenteSinSignos) return;
    a.dataset.puenteSinSignos = '1';
    const prev = a.previousSibling, next = a.nextSibling;
    if (!prev || prev.nodeType !== 3 || !prev.nodeValue.endsWith('<')) return;
    const raw = a.getAttribute('href') || '';
    if (/(>|%3E)$/i.test(raw)) {
      a.setAttribute('href', raw.replace(/(>|%3E)$/i, ''));
      if (/(>|%3E)$/i.test(a.textContent)) a.textContent = a.textContent.replace(/(>|%3E)$/i, '');
    } else if (next && next.nodeType === 3 && next.nodeValue.startsWith('>')) next.nodeValue = next.nodeValue.slice(1);
    // (Haven a veces ya se comio el ">" del final y deja solo el "<")
    else if (next && !(next.nodeType === 3 && /^\s/.test(next.nodeValue)) && next.nodeName !== 'BR') return;
    prev.nodeValue = prev.nodeValue.slice(0, -1);
  }

  // Debajo del mensaje, un pedacito del canal (o de alrededor del mensaje), como la vista previa de
  // cualquier enlace: uno por mensaje, solo en el chat y en los hilos. Tocarlo lleva ahi
  const vistas = new Map();
  function vista(a, p, r) {
    const cont = a.closest('.message-content, .thread-msg-content');
    if (!cont || !cont.closest('#messages, #thread-panel, #puente-guia') || cont.dataset.puenteVista) return;
    cont.dataset.puenteVista = '1';
    const tk = token();
    if (!tk) return;
    if (!vistas.has(p.key)) {
      vistas.set(p.key, fetch('/puente/api/mensaje?' + p.q + '&vista=1', { headers: { Authorization: 'Bearer ' + tk } })
        .then(x => (x.ok ? x.json() : null)).catch(() => null)
        .then(d => { if (!d) vistas.delete(p.key); return d; }));
    }
    vistas.get(p.key).then(d => {
      if (!d || !d.vista || !d.vista.length || !cont.isConnected || (cont.nextElementSibling && cont.nextElementSibling.classList.contains('puente-vista-chat'))) return;
      const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
      const box = el('div', 'puente-vista-chat');
      box.setAttribute('role', 'link'); box.tabIndex = 0; box.title = 'Abrir en CV Chat';
      box.append(el('div', 'puente-vista-cab', '#' + r.canal));
      // El enlace a un mensaje muestra solo ese mensaje, entero (el de un canal, sus ultimos mensajes)
      const solo = d.vista.some(m => m.marcado);
      if (solo) box.classList.add('puente-vista-solo');
      // Los emojis del club (:cv1:) como en el chat
      const conEmojis = (t) => {
        const e = el('div', 'puente-vista-texto'), lista = (window.app && Array.isArray(window.app.customEmojis)) ? window.app.customEmojis : [];
        const re = /<a?:([a-zA-Z0-9_-]+):[0-9]+>|:([a-zA-Z0-9_-]+):/g;
        let k = 0, x;
        while ((x = re.exec(t))) {
          const ce = lista.find(c => c.name === (x[1] || x[2]));
          if (!ce) continue;
          if (x.index > k) e.append(document.createTextNode(t.slice(k, x.index)));
          const i = el('img', 'custom-emoji puente-vista-emoji'); i.src = ce.url; i.alt = ':' + ce.name + ':'; i.title = i.alt; e.append(i);
          k = x.index + x[0].length;
        }
        if (k < t.length) e.append(document.createTextNode(t.slice(k)));
        return e;
      };
      for (const m of (solo ? d.vista.filter(m => m.marcado) : d.vista)) {
        const fila = el('div', 'puente-vista-fila' + (m.marcado ? ' marcado' : ''));
        if (m.foto) { const i = el('img', 'puente-vista-foto'); i.src = m.foto; i.alt = ''; i.loading = 'lazy'; fila.append(i); }
        else fila.append(el('span', 'puente-vista-foto', (m.autor || '?').trim().charAt(0).toUpperCase()));
        const der = el('div', 'puente-vista-der');
        const cab = el('div', 'puente-vista-quien');
        cab.append(el('b', '', m.autor), el('span', '', ' ' + (m.hora || '')));
        der.append(cab);
        if (m.texto) der.append(conEmojis(m.texto));
        if (m.imagen) { const i = el('img', 'puente-vista-imagen'); i.src = m.imagen; i.alt = ''; i.loading = 'lazy'; der.append(i); }
        // Un video: su primer cuadro con el ▶ (tocarlo lleva al mensaje, donde se mira)
        else if (m.video && /^https?:\/\//.test(m.video)) {
          const w = el('div', 'puente-vista-video');
          w.style.cssText = 'position:relative;display:inline-block;max-width:100%;margin-top:.25rem;border-radius:.25rem;overflow:hidden;background:#000;line-height:0';
          const v = document.createElement('video');
          v.src = m.video + '#t=0.1'; v.preload = 'metadata'; v.muted = true; v.playsInline = true;
          v.style.cssText = 'display:block;max-width:100%;max-height:12rem;pointer-events:none';
          const p = el('span', '', '▶');
          p.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:2.5rem;height:2.5rem;border-radius:50%;background:rgba(0,0,0,.6);color:#fff;font-size:1.1rem;line-height:2.5rem;text-align:center;padding-left:.15rem;box-sizing:border-box';
          w.append(v, p); der.append(w);
        }
        fila.append(der);
        box.append(fila);
      }
      const ir = (e) => { e.preventDefault(); e.stopPropagation(); if (window.app) open(window.app, r); };
      box.addEventListener('click', ir);
      box.addEventListener('keydown', (e) => { if (e.key === 'Enter') ir(e); });
      cont.after(box);
      if (solo) sinCita(cont);
    });
  }

  // "Un día como hoy" (logros.js) trae el mensaje citado para Discord; en CV Chat ya se ve en la vista previa
  // de abajo, asi que la cita (quien lo dijo y el texto) no se muestra: queda el titulo y las reacciones
  function sinCita(cont) {
    const t = cont.textContent || '';
    if (!t.trim().startsWith('📅') || !t.includes('Un día como hoy') || !t.includes('⭐')) return;
    const cita = cont.querySelector('blockquote.chat-blockquote');
    if (!cita) return;
    const nodos = [...cont.childNodes];
    const iCita = nodos.indexOf(cita);
    const iFin = nodos.findIndex(n => n.nodeType === 3 && n.nodeValue.includes('⭐'));
    const iBr = nodos.findIndex(n => n.nodeName === 'BR');
    if (iCita < 0 || iFin < iCita || iBr < 0 || iBr > iCita) return;
    // lo que hay entre el titulo y las reacciones: si no es solo la cita, su autor y renglones vacios
    // (por ejemplo, enlaces a imagenes), se deja
    const medio = nodos.slice(iBr + 1, iFin);
    const vacio = (n) => n.nodeName === 'BR' || (n.nodeType === 3 && !n.nodeValue.trim());
    const autor = nodos.slice(iBr + 1, iCita).filter(n => !vacio(n));
    const soloCita = medio.every(n => vacio(n) || n === cita || autor.includes(n)) && autor.length <= 1;
    const quien = autor.length === 1 && autor[0].nodeName === 'STRONG' ? autor : [];
    // (si hay mas cosas, por ejemplo enlaces a imagenes: sale la cita con su autor y los renglones vacios hasta lo que sigue)
    const kSig = nodos.findIndex((n, k) => k > iCita && !vacio(n));
    const otra = quien.length || iCita === iBr + 1 ? nodos.slice(iBr + 1, kSig) : [cita];
    for (const n of soloCita ? medio : otra) {
      if (n.nodeType === 1) n.style.display = 'none';
      else if (n.nodeType === 3) n.nodeValue = '';
    }
  }

  function label(a) {
    unbracket(a);
    if (a.dataset.puenteEnlace) return;
    const p = parse(a.href);
    if (!p) return;
    const text = a.textContent.trim();
    const showsUrl = !!text && (text === a.href || text === a.getAttribute('href') || /^https?:\/\//.test(text));
    a.dataset.puenteEnlace = '1';
    resolve(p).then(res => {
      const r = res.data;
      if (!r || !a.isConnected) { if (res.failed) delete a.dataset.puenteEnlace; return; }
      if (p.discord) {
        a.dataset.discord = a.href;
        a.href = location.origin + '/app?channel=' + r.codigo + (r.mensaje ? '&message=' + r.mensaje : '') + (r.hilo ? '&thread=' + r.hilo : '');
      }
      if (r.canal) vista(a, p, r);
      if (!showsUrl) return;
      a.title = 'Abrir en CV Chat';
      a.classList.add('puente-enlace-msj');
      a.textContent = (r.canal ? '#' + r.canal : 'Mensaje directo') + (r.mensaje ? ' › mensaje' : '');
    });
  }

  let tries = 0;
  (function wait() {
    const app = window.app;
    const box = document.getElementById('messages');
    if (!app || typeof app._jumpToMessage !== 'function' || typeof app.switchChannel !== 'function' || !box) { if (++tries < 120) setTimeout(wait, 500); return; }

    // Clic en un enlace a un mensaje: abrirlo aca mismo
    document.addEventListener('click', (e) => {
      if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
      const a = e.target instanceof Element && e.target.closest('a[href]');
      if (!a || !a.closest('#messages, #thread-panel, #search-panel, #pinned-panel, .puente-sr, .message-content')) return;
      const p = parse(a.href);
      if (!p) return;
      e.preventDefault();
      e.stopPropagation();
      resolve(p).then(res => {
        if (res.data) { open(app, res.data); return; }
        if (!app._showToast) return;
        if (res.failed) app._showToast('No se pudo abrir el enlace. Probá de nuevo en un momento.', 'error');
        else app._showToast(p.discord ? 'Ese mensaje no está en CV Chat, o no tenés acceso a ese canal' : 'Ese mensaje no existe, o no tenés acceso a ese canal', 'error');
      });
    }, true);

    // Las etiquetas "#canal › mensaje", en lo que se va mostrando
    const scan = (root) => { for (const a of root.querySelectorAll('.message-content a[href], .thread-msg-content a[href], a.chat-link[href]')) label(a); };
    scan(document);
    new MutationObserver(muts => {
      for (const m of muts) for (const n of m.addedNodes) if (n.nodeType === 1) { if (n.matches && n.matches('a[href]')) label(n); else scan(n); }
    }).observe(document.body, { childList: true, subtree: true });

    // Entrar con el enlace de un mensaje de un hilo: Haven abre el canal; aca, el hilo
    const sp = new URLSearchParams(location.search);
    const th = sp.get('thread'), msg = sp.get('message');
    if (th && msg && /^\d+$/.test(th) && /^\d+$/.test(msg)) {
      resolve({ key: 'm' + msg, q: 'id=' + msg }).then(async res => {
        const r = res.data;
        if (!r) return;
        for (let i = 0; i < 60 && app.currentChannel !== r.codigo; i++) await sleep(250); // que Haven cambie de canal
        await sleep(700);
        open(app, r);
      });
    }
  })();
})();

// Nombre para mostrar como en Discord (puente-nombre-libre): de 1 a 32
// caracteres, cualquiera (emojis, puntos, simbolos). El servidor ya los acepta
// (tools/puente/cargar.js); aca, el formulario de "Editar perfil", que los
// rechazaba antes de mandarlos (solo letras, numeros, espacios y "_", hasta 20).
(function () {
  'use strict';
  const MAX = 32;
  const check = (raw) => {
    const value = String(raw || '').normalize('NFC').replace(/\p{Cc}/gu, '').trim();
    const n = [...value].length;
    return n >= 1 && n <= MAX ? { value } : { error: 'El nombre tiene que tener entre 1 y 32 caracteres' };
  };
  function fixForm() {
    const input = document.getElementById('rename-input');
    if (input) input.maxLength = MAX;
    const desc = document.querySelector('[data-i18n="modals.edit_profile.display_name_desc"]');
    if (desc) desc.textContent = 'Cualquier nombre de hasta 32 caracteres.';
  }
  let tries = 0;
  (function wait() {
    const app = window.app;
    if (!app || typeof app._saveRename !== 'function' || !document.getElementById('rename-input')) { if (++tries < 120) setTimeout(wait, 500); return; }
    fixForm();
    document.addEventListener('focusin', (e) => { if (e.target && e.target.id === 'rename-input') fixForm(); });
    const orig = app._saveRename;
    app._saveRename = function (...args) {
      const input = document.getElementById('rename-input');
      const raw = input ? input.value : '';
      const c = check(raw);
      if (c.error) { if (this._showToast) this._showToast(c.error, 'error'); return; }
      if (c.value !== (this.user.displayName || this.user.username)) this.socket.emit('rename-user', { username: c.value });
      // El resto del perfil (biografia, cumpleaños, avatar, grupos) lo guarda Haven
      // como siempre. Su control del nombre (el de antes) se saltea: en su lugar va
      // un nombre que lo pasa, y el aviso de cambio de nombre no sale de nuevo.
      const sock = this.socket, emit = sock.emit;
      sock.emit = function (ev, ...a) { return ev === 'rename-user' ? sock : emit.call(sock, ev, ...a); };
      if (input) input.value = 'ok';
      try { return orig.apply(this, args); } finally { sock.emit = emit; if (input) input.value = raw; }
    };
  })();
})();

// Sin el cartel de Haven sobre los "Codigos de recuperacion de cuenta": sale al
// entrar a quien nunca los genero, habla de "claves de cifrado E2E" y tapa la
// bienvenida. Aca se recupera la cuenta por email o con Discord; los codigos
// siguen en Configuracion para quien los quiera.
(function () {
  'use strict';
  let tries = 0;
  (function wait() {
    const app = window.app;
    if (!app || typeof app._showRecoveryNotice !== 'function') { if (++tries < 120) setTimeout(wait, 500); return; }
    app._recoveryNoticeShown = true;
    app._showRecoveryNotice = function () {};
  })();
})();

// Imagenes livianas en el chat, como Discord (puente-imagenes-livianas): las
// fotos subidas se ven en una version reducida (tools/puente/miniaturas.js) y al
// abrirlas, descargarlas o copiar su enlace se usa la original. Como pesan
// mucho menos, se cargan mas a la vez.
(function () {
  'use strict';
  const UP = /^\/uploads\/((?!deleted-attachments\/|stickers\/)(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+\.(?:png|jpe?g|webp))$/i;
  const MINI = /\/puente\/mini\/\d+\/([^?#]+)/;
  function toMini(v) {
    if (!v || v.startsWith('data:')) return null;
    let u;
    try { u = new URL(v, location.href); } catch { return null; }
    if (u.origin !== location.origin || u.search) return null;
    const m = UP.exec(u.pathname);
    return m ? '/puente/mini/960/' + m[1] : null;
  }
  function toOriginal(v) {
    const m = typeof v === 'string' && MINI.exec(v);
    return m ? location.origin + '/uploads/' + m[1] : v;
  }
  function swap(img) {
    if (img.dataset.puenteMiniFallo) return;
    const attr = img.hasAttribute('data-lazy-src') ? 'data-lazy-src' : 'src';
    const mini = toMini(img.getAttribute(attr));
    if (!mini) return;
    img.setAttribute(attr, mini);
    if (!img.dataset.puenteMini) {
      img.dataset.puenteMini = '1';
      // Si la reducida no carga: la original, y no se vuelve a cambiar
      img.addEventListener('error', () => {
        const s = img.getAttribute('src') || '';
        if (!s.includes('/puente/mini/')) return;
        img.dataset.puenteMiniFallo = '1';
        img.setAttribute('src', toOriginal(s));
      });
    }
  }
  const scan = (root) => { if (root.matches && root.matches('img.chat-image')) swap(root); if (root.querySelectorAll) root.querySelectorAll('img.chat-image').forEach(swap); };
  scan(document);
  new MutationObserver(muts => {
    for (const m of muts) {
      if (m.type === 'attributes') { if (m.target.matches('img.chat-image')) swap(m.target); }
      else for (const n of m.addedNodes) if (n.nodeType === 1) scan(n);
    }
  }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'data-lazy-src'] });

  let tries = 0;
  (function wait() {
    const app = window.app;
    if (!app || typeof app._lazyRealSrc !== 'function') { if (++tries < 120) setTimeout(wait, 500); return; }
    // Abrir, descargar y copiar: la original
    const real = app._lazyRealSrc;
    app._lazyRealSrc = function (img) { return toOriginal(real.call(this, img)); };
    (function more(n) {
      if (app._lazyMedia) { app._lazyMedia.MAX_PARALLEL = 6; return; }
      if (n < 60) setTimeout(() => more(n + 1), 500);
    })(0);
  })();
})();

// Vistas previas de enlaces como en Discord, y al instante (puente-embeds): el
// embed que armo Discord para cada enlace lo guarda el puente
// (tools/puente/embeds.js) y aca se dibuja igual que en Discord: franja de color,
// sitio, autor con su foto, titulo, texto, imagen o video, y el pie con logo y
// fecha. Donde no hay embed de Discord (mensajes directos, canales que no se
// sincronizan) queda la vista previa de Haven.
(function () {
  'use strict';
  const known = new Map(); // id del mensaje -> [embeds]  (sin entrada: lo maneja Haven)
  const asked = new Set();
  const sinDiscord = new Set(); // mensajes que no estan en Discord: la vista previa de Haven, sin esperar
  // Lo que viene con el historial (embeds.js), antes de que Haven lo dibuje (lo pone la parte de las previas)
  // (para la tarjeta de los enlaces a juegos: un mensaje con la lista vacia es uno al que le quitaron la vista previa)
  window.puenteVistaQuitada = (id) => { const l = known.get(String(id)); return Array.isArray(l) && l.length === 0; };
  window.puenteEmbedsDatos = (embeds, sin) => {
    if (embeds && typeof embeds === 'object') for (const [id, list] of Object.entries(embeds)) if (Array.isArray(list)) known.set(String(id), list);
    if (Array.isArray(sin)) for (const id of sin) { sinDiscord.add(String(id)); if (sinDiscord.size > 5000) sinDiscord.clear(); }
  };
  const token = () => { try { return localStorage.getItem('haven_token'); } catch { return null; } };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const okUrl = u => (typeof u === 'string' && /^https?:\/\//i.test(u) ? u : null);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

  // Enlaces que tendrian vista previa (como decide Haven)
  function previewLinks(msgEl) {
    return [...msgEl.querySelectorAll('.message-content a[href], .thread-msg-content a[href]')].filter(a => {
      if (a.closest('.puente-embeds')) return false; // los de adentro de la tarjeta
      const u = a.href;
      if (!/^https?:/i.test(u) || u.startsWith(location.origin)) return false;
      if (/\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i.test(u)) return false;
      if (/^https:\/\/(media\d*\.giphy\.com|media\.tenor\.com|c\.tenor\.com)\//i.test(u)) return false;
      if (/^https?:\/\/(?:(?:ptb|canary)\.)?discord(?:app)?\.com\/channels\//i.test(u)) return false; // enlace a un mensaje
      if (a.dataset.embedDeferred === 'foro') return false; // un tema del foro: su conversacion (abajo)
      return true;
    });
  }

  // Un enlace a un tema o una respuesta del foro: en lugar de la vista previa (la de Discord repetia el
  // texto, escrito y en la imagen), el tema con su conversacion, como el pedacito de un canal: el primer
  // mensaje y las ultimas respuestas (foro-lector.js). Uno por mensaje, en el chat y en los hilos. Si no
  // se puede (un tema que no es publico, el foro que no contesta), queda la vista previa de siempre
  const FORO_TEMA = /^https?:\/\/foro\.[^/]+\/(?:node\/\d+|forum\/.+\/\d+-[^/?#]*)\/?(?:[?#].*)?$/i;
  const sinHash = u => String(u || '').split('#')[0].replace(/\/+$/, '');
  const foroDatos = new Map(); // enlace -> promesa con la conversacion (null si no hay)
  function foroEnlace(msgEl) {
    if (msgEl.dataset.foroSin === '1' || !msgEl.closest('#messages, #thread-panel')) return null;
    return [...msgEl.querySelectorAll('.message-content a[href], .thread-msg-content a[href]')].find(a => !a.closest('.puente-embeds, .puente-vista-chat') && FORO_TEMA.test(a.href)) || null;
  }
  const deForo = (msgEl, e) => !!(msgEl.dataset.foroUrl && e && e.url && sinHash(e.url) === msgEl.dataset.foroUrl);
  const cuando = (ms) => {
    const d = new Date(ms); if (isNaN(d)) return '';
    const hoy = new Date(), ayer = new Date(Date.now() - 864e5);
    const hm = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
    if (d.toDateString() === hoy.toDateString()) return 'hoy ' + hm;
    if (d.toDateString() === ayer.toDateString()) return 'ayer ' + hm;
    return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'numeric', year: 'numeric' });
  };
  // Marca el enlace (Haven no busca su vista previa) y dibuja la conversacion; devuelve true si lo tomo
  function foroVista(app, msgEl) {
    const a = foroEnlace(msgEl);
    if (!a) return false;
    const url = sinHash(a.href);
    msgEl.dataset.foroUrl = url;
    a.dataset.embedDeferred = 'foro';
    const cont = a.closest('.message-content, .thread-msg-content');
    if (!cont || (cont.nextElementSibling && cont.nextElementSibling.classList.contains('puente-vista-foro'))) return true;
    const tk = token();
    if (!foroDatos.has(url)) {
      foroDatos.set(url, !tk ? Promise.resolve(null) : fetch('/puente/api/foro/vista?url=' + encodeURIComponent(a.href), { headers: { Authorization: 'Bearer ' + tk } })
        .then(r => (r.ok ? r.json() : r.status === 404 ? { no: true } : null)).catch(() => null)
        .then(d => { if (!d) foroDatos.delete(url); return d && !d.no && Array.isArray(d.filas) && d.filas.length ? d : null; }));
    }
    foroDatos.get(url).then(d => {
      if (!msgEl.isConnected) return;
      if (!d) {
        // Sin la conversacion: la vista previa de siempre
        msgEl.dataset.foroSin = '1'; delete msgEl.dataset.foroUrl;
        if (a.dataset.embedDeferred === 'foro') delete a.dataset.embedDeferred;
        const list = known.get(msgEl.dataset.msgId);
        if (list) { defer(msgEl, true); render(app, msgEl, list); } else try { app._fetchLinkPreviews(msgEl); } catch { /* sin vista previa */ }
        return;
      }
      if (cont.nextElementSibling && cont.nextElementSibling.classList.contains('puente-vista-foro')) return;
      const box = el('div', 'puente-vista-chat puente-vista-foro');
      box.setAttribute('role', 'link'); box.tabIndex = 0; box.title = 'Abrir el tema';
      box.append(el('div', 'puente-vista-cab', 'Foro · ' + d.canal), el('div', 'puente-vista-tema', d.tema));
      for (const m of d.filas) {
        const fila = el('div', 'puente-vista-fila' + (m.marcado ? ' marcado' : ''));
        if (okUrl(m.foto)) { const i = el('img', 'puente-vista-foto'); i.src = m.foto; i.alt = ''; i.loading = 'lazy'; fila.append(i); }
        else fila.append(el('span', 'puente-vista-foto', (m.autor || '?').trim().charAt(0).toUpperCase()));
        const der = el('div', 'puente-vista-der');
        const cab = el('div', 'puente-vista-quien');
        cab.append(el('b', '', m.autor), el('span', '', ' ' + cuando(m.fecha)));
        der.append(cab);
        if (m.texto) der.append(el('div', 'puente-vista-texto', m.texto));
        fila.append(der);
        box.append(fila);
      }
      if (d.respuestas) box.append(el('div', 'puente-vista-pie', d.respuestas + (d.respuestas === 1 ? ' respuesta' : ' respuestas') + ' · Ver el tema'));
      // Tocarlo abre el tema adentro de CV Chat (como el boton del foro); si no se puede, como el enlace
      const ir = (e) => {
        e.preventDefault(); e.stopPropagation();
        if (window.puenteForo) { try { const u = new URL(a.href); window.puenteForo.abrir(u.pathname + u.search + u.hash); return; } catch { /* como el enlace */ } }
        a.click();
      };
      box.addEventListener('click', ir);
      box.addEventListener('keydown', (e) => { if (e.key === 'Enter') ir(e); });
      cont.after(box);
    });
    return true;
  }
  const msgsIn = (root) => {
    const list = root.matches && root.matches('[data-msg-id]') ? [root] : [...root.querySelectorAll('[data-msg-id]')];
    return list.filter(m => /^\d+$/.test(m.dataset.msgId || '') && previewLinks(m).length);
  };

  async function load(ids) {
    const want = ids.filter(id => !known.has(id) && !asked.has(id));
    if (!want.length) return;
    want.forEach(id => asked.add(id));
    const tk = token();
    if (!tk) return;
    for (let i = 0; i < want.length; i += 100) {
      try {
        const r = await fetch('/puente/api/embeds?ids=' + want.slice(i, i + 100).join(','), { headers: { Authorization: 'Bearer ' + tk } });
        if (!r.ok) { want.forEach(id => asked.delete(id)); return; }
        const data = await r.json();
        for (const [id, list] of Object.entries(data)) if (Array.isArray(list)) known.set(id, list);
      } catch { want.forEach(id => asked.delete(id)); return; }
    }
  }

  // ── Texto con el formato de Discord (negrita, cursiva, citas, enlaces...) ──
  function md(raw) {
    const keep = [];
    let s = String(raw || '').replace(/\\([\\`*_{}[\]()#+\-.!~|>:@<='"])/g, (m, c) => { keep.push(c); return '\u0000' + (keep.length - 1) + '\u0000'; });
    s = esc(s);
    const code = [];
    s = s.replace(/`([^`\n]+)`/g, (m, c) => { code.push(c); return '\u0001' + (code.length - 1) + '\u0001'; });
    s = s.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, (m, t, u) => `<a href="${u}" target="_blank" rel="noopener noreferrer" data-embed-deferred="puente">${t}</a>`);
    s = s.replace(/(^|[\s(>])(https?:\/\/[^\s<)]+)/g, (m, p, u) => `${p}<a href="${u}" target="_blank" rel="noopener noreferrer" data-embed-deferred="puente">${u}</a>`);
    s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>').replace(/__([^_\n]+)__/g, '<u>$1</u>')
      .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>').replace(/(^|[^\w_])_([^_\n]+)_(?!\w)/g, '$1<em>$2</em>')
      .replace(/~~([^~\n]+)~~/g, '<s>$1</s>');
    // Citas: lineas que empiezan con "> "
    s = s.split('\n').map(l => (/^&gt; ?/.test(l) ? '<span class="pe-quote">' + l.replace(/^&gt; ?/, '') + '</span>' : l)).join('\n');
    s = s.replace(/\n/g, '<br>').replace(/<\/span><br><span class="pe-quote">/g, '<br>');
    s = s.replace(/\u0001(\d+)\u0001/g, (m, i) => '<code>' + code[i] + '</code>');
    return s.replace(/\u0000(\d+)\u0000/g, (m, i) => esc(keep[i]));
  }

  function when(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return '';
    const hm = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
    const day = new Date(d); day.setHours(0, 0, 0, 0);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const diff = Math.round((today - day) / 86400000);
    if (diff === 0) return 'Hoy a las ' + hm;
    if (diff === 1) return 'Ayer a las ' + hm;
    return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' + hm;
  }
  // Las imagenes del proxy de Discord, al tamaño que se ve (como hace Discord)
  function sized(u, w, h, maxW, maxH) {
    const src = okUrl(u);
    if (!src) return null;
    if (!/^https:\/\/(images-ext-\d+|media)\.discordapp\.net\//.test(src) || !w || !h) return src;
    const k = Math.min(1, maxW / w, maxH / h), dpr = Math.min(2, window.devicePixelRatio || 1);
    return src + (src.includes('?') ? '&' : '?') + 'format=webp&width=' + Math.round(w * k * dpr) + '&height=' + Math.round(h * k * dpr);
  }
  function link(cls, text, href) {
    const h = okUrl(href);
    const a = el(h ? 'a' : 'span', cls, text);
    if (h) { a.href = h; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.dataset.embedDeferred = 'puente'; } // sin vista previa de Haven
    return a;
  }
  function image(app, m, cls, maxW, maxH) {
    const img = el('img', cls);
    img.src = sized(m.url, m.w, m.h, maxW, maxH);
    img.alt = '';
    img.loading = 'lazy';
    if (m.w && m.h) { const k = Math.min(1, maxW / m.w, maxH / m.h); img.width = Math.round(m.w * k); img.height = Math.round(m.h * k); }
    img.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); if (app._openLightbox) app._openLightbox(okUrl(m.url), img); });
    return img;
  }
  // Video: la miniatura con el boton de play; al tocarla, el video (YouTube adentro, o el archivo)
  function video(app, e) {
    const thumb = e.thumbnail || e.image;
    const box = el('div', 'pe-video');
    const ratio = (e.video.w && e.video.h) ? e.video.h / e.video.w : (thumb && thumb.w && thumb.h ? thumb.h / thumb.w : 9 / 16);
    box.style.aspectRatio = String(1 / ratio);
    // Los verticales, como en Discord: hasta 20rem de alto (mas angostos, con la misma proporcion)
    if (ratio > 1) box.style.width = 'min(25rem, 100%, ' + (20 / ratio).toFixed(2) + 'rem)';
    if (thumb) { const t = el('img', 'pe-video-thumb'); t.src = sized(thumb.url, thumb.w, thumb.h, 400, 300); t.alt = ''; t.loading = 'lazy'; box.appendChild(t); }
    const play = el('button', 'pe-play'); play.type = 'button'; play.title = 'Reproducir';
    play.innerHTML = '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path fill="currentColor" d="M8 5.5v13l10.5-6.5z"/></svg>';
    box.appendChild(play);
    box.addEventListener('click', (ev) => {
      ev.preventDefault(); ev.stopPropagation();
      const yt = okUrl(e.video.url) && /youtube(-nocookie)?\.com\/embed\//.test(e.video.url) ? e.video.url : null;
      box.textContent = '';
      if (yt) {
        const f = el('iframe'); f.src = yt + (yt.includes('?') ? '&' : '?') + 'autoplay=1&rel=0';
        f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen'; f.allowFullscreen = true; f.referrerPolicy = 'strict-origin-when-cross-origin';
        box.appendChild(f);
      } else {
        const v = el('video'); v.src = okUrl(e.video.proxy) || okUrl(e.video.url); v.controls = true; v.autoplay = true; v.playsInline = true;
        // Pantalla completa a mano (en un video angosto el navegador la esconde en los tres puntitos)
        const grande = el('button', 'pe-grande'); grande.type = 'button'; grande.title = 'Pantalla completa';
        grande.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M4 4h6v2H6v4H4V4Zm10 0h6v6h-2V6h-4V4ZM4 14h2v4h4v2H4v-6Zm14 0h2v6h-6v-2h4v-4Z"/></svg>';
        // Donde no hay pantalla completa (la app de Android): el video ocupa toda la ventana, y el mismo boton lo cierra
        const fijo = (si) => { box.classList.toggle('pe-fijo', si); grande.title = si ? 'Achicar' : 'Pantalla completa'; };
        grande.addEventListener('click', (ev) => {
          ev.preventDefault(); ev.stopPropagation();
          if (box.classList.contains('pe-fijo')) { fijo(false); return; }
          const sinNativa = () => (v.webkitEnterFullscreen ? v.webkitEnterFullscreen() : fijo(true));
          try {
            if (v.requestFullscreen && document.fullscreenEnabled !== false) v.requestFullscreen().catch(sinNativa);
            else sinNativa();
          } catch { fijo(true); }
        });
        document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && box.classList.contains('pe-fijo')) fijo(false); });
        box.append(v, grande);
      }
    }, { once: true });
    return box;
  }
  function gifv(e) {
    const v = el('video', 'pe-gifv');
    v.src = okUrl(e.video.proxy) || okUrl(e.video.url); v.autoplay = true; v.loop = true; v.muted = true; v.playsInline = true;
    if (e.video.w && e.video.h) { const k = Math.min(1, 400 / e.video.w, 300 / e.video.h); v.width = Math.round(e.video.w * k); v.height = Math.round(e.video.h * k); }
    return v;
  }

  function card(app, e, extraImages) {
    // Un enlace a una imagen o un gif sueltos: como en Discord, solo la imagen
    if (e.type === 'gifv' && e.video) { const w = el('div', 'puente-embed-media'); w.appendChild(gifv(e)); return w; }
    if (e.type === 'image' && (e.thumbnail || e.image)) { const w = el('div', 'puente-embed-media'); w.appendChild(image(app, e.image || e.thumbnail, 'pe-solo', 400, 300)); return w; }
    const c = el('article', 'puente-embed');
    if (Number.isInteger(e.color)) c.style.setProperty('--pe-color', '#' + e.color.toString(16).padStart(6, '0'));
    const body = el('div', 'pe-body');
    if (e.provider) body.appendChild(link('pe-provider', e.provider.name, e.provider.url));
    if (e.author) {
      const a = el('div', 'pe-author');
      if (okUrl(e.author.icon)) { const i = el('img', 'pe-author-icon'); i.src = sized(e.author.icon, 64, 64, 24, 24); i.alt = ''; a.appendChild(i); }
      a.appendChild(link('pe-author-name', e.author.name, e.author.url));
      body.appendChild(a);
    }
    if (e.title) body.appendChild(link('pe-title', e.title, e.url));
    if (e.description) { const d = el('div', 'pe-desc'); d.innerHTML = md(e.description); body.appendChild(d); }
    if (e.fields && e.fields.length) {
      const fs = el('div', 'pe-fields');
      for (const f of e.fields) { const x = el('div', 'pe-field' + (f.inline ? ' inline' : '')); const n = el('div', 'pe-field-name'); n.innerHTML = md(f.name); const v = el('div', 'pe-field-value'); v.innerHTML = md(f.value); x.append(n, v); fs.appendChild(x); }
      body.appendChild(fs);
    }
    const bigThumb = e.thumbnail && (e.type === 'article' || e.type === 'link') && (e.thumbnail.w || 0) >= 300;
    if (e.type === 'video' && e.video) body.appendChild(video(app, e));
    else if (e.image || bigThumb) {
      const imgs = [e.image || e.thumbnail, ...(extraImages || [])];
      const g = el('div', 'pe-images' + (imgs.length > 1 ? ' pe-grid-' + Math.min(imgs.length, 4) : ''));
      imgs.slice(0, 4).forEach(m => g.appendChild(image(app, m, 'pe-image', imgs.length > 1 ? 200 : 400, imgs.length > 1 ? 200 : 300)));
      body.appendChild(g);
    } else if (e.thumbnail) {
      c.classList.add('pe-has-thumb');
      const t = image(app, e.thumbnail, 'pe-thumb', 80, 80);
      c.appendChild(t);
    }
    if (e.footer || e.timestamp) {
      const f = el('div', 'pe-footer');
      if (e.footer && okUrl(e.footer.icon)) { const i = el('img', 'pe-footer-icon'); i.src = sized(e.footer.icon, 64, 64, 20, 20); i.alt = ''; f.appendChild(i); }
      f.appendChild(el('span', '', [e.footer && e.footer.text, e.timestamp && when(e.timestamp)].filter(Boolean).join(' • ')));
      body.appendChild(f);
    }
    c.insertBefore(body, c.firstChild);
    if (e.type !== 'video') conVideo(app, c, e);
    return c;
  }

  // Los tuits con video: Discord guarda solo la foto, asi que el video se busca aparte (la vista previa de
  // tuits del puente, vincular.js) y va en la tarjeta en lugar de la foto, para verlo aca mismo
  const TUIT = /^https?:\/\/(?:(?:www\.|mobile\.)?(?:twitter|x)\.com|(?:[a-z0-9-]+\.)?(?:fxtwitter|fixupx|vxtwitter|fixvx|faggotx)\.com)\/[A-Za-z0-9_]{1,20}\/status(?:es)?\/\d+/i;
  const tuits = new Map(); // enlace -> promesa con la vista previa
  function conVideo(app, c, e) {
    const u = okUrl(e.url);
    if (!u || !TUIT.test(u)) return;
    const tk = token();
    if (!tk) return;
    if (!tuits.has(u)) {
      tuits.set(u, fetch('/api/link-preview?url=' + encodeURIComponent(u), { headers: { Authorization: 'Bearer ' + tk } })
        .then(r => (r.ok ? r.json() : null)).catch(() => null)
        .then(d => { if (!d) tuits.delete(u); return d; }));
    }
    tuits.get(u).then(d => {
      if (!d || !okUrl(d.video) || !c.isConnected || c.querySelector('.pe-video')) return;
      const v = video(app, { video: { url: d.video, w: d.videoW, h: d.videoH }, thumbnail: okUrl(d.image) ? { url: d.image, w: d.videoW, h: d.videoH } : null });
      c.querySelectorAll('.pe-thumb, .pe-images').forEach(n => n.remove());
      c.classList.remove('pe-has-thumb');
      const body = c.querySelector('.pe-body'), pie = body && body.querySelector('.pe-footer');
      if (body) body.insertBefore(v, pie || null);
    });
  }

  function render(app, msgEl, list) {
    const content = msgEl.querySelector('.message-content, .thread-msg-content');
    if (!content) return;
    content.querySelectorAll(':scope .link-preview, :scope > .puente-embeds').forEach(n => n.remove());
    // (una lista vacia es una vista previa quitada con la ✕: la tarjeta de los enlaces a juegos tampoco va)
    if (!list.length) msgEl.dataset.sinVista = '1'; else delete msgEl.dataset.sinVista;
    list = list.filter(e => !deForo(msgEl, e)); // (el tema del foro ya tiene su conversacion)
    if (!list.length) return;
    const box = el('div', 'puente-embeds');
    // Varias imagenes del mismo enlace (un tweet con 4 fotos): una tarjeta con la grilla, como Discord
    for (let i = 0; i < list.length; i++) {
      const e = list[i], extra = [];
      while (list[i + 1] && e.url && list[i + 1].url === e.url && list[i + 1].image && !list[i + 1].title && !list[i + 1].description) { extra.push(list[i + 1].image); i++; }
      try { box.appendChild(card(app, e, extra)); } catch (err) { console.warn('[puente] embed:', err); }
    }
    content.appendChild(box);
  }

  // Haven no dibuja su vista previa en los enlaces de los mensajes que tienen embed de Discord
  function defer(msgEl, on) {
    for (const a of previewLinks(msgEl)) {
      if (on && !a.dataset.embedDeferred) a.dataset.embedDeferred = 'puente';
      else if (!on && a.dataset.embedDeferred === 'puente') delete a.dataset.embedDeferred;
    }
  }

  let tries = 0;
  (function wait() {
    const app = window.app;
    if (!app || typeof app._fetchLinkPreviews !== 'function' || !app.socket) { if (++tries < 120) setTimeout(wait, 500); return; }
    const orig = app._fetchLinkPreviews;
    app._fetchLinkPreviews = function (containerEl, ...rest) {
      const self = this;
      let msgs = [];
      // Los enlaces a temas del foro: su conversacion, antes de que Haven elija sus vistas previas
      try {
        if (containerEl) for (const m of (containerEl.matches && containerEl.matches('[data-msg-id]') ? [containerEl] : containerEl.querySelectorAll('[data-msg-id]'))) foroVista(self, m);
      } catch (err) { console.warn('[puente] foro:', err); }
      try { msgs = containerEl ? msgsIn(containerEl) : []; } catch { msgs = []; }
      if (!msgs.length) return orig.call(self, containerEl, ...rest);
      // Lo que ya se sabe (vino con el historial, o de antes) se dibuja ya, con el mensaje; solo se
      // espera por los que faltan, y los demas no esperan por ellos
      const pend = [];
      for (const m of msgs) {
        const id = m.dataset.msgId, list = known.get(id);
        if (list) { defer(m, true); render(self, m, list); }
        else if (sinDiscord.has(id)) defer(m, false); // sin embed de Discord: la vista previa de Haven
        else { defer(m, true); pend.push(m); }
      }
      orig.call(self, containerEl, ...rest);
      if (!pend.length) return;
      load(pend.map(m => m.dataset.msgId)).finally(() => {
        for (const m of pend) {
          const list = known.get(m.dataset.msgId);
          if (list) render(self, m, list);
          else { defer(m, false); orig.call(self, m); }
        }
      });
    };
    // El embed de Discord llega un instante despues del mensaje: se reemplaza al vuelo
    app.socket.on('puente-embeds', (d) => {
      if (!d || !d.messageId || !Array.isArray(d.embeds)) return;
      const id = String(d.messageId);
      // Discord no armo nada (pasa con los enlaces a X): la vista previa de Haven, como en los que no estan en Discord
      if (d.haven) {
        known.delete(id); sinDiscord.add(id);
        document.querySelectorAll('[data-msg-id="' + id + '"]').forEach(m => {
          m.querySelectorAll('.puente-embeds').forEach(n => n.remove());
          defer(m, false);
          if (!m.querySelector('.link-preview')) { try { app._fetchLinkPreviews(m); } catch (err) { console.warn('[puente] vista previa:', err); } }
        });
        return;
      }
      known.set(id, d.embeds);
      document.querySelectorAll('[data-msg-id="' + id + '"]').forEach(m => { defer(m, true); render(app, m, d.embeds); });
    });
    // Al abrir la app Haven puede pedir sus vistas previas antes de que esto este listo, y llegan
    // despues de la de Discord: en un mensaje que ya tiene la de Discord, la de Haven no queda
    const sobra = (lp) => { const m = lp.closest('[data-msg-id]'); if (m && m.querySelector('.puente-embeds')) lp.remove(); };
    new MutationObserver((muts) => {
      for (const mu of muts) for (const n of mu.addedNodes) {
        if (n.nodeType !== 1) continue;
        if (n.classList.contains('link-preview')) sobra(n);
        else if (n.firstElementChild) n.querySelectorAll('.link-preview').forEach(sobra);
      }
    }).observe(document.body, { childList: true, subtree: true });
  })();
})();

// Pantallas tactiles: mantener apretada una reaccion muestra quien reacciono,
// como en la app de Discord: una hoja desde abajo con una pestaña por emoji (con
// su cantidad) y la lista de personas, con avatar. Incluye a quienes
// reaccionaron desde Discord. En la propia hay una ✕ para sacarla.
// (Antes, mantener apretado abria el menu del mensaje.)
(function () {
  'use strict';
  if (!matchMedia('(pointer: coarse)').matches) return;

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.textContent = text;
    return n;
  }
  const token = () => { try { return localStorage.getItem('haven_token'); } catch { return null; } };

  function close() {
    document.getElementById('puente-who-sheet')?.remove();
    document.getElementById('puente-who-backdrop')?.remove();
  }

  // La lista completa (con las fotos) se pide apenas se apoya el dedo en la reaccion: para cuando
  // se abre la ventana (medio segundo despues) ya llego, y las fotos ya estan bajadas. Se guarda
  // un minuto por mensaje; si cambian sus reacciones, se vuelve a pedir.
  const guardadas = new Map(); // mensaje -> { at, promesa, datos }
  const fotos = new Set();
  function precargar(datos) {
    for (const r of datos) for (const u of r.users || []) {
      if (!u.avatar || fotos.has(u.avatar)) continue;
      fotos.add(u.avatar);
      const im = new Image(); im.decoding = 'async'; im.src = u.avatar;
    }
  }
  function pedir(msgId) {
    const g = guardadas.get(msgId);
    if (g && Date.now() - g.at < 60000) return g.promesa;
    const tk = token();
    if (!tk) return Promise.resolve(null);
    const e = { at: Date.now(), datos: null, promesa: null };
    e.promesa = fetch('/puente/api/reacciones?mensaje=' + msgId, { headers: { Authorization: 'Bearer ' + tk } })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { const l = d && Array.isArray(d.reacciones) ? d.reacciones : null; if (l) { e.datos = l; precargar(l); } else guardadas.delete(msgId); return l; })
      .catch(() => { guardadas.delete(msgId); return null; });
    guardadas.set(msgId, e);
    return e.promesa;
  }
  const idDe = (badge) => { const m = badge.closest('.message, .message-compact'); return m && parseInt(m.dataset.msgId, 10); };
  document.addEventListener('pointerdown', (e) => {
    const b = e.target instanceof Element && e.target.closest('.reaction-badge');
    const id = b && idDe(b);
    if (id) pedir(id);
  }, { capture: true, passive: true });
  // Mientras llega: la foto de los que ya conoce la app (los de la lista de miembros)
  function fotoConocida(app, nombre) {
    const n = String(nombre || '').toLowerCase();
    for (const l of [app._lastOnlineUsers, app.channelMembers, app.users]) {
      if (!Array.isArray(l)) continue;
      const u = l.find(x => x && [x.displayName, x.display_name, x.username].some(v => v && String(v).toLowerCase() === n));
      if (u && (u.avatar || u.avatarUrl)) return u.avatar || u.avatarUrl;
    }
    return null;
  }

  function emojiNode(app, emoji, cls) {
    const m = /^:([a-zA-Z0-9_-]+):$/.exec(emoji || '');
    const ce = m && Array.isArray(app.customEmojis) ? app.customEmojis.find(e => e.name === m[1]) : null;
    if (ce) { const img = el('img', cls); img.src = ce.url; img.alt = emoji; return img; }
    return el('span', cls, emoji);
  }

  function open(app, badge) {
    close();
    const msgEl = badge.closest('.message, .message-compact');
    const msgId = msgEl && parseInt(msgEl.dataset.msgId, 10);
    if (!msgId) return;
    const back = el('div');
    back.id = 'puente-who-backdrop';
    back.addEventListener('click', close);
    const sheet = el('div', 'puente-who-sheet');
    sheet.id = 'puente-who-sheet';
    haptic();
    sheet.appendChild(el('div', 'puente-sheet-handle'));
    const tabs = el('div', 'puente-who-tabs');
    const list = el('div', 'puente-who-list');
    sheet.append(tabs, list);
    document.body.append(back, sheet);

    // Mientras llega la lista completa, lo que ya se sabe (los nombres de Haven)
    const fromBadges = [...msgEl.querySelectorAll('.reaction-badge')].map(b => {
      let users = [];
      try { users = JSON.parse(b.dataset.users || '[]'); } catch { /* sin datos */ }
      return { emoji: b.dataset.emoji, users: users.map(n => ({ name: n, avatar: fotoConocida(app, n) })) };
    });
    const ya = guardadas.get(msgId);
    let data = ya && ya.datos && Date.now() - ya.at < 60000 ? ya.datos : fromBadges;
    let current = badge.dataset.emoji;

    function render() {
      tabs.textContent = '';
      for (const r of data) {
        const t = el('button', 'puente-who-tab' + (r.emoji === current ? ' active' : ''));
        t.type = 'button';
        t.append(emojiNode(app, r.emoji, 'puente-who-emoji'), el('span', 'puente-who-count', String(r.users.length)));
        t.addEventListener('click', () => { current = r.emoji; render(); });
        tabs.appendChild(t);
      }
      list.textContent = '';
      const r = data.find(x => x.emoji === current) || data[0];
      if (!r) return;
      const head = el('div', 'puente-who-head');
      head.appendChild(emojiNode(app, r.emoji, 'puente-who-emoji'));
      head.appendChild(el('span', '', r.emoji.startsWith(':') ? r.emoji : ''));
      list.appendChild(head);
      for (const u of r.users) {
        const row = el('div', 'puente-who-row');
        const av = el('div', 'puente-who-avatar');
        if (u.avatar) { const img = el('img'); img.src = u.avatar; img.alt = ''; av.appendChild(img); }
        else av.textContent = (u.name || '?').trim().charAt(0).toUpperCase();
        row.append(av, el('span', 'puente-who-name', u.name || '?'));
        if (u.discord) row.appendChild(el('span', 'puente-who-tag', 'DISCORD'));
        if (u.propio) {
          const x = el('button', 'puente-who-remove', '✕');
          x.type = 'button';
          x.setAttribute('aria-label', 'Sacar mi reacción');
          x.addEventListener('click', () => { app.socket.emit('remove-reaction', { messageId: msgId, emoji: r.emoji }); close(); });
          row.appendChild(x);
        }
        list.appendChild(row);
      }
    }
    render();

    if (data === fromBadges) {
      pedir(msgId).then(l => { if (l && document.getElementById('puente-who-sheet') === sheet) { data = l; render(); } });
    }

    // Manija: hacia arriba se agranda, hacia abajo se cierra
    sheetDrag(sheet, { close, scroller: list });
  }

  (function olvidar() {
    const so = window.app && window.app.socket;
    if (!so) { setTimeout(olvidar, 1000); return; }
    so.on('reactions-updated', (d) => { if (d && d.messageId != null) guardadas.delete(parseInt(d.messageId, 10)); });
  })();

  // Al soltar despues de mantener apretado, que no cuente como toque (pondria o sacaria la reaccion)
  let ignoreClickUntil = 0;
  document.addEventListener('click', (e) => {
    if (Date.now() < ignoreClickUntil && e.target instanceof Element && e.target.closest('.reaction-badge')) {
      e.preventDefault(); e.stopPropagation();
    }
  }, true);

  // Mantener apretado = el "contextmenu" del navegador: antes que el menu del mensaje
  document.addEventListener('contextmenu', (e) => {
    const badge = e.target instanceof Element && e.target.closest('.reaction-badge');
    if (!badge || !window.app) return;
    e.preventDefault();
    e.stopPropagation();
    ignoreClickUntil = Date.now() + 800;
    if (navigator.vibrate) navigator.vibrate(15);
    try { open(window.app, badge); } catch (err) { console.warn('[puente] quien reacciono:', err); }
  }, true);
})();

// Canales donde Discord no te deja escribir (por ejemplo los de anuncios): el
// cuadro de escribir queda desactivado con el aviso de Discord, en vez de dejar
// escribir y que despues el servidor rechace el mensaje. Los permisos los
// calcula el puente con tus roles de Discord (/puente/api/permisos).
(function () {
  'use strict';
  const MSG = 'No tenés permiso para enviar mensajes en este canal.';
  const cache = new Map(); // codigo -> { at, perms }
  const token = () => { try { return localStorage.getItem('haven_token'); } catch { return null; } };

  function applyPerms(perms) {
    const area = document.getElementById('message-input-area');
    const input = document.getElementById('message-input');
    if (!area || !input) return;
    const blocked = perms && perms.enviar === false;
    area.classList.toggle('puente-sin-permiso', !!blocked);
    if (blocked) {
      if (!input.dataset.puentePlaceholder) input.dataset.puentePlaceholder = input.placeholder;
      input.value = '';
      input.placeholder = (perms && perms.motivo) || MSG;
      input.disabled = true;
    } else if (input.disabled && input.dataset.puentePlaceholder !== undefined) {
      input.disabled = false;
      input.placeholder = input.dataset.puentePlaceholder;
      delete input.dataset.puentePlaceholder;
    }
  }

  async function check(code) {
    if (!code || !/^[a-f0-9]{8}$/i.test(code)) { applyPerms(null); return; }
    const hit = cache.get(code);
    if (hit && Date.now() - hit.at < 60000) { applyPerms(hit.perms); return; }
    const tk = token();
    if (!tk) return;
    try {
      const r = await fetch('/puente/api/permisos?canal=' + encodeURIComponent(code), { headers: { Authorization: 'Bearer ' + tk } });
      if (!r.ok) return;
      const perms = await r.json();
      cache.set(code, { at: Date.now(), perms });
      if (window.app && window.app.currentChannel === code) applyPerms(perms);
    } catch { /* sin conexion: no se cambia nada */ }
  }

  let tries = 0;
  (function wait() {
    const app = window.app;
    if (!app || typeof app.switchChannel !== 'function') { if (++tries < 120) setTimeout(wait, 500); return; }
    const orig = app.switchChannel;
    app.switchChannel = function (code, ...rest) {
      applyPerms(null); // mientras se consulta, como estaba
      const r = orig.call(this, code, ...rest);
      Promise.resolve(r).finally(() => check(this.currentChannel));
      return r;
    };
    if (app.currentChannel) check(app.currentChannel);
  })();
})();

// Reacciones de mensajes viejos que vinieron de Discord: Haven las tenia todas a
// nombre del usuario "Discord" (una sola por emoji). Cuando un mensaje con
// reacciones aparece en pantalla, se le pide al puente que consulte a Discord
// quien reacciono; el numero de cada reaccion se corrige solo para todos.
(function () {
  'use strict';
  const asked = new Set();
  let pending = new Set(), timer = null;
  const token = () => { try { return localStorage.getItem('haven_token'); } catch { return null; } };

  function flush() {
    timer = null;
    const ids = [...pending].slice(0, 60);
    ids.forEach(id => pending.delete(id));
    if (pending.size) timer = setTimeout(flush, 1500);
    const tk = token();
    if (!ids.length || !tk) return;
    fetch('/puente/api/reacciones/revisar?mensajes=' + ids.join(','), { headers: { Authorization: 'Bearer ' + tk } }).catch(() => {});
  }

  const io = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      io.unobserve(e.target);
      const id = parseInt(e.target.dataset.msgId, 10);
      if (!id || asked.has(id)) continue;
      asked.add(id);
      pending.add(id);
    }
    if (pending.size && !timer) timer = setTimeout(flush, 600);
  }) : null;

  function watch(root) {
    if (!io || !root || !root.querySelectorAll) return;
    const msgs = root.matches && root.matches('.message, .message-compact') ? [root] : [];
    root.querySelectorAll('.message, .message-compact').forEach(m => msgs.push(m));
    for (const m of msgs) {
      if (m.dataset.puenteRevisar || !m.querySelector('.reaction-badge')) continue;
      m.dataset.puenteRevisar = '1';
      io.observe(m);
    }
  }

  function start() {
    new MutationObserver((muts) => {
      for (const m of muts) for (const n of m.addedNodes) if (n.nodeType === 1) watch(n.closest ? (n.closest('.message, .message-compact') || n) : n);
    }).observe(document.body, { childList: true, subtree: true });
    watch(document);
  }
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();

// Celular: el menu lateral como el de la app de Discord. Una columna a la
// izquierda con el boton de mensajes directos y el icono del servidor (lo que
// se ve a la derecha cambia entre los canales y los mensajes directos), el
// nombre del servidor con la cantidad de miembros, y abajo la tarjeta del
// usuario con su avatar y el engranaje de ajustes. El tema (solo en pantallas
// chicas) se encarga del resto del aspecto.
(function () {
  'use strict';
  const token = () => { try { return localStorage.getItem('haven_token'); } catch { return null; } };
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text) n.textContent = text; return n; };
  const CHAT_ICON = '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path fill="currentColor" d="M12 3C6.48 3 2 6.94 2 11.8c0 2.4 1.1 4.57 2.88 6.16-.17 1.2-.7 2.36-1.6 3.27a.5.5 0 0 0 .4.86c1.9-.1 3.5-.8 4.66-1.62 1.13.33 2.35.52 3.66.52 5.52 0 10-3.94 10-8.8S17.52 3 12 3Z"/></svg>';

  const KEY_DM = 'puente_ultimo_dm', KEY_CANAL = 'puente_ultimo_canal_servidor';
  const store = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch { return null; } };
  const findCh = (code) => (window.app && Array.isArray(window.app.channels) ? window.app.channels.find(c => c && c.code === code) : null);
  const isDm = (ch) => !!(ch && ch.is_dm);

  // Pantalla de mensajes directos (si todavia no abriste ninguna conversacion):
  // la lista de conversaciones con su avatar, como "Amigos" en Discord
  function dmHome(show) {
    let box = document.getElementById('puente-dm-home');
    if (!show) { if (box) box.remove(); return; }
    const main = document.querySelector('[data-haven-region="main"]');
    if (!main) return;
    if (!box) { box = el('div', 'puente-dm-home'); box.id = 'puente-dm-home'; main.appendChild(box); }
    box.textContent = '';
    box.appendChild(el('div', 'puente-dm-home-title', 'Mensajes directos'));
    const items = [...document.querySelectorAll('#dm-list .dm-item:not(.puente-dm-vacio), #dm-list .puente-dm-foro')];
    if (!items.length) { box.appendChild(el('div', 'puente-dm-home-empty', 'Todavía no tenés mensajes directos. Para empezar uno, tocá el nombre de una persona y elegí "Mensaje".')); return; }
    for (const item of items) {
      const row = el('button', 'puente-dm-home-row');
      row.type = 'button';
      const av = item.querySelector('.puente-dm-avatar');
      row.appendChild(av ? av.cloneNode(true) : el('span', 'puente-dm-avatar', '?'));
      row.appendChild(el('span', 'puente-dm-home-name', ((item.querySelector('.channel-name') || {}).textContent || '').trim()));
      row.appendChild(el('span', 'puente-dm-home-chat', '💬'));
      row.addEventListener('click', () => { if (!item.dataset.code) item.click(); else if (window.app) window.app.switchChannel(item.dataset.code); });
      box.appendChild(row);
    }
  }

  function goTo(dms) {
    const app = window.app;
    if (!app || typeof app.switchChannel !== 'function') return;
    const want = store(dms ? KEY_DM : KEY_CANAL);
    const ch = want && findCh(want);
    if (ch && isDm(ch) === dms) { dmHome(false); if (app.currentChannel !== want) app.switchChannel(want); return; }
    if (dms) { dmHome(true); return; }
    dmHome(false);
    // Sin canal guardado y viendo un mensaje directo: el primer canal de la lista
    const first = document.querySelector('#channel-list .channel-item[data-code]');
    if (first && isDm(findCh(app.currentChannel))) app.switchChannel(first.dataset.code);
  }

  // Recordar el ultimo canal y la ultima conversacion privada, y que la lista de
  // la izquierda siga a lo que se esta viendo (abrir un mensaje directo desde un
  // perfil muestra la lista de mensajes directos, como en Discord)
  function followChannels(showDms) {
    let tries = 0;
    (function wait() {
      const app = window.app;
      if (!app || typeof app.switchChannel !== 'function') { if (++tries < 120) setTimeout(wait, 500); return; }
      const note = (code) => {
        const ch = findCh(code);
        if (!ch) return;
        store(isDm(ch) ? KEY_DM : KEY_CANAL, code);
        dmHome(false);
        showDms(isDm(ch));
      };
      const orig = app.switchChannel;
      app.switchChannel = function (code, ...rest) {
        const r = orig.call(this, code, ...rest);
        try { note(code); } catch (err) { console.warn('[puente] canal:', err); }
        return r;
      };
      if (app.currentChannel) note(app.currentChannel);
    })();
  }

  function build() {
    const sb = document.querySelector('[data-haven-region="navigation-sidebar"]');
    if (!sb || document.getElementById('puente-rail')) return !!sb;
    const rail = el('nav', 'puente-rail');
    rail.id = 'puente-rail';
    const dm = el('button', 'puente-rail-btn puente-rail-dm');
    dm.type = 'button';
    dm.title = 'Mensajes directos';
    dm.innerHTML = CHAT_ICON;
    const dmBadge = el('span', 'puente-rail-badge');
    dm.appendChild(dmBadge);
    const srv = el('button', 'puente-rail-btn puente-rail-server active');
    srv.type = 'button';
    srv.title = (document.querySelector('.brand-text') || {}).textContent || 'Servidor';
    const img = el('img');
    img.src = '/puente/icono-192.png';
    img.alt = '';
    img.onerror = () => { img.remove(); srv.textContent = (srv.title || 'S').charAt(0); };
    srv.appendChild(img);
    rail.append(dm, el('div', 'puente-rail-sep'), srv);
    sb.insertBefore(rail, sb.firstChild);
    // El icono propio de los mensajes (/puente/icono-mensajes.webp, no va al repositorio); si no esta, el dibujo
    const iconoPropio = (b) => { const im = el('img', 'puente-ico-img'); im.alt = ''; im.draggable = false; im.addEventListener('load', () => { b.querySelector('svg')?.remove(); b.classList.add('con-icono'); b.prepend(im); }); im.src = '/puente/icono-mensajes.webp?v=1'; };
    iconoPropio(dm);

    // En la PC, el mismo boton arriba de todo en la columna de servidores de Haven
    const bar = document.getElementById('server-bar');
    const home = document.getElementById('home-server');
    let pcDm = null, pcBadge = null;
    if (bar && home) {
      pcDm = el('div', 'server-icon puente-pc-dm');
      pcDm.title = 'Mensajes directos';
      pcDm.innerHTML = CHAT_ICON;
      pcBadge = el('span', 'puente-rail-badge');
      pcDm.appendChild(pcBadge);
      iconoPropio(pcDm);
      bar.insertBefore(pcDm, home);
      bar.insertBefore(el('div', 'server-separator puente-pc-sep'), home);
    }

    const showDms = (on) => {
      sb.classList.toggle('puente-ver-dms', on);
      dm.classList.toggle('active', on);
      srv.classList.toggle('active', !on);
      if (pcDm) pcDm.classList.toggle('active', on);
      if (home) home.classList.toggle('puente-inactivo', on);
      const list = document.getElementById('dm-list');
      if (on && list && list.style.display === 'none') document.getElementById('dm-toggle-header')?.click();
    };
    dm.addEventListener('click', () => showDms(true));
    srv.addEventListener('click', () => {
      showDms(false);
      // Viendo un mensaje directo: atras de la lista de canales, el ultimo canal donde estabas (como en la PC).
      // Cambiar de canal en el celular cierra la lista: se vuelve a abrir, para que se vean los canales
      const app = window.app;
      if (!app || !isDm(findCh(app.currentChannel))) return;
      goTo(false);
      const body = document.getElementById('app-body');
      const abrir = () => { if (body && !body.classList.contains('mobile-sidebar-open')) document.getElementById('mobile-menu-btn')?.click(); };
      setTimeout(abrir, 60); setTimeout(abrir, 400);
    });
    // En la PC, como Discord de escritorio, cambia toda la pantalla: los mensajes
    // directos abren la ultima conversacion privada (o una pantalla con todas) y
    // el servidor vuelve al ultimo canal donde estabas
    if (pcDm) pcDm.addEventListener('click', () => { showDms(true); goTo(true); });
    if (home) home.addEventListener('click', () => { showDms(false); goTo(false); });
    followChannels(showDms);

    // Mensajes directos sin leer: el numero tambien en el boton de la columna
    const src = document.getElementById('dm-unread-badge');
    const sync = () => {
      const n = src && src.style.display !== 'none' ? src.textContent.trim() : '';
      for (const b of [dmBadge, pcBadge]) {
        if (!b) continue;
        b.textContent = n;
        b.style.display = n && n !== '0' ? '' : 'none';
      }
    };
    if (src) new MutationObserver(sync).observe(src, { attributes: true, childList: true, characterData: true, subtree: true });
    sync();

    // Ajustes: el engranaje pasa a la tarjeta del usuario, como en Discord
    const gear = document.getElementById('mobile-settings-btn');
    const account = document.querySelector('[data-haven-region="account"]');
    if (gear && account) { gear.classList.add('puente-account-gear'); account.appendChild(gear); document.documentElement.classList.add('puente-gear-cuenta'); }
    return true;
  }

  // Nombre del servidor con "N miembros" y el avatar propio en la tarjeta de abajo
  async function details() {
    const tk = token();
    if (!tk) return false;
    const r = await fetch('/puente/api/estado', { headers: { Authorization: 'Bearer ' + tk } }).catch(() => null);
    if (!r || !r.ok) return false;
    const st = await r.json().catch(() => null);
    if (!st) return false;
    const brand = document.querySelector('[data-haven-region="navigation-sidebar"] .sidebar-header .brand');
    // Debajo del nombre del servidor (en el celular): cuantos miembros hay en CV Chat, de un vistazo
    if (brand && typeof st.miembros === 'number' && !document.getElementById('puente-server-info')) {
      const info = el('div', 'puente-server-info');
      info.append(el('b', '', st.miembros.toLocaleString('es-AR')), ' miembros en CV Chat');
      info.id = 'puente-server-info';
      brand.insertAdjacentElement('afterend', info);
    }
    const account = document.querySelector('[data-haven-region="account"]');
    if (account && !account.querySelector('.puente-account-avatar')) {
      const av = el('div', 'puente-account-avatar');
      if (st.avatar) { const i = el('img'); i.src = st.avatar; i.alt = ''; av.appendChild(i); }
      else av.textContent = String(st.haven || '?').charAt(0).toUpperCase();
      account.insertBefore(av, account.firstChild);
    }
    return true;
  }

  // Al guardar una foto de perfil nueva Haven solo cambia la vista previa del editor: aca se cambia
  // tambien la de la tarjeta de abajo y la de los mensajes propios ya cargados, sin recargar
  function fotoNueva(url) {
    const account = document.querySelector('[data-haven-region="account"]');
    const av = account && account.querySelector('.puente-account-avatar');
    if (av) {
      av.textContent = '';
      if (url) { const i = el('img'); i.src = url; i.alt = ''; av.appendChild(i); }
      else av.textContent = String((window.app && window.app.user && window.app.user.username) || '?').charAt(0).toUpperCase();
    }
    const me = window.app && window.app.user && window.app.user.id;
    if (me == null) return;
    document.querySelectorAll(`.message[data-user-id="${CSS.escape(String(me))}"]`).forEach(m => {
      const img = m.querySelector('img.message-avatar-img');
      const letra = m.querySelector('div.message-avatar');
      if (url && img) { img.src = url; img.style.display = ''; if (letra) letra.style.display = 'none'; }
      else if (url && letra) {
        const i = document.createElement('img');
        i.className = letra.className.replace(/\bdiscord-import-avatar\b/, '') + ' message-avatar-img';
        i.src = url; i.alt = letra.textContent; i.loading = 'lazy';
        letra.insertAdjacentElement('beforebegin', i);
        letra.style.display = 'none';
      } else if (!url && letra) { if (img) img.style.display = 'none'; letra.style.display = ''; }
    });
  }
  let triesFoto = 0;
  (function vigilarFoto() {
    const app = window.app;
    if (!app || typeof app._commitAvatarSettings !== 'function') { if (++triesFoto < 120) setTimeout(vigilarFoto, 1000); return; }
    const orig = app._commitAvatarSettings;
    app._commitAvatarSettings = async function (...args) {
      const antes = this.user && this.user.avatar;
      const r = await orig.apply(this, args);
      try { const ahora = this.user && this.user.avatar; if (ahora !== antes) fotoNueva(ahora || null); } catch (err) { console.warn('[puente] foto:', err); }
      return r;
    };
  })();

  let tries = 0;
  (function wait() {
    const ok = build();
    if (!ok && ++tries < 120) { setTimeout(wait, 500); return; }
    let t2 = 0;
    (async function again() { if (!(await details()) && ++t2 < 60) setTimeout(again, 5000); })();
  })();
})();

// Celular: los mensajes directos como en la app de Discord. Arriba "Mensajes"
// (en vez del nombre del servidor) con un boton + para empezar una conversacion,
// y cada conversacion con el avatar de la otra persona, su nombre y hace cuanto
// fue la ultima actividad. Al tocar una, se abre en pantalla completa (en vez de
// la ventanita flotante de Haven), como en Discord.
(function () {
  'use strict';
  const mobile = () => window.innerWidth <= 768;
  const token = () => { try { return localStorage.getItem('haven_token'); } catch { return null; } };
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text) n.textContent = text; return n; };
  const avatars = new Map(); // id de usuario -> { avatar, nombre }
  let asking = false;

  function ago(ts) {
    const t = typeof ts === 'number' ? ts : Date.parse(ts);
    if (!t) return '';
    const s = Math.max(0, (Date.now() - t) / 1000);
    if (s < 3600) return Math.max(1, Math.round(s / 60)) + ' min';
    if (s < 86400) return Math.round(s / 3600) + ' h';
    if (s < 30 * 86400) return Math.round(s / 86400) + ' d';
    if (s < 365 * 86400) return Math.round(s / (30 * 86400)) + ' mes';
    return Math.round(s / (365 * 86400)) + ' a';
  }

  function loadAvatars(ids) {
    const missing = ids.filter(id => !avatars.has(id));
    const tk = token();
    if (!missing.length || !tk || asking) return;
    asking = true;
    fetch('/puente/api/avatares?ids=' + missing.join(','), { headers: { Authorization: 'Bearer ' + tk } })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d) { for (const id of missing) avatars.set(id, d[id] || { avatar: null }); decorate(); } })
      .catch(() => {}).finally(() => { asking = false; });
  }

  function decorate() {
    const app = window.app;
    const list = document.getElementById('dm-list');
    if (!app || !list || !Array.isArray(app.channels)) return;
    const ids = [];
    for (const item of list.querySelectorAll('.dm-item')) {
      const ch = app.channels.find(c => c && c.code === item.dataset.code);
      if (!ch) continue;
      const target = ch.dm_target;
      if (target && target.id) ids.push(target.id);
      let av = item.querySelector('.puente-dm-avatar');
      if (!av) {
        av = el('span', 'puente-dm-avatar');
        item.insertBefore(av, item.firstChild);
      }
      const info = target && avatars.get(target.id);
      if (info && info.avatar && !av.querySelector('img')) { av.textContent = ''; const i = el('img'); i.src = info.avatar; i.alt = ''; av.appendChild(i); }
      else if (!av.querySelector('img')) av.textContent = ch.is_group ? '👥' : ((item.querySelector('.channel-name') || {}).textContent || '?').trim().charAt(0).toUpperCase();
      let time = item.querySelector('.puente-dm-time');
      const when = ch.last_activity ? ago(ch.last_activity) : '';
      if (when) {
        if (!time) { time = el('span', 'puente-dm-time'); item.appendChild(time); }
        time.textContent = when;
      }
    }
    if (ids.length) loadAvatars([...new Set(ids)]);
  }

  function header(app) {
    const pane = document.getElementById('dm-pane');
    if (!pane || document.getElementById('puente-dm-new')) return;
    const plus = el('button', 'puente-dm-new', '+');
    plus.id = 'puente-dm-new';
    plus.type = 'button';
    plus.title = 'Nuevo mensaje';
    plus.addEventListener('click', (e) => { e.stopPropagation(); document.getElementById('new-group-dm-btn')?.click(); });
    const head = document.getElementById('dm-toggle-header');
    if (head) {
      head.appendChild(plus);
      // Titulo corto como en Discord ("Mensajes"); el de Haven queda para la PC
      const label = head.querySelector('.section-label-text');
      if (label) { const short = el('span', 'puente-dm-title', 'Mensajes'); label.insertAdjacentElement('afterend', short); }
    }
  }

  let tries = 0;
  (function wait() {
    const app = window.app;
    const list = document.getElementById('dm-list');
    if (!app || !list) { if (++tries < 120) setTimeout(wait, 500); return; }
    header(app);
    new MutationObserver(() => decorate()).observe(list, { childList: true });
    decorate();
    setInterval(decorate, 60000); // "hace cuanto" al dia
    // Tocar una conversacion en el celular: pantalla completa, como Discord.
    // Haven ya sabe hacerlo con su ajuste "abrir mensajes directos en pantalla
    // completa": se activa solo durante ese toque y Haven hace el resto (en la PC
    // queda la ventanita flotante, como siempre).
    const KEY = 'haven_dm_fullscreen_default';
    list.addEventListener('click', (e) => {
      if (!mobile()) return;
      const item = e.target instanceof Element && e.target.closest('.dm-item');
      if (!item || e.target.closest('.dm-more-btn')) return;
      let before = null;
      try { before = localStorage.getItem(KEY); localStorage.setItem(KEY, 'true'); } catch { return; }
      setTimeout(() => {
        try { if (before === null) localStorage.removeItem(KEY); else localStorage.setItem(KEY, before); } catch { /* sin almacenamiento */ }
        // Por las dudas: si quedo abierto el panel, cerrarlo
        try { if (document.getElementById('app-body')?.classList.contains('mobile-sidebar-open')) app._closeMobilePanels?.(); } catch { /* nada */ }
      }, 0);
    }, true);
  })();
})();

// Sin "pestañeo" al entrar: cuando llegan las preferencias, Haven vuelve a
// aplicar el tema y para eso saca el que ya esta cargado y lo descarga de nuevo.
// Mientras tanto la pagina queda sin tema un instante (se ve el banner y la
// lista se rearma). Si el tema pedido ya esta cargado, se deja como esta; si de
// verdad cambia, el anterior queda puesto hasta que termina de cargar el nuevo.
(function () {
  'use strict';
  const orig = window.applyPublishedThemeBase;
  if (typeof orig !== 'function') return;
  const href = (l) => (l.getAttribute('href') || '').split('?')[0];
  window.applyPublishedThemeBase = function (file, persist = true, meta = null) {
    try {
      const want = '/themes/' + encodeURIComponent(file);
      const links = [...document.querySelectorAll('link[id^="haven-theme-"]')];
      const current = links.find(l => href(l) === want && l.sheet);
      if (current) {
        document.documentElement.setAttribute('data-theme', 'haven');
        if (persist) { try { localStorage.setItem('haven_theme', 'file:' + file); } catch { /* sin almacenamiento */ } }
        document.querySelectorAll('.theme-btn').forEach(b => b.classList.toggle('active', b.dataset.theme === 'file:' + file));
        return current;
      }
      // Otro tema: los de antes quedan (con otro id, asi Haven no los saca) hasta que cargue el nuevo
      links.forEach((l, i) => { l.id = 'puente-tema-saliendo-' + i; });
      const link = orig.call(this, file, persist, meta);
      const drop = () => links.forEach(l => l.remove());
      if (link) { link.addEventListener('load', drop, { once: true }); link.addEventListener('error', drop, { once: true }); setTimeout(drop, 10000); }
      else drop();
      return link;
    } catch (err) {
      return orig.call(this, file, persist, meta);
    }
  };
})();

// Pantallas tactiles: el perfil de una persona (tocar su nombre o su foto) como
// en la app de Discord: una hoja que sube desde abajo, con el fondo oscuro
// detras. Tocar afuera solo cierra el perfil (antes el toque seguia de largo y
// abria lo que hubiera debajo, por ejemplo los emojis). Se cierra tambien
// deslizandola hacia abajo. Es el perfil de Haven, con su contenido y botones.
(function () {
  'use strict';
  if (!matchMedia('(pointer: coarse)').matches) return;

  function removeBackdrop() { document.getElementById('puente-profile-backdrop')?.remove(); }

  function toSheet(app) {
    const p = document.getElementById('profile-popup');
    if (!p || p.classList.contains('profile-popup-hover') || p.classList.contains('puente-profile-sheet')) return;
    p.classList.add('puente-profile-sheet');
    haptic();
    // El usuario tecnico que representa a la gente de Discord sin vincular: no se le escribe
    if ((p.querySelector('.profile-popup-username') || {}).textContent === '@discord-historial') p.querySelector('.profile-dm-btn')?.remove();
    ['left', 'top', 'right', 'bottom'].forEach(k => p.style.removeProperty(k));
    const handle = document.createElement('div');
    handle.className = 'puente-sheet-handle puente-profile-handle';
    p.insertBefore(handle, p.firstChild);
    if (!document.getElementById('puente-profile-backdrop')) {
      const back = document.createElement('div');
      back.id = 'puente-profile-backdrop';
      // El toque se queda aca: no llega a lo que esta debajo
      const swallow = (e) => { e.preventDefault(); e.stopPropagation(); };
      back.addEventListener('touchstart', swallow, { passive: false });
      back.addEventListener('click', (e) => { swallow(e); app._closeProfilePopup(); });
      back.addEventListener('touchend', (e) => { swallow(e); app._closeProfilePopup(); }, { passive: false });
      document.body.appendChild(back);
    }
    // Deslizar hacia arriba agranda el perfil (hasta casi toda la pantalla);
    // hacia abajo lo baja y, si se baja bastante, se cierra
    sheetDrag(p, { close: () => app._closeProfilePopup() });
  }

  let tries = 0;
  (function wait() {
    const app = window.app;
    if (!app || typeof app._showProfilePopup !== 'function' || typeof app._closeProfilePopup !== 'function') { if (++tries < 120) setTimeout(wait, 500); return; }
    const show = app._showProfilePopup;
    app._showProfilePopup = function (...a) {
      const r = show.apply(this, a);
      try { toSheet(this); } catch (err) { console.warn('[puente] perfil:', err); }
      return r;
    };
    const close = app._closeProfilePopup;
    app._closeProfilePopup = function (...a) { removeBackdrop(); return close.apply(this, a); };
    // Haven reacomoda el perfil cuando cambia el tamano de la ventana: en la hoja no
    const pos = app._positionProfilePopup;
    if (typeof pos === 'function') {
      app._positionProfilePopup = function (popup, ...a) {
        if (popup && popup.classList && popup.classList.contains('puente-profile-sheet')) return;
        return pos.call(this, popup, ...a);
      };
    }
  })();
})();

// Sin la ventanita flotante de mensajes directos: todo lo que la abria (el boton
// "Mensaje" del perfil, la lista de mensajes directos, el menu de un usuario)
// abre la conversacion en pantalla completa, como en Discord. En pantallas
// tactiles, ademas, no aparece el teclado solo al abrirla.
(function () {
  'use strict';
  const touch = matchMedia('(pointer: coarse)').matches;
  let tries = 0;
  (function wait() {
    const app = window.app;
    if (!app || typeof app._openDMPiP !== 'function' || typeof app.switchChannel !== 'function') { if (++tries < 120) setTimeout(wait, 500); return; }
    app._openDMPiP = function (code) {
      try { if (typeof this._closeDMPiP === 'function') this._closeDMPiP(); } catch { /* no habia ventanita */ }
      if (!code || code === this.currentChannel) return;
      this.switchChannel(code);
      try { this._closeMobilePanels?.(); } catch { /* nada */ }
      try { this._closeProfilePopup?.(); } catch { /* nada */ }
      if (touch) {
        // Haven pone el cursor en el cuadro de escribir: sacarlo para que no aparezca el teclado
        const blur = () => { const a = document.activeElement; if (a && (a.tagName === 'TEXTAREA' || a.tagName === 'INPUT')) a.blur(); };
        setTimeout(blur, 50); setTimeout(blur, 400);
      }
    };
  })();
})();

// Cuadro de escribir como en Discord: el texto de ayuda dice "Mensaje #canal" o
// "Mensaje @persona" (Discord: "Message #canal"). Y sin el aviso "Abriendo DM
// con…" al abrir un mensaje directo (la conversacion se abre al instante).
(function () {
  'use strict';
  const MSG_PERM = 'No tenés permiso para enviar mensajes en este canal.';
  let tries = 0;
  (function wait() {
    const app = window.app;
    if (!app || typeof app.switchChannel !== 'function' || typeof app._showToast !== 'function') { if (++tries < 120) setTimeout(wait, 500); return; }

    const toast = app._showToast;
    app._showToast = function (message, ...rest) {
      if (typeof message === 'string' && /^(Abriendo DM con|Opening DM with)\b/i.test(message)) return;
      return toast.call(this, message, ...rest);
    };

    const placeholder = () => {
      const input = document.getElementById('message-input');
      if (!input || input.disabled || input.placeholder === MSG_PERM) return;
      const ch = (app.channels || []).find(c => c && c.code === app.currentChannel);
      if (!ch) return;
      const label = ch.is_dm && !ch.is_group
        ? '@' + ((ch.dm_target && (app._getNickname ? app._getNickname(ch.dm_target.id, ch.dm_target.username) : ch.dm_target.username)) || '')
        : ch.is_group ? (app._groupName ? app._groupName(ch) : ch.name) : '#' + ch.name;
      input.placeholder = 'Mensaje ' + label;
    };
    const orig = app.switchChannel;
    app.switchChannel = function (...a) {
      const r = orig.apply(this, a);
      setTimeout(placeholder, 0); setTimeout(placeholder, 600);
      return r;
    };
    placeholder();
  })();
})();

// Pantallas tactiles: el menu de un usuario (el engranaje del perfil, o
// mantener apretado su nombre) como hoja desde abajo, con el mismo diseño que
// el menu de un mensaje: el nombre arriba, las opciones agrupadas en filas
// grandes y las peligrosas en rojo. "Invitar al canal" se despliega en el
// lugar en vez de abrir otra ventanita al costado. Son las opciones de Haven,
// con sus mismos permisos; solo cambia como se muestran.
(function () {
  'use strict';
  if (!matchMedia('(pointer: coarse)').matches) return;
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text) n.textContent = text; return n; };

  function removeBackdrop() { document.getElementById('puente-user-backdrop')?.remove(); }

  // "👤 Ver perfil" -> icono y texto separados, para alinearlos
  function splitIcon(btn) {
    const first = btn.firstChild;
    if (!first || first.nodeType !== 3) return;
    const m = /^\s*(\S+)\s+([\s\S]*)$/.exec(first.nodeValue);
    if (!m || /[a-z0-9]/i.test(m[1])) return;
    btn.replaceChild(document.createTextNode(m[2]), first);
    btn.insertBefore(el('span', 'puente-sheet-icon', m[1]), btn.firstChild);
  }

  function toSheet(app, menu) {
    menu.classList.add('puente-user-sheet');
    haptic();
    menu.style.left = ''; menu.style.top = '';
    const kids = [...menu.children];
    menu.textContent = '';
    menu.appendChild(el('div', 'puente-sheet-handle'));
    let group = null;
    const newGroup = () => { group = el('div', 'puente-sheet-group'); menu.appendChild(group); };
    for (const k of kids) {
      if (k.classList.contains('user-ctx-header')) { k.classList.add('puente-user-title'); menu.appendChild(k); continue; }
      if (k.classList.contains('user-ctx-divider')) { group = null; continue; }
      if (!group) newGroup();
      if (k.tagName === 'BUTTON') { splitIcon(k); group.appendChild(k); continue; }
      if (k.classList.contains('user-ctx-submenu-wrapper')) {
        const trigger = k.querySelector('.user-ctx-submenu-trigger');
        const sub = k.querySelector('.user-ctx-submenu');
        if (trigger) {
          splitIcon(trigger);
          trigger.addEventListener('click', (ev) => { ev.stopPropagation(); k.classList.toggle('puente-abierto'); });
        }
        if (sub) sub.removeAttribute('style');
        group.appendChild(k);
        continue;
      }
      group.appendChild(k);
    }
    for (const g of [...menu.querySelectorAll('.puente-sheet-group')]) if (!g.children.length) g.remove();

    if (!document.getElementById('puente-user-backdrop')) {
      const back = el('div');
      back.id = 'puente-user-backdrop';
      back.addEventListener('click', (e) => { e.stopPropagation(); app._hideUserContextMenu(); });
      document.body.appendChild(back);
    }
    // Manija: hacia arriba se agranda, hacia abajo se cierra
    sheetDrag(menu, { close: () => app._hideUserContextMenu() });
  }

  let tries = 0;
  (function wait() {
    const app = window.app;
    if (!app || typeof app._placeUserContextMenu !== 'function' || typeof app._hideUserContextMenu !== 'function') { if (++tries < 120) setTimeout(wait, 500); return; }
    const place = app._placeUserContextMenu;
    app._placeUserContextMenu = function (menu, e, ...rest) {
      const r = place.call(this, menu, e, ...rest);
      try { toSheet(this, menu); } catch (err) { console.warn('[puente] menu de usuario:', err); }
      return r;
    };
    const hide = app._hideUserContextMenu;
    app._hideUserContextMenu = function (...a) { removeBackdrop(); return hide.apply(this, a); };
  })();
})();

// PC: al hacer clic en tu nombre o avatar (abajo a la izquierda) se abre tu
// tarjeta, como en Discord de escritorio: avatar grande, nombre, tu estado
// personalizado, "Editar perfil" y el estado (en linea, ausente, no molestar,
// invisible). Usa las mismas opciones de Haven (el lapiz y el selector de
// estado del puntito verde, que quedan ocultos).
(function () {
  'use strict';
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text) n.textContent = text; return n; };
  const STATES = [['online', 'En línea'], ['away', 'Ausente'], ['dnd', 'No molestar'], ['invisible', 'Invisible']];
  const pc = () => window.innerWidth > 768;

  function close() {
    document.getElementById('puente-yo')?.remove();
    document.removeEventListener('mousedown', outside, true);
    document.removeEventListener('keydown', onKey, true);
  }
  function outside(e) {
    const card = document.getElementById('puente-yo');
    // (el clic en tu nombre o avatar ya lo abre o lo cierra)
    if (card && !card.contains(e.target) && !(e.target instanceof Element && e.target.closest('[data-haven-region="account"] .user-names, .puente-account-avatar'))) close();
  }
  function onKey(e) { if (e.key === 'Escape') close(); }

  function setStatus(status) {
    const opt = document.querySelector('#status-picker .status-option[data-status="' + status + '"]');
    if (opt) opt.click();
  }
  function setText(text) {
    const input = document.getElementById('status-text-input');
    if (!input) return;
    input.value = text;
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    const picker = document.getElementById('status-picker');
    if (picker) picker.style.display = 'none';
  }

  function open(app, account) {
    close();
    const card = el('div', 'puente-yo');
    card.id = 'puente-yo';
    card.appendChild(el('div', 'puente-yo-banner'));

    const av = el('div', 'puente-yo-avatar');
    const img = account.querySelector('.puente-account-avatar img');
    if (img) { const i = el('img'); i.src = img.src; i.alt = ''; av.appendChild(i); }
    else av.textContent = ((document.getElementById('current-user') || {}).textContent || '?').trim().charAt(0).toUpperCase();
    const status = app.userStatus || 'online';
    av.appendChild(el('span', 'puente-yo-dot ' + status));
    card.appendChild(av);

    // Estado personalizado: el globito al lado del avatar
    const bubble = el('button', 'puente-yo-bubble');
    bubble.type = 'button';
    const text = (app.userStatusText || '').trim();
    bubble.textContent = text || '+ Agregar un estado';
    if (!text) bubble.classList.add('vacio');
    bubble.addEventListener('click', () => {
      const input = el('input', 'puente-yo-input');
      input.type = 'text'; input.maxLength = 128; input.value = text; input.placeholder = '¿Qué estás haciendo?';
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); setText(input.value.trim()); close(); }
        if (e.key === 'Escape') { e.stopPropagation(); close(); }
      });
      bubble.replaceWith(input);
      input.focus();
    });
    card.appendChild(bubble);

    card.appendChild(el('div', 'puente-yo-name', ((document.getElementById('current-user') || {}).textContent || '').trim()));
    card.appendChild(el('div', 'puente-yo-login', ((document.getElementById('login-name') || {}).textContent || '').trim().replace(/^@/, '')));

    const box = el('div', 'puente-yo-box');
    const edit = el('button', 'puente-yo-item');
    edit.type = 'button';
    edit.append(el('span', 'puente-yo-icon', '✏️'), el('span', 'puente-yo-label', 'Editar perfil'));
    edit.addEventListener('click', () => { close(); document.getElementById('rename-btn')?.click(); });
    box.appendChild(edit);
    // Email para recuperar la contraseña (web/email.js, si el servidor lo tiene)
    if (window.puenteEmail) {
      const mail = el('button', 'puente-yo-item');
      mail.type = 'button';
      mail.append(el('span', 'puente-yo-icon', '✉️'), el('span', 'puente-yo-label', 'Email de recuperación'));
      mail.addEventListener('click', () => { close(); window.puenteEmail.open(); });
      box.appendChild(mail);
    }
    box.appendChild(el('div', 'puente-yo-sep'));

    const cur = STATES.find(s => s[0] === status) || STATES[0];
    const st = el('button', 'puente-yo-item puente-yo-status');
    st.type = 'button';
    st.append(el('span', 'puente-yo-dot-sm ' + cur[0]), el('span', 'puente-yo-label', cur[1]), el('span', 'puente-yo-arrow', '›'));
    const sub = el('div', 'puente-yo-sub');
    for (const [code, label] of STATES) {
      const b = el('button', 'puente-yo-item' + (code === status ? ' actual' : ''));
      b.type = 'button';
      b.append(el('span', 'puente-yo-dot-sm ' + code), el('span', 'puente-yo-label', label));
      b.addEventListener('click', () => { setStatus(code); close(); });
      sub.appendChild(b);
    }
    const wrap = el('div', 'puente-yo-status-wrap');
    wrap.append(st, sub);
    st.addEventListener('click', () => wrap.classList.toggle('abierto'));
    box.appendChild(wrap);
    card.appendChild(box);

    document.body.appendChild(card);
    const r = account.getBoundingClientRect();
    card.style.left = Math.max(8, r.left) + 'px';
    card.style.bottom = Math.max(8, window.innerHeight - r.top + 8) + 'px';
    setTimeout(() => {
      document.addEventListener('mousedown', outside, true);
      document.addEventListener('keydown', onKey, true);
    }, 0);
  }

  let tries = 0;
  (function wait() {
    const account = document.querySelector('[data-haven-region="account"]');
    if (!window.app || !account) { if (++tries < 120) setTimeout(wait, 500); return; }
    account.addEventListener('click', (e) => {
      // (window.app se lee al tocar: al cargar puede ser todavia el elemento #app de la pagina, no Haven)
      const app = window.app;
      if (!app || !(e.target instanceof Element) || !e.target.closest('.user-names, .puente-account-avatar')) return;
      // En el celular: tu perfil (con Tu historia, tus medallas, Editar perfil e Invitar gente), como dice la bienvenida
      if (!pc()) {
        const id = app.user && app.user.id;
        if (!id || !app.socket) return;
        e.stopPropagation();
        app._isHoverPopup = false; app._hoverTarget = null; app._profilePopupAnchor = account.querySelector('.puente-account-avatar') || account;
        app.socket.emit('get-user-profile', { userId: id });
        return;
      }
      e.stopPropagation();
      if (document.getElementById('puente-yo')) close(); else open(app, account);
    });
    window.addEventListener('resize', close);
  })();
})();

// Sin parpadeo al volver a la ventana: si estabas al final del chat, Haven pide
// otra vez los ultimos mensajes del canal y vuelve a dibujar todo desde cero
// (por eso el chat "pestañea", aunque no haya cambiado nada). Si llegan
// exactamente los mismos mensajes que ya estan en pantalla, se deja como esta.
// Si cambio algo (un mensaje nuevo, una edicion, una reaccion), se vuelve a
// dibujar, pero reusando los mensajes que no cambiaron (con sus imagenes ya
// cargadas): asi la altura del chat no salta y no se ve el parpadeo. Pasa sobre
// todo en el celular, donde al volver despues de un rato Haven se reconecta y
// casi siempre llegaron mensajes nuevos mientras tanto.
(function () {
  'use strict';
  let tries = 0;
  (function wait() {
    const app = window.app;
    if (!app || typeof app._renderMessages !== 'function' || typeof app._createMessageEl !== 'function') { if (++tries < 120) setTimeout(wait, 500); return; }
    const orig = app._renderMessages;
    let last = null; // { code, sig, read, first }
    let reuse = null; // id de mensaje -> elemento que ya estaba en pantalla
    // Cada mensaje recuerda como lo armo Haven; si al redibujar sale igual, se
    // usa el que ya estaba
    const create = app._createMessageEl;
    // Un mensaje que llega en vivo se compara con el anterior que esta en pantalla,
    // pero Haven solo lee de ese elemento el usuario y la hora: sin saber que
    // tambien vino de Discord ni de quien, nunca los agrupa (en Discord si, y al
    // recargar tambien). Se le completa lo que falta con los datos de ese mensaje.
    const KEYS = ['type', 'is_webhook', 'webhook_username', 'imported_from'];
    const pick = m => { const o = {}; for (const k of KEYS) o[k] = m[k] == null ? null : m[k]; return o; };
    app._createMessageEl = function (msg, prev, ...more) {
      try {
        if (prev && prev.id == null && msg && msg.imported_from) {
          const box = document.getElementById('messages');
          const lastEl = box && box.lastElementChild;
          if (lastEl && lastEl.dataset && String(lastEl.dataset.msgId) !== String(msg.id)) {
            let info = lastEl.__puenteMsg;
            if (!info) {
              const id = parseInt(lastEl.dataset.msgId, 10);
              const m = (this._lastRenderedMessages || []).find(x => x && x.id === id);
              if (m) info = pick(m);
            }
            if (info) prev = Object.assign({}, prev, info);
          }
        }
      } catch { /* como lo hace Haven */ }
      const el = create.call(this, msg, prev, ...more);
      try {
        if (!el || el.nodeType !== 1) return el;
        if (msg) el.__puenteMsg = pick(msg);
        const src = el.outerHTML;
        if (reuse && msg && msg.id != null) {
          const old = reuse.get(String(msg.id));
          if (old && old.__puenteSrc === src) { reuse.delete(String(msg.id)); return old; }
        }
        el.__puenteSrc = src;
      } catch { /* se usa el nuevo */ }
      return el;
    };
    app._renderMessages = function (messages, lastReadMessageId, ...rest) {
      const container = document.getElementById('messages');
      let sig = null;
      try { sig = Array.isArray(messages) ? JSON.stringify(messages) : null; } catch { sig = null; }
      // La marca de "mensajes nuevos" tampoco cambiaria: misma ultima lectura, o
      // ya leiste todo y no hay marca en pantalla
      const newest = Array.isArray(messages) && messages.length ? messages[messages.length - 1].id : null;
      const sameDivider = () => (last && last.read === lastReadMessageId) ||
        (!document.getElementById('new-messages-divider') && (!lastReadMessageId || (newest !== null && lastReadMessageId >= newest)));
      try {
        if (sig && last && messages !== this._lastRenderedMessages && !this._jumpTargetId &&
            last.code === this.currentChannel && last.sig === sig && sameDivider() &&
            container && container.firstChild && container.firstChild === last.first) {
          this._lastRenderedMessages = messages;
          this._lastRenderedReadId = lastReadMessageId;
          return;
        }
      } catch { /* ante la duda, dibujar */ }
      // Mismo canal: los mensajes que ya estan en pantalla se pueden reusar
      if (container && last && last.code === this.currentChannel && !this._jumpTargetId) {
        reuse = new Map();
        for (const el of container.querySelectorAll(':scope > [data-msg-id]')) if (el.__puenteSrc) reuse.set(el.dataset.msgId, el);
      }
      let r;
      try { r = orig.call(this, messages, lastReadMessageId, ...rest); } finally { reuse = null; }
      last = sig && container ? { code: this.currentChannel, sig, read: lastReadMessageId, first: container.firstChild } : null;
      return r;
    };
  })();
})();

// PC: el perfil de una persona como la tarjeta de Discord de escritorio. Arriba
// a la derecha del banner un boton ⋯ que abre el menu de opciones al lado de la
// tarjeta (sin cerrarla), y abajo un cuadro "Mensaje @nombre": escribis, Enter,
// y se abre la conversacion con el mensaje enviado. Las opciones del menu son
// las de Haven, con sus mismos permisos; solo cambia como se ven.
(function () {
  'use strict';
  if (matchMedia('(pointer: coarse)').matches) return;
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text) n.textContent = text; return n; };
  const pc = () => window.innerWidth > 768;

  // "👤 Ver perfil" -> "Ver perfil" (Discord no pone iconos a la izquierda)
  function dropIcon(btn) {
    const first = btn.firstChild;
    if (!first || first.nodeType !== 3) return;
    const m = /^\s*(\S+)\s+([\s\S]*)$/.exec(first.nodeValue);
    if (m && !/[a-z0-9áéíóúñ]/i.test(m[1])) first.nodeValue = m[2];
  }

  // Mandar el mensaje cuando se abra la conversacion con esa persona
  function sendWhenOpen(app, userId, text) {
    const t0 = Date.now();
    (function check() {
      const ch = (app.channels || []).find(c => c && c.code === app.currentChannel);
      const input = document.getElementById('message-input');
      if (ch && ch.is_dm && ch.dm_target && ch.dm_target.id === userId && input && !input.disabled) {
        input.value = text;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        document.getElementById('send-btn')?.click();
        return;
      }
      if (Date.now() - t0 < 5000) setTimeout(check, 150);
      else if (input && !input.value) { input.value = text; input.focus(); } // no se pudo mandar solo: queda escrito
    })();
  }

  function openMenu(app, popup, btn, profile) {
    const keep = app._closeProfilePopup;
    app._closeProfilePopup = function () {}; // el menu de Haven cierra la tarjeta al abrirse: aca no
    try {
      const pr = popup.getBoundingClientRect(), br = btn.getBoundingClientRect();
      app._showUserContextMenu({ clientX: pr.right + 8, clientY: br.top, target: btn, preventDefault() {}, stopPropagation() {} }, profile.id, profile.username);
    } finally { app._closeProfilePopup = keep; }
    const menu = document.getElementById('user-context-menu');
    if (!menu) return;
    menu.classList.add('puente-pc-menu');
    // Si no entra a la derecha de la tarjeta, a la izquierda
    const mr = menu.getBoundingClientRect(), pr = popup.getBoundingClientRect();
    if (mr.left < pr.right) menu.style.left = Math.max(8, pr.left - mr.width - 8) + 'px';
  }

  // Que la tarjeta nunca quede cortada: Haven la ubica y la mide antes de que le
  // agreguemos la cajita de mensaje (y antes de que carguen las imagenes), asi que
  // despues puede pasarse del borde de abajo. Se sube lo que haga falta; si es mas
  // alta que la ventana, se desplaza por dentro.
  const watched = new WeakSet();
  function keepInView(popup) {
    if (!popup || !popup.isConnected || popup.classList.contains('puente-profile-sheet')) return;
    const M = 8, max = window.innerHeight - 2 * M;
    if (popup.scrollHeight > max) { popup.style.maxHeight = max + 'px'; popup.style.overflowY = 'auto'; }
    // Medidas sin la animacion de abrir (empieza al 95% y crece): offsetTop/offsetHeight
    const top = popup.offsetTop, h = popup.offsetHeight;
    if (top + h > window.innerHeight - M) popup.style.top = Math.max(M, window.innerHeight - M - h) + 'px';
    else if (top < M) popup.style.top = M + 'px';
    if (!watched.has(popup) && typeof ResizeObserver === 'function') {
      watched.add(popup);
      new ResizeObserver(() => keepInView(popup)).observe(popup);
    }
  }

  function decorate(app, popup, profile) {
    if (!popup || popup.classList.contains('profile-popup-hover') || popup.classList.contains('puente-pc-card')) return;
    popup.classList.add('puente-pc-card');
    const isSelf = app.user && profile.id === app.user.id;
    const banner = popup.querySelector('.profile-popup-banner');
    if (!isSelf && banner) {
      const tools = el('div', 'puente-card-tools');
      const more = el('button', 'puente-card-more');
      more.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="5" cy="12" r="2.2" fill="currentColor"/><circle cx="12" cy="12" r="2.2" fill="currentColor"/><circle cx="19" cy="12" r="2.2" fill="currentColor"/></svg>';
      more.type = 'button';
      more.title = 'Más opciones';
      // Un segundo clic lo cierra (Haven ya cierra el menu al empezar el clic)
      let wasOpen = false;
      more.addEventListener('mousedown', () => { wasOpen = !!document.getElementById('user-context-menu'); });
      more.addEventListener('click', (e) => {
        e.stopPropagation();
        if (wasOpen) { app._hideUserContextMenu(); wasOpen = false; return; }
        openMenu(app, popup, more, profile);
      });
      tools.appendChild(more);
      banner.appendChild(tools);
    }
    if (!isSelf && profile.username !== 'discord-historial') {
      const box = el('div', 'puente-card-msg');
      const input = el('input');
      input.type = 'text';
      input.maxLength = 2000;
      input.placeholder = 'Mensaje @' + (profile.displayName || profile.username);
      input.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' || e.shiftKey) return;
        e.preventDefault();
        const text = input.value.trim();
        const dmBtn = popup.querySelector('.profile-dm-btn');
        if (!dmBtn) return;
        dmBtn.click(); // abre la conversacion (y cierra la tarjeta)
        if (text) sendWhenOpen(app, profile.id, text);
      });
      box.appendChild(input);
      (popup.querySelector('.profile-popup-body') || popup).appendChild(box);
    }
  }

  let tries = 0;
  (function wait() {
    const app = window.app;
    if (!app || typeof app._showProfilePopup !== 'function' || typeof app._showUserContextMenu !== 'function') { if (++tries < 120) setTimeout(wait, 500); return; }
    const show = app._showProfilePopup;
    app._showProfilePopup = function (profile, ...rest) {
      const r = show.call(this, profile, ...rest);
      try { if (pc() && profile) decorate(this, document.getElementById('profile-popup'), profile); } catch (err) { console.warn('[puente] tarjeta:', err); }
      try { if (pc()) keepInView(document.getElementById('profile-popup')); } catch { /* queda donde la puso Haven */ }
      return r;
    };
    // Una tarjeta de vista previa (pasando el mouse) que pasa a ser la de verdad
    const promote = app._promoteHoverPopup;
    if (typeof promote === 'function') {
      app._promoteHoverPopup = function (popup, ...rest) {
        const r = promote.call(this, popup, ...rest);
        try {
          const id = this._openProfileUserId;
          if (pc() && popup && id != null) {
            const name = ((popup.querySelector('.profile-popup-username') || {}).textContent || '').replace(/^@/, '');
            const display = ((popup.querySelector('.profile-popup-displayname') || {}).textContent || '').trim();
            decorate(this, popup, { id, username: name, displayName: display });
            keepInView(popup);
          }
        } catch (err) { console.warn('[puente] tarjeta:', err); }
        return r;
      };
    }
    // El menu de opciones con el aspecto de Discord (tambien con clic derecho)
    const place = app._placeUserContextMenu;
    app._placeUserContextMenu = function (menu, e, ...rest) {
      if (pc() && menu) {
        menu.classList.add('puente-pc-menu');
        for (const b of menu.querySelectorAll('button')) dropIcon(b);
      }
      return place.call(this, menu, e, ...rest);
    };
  })();
})();

// PC: editar un canal como en Discord de escritorio. Al pasar el mouse por un
// canal aparece un engranaje ("Editar canal") que abre los ajustes en pantalla
// completa: a la izquierda las secciones (Informacion general, Funciones,
// Permisos, Integraciones y Eliminar canal) y a la derecha la seccion elegida,
// con la barra de "cambios sin guardar" abajo. Todo usa las mismas acciones de
// Haven y muestra solo lo que Haven te deja hacer en ese canal. El clic derecho
// sigue abriendo el menu del canal, ahora donde esta el mouse y con el aspecto
// de Discord.
(function () {
  'use strict';
  if (matchMedia('(pointer: coarse)').matches) return;
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const pc = () => window.innerWidth > 768;
  const GEAR = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M19.4 13a7.6 7.6 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.4 7.4 0 0 0-1.7-1L14.9 3h-4l-.4 2.9a7.4 7.4 0 0 0-1.7 1l-2.5-1-2 3.5L6.4 11a7.6 7.6 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1a7.4 7.4 0 0 0 1.7 1l.4 2.9h4l.4-2.9a7.4 7.4 0 0 0 1.7-1l2.5 1 2-3.5L19.4 13ZM12.9 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Z"/></svg>';
  const SLOW = [[0, 'Desactivado'], [5, '5 s'], [10, '10 s'], [15, '15 s'], [30, '30 s'], [60, '1 min'], [120, '2 min'], [300, '5 min'], [600, '10 min'], [900, '15 min'], [1800, '30 min'], [3600, '1 h']];

  let page = null; // { code, root, section, base, fields }

  const findCh = (app, code) => (app.channels || []).find(c => c && c.code === code);

  // Lo que Haven te deja hacer en este canal: se arma su menu (sin mostrarlo) y
  // se mira que opciones quedaron visibles
  function permsFor(app, code, anchor) {
    const menu = document.getElementById('channel-ctx-menu');
    const out = { rename: false, functions: false, roles: false, webhooks: false, delete: false };
    if (!menu || typeof app._openChannelCtxMenu !== 'function') return out;
    const vis = menu.style.visibility;
    menu.style.visibility = 'hidden';
    try {
      app._openChannelCtxMenu(code, anchor);
      const shown = (a) => { const b = menu.querySelector('[data-action="' + a + '"]'); return !!b && b.style.display !== 'none' && getComputedStyle(b).display !== 'none'; };
      out.rename = shown('rename-channel');
      out.functions = shown('channel-functions');
      out.roles = shown('channel-roles');
      out.webhooks = shown('webhooks');
      out.delete = shown('delete');
    } catch (err) { console.warn('[puente] permisos del canal:', err); }
    try { app._closeChannelCtxMenu(); } catch { /* nada */ }
    menu.style.visibility = vis;
    out.topic = !!(app.user && (app.user.isAdmin || (app._hasPerm && app._hasPerm('set_channel_topic'))));
    return out;
  }

  function categoryOf(item) {
    let n = item;
    while (n) {
      n = n.previousElementSibling || (n.parentElement && n.parentElement.id !== 'channel-list' ? n.parentElement : null);
      if (n && n.classList && n.classList.contains('category-label')) return n.textContent.replace(/[▾▸▼▶⌄]/g, '').trim();
    }
    return '';
  }

  // ── El panel de Funciones de Haven, prestado dentro de la pagina ──
  let panelHome = null;
  function borrowPanel(app, host, ch) {
    const panel = document.getElementById('channel-functions-panel');
    if (!panel) return false;
    if (!panelHome) panelHome = { parent: panel.parentNode, next: panel.nextSibling };
    app._ctxMenuChannel = ch.code;
    try { app._updateChannelFunctionsPanel(ch); } catch { /* nada */ }
    panel.classList.add('puente-ajustes-panel');
    panel.style.left = ''; panel.style.top = '';
    panel.style.display = 'block';
    host.appendChild(panel);
    return true;
  }
  function returnPanel() {
    const panel = document.getElementById('channel-functions-panel');
    if (!panel || !panelHome) return;
    panel.classList.remove('puente-ajustes-panel');
    panel.style.display = 'none';
    if (panelHome.parent && panelHome.parent.isConnected) panelHome.parent.insertBefore(panel, panelHome.next && panelHome.next.parentNode === panelHome.parent ? panelHome.next : null);
  }

  function close(force) {
    if (!page) return;
    if (!force && page.dirty && page.dirty()) { page.shake(); return; }
    returnPanel();
    clearInterval(page.timer);
    page.root.remove();
    document.removeEventListener('keydown', onKey, true);
    const app = window.app;
    if (app) app._ctxMenuChannel = null;
    page = null;
  }
  function modalOpen() {
    return [...document.querySelectorAll('.modal-overlay, .modal')].some(m => !page.root.contains(m) && m.getClientRects().length > 0 && getComputedStyle(m).visibility !== 'hidden');
  }
  function onKey(e) {
    if (e.key !== 'Escape' || !page || modalOpen()) return;
    e.stopPropagation();
    close(false);
  }

  function overview(app, ch, perms, content, bar) {
    content.appendChild(el('h2', 'pa-title', 'Información general'));
    const base = { name: ch.name || '', topic: ch.topic || '', slow: ch.slow_mode_interval || 0, nsfw: ch.is_nsfw ? 1 : 0 };
    const f = {};
    const field = (label) => { const w = el('div', 'pa-field'); w.appendChild(el('label', 'pa-label', label)); content.appendChild(w); return w; };
    if (perms.rename) {
      const w = field('Nombre del canal');
      f.name = el('input', 'pa-input'); f.name.type = 'text'; f.name.maxLength = 100; f.name.value = base.name;
      w.appendChild(f.name);
    }
    if (perms.topic) {
      const w = field('Tema del canal');
      const box = el('div', 'pa-textarea-wrap');
      f.topic = el('textarea', 'pa-textarea'); f.topic.maxLength = 256; f.topic.value = base.topic;
      f.topic.placeholder = 'Contale a la gente de qué se trata este canal';
      const left = el('span', 'pa-count');
      const upd = () => { left.textContent = String(256 - f.topic.value.length); };
      f.topic.addEventListener('input', upd); upd();
      box.append(f.topic, left);
      w.appendChild(box);
    }
    if (perms.functions) {
      const w = field('Modo lento');
      f.slow = el('select', 'pa-select');
      const opts = SLOW.slice();
      if (!opts.some(o => o[0] === base.slow)) opts.push([base.slow, base.slow + ' s']);
      for (const [v, t] of opts) { const o = el('option', null, t); o.value = String(v); if (v === base.slow) o.selected = true; f.slow.appendChild(o); }
      w.appendChild(f.slow);
      w.appendChild(el('div', 'pa-help', 'Cada persona solo puede mandar un mensaje cada tanto tiempo en este canal.'));

      const v = field('Visibilidad del contenido');
      const radio = (value, title, desc) => {
        const r = el('label', 'pa-radio');
        const i = el('input'); i.type = 'radio'; i.name = 'puente-nsfw'; i.value = String(value); i.checked = base.nsfw === value;
        const txt = el('span', 'pa-radio-text'); txt.append(el('span', 'pa-radio-title', title), el('span', 'pa-radio-desc', desc));
        r.append(i, txt);
        v.appendChild(r);
        return i;
      };
      f.nsfw0 = radio(0, 'Normal', 'El contenido del canal siempre se ve.');
      f.nsfw1 = radio(1, 'Para mayores de edad', 'Hay que confirmar ser mayor de edad para ver el contenido de este canal.');
    }
    if (!Object.keys(f).length) content.appendChild(el('div', 'pa-help', 'No tenés permiso para cambiar estos datos de este canal.'));

    const now = () => ({
      name: f.name ? f.name.value.trim() : base.name,
      topic: f.topic ? f.topic.value : base.topic,
      slow: f.slow ? parseInt(f.slow.value, 10) || 0 : base.slow,
      nsfw: f.nsfw1 ? (f.nsfw1.checked ? 1 : 0) : base.nsfw,
    });
    const dirty = () => { const n = now(); return n.name !== base.name || n.topic !== base.topic || n.slow !== base.slow || n.nsfw !== base.nsfw; };
    const refresh = () => bar.classList.toggle('visible', dirty());
    content.addEventListener('input', refresh);
    content.addEventListener('change', refresh);
    page.dirty = dirty;
    page.reset = () => {
      if (f.name) f.name.value = base.name;
      if (f.topic) { f.topic.value = base.topic; f.topic.dispatchEvent(new Event('input')); }
      if (f.slow) f.slow.value = String(base.slow);
      if (f.nsfw0) { f.nsfw0.checked = base.nsfw === 0; f.nsfw1.checked = base.nsfw === 1; }
      refresh();
    };
    page.save = () => {
      const n = now();
      const s = app.socket;
      if (!s) return;
      if (n.name && n.name !== base.name) s.emit('rename-channel', { code: ch.code, name: n.name });
      if (n.topic !== base.topic) s.emit('set-channel-topic', { code: ch.code, topic: n.topic.slice(0, 256) });
      if (n.slow !== base.slow) s.emit('set-slow-mode', { code: ch.code, interval: n.slow });
      if (n.nsfw !== base.nsfw) s.emit('toggle-channel-permission', { code: ch.code, permission: 'nsfw' });
      Object.assign(base, n);
      if (n.name) page.head.firstChild.textContent = '# ' + n.name;
      refresh();
    };
  }

  function open(app, code, item) {
    close(true);
    const ch = findCh(app, code);
    if (!ch) return;
    const perms = permsFor(app, code, item.querySelector('.channel-more-btn') || item);
    if (!perms.rename && !perms.topic && !perms.functions && !perms.roles && !perms.webhooks && !perms.delete) return;

    const root = el('div', 'puente-ajustes');
    root.id = 'puente-ajustes';
    const nav = el('nav', 'pa-nav');
    const navIn = el('div', 'pa-nav-in');
    const head = el('div', 'pa-head');
    head.append(el('span', null, '# ' + ch.name), el('span', 'pa-head-cat', categoryOf(item)));
    navIn.appendChild(head);
    nav.appendChild(navIn);
    const main = el('main', 'pa-main');
    const content = el('div', 'pa-content');
    const x = el('button', 'pa-close');
    x.type = 'button';
    x.innerHTML = '<span class="pa-close-x">✕</span><span class="pa-close-esc">ESC</span>';
    x.addEventListener('click', () => close(false));
    const col = el('div', 'pa-col');
    col.appendChild(content);
    main.append(col, x);
    const bar = el('div', 'pa-savebar');
    bar.appendChild(el('span', 'pa-savebar-text', '¡Cuidado! Tenés cambios sin guardar.'));
    const reset = el('button', 'pa-reset', 'Restablecer'); reset.type = 'button';
    const save = el('button', 'pa-save', 'Guardar cambios'); save.type = 'button';
    reset.addEventListener('click', () => page && page.reset && page.reset());
    save.addEventListener('click', () => page && page.save && page.save());
    bar.append(reset, save);
    col.appendChild(bar);
    root.append(nav, main);
    document.body.appendChild(root);

    page = { code, root, head, dirty: null, reset: null, save: null, timer: null };
    page.shake = () => { bar.classList.remove('shake'); void bar.offsetWidth; bar.classList.add('shake'); };

    const items = [];
    const show = (key) => {
      if (page.dirty && page.dirty()) { page.shake(); return; }
      returnPanel();
      content.textContent = '';
      page.dirty = null; page.reset = null; page.save = null;
      bar.classList.remove('visible');
      for (const it of items) it.btn.classList.toggle('active', it.key === key);
      const cur = findCh(app, code) || ch;
      if (key === 'overview') overview(app, cur, perms, content, bar);
      if (key === 'functions') {
        content.appendChild(el('h2', 'pa-title', 'Funciones'));
        content.appendChild(el('div', 'pa-help', 'Qué se puede hacer en este canal. Los cambios se guardan al instante.'));
        const host = el('div', 'pa-panel-host');
        content.appendChild(host);
        if (!borrowPanel(app, host, cur)) content.appendChild(el('div', 'pa-help', 'No se pudieron cargar las funciones.'));
      }
    };
    const addItem = (key, label, onClick, cls) => {
      const b = el('button', 'pa-item' + (cls ? ' ' + cls : ''), label);
      b.type = 'button';
      b.addEventListener('click', onClick || (() => show(key)));
      navIn.appendChild(b);
      items.push({ key, btn: b });
    };
    addItem('overview', 'Información general');
    if (perms.functions) addItem('functions', 'Funciones');
    if (perms.roles) addItem('roles', 'Permisos', () => app._openChannelRolesModal(code));
    if (perms.webhooks) addItem('webhooks', 'Integraciones', () => app._openWebhookModal(code));
    if (perms.delete) {
      navIn.appendChild(el('div', 'pa-sep'));
      addItem('delete', 'Eliminar canal', () => {
        if (page.dirty && page.dirty()) { page.shake(); return; }
        app._ctxMenuChannel = code;
        document.querySelector('#channel-ctx-menu [data-action="delete"]')?.click();
      }, 'pa-danger');
    }
    show('overview');
    // Si se borra el canal (o te sacan el acceso), cerrar
    page.timer = setInterval(() => { if (!findCh(app, code)) close(true); }, 1000);
    document.addEventListener('keydown', onKey, true);
  }

  // Engranaje "Editar canal" en cada canal que podrias administrar
  function mightManage(app, ch) {
    const u = app.user || {};
    const has = (p) => !!(app._hasPerm && app._hasPerm(p));
    return !!(u.isAdmin || ch.canManageSettings || (app._canModerate && app._canModerate()) ||
      has('rename_channel') || has('rename_sub_channel') || has('set_channel_topic') || has('manage_webhooks') || has('delete_channel'));
  }
  function addGears(app) {
    const list = document.getElementById('channel-list');
    if (!list) return;
    for (const item of list.querySelectorAll('.channel-item[data-code]')) {
      if (item.querySelector('.puente-canal-gear') || item.classList.contains('dm-item')) continue;
      const ch = findCh(app, item.dataset.code);
      if (!ch || ch.is_dm || !mightManage(app, ch)) continue;
      const g = el('button', 'puente-canal-gear');
      g.type = 'button';
      g.title = 'Editar canal';
      g.innerHTML = GEAR;
      g.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); if (pc()) open(app, item.dataset.code, item); });
      const more = item.querySelector('.channel-more-btn');
      item.insertBefore(g, more || null);
    }
  }

  // "✅ Marcar como leido" -> "Marcar como leido" (Discord no pone iconos)
  function dropIcons(menu) {
    for (const b of menu.querySelectorAll('.channel-ctx-item')) {
      const first = b.firstChild;
      if (first && first.nodeType === 3) {
        const m = /^\s*(\S+)\s*([\s\S]*)$/.exec(first.nodeValue);
        if (m && !/[a-z0-9áéíóúñ]/i.test(m[1])) first.nodeValue = m[2];
      }
    }
  }

  let tries = 0;
  (function wait() {
    const app = window.app;
    const list = document.getElementById('channel-list');
    if (!app || !list || typeof app._openChannelCtxMenu !== 'function' || typeof app._closeChannelCtxMenu !== 'function') { if (++tries < 120) setTimeout(wait, 500); return; }

    // Mientras la pagina esta abierta, el panel de Funciones sigue apuntando a este canal
    const closeMenu = app._closeChannelCtxMenu;
    app._closeChannelCtxMenu = function (...a) {
      const r = closeMenu.apply(this, a);
      if (page) {
        this._ctxMenuChannel = page.code;
        const panel = document.getElementById('channel-functions-panel');
        if (panel && page.root.contains(panel)) panel.style.display = 'block';
      }
      return r;
    };

    // Clic derecho: el menu donde esta el mouse, con el aspecto de Discord
    let lastRight = null;
    list.addEventListener('contextmenu', (e) => { lastRight = { x: e.clientX, y: e.clientY, t: Date.now() }; }, true);
    const openMenu = app._openChannelCtxMenu;
    app._openChannelCtxMenu = function (code, btn, ...rest) {
      const r = openMenu.call(this, code, btn, ...rest);
      const menu = document.getElementById('channel-ctx-menu');
      if (menu && pc()) {
        menu.classList.add('puente-pc-canal-menu');
        dropIcons(menu);
        if (lastRight && Date.now() - lastRight.t < 300 && menu.style.visibility !== 'hidden') {
          const p = lastRight;
          menu.style.left = p.x + 'px'; menu.style.top = p.y + 'px';
          requestAnimationFrame(() => {
            const mr = menu.getBoundingClientRect();
            if (mr.right > innerWidth - 8) menu.style.left = Math.max(8, innerWidth - mr.width - 8) + 'px';
            if (mr.bottom > innerHeight - 8) menu.style.top = Math.max(8, innerHeight - mr.height - 8) + 'px';
          });
        }
      }
      return r;
    };

    new MutationObserver(() => addGears(app)).observe(list, { childList: true, subtree: true });
    addGears(app);
  })();
})();

// PC: al seleccionar texto en el cuadro de escribir (o al editar un mensaje)
// aparece arriba una barrita para darle formato, como en Discord: negrita,
// cursiva, subrayado, tachado, cita, codigo y spoiler. Pone o saca las marcas
// de formato de Haven (**, *, __, ~~, >, `, ||), asi el mensaje se ve igual en
// Haven y en Discord. (Ctrl+B, Ctrl+I y Ctrl+U ya vienen en Haven.)
(function () {
  'use strict';
  if (matchMedia('(pointer: coarse)').matches) return;
  const el = (tag, cls) => { const n = document.createElement(tag); if (cls) n.className = cls; return n; };
  const ICONS = {
    bold: '<svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M7 4h6.5a4.5 4.5 0 0 1 3.2 7.7A4.5 4.5 0 0 1 14 20H7V4Zm3 3v3.5h3.5a1.75 1.75 0 0 0 0-3.5H10Zm0 6.5V17h4a1.75 1.75 0 0 0 0-3.5h-4Z"/></svg>',
    italic: '<svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M10 4h8v3h-2.8l-3.4 10H15v3H7v-3h2.8l3.4-10H10V4Z"/></svg>',
    underline: '<svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M7 4h3v7a2 2 0 0 0 4 0V4h3v7a5 5 0 0 1-10 0V4Zm-2 15h14v2H5v-2Z"/></svg>',
    strike: '<svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M12 4c2.6 0 4.6 1.2 5.3 3.3l-2.8 1c-.4-1-1.3-1.5-2.5-1.5-1.4 0-2.3.6-2.3 1.5 0 .5.3.9 1 1.2H4v2h16v-2h-3.1c.1.3.1.6.1 1h0c0 .9-.2 1.6-.6 2.3h-3.3c.6-.4.9-.9.9-1.5 0-.5-.2-.8-.6-1.1L8 10.7c-.2-.4-.3-.9-.3-1.4C7.7 6.2 9.4 4 12 4Zm-4.6 11.7 2.8-1c.4 1 1.3 1.5 2.6 1.5 1.1 0 1.9-.3 2.3-.8h3.3c-.6 2.2-2.8 3.6-5.6 3.6-2.6 0-4.6-1.2-5.4-3.3Z"/></svg>',
    quote: '<svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M4 18v-6c0-4 2.3-6.5 6-7l.6 2C8.5 7.6 7.4 9 7.3 11H10v7H4Zm10 0v-6c0-4 2.3-6.5 6-7l.6 2c-2.1.6-3.2 2-3.3 4H20v7h-6Z"/></svg>',
    code: '<svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="m8.6 6.6 1.4 1.4-4 4 4 4-1.4 1.4L3.2 12l5.4-5.4Zm6.8 0L20.8 12l-5.4 5.4-1.4-1.4 4-4-4-4 1.4-1.4Z"/></svg>',
    spoiler: '<svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M12 5c5 0 8.6 3.6 10 7-1.4 3.4-5 7-10 7s-8.6-3.6-10-7c1.4-3.4 5-7 10-7Zm0 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0 2.2a1.8 1.8 0 1 1 0 3.6 1.8 1.8 0 0 1 0-3.6Z"/></svg>',
  };
  const WRAP = { bold: '**', italic: '*', underline: '__', strike: '~~', code: '`', spoiler: '||' };
  const TITLES = { bold: 'Negrita (Ctrl+B)', italic: 'Cursiva (Ctrl+I)', underline: 'Subrayado (Ctrl+U)', strike: 'Tachado', quote: 'Cita', code: 'Código', spoiler: 'Spoiler' };

  let bar = null, target = null;

  const isComposer = (t) => t instanceof HTMLTextAreaElement && (['message-input', 'thread-input', 'dm-pip-input'].includes(t.id) || t.classList.contains('edit-textarea'));
  // El cuadro con emojis dibujados (mas abajo) escribe en el de Haven, que queda invisible
  const resolve = (t) => (t && t.id === 'puente-editor' ? document.getElementById('message-input') : t);
  const onEditor = () => document.activeElement && document.activeElement.id === 'puente-editor';

  // Reemplaza lo seleccionado de forma que Ctrl+Z lo deshaga
  function replaceSelection(ta, text, selStart, selEnd) {
    if (ta.classList.contains('puente-ta-oculto')) {
      ta.setRangeText(text);
      ta.setSelectionRange(selStart, selEnd);
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    ta.focus();
    let ok = false;
    try { ok = document.execCommand('insertText', false, text); } catch { ok = false; }
    if (!ok) { ta.setRangeText(text); ta.dispatchEvent(new Event('input', { bubbles: true })); }
    ta.setSelectionRange(selStart, selEnd);
  }

  function apply(kind, ta) {
    const s = ta.selectionStart, e = ta.selectionEnd, v = ta.value;
    if (kind === 'quote') {
      const ls = v.lastIndexOf('\n', s - 1) + 1;
      const le = v.indexOf('\n', e); const lineEnd = le === -1 ? v.length : le;
      const block = v.slice(ls, lineEnd);
      const lines = block.split('\n');
      const all = lines.every(l => /^> /.test(l));
      const out = lines.map(l => (all ? l.replace(/^> /, '') : '> ' + l)).join('\n');
      ta.setSelectionRange(ls, lineEnd);
      replaceSelection(ta, out, ls, ls + out.length);
      return;
    }
    const m = WRAP[kind];
    const sel = v.slice(s, e);
    // Ya tiene la marca alrededor (afuera o adentro de la seleccion): sacarla
    if (v.slice(s - m.length, s) === m && v.slice(e, e + m.length) === m &&
        !(kind === 'italic' && (v[s - 2] === '*' || v[e + 1] === '*'))) {
      ta.setSelectionRange(s - m.length, e + m.length);
      replaceSelection(ta, sel, s - m.length, e - m.length);
      return;
    }
    if (sel.length >= 2 * m.length && sel.startsWith(m) && sel.endsWith(m) && !(kind === 'italic' && sel.startsWith('**'))) {
      const inner = sel.slice(m.length, sel.length - m.length);
      replaceSelection(ta, inner, s, s + inner.length);
      return;
    }
    replaceSelection(ta, m + sel + m, s + m.length, e + m.length);
  }

  // Posicion en pantalla de un caracter del cuadro (copia invisible del texto)
  function caretXY(ta, index) {
    const cs = getComputedStyle(ta);
    const div = el('div');
    for (const p of ['boxSizing', 'width', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
      'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing', 'lineHeight', 'textTransform', 'wordSpacing', 'textIndent', 'tabSize']) div.style[p] = cs[p];
    div.style.position = 'absolute'; div.style.visibility = 'hidden'; div.style.whiteSpace = 'pre-wrap'; div.style.wordWrap = 'break-word'; div.style.top = '0'; div.style.left = '-9999px';
    div.textContent = ta.value.slice(0, index);
    const span = el('span'); span.textContent = ta.value.slice(index) || '.';
    div.appendChild(span);
    document.body.appendChild(div);
    const r = ta.getBoundingClientRect();
    const x = r.left + span.offsetLeft - ta.scrollLeft;
    const y = r.top + span.offsetTop - ta.scrollTop;
    div.remove();
    return { x, y };
  }

  function hide() { if (bar) bar.style.display = 'none'; target = null; }

  function show(ta) {
    if (!bar) {
      bar = el('div', 'puente-formato');
      bar.id = 'puente-formato';
      const groups = [['bold', 'italic', 'underline', 'strike'], ['quote', 'code'], ['spoiler']];
      groups.forEach((g, i) => {
        if (i) bar.appendChild(el('span', 'puente-formato-sep'));
        for (const k of g) {
          const b = el('button', 'puente-formato-btn');
          b.type = 'button'; b.title = TITLES[k]; b.innerHTML = ICONS[k]; b.dataset.k = k;
          b.addEventListener('mousedown', (ev) => ev.preventDefault()); // que no se pierda la seleccion
          b.addEventListener('click', () => { if (target) { apply(k, target); setTimeout(() => target && place(target), 30); } });
          bar.appendChild(b);
        }
      });
      document.body.appendChild(bar);
    }
    target = ta;
    bar.style.display = 'flex';
    place(ta);
  }

  function place(ta) {
    if (!bar || ta.selectionStart === ta.selectionEnd) { hide(); return; }
    let a, b, r;
    const sel = onEditor() && window.getSelection();
    if (sel && sel.rangeCount) {
      r = document.getElementById('puente-editor').getBoundingClientRect();
      const rr = sel.getRangeAt(0).getBoundingClientRect();
      a = { x: rr.left, y: rr.top }; b = { x: rr.right, y: rr.top };
    } else { a = caretXY(ta, ta.selectionStart); b = caretXY(ta, ta.selectionEnd); r = ta.getBoundingClientRect(); }
    const sameLine = Math.abs(a.y - b.y) < 2;
    let x = sameLine ? (a.x + b.x) / 2 : r.left + r.width / 2;
    const top = Math.max(r.top, Math.min(a.y, b.y));
    const w = bar.offsetWidth, h = bar.offsetHeight;
    x = Math.max(8 + w / 2, Math.min(window.innerWidth - 8 - w / 2, x));
    bar.style.left = (x - w / 2) + 'px';
    bar.style.top = Math.max(8, top - h - 8) + 'px';
  }

  // Como en Discord: mientras se arrastra para seleccionar no aparece; recien al soltar
  let dragging = false;
  document.addEventListener('mousedown', (e) => { if (!(bar && bar.contains(e.target))) dragging = true; }, true);
  window.addEventListener('blur', () => { dragging = false; });
  function check() {
    if (dragging) { hide(); return; }
    const ta = resolve(document.activeElement);
    if (isComposer(ta) && ta.selectionStart !== ta.selectionEnd) show(ta); else hide();
  }

  document.addEventListener('selectionchange', () => { if (bar && bar.style.display !== 'none' || isComposer(resolve(document.activeElement))) setTimeout(check, 0); });
  document.addEventListener('mouseup', () => { dragging = false; setTimeout(check, 0); }, true);
  document.addEventListener('keyup', (e) => { if (e.shiftKey || (e.key || '').startsWith('Arrow') || e.key === 'a') setTimeout(check, 0); }, true);
  document.addEventListener('focusout', () => setTimeout(check, 0), true);
  window.addEventListener('resize', hide);
  document.addEventListener('scroll', () => { if (target) place(target); }, true);

  // Ctrl+B, Ctrl+I y Ctrl+U ya los maneja Haven (_handleMarkdownShortcuts)
})();

// PC: los emojis del servidor (:nombre:) se ven como imagen mientras escribis,
// como en Discord. El cuadro de escribir de Haven (#message-input) sigue siendo
// el que manda: queda invisible debajo, con el mismo texto y la misma seleccion,
// y todo lo de Haven sigue enganchado a el (enviar con Enter, @menciones,
// :emojis:, #canales, /comandos, listas, Ctrl+B/I/U, pegar imagenes, "esta
// escribiendo", editar el ultimo mensaje con la flecha). Encima va un cuadro
// que muestra el mismo texto con los emojis dibujados y le pasa cada tecla al
// de Haven. Si algo no cuadra, el cuadro nuevo se saca solo y queda el de Haven.
// Para apagarlo en un navegador: localStorage puente_editor = 'no'.
(function () {
  'use strict';
  if (matchMedia('(pointer: coarse)').matches) return;
  try { if (localStorage.getItem('puente_editor') === 'no') return; } catch { /* sin almacenamiento */ }
  const NATIVE = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
  const EMOJI_RE = /:([a-zA-Z0-9_-]+):/g;
  const STYLE_PROPS = ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'color', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'backgroundColor', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'borderTopStyle', 'borderRightStyle', 'borderBottomStyle', 'borderLeftStyle',
    'borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor', 'borderRadius', 'boxSizing', 'textAlign',
    'flexGrow', 'flexShrink', 'flexBasis', 'alignSelf', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft', 'order'];

  let app = null, ta = null, ed = null, alive = false;
  let busy = false;          // el cambio lo hizo el cuadro nuevo: no redibujar
  let composing = false;     // escribiendo con acentos o un teclado de otro idioma
  let lastValue = '';
  let inputPending = false;  // a Haven le falta el aviso de que cambio el texto
  const flushInput = () => { if (!inputPending) return; inputPending = false; busy = true; try { ta.dispatchEvent(new Event('input', { bubbles: true })); } finally { busy = false; } if (getVal() !== lastValue) toEditor(); };
  let pending = false;       // Haven cambio el texto y falta mostrarlo: no pisarle el cursor
  const scheduleToEditor = () => { pending = true; setTimeout(() => { pending = false; toEditor(); }, 0); };
  const undo = [], redo = [];
  let undoTimer = null;

  const findEmoji = (name) => { try { return app && typeof app._findNamedEmoji === 'function' ? app._findNamedEmoji(name) : null; } catch { return null; } };
  const getVal = () => NATIVE.get.call(ta);
  const setVal = (v) => NATIVE.set.call(ta, v);

  // ── Texto <-> cuadro nuevo ─────────────────────────────
  // Arma lo que se ve a partir del texto, sin cambiar ni un caracter: los
  // emojis del servidor como imagen, el formato de Haven aplicado (negrita,
  // cursiva, subrayado, tachado, codigo, spoiler, cita) con sus marcas en gris, y
  // @everyone, @here, las @menciones y los #canales resaltados, como en Discord.
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const attr = (s) => esc(s).replace(/"/g, '&quot;');
  const RULES = [
    { re: /`([^`\n]+)`/, cls: 'code', m: '`' },
    { re: /\|\|([^\n]+?)\|\|/, cls: 'spoiler', m: '||' },
    { re: /\*\*([^\n]+?)\*\*/, cls: 'bold', m: '**' },
    { re: /__([^\n]+?)__/, cls: 'underline', m: '__' },
    { re: /~~([^\n]+?)~~/, cls: 'strike', m: '~~' },
    { re: /(?<!\*)\*(?![\s*])([^\n*]+?)(?<![\s*])\*(?!\*)/, cls: 'italic', m: '*' },
  ];
  function leaf(t) {
    let out = '', last = 0;
    t.replace(EMOJI_RE, (m, name, at) => {
      const em = findEmoji(name);
      if (!em || !em.url) return m;
      out += esc(t.slice(last, at));
      out += '<img class="puente-ed-emoji" src="' + attr(em.url) + '" alt="' + attr(m) + '" data-t="' + attr(m) + '" draggable="false">';
      last = at + m.length;
      return m;
    });
    return out + esc(t.slice(last));
  }
  let knownCache = null, knownKey = null;
  function known() {
    const key = [app.channelMembers, app.channelMembers && app.channelMembers.length, app.channels, app.channels && app.channels.length];
    if (knownCache && knownKey && key.every((k, i) => k === knownKey[i])) return knownCache;
    knownKey = key;
    const users = new Set(), chans = new Set();
    try { for (const m of (app.channelMembers || [])) if (m && m.username) users.add(String(m.username).toLowerCase()); } catch { /* sin lista */ }
    try { for (const c of (app.channels || [])) if (c && !c.is_dm && c.name) chans.add(String(c.name).toLowerCase()); } catch { /* sin lista */ }
    knownCache = { users, chans };
    return knownCache;
  }
  let names = null;
  function mentions(t) {
    if (!names) names = known();
    let out = '', last = 0;
    t.replace(/(^|[^\w@#&])([@#])([\p{L}\p{N}_.-]{1,50})/gu, (full, pre, sym, name, at) => {
      const low = name.toLowerCase();
      const ok = sym === '@' ? (low === 'everyone' || low === 'here' || names.users.has(low)) : names.chans.has(low);
      if (!ok) return full;
      const start = at + pre.length;
      out += leaf(t.slice(last, start)) + '<span class="ped-mention">' + leaf(sym + name) + '</span>';
      last = start + 1 + name.length;
      return full;
    });
    return out + leaf(t.slice(last));
  }
  function fmt(t) {
    let best = null;
    for (const r of RULES) { const x = r.re.exec(t); if (x && (!best || x.index < best.x.index)) best = { r, x }; }
    if (!best) return mentions(t);
    const { r, x } = best;
    const mk = '<span class="ped-mk">' + esc(r.m) + '</span>';
    const inner = r.cls === 'code' ? esc(x[1]) : fmt(x[1]);
    return mentions(t.slice(0, x.index)) + '<span class="ped-' + r.cls + '">' + mk + '<span class="ped-in">' + inner + '</span>' + mk + '</span>' + fmt(t.slice(x.index + x[0].length));
  }
  function markup(value) {
    names = null;
    const html = value.split('\n').map(line => {
      const q = /^> /.exec(line);
      return q ? '<span class="ped-quote"><span class="ped-mk">&gt; </span>' + fmt(line.slice(2)) + '</span>' : fmt(line);
    }).join('<br>');
    return value.endsWith('\n') ? html + '<br data-fin="1">' : html;
  }
  function render(value, s, e) {
    ed.innerHTML = markup(value);
    ed.classList.toggle('puente-ed-vacio', value === '');
    if (s != null && document.activeElement === ed) setSel(s, e == null ? s : e);
  }

  // Recorre el cuadro nuevo en orden y arma el texto (y, si se pide, el indice de un punto)
  function walk(stopNode, stopOffset) {
    let out = '', found = null;
    const visit = (node, isFirstBlock) => {
      for (let i = 0; i < node.childNodes.length; i++) {
        if (node === stopNode && i === stopOffset && found === null) found = out.length;
        const c = node.childNodes[i];
        if (c.nodeType === 3) {
          if (c === stopNode && found === null) found = out.length + Math.min(stopOffset, c.nodeValue.length);
          out += c.nodeValue.replace(/​/g, '');
        } else if (c.nodeName === 'BR') {
          // El ultimo <br> que deja el navegador para que se vea el renglon (al borrar todo, o la
          // ultima letra de una linea) no es un Enter: el nuestro lleva data-fin
          if (!c.dataset.fin && c !== ed.lastChild) out += '\n';
        } else if (c.nodeName === 'IMG') {
          out += c.dataset.t || c.alt || '';
        } else if (c.nodeType === 1) {
          const block = /^(DIV|P)$/.test(c.nodeName);
          if (block && out.length && !out.endsWith('\n')) out += '\n';
          visit(c, false);
        }
      }
      if (node === stopNode && stopOffset >= node.childNodes.length && found === null) found = out.length;
    };
    visit(ed, true);
    return { text: out, index: found };
  }
  const serialize = () => walk(null, 0).text;

  function getSel() {
    const sel = window.getSelection();
    if (!sel.rangeCount || !ed.contains(sel.anchorNode)) { const n = getVal().length; return { s: n, e: n }; }
    const r = sel.getRangeAt(0);
    const a = walk(r.startContainer, r.startOffset).index, b = walk(r.endContainer, r.endOffset).index;
    return { s: a == null ? 0 : a, e: b == null ? (a || 0) : b };
  }
  // Punto del DOM para un indice del texto
  function pointAt(index) {
    let pos = 0, res = null;
    const visit = (node) => {
      for (let i = 0; i < node.childNodes.length && !res; i++) {
        const c = node.childNodes[i];
        if (c.nodeType === 3) {
          const len = c.nodeValue.length;
          if (index <= pos + len) { res = [c, index - pos]; return; }
          pos += len;
        } else if (c.nodeName === 'BR') {
          if (c.dataset.fin || c === ed.lastChild) continue;
          if (index <= pos) { res = [node, i]; return; }
          pos += 1;
        } else if (c.nodeName === 'IMG') {
          const len = (c.dataset.t || c.alt || '').length;
          if (index <= pos) { res = [node, i]; return; }
          pos += len;
          if (index < pos) { res = [node, i + 1]; return; }
        } else if (c.nodeType === 1) visit(c);
      }
    };
    visit(ed);
    return res || [ed, ed.childNodes.length - (ed.lastChild && ed.lastChild.dataset && ed.lastChild.dataset.fin ? 1 : 0)];
  }
  function setSel(s, e) {
    try {
      const [n1, o1] = pointAt(s), [n2, o2] = pointAt(e);
      const r = document.createRange(); r.setStart(n1, o1); r.setEnd(n2, o2);
      const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
    } catch { /* seleccion fuera de rango */ }
  }

  // Lo que se ve ya no corresponde al texto (un emoji o una marca de formato nuevos, o
  // algo que metio el navegador): hay que redibujar
  const needsRender = (text) => ed.innerHTML !== markup(text);

  // ── Del cuadro nuevo al de Haven ───────────────────────
  function pushUndo(force) {
    const snap = { v: getVal(), s: ta.selectionStart, e: ta.selectionEnd };
    if (undo.length && undo[undo.length - 1].v === snap.v) return;
    if (force) { undo.push(snap); if (undo.length > 200) undo.shift(); redo.length = 0; return; }
    clearTimeout(undoTimer);
    if (!undo.length) undo.push(snap);
    undoTimer = setTimeout(() => { if (!undo.length || undo[undo.length - 1].v !== getVal()) { undo.push({ v: getVal(), s: ta.selectionStart, e: ta.selectionEnd }); if (undo.length > 200) undo.shift(); } }, 600);
    redo.length = 0;
  }

  function fromEditor() {
    if (!alive) return;
    const text = serialize();
    const { s, e } = getSel();
    // Mas largo que el maximo de Haven (2000): como el cuadro de Haven, no entra
    if (ta.maxLength > 0 && text.length > ta.maxLength) { const back = Math.max(0, s - (text.length - lastValue.length)); render(lastValue, back, back); return; }
    const changed = text !== getVal();
    if (changed) pushUndo(false);
    busy = true;
    try {
      if (changed) setVal(text);
      ta.setSelectionRange(s, e);
      lastValue = text;
      if (changed && !inputPending) { inputPending = true; setTimeout(flushInput, 0); }
    } finally { busy = false; }
    if (!composing && needsRender(text)) { render(text, s, e); check(text); }
    ed.classList.toggle('puente-ed-vacio', text === '');
  }

  // ── Del de Haven al cuadro nuevo ───────────────────────
  function toEditor() {
    if (!alive) return;
    const v = getVal();
    lastValue = v;
    const s = ta.selectionStart, e = ta.selectionEnd;
    render(v, s, e);
    check(v);
  }

  // Control: lo que muestra el cuadro nuevo tiene que ser exactamente el texto de Haven
  function check(expected) {
    if (composing) return;
    const got = serialize();
    if (got !== expected) {
      render(expected, ta.selectionStart, ta.selectionEnd);
      if (serialize() !== expected) fail('el texto no coincide');
    }
  }

  let selQueued = false;
  function syncSelToTa(now) {
    if (now !== true) { if (!selQueued) { selQueued = true; requestAnimationFrame(() => { selQueued = false; syncSelToTa(true); }); } return; }
    if (!alive || pending || document.activeElement !== ed) return;
    const { s, e } = getSel();
    try { ta.setSelectionRange(s, e); } catch { /* nada */ }
  }

  // ── Teclas: primero las ve Haven ───────────────────────
  function forwardKey(e) {
    syncSelToTa(true);
    flushInput();
    const ev = new KeyboardEvent('keydown', { key: e.key, code: e.code, location: e.location, repeat: e.repeat, isComposing: e.isComposing,
      shiftKey: e.shiftKey, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey, bubbles: false, cancelable: true });
    const before = getVal();
    ta.dispatchEvent(ev);
    return { prevented: ev.defaultPrevented, changed: getVal() !== before };
  }

  function insertAtSel(text) {
    const { s, e } = getSel();
    if (ta.maxLength > 0) text = text.slice(0, Math.max(0, ta.maxLength - (getVal().length - (e - s))));
    if (!text) return;
    pushUndo(true);
    busy = true;
    try {
      ta.setRangeText(text, s, e, 'end');
      lastValue = getVal();
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    } finally { busy = false; }
    render(getVal(), ta.selectionStart, ta.selectionEnd);
    check(getVal());
  }

  function onKeyDown(e) {
    if (!alive) return;
    if (e.isComposing || composing) return;
    const mod = e.ctrlKey || e.metaKey;
    // Deshacer / rehacer propios (el cuadro se redibuja, el del navegador no sirve)
    const tecla = String(e.key || '').toLowerCase();
    if (mod && !e.altKey && (tecla === 'z' || tecla === 'y')) {
      e.preventDefault();
      const back = tecla === 'z' && !e.shiftKey;
      const from = back ? undo : redo, to = back ? redo : undo;
      const cur = { v: getVal(), s: ta.selectionStart, e: ta.selectionEnd };
      let snap = from.pop();
      while (snap && snap.v === cur.v) snap = from.pop();
      if (!snap) return;
      to.push(cur);
      busy = true;
      try { setVal(snap.v); ta.setSelectionRange(snap.s, snap.e); lastValue = snap.v; ta.dispatchEvent(new Event('input', { bubbles: true })); } finally { busy = false; }
      render(snap.v, snap.s, snap.e);
      return;
    }
    const r = forwardKey(e);
    if (r.prevented) {
      e.preventDefault();
      if (r.changed) pushUndo(true);
      // Haven ya actuo (envio, eligio una sugerencia, formato, listas...): mostrar su texto
      scheduleToEditor();
      return;
    }
    if (r.changed) { pushUndo(true); scheduleToEditor(); }
    // Enter que Haven no uso (Shift+Enter): salto de linea, como en el cuadro de Haven
    if (e.key === 'Enter') { e.preventDefault(); insertAtSel('\n'); return; }
    // Tab que Haven no uso: que no salga del cuadro escribiendo nada raro (igual que el de Haven)
  }

  function onPaste(e) {
    if (!alive) return;
    syncSelToTa(true);
    flushInput();
    const before = getVal();
    let ev = null;
    try { ev = new ClipboardEvent('paste', { clipboardData: e.clipboardData, bubbles: false, cancelable: true }); } catch { ev = null; }
    e.preventDefault();
    if (ev && e.clipboardData) {
      ta.dispatchEvent(ev);
      if (ev.defaultPrevented) { if (getVal() !== before) pushUndo(true); scheduleToEditor(); return; } // imagenes, o un enlace sobre texto elegido
    }
    const text = (e.clipboardData && e.clipboardData.getData('text/plain')) || '';
    if (text) insertAtSel(text.replace(/\r\n?/g, '\n'));
  }

  // ── Arranque ───────────────────────────────────────────
  function copyStyles() {
    const hidden = ta.classList.contains('puente-ta-oculto');
    if (hidden) ta.classList.remove('puente-ta-oculto');
    const prevH = ta.style.height; ta.style.height = 'auto';
    const cs = getComputedStyle(ta);
    for (const p of STYLE_PROPS) ed.style[p] = cs[p];
    // Alto minimo de una linea (no el que tenga el cuadro de Haven en ese momento, que crece con el texto)
    const lh = parseFloat(cs.lineHeight) || (parseFloat(cs.fontSize) || 16) * 1.2;
    const oneLine = lh + (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0) + (parseFloat(cs.borderTopWidth) || 0) + (parseFloat(cs.borderBottomWidth) || 0);
    ed.style.minHeight = Math.max(parseFloat(cs.minHeight) || 0, oneLine) + 'px';
    ta.style.height = prevH;
    if (hidden) ta.classList.add('puente-ta-oculto');
    ed.style.setProperty('--puente-ed-ph', getComputedStyle(ta, '::placeholder').color || '#80848e');
    // Como Discord: en la PC el cuadro crece hasta la mitad de la ventana antes de desplazarse
    ed.style.maxHeight = window.innerWidth <= 480 ? '90px' : '50vh';
  }
  function syncAttrs() {
    ed.dataset.placeholder = ta.placeholder || '';
    const off = !!ta.disabled || !!ta.readOnly;
    ed.contentEditable = off ? 'false' : 'true';
    ed.classList.toggle('puente-ed-off', off);
  }

  function fail(why) {
    if (!alive) return;
    alive = false;
    console.warn('[puente] cuadro con emojis apagado (' + why + '); queda el de Haven');
    try {
      const v = getVal();
      ed.remove();
      ta.classList.remove('puente-ta-oculto');
      delete ta.value; delete ta.focus; delete ta.blur; delete ta.style.height;
      NATIVE.set.call(ta, v);
    } catch { /* nada */ }
  }

  function start() {
    ta = document.getElementById('message-input');
    if (!ta || ta.tagName !== 'TEXTAREA' || document.getElementById('puente-editor')) return false;
    ed = document.createElement('div');
    ed.id = 'puente-editor';
    ed.className = 'puente-editor';
    ed.setAttribute('role', 'textbox');
    ed.setAttribute('aria-multiline', 'true');
    ed.setAttribute('dir', 'auto');
    ed.spellcheck = true;
    ta.parentNode.insertBefore(ed, ta);
    copyStyles(); syncAttrs();
    ta.classList.add('puente-ta-oculto');
    alive = true;
    // Haven le cambia el alto en cada letra (alto automatico y despues el que entra). Escondido, el tema
    // lo deja en 1px igual, pero el cambio obligaba a recalcular los estilos de toda la pagina: mientras
    // esta el cuadro nuevo, ese alto no se toca
    try {
      Object.defineProperty(ta.style, 'height', {
        configurable: true,
        get() { return this.getPropertyValue('height'); },
        set(v) { if (!alive) this.setProperty('height', v); },
      });
    } catch { /* si no se puede, Haven lo cambia como siempre */ }
    lastValue = getVal();
    render(lastValue);

    // El de Haven cambia por su cuenta (envio, sugerencias, selector de emojis, borrador...)
    Object.defineProperty(ta, 'value', {
      configurable: true,
      get() { return NATIVE.get.call(this); },
      set(v) { NATIVE.set.call(this, v); if (!busy) { lastValue = NATIVE.get.call(this); scheduleToEditor(); } },
    });
    ta.addEventListener('input', () => { if (!busy) scheduleToEditor(); });
    // Lo que enfoca el cuadro de Haven enfoca el nuevo
    const nativeFocus = HTMLTextAreaElement.prototype.focus, nativeBlur = HTMLTextAreaElement.prototype.blur;
    ta.focus = function () { if (!alive) return nativeFocus.apply(this, arguments); ed.focus(); if (!pending) setSel(ta.selectionStart, ta.selectionEnd); };
    ta.blur = function () { if (!alive) return nativeBlur.apply(this, arguments); ed.blur(); };
    ta.addEventListener('focus', () => { if (alive) { ed.focus(); if (!pending) setSel(ta.selectionStart, ta.selectionEnd); } });
    new MutationObserver(syncAttrs).observe(ta, { attributes: true, attributeFilter: ['placeholder', 'disabled', 'readonly'] });

    ed.addEventListener('keydown', onKeyDown);
    ed.addEventListener('input', () => { if (!composing) fromEditor(); });
    ed.addEventListener('compositionstart', () => { composing = true; });
    ed.addEventListener('compositionend', () => { composing = false; fromEditor(); });
    ed.addEventListener('paste', onPaste);
    ed.addEventListener('drop', (e) => { if (e.dataTransfer && [...(e.dataTransfer.types || [])].includes('text/plain') && !(e.dataTransfer.files || []).length) { e.preventDefault(); const t = e.dataTransfer.getData('text/plain'); if (t) insertAtSel(t); } });
    ed.addEventListener('blur', () => { try { ta.dispatchEvent(new FocusEvent('blur')); } catch { /* nada */ } });
    document.addEventListener('selectionchange', syncSelToTa);
    window.addEventListener('resize', () => { if (alive) copyStyles(); });

    // Si Haven ya habia puesto el cursor en su cuadro, pasarlo al nuevo
    if (document.activeElement === ta) { const s0 = ta.selectionStart, e0 = ta.selectionEnd; ed.focus(); setSel(s0, e0); }
    // Por si algo cambia el texto de Haven sin avisar (setRangeText sin evento)
    setInterval(() => { if (alive && !busy && !composing && getVal() !== lastValue) toEditor(); }, 300);
    return true;
  }

  let tries = 0;
  (function wait() {
    app = window.app;
    if (!app || typeof app._findNamedEmoji !== 'function' || !document.getElementById('message-input')) { if (++tries < 120) setTimeout(wait, 500); return; }
    try { if (!start()) return; } catch (err) { console.warn('[puente] cuadro con emojis:', err); fail('error al arrancar'); }
    window.addEventListener('error', (ev) => { if (ev && ev.filename && /\/puente\/aviso\.js/.test(ev.filename) && /editor|puente-ed/i.test(String(ev.message))) fail('error'); });
  })();
})();

// Al volver a CV Chat (Alt+Tab, otra pestaña, la ventana que estaba tapada): el que estaba leyendo lo ultimo
// sigue pegado abajo, sin el saltito para arriba. Haven descarga las imagenes cuando la pagina queda oculta un
// rato (en Windows, una ventana tapada por otra cuenta como oculta) y al volver las carga de nuevo; mientras se
// reacomoda, esto lo deja abajo en el mismo cuadro (antes de que se dibuje), durante 2 segundos. Si la persona
// scrollea en ese rato, se deja de hacer.
(function () {
  'use strict';
  const VENTANA = 2000;
  let hasta = 0, ro = null, abajo = false, alto = 0;
  const msgs = () => document.getElementById('messages');
  const pegado = () => { const a = window.app, m = msgs(); return !!(a && a._coupledToBottom) || !!(m && m.scrollHeight - m.scrollTop - m.clientHeight <= 4); };
  const bajar = () => { const m = msgs(); if (m && Date.now() < hasta) { m.scrollTop = m.scrollHeight; alto = m.scrollTop; } };
  function anotar() { abajo = pegado(); }
  function volver() {
    const m = msgs();
    if (!m || !window.ResizeObserver || (!abajo && !pegado())) return;
    hasta = Date.now() + VENTANA;
    if (!ro) ro = new ResizeObserver(bajar);
    ro.disconnect(); ro.observe(m); for (const c of m.children) ro.observe(c);
    bajar();
    setTimeout(() => { if (Date.now() >= hasta && ro) ro.disconnect(); }, VENTANA + 100);
  }
  const cortar = () => { hasta = 0; if (ro) ro.disconnect(); };
  addEventListener('blur', anotar);
  addEventListener('focus', volver);
  document.addEventListener('visibilitychange', () => { if (document.hidden) anotar(); else volver(); });
  // la persona scrollea: se deja de hacer
  addEventListener('wheel', cortar, { passive: true, capture: true });
  addEventListener('touchmove', cortar, { passive: true, capture: true });
  addEventListener('keydown', (e) => { if (/^(ArrowUp|ArrowDown|PageUp|PageDown|Home|End)$/.test(e.key)) cortar(); }, { capture: true });
  // algo que lo sube sin cambiar de tamaño (un reacomodo de Haven): vuelve abajo
  document.addEventListener('scroll', (e) => { const m = msgs(); if (m && e.target === m && Date.now() < hasta && m.scrollTop < alto - 1) bajar(); }, { capture: true, passive: true });
})();

// Sin el temblor de los emojis animados al abrir: cuando la animacion esta en
// "al pasar el mouse", Haven deja quieto cada GIF recien despues de que carga, y
// en ese ratito se lo ve moverse. Mientras tanto queda invisible (ocupando su
// lugar, asi no se mueve el texto). Si Haven no lo pudo frenar, a los 1,5 s se
// muestra igual.
(function () {
  'use strict';
  const SEL = 'img.custom-emoji, img.chat-image, img.reaction-custom-emoji';
  const timers = new WeakMap();
  function update(img) {
    const src = img.getAttribute('src') || '';
    const waiting = img.dataset.chatAnimatedSrc && img.dataset.chatAnimPlaying !== '1' && !src.startsWith('data:');
    if (waiting && !img.classList.contains('puente-congelando')) {
      img.classList.add('puente-congelando');
      timers.set(img, setTimeout(() => img.classList.remove('puente-congelando'), 1500));
    } else if (!waiting && img.classList.contains('puente-congelando')) {
      img.classList.remove('puente-congelando');
      clearTimeout(timers.get(img));
    }
  }
  function start() {
    new MutationObserver((muts) => {
      for (const m of muts) if (m.target.nodeType === 1 && m.target.matches(SEL)) update(m.target);
    }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['data-chat-animated-src', 'data-chat-anim-playing', 'src'] });
  }
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();

// Saca la pantalla de carga (vincular.js) cuando la app ya esta lista: canales
// cargados, mensajes del canal dibujados, la letra del tema lista y nada
// moviendose por un momento. Asi no se ve la pagina vacia de Haven ni el
// reacomodo del primer segundo.
(function () {
  'use strict';
  const root = document.documentElement;
  const done = () => root.classList.add('puente-listo');
  let token = null;
  try { token = localStorage.getItem('haven_token'); } catch { /* sin almacenamiento */ }
  if (!token) { done(); return; }           // sin sesion: Haven lleva al inicio de sesion
  setTimeout(done, 8000);                    // pase lo que pase
  // Ya entro alguna vez en este navegador (no como invitado): la pantalla de entrar le muestra primero el
  // formulario en el celular (login.js)
  try { if (!/"isGuest":\s*true/.test(localStorage.getItem('haven_user') || '')) localStorage.setItem('cv_ya_entro', '1'); } catch { /* sin almacenamiento */ }
  const t0 = Date.now();
  let fonts = false, last = Date.now(), firstMsg = 0;
  try { document.fonts.ready.then(() => { fonts = true; }); } catch { fonts = true; }
  const watch = () => {
    for (const id of ['messages', 'channel-list', 'dm-list']) {
      const n = document.getElementById(id);
      if (n) new MutationObserver(() => { last = Date.now(); }).observe(n, { childList: true, subtree: true, characterData: true });
    }
  };
  if (document.body) watch(); else document.addEventListener('DOMContentLoaded', watch);
  (function check() {
    if (root.classList.contains('puente-listo')) return;
    const app = window.app;
    const msgs = document.getElementById('messages');
    const channels = !!(app && Array.isArray(app.channels) && app.channels.length);
    const hasMsgs = !!(msgs && msgs.querySelector('[data-msg-id]'));
    if (hasMsgs && !firstMsg) firstMsg = Date.now();
    const shown = !!(app && app.currentChannel && msgs && (hasMsgs || Date.now() - t0 > 3000));
    // Quieto un momento, o como mucho 1,2 s despues de que aparecen los mensajes (las vistas
    // previas de enlaces pueden seguir cargando, y no vale la pena hacer esperar mas)
    const settled = Date.now() - last > 300 || (firstMsg && Date.now() - firstMsg > 1200);
    // El invitado (jugar sin cuenta, login.js) no tiene canales: listo cuando ya estan los juegos
    const invitado = !!(app && app.user && app.user.isGuest) && fonts && (!!document.querySelector('.puente-jg') || Date.now() - t0 > 1500);
    if ((channels && shown && fonts && settled) || invitado) {
      requestAnimationFrame(() => requestAnimationFrame(done));
      return;
    }
    setTimeout(check, 100);
  })();
})();

// Marca html.puente-con-canal mientras hay un canal abierto (la bienvenida de
// Haven esta oculta). El tema la usa en vez de un selector :has() sobre toda la
// app, que hacia recalcular los estilos de la pagina entera en cada letra.
(function () {
  'use strict';
  function start() {
    const w = document.getElementById('no-channel-msg');
    if (!w) return;
    const sync = () => document.documentElement.classList.toggle('puente-con-canal', w.style.display === 'none');
    new MutationObserver(sync).observe(w, { attributes: true, attributeFilter: ['style'] });
    sync();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();

// PC: la barrita que aparece al pasar el mouse por un mensaje y el menu del clic
// derecho, como en Discord de escritorio. La barrita: tres reacciones rapidas
// (las mas usadas), agregar reaccion, responder, citar y "mas" (abre el menu).
// Denunciar un mensaje (denuncias.js): la ventana con el motivo. Le llega a los administradores.
// Esta en el menu del mensaje de la PC y en la hoja del celular (no en los mensajes propios).
// En los privados (cifrados) el servidor no puede leer el texto: se manda el que se ve, si se quiere.
(function () {
  'use strict';
  const MOTIVOS = [
    ['menores', 'Abuso o explotación de menores'],
    ['acoso', 'Acoso o amenazas'],
    ['odio', 'Odio o violencia'],
    ['sexual', 'Contenido sexual no deseado'],
    ['spam', 'Spam o estafa'],
    ['otro', 'Otro motivo'],
  ];
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const css = el('style');
  css.textContent = '.puente-den-fondo{position:fixed;inset:0;z-index:10050;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:16px}'
    + '.puente-den{width:min(440px,100%);max-height:calc(100vh - 32px);overflow:auto;background:#2b2b31;color:#dbdee1;border-radius:12px;padding:20px;box-shadow:0 8px 32px rgba(0,0,0,.5);font-size:14px}'
    + '.puente-den h2{margin:0 0 4px;font-size:18px;color:#fbfbfb}.puente-den p{margin:0 0 14px;color:#b5bac1;font-size:13px;line-height:1.4}'
    + '.puente-den-cita{margin:0 0 14px;padding:8px 10px;border-left:3px solid #4e5058;background:#232328;border-radius:4px;color:#b5bac1;font-size:13px;white-space:pre-wrap;word-break:break-word;max-height:90px;overflow:auto}'
    + '.puente-den label.puente-den-op{display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:8px;cursor:pointer}.puente-den label.puente-den-op:hover{background:#35353c}'
    + '.puente-den input[type=radio]{accent-color:#f23f43;width:16px;height:16px;margin:0}'
    + '.puente-den textarea{width:100%;box-sizing:border-box;margin-top:10px;min-height:64px;resize:vertical;background:#1e1f22;color:#dbdee1;border:1px solid #3a3a40;border-radius:8px;padding:8px 10px;font:inherit}'
    + '.puente-den-incluir{display:flex;gap:8px;align-items:flex-start;margin-top:10px;font-size:13px;color:#b5bac1}'
    + '.puente-den-pie{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}.puente-den-pie button{border:0;border-radius:8px;padding:9px 16px;font:inherit;font-weight:600;cursor:pointer}'
    + '.puente-den-no{background:transparent;color:#dbdee1}.puente-den-si{background:#da373c;color:#fff}.puente-den-si:disabled{opacity:.5;cursor:default}'
    + '.puente-den-error{color:#f87171;font-size:13px;margin-top:10px}'
    + '#message-context-menu .puente-mm-peligro{color:#f23f43}';
  document.head.appendChild(css);

  const token = () => { try { return localStorage.getItem('haven_token'); } catch { return null; } };
  const propio = (app, msgEl) => !!(app && app.user && msgEl && String(msgEl.dataset.userId || '') === String(app.user.id));
  function textoVisible(msgEl) {
    const c = msgEl.querySelector('.message-content');
    return c ? c.innerText.trim().slice(0, 1000) : '';
  }
  function cerrar() { const o = document.getElementById('puente-denunciar'); if (o) { if (o.__off) o.__off(); o.remove(); } }

  function abrir(app, msgEl) {
    cerrar();
    const id = parseInt(msgEl && msgEl.dataset.msgId, 10);
    if (!id || !token()) return;
    const canal = app && (app.channels || []).find(c => c && c.code === app.currentChannel);
    const privado = !!(canal && canal.is_dm);
    const fondo = el('div', 'puente-den-fondo'); fondo.id = 'puente-denunciar';
    const caja = el('div', 'puente-den'); caja.setAttribute('role', 'dialog'); caja.setAttribute('aria-modal', 'true');
    caja.appendChild(el('h2', '', 'Denunciar mensaje'));
    caja.appendChild(el('p', '', 'Les llega a los administradores de CV Chat, que lo revisan. Quien escribió el mensaje no se entera de que lo denunciaste.'));
    const visto = textoVisible(msgEl);
    if (visto) caja.appendChild(el('div', 'puente-den-cita', visto.length > 300 ? visto.slice(0, 300) + '…' : visto));
    const lista = el('div');
    let elegido = null;
    for (const [v, t] of MOTIVOS) {
      const l = el('label', 'puente-den-op'); const r = el('input'); r.type = 'radio'; r.name = 'puente-den-motivo'; r.value = v;
      r.addEventListener('change', () => { elegido = v; si.disabled = false; });
      l.append(r, el('span', '', t)); lista.appendChild(l);
    }
    caja.appendChild(lista);
    const det = el('textarea'); det.maxLength = 500; det.placeholder = 'Contanos más (opcional)';
    caja.appendChild(det);
    let incluir = null;
    if (privado && visto) {
      const l = el('label', 'puente-den-incluir'); incluir = el('input'); incluir.type = 'checkbox'; incluir.checked = true;
      l.append(incluir, el('span', '', 'Incluir el texto del mensaje (los mensajes privados están cifrados: sin esto, los administradores no pueden leerlo).'));
      caja.appendChild(l);
    }
    const error = el('div', 'puente-den-error'); error.hidden = true; caja.appendChild(error);
    const pie = el('div', 'puente-den-pie');
    const no = el('button', 'puente-den-no', 'Cancelar'); no.type = 'button';
    const si = el('button', 'puente-den-si', 'Denunciar'); si.type = 'button'; si.disabled = true;
    pie.append(no, si); caja.appendChild(pie);
    fondo.appendChild(caja);
    no.addEventListener('click', cerrar);
    fondo.addEventListener('mousedown', (e) => { if (e.target === fondo) cerrar(); });
    const tecla = (e) => { if (e.key === 'Escape') { e.stopPropagation(); cerrar(); } };
    document.addEventListener('keydown', tecla, true);
    fondo.__off = () => document.removeEventListener('keydown', tecla, true);
    si.addEventListener('click', async () => {
      if (!elegido) return;
      si.disabled = true; error.hidden = true;
      try {
        const r = await fetch('/puente/api/denunciar', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() },
          body: JSON.stringify({ mensaje: id, motivo: elegido, detalle: det.value, texto: incluir && incluir.checked ? visto : '' }) });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || 'No se pudo mandar la denuncia.');
        cerrar();
        if (app && app._showToast) app._showToast(d.ya ? 'Ya habías denunciado este mensaje' : 'Gracias: la denuncia les llegó a los administradores', 'success');
      } catch (err) { error.textContent = err.message || 'No se pudo mandar la denuncia.'; error.hidden = false; si.disabled = false; }
    });
    document.body.appendChild(fondo);
  }
  window.puenteDenunciar = { abrir, propio };
})();

// Canal sin chat de voz (el admin la apago en la configuracion del canal): Haven ya saca el boton
// "Unirse al chat de voz", y aca se esconde tambien lo de voz del panel de la derecha ("Voz",
// "Nadie en voz"). La ✕ que cierra ese panel en el celular queda. En los privados (llamadas) y en
// los canales con voz, todo sigue igual. Marca html.puente-sin-voz solo cuando cambia.
(function () {
  'use strict';
  const css = document.createElement('style');
  css.textContent = 'html.puente-sin-voz #right-sidebar-voice .panel-title,html.puente-sin-voz #right-sidebar-voice .voice-header-actions,'
    + 'html.puente-sin-voz #voice-users,html.puente-sin-voz #voice-join-mobile,html.puente-sin-voz #voice-join-btn{display:none!important}';
  document.head.appendChild(css);
  let antes = null;
  function revisar() {
    const app = window.app;
    const ch = app && (app.channels || []).find(c => c && c.code === app.currentChannel);
    const sinVoz = !!(ch && !ch.is_dm && ch.voice_enabled === 0);
    if (sinVoz !== antes) { antes = sinVoz; document.documentElement.classList.toggle('puente-sin-voz', sinVoz); }
  }
  setInterval(revisar, 1000);
  revisar();
})();

// Panel de la derecha: los grupos dicen "En línea — 4" como en Discord (Haven pone "En línea (4)")
(function () {
  'use strict';
  function grupos() {
    const box = document.getElementById('online-users');
    if (!box) return;
    for (const g of box.querySelectorAll('.user-group-label')) {
      const m = /^(.*\S)\s*\((\d+)\)\s*$/.exec(g.textContent);
      if (m) g.textContent = m[1] + ' — ' + m[2];
    }
  }
  let tries = 0;
  (function wait() {
    const box = document.getElementById('online-users');
    if (!box) { if (++tries < 120) setTimeout(wait, 500); return; }
    new MutationObserver(grupos).observe(box, { childList: true });
    grupos();
  })();
})();

// Ventanas de Haven sin el emoji del título ("📊 Crear encuesta" -> "Crear encuesta"), como las de
// CV Chat; tambien el 📌 de "Mensajes fijados". Las que se arman despues tambien.
(function () {
  'use strict';
  const EMOJI = /^[\s\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\uFE0F\u200D]+/u;
  function limpiar(raiz) {
    const titulos = raiz.querySelectorAll ? raiz.querySelectorAll('.modal-overlay > .modal > h3, #pinned-count') : [];
    for (const h of titulos) {
      const t = h.firstChild;
      if (t && t.nodeType === 3 && EMOJI.test(t.nodeValue) && h.textContent.replace(EMOJI, '').trim()) t.nodeValue = t.nodeValue.replace(EMOJI, '');
    }
  }
  function empezar() {
    limpiar(document);
    new MutationObserver((muts) => {
      for (const mu of muts) for (const n of mu.addedNodes) if (n.nodeType === 1 && (n.classList.contains('modal-overlay') || n.querySelector('.modal-overlay, #pinned-count'))) limpiar(n.parentNode || document);
    }).observe(document.body, { childList: true });
    // El contador de fijados se reescribe al cambiar de canal ("📌 3 mensajes fijados")
    const pc = document.getElementById('pinned-count');
    if (pc) new MutationObserver(() => limpiar(pc.parentNode)).observe(pc, { childList: true, characterData: true, subtree: true });
  }
  if (document.body) empezar(); else document.addEventListener('DOMContentLoaded', empezar);
})();

// Fechas siempre dd/mm/aaaa (31/10/2026), como se escriben aca. Haven las armaba segun el idioma
// del navegador ("Oct 31, 2026", "5/15/2024 11:02 PM"); todas pasan por _fmtDate y _fmtDateTime, y
// las pocas que llaman a toLocaleString() sin nada tambien. La hora sigue la preferencia de 12/24 h.
(function () {
  'use strict';
  const FECHA = { day: '2-digit', month: '2-digit', year: 'numeric' };
  // Solo la fecha: sin año si Haven pidio dia y mes nada mas (los cumpleaños: "31/10")
  function soloFecha(o) {
    const r = { ...FECHA };
    if (o && o.month && o.day && o.year === undefined && !o.dateStyle) delete r.year;
    if (o && o.weekday) r.weekday = o.weekday;
    if (o && o.timeZone) r.timeZone = o.timeZone;
    return r;
  }
  function fechaHora(o) {
    const r = soloFecha(o);
    r.hour = '2-digit'; r.minute = '2-digit';
    if (o && (o.second || o.timeStyle === 'medium' || o.timeStyle === 'long')) r.second = '2-digit';
    for (const k of ['hour12', 'hourCycle']) if (o && o[k] !== undefined) r[k] = o[k];
    return r;
  }
  const comoFecha = (v) => (v instanceof Date ? v : new Date(v));
  const tls = Date.prototype.toLocaleString, tlds = Date.prototype.toLocaleDateString;
  Date.prototype.toLocaleString = function (...a) { return a.length ? tls.apply(this, a) : tls.call(this, 'es-AR', fechaHora()); };
  Date.prototype.toLocaleDateString = function (...a) { return a.length ? tlds.apply(this, a) : tlds.call(this, 'es-AR', FECHA); };
  let tries = 0;
  (function wait() {
    const app = window.app;
    if (!app || typeof app._fmtDate !== 'function' || typeof app._dtOpts !== 'function') { if (++tries < 120) setTimeout(wait, 500); return; }
    app._fmtDate = function (value, opts = {}) { return tlds.call(comoFecha(value), 'es-AR', this._dtOpts(soloFecha(opts))); };
    app._fmtDateTime = function (value, opts = {}) { return tls.call(comoFecha(value), 'es-AR', this._dtOpts(fechaHora(opts))); };
  })();
})();

// Configuración → Miembros y moderación (solo administradores): "Descargar emails" baja una planilla
// con los emails de todas las cuentas. Estaba en la página Admin y se tocaba sin querer.
(function () {
  'use strict';
  const token = () => { try { return localStorage.getItem('haven_token'); } catch { return null; } };
  function poner() {
    const app = window.app;
    const grilla = document.querySelector('#section-members .settings-btn-grid');
    if (!app || !app.user || !grilla) return false;
    if (!app.user.isAdmin || document.getElementById('puente-emails-btn')) return true;
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'btn-sm btn-accent'; b.id = 'puente-emails-btn';
    b.textContent = '📧 Descargar emails'; // con su icono, como los demas botones de esa fila
    b.title = 'Una planilla con los emails de todas las cuentas';
    b.addEventListener('click', () => {
      b.disabled = true;
      fetch('/puente/api/miembros/emails.csv', { headers: { Authorization: 'Bearer ' + token() } })
        .then(r => (r.ok ? r.blob() : Promise.reject(r.status)))
        .then(blob => {
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = 'emails-' + new Date().toISOString().slice(0, 10) + '.csv';
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(a.href), 5000);
        })
        .catch(() => { if (window.app && window.app._showToast) window.app._showToast('No se pudo descargar la lista', 'error'); })
        .finally(() => { b.disabled = false; });
    });
    grilla.appendChild(b);
    return true;
  }
  let tries = 0;
  (function wait() { if (!poner() && ++tries < 120) setTimeout(wait, 500); })();
})();

// El español con la bandera argentina: el selector de idioma de Haven le pone la de España
// (/emoji/flags/es.svg); aca va la de Argentina (ar.svg, que Haven tambien trae)
(function () {
  'use strict';
  const cambiar = (raiz) => {
    for (const i of raiz.querySelectorAll('img.lang-flag[src$="/emoji/flags/es.svg"]')) i.src = '/emoji/flags/ar.svg';
  };
  function empezar() {
    cambiar(document);
    new MutationObserver((muts) => {
      for (const mu of muts) for (const n of mu.addedNodes) {
        if (n.nodeType !== 1) continue;
        if (n.matches('img.lang-flag')) cambiar(n.parentNode || document);
        else if (n.firstElementChild) cambiar(n);
      }
    }).observe(document.body, { childList: true, subtree: true });
  }
  if (document.body) empezar(); else document.addEventListener('DOMContentLoaded', empezar);
})();

// Celular: el menu del canal (mantener apretado) es una hoja desde abajo, como en la app de Discord,
// sin los emojis de Haven delante de cada opcion (el de la PC esta mas arriba)
(function () {
  'use strict';
  if (!matchMedia('(pointer: coarse)').matches) return;
  function sinIconos(menu) {
    for (const b of menu.querySelectorAll('.channel-ctx-item')) {
      const t = b.firstChild;
      if (t && t.nodeType === 3) {
        const m = /^\s*(\S+)\s*([\s\S]*)$/.exec(t.nodeValue);
        if (m && !/[a-z0-9áéíóúñ]/i.test(m[1])) t.nodeValue = m[2];
      }
    }
  }
  let tries = 0;
  (function wait() {
    const app = window.app;
    if (!app || typeof app._openChannelCtxMenu !== 'function') { if (++tries < 120) setTimeout(wait, 500); return; }
    const abrir = app._openChannelCtxMenu;
    app._openChannelCtxMenu = function (...a) {
      const r = abrir.apply(this, a);
      const menu = document.getElementById('channel-ctx-menu');
      if (menu && window.innerWidth <= 768) { menu.classList.add('puente-canal-hoja'); sinIconos(menu); }
      else if (menu) menu.classList.remove('puente-canal-hoja');
      return r;
    };
  })();
})();

// Lista de hilos: el comienzo de cada uno se ve sin las marcas de formato ("**Juntadas**", "> cita"),
// como en Discord, en vez del texto crudo
(function () {
  'use strict';
  const limpio = (t) => t.replace(/\*\*|__|~~|\|\||`/g, '').replace(/(^|\n)\s*>\s?/g, '$1').replace(/\s+/g, ' ').trim();
  function arreglar(raiz) {
    for (const p of raiz.querySelectorAll('.thread-list-preview')) {
      if (p.dataset.puenteLimpio === p.textContent) continue;
      const t = limpio(p.textContent);
      if (t !== p.textContent) p.textContent = t;
      p.dataset.puenteLimpio = t;
    }
  }
  let tries = 0;
  (function wait() {
    const m = document.getElementById('threads-list-modal');
    if (!m) { if (++tries < 120) setTimeout(wait, 500); return; }
    new MutationObserver(() => arreglar(m)).observe(m, { childList: true, subtree: true });
  })();
})();

// El menu: reacciones rapidas arriba, "Agregar reaccion", y las opciones de Haven
// ordenadas como en Discord, con su icono a la derecha y "Copiar texto". Son las
// mismas acciones y permisos de Haven; solo cambian el aspecto y el orden.
(function () {
  'use strict';
  if (matchMedia('(pointer: coarse)').matches) return;
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const svg = (d) => '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="' + d + '"/></svg>';
  const I = {
    react: svg('M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16Zm-3.5-9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm7 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM12 17.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5Z'),
    reply: svg('M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11Z'),
    quote: svg('M6 17h3l2-4V7H5v6h3l-2 4Zm8 0h3l2-4V7h-6v6h3l-2 4Z'),
    thread: svg('M5 3h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-4 4v-4H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm2 5v2h10V8H7Zm0 4v2h7v-2H7Z'),
    copy: svg('M16 1H4a2 2 0 0 0-2 2v14h2V3h12V1Zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2Zm0 16H8V7h11v14Z'),
    pin: svg('M16 3a1 1 0 0 1 .7 1.7L15 6.4v4.1l2.7 2.7A1 1 0 0 1 17 15h-4v6l-1 1-1-1v-6H7a1 1 0 0 1-.7-1.7L9 10.5V6.4L7.3 4.7A1 1 0 0 1 8 3h8Z'),
    link: svg('M10.6 13.4a1 1 0 0 0 1.4 0l4-4a3 3 0 0 0-4.2-4.2l-1.5 1.5 1.4 1.4 1.5-1.5a1 1 0 0 1 1.4 1.4l-4 4a1 1 0 0 0 0 1.4Zm2.8-2.8a1 1 0 0 0-1.4 0l-4 4a3 3 0 0 0 4.2 4.2l1.5-1.5-1.4-1.4-1.5 1.5a1 1 0 0 1-1.4-1.4l4-4a1 1 0 0 0 0-1.4Z'),
    edit: svg('M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25ZM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83Z'),
    trash: svg('M9 3h6l1 2h4v2H4V5h4l1-2Zm-3 6h12l-1 12H7L6 9Zm4 2v8h2v-8h-2Zm4 0v8h2v-8h-2Z'),
    shield: svg('M12 2 4 5v6c0 5 3.4 9.7 8 11 4.6-1.3 8-6 8-11V5l-8-3Z'),
    tag: svg('M21.4 11.6 12.4 2.6A2 2 0 0 0 11 2H4a2 2 0 0 0-2 2v7c0 .55.22 1.05.59 1.42l9 9a2 2 0 0 0 2.82 0l7-7a2 2 0 0 0-.01-2.82ZM6.5 8A1.5 1.5 0 1 1 6.5 5a1.5 1.5 0 0 1 0 3Z'),
    megaphone: svg('M18 3v18l-6-4H6a3 3 0 0 1-3-3v-4a3 3 0 0 1 3-3h6l6-4Zm2 6h2v6h-2V9Z'),
    more: svg('M5 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm7 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm7 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z'),
    eyes: svg('M12 4.5C7 4.5 2.7 7.6 1 12c1.7 4.4 6 7.5 11 7.5s9.3-3.1 11-7.5c-1.7-4.4-6-7.5-11-7.5Zm0 12.5a5 5 0 1 1 0-10 5 5 0 0 1 0 10Zm0-8a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z'),
    close: svg('M18.3 5.7a1 1 0 0 0-1.4 0L12 10.6 7.1 5.7a1 1 0 0 0-1.4 1.4l4.9 4.9-4.9 4.9a1 1 0 1 0 1.4 1.4l4.9-4.9 4.9 4.9a1 1 0 0 0 1.4-1.4L13.4 12l4.9-4.9a1 1 0 0 0 0-1.4Z'),
    bookmark: svg('M6 2h12a1 1 0 0 1 1 1v19l-7-4.5L5 22V3a1 1 0 0 1 1-1Zm1 2v14.3l5-3.2 5 3.2V4H7Z'),
    flag: svg('M5 2h2v1.2C8.6 2.5 10.4 2.3 12.3 3c1.6.6 3.2.7 4.9.2L19 2.7V14l-1.4.5c-2.1.7-4.1.6-6-.1-1.6-.6-3.1-.6-4.6 0V22H5V2Z'),
    chevron: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M9.3 5.3a1 1 0 0 1 1.4 0l6 6a1 1 0 0 1 0 1.4l-6 6a1 1 0 1 1-1.4-1.4L14.6 12 9.3 6.7a1 1 0 0 1 0-1.4Z"/></svg>',
  };
  // Opciones de Haven: nombre como en Discord, icono y grupo
  const ITEMS = {
    edit: ['Editar mensaje', I.edit, 1], reply: ['Responder', I.reply, 1], quote: ['Citar', I.quote, 1], thread: ['Crear hilo', I.thread, 1],
    'puente-copiar': ['Copiar texto', I.copy, 2], 'puente-guardar': [null, I.bookmark, 2], pin: ['Fijar mensaje', I.pin, 2], unpin: ['Desfijar mensaje', I.pin, 2],
    'copy-link': ['Copiar enlace del mensaje', I.link, 2], 'copy-href': ['Copiar dirección del enlace', I.link, 2],
    archive: [null, I.shield, 3], unarchive: [null, I.shield, 3], 'edit-tags': [null, I.tag, 3], 'edit-role-menu': [null, I.tag, 3],
    'highlight-on': [null, I.megaphone, 3], 'highlight-off': [null, I.megaphone, 3],
    'puente-denunciar': ['Denunciar mensaje', I.flag, 4], delete: ['Eliminar mensaje', I.trash, 4],
  };
  const ORDER = ['edit', 'reply', 'quote', 'thread', 'puente-copiar', 'puente-guardar', 'pin', 'unpin', 'copy-link', 'copy-href'];

  let quick = null;
  function loadQuick() {
    let tk = null;
    try { tk = localStorage.getItem('haven_token'); } catch { /* sin almacenamiento */ }
    if (!tk) return;
    fetch('/puente/api/reacciones-frecuentes?n=4', { headers: { Authorization: 'Bearer ' + tk } })
      .then(r => (r.ok ? r.json() : null)).then(d => { if (d && Array.isArray(d.emojis)) quick = d.emojis; }).catch(() => {});
  }
  function emojiNode(q) {
    if (q.url) { const img = el('img'); img.src = q.url; img.alt = q.emoji; img.draggable = false; return img; }
    return el('span', 'puente-tb-emoji', q.emoji);
  }
  function toggleReaction(app, msgEl, emoji) {
    const msgId = parseInt(msgEl.dataset.msgId, 10);
    if (!msgId || !app.socket) return;
    const own = [...msgEl.querySelectorAll('.reaction-badge.own')].some(b => b.dataset.emoji === emoji);
    app.socket.emit(own ? 'remove-reaction' : 'add-reaction', { messageId: msgId, emoji });
  }
  // sin las lineas que son solo una imagen o un archivo subido (/uploads/...): eso no es texto
  const sinAdjuntos = (t) => String(t || '').split('\n').filter(l => !/^\s*(\S*\/uploads\/\S+|\[file:[^\]]*\]\([^)]*\))\s*$/.test(l)).join('\n').trim();
  function rawText(app, msgEl) {
    const id = parseInt(msgEl.dataset.msgId, 10);
    const m = (app._lastRenderedMessages || []).find(x => x && x.id === id);
    if (m && typeof m.content === 'string') return sinAdjuntos(m.content);
    const c = msgEl.querySelector('.message-content');
    return c ? sinAdjuntos(c.innerText) : '';
  }
  function copy(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).catch(() => {});
  }

  // ── Ventana "Reacciones", como Discord: los emojis con su numero a la
  // izquierda y quienes reaccionaron con ese a la derecha ─────────────
  let lastBadgeEmoji = null; // la reaccion sobre la que se hizo clic derecho
  document.addEventListener('contextmenu', (e) => {
    const b = e.target instanceof Element && e.target.closest('.reaction-badge');
    lastBadgeEmoji = b ? b.dataset.emoji || null : null;
  }, true);
  function emojiFace(app, emoji) {
    const m = /^:([a-zA-Z0-9_-]+):$/.exec(emoji || '');
    const ce = m && typeof app._findNamedEmoji === 'function' ? app._findNamedEmoji(m[1]) : null;
    if (ce) { const img = el('img', 'puente-vr-emoji-img'); img.src = ce.url; img.alt = emoji; img.draggable = false; return img; }
    return el('span', 'puente-vr-emoji-txt', emoji);
  }
  function closeReactions() {
    const o = document.getElementById('puente-ver-reacciones');
    if (o) { if (o.__off) o.__off(); o.remove(); }
  }
  function viewReactions(app, msgEl, startEmoji) {
    closeReactions();
    const msgId = parseInt(msgEl.dataset.msgId, 10);
    let tk = null;
    try { tk = localStorage.getItem('haven_token'); } catch { /* sin almacenamiento */ }
    if (!msgId || !tk) return;
    const overlay = el('div', 'puente-vr-fondo');
    overlay.id = 'puente-ver-reacciones';
    const box = el('div', 'puente-vr');
    box.setAttribute('role', 'dialog');
    const head = el('div', 'puente-vr-head');
    head.appendChild(el('h2', 'puente-vr-title', 'Reacciones'));
    const x = el('button', 'puente-vr-close'); x.type = 'button'; x.setAttribute('aria-label', 'Cerrar'); x.innerHTML = I.close;
    x.addEventListener('click', closeReactions);
    head.appendChild(x);
    const body = el('div', 'puente-vr-body');
    const left = el('div', 'puente-vr-emojis');
    const right = el('div', 'puente-vr-users');
    body.append(left, right);
    box.append(head, body);
    overlay.appendChild(box);
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) closeReactions(); });
    const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); closeReactions(); } };
    document.addEventListener('keydown', key, true);
    overlay.__off = () => document.removeEventListener('keydown', key, true);
    right.appendChild(el('div', 'puente-vr-empty', 'Cargando…'));
    document.body.appendChild(overlay);

    const showUsers = (group) => {
      right.textContent = '';
      for (const u of group.users) {
        const row = el('div', 'puente-vr-user');
        const av = el('div', 'puente-vr-avatar');
        if (u.avatar) { const img = el('img'); img.src = u.avatar; img.alt = ''; img.loading = 'lazy'; av.appendChild(img); }
        else av.textContent = String(u.name || '?').trim().charAt(0).toUpperCase();
        const names = el('div', 'puente-vr-names');
        names.appendChild(el('div', 'puente-vr-name', u.name || 'Alguien'));
        const sub = el('div', 'puente-vr-sub');
        if (u.usuario && u.usuario !== u.name) sub.appendChild(el('span', '', u.usuario));
        if (u.discord) sub.appendChild(el('span', 'puente-vr-tag', 'DISCORD'));
        if (sub.children.length) names.appendChild(sub);
        row.append(av, names);
        right.appendChild(row);
      }
    };
    fetch('/puente/api/reacciones?mensaje=' + msgId, { headers: { Authorization: 'Bearer ' + tk } })
      .then(r => (r.ok ? r.json() : null)).then(d => {
        const list = d && Array.isArray(d.reacciones) ? d.reacciones : [];
        if (!document.body.contains(overlay)) return;
        if (!list.length) { right.textContent = ''; right.appendChild(el('div', 'puente-vr-empty', 'Este mensaje no tiene reacciones.')); return; }
        let first = null;
        for (const g of list) {
          const b = el('button', 'puente-vr-pill'); b.type = 'button';
          b.append(emojiFace(app, g.emoji), el('span', 'puente-vr-count', String(g.users.length)));
          b.addEventListener('click', () => {
            left.querySelectorAll('.puente-vr-pill').forEach(p => p.classList.toggle('actual', p === b));
            showUsers(g);
          });
          left.appendChild(b);
          if (g.emoji === startEmoji) first = b;
        }
        (first || left.firstChild).click();
      }).catch(() => { right.textContent = ''; right.appendChild(el('div', 'puente-vr-empty', 'No se pudieron cargar las reacciones.')); });
  }

  // ── Barrita al pasar el mouse ───────────────────────────
  function decorate(app, msgEl) {
    const tb = msgEl.querySelector('.msg-toolbar');
    if (!tb || tb.classList.contains('puente-tb')) return;
    const row = el('div', 'puente-tb-row');
    const btn = (cls, tip, html) => { const b = el('button', 'puente-tb-btn ' + cls); b.type = 'button'; b.dataset.tip = tip; if (html) b.innerHTML = html; return b; };
    for (const q of (quick || []).slice(0, 3)) {
      const b = btn('puente-tb-quick', q.emoji);
      b.appendChild(emojiNode(q));
      b.addEventListener('click', (e) => { e.stopPropagation(); toggleReaction(app, msgEl, q.emoji); });
      row.appendChild(b);
    }
    if (row.children.length) row.appendChild(el('span', 'puente-tb-sep'));
    // Botones con la accion de Haven: el chat ya sabe que hacer con cada una
    const react = btn('', 'Agregar reacción', I.react); react.dataset.action = 'react'; row.appendChild(react);
    // Editar, solo en los mensajes propios (Haven pone su boton de editar solo en esos)
    if (tb.querySelector('[data-action="edit"]')) { const edit = btn('', 'Editar', I.edit); edit.dataset.action = 'edit'; row.appendChild(edit); }
    const reply = btn('', 'Responder', I.reply); reply.dataset.action = 'reply'; row.appendChild(reply);
    const quote = btn('', 'Citar', I.quote); quote.dataset.action = 'quote'; row.appendChild(quote);
    // Guardar (como el marcador de X): lleno si ya esta guardado
    if (window.puenteGuardados && msgEl.dataset.msgId) {
      const g = btn('puente-tb-guardar', 'Guardar');
      g.dataset.guardarId = msgEl.dataset.msgId;
      window.puenteGuardados.pintar(g);
      g.addEventListener('click', (e) => { e.stopPropagation(); window.puenteGuardados.alternar(msgEl.dataset.msgId); });
      row.appendChild(g);
    }
    const more = btn('puente-tb-more', 'Más', I.more);
    more.addEventListener('click', (e) => {
      e.stopPropagation();
      const r = more.getBoundingClientRect();
      app._showMessageContextMenu({ clientX: r.left, clientY: r.bottom + 4, preventDefault() {}, stopPropagation() {}, target: more, puenteDesde: more }, msgEl);
      const menu = document.getElementById('message-context-menu');
      if (menu) {
        const mr = menu.getBoundingClientRect();
        let left = r.right - mr.width, top = r.bottom + 4;
        if (top + mr.height > innerHeight - 8) top = Math.max(8, r.top - mr.height - 4);
        menu.style.left = Math.max(8, left) + 'px'; menu.style.top = top + 'px';
      }
    });
    row.appendChild(more);
    tb.classList.add('puente-tb');
    tb.appendChild(row);
  }

  // ── Menu del clic derecho ───────────────────────────────
  function restyle(app, msgEl) {
    const menu = document.getElementById('message-context-menu');
    if (!menu || menu.classList.contains('puente-pc-msgmenu')) return;
    menu.classList.add('puente-pc-msgmenu');
    const buttons = [...menu.querySelectorAll('button[data-action]')];
    const by = new Map(buttons.map(b => [b.dataset.action, b]));
    // Copiar texto (Discord lo tiene; Haven no)
    const copyBtn = el('button', 'channel-ctx-item');
    copyBtn.dataset.action = 'puente-copiar';
    copyBtn.addEventListener('click', () => copy(rawText(app, msgEl)));
    by.set('puente-copiar', copyBtn);
    // Copiar enlace del mensaje (el de Haven solo aparece en canales publicos)
    if (window.puenteEnlaces) {
      const linkBtn = el('button', 'channel-ctx-item');
      linkBtn.dataset.action = 'puente-enlace'; // con 'copy-link' Haven hace lo suyo (y avisa que el canal no es publico)
      linkBtn.addEventListener('click', (e) => { e.stopPropagation(); app._hideMessageContextMenu(); window.puenteEnlaces.copiar(app, msgEl); });
      by.set('copy-link', linkBtn);
    }
    // Denunciar (no en los mensajes propios)
    if (window.puenteDenunciar && !window.puenteDenunciar.propio(app, msgEl)) {
      const den = el('button', 'channel-ctx-item puente-mm-peligro');
      den.dataset.action = 'puente-denunciar';
      den.addEventListener('click', (e) => { e.stopPropagation(); app._hideMessageContextMenu(); window.puenteDenunciar.abrir(app, msgEl); });
      by.set('puente-denunciar', den);
    }
    // Guardar (como el marcador de X) o quitar de guardados
    if (window.puenteGuardados && msgEl.dataset.msgId) {
      const g = el('button', 'channel-ctx-item');
      g.dataset.action = 'puente-guardar';
      g.appendChild(el('span', '', window.puenteGuardados.es(msgEl.dataset.msgId) ? 'Quitar de guardados' : 'Guardar mensaje'));
      g.addEventListener('click', (e) => { e.stopPropagation(); app._hideMessageContextMenu(); window.puenteGuardados.alternar(msgEl.dataset.msgId); });
      by.set('puente-guardar', g);
    }
    // El nombre de Haven esta en su <span>; sin <span>, se le saca el emoji del principio
    const label = (b, a) => {
      const it = ITEMS[a];
      if (it && it[0]) return it[0];
      const span = b.querySelector('span');
      return span ? span.textContent.trim() : b.textContent.replace(/^\s*[^\p{L}\p{N}\s]+\s*/u, '').trim();
    };
    const row = (b, a, extraIcon) => {
      const it = ITEMS[a] || [null, '', 3];
      const name = label(b, a);
      b.textContent = '';
      b.classList.add('puente-mm-item');
      b.append(el('span', 'puente-mm-label', name));
      const ic = el('span', 'puente-mm-icon'); ic.innerHTML = extraIcon || it[1] || ''; b.appendChild(ic);
      return b;
    };
    menu.textContent = '';
    // Reacciones rapidas arriba
    if (quick && quick.length) {
      const qr = el('div', 'puente-mm-quick');
      for (const q of quick.slice(0, 4)) {
        const b = el('button', 'puente-mm-quick-btn'); b.type = 'button'; b.title = q.emoji;
        b.appendChild(emojiNode(q));
        b.addEventListener('click', (e) => { e.stopPropagation(); toggleReaction(app, msgEl, q.emoji); app._hideMessageContextMenu(); });
        qr.appendChild(b);
      }
      menu.appendChild(qr);
    }
    const groups = [[], [], [], []];
    if (by.has('react')) {
      const b = row(by.get('react'), 'react', I.chevron);
      b.querySelector('.puente-mm-label').textContent = 'Agregar reacción';
      groups[0].push(b);
    }
    // Ver reacciones (si el mensaje tiene)
    if (msgEl.querySelector('.reaction-badge')) {
      const vb = el('button', 'channel-ctx-item puente-mm-item');
      vb.type = 'button';
      vb.dataset.action = 'puente-ver-reacciones';
      vb.append(el('span', 'puente-mm-label', 'Ver reacciones'));
      const ic = el('span', 'puente-mm-icon'); ic.innerHTML = I.eyes; vb.appendChild(ic);
      const start = lastBadgeEmoji;
      vb.addEventListener('click', (e) => { e.stopPropagation(); app._hideMessageContextMenu(); viewReactions(app, msgEl, start); });
      groups[0].push(vb);
    }
    const used = new Set(['react', 'puente-denunciar']);
    for (const a of ORDER) if (by.has(a)) { used.add(a); groups[(ITEMS[a] || [0, 0, 3])[2] - 1].push(row(by.get(a), a)); }
    for (const [a, b] of by) if (!used.has(a) && a !== 'delete') groups[2].push(row(b, a));
    if (by.has('puente-denunciar')) groups[3].push(row(by.get('puente-denunciar'), 'puente-denunciar'));
    if (by.has('delete')) groups[3].push(row(by.get('delete'), 'delete'));
    groups.filter(g => g.length).forEach((g, i) => {
      if (i) menu.appendChild(el('div', 'puente-mm-sep'));
      g.forEach(b => menu.appendChild(b));
    });
    // Que entre en la pantalla con su tamano nuevo
    const mr = menu.getBoundingClientRect();
    if (mr.right > innerWidth - 8) menu.style.left = Math.max(8, innerWidth - mr.width - 8) + 'px';
    if (mr.bottom > innerHeight - 8) menu.style.top = Math.max(8, innerHeight - mr.height - 8) + 'px';
  }

  let tries = 0;
  (function wait() {
    const app = window.app;
    const box = document.getElementById('messages');
    if (!app || !box || typeof app._showMessageContextMenu !== 'function') { if (++tries < 120) setTimeout(wait, 500); return; }
    loadQuick();
    setInterval(loadQuick, 10 * 60 * 1000);
    box.addEventListener('mouseover', (e) => {
      const msgEl = e.target instanceof Element && e.target.closest('.message, .message-compact');
      if (msgEl && msgEl.dataset.msgId) { try { decorate(app, msgEl); } catch (err) { console.warn('[puente] barrita del mensaje:', err); } }
    });
    const show = app._showMessageContextMenu;
    app._showMessageContextMenu = function (e, msgEl, ...rest) {
      const r = show.call(this, e, msgEl, ...rest);
      try { if (msgEl) restyle(this, msgEl); } catch (err) { console.warn('[puente] menu del mensaje:', err); }
      return r;
    };
  })();
})();
// Medallas en la tarjeta de perfil (logros.js): una fila debajo del nombre, como
// las insignias de Discord, con la racha si esta encendida. En la tarjeta propia,
// ademas, el acceso a "Tu historia".
(function () {
  'use strict';
  const token = () => { try { return localStorage.getItem('haven_token'); } catch { return null; } };
  const cache = new Map(); // id -> { at, data }
  const style = document.createElement('style');
  style.textContent = `
    .puente-medallas { display: flex; flex-wrap: wrap; gap: 4px; margin: 8px 0 2px; }
    .puente-medalla { display: inline-flex; align-items: center; gap: 4px; background: var(--bg-tertiary, rgba(0,0,0,.25)); border-radius: 6px; padding: 2px 7px; font-size: 12px; font-weight: 600; color: var(--text-primary, #f2f3f5); cursor: default; }
    .puente-historia-btn { display: flex; align-items: center; justify-content: center; gap: 6px; margin: 10px 0 2px; padding: 8px 10px; border-radius: 6px; background: #5865f2; color: #fff !important; font-weight: 600; font-size: 14px; text-decoration: none !important; }
    .puente-historia-btn:hover { background: #4752c4; }
    .puente-medalla { cursor: pointer; -webkit-tap-highlight-color: transparent; }
    #puente-medalla-globo { position: fixed; z-index: 100020; max-width: min(17rem, calc(100vw - 16px)); padding: .5rem .75rem; border-radius: .5rem; background: #111214; color: #dbdee1; box-shadow: 0 8px 24px rgba(0,0,0,.45); font-size: .875rem; line-height: 1.35; pointer-events: none; animation: puente-fade .12s ease-out; }
    #puente-medalla-globo b { display: block; color: #f2f3f5; font-size: .9375rem; margin-bottom: .125rem; }
    #puente-medalla-globo::after { content: ''; position: absolute; left: var(--flecha, 50%); width: .625rem; height: .625rem; background: #111214; transform: translateX(-50%) rotate(45deg); }
    #puente-medalla-globo.abajo::after { top: -.3125rem; }
    #puente-medalla-globo:not(.abajo)::after { bottom: -.3125rem; }
    #puente-historia-capa { position: fixed; inset: 0; z-index: 100000; background: rgba(0,0,0,.7); display: flex; align-items: center; justify-content: center; animation: puente-fade .18s ease-out; }
    #puente-historia-capa iframe { width: min(720px, 100vw - 32px); height: min(92vh, 100%); border: 0; border-radius: 12px; background: #1e1f22; box-shadow: 0 12px 48px rgba(0,0,0,.55); }
    @media (max-width: 768px) { #puente-historia-capa iframe { width: 100vw; height: 100%; border-radius: 0; } }`;
  document.head.appendChild(style);

  // "Tu historia" en una ventana encima de la app: al cerrarla se sigue donde se estaba
  function closeHistoria() {
    const c = document.getElementById('puente-historia-capa');
    if (!c) return;
    c.remove();
    document.removeEventListener('keydown', onKey, true);
  }
  function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); closeHistoria(); } }
  function openHistoria() {
    closeHistoria();
    const app = window.app;
    try { if (app && typeof app._closeProfilePopup === 'function') app._closeProfilePopup(); else document.getElementById('profile-popup')?.remove(); } catch { /* sigue */ }
    const capa = document.createElement('div');
    capa.id = 'puente-historia-capa';
    capa.addEventListener('click', (e) => { if (e.target === capa) closeHistoria(); });
    const frame = document.createElement('iframe');
    frame.src = '/puente/historia?embebida=1';
    frame.title = 'Tu historia';
    frame.allow = 'clipboard-write; web-share';
    capa.appendChild(frame);
    document.body.appendChild(capa);
    document.addEventListener('keydown', onKey, true);
    frame.addEventListener('load', () => { try { frame.contentWindow.focus(); } catch { /* sigue */ } });
  }
  window.puenteHistoria = { abrir: openHistoria };
  window.addEventListener('message', (e) => {
    if (e.origin !== location.origin || !e.data || e.data.puente !== 'historia') return;
    if (e.data.accion === 'cerrar') closeHistoria();
    else if (e.data.accion === 'abrir' && typeof e.data.url === 'string') {
      closeHistoria();
      if (!(window.puenteEnlaces && window.puenteEnlaces.abrir && window.puenteEnlaces.abrir(e.data.url))) location.href = e.data.url;
    }
  });

  let tipTimer = null;
  function hideTip() { clearTimeout(tipTimer); document.getElementById('puente-medalla-globo')?.remove(); }
  function showTip(anchor, m) {
    const prev = document.getElementById('puente-medalla-globo');
    if (prev && prev.dataset.para === m.nombre) { hideTip(); return; } // segundo toque: se cierra
    hideTip();
    const tip = document.createElement('div');
    tip.id = 'puente-medalla-globo'; tip.dataset.para = m.nombre; tip.setAttribute('role', 'tooltip');
    const t = document.createElement('b'); t.textContent = m.emoji + ' ' + m.nombre;
    tip.append(t, document.createTextNode(m.detalle || ''));
    document.body.appendChild(tip);
    const r = anchor.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight, M = 8;
    let left = Math.min(Math.max(M, r.left + r.width / 2 - w / 2), innerWidth - w - M);
    let top = r.top - h - 10;
    if (top < M) { top = r.bottom + 10; tip.classList.add('abajo'); }
    tip.style.left = left + 'px'; tip.style.top = top + 'px';
    tip.style.setProperty('--flecha', Math.min(Math.max(12, r.left + r.width / 2 - left), w - 12) + 'px');
    tipTimer = setTimeout(hideTip, 4000);
  }
  // Tocar en otro lado, desplazar o cerrar la tarjeta lo saca
  document.addEventListener('pointerdown', (e) => { if (!(e.target instanceof Element && e.target.closest('.puente-medalla'))) hideTip(); }, true);
  addEventListener('scroll', hideTip, true);

  async function load(id) {
    const hit = cache.get(id);
    if (hit && Date.now() - hit.at < 5 * 60 * 1000) return hit.data;
    const tk = token();
    if (!tk) return null;
    const r = await fetch('/puente/api/logros/medallas?u=' + encodeURIComponent(id), { headers: { Authorization: 'Bearer ' + tk } });
    if (!r.ok) return null;
    const data = await r.json();
    cache.set(id, { at: Date.now(), data });
    return data;
  }

  // Sus numeros en los canales abiertos (actividad.js): mensajes, canal favorito y puesto del mes
  const stats = new Map();
  function loadStats(id) {
    const hit = stats.get(id);
    if (hit && Date.now() - hit.at < 5 * 60 * 1000) return hit.p;
    const tk = token();
    if (!tk) return Promise.resolve(null);
    const p = fetch('/puente/api/actividad/perfil?u=' + encodeURIComponent(id), { headers: { Authorization: 'Bearer ' + tk } })
      .then(r => r.ok ? r.json() : null).catch(() => null);
    stats.set(id, { at: Date.now(), p });
    return p;
  }
  function paintStats(popup, profile, d) {
    if (!d || !d.mensajes || !popup.isConnected || popup.dataset.puenteMedallas !== String(profile.id) || popup.querySelector('.puente-perfil-est')) return;
    const names = popup.querySelector('.profile-popup-names');
    if (!names) return;
    const row = document.createElement('div');
    row.className = 'puente-perfil-est';
    const dato = (n, t, tip) => { const b = document.createElement('span'); b.className = 'puente-perfil-dato'; b.title = tip; const x = document.createElement('b'); x.textContent = n; b.append(x, ' ' + t); row.appendChild(b); };
    dato(d.mensajes.toLocaleString('es-AR'), d.mensajes === 1 ? 'mensaje' : 'mensajes', 'Mensajes en los canales abiertos de CV Chat');
    if (d.canal) dato('#' + d.canal, '', 'Donde más escribe');
    if (d.puestoMes) dato('#' + d.puestoMes, 'del mes', 'Puesto en el ranking de mensajes de este mes');
    (popup.querySelector('.puente-medallas') || names).insertAdjacentElement('afterend', row);
  }

  function paint(popup, profile, data, isSelf, st) {
    if (!popup.isConnected || popup.dataset.puenteMedallas === String(profile.id)) return;
    const names = popup.querySelector('.profile-popup-names');
    if (!names) return;
    popup.dataset.puenteMedallas = String(profile.id);
    let items = (data && data.medallas || []).slice();
    if (data && data.racha) {
      // Con la racha encendida, una sola: "🔥 9 días" (la medalla de racha va en el detalle)
      const isStreak = m => /^racha/.test(m.id || '') || /^Racha de /.test(m.nombre || '');
      const medal = items.find(isStreak);
      items = items.filter(m => !isStreak(m));
      items.push({ emoji: '🔥', nombre: data.racha + (data.racha === 1 ? ' día' : ' días'),
        detalle: `Racha: ${data.racha} días seguidos escribiendo en CV Chat` + (medal ? ` · Medalla: ${medal.nombre}` : '') });
    }
    if (items.length) {
      const row = document.createElement('div');
      row.className = 'puente-medallas';
      for (const m of items) {
        const b = document.createElement('span');
        b.className = 'puente-medalla';
        b.title = m.detalle || m.nombre;
        b.setAttribute('role', 'button');
        b.tabIndex = 0;
        b.addEventListener('click', (e) => { e.stopPropagation(); showTip(b, m); });
        b.textContent = m.emoji + ' ' + m.nombre;
        row.appendChild(b);
      }
      names.insertAdjacentElement('afterend', row);
    }
    if (st) st.then(d => paintStats(popup, profile, d));
    // Su muñeco de CV Hotel (hotel.js lo arma como imagen: /puente/api/hotel/muneco/<id>.png). Si no armó uno, nada
    {
      const pid = String(profile.id);
      const img = new Image();
      img.alt = ''; img.decoding = 'async';
      img.onload = () => {
        if (!popup.isConnected || popup.dataset.puenteMedallas !== pid || popup.querySelector('.puente-perfil-hotel')) return;
        const box = document.createElement('div');
        box.className = 'puente-perfil-hotel';
        box.style.cssText = 'display:flex;align-items:center;gap:10px;margin:8px 0 2px;';
        img.style.cssText = 'height:72px;width:auto;image-rendering:pixelated;flex:none;';
        const t = document.createElement('span');
        t.style.cssText = 'font-size:12px;opacity:.8;';
        t.textContent = isSelf ? 'Tu muñeco en CV Hotel' : 'Su muñeco en CV Hotel';
        box.append(img, t);
        (popup.querySelector('.puente-perfil-est') || popup.querySelector('.puente-medallas') || names).insertAdjacentElement('afterend', box);
      };
      img.src = '/puente/api/hotel/muneco/' + encodeURIComponent(pid) + '.png';
    }
    if (isSelf) {
      const a = document.createElement('a');
      a.className = 'puente-historia-btn';
      a.href = '/puente/historia';
      a.textContent = 'Tu historia';
      a.addEventListener('click', (e) => { e.preventDefault(); openHistoria(); });
      (popup.querySelector('.puente-medallas') || names).insertAdjacentElement('afterend', a);
      const inv = document.createElement('button');
      inv.type = 'button'; inv.className = 'puente-invitar-btn'; inv.textContent = 'Invitar gente';
      inv.addEventListener('click', () => { try { window.app._closeProfilePopup(); } catch { /* sigue */ } if (window.puenteInvitar) window.puenteInvitar(); });
      a.insertAdjacentElement('afterend', inv);
      // "✏️ Editar perfil" y "📝 Notas personales" de Haven, sin el emoji (como los demas botones)
      for (const b of popup.querySelectorAll('.profile-popup-action-btn')) {
        const t = b.firstChild;
        if (t && t.nodeType === 3) t.nodeValue = t.nodeValue.replace(/^[\s\p{Extended_Pictographic}️‍]+/u, '');
      }
    }
  }

  let tries = 0;
  (function wait() {
    const app = window.app;
    if (!app || typeof app._showProfilePopup !== 'function') { if (++tries < 120) setTimeout(wait, 500); return; }
    const show = app._showProfilePopup;
    app._showProfilePopup = function (profile, ...rest) {
      const r = show.call(this, profile, ...rest);
      try {
        const popup = document.getElementById('profile-popup');
        if (popup && profile && profile.id != null && profile.username !== 'discord-historial') {
          const isSelf = !!(this.user && profile.id === this.user.id);
          if (window.puentePerfil) window.puentePerfil.paintPopup(popup, profile.id);
          const st = loadStats(profile.id);
          load(profile.id).then(data => paint(popup, profile, data, isSelf, st)).catch(() => paint(popup, profile, null, isSelf, st));
        }
      } catch (err) { console.warn('[puente] medallas:', err); }
      return r;
    };
  })();
})();
// Descripcion del canal en el celular, como en la app de Discord: una linea gris
// debajo del nombre (sin la barra de Haven con la flechita, que en el celular
// quedaba cortada y era dificil de tocar). Tocando el nombre o la descripcion
// se abre una hoja desde abajo con la descripcion entera y, para quien puede
// cambiarla, "Editar descripción" (la ventana de Haven).
(function () {
  'use strict';
  const mobile = () => window.matchMedia('(max-width: 768px)').matches;
  const current = (app) => (app.channels || []).find(c => c.code === app.currentChannel) || null;
  const canEdit = (app) => !!(app.user && (app.user.isAdmin || (app._hasPerm && app._hasPerm('set_channel_topic'))));

  function refresh(app) {
    const info = document.querySelector('header.channel-header > .channel-info');
    if (!info) return;
    let line = info.querySelector('.puente-tema');
    if (!line) {
      line = document.createElement('div');
      line.className = 'puente-tema';
      info.appendChild(line);
      info.addEventListener('click', (e) => {
        if (!mobile() || !window.app || !window.app.currentChannel) return;
        const ch = current(window.app);
        if (!ch || ch.is_dm) return;
        const hit = picos.get(ch.code);
        if (!ch.topic && !canEdit(window.app) && !(hit && hit.listo && hit.listo.pico)) return;
        e.preventDefault();
        openSheet(window.app, ch);
      });
    }
    const ch = current(app);
    const topic = ch && !ch.is_dm ? String(ch.topic || '').replace(/\s+/g, ' ').trim() : '';
    line.textContent = topic;
    line.hidden = !topic;
    info.classList.toggle('puente-con-tema', !!topic);
    pintarPico(info, ch);
  }

  // Hora pico del canal: las dos horas con mas mensajes de las ultimas 4 semanas (actividad.js).
  // En la PC va al lado del nombre; en el celular, en la hoja de la descripcion
  const picos = new Map();
  const textoPico = (p) => `${p[0]} a ${p[1]} h`;
  function pico(code) {
    const hit = picos.get(code);
    if (hit && Date.now() - hit.at < 30 * 60 * 1000) return hit.p;
    const tk = localStorage.getItem('haven_token');
    if (!tk) return Promise.resolve({ pico: null });
    const p = fetch('/puente/api/actividad/canal?code=' + encodeURIComponent(code), { headers: { Authorization: 'Bearer ' + tk } })
      .then(r => r.ok ? r.json() : { pico: null }).catch(() => ({ pico: null }));
    const hit2 = { at: Date.now(), p, listo: null };
    p.then(d => { hit2.listo = d; });
    picos.set(code, hit2);
    return p;
  }
  function pintarPico(info, ch) {
    let chip = info.querySelector('.puente-pico');
    if (!ch || ch.is_dm) { if (chip) chip.hidden = true; return; }
    if (!chip) {
      chip = document.createElement('span');
      chip.className = 'puente-pico';
      chip.title = 'Las dos horas con más mensajes de las últimas 4 semanas';
      info.appendChild(chip);
    }
    const code = ch.code;
    chip.hidden = true;
    pico(code).then(d => {
      if (!chip.isConnected || !window.app || window.app.currentChannel !== code) return;
      chip.textContent = d && d.pico ? '🔥 Más movido de ' + textoPico(d.pico) : '';
      chip.hidden = !(d && d.pico);
    });
  }

  // Texto con los enlaces tocables (sin HTML del usuario)
  function fill(el, text) {
    const re = /https?:\/\/[^\s<>"']+/g;
    let last = 0, m;
    while ((m = re.exec(text))) {
      el.appendChild(document.createTextNode(text.slice(last, m.index)));
      const a = document.createElement('a');
      a.href = m[0]; a.textContent = m[0]; a.target = '_blank'; a.rel = 'noopener noreferrer';
      el.appendChild(a);
      last = m.index + m[0].length;
    }
    el.appendChild(document.createTextNode(text.slice(last)));
  }

  function closeSheet() {
    document.getElementById('puente-tema-hoja')?.remove();
    document.getElementById('puente-tema-fondo')?.remove();
  }

  function openSheet(app, ch) {
    closeSheet();
    const back = document.createElement('div');
    back.id = 'puente-tema-fondo';
    back.addEventListener('click', closeSheet);
    const sheet = document.createElement('div');
    sheet.id = 'puente-tema-hoja';
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-label', 'Descripción del canal');
    const handle = document.createElement('div'); handle.className = 'puente-sheet-handle';
    const title = document.createElement('div'); title.className = 'puente-tema-titulo';
    title.textContent = '# ' + (ch.name || '');
    const label = document.createElement('div'); label.className = 'puente-tema-etiqueta';
    label.textContent = 'Descripción del canal';
    const body = document.createElement('div'); body.className = 'puente-tema-texto';
    if (ch.topic) fill(body, String(ch.topic)); else { body.textContent = 'Este canal todavía no tiene descripción.'; body.classList.add('vacio'); }
    sheet.append(handle, title, label, body);
    const hit = picos.get(ch.code);
    if (hit && hit.listo && hit.listo.pico) {
      const pl = document.createElement('div'); pl.className = 'puente-tema-etiqueta puente-tema-pico-t';
      pl.textContent = 'Cuándo hay más gente';
      const pv = document.createElement('div'); pv.className = 'puente-tema-texto puente-tema-pico';
      pv.textContent = '🔥 De ' + textoPico(hit.listo.pico) + ' es cuando más se escribe acá (últimas 4 semanas).';
      sheet.append(pl, pv);
    }
    if (canEdit(app)) {
      const edit = document.createElement('button');
      edit.type = 'button'; edit.className = 'puente-tema-editar';
      edit.textContent = ch.topic ? 'Editar descripción' : 'Agregar descripción';
      edit.addEventListener('click', () => { closeSheet(); app._editTopic(); });
      sheet.appendChild(edit);
    }
    // Deslizar hacia abajo la cierra, como las otras hojas
    let y0 = null;
    sheet.addEventListener('touchstart', (e) => { y0 = sheet.scrollTop <= 0 ? e.touches[0].clientY : null; }, { passive: true });
    sheet.addEventListener('touchmove', (e) => {
      if (y0 == null) return;
      const dy = e.touches[0].clientY - y0;
      if (dy > 0) sheet.style.transform = `translateY(${dy}px)`;
    }, { passive: true });
    sheet.addEventListener('touchend', (e) => {
      if (y0 == null) return;
      const dy = e.changedTouches[0].clientY - y0; y0 = null;
      if (dy > 80) closeSheet(); else sheet.style.transform = '';
    });
    document.body.append(back, sheet);
  }

  let tries = 0;
  (function wait() {
    const app = window.app;
    if (!app || typeof app._updateTopicBar !== 'function' || typeof app.switchChannel !== 'function') { if (++tries < 120) setTimeout(wait, 500); return; }
    const upd = app._updateTopicBar;
    app._updateTopicBar = function (...args) {
      const r = upd.apply(this, args);
      try { refresh(this); } catch (err) { console.warn('[puente] descripcion:', err); }
      return r;
    };
    const sw = app.switchChannel;
    app.switchChannel = function (...args) {
      closeSheet();
      const r = sw.apply(this, args);
      Promise.resolve(r).finally(() => { try { refresh(app); } catch { /* queda como estaba */ } });
      return r;
    };
    if (typeof app._showWelcome === 'function') {
      const wel = app._showWelcome;
      app._showWelcome = function (...args) { const r = wel.apply(this, args); try { refresh(this); } catch { /* idem */ } return r; };
    }
    // Cuando alguien cambia la descripcion, Haven actualiza la lista de canales
    if (app.socket) app.socket.on('channel-topic-changed', () => setTimeout(() => refresh(app), 0));
    refresh(app);
  })();
})();

// Celular: el encabezado del canal y la lupa como en la app de Discord.
//  - Arriba: la flecha "←" (abre la lista de canales, como el menu de antes),
//    "# canal ›" (tocandolo, la descripcion del canal) y la lupa a la derecha. La
//    descripcion ya no va debajo del nombre y el boton de miembros pasa a la lupa.
//  - La lupa abre una pantalla con el buscador ("en: #canal") y las pestañas de
//    Discord: Miembros (con "Invitar gente" arriba), Multimedia, Fijados, Hilos,
//    Enlaces y Archivos. Usa el buscador de Haven (con lo que le agrega
//    buscar.js), asi que solo muestra lo que la persona puede ver. Tocar un
//    resultado lleva al mensaje (o abre el hilo). El atras del telefono la cierra.
// Ademas, en todos lados: al principio de un canal, "¡Te damos la bienvenida a
// #canal!" como en Discord; los mensajes de bots y webhooks de Discord con la
// etiqueta "APP" (como se ven en Discord) en vez de "DISCORD"; y en el celular,
// al lado de las reacciones de un mensaje, el boton gris para agregar otra.
(function () {
  'use strict';
  const mobile = () => matchMedia('(max-width: 768px)').matches;
  const coarse = matchMedia('(pointer: coarse)').matches;
  const byId = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null && text !== '') n.textContent = text; return n; };
  const token = () => { try { return localStorage.getItem('haven_token'); } catch { return null; } };
  const svg = (d, s = 24) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" aria-hidden="true"><path fill="currentColor" d="${d}"/></svg>`;
  const ARROW = 'M20 11H7.8l5.6-5.6L12 4l-8 8 8 8 1.4-1.4L7.8 13H20v-2Z';
  const LENS = 'M15.5 14h-.8l-.3-.3A6.5 6.5 0 1 0 14 15.5l.3.3v.8l5 5 1.5-1.5-5-5Zm-6 0a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9Z';
  const BACK = 'M15.4 7.4 14 6l-6 6 6 6 1.4-1.4L10.8 12l4.6-4.6Z';
  const SMILE = 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm-3.5 6a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Zm7 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM12 18a5.5 5.5 0 0 1-5-3.2h10A5.5 5.5 0 0 1 12 18Z';
  const INVITE = 'M14 8a4 4 0 1 1-8 0 4 4 0 0 1 8 0Zm-4 6c-4 0-7 2-7 4.5V20h11.2a6 6 0 0 1-.2-1.5c0-1.6.6-3 1.6-4.1A12 12 0 0 0 10 14Zm9 0h-2v3h-3v2h3v3h2v-3h3v-2h-3v-3Z';
  const current = (app) => (app.channels || []).find(c => c.code === app.currentChannel) || null;

  // ── Encabezado ──
  function header() {
    const menu = byId('mobile-menu-btn');
    if (menu && !menu.dataset.puenteFlecha) { menu.dataset.puenteFlecha = '1'; menu.innerHTML = svg(ARROW, 24); menu.setAttribute('aria-label', 'Canales'); menu.title = 'Canales'; }
    const users = byId('mobile-users-btn');
    if (users && !byId('puente-lupa')) {
      const b = el('button', 'puente-lupa');
      b.id = 'puente-lupa'; b.type = 'button'; b.title = 'Buscar'; b.setAttribute('aria-label', 'Buscar');
      b.innerHTML = '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/></svg>';
      b.addEventListener('click', (e) => { e.stopPropagation(); open(window.app); });
      users.parentElement.insertBefore(b, users);
    }
  }

  // ── Pantalla de la lupa ──
  const TABS = [
    ['miembros', 'Miembros'], ['multimedia', 'Multimedia', 'has:image'], ['fijados', 'Fijados', 'pinned:true'],
    ['hilos', 'Hilos', 'has:thread'], ['enlaces', 'Enlaces', 'has:link'], ['archivos', 'Archivos', 'has:document'],
  ];
  let page = null, membersHome = null, seq = 0, state = null;

  function close() {
    if (!page) return;
    const list = byId('online-users');
    if (list && membersHome && page.contains(list)) membersHome.parent.insertBefore(list, membersHome.next && membersHome.next.parentNode === membersHome.parent ? membersHome.next : null);
    membersHome = null;
    page.remove(); page = null; state = null;
  }
  window.puenteLupa = { abierta: () => !!page, cerrar: close };

  const fecha = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString('es-AR', { day: 'numeric', month: 'numeric', year: 'numeric' }) + ' ' + d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }); };
  const IMG_RE = /(\/uploads\/[^\s)"'<>]+?\.(?:png|jpe?g|gif|webp))(?=[\s)"'<>?]|$)|(https?:\/\/[^\s)"'<>]*(?:giphy\.com|tenor\.com)[^\s)"'<>]*)/ig;
  function images(content) {
    const out = [];
    for (const m of String(content || '').matchAll(IMG_RE)) {
      if (m[1]) out.push({ src: /\.gif$/i.test(m[1]) ? m[1] : '/puente/mini/480/' + m[1].replace(/^\/uploads\//, ''), full: m[1] });
      else out.push({ src: m[2], full: m[2] });
    }
    return out;
  }
  function preview(content) {
    return String(content || '')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' 🖼️ ')
      .replace(/\[file:([^\]]+)\]\([^)]*\)/g, ' 📎 $1 ')
      .replace(/\[([^\]]*)\]\((\/uploads\/[^)]*)\)/g, (m, t, u) => ' 📎 ' + (t || u.split('/').pop()) + ' ')
      .replace(/\[([^\]]+)\]\((https?:[^)]*)\)/g, '$1')
      .replace(/<(https?:[^>\s]+)>/g, '$1')
      .replace(/^>\s?/gm, '').replace(/[*_~`|]+/g, '')
      .replace(/\s+/g, ' ').trim().slice(0, 240);
  }
  function go(app, r, thread) {
    close();
    const url = location.origin + '/app?channel=' + r.channel_code + '&message=' + r.id;
    if (window.puenteEnlaces && window.puenteEnlaces.abrir(url)) {
      if (thread && typeof app._openThread === 'function') setTimeout(() => { try { app._openThread(r.id); } catch { /* sigue */ } }, 900);
    }
  }
  function row(app, r, kind) {
    const b = el('button', 'pl-fila');
    b.type = 'button';
    if (kind === 'hilos') {
      // Como en Discord: el nombre del hilo y cuantas respuestas tiene
      const ic = el('div', 'pl-avatar pl-hilo-icono');
      ic.innerHTML = svg('M4 5h16v2H4V5Zm0 6h10v2H4v-2Zm0 6h16v2H4v-2Zm14-6.5 3 1.5-3 1.5v-3Z', 22);
      const body = el('div', 'pl-cuerpo');
      body.appendChild(el('div', 'pl-nombre pl-hilo-nombre', preview(r.content).replace(/^🧵\s*/, '') || 'Hilo'));
      const n = r.thread_count || 0;
      body.appendChild(el('div', 'pl-fecha', n + (n === 1 ? ' respuesta' : ' respuestas') + ' · ' + fecha(r.created_at) + (r.username && r.username !== 'Discord' ? ' · ' + r.username : '')));
      b.append(ic, body);
      b.addEventListener('click', () => go(app, r, true));
      return b;
    }
    const av = el('div', 'pl-avatar');
    if (r.avatar) { const img = el('img'); img.src = r.avatar; img.alt = ''; img.loading = 'lazy'; img.onerror = () => { img.remove(); av.textContent = String(r.username || '?').charAt(0).toUpperCase(); }; av.appendChild(img); }
    else av.textContent = String(r.username || '?').charAt(0).toUpperCase();
    const body = el('div', 'pl-cuerpo');
    const top = el('div', 'pl-arriba');
    top.append(el('span', 'pl-nombre', r.username || ''), el('span', 'pl-fecha', fecha(r.created_at)));
    body.appendChild(top);
    const text = preview(r.content);
    if (text) body.appendChild(el('div', 'pl-texto', text));
    if (kind === 'hilos' || r.thread_count) body.appendChild(el('div', 'pl-hilo', '🧵 ' + (r.thread_count || 0) + (r.thread_count === 1 ? ' respuesta' : ' respuestas')));
    b.append(av, body);
    b.addEventListener('click', () => go(app, r, kind === 'hilos'));
    return b;
  }

  function search(app, query, pageNo) {
    const tk = 'puente-lupa-' + (++seq);
    return new Promise((resolve) => {
      const done = (d) => { if (d && d.token === tk) { app.socket.off('search-results', done); clearTimeout(t); resolve(d); } };
      const t = setTimeout(() => { app.socket.off('search-results', done); resolve(null); }, 15000);
      app.socket.on('search-results', done);
      app.socket.emit('search-messages', { query, page: pageNo, sort: 'newest', token: tk });
    });
  }

  // Una lista (pestaña o busqueda) que trae mas al llegar al final
  function list(app, query, kind) {
    const box = page.querySelector('.pl-contenido');
    box.textContent = '';
    const wrap = el('div', kind === 'multimedia' ? 'pl-grilla' : 'pl-lista');
    box.appendChild(wrap);
    const status = el('div', 'pl-estado', 'Cargando…');
    box.appendChild(status);
    const st = state = { query, kind, page: 0, total: Infinity, loading: false, shown: 0 };
    const more = async () => {
      if (st !== state || st.loading || st.shown >= st.total) return;
      st.loading = true;
      const d = await search(app, query, st.page + 1);
      if (st !== state || !page) return;
      st.loading = false;
      if (!d) { status.textContent = 'No se pudo buscar. Probá de nuevo.'; return; }
      st.page = d.page || st.page + 1; st.total = d.total || 0;
      const res = d.results || [];
      st.shown += res.length;
      if (!res.length) st.total = st.shown; // por las dudas: nada mas
      for (const r of res) {
        if (kind === 'multimedia') {
          for (const im of images(r.content)) {
            const b = el('button', 'pl-foto'); b.type = 'button';
            const img = el('img'); img.src = im.src; img.alt = ''; img.loading = 'lazy';
            img.onerror = () => { if (img.src.indexOf('/puente/mini/') >= 0) img.src = im.full; else b.remove(); };
            b.appendChild(img);
            b.addEventListener('click', () => go(app, r));
            wrap.appendChild(b);
          }
        } else wrap.appendChild(row(app, r, kind));
      }
      if (!st.shown) status.textContent = kind === 'busqueda' ? 'No hay resultados.' : 'Todavía no hay nada acá.';
      else status.textContent = st.shown >= st.total ? '' : 'Cargando…';
      // Si no llena la pantalla, traer mas
      if (st.shown < st.total && box.scrollHeight <= box.clientHeight + 40) more();
    };
    box.onscroll = () => { if (box.scrollTop + box.clientHeight > box.scrollHeight - 300) more(); };
    more();
  }

  function members(app) {
    const box = page.querySelector('.pl-contenido');
    box.textContent = ''; box.onscroll = null; state = null;
    if (window.puenteInvitar) {
      const inv = el('button', 'pl-invitar'); inv.type = 'button';
      inv.innerHTML = svg(INVITE, 24);
      inv.appendChild(el('span', '', 'Invitar gente'));
      inv.insertAdjacentHTML('beforeend', svg('M9.4 18 8 16.6l4.6-4.6L8 7.4 9.4 6l6 6-6 6Z', 22));
      inv.addEventListener('click', () => { close(); window.puenteInvitar(); });
      box.appendChild(inv);
    }
    // La lista de Haven (la del panel de la derecha), mientras la pantalla esta abierta
    const listEl = byId('online-users');
    if (listEl) {
      if (!membersHome) membersHome = { parent: listEl.parentElement, next: listEl.nextSibling };
      box.appendChild(listEl);
    }
  }

  function scope(app) {
    return page && page.dataset.canal ? 'in:#' + page.dataset.canal + ' ' : '';
  }
  function show(app, tab) {
    page.querySelectorAll('.pl-tab').forEach(b => b.classList.toggle('activa', b.dataset.tab === tab));
    page.querySelector('.pl-tabs').hidden = false;
    // Volver a poner la lista de miembros en su lugar si se cambia de pestaña
    const listEl = byId('online-users');
    if (tab !== 'miembros' && listEl && membersHome && page.contains(listEl)) {
      membersHome.parent.insertBefore(listEl, membersHome.next && membersHome.next.parentNode === membersHome.parent ? membersHome.next : null);
      membersHome = null;
    }
    if (tab === 'miembros') return members(app);
    const t = TABS.find(x => x[0] === tab);
    list(app, scope(app) + t[2], tab);
  }

  function open(app) {
    if (!app || !app.socket) return;
    close();
    const ch = current(app);
    page = el('div', 'puente-lupa-pagina');
    page.id = 'puente-buscar-cel';
    if (ch && !ch.is_dm) page.dataset.canal = ch.code;
    const head = el('div', 'pl-cabeza');
    const back = el('button', 'pl-atras'); back.type = 'button'; back.setAttribute('aria-label', 'Volver');
    back.innerHTML = svg(BACK, 30);
    back.addEventListener('click', close);
    const field = el('label', 'pl-campo');
    field.insertAdjacentHTML('beforeend', svg(LENS, 22));
    if (page.dataset.canal) {
      const chip = el('button', 'pl-chip'); chip.type = 'button';
      chip.append(el('span', 'pl-chip-en', 'en:'), document.createTextNode(' ' + (ch.name || '')));
      chip.title = 'Buscar en todos los canales';
      chip.addEventListener('click', (e) => { e.preventDefault(); delete page.dataset.canal; chip.remove(); const a = page.querySelector('.pl-tab.activa'); if (a && a.dataset.tab !== 'miembros') show(app, a.dataset.tab); });
      field.appendChild(chip);
    }
    const input = el('input', 'pl-input');
    input.type = 'search'; input.placeholder = 'Buscar'; input.enterKeyHint = 'search';
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const q = input.value.trim();
      if (!q) { const a = page.querySelector('.pl-tab.activa'); show(app, a ? a.dataset.tab : 'miembros'); return; }
      input.blur();
      page.querySelector('.pl-tabs').hidden = true;
      list(app, scope(app) + q, 'busqueda');
    });
    input.addEventListener('input', () => { if (!input.value.trim() && page.querySelector('.pl-tabs').hidden) { const a = page.querySelector('.pl-tab.activa'); show(app, a ? a.dataset.tab : 'miembros'); } });
    field.appendChild(input);
    head.append(back, field);
    const tabs = el('div', 'pl-tabs');
    for (const [id, label] of TABS) {
      const b = el('button', 'pl-tab', label); b.type = 'button'; b.dataset.tab = id;
      b.addEventListener('click', () => { input.value = ''; show(app, id); b.scrollIntoView({ inline: 'nearest', block: 'nearest' }); });
      tabs.appendChild(b);
    }
    page.append(head, tabs, el('div', 'pl-contenido'));
    document.body.appendChild(page);
    show(app, 'miembros');
  }

  // ── Bienvenida al principio del canal ──
  function welcome(app) {
    const box = byId('messages');
    if (!box) return;
    const ch = current(app);
    const want = !!(ch && !ch.is_dm && !ch.is_group && app._noMoreHistory && box.querySelector('.message, .message-compact') &&
      !(app._isForumFeed && app._isForumFeed()));
    const have = box.querySelector(':scope > .puente-inicio');
    if (!want) { if (have) have.remove(); return; }
    if (have && have.dataset.canal === ch.code && box.firstElementChild === have) return;
    if (have) have.remove();
    const w = el('div', 'puente-inicio');
    w.dataset.canal = ch.code;
    w.appendChild(el('div', 'pi-numeral', '#'));
    w.appendChild(el('div', 'pi-titulo', '¡Te damos la bienvenida a #' + (ch.name || '') + '!'));
    w.appendChild(el('div', 'pi-texto', 'Este es el comienzo del canal #' + (ch.name || '') + '.'));
    box.insertBefore(w, box.firstChild);
  }

  // ── "APP" en los bots y webhooks de Discord ──
  const apps = new Map(); // id -> true/false
  let askTimer = null;
  function badges() {
    const want = [];
    for (const b of document.querySelectorAll('#messages .discord-badge:not([data-puente-app]), #thread-panel .discord-badge:not([data-puente-app])')) {
      const m = b.closest('[data-msg-id]');
      const id = m && m.dataset.msgId;
      if (!id) continue;
      if (apps.has(id)) { b.dataset.puenteApp = apps.get(id) ? '1' : '0'; if (apps.get(id)) { b.textContent = 'APP'; b.classList.add('puente-app'); } }
      else want.push(id);
    }
    if (!want.length || askTimer) return;
    askTimer = setTimeout(() => {
      askTimer = null;
      const ids = [...new Set(want)].slice(0, 200);
      fetch('/puente/api/apps?ids=' + ids.join(','), { headers: { Authorization: 'Bearer ' + token() } })
        .then(r => (r.ok ? r.json() : null)).then(d => {
          if (!d || !Array.isArray(d.apps)) return;
          const yes = new Set(d.apps.map(String));
          for (const id of ids) apps.set(id, yes.has(id));
          badges();
        }).catch(() => {});
    }, 150);
  }

  // ── Boton para agregar una reaccion, al lado de las reacciones (celular) ──
  function addButtons(app) {
    if (!coarse) return;
    for (const rowEl of document.querySelectorAll('#messages .reactions-row, #thread-panel .reactions-row')) {
      if (!rowEl.querySelector('.reaction-badge') || rowEl.querySelector('.puente-mas-reaccion')) continue;
      const msgEl = rowEl.closest('[data-msg-id]');
      if (!msgEl) continue;
      const b = el('button', 'puente-mas-reaccion'); b.type = 'button'; b.setAttribute('aria-label', 'Agregar reacción');
      b.innerHTML = svg(SMILE, 20);
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        if (typeof app._showReactionPicker === 'function') app._showReactionPicker(msgEl, parseInt(msgEl.dataset.msgId, 10));
      });
      rowEl.appendChild(b);
    }
  }

  let tries = 0;
  (function wait() {
    const app = window.app;
    const box = byId('messages');
    if (!app || !app.socket || !box || typeof app.switchChannel !== 'function') { if (++tries < 120) setTimeout(wait, 500); return; }
    if (mobile()) header();
    addEventListener('resize', () => { if (mobile()) header(); });
    const sw = app.switchChannel;
    app.switchChannel = function (...a) { close(); return sw.apply(this, a); };
    let queued = false;
    const tick = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; try { welcome(app); badges(); addButtons(app); } catch (err) { console.warn('[puente] chat:', err); } });
    };
    new MutationObserver(tick).observe(box, { childList: true, subtree: true });
    const tp = byId('thread-panel');
    if (tp) new MutationObserver(tick).observe(tp, { childList: true, subtree: true });
    tick();
  })();
})();

// Marketplace (mercado.js): publicar cosas para vender, nuevas o usadas, y
// servicios. Se entra con el icono de la tienda, debajo del logo del servidor en
// la columna de la izquierda (en el celular y en la PC). Pantallas: la vidriera
// (busqueda, filtros, "Guardados" y "Mis publicaciones"), una publicacion (fotos,
// precio, quien vende y su reputacion, "Escribir al vendedor" por mensaje
// directo), publicar o editar, marcar como vendida, confirmar una compra y
// opinar, y la reputacion de cada persona. La app no cobra ni participa.
// Un enlace /app?mercado=<id> abre esa publicacion.
(function () {
  'use strict';
  const mobile = () => matchMedia('(max-width: 768px)').matches;
  const byId = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null && text !== '') n.textContent = text; return n; };
  const token = () => { try { return localStorage.getItem('haven_token'); } catch { return null; } };
  const toast = (t, k) => { try { window.app && window.app._showToast && window.app._showToast(t, k || 'info'); } catch { /* sin aviso */ } };
  const svg = (d, s = 22) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" aria-hidden="true"><path fill="currentColor" d="${d}"/></svg>`;
  const I = {
    tienda: 'M4 4h16l1 5a3 3 0 0 1-2 2.83V20a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-8.17A3 3 0 0 1 3 9l1-5Zm2 8v7h4v-4h4v4h4v-7a3 3 0 0 1-2.5-1.15A3 3 0 0 1 12 12a3 3 0 0 1-3.5-1.15A3 3 0 0 1 6 12ZM5.6 6l-.6 3a1 1 0 0 0 2 0h2a1 1 0 0 0 2 0h2a1 1 0 0 0 2 0h2a1 1 0 0 0 2 0l-.6-3H5.6Z',
    atras: 'M15.4 7.4 14 6l-6 6 6 6 1.4-1.4L10.8 12l4.6-4.6Z',
    cerrar: 'M18.3 5.7a1 1 0 0 0-1.4 0L12 10.6 7.1 5.7a1 1 0 0 0-1.4 1.4l4.9 4.9-4.9 4.9a1 1 0 1 0 1.4 1.4l4.9-4.9 4.9 4.9a1 1 0 0 0 1.4-1.4L13.4 12l4.9-4.9a1 1 0 0 0 0-1.4Z',
    mas: 'M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5Z',
    buscar: 'M15.5 14h-.8l-.3-.3A6.5 6.5 0 1 0 14 15.5l.3.3v.8l5 5 1.5-1.5-5-5Zm-6 0a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9Z',
    corazon: 'M12 21s-7.5-4.6-9.6-9.3C1 8.3 3.1 4.5 6.9 4.5c2 0 3.4 1.1 4.1 2.3.7-1.2 2.1-2.3 4.1-2.3 3.8 0 5.9 3.8 4.5 7.2C19.5 16.4 12 21 12 21Z',
    msj: 'M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8l-4 4V6a2 2 0 0 1 2-2Z',
    filtro: 'M3 5h18v2l-7 7v5l-4 2v-7L3 7V5Z',
    enlace: 'M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7a5 5 0 0 0 0 10h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1ZM8 13h8v-2H8v2Zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4a5 5 0 0 0 0-10Z',
    foto: 'M9.4 4 8 6H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-3l-1.4-2H9.4ZM12 17.5a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9Z',
  };
  const MONEDA = { ARS: '$', USD: 'US$', USDT: 'USDT' };
  const money = (p, m) => (p == null ? 'A convenir' : `${MONEDA[m] || '$'} ${Number(p).toLocaleString('es-AR', { maximumFractionDigits: 2 })}`);
  function ago(ms) {
    const s = Math.max(0, (Date.now() - ms) / 1000);
    for (const [sec, one, many] of [[86400 * 365, 'año', 'años'], [86400 * 30, 'mes', 'meses'], [86400, 'día', 'días'], [3600, 'hora', 'horas'], [60, 'minuto', 'minutos']]) {
      if (s >= sec) { const n = Math.floor(s / sec); return `hace ${n} ${n === 1 ? one : many}`; }
    }
    return 'recién';
  }
  async function api(path, body) {
    const opts = { headers: { Authorization: 'Bearer ' + token() } };
    if (body !== undefined) { opts.method = 'POST'; opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    let r;
    try { r = await fetch('/puente/api/mercado/' + path, opts); } catch { return { error: 'No hay conexión. Probá de nuevo.' }; }
    let d = null;
    try { d = await r.json(); } catch { /* sin cuerpo */ }
    if (!r.ok) return { error: (d && d.error) || 'Algo salió mal. Probá de nuevo.' };
    return d || {};
  }
  const avatar = (p, cls = 'mk-av') => {
    const a = el('div', cls);
    if (p && p.avatar) { const i = el('img'); i.src = p.avatar; i.alt = ''; i.loading = 'lazy'; i.onerror = () => { i.remove(); a.textContent = (p.nombre || '?').charAt(0).toUpperCase(); }; a.appendChild(i); }
    else a.textContent = ((p && p.nombre) || '?').charAt(0).toUpperCase();
    return a;
  };
  const repLine = (r) => {
    if (!r || r.porcentaje == null) return 'Sin opiniones todavía';
    return `${r.porcentaje}% positivas · ${r.positivas} 👍 · ${r.negativas} 👎`;
  };

  // ── La pantalla ──
  let page = null, stack = [], state = null;
  const filters = { ver: '', tipo: '', q: '', condicion: '', moneda: '', min: '', max: '', zona: '', orden: '' };

  function close() {
    if (!page) return;
    page.remove(); page = null; stack = []; state = null;
    document.querySelectorAll('.puente-mk-btn').forEach(b => b.classList.remove('active'));
  }
  function back() {
    if (stack.length > 1) { stack.pop(); const [v, a] = stack[stack.length - 1]; show(v, a, true); }
    else close();
  }
  window.puenteMercado = { abierto: () => !!page, atras: back, abrir: (id) => (id ? go('item', id) : go('lista')) };

  function frame() {
    if (page) return page;
    // Si estaba abierto Juegos (un enlace al Marketplace tocado desde ahi), se cierra
    if (window.puenteJuegos && window.puenteJuegos.abierto()) { try { while (window.puenteJuegos.abierto()) window.puenteJuegos.atras(); } catch { /* sigue */ } }
    page = el('div', 'puente-mk');
    page.id = 'puente-mercado';
    const bar = byId('server-bar');
    if (!mobile() && bar) page.style.left = Math.round(bar.getBoundingClientRect().right) + 'px';
    document.body.appendChild(page);
    document.querySelectorAll('.puente-mk-btn').forEach(b => b.classList.add('active'));
    return page;
  }
  function go(view, arg) { frame(); stack.push([view, arg]); show(view, arg); }
  function head(title, opts = {}) {
    const h = el('div', 'mk-head');
    const b = el('button', 'mk-icono'); b.type = 'button';
    const root = stack.length <= 1;
    b.innerHTML = svg(root && !mobile() ? I.cerrar : I.atras, 24);
    b.setAttribute('aria-label', root ? 'Cerrar' : 'Volver');
    b.addEventListener('click', back);
    h.append(b, el('div', 'mk-titulo', title));
    if (opts.right) h.appendChild(opts.right);
    return h;
  }
  function body() { const b = el('div', 'mk-cuerpo'); return b; }
  function show(view, arg) {
    page.textContent = '';
    page.scrollTop = 0;
    try { ({ lista, item, publicar, vendido, perfil, pendientes })[view](arg); } catch (err) { console.warn('[puente] marketplace:', err); }
  }

  // ── Vidriera ──
  function lista() {
    const pub = el('button', 'mk-btn mk-primario mk-publicar'); pub.type = 'button';
    pub.innerHTML = svg(I.mas, 18); pub.appendChild(el('span', '', 'Publicar'));
    pub.addEventListener('click', () => {
      if (state && state.puedePublicar === false) { toast('Para publicar tenés que confirmar tu email (Configuración → Mi cuenta).', 'error'); return; }
      go('publicar');
    });
    const enlace = el('button', 'mk-icono'); enlace.type = 'button';
    enlace.title = mobile() ? 'Compartir el Marketplace' : 'Copiar el enlace del Marketplace'; enlace.setAttribute('aria-label', enlace.title);
    enlace.innerHTML = svg(I.enlace, 22);
    enlace.addEventListener('click', () => compartir(webMk(), 'Marketplace · __PUENTE_APP__'));
    const der = el('div', 'mk-der'); der.append(enlace, pub);
    page.appendChild(head('Marketplace', { right: der }));
    const b = body(); page.appendChild(b);
    // Busqueda
    const sbox = el('label', 'mk-buscar');
    sbox.insertAdjacentHTML('beforeend', svg(I.buscar, 20));
    const q = el('input'); q.type = 'search'; q.placeholder = 'Buscar en el Marketplace'; q.value = filters.q; q.enterKeyHint = 'search';
    let t = null;
    q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { filters.q = q.value.trim(); load(true); }, 400); });
    q.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); clearTimeout(t); filters.q = q.value.trim(); q.blur(); load(true); } });
    sbox.appendChild(q);
    const fbtn = el('button', 'mk-icono mk-filtro-btn'); fbtn.type = 'button'; fbtn.innerHTML = svg(I.filtro, 20); fbtn.setAttribute('aria-label', 'Filtros');
    sbox.appendChild(fbtn);
    b.appendChild(sbox);
    // Chips
    const chips = el('div', 'mk-chips');
    const CH = [['', '', 'Todo'], ['', 'producto', 'Productos'], ['', 'servicio', 'Servicios'], ['guardados', '', 'Guardados'], ['mias', '', 'Mis publicaciones']];
    for (const [ver, tipo, label] of CH) {
      const c = el('button', 'mk-chip', label); c.type = 'button';
      c.classList.toggle('on', filters.ver === ver && filters.tipo === tipo);
      c.addEventListener('click', () => { filters.ver = ver; filters.tipo = tipo; chips.querySelectorAll('.mk-chip').forEach(x => x.classList.remove('on')); c.classList.add('on'); load(true); });
      chips.appendChild(c);
    }
    b.appendChild(chips);
    // Filtros
    const fx = el('div', 'mk-filtros'); fx.hidden = !(filters.condicion || filters.moneda || filters.zona || filters.orden);
    const sel = (opts, key, label) => {
      const s = el('select'); s.setAttribute('aria-label', label);
      for (const [v, l] of opts) { const o = el('option', null, l); o.value = v; s.appendChild(o); }
      s.value = filters[key];
      s.addEventListener('change', () => { filters[key] = s.value; minmax.hidden = !filters.moneda; load(true); });
      return s;
    };
    fx.append(
      sel([['', 'Nuevo o usado'], ['nuevo', 'Nuevo'], ['usado', 'Usado']], 'condicion', 'Estado'),
      sel([['', 'Cualquier moneda'], ['ARS', 'Pesos'], ['USD', 'Dólares'], ['USDT', 'USDT']], 'moneda', 'Moneda'),
      sel([['', 'Más nuevos'], ['barato', 'Más baratos'], ['caro', 'Más caros']], 'orden', 'Ordenar'));
    const zona = el('input'); zona.type = 'text'; zona.placeholder = 'Zona (barrio, ciudad)'; zona.value = filters.zona;
    zona.addEventListener('change', () => { filters.zona = zona.value.trim(); load(true); });
    const minmax = el('div', 'mk-minmax'); minmax.hidden = !filters.moneda;
    for (const k of ['min', 'max']) {
      const i = el('input'); i.type = 'number'; i.inputMode = 'decimal'; i.min = '0'; i.placeholder = k === 'min' ? 'Desde' : 'Hasta'; i.value = filters[k];
      i.addEventListener('change', () => { filters[k] = i.value; load(true); });
      minmax.appendChild(i);
    }
    fx.append(zona, minmax);
    fbtn.addEventListener('click', () => { fx.hidden = !fx.hidden; });
    b.appendChild(fx);
    b.appendChild(el('div', 'mk-pend-lugar'));
    const grid = el('div', 'mk-grilla'); b.appendChild(grid);
    // Abajo, aparte: las que no se renovaron en 30 dias (y los avisos viejos del foro), apagadas
    const sinActivas = el('div', 'mk-estado', ''); b.appendChild(sinActivas);
    const vsec = el('div', 'mk-vencidas'); vsec.hidden = true;
    const vgrid = el('div', 'mk-grilla');
    vsec.append(el('div', 'mk-vtitulo', 'Ya vencidas'), el('div', 'mk-nota', 'No se renovaron en 30 días: puede que ya no estén disponibles.'), vgrid);
    b.appendChild(vsec);
    const status = el('div', 'mk-estado', 'Cargando…'); b.appendChild(status);

    let desde = 0, loading = false, more = true, seq = 0, fase = 'activas';
    async function load(reset) {
      if (reset) { desde = 0; more = true; fase = 'activas'; grid.textContent = ''; vgrid.textContent = ''; vsec.hidden = true; sinActivas.textContent = ''; status.textContent = 'Cargando…'; }
      if (loading && !reset) return;
      if (!more) return;
      loading = true;
      const my = ++seq;
      const qs = new URLSearchParams();
      for (const k of Object.keys(filters)) if (filters[k]) qs.set(k, filters[k]);
      if (fase === 'vencidas') qs.set('ver', 'vencidas');
      qs.set('desde', String(desde));
      const d = await api('lista?' + qs);
      if (my !== seq || !page || !grid.isConnected) return;
      loading = false;
      if (d.error) { status.textContent = d.error; return; }
      state = { puedePublicar: d.puedePublicar };
      setBadge(d.pendientes);
      pend(b.querySelector('.mk-pend-lugar'), d.pendientes);
      for (const it of d.items) (fase === 'vencidas' ? vgrid : grid).appendChild(tile(it));
      desde += d.items.length; more = !!d.mas;
      if (fase === 'vencidas' && vgrid.children.length) {
        vsec.hidden = false;
        if (!grid.children.length) sinActivas.textContent = (filters.q || filters.zona || filters.condicion || filters.moneda) ? 'No hay publicaciones activas con esa búsqueda.' : 'No hay publicaciones activas ahora.';
      }
      // Terminadas las activas (en "Todo", "Productos" o "Servicios"), siguen las vencidas
      if (!more && fase === 'activas' && !filters.ver) { fase = 'vencidas'; desde = 0; more = true; status.textContent = 'Cargando…'; return load(false); }
      status.textContent = grid.children.length || vgrid.children.length ? (more ? 'Cargando…' : '') :
        filters.ver === 'mias' ? 'Todavía no publicaste nada. Tocá "Publicar" para vender algo.' :
        filters.ver === 'guardados' ? 'Todavía no guardaste publicaciones. Tocá ♡ en una para tenerla acá.' :
        (filters.q || filters.zona || filters.condicion || filters.moneda) ? 'No hay publicaciones con esa búsqueda.' : 'Todavía no hay publicaciones. ¡Sé el primero en publicar!';
    }
    page.addEventListener('scroll', () => { if (grid.isConnected && page.scrollTop + page.clientHeight > page.scrollHeight - 400) load(false); }, { passive: true });
    load(true);
  }

  function pend(box, n) {
    if (!box) return;
    box.textContent = '';
    if (!n) return;
    const p = el('button', 'mk-pendientes'); p.type = 'button';
    p.append(el('span', 'mk-pend-n', String(n)), el('span', '', n === 1 ? 'Tenés 1 cosa pendiente: confirmar una compra u opinar' : `Tenés ${n} cosas pendientes: confirmar compras u opinar`));
    p.addEventListener('click', () => go('pendientes'));
    box.appendChild(p);
  }

  function tile(it) {
    const c = el('button', 'mk-tarjeta' + (it.vencida && it.estado === 'activa' ? ' mk-vencida' : '')); c.type = 'button';
    const ph = el('div', 'mk-tfoto');
    if (it.foto) { const i = el('img'); i.src = it.foto; i.alt = ''; i.loading = 'lazy'; ph.appendChild(i); }
    else ph.innerHTML = svg(it.tipo === 'servicio' ? I.tienda : I.foto, 34);
    if (it.estado === 'vendida') ph.appendChild(el('span', 'mk-sello', 'Vendido'));
    else if (it.vencida) ph.appendChild(el('span', 'mk-sello gris', 'Vencida'));
    else if (it.oculta) ph.appendChild(el('span', 'mk-sello rojo', 'Oculta'));
    c.append(ph, el('div', 'mk-tprecio', money(it.precio, it.moneda)), el('div', 'mk-ttitulo', it.titulo));
    const meta = [it.vencida ? ago(it.renovado) : it.tipo === 'servicio' ? 'Servicio' : it.condicion === 'nuevo' ? 'Nuevo' : it.condicion === 'usado' ? 'Usado' : '', it.zona || ''].filter(Boolean).join(' · ');
    if (meta) c.appendChild(el('div', 'mk-tmeta', meta));
    c.addEventListener('click', () => go('item', it.id));
    return c;
  }

  // ── Una publicacion ──
  async function item(id) {
    page.appendChild(head('Publicación'));
    const b = body(); page.appendChild(b);
    b.appendChild(el('div', 'mk-estado', 'Cargando…'));
    const d = await api('item?id=' + encodeURIComponent(id));
    if (!page || !b.isConnected) return;
    b.textContent = '';
    if (d.error) { b.appendChild(el('div', 'mk-estado', d.error)); return; }
    const it = d.item;
    // Fotos (deslizando, como en el Marketplace de Facebook)
    if (it.fotos.length) {
      const car = el('div', 'mk-fotos');
      const strip = el('div', 'mk-tira');
      for (const f of it.fotos) {
        const i = el('img'); i.src = f; i.alt = ''; i.loading = 'lazy';
        i.addEventListener('click', () => { try { window.app._openLightbox(f, i); } catch { window.open(f, '_blank'); } });
        strip.appendChild(i);
      }
      car.appendChild(strip);
      if (it.fotos.length > 1) {
        const dots = el('div', 'mk-puntos');
        it.fotos.forEach((_, k) => dots.appendChild(el('span', k ? '' : 'on')));
        // Y las flechas a los costados (en la compu no se puede deslizar), y las del teclado
        const actual = () => Math.round(strip.scrollLeft / (strip.clientWidth || 1));
        // (a donde va mientras se desliza: tocar seguido sigue pasando de a una)
        let destino = null, llegar = null;
        const ir = (k) => {
          destino = Math.max(0, Math.min(it.fotos.length - 1, k));
          const x = destino * strip.clientWidth;
          strip.scrollTo({ left: x, behavior: 'smooth' });
          pintar(true);
          // (si el deslizamiento se corto, la pone directo)
          clearTimeout(llegar);
          llegar = setTimeout(() => { if (Math.abs(strip.scrollLeft - x) > 2) strip.scrollTo({ left: x }); destino = null; pintar(); }, 600);
        };
        const flecha = (cls, d, label, paso) => {
          const f = el('button', 'mk-flecha ' + cls); f.type = 'button'; f.setAttribute('aria-label', label);
          f.innerHTML = svg(d, 28);
          f.addEventListener('click', (e) => { e.stopPropagation(); ir((destino ?? actual()) + paso); });
          return f;
        };
        const ant = flecha('ant', 'M15.4 7.4 14 6l-6 6 6 6 1.4-1.4L10.8 12l4.6-4.6Z', 'Foto anterior', -1);
        const sig = flecha('sig', 'M8.6 16.6 10 18l6-6-6-6-1.4 1.4 4.6 4.6-4.6 4.6Z', 'Foto siguiente', 1);
        // (las flechas se esconden recien cuando llega: esconder la que se acaba de tocar cortaba el deslizamiento)
        function pintar(soloPuntos) {
          const k = destino ?? actual();
          dots.querySelectorAll('span').forEach((s, j) => s.classList.toggle('on', j === k));
          if (!soloPuntos) { ant.hidden = k <= 0; sig.hidden = k >= it.fotos.length - 1; }
        }
        let quieto = null;
        strip.addEventListener('scroll', () => {
          // Cuando deja de moverse, vale donde quedo (tambien si se deslizo con el dedo)
          clearTimeout(quieto); quieto = setTimeout(() => { destino = null; pintar(); }, 150);
          if (destino === null) pintar();
        }, { passive: true });
        car.tabIndex = 0;
        car.addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft') { e.preventDefault(); ir((destino ?? actual()) - 1); } else if (e.key === 'ArrowRight') { e.preventDefault(); ir((destino ?? actual()) + 1); } });
        car.append(dots, ant, sig);
        pintar();
      }
      b.appendChild(car);
    }
    const info = el('div', 'mk-info');
    info.append(el('div', 'mk-precio', money(it.precio, it.moneda)), el('h2', 'mk-nombre', it.titulo));
    const tags = el('div', 'mk-tags');
    for (const t of [it.tipo === 'servicio' ? 'Servicio' : 'Producto', it.condicion === 'nuevo' ? 'Nuevo' : it.condicion === 'usado' ? 'Usado' : '', it.zona ? '📍 ' + it.zona : ''].filter(Boolean)) tags.appendChild(el('span', 'mk-tag', t));
    info.appendChild(tags);
    let when = 'Publicado ' + ago(it.renovado);
    if (it.mia) when += it.vencida ? ' · venció' : ` · vence en ${Math.max(1, Math.round((it.vence - Date.now()) / 864e5))} días`;
    info.appendChild(el('div', 'mk-cuando', when));
    if (it.estado === 'vendida') info.appendChild(el('div', 'mk-aviso', '✅ Vendido'));
    // Vencida: sigue a la vista, pero se avisa. La de alguien del foro sin cuenta ya no se puede consultar
    const sinCuenta = !!(it.foro && it.foro.sinCuenta);
    if (it.vencida && it.estado === 'activa') {
      info.appendChild(el('div', 'mk-aviso gris', it.mia ? '⏳ Venció: ya no aparece entre las activas. Republicala con un toque y vuelve arriba de todo, como nueva.'
        : sinCuenta ? `⏳ Publicado en el foro en ${new Date(it.creado).getFullYear()}: ya no está disponible.`
          : '⏳ Vencida: no se renovó en 30 días, así que puede que ya no esté disponible. Preguntale a quien la publicó.'));
    }
    if (it.oculta) info.appendChild(el('div', 'mk-aviso rojo', '🙈 Oculta por un administrador: no la ve nadie más.'));
    if (it.venta && it.mia && it.venta.estado === 'pendiente' && it.venta.comprador) info.appendChild(el('div', 'mk-aviso', `Esperando que ${it.venta.comprador.nombre} confirme la compra.`));
    if (it.descripcion) info.appendChild(el('div', 'mk-desc', it.descripcion));
    b.appendChild(info);

    // Quien vende
    if (it.vendedor) {
      const s = el('button', 'mk-vendedor'); s.type = 'button';
      const txt = el('div', 'mk-vtexto');
      txt.append(el('div', 'mk-vnombre', it.vendedor.nombre), el('div', 'mk-vrep', repLine(it.vendedor.reputacion)));
      s.append(avatar(it.vendedor), txt);
      s.insertAdjacentHTML('beforeend', svg('M9.4 18 8 16.6l4.6-4.6L8 7.4 9.4 6l6 6-6 6Z', 20));
      if (it.vendedor.id) s.addEventListener('click', () => go('perfil', it.vendedor.id));
      else { s.disabled = true; s.querySelector('svg')?.remove(); }
      b.appendChild(s);
    }

    const acts = el('div', 'mk-acciones');
    const btn = (label, cls, fn, icon) => { const x = el('button', 'mk-btn ' + (cls || '')); x.type = 'button'; if (icon) x.innerHTML = svg(icon, 18); x.appendChild(el('span', '', label)); x.addEventListener('click', fn); acts.appendChild(x); return x; };
    if (!it.mia) {
      if (it.estado === 'activa' && !sinCuenta) btn('Escribir al vendedor', it.vencida ? '' : 'mk-primario', () => writeTo(it), I.msj);
      const g = btn(it.guardada ? 'Guardado' : 'Guardar', it.guardada ? 'on' : '', async () => {
        const si = !g.classList.contains('on');
        const r = await api('guardar', { id: it.id, si });
        if (r.error) return toast(r.error, 'error');
        g.classList.toggle('on', si); g.querySelector('span').textContent = si ? 'Guardado' : 'Guardar';
      }, I.corazon);
    }
    btn('Compartir', '', () => share(it));
    if (it.mia && it.estado === 'activa' && it.vencida) btn('Republicar', 'mk-primario', async () => {
      const r = await api('renovar', { id: it.id });
      if (r.error) return toast(r.error, 'error');
      toast('¡Listo! Volvió a estar publicada, arriba de todo', 'success'); show('item', it.id);
    });
    if (it.mia) {
      btn('Editar', '', () => go('publicar', it));
      if (it.estado === 'activa') btn(it.tipo === 'servicio' ? 'Registrar una venta' : 'Marcar como vendido', 'mk-primario', () => go('vendido', it));
      if (it.estado === 'vendida') btn('Volver a publicar', '', async () => { const r = await api('reactivar', { id: it.id }); if (r.error) return toast(r.error, 'error'); show('item', it.id); });
      if (it.estado === 'activa' && !it.vencida && it.vence - Date.now() < 7 * 864e5) btn('Renovar 30 días', '', async () => { const r = await api('renovar', { id: it.id }); if (r.error) return toast(r.error, 'error'); toast('Publicación renovada', 'success'); show('item', it.id); });
    }
    if (it.mia || d.admin) btn('Borrar', 'mk-peligro', async () => {
      if (!confirm('¿Borrar esta publicación? No se puede deshacer.')) return;
      const r = await api('borrar', { id: it.id });
      if (r.error) return toast(r.error, 'error');
      toast('Publicación borrada', 'success'); back();
    });
    if (d.admin && !it.mia) btn(it.oculta ? 'Mostrar de nuevo' : 'Ocultar (admin)', 'mk-peligro', async () => {
      const r = await api('ocultar', { id: it.id, si: !it.oculta });
      if (r.error) return toast(r.error, 'error');
      show('item', it.id);
    });
    if (!it.mia) btn(it.denunciada ? 'Denunciada' : 'Denunciar', 'mk-suave', async (e) => {
      if (it.denunciada) return;
      const motivo = prompt('¿Qué tiene de malo esta publicación? (lo ven solo los administradores)');
      if (motivo === null) return;
      const r = await api('denunciar', { id: it.id, motivo });
      if (r.error) return toast(r.error, 'error');
      it.denunciada = true; e.currentTarget.querySelector('span').textContent = 'Denunciada';
      toast('Gracias. Los administradores la van a revisar.', 'success');
    });
    if (d.admin && it.denuncias) acts.appendChild(el('div', 'mk-nota', `🚩 ${it.denuncias} denuncia${it.denuncias === 1 ? '' : 's'}`));
    b.appendChild(acts);
    b.appendChild(el('div', 'mk-nota', 'CV Chat no participa de la compra ni cobra nada: el pago y la entrega los acuerdan ustedes. Encontrate en un lugar seguro y no pagues por adelantado a quien no conocés.'));
  }

  function linkOf(it) { return location.origin + '/app?mercado=' + it.id; }
  // Para compartir afuera: la pagina del Marketplace (su propio dominio, marketplace.<dominio>), que se ve sin
  // cuenta y con su vista previa; adentro del chat esos enlaces tambien se abren aca
  const webMk = (id) => 'https://marketplace.' + location.hostname.replace(/^chat\./, '') + '/' + (id ? '?id=' + id : '');
  // Enlace a la vidriera, para pasarlo por un canal, WhatsApp o donde sea
  function compartir(url, title) {
    if (navigator.share && mobile()) { navigator.share({ title, url }).catch(() => {}); return; }
    const done = () => toast('Enlace copiado: pegalo en un canal o en un mensaje', 'success');
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, () => prompt('Copiá el enlace:', url));
    else prompt('Copiá el enlace:', url);
  }
  function share(it) {
    const url = webMk(it.id), text = `${it.titulo} · ${money(it.precio, it.moneda)}`;
    if (navigator.share && mobile()) { navigator.share({ title: it.titulo, text, url }).catch(() => {}); return; }
    const done = () => toast('Enlace copiado: pegalo en un canal o en un mensaje', 'success');
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, () => prompt('Copiá el enlace:', url));
    else prompt('Copiá el enlace:', url);
  }

  // Mensaje directo con quien vende, con la publicacion ya escrita (sin mandar)
  function writeTo(it) {
    const app = window.app;
    if (!app || !app.socket || !it.vendedor) return;
    const text = `¡Hola! Te escribo por tu publicación "${it.titulo}" (${money(it.precio, it.moneda)}): ${linkOf(it)}`;
    let done = false;
    const fill = () => {
      if (done) return; done = true;
      setTimeout(() => {
        const box = byId('message-input');
        if (!box) return;
        box.value = text;
        box.dispatchEvent(new Event('input', { bubbles: true }));
        box.focus();
      }, 900);
    };
    app.socket.once('dm-opened', fill);
    setTimeout(() => { if (!done) app.socket.off('dm-opened', fill); }, 8000);
    close();
    app.socket.emit('start-dm', { targetUserId: it.vendedor.id });
  }

  // ── Publicar o editar ──
  function publicar(existing) {
    const ed = existing && existing.id ? existing : null;
    page.appendChild(head(ed ? 'Editar publicación' : 'Nueva publicación'));
    const b = body(); page.appendChild(b);
    const f = el('div', 'mk-form'); b.appendChild(f);
    const data = {
      tipo: ed ? ed.tipo : 'producto', condicion: ed ? ed.condicion : 'usado',
      fotos: ed ? ed.fotos.map(u => ({ name: u.split('/').pop(), url: u })) : [],
    };
    const field = (label, node, hint) => { const w = el('label', 'mk-campo'); w.appendChild(el('span', 'mk-etq', label)); w.appendChild(node); if (hint) w.appendChild(el('span', 'mk-ayuda', hint)); f.appendChild(w); return w; };
    const seg = (opts, key, onChange) => {
      const s = el('div', 'mk-seg');
      for (const [v, l] of opts) {
        const x = el('button', 'mk-seg-op', l); x.type = 'button'; x.classList.toggle('on', data[key] === v);
        x.addEventListener('click', () => { data[key] = v; s.querySelectorAll('.mk-seg-op').forEach(y => y.classList.toggle('on', y === x)); if (onChange) onChange(); });
        s.appendChild(x);
      }
      return s;
    };
    const condWrap = el('div');
    let condField = null;
    const tipoSeg = seg([['producto', 'Producto'], ['servicio', 'Servicio']], 'tipo', () => { if (condField) condField.hidden = data.tipo !== 'producto'; fotoAyuda.textContent = fotoHint(); });
    field('Qué publicás', tipoSeg);

    // Fotos
    const fotoHint = () => `Hasta 6. La primera es la portada.${data.tipo === 'producto' ? ' Al menos una.' : ''}`;
    const grid = el('div', 'mk-fgrid');
    const fotoAyuda = el('span', 'mk-ayuda', fotoHint());
    const fw = el('div', 'mk-campo'); fw.append(el('span', 'mk-etq', 'Fotos'), grid, fotoAyuda); f.appendChild(fw);
    const input = el('input'); input.type = 'file'; input.accept = 'image/*'; input.multiple = true; input.hidden = true;
    fw.appendChild(input);
    function drawFotos() {
      grid.textContent = '';
      data.fotos.forEach((p, k) => {
        const t = el('div', 'mk-fthumb');
        if (p.url) { const i = el('img'); i.src = p.url; i.alt = ''; t.appendChild(i); } else t.appendChild(el('span', 'mk-subiendo', 'Subiendo…'));
        if (k === 0 && p.url) t.appendChild(el('span', 'mk-portada', 'Portada'));
        const x = el('button', 'mk-fquitar'); x.type = 'button'; x.innerHTML = svg(I.cerrar, 16); x.setAttribute('aria-label', 'Quitar foto');
        x.addEventListener('click', () => { data.fotos.splice(k, 1); drawFotos(); });
        t.appendChild(x);
        grid.appendChild(t);
      });
      if (data.fotos.length < 6) {
        const add = el('button', 'mk-fadd'); add.type = 'button'; add.innerHTML = svg(I.foto, 28); add.appendChild(el('span', '', 'Agregar'));
        add.addEventListener('click', () => input.click());
        grid.appendChild(add);
      }
    }
    // Se achica en el telefono antes de subirla (mas rapido con datos moviles)
    function shrink(file) {
      return new Promise((resolve) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
          const k = Math.min(1, 1600 / Math.max(img.width, img.height));
          const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          URL.revokeObjectURL(url);
          resolve(c.toDataURL('image/jpeg', 0.86));
        };
        img.onerror = () => { URL.revokeObjectURL(url); const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => resolve(null); r.readAsDataURL(file); };
        img.src = url;
      });
    }
    input.addEventListener('change', async () => {
      const files = [...input.files].slice(0, 6 - data.fotos.length);
      input.value = '';
      for (const file of files) {
        const slot = { name: null, url: null };
        data.fotos.push(slot); drawFotos();
        const dataUrl = await shrink(file);
        const r = dataUrl ? await api('foto', { imagen: dataUrl }) : { error: 'No se pudo leer la foto.' };
        if (r.error) { data.fotos.splice(data.fotos.indexOf(slot), 1); toast(r.error, 'error'); }
        else { slot.name = r.foto; slot.url = r.url; }
        if (page && grid.isConnected) drawFotos();
      }
    });
    drawFotos();

    const titulo = el('input'); titulo.type = 'text'; titulo.maxLength = 80; titulo.placeholder = 'Qué vendés u ofrecés'; titulo.value = ed ? ed.titulo : '';
    field('Título', titulo);
    const desc = el('textarea'); desc.maxLength = 2000; desc.rows = 5; desc.placeholder = 'Contá cómo está, qué incluye, cómo lo entregás…'; desc.value = ed ? ed.descripcion || '' : '';
    field('Descripción', desc);
    // Precio
    const pr = el('div', 'mk-precio-fila');
    const precio = el('input'); precio.type = 'text'; precio.inputMode = 'decimal'; precio.placeholder = '0'; precio.value = ed && ed.precio != null ? String(ed.precio).replace('.', ',') : '';
    const moneda = el('select');
    for (const [v, l] of [['ARS', '$ Pesos'], ['USD', 'US$ Dólares'], ['USDT', 'USDT']]) { const o = el('option', null, l); o.value = v; moneda.appendChild(o); }
    moneda.value = (ed && ed.moneda) || 'ARS';
    pr.append(moneda, precio);
    const conv = el('label', 'mk-check');
    const convI = el('input'); convI.type = 'checkbox'; convI.checked = !!(ed && ed.precio == null);
    conv.append(convI, el('span', '', 'A convenir'));
    const syncConv = () => { precio.disabled = moneda.disabled = convI.checked; };
    convI.addEventListener('change', syncConv); syncConv();
    const pw = field('Precio', pr); pw.appendChild(conv);
    condWrap.appendChild(seg([['nuevo', 'Nuevo'], ['usado', 'Usado']], 'condicion'));
    condField = field('Estado', condWrap); condField.hidden = data.tipo !== 'producto';
    const zona = el('input'); zona.type = 'text'; zona.maxLength = 60; zona.placeholder = 'Barrio o ciudad (opcional)'; zona.value = ed && ed.zona ? ed.zona : '';
    field('Zona', zona);
    const err = el('div', 'mk-error'); f.appendChild(err);
    f.appendChild(el('div', 'mk-nota', 'No se puede publicar nada ilegal. Las publicaciones duran 30 días y se renuevan con un toque. CV Chat no participa de la venta ni cobra comisión.'));
    const send = el('button', 'mk-btn mk-primario mk-enviar'); send.type = 'button'; send.textContent = ed ? 'Guardar cambios' : 'Publicar';
    f.appendChild(send);
    for (const x of [titulo, desc, precio, zona]) x.addEventListener('input', () => { err.textContent = ''; });
    send.addEventListener('click', async () => {
      err.textContent = '';
      if (data.fotos.some(p => !p.name)) { err.textContent = 'Esperá a que terminen de subir las fotos.'; return; }
      if (titulo.value.trim().length < 3) { err.textContent = 'Poné un título (al menos 3 letras).'; titulo.focus(); return; }
      if (data.tipo === 'producto' && !data.fotos.length) { err.textContent = 'Agregá al menos una foto.'; return; }
      let p = null;
      if (!convI.checked) {
        const raw = precio.value.trim().replace(/\./g, '').replace(',', '.');
        if (!raw || !Number.isFinite(Number(raw)) || Number(raw) < 0) { err.textContent = 'Poné un precio, o marcá "A convenir".'; precio.focus(); return; }
        p = Number(raw);
      }
      send.disabled = true;
      const r = await api('publicar', {
        id: ed ? ed.id : undefined, tipo: data.tipo, condicion: data.tipo === 'producto' ? data.condicion : null,
        titulo: titulo.value, descripcion: desc.value, precio: p, moneda: moneda.value, zona: zona.value, fotos: data.fotos.map(x => x.name),
      });
      send.disabled = false;
      if (r.error) { err.textContent = r.error; return; }
      toast(ed ? 'Cambios guardados' : '¡Publicado!', 'success');
      stack.pop(); // sin volver al formulario con "atras"
      if (ed) { stack.pop(); }
      go('item', r.id);
    });
  }

  // ── Marcar como vendido ──
  function vendido(it) {
    page.appendChild(head(it.tipo === 'servicio' ? 'Registrar una venta' : 'Marcar como vendido'));
    const b = body(); page.appendChild(b);
    b.appendChild(el('p', 'mk-texto', '¿A quién se lo vendiste? Le llega un aviso para confirmar la compra, y después se pueden dejar una opinión entre ustedes.'));
    const sbox = el('label', 'mk-buscar'); sbox.insertAdjacentHTML('beforeend', svg(I.buscar, 20));
    const q = el('input'); q.type = 'search'; q.placeholder = 'Buscar por nombre'; sbox.appendChild(q); b.appendChild(sbox);
    const list = el('div', 'mk-lista'); b.appendChild(list);
    let t = null, seq = 0;
    q.addEventListener('input', () => {
      clearTimeout(t);
      t = setTimeout(async () => {
        const my = ++seq;
        const d = q.value.trim().length >= 2 ? await api('personas?q=' + encodeURIComponent(q.value.trim())) : { personas: [] };
        if (my !== seq || !list.isConnected) return;
        list.textContent = '';
        for (const p of d.personas || []) {
          const r = el('button', 'mk-fila'); r.type = 'button';
          const tx = el('div', 'mk-vtexto'); tx.append(el('div', 'mk-vnombre', p.nombre), el('div', 'mk-vrep', '@' + p.usuario));
          r.append(avatar(p), tx);
          r.addEventListener('click', async () => {
            if (!confirm(`¿Se lo vendiste a ${p.nombre}?`)) return;
            const res = await api('vendido', { id: it.id, comprador: p.id });
            if (res.error) return toast(res.error, 'error');
            toast(`Listo. Le avisamos a ${p.nombre} para que confirme.`, 'success');
            back();
          });
          list.appendChild(r);
        }
        if (q.value.trim().length >= 2 && !(d.personas || []).length) list.appendChild(el('div', 'mk-estado', 'No encontramos a nadie con ese nombre.'));
      }, 300);
    });
    if (it.tipo === 'producto') {
      const out = el('button', 'mk-btn mk-suave'); out.type = 'button'; out.textContent = 'Lo vendí fuera de CV Chat';
      out.addEventListener('click', async () => { const r = await api('vendido', { id: it.id, fuera: true }); if (r.error) return toast(r.error, 'error'); back(); });
      b.appendChild(out);
    }
    setTimeout(() => q.focus(), 100);
  }

  // ── Reputacion de una persona ──
  async function perfil(uid) {
    page.appendChild(head('Reputación'));
    const b = body(); page.appendChild(b);
    b.appendChild(el('div', 'mk-estado', 'Cargando…'));
    const d = await api('reputacion?u=' + encodeURIComponent(uid));
    if (!page || !b.isConnected) return;
    b.textContent = '';
    if (d.error) { b.appendChild(el('div', 'mk-estado', d.error)); return; }
    const top = el('div', 'mk-perfil');
    const tx = el('div', 'mk-vtexto'); tx.append(el('div', 'mk-pnombre', d.persona.nombre), el('div', 'mk-vrep', '@' + d.persona.usuario));
    top.append(avatar(d.persona, 'mk-av grande'), tx);
    b.appendChild(top);
    const r = d.reputacion;
    const stats = el('div', 'mk-stats');
    for (const [n, l] of [[r.porcentaje == null ? '–' : r.porcentaje + '%', 'positivas'], [r.positivas, '👍'], [r.negativas, '👎'], [r.ventas, r.ventas === 1 ? 'venta' : 'ventas'], [r.compras, r.compras === 1 ? 'compra' : 'compras']]) {
      const s = el('div', 'mk-stat'); s.append(el('div', 'mk-stat-n', String(n)), el('div', 'mk-stat-l', l)); stats.appendChild(s);
    }
    b.appendChild(stats);
    b.appendChild(el('div', 'mk-sub', 'Opiniones'));
    if (!d.opiniones.length) b.appendChild(el('div', 'mk-estado', 'Todavía no tiene opiniones.'));
    const ops = el('div', 'mk-lista');
    for (const o of d.opiniones) {
      const row = el('div', 'mk-opinion' + (o.positiva ? '' : ' mala'));
      const h = el('div', 'mk-ophead');
      h.append(el('span', 'mk-opicon', o.positiva ? '👍' : '👎'), el('span', 'mk-vnombre', o.de ? o.de.nombre : 'Alguien'),
        el('span', 'mk-vrep', ` · como ${o.rol === 'vendedor' ? 'vendedor' : 'comprador'} · ${ago(o.creado)}`));
      row.appendChild(h);
      if (o.comentario) row.appendChild(el('div', 'mk-optexto', o.comentario));
      row.appendChild(el('div', 'mk-vrep', o.titulo));
      ops.appendChild(row);
    }
    b.appendChild(ops);
    // Sus publicaciones
    const l = await api('lista?u=' + encodeURIComponent(uid));
    if (!page || !b.isConnected || l.error || !l.items.length) return;
    b.appendChild(el('div', 'mk-sub', 'Publicaciones'));
    const grid = el('div', 'mk-grilla'); for (const it of l.items) grid.appendChild(tile(it)); b.appendChild(grid);
  }

  // ── Pendientes: confirmar compras y opinar ──
  async function pendientes() {
    page.appendChild(head('Pendientes'));
    const b = body(); page.appendChild(b);
    const d = await api('pendientes');
    if (!page || !b.isConnected) return;
    if (d.error) { b.appendChild(el('div', 'mk-estado', d.error)); return; }
    setBadge(d.total);
    if (!d.total) { b.appendChild(el('div', 'mk-estado', 'No tenés nada pendiente.')); return; }
    for (const c of d.confirmar) {
      const box = el('div', 'mk-caja');
      box.appendChild(el('div', 'mk-texto', `${c.otro ? c.otro.nombre : 'Alguien'} dice que te vendió "${c.titulo}". ¿Se lo compraste?`));
      const row = el('div', 'mk-acciones');
      for (const [si, label, cls] of [[true, 'Sí, se lo compré', 'mk-primario'], [false, 'No', '']]) {
        const x = el('button', 'mk-btn ' + cls, label); x.type = 'button';
        x.addEventListener('click', async () => { const r = await api('confirmar', { venta: c.venta, si }); if (r.error) return toast(r.error, 'error'); show('pendientes'); });
        row.appendChild(x);
      }
      box.appendChild(row); b.appendChild(box);
    }
    for (const o of d.opinar) {
      const box = el('div', 'mk-caja');
      box.appendChild(el('div', 'mk-texto', `¿Cómo te fue con ${o.otro ? o.otro.nombre : 'esa persona'} ${o.rol === 'vendedor' ? 'como comprador' : 'como vendedor'}? ("${o.titulo}")`));
      let pos = null;
      const row = el('div', 'mk-seg');
      for (const [v, l] of [[true, '👍 Bien'], [false, '👎 Mal']]) {
        const x = el('button', 'mk-seg-op', l); x.type = 'button';
        x.addEventListener('click', () => { pos = v; row.querySelectorAll('.mk-seg-op').forEach(y => y.classList.toggle('on', y === x)); err.textContent = ''; });
        row.appendChild(x);
      }
      const com = el('textarea'); com.rows = 2; com.maxLength = 300; com.placeholder = 'Comentario (opcional, lo ve todo el mundo)';
      const err = el('div', 'mk-error');
      const send = el('button', 'mk-btn mk-primario', 'Enviar opinión'); send.type = 'button';
      send.addEventListener('click', async () => {
        if (pos === null) { err.textContent = 'Elegí 👍 o 👎.'; return; }
        const r = await api('opinar', { venta: o.venta, positiva: pos, comentario: com.value });
        if (r.error) { err.textContent = r.error; return; }
        toast('¡Gracias por tu opinión!', 'success'); show('pendientes');
      });
      box.append(row, com, err, send); b.appendChild(box);
    }
  }

  // ── El icono en la columna de la izquierda y el numerito de pendientes ──
  const NEW_KEY = 'puente_mercado_visto', NEW_UNTIL = Date.UTC(2026, 10, 22); // hasta el 21 de noviembre
  const isNew = () => { if (Date.now() > NEW_UNTIL) return false; try { return !localStorage.getItem(NEW_KEY); } catch { return true; } };
  function setBadge(n) {
    for (const b of document.querySelectorAll('.puente-mk-btn .puente-rail-badge')) { b.textContent = n ? String(n) : ''; b.style.display = n ? '' : 'none'; }
  }
  function addButtons() {
    const mk = (cls) => {
      const b = el('button', cls + ' puente-mk-btn'); b.type = 'button'; b.title = 'Marketplace'; b.setAttribute('aria-label', 'Marketplace');
      // el icono propio del servidor (/puente/icono-mercado.webp, no va al repositorio); si no esta, el dibujo
      b.innerHTML = svg(I.tienda, 24);
      { const im = el('img', 'puente-ico-img'); im.alt = ''; im.draggable = false; im.addEventListener('load', () => { b.querySelector('svg')?.remove(); b.classList.add('con-icono'); b.prepend(im); }); im.src = '/puente/icono-mercado.webp?v=2'; }
      const badge = el('span', 'puente-rail-badge'); badge.style.display = 'none'; b.appendChild(badge);
      // "NUEVO!" para que se vea, hasta que la persona entra por primera vez (o pasa un mes)
      if (isNew()) b.appendChild(el('span', 'puente-mk-nuevo', 'NUEVO!'));
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        try { localStorage.setItem(NEW_KEY, '1'); } catch { /* sin almacenamiento */ }
        document.querySelectorAll('.puente-mk-nuevo').forEach(x => x.remove());
        if (page) close(); else { stack = []; go('lista'); }
      });
      return b;
    };
    const srv = document.querySelector('#puente-rail .puente-rail-server');
    if (srv && !document.querySelector('#puente-rail .puente-mk-btn')) srv.after(mk('puente-rail-btn'));
    // (Si Haven puso el logo del servidor en otro lado, con la columna de arriba, alcanza con ese)
    const home = byId('home-server');
    if (home && home.closest('#server-bar') && !document.querySelector('#server-bar .puente-mk-btn')) {
      const b = mk('server-icon');
      home.after(b);
    }
    // Por si quedo uno de mas
    for (const sel of ['.puente-mk-btn.puente-rail-btn', '.puente-mk-btn.server-icon']) [...document.querySelectorAll(sel)].slice(1).forEach(x => x.remove());
    return !!(srv || home);
  }
  async function refreshBadge() { const d = await api('pendientes'); if (!d.error) setBadge(d.total); }

  let tries = 0;
  (function wait() {
    const app = window.app;
    if (!app || !app.socket || !token() || !addButtons()) { setTimeout(wait, ++tries < 120 ? 500 : 3000); return; }
    // Por si la columna se arma despues o Haven la vuelve a armar
    setInterval(addButtons, 2000);
    refreshBadge();
    setInterval(refreshBadge, 5 * 60 * 1000);
    app.socket.on('puente-mercado', (d) => setBadge(d && d.pendientes));
    // Ir a un canal o a los mensajes directos cierra el Marketplace (en la PC)
    if (typeof app.switchChannel === 'function') {
      const sw = app.switchChannel;
      app.switchChannel = function (...a) { close(); return sw.apply(this, a); };
    }
    for (const id of ['home-server']) byId(id) && byId(id).addEventListener('click', close);
    document.addEventListener('click', (e) => {
      if (page && e.target instanceof Element && e.target.closest('.puente-pc-dm, #puente-rail .puente-rail-dm, #puente-rail .puente-rail-server')) close();
    }, true);
    // Enlaces a una publicacion (/app?mercado=<id>) o a la vidriera (/app?mercado): se abren aca mismo.
    // Tambien los de la pagina de la web (marketplace.circulovicioso.club/?id=<id>, como los avisos de #que-paso,
    // y los de antes, circulovicioso.club/marketplace?id=<id>)
    document.addEventListener('click', (e) => {
      const a = e.target instanceof Element && e.target.closest('a[href]');
      if (!a || e.ctrlKey || e.metaKey) return;
      let u; try { u = new URL(a.href, location.href); } catch { return; }
      const web = ((/^(?:www\.)?circulovicioso\.club$/.test(u.hostname) && /^\/marketplace\/?$/.test(u.pathname))
        || (u.hostname === 'marketplace.circulovicioso.club' && /^\/?$/.test(u.pathname))) && !u.searchParams.has('ver');
      if (!web && (u.origin !== location.origin || !/^\/app/.test(u.pathname) || !u.searchParams.has('mercado'))) return;
      const id = web ? u.searchParams.get('id') : u.searchParams.get('mercado');
      if (id && !/^\d+$/.test(id)) return;
      e.preventDefault(); e.stopPropagation();
      stack = []; if (id) go('item', id); else go('lista');
    }, true);
    const mq = new URLSearchParams(location.search), sp = mq.get('mercado');
    if (mq.has('mercado') && (!sp || /^\d+$/.test(sp))) setTimeout(() => { stack = []; if (sp) go('item', sp); else go('lista'); }, 1500);
    addEventListener('resize', () => { if (page && !mobile()) { const bar = byId('server-bar'); page.style.left = bar ? Math.round(bar.getBoundingClientRect().right) + 'px' : '0'; } else if (page) page.style.left = ''; });
  })();
})();

// Juegos (truco.js, funball.js y ajedrez.js): el Truco argentino, el Funball (el de DOS de 1995)
// y el Ajedrez, 1 contra 1, contra otra persona o contra la compu. Se entra con el icono de las cartas, debajo del
// Marketplace en la columna de la izquierda. La sala: crear partida (a 15 o 30,
// con o sin flor; mesa abierta, desafiar a alguien o la compu), las que te
// desafiaron, tus partidas, las mesas que esperan rival, tu récord y el ranking
// del mes. La mesa: las cartas del rival boca abajo, las tres bazas en el paño,
// tus cartas abajo (se tocan para jugar) y los cantos que se pueden hacer en
// ese momento (los decide el servidor). Un enlace /app?truco=<id> abre la mesa, /app?juegos la
// biblioteca y /app?juegos=truco la sala de ese juego (el boton del enlace, arriba a la derecha).
// /app?ajedrez=<id> abre una mesa de ajedrez y /app?globalsiege=<id> una de GlobalSiege (su pantalla
// esta en web/misionrisk/juego.js y se carga aparte, la primera vez que se abre).
(function () {
  'use strict';
  const mobile = () => matchMedia('(max-width: 768px)').matches;
  const byId = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null && text !== '') n.textContent = text; return n; };
  const toast = (t, k) => { try { window.app && window.app._showToast && window.app._showToast(t, k || 'info'); } catch { /* sin aviso */ } };
  const svg = (d, s = 22) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" aria-hidden="true"><path fill="currentColor" d="${d}"/></svg>`;
  const I = {
    cartas: 'M7.5 3.6 15 2.1a2 2 0 0 1 2.35 1.57l2.9 14.6a2 2 0 0 1-1.57 2.35l-7.5 1.5a2 2 0 0 1-2.35-1.57L5.93 5.95A2 2 0 0 1 7.5 3.6Zm4.1 5.2-1.6 2.6 2.6 1.6 1.6-2.6-2.6-1.6ZM4.2 6.6l1.4 7.1-1.8-8.3c.1.4.2.8.4 1.2Z',
    atras: 'M15.4 7.4 14 6l-6 6 6 6 1.4-1.4L10.8 12l4.6-4.6Z',
    cerrar: 'M18.3 5.7a1 1 0 0 0-1.4 0L12 10.6 7.1 5.7a1 1 0 0 0-1.4 1.4l4.9 4.9-4.9 4.9a1 1 0 1 0 1.4 1.4l4.9-4.9 4.9 4.9a1 1 0 0 0 1.4-1.4L13.4 12l4.9-4.9a1 1 0 0 0 0-1.4Z',
    buscar: 'M15.5 14h-.8l-.3-.3A6.5 6.5 0 1 0 14 15.5l.3.3v.8l5 5 1.5-1.5-5-5Zm-6 0a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9Z',
    msj: 'M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8l-4 4V6a2 2 0 0 1 2-2Z',
    puntos: 'M12 8a2 2 0 1 1 0-4 2 2 0 0 1 0 4Zm0 6a2 2 0 1 1 0-4 2 2 0 0 1 0 4Zm0 6a2 2 0 1 1 0-4 2 2 0 0 1 0 4Z',
    enlace: 'M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7a5 5 0 0 0 0 10h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1ZM8 13h8v-2H8v2Zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4a5 5 0 0 0 0-10Z',
  };
  const app = () => window.app;
  const emit = (ev, data) => new Promise((resolve) => {
    const a = app();
    if (!a || !a.socket) return resolve({ error: 'Sin conexión.' });
    let done = false;
    const t = setTimeout(() => { if (!done) { done = true; resolve({ error: 'El servidor no contestó. Probá de nuevo.' }); } }, 10000);
    a.socket.emit(ev, data || {}, (r) => { if (done) return; done = true; clearTimeout(t); resolve(r || {}); });
  });
  const avatar = (p, cls = 'jg-av') => {
    const a = el('div', cls);
    if (p && p.compu) { a.textContent = '🤖'; return a; }
    if (p && p.avatar) { const i = el('img'); i.src = p.avatar; i.alt = ''; i.onerror = () => { i.remove(); a.textContent = (p.nombre || '?').charAt(0).toUpperCase(); }; a.appendChild(i); }
    else a.textContent = ((p && p.nombre) || '?').charAt(0).toUpperCase();
    return a;
  };
  // Un sonidito (sin archivos): al jugar una carta o cuando te cantan
  let actx = null;
  function beep(freq = 520, ms = 90) {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const o = actx.createOscillator(), g = actx.createGain();
      o.frequency.value = freq; o.type = 'triangle'; g.gain.value = 0.06;
      o.connect(g); g.connect(actx.destination); o.start();
      g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + ms / 1000); o.stop(actx.currentTime + ms / 1000 + 0.02);
    } catch { /* sin sonido */ }
  }
  // El aviso de la sala de espera (se sumo alguien a tu mesa, alguien marco que esta listo): dos notas que suben,
  // mas notorias que beep. Como mucho una vez cada 700 ms, por si llegan varios cambios juntos
  let campanitaT = 0;
  function campanita() {
    const t = Date.now(); if (t - campanitaT < 700) return; campanitaT = t;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume().catch(() => {});
      const nota = (freq, desde, dura) => {
        const o = actx.createOscillator(), g = actx.createGain(), t0 = actx.currentTime + desde;
        o.type = 'sine'; o.frequency.value = freq;
        g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.13, t0 + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dura);
        o.connect(g); g.connect(actx.destination); o.start(t0); o.stop(t0 + dura + 0.02);
      };
      nota(880, 0, 0.22); nota(1318.5, 0.12, 0.32);
    } catch { /* sin sonido */ }
  }

  // ── La pantalla ──
  let page = null, stack = [], tickT = null;
  function close() {
    if (!page) return;
    soltarVentana();
    page.remove(); page = null; stack = []; clearInterval(tickT);
    salirJuegos();
    document.querySelectorAll('.puente-jg-btn').forEach(b => b.classList.remove('active'));
    refreshBadge();
  }
  function back() {
    if (stack.length > 1) { stack.pop(); const [v, a] = stack[stack.length - 1]; show(v, a); refreshBadge(); }
    else close();
  }
  // (juego: en cual se esta, para el tiempo de uso)
  const juegoActual = () => {
    const v = stack.length ? stack[stack.length - 1][0] : '', j = fichasYa.find((x) => x.vistas && x.vistas[v]);
    return !j ? 'juegos' : j.id === 'shoppa' ? usoWorgs() : j.id;
  };
  window.puenteJuegos = { abierto: () => !!page, juego: juegoActual, atras: back, abrir: (id) => { stack = []; id ? go('mesa', id) : go('inicio'); }, abrirFunball: (id) => { stack = [['inicio']]; id ? go('fbMesa', id) : go('inicio', 'funball'); }, abrirJuego: (id) => { if (/^[a-z0-9-]{2,24}$/.test(String(id || ''))) go('inicio', id); }, /* (las mesas de juego de CV Hotel: Atrás vuelve al hotel) */ desafiar: (p, texto) => desafioDM(p, texto) };
  function frame() {
    if (page) return page;
    if (window.puenteMercado && window.puenteMercado.abierto()) { try { while (window.puenteMercado.abierto()) window.puenteMercado.atras(); } catch { /* sigue */ } }
    page = el('div', 'puente-jg');
    page.id = 'puente-juegos';
    const bar = byId('server-bar');
    if (!mobile() && bar) page.style.left = Math.round(bar.getBoundingClientRect().right) + 'px';
    document.body.appendChild(page);
    document.querySelectorAll('.puente-jg-btn').forEach(b => b.classList.add('active'));
    return page;
  }
  function go(view, arg) { frame(); stack.push([view, arg]); show(view, arg); refreshBadge(); }
  // Boton para pasar el enlace de la biblioteca (/app?juegos) o de un juego (/app?juegos=truco)
  function botonEnlace(ruta, titulo) {
    const b = el('button', 'jg-icono'); b.type = 'button';
    b.title = mobile() ? 'Compartir' : 'Copiar enlace'; b.setAttribute('aria-label', b.title);
    b.innerHTML = svg(I.enlace, 22);
    b.addEventListener('click', () => {
      const url = /^https?:\/\//.test(ruta) ? ruta : location.origin + ruta;
      if (navigator.share && mobile()) { navigator.share({ title: titulo, url }).catch(() => {}); return; }
      const done = () => toast('Enlace copiado: pegalo en un canal o en un mensaje', 'success');
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, () => prompt('Copiá el enlace:', url));
      else prompt('Copiá el enlace:', url);
    });
    return b;
  }
  function head(title, right) {
    const h = el('div', 'jg-head');
    const b = el('button', 'jg-icono'); b.type = 'button';
    const root = stack.length <= 1;
    b.innerHTML = svg(root && !mobile() ? I.cerrar : I.atras, 24);
    b.setAttribute('aria-label', root ? 'Cerrar' : 'Volver');
    b.addEventListener('click', back);
    h.append(b, el('div', 'jg-titulo', title));
    if (right) h.appendChild(right);
    return h;
  }
  function show(view, arg) {
    clearInterval(tickT);
    soltarVentana();
    page.textContent = '';
    salirJuegos(view);
    const propias = { inicio };
    if (!propias[view]) { abrirJuego(null, view, arg); return; } // (una vista de un juego: la dice su ficha)
    try { propias[view](arg); } catch (err) { console.warn('[puente] juegos:', err); }
  }

  // ── El chat de la partida (chat-partida.js): Funball, Ajedrez y GlobalSiege ──
  // Para hablar con los rivales mientras se juega (el Truco tiene el suyo, al costado). La caja queda
  // fija debajo de la mesa, fuera de lo que se vuelve a dibujar en cada jugada (asi no se pierde lo
  // que se esta escribiendo), y solo cambia la lista. Es temporal: se borra cuando se cierra la mesa
  // El que mira una partida (no juega): un cartel arriba, para que se entienda por que no puede jugar
  function cartelMirando(b, s) {
    if (!s || s.soyJugador !== false || s.estado === 'esperando') return;
    const n = [s.yo, s.rival].filter(Boolean).map(p => p.nombre).join(' y ');
    b.appendChild(el('div', 'jg-mirando', s.estado === 'terminada' ? `👀 Mirabas la partida de ${n}` : `👀 Estás mirando la partida de ${n}`));
  }
  window.puenteMirando = cartelMirando;
  // ── El zumbido (chat-partida.js): el boton 📳 al lado de Enviar, cuando le toca a otro ──
  const puedeZumbar = (s) => !!s && s.estado === 'jugando' && s.teToca === false && !s.compu && s.soyJugador !== false;
  function botonZumbido(juego, id) {
    const b = el('button', 'jg-btn jg-zumbido', '📳'); b.type = 'button';
    b.title = 'Zumbido: avisale que le toca jugar'; b.setAttribute('aria-label', 'Mandar un zumbido');
    b.addEventListener('click', async () => {
      if (b.dataset.yendo) return;
      b.dataset.yendo = '1';
      const r = await emit(juego + ':accion', { id, tipo: 'zumbido' });
      delete b.dataset.yendo;
      if (r && r.error) toast(r.error, 'error');
      else if (r && r.ok) { toast(r.quedan > 0 ? 'Zumbido enviado' : 'Zumbido enviado (es el último de este turno)', 'success'); sacudir(page); }
    });
    return b;
  }
  function sacudir(x) {
    if (!x) return;
    try { if (matchMedia('(prefers-reduced-motion: reduce)').matches) return; } catch { /* como siempre */ }
    x.classList.remove('puente-zumbido'); void x.offsetWidth; x.classList.add('puente-zumbido');
    setTimeout(() => x.classList.remove('puente-zumbido'), 700);
  }
  // el sonido: un bzz grave que tiembla (sintetizado)
  let zCtx = null;
  function sonarZumbido() {
    try {
      zCtx = zCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (zCtx.state === 'suspended') zCtx.resume();
      const t = zCtx.currentTime, o = zCtx.createOscillator(), lfo = zCtx.createOscillator(), lg = zCtx.createGain(), g = zCtx.createGain();
      o.type = 'sawtooth'; o.frequency.value = 95; lfo.frequency.value = 28; lg.gain.value = 18;
      lfo.connect(lg).connect(o.frequency);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.2, t + 0.03); g.gain.setValueAtTime(0.2, t + 0.5); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.65);
      o.connect(g).connect(zCtx.destination); o.start(t); lfo.start(t); o.stop(t + 0.7); lfo.stop(t + 0.7);
    } catch { /* sin sonido */ }
  }
  // Me llego un zumbido: si estoy en esa mesa, tiembla la mesa; si no, tiembla la pantalla. Siempre el aviso
  function zumbidoRecibido(z) {
    if (!z) return;
    const abierta = page && stack.length ? String(stack[stack.length - 1][1] || '') : '';
    const aca = !!page && abierta === String(z.id);
    sonarZumbido();
    try { if (navigator.vibrate) navigator.vibrate([120, 60, 120]); } catch { /* sin vibrar */ }
    sacudir(aca ? page : document.body);
    toast(aca ? `${z.de} te mandó un zumbido` : `${z.de} te mandó un zumbido: te toca en el ${z.titulo}`, 'info');
  }
  window.puenteZumbido = { recibido: zumbidoRecibido };
  // ── Los espectadores en el chat (chat-partida.js) ──
  // Al que juega: los pedidos ("X quiere participar en el chat", Aceptar / No). Al que mira y todavia no lo
  // aceptaron: el boton para pedirlo (o que ya lo pidio), en lugar de los mensajes y lo de escribir
  function espChat(c, s, juego) {
    const t = c.querySelector('.jg-chat-t');
    let pb = c.querySelector('.jg-chat-pedidos');
    if (!pb) { pb = el('div', 'jg-chat-pedidos'); if (t) t.after(pb); else c.prepend(pb); }
    const ped = s.pedidosChat || [];
    const kp = ped.map(p => p.uid).join(',');
    if (pb.dataset.k !== kp) {
      const habia = pb.dataset.k ? pb.dataset.k.split(',').length : 0;
      if (pb.dataset.k !== undefined && ped.length > habia) beep(660, 80);
      pb.dataset.k = kp; pb.textContent = '';
      for (const p of ped) {
        const r = el('div', 'jg-chat-pedido');
        r.appendChild(el('span', 'jg-chat-pedido-t', `👀 ${p.nombre} quiere participar en el chat`));
        const responder = (tipo) => emit(juego + ':accion', { id: s.id, tipo, uid: p.uid }).then(x => { if (x && x.error) toast(x.error, 'error'); });
        const si = el('button', 'jg-btn jg-primario', 'Aceptar'); si.type = 'button'; si.addEventListener('click', () => responder('aceptarChat'));
        const no = el('button', 'jg-btn', 'No'); no.type = 'button'; no.addEventListener('click', () => responder('rechazarChat'));
        r.append(si, no); pb.appendChild(r);
      }
    }
    const mira = s.soyJugador === false && !!s.chatEsp;
    const ver = !mira || s.chatEsp === 'ok';
    for (const x of c.querySelectorAll('.jg-chat-lista, .jg-chat-form, .jg-chat-rapidos')) x.style.display = ver ? '' : 'none';
    let pe = c.querySelector('.jg-chat-pedir');
    if (ver) { if (pe) pe.remove(); return; }
    if (!pe) { pe = el('div', 'jg-chat-pedir'); pb.after(pe); }
    if (pe.dataset.k === s.chatEsp) return;
    pe.dataset.k = s.chatEsp; pe.textContent = '';
    if (s.chatEsp === 'pedido') { pe.appendChild(el('div', 'jg-chat-pedir-t', 'Pediste participar en el chat. Cuando alguien de la partida te acepte, vas a poder escribir.')); return; }
    pe.appendChild(el('div', 'jg-chat-pedir-t', 'El chat es de los que juegan. Si querés, pedí participar: con que uno te acepte, podés escribir como espectador.'));
    const b = el('button', 'jg-btn jg-primario', 'Pedir participar en el chat'); b.type = 'button';
    b.addEventListener('click', () => emit(juego + ':accion', { id: s.id, tipo: 'pedirChat' }).then(r => { if (r && r.error) toast(r.error, 'error'); else toast('Pedido enviado', 'success'); }));
    pe.appendChild(b);
  }
  // el nombre en el chat: el espectador, "Nombre (espectador)"
  const nombreChat = (m, otro) => (m.esp ? `${m.quien || 'Alguien'} (espectador)` : m.mio ? (m.quien || 'Vos') : (m.quien || otro || '?'));
  function chatPartida(padre, s, enviar, juego) {
    let c = padre.querySelector(':scope > .jg-chat-partida');
    if (!s || (!s.chat && !(s.chatEsp && juego))) { if (c) c.remove(); return; }
    if (!c || c.dataset.id !== String(s.id)) {
      if (c) c.remove();
      c = el('div', 'jg-chat jg-chat-partida'); c.dataset.id = String(s.id);
      const lista = el('div', 'jg-chat-lista');
      const form = el('form', 'jg-chat-form');
      const inp = el('input'); inp.type = 'text'; inp.maxLength = 200; inp.autocomplete = 'off'; inp.enterKeyHint = 'send';
      inp.placeholder = 'Escribí un mensaje';
      const send = el('button', 'jg-btn jg-primario', 'Enviar'); send.type = 'submit';
      form.append(inp);
      // (el zumbido, solo para los que juegan: el espectador no lo ve)
      if (juego && s.soyJugador !== false && !s.chatEsp) form.append(botonZumbido(juego, s.id));
      form.append(send);
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const t = inp.value.trim();
        if (!t) return;
        inp.value = '';
        enviar(t).then(r => { if (r && r.error) { toast(r.error, 'error'); if (!inp.value) inp.value = t; } });
      });
      const nota = el('div', 'jg-chat-nota', 'Es solo para esta partida: se borra cuando se cierra la mesa.');
      nota.style.cssText = 'font-size: 0.75rem; color: #949ba4;';
      c.append(el('div', 'jg-chat-t', 'Chat de la partida'), lista, form, nota);
      // debajo de la mesa, del ancho de la columna
      if (padre === page) c.style.cssText = 'box-sizing: border-box; width: calc(100% - 2rem); max-width: 40rem; margin: 0.25rem auto calc(1.5rem + env(safe-area-inset-bottom, 0px));';
      lista.style.height = '10rem';
      padre.appendChild(c);
    }
    const zb = c.querySelector('.jg-zumbido');
    if (zb) zb.style.display = puedeZumbar(s) ? '' : 'none';
    if (juego) espChat(c, s, juego);
    if (!s.chat) return;
    const lista = c.querySelector('.jg-chat-lista');
    const msgs = s.chat;
    // (los colores cuentan: en GlobalSiege llegan cuando empieza la guerra)
    const key = (msgs.length ? msgs.length + ':' + msgs[msgs.length - 1].t : '0') + msgs.map(m => m.color || '').join('');
    if (lista.dataset.key === key) return;
    const abajo = lista.scrollHeight - lista.scrollTop - lista.clientHeight < 40;
    const antes = Number((lista.dataset.key || '0').split(':')[0]);
    lista.textContent = '';
    if (!msgs.length) lista.appendChild(el('div', 'jg-chat-vacio', 'Todavía no hay mensajes. ¡Saludá!'));
    for (const m of msgs) {
      const x = el('div', 'jg-msg' + (m.mio ? ' mio' : '') + (m.esp ? ' esp' : ''));
      const b = el('b', '', nombreChat(m));
      if (m.color && !m.mio && !m.esp) b.style.color = m.color;
      x.append(b, document.createTextNode(': ' + m.text));
      lista.appendChild(x);
    }
    if (lista.dataset.key && msgs.length > antes && !msgs[msgs.length - 1].mio) beep(760, 60);
    if (abajo || !lista.dataset.key || (msgs.length && msgs[msgs.length - 1].mio)) lista.scrollTop = lista.scrollHeight;
    lista.dataset.key = key;
  }

  // ── Los juegos de pantalla (cada uno en su repositorio; sus fichas, juegos-registro.js) ──
  // Su pantalla esta aparte (/puente/<web>/ y lo que diga su ficha) y se baja recien la primera vez que se abre. La
  // ficha dice que vistas de la pila son suyas ('mesa', 'fbMesa', 'mrCrear'...) y que funcion del juego abre cada una,
  // su vista de mesa, lo que hay que bajar antes (el mapa de GlobalSiege) y su hoja de estilo.
  let fichasP = null;
  let fichasYa = []; // (las que ya llegaron: para lo que no puede esperar, como el clic en un enlace)
  const fichas = () => fichasP || (fichasP = registroJuegos()
    .then((js) => js.filter((j) => j.cliente && (j.cliente.tipo === 'ventana' ? j.cliente.url && Object.keys(j.vistas || {}).length : j.web && j.cliente.global && j.cliente.js)))
    .then((js) => { fichasYa = js; return js; })
    .catch((e) => { fichasP = null; throw e; }));
  fichas().catch(() => { /* se vuelve a pedir al abrir un juego */ });
  const cargas = new Map(); // id del juego -> su pantalla lista
  const globales = new Set(); // los juegos ya cargados (para que suelten su mesa al cambiar de pantalla)
  const conScript = (src) => new Promise((ok, mal) => { const x = document.createElement('script'); x.src = src; x.onload = ok; x.onerror = mal; document.head.appendChild(x); });
  // las piezas del marco que se le prestan a cada juego (todas a todos: cada uno usa las suyas)
  function piezas(j) {
    return { el, emit, head, go, back, close, show, toast, avatar, botonEnlace, confirmar, svg, I, beep, campanita, mobile, setBadge, byId, app,
      cartelMirando, botonSalir, botonZumbido, puedeZumbar, espChat, nombreChat, ctaInvitado, chatPartida, chat: chatPartida, desafio: desafioDM, ajPieza,
      unirse: (id) => unirseA(j, id), page: () => page, stack: () => stack, nuevaPila: (p) => { stack = p; } };
  }
  function cargarJuego(j) {
    if (!cargas.has(j.id)) {
      const base = '/puente/' + j.web + '/', v = '?v=' + (j.version || 1), c = j.cliente;
      // su CSS (de su repositorio): se espera a que llegue, asi el juego no se ve un instante sin estilo (como mucho 4 s)
      let conCss = Promise.resolve();
      if (c.css && !document.querySelector(`link[data-juego="${j.id}"]`)) {
        const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = base + c.css + v; css.dataset.juego = j.id;
        conCss = new Promise((ok) => { css.onload = ok; css.onerror = ok; setTimeout(ok, 4000); });
        document.head.appendChild(css);
      }
      cargas.set(j.id, Promise.all([conCss, window[c.global] ? Promise.resolve() : (j.antes || []).reduce((p, a) => p.then(() => conScript(base + a + v)), Promise.resolve()).then(() => conScript(base + c.js + v))])
        .then(() => { window[c.global].usar(piezas(j)); globales.add(c.global); })
        .catch((e) => { cargas.delete(j.id); throw e; }));
    }
    return cargas.get(j.id);
  }
  const nombreDe = (id) => (fichasYa.find((x) => x.id === id) || {}).nombre || 'el juego';
  // Abre una vista de un juego: el juego por su id (su sala: 'inicio') o, sin id, el que tenga esa vista en su ficha
  function abrirJuego(id, vista, arg) {
    const top = stack[stack.length - 1];
    if (!page.firstChild) { page.appendChild(head(id ? nombreDe(id) : 'Juegos')); page.appendChild(el('div', 'jg-estado', 'Cargando…')); }
    let j = null;
    fichas().then((js) => {
      j = id ? js.find((x) => x.id === id) : js.find((x) => x.vistas && x.vistas[vista]);
      if (!j) throw new Error('sin ficha para ' + (id || vista));
      return j.cliente.tipo === 'ventana' ? null : cargarJuego(j);
    }).then(() => {
      if (!page || stack[stack.length - 1] !== top) return;
      page.textContent = '';
      if (j.cliente.tipo === 'ventana') return ventana(j, arg);
      window[j.cliente.global][vista === 'inicio' ? 'inicio' : j.vistas[vista]](arg);
    }).catch((err) => { console.warn('[puente] juegos:', err); toast(`No se pudo abrir ${j ? j.nombre : id ? nombreDe(id) : 'el juego'}. Probá de nuevo.`, 'error'); });
  }
  // Entrar a una mesa: el evento "unirse" del juego y su vista de mesa
  async function unirseA(j, id) {
    const r = await emit(j.eventos.unirse, { id });
    if (r.error) return toast(r.error, 'error');
    go(j.mesa, r.id);
  }
  // Al cambiar de pantalla (vista: la nueva) o al cerrar Juegos: cada juego cargado suelta su mesa
  function salirJuegos(vista) { for (const g of globales) { try { if (window[g] && window[g].salir) window[g].salir(vista); } catch (err) { console.warn('[puente] juegos:', err); } } }

  // Mensaje directo al desafiado, con el enlace ya escrito (sin mandar)
  function desafioDM(p, text) {
    const a = app();
    let done = false;
    const fill = () => {
      if (done) return; done = true;
      setTimeout(() => { const box = byId('message-input'); if (!box) return; box.value = text; box.dispatchEvent(new Event('input', { bubbles: true })); box.focus(); }, 900);
    };
    a.socket.once('dm-opened', fill);
    setTimeout(() => { if (!done) a.socket.off('dm-opened', fill); }, 8000);
    toast('Mandale el mensaje para que entre a la mesa', 'success');
    close();
    a.socket.emit('start-dm', { targetUserId: p.id });
  }

  // ── Sala ──
  // La biblioteca, como la de Steam: cada juego es una tarjeta con su tapa, de su ficha (juegos-registro.js). Un juego
  // nuevo trae su ficha en su repositorio y aparece solo.
  // Las tapas dibujadas aca, para los juegos sin imagen (el Ajedrez, con las piezas de ajPieza)
  const DIBUJOS = { ajedrez: () => AJ_TAPA() };
  // el nombre de una mesa segun su modo, si la ficha lo dice ("WORGS: Shoppa" o "WORGS: Normal")
  const nombreMesa = (j, m) => (j.modos && m ? j.modos[m.modo] || j.modos[''] || j.nombre : j.nombre);
  // Los que se juegan contra otra persona: solo a esos se les piden las mesas y las partidas en curso
  const enRed = (js) => js.filter((j) => j.eventos && j.eventos.inicio && !(j.tarjeta && j.tarjeta.aparte));
  // la tapa de un juego en una caja: su imagen, su dibujo o, si no hay ninguno, su nombre
  function ponerTapa(caja, j, sin) {
    const dib = !j.tapa && DIBUJOS[j.id];
    if (dib) { caja.innerHTML = dib(); return; }
    if (!j.tapa) { if (sin) caja.appendChild(el('div', 'jg-tapa-sin', j.nombre)); return; }
    const img = el('img'); img.alt = ''; img.draggable = false; img.src = j.tapa;
    if (j.ajuste) img.style.objectFit = j.ajuste;
    img.addEventListener('error', () => { img.remove(); if (sin) caja.insertBefore(el('div', 'jg-tapa-sin', j.nombre), caja.firstChild); });
    caja.appendChild(img);
  }
  // La tapa chica de un juego (para las filas de partidas y mesas), con la foto de quien (o un numero) encima
  function tapaChica(j, quien) {
    const c = el('div', 'jg-mini'); c.style.background = j.fondo;
    ponerTapa(c, j, false);
    if (quien) { const a = typeof quien === 'string' ? el('span', 'jg-mini-n', quien) : avatar(quien); a.classList.add('jg-mini-av'); c.appendChild(a); }
    return c;
  }
  const haceCuanto = (t) => {
    if (!(t > 0)) return '';
    const m = Math.max(0, Math.round((Date.now() - t) / 60e3));
    return m < 1 ? 'recién' : m < 60 ? `hace ${m} min` : m < 48 * 60 ? `hace ${Math.round(m / 60)} h` : `hace ${Math.round(m / 1440)} días`;
  };
  let bibVez = 0; // (si se vuelve a armar mientras llegan las fichas, la vieja no se dibuja)
  async function biblioteca() {
    const top = stack[stack.length - 1], vez = ++bibVez;
    let JUEGOS;
    try { JUEGOS = await fichas(); } catch {
      if (page && stack[stack.length - 1] === top && vez === bibVez) { page.appendChild(head('Juegos')); page.appendChild(el('div', 'jg-estado', 'No se pudieron traer los juegos. Probá de nuevo.')); }
      return;
    }
    if (!page || stack[stack.length - 1] !== top || vez !== bibVez) return;
    const JUEGOS_EN_RED = enRed(JUEGOS);
    // el enlace de la biblioteca es el de la pagina de los juegos (juegos.<dominio>, juegos.html): se ve sin cuenta
    page.appendChild(head('Juegos', botonEnlace('https://juegos.' + location.hostname.replace(/^chat\./, '') + '/', 'Juegos · __PUENTE_APP__')));
    const b = el('div', 'jg-bib'); page.appendChild(b);
    const seguir = el('div'); b.appendChild(seguir);
    const mesasBox = el('div'); b.appendChild(mesasBox); // las mesas que esperan rival, de todos los juegos (pintarMesas)
    const titulo = el('div', 'jg-bib-titulo', `Tus juegos (${JUEGOS.filter(j => !j.tarjeta.aparte).length})`); b.appendChild(titulo);
    // (el titulo cuenta las tarjetas que se ven: un juego que este servidor no tiene se saca, y los "aparte" se suman al aparecer)
    const contar = () => { titulo.textContent = `Tus juegos (${[...grilla.querySelectorAll('.jg-tapa:not(.pronto)')].filter(x => x.style.display !== 'none').length})`; };
    const sacar = (id) => { tarjetas[id].t.remove(); contar(); };
    const grilla = el('div', 'jg-tapas'); b.appendChild(grilla);
    const tarjetas = {};
    for (const j of JUEGOS) {
      const t = el('button', 'jg-tapa'); t.type = 'button'; t.setAttribute('aria-label', j.nombre);
      const caja = el('div', 'jg-tapa-img'); caja.style.background = j.fondo;
      const badge = el('span', 'jg-tapa-badge'); badge.style.display = 'none';
      const vivo = el('span', 'jg-tapa-vivo'); vivo.style.display = 'none';
      // la tapa: una imagen del servidor, o un dibujo hecho aca
      ponerTapa(caja, j, true);
      caja.append(badge, vivo);
      t.append(caja, el('div', 'jg-tapa-n', j.nombre), el('div', 'jg-tapa-s', j.sub));
      t.addEventListener('click', () => go('inicio', j.id));
      if (j.tarjeta.aparte) t.style.display = 'none';
      grilla.appendChild(t);
      tarjetas[j.id] = { t, badge, vivo };
    }
    const pronto = el('div', 'jg-tapa pronto');
    const pc = el('div', 'jg-tapa-img'); pc.appendChild(el('div', 'jg-tapa-sin', '＋'));
    pronto.append(pc, el('div', 'jg-tapa-n', 'Más juegos'), el('div', 'jg-tapa-s', 'Muy pronto'));
    grilla.appendChild(pronto);
    // "aparte" (BACITY): su tarjeta nace oculta y se pide por separado, sin demorar a los demas; se muestra solo si su
    // "inicio" dice que esta cuenta puede entrar (si el juego no esta instalado, o esta en prueba, no se ve nada)
    for (const j of JUEGOS.filter(x => x.tarjeta.aparte && x.eventos.inicio)) emit(j.eventos.inicio).then((d) => {
      if (!page || !b.isConnected || !d || d.error || (d.tableros && !d.tableros.length)) return;
      tarjetas[j.id].t.style.display = ''; contar();
      const vt = j.tarjeta.vivo, n = vt && d[vt.campo];
      const vv = n > 0 ? (n === 1 ? vt.uno : vt.varios.replace('{n}', n)) : '';
      if (vv) { tarjetas[j.id].vivo.textContent = vv; tarjetas[j.id].vivo.style.display = ''; }
    }).catch(() => { /* sin respuesta: queda oculta */ });
    // las partidas en curso de todos los juegos, primero las que te toca
    const datos = await Promise.all(JUEGOS_EN_RED.map(j => emit(j.eventos.inicio).catch(() => ({ error: true }))));
    if (!page || !b.isConnected) return;
    const curso = [];
    JUEGOS_EN_RED.forEach((j, i) => {
      const d = datos[i];
      if (!d || d.error) return;
      if (d.tableros && !d.tableros.length) { sacar(j.id); return; }
      const mias = (d.mias || []).filter(m => m.estado !== 'terminada');
      const n = mias.filter(m => m.teToca).length + (d.abiertas || []).filter(a => a.paraVos).length;
      if (n) { tarjetas[j.id].badge.textContent = n === 1 ? 'Te toca' : `${n} pendientes`; tarjetas[j.id].badge.style.display = ''; }
      // lo que se esta jugando ahora (alguien jugo en la ultima media hora) o, si no, las mesas que esperan
      const act = d.activas || 0, esp = (d.abiertas || []).length;
      const vv = act ? `${act} ${act === 1 ? 'partida' : 'partidas'} ahora` : esp ? `${esp} ${esp === 1 ? 'mesa esperando' : 'mesas esperando'}` : '';
      if (vv) { tarjetas[j.id].vivo.textContent = vv; tarjetas[j.id].vivo.style.display = ''; }
      for (const m of mias) curso.push({ j, m });
    });
    pintarMesas(mesasBox, JUEGOS_EN_RED, datos);
    if (!curso.length) return;
    curso.sort((a, z) => (z.m.teToca ? 1 : 0) - (a.m.teToca ? 1 : 0));
    const st = el('div', 'jg-bib-titulo'); st.append('Seguir jugando', el('small', null, 'tus partidas en curso'));
    seguir.appendChild(st);
    const l = el('div', 'jg-seguir'); seguir.appendChild(l);
    for (const { j, m } of curso.slice(0, 6)) {
      const who = m.rival || m.invitado || { nombre: '?' };
      const espera = m.estado === 'esperando';
      // en las de varios (GlobalSiege) la mesa que espera muestra cuantos hay; en las de dos, quien falta
      const varios = espera && m.flexible && m.sentados > 0;
      const r = el('button', 'jg-fila jg-fila-tapa' + (m.teToca ? ' toca' : '')); r.type = 'button';
      const tx = el('div', 'jg-ftexto');
      const que = espera ? (varios ? `${m.sentados} en la mesa, entran hasta ${m.total}` : `armada ${haceCuanto(m.ult)}`) : m.estado === 'jugando' && m.ult ? `última jugada ${haceCuanto(m.ult)}` : '';
      const meta = el('div', 'jg-fmeta', nombreMesa(j, m)); if (que) meta.append(' · ', el('i', null, que));
      tx.append(el('div', 'jg-fnombre', espera ? (m.invitado ? `Esperando a ${m.invitado.nombre}` : varios ? 'Esperando gente' : 'Esperando rival') : `vs ${who.nombre}`), meta);
      r.append(tapaChica(j, varios ? String(m.sentados) : espera && !m.invitado ? null : who), tx);
      r.appendChild(m.teToca ? el('span', 'jg-chip amarillo', 'Te toca') : el('span', 'jg-chip', 'Abrir'));
      r.addEventListener('click', () => go(j.mesa || 'mesa', m.id));
      l.appendChild(r);
    }
  }
  // Las mesas que esperan rival en cualquier juego, como "Esperando rival" de El club hoy: primero los
  // desafios para vos. Tocar una entra a jugar (truco, funball y ajedrez) o abre la sala de ese juego.
  function pintarMesas(box, JUEGOS_EN_RED, datos) {
    const lista = [];
    JUEGOS_EN_RED.forEach((j, i) => { const d = datos[i]; if (d && !d.error) for (const a of d.abiertas || []) lista.push({ j, a }); });
    lista.sort((x, y) => (y.a.paraVos ? 1 : 0) - (x.a.paraVos ? 1 : 0));
    const mt = el('div', 'jg-bib-titulo'); mt.append('Mesas esperando rival', el('small', null, 'de todos los juegos'));
    box.appendChild(mt);
    if (!lista.length) { box.appendChild(el('div', 'jg-vacio jg-mesas-vacio', 'Ninguna mesa esperando ahora. Elegí un juego abajo y armá una partida.')); return; }
    const l = el('div', 'jg-seguir'); box.appendChild(l);
    for (const { j, a } of lista.slice(0, 8)) {
      const quien = a.creador || { nombre: '?' };
      const r = el('button', 'jg-fila jg-fila-tapa' + (a.paraVos ? ' toca' : '')); r.type = 'button';
      const tx = el('div', 'jg-ftexto');
      const meta = el('div', 'jg-fmeta');
      if (a.enLinea) { const p = el('span', 'jg-enlinea'); p.title = 'Conectado ahora'; meta.appendChild(p); }
      meta.append(nombreMesa(j, a));
      if (a.creado) meta.append(' · ', el('i', null, `armada ${haceCuanto(a.creado)}`));
      tx.append(el('div', 'jg-fnombre', a.paraVos ? `${quien.nombre} te desafía` : quien.nombre), meta);
      r.append(tapaChica(j, quien), tx, el('span', 'jg-chip ' + (a.paraVos ? 'amarillo' : 'azul'), 'Jugar'));
      r.addEventListener('click', () => {
        if (j.cliente.tipo === 'ventana' && j.mesa) { stack = []; go(j.mesa, a.id); }
        else if (j.lista === 'unirse' && j.eventos.unirse) unirseA(j, a.id);
        else go('inicio', j.id);
      });
      l.appendChild(r);
    }
    if (lista.length > 8) box.appendChild(el('div', 'jg-fmeta jg-mesas-mas', `y ${lista.length - 8} más: entrá a cada juego para verlas`));
  }
  // ── Los juegos en ventana (WORGS, BACITY, Curveball...): un iframe del mismo origen, con su ficha ──
  // Su CSS y su JS no se mezclan con el chat. La ficha dice la direccion de su pagina, que puede pedir (microfono para
  // las voces de WORGS o el chat por cercania de BACITY, mando, pantalla completa), si toma el teclado al abrir y su
  // evento "salir" (Curveball: que el servidor deje de mandar la partida al dejar la mesa). Los eventos de adentro no
  // llegan al chat, asi que se le avisa al tiempo de uso (uso.js) para que cuente mientras se juega.
  const ventanas = new Map(); // id del juego -> su iframe (el ultimo que se abrio)
  let ventanaSalir = null;    // { evento, id }: lo que hay que avisarle al servidor al dejar la ventana
  function soltarVentana() {
    const v = ventanaSalir; ventanaSalir = null;
    if (!v) return;
    try { const a = app(); if (a && a.socket) a.socket.emit(v.evento, { id: v.id }); } catch { /* sin socket */ }
  }
  // WORGS: el modo que se esta jugando (para el tiempo de uso: "WORGS: Shoppa" o "WORGS: Normal")
  const usoWorgs = () => { try { const f = ventanas.get('shoppa'), w = f && f.isConnected && f.contentWindow; return w && w.worgsModo && w.worgsModo() === 'normal' ? 'worgsnormal' : 'shoppa'; } catch { return 'shoppa'; } };
  function ventana(j, mesa) {
    const c = j.cliente;
    page.appendChild(head(j.nombre, botonEnlace('/app?juegos=' + ((j.enlace && j.enlace.param) || j.id), j.nombre + ' · __PUENTE_APP__')));
    const b = el('div', c.clase), marco = el('div', c.clase + '-marco'), ifr = el('iframe', c.clase + '-iframe');
    ifr.src = c.url + '?v=' + (j.version || 1) + (mesa ? '&mesa=' + encodeURIComponent(mesa) : '');
    ventanas.set(j.id, ifr);
    if (mesa && j.eventos && j.eventos.salir) ventanaSalir = { evento: j.eventos.salir, id: mesa };
    ifr.title = j.nombre; ifr.allow = (c.permisos || []).join('; '); ifr.setAttribute('allowfullscreen', ''); ifr.loading = 'eager';
    let ultimo = 0;
    const marcar = () => { const t = Date.now(); if (t - ultimo < 2000) return; ultimo = t; try { window.__puenteUsoActivo && window.__puenteUsoActivo(); } catch { /* sin uso */ } };
    ifr.addEventListener('load', () => { try { const w = ifr.contentWindow; for (const ev of ['pointerdown', 'pointermove', 'keydown', 'touchstart']) w.addEventListener(ev, marcar, { passive: true, capture: true }); if (c.foco) w.focus(); } catch { /* otro origen */ } });
    marco.appendChild(ifr); b.appendChild(marco); page.appendChild(b);
  }
  async function inicio(which) {
    // un juego con ficha: su sala (los de pantalla) o su ventana (la pila queda en la vista del juego, para que el
    // tiempo de uso diga "shoppa" y no "juegos"); si no, la biblioteca
    const fj = which ? (await fichas().catch(() => [])).find((j) => j.id === which) : null;
    if (fj && !page) return;
    if (fj && fj.cliente.tipo === 'ventana') { const v = Object.keys(fj.vistas)[0]; if (stack.length) stack[stack.length - 1] = [v]; return abrirJuego(fj.id, v); }
    if (fj) return abrirJuego(which, 'inicio');
    if (!page) return;
    return biblioteca();
  }

  // ── La mesa ──
  // El boton de arriba a la derecha en una mesa: dice lo que hace segun el momento
  function botonSalir(b, s) {
    if (!b) return;
    const t = s.estado === 'esperando' && s.soyCreador ? 'Cancelar partida' : s.estado === 'jugando' && s.soyJugador ? 'Abandonar partida' : 'Copiar enlace';
    b.textContent = t; b.style.visibility = '';
    b.classList.toggle('jg-peligro', t !== 'Copiar enlace');
  }
  // Un aviso dentro de CV Chat, en vez del cartel del navegador. Devuelve true si se acepta
  function confirmar(titulo, texto, si, no) {
    return new Promise((res) => {
      const fondo = el('div', 'jg-aviso-fondo');
      const box = el('div', 'jg-aviso'); box.setAttribute('role', 'alertdialog'); box.setAttribute('aria-modal', 'true');
      const acc = el('div', 'jg-aviso-acc');
      const bNo = el('button', 'jg-btn', no || 'Cancelar'); bNo.type = 'button';
      const bSi = el('button', 'jg-btn jg-peligro', si || 'Aceptar'); bSi.type = 'button';
      acc.append(bNo, bSi);
      box.append(el('div', 'jg-aviso-t', titulo), el('div', 'jg-aviso-s', texto), acc);
      fondo.appendChild(box);
      const fin = (v) => { document.removeEventListener('keydown', kd, true); fondo.remove(); res(v); };
      const kd = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fin(false); } };
      document.addEventListener('keydown', kd, true);
      bNo.addEventListener('click', () => fin(false));
      bSi.addEventListener('click', () => fin(true));
      fondo.addEventListener('click', (e) => { if (e.target === fondo) fin(false); });
      (page || document.body).appendChild(fondo);
      bNo.focus();
    });
  }
  // Al terminar una partida, quien jugo sin cuenta (invitado, login.js): la invitacion a hacerse la cuenta.
  // La temporal se borra al salir, asi que se sale de esa y se va a crear la nueva (truco, funball, ajedrez)
  function ctaInvitado(w, acts) {
    if (!(window.app && window.app.user && window.app.user.isGuest)) return;
    w.appendChild(el('div', 'jg-hero-s', 'Jugaste como invitado. Con tu cuenta (gratis) quedan tus partidas y el ranking, y entrás al chat del club.'));
    const c = el('button', 'jg-btn jg-primario', 'Crear mi cuenta'); c.type = 'button';
    c.addEventListener('click', () => {
      try { ['haven_token', 'haven_user'].forEach(k => localStorage.removeItem(k)); sessionStorage.removeItem('puente_jugar'); } catch { /* sin almacenamiento */ }
      location.href = '/?registro=1';
    });
    acts.insertBefore(c, acts.firstChild);
  }
  // ── Funball (funball.js) ──
  // Su pantalla esta aparte (/puente/funball/juego.js, con su propio repositorio): la carga abrirJuego, con su ficha

  // ── Ajedrez (ajedrez.js) ──
  // La sala como las otras; la mesa: el tablero (de tu lado tus piezas), arriba el rival y abajo
  // vos, con las piezas comidas y el reloj; al costado las jugadas, las tablas y el final.
  // Se juega tocando la pieza y despues la casilla, o arrastrandola.
  // Las piezas, dibujadas aca (estilo clasico): blancas de relleno claro y borde oscuro, negras al reves
  const AJ_BASE = '<path d="M10 39.5h25v-3.5H10z"/>';
  const AJ_DIBUJO = {
    p: '<path d="M22.5 8.5a4.6 4.6 0 0 0-3.7 7.3c-2 1.2-3.3 3.3-3.3 5.7 0 2.1.9 3.9 2.4 5.1-3.3 1.4-7.4 5.4-7.4 12.9h24c0-7.5-4.1-11.5-7.4-12.9a6.6 6.6 0 0 0 2.4-5.1c0-2.4-1.3-4.5-3.3-5.7a4.6 4.6 0 0 0-3.7-7.3z"/>',
    r: '<path d="M9.5 39.5h26v-3.5h-26zM12.5 36v-4h20v4zM14 32l1-3h15l1 3z"/><path d="M15 29V17h15v12z"/><path d="M15 17l-3.5-3h22L30 17zM11.5 14V8.5h4.25v2.5h4V8.5h5.5v2.5h4V8.5h4.25V14z"/>',
    n: '<path d="M13.5 36c.4-5.8 3.6-9.2 7.6-12.4-2.5.7-4.6 1.8-7 2.6-2.3.8-4.6-.4-4.6-2.9 0-2.5 3-5.6 6-8.6.9-.9 1.3-2.2 1.3-3.6l.4-3.3 2.4 2.7c.7-.6 1.5-1 2.3-1.3l.6-2.6 1.9 2.4C33 9.6 35.8 18 35.2 36z"/>',
    b: '<path d="M14.5 36h16c-.6-2-1.6-3.5-3-4.5h-10c-1.4 1-2.4 2.5-3 4.5z"/><path d="M22.5 10.3c-5 3.6-8.2 8-8.2 12.3 0 3.7 2 6.5 3.7 8h9c1.7-1.5 3.7-4.3 3.7-8 0-4.3-3.2-8.7-8.2-12.3z"/><circle cx="22.5" cy="7.6" r="2.4"/>',
    q: '<path d="M11.5 36h22c0-2.8-1-5-2.6-6.4L34.4 16l-6.3 8.6-1.6-11.5-4 11.2-4-11.2-1.6 11.5-6.3-8.6 3.5 13.6c-1.6 1.4-2.6 3.6-2.6 6.4z"/><circle cx="10.5" cy="14.6" r="2.3"/><circle cx="16.8" cy="11.4" r="2.3"/><circle cx="22.5" cy="10.4" r="2.3"/><circle cx="28.2" cy="11.4" r="2.3"/><circle cx="34.5" cy="14.6" r="2.3"/>',
    k: '<path d="M12 36h21c0-3.3-1.4-5.4-2.8-6.8 2.6-1.9 4.6-4.4 4.6-7.6 0-3.4-2.8-5.6-6-5.6-2.7 0-4.8 1.6-6.3 3.7-1.5-2.1-3.6-3.7-6.3-3.7-3.2 0-6 2.2-6 5.6 0 3.2 2 5.7 4.6 7.6-1.4 1.4-2.8 3.5-2.8 6.8z"/><path d="M21.2 5.5h2.6v3.2H27v2.6h-3.2v5.6h-2.6v-5.6H18V8.7h3.2z"/>',
  };
  // detalles (lineas del otro color) para que se lean las formas
  const AJ_DETALLE = {
    p: '',
    r: '<path d="M12.5 32h20M15 29h15M15 17h15"/>',
    n: '<path d="M17.2 17.6h.01M24 12.7c3.3 2 5.8 6.2 6.6 12.3M10.6 24.2l.8-.6"/>',
    b: '<path d="M17.5 31.5h10M20.3 17.5h4.4M22.5 15.3v4.4"/>',
    q: '<path d="M14 29.6h17"/>',
    k: '<path d="M22.5 19.7v9.5M14.4 29.2h16.2"/>',
  };
  const ajPieza = (p) => {
    const blanca = p === p.toUpperCase(), t = p.toLowerCase();
    const relleno = blanca ? '#fdfdfd' : '#26272b', borde = blanca ? '#1b1c1f' : '#0b0b0d', det = blanca ? '#1b1c1f' : '#e9e9ec';
    return `<svg viewBox="0 0 45 45" aria-hidden="true"><g fill="${relleno}" stroke="${borde}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round">${t === 'p' ? '' : AJ_BASE}${AJ_DIBUJO[t]}</g>`
      + (AJ_DETALLE[t] ? `<g fill="none" stroke="${det}" stroke-width="${t === 'n' ? 1.3 : 1.2}" stroke-linecap="round">${AJ_DETALLE[t]}${t === 'n' ? `<circle cx="17.4" cy="17.4" r="1.05" fill="${det}" stroke="none"/>` : ''}</g>` : '') + '</svg>';
  };
  const AJ_TAPA = () => `<div class="aj-tapa"><div class="aj-tapa-tab">${Array.from({ length: 16 }, (_, i) => `<span class="${(i + (i >> 2)) % 2 ? 'os' : 'cl'}"></span>`).join('')}</div><div class="aj-tapa-p">${ajPieza('n')}${ajPieza('K')}</div></div>`;
  // Su pantalla esta aparte (/puente/ajedrez/juego.js, con su propio repositorio): la carga abrirJuego, con su ficha.
  // Los dibujos de las piezas quedan aca: los usa la tapa de la biblioteca, y se le prestan al juego (ajPieza)

  // ── Icono y numerito ("te toca") ──
  function setBadge(n) {
    for (const x of document.querySelectorAll('.puente-jg-btn .puente-rail-badge')) { x.textContent = n ? String(n) : ''; x.style.display = n ? '' : 'none'; }
  }
  let badgeT = null;
  function refreshBadge() {
    // como mucho una vez cada 2 segundos: cada vez son 6 pedidos y el chat corta si llegan mas de 60 en 10 segundos
    // (jugando rapido, cada jugada pedia de nuevo y aparecia el cartel de demasiados pedidos)
    if (badgeT) return;
    badgeT = setTimeout(async () => {
      badgeT = null;
      // los juegos con mesas, segun su ficha (los que tienen "inicio" y "cambio"; BACITY no tiene mesas)
      const js = await fichas().catch(() => null);
      if (!js) return;
      const rs = await Promise.all(js.filter((j) => j.eventos && j.eventos.inicio && j.eventos.cambio).map((j) => emit(j.eventos.inicio)));
      // (sin contar la partida que esta abierta en la pantalla: ahi ya se esta jugando)
      const abierta = page && stack.length ? String(stack[stack.length - 1][1] || '') : '';
      const cuenta = (r) => (r.error || !r.mias ? 0 : r.mias.filter(m => m.teToca && String(m.id) !== abierta).length);
      setBadge(rs.reduce((n, r) => n + cuenta(r), 0));
    }, 2000);
  }
  function addButtons() {
    const mk = (cls) => {
      const b = el('button', cls + ' puente-jg-btn'); b.type = 'button'; b.title = 'Juegos'; b.setAttribute('aria-label', 'Juegos');
      // el icono propio del servidor (/puente/icono-juegos.webp, no va al repositorio); si no esta, el dibujo
      b.innerHTML = svg(I.cartas, 24);
      { const im = el('img', 'puente-ico-img'); im.alt = ''; im.draggable = false; im.addEventListener('load', () => { b.querySelector('svg')?.remove(); b.classList.add('con-icono'); b.prepend(im); }); im.src = '/puente/icono-juegos.webp?v=1'; }
      const badge = el('span', 'puente-rail-badge'); badge.style.display = 'none'; b.appendChild(badge);
      b.addEventListener('click', (e) => { e.stopPropagation(); if (page) close(); else { stack = []; go('inicio'); } });
      return b;
    };
    const after = (sel, fallback) => document.querySelector(sel) || document.querySelector(fallback);
    const m1 = after('#puente-rail .puente-mk-btn', '#puente-rail .puente-rail-server');
    if (m1 && !document.querySelector('#puente-rail .puente-jg-btn')) m1.after(mk('puente-rail-btn'));
    const m2 = after('#server-bar .puente-mk-btn', '#server-bar #home-server');
    if (m2 && !document.querySelector('#server-bar .puente-jg-btn')) m2.after(mk('server-icon'));
    for (const sel of ['.puente-jg-btn.puente-rail-btn', '.puente-jg-btn.server-icon']) [...document.querySelectorAll(sel)].slice(1).forEach(x => x.remove());
    return !!(m1 || m2) && !!document.querySelector('.puente-mk-btn');
  }

  let tries = 0;
  (function wait() {
    const a = app();
    if (!a || !a.socket || !addButtons()) { setTimeout(wait, ++tries < 120 ? 500 : 3000); return; }
    setInterval(addButtons, 2000);
    refreshBadge();
    // Lo que llega de cada juego, segun su ficha (juegos-registro.js): su estado (a la mesa abierta, y el numerito si
    // cambio el turno), sus cambios (se arma de nuevo su sala o la biblioteca) y sus eventos propios, que van a la
    // funcion del juego con ese nombre (el apuntado del Pool: "apunta"). Si el registro no contesta, se reintenta.
    const visto = new Map(); // "juego:mesa" -> "estado:teToca" (para no pedir el numerito en cada jugada)
    let conectados = false;
    (function conectarJuegos() {
      fichas().then((js) => {
        if (conectados) return;
        conectados = true;
        for (const j of js) {
          const ev = j.eventos || {}, pantalla = j.cliente.tipo === 'pantalla';
          const juego = () => (pantalla ? window[j.cliente.global] : null);
          if (ev.estado && pantalla) a.socket.on(ev.estado, (st) => {
            const m = juego();
            if (page && m) m.estado(st);
            // (los que dicen "teToca", GlobalSiege y Pool: el numerito solo si cambio el turno; los demas lo dicen de
            // otra manera, "turno", y se pide siempre: refreshBadge ya espera 2 segundos entre pedido y pedido)
            if (st.teToca === undefined) { refreshBadge(); return; }
            const k = st.estado + ':' + !!st.teToca, id = j.id + ':' + st.id;
            if (visto.get(id) !== k) { visto.set(id, k); refreshBadge(); }
          });
          // (un juego en ventana arma su sala adentro: aca solo se arma de nuevo la biblioteca)
          if (ev.cambio) a.socket.on(ev.cambio, () => { refreshBadge(); const t = page && stack[stack.length - 1]; if (t && t[0] === 'inicio' && (!t[1] || (pantalla && t[1] === j.id))) show('inicio', t[1]); });
          if (pantalla) for (const [k, nombre] of Object.entries(ev)) {
            if (['inicio', 'estado', 'cambio', 'ver', 'unirse', 'salir'].includes(k)) continue;
            a.socket.on(nombre, (x) => { const m = juego(); if (page && m && typeof m[k] === 'function') m[k](x); });
          }
        }
      }).catch(() => setTimeout(conectarJuegos, 5000));
    })();
    // El zumbido de otro jugador (chat-partida.js), de cualquier juego
    a.socket.on('juego:zumbido', (z) => { if (window.puenteZumbido) window.puenteZumbido.recibido(z); });
    // Al reconectar: el juego que tenga una mesa abierta la pide de nuevo (sin animar lo que paso mientras tanto)
    a.socket.on('connect', () => {
      if (!page) return;
      fichas().then((js) => {
        for (const j of js) {
          const m = j.cliente.tipo === 'pantalla' && window[j.cliente.global], id = m && m.abierta && m.abierta();
          if (id && j.eventos && j.eventos.ver) { emit(j.eventos.ver, { id }).then((d) => d.partida && m.estado(d.partida, true)); return; }
        }
      }).catch(() => { /* sin registro: no hay mesa que pedir */ });
    });
    if (typeof a.switchChannel === 'function') { const sw = a.switchChannel; a.switchChannel = function (...x) { close(); return sw.apply(this, x); }; }
    document.addEventListener('click', (e) => {
      if (page && e.target instanceof Element && e.target.closest('.puente-pc-dm, #home-server, #puente-rail .puente-rail-dm, #puente-rail .puente-rail-server, .puente-mk-btn')) close();
    }, true);
    // Vista previa de los enlaces a los juegos en los mensajes (/app?juegos, /app?juegos=pool). Haven no arma la
    // de los enlaces a su misma direccion, asi que va aca la tarjeta de siempre (la de los demas enlaces), con
    // la tapa del juego y el texto que ven WhatsApp o X (vincular.js, JUEGOS_ENLACE). Al tocarla abre el juego.
    // (la de cada juego: su nombre y, de su ficha, el texto y la imagen apaisada del enlace; un juego sin imagen no
    // tiene vista previa)
    // (la biblioteca: nombra a los juegos que tienen la vista previa de su enlace, como vincular.js)
    const tarjetaJuegos = () => {
      const n = fichasYa.filter((j) => j.enlace && j.enlace.imagen && !j.tarjeta.aparte).map((j) => j.nombre);
      return n.length ? { nombre: 'Juegos', desc: (n.length > 1 ? n.slice(0, -1).join(', ') + ' y ' + n[n.length - 1] : n[0]) + ' para jugar con la gente del chat.', imagen: '/puente/tapas/juegos.jpg' } : null;
    };
    // el juego de un enlace (/app?juegos=worgs): por su parametro, sus nombres viejos o su id
    const fichaDeEnlace = (p) => fichasYa.find((j) => j.id === p || (j.enlace && (j.enlace.param === p || (j.enlace.alias || []).includes(p))));
    // desde un enlace a una mesa, "atras" cierra (los que se entran directo de la lista) o vuelve a la biblioteca
    const pilaDe = (j) => (j.cliente.tipo === 'pantalla' && j.lista === 'unirse' ? [] : [['inicio']]);
    const MESA = /^[a-f0-9]{6,20}$/;
    const escH = (t) => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const tarjetas = () => {
      for (const l of document.querySelectorAll('.message-content a[href], .thread-msg-content a[href]')) {
        if (l.closest('.link-preview')) continue;
        { const msg = l.closest('[data-msg-id]'); if (msg && (msg.dataset.sinVista === '1' || (window.puenteVistaQuitada && window.puenteVistaQuitada(msg.dataset.msgId)))) continue; } // (le quitaron la vista previa)
        let u; try { u = new URL(l.href); } catch { continue; }
        if (u.origin !== location.origin || !/^\/app\/?$/.test(u.pathname) || !u.searchParams.has('juegos')) continue;
        const p = u.searchParams.get('juegos'), f = p ? fichaDeEnlace(p) : null;
        const t = !p ? tarjetaJuegos() : f && f.enlace && f.enlace.imagen ? { nombre: f.nombre, desc: f.enlace.desc, imagen: f.enlace.imagen } : null;
        const box = t && l.closest('.message-content, .thread-msg-content');
        if (!box || [...box.querySelectorAll('.link-preview')].some(x => x.dataset.url === l.href)) continue;
        try {
          const url = l.href, cerrada = !!(a._collapsedEmbeds && a._collapsedEmbeds.has(url));
          const card = el('div', 'link-preview link-preview--rich jg-tarjeta-enlace' + (cerrada ? ' lp-collapsed' : ''));
          card.dataset.url = url;
          const cab = typeof a._embedHeaderHtml === 'function' ? a._embedHeaderHtml('__PUENTE_APP__', cerrada) : '';
          card.innerHTML = cab + '<div class="lp-content">' +
            `<a class="lp-meta" href="${escH(url)}"><span class="link-preview-title">${escH(t.nombre)}</span><span class="lp-text">${escH(t.desc)}</span></a>` +
            `<a class="lp-media" href="${escH(url)}"><img class="lp-image" src="${escH(t.imagen)}" alt="" loading="lazy" width="1200" height="630"></a>` +
            '</div>';
          if (cab && typeof a._wireEmbedControls === 'function') a._wireEmbedControls(card, url);
          if (typeof a._applyEmbedSpoiler === 'function') a._applyEmbedSpoiler(card, l);
          const abajo = a._coupledToBottom;
          box.appendChild(card);
          if (abajo && typeof a._scrollToBottom === 'function') a._scrollToBottom(true);
        } catch (err) { console.warn('[puente] tarjeta del juego:', err); }
      }
    };
    let tarjetasT = null;
    new MutationObserver(() => { if (!tarjetasT) tarjetasT = setTimeout(() => { tarjetasT = null; tarjetas(); }, 150); })
      .observe(document.body, { childList: true, subtree: true });
    tarjetas();
    fichas().then(tarjetas).catch(() => { /* sin fichas: sin vistas previas de los juegos */ });
    // Enlace a una mesa: se abre aca mismo
    document.addEventListener('click', (e) => {
      const l = e.target instanceof Element && e.target.closest('a[href]');
      if (!l || e.ctrlKey || e.metaKey) return;
      let u; try { u = new URL(l.href, location.href); } catch { return; }
      const ok = u.origin === location.origin && /^\/app/.test(u.pathname);
      // La biblioteca (/app?juegos), la sala de un juego (/app?juegos=truco) o una mesa (/app?juegos=worgs&mesa=<id>)
      if (ok && u.searchParams.has('juegos')) {
        const p = u.searchParams.get('juegos'), j = p ? fichaDeEnlace(p) : null, mesa = u.searchParams.get('mesa');
        if (p && !j) return;
        e.preventDefault(); e.stopPropagation();
        if (j && j.mesa && mesa && MESA.test(mesa)) { stack = pilaDe(j); go(j.mesa, mesa); return; }
        stack = []; go('inicio', j ? j.id : undefined); return;
      }
      // Una mesa por el id del juego (/app?truco=<id>, /app?pool=<id>...)
      if (!ok) return;
      for (const j of fichasYa) {
        const id = j.mesa && u.searchParams.get(j.id);
        if (!id || !MESA.test(id)) continue;
        e.preventDefault(); e.stopPropagation();
        stack = pilaDe(j); go(j.mesa, id); return;
      }
    }, true);
    // Lo mismo al entrar al chat por uno de esos enlaces
    const q = new URLSearchParams(location.search);
    if ([...q.keys()].length) setTimeout(() => fichas().then((js) => {
      if (q.has('juegos')) {
        const p = q.get('juegos'), j = p ? fichaDeEnlace(p) : null, mesa = q.get('mesa');
        if (p && !j) return;
        if (j && j.mesa && mesa && MESA.test(mesa)) { stack = pilaDe(j); go(j.mesa, mesa); return; }
        stack = []; go('inicio', j ? j.id : undefined); return;
      }
      for (const j of js) {
        const id = j.mesa && q.get(j.id);
        if (id && MESA.test(id)) { stack = pilaDe(j); go(j.mesa, id); return; }
      }
    }).catch(() => { /* sin fichas: queda el chat */ }), 1500);
    addEventListener('resize', () => { if (page && !mobile()) { const bar = byId('server-bar'); page.style.left = bar ? Math.round(bar.getBoundingClientRect().right) + 'px' : '0'; } else if (page) page.style.left = ''; });
  })();
})();

// "Está escribiendo…" como en Discord (escribiendo.js): los tres puntitos que
// laten, y los nombres en negrita: "Fulano está escribiendo…", "Fulano y Mengano
// están escribiendo…", "A, B y C están escribiendo…", "Varias personas están
// escribiendo…". Junta a los que escriben en la app y en Discord (desde Discord
// dura 10 segundos, como alla); el de cada uno se va cuando llega su mensaje.
// Desde Haven 4.26 Haven lleva la cuenta de quien escribe en cada canal (app-typing.js) y la
// dibuja con _typingRender como texto solo: se dibuja encima con los puntitos, junto con los de
// Discord, abajo del chat y en la ventanita de mensajes directos.
(function () {
  'use strict';
  const typers = new Map(); // clave -> { nombre, hasta }
  let timer = null;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const DOTS = '<span class="puente-escribe-puntos" aria-hidden="true"><i></i><i></i><i></i></span>';
  // Los que escriben segun Haven en ese canal (4.26: app-typing.js)
  const deHaven = (code) => { try { const a = window.app; return code && a && typeof a._typingNames === 'function' ? a._typingNames(code) : []; } catch { return []; } };
  function pintar(box, names) {
    if (!box) return;
    if (!names.length) { box.innerHTML = ''; box.classList.remove('puente-escribe'); return; }
    const b = n => `<b>${esc(n)}</b>`;
    const text = names.length === 1 ? `${b(names[0])} está escribiendo…`
      : names.length === 2 ? `${b(names[0])} y ${b(names[1])} están escribiendo…`
        : names.length === 3 ? `${b(names[0])}, ${b(names[1])} y ${b(names[2])} están escribiendo…`
          : 'Varias personas están escribiendo…';
    box.innerHTML = DOTS + `<span class="puente-escribe-texto">${text}</span>`;
    box.classList.add('puente-escribe');
  }
  function render() {
    const box = document.getElementById('typing-indicator');
    if (!box) return;
    const now = Date.now();
    for (const [k, v] of typers) if (v.hasta <= now) typers.delete(k);
    clearTimeout(timer);
    const app = window.app;
    if (app && app._activeDMPip) { const pip = document.getElementById('dm-pip-typing'); pintar(pip, [...new Set(deHaven(app._activeDMPip))]); }
    const names = [...new Set([...deHaven(app && app.currentChannel), ...[...typers.values()].map(v => v.nombre)])];
    if (!names.length) { box.innerHTML = ''; box.classList.remove('puente-escribe'); return; }
    const b = n => `<b>${esc(n)}</b>`;
    const text = names.length === 1 ? `${b(names[0])} está escribiendo…`
      : names.length === 2 ? `${b(names[0])} y ${b(names[1])} están escribiendo…`
        : names.length === 3 ? `${b(names[0])}, ${b(names[1])} y ${b(names[2])} están escribiendo…`
          : 'Varias personas están escribiendo…';
    box.innerHTML = DOTS + `<span class="puente-escribe-texto">${text}</span>`;
    box.classList.add('puente-escribe');
    if (!typers.size) return; // los de Haven: Haven vuelve a dibujar cuando se vencen
    const next = Math.min(...[...typers.values()].map(v => v.hasta));
    timer = setTimeout(render, Math.max(200, next - now + 50));
  }
  function add(app, username, ms) {
    if (!username) return;
    const u = app._lastOnlineUsers && app._lastOnlineUsers.find(x => x.username === username || x.displayName === username);
    let nombre = username;
    try { if (u && app._getNickname) nombre = app._getNickname(u.id, username) || username; } catch { /* el nombre tal cual */ }
    typers.set(username, { nombre, hasta: Date.now() + ms });
    render();
  }
  function remove(name) {
    let hit = false;
    for (const [k, v] of typers) if (k === name || v.nombre === name) { typers.delete(k); hit = true; }
    if (hit) render();
  }

  let tries = 0;
  (function wait() {
    const app = window.app;
    if (!app || !app.socket || (typeof app._typingRender !== 'function' && typeof app._showTyping !== 'function')) { if (++tries < 120) setTimeout(wait, 500); return; }
    if (typeof app._typingRender === 'function') {
      const dibujar = app._typingRender;
      app._typingRender = function () {
        const r = dibujar.apply(this, arguments);
        try { render(); } catch (err) { console.warn('[puente] escribiendo:', err); }
        return r;
      };
    } else {
      const orig = app._showTyping;
      app._showTyping = function (username) {
        try { add(this, username, 5000); } catch (err) { console.warn('[puente] escribiendo:', err); return orig.apply(this, arguments); }
      };
    }
    app.socket.on('puente-escribiendo', (d) => { if (d && d.channelCode === app.currentChannel) add(app, d.username, d.ms || 10000); });
    app.socket.on('new-message', (d) => { if (d && d.message && d.channelCode === app.currentChannel) remove(d.message.username); });
    if (typeof app.switchChannel === 'function') {
      const sw = app.switchChannel;
      app.switchChannel = function (...a) { typers.clear(); render(); return sw.apply(this, a); };
    }
  })();
})();

// "Activá las notificaciones": casi nadie las tenia prendidas (estan escondidas
// en los ajustes) y sin ellas la gente vuelve a Discord para enterarse. A quien
// tiene la cuenta vinculada y todavia no eligio, un cartel abajo (como los de
// Haven) con "Activar", que usa el mismo alta de Haven. "Ahora no" lo esconde una
// semana. En iPhone/iPad las notificaciones solo andan con la app instalada, asi
// que ahi solo aparece dentro de la app.
(function () {
  'use strict';
  const LATER_KEY = 'puente_notif_luego';
  const LATER_MS = 7 * 24 * 3600 * 1000;
  const storage = (fn) => { try { return fn(); } catch { return null; } };
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) return;
  if (ios && !standalone) return;
  if (!ios && !/Android|Mobile/i.test(navigator.userAgent)) return; // en la PC no hay notificaciones del sistema (puente-sin-avisos-pc)

  // Quien apaga las notificaciones push en Ajustes (el interruptor de Haven) no se vuelve a anotar solo
  const APAGADO_KEY = 'puente_push_apagado';
  document.addEventListener('change', (e) => {
    if (!e.isTrusted || !e.target || e.target.id !== 'push-notif-enabled') return;
    storage(() => (e.target.checked ? localStorage.removeItem(APAGADO_KEY) : localStorage.setItem(APAGADO_KEY, '1')));
  }, true);

  // El permiso ya esta dado (la app de Android lo pide al abrirse, o se dio antes) pero este celular
  // no esta anotado: sin cartel (el permiso no se vuelve a pedir) se anota como lo hace Haven, sin sus
  // carteles de error si falla. Una vez por dia como mucho.
  const REINTENTO_KEY = 'puente_push_intento';
  async function anotarSolo(app) {
    if (storage(() => localStorage.getItem(APAGADO_KEY))) return;
    if (Number(storage(() => localStorage.getItem(REINTENTO_KEY)) || 0) > Date.now()) return;
    try { if (await app._swRegistration.pushManager.getSubscription()) return; } catch { return; }
    if (!app.socket || !app.socket.connected) return;
    storage(() => localStorage.setItem(REINTENTO_KEY, String(Date.now() + 24 * 3600 * 1000)));
    try {
      const r = await fetch('/api/push/vapid-key');
      if (!r.ok) return;
      const { publicKey } = await r.json();
      const b64 = (publicKey + '='.repeat((4 - publicKey.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/');
      const clave = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const sub = await app._swRegistration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: clave });
      const j = sub.toJSON();
      app._pushSubscription = sub;
      app.socket.emit('push-subscribe', { endpoint: j.endpoint, keys: { p256dh: j.keys.p256dh, auth: j.keys.auth }, scope: typeof app._pushScope === 'function' ? app._pushScope() : 'mentions' });
      const tg = document.getElementById('push-notif-enabled'); if (tg) tg.checked = true;
      storage(() => localStorage.removeItem(REINTENTO_KEY));
    } catch (err) { console.warn('[puente] notificaciones: no se pudo anotar este celular', err && err.message); }
  }

  async function check() {
    if (Notification.permission === 'granted') {
      const app = window.app;
      if (app && app._swRegistration) await anotarSolo(app);
      return;
    }
    if (Notification.permission !== 'default') return;
    if (Number(storage(() => localStorage.getItem(LATER_KEY)) || 0) > Date.now()) return;
    const app = window.app;
    if (!app || typeof app._subscribePush !== 'function' || !app._swRegistration) return;
    try { if (await app._swRegistration.pushManager.getSubscription()) return; } catch { /* sigue */ }
    const token = storage(() => localStorage.getItem('haven_token'));
    const st = await fetch('/puente/api/estado', { headers: { Authorization: 'Bearer ' + token } }).then(r => (r.ok ? r.json() : null)).catch(() => null);
    if (!st || !st.vinculado) return; // a los sin vincular primero se les pide eso
    if (document.getElementById('puente-vincular-capa') || document.getElementById('puente-notif')) return;
    show(app);
  }

  function show(app) {
    const box = document.createElement('div');
    box.id = 'puente-notif';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', 'Activar notificaciones');
    const icon = document.createElement('div'); icon.className = 'pn-icono'; icon.textContent = '🔔';
    const txt = document.createElement('div'); txt.className = 'pn-texto';
    const t1 = document.createElement('b'); t1.textContent = 'Activá las notificaciones';
    const t2 = document.createElement('span'); t2.textContent = 'Enterate cuando te mencionan o te responden.';
    txt.append(t1, t2);
    const btns = document.createElement('div'); btns.className = 'pn-botones';
    const yes = document.createElement('button'); yes.type = 'button'; yes.className = 'pn-si'; yes.textContent = 'Activar';
    const no = document.createElement('button'); no.type = 'button'; no.className = 'pn-no'; no.textContent = 'Ahora no';
    btns.append(yes, no);
    box.append(icon, txt, btns);
    document.body.appendChild(box);
    no.addEventListener('click', () => { storage(() => localStorage.setItem(LATER_KEY, String(Date.now() + LATER_MS))); box.remove(); });
    yes.addEventListener('click', async () => {
      // El cartel se va enseguida: el pedido de permiso puede tardar (o no volver nunca, en
      // algunas apps), y no tiene que quedar trabado en la pantalla
      box.remove();
      try { await Promise.race([app._subscribePush(), new Promise(r => setTimeout(r, 60000))]); } catch { /* Haven ya muestra el error */ }
      if (Notification.permission === 'granted' && app._showToast) app._showToast('Listo: te vamos a avisar cuando te mencionen', 'success');
      else if (Notification.permission === 'default') storage(() => localStorage.setItem(LATER_KEY, String(Date.now() + LATER_MS)));
    });
  }

  const style = document.createElement('style');
  style.textContent = `
    #puente-notif { position: fixed; left: 50%; bottom: calc(5.5rem + env(safe-area-inset-bottom, 0px)); transform: translateX(-50%); z-index: 100002;
      width: min(26rem, calc(100vw - 24px)); box-sizing: border-box; display: grid; grid-template-columns: auto 1fr; gap: .25rem .75rem; align-items: center;
      padding: .875rem 1rem; border-radius: .875rem; background: #2b2a30; color: #dbdee1; box-shadow: 0 10px 32px rgba(0,0,0,.5); animation: puente-fade .2s ease-out; }
    #puente-notif .pn-icono { grid-row: span 2; font-size: 1.75rem; }
    #puente-notif .pn-texto { display: flex; flex-direction: column; gap: .125rem; font-size: .875rem; line-height: 1.35; color: #b5bac1; }
    #puente-notif .pn-texto b { color: #f2f3f5; font-size: .9375rem; }
    #puente-notif .pn-botones { display: flex; gap: .5rem; justify-content: flex-end; }
    #puente-notif button { min-height: 2.25rem; padding: 0 1rem; border: 0; border-radius: .5rem; font: inherit; font-size: .875rem; font-weight: 600; cursor: pointer; }
    #puente-notif .pn-si { background: #5865f2; color: #fff; }
    #puente-notif .pn-si:hover { background: #4752c4; }
    #puente-notif .pn-no { background: transparent; color: #b5bac1; }
    #puente-notif .pn-no:hover { color: #f2f3f5; }`;
  document.head.appendChild(style);

  // Un rato despues de entrar (que no sea lo primero que se ve)
  setTimeout(function loop(n) {
    if (window.app && window.app._swRegistration) { check(); return; }
    if ((n || 0) < 30) setTimeout(() => loop((n || 0) + 1), 2000);
  }, 20000);
})();

// Invitaciones (invitaciones.js):
//  - Al entrar con una cuenta nueva que llego por un enlace de invitacion, se
//    anota quien la invito (el enlace lo guardo login.js).
//  - "🤝 Invitar gente" en la tarjeta de perfil propia (y el boton "Invitar usuarios"
//    de la columna derecha): tu enlace para copiar o compartir, y cuantas personas trajiste.
//  - Abajo, "Invitá a alguien de X": se pone su usuario (o el link de su posteo) y se arma la tarjeta con su
//    nombre y su foto (vistas.js, /app?hola=<usuario>&invita=<vos>, que tambien cuenta para tu medalla), para
//    responderle en X o copiar el link.
(function () {
  'use strict';
  const storage = (fn) => { try { return fn(); } catch { return null; } };
  const token = () => storage(() => localStorage.getItem('haven_token'));
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };

  // Anotar quien invito (una sola vez)
  let tries = 0;
  (function claim() {
    const saved = storage(() => JSON.parse(localStorage.getItem('puente_invita') || 'null'));
    if (!saved) return;
    if (!token()) { if (++tries < 60) setTimeout(claim, 5000); return; }
    fetch('/puente/api/invitacion/reclamar', { method: 'POST', headers: { Authorization: 'Bearer ' + token(), 'Content-Type': 'application/json' }, body: JSON.stringify({ u: saved.u }) })
      .then(r => (r.ok ? r.json() : null)).then(d => {
        if (!d) return;
        storage(() => localStorage.removeItem('puente_invita'));
        if (d.ok && window.app && window.app._showToast) window.app._showToast(`¡Bienvenido! Te invitó ${d.nombre}`, 'success');
      }).catch(() => { /* se vuelve a probar la proxima vez */ });
  })();

  // Ventana con el enlace propio
  function close() { document.getElementById('puente-invitar-capa')?.remove(); }
  async function open() {
    close();
    const back = el('div'); back.id = 'puente-invitar-capa';
    const box = el('div', 'pi-tarjeta');
    box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true');
    const x = el('button', 'pi-cerrar', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Cerrar'); x.addEventListener('click', close);
    box.append(x, el('div', 'pi-icono', '🤝'), el('h2', 'pi-titulo', 'Invitá a alguien a __PUENTE_APP__'));
    box.appendChild(el('p', 'pi-texto', 'Mandale tu enlace. Cuando se cree la cuenta y confirme su email, cuenta para tu medalla 🤝 Reclutador (sube con 3, 10 y 25), y los que más traen salen cada semana en #que-paso.'));
    const row = el('div', 'pi-fila');
    const input = el('input', 'pi-enlace'); input.readOnly = true; input.value = 'Cargando…';
    const copy = el('button', 'pi-copiar', 'Copiar'); copy.type = 'button';
    row.append(input, copy);
    box.appendChild(row);
    const share = el('button', 'pi-compartir', 'Compartir'); share.type = 'button';
    if (navigator.share) box.appendChild(share);
    const stats = el('p', 'pi-cuenta', '');
    box.appendChild(stats);
    const conX = seccionX(box);
    back.appendChild(box);
    back.addEventListener('click', (e) => { if (e.target === back) close(); });
    document.body.appendChild(back);
    const d = await fetch('/puente/api/invitacion/mia', { headers: { Authorization: 'Bearer ' + token() } }).then(r => (r.ok ? r.json() : null)).catch(() => null);
    if (!d) { input.value = 'No se pudo cargar. Probá de nuevo.'; return; }
    input.value = d.enlace;
    conX(d.enlace);
    stats.textContent = d.invitados
      ? `Ya trajiste ${d.invitados === 1 ? 'a 1 persona' : `a ${d.invitados} personas`}` + (d.pendientes ? ` (y ${d.pendientes} más que todavía no confirmaron su cuenta).` : '.')
      : d.pendientes ? `${d.pendientes === 1 ? 'Una persona entró' : `${d.pendientes} personas entraron`} con tu enlace y todavía no confirmó su cuenta.` : 'Todavía no trajiste a nadie: ¡estrená tu enlace!';
    const text = `Sumate a __PUENTE_APP__, el chat de la comunidad: ${d.enlace}`;
    copy.addEventListener('click', () => {
      const done = () => { copy.textContent = '¡Copiado!'; setTimeout(() => { copy.textContent = 'Copiar'; }, 1800); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(d.enlace).then(done, () => { input.select(); document.execCommand('copy'); done(); });
      else { input.select(); document.execCommand('copy'); done(); }
    });
    share.addEventListener('click', () => { navigator.share({ title: '__PUENTE_APP__', text }).catch(() => {}); });
  }
  // ── Invitá a alguien de X ──
  // Su usuario (@fulano, fulano) o un link de X (de su perfil o de un posteo suyo: con el del posteo, el boton le
  // responde ahi mismo)
  const NO_SON = new Set(['home', 'i', 'intent', 'search', 'explore', 'notifications', 'messages', 'settings', 'share', 'compose', 'hashtag', 'login', 'signup', 'tos', 'privacy']);
  function deX(t) {
    t = String(t || '').trim();
    let m = /(?:^|\/\/|\b)(?:www\.|mobile\.)?(?:x|twitter)\.com\/@?([A-Za-z0-9_]{1,15})(?:\/status(?:es)?\/(\d{5,25}))?/i.exec(t);
    if (m) return NO_SON.has(m[1].toLowerCase()) ? null : { u: m[1], post: m[2] || null };
    m = /^@?([A-Za-z0-9_]{1,15})$/.exec(t);
    return m ? { u: m[1], post: null } : null;
  }
  const LOGO_X = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M18.24 2.25h3.31l-7.23 8.26 8.5 11.24h-6.66l-5.21-6.82-5.97 6.82H1.67l7.73-8.84L1.25 2.25h6.83l4.71 6.23 5.45-6.23Zm-1.16 17.52h1.83L7.08 4.13H5.12l11.96 15.64Z"/></svg>';
  function seccionX(box) {
    const sec = el('div', 'pi-x');
    const tit = el('h3', 'pi-x-titulo'); tit.innerHTML = LOGO_X; tit.appendChild(document.createTextNode(' Invitá a alguien de X'));
    const ayuda = el('p', 'pi-x-texto', 'Poné su usuario o pegá el link de su posteo: te armamos una tarjeta con su nombre y su foto para responderle.');
    const campo = el('input', 'pi-x-campo'); campo.type = 'text'; campo.placeholder = '@usuario o link del posteo';
    campo.autocomplete = 'off'; campo.autocapitalize = 'off'; campo.spellcheck = false; campo.setAttribute('aria-label', 'Usuario de X o link del posteo');
    const vista = el('div', 'pi-x-vista'); vista.hidden = true;
    const img = el('img'); img.alt = ''; const carga = el('div', 'pi-x-carga', 'Armando la tarjeta…');
    vista.append(img, carga);
    const nota = el('p', 'pi-x-nota', '');
    const botones = el('div', 'pi-x-botones'); botones.hidden = true;
    const resp = el('button', 'pi-x-responder'); resp.type = 'button';
    const copiar = el('button', 'pi-x-copiar', 'Copiar link'); copiar.type = 'button';
    botones.append(resp, copiar);
    sec.append(tit, ayuda, campo, vista, nota, botones);
    box.appendChild(sec);
    let base = null, quien = null, ahora = null, espera = null;
    const enlace = () => `${base}/app?hola=${encodeURIComponent(ahora.u)}` + (quien ? `&invita=${encodeURIComponent(quien)}` : '');
    function mostrar() {
      clearTimeout(espera);
      const x = deX(campo.value);
      if (!campo.value.trim()) { ahora = null; vista.hidden = true; botones.hidden = true; nota.textContent = ''; nota.classList.remove('mal'); return; }
      if (!x) { ahora = null; vista.hidden = true; botones.hidden = true; nota.textContent = 'Ese no parece un usuario de X (letras, números y _, hasta 15).'; nota.classList.add('mal'); return; }
      nota.classList.remove('mal');
      const igual = ahora && ahora.u.toLowerCase() === x.u.toLowerCase();
      ahora = x;
      resp.innerHTML = LOGO_X; resp.appendChild(document.createTextNode(x.post ? ' Responder en X' : ' Mencionarlo en X'));
      nota.textContent = x.post ? `Así lo va a ver @${x.u} en X. El botón le responde a su posteo.` : `Así lo va a ver @${x.u} en X. Para responderle a un posteo suyo, pegá el link del posteo.`;
      botones.hidden = !base;
      vista.hidden = false;
      if (igual) return;
      // (la tarjeta, cuando deja de escribir)
      vista.classList.add('cargando'); img.removeAttribute('src');
      espera = setTimeout(() => { img.src = '/puente/vista/hola.jpg?u=' + encodeURIComponent(x.u); }, 650);
    }
    img.addEventListener('load', () => vista.classList.remove('cargando'));
    img.addEventListener('error', () => { carga.textContent = 'No se pudo armar la tarjeta. Probá de nuevo.'; });
    campo.addEventListener('input', () => { carga.textContent = 'Armando la tarjeta…'; mostrar(); });
    campo.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); campo.blur(); } });
    resp.addEventListener('click', () => {
      if (!ahora || !base) return;
      const texto = ahora.post ? enlace() : `@${ahora.u} ${enlace()}`;
      const url = 'https://x.com/intent/tweet?' + (ahora.post ? 'in_reply_to=' + ahora.post + '&' : '') + 'text=' + encodeURIComponent(texto);
      window.open(url, '_blank', 'noopener');
    });
    copiar.addEventListener('click', () => {
      if (!ahora || !base) return;
      const t = enlace();
      const done = () => { copiar.textContent = '¡Copiado!'; setTimeout(() => { copiar.textContent = 'Copiar link'; }, 1800); };
      const aMano = () => { const i = el('input'); i.value = t; document.body.appendChild(i); i.select(); try { document.execCommand('copy'); } catch { /* nada */ } i.remove(); done(); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(done, aMano); else aMano();
    });
    // cuando llega tu enlace: de ahi salen la direccion del chat y tu usuario (para que cuente para tu medalla)
    return (tuyo) => {
      try { const u = new URL(tuyo, location.origin); base = u.origin; quien = u.searchParams.get('invita'); } catch { base = location.origin; }
      mostrar();
    };
  }
  window.puenteInvitar = open;
  // El boton "Invitar usuarios" de la columna derecha abria la ventana de Haven (enlaces con
  // canales, usos y vencimiento), que mareaba: abre esta. Quien se registra ve todos los canales
  // abiertos igual, con o sin enlace. La de Haven sigue en Ajustes para los administradores.
  document.addEventListener('click', (e) => {
    if (!(e.target instanceof Element) || !e.target.closest('#right-btn-invite-popout')) return;
    e.preventDefault(); e.stopImmediatePropagation();
    open();
  }, true);

  const style = el('style');
  style.textContent = `
    #puente-invitar-capa { position: fixed; inset: 0; z-index: 100012; display: flex; align-items: center; justify-content: center; padding: 16px; background: rgba(0,0,0,.7); animation: puente-fade .18s ease-out; }
    #puente-invitar-capa .pi-tarjeta { position: relative; width: 100%; max-width: 26rem; max-height: 100%; overflow-y: auto; box-sizing: border-box; padding: 1.75rem 1.5rem 1.25rem; border-radius: 1rem; background: #242429; color: #dbdee1; text-align: center; box-shadow: 0 16px 48px rgba(0,0,0,.5); }
    #puente-invitar-capa .pi-cerrar { position: absolute; top: .5rem; right: .75rem; border: 0; background: transparent; color: #b5bac1; font-size: 1.75rem; line-height: 1; cursor: pointer; }
    #puente-invitar-capa .pi-icono { font-size: 2.75rem; }
    #puente-invitar-capa .pi-titulo { margin: .5rem 0; font-size: 1.375rem; font-weight: 800; color: #f2f3f5; }
    #puente-invitar-capa .pi-texto { margin: 0 0 1rem; font-size: .9375rem; line-height: 1.45; color: #b5bac1; }
    #puente-invitar-capa .pi-fila { display: flex; gap: .5rem; }
    #puente-invitar-capa .pi-enlace { flex: 1 1 auto; min-width: 0; height: 2.75rem; padding: 0 .75rem; border: 1px solid #3a3940; border-radius: .5rem; background: #121214; color: #dbdee1; font: inherit; font-size: .875rem; }
    #puente-invitar-capa .pi-copiar, #puente-invitar-capa .pi-compartir { min-height: 2.75rem; padding: 0 1rem; border: 0; border-radius: .5rem; background: #5865f2; color: #fff; font: inherit; font-weight: 700; cursor: pointer; }
    #puente-invitar-capa .pi-copiar:hover, #puente-invitar-capa .pi-compartir:hover { background: #4752c4; }
    #puente-invitar-capa .pi-compartir { width: 100%; margin-top: .5rem; background: #4e5058; }
    #puente-invitar-capa .pi-cuenta { margin: 1rem 0 0; font-size: .9375rem; color: #f2f3f5; font-weight: 600; }
    #puente-invitar-capa .pi-x { margin-top: 1.25rem; padding-top: 1.1rem; border-top: 1px solid #3a3940; text-align: left; }
    #puente-invitar-capa .pi-x-titulo { display: flex; align-items: center; gap: .4rem; margin: 0 0 .35rem; font-size: 1.0625rem; font-weight: 800; color: #f2f3f5; }
    #puente-invitar-capa .pi-x-texto { margin: 0 0 .75rem; font-size: .875rem; line-height: 1.45; color: #b5bac1; }
    #puente-invitar-capa .pi-x-campo { width: 100%; box-sizing: border-box; height: 2.75rem; padding: 0 .75rem; border: 1px solid #3a3940; border-radius: .5rem; background: #121214; color: #f2f3f5; font: inherit; font-size: 1rem; }
    #puente-invitar-capa .pi-x-campo:focus { outline: none; border-color: #ff4f9a; }
    #puente-invitar-capa .pi-x-vista { position: relative; margin-top: .75rem; aspect-ratio: 1200 / 630; border-radius: .75rem; overflow: hidden; background: #121214; border: 1px solid #3a3940; }
    #puente-invitar-capa .pi-x-vista img { display: block; width: 100%; height: 100%; object-fit: cover; }
    #puente-invitar-capa .pi-x-carga { position: absolute; inset: 0; display: none; align-items: center; justify-content: center; color: #b5bac1; font-size: .875rem; }
    #puente-invitar-capa .pi-x-vista.cargando img { visibility: hidden; }
    #puente-invitar-capa .pi-x-vista.cargando .pi-x-carga { display: flex; }
    #puente-invitar-capa .pi-x-nota { margin: .5rem 0 0; font-size: .8125rem; line-height: 1.4; color: #b5bac1; }
    #puente-invitar-capa .pi-x-nota:empty { display: none; }
    #puente-invitar-capa .pi-x-nota.mal { color: #f0b232; }
    #puente-invitar-capa .pi-x-botones { display: flex; gap: .5rem; margin-top: .75rem; }
    #puente-invitar-capa .pi-x-botones[hidden] { display: none; }
    #puente-invitar-capa .pi-x-responder, #puente-invitar-capa .pi-x-copiar { flex: 1 1 0; display: flex; align-items: center; justify-content: center; gap: .35rem; min-height: 2.75rem; padding: 0 .75rem; border: 0; border-radius: 999px; white-space: nowrap; font-size: .9375rem; font: inherit; font-weight: 700; cursor: pointer; }
    #puente-invitar-capa .pi-x-responder { background: #f2f3f5; color: #0f0f10; }
    #puente-invitar-capa .pi-x-responder:hover { background: #fff; }
    #puente-invitar-capa .pi-x-copiar { background: #4e5058; color: #fff; }
    #puente-invitar-capa .pi-x-copiar:hover { background: #6d6f78; }
    .puente-invitar-btn { display: flex; align-items: center; justify-content: center; gap: 6px; margin: 6px 0 2px; padding: 8px 10px; border-radius: 6px; background: #4e5058; color: #fff !important; font-weight: 600; font-size: 14px; text-decoration: none !important; border: 0; width: 100%; cursor: pointer; font-family: inherit; }
    .puente-invitar-btn:hover { background: #6d6f78; }
    .puente-profile-sheet .puente-invitar-btn { order: 1; }`;
  document.head.appendChild(style);
})();

// Perfil como en Discord con Nitro, pero gratis (perfil.js):
//  - Se ve en todos lados: el estilo del nombre (color, degradé y fuente) en los
//    mensajes, la lista de miembros y la tarjeta; el tema (degradé de dos colores)
//    y el banner en la tarjeta de perfil.
//  - "Editar perfil" es uno solo, se abra desde donde se abra (el menu de abajo a
//    la izquierda, la tarjeta, la lista): el de Haven rearmado como el de Discord,
//    con las opciones a la izquierda, la vista previa en vivo al medio y lo que en
//    CV Chat es gratis a la derecha. Usa las mismas piezas de Haven (foto, marco,
//    forma, biografia, cumpleaños, animaciones, grupos) para guardarlas como
//    siempre; el estilo, el tema y el banner los guarda perfil.js.
//  - Las "Personas" de Haven quedan solo para los administradores.
(function () {
  'use strict';
  const storage = (fn) => { try { return fn(); } catch { return null; } };
  const token = () => storage(() => localStorage.getItem('haven_token'));
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const okColor = c => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c);
  const okUrl = b => typeof b === 'string' && /^\/uploads\/puente-banners\/[\w.-]+$/.test(b);
  const FONTS = [
    ['normal', 'Normal', "inherit"],
    ['redondeada', 'Redondeada', "'PuenteRedondeada', sans-serif"],
    ['manuscrita', 'Manuscrita', "'PuenteManuscrita', cursive"],
    ['moderna', 'Moderna', "'PuenteModerna', sans-serif"],
    ['medieval', 'Medieval', "'PuenteMedieval', serif"],
    ['pixel', 'Pixel', "'VT323', monospace"],
    ['terror', 'Terror', "'PuenteTerror', cursive"],
    ['angosta', 'Angosta', "'PuenteAngosta', sans-serif"],
  ];
  const fontCss = k => (FONTS.find(f => f[0] === k) || FONTS[0])[2];
  let map = {};

  // ── Como se ve en todos lados ──
  const style = el('style'); style.id = 'puente-colores';
  document.head.appendChild(style);
  function nameRules(sel, v) {
    const r = [];
    if (v.f && v.f !== 'normal') r.push(`font-family: ${fontCss(v.f)} !important;` + (v.f === 'pixel' ? ' font-size: 1.12em;' : '') + (v.f === 'angosta' ? ' letter-spacing: .02em;' : ''));
    if (okColor(v.c) && okColor(v.c2)) r.push(`background: linear-gradient(90deg, ${v.c}, ${v.c2}) !important; -webkit-background-clip: text !important; background-clip: text !important; color: transparent !important; -webkit-text-fill-color: transparent !important;`);
    else if (okColor(v.c)) r.push(`color: ${v.c} !important;`);
    return r.length ? `${sel} { ${r.join(' ')} }` : '';
  }
  function paintColors() {
    const rules = [];
    for (const [id, v] of Object.entries(map)) {
      if (!/^\d+$/.test(id)) continue;
      rules.push(nameRules(`.message[data-user-id="${id}"] .message-author, .user-item[data-user-id="${id}"] .user-item-name, #profile-popup[data-puente-uid="${id}"] .profile-popup-displayname`, v));
    }
    style.textContent = rules.filter(Boolean).join('\n');
  }
  function paintPopup(popup, id) {
    if (!popup) return;
    popup.dataset.puenteUid = String(id);
    const v = map[id] || {};
    const banner = popup.querySelector('.profile-popup-banner');
    const themed = okColor(v.t1) && okColor(v.t2);
    popup.classList.toggle('puente-tema', themed);
    if (themed) popup.style.setProperty('--pt', `linear-gradient(180deg, ${v.t1}, ${v.t2})`);
    if (banner) {
      if (okUrl(v.b)) { banner.style.background = `#202024 center / cover no-repeat url("${v.b}")`; banner.classList.add('puente-con-banner'); }
      else if (themed) banner.style.background = v.t1;
    }
  }
  async function load() {
    const d = await fetch('/puente/api/perfil/todos', { headers: { Authorization: 'Bearer ' + token() } }).then(r => (r.ok ? r.json() : null)).catch(() => null);
    if (d) { map = d; paintColors(); }
  }

  // ── El editor ──
  const PALETTE = ['#f23f43', '#f47b67', '#f0b232', '#fee75c', '#57f287', '#23a55a', '#1abc9c', '#00a8fc', '#5865f2', '#9b59b6', '#eb459e', '#ff73fa', '#e67e22', '#99aab5', '#ffffff'];
  const THEMES = [['#5865f2', '#eb459e'], ['#1abc9c', '#2c3e50'], ['#f0b232', '#e74c3c'], ['#0b1d3a', '#3a7bd5'], ['#3b0a45', '#ff4f9a'], ['#2d3436', '#636e72'], ['#00a8fc', '#57f287'], ['#7b2ff7', '#f107a3']];
  let st = null, built = false, refs = {};

  function section(title, hint) {
    const s = el('section', 'pep-sec');
    s.appendChild(el('h4', 'pep-titulo', title));
    if (hint) s.appendChild(el('p', 'pep-ayuda', hint));
    return s;
  }
  function relabel(btnId, text) { const b = document.getElementById(btnId); if (b) b.textContent = text; }

  function preview() {
    const app = window.app, me = app && app.user;
    if (!me || !refs.card) return;
    const name = (document.getElementById('rename-input') || {}).value || me.displayName || me.username;
    refs.pName.textContent = name;
    refs.pUser.textContent = '@' + me.username;
    const bio = ((document.getElementById('edit-profile-bio') || {}).value || '').trim();
    refs.pBio.textContent = bio || 'Contá algo de vos en "Sobre mí".';
    refs.pBio.classList.toggle('vacio', !bio);
    // Nombre con su estilo
    refs.pName.removeAttribute('style');
    const v = { c: st.color, c2: st.mode === 'degrade' ? st.color2 : null, f: st.fuente };
    if (st.mode === 'sin') { v.c = null; v.c2 = null; }
    if (v.f && v.f !== 'normal') refs.pName.style.fontFamily = fontCss(v.f).replace(/ !important/, '');
    if (okColor(v.c) && okColor(v.c2)) Object.assign(refs.pName.style, { background: `linear-gradient(90deg, ${v.c}, ${v.c2})`, webkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', webkitTextFillColor: 'transparent' });
    else if (okColor(v.c)) refs.pName.style.color = v.c;
    // Tema y banner
    const themed = okColor(st.tema1) && okColor(st.tema2);
    refs.card.style.background = themed ? `linear-gradient(180deg, ${st.tema1}, ${st.tema2})` : '';
    refs.card.classList.toggle('con-tema', themed);
    refs.pBanner.style.background = okUrl(st.banner) ? `#202024 center / cover no-repeat url("${st.banner}")` : themed ? st.tema1 : '';
    // Foto: la misma que muestra el editor de Haven
    const shape = (document.querySelector('#avatar-shape-picker .avatar-shape-btn.active') || {}).dataset?.shape || 'circle';
    refs.pAvatar.className = 'pep-t-avatar avatar-' + (/^[a-z]+$/.test(shape) ? shape : 'circle');
    const src = avatarSrc();
    refs.pAvatar.textContent = '';
    if (src) { const i = el('img'); i.src = src; i.alt = ''; refs.pAvatar.appendChild(i); }
    else refs.pAvatar.textContent = (name || '?').trim().charAt(0).toUpperCase();
    // Botones elegidos
    refs.fonts.querySelectorAll('button').forEach(b => b.classList.toggle('activo', b.dataset.f === (st.fuente || 'normal')));
    refs.modes.querySelectorAll('button').forEach(b => b.classList.toggle('activo', b.dataset.m === st.mode));
    refs.colorRow.hidden = st.mode === 'sin';
    refs.c2.hidden = st.mode !== 'degrade';
    refs.c1.value = st.color || '#5865f2'; refs.c2.value = st.color2 || '#eb459e';
    refs.t1.value = st.tema1 || '#5865f2'; refs.t2.value = st.tema2 || '#eb459e';
    refs.themeNone.classList.toggle('activo', !themed);
    refs.bannerRm.hidden = !okUrl(st.banner);
    refs.fonts.querySelectorAll('button span').forEach(s => { s.textContent = name; });
  }
  function avatarSrc() {
    const p = document.getElementById('avatar-upload-preview');
    const img = p && p.querySelector('img');
    if (img && img.src) return img.src;
    const bg = p ? getComputedStyle(p).backgroundImage : '';
    const m = /url\("?(.*?)"?\)/.exec(bg || '');
    if (m) return m[1];
    const app = window.app;
    return app && app.user && app.user.avatar ? app.user.avatar : null;
  }

  function build(modal) {
    const box = modal.querySelector('.modal');
    if (!box || built) return;
    built = true;
    const app = window.app;
    const $ = (id) => document.getElementById(id);
    box.classList.add('pep-modal');
    modal.classList.add('pep-overlay');
    const h3 = box.querySelector('h3'); if (h3) h3.textContent = 'Editar perfil';

    const grid = el('div', 'pep-grid');
    const left = el('div', 'pep-opciones'), mid = el('div', 'pep-medio'), right = el('aside', 'pep-beneficios');
    grid.append(left, mid, right);

    // Nombre
    const nameGroup = $('rename-input')?.closest('.form-group');
    box.querySelector('.modal-desc')?.remove();
    let s = section('Nombre para mostrar', 'Cualquier nombre de hasta 32 caracteres.');
    if (nameGroup) { nameGroup.querySelector('label')?.remove(); s.appendChild(nameGroup); }
    left.appendChild(s);

    // Estilo del nombre
    s = section('Estilo del nombre', 'Fuente y color, como el de Nitro.');
    const fonts = el('div', 'pep-fuentes');
    for (const [k, label, css] of FONTS) {
      const b = el('button', 'pep-fuente'); b.type = 'button'; b.dataset.f = k; b.title = label;
      const sample = el('span'); sample.style.fontFamily = css; b.append(sample, el('small', null, label));
      b.addEventListener('click', () => { st.fuente = k === 'normal' ? null : k; preview(); });
      fonts.appendChild(b);
    }
    const modes = el('div', 'pep-modos');
    for (const [m, label] of [['sin', 'Sin color'], ['solido', 'Color'], ['degrade', 'Degradé']]) {
      const b = el('button', null, label); b.type = 'button'; b.dataset.m = m;
      b.addEventListener('click', () => { st.mode = m; if (m !== 'sin' && !st.color) st.color = '#5865f2'; if (m === 'degrade' && !st.color2) st.color2 = '#eb459e'; preview(); });
      modes.appendChild(b);
    }
    const colorRow = el('div', 'pep-colores');
    const c1 = el('input'); c1.type = 'color'; c1.title = 'Color'; c1.addEventListener('input', () => { st.color = c1.value.toLowerCase(); preview(); });
    const c2 = el('input'); c2.type = 'color'; c2.title = 'Segundo color'; c2.addEventListener('input', () => { st.color2 = c2.value.toLowerCase(); preview(); });
    const sw = el('div', 'pep-muestras');
    for (const c of PALETTE) {
      const b = el('button', 'pep-muestra'); b.type = 'button'; b.style.background = c; b.title = c;
      b.addEventListener('click', () => { st.color = c; preview(); });
      sw.appendChild(b);
    }
    colorRow.append(c1, c2, sw);
    s.append(fonts, modes, colorRow);
    left.appendChild(s);

    // Avatar, forma y decoracion
    s = section('Avatar', 'JPG, PNG, WebP o GIF animado.');
    const avatarRow = $('avatar-upload-btn')?.closest('.avatar-upload-row');
    if (avatarRow) {
      const notes = [];
      for (let n = avatarRow.nextElementSibling; n && n.tagName === 'SMALL'; n = n.nextElementSibling) notes.push(n);
      s.appendChild(avatarRow);
      notes.filter(n => n.id === 'avatar-edit-note').forEach(n => s.appendChild(n));
      notes.filter(n => n.id !== 'avatar-edit-note').forEach(n => n.remove());
    }
    const shape = $('avatar-shape-picker');
    if (shape) {
      s.appendChild(el('h5', 'pep-sub', 'Forma')); s.appendChild(shape);
      shape.addEventListener('click', () => setTimeout(preview, 0)); // Haven marca la elegida y despues se ve en la vista previa
    }
    left.appendChild(s);

    s = section('Decoración del avatar', 'Una imagen (PNG con transparencia o GIF) que rodea tu foto.');
    const borderRow = $('border-upload-btn')?.closest('.avatar-upload-row');
    if (borderRow) {
      for (let n = borderRow.nextElementSibling; n && n.tagName === 'SMALL'; n = borderRow.nextElementSibling) n.remove();
      s.appendChild(borderRow);
    }
    left.appendChild(s);

    // Banner
    s = section('Banner del perfil', 'Una imagen o un GIF arriba de tu tarjeta.');
    const brow = el('div', 'pep-fila');
    const file = el('input'); file.type = 'file'; file.accept = 'image/png,image/jpeg,image/webp,image/gif'; file.hidden = true;
    const up = el('button', 'pep-boton', 'Cambiar banner'); up.type = 'button';
    const rm = el('button', 'pep-boton gris', 'Quitar'); rm.type = 'button';
    const note = el('p', 'pep-nota', '');
    const say = (t, bad) => { note.textContent = t; note.classList.toggle('mal', !!bad); };
    up.addEventListener('click', () => file.click());
    file.addEventListener('change', () => {
      const f = file.files && file.files[0];
      file.value = '';
      if (!f) return;
      if (f.size > 6 * 1024 * 1024) { say('La imagen es muy pesada (hasta 6 MB).', true); return; }
      const rd = new FileReader();
      rd.onload = async () => {
        up.disabled = true; say('Subiendo…');
        const r = await fetch('/puente/api/perfil/banner', { method: 'POST', headers: { Authorization: 'Bearer ' + token(), 'Content-Type': 'application/json' }, body: JSON.stringify({ imagen: rd.result }) }).catch(() => null);
        const d = r ? await r.json().catch(() => ({})) : {};
        up.disabled = false;
        if (!r || !r.ok) { say(d.error || 'No se pudo subir. Probá de nuevo.', true); return; }
        st.banner = d.banner; map[app.user.id] = { ...(map[app.user.id] || {}), b: d.banner }; say(''); preview();
      };
      rd.readAsDataURL(f);
    });
    rm.addEventListener('click', async () => {
      const r = await fetch('/puente/api/perfil/banner', { method: 'POST', headers: { Authorization: 'Bearer ' + token(), 'Content-Type': 'application/json' }, body: JSON.stringify({ quitar: true }) }).catch(() => null);
      if (r && r.ok) { st.banner = null; if (map[app.user.id]) delete map[app.user.id].b; preview(); }
    });
    brow.append(up, rm, file);
    s.append(brow, note);
    left.appendChild(s);

    // Tema del perfil
    s = section('Tema del perfil', 'Un degradé de dos colores en toda tu tarjeta.');
    const trow = el('div', 'pep-colores');
    const t1 = el('input'); t1.type = 'color'; t1.title = 'Principal';
    const t2 = el('input'); t2.type = 'color'; t2.title = 'Acento';
    t1.addEventListener('input', () => { st.tema1 = t1.value.toLowerCase(); if (!st.tema2) st.tema2 = t2.value.toLowerCase(); preview(); });
    t2.addEventListener('input', () => { st.tema2 = t2.value.toLowerCase(); if (!st.tema1) st.tema1 = t1.value.toLowerCase(); preview(); });
    const tl = el('div', 'pep-etiquetas'); tl.append(el('span', null, 'Principal'), el('span', null, 'Acento'));
    const presets = el('div', 'pep-muestras');
    const themeNone = el('button', 'pep-sin-tema', 'Sin tema'); themeNone.type = 'button';
    themeNone.addEventListener('click', () => { st.tema1 = null; st.tema2 = null; preview(); });
    presets.appendChild(themeNone);
    for (const [a, b] of THEMES) {
      const bt = el('button', 'pep-muestra'); bt.type = 'button'; bt.style.background = `linear-gradient(180deg, ${a}, ${b})`;
      bt.addEventListener('click', () => { st.tema1 = a; st.tema2 = b; preview(); });
      presets.appendChild(bt);
    }
    trow.append(t1, t2);
    s.append(trow, tl, presets);
    left.appendChild(s);

    // Sobre mi, cumpleaños, animaciones
    const bioGroup = $('edit-profile-bio')?.closest('.form-group');
    if (bioGroup) { s = section('Sobre mí'); bioGroup.querySelector('label')?.remove(); bioGroup.querySelector('.muted-text')?.remove(); s.appendChild(bioGroup); left.appendChild(s); }
    const bday = $('edit-profile-birthday')?.closest('.form-group');
    if (bday) { s = section('Cumpleaños', 'Se elige una sola vez.'); bday.querySelector('label[for="edit-profile-birthday"]')?.remove(); s.appendChild(bday); left.appendChild(s); }
    const anim = $('animate-profile-select');
    if (anim) {
      s = section('Animaciones', 'Cuándo se mueven tu foto y tu decoración si son GIF.');
      const t = $('animate-learn-more-toggle'), b = $('animate-learn-more-body');
      s.appendChild(anim);
      if (t) s.appendChild(t);
      if (b) s.appendChild(b);
      left.appendChild(s);
    }
    // Lo que sobra del editor viejo (titulos sueltos) se va
    box.querySelector('.avatar-settings')?.remove();

    // Mas opciones: grupos (y personas, solo admins)
    const more = el('details', 'pep-mas');
    more.appendChild(el('summary', null, 'Más opciones'));
    const groups = $('rename-modal-groups-section'); if (groups) more.appendChild(groups);
    const personas = box.querySelector('.personas-section');
    if (personas) { if (app && app.user && app.user.isAdmin) more.appendChild(personas); else personas.remove(); }
    left.appendChild(more);

    // Vista previa (al medio)
    const card = el('div', 'pep-tarjeta');
    const pBanner = el('div', 'pep-t-banner');
    const pAvatar = el('div', 'pep-t-avatar');
    const body = el('div', 'pep-t-cuerpo');
    const pName = el('div', 'pep-t-nombre'), pUser = el('div', 'pep-t-usuario');
    const pBioT = el('div', 'pep-t-titulo', 'Sobre mí'), pBio = el('div', 'pep-t-bio');
    body.append(pName, pUser, pBioT, pBio);
    card.append(pBanner, pAvatar, body);
    mid.append(el('div', 'pep-vista-titulo', 'Vista previa'), card);

    // Gratis en CV Chat (a la derecha)
    right.appendChild(el('h4', 'pep-titulo', 'Gratis en __PUENTE_APP__'));
    right.appendChild(el('p', 'pep-ayuda', 'Lo que en Discord se paga con Nitro, acá viene incluido.'));
    const tbl = el('div', 'pep-tabla');
    const row = (cells, head) => { const r = el('div', 'pep-tfila' + (head ? ' cabeza' : '')); cells.forEach((c, i) => r.appendChild(el('span', i ? 'pep-tcel' : 'pep-tnom', c))); tbl.appendChild(r); };
    row(['', 'Discord', 'Nitro', '__PUENTE_APP__'], true);
    for (const r of [
      ['Banner del perfil', '✕', '✓', '✓'], ['Tema del perfil', '✕', '✓', '✓'], ['Estilo del nombre', '✕', '✓', '✓'],
      ['Avatar animado (GIF)', '✕', '✓', '✓'], ['Decoración propia', '✕', '✕', '✓'], ['Archivos', '10 MB', '500 MB', '25 MB'],
      ['Emojis en todos lados', '✕', '✓', '✓'], ['Tu historia y medallas', '✕', '✕', '✓'],
    ]) row(r);
    right.appendChild(tbl);
    right.appendChild(el('p', 'pep-precio', 'Nitro cuesta unos US$ 10 por mes. Acá, nada.'));

    const actions = box.querySelector('.modal-actions');
    box.insertBefore(grid, actions);
    refs = { card, pBanner, pAvatar, pName, pUser, pBio, fonts, modes, colorRow, c1, c2, t1, t2, themeNone, bannerRm: rm };

    // Vista previa en vivo
    for (const id of ['rename-input', 'edit-profile-bio']) $(id)?.addEventListener('input', preview);
    const ap = $('avatar-upload-preview');
    if (ap) new MutationObserver(preview).observe(ap, { attributes: true, childList: true, subtree: true });

    // Guardar: el estilo y el tema van a perfil.js; lo demas lo guarda Haven
    $('save-rename-btn')?.addEventListener('click', () => saveStyle(), true);
  }

  async function saveStyle() {
    if (!st) return;
    const app = window.app;
    const body = {
      color: st.mode === 'sin' ? null : st.color, color2: st.mode === 'degrade' ? st.color2 : null,
      fuente: st.fuente || null, tema1: st.tema1 || null, tema2: st.tema2 || null,
    };
    const cur = map[app.user.id] || {};
    if (body.color === (cur.c || null) && body.color2 === (cur.c2 || null) && body.fuente === (cur.f || null) && body.tema1 === (cur.t1 || null) && body.tema2 === (cur.t2 || null)) return;
    const r = await fetch('/puente/api/perfil/estilo', { method: 'POST', headers: { Authorization: 'Bearer ' + token(), 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    if (!r || !r.ok) { if (app._showToast) app._showToast(d.error || 'No se pudo guardar el estilo', 'error'); return; }
    map[app.user.id] = d.perfil || {};
    paintColors();
  }

  // Haven les vuelve a poner su texto al abrir: los nombres de los botones van cada vez
  function labels() {
    for (const [id, t] of [['avatar-upload-btn', 'Cambiar avatar'], ['avatar-crop-btn', 'Recortar'], ['avatar-remove-btn', 'Quitar'], ['border-upload-btn', 'Subir decoración'], ['border-crop-btn', 'Ajustar'], ['border-remove-btn', 'Quitar'], ['cancel-rename-btn', 'Cancelar'], ['save-rename-btn', 'Guardar cambios']]) relabel(id, t);
    const h = document.querySelector('#rename-modal .pep-modal > h3'); if (h) h.textContent = 'Editar perfil';
  }
  function openEditor(app) {
    const modal = document.getElementById('rename-modal');
    if (!modal) return;
    build(modal);
    labels();
    setTimeout(labels, 0);
    const v = map[app.user.id] || {};
    st = { color: v.c || null, color2: v.c2 || null, mode: v.c && v.c2 ? 'degrade' : v.c ? 'solido' : 'sin', fuente: v.f || null, tema1: v.t1 || null, tema2: v.t2 || null, banner: v.b || null };
    preview();
    const box = modal.querySelector('.pep-opciones'); if (box) box.scrollTop = 0;
  }
  window.puentePerfil = { open: () => { const app = window.app; if (app && app._openRenameModal) app._openRenameModal(); }, paintPopup };

  const css = el('style');
  css.textContent = `
    @font-face { font-family: 'PuenteRedondeada'; src: url('/puente/fuentes/fredoka.woff2') format('woff2'); font-display: swap; }
    @font-face { font-family: 'PuenteManuscrita'; src: url('/puente/fuentes/pacifico.woff2') format('woff2'); font-display: swap; }
    @font-face { font-family: 'PuenteModerna'; src: url('/puente/fuentes/orbitron.woff2') format('woff2'); font-display: swap; }
    @font-face { font-family: 'PuenteMedieval'; src: url('/puente/fuentes/medievalsharp.woff2') format('woff2'); font-display: swap; }
    @font-face { font-family: 'PuenteTerror'; src: url('/puente/fuentes/creepster.woff2') format('woff2'); font-display: swap; }
    @font-face { font-family: 'PuenteAngosta'; src: url('/puente/fuentes/bebas-neue.woff2') format('woff2'); font-display: swap; }
    html body #profile-popup.puente-tema.puente-tema { background: var(--pt) !important; border-color: transparent !important; }
    html body #profile-popup.puente-tema.puente-tema .profile-popup-body { background: rgba(17, 18, 20, .55); margin: 0 .5rem .5rem; border-radius: .5rem; }
    html body #profile-popup.puente-tema.puente-tema .profile-popup-avatar { border-color: transparent !important; }
    html body #profile-popup.puente-tema.puente-tema .profile-popup-status-dot { border-color: transparent !important; }

    #rename-modal.pep-overlay { align-items: center; justify-content: center; backdrop-filter: none !important; -webkit-backdrop-filter: none !important; background: rgba(0, 0, 0, .78) !important; }
    #rename-modal .pep-modal { contain: layout paint; }
    #rename-modal .pep-opciones, #rename-modal .pep-beneficios, #rename-modal .pep-medio { overscroll-behavior: contain; }
    #rename-modal .pep-modal { position: relative; width: min(72rem, calc(100vw - 32px)); max-width: none; height: min(52rem, calc(100vh - 32px)); max-height: none; display: flex; flex-direction: column; padding: 0; overflow: hidden; background: #1a1a1e; border: 1px solid #2a2a30; border-radius: 1rem; }
    #rename-modal .pep-modal > h3 { margin: 0; padding: 1.125rem 1.5rem; font-size: 1.25rem; border-bottom: 1px solid #26262b; }
    #rename-modal .pep-cerrar { position: absolute; top: .75rem; right: 1rem; z-index: 2; width: 2.25rem; height: 2.25rem; border: 0; border-radius: 50%; background: #2b2a30; color: #dbdee1; font-size: 1.5rem; line-height: 1; cursor: pointer; }
    #rename-modal .pep-cerrar:hover { background: #3a3940; color: #fff; }
    #rename-modal .pep-grid { flex: 1 1 auto; min-height: 0; display: grid; grid-template-columns: minmax(18rem, 1fr) minmax(19rem, 22rem) minmax(18rem, 21rem); }
    #rename-modal .pep-opciones { overflow-y: auto; padding: .5rem 1.5rem 1.5rem; border-right: 1px solid #26262b; scrollbar-width: thin; }
    #rename-modal .pep-medio { overflow-y: auto; padding: 1.5rem; background: #141417; display: flex; flex-direction: column; align-items: center; }
    #rename-modal .pep-beneficios { overflow-y: auto; padding: 1.25rem; border-left: 1px solid #26262b; }
    #rename-modal .pep-sec { padding: 1rem 0; border-bottom: 1px solid #26262b; }
    #rename-modal .pep-titulo { margin: 0 0 .25rem; font-size: .75rem; font-weight: 700; text-transform: uppercase; letter-spacing: .02em; color: #b5bac1; }
    #rename-modal .pep-ayuda { margin: 0 0 .625rem; font-size: .8125rem; color: #80848e; }
    #rename-modal .pep-sub { margin: .75rem 0 .375rem; font-size: .75rem; color: #b5bac1; font-weight: 600; }
    #rename-modal .pep-sec .form-group { margin: 0 !important; }
    #rename-modal .pep-sec input[type="text"], #rename-modal .pep-sec textarea, #rename-modal .pep-sec input[type="date"], #rename-modal .pep-sec select { width: 100%; box-sizing: border-box; background: #121214; border: 1px solid #2e2d32; border-radius: .5rem; color: #dbdee1; padding: .625rem .75rem; font: inherit; }
    #rename-modal .pep-fuentes { display: grid; grid-template-columns: repeat(4, 1fr); gap: .375rem; margin-bottom: .625rem; }
    #rename-modal .pep-fuente { display: flex; flex-direction: column; align-items: center; gap: .125rem; min-width: 0; padding: .5rem .25rem; border: 2px solid transparent; border-radius: .5rem; background: #232228; color: #f2f3f5; cursor: pointer; }
    #rename-modal .pep-fuente span { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 1rem; }
    #rename-modal .pep-fuente small { font-size: .6875rem; color: #949ba4; }
    #rename-modal .pep-fuente.activo, #rename-modal .pep-modos button.activo, #rename-modal .pep-sin-tema.activo { border-color: #5865f2; background: #2c2d4a; }
    #rename-modal .pep-modos { display: flex; gap: .375rem; margin-bottom: .625rem; }
    #rename-modal .pep-modos button, #rename-modal .pep-sin-tema { flex: 1 1 0; min-height: 2.25rem; border: 2px solid transparent; border-radius: .5rem; background: #232228; color: #dbdee1; font: inherit; font-size: .875rem; cursor: pointer; }
    #rename-modal .pep-sin-tema { flex: 0 0 auto; padding: 0 .75rem; }
    #rename-modal .pep-colores { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem; }
    #rename-modal .pep-colores[hidden] { display: none; }
    #rename-modal .pep-colores input[type="color"] { width: 3rem; height: 2.25rem; padding: 0; border: 1px solid #2e2d32; border-radius: .5rem; background: none; cursor: pointer; }
    #rename-modal .pep-colores input[hidden] { display: none; }
    #rename-modal .pep-muestras { display: flex; flex-wrap: wrap; gap: .375rem; margin-top: .5rem; width: 100%; }
    #rename-modal .pep-muestra { width: 1.75rem; height: 1.75rem; padding: 0; border: 2px solid #1a1a1e; border-radius: 50%; cursor: pointer; box-shadow: 0 0 0 1px #3a3940; }
    #rename-modal .pep-etiquetas { display: flex; gap: .5rem; margin-top: .25rem; font-size: .6875rem; color: #949ba4; }
    #rename-modal .pep-etiquetas span { width: 3rem; text-align: center; }
    #rename-modal .pep-fila { display: flex; gap: .5rem; flex-wrap: wrap; }
    #rename-modal .pep-boton, #rename-modal .avatar-upload-row .btn-sm { min-height: 2.25rem; padding: 0 .875rem; border: 0; border-radius: .5rem; background: #5865f2; color: #fff; font: inherit; font-size: .875rem; font-weight: 600; cursor: pointer; }
    #rename-modal .pep-boton.gris, #rename-modal .avatar-upload-row .btn-sm:not(:first-of-type) { background: #3a3940; }
    #rename-modal .pep-boton[hidden] { display: none; }
    #rename-modal .pep-nota { min-height: 1em; margin: .375rem 0 0; font-size: .8125rem; color: #7fd6a2; }
    #rename-modal .pep-nota.mal { color: #f0c36a; }
    #rename-modal .avatar-upload-row { display: flex; align-items: center; gap: .5rem; flex-wrap: wrap; }
    #rename-modal .pep-mas { margin-top: 1rem; }
    #rename-modal .pep-mas summary { cursor: pointer; font-size: .875rem; font-weight: 600; color: #b5bac1; padding: .5rem 0; }
    #rename-modal .pep-vista-titulo { align-self: stretch; font-size: .75rem; font-weight: 700; text-transform: uppercase; color: #b5bac1; margin-bottom: .75rem; }
    #rename-modal .pep-tarjeta { width: 100%; max-width: 21rem; border-radius: .875rem; overflow: hidden; background: #232428; box-shadow: 0 8px 24px rgba(0,0,0,.35); position: relative; }
    #rename-modal .pep-t-banner { height: 7.5rem; background: #5865f2; }
    #rename-modal .pep-t-avatar { position: absolute; top: 4.5rem; left: 1rem; width: 5.5rem; height: 5.5rem; border-radius: 50%; border: .375rem solid #232428; background: #5865f2; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 2rem; font-weight: 800; overflow: hidden; }
    #rename-modal .pep-tarjeta.con-tema .pep-t-avatar { border-color: transparent; }
    #rename-modal .pep-t-avatar img { width: 100%; height: 100%; object-fit: cover; }
    #rename-modal .pep-t-cuerpo { margin: 3.25rem .5rem .5rem; padding: .875rem 1rem 1rem; border-radius: .625rem; background: rgba(17,18,20,.55); }
    #rename-modal .pep-t-nombre { font-size: 1.375rem; font-weight: 800; color: #f2f3f5; overflow-wrap: anywhere; display: inline-block; }
    #rename-modal .pep-t-usuario { font-size: .875rem; color: #b5bac1; margin-bottom: .75rem; }
    #rename-modal .pep-t-titulo { font-size: .75rem; font-weight: 700; color: #dbdee1; margin-bottom: .25rem; }
    #rename-modal .pep-t-bio { font-size: .875rem; color: #dbdee1; white-space: pre-wrap; overflow-wrap: anywhere; }
    #rename-modal .pep-t-bio.vacio { color: #80848e; font-style: italic; }
    #rename-modal .pep-tabla { display: flex; flex-direction: column; border-radius: .625rem; overflow: hidden; border: 1px solid #2a2a30; margin-top: .5rem; }
    #rename-modal .pep-tfila { display: grid; grid-template-columns: minmax(0, 1fr) 2.75rem 2.75rem 3.5rem; align-items: center; gap: .25rem; padding: .5rem .625rem; font-size: .8125rem; border-top: 1px solid #26262b; }
    #rename-modal .pep-tfila.cabeza { border-top: 0; background: #232228; font-weight: 700; color: #b5bac1; font-size: .6875rem; text-transform: uppercase; }
    #rename-modal .pep-tcel { text-align: center; color: #949ba4; }
    #rename-modal .pep-tfila:not(.cabeza) .pep-tcel:last-child { color: #57f287; font-weight: 700; }
    #rename-modal .pep-tfila.cabeza .pep-tcel:last-child { color: #c9cdfb; }
    #rename-modal .pep-precio { margin: .875rem 0 0; font-size: .8125rem; color: #b5bac1; }
    #rename-modal .pep-modal > .modal-actions { flex: 0 0 auto; margin: 0; padding: .875rem 1.5rem; border-top: 1px solid #26262b; background: #1a1a1e; display: flex; gap: .5rem; align-items: center; }
    #rename-modal .pep-modal > .modal-actions .btn-sm { min-height: 2.5rem; padding: 0 1.25rem; border-radius: .5rem; font-weight: 600; }
    @media (max-width: 1100px) { #rename-modal .pep-grid { grid-template-columns: 1fr minmax(18rem, 21rem); } #rename-modal .pep-beneficios { grid-column: 1 / -1; border-left: 0; border-top: 1px solid #26262b; } }
    @media (max-width: 768px) {
      #rename-modal .pep-modal { width: 100vw; height: 100%; border-radius: 0; border: 0; }
      #rename-modal .pep-grid { display: flex; flex-direction: column; overflow-y: auto; }
      #rename-modal .pep-medio { order: -1; flex: 0 0 auto; padding: 1rem; overflow: visible; }
      #rename-modal .pep-opciones { overflow: visible; border-right: 0; padding: 0 1rem 1rem; }
      #rename-modal .pep-beneficios { overflow: visible; border-left: 0; border-top: 1px solid #26262b; padding: 1rem; }
      #rename-modal .pep-fuentes { grid-template-columns: repeat(4, 1fr); }
      #rename-modal .pep-modal > .modal-actions { padding-bottom: calc(.875rem + env(safe-area-inset-bottom, 0px)); }
    }`;
  document.head.appendChild(css);

  let tries = 0;
  (function wait() {
    const app = window.app;
    if (!app || !app.socket || !token() || typeof app._openRenameModal !== 'function') { if (++tries < 120) setTimeout(wait, 500); return; }
    load();
    setInterval(load, 10 * 60 * 1000);
    app.socket.on('puente-perfil', (d) => {
      if (!d || !Number.isInteger(d.id)) return;
      const v = {};
      for (const k of ['c', 'c2', 't1', 't2']) if (okColor(d[k])) v[k] = d[k];
      if (typeof d.f === 'string') v.f = d.f;
      if (okUrl(d.b)) v.b = d.b;
      if (Object.keys(v).length) map[d.id] = v; else delete map[d.id];
      paintColors();
    });
    // Un solo "Editar perfil", se abra desde donde se abra
    const open = app._openRenameModal;
    app._openRenameModal = function (...a) {
      const r = open.apply(this, a);
      try { openEditor(this); } catch (err) { console.warn('[puente] editor de perfil:', err); }
      return r;
    };
  })();
})();

// Boton "atras" del celular, como en la app de Discord para Android:
//  1. si hay algo abierto encima (menu de un mensaje, perfil, emojis/GIFs, una
//     imagen, una ventana, el panel de miembros...), lo cierra;
//  2. si estas en un hilo, vuelve al canal;
//  3. si estas en un chat, abre la lista de canales;
//  4. y recien desde la lista de canales, sale de la app.
// En la app instalada (y en el navegador) el boton atras es el historial: se
// deja una entrada "de mas" mientras haya algo que deshacer y se la usa al
// apretar atras. Con la app nativa de Haven (Capacitor) se engancha su manejo.
(function () {
  'use strict';
  const mobile = () => matchMedia('(max-width: 768px)').matches;
  const shown = (el) => !!(el && el.isConnected && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden' && el.getClientRects().length);
  const byId = (id) => document.getElementById(id);
  const body = () => byId('app-body');
  const drawerOpen = () => !!(body() && body().classList.contains('mobile-sidebar-open'));
  const rightOpen = () => !!(body() && body().classList.contains('mobile-right-open'));
  // Al cerrar del todo el foro, Juegos o el Marketplace (se abren desde el panel de canales): de vuelta ahi
  const alCanales = () => { if (mobile() && !drawerOpen()) byId('mobile-menu-btn')?.click(); };

  // Lo que se puede cerrar, de lo mas "arriba" a lo mas "abajo": [esta abierto, cerrarlo]
  const LAYERS = [
    [() => byId('puente-medalla-globo'), () => byId('puente-medalla-globo').remove()],
    [() => document.querySelector('.puente-hoja-fondo'), () => window.puenteClub && window.puenteClub.cerrar()], // la Guia, El club hoy
    [() => byId('puente-who-sheet'), () => { byId('puente-who-sheet')?.remove(); byId('puente-who-backdrop')?.remove(); }], // quien reacciono
    [() => shown(byId('image-lightbox')), (app) => app._closeLightbox ? app._closeLightbox() : (byId('image-lightbox').style.display = 'none')],
    [() => byId('puente-tema-hoja'), () => { byId('puente-tema-hoja')?.remove(); byId('puente-tema-fondo')?.remove(); }],
    [() => byId('puente-perfil-capa'), () => byId('puente-perfil-capa').remove()],
    [() => byId('puente-invitar-capa'), () => byId('puente-invitar-capa').remove()],
    [() => byId('puente-historia-capa'), () => byId('puente-historia-capa').remove()],
    [() => byId('puente-vincular-capa'), () => byId('puente-vincular-capa').querySelector('.pv-luego')?.click()],
    [() => window.puenteAdjuntar && window.puenteAdjuntar.abierto(), () => window.puenteAdjuntar.cerrar()],
    [() => window.puenteJuegos && window.puenteJuegos.abierto() && !shown(byId('profile-popup')), () => { window.puenteJuegos.atras(); if (!window.puenteJuegos.abierto()) alCanales(); }],
    [() => window.puenteMercado && window.puenteMercado.abierto() && !shown(byId('profile-popup')) && !shown(byId('image-lightbox')), () => { window.puenteMercado.atras(); if (!window.puenteMercado.abierto()) alCanales(); }],
    [() => window.puenteForo && window.puenteForo.abierto() && !shown(byId('profile-popup')), () => { window.puenteForo.cerrar(); alCanales(); }],
    [() => window.puenteLupa && window.puenteLupa.abierta() && !shown(byId('profile-popup')), () => window.puenteLupa.cerrar()],
    [() => shown(byId('message-context-menu')), (app) => app._hideMessageContextMenu && app._hideMessageContextMenu()],
    [() => shown(byId('user-context-menu')), (app) => app._hideUserContextMenu && app._hideUserContextMenu()],
    [() => shown(byId('profile-popup')), (app) => app._closeProfilePopup && app._closeProfilePopup()],
    // (las hojas de GIFs y de emojis del celular: se reconocen tambien por su fondo oscuro, y si Haven no las
    // cierra del todo, se esconden igual; si no, atras abria los canales y la hoja quedaba encima)
    [() => shown(byId('gif-picker')) || !!byId('puente-gif-backdrop'), (app) => {
      const g = byId('gif-picker');
      if (shown(g)) { if (app._closeGifPicker) app._closeGifPicker(); else g.style.display = 'none'; }
      if (shown(g)) g.style.display = 'none';
      byId('puente-gif-backdrop')?.remove();
    }],
    [() => shown(byId('emoji-picker')) || !!byId('puente-emoji-backdrop'), (app) => {
      const p = byId('emoji-picker');
      if (shown(p) && app._toggleEmojiPicker) app._toggleEmojiPicker();
      if (shown(p)) p.style.display = 'none';
      byId('puente-emoji-backdrop')?.remove();
    }],
    [() => window.puenteAjustes && window.puenteAjustes.enDetalle(), () => window.puenteAjustes.volver()], // configuracion: de una categoria a la lista
    [() => [...document.querySelectorAll('.modal-overlay')].find(shown), () => { const m = [...document.querySelectorAll('.modal-overlay')].find(shown); if (m) m.style.display = 'none'; }],
    [() => shown(byId('search-panel')), () => { byId('search-panel').style.display = 'none'; }],
    [() => byId('puente-miembros'), () => byId('puente-miembros').querySelector('.pm-cerrar')?.click()],
    [() => rightOpen(), (app) => app._closeMobilePanels && app._closeMobilePanels()],
    [() => shown(byId('thread-panel')) && !drawerOpen(), (app) => app._closeThread && app._closeThread()],
  ];
  // La pagina "Miembros" del celular maneja su propio atras (aviso.js, mas arriba)
  const membersPage = () => !!byId('puente-miembros');

  function topLayer() { for (const l of LAYERS) { try { if (l[0]()) return l; } catch { /* sigue */ } } return null; }

  // Un paso de "atras". Devuelve true si hizo algo (y la app no se tiene que cerrar).
  function step(app) {
    const l = topLayer();
    if (l) { try { l[1](app); } catch (err) { console.warn('[puente] atras:', err); } return true; }
    if (!drawerOpen()) { const b = byId('mobile-menu-btn'); if (b) { b.click(); return true; } }
    return false; // en la lista de canales: salir
  }

  // Hay algo que deshacer con atras (en la lista de canales, sin nada abierto, atras sale)
  const shouldArm = () => mobile() && (!!topLayer() || !drawerOpen());
  const onBack = () => { const app = window.app; if (app && mobile()) step(app); setTimeout(arm, 0); };

  // ── Android (Chrome y la app instalada): CloseWatcher ──
  // Es la forma de Chrome para el boton atras. Con el historial no alcanza: Chrome
  // saltea las entradas que una pagina agrega sin que la persona haya tocado nada,
  // asi que al abrir la app (con un chat ya abierto) atras la cerraba de una.
  // Un CloseWatcher si recibe ese primer atras; los siguientes se arman con cada
  // toque, como pide Chrome.
  const hasWatcher = typeof window.CloseWatcher === 'function';
  let watcher = null;
  function armWatcher() {
    if (!shouldArm()) { if (watcher) { const w = watcher; watcher = null; w.onclose = null; try { w.destroy(); } catch { /* ya no estaba */ } } return; }
    if (watcher) return;
    try {
      const w = new CloseWatcher();
      w.onclose = () => { if (watcher === w) watcher = null; onBack(); };
      watcher = w;
    } catch { /* sin permiso para otro todavia: se arma con el proximo toque */ }
  }

  // ── Otros navegadores (y Safari con el gesto de volver): el historial ──
  let armed = false;
  function armHistory() {
    if (armed || !shouldArm() || membersPage()) return;
    // Sin un toque antes, Chrome ignora la entrada: se espera al primero
    if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
    try { history.pushState({ puenteAtras: 1 }, ''); armed = true; } catch { /* sin historial */ }
  }
  if (!hasWatcher) {
    addEventListener('popstate', (e) => {
      if (e.state && e.state.puenteAtras) return; // se cerro algo de mas arriba (p. ej. "Miembros"): seguimos armados
      if (!armed) return;
      armed = false;
      onBack();
    });
  }
  const arm = () => (hasWatcher ? armWatcher() : armHistory());

  let tries = 0;
  (function wait() {
    const app = window.app;
    if (!app || !body() || typeof app.switchChannel !== 'function') { if (++tries < 120) setTimeout(wait, 500); return; }
    // App nativa de Haven: su atras pasa por aca (sin historial)
    if (typeof app._handleMobileBack === 'function') {
      const native = app._handleMobileBack;
      app._handleMobileBack = function (...a) {
        if (step(this)) return;
        return native.apply(this, a); // nada que hacer: que la app se cierre
      };
    }
    // Armar cada vez que cambia algo (se abre o cierra un panel, una hoja, una ventana)
    let pending = false;
    const later = () => { if (pending) return; pending = true; requestAnimationFrame(() => { pending = false; arm(); }); };
    new MutationObserver(later).observe(body(), { attributes: true, attributeFilter: ['class'] });
    new MutationObserver(later).observe(document.body, { childList: true, subtree: false, attributes: true, attributeFilter: ['style', 'class'] });
    // (lo que abre un toque puede tardar en aparecer: se vuelve a mirar, mientras dure el permiso del toque)
    const despues = () => { setTimeout(arm, 50); setTimeout(arm, 400); setTimeout(arm, 1500); };
    document.addEventListener('click', despues, true);
    document.addEventListener('pointerdown', despues, true);
    arm();
  })();
})();

// Celular: en un hilo, deslizar hacia la derecha vuelve al canal (como en la app
// de Discord para iPhone, donde no hay boton atras). El hilo sigue al dedo; al
// soltar se cierra si se deslizo bastante o rapido, y si no vuelve a su lugar.
(function () {
  'use strict';
  const SKIP = 'input, textarea, select, [contenteditable="true"], video, audio, pre, table, .gif-picker, .emoji-picker, [role="slider"]';
  const LOCK_PX = 10, CLOSE_PX = 90, FLICK = 0.45;
  let g = null;
  const panel = () => document.getElementById('thread-panel');
  const sideways = (el) => { for (let n = el; n && n !== document.body; n = n.parentElement) { if (n.scrollWidth > n.clientWidth + 2) { const o = getComputedStyle(n).overflowX; if (o === 'auto' || o === 'scroll') return true; } } return false; };

  document.addEventListener('touchstart', (e) => {
    g = null;
    const p = panel();
    if (e.touches.length !== 1 || window.innerWidth > 768 || !p || getComputedStyle(p).display === 'none') return;
    const t = e.target instanceof Element ? e.target : null;
    if (!t || !p.contains(t) || t.closest(SKIP) || sideways(t)) return;
    g = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now(), locked: false, dx: 0 };
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    if (!g) return;
    const dx = e.touches[0].clientX - g.x, dy = e.touches[0].clientY - g.y;
    if (!g.locked) {
      if (Math.abs(dx) < LOCK_PX && Math.abs(dy) < LOCK_PX) return;
      if (Math.abs(dy) > Math.abs(dx) || dx < 0) { g = null; return; } // vertical o hacia la izquierda: no es esto
      g.locked = true;
      panel().style.transition = 'none';
    }
    g.dx = Math.max(0, dx);
    panel().style.transform = `translateX(${g.dx}px)`;
    if (e.cancelable) e.preventDefault();
  }, { passive: false });

  document.addEventListener('touchend', () => {
    if (!g || !g.locked) { g = null; return; }
    const p = panel(), speed = g.dx / Math.max(1, Date.now() - g.t);
    const close = g.dx > CLOSE_PX || speed > FLICK;
    g = null;
    p.style.transition = 'transform .18s ease-out';
    if (close) {
      p.style.transform = 'translateX(100%)';
      setTimeout(() => {
        try { window.app && window.app._closeThread && window.app._closeThread(); } catch { /* nada */ }
        p.style.transition = ''; p.style.transform = '';
      }, 180);
    } else {
      p.style.transform = '';
      setTimeout(() => { p.style.transition = ''; }, 200);
    }
  }, { passive: true });
})();

// Configuracion como la de Discord: a la izquierda las categorias (Ajustes de
// usuario y, para quien administra, Administracion) y a la derecha solo la
// elegida, con su titulo. En el celular, primero la lista de categorias y al
// tocar una su pantalla, con flecha (y el boton atras) para volver.
// Son las mismas secciones de Haven (se guardan como siempre); las que no se
// usan en CV Chat o chocan con su diseño no se muestran.
(function () {
  'use strict';
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const mobile = () => matchMedia('(max-width: 768px)').matches;
  const USER = [
    { id: 'cuenta', icon: '👤', name: 'Mi cuenta', extra: 'vinculos', ids: ['section-password', 'section-2fa', 'section-sessions', 'section-recovery', 'section-delete-account'] },
    { id: 'perfil', icon: '✨', name: 'Perfil', extra: 'perfil', ids: [] },
    { id: 'notif', icon: '🔔', name: 'Notificaciones', ids: ['section-push', 'section-sounds'] },
    { id: 'idioma', icon: '🌐', name: 'Idioma y hora', ids: ['section-language'] },
    { id: 'acces', icon: '♿', name: 'Accesibilidad y chat', ids: ['section-zoom', 'section-chat-behavior'] },
  ];
  const ADMIN = [
    { id: 'servidor', icon: '🏠', name: 'Servidor', ids: ['section-branding', 'section-presence', 'section-custom-tos'] },
    { id: 'personas', icon: '🛡️', name: 'Miembros y moderación', ids: ['section-members', 'section-roles', 'section-moderation', 'section-security', 'section-automod'] },
    { id: 'contenido', icon: '😀', name: 'Emojis, stickers y archivos', ids: ['section-emojis', 'section-stickers', 'section-uploads'] },
    { id: 'manten', icon: '🧰', name: 'Mantenimiento', ids: ['section-backup', 'section-audit-log'] },
  ];
  // Lo que no se usa en CV Chat (o choca con su diseño): no se muestra
  const REMOVED = ['section-layout', 'section-reaction-size', 'section-role-display', 'section-toolbar-icons', 'section-image-display', 'section-embed-size',
    'section-banner-display', 'section-toggle-style', 'section-statusbar', 'section-soundboard-mode', 'section-activity', 'section-score-badges', 'section-plugins',
    'section-debug', 'section-desktop-shortcuts', 'section-desktop-app',
    // La frase de cifrado de Haven: el cifrado de los privados ya es automatico (cifrado.js) y casi
    // nadie entendia para que era. Si alguien ya tenia una, Haven se la sigue pidiendo en su ventana
    'section-e2e-passphrase',
    'section-ferry', 'section-import', 'section-tunnel', 'section-guests', 'section-whitelist', 'section-template', 'section-extension-updates',
    'section-large-server', 'section-sounds-admin', 'section-bots', 'section-tags-admin',
    // De Haven y CV Chat no las usa: actualizar Haven desde aca (romperia lo propio; se actualiza a mano y
    // probado), la voz (apagada en todos los canales), sus insignias (CV Chat tiene sus medallas), sus codigos
    // de invitacion ("Invitar gente" los reemplaza), la limpieza automatica (borraria mensajes) y su editor
    // de diseño (choca con el de CV Chat)
    'section-update', 'section-connectivity', 'section-badges', 'section-invite', 'section-cleanup', 'section-modmode'];
  const ALL = [...USER, ...ADMIN].flatMap(c => c.ids).concat(REMOVED);
  let built = false, current = null, refs = {};

  const navItemFor = id => document.querySelector(`#settings-nav .settings-nav-item[data-target="${id}"]`);
  // Haven esconde algunas secciones segun los permisos (su item del menu queda oculto)
  const allowed = id => { const n = navItemFor(id); return !n || n.style.display !== 'none'; };
  const isAdminCat = c => ADMIN.includes(c);

  function show(cat) {
    const app = window.app;
    current = cat;
    if (app && typeof app._switchSettingsTab === 'function') app._switchSettingsTab(isAdminCat(cat) ? 'admin' : 'user');
    for (const id of ALL) document.getElementById(id)?.classList.toggle('pas-oculto', !cat.ids.includes(id) || !allowed(id));
    for (const x of refs.extras) x.hidden = x.dataset.cat !== cat.id;
    refs.title.textContent = cat.name;
    refs.nav.querySelectorAll('.pas-item').forEach(b => b.classList.toggle('activo', b.dataset.cat === cat.id));
    refs.modal.classList.add('pas-detalle');
    const body = refs.modal.querySelector(isAdminCat(cat) ? '#settings-body-admin' : '#settings-body-user');
    if (body) body.scrollTop = 0;
    refs.content.scrollTop = 0;
    if (cat.extra === 'vinculos') { fillLinks(); textosCuenta(); }
    const partes = [...refs.modal.querySelectorAll('.admin-settings')];
    partes.forEach(x => x.classList.remove('pas-primera'));
    const primera = partes.find(x => x.offsetParent !== null);
    if (primera) primera.classList.add('pas-primera');
    textosAjustes();
  }
  // Textos de Haven que quedaban en ingles, nombrando a Haven o poco claros
  function textosAjustes() {
    const fila = (input) => { const i = document.getElementById(input); return i && i.closest('label'); };
    const ayuda = (lab) => { let n = lab && lab.nextElementSibling; return n && n.matches('.settings-hint') ? n : null; };
    const poner = (input, nombre, explica) => {
      const lab = fila(input); if (!lab) return;
      const sp = lab.querySelector('span'); if (sp && nombre) sp.textContent = nombre;
      const h = ayuda(lab); if (h && explica) h.textContent = explica;
    };
    poner('update-channel-early', 'Recibir las versiones nuevas antes', 'Llegan apenas salen, antes de ser estables (más o menos una vez por semana): tenés los arreglos antes, pero a veces con algún error.');
    poner('server-title-input', null, 'Se muestra en la pantalla para entrar, debajo del logo.');
    const tos = document.querySelector('#section-custom-tos .settings-hint');
    if (tos) tos.textContent = 'Los términos de CV Chat: se muestran al crear una cuenta, para aceptarlos. Texto sin formato; una línea en blanco separa los párrafos.';
    const tosT = document.querySelector('#section-custom-tos .settings-section-subtitle span');
    if (tosT) tosT.textContent = 'Términos y condiciones';
    for (const h of refs.modal.querySelectorAll('.settings-hint')) {
      if (/CV Chat Desktop/.test(h.textContent)) h.textContent = h.textContent.replace(/CV Chat Desktop/g, 'la app de PC');
    }
    // Ejemplos que nombraban a Haven: el nombre del servidor y la direccion de vuelta del inicio de sesion externo (la de aca)
    const nombre = document.getElementById('server-name-input');
    if (nombre && /haven/i.test(nombre.placeholder)) nombre.placeholder = 'CV Chat';
    for (const c of refs.modal.querySelectorAll('code')) {
      if (/your-haven-address/.test(c.textContent)) c.textContent = c.textContent.replace(/https?:\/\/your-haven-address/g, location.origin);
      else if (/haven\.db\.pre-restore/.test(c.textContent)) c.textContent = c.textContent.replace(/haven\.db\.pre-restore/g, 'la base anterior (.pre-restore)');
    }
  }
  function backToList() { refs.modal.classList.remove('pas-detalle'); current = null; }

  // Partes de otras secciones que son de Haven y CV Chat no usa (se ocultan; lo guardado sigue igual)
  function sinHaven() {
    const fuera = (e) => { if (e) e.classList.add('pas-fuera'); };
    const fila = (id) => { const i = document.getElementById(id); return i && i.closest('label'); };
    const conAyuda = (lab) => { if (!lab) return; fuera(lab); for (let n = lab.nextElementSibling; n && n.matches('.settings-hint'); n = n.nextElementSibling) fuera(n); };
    const grupo = (id) => { const i = document.getElementById(id); return i && i.closest('.settings-group'); };
    // Un grupo de Seguridad: su titulo y todo lo que sigue hasta el proximo titulo
    const bloque = (clave) => {
      const t = document.querySelector('.settings-group-label span[data-i18n="' + clave + '"]');
      const lbl = t && t.closest('.settings-group-label');
      if (!lbl) return;
      fuera(lbl);
      for (let n = lbl.nextElementSibling; n && !n.matches('.settings-group-label'); n = n.nextElementSibling) fuera(n);
    };
    // Servidor: el banner ancho, los temas de Haven (el diseño de CV Chat es fijo) y sus valores para miembros nuevos
    fuera(grupo('server-banner-file'));
    conAyuda(fila('default-theme-select'));
    fuera(document.getElementById('member-defaults-group'));
    fuera(grupo('admin-theme-list'));
    // Miembros: las versiones nuevas de Haven
    conAyuda(fila('update-banner-admin-only'));
    conAyuda(fila('update-channel-early'));
    // Seguridad: inicio de sesion externo, referrer y privacidad de la voz
    bloque('settings.admin.oidc_group');
    bloque('settings.admin.referrer_policy_group');
    bloque('settings.admin.voice_privacy_group');
    // Notificaciones: lo de la voz
    fuera(fila('voice-master-volume'));
    fuera(fila('soundboard-master-volume'));
    for (const id of ['auto-accept-streams', 'hide-voice-panel', 'sidebar-voice-controls', 'notif-voice-action-cues-enabled']) conAyuda(fila(id));
    for (const id of ['notif-join-volume', 'notif-join-sound', 'notif-leave-volume', 'notif-leave-sound']) fuera(fila(id));
    fuera(document.getElementById('open-sound-manager-user-btn'));
  }

  // Los textos de "Mi cuenta", en castellano de aca y mas claros. Se ponen cada vez que se abre
  // (si Haven vuelve a traducir la pagina, quedan los suyos hasta la proxima vez)
  const TEXTOS = [
    ['#section-password .settings-section-title span', 'Contraseña'],
    ['#current-password', 'Tu contraseña actual', 'placeholder'],
    ['#new-password', 'Contraseña nueva (8 caracteres o más)', 'placeholder'],
    ['#confirm-password', 'Repetí la contraseña nueva', 'placeholder'],
    ['#change-password-btn', 'Cambiar contraseña'],
    ['#section-2fa .settings-section-title span', 'Verificación en dos pasos'],
    ['#totp-enable-area .settings-hint', 'Además de tu contraseña, para entrar te va a pedir un código de 6 números que te da una app en el celular (Google Authenticator, Authy). Aunque alguien sepa tu contraseña, sin tu celular no puede entrar.'],
    ['#totp-enable-btn', 'Activar verificación en dos pasos'],
    ['#totp-setup-area > .settings-hint:first-child', '1. Abrí la app (Google Authenticator, Authy…) y escaneá este código:'],
    ['#totp-setup-area > .settings-hint:nth-of-type(2)', 'Si no podés escanearlo, cargá esta clave a mano:'],
    ['#totp-setup-password', '2. Tu contraseña de CV Chat', 'placeholder'],
    ['#totp-verify-code', '3. El código de 6 números que muestra la app', 'placeholder'],
    ['#totp-verify-setup-btn', 'Verificar y activar'],
    ['#totp-backup-area .settings-hint', 'Guardá estos códigos en un lugar seguro: si perdés el celular, cada uno te deja entrar una vez.'],
    ['#totp-disable-password', 'Tu contraseña, para hacer cambios', 'placeholder'],
    ['#totp-manage-area .settings-hint:first-child span', 'La verificación en dos pasos está activada'],
    ['#totp-disable-btn', 'Desactivar'],
    ['#totp-regen-backup-btn', 'Nuevos códigos de respaldo'],
    ['#totp-backup-area h5 span', 'Códigos de respaldo'],
    ['#totp-copy-backup-btn span', 'Copiar los códigos'],
    ['#section-sessions .settings-hint[data-i18n]', 'Los dispositivos que tienen CV Chat abierto ahora. Si creés que alguien más entró a tu cuenta, cerrá la sesión en los demás y cambiá la contraseña.'],
    ['#revoke-sessions-btn', 'Cerrar sesión en los demás dispositivos'],
    ['#section-recovery .settings-section-title span', 'Códigos de recuperación'],
    ['#section-recovery > .settings-hint[data-i18n]', 'Códigos para volver a entrar si te olvidás la contraseña y no podés usar tu email. Guardalos en un lugar seguro: cada uno sirve una sola vez.'],
    ['#recovery-e2e-warning > span', '⚠️ Ojo: si cambiás la contraseña con uno de estos códigos, tus mensajes privados anteriores ya no se van a poder leer.'],
    ['#recovery-gen-password', 'Tu contraseña', 'placeholder'],
    ['#recovery-generate-btn', 'Crear códigos de recuperación'],
    ['#section-delete-account > .settings-section-title span', 'Eliminar cuenta'],
    ['#section-delete-account > .settings-hint', 'Borra tu cuenta para siempre. No se puede deshacer.'],
    ['#delete-account-btn', 'Eliminar mi cuenta'],
  ];
  function textosCuenta() {
    for (const [sel, txt, attr] of TEXTOS) {
      const e = document.querySelector('#settings-modal ' + sel);
      if (!e) continue;
      if (attr) e.setAttribute(attr, txt); else e.textContent = txt;
    }
    // "Recomendado" al lado del titulo mientras no esta activada
    const sec = document.getElementById('section-2fa');
    const off = document.getElementById('totp-enable-area');
    if (sec) sec.classList.toggle('pas-2fa-apagada', !!(off && off.style.display !== 'none'));
  }

  // "Mi cuenta": la misma cuenta en la pagina y el foro, Discord vinculado y el email de recuperacion,
  // en una sola tarjeta: una fila por cuenta, con su foto, el usuario de cada una y el email a la vista
  async function fillLinks() {
    const box = refs.links;
    const token = (() => { try { return localStorage.getItem('haven_token'); } catch { return null; } })();
    const pedir = (u) => fetch(u, { headers: { Authorization: 'Bearer ' + token } }).then(r => (r.ok ? r.json() : null)).catch(() => null);
    const [st, fo, em] = await Promise.all([pedir('/puente/api/estado'), pedir('/puente/api/foro/estado'), window.puenteEmail ? pedir('/puente/api/email/estado') : null]);
    box.textContent = '';
    const caja = el('div', 'settings-section pas-cuentas');
    caja.appendChild(el('h5', 'settings-section-title', '🔗 Tus cuentas'));
    const yo = (window.app && window.app.user) || {};
    const row = (foto, icon, title, valor, bien, label, fn) => {
      const r = el('div', 'pas-cta');
      const ic = el('div', 'pas-cta-ico');
      if (foto) { const i = el('img'); i.src = foto; i.alt = ''; i.addEventListener('error', () => { i.remove(); ic.textContent = icon; }); ic.appendChild(i); } else ic.textContent = icon;
      const t = el('div', 'pas-cta-texto'); t.append(el('b', null, title), el('span', 'pas-cta-valor' + (bien ? ' bien' : ''), valor));
      const b = el('button', 'pas-cta-boton', label); b.type = 'button'; b.addEventListener('click', fn);
      r.append(ic, t, b); caja.appendChild(r);
    };
    // La pagina: la misma cuenta que el chat
    const web = 'https://' + location.hostname.replace(/^chat\./, '');
    row(st && st.avatar, '🌐', 'Página y chat', '@' + (yo.username || '') + ' · la misma cuenta', true, 'Ver', () => { window.open(web + '/cuenta', '_blank', 'noopener'); });
    // El foro (si no esta unida, la cuenta del foro se crea sola la primera vez que entra)
    if (fo && fo.disponible) {
      const ff = fo.foro && fo.foro.avatar && /^https:\/\//.test(fo.foro.avatar) ? fo.foro.avatar : null;
      row(ff, '💬', 'Foro', fo.vinculado ? (fo.foro && fo.foro.usuario) + ' · la misma cuenta' : 'Sin unir · se crea sola al entrar al foro', !!fo.vinculado,
        fo.vinculado ? 'Ver' : 'Unir', () => { location.href = '/puente/vincular'; });
    }
    if (st && st.disponible) {
      row(st.vinculado && st.discord && st.discord.avatar, '🎮', 'Discord', st.vinculado ? '@' + (st.discord && st.discord.usuario) : 'Sin vincular · para recuperar tu historial', !!st.vinculado,
        st.vinculado ? 'Administrar' : 'Vincular', () => { location.href = '/puente/vincular'; });
    }
    if (window.puenteEmail) {
      const valor = em && em.email ? em.email + (em.confirmado ? ' · confirmado' : ' · sin confirmar') : 'Sin email · para recuperar la contraseña';
      row(null, '✉️', 'Email de recuperación', valor, !!(em && em.confirmado), em && em.email ? 'Cambiar' : 'Agregar', () => window.puenteEmail.open());
    }
    box.appendChild(caja);
  }

  function build(modal) {
    if (built) return;
    const box = modal.querySelector('.modal');
    if (!box) return;
    built = true;
    box.classList.add('pas');
    const h3 = box.querySelector('h3');
    if (h3) h3.textContent = 'Configuración';
    // El menu propio (las categorias) en lugar del de Haven y sus pestañas
    const nav = el('nav', 'pas-nav');
    const group = (title, cats) => {
      nav.appendChild(el('div', 'pas-grupo', title));
      for (const c of cats) {
        const b = el('button', 'pas-item'); b.type = 'button'; b.dataset.cat = c.id;
        b.append(el('span', 'pas-ico', c.icon), el('span', 'pas-nombre', c.name), el('span', 'pas-flecha', '›'));
        b.addEventListener('click', () => show(c));
        nav.appendChild(b);
      }
    };
    group('Ajustes de usuario', USER);
    const app = window.app;
    if (app && typeof app._hasAnyAdminSettingsAccess === 'function' && app._hasAnyAdminSettingsAccess()) group('Administración', ADMIN);
    // Encabezado del contenido (en el celular, con la flecha para volver)
    const head = el('div', 'pas-cabeza');
    const back = el('button', 'pas-volver', '‹'); back.type = 'button'; back.setAttribute('aria-label', 'Volver');
    back.addEventListener('click', backToList);
    const title = el('h2', 'pas-titulo', '');
    head.append(back, title);
    // Lo propio de CV Chat en cada categoria
    const links = el('div', 'pas-extra'); links.dataset.cat = 'cuenta';
    const perfil = el('div', 'pas-extra'); perfil.dataset.cat = 'perfil';
    const pr = el('div', 'pas-fila');
    const pt = el('div', 'pas-fila-texto'); pt.append(el('b', null, '✨ Tu perfil'), el('span', null, 'Nombre, avatar, estilo del nombre, banner, tema y más.'));
    const pb = el('button', 'pas-boton', 'Editar perfil'); pb.type = 'button';
    pb.addEventListener('click', () => { document.getElementById('close-settings-btn')?.click(); setTimeout(() => window.app && window.app._openRenameModal && window.app._openRenameModal(), 50); });
    pr.append(pt, pb); perfil.appendChild(pr);
    const content = el('div', 'pas-contenido');
    const bodyUser = box.querySelector('#settings-body-user'), bodyAdmin = box.querySelector('#settings-body-admin');
    const navOld = box.querySelector('#settings-nav');
    const wrap = (bodyUser || bodyAdmin) && (bodyUser || bodyAdmin).parentElement;
    if (!wrap) return;
    wrap.classList.add('pas-cuerpo');
    wrap.insertBefore(nav, wrap.firstChild);
    content.append(head, links, perfil);
    // Los cuerpos de Haven van dentro del contenido
    wrap.insertBefore(content, nav.nextSibling);
    if (bodyUser) content.appendChild(bodyUser);
    if (bodyAdmin) content.appendChild(bodyAdmin);
    const save = box.querySelector('.admin-save-bar'); if (save) content.appendChild(save);
    if (navOld) navOld.classList.add('pas-fuera');
    box.querySelector('#settings-tab-bar')?.classList.add('pas-fuera');
    for (const id of REMOVED) { document.getElementById(id)?.classList.add('pas-fuera'); navItemFor(id)?.classList.add('pas-fuera'); }
    sinHaven();
    const pw = document.getElementById('section-password'), tf = document.getElementById('section-2fa');
    if (pw && tf) pw.insertAdjacentElement('afterend', tf);
    // Al activarla o desactivarla Haven muestra otra parte: el "Recomendado" se acomoda solo
    const zona = document.getElementById('totp-enable-area');
    if (zona && tf) new MutationObserver(() => tf.classList.toggle('pas-2fa-apagada', zona.style.display !== 'none')).observe(zona, { attributes: true, attributeFilter: ['style'] });
    refs = { modal: box, nav, content, title, links, extras: [links, perfil] };
  }

  function opened() {
    const modal = document.getElementById('settings-modal');
    if (!modal) return;
    build(modal);
    if (!built) return;
    // En la computadora se abre en "Mi cuenta"; en el celular, en la lista
    if (mobile()) { backToList(); for (const x of refs.extras) x.hidden = true; }
    else show(current || USER[0]);
  }
  window.puenteAjustes = {
    enDetalle: () => !!(refs.modal && refs.modal.classList.contains('pas-detalle') && mobile() && document.getElementById('settings-modal')?.style.display === 'flex'),
    volver: () => backToList(),
  };

  const css = el('style');
  css.textContent = `
    .pas-fuera, .pas-oculto { display: none !important; }
    #settings-modal .modal.pas { width: min(64rem, calc(100vw - 32px)); max-width: none; height: min(46rem, calc(100vh - 32px)); max-height: none; display: flex; flex-direction: column; padding: 0; overflow: hidden; background: #1a1a1e; border: 1px solid #2a2a30; border-radius: 1rem; }
    #settings-modal { backdrop-filter: none !important; -webkit-backdrop-filter: none !important; background: rgba(0, 0, 0, .78) !important; }
    #settings-modal .modal.pas .settings-header { display: flex; align-items: center; justify-content: space-between; margin: 0; padding: 1rem 1.25rem 1rem 1.5rem; border-bottom: 1px solid #26262b; }
    #settings-modal .modal.pas .settings-header h3 { margin: 0; font-size: 1.25rem; font-weight: 800; }
    #settings-modal .pas-cuerpo { flex: 1 1 auto; min-height: 0; display: flex !important; flex-direction: row; overflow: hidden; gap: 0; }
    #settings-modal .pas-nav { flex: 0 0 15rem; overflow-y: auto; padding: 1rem .75rem; background: #141417; border-right: 1px solid #26262b; }
    #settings-modal .pas-grupo { padding: .75rem .625rem .375rem; font-size: .6875rem; font-weight: 700; text-transform: uppercase; letter-spacing: .03em; color: #80848e; }
    #settings-modal .pas-item { display: flex; align-items: center; gap: .625rem; width: 100%; padding: .5rem .625rem; border: 0; border-radius: .375rem; background: transparent; color: #b5bac1; font: inherit; font-size: .9375rem; font-weight: 500; text-align: left; cursor: pointer; }
    #settings-modal .pas-item:hover { background: #232228; color: #dbdee1; }
    #settings-modal .pas-item.activo { background: #2e2d33; color: #fff; }
    #settings-modal .pas-ico { width: 1.25rem; text-align: center; }
    #settings-modal .pas-nombre { flex: 1 1 auto; }
    #settings-modal .pas-flecha { display: none; color: #80848e; font-size: 1.25rem; }
    #settings-modal .pas-contenido { flex: 1 1 auto; min-width: 0; overflow-y: auto; padding: 1.25rem 2rem 2rem; overscroll-behavior: contain; }
    #settings-modal .pas-cabeza { display: flex; align-items: center; gap: .5rem; margin-bottom: .75rem; }
    #settings-modal .pas-volver { display: none; width: 2.25rem; height: 2.25rem; border: 0; border-radius: 50%; background: #2b2a30; color: #dbdee1; font-size: 1.5rem; line-height: 1; cursor: pointer; }
    #settings-modal .pas-titulo { margin: 0; font-size: 1.375rem; font-weight: 800; color: #f2f3f5; }
    #settings-modal .pas-contenido #settings-body-user, #settings-modal .pas-contenido #settings-body-admin { overflow: visible !important; height: auto !important; max-height: none !important; padding: 0 !important; flex: none !important; }
    #settings-modal .pas-contenido .settings-section { border-top: 0 !important; margin: 0 0 1rem !important; padding: 1rem 1.125rem !important; background: #202024; border-radius: .75rem; }
    #settings-modal .pas-contenido .settings-section-title { margin: 0 0 .75rem; font-size: .75rem; font-weight: 700; text-transform: uppercase; letter-spacing: .02em; color: #b5bac1; }
    #settings-modal .pas-contenido input[type="text"], #settings-modal .pas-contenido input[type="password"], #settings-modal .pas-contenido input[type="email"], #settings-modal .pas-contenido select, #settings-modal .pas-contenido textarea { background: #121214; border: 1px solid #2e2d32; border-radius: .5rem; color: #dbdee1; padding: .5rem .75rem; font: inherit; }
    #settings-modal .pas-contenido .btn-sm { min-height: 2.25rem; padding: 0 .875rem; border-radius: .5rem; font-weight: 600; }
    #settings-modal .pas-extra[hidden] { display: none; }
    #settings-modal .pas-fila { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin: 0 0 .75rem; padding: 1rem 1.125rem; background: #202024; border-radius: .75rem; }
    #settings-modal .pas-fila-texto { display: flex; flex-direction: column; gap: .25rem; min-width: 0; }
    #settings-modal .pas-fila-texto b { color: #f2f3f5; font-size: 1rem; }
    #settings-modal .pas-fila-texto span { color: #949ba4; font-size: .875rem; }
    #settings-modal .pas-boton { flex: 0 0 auto; min-height: 2.25rem; padding: 0 1rem; border: 0; border-radius: .5rem; background: #5865f2; color: #fff; font: inherit; font-weight: 600; cursor: pointer; }
    #settings-modal .pas-boton:hover { background: #4752c4; }
    /* Todas las categorias: cada opcion en una fila (nombre a la izquierda, el control a la derecha) y su
       explicacion debajo, a la izquierda; textos de 14-15 px */
    #settings-modal .pas-contenido .toggle-row, #settings-modal .pas-contenido .select-row, #settings-modal .pas-contenido .volume-row { display: flex; align-items: center; justify-content: space-between; gap: 1rem; min-height: 2.5rem; margin: .375rem 0 0 !important; padding: 0 !important; font-size: .9375rem !important; color: #f2f3f5; }
    #settings-modal .pas-contenido .toggle-row > span, #settings-modal .pas-contenido .select-row > span, #settings-modal .pas-contenido .volume-row > span { flex: 1 1 auto; min-width: 0; font-size: .9375rem !important; font-weight: 500; color: #f2f3f5; }
    #settings-modal .pas-contenido .volume-row input[type="range"] { margin-left: auto !important; flex: 0 1 10rem; }
    #settings-modal .pas-contenido .vol-readout { min-width: 3rem; font-size: .875rem !important; color: #b5bac1; }
    #settings-modal .pas-contenido .settings-hint, #settings-modal .pas-contenido small.settings-hint { display: block; text-align: left !important; margin: .125rem 0 .5rem !important; padding: 0 !important; border: 0 !important; font-size: .875rem !important; line-height: 1.45; color: #949ba4; }
    #settings-modal .pas-contenido .settings-hint:empty { display: none; }
    #settings-modal .pas-contenido .settings-hint { white-space: normal !important; min-height: 0 !important; flex: none !important; height: auto !important; }
    #settings-modal .pas-contenido .admin-settings { gap: .25rem !important; }
    /* Listas y botones chicos de Haven (valores para miembros nuevos, roles, insignias, idioma, accesibilidad) */
    #settings-modal .pas-contenido .member-defaults-row, #settings-modal .pas-contenido .member-defaults-row span, #settings-modal .pas-contenido .role-preview-item span, #settings-modal .pas-contenido .badge-admin-how, #settings-modal .pas-contenido .density-label, #settings-modal .pas-contenido .a11y-reset-btn, #settings-modal .pas-contenido .lang-name, #settings-modal .pas-contenido .zoom-value, #settings-modal .pas-contenido .whitelist-username, #settings-modal .pas-contenido .whitelist-username * { font-size: .875rem !important; }
    #settings-modal .pas-contenido .badge-admin-group-label, #settings-modal .pas-contenido .muted-text { font-size: .8125rem !important; }
    #settings-modal .pas-contenido .notif-settings { gap: 0 !important; }
    #settings-modal .pas-contenido select { min-height: 2.5rem; font-size: .9375rem !important; padding: 0 2rem 0 .75rem; flex: 0 1 16rem; max-width: 60%; }
    #settings-modal .pas-contenido .select-row input.settings-text-input { flex: 0 1 18rem; max-width: 60%; font-size: .9375rem !important; }
    /* Administracion: subtitulos como los titulos de las tarjetas, y cada parte separada por una linea */
    #settings-modal .pas-contenido .admin-settings { margin-top: 1.25rem !important; padding-top: 1.25rem !important; border-top: 1px solid #2b2b31 !important; }
    #settings-modal .pas-contenido .admin-settings.pas-primera { margin-top: 0 !important; padding-top: 0 !important; border-top: 0 !important; }
    #settings-modal .pas-contenido .settings-section-subtitle { margin: 0 0 .5rem !important; padding: 0 !important; border: 0 !important; font-size: 1rem !important; font-weight: 700; text-transform: none !important; letter-spacing: 0 !important; color: #f2f3f5 !important; }
    #settings-modal .pas-contenido .settings-section-subtitle span { font-size: 1rem !important; }
    #settings-modal .pas-contenido .settings-section-subtitle::after, #settings-modal .pas-contenido .settings-section-title::after { display: none !important; }
    #settings-modal .pas-contenido .settings-group-label { font-size: .875rem !important; font-weight: 600; text-transform: none !important; letter-spacing: 0 !important; color: #dbdee1 !important; }
    #settings-modal .pas-contenido .settings-group { padding-left: 0 !important; border-left: 0 !important; }
    #settings-modal .pas-contenido .settings-btn-grid { grid-template-columns: repeat(auto-fill, minmax(12.5rem, 1fr)) !important; gap: .5rem !important; margin: .5rem 0 .75rem; }
    #settings-modal .pas-contenido .settings-btn-grid button { white-space: normal; text-align: center; line-height: 1.2; min-height: 2.5rem; }
    #settings-modal .pas-contenido #admin-mod-panel > .settings-section-title:empty, #settings-modal .pas-contenido #admin-mod-panel > hr:first-child { display: none; }
    @media (max-width: 768px) {
      #settings-modal .pas-contenido select, #settings-modal .pas-contenido .select-row input.settings-text-input { max-width: 55%; }
      #settings-modal .pas-contenido .volume-row input[type="range"] { flex-basis: 7rem; }
    }
    /* "Tus cuentas": una fila compacta por cuenta */
    #settings-modal .pas-cuentas { padding-bottom: .375rem !important; }
    #settings-modal .pas-cta { display: flex; align-items: center; gap: .75rem; padding: .625rem 0; border-top: 1px solid #2b2b31; }
    #settings-modal .pas-cuentas .settings-section-title + .pas-cta { border-top: 0; padding-top: .25rem; }
    #settings-modal .pas-cta-ico { flex: 0 0 2.25rem; width: 2.25rem; height: 2.25rem; border-radius: 50%; overflow: hidden; display: flex; align-items: center; justify-content: center; background: #2b2a30; font-size: 1.125rem; }
    #settings-modal .pas-cta-ico img { width: 100%; height: 100%; object-fit: cover; }
    #settings-modal .pas-cta-texto { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: .0625rem; }
    #settings-modal .pas-cta-texto b { color: #f2f3f5; font-size: .9375rem; font-weight: 700; }
    #settings-modal .pas-cta-valor { color: #b5bac1; font-size: .875rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    #settings-modal .pas-cta-valor.bien { color: #dbdee1; }
    #settings-modal .pas-cta-boton { flex: 0 0 auto; min-height: 2.125rem; padding: 0 .875rem; border: 1px solid #3a3a42; border-radius: .5rem; background: transparent; color: #f2f3f5; font: inherit; font-size: .875rem; font-weight: 600; cursor: pointer; }
    #settings-modal .pas-cta-boton:hover { background: #2b2a30; border-color: #4e4e57; }
    #settings-modal .pas-contenido .settings-hint, #settings-modal .pas-contenido p.settings-hint { font-size: .875rem; line-height: 1.45; color: #b5bac1; }
    #settings-modal .pas-contenido input[type="text"], #settings-modal .pas-contenido input[type="password"], #settings-modal .pas-contenido input[type="email"] { font-size: 1rem; min-height: 2.75rem; }
    #settings-modal .pas-contenido .btn-sm { min-height: 2.5rem; font-size: .9375rem; }
    /* "Mi cuenta": titulos como los de las filas de arriba (Pagina, Foro...), sin mayusculas chiquitas */
    #settings-modal #settings-body-user .settings-section-title, #settings-modal .pas-cuentas .settings-section-title { display: flex; align-items: center; gap: .375rem; margin: 0 0 .5rem; padding: 0; border: 0; font-size: 1rem; font-weight: 700; text-transform: none; letter-spacing: 0; color: #f2f3f5; }
    #settings-modal #settings-body-user .settings-section-title::after { display: none; }
    #settings-modal #settings-body-user .password-change-form, #settings-modal #settings-body-user .form-group.compact { display: flex; flex-direction: column; gap: .5rem; margin: 0; }
    #settings-modal #settings-body-user .password-change-form { margin-top: .75rem; }
    /* Las acciones principales, en azul */
    #settings-modal #change-password-btn, #settings-modal #totp-verify-setup-btn, #settings-modal #recovery-generate-btn, #settings-modal #totp-enable-btn, #settings-modal #totp-backup-done-btn, #settings-modal #recovery-codes-done-btn { background: #5865f2 !important; color: #fff !important; border: 0 !important; opacity: 1 !important; }
    #settings-modal #change-password-btn:hover, #settings-modal #totp-verify-setup-btn:hover, #settings-modal #recovery-generate-btn:hover, #settings-modal #totp-enable-btn:hover { background: #4752c4 !important; }
    #settings-modal #change-password-btn { margin-top: .25rem; }
    #settings-modal #totp-verify-setup-btn { margin-top: .625rem; }
    #settings-modal #totp-cancel-setup-btn { background: transparent !important; color: #b5bac1 !important; border: 0 !important; opacity: 1 !important; }
    /* Verificacion en dos pasos: resaltada mientras no esta activada */
    #settings-modal #section-2fa.pas-2fa-apagada { background: linear-gradient(135deg, rgba(88,101,242,.16), rgba(88,101,242,.05)); box-shadow: inset 0 0 0 1px rgba(88,101,242,.55); }
    #settings-modal #section-2fa.pas-2fa-apagada .settings-section-title::after { content: 'Recomendado'; display: inline-block; margin-left: .375rem; padding: .125rem .5rem; border-radius: 1rem; background: #5865f2; color: #fff; font-size: .75rem; font-weight: 700; }
    #settings-modal #totp-enable-btn { min-height: 2.75rem; font-size: 1rem; font-weight: 700; }
    #settings-modal #totp-enable-area .settings-hint { margin: 0 0 .875rem !important; }
    #settings-modal #totp-setup-area img#totp-qr-img { max-width: 13rem !important; }
    #settings-modal #totp-secret-text { font-size: .9375rem !important; color: #f2f3f5; }
    #settings-modal #totp-verify-code { letter-spacing: .375rem; }
    #settings-modal #totp-verify-code::placeholder { letter-spacing: normal; font-size: .9375rem; }
    #settings-modal #totp-manage-area .settings-hint:first-child { color: #23a55a !important; font-weight: 700; font-size: .9375rem; }
    #settings-modal #totp-manage-area .form-group.compact { margin-bottom: .625rem; }
    #settings-modal #totp-disable-btn { background: transparent !important; color: #f23f43 !important; border: 1px solid rgba(242,63,67,.6) !important; }
    #settings-modal #totp-disable-btn:hover { background: rgba(242,63,67,.1) !important; }
    /* Cerrar sesion en los demas: sin el boton rojo gigante (no es peligroso, solo corta las otras sesiones) */
    #settings-modal #revoke-sessions-btn { width: auto !important; max-width: 100%; min-height: 2.5rem; margin-top: .75rem; padding: .5rem 1rem; white-space: normal; background: transparent !important; color: #f23f43 !important; border: 1px solid rgba(242,63,67,.6) !important; font-size: .9375rem; font-weight: 600; }
    #settings-modal #revoke-sessions-btn:hover { background: rgba(242,63,67,.1) !important; }
    #settings-modal #recovery-e2e-warning { background: rgba(240,178,50,.1) !important; border-color: rgba(240,178,50,.45) !important; font-size: .875rem !important; line-height: 1.45; color: #dbdee1 !important; }
    #settings-modal #recovery-generate-area { display: flex; flex-direction: column; gap: .5rem; }
    #settings-modal #delete-account-btn { min-height: 2.5rem; font-size: .9375rem; }
    @media (max-width: 768px) {
      #settings-modal .modal.pas { width: 100vw; height: 100%; border-radius: 0; border: 0; }
      #settings-modal .pas-nav { flex: 1 1 auto; border-right: 0; background: #1a1a1e; padding: .5rem 1rem 1rem; }
      #settings-modal .pas-item { padding: .875rem .75rem; font-size: 1rem; background: #202024; border-radius: 0; border-bottom: 1px solid #1a1a1e; }
      #settings-modal .pas-flecha { display: inline; }
      #settings-modal .pas-contenido { display: none; padding: 1rem; }
      #settings-modal .pas.pas-detalle .pas-nav { display: none; }
      #settings-modal .pas.pas-detalle .pas-contenido { display: block; }
      #settings-modal .pas-volver { display: inline-flex; align-items: center; justify-content: center; }
      #settings-modal .pas-fila { flex-direction: column; align-items: stretch; }
    }`;
  document.head.appendChild(css);

  // Cada vez que se abre la ventana de Haven
  let tries = 0;
  (function wait() {
    const m = document.getElementById('settings-modal');
    if (!m || !window.app) { if (++tries < 120) setTimeout(wait, 500); return; }
    let was = m.style.display === 'flex';
    new MutationObserver(() => {
      const now = m.style.display === 'flex';
      if (now && !was) { try { opened(); } catch (err) { console.warn('[puente] configuracion:', err); } }
      was = now;
    }).observe(m, { attributes: true, attributeFilter: ['style'] });
  })();
})();

// El icono de la pestaña: el redondo y sin fondo (instalable.js). Haven lo cambia
// por la imagen original del servidor (cuadrada, con fondo) cuando carga; aca se
// vuelve a poner el redondo cada vez que lo cambia.
(function () {
  'use strict';
  const first = document.querySelector('link[rel~="icon"]');
  const ICON = first && first.getAttribute('href');
  if (!ICON || ICON.indexOf('/puente/icono-') !== 0) return; // sin icono propio del servidor: el de Haven
  const fix = () => {
    for (const l of document.querySelectorAll('link[rel~="icon"]')) {
      if ((l.getAttribute('href') || '').indexOf('/puente/icono-') !== 0) { l.removeAttribute('type'); l.setAttribute('href', ICON); }
    }
  };
  new MutationObserver(fix).observe(document.head, { subtree: true, childList: true, attributes: true, attributeFilter: ['href'] });
  fix();
})();

// Actualizar sola: cada minuto (y al volver a la app o al reconectarse) se fija si hay una version
// nueva. Si cambio solo el tema, lo cambia en el momento, sin recargar. Si cambio el programa,
// recarga cuando no molesta: con la app en segundo plano, o quieta y sin nada escrito, sin
// llamada de voz ni ventanas abiertas. Nadie tiene que tocar Ctrl+Shift+R ni cerrar la app.
// Tambien cuenta como programa nuevo un cambio de la llave de conexion (llave.js): una pestaña
// vieja, sin la llave, se recarga sola antes de que se termine el tiempo en que todavia entra.
(() => {
  let base = null, pendiente = false, ultimaAccion = Date.now();
  const leer = () => fetch('/puente/version', { cache: 'no-store', credentials: 'same-origin' }).then(r => (r.ok ? r.json() : null)).catch(() => null);
  for (const ev of ['pointerdown', 'keydown', 'touchstart', 'wheel']) addEventListener(ev, () => { ultimaAccion = Date.now(); }, { capture: true, passive: true });
  function temaNuevo() {
    // Primero se baja el tema nuevo y despues se le cambia la direccion a cada copia (Haven a veces
    // lo carga dos veces), asi no parpadea y Haven sigue manejando sus propios elementos
    const url = '/themes/discord-plus.theme.css?_=' + Date.now();
    const pre = document.createElement('link');
    pre.rel = 'preload'; pre.as = 'style'; pre.href = url;
    pre.addEventListener('load', () => {
      for (const l of document.querySelectorAll('link[rel="stylesheet"]')) if (/\/themes\/discord-plus\.theme\.css/.test(l.getAttribute('href') || '')) l.href = url;
      pre.remove();
    }, { once: true });
    pre.addEventListener('error', () => pre.remove(), { once: true });
    document.head.appendChild(pre);
  }
  function tranquilo() {
    const a = window.app;
    if (a && a.voice && a.voice.inVoice) return false; // en una llamada, nunca
    if (document.hidden) return true;
    if (Date.now() - ultimaAccion < 45000) return false;
    const escrito = [...document.querySelectorAll('textarea, input[type="text"], input:not([type]), [contenteditable="true"]')]
      .some(x => x.offsetParent !== null && String(x.value != null ? x.value : x.textContent).trim());
    if (escrito) return false;
    if (document.getElementById('puente-juegos') || document.getElementById('puente-mercado')) return false; // jugando o en el Marketplace: espera a que salga
    if ([...document.querySelectorAll('.modal-overlay, .jg-aviso-fondo')].some(x => x.offsetParent !== null && getComputedStyle(x).display !== 'none')) return false;
    return true;
  }
  function intentar() {
    if (!pendiente || !tranquilo()) return;
    pendiente = false;
    location.reload();
  }
  async function revisar() {
    const v = await leer();
    if (!v) return;
    if (!base) { base = v; return; }
    if (v.css !== base.css) { base.css = v.css; temaNuevo(); }
    if (v.js !== base.js) { base.js = v.js; pendiente = true; }
    intentar();
  }
  revisar();
  setInterval(revisar, 60000);
  setInterval(intentar, 10000);
  document.addEventListener('visibilitychange', () => { if (document.hidden) intentar(); else revisar(); });
  addEventListener('focus', revisar);
  // al reconectarse (por ejemplo, despues de un reinicio del servidor)
  let t = 0;
  (function enganchar() {
    const s = window.app && window.app.socket;
    if (!s) { if (++t < 120) setTimeout(enganchar, 1000); return; }
    s.on('connect', () => setTimeout(revisar, 3000));
  })();
})();

// Version nueva de la app instalada (apps/): la pagina se actualiza sola, pero la app (el icono,
// los permisos) solo cambia al reinstalarla. Si la app es mas vieja que la del servidor, un aviso
// con "Actualizar": en Android baja el APK nuevo, que se instala encima sin perder nada; en Windows,
// desde la version 1.0.1 la app se actualiza sola y este aviso solo le aparece a la 1.0.0.
(() => {
  const ver = (a) => String(a || '0').split('.').map(n => parseInt(n, 10) || 0);
  const menor = (a, b) => { const x = ver(a), y = ver(b); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) < (y[i] || 0); } return false; };
  const ses = (k, v) => { try { if (v === undefined) return sessionStorage.getItem(k); sessionStorage.setItem(k, v); } catch { return null; } return v; };
  let plataforma = null, actual = null;
  const w = navigator.userAgent.match(/CVChat\/([\d.]+)/);
  if (w) { plataforma = 'windows'; actual = w[1]; }
  else {
    const q = new URLSearchParams(location.search);
    // la de Google Play se actualiza desde la tienda: sin este aviso
    if (q.get('app') === 'play') ses('puente_app_play', '1');
    if (ses('puente_app_play')) return;
    if (q.get('app') === 'android') ses('puente_app_android', q.get('v') || '1.0.0');
    // la 1.0.1 y anteriores no avisan su version: se las reconoce porque Android abre la pagina desde la app
    else if (/^android-app:\/\/club\.circulovicioso\.chat/.test(document.referrer || '') && !ses('puente_app_android')) ses('puente_app_android', '1.0.0');
    if (ses('puente_app_android')) { plataforma = 'android'; actual = ses('puente_app_android'); }
  }
  if (!plataforma) return;
  if (plataforma === 'windows' && !menor(actual, '1.0.1')) return; // esa ya se actualiza sola
  setTimeout(async () => {
    const d = await fetch('/puente/descargas.json', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).catch(() => null);
    const ultima = d && d[plataforma] && d[plataforma].version;
    if (!ultima || !menor(actual, ultima)) return;
    const KEY = 'puente_app_luego_' + plataforma + '_' + ultima;
    try { if (Number(localStorage.getItem(KEY) || 0) > Date.now()) return; } catch { /* sigue */ }
    if (document.getElementById('puente-app-nueva')) return;
    const box = document.createElement('div'); box.id = 'puente-app-nueva'; box.setAttribute('role', 'dialog');
    const icon = document.createElement('div'); icon.className = 'pa-icono'; icon.textContent = '⬆️';
    const txt = document.createElement('div'); txt.className = 'pa-texto';
    const t1 = document.createElement('b'); t1.textContent = 'Hay una versión nueva de la app';
    const t2 = document.createElement('span');
    t2.textContent = plataforma === 'android' ? 'Tocá Actualizar, abrí el archivo cuando termine de bajar y tocá Instalar. No se pierde nada.' : 'Tocá Actualizar, abrí el instalador cuando termine y listo. Después se actualiza sola.';
    txt.append(t1, t2);
    const btns = document.createElement('div'); btns.className = 'pa-botones';
    const yes = document.createElement('a'); yes.className = 'pa-si'; yes.textContent = 'Actualizar';
    yes.href = plataforma === 'android' ? '/puente/descargas/CV-Chat-Android.apk' : '/puente/descargas/CV-Chat-Windows.exe';
    yes.setAttribute('download', '');
    const no = document.createElement('button'); no.type = 'button'; no.className = 'pa-no'; no.textContent = 'Más tarde';
    btns.append(yes, no); box.append(icon, txt, btns);
    const cerrar = (dias) => { try { localStorage.setItem(KEY, String(Date.now() + dias * 864e5)); } catch { /* nada */ } box.remove(); };
    no.addEventListener('click', () => cerrar(3));
    yes.addEventListener('click', () => setTimeout(() => cerrar(1), 300));
    const st = document.createElement('style');
    st.textContent = `#puente-app-nueva{position:fixed;left:50%;top:calc(.75rem + env(safe-area-inset-top,0px));transform:translateX(-50%);z-index:100003;width:min(26rem,calc(100vw - 24px));box-sizing:border-box;display:grid;grid-template-columns:auto 1fr;gap:.25rem .75rem;align-items:center;padding:.875rem 1rem;border-radius:.875rem;background:#2b2a30;color:#dbdee1;box-shadow:0 10px 32px rgba(0,0,0,.5);animation:puente-fade .2s ease-out}
#puente-app-nueva .pa-icono{grid-row:span 2;font-size:1.5rem}
#puente-app-nueva .pa-texto{display:flex;flex-direction:column;gap:.125rem;font-size:.875rem;line-height:1.35;color:#b5bac1}
#puente-app-nueva .pa-texto b{color:#f2f3f5;font-size:.9375rem}
#puente-app-nueva .pa-botones{display:flex;gap:.5rem;justify-content:flex-end}
#puente-app-nueva .pa-si,#puente-app-nueva .pa-no{display:inline-flex;align-items:center;min-height:2.25rem;padding:0 1rem;border:0;border-radius:.5rem;font:inherit;font-size:.875rem;font-weight:600;cursor:pointer;text-decoration:none}
#puente-app-nueva .pa-si{background:#5865f2;color:#fff}
#puente-app-nueva .pa-no{background:transparent;color:#b5bac1}`;
    document.head.appendChild(st);
    document.body.appendChild(box);
  }, 8000);
})();

// Leido en todos lados (leidos.js): lo que se lee en un dispositivo deja de estar en negrita en
// los otros que estan abiertos. Ademas, al volver a la app (o al reconectarse) se pide la cuenta
// del servidor, porque Haven se queda con la suya aunque el servidor ya tenga otra.
(() => {
  let t = 0;
  function aplicar(counts) {
    const a = window.app;
    if (!a || !a.unreadCounts || !counts) return;
    let cambio = false;
    for (const [code, n] of Object.entries(counts)) {
      const antes = a.unreadCounts[code] || 0;
      // el canal que se esta viendo nunca vuelve a negrita por esto (lo lee este mismo dispositivo)
      if (code === a.currentChannel && !document.hidden && n > antes) continue;
      if (antes === n) continue;
      a.unreadCounts[code] = n;
      try { a._updateBadge && a._updateBadge(code); } catch { /* sigue */ }
      cambio = true;
    }
    if (!cambio) return;
    for (const f of ['_updateNestedIndicators', '_updateDmSectionBadge', '_updateTabTitle', '_updateDesktopBadge']) {
      try { if (typeof a[f] === 'function') a[f](); } catch { /* sigue */ }
    }
  }
  function pedir() {
    const s = window.app && window.app.socket;
    if (!s || !s.connected) return;
    s.emit('puente-no-leidos', {}, (r) => { if (r && r.counts) aplicar(r.counts); });
  }
  (function enganchar() {
    const s = window.app && window.app.socket;
    if (!s || !window.app.unreadCounts) { if (++t < 120) setTimeout(enganchar, 1000); return; }
    s.on('puente-leido', (d) => aplicar(d && d.counts));
    s.on('connect', () => setTimeout(pedir, 2500));
    document.addEventListener('visibilitychange', () => { if (!document.hidden) setTimeout(pedir, 800); });
    addEventListener('focus', () => setTimeout(pedir, 800));
    setTimeout(pedir, 5000);
  })();
})();

// Visor de fotos en el celu (puente-visor-borde): al deslizar, Haven corre la foto con el dedo y al
// soltar pasa a la siguiente. En la ultima (o en la primera hacia atras) no hay a donde pasar y la foto
// quedaba corrida a la mitad. Ahi se resiste un poco al arrastrarla, como en Discord, y al soltar
// vuelve a su lugar.
(function () {
  'use strict';
  let t = 0;
  (function enganchar() {
    const app = window.app, lb = document.getElementById('image-lightbox'), img = document.getElementById('lightbox-img');
    if (!app || !lb || !img || !app._iz || typeof app._lightboxNavigate !== 'function' || typeof app._izApply !== 'function') { if (++t < 120) setTimeout(enganchar, 1000); return; }
    // Hacia donde no hay otra foto: 1 despues de la ultima, -1 antes de la primera
    const sinOtra = (dir) => {
      const imgs = typeof app._getLightboxImages === 'function' ? app._getLightboxImages() : [];
      const i = app._lightboxIndex + dir;
      return !(app._lightboxIndex >= 0) || i < 0 || i >= imgs.length;
    };
    const navegar = app._lightboxNavigate;
    app._lightboxNavigate = function (dir) {
      const antes = this._lightboxIndex;
      const r = navegar.apply(this, arguments);
      if (this._lightboxIndex === antes) { try { this._izApply(true); } catch { /* sigue */ } }
      return r;
    };
    // Despues del de Haven (se agrega mas tarde): solo cambia cuanto se corre en el borde
    lb.addEventListener('pointermove', (e) => {
      const g = app._iz && app._iz.gesture;
      if (!g || !g.swiping || g.pinch) return;
      const dx = e.clientX - g.x0;
      if (dx && sinOtra(dx < 0 ? 1 : -1)) img.style.transform = `translateX(${dx / 3}px)`;
    });
  })();
})();

// Reacciones: cuando cambia la cantidad, el numero se mueve como en Discord. Si sube, el que estaba
// se va para arriba y el nuevo entra desde abajo; si baja, al reves. Solo cuando cambia en vivo
// (Haven redibuja la fila de reacciones del mensaje), no al cargar los mensajes. El numero queda
// como texto del boton igual que antes; el viejo es solo un dibujo (::before) mientras se mueve.
(function () {
  'use strict';
  let t = 0;
  const quieto = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  // El texto con el numero del boton (despues del emoji)
  const textoNumero = (b) => [...b.childNodes].reverse().find((n) => n.nodeType === 3 && /\d/.test(n.nodeValue));
  const cantidad = (b) => { const n = b.querySelector(':scope > .puente-rc') || textoNumero(b); const m = n && /\d+/.exec(n.textContent); return m ? +m[0] : 0; };
  function mover(b, antes) {
    const ahora = cantidad(b);
    if (ahora === antes || b.querySelector(':scope > .puente-rc')) return;
    const tx = textoNumero(b);
    if (!tx) return;
    const m = /^(\s*)(\d+)(\s*)$/.exec(tx.nodeValue);
    if (!m) return;
    const rc = document.createElement('span');
    rc.className = 'puente-rc ' + (ahora > antes ? 'puente-rc-sube' : 'puente-rc-baja');
    if (antes > 0) rc.dataset.antes = String(antes);
    const num = document.createElement('span');
    num.textContent = m[2];
    rc.appendChild(num);
    tx.nodeValue = m[1];
    tx.after(rc);
    if (m[3]) rc.after(document.createTextNode(m[3]));
    num.addEventListener('animationend', () => rc.classList.remove('puente-rc-sube', 'puente-rc-baja'), { once: true });
  }
  (function enganchar() {
    const app = window.app;
    if (!app || typeof app._updateMessageReactions !== 'function') { if (++t < 120) setTimeout(enganchar, 1000); return; }
    const original = app._updateMessageReactions;
    app._updateMessageReactions = function (messageId) {
      let antes = null;
      if (!quieto()) {
        try {
          antes = new Map();
          for (const el of document.querySelectorAll(`[data-msg-id="${messageId}"]`)) {
            const c = new Map(); antes.set(el, c);
            for (const b of el.querySelectorAll('.reactions-row .reaction-badge')) c.set(b.dataset.emoji, cantidad(b));
          }
        } catch { antes = null; }
      }
      const r = original.apply(this, arguments);
      // Despues de que se separa el emoji del numero (splitReaction, mas arriba)
      if (antes) setTimeout(() => {
        for (const [el, c] of antes) {
          if (!el.isConnected) continue;
          for (const b of el.querySelectorAll('.reactions-row .reaction-badge')) {
            try { mover(b, c.has(b.dataset.emoji) ? c.get(b.dataset.emoji) : 0); } catch { /* queda sin animar */ }
          }
        }
      }, 0);
      return r;
    };
  })();
})();

// Lo que se escribe queda como se escribio, como en Discord: una linea de solo guiones o guiones
// bajos (Haven la volvia una raya casi invisible y el mensaje parecia vacio) y los asteriscos
// sueltos, separados por espacios (Haven los tomaba como negrita o cursiva y se comia varios:
// "**********" quedaba mas corto). Se cambian por unos caracteres que Haven no toca y se
// devuelven al final. (puente-texto-tal-cual)
(function () {
  'use strict';
  let t = 0;
  const AST = '\uE000', GUION = '\uE001', BAJO = '\uE002';
  const proteger = (str) => str
    .replace(/^([ \t]*)(-{3,}|_{3,})([ \t]*)$/gm, (m, a, r, b) => a + (r[0] === '-' ? GUION : BAJO).repeat(r.length) + b)
    .replace(/(^|\s)(\*+)(?=\s|$)/g, (m, a, r) => a + AST.repeat(r.length));
  const devolver = (html) => html.replace(/\uE000/g, '*').replace(/\uE001/g, '-').replace(/\uE002/g, '_');
  (function enganchar() {
    const app = window.app;
    if (!app || typeof app._formatContent !== 'function') { if (++t < 120) setTimeout(enganchar, 500); return; }
    const original = app._formatContent;
    app._formatContent = function (str) {
      if (typeof str !== 'string' || /[\uE000-\uE002]/.test(str) || !/[-_*]/.test(str)) return original.apply(this, arguments);
      const p = proteger(str);
      if (p === str) return original.apply(this, arguments);
      const out = original.call(this, p);
      return typeof out === 'string' ? devolver(out) : out;
    };
  })();
})();

// Editar un mensaje en el celu como en Discord: el texto pasa al mismo cuadro de escribir, arriba
// aparece "Editando mensaje" con una X para cancelar, el mensaje se marca en el chat y el cambio se
// guarda con el mismo boton de enviar. Por dentro sigue siendo la edicion de Haven (la abre en el
// mensaje, escondida, y al enviar le pasa el texto y aprieta su Guardar), asi que guarda igual que
// siempre: mensajes cifrados, fotos que van juntas, borrar si queda vacio. Lo que se estaba
// escribiendo antes vuelve al terminar. Solo en el chat principal; en hilos y en la ventanita de
// mensajes directos sigue como estaba. (puente-editando)
(function () {
  'use strict';
  if (!matchMedia('(pointer: coarse)').matches) return;
  let t = 0, ed = null;
  const root = document.documentElement;
  function barra() {
    let b = document.getElementById('puente-editando');
    if (b) return b;
    const rb = document.getElementById('reply-bar');
    if (!rb) return null;
    b = document.createElement('div');
    b.id = 'puente-editando';
    b.className = 'reply-bar puente-editando-bar';
    b.style.display = 'none';
    b.innerHTML = '<span class="reply-bar-text">Editando mensaje</span><button type="button" class="reply-bar-close puente-editando-x" aria-label="Cancelar la edición" title="Cancelar">&times;</button>';
    b.querySelector('button').addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); cancelar(); });
    rb.after(b);
    return b;
  }
  const input = () => document.getElementById('message-input');
  function poner(v) {
    const i = input();
    if (!i) return;
    i.value = v;
    i.dispatchEvent(new Event('input', { bubbles: true }));
  }
  // Se termino (guardada, cancelada, el mensaje se redibujo o se cambio de canal)
  function terminar(restaurar) {
    if (!ed) return;
    const e = ed; ed = null;
    try { e.obs.disconnect(); } catch { /* nada */ }
    e.msgEl.classList.remove('puente-editando-msg');
    root.classList.remove('puente-editando');
    const b = document.getElementById('puente-editando');
    if (b) b.style.display = 'none';
    if (restaurar && window.app && window.app.currentChannel === e.canal) poner(e.borrador);
  }
  function cancelar() {
    if (!ed) return;
    const e = ed;
    const btn = e.msgEl.querySelector('.edit-cancel-btn');
    terminar(true);
    if (btn) btn.click();
  }
  function guardar() {
    const e = ed;
    const ta = e.msgEl.querySelector('textarea.edit-textarea');
    const btn = e.msgEl.querySelector('.edit-save-btn');
    const i = input();
    if (!ta || !btn || !i) { terminar(true); return; }
    ta.value = i.value;
    terminar(true);
    btn.click();
  }
  (function enganchar() {
    const app = window.app;
    if (!app || typeof app._startEditMessage !== 'function' || typeof app._sendMessage !== 'function' || !input() || !document.getElementById('reply-bar')) { if (++t < 120) setTimeout(enganchar, 1000); return; }
    const empezar = app._startEditMessage;
    app._startEditMessage = function (msgEl) {
      const enChat = msgEl && msgEl.closest && msgEl.closest('#messages');
      if (!enChat || msgEl.classList.contains('editing')) return empezar.apply(this, arguments);
      if (ed) cancelar();
      const contentEl = msgEl.querySelector('.message-content');
      const antes = contentEl ? contentEl.innerHTML : '';
      const r = empezar.apply(this, arguments);
      const ta = msgEl.querySelector('textarea.edit-textarea');
      if (!ta || !msgEl.classList.contains('editing') || !barra()) return r; // Haven no la abrio (mensaje protegido)
      // Mientras tanto el mensaje se sigue viendo como era (Haven lo vuelve a dibujar al terminar)
      const vista = document.createElement('div');
      vista.className = 'puente-editando-vista';
      vista.innerHTML = antes;
      contentEl.insertBefore(vista, contentEl.firstChild);
      if (this._activeEditTextarea === ta) this._activeEditTextarea = null; // los emojis van al cuadro de abajo
      const i = input();
      ed = { msgEl, canal: this.currentChannel, borrador: i.value, obs: new MutationObserver(() => { if (ed && (!msgEl.isConnected || !msgEl.classList.contains('editing'))) terminar(false); }) };
      ed.obs.observe(msgEl, { attributes: true, attributeFilter: ['class'] });
      ed.obs.observe(msgEl.parentNode || document.body, { childList: true });
      msgEl.classList.add('puente-editando-msg');
      root.classList.add('puente-editando');
      document.getElementById('puente-editando').style.display = '';
      poner(ta.value);
      try { ta.blur(); } catch { /* nada */ }
      i.focus();
      try { i.setSelectionRange(i.value.length, i.value.length); } catch { /* nada */ }
      // El mensaje que se edita queda a la vista (la barra de arriba del cuadro achica el chat)
      const verlo = () => {
        const sc = document.getElementById('messages');
        if (!sc || !msgEl.isConnected) return;
        const r1 = msgEl.getBoundingClientRect(), r2 = sc.getBoundingClientRect();
        if (r1.bottom > r2.bottom) sc.scrollTop += r1.bottom - r2.bottom + 8;
        else if (r1.top < r2.top) sc.scrollTop -= r2.top - r1.top + 8;
      };
      requestAnimationFrame(verlo); setTimeout(verlo, 350); // y otra vez cuando sube el teclado
      return r;
    };
    const enviar = app._sendMessage;
    app._sendMessage = function () {
      if (ed) {
        if (ed.msgEl.isConnected && ed.msgEl.classList.contains('editing') && this.currentChannel === ed.canal) { guardar(); return; }
        terminar(false);
      }
      return enviar.apply(this, arguments);
    };
    // Otro canal: la edicion se deja (como en Discord), sin pisar lo que haya en el cuadro del otro canal
    if (typeof app.switchChannel === 'function') {
      const cambiar = app.switchChannel;
      app.switchChannel = function () {
        if (ed) { const e = ed; terminar(false); const btn = e.msgEl.querySelector('.edit-cancel-btn'); if (btn) btn.click(); if (input()) poner(e.borrador); }
        return cambiar.apply(this, arguments);
      };
    }
  })();
})();

// Mensajes directos: las fotos y videos salen sin la ubicacion, como en los canales. En los canales
// la quita el servidor, pero en un MD el archivo llega cifrado y el servidor no lo puede abrir; asi
// que se quita aca, en el telefono o la PC de quien lo manda, justo antes de cifrarlo. Sin volver a
// comprimir nada (la foto queda igual): JPEG, PNG y WebP pierden los datos de la camara como en
// Haven (src/imageMetadata.js; se deja solo la orientacion); en HEIC y otros con EXIF se borran los
// datos de GPS; en los videos (MP4, MOV) se borra la ubicacion que guarda el telefono. Lo que no se
// reconoce o no se puede leer bien queda como estaba. (puente-md-sin-ubicacion)
var puenteSinUbicacion = (function () {
  'use strict';
  const latin = (b, a, z) => { let t = ''; for (let i = a; i < z && i < b.length; i++) t += String.fromCharCode(b[i]); return t; };
  const cat = (parts) => { let n = 0; for (const p of parts) n += p.length; const o = new Uint8Array(n); let k = 0; for (const p of parts) { o.set(p, k); k += p.length; } return o; };
  const u16be = (b, o) => (b[o] << 8) | b[o + 1];
  const u32be = (b, o) => ((b[o] << 24) >>> 0) + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3];
  const u32le = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16)) + ((b[o + 3] << 24) >>> 0);

  // ── JPEG: fuera APP1 (EXIF, XMP), APP13 (IPTC) y comentarios; la orientacion se vuelve a poner
  function orientacion(seg) {
    if (seg.length < 14 || latin(seg, 0, 6) !== 'Exif\0\0') return 0;
    const t = seg.subarray(6), le = latin(t, 0, 2) === 'II';
    if (!le && latin(t, 0, 2) !== 'MM') return 0;
    const r16 = (o) => (le ? t[o] | (t[o + 1] << 8) : u16be(t, o));
    const r32 = (o) => (le ? u32le(t, o) : u32be(t, o));
    const ifd = r32(4);
    if (ifd + 2 > t.length) return 0;
    const n = r16(ifd);
    for (let i = 0; i < n; i++) {
      const e = ifd + 2 + i * 12;
      if (e + 12 > t.length) return 0;
      if (r16(e) === 0x0112) { const v = r16(e + 8); return v >= 1 && v <= 8 ? v : 0; }
    }
    return 0;
  }
  function app1Orientacion(o) {
    return new Uint8Array([0xFF, 0xE1, 0x00, 0x22, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00, 0x4D, 0x4D, 0x00, 0x2A, 0x00, 0x00, 0x00, 0x08,
      0x00, 0x01, 0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, o, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
  }
  function jpeg(b) {
    if (b[0] !== 0xFF || b[1] !== 0xD8) return null;
    const out = [b.subarray(0, 2)];
    let ori = 0, fuera = false, p = 2;
    while (p + 4 <= b.length) {
      if (b[p] !== 0xFF) return null;
      const m = b[p + 1];
      if (m === 0xFF) { p++; continue; }
      if (m === 0xDA || m === 0xD9) break;
      const len = u16be(b, p + 2);
      if (len < 2 || p + 2 + len > b.length) return null;
      if (m === 0xE1 || m === 0xED || m === 0xFE) {
        if (m === 0xE1 && !ori) ori = orientacion(b.subarray(p + 4, p + 2 + len));
        fuera = true;
      } else out.push(b.subarray(p, p + 2 + len));
      p += 2 + len;
    }
    if (!fuera) return null;
    if (ori > 1) out.splice(out.length > 1 && out[1][1] === 0xE0 ? 2 : 1, 0, app1Orientacion(ori));
    out.push(b.subarray(p));
    return cat(out);
  }
  // ── PNG: fuera eXIf y los textos
  const PNG_FUERA = new Set(['eXIf', 'tEXt', 'iTXt', 'zTXt', 'tIME']);
  function png(b) {
    if (b.length < 8 || latin(b, 0, 8) !== '\x89PNG\r\n\x1a\n') return null;
    const out = [b.subarray(0, 8)];
    let fuera = false, p = 8;
    while (p + 12 <= b.length) {
      const len = u32be(b, p), fin = p + 12 + len;
      if (fin > b.length) return null;
      const tipo = latin(b, p + 4, p + 8);
      if (PNG_FUERA.has(tipo)) fuera = true; else out.push(b.subarray(p, fin));
      p = fin;
      if (tipo === 'IEND') break;
    }
    return fuera ? cat(out) : null;
  }
  // ── WebP: fuera EXIF y XMP
  function webp(b) {
    if (b.length < 12 || latin(b, 0, 4) !== 'RIFF' || latin(b, 8, 12) !== 'WEBP') return null;
    const partes = [];
    let fuera = false, p = 12;
    while (p + 8 <= b.length) {
      const cc = latin(b, p, p + 4), size = u32le(b, p + 4), fin = p + 8 + size + (size & 1);
      if (p + 8 + size > b.length) return null;
      if (cc === 'EXIF' || cc === 'XMP ') fuera = true; else partes.push(b.slice(p, Math.min(fin, b.length)));
      p = fin;
    }
    if (!fuera) return null;
    const x = partes.find((c) => latin(c, 0, 4) === 'VP8X');
    if (x) x[8] &= ~0x0C;
    const cuerpo = cat(partes), hdr = new Uint8Array(12);
    hdr.set([0x52, 0x49, 0x46, 0x46], 0);
    const n = cuerpo.length + 4;
    hdr.set([n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255], 4);
    hdr.set([0x57, 0x45, 0x42, 0x50], 8);
    return cat([hdr, cuerpo]);
  }
  // ── Otros con EXIF (HEIC, TIFF...): se vacia el bloque de GPS ahi mismo, sin mover nada
  const TAM = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8 };
  function gpsTiff(b, base) {
    const le = b[base] === 0x49;
    const r16 = (o) => (le ? b[o] | (b[o + 1] << 8) : u16be(b, o));
    const r32 = (o) => (le ? u32le(b, o) : u32be(b, o));
    const ifd0 = base + r32(base + 4);
    if (ifd0 + 2 > b.length) return false;
    const n = r16(ifd0);
    for (let i = 0; i < n; i++) {
      const e = ifd0 + 2 + i * 12;
      if (e + 12 > b.length) return false;
      if (r16(e) !== 0x8825) continue;
      const g = base + r32(e + 8);
      if (g + 2 > b.length) return false;
      const m = r16(g);
      if (g + 2 + m * 12 > b.length) return false;
      for (let j = 0; j < m; j++) {
        const f = g + 2 + j * 12;
        const largo = (TAM[r16(f + 2)] || 1) * r32(f + 4);
        if (largo > 4) { const o = base + r32(f + 8); if (o + largo <= b.length) b.fill(0, o, o + largo); }
        b.fill(0, f, f + 12);
      }
      return true;
    }
    return false;
  }
  function exifSuelto(b) {
    let cambio = false, desde = 0;
    for (let k = 0; k < 8; k++) {
      let i = -1;
      for (let p = desde; p + 10 <= b.length; p++) {
        if (b[p] === 0x45 && b[p + 1] === 0x78 && b[p + 2] === 0x69 && b[p + 3] === 0x66 && b[p + 4] === 0 && b[p + 5] === 0 &&
            ((b[p + 6] === 0x4D && b[p + 7] === 0x4D && b[p + 8] === 0 && b[p + 9] === 0x2A) || (b[p + 6] === 0x49 && b[p + 7] === 0x49 && b[p + 8] === 0x2A && b[p + 9] === 0))) { i = p; break; }
      }
      if (i < 0) break;
      try { if (gpsTiff(b, i + 6)) cambio = true; } catch { /* sigue */ }
      desde = i + 10;
    }
    return cambio;
  }
  // ── Videos (MP4, MOV, 3GP): la ubicacion vive en moov. El cuadro ©xyz / loci pasa a ser "free"
  // (relleno que los reproductores saltean) con los datos en cero, y la de los iPhone (ISO 6709,
  // "+34.6037-058.3816/") queda en ceros. Mismo tamano: no se mueve nada del video.
  function video(b) {
    if (b.length < 16 || latin(b, 4, 8) !== 'ftyp') return false;
    // Se recorre la estructura (no se buscan bytes sueltos): los cuadros hijos de [a, z)
    const hijos = (a, z) => {
      const out = [];
      let p = a;
      while (p + 8 <= z) {
        let size = u32be(b, p), h = 8;
        if (size === 1) { if (p + 16 > z) break; size = u32be(b, p + 8) * 4294967296 + u32be(b, p + 12); h = 16; }
        else if (size === 0) size = z - p;
        if (size < h || p + size > z) break;
        out.push({ tipo: latin(b, p + 4, p + 8), p, datos: p + h, fin: p + size });
        p += size;
      }
      return out;
    };
    const moov = hijos(0, b.length).find((x) => x.tipo === 'moov');
    if (!moov) return false;
    let cambio = false;
    const borrar = (x) => { b.set([0x66, 0x72, 0x65, 0x65], x.p + 4); b.fill(0, x.datos, x.fin); cambio = true; };
    // La de los iPhone (ISO 6709, "+34.6037-058.3816/") en un cuadro meta: los numeros en cero
    const iso = (x) => {
      const txt = latin(b, x.datos, x.fin);
      const re = /[+-]\d{1,3}\.\d+[+-]\d{1,3}\.\d+(?:[+-]\d+(?:\.\d+)?)?(?:CRS[^/]{0,40})?\//g;
      let m;
      while ((m = re.exec(txt))) {
        for (let k = 0; k < m[0].length; k++) { const ch = m[0].charCodeAt(k); if (ch >= 48 && ch <= 57) b[x.datos + m.index + k] = 0x30; }
        cambio = true;
      }
    };
    const udta = (x) => { for (const y of hijos(x.datos, x.fin)) { if (y.tipo === '\xA9xyz' || y.tipo === 'loci') borrar(y); else if (y.tipo === 'meta') iso(y); } };
    for (const x of hijos(moov.datos, moov.fin)) {
      if (x.tipo === 'udta') udta(x);
      else if (x.tipo === 'meta') iso(x);
      else if (x.tipo === 'trak') for (const y of hijos(x.datos, x.fin)) { if (y.tipo === 'udta') udta(y); else if (y.tipo === 'meta') iso(y); }
    }
    return cambio;
  }
  // Recibe los bytes del archivo y devuelve los mismos o los limpios
  return function (buf) {
    try {
      const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
      const limpio = jpeg(b) || png(b) || webp(b);
      if (limpio) return limpio.buffer.slice(limpio.byteOffset, limpio.byteOffset + limpio.byteLength);
      const copia = new Uint8Array(b);
      if (video(copia) || exifSuelto(copia)) return copia.buffer;
    } catch (err) { console.warn('[puente] ubicacion del archivo:', err); }
    return buf;
  };
})();
(function () {
  'use strict';
  let t = 0;
  (function enganchar() {
    const app = window.app;
    if (!app || typeof app._e2eEncryptBytes !== 'function') { if (++t < 120) setTimeout(enganchar, 500); return; }
    const cifrar = app._e2eEncryptBytes;
    app._e2eEncryptBytes = function (partner, buf) {
      return cifrar.call(this, partner, puenteSinUbicacion(buf));
    };
    document.documentElement.classList.add('puente-md-sin-ubicacion');
  })();
})();

// Mensajes directos ordenados como en Discord: arriba la conversacion con el ultimo mensaje,
// mandado o recibido. Haven tiene ese orden ("recientes") pero viene apagado y sin datos (nunca
// sabe cuando fue el ultimo mensaje): la fecha la da leidos.js al conectarse y despues se pone al
// dia con cada mensaje que llega. Si alguien eligio orden alfabetico en Haven, se respeta.
// (puente-dm-recientes)
(function () {
  'use strict';
  let t = 0, timer = null;
  const modo = () => { try { return localStorage.getItem('haven_dm_sort_mode'); } catch { return null; } };
  const recientes = () => { try { if (modo() !== 'alpha') localStorage.setItem('haven_dm_sort_mode', 'recent'); } catch { /* sin almacenamiento */ } };
  const dms = () => (window.app && Array.isArray(window.app.channels) ? window.app.channels.filter((c) => c && c.is_dm) : []);
  // Primero el que tiene el ultimo mensaje (lo que mira Haven para ordenar)
  const primero = () => dms().reduce((a, c) => (!a || (c.last_activity || 0) > (a.last_activity || 0) ? c : a), null);
  const MEMORIA = 'puente_dm_ultimos';
  let memoria = {};
  try { memoria = JSON.parse(localStorage.getItem(MEMORIA) || '{}') || {}; } catch { memoria = {}; }
  let guardarT = null;
  const anotar = (code, ms) => {
    if (!code || !ms || (memoria[code] || 0) >= ms) return;
    memoria[code] = ms;
    clearTimeout(guardarT);
    guardarT = setTimeout(() => { try { localStorage.setItem(MEMORIA, JSON.stringify(memoria)); } catch { /* sin almacenamiento */ } }, 1000);
  };
  // Lo que ya se sabe, antes de que Haven dibuje
  const completar = () => { for (const c of dms()) { const m = memoria[c.code]; if (m && m > (c.last_activity || 0)) c.last_activity = m; else if (c.last_activity) anotar(c.code, c.last_activity); } };
  const redibujar = () => {
    clearTimeout(timer);
    timer = setTimeout(() => { try { recientes(); window.app._renderChannels(); } catch (err) { console.warn('[puente] orden de los MD:', err); } }, 150);
  };
  function pedir() {
    const app = window.app, so = app && app.socket;
    if (!so || !so.connected) return;
    so.emit('puente-dm-recientes', {}, (r) => {
      if (!r || !r.dms) return;
      let cambio = false;
      for (const c of dms()) {
        const v = r.dms[c.code];
        if (v) anotar(c.code, v);
        if (v && v > (c.last_activity || 0)) { c.last_activity = v; cambio = true; }
      }
      if (cambio) redibujar();
      setTimeout(() => { const l = document.getElementById('dm-list'); if (l) l.classList.add('puente-ordenada'); }, cambio ? 200 : 0);
    });
  }
  (function enganchar() {
    const app = window.app, so = app && app.socket;
    if (!so || typeof app._renderChannels !== 'function' || !Array.isArray(app.channels)) { if (++t < 120) setTimeout(enganchar, 1000); return; }
    recientes();
    // Cada vez que Haven redibuja la lista, ordena por recientes (salvo que se haya elegido alfabetico)
    const dibujar = app._renderChannels;
    // Si Haven volvio a traer la lista de canales, las fechas se perdieron: se piden de nuevo
    let pedido = 0;
    app._renderChannels = function () {
      recientes();
      completar();
      const l = dms();
      if (l.length && !l.some((c) => c.last_activity) && Date.now() - pedido > 5000) { pedido = Date.now(); setTimeout(pedir, 300); }
      return dibujar.apply(this, arguments);
    };
    // Con lo recordado, ya en el orden bueno (sin esperar a las fechas del servidor); la lista se muestra
    // recien ordenada (vincular.js la tiene oculta hasta ahi, o hasta 3 s)
    const mostrar = () => { const l = document.getElementById('dm-list'); if (l) l.classList.add('puente-ordenada'); };
    if (Object.keys(memoria).length && dms().length) { completar(); try { app._renderChannels(); } catch (err) { console.warn('[puente] orden de los MD:', err); } mostrar(); }
    so.on('new-message', (d) => {
      const c = d && dms().find((x) => x.code === d.channelCode);
      if (!c || (d.message && d.message.thread_id)) return;
      const antes = primero();
      c.last_activity = Date.now();
      anotar(c.code, c.last_activity);
      if (antes !== c) redibujar();
    });
    so.on('dm-opened', (d) => {
      const c = d && dms().find((x) => x.code === d.code);
      if (c && !c.last_activity) { c.last_activity = Date.now(); anotar(c.code, c.last_activity); redibujar(); }
    });
    so.on('connect', () => setTimeout(pedir, 1500));
    setTimeout(pedir, 1500);
  })();
})();

// Telefonos plegables (Galaxy Z Fold y otros): si se abre CV Chat con la pantalla grande y despues
// se cierra el telefono, Chrome a veces se queda con el ancho de la pantalla grande y achica todo
// para que entre (se ve la version de PC en chiquito). Cuando la pagina quedo mas ancha que la
// pantalla, o achicada, se le vuelve a pasar a Chrome el ancho de la pantalla para que la acomode,
// como si se abriera de nuevo. Una ventana nunca es mas ancha que la pantalla, y CV Chat no deja
// alejar el zoom, asi que en cualquier otro caso no hace nada. (puente-plegable)
(function () {
  'use strict';
  if (!/Android/i.test(navigator.userAgent)) return;
  const meta = document.querySelector('meta[name="viewport"]');
  if (!meta) return;
  const base = meta.getAttribute('content') || 'width=device-width, initial-scale=1';
  let ocupado = false, ultimo = 0;
  function revisar() {
    if (ocupado || document.hidden) return;
    const vv = window.visualViewport;
    const pantalla = Math.round((screen && screen.width) || 0);
    const ancha = pantalla > 0 && window.innerWidth > pantalla + 8;
    const achicada = !!vv && vv.scale > 0 && vv.scale < 0.95;
    if (!ancha && !achicada) return;
    if (Date.now() - ultimo < 1000) return; // una vez por segundo como mucho
    ultimo = Date.now();
    ocupado = true;
    const ancho = pantalla > 0 ? pantalla : 'device-width';
    meta.setAttribute('content', base.replace(/width=device-width/, 'width=' + ancho).replace(/initial-scale=[\d.]+/, 'initial-scale=1') +
      (/minimum-scale/.test(base) ? '' : ', minimum-scale=1'));
    requestAnimationFrame(() => requestAnimationFrame(() => {
      meta.setAttribute('content', base);
      ocupado = false;
      setTimeout(revisar, 400);
    }));
  }
  const luego = (ms) => () => setTimeout(revisar, ms);
  addEventListener('resize', luego(150));
  if (window.visualViewport) visualViewport.addEventListener('resize', luego(150));
  if (screen.orientation && screen.orientation.addEventListener) screen.orientation.addEventListener('change', luego(300));
  document.addEventListener('visibilitychange', luego(300));
  setInterval(revisar, 2000); // por si Chrome no avisa del cambio
  setTimeout(revisar, 1000);
})();

// En la PC (el navegador o la app de la PC, en Windows, Mac o Linux): nunca el cartel del sistema,
// con su ruido. Alcanza con los sonidos de CV Chat. Sin carteles de mensajes ni de llamadas, y sin
// notificaciones del servidor: la suscripcion de esta PC se borra y no se vuelve a pedir (el
// servidor tampoco la acepta, puente.js). En el celular, todo sigue igual.
// (puente-sin-avisos-pc)
(function () {
  'use strict';
  const ua = navigator.userAgent;
  const tablet = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1; // iPad que dice ser Mac
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua) || tablet) return;
  // Ningun cartel del sistema: ni los de Haven (mensajes, llamadas) ni los de nadie
  if (window.Notification) {
    const N = window.Notification;
    const Mudo = function () { return { close() {}, addEventListener() {}, removeEventListener() {} }; };
    Object.defineProperty(Mudo, 'permission', { get: () => N.permission });
    Mudo.requestPermission = () => Promise.resolve(N.permission);
    try { window.Notification = Mudo; } catch { /* sigue con lo de abajo */ }
  }
  // Sin la seccion de notificaciones push en Ajustes
  const st = document.createElement('style');
  st.textContent = '#section-push{display:none!important}';
  document.head.appendChild(st);
  let t = 0;
  function borrar() {
    const app = window.app, so = app && app.socket;
    if (!so || !so.connected || !navigator.serviceWorker) return;
    navigator.serviceWorker.getRegistration()
      .then((r) => (r ? r.pushManager.getSubscription() : null))
      .then((sub) => {
        if (!sub) return;
        so.emit('push-unsubscribe', { endpoint: sub.endpoint });
        sub.unsubscribe().catch(() => {});
        if (app._pushSubscription) app._pushSubscription = null;
      })
      .catch(() => {});
  }
  (function enganchar() {
    const app = window.app, so = app && app.socket;
    if (!so || typeof app._fireNativeNotification !== 'function') { if (++t < 120) setTimeout(enganchar, 1000); return; }
    app._fireNativeNotification = function () {}; // el sonido ya sono antes (notifications.play)
    app._subscribePush = async function () {
      const tg = document.getElementById('push-notif-enabled'); if (tg) tg.checked = false;
    };
    if (window.havenDesktop && typeof window.havenDesktop.notify === 'function') { try { window.havenDesktop.notify = () => {}; } catch { /* solo lectura */ } }
    so.on('connect', () => setTimeout(borrar, 1500));
    setTimeout(borrar, 1500);
  })();
})();

// Cuenta unica (cuenta.js): la sesion del chat vale tambien para la web y el foro
// (una cookie de todo el dominio). Si se entro desde la web o el foro (?volver= en
// el inicio, login.js), se vuelve ahi. "Salir" sale tambien de la web y del foro.
(function () {
  'use strict';
  const ss = {
    get: k => { try { return sessionStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { sessionStorage.setItem(k, v); } catch { /* */ } },
    del: k => { try { sessionStorage.removeItem(k); } catch { /* */ } },
  };
  let tok = null;
  try { tok = localStorage.getItem('haven_token'); } catch { return; }
  if (!tok) return;
  // Se salio desde la web o el foro despues de entrar al chat: sale tambien del chat
  const salio = document.cookie.match(/(?:^|;\s*)cv_salio=(\d+)/);
  if (salio) {
    let iat = 0;
    try { iat = JSON.parse(atob(tok.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).iat || 0; } catch { /* sin fecha */ }
    if (iat && iat < Number(salio[1])) {
      ['haven_token', 'haven_user', 'haven_sync_key'].forEach(k => { try { localStorage.removeItem(k); } catch { /* */ } });
      location.replace('/');
      return;
    }
  }
  const volver = ss.get('puente_volver');
  fetch('/puente/api/cuenta/sesion', { method: 'POST', headers: { Authorization: 'Bearer ' + tok } }).catch(() => {}).then(() => {
    if (volver) { ss.del('puente_volver'); location.replace(volver); }
  });
  document.addEventListener('click', (e) => {
    if (e.target.closest && e.target.closest('#logout-btn')) ss.set('puente_salio', '1');
  }, true);
})();

// "/foro <texto>" en el cuadro de escribir: busca en el foro (foro-lector.js) sin mandar nada al
// canal. Cada resultado se abre en el foro o se pega su enlace en el mensaje.
(function () {
  'use strict';
  const byId = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const st = el('style');
  st.textContent = '#puente-foro-buscar{position:fixed;inset:0;z-index:10050;display:flex;align-items:flex-start;justify-content:center;padding:8vh 12px 12px;background:rgba(0,0,0,.6)}'
    + '#puente-foro-buscar .pfb{width:100%;max-width:620px;max-height:80vh;display:flex;flex-direction:column;background:var(--bg-secondary,#2b2d31);border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,.5);overflow:hidden}'
    + '#puente-foro-buscar .pfb-cab{display:flex;gap:8px;padding:12px;border-bottom:1px solid rgba(255,255,255,.08)}'
    + '#puente-foro-buscar input{flex:1;min-width:0;padding:10px 12px;border-radius:8px;border:0;background:var(--bg-tertiary,#1e1f22);color:inherit;font:inherit}'
    + '#puente-foro-buscar .pfb-x{border:0;background:none;color:inherit;font-size:22px;cursor:pointer;padding:0 8px}'
    + '#puente-foro-buscar .pfb-lista{overflow:auto;padding:6px}'
    + '#puente-foro-buscar .pfb-item{display:block;padding:10px 12px;border-radius:8px;color:inherit;text-decoration:none}'
    + '#puente-foro-buscar .pfb-item:hover{background:rgba(255,255,255,.06)}'
    + '#puente-foro-buscar .pfb-t{font-weight:700}'
    + '#puente-foro-buscar .pfb-m{font-size:12px;opacity:.7;margin:2px 0 4px}'
    + '#puente-foro-buscar .pfb-x2{font-size:13px;opacity:.85;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}'
    + '#puente-foro-buscar .pfb-pegar{margin-top:6px;font-size:12px;border:0;border-radius:6px;padding:4px 10px;background:var(--accent,#5865f2);color:#fff;cursor:pointer}'
    + '#puente-foro-buscar .pfb-nada{padding:18px;text-align:center;opacity:.75}';
  document.head.appendChild(st);
  const input = () => byId('message-input');
  function cerrar() { const o = byId('puente-foro-buscar'); if (o) o.remove(); }
  async function buscar(q, lista) {
    lista.textContent = '';
    lista.appendChild(el('div', 'pfb-nada', 'Buscando en el foro…'));
    try {
      const r = await fetch('/puente/api/foro/buscar?q=' + encodeURIComponent(q), { headers: { Authorization: 'Bearer ' + (localStorage.getItem('haven_token') || '') } });
      const d = await r.json().catch(() => ({}));
      lista.textContent = '';
      if (!r.ok) { lista.appendChild(el('div', 'pfb-nada', d.error || 'No se pudo buscar.')); return; }
      if (!d.resultados.length) { lista.appendChild(el('div', 'pfb-nada', 'No hay temas del foro con "' + q + '".')); return; }
      for (const t of d.resultados) {
        const a = el('a', 'pfb-item'); a.href = t.url; a.target = '_blank'; a.rel = 'noopener';
        a.appendChild(el('div', 'pfb-t', t.tema));
        a.appendChild(el('div', 'pfb-m', t.canal + ' · ' + t.autor + ' · ' + new Date(t.fecha).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) + (t.respuestas ? ' · ' + t.respuestas + (t.respuestas === 1 ? ' respuesta' : ' respuestas') : '')));
        if (t.texto) a.appendChild(el('div', 'pfb-x2', t.texto));
        const pegar = el('button', 'pfb-pegar', 'Pegar el enlace en el mensaje');
        pegar.type = 'button';
        pegar.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); const i = input(); if (i) { i.value = (i.value ? i.value + ' ' : '') + t.url; i.dispatchEvent(new Event('input', { bubbles: true })); i.focus(); } cerrar(); });
        a.appendChild(pegar);
        lista.appendChild(a);
      }
    } catch { lista.textContent = ''; lista.appendChild(el('div', 'pfb-nada', 'No hay conexión.')); }
  }
  function abrir(q) {
    cerrar();
    const o = el('div'); o.id = 'puente-foro-buscar';
    const box = el('div', 'pfb'), cab = el('form', 'pfb-cab'), campo = el('input'), x = el('button', 'pfb-x', '×'), lista = el('div', 'pfb-lista');
    campo.type = 'search'; campo.placeholder = 'Buscar en el foro'; campo.value = q; x.type = 'button'; x.setAttribute('aria-label', 'Cerrar');
    cab.append(campo, x); box.append(cab, lista); o.appendChild(box); document.body.appendChild(o);
    cab.addEventListener('submit', (e) => { e.preventDefault(); if (campo.value.trim().length >= 2) buscar(campo.value.trim(), lista); });
    x.addEventListener('click', cerrar);
    o.addEventListener('click', (e) => { if (e.target === o) cerrar(); });
    o.addEventListener('keydown', (e) => { if (e.key === 'Escape') cerrar(); });
    if (q.length >= 2) buscar(q, lista); else lista.appendChild(el('div', 'pfb-nada', 'Escribí qué buscar en el foro.'));
    setTimeout(() => campo.focus(), 30);
  }
  window.puenteForoBuscar = { abierto: () => !!byId('puente-foro-buscar'), cerrar };
  let t = 0;
  (function enganchar() {
    const app = window.app;
    if (!app || typeof app._sendMessage !== 'function' || !input()) { if (++t < 120) setTimeout(enganchar, 1000); return; }
    const enviar = app._sendMessage;
    app._sendMessage = function () {
      const i = input();
      const m = i && /^\/foro(?:\s+([\s\S]*))?$/i.exec(i.value.trim());
      if (m) {
        i.value = ''; i.dispatchEvent(new Event('input', { bubbles: true }));
        try { this._hideSlashDropdown && this._hideSlashDropdown(); this._hideMentionDropdown && this._hideMentionDropdown(); } catch { /* */ }
        abrir((m[1] || '').trim());
        return;
      }
      return enviar.apply(this, arguments);
    };
  })();
})();

// Los avisos del foro (foro-servicio.js): un cartelito abajo, que lleva al foro
(function () {
  'use strict';
  const st = document.createElement('style');
  st.textContent = '#puente-aviso-cartel{position:fixed;right:16px;bottom:16px;z-index:10060;display:flex;flex-direction:column;gap:8px;max-width:min(360px,calc(100vw - 32px))}'
    + '#puente-aviso-cartel a{display:block;padding:12px 14px;border-radius:10px;background:var(--bg-secondary,#2b2d31);color:inherit;text-decoration:none;box-shadow:0 8px 28px rgba(0,0,0,.45);border-left:3px solid #ee2d6f;animation:puenteAvisoEntra .25s ease-out}'
    + '#puente-aviso-cartel b{display:block;font-size:13px;margin-bottom:2px}#puente-aviso-cartel span{font-size:12px;opacity:.8;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}'
    + '@keyframes puenteAvisoEntra{from{transform:translateY(12px);opacity:0}}';
  document.head.appendChild(st);
  function mostrar(d) {
    let box = document.getElementById('puente-aviso-cartel');
    if (!box) { box = document.createElement('div'); box.id = 'puente-aviso-cartel'; document.body.appendChild(box); }
    const a = document.createElement('a');
    a.href = d.url || '#'; a.target = '_blank'; a.rel = 'noopener';
    const b = document.createElement('b'); b.textContent = d.title || 'El foro'; a.appendChild(b);
    if (d.body) { const s2 = document.createElement('span'); s2.textContent = d.body; a.appendChild(s2); }
    a.addEventListener('click', () => a.remove());
    box.appendChild(a);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => a.remove(), 9000);
  }
  let t = 0;
  (function enganchar() {
    const s3 = window.app && window.app.socket;
    if (!s3 || typeof s3.on !== 'function') { if (++t < 120) setTimeout(enganchar, 1000); return; }
    s3.on('puente-aviso', mostrar);
  })();
})();

// Los mensajes privados del foro, en CV Chat (foro-servicio.js): son el principio de la misma conversacion.
//  - Con quien tambien tiene la cuenta del foro unida: en su mensaje directo, arriba de todo, lo que se
//    hablaron en el foro (no estaba cifrado) y al final de eso el cartel de que desde ahi esta cifrado.
//  - Con quien tiene solo cuenta del foro: se lee igual, en el chat, pero no hay mensajes privados con esa
//    persona hasta que una su cuenta del foro con CV Chat.
// La lista de mensajes directos, la misma en todo el sistema: solo las conversaciones donde alguna vez hubo
// un mensaje (las que se abrieron y quedaron vacias no aparecen, salvo la que se esta mirando o si se
// hablaron en el foro), y las del foro con quien no tiene conversacion en CV Chat.
// Y /app?mensajes=1 (el boton de mensajes de la barra de la web y del foro) abre los mensajes directos, y
// en la ventanita de mensajes de la web y del foro (barra.js) el chat abre directo la lista.
(function () {
  'use strict';
  const byId = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const token = () => { try { return localStorage.getItem('haven_token') || ''; } catch { return ''; } };
  const fecha = (t) => new Date(t).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const api = (q) => fetch('/puente/api/foro/privados' + q, { headers: { Authorization: 'Bearer ' + token() } }).then(r => r.json()).catch(() => null);
  const chans = () => (window.app && Array.isArray(window.app.channels) ? window.app.channels : []);
  const dmCon = (id) => chans().find(c => c && c.is_dm && !c.is_group && c.dm_target && c.dm_target.id === id);
  const unico = (c) => (c.cuentas.length === 1 && c.cuentas[0]) || null;
  const COLORES = ['#5865f2', '#3ba55d', '#faa61a', '#ed4245', '#eb459e', '#9b59b6', '#1abc9c'];
  const color = (s) => COLORES[[...String(s)].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7) % COLORES.length];
  const AVISO = '⚠️ Estos mensajes son del foro: no están cifrados (el foro los guardaba como texto común).';
  const CIFRADO = '🔒 Desde acá, los mensajes son de CV Chat y están cifrados de punta a punta: solo los pueden leer ustedes dos.';

  const st = el('style');
  st.textContent = '#dm-list .puente-dm-vacio{display:none!important}'
    // (las mismas medidas que las conversaciones del chat, discord-plus.theme.css)
    + '#dm-list .puente-dm-foro{display:flex;align-items:center;cursor:pointer;min-height:2.75rem;gap:.75rem;margin:1px .5rem;padding:.25rem .5rem;border-radius:.375rem}'
    + '#dm-list .puente-dm-foro:hover{background:#29292e}'
    + '#dm-list .puente-dm-foro .channel-name{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.9375rem;font-weight:500;color:#96969e}'
    + '#dm-list .puente-dm-foro:hover .channel-name,#dm-list .puente-dm-foro.active .channel-name{color:#fbfbfb}'
    + '#dm-list .puente-dm-foro .channel-hash{display:none}'
    + '#dm-list .puente-dm-foro .puente-dm-avatar{display:flex;flex-shrink:0;width:2rem;height:2rem;border-radius:50%;overflow:hidden;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:.875rem}'
    + '#dm-list .puente-dm-foro .puente-dm-avatar img{width:100%;height:100%;object-fit:cover}'
    + '#dm-list .puente-dm-foro.active{background:#343338}'
    + '@media (max-width:768px){#dm-list .puente-dm-foro{min-height:3.5rem;gap:.875rem;margin:0;padding:.375rem .75rem;border-radius:0}'
    + '#dm-list .puente-dm-foro .channel-name{font-size:1.0625rem;color:#dbdee1}'
    + '#dm-list .puente-dm-foro .puente-dm-avatar{width:2.5rem;height:2.5rem;font-size:1.0625rem}}'
    + '.puente-dm-foro-tag{flex:0 0 auto;padding:1px 6px;border-radius:4px;background:rgba(255,255,255,.06);color:#96969e;font-size:10px;font-weight:600;letter-spacing:.04em;text-transform:uppercase}'
    + '.puente-foro-hist{padding:8px 0}'
    + '.pfh-aviso,.pfh-cifrado,.pfv-pie{margin:8px 16px;padding:10px 14px;border-radius:8px;border-left:3px solid;font-size:13px;line-height:1.45}'
    + '.pfh-aviso{background:rgba(240,178,50,.08);border-color:#f0b232;color:#e9cd8f}'
    + '.pfh-cifrado{background:rgba(59,165,93,.09);border-color:#3ba55d;color:#a6dcb6}'
    + '.puente-foro-msj{position:relative}.puente-foro-msj+.puente-foro-msj.pfh-sep{margin-top:.75rem}'
    + '.puente-foro-msj .message-avatar{display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;object-fit:cover}'
    + '.puente-foro-msj .pfh-asunto{display:block;margin-bottom:2px;color:#96969e;font-size:12px}'
    + '.puente-foro-msj .pfh-sin-avatar{visibility:hidden}'
    // la linea donde termina lo del foro (sin cifrar)
    + '.pfh-fin{display:flex;align-items:center;gap:10px;margin:18px 16px 10px;color:#e9cd8f;font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;white-space:nowrap}'
    + '.pfh-fin::before,.pfh-fin::after{content:"";flex:1 1 auto;height:1px;background:#f0b232;opacity:.55}'
    // con una clase y no con :has(): ese selector hacia recalcular los estilos de la pagina entera en cada letra
    + '[data-haven-region="main"].puente-con-foro-vista{position:relative}'
    // lo que hay detras (el cuadro de escribir de la conversacion anterior) no se ve ni se toca
    + '[data-haven-region="main"].puente-con-foro-vista > :not(#puente-foro-vista){visibility:hidden!important;pointer-events:none!important}'
    + '#puente-foro-vista{position:absolute;inset:0;z-index:60;display:flex;flex-direction:column;background:#1a1a1e;color:#dbdee1}'
    + '#puente-foro-vista .pfv-cab{flex:0 0 auto;display:flex;align-items:center;gap:10px;min-height:48px;padding:0 16px;border-bottom:1px solid #29292d;font-weight:700;color:#fbfbfb}'
    + '#puente-foro-vista .pfv-volver{display:none;border:0;background:none;color:inherit;font-size:20px;cursor:pointer;padding:0 6px 0 0}'
    + '@media (max-width:768px){#puente-foro-vista .pfv-volver{display:block}}'
    + '#puente-foro-vista .pfv-lista{flex:1 1 auto;overflow-y:auto}'
    + '.pfv-pie{flex:0 0 auto;margin:8px 16px 16px;background:#222327;border-color:#5865f2;color:#b5bac1;font-size:14px}';
  document.head.appendChild(st);

  // ── Los mensajes del foro, con el aspecto de los del chat ──
  const formato = (t) => { try { return window.app && typeof window.app._formatContent === 'function' ? window.app._formatContent(t) : null; } catch { return null; } };
  function avatar(m) {
    const ini = (m.de || '?').trim().charAt(0).toUpperCase();
    const letra = el('div', 'message-avatar', ini); letra.style.backgroundColor = color(m.de);
    if (!m.foto) return letra;
    const i = el('img', 'message-avatar message-avatar-img'); i.src = m.foto; i.alt = ini; i.loading = 'lazy';
    i.addEventListener('error', () => i.replaceWith(letra));
    return i;
  }
  function mensaje(m, prev) {
    const seguido = prev && prev.de === m.de && m.fecha - prev.fecha < 10 * 60 * 1000 && !m.titulo;
    const d = el('div', 'puente-foro-msj' + (seguido ? '' : ' pfh-sep'));
    const row = el('div', 'message-row'), body = el('div', 'message-body');
    const av = avatar(m); if (seguido) av.classList.add('pfh-sin-avatar');
    if (!seguido) {
      const head = el('div', 'message-header');
      const a = el('span', 'message-author', m.de); a.style.color = m.mio ? '#fbfbfb' : color(m.de);
      head.append(a, el('span', 'message-time', fecha(m.fecha)));
      body.appendChild(head);
    }
    const c = el('div', 'message-content');
    if (m.titulo) c.appendChild(el('span', 'pfh-asunto', 'Asunto: ' + m.titulo));
    const html = formato(m.texto);
    if (html != null) { const x = el('div'); x.innerHTML = html; c.appendChild(x); } else { const x = el('div', null, m.texto); x.style.whiteSpace = 'pre-wrap'; c.appendChild(x); }
    body.appendChild(c);
    row.append(av, body); d.appendChild(row);
    return d;
  }
  function historial(mensajes, pie) {
    const box = el('div', 'puente-foro-hist');
    box.appendChild(el('div', 'pfh-aviso', AVISO));
    mensajes.forEach((m, i) => box.appendChild(mensaje(m, mensajes[i - 1])));
    box.appendChild(el('div', 'pfh-fin', 'Hasta acá, los mensajes del foro (sin cifrar)'));
    if (pie) box.appendChild(pie);
    return box;
  }

  // ── En el mensaje directo con alguien que tiene la cuenta del foro unida: el principio de la charla ──
  let actual = null, pedido = 0; // { code, box }
  function poner() {
    const msgs = byId('messages');
    if (!actual) return;
    if (!msgs || !window.app || window.app.currentChannel !== actual.code) { actual.box.remove(); actual = null; return; }
    if (msgs.firstElementChild === actual.box) return;
    const abajo = msgs.scrollHeight - msgs.scrollTop - msgs.clientHeight < 120;
    msgs.insertBefore(actual.box, msgs.firstChild);
    if (abajo) msgs.scrollTop = msgs.scrollHeight;
  }
  async function enConversacion() {
    const app = window.app;
    const ch = app ? chans().find(c => c && c.code === app.currentChannel) : null;
    if (actual && (!ch || actual.code !== ch.code)) { actual.box.remove(); actual = null; }
    if (!ch || !ch.is_dm || ch.is_group || !ch.dm_target || (actual && actual.code === ch.code)) return;
    const yo = ++pedido;
    const d = await api('?con=' + encodeURIComponent(ch.dm_target.id));
    if (yo !== pedido || !d || !d.mensajes || !d.mensajes.length || app.currentChannel !== ch.code) return;
    actual = { code: ch.code, box: historial(d.mensajes, el('div', 'pfh-cifrado', CIFRADO)) };
    actual.box.id = 'puente-foro-historial';
    poner();
  }

  // ── Con quien tiene solo cuenta del foro: la conversacion en el chat, para leer ──
  function cerrarVista() { const v = byId('puente-foro-vista'); if (v) v.remove(); document.querySelectorAll('.puente-con-foro-vista').forEach(n => n.classList.remove('puente-con-foro-vista')); document.querySelectorAll('#dm-list .puente-dm-foro.active').forEach(n => n.classList.remove('active')); }
  // Si la vista se va por otro lado, main deja de esconder lo de atras
  let mainVigilado = null;
  function vigilarMain(main) {
    if (mainVigilado === main) return;
    mainVigilado = main;
    new MutationObserver(() => { if (!byId('puente-foro-vista')) main.classList.remove('puente-con-foro-vista'); }).observe(main, { childList: true });
  }
  function vista(c) {
    const main = document.querySelector('[data-haven-region="main"]');
    if (!main) return;
    cerrarVista();
    const nombre = c.con.join(', ') || 'Vos';
    const v = el('div'); v.id = 'puente-foro-vista';
    const cab = el('div', 'pfv-cab'), volver = el('button', 'pfv-volver', '←');
    volver.type = 'button'; volver.title = 'Mensajes'; volver.addEventListener('click', () => { const m = byId('mobile-menu-btn'); if (m) m.click(); });
    cab.append(volver, el('span', null, '@ ' + nombre), el('span', 'puente-dm-foro-tag', 'foro'));
    const lista = el('div', 'pfv-lista'); lista.appendChild(historial(c.mensajes));
    const quien = c.con.filter((n, i) => !c.cuentas[i]).join(', ') || nombre;
    v.append(cab, lista, el('div', 'pfv-pie', `💬 ${quien} tiene solo cuenta del foro. Los mensajes privados son los de CV Chat: cuando una su cuenta del foro con la de la página (en "Mi cuenta"), pueden seguir hablando acá mismo, con mensajes cifrados.`));
    main.appendChild(v);
    main.classList.add('puente-con-foro-vista'); vigilarMain(main);
    lista.scrollTop = lista.scrollHeight;
    const dh = byId('puente-dm-home'); if (dh) dh.remove();
    const body = byId('app-body'); if (body) body.classList.remove('mobile-sidebar-open');
    visto.marcar(c);
    aplicar();
    const it = document.querySelector(`#dm-list .puente-dm-foro[data-foro="${CSS.escape(c.clave)}"]`); if (it) it.classList.add('active');
  }

  // Cuales del foro ya se vieron (para marcar las que tienen algo nuevo). La primera vez, todas vistas
  const visto = {
    todo() { try { return JSON.parse(localStorage.getItem('puente_foro_visto') || 'null'); } catch { return {}; } },
    guardar(v) { try { localStorage.setItem('puente_foro_visto', JSON.stringify(v)); } catch { /* sin almacenamiento */ } },
    marcar(c) { const v = visto.todo() || {}; const u = c.mensajes[c.mensajes.length - 1]; v[c.clave] = u ? u.fecha : Date.now(); visto.guardar(v); },
    nuevo(c) { const v = visto.todo() || {}; const u = c.mensajes[c.mensajes.length - 1]; return !!(u && !u.mio && u.fecha > (v[c.clave] || 0)); },
    empezar(l) { if (visto.todo()) return; const v = {}; for (const c of l) { const u = c.mensajes[c.mensajes.length - 1]; v[c.clave] = u ? u.fecha : 0; } visto.guardar(v); },
  };

  // ── La lista de mensajes directos ──
  const vacios = new Set(), recien = new Set();
  let foro = [], obs = null;
  function aplicar() {
    const list = byId('dm-list'), app = window.app;
    if (!list || !app) return;
    if (obs) obs.disconnect();
    try {
      const conForo = new Set(foro.map(unico).filter(Boolean));
      for (const it of list.querySelectorAll('.dm-item[data-code]')) {
        const code = it.dataset.code, ch = chans().find(c => c && c.code === code);
        const ocultar = vacios.has(code) && !recien.has(code) && code !== app.currentChannel && !(ch && ch.dm_target && conForo.has(ch.dm_target.id));
        it.classList.toggle('puente-dm-vacio', ocultar);
      }
      // Las del foro que no tienen conversacion en CV Chat, al final de la lista
      const abierta = byId('puente-foro-vista') && (list.querySelector('.puente-dm-foro.active') || {}).dataset;
      list.querySelectorAll('.puente-dm-foro').forEach(n => n.remove());
      for (const c of foro) {
        const id = unico(c);
        if (id && dmCon(id)) continue;
        const nombre = c.con.join(', ') || 'Vos';
        const it = el('div', 'channel-item puente-dm-foro' + (abierta && abierta.foro === c.clave ? ' active' : '')); it.dataset.foro = c.clave;
        it.title = 'Mensajes del foro con ' + nombre;
        const av = el('span', 'puente-dm-avatar');
        const f = c.fotos && c.fotos.length === 1 && c.fotos[0];
        if (f) { const i = el('img'); i.src = f; i.alt = ''; i.loading = 'lazy'; i.addEventListener('error', () => { i.remove(); av.textContent = nombre.charAt(0).toUpperCase(); }); av.appendChild(i); }
        else { av.textContent = c.con.length > 1 ? '👥' : (nombre.trim().charAt(0).toUpperCase() || '?'); av.style.backgroundColor = color(nombre); }
        it.append(av, el('span', 'channel-name', nombre), el('span', 'puente-dm-foro-tag', 'foro'));
        if (visto.nuevo(c)) it.appendChild(el('span', 'channel-badge', '1'));
        it.addEventListener('click', () => abrir(c));
        list.appendChild(it);
      }
    } finally { if (obs) obs.observe(list, { childList: true }); }
  }
  function abrir(c) {
    const id = unico(c);
    // Con cuenta en CV Chat: su mensaje directo (ahi arriba esta lo del foro)
    if (id && window.app && window.app.socket) { cerrarVista(); window.app.socket.emit('start-dm', { targetUserId: id }); return; }
    vista(c);
  }

  function pedir() {
    const app = window.app, so = app && app.socket;
    if (so && so.connected) {
      so.emit('puente-dm-recientes', {}, (r) => {
        if (!r || !Array.isArray(r.vacios)) return;
        vacios.clear(); r.vacios.forEach(c => vacios.add(c));
        aplicar();
      });
    }
    api('').then(d => { if (d && Array.isArray(d.conversaciones)) { visto.empezar(d.conversaciones); foro = d.conversaciones; aplicar(); } });
  }

  let t = 0;
  (function enganchar() {
    const app = window.app, so = app && app.socket, list = byId('dm-list'), msgs = byId('messages');
    if (!so || !list || !msgs || typeof app.switchChannel !== 'function' || !Array.isArray(app.channels)) { if (++t < 120) setTimeout(enganchar, 1000); return; }
    // Cada vez que Haven vuelve a dibujar la lista o los mensajes
    obs = new MutationObserver(() => aplicar());
    obs.observe(list, { childList: true });
    new MutationObserver(poner).observe(msgs, { childList: true });
    so.on('new-message', (d) => { if (d && vacios.delete(d.channelCode)) aplicar(); });
    so.on('dm-opened', (d) => { if (d && d.code) { recien.add(d.code); aplicar(); } });
    so.on('puente-aviso', (a) => { if (a && / en el foro$/.test(a.title || '')) setTimeout(pedir, 500); });
    so.on('connect', () => setTimeout(pedir, 1500));
    setTimeout(pedir, 1200);
    const cambiar = app.switchChannel;
    app.switchChannel = function () {
      cerrarVista();
      const r = cambiar.apply(this, arguments);
      setTimeout(() => { aplicar(); enConversacion(); }, 50);
      return r;
    };
    // Abrir otra cosa (un mensaje directo en la ventanita, los canales, la pantalla de mensajes): se cierra la del foro
    document.addEventListener('click', (e) => {
      if (!byId('puente-foro-vista') || !(e.target instanceof Element)) return;
      if (e.target.closest('#dm-list .dm-item, .server-icon, .puente-rail-btn, #channel-list .channel-item:not(.puente-dm-foro), .puente-dm-home-row')) cerrarVista();
    }, true);
    setTimeout(enConversacion, 800);
    // /app?mensajes=1: abrir los mensajes directos
    const q = new URLSearchParams(location.search);
    if (q.get('mensajes')) {
      history.replaceState(null, '', location.pathname);
      setTimeout(() => { const b = document.querySelector('.puente-pc-dm, .puente-rail-dm'); if (b) b.click(); }, 1500);
    }
  })();

  // ── En la ventanita de mensajes de la web y del foro ──
  if (window.name === 'cv-ventana' && window.top !== window) {
    document.documentElement.classList.add('puente-ventana');
    // Solo los mensajes: la lista ocupa toda la ventanita (sin servidores, canales ni la barra de abajo), y
    // detras nunca se ve un canal: el lugar de la conversacion solo aparece con un mensaje directo abierto
    const v = el('style');
    v.textContent = 'html.puente-ventana #puente-rail,html.puente-ventana .sidebar-bottom,html.puente-ventana .sidebar-resize-handle,html.puente-ventana .channel-header #search-container{display:none!important}'
      + 'html.puente-ventana .sidebar{padding-left:0!important;width:100%!important;max-width:none!important}'
      + 'html.puente-ventana:not(.pv-conv) [data-haven-region="main"]{visibility:hidden}';
    document.head.appendChild(v);
    const enDm = () => { const a = window.app, ch = a && chans().find(c => c && c.code === a.currentChannel); return !!(ch && ch.is_dm) || !!byId('puente-foro-vista'); };
    // Sin un mensaje directo abierto, la lista queda a la vista
    const mantener = () => {
      const dm = enDm(), body = byId('app-body');
      document.documentElement.classList.toggle('pv-conv', dm);
      if (!dm && body && !body.classList.contains('mobile-sidebar-open')) { const m = byId('mobile-menu-btn'); if (m) m.click(); }
    };
    let toque = 0;
    document.addEventListener('pointerdown', (e) => { if (e.isTrusted) toque = Date.now(); }, true);
    let tv = 0;
    (function vigilar() {
      const app = window.app, body = byId('app-body');
      if (!app || typeof app.switchChannel !== 'function' || !body) { if (++tv < 120) setTimeout(vigilar, 500); return; }
      new MutationObserver(() => setTimeout(mantener, 0)).observe(body, { attributes: true, attributeFilter: ['class'] });
      const cambiar = app.switchChannel;
      app.switchChannel = function (code) {
        // Un canal (un enlace en un mensaje): en el chat completo, en otra pestaña
        const ch = chans().find(c => c && c.code === code);
        if (ch && !ch.is_dm && Date.now() - toque < 1500) { window.open(location.origin + '/app?channel=' + encodeURIComponent(code), '_blank', 'noopener'); return; }
        const r = cambiar.apply(this, arguments);
        setTimeout(mantener, 80);
        return r;
      };
      setInterval(mantener, 1500);
    })();
    // Los mensajes directos, y la lista de conversaciones (no la ultima abierta), como un mensajero.
    // Se insiste hasta que se ven (el chat termina de armarse de a poco)
    let n = 0, toco = false;
    // (si la persona ya empezo a usarlo, se deja de insistir)
    ['pointerdown', 'keydown'].forEach(e => document.addEventListener(e, (ev) => { if (ev.isTrusted) toco = true; }, { capture: true, once: true }));
    // Hasta que esta la lista de mensajes la ventanita no se ve (el servidor la manda escondida):
    // asi no aparece el chat entero un segundo
    const mostrar = () => document.documentElement.classList.add('puente-ventana-lista');
    (function mensajes() {
      if (toco) { mostrar(); return; }
      const app = window.app, side = document.querySelector('.sidebar'), body = byId('app-body');
      const listo = side && side.classList.contains('puente-ver-dms') && (!byId('mobile-menu-btn') || !byId('mobile-menu-btn').offsetParent || (body && body.classList.contains('mobile-sidebar-open')));
      if (listo) mostrar();
      if (listo && n > 3) return;
      if (app && side) {
        if (!side.classList.contains('puente-ver-dms')) { const b = document.querySelector('.puente-rail-dm') || document.querySelector('.puente-pc-dm'); if (b) b.click(); }
        else if (body && !body.classList.contains('mobile-sidebar-open')) { const m = byId('mobile-menu-btn'); if (m && m.offsetParent) m.click(); }
      }
      if (++n < 40) setTimeout(mensajes, 700); else mostrar();
    })();
  }
})();
// El cifrado de los mensajes directos para todos, sin que nadie tenga que hacer nada (cifrado.js):
//  - Quien no tiene claves (entro con Discord, con el foro o desde la pagina, sin escribir la contraseña):
//    se le crean en su dispositivo, protegidas con un secreto al azar que queda solo en sus dispositivos.
//  - Un dispositivo nuevo recibe ese secreto de otro de sus dispositivos abiertos, cifrado para el (el
//    servidor solo lo pasa de uno al otro, sin poder leerlo). Si no hay otro abierto, se reintenta solo.
//  - Ningun mensaje directo sale sin cifrar: si la otra persona todavia no tiene claves, el mensaje queda
//    esperando en este dispositivo y se manda cifrado apenas ella entra; a ella le llega el aviso.
(function () {
  'use strict';
  const byId = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const ls = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } } };
  const b64 = (buf) => { let s = ''; for (const b of new Uint8Array(buf)) s += String.fromCharCode(b); return btoa(s); };
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const hex = (u8) => Array.from(u8, (b) => b.toString(16).padStart(2, '0')).join('');
  const ECDH = { name: 'ECDH', namedCurve: 'P-256' };
  const app = () => window.app;
  const listo = () => !!(app() && app().e2e && app().e2e.ready);
  const secreto = () => { const a = app(); const s = (a && a._e2eWrappingKey) || ls.get('haven_sync_key'); return /^[0-9a-f]{64}$/.test(s || '') ? s : null; };
  const chans = () => (app() && Array.isArray(app().channels) ? app().channels : []);

  const st = el('style');
  st.textContent = '.puente-espera{margin:8px 16px;padding:10px 14px;border-radius:8px;border-left:3px solid #faa61a;background:rgba(250,166,26,.08);color:#e9cd8f;font-size:13px;line-height:1.45}'
    + '.puente-espera .pe-msj{display:flex;gap:8px;align-items:flex-start;margin-top:6px;padding:6px 8px;border-radius:6px;background:rgba(0,0,0,.18);color:#dbdee1;font-size:14px;white-space:pre-wrap;word-break:break-word}'
    + '.puente-espera .pe-msj span{flex:1}.puente-espera .pe-x{border:0;background:none;color:#96969e;font-size:16px;cursor:pointer;padding:0 2px}'
    + '.puente-llave-aviso{margin:8px 16px;padding:10px 14px;border-radius:8px;border-left:3px solid #5865f2;background:#222327;color:#b5bac1;font-size:13px;line-height:1.45}'
    + '.puente-llave-aviso button{margin-top:6px;border:0;background:none;padding:0;color:#949cf7;font:inherit;text-decoration:underline;cursor:pointer}'
    // (la ventana "Contraseña requerida" de Haven no se muestra nunca: ver "Sin la contraseña", abajo)
    + '#e2e-password-modal{display:none!important}';
  document.head.appendChild(st);

  // ── Las claves ──
  // bloqueado: este dispositivo tiene claves viejas (distintas de las del servidor) y Haven iba a pedir
  // la contraseña para bajar las nuevas. Hasta que llegan, nada se manda con las viejas.
  let bloqueado = false;
  async function coinciden() {
    const a = app();
    try {
      const probe = await new window.HavenE2E()._fetchBackupWithState(a.socket);
      if (probe.status !== 'present' || !probe.serverPublicKey) return true;
      const mia = await crypto.subtle.exportKey('jwk', a.e2e._keyPair.publicKey);
      return !mia || mia.x === probe.serverPublicKey.x;
    } catch { return true; }
  }
  async function iniciar(secretoHex) {
    try { sessionStorage.setItem('haven_e2e_wrap', secretoHex); } catch { /* sin almacenamiento */ }
    const antes = bloqueado;
    bloqueado = false;
    try { await app()._initE2E(); } catch (err) { console.warn('[puente] cifrado:', err); }
    if (listo() && antes && !bloqueado && !(await coinciden())) bloqueado = true;
    const ok = listo() && !bloqueado;
    if (ok) { ls.set('haven_sync_key', secretoHex); esperandoOtro = false; quitarAvisoLlave(); setTimeout(mandarEsperando, 500); }
    else if (antes) bloqueado = true;
    return ok;
  }
  let asegurando = false, esperandoOtro = false;
  async function asegurar() {
    const a = app();
    if (asegurando || !a || !a.socket || !a.socket.connected || typeof a._initE2E !== 'function' || typeof window.HavenE2E === 'undefined') return;
    if (listo() && !bloqueado) { esperandoOtro = false; return; }
    if (bloqueado) { esperandoOtro = true; await pedirLlave().catch(() => {}); mostrarAvisoLlave(); return; }
    asegurando = true;
    try {
      // Este dispositivo ya tenia el secreto
      const s = secreto();
      if (s && await iniciar(s)) return;
      // ¿Hay claves de esta cuenta en algun lado?
      const probe = await new window.HavenE2E()._fetchBackupWithState(a.socket).catch(() => ({ status: 'unknown' }));
      if (probe.status === 'none') {
        // La primera vez: las claves se crean aca, con un secreto al azar que no sale de sus dispositivos
        await iniciar(hex(crypto.getRandomValues(new Uint8Array(32))));
      } else if (probe.status === 'present') {
        // Ya tiene claves (de otro dispositivo): se las pide a ese
        esperandoOtro = true;
        await pedirLlave();
        mostrarAvisoLlave();
      }
    } finally { asegurando = false; }
  }

  // ── Pasar el secreto entre los dispositivos de la misma cuenta (cifrado para el que lo pide) ──
  let efimera = null;
  async function pedirLlave() {
    efimera = await crypto.subtle.generateKey(ECDH, true, ['deriveKey']);
    app().socket.emit('puente-llave-pedir', { pub: await crypto.subtle.exportKey('jwk', efimera.publicKey) });
  }
  async function claveCon(mia, suPub, uso) {
    const otra = await crypto.subtle.importKey('jwk', suPub, ECDH, false, []);
    return crypto.subtle.deriveKey({ name: 'ECDH', public: otra }, mia, { name: 'AES-GCM', length: 256 }, false, [uso]);
  }
  async function alPedido(d) {
    const s = secreto();
    if (!listo() || bloqueado || !s || !d || !d.de || !d.pub) return;
    try {
      const mia = await crypto.subtle.generateKey(ECDH, true, ['deriveKey']);
      const k = await claveCon(mia.privateKey, d.pub, 'encrypt');
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, new TextEncoder().encode(s));
      app().socket.emit('puente-llave-dar', { para: d.de, pub: await crypto.subtle.exportKey('jwk', mia.publicKey), iv: b64(iv), ct: b64(ct) });
    } catch (err) { console.warn('[puente] cifrado: no se pudo pasar la clave:', err); }
  }
  async function alRecibir(d) {
    if (!efimera || !d) return;
    try {
      const k = await claveCon(efimera.privateKey, d.pub, 'decrypt');
      const s = new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(d.iv) }, k, unb64(d.ct)));
      if (!/^[0-9a-f]{64}$/.test(s)) return;
      efimera = null;
      if (await iniciar(s)) esperandoOtro = false;
    } catch (err) { console.warn('[puente] cifrado: no se pudo usar la clave recibida:', err); }
  }

  // Sin otro dispositivo abierto: el aviso en la conversacion (y empezar de cero, si ya no hay otro)
  function quitarAvisoLlave() { document.querySelectorAll('.puente-llave-aviso').forEach(n => n.remove()); }
  function mostrarAvisoLlave() {
    const a = app(), msgs = byId('messages');
    const ch = a && chans().find(c => c && c.code === a.currentChannel);
    if (!esperandoOtro || (listo() && !bloqueado) || !msgs || !ch || !ch.is_dm || msgs.querySelector('.puente-llave-aviso')) return;
    const box = el('div', 'puente-llave-aviso', '🔐 Para ver tus mensajes privados acá, abrí CV Chat un momento en otro celular o compu donde ya lo usás (o entrá con tu contraseña de CV Chat). Se pasan solos.');
    const cero = el('button', null, '¿Ya no tenés otro? Empezar de cero en este');
    cero.type = 'button';
    cero.addEventListener('click', async () => {
      if (!confirm('Se crean claves nuevas en este dispositivo. Los mensajes privados cifrados de antes no se van a poder leer más. ¿Seguir?')) return;
      cero.disabled = true;
      try {
        const nuevo = hex(crypto.getRandomValues(new Uint8Array(32)));
        const e = a.e2e || new window.HavenE2E();
        if (!a.e2e) await e._openDB();
        await e.resetKeys(a.socket, nuevo);
        await e.publishKey(a.socket, true).catch(() => {});
        ls.set('haven_sync_key', nuevo);
        esperandoOtro = false;
        await iniciar(nuevo);
      } catch (err) { console.warn('[puente] cifrado: no se pudo empezar de cero:', err); cero.disabled = false; }
    });
    box.appendChild(el('br')); box.appendChild(cero);
    msgs.appendChild(box);
  }

  // ── Los mensajes que esperan a que la otra persona tenga claves ──
  const clave = () => 'puente_pm_espera:' + ((app() && app().user && app().user.id) || '');
  const leerEspera = () => { try { return JSON.parse(ls.get(clave()) || '[]'); } catch { return []; } };
  const guardarEspera = (l) => ls.set(clave(), JSON.stringify(l));
  let captura = null, encolado = false;

  async function socio(ch) {
    const a = app();
    let p = a._getE2EPartnerFor(ch.code);
    if (!p && listo() && ch.dm_target) {
      try { const jwk = await a.e2e.requestPartnerKey(a.socket, ch.dm_target.id); if (jwk) { a._dmPublicKeys[ch.dm_target.id] = jwk; p = a._getE2EPartnerFor(ch.code); } } catch { /* sin clave */ }
    }
    return p;
  }
  async function mandarEsperando() {
    const a = app();
    if (!a || !a.socket || !a.socket.connected || !listo() || bloqueado) return;
    const l = leerEspera();
    if (!l.length) return;
    const quedan = [];
    for (const m of l) {
      const ch = chans().find(c => c && c.code === m.code);
      if (!ch) continue; // ya no esta esa conversacion
      const p = await socio(ch);
      if (!p) { quedan.push(m); continue; }
      try {
        const content = await a._e2eEncryptText(p, m.texto);
        a.socket.emit('send-message', { code: m.code, content, encrypted: true, replyTo: m.reply || null });
      } catch (err) { console.warn('[puente] cifrado: no se pudo mandar uno que esperaba:', err); quedan.push(m); }
    }
    guardarEspera(quedan);
    pintarEspera();
  }
  function pintarEspera() {
    const a = app(), msgs = byId('messages');
    if (!a || !msgs) return;
    msgs.querySelectorAll('.puente-espera').forEach(n => n.remove());
    const ch = chans().find(c => c && c.code === a.currentChannel);
    const mios = leerEspera().filter(m => ch && m.code === ch.code);
    if (!mios.length) return;
    const nombre = (ch.dm_target && ch.dm_target.username) || 'la otra persona';
    const box = el('div', 'puente-espera', `⏳ ${nombre} todavía no entró a CV Chat desde que los mensajes privados son cifrados. ${mios.length === 1 ? 'Este mensaje se manda' : 'Estos mensajes se mandan'} cifrado${mios.length === 1 ? '' : 's'} apenas entre (ya le avisamos por email y con una notificación).`);
    for (const m of mios) {
      const r = el('div', 'pe-msj'); r.appendChild(el('span', null, m.texto));
      const x = el('button', 'pe-x', '×'); x.type = 'button'; x.title = 'No mandarlo';
      x.addEventListener('click', () => { guardarEspera(leerEspera().filter(z => z.id !== m.id)); pintarEspera(); });
      r.appendChild(x); box.appendChild(r);
    }
    msgs.appendChild(box);
    msgs.scrollTop = msgs.scrollHeight;
  }

  // ── Sin la contraseña: Haven nunca muestra "Contraseña requerida" (quien entra con Discord, el foro
  // o la pagina no la sabe). Cuando la iba a pedir, el secreto se pide a los otros dispositivos de la
  // cuenta, como en un dispositivo nuevo, y en los mensajes privados queda el aviso de siempre.
  // Tampoco sus avisos que piden la contraseña.
  function sinContrasena(a) {
    a._e2ePwPendingAction = null; a._e2eResetPending = false;
    bloqueado = true; esperandoOtro = true;
    if (a.socket && a.socket.connected) pedirLlave().catch(() => {});
    setTimeout(mostrarAvisoLlave, 300);
  }
  let tc = 0;
  (function tapar() {
    const a = app();
    if (!a || typeof a._showE2EPasswordModal !== 'function') { if (++tc < 2400) setTimeout(tapar, 50); return; }
    a._showE2EPasswordModal = function () { try { sinContrasena(this); } catch (err) { console.warn('[puente] cifrado:', err); } };
    const tx = (k) => { try { return typeof window.t === 'function' ? window.t(k) : null; } catch { return null; } };
    const callar = ['platform.e2e.keys_changed', 'platform.e2e.errors.bad_password', 'platform.e2e.errors.no_password'].map(tx).filter(Boolean);
    const toast = a._showToast;
    if (typeof toast === 'function') a._showToast = function (msg) { if (typeof msg === 'string' && callar.includes(msg)) return; return toast.apply(this, arguments); };
    // Si ya se habia abierto antes de esto
    const m = byId('e2e-password-modal');
    if (m && m.style.display === 'flex') { m.style.display = 'none'; sinContrasena(a); }
  })();

  let t = 0;
  (function enganchar() {
    const a = app();
    if (!a || !a.socket || typeof a._dmSendGateAsk !== 'function' || typeof a._sendMessage !== 'function' || !byId('messages')) { if (++t < 120) setTimeout(enganchar, 1000); return; }
    // Nada sale sin cifrar: sin la clave de la otra persona (o sin las propias todavia), el texto espera
    const preguntar = a._dmSendGateAsk;
    a._dmSendGateAsk = async function (ch) {
      const p = ch && !bloqueado ? await socio(ch) : null;
      if (p) return preguntar.apply(this, arguments);
      if (ch && !ch.is_group && captura && captura.code === ch.code && captura.texto) {
        const l = leerEspera();
        l.push({ id: Date.now() + '-' + Math.random().toString(36).slice(2, 8), code: ch.code, texto: captura.texto, reply: captura.reply, t: Date.now() });
        guardarEspera(l);
        encolado = true;
        if (!listo() || bloqueado) asegurar(); else this.socket.emit('puente-pm-espera', { code: ch.code }, () => {});
        setTimeout(pintarEspera, 50);
      } else if (typeof this._showToast === 'function') {
        this._showToast(listo() && !bloqueado ? 'Las fotos y archivos se pueden mandar cuando la otra persona entre a CV Chat (sus mensajes privados son cifrados).' : 'Un momento: se están preparando tus mensajes cifrados en este dispositivo.', 'info');
      }
      return null;
    };
    const enviar = a._sendMessage;
    a._sendMessage = async function () {
      const i = byId('message-input');
      captura = { code: this.currentChannel, texto: i ? i.value.trim() : '', reply: this.replyingTo ? this.replyingTo.id : null };
      try { return await enviar.apply(this, arguments); }
      finally {
        if (encolado && i) { i.value = ''; i.dispatchEvent(new Event('input', { bubbles: true })); if (typeof this._clearReply === 'function') this._clearReply(); }
        encolado = false; captura = null;
      }
    };
    a.socket.on('puente-llave-pedido', alPedido);
    a.socket.on('puente-llave-recibida', alRecibir);
    a.socket.on('connect', () => setTimeout(() => { asegurar(); if (esperandoOtro && (!listo() || bloqueado)) pedirLlave().catch(() => {}); mandarEsperando(); }, 2500));
    // Al cambiar de conversacion: lo que espera y el aviso
    const cambiar = a.switchChannel;
    a.switchChannel = function () { const r = cambiar.apply(this, arguments); setTimeout(() => { pintarEspera(); quitarAvisoLlave(); mostrarAvisoLlave(); }, 300); return r; };
    new MutationObserver(() => {
      const msgs = byId('messages');
      if (!msgs) return;
      const e = msgs.querySelector('.puente-espera');
      if (leerEspera().length && (!e || e !== msgs.lastElementChild)) { if (e) msgs.appendChild(e); else pintarEspera(); }
    }).observe(byId('messages'), { childList: true });
    // Despues de que el chat intento lo suyo con el cifrado
    setTimeout(asegurar, 6000);
    setInterval(() => { asegurar(); mandarEsperando(); if (esperandoOtro && !listo()) pedirLlave().catch(() => {}); }, 45000);
    setTimeout(mandarEsperando, 9000);
  })();
})();
// El foro adentro de CV Chat: un boton debajo del Marketplace y los Juegos (en la columna de la izquierda)
// lo abre aca mismo, como esas dos paginas. El foro se ve sin la barra de la web (barra.js lo reconoce por
// el nombre "cv-foro"); "Mensajes" del foro abre los mensajes directos de aca. En la misma ventana se ven
// la wiki, Full Fat Search y el resto de la web (los enlaces del foro, de la web y de los mensajes), y lo
// que en esas paginas lleva al chat se abre aca sin recargar: un canal o un mensaje, o #circulo-vicioso.
(function () {
  'use strict';
  const byId = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const DOM = location.hostname.replace(/^chat\./, '');
  const FORO = 'https://foro.' + DOM, WEB = 'https://' + DOM, WWW = 'https://www.' + DOM;
  const nuestro = (o) => o === FORO || o === WEB || o === WWW;
  // La wiki, Full Fat Search y el inicio de la web (los que se abren aca desde un mensaje)
  const deLaWeb = (u) => (u.origin === WEB || u.origin === WWW) && /^\/(?:$|wiki(?:-categorias)?(?:\/|$)|full-fat-search(?:\/|$))/.test(u.pathname);
  const mobile = () => window.matchMedia('(max-width: 768px)').matches;
  const ICONO = '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path fill="currentColor" d="M4 3h11a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H9l-4 3.5V14H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm15 5h1a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-1v3l-3.5-3H11a2 2 0 0 1-2-2v-1h6a4 4 0 0 0 4-4V8Z"/></svg>';
  const st = el('style');
  st.textContent = '#puente-foro-app{display:flex;flex-direction:column;overflow:hidden}#puente-foro-app[hidden]{display:none}'
    + '#puente-foro-app .jg-head a{color:#b5bac1;font-size:.875rem;text-decoration:none;padding:0 .5rem}#puente-foro-app .jg-head a:hover{color:#fff}'
    + '#puente-foro-app iframe{flex:1 1 auto;width:100%;border:0;background:#1a191e}'
    + '#server-bar .puente-fo-btn:hover,#server-bar .puente-fo-btn.active{background:#5865f2;color:#fff;border-radius:16px}'
    + '#puente-rail .puente-fo-btn{color:#dbdee1}#puente-rail .puente-fo-btn.active{background:#5865f2;color:#fff}'
    // Con su icono propio: redondo y sin fondo, como el Marketplace y los Juegos
    + '.puente-fo-btn.con-icono,#server-bar .puente-fo-btn.con-icono,.puente-pc-dm.con-icono,#server-bar .puente-pc-dm.con-icono,.puente-rail-dm.con-icono{background:transparent!important;border-radius:50%!important;padding:0}';
  document.head.appendChild(st);

  let page = null;
  const abierto = () => !!(page && !page.hidden);
  function cerrar() {
    if (page) page.hidden = true;
    document.querySelectorAll('.puente-fo-btn').forEach(b => b.classList.remove('active'));
  }
  // ruta: del foro ("/node/123") o una direccion entera del foro o de la web
  function abrir(ruta) {
    let dir = null;
    if (ruta && /^https:\/\//.test(ruta)) { try { const u = new URL(ruta); if (nuestro(u.origin)) dir = u.href; } catch { /* no */ } if (!dir) return; }
    else if (ruta) dir = FORO + ruta;
    // (el boton del foro, con la web a la vista: el foro)
    else if (page && page.dataset.web) dir = FORO + '/';
    // Una sola pagina de las de la izquierda a la vez
    try { if (window.puenteJuegos && window.puenteJuegos.abierto()) { let n = 0; while (window.puenteJuegos.abierto() && n++ < 20) window.puenteJuegos.atras(); } } catch { /* sigue */ }
    try { if (window.puenteMercado && window.puenteMercado.abierto()) { let n = 0; while (window.puenteMercado.abierto() && n++ < 20) window.puenteMercado.atras(); } } catch { /* sigue */ }
    if (!page) {
      page = el('div', 'puente-jg'); page.id = 'puente-foro-app';
      const head = el('div', 'jg-head');
      const x = el('button', 'jg-icono'); x.type = 'button'; x.setAttribute('aria-label', 'Cerrar');
      x.innerHTML = '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path fill="currentColor" d="M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7 2.9 18.3 9.2 12 2.9 5.7l1.4-1.4 6.3 6.3 6.3-6.3z"/></svg>';
      x.addEventListener('click', cerrar);
      const afuera = el('a', null, 'Abrir en el navegador ↗'); afuera.href = FORO + '/'; afuera.target = '_blank'; afuera.rel = 'noopener';
      head.append(x, el('div', 'jg-titulo', 'Foro'), afuera);
      const marco = el('iframe'); marco.name = 'cv-foro'; marco.title = 'Foro'; marco.src = dir || FORO + '/';
      page.append(head, marco);
      document.body.appendChild(page);
    } else if (dir) page.querySelector('iframe').src = dir;
    if (dir) titular(dir.startsWith(FORO) ? 'Foro' : 'Círculo Vicioso', dir);
    const bar = byId('server-bar');
    page.style.left = !mobile() && bar ? Math.round(bar.getBoundingClientRect().right) + 'px' : '0';
    page.hidden = false;
    document.querySelectorAll('.puente-fo-btn').forEach(b => b.classList.add('active'));
  }
  // El titulo de arriba y "Abrir en el navegador": lo que se esta viendo (lo dice la pagina, barra.js)
  function titular(t, url) {
    if (!page) return;
    const tt = page.querySelector('.jg-titulo'), a = page.querySelector('.jg-head a'), m = page.querySelector('iframe');
    if (tt && t) tt.textContent = t;
    if (m && t) m.title = t;
    if (a && url) a.href = url;
    if (url) page.dataset.web = url.startsWith(FORO) ? '' : '1';
  }
  // Lo que lleva al chat: un canal o un mensaje (los enlaces de siempre); si no, #círculo-vicioso
  function alChat(url) {
    cerrar();
    const app = window.app;
    if (!app) return;
    let u = null; try { u = new URL(url); } catch { /* el canal de siempre */ }
    if (u && u.origin === location.origin && /^\/app/.test(u.pathname) && (u.searchParams.get('channel') || u.searchParams.get('message'))) {
      try { if (window.puenteEnlaces && window.puenteEnlaces.abrir(u.href)) return; } catch { /* abajo */ }
    }
    try { if (document.getElementById('app-body')?.classList.contains('mobile-sidebar-open')) app._closeMobilePanels?.(); } catch { /* sigue */ }
    const ch = (app.channels || []).find(c => c && !c.is_dm && String(c.name).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase() === 'circulo-vicioso');
    if (ch && app.currentChannel !== ch.code) app.switchChannel(ch.code);
  }
  window.puenteForo = { abierto, abrir, cerrar };

  function botones() {
    const mk = (cls) => {
      const b = el('button', cls + ' puente-fo-btn'); b.type = 'button'; b.title = 'Foro'; b.setAttribute('aria-label', 'Foro');
      b.innerHTML = ICONO;
      // el icono propio del foro (/puente/icono-foro.webp, no va al repositorio); si no esta, el dibujo
      { const im = el('img', 'puente-ico-img'); im.alt = ''; im.draggable = false; im.addEventListener('load', () => { b.querySelector('svg')?.remove(); b.classList.add('con-icono'); b.prepend(im); }); im.src = '/puente/icono-foro.webp?v=1'; }
      b.addEventListener('click', (e) => { e.stopPropagation(); if (abierto()) cerrar(); else abrir(); });
      return b;
    };
    const after = (a, b, c) => document.querySelector(a) || document.querySelector(b) || document.querySelector(c);
    const r = after('#puente-rail .puente-jg-btn', '#puente-rail .puente-mk-btn', '#puente-rail .puente-rail-server');
    if (r && !document.querySelector('#puente-rail .puente-fo-btn')) r.after(mk('puente-rail-btn'));
    const s = after('#server-bar .puente-jg-btn', '#server-bar .puente-mk-btn', '#server-bar #home-server');
    if (s && !document.querySelector('#server-bar .puente-fo-btn')) s.after(mk('server-icon'));
    return !!(r || s);
  }
  let t = 0;
  (function esperar() {
    if (window.name === 'cv-ventana' || !botones()) { if (window.name !== 'cv-ventana' && ++t < 120) setTimeout(esperar, 1000); return; }
    setInterval(botones, 2000);
    // Otra cosa de la izquierda (mensajes, el servidor, el Marketplace, los Juegos) o cambiar de canal: se cierra
    document.addEventListener('click', (e) => {
      if (abierto() && e.target instanceof Element && e.target.closest('.puente-pc-dm, #home-server, #puente-rail .puente-rail-dm, #puente-rail .puente-rail-server, .puente-mk-btn, .puente-jg-btn')) cerrar();
    }, true);
    const a = window.app;
    if (a && typeof a.switchChannel === 'function') { const sw = a.switchChannel; a.switchChannel = function () { cerrar(); return sw.apply(this, arguments); }; }
    // El foro (o la web) pide abrir los mensajes directos (su "Mensajes"), el Marketplace (el de aca) o el
    // chat, y dice que pagina se esta viendo
    window.addEventListener('message', (e) => {
      if (!nuestro(e.origin) || !e.data || !page || e.source !== page.querySelector('iframe')?.contentWindow) return;
      if (e.data.cv === 'donde') { titular(String(e.data.titulo || '').slice(0, 40), typeof e.data.url === 'string' && /^https:\/\//.test(e.data.url) ? e.data.url : null); return; }
      if (e.data.cv === 'chat') { alChat(String(e.data.url || '')); return; }
      if (e.data.cv === 'marketplace') {
        cerrar();
        try { if (window.puenteMercado) { window.puenteMercado.abrir(); return; } } catch { /* sigue */ }
        const b = document.querySelector('.puente-mk-btn'); if (b) b.click();
        return;
      }
      // (los Juegos de la web, juegos.<dominio>: los de aca)
      if (e.data.cv === 'juegos') {
        cerrar();
        try { if (window.puenteJuegos) window.puenteJuegos.abrir(); } catch { /* sigue */ }
        return;
      }
      if (e.data.cv !== 'mensajes') return;
      cerrar();
      const b = document.querySelector('.puente-pc-dm, .puente-rail-dm'); if (b) b.click();
    });
    // Un enlace a la wiki, a Full Fat Search o al inicio de la web, en un mensaje: aca mismo
    document.addEventListener('click', (e) => {
      if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || !(e.target instanceof Element)) return;
      const a = e.target.closest('a[href]');
      if (!a || !a.closest('#messages, #thread-panel, #search-panel, #pinned-panel, .message-content')) return;
      let u; try { u = new URL(a.href); } catch { return; }
      if (!deLaWeb(u)) return;
      e.preventDefault(); e.stopPropagation();
      abrir(u.href);
    }, true);
    // /app?foro (o ?foro=/node/123): abre el foro aca
    const q = new URLSearchParams(location.search);
    if (q.has('foro')) { const r = q.get('foro'); setTimeout(() => abrir(r && r.startsWith('/') ? r : '/'), 1500); }
  })();
})();
// Crear un canal desde su categoria, como en Discord: un "+" al lado del nombre de la categoria (solo para
// administradores), que pide el nombre y si es privado, y lo crea ya adentro de esa categoria.
(function () {
  'use strict';
  const byId = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const st = el('style');
  st.textContent = '#channel-list .category-label .puente-cat-mas{margin-left:auto;display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;padding:0;border:0;background:none;color:#b5bac1;font-size:18px;line-height:1;cursor:pointer;opacity:0;transition:opacity .1s}'
    + '#channel-list .category-label:hover .puente-cat-mas,#channel-list .category-label .puente-cat-mas:focus{opacity:1}#channel-list .category-label .puente-cat-mas:hover{color:#fff}'
    + '@media (hover:none){#channel-list .category-label .puente-cat-mas{opacity:1}}'
    + '#puente-canal-nuevo{position:fixed;inset:0;z-index:100010;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(0,0,0,.7)}'
    + '#puente-canal-nuevo .pcn{position:relative;width:100%;max-width:460px;padding:22px 22px 18px;border-radius:10px;background:#313338;color:#dbdee1;font-size:14px}'
    + '#puente-canal-nuevo h2{margin:0 0 2px;color:#f2f3f5;font-size:20px}#puente-canal-nuevo .pcn-sub{margin:0 0 18px;color:#b5bac1;font-size:12px}'
    + '#puente-canal-nuevo .pcn-x{position:absolute;top:14px;right:14px;border:0;background:none;color:#b5bac1;font-size:22px;cursor:pointer}'
    + '#puente-canal-nuevo .pcn-et{margin:0 0 8px;color:#b5bac1;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.02em}'
    + '#puente-canal-nuevo .pcn-tipo{display:flex;gap:12px;align-items:center;width:100%;margin:0 0 8px;padding:10px 12px;border:0;border-radius:6px;background:#2b2d31;color:inherit;font:inherit;text-align:left;cursor:pointer}'
    + '#puente-canal-nuevo .pcn-tipo.es-elegido{background:#404249}#puente-canal-nuevo .pcn-tipo b{display:block;color:#f2f3f5}#puente-canal-nuevo .pcn-tipo small{color:#b5bac1}'
    + '#puente-canal-nuevo .pcn-tipo i{flex:0 0 auto;font-style:normal;font-size:20px;width:24px;text-align:center}'
    + '#puente-canal-nuevo .pcn-nombre{display:flex;align-items:center;gap:6px;margin:10px 0 16px;padding:0 10px;border-radius:6px;background:#1e1f22}'
    + '#puente-canal-nuevo .pcn-nombre span{color:#b5bac1;font-size:18px}#puente-canal-nuevo .pcn-nombre input{flex:1;min-width:0;height:40px;border:0;background:none;color:#f2f3f5;font:inherit;outline:none}'
    + '#puente-canal-nuevo .pcn-priv{display:flex;align-items:center;gap:10px;margin:0 0 18px;cursor:pointer}#puente-canal-nuevo .pcn-priv span{flex:1}#puente-canal-nuevo .pcn-priv small{display:block;color:#b5bac1;font-size:12px}'
    + '#puente-canal-nuevo .pcn-pie{display:flex;gap:10px;justify-content:flex-end}#puente-canal-nuevo .pcn-pie button{padding:10px 18px;border:0;border-radius:4px;font:inherit;font-weight:600;cursor:pointer}'
    + '#puente-canal-nuevo .pcn-cancelar{background:none;color:#dbdee1}#puente-canal-nuevo .pcn-crear{background:#5865f2;color:#fff}#puente-canal-nuevo .pcn-crear:disabled{opacity:.5;cursor:default}';
  document.head.appendChild(st);

  const admin = () => !!(window.app && window.app.user && window.app.user.isAdmin);
  function crear(cat) {
    const viejo = byId('puente-canal-nuevo'); if (viejo) viejo.remove();
    const o = el('div'); o.id = 'puente-canal-nuevo';
    const box = el('div', 'pcn'); o.appendChild(box);
    const x = el('button', 'pcn-x', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Cerrar');
    box.append(x, el('h2', null, 'Crear canal'), el('p', 'pcn-sub', 'en ' + cat), el('p', 'pcn-et', 'Tipo de canal'));
    let foro = false;
    const tipo = (icono, titulo, texto, esForo) => {
      const b = el('button', 'pcn-tipo' + (esForo === foro ? ' es-elegido' : '')); b.type = 'button';
      const t = el('span'); t.append(el('b', null, titulo), el('small', null, texto));
      b.append(el('i', null, icono), t);
      b.addEventListener('click', () => { foro = esForo; box.querySelectorAll('.pcn-tipo').forEach(n => n.classList.toggle('es-elegido', n === b)); });
      return b;
    };
    box.append(tipo('#', 'Texto', 'Mensajes, fotos, GIFs, emojis y opiniones (y charla de voz)', false), tipo('💬', 'Foro', 'Temas organizados, cada uno con su conversación', true));
    box.appendChild(el('p', 'pcn-et', 'Nombre del canal'));
    const fila = el('label', 'pcn-nombre'), nombre = el('input'); nombre.maxLength = 50; nombre.placeholder = 'nuevo-canal';
    fila.append(el('span', null, '#'), nombre); box.appendChild(fila);
    const priv = el('label', 'pcn-priv'), cb = el('input'); cb.type = 'checkbox';
    const pt = el('span'); pt.append('🔒 Canal privado', el('small', null, 'Solo las personas y roles que elijas lo van a poder ver.'));
    priv.append(pt, cb); box.appendChild(priv);
    const pie = el('div', 'pcn-pie'), no = el('button', 'pcn-cancelar', 'Cancelar'), si = el('button', 'pcn-crear', 'Crear canal');
    no.type = 'button'; si.type = 'button'; si.disabled = true; pie.append(no, si); box.appendChild(pie);
    document.body.appendChild(o);
    setTimeout(() => nombre.focus(), 30);
    const cerrar = () => o.remove();
    x.addEventListener('click', cerrar); no.addEventListener('click', cerrar);
    o.addEventListener('click', (e) => { if (e.target === o) cerrar(); });
    nombre.addEventListener('input', () => { si.disabled = !nombre.value.trim(); });
    nombre.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !si.disabled) si.click(); if (e.key === 'Escape') cerrar(); });
    si.addEventListener('click', () => {
      const so = window.app && window.app.socket;
      const n = nombre.value.trim().replace(/\s+/g, '-').toLowerCase();
      if (!so || !n) return;
      si.disabled = true;
      // Se crea, y apenas existe se pone en la categoria
      const listo = (ch) => {
        if (!ch || !ch.code) return;
        so.emit('set-channel-category', { code: ch.code, category: cat });
        cerrar();
        setTimeout(() => { try { window.app.switchChannel(ch.code); } catch { /* */ } }, 600);
      };
      so.once('channel-created', listo);
      setTimeout(() => { so.off('channel-created', listo); si.disabled = false; }, 8000);
      so.emit('create-channel', { name: n, isPrivate: cb.checked, isForum: foro, addAllMembers: !cb.checked });
    });
  }
  function poner() {
    if (!admin()) return;
    for (const lab of document.querySelectorAll('#channel-list .category-label[data-category]')) {
      if (lab.querySelector('.puente-cat-mas')) continue;
      const b = el('button', 'puente-cat-mas', '+'); b.type = 'button'; b.title = 'Crear canal'; b.setAttribute('aria-label', 'Crear canal en ' + lab.dataset.category);
      b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); crear(lab.dataset.category); });
      lab.appendChild(b);
    }
  }
  let t = 0;
  (function esperar() {
    const list = byId('channel-list');
    if (!list || !window.app || !window.app.user) { if (++t < 120) setTimeout(esperar, 1000); return; }
    poner();
    new MutationObserver(poner).observe(list, { childList: true, subtree: true });
  })();
})();

// El "+" de los mensajes directos (y de la ventanita de la web y del foro): con una persona abre el
// mensaje directo con ella; con dos o mas, el grupo (lo de Haven). Haven pedia minimo dos.
(function () {
  'use strict';
  let t = 0;
  (function esperar() {
    const app = window.app;
    if (!app || !app.socket || typeof app._openGroupPicker !== 'function') { if (++t < 120) setTimeout(esperar, 1000); return; }
    const original = app._openGroupPicker;
    app._openGroupPicker = async function (opts) {
      const r = await original.apply(this, arguments);
      if (opts && opts.code) return r; // sumar gente a un grupo: como siempre
      const modal = document.getElementById('group-picker-modal');
      if (!modal) return r;
      const q = (sel) => modal.querySelector(sel);
      const titulo = q('.gp-title'), nombre = q('.gp-name'), hint = q('.gp-hint'), viejo = q('.gp-go');
      if (!viejo) return r;
      const hintGrupo = hint ? hint.textContent : '';
      if (titulo) titulo.textContent = 'Nuevo mensaje';
      if (nombre) nombre.placeholder = 'Nombre del grupo (opcional, con 2 o más)';
      // el boton propio: el de Haven tiene sus manejadores (exige dos)
      const go = viejo.cloneNode(true); viejo.replaceWith(go);
      const marcados = () => [...modal.querySelectorAll('.gp-list input[type=checkbox]:checked')];
      const pintar = () => {
        const n = marcados().length;
        go.disabled = n < 1 || n > 49;
        go.textContent = n <= 1 ? 'Abrir mensaje' : 'Crear grupo';
        if (nombre) nombre.style.display = n >= 2 ? '' : 'none';
        if (hint) hint.textContent = n >= 2 ? hintGrupo : 'Elegí a una persona para mandarle un mensaje directo (cifrado), o a varias para armar un grupo.';
      };
      // despues del de Haven (que va en cada casilla): los cambios llegan aca por burbujeo
      q('.gp-list').addEventListener('change', pintar);
      q('.gp-search').addEventListener('input', () => setTimeout(pintar, 0));
      go.addEventListener('click', () => {
        const ids = marcados().map(b => b.closest('.gp-row')).filter(Boolean);
        const n = ids.length;
        if (n < 1) return;
        if (n === 1) {
          // el id: la lista de Haven no lo guarda en la fila; se busca por el nombre
          const nom = ids[0].querySelector('span') ? ids[0].querySelector('span').textContent : '';
          app._groupCandidates().then((ps) => {
            const p = ps.find(x => x.username === nom);
            if (p) { app.socket.emit('start-dm', { targetUserId: p.id }); if (app._showToast) app._showToast('Abriendo el mensaje con ' + p.username, 'info'); }
          });
          modal.remove();
          return;
        }
        viejo.disabled = false; viejo.click(); // dos o mas: lo de Haven, con sus elegidos
      });
      // Haven guarda los elegidos en su propio conjunto (se marcan con sus casillas): para el grupo,
      // el boton viejo sigue sabiendo quienes son aunque ya no este en la pantalla
      pintar();
      if (nombre) { nombre.style.display = 'none'; }
      const bus = q('.gp-search'); if (bus) bus.focus();
      return r;
    };
  })();
})();

// Arriba de cada canal y mensaje directo, sin la fila de iconos de Haven (mensajes fijados, archivos, hilos,
// cifrado, codigo del canal, mover mensajes) ni el aviso de "actualizacion disponible" de Haven (el puntito azul)
(function () {
  'use strict';
  const st = document.createElement('style');
  st.textContent = '#header-actions-box,#update-banner{display:none!important}';
  document.head.appendChild(st);
})();

// Imagenes y vistas previas como en Discord (puente-imagenes-discord):
//  - El menu del clic derecho en una imagen, con el mismo aspecto que el de los mensajes (texto a la
//    izquierda, icono a la derecha, separadores) y "Copiar enlace de la imagen".
//  - En la imagen abierta, arriba a la derecha: acercar, reenviar, abrir en el navegador, mas
//    opciones y cerrar.
//  - Al pasar el mouse por la vista previa de un enlace, una ✕ para quitarla (solo quien escribio el
//    mensaje, o un admin): queda el enlace solo, para todos (embeds.js), y tambien en Discord.
(function () {
  'use strict';
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const svg = (d, s = 20) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" aria-hidden="true"><path fill="currentColor" d="${d}"/></svg>`;
  const I = {
    ver: 'M12 4.5C7 4.5 2.7 7.6 1 12c1.7 4.4 6 7.5 11 7.5s9.3-3.1 11-7.5c-1.7-4.4-6-7.5-11-7.5Zm0 12.5a5 5 0 1 1 0-10 5 5 0 0 1 0 10Zm0-8a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z',
    guardar: 'M12 3a1 1 0 0 1 1 1v9.6l3.3-3.3a1 1 0 1 1 1.4 1.4l-5 5a1 1 0 0 1-1.4 0l-5-5a1 1 0 1 1 1.4-1.4l3.3 3.3V4a1 1 0 0 1 1-1ZM4 19a1 1 0 0 1 1-1h14a1 1 0 1 1 0 2H5a1 1 0 0 1-1-1Z',
    imagen: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm0 2v10.6l3.3-3.3a1 1 0 0 1 1.4 0l2.3 2.3 4.3-4.3a1 1 0 0 1 1.4 0L19 11.6V5H5Zm3.5 1.5a2 2 0 1 1 0 4 2 2 0 0 1 0-4Z',
    abrir: 'M14 3h7v7h-2V6.4l-8.3 8.3-1.4-1.4L17.6 5H14V3ZM5 5h6v2H5v12h12v-6h2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z',
    enlace: 'M10.6 13.4a1 1 0 0 0 1.4 0l4-4a3 3 0 0 0-4.2-4.2l-1.5 1.5 1.4 1.4 1.5-1.5a1 1 0 0 1 1.4 1.4l-4 4a1 1 0 0 0 0 1.4Zm2.8-2.8a1 1 0 0 0-1.4 0l-4 4a3 3 0 0 0 4.2 4.2l1.5-1.5-1.4-1.4-1.5 1.5a1 1 0 0 1-1.4-1.4l4-4a1 1 0 0 0 0-1.4Z',
    etiqueta: 'M21.4 11.6 12.4 2.6A2 2 0 0 0 11 2H4a2 2 0 0 0-2 2v7c0 .55.22 1.05.59 1.42l9 9a2 2 0 0 0 2.82 0l7-7a2 2 0 0 0-.01-2.82ZM6.5 8A1.5 1.5 0 1 1 6.5 5a1.5 1.5 0 0 1 0 3Z',
    ocultar: 'M2.3 3.7a1 1 0 0 1 1.4-1.4l18 18a1 1 0 0 1-1.4 1.4l-3.1-3.1A11.6 11.6 0 0 1 12 19.5c-5 0-9.3-3.1-11-7.5a12 12 0 0 1 3.8-5.2L2.3 3.7ZM12 4.5c5 0 9.3 3.1 11 7.5a12 12 0 0 1-2.6 4l-3.6-3.6A5 5 0 0 0 11.1 7L9 4.9c1-.3 2-.4 3-.4Z',
    lupa: 'M10 3a7 7 0 0 1 5.6 11.2l4.6 4.6a1 1 0 0 1-1.4 1.4l-4.6-4.6A7 7 0 1 1 10 3Zm0 2a5 5 0 1 0 0 10 5 5 0 0 0 0-10Zm0 2a1 1 0 0 1 1 1v1h1a1 1 0 1 1 0 2h-1v1a1 1 0 1 1-2 0v-1H8a1 1 0 1 1 0-2h1V8a1 1 0 0 1 1-1Z',
    reenviar: 'M14 5.5V9C7.5 9.6 4 13.6 3 19c2.3-3.2 5.6-4.7 11-4.8v3.6a.5.5 0 0 0 .85.35l6.3-6.3a.5.5 0 0 0 0-.7l-6.3-6.3a.5.5 0 0 0-.85.35Z',
    mas: 'M5 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm7 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm7 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z',
    cerrar: 'M18.3 5.7a1 1 0 0 0-1.4 0L12 10.6 7.1 5.7a1 1 0 0 0-1.4 1.4l4.9 4.9-4.9 4.9a1 1 0 1 0 1.4 1.4l4.9-4.9 4.9 4.9a1 1 0 0 0 1.4-1.4L13.4 12l4.9-4.9a1 1 0 0 0 0-1.4Z',
  };
  const toast = (t, k) => { try { window.app && window.app._showToast && window.app._showToast(t, k || 'info'); } catch { /* sin aviso */ } };
  const token = () => { try { return localStorage.getItem('haven_token'); } catch { return null; } };
  const absoluta = (src) => { try { const u = new URL(src, location.href); return /^https?:$/.test(u.protocol) ? u.href : null; } catch { return null; } };
  const copiar = (t) => (navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(t) : Promise.reject(new Error('sin portapapeles')));
  // En la app de Android (TWA) un enlace al mismo sitio se abre dentro de la app: se manda a Chrome con un intent
  function abrirArchivoFuera(url) {
    const enAndroid = /Android/i.test(navigator.userAgent) && (matchMedia('(display-mode: standalone)').matches || document.referrer.startsWith('android-app://'));
    if (enAndroid) {
      const u = new URL(url);
      location.href = `intent://${u.host}${u.pathname}${u.search}#Intent;scheme=${u.protocol.slice(0, -1)};package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(u.href)};end`;
      return;
    }
    window.open(url, '_blank', 'noopener');
  }

  // ── El menu de la imagen ──
  const ITEMS = {
    view: ['Ver imagen', I.ver, 0], 'puente-abrir-img': ['Abrir imagen', I.abrir, 0],
    copy: ['Copiar imagen', I.imagen, 1], save: ['Guardar imagen', I.guardar, 1],
    'puente-copiar-enlace': ['Copiar enlace de la imagen', I.enlace, 2], open: ['Abrir en el navegador', I.abrir, 2],
    'edit-tags': ['Editar etiquetas', I.etiqueta, 3], hide: ['Ocultar imagen', I.ocultar, 3],
  };
  function arreglarMenu(app, src) {
    const menu = document.getElementById('image-context-menu');
    if (!menu || menu.classList.contains('puente-img-menu')) return;
    menu.classList.add('puente-img-menu', 'puente-pc-msgmenu');
    const by = new Map([...menu.querySelectorAll('button[data-action]')].map(b => [b.dataset.action, b]));
    const url = absoluta(src);
    if (url) {
      const b = el('button'); b.type = 'button'; b.dataset.action = 'puente-copiar-enlace';
      b.addEventListener('click', (e) => { e.stopPropagation(); app._hideImageContextMenu(); copiar(url).then(() => toast('Enlace copiado', 'success'), () => prompt('Copiá el enlace:', url)); });
      by.set('puente-copiar-enlace', b);
    }
    const abrirB = by.get('open');
    if (abrirB && url) abrirB.addEventListener('click', (e) => { e.stopImmediatePropagation(); app._hideImageContextMenu(); abrirArchivoFuera(url); }, true);
    const grupos = [[], [], [], []];
    for (const [a, b] of by) {
      const it = ITEMS[a] || [null, I.imagen, 3];
      const nombre = it[0] || b.textContent.replace(/^\s*[^\p{L}\p{N}\s]+\s*/u, '').trim();
      b.textContent = '';
      b.classList.add('channel-ctx-item', 'puente-mm-item');
      if (a === 'hide') b.classList.add('danger');
      b.append(el('span', 'puente-mm-label', nombre));
      const ic = el('span', 'puente-mm-icon'); ic.innerHTML = svg(it[1]); b.appendChild(ic);
      grupos[it[2]].push(b);
    }
    menu.textContent = '';
    grupos.filter(g => g.length).forEach((g, i) => { if (i) menu.appendChild(el('div', 'puente-mm-sep')); g.forEach(b => menu.appendChild(b)); });
    const r = menu.getBoundingClientRect();
    if (r.right > innerWidth - 8) menu.style.left = Math.max(8, innerWidth - r.width - 8) + 'px';
    if (r.bottom > innerHeight - 8) menu.style.top = Math.max(8, innerHeight - r.height - 8) + 'px';
  }

  // ── Arriba a la derecha de la imagen abierta ──
  function barra(app) {
    const lb = document.getElementById('image-lightbox'), img = document.getElementById('lightbox-img');
    if (!lb || !img || lb.querySelector('.puente-lb-barra')) return;
    const b = el('div', 'puente-lb-barra');
    const boton = (icono, titulo, fn) => {
      const x = el('button', 'puente-lb-btn'); x.type = 'button'; x.title = titulo; x.setAttribute('aria-label', titulo); x.innerHTML = svg(icono);
      x.addEventListener('click', (e) => { e.stopPropagation(); fn(e, x); });
      return x;
    };
    const zoom = boton(I.lupa, 'Acercar', () => {
      const nivel = document.getElementById('lightbox-zoom-reset');
      if (nivel && nivel.textContent.trim() !== '100%') nivel.click();
      else { const mas = document.getElementById('lightbox-zoom-in'); if (mas) { mas.click(); mas.click(); } }
    });
    const reenviar = boton(I.reenviar, 'Reenviar', () => { const u = absoluta(img.src); if (u) elegirDestino(app, u); });
    const abrir = boton(I.abrir, 'Abrir en el navegador', () => { if (img.src) abrirArchivoFuera(img.src); });
    const mas = boton(I.mas, 'Más', (e, x) => {
      const r = x.getBoundingClientRect();
      app._showImageContextMenu({ clientX: r.left, clientY: r.bottom + 6, preventDefault() {}, stopPropagation() {} }, img.src, {});
    });
    const cerrar = boton(I.cerrar, 'Cerrar', () => app._closeLightbox());
    cerrar.classList.add('puente-lb-cerrar');
    const grupo = el('div', 'puente-lb-grupo'); grupo.append(zoom, reenviar, abrir, mas);
    b.append(grupo, cerrar);
    lb.appendChild(b);
    // reenviar solo con una imagen que tiene direccion (las de los mensajes cifrados se ven desde la memoria)
    new MutationObserver(() => { reenviar.style.display = absoluta(img.src) ? '' : 'none'; }).observe(img, { attributes: true, attributeFilter: ['src'] });
  }
  // Reenviar: elegir a donde, y ahi queda el enlace escrito (se manda con Enter, cifrado si es un mensaje directo)
  function elegirDestino(app, url) {
    document.getElementById('puente-reenviar')?.remove();
    const fondo = el('div', 'modal-overlay'); fondo.id = 'puente-reenviar'; fondo.style.display = 'flex';
    const box = el('div', 'modal puente-reenviar');
    box.appendChild(el('h3', null, 'Reenviar a'));
    const q = el('input', 'settings-text-input'); q.type = 'search'; q.placeholder = 'Buscar un canal o una persona';
    const lista = el('div', 'puente-reenviar-lista');
    box.append(q, lista);
    const acc = el('div', 'modal-actions');
    const no = el('button', 'btn-sm', 'Cancelar'); no.type = 'button'; no.addEventListener('click', () => fondo.remove());
    acc.appendChild(no); box.appendChild(acc);
    fondo.appendChild(box);
    fondo.addEventListener('click', (e) => { if (e.target === fondo) fondo.remove(); });
    const nombre = (c) => (c.is_dm ? (c.is_group && app._groupName ? app._groupName(c) : '@' + ((c.dm_target && (c.dm_target.displayName || c.dm_target.username)) || 'mensaje')) : '#' + c.name);
    const todos = (app.channels || []).filter(c => c && c.code && !c.is_voice && !c.is_forum && (c.is_dm || c.name));
    const pintar = () => {
      const f = q.value.trim().toLowerCase();
      lista.textContent = '';
      for (const c of todos.filter(c => !f || nombre(c).toLowerCase().includes(f)).slice(0, 60)) {
        const r = el('button', 'puente-reenviar-fila', nombre(c)); r.type = 'button';
        r.addEventListener('click', () => {
          fondo.remove();
          try { app._closeLightbox(); } catch { /* ya cerrada */ }
          app.switchChannel(c.code);
          setTimeout(() => {
            const i = document.getElementById('message-input');
            if (!i) return;
            i.value = (i.value ? i.value + ' ' : '') + url;
            i.dispatchEvent(new Event('input', { bubbles: true }));
            i.focus();
            toast('Listo para mandar: apretá Enter', 'info');
          }, 700);
        });
        lista.appendChild(r);
      }
      if (!lista.children.length) lista.appendChild(el('div', 'puente-reenviar-vacio', 'No hay nada con ese nombre.'));
    };
    q.addEventListener('input', pintar);
    pintar();
    document.body.appendChild(fondo);
    q.focus();
  }

  // ── La ✕ para quitar la vista previa de un enlace ──
  function puedeQuitar(app, msgEl) {
    const yo = app.user && app.user.id;
    return !!yo && (String(msgEl.dataset.userId) === String(yo) || !!app.user.isAdmin);
  }
  function confirmar(fn) {
    document.getElementById('puente-quitar-vista')?.remove();
    const fondo = el('div', 'modal-overlay'); fondo.id = 'puente-quitar-vista'; fondo.style.display = 'flex';
    const box = el('div', 'modal');
    box.append(el('h3', null, '¿Quitar la vista previa?'), el('p', 'puente-qv-texto', 'Va a quedar solo el enlace, para todos. (Con Shift + clic en la ✕ no se pregunta.)'));
    const acc = el('div', 'modal-actions');
    const no = el('button', 'btn-sm', 'Cancelar'); no.type = 'button'; no.addEventListener('click', () => fondo.remove());
    const si = el('button', 'btn-sm btn-danger', 'Quitar'); si.type = 'button'; si.addEventListener('click', () => { fondo.remove(); fn(); });
    acc.append(no, si); box.appendChild(acc); fondo.appendChild(box);
    fondo.addEventListener('click', (e) => { if (e.target === fondo) fondo.remove(); });
    document.body.appendChild(fondo);
    si.focus();
  }
  function quitar(msgEl) {
    const id = parseInt(msgEl.dataset.msgId, 10);
    if (!id) return;
    fetch('/puente/api/embeds/quitar', { method: 'POST', headers: { Authorization: 'Bearer ' + token(), 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
      .then(r => r.json().then(d => ({ ok: r.ok, d })))
      .then(({ ok, d }) => { if (!ok) toast(d.error || 'No se pudo quitar.', 'error'); })
      .catch(() => toast('No hay conexión.', 'error'));
  }
  function ponerX(app, msgEl) {
    if (!puedeQuitar(app, msgEl)) return;
    for (const v of msgEl.querySelectorAll('.puente-embeds > *, .message-content .link-preview, .thread-msg-content .link-preview')) {
      if (v.querySelector(':scope > .puente-qv-x')) continue;
      const x = el('button', 'puente-qv-x'); x.type = 'button'; x.title = 'Quitar la vista previa'; x.setAttribute('aria-label', x.title);
      x.innerHTML = svg(I.cerrar, 16);
      x.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); if (e.shiftKey) quitar(msgEl); else confirmar(() => quitar(msgEl)); });
      v.appendChild(x);
    }
  }

  let t = 0;
  (function esperar() {
    const app = window.app;
    if (!app || typeof app._showImageContextMenu !== 'function' || !document.getElementById('image-lightbox')) { if (++t < 120) setTimeout(esperar, 1000); return; }
    const orig = app._showImageContextMenu;
    app._showImageContextMenu = function (e, src) {
      const r = orig.apply(this, arguments);
      try { arreglarMenu(this, src); } catch (err) { console.warn('[puente] menu de imagen:', err); }
      return r;
    };
    barra(app);
    if (!matchMedia('(pointer: coarse)').matches) {
      document.addEventListener('mouseover', (e) => {
        const m = e.target instanceof Element && e.target.closest('#messages [data-msg-id], #thread-messages [data-msg-id]');
        if (m && m.querySelector('.puente-embeds, .link-preview')) ponerX(app, m);
      });
    }
  })();
})();
// Tiempo de uso (uso.js): cada 5 segundos, si la pestaña esta a la vista y la persona la uso en los
// ultimos 2 minutos, se suma a lo que tiene abierto (un canal, los privados, un juego, el Marketplace,
// el foro...). Cada minuto se manda el total; nada de lo que se escribe o se lee. Una visita nueva es
// volver despues de 30 minutos sin usarlo.
(function () {
  'use strict';
  if (window.__puenteUso) return;
  window.__puenteUso = true;
  const TICK = 5000, QUIETO = 120000, PAUSA = 30 * 60000;
  let ultimoInput = Date.now(), suma = {}, visitas = 0;
  const marcar = () => { ultimoInput = Date.now(); };
  // Los juegos en iframe (WORGS) avisan por aca: esos eventos no salen del iframe
  window.__puenteUsoActivo = marcar;
  for (const ev of ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'scroll']) window.addEventListener(ev, marcar, { passive: true, capture: true });
  const token = () => { try { return localStorage.getItem('haven_token'); } catch { return null; } };
  function seccion() {
    try {
      if (window.name === 'cv-ventana') return 'dm';
      if (window.puenteForo && window.puenteForo.abierto()) return 'foro';
      if (window.puenteMercado && window.puenteMercado.abierto()) return 'mercado';
      if (window.puenteJuegos && window.puenteJuegos.abierto()) return 'j:' + (window.puenteJuegos.juego ? window.puenteJuegos.juego() : 'juegos');
      if (document.getElementById('puente-miembros')) return 'miembros';
      const app = window.app;
      const ch = app && app.currentChannel && (app.channels || []).find(c => c && c.code === app.currentChannel);
      if (ch) return ch.is_dm || ch.is_group || ch.is_self_dm ? 'dm' : 'c:' + ch.id;
    } catch { /* sigue */ }
    return 'otros';
  }
  function tick() {
    if (document.visibilityState !== 'visible' || Date.now() - ultimoInput > QUIETO || !token()) return;
    let ult = 0;
    try { ult = Number(localStorage.getItem('puente_uso_ult')) || 0; localStorage.setItem('puente_uso_ult', String(Date.now())); } catch { /* sin almacenamiento */ }
    if (Date.now() - ult > PAUSA) visitas++;
    const s = seccion();
    suma[s] = (suma[s] || 0) + TICK / 1000;
  }
  function mandar() {
    const tk = token();
    if (!tk || (!Object.keys(suma).length && !visitas)) return;
    const body = JSON.stringify({ s: suma, v: visitas });
    suma = {}; visitas = 0;
    try { fetch('/puente/api/uso', { method: 'POST', keepalive: true, headers: { Authorization: 'Bearer ' + tk, 'Content-Type': 'application/json' }, body }).catch(() => {}); } catch { /* la proxima */ }
  }
  setInterval(tick, TICK);
  setInterval(mandar, 60000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') mandar(); });
  window.addEventListener('pagehide', mandar);
})();
// Cuando el navegador autocompleta un campo (Chrome, los gestores de contraseñas) manda "teclas" sin
// tecla (e.key vacio): Haven y otros lectores hacen e.key.length y tiran un error. Antes de que les
// llegue (en window, en captura, va primero) se les pone una tecla vacia; no se frena nada
(function () {
  'use strict';
  if (window.__puenteTeclaVacia) return;
  window.__puenteTeclaVacia = true;
  const arreglar = (e) => { if (typeof e.key !== 'string') { try { Object.defineProperty(e, 'key', { value: '', configurable: true }); } catch { /* no se pudo */ } } };
  for (const t of ['keydown', 'keyup', 'keypress']) window.addEventListener(t, arreglar, true);
})();
// Errores y velocidad (medidas.js): los errores de JavaScript que aparecen en CV Chat (como mucho 5 por
// apertura, sin los de extensiones del navegador) y cuanto tarda en abrir hasta tener los canales, por
// dispositivo. Y si se toco una notificacion con CV Chat abierto.
(function () {
  'use strict';
  if (window.__puenteMedir || window.name === 'cv-ventana') return;
  window.__puenteMedir = true;
  const NOMBRES = { 'android-app': 'App de Android', 'pc-app': 'App de PC', 'iphone-app': 'App de iPhone', 'celular-web': 'Navegador del celular', 'pc-web': 'Navegador de PC' };
  const dv = () => NOMBRES[window.__puentePlataforma] || (/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ? 'Navegador del celular' : 'Navegador de PC');
  const medir = (x) => { try { navigator.sendBeacon('/puente/api/medir', JSON.stringify(Object.assign({ dv: dv() }, x))); } catch { /* sin beacon */ } };
  let errores = 0;
  const ignorar = /ResizeObserver loop|^Script error\.?$|chrome-extension:|moz-extension:|safari-extension:/i;
  function anotar(m, f, l) {
    m = String(m || '').slice(0, 300);
    if (!m || ignorar.test(m) || ignorar.test(String(f || '')) || ++errores > 5) return;
    medir({ t: 'error', m, f: String(f || ''), l: l || 0 });
  }
  window.addEventListener('error', (e) => { if (e && e.message) anotar(e.message, e.filename, e.lineno); });
  // De una promesa: el archivo y la linea salen de la pila. Si la pila no pasa por ningun archivo de la
  // pagina, es de algo que el navegador mete (una extension, un traductor) y no se anota
  window.addEventListener('unhandledrejection', (e) => {
    const r = e && e.reason;
    const lugar = r && r.stack ? String(r.stack).match(/(https?:\/\/[^\s)]+?):(\d+):\d+/) : null;
    if (!lugar) return;
    anotar(r && r.message ? r.message : typeof r === 'string' ? r : '', lugar[1], Number(lugar[2]) || 0);
  });
  // Cuanto tardo en abrir: desde que se pidio la pagina hasta que aparecen los canales
  const t0 = Date.now();
  (function esperar() {
    const app = window.app;
    if (app && app.channels && app.channels.length) {
      if (document.visibilityState === 'visible') medir({ t: 'carga', ms: Math.round(performance.now()) });
      return;
    }
    if (Date.now() - t0 < 60000) setTimeout(esperar, 250);
  })();
  try { if (navigator.serviceWorker) navigator.serviceWorker.addEventListener('message', (e) => { if (e.data && e.data.type === 'push-notification-click') medir({ t: 'notif' }); }); } catch { /* sin service worker */ }
})();
// El enlace de cada canal: un botoncito arriba a la derecha (como el del Marketplace) que copia la
// direccion del canal (/app?channel=<codigo>, con su vista previa: vistas.js); en el celular abre
// "Compartir". Solo en los canales, no en los mensajes directos ni los grupos.
(function () {
  'use strict';
  if (window.name === 'cv-ventana') return;
  const mobile = () => matchMedia('(max-width: 768px)').matches;
  const byId = (id) => document.getElementById(id);
  const toast = (t, k) => { try { window.app && window.app._showToast && window.app._showToast(t, k || 'info'); } catch { /* sin aviso */ } };
  const ENLACE = 'M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7a5 5 0 0 0 0 10h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1ZM8 13h8v-2H8v2Zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4a5 5 0 0 0 0-10Z';
  const st = document.createElement('style');
  st.textContent = '#puente-enlace-canal{display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto;width:2rem;height:2rem;margin:0 .25rem;padding:0;border:0;border-radius:50%;background:transparent;color:#b5bac1;cursor:pointer}'
    + '#puente-enlace-canal:hover{color:#fff;background:#2e2d32}#puente-enlace-canal[hidden]{display:none!important}'
    + '@media (max-width:768px){#puente-enlace-canal{width:2.75rem;height:2.75rem;margin:0}#puente-enlace-canal:active{background:#2e2d32}}';
  document.head.appendChild(st);
  const canal = () => {
    const app = window.app;
    const ch = app && app.currentChannel && (app.channels || []).find(c => c && c.code === app.currentChannel);
    return ch && !ch.is_dm && !ch.is_group && !ch.is_self_dm ? ch : null;
  };
  function copiar() {
    const ch = canal();
    if (!ch) return;
    const url = location.origin + '/app?channel=' + encodeURIComponent(ch.code);
    if (navigator.share && mobile()) { navigator.share({ title: '#' + ch.name, url }).catch(() => {}); return; }
    const listo = () => toast('Enlace de #' + ch.name + ' copiado: pegalo donde quieras', 'success');
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(listo, () => prompt('Copiá el enlace:', url));
    else prompt('Copiá el enlace:', url);
  }
  function poner() {
    const cab = document.querySelector('header.channel-header');
    if (!cab) return;
    let b = byId('puente-enlace-canal');
    if (!b) {
      b = document.createElement('button');
      b.id = 'puente-enlace-canal'; b.type = 'button';
      b.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="' + ENLACE + '"/></svg>';
      b.addEventListener('click', (e) => { e.stopPropagation(); copiar(); });
    }
    b.title = mobile() ? 'Compartir el canal' : 'Copiar el enlace del canal'; b.setAttribute('aria-label', b.title);
    // En el celular, al lado de la lupa; en la PC, antes del buscador
    const antes = mobile() ? (byId('puente-lupa') || byId('mobile-users-btn')) : byId('search-container');
    if (antes && antes.parentElement === cab) { if (b.nextSibling !== antes) cab.insertBefore(b, antes); }
    else if (b.parentElement !== cab) cab.appendChild(b);
    b.hidden = !canal();
  }
  setInterval(poner, 1500);
  addEventListener('resize', poner);
})();
// Las tarjetas de los enlaces, al instante (previas.js): las que el servidor ya tiene llegan junto
// con los mensajes y se ponen en la memoria de Haven antes de que los dibuje, asi la tarjeta sale
// con el mensaje (antes Haven las pedia despues, de a una). Con su imagen ya bajada, para los
// mensajes de abajo. Y el enlace que se esta escribiendo se pide antes de mandarlo.
(function () {
  'use strict';
  const EVENTOS = new Set(['message-history', 'thread-messages', 'new-message', 'new-thread-message']);
  const URL_RE = /https?:\/\/[^\s<>()"'`]+/g;
  const imagenes = new Set();
  function precargar(app, d) {
    for (const src of [d.image, d.avatar]) {
      if (typeof src !== 'string' || !src || imagenes.has(src)) continue;
      imagenes.add(src);
      try { const p = typeof app._proxyMediaUrl === 'function' ? app._proxyMediaUrl(src) : src; if (p) new Image().src = p; } catch { /* sin imagen */ }
    }
  }
  function poner(app, previas) {
    if (!previas || typeof previas !== 'object') return;
    if (!app._linkPreviewCache) app._linkPreviewCache = new Map();
    const ahora = Date.now();
    const todas = Object.entries(previas);
    todas.forEach(([url, data], i) => {
      if (!data || typeof data !== 'object' || typeof url !== 'string') return;
      app._linkPreviewCache.set(url, { data, ts: ahora });
      if (i >= todas.length - 8 && !(!data.title && !data.description && !data.text)) precargar(app, data); // las de los ultimos mensajes, que son los que se ven
    });
  }
  function enganchar() {
    const app = window.app, s = app && app.socket;
    if (!s || s.__puentePrevias || typeof s.onevent !== 'function') return;
    s.__puentePrevias = true;
    const orig = s.onevent;
    s.onevent = function (packet) {
      try {
        const d = packet && packet.data, p = d && EVENTOS.has(d[0]) && d[1];
        if (p && p.puentePrevias) poner(app, p.puentePrevias);
        if (p && (p.puenteEmbeds || p.puenteSinEmbed) && window.puenteEmbedsDatos) window.puenteEmbedsDatos(p.puenteEmbeds, p.puenteSinEmbed); // los de Discord (embeds.js)
      } catch (err) { console.warn('[puente] previas:', err); }
      return orig.apply(this, arguments);
    };
  }
  // Lo que se escribe: cada enlace se pide una vez, medio segundo despues de dejar de escribir
  const pedidos = new Set();
  let timer = null;
  function pedir(texto) {
    const app = window.app;
    if (!app || typeof app._linkPreviewData !== 'function') return;
    for (let u of String(texto || '').match(URL_RE) || []) {
      u = u.replace(/[.,;:!?*_~|>\]]+$/, '');
      try { u = new URL(u).href; } catch { continue; }
      if (pedidos.has(u) || u.startsWith(location.origin) || /\.(jpe?g|png|gif|webp)(\?|$)/i.test(u)) continue;
      if (typeof app._extractYouTubeVideoId === 'function' && app._extractYouTubeVideoId(u)) continue;
      if (pedidos.size > 300) pedidos.clear();
      pedidos.add(u);
      app._linkPreviewData(u).then((d) => { if (d) precargar(app, d); }).catch(() => {});
    }
  }
  document.addEventListener('input', (e) => {
    const t = e.target;
    if (!(t instanceof HTMLTextAreaElement) || !t.matches('#message-input, #thread-input, #dm-pip-input') || t.value.indexOf('http') < 0) return;
    clearTimeout(timer);
    timer = setTimeout(() => pedir(t.value), 500);
  }, true);
  enganchar();
  setInterval(enganchar, 1000);
})();
// Lo que se estaba escribiendo en cada canal (puente-borradores): al irse a otro canal y volver, sigue
// en el cuadro, como en Discord. Se guarda en este navegador (tambien si se cierra la app), por cuenta;
// se borra al mandarlo. Mientras se edita un mensaje, el cuadro tiene ese mensaje: no es un borrador.
// Las fotos y archivos que se estaban por mandar (pegados o elegidos) tambien quedan en su canal: Haven
// vaciaba la cola al cambiar de canal. Esos quedan mientras la app esta abierta (no se guardan en el navegador)
(function () {
  'use strict';
  const MAX = 60, DIAS = 14;
  const quien = () => { try { return String(JSON.parse(localStorage.getItem('haven_user') || '{}').id || ''); } catch { return ''; } };
  const clave = () => 'puente_borradores_' + quien();
  let todos = null;
  function leer() {
    if (todos) return todos;
    try { todos = JSON.parse(localStorage.getItem(clave()) || '{}') || {}; } catch { todos = {}; }
    const vence = Date.now() - DIAS * 864e5;
    for (const k of Object.keys(todos)) if (!todos[k] || !todos[k].t || todos[k].at < vence) delete todos[k];
    return todos;
  }
  function escribir() {
    const b = leer(), ks = Object.keys(b);
    if (ks.length > MAX) ks.sort((x, y) => b[x].at - b[y].at).slice(0, ks.length - MAX).forEach(k => delete b[k]);
    try { localStorage.setItem(clave(), JSON.stringify(b)); } catch { /* sin lugar: queda en memoria */ }
  }
  const caja = () => document.getElementById('message-input');
  const adjuntos = new Map(); // canal -> { imagenes, archivos } que quedaron sin mandar
  const editando = () => !!document.querySelector('#messages .editing[data-msg-id], #messages [data-msg-id].editing');
  function anotar(canal, texto) {
    if (!canal || editando()) return;
    const b = leer(), t = String(texto || '');
    if (t.trim()) b[canal] = { t: t.slice(0, 4000), at: Date.now() };
    else if (b[canal]) delete b[canal];
    else return;
    escribir();
  }
  const ahora = () => { const app = window.app, i = caja(); if (app && i) anotar(app.currentChannel, i.value); };
  // Poner el texto en el cuadro sin avisar "escribiendo..." al canal
  function poner(app, i, texto) {
    if (i.value === texto) return;
    app.lastTypingEmit = Date.now();
    i.value = texto;
    i.dispatchEvent(new Event('input', { bubbles: true }));
    try { i.setSelectionRange(texto.length, texto.length); } catch { /* nada */ }
  }

  let tries = 0;
  (function wait() {
    const app = window.app;
    if (!app || typeof app.switchChannel !== 'function' || !caja() || !app.socket) { if (++tries < 120) setTimeout(wait, 500); return; }
    let escrito = 0;
    document.addEventListener('input', (e) => {
      if (e.target !== caja() || !e.isTrusted) return;
      escrito = Date.now();
      anotar(app.currentChannel, e.target.value);
    }, true);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') ahora(); });
    addEventListener('pagehide', ahora);
    // Lo mande: ya no es un borrador
    app.socket.on('new-message', (d) => {
      const i = caja(), m = d && d.message;
      if (!i || !m || !app.user || m.user_id !== app.user.id || d.channelCode !== app.currentChannel) return;
      anotar(d.channelCode, i.value);
    });
    const cambiar = app.switchChannel;
    app.switchChannel = function (code) {
      const antes = this.currentChannel, i = caja();
      if (i && antes && antes !== code) anotar(antes, i.value);
      const cola = antes && antes !== code ? { imagenes: [...(this._imageQueue || [])], archivos: [...(this._fileQueue || [])] } : null;
      const r = cambiar.apply(this, arguments);
      if (!code || antes === code) return r;
      // (Haven vacia la de imagenes al empezar a cambiar, antes de esperar nada)
      try {
        if (cola) { if (cola.imagenes.length || cola.archivos.length) adjuntos.set(antes, cola); else adjuntos.delete(antes); }
        const vuelve = adjuntos.get(code);
        adjuntos.delete(code);
        this._imageQueue = vuelve ? vuelve.imagenes : [];
        this._fileQueue = vuelve ? vuelve.archivos : [];
        this._activeAttachment = vuelve ? [...vuelve.imagenes, ...vuelve.archivos].pop() || null : null;
        if (cola || vuelve) this._renderImageQueue();
      } catch (err) { console.warn('[puente] adjuntos:', err); }
      const desde = Date.now();
      // El del canal nuevo (o vacio), despues de lo que haga Haven al cambiar; si ya se empezo a escribir, no se pisa
      const restaurar = () => {
        const x = caja();
        if (!x || this.currentChannel !== code || escrito > desde || editando()) return;
        const b = leer()[code];
        poner(this, x, b ? b.t : '');
      };
      setTimeout(restaurar, 0);
      Promise.resolve(r).finally(() => setTimeout(restaurar, 50));
      return r;
    };
    // Al abrir la app, el del canal que queda abierto
    setTimeout(() => {
      const i = caja(), b = app.currentChannel && leer()[app.currentChannel];
      if (i && b && !i.value && escrito === 0) poner(app, i, b.t);
    }, 1500);
  })();
  // ── Franja azul "N mensajes nuevos desde las HH:MM" (como la de Discord) ──
  // Aparece arriba del canal cuando Haven pone la linea "Mensajes nuevos" al abrirlo. Tocarla lleva a esa
  // linea; la X la cierra; se va sola al bajar hasta el final o al cambiar de canal. (Haven ya marca leido
  // el canal al abrirlo, asi que cerrarla no tiene que avisar nada al servidor.)
  (function franjaNuevos() {
    let franja = null, divisor = null, bajo = false;
    const fecha = (s) => {
      if (!s) return null;
      let t = String(s);
      if (/^\d{4}-\d\d-\d\d \d/.test(t)) t = t.replace(' ', 'T');
      if (!/[zZ]|[+-]\d\d:?\d\d$/.test(t)) t += 'Z';
      const d = new Date(t);
      return isNaN(d) ? null : d;
    };
    const hora = (d) => d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
    function desde(d) {
      if (!d) return '';
      const hoy = new Date(), ayer = new Date(); ayer.setDate(hoy.getDate() - 1);
      const mismo = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
      if (mismo(d, hoy)) return ' desde las ' + hora(d);
      if (mismo(d, ayer)) return ' desde ayer a las ' + hora(d);
      return ' desde el ' + d.toLocaleDateString('es-AR', { day: 'numeric', month: 'numeric' }) + ' a las ' + hora(d);
    }
    function sacar() { if (franja) franja.remove(); franja = null; divisor = null; bajo = false; }
    function poner(div) {
      sacar();
      const lista = document.getElementById('messages');
      const area = lista && lista.parentElement;
      if (!area) return;
      const msgs = [];
      for (let x = div.nextElementSibling; x; x = x.nextElementSibling) {
        if (x.dataset && x.dataset.msgId && x.dataset.type !== 'welcome' && x.dataset.type !== 'notice') msgs.push(x);
      }
      if (!msgs.length) return;
      const n = msgs.length;
      divisor = div;
      franja = document.createElement('div');
      franja.id = 'puente-franja-nuevos';
      const ir = document.createElement('button');
      ir.type = 'button'; ir.className = 'puente-franja-ir';
      ir.textContent = n + (n === 1 ? ' mensaje nuevo' : ' mensajes nuevos') + desde(fecha(msgs[0].dataset.time));
      ir.addEventListener('click', () => { if (divisor && divisor.isConnected) divisor.scrollIntoView({ block: 'start', behavior: 'smooth' }); });
      const x = document.createElement('button');
      x.type = 'button'; x.className = 'puente-franja-x'; x.setAttribute('aria-label', 'Cerrar');
      x.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M18.3 5.71a1 1 0 0 0-1.41 0L12 10.59 7.11 5.7A1 1 0 0 0 5.7 7.11L10.59 12 5.7 16.89a1 1 0 1 0 1.41 1.41L12 13.41l4.89 4.89a1 1 0 0 0 1.41-1.41L13.41 12l4.89-4.89a1 1 0 0 0 0-1.4z"/></svg>';
      x.addEventListener('click', sacar);
      franja.append(ir, x);
      area.appendChild(franja);
    }
    (function esperar(n) {
      const lista = document.getElementById('messages');
      if (!lista) { if (n < 240) setTimeout(() => esperar(n + 1), 500); return; }
      new MutationObserver(() => {
        const div = document.getElementById('new-messages-divider');
        if (div && div !== divisor) setTimeout(() => { if (div.isConnected) poner(div); }, 50);
        else if (!div && franja) sacar();
      }).observe(lista, { childList: true });
      // Se va sola cuando bajas hasta el ultimo mensaje (despues de haberte movido: si entra todo en pantalla, queda)
      lista.addEventListener('scroll', () => {
        if (!franja) return;
        const abajo = lista.scrollHeight - lista.scrollTop - lista.clientHeight < 40;
        if (!abajo) bajo = true;
        else if (bajo) sacar();
      }, { passive: true });
    })(0);
  })();
})();

// Proponer emojis y stickers (propuestas.js): un boton "Proponer" en el selector de emojis (el del
// puente en la PC, #puente-rp, y el de Haven en el celular, #emoji-picker), con una ventanita para
// elegir la imagen, el tipo y el nombre. La propuesta se vota en #que-paso con 👍 o 👎 y la aprueba
// un admin desde Admin → Propuestas (window.puentePropuestas.admin, lo llama esa pagina).
(function () {
  'use strict';
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null && text !== '') n.textContent = text; return n; };
  const token = () => { try { return localStorage.getItem('haven_token'); } catch { return null; } };
  const toast = (t, tipo) => { const app = window.app; if (app && app._showToast) app._showToast(t, tipo || 'info'); };
  async function api(url, body) {
    const r = await fetch(url, body
      ? { method: 'POST', headers: { Authorization: 'Bearer ' + token(), 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
      : { headers: { Authorization: 'Bearer ' + token() } });
    const d = await r.json().catch(() => null);
    if (!r.ok) throw new Error((d && d.error) || (r.status === 413 ? 'La imagen es muy pesada.' : 'No se pudo. Probá de nuevo.'));
    return d;
  }
  const MAX = { emoji: 30, sticker: 40 };
  // Nombre como en Haven: [a-z0-9_-], sin tildes
  const sanear = (t, tipo) => String(t || '').replace(/\.[a-z0-9]{2,5}$/i, '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[\s.]+/g, '_').replace(/[^a-z0-9_-]/g, '').replace(/_+/g, '_').replace(/^[_-]+|[_-]+$/g, '').slice(0, MAX[tipo] || 30);
  const kb = (n) => Math.ceil(n / 1024);

  // ── La ventanita ──
  let abierta = null;
  function cerrar() {
    if (!abierta) return;
    abierta.remove(); abierta = null;
    document.removeEventListener('keydown', onKey, true);
  }
  function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); cerrar(); } }

  function abrir(tipoInicial) {
    cerrar();
    let tipo = tipoInicial === 'sticker' ? 'sticker' : 'emoji';
    let imagen = null, bytes = 0, nombreTocado = false, estado = null, mandando = false;
    const fondo = el('div', 'puente-prop-fondo');
    fondo.id = 'puente-prop';
    const caja = el('div', 'puente-prop-caja');
    caja.setAttribute('role', 'dialog'); caja.setAttribute('aria-modal', 'true');
    fondo.appendChild(caja);
    fondo.addEventListener('click', (e) => { if (e.target === fondo) cerrar(); });
    caja.addEventListener('click', (e) => e.stopPropagation());

    const titulo = el('div', 'puente-prop-titulo');
    const x = el('button', 'puente-prop-x'); x.type = 'button'; x.setAttribute('aria-label', 'Cerrar');
    x.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M18.3 5.7a1 1 0 0 0-1.4 0L12 10.6 7.1 5.7a1 1 0 0 0-1.4 1.4l4.9 4.9-4.9 4.9a1 1 0 1 0 1.4 1.4l4.9-4.9 4.9 4.9a1 1 0 0 0 1.4-1.4L13.4 12l4.9-4.9a1 1 0 0 0 0-1.4Z"/></svg>';
    x.addEventListener('click', cerrar);
    const cab = el('div', 'puente-prop-cab'); cab.append(titulo, x);

    const modos = el('div', 'puente-prop-modos');
    const bModo = (t, label) => { const b = el('button', 'puente-prop-modo', label); b.type = 'button'; b.dataset.t = t; b.addEventListener('click', () => { tipo = t; pintar(); }); modos.appendChild(b); return b; };
    bModo('emoji', 'Emoji'); bModo('sticker', 'Sticker');

    const estadoBox = el('div', 'puente-prop-estado', 'Fijándome si podés proponer…');

    const zona = el('div', 'puente-prop-zona');
    const vista = el('div', 'puente-prop-vista');
    const img = el('img'); img.alt = ''; img.hidden = true;
    const vacio = el('span', 'puente-prop-vacio', 'Sin imagen');
    vista.append(img, vacio);
    const elegir = el('button', 'puente-prop-elegir', 'Elegí la imagen'); elegir.type = 'button';
    const archivo = el('input'); archivo.type = 'file'; archivo.accept = 'image/png,image/gif,image/webp,image/jpeg'; archivo.hidden = true;
    elegir.addEventListener('click', () => archivo.click());
    const info = el('div', 'puente-prop-info');
    const lado = el('div', 'puente-prop-lado'); lado.append(elegir, info);
    zona.append(vista, lado, archivo);

    const etiqueta = el('label', 'puente-prop-label', 'Nombre');
    const fila = el('div', 'puente-prop-nombre');
    const pre = el('span', 'puente-prop-dos', ':'), post = el('span', 'puente-prop-dos', ':');
    const nombre = el('input'); nombre.type = 'text'; nombre.autocomplete = 'off'; nombre.spellcheck = false; nombre.setAttribute('autocapitalize', 'off');
    fila.append(pre, nombre, post);
    nombre.addEventListener('input', () => {
      nombreTocado = true;
      const s = nombre.value.toLowerCase().replace(/\s/g, '_').replace(/[^a-z0-9_-]/g, '').slice(0, MAX[tipo]);
      if (s !== nombre.value) nombre.value = s;
      error.textContent = '';
    });
    const ayuda = el('div', 'puente-prop-ayuda', 'Se vota en #que-paso con 👍 o 👎. Si a la gente le gusta, un admin la aprueba.');
    const error = el('div', 'puente-prop-error');
    const pie = el('div', 'puente-prop-pie');
    const cancelar = el('button', 'puente-prop-btn', 'Cancelar'); cancelar.type = 'button'; cancelar.addEventListener('click', cerrar);
    const mandar = el('button', 'puente-prop-btn puente-prop-azul', 'Mandar propuesta'); mandar.type = 'button';
    pie.append(cancelar, mandar);

    caja.append(cab, modos, estadoBox, zona, etiqueta, fila, ayuda, error, pie);

    const limite = () => (estado ? (tipo === 'sticker' ? estado.stickerKb : estado.emojiKb) : (tipo === 'sticker' ? 512 : 256));
    function pintar() {
      titulo.textContent = tipo === 'sticker' ? 'Proponé un sticker' : 'Proponé un emoji';
      modos.querySelectorAll('.puente-prop-modo').forEach(b => b.classList.toggle('actual', b.dataset.t === tipo));
      vista.classList.toggle('sticker', tipo === 'sticker');
      pre.hidden = post.hidden = tipo === 'sticker';
      nombre.maxLength = MAX[tipo];
      nombre.placeholder = tipo === 'sticker' ? 'nombre-del-sticker' : 'nombre_del_emoji';
      if (nombre.value.length > MAX[tipo]) nombre.value = nombre.value.slice(0, MAX[tipo]);
      let t = 'PNG, GIF, WebP o JPG, hasta ' + limite() + ' KB.';
      if (imagen) t = kb(bytes) + ' KB' + (bytes > limite() * 1024 ? ' · pesa más de ' + limite() + ' KB' : ' · ' + t);
      info.textContent = t;
      info.classList.toggle('mal', !!imagen && bytes > limite() * 1024);
      mandar.disabled = mandando || !estado || !estado.puede;
      error.textContent = '';
    }
    archivo.addEventListener('change', () => {
      const f = archivo.files && archivo.files[0];
      archivo.value = '';
      if (!f) return;
      if (!/^image\/(png|gif|webp|jpeg)$/.test(f.type)) { error.textContent = 'La imagen tiene que ser PNG, GIF, WebP o JPG.'; return; }
      if (f.size > 4 * 1024 * 1024) { error.textContent = 'Esa imagen es muy pesada.'; return; }
      const lector = new FileReader();
      lector.onload = () => {
        imagen = String(lector.result || ''); bytes = f.size;
        img.src = imagen; img.hidden = false; vacio.hidden = true;
        if (!nombreTocado || !nombre.value) nombre.value = sanear(f.name, tipo);
        pintar();
      };
      lector.onerror = () => { error.textContent = 'No pude leer la imagen.'; };
      lector.readAsDataURL(f);
    });
    mandar.addEventListener('click', async () => {
      if (mandando) return;
      if (!imagen) { error.textContent = 'Elegí la imagen.'; return; }
      if (bytes > limite() * 1024) { error.textContent = 'La imagen pesa ' + kb(bytes) + ' KB: el máximo es ' + limite() + ' KB.'; return; }
      const n = nombre.value.trim();
      if (n.length < 2) { error.textContent = 'Poné un nombre (al menos 2 letras).'; nombre.focus(); return; }
      mandando = true; mandar.disabled = true; mandar.textContent = 'Mandando…';
      try {
        await api('/puente/api/propuestas/proponer', { tipo, nombre: n, imagen });
        cerrar();
        toast('¡Listo! Tu propuesta ya está en #que-paso para que la voten.', 'success');
      } catch (e) {
        mandando = false; mandar.textContent = 'Mandar propuesta'; mandar.disabled = false;
        error.textContent = e.message;
      }
    });

    pintar();
    document.body.appendChild(fondo);
    abierta = fondo;
    document.addEventListener('keydown', onKey, true);
    api('/puente/api/propuestas/estado').then(d => {
      if (abierta !== fondo) return;
      estado = d;
      estadoBox.textContent = d.puede ? (d.pendientes ? 'Tenés ' + d.pendientes + ' de ' + d.maxPendientes + ' propuestas esperando.' : '') : d.motivo;
      estadoBox.classList.toggle('mal', !d.puede);
      estadoBox.hidden = !estadoBox.textContent;
      pintar();
    }).catch(e => { if (abierta === fondo) { estadoBox.textContent = e.message; estadoBox.classList.add('mal'); } });
  }

  // ── El boton en los selectores ──
  function boton(tipoDe) {
    const b = el('button', 'puente-prop-abrir', '＋ Proponer');
    b.type = 'button';
    b.title = 'Proponé un emoji o un sticker para el club';
    b.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); abrir(tipoDe()); });
    return b;
  }
  function decorar() {
    if (!token()) return;
    // El del puente (PC): solo el de escribir, no el de reaccionar
    const rp = document.getElementById('puente-rp');
    if (rp && !rp.querySelector('.puente-prop-abrir')) {
      const head = rp.querySelector('.puente-rp-head');
      const input = rp.querySelector('.puente-rp-search input');
      if (head && input && input.placeholder !== 'Buscá la reacción perfecta') {
        const b = boton(() => {
          const m = rp.querySelector('.puente-rp-modo.actual');
          return m && m.textContent === 'Stickers' ? 'sticker' : 'emoji';
        });
        // en la fila de Stickers / Emoji, a la derecha (no suma alto); si no hay stickers, abajo del buscador
        const modos = rp.querySelector('.puente-rp-modos');
        if (modos) { b.classList.add('en-fila'); modos.appendChild(b); }
        else { head.classList.add('puente-prop-con'); head.appendChild(b); }
      }
    }
    // El de Haven (celular)
    const hp = document.getElementById('emoji-picker');
    if (hp && hp.style.display === 'flex' && !hp.querySelector('.puente-prop-abrir')) {
      const row = hp.querySelector(':scope > .emoji-section-row');
      const b = boton(() => {
        const g = hp.querySelector('.sticker-grid');
        return g && g.offsetParent !== null ? 'sticker' : 'emoji';
      });
      if (row) { b.classList.add('en-fila'); row.appendChild(b); } else hp.appendChild(b);
    }
  }
  const luego = () => { setTimeout(decorar, 60); setTimeout(decorar, 300); };
  document.addEventListener('click', luego, true);
  document.addEventListener('input', (e) => { if (e.target instanceof Element && e.target.closest('#puente-rp, #emoji-picker')) luego(); }, true);
  (function esperar(n) {
    if (!document.body) { if (n < 100) setTimeout(() => esperar(n + 1), 200); return; }
    new MutationObserver(() => { if (document.getElementById('puente-rp') || document.getElementById('emoji-picker')) decorar(); }).observe(document.body, { childList: true });
  })(0);

  // ── Admin → Propuestas ──
  const fecha = (ms) => new Date(ms).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Argentina/Buenos_Aires' });
  const ESTADOS = { pendiente: 'Esperando', aprobada: 'Aprobada', rechazada: 'Rechazada' };
  let ver = 'pendientes';
  function admin(box) {
    if (!box) return;
    box.textContent = '';
    const barra = el('div', 'pe-barra');
    barra.appendChild(el('div', 'pm-sub', 'Propuestas de emojis y stickers'));
    const filtros = el('div', 'pe-rangos');
    for (const [k, label] of [['pendientes', 'Esperando'], ['todas', 'Todas']]) {
      const b = el('button', 'pe-rango' + (ver === k ? ' actual' : ''), label); b.type = 'button';
      b.addEventListener('click', () => { ver = k; admin(box); });
      filtros.appendChild(b);
    }
    const act = el('button', 'pe-rango', 'Actualizar'); act.type = 'button'; act.addEventListener('click', () => admin(box));
    filtros.appendChild(act);
    barra.appendChild(filtros);
    const cuerpo = el('div', 'ppz-lista');
    cuerpo.appendChild(el('div', 'pm-sin', 'Cargando…'));
    box.append(barra, cuerpo);
    api('/puente/api/propuestas/admin' + (ver === 'todas' ? '?ver=todas' : '')).then(d => {
      cuerpo.textContent = '';
      const l = (d && d.propuestas) || [];
      if (!l.length) { cuerpo.appendChild(el('div', 'pm-sin', ver === 'todas' ? 'Todavía no hay propuestas.' : 'No hay propuestas esperando.')); return; }
      for (const p of l) cuerpo.appendChild(tarjeta(p, d.votosMin || 5, () => admin(box)));
    }).catch(e => { cuerpo.textContent = ''; cuerpo.appendChild(el('div', 'pm-sin', e.message)); });
  }
  function tarjeta(p, votosMin, recargar) {
    const t = el('div', 'ppz-item' + (p.lista ? ' lista' : '') + ' ppz-' + p.estado);
    const fig = el('div', 'ppz-img' + (p.tipo === 'sticker' ? ' sticker' : ''));
    if (p.imagen) { const i = el('img'); i.src = p.imagen; i.alt = p.nombre; i.loading = 'lazy'; fig.appendChild(i); } else fig.appendChild(el('span', '', p.tipo === 'sticker' ? '🖼️' : '🙂'));
    const datos = el('div', 'ppz-datos');
    const top = el('div', 'ppz-top');
    top.append(el('span', 'ppz-nombre', p.tipo === 'sticker' ? p.nombre : ':' + p.nombre + ':'), el('span', 'ppz-chip', p.tipo === 'sticker' ? 'Sticker' : 'Emoji'));
    if (p.estado !== 'pendiente') top.appendChild(el('span', 'ppz-chip ppz-chip-' + p.estado, ESTADOS[p.estado] || p.estado));
    else if (p.lista) top.appendChild(el('span', 'ppz-chip ppz-chip-lista', 'Lista para aprobar'));
    else if (!p.enPlazo) top.appendChild(el('span', 'ppz-chip', 'Votación cerrada'));
    datos.appendChild(top);
    datos.appendChild(el('div', 'ppz-meta', 'De ' + p.quien.nombre + (p.quien.usuario ? ' (@' + p.quien.usuario + ')' : '') + ' · ' + fecha(p.creado)));
    datos.appendChild(el('div', 'ppz-votos', '👍 ' + p.si + '   👎 ' + p.no + (p.estado === 'pendiente' && !p.lista ? '   (hacen falta ' + votosMin + ' 👍 y más 👍 que 👎)' : '')));
    if (p.motivo) datos.appendChild(el('div', 'ppz-meta', 'Motivo: ' + p.motivo));
    if (p.estado === 'pendiente') {
      const ops = el('div', 'ppz-ops');
      const err = el('div', 'puente-prop-error');
      const aprobar = el('button', 'puente-prop-btn puente-prop-azul', 'Aprobar'); aprobar.type = 'button';
      const rechazar = el('button', 'puente-prop-btn puente-prop-rojo', 'Rechazar'); rechazar.type = 'button';
      aprobar.addEventListener('click', () => {
        if (!p.lista && !confirm('Todavía no llegó a ' + votosMin + ' 👍 (o tiene más 👎). ¿La aprobás igual?')) return;
        aprobar.disabled = rechazar.disabled = true; err.textContent = '';
        api('/puente/api/propuestas/aprobar', { id: p.id }).then(() => { toast('Aprobada: ' + p.nombre, 'success'); recargar(); })
          .catch(e => { err.textContent = e.message; aprobar.disabled = rechazar.disabled = false; });
      });
      // El motivo, ahi mismo (sin ventanas del navegador)
      const motivoBox = el('div', 'ppz-motivo'); motivoBox.hidden = true;
      const motivo = el('textarea'); motivo.rows = 2; motivo.maxLength = 300; motivo.placeholder = 'Motivo (opcional): se lo contamos a quien la propuso';
      const confirmar = el('button', 'puente-prop-btn puente-prop-rojo', 'Rechazar propuesta'); confirmar.type = 'button';
      const volver = el('button', 'puente-prop-btn', 'Cancelar'); volver.type = 'button';
      const filaM = el('div', 'ppz-ops'); filaM.append(volver, confirmar);
      motivoBox.append(motivo, filaM);
      rechazar.addEventListener('click', () => { ops.hidden = true; motivoBox.hidden = false; motivo.focus(); });
      volver.addEventListener('click', () => { ops.hidden = false; motivoBox.hidden = true; });
      confirmar.addEventListener('click', () => {
        confirmar.disabled = true; err.textContent = '';
        api('/puente/api/propuestas/rechazar', { id: p.id, motivo: motivo.value }).then(() => { toast('Rechazada: ' + p.nombre, 'info'); recargar(); })
          .catch(e => { err.textContent = e.message; confirmar.disabled = false; });
      });
      ops.append(aprobar, rechazar);
      datos.append(ops, motivoBox, err);
    }
    t.append(fig, datos);
    return t;
  }
  window.puentePropuestas = { abrir, admin };
})();

// "Poné una contraseña" (clave.js): las cuentas que se crearon con Discord o con el foro tienen una
// contraseña al azar que nunca supieron, y el "Cambiar contraseña" de Haven pide la actual. En
// Ajustes -> Contraseña, a esas se les saca el campo de la actual y la nueva se pone con un codigo que
// llega a su email confirmado. El boton se ataja antes que Haven (en la captura); con la contraseña
// puesta queda todo como era. Haven y "Mi cuenta" (textosCuenta) vuelven a poner sus textos al abrir:
// se mira el boton y la ventana, y se vuelve a acomodar
(function () {
  'use strict';
  if (window.__puenteSinClave) return;
  window.__puenteSinClave = true;
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const token = () => { try { return localStorage.getItem('haven_token'); } catch { return null; } };
  const usuario = () => { try { return (JSON.parse(localStorage.getItem('haven_user') || 'null') || {}).username || ''; } catch { return ''; } };
  const BOTON = 'Poné una contraseña', BOTON_HAVEN = 'Cambiar contraseña';
  let estado = null, pidiendo = null, ultimo = 0, enviando = false, botonVisto = null;

  function api(p, body) {
    const h = { Authorization: 'Bearer ' + token() };
    const opts = body === undefined ? { headers: h } : { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, h), body: JSON.stringify(body) };
    return fetch('/puente/api/clave/' + p, opts).then(r => r.json().catch(() => ({})).then(d => ({ ok: r.ok, status: r.status, d: d || {} })))
      .catch(() => ({ ok: false, status: 0, d: { error: 'No hay conexión. Probá de nuevo.' } }));
  }
  // El estado, como mucho una vez por minuto (o ya, si se pide)
  function cargar(ya) {
    if (!token()) return Promise.resolve(null);
    if (pidiendo) return pidiendo;
    if (!ya && Date.now() - ultimo < 60000) return Promise.resolve(estado);
    pidiendo = api('estado').then(r => { pidiendo = null; ultimo = Date.now(); if (r.ok) estado = r.d; return estado; });
    return pidiendo;
  }
  function decir(t, tipo) {
    const s = $('password-status');
    if (!s) return;
    s.textContent = t || '';
    s.className = 'settings-hint' + (tipo ? ' ' + tipo : '');
  }
  function zona() {
    let z = $('puente-sinclave-zona');
    if (!z) {
      const btn = $('change-password-btn');
      if (!btn) return null;
      z = el('div'); z.id = 'puente-sinclave-zona'; z.style.marginTop = '8px';
      btn.insertAdjacentElement('afterend', z);
    }
    z.textContent = '';
    return z;
  }

  // Pone o saca lo de "sin contraseña" segun el estado
  function aplicar() {
    const btn = $('change-password-btn'), cur = $('current-password');
    if (!btn || !cur) return;
    if (botonVisto !== btn) { botonVisto = btn; new MutationObserver(aplicar).observe(btn, { childList: true, characterData: true, subtree: true }); }
    const grupo = cur.closest('.form-group') || cur;
    if (estado && estado.sinClave) {
      if (grupo.style.display !== 'none') { grupo.style.display = 'none'; grupo.dataset.puenteSinClave = '1'; }
      if (btn.textContent !== BOTON) btn.textContent = BOTON;
      if (!$('puente-sinclave-hint')) {
        const hint = el('small', 'settings-hint', `Tu cuenta se creó con ${estado.via === 'foro' ? 'el foro' : 'Discord'}: todavía no tiene contraseña.`);
        hint.id = 'puente-sinclave-hint'; hint.style.display = 'block'; hint.style.marginBottom = '6px';
        const form = btn.closest('.password-change-form') || btn.parentElement;
        form.insertBefore(hint, form.firstChild);
      }
    } else {
      if (grupo.dataset.puenteSinClave) { grupo.style.display = ''; delete grupo.dataset.puenteSinClave; }
      if (btn.textContent === BOTON) btn.textContent = BOTON_HAVEN;
      const hint = $('puente-sinclave-hint'); if (hint) hint.remove();
      const z = $('puente-sinclave-zona'); if (z) z.remove();
    }
  }

  function validar() {
    const np = ($('new-password') || {}).value || '', conf = ($('confirm-password') || {}).value || '';
    if (!np) return 'Escribí la contraseña nueva.';
    if (np.length < 8) return 'La contraseña tiene que tener 8 caracteres o más.';
    if (np.length > 128) return 'La contraseña puede tener hasta 128 caracteres.';
    if (np !== conf) return 'Las dos contraseñas no coinciden.';
    const u = usuario();
    if (u && np.toLowerCase().includes(u.toLowerCase())) return 'La contraseña no puede tener tu nombre de usuario adentro.';
    return null;
  }
  async function mandar() {
    const problema = validar();
    if (problema) return decir(problema, 'error');
    if (enviando) return;
    enviando = true;
    const btn = $('change-password-btn'); if (btn) btn.disabled = true;
    decir('Mandando el código…');
    const r = await api('codigo', {});
    enviando = false; if (btn) btn.disabled = false;
    if (!r.ok) {
      if (r.status === 409) { estado = Object.assign({}, estado, { sinClave: false }); aplicar(); cargar(true).then(aplicar); }
      decir(r.d.error || 'No se pudo. Probá de nuevo.', 'error');
      if (r.d.sinEmail && window.puenteEmail) {
        const z = zona();
        if (z) { const b = el('button', 'btn-sm btn-full', 'Agregar mi email'); b.type = 'button'; b.addEventListener('click', () => window.puenteEmail.open()); z.appendChild(b); }
      }
      return;
    }
    decir(`Te mandamos un código a ${r.d.email || 'tu email'}. Ponelo acá abajo.`);
    mostrarCodigo();
  }
  function mostrarCodigo() {
    const z = zona();
    if (!z) return;
    const g = el('div', 'form-group compact');
    const i = el('input'); i.type = 'text'; i.inputMode = 'numeric'; i.autocomplete = 'one-time-code'; i.maxLength = 7; i.placeholder = 'El código de 6 números';
    g.appendChild(i);
    const ok = el('button', 'btn-sm btn-full', 'Confirmar'); ok.type = 'button';
    const otro = el('button', 'btn-sm btn-full', 'Mandar otro código'); otro.type = 'button'; otro.style.marginTop = '6px';
    z.append(g, ok, otro);
    setTimeout(() => i.focus(), 50);
    const confirmar = async () => {
      const c = i.value.replace(/\D/g, '');
      if (c.length !== 6) return decir('El código tiene 6 números.', 'error');
      const problema = validar();
      if (problema) return decir(problema, 'error');
      ok.disabled = true;
      const r = await api('poner', { codigo: c, password: $('new-password').value });
      ok.disabled = false;
      if (!r.ok) return decir(r.d.error || 'No se pudo. Probá de nuevo.', 'error');
      listo();
    };
    ok.addEventListener('click', confirmar);
    i.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); confirmar(); } });
    otro.addEventListener('click', async () => {
      otro.disabled = true;
      const r = await api('codigo', {});
      if (r.ok) decir(`Listo: te mandamos otro a ${r.d.email || 'tu email'}.`); else decir(r.d.error || 'No se pudo.', 'error');
      setTimeout(() => { otro.disabled = false; }, 20000);
    });
  }
  function listo() {
    estado = Object.assign({}, estado, { sinClave: false }); ultimo = Date.now();
    for (const id of ['new-password', 'confirm-password']) { const x = $(id); if (x) x.value = ''; }
    aplicar();
    decir('✅ Listo, ya podés entrar con tu usuario y esta contraseña.', 'success');
    cargar(true).then(aplicar);
  }

  // El boton, antes que el de Haven
  document.addEventListener('click', (e) => {
    const b = e.target && e.target.closest ? e.target.closest('#change-password-btn') : null;
    if (!b || !estado || !estado.sinClave) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    mandar();
  }, true);

  // Al abrir Ajustes (la ventana cambia de estilo): el estado y acomodar
  let intentos = 0;
  function enganchar() {
    const m = $('settings-modal');
    if (!m) { if (++intentos < 30) setTimeout(enganchar, 1000); return; }
    const mirar = () => { if (m.style.display === 'none') return; aplicar(); cargar().then(aplicar); };
    new MutationObserver(mirar).observe(m, { attributes: true, attributeFilter: ['style', 'class'] });
    mirar();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', enganchar); else enganchar();
})();
