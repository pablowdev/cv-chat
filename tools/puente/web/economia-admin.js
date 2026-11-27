/* Admin → Economía (la pestaña del panel de administradores, en un marco): las monedas del club. Una parte por vez,
   con las pestañas fijas arriba:
   - Resumen: los números, lo que entra cada día, los que más tienen, lo último y de dónde sale (con un toque se va a
     la parte de cada cosa). Los saldos que no cierran, como pendiente.
   - Movimientos: los más nuevos primero, con buscador por nombre (sin importar tildes) y filtros por lugar y por tipo.
     Tocando un nombre se ven solo los de esa cuenta.
   - Saldos: el de cada cuenta, con buscador, filtros (CV Club, los que no cierran) y orden.
   - Por origen: de dónde salen y en qué se gastan, en 24 horas, 7 días, 30 días o desde el principio.
   Lo que se está mirando (la parte, los filtros, cuánto se muestra, lo desplegado y por dónde iba la página en cada
   parte) queda guardado en la pestaña del navegador: al volver está igual. Se actualiza sola cada 30 segundos mientras
   se ve, sin mover la página (lo nuevo no empuja lo que se está leyendo) ni borrar lo que se está escribiendo.
   Los datos: /puente/api/admin/monedas, /movimientos, /saldos y /origen (monedas.js, solo administradores).
   Los nombres van siempre con textContent. */
