// El foro se actualiza solo, como un chat (en el navegador y adentro de CV Chat). Lo carga el foro desde
// el "modulo de HTML de cabecera" (Constructor del sitio -> Publicidad), asi se prende y se apaga desde
// el panel. Cada 15 segundos, con la pestaña a la vista, pregunta a CV Chat cual es el ultimo tema o
// respuesta publico del foro (foro-lector.js); si cambio, trae otra vez la pagina y cambia solo lo nuevo:
//  - en un tema: las respuestas nuevas aparecen al final, marcadas un momento (si es la ultima pagina;
//    si no, un aviso para ir a la ultima)
//  - en la portada y en cada foro: las listas de foros y de temas
// No toca lo que se esta escribiendo.
(function () {
  'use strict';
  if (window.cvForoVivo) return;
  window.cvForoVivo = true;
  var API = 'https://chat.circulovicioso.club/puente/api/foro/vivo';
  var CADA = 15000;
  // pendiente: vueltas que quedan para buscar lo nuevo (vBulletin tarda hasta un par de minutos en
  // mostrarlo en las listas de la portada, y unos segundos en los temas)
  var ultimo = null, ocupado = false, pendiente = 0;

  var css = document.createElement('style');
  css.textContent = '@keyframes cv-vivo{from{background-color:rgba(238,45,111,.22)}to{background-color:transparent}}'
    + '.cv-vivo-nuevo{animation:cv-vivo 4s ease-out}'
    + '.cv-vivo-aviso{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:9999;padding:10px 18px;'
    + 'background:#ee2d6f;color:#f3f7e2!important;font:700 13px "Space Mono",monospace;text-transform:uppercase;'
    + 'letter-spacing:.04em;text-decoration:none!important;border:1px solid #f3f7e2;box-shadow:0 4px 16px rgba(0,0,0,.4)}';
  document.head.appendChild(css);

  var lista = function () { return document.querySelector('ul.conversation-list.thread-view'); };
  var hayProxima = function (doc) {
    var b = doc.querySelector('.js-pagenav-next-button');
    return !!(b && !b.classList.contains('h-hide-imp') && b.getAttribute('data-page') !== '0');
  };

  function avisar(texto, href) {
    if (document.querySelector('.cv-vivo-aviso')) return;
    var a = document.createElement('a');
    a.className = 'cv-vivo-aviso'; a.textContent = texto; a.href = href;
    document.body.appendChild(a);
  }

  // Un tema: las respuestas que todavia no estan, al final
  function tema(doc) {
    var ul = lista(), nuevo = doc.querySelector('ul.conversation-list.thread-view');
    if (!ul || !nuevo) return;
    if (hayProxima(document)) {
      var ult = doc.querySelector('.js-pagenav-last-button') || doc.querySelector('.js-pagenav-next-button');
      avisar('Hay respuestas nuevas →', ult && ult.href ? ult.href : location.href);
      return true;
    }
    var hay = {};
    ul.querySelectorAll('li.b-post[data-node-id]').forEach(function (li) { hay[li.getAttribute('data-node-id')] = 1; });
    var agregados = 0;
    nuevo.querySelectorAll(':scope > li.b-post[data-node-id]').forEach(function (li) {
      if (hay[li.getAttribute('data-node-id')]) return;
      var x = document.importNode(li, true);
      x.classList.add('cv-vivo-nuevo');
      ul.appendChild(x);
      agregados++;
    });
    // Se lleno la pagina: las que siguen van a la proxima
    if (hayProxima(doc)) {
      var p = doc.querySelector('.js-pagenav-next-button');
      if (p && p.href) avisar('Hay respuestas nuevas →', p.href);
    }
    if (agregados && window.twttr && window.twttr.widgets) window.twttr.widgets.load();
    return agregados > 0;
  }

  // La portada o un foro: las listas, una por una
  function listas(doc) {
    var cambio = false;
    ['table.forum-list-container', 'tbody.topic-list'].forEach(function (sel) {
      var viejos = document.querySelectorAll(sel), nuevos = doc.querySelectorAll(sel);
      if (viejos.length !== nuevos.length) return;
      viejos.forEach(function (v, i) {
        if (v.contains(document.activeElement) && document.activeElement !== document.body) return;
        if (v.innerHTML !== nuevos[i].innerHTML) { v.innerHTML = nuevos[i].innerHTML; cambio = true; }
      });
    });
    return cambio;
  }

  function actualizar() {
    ocupado = true;
    return fetch(location.href, { credentials: 'same-origin', cache: 'no-store' })
      .then(function (r) { return r.ok ? r.text() : Promise.reject(r.status); })
      .then(function (html) {
        var doc = new DOMParser().parseFromString(html, 'text/html');
        // En un tema, listo cuando aparece lo nuevo; en las listas se sigue mirando todas las vueltas
        // (vBulletin las reordena de a poco, y cualquier 'hace 5 minutos' ya es un cambio)
        if (lista()) { if (tema(doc)) pendiente = 0; else pendiente--; } else { listas(doc); pendiente--; }
      })
      .catch(function () { pendiente--; })
      .then(function () { ocupado = false; });
  }

  function consultar() {
    if (document.hidden || ocupado) return;
    if (pendiente > 0) { actualizar(); return; }
    fetch(API, { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d || typeof d.u !== 'number') return;
        if (ultimo === null) { ultimo = d.u; return; }
        if (d.u > ultimo) { ultimo = d.u; pendiente = 12; return actualizar(); }
      })
      .catch(function () { /* sin CV Chat: el foro anda igual, sin actualizarse solo */ });
  }

  // Solo donde hay algo que actualizar (un tema, la portada, un foro)
  if (!lista() && !document.querySelector('table.forum-list-container, tbody.topic-list')) return;
  setInterval(consultar, CADA);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) consultar(); });
  consultar();
})();
