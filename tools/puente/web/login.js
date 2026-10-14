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
