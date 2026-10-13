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

  function scan(root) {
    if (!root || !root.querySelectorAll) return;
    root.querySelectorAll('.reply-preview, .reply-bar-text').forEach(cleanReply);
    if (!themeOn()) return;
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
