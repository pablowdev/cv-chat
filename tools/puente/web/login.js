// El codigo por email al entrar desde un dispositivo nuevo (codigo.js, dospasos.js)
(function () { if (window.__puenteCodigo) return; const c = document.createElement('script'); c.src = '/puente/codigo.js'; document.head.appendChild(c); })();
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

// La entrada de invitado: los errores de Haven llegan en ingles ("That username is currently in use"), aca en
// castellano. Y el nombre con el que entro queda recordado en este navegador (la proxima vez ya esta escrito, login.js)
(function () {
  'use strict';
  const ES = [
    [/currently in use/i, 'Ese nombre lo está usando otro invitado. Elegí otro (o tocá el 🎲).'],
    [/taken by a registered member/i, 'Ese nombre es de alguien del club. Elegí otro (o tocá el 🎲).'],
    [/reserved|banned/i, 'Ese nombre no se puede usar. Elegí otro (o tocá el 🎲).'],
    [/3-20 characters/i, 'El nombre tiene que tener entre 3 y 20 caracteres.'],
    [/letters, numbers, underscores/i, 'El nombre solo puede tener letras, números y _ (sin espacios ni tildes).'],
    [/username required/i, 'Poné un nombre para jugar.'],
    [/18 years/i, 'Marcá la casilla para entrar.'],
    [/Terms of Service/i, 'Marcá la casilla para entrar.'],
    [/disabled/i, 'Ahora no se puede entrar como invitado.'],
    [/too many/i, 'Hubo demasiados intentos. Esperá un rato y probá de nuevo.'],
  ];
  const orig = window.fetch;
  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    if (!/\/api\/auth\/guest-login(\?|$)/.test(url)) return orig.call(this, input, init);
    let nombre = '';
    try { nombre = String(JSON.parse((init && init.body) || '{}').username || ''); } catch { nombre = ''; }
    return orig.call(this, input, init).then(async (r) => {
      if (r.ok) { try { if (/^[A-Za-z0-9_]{3,20}$/.test(nombre)) localStorage.setItem('puente_inv_nombre', nombre); } catch { /* sin almacenamiento */ } return r; }
      let d = null;
      try { d = await r.clone().json(); } catch { return r; }
      const es = d && typeof d.error === 'string' && ES.find(([re]) => re.test(d.error));
      if (!es) return r;
      return new Response(JSON.stringify(Object.assign({}, d, { error: es[1] })), { status: r.status, statusText: r.statusText, headers: { 'Content-Type': 'application/json' } });
    });
  };
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

// "Entrar con un código por mail" (clave.js): sin contraseña, con un codigo que llega al email
// confirmado de la cuenta. El paso del codigo es el de codigo.js (la ruta esta en su RUTAS); con el
// codigo bien, la sesion se guarda como en entrar.js
(function () {
  'use strict';
  const form = document.getElementById('login-form');
  const foro = form && form.querySelector('.puente-btn-foro');
  if (!form || !foro || document.getElementById('puente-btn-mail')) return;
  const MAIL = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm0 4.24V18h16V8.24l-8 5-8-5ZM5.1 6 12 10.32 18.9 6H5.1Z"/></svg>';
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const btn = el('button', 'btn-primary puente-btn-foro puente-btn-mail');
  btn.type = 'button'; btn.id = 'puente-btn-mail';
  btn.innerHTML = MAIL + '<span></span>';
  btn.querySelector('span').textContent = 'Entrar con un código por mail';
  const box = el('div', 'puente-mail-box'); box.hidden = true;
  const group = el('div', 'form-group');
  const label = el('label', null, 'Tu usuario o tu mail'); label.htmlFor = 'puente-mail-usuario';
  const input = el('input');
  input.type = 'text'; input.id = 'puente-mail-usuario'; input.autocomplete = 'username'; input.maxLength = 200;
  input.setAttribute('autocapitalize', 'off'); input.spellcheck = false;
  group.append(label, input);
  const error = el('div', 'puente-mail-error'); error.setAttribute('role', 'alert');
  const ir = el('button', 'btn-primary puente-mail-ir', 'Mandarme el código'); ir.type = 'button';
  box.append(group, error, ir);
  foro.insertAdjacentElement('afterend', btn);
  btn.insertAdjacentElement('afterend', box);
  btn.addEventListener('click', () => {
    box.hidden = !box.hidden;
    if (box.hidden) return;
    const u = document.getElementById('login-username');
    if (u && u.value && !input.value) input.value = u.value;
    input.focus();
  });
  function enter(d) {
    try {
      localStorage.setItem('haven_token', d.token);
      localStorage.setItem('haven_user', JSON.stringify(d.user));
    } catch {
      error.textContent = 'Tu navegador no deja guardar la sesión (¿modo privado?).';
      return false;
    }
    location.replace('/app');
    return true;
  }
  async function pedir() {
    const usuario = input.value.trim();
    if (!usuario) { error.textContent = 'Escribí tu usuario o tu mail.'; input.focus(); return; }
    ir.disabled = true; error.textContent = '';
    try {
      // codigo.js ataja la respuesta, pide el codigo y devuelve la sesion
      const r = await fetch('/puente/api/entrar/codigo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ usuario }) });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d && d.token && d.user) { if (enter(d)) return; }
      else if (r.ok && d && d.puenteCodigo) error.textContent = 'Recargá la página y probá de nuevo.';
      else error.textContent = (d && d.error) || 'No se pudo. Probá de nuevo.';
    } catch { error.textContent = 'No hay conexión. Probá de nuevo.'; }
    ir.disabled = false;
  }
  ir.addEventListener('click', pedir);
  // Enter en el campo: el codigo, no el inicio de sesion de Haven
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); pedir(); } });
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


