/* Capa 2 en Admin (la pestaña "Capa 2" del panel de administradores, en un marco): lo que pasa en la ciudad.
   Los datos los trae /puente/api/capa2/estadisticas (capa2-admin.js del puente, solo administradores):
   - lo que manda el juego: el servidor, quienes estan ahora, el mundo, las cuentas, las carreras, los ultimos 300
     eventos y los totales por dia (en fecha UTC);
   - la gente de cada minuto que anota el chat: los graficos de las ultimas 24 horas y de los ultimos 30 dias.
   Se actualiza sola cada 20 segundos mientras se ve. Los nombres y textos que vienen del juego van siempre con
   textContent (nunca como HTML). */
(function () {
  'use strict';
  var API = '/puente/api/capa2/estadisticas';
  var raiz = document.getElementById('c2');
  if (!raiz) return;

  // ── Utilidades ──
  function token() { try { return localStorage.getItem('haven_token') || ''; } catch (e) { return ''; } }
  function el(tag, cls, txt) { var n = document.createElement(tag); if (cls) n.className = cls; if (txt != null) n.textContent = txt; return n; }
  var NS = 'http://www.w3.org/2000/svg';
  function sv(tag, at) { var n = document.createElementNS(NS, tag); for (var k in at || {}) n.setAttribute(k, at[k]); return n; }
  function num(n) { return (Number(n) || 0).toLocaleString('es-AR'); }
  function plata(n) { return '$ ' + num(Math.round(Number(n) || 0)); }
  function dosDig(n) { return (n < 10 ? '0' : '') + n; }
  function hora(t) { var d = new Date(t); return dosDig(d.getHours()) + ':' + dosDig(d.getMinutes()); }
  function fecha(t) { var d = new Date(t); return dosDig(d.getDate()) + '/' + dosDig(d.getMonth() + 1); }
  function fechaHora(t) { return t ? fecha(t) + ' ' + hora(t) : ''; }
  function hace(t, ahora) {
    if (!t) return '';
    var s = Math.max(0, Math.round(((ahora || Date.now()) - t) / 1000));
    if (s < 60) return 'recién';
    var m = Math.round(s / 60); if (m < 60) return 'hace ' + m + ' min';
    var h = Math.round(m / 60); if (h < 48) return 'hace ' + h + ' h';
    return 'hace ' + Math.round(h / 24) + ' días';
  }
  function minutos(m) { m = Math.round(Number(m) || 0); if (m < 60) return m + ' min'; var h = Math.floor(m / 60); return h + ' h ' + dosDig(m % 60); }
  function tiempo(ms) { ms = Number(ms) || 0; var m = Math.floor(ms / 60000), s = Math.floor(ms / 1000) % 60, c = Math.floor(ms / 10) % 100; return m + ':' + dosDig(s) + '.' + dosDig(c); }
  var DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
  function diaLindo(iso) { var p = String(iso).split('-'); var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])); return DIAS[d.getUTCDay()] + ' ' + p[2] + '/' + p[1]; }
  // Un paso de la grilla "redondo" (1, 2, 5, 10, 20, 50...) para que entren unas 4 lineas
  function pasoLindo(max) { var pasos = [1, 2, 5]; for (var e = 1; ; e *= 10) for (var i = 0; i < 3; i++) if (max / (pasos[i] * e) <= 4) return pasos[i] * e; }

  // Los eventos del juego: su dibujito y como se dicen
  var EVENTOS = {
    entra: ['🚪', 'Entró'], sale: ['👋', 'Salió'], baja: ['🎯', 'Bajó a alguien'], muerte: ['💀', 'Murió'],
    robo: ['🚗', 'Robo'], asalto: ['🔫', 'Asalto'], matarPolicia: ['👮', 'Mató a un policía'], buscado: ['⭐', 'Lo buscan'],
    compra: ['🛒', 'Compra'], cobro: ['💰', 'Cobró'],
  };
  var COLUMNAS_DIA = ['entra', 'sale', 'baja', 'muerte', 'robo', 'asalto', 'matarPolicia', 'buscado', 'compra', 'cobro'];
  var NOMBRE_COL = { entra: 'Entradas', sale: 'Salidas', baja: 'Bajas', muerte: 'Muertes', robo: 'Robos', asalto: 'Asaltos', matarPolicia: 'Policías', buscado: 'Buscados', compra: 'Compras', cobro: 'Cobros' };
  function detalleEvento(e) {
    var d = String(e.detalle || '');
    if (e.tipo === 'sale' && /^\d+$/.test(d)) return 'después de ' + minutos(+d);
    return d;
  }

  // ── El armado (una vez) ──
  var S = {};
  var estado = { buscarJug: '', ordenJug: 'ultimaVez', dirJug: -1, filtroEv: '', buscarEv: '' };
  var datos = null, pidiendo = false;

  function seccion(titulo, sub) {
    var box = el('section', 'c2-sec'), cab = el('div', 'c2-sec-cab');
    cab.appendChild(el('h2', null, titulo));
    var s = el('span', 'c2-sec-s', sub || ''); cab.appendChild(s);
    var cuerpo = el('div');
    box.append(cab, cuerpo);
    return { box: box, cuerpo: cuerpo, sub: s };
  }

  function armar() {
    raiz.textContent = '';
    var cab = el('header', 'c2-cab'), tit = el('div');
    tit.append(el('h1', null, 'Capa 2'), el('p', 'c2-sub', 'Lo que pasa en la ciudad'));
    var der = el('div', 'c2-cab-der');
    S.cuando = el('span', 'c2-cuando', '');
    var b = el('button', 'c2-btn', 'Actualizar'); b.type = 'button';
    b.addEventListener('click', function () { cargar(); });
    der.append(S.cuando, b);
    cab.append(tit, der);
    S.error = el('div', 'c2-error'); S.error.hidden = true;
    S.tiles = el('div', 'c2-tiles');
    var dos = el('div', 'c2-dos');
    S.g24 = seccion('Gente conectada', 'últimas 24 horas, el máximo de cada 10 minutos');
    S.g30 = seccion('Horas jugadas por día', 'últimos 30 días, sumando a todos');
    dos.append(S.g24.box, S.g30.box);
    S.ahora = seccion('Ahora en la ciudad', '');
    S.jug = seccion('Jugadores', 'todas las cuentas que entraron alguna vez');
    S.jugHerr = el('div', 'c2-herr');
    var bj = el('input', 'c2-buscar'); bj.type = 'search'; bj.placeholder = 'Buscar por nombre'; bj.setAttribute('aria-label', 'Buscar jugadores por nombre');
    bj.addEventListener('input', function () { estado.buscarJug = bj.value; pintarJugadores(); });
    S.jugHerr.appendChild(bj);
    S.jugCaja = el('div');
    S.jug.cuerpo.append(S.jugHerr, S.jugCaja);
    S.dia = seccion('Por día', 'lo que pasó cada día (en fecha UTC: el día cambia a las 21 h de Argentina)');
    S.ev = seccion('Eventos', 'los últimos 300, primero lo más nuevo');
    S.evChips = el('div', 'c2-herr');
    S.evTipos = el('div', 'c2-herr'); S.evTipos.style.margin = '0';
    S.evBuscar = el('input', 'c2-buscar'); S.evBuscar.type = 'search'; S.evBuscar.placeholder = 'Buscar por nombre o detalle'; S.evBuscar.setAttribute('aria-label', 'Buscar eventos');
    S.evBuscar.addEventListener('input', function () { estado.buscarEv = S.evBuscar.value; pintarEventos(); });
    S.evLista = el('div', 'c2-eventos');
    S.evChips.append(S.evTipos, S.evBuscar);
    S.ev.cuerpo.append(S.evChips, S.evLista);
    var dos2 = el('div', 'c2-dos');
    S.carr = seccion('Carreras', 'el récord de cada una');
    S.mundo = seccion('Mundo y servidor', '');
    dos2.append(S.carr.box, S.mundo.box);
    raiz.append(cab, S.error, S.tiles, dos, S.ahora.box, S.jug.box, S.dia.box, S.ev.box, dos2);
    raiz.removeAttribute('aria-busy');
  }

  // ── Los numeros de arriba ──
  function tile(label, valor, sub) {
    var t = el('div', 'c2-tile');
    t.append(el('div', 'c2-tile-l', label), el('div', 'c2-tile-v', valor), el('div', 'c2-tile-s', sub || ''));
    return t;
  }
  function pintarTiles() {
    var c = datos.capa2, s = datos.serie || {}, hoyUTC = new Date(datos.ahora).toISOString().slice(0, 10);
    var dia = (c && c.porDia && c.porDia[hoyUTC]) || {};
    var hoy = (s.dias || [])[(s.dias || []).length - 1] || {};
    var cuentas = c && Array.isArray(c.cuentas) ? c.cuentas : [];
    var nuevas = cuentas.filter(function (x) { return x.primeraVez && datos.ahora - x.primeraVez < 7 * 86400e3; }).length;
    S.tiles.textContent = '';
    if (c && c.ahora) {
      var inv = c.ahora.invitados | 0;
      S.tiles.appendChild(tile('Jugando ahora', num(c.ahora.jugadores), inv ? (inv === 1 ? '1 invitado' : num(inv) + ' invitados') : 'ningún invitado'));
    }
    S.tiles.appendChild(tile('Horas jugadas hoy', hoy.horas != null ? num(hoy.horas) : '0', hoy.max != null ? 'máximo ' + num(hoy.max) + ' a la vez' : 'sin datos todavía'));
    if (c) {
      S.tiles.appendChild(tile('Entradas hoy (UTC)', num(dia.entra), num(dia.baja) + ' bajas · ' + num(dia.muerte) + ' muertes'));
      S.tiles.appendChild(tile('Cuentas', num(cuentas.length), nuevas ? (nuevas === 1 ? '1 nueva esta semana' : num(nuevas) + ' nuevas esta semana') : 'ninguna nueva esta semana'));
      var sv2 = c.servidor || {}, tk = sv2.tickMs || {};
      S.tiles.appendChild(tile('Paso del servidor', (tk.promedio != null ? String(tk.promedio).replace('.', ',') : '?') + ' ms', 'peor ' + (tk.peor != null ? String(tk.peor).replace('.', ',') : '?') + ' ms · ' + num(sv2.memoriaMB) + ' MB'));
    }
  }

  // ── Los graficos ──
  // El cartelito del puntero (o del teclado): el valor primero, despues que es
  function tip(caja, filas) {
    var t = caja.querySelector('.c2-tip');
    if (!t) { t = el('div', 'c2-tip'); t.hidden = true; caja.appendChild(t); }
    t.textContent = '';
    t.appendChild(el('div', 'c2-tip-v', filas[0]));
    if (filas[1]) t.appendChild(el('div', 'c2-tip-l', filas[1]));
    if (filas[2]) t.appendChild(el('div', 'c2-tip-x', filas[2]));
    t.hidden = false;
    return t;
  }
  function ponerTip(caja, t, x, y) {
    var w = t.offsetWidth, h = t.offsetHeight, W = caja.clientWidth;
    var left = x + 12; if (left + w > W) left = x - w - 12; if (left < 0) left = 0;
    t.style.left = left + 'px'; t.style.top = Math.max(0, y - h - 10) + 'px';
  }
  function sinTip(caja) { var t = caja.querySelector('.c2-tip'); if (t) t.hidden = true; }

  // Linea con area (una serie): puntos [{ v, ...}] con v null donde no hubo dato. etiquetaX(p, i): el texto del eje o
  // nada; info(p): las filas del cartelito
  function grafLinea(caja, puntos, etiquetaX, info, alt) {
    caja.textContent = '';
    var W = Math.max(280, caja.clientWidth || 560), H = 200, L = 36, R = 14, T = 12, B = 26;
    var max = 0; puntos.forEach(function (p) { if (p.v != null && p.v > max) max = p.v; });
    var paso = pasoLindo(Math.max(1, max)), top = Math.max(paso, Math.ceil(Math.max(1, max) / paso) * paso);
    var n = puntos.length;
    function x(i) { return L + (W - L - R) * (n <= 1 ? 0.5 : i / (n - 1)); }
    function y(v) { return T + (H - T - B) * (1 - v / top); }
    var s = sv('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, role: 'img', 'aria-label': alt, tabindex: '0' });
    for (var v = 0; v <= top + 1e-9; v += paso) {
      s.appendChild(sv('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), class: 'c2-grilla' }));
      var tx = sv('text', { x: L - 8, y: y(v) + 4, 'text-anchor': 'end', class: 'c2-eje' }); tx.textContent = num(v); s.appendChild(tx);
    }
    puntos.forEach(function (p, i) {
      var e = etiquetaX(p, i); if (!e) return;
      var t = sv('text', { x: x(i), y: H - 7, 'text-anchor': 'middle', class: 'c2-eje' }); t.textContent = e; s.appendChild(t);
    });
    // la linea y el area, cortadas donde no hubo dato (un punto suelto va como un puntito)
    var linea = '', area = '', tramo = [], sueltos = [];
    function cerrar() {
      if (!tramo.length) return;
      if (tramo.length === 1) sueltos.push(sv('circle', { cx: tramo[0][0], cy: tramo[0][1], r: 4, class: 'c2-solo' }));
      else {
        var pts = tramo.map(function (q) { return q[0].toFixed(1) + ' ' + q[1].toFixed(1); });
        linea += 'M' + pts.join('L');
        area += 'M' + tramo[0][0].toFixed(1) + ' ' + y(0).toFixed(1) + 'L' + pts.join('L') + 'L' + tramo[tramo.length - 1][0].toFixed(1) + ' ' + y(0).toFixed(1) + 'Z';
      }
      tramo = [];
    }
    puntos.forEach(function (p, i) { if (p.v == null) cerrar(); else tramo.push([x(i), y(p.v)]); });
    cerrar();
    if (area) s.appendChild(sv('path', { d: area, class: 'c2-area' }));
    if (linea) s.appendChild(sv('path', { d: linea, class: 'c2-linea' }));
    sueltos.forEach(function (c) { s.appendChild(c); });
    var cruz = sv('line', { y1: T, y2: H - B, class: 'c2-cruz', visibility: 'hidden' });
    var punto = sv('circle', { r: 4, class: 'c2-punto', visibility: 'hidden' });
    s.append(cruz, punto);
    caja.appendChild(s);
    var actual = -1;
    function mostrar(i) {
      i = Math.max(0, Math.min(n - 1, i)); actual = i;
      var p = puntos[i], cx = x(i);
      cruz.setAttribute('x1', cx); cruz.setAttribute('x2', cx); cruz.setAttribute('visibility', 'visible');
      if (p.v != null) { punto.setAttribute('cx', cx); punto.setAttribute('cy', y(p.v)); punto.setAttribute('visibility', 'visible'); } else punto.setAttribute('visibility', 'hidden');
      var esc = caja.clientWidth / W;
      ponerTip(caja, tip(caja, info(p)), cx * esc, (p.v != null ? y(p.v) : T + 20) * esc);
    }
    function ocultar() { actual = -1; cruz.setAttribute('visibility', 'hidden'); punto.setAttribute('visibility', 'hidden'); sinTip(caja); }
    s.addEventListener('pointermove', function (e) {
      var r = s.getBoundingClientRect(), px = (e.clientX - r.left) * (W / r.width);
      mostrar(Math.round((px - L) / (W - L - R) * (n - 1)));
    });
    s.addEventListener('pointerleave', ocultar);
    s.addEventListener('blur', ocultar);
    s.addEventListener('focus', function () { if (actual < 0) mostrar(n - 1); });
    s.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); mostrar((actual < 0 ? n - 1 : actual) + (e.key === 'ArrowLeft' ? -1 : 1)); }
      else if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); mostrar(e.key === 'Home' ? 0 : n - 1); }
      else if (e.key === 'Escape') ocultar();
    });
  }

  // Columnas (una serie): de a una, con su cartelito al pasar el puntero o al llegar con el teclado
  function grafColumnas(caja, puntos, etiquetaX, info, alt) {
    caja.textContent = '';
    var W = Math.max(280, caja.clientWidth || 560), H = 200, L = 36, R = 14, T = 12, B = 26;
    var max = 0; puntos.forEach(function (p) { if (p.v != null && p.v > max) max = p.v; });
    var paso = pasoLindo(Math.max(1, max)), top = Math.max(paso, Math.ceil(Math.max(1, max) / paso) * paso);
    var n = puntos.length, banda = (W - L - R) / Math.max(1, n), ancho = Math.max(2, Math.min(24, banda - 2));
    function y(v) { return T + (H - T - B) * (1 - v / top); }
    var s = sv('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, role: 'img', 'aria-label': alt });
    for (var v = 0; v <= top + 1e-9; v += paso) {
      s.appendChild(sv('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), class: 'c2-grilla' }));
      var tx = sv('text', { x: L - 8, y: y(v) + 4, 'text-anchor': 'end', class: 'c2-eje' }); tx.textContent = num(v); s.appendChild(tx);
    }
    caja.appendChild(s);
    puntos.forEach(function (p, i) {
      var cx = L + banda * i + banda / 2, e = etiquetaX(p, i);
      if (e) { var t = sv('text', { x: cx, y: H - 7, 'text-anchor': 'middle', class: 'c2-eje' }); t.textContent = e; s.appendChild(t); }
      var x0 = cx - ancho / 2, base = y(0);
      // (el lugar para el puntero es toda la banda, mas grande que la columna)
      var golpe = sv('rect', { x: L + banda * i, y: T, width: banda, height: H - T - B, class: 'c2-golpe' });
      var barra = null;
      if (p.v != null && p.v > 0) {
        var yt = y(p.v), r = Math.min(4, ancho / 2, base - yt);
        var d = 'M' + x0 + ' ' + base + 'V' + (yt + r) + 'Q' + x0 + ' ' + yt + ' ' + (x0 + r) + ' ' + yt + 'H' + (x0 + ancho - r) + 'Q' + (x0 + ancho) + ' ' + yt + ' ' + (x0 + ancho) + ' ' + (yt + r) + 'V' + base + 'Z';
        barra = sv('path', { d: d, class: 'c2-barra' });
        s.appendChild(barra);
      }
      golpe.setAttribute('tabindex', '0');
      golpe.setAttribute('role', 'img');
      golpe.setAttribute('aria-label', info(p).join(', '));
      s.appendChild(golpe);
      function ver() {
        if (barra) barra.classList.add('actual');
        var esc = caja.clientWidth / W;
        ponerTip(caja, tip(caja, info(p)), cx * esc, (p.v != null && p.v > 0 ? y(p.v) : base - 20) * esc);
      }
      function no() { if (barra) barra.classList.remove('actual'); sinTip(caja); }
      golpe.addEventListener('pointerenter', ver); golpe.addEventListener('focus', ver);
      golpe.addEventListener('pointerleave', no); golpe.addEventListener('blur', no);
    });
  }

  // La tabla de un grafico (para leerlo sin el puntero)
  function tablaDe(caja, titulo, cols, filas) {
    var d = el('details', 'c2-tabla-de');
    d.appendChild(el('summary', null, titulo));
    var tc = el('div', 'c2-tabla-caja'), t = el('table', 'c2-tabla'), th = el('thead'), tr = el('tr');
    cols.forEach(function (c, i) { tr.appendChild(el('th', i ? 'n' : null, c)); });
    th.appendChild(tr); t.appendChild(th);
    var tb = el('tbody');
    filas.forEach(function (f) { var r = el('tr'); f.forEach(function (v, i) { r.appendChild(el('td', i ? 'n' : null, v)); }); tb.appendChild(r); });
    t.appendChild(tb); tc.appendChild(t); d.appendChild(tc);
    caja.appendChild(d);
  }

  function pintarGraficos() {
    var s = datos.serie || {}, horas = s.horas || [], dias = s.dias || [];
    // (se recuerda si la tabla estaba abierta)
    var abierta24 = !!S.g24.cuerpo.querySelector('details[open]'), abierta30 = !!S.g30.cuerpo.querySelector('details[open]');
    S.g24.cuerpo.textContent = ''; S.g30.cuerpo.textContent = '';
    var hay24 = horas.some(function (p) { return p.max != null; });
    if (!hay24) S.g24.cuerpo.appendChild(el('div', 'c2-vacio', 'Todavía no hay datos: el chat anota la gente de Capa 2 cada minuto desde que se instaló este panel.'));
    else {
      var g = el('div', 'c2-graf'); S.g24.cuerpo.appendChild(g);
      var pts = horas.map(function (p) { return { v: p.max, inv: p.inv, t: p.t }; });
      grafLinea(g, pts, function (p, i) { var d = new Date(p.t); return d.getMinutes() < 10 && d.getHours() % 3 === 0 && i > 2 && i < pts.length - 3 ? dosDig(d.getHours()) + ' h' : ''; },
        function (p) { return [p.v == null ? 'sin dato' : num(p.v) + (p.v === 1 ? ' persona' : ' personas'), hora(p.t) + ' a ' + hora(p.t + 10 * 60e3), p.inv ? 'de ellas ' + num(p.inv) + (p.inv === 1 ? ' invitado' : ' invitados') : '']; },
        'Gente conectada a Capa 2 en las últimas 24 horas');
      // la tabla: el maximo de cada hora
      var porHora = [];
      for (var i = 0; i < horas.length; i += 6) {
        var tramo = horas.slice(i, i + 6), m = null;
        tramo.forEach(function (p) { if (p.max != null && (m == null || p.max > m)) m = p.max; });
        porHora.push([hora(tramo[0].t) + ' a ' + hora(tramo[tramo.length - 1].t + 10 * 60e3), m == null ? '—' : num(m)]);
      }
      tablaDe(S.g24.cuerpo, 'Ver como tabla (el máximo de cada hora)', ['Hora', 'Máximo a la vez'], porHora.reverse());
      if (abierta24) S.g24.cuerpo.querySelector('details').open = true;
    }
    var hay30 = dias.some(function (p) { return p.horas != null; });
    if (!hay30) S.g30.cuerpo.appendChild(el('div', 'c2-vacio', 'Todavía no hay datos de días enteros.'));
    else {
      var g2 = el('div', 'c2-graf'); S.g30.cuerpo.appendChild(g2);
      var pd = dias.map(function (p) { return { v: p.horas, max: p.max, con: p.conGente, dia: p.dia }; });
      grafColumnas(g2, pd, function (p, i) { return (pd.length - 1 - i) % 5 === 0 ? p.dia.slice(8, 10) + '/' + p.dia.slice(5, 7) : ''; },
        function (p) { return [p.v == null ? 'sin datos' : num(p.v) + ' h jugadas', diaLindo(p.dia), p.max != null ? 'máximo ' + num(p.max) + ' a la vez · ' + minutos(p.con) + ' con gente' : '']; },
        'Horas jugadas por día en Capa 2, últimos 30 días');
      tablaDe(S.g30.cuerpo, 'Ver como tabla', ['Día', 'Horas jugadas', 'Máximo a la vez', 'Tiempo con gente'],
        dias.slice().reverse().map(function (p) { return [diaLindo(p.dia), p.horas == null ? '—' : num(p.horas), p.max == null ? '—' : num(p.max), p.conGente == null ? '—' : minutos(p.conGente)]; }));
      if (abierta30) S.g30.cuerpo.querySelector('details').open = true;
    }
  }

  // ── Las tablas ──
  function tabla(cols, filas, opciones) {
    var o = opciones || {}, caja = el('div', 'c2-tabla-caja'), t = el('table', 'c2-tabla'), th = el('thead'), tr = el('tr');
    cols.forEach(function (c) {
      var h = el('th', (c.n ? 'n' : '') + (c.orden ? ' ord' : ''), c.titulo);
      if (c.orden && o.orden) {
        h.tabIndex = 0;
        if (o.orden.clave === c.orden) h.appendChild(el('span', 'flecha', o.orden.dir > 0 ? '▲' : '▼'));
        var ir = function () { o.orden.cambiar(c.orden); };
        h.addEventListener('click', ir);
        h.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ir(); } });
      }
      tr.appendChild(h);
    });
    th.appendChild(tr); t.appendChild(th);
    var tb = el('tbody');
    filas.forEach(function (f) {
      var r = el('tr');
      f.forEach(function (v, i) {
        var td = el('td', cols[i].n ? 'n' : null);
        if (v && v.nodeType) td.appendChild(v); else td.textContent = v == null ? '' : String(v);
        r.appendChild(td);
      });
      tb.appendChild(r);
    });
    t.appendChild(tb); caja.appendChild(t);
    return caja;
  }
  function nombreCon(nombre, marcas) {
    var f = document.createDocumentFragment();
    f.appendChild(document.createTextNode(nombre || '?'));
    (marcas || []).forEach(function (m) { if (m) f.appendChild(el('span', 'c2-marca', m)); });
    var s = el('span'); s.appendChild(f); return s;
  }

  function pintarAhora() {
    var c = datos.capa2;
    S.ahora.cuerpo.textContent = '';
    if (!c || !c.ahora) { S.ahora.sub.textContent = ''; S.ahora.cuerpo.appendChild(el('div', 'c2-vacio', 'Sin datos del juego.')); return; }
    var lista = Array.isArray(c.ahora.conectados) ? c.ahora.conectados : [];
    S.ahora.sub.textContent = lista.length ? (lista.length === 1 ? '1 persona' : num(lista.length) + ' personas') : '';
    if (!lista.length) { S.ahora.cuerpo.appendChild(el('div', 'c2-vacio', 'No hay nadie en la ciudad ahora.')); return; }
    lista = lista.slice().sort(function (a, b) { return (a.desde || 0) - (b.desde || 0); });
    var cols = [{ titulo: 'Nombre' }, { titulo: 'Entró' }, { titulo: 'Plata', n: true }, { titulo: 'Vida', n: true }, { titulo: 'Vehículo' }, { titulo: 'Buscado' }, { titulo: 'Barrio' }, { titulo: 'Teléfono' }];
    S.ahora.cuerpo.appendChild(tabla(cols, lista.map(function (p) {
      var est = el('span', 'c2-estrellas', '★'.repeat(Math.max(0, Math.min(5, p.buscado | 0))));
      if (!(p.buscado | 0)) { est.className = 'c2-apagado'; est.textContent = '—'; }
      return [nombreCon(p.nombre, [p.invitado ? 'invitado' : '', p.admin ? 'admin' : '']), hace(p.desde, datos.ahora), plata(p.plata), num(p.vida), p.enVehiculo ? String(p.enVehiculo) : '—', est, p.barrio || '—', p.telefono ? 'sí' : 'no'];
    })));
  }

  var COLS_JUG = [
    { titulo: 'Nombre', orden: 'nombre', v: function (x) { return (x.nombre || '').toLowerCase(); } },
    { titulo: 'Última vez', orden: 'ultimaVez', v: function (x) { return x.ultimaVez || 0; } },
    { titulo: 'Primera vez', orden: 'primeraVez', v: function (x) { return x.primeraVez || 0; } },
    { titulo: 'Tiempo jugado', orden: 'minutos', n: true, v: function (x) { return (x.numeros || {}).minutos || 0; } },
    { titulo: 'Plata', orden: 'plata', n: true, v: function (x) { return x.plata || 0; } },
    { titulo: 'Ganado', orden: 'ganado', n: true, v: function (x) { return (x.numeros || {}).ganado || 0; } },
    { titulo: 'Gastado', orden: 'gastado', n: true, v: function (x) { return (x.numeros || {}).gastado || 0; } },
    { titulo: 'Bajas', orden: 'bajas', n: true, v: function (x) { return (x.numeros || {}).bajas || 0; } },
    { titulo: 'Muertes', orden: 'muertes', n: true, v: function (x) { return (x.numeros || {}).muertes || 0; } },
    { titulo: 'Peatones', orden: 'peatones', n: true, v: function (x) { return (x.numeros || {}).peatones || 0; } },
    { titulo: 'Carreras', orden: 'carreras', n: true, v: function (x) { return (x.numeros || {}).carreras || 0; } },
    { titulo: 'Ganadas', orden: 'carrerasGanadas', n: true, v: function (x) { return (x.numeros || {}).carrerasGanadas || 0; } },
    { titulo: 'Entregas', orden: 'entregas', n: true, v: function (x) { return (x.numeros || {}).entregas || 0; } },
    { titulo: 'Viajes', orden: 'viajes', n: true, v: function (x) { return (x.numeros || {}).viajes || 0; } },
    { titulo: 'Armas', orden: 'armas', n: true, v: function (x) { return Array.isArray(x.armas) ? x.armas.length : 0; } },
    { titulo: 'Chaleco', orden: 'chaleco', n: true, v: function (x) { return x.chaleco || 0; } },
    { titulo: 'Vehículos', orden: 'vehiculos', n: true, v: function (x) { return x.vehiculos || 0; } },
    { titulo: 'Prendas', orden: 'prendas', n: true, v: function (x) { return x.prendas || 0; } },
  ];
  function pintarJugadores() {
    var c = datos && datos.capa2;
    S.jugCaja.textContent = '';
    var cuentas = c && Array.isArray(c.cuentas) ? c.cuentas : [];
    if (!c) { S.jugCaja.appendChild(el('div', 'c2-vacio', 'Sin datos del juego.')); return; }
    var q = estado.buscarJug.trim().toLowerCase();
    var lista = cuentas.filter(function (x) { return !q || String(x.nombre || '').toLowerCase().indexOf(q) >= 0; });
    var col = COLS_JUG.filter(function (k) { return k.orden === estado.ordenJug; })[0] || COLS_JUG[1];
    lista.sort(function (a, b) { var va = col.v(a), vb = col.v(b); return (va < vb ? -1 : va > vb ? 1 : 0) * estado.dirJug; });
    S.jug.sub.textContent = num(cuentas.length) + (cuentas.length === 1 ? ' cuenta' : ' cuentas') + (q ? ' · ' + num(lista.length) + ' con "' + estado.buscarJug.trim() + '"' : '');
    if (!lista.length) { S.jugCaja.appendChild(el('div', 'c2-vacio', q ? 'Nadie con ese nombre.' : 'Todavía no entró nadie.')); return; }
    var orden = { clave: estado.ordenJug, dir: estado.dirJug, cambiar: function (k) {
      if (estado.ordenJug === k) estado.dirJug = -estado.dirJug; else { estado.ordenJug = k; estado.dirJug = k === 'nombre' ? 1 : -1; }
      pintarJugadores();
    } };
    var marcas = {};
    (c.carreras || []).forEach(function (r) { if (r.record && r.record.uid != null) marcas[r.record.uid] = (marcas[r.record.uid] || 0) + 1; });
    S.jugCaja.appendChild(tabla(COLS_JUG, lista.map(function (x) {
      var n = x.numeros || {}, rec = marcas[x.uid];
      var ult = el('span', null, hace(x.ultimaVez, datos.ahora)); ult.title = fechaHora(x.ultimaVez);
      var pri = el('span', null, x.primeraVez ? fecha(x.primeraVez) : ''); pri.title = fechaHora(x.primeraVez);
      return [nombreCon(x.nombre, [rec ? (rec === 1 ? '1 récord' : rec + ' récords') : '']), ult, pri, minutos(n.minutos), plata(x.plata), plata(n.ganado), plata(n.gastado),
        num(n.bajas), num(n.muertes), num(n.peatones), num(n.carreras), num(n.carrerasGanadas), num(n.entregas), num(n.viajes),
        num(Array.isArray(x.armas) ? x.armas.length : 0), num(x.chaleco), num(x.vehiculos), num(x.prendas)];
    }), { orden: orden }));
  }

  function pintarDias() {
    var c = datos.capa2;
    S.dia.cuerpo.textContent = '';
    var pd = (c && c.porDia) || {};
    var dias = Object.keys(pd).sort().reverse();
    if (!dias.length) { S.dia.cuerpo.appendChild(el('div', 'c2-vacio', c ? 'Todavía no hay días anotados (empiezan el día que se instaló esta parte del juego).' : 'Sin datos del juego.')); return; }
    var cols = [{ titulo: 'Día' }].concat(COLUMNAS_DIA.map(function (k) { return { titulo: NOMBRE_COL[k], n: true }; }));
    S.dia.cuerpo.appendChild(tabla(cols, dias.map(function (d) { return [diaLindo(d)].concat(COLUMNAS_DIA.map(function (k) { return pd[d][k] ? num(pd[d][k]) : '—'; })); })));
  }

  function pintarEventos() {
    var c = datos && datos.capa2;
    var evs = c && Array.isArray(c.eventos) ? c.eventos.slice().reverse() : [];
    // los filtros: todos los tipos que hay (en el orden de siempre)
    var tipos = Object.keys(EVENTOS).filter(function (k) { return evs.some(function (e) { return e.tipo === k; }); });
    evs.forEach(function (e) { if (tipos.indexOf(e.tipo) < 0) tipos.push(e.tipo); });
    if (estado.filtroEv && tipos.indexOf(estado.filtroEv) < 0) estado.filtroEv = '';
    S.evTipos.textContent = '';
    var chip = function (k, label) {
      var b = el('button', 'c2-chip' + (estado.filtroEv === k ? ' actual' : ''), label); b.type = 'button';
      b.setAttribute('aria-pressed', String(estado.filtroEv === k));
      b.addEventListener('click', function () { estado.filtroEv = k; pintarEventos(); });
      S.evTipos.appendChild(b);
    };
    chip('', 'Todos');
    tipos.forEach(function (k) { var d = EVENTOS[k]; chip(k, d ? d[0] + ' ' + d[1] : k); });
    var q = estado.buscarEv.trim().toLowerCase();
    var lista = evs.filter(function (e) {
      if (estado.filtroEv && e.tipo !== estado.filtroEv) return false;
      return !q || (String(e.nombre || '') + ' ' + String(e.detalle || '')).toLowerCase().indexOf(q) >= 0;
    });
    S.evLista.textContent = '';
    if (!lista.length) { S.evLista.appendChild(el('div', 'c2-vacio', !c ? 'Sin datos del juego.' : evs.length ? 'Nada con ese filtro.' : 'Todavía no hay eventos (se anotan desde que se instaló esta parte del juego).')); return; }
    lista.forEach(function (e) {
      var d = EVENTOS[e.tipo] || ['•', e.tipo];
      var f = el('div', 'c2-ev');
      var t = el('span', 'c2-ev-t', fechaHora(e.t)); t.title = hace(e.t, datos.ahora);
      var x = el('span', 'c2-ev-x');
      x.appendChild(el('b', null, e.nombre || (e.uid == null ? 'Alguien' : '#' + e.uid)));
      var det = detalleEvento(e);
      x.appendChild(el('span', null, ' · ' + d[1] + (det ? ' (' + det + ')' : '')));
      f.append(t, el('span', 'c2-ev-i', d[0]), x);
      S.evLista.appendChild(f);
    });
  }

  function pintarCarreras() {
    var c = datos.capa2;
    S.carr.cuerpo.textContent = '';
    var lista = c && Array.isArray(c.carreras) ? c.carreras : [];
    if (!lista.length) { S.carr.cuerpo.appendChild(el('div', 'c2-vacio', c ? 'No hay carreras.' : 'Sin datos del juego.')); return; }
    var con = lista.filter(function (r) { return r.record; }).length;
    S.carr.sub.textContent = num(con) + ' de ' + num(lista.length) + ' con récord';
    S.carr.cuerpo.appendChild(tabla([{ titulo: 'Carrera' }, { titulo: 'Récord' }, { titulo: 'Tiempo', n: true }], lista.map(function (r) {
      return [r.nombre || ('#' + r.id), r.record ? (r.record.nombre || '?') : el('span', 'c2-apagado', 'sin récord'), r.record ? tiempo(r.record.ms) : '—'];
    })));
  }

  function dato(label, valor) { var d = el('div', 'c2-dato'); d.append(el('div', 'c2-dato-l', label), el('div', 'c2-dato-v', valor)); return d; }
  function pintarMundo() {
    var c = datos.capa2;
    S.mundo.cuerpo.textContent = '';
    if (!c) { S.mundo.cuerpo.appendChild(el('div', 'c2-vacio', 'Sin datos del juego.')); return; }
    var m = c.mundo || {}, s = c.servidor || {}, tk = s.tickMs || {};
    var hh = Number(m.hora) || 0, hs = Math.floor(hh) % 24, mm = Math.floor((hh - Math.floor(hh)) * 60);
    var g = el('div', 'c2-datos');
    g.append(dato('Hora en la ciudad', dosDig(hs) + ':' + dosDig(mm)), dato('Clima', m.clima || '—'), dato('Peatones', num(m.peatones)), dato('Policías', num(m.policias)),
      dato('Autos andando', num(m.autos)), dato('Vehículos (con los estacionados)', num(m.vehiculos)), dato('En llamas', num(m.enLlamas)), dato('Postes caídos', num(m.postesCaidos)),
      dato('Servidor encendido', s.arranco ? hace(s.arranco, datos.ahora).replace('hace ', '') : '—'), dato('Memoria', num(s.memoriaMB) + ' MB (heap ' + num(s.heapMB) + ')'),
      dato('Paso del servidor', (tk.promedio != null ? String(tk.promedio).replace('.', ',') : '?') + ' ms (peor ' + (tk.peor != null ? String(tk.peor).replace('.', ',') : '?') + ')'),
      dato('Sectores · máximo de gente', num(s.sectores) + ' · ' + num(s.maxJugadores)));
    S.mundo.cuerpo.appendChild(g);
    S.mundo.sub.textContent = 'versión ' + (c.version != null ? c.version : '?');
  }

  function pintar() {
    S.cuando.textContent = 'Actualizado ' + hora(datos.ahora) + ':' + dosDig(new Date(datos.ahora).getSeconds());
    S.error.hidden = !datos.error;
    S.error.textContent = datos.error ? '⚠️ ' + datos.error + ' Los gráficos de gente siguen con lo que anotó el chat.' : '';
    pintarTiles(); pintarGraficos(); pintarAhora(); pintarJugadores(); pintarDias(); pintarEventos(); pintarCarreras(); pintarMundo();
  }

  // ── Traer los datos (y mantenerlos al dia) ──
  function cargar() {
    if (pidiendo) return;
    pidiendo = true;
    raiz.classList.add('c2-cargando'); // (mientras llega lo nuevo queda lo anterior, un poco apagado)
    fetch(API, { headers: { Authorization: 'Bearer ' + token() } })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { st: r.status, d: d }; }); })
      .then(function (x) {
        if (x.st === 401 || x.st === 403) { raiz.textContent = ''; raiz.appendChild(el('p', 'c2-sin', 'Esta parte es solo para administradores.')); return; }
        if (!x.d || !x.d.ok) throw new Error('sin datos');
        datos = x.d;
        if (!S.tiles) armar();
        pintar();
      })
      .catch(function () {
        if (!datos) { raiz.textContent = ''; raiz.appendChild(el('p', 'c2-sin', 'No se pudieron traer los datos. Probá de nuevo en un rato.')); }
        else { S.error.hidden = false; S.error.textContent = '⚠️ No se pudo actualizar (se ven los datos de las ' + hora(datos.ahora) + ').'; }
      })
      .then(function () { pidiendo = false; raiz.classList.remove('c2-cargando'); });
  }
  // (solo mientras se ve: la pestaña del navegador y la de Admin; el marco queda oculto en las otras pestañas)
  function seVe() {
    if (document.visibilityState !== 'visible') return false;
    try { var f = window.frameElement; if (f && f.offsetParent === null) return false; } catch (e) { /* otro origen */ }
    return true;
  }
  setInterval(function () { if (seVe()) cargar(); }, 20000);
  document.addEventListener('visibilitychange', function () { if (seVe() && datos && Date.now() - datos.ahora > 20000) cargar(); });
  // los graficos se rearman al cambiar el ancho (con el de la caja)
  var anchoAntes = 0, esperaAncho = null;
  window.addEventListener('resize', function () {
    clearTimeout(esperaAncho);
    esperaAncho = setTimeout(function () { var w = raiz.clientWidth; if (datos && S.tiles && Math.abs(w - anchoAntes) > 8) { anchoAntes = w; pintarGraficos(); } }, 150);
  });
  cargar();
})();
