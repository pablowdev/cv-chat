// Cartel "Instalar <PUENTE_TITULO>" al entrar a Haven (/app), en lugar de los
// de Haven que recomiendan la app de Android y la de PC (instalable.js los
// apaga). Instala la pagina como app: con el boton del navegador donde existe
// (Chrome, Edge, Samsung Internet, en PC y celular) o con instrucciones donde no
// (iPhone/iPad, Safari en Mac). Tiene el mismo aspecto que los carteles de Haven.
//
// "Mas tarde" lo cierra hasta el proximo inicio de sesion; "No mostrar de nuevo"
// lo cierra para siempre en ese navegador. Nunca aparece dentro de la app ya
// instalada. Se carga en el <head> para no perderse el aviso "se puede
// instalar" del navegador, que llega temprano.
// Enlaces directos (/app?mercado, ?juegos, ?truco=, ?funball=): si la persona todavia no inicio
// sesion, Haven la manda a la pantalla de inicio y se pierde a donde iba. Aca (corre antes que Haven)
// se guarda en la pestaña y, al volver a /app ya con la sesion, se repone en la direccion para que
// aviso.js abra esa pantalla.
(function () {
  'use strict';
  const CLAVES = ['mercado', 'juegos', 'truco', 'funball'];
  try {
    if (location.pathname !== '/app') return;
    const q = new URLSearchParams(location.search);
    const ir = new URLSearchParams();
    for (const k of CLAVES) if (q.has(k)) ir.set(k, q.get(k).slice(0, 40));
    const sesion = !!localStorage.getItem('haven_token');
    if ([...ir.keys()].length) { if (!sesion) sessionStorage.setItem('puente_ir', ir.toString()); return; }
    const guardado = sessionStorage.getItem('puente_ir');
    if (!guardado || !sesion) return;
    sessionStorage.removeItem('puente_ir');
    const limpio = new URLSearchParams();
    for (const [k, v] of new URLSearchParams(guardado)) if (CLAVES.includes(k)) limpio.set(k, v);
    const qs = limpio.toString().replace(/=(?=&|$)/g, '');
    if (qs) history.replaceState(history.state, '', '/app?' + qs + location.hash);
  } catch { /* sin almacenamiento: el enlace abre CV Chat sin mas */ }
})();

