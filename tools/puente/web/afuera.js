// Un enlace al Marketplace del chat (/app?mercado o /app?mercado=<id>) abierto sin la sesion de CV Chat
// (alguien que llega desde X, WhatsApp...): en vez de la pantalla de entrar, el Marketplace en la web, que
// se ve sin cuenta (y "Escribirle" hace la cuenta y vuelve a la publicacion en el chat). Lo pone
// vincular.js en la cabeza de /app solo para esos enlaces, despues de origen.js (asi cuenta de donde
// llego) y antes que Haven, que sin sesion manda a "/". Si hay sesion en la web o el foro, primero entra
// con esa (como el login, cuenta.js) y sigue en el chat.
(function () {
  'use strict';
  var q = new URLSearchParams(location.search);
  if (!q.has('mercado') || window.name === 'cv-ventana' || window.top !== window) return;
  try { if (localStorage.getItem('haven_token')) return; } catch (e) { return; }
  // la sesion de la web o el foro (la cookie del dominio): sincronico, para llegar antes que Haven
  try {
    var x = new XMLHttpRequest();
    x.open('POST', '/puente/api/cuenta/token', false);
    x.send();
    if (x.status === 200) {
      var d = JSON.parse(x.responseText);
      if (d && d.token) { localStorage.setItem('haven_token', d.token); localStorage.setItem('haven_user', JSON.stringify(d.user)); return; }
    }
  } catch (e) { /* sin la cuenta de la web */ }
  var id = q.get('mercado');
  var dom = location.hostname.replace(/^chat\./, '');
  location.replace('https://' + dom + '/marketplace' + (/^\d+$/.test(id || '') ? '?id=' + id : ''));
})();
