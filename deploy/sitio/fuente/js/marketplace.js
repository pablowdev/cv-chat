// El Marketplace en la web (circulovicioso.club/marketplace): las publicaciones de CV Chat (mercado.js del
// puente), solo para miembros, con la cuenta unica. Publicar y escribirle se hace en la app.
(function () {
  'use strict';
  var CHAT = 'https://chat.circulovicioso.club';
  var $ = function (id) { return document.getElementById(id); };
  var PRECIO = { ARS: '$', USD: 'US$', USDT: 'USDT ' };
  var desde = 0, fase = 'activas';

  function api(p) {
    return fetch(CHAT + p, { credentials: 'include', cache: 'no-store' }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) { if (!r.ok) { var e = new Error(d.error || 'No se pudo.'); e.status = r.status; throw e; } return d; });
    });
  }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function precio(it) { return it.estado === 'vendida' ? 'Vendido' : it.precio == null ? 'A convenir' : PRECIO[it.moneda || 'ARS'] + Number(it.precio).toLocaleString('es-AR'); }
  function hace(ms) {
    var d = Math.floor((Date.now() - ms) / 864e5);
    if (d >= 365) { var a = Math.floor(d / 365); return 'hace ' + a + (a === 1 ? ' año' : ' años'); }
    if (d >= 60) return 'hace ' + Math.floor(d / 30) + ' meses';
    return d < 1 ? 'hoy' : d === 1 ? 'ayer' : 'hace ' + d + ' días';
  }
  var app = function (id) { return CHAT + '/app?mercado=' + (id || ''); };

  function sinSesion() {
    $('cargando').hidden = true; $('mk').hidden = true; $('mk-item').hidden = true; $('sin-sesion').hidden = false;
    var aca = encodeURIComponent(location.href);
    $('s-entrar').href = CHAT + '/?volver=' + aca;
    $('s-registro').href = CHAT + '/?registro=1&volver=' + aca;
  }
  function fallo(e) {
    if (e.status === 401) return sinSesion();
    $('cargando').hidden = true;
    $('mk').hidden = false;
    $('mk-estado').textContent = e.message === 'Failed to fetch' ? 'No hay conexión con el chat. Probá de nuevo en un rato.' : e.message;
  }

  // ── La lista ──
  function tarjeta(it) {
    var li = el('li', 'mk-card' + (it.estado === 'vendida' ? ' is-vendida' : it.vencida ? ' is-vencida' : ''));
    var a = el('a'); a.href = '/marketplace?id=' + it.id;
    a.addEventListener('click', function (ev) { if (ev.ctrlKey || ev.metaKey || ev.shiftKey) return; ev.preventDefault(); history.pushState(null, '', a.href); ver(); });
    var f = el('div', 'mk-card__foto');
    if (it.foto) { var i = el('img'); i.src = it.foto; i.alt = ''; i.loading = 'lazy'; f.appendChild(i); }
    else f.appendChild(el('span', '', it.tipo === 'servicio' ? 'servicio' : 'sin foto'));
    if (it.vencida && it.estado === 'activa') f.appendChild(el('span', 'mk-card__sello', 'vencida'));
    a.appendChild(f);
    var b = el('div', 'mk-card__datos');
    b.appendChild(el('p', 'mk-card__precio', precio(it)));
    b.appendChild(el('p', 'mk-card__titulo', it.titulo));
    b.appendChild(el('p', 'chico', [it.zona, hace(it.renovado)].filter(Boolean).join(' · ')));
    a.appendChild(b);
    li.appendChild(a);
    return li;
  }
  function pedirLista(mas) {
    var q = new URLSearchParams(location.search), p = new URLSearchParams();
    var mias = q.get('ver') === 'mias';
    ['q', 'tipo', 'orden', 'ver'].forEach(function (k) { if (q.get(k)) p.set(k, q.get(k)); });
    if (!mas) { desde = 0; fase = 'activas'; }
    if (fase === 'vencidas') p.set('ver', 'vencidas');
    p.set('desde', String(desde));
    return api('/puente/api/mercado/web/lista?' + p).then(function (d) {
      $('cargando').hidden = true; $('mk').hidden = false; $('mk-item').hidden = true;
      var g = $('mk-grilla'), vg = $('mk-vgrilla');
      if (!mas) { g.textContent = ''; vg.textContent = ''; $('mk-vencidas').hidden = true; }
      d.items.forEach(function (it) { (fase === 'vencidas' ? vg : g).appendChild(tarjeta(it)); });
      desde += d.items.length;
      if (fase === 'vencidas' && vg.children.length) $('mk-vencidas').hidden = false;
      // Terminadas las activas, siguen las vencidas (no en "Mis publicaciones", que ya las muestra)
      if (!d.mas && fase === 'activas' && !mias) { fase = 'vencidas'; desde = 0; return pedirLista(true); }
      $('mk-mas').hidden = !d.mas;
      $('mk-mias').textContent = mias ? 'Ver todo' : 'Mis publicaciones';
      $('mk-mias').href = mias ? '/marketplace' : '?ver=mias';
      var activas = g.children.length;
      $('mk-estado').textContent = activas ? '' : mias ? 'Todavía no publicaste nada. Se publica desde CV Chat.'
        : q.get('q') || q.get('tipo') ? 'No hay publicaciones activas con eso.' : vg.children.length ? 'No hay publicaciones activas ahora.' : 'Todavía no hay publicaciones.';
      document.title = (mias ? 'Mis publicaciones · ' : '') + 'Marketplace - Círculo Vicioso Club';
    });
  }

  // ── Una publicacion ──
  function verItem(id) {
    return api('/puente/api/mercado/web/item?id=' + encodeURIComponent(id)).then(function (d) {
      var it = d.item;
      $('cargando').hidden = true; $('mk').hidden = true; $('mk-item').hidden = false;
      document.title = it.titulo + ' · Marketplace - Círculo Vicioso Club';
      $('mk-i-tipo').textContent = it.tipo === 'servicio' ? 'servicio' : it.condicion || 'producto';
      $('mk-i-titulo').textContent = it.titulo;
      $('mk-i-precio').textContent = precio(it);
      $('mk-i-linea').textContent = [it.zona, 'publicado ' + hace(it.renovado)].filter(Boolean).join(' · ');
      // Vencida: sigue a la vista, con su aviso. La de alguien del foro sin cuenta ya no se puede consultar
      var vencida = it.vencida && it.estado === 'activa', sinCuenta = !!(it.foro && it.foro.sinCuenta);
      $('mk-i-aviso').hidden = !vencida;
      $('mk-i-aviso').textContent = !vencida ? '' : it.mia ? 'Venció: ya no aparece entre las activas. Republicala con un toque desde CV Chat y vuelve arriba de todo.'
        : sinCuenta ? 'Publicado en el foro en ' + new Date(it.creado).getFullYear() + ': ya no está disponible.'
          : 'Vencida: no se renovó en 30 días, así que puede que ya no esté disponible. Preguntale a quien la publicó.';
      document.querySelector('.mk-item').classList.toggle('is-vencida', vencida);
      var t = $('mk-i-texto'); t.textContent = '';
      (it.descripcion || '').split(/\n{2,}/).forEach(function (par) { if (par.trim()) t.appendChild(el('p', '', par)); });
      var foto = $('mk-i-foto'), minis = $('mk-i-minis'); minis.textContent = '';
      var fotos = it.fotos || [];
      foto.hidden = !fotos.length; if (fotos.length) foto.src = fotos[0];
      document.querySelector('.mk-item__cuerpo').classList.toggle('sin-fotos', !fotos.length);
      if (fotos.length > 1) fotos.forEach(function (src, n) {
        var b = el('button', n ? '' : 'is-actual'); b.type = 'button'; b.setAttribute('aria-label', 'Foto ' + (n + 1));
        var i = el('img'); i.src = src; i.alt = ''; b.appendChild(i);
        b.addEventListener('click', function () { foto.src = src; minis.querySelectorAll('button').forEach(function (x) { x.className = x === b ? 'is-actual' : ''; }); });
        minis.appendChild(b);
      });
      var v = $('mk-i-vendedor'); v.textContent = '';
      if (it.vendedor) {
        var av = el('div', 'mk-item__avatar');
        if (it.vendedor.avatar) { var im = el('img'); im.src = it.vendedor.avatar; im.alt = ''; av.appendChild(im); } else av.textContent = (it.vendedor.nombre || '?').charAt(0).toUpperCase();
        v.appendChild(av);
        var info = el('div');
        info.appendChild(el('p', 'mk-item__nombre', it.vendedor.nombre + (it.vendedor.usuario ? ' (@' + it.vendedor.usuario + ')' : '')));
        var r = it.vendedor.reputacion;
        info.appendChild(el('p', 'chico', !r ? '' : r.porcentaje == null ? 'Sin opiniones todavía' : r.porcentaje + '% positivas · ' + r.positivas + ' 👍 · ' + r.negativas + ' 👎' + (r.ventas ? ' · ' + r.ventas + (r.ventas === 1 ? ' venta' : ' ventas') : '')));
        v.appendChild(info);
      }
      $('mk-i-escribir').hidden = it.mia || it.estado !== 'activa' || sinCuenta;
      $('mk-i-escribir').href = app(it.id);
      $('mk-i-abrir').href = app(it.id);
      $('mk-i-abrir').textContent = it.mia ? (vencida ? 'Republicar en CV Chat' : 'Editar en CV Chat') : 'Ver en CV Chat';
      $('mk-i-abrir').className = 'btn' + (it.mia && vencida ? ' btn--degrade' : '');
      window.scrollTo(0, 0);
    });
  }

  function ver() {
    var q = new URLSearchParams(location.search);
    $('mk-q').value = q.get('q') || ''; $('mk-tipo').value = q.get('tipo') || ''; $('mk-orden').value = q.get('orden') || '';
    return (/^\d+$/.test(q.get('id') || '') ? verItem(q.get('id')) : pedirLista(false)).catch(fallo);
  }

  $('mk-filtros').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var p = new URLSearchParams();
    if ($('mk-q').value.trim()) p.set('q', $('mk-q').value.trim());
    if ($('mk-tipo').value) p.set('tipo', $('mk-tipo').value);
    if ($('mk-orden').value) p.set('orden', $('mk-orden').value);
    history.pushState(null, '', '/marketplace' + (p.toString() ? '?' + p : ''));
    ver();
  });
  ['mk-tipo', 'mk-orden'].forEach(function (id) { $(id).addEventListener('change', function () { $('mk-filtros').requestSubmit(); }); });
  $('mk-mas').addEventListener('click', function () { $('mk-mas').disabled = true; pedirLista(true).catch(fallo).then(function () { $('mk-mas').disabled = false; }); });
  $('mk-mias').addEventListener('click', function (ev) { ev.preventDefault(); history.pushState(null, '', $('mk-mias').getAttribute('href')); ver(); });
  $('mk-volver').addEventListener('click', function (ev) {
    ev.preventDefault();
    history.pushState(null, '', '/marketplace'); ver();
  });
  window.addEventListener('popstate', ver);
  ver();
})();
