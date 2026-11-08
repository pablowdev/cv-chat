// Shoppa: el juego (turnos, cajas, armas, local y online). La fisica es motor.js y el mapa, mapas.js.
// Online: el que tiene el turno simula y les manda "fotos" del estado a los demas (shoppa.js en el servidor
// las retransmite y decide de quien es el turno siguiente), como Proyecto Gusanos.
// Reglas de Shopper: solo la soga para moverse, una caja por turno (caen en el mismo orden para todos:
// salen de la semilla de la partida), primero agarrar una caja y despues atacar, y se ataca desde la soga.
(function () {
  'use strict';
  const M = window.ShoppaMotor, MP = window.ShoppaMapas, C = M.C;
  const PASO = 20, TURNO = 30, RETIRADA = 3, VIDA = 150, MAX_CAJAS = 3;
  const COLORES = ['#ff6b6b', '#4aa3ff', '#62d26f', '#ffd23f', '#c77dff'];
  const $ = (id) => document.getElementById(id);
  // (x es let: los dibujos de los menus usan pintarSerpiente sobre otro canvas un momento)
  const cv = $('lienzo'); let x = cv.getContext('2d');

  // ── El estado de la partida ──
  let J = null, def = null, fondo = null, jug = [], turno = 0, fase = 'menu', tiempo = 0, quietos = 0;
  let cajaTomada = false, ataco = false, arma = 'soga', carga = null, semilla = 1, cajaN = 0, nTurno = 0;
  let textos = [], online = null, ultimaFoto = 0, vidaAntes = null, eqN = -1, iconoMano = null;
  const cam = { x: 960, y: 450, z: 2 };

  // ── Azar con semilla (las cajas, en el mismo orden para todos) ──
  function azar(s) { let a = s >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function puntoCaja(k) {
    // una vuelta por los puntos del mapa, mezclados con la semilla; despues, otra vuelta (otra mezcla)
    const n = def.cajas.length, vuelta = Math.floor(k / n), r = azar(semilla + vuelta * 977);
    const orden = def.cajas.map((p, i) => [r(), i]).sort((a, b) => a[0] - b[0]).map(z => z[1]);
    return def.cajas[orden[k % n]];
  }
  const contenidoCaja = (k) => (azar(semilla * 31 + k * 7919)() < 0.5 ? 'bazooka' : 'granada');

  // ── Empezar ──
  function nuevaPartida(nombres, sem, primero) {
    def = MP.porId('fabrica');
    const T = MP.terreno(M, def);
    fondo = MP.pintar(def, T);
    J = M.nuevoJuego(T);
    semilla = sem >>> 0; cajaN = 0; nTurno = 0; textos = [];
    const r = azar(semilla + 5), salidas = def.salidas.map((p, i) => [r(), p]).sort((a, b) => a[0] - b[0]).map(z => z[1]);
    jug = nombres.map((n, i) => {
      const p = salidas[i % salidas.length], s = new M.Serpiente(p[0], p[1] - 9);
      // (al aparecer caen hasta el piso: esa primera caida no lastima)
      s.vida = VIDA; s.dir = p[0] < def.w / 2 ? 1 : -1; s.sinCaida = true;
      return { nombre: n, color: COLORES[i % COLORES.length], armas: { bazooka: 0, granada: 0 }, serp: s };
    });
    J.serps = jug.map(j => j.serp);
    // dos cajas para arrancar
    for (let k = 0; k < 2; k++) soltarCaja();
    turno = primero || 0;
    cam.z = Math.max(1, Math.min(2.4, innerHeight / 470));
    $('hud').hidden = false; $('armas').hidden = true; panel = false; eqN = -1;
    if (matchMedia('(pointer: coarse)').matches) $('tactil').hidden = false;
    $('menu').hidden = true;
  }

  function soltarCaja() {
    const p = puntoCaja(cajaN);
    M.caja(J, p[0], Math.max(40, p[1] - 220), contenidoCaja(cajaN));
    cajaN++;
  }

  // antes de cada turno, como en el juego clasico: 5 segundos para prepararse (el reloj queda gris y arriba
  // dice cuanto falta); el turno arranca con la primera tecla o cuando se acaban
  const LISTO = 5;
  let listo = 0, comentario = null;
  function empezarTurno(viento) {
    fase = 'listo'; listo = LISTO * 50; tiempo = TURNO * 50; quietos = 0; cajaTomada = false; ataco = false; arma = 'soga'; carga = null;
    nTurno++;
    J.viento = viento != null ? viento : Math.round(azar(semilla + nTurno * 31)() * 140 - 70);
    const s = jug[turno].serp;
    s.estado = s.estado === 'muerta' ? 'muerta' : 'aire'; s.vx = 0; s.vy = 0; s.soga = null; s.gancho = null; s.sogaAng = null; s.sinControl = false;
    vidaAntes = s.vida;
    if (simulaYo() && J.cosas.filter(g => g.tipo === 'caja').length < MAX_CAJAS) soltarCaja();
    // (lo que se apreto mirando el turno de otro no cuenta para arrancar)
    for (const k in recien) recien[k] = false;
    // si recien se murio alguna, primero se comenta eso (la cuenta sigue al segundo siguiente)
    if (comentario) { aviso(comentario[0], comentario[1]); comentario = null; }
    else aviso(`${jug[turno].nombre}${online && turno === online.miSeat ? ' (vos)' : ''}: ${LISTO} seg`, jug[turno].color);
    pintarArmas();
  }

  // ¿quien simula? En local, siempre; online, el que tiene el turno
  const simulaYo = () => !online || turno === online.miSeat;
  const juegoYo = () => fase !== 'menu' && fase !== 'fin' && simulaYo();

  // ── Los controles (los del juego clasico) ──
  const apretada = {}, recien = {};
  const TECLAS = { ArrowLeft: 'izq', ArrowRight: 'der', ArrowUp: 'arr', ArrowDown: 'aba', Enter: 'enter', Backspace: 'retro', ' ': 'espacio', Shift: 'shift' };
  addEventListener('keydown', (e) => {
    if (e.target && /input|textarea/i.test(e.target.tagName)) return;
    const k = TECLAS[e.key];
    if (k) { e.preventDefault(); if (!apretada[k]) recien[k] = true; apretada[k] = true; return; }
    if (/^[1-5]$/.test(e.key) && J) { J.mecha = Number(e.key); if (arma === 'granada' && juegoYo()) aviso(`Granada, ${J.mecha} seg`, jug[turno].color); }
    if (e.key === 'q' || e.key === 'Q') ciclarArma(-1);
    if (e.key === 'e' || e.key === 'E') ciclarArma(1);
    if (e.key === 'r' || e.key === 'R') elegirArma('soga');
    if (e.key === '+' || e.key === '=') cam.z = Math.min(4, cam.z + 0.25);
    if (e.key === '-') cam.z = Math.max(0.6, cam.z - 0.25);
    if (e.key === 'Tab') { e.preventDefault(); abrirPanel(); }
    if (e.key === 'Escape') abrirPanel(false);
    if (e.key === 'F1') { e.preventDefault(); elegirArma('bazooka'); }
    if (e.key === 'F2') { e.preventDefault(); elegirArma('granada'); }
  });
  // el panel de armas: clic derecho lo abre y cierra; un clic en el mapa lo cierra
  cv.addEventListener('contextmenu', (e) => { e.preventDefault(); abrirPanel(); });
  cv.addEventListener('pointerdown', (e) => { if (e.button === 0 && panel) abrirPanel(false); });
  $('armaBtn').addEventListener('click', () => abrirPanel());
  addEventListener('keyup', (e) => { const k = TECLAS[e.key]; if (k) apretada[k] = false; });
  addEventListener('blur', () => { for (const k in apretada) apretada[k] = false; });
  for (const b of document.querySelectorAll('[data-k]')) {
    const k = b.dataset.k;
    const on = (e) => { e.preventDefault(); if (k === 'fin') { if (juegoYo() && (fase === 'mover' || fase === 'listo')) { fase = 'esperando'; } return; } if (!apretada[k]) recien[k] = true; apretada[k] = true; };
    const off = (e) => { e.preventDefault(); apretada[k] = false; };
    b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('pointerleave', off);
  }

  const ARMAS_ORDEN = ['soga', 'bazooka', 'granada'];
  function puede(a) { return a === 'soga' || (jug[turno] && jug[turno].armas[a] > 0); }
  // elegir un arma (arranca el turno si estaba preparandose) y avisarlo arriba, como en el juego clasico
  function elegirArma(a) {
    if (!juegoYo() || !puede(a)) return;
    if (fase === 'listo') fase = 'mover';
    const cambio = arma !== a; arma = a; carga = null; pintarArmas();
    if (cambio) aviso(a === 'granada' ? `Granada, ${J.mecha || 3} seg` : `${NOMBRE_ARMA[a]} (${cantidad(a)})`, jug[turno].color);
  }
  function ciclarArma(d) { let i = ARMAS_ORDEN.indexOf(arma); for (let k = 0; k < 3; k++) { i = (i + d + 3) % 3; if (puede(ARMAS_ORDEN[i])) return elegirArma(ARMAS_ORDEN[i]); } }
  // ── El panel de armas: una grilla con una fila por tecla (Util = la soga, F1, F2) ──
  const NOMBRE_ARMA = { soga: 'Soga', bazooka: 'Bazuca', granada: 'Granada' };
  const FILAS_ARMAS = [['Util', ['soga']], ['F1', ['bazooka']], ['F2', ['granada']]];
  let panel = false;
  const cantidad = (a) => (a === 'soga' ? '∞' : (jug[turno] && jug[turno].armas[a]) || 0);
  function abrirPanel(v) {
    panel = v === undefined ? !panel : !!v;
    if (!J || fase === 'menu' || fase === 'fin') panel = false;
    $('armas').hidden = !panel;
    if (panel) pintarArmas();
  }
  // los iconos (dibujos propios): la soga enrollada con el gancho, la bazuca y la granada
  function icono(c, a) {
    const g = c.getContext('2d'), k = c.width / 24;
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, c.width, c.height); g.setTransform(k, 0, 0, k, 0, 0);
    g.lineCap = 'round'; g.lineJoin = 'round';
    if (a === 'soga') {
      g.strokeStyle = '#6b4b25'; g.lineWidth = 3.2;
      for (let i = 0; i < 3; i++) { g.beginPath(); g.ellipse(10 + i * 0.6, 15 - i * 1.6, 7, 3.6, -0.15, 0, Math.PI * 2); g.stroke(); }
      g.strokeStyle = '#e2c48a'; g.lineWidth = 1.8;
      for (let i = 0; i < 3; i++) { g.beginPath(); g.ellipse(10 + i * 0.6, 15 - i * 1.6, 7, 3.6, -0.15, 0, Math.PI * 2); g.stroke(); }
      g.strokeStyle = '#e2c48a'; g.beginPath(); g.moveTo(16, 10); g.lineTo(19, 6); g.stroke();
      g.strokeStyle = '#cfd6de'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(19, 6); g.lineTo(20.5, 3); g.arc(19, 3.4, 1.6, 0, Math.PI, true); g.stroke();
    } else if (a === 'bazooka') {
      g.translate(12, 13); g.rotate(-0.55);
      g.fillStyle = '#26301c'; g.fillRect(-10.5, -3.6, 21, 7.2);
      g.fillStyle = '#6f8150'; g.fillRect(-9.5, -2.6, 19, 5.2);
      g.fillStyle = '#93a86c'; g.fillRect(-9.5, -2.6, 19, 1.6);
      g.fillStyle = '#e0763a'; g.fillRect(6.5, -2.6, 2, 5.2);
      g.fillStyle = '#26301c'; g.fillRect(-11.5, -4.4, 2.4, 8.8); g.fillRect(-2, 2.4, 2.6, 4.2);
    } else {
      g.fillStyle = '#1d3a19'; g.beginPath(); g.ellipse(12, 15, 7.2, 7.6, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#3f7d36'; g.beginPath(); g.ellipse(12, 15, 6, 6.4, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#7cc06e'; g.beginPath(); g.ellipse(9.6, 12.4, 2, 1.4, -0.6, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#9aa3ad'; g.fillRect(9.6, 5.2, 4.8, 3.4); g.fillStyle = '#5d646c'; g.fillRect(9.6, 7.6, 4.8, 1);
      g.strokeStyle = '#d7dde3'; g.lineWidth = 1.3; g.beginPath(); g.arc(17, 5.4, 2.2, 0, Math.PI * 2); g.stroke();
    }
  }
  function pintarArmas() {
    if (!J) return;
    // el boton con el arma en la mano
    const bt = $('armaBtn');
    icono(bt.firstElementChild, arma); bt.lastElementChild.textContent = NOMBRE_ARMA[arma] + ' ×' + cantidad(arma);
    const b = $('armas'); if (b.hidden) return;
    b.textContent = '';
    const grilla = div('grilla'), pie = div('pie'), pn = h('span', ''), pc = h('span', '');
    const mostrar = (a) => { pn.textContent = NOMBRE_ARMA[a]; pc.textContent = '×' + cantidad(a); };
    for (const [rot, armas] of FILAS_ARMAS) {
      grilla.appendChild(h('div', rot)).className = 'rot';
      for (let k = 0; k < 5; k++) {
        const a = armas[k], c = document.createElement('button'); c.type = 'button'; c.className = 'celda';
        if (a) {
          const ic = document.createElement('canvas'); ic.width = ic.height = 60; icono(ic, a); c.appendChild(ic);
          if (arma === a) c.classList.add('sel');
          c.disabled = !juegoYo() || !puede(a); c.title = NOMBRE_ARMA[a];
          c.addEventListener('click', () => { elegirArma(a); abrirPanel(false); });
          c.addEventListener('mouseenter', () => mostrar(a));
          c.addEventListener('mouseleave', () => mostrar(arma));
        } else c.disabled = true;
        grilla.appendChild(c);
      }
    }
    mostrar(arma); pie.append(pn, pc);
    b.append(grilla, pie);
  }

  // puede atacar: tiene que haber agarrado una caja este turno (regla de Shopper) y no haber atacado
  function atacar(fn) {
    if (ataco) return;
    if (!cajaTomada) { aviso('Primero agarrá una caja'); return; }
    if (!(jug[turno].armas[arma] > 0)) return;
    jug[turno].armas[arma]--; ataco = true; fn();
    fase = 'retirada'; tiempo = RETIRADA * 50; pintarArmas();
  }

  function entradaDelPaso() {
    const s = jug[turno].serp;
    const e = { izq: apretada.izq, der: apretada.der, arr: apretada.arr, aba: apretada.aba, shift: apretada.shift, enter: recien.enter, retro: recien.retro, soga: false };
    if (fase === 'esperando' || fase === 'listo') { for (const k in recien) recien[k] = false; return {}; }
    if (arma === 'soga') e.soga = recien.espacio;
    else if (s.estado === 'suelo') {
      // en el piso: Espacio carga y al soltar tira
      if (recien.espacio && !ataco) carga = 0;
      if (carga !== null) {
        if (apretada.espacio && carga < 1) carga = Math.min(1, carga + 1 / C.CARGA);
        else { const c = carga; carga = null; atacar(() => M.lanzar(J, s, c, arma)); }
      }
    }
    // colgado o en el aire: Enter suelta el arma (atacar desde la soga)
    if ((s.estado === 'soga' || s.estado === 'aire') && e.enter && arma !== 'soga') { e.enter = false; atacar(() => M.soltar(J, s, arma)); }
    // con un arma en la mano y colgado, Espacio igual suelta la soga
    if (arma !== 'soga' && s.estado === 'soga' && recien.espacio) e.soga = true;
    for (const k in recien) recien[k] = false;
    return e;
  }

  // ── Un paso del juego (el que simula) ──
  function paso() {
    const yo = jug[turno], s = yo.serp;
    // preparandose: la primera tecla (o el fin de la cuenta) arranca el turno
    if (fase === 'listo') {
      const algo = Object.keys(recien).some(k => recien[k]); // (solo teclas apretadas en este turno)
      if (algo || --listo <= 0) fase = 'mover';
      else if (listo % 50 === 0) aviso(`${yo.nombre}: ${listo / 50} seg`, yo.color);
    }
    const entradas = jug.map((j, i) => (i === turno ? entradaDelPaso() : {}));
    M.pasoJuego(J, entradas);
    // agarrar cajas
    for (const g of J.cosas) {
      if (g.tipo !== 'caja' || g.fin || s.estado === 'muerta') continue;
      if (Math.abs(g.x - s.x) < 12 && Math.abs(g.y - s.y) < 16) {
        g.fin = true; yo.armas[g.n] = (yo.armas[g.n] || 0) + 1; cajaTomada = true;
        texto(g.x, g.y - 16, '+1 ' + M.ARMAS[g.n].nombre, '#ffd23f'); pintarArmas();
      }
    }
    J.cosas = J.cosas.filter(g => !g.fin);
    for (const ev of J.eventos) if (ev.tipo === 'dano') texto(ev.x, ev.y, '-' + ev.n, '#ff8a8a');
    J.eventos = [];
    // al agua: se comenta arriba
    for (const j of jug) { if (j.serp.estado === 'muerta' && j.estAnt && j.estAnt !== 'muerta' && !j.comentada) { j.comentada = true; aviso(frase(AL_AGUA, j.nombre), j.color); } j.estAnt = j.serp.estado; }
    // la caida que lastima corta el turno (como en el juego clasico)
    if (fase === 'mover' || fase === 'retirada') {
      if (s.vida < vidaAntes && s.caida) { fase = 'esperando'; aviso('¡Se golpeó!'); s.caida = 0; }
      if (s.estado === 'muerta' || s.vida <= 0) fase = 'esperando';
    }
    // el reloj
    if (fase === 'mover' || fase === 'retirada') { if (--tiempo <= 0) fase = 'esperando'; }
    if (fase === 'esperando') {
      if (s.soga) { s.soga = null; s.estado = 'aire'; }
      quietos = M.quieto(J) ? quietos + 1 : 0;
      if (quietos > 25) terminarTurno();
    }
    if (online && ++ultimaFoto % 4 === 0) online.socket.emit('shoppa:snapshot', { id: online.id, snapshot: foto() });
  }

  function terminarTurno() {
    // las que quedaron sin vida, mueren
    for (const j of jug) if (j.serp.vida <= 0 && j.serp.estado !== 'muerta') { j.serp.estado = 'muerta'; j.comentada = true; texto(j.serp.x, j.serp.y - 20, '💀', '#fff'); comentario = [frase(SE_MUERE, j.nombre), j.color]; aviso(comentario[0], comentario[1]); }
    fase = 'pasando';
    if (online) { online.socket.emit('shoppa:finTurno', { id: online.id, snapshot: foto() }); return; }
    const vivos = jug.map((j, i) => i).filter(i => jug[i].serp.estado !== 'muerta');
    if (vivos.length <= 1) return fin(vivos.length ? vivos[0] : null);
    for (let k = 1; k <= jug.length; k++) { const i = (turno + k) % jug.length; if (vivos.includes(i)) { turno = i; break; } }
    empezarTurno();
  }

  function fin(ganador) {
    fase = 'fin';
    const m = $('menu'); m.hidden = false; m.textContent = '';
    const c = caja();
    c.append(h('h1', ganador == null ? 'Empate' : `¡Ganó ${jug[ganador].nombre}!`), p('Shopper: el último que queda gana.'));
    const acc = div('acc');
    if (online) {
      acc.append(boton('Revancha', 'primario', () => online.socket.emit('shoppa:revancha', { id: online.id }, (r) => { if (r && r.error) aviso(r.error); else aviso('Esperando a los demás…'); })));
      acc.append(boton('Salir', '', () => salirOnline()));
    } else acc.append(boton('Otra', 'primario', () => menuLocal()), boton('Menú', '', () => menuPrincipal()));
    c.appendChild(acc); m.appendChild(c);
  }

  // ── La foto del estado (online) ──
  const r1 = (v) => Math.round(v * 100) / 100;
  function foto() {
    return {
      mapa: 'fabrica', turno, fase, tiempo, cajaN, nTurno, cajaTomada, ataco, arma, viento: J.viento,
      gusanos: jug.map((j, i) => ({ equipo: i, muerto: j.serp.estado === 'muerta' })),
      armas: jug.map(j => j.armas),
      serps: J.serps.map(s => ({ x: r1(s.x), y: r1(s.y), vx: r1(s.vx), vy: r1(s.vy), estado: s.estado, dir: s.dir, mira: r1(s.mira), vida: s.vida, soga: s.soga, gancho: s.gancho, sogaAng: s.sogaAng, sinControl: s.sinControl, rueda: s.rueda, fase: s.fase || 0, giro: s.giro || 0, aireT: s.aireT || 0 })),
      cosas: J.cosas.map(g => ({ ...g })),
      efectos: J.efectos.filter(e => e.t < 3),
      textos: textos.filter(t => t.v > 1.6).map(t => ({ ...t })), aviso: avisoUlt,
    };
  }
  function aplicar(f) {
    if (!f || !J) return;
    fase = f.fase === 'pasando' ? 'esperando' : f.fase; tiempo = f.tiempo; cajaN = f.cajaN; nTurno = f.nTurno || nTurno;
    cajaTomada = f.cajaTomada; ataco = f.ataco; arma = f.arma || 'soga'; J.viento = f.viento || 0;
    (f.armas || []).forEach((a, i) => { if (jug[i]) jug[i].armas = a; });
    (f.serps || []).forEach((d, i) => {
      const s = J.serps[i]; if (!s) return;
      Object.assign(s, d);
      const u = s.cola[0]; if (!u || Math.abs(u[0] - s.x) + Math.abs(u[1] - s.y) >= 1.2) { s.cola.unshift([s.x, s.y]); if (s.cola.length > 40) s.cola.pop(); }
    });
    J.cosas = (f.cosas || []).map(g => ({ ...g }));
    for (const e of f.efectos || []) if (!J.efectos.some(z => z.x === e.x && z.y === e.y)) J.efectos.push({ ...e });
    for (const t of f.textos || []) if (!textos.some(z => z.x === t.x && z.y === t.y && z.s === t.s)) textos.push({ ...t });
    // el mensaje de arriba del que juega (y las que ya murieron no se vuelven a comentar aca)
    if (f.aviso && f.aviso.id !== avisoVisto) { avisoVisto = f.aviso.id; mostrarAviso(f.aviso.t, f.aviso.c); }
    for (const j of jug) { j.estAnt = j.serp.estado; if (j.serp.estado === 'muerta') j.comentada = true; }
    pintarArmas();
  }

  // ── El bucle: 50 pasos por segundo fijos ──
  let acc = 0, ant = performance.now();
  function bucle(ahora) {
    acc += Math.min(200, ahora - ant); ant = ahora;
    while (acc >= PASO) {
      if (J && fase !== 'menu' && fase !== 'fin' && fase !== 'pasando') {
        if (simulaYo()) paso();
        else if ((fase === 'mover' || fase === 'retirada') && tiempo > 0) tiempo--; // (el reloj, entre fotos)
      }
      acc -= PASO;
    }
    if (J) dibujar(ahora);
    requestAnimationFrame(bucle);
  }
  requestAnimationFrame(bucle);
  function tam() { const d = Math.min(2, devicePixelRatio || 1); cv.width = innerWidth * d; cv.height = innerHeight * d; cv.style.width = innerWidth + 'px'; cv.style.height = innerHeight + 'px'; }
  tam(); addEventListener('resize', tam);

  // ── El dibujo ──
  function texto(px, py, s, col) { textos.push({ x: px, y: py, s, col, v: 1.8 }); }
  let avisoT = null;
  // el mensaje de arriba (en el color del equipo, como en el juego clasico)
  let avisoUlt = null, avisoVisto = null, avisoN = 0;
  function mostrarAviso(t, color) { const a = $('aviso'); a.textContent = t; a.style.color = color || '#fff'; a.style.opacity = 1; clearTimeout(avisoT); avisoT = setTimeout(() => { a.style.opacity = 0; }, 2200); }
  // (el mensaje viaja en la foto: los demas jugadores lo ven igual)
  function aviso(t, color) { mostrarAviso(t, color); avisoUlt = { id: Date.now().toString(36) + '-' + (++avisoN), t, c: color || '#fff' }; }
  // lo que se comenta cuando una se muere (frases propias)
  const AL_AGUA = ['{n} se tiró a nadar sin flotador', 'Glu, glu… {n}', '{n} se fue a pescar y no volvió'];
  const SE_MUERE = ['¡Chau, {n}!', '{n} pasó a mejor vida', 'Pobre {n}…'];
  const frase = (l, n) => l[Math.floor(Math.random() * l.length)].replace('{n}', n);

  // la inclinacion del piso debajo (las serpientes se acuestan con la pendiente, hasta ~30 grados)
  function pendiente(s) {
    const T = J.T, alto = (px) => { for (let k = -10; k <= 14; k++) if (T.solido(px, s.y + 8 + k)) return k; return null; };
    const a = alto(s.x - 5), b = alto(s.x + 5);
    if (a === null || b === null) return 0;
    return Math.max(-0.55, Math.min(0.55, Math.atan2(b - a, 10)));
  }
  function pintarSerpiente(s, t) {
    if (s.estado === 'muerta') return;
    let inc = 0;
    const D = s.dir;
    if (s.soga) { const p = s.soga.piv[s.soga.piv.length - 1]; inc = Math.max(-0.45, Math.min(0.45, Math.atan2(p.x - s.x, s.y - p.y))); }
    else if (s.estado === 'suelo' || s.estado === 'desliza') inc = pendiente(s);
    else if (s.estado === 'aire') inc = s.giro ? -D * Math.PI * 2 * Math.min(1, (s.aireT || 0) / 42) : Math.max(-0.35, Math.min(0.35, s.vx * 0.06));
    // el giro se suaviza (que no salte de un pixel al otro), salvo el del mortal
    if (s.estado === 'aire' && s.giro) s.inc = inc;
    else {
      // (despues del mortal queda en una vuelta entera: se lleva a -pi..pi para que no gire para atras)
      if (s.inc !== undefined) s.inc = Math.atan2(Math.sin(s.inc), Math.cos(s.inc));
      s.inc = (s.inc === undefined ? inc : s.inc + (inc - s.inc) * 0.35);
    }
    // colgada (como en el juego clasico, medido en video): agarrada de la soga con la cabeza, el cuerpo casi
    // perpendicular a la soga, para atras de donde mira, y todo gira con la soga. Despues de soltarla va
    // enrollada y rueda (s.rueda, del motor)
    const pose = s.soga ? 'colgada' : (s.estado === 'aire' && Number.isFinite(s.sogaAng) && !s.giro ? 'rueda' : null);
    if (pose === 'colgada') {
      const p = s.soga.piv[s.soga.piv.length - 1];
      s.inc = undefined;
      x.save(); x.translate(s.x, s.y - 6); x.rotate(Math.atan2(p.x - s.x, (s.y - 6) - p.y));
    } else if (pose === 'rueda') {
      // el giro se lleva en el dibujo, con el tiempo (1/16 de radian por pixel, a 50 pasos por segundo): asi
      // tambien se ve bien en las pantallas de los demas, que reciben la velocidad cada tanto
      s.inc = undefined;
      const pasos = s.tRueda ? Math.min(6, (t - s.tRueda) / 20) : 0;
      s.ruedaVis = (s.ruedaVis || 0) + s.vx * M.C.RUEDA * pasos; s.tRueda = t;
      x.save(); x.translate(s.x, s.y); x.rotate(s.ruedaVis);
    }
    if (pose !== 'rueda') s.tRueda = 0;
    if (pose) {
      // los puntos del cuerpo (de la cola a la cabeza) y donde va la cabeza
      let ctrl, hx, hy;
      if (pose === 'colgada') {
        ctrl = [[-D * 16.5, 2.6], [-D * 13.2, 4.6], [-D * 9.6, 5.8], [-D * 6.0, 6.2], [-D * 2.8, 5.6], [-D * 0.4, 4.6], [D * 1.4, 4.2], [D * 1.6, 3.6]];
        hx = D * 1.8; hy = 2.6;
      } else {
        // enrollada como una C (la cola y la cabeza casi se tocan)
        const arco = (g) => { const a = g * Math.PI / 180; return [D * Math.cos(a) * 6.2, -Math.sin(a) * 6.2 + 1]; };
        ctrl = [205, 167, 129, 91, 53, 15, -23, -61].map(arco);
        [hx, hy] = arco(-98);
      }
      dibujarCuerpo(ctrl, hx, hy, D);
      x.restore();
      return;
    }
    const mov = s.estado === 'suelo' && s.cola.length > 1 && Math.abs(s.cola[0][0] - s.cola[1][0]) > 0.1;
    // caminando: como en el juego clasico, avanza de a empujones; en el empujon el cuerpo se estira para
    // adelante y baja la cabeza, y despues se vuelve a juntar (sigue el paso del motor, s.fase de 18)
    const u = mov ? ((s.fase || 0) % 18) / 18 : 0;
    const est = mov ? Math.max(0, Math.sin((u - 0.22) / 0.5 * Math.PI)) * (u > 0.22 && u < 0.72 ? 1 : 0) : 0;
    const ond = Math.sin(t / 260) * (mov ? 0 : 0.5);
    x.save(); x.translate(s.x, s.y); x.rotate(s.inc);
    const o = ond * 0.6, e1 = est * 2.2, e2 = est * 1.6;
    // la forma (de la cola a la cabeza): punta de la cola apoyada atras, una joroba, la panza abajo,
    // el pecho que sale para adelante y el cuello que sube a la cabeza; caminando la joroba se aplana
    const ctrl = [[-D * (7.8 + e2 * 0.5), 7.2], [-D * (7.0 + e2 * 0.4), 4.6 + e1 * 0.5], [-D * (5.2 + e2 * 0.3), 2.6 + e1 * 1.0], [-D * (3.4 + e2 * 0.2), 5.8 + e1 * 0.4], [-D * 1.0, 6.9], [D * (1.3 + e1 * 0.5), 4.0 + e2 * 0.3 + o * 0.2], [D * (0.6 + e1 * 0.9) + o, 0.0 + e2 * 0.7], [D * (1.0 + e1 * 1.3) + o * 0.5, -3.6 + e2 * 1.1]];
    dibujarCuerpo(ctrl, D * (0.8 + e1 * 1.3), -7.6 + e2 * 1.1, D);
    x.restore();
  }

  // el cuerpo y la cabeza de una serpiente, ya ubicada y girada: ctrl son los puntos de la cola a la cabeza
  function dibujarCuerpo(ctrl, hx, hy, D) {
    const anchos = [3.2, 3.0, 3.4, 4.0, 4.8, 5.0, 4.8, 5.2];
    const pts = [], an = [];
    for (let k = 0; k < ctrl.length - 1; k++) {
      const p0 = ctrl[Math.max(0, k - 1)], p1 = ctrl[k], p2 = ctrl[k + 1], p3 = ctrl[Math.min(ctrl.length - 1, k + 2)];
      for (let u = 0; u < 1; u += 0.25) {
        const u2 = u * u, u3 = u2 * u, f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u2 + (-a + 3 * b - 3 * c + d) * u3);
        pts.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]); an.push(anchos[k] + (anchos[k + 1] - anchos[k]) * u);
      }
    }
    pts.push(ctrl[ctrl.length - 1]); an.push(anchos[anchos.length - 1]);
    const trazo = (extra, color) => { x.strokeStyle = color; x.lineCap = 'round'; x.lineJoin = 'round'; for (let k = 1; k < pts.length; k++) { x.lineWidth = an[k] + extra; x.beginPath(); x.moveTo(pts[k - 1][0], pts[k - 1][1]); x.lineTo(pts[k][0], pts[k][1]); x.stroke(); } };
    // cabeza y cuerpo son una sola pieza: primero el borde de todo junto, despues el relleno de todo
    const cab =(extra, color) => { x.fillStyle = color; x.beginPath(); x.ellipse(hx, hy, 4.6 + extra, 4.9 + extra, D * 0.15, 0, Math.PI * 2); x.fill(); };
    trazo(1.4, '#b9805c'); cab(0.7, '#b9805c'); trazo(0, '#f1c6a2'); cab(0, '#f1c6a2');
    x.strokeStyle = '#fbe4cf'; x.lineWidth = 0.9; x.beginPath(); const k0 = Math.floor(pts.length * 0.55); x.moveTo(pts[k0][0] + D * 1.2, pts[k0][1]); for (let k = k0 + 1; k < pts.length - 2; k++) x.lineTo(pts[k][0] + D * 1.1, pts[k][1]); x.stroke();
    // los ojos grandes (el de adelante un poco mas chico), mirando para donde va
    for (const [ex, r] of [[1.0, 1.35], [3.3, 1.2]]) {
      const cx = hx + D * ex, cy = hy - 0.6;
      x.fillStyle = '#fff'; x.beginPath(); x.ellipse(cx, cy, r, 1.9, 0, 0, Math.PI * 2); x.fill();
      x.strokeStyle = '#5a3a28'; x.lineWidth = 0.35; x.stroke();
      x.fillStyle = '#111'; x.beginPath(); x.ellipse(cx + D * 0.45, cy + 0.3, 0.6, 0.95, 0, 0, Math.PI * 2); x.fill();
    }
    // las cejas y la sonrisa
    x.strokeStyle = '#3a2418'; x.lineWidth = 0.75; x.lineCap = 'round'; x.beginPath();
    x.moveTo(hx - D * 0.2, hy - 3.0); x.lineTo(hx + D * 1.8, hy - 3.4); x.moveTo(hx + D * 2.6, hy - 3.4); x.lineTo(hx + D * 4.0, hy - 3.0); x.stroke();
    x.strokeStyle = '#9c6648'; x.lineWidth = 0.5; x.beginPath(); x.arc(hx + D * 2.6, hy + 1.9, 1.1, 0.2 * Math.PI, 0.8 * Math.PI); x.stroke();
  }

  function dibujar(t) {
    const W = cv.width, H = cv.height, d = Math.min(2, devicePixelRatio || 1), z = cam.z * d;
    // la camara: lo que vuela (si hay) o la serpiente del turno
    const vuela = J.cosas.find(g => g.tipo !== 'caja');
    const s0 = jug[turno] && jug[turno].serp;
    const obj = vuela || s0 || { x: def.w / 2, y: def.h / 2 };
    cam.x += (obj.x - cam.x) * 0.1; cam.y += (obj.y - cam.y) * 0.1;
    const vw = W / z, vh = H / z;
    const vx = vw >= def.w ? def.w / 2 : Math.max(vw / 2, Math.min(def.w - vw / 2, cam.x));
    const vy = vh >= def.h ? def.h / 2 : Math.max(vh / 2, Math.min(def.h - vh / 2 + 40, cam.y));
    x.setTransform(1, 0, 0, 1, 0, 0);
    const cielo = x.createLinearGradient(0, 0, 0, H); cielo.addColorStop(0, def.cielo[0]); cielo.addColorStop(0.6, def.cielo[1]); cielo.addColorStop(1, def.cielo[2]);
    x.fillStyle = cielo; x.fillRect(0, 0, W, H);
    x.setTransform(z, 0, 0, z, Math.round(W / 2 - vx * z), Math.round(H / 2 - vy * z));
    x.imageSmoothingEnabled = false;
    x.drawImage(fondo, 0, 0);
    // las cajas
    for (const g of J.cosas) if (g.tipo === 'caja') {
      if (!g.quieta) { x.strokeStyle = 'rgba(255,255,255,0.6)'; x.lineWidth = 0.8; x.beginPath(); x.arc(g.x, g.y - 16, 10, Math.PI, 0); x.stroke(); x.beginPath(); x.moveTo(g.x - 10, g.y - 16); x.lineTo(g.x - 5, g.y - 6); x.moveTo(g.x + 10, g.y - 16); x.lineTo(g.x + 5, g.y - 6); x.stroke(); }
      x.fillStyle = '#7a4a22'; x.fillRect(g.x - 7, g.y - 6, 14, 14); x.fillStyle = '#b8783c'; x.fillRect(g.x - 6, g.y - 5, 12, 12);
      x.fillStyle = '#7a4a22'; x.fillRect(g.x - 6, g.y, 12, 1); x.fillRect(g.x, g.y - 5, 1, 12);
    }
    // las sogas
    for (const s of J.serps) {
      if (s.soga) { x.strokeStyle = '#e9dcc0'; x.lineWidth = 1; x.beginPath(); x.moveTo(s.soga.piv[0].x, s.soga.piv[0].y); for (const p of s.soga.piv) x.lineTo(p.x, p.y); x.lineTo(s.x, s.y - 6); x.stroke(); }
      if (s.gancho) { x.strokeStyle = '#e9dcc0'; x.lineWidth = 1; x.beginPath(); x.moveTo(s.x, s.y - 6); x.lineTo(s.gancho.x, s.gancho.y); x.stroke(); }
    }
    jug.forEach(j => pintarSerpiente(j.serp, t));
    // lo que vuela
    for (const g of J.cosas) {
      if (g.tipo === 'granada') { x.fillStyle = '#2f5d2a'; x.beginPath(); x.arc(g.x, g.y, 2.6, 0, Math.PI * 2); x.fill(); }
      if (g.tipo === 'bazooka') { const a = Math.atan2(g.vy, g.vx); x.save(); x.translate(g.x, g.y); x.rotate(a); x.fillStyle = '#d0d4da'; x.fillRect(-5, -1.5, 8, 3); x.fillStyle = '#e0763a'; x.fillRect(-7, -1, 2, 2); x.restore(); }
    }
    for (const e of J.efectos) { e.t = (e.t || 0) + 1; x.fillStyle = `rgba(255,${180 - e.t * 6},60,${Math.max(0, 0.85 - e.t / 22)})`; x.beginPath(); x.arc(e.x, e.y, e.r * Math.min(1, e.t / 5), 0, Math.PI * 2); x.fill(); }
    J.efectos = J.efectos.filter(e => e.t < 22);
    // nombres y vida arriba de cada una: dos cartelitos negros con borde, en el color del equipo (como en el juego
    // clasico: el nombre arriba y la vida abajo)
    x.font = 'bold 7px system-ui, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    const cartel = (cx, cy, txt, col) => {
      const w = Math.ceil(x.measureText(txt).width) + 6;
      x.fillStyle = 'rgba(0,0,0,0.85)'; x.fillRect(cx - w / 2, cy - 5, w, 10);
      x.strokeStyle = 'rgba(190,190,190,0.85)'; x.lineWidth = 0.5; x.strokeRect(cx - w / 2, cy - 5, w, 10);
      x.fillStyle = col; x.fillText(txt, cx, cy + 0.5);
    };
    jug.forEach((j) => {
      const s = j.serp; if (s.estado === 'muerta') return;
      cartel(s.x, s.y - 33, j.nombre, j.color); cartel(s.x, s.y - 21, String(Math.max(0, s.vida)), j.color);
    });
    x.textBaseline = 'alphabetic';
    // colgada: el arma en la mano en un cuadradito al lado (lo que suelta con Enter), como en el juego clasico
    if (s0 && s0.soga && s0.estado !== 'muerta') {
      if (!iconoMano || iconoMano.a !== arma) { iconoMano = document.createElement('canvas'); iconoMano.width = iconoMano.height = 48; iconoMano.a = arma; icono(iconoMano, arma); }
      const bx = s0.x - s0.dir * 20 - 7, by = s0.y - 30;
      x.fillStyle = 'rgba(0,0,0,0.85)'; x.fillRect(bx, by, 14, 14); x.strokeStyle = 'rgba(190,190,190,0.85)'; x.lineWidth = 0.5; x.strokeRect(bx, by, 14, 14);
      x.drawImage(iconoMano, bx + 1, by + 1, 12, 12);
    }
    // la flecha: a quien le toca (baja y sube)
    if (s0 && s0.estado !== 'muerta' && (fase === 'listo' || fase === 'mover' || fase === 'retirada')) {
      const b = Math.sin(t / 160) * 3, ay = s0.y - 50 + b;
      x.fillStyle = jug[turno].color; x.strokeStyle = '#000'; x.lineWidth = 1;
      x.beginPath(); x.moveTo(s0.x - 6, ay - 8); x.lineTo(s0.x + 6, ay - 8); x.lineTo(s0.x + 6, ay - 2); x.lineTo(s0.x + 10, ay - 2); x.lineTo(s0.x, ay + 7); x.lineTo(s0.x - 10, ay - 2); x.lineTo(s0.x - 6, ay - 2); x.closePath(); x.fill(); x.stroke();
    }
    // la mira (si es tu turno y no estas colgada; en el aire despues de una soga no: la proxima sale espejada)
    if (s0 && juegoYo() && s0.estado !== 'soga' && s0.estado !== 'muerta' && (arma !== 'soga' || (s0.sogaAng == null && !s0.sinControl)) && (fase === 'mover' || fase === 'listo')) {
      // en el color del equipo, un circulito con una cruz (como en el juego clasico)
      const a = arma === 'soga' ? Math.min(0, s0.mira) : s0.mira, col = jug[turno].color;
      const mx = s0.x + Math.cos(a) * s0.dir * 30, my = s0.y - 4 + Math.sin(a) * 30;
      x.lineWidth = 1.6; x.strokeStyle = 'rgba(0,0,0,0.55)';
      x.beginPath(); x.arc(mx, my, 3.4, 0, Math.PI * 2); x.moveTo(mx - 2.4, my - 2.4); x.lineTo(mx + 2.4, my + 2.4); x.moveTo(mx + 2.4, my - 2.4); x.lineTo(mx - 2.4, my + 2.4); x.stroke();
      x.lineWidth = 0.9; x.strokeStyle = col;
      x.beginPath(); x.arc(mx, my, 3.4, 0, Math.PI * 2); x.moveTo(mx - 2.4, my - 2.4); x.lineTo(mx + 2.4, my + 2.4); x.moveTo(mx + 2.4, my - 2.4); x.lineTo(mx - 2.4, my + 2.4); x.stroke();
      // la fuerza del tiro: una fila de puntos que crece de la serpiente hacia la mira, de amarillo a rojo
      if (carga !== null) {
        const n = Math.max(1, Math.round(carga * 12));
        for (let k = 0; k < n; k++) {
          const d = 8 + k * 2.6, r = 0.8 + k * 0.22, u = k / 11;
          x.fillStyle = `rgb(255,${Math.round(225 - u * 185)},${Math.round(60 - u * 40)})`;
          x.beginPath(); x.arc(s0.x + Math.cos(a) * s0.dir * d, s0.y - 4 + Math.sin(a) * d, r, 0, Math.PI * 2); x.fill();
        }
      }
    }
    // los textos que suben (daño, +1 arma)
    for (const tx of textos) { tx.v -= 0.016; tx.y -= 0.3; x.globalAlpha = Math.max(0, Math.min(1, tx.v)); x.fillStyle = tx.col; x.font = 'bold 9px system-ui'; x.fillText(tx.s, tx.x, tx.y); }
    x.globalAlpha = 1; textos = textos.filter(z => z.v > 0);
    // el agua
    x.fillStyle = 'rgba(38,70,160,0.92)'; x.beginPath(); x.moveTo(-200, def.h + 300);
    for (let i = -200; i <= def.w + 200; i += 8) x.lineTo(i, def.agua + Math.sin(i / 34 + t / 420) * 2.5);
    x.lineTo(def.w + 200, def.h + 300); x.closePath(); x.fill();
    // el HUD
    // el reloj: blanco; gris y quieto mientras se prepara o entre turnos; rojo en los ultimos 5 segundos
    const seg = Math.max(0, Math.ceil(tiempo / 50)), rl = $('reloj');
    if (rl.textContent !== String(seg)) rl.textContent = String(seg);
    rl.classList.toggle('gris', fase !== 'mover' && fase !== 'retirada');
    rl.classList.toggle('rojo', (fase === 'mover' || fase === 'retirada') && seg <= 5);
    // el viento: flechas desde el medio, rojas para la derecha y azules para la izquierda
    const vi = $('viento').firstChild, vv = (J.viento || 0) / 70;
    vi.style.left = vv < 0 ? (50 + vv * 50) + '%' : '50%'; vi.style.width = Math.abs(vv) * 50 + '%';
    vi.className = vv < 0 ? 'izq' : 'der';
    // los equipos: el nombre en un cartelito y la barra de vida (se arman una vez y despues solo se actualizan)
    const eqs = $('equipos');
    if (eqN !== jug.length) {
      eqs.textContent = '';
      for (const j of jug) {
        const r = div('eq'), n = h('span', j.nombre), f = document.createElement('span'), b = document.createElement('span'), ii = document.createElement('i');
        n.className = 'nom'; n.style.color = j.color; f.className = 'band'; f.style.backgroundColor = j.color; b.className = 'barra'; ii.style.background = j.color;
        b.appendChild(ii); r.append(n, f, b); eqs.appendChild(r);
      }
      eqN = jug.length;
    }
    // ordenados por la vida que les queda (como en el juego clasico)
    const orden = jug.map((j, i) => i).sort((a, b) => Math.max(0, jug[b].serp.vida) - Math.max(0, jug[a].serp.vida) || a - b);
    jug.forEach((j, i) => {
      const r = eqs.children[i]; if (!r) return;
      r.classList.toggle('turno', i === turno); r.classList.toggle('muerta', j.serp.estado === 'muerta');
      const o = String(orden.indexOf(i)); if (r.style.order !== o) r.style.order = o;
      const w = Math.max(0, j.serp.vida) / VIDA * 100 + '%', ii = r.lastChild.firstChild;
      if (ii.style.width !== w) ii.style.width = w;
    });
    $('carga').hidden = true;
  }

  // ── Los menus ──
  const h = (tag, t) => { const e = document.createElement(tag); e.textContent = t; return e; };
  const p = (t) => h('p', t);
  const div = (c) => { const e = document.createElement('div'); e.className = c; return e; };
  const caja = () => div('caja');
  const boton = (t, c, fn) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn ' + c; b.textContent = t; b.addEventListener('click', fn); return b; };
  function pantalla(c) { const m = $('menu'); m.hidden = false; m.textContent = ''; m.appendChild(c); fase = 'menu'; $('hud').hidden = true; $('armas').hidden = true; $('tactil').hidden = true; }

  // ── Los dibujos de las tarjetas del menu (con las mismas serpientes del juego) ──
  function retrato(fn) {
    const c = document.createElement('canvas'); c.width = 320; c.height = 180;
    const antes = x; x = c.getContext('2d');
    try { fn(x); } finally { x = antes; }
    return c;
  }
  function paisaje(g, arriba, abajo, pasto) {
    const cielo = g.createLinearGradient(0, 0, 0, 180); cielo.addColorStop(0, arriba); cielo.addColorStop(1, abajo);
    g.fillStyle = cielo; g.fillRect(0, 0, 320, 180);
    g.fillStyle = 'rgba(255,255,255,0.75)';
    for (const [cx, cy, r] of [[60, 34, 12], [76, 30, 15], [94, 36, 10], [236, 48, 10], [250, 44, 13], [266, 50, 9]]) { g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#4a2f1d'; g.beginPath(); g.moveTo(0, 180); g.lineTo(0, 140); g.quadraticCurveTo(80, 118, 160, 138); g.quadraticCurveTo(240, 156, 320, 132); g.lineTo(320, 180); g.closePath(); g.fill();
    g.strokeStyle = pasto; g.lineWidth = 6; g.beginPath(); g.moveTo(0, 141); g.quadraticCurveTo(80, 119, 160, 139); g.quadraticCurveTo(240, 157, 320, 133); g.stroke();
  }
  function serpienteEn(g, cx, cy, k, dir) {
    g.save(); g.translate(cx, cy); g.scale(k, k);
    pintarSerpiente({ estado: 'pose', dir, cola: [], x: 0, y: 0, fase: 0 }, 0);
    g.restore();
  }
  const DIBUJOS = {
    online(g) {
      paisaje(g, '#3d6fd8', '#a8d4ff', '#5fbf4a');
      serpienteEn(g, 92, 94, 4.2, 1); serpienteEn(g, 234, 112, 4.2, -1);
      // las ondas de la conexion entre las dos
      g.strokeStyle = '#ffd84a'; g.lineWidth = 3; g.lineCap = 'round';
      for (const r of [10, 20, 30]) { g.beginPath(); g.arc(162, 70, r, Math.PI * 1.15, Math.PI * 1.85); g.stroke(); }
      g.fillStyle = '#ffd84a'; g.beginPath(); g.arc(162, 70, 3.5, 0, Math.PI * 2); g.fill();
    },
    local(g) {
      paisaje(g, '#e0763a', '#ffd9a0', '#7fbf4a');
      serpienteEn(g, 104, 90, 4, 1); serpienteEn(g, 218, 98, 4, -1);
      // un teclado adelante, para pasarse
      g.fillStyle = '#1c1c22'; g.fillRect(96, 132, 128, 36); g.fillStyle = '#3a3a46';
      for (let f = 0; f < 3; f++) for (let k = 0; k < 10; k++) g.fillRect(101 + k * 12, 136 + f * 10, 10, 8);
      g.fillStyle = '#ffd84a'; g.fillRect(137, 156, 46, 8);
    },
    ayuda(g) {
      paisaje(g, '#253a8f', '#6a86d8', '#4aa35f');
      // colgada de una soga, balanceandose
      g.strokeStyle = '#e9dcc0'; g.lineWidth = 2; g.beginPath(); g.moveTo(150, 0); g.lineTo(200, 58); g.stroke();
      serpienteEn(g, 204, 88, 3.8, 1);
      g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 2; g.setLineDash([4, 6]); g.beginPath(); g.arc(160, 0, 110, Math.PI * 0.2, Math.PI * 0.8); g.stroke(); g.setLineDash([]);
    },
  };
  let pistaEl = null;
  function pista(t) { const e = p(t); e.className = 'pista'; pistaEl = e; return e; }
  function tarjeta(titulo, texto, dibujo, fn) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'tile';
    b.append(retrato(dibujo), h('span', titulo));
    b.addEventListener('click', fn);
    const ver = () => { if (pistaEl) pistaEl.textContent = texto; };
    b.addEventListener('mouseenter', ver); b.addEventListener('focus', ver);
    return b;
  }

  const TECLAS_AYUDA = [
    ['← →', 'caminar · en la soga, balancearse'],
    ['↑ ↓', 'apuntar · en la soga, acortar / alargar'],
    ['Enter', 'saltar (dos veces: para atrás) · colgado, soltar el arma'],
    ['Retroceso', 'salto alto (dos veces: mortal)'],
    ['Espacio', 'tirar / soltar la soga · con un arma en el piso, cargar y tirar'],
    ['Tab o clic derecho', 'abrir el panel de armas'],
    ['R · F1 · F2', 'soga · bazuca · granada'],
    ['Q / E', 'arma anterior / siguiente'],
    ['1 a 5', 'mecha de la granada (segundos)'],
    ['+ −', 'acercar / alejar'],
  ];
  function menuAyuda() {
    const c = caja(); c.append(h('h1', 'Cómo se juega'));
    c.append(h('h2', 'Shopper'), p('Solo la soga para moverse. Cae una caja por turno y para atacar primero hay que agarrar una. Se ataca desde la soga (Enter). El último que queda gana.'));
    c.append(h('h2', 'Teclas'));
    const t = document.createElement('table'); t.className = 'teclas';
    for (const [k, v] of TECLAS_AYUDA) { const r = t.insertRow(); r.insertCell().textContent = k; r.insertCell().textContent = v; }
    c.append(t);
    const acc = div('acc'); acc.append(boton('Volver', 'primario', menuPrincipal)); c.append(acc);
    pantalla(c);
  }

  function menuPrincipal() {
    const c = caja();
    const logo = h('h1', 'SHOPPA'); logo.className = 'logo';
    const sub = p('Serpientes, sogas y cajas.'); sub.className = 'sub';
    const sock = socketDelChat();
    const t = div('tiles');
    t.append(
      tarjeta('Jugar online', 'Partidas con la gente de CV Chat, de 2 a 5 jugadores.', DIBUJOS.online, () => (sock ? menuOnline() : aviso('Abrí Shoppa desde la sección Juegos de CV Chat para jugar online'))),
      tarjeta('En esta compu', 'De 2 a 4 jugadores, pasándose el teclado.', DIBUJOS.local, () => menuLocal()),
      tarjeta('Cómo se juega', 'Las reglas de Shopper y las teclas.', DIBUJOS.ayuda, () => menuAyuda()),
    );
    c.append(logo, sub, t, pista('Elegí cómo jugar.'));
    pantalla(c);
  }

  function menuLocal() {
    const c = caja(); c.append(h('h1', 'En esta compu'), p('Se pasan el teclado: cada uno juega su turno.'));
    const acc = div('acc');
    for (const n of [2, 3, 4]) acc.appendChild(boton(n + ' jugadores', n === 2 ? 'primario' : '', () => { online = null; nuevaPartida(Array.from({ length: n }, (_, i) => 'Jugador ' + (i + 1)), (Math.random() * 1e9) | 0, 0); empezarTurno(); }));
    acc.appendChild(boton('Volver', '', menuPrincipal));
    c.appendChild(acc); pantalla(c);
  }

  // ── Online (con el socket de CV Chat: el juego va adentro de la seccion Juegos) ──
  function socketDelChat() { try { return window.parent && window.parent !== window && window.parent.app && window.parent.app.socket; } catch { return null; } }
  const emitir = (ev, d) => new Promise((ok) => { const s = socketDelChat(); if (!s) return ok({ error: 'sin conexión' }); s.emit(ev, d || {}, (r) => ok(r || {})); setTimeout(() => ok({ error: 'No respondió el servidor.' }), 8000); });
  let escuchando = false, salaId = null;

  async function menuOnline() {
    escuchar();
    const r = await emitir('shoppa:inicio');
    const c = caja(); c.append(h('h1', 'Online'));
    if (r.error) { c.append(p(r.error)); c.append(boton('Volver', '', menuPrincipal)); return pantalla(c); }
    const acc = div('acc');
    acc.append(boton('Crear una sala', 'primario', async () => { const x2 = await emitir('shoppa:crear', { mapa: 'fabrica' }); if (x2.error) return aviso(x2.error); verSala(x2.id); }), boton('Volver', '', menuPrincipal));
    c.appendChild(acc);
    if (r.mias && r.mias.length) { c.append(h('h2', 'Tus salas')); for (const m of r.mias) c.append(filaSala(m.estado === 'jugando' ? 'Partida en juego' : m.estado === 'terminada' ? 'Terminada' : 'Esperando', m.jugadores + ' jugadores', 'Entrar', () => verSala(m.id))); }
    c.append(h('h2', 'Salas esperando gente'));
    if (!r.abiertas || !r.abiertas.length) c.append(p('No hay salas abiertas. ¡Creá una!'));
    else for (const a of r.abiertas) c.append(filaSala('Sala de ' + a.creador.nombre, a.jugadores + ' jugadores', 'Entrar', async () => { const x2 = await emitir('shoppa:unirse', { id: a.id }); if (x2.error) return aviso(x2.error); verSala(a.id); }));
    pantalla(c);
  }
  function filaSala(t, sub, b, fn) { const f = div('fila'); const n = div('n'); n.textContent = t + ' · ' + sub; f.append(n, boton(b, 'primario', fn)); return f; }

  async function verSala(id) {
    salaId = id;
    const r = await emitir('shoppa:ver', { id });
    if (r.error) { aviso(r.error); return menuOnline(); }
    mostrarSala(r.partida);
  }
  function mostrarSala(s) {
    if (!s || s.id !== salaId) return;
    if (s.estado === 'jugando') {
      if (!J || !online || online.id !== s.id) { arrancarOnline(s); if (s.snapshot) { aplicar(s.snapshot); turno = s.turno; fase = s.snapshot.fase === 'pasando' ? 'esperando' : s.snapshot.fase; } else empezarTurno(s.viento); }
      return;
    }
    if (s.estado === 'terminada' && J && online && online.id === s.id && fase !== 'fin') return fin(s.ganador);
    if (s.estado === 'terminada' && fase === 'fin') return;
    const c = caja(); c.append(h('h1', 'Sala'), p('De 2 a 5 jugadores. Cuando todos estén listos, el que creó la sala la empieza.'));
    for (const j of s.jugadores) { const f = div('fila'); const pt = div('punto'); pt.style.background = j.conectado ? '#62d26f' : '#666'; const n = div('n'); n.textContent = j.nombre + (j.yo ? ' (vos)' : '') + (j.creador ? ' · creó la sala' : ''); f.append(pt, n, h('span', j.listo ? '✔ listo' : '…')); c.appendChild(f); }
    const acc = div('acc');
    if (s.estado === 'esperando') {
      acc.append(boton(s.listo ? 'No estoy listo' : 'Estoy listo', s.listo ? '' : 'primario', () => emitir('shoppa:listo', { id: s.id, listo: !s.listo })));
      if (s.soyCreador) { const b = boton('Empezar', 'primario', async () => { const r = await emitir('shoppa:empezar', { id: s.id }); if (r.error) aviso(r.error); }); b.disabled = !s.todosListos; acc.append(b); }
    }
    acc.append(boton('Salir de la sala', '', () => salirOnline()));
    c.appendChild(acc); pantalla(c);
  }
  function arrancarOnline(s) {
    online = { socket: socketDelChat(), id: s.id, miSeat: s.miSeat };
    nuevaPartida(s.jugadores.map(j => j.nombre), s.semilla || 1, s.turno || 0);
    turno = s.turno || 0;
  }
  async function salirOnline() {
    if (salaId) await emitir('shoppa:abandonar', { id: salaId });
    salaId = null; online = null; J = null; menuOnline();
  }
  function escuchar() {
    if (escuchando) return; const s = socketDelChat(); if (!s) return; escuchando = true;
    s.on('shoppa:estado', (v) => { if (v && v.id === salaId && (!J || v.estado !== 'jugando')) mostrarSala(v); });
    s.on('shoppa:turno', (d) => {
      if (!d || d.id !== salaId) return;
      if (!J || !online || online.id !== d.id) { online = { socket: s, id: d.id, miSeat: d.miSeat }; nuevaPartida(d.jugadores.map(j => j.nombre), d.semilla || 1, d.turno); }
      if (d.snapshot && !d.inicio) aplicar(d.snapshot);
      turno = d.turno; online.miSeat = d.miSeat;
      empezarTurno(d.viento);
    });
    s.on('shoppa:snapshot', (d) => { if (d && online && d.id === online.id && !simulaYo()) aplicar(d.snapshot); });
    s.on('shoppa:fin', (d) => { if (d && online && d.id === online.id) { if (d.snapshot) aplicar(d.snapshot); fin(d.ganador); } });
    s.on('shoppa:revancha', (d) => { if (d && online && d.de === online.id) { salaId = d.id; online = null; J = null; } });
  }

  // ── Arranque: ?mesa=id entra directo a esa sala ──
  const mesa = new URLSearchParams(location.search).get('mesa');
  if (mesa && /^[a-f0-9]{6,20}$/.test(mesa) && socketDelChat()) { escuchar(); verSala(mesa); } else menuPrincipal();
})();
