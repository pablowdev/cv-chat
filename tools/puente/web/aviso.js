// Vibracion cortita al abrir el perfil o el menu de una persona en el celular,
// como en la app de Discord (Android; en iPhone el navegador no lo permite)
function haptic() {
  try { if (navigator.vibrate && matchMedia('(pointer: coarse)').matches) navigator.vibrate(10); } catch { /* sin vibracion */ }
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
//  - Arriba de los canales, siempre, un recuadro con cuantos canales mas se ven
//    al vincular (asi el chat vacio no queda sin explicacion).
(function () {
  'use strict';
  const HIDE_KEY = 'puente_aviso_oculto_hasta';
  const HIDE_MS = 20 * 3600 * 1000; // hasta el otro dia
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
    const res = await fetch('/puente/api/estado', { headers: { Authorization: 'Bearer ' + token } }).catch(() => null);
    if (!res || !res.ok) return res && res.status === 401 ? false : true;
    const st = await res.json().catch(() => null);
    if (!st || st.vinculado || !st.disponible) return true;
    sidebarBox(st.canalesOcultos || 0);
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
      box.appendChild(el('div', 'pvc-titulo', hidden ? `🔒 Hay ${canales(hidden)}` : '🔗 ¿Estabas en Discord?'));
      box.appendChild(el('div', 'pvc-texto', hidden ? 'Vinculá tu Discord para verlos y recuperar tu historial.' : 'Vinculá tu cuenta para recuperar tu historial y verificar tu nombre.'));
      const go = el('button', 'pvc-boton'); go.type = 'button'; go.innerHTML = DISCORD_SVG; go.appendChild(el('span', null, 'Vincular con Discord'));
      go.addEventListener('click', () => start(go));
      box.appendChild(go);
      const ref = document.getElementById('puente-miembros-btn') || list;
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
    #puente-vincular-caja { margin: .5rem .5rem .375rem; padding: .75rem; border-radius: .625rem; background: rgba(88,101,242,.14); border: 1px solid rgba(88,101,242,.45); }
    #puente-vincular-caja .pvc-titulo { font-size: .9375rem; font-weight: 700; color: #f2f3f5; }
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
    const has = (code) => app.channels.some(c => c && c.code === code);
    const last = store(s => s.getItem(KEY));
    // Nunca una conversacion privada: en ese caso, el canal de inicio
    if (last && has(last) && !isPrivateChat(app, last)) return last;
    if (START && START.indexOf('__PUENTE') !== 0) {
      for (const name of START.split(',')) {
        const ch = app.channels.find(c => c && !c.is_dm && norm(c.name) === norm(name));
        if (ch) return ch.code;
      }
    }
    const first = app.channels.find(c => c && !c.is_dm && !c.is_group);
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
    ['edit', 'copy-text', 'copy-link', 'pin', 'unpin'],
    [], // el resto (proteger, mensaje oficial, etiquetas...)
    ['delete'],
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
    const raw = msgEl.dataset.rawContent;
    if (raw && raw.trim()) {
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

// PC: pagina "Miembros" como la de Discord (solo administradores): arriba de
// los canales, "Miembros" abre una tabla con todos los usuarios, desde cuando
// estan, su cuenta de Discord y su antiguedad, con que invitacion entraron,
// roles, cuantos mensajes escribieron y cuando fue el ultimo, y señales
// (administrador, sin vincular, sin email...). Se busca por nombre y se ordena
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
  const fecha = iso => (iso ? new Date(iso).toLocaleString('es-AR', { dateStyle: 'long', timeStyle: 'short' }) : '');

  let page = null, data = [], sortKey = 'desde', sortDir = -1, term = '';
  const COLS = [
    ['nombre', 'NOMBRE'], ['desde', 'MIEMBRO DESDE'], ['discord', 'SE UNIÓ A DISCORD'], ['invitacion', 'CÓMO ENTRÓ'],
    ['roles', 'ROLES'], ['mensajes', 'MENSAJES'], ['ultimo', 'ÚLTIMO MENSAJE'], ['senales', 'SEÑALES'],
  ];
  const value = (m, k) => k === 'nombre' ? String(m.nombre).toLowerCase() : k === 'discord' ? (m.discord && m.discord.desde) || '' :
    k === 'invitacion' ? m.invitacion || '' : k === 'roles' ? m.roles.length : k === 'senales' ? signals(m).length : (m[k] ?? '');
  function signals(m) {
    const out = [];
    if (m.admin) out.push(['Admin', 'admin']);
    if (m.enLinea) out.push(['En línea', 'ok']);
    if (m.invitado) out.push(['Invitado', 'gris']);
    if (!m.discord && !m.invitado) out.push(['Sin vincular', 'aviso']);
    if (m.email === 'pendiente') out.push(['Email sin confirmar', 'aviso']);
    else if (!m.email && !m.invitado) out.push(['Sin email', 'gris']);
    if (m.dosPasos) out.push(['2 pasos', 'ok']);
    return out;
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

  function renderRows() {
    const body = page.querySelector('.pm-filas');
    body.textContent = '';
    const q = term.trim().toLowerCase();
    const list = data.filter(m => !q || String(m.nombre).toLowerCase().includes(q) || String(m.usuario).toLowerCase().includes(q) ||
      (m.discord && String(m.discord.usuario || '').toLowerCase().includes(q)));
    list.sort((a, b) => { const x = value(a, sortKey), y = value(b, sortKey); return (x > y ? 1 : x < y ? -1 : 0) * sortDir; });
    page.querySelector('.pm-total').textContent = list.length === data.length ? data.length + ' miembros' : list.length + ' de ' + data.length;
    page.querySelectorAll('.pm-th').forEach(th => {
      th.classList.toggle('actual', th.dataset.k === sortKey);
      th.dataset.dir = th.dataset.k === sortKey ? (sortDir > 0 ? '▲' : '▼') : '';
    });
    if (mobile()) { renderList(body, list); if (!list.length) body.appendChild(el('div', 'pm-sin', 'No hay nadie con ese nombre.')); return; }
    for (const m of list) {
      const tr = el('div', 'pm-fila');
      const who = el('div', 'pm-c pm-nombre');
      const av = el('div', 'pm-avatar');
      if (m.avatar) { const img = el('img'); img.src = m.avatar; img.alt = ''; img.loading = 'lazy'; av.appendChild(img); }
      else av.textContent = String(m.nombre).charAt(0).toUpperCase();
      if (m.enLinea) av.appendChild(el('span', 'pm-punto'));
      const names = el('div', 'pm-nombres');
      names.append(el('div', 'pm-n1', m.nombre), el('div', 'pm-n2', m.usuario));
      who.append(av, names);
      const since = el('div', 'pm-c', ago(m.desde)); since.title = fecha(m.desde);
      const dc = el('div', 'pm-c');
      if (m.discord) { dc.textContent = ago(m.discord.desde); dc.title = '@' + m.discord.usuario + (m.discord.desde ? ' · cuenta creada el ' + fecha(m.discord.desde) : ''); }
      else { dc.textContent = '—'; dc.classList.add('pm-vacio'); }
      const how = el('div', 'pm-c');
      if (m.invitacion) { const chip = el('span', 'pm-chip pm-invitacion', m.invitacion); how.appendChild(chip); }
      else how.appendChild(el('span', 'pm-vacio', m.invitado ? 'Invitado' : 'Registro'));
      const rl = el('div', 'pm-c pm-roles');
      for (const r of m.roles.slice(0, 3)) {
        const chip = el('span', 'pm-chip');
        const dot = el('span', 'pm-rol-punto'); dot.style.background = r.color || '#80848e';
        chip.append(dot, document.createTextNode(r.nombre));
        rl.appendChild(chip);
      }
      if (m.roles.length > 3) rl.appendChild(el('span', 'pm-chip', '+' + (m.roles.length - 3)));
      const msgs = el('div', 'pm-c pm-num', m.mensajes.toLocaleString('es-AR'));
      const last = el('div', 'pm-c', ago(m.ultimo)); last.title = fecha(m.ultimo);
      const sig = el('div', 'pm-c pm-roles');
      for (const [label, kind] of signals(m)) sig.appendChild(el('span', 'pm-senal ' + kind, label));
      tr.append(who, since, dc, how, rl, msgs, last, sig);
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
      const bits = ['Desde ' + ago(m.desde).replace(/^hace /, 'hace '), m.mensajes.toLocaleString('es-AR') + (m.mensajes === 1 ? ' mensaje' : ' mensajes')];
      if (m.ultimo) bits.push('último ' + ago(m.ultimo));
      const meta = el('div', 'pm-item-meta', bits.join(' · '));
      const chips = el('div', 'pm-roles');
      for (const r of m.roles.slice(0, 2)) {
        const chip = el('span', 'pm-chip');
        const dot = el('span', 'pm-rol-punto'); dot.style.background = r.color || '#80848e';
        chip.append(dot, document.createTextNode(r.nombre));
        chips.appendChild(chip);
      }
      if (m.invitacion) chips.appendChild(el('span', 'pm-chip pm-invitacion', m.invitacion));
      for (const [label, kind] of signals(m)) chips.appendChild(el('span', 'pm-senal ' + kind, label));
      info.append(names, meta);
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
    const title = el('div', 'pm-titulo'); title.innerHTML = ICON; title.appendChild(el('span', '', 'Miembros'));
    const x = el('button', 'pm-cerrar'); x.type = 'button'; x.title = 'Cerrar (Esc)';
    x.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M18.3 5.7a1 1 0 0 0-1.4 0L12 10.6 7.1 5.7a1 1 0 0 0-1.4 1.4l4.9 4.9-4.9 4.9a1 1 0 1 0 1.4 1.4l4.9-4.9 4.9 4.9a1 1 0 0 0 1.4-1.4L13.4 12l4.9-4.9a1 1 0 0 0 0-1.4Z"/></svg>';
    x.addEventListener('click', close);
    // Los emails de todas las cuentas, en una planilla
    const dl = el('button', 'pm-descargar'); dl.type = 'button'; dl.title = 'Descargar los emails de todas las cuentas (planilla)';
    dl.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M11 3h2v9.2l3.3-3.3 1.4 1.4L12 16l-5.7-5.7 1.4-1.4 3.3 3.3V3ZM4 18h16v2H4v-2Z"/></svg>';
    dl.appendChild(el('span', '', 'Emails'));
    dl.addEventListener('click', () => {
      dl.disabled = true;
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
        .finally(() => { dl.disabled = false; });
    });
    head.append(title, dl, x);
    const card = el('div', 'pm-card');
    const bar = el('div', 'pm-bar');
    const h = el('div', 'pm-sub'); h.append(el('span', '', 'Miembros recientes'), el('span', 'pm-total', ''));
    const search = el('input', 'pm-buscar'); search.type = 'text'; search.placeholder = 'Buscar por nombre o usuario';
    search.addEventListener('input', () => { term = search.value; renderRows(); });
    bar.append(h, search);
    if (small) {
      const order = el('select', 'pm-orden');
      order.setAttribute('aria-label', 'Ordenar');
      for (const [v, label] of [['desde:-1', 'Más nuevos primero'], ['desde:1', 'Más viejos primero'], ['nombre:1', 'Por nombre'], ['mensajes:-1', 'Más mensajes'], ['ultimo:-1', 'Escribieron hace poco']]) {
        const o = el('option', null, label); o.value = v; order.appendChild(o);
      }
      order.value = sortKey + ':' + sortDir;
      if (order.value !== sortKey + ':' + sortDir) order.value = 'desde:-1';
      order.addEventListener('change', () => { const [k, dir] = order.value.split(':'); sortKey = k; sortDir = Number(dir); renderRows(); });
      bar.appendChild(order);
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
    card.append(bar, table);
    page.append(head, card);
    document.body.appendChild(page);
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

  // "Miembros" arriba de los canales, como en Discord
  function addEntry(app) {
    if (!app.user || !app.user.isAdmin) return;
    const pane = document.getElementById('channels-pane');
    const list = document.getElementById('channel-list');
    if (!pane || !list || document.getElementById('puente-miembros-btn')) return;
    const b = el('button', 'puente-miembros-btn');
    b.id = 'puente-miembros-btn'; b.type = 'button';
    b.innerHTML = ICON;
    b.appendChild(el('span', '', 'Miembros'));
    b.addEventListener('click', () => (page ? close() : open()));
    list.parentElement.insertBefore(b, list);
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
})();

// Pantallas tactiles: el selector de emojis y stickers del cuadro de escribir
// (tambien al editar un mensaje) como en la app de Discord: una hoja que sube
// desde abajo a media pantalla, con "Usados frecuentemente" arriba de todo.
// Deslizando la lista (o la manija) hacia arriba se agranda hasta casi toda la
// pantalla; hacia abajo se achica y, muy abajo, se cierra. Tocar afuera tambien
// la cierra. Es el mismo selector de Haven (emojis, stickers, buscador, tono de
// piel); solo cambia donde y como se muestra. El teclado no aparece mientras
// esta abierta, como en Discord, y el emoji se escribe donde estaba el cursor.
(function () {
  'use strict';
  if (!matchMedia('(pointer: coarse)').matches) return;
  const MIN_VH = 30, MAX_VH = 92, DEFAULT_VH = 50;
  let height = DEFAULT_VH; // como en Discord, siempre abre a media pantalla
  let frequent = null, frequentAt = 0;

  const picker = () => document.getElementById('emoji-picker');
  const isOpen = (p) => p && p.style.display === 'flex';
  const setHeight = (p, vh) => { p.style.setProperty('--puente-emojis-alto', vh + 'vh'); };
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
      height = Math.max(10, Math.min(MAX_VH, vh));
      setHeight(p, height);
      if (e.cancelable) e.preventDefault();
    }, { passive: false });
    el.addEventListener('touchend', () => {
      p.style.transition = '';
      const was = active;
      y0 = null; active = false;
      if (!was) return;
      if (height < MIN_VH - 5) { height = DEFAULT_VH; close(app); return; }
      height = Math.max(MIN_VH, height);
      setHeight(p, height);
    }, { passive: true });
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
      if (!isOpen(el)) { closeBackdrop(); height = DEFAULT_VH; if (el) el.classList.remove('puente-sin-subir'); }
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
  const setHeight = (p, vh) => p.style.setProperty('--puente-gifs-alto', vh + 'vh');
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
      height = Math.max(10, Math.min(MAX_VH, h0 + ((y0 - e.touches[0].clientY) / window.innerHeight) * 100));
      setHeight(p, height);
      if (e.cancelable) e.preventDefault();
    }, { passive: false });
    el.addEventListener('touchend', () => {
      p.style.transition = '';
      const was = active; y0 = null; active = false;
      if (!was) return;
      if (height < MIN_VH - 5) { height = DEFAULT_VH; close(app); return; }
      height = Math.max(MIN_VH, height);
      setHeight(p, height);
    }, { passive: true });
  }
  function decorate(app) {
    const p = picker();
    if (!isOpen(p)) { closeBackdrop(); return; }
    if (p.parentElement !== document.body) document.body.appendChild(p);
    p.classList.add('puente-gif-sheet');
    if (document.documentElement.classList.contains('puente-hoja-cambio')) p.classList.add('puente-sin-subir'); // cambio de pestaña: aparece sin subir
    setHeight(p, height);
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
      if (!isOpen(el)) { closeBackdrop(); height = DEFAULT_VH; if (el) el.classList.remove('puente-sin-subir'); }
      else { try { decorate(app); } catch (err) { console.warn('[puente] selector de GIFs:', err); } }
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

  // Ir al canal y al mensaje (o al hilo y a su mensaje)
  async function open(app, r) {
    if (!r || !r.codigo) return;
    if (app.currentChannel !== r.codigo) { app.switchChannel(r.codigo); await sleep(650); }
    if (r.hilo) {
      app._jumpToMessage(r.hilo);
      if (typeof app._openThread === 'function') app._openThread(r.hilo);
      for (let i = 0; i < 40; i++) {
        const el = document.querySelector('#thread-panel [data-msg-id="' + r.mensaje + '"]');
        if (el) { flash(el); return; }
        await sleep(100);
      }
    } else if (r.mensaje) app._jumpToMessage(r.mensaje);
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
  function openUrl(href) { const p = parse(href); if (!p) return false; resolve(p).then(res => { if (res.data && window.app) open(window.app, res.data); }); return true; }
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
      return true;
    });
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
        box.appendChild(v);
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
    return c;
  }

  function render(app, msgEl, list) {
    const content = msgEl.querySelector('.message-content, .thread-msg-content');
    if (!content) return;
    content.querySelectorAll(':scope .link-preview, :scope > .puente-embeds').forEach(n => n.remove());
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
      try { msgs = containerEl ? msgsIn(containerEl) : []; } catch { msgs = []; }
      if (!msgs.length) return orig.call(self, containerEl, ...rest);
      msgs.forEach(m => defer(m, true));
      load(msgs.map(m => m.dataset.msgId)).finally(() => {
        for (const m of msgs) {
          const list = known.get(m.dataset.msgId);
          if (list) render(self, m, list);
          else defer(m, false); // sin embed de Discord: la vista previa de Haven
        }
        orig.call(self, containerEl, ...rest);
      });
    };
    // El embed de Discord llega un instante despues del mensaje: se reemplaza al vuelo
    app.socket.on('puente-embeds', (d) => {
      if (!d || !d.messageId || !Array.isArray(d.embeds)) return;
      const id = String(d.messageId);
      known.set(id, d.embeds);
      document.querySelectorAll('[data-msg-id="' + id + '"]').forEach(m => { defer(m, true); render(app, m, d.embeds); });
    });
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
      return { emoji: b.dataset.emoji, users: users.map(n => ({ name: n })) };
    });
    let data = fromBadges;
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
        if (u.avatar) { const img = el('img'); img.src = u.avatar; img.alt = ''; img.loading = 'lazy'; av.appendChild(img); }
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

    const tk = token();
    if (tk) {
      fetch('/puente/api/reacciones?mensaje=' + msgId, { headers: { Authorization: 'Bearer ' + tk } })
        .then(r => (r.ok ? r.json() : null))
        .then(d => { if (d && Array.isArray(d.reacciones) && document.getElementById('puente-who-sheet') === sheet) { data = d.reacciones; render(); } })
        .catch(() => {});
    }

    // Manija: hacia arriba se agranda, hacia abajo se cierra
    sheetDrag(sheet, { close, scroller: list });
  }

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
    const items = [...document.querySelectorAll('#dm-list .dm-item')];
    if (!items.length) { box.appendChild(el('div', 'puente-dm-home-empty', 'Todavía no tenés mensajes directos. Para empezar uno, tocá el nombre de una persona y elegí "Mensaje".')); return; }
    for (const item of items) {
      const row = el('button', 'puente-dm-home-row');
      row.type = 'button';
      const av = item.querySelector('.puente-dm-avatar');
      row.appendChild(av ? av.cloneNode(true) : el('span', 'puente-dm-avatar', '?'));
      row.appendChild(el('span', 'puente-dm-home-name', ((item.querySelector('.channel-name') || {}).textContent || '').trim()));
      row.appendChild(el('span', 'puente-dm-home-chat', '💬'));
      row.addEventListener('click', () => { if (window.app) window.app.switchChannel(item.dataset.code); });
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
    srv.addEventListener('click', () => showDms(false));
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
    if (brand && typeof st.miembros === 'number' && !document.getElementById('puente-server-info')) {
      const info = el('div', 'puente-server-info', st.miembros.toLocaleString('es-AR') + ' miembros');
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
    const app = window.app;
    const account = document.querySelector('[data-haven-region="account"]');
    if (!app || !account) { if (++tries < 120) setTimeout(wait, 500); return; }
    account.addEventListener('click', (e) => {
      if (!pc() || !(e.target instanceof Element) || !e.target.closest('.user-names, .puente-account-avatar')) return;
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
  document.addEventListener('keyup', (e) => { if (e.shiftKey || e.key.startsWith('Arrow') || e.key === 'a') setTimeout(check, 0); }, true);
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
    if (mod && !e.altKey && (e.key.toLowerCase() === 'z' || e.key.toLowerCase() === 'y')) {
      e.preventDefault();
      const back = e.key.toLowerCase() === 'z' && !e.shiftKey;
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
      delete ta.value; delete ta.focus; delete ta.blur;
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
    if (channels && shown && fonts && settled) {
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
    chevron: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M9.3 5.3a1 1 0 0 1 1.4 0l6 6a1 1 0 0 1 0 1.4l-6 6a1 1 0 1 1-1.4-1.4L14.6 12 9.3 6.7a1 1 0 0 1 0-1.4Z"/></svg>',
  };
  // Opciones de Haven: nombre como en Discord, icono y grupo
  const ITEMS = {
    edit: ['Editar mensaje', I.edit, 1], reply: ['Responder', I.reply, 1], quote: ['Citar', I.quote, 1], thread: ['Crear hilo', I.thread, 1],
    'puente-copiar': ['Copiar texto', I.copy, 2], pin: ['Fijar mensaje', I.pin, 2], unpin: ['Desfijar mensaje', I.pin, 2],
    'copy-link': ['Copiar enlace del mensaje', I.link, 2], 'copy-href': ['Copiar dirección del enlace', I.link, 2],
    archive: [null, I.shield, 3], unarchive: [null, I.shield, 3], 'edit-tags': [null, I.tag, 3], 'edit-role-menu': [null, I.tag, 3],
    'highlight-on': [null, I.megaphone, 3], 'highlight-off': [null, I.megaphone, 3],
    delete: ['Eliminar mensaje', I.trash, 4],
  };
  const ORDER = ['edit', 'reply', 'quote', 'thread', 'puente-copiar', 'pin', 'unpin', 'copy-link', 'copy-href'];

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
  function rawText(app, msgEl) {
    const id = parseInt(msgEl.dataset.msgId, 10);
    const m = (app._lastRenderedMessages || []).find(x => x && x.id === id);
    if (m && typeof m.content === 'string') return m.content;
    const c = msgEl.querySelector('.message-content');
    return c ? c.innerText : '';
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
    const used = new Set(['react']);
    for (const a of ORDER) if (by.has(a)) { used.add(a); groups[(ITEMS[a] || [0, 0, 3])[2] - 1].push(row(by.get(a), a)); }
    for (const [a, b] of by) if (!used.has(a) && a !== 'delete') groups[2].push(row(b, a));
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

  function paint(popup, profile, data, isSelf) {
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
    if (isSelf) {
      const a = document.createElement('a');
      a.className = 'puente-historia-btn';
      a.href = '/puente/historia';
      a.textContent = '📖 Tu historia';
      a.addEventListener('click', (e) => { e.preventDefault(); openHistoria(); });
      (popup.querySelector('.puente-medallas') || names).insertAdjacentElement('afterend', a);
      const inv = document.createElement('button');
      inv.type = 'button'; inv.className = 'puente-invitar-btn'; inv.textContent = '🤝 Invitar gente';
      inv.addEventListener('click', () => { try { window.app._closeProfilePopup(); } catch { /* sigue */ } if (window.puenteInvitar) window.puenteInvitar(); });
      a.insertAdjacentElement('afterend', inv);
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
          load(profile.id).then(data => paint(popup, profile, data, isSelf)).catch(() => paint(popup, profile, null, isSelf));
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
        if (!ch.topic && !canEdit(window.app)) return;
        e.preventDefault();
        openSheet(window.app, ch);
      });
    }
    const ch = current(app);
    const topic = ch && !ch.is_dm ? String(ch.topic || '').replace(/\s+/g, ' ').trim() : '';
    line.textContent = topic;
    line.hidden = !topic;
    info.classList.toggle('puente-con-tema', !!topic);
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
    for (const [sec, one, many] of [[86400 * 30, 'mes', 'meses'], [86400, 'día', 'días'], [3600, 'hora', 'horas'], [60, 'minuto', 'minutos']]) {
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
    enlace.addEventListener('click', () => compartir(location.origin + '/app?mercado', 'Marketplace · __PUENTE_APP__'));
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
    const status = el('div', 'mk-estado', 'Cargando…'); b.appendChild(status);

    let desde = 0, loading = false, more = true, seq = 0;
    async function load(reset) {
      if (reset) { desde = 0; more = true; grid.textContent = ''; status.textContent = 'Cargando…'; }
      if (loading && !reset) return;
      if (!more) return;
      loading = true;
      const my = ++seq;
      const qs = new URLSearchParams();
      for (const k of Object.keys(filters)) if (filters[k]) qs.set(k, filters[k]);
      qs.set('desde', String(desde));
      const d = await api('lista?' + qs);
      if (my !== seq || !page || !grid.isConnected) return;
      loading = false;
      if (d.error) { status.textContent = d.error; return; }
      state = { puedePublicar: d.puedePublicar };
      setBadge(d.pendientes);
      pend(b.querySelector('.mk-pend-lugar'), d.pendientes);
      for (const it of d.items) grid.appendChild(tile(it));
      desde += d.items.length; more = !!d.mas;
      status.textContent = grid.children.length ? (more ? 'Cargando…' : '') :
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
    const c = el('button', 'mk-tarjeta'); c.type = 'button';
    const ph = el('div', 'mk-tfoto');
    if (it.foto) { const i = el('img'); i.src = it.foto; i.alt = ''; i.loading = 'lazy'; ph.appendChild(i); }
    else ph.innerHTML = svg(it.tipo === 'servicio' ? I.tienda : I.foto, 34);
    if (it.estado === 'vendida') ph.appendChild(el('span', 'mk-sello', 'Vendido'));
    else if (it.vencida) ph.appendChild(el('span', 'mk-sello gris', 'Vencida'));
    else if (it.oculta) ph.appendChild(el('span', 'mk-sello rojo', 'Oculta'));
    c.append(ph, el('div', 'mk-tprecio', money(it.precio, it.moneda)), el('div', 'mk-ttitulo', it.titulo));
    const meta = [it.tipo === 'servicio' ? 'Servicio' : it.condicion === 'nuevo' ? 'Nuevo' : it.condicion === 'usado' ? 'Usado' : '', it.zona || ''].filter(Boolean).join(' · ');
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
        strip.addEventListener('scroll', () => { const k = Math.round(strip.scrollLeft / strip.clientWidth); dots.querySelectorAll('span').forEach((s, j) => s.classList.toggle('on', j === k)); }, { passive: true });
        car.appendChild(dots);
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
      s.addEventListener('click', () => go('perfil', it.vendedor.id));
      b.appendChild(s);
    }

    const acts = el('div', 'mk-acciones');
    const btn = (label, cls, fn, icon) => { const x = el('button', 'mk-btn ' + (cls || '')); x.type = 'button'; if (icon) x.innerHTML = svg(icon, 18); x.appendChild(el('span', '', label)); x.addEventListener('click', fn); acts.appendChild(x); return x; };
    if (!it.mia) {
      if (it.estado === 'activa') btn('Escribir al vendedor', 'mk-primario', () => writeTo(it), I.msj);
      const g = btn(it.guardada ? 'Guardado' : 'Guardar', it.guardada ? 'on' : '', async () => {
        const si = !g.classList.contains('on');
        const r = await api('guardar', { id: it.id, si });
        if (r.error) return toast(r.error, 'error');
        g.classList.toggle('on', si); g.querySelector('span').textContent = si ? 'Guardado' : 'Guardar';
      }, I.corazon);
    }
    btn('Compartir', '', () => share(it));
    if (it.mia) {
      btn('Editar', '', () => go('publicar', it));
      if (it.estado === 'activa') btn(it.tipo === 'servicio' ? 'Registrar una venta' : 'Marcar como vendido', 'mk-primario', () => go('vendido', it));
      if (it.estado === 'vendida') btn('Volver a publicar', '', async () => { const r = await api('reactivar', { id: it.id }); if (r.error) return toast(r.error, 'error'); show('item', it.id); });
      if (it.estado === 'activa' && (it.vencida || it.vence - Date.now() < 7 * 864e5)) btn('Renovar 30 días', '', async () => { const r = await api('renovar', { id: it.id }); if (r.error) return toast(r.error, 'error'); toast('Publicación renovada', 'success'); show('item', it.id); });
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
  // Enlace a la vidriera (/app?mercado), para pasarlo por un canal, WhatsApp o donde sea
  function compartir(url, title) {
    if (navigator.share && mobile()) { navigator.share({ title, url }).catch(() => {}); return; }
    const done = () => toast('Enlace copiado: pegalo en un canal o en un mensaje', 'success');
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, () => prompt('Copiá el enlace:', url));
    else prompt('Copiá el enlace:', url);
  }
  function share(it) {
    const url = linkOf(it), text = `${it.titulo} · ${money(it.precio, it.moneda)}`;
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
    // Enlaces a una publicacion (/app?mercado=<id>) o a la vidriera (/app?mercado): se abren aca mismo
    document.addEventListener('click', (e) => {
      const a = e.target instanceof Element && e.target.closest('a[href]');
      if (!a || e.ctrlKey || e.metaKey) return;
      let u; try { u = new URL(a.href, location.href); } catch { return; }
      if (u.origin !== location.origin || !/^\/app/.test(u.pathname) || !u.searchParams.has('mercado')) return;
      const id = u.searchParams.get('mercado');
      if (id && !/^\d+$/.test(id)) return;
      e.preventDefault(); e.stopPropagation();
      stack = []; if (id) go('item', id); else go('lista');
    }, true);
    const mq = new URLSearchParams(location.search), sp = mq.get('mercado');
    if (mq.has('mercado') && (!sp || /^\d+$/.test(sp))) setTimeout(() => { stack = []; if (sp) go('item', sp); else go('lista'); }, 1500);
    addEventListener('resize', () => { if (page && !mobile()) { const bar = byId('server-bar'); page.style.left = bar ? Math.round(bar.getBoundingClientRect().right) + 'px' : '0'; } else if (page) page.style.left = ''; });
  })();
})();

// Juegos (truco.js y funball.js): el Truco argentino y el Funball (el de DOS de 1995),
// 1 contra 1, contra otra persona o contra la compu. Se entra con el icono de las cartas, debajo del
// Marketplace en la columna de la izquierda. La sala: crear partida (a 15 o 30,
// con o sin flor; mesa abierta, desafiar a alguien o la compu), las que te
// desafiaron, tus partidas, las mesas que esperan rival, tu récord y el ranking
// del mes. La mesa: las cartas del rival boca abajo, las tres bazas en el paño,
// tus cartas abajo (se tocan para jugar) y los cantos que se pueden hacer en
// ese momento (los decide el servidor). Un enlace /app?truco=<id> abre la mesa, /app?juegos la
// biblioteca y /app?juegos=truco la sala de ese juego (el boton del enlace, arriba a la derecha).
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
  const BTN = {
    truco: '¡Truco!', retruco: '¡Quiero retruco!', vale4: '¡Vale cuatro!', envido: 'Envido', real: 'Real envido', falta: 'Falta envido',
    flor: '¡Flor!', quiero: '¡Quiero!', noquiero: 'No quiero', mazo: 'Al mazo',
  };
  const CANTO = { truco: '¡Truco!', retruco: '¡Quiero retruco!', vale4: '¡Quiero vale cuatro!', envido: 'Envido', real: 'Real envido', falta: 'Falta envido' };
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
  // Cada servidor puede tener su dibujo para cada carta (/puente/cartas/<palo>-<n>.webp,
  // no va al repositorio); si no esta, la carta simple con el numero y el palo
  let conDibujos = true;
  const CARTAS_V = 2; // subir cuando se cambian los dibujos, para que no quede la version vieja guardada
  // Los palos dibujados como en la baraja española: el oro dorado, la copa roja con pie
  // dorado, la espada de hoja clara con empuñadura azul y el basto verde con nudos
  const PALO_SVG = {
    oro: '<circle cx="12" cy="16" r="10.6" fill="#f6c430" stroke="#9a6a00" stroke-width="1.4"/><circle cx="12" cy="16" r="7.4" fill="#fbd75b" stroke="#b07d00" stroke-width="1"/>'
      + '<path d="M12 10.2l1.5 3.5 3.8.3-2.9 2.5.9 3.7L12 18.2l-3.3 2 .9-3.7-2.9-2.5 3.8-.3z" fill="#d9480f"/>',
    copa: '<path d="M4.5 5.5h15c0 6.2-3.2 10.2-7.5 10.2S4.5 11.7 4.5 5.5z" fill="#c8102e" stroke="#7a0a1c" stroke-width="1.2" stroke-linejoin="round"/>'
      + '<rect x="3.8" y="4" width="16.4" height="2.6" rx="1.2" fill="#f2b705" stroke="#8a6500" stroke-width=".9"/>'
      + '<path d="M10.6 15.4h2.8l-.3 9.2h-2.2z" fill="#f2b705" stroke="#8a6500" stroke-width=".9"/><ellipse cx="12" cy="19.6" rx="2.7" ry="1.4" fill="#f2b705" stroke="#8a6500" stroke-width=".9"/>'
      + '<path d="M5.8 29.5c1-3.6 3.5-5.2 6.2-5.2s5.2 1.6 6.2 5.2z" fill="#f2b705" stroke="#8a6500" stroke-width=".9" stroke-linejoin="round"/>',
    espada: '<path d="M12 1.5l2.3 4V20H9.7V5.5z" fill="#e3eaf2" stroke="#1e5aa8" stroke-width="1.1" stroke-linejoin="round"/><path d="M12 4.5V19.5" stroke="#9fb3c8" stroke-width=".8"/>'
      + '<path d="M3.5 20.2c2 .9 4.5 1 8.5 1s6.5-.1 8.5-1v2.4c-2 .9-4.5 1-8.5 1s-6.5-.1-8.5-1z" fill="#1e5aa8" stroke="#123a70" stroke-width=".8"/>'
      + '<rect x="10.6" y="23.4" width="2.8" height="5" rx=".6" fill="#8a5a2b" stroke="#4d2f12" stroke-width=".7"/><circle cx="12" cy="29.9" r="1.8" fill="#f2b705" stroke="#8a6500" stroke-width=".8"/>',
    basto: '<g transform="rotate(-14 12 16)"><path d="M9.6 11.2L5.7 8.4l1.3-1.9 3.3 2.4zM15.6 17.6l3.6-2.3 1.2 1.9-3.5 2.2zM9.9 23.4l-3 -1.6.9-1.7 2.7 1.4z" fill="#b5722f" stroke="#5e3512" stroke-width="1" stroke-linejoin="round"/>'
      + '<ellipse cx="6.3" cy="7.4" rx="1.3" ry="1" fill="#f0d7a8" stroke="#7a4a1e" stroke-width=".7"/><ellipse cx="19.9" cy="16.2" rx="1.3" ry="1" fill="#f0d7a8" stroke="#7a4a1e" stroke-width=".7"/><ellipse cx="7.3" cy="20.9" rx="1.1" ry=".9" fill="#f0d7a8" stroke="#7a4a1e" stroke-width=".7"/>'
      + '<path d="M10.4 30.4L9.3 14C8.5 7 9.9 2.3 12.8 2.3s4.2 4.7 3.2 11.7l-1.7 16.4z" fill="#b5722f" stroke="#5e3512" stroke-width="1.2" stroke-linejoin="round"/>'
      + '<path d="M11.3 4.6c.7-1 1.7-1.2 2.6-.5M11 9v15" stroke="#dca063" stroke-width=".9" fill="none" stroke-linecap="round"/>'
      + '<path d="M12.3 7.5l1.6.6M13.6 13l1.4.5M11.6 19l1.6.5M12.4 25.5l1.4.4" stroke="#5e3512" stroke-width="1" stroke-linecap="round"/>'
      + '<ellipse cx="12.3" cy="30.5" rx="2" ry=".8" fill="#f0d7a8" stroke="#7a4a1e" stroke-width=".7"/></g>',
  };
  const palo = (p, cls) => { const s = el('span', cls); s.innerHTML = `<svg viewBox="0 0 24 32" aria-hidden="true">${PALO_SVG[p] || ''}</svg>`; return s; };
  const plain = (d, c) => d.replaceChildren(el('span', 'jg-num', String(c.n)), palo(c.p, 'jg-palo'), el('span', 'jg-num abajo', String(c.n)));
  function card(c, cls) {
    const d = el('div', 'jg-carta ' + (cls || '') + (c ? ' palo-' + c.p : ' dorso'));
    if (!c) return d;
    d.title = `${c.n} de ${c.p}`;
    if (!conDibujos) { plain(d, c); return d; }
    const img = el('img', 'jg-dibujo');
    img.alt = ''; img.draggable = false; img.decoding = 'async';
    img.onerror = () => { conDibujos = false; d.classList.remove('con-dibujo'); plain(d, c); };
    img.src = `/puente/cartas/${c.p}-${c.n}.webp?v=${CARTAS_V}`;
    const esq = (abajo) => { const e = el('span', 'jg-esq' + (abajo ? ' abajo' : '')); e.append(el('b', null, String(c.n)), palo(c.p, 'jg-esq-palo')); return e; };
    d.classList.add('con-dibujo');
    d.append(img, esq(false), esq(true));
    return d;
  }
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

  // ── La pantalla ──
  let page = null, stack = [], mesa = null, tickT = null;
  function close() {
    if (!page) return;
    page.remove(); page = null; stack = []; mesa = null; clearInterval(tickT);
    document.querySelectorAll('.puente-jg-btn').forEach(b => b.classList.remove('active'));
  }
  function back() {
    if (stack.length > 1) { stack.pop(); const [v, a] = stack[stack.length - 1]; show(v, a); }
    else close();
  }
  window.puenteJuegos = { abierto: () => !!page, atras: back, abrir: (id) => { stack = []; id ? go('mesa', id) : go('inicio'); }, abrirFunball: (id) => { stack = [['inicio']]; id ? go('fbMesa', id) : go('inicio', 'funball'); } };
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
  function go(view, arg) { frame(); stack.push([view, arg]); show(view, arg); }
  // Boton para pasar el enlace de la biblioteca (/app?juegos) o de un juego (/app?juegos=truco)
  function botonEnlace(ruta, titulo) {
    const b = el('button', 'jg-icono'); b.type = 'button';
    b.title = mobile() ? 'Compartir' : 'Copiar enlace'; b.setAttribute('aria-label', b.title);
    b.innerHTML = svg(I.enlace, 22);
    b.addEventListener('click', () => {
      const url = location.origin + ruta;
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
    clearInterval(tickT); mesa = null;
    page.textContent = '';
    fbMesa = null;
    if (fbCam.tutZ != null && view !== 'fbTutorial') { fbCam.z = fbCam.tutZ; fbCam.tutZ = null; }
    try { ({ inicio, crear, mesa: table, fbCrear, fbMesa: fbTable, fbReglas, fbTutorial })[view](arg); } catch (err) { console.warn('[puente] juegos:', err); }
  }

  // ── Sala ──
  // La biblioteca, como la de Steam: cada juego es una tarjeta con su tapa. Para sumar un juego
  // nuevo alcanza con agregarlo aca (id = la vista de su sala, evento = el que da sus partidas)
  const JUEGOS = [
    { id: 'truco', nombre: 'Truco', sub: 'Argentino, 1 contra 1', evento: 'truco:inicio', tapa: () => `/puente/cartas/banner.webp?v=${CARTAS_V}`, fondo: '#0d1410' },
    { id: 'funball', nombre: 'Funball', sub: 'El clásico de DOS de 1995', evento: 'funball:inicio', tapa: () => FB_ARTE + 'logo.webp', fondo: "url('/puente/funball/fondo.webp') 0 0 / 256px repeat, #4a3f37", ajuste: 'contain', mesa: 'fbMesa' },
  ];
  async function biblioteca() {
    page.appendChild(head('Juegos', botonEnlace('/app?juegos', 'Juegos · __PUENTE_APP__')));
    const b = el('div', 'jg-bib'); page.appendChild(b);
    const seguir = el('div'); b.appendChild(seguir);
    b.appendChild(el('div', 'jg-bib-titulo', `Tus juegos (${JUEGOS.length})`));
    const grilla = el('div', 'jg-tapas'); b.appendChild(grilla);
    const tarjetas = {};
    for (const j of JUEGOS) {
      const t = el('button', 'jg-tapa'); t.type = 'button'; t.setAttribute('aria-label', j.nombre);
      const caja = el('div', 'jg-tapa-img'); caja.style.background = j.fondo;
      const img = el('img'); img.alt = ''; img.draggable = false; img.src = j.tapa();
      if (j.ajuste) img.style.objectFit = j.ajuste;
      img.addEventListener('error', () => { img.remove(); caja.appendChild(el('div', 'jg-tapa-sin', j.nombre)); });
      const badge = el('span', 'jg-tapa-badge'); badge.style.display = 'none';
      caja.append(img, badge);
      t.append(caja, el('div', 'jg-tapa-n', j.nombre), el('div', 'jg-tapa-s', j.sub));
      t.addEventListener('click', () => go('inicio', j.id));
      grilla.appendChild(t);
      tarjetas[j.id] = { t, badge };
    }
    const pronto = el('div', 'jg-tapa pronto');
    const pc = el('div', 'jg-tapa-img'); pc.appendChild(el('div', 'jg-tapa-sin', '＋'));
    pronto.append(pc, el('div', 'jg-tapa-n', 'Más juegos'), el('div', 'jg-tapa-s', 'Muy pronto'));
    grilla.appendChild(pronto);
    // las partidas en curso de todos los juegos, primero las que te toca
    const datos = await Promise.all(JUEGOS.map(j => emit(j.evento).catch(() => ({ error: true }))));
    if (!page || !b.isConnected) return;
    const curso = [];
    JUEGOS.forEach((j, i) => {
      const d = datos[i];
      if (!d || d.error) return;
      if (d.tableros && !d.tableros.length) { tarjetas[j.id].t.remove(); return; }
      const mias = (d.mias || []).filter(m => m.estado !== 'terminada');
      const n = mias.filter(m => m.teToca).length + (d.abiertas || []).filter(a => a.paraVos).length;
      if (n) { tarjetas[j.id].badge.textContent = n === 1 ? 'Te toca' : `${n} pendientes`; tarjetas[j.id].badge.style.display = ''; }
      for (const m of mias) curso.push({ j, m });
    });
    if (!curso.length) return;
    curso.sort((a, z) => (z.m.teToca ? 1 : 0) - (a.m.teToca ? 1 : 0));
    seguir.appendChild(el('div', 'jg-bib-titulo', 'Seguir jugando'));
    const l = el('div', 'jg-seguir'); seguir.appendChild(l);
    for (const { j, m } of curso.slice(0, 6)) {
      const who = m.rival || m.invitado || { nombre: '?' };
      const r = el('button', 'jg-fila'); r.type = 'button';
      const tx = el('div', 'jg-ftexto');
      tx.append(el('div', 'jg-fnombre', m.estado === 'esperando' ? (m.invitado ? `Esperando a ${m.invitado.nombre}` : 'Esperando rival') : `vs ${who.nombre}`), el('div', 'jg-fmeta', j.nombre));
      r.append(avatar(m.estado === 'esperando' && !m.invitado ? { nombre: '?' } : who), tx);
      if (m.teToca) r.appendChild(el('span', 'jg-chip amarillo', 'Te toca'));
      r.addEventListener('click', () => go(j.mesa || 'mesa', m.id));
      l.appendChild(r);
    }
  }
  async function inicio(which) {
    if (which === 'funball') return fbInicio();
    if (which !== 'truco') return biblioteca();
    page.appendChild(head('Truco', botonEnlace('/app?juegos=truco', 'Truco · __PUENTE_APP__')));
    const b = el('div', 'jg-cuerpo jg-inicio'); page.appendChild(b);
    const hero = el('div', 'jg-hero');
    hero.append(el('div', 'jg-hero-cartas', '🂡'), el('div', 'jg-hero-t', 'Truco'), el('div', 'jg-hero-s', 'Argentino, 1 contra 1'));
    // el banner de este servidor (/puente/cartas/banner.webp, no va al repositorio); si no esta, el de siempre
    const ban = el('img', 'jg-banner'); ban.alt = 'Truco'; ban.src = `/puente/cartas/banner.webp?v=${CARTAS_V}`;
    ban.addEventListener('load', () => { hero.querySelector('.jg-hero-cartas')?.remove(); hero.querySelector('.jg-hero-t')?.remove(); hero.classList.add('jg-con-banner'); });
    ban.addEventListener('error', () => ban.remove());
    hero.prepend(ban);
    const btns = el('div', 'jg-acciones');
    const nb = el('button', 'jg-btn jg-primario', 'Crear partida'); nb.type = 'button'; nb.addEventListener('click', () => go('crear'));
    const cb = el('button', 'jg-btn', 'Jugar con la compu'); cb.type = 'button';
    cb.addEventListener('click', async () => { const r = await emit('truco:crear', { puntos: 15, flor: false, modo: 'compu' }); if (r.error) return toast(r.error, 'error'); go('mesa', r.id); });
    btns.append(nb, cb); hero.appendChild(btns);
    b.appendChild(hero);
    const box = el('div'); box.appendChild(el('div', 'jg-estado', 'Cargando…')); b.appendChild(box);
    const d = await emit('truco:inicio');
    if (!page || !box.isConnected) return;
    box.textContent = '';
    if (d.error) { box.appendChild(el('div', 'jg-estado', d.error)); return; }
    setBadge(d.mias.filter(m => m.teToca).length);
    const section = (title, items, render) => { if (!items.length) return; box.appendChild(el('div', 'jg-sub', title)); const l = el('div', 'jg-lista'); items.forEach(x => l.appendChild(render(x))); box.appendChild(l); };
    const row = (who, top, bottom, label, cls, fn) => {
      const r = el('button', 'jg-fila'); r.type = 'button';
      const t = el('div', 'jg-ftexto'); t.append(el('div', 'jg-fnombre', top), el('div', 'jg-fmeta', bottom));
      r.append(avatar(who), t);
      if (label) r.appendChild(el('span', 'jg-chip ' + (cls || ''), label));
      r.addEventListener('click', fn);
      return r;
    };
    const rules = (m) => `A ${m.puntos} · ${m.flor ? 'con flor' : 'sin flor'}`;
    section('Te desafiaron', d.abiertas.filter(a => a.paraVos), (a) => row(a.creador, a.creador.nombre + ' te desafía', rules(a), 'Jugar', 'azul', () => joinGame(a.id)));
    section('Tus partidas', d.mias, (m) => {
      const who = m.rival || m.invitado || { nombre: '?' };
      const top = m.estado === 'esperando' ? (m.invitado ? `Esperando a ${m.invitado.nombre}` : 'Esperando rival') : `vs ${who.nombre}`;
      const bottom = m.estado === 'jugando' ? `Vos ${m.yo} · ${who.nombre} ${m.el} · ${rules(m)}` : m.estado === 'terminada' ? `${m.ganaste ? 'Ganaste' : 'Perdiste'} ${m.yo} a ${m.el}` : rules(m);
      return row(m.estado === 'esperando' && !m.invitado ? { nombre: '?' } : who, top, bottom, m.teToca ? 'Te toca' : '', 'amarillo', () => go('mesa', m.id));
    });
    section('Mesas esperando rival', d.abiertas.filter(a => !a.paraVos), (a) => row(a.creador, a.creador.nombre, rules(a), 'Jugar', 'azul', () => joinGame(a.id)));
    if (!d.abiertas.length && !d.mias.length) box.appendChild(el('div', 'jg-vacio', 'No hay mesas esperando. ¡Creá una partida o jugá con la compu!'));
    // Récord y ranking
    const s = d.stats;
    box.appendChild(el('div', 'jg-sub', 'Tu récord'));
    const st = el('div', 'jg-stats');
    for (const [n, l] of [[s.ganadas, 'ganadas'], [s.perdidas, 'perdidas'], [`${s.compuGanadas}-${s.compuPerdidas}`, 'vs la compu']]) { const x = el('div', 'jg-stat'); x.append(el('div', 'jg-stat-n', String(n)), el('div', 'jg-stat-l', l)); st.appendChild(x); }
    box.appendChild(st);
    // los rankings aparte: en pantallas anchas van en su propia columna
    const rk = el('div', 'jg-rankings'); b.appendChild(rk);
    for (const [k, title] of [['mes', 'Ranking del mes'], ['total', 'Ranking histórico']]) {
      const list = d.ranking[k];
      const box = rk;
      box.appendChild(el('div', 'jg-sub', title));
      if (!list.length) { box.appendChild(el('div', 'jg-vacio', 'Todavía nadie ganó una partida contra otra persona.')); continue; }
      const l = el('div', 'jg-lista');
      list.forEach((p, k2) => { const r = el('div', 'jg-fila jg-rank'); r.append(el('span', 'jg-pos', ['🥇', '🥈', '🥉'][k2] || String(k2 + 1)), avatar(p), el('span', 'jg-fnombre', p.nombre), el('span', 'jg-chip', `${p.ganadas} ${p.ganadas === 1 ? 'victoria' : 'victorias'}`)); l.appendChild(r); });
      box.appendChild(l);
    }
  }
  async function joinGame(id) {
    const r = await emit('truco:unirse', { id });
    if (r.error) return toast(r.error, 'error');
    go('mesa', r.id);
  }

  // ── Crear partida ──
  function crear() {
    page.appendChild(head('Nueva partida'));
    const b = el('div', 'jg-cuerpo'); page.appendChild(b);
    const f = el('div', 'jg-form'); b.appendChild(f);
    const data = { puntos: 30, flor: false, modo: 'abierta', rival: null };
    const seg = (label, key, opts, onChange) => {
      const w = el('div', 'jg-campo'); w.appendChild(el('span', 'jg-etq', label));
      const s = el('div', 'jg-seg');
      for (const [v, l] of opts) {
        const x = el('button', 'jg-seg-op', l); x.type = 'button'; x.classList.toggle('on', data[key] === v);
        x.addEventListener('click', () => { data[key] = v; s.querySelectorAll('.jg-seg-op').forEach(y => y.classList.toggle('on', y === x)); if (onChange) onChange(); });
        s.appendChild(x);
      }
      w.appendChild(s); f.appendChild(w); return w;
    };
    seg('A cuántos puntos', 'puntos', [[15, 'A 15'], [30, 'A 30']]);
    seg('Flor', 'flor', [[false, 'Sin flor'], [true, 'Con flor']]);
    seg('Contra quién', 'modo', [['abierta', 'Mesa abierta'], ['desafio', 'Desafiar a alguien'], ['compu', 'La compu']], () => { pick.hidden = data.modo !== 'desafio'; hint.textContent = HINT[data.modo]; });
    const HINT = {
      abierta: 'La mesa queda en la sala y la toma el primero que quiera jugar.',
      desafio: 'Le mandás un mensaje directo con el enlace a la mesa.',
      compu: 'Para practicar. No cuenta para el ranking.',
    };
    const hint = el('div', 'jg-ayuda', HINT.abierta); f.appendChild(hint);
    // Elegir a quien desafiar
    const pick = el('div', 'jg-campo'); pick.hidden = true;
    const sbox = el('label', 'jg-buscar'); sbox.insertAdjacentHTML('beforeend', svg(I.buscar, 20));
    const q = el('input'); q.type = 'search'; q.placeholder = 'Buscar a quién desafiar'; sbox.appendChild(q);
    const list = el('div', 'jg-lista');
    const chosen = el('div', 'jg-elegido');
    pick.append(sbox, chosen, list); f.appendChild(pick);
    let t = null, seq = 0;
    q.addEventListener('input', () => {
      clearTimeout(t);
      t = setTimeout(async () => {
        const my = ++seq;
        let ps = [];
        if (q.value.trim().length >= 2) {
          try { ps = ((await (await fetch('/puente/api/mercado/personas?q=' + encodeURIComponent(q.value.trim()), { headers: { Authorization: 'Bearer ' + localStorage.getItem('haven_token') } })).json()).personas) || []; } catch { ps = []; }
        }
        if (my !== seq || !list.isConnected) return;
        list.textContent = '';
        for (const p of ps) {
          const r = el('button', 'jg-fila'); r.type = 'button';
          const tx = el('div', 'jg-ftexto'); tx.append(el('div', 'jg-fnombre', p.nombre), el('div', 'jg-fmeta', '@' + p.usuario));
          r.append(avatar(p), tx);
          r.addEventListener('click', () => { data.rival = p; chosen.textContent = 'Vas a desafiar a ' + p.nombre; list.textContent = ''; q.value = ''; err.textContent = ''; });
          list.appendChild(r);
        }
      }, 300);
    });
    const err = el('div', 'jg-error'); f.appendChild(err);
    const go2 = el('button', 'jg-btn jg-primario jg-ancho', 'Crear partida'); go2.type = 'button'; f.appendChild(go2);
    go2.addEventListener('click', async () => {
      err.textContent = '';
      if (data.modo === 'desafio' && !data.rival) { err.textContent = 'Elegí a quién desafiar.'; return; }
      go2.disabled = true;
      const r = await emit('truco:crear', { puntos: data.puntos, flor: data.flor, modo: data.modo, rival: data.rival && data.rival.id });
      go2.disabled = false;
      if (r.error) { err.textContent = r.error; return; }
      if (data.modo === 'desafio') { challenge(data.rival, r.id, data); return; }
      stack.pop(); go('mesa', r.id);
    });
  }

  // Mensaje directo al desafiado, con el enlace ya escrito (sin mandar)
  function challenge(p, id, data) {
    const a = app();
    const text = `¡Te desafío a un truco a ${data.puntos}${data.flor ? ' con flor' : ''}! Entrá acá: ${location.origin}/app?truco=${id}`;
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
  async function table(id) {
    mesa = { id, s: null };
    const menu = el('button', 'jg-btn jg-salir', ''); menu.type = 'button'; menu.style.visibility = 'hidden';
    mesa.menu = menu;
    page.appendChild(head('Truco', menu));
    const b = el('div', 'jg-mesa jg-mesa2'); page.appendChild(b);
    b.appendChild(el('div', 'jg-estado', 'Cargando…'));
    menu.addEventListener('click', () => {
      const s = mesa && mesa.s;
      if (!s) return;
      if (s.estado === 'esperando' && s.soyCreador) { confirmar('¿Cancelar la partida?', 'La mesa se cierra y nadie más puede entrar.', 'Cancelar partida', 'Volver').then(ok => { if (ok) emit('truco:cancelar', { id }).then(r => { if (r.error) toast(r.error, 'error'); else back(); }); }); return; }
      if (s.estado === 'jugando' && s.soyJugador) { confirmar('¿Abandonar la partida?', 'Si abandonás, la perdés y gana tu rival.', 'Abandonar', 'Seguir jugando').then(ok => { if (ok) emit('truco:accion', { id, tipo: 'abandonar' }); }); return; }
      share(id);
    });
    const d = await emit('truco:ver', { id });
    if (!page || !mesa || mesa.id !== id) return;
    if (d.error) { b.textContent = ''; b.appendChild(el('div', 'jg-estado', d.error)); return; }
    render(d.partida);
    tickT = setInterval(() => { const bar = page && page.querySelector('.jg-reloj > span'); if (bar && mesa && mesa.s && mesa.s.deadline) { const left = Math.max(0, mesa.s.deadline - Date.now()); bar.style.width = (100 * left / 120000) + '%'; const tx = page.querySelector('.jg-reloj-t'); if (tx) { const sg = Math.ceil(left / 1000); tx.textContent = sg >= 60 ? `${Math.floor(sg / 60)}:${String(sg % 60).padStart(2, '0')}` : sg + ' s'; } } }, 500);
  }
  function share(id) {
    const url = `${location.origin}/app?truco=${id}`;
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(() => toast('Enlace de la mesa copiado', 'success'), () => prompt('Copiá el enlace:', url));
    else prompt('Copiá el enlace:', url);
  }

  function render(s) {
    if (!page || !mesa || mesa.id !== s.id) return;
    const prev = mesa.s;
    mesa.s = s;
    botonSalir(mesa.menu, s);
    if (s.siguiente && prev && !prev.siguiente) { setTimeout(() => { if (page && mesa && mesa.id === s.id) { stack.pop(); go('mesa', s.siguiente); } }, 600); }
    const t = page.querySelector('.jg-titulo');
    if (t) t.textContent = `Truco a ${s.puntos} · ${s.flor ? 'con flor' : 'sin flor'}`;
    // La mesa es la parte de la izquierda (se arma de nuevo en cada cambio); el costado con el
    // tanteador de fosforos y el chat se arma una sola vez, asi no se pierde lo que se esta escribiendo
    const b0 = page.querySelector('.jg-mesa');
    const vieja = b0.querySelector('.jg-juego'); if (vieja) vieja.remove();
    b0.querySelector('.jg-estado')?.remove();
    const b = el('div', 'jg-juego'); b0.prepend(b);
    if (s.estado === 'esperando') b0.querySelector('.jg-lateral')?.remove(); else lateral(b0, s, prev);
    // Esperando rival
    if (s.estado === 'esperando') {
      const w = el('div', 'jg-espera');
      w.append(el('div', 'jg-hero-cartas', '🂠'), el('div', 'jg-hero-t', s.invitado ? `Esperando a ${s.invitado.nombre}` : 'Esperando rival'),
        el('div', 'jg-hero-s', s.invitado ? 'Cuando entre por el enlace, empieza la partida.' : 'La mesa está en la sala de Juegos: la toma el primero que quiera jugar.'));
      const acts = el('div', 'jg-acciones');
      const c = el('button', 'jg-btn', 'Copiar enlace'); c.type = 'button'; c.addEventListener('click', () => share(s.id));
      acts.appendChild(c);
      if (!s.soyJugador) { const j = el('button', 'jg-btn jg-primario', 'Jugar'); j.type = 'button'; j.addEventListener('click', () => joinGame(s.id)); acts.appendChild(j); }
      else if (s.soyCreador) { const x = el('button', 'jg-btn jg-suave', 'Cancelar partida'); x.type = 'button'; x.addEventListener('click', () => emit('truco:cancelar', { id: s.id }).then(r => { if (r.error) toast(r.error, 'error'); else back(); })); acts.appendChild(x); }
      w.appendChild(acts); b.appendChild(w); return;
    }
    // Marcador
    const score = el('div', 'jg-marcador');
    const side = (p, mine) => { const x = el('div', 'jg-lado' + (mine ? ' mio' : '')); x.append(avatar(p), el('div', 'jg-lnombre', mine ? 'Vos' : p.nombre), el('div', 'jg-lpuntos', String(p.puntos))); return x; };
    score.append(side(s.rival, false), el('div', 'jg-meta', `de ${s.puntos}`), side(s.yo, true));
    b.appendChild(score);
    if (s.estado === 'terminada') return end(b, s);

    // El rival: sus cartas boca abajo y lo que grita
    const top = el('div', 'jg-rival');
    const backs = el('div', 'jg-dorsos');
    const reparte = s.estado === 'jugando' && (!prev || prev.manos !== s.manos) && s.bazas.every(z => !z.yo && !z.rival);
    for (let k = 0; k < s.rivalCartas; k++) { const x = card(null, 'rival'); if (reparte) { x.classList.add('jg-reparte'); x.style.setProperty('--d', (k * 2 + (s.mano ? 1 : 0)) * 0.14 + 's'); } backs.appendChild(x); }
    top.appendChild(backs);
    if (s.grito && !s.grito.mio) top.appendChild(el('div', 'jg-globo', s.grito.text));
    b.appendChild(top);
    // El paño: las tres bazas (arriba la carta del rival, abajo la tuya)
    const felt = el('div', 'jg-pano jg-pano2');
    // Cada baza es una pila, como en CyberJuegos: la carta del rival arriba a la derecha, la tuya
    // abajo a la izquierda, una apoyada sobre la otra; la que gana queda encima
    const GIRO = { rival: [-7, 4, -3], yo: [5, -4, 7] };
    s.bazas.forEach((z, k) => {
      const pila = el('div', 'jg-pila' + (k === s.baza ? ' actual' : ''));
      const filas = { rival: pila, yo: pila };
      for (const quien of ['rival', 'yo']) {
        const c = z[quien];
        if (!c) continue;
        const x = card(c, 'jugada');
        x.style.setProperty('--giro', GIRO[quien][k] + 'deg');
        x.classList.add('de-' + quien);
        x.style.zIndex = z.gana === quien ? '3' : z.gana && z.gana !== 'parda' ? '1' : quien === 'yo' ? '2' : '1';
        if (z.gana === quien) { x.classList.add('gano'); x.title = 'Ganó esta baza'; }
        if (z.gana === 'parda') x.classList.add('parda');
        const antes = prev && prev.bazas && prev.bazas[k];
        if (prev && prev.estado === 'jugando' && !(antes && antes[quien]) && prev.manos === s.manos) x.classList.add('jg-entra-' + quien);
        filas[quien].appendChild(x);
      }
      felt.appendChild(pila);
    });
    b.appendChild(felt);
    // Que pasa ahora
    const st = el('div', 'jg-status');
    if (s.pendiente) {
      const who = s.pendiente.de === 'yo' ? 'Cantaste' : `${s.rival.nombre} cantó`;
      st.appendChild(el('div', 'jg-canto' + (s.pendiente.de === 'yo' ? '' : ' rival'), `${who}: ${CANTO[s.pendiente.canto] || s.pendiente.canto}`));
      if (s.pendiente.de === 'yo') st.appendChild(el('div', 'jg-turno', `Esperando que ${s.rival.nombre} conteste…`));
    } else st.appendChild(el('div', 'jg-turno', s.turno === 'yo' ? 'Te toca' : `Juega ${s.rival.nombre}…`));
    const last = (s.log || []).slice(-1)[0];
    if (last) st.appendChild(el('div', 'jg-ultimo', last));
    if (s.deadline) { const r = el('div', 'jg-reloj' + ((s.turno === 'yo' && !(s.pendiente && s.pendiente.de === 'yo')) ? ' mio' : '')); r.appendChild(el('span')); r.appendChild(el('span', 'jg-reloj-t')); st.appendChild(r); }
    b.appendChild(st);
    if (s.grito && s.grito.mio) b.appendChild(el('div', 'jg-globo mio', s.grito.text));
    // Tus cartas
    const canPlay = (s.acciones || []).includes('jugar');
    const hand = el('div', 'jg-mano' + (canPlay ? ' juega' : ''));
    s.cartas.forEach((c, k) => {
      const x = card(c, 'mia');
      if (reparte) { x.classList.add('jg-reparte', 'mia-reparte'); x.style.setProperty('--d', (k * 2 + (s.mano ? 0 : 1)) * 0.14 + 's'); }
      if (canPlay) { x.tabIndex = 0; x.setAttribute('role', 'button'); x.addEventListener('click', () => play(s, { tipo: 'jugar', carta: k })); }
      hand.appendChild(x);
    });
    b.appendChild(hand);
    if (s.baza === 0 && s.miEnvido != null) b.appendChild(el('div', 'jg-envido', `Tu envido: ${s.miEnvido}${s.mano ? ' · sos mano' : ''}`));
    else if (s.mano) b.appendChild(el('div', 'jg-envido', 'Sos mano'));
    // Los cantos de ahora
    const acts = el('div', 'jg-cantos');
    const order = ['quiero', 'noquiero', 'truco', 'retruco', 'vale4', 'envido', 'real', 'falta', 'flor', 'mazo'];
    for (const a of order) {
      if (!(s.acciones || []).includes(a)) continue;
      if (a === 'mazo' && !(s.acciones.length > 1 || s.turno === 'yo')) continue;
      const x = el('button', 'jg-btn ' + (a === 'quiero' || a === 'truco' || a === 'retruco' || a === 'vale4' ? 'jg-primario' : a === 'mazo' || a === 'noquiero' ? 'jg-suave' : 'jg-envido-btn'), BTN[a]);
      x.type = 'button';
      x.addEventListener('click', () => play(s, { tipo: a }));
      acts.appendChild(x);
    }
    b.appendChild(acts);
    // Sonido cuando juega o canta el otro
    if (prev && prev.estado === 'jugando') {
      const prevCanto = prev.pendiente && prev.pendiente.canto, nowCanto = s.pendiente && s.pendiente.canto;
      if (s.pendiente && s.pendiente.de === 'rival' && nowCanto !== prevCanto) { beep(380, 160); setTimeout(() => beep(520, 160), 170); }
      else if (prev.manos === s.manos && JSON.stringify(prev.bazas) !== JSON.stringify(s.bazas)) sonCarta('tira');
    }
    if (reparte) for (let k = 0; k < 6; k++) setTimeout(() => sonCarta('reparte'), 80 + k * 140);
  }
  // El sonido de las cartas (armado en el momento): un chasquido de naipe al repartir y un
  // golpe seco sobre el paño al tirar una
  function sonCarta(tipo) {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const t0 = actx.currentTime, dur = tipo === 'tira' ? 0.09 : 0.05;
      const n = Math.ceil(actx.sampleRate * dur), buf = actx.createBuffer(1, n, actx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, tipo === 'tira' ? 3 : 1.5);
      const src = actx.createBufferSource(), fl = actx.createBiquadFilter(), g = actx.createGain();
      src.buffer = buf; fl.type = 'bandpass'; fl.frequency.value = tipo === 'tira' ? 900 : 3200; fl.Q.value = tipo === 'tira' ? 0.7 : 1.2;
      g.gain.value = tipo === 'tira' ? 0.9 : 0.5;
      src.connect(fl); fl.connect(g); g.connect(actx.destination); src.start(t0);
    } catch { /* sin sonido */ }
  }
  // Los fosforos del tanteador: de a cinco, los cuatro lados de un cuadrado y uno cruzado.
  // A 30, una raya separa las malas de las buenas
  function fosforos(n, max, nuevosDesde) {
    const grupos = Math.ceil(max / 5), G = 30, gap = 6, sep = max > 15 ? 10 : 0;
    const H = grupos * (G + gap) + sep;
    const NS = 'http://www.w3.org/2000/svg';
    const svgEl = document.createElementNS(NS, 'svg'); svgEl.setAttribute('viewBox', `0 0 ${G + 4} ${H}`); svgEl.setAttribute('class', 'jg-fosforos');
    const lados = [[3, 3, 27, 3], [27, 3, 27, 27], [27, 27, 3, 27], [3, 27, 3, 3], [3, 3, 27, 27]];
    let k = 0;
    for (let gI = 0; gI < grupos; gI++) {
      const y = gI * (G + gap) + (sep && gI >= 3 ? sep : 0);
      for (let l = 0; l < 5; l++, k++) {
        if (k >= n) break;
        const [x1, y1, x2, y2] = lados[l];
        const gEl = document.createElementNS(NS, 'g');
        if (k >= nuevosDesde) gEl.setAttribute('class', 'jg-fosforo-nuevo');
        const pal = document.createElementNS(NS, 'line');
        for (const [a, b] of [['x1', x1 + 2], ['y1', y1 + y], ['x2', x2 + 2], ['y2', y2 + y]]) pal.setAttribute(a, b);
        pal.setAttribute('class', 'jg-palito');
        const cab = document.createElementNS(NS, 'circle');
        cab.setAttribute('cx', x2 + 2); cab.setAttribute('cy', y2 + y); cab.setAttribute('r', 2.4); cab.setAttribute('class', 'jg-cabeza');
        gEl.append(pal, cab); svgEl.appendChild(gEl);
      }
      if (sep && gI === 2) { const ln = document.createElementNS(NS, 'line'); ln.setAttribute('x1', 0); ln.setAttribute('x2', G + 4); ln.setAttribute('y1', y + G + gap / 2 + sep / 2); ln.setAttribute('y2', y + G + gap / 2 + sep / 2); ln.setAttribute('class', 'jg-malas'); svgEl.appendChild(ln); }
    }
    return svgEl;
  }
  // El costado: tanteador y chat con el rival
  function lateral(b0, s, prev) {
    let L = b0.querySelector('.jg-lateral');
    if (!L || L.dataset.id !== String(s.id)) {
      L?.remove();
      L = el('div', 'jg-lateral'); L.dataset.id = String(s.id);
      const tan = el('div', 'jg-tanteador');
      L.appendChild(tan);
      if (!s.compu && s.soyJugador !== false) {
        const chat = el('div', 'jg-chat');
        const lista = el('div', 'jg-chat-lista');
        const rapidos = el('div', 'jg-chat-rapidos');
        (s.gritos || []).forEach((g) => { const o = el('button', 'jg-grito', g); o.type = 'button'; o.addEventListener('click', () => mandar(g)); rapidos.appendChild(o); });
        const form = el('form', 'jg-chat-form');
        const inp = el('input'); inp.type = 'text'; inp.maxLength = 200; inp.autocomplete = 'off'; inp.enterKeyHint = 'send';
        inp.placeholder = `Mensaje a ${(s.rival && s.rival.nombre) || 'tu rival'}`;
        const send = el('button', 'jg-btn jg-primario', 'Enviar'); send.type = 'submit';
        form.append(inp, send);
        const mandar = (t) => emit('truco:accion', { id: mesa.id, tipo: 'chat', texto: t }).then(r => { if (r && r.error) toast(r.error, 'error'); });
        form.addEventListener('submit', (e) => { e.preventDefault(); const t = inp.value.trim(); if (!t) return; inp.value = ''; mandar(t); });
        chat.append(el('div', 'jg-chat-t', 'Chat'), lista, rapidos, form);
        L.appendChild(chat);
      }
      b0.appendChild(L);
    }
    // tanteador
    const tan = L.querySelector('.jg-tanteador');
    const pts = [s.yo ? s.yo.puntos : 0, s.rival ? s.rival.puntos : 0];
    const antes = mesa.pts && mesa.ptsId === s.id ? mesa.pts : pts;
    tan.textContent = '';
    const col = (nombre, n, a) => { const c = el('div', 'jg-tcol'); c.append(el('div', 'jg-tnombre', nombre), fosforos(n, s.puntos, a), el('div', 'jg-tnum', String(n))); return c; };
    tan.append(col('Vos', pts[0], antes[0]), col((s.rival && s.rival.nombre) || 'Rival', pts[1], antes[1]));
    mesa.pts = pts; mesa.ptsId = s.id;
    // chat
    const lista = L.querySelector('.jg-chat-lista');
    if (lista) {
      const msgs = s.chat || [];
      const key = msgs.length ? msgs.length + ':' + msgs[msgs.length - 1].t : '0';
      if (lista.dataset.key !== key) {
        const abajo = lista.scrollHeight - lista.scrollTop - lista.clientHeight < 40;
        lista.textContent = '';
        if (!msgs.length) lista.appendChild(el('div', 'jg-chat-vacio', 'Todavía no hay mensajes. ¡Saludá!'));
        for (const m of msgs) {
          const x = el('div', 'jg-msg' + (m.mio ? ' mio' : ''));
          x.append(el('b', '', m.mio ? 'Vos' : ((s.rival && s.rival.nombre) || 'Rival')), document.createTextNode(': ' + m.text));
          lista.appendChild(x);
        }
        const nuevoRival = prev && (prev.chat || []).length < msgs.length && !msgs[msgs.length - 1].mio;
        if (nuevoRival) beep(760, 60);
        if (abajo || !lista.dataset.key || (msgs.length && msgs[msgs.length - 1].mio)) lista.scrollTop = lista.scrollHeight;
        lista.dataset.key = key;
      }
    }
  }
  async function play(s, a) {
    const r = await emit('truco:accion', { id: s.id, ...a });
    if (r.error) toast(r.error, 'error');
  }
  function end(b, s) {
    const w = el('div', 'jg-fin');
    const won = s.ganador === 'yo';
    w.append(el('div', 'jg-hero-cartas', won ? '🏆' : '🃏'), el('div', 'jg-hero-t', won ? '¡Ganaste!' : `Ganó ${s.rival.nombre}`),
      el('div', 'jg-hero-s', `${s.yo.puntos} a ${s.rival.puntos}${s.motivo === 'abandono' ? (won ? ' · tu rival abandonó' : ' · por abandono') : ''}`));
    const acts = el('div', 'jg-acciones');
    if (s.soyJugador && !s.siguiente) {
      const r = el('button', 'jg-btn jg-primario', s.revancha && s.revancha.yo ? 'Esperando revancha…' : s.revancha && s.revancha.rival ? `${s.rival.nombre} quiere la revancha: ¡Dale!` : 'Revancha');
      r.type = 'button'; r.disabled = !!(s.revancha && s.revancha.yo);
      r.addEventListener('click', () => emit('truco:accion', { id: s.id, tipo: 'revancha' }).then(x => { if (x.error) toast(x.error, 'error'); else if (x.id) { stack.pop(); go('mesa', x.id); } }));
      acts.appendChild(r);
    }
    const v = el('button', 'jg-btn', 'Volver a Juegos'); v.type = 'button'; v.addEventListener('click', () => { stack = [['inicio']]; go('inicio', 'truco'); });
    acts.appendChild(v);
    w.appendChild(acts);
    const log = el('div', 'jg-log'); (s.log || []).slice(-6).forEach(l => log.appendChild(el('div', '', l)));
    w.appendChild(log);
    b.appendChild(w);
  }

  // ── Funball (funball.js) ──
  // El juego de DOS de 1995, remasterizado: el mismo tablero en perspectiva, con bolas
  // y bases dibujadas de nuevo. Cada uno ve su meta abajo a la derecha. Se toca una bola
  // propia y se marcan los destinos posibles (los decide el servidor); se toca el destino.
  const FB_BASES = [
    ['Normal', 'Una base común: una bola puede saltar acá.'],
    ['Agujero', 'Nada puede caer acá.'],
    ['Chica', 'Solo entran bolas chicas: al final del turno, las de más de 5 se achican a 5.'],
    ['Bomba', 'Llena de energía a la bola: al salir, sigue saltando en línea hasta llegar a algo que no sea una base común vacía.'],
    ['Blindada', 'La bola que está acá no puede ser atacada.'],
    ['Teletransportador', 'La bola que cae acá viaja al siguiente teletransportador libre, hacia la meta enemiga.'],
    ['Desagüe', 'Muy peligroso: la bola que cae acá se va por el desagüe y desaparece.'],
    ['Resorte', 'La bola rebota a la casilla siguiente, en la misma dirección.'],
    ['Tobogán', 'La bola patina y sigue de largo, empujando lo que haya adelante.'],
    ['Jabón', 'La bola se vuelve una burbuja: puede flotar hasta dos casillas, pero revienta con cualquier cosa que no sea una base vacía.'],
    ['Imán', 'Acá no te pueden atacar y te podés juntar con las tuyas. Pero al salir, la mitad de la bola se queda pegada (y las de 3 o menos no se mueven).'],
    ['Cañón', 'Con una bola acá, el cañón destruye otra base en línea recta. Cuanto más grande la bola, más lejos llega. La bola se gasta en el disparo.'],
    ['Mina', 'Explota: la bola desaparece y todas las de alrededor se achican 5 (salvo las blindadas). Puede explotar en cadena.'],
  ];
  const FB_REGLAS = [
    ['Objetivo', 'Llegar con una bola a la base de la meta enemiga, o quedarte con las únicas bolas del tablero.'],
    ['Saltar', 'Cada bola salta a una casilla vecina (no hacia atrás). Algunas bases cambian eso.'],
    ['Juntarse', 'Saltar sobre una bola tuya las junta. Si pasa de 15, se parte en dos y la mitad sigue de largo (rebota en el borde).'],
    ['Atacar', 'Saltar sobre una enemiga más chica la absorbe y tu bola crece.'],
    ['Desertar', 'Saltar sobre una enemiga más grande es suicidio: la agrandás con la mitad de la tuya… salvo que la hagas pasar de 15: entonces revienta.'],
    ['Anularse', 'Dos bolas enemigas del mismo tamaño se anulan y desaparecen.'],
    ['La araña', 'Camina por el tablero y deja huevos. Caer sobre un huevo suma 3.'],
  ];
  // Perspectiva del original: columnas a la derecha, filas hacia arriba a la izquierda
  const FB_W = 500, FB_H = 440;
  // Camara: el tablero se puede acercar y, acercado, sigue la jugada como en el original
  const fbCam = { z: 1, cx: FB_W / 2, cy: FB_H / 2, movio: false };
  try { fbCam.z = Math.min(3, Math.max(1, +localStorage.getItem('puente_fb_zoom') || 1)); } catch (e) {}
  function fbVB() {
    const w = FB_W / fbCam.z, h = FB_H / fbCam.z;
    fbCam.cx = Math.min(FB_W - w / 2, Math.max(w / 2, fbCam.cx));
    fbCam.cy = Math.min(FB_H - h / 2, Math.max(h / 2, fbCam.cy));
    return `${(fbCam.cx - w / 2).toFixed(1)} ${(fbCam.cy - h / 2).toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}`;
  }
  function fbCamAplicar() {
    const t = page && page.querySelector('.fb-tablero');
    if (t) t.setAttribute('viewBox', fbVB());
    const v = page && page.querySelector('.fb-visor');
    if (v) v.classList.toggle('fb-cerca', fbCam.z > 1);
  }
  // px, py: el punto del tablero que queda quieto al acercar o alejar
  function fbZoom(z, px, py) {
    const z0 = fbCam.z;
    z = Math.min(3, Math.max(1, z));
    if (px == null) { px = fbCam.cx; py = fbCam.cy; }
    fbCam.cx = px + (fbCam.cx - px) * z0 / z; fbCam.cy = py + (fbCam.cy - py) * z0 / z; fbCam.z = z;
    try { localStorage.setItem('puente_fb_zoom', String(z)); } catch (e) {}
    fbCamAplicar();
  }
  function fbVisor(board) {
    const v = el('div', 'fb-visor' + (fbCam.z > 1 ? ' fb-cerca' : ''));
    v.appendChild(board);
    const bar = el('div', 'fb-zoom');
    const boton = (t, titulo, fn) => { const b = el('button', 'fb-zoom-btn', t); b.type = 'button'; b.title = titulo; b.setAttribute('aria-label', titulo); b.addEventListener('click', (e) => { e.stopPropagation(); fn(); }); bar.appendChild(b); };
    boton('+', 'Acercar', () => fbZoom(fbCam.z * 1.5));
    boton('−', 'Alejar', () => fbZoom(fbCam.z / 1.5));
    boton('⤢', 'Ver todo el tablero', () => fbZoom(1));
    v.appendChild(bar);
    // arrastrar mueve el tablero acercado (o la pagina, si se ve entero); dos dedos acercan
    const pts = new Map();
    let pinza = null;
    const aTablero = (cx, cy) => {
      const t = v.querySelector('.fb-tablero'), r = t.getBoundingClientRect(), w = FB_W / fbCam.z, h = FB_H / fbCam.z;
      return { x: fbCam.cx - w / 2 + (cx - r.left) / r.width * w, y: fbCam.cy - h / 2 + (cy - r.top) / r.height * h, k: w / r.width };
    };
    const scroller = () => { for (let n = v.parentElement; n; n = n.parentElement) { const st = getComputedStyle(n); if (/(auto|scroll)/.test(st.overflowY) && n.scrollHeight > n.clientHeight) return n; } return document.scrollingElement; };
    v.addEventListener('pointerdown', (e) => { if (e.target.closest('.fb-zoom')) return; pts.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, mov: false }); pinza = null; });
    v.addEventListener('pointermove', (e) => {
      const p = pts.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      if (pts.size >= 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        if (!pinza) pinza = { d, z: fbCam.z };
        else { const t = aTablero(mx, my); fbZoom(pinza.z * d / Math.max(1, pinza.d), t.x, t.y); }
        fbCam.movio = true;
        return;
      }
      if (!p.mov && Math.abs(e.clientX - p.x0) + Math.abs(e.clientY - p.y0) < 7) return;
      p.mov = true; fbCam.movio = true;
      if (fbCam.z > 1) { const k = aTablero(0, 0).k; fbCam.cx -= dx * k; fbCam.cy -= dy * k; fbCamAplicar(); }
      else if (e.pointerType === 'touch') { const sc = scroller(); if (sc) sc.scrollTop -= dy; }
    });
    const suelta = (e) => { pts.delete(e.pointerId); pinza = null; if (!pts.size) setTimeout(() => { fbCam.movio = false; }, 0); };
    v.addEventListener('pointerup', suelta);
    v.addEventListener('pointercancel', suelta);
    v.addEventListener('wheel', (e) => {
      if (!e.ctrlKey && fbCam.z === 1) return;
      e.preventDefault();
      const t = aTablero(e.clientX, e.clientY);
      fbZoom(fbCam.z * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.002)), t.x, t.y);
    }, { passive: false });
    return v;
  }
  function fbXY(c, r, flip) {
    if (flip) { c = 7 - c; r = 7 - r; }
    return { x: 30 + 39 * c - 25 * r + 175, y: 30 + 378 - (3 * c + 51 * r) };
  }
  const fbSize = (s) => 6 + Math.min(15, s) * 0.8;
  const SVGNS = 'http://www.w3.org/2000/svg';
  const sv = (tag, attrs, parent) => { const n = document.createElementNS(SVGNS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); if (parent) parent.appendChild(n); return n; };
  // Graficos al estilo del original: piso de piedra marron moteada, bolas rojas con estrella
  // y lineas amarillas, verdes de vidrio con lineas blancas, cuencos y anillos metalicos
  function fbDefs(svgEl) {
    const d = sv('defs', {}, svgEl);
    d.innerHTML = `
      <filter id="fb-piedra" x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.32" numOctaves="2" seed="5" result="f"/>
        <feColorMatrix in="f" type="luminanceToAlpha" result="a"/>
        <feComponentTransfer in="a" result="p"><feFuncA type="discrete" tableValues="0 0 0 0 0.55 1 1"/></feComponentTransfer>
        <feFlood flood-color="#6e5a48" result="c"/><feComposite in="c" in2="p" operator="in" result="mot"/>
        <feTurbulence type="fractalNoise" baseFrequency="1.4" numOctaves="1" seed="11" result="g"/>
        <feColorMatrix in="g" type="luminanceToAlpha" result="ga"/>
        <feComponentTransfer in="ga" result="gp"><feFuncA type="discrete" tableValues="0 0 0 0 0 0.7"/></feComponentTransfer>
        <feFlood flood-color="#8c7a68" result="c2"/><feComposite in="c2" in2="gp" operator="in" result="gra"/>
        <feFlood flood-color="#33281f" result="fondo"/>
        <feMerge><feMergeNode in="fondo"/><feMergeNode in="mot"/><feMergeNode in="gra"/></feMerge>
      </filter>
      <radialGradient id="fb-roja" cx="40%" cy="32%" r="68%"><stop offset="0" stop-color="#ff7a6a"/><stop offset="0.35" stop-color="#ec1c1c"/><stop offset="0.8" stop-color="#a00a0a"/><stop offset="1" stop-color="#5a0303"/></radialGradient>
      <radialGradient id="fb-verde" cx="40%" cy="32%" r="68%"><stop offset="0" stop-color="#9dffc4"/><stop offset="0.3" stop-color="#2fd36c"/><stop offset="0.75" stop-color="#0b7f39"/><stop offset="1" stop-color="#033d18"/></radialGradient>
      <radialGradient id="fb-brillo" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff" stop-opacity="0.95"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
      <radialGradient id="fb-sombra" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#000" stop-opacity="0.7"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
      <linearGradient id="fb-azul" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6f78ff"/><stop offset="0.6" stop-color="#3f48d8"/><stop offset="1" stop-color="#232aa0"/></linearGradient>
      <linearGradient id="fb-azul-in" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0d1260"/><stop offset="0.6" stop-color="#2b33b8"/><stop offset="1" stop-color="#8a91ff"/></linearGradient>
      <linearGradient id="fb-plano" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7a83ff"/><stop offset="1" stop-color="#4650dc"/></linearGradient>
      <linearGradient id="fb-oro" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd27a"/><stop offset="0.5" stop-color="#e08a12"/><stop offset="1" stop-color="#7a3e00"/></linearGradient>
      <linearGradient id="fb-oro-in" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6a3300"/><stop offset="0.6" stop-color="#c26f0a"/><stop offset="1" stop-color="#ffcf6a"/></linearGradient>
      <linearGradient id="fb-plata" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="0.5" stop-color="#b9bec6"/><stop offset="1" stop-color="#5a5f68"/></linearGradient>
      <linearGradient id="fb-plata-in" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a4e56"/><stop offset="0.6" stop-color="#9aa0aa"/><stop offset="1" stop-color="#f2f4f7"/></linearGradient>
      <linearGradient id="fb-cobre" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffd2b0"/><stop offset="0.5" stop-color="#c8784a"/><stop offset="1" stop-color="#6a3216"/></linearGradient>
      <linearGradient id="fb-acero" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9aa0aa"/><stop offset="0.5" stop-color="#4b5059"/><stop offset="1" stop-color="#1b1d21"/></linearGradient>
      <radialGradient id="fb-pozo" cx="50%" cy="40%" r="60%"><stop offset="0" stop-color="#000"/><stop offset="0.75" stop-color="#0b0806"/><stop offset="1" stop-color="#3a2d22"/></radialGradient>
      <radialGradient id="fb-turquesa" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#1b3a3a"/><stop offset="0.7" stop-color="#4fd0c8"/><stop offset="1" stop-color="#9ef5ee"/></radialGradient>
      <radialGradient id="fb-esfera-gris" cx="36%" cy="30%" r="70%"><stop offset="0" stop-color="#d5d9df"/><stop offset="0.4" stop-color="#6c727c"/><stop offset="1" stop-color="#16181c"/></radialGradient>
      <radialGradient id="fb-rosa" cx="38%" cy="30%" r="70%"><stop offset="0" stop-color="#ffc2f0"/><stop offset="0.4" stop-color="#ee2fc4"/><stop offset="1" stop-color="#6a0a5a"/></radialGradient>
      <radialGradient id="fb-sombreado-capsula" cx="62%" cy="30%" r="75%"><stop offset="0.55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.55"/></radialGradient>
      <radialGradient id="fb-huevo" cx="40%" cy="30%" r="72%"><stop offset="0" stop-color="#ffffff"/><stop offset="0.45" stop-color="#f6e6ea"/><stop offset="0.8" stop-color="#d9a6b6"/><stop offset="1" stop-color="#b0306e"/></radialGradient>
      <filter id="fb-llama" x="-40%" y="-40%" width="180%" height="180%"><feTurbulence type="fractalNoise" baseFrequency="0.11" numOctaves="2" seed="3" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="9" xChannelSelector="R" yChannelSelector="G"/></filter>
      <radialGradient id="fb-fuego-1" cx="50%" cy="45%" r="55%"><stop offset="0" stop-color="#ffffff"/><stop offset="0.35" stop-color="#fff6a0"/><stop offset="0.7" stop-color="#ffd23a"/><stop offset="1" stop-color="#ff9a18"/></radialGradient>
      <radialGradient id="fb-fuego-2" cx="50%" cy="45%" r="55%"><stop offset="0" stop-color="#fff3a0"/><stop offset="0.4" stop-color="#ffb428"/><stop offset="0.8" stop-color="#ff6a14"/><stop offset="1" stop-color="#d8341a"/></radialGradient>
      <radialGradient id="fb-fuego-3" cx="50%" cy="45%" r="55%"><stop offset="0" stop-color="#ff9a30"/><stop offset="0.5" stop-color="#ea4a1c"/><stop offset="1" stop-color="#8a1808"/></radialGradient>
      <radialGradient id="fb-fuego-4" cx="50%" cy="45%" r="55%"><stop offset="0" stop-color="#c8341a"/><stop offset="0.6" stop-color="#7a1608"/><stop offset="1" stop-color="#2a0804"/></radialGradient>
      <radialGradient id="fb-fuego-5" cx="50%" cy="45%" r="55%"><stop offset="0" stop-color="#5a1a0c"/><stop offset="1" stop-color="#140604"/></radialGradient>`;
    return d;
  }
  // Un cuenco visto en perspectiva: borde con brillo, adentro hundido
  function fbCuenco(g, x, y, rx, ry, out, inn, side) {
    sv('ellipse', { cx: x + 2, cy: y + 4, rx: rx + 3, ry: ry + 3, fill: 'url(#fb-sombra)' }, g);
    sv('ellipse', { cx: x, cy: y + 2.5, rx, ry: ry + 1, fill: side }, g);
    sv('ellipse', { cx: x, cy: y, rx, ry, fill: out }, g);
    sv('ellipse', { cx: x, cy: y + 0.6, rx: rx * 0.72, ry: ry * 0.62, fill: inn }, g);
    sv('path', { d: `M${x - rx * 0.8} ${y - ry * 0.25}q${rx * 0.5} ${-ry * 0.85} ${rx * 1.1} ${-ry * 0.6}`, stroke: '#fff', 'stroke-width': 1.2, fill: 'none', opacity: 0.75 }, g);
  }
  function fbAnillo(g, x, y, rx, ry, fill, centro) {
    sv('ellipse', { cx: x + 2, cy: y + 3.5, rx: rx + 3, ry: ry + 3, fill: 'url(#fb-sombra)' }, g);
    if (centro) sv('ellipse', { cx: x, cy: y, rx: rx - 3.5, ry: ry - 1.8, fill: centro }, g);
    sv('ellipse', { cx: x, cy: y + 1.5, rx, ry, fill: 'none', stroke: '#5a2c00', 'stroke-width': 5 }, g);
    sv('ellipse', { cx: x, cy: y, rx, ry, fill: 'none', stroke: fill, 'stroke-width': 5 }, g);
    sv('path', { d: `M${x - rx * 0.75} ${y - ry * 0.55}q${rx * 0.6} ${-ry * 0.6} ${rx * 1.2} ${-ry * 0.3}`, stroke: '#fff4c8', 'stroke-width': 1.3, fill: 'none', opacity: 0.9 }, g);
  }
  // Dibujos propios del servidor (tools/puente/web/funball/, no van al repositorio): una hoja
  // con las piezas y la piedra del piso. Si no estan, se dibuja todo con los graficos de abajo
  const FB_ARTE = '/puente/funball/';
  const FB_PIEZAS = {"normal":[0,0,114,77,57,38],"chica":[116,0,46,36,22,18],"tobogan":[164,0,114,72,57,34],"bomba":[280,0,115,72,57,34],"jabon":[397,0,112,72,56,36],"tele":[511,0,116,73,58,34],"resorte":[0,79,101,78,50,44],"blindada":[103,79,116,76,58,38],"arania":[221,79,164,104,82,65],"rojaB":[387,79,154,136,77,124,70],"verdeB":[0,217,121,118,60,104,55],"desague":[123,217,88,66,33,52],"canionR":[213,217,106,112,52,82],"canionG":[321,217,106,112,52,82]};
  const FB_HOJA = [640, 335];
  const FB_BASE_PIEZA = { 0: 'normal', 2: 'chica', 3: 'bomba', 4: 'blindada', 5: 'tele', 7: 'resorte', 8: 'tobogan', 9: 'jabon' };
  const FB_ESC = 0.33;
  let fbArte = null; // null: sin probar, 1: probando, true: esta, false: no esta
  function fbProbarArte() {
    if (fbArte !== null) return;
    fbArte = 1;
    const i = new Image();
    i.onload = () => { fbArte = true; };
    i.onerror = () => { fbArte = false; if (page && fbMesa && fbMesa.s) fbDraw(fbMesa.s); };
    i.src = FB_ARTE + 'piezas.webp?v=' + Object.keys(FB_PIEZAS).length;
  }
  function fbPieza(g, id, x, y, sc) {
    const [px, py, w, h, ax, ay] = FB_PIEZAS[id];
    const s = sv('svg', { x: x - ax * sc, y: y - ay * sc, width: w * sc, height: h * sc, viewBox: `${px} ${py} ${w} ${h}` }, g);
    sv('image', { href: FB_ARTE + 'piezas.webp?v=' + Object.keys(FB_PIEZAS).length, width: FB_HOJA[0], height: FB_HOJA[1] }, s);
  }
  function fbBase(g, b, x, y) {
    fbProbarArte();
    if (fbArte !== false && FB_BASE_PIEZA[b]) {
      const [, , w] = FB_PIEZAS[FB_BASE_PIEZA[b]];
      sv('ellipse', { cx: x - 3, cy: y + 4, rx: w * FB_ESC * 0.55, ry: w * FB_ESC * 0.3, fill: 'url(#fb-sombra)' }, g);
      return fbPieza(g, FB_BASE_PIEZA[b], x, y, FB_ESC);
    }
    switch (b) {
      case 1: // agujero
        sv('ellipse', { cx: x, cy: y, rx: 16, ry: 7.5, fill: 'url(#fb-pozo)' }, g);
        break;
      case 2: fbCuenco(g, x, y, 7.5, 3.6, 'url(#fb-azul)', 'url(#fb-azul-in)', '#151a6a'); break; // chica
      case 3: fbCuenco(g, x, y, 17, 7.5, 'url(#fb-oro)', 'url(#fb-oro-in)', '#5a2c00'); break; // bomba
      case 4: fbCuenco(g, x, y, 17, 7.5, 'url(#fb-plata)', 'url(#fb-plata-in)', '#3a3e45'); break; // blindada
      case 5: fbAnillo(g, x, y, 15, 6.8, 'url(#fb-oro)', 'url(#fb-turquesa)'); break; // teletransportador
      case 6: // desague: el caño blanco del original
        if (fbArte !== false) { sv('ellipse', { cx: x - 1, cy: y + 4, rx: 15, ry: 5, fill: 'url(#fb-sombra)' }, g); fbPieza(g, 'desague', x, y + 3, FB_ESC); break; }
        fbCuenco(g, x, y, 16, 7, 'url(#fb-acero)', '#050404', '#111214');
        sv('path', { d: `M${x - 7} ${y}h14M${x - 5} ${y - 2.2}h10M${x - 5} ${y + 2.4}h10`, stroke: '#8a909a', 'stroke-width': 1.1 }, g);
        break;
      case 7: // resorte de cobre, un poco transparente
        sv('ellipse', { cx: x + 2, cy: y + 3, rx: 14, ry: 6, fill: 'url(#fb-sombra)' }, g);
        for (let k = 0; k < 6; k++) sv('ellipse', { cx: x, cy: y - k * 2.8, rx: 11, ry: 4.4, fill: 'none', stroke: k % 2 ? '#7a3a1a' : 'url(#fb-cobre)', 'stroke-width': 1.8, opacity: 0.95 }, g);
        break;
      case 8: // tobogan: disco plano y liso
        sv('ellipse', { cx: x + 2, cy: y + 3.5, rx: 19, ry: 9, fill: 'url(#fb-sombra)' }, g);
        sv('ellipse', { cx: x, cy: y + 2, rx: 17.5, ry: 8, fill: '#2a31a8' }, g);
        sv('ellipse', { cx: x, cy: y, rx: 17.5, ry: 8, fill: 'url(#fb-plano)' }, g);
        break;
      case 9: fbAnillo(g, x, y, 15, 6.8, 'url(#fb-oro)', null); break; // jabon: anillo dorado
      case 10: // iman
        fbCuenco(g, x, y, 16, 7, 'url(#fb-plata)', 'url(#fb-plata-in)', '#3a3e45');
        sv('path', { d: `M${x - 7.5} ${y - 1}v-5a7.5 7.5 0 0 1 15 0v5`, stroke: '#7a0b12', 'stroke-width': 5.2, fill: 'none' }, g);
        sv('path', { d: `M${x - 7.5} ${y - 1}v-5a7.5 7.5 0 0 1 15 0v5`, stroke: '#e0303a', 'stroke-width': 3.6, fill: 'none' }, g);
        sv('path', { d: `M${x - 7.5} ${y - 1}v-2.4M${x + 7.5} ${y - 1}v-2.4`, stroke: '#eef0f3', 'stroke-width': 5 }, g);
        break;
      case 11: // canion: disco gris chato (cargado se dibuja con fbTorreta)
        sv('ellipse', { cx: x + 2, cy: y + 3.5, rx: 18, ry: 8, fill: 'url(#fb-sombra)' }, g);
        sv('ellipse', { cx: x, cy: y + 2, rx: 16, ry: 7, fill: '#4b4e54' }, g);
        sv('ellipse', { cx: x, cy: y, rx: 16, ry: 7, fill: 'url(#fb-plata)' }, g);
        sv('ellipse', { cx: x, cy: y + 0.5, rx: 11, ry: 4.6, fill: 'none', stroke: '#6c7078', 'stroke-width': 1 }, g);
        break;
      case 12: { // mina
        sv('ellipse', { cx: x + 2, cy: y + 3, rx: 15, ry: 6.5, fill: 'url(#fb-sombra)' }, g);
        for (let k = 0; k < 10; k++) { const a = k * Math.PI / 5; sv('line', { x1: x, y1: y - 6, x2: x + Math.cos(a) * 13, y2: y - 6 + Math.sin(a) * 9, stroke: '#6c727c', 'stroke-width': 2.2, 'stroke-linecap': 'round' }, g); }
        sv('circle', { cx: x, cy: y - 6, r: 8, fill: 'url(#fb-esfera-gris)' }, g);
        sv('circle', { cx: x - 1.5, cy: y - 8.5, r: 1.8, fill: '#ff3b30' }, g);
        break;
      }
      default: fbCuenco(g, x, y, 16, 7.2, 'url(#fb-azul)', 'url(#fb-azul-in)', '#151a6a'); // normal: cuenco azul
    }
  }
  // Canion cargado: cupula gris y el canion del color de la bola (alto: 0 a 1, para la animacion)
  function fbTorreta(g, k, x, y, alto = 1, tubo = 1) {
    if (fbArte !== false) {
      const a = Math.max(0.05, Math.min(1, alto) * (0.4 + 0.6 * tubo));
      sv('ellipse', { cx: x - 2, cy: y + 4, rx: 18, ry: 6, fill: 'url(#fb-sombra)' }, g);
      const w = sv('g', { transform: `translate(${x} ${y}) scale(${0.6 + 0.4 * Math.min(1, alto)} ${a}) translate(${-x} ${-y})` }, g);
      return fbPieza(w, k === 'R' ? 'canionR' : 'canionG', x, y + 3, FB_ESC * 1.05);
    }
    const col = k === 'R' ? ['#ff6a55', '#c8160f', '#6a0705'] : ['#6dffa8', '#159a48', '#04411c'];
    const id = 'fb-tubo-' + k;
    if (!g.ownerSVGElement || !g.ownerSVGElement.getElementById(id)) {
      const d = (g.ownerSVGElement || g).querySelector('defs') || sv('defs', {}, g.ownerSVGElement || g);
      const lg = sv('linearGradient', { id, x1: 0, y1: 0, x2: 1, y2: 0 }, d);
      sv('stop', { offset: 0, 'stop-color': col[2] }, lg); sv('stop', { offset: 0.35, 'stop-color': col[0] }, lg); sv('stop', { offset: 1, 'stop-color': col[2] }, lg);
    }
    const h = 11 * alto;
    sv('path', { d: `M${x - 14} ${y}a14 ${Math.max(0.1, h)} 0 0 1 28 0z`, fill: 'url(#fb-esfera-gris)' }, g);
    sv('ellipse', { cx: x - 4, cy: y - h * 0.6, rx: 3.5, ry: Math.max(0.1, h * 0.2), fill: '#fff', opacity: 0.35 }, g);
    if (tubo > 0) {
      const L = 16 * tubo;
      sv('rect', { x: x - 4.5, y: y - h - L + 3, width: 9, height: L, rx: 2, fill: `url(#${id})` }, g);
      sv('ellipse', { cx: x, cy: y - h - L + 3, rx: 4.5, ry: 2, fill: col[1] }, g);
      sv('ellipse', { cx: x, cy: y - h - L + 3, rx: 2.8, ry: 1.2, fill: '#120202' }, g);
    }
  }
  function fbStar(cx, cy, R) {
    let d = '';
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? R * 0.42 : R; d += (i ? 'L' : 'M') + (cx + Math.cos(a) * rr).toFixed(2) + ' ' + (cy + Math.sin(a) * rr).toFixed(2); }
    return d + 'Z';
  }
  // El huevo de la arania: una bolita blanca apoyada en el fondo de la base
  function fbHuevo(g, x, y) {
    sv('ellipse', { cx: x, cy: y - 0.5, rx: 4.6, ry: 1.8, fill: '#b0306e', opacity: 0.9 }, g);
    sv('ellipse', { cx: x, cy: y - 3.6, rx: 4.2, ry: 3.9, fill: 'url(#fb-huevo)' }, g);
    sv('ellipse', { cx: x - 1.3, cy: y - 5, rx: 1.3, ry: 0.9, fill: '#fff' }, g);
  }
  function fbBall(parent, k, s, x, y, num) {
    const g = sv('g', { class: 'fb-bola' }, parent);
    if (k === 'S') {
      fbHuevo(g, x, y);
      return;
    }
    if (fbArte !== false) {
      const id = k === 'R' ? 'rojaB' : 'verdeB', pz = FB_PIEZAS[id];
      const r = 8 + Math.min(15, s) * 0.95, sc = r / pz[6];
      sv('ellipse', { cx: x - r * 0.25, cy: y + 3, rx: r * 1.05, ry: r * 0.45, fill: 'url(#fb-sombra)' }, g);
      fbPieza(g, id, x, y + 2, sc);
      const cy = y + 2 - (pz[5] - pz[3] * 0.45) * sc;
      if (num) { const t = sv('text', { x, y: cy + 3.6, 'text-anchor': 'middle', class: 'fb-num' }, g); t.textContent = String(s); }
      return;
    }
    const r = fbSize(s), cy = y - r * 0.8;
    sv('ellipse', { cx: x + r * 0.3, cy: y + 2, rx: r * 1.1, ry: r * 0.42, fill: 'url(#fb-sombra)' }, g);
    sv('circle', { cx: x, cy, r, fill: k === 'R' ? 'url(#fb-roja)' : 'url(#fb-verde)' }, g);
    if (k === 'R') {
      // la estrella y las lineas amarillas
      sv('path', { d: fbStar(x - r * 0.05, cy - r * 0.15, r * 0.38), fill: 'none', stroke: '#ffd83a', 'stroke-width': Math.max(0.8, r * 0.07), 'stroke-linejoin': 'round' }, g);
      sv('path', { d: `M${x - r * 0.85} ${cy + r * 0.2}q${r * 0.5} ${-r * 0.55} ${r * 0.35} ${-r * 0.95}M${x + r * 0.35} ${cy + r * 0.75}q${r * 0.3} ${-r * 0.5} ${r * 0.55} ${-r * 0.4}M${x - r * 0.2} ${cy - r * 0.85}q${r * 0.5} ${r * 0.1} ${r * 0.7} ${r * 0.45}`, fill: 'none', stroke: '#ffd83a', 'stroke-width': Math.max(0.6, r * 0.05), opacity: 0.9 }, g);
    } else {
      // vidrio con lineas blancas cruzadas
      sv('ellipse', { cx: x, cy, rx: r * 0.42, ry: r * 0.98, fill: 'none', stroke: '#eafff2', 'stroke-width': Math.max(0.6, r * 0.05), opacity: 0.8 }, g);
      sv('ellipse', { cx: x, cy, rx: r * 0.98, ry: r * 0.36, fill: 'none', stroke: '#eafff2', 'stroke-width': Math.max(0.6, r * 0.05), opacity: 0.8 }, g);
      sv('path', { d: `M${x - r * 0.15} ${cy - r * 0.15}h${r * 0.3}M${x} ${cy - r * 0.3}v${r * 0.3}`, stroke: '#fff', 'stroke-width': Math.max(0.6, r * 0.05) }, g);
    }
    sv('ellipse', { cx: x - r * 0.4, cy: cy - r * 0.48, rx: r * 0.32, ry: r * 0.2, fill: 'url(#fb-brillo)' }, g);
    if (num) { const t = sv('text', { x, y: cy + 3.6, 'text-anchor': 'middle', class: 'fb-num' }, g); t.textContent = String(s); }
  }
  function fbSpider(g, x, y) {
    if (fbArte !== false) {
      const a = sv('g', { class: 'fb-arania' }, g);
      sv('ellipse', { cx: x - 3, cy: y + 4, rx: 22, ry: 8, fill: 'url(#fb-sombra)' }, a);
      return fbPieza(a, 'arania', x, y, FB_ESC);
    }
    const s = sv('g', { class: 'fb-arania', transform: `translate(${x} ${y - 6})` }, g);
    sv('ellipse', { cx: 2, cy: 7, rx: 14, ry: 4.5, fill: 'url(#fb-sombra)' }, s);
    for (const side of [-1, 1]) for (let k = 0; k < 4; k++) {
      const d = `M${side * 3} 1q${side * 7} ${-8 + k * 3} ${side * 10} ${-2 + k * 2}t${side * 5} ${5 + k}`;
      sv('path', { d, stroke: '#6a0a5a', 'stroke-width': 2.8, fill: 'none', 'stroke-linecap': 'round' }, s);
      sv('path', { d, stroke: '#ff5ad8', 'stroke-width': 1.3, fill: 'none', 'stroke-linecap': 'round' }, s);
    }
    sv('ellipse', { cx: 0, cy: 2, rx: 8, ry: 5.8, fill: 'url(#fb-rosa)' }, s);
    sv('circle', { cx: 0, cy: -3.5, r: 4, fill: 'url(#fb-rosa)' }, s);
    sv('ellipse', { cx: -2.5, cy: 0, rx: 2.5, ry: 1.2, fill: '#fff', opacity: 0.6 }, s);
  }

  async function fbInicio() {
    page.appendChild(head('Funball', botonEnlace('/app?juegos=funball', 'Funball · __PUENTE_APP__')));
    const b = el('div', 'jg-cuerpo fb-ui jg-inicio'); page.appendChild(b);
    const hero = el('div', 'jg-hero fb-hero');
    const mini = el('div', 'fb-hero-dibujo'); mini.innerHTML = '<svg viewBox="0 0 120 56" aria-hidden="true"><defs><radialGradient id="fbh-r" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#ffb3b0"/><stop offset=".3" stop-color="#ff4d4f"/><stop offset="1" stop-color="#7a0b12"/></radialGradient><radialGradient id="fbh-v" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#c3ffd9"/><stop offset=".3" stop-color="#33d17a"/><stop offset="1" stop-color="#05502a"/></radialGradient></defs><ellipse cx="34" cy="48" rx="20" ry="6" fill="#4a52d0"/><ellipse cx="86" cy="48" rx="20" ry="6" fill="#4a52d0"/><circle cx="34" cy="30" r="17" fill="url(#fbh-r)"/><circle cx="86" cy="34" r="12" fill="url(#fbh-v)"/></svg>';
    // el logo de este servidor (web/funball/logo.webp); si no esta, el dibujo de siempre
    const logo = el('img', 'fb-logo'); logo.alt = 'Funball'; logo.src = FB_ARTE + 'logo.webp';
    const titulo = el('div', 'jg-hero-t', 'Funball');
    logo.addEventListener('load', () => { mini.remove(); titulo.remove(); hero.classList.add('fb-con-logo'); });
    logo.addEventListener('error', () => logo.remove());
    hero.append(logo, mini, titulo, el('div', 'jg-hero-s fb-cartel', '¡Bienvenido a Funball!'));
    const btns = el('div', 'jg-acciones');
    const nb = el('button', 'jg-btn jg-primario', 'Crear partida'); nb.type = 'button'; nb.addEventListener('click', () => go('fbCrear'));
    const cb = el('button', 'jg-btn', 'Jugar con la compu'); cb.type = 'button';
    cb.addEventListener('click', async () => { const r = await emit('funball:crear', { modo: 'compu', tablero: -1, arania: true, nivel: 2 }); if (r.error) return toast(r.error, 'error'); go('fbMesa', r.id); });
    const rb = el('button', 'jg-btn jg-suave', 'Cómo se juega'); rb.type = 'button'; rb.addEventListener('click', () => go('fbReglas'));
    const tb = el('button', 'jg-btn jg-suave', 'Tutorial'); tb.type = 'button'; tb.addEventListener('click', () => go('fbTutorial', 0));
    btns.append(nb, cb, tb, rb); hero.appendChild(btns);
    b.appendChild(hero);
    const box = el('div'); box.appendChild(el('div', 'jg-estado', 'Cargando…')); b.appendChild(box);
    const d = await emit('funball:inicio');
    if (!page || !box.isConnected) return;
    box.textContent = '';
    if (d.error) { box.appendChild(el('div', 'jg-estado', d.error)); return; }
    if (!d.tableros.length) { hero.querySelectorAll('.jg-btn:not(.jg-suave)').forEach(x => { x.disabled = true; }); box.appendChild(el('div', 'jg-vacio', 'El Funball todavía no está disponible.')); return; }
    const section = (title, items, render) => { if (!items.length) return; box.appendChild(el('div', 'jg-sub', title)); const l = el('div', 'jg-lista'); items.forEach(x => l.appendChild(render(x))); box.appendChild(l); };
    const row = (who, top, bottom, label, cls, fn) => {
      const r = el('button', 'jg-fila'); r.type = 'button';
      const t = el('div', 'jg-ftexto'); t.append(el('div', 'jg-fnombre', top), el('div', 'jg-fmeta', bottom));
      r.append(avatar(who), t);
      if (label) r.appendChild(el('span', 'jg-chip ' + (cls || ''), label));
      r.addEventListener('click', fn);
      return r;
    };
    const rules = (m) => m.tablero + (m.arania === false ? ' · sin araña' : '');
    section('Te desafiaron', d.abiertas.filter(a => a.paraVos), (a) => row(a.creador, a.creador.nombre + ' te desafía', rules(a), 'Jugar', 'azul', () => fbJoin(a.id)));
    section('Tus partidas', d.mias, (m) => {
      const who = m.rival || m.invitado || { nombre: '?' };
      const top = m.estado === 'esperando' ? (m.invitado ? `Esperando a ${m.invitado.nombre}` : 'Esperando rival') : `vs ${who.nombre}`;
      const bottom = m.estado === 'terminada' ? (m.ganaste === null ? 'Empate' : m.ganaste ? 'Ganaste' : 'Perdiste') + ' · ' + m.tablero : m.tablero;
      return row(m.estado === 'esperando' && !m.invitado ? { nombre: '?' } : who, top, bottom, m.teToca ? 'Te toca' : '', 'amarillo', () => go('fbMesa', m.id));
    });
    section('Mesas esperando rival', d.abiertas.filter(a => !a.paraVos), (a) => row(a.creador, a.creador.nombre, rules(a), 'Jugar', 'azul', () => fbJoin(a.id)));
    if (!d.abiertas.length && !d.mias.length) box.appendChild(el('div', 'jg-vacio', 'No hay mesas esperando. ¡Creá una partida o jugá con la compu!'));
    const s = d.stats;
    box.appendChild(el('div', 'jg-sub', 'Tu récord'));
    const st = el('div', 'jg-stats');
    for (const [n, l] of [[s.ganadas, 'ganadas'], [s.perdidas, 'perdidas'], [`${s.compuGanadas}-${s.compuPerdidas}`, 'vs la compu']]) { const x = el('div', 'jg-stat'); x.append(el('div', 'jg-stat-n', String(n)), el('div', 'jg-stat-l', l)); st.appendChild(x); }
    box.appendChild(st);
    // los rankings aparte: en pantallas anchas van en su propia columna
    const rk = el('div', 'jg-rankings'); b.appendChild(rk);
    for (const [k, title] of [['mes', 'Ranking del mes'], ['total', 'Ranking histórico']]) {
      const list = d.ranking[k];
      const box = rk;
      box.appendChild(el('div', 'jg-sub', title));
      if (!list.length) { box.appendChild(el('div', 'jg-vacio', 'Todavía nadie ganó una partida contra otra persona.')); continue; }
      const l = el('div', 'jg-lista');
      list.forEach((p, k2) => { const r = el('div', 'jg-fila jg-rank'); r.append(el('span', 'jg-pos', ['🥇', '🥈', '🥉'][k2] || String(k2 + 1)), avatar(p), el('span', 'jg-fnombre', p.nombre), el('span', 'jg-chip', `${p.ganadas} ${p.ganadas === 1 ? 'victoria' : 'victorias'}`)); l.appendChild(r); });
      box.appendChild(l);
    }
  }
  async function fbJoin(id) {
    const r = await emit('funball:unirse', { id });
    if (r.error) return toast(r.error, 'error');
    go('fbMesa', r.id);
  }

  async function fbCrear() {
    page.appendChild(head('Nueva partida de Funball'));
    const b = el('div', 'jg-cuerpo fb-ui'); page.appendChild(b);
    const f = el('div', 'jg-form'); b.appendChild(f);
    const info = await emit('funball:inicio');
    if (!page || !f.isConnected) return;
    const tabs = (info && info.tableros) || [];
    const data = { tablero: -1, arania: true, modo: 'abierta', nivel: 2, rival: null };
    const seg = (label, key, opts, onChange) => {
      const w = el('div', 'jg-campo'); w.appendChild(el('span', 'jg-etq', label));
      const s = el('div', 'jg-seg' + (opts.length > 3 ? ' fb-seg-varias' : ''));
      for (const [v, l] of opts) {
        const x = el('button', 'jg-seg-op', l); x.type = 'button'; x.classList.toggle('on', data[key] === v);
        x.addEventListener('click', () => { data[key] = v; s.querySelectorAll('.jg-seg-op').forEach(y => y.classList.toggle('on', y === x)); if (onChange) onChange(); });
        s.appendChild(x);
      }
      w.appendChild(s); f.appendChild(w); return w;
    };
    seg('Tablero', 'tablero', [[-1, 'Al azar'], ...tabs.map((t, i) => [i, t])]);
    seg('La araña', 'arania', [[true, 'Sí, que venga'], [false, 'Sin araña']]);
    seg('Contra quién', 'modo', [['abierta', 'Mesa abierta'], ['desafio', 'Desafiar a alguien'], ['compu', 'La compu']], () => { pick.hidden = data.modo !== 'desafio'; lvl.hidden = data.modo !== 'compu'; hint.textContent = HINT[data.modo]; });
    const lvl = seg('Nivel de la compu', 'nivel', (info.niveles || ['Fácil', 'Normal', 'Difícil', 'Imposible']).map((n, i) => [i + 1, n]));
    lvl.hidden = true;
    const HINT = {
      abierta: 'La mesa queda en la sala y la toma el primero que quiera jugar.',
      desafio: 'Le mandás un mensaje directo con el enlace a la mesa.',
      compu: 'La misma compu del juego original. No cuenta para el ranking.',
    };
    const hint = el('div', 'jg-ayuda', HINT.abierta); f.appendChild(hint);
    const pick = el('div', 'jg-campo'); pick.hidden = true;
    const sbox = el('label', 'jg-buscar'); sbox.insertAdjacentHTML('beforeend', svg(I.buscar, 20));
    const q = el('input'); q.type = 'search'; q.placeholder = 'Buscar a quién desafiar'; sbox.appendChild(q);
    const list = el('div', 'jg-lista');
    const chosen = el('div', 'jg-elegido');
    pick.append(sbox, chosen, list); f.appendChild(pick);
    let t = null, seq = 0;
    q.addEventListener('input', () => {
      clearTimeout(t);
      t = setTimeout(async () => {
        const my = ++seq;
        let ps = [];
        if (q.value.trim().length >= 2) {
          try { ps = ((await (await fetch('/puente/api/mercado/personas?q=' + encodeURIComponent(q.value.trim()), { headers: { Authorization: 'Bearer ' + localStorage.getItem('haven_token') } })).json()).personas) || []; } catch { ps = []; }
        }
        if (my !== seq || !list.isConnected) return;
        list.textContent = '';
        for (const p of ps) {
          const r = el('button', 'jg-fila'); r.type = 'button';
          const tx = el('div', 'jg-ftexto'); tx.append(el('div', 'jg-fnombre', p.nombre), el('div', 'jg-fmeta', '@' + p.usuario));
          r.append(avatar(p), tx);
          r.addEventListener('click', () => { data.rival = p; chosen.textContent = 'Vas a desafiar a ' + p.nombre; list.textContent = ''; q.value = ''; err.textContent = ''; });
          list.appendChild(r);
        }
      }, 300);
    });
    const err = el('div', 'jg-error'); f.appendChild(err);
    const go2 = el('button', 'jg-btn jg-primario jg-ancho', 'Crear partida'); go2.type = 'button'; f.appendChild(go2);
    go2.addEventListener('click', async () => {
      err.textContent = '';
      if (data.modo === 'desafio' && !data.rival) { err.textContent = 'Elegí a quién desafiar.'; return; }
      go2.disabled = true;
      const r = await emit('funball:crear', { tablero: data.tablero, arania: data.arania, modo: data.modo, nivel: data.nivel, rival: data.rival && data.rival.id });
      go2.disabled = false;
      if (r.error) { err.textContent = r.error; return; }
      if (data.modo === 'desafio') { fbChallenge(data.rival, r.id); return; }
      stack.pop(); go('fbMesa', r.id);
    });
  }
  function fbChallenge(p, id) {
    const a = app();
    const text = `¡Te desafío a un Funball! Entrá acá: ${location.origin}/app?funball=${id}`;
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

  // Tutorial, como el del original: cada leccion muestra una jugada que se repite sola.
  // Las jugadas salen del motor (funball-motor.js), con el mismo registro que una partida.
const FB_TUTORIAL = [{"t":"Saltar","x":"Cada bola salta a una casilla vecina, hacia adelante o de costado (nunca hacia atrás). Tocá tu bola y después una de las casillas marcadas.","c":[[3,3,0,"R",5,0],[6,6,0,"G",4,0]],"e":[{"t":"bola","c":3,"r":3,"k":"","s":0},{"t":"mueve","de":[3,3],"a":[4,3],"k":"R","s":5},{"t":"bola","c":4,"r":3,"k":"R","s":5}]},{"t":"Juntarse","x":"Si saltás sobre una bola de tu color, se juntan en una más grande.","c":[[3,3,0,"R",5,0],[4,3,0,"R",6,0],[6,6,0,"G",4,0]],"e":[{"t":"bola","c":3,"r":3,"k":"","s":0},{"t":"mueve","de":[3,3],"a":[4,3],"k":"R","s":5},{"t":"fusion","c":4,"r":3},{"t":"bola","c":4,"r":3,"k":"R","s":11}]},{"t":"Desbordar","x":"Una bola no puede pasar de 15. Si al juntarse se pasa, se parte en dos y la mitad sigue de largo en la misma dirección.","c":[[3,3,0,"R",10,0],[4,3,0,"R",10,0],[6,6,0,"G",4,0]],"e":[{"t":"bola","c":3,"r":3,"k":"","s":0},{"t":"mueve","de":[3,3],"a":[4,3],"k":"R","s":10},{"t":"fusion","c":4,"r":3},{"t":"bola","c":4,"r":3,"k":"R","s":20},{"t":"bola","c":4,"r":3,"k":"R","s":10},{"t":"desborda","c":4,"r":3},{"t":"mueve","de":[4,3],"a":[5,3],"k":"R","s":10},{"t":"bola","c":5,"r":3,"k":"R","s":10}]},{"t":"Atacar","x":"Si saltás sobre una bola enemiga más chica, la absorbés y tu bola crece.","c":[[1,6,0,"G",4,0],[3,3,0,"R",8,0],[4,3,0,"G",5,0]],"e":[{"t":"bola","c":3,"r":3,"k":"","s":0},{"t":"mueve","de":[3,3],"a":[4,3],"k":"R","s":8},{"t":"ataque","c":4,"r":3},{"t":"bola","c":4,"r":3,"k":"R","s":13}]},{"t":"Anularse","x":"Dos bolas enemigas del mismo tamaño se anulan: las dos desaparecen.","c":[[1,6,0,"G",4,0],[3,3,0,"R",7,0],[4,3,0,"G",7,0],[6,1,0,"R",3,0]],"e":[{"t":"bola","c":3,"r":3,"k":"","s":0},{"t":"mueve","de":[3,3],"a":[4,3],"k":"R","s":7},{"t":"anulan","c":4,"r":3},{"t":"bola","c":4,"r":3,"k":"","s":0}]},{"t":"Desertar","x":"Saltar sobre una enemiga más grande es mala idea: tu bola se pasa al otro bando y la agranda.","c":[[1,6,0,"G",4,0],[3,3,0,"R",4,0],[4,3,0,"G",9,0],[6,1,0,"R",3,0]],"e":[{"t":"bola","c":3,"r":3,"k":"","s":0},{"t":"mueve","de":[3,3],"a":[4,3],"k":"R","s":4},{"t":"deserta","c":4,"r":3},{"t":"bola","c":4,"r":3,"k":"G","s":11}]},{"t":"Reventar","x":"…salvo que la hagas pasar de 15: entonces la bola enemiga revienta en pedazos.","c":[[1,6,0,"G",4,0],[3,3,0,"R",7,0],[4,3,0,"G",13,0],[6,1,0,"R",3,0]],"e":[{"t":"bola","c":3,"r":3,"k":"","s":0},{"t":"mueve","de":[3,3],"a":[4,3],"k":"R","s":7},{"t":"explota","c":4,"r":3},{"t":"bola","c":4,"r":3,"k":"R","s":1}]},{"t":"Bomba","x":"Una bola en la bomba sale disparada en línea recta, tan lejos como quieras.","c":[[1,3,3,"R",9,0],[5,3,0,"G",5,0],[6,6,0,"G",4,0]],"e":[{"t":"bola","c":1,"r":3,"k":"","s":0},{"t":"mueve","de":[1,3],"a":[5,3],"k":"R","s":9},{"t":"ataque","c":5,"r":3},{"t":"bola","c":5,"r":3,"k":"R","s":14}]},{"t":"Blindada","x":"La bola que está en una base blindada no puede ser atacada. Las tuyas sí pueden juntarse con ella.","c":[[3,3,0,"R",6,0],[4,3,4,"R",5,0],[6,6,0,"G",4,0]],"e":[{"t":"bola","c":3,"r":3,"k":"","s":0},{"t":"mueve","de":[3,3],"a":[4,3],"k":"R","s":6},{"t":"fusion","c":4,"r":3},{"t":"bola","c":4,"r":3,"k":"R","s":11}]},{"t":"Tobogán","x":"La bola patina y sigue de largo, empujando lo que haya adelante.","c":[[3,3,0,"R",6,0],[4,3,8,"",0,0],[5,3,0,"G",5,0],[6,6,0,"G",4,0]],"e":[{"t":"bola","c":3,"r":3,"k":"","s":0},{"t":"mueve","de":[3,3],"a":[4,3],"k":"R","s":6},{"t":"bola","c":4,"r":3,"k":"R","s":6},{"t":"bola","c":4,"r":3,"k":"","s":0},{"t":"mueve","de":[4,3],"a":[5,3],"k":"R","s":6},{"t":"bola","c":5,"r":3,"k":"R","s":6},{"t":"mueve","de":[5,3],"a":[6,3],"k":"G","s":5},{"t":"bola","c":6,"r":3,"k":"G","s":5}]},{"t":"Teletransportador","x":"La bola que cae acá viaja al siguiente teletransportador libre, hacia la meta enemiga.","c":[[2,1,5,"",0,0],[3,3,0,"R",6,0],[4,3,5,"",0,0],[6,6,0,"G",4,0]],"e":[{"t":"bola","c":3,"r":3,"k":"","s":0},{"t":"mueve","de":[3,3],"a":[4,3],"k":"R","s":6},{"t":"bola","c":4,"r":3,"k":"R","s":6},{"t":"teletransporta","de":[4,3],"a":[2,1]},{"t":"bola","c":2,"r":1,"k":"R","s":6},{"t":"bola","c":4,"r":3,"k":"","s":0}]},{"t":"Base chica","x":"En una base chica entran bolas de hasta 5: si cae una más grande, se achica.","c":[[3,3,0,"R",9,0],[4,3,2,"",0,0],[6,6,0,"G",4,0]],"e":[{"t":"bola","c":3,"r":3,"k":"","s":0},{"t":"mueve","de":[3,3],"a":[4,3],"k":"R","s":9},{"t":"bola","c":4,"r":3,"k":"R","s":9},{"t":"achica","c":4,"r":3},{"t":"bola","c":4,"r":3,"k":"R","s":5}]},{"t":"Resorte","x":"La bola rebota a la casilla siguiente, en la misma dirección.","c":[[3,3,0,"R",6,0],[4,3,7,"",0,0],[6,6,0,"G",4,0]],"e":[{"t":"bola","c":3,"r":3,"k":"","s":0},{"t":"mueve","de":[3,3],"a":[4,3],"k":"R","s":6},{"t":"bola","c":4,"r":3,"k":"R","s":6},{"t":"resorte","c":4,"r":3},{"t":"bola","c":4,"r":3,"k":"","s":0},{"t":"mueve","de":[4,3],"a":[5,3],"k":"R","s":6},{"t":"bola","c":5,"r":3,"k":"R","s":6}]},{"t":"Desagüe","x":"Muy peligroso: la bola que cae acá se va por el desagüe y desaparece.","c":[[1,1,0,"R",2,0],[3,3,0,"R",6,0],[4,3,6,"",0,0],[6,6,0,"G",4,0]],"e":[{"t":"bola","c":3,"r":3,"k":"","s":0},{"t":"mueve","de":[3,3],"a":[4,3],"k":"R","s":6},{"t":"bola","c":4,"r":3,"k":"R","s":6},{"t":"desague","c":4,"r":3},{"t":"bola","c":4,"r":3,"k":"","s":0}]},{"t":"Imán","x":"En el imán no te pueden atacar. Pero al salir, la mitad de la bola se queda pegada.","c":[[3,3,10,"R",9,0],[6,6,0,"G",4,0]],"e":[{"t":"bola","c":3,"r":3,"k":"R","s":4},{"t":"mueve","de":[3,3],"a":[4,3],"k":"R","s":5},{"t":"bola","c":4,"r":3,"k":"R","s":5}]},{"t":"Cañón","x":"Con una bola en el cañón podés destruir otra base en línea recta. Cuanto más grande la bola, más lejos llega.","c":[[2,3,11,"R",10,0],[5,3,0,"G",5,0],[6,6,0,"G",4,0]],"e":[{"t":"dispara","de":[2,3],"a":[5,3]},{"t":"explota","c":5,"r":3},{"t":"base","c":5,"r":3,"b":2},{"t":"bola","c":5,"r":3,"k":"","s":0},{"t":"bola","c":2,"r":3,"k":"","s":0}]},{"t":"Jabón","x":"La bola se vuelve una burbuja y puede flotar hasta dos casillas…","c":[[3,3,9,"R",6,0],[6,6,0,"G",4,0]],"e":[{"t":"bola","c":3,"r":3,"k":"","s":0},{"t":"mueve","de":[3,3],"a":[5,2],"k":"R","s":6},{"t":"bola","c":5,"r":2,"k":"R","s":6},{"t":"bola","c":5,"r":2,"k":"R","s":6}]},{"t":"Burbuja","x":"…pero revienta con cualquier cosa que no sea una base vacía.","c":[[3,3,9,"R",6,0],[5,2,0,"G",3,0],[6,6,0,"G",4,0]],"e":[{"t":"bola","c":3,"r":3,"k":"","s":0},{"t":"mueve","de":[3,3],"a":[5,2],"k":"R","s":6},{"t":"revienta","c":5,"r":2}]},{"t":"Mina","x":"¡Cuidado! La mina explota: la bola desaparece y todas las de alrededor se achican (salvo las blindadas).","c":[[1,6,0,"G",4,0],[3,3,0,"R",8,0],[4,3,12,"",0,0],[4,4,0,"R",4,0],[5,3,0,"G",7,0],[5,4,4,"G",9,0]],"e":[{"t":"bola","c":3,"r":3,"k":"","s":0},{"t":"mueve","de":[3,3],"a":[4,3],"k":"R","s":8},{"t":"bola","c":4,"r":3,"k":"R","s":8},{"t":"explota","c":4,"r":3},{"t":"base","c":4,"r":3,"b":1},{"t":"bola","c":4,"r":3,"k":"","s":0},{"t":"bola","c":4,"r":4,"k":"","s":0},{"t":"bola","c":5,"r":3,"k":"G","s":2}]},{"t":"La araña","x":"La araña camina sola por el tablero y deja huevos.","c":[[1,1,0,"R",6,0],[3,4,0,"",0,1],[6,6,0,"G",5,0]],"e":[{"t":"bola","c":1,"r":1,"k":"","s":0},{"t":"mueve","de":[1,1],"a":[2,1],"k":"R","s":6},{"t":"bola","c":2,"r":1,"k":"R","s":6},{"t":"arania","de":[3,4],"a":[2,3]}]},{"t":"Huevos","x":"Si caés sobre un huevo, tu bola suma 3.","c":[[3,3,0,"R",6,0],[4,3,0,"S",3,0],[6,6,0,"G",4,0]],"e":[{"t":"bola","c":3,"r":3,"k":"","s":0},{"t":"mueve","de":[3,3],"a":[4,3],"k":"R","s":6},{"t":"huevo","c":4,"r":3},{"t":"bola","c":4,"r":3,"k":"R","s":9},{"t":"bola","c":4,"r":3,"k":"R","s":9}]},{"t":"La meta","x":"Ganás si llegás con una bola a la base del rival, o si te quedás con las únicas bolas del tablero.","c":[[2,6,0,"G",5,0],[6,1,0,"R",6,0]],"e":[{"t":"bola","c":6,"r":1,"k":"","s":0},{"t":"mueve","de":[6,1],"a":[7,0],"k":"R","s":6},{"t":"bola","c":7,"r":0,"k":"R","s":6}]}];
  function fbTutorial(n) {
    n = Math.max(0, Math.min(FB_TUTORIAL.length - 1, n | 0));
    const L = FB_TUTORIAL[n];
    page.appendChild(head('Tutorial'));
    const b = el('div', 'jg-mesa fb-ui fb-tut'); page.appendChild(b);
    b.appendChild(el('div', 'fb-tut-titulo', L.t));
    const tablero = el('div', 'fb-mesa'); b.appendChild(tablero);
    b.appendChild(el('div', 'fb-cartel fb-tut-texto', L.x));
    const nav = el('div', 'jg-acciones fb-tut-nav');
    const ir = (k) => { stack[stack.length - 1] = ['fbTutorial', k]; show('fbTutorial', k); };
    const ant = el('button', 'jg-btn', 'Anterior'); ant.type = 'button'; ant.disabled = n === 0; ant.addEventListener('click', () => ir(n - 1));
    const ultima = n === FB_TUTORIAL.length - 1;
    const sig = el('button', 'jg-btn jg-primario', ultima ? '¡A jugar!' : 'Siguiente'); sig.type = 'button';
    sig.addEventListener('click', () => (ultima ? back() : ir(n + 1)));
    nav.append(ant, el('span', 'fb-tut-n', `${n + 1} / ${FB_TUTORIAL.length}`), sig);
    b.appendChild(nav);
    // el tablero antes y despues de la jugada
    const celdas = Array.from({ length: 64 }, () => [0, '', 0, 0]);
    for (const [c, r, bb, k, sz, sp] of L.c) celdas[c * 8 + r] = [bb, k, sz, sp];
    const despues = celdas.map(v => v.slice());
    for (const e of L.e) {
      if (e.t === 'bola') { const v = despues[e.c * 8 + e.r]; v[1] = e.k; v[2] = e.s; }
      else if (e.t === 'base') despues[e.c * 8 + e.r][0] = e.b;
      else if (e.t === 'arania') { despues[e.de[0] * 8 + e.de[1]][3] = 0; despues[e.a[0] * 8 + e.a[1]][3] = 1; }
    }
    const s = { id: 'tut' + n, yo: { color: 'G' }, rival: { color: 'R' }, estado: 'jugando', celdas: despues, ultima: { n: n + 1, ev: L.e } };
    fbMesa = { id: s.id, s, sel: null, busy: false, tutorial: true };
    // la camara se acerca a donde pasa la jugada
    const pts = L.e.flatMap(e => e.de ? [e.de, e.a] : e.c != null ? [[e.c, e.r]] : []).map(([c, r]) => fbXY(c, r, false));
    if (fbCam.tutZ == null) fbCam.tutZ = fbCam.z;
    fbCam.z = 2;
    fbCam.cx = pts.reduce((a, p) => a + p.x, 0) / pts.length;
    fbCam.cy = pts.reduce((a, p) => a + p.y, 0) / pts.length - 10;
    const prev = { celdas };
    fbDraw({ ...s, celdas });
    const vigente = () => page && fbMesa && fbMesa.id === s.id;
    const ciclo = () => {
      if (!vigente()) return;
      fbAnimate(prev, s);
      const espera = () => { if (!vigente()) return; if (fbMesa.anim) return setTimeout(espera, 200); setTimeout(() => { if (vigente()) { fbDraw({ ...s, celdas }); setTimeout(ciclo, 700); } }, 1500); };
      setTimeout(espera, 300);
    };
    setTimeout(ciclo, 900);
  }
  function fbReglas() {
    page.appendChild(head('Cómo se juega'));
    const b = el('div', 'jg-cuerpo fb-reglas fb-ui'); page.appendChild(b);
    const tut = el('button', 'jg-btn jg-ancho', 'Ver el tutorial'); tut.type = 'button'; tut.addEventListener('click', () => go('fbTutorial', 0)); b.appendChild(tut);
    for (const [t, d] of FB_REGLAS) { const x = el('div', 'fb-regla'); x.append(el('b', '', t), el('span', '', d)); b.appendChild(x); }
    b.appendChild(el('div', 'jg-sub', 'Las bases'));
    FB_BASES.forEach(([t, d], i) => {
      const x = el('div', 'fb-regla fb-con-base');
      const s = sv('svg', { viewBox: '0 0 40 30', class: 'fb-base-ico', 'aria-hidden': 'true' }); fbDefs(s); fbBase(sv('g', {}, s), i, 20, 20);
      const tx = el('div'); tx.append(el('b', '', t), el('span', '', d));
      x.append(s, tx); b.appendChild(x);
    });
  }

  let fbMesa = null; // { id, s, sel, busy }
  async function fbTable(id) {
    fbMesa = { id, s: null, sel: null, busy: false };
    mesa = { id: 'fb:' + id, s: null };
    const menu = el('button', 'jg-btn jg-salir', ''); menu.type = 'button'; menu.style.visibility = 'hidden';
    fbMesa.menu = menu;
    page.appendChild(head('Funball', menu));
    const b = el('div', 'jg-mesa fb-mesa fb-ui'); page.appendChild(b);
    b.appendChild(el('div', 'jg-estado', 'Cargando…'));
    menu.addEventListener('click', () => {
      const s = fbMesa && fbMesa.s;
      if (!s) return;
      if (s.estado === 'esperando' && s.soyCreador) { confirmar('¿Cancelar la partida?', 'La mesa se cierra y nadie más puede entrar.', 'Cancelar partida', 'Volver').then(ok => { if (ok) emit('funball:cancelar', { id }).then(r => { if (r.error) toast(r.error, 'error'); else back(); }); }); return; }
      if (s.estado === 'jugando' && s.soyJugador) { confirmar('¿Abandonar la partida?', 'Si abandonás, la perdés y gana tu rival.', 'Abandonar', 'Seguir jugando').then(ok => { if (ok) emit('funball:accion', { id, tipo: 'abandonar' }); }); return; }
      fbShare(id);
    });
    const d = await emit('funball:ver', { id });
    if (!page || !fbMesa || fbMesa.id !== id) return;
    if (d.error) { b.textContent = ''; b.appendChild(el('div', 'jg-estado', d.error)); return; }
    fbRender(d.partida);
    tickT = setInterval(() => { const bar = page && page.querySelector('.jg-reloj > span'); if (bar && fbMesa && fbMesa.s && fbMesa.s.deadline) { const left = Math.max(0, fbMesa.s.deadline - Date.now()); bar.style.width = (100 * left / 60000) + '%'; const tx = page.querySelector('.jg-reloj-t'); if (tx) tx.textContent = Math.ceil(left / 1000) + ' s'; } }, 500);
  }
  function fbShare(id) {
    const url = `${location.origin}/app?funball=${id}`;
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(() => toast('Enlace de la mesa copiado', 'success'), () => prompt('Copiá el enlace:', url));
    else prompt('Copiá el enlace:', url);
  }

  // Dibuja el tablero (celdas: 64 x [base, color, tamanio, arania]); marca la seleccion y los destinos
  function fbBoard(s, celdas, opts) {
    const flip = s.yo && s.yo.color === 'R';
    const svgEl = sv('svg', { viewBox: fbVB(), class: 'fb-tablero', role: 'img', 'aria-label': 'Tablero de Funball' });
    fbDefs(svgEl);
    sv('rect', { width: FB_W, height: FB_H, filter: 'url(#fb-piedra)' }, svgEl);
    fbProbarArte();
    if (fbArte !== false) sv('image', { href: FB_ARTE + 'piedra.webp', width: FB_W, height: FB_H, preserveAspectRatio: 'none' }, svgEl);
    const order = [];
    for (let c = 0; c < 8; c++) for (let r = 0; r < 8; r++) order.push([c, r, fbXY(c, r, flip)]);
    order.sort((a, b) => a[2].y - b[2].y || a[2].x - b[2].x);
    const sel = opts && opts.sel, targets = (opts && opts.targets) || [];
    const isT = (c, r) => targets.some(t => t[0] === c && t[1] === r);
    const layer = sv('g', {}, svgEl);
    for (const [c, r, p] of order) {
      const v = celdas[c * 8 + r];
      const g = sv('g', { class: 'fb-celda', 'data-c': c, 'data-r': r }, layer);
      if (c === 0 && r === 7) sv('ellipse', { cx: p.x, cy: p.y + 1, rx: 21, ry: 10, class: 'fb-meta fb-meta-r' }, g);
      if (c === 7 && r === 0) sv('ellipse', { cx: p.x, cy: p.y + 1, rx: 21, ry: 10, class: 'fb-meta fb-meta-v' }, g);
      fbBase(g, v[0], p.x, p.y);
      if (isT(c, r)) sv('rect', { x: p.x - 19, y: p.y - 34, width: 38, height: 44, class: 'fb-destino' }, g);
      if (sel && sel[0] === c && sel[1] === r) sv('rect', { x: p.x - 19, y: p.y - 34, width: 38, height: 44, class: 'fb-sel' }, g);
      if (v[1] && v[2] && v[0] === 11 && v[1] !== 'S') {
        fbTorreta(g, v[1], p.x, p.y);
      } else if (v[1] && v[2]) fbBall(g, v[1], v[2], p.x, p.y, false);
      if (v[3]) fbSpider(g, p.x, p.y);
      sv('rect', { x: p.x - 19, y: p.y - 30, width: 38, height: 40, fill: 'transparent', class: 'fb-toque' }, g);
    }
    return svgEl;
  }

  function fbRender(s, noAnim) {
    if (!page || !fbMesa || fbMesa.id !== s.id) return;
    const prev = fbMesa.s;
    fbMesa.s = s; mesa.s = s;
    botonSalir(fbMesa.menu, s);
    if (s.siguiente && prev && !prev.siguiente) { setTimeout(() => { if (page && fbMesa && fbMesa.id === s.id) { stack.pop(); go('fbMesa', s.siguiente); } }, 600); }
    const t = page.querySelector('.jg-titulo');
    if (t) t.textContent = `Funball · ${s.tablero}`;
    const b = page.querySelector('.fb-mesa');
    if (s.estado === 'esperando') {
      b.textContent = '';
      const w = el('div', 'jg-espera');
      w.append(el('div', 'jg-hero-cartas', '🟢'), el('div', 'jg-hero-t', s.invitado ? `Esperando a ${s.invitado.nombre}` : 'Esperando rival'),
        el('div', 'jg-hero-s', s.invitado ? 'Cuando entre por el enlace, empieza la partida.' : 'La mesa está en la sala de Juegos: la toma el primero que quiera jugar.'));
      const acts = el('div', 'jg-acciones');
      const c = el('button', 'jg-btn', 'Copiar enlace'); c.type = 'button'; c.addEventListener('click', () => fbShare(s.id));
      acts.appendChild(c);
      if (!s.soyJugador) { const j = el('button', 'jg-btn jg-primario', 'Jugar'); j.type = 'button'; j.addEventListener('click', () => fbJoin(s.id)); acts.appendChild(j); }
      else if (s.soyCreador) { const x = el('button', 'jg-btn jg-suave', 'Cancelar partida'); x.type = 'button'; x.addEventListener('click', () => emit('funball:cancelar', { id: s.id }).then(r => { if (r.error) toast(r.error, 'error'); else back(); })); acts.appendChild(x); }
      w.appendChild(acts); b.appendChild(w); return;
    }
    // Si llega una jugada nueva, primero se ve la animacion
    if (!noAnim && prev && prev.celdas && s.ultima && s.ultima.n === (prev.jugadas || 0) + 1) { fbAnimate(prev, s); return; }
    fbDraw(s);
  }
  function fbDraw(s) {
    const b = page && page.querySelector('.fb-mesa');
    if (!b) return;
    b.textContent = '';
    if (fbMesa && fbMesa.tutorial) { b.appendChild(fbVisor(fbBoard(s, s.celdas, {}))); return; }
    const score = el('div', 'jg-marcador fb-marcador');
    const count = (k) => s.celdas.reduce((n, v) => n + (v[1] === k && v[2] ? 1 : 0), 0);
    const side = (p, mine) => {
      const x = el('div', 'jg-lado' + (mine ? ' mio' : ''));
      const dot = el('span', 'fb-color fb-color-' + (p.color === 'R' ? 'r' : 'v'));
      x.append(avatar(p), el('div', 'jg-lnombre', mine ? 'Vos' : p.nombre), dot, el('div', 'jg-lpuntos', String(count(p.color))));
      return x;
    };
    score.append(side(s.rival, false), el('div', 'jg-meta', 'bolas'), side(s.yo, true));
    b.appendChild(score);
    if (s.estado === 'terminada') { const vis = fbVisor(fbBoard(s, s.celdas)); fbGanador(vis, s); b.appendChild(vis); return fbEnd(b, s); }
    const sel = fbMesa.sel && s.teToca && s.jugadasPosibles && s.jugadasPosibles[fbMesa.sel.join(',')] ? fbMesa.sel : null;
    if (!sel) fbMesa.sel = null;
    const targets = sel ? s.jugadasPosibles[sel.join(',')] : [];
    const board = fbBoard(s, s.celdas, { sel, targets });
    board.addEventListener('click', (e) => {
      const g = e.target instanceof Element && e.target.closest('.fb-celda');
      if (!g || !fbMesa || !fbMesa.s || !fbMesa.s.teToca || fbMesa.busy || fbMesa.anim || fbCam.movio) return;
      const c = +g.dataset.c, r = +g.dataset.r, key = c + ',' + r, cur = fbMesa.s;
      if (fbMesa.sel && fbMesa.sel[0] === c && fbMesa.sel[1] === r) { fbMesa.sel = null; return fbDraw(cur); }
      if (fbMesa.sel && targets.some(t => t[0] === c && t[1] === r)) return fbPlay(cur, fbMesa.sel, [c, r]);
      if (cur.jugadasPosibles[key]) { fbMesa.sel = [c, r]; fbSon('elegir', 560, 50); return fbDraw(cur); }
      fbMesa.sel = null; fbDraw(cur);
    });
    if (sel) fbMuestra(board, s, sel, targets);
    b.appendChild(fbVisor(board));
    const st = el('div', 'jg-status');
    const mine = s.teToca;
    st.appendChild(el('div', 'jg-turno', mine ? `Te toca (${s.yo.color === 'R' ? 'rojas' : 'verdes'})` : `Juega ${s.rival.nombre}…`));
    st.appendChild(el('div', 'jg-ultimo', mine ? (sel ? 'Tocá una casilla marcada (o la misma bola para elegir otra).' : 'Tocá una de tus bolas.') : ((s.log || []).slice(-1)[0] || '')));
    if (s.deadline) { const r = el('div', 'jg-reloj' + (mine ? ' mio' : '')); r.appendChild(el('span')); r.appendChild(el('span', 'jg-reloj-t')); st.appendChild(r); }
    b.appendChild(st);
    const tip = el('div', 'fb-pie', 'Tu base es la marcada abajo a la derecha: defendela. Ganás si llegás con una bola a la del rival, arriba a la izquierda.');
    b.appendChild(tip);
  }
  function fbMuestra(board, s, sel, targets) {
    const flip = s.yo && s.yo.color === 'R';
    const v0 = s.celdas[sel[0] * 8 + sel[1]];
    let capa = null, raf = 0, actual = null;
    const parar = () => { cancelAnimationFrame(raf); if (capa) capa.remove(); capa = null; actual = null; };
    board.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      const g = e.target instanceof Element && e.target.closest('.fb-celda');
      const c = g ? +g.dataset.c : -1, r = g ? +g.dataset.r : -1;
      const ok = !!g && targets.some(t => t[0] === c && t[1] === r);
      const key = ok ? c + ',' + r : null;
      if (key === actual) return;
      parar();
      if (!ok) return;
      actual = key;
      const a = fbXY(sel[0], sel[1], flip), b = fbXY(c, r, flip), rr = fbR(v0[2]);
      capa = sv('g', { class: 'fb-muestra' }, board);
      const t0 = performance.now();
      const paso = (now) => {
        if (!capa || !capa.isConnected) return;
        const ciclo = (now - t0) % 1150;
        capa.textContent = '';
        if (ciclo < 260) { const u = ciclo / 260; fbEsfera(capa, v0[1], rr, a.x + (b.x - a.x) * u, a.y + 2 + (b.y - a.y) * u - 22 * Math.sin(u * Math.PI), { sombra: false }); }
        else if (ciclo < 1000) fbEsfera(capa, v0[1], rr, b.x, b.y + 2);
        raf = requestAnimationFrame(paso);
      };
      raf = requestAnimationFrame(paso);
    });
    board.addEventListener('pointerleave', parar);
  }
  async function fbPlay(s, de, a) {
    fbMesa.busy = true;
    const r = await emit('funball:accion', { id: s.id, tipo: 'mover', de, a });
    if (fbMesa) { fbMesa.busy = false; fbMesa.sel = null; }
    if (r.error) { toast(r.error, 'error'); if (fbMesa && fbMesa.s) fbDraw(fbMesa.s); }
  }
  // Animacion de la ultima jugada, como en el original: se reproduce el registro de la jugada
  // paso a paso (saltos en arco, fusiones, ataques, la estrella al anularse, vidrios al reventar,
  // el teletransportador, el desague, resortes, toboganes, la arania...)
  const fbR = (s) => 8 + Math.min(15, Math.max(0, s)) * 0.95;
  const FB_B = { TOBOGAN: 8, RESORTE: 7, BOMBA: 3, IMAN: 10, MINA: 12, JABON: 9 };
  const fbEase = (t) => t < 0.5 ? 2 * t * t : 1 - (2 - 2 * t) * (2 - 2 * t) / 2;
  // Una bola de radio r apoyada en (x, yb): yb es el punto donde toca la base
  function fbEsfera(parent, k, r, x, yb, o = {}) {
    const g = sv('g', {}, parent);
    if (r <= 0.3) return g;
    if (o.sombra !== false) sv('ellipse', { cx: x - r * 0.25, cy: (o.piso != null ? o.piso : yb) + 1, rx: r * 1.05 * (o.sombraEsc || 1), ry: r * 0.45 * (o.sombraEsc || 1), fill: 'url(#fb-sombra)', opacity: o.sombraOp != null ? o.sombraOp : 1 }, g);
    const b = sv('g', {}, g);
    if (k === 'S') {
      fbHuevo(b, x, yb);
    } else if (fbArte !== false) {
      const id = k === 'R' ? 'rojaB' : 'verdeB', pz = FB_PIEZAS[id];
      fbPieza(b, id, x, yb, r / pz[6]);
    } else {
      sv('circle', { cx: x, cy: yb - r * 0.86, r, fill: k === 'R' ? 'url(#fb-roja)' : 'url(#fb-verde)' }, b);
    }
    if (o.sx || o.sy) b.setAttribute('transform', `translate(${x} ${yb}) scale(${o.sx || 1} ${o.sy || 1}) translate(${-x} ${-yb})`);
    if (o.op != null) b.setAttribute('opacity', o.op);
    if (o.clip) b.setAttribute('clip-path', o.clip);
    return g;
  }
  // Pedazos de vidrio (o de metal) que salen volando y caen
  function fbVidrios(n, x, y, r, rnd) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rnd() * 0.6, v = 0.6 + rnd() * 0.8;
      out.push({ a, vx: Math.cos(a) * v * r * 2.2, vy: -(0.8 + rnd()) * r * 1.6, x0: x + Math.cos(a) * r * 0.6, y0: y + Math.sin(a) * r * 0.5, w: r * (0.35 + rnd() * 0.35), rot: rnd() * 6, vr: (rnd() - 0.5) * 14 });
    }
    return out;
  }
  function fbPintaVidrios(g, ps, t, fill, piso) {
    for (const p of ps) {
      const x = p.x0 + p.vx * t, y = Math.min(piso, p.y0 + p.vy * t + 160 * t * t), w = p.w * (1 - t * 0.5), a = p.rot + p.vr * t;
      const pts = [0, 1, 2].map(j => { const b = a + j * 2.1 + (j === 1 ? 0.4 : 0); return (x + Math.cos(b) * w).toFixed(1) + ',' + (y + Math.sin(b) * w * 0.8).toFixed(1); }).join(' ');
      sv('polygon', { points: pts, fill, stroke: 'rgba(255,255,255,0.75)', 'stroke-width': 0.7, opacity: Math.max(0, 1 - t * t) }, g);
    }
  }
  // La estrella de cuatro puntas, mitad de cada color, que gira y se achica al anularse
  function fbEstrella(g, x, y, L, ang, ka, kb, giro = 0) {
    const col = { R: ['#ff5a4a', '#c41c12', '#7a0c08'], G: ['#3ee08a', '#119a50', '#065a2c'] };
    // giro: vuelta sobre su eje vertical (la estrella se ve de canto y vuelve)
    const sx = Math.max(0.12, Math.abs(Math.cos(giro)));
    const s = sv('g', { transform: `translate(${x} ${y}) scale(${sx} 0.8) rotate(${ang})` }, g);
    const puntas = [];
    for (let i = 0; i < 4; i++) {
      const a = i * 90, k = i % 2 ? kb : ka, w = L * 0.24;
      puntas.push({ a, k, w });
    }
    // primero las de atras (las que apuntan hacia arriba en pantalla quedan detras)
    puntas.sort((p, q) => Math.sin((q.a + ang) * Math.PI / 180) - Math.sin((p.a + ang) * Math.PI / 180));
    for (const { a, k, w } of puntas) {
      const [c1, c2, c3] = col[k] || col.R;
      const r = sv('g', { transform: `rotate(${a})` }, s);
      const luz = Math.cos((a + ang - 45) * Math.PI / 180) * Math.cos(giro) > 0;
      sv('polygon', { points: `0,0 ${L},0 ${w},${-w}`, fill: luz ? c1 : c2 }, r);
      sv('polygon', { points: `0,0 ${L},0 ${w},${w}`, fill: luz ? c2 : c3 }, r);
      sv('line', { x1: w * 0.6, y1: -w * 0.35, x2: L * 0.55, y2: -w * 0.12, stroke: '#ffffff', 'stroke-width': Math.max(0.4, L * 0.03), opacity: luz ? 0.7 : 0.25 }, r);
    }
  }
  // La capsula rayada del teletransportador
  function fbCapsula(g, x, yb, r, cierre, brillo, esc, op, rnd) {
    // una esfera con franjas cobre y plata, que se cierra de arriba hacia abajo sobre la bola
    const R = r * 1.2 * esc, cy = yb - r * 0.86, top = cy - R;
    if (cierre <= 0.01) return;
    const c = sv('g', { opacity: op, transform: `translate(${x} ${top}) scale(1 ${cierre}) translate(${-x} ${-top})` }, g);
    const id = 'fb-capsula-' + Math.round(rnd() * 1e9);
    const cp = sv('clipPath', { id }, c);
    sv('circle', { cx: x, cy, r: R }, cp);
    const k = sv('g', { 'clip-path': `url(#${id})` }, c);
    sv('circle', { cx: x, cy, r: R, fill: '#c97a0c' }, k);
    for (let i = 1; i < 7; i++) {
      const rr = R * (1 - i * 0.16);
      sv('circle', { cx: x - (R - rr) * 0.15, cy: cy - (R - rr) * 0.62, r: rr, fill: i % 2 ? '#aeb3bb' : '#d98a14' }, k);
    }
    sv('circle', { cx: x, cy, r: R, fill: 'url(#fb-sombreado-capsula)' }, k);
    sv('circle', { cx: x, cy, r: R, fill: 'none', stroke: '#4a2a05', 'stroke-width': 0.8 }, c);
    sv('ellipse', { cx: x + R * 0.35, cy: cy - R * 0.1, rx: R * 0.14, ry: R * 0.1, fill: '#fff', opacity: 0.7 }, c);
    for (let i = 0; i < Math.round(16 * brillo); i++) {
      const a = rnd() * Math.PI, d = R * (0.55 + rnd() * 0.45);
      sv('circle', { cx: x + Math.cos(a) * d, cy: cy + Math.sin(a) * d * 0.9, r: 0.7 + rnd() * 1.3, fill: rnd() < 0.5 ? '#fff6c0' : '#ffd040' }, g);
    }
  }
  // Las bolitas que forman la nube de una explosion (posiciones fijas por explosion)
  function fbNubes(rnd) {
    const out = [];
    for (let i = 0; i < 9; i++) out.push({ x: (rnd() - 0.5) * 1.3, y: -0.2 - rnd() * 0.5, r: 0.35 + rnd() * 0.3, f: rnd() * 6 }); // copa del hongo
    for (let i = 0; i < 4; i++) out.push({ x: (rnd() - 0.5) * 0.35, y: 0.25 + i * 0.2, r: 0.22 + rnd() * 0.1, f: rnd() * 6 }); // tronco
    return out;
  }
  // Bola de fuego en forma de hongo: blanca y amarilla, despues naranja, roja y humo oscuro
  function fbFuego(g, x, y, t, esc, nubes) {
    if (t <= 0 || t >= 1) return;
    const n = nubes || fbNubes(() => 0.5);
    const S = 26 * esc * (0.45 + 0.75 * Math.min(1, t * 2.2)), sube = 16 * esc * t;
    const fase = t < 0.16 ? 1 : t < 0.38 ? 2 : t < 0.6 ? 3 : t < 0.82 ? 4 : 5;
    const col = ['', 'url(#fb-fuego-1)', 'url(#fb-fuego-2)', 'url(#fb-fuego-3)', 'url(#fb-fuego-4)', 'url(#fb-fuego-5)'];
    const centro = ['', '#ffffff', '#fff3a0', '#ffb428', '#d8341a', '#3a1008'];
    const col2 = [col[fase], centro[fase]];
    const op = t > 0.82 ? Math.max(0, 1 - (t - 0.82) / 0.18) : 1;
    const c = sv('g', { opacity: op, filter: 'url(#fb-llama)' }, g);
    for (const q of n) {
      const w = Math.sin(t * 9 + q.f) * 0.06;
      sv('circle', { cx: x + q.x * S, cy: y - S * 0.55 - sube + q.y * S * 0.9, r: Math.max(0.5, (q.r + w) * S), fill: col2[0] }, c);
    }
    for (const q of n) {
      const w = Math.cos(t * 8 + q.f) * 0.05;
      sv('circle', { cx: x + q.x * S * 0.85 - S * 0.05, cy: y - S * 0.62 - sube + q.y * S * 0.85, r: Math.max(0.3, (q.r * 0.45 + w) * S), fill: col2[1], opacity: 0.55 }, c);
    }
  }
  // Sonidos propios del servidor (tools/puente/web/funball/sonidos/<nombre>.mp3, no van al
  // repositorio). La lista de los que hay la da /puente/funball/sonidos.json; si falta uno, un pitido.
  let fbSonidos = null;
  const fbAudio = new Map();
  function fbCargarSonidos() {
    if (fbSonidos) return;
    fbSonidos = new Set();
    fetch('/puente/funball/sonidos.json', { credentials: 'same-origin' }).then(r => r.ok ? r.json() : []).then(l => { for (const n of l) fbSonidos.add(n); }).catch(() => {});
  }
  // Efectos armados con el sintetizador del navegador para cada cosa que pasa en el tablero
  function fbSintetizar(nombre) {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const t0 = actx.currentTime, out = actx.createGain();
      out.gain.value = 0.5; out.connect(actx.destination);
      const tono = (tipo, f0, f1, ini, dur, vol) => {
        const o = actx.createOscillator(), g = actx.createGain();
        o.type = tipo; o.frequency.setValueAtTime(f0, t0 + ini); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + ini + dur);
        g.gain.setValueAtTime(0.0001, t0 + ini); g.gain.exponentialRampToValueAtTime(vol, t0 + ini + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + ini + dur);
        o.connect(g); g.connect(out); o.start(t0 + ini); o.stop(t0 + ini + dur + 0.02);
      };
      const ruido = (ini, dur, vol, f0, f1, q = 0.8) => {
        const n = Math.ceil(actx.sampleRate * dur), b = actx.createBuffer(1, n, actx.sampleRate), d = b.getChannelData(0);
        for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
        const src = actx.createBufferSource(), fl = actx.createBiquadFilter(), g = actx.createGain();
        src.buffer = b; fl.type = 'bandpass'; fl.Q.value = q; fl.frequency.setValueAtTime(f0, t0 + ini); fl.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t0 + ini + dur);
        g.gain.setValueAtTime(vol, t0 + ini); g.gain.exponentialRampToValueAtTime(0.0001, t0 + ini + dur);
        src.connect(fl); fl.connect(g); g.connect(out); src.start(t0 + ini); src.stop(t0 + ini + dur);
      };
      switch (nombre) {
        case 'salto': tono('sine', 220, 520, 0, 0.12, 0.25); tono('sine', 300, 140, 0.13, 0.08, 0.2); break;
        case 'tobogan': ruido(0, 0.35, 0.25, 900, 2400, 2); break;
        case 'burbuja': for (let i = 0; i < 4; i++) tono('sine', 500 + i * 140, 900 + i * 160, i * 0.09, 0.07, 0.12); break;
        case 'elegir': tono('square', 660, 880, 0, 0.05, 0.08); break;
        case 'fusion': tono('sine', 180, 90, 0, 0.35, 0.3); tono('triangle', 360, 180, 0, 0.3, 0.12); break;
        case 'ataque': tono('sawtooth', 160, 60, 0, 0.4, 0.18); ruido(0, 0.25, 0.2, 400, 120); break;
        case 'anulan': tono('square', 880, 110, 0, 0.9, 0.12); tono('sine', 1320, 160, 0, 0.9, 0.08); break;
        case 'deserta': tono('sine', 400, 120, 0, 0.3, 0.25); break;
        case 'huevo': ruido(0, 0.08, 0.3, 2500, 1200, 3); tono('sine', 500, 900, 0.05, 0.15, 0.15); break;
        case 'revienta': ruido(0, 0.12, 0.4, 3000, 5000, 1.5); tono('sine', 1200, 2400, 0, 0.06, 0.1); break;
        case 'vidrios': for (let i = 0; i < 6; i++) { tono('sine', 2400 + Math.random() * 2400, 1800, i * 0.05, 0.12, 0.08); } ruido(0, 0.3, 0.3, 4000, 2000, 2); break;
        case 'desborda': case 'iman': tono('sine', 300, 700, 0, 0.2, 0.25); if (nombre === 'iman') ruido(0, 0.5, 0.15, 6000, 3000, 6); break;
        case 'resorte': for (let i = 0; i < 5; i++) tono('sine', 300 + i * 120, 500 + i * 160, i * 0.035, 0.06, 0.18); break;
        case 'teletransporte': tono('sine', 300, 1800, 0, 0.8, 0.15); tono('triangle', 310, 1820, 0.02, 0.8, 0.08); break;
        case 'teletransporte-llega': tono('sine', 1800, 300, 0, 0.6, 0.15); break;
        case 'desague': ruido(0, 1.1, 0.35, 600, 120, 4); tono('sine', 400, 60, 0.3, 0.8, 0.2); break;
        case 'achica': tono('sine', 600, 250, 0, 0.25, 0.2); break;
        case 'canion': tono('square', 140, 50, 0, 0.18, 0.25); ruido(0, 0.15, 0.4, 1500, 300); break;
        case 'explota': ruido(0, 1.2, 0.8, 900, 60, 0.6); tono('sine', 90, 30, 0, 0.9, 0.5); break;
        case 'ganador': [523, 659, 784, 1047].forEach((n, i) => tono('square', n, n, i * 0.14, 0.18, 0.1)); tono('square', 1047, 1047, 0.56, 0.5, 0.1); break;
        default: return false;
      }
      return true;
    } catch { return false; }
  }
  function fbSon(nombre, freq, ms) {
    fbCargarSonidos();
    if (!fbSonidos.has(nombre)) return fbSintetizar(nombre) || beep(freq, ms);
    let a = fbAudio.get(nombre);
    if (!a) { a = new Audio('/puente/funball/sonidos/' + nombre + '.mp3'); a.preload = 'auto'; fbAudio.set(nombre, a); }
    try { const b = a.paused ? a : a.cloneNode(); b.currentTime = 0; b.play().catch(() => {}); } catch (e) { beep(freq, ms); }
  }
  function fbTween(vivo, ms, fn) {
    return new Promise(res => {
      const t0 = performance.now();
      const f = (now) => {
        if (!vivo()) return res(false);
        const t = Math.min(1, (now - t0) / ms);
        fn(t);
        if (t < 1) requestAnimationFrame(f); else res(true);
      };
      requestAnimationFrame(f);
    });
  }
  const fbPausa = (ms) => new Promise(r => setTimeout(r, ms));

  function fbAnimate(prev, s) {
    const evs = (s.ultima && s.ultima.ev) || [];
    const fin = () => { if (fbMesa && fbMesa.id === s.id && fbMesa.anim === tok) { fbMesa.anim = null; fbDraw(fbMesa.s && fbMesa.s.id === s.id ? fbMesa.s : s); } };
    const tok = {};
    fbMesa.anim = tok;
    const redu = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!evs.length || redu) return fin();
    const flip = s.yo && s.yo.color === 'R';
    const cells = prev.celdas.map(v => v.slice());
    const vista = { ...s, celdas: cells, teToca: false, estado: 'jugando', deadline: null };
    fbDraw(vista);
    let svg = page && page.querySelector('.fb-tablero');
    if (!svg) return fin();
    let fx = sv('g', { class: 'fb-fx' }, svg);
    const vivo = () => !!(page && fbMesa && fbMesa.anim === tok && svg.isConnected);
    const idx = (c, r) => c * 8 + r;
    const P = (c, r) => { const p = fbXY(c, r, flip); return { x: p.x, y: p.y, yb: p.y + 2 }; };
    let ocultas = [];
    let foco = null;
    const mira = () => { if (fbCam.z <= 1 || !foco) return; fbCam.cx += (foco.x - fbCam.cx) * 0.16; fbCam.cy += (foco.y - fbCam.cy) * 0.16; svg.setAttribute('viewBox', fbVB()); };
    const tween = (ms, fn) => fbTween(vivo, ms, (t) => { fn(t); mira(); });
    const pintar = (oc = []) => {
      ocultas = oc;
      const n = fbBoard(vista, cells.map((v, i) => oc.includes(i) ? [v[0], '', 0, v[3]] : v));
      svg.replaceWith(n); svg = n; fx = sv('g', { class: 'fb-fx' }, svg);
    };
    let seed = (s.ultima.n || 1) * 9301;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const limpiar = () => { fx.textContent = ''; };
    const altoBola = (r) => r * 1.72; // altura de una bola apoyada: donde se apoya la de arriba
    let arranque = null; // { c, r, z }: la proxima bola sale desde arriba de otra (desborde, iman)
    let impulso = 1; // el resorte y la bomba tiran mas alto

    // ── salto en arco (o deslizamiento en el tobogan) ──
    async function salto(e, z1) {
      const a = P(e.de[0], e.de[1]), b = P(e.a[0], e.a[1]), r = fbR(e.s), k = e.k;
      const dist = Math.max(Math.abs(e.a[0] - e.de[0]), Math.abs(e.a[1] - e.de[1]));
      const z0 = arranque && arranque.c === e.de[0] && arranque.r === e.de[1] ? arranque.z : 0;
      arranque = null;
      const base0 = cells[idx(e.de[0], e.de[1])][0];
      const desliza = base0 === FB_B.TOBOGAN && z0 === 0 && impulso === 1;
      const flota = base0 === FB_B.JABON && impulso === 1;
      const h = desliza ? 0 : flota ? 10 : Math.min(90, (34 + 8 * dist) * impulso);
      const ms = desliza ? 110 * dist + 60 : flota ? 650 * dist : (300 + 60 * dist) * Math.sqrt(impulso);
      impulso = 1;
      fbSon(desliza ? 'tobogan' : flota ? 'burbuja' : 'salto', desliza ? 300 : 480, 50);
      await tween(ms, (t) => {
        limpiar();
        const u = flota ? t : t;
        const x = a.x + (b.x - a.x) * u, piso = a.yb + (b.yb - a.yb) * u;
        // como en el original: sube, cruza alto y baja (arco de techo plano)
        const z = z0 + (z1 - z0) * u + (flota ? h * (Math.sin(u * Math.PI) + Math.sin(u * Math.PI * 6) * 0.25) : h * (1 - Math.pow(2 * u - 1, 4)));
        foco = { x, y: piso - z - r };
        fbEsfera(fx, k, r, x, piso - z, { piso, sombraEsc: Math.max(0.4, 1 - z / 120), sombraOp: Math.max(0.25, 1 - z / 90), op: flota ? 0.8 : null });
        if (flota) sv('ellipse', { cx: x, cy: piso - z - r * 0.86, rx: r * 1.12, ry: r * 1.02, fill: 'rgba(220,240,255,0.12)', stroke: 'rgba(235,248,255,0.8)', 'stroke-width': 1.1 }, fx);
      });
    }
    // ── la bola cae encima de otra y se juntan (fusion, ataque, desertar, revienta, huevo) ──
    async function encima(e, tipo, ini, fin1) {
      const c = e.c, rr = e.r, p = P(c, rr), i = idx(c, rr);
      const T = { k: cells[i][1], s: cells[i][2] };
      pintar([...ocultas, i]);
      const rT = fbR(T.s), rI = fbR(ini.s), rF = fbR(fin1.s || 0);
      if (tipo === 'fusion' || tipo === 'ataque') {
        fbSon(tipo, 380, 70);
        const rG = Math.max(rF * 1.08, rT);
        await tween(260, (t) => { limpiar(); const r = rT + (rG - rT) * fbEase(t); fbEsfera(fx, T.k, r, p.x, p.yb); fbEsfera(fx, ini.k, rI, p.x, p.yb - altoBola(r), { sombra: false }); });
        const cid = 'fb-clip-' + Math.round(rnd() * 1e9);
        await tween(520, (t) => {
          limpiar();
          const u = fbEase(t), top = p.yb - altoBola(rG);
          fbEsfera(fx, T.k, rG, p.x, p.yb);
          if (tipo === 'ataque') {
            const cp = sv('clipPath', { id: cid }, fx);
            sv('rect', { x: p.x - rG * 2, y: top - 4, width: rG * 4, height: altoBola(rG) * u + 4 }, cp);
            fbEsfera(fx, ini.k, rG, p.x, p.yb, { sombra: false, clip: `url(#${cid})` });
          }
          const ri = rI * (1 - 0.55 * u);
          fbEsfera(fx, ini.k, ri, p.x, top + (altoBola(rG) * 0.45) * u, { sombra: false, op: 1 - u * 0.6 });
        });
        await tween(200, (t) => { limpiar(); fbEsfera(fx, fin1.k || ini.k, rG + (rF - rG) * fbEase(t), p.x, p.yb); });
      } else if (tipo === 'deserta' || tipo === 'explota' || tipo === 'huevo') {
        fbSon(tipo, tipo === 'huevo' ? 620 : 260, 70);
        await tween(340, (t) => {
          limpiar();
          const u = fbEase(t);
          if (tipo === 'huevo') fbEsfera(fx, 'S', 6, p.x, p.yb, { sy: 1 - 0.8 * u, op: 1 - u });
          else fbEsfera(fx, T.k, rT, p.x, p.yb);
          const base = tipo === 'huevo' ? p.yb : p.yb - altoBola(rT) * (1 - u) * 0.9 + rT * 0.3 * u;
          fbEsfera(fx, ini.k, tipo === 'huevo' ? rI : rI * (1 - 0.8 * u), p.x, base, { sombra: false });
        });
        const kk = tipo === 'huevo' ? ini.k : T.k, r0 = tipo === 'huevo' ? rI : rT;
        const rG = tipo === 'explota' ? fbR(T.s + ini.s) * 1.08 : rF;
        await tween(260, (t) => { limpiar(); fbEsfera(fx, kk, r0 + (rG - r0) * fbEase(t), p.x, p.yb); });
        if (tipo === 'explota') await vidrios(p, rG, kk);
      } else if (tipo === 'anulan') {
        fbSon('anulan', 200, 160);
        await tween(160, (t) => { limpiar(); fbEsfera(fx, T.k, rT, p.x, p.yb); fbEsfera(fx, ini.k, rI, p.x - (rT + rI) * 0.5 * (1 - t), p.yb - altoBola(rT) * 0.3 * (1 - t), { sombra: false }); });
        const L0 = (rT + rI) * 1.3;
        // como en el original: aparece grande, da vueltas en el aire y se achica mientras se aleja
        await tween(1150, (t) => { limpiar(); const u = fbEase(t); fbEstrella(fx, p.x - 10 * u, p.yb - rT * 0.9 - 12 * u, L0 * 1.25 * (1 - 0.85 * u), 20 + t * 420, ini.k, T.k, t * Math.PI * 3); });
      } else if (tipo === 'revienta') {
        fbSon('revienta', 900, 40);
        const rb = Math.max(rT, rI) + 2, cyb = p.yb - rb * 0.9;
        const chispas = Array.from({ length: 22 }, (_, j) => ({ a: (j / 22) * Math.PI * 2 + rnd() * 0.3, d: 0.85 + rnd() * 0.3, c: ['#ffe14a', '#ffb21c', '#ff7a12', '#fff3a0'][j % 4], w: 1.2 + rnd() * 1.3 }));
        await tween(300, (t) => {
          limpiar();
          if (T.s) fbEsfera(fx, T.k, rT, p.x, p.yb);
          for (const q of chispas) {
            const R = rb * q.d * (1 + t * 0.5), x = p.x + Math.cos(q.a) * R, y = cyb + Math.sin(q.a) * R * 0.85 + 14 * t * t;
            sv('rect', { x: x - q.w / 2, y: y - q.w / 2, width: q.w, height: q.w, fill: q.c, opacity: 1 - t * t }, fx);
          }
        });
      }
      limpiar();
    }
    async function vidrios(p, r, k) {
      foco = p;
      fbSon('vidrios', 140, 200);
      const ps = fbVidrios(12, p.x, p.yb - r * 0.9, r, rnd);
      const fill = k === 'R' ? 'url(#fb-roja)' : k === 'G' ? 'url(#fb-verde)' : 'url(#fb-esfera-gris)';
      await tween(700, (t) => { limpiar(); fbPintaVidrios(fx, ps, t * 0.8, fill, p.yb + 6); });
    }
    // ── la bola se parte: la mitad sale por arriba (desborde, iman) ──
    async function partir(c, rr, k, keep, over, iman) {
      const p = P(c, rr), i = idx(c, rr); foco = p;
      pintar([...ocultas, i]);
      const tot = fbR(keep + over), rk = fbR(keep), ro = fbR(over);
      if (iman) {
        await tween(260, (t) => { limpiar(); fbEsfera(fx, k, tot * (1 + 0.25 * fbEase(t)), p.x, p.yb); });
        const R = tot * 1.25;
        await tween(760, () => {
          limpiar();
          fbEsfera(fx, k, R, p.x, p.yb);
          const cp = sv('clipPath', { id: 'fb-clip-iman' }, fx);
          sv('ellipse', { cx: p.x, cy: p.yb - R * 0.86, rx: R * 0.96, ry: R * 0.84 }, cp);
          const rayos = sv('g', { 'clip-path': 'url(#fb-clip-iman)' }, fx);
          for (let j = 0; j < 3; j++) {
            const y0 = p.yb - R * (0.3 + rnd() * 1.2); let d = `M${p.x - R} ${y0}`;
            for (let q = 1; q <= 7; q++) d += `L${p.x - R + q * R * 0.3} ${y0 + (rnd() - 0.5) * 5}`;
            sv('path', { d, stroke: '#fff', 'stroke-width': 1.6, fill: 'none', opacity: 0.9 }, rayos);
          }
        });
        await tween(200, (t) => { limpiar(); fbEsfera(fx, k, R + (tot - R) * t, p.x, p.yb); });
      }
      fbSon(iman ? 'iman' : 'desborda', 520, 60);
      await tween(420, (t) => {
        limpiar();
        const u = fbEase(t), rb = tot + (rk - tot) * u, rt = ro * u;
        fbEsfera(fx, k, rb, p.x, p.yb);
        fbEsfera(fx, k, rt, p.x, p.yb - altoBola(rb) * (0.55 + 0.45 * u), { sombra: false });
      });
      ocultas = ocultas.filter(j => j !== i);
      pintar(ocultas);
      arranque = { c, r: rr, z: altoBola(rk) };
    }
    async function resorte(e) {
      const p = P(e.c, e.r), i = idx(e.c, e.r), k = cells[i][1], r = fbR(cells[i][2]); foco = p;
      pintar([...ocultas, i]);
      fbSon('resorte', 700, 60);
      await tween(280, (t) => {
        limpiar();
        const st = 1 + Math.sin(t * Math.PI) * 0.9 - 0.25 * Math.max(0, 1 - t * 3);
        const g = sv('g', { transform: `translate(${p.x} ${p.y}) scale(1 ${st}) translate(${-p.x} ${-p.y})` }, fx);
        fbBase(g, FB_B.RESORTE, p.x, p.y);
        fbEsfera(fx, k, r, p.x, p.yb - (st - 1) * 18, { sombra: false });
      });
      impulso = 2.1;
      arranque = { c: e.c, r: e.r, z: 0 };
      limpiar();
    }
    async function bomba(c, rr, k, sz) {
      const p = P(c, rr), r = fbR(sz); foco = p;
      await tween(520, (t) => { limpiar(); const b = Math.abs(Math.sin(t * Math.PI * 3)) * 9 * (1 - t * 0.3); fbEsfera(fx, k, r, p.x, p.yb - b, { piso: p.yb, sy: 1 - (b < 2 ? 0.12 : 0) }); });
      impulso = 1.6;
    }
    async function teletransporte(e) {
      const a = P(e.de[0], e.de[1]), b = P(e.a[0], e.a[1]), i = idx(e.de[0], e.de[1]);
      const k = cells[i][1], sz = cells[i][2], r = fbR(sz);
      foco = a;
      pintar([...ocultas, i]);
      fbSon('teletransporte', 760, 80);
      await tween(320, (t) => { limpiar(); fbEsfera(fx, k, r, a.x, a.yb); fbCapsula(fx, a.x, a.yb, r, fbEase(t), 0, 1, 1, rnd); });
      await tween(420, (t) => { limpiar(); fbCapsula(fx, a.x, a.yb, r, 1, t, 1, 1, rnd); });
      await tween(380, (t) => { limpiar(); fbCapsula(fx, a.x, a.yb, r, 1, 1, 1 + 0.6 * t, 1 - t, rnd); });
      fbSon('teletransporte-llega', 900, 80);
      foco = b;
      await tween(380, (t) => { limpiar(); fbCapsula(fx, b.x, b.yb, r, 1, 1, 1.6 - 0.6 * t, t, rnd); });
      await tween(300, (t) => { limpiar(); fbEsfera(fx, k, r, b.x, b.yb); fbCapsula(fx, b.x, b.yb, r, 1 - fbEase(t), 1 - t, 1, 1, rnd); });
      limpiar();
    }
    async function desague(e) {
      const p = P(e.c, e.r), i = idx(e.c, e.r), k = cells[i][1], r = fbR(cells[i][2]); foco = p;
      pintar([...ocultas, i]);
      fbSon('desague', 220, 300);
      await tween(380, (t) => { limpiar(); fbEsfera(fx, k, r * (1 + 0.55 * fbEase(t)), p.x, p.yb); });
      const R = r * 1.55, cy = p.yb - R * 0.86;
      const adentro = k === 'G' ? ['#04401c', '#0b6f35'] : ['#5a0606', '#a8201a'];
      // la cascara cortada a la altura "corte": abajo la bola, arriba la boca abierta
      const cascara = (corte, boca) => {
        const id = 'fb-clip-des-' + Math.round(rnd() * 1e9);
        const cp = sv('clipPath', { id }, fx);
        sv('rect', { x: p.x - R * 2, y: corte, width: R * 4, height: R * 3 }, cp);
        fbEsfera(fx, k, R, p.x, p.yb, { clip: `url(#${id})` });
        const dy = corte - cy, ancho = Math.sqrt(Math.max(0, R * R - dy * dy));
        if (ancho > 0.5 && boca > 0) {
          sv('ellipse', { cx: p.x, cy: corte, rx: ancho * boca, ry: ancho * 0.36 * boca, fill: adentro[0] }, fx);
          sv('ellipse', { cx: p.x, cy: corte + ancho * 0.1 * boca, rx: ancho * 0.8 * boca, ry: ancho * 0.24 * boca, fill: adentro[1], opacity: 0.6 }, fx);
        }
      };
      await tween(420, (t) => { limpiar(); cascara(cy - R * (1 - 0.3 * fbEase(t)), fbEase(t)); });
      await tween(520, (t) => { limpiar(); cascara(cy - R * 0.7 + R * 1.1 * fbEase(t), 1); });
      // al final queda un disco chato del color de la bola que se va por el cano
      await tween(420, (t) => { limpiar(); fbEsfera(fx, k, R * (1 - 0.45 * t), p.x, p.yb, { sy: 0.32 * (1 - t) + 0.02, sombraEsc: 1 - t }); });
      limpiar();
    }
    async function achica(e, a, b) {
      const p = P(e.c, e.r), i = idx(e.c, e.r), k = cells[i][1]; foco = p;
      pintar([...ocultas, i]);
      fbSon('achica', 340, 80);
      await tween(260, (t) => { limpiar(); fbEsfera(fx, k, fbR(a) + (fbR(b) - fbR(a)) * fbEase(t), p.x, p.yb); });
      limpiar();
    }
    async function canion(e, sz0) {
      const p = P(e.c, e.r), i = idx(e.c, e.r), k = cells[i][1]; foco = p;
      pintar([...ocultas, i]);
      await tween(260, (t) => { limpiar(); fbEsfera(fx, k, fbR(sz0) * (1 + 0.25 * Math.sin(t * Math.PI)), p.x, p.yb); });
      await tween(320, (t) => { limpiar(); fbEsfera(fx, k, fbR(sz0) * (1 - fbEase(t)), p.x, p.yb, { sy: 1 - 0.5 * t }); });
      await tween(320, (t) => { limpiar(); fbTorreta(fx, k, p.x, p.y, fbEase(t), 0); });
      await tween(380, (t) => { limpiar(); fbTorreta(fx, k, p.x, p.y, 1, fbEase(t)); });
      limpiar();
    }
    async function disparo(e) {
      const a = P(e.de[0], e.de[1]), b = P(e.a[0], e.a[1]);
      const n = Math.max(Math.abs(e.a[0] - e.de[0]), Math.abs(e.a[1] - e.de[1]));
      const k = cells[idx(e.de[0], e.de[1])][1] || 'R';
      fbSon('canion', 120, 160);
      // el proyectil es una bolita del color del canion que llega enseguida al blanco
      await tween(55 * n + 90, (t) => {
        limpiar();
        const x = a.x + (b.x - a.x) * t, y = a.y - 20 + (b.y - a.y + 8) * t - 8 * Math.sin(t * Math.PI);
        foco = { x, y };
        fbEsfera(fx, k, 4, x, y, { sombra: false });
      });
      limpiar(); // la explosion la dibuja el evento que sigue
    }
    const vecinosCon = (c, r) => {
      const out = [];
      for (let dc = -1; dc <= 1; dc++) for (let dr = -1; dr <= 1; dr++) {
        if (!dc && !dr) continue;
        const cc = c + dc, rr = r + dr;
        if (cc < 0 || rr < 0 || cc > 7 || rr > 7) continue;
        const v = cells[idx(cc, rr)];
        if (v[1] && v[2] && v[1] !== 'S' && v[0] !== 4) out.push(P(cc, rr));
      }
      return out;
    };
    async function boom(p, fill, vecinos = []) {
      foco = p;
      fbSon('explota', 110, 260);
      const nubes = fbNubes(rnd), chicas = vecinos.map(() => fbNubes(rnd));
      await tween(1150, (t) => {
        limpiar();
        fbFuego(fx, p.x, p.y + 2, t, 1, nubes);
        if (t > 0.25) vecinos.forEach((q, j) => fbFuego(fx, q.x, q.y - 4, Math.min(1, (t - 0.25) / 0.7), 0.42, chicas[j]));
      });
      limpiar();
    }
    async function arania(e) {
      const a = P(e.de[0], e.de[1]), b = P(e.a[0], e.a[1]);
      cells[idx(e.de[0], e.de[1])][3] = 0;
      pintar(ocultas);
      await tween(520, (t) => {
        limpiar();
        const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t - Math.abs(Math.sin(t * Math.PI * 4)) * 2;
        foco = { x, y };
        fbSpider(fx, x, y);
      });
      cells[idx(e.a[0], e.a[1])][3] = 1;
      limpiar();
      pintar(ocultas);
    }
    async function pone(e) {
      const p = P(e.c, e.r); foco = p;
      await tween(260, (t) => { limpiar(); fbEsfera(fx, 'S', 6, p.x, p.yb, { sx: t, sy: t }); });
      limpiar();
    }

    const LLEGA = ['fusion', 'ataque', 'anulan', 'deserta', 'explota', 'huevo', 'revienta'];
    (async () => {
      let sucio = false;
      for (let n = 0; n < evs.length; n++) {
        if (!vivo()) return;
        const e = evs[n];
        if (e.t === 'bola') {
          const v = cells[idx(e.c, e.r)];
          // la bola que sale de la bomba primero rebota
          if (!e.k && v[0] === FB_B.BOMBA && v[2]) { const nx = evs[n + 1]; if (nx && nx.t === 'mueve' && nx.de[0] === e.c && nx.de[1] === e.r) { pintar([...ocultas, idx(e.c, e.r)]); await bomba(e.c, e.r, v[1], v[2]); } }
          // en el iman la bola se queda con una parte: se sacude y se parte
          if (e.k && v[0] === FB_B.IMAN && v[1] === e.k && v[2] > e.s) { const nx = evs[n + 1]; if (nx && nx.t === 'mueve' && nx.de[0] === e.c && nx.de[1] === e.r) { v[1] = e.k; const tot = v[2]; v[2] = e.s; await partir(e.c, e.r, e.k, e.s, tot - e.s, true); continue; } }
          v[1] = e.k; v[2] = e.s; sucio = true;
          continue;
        }
        if (e.t === 'base') { cells[idx(e.c, e.r)][0] = e.b; sucio = true; continue; }
        if (sucio) { pintar(ocultas.filter(i => cells[i][2])); sucio = false; }
        if (e.t === 'mueve') {
          // que pasa al llegar: el proximo evento que no sea poner una bola
          let m = n + 1; while (m < evs.length && evs[m].t === 'bola' && !(evs[m].c === e.a[0] && evs[m].r === e.a[1])) m++;
          const nx = evs[m];
          const dst = cells[idx(e.a[0], e.a[1])];
          const sobre = nx && LLEGA.includes(nx.t) && nx.t !== 'huevo' && nx.c === e.a[0] && nx.r === e.a[1] && dst[2] ? altoBola(fbR(dst[2])) : 0;
          await salto(e, sobre);
          if (nx && LLEGA.includes(nx.t) && nx.c === e.a[0] && nx.r === e.a[1]) {
            // el resultado: la proxima bola que se pone en esa casilla
            let f = m + 1; while (f < evs.length && !(evs[f].t === 'bola' && evs[f].c === e.a[0] && evs[f].r === e.a[1])) f++;
            const res = evs[f] || { k: '', s: 0 };
            if (nx.t === 'explota' && !dst[2]) { limpiar(); await boom(P(e.a[0], e.a[1]), 'url(#fb-esfera-gris)', vecinosCon(e.a[0], e.a[1])); }
            else await encima(nx, nx.t, { k: e.k, s: e.s }, res);
            n = m;
            if (res !== evs[f]) continue;
            const v = cells[idx(e.a[0], e.a[1])]; v[1] = res.k; v[2] = res.s; n = f;
            ocultas = ocultas.filter(i => i !== idx(e.a[0], e.a[1]));
            pintar(ocultas);
          } else {
            limpiar();
            // el destino se dibuja recien cuando la bola llega (lo pone el proximo evento)
            fbEsfera(fx, e.k, fbR(e.s), P(e.a[0], e.a[1]).x, P(e.a[0], e.a[1]).yb);
          }
          continue;
        }
        if (e.t === 'desborda') {
          const nx = evs.slice(n + 1).find(x => x.t === 'mueve');
          const v = cells[idx(e.c, e.r)];
          if (nx) await partir(e.c, e.r, v[1], v[2], nx.s, false);
          continue;
        }
        if (e.t === 'resorte') { await resorte(e); continue; }
        if (e.t === 'teletransporta') { await teletransporte(e); continue; }
        if (e.t === 'desague') { await desague(e); continue; }
        if (e.t === 'achica') { const v = cells[idx(e.c, e.r)]; await achica(e, v[2], 5); continue; }
        if (e.t === 'canion') { const v = cells[idx(e.c, e.r)]; await canion(e, v[2]); continue; }
        if (e.t === 'dispara') { await disparo(e); continue; }
        if (e.t === 'explota') { await boom(P(e.c, e.r), 'url(#fb-esfera-gris)', vecinosCon(e.c, e.r)); continue; }
        if (e.t === 'arania') { await arania(e); continue; }
        if (e.t === 'pone') { await pone(e); continue; }
        if (LLEGA.includes(e.t)) { await fbPausa(150); continue; }
      }
      if (vivo()) { limpiar(); if (sucio) pintar([]); await fbPausa(120); }
    })().catch(() => {}).then(fin);
  }
  // "Y el ganador es...": el tablero se funde a marron y a negro, aparece la base y la bola
  // ganadora con el #1 se arma de a puntitos, como en el original. Tocarla muestra el tablero.
  const fbGanadorVisto = new Set();
  function fbGanador(v, s) {
    const animar = !fbGanadorVisto.has(s.id);
    fbGanadorVisto.add(s.id);
    const draw = s.ganador === 'empate';
    const k = draw ? null : (s.ganador === 'yo' ? s.yo.color : s.rival.color);
    const W = 1000, H = 880;
    const c = el('canvas', 'fb-ganador'); c.width = W; c.height = H;
    c.title = 'Tocá para ver el tablero';
    c.addEventListener('click', (e) => { e.stopPropagation(); c.classList.toggle('fb-oculto'); });
    v.appendChild(c);
    const g = c.getContext('2d');
    // textos con letras gruesas naranjas, pixeladas como las del juego
    const texto = (t, px) => {
      const k2 = 3, m = document.createElement('canvas'), mg = m.getContext('2d');
      mg.font = `900 ${Math.round(px / k2)}px "Arial Black", Impact, sans-serif`;
      const w = Math.ceil(mg.measureText(t).width) + 6, h = Math.round(px / k2 * 1.3);
      m.width = w; m.height = h;
      mg.font = `900 ${Math.round(px / k2)}px "Arial Black", Impact, sans-serif`; mg.textBaseline = 'middle';
      const gr = mg.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#ffd85a'); gr.addColorStop(0.5, '#ff8a10'); gr.addColorStop(1, '#b81c06');
      mg.lineWidth = 2; mg.strokeStyle = '#3a0802'; mg.strokeText(t, 3, h / 2); mg.fillStyle = gr; mg.fillText(t, 3, h / 2);
      return m;
    };
    const t1 = texto('Y EL GANADOR ES...', 64), t2 = texto(draw ? '¡EMPATE!' : (k === 'R' ? '¡ROJO!' : '¡VERDE!'), 80);
    const pinta = (img, cx, cy, esc) => { g.imageSmoothingEnabled = false; g.drawImage(img, Math.round(cx - img.width * esc / 2), Math.round(cy - img.height * esc / 2), img.width * esc, img.height * esc); };
    // la bola ganadora con el #1, armada aparte
    const bola = document.createElement('canvas'); bola.width = W; bola.height = H;
    const hoja = new Image();
    const armar = () => {
      const bg = bola.getContext('2d');
      if (draw) return;
      const cx = W / 2, base = 520, R = 150;
      if (fbArte !== false && hoja.complete && hoja.naturalWidth) {
        const pz = FB_PIEZAS[k === 'R' ? 'rojaB' : 'verdeB'], sc = R / pz[6];
        bg.drawImage(hoja, pz[0], pz[1], pz[2], pz[3], cx - pz[4] * sc, base - pz[5] * sc, pz[2] * sc, pz[3] * sc);
      } else {
        const gr = bg.createRadialGradient(cx - R * 0.35, base - R * 1.2, R * 0.1, cx, base - R * 0.86, R);
        gr.addColorStop(0, k === 'R' ? '#ff9a8a' : '#a8ffc8'); gr.addColorStop(0.5, k === 'R' ? '#e01a14' : '#18a050'); gr.addColorStop(1, k === 'R' ? '#5a0404' : '#04401c');
        bg.fillStyle = gr; bg.beginPath(); bg.ellipse(cx, base - R * 0.86, R, R * 0.86, 0, 0, Math.PI * 2); bg.fill();
      }
      // el #1 plateado
      bg.save(); bg.beginPath(); bg.ellipse(cx, base - R * 0.86, R * 0.97, R * 0.84, 0, 0, Math.PI * 2); bg.clip();
      bg.font = `900 ${Math.round(R * 1.05)}px "Arial Black", Impact, sans-serif`; bg.textAlign = 'center'; bg.textBaseline = 'middle';
      const pl = bg.createLinearGradient(cx - R * 0.6, base - R * 1.5, cx + R * 0.6, base - R * 0.3);
      pl.addColorStop(0, '#ffffff'); pl.addColorStop(0.35, '#a8adb6'); pl.addColorStop(0.6, '#f2f3f5'); pl.addColorStop(1, '#5f646c');
      bg.lineWidth = 8; bg.strokeStyle = 'rgba(20,22,26,0.75)'; bg.strokeText('#1', cx, base - R * 0.86);
      bg.fillStyle = pl; bg.fillText('#1', cx, base - R * 0.86);
      bg.restore();
    };
    const pedestal = () => {
      const cx = W / 2, y = 520;
      if (fbArte !== false && hoja.complete && hoja.naturalWidth) {
        const pz = FB_PIEZAS.tobogan, sc = 2.4;
        g.drawImage(hoja, pz[0], pz[1], pz[2], pz[3], cx - pz[4] * sc, y - pz[5] * sc + 10, pz[2] * sc, pz[3] * sc);
      } else {
        g.fillStyle = '#3e46c8'; g.beginPath(); g.ellipse(cx, y + 18, 130, 46, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#7a83ff'; g.beginPath(); g.ellipse(cx, y, 130, 46, 0, 0, Math.PI * 2); g.fill();
      }
    };
    // aparicion de a puntitos, de arriba hacia abajo
    const B = 6, cols = Math.ceil(W / B), rows = Math.ceil(H / B);
    const umbral = new Float32Array(cols * rows);
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) umbral[j * cols + i] = (j / rows) * 0.65 + Math.random() * 0.35;
    const visto = document.createElement('canvas'); visto.width = W; visto.height = H;
    const vg = visto.getContext('2d');
    let hecho = 0;
    const revelar = (p) => {
      for (let n = 0; n < umbral.length; n++) {
        if (umbral[n] <= p && umbral[n] > hecho) { const x = (n % cols) * B, y = Math.floor(n / cols) * B; vg.drawImage(bola, x, y, B, B, x, y, B, B); }
      }
      hecho = Math.max(hecho, p);
    };
    const mezcla = (a, b, u) => a.map((x, i) => Math.round(x + (b[i] - x) * u));
    const cuadro = (ms) => {
      g.clearRect(0, 0, W, H);
      const marron = [92, 66, 52];
      if (ms < 600) { g.fillStyle = `rgba(${marron.join(',')},${ms / 600})`; g.fillRect(0, 0, W, H); return; }
      const u = Math.min(1, (ms - 600) / 1300);
      g.fillStyle = `rgb(${mezcla(marron, [0, 0, 0], u).join(',')})`; g.fillRect(0, 0, W, H);
      pinta(t1, W / 2, 130, 3);
      pedestal();
      if (ms > 2500) { revelar(Math.min(1, (ms - 2500) / 800)); g.drawImage(visto, 0, 0); }
      if (ms > 3400) {
        const p = Math.min(1, (ms - 3400) / 350);
        g.save(); g.globalAlpha = p; pinta(t2, W / 2, 700, 3); g.restore();
      }
    };
    const arrancar = () => {
      armar();
      if (!animar) { revelar(1); cuadro(99999); return; }
      const t0 = performance.now();
      let sono = false;
      const f = (now) => { if (!c.isConnected) return; const ms = now - t0; cuadro(ms); if (!sono && ms > 3400) { sono = true; fbSon('ganador', 660, 220); } if (ms < 3800) requestAnimationFrame(f); };
      requestAnimationFrame(f);
    };
    if (fbArte === false) arrancar();
    else { hoja.onload = arrancar; hoja.onerror = () => { fbArte = false; arrancar(); }; hoja.src = FB_ARTE + 'piezas.webp?v=' + Object.keys(FB_PIEZAS).length; }
  }
  function fbEnd(b, s) {
    const w = el('div', 'jg-fin');
    const won = s.ganador === 'yo', draw = s.ganador === 'empate';
    const why = { meta: 'llegó a la meta', bolas: 'se quedó con las únicas bolas', abandono: 'por abandono', 'sin-jugadas': 'el otro no tenía jugadas', empate: 'no quedó ninguna bola' }[s.motivo] || '';
    w.append(el('div', 'jg-hero-cartas', draw ? '🤝' : won ? '🏆' : '🟢'), el('div', 'jg-hero-t', draw ? 'Empate' : won ? '¡Ganaste!' : `Ganó ${s.rival.nombre}`), el('div', 'jg-hero-s', why));
    const acts = el('div', 'jg-acciones');
    if (s.soyJugador && !s.siguiente) {
      const r = el('button', 'jg-btn jg-primario', s.revancha && s.revancha.yo ? 'Esperando revancha…' : s.revancha && s.revancha.rival ? `${s.rival.nombre} quiere la revancha: ¡Dale!` : 'Revancha');
      r.type = 'button'; r.disabled = !!(s.revancha && s.revancha.yo);
      r.addEventListener('click', () => emit('funball:accion', { id: s.id, tipo: 'revancha' }).then(x => { if (x.error) toast(x.error, 'error'); else if (x.id) { stack.pop(); go('fbMesa', x.id); } }));
      acts.appendChild(r);
    }
    const v = el('button', 'jg-btn', 'Volver a Juegos'); v.type = 'button'; v.addEventListener('click', () => { stack = [['inicio']]; go('inicio', 'funball'); });
    acts.appendChild(v);
    w.appendChild(acts);
    const log = el('div', 'jg-log'); (s.log || []).slice(-6).forEach(l => log.appendChild(el('div', '', l)));
    w.appendChild(log);
    b.appendChild(w);
  }

  // ── Icono y numerito ("te toca") ──
  function setBadge(n) {
    for (const x of document.querySelectorAll('.puente-jg-btn .puente-rail-badge')) { x.textContent = n ? String(n) : ''; x.style.display = n ? '' : 'none'; }
  }
  let badgeT = null;
  function refreshBadge() {
    clearTimeout(badgeT);
    badgeT = setTimeout(async () => {
      const [d, f] = await Promise.all([emit('truco:inicio'), emit('funball:inicio')]);
      const n = (d.error ? 0 : d.mias.filter(m => m.teToca).length) + (f.error || !f.mias ? 0 : f.mias.filter(m => m.teToca).length);
      setBadge(n);
    }, 400);
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
    a.socket.on('truco:estado', (s) => { if (page && mesa && mesa.id === s.id) render(s); refreshBadge(); });
    a.socket.on('truco:cambio', () => { refreshBadge(); const t = page && stack[stack.length - 1]; if (t && t[0] === 'inicio' && t[1] !== 'funball') show('inicio', t[1]); });
    a.socket.on('funball:estado', (s) => { if (page && fbMesa && fbMesa.id === s.id) fbRender(s); refreshBadge(); });
    a.socket.on('funball:cambio', () => { refreshBadge(); const t = page && stack[stack.length - 1]; if (t && t[0] === 'inicio' && t[1] !== 'truco') show('inicio', t[1]); });
    a.socket.on('connect', () => {
      if (page && fbMesa) emit('funball:ver', { id: fbMesa.id }).then(d => d.partida && fbRender(d.partida, true));
      else if (page && mesa) emit('truco:ver', { id: mesa.id }).then(d => d.partida && render(d.partida));
    });
    if (typeof a.switchChannel === 'function') { const sw = a.switchChannel; a.switchChannel = function (...x) { close(); return sw.apply(this, x); }; }
    document.addEventListener('click', (e) => {
      if (page && e.target instanceof Element && e.target.closest('.puente-pc-dm, #home-server, #puente-rail .puente-rail-dm, #puente-rail .puente-rail-server, .puente-mk-btn')) close();
    }, true);
    // Enlace a una mesa: se abre aca mismo
    document.addEventListener('click', (e) => {
      const l = e.target instanceof Element && e.target.closest('a[href]');
      if (!l || e.ctrlKey || e.metaKey) return;
      let u; try { u = new URL(l.href, location.href); } catch { return; }
      const ok = u.origin === location.origin && /^\/app/.test(u.pathname);
      // La biblioteca (/app?juegos) o la sala de un juego (/app?juegos=truco)
      if (ok && u.searchParams.has('juegos')) {
        const j = u.searchParams.get('juegos');
        if (j && !JUEGOS.some(x => x.id === j)) return;
        e.preventDefault(); e.stopPropagation(); stack = []; go('inicio', j || undefined); return;
      }
      const id = ok && u.searchParams.get('truco'), fid = ok && u.searchParams.get('funball');
      if (fid && /^[a-f0-9]{6,20}$/.test(fid)) { e.preventDefault(); e.stopPropagation(); stack = []; go('fbMesa', fid); return; }
      if (!id || !/^[a-f0-9]{6,20}$/.test(id)) return;
      e.preventDefault(); e.stopPropagation();
      stack = []; go('mesa', id);
    }, true);
    const sp = new URLSearchParams(location.search).get('truco');
    if (sp && /^[a-f0-9]{6,20}$/.test(sp)) setTimeout(() => { stack = []; go('mesa', sp); }, 1500);
    const jq = new URLSearchParams(location.search), jp = jq.get('juegos');
    if (jq.has('juegos') && (!jp || JUEGOS.some(x => x.id === jp))) setTimeout(() => { stack = []; go('inicio', jp || undefined); }, 1500);
    const fp = new URLSearchParams(location.search).get('funball');
    if (fp && /^[a-f0-9]{6,20}$/.test(fp)) setTimeout(() => { stack = []; go('fbMesa', fp); }, 1500);
    addEventListener('resize', () => { if (page && !mobile()) { const bar = byId('server-bar'); page.style.left = bar ? Math.round(bar.getBoundingClientRect().right) + 'px' : '0'; } else if (page) page.style.left = ''; });
  })();
})();

