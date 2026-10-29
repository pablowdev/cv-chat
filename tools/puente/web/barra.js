// La barra de arriba de la web y del foro (cuenta.js), como la del foro: a la derecha
// quien entro (nombre y foto) y su menu. En la web no repite el menu de la pagina (solo
// el nombre del club); en el foro se le agregan a la barra del foro los accesos a la web,
// el chat, la wiki y Full Fat Search, que el foro no tiene.
//
// Cuenta unica en el foro: si hay sesion en CV Chat y no en el foro, entra solo
// (/puente/foro/sso); si hay sesion en el foro y no en CV Chat, entra tambien a CV
// Chat (/puente/foro/auto). Una vez por pestaña, para no dar vueltas.
(function () {
  'use strict';
  if (window.__cvBarra) return;
  window.__cvBarra = true;
  const me = document.currentScript;
  const CHAT = new URL(me.src).origin;
  const host = location.hostname.replace(/^www\./, '');
  const enForo = host.startsWith('foro.');
  const DOM = enForo ? host.slice('foro.'.length) : host;
  const WEB = 'https://' + DOM, FORO = 'https://foro.' + DOM;
  if (enForo && location.pathname.startsWith('/cvchat.php')) return;
  const aca = location.href;
  const entrar = CHAT + '/?volver=' + encodeURIComponent(aca);
  const registrarse = CHAT + '/?registro=1&volver=' + encodeURIComponent(aca);
  const salir = CHAT + '/puente/cuenta/salir?volver=' + encodeURIComponent(enForo ? FORO + '/' : aca);
  // La misma en la web y en el foro: el nombre del club a la izquierda
  const LINKS = [['Círculo Vicioso', WEB + '/']];
  const ss = { get: k => { try { return sessionStorage.getItem(k); } catch { return '1'; } }, set: k => { try { sessionStorage.setItem(k, '1'); } catch { /* */ } }, del: k => { try { sessionStorage.removeItem(k); } catch { /* */ } } };

  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  function links(yo) {
    const nav = el('nav', 'cv-barra__links');
    for (const [t, href] of LINKS) {
      const a = el('a', 'cv-barra__link', t); a.href = href;
      // Los administradores ven cuantas propuestas de la wiki hay por revisar
      if (t === 'Wiki' && yo && yo.wikiPendientes) { a.textContent = `Wiki (${yo.wikiPendientes})`; a.href = WEB + '/wiki?revisar=1'; }
      a.classList.add('cv-barra__marca');
      nav.appendChild(a);
    }
    return nav;
  }
  function avatar(yo) {
    if (yo.avatar) { const i = el('img', 'cv-barra__avatar'); i.src = yo.avatar; i.alt = ''; return i; }
    const s = el('span', 'cv-barra__avatar cv-barra__avatar--letra', (yo.nombre || '?').trim().charAt(0).toUpperCase());
    return s;
  }
  // Los mensajes en una ventanita que baja desde la barra, con el chat adentro (aviso.js la
  // reconoce por el nombre "cv-ventana" y abre los mensajes directos): se abre y se cierra sin
  // dejar la pagina. Al cerrarla queda cargada, para volver a abrirla al toque.
  let ventana = null, alCerrar = null;
  function armarVentana() {
    if (!ventana) {
      ventana = el('div', 'cv-ventana'); ventana.setAttribute('role', 'dialog'); ventana.setAttribute('aria-label', 'Mensajes');
      const cab = el('div', 'cv-ventana__cab');
      const grande = el('a', 'cv-ventana__btn', 'Abrir en el chat ↗'); grande.href = CHAT + '/app?mensajes=1'; grande.target = '_blank'; grande.rel = 'noopener';
      const x = el('button', 'cv-ventana__btn cv-ventana__x', '×'); x.type = 'button'; x.title = 'Cerrar'; x.setAttribute('aria-label', 'Cerrar');
      x.addEventListener('click', cerrarVentana);
      cab.append(el('b', null, 'Mensajes'), grande, x);
      const marco = el('iframe', 'cv-ventana__marco'); marco.name = 'cv-ventana'; marco.title = 'Mensajes'; marco.src = CHAT + '/app?ventana=1';
      ventana.append(cab, marco);
      ventana.addEventListener('click', (e) => e.stopPropagation());
      document.body.appendChild(ventana);
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && ventana.classList.contains('es-abierta')) cerrarVentana(); });
      void ventana.offsetHeight; // para que se vea bajar
    }
  }
  // Con la sesion abierta, el chat de la ventanita se va cargando escondido apenas se puede: al tocar
  // "Mensajes" ya esta listo, sin esperar
  function precargar() {
    const ya = () => { try { armarVentana(); } catch { /* */ } };
    setTimeout(() => { if (window.requestIdleCallback) requestIdleCallback(ya, { timeout: 4000 }); else ya(); }, 1200);
  }
  function abrirVentana(desde) {
    armarVentana();
    if (ventana.classList.contains('es-abierta')) { cerrarVentana(); return; }
    const r = desde && desde.getBoundingClientRect();
    ventana.style.top = Math.max(0, Math.round(r ? r.bottom : 0)) + 'px';
    ventana.classList.add('es-abierta');
  }
  function cerrarVentana() {
    if (!ventana) return;
    ventana.classList.remove('es-abierta');
    if (alCerrar) alCerrar();
  }

  // En el foro, a quien tiene solo cuenta del foro: los mensajes privados son los de CV Chat
  function avisoUnir(unirUrl) {
    if (document.querySelector('.cv-unir')) return;
    const o = el('div', 'cv-unir'), box = el('div', 'cv-unir__caja');
    o.setAttribute('role', 'dialog'); o.setAttribute('aria-label', 'Mensajes privados');
    const x = el('button', 'cv-unir__x', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Cerrar');
    const ir = el('a', 'cv-unir__btn', 'Unir mis cuentas'); ir.href = unirUrl;
    box.append(x, el('b', null, 'Mensajes privados'),
      el('p', null, 'Los mensajes privados ahora son los de CV Chat: los mismos en la página, el foro y el chat, y cifrados.'),
      el('p', null, 'Para usarlos, uní tu cuenta del foro con la de la página. Tus mensajes del foro de antes siguen ahí.'), ir);
    o.appendChild(box); document.body.appendChild(o);
    const cerrar = () => o.remove();
    x.addEventListener('click', cerrar); o.addEventListener('click', (e) => { if (e.target === o) cerrar(); });
  }

  // Lo del foro que estaba en su barra (que queda escondida): perfil, ajustes y panel
  const delForo = (sel) => { const a = enForo && document.querySelector('nav.js-top-menu-user ' + sel); return a && a.href ? a.href : null; };
  function itemsForo(item) {
    if (!enForo) return;
    for (const [t, sel] of [['Mi perfil del foro', 'a[href*="/member/"]'], ['Ajustes del foro', 'a[href*="/settings"]'], ['Panel del foro', 'a[href*="admincp"]']]) {
      const h = delForo(sel); if (h) item(t, h);
    }
  }
  function usuario(yo) {
    const box = el('div', 'cv-barra__user');
    const vbId = enForo ? Number((window.pageData && window.pageData.userid) || 0) : 0;
    if ((!yo || !yo.conectado) && vbId) {
      const nombre = String((window.pageData && (window.pageData.musername || window.pageData.username)) || 'Mi cuenta').replace(/<[^>]*>/g, '');
      const b = el('button', 'cv-barra__yo'); b.type = 'button'; b.setAttribute('aria-haspopup', 'true');
      const foto = document.querySelector('nav.js-top-menu-user img');
      b.appendChild(foto && foto.src ? Object.assign(el('img', 'cv-barra__avatar'), { src: foto.src, alt: '' }) : el('span', 'cv-barra__avatar cv-barra__avatar--letra', nombre.charAt(0).toUpperCase()));
      b.appendChild(el('span', 'cv-barra__nombre', nombre)); b.appendChild(el('span', 'cv-barra__flecha'));
      const menu = el('div', 'cv-barra__menu'); menu.hidden = true;
      const item = (t, href) => { const a = el('a', null, t); a.href = href; menu.appendChild(a); return a; };
      item('Unir mi cuenta', CHAT + '/?volver=' + encodeURIComponent(aca));
      itemsForo(item);
      item('Salir', salir).addEventListener('click', () => { ss.del('cv_sso'); ss.del('cv_auto'); });
      b.addEventListener('click', (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; });
      document.addEventListener('click', () => { menu.hidden = true; });
      box.append(b, menu);
      return box;
    }
    if (!yo || !yo.conectado) {
      const a = el('a', 'cv-barra__entrar', 'Inicio de Sesión o Registro'); a.href = entrar;
      box.appendChild(a);
      return box;
    }
    const b = el('button', 'cv-barra__yo'); b.type = 'button'; b.setAttribute('aria-haspopup', 'true');
    b.appendChild(avatar(yo)); b.appendChild(el('span', 'cv-barra__nombre', yo.nombre)); b.appendChild(el('span', 'cv-barra__flecha'));
    const menu = el('div', 'cv-barra__menu'); menu.hidden = true;
    const item = (t, href) => { const a = el('a', null, t); a.href = href; menu.appendChild(a); return a; };
    item('Mi cuenta', WEB + '/cuenta');
    itemsForo(item);
    item('Salir', salir).addEventListener('click', () => { ss.del('cv_sso'); ss.del('cv_auto'); });
    b.addEventListener('click', (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; });
    document.addEventListener('click', () => { menu.hidden = true; });
    box.appendChild(accesos(yo, bar));
    box.appendChild(b); box.appendChild(menu);
    return box;
  }
  // Los mensajes privados (los de CV Chat, para todo el sistema), con cuantas conversaciones hay sin leer,
  // y la campanita: los mismos en la web y en el foro. desde(): de donde baja la ventanita
  function accesos(yo, desde) {
    const box = el('div', 'cv-barra__accesos');
    const m = el('a', 'cv-barra__mensajes'); m.href = CHAT + '/app?mensajes=1'; m.title = 'Mensajes'; m.setAttribute('aria-label', 'Mensajes');
    m.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8l-4 4V6a2 2 0 0 1 2-2Z"/></svg><span>Mensajes</span>';
    const contar = (n) => { const c = m.querySelector('.cv-barra__contador'); if (c) c.remove(); if (n) m.appendChild(el('b', 'cv-barra__contador', String(n > 99 ? '99+' : n))); };
    contar(yo.mensajes);
    m.addEventListener('click', (e) => { if (e.button || e.ctrlKey || e.metaKey || e.shiftKey) return; e.preventDefault(); e.stopPropagation(); abrirVentana(desde()); });
    // Al cerrar la ventanita, cuantas quedaron sin leer
    alCerrar = () => fetch(CHAT + '/puente/api/cuenta/yo', { credentials: 'include', cache: 'no-store' }).then(r => r.json()).then(d => contar(d && d.mensajes)).catch(() => {});
    box.append(m, campanita(yo));
    precargar();
    return box;
  }

  // La campanita: respuestas, citas y menciones del foro y de CV Chat (campana.js)
  function hace(t) {
    const s = Math.max(1, Math.round((Date.now() - t) / 1000));
    if (s < 60) return 'recién'; if (s < 3600) return 'hace ' + Math.round(s / 60) + ' min'; if (s < 86400) return 'hace ' + Math.round(s / 3600) + ' h';
    return new Date(t).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
  }
  function campanita(yo) {
    const wrap = el('div', 'cv-barra__campana');
    const b = el('button', 'cv-barra__icono'); b.type = 'button'; b.title = 'Avisos'; b.setAttribute('aria-label', 'Avisos'); b.setAttribute('aria-haspopup', 'true');
    b.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm7-6V11a7 7 0 0 0-5.5-6.84V3.5a1.5 1.5 0 0 0-3 0v.66A7 7 0 0 0 5 11v5l-2 2v1h18v-1l-2-2Z"/></svg>';
    let contador = null;
    const pintar = (n) => { if (contador) contador.remove(); contador = null; if (n) { contador = el('b', 'cv-barra__contador', n > 99 ? '99+' : String(n)); b.appendChild(contador); } };
    pintar(yo.avisos);
    const panel = el('div', 'cv-barra__avisos'); panel.hidden = true;
    panel.addEventListener('click', (e) => e.stopPropagation());
    async function abrir() {
      panel.textContent = '';
      panel.appendChild(el('div', 'cv-barra__avisos-cab', 'Avisos'));
      const lista = el('div', 'cv-barra__avisos-lista'); panel.appendChild(lista);
      lista.appendChild(el('div', 'cv-barra__avisos-vacio', 'Cargando…'));
      try {
        const d = await fetch(CHAT + '/puente/api/cuenta/avisos', { credentials: 'include', cache: 'no-store' }).then(r => r.json());
        lista.textContent = '';
        if (!d.avisos || !d.avisos.length) { lista.appendChild(el('div', 'cv-barra__avisos-vacio', 'Cuando te respondan, te citen o te mencionen en el foro o en el chat, aparece acá.')); }
        for (const a of d.avisos || []) {
          const it = el('a', 'cv-barra__aviso' + (a.leido ? '' : ' es-nuevo')); it.href = a.url || '#';
          if (a.origen === 'foro') { it.target = '_blank'; it.rel = 'noopener'; }
          it.appendChild(el('span', 'cv-barra__aviso-origen', a.origen === 'foro' ? 'foro' : 'chat'));
          const tx = el('span', 'cv-barra__aviso-texto');
          tx.appendChild(el('b', null, a.titulo));
          if (a.texto) tx.appendChild(el('span', null, a.texto));
          tx.appendChild(el('small', null, hace(a.fecha)));
          it.appendChild(tx);
          lista.appendChild(it);
        }
        if (d.sinLeer) { fetch(CHAT + '/puente/api/cuenta/avisos/leer', { method: 'POST', credentials: 'include' }).catch(() => {}); pintar(0); }
      } catch { lista.textContent = ''; lista.appendChild(el('div', 'cv-barra__avisos-vacio', 'No se pudieron cargar.')); }
    }
    b.addEventListener('click', (e) => { e.stopPropagation(); panel.hidden = !panel.hidden; if (!panel.hidden) abrir(); });
    document.addEventListener('click', () => { panel.hidden = true; });
    wrap.append(b, panel);
    return wrap;
  }

  const bar = () => document.getElementById('cv-barra');
  function webBar(yo) {
    let bar = document.getElementById('cv-barra');
    if (!bar) { bar = el('div', 'cv-barra'); bar.id = 'cv-barra'; document.body.insertBefore(bar, document.body.firstChild); }
    bar.textContent = '';
    const inner = el('div', 'cv-barra__in');
    inner.appendChild(links(yo));
    inner.appendChild(usuario(yo));
    bar.appendChild(inner);
  }

  // En el foro: los accesos a la izquierda de la barra del foro, y entrar y salir por la cuenta unica
  function foroBar(yo) {
    const cont = document.querySelector('nav.js-top-menu-user .b-top-menu__container');
    const vbId = Number((window.pageData && window.pageData.userid) || 0);
    // Los mensajes privados son los de CV Chat (cifrados), los mismos en la web, el foro y el chat. Con la
    // cuenta del foro unida: el "Mensajes" del foro y sus paginas de privados abren la ventanita ahi mismo.
    // Con solo cuenta del foro no hay mensajes privados: se avisa como unir las cuentas.
    // (si no se pudo saber quien es, no se toca nada)
    const unida = !!(vbId && yo && yo.conectado && Number(yo.foro) === vbId);
    const sinUnir = !!(vbId && yo && !unida);
    const arriba = () => bar() || cont;
    // Unir: con sesion en CV Chat, directo; sin sesion, entrando (ahi esta "Entrar con el foro")
    const unirUrl = yo && yo.conectado ? CHAT + '/puente/foro/sso?volver=' + encodeURIComponent(location.href.split('#')[0]) : entrar;
    const mensajes = () => (unida ? abrirVentana(arriba()) : avisoUnir(unirUrl));
    if ((unida || sinUnir) && /^\/(privatemessage|pmchat)/.test(location.pathname)) { location.replace(FORO + '/#mensajes'); return; }
    if (cont && (unida || sinUnir)) {
      for (const li of cont.querySelectorAll('li')) {
        const t = li.querySelector('.b-comp-menu-dropdown__trigger, a');
        if (t && !li.closest('.cv-barra__foro-accesos') && /^\s*mensajes\s*$/i.test(t.textContent || '')) {
          li.addEventListener('click', (e) => { e.preventDefault(); e.stopImmediatePropagation(); mensajes(); }, true);
          // Con la cuenta unida, lo reemplazan los accesos de la barra (los mismos que en la web)
          if (unida) li.style.display = 'none';
        }
        // Y las notificaciones del foro: con la cuenta unida estan en la campanita (con las del chat)
        const tr = li.querySelector('.b-comp-menu-dropdown__trigger') || t;
        if (unida && tr && !li.closest('.cv-barra__foro-accesos') && /^\s*notificaciones\b/i.test(tr.textContent || '')) li.style.display = 'none';
      }
    }
    document.addEventListener('click', (e) => {
      const a = e.target.closest && e.target.closest('a[href*="/privatemessage"], a[href*="/pmchat"]');
      if (a && (unida || sinUnir)) { e.preventDefault(); e.stopImmediatePropagation(); mensajes(); }
    }, true);
    if ((unida || sinUnir) && location.hash === '#mensajes') { history.replaceState(null, '', location.pathname + location.search); mensajes(); }
    // Iniciar sesion y registrarse: por la cuenta unica
    document.addEventListener('click', (e) => {
      const t = e.target.closest && e.target.closest('#lnkLoginSignupMenu, a[href$="/register"], a[href*="/register?"], a[href*="auth/logout"]');
      if (!t) return;
      e.preventDefault(); e.stopImmediatePropagation();
      if (t.id === 'lnkLoginSignupMenu') location.href = entrar;
      else if (/logout/.test(t.getAttribute('href') || '')) { ss.del('cv_sso'); ss.del('cv_auto'); location.href = salir; }
      else location.href = registrarse;
    }, true);
    if (/^\/(login|register)\/?$/.test(location.pathname) && !vbId) { location.replace(location.pathname.startsWith('/register') ? CHAT + '/?registro=1&volver=' + encodeURIComponent(FORO + '/') : CHAT + '/?volver=' + encodeURIComponent(FORO + '/')); return; }
    if (!yo) return;
    if (yo.conectado && !vbId && !ss.get('cv_sso')) { ss.set('cv_sso'); location.replace(CHAT + '/puente/foro/sso?volver=' + encodeURIComponent(aca)); return; }
    if (!yo.conectado && vbId && !ss.get('cv_auto')) { ss.set('cv_auto'); location.replace(CHAT + '/puente/foro/auto?volver=' + encodeURIComponent(aca)); return; }
    // Adentro de los dos, con cuentas sin unir: el foro pregunta una vez si se unen ("Ahora no" se recuerda)
    let noUnir = false; try { noUnir = !!localStorage.getItem('cv_unir_no'); } catch { /* */ }
    if (yo.conectado && vbId && !yo.foro && !noUnir && !ss.get('cv_sso')) { ss.set('cv_sso'); location.replace(CHAT + '/puente/foro/sso?volver=' + encodeURIComponent(aca)); }
  }

  function start() {
    // En el foro, la barra del foro queda escondida (barra.css): esta va en su lugar
    if (enForo) document.documentElement.classList.add('cv-en-foro');
    webBar(null);
    fetch(CHAT + '/puente/api/cuenta/yo', { credentials: 'include', cache: 'no-store' })
      .then(r => r.json()).catch(() => null)
      .then(yo => { webBar(yo); if (enForo) foroBar(yo); });
  }
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();
