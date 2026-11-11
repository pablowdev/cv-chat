// Enlaces del chat abiertos sin la sesion de CV Chat (alguien que llega desde X, WhatsApp...):
//  - Al Marketplace (/app?mercado o /app?mercado=<id>): en vez de la pantalla de entrar, el Marketplace en
//    la web, que se ve sin cuenta (y "Escribirle" hace la cuenta y vuelve a la publicacion en el chat).
//  - A los juegos (/app?juegos): a su pagina, juegos.<dominio> (juegos.html), donde se elige uno.
//  - A la invitacion de X (/app?hola=<usuario>&invita=<quien>): a la pantalla de entrar, con "<quien> te invitó".
//  - A un juego o una mesa (/app?juegos=truco, ?truco=, ?funball=, ?ajedrez=, ?globalsiege=, ?pool=, ?juegos=worgs): a
//    la pantalla de entrar, a poner el nombre de invitado (login.js); despues vuelve ahi.
// Lo pone vincular.js en la cabeza de /app solo para esos enlaces, despues de origen.js (asi cuenta de donde
// llego) y antes que Haven, que sin sesion manda a "/". Si hay sesion en la web o el foro, primero entra
// con esa (como el login, cuenta.js) y sigue en el chat.
(function () {
  'use strict';
  var q = new URLSearchParams(location.search);
  var juegos = ['juegos', 'truco', 'funball', 'ajedrez', 'globalsiege', 'pool', 'shoppa', 'worgs'].some(function (k) { return q.has(k); });
  if ((!q.has('mercado') && !juegos && !q.has('hola')) || window.name === 'cv-ventana' || window.top !== window) return;
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
  // la invitacion de X (/app?hola=<usuario>&invita=<quien>): a la pantalla de entrar, con "<quien> te invitó" (login.js)
  if (q.has('hola')) { var inv = q.get('invita') || ''; location.replace('/' + (/^[\w.-]{1,40}$/.test(inv) ? '?invita=' + encodeURIComponent(inv) : '')); return; }
  var dom = location.hostname.replace(/^chat\./, '');
  // a los juegos en general: su pagina (juegos.<dominio>); a un juego o una mesa: a poner el nombre de invitado
  var uno = q.get('juegos') || ['truco', 'funball', 'ajedrez', 'globalsiege', 'pool'].some(function (k) { return q.has(k); });
  if (juegos && !uno) { location.replace('https://juegos.' + dom + '/'); return; }
  if (juegos) { location.replace('/?jugar=' + (q.has('truco') || q.get('juegos') === 'truco' ? 'truco' : 'juegos') + '&volver=' + encodeURIComponent(location.href)); return; }
  var id = q.get('mercado');
  location.replace('https://marketplace.' + dom + '/' + (/^\d+$/.test(id || '') ? '?id=' + id : ''));
})();