// "Está escribiendo…" como en Discord (escribiendo.js): los tres puntitos que
// laten, y los nombres en negrita: "Fulano está escribiendo…", "Fulano y Mengano
// están escribiendo…", "A, B y C están escribiendo…", "Varias personas están
// escribiendo…". Junta a los que escriben en la app y en Discord (desde Discord
// dura 10 segundos, como alla); el de cada uno se va cuando llega su mensaje.
(function () {
  'use strict';
  const typers = new Map(); // clave -> { nombre, hasta }
  let timer = null;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const DOTS = '<span class="puente-escribe-puntos" aria-hidden="true"><i></i><i></i><i></i></span>';
  function render() {
    const box = document.getElementById('typing-indicator');
    if (!box) return;
    const now = Date.now();
    for (const [k, v] of typers) if (v.hasta <= now) typers.delete(k);
    clearTimeout(timer);
    const names = [...new Set([...typers.values()].map(v => v.nombre))];
    if (!names.length) { box.innerHTML = ''; box.classList.remove('puente-escribe'); return; }
    const b = n => `<b>${esc(n)}</b>`;
    const text = names.length === 1 ? `${b(names[0])} está escribiendo…`
      : names.length === 2 ? `${b(names[0])} y ${b(names[1])} están escribiendo…`
        : names.length === 3 ? `${b(names[0])}, ${b(names[1])} y ${b(names[2])} están escribiendo…`
          : 'Varias personas están escribiendo…';
    box.innerHTML = DOTS + `<span class="puente-escribe-texto">${text}</span>`;
    box.classList.add('puente-escribe');
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
    if (!app || !app.socket || typeof app._showTyping !== 'function') { if (++tries < 120) setTimeout(wait, 500); return; }
    const orig = app._showTyping;
    app._showTyping = function (username) {
      try { add(this, username, 5000); } catch (err) { console.warn('[puente] escribiendo:', err); return orig.apply(this, arguments); }
    };
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

  async function check() {
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
//  - "🤝 Invitar gente" en la tarjeta de perfil propia: tu enlace para copiar o
//    compartir, y cuantas personas trajiste.
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
    back.appendChild(box);
    back.addEventListener('click', (e) => { if (e.target === back) close(); });
    document.body.appendChild(back);
    const d = await fetch('/puente/api/invitacion/mia', { headers: { Authorization: 'Bearer ' + token() } }).then(r => (r.ok ? r.json() : null)).catch(() => null);
    if (!d) { input.value = 'No se pudo cargar. Probá de nuevo.'; return; }
    input.value = d.enlace;
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
  window.puenteInvitar = open;

  const style = el('style');
  style.textContent = `
    #puente-invitar-capa { position: fixed; inset: 0; z-index: 100012; display: flex; align-items: center; justify-content: center; padding: 16px; background: rgba(0,0,0,.7); animation: puente-fade .18s ease-out; }
    #puente-invitar-capa .pi-tarjeta { position: relative; width: 100%; max-width: 26rem; box-sizing: border-box; padding: 1.75rem 1.5rem 1.25rem; border-radius: 1rem; background: #242429; color: #dbdee1; text-align: center; box-shadow: 0 16px 48px rgba(0,0,0,.5); }
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

  // Lo que se puede cerrar, de lo mas "arriba" a lo mas "abajo": [esta abierto, cerrarlo]
  const LAYERS = [
    [() => byId('puente-medalla-globo'), () => byId('puente-medalla-globo').remove()],
    [() => shown(byId('image-lightbox')), (app) => app._closeLightbox ? app._closeLightbox() : (byId('image-lightbox').style.display = 'none')],
    [() => byId('puente-tema-hoja'), () => { byId('puente-tema-hoja')?.remove(); byId('puente-tema-fondo')?.remove(); }],
    [() => byId('puente-perfil-capa'), () => byId('puente-perfil-capa').remove()],
    [() => byId('puente-invitar-capa'), () => byId('puente-invitar-capa').remove()],
    [() => byId('puente-historia-capa'), () => byId('puente-historia-capa').remove()],
    [() => byId('puente-vincular-capa'), () => byId('puente-vincular-capa').querySelector('.pv-luego')?.click()],
    [() => window.puenteAdjuntar && window.puenteAdjuntar.abierto(), () => window.puenteAdjuntar.cerrar()],
    [() => window.puenteJuegos && window.puenteJuegos.abierto() && !shown(byId('profile-popup')), () => window.puenteJuegos.atras()],
    [() => window.puenteMercado && window.puenteMercado.abierto() && !shown(byId('profile-popup')) && !shown(byId('image-lightbox')), () => window.puenteMercado.atras()],
    [() => window.puenteLupa && window.puenteLupa.abierta() && !shown(byId('profile-popup')), () => window.puenteLupa.cerrar()],
    [() => shown(byId('message-context-menu')), (app) => app._hideMessageContextMenu && app._hideMessageContextMenu()],
    [() => shown(byId('user-context-menu')), (app) => app._hideUserContextMenu && app._hideUserContextMenu()],
    [() => shown(byId('profile-popup')), (app) => app._closeProfilePopup && app._closeProfilePopup()],
    [() => shown(byId('gif-picker')), (app) => app._closeGifPicker ? app._closeGifPicker() : (byId('gif-picker').style.display = 'none')],
    [() => shown(byId('emoji-picker')), (app) => (app._toggleEmojiPicker ? app._toggleEmojiPicker() : (byId('emoji-picker').style.display = 'none'))],
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
    document.addEventListener('click', () => setTimeout(arm, 50), true);
    document.addEventListener('pointerdown', () => setTimeout(arm, 50), true);
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
    { id: 'cuenta', icon: '👤', name: 'Mi cuenta', extra: 'vinculos', ids: ['section-password', 'section-2fa', 'section-sessions', 'section-recovery', 'section-e2e-passphrase', 'section-delete-account'] },
    { id: 'perfil', icon: '✨', name: 'Perfil', extra: 'perfil', ids: [] },
    { id: 'notif', icon: '🔔', name: 'Notificaciones', ids: ['section-push', 'section-sounds'] },
    { id: 'idioma', icon: '🌐', name: 'Idioma y hora', ids: ['section-language'] },
    { id: 'acces', icon: '♿', name: 'Accesibilidad y chat', ids: ['section-zoom', 'section-chat-behavior'] },
  ];
  const ADMIN = [
    { id: 'servidor', icon: '🏠', name: 'Servidor', ids: ['section-update', 'section-branding', 'section-presence', 'section-custom-tos', 'section-connectivity'] },
    { id: 'personas', icon: '🛡️', name: 'Miembros y moderación', ids: ['section-members', 'section-roles', 'section-moderation', 'section-security', 'section-automod', 'section-invite'] },
    { id: 'contenido', icon: '😀', name: 'Emojis, stickers y archivos', ids: ['section-emojis', 'section-stickers', 'section-uploads'] },
    { id: 'manten', icon: '🧰', name: 'Mantenimiento', ids: ['section-backup', 'section-cleanup', 'section-modmode', 'section-audit-log'] },
  ];
  // Lo que no se usa en CV Chat (o choca con su diseño): no se muestra
  const REMOVED = ['section-layout', 'section-reaction-size', 'section-role-display', 'section-toolbar-icons', 'section-image-display', 'section-embed-size',
    'section-banner-display', 'section-toggle-style', 'section-statusbar', 'section-soundboard-mode', 'section-activity', 'section-score-badges', 'section-plugins',
    'section-debug', 'section-desktop-shortcuts', 'section-desktop-app',
    'section-ferry', 'section-import', 'section-tunnel', 'section-guests', 'section-whitelist', 'section-template', 'section-extension-updates',
    'section-large-server', 'section-sounds-admin', 'section-bots', 'section-tags-admin'];
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
    if (cat.extra === 'vinculos') fillLinks();
  }
  function backToList() { refs.modal.classList.remove('pas-detalle'); current = null; }

  // "Mi cuenta": email de recuperacion y Discord vinculado
  async function fillLinks() {
    const box = refs.links;
    box.textContent = '';
    const token = (() => { try { return localStorage.getItem('haven_token'); } catch { return null; } })();
    const st = await fetch('/puente/api/estado', { headers: { Authorization: 'Bearer ' + token } }).then(r => (r.ok ? r.json() : null)).catch(() => null);
    const row = (icon, title, sub, label, fn) => {
      const r = el('div', 'pas-fila');
      const t = el('div', 'pas-fila-texto'); t.append(el('b', null, icon + ' ' + title), el('span', null, sub));
      const b = el('button', 'pas-boton', label); b.type = 'button'; b.addEventListener('click', fn);
      r.append(t, b); box.appendChild(r);
    };
    if (st && st.disponible) {
      row('🔗', 'Discord', st.vinculado ? `Vinculada con @${st.discord && st.discord.usuario}` : 'Sin vincular: vinculala para recuperar tu historial y verificar tu nombre.',
        st.vinculado ? 'Administrar' : 'Vincular', () => { location.href = '/puente/vincular'; });
    }
    if (window.puenteEmail) row('✉️', 'Email de recuperación', 'Para recuperar la contraseña si te la olvidás.', 'Cambiar', () => window.puenteEmail.open());
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
