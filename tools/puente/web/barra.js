// La barra de arriba de la web y del foro (cuenta.js): accesos a la web, el foro,
// el chat, la wiki y los episodios, y a la derecha quien entro (nombre y foto), como
// la del foro. En la web la barra es entera; en el foro se agregan los accesos a la
// barra del foro, que ya muestra quien entro.
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
  const LINKS = [['Inicio', WEB + '/'], ['Foro', FORO + '/'], ['Chat', CHAT + '/app'], ['Wiki', WEB + '/wiki'], ['Episodios', WEB + '/full-fat-search.html']];
  const ss = { get: k => { try { return sessionStorage.getItem(k); } catch { return '1'; } }, set: k => { try { sessionStorage.setItem(k, '1'); } catch { /* */ } }, del: k => { try { sessionStorage.removeItem(k); } catch { /* */ } } };

  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  function links(yo) {
    const nav = el('nav', 'cv-barra__links');
    for (const [t, href] of LINKS) {
      const a = el('a', 'cv-barra__link', t); a.href = href;
      // Los administradores ven cuantas propuestas de la wiki hay por revisar
      if (t === 'Wiki' && yo && yo.wikiPendientes) { a.textContent = `Wiki (${yo.wikiPendientes})`; a.href = WEB + '/wiki?pendientes=1'; }
      const actual = (t === 'Foro' && enForo) || (!enForo && t === 'Inicio' && /^\/(index\.html)?$/.test(location.pathname)) ||
        (!enForo && t === 'Wiki' && location.pathname.startsWith('/wiki')) || (!enForo && t === 'Episodios' && location.pathname.startsWith('/full-fat-search'));
      if (actual) a.classList.add('is-actual');
      nav.appendChild(a);
    }
    return nav;
  }
  function avatar(yo) {
    if (yo.avatar) { const i = el('img', 'cv-barra__avatar'); i.src = yo.avatar; i.alt = ''; return i; }
    const s = el('span', 'cv-barra__avatar cv-barra__avatar--letra', (yo.nombre || '?').trim().charAt(0).toUpperCase());
    return s;
  }
  function usuario(yo) {
    const box = el('div', 'cv-barra__user');
    if (!yo || !yo.conectado) {
      const a = el('a', 'cv-barra__entrar', 'Inicio de Sesión o Registro'); a.href = entrar;
      box.appendChild(a);
      return box;
    }
    const b = el('button', 'cv-barra__yo'); b.type = 'button'; b.setAttribute('aria-haspopup', 'true');
    b.appendChild(avatar(yo)); b.appendChild(el('span', 'cv-barra__nombre', yo.nombre)); b.appendChild(el('span', 'cv-barra__flecha'));
    const menu = el('div', 'cv-barra__menu'); menu.hidden = true;
    const item = (t, href) => { const a = el('a', null, t); a.href = href; menu.appendChild(a); return a; };
    item('Abrir el chat', CHAT + '/app');
    item('Mi cuenta', CHAT + '/puente/vincular');
    item('Salir', salir).addEventListener('click', () => { ss.del('cv_sso'); ss.del('cv_auto'); });
    b.addEventListener('click', (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; });
    document.addEventListener('click', () => { menu.hidden = true; });
    box.appendChild(b); box.appendChild(menu);
    return box;
  }

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
    if (cont && !cont.querySelector('.cv-barra__links')) cont.insertBefore(links(yo), cont.firstChild);
    const vbId = Number((window.pageData && window.pageData.userid) || 0);
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
    if (!yo.conectado && vbId && !ss.get('cv_auto')) { ss.set('cv_auto'); location.replace(CHAT + '/puente/foro/auto?volver=' + encodeURIComponent(aca)); }
  }

  function start() {
    if (!enForo) webBar(null);
    fetch(CHAT + '/puente/api/cuenta/yo', { credentials: 'include', cache: 'no-store' })
      .then(r => r.json()).catch(() => null)
      .then(yo => { if (enForo) foroBar(yo); else webBar(yo); });
  }
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();
