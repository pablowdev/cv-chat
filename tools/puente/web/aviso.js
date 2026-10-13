// Aviso "Vinculá tu cuenta de Discord" dentro de Haven (/app), para quien
// todavia no la vinculo. Se puede cerrar: vuelve a aparecer a los 3 dias.
(function () {
  'use strict';
  const HIDE_KEY = 'puente_aviso_oculto_hasta';
  const HIDE_MS = 3 * 24 * 3600 * 1000;

  function storage(fn) { try { return fn(); } catch { return null; } }

  async function check() {
    const token = storage(() => localStorage.getItem('haven_token'));
    if (!token) return false; // todavia en el login: volver a probar
    const until = Number(storage(() => localStorage.getItem(HIDE_KEY)) || 0);
    if (until > Date.now()) return true;
    const res = await fetch('/puente/api/estado', { headers: { Authorization: 'Bearer ' + token } }).catch(() => null);
    if (!res || !res.ok) return res && res.status === 401 ? false : true;
    const st = await res.json().catch(() => null);
    if (st && !st.vinculado && st.disponible) render();
    return true;
  }

  function render() {
    if (document.getElementById('puente-aviso')) return;
    const bar = document.createElement('div');
    bar.id = 'puente-aviso';
    bar.setAttribute('role', 'status');
    bar.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:16px;z-index:99999;max-width:calc(100vw - 32px);' +
      'display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:10px 14px;border-radius:10px;' +
      'background:#5865f2;color:#fff;font:14px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.35)';
    const text = document.createElement('span');
    text.textContent = '🔗 Vinculá tu cuenta de Discord: tus mensajes salen verificados en Discord y recuperás tu historial.';
    const go = document.createElement('a');
    go.href = '/puente/vincular';
    go.textContent = 'Vincular';
    go.style.cssText = 'background:#fff;color:#3b44c4;font-weight:700;padding:6px 12px;border-radius:6px;text-decoration:none';
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = 'Ahora no';
    close.style.cssText = 'background:transparent;color:#fff;border:1px solid rgba(255,255,255,.6);padding:5px 10px;border-radius:6px;cursor:pointer;font:inherit';
    close.addEventListener('click', () => {
      storage(() => localStorage.setItem(HIDE_KEY, String(Date.now() + HIDE_MS)));
      bar.remove();
    });
    bar.append(text, go, close);
    document.body.appendChild(bar);
  }

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
  const themeOn = () => !!document.querySelector('link[href*="discord-plus.theme.css"]');

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

// Titulo de la pestana: Haven pone "Haven: <servidor>" (o "(3) Haven: <servidor>"
// con mensajes sin leer). Se cambia por el titulo elegido (PUENTE_TITULO en .env),
// manteniendo el contador. Si no hay titulo configurado, no se toca nada.
(function () {
  'use strict';
  const TITLE = '__PUENTE_TITULO__';
  if (!TITLE || TITLE.indexOf('__PUENTE') === 0) return;
  const desc = Object.getOwnPropertyDescriptor(Document.prototype, 'title');
  if (!desc || !desc.set) return;
  const fix = (v) => {
    const m = /^(\(\d+\)\s*)?Haven(?::.*)?$/.exec(String(v));
    return m ? (m[1] || '') + TITLE : v;
  };
  try {
    Object.defineProperty(document, 'title', {
      configurable: true,
      get() { return desc.get.call(document); },
      set(v) { desc.set.call(document, fix(v)); },
    });
  } catch { return; }
  document.title = desc.get.call(document);
})();

// Al entrar, abrir un canal en vez de la pantalla "Bienvenido a Haven": el
// ultimo que abriste en este navegador o, la primera vez, el canal de inicio
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

  let tries = 0;
  (function wait() {
    const app = window.app;
    if (!app || typeof app.switchChannel !== 'function' || !Array.isArray(app.channels) || !app.channels.length) {
      if (++tries < 120) setTimeout(wait, 500);
      return;
    }
    // Recordar cada canal que se abre
    const orig = app.switchChannel;
    app.switchChannel = function (code, ...rest) {
      if (code) store(s => s.setItem(KEY, String(code)));
      return orig.call(this, code, ...rest);
    };
    if (app.currentChannel) store(s => s.setItem(KEY, String(app.currentChannel)));
    if (opened || app.currentChannel) return;
    opened = true;
    const has = (code) => app.channels.some(c => c && c.code === code);
    const last = store(s => s.getItem(KEY));
    let target = last && has(last) ? last : null;
    if (!target && START && START.indexOf('__PUENTE') !== 0) {
      for (const name of START.split(',')) {
        const ch = app.channels.find(c => c && !c.is_dm && norm(c.name) === norm(name));
        if (ch) { target = ch.code; break; }
      }
    }
    if (target) app.switchChannel(target);
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
    fetch('/puente/api/reacciones-frecuentes', { headers: { Authorization: 'Bearer ' + token } })
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

  function toSheet(app, msgEl) {
    const menu = document.getElementById('message-context-menu');
    if (!menu || menu.classList.contains('puente-sheet')) return;
    const msgId = parseInt(msgEl.dataset.msgId, 10);
    menu.classList.add('puente-sheet');
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
    }

    menu.appendChild(el('div', 'puente-sheet-handle'));

    // Fila de reacciones rapidas; la ultima abre el selector completo de Haven
    const row = el('div', 'puente-sheet-reactions');
    for (const q of quick || []) {
      const b = el('button', 'puente-sheet-react');
      b.type = 'button';
      b.title = q.emoji;
      if (q.url) { const img = el('img'); img.src = q.url; img.alt = q.emoji; b.appendChild(img); }
      else b.textContent = q.emoji;
      b.addEventListener('click', (ev) => { ev.stopPropagation(); toggleReaction(app, msgEl, msgId, q.emoji); hide(app); });
      row.appendChild(b);
    }
    if (reactBtn) {
      const more = el('button', 'puente-sheet-react puente-sheet-react-more', '☺');
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

    // Deslizar hacia abajo para cerrar
    let y0 = null, dy = 0;
    menu.addEventListener('touchstart', (e) => {
      y0 = menu.scrollTop <= 0 ? e.touches[0].clientY : null;
      dy = 0;
      menu.style.transition = 'none';
    }, { passive: true });
    menu.addEventListener('touchmove', (e) => {
      if (y0 === null) return;
      dy = Math.max(0, e.touches[0].clientY - y0);
      if (dy > 0) menu.style.transform = 'translateY(' + dy + 'px)';
    }, { passive: true });
    menu.addEventListener('touchend', () => {
      menu.style.transition = '';
      if (dy > 90) hide(app); else menu.style.transform = '';
      y0 = null;
    }, { passive: true });
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
        return hideOrig.apply(this, a);
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
