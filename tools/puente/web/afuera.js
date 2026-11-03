// Enlaces del chat abiertos sin la sesion de CV Chat (alguien que llega desde X, WhatsApp...):
//  - Al Marketplace (/app?mercado o /app?mercado=<id>): en vez de la pantalla de entrar, el Marketplace en
//    la web, que se ve sin cuenta (y "Escribirle" hace la cuenta y vuelve a la publicacion en el chat).
//  - A una mesa de truco o a la sala del truco (/app?truco=<id>, /app?juegos=truco): a la pantalla de
//    entrar, que ofrece jugar sin cuenta, como invitado (login.js); despues vuelve a esa mesa.
// Lo pone vincular.js en la cabeza de /app solo para esos enlaces, despues de origen.js (asi cuenta de donde
// llego) y antes que Haven, que sin sesion manda a "/". Si hay sesion en la web o el foro, primero entra
// con esa (como el login, cuenta.js) y sigue en el chat.
(function () {
  'use strict';
  var q = new URLSearchParams(location.search);
  var truco = q.has('truco') || q.get('juegos') === 'truco';
  if ((!q.has('mercado') && !truco) || window.name === 'cv-ventana' || window.top !== window) return;
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
  if (truco) { location.replace('/?jugar=truco&volver=' + encodeURIComponent(location.href)); return; }
  var id = q.get('mercado');
  var dom = location.hostname.replace(/^chat\./, '');
  location.replace('https://' + dom + '/marketplace' + (/^\d+$/.test(id || '') ? '?id=' + id : ''));
})();