// Para los que todavia no tienen cuenta, en la pantalla de entrar: "Jugar como invitado" y "Ver el
// Marketplace". Jugar como invitado es la entrada de invitado de Haven (una cuenta temporal, que no ve ningun
// canal y se borra al irse; en el login de siempre queda escondida, login.css): se elige un nombre y se va a
// los juegos. Quien abre un enlace de juegos sin sesion llega aca con ?jugar=truco|juegos (afuera.js) y ya
// entra a esa parte; despues vuelve a donde iba (?volver=, como la cuenta unica). Va antes de esa parte,
// que borra la direccion.
(function () {
  'use strict';
  const ss = {
    get: k => { try { return sessionStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { sessionStorage.setItem(k, v); } catch { /* */ } },
    del: k => { try { sessionStorage.removeItem(k); } catch { /* */ } },
  };
  const pedido = new URLSearchParams(location.search).get('jugar');
  if (pedido === 'truco' || pedido === 'juegos') ss.set('puente_jugar', pedido);
  const web = 'https://' + location.hostname.replace(/^chat\./, '');
  const mercado = 'https://marketplace.' + location.hostname.replace(/^chat\./, '') + '/'; // (su propio dominio)
  const mk = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };

  // El modo invitado: el formulario de Haven con nuestro texto arriba (cual, el juego elegido)
  function jugar(tipo, cual) {
    ss.set('puente_jugar', tipo);
    document.documentElement.classList.add('puente-jugar');
    let tries = 0;
    (function poner() {
      const form = document.getElementById('guest-form');
      const sec = document.getElementById('guest-login-section');
      // (Haven muestra la entrada de invitado cuando el servidor dice que se puede)
      if (!form || !sec || sec.style.display === 'none') { if (++tries < 40) setTimeout(poner, 150); return; }
      const mostrar = document.getElementById('guest-login-show-btn');
      if (form.style.display === 'none' && mostrar) mostrar.click();
      let p = document.getElementById('puente-jugar-aviso');
      if (!p) { p = mk('div', 'puente-jugar-aviso'); p.id = 'puente-jugar-aviso'; form.insertBefore(p, form.firstChild); }
      p.textContent = '';
      p.append(mk('b', '', cual ? '🎮 ' + cual + ': elegí tu nombre' : tipo === 'truco' ? '🃏 Jugá al truco como invitado' : '🎮 Jugá como invitado'),
        mk('span', '', (tipo === 'truco' || cual ? '' : listaJuegos() + ': contra la compu, contra la gente del club o de a varios en el mismo dispositivo. ')
          + 'Elegí un nombre para jugar (letras, números o _). Es temporal: cuando te vas, se borra. Si te gusta, después te quedás con él y creás tu cuenta gratis.'));
      const u = document.getElementById('guest-username');
      if (u) {
        u.placeholder = 'Tu nombre para jugar';
        // el que usó la vez pasada en este navegador, ya escrito
        if (!u.value) { try { const antes = localStorage.getItem('puente_inv_nombre'); if (antes && /^[A-Za-z0-9_]{3,20}$/.test(antes)) u.value = antes; } catch { /* sin almacenamiento */ } }
        // el dado: inventa uno
        if (!document.getElementById('puente-inv-dado')) {
          const caja = mk('div', 'puente-inv-nombre');
          u.parentNode.insertBefore(caja, u);
          caja.appendChild(u);
          const d = mk('button', 'puente-inv-dado', '🎲'); d.type = 'button'; d.id = 'puente-inv-dado';
          d.title = 'Inventame un nombre'; d.setAttribute('aria-label', 'Inventame un nombre');
          d.addEventListener('click', () => { u.value = nombreAlAzar(); u.dispatchEvent(new Event('input', { bubbles: true })); u.focus(); });
          caja.appendChild(d);
        }
        u.focus();
      }
      // Los textos de Haven del formulario, puestos aca (sin esperar la traduccion: asi no se ven un instante en ingles)
      for (const [sel, txt] of [['label[for="guest-username"]', 'Tu nombre'], ['#guest-username ~ small, .puente-inv-nombre ~ small', '3 a 20 letras, números o _ (sin espacios ni tildes)'], ['button[type="submit"]', 'Entrar como invitado']]) {
        const x = form.querySelector(sel);
        if (x) { x.removeAttribute('data-i18n'); x.textContent = txt; }
      }
      // Una sola casilla, arriba del boton, en lugar de las dos de Haven de abajo (escondidas, login.css): las marca a
      // las dos. Sin marcarla, un solo aviso al lado (no los dos de Haven, uno despues del otro)
      if (!document.getElementById('puente-inv-acepto')) {
        const age = document.getElementById('age-checkbox'), eula = document.getElementById('eula-checkbox');
        const submit = form.querySelector('button[type="submit"]');
        if (age && eula && submit) {
          const ac = mk('label', 'puente-inv-acepto'); ac.id = 'puente-inv-acepto';
          const cb = mk('input'); cb.type = 'checkbox'; cb.checked = age.checked && eula.checked;
          const tx = mk('span', '', 'Tengo 18 años o más y acepto los ');
          const t = mk('a', '', 'Términos'); t.href = '#';
          t.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); const l = document.getElementById('eula-link'); if (l) l.click(); });
          tx.appendChild(t);
          ac.append(cb, tx);
          const err = mk('div', 'puente-inv-acepto-err', 'Marcá la casilla para entrar.'); err.hidden = true;
          cb.addEventListener('change', () => {
            for (const x of [age, eula]) if (x.checked !== cb.checked) { x.checked = cb.checked; x.dispatchEvent(new Event('change', { bubbles: true })); }
            if (cb.checked) err.hidden = true;
          });
          form.insertBefore(ac, submit);
          form.insertBefore(err, submit);
          document.addEventListener('submit', (e) => {
            if (e.target !== form || !document.documentElement.classList.contains('puente-jugar')) return;
            if (!cb.checked && age.checked && eula.checked) cb.checked = true; // (las marco la ventana de los terminos)
            if (cb.checked) { age.checked = eula.checked = true; return; }
            e.preventDefault(); e.stopImmediatePropagation();
            err.hidden = false;
            cb.focus();
          }, true);
        }
      }
      document.documentElement.classList.remove('puente-pre');
      // "Volver al inicio de sesion" sale del modo invitado; si vino de elegir un juego, de vuelta a los juegos
      const atras = document.getElementById('guest-back-btn');
      if (atras && !atras.dataset.puente) {
        atras.dataset.puente = '1';
        atras.addEventListener('click', (e) => {
          if (document.documentElement.classList.contains('puente-nombre')) { e.preventDefault(); e.stopImmediatePropagation(); aLosJuegos(); return; }
          ss.del('puente_jugar'); document.documentElement.classList.remove('puente-jugar');
        }, true);
      }
      if (atras && document.documentElement.classList.contains('puente-nombre')) { atras.removeAttribute('data-i18n'); atras.textContent = '← Elegir otro juego'; }
    })();
  }

  // Los juegos tienen su propia pagina (juegos.<dominio>, juegos.html): ahi se elige el juego o la mesa, y se
  // llega aca (por afuera.js) solo a poner el nombre: la tarjeta flotando, con la tapa del juego (html.puente-nombre)
  const PAGINA_JUEGOS = 'https://juegos.' + location.hostname.replace(/^chat\./, '') + '/';
  // los juegos que se juegan como invitado, por su id, su enlace o sus nombres viejos: su nombre y su tapa (de sus
  // fichas; lo pone vincular.js al servir este archivo)
  const FICHAS_AFUERA = /*__PUENTE_JUEGOS__*/null;
  const NOMBRES = {}, TAPAS = {};
  for (const [k, d] of Object.entries((FICHAS_AFUERA && FICHAS_AFUERA.invitados) || {})) { NOMBRES[k] = d.nombre; TAPAS[k] = d.tapa; }
  // "Truco, Pool, Ajedrez, ... y Capa 2": los que se juegan sin cuenta, de sus fichas
  function listaJuegos() {
    const n = [...new Set(Object.values(NOMBRES))];
    return n.length > 1 ? n.slice(0, -1).join(', ') + ' y ' + n[n.length - 1] : n[0] || 'Truco, Pool y más';
  }
  // Un nombre al azar para el dado: un bicho de aca y un numero (solo letras, numeros y _, como pide Haven)
  const BICHOS = ['Carpincho', 'Hornero', 'Yacare', 'Tero', 'Puma', 'Zorro', 'Quirquincho', 'Peludo', 'Guanaco', 'Condor', 'Mulita', 'Vizcacha', 'Lechuza',
    'Chaja', 'Tatu', 'Benteveo', 'Zorzal', 'Coati', 'Dorado', 'Surubi', 'Tucan', 'Picaflor', 'Huemul', 'Yaguarete', 'Aguara', 'Tapir', 'Pejerrey', 'Corzuela'];
  const nombreAlAzar = () => BICHOS[Math.floor(Math.random() * BICHOS.length)] + '_' + (10 + Math.floor(Math.random() * 990));
  function aLosJuegos() { ss.del('puente_jugar'); ss.del('puente_volver'); ss.del('puente_inv'); location.href = PAGINA_JUEGOS; }
  // Los juegos que son solo con cuenta (CV Hotel...): llegando a uno sin sesion, en vez del nombre de invitado, una
  // tarjeta que lo dice, con la tapa del juego, e invita a crear la cuenta (o a entrar con la suya); despues de entrar
  // sigue al juego (puente_volver, como la cuenta unica)
  const SOLO = {}, SOLO_TAPAS = {};
  for (const [k, d] of Object.entries((FICHAS_AFUERA && FICHAS_AFUERA.solo) || {})) { SOLO[k] = d.nombre; SOLO_TAPAS[k] = d.tapa; }
  function soloDe(url) {
    let u; try { u = new URL(url, location.origin); } catch { return null; }
    if (u.origin !== location.origin || u.pathname.replace(/\/$/, '') !== '/app') return null;
    const q = u.searchParams;
    const j = Object.keys(SOLO).find(k => q.has(k)) || q.get('juegos');
    return SOLO[j] ? j : null;
  }
  function soloUsuarios(volver) {
    const j = soloDe(volver);
    document.documentElement.classList.remove('puente-pre');
    if (!j || document.getElementById('puente-solo')) return;
    ss.set('puente_volver', volver);
    ss.del('puente_jugar');
    const velo = mk('div', 'puente-velo');
    const c = mk('div', 'puente-solo'); c.id = 'puente-solo';
    c.setAttribute('role', 'dialog'); c.setAttribute('aria-modal', 'true'); c.setAttribute('aria-labelledby', 'puente-solo-t');
    const i = mk('img', 'puente-jugar-tapa'); i.src = SOLO_TAPAS[j] || '/puente/tapas/' + j + '.jpg'; i.alt = ''; i.onerror = () => i.remove();
    const t = mk('h2', 'puente-solo-t', SOLO[j] + ' es solo para usuarios'); t.id = 'puente-solo-t';
    const s = mk('p', 'puente-solo-s', 'Para entrar necesitás tu cuenta de CV Chat. Es gratis, y con la misma entrás también al chat del club, al foro, al Marketplace y a todos los juegos.');
    const crear = mk('button', 'puente-solo-btn primario', 'Crear mi cuenta gratis'); crear.type = 'button';
    const entrar = mk('button', 'puente-solo-btn', 'Ya tengo cuenta'); entrar.type = 'button';
    const otro = mk('button', 'puente-solo-otro', '← Elegir otro juego'); otro.type = 'button';
    // (al formulario de siempre, en su pestaña: al entrar, puente_volver lo lleva al juego)
    const ir = (tab) => { velo.remove(); c.remove(); irAlFormulario(tab); };
    crear.addEventListener('click', () => ir('register'));
    entrar.addEventListener('click', () => ir('login'));
    otro.addEventListener('click', aLosJuegos);
    velo.addEventListener('click', aLosJuegos);
    c.append(i, t, s, crear, entrar, otro);
    document.body.append(velo, c);
    try { crear.focus({ preventScroll: true }); } catch { /* sin foco */ }
  }
  let portada = null;
  const datos = () => portada || (portada = fetch('/puente/api/portada').then(r => (r.ok ? r.json() : null)).catch(() => null));
  // El juego al que va (la sala de un juego o una mesa, solo en el chat), o nada
  function juegoDe(url) {
    let u; try { u = new URL(url, location.origin); } catch { return null; }
    if (u.origin !== location.origin || u.pathname.replace(/\/$/, '') !== '/app') return null;
    const q = u.searchParams;
    const j = Object.keys(NOMBRES).find(k => q.has(k)) || q.get('juegos');
    return NOMBRES[j] ? j : null;
  }
  function elegir(volver) {
    const j = juegoDe(volver);
    if (!j) return;
    ss.set('puente_volver', volver);
    const html = document.documentElement;
    html.classList.add('puente-nombre');
    if (!document.querySelector('.puente-velo')) {
      const v = mk('div', 'puente-velo');
      v.addEventListener('click', aLosJuegos);
      document.body.appendChild(v);
    }
    jugar(j === 'truco' ? 'truco' : 'juegos', NOMBRES[j]);
    let n = 0;
    (function tapa() {
      const p = document.getElementById('puente-jugar-aviso');
      if (!p) { if (++n < 40) setTimeout(tapa, 150); return; }
      if (p.querySelector('.puente-jugar-tapa')) return;
      const i = mk('img', 'puente-jugar-tapa'); i.src = TAPAS[j] || '/puente/tapas/' + j + '.jpg'; i.alt = ''; i.onerror = () => i.remove();
      p.insertBefore(i, p.firstChild);
    })();
  }

  // Los dos botones, abajo del saludo
  function botones() {
    if (document.getElementById('puente-visita')) return true;
    const sub = document.querySelector('.puente-login-sub');
    if (!sub) return false;
    const box = mk('div', 'puente-visita'); box.id = 'puente-visita';
    const j = mk('button', 'puente-visita-btn');
    j.type = 'button';
    j.append(mk('span', 'puente-visita-ico', '🎮'), mk('span', 'puente-visita-txt'));
    // (los juegos que se juegan sin cuenta, de sus fichas: los primeros cuatro y "y más")
    const nombres = [...new Set(Object.values(NOMBRES))];
    const lista = nombres.length > 4 ? nombres.slice(0, 4).join(', ') + ' y más' : nombres.length > 1 ? nombres.slice(0, -1).join(', ') + ' y ' + nombres[nombres.length - 1] : nombres[0] || 'Truco, Pool y más';
    j.lastChild.append(mk('b', '', 'Jugar como invitado'), mk('small', '', lista));
    j.addEventListener('click', aLosJuegos);
    const m = mk('a', 'puente-visita-btn');
    m.href = mercado;
    m.append(mk('span', 'puente-visita-ico', '🛍️'), mk('span', 'puente-visita-txt'));
    m.lastChild.append(mk('b', '', 'Ver el Marketplace'), mk('small', '', 'Lo que venden los del club, sin comisiones'));
    const f = mk('a', 'puente-visita-btn');
    f.href = 'https://foro.' + web.replace(/^https:\/\//, '') + '/';
    f.append(mk('span', 'puente-visita-ico', '💬'), mk('span', 'puente-visita-txt'));
    f.lastChild.append(mk('b', '', 'Leer el foro'), mk('small', '', 'Los temas del club, desde hace años'));
    // Y el chat: lleva al formulario de entrar (en el celular queda abajo de todo)
    const c = mk('button', 'puente-visita-btn');
    c.type = 'button';
    c.append(mk('span', 'puente-visita-ico', '🗨️'), mk('span', 'puente-visita-txt'));
    c.lastChild.append(mk('b', '', 'Entrar al chat'), mk('small', '', 'CV Chat, el chat del club'));
    c.addEventListener('click', () => {
      // si estaba eligiendo el nombre de invitado, de vuelta al formulario de entrar
      const atras = document.getElementById('guest-back-btn');
      if (document.documentElement.classList.contains('puente-jugar') && atras) atras.click();
      irAlFormulario();
    });
    box.append(j, m, f, c);
    const pitch = mk('p', 'puente-login-pitch', 'El club de amigos y rejunto de gordos: el chat, el foro, los juegos y el Marketplace, todo en un lugar.');
    sub.insertAdjacentElement('afterend', pitch);
    pitch.insertAdjacentElement('afterend', box);
    // El logo, el nombre y los accesos en su propia columna, fuera de la tarjeta del formulario: en la compu a la
    // izquierda, en el celular arriba (login.css, html.puente-dos). Solo en la pantalla de entrar de Haven
    const head = sub.closest('.auth-header'), card = document.querySelector('.auth-card'), cont = card && card.parentElement;
    if (head && card && cont && document.getElementById('login-form') && head.parentElement === card) {
      const lado = mk('div', 'puente-lado');
      cont.insertBefore(lado, card);
      lado.appendChild(head);
      document.documentElement.classList.add('puente-dos');
      // Y en la tarjeta, para que se entienda que ese formulario es para entrar al chat
      const t = mk('div', 'puente-card-cab');
      t.append(mk('h2', 'puente-card-t', 'Entrá a CV Chat'), mk('p', 'puente-card-s', 'El chat del club. Con la misma cuenta entrás al foro y a la web.'));
      card.insertBefore(t, card.firstChild);
    }
    return true;
  }
  // Lo que esta pasando en el club (portada.js): la actividad arriba, y abajo el chat, las mesas abiertas, el
  // Marketplace y el foro. Quien ya entro alguna vez en este navegador (cv_ya_entro, aviso.js) ve primero el
  // formulario en el celular; el que llega por primera vez, primero el club (login.css, html.puente-volvio)
  try { if (localStorage.getItem('cv_ya_entro')) document.documentElement.classList.add('puente-volvio'); } catch { /* sin almacenamiento */ }
  const irAlFormulario = (tab) => {
    const b = tab && document.querySelector('.auth-tab[data-tab="' + tab + '"]');
    if (b && !b.classList.contains('active')) b.click();
    const card = document.querySelector('.auth-card');
    if (card) setTimeout(() => card.scrollIntoView({ block: 'start' }), 50); // (despues de que se reacomoda)
  };
  function panel(titulo, extra) {
    const p = mk('section', 'puente-panel' + (extra ? ' ' + extra : ''));
    p.appendChild(mk('h2', 'puente-panel-t', titulo));
    return p;
  }
  function pasando(d) {
    const lado = document.querySelector('.puente-lado'), card = document.querySelector('.auth-card');
    if (!lado || !card || document.getElementById('puente-pasando')) return;
    // 1. La actividad, abajo de la presentacion
    const bits = [];
    if (d.conectados) bits.push(d.conectados + (d.conectados === 1 ? ' conectado ahora' : ' conectados ahora'));
    if (d.mensajesHoy) bits.push(d.mensajesHoy.toLocaleString('es-AR') + (d.mensajesHoy === 1 ? ' mensaje hoy' : ' mensajes hoy'));
    if (d.partidas) bits.push(d.partidas + (d.partidas === 1 ? ' partida en juego' : ' partidas en juego'));
    const pitch = lado.querySelector('.puente-login-pitch');
    if (bits.length && pitch) {
      const a = mk('p', 'puente-actividad');
      a.append(mk('span', 'puente-actividad-punto'), mk('span', '', bits.join(' · ')));
      pitch.insertAdjacentElement('afterend', a);
    }
    const sec = mk('div', 'puente-pasando'); sec.id = 'puente-pasando';
    sec.appendChild(mk('h2', 'puente-pasando-t', 'Lo que está pasando en el club'));
    const grid = mk('div', 'puente-pasando-grid');
    // 2. Un pedacito del chat
    if (d.chat && d.chat.mensajes && d.chat.mensajes.length) {
      const p = panel('Novedades del club', 'puente-panel-chat'); // (los anuncios de #círculo-vicioso, portada.js)
      const ul = mk('ul', 'puente-chat');
      for (const m of d.chat.mensajes) {
        const li = mk('li', 'puente-chat-msg');
        const av = mk('span', 'puente-chat-av');
        if (m.foto) { const i = mk('img'); i.src = m.foto; i.alt = ''; i.loading = 'lazy'; i.referrerPolicy = 'no-referrer'; i.onerror = () => { i.remove(); av.textContent = (m.autor || '?').charAt(0).toUpperCase(); }; av.appendChild(i); }
        else av.textContent = (m.autor || '?').charAt(0).toUpperCase();
        const cuerpo = mk('div', 'puente-chat-cuerpo');
        const cab = mk('div', 'puente-chat-cab'); cab.append(mk('b', '', m.autor), mk('span', '', m.hora || ''));
        cuerpo.appendChild(cab);
        if (m.texto) {
          // Los emojis del club (:cv1:) con su imagen, como en el chat
          const tx = mk('div', 'puente-chat-txt'), em = (m.emojis && typeof m.emojis === 'object') ? m.emojis : {};
          String(m.texto).split(/(:[A-Za-z0-9_]{1,40}:)/).forEach((parte) => {
            const n = /^:([A-Za-z0-9_]{1,40}):$/.exec(parte), u = n && em[n[1]];
            if (u && /^https?:\/\//.test(u)) { const i = mk('img', 'puente-chat-emoji'); i.src = u; i.alt = parte; i.title = parte; i.loading = 'lazy'; tx.appendChild(i); }
            else if (parte) tx.appendChild(document.createTextNode(parte));
          });
          cuerpo.appendChild(tx);
        }
        if (m.imagen) { const i = mk('img', 'puente-chat-img'); i.src = m.imagen; i.alt = ''; i.loading = 'lazy'; cuerpo.appendChild(i); }
        li.append(av, cuerpo);
        ul.appendChild(li);
      }
      p.appendChild(ul);
      const b = mk('button', 'puente-panel-btn', 'Sumate a la charla: creá tu cuenta'); b.type = 'button';
      b.addEventListener('click', () => irAlFormulario('register'));
      p.appendChild(b);
      grid.appendChild(p);
    }
    // 4. Mesas esperando rival (o, si no hay, jugar contra la compu)
    {
      const p = panel(d.abiertas && d.abiertas.length ? 'Te están esperando para jugar' : 'Jugá ahora, sin cuenta', 'puente-panel-mesas');
      const ul = mk('ul', 'puente-mesas');
      for (const m of (d.abiertas || [])) {
        const li = mk('li', 'puente-mesa');
        const t = mk('div', 'puente-mesa-txt'); t.append(mk('b', '', m.nombre + (m.detalle ? ' ' + m.detalle : '')), mk('span', '', m.quien + ' busca rival'));
        const b = mk('button', 'puente-panel-btn chico', 'Jugar'); b.type = 'button';
        b.addEventListener('click', () => elegir(location.origin + m.enlace));
        li.append(t, b);
        ul.appendChild(li);
      }
      if (!ul.children.length) p.appendChild(mk('p', 'puente-panel-s', listaJuegos() + '. Jugá contra la compu o armá una mesa y que se sume alguien del club.'));
      else p.appendChild(ul);
      const b = mk('button', 'puente-panel-btn', 'Ver todos los juegos'); b.type = 'button';
      b.addEventListener('click', aLosJuegos);
      p.appendChild(b);
      grid.appendChild(p);
    }
    // 3. El Marketplace
    if (d.mercado && d.mercado.length) {
      const p = panel('En el Marketplace', 'puente-panel-mk');
      const g = mk('div', 'puente-tienda');
      for (const it of d.mercado) {
        const a = mk('a', 'puente-tienda-item'); a.href = it.url;
        const f = mk('span', 'puente-tienda-foto'); const i = mk('img'); i.src = it.foto; i.alt = ''; i.loading = 'lazy'; f.appendChild(i);
        a.append(f, mk('b', '', it.precio), mk('span', 'puente-tienda-titulo', it.titulo));
        g.appendChild(a);
      }
      p.appendChild(g);
      const b = mk('a', 'puente-panel-btn', 'Ver todo el Marketplace'); b.href = mercado;
      p.appendChild(b);
      grid.appendChild(p);
    }
    // 5. El foro (de la wiki, nada)
    if (d.foro && d.foro.length) {
      const p = panel('En el foro', 'puente-panel-foro');
      const ul = mk('ul', 'puente-foro');
      for (const t of d.foro) {
        const li = mk('li');
        const a = mk('a', 'puente-foro-tema', t.tema); a.href = t.url;
        const r = t.respuestas == null ? '' : ' · ' + t.respuestas + (t.respuestas === 1 ? ' respuesta' : ' respuestas');
        li.append(a, mk('span', 'puente-foro-linea', (t.canal ? t.canal + ' · ' : '') + 'de ' + t.autor + r));
        ul.appendChild(li);
      }
      p.appendChild(ul);
      const b = mk('a', 'puente-panel-btn', 'Leer el foro'); b.href = 'https://foro.' + web.replace(/^https:\/\//, '') + '/';
      p.appendChild(b);
      grid.appendChild(p);
    }
    sec.appendChild(grid);
    card.parentElement.appendChild(sec);
  }
  let n = 0;
  (function poner() {
    if (!botones()) { if (++n < 40) setTimeout(poner, 150); return; }
    if (!document.documentElement.classList.contains('puente-dos')) return; // (solo en la pantalla de entrar)
    datos().then(d => { if (d) pasando(d); });
  })();
  // Llegando sin cuenta a un juego o a una mesa (afuera.js): el nombre de invitado; a los juegos en general, la pagina
  const tipo = ss.get('puente_jugar');
  if (tipo === 'truco' || tipo === 'juegos') {
    const volver = new URLSearchParams(location.search).get('volver') || ss.get('puente_volver') || '';
    // Un invitado al que se le corto la sesion en esta pestaña (estuvo mas de media hora afuera y se borro su nombre,
    // invitados.js, o se le vencio): entra solo de nuevo, con el mismo nombre, y vuelve a la sala de ese juego (aviso.js
    // anota donde estaba). Si no se puede (el nombre ya lo tiene otro), a elegir el nombre como siempre
    let prev = null;
    try { prev = JSON.parse(ss.get('puente_inv') || 'null'); } catch { prev = null; }
    if (prev && /^[A-Za-z0-9_]{3,20}$/.test(prev.nombre || '') && Date.now() - (prev.at || 0) < 24 * 3600e3) reentrar(prev, volver);
    else if (juegoDe(volver)) elegir(volver); else if (soloDe(volver)) soloUsuarios(volver); else aLosJuegos();
  }
  async function reentrar(prev, volver) {
    ss.del('puente_inv'); // (un intento: si no sale, sigue como siempre)
    const ir = /^\/app(\?[\w=&%.-]*)?$/.test(prev.sala || '') ? prev.sala : '/app';
    try {
      const r = await fetch('/api/auth/guest-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: prev.nombre, eulaVersion: '2.0', ageVerified: true }) });
      const d = await r.json().catch(() => null);
      if (r.ok && d && d.token && d.user) {
        localStorage.setItem('haven_token', d.token);
        localStorage.setItem('haven_user', JSON.stringify(d.user));
        localStorage.setItem('haven_eula_accepted', '2.0');
        location.replace(ir);
        return;
      }
    } catch { /* sin conexion: a elegir el nombre */ }
    const v = volver || location.origin + ir;
    if (juegoDe(v)) elegir(v); else if (soloDe(v)) soloUsuarios(v); else aLosJuegos();
  }
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
    try { const u = new URL(url); return u.protocol === 'https:' && [location.hostname, dom, 'www.' + dom, 'foro.' + dom, 'marketplace.' + dom].includes(u.hostname); } catch { return false; }
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
    const tab = () => { const b = document.querySelector('.auth-tab[data-tab="register"]'); if (b && !b.classList.contains('active')) b.click(); };
    // (Haven vuelve a poner "Iniciar sesion" cuando termina de arrancar: se insiste un poco)
    const varias = () => [50, 400, 900, 1500].forEach(ms => setTimeout(tab, ms));
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', varias); else varias();
  }
  // Con la flecha de atras el navegador muestra esta pagina guardada, sin volver a correr nada:
  // con la sesion abierta, de vuelta al chat en vez de quedarse en el login
  addEventListener('pageshow', (e) => { try { if (e.persisted && localStorage.getItem('haven_token')) location.replace('/app'); } catch { /* sin almacenamiento */ } });
  let tok = null;
  try { tok = localStorage.getItem('haven_token'); } catch { return; }
  // con sesion: al chat sin dejar el login en el historial (asi atras no vuelve a caer aca)
  if (tok) { location.replace('/app'); return; }
  fetch('/puente/api/cuenta/token', { method: 'POST' }).then(r => (r.ok ? r.json() : null)).then(d => {
    if (!d || !d.token) return;
    localStorage.setItem('haven_token', d.token);
    localStorage.setItem('haven_user', JSON.stringify(d.user));
    location.replace('/app');
  }).catch(() => {});
})();

// El paso del codigo de la app (verificacion en dos pasos): con los 6 numeros entra solo, sin tocar
// "Verificar" (un codigo de respaldo, con letras y guion, sigue con el boton). Y sus textos, de aca
(function () {
  'use strict';
  const form = document.getElementById('totp-form'), input = document.getElementById('totp-code');
  if (!form || !input) return;
  let enviado = '';
  input.addEventListener('input', () => {
    const v = input.value.trim();
    if (!/^\d{6}$/.test(v)) { enviado = ''; return; }
    if (v === enviado) return; // el mismo codigo no se manda dos veces
    enviado = v;
    if (typeof form.requestSubmit === 'function') form.requestSubmit(); else form.querySelector('button[type="submit"]')?.click();
  });
  const textos = () => {
    const t = (sel, txt) => { const e = form.querySelector(sel); if (e && e.textContent !== txt) e.textContent = txt; };
    t('[data-i18n="auth.totp.instruction"]', '🔐 Escribí el código de 6 números que te muestra la app del celular');
    t('[data-i18n="auth.totp.code_label"]', 'Código de la app');
    t('[data-i18n="auth.totp.back"]', '← Volver');
  };
  textos();
  // Haven vuelve a traducir la pagina al cambiar el idioma o al mostrar este paso
  new MutationObserver(textos).observe(form, { attributes: true, attributeFilter: ['style'] });
})();

// En el celular el teclado ponia la primera letra del usuario en mayuscula y lo corregia: el cuadro del usuario
// queda sin mayuscula automatica ni correccion (igual el servidor ya no distingue mayusculas, vincular.js)
(function () {
  'use strict';
  for (const id of ['login-username', 'reg-username']) {
    const i = document.getElementById(id);
    if (!i) continue;
    i.setAttribute('autocapitalize', 'none');
    i.setAttribute('autocorrect', 'off');
    i.spellcheck = false;
  }
})();
