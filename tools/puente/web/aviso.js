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

    // Deslizar la manija hacia abajo para cerrar
    let y0 = null, dy = 0;
    sheet.addEventListener('touchstart', (e) => {
      const onTop = e.target === sheet || e.target.classList.contains('puente-sheet-handle');
      y0 = onTop ? e.touches[0].clientY : null; dy = 0; sheet.style.transition = 'none';
    }, { passive: true });
    sheet.addEventListener('touchmove', (e) => {
      if (y0 === null) return;
      dy = Math.max(0, e.touches[0].clientY - y0);
      sheet.style.transform = 'translateY(' + dy + 'px)';
    }, { passive: true });
    sheet.addEventListener('touchend', () => {
      sheet.style.transition = '';
      if (y0 !== null && dy > 90) close(); else sheet.style.transform = '';
      y0 = null;
    }, { passive: true });

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
  // arriba mientras no este a pantalla completa, y hacia abajo si esta arriba de todo.
  function dragResize(app, p, el, fromList) {
    let y0 = null, h0 = height, active = false;
    el.addEventListener('touchstart', (e) => { y0 = e.touches[0].clientY; h0 = height; active = !fromList; if (!fromList) p.style.transition = 'none'; }, { passive: true });
    el.addEventListener('touchmove', (e) => {
      if (y0 === null) return;
      const dy = y0 - e.touches[0].clientY; // > 0 hacia arriba
      if (fromList && !active) {
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
    setHeight(p, height);
    if (!p.querySelector(':scope > .puente-sheet-handle')) {
      const h = document.createElement('div');
      h.className = 'puente-sheet-handle puente-emoji-handle';
      p.insertBefore(h, p.firstChild);
      dragResize(app, p, h, false);
      const grid = p.querySelector('.emoji-grid, .sticker-grid');
      if (grid) dragResize(app, p, grid, true);
    }
    addFrequent(app, p);
    if (!document.getElementById('puente-emoji-backdrop')) {
      const back = document.createElement('div');
      back.id = 'puente-emoji-backdrop';
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
    p.addEventListener('click', (e) => {
      if (!(e.target instanceof Element) || !e.target.closest('.emoji-item')) return;
      setTimeout(() => { if (isOpen(p) && p.classList.contains('puente-emoji-sheet')) hideKeyboard(p); }, 0);
    });
    // Haven lo cierra solo (tocar afuera, enviar, cambiar de canal): sacar el fondo oscuro
    new MutationObserver(() => {
      const el = picker();
      if (!isOpen(el)) { closeBackdrop(); height = DEFAULT_VH; }
      else if (!el.querySelector(':scope > .puente-sheet-handle')) { try { decorate(app); } catch { /* se reintenta en el proximo cambio */ } }
    }).observe(p, { attributes: true, attributeFilter: ['style'], childList: true });
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

    // Deslizar hacia abajo para cerrar
    let y0 = null, dy = 0;
    sheet.addEventListener('touchstart', (e) => { y0 = list.scrollTop <= 0 ? e.touches[0].clientY : null; dy = 0; sheet.style.transition = 'none'; }, { passive: true });
    sheet.addEventListener('touchmove', (e) => { if (y0 === null) return; dy = Math.max(0, e.touches[0].clientY - y0); sheet.style.transform = 'translateY(' + dy + 'px)'; }, { passive: true });
    sheet.addEventListener('touchend', () => { sheet.style.transition = ''; if (dy > 90) close(); else sheet.style.transform = ''; y0 = null; }, { passive: true });
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
      input.placeholder = MSG;
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

    const showDms = (on) => {
      sb.classList.toggle('puente-ver-dms', on);
      dm.classList.toggle('active', on);
      srv.classList.toggle('active', !on);
      const list = document.getElementById('dm-list');
      if (on && list && list.style.display === 'none') document.getElementById('dm-toggle-header')?.click();
    };
    dm.addEventListener('click', () => showDms(true));
    srv.addEventListener('click', () => showDms(false));

    // Mensajes directos sin leer: el numero tambien en el boton de la columna
    const src = document.getElementById('dm-unread-badge');
    const sync = () => {
      const n = src && src.style.display !== 'none' ? src.textContent.trim() : '';
      dmBadge.textContent = n;
      dmBadge.style.display = n && n !== '0' ? '' : 'none';
    };
    if (src) new MutationObserver(sync).observe(src, { attributes: true, childList: true, characterData: true, subtree: true });
    sync();

    // Ajustes: el engranaje pasa a la tarjeta del usuario, como en Discord
    const gear = document.getElementById('mobile-settings-btn');
    const account = document.querySelector('[data-haven-region="account"]');
    if (gear && account) { gear.classList.add('puente-account-gear'); account.appendChild(gear); }
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
    // Deslizar hacia abajo para cerrar
    let y0 = null, dy = 0;
    p.addEventListener('touchstart', (e) => { y0 = p.scrollTop <= 0 ? e.touches[0].clientY : null; dy = 0; p.style.transition = 'none'; }, { passive: true });
    p.addEventListener('touchmove', (e) => { if (y0 === null) return; dy = Math.max(0, e.touches[0].clientY - y0); p.style.transform = 'translateY(' + dy + 'px)'; }, { passive: true });
    p.addEventListener('touchend', () => { p.style.transition = ''; if (dy > 90) app._closeProfilePopup(); else p.style.transform = ''; y0 = null; }, { passive: true });
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
