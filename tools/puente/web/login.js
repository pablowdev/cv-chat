// Enlace "¿Olvidaste tu contraseña? Recuperala con Discord" en la pantalla de
// inicio de sesion de Haven (la pagina "/").
(function () {
  'use strict';
  if (document.getElementById('puente-recuperar')) return;
  // Con el aspecto nuevo (login.css): un enlace mas dentro de la tarjeta, junto a los de Haven
  const links = document.querySelector('#login-form .auth-recovery-links');
  if (links && document.querySelector('link[href="/puente/login.css"]')) {
    const a = document.createElement('a');
    a.id = 'puente-recuperar';
    a.className = 'puente-login-discord';
    a.href = '/puente/vincular';
    a.textContent = 'Recuperar la contraseña con Discord';
    links.insertBefore(a, links.firstChild);
    return;
  }
  const box = document.createElement('div');
  box.id = 'puente-recuperar';
  box.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:16px;z-index:99999;max-width:calc(100vw - 32px);' +
    'padding:8px 14px;border-radius:10px;background:rgba(88,101,242,.95);color:#fff;text-align:center;' +
    'font:14px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.35)';
  const text = document.createTextNode('¿Olvidaste tu contraseña? ');
  const link = document.createElement('a');
  link.href = '/puente/vincular';
  link.textContent = 'Recuperala con Discord';
  link.style.cssText = 'color:#fff;font-weight:700;text-decoration:underline';
  box.append(text, link);
  document.body.appendChild(box);
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

// Email de recuperacion (email.js del puente, con la marca puente-email en la
// pagina): campo obligatorio al registrarse, y "¿Olvidaste tu contraseña?" lleva
// a pedir un enlace por mail. El de Haven queda como "Usar una clave de recuperación".
(function () {
  'use strict';
  if (!document.querySelector('meta[name="puente-email"]')) return;
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text) n.textContent = text; return n; };
  const form = document.getElementById('register-form');
  const pass = document.getElementById('reg-password');
  const passGroup = pass && pass.closest('.form-group');
  if (form && passGroup && !document.getElementById('puente-reg-email')) {
    const group = el('div', 'form-group');
    const label = el('label', '', 'Email');
    label.htmlFor = 'puente-reg-email';
    const input = el('input');
    input.type = 'email'; input.id = 'puente-reg-email'; input.autocomplete = 'email'; input.maxLength = 200; input.required = true;
    group.append(label, input, el('small', '', 'Sirve para recuperar tu contraseña si la olvidás. No se muestra a nadie.'));
    form.insertBefore(group, passGroup);
  }
  // Haven arma el pedido de registro con sus campos: se le suma el email
  const origFetch = window.fetch;
  window.fetch = function (input, init) {
    try {
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      if (/\/api\/auth\/register(\?|$)/.test(url) && init && typeof init.body === 'string') {
        const box = document.getElementById('puente-reg-email');
        const body = JSON.parse(init.body);
        if (box && body && typeof body === 'object' && !body.email) init = Object.assign({}, init, { body: JSON.stringify(Object.assign(body, { email: box.value.trim() })) });
      }
    } catch { /* el pedido sale como estaba */ }
    return origFetch.call(this, input, init);
  };
  const links = document.querySelector('#login-form .auth-recovery-links');
  if (links && !document.getElementById('puente-olvide')) {
    const a = el('a', 'puente-login-discord', '¿Olvidaste tu contraseña?');
    a.id = 'puente-olvide'; a.href = '/puente/olvide';
    links.insertBefore(a, links.firstChild);
    const discord = document.getElementById('puente-recuperar');
    if (discord) discord.className = '';
    const codes = document.getElementById('forgot-password-show');
    if (codes) { codes.removeAttribute('data-i18n'); codes.textContent = 'Usar una clave de recuperación'; }
  }
})();

// El aviso de los terminos sale en ingles (a la traduccion de Haven le falta):
// en castellano, sin tocar el enlace (Haven le engancha la ventana de los terminos)
(function () {
  'use strict';
  const note = document.querySelector('.auth-consent-note');
  if (!note) return;
  const fix = () => {
    const link = note.querySelector('#login-tos-link');
    if (!link || !/By clicking/.test(note.textContent)) return;
    link.textContent = 'términos actuales';
    note.textContent = '';
    note.append('Al iniciar sesión aceptás los ', link, ', que pueden ser distintos de los que regían cuando te registraste.');
  };
  fix();
  new MutationObserver(fix).observe(note, { childList: true, characterData: true, subtree: true });
})();

