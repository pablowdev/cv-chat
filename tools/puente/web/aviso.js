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
//   adentro (por defecto la hoja); opts.canStart(e): donde puede empezar.
function sheetDrag(sheet, opts) {
  'use strict';
  const scroller = opts.scroller || sheet;
  const canStart = opts.canStart || (() => scroller.scrollTop <= 0);
  const max = () => window.innerHeight * 0.95;
  let y0 = null, dy = 0, h0 = 0, base = 0, active = false;
  sheet.addEventListener('touchstart', (e) => {
    y0 = null;
    if (e.touches.length !== 1 || !canStart(e)) return;
    y0 = e.touches[0].clientY; dy = 0; active = false;
    h0 = sheet.getBoundingClientRect().height;
    if (!sheet.__puenteBase) sheet.__puenteBase = h0; // el alto con el que se abrio
    base = sheet.__puenteBase;
    sheet.style.transition = 'none';
  }, { passive: true });
  sheet.addEventListener('touchmove', (e) => {
    if (y0 === null) return;
    dy = e.touches[0].clientY - y0;
    if (!active && Math.abs(dy) < 6) return;
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
    if (active && base - (h0 - dy) > 90) opts.close();
    else sheet.style.transform = '';
    y0 = null; active = false;
  };
  sheet.addEventListener('touchend', end, { passive: true });
  sheet.addEventListener('touchcancel', end, { passive: true });
}

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

    // Manija: hacia arriba se agranda, hacia abajo se cierra
    sheetDrag(menu, { close: () => hide(app) });
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

    // Manija: hacia arriba se agranda, hacia abajo se cierra
    sheetDrag(sheet, { close, canStart: (e) => e.target === sheet || e.target.classList.contains('puente-sheet-handle') });

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
    app._createMessageEl = function (msg, ...rest) {
      const el = create.call(this, msg, ...rest);
      try {
        if (!el || el.nodeType !== 1) return el;
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
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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
      out += '<img class="puente-ed-emoji" src="' + esc(em.url) + '" alt="' + esc(m) + '" data-t="' + esc(m) + '" draggable="false">';
      last = at + m.length;
      return m;
    });
    return out + esc(t.slice(last));
  }
  function known() {
    const users = new Set(), chans = new Set();
    try { for (const m of (app.channelMembers || [])) if (m && m.username) users.add(String(m.username).toLowerCase()); } catch { /* sin lista */ }
    try { for (const c of (app.channels || [])) if (c && !c.is_dm && c.name) chans.add(String(c.name).toLowerCase()); } catch { /* sin lista */ }
    return { users, chans };
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
  const tpl = document.createElement('template');
  const normalize = (html) => { tpl.innerHTML = html; return tpl.innerHTML; };
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
          if (!c.dataset.fin) out += '\n';
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
          if (c.dataset.fin) continue;
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
  const needsRender = () => ed.innerHTML !== normalize(markup(serialize()));

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
      if (changed) ta.dispatchEvent(new Event('input', { bubbles: true }));
    } finally { busy = false; }
    // Haven puede haber cambiado el texto al reaccionar (raro): manda el de Haven
    if (getVal() !== text) { toEditor(); return; }
    if (!composing && needsRender()) render(text, s, e);
    ed.classList.toggle('puente-ed-vacio', text === '');
    check(text);
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

  function syncSelToTa() {
    if (!alive || pending || document.activeElement !== ed) return;
    const { s, e } = getSel();
    try { ta.setSelectionRange(s, e); } catch { /* nada */ }
  }

  // ── Teclas: primero las ve Haven ───────────────────────
  function forwardKey(e) {
    syncSelToTa();
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
    syncSelToTa();
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
    ed.style.maxHeight = (window.innerWidth <= 480 ? 90 : 120) + 'px';
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