(function () {
  'use strict';
  const TITLE = '__PUENTE_TITULO__';
  if (!TITLE || TITLE.indexOf('__PUENTE') === 0) return;
  const NEVER_KEY = 'puente_instalar_nunca';
  const SESSION_KEY = 'puente_instalar_visto';
  const ICON = '/puente/icono-192.png';

  const store = (s, fn) => { try { return fn(s === 'l' ? localStorage : sessionStorage); } catch { return null; } };
  const installed = () => matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: window-controls-overlay)').matches ||
    navigator.standalone === true || /Electron/i.test(navigator.userAgent) || !!window.puenteApp || !!window.havenDesktop;
  const ua = navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isMacSafari = !isIOS && /Macintosh/i.test(ua) && /Safari/i.test(ua) && !/Chrome|Chromium|Edg|Firefox/i.test(ua);
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || isIOS;

  let deferred = null; // evento beforeinstallprompt guardado
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // sin la mini barra del navegador: se usa el cartel propio
    deferred = e;
    if (pending) { pending = false; show(); }
  });
  window.addEventListener('appinstalled', () => { deferred = null; close(); store('l', s => s.setItem(NEVER_KEY, '1')); });

  let pending = false;
  let overlay = null;

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.textContent = text;
    return n;
  }

  // Instrucciones para los navegadores sin boton de instalar
  function manualSteps() {
    if (isIOS) return ['Tocá el botón Compartir (el cuadrado con la flecha) abajo o arriba.', 'Elegí "Agregar a inicio".', 'Tocá "Agregar".'];
    if (isMacSafari) return ['En la barra de menú, abrí Archivo.', 'Elegí "Agregar al Dock".'];
    if (/Android/i.test(ua)) return ['Abrí el menú del navegador (⋮).', 'Elegí "Instalar app" o "Agregar a pantalla principal".'];
    return null;
  }

  // En Android y Windows hay app para descargar (pagina /puente/descargar)
  const descarga = !isIOS && /Android/i.test(ua) ? 'Android' : /Windows/i.test(ua) ? 'Windows' : null;

  function build() {
    const steps = deferred || descarga ? null : manualSteps();
    if (!deferred && !steps && !descarga) return null; // navegador sin forma de instalar (por ejemplo Firefox en Mac)

    overlay = el('div', 'modal-overlay');
    overlay.id = 'puente-instalar-modal';
    overlay.style.display = 'flex';
    const card = el('div', 'modal android-beta-promo');

    const icon = el('div', 'android-beta-promo-icon');
    const img = el('img');
    img.src = ICON; img.alt = ''; img.width = 80; img.height = 80;
    img.style.cssText = 'width:100%;height:100%;border-radius:22%;display:block';
    icon.style.background = 'none';
    icon.appendChild(img);

    const badge = el('span', 'android-beta-promo-badge', isMobile ? 'APP PARA EL CELULAR' : 'APP PARA LA PC');
    badge.style.background = 'var(--accent-bright,#5865f2)';
    const title = el('h3', 'android-beta-promo-title', 'Instalá ' + TITLE);
    const sub = el('p', 'android-beta-promo-subtitle', isMobile
      ? 'Tené el chat en tu pantalla de inicio, como cualquier app.'
      : 'Abrilo en su propia ventana, sin buscar la pestaña del navegador.');

    const list = el('ul', 'android-beta-promo-features');
    const features = isMobile
      ? ['Se abre a pantalla completa, sin la barra del navegador', 'Con el mismo aspecto que acá', 'No ocupa casi espacio y se actualiza sola']
      : ['Ícono en el escritorio y en la barra de tareas', 'Con el mismo aspecto que acá', 'No ocupa casi espacio y se actualiza sola'];
    for (const f of features) {
      const li = el('li');
      li.append(el('span', 'promo-check', '✓'), document.createTextNode(' ' + f));
      list.appendChild(li);
    }

    const action = el('div', 'android-beta-form');
    if (descarga) {
      const a = el('a', 'btn btn-accent android-beta-submit', '⬇️ Descargar la app para ' + descarga);
      a.href = '/puente/descargar';
      a.style.cssText = 'display:block;text-align:center;text-decoration:none';
      a.addEventListener('click', () => store('l', s => s.setItem(NEVER_KEY, '1')));
      action.appendChild(a);
    } else if (deferred) {
      const btn = el('button', 'btn btn-accent android-beta-submit', '📲 Instalar ' + TITLE);
      btn.type = 'button';
      btn.addEventListener('click', async () => {
        const ev = deferred;
        if (!ev) return close();
        deferred = null;
        try {
          await ev.prompt();
          const choice = await ev.userChoice;
          if (choice && choice.outcome === 'accepted') store('l', s => s.setItem(NEVER_KEY, '1'));
        } catch { /* el navegador no lo dejo: queda para la proxima */ }
        close();
      });
      action.appendChild(btn);
    } else {
      const ol = el('ol');
      ol.style.cssText = 'text-align:left;margin:0 auto;padding-left:1.25rem;max-width:20rem;line-height:1.6';
      for (const s of steps) ol.appendChild(el('li', '', s));
      action.appendChild(ol);
    }

    const actions = el('div', 'android-beta-promo-actions');
    const later = el('button', 'btn android-beta-promo-later', 'Más tarde');
    later.type = 'button';
    later.addEventListener('click', close);
    actions.appendChild(later);

    const label = el('label', 'android-beta-promo-dismiss-label');
    const check = el('input');
    check.type = 'checkbox';
    check.addEventListener('change', () => store('l', s => check.checked ? s.setItem(NEVER_KEY, '1') : s.removeItem(NEVER_KEY)));
    label.append(check, document.createTextNode(' No mostrar de nuevo'));

    card.append(icon, badge, title, sub, list, action, actions, label);
    overlay.appendChild(card);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    return overlay;
  }

  function close() {
    if (overlay) { overlay.remove(); overlay = null; }
  }

  function show() {
    if (overlay || installed() || store('l', s => s.getItem(NEVER_KEY))) return;
    // No encima de otro cartel de Haven (por ejemplo el de codigos de recuperacion)
    const busy = [...document.querySelectorAll('.modal-overlay')].some(m => m.id !== 'puente-instalar-modal' && getComputedStyle(m).display !== 'none');
    if (busy) { setTimeout(show, 4000); return; }
    const node = build();
    if (!node) return;
    store('s', s => s.setItem(SESSION_KEY, '1'));
    document.body.appendChild(node);
  }

  // Una vez por inicio de sesion, unos segundos despues de entrar
  function start() {
    if (installed() || store('l', s => s.getItem(NEVER_KEY)) || store('s', s => s.getItem(SESSION_KEY))) return;
    let tries = 0;
    (function wait() {
      if (!store('l', s => s.getItem('haven_token'))) { if (++tries < 120) setTimeout(wait, 5000); return; }
      setTimeout(() => {
        // Chrome avisa que se puede instalar unos segundos despues de cargar:
        // se espera ese aviso (boton directo) y, en Android, si no llega, se
        // muestran las instrucciones del menu.
        if (deferred || isIOS || isMacSafari) return show();
        pending = true;
        setTimeout(() => { if (pending && /Android/i.test(ua)) { pending = false; show(); } }, 8000);
      }, 3000);
    })();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