// "Entrar con Discord": un boton arriba del formulario de inicio y del de crear
// cuenta. Con la cuenta vinculada se entra con un clic; si no hay cuenta, se
// crea en un paso (vincular.js, pagina /puente/entrar).
(function () {
  'use strict';
  const ICON = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M20.32 4.37a19.8 19.8 0 0 0-4.89-1.52.07.07 0 0 0-.08.04c-.21.38-.44.87-.61 1.25a18.27 18.27 0 0 0-5.49 0 12.64 12.64 0 0 0-.62-1.25.08.08 0 0 0-.08-.04 19.74 19.74 0 0 0-4.89 1.52.07.07 0 0 0-.03.03C.53 9.05-.32 13.58.1 18.06a.08.08 0 0 0 .03.06 19.9 19.9 0 0 0 5.99 3.03.08.08 0 0 0 .08-.03c.46-.63.87-1.3 1.23-1.99a.08.08 0 0 0-.04-.11 13.1 13.1 0 0 1-1.87-.89.08.08 0 0 1-.01-.13c.13-.09.25-.19.37-.29a.07.07 0 0 1 .08-.01c3.93 1.79 8.18 1.79 12.06 0a.07.07 0 0 1 .08.01c.12.1.24.2.37.29a.08.08 0 0 1-.01.13c-.6.35-1.22.65-1.87.89a.08.08 0 0 0-.04.11c.36.7.78 1.36 1.22 1.99a.08.08 0 0 0 .08.03 19.84 19.84 0 0 0 6-3.03.08.08 0 0 0 .03-.06c.5-5.18-.84-9.67-3.55-13.66a.06.06 0 0 0-.03-.03ZM8.02 15.33c-1.18 0-2.16-1.08-2.16-2.42 0-1.33.96-2.42 2.16-2.42 1.21 0 2.18 1.1 2.16 2.42 0 1.34-.96 2.42-2.16 2.42Zm7.97 0c-1.18 0-2.15-1.08-2.15-2.42 0-1.33.95-2.42 2.15-2.42 1.21 0 2.18 1.1 2.16 2.42 0 1.34-.95 2.42-2.16 2.42Z"/></svg>';
  // Entrar con el foro (foro.js): el mismo camino, por el foro
  const FORO = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M4 3h11a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H9l-4 3.5V14H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm15 5h1a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-1v3l-3.5-3H11a2 2 0 0 1-2-2v-1h6a4 4 0 0 0 4-4V8Z"/></svg>';
  function go(btn, foro) {
    btn.disabled = true;
    fetch(foro ? '/puente/api/foro/iniciar' : '/puente/api/entrar/iniciar', foro
      ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ para: 'entrar' }) }
      : { method: 'POST' }).then(r => r.json().then(d => ({ ok: r.ok, d }))).then(({ ok, d }) => {
      if (ok && d.url) { location.href = d.url; return; }
      btn.disabled = false;
      alert(d.error || 'No se pudo. Probá de nuevo.');
    }).catch(() => { btn.disabled = false; alert('No hay conexión. Probá de nuevo.'); });
  }
  function button(cls, icon, label, foro) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-primary ' + cls;
    btn.innerHTML = icon + '<span></span>';
    btn.querySelector('span').textContent = label;
    btn.addEventListener('click', () => go(btn, foro));
    return btn;
  }
  function add(form, label, labelForo) {
    if (!form || form.querySelector('.puente-btn-discord')) return;
    const btn = button('puente-btn-discord', ICON, label, false);
    const or = document.createElement('div');
    or.className = 'puente-o';
    or.textContent = 'o';
    form.insertBefore(or, form.firstChild);
    form.insertBefore(btn, or);
    form.insertBefore(button('puente-btn-foro', FORO, labelForo, true), or);
  }
  add(document.getElementById('login-form'), 'Entrar con Discord', 'Entrar con el foro');
  add(document.getElementById('register-form'), 'Crear cuenta con Discord', 'Crear cuenta con el foro');
  // /?terminos=1 (desde "Crear tu cuenta" con Discord): abrir las condiciones de Haven
  if (new URLSearchParams(location.search).get('terminos') === '1') {
    const open = () => { const m = document.getElementById('eula-modal'); if (m) m.style.display = 'flex'; };
    if (document.readyState === 'complete') open(); else window.addEventListener('load', open);
  }
})();

