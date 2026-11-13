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
        mk('span', '', (tipo === 'truco' || cual ? '' : 'Truco, Pool, Ajedrez y GlobalSiege, contra la compu, contra la gente del club o de a varios en el mismo dispositivo. ')
          + 'Elegí un nombre para jugar (letras, números o _). Es temporal: cuando te vas, se borra. Si te gusta, después creás tu cuenta gratis.'));
      const u = document.getElementById('guest-username');
      if (u) { u.placeholder = 'Tu nombre para jugar'; u.focus(); }
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
  function aLosJuegos() { ss.del('puente_jugar'); ss.del('puente_volver'); location.href = PAGINA_JUEGOS; }
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
      const p = panel('Ahora en #' + d.chat.canal, 'puente-panel-chat');
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
      if (!ul.children.length) p.appendChild(mk('p', 'puente-panel-s', 'Truco, Pool, Ajedrez y GlobalSiege contra la compu, o armá una mesa y que se sume alguien del club.'));
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
    if (juegoDe(volver)) elegir(volver); else aLosJuegos();
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