(function () {
  'use strict';
  var API = '/puente/api/admin/monedas';
  var raiz = document.getElementById('c2');
  if (!raiz) return;

  function token() { try { return localStorage.getItem('haven_token') || ''; } catch (e) { return ''; } }
  function el(tag, cls, txt) { var n = document.createElement(tag); if (cls) n.className = cls; if (txt != null) n.textContent = txt; return n; }
  function boton(txt, cls, fn, titulo) { var b = el('button', cls, txt); b.type = 'button'; if (titulo) b.title = titulo; b.addEventListener('click', fn); return b; }
  var NS = 'http://www.w3.org/2000/svg';
  function sv(tag, at) { var n = document.createElementNS(NS, tag); for (var k in at || {}) n.setAttribute(k, at[k]); return n; }
  function num(n) { return (Number(n) || 0).toLocaleString('es-AR'); }
  function dosDig(n) { return (n < 10 ? '0' : '') + n; }
  function fechaHora(t) { var d = new Date(t); return dosDig(d.getDate()) + '/' + dosDig(d.getMonth() + 1) + ' ' + dosDig(d.getHours()) + ':' + dosDig(d.getMinutes()); }
  function hora(t) { var d = new Date(t); return dosDig(d.getHours()) + ':' + dosDig(d.getMinutes()); }
  function plural(n, uno, varios) { return num(n) + ' ' + (n === 1 ? uno : varios); }
  function sinTildes(s) { return String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
  function coincide(q, a, b) { var x = sinTildes(q).trim(); return !x || sinTildes(a).indexOf(x) >= 0 || sinTildes(b).indexOf(x) >= 0; }

  // como se dice cada cosa
  var TIPOS = {
    'bienvenida': 'Bienvenida', 'primer-paso': 'Primeros pasos', 'partida': 'Partida (jugar)', 'partida-ganada': 'Partida ganada',
    'compu': 'Contra la compu', 'compu-ganada': 'Le ganó a la compu', 'desafio': 'Juego del día', 'tiempo-hotel': 'Tiempo en CV Hotel',
    'dia-activo': 'Día activo', 'racha': 'Racha de 7 días', 'semanal': 'Días charlando (semana)', 'reacciones': 'Reacciones (semana)',
    'podio': 'Podio de la semana', 'invitacion': 'Invitaciones', 'ranking-primero': 'Primero en Curveball', 'cvclub': 'CV Club', 'conversion-hotel': 'Conversión del hotel', 'conversion-capa2': 'Conversión de Capa 2',
    'correccion': 'Corrección', 'hotel-compra': 'CV Hotel: compra', 'hotel-pintura': 'CV Hotel: pintura', 'hotel-regalia': 'CV Hotel: regalía',
    'hotel-aprobacion': 'CV Hotel: mueble aprobado', 'capa2-armeria': 'Capa 2: armería', 'capa2-encontrada': 'Capa 2: plata encontrada',
    'foro-tema': 'Tema en el foro', 'foro-respuesta': 'Respuesta en el foro', 'foro-respondido': 'Te respondieron en el foro', 'foro-megusta': 'Me gusta en el foro', 'foro-destacado': 'Tema destacado en el foro',
    'mercado-publicacion': 'Publicación en el Marketplace', 'mercado-venta': 'Venta en el Marketplace', 'mercado-compra': 'Compra en el Marketplace', 'mercado-opinion': 'Opinión en el Marketplace'
  };
  var ORIGENES = { chat: 'Chat', juegos: 'Juegos', hotel: 'CV Hotel', capa2: 'Capa 2', foro: 'Foro', mercado: 'Marketplace', admin: 'Admin', sistema: 'Sistema' };
  function tipoLindo(t) { return TIPOS[t] || (/^capa2-/.test(t) ? 'Capa 2: ' + t.slice(6) : /^hotel-/.test(t) ? 'CV Hotel: ' + t.slice(6) : t); }
  function lugar(o) { return ORIGENES[o] || o; }

  // ── Lo que se está mirando, guardado en la pestaña del navegador ──
  var CLAVE = 'cv-economia-admin-vista';
  var BASE = {
    tab: 'resumen', scroll: {}, abierto: {},
    mov: { q: '', uid: 0, quien: '', origen: '', tipo: '', n: 30 },
    sal: { q: '', f: 'todos', orden: 'saldo', n: 30 },
    ori: { periodo: '7', n: 15 }
  };
  var vista = (function () {
    var g = {};
    try { g = JSON.parse(sessionStorage.getItem(CLAVE) || '{}') || {}; } catch (e) { g = {}; }
    var v = {};
    Object.keys(BASE).forEach(function (k) {
      var b = BASE[k], x = g[k];
      v[k] = b && typeof b === 'object' ? Object.assign({}, b, x && typeof x === 'object' && !Array.isArray(x) ? x : {}) : (typeof x === typeof b ? x : b);
    });
    return v;
  })();
  function guardar() { try { sessionStorage.setItem(CLAVE, JSON.stringify(vista)); } catch (e) { /* sin almacenamiento */ } }

  var TABS = [['resumen', 'Resumen'], ['movimientos', 'Movimientos'], ['saldos', 'Saldos'], ['origen', 'Por origen']];
  function esTab(k) { return TABS.some(function (x) { return x[0] === k; }); }
  if (!esTab(vista.tab)) vista.tab = 'resumen';

  // ── Los datos: el resumen (siempre: tiene lo pendiente de las pestañas) y el de la parte que se mira ──
  var datos = { res: null, mov: null, sal: null, ori: null };
  var cuando = 0, intento = 0, fallo = '', cargando = false, nMov = 0, nOri = 0;
  function pedir(ruta) {
    return fetch(ruta, { headers: { Authorization: 'Bearer ' + token() }, cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); });
  }
  function rutaMov() {
    var m = vista.mov, p = ['n=' + Math.max(1, m.n | 0)];
    if (m.uid) p.push('uid=' + (m.uid | 0)); else if (String(m.q).trim()) p.push('q=' + encodeURIComponent(String(m.q).trim().slice(0, 60)));
    if (m.origen) p.push('origen=' + encodeURIComponent(m.origen));
    if (m.tipo) p.push('tipo=' + encodeURIComponent(m.tipo));
    return API + '/movimientos?' + p.join('&');
  }
  // (si se pidio otra cosa mientras tanto, lo que llega tarde no pisa lo nuevo)
  function traerParte(k) {
    if (k === 'movimientos') { var s = ++nMov; return pedir(rutaMov()).then(function (d) { if (s === nMov) datos.mov = d; }); }
    if (k === 'saldos') return pedir(API + '/saldos').then(function (d) { datos.sal = d; });
    if (k === 'origen') { var s2 = ++nOri; return pedir(API + '/origen?periodo=' + encodeURIComponent(vista.ori.periodo)).then(function (d) { if (s2 === nOri) datos.ori = d; }); }
    return Promise.resolve();
  }
  function tiene(k) { return k === 'resumen' ? !!datos.res : k === 'movimientos' ? !!datos.mov : k === 'saldos' ? !!datos.sal : !!datos.ori; }
  function mensajeDe(e) { return e === 403 ? 'Solo para administradores.' : e === 401 ? 'Se cerró tu sesión: volvé a entrar.' : 'No se pudo actualizar.'; }
  // aMano: lo pidio quien mira (el boton Actualizar): se pinta aunque este en un campo
  function cargar(aMano) {
    if (cargando) return;
    cargando = true; intento = Date.now();
    if (aMano) raiz.classList.add('c2-cargando');
    Promise.all([pedir(API).then(function (d) { datos.res = d; cuando = Date.now(); }), traerParte(vista.tab)])
      .then(function () { fallo = ''; }, function (e) { fallo = mensajeDe(e); })
      .then(function () {
        cargando = false; raiz.classList.remove('c2-cargando');
        if (datos.res) { if (aMano) pintar(true); else alLlegar(vista.tab); return; }
        raiz.textContent = ''; raiz.removeAttribute('aria-busy');
        raiz.appendChild(el('p', 'c2-sin', fallo === 'No se pudo actualizar.' ? 'No se pudo cargar la economía.' : fallo));
        if (fallo !== mensajeDe(403)) { var r = el('p', 'c2-sin'); r.appendChild(boton('Reintentar', 'c2-btn', function () { cargar(true); })); raiz.appendChild(r); }
      });
  }
  // llegaron los datos de una parte: se pinta sin mover nada (y si se esta escribiendo, solo la lista)
  function alLlegar(k) {
    if (vista.tab !== k || !datos.res) return;
    if (enCampo()) { if (repintarLista) conAncla(repintarLista); pendiente = null; }
    else pintar(false);
  }

  // ── Que nada se mueva al actualizar: se recuerda la primera fila que se ve y se la deja en el mismo lugar ──
  // (si se ve el principio de la lista, queda como esta: lo nuevo aparece arriba, a la vista)
  function ancla() {
    var lista = raiz.querySelector('.ec-principal');
    if (!lista || window.scrollY < 4) return null;
    var barra = raiz.querySelector('.ec-tabs'), tope = barra ? barra.getBoundingClientRect().bottom : 0;
    if (lista.getBoundingClientRect().top >= tope) return null;
    var filas = lista.querySelectorAll('[data-k]');
    for (var i = 0; i < filas.length; i++) { var r = filas[i].getBoundingClientRect(); if (r.bottom > tope) return { k: filas[i].getAttribute('data-k'), top: r.top }; }
    return null;
  }
  function volver(a, y) {
    if (a) { var f = raiz.querySelector('.ec-principal [data-k="' + a.k + '"]'); if (f) { window.scrollTo(0, Math.round(window.scrollY + f.getBoundingClientRect().top - a.top)); return; } }
    window.scrollTo(0, y);
  }
  function conAncla(fn) { var y = window.scrollY, a = ancla(); fn(); volver(a, y); }
  function enCampo() { var a = document.activeElement; return !!a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && raiz.contains(a); }

  // ── Pintar ──
  var pendiente = vista.scroll[vista.tab] || 0; // (a donde ir cuando lleguen los datos de la parte: al abrir o al cambiar)
  var repintarLista = null; // (la de la parte que se ve: lo que cambia con el buscador)
  var tScroll = null;
  window.addEventListener('scroll', function () {
    clearTimeout(tScroll);
    tScroll = setTimeout(function () { if (pendiente == null && datos.res) { vista.scroll[vista.tab] = Math.round(window.scrollY); guardar(); } }, 150);
  }, { passive: true });

  // forzar: pintar aunque se este escribiendo en un campo (lo pide quien cambio algo a proposito)
  function pintar(forzar) {
    if (!datos.res) return;
    if (!forzar && enCampo()) return; // (no le borra lo que esta escribiendo: se pinta en la proxima)
    var y = window.scrollY, a = ancla();
    raiz.textContent = ''; raiz.removeAttribute('aria-busy');
    repintarLista = null;
    raiz.appendChild(cabecera());
    raiz.appendChild(pestanas());
    var cuerpo = el('div', 'ec-cuerpo');
    cuerpo.appendChild(PARTES[vista.tab]());
    raiz.appendChild(cuerpo);
    if (pendiente != null) { if (tiene(vista.tab)) { window.scrollTo(0, pendiente); pendiente = null; } }
    else volver(a, y);
  }
  function cabecera() {
    var d = datos.res, cab = el('div', 'c2-cab ec-cab'), izq = el('div'), h1 = el('h1', null, 'Economía del club');
    h1.appendChild(el('span', 'ec-modo ' + (d.modo === 'activo' ? 'activo' : 'sombra'), d.modo === 'activo' ? 'Activa' : 'Modo sombra'));
    izq.appendChild(h1);
    var der = el('div', 'c2-cab-der');
    der.appendChild(el('span', 'c2-cuando' + (fallo ? ' ec-fallo' : ''), fallo ? fallo + ' Se ve lo de las ' + hora(cuando) + '.' : 'Actualizado ' + hora(cuando)));
    der.appendChild(boton('Actualizar', 'c2-btn', function () { cargar(true); }));
    cab.append(izq, der);
    return cab;
  }
  function pestanas() {
    var nav = el('nav', 'ec-tabs');
    nav.setAttribute('role', 'tablist'); nav.setAttribute('aria-label', 'Partes de Economía');
    TABS.forEach(function (x) {
      var k = x[0], b = boton('', 'ec-tab' + (vista.tab === k ? ' activa' : ''), function () { ir(k); });
      b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', String(vista.tab === k));
      b.appendChild(el('span', null, x[1]));
      // lo pendiente: los saldos que no cierran con sus movimientos
      if (k === 'saldos' && datos.res.descuadres) {
        var n = datos.res.descuadres, bd = el('span', 'ec-badge rojo', n > 99 ? '99+' : String(n));
        bd.title = plural(n, 'saldo no cierra', 'saldos no cierran') + ' con sus movimientos';
        b.appendChild(bd);
      }
      nav.appendChild(b);
    });
    return nav;
  }
  // otra parte: cada una se acuerda de por donde iba la pagina (y sus datos se traen de nuevo)
  function ir(k) {
    if (!esTab(k)) return;
    if (vista.tab === k) { window.scrollTo(0, 0); return; }
    vista.scroll[vista.tab] = Math.round(window.scrollY);
    vista.tab = k; guardar();
    pendiente = vista.scroll[k] || 0;
    pintar(true);
    var t = raiz.querySelector('.ec-tab.activa');
    if (t && t.scrollIntoView) { try { t.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) { /* nada */ } }
    traerParte(k).then(function () { alLlegar(k); }, function (e) { fallo = mensajeDe(e); alLlegar(k); });
  }

  // ── Piezas ──
  function tile(l, v, s) { var t = el('div', 'c2-tile'); t.append(el('div', 'c2-tile-l', l), el('div', 'c2-tile-v', v)); if (s) t.appendChild(el('div', 'c2-tile-s', s)); return t; }
  function seccion(titulo, sub) {
    var s = el('section', 'c2-sec'), c = el('div', 'c2-sec-cab');
    c.appendChild(el('h2', null, titulo)); if (sub) c.appendChild(el('span', 'c2-sec-s', sub));
    s.appendChild(c); return s;
  }
  function tabla(cols, filas) {
    var w = el('div', 'ec-scroll'), t = el('table', 'ec-tabla'), th = el('tr');
    cols.forEach(function (c) { th.appendChild(el('th', c.n ? 'n' : null, c.t)); });
    t.appendChild(th);
    filas.forEach(function (f) { var tr = el('tr'); f.forEach(function (v, i) { var td = el('td', cols[i].n ? 'n' : null); if (v instanceof Node) td.appendChild(v); else td.textContent = v; tr.appendChild(td); }); t.appendChild(tr); });
    if (!filas.length) { var tr = el('tr'), td = el('td', 'ec-apagado', 'Todavía nada.'); td.colSpan = cols.length; tr.appendChild(td); t.appendChild(tr); }
    w.appendChild(t); return w;
  }
  function delta(n) { return el('span', n >= 0 ? 'ec-mas' : 'ec-menos', (n >= 0 ? '+' : '−') + num(Math.abs(n))); }
  // pastillas para filtrar: [[valor, texto, cuantos]]; la elegida en azul
  function pastillas(opciones, actual, alElegir) {
    var f = el('div', 'ec-pills'); f.setAttribute('role', 'group');
    opciones.forEach(function (o) {
      var b = boton('', 'c2-chip' + (o[0] === actual ? ' actual' : ''), function () { alElegir(o[0]); });
      b.setAttribute('aria-pressed', String(o[0] === actual));
      b.appendChild(document.createTextNode(o[1]));
      if (o[2] != null) b.appendChild(el('span', 'n', num(o[2])));
      f.appendChild(b);
    });
    return f;
  }
  function buscador(valor, texto, alCambiar) {
    var i = el('input', 'c2-buscar'); i.type = 'search'; i.placeholder = texto; i.value = valor || '';
    i.setAttribute('aria-label', texto); i.autocomplete = 'off'; i.spellcheck = false;
    i.addEventListener('input', function () { alCambiar(i.value); });
    return i;
  }
  function selector(opciones, actual, texto, alCambiar) {
    var s = el('select', 'ec-select'); s.setAttribute('aria-label', texto);
    opciones.forEach(function (o) { var op = el('option', null, o[1]); op.value = o[0]; if (o[0] === actual) op.selected = true; s.appendChild(op); });
    s.addEventListener('change', function () { alCambiar(s.value); });
    return s;
  }
  // una lista que muestra de a poco: o.items (los que hay para mostrar), o.n (cuantos), o.total (si son mas que los
  // traidos), o.crear(item) -> fila; "Mostrar más" llama a o.mas()
  function deAPoco(cont, o) {
    cont.textContent = '';
    if (!o.items.length) { cont.appendChild(el('p', 'c2-sin', o.vacio || 'Nada.')); return; }
    var caja = el('div', 'ec-filas' + (o.principal ? ' ec-principal' : ''));
    var se = Math.min(o.n, o.items.length);
    o.items.slice(0, se).forEach(function (x) { caja.appendChild(o.crear(x)); });
    cont.appendChild(caja);
    var total = o.total != null ? o.total : o.items.length;
    if (total > se) cont.appendChild(boton('Mostrar más (se ven ' + num(se) + ' de ' + num(total) + ')', 'ec-vermas', o.mas));
  }
  // lo que se pliega (se mira de vez en cuando); queda abierto o cerrado al actualizar
  function plegable(k, titulo, sub, llenar) {
    var det = el('details', 'c2-sec ec-plegable'); det.open = !!vista.abierto[k];
    var sum = el('summary');
    sum.appendChild(el('span', 'ec-plegable-t', titulo));
    if (sub) sum.appendChild(el('span', 'c2-sec-s', sub));
    det.appendChild(sum);
    var c = el('div', 'ec-plegable-c'); llenar(c); det.appendChild(c);
    det.addEventListener('toggle', function () { vista.abierto[k] = det.open; guardar(); });
    return det;
  }

  // ── Las filas ──
  function filaMov(x) {
    var f = el('div', 'ec-fila'); f.setAttribute('data-k', 'm' + x.id);
    var izq = el('div', 'ec-fila-izq'), l1 = el('div', 'ec-l1');
    if (vista.tab === 'movimientos' && vista.mov.uid === x.uid) l1.appendChild(el('span', 'ec-nom', x.nombre));
    else l1.appendChild(boton(x.nombre, 'ec-nombre', function () { verDe(x.uid, x.nombre); }, 'Ver solo los movimientos de ' + x.nombre));
    l1.appendChild(el('span', 'ec-chip', lugar(x.origen)));
    izq.append(l1, el('div', 'ec-l2', fechaHora(x.t) + ' · ' + tipoLindo(x.tipo) + (x.detalle ? ' · ' + x.detalle : '')));
    var der = el('div', 'ec-fila-der');
    der.append(delta(x.delta), el('span', 'ec-l2', 'queda ' + num(x.saldo)));
    f.append(izq, der);
    return f;
  }
  function filaSaldo(x) {
    var f = el('div', 'ec-fila'); f.setAttribute('data-k', 's' + x.uid);
    var izq = el('div', 'ec-fila-izq'), l1 = el('div', 'ec-l1');
    l1.appendChild(el('span', 'ec-nom', x.nombre));
    if (x.club) l1.appendChild(el('span', 'ec-chip club', 'CV Club'));
    if (x.noCierra) l1.appendChild(el('span', 'ec-chip rojo', 'No cierra'));
    var txt = 'ganó ' + num(x.ganado) + ' · gastó ' + num(x.gastado);
    if (x.noCierra) txt += ' · sus movimientos suman ' + num(x.suma);
    if (x.t) txt += ' · último: ' + fechaHora(x.t);
    izq.append(l1, el('div', 'ec-l2', txt));
    var der = el('div', 'ec-fila-der');
    der.append(el('span', 'ec-saldo', '🪙 ' + num(x.saldo)), boton('Movimientos', 'ec-mini', function () { verDe(x.uid, x.nombre); }, 'Ver los movimientos de ' + x.nombre));
    f.append(izq, der);
    return f;
  }
  // (de donde sale: con un toque se ven esos movimientos)
  function filaOrigen(o) {
    var f = boton('', 'ec-fila ec-tocable', function () { verOrigen(o.origen, o.tipo); }, 'Ver estos movimientos');
    f.setAttribute('data-k', 'o' + o.origen + '-' + o.tipo);
    var izq = el('span', 'ec-fila-izq'), l1 = el('span', 'ec-l1');
    l1.append(el('span', 'ec-nom', tipoLindo(o.tipo)), el('span', 'ec-chip', lugar(o.origen)));
    izq.append(l1, el('span', 'ec-l2', plural(o.n, 'vez', 'veces') + (o.gente != null ? ' · ' + plural(o.gente, 'persona', 'personas') : '')));
    var der = el('span', 'ec-fila-der');
    if (o.entra) der.appendChild(delta(o.entra));
    if (o.sale) der.appendChild(delta(-o.sale));
    f.append(izq, der);
    return f;
  }
  // a los movimientos de una cuenta, o de un lugar (y tipo)
  function verDe(uid, nombre) {
    vista.mov = Object.assign({}, BASE.mov, { uid: uid, quien: nombre });
    datos.mov = null; vista.scroll.movimientos = 0; guardar();
    if (vista.tab !== 'movimientos') { ir('movimientos'); return; }
    pendiente = 0; pintar(true);
    traerParte('movimientos').then(function () { alLlegar('movimientos'); }, function () {});
  }
  function verOrigen(origen, tipo) {
    vista.mov = Object.assign({}, BASE.mov, { origen: origen, tipo: tipo || '' });
    datos.mov = null; vista.scroll.movimientos = 0; guardar();
    ir('movimientos');
  }

  // las barras de cada dia: lo que entro (sin la bienvenida)
  function barras(dias) {
    var W = 720, H = 160, m = { i: 34, d: 6, a: 8, b: 22 };
    var g = sv('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'ec-barras', role: 'img', 'aria-label': 'Monedas que entraron por día' });
    var max = Math.max(10, Math.max.apply(null, dias.map(function (d) { return d.entra; }).concat([0])));
    var paso = [1, 2, 5]; var p = 1;
    for (var e = 1; ; e *= 10) { var hallo = false; for (var i = 0; i < 3; i++) if (max / (paso[i] * e) <= 4) { p = paso[i] * e; hallo = true; break; } if (hallo) break; }
    var tope = Math.ceil(max / p) * p, alto = H - m.a - m.b, ancho = W - m.i - m.d;
    for (var y = 0; y <= tope; y += p) {
      var yy = m.a + alto - (y / tope) * alto;
      g.appendChild(sv('line', { x1: m.i, x2: W - m.d, y1: yy, y2: yy, stroke: 'var(--grilla)', 'stroke-width': 1 }));
      var tx = sv('text', { x: m.i - 6, y: yy + 4, 'text-anchor': 'end', fill: 'var(--apagado)', 'font-size': 11 }); tx.textContent = num(y); g.appendChild(tx);
    }
    // (con pocos dias, barras finas en el medio de su lugar: no una sola barra que ocupa todo el ancho)
    var n = Math.max(dias.length, 1), lugarB = ancho / n, bw = Math.max(2, Math.min(28, lugarB - 3));
    dias.forEach(function (d, i) {
      var h = (d.entra / tope) * alto, x = m.i + i * lugarB + (lugarB - bw) / 2;
      var r = sv('rect', { x: x, y: m.a + alto - h, width: bw, height: Math.max(0, h), rx: 2, fill: 'var(--serie)' });
      var ti = sv('title'); ti.textContent = d.dia.slice(8, 10) + '/' + d.dia.slice(5, 7) + ': ' + num(d.entra) + ' monedas, ' + d.gente + ' personas'; r.appendChild(ti);
      g.appendChild(r);
      if (i === 0 || i === n - 1 || i % 7 === 0) { var t = sv('text', { x: x + bw / 2, y: H - 6, 'text-anchor': 'middle', fill: 'var(--apagado)', 'font-size': 11 }); t.textContent = d.dia.slice(8, 10) + '/' + d.dia.slice(5, 7); g.appendChild(t); }
    });
    return g;
  }

  // ═════════ Resumen ═════════
  function parteResumen() {
    var d = datos.res, frag = document.createDocumentFragment();
    frag.appendChild(el('p', 'c2-sub ec-sub', d.modo === 'activo' ? 'Todos ven sus monedas y las pueden gastar.' : 'Se anota todo, pero nadie lo ve todavía (salvo los administradores) ni lo puede gastar.'));
    // lo pendiente: los saldos que no cierran (con un toque se ven)
    if (d.descuadres) {
      var sp = seccion('Pendiente');
      sp.appendChild(boton((d.descuadres === 1 ? '1 saldo no cierra' : num(d.descuadres) + ' saldos no cierran') + ' con sus movimientos →', 'ec-ir rojo', function () {
        vista.sal.f = 'nocierran'; vista.sal.q = ''; vista.sal.n = BASE.sal.n; guardar(); ir('saldos');
      }));
      frag.appendChild(sp);
    }
    var t = el('div', 'c2-tiles');
    t.append(
      tile('Cuentas con monedas', num(d.cuentas)),
      tile('Monedas en total', num(d.total), 'lo que tienen entre todos'),
      tile('Ganado', num(d.ganado), 'desde el principio'),
      tile('Gastado', num(d.gastado)),
      tile('Ganado en 7 días', num(d.reparto.total), d.reparto.gente + ' personas, sin bienvenida ni primeros pasos')
    );
    var cuadra = tile('¿Cierran las cuentas?', d.descuadres ? 'No' : 'Sí', d.descuadres ? plural(d.descuadres, 'saldo no coincide', 'saldos no coinciden') + ' con sus movimientos' : 'cada saldo es la suma de sus movimientos');
    cuadra.querySelector('.c2-tile-v').className = 'c2-tile-v ' + (d.descuadres ? 'ec-mal' : 'ec-ok');
    t.appendChild(cuadra);
    frag.appendChild(t);

    var s1 = seccion('Lo que entra cada día', 'últimos 30 días, sin la bienvenida');
    s1.appendChild(barras(d.dias || [])); frag.appendChild(s1);

    var dos = el('div', 'c2-dos');
    var s4 = seccion('Los que más tienen'), l4 = el('div', 'ec-filas');
    (d.top || []).slice(0, 5).forEach(function (x) { l4.appendChild(filaSaldo(x)); });
    if (!l4.childNodes.length) l4.appendChild(el('p', 'c2-sin', 'Todavía nadie.'));
    s4.append(l4, boton('Ver el saldo de cada uno (' + num(d.cuentas) + ') →', 'ec-ir', function () { ir('saldos'); }));
    var s5 = seccion('Lo último', d.hoy ? plural(d.hoy.movimientos, 'movimiento', 'movimientos') + ' hoy' : null), l5 = el('div', 'ec-filas');
    (d.ultimos || []).slice(0, 5).forEach(function (x) { l5.appendChild(filaMov(x)); });
    if (!l5.childNodes.length) l5.appendChild(el('p', 'c2-sin', 'Todavía nada.'));
    s5.append(l5, boton('Ver todos los movimientos →', 'ec-ir', function () { ir('movimientos'); }));
    dos.append(s4, s5); frag.appendChild(dos);

    var s3 = seccion('De dónde salen', 'últimos 7 días'), l3 = el('div', 'ec-filas');
    (d.porOrigen || []).slice(0, 5).forEach(function (o) { l3.appendChild(filaOrigen(o)); });
    if (!l3.childNodes.length) l3.appendChild(el('p', 'c2-sin', 'Todavía nada.'));
    s3.append(l3, boton('Ver todo por origen →', 'ec-ir', function () { ir('origen'); }));
    frag.appendChild(s3);

    frag.appendChild(plegable('reparto', 'Cómo se reparte', 'lo ganado en los últimos 7 días, por persona', function (c) {
      var r = d.reparto;
      c.appendChild(tabla([{ t: 'Medida' }, { t: 'Monedas', n: true }], [
        ['La mitad gana menos de', num(r.p50)], ['3 de cada 4 ganan menos de', num(r.p75)], ['9 de cada 10 ganan menos de', num(r.p90)],
        ['El que más ganó', num(r.max)], ['Lo que se lleva el 10% que más gana', r.top10pct + '%']
      ]));
      c.appendChild(el('div', 'ec-hueco'));
      c.appendChild(tabla([{ t: 'Los que más ganaron (7 días)' }, { t: 'Monedas', n: true }], (r.quienes || []).map(function (q) { return [q.nombre, num(q.n)]; })));
    }));
    return frag;
  }

  // ═════════ Movimientos (los filtra el servidor: pueden ser muchos) ═════════
  var tBus = null;
  function esperandoMov() {
    var d = datos.mov, m = vista.mov;
    if (!d || !d.filtro) return true;
    var f = d.filtro;
    return f.origen !== m.origen || f.tipo !== m.tipo || (f.uid | 0) !== (m.uid | 0) || (!m.uid && f.q !== String(m.q).trim().slice(0, 60)) || d.n < m.n;
  }
  function recargarMov() {
    if (repintarLista) repintarLista();
    traerParte('movimientos').then(function () { alLlegar('movimientos'); }, function () {});
  }
  function parteMovimientos() {
    var s = seccion('Movimientos', 'los más nuevos primero');
    var herr = el('div', 'ec-herr');
    herr.appendChild(buscador(vista.mov.q, 'Buscar por nombre', function (q) {
      vista.mov.q = q; vista.mov.uid = 0; vista.mov.quien = ''; vista.mov.n = BASE.mov.n; guardar();
      if (repintarLista) repintarLista();
      clearTimeout(tBus);
      tBus = setTimeout(function () { traerParte('movimientos').then(function () { alLlegar('movimientos'); }, function () {}); }, 250);
    }));
    s.appendChild(herr);
    var filtros = el('div'), cuenta = el('p', 'ec-cuenta'), lista = el('div', 'ec-lista');
    s.append(filtros, cuenta, lista);
    repintarLista = function () { filtrosMov(filtros); listaMov(cuenta, lista); };
    repintarLista();
    return s;
  }
  function filtrosMov(cont) {
    cont.textContent = '';
    var d = datos.mov, m = vista.mov;
    if (m.uid) {
      var c = el('div', 'ec-persona');
      c.append(el('span', null, 'Solo de'), el('b', null, m.quien || ('#' + m.uid)));
      c.appendChild(boton('✕', 'ec-mini', function () { vista.mov.uid = 0; vista.mov.quien = ''; vista.mov.n = BASE.mov.n; guardar(); recargarMov(); }, 'Ver los de todos'));
      cont.appendChild(c);
    }
    if (!d) return;
    // los lugares, con cuantos hay de cada uno
    var tot = 0; d.origenes.forEach(function (o) { tot += o.n; });
    var ops = [['', 'Todo', tot]];
    Object.keys(ORIGENES).forEach(function (k) {
      var o = d.origenes.filter(function (x) { return x.origen === k; })[0];
      if (o || m.origen === k) ops.push([k, ORIGENES[k], o ? o.n : 0]);
    });
    cont.appendChild(pastillas(ops, m.origen, function (v) {
      if (v === vista.mov.origen) return;
      vista.mov.origen = v; vista.mov.tipo = ''; vista.mov.n = BASE.mov.n; guardar(); recargarMov();
    }));
    // los tipos (del lugar elegido)
    var tops = [['', 'Todos los tipos']];
    d.tipos.forEach(function (t) { tops.push([t.tipo, tipoLindo(t.tipo) + ' (' + num(t.n) + ')']); });
    if (m.tipo && !d.tipos.some(function (t) { return t.tipo === m.tipo; })) tops.push([m.tipo, tipoLindo(m.tipo) + ' (0)']);
    if (tops.length > 2 || m.tipo) cont.appendChild(selector(tops, m.tipo, 'Tipo de movimiento', function (v) { vista.mov.tipo = v; vista.mov.n = BASE.mov.n; guardar(); recargarMov(); }));
  }
  function listaMov(cuenta, lista) {
    var d = datos.mov, m = vista.mov;
    lista.classList.toggle('ec-cargando', !!d && esperandoMov());
    cuenta.textContent = '';
    if (!d) { lista.textContent = ''; lista.appendChild(el('p', 'c2-sin', 'Cargando…')); return; }
    if (d.total) cuenta.textContent = plural(d.total, 'movimiento', 'movimientos') + ' · entraron ' + num(d.entra) + ' · salieron ' + num(d.sale);
    var hay = !!(m.uid || String(m.q).trim() || m.origen || m.tipo);
    deAPoco(lista, {
      items: d.items, n: d.items.length, total: d.total, principal: true, crear: filaMov,
      vacio: hay ? 'No hay movimientos con esos filtros.' : 'Todavía no hay movimientos.',
      mas: function () { vista.mov.n = Math.max(vista.mov.n, d.items.length) + 30; guardar(); recargarMov(); }
    });
    if (!d.items.length && hay) {
      var p = el('p', 'c2-sin');
      p.appendChild(boton('Sacar los filtros', 'c2-btn', function () { vista.mov = Object.assign({}, BASE.mov); guardar(); pintar(true); recargarMov(); }));
      lista.appendChild(p);
    }
  }

  // ═════════ Saldos (son pocos cientos: se filtran aca mismo, al instante) ═════════
  var ORDENES = [['saldo', 'Más monedas'], ['ganado', 'Más ganado'], ['gastado', 'Más gastado'], ['reciente', 'Movida más reciente'], ['nombre', 'Por nombre']];
  var ORDEN = {
    saldo: function (a, b) { return b.saldo - a.saldo || b.ganado - a.ganado; },
    ganado: function (a, b) { return b.ganado - a.ganado; },
    gastado: function (a, b) { return b.gastado - a.gastado; },
    reciente: function (a, b) { return (b.t || 0) - (a.t || 0); },
    nombre: function (a, b) { return sinTildes(a.nombre).localeCompare(sinTildes(b.nombre), 'es'); }
  };
  function parteSaldos() {
    var r = datos.res, s = seccion('Saldo de cada uno', plural(r.cuentas, 'cuenta', 'cuentas') + ' · ' + num(r.total) + ' monedas entre todos');
    if (!datos.sal) { s.appendChild(el('p', 'c2-sin', 'Cargando…')); return s; }
    var herr = el('div', 'ec-herr');
    herr.appendChild(buscador(vista.sal.q, 'Buscar por nombre', function (q) { vista.sal.q = q; vista.sal.n = BASE.sal.n; guardar(); repintarLista(); }));
    herr.appendChild(selector(ORDENES, vista.sal.orden, 'Ordenar', function (v) { vista.sal.orden = v; vista.sal.n = BASE.sal.n; guardar(); repintarLista(); }));
    s.appendChild(herr);
    var pills = el('div'), lista = el('div', 'ec-lista');
    s.append(pills, lista);
    repintarLista = function () {
      var d = datos.sal; if (!d) return;
      var q = vista.sal.q, todos = d.items.filter(function (x) { return coincide(q, x.nombre, x.usuario); });
      var club = todos.filter(function (x) { return x.club; }), malos = todos.filter(function (x) { return x.noCierra; });
      var ops = [['todos', 'Todos', todos.length], ['club', 'CV Club', club.length]];
      if (malos.length || vista.sal.f === 'nocierran') ops.push(['nocierran', 'No cierran', malos.length]);
      pills.textContent = '';
      pills.appendChild(pastillas(ops, vista.sal.f, function (v) { vista.sal.f = v; vista.sal.n = BASE.sal.n; guardar(); repintarLista(); }));
      var l = vista.sal.f === 'club' ? club : vista.sal.f === 'nocierran' ? malos : todos;
      l = l.slice().sort(ORDEN[vista.sal.orden] || ORDEN.saldo);
      deAPoco(lista, {
        items: l, n: vista.sal.n, principal: true, crear: filaSaldo,
        vacio: q.trim() ? 'Nadie con ese nombre.' : 'Nadie.',
        mas: function () { vista.sal.n += 30; guardar(); repintarLista(); }
      });
    };
    repintarLista();
    return s;
  }

  // ═════════ Por origen ═════════
  var PERIODOS = [['1', '24 horas'], ['7', '7 días'], ['30', '30 días'], ['todo', 'Desde el principio']];
  function parteOrigen() {
    var frag = document.createDocumentFragment();
    var arriba = el('div', 'ec-herr');
    arriba.appendChild(pastillas(PERIODOS, vista.ori.periodo, function (v) {
      if (v === vista.ori.periodo) return;
      vista.ori.periodo = v; vista.ori.n = BASE.ori.n; guardar(); pintar(true);
      traerParte('origen').then(function () { alLlegar('origen'); }, function () {});
    }));
    frag.appendChild(arriba);
    var d = datos.ori;
    if (!d) { frag.appendChild(el('p', 'c2-sin', 'Cargando…')); return frag; }
    var cuerpo = el('div', d.periodo !== vista.ori.periodo ? 'ec-cargando' : null);
    var t = d.total || {};
    var s1 = seccion('Por lugar', 'tocá uno para ver sus movimientos');
    s1.appendChild(el('p', 'ec-cuenta', t.n ? 'Entraron ' + num(t.entra) + ' y salieron ' + num(t.sale) + ', en ' + plural(t.n, 'movimiento', 'movimientos') + ' de ' + plural(t.gente, 'persona', 'personas') + '.' : 'Nada en este tiempo.'));
    if (d.lugares.length) {
      var g = el('div', 'ec-lugares');
      d.lugares.forEach(function (l) {
        var b = boton('', 'ec-lugar', function () { verOrigen(l.origen, ''); }, 'Ver los movimientos de ' + lugar(l.origen));
        var v = el('span', 'ec-lugar-v');
        if (l.entra) v.appendChild(delta(l.entra));
        if (l.sale) v.appendChild(delta(-l.sale));
        b.append(el('span', 'ec-lugar-n', lugar(l.origen)), v, el('span', 'ec-l2', plural(l.n, 'movimiento', 'movimientos') + ' · ' + plural(l.gente, 'persona', 'personas')));
        g.appendChild(b);
      });
      s1.appendChild(g);
    }
    cuerpo.appendChild(s1);
    var s2 = seccion('Qué da y qué cobra', 'de lo que más mueve a lo que menos'), lista = el('div');
    deAPoco(lista, { items: d.filas, n: vista.ori.n, principal: true, crear: filaOrigen, vacio: 'Nada en este tiempo.', mas: function () { vista.ori.n += 15; guardar(); pintar(true); } });
    s2.appendChild(lista);
    cuerpo.appendChild(s2);
    frag.appendChild(cuerpo);
    return frag;
  }

  var PARTES = { resumen: parteResumen, movimientos: parteMovimientos, saldos: parteSaldos, origen: parteOrigen };

  cargar(false);
  // cada 30 segundos, si se esta mirando (la pestaña a la vista); al volver a la pestaña, enseguida
  function visible() { try { var f = window.frameElement; return !f || f.offsetParent !== null; } catch (e) { return true; } }
  setInterval(function () {
    if (cargando || document.visibilityState !== 'visible' || !visible()) return;
    if (Date.now() - intento >= 30000) cargar(false);
  }, 5000);
})();
