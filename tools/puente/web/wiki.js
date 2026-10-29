// La wiki de la web (circulovicioso.club/wiki), con lo que guarda CV Chat (wiki.js del puente).
// Una sola pagina de la web (wiki.html, con un <main id="wiki">) para todo:
//  /wiki                      portada (y ?buscar=, ?cambios=1, ?todas=1, ?aportar=1, ?revisar=1)
//  /wiki/<entrada>            una entrada (y ?editar=1, ?historial=1, ?version=<id>)
//  /wiki-categorias/<cat>     las entradas de una categoria
(function () {
  'use strict';
  var CHAT = new URL(document.currentScript.src).origin;
  var API = CHAT + '/puente/api/wiki/';
  var raiz = document.getElementById('wiki');
  if (!raiz) return;
  var q = new URLSearchParams(location.search);
  var ruta = location.pathname.replace(/\.html$/, '').replace(/\/+$/, '') || '/wiki';
  var lista = null; // la ultima respuesta de "lista": entradas, categorias, yo, pendientes

  // ── Ayudas ──
  function h(tag, attrs) {
    var e = document.createElement(tag);
    for (var k in (attrs || {})) {
      var v = attrs[k]; if (v == null || v === false) continue;
      if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v; else if (k === 'html') e.innerHTML = v;
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? '' : v);
    }
    for (var i = 2; i < arguments.length; i++) { var c = arguments[i]; if (c == null || c === false) continue; e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); }
    return e;
  }
  function api(p, body, raw) {
    var opt = { credentials: 'include', cache: 'no-store' };
    if (raw) { opt.method = 'POST'; opt.headers = { 'Content-Type': raw.type || 'image/jpeg' }; opt.body = raw; }
    else if (body) { opt.method = 'POST'; opt.headers = { 'Content-Type': 'application/json' }; opt.body = JSON.stringify(body); }
    return fetch(API + p, opt).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) { if (!r.ok) { var e = new Error(d.error || 'No se pudo. Probá de nuevo.'); e.status = r.status; e.data = d; throw e; } return d; });
    });
  }
  var fecha = function (t) { return new Date(t).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' }); };
  var fechaCorta = function (t) { return new Date(t).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' }); };
  var entrar = function () { return CHAT + '/?volver=' + encodeURIComponent(location.href); };
  var urlEntrada = function (slug) { return '/wiki/' + encodeURIComponent(slug); };
  function titulo(t) { document.title = (t ? t + ' · ' : '') + 'Wiki - Circulo Vicioso Club'; }
  function aviso(texto, tipo) { return h('p', { class: 'aviso' + (tipo ? ' aviso--' + tipo : '') }, texto); }
  function cargando() { return h('p', { class: 'chico wk-cargando' }, 'Cargando…'); }
  function frag() { var f = document.createDocumentFragment(); for (var i = 0; i < arguments.length; i++) { var x = arguments[i]; if (x != null) f.appendChild(typeof x === 'string' ? document.createTextNode(x) : x); } return f; }

  // ── El armado: costado (buscar, navegar, categorias) + lo principal ──
  var costado = h('aside', { class: 'wk-lado', 'aria-label': 'Wiki' });
  var principal = h('div', { class: 'wk-principal' });
  raiz.textContent = '';
  raiz.appendChild(h('div', { class: 'wk' }, costado, principal));

  function pintarCostado() {
    costado.textContent = '';
    costado.appendChild(h('form', { class: 'wk-buscar', role: 'search', action: '/wiki' },
      h('input', { class: 'input', type: 'search', name: 'buscar', placeholder: 'Buscar…', 'aria-label': 'Buscar en la wiki', value: q.get('buscar') || '' }),
      h('button', { class: 'btn btn--degrade', type: 'submit', 'aria-label': 'Buscar' }, '→')));
    var nav = h('nav', { class: 'wk-nav' });
    var item = function (t, href, extra) { nav.appendChild(h('a', { href: href, class: extra || null }, t)); };
    item('Portada', '/wiki');
    item('Todas las entradas', '/wiki?todas=1');
    item('Cambios recientes', '/wiki?cambios=1');
    nav.appendChild(h('a', { href: '#', onclick: function (e) { e.preventDefault(); azar(); } }, 'Una al azar'));
    item('+ Aportar un artículo', '/wiki?aportar=1', 'wk-nav__aportar');
    if (lista && lista.yo && lista.yo.admin) item('Revisar propuestas' + (lista.pendientes ? ' (' + lista.pendientes + ')' : ''), '/wiki?revisar=1', lista.pendientes ? 'wk-nav__alerta' : null);
    costado.appendChild(nav);
    if (lista && lista.categorias.length) {
      var ul = h('ul', { class: 'lista-limpia' });
      lista.categorias.forEach(function (c) { ul.appendChild(h('li', null, h('a', { href: '/wiki-categorias/' + c.slug }, c.nombre), h('span', { class: 'chico' }, ' ' + c.n))); });
      costado.appendChild(h('div', { class: 'wk-cats' }, h('p', { class: 'rotulo' }, 'categorías'), ul));
    }
    if (lista && !lista.yo) costado.appendChild(h('p', { class: 'chico wk-lado__sesion' }, h('a', { href: entrar() }, 'Iniciá sesión'), ' para aportar a la wiki.'));
  }
  function azar() {
    var e = (lista && lista.entradas) || [];
    if (e.length) location.href = urlEntrada(e[Math.floor(Math.random() * e.length)].slug);
  }

  // Una tarjeta de entrada (portada, categorias, busqueda)
  function tarjeta(w, pedazo) {
    return h('a', { class: 'wk-tarjeta', href: urlEntrada(w.slug) },
      w.imagen ? h('img', { src: w.imagen, alt: '', loading: 'lazy' }) : h('span', { class: 'wk-tarjeta__sin', 'aria-hidden': 'true' }, w.titulo.charAt(0)),
      h('span', { class: 'wk-tarjeta__texto' },
        h('span', { class: 'wk-tarjeta__titulo' }, w.titulo),
        w.categoria ? h('span', { class: 'rotulo' }, w.categoria) : null,
        (pedazo || w.resumen) ? h('span', { class: 'wk-tarjeta__resumen' }, pedazo || w.resumen) : null));
  }
  function grilla(entradas, vacia) {
    if (!entradas.length) return h('p', { class: 'chico' }, vacia || 'No hay nada por acá todavía.');
    var g = h('div', { class: 'wk-grilla' });
    entradas.forEach(function (w) { g.appendChild(tarjeta(w)); });
    return g;
  }
  function cabecera(rotulo, t, bajada) {
    return h('header', { class: 'wk-cab' }, h('p', { class: 'rotulo' }, rotulo), h('h1', { class: 'titulo' }, t), bajada ? h('p', { class: 'wk-cab__bajada' }, bajada) : null);
  }

  // ── Portada ──
  function portada() {
    titulo('');
    var n = lista.entradas.length;
    principal.appendChild(h('section', { class: 'caja wk-portada' },
      h('div', { class: 'caja__cuerpo' },
        cabecera('wiki', 'La wiki del Círculo', 'La enciclopedia del club: el lore, los efectos, los personajes y todo lo que hay que saber. La escribe la comunidad.'),
        h('p', { class: 'wk-portada__n' }, (n === 1 ? '1 artículo' : n + ' artículos') + (lista.categorias.length ? ' · ' + lista.categorias.length + (lista.categorias.length === 1 ? ' categoría' : ' categorías') : '')),
        h('div', { class: 'wk-portada__acciones' }, h('a', { class: 'btn btn--degrade', href: '/wiki?aportar=1' }, 'Aportar un artículo'), h('a', { class: 'btn', href: '/wiki?todas=1' }, 'Ver todas')))));
    lista.categorias.forEach(function (c) {
      var de = lista.entradas.filter(function (w) { return w.categoriaSlug === c.slug; });
      principal.appendChild(h('section', { class: 'wk-bloque' },
        h('h2', { class: 'wk-bloque__t' }, h('a', { href: '/wiki-categorias/' + c.slug }, c.nombre), h('span', { class: 'chico' }, ' ' + c.n)), grilla(de.slice(0, 6))));
    });
    if (!n) principal.appendChild(aviso('La wiki está vacía. ¡Escribí la primera entrada!'));
  }

  function todas() {
    titulo('Todas las entradas');
    principal.appendChild(cabecera('wiki', 'Todas las entradas', lista.entradas.length + ' artículos, de la A a la Z.'));
    var porLetra = {};
    lista.entradas.forEach(function (w) { var l = w.titulo.normalize('NFD').charAt(0).toUpperCase(); (porLetra[l] = porLetra[l] || []).push(w); });
    var box = h('div', { class: 'wk-az' });
    Object.keys(porLetra).sort().forEach(function (l) {
      var ul = h('ul', { class: 'lista-limpia' });
      porLetra[l].forEach(function (w) { ul.appendChild(h('li', null, h('a', { href: urlEntrada(w.slug) }, w.titulo), w.categoria ? h('span', { class: 'chico' }, ' · ' + w.categoria) : null)); });
      box.appendChild(h('div', { class: 'wk-az__letra' }, h('h2', null, l), ul));
    });
    principal.appendChild(box);
  }

  function categoria(slug) {
    var c = lista.categorias.find(function (x) { return x.slug === slug; });
    var de = lista.entradas.filter(function (w) { return w.categoriaSlug === slug; });
    titulo(c ? c.nombre : 'Categoría');
    principal.appendChild(cabecera('categoría', c ? c.nombre : slug, de.length ? (de.length === 1 ? '1 artículo' : de.length + ' artículos') : null));
    principal.appendChild(grilla(de, 'No hay entradas en esta categoría.'));
  }

  function buscar(t) {
    titulo('Buscar: ' + t);
    principal.appendChild(cabecera('buscar', '“' + t + '”'));
    var box = h('div', null, cargando()); principal.appendChild(box);
    api('buscar?q=' + encodeURIComponent(t)).then(function (d) {
      box.textContent = '';
      var exacta = d.resultados.find(function (w) { return w.titulo.toLowerCase() === t.toLowerCase(); });
      if (!d.resultados.length) box.appendChild(aviso('No encontramos nada con “' + t + '”.'));
      if (!exacta) box.appendChild(h('p', { class: 'wk-crear' }, 'No hay una entrada que se llame así. ', h('a', { href: '/wiki?aportar=1&titulo=' + encodeURIComponent(t) }, '¿La escribís vos?')));
      if (d.resultados.length) {
        var g = h('div', { class: 'wk-resultados' });
        d.resultados.forEach(function (w) { g.appendChild(tarjeta(w, w.pedazo)); });
        box.appendChild(g);
      }
    }).catch(function (e) { box.textContent = ''; box.appendChild(aviso(e.message, 'mal')); });
  }

  function cambios() {
    titulo('Cambios recientes');
    principal.appendChild(cabecera('wiki', 'Cambios recientes'));
    var box = h('div', null, cargando()); principal.appendChild(box);
    api('cambios').then(function (d) {
      box.textContent = '';
      if (!d.cambios.length) return box.appendChild(aviso('Todavía no hay cambios.'));
      var ul = h('ul', { class: 'lista-limpia wk-cambios' });
      d.cambios.forEach(function (c) {
        ul.appendChild(h('li', null,
          h('span', { class: 'wk-cambios__fecha chico' }, fechaCorta(c.fecha)),
          h('span', null, h('a', { href: urlEntrada(c.slug) }, c.titulo), ' ', h('span', { class: 'chico' }, (c.nueva ? 'nueva entrada' : 'edición') + ' de ' + c.autor), c.nota ? h('span', { class: 'chico' }, ' · ' + c.nota) : null),
          h('a', { class: 'chico', href: urlEntrada(c.slug) + '?version=' + c.id }, 'ver')));
      });
      box.appendChild(ul);
    }).catch(function (e) { box.textContent = ''; box.appendChild(aviso(e.message, 'mal')); });
  }

  // ── Una entrada ──
  function pestanas(slug, actual) {
    var t = function (txt, href, k) { return h('a', { href: href, class: 'wk-pest' + (k === actual ? ' is-actual' : ''), 'aria-current': k === actual ? 'page' : null }, txt); };
    return h('nav', { class: 'wk-pestanas', 'aria-label': 'Entrada' },
      t('Leer', urlEntrada(slug), 'leer'), t('Editar', urlEntrada(slug) + '?editar=1', 'editar'), t('Historial', urlEntrada(slug) + '?historial=1', 'historial'));
  }
  function noExiste(slug) {
    titulo('No encontrada');
    var t = decodeURIComponent(slug).replace(/-/g, ' ');
    principal.appendChild(h('article', { class: 'caja wk-art' }, h('div', { class: 'caja__cuerpo' },
      cabecera('wiki', 'Esta entrada no existe'),
      h('p', null, 'Todavía nadie escribió sobre “' + t + '”.'),
      h('div', { class: 'wk-portada__acciones' }, h('a', { class: 'btn btn--degrade', href: '/wiki?aportar=1&titulo=' + encodeURIComponent(t.charAt(0).toUpperCase() + t.slice(1)) }, 'Escribirla'), h('a', { class: 'btn', href: '/wiki?buscar=' + encodeURIComponent(t) }, 'Buscar parecidas')))));
  }
  function entrada(slug) {
    var box = cargando(); principal.appendChild(box);
    api('entrada?slug=' + encodeURIComponent(slug)).then(function (d) {
      box.remove();
      var w = d.entrada;
      if (q.get('editar')) return editor(w);
      if (q.get('historial')) return historial(w, d.historial);
      var vid = q.get('version');
      var p = vid ? api('version?id=' + encodeURIComponent(vid)).then(function (r) { return r.version; }).catch(function () { return null; }) : Promise.resolve(null);
      return p.then(function (v) { leer(w, d, v); });
    }).catch(function (e) { box.remove(); if (e.status === 404) noExiste(slug); else principal.appendChild(aviso(e.message, 'mal')); });
  }
  function leer(w, d, v) {
    var ver = v || w;
    titulo(ver.titulo);
    var art = h('article', { class: 'caja wk-art' });
    art.appendChild(pestanas(w.slug, 'leer'));
    var cuerpo = h('div', { class: 'caja__cuerpo wk-art__cuerpo' });
    cuerpo.appendChild(h('p', { class: 'rotulo wk-miga' }, h('a', { href: '/wiki' }, 'wiki'), w.categoria ? frag(' › ', h('a', { href: '/wiki-categorias/' + w.categoriaSlug }, w.categoria)) : null));
    cuerpo.appendChild(h('h1', { class: 'titulo wk-art__titulo' }, ver.titulo));
    if (v) {
      var b = h('div', { class: 'aviso' }, 'Estás viendo la versión del ' + fecha(v.fecha) + ' (de ' + v.autor + (v.estado === 'pendiente' ? ', todavía sin aprobar' : v.estado === 'rechazada' ? ', no aprobada' : '') + '). ', h('a', { href: urlEntrada(w.slug) }, 'Ver la actual'));
      if (d.yo && d.yo.admin && v.estado === 'aprobada') b.appendChild(h('button', { class: 'btn btn--chico wk-volver', type: 'button', onclick: function (e) { e.target.disabled = true; api('volver', { id: v.id }).then(function () { location.href = urlEntrada(w.slug); }).catch(function (er) { alert(er.message); e.target.disabled = false; }); } }, 'Volver a esta versión'));
      cuerpo.appendChild(b);
    }
    if (w.borrada) cuerpo.appendChild(aviso('Esta entrada está sacada de la wiki: solo la ven los administradores.', 'mal'));
    // La ficha (como en las wikis): foto y datos
    var otros = (w.editores || []).filter(function (n) { return n !== w.autor; });
    var ficha = h('aside', { class: 'wk-ficha' },
      ver.imagen ? h('img', { src: ver.imagen, alt: ver.titulo }) : null,
      h('p', { class: 'wk-ficha__t' }, ver.titulo),
      h('dl', null,
        w.categoria ? h('dt', null, 'Categoría') : null, w.categoria ? h('dd', null, h('a', { href: '/wiki-categorias/' + w.categoriaSlug }, w.categoria)) : null,
        h('dt', null, 'Escrita por'), h('dd', null, w.autor),
        otros.length ? h('dt', null, 'Aportes de') : null, otros.length ? h('dd', null, otros.join(', ')) : null,
        h('dt', null, 'Actualizada'), h('dd', null, fecha(w.actualizada))));
    var texto = h('div', { class: 'wk-texto', html: v ? v.html : w.html });
    var heads = texto.querySelectorAll('h2[id], h3[id], h4[id]');
    var indice = null;
    if (heads.length >= 2) {
      var ol = h('ol', null);
      heads.forEach(function (x) { ol.appendChild(h('li', { class: 'wk-indice__' + x.tagName.toLowerCase() }, h('a', { href: '#' + x.id }, x.textContent))); });
      indice = h('nav', { class: 'wk-indice', 'aria-label': 'Contenido' }, h('p', { class: 'rotulo' }, 'contenido'), ol);
    }
    cuerpo.appendChild(h('div', { class: 'wk-art__contenido' }, ficha, indice, texto));
    // Pie: categoria y relacionadas
    var pie = h('footer', { class: 'wk-art__pie' });
    if (w.categoria) pie.appendChild(h('p', null, h('span', { class: 'rotulo' }, 'categoría: '), h('a', { class: 'wk-chip', href: '/wiki-categorias/' + w.categoriaSlug }, w.categoria)));
    if (d.relacionadas.length) {
      var rel = h('p', null, h('span', { class: 'rotulo' }, 'también en ' + w.categoria + ': '));
      d.relacionadas.forEach(function (r, i) { if (i) rel.appendChild(document.createTextNode(' · ')); rel.appendChild(h('a', { href: urlEntrada(r.slug) }, r.titulo)); });
      pie.appendChild(rel);
    }
    pie.appendChild(h('p', { class: 'chico' }, '¿Falta algo o hay un error? ', h('a', { href: urlEntrada(w.slug) + '?editar=1' }, 'Sugerí una edición'), '.'));
    if (d.yo && d.yo.admin) pie.appendChild(h('p', null, h('button', { class: 'btn btn--chico btn--peligro', type: 'button', onclick: function () {
      if (!w.borrada && !confirm('¿Sacar esta entrada de la wiki? Se puede volver a poner.')) return;
      api('borrar', { slug: w.slug, volver: w.borrada }).then(function () { location.reload(); }).catch(function (e) { alert(e.message); });
    } }, w.borrada ? 'Volver a poner en la wiki' : 'Sacar de la wiki')));
    cuerpo.appendChild(pie);
    art.appendChild(cuerpo);
    principal.appendChild(art);
    if (location.hash) { var t = document.getElementById(decodeURIComponent(location.hash.slice(1))); if (t) setTimeout(function () { t.scrollIntoView(); }, 50); }
  }

  // Diferencias por renglon (lo que sale en rosa, lo que entra en verde)
  function diff(a, b) {
    var A = String(a || '').split('\n'), B = String(b || '').split('\n'), n = A.length, m = B.length;
    var L = []; for (var i = 0; i <= n; i++) L.push(new Int32Array(m + 1));
    for (i = n - 1; i >= 0; i--) for (var j = m - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    var box = h('div', { class: 'wk-diff' }); i = 0; j = 0;
    var linea = function (c, t) { box.appendChild(h('div', { class: c }, t || ' ')); };
    while (i < n && j < m) { if (A[i] === B[j]) { linea('wk-diff__igual', A[i]); i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) linea('wk-diff__sale', A[i++]); else linea('wk-diff__entra', B[j++]); }
    while (i < n) linea('wk-diff__sale', A[i++]); while (j < m) linea('wk-diff__entra', B[j++]);
    return box;
  }

  function historial(w, hist) {
    titulo('Historial de ' + w.titulo);
    var art = h('article', { class: 'caja wk-art' }, pestanas(w.slug, 'historial'));
    var cuerpo = h('div', { class: 'caja__cuerpo' }, h('p', { class: 'rotulo' }, 'historial'), h('h1', { class: 'titulo wk-art__titulo' }, w.titulo));
    var EST = { aprobada: '', pendiente: 'sin aprobar', rechazada: 'no aprobada' };
    var ul = h('ol', { class: 'lista-limpia wk-hist' });
    hist.forEach(function (r) {
      ul.appendChild(h('li', null,
        h('a', { href: urlEntrada(w.slug) + '?version=' + r.id }, fecha(r.fecha)),
        h('span', null, ' · ' + r.autor),
        r.actual ? h('span', { class: 'wk-chip' }, 'actual') : EST[r.estado] ? h('span', { class: 'wk-chip wk-chip--gris' }, EST[r.estado]) : null));
    });
    cuerpo.appendChild(hist.length ? ul : h('p', { class: 'chico' }, 'Sin cambios todavía.'));
    art.appendChild(cuerpo); principal.appendChild(art);
  }

  // ── Escribir o editar ──
  function editor(w) {
    var nueva = !w;
    titulo(nueva ? 'Aportar un artículo' : 'Editar ' + w.titulo);
    var art = h('article', { class: 'caja wk-art' });
    if (!nueva) art.appendChild(pestanas(w.slug, 'editar'));
    var cuerpo = h('div', { class: 'caja__cuerpo' });
    cuerpo.appendChild(h('p', { class: 'rotulo' }, nueva ? 'aportar' : 'sugerí una edición'));
    cuerpo.appendChild(h('h1', { class: 'titulo wk-art__titulo' }, nueva ? 'Un artículo nuevo' : w.titulo));
    art.appendChild(cuerpo); principal.appendChild(art);
    if (!lista.yo) {
      cuerpo.appendChild(h('p', null, 'Para aportar a la wiki entrá con tu cuenta de Círculo Vicioso (la misma del chat y del foro).'));
      cuerpo.appendChild(h('a', { class: 'btn btn--degrade', href: entrar() }, 'Iniciar sesión o registrarte'));
      return;
    }
    cuerpo.appendChild(h('p', { class: 'chico' }, lista.yo.admin ? 'Sos administrador: se publica directo.' : 'Un administrador lo revisa antes de que aparezca en la wiki. Recordá: tiene que ser del lore del club y aportarle algo a quien lo lea.'));
    var imagen = w ? w.imagen : null;
    var tit = h('input', { class: 'input', maxlength: '120', required: true, value: w ? w.titulo : (q.get('titulo') || '') });
    var cat = h('input', { class: 'input', maxlength: '40', list: 'wk-cats', placeholder: 'Lore, Efectos…', value: w ? (w.categoria || '') : '' });
    var dl = h('datalist', { id: 'wk-cats' }); lista.categorias.forEach(function (c) { dl.appendChild(h('option', { value: c.nombre })); });
    var txt = h('textarea', { class: 'textarea', maxlength: '60000', required: true, placeholder: 'Escribí acá. Podés usar # para títulos, **negrita**, *cursiva*, - listas y [enlaces](https://…).' });
    txt.value = w ? w.contenido : '';
    // Foto principal (la de la ficha)
    var foto = h('img', { class: 'wk-ed__foto', alt: '' });
    var fotoIn = h('input', { type: 'file', accept: 'image/*', class: 'wk-ed__archivo' });
    var sacar = h('button', { class: 'btn btn--chico', type: 'button' }, 'Sacar la foto');
    var pintarFoto = function () { foto.hidden = !imagen; sacar.hidden = !imagen; if (imagen) foto.src = imagen; };
    sacar.onclick = function () { imagen = null; pintarFoto(); };
    var subir = function (file) { return api('imagen', null, file).then(function (r) { return r.url; }); };
    fotoIn.onchange = function () { var file = fotoIn.files[0]; if (!file) return; subir(file).then(function (u) { imagen = u; pintarFoto(); }).catch(function (e) { alert(e.message); }); fotoIn.value = ''; };
    pintarFoto();
    // Barra de formato
    var envolver = function (a, b, ej) {
      var s = txt.selectionStart, e = txt.selectionEnd, sel = txt.value.slice(s, e) || ej;
      txt.setRangeText(a + sel + b, s, e, 'end'); txt.focus();
      txt.setSelectionRange(s + a.length, s + a.length + sel.length);
    };
    var linea = function (pre) { var s = txt.selectionStart; var ini = txt.value.lastIndexOf('\n', s - 1) + 1; txt.setRangeText(pre, ini, ini, 'end'); txt.focus(); };
    var fotoTexto = h('input', { type: 'file', accept: 'image/*', hidden: true });
    fotoTexto.onchange = function () { var file = fotoTexto.files[0]; if (!file) return; subir(file).then(function (u) { txt.setRangeText('\n![](' + u + ')\n', txt.selectionStart, txt.selectionEnd, 'end'); }).catch(function (e) { alert(e.message); }); fotoTexto.value = ''; };
    var bot = function (t, nombre, fn) { return h('button', { class: 'wk-ed__b', type: 'button', title: nombre, 'aria-label': nombre, onclick: fn }, t); };
    var barra = h('div', { class: 'wk-ed__barra', role: 'toolbar', 'aria-label': 'Formato' },
      bot('T', 'Título', function () { linea('# '); }), bot('B', 'Negrita', function () { envolver('**', '**', 'negrita'); }), bot('I', 'Cursiva', function () { envolver('*', '*', 'cursiva'); }),
      bot('•', 'Lista', function () { linea('- '); }), bot('❝', 'Cita', function () { linea('> '); }),
      bot('↗', 'Enlace', function () { var u = prompt('Dirección del enlace', 'https://'); if (u) envolver('[', '](' + u + ')', 'texto'); }),
      bot('▣', 'Foto en el texto', function () { fotoTexto.click(); }), fotoTexto);
    var vista = h('div', { class: 'wk-texto wk-ed__vista', hidden: true });
    var escBtn = h('button', { class: 'wk-ed__tab is-actual', type: 'button' }, 'Escribir'), verBtn = h('button', { class: 'wk-ed__tab', type: 'button' }, 'Vista previa');
    escBtn.onclick = function () { vista.hidden = true; txt.hidden = false; barra.hidden = false; escBtn.classList.add('is-actual'); verBtn.classList.remove('is-actual'); };
    verBtn.onclick = function () {
      vista.hidden = false; txt.hidden = true; barra.hidden = true; verBtn.classList.add('is-actual'); escBtn.classList.remove('is-actual');
      vista.textContent = 'Cargando…';
      api('vista', { contenido: txt.value }).then(function (r) { vista.innerHTML = r.html || '<p class="chico">(vacío)</p>'; }).catch(function (e) { vista.textContent = e.message; });
    };
    var enviar = h('button', { class: 'btn btn--rosa', type: 'submit' }, lista.yo.admin ? 'Publicar' : (nueva ? 'Proponer el artículo' : 'Proponer la edición'));
    var estado = h('div', { class: 'wk-ed__estado', 'aria-live': 'polite' });
    var campo = function (t, el) { return h('label', { class: 'campo' }, h('span', null, t), el); };
    var form = h('form', { class: 'wk-ed' },
      h('div', { class: 'wk-ed__fila' }, campo('título', tit), campo('categoría', cat), dl),
      h('div', { class: 'campo' }, h('span', null, 'foto principal (opcional)'), h('div', { class: 'wk-ed__fotobox' }, foto, h('div', null, fotoIn, sacar))),
      h('div', { class: 'campo' }, h('span', null, 'contenido'), h('div', { class: 'wk-ed__tabs' }, escBtn, verBtn), barra, txt, vista),
      h('div', { class: 'wk-ed__fin' }, enviar, h('a', { class: 'btn', href: nueva ? '/wiki' : urlEntrada(w.slug) }, 'Cancelar')),
      estado);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      enviar.disabled = true; estado.textContent = '';
      api('proponer', { slug: w ? w.slug : undefined, titulo: tit.value, categoria: cat.value, contenido: txt.value, imagen: imagen }).then(function (r) {
        form.remove();
        if (r.estado === 'publicada') cuerpo.appendChild(h('div', { class: 'aviso aviso--bien' }, 'Listo, ya está en la wiki. ', h('a', { href: urlEntrada(r.slug) }, 'Ver la entrada')));
        else cuerpo.appendChild(h('div', { class: 'aviso aviso--bien' }, '¡Gracias por tu aporte! Un administrador lo va a revisar y, si lo aprueba, aparece en la wiki. Podés ver cómo va en ', h('a', { href: '/cuenta' }, 'tu cuenta'), '.'));
      }).catch(function (er) {
        enviar.disabled = false;
        estado.appendChild(aviso(er.message, 'mal'));
        if (er.data && er.data.slug) estado.appendChild(h('a', { href: urlEntrada(er.data.slug) + '?editar=1' }, 'Editar esa entrada'));
      });
    });
    cuerpo.appendChild(form);
  }

  // ── Revisar (administradores) ──
  function revisar() {
    titulo('Revisar propuestas');
    principal.appendChild(cabecera('administradores', 'Propuestas por revisar'));
    if (!lista.yo || !lista.yo.admin) return principal.appendChild(aviso('Esto es solo para los administradores.', 'mal'));
    var box = h('div', null, cargando()); principal.appendChild(box);
    api('pendientes').then(function (d) {
      box.textContent = '';
      if (!d.pendientes.length) return box.appendChild(aviso('No hay nada por revisar.'));
      d.pendientes.forEach(function (p) {
        var card = h('article', { class: 'caja wk-prop' });
        var c = h('div', { class: 'caja__cuerpo' });
        c.appendChild(h('p', { class: 'rotulo' }, p.nueva ? 'entrada nueva' : 'edición'));
        c.appendChild(h('h2', { class: 'titulo-2' }, p.nueva ? p.titulo : h('a', { href: urlEntrada(p.slug) }, p.antes.titulo)));
        c.appendChild(h('p', { class: 'chico' }, (p.autor || '?') + ' · ' + fecha(p.creada) + (p.categoria ? ' · ' + p.categoria : '')));
        if (p.desactualizada) c.appendChild(aviso('Ojo: la entrada cambió después de que se escribió esta propuesta.'));
        if (!p.nueva) {
          if (p.titulo !== p.antes.titulo) c.appendChild(h('p', null, 'Título: “' + p.antes.titulo + '” → “' + p.titulo + '”'));
          if ((p.categoria || '') !== (p.antes.categoria || '')) c.appendChild(h('p', null, 'Categoría: ' + (p.antes.categoria || '(ninguna)') + ' → ' + (p.categoria || '(ninguna)')));
          if ((p.imagen || '') !== (p.antes.imagen || '')) c.appendChild(h('p', null, p.imagen ? 'Cambia la foto:' : 'Saca la foto.'));
          c.appendChild(diff(p.antes.contenido, p.contenido));
        } else c.appendChild(h('div', { class: 'wk-texto wk-prop__vista', html: p.html }));
        if (p.imagen && (p.nueva || p.imagen !== p.antes.imagen)) c.appendChild(h('img', { class: 'wk-ed__foto', src: p.imagen, alt: '' }));
        var est = h('p', { class: 'chico' });
        var ap = h('button', { class: 'btn btn--rosa', type: 'button' }, 'Aprobar'), re = h('button', { class: 'btn', type: 'button' }, 'Rechazar');
        ap.onclick = function () { ap.disabled = re.disabled = true; api('revisar', { id: p.id, accion: 'aprobar' }).then(function (r) { est.textContent = 'Aprobada. '; est.appendChild(h('a', { href: urlEntrada(r.slug) }, 'Ver la entrada')); card.classList.add('is-hecha'); }).catch(function (e) { est.textContent = e.message; ap.disabled = re.disabled = false; }); };
        re.onclick = function () { var nota = prompt('¿Por qué? (lo ve quien la propuso; podés dejarlo vacío)', ''); if (nota === null) return; ap.disabled = re.disabled = true; api('revisar', { id: p.id, accion: 'rechazar', nota: nota }).then(function () { est.textContent = 'Rechazada.'; card.classList.add('is-hecha'); }).catch(function (e) { est.textContent = e.message; ap.disabled = re.disabled = false; }); };
        c.appendChild(h('div', { class: 'wk-prop__botones' }, ap, re)); c.appendChild(est);
        card.appendChild(c); box.appendChild(card);
      });
    }).catch(function (e) { box.textContent = ''; box.appendChild(aviso(e.message, 'mal')); });
  }

  // ── Arranque ──
  principal.appendChild(cargando());
  api('lista').then(function (d) {
    lista = d; principal.textContent = '';
    pintarCostado();
    var m;
    if (ruta === '/wiki' || ruta === '/wiki/index') {
      if (q.get('aportar')) editor(null);
      else if (q.get('revisar') || q.get('pendientes')) revisar();
      else if (q.get('cambios')) cambios();
      else if (q.get('todas')) todas();
      else if (q.get('buscar')) buscar(q.get('buscar'));
      else portada();
    } else if ((m = ruta.match(/^\/wiki-categorias\/([^/]+)$/))) categoria(decodeURIComponent(m[1]));
    else if ((m = ruta.match(/^\/wiki\/([^/]+)$/))) entrada(decodeURIComponent(m[1]));
    else portada();
  }).catch(function () { principal.textContent = ''; principal.appendChild(aviso('No se pudo cargar la wiki. Probá de nuevo en un momento.', 'mal')); });
})();