// Invitaciones (invitaciones.js): quien entra por el enlace de alguien
// (/?invita=<usuario>) ve "<nombre> te invitó" arriba, y se recuerda en el
// navegador hasta que se crea la cuenta (aviso.js lo anota al entrar).
(function () {
  'use strict';
  const u = new URLSearchParams(location.search).get('invita');
  let saved = null;
  try {
    if (u && /^[\w.-]{1,40}$/.test(u)) localStorage.setItem('puente_invita', JSON.stringify({ u, at: Date.now() }));
    saved = JSON.parse(localStorage.getItem('puente_invita') || 'null');
  } catch { /* sin almacenamiento: no se anota */ }
  if (!saved || Date.now() - saved.at > 7 * 24 * 3600 * 1000) return;
  fetch('/puente/api/invitacion/quien?u=' + encodeURIComponent(saved.u)).then(r => (r.ok ? r.json() : null)).then(d => {
    if (!d) return;
    // La tarjeta que se ve (la pagina tiene otras escondidas)
    const card = [...document.querySelectorAll('.auth-card')].find(c => c.offsetParent !== null) || document.querySelector('.auth-card');
    if (!card || document.getElementById('puente-invito')) return;
    const form = card.querySelector('.auth-tabs, form');
    const box = document.createElement('div');
    box.id = 'puente-invito';
    box.className = 'puente-invito';
    if (d.avatar) { const img = document.createElement('img'); img.src = d.avatar; img.alt = ''; box.appendChild(img); }
    const t = document.createElement('div');
    const b = document.createElement('b'); b.textContent = d.nombre;
    t.append(b, document.createTextNode(' te invitó a __PUENTE_APP__'));
    box.appendChild(t);
    if (form) form.parentElement.insertBefore(box, form); else card.insertBefore(box, card.firstChild);
  }).catch(() => {});
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


// Cuenta unica (cuenta.js): con ?volver= (la web o el foro mandan aca para entrar)
// se vuelve ahi despues de entrar (aviso.js); si ya hay sesion en la web o el foro,
// entra solo; y al salir del chat sale tambien de la web y del foro.
(function () {
  'use strict';
  const ss = {
    get: k => { try { return sessionStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { sessionStorage.setItem(k, v); } catch { /* */ } },
    del: k => { try { sessionStorage.removeItem(k); } catch { /* */ } },
  };
  const q = new URLSearchParams(location.search);
  // Solo las paginas propias: el chat, la web (con y sin www) y el foro
  const dom = location.hostname.split('.').slice(1).join('.');
  const propia = (url) => {
    try { const u = new URL(url); return u.protocol === 'https:' && [location.hostname, dom, 'www.' + dom, 'foro.' + dom].includes(u.hostname); } catch { return false; }
  };
  const volver = q.get('volver');
  if (volver && propia(volver)) ss.set('puente_volver', volver);
  if (q.has('volver') || q.has('registro')) history.replaceState(null, '', location.pathname);
  if (ss.get('puente_salio')) {
    ss.del('puente_salio'); ss.del('puente_volver');
    location.replace('/puente/cuenta/salir?volver=' + encodeURIComponent(location.origin + '/'));
    return;
  }
  if (q.get('registro') === '1') {
    const tab = () => { const b = document.querySelector('.auth-tab[data-tab="register"]'); if (b) b.click(); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(tab, 50)); else setTimeout(tab, 50);
  }
  let tok = null;
  try { tok = localStorage.getItem('haven_token'); } catch { return; }
  if (tok) return; // Haven ya pasa a /app
  fetch('/puente/api/cuenta/token', { method: 'POST' }).then(r => (r.ok ? r.json() : null)).then(d => {
    if (!d || !d.token) return;
    localStorage.setItem('haven_token', d.token);
    localStorage.setItem('haven_user', JSON.stringify(d.user));
    location.replace('/app');
  }).catch(() => {});
})();
