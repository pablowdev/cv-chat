// De donde llego la gente (origenes.js): en la web, el foro y CV Chat se anota en una cookie del dominio
// (cv_origen) por donde se entro: el sitio de donde venia, la pagina y la etiqueta del enlace
// (?de=, ?utm_source=, ?invita=). Lo de afuera reemplaza a lo anterior; andar entre la web, el foro y
// el chat no. Cada cambio suma una visita a esa fuente; en CV Chat, una cuenta nueva lo reclama una vez.
(function () {
  'use strict';
  if (window.__cvOrigen) return;
  window.__cvOrigen = true;
  var me = document.currentScript;
  var CHAT = me && me.src ? new URL(me.src).origin : location.origin;
  var host = location.hostname.replace(/^www\./, '');
  var DOM = host.replace(/^(chat|foro)\./, '');
  function leer() {
    var m = document.cookie.match(/(?:^|; )cv_origen=([^;]*)/);
    try { return m ? JSON.parse(decodeURIComponent(m[1])) : null; } catch (e) { return null; }
  }
  var q = new URLSearchParams(location.search);
  var ref = document.referrer || '';
  var refHost = '';
  try { refHost = /^https?:/.test(ref) ? new URL(ref).hostname.replace(/^www\./, '') : ''; } catch (e) { /* nada */ }
  var propio = !!refHost && (refHost === DOM || refHost.slice(-(DOM.length + 1)) === '.' + DOM);
  var etiqueta = q.get('de') || q.get('utm_source') || '';
  var invita = q.get('invita') || '';
  var android = /^android-app:\/\/club\.circulovicioso\.chat/.test(ref);
  var deAfuera = !!etiqueta || !!invita || (!!refHost && !propio);
  var ya = leer();
  if (!ya || deAfuera) {
    var t = { r: refHost ? ref.split('?')[0].split('#')[0].slice(0, 300) : '', l: (host + location.pathname).slice(0, 200), d: etiqueta.slice(0, 40),
      c: (q.get('utm_campaign') || '').slice(0, 60), m: (q.get('utm_medium') || '').slice(0, 40), i: invita.slice(0, 40), a: android ? 'android' : '', t: Date.now() };
    try {
      document.cookie = 'cv_origen=' + encodeURIComponent(JSON.stringify(t)) + '; max-age=7776000; path=/; SameSite=Lax' +
        (location.protocol === 'https:' ? '; Secure' : '') + (host.slice(-DOM.length) === DOM && DOM.indexOf('.') > 0 ? '; domain=.' + DOM : '');
    } catch (e) { /* sin cookies */ }
    // (quien ya tiene la sesion abierta en el chat y entra derecho no es una visita nueva)
    var miembro = false;
    try { miembro = location.origin === CHAT && !!localStorage.getItem('haven_token'); } catch (e) { /* nada */ }
    if (deAfuera || !miembro) try { navigator.sendBeacon(CHAT + '/puente/api/origen/visita', JSON.stringify(t)); } catch (e) { /* sin beacon */ }
  }
  // En CV Chat: la cuenta nueva dice de donde llego (una sola vez por cuenta en este navegador)
  if (location.origin !== CHAT) return;
  var intentos = 0;
  (function reclamar() {
    var tk = null, hecho = null;
    try { tk = localStorage.getItem('haven_token'); hecho = localStorage.getItem('puente_origen_ok'); } catch (e) { return; }
    if (!tk) { if (++intentos < 60) setTimeout(reclamar, 5000); return; }
    var quien = '';
    try { quien = String(JSON.parse(atob(tk.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).id || ''); } catch (e) { /* token raro */ }
    if (!quien || hecho === quien) return;
    fetch('/puente/api/origen/reclamar', { method: 'POST', headers: { Authorization: 'Bearer ' + tk, 'Content-Type': 'application/json' }, body: JSON.stringify(leer() || { a: android ? 'android' : '' }) })
      .then(function (r) { if (r.ok) try { localStorage.setItem('puente_origen_ok', quien); } catch (e) { /* nada */ } })
      .catch(function () { /* la proxima vez */ });
  })();
})();
