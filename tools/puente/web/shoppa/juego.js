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
  const cv = $('lienzo'), x = cv.getContext('2d');

  // ── El estado de la partida ──
  let J = null, def = null, fondo = null, jug = [], turno = 0, fase = 'menu', tiempo = 0, quietos = 0;
  let cajaTomada = false, ataco = false, arma = 'soga', carga = null, semilla = 1, cajaN = 0, nTurno = 0;
  let textos = [], online = null, ultimaFoto = 0, vidaAntes = null;
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
      s.vida = VIDA; s.dir = p[0] < def.w / 2 ? 1 : -1;
      return { nombre: n, color: COLORES[i % COLORES.length], armas: { bazooka: 0, granada: 0 }, serp: s };
    });
    J.serps = jug.map(j => j.serp);
    // dos cajas para arrancar
    for (let k = 0; k < 2; k++) soltarCaja();
    turno = primero || 0;
    cam.z = Math.max(1, Math.min(2.4, innerHeight / 470));
    $('hud').hidden = false; $('armas').hidden = false;
    if (matchMedia('(pointer: coarse)').matches) $('tactil').hidden = false;
    $('menu').hidden = true;
  }

  function soltarCaja() {
    const p = puntoCaja(cajaN);
    M.caja(J, p[0], Math.max(40, p[1] - 220), contenidoCaja(cajaN));
    cajaN++;
  }

  function empezarTurno(viento) {
    fase = 'mover'; tiempo = TURNO * 50; quietos = 0; cajaTomada = false; ataco = false; arma = 'soga'; carga = null;
    nTurno++;
    J.viento = viento != null ? viento : Math.round(azar(semilla + nTurno * 31)() * 140 - 70);
    const s = jug[turno].serp;
    s.estado = s.estado === 'muerta' ? 'muerta' : 'aire'; s.vx = 0; s.vy = 0; s.soga = null; s.gancho = null;
    vidaAntes = s.vida;
    if (simulaYo() && J.cosas.filter(g => g.tipo === 'caja').length < MAX_CAJAS) soltarCaja();
    aviso(`Le toca a ${jug[turno].nombre}${online && turno === online.miSeat ? ' (vos)' : ''}`);
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
    if (/^[1-5]$/.test(e.key) && J) J.mecha = Number(e.key);
    if (e.key === 'q' || e.key === 'Q') ciclarArma(-1);
    if (e.key === 'e' || e.key === 'E') ciclarArma(1);
    if (e.key === 'r' || e.key === 'R') elegirArma('soga');
    if (e.key === '+' || e.key === '=') cam.z = Math.min(4, cam.z + 0.25);
    if (e.key === '-') cam.z = Math.max(0.6, cam.z - 0.25);
    if (e.key === 'Tab') e.preventDefault();
  });
  addEventListener('keyup', (e) => { const k = TECLAS[e.key]; if (k) apretada[k] = false; });
  addEventListener('blur', () => { for (const k in apretada) apretada[k] = false; });
  for (const b of document.querySelectorAll('[data-k]')) {
    const k = b.dataset.k;
    const on = (e) => { e.preventDefault(); if (k === 'fin') { if (juegoYo() && fase === 'mover') { fase = 'esperando'; } return; } if (!apretada[k]) recien[k] = true; apretada[k] = true; };
    const off = (e) => { e.preventDefault(); apretada[k] = false; };
    b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('pointerleave', off);
  }

  const ARMAS_ORDEN = ['soga', 'bazooka', 'granada'];
  function puede(a) { return a === 'soga' || (jug[turno] && jug[turno].armas[a] > 0); }
  function elegirArma(a) { if (!juegoYo() || !puede(a)) return; arma = a; carga = null; pintarArmas(); }
  function ciclarArma(d) { let i = ARMAS_ORDEN.indexOf(arma); for (let k = 0; k < 3; k++) { i = (i + d + 3) % 3; if (puede(ARMAS_ORDEN[i])) return elegirArma(ARMAS_ORDEN[i]); } }
  function pintarArmas() {
    const b = $('armas'); b.textContent = '';
    if (!J) return;
    for (const a of ARMAS_ORDEN) {
      const n = a === 'soga' ? '∞' : jug[turno].armas[a];
      const bt = document.createElement('button'); bt.type = 'button';
      bt.textContent = (a === 'soga' ? '🪢 Soga' : a === 'bazooka' ? '🚀 Bazuca' : '💣 Granada') + ' ' + n;
      bt.className = arma === a ? 'sel' : ''; bt.disabled = !juegoYo() || !puede(a);
      bt.addEventListener('click', () => elegirArma(a));
      b.appendChild(bt);
    }
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
    if (fase === 'esperando') { for (const k in recien) recien[k] = false; return {}; }
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
    for (const j of jug) if (j.serp.vida <= 0 && j.serp.estado !== 'muerta') { j.serp.estado = 'muerta'; texto(j.serp.x, j.serp.y - 20, '💀', '#fff'); }
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
      serps: J.serps.map(s => ({ x: r1(s.x), y: r1(s.y), vx: r1(s.vx), vy: r1(s.vy), estado: s.estado, dir: s.dir, mira: r1(s.mira), vida: s.vida, soga: s.soga, gancho: s.gancho, fase: s.fase || 0, giro: s.giro || 0, aireT: s.aireT || 0 })),
      cosas: J.cosas.map(g => ({ ...g })),
      efectos: J.efectos.filter(e => e.t < 3),
      textos: textos.filter(t => t.v > 1.6).map(t => ({ ...t })),
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
  function aviso(t) { const a = $('aviso'); a.textContent = t; a.style.opacity = 1; clearTimeout(avisoT); avisoT = setTimeout(() => { a.style.opacity = 0; }, 2200); }

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
    const hx = D * (0.8 + e1 * 1.3), hy = -7.6 + e2 * 1.1;
    const cab = (extra, color) => { x.fillStyle = color; x.beginPath(); x.ellipse(hx, hy, 4.6 + extra, 4.9 + extra, D * 0.15, 0, Math.PI * 2); x.fill(); };
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
    x.restore();
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
    // nombres y vida arriba de cada una
    x.font = 'bold 7px system-ui, sans-serif'; x.textAlign = 'center';
    jug.forEach((j, i) => {
      const s = j.serp; if (s.estado === 'muerta') return;
      x.fillStyle = 'rgba(0,0,0,0.55)'; const w = Math.max(24, x.measureText(j.nombre).width + 6); x.fillRect(s.x - w / 2, s.y - 33, w, 18);
      x.fillStyle = j.color; x.fillText(j.nombre, s.x, s.y - 26); x.fillText(String(Math.max(0, s.vida)), s.x, s.y - 18);
    });
    // la flecha: a quien le toca (baja y sube)
    if (s0 && s0.estado !== 'muerta' && (fase === 'mover' || fase === 'retirada')) {
      const b = Math.sin(t / 160) * 3, ay = s0.y - 46 + b;
      x.fillStyle = jug[turno].color; x.strokeStyle = '#000'; x.lineWidth = 1;
      x.beginPath(); x.moveTo(s0.x - 6, ay - 8); x.lineTo(s0.x + 6, ay - 8); x.lineTo(s0.x + 6, ay - 2); x.lineTo(s0.x + 10, ay - 2); x.lineTo(s0.x, ay + 7); x.lineTo(s0.x - 10, ay - 2); x.lineTo(s0.x - 6, ay - 2); x.closePath(); x.fill(); x.stroke();
    }
    // la mira (si es tu turno y no estas colgada)
    if (s0 && juegoYo() && s0.estado !== 'soga' && s0.estado !== 'muerta' && fase === 'mover') {
      const a = arma === 'soga' ? Math.min(0, s0.mira) : s0.mira;
      x.strokeStyle = '#ff4d6d'; x.lineWidth = 1; x.beginPath(); x.arc(s0.x + Math.cos(a) * s0.dir * 30, s0.y - 4 + Math.sin(a) * 30, 3, 0, Math.PI * 2); x.stroke();
    }
    // los textos que suben (daño, +1 arma)
    for (const tx of textos) { tx.v -= 0.016; tx.y -= 0.3; x.globalAlpha = Math.max(0, Math.min(1, tx.v)); x.fillStyle = tx.col; x.font = 'bold 9px system-ui'; x.fillText(tx.s, tx.x, tx.y); }
    x.globalAlpha = 1; textos = textos.filter(z => z.v > 0);
    // el agua
    x.fillStyle = 'rgba(38,70,160,0.92)'; x.beginPath(); x.moveTo(-200, def.h + 300);
    for (let i = -200; i <= def.w + 200; i += 8) x.lineTo(i, def.agua + Math.sin(i / 34 + t / 420) * 2.5);
    x.lineTo(def.w + 200, def.h + 300); x.closePath(); x.fill();
    // el HUD
    $('reloj').textContent = String(Math.max(0, Math.ceil(tiempo / 50)));
    $('reloj').style.color = fase === 'retirada' ? '#ffd23f' : '#fff';
    const vi = $('viento').firstChild, vv = (J.viento || 0) / 70;
    vi.style.left = vv < 0 ? (50 + vv * 50) + '%' : '50%'; vi.style.width = Math.abs(vv) * 50 + '%';
    const eqs = $('equipos'); eqs.textContent = '';
    jug.forEach((j, i) => {
      const r = document.createElement('div'); r.className = 'eq' + (i === turno ? ' turno' : '');
      const n = document.createElement('span'); n.textContent = j.nombre; n.style.color = j.color;
      const b = document.createElement('span'); b.className = 'barra'; const ii = document.createElement('i'); ii.style.width = Math.max(0, j.serp.vida) / VIDA * 100 + '%'; ii.style.background = j.color; b.appendChild(ii);
      r.append(n, b); eqs.appendChild(r);
    });
    $('carga').hidden = carga === null; if (carga !== null) $('carga').firstChild.style.width = carga * 100 + '%';
  }

  // ── Los menus ──
  const h = (tag, t) => { const e = document.createElement(tag); e.textContent = t; return e; };
  const p = (t) => h('p', t);
  const div = (c) => { const e = document.createElement('div'); e.className = c; return e; };
  const caja = () => div('caja');
  const boton = (t, c, fn) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn ' + c; b.textContent = t; b.addEventListener('click', fn); return b; };
  function pantalla(c) { const m = $('menu'); m.hidden = false; m.textContent = ''; m.appendChild(c); fase = 'menu'; $('hud').hidden = true; $('armas').hidden = true; $('tactil').hidden = true; }

  function ayuda() {
    const a = div('ayuda');
    a.innerHTML = '<b>Shopper:</b> solo la soga para moverse, una caja por turno, y para atacar primero hay que agarrar una caja. Se ataca desde la soga (Enter).<br>'
      + '<b>← →</b> caminar · <b>↑ ↓</b> apuntar · <b>Enter</b> saltar (×2 atrás) · <b>Retroceso</b> arriba (×2 mortal)<br>'
      + '<b>Espacio</b> tirar / soltar la soga · en la soga <b>↑ ↓</b> acortar / alargar · <b>← →</b> balancearse<br>'
      + '<b>Q / E</b> cambiar de arma · <b>R</b> la soga · <b>Espacio</b> (en el piso) cargar y tirar · <b>Enter</b> (colgado) soltar el arma · <b>1-5</b> mecha · <b>+ −</b> zoom';
    return a;
  }

  function menuPrincipal() {
    const c = caja();
    c.append(h('h1', 'SHOPPA'), p('Serpientes, sogas y cajas. El último que queda gana.'));
    const acc = div('acc');
    const sock = socketDelChat();
    acc.append(boton('Jugar online', 'primario', () => (sock ? menuOnline() : aviso('Abrí Shoppa desde la sección Juegos de CV Chat para jugar online'))), boton('Jugar en esta compu', '', () => menuLocal()));
    c.append(acc, h('h2', 'Cómo se juega'), ayuda());
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
