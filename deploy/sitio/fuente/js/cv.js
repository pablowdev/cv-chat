// Lo comun de la web: las ultimas entradas de la wiki en la portada (las guarda CV Chat)
(function () {
  'use strict';
  var CHAT = 'https://chat.circulovicioso.club';
  var lista = document.getElementById('wiki-ultimas');
  if (!lista) return;
  fetch(CHAT + '/puente/api/wiki/lista', { credentials: 'include' }).then(function (r) { return r.json(); }).then(function (d) {
    lista.textContent = '';
    var ult = (d.entradas || []).slice().sort(function (a, b) { return b.actualizada - a.actualizada; }).slice(0, 5);
    if (!ult.length) { lista.innerHTML = '<li class="chico">Todavía no hay entradas. <a href="/wiki?aportar=1">Aportá la primera</a>.</li>'; return; }
    ult.forEach(function (w) {
      var li = document.createElement('li'), a = document.createElement('a');
      a.href = '/wiki/' + w.slug; a.textContent = w.titulo; li.appendChild(a);
      if (w.categoria) { var c = document.createElement('span'); c.className = 'chico'; c.textContent = ' · ' + w.categoria; li.appendChild(c); }
      lista.appendChild(li);
    });
  }).catch(function () { lista.innerHTML = '<li class="chico"><a href="/wiki">Ir a la wiki</a></li>'; });
})();
