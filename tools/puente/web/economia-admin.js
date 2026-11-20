/* Admin → Economía (la pestaña del panel de administradores, en un marco): las monedas del club. Los datos los trae
   /puente/api/admin/monedas (monedas.js, solo administradores): cuanto hay, de donde sale, como se reparte, los que
   mas tienen y los ultimos movimientos. Se actualiza sola cada 30 segundos mientras se ve. Los nombres van siempre
   con textContent. */
(function () {
  'use strict';
  var API = '/puente/api/admin/monedas';
  var raiz = document.getElementById('c2');
  if (!raiz) return;

  function token() { try { return localStorage.getItem('haven_token') || ''; } catch (e) { return ''; } }
  function el(tag, cls, txt) { var n = document.createElement(tag); if (cls) n.className = cls; if (txt != null) n.textContent = txt; return n; }
  var NS = 'http://www.w3.org/2000/svg';
  function sv(tag, at) { var n = document.createElementNS(NS, tag); for (var k in at || {}) n.setAttribute(k, at[k]); return n; }
  function num(n) { return (Number(n) || 0).toLocaleString('es-AR'); }
  function dosDig(n) { return (n < 10 ? '0' : '') + n; }
  function fechaHora(t) { var d = new Date(t); return dosDig(d.getDate()) + '/' + dosDig(d.getMonth() + 1) + ' ' + dosDig(d.getHours()) + ':' + dosDig(d.getMinutes()); }

  // como se dice cada cosa
  var TIPOS = {
    'bienvenida': 'Bienvenida', 'primer-paso': 'Primeros pasos', 'partida': 'Partida (jugar)', 'partida-ganada': 'Partida ganada',
    'compu': 'Contra la compu', 'compu-ganada': 'Le ganó a la compu', 'desafio': 'Juego del día', 'tiempo-hotel': 'Tiempo en CV Hotel',
    'dia-activo': 'Día activo', 'racha': 'Racha de 7 días', 'semanal': 'Días charlando (semana)', 'reacciones': 'Reacciones (semana)',
    'podio': 'Podio de la semana', 'invitacion': 'Invitaciones'
  };
  var ORIGENES = { chat: 'Chat', juegos: 'Juegos', hotel: 'CV Hotel', capa2: 'Capa 2', admin: 'Admin', sistema: 'Sistema' };
  function tipoLindo(t) { return TIPOS[t] || t; }

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
  function delta(n) { var s = el('span', n >= 0 ? 'ec-mas' : 'ec-menos', (n >= 0 ? '+' : '−') + num(Math.abs(n))); return s; }

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
    var n = Math.max(dias.length, 1), bw = Math.max(2, ancho / n - 3);
    dias.forEach(function (d, i) {
      var h = (d.entra / tope) * alto, x = m.i + i * (ancho / n) + 1.5;
      var r = sv('rect', { x: x, y: m.a + alto - h, width: bw, height: Math.max(0, h), rx: 2, fill: 'var(--serie)' });
      var ti = sv('title'); ti.textContent = d.dia.slice(8, 10) + '/' + d.dia.slice(5, 7) + ': ' + num(d.entra) + ' monedas, ' + d.gente + ' personas'; r.appendChild(ti);
      g.appendChild(r);
      if (i === 0 || i === n - 1 || i % 7 === 0) { var t = sv('text', { x: x + bw / 2, y: H - 6, 'text-anchor': 'middle', fill: 'var(--apagado)', 'font-size': 11 }); t.textContent = d.dia.slice(8, 10) + '/' + d.dia.slice(5, 7); g.appendChild(t); }
    });
    return g;
  }

  function pintar(d) {
    raiz.textContent = ''; raiz.removeAttribute('aria-busy');
    var cab = el('div', 'c2-cab'), izq = el('div'), h1 = el('h1', null, 'Economía del club');
    var modo = el('span', 'ec-modo ' + (d.modo === 'activo' ? 'activo' : 'sombra'), d.modo === 'activo' ? 'Activa' : 'Modo sombra');
    h1.appendChild(modo); izq.appendChild(h1);
    izq.appendChild(el('p', 'c2-sub', d.modo === 'activo' ? 'Todos ven sus monedas y las pueden gastar.' : 'Se anota todo, pero nadie lo ve todavía (salvo los administradores) ni lo puede gastar.'));
    var der = el('div', 'c2-cab-der'), cuando = el('span', 'c2-cuando', 'Actualizado ' + fechaHora(Date.now())), b = el('button', 'c2-btn', 'Actualizar');
    b.type = 'button'; b.addEventListener('click', function () { cargar(); });
    der.append(cuando, b); cab.append(izq, der); raiz.appendChild(cab);

    var t = el('div', 'c2-tiles');
    t.append(
      tile('Cuentas con monedas', num(d.cuentas)),
      tile('Monedas en total', num(d.total), 'lo que tienen entre todos'),
      tile('Ganado', num(d.ganado), 'desde el principio'),
      tile('Gastado', num(d.gastado)),
      tile('Ganado en 7 días', num(d.reparto.total), d.reparto.gente + ' personas, sin bienvenida ni primeros pasos')
    );
    var cuadra = tile('¿Cierran las cuentas?', d.descuadres ? 'No' : 'Sí', d.descuadres ? d.descuadres + ' saldos no coinciden con sus movimientos' : 'cada saldo es la suma de sus movimientos');
    cuadra.querySelector('.c2-tile-v').className = 'c2-tile-v ' + (d.descuadres ? 'ec-mal' : 'ec-ok');
    t.appendChild(cuadra);
    raiz.appendChild(t);

    var s1 = seccion('Lo que entra cada día', 'últimos 30 días, sin la bienvenida');
    s1.appendChild(barras(d.dias || [])); raiz.appendChild(s1);

    var dos = el('div', 'c2-dos');
    var r = d.reparto, s2 = seccion('Cómo se reparte', 'lo ganado en los últimos 7 días, por persona');
    s2.appendChild(tabla([{ t: 'Medida' }, { t: 'Monedas', n: true }], [
      ['La mitad gana menos de', num(r.p50)], ['3 de cada 4 ganan menos de', num(r.p75)], ['9 de cada 10 ganan menos de', num(r.p90)],
      ['El que más ganó', num(r.max)], ['Lo que se lleva el 10% que más gana', r.top10pct + '%']
    ]));
    s2.appendChild(el('div', 'c2-sec-s', ' '));
    s2.appendChild(tabla([{ t: 'Los que más ganaron (7 días)' }, { t: 'Monedas', n: true }], (r.quienes || []).map(function (q) { return [q.nombre, num(q.n)]; })));
    var s3 = seccion('De dónde salen', 'últimos 7 días');
    s3.appendChild(tabla([{ t: 'Qué' }, { t: 'Dónde' }, { t: 'Veces', n: true }, { t: 'Entra', n: true }, { t: 'Sale', n: true }],
      (d.porOrigen || []).map(function (o) { return [tipoLindo(o.tipo), ORIGENES[o.origen] || o.origen, num(o.n), num(o.entra), num(o.sale)]; })));
    dos.append(s2, s3); raiz.appendChild(dos);

    var dos2 = el('div', 'c2-dos');
    var s4 = seccion('Los que más tienen');
    s4.appendChild(tabla([{ t: 'Cuenta' }, { t: 'Saldo', n: true }, { t: 'Ganado', n: true }, { t: 'Gastado', n: true }],
      (d.top || []).map(function (x) { return [x.nombre, num(x.saldo), num(x.ganado), num(x.gastado)]; })));
    var s5 = seccion('Últimos movimientos');
    s5.appendChild(tabla([{ t: 'Cuándo' }, { t: 'Cuenta' }, { t: 'Qué' }, { t: 'Monedas', n: true }],
      (d.ultimos || []).map(function (x) { return [fechaHora(x.t), x.nombre, tipoLindo(x.tipo) + (x.detalle ? ' · ' + x.detalle : ''), delta(x.delta)]; })));
    dos2.append(s4, s5); raiz.appendChild(dos2);
  }

  var timer = null, cargando = false;
  function cargar() {
    if (cargando) return; cargando = true;
    raiz.classList.add('c2-cargando');
    fetch(API, { headers: { Authorization: 'Bearer ' + token() }, cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
      .then(function (d) { pintar(d); })
      .catch(function (e) { raiz.textContent = ''; raiz.appendChild(el('p', 'c2-sin', e === 403 ? 'Solo para administradores.' : 'No se pudo cargar la economía.')); })
      .then(function () { cargando = false; raiz.classList.remove('c2-cargando'); });
    clearTimeout(timer);
    timer = setTimeout(function () { if (document.visibilityState === 'visible') cargar(); else timer = setTimeout(cargar, 30000); }, 30000);
  }
  cargar();
})();
