// Shoppa: el juego (turnos, cajas, armas, local y online). La fisica es motor.js y el mapa, mapas.js.
// Online: el que tiene el turno simula y les manda "fotos" del estado a los demas (shoppa.js en el servidor
// las retransmite y decide de quien es el turno siguiente), como Proyecto Gusanos.
// Tres modos:
//  · Shopper: solo la soga para moverse, una caja por turno (caen en el mismo orden para todos: salen de la
//    semilla de la partida), primero agarrar una caja y despues atacar, y se ataca desde la soga.
//  · Normal: como una partida comun del juego clasico: equipos de 4 serpientes con 100 de vida, terreno que se
//    rompe (una isla al azar), muchas armas, minas y barriles, cajas de armas y de vida, y reloj de la ronda.
//  · Práctica: uno solo, sin reloj, con todas las armas y muñecos para practicar.
// En todos, la que se queda sin vida explota al final del turno y deja una lapida.
(function () {
  'use strict';
  const M = window.ShoppaMotor, MP = window.ShoppaMapas, C = M.C;
  const PASO = 20, RETIRADA = 3, LISTO = 5, SUBE_AGUA = 20;
  const COLORES = ['#ff6b6b', '#4aa3ff', '#62d26f', '#ffd23f', '#c77dff'];
  // los nombres de las serpientes del modo normal (víboras y culebras de por aca)
  const NOMBRES = ['Yarará', 'Coral', 'Cascabel', 'Lampalagua', 'Ñacaniná', 'Curiyú', 'Musurana', 'Boa', 'Culebra', 'Víbora', 'Mamba', 'Cobra', 'Pitón', 'Anaconda', 'Ratonera', 'Mboí', 'Falsa coral', 'Verdecita', 'Parejera', 'Yboyí'];
  const $ = (id) => document.getElementById(id);
  // (x es let: los dibujos de los menus usan pintarSerpiente sobre otro canvas un momento)
  const cv = $('lienzo'); let x = cv.getContext('2d');

  // ── Las armas de cada modo (cantidades: SIN_FIN = infinitas) ──
  const SIN_FIN = -1;
  const hay = (n) => n === SIN_FIN || n > 0;
  const verN = (n) => (n === SIN_FIN ? '∞' : String(Math.max(0, n || 0)));
  const FILAS_TODAS = [['Util', ['soga', 'soplete', 'paracaidas']], ['F1', ['bazooka']], ['F2', ['granada', 'racimo', 'mandarina', 'granadota']], ['F3', ['escopeta']], ['F4', ['puno', 'bate']], ['F5', ['dinamita', 'mina']], ['F6', ['aereo']]];
  const TODAS = () => ({ soga: SIN_FIN, soplete: SIN_FIN, puno: SIN_FIN, paracaidas: SIN_FIN, granadota: SIN_FIN, bazooka: SIN_FIN, granada: SIN_FIN, racimo: SIN_FIN, mandarina: SIN_FIN, escopeta: SIN_FIN, bate: SIN_FIN, dinamita: SIN_FIN, mina: SIN_FIN, aereo: SIN_FIN });
  const MODOS = {
    shopper: {
      id: 'shopper', nombre: 'Shopper', mapa: 'fabrica', gusanos: 1, vida: 150, rompe: false, turno: 30, cajaPrimero: true,
      cajasInicio: 2, cajasMax: 3, cajaProb: 1, ronda: 0, minas: 0, barriles: 0, arma: 'soga', danoCorta: false,
      armas: () => ({ soga: SIN_FIN, bazooka: 0, granada: 0 }), filas: [['Util', ['soga']], ['F1', ['bazooka']], ['F2', ['granada']]],
      contenido: (k) => (azar(semilla * 31 + k * 7919)() < 0.5 ? 'bazooka' : 'granada'),
    },
    normal: {
      id: 'normal', nombre: 'Normal', mapa: 'isla', gusanos: 4, vida: 100, rompe: true, turno: 30, cajaPrimero: false,
      cajasInicio: 0, cajasMax: 5, cajaProb: 0.5, ronda: 20 * 60, minas: 4, barriles: 4, arma: 'bazooka', danoCorta: true,
      // el arsenal del esquema intermedio del juego clasico (la mandarina, como la banana, solo sale de las cajas; el
      // ataque aereo recien se puede usar despues de 5 rondas)
      armas: () => ({ soga: 5, soplete: 3, puno: SIN_FIN, paracaidas: 2, granadota: 0, bazooka: SIN_FIN, granada: SIN_FIN, racimo: 3, mandarina: 0, escopeta: SIN_FIN, bate: 1, dinamita: 1, mina: 2, aereo: 1 }),
      demoras: { aereo: 5 },
      filas: FILAS_TODAS,
      // las cajas: de vida (+25) o de armas
      contenido: (k) => { const u = azar(semilla * 31 + k * 7919)(); return u < 0.3 ? 'vida' : ['dinamita', 'mina', 'bate', 'soga', 'racimo', 'mandarina', 'aereo', 'soplete', 'granadota', 'paracaidas'][Math.floor((u - 0.3) / 0.7 * 10)] || 'soga'; },
    },
    practica: {
      id: 'practica', nombre: 'Práctica', mapa: 'fabrica', gusanos: 1, vida: 100, rompe: false, turno: 0, cajaPrimero: false, practica: true,
      cajasInicio: 2, cajasMax: 2, cajaProb: 0, ronda: 0, minas: 0, barriles: 0, arma: 'soga', danoCorta: false,
      armas: TODAS, filas: FILAS_TODAS, contenido: () => 'nada',
    },
  };

  // ── El estado de la partida ──
  let J = null, def = null, fondo = null, jug = [], turno = 0, fase = 'menu', tiempo = 0, quietos = 0, reglas = MODOS.shopper;
  let cajaTomada = false, ataco = false, arma = 'soga', carga = null, semilla = 1, cajaN = 0, nTurno = 0;
  let textos = [], online = null, ultimaFoto = 0, vidaAntes = null, eqN = -1, iconoMano = null;
  let tirosEsc = 0;        // la escopeta: tiros que quedan en este turno (despues del primero no se puede mover)
  let usoSoga = false;     // ya se gasto una soga en este "uso" (hasta volver al piso es la misma)
  let ronda = 0, subita = false, aguaVis = 0, crTurno = 0, foco = null, trazos = [], particulas = [];
  let practica = null;     // { cajas, mapa }
  const cam = { x: 960, y: 450, z: 2, libre: false };
  let vista = null;        // la ultima camara dibujada (para pasar del raton al mapa)

  // ── Azar con semilla (las cajas, en el mismo orden para todos) ──
  function azar(s) { let a = s >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const mezclar = (l, sem) => { const r = azar(sem); return l.map(v => [r(), v]).sort((a, b) => a[0] - b[0]).map(z => z[1]); };
  function puntoCaja(k) {
    // una vuelta por los puntos del mapa, mezclados con la semilla; despues, otra vuelta (otra mezcla)
    const n = def.cajas.length, vuelta = Math.floor(k / n), r = azar(semilla + vuelta * 977);
    const orden = def.cajas.map((p, i) => [r(), i]).sort((a, b) => a[0] - b[0]).map(z => z[1]);
    return def.cajas[orden[k % n]];
  }

  // ── Los equipos y sus serpientes ──
  const actual = () => { const j = jug[turno]; return j ? j.serps[j.cual] || null : null; };
  const vivo = (t) => jug[t] && jug[t].serps.some(s => s.estado !== 'muerta');
  const vidaEquipo = (j) => j.serps.reduce((a, s) => a + Math.max(0, s.estado === 'muerta' ? 0 : s.vida), 0);
  const nombreDe = (s) => (reglas.gusanos > 1 || jug[s.eq].muneco ? s.nombre : jug[s.eq].nombre);
  const fotoOk = (a) => typeof a === 'string' && a.length < 500 && (/^\/[^/\\]/.test(a) || /^https:\/\//.test(a));

  // ── Empezar ──
  // equipos: [{ nombre, avatar?, color?, gusanos?, muneco? }]
  function nuevaPartida(equipos, sem, primero, modo, mapa) {
    reglas = Object.prototype.hasOwnProperty.call(MODOS, modo) ? MODOS[modo] : MODOS.shopper;
    if (reglas.practica) reglas = { ...reglas, mapa: mapa === 'isla' ? 'isla' : 'fabrica', rompe: mapa === 'isla', barriles: mapa === 'isla' ? 4 : 0 };
    semilla = sem >>> 0;
    def = MP.porId(reglas.mapa, semilla);
    const T = MP.terreno(M, def);
    fondo = MP.pintar(def, T);
    J = M.nuevoJuego(T, { rompe: reglas.rompe });
    cajaN = 0; nTurno = 0; textos = []; trazos = []; particulas = []; ataco = false; cajaTomada = false; carga = null; cpuE = null; arma = reglas.arma; ronda = reglas.ronda * 50; subita = false; aguaVis = T.agua;
    crTurno = 0; foco = null; tirosEsc = 0; usoSoga = false; cam.libre = false; comentario = null;
    const r = azar(semilla + 5), salidas = def.salidas.map((p) => [r(), p]).sort((a, b) => a[0] - b[0]).map(z => z[1]);
    const nombres = mezclar(NOMBRES, semilla + 11);
    jug = equipos.map((e, t) => ({
      nombre: e.nombre, avatar: fotoOk(e.avatar) ? e.avatar : null, color: e.color || COLORES[t % COLORES.length], muneco: !!e.muneco,
      armas: e.muneco ? {} : reglas.armas(), serps: [], cual: -1, ultima: reglas.arma, n: e.gusanos || reglas.gusanos, cpu: e.cpu || null,
    }));
    // las serpientes, intercaladas por equipo (asi quedan repartidas por el mapa)
    J.serps = [];
    const max = Math.max(...jug.map(j => j.n));
    let k = 0;
    for (let w = 0; w < max; w++) jug.forEach((j, t) => {
      if (w >= j.n) return;
      const p = salidas[k % salidas.length], s = new M.Serpiente(p[0], p[1] - 9);
      // (al aparecer caen hasta el piso: esa primera caida no lastima)
      s.vida = reglas.vida; s.dir = p[0] < def.w / 2 ? 1 : -1; s.sinCaida = true; s.eq = t;
      s.nombre = j.muneco ? 'Muñeco ' + (w + 1) : nombres[k % nombres.length];
      j.serps.push(s); J.serps.push(s); k++;
    });
    // minas y barriles del mapa (los pone el mapa: iguales para todos)
    const rf = azar(semilla + 99);
    for (const p of (def.minas || []).slice(0, reglas.minas)) J.cosas.push({ tipo: 'mina', x: p[0], y: p[1] - 30, vx: 0, vy: 0, arma: 0, cuenta: null, quieta: false, falla: rf() < M.ARMAS.mina.falla });
    for (const p of (def.barriles || []).slice(0, reglas.barriles)) J.cosas.push({ tipo: 'barril', x: p[0], y: p[1] - 30, vx: 0, vy: 0, vida: M.ARMAS.barril.vida, quieta: false });
    for (let c = 0; c < reglas.cajasInicio; c++) soltarCaja();
    turno = primero || 0;
    cam.z = Math.max(1, Math.min(2.4, innerHeight / 470));
    $('hud').hidden = false; $('armas').hidden = true; panel = false; eqN = -1;
    $('practica').hidden = !reglas.practica;
    $('ronda').hidden = !reglas.ronda;
    if (matchMedia('(pointer: coarse)').matches) $('tactil').hidden = false;
    $('menu').hidden = true;
  }

  function soltarCaja() {
    const p = puntoCaja(cajaN);
    M.caja(J, p[0], Math.max(40, p[1] - 220), reglas.contenido(cajaN));
    cajaN++;
  }

  // antes de cada turno, como en el juego clasico: 5 segundos para prepararse (el reloj queda gris y arriba
  // dice cuanto falta); el turno arranca con la primera tecla o cuando se acaban
  let listo = 0, comentario = null;
  function empezarTurno(viento) {
    fase = 'listo'; listo = LISTO * 50; tiempo = reglas.turno * 50; quietos = 0; cajaTomada = false; ataco = false; carga = null;
    tirosEsc = 0; usoSoga = false; foco = null; cam.libre = false; cpuE = null;
    nTurno++;
    J.viento = viento != null ? viento : Math.round(azar(semilla + nTurno * 31)() * 140 - 70);
    // la muerte subita (modo normal): cuando se acaba el reloj de la ronda, el agua sube en cada turno
    if (reglas.ronda && ronda <= 0) {
      if (!subita) { subita = true; comentario = ['¡Muerte súbita! Todas quedan con 1 de vida y el agua sube', '#fff']; for (const o of J.serps) if (o.estado !== 'muerta') o.vida = Math.min(o.vida, 1); }
      else { J.T.agua = Math.max(150, J.T.agua - SUBE_AGUA); ahogar(); }
    }
    // juega la siguiente del equipo (cada equipo va rotando sus serpientes)
    const j = jug[turno], n = j.serps.length;
    for (let q = 1; q <= n; q++) { const i = (((j.cual + q) % n) + n) % n; if (j.serps[i].estado !== 'muerta') { j.cual = i; break; } }
    const s = actual();
    arma = reglas.cajaPrimero ? 'soga' : (j.ultima || reglas.arma);
    if (!puede(arma)) arma = ARMAS_ORDEN().find(puede) || 'soga';
    if (s && s.estado !== 'muerta') { s.estado = 'aire'; s.vx = 0; s.vy = 0; s.soga = null; s.gancho = null; s.sogaAng = null; s.sinControl = false; }
    vidaAntes = s ? s.vida : 0;
    crTurno = J.crateres.length;
    if (simulaYo() && J.cosas.filter(g => g.tipo === 'caja').length < reglas.cajasMax && azar(semilla + nTurno * 131)() < reglas.cajaProb) soltarCaja();
    // (lo que se apreto mirando el turno de otro no cuenta para arrancar)
    for (const k in recien) recien[k] = false;
    // si recien se murio alguna, primero se comenta eso (la cuenta sigue al segundo siguiente)
    if (comentario) { aviso(comentario[0], comentario[1]); comentario = null; }
    else aviso(`${j.nombre}${online && turno === online.miSeat ? ' (vos)' : ''}: ${LISTO} seg`, j.color);
    // (si el agua se llevo a todo el equipo, el turno pasa enseguida)
    if (!s || s.estado === 'muerta') fase = 'esperando';
    pintarArmas();
  }
  // las que quedaron abajo del agua (cuando sube), al agua
  function ahogar() {
    for (const s of J.serps) if (s.estado !== 'muerta' && s.y - 4 > J.T.agua) { s.estado = 'muerta'; s.vida = 0; s.soga = null; s.gancho = null; }
  }

  // ── Práctica: uno solo, sin reloj, con todas las armas; los muñecos vuelven a aparecer ──
  function empezarPractica(mapa) {
    online = null;
    practica = { cajas: 0, mapa };
    nuevaPartida([{ nombre: 'Vos' }, { nombre: 'Muñecos', color: '#b9b9b9', gusanos: 3, muneco: true }], (Math.random() * 1e9) | 0, 0, 'practica', mapa);
    J.viento = Math.round(Math.random() * 140 - 70);
    jug[0].cual = 0; fase = 'mover'; tiempo = 0; arma = 'soga'; vidaAntes = actual().vida;
    aviso('Práctica: sin reloj y con todas las armas. N empieza de nuevo', COLORES[0]);
    pintarArmas();
  }
  function revivir(o) {
    const p = def.salidas[Math.floor(Math.random() * def.salidas.length)];
    const n = new M.Serpiente(p[0], p[1] - 9);
    n.eq = o.eq; n.nombre = o.nombre; n.vida = reglas.vida; n.dir = p[0] < def.w / 2 ? 1 : -1; n.sinCaida = true;
    J.serps[J.serps.indexOf(o)] = n;
    const j = jug[o.eq]; j.serps[j.serps.indexOf(o)] = n;
    if (o.eq === turno) { usoSoga = false; tirosEsc = 0; ataco = false; carga = null; vidaAntes = n.vida; }
  }

  // ¿quien simula? En local, siempre; online, el que tiene el turno
  const simulaYo = () => !online || turno === online.miSeat;
  const juegoYo = () => fase !== 'menu' && fase !== 'fin' && simulaYo() && !(jug[turno] && jug[turno].cpu);

  // ── Los controles (los del juego clasico) ──
  const apretada = {}, recien = {};
  const TECLAS = { ArrowLeft: 'izq', ArrowRight: 'der', ArrowUp: 'arr', ArrowDown: 'aba', Enter: 'enter', Backspace: 'retro', ' ': 'espacio', Shift: 'shift' };
  const TECLAS_F = { F1: 1, F2: 2, F3: 3, F4: 4, F5: 5, F6: 6 };
  addEventListener('keydown', (e) => {
    if (e.target && /input|textarea/i.test(e.target.tagName)) return;
    const k = TECLAS[e.key];
    if (k) { e.preventDefault(); if (!apretada[k]) recien[k] = true; apretada[k] = true; cam.libre = false; return; }
    if (/^[1-5]$/.test(e.key) && J && juegoYo()) { J.mecha = Number(e.key); if (conMecha(arma) && juegoYo()) avisoArma(); }
    if ((e.key === 'b' || e.key === 'B') && J && juegoYo()) { J.rebote = J.rebote === 'max' ? 'min' : 'max'; if (conMecha(arma)) avisoArma(); }
    if ((e.key === 'n' || e.key === 'N') && reglas.practica && J && fase !== 'menu') empezarPractica(practica ? practica.mapa : 'fabrica');
    if (e.key === 'q' || e.key === 'Q') ciclarArma(-1);
    if (e.key === 'e' || e.key === 'E') ciclarArma(1);
    if (e.key === 'r' || e.key === 'R') elegirArma('soga');
    if (e.key === '+' || e.key === '=') cam.z = Math.min(4, cam.z + 0.25);
    if (e.key === '-') cam.z = Math.max(0.6, cam.z - 0.25);
    if (e.key === 'Tab') { e.preventDefault(); abrirPanel(); }
    if (e.key === 'Escape') abrirPanel(false);
    if (TECLAS_F[e.key]) {
      // (que el navegador no recargue ni abra la ayuda en medio de la partida)
      if (J && fase !== 'menu') e.preventDefault();
      const fila = reglas.filas.find(f => f[0] === e.key);
      if (fila) {
        // apretar otra vez la misma tecla pasa a la siguiente de la fila
        const l = fila[1], i = l.indexOf(arma);
        for (let q = 1; q <= l.length; q++) { const a = l[(i + q) % l.length]; if (puede(a)) { elegirArma(a); break; } }
      }
    }
  });
  // el panel de armas: clic derecho lo abre y cierra; un clic en el mapa lo cierra
  cv.addEventListener('contextmenu', (e) => { e.preventDefault(); abrirPanel(); });
  $('armaBtn').addEventListener('click', () => abrirPanel());
  addEventListener('keyup', (e) => { const k = TECLAS[e.key]; if (k) apretada[k] = false; });
  addEventListener('blur', () => { for (const k in apretada) apretada[k] = false; });
  for (const b of document.querySelectorAll('[data-k]')) {
    const k = b.dataset.k;
    const on = (e) => { e.preventDefault(); cam.libre = false; if (k === 'fin') { if (juegoYo() && !reglas.practica && (fase === 'mover' || fase === 'listo')) { fase = 'esperando'; } return; } if (!apretada[k]) recien[k] = true; apretada[k] = true; };
    const off = (e) => { e.preventDefault(); apretada[k] = false; };
    b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('pointerleave', off);
  }
  $('reiniciar').addEventListener('click', () => { if (reglas.practica && J) empezarPractica(practica ? practica.mapa : 'fabrica'); });
  $('salirPractica').addEventListener('click', () => { if (reglas.practica) { J = null; practica = null; menuPrincipal(); } });

  // ── El raton: mover la camara arrastrando (como en el juego clasico, para mirar el mapa) y elegir el
  // blanco del ataque aereo (el puntero es una flecha en el color del equipo, para el lado del ataque) ──
  const raton = { x: 0, y: 0, en: false };
  let arrastre = null;
  const alMapa = (px, py) => (vista ? [vista.vx + (px * vista.d - vista.W / 2) / vista.z, vista.vy + (py * vista.d - vista.H / 2) / vista.z] : [0, 0]);
  const apuntaAereo = () => arma === 'aereo' && juegoYo() && (fase === 'mover' || fase === 'listo') && !ataco && actual() && actual().estado === 'suelo';
  cv.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    if (panel) { abrirPanel(false); return; }
    raton.x = e.clientX; raton.y = e.clientY; raton.en = true;
    arrastre = { x: e.clientX, y: e.clientY, cx: vista ? vista.vx : cam.x, cy: vista ? vista.vy : cam.y, movio: false };
    cv.setPointerCapture && cv.setPointerCapture(e.pointerId);
  });
  cv.addEventListener('pointermove', (e) => {
    raton.x = e.clientX; raton.y = e.clientY; raton.en = true;
    if (!arrastre || !vista) return;
    const dx = e.clientX - arrastre.x, dy = e.clientY - arrastre.y;
    if (!arrastre.movio && Math.abs(dx) + Math.abs(dy) < 6) return;
    arrastre.movio = true; cam.libre = true;
    cam.x = arrastre.cx - dx * vista.d / vista.z; cam.y = arrastre.cy - dy * vista.d / vista.z;
  });
  const soltarRaton = (e) => {
    const a = arrastre; arrastre = null;
    if (!a || a.movio || !e || e.type !== 'pointerup' || !apuntaAereo()) return;
    const [mx, my] = alMapa(e.clientX, e.clientY), s = actual();
    if (fase === 'listo') fase = 'mover';
    atacar(() => M.ataqueAereo(J, s, mx, my, s.dir));
  };
  cv.addEventListener('pointerup', soltarRaton); cv.addEventListener('pointercancel', soltarRaton);
  cv.addEventListener('pointerleave', () => { raton.en = false; });

  // las armas, en el orden del panel
  const ARMAS_ORDEN = () => reglas.filas.flatMap(f => f[1]);
  const conMecha = (a) => a === 'granada' || a === 'racimo' || a === 'mandarina';
  const rondaN = () => Math.ceil(nTurno / Math.max(1, jug.length));
  const demora = (a) => (reglas.demoras && reglas.demoras[a] ? Math.max(0, reglas.demoras[a] + 1 - rondaN()) : 0);
  function puede(a) { return !!(jug[turno] && jug[turno].armas && hay(jug[turno].armas[a])) && !demora(a) && (a !== 'soplete' || !!(J && J.rompe)) && (a !== 'aereo' || !(def && def.techo)); }
  function gastar(j, a) { if (j.armas[a] !== SIN_FIN && j.armas[a] > 0) j.armas[a]--; }
  // elegir un arma (arranca el turno si estaba preparandose) y avisarlo arriba, como en el juego clasico
  function elegirArma(a) {
    const s0 = actual();
    if (!juegoYo() || !puede(a) || tirosEsc > 0 || (s0 && (s0.soplete || s0.puno))) return;
    ponerArma(a);
  }
  function ponerArma(a) {
    if (fase === 'listo') fase = 'mover';
    const cambio = arma !== a; arma = a; carga = null; jug[turno].ultima = a; pintarArmas();
    if (cambio) avisoArma();
  }
  function avisoArma() {
    const col = jug[turno] ? jug[turno].color : '#fff';
    if (conMecha(arma)) aviso(`${NOMBRE_ARMA[arma]}, ${J.mecha || 3} seg, rebote ${J.rebote === 'max' ? 'máximo' : 'mínimo'}`, col);
    else aviso(`${NOMBRE_ARMA[arma]} (${cantidad(arma)})`, col);
  }
  function ciclarArma(d) { const l = ARMAS_ORDEN(); let i = l.indexOf(arma); for (let k = 0; k < l.length; k++) { i = (i + d + l.length) % l.length; if (puede(l[i])) return elegirArma(l[i]); } }
  // ── El panel de armas: una grilla con una fila por tecla ──
  const NOMBRE_ARMA = { soga: 'Soga', soplete: 'Soplete', puno: 'Puñetazo', paracaidas: 'Paracaídas', granadota: 'Granadota', bazooka: 'Bazuca', granada: 'Granada', racimo: 'Racimo', mandarina: 'Mandarina', escopeta: 'Escopeta', bate: 'Bate', dinamita: 'Dinamita', mina: 'Mina', aereo: 'Ataque aéreo' };
  let panel = false;
  const cantidad = (a) => verN(jug[turno] && jug[turno].armas ? jug[turno].armas[a] : 0);
  function abrirPanel(v) {
    panel = v === undefined ? !panel : !!v;
    if (!J || fase === 'menu' || fase === 'fin') panel = false;
    $('armas').hidden = !panel;
    if (panel) pintarArmas();
  }
  // los iconos (dibujos propios)
  function icono(c, a) {
    const g = c.getContext('2d'), k = c.width / 24;
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, c.width, c.height); g.setTransform(k, 0, 0, k, 0, 0);
    g.lineCap = 'round'; g.lineJoin = 'round';
    const bola = (cx, cy, r, oscuro, medio, brillo) => {
      g.fillStyle = oscuro; g.beginPath(); g.ellipse(cx, cy, r + 1.2, r + 1.6, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = medio; g.beginPath(); g.ellipse(cx, cy, r, r + 0.4, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = brillo; g.beginPath(); g.ellipse(cx - r * 0.4, cy - r * 0.4, r * 0.33, r * 0.22, -0.6, 0, Math.PI * 2); g.fill();
    };
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
    } else if (a === 'granada') {
      g.fillStyle = '#1d3a19'; g.beginPath(); g.ellipse(12, 15, 7.2, 7.6, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#3f7d36'; g.beginPath(); g.ellipse(12, 15, 6, 6.4, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#7cc06e'; g.beginPath(); g.ellipse(9.6, 12.4, 2, 1.4, -0.6, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#9aa3ad'; g.fillRect(9.6, 5.2, 4.8, 3.4); g.fillStyle = '#5d646c'; g.fillRect(9.6, 7.6, 4.8, 1);
      g.strokeStyle = '#d7dde3'; g.lineWidth = 1.3; g.beginPath(); g.arc(17, 5.4, 2.2, 0, Math.PI * 2); g.stroke();
    } else if (a === 'racimo') {
      // una granada gris con una faja amarilla y bolitas alrededor
      bola(12, 14, 6, '#1f2328', '#59626d', '#a9b2bd');
      g.fillStyle = '#e8c23a'; g.fillRect(6.2, 13, 11.6, 2.2);
      g.fillStyle = '#9aa3ad'; g.fillRect(10, 5.5, 4, 3);
      for (const [px, py] of [[3.5, 7], [20.5, 8], [4, 21], [20, 21]]) { g.fillStyle = '#e8c23a'; g.beginPath(); g.arc(px, py, 1.6, 0, Math.PI * 2); g.fill(); }
    } else if (a === 'mandarina') {
      // una mandarina con su hojita
      bola(12, 14, 7, '#9a3e06', '#f07f17', '#ffc27a');
      g.strokeStyle = 'rgba(150,60,8,0.6)'; g.lineWidth = 0.7;
      for (const dx of [-3, 0, 3]) { g.beginPath(); g.moveTo(12 + dx * 0.4, 7.5); g.quadraticCurveTo(12 + dx * 1.6, 14, 12 + dx * 0.4, 21); g.stroke(); }
      g.fillStyle = '#3f8f2f'; g.beginPath(); g.ellipse(15.5, 5.6, 3.6, 1.6, -0.5, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#5a3a1a'; g.lineWidth = 1; g.beginPath(); g.moveTo(12, 7.5); g.lineTo(12.6, 5); g.stroke();
    } else if (a === 'escopeta') {
      g.translate(12, 12); g.rotate(-0.35);
      g.fillStyle = '#2b2b2f'; g.fillRect(-4, -2.2, 15, 2.2); g.fillRect(-4, 0.2, 15, 1.6);
      g.fillStyle = '#7a4a22'; g.beginPath(); g.moveTo(-4, -2.4); g.lineTo(-11, -0.5); g.lineTo(-11.5, 4); g.lineTo(-7, 3.4); g.lineTo(-4, 2); g.closePath(); g.fill();
      g.fillStyle = '#a8703c'; g.fillRect(-1, 1.8, 6, 2);
    } else if (a === 'bate') {
      g.translate(12, 12); g.rotate(-0.8);
      g.fillStyle = '#6b4220'; g.beginPath(); g.moveTo(-10, -1.1); g.lineTo(3, -2.6); g.quadraticCurveTo(10.5, -2.8, 10.5, 0); g.quadraticCurveTo(10.5, 2.8, 3, 2.6); g.lineTo(-10, 1.1); g.closePath(); g.fill();
      g.fillStyle = '#d8a866'; g.beginPath(); g.moveTo(-9, -0.6); g.lineTo(3, -1.8); g.quadraticCurveTo(9.4, -2, 9.4, 0); g.quadraticCurveTo(9.4, 1.4, 3, 1.4); g.lineTo(-9, 0.5); g.closePath(); g.fill();
      g.fillStyle = '#222'; g.fillRect(-10.5, -1.3, 4, 2.6);
    } else if (a === 'dinamita') {
      g.fillStyle = '#5e0d0d'; g.fillRect(7, 7, 10.5, 15);
      g.fillStyle = '#d42a24'; g.fillRect(8, 8, 8.5, 13); g.fillStyle = '#f2665c'; g.fillRect(8.6, 8, 2, 13);
      g.fillStyle = '#e8d8a8'; g.fillRect(7.5, 12, 9.5, 3);
      g.strokeStyle = '#3a2a1a'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(12, 7); g.quadraticCurveTo(13, 3.5, 16.5, 3); g.stroke();
      g.fillStyle = '#ffd84a'; g.beginPath(); g.arc(17.2, 2.8, 1.8, 0, Math.PI * 2); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.arc(17.2, 2.8, 0.8, 0, Math.PI * 2); g.fill();
    } else if (a === 'mina') {
      g.fillStyle = '#16181b'; g.beginPath(); g.ellipse(12, 16, 9, 4.6, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#4b525a'; g.beginPath(); g.ellipse(12, 15, 8, 3.6, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#6f7882'; g.beginPath(); g.ellipse(12, 13.4, 5.4, 3, 0, Math.PI, 0); g.fill();
      g.fillStyle = '#ff3b30'; g.beginPath(); g.arc(12, 10.6, 1.8, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#ffb3ad'; g.beginPath(); g.arc(11.5, 10.1, 0.6, 0, Math.PI * 2); g.fill();
    } else if (a === 'soplete') {
      // una garrafita con boquilla y la llama azul
      g.fillStyle = '#7a1f1a'; g.fillRect(3, 9, 8, 12); g.fillStyle = '#c23a2e'; g.fillRect(4, 10, 6, 10); g.fillStyle = '#e8665a'; g.fillRect(4, 10, 1.6, 10);
      g.fillStyle = '#9aa3ad'; g.fillRect(5, 6, 4, 3); g.fillRect(8, 6.5, 8, 2);
      g.fillStyle = '#ffd84a'; g.beginPath(); g.moveTo(16, 5); g.lineTo(23, 7.5); g.lineTo(16, 10); g.closePath(); g.fill();
      g.fillStyle = '#6fb6ff'; g.beginPath(); g.moveTo(16, 6.3); g.lineTo(20.5, 7.5); g.lineTo(16, 8.7); g.closePath(); g.fill();
    } else if (a === 'puno') {
      // un puño con fuego
      g.fillStyle = '#ff7a1a'; g.beginPath(); g.ellipse(12, 9, 7, 8, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#ffd84a'; g.beginPath(); g.ellipse(12, 10.5, 4.6, 5.6, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#b9805c'; g.beginPath(); g.ellipse(12, 14, 5.6, 5, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#f1c6a2'; g.beginPath(); g.ellipse(12, 14, 4.6, 4, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#b9805c'; g.lineWidth = 0.8; for (const dx of [-2, 0, 2]) { g.beginPath(); g.moveTo(12 + dx, 11); g.lineTo(12 + dx, 14); g.stroke(); }
      g.fillStyle = '#f1c6a2'; g.fillRect(10, 18, 4, 5);
    } else if (a === 'granadota') {
      // una granada grande dorada
      bola(12, 14.5, 7.5, '#4a3a0c', '#d8b13a', '#fff3c0');
      g.fillStyle = '#7a6020'; g.fillRect(9.5, 4.5, 5, 3.2); g.strokeStyle = '#e8d38a'; g.lineWidth = 1.2; g.beginPath(); g.arc(16.5, 4.6, 2, 0, Math.PI * 2); g.stroke();
    } else if (a === 'paracaidas') {
      g.fillStyle = '#d4302a'; g.beginPath(); g.moveTo(2, 11); g.quadraticCurveTo(12, -4, 22, 11); g.closePath(); g.fill();
      g.fillStyle = '#fff'; g.beginPath(); g.moveTo(9, 10.5); g.quadraticCurveTo(12, -1, 15, 10.5); g.closePath(); g.fill();
      g.strokeStyle = '#ddd'; g.lineWidth = 0.7; g.beginPath(); g.moveTo(3, 11); g.lineTo(12, 19); g.lineTo(21, 11); g.moveTo(12, 11); g.lineTo(12, 19); g.stroke();
      g.fillStyle = '#f1c6a2'; g.beginPath(); g.arc(12, 20.5, 2.4, 0, Math.PI * 2); g.fill();
    } else if (a === 'aereo') {
      // un avioncito con tres bombas abajo
      g.fillStyle = '#2f3b52'; g.beginPath(); g.moveTo(2, 8); g.lineTo(19, 6.5); g.quadraticCurveTo(23, 7.6, 19, 9.4); g.lineTo(2, 9.6); g.closePath(); g.fill();
      g.fillStyle = '#5c6f94'; g.beginPath(); g.moveTo(8, 8); g.lineTo(13, 2.5); g.lineTo(15, 2.5); g.lineTo(12.5, 8); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(2.5, 8.5); g.lineTo(1.5, 4.5); g.lineTo(4, 4.5); g.lineTo(5.5, 8.5); g.closePath(); g.fill();
      for (const [px, py] of [[7, 15], [12, 18], [17, 15]]) { g.fillStyle = '#1d1d1d'; g.beginPath(); g.ellipse(px, py, 1.6, 2.6, 0, 0, Math.PI * 2); g.fill(); g.fillStyle = '#e0763a'; g.fillRect(px - 1.2, py - 4.4, 2.4, 1.4); }
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
    const mostrar = (a) => { pn.textContent = NOMBRE_ARMA[a]; pc.textContent = demora(a) ? 'en ' + demora(a) + (demora(a) > 1 ? ' rondas' : ' ronda') : '×' + cantidad(a); };
    for (const [rot, armas] of reglas.filas) {
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

  // atacar: en Shopper hay que haber agarrado una caja este turno; una vez por turno (la escopeta, dos tiros)
  function atacar(fn) {
    if (ataco) return false;
    if (reglas.cajaPrimero && !cajaTomada) { aviso('Primero agarrá una caja'); return false; }
    const yo = jug[turno];
    if (!hay(yo.armas[arma])) return false;
    gastar(yo, arma); fn();
    cam.libre = false;
    if (reglas.practica) { pintarArmas(); return true; }
    ataco = true; fase = 'retirada'; tiempo = (arma === 'dinamita' || arma === 'mina' ? 5 : RETIRADA) * 50; pintarArmas();
    return true;
  }
  // la escopeta: el primer tiro gasta el arma; despues queda quieta (solo apunta) hasta el segundo
  function escopeta(s) {
    if (tirosEsc === 0) {
      if (ataco) return;
      if (reglas.cajaPrimero && !cajaTomada) { aviso('Primero agarrá una caja'); return; }
      const yo = jug[turno]; if (!hay(yo.armas.escopeta)) return;
      gastar(yo, 'escopeta'); tirosEsc = M.ARMAS.escopeta.tiros; if (!reglas.practica) ataco = true;
    }
    M.escopetazo(J, s); tirosEsc--; cam.libre = false;
    if (tirosEsc > 0) aviso(`Queda ${tirosEsc} tiro`, jug[turno].color);
    else if (!reglas.practica) { fase = 'retirada'; tiempo = RETIRADA * 50; }
    pintarArmas();
  }

  function entradaDelPaso(s) {
    const e = { izq: apretada.izq, der: apretada.der, arr: apretada.arr, aba: apretada.aba, shift: apretada.shift, enter: recien.enter, retro: recien.retro, soga: false };
    if (!s || fase === 'esperando' || fase === 'listo' || fase === 'muriendo') { for (const k in recien) recien[k] = false; return {}; }
    // entre los dos tiros de la escopeta no se puede mover (solo apuntar)
    if (tirosEsc > 0) { e.izq = e.der = false; e.enter = e.retro = false; }
    if (arma === 'soga') {
      // la soga: colgada, Espacio la suelta; si no, se tira (en el modo normal hay que tener: se gasta al engancharse)
      if (recien.espacio) e.soga = s.estado === 'soga' || usoSoga || Number.isFinite(s.sogaAng) || puede('soga');
    } else if (s.estado === 'suelo' && fase !== 'retirada') {
      if (arma === 'bazooka' || arma === 'granada' || arma === 'racimo' || arma === 'mandarina' || arma === 'granadota') {
        // en el piso: Espacio carga y al soltar tira
        if (recien.espacio && !ataco) carga = 0;
        if (carga !== null) {
          if (apretada.espacio && carga < 1) carga = Math.min(1, carga + 1 / C.CARGA);
          else { const c = carga; carga = null; atacar(() => M.lanzar(J, s, c, arma)); }
        }
      } else if (recien.espacio) {
        if (arma === 'escopeta') escopeta(s);
        else if (arma === 'bate') atacar(() => M.batazo(J, s));
        else if (arma === 'puno') atacar(() => M.punetazo(J, s));
        else if (arma === 'soplete') atacar(() => M.soplete(J, s));
        else if (arma === 'dinamita' || arma === 'mina') atacar(() => M.poner(J, s, arma));
      }
    }
    // colgado o en el aire: Enter suelta el arma (atacar desde la soga)
    const suelta = arma === 'bazooka' || arma === 'granada' || arma === 'racimo' || arma === 'mandarina' || arma === 'granadota' || arma === 'dinamita' || arma === 'mina';
    // el paracaidas: en el aire, Espacio lo abre y lo cierra (se gasta al abrirlo)
    if (arma === 'paracaidas' && s.estado === 'aire' && recien.espacio) {
      if (s.paracaidas) e.paracaidas = true;
      else if (puede('paracaidas')) { e.paracaidas = true; gastar(jug[turno], 'paracaidas'); pintarArmas(); }
    }
    if ((s.estado === 'soga' || s.estado === 'aire') && e.enter && suelta) { e.enter = false; atacar(() => M.soltar(J, s, arma)); }
    // con un arma en la mano y colgado, Espacio igual suelta la soga
    if (arma !== 'soga' && s.estado === 'soga' && recien.espacio) e.soga = true;
    for (const k in recien) recien[k] = false;
    return e;
  }

  // ── La maquina: piensa con ia.js (de a poco, unos milisegundos por cuadro) y juega con las mismas teclas que una
  // persona (apunta, carga, tira la soga, camina). Con la soga, el plan sale del motor y se repite igual ──
  const IA = window.ShoppaIA;
  let cpuE = null;  // { gen, parcial, t0, limite, alListo, accion, apunta, pensado, intentos, movidas, uso }
  const PIENSA = ['{n} piensa…', '{n} calcula el viento…', '{n} mide la distancia…', '{n} estudia el terreno…'];
  const LANZABLES = new Set(['bazooka', 'granada', 'racimo', 'mandarina', 'granadota']);
  function pensar(gen, limite, alListo) { Object.assign(cpuE, { gen, parcial: null, t0: performance.now(), limite, alListo }); }
  function avanzarCPU(ms) {
    const fin = performance.now() + ms, e = cpuE;
    while (cpuE === e && e.gen && performance.now() < fin) {
      let r;
      try { r = e.gen.next(); } catch (err) { console.error('shoppa ia:', err); e.gen = null; e.alListo(null); return; }
      if (r.done) { e.gen = null; e.alListo(r.value); return; }
      if (r.value && r.value.parcial !== undefined) e.parcial = r.value.parcial;
      if (performance.now() - e.t0 > e.limite) { e.gen = null; e.alListo(e.parcial); return; }
    }
  }
  function* seguir(lista) { for (const x of lista) yield x; }
  function actuar(gen) { cpuE.accion = gen; if (fase === 'listo') fase = 'mover'; }
  function entradaCPU(s) {
    if (!s || s.estado === 'muerta' || (fase !== 'listo' && fase !== 'mover' && fase !== 'retirada')) return {};
    if (!cpuE) cpuE = { intentos: 0, movidas: 0 };
    if (cpuE.accion) {
      const r = cpuE.accion.next();
      if (r.done) { cpuE.accion = null; cpuE.apunta = false; return {}; }
      return r.value || {};
    }
    if (!cpuE.gen) decidirCPU(s);
    return {};
  }
  function terminarCPU() { if (fase === 'mover' || fase === 'listo') fase = 'esperando'; }
  function decidirCPU(s) {
    const yo = jug[turno], nivel = yo.cpu, quedan = tiempo / 50;
    if (!IA) return terminarCPU();
    if (!cpuE.pensado) { cpuE.pensado = true; aviso(frase(PIENSA, nombreDe(s)), yo.color); }
    if (ataco || fase === 'retirada') {
      // la retirada: de la dinamita y la mina, alejarse
      if ((cpuE.uso === 'dinamita' || cpuE.uso === 'mina') && !cpuE.huyo && s.estado === 'suelo') {
        cpuE.huyo = true; const d = -s.dir;
        actuar(seguir(Array.from({ length: 220 }, () => (d < 0 ? { izq: true } : { der: true }))));
      }
      return;
    }
    if (s.estado === 'aire' || s.estado === 'desliza' || s.soplete || s.puno) return; // (esperar a que se quede quieta)
    // Shopper: primero, una caja (con la soga, por etapas)
    if (reglas.cajaPrimero && !cajaTomada) {
      const objetivos = J.cosas.filter(g => g.tipo === 'caja' && g.quieta && !g.fin).map(g => ({ x: g.x, y: g.y }));
      if (!objetivos.length) { if (quedan < 18) terminarCPU(); return; } // (esperar a que caiga)
      if (cpuE.intentos >= 8 || (fase === 'mover' && quedan < 3)) return terminarCPU();
      cpuE.intentos++;
      const colgada = s.estado === 'soga', previo = colgada ? 90 : 0, paso0 = J.paso;
      pensar(IA.buscarSoga(J, s, objetivos, nivel, previo), colgada ? 1500 : 2600, (r) => {
        if (!cpuE) return;
        const atraso = J.paso - paso0;
        if (previo && atraso > previo) return; // (penso de mas: lo vuelve a pensar desde donde esta)
        if (!r || !(r.llega || r.mejora)) { if (s.estado === 'soga') return bajarCPU(s); return terminarCPU(); }
        if (arma !== 'soga') ponerArma('soga');
        actuar(seguir(Array.from({ length: Math.max(0, previo - atraso) }, () => ({})).concat(r.pasos)));
      });
      return;
    }
    // atacar: colgada, primero bajar
    if (s.estado === 'soga') return bajarCPU(s);
    const armas = ARMAS_ORDEN().filter(a => a !== 'soga' && a !== 'soplete' && a !== 'paracaidas' && puede(a));
    if (!armas.length) return terminarCPU();
    pensar(IA.buscarAtaque(J, s, armas, nivel), quedan < 8 ? 900 : 3200, (r) => {
      if (!cpuE) return;
      // (sin un buen tiro desde aca, en el modo normal camina a otro lugar y vuelve a pensar)
      if ((!r || r.puntos < 12) && !reglas.cajaPrimero && cpuE.movidas < 2 && tiempo / 50 > 12) return moverCPU(s);
      if (!r) return terminarCPU();
      actuar(hacerAtaque(s, IA.errar(r, nivel)));
    });
  }
  function bajarCPU(s) {
    const paso0 = J.paso;
    pensar(IA.buscarBajar(J, s, 60), 1100, (r) => {
      if (!cpuE) return;
      const atraso = J.paso - paso0;
      if (!r || atraso > 60) return;
      actuar(seguir(Array.from({ length: 60 - atraso }, () => ({})).concat(r.pasos)));
    });
  }
  function moverCPU(s) {
    cpuE.movidas++;
    const lugares = IA.lugaresCaminando(J, s), enemigos = J.serps.filter(o => o.estado !== 'muerta' && o.eq !== s.eq);
    if (!lugares.length || !enemigos.length) return;
    const lejos = (l) => Math.min(...enemigos.map(o => Math.hypot(o.x - l.x, o.y - l.y)));
    const l = lugares.reduce((a, b) => (lejos(b) < lejos(a) ? b : a));
    actuar(seguir(l.pasos));
  }
  function* hacerAtaque(s, acc) {
    cpuE.uso = acc.arma;
    if (arma !== acc.arma) ponerArma(acc.arma);
    if (acc.mecha && J.mecha !== acc.mecha) { J.mecha = acc.mecha; avisoArma(); }
    for (let k = 0; k < 18; k++) yield {};
    if (acc.arma !== 'aereo' && s.dir !== acc.dir) { yield acc.dir < 0 ? { izq: true } : { der: true }; yield {}; }
    cpuE.apunta = true;
    if (acc.arma !== 'aereo') {
      for (let k = 0; k < 220 && Math.abs(s.mira - acc.ang) > C.MIRA; k++) yield s.mira > acc.ang ? { arr: true } : { aba: true };
      s.mira = acc.ang;
    }
    for (let k = 0; k < 10; k++) yield {};
    if (LANZABLES.has(acc.arma)) {
      carga = 0;
      while (carga < acc.carga - 1e-9) { carga = Math.min(acc.carga, carga + 1 / C.CARGA); yield {}; }
      const c = carga; carga = null; atacar(() => M.lanzar(J, s, c, acc.arma));
    } else if (acc.arma === 'escopeta') {
      escopeta(s);
      for (let k = 0; k < 30; k++) yield {};
      if (tirosEsc > 0) escopeta(s);
    } else if (acc.arma === 'bate') atacar(() => M.batazo(J, s));
    else if (acc.arma === 'puno') atacar(() => M.punetazo(J, s));
    else if (acc.arma === 'dinamita' || acc.arma === 'mina') atacar(() => M.poner(J, s, acc.arma));
    else if (acc.arma === 'aereo') atacar(() => M.ataqueAereo(J, s, acc.x, acc.y, acc.dir));
    cpuE.apunta = false;
  }

  // ── Un paso del juego (el que simula) ──
  function paso() {
    const yo = jug[turno], s = actual();
    // preparandose: la primera tecla (o el fin de la cuenta) arranca el turno
    if (fase === 'listo') {
      const algo = !yo.cpu && Object.keys(recien).some(k => recien[k]); // (solo teclas apretadas en este turno)
      if (algo || --listo <= 0) fase = 'mover';
      else if (listo % 50 === 0) aviso(`${yo.nombre}: ${listo / 50} seg`, yo.color);
    }
    const ia = J.serps.indexOf(s), ent = yo.cpu ? entradaCPU(s) : entradaDelPaso(s);
    if (s && (fase === 'esperando' || fase === 'muriendo')) s.gancho = null;
    M.pasoJuego(J, J.serps.map((o, i) => (i === ia ? ent : {})));
    // la soga del modo normal: se gasta una al engancharse (hasta volver al piso es la misma)
    if (s && s.estado === 'soga' && !usoSoga) { usoSoga = true; gastar(yo, 'soga'); pintarArmas(); }
    if (s && (s.estado === 'suelo' || s.estado === 'desliza')) usoSoga = false;
    // agarrar cajas
    for (const g of J.cosas) {
      if (g.tipo !== 'caja' || g.fin || !s || s.estado === 'muerta') continue;
      if (Math.abs(g.x - s.x) < 12 && Math.abs(g.y - s.y) < 16) { g.fin = true; tomarCaja(yo, s, g); }
    }
    J.cosas = J.cosas.filter(g => !g.fin);
    eventos();
    // al agua: se comenta arriba
    for (const o of J.serps) {
      if (o.estado === 'muerta' && o.estAnt && o.estAnt !== 'muerta' && !o.comentada) { o.comentada = true; o.ahogada = true; aviso(frase(AL_AGUA, nombreDe(o)), jug[o.eq].color); afuera(o.eq); }
      o.estAnt = o.estado;
    }
    if (reglas.practica) return pasoPractica(s);
    // la caida que lastima corta el turno (como en el juego clasico); en el modo normal, cualquier daño propio
    if ((fase === 'mover' || fase === 'retirada') && !s) fase = 'esperando';
    if (fase === 'mover' || fase === 'retirada') {
      if (s.vida < vidaAntes && s.caida) { fase = 'esperando'; aviso('¡Se golpeó!'); s.caida = 0; }
      else if (reglas.danoCorta && s.vida < vidaAntes) fase = 'esperando';
      if (s.estado === 'muerta' || s.vida <= 0) fase = 'esperando';
    }
    // el reloj (y el de la ronda, en el modo normal)
    if (fase === 'retirada' && s && (s.soplete || s.puno)) tiempo = RETIRADA * 50;
    if (fase === 'mover' || fase === 'retirada') { if (--tiempo <= 0) fase = 'esperando'; }
    if (reglas.ronda && ronda > 0 && fase !== 'listo') ronda--;
    // al final del turno: cuando todo se calma, las que quedaron sin vida explotan de a una (y dejan una lapida);
    // despues pasa el turno
    if (fase === 'esperando' || fase === 'muriendo') {
      if (s && s.soga) { s.soga = null; s.estado = 'aire'; }
      quietos = M.quieto(J) ? quietos + 1 : 0;
      if (quietos > 25) {
        quietos = 0;
        const o = J.serps.find(z => z.vida <= 0 && z.estado !== 'muerta');
        if (o) { fase = 'muriendo'; morir(o); } else terminarTurno();
      }
    }
    if (online && ++ultimaFoto % 4 === 0) online.socket.emit('shoppa:snapshot', { id: online.id, snapshot: foto(ultimaFoto % 100 === 0) });
  }
  function pasoPractica(s) {
    // sin reloj ni turnos: la que se queda sin vida explota cuando todo se calma y despues vuelve a aparecer
    if (fase !== 'mover') fase = 'mover';
    quietos = M.quieto(J) ? quietos + 1 : 0;
    if (quietos > 25) { const o = J.serps.find(z => z.vida <= 0 && z.estado !== 'muerta'); if (o) { quietos = 0; morir(o); } }
    for (const o of J.serps) if (o.estado === 'muerta' && (o.revive = (o.revive || 0) + 1) > 75) revivir(o);
    if (s && s.caida) { aviso('¡Se golpeó!'); s.caida = 0; }
    if (J.cosas.filter(g => g.tipo === 'caja').length < reglas.cajasMax) soltarCaja();
    // (las lapidas se van juntando: quedan las ultimas 12)
    const lap = J.cosas.filter(g => g.tipo === 'lapida'); if (lap.length > 12) lap[0].fin = true;
  }
  function tomarCaja(yo, s, g) {
    if (g.n === 'vida') { s.vida += 25; vidaAntes = Math.max(vidaAntes, s.vida); texto(g.x, g.y - 16, '+25', '#7dff8a'); }
    else if (g.n === 'nada') { practica.cajas++; aviso(`Caja ${practica.cajas}`, yo.color); }
    else { if (yo.armas[g.n] !== SIN_FIN) yo.armas[g.n] = (yo.armas[g.n] || 0) + 1; texto(g.x, g.y - 16, '+1 ' + NOMBRE_ARMA[g.n], '#ffd23f'); }
    cajaTomada = true; pintarArmas();
  }
  function eventos() {
    for (const ev of J.eventos) {
      if (ev.tipo === 'dano') texto(ev.x, ev.y, '-' + ev.n, '#ff8a8a');
      else if (ev.tipo === 'tiro') trazos.push({ x0: r1(ev.x0), y0: r1(ev.y0), x1: r1(ev.x1), y1: r1(ev.y1), v: 1 });
      else if (ev.tipo === 'bate') trazos.push({ bate: true, x0: r1(ev.x), y0: r1(ev.y), dir: ev.dir, v: 1 });
      else if (ev.tipo === 'falla') texto(ev.x, ev.y - 10, '¡Falló!', '#cfcfcf');
    }
    J.eventos = [];
  }
  // una que se queda sin vida: explota (chiquito), deja una lapida y se comenta arriba
  function morir(o) {
    o.estado = 'muerta'; o.soga = null; o.gancho = null; o.comentada = true; foco = o;
    M.explotar(J, o.x, o.y, M.ARMAS.muerte);
    J.cosas.push({ tipo: 'lapida', x: o.x, y: o.y + 4, vx: 0, vy: -1.6, eq: o.eq, quieta: false });
    eventos();
    if (jug[o.eq].muneco) return;
    comentario = [frase(SE_MUERE, nombreDe(o)), jug[o.eq].color]; aviso(comentario[0], comentario[1]);
    afuera(o.eq);
  }
  // un equipo sin serpientes queda afuera (se avisa, en el modo de equipos)
  function afuera(t) {
    const j = jug[t];
    if (reglas.gusanos < 2 || j.fuera || vivo(t)) return;
    j.fuera = true; comentario = [`¡${j.nombre} quedó afuera!`, j.color]; aviso(comentario[0], comentario[1]);
  }

  function terminarTurno() {
    for (const o of J.serps) if (o.vida <= 0 && o.estado !== 'muerta') morir(o); // (por las dudas)
    fase = 'pasando';
    if (online) { online.socket.emit('shoppa:finTurno', { id: online.id, snapshot: foto(true) }); return; }
    const vivos = jug.map((j, i) => i).filter(vivo);
    if (vivos.length <= 1) return fin(vivos.length ? vivos[0] : null);
    for (let k = 1; k <= jug.length; k++) { const i = (turno + k) % jug.length; if (vivos.includes(i)) { turno = i; break; } }
    empezarTurno();
  }

  function fin(ganador) {
    fase = 'fin';
    const m = $('menu'); m.hidden = false; m.textContent = '';
    const c = caja();
    c.append(h('h1', ganador == null ? 'Empate' : `¡Ganó ${jug[ganador].nombre}!`), p(reglas.id === 'normal' ? 'Modo normal: gana el último equipo que queda.' : 'Shopper: el último que queda gana.'));
    const acc = div('acc');
    if (online) {
      acc.append(boton('Revancha', 'primario', () => online.socket.emit('shoppa:revancha', { id: online.id }, (r) => { if (r && r.error) aviso(r.error); else aviso('Esperando a los demás…'); })));
      acc.append(boton('Salir', '', () => salirOnline()));
    } else acc.append(boton('Otra', 'primario', () => menuLocal(reglas.id)), boton('Menú', '', () => menuPrincipal()));
    c.appendChild(acc); m.appendChild(c);
  }

  // ── La foto del estado (online) ──
  // completa: todas las serpientes con todo (al final del turno y cada tanto); si no, las que estan quietas en el
  // piso van con lo justo (en el modo normal son muchas)
  const r1 = (v) => Math.round(v * 100) / 100;
  function foto(completa) {
    const s0 = actual();
    const quieta = (s) => !completa && s !== s0 && (s.estado === 'suelo' || s.estado === 'muerta') && !s.soga && !s.gancho;
    return {
      mapa: def.id, modo: reglas.id, turno, fase, tiempo, cajaN, nTurno, cajaTomada, ataco, arma, viento: J.viento,
      gusanos: J.serps.map(s => ({ equipo: s.eq, muerto: s.estado === 'muerta' })),
      armas: jug.map(j => j.armas), cuales: jug.map(j => j.cual), fuera: jug.map(j => !!j.fuera),
      serps: J.serps.map(s => (quieta(s)
        ? { x: r1(s.x), y: r1(s.y), estado: s.estado, dir: s.dir, mira: r1(s.mira), vida: s.vida }
        : { x: r1(s.x), y: r1(s.y), vx: r1(s.vx), vy: r1(s.vy), estado: s.estado, dir: s.dir, mira: r1(s.mira), vida: s.vida, soga: s.soga, gancho: s.gancho, sogaAng: s.sogaAng, sinControl: s.sinControl, rueda: s.rueda, fase: s.fase || 0, giro: s.giro || 0, aireT: s.aireT || 0, soplete: s.soplete || null, puno: s.puno || null, paracaidas: !!s.paracaidas, sinCaida: !!s.sinCaida, salto: s.salto || null })),
      cosas: J.cosas.map(g => { const o = { ...g }; for (const k of ['x', 'y', 'vx', 'vy']) if (typeof o[k] === 'number') o[k] = r1(o[k]); return o; }),
      efectos: J.efectos.filter(e => e.t < 3),
      textos: textos.filter(t => t.v > 1.6).map(t => ({ ...t })), aviso: avisoUlt,
      trazos: trazos.filter(t => t.v > 0.7).map(t => ({ ...t })),
      ronda, subita, agua: J.T.agua, tirosEsc, usoSoga,
      // los huecos del terreno: los de este turno siempre; todos, en la foto completa
      cr0: crTurno, crU: J.crateres.slice(crTurno), cr: completa ? J.crateres : undefined,
    };
  }
  const QUIETA = { vx: 0, vy: 0, soga: null, gancho: null, sogaAng: null, sinControl: false, rueda: null, giro: 0, atras: false, salto: null, soplete: null, puno: null, paracaidas: false, sinCaida: false };
  function aplicarCrateres(f) {
    let lista = null, base = 0;
    if (Array.isArray(f.cr)) lista = f.cr;
    else if (Array.isArray(f.crU) && Number.isInteger(f.cr0) && f.cr0 <= J.crateres.length) { lista = f.crU; base = f.cr0; }
    if (!lista) return;
    for (let i = J.crateres.length - base; i < lista.length; i++) {
      const c = lista[i];
      if (i >= 0 && Array.isArray(c) && c.length === 3 && c.every(Number.isFinite) && c[2] <= 200) M.crater(J, c[0], c[1], c[2]);
    }
  }
  function sincronizarCrateres(cr) {
    const n = J.crateres.length;
    let igual = n <= cr.length;
    for (let i = 0; igual && i < n; i++) { const a = J.crateres[i], b = cr[i]; if (!Array.isArray(b) || a[0] !== b[0] || a[1] !== b[1] || a[2] !== b[2]) igual = false; }
    if (!igual) {
      const agua = J.T.agua, T = MP.terreno(M, def); T.agua = agua;
      fondo = MP.pintar(def, T); J.T = T; J.crateres = []; J.borrados = [];
    }
    aplicarCrateres({ cr });
  }
  function aplicar(f) {
    if (!f || !J) return;
    fase = f.fase === 'pasando' ? 'esperando' : f.fase; tiempo = f.tiempo; cajaN = f.cajaN; nTurno = f.nTurno || nTurno;
    cajaTomada = f.cajaTomada; ataco = f.ataco; arma = f.arma || 'soga'; J.viento = f.viento || 0;
    (f.armas || []).forEach((a, i) => { if (jug[i] && a && typeof a === 'object') jug[i].armas = jug[i].muneco ? a : Object.assign(reglas.armas(), a); });
    (f.cuales || []).forEach((c, i) => { if (jug[i] && Number.isInteger(c)) jug[i].cual = c; });
    (f.fuera || []).forEach((v, i) => { if (jug[i]) jug[i].fuera = !!v; });
    if (Number.isFinite(f.ronda)) ronda = f.ronda;
    if (f.subita != null) subita = !!f.subita;
    if (Number.isFinite(f.agua)) J.T.agua = f.agua;
    tirosEsc = f.tirosEsc || 0; usoSoga = !!f.usoSoga;
    aplicarCrateres(f);
    (f.serps || []).forEach((d, i) => {
      const s = J.serps[i]; if (!s) return;
      Object.assign(s, d);
      if (!('vx' in d) && (d.estado === 'suelo' || d.estado === 'muerta')) Object.assign(s, QUIETA);
      const u = s.cola[0]; if (!u || Math.abs(u[0] - s.x) + Math.abs(u[1] - s.y) >= 1.2) { s.cola.unshift([s.x, s.y]); if (s.cola.length > 40) s.cola.pop(); }
    });
    J.cosas = (f.cosas || []).map(g => ({ ...g }));
    for (const e of f.efectos || []) if (!J.efectos.some(z => z.x === e.x && z.y === e.y)) J.efectos.push({ ...e });
    for (const t of f.textos || []) if (!textos.some(z => z.x === t.x && z.y === t.y && z.s === t.s)) textos.push({ ...t });
    for (const t of f.trazos || []) if (!trazos.some(z => z.x0 === t.x0 && z.y0 === t.y0 && z.x1 === t.x1)) trazos.push({ ...t });
    // el mensaje de arriba del que juega (y las que ya murieron no se vuelven a comentar aca)
    if (f.aviso && f.aviso.id !== avisoVisto) { avisoVisto = f.aviso.id; mostrarAviso(f.aviso.t, f.aviso.c); }
    for (const s of J.serps) { s.estAnt = s.estado; if (s.estado === 'muerta') s.comentada = true; }
    pintarArmas();
  }

  // ── El bucle: 50 pasos por segundo fijos ──
  let acc = 0, ant = performance.now(), errorVisto = false;
  function bucle(ahora) {
    acc += Math.min(200, ahora - ant); ant = ahora;
    while (acc >= PASO) {
      if (J && fase !== 'menu' && fase !== 'fin' && fase !== 'pasando') {
        if (simulaYo()) {
          // (un error en un paso no puede dejar el juego congelado: se anota una vez y sigue)
          try { paso(); } catch (err) { if (!errorVisto) { errorVisto = true; console.error('shoppa:', err); } }
        }
        else {
          // (los relojes, entre fotos)
          if ((fase === 'mover' || fase === 'retirada') && tiempo > 0) tiempo--;
          if (reglas.ronda && ronda > 0 && fase !== 'listo' && fase !== 'esperando') ronda--;
        }
      }
      acc -= PASO;
    }
    // la maquina piensa un poco en cada cuadro (asi no se traba la pantalla)
    if (J && cpuE && cpuE.gen) avanzarCPU(11);
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
    // perpendicular a la soga, para atras de donde mira, y todo gira con la soga. Despues de soltarla (o volando
    // por una explosion o un golpe) va enrollada y rueda
    const vuela = s.estado === 'aire' && !s.giro && (Number.isFinite(s.sogaAng) || (s.sinControl && Math.abs(s.vx) + Math.abs(s.vy) > 2.5));
    const pose = s.soga ? 'colgada' : (vuela ? 'rueda' : null);
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

  // ── Las cosas sueltas (dibujos propios) ──
  // la lapida: una piedra redondeada arriba con una serpiente grabada, sobre un montoncito de tierra, con una
  // florcita en el color del equipo (g.y es la base)
  function pintarLapida(g) {
    const bx = g.x, by = g.y;
    x.fillStyle = '#3d2a1c'; x.beginPath(); x.ellipse(bx, by - 0.5, 7, 2.2, 0, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#353a42'; x.beginPath(); x.moveTo(bx - 5.6, by); x.lineTo(bx - 5.6, by - 9); x.arc(bx, by - 9, 5.6, Math.PI, 0); x.lineTo(bx + 5.6, by); x.closePath(); x.fill();
    x.fillStyle = '#9aa1ab'; x.beginPath(); x.moveTo(bx - 4.7, by - 0.6); x.lineTo(bx - 4.7, by - 9); x.arc(bx, by - 9, 4.7, Math.PI, 0); x.lineTo(bx + 4.7, by - 0.6); x.closePath(); x.fill();
    x.fillStyle = '#c3c9d1'; x.fillRect(bx - 4.2, by - 10, 1.4, 8.5);
    x.strokeStyle = '#5d636c'; x.lineWidth = 0.8; x.lineCap = 'round';
    x.beginPath(); x.moveTo(bx + 1.8, by - 12); x.quadraticCurveTo(bx - 2.2, by - 11, bx, by - 8); x.quadraticCurveTo(bx + 2.2, by - 5, bx - 1.8, by - 3.6); x.stroke();
    x.fillStyle = '#5d636c'; x.beginPath(); x.arc(bx + 1.9, by - 12, 0.8, 0, Math.PI * 2); x.fill();
    const col = jug[g.eq] ? jug[g.eq].color : '#fff';
    x.strokeStyle = '#3f8f2f'; x.lineWidth = 0.6; x.beginPath(); x.moveTo(bx - 6, by); x.lineTo(bx - 6.4, by - 3); x.stroke();
    x.fillStyle = col; x.beginPath(); x.arc(bx - 6.4, by - 3.6, 1.2, 0, Math.PI * 2); x.fill();
  }
  function pintarCosa(g, t) {
    const T = g.tipo;
    if (T === 'granada') { x.fillStyle = '#2f5d2a'; x.beginPath(); x.arc(g.x, g.y, 2.6, 0, Math.PI * 2); x.fill(); }
    else if (T === 'bazooka' || T === 'misil') { const a = Math.atan2(g.vy, g.vx); x.save(); x.translate(g.x, g.y); x.rotate(a); x.fillStyle = T === 'misil' ? '#3a3f4a' : '#d0d4da'; x.fillRect(-5, -1.5, 8, 3); x.fillStyle = '#e0763a'; x.fillRect(-7, -1, 2, 2); x.restore(); }
    else if (T === 'granadota') { x.fillStyle = '#5e4a12'; x.beginPath(); x.arc(g.x, g.y - 1, 4, 0, Math.PI * 2); x.fill(); x.fillStyle = '#d8b13a'; x.beginPath(); x.arc(g.x, g.y - 1, 3.1, 0, Math.PI * 2); x.fill(); x.fillStyle = '#fff3c0'; x.fillRect(g.x - 2, g.y - 3, 1.4, 1.4); }
    else if (T === 'racimo') { x.fillStyle = '#3c434c'; x.beginPath(); x.arc(g.x, g.y, 2.8, 0, Math.PI * 2); x.fill(); x.fillStyle = '#e8c23a'; x.fillRect(g.x - 2.8, g.y - 0.5, 5.6, 1); }
    else if (T === 'racimito') { x.fillStyle = '#e8c23a'; x.beginPath(); x.arc(g.x, g.y, 1.4, 0, Math.PI * 2); x.fill(); }
    else if (T === 'mandarina') { x.fillStyle = '#f07f17'; x.beginPath(); x.arc(g.x, g.y, 3, 0, Math.PI * 2); x.fill(); x.fillStyle = '#3f8f2f'; x.fillRect(g.x, g.y - 3.6, 2, 1.2); }
    else if (T === 'gajo') { x.save(); x.translate(g.x, g.y); x.rotate(t / 90 + g.x); x.fillStyle = '#f39a3a'; x.beginPath(); x.ellipse(0, 0, 2.4, 1.3, 0, 0, Math.PI * 2); x.fill(); x.restore(); }
    else if (T === 'dinamita') {
      x.fillStyle = '#5e0d0d'; x.fillRect(g.x - 2.4, g.y - 9, 4.8, 9); x.fillStyle = '#d42a24'; x.fillRect(g.x - 1.8, g.y - 8.5, 3.6, 8);
      x.fillStyle = '#e8d8a8'; x.fillRect(g.x - 2.2, g.y - 5.8, 4.4, 1.5);
      x.strokeStyle = '#3a2a1a'; x.lineWidth = 0.6; x.beginPath(); x.moveTo(g.x, g.y - 9); x.lineTo(g.x + 1.5, g.y - 11); x.stroke();
      if (Math.floor(t / 70) % 2) { x.fillStyle = '#ffd84a'; x.beginPath(); x.arc(g.x + 1.6, g.y - 11.2, 1.1, 0, Math.PI * 2); x.fill(); }
    } else if (T === 'mina') {
      x.fillStyle = '#16181b'; x.beginPath(); x.ellipse(g.x, g.y - 1.6, 4.6, 2.2, 0, 0, Math.PI * 2); x.fill();
      x.fillStyle = '#5a626b'; x.beginPath(); x.ellipse(g.x, g.y - 2.4, 3.2, 1.8, 0, Math.PI, 0); x.fill();
      // la lucecita: apagada mientras se arma, titila armada, rapido si esta por explotar
      const vel = g.cuenta != null ? 6 : 45, on = g.arma > 0 ? false : Math.floor(t / (vel * 20)) % 2 === 0;
      x.fillStyle = on ? '#ff3b30' : '#5a1512'; x.beginPath(); x.arc(g.x, g.y - 4, 0.9, 0, Math.PI * 2); x.fill();
      if (g.cuenta != null) { x.font = 'bold 8px system-ui'; x.textAlign = 'center'; x.lineWidth = 2; x.strokeStyle = '#000'; const n = String(Math.max(1, Math.ceil(g.cuenta / 50))); x.strokeText(n, g.x, g.y - 8); x.fillStyle = '#fff'; x.fillText(n, g.x, g.y - 8); }
    } else if (T === 'barril') {
      // un barril de chapa roja con dos zunchos y un rombo amarillo (dibujo propio)
      x.fillStyle = '#4a0f0b'; x.fillRect(g.x - 5.4, g.y - 13, 10.8, 13);
      x.fillStyle = '#b8291d'; x.fillRect(g.x - 4.6, g.y - 12.4, 9.2, 11.8);
      x.fillStyle = '#e24b36'; x.fillRect(g.x - 4.6, g.y - 12.4, 2, 11.8);
      x.fillStyle = '#4a0f0b'; x.fillRect(g.x - 5.4, g.y - 10, 10.8, 1); x.fillRect(g.x - 5.4, g.y - 4, 10.8, 1);
      x.fillStyle = '#ffd23f'; x.beginPath(); x.moveTo(g.x, g.y - 9.2); x.lineTo(g.x + 2.4, g.y - 7); x.lineTo(g.x, g.y - 4.8); x.lineTo(g.x - 2.4, g.y - 7); x.closePath(); x.fill();
      x.fillStyle = '#4a0f0b'; x.fillRect(g.x - 0.4, g.y - 8.4, 0.8, 2);
      if (g.prendido) {
        const f = 0.7 + 0.3 * Math.sin(t / 45);
        x.fillStyle = '#ff7a1a'; x.beginPath(); x.ellipse(g.x, g.y - 15 * f, 3, 4 * f, 0, 0, Math.PI * 2); x.fill();
        x.fillStyle = '#ffd84a'; x.beginPath(); x.ellipse(g.x, g.y - 14, 1.6, 2.4 * f, 0, 0, Math.PI * 2); x.fill();
        if (Math.random() < 0.15) particulas.push({ x: g.x, y: g.y - 18, vx: (Math.random() - 0.5) * 0.4, vy: -0.4, v: 0.7, humo: true, r: 1.5, c: '#888' });
      }
    } else if (T === 'llama') {
      const f = 0.75 + 0.25 * Math.sin(t / 50 + g.x * 3), al = Math.min(1, g.t / 40);
      x.globalAlpha = al;
      x.fillStyle = '#ff7a1a'; x.beginPath(); x.ellipse(g.x, g.y - 2.6 * f, 2.2, 3.4 * f, 0, 0, Math.PI * 2); x.fill();
      x.fillStyle = '#ffd84a'; x.beginPath(); x.ellipse(g.x, g.y - 1.8 * f, 1.2, 2 * f, 0, 0, Math.PI * 2); x.fill();
      x.globalAlpha = 1;
    } else if (T === 'lapida') pintarLapida(g);
  }

  // humo y tierra que salta en las explosiones (solo dibujo: salen de los efectos, que viajan en la foto)
  function particulasDe(e) {
    const tierra = def.tema ? def.tema.tierra[0] : '#8d939c';
    const n = Math.min(26, 6 + Math.round(e.r / 4));
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2, v = 0.6 + Math.random() * e.r / 18;
      particulas.push({ x: e.x, y: e.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1, v: 1, humo: k % 2 === 0, r: 1 + Math.random() * e.r / 14, c: tierra });
    }
  }

  const VUELAN = new Set(['bazooka', 'granada', 'racimo', 'racimito', 'mandarina', 'gajo', 'granadota', 'dinamita', 'misil']);
  function pintarCrateres() {
    const fx = fondo.getContext('2d');
    for (const [cx, cy, r] of J.borrados) {
      fx.globalCompositeOperation = 'destination-out'; fx.beginPath(); fx.arc(cx, cy, r, 0, Math.PI * 2); fx.fill();
      // el borde quemado (solo sobre el terreno que quedo)
      fx.globalCompositeOperation = 'source-atop'; fx.strokeStyle = def.tema ? def.tema.borde : '#2a2a2a'; fx.lineWidth = 3; fx.beginPath(); fx.arc(cx, cy, r + 1.5, 0, Math.PI * 2); fx.stroke();
    }
    fx.globalCompositeOperation = 'source-over';
    J.borrados = [];
  }

  function dibujar(t) {
    if (J.borrados.length) pintarCrateres();
    const W = cv.width, H = cv.height, d = Math.min(2, devicePixelRatio || 1), z = cam.z * d;
    // la camara: lo que vuela (si hay), la que se esta muriendo o la serpiente del turno (salvo que se haya movido
    // con el raton: entonces se queda ahi hasta que pase algo)
    const vuela = J.cosas.find(g => VUELAN.has(g.tipo) || (g.tipo === 'mina' && g.cuenta != null));
    if (vuela) cam.libre = false;
    const s0 = actual();
    const obj = vuela || (foco && fase === 'muriendo' ? foco : null) || s0 || { x: def.w / 2, y: def.h / 2 };
    if (!cam.libre) { cam.x += (obj.x - cam.x) * 0.1; cam.y += (obj.y - cam.y) * 0.1; }
    const vw = W / z, vh = H / z;
    cam.x = Math.max(-100, Math.min(def.w + 100, cam.x)); cam.y = Math.max(-200, Math.min(def.h + 100, cam.y));
    const vx = vw >= def.w ? def.w / 2 : Math.max(vw / 2, Math.min(def.w - vw / 2, cam.x));
    const vy = vh >= def.h ? def.h / 2 : Math.max(vh / 2, Math.min(def.h - vh / 2 + 40, cam.y));
    if (cam.libre) { cam.x = vx; cam.y = vy; }
    vista = { vx, vy, z, W, H, d };
    x.setTransform(1, 0, 0, 1, 0, 0);
    const cielo = x.createLinearGradient(0, 0, 0, H); cielo.addColorStop(0, def.cielo[0]); cielo.addColorStop(0.6, def.cielo[1]); cielo.addColorStop(1, def.cielo[2]);
    x.fillStyle = cielo; x.fillRect(0, 0, W, H);
    x.setTransform(z, 0, 0, z, Math.round(W / 2 - vx * z), Math.round(H / 2 - vy * z));
    x.imageSmoothingEnabled = false;
    x.drawImage(fondo, 0, 0);
    // las cajas (de armas: madera; de vida: verdes con una cruz blanca)
    for (const g of J.cosas) if (g.tipo === 'caja') {
      if (!g.quieta) { x.strokeStyle = 'rgba(255,255,255,0.6)'; x.lineWidth = 0.8; x.beginPath(); x.arc(g.x, g.y - 16, 10, Math.PI, 0); x.stroke(); x.beginPath(); x.moveTo(g.x - 10, g.y - 16); x.lineTo(g.x - 5, g.y - 6); x.moveTo(g.x + 10, g.y - 16); x.lineTo(g.x + 5, g.y - 6); x.stroke(); }
      if (g.n === 'vida') {
        x.fillStyle = '#1d5e27'; x.fillRect(g.x - 7, g.y - 6, 14, 14); x.fillStyle = '#3fae4f'; x.fillRect(g.x - 6, g.y - 5, 12, 12);
        x.fillStyle = '#fff'; x.fillRect(g.x - 1.5, g.y - 3.5, 3, 9); x.fillRect(g.x - 4.5, g.y - 0.5, 9, 3);
      } else {
        x.fillStyle = '#7a4a22'; x.fillRect(g.x - 7, g.y - 6, 14, 14); x.fillStyle = '#b8783c'; x.fillRect(g.x - 6, g.y - 5, 12, 12);
        x.fillStyle = '#7a4a22'; x.fillRect(g.x - 6, g.y, 12, 1); x.fillRect(g.x, g.y - 5, 1, 12);
      }
    }
    // lapidas, barriles y minas (abajo de las serpientes)
    for (const g of J.cosas) if (g.tipo === 'lapida' || g.tipo === 'barril' || g.tipo === 'mina') pintarCosa(g, t);
    // las sogas
    for (const s of J.serps) {
      if (s.soga) { x.strokeStyle = '#e9dcc0'; x.lineWidth = 1; x.beginPath(); x.moveTo(s.soga.piv[0].x, s.soga.piv[0].y); for (const p of s.soga.piv) x.lineTo(p.x, p.y); x.lineTo(s.x, s.y - 6); x.stroke(); }
      if (s.gancho) { x.strokeStyle = '#e9dcc0'; x.lineWidth = 1; x.beginPath(); x.moveTo(s.x, s.y - 6); x.lineTo(s.gancho.x, s.gancho.y); x.stroke(); }
    }
    J.serps.forEach(s => pintarSerpiente(s, t));
    // el soplete: una llama azul y amarilla para adelante, con chispas; el puño: fuego arriba de la cabeza
    for (const s of J.serps) {
      if (s.soplete) {
        const a = s.soplete.ang, ux = Math.cos(a) * s.dir, uy = Math.sin(a), bx = s.x + ux * 6, by = s.y - 2 + uy * 6, f = 0.8 + 0.2 * Math.sin(t / 30);
        x.save(); x.translate(bx, by); x.rotate(Math.atan2(uy, ux));
        x.fillStyle = '#5a6068'; x.fillRect(-4, -1.6, 4, 3.2);
        x.fillStyle = 'rgba(255,210,80,0.85)'; x.beginPath(); x.moveTo(0, -2.4); x.lineTo(9 * f, 0); x.lineTo(0, 2.4); x.closePath(); x.fill();
        x.fillStyle = 'rgba(120,180,255,0.9)'; x.beginPath(); x.moveTo(0, -1.2); x.lineTo(5 * f, 0); x.lineTo(0, 1.2); x.closePath(); x.fill();
        x.restore();
        if (Math.random() < 0.5) particulas.push({ x: bx + ux * 8, y: by + uy * 8, vx: (Math.random() - 0.5) * 1.5 - ux, vy: -Math.random() * 1.5, v: 0.5, humo: false, r: 1.2, c: '#ffd84a' });
      }
      if (s.paracaidas && s.estado === 'aire') {
        const col = jug[s.eq] ? jug[s.eq].color : '#fff';
        x.strokeStyle = 'rgba(255,255,255,0.8)'; x.lineWidth = 0.5; x.beginPath(); x.moveTo(s.x - 9, s.y - 26); x.lineTo(s.x, s.y - 6); x.lineTo(s.x + 9, s.y - 26); x.moveTo(s.x, s.y - 30); x.lineTo(s.x, s.y - 6); x.stroke();
        x.fillStyle = col; x.beginPath(); x.moveTo(s.x - 11, s.y - 25); x.quadraticCurveTo(s.x, s.y - 42, s.x + 11, s.y - 25); x.closePath(); x.fill();
        x.fillStyle = 'rgba(255,255,255,0.55)'; x.beginPath(); x.moveTo(s.x - 4, s.y - 27); x.quadraticCurveTo(s.x, s.y - 40, s.x + 4, s.y - 27); x.closePath(); x.fill();
      }
      if (s.puno) {
        const f = 0.8 + 0.2 * Math.sin(t / 25), fx = s.x + s.dir * 5, fy = s.y - 14;
        x.fillStyle = 'rgba(255,120,30,0.85)'; x.beginPath(); x.ellipse(fx, fy, 3.6, 5.5 * f, 0, 0, Math.PI * 2); x.fill();
        x.fillStyle = 'rgba(255,220,90,0.95)'; x.beginPath(); x.ellipse(fx, fy + 1, 2, 3 * f, 0, 0, Math.PI * 2); x.fill();
        x.fillStyle = '#f1c6a2'; x.beginPath(); x.arc(fx, fy + 3, 1.8, 0, Math.PI * 2); x.fill();
      }
    }
    // lo que vuela y el fuego
    for (const g of J.cosas) if (g.tipo !== 'caja' && g.tipo !== 'lapida' && g.tipo !== 'barril' && g.tipo !== 'mina') pintarCosa(g, t);
    // las explosiones: un fogonazo, un anillo y humo y tierra que salta
    for (const e of J.efectos) {
      if (!e.t) particulasDe(e);
      // (la granadota: un destello blanco grande)
      if (e.r >= 100 && (e.t || 0) < 6) { x.fillStyle = 'rgba(255,255,255,' + (0.5 - (e.t || 0) * 0.08) + ')'; x.beginPath(); x.arc(e.x, e.y, e.r * 1.2, 0, Math.PI * 2); x.fill(); }
      e.t = (e.t || 0) + 1;
      if (e.humo) continue;
      const k = Math.min(1, e.t / 4);
      x.fillStyle = `rgba(255,${Math.max(120, 235 - e.t * 8)},${Math.max(40, 160 - e.t * 10)},${Math.max(0, 0.9 - e.t / 14)})`;
      x.beginPath(); x.arc(e.x, e.y, e.r * 0.8 * k, 0, Math.PI * 2); x.fill();
      x.strokeStyle = `rgba(255,255,255,${Math.max(0, 0.7 - e.t / 16)})`; x.lineWidth = 1.4;
      x.beginPath(); x.ellipse(e.x, e.y, e.r * (0.6 + e.t / 18), e.r * (0.25 + e.t / 40), 0, 0, Math.PI * 2); x.stroke();
    }
    J.efectos = J.efectos.filter(e => e.t < 22);
    for (const q of particulas) {
      q.v -= q.humo ? 0.012 : 0.02; q.x += q.vx; q.y += q.vy;
      if (q.humo) { q.vx *= 0.94; q.vy = q.vy * 0.94 - 0.03; q.r += 0.06; x.fillStyle = `rgba(235,238,245,${Math.max(0, q.v * 0.8)})`; }
      else { q.vy += 0.12; x.fillStyle = q.c; x.globalAlpha = Math.max(0, Math.min(1, q.v * 1.5)); }
      x.beginPath(); x.arc(q.x, q.y, q.humo ? q.r : Math.min(1.6, q.r * 0.5), 0, Math.PI * 2); x.fill(); x.globalAlpha = 1;
    }
    particulas = particulas.filter(q => q.v > 0);
    if (particulas.length > 400) particulas.splice(0, particulas.length - 400);
    // los tiros de escopeta (una raya que se apaga) y el bate (un arco)
    for (const q of trazos) {
      q.v -= 0.08;
      x.strokeStyle = `rgba(255,240,180,${Math.max(0, q.v)})`; x.lineWidth = 1;
      x.beginPath();
      if (q.bate) x.arc(q.x0, q.y0, 9, q.dir > 0 ? -1.4 : Math.PI - 0.6, q.dir > 0 ? 0.6 : Math.PI + 1.4);
      else { x.moveTo(q.x0, q.y0); x.lineTo(q.x1, q.y1); }
      x.stroke();
    }
    trazos = trazos.filter(q => q.v > 0);
    // nombres y vida arriba de cada una: dos cartelitos negros con borde, en el color del equipo (como en el juego
    // clasico: el nombre arriba y la vida abajo)
    x.font = 'bold 7px system-ui, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    const cartel = (cx, cy, txt, col) => {
      const w = Math.ceil(x.measureText(txt).width) + 6;
      x.fillStyle = 'rgba(0,0,0,0.85)'; x.fillRect(cx - w / 2, cy - 5, w, 10);
      x.strokeStyle = 'rgba(190,190,190,0.85)'; x.lineWidth = 0.5; x.strokeRect(cx - w / 2, cy - 5, w, 10);
      x.fillStyle = col; x.fillText(txt, cx, cy + 0.5);
    };
    for (const s of J.serps) {
      if (s.estado === 'muerta') continue;
      const col = jug[s.eq].color;
      cartel(s.x, s.y - 33, nombreDe(s), col); cartel(s.x, s.y - 21, String(Math.max(0, s.vida)), col);
    }
    x.textBaseline = 'alphabetic';
    // colgada: el arma en la mano en un cuadradito al lado (lo que suelta con Enter), como en el juego clasico
    if (s0 && s0.soga && s0.estado !== 'muerta') {
      if (!iconoMano || iconoMano.a !== arma) { iconoMano = document.createElement('canvas'); iconoMano.width = iconoMano.height = 48; iconoMano.a = arma; icono(iconoMano, arma); }
      const bx = s0.x - s0.dir * 20 - 7, by = s0.y - 30;
      x.fillStyle = 'rgba(0,0,0,0.85)'; x.fillRect(bx, by, 14, 14); x.strokeStyle = 'rgba(190,190,190,0.85)'; x.lineWidth = 0.5; x.strokeRect(bx, by, 14, 14);
      x.drawImage(iconoMano, bx + 1, by + 1, 12, 12);
    }
    // la flecha: a quien le toca (baja y sube)
    if (s0 && s0.estado !== 'muerta' && (fase === 'listo' || fase === 'mover' || fase === 'retirada') && !reglas.practica) {
      const b = Math.sin(t / 160) * 3, ay = s0.y - 50 + b;
      x.fillStyle = jug[turno].color; x.strokeStyle = '#000'; x.lineWidth = 1;
      x.beginPath(); x.moveTo(s0.x - 6, ay - 8); x.lineTo(s0.x + 6, ay - 8); x.lineTo(s0.x + 6, ay - 2); x.lineTo(s0.x + 10, ay - 2); x.lineTo(s0.x, ay + 7); x.lineTo(s0.x - 10, ay - 2); x.lineTo(s0.x - 6, ay - 2); x.closePath(); x.fill(); x.stroke();
    }
    // la mira (si es tu turno y no estas colgada; en el aire despues de una soga no: la proxima sale espejada;
    // la dinamita, la mina y el ataque aereo no se apuntan)
    const sinMira = arma === 'dinamita' || arma === 'mina' || arma === 'aereo' || arma === 'puno' || arma === 'paracaidas' || !!(s0 && s0.soplete);
    if (s0 && (juegoYo() || (jug[turno] && jug[turno].cpu && cpuE && cpuE.apunta)) && !sinMira && s0.estado !== 'soga' && s0.estado !== 'muerta' && (arma !== 'soga' || (s0.sogaAng == null && !s0.sinControl)) && (fase === 'mover' || fase === 'listo')) {
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
          const dd = 8 + k * 2.6, r = 0.8 + k * 0.22, u = k / 11;
          x.fillStyle = `rgb(255,${Math.round(225 - u * 185)},${Math.round(60 - u * 40)})`;
          x.beginPath(); x.arc(s0.x + Math.cos(a) * s0.dir * dd, s0.y - 4 + Math.sin(a) * dd, r, 0, Math.PI * 2); x.fill();
        }
      }
    }
    // el puntero del ataque aereo: una flecha en el color del equipo, inclinada para el lado de donde viene
    const conPuntero = apuntaAereo() && raton.en;
    if (conPuntero) {
      const [mx, my] = alMapa(raton.x, raton.y), dd = s0.dir;
      x.save(); x.translate(mx, my); x.rotate(dd > 0 ? -0.6 : 0.6); x.scale(dd, 1);
      x.fillStyle = jug[turno].color; x.strokeStyle = '#000'; x.lineWidth = 1;
      x.beginPath(); x.moveTo(0, 0); x.lineTo(-11, -5); x.lineTo(-8, -1.6); x.lineTo(-17, -1.6); x.lineTo(-17, 1.6); x.lineTo(-8, 1.6); x.lineTo(-11, 5); x.closePath(); x.fill(); x.stroke();
      x.restore();
    }
    const cur = conPuntero ? 'none' : (cam.libre && arrastre ? 'grabbing' : '');
    if (cv.style.cursor !== cur) cv.style.cursor = cur;
    // los textos que suben (daño, +1 arma)
    for (const tx of textos) { tx.v -= 0.016; tx.y -= 0.3; x.globalAlpha = Math.max(0, Math.min(1, tx.v)); x.fillStyle = tx.col; x.font = 'bold 9px system-ui'; x.textAlign = 'center'; x.fillText(tx.s, tx.x, tx.y); }
    x.globalAlpha = 1; textos = textos.filter(z => z.v > 0);
    // el agua (cuando sube en la muerte subita, sube despacito)
    aguaVis += (J.T.agua - aguaVis) * 0.03; if (Math.abs(J.T.agua - aguaVis) < 0.2) aguaVis = J.T.agua;
    x.fillStyle = 'rgba(38,70,160,0.92)'; x.beginPath(); x.moveTo(-200, def.h + 300);
    for (let i = -200; i <= def.w + 200; i += 8) x.lineTo(i, aguaVis + Math.sin(i / 34 + t / 420) * 2.5);
    x.lineTo(def.w + 200, def.h + 300); x.closePath(); x.fill();
    hud();
  }

  // ── El HUD ──
  function hud() {
    // el reloj: blanco; gris y quieto mientras se prepara o entre turnos; rojo en los ultimos 5 segundos (en la
    // practica no hay reloj)
    const seg = Math.max(0, Math.ceil(tiempo / 50)), rl = $('reloj'), txt = reglas.practica ? '∞' : String(seg);
    if (rl.textContent !== txt) rl.textContent = txt;
    rl.classList.toggle('gris', reglas.practica || (fase !== 'mover' && fase !== 'retirada'));
    rl.classList.toggle('rojo', !reglas.practica && (fase === 'mover' || fase === 'retirada') && seg <= 5);
    // el reloj de la ronda (modo normal): minutos y segundos que quedan; despues, muerte subita
    if (reglas.ronda) {
      const q = Math.max(0, Math.ceil(ronda / 50)), rt = subita ? 'Súbita' : `${Math.floor(q / 60)}:${String(q % 60).padStart(2, '0')}`, rd = $('ronda');
      if (rd.textContent !== rt) rd.textContent = rt;
      rd.classList.toggle('rojo', subita || q <= 60);
    }
    // el viento: flechas desde el medio, rojas para la derecha y azules para la izquierda
    const vi = $('viento').firstChild, vv = (J.viento || 0) / 70;
    vi.style.left = vv < 0 ? (50 + vv * 50) + '%' : '50%'; vi.style.width = Math.abs(vv) * 50 + '%';
    vi.className = vv < 0 ? 'izq' : 'der';
    // los equipos: el nombre en un cartelito, la foto de perfil de CV Chat (o el color) y la barra con la vida de
    // todas sus serpientes (se arman una vez y despues solo se actualizan)
    const eqs = $('equipos');
    if (eqN !== jug.length) {
      eqs.textContent = '';
      for (const j of jug) {
        const r = div('eq'), n = h('span', j.nombre), b = document.createElement('span'), ii = document.createElement('i');
        n.className = 'nom'; n.style.color = j.color; b.className = 'barra'; ii.style.background = j.color;
        let f;
        if (j.avatar) {
          f = document.createElement('img'); f.className = 'band foto'; f.alt = ''; f.src = j.avatar; f.style.borderColor = j.color;
          f.addEventListener('error', () => { const q = document.createElement('span'); q.className = 'band'; q.style.backgroundColor = j.color; f.replaceWith(q); });
        } else { f = document.createElement('span'); f.className = 'band'; f.style.backgroundColor = j.color; }
        b.appendChild(ii); r.append(n, f, b); eqs.appendChild(r);
      }
      eqN = jug.length;
    }
    // ordenados por la vida que les queda (como en el juego clasico)
    const tope = Math.max(1, ...jug.map(j => j.n * reglas.vida));
    const orden = jug.map((j, i) => i).sort((a, b) => vidaEquipo(jug[b]) - vidaEquipo(jug[a]) || a - b);
    jug.forEach((j, i) => {
      const r = eqs.children[i]; if (!r) return;
      r.classList.toggle('turno', i === turno && !reglas.practica); r.classList.toggle('muerta', !vivo(i));
      const o = String(orden.indexOf(i)); if (r.style.order !== o) r.style.order = o;
      const w = Math.min(100, vidaEquipo(j) / (reglas.practica ? j.n * reglas.vida : tope) * 100) + '%', ii = r.lastChild.firstChild;
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
  function pantalla(c) { const m = $('menu'); m.hidden = false; m.textContent = ''; m.appendChild(c); fase = 'menu'; $('hud').hidden = true; $('armas').hidden = true; $('tactil').hidden = true; $('practica').hidden = true; }

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
    practica(g) {
      paisaje(g, '#2f8f7a', '#a6e3d0', '#5fbf4a');
      serpienteEn(g, 96, 96, 4, 1);
      // un blanco de tiro
      for (const [r, c] of [[34, '#fff'], [27, '#d4302a'], [20, '#fff'], [13, '#d4302a'], [6, '#fff']]) { g.fillStyle = c; g.beginPath(); g.arc(232, 86, r, 0, Math.PI * 2); g.fill(); }
      g.strokeStyle = '#5a3a1a'; g.lineWidth = 5; g.beginPath(); g.moveTo(232, 120); g.lineTo(232, 150); g.stroke();
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
    ['R · F1 a F6', 'soga · bazuca · granadas · escopeta · puñetazo y bate · dinamita y mina · ataque aéreo (otra vez la misma tecla: la siguiente de la fila; el soplete está en la fila de la soga)'],
    ['Soplete', 'Espacio en el piso: cava un túnel 5 segundos; ↑ ↓ cambian el ángulo mientras cava'],
    ['Paracaídas', 'en el aire (saltando o al caer), Espacio lo abre y lo cierra: cae despacio y lo lleva el viento'],
    ['Q / E', 'arma anterior / siguiente'],
    ['1 a 5 · B', 'mecha de las granadas (segundos) · rebote mínimo o máximo'],
    ['Clic y arrastrar', 'mover la cámara · con el ataque aéreo, clic donde tiene que caer'],
    ['+ −', 'acercar / alejar'],
    ['N', 'en la práctica, empezar de nuevo'],
  ];
  function menuAyuda() {
    const c = caja(); c.append(h('h1', 'Cómo se juega'));
    c.append(h('h2', 'Shopper'), p('Solo la soga para moverse. Cae una caja por turno y para atacar primero hay que agarrar una. Se ataca desde la soga (Enter). El último que queda gana.'));
    c.append(h('h2', 'Normal'), p('Equipos de 4 serpientes con 100 de vida en una isla al azar que se rompe con las explosiones. Hay minas, barriles que prenden fuego y cajas de armas y de vida. Se ataca una vez por turno y el daño propio corta el turno. A los 20 minutos, muerte súbita: el agua sube en cada turno. Gana el último equipo que queda.'));
    c.append(h('h2', 'Práctica'), p('Solo, sin reloj, con todas las armas y muñecos que vuelven a aparecer. Las cajas que caen sirven para practicar la soga.'));
    c.append(h('h2', 'Teclas'));
    const t = document.createElement('table'); t.className = 'teclas';
    for (const [k, v] of TECLAS_AYUDA) { const r = t.insertRow(); r.insertCell().textContent = k; r.insertCell().textContent = v; }
    c.append(t);
    const acc = div('acc'); acc.append(boton('Volver', 'primario', menuPrincipal)); c.append(acc);
    pantalla(c);
  }

  function menuPrincipal() {
    online = null; practica = null;
    const c = caja();
    const logo = h('h1', 'SHOPPA'); logo.className = 'logo';
    const sub = p('Serpientes, sogas y cajas.'); sub.className = 'sub';
    const sock = socketDelChat();
    const t = div('tiles');
    t.append(
      tarjeta('Jugar online', 'Partidas con la gente de CV Chat, de 2 a 5 jugadores: Shopper o normal.', DIBUJOS.online, () => (sock ? menuOnline() : aviso('Abrí Shoppa desde la sección Juegos de CV Chat para jugar online'))),
      tarjeta('En esta compu', 'De 2 a 4 jugadores pasándose el teclado, o contra la máquina.', DIBUJOS.local, () => menuLocal()),
      tarjeta('Práctica', 'Solo, sin reloj y con todas las armas.', DIBUJOS.practica, () => menuPractica()),
      tarjeta('Cómo se juega', 'Las reglas y las teclas.', DIBUJOS.ayuda, () => menuAyuda()),
    );
    c.append(logo, sub, t, pista('Elegí cómo jugar.'));
    pantalla(c);
  }

  // elegir el modo (Shopper o normal): dos botones, el elegido resaltado
  function selectorModo(actual, fn) {
    const f = div('acc modos');
    for (const [id, txt] of [['shopper', 'Shopper'], ['normal', 'Normal']]) {
      const b = boton(txt, id === actual ? 'primario elegido' : '', () => fn(id)); b.setAttribute('aria-pressed', String(id === actual)); f.appendChild(b);
    }
    return f;
  }
  const DESC_MODO = {
    shopper: 'Shopper: solo la soga, una caja por turno y se ataca después de agarrar una.',
    normal: 'Normal: equipos de 4 en una isla que se rompe, con todas las armas, minas y barriles.',
  };
  let nivelCPU = 'normal';
  const NOMBRE_NIVEL = { facil: 'Fácil', normal: 'Normal', dificil: 'Difícil' };
  function menuLocal(modo) {
    modo = modo === 'normal' ? 'normal' : 'shopper';
    const c = caja(); c.append(h('h1', 'En esta compu'));
    c.append(selectorModo(modo, menuLocal), p(DESC_MODO[modo]));
    const jugar = (equipos) => { online = null; practica = null; nuevaPartida(equipos, (Math.random() * 1e9) | 0, 0, modo); empezarTurno(); };
    c.append(h('h2', 'Entre amigos'), p('Se pasan el teclado: cada uno juega su turno.'));
    const acc = div('acc');
    for (const n of [2, 3, 4]) acc.appendChild(boton(n + ' jugadores', n === 2 ? 'primario' : '', () => jugar(Array.from({ length: n }, (_, i) => ({ nombre: 'Jugador ' + (i + 1) })))));
    c.appendChild(acc);
    if (IA) {
      c.append(h('h2', 'Contra la máquina'));
      const niv = div('acc modos');
      for (const n of ['facil', 'normal', 'dificil']) { const b = boton(NOMBRE_NIVEL[n], n === nivelCPU ? 'primario elegido' : '', () => { nivelCPU = n; menuLocal(modo); }); b.setAttribute('aria-pressed', String(n === nivelCPU)); niv.appendChild(b); }
      const acc2 = div('acc');
      for (const n of [1, 2, 3]) acc2.appendChild(boton(n === 1 ? 'Vos contra 1' : 'Vos contra ' + n, n === 1 ? 'primario' : '', () => jugar([{ nombre: 'Vos' }].concat(Array.from({ length: n }, (_, i) => ({ nombre: 'Máquina ' + (i + 1), cpu: nivelCPU }))))));
      c.append(niv, acc2);
    }
    const vol = div('acc'); vol.appendChild(boton('Volver', '', menuPrincipal)); c.appendChild(vol);
    pantalla(c);
  }
  function menuPractica() {
    const c = caja(); c.append(h('h1', 'Práctica'), p('Solo, sin reloj, con todas las armas y tres muñecos. N (o el botón Reiniciar) empieza de nuevo.'));
    const acc = div('acc');
    acc.append(
      boton('Fábrica (Shopper)', 'primario', () => empezarPractica('fabrica')),
      boton('Isla al azar (normal)', 'primario', () => empezarPractica('isla')),
      boton('Volver', '', menuPrincipal),
    );
    c.appendChild(acc); pantalla(c);
  }

  // ── Online (con el socket de CV Chat: el juego va adentro de la seccion Juegos) ──
  function socketDelChat() { try { return window.parent && window.parent !== window && window.parent.app && window.parent.app.socket; } catch { return null; } }
  const emitir = (ev, d) => new Promise((ok) => { const s = socketDelChat(); if (!s) return ok({ error: 'sin conexión' }); s.emit(ev, d || {}, (r) => ok(r || {})); setTimeout(() => ok({ error: 'No respondió el servidor.' }), 8000); });
  let escuchando = false, salaId = null;
  const nombreModo = (m) => (m === 'normal' ? 'Normal' : 'Shopper');

  async function menuOnline() {
    escuchar();
    const r = await emitir('shoppa:inicio');
    const c = caja(); c.append(h('h1', 'Online'));
    if (r.error) { c.append(p(r.error)); c.append(boton('Volver', '', menuPrincipal)); return pantalla(c); }
    const acc = div('acc');
    const crear = (modo) => async () => { const x2 = await emitir('shoppa:crear', { modo }); if (x2.error) return aviso(x2.error); verSala(x2.id); };
    acc.append(boton('Crear sala Shopper', 'primario', crear('shopper')), boton('Crear sala Normal', 'primario', crear('normal')), boton('Volver', '', menuPrincipal));
    c.appendChild(acc);
    if (r.mias && r.mias.length) { c.append(h('h2', 'Tus salas')); for (const m of r.mias) c.append(filaSala((m.estado === 'jugando' ? 'Partida en juego' : m.estado === 'terminada' ? 'Terminada' : 'Esperando') + ' · ' + nombreModo(m.modo), m.jugadores + ' jugadores', 'Entrar', () => verSala(m.id))); }
    c.append(h('h2', 'Salas esperando gente'));
    if (!r.abiertas || !r.abiertas.length) c.append(p('No hay salas abiertas. ¡Creá una!'));
    else for (const a of r.abiertas) c.append(filaSala('Sala de ' + a.creador.nombre + ' · ' + nombreModo(a.modo), a.jugadores + ' jugadores', 'Entrar', async () => { const x2 = await emitir('shoppa:unirse', { id: a.id }); if (x2.error) return aviso(x2.error); verSala(a.id); }));
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
      if (!J || !online || online.id !== s.id) {
        arrancarOnline(s);
        if (Array.isArray(s.cr)) aplicarCrateres({ cr: s.cr });
        if (s.snapshot) {
          aplicar(s.snapshot); turno = s.turno;
          if (s.snapshot.fase === 'pasando' || s.snapshot.turno !== s.turno) empezarTurno(s.viento);
          else {
            fase = s.snapshot.fase;
            crTurno = Number.isInteger(s.snapshot.cr0) ? Math.min(s.snapshot.cr0, J.crateres.length) : J.crateres.length;
            const q = jug[turno]; if (q && (q.cual < 0 || !q.serps[q.cual])) { const i = q.serps.findIndex(o => o.estado !== 'muerta'); q.cual = i < 0 ? 0 : i; }
            const a = actual(); vidaAntes = a ? a.vida : 0;
          }
        }
        else empezarTurno(s.viento);
      }
      return;
    }
    if (s.estado === 'terminada' && J && online && online.id === s.id && fase !== 'fin') return fin(s.ganador);
    if (s.estado === 'terminada' && fase === 'fin') return;
    const c = caja(); c.append(h('h1', 'Sala · ' + nombreModo(s.modo)), p(DESC_MODO[s.modo === 'normal' ? 'normal' : 'shopper']), p('De 2 a 5 jugadores. Cuando todos estén listos, el que creó la sala la empieza.'));
    for (const j of s.jugadores) { const f = div('fila'); const pt = div('punto'); pt.style.background = j.conectado ? '#62d26f' : '#666'; const n = div('n'); n.textContent = j.nombre + (j.yo ? ' (vos)' : '') + (j.creador ? ' · creó la sala' : ''); f.append(pt, n, h('span', j.listo ? '✔ listo' : '…')); c.appendChild(f); }
    const acc = div('acc');
    if (s.estado === 'esperando') {
      acc.append(boton(s.listo ? 'No estoy listo' : 'Estoy listo', s.listo ? '' : 'primario', () => emitir('shoppa:listo', { id: s.id, listo: !s.listo })));
      if (s.soyCreador) { const b = boton('Empezar', 'primario', async () => { const r = await emitir('shoppa:empezar', { id: s.id }); if (r.error) aviso(r.error); }); b.disabled = !s.todosListos; acc.append(b); }
    }
    acc.append(boton('Salir de la sala', '', () => salirOnline()));
    c.appendChild(acc); pantalla(c);
  }
  const equiposDe = (lista) => lista.map(j => ({ nombre: j.nombre, avatar: j.avatar }));
  function arrancarOnline(s) {
    online = { socket: socketDelChat(), id: s.id, miSeat: s.miSeat }; practica = null;
    nuevaPartida(equiposDe(s.jugadores), s.semilla || 1, s.turno || 0, s.modo);
    turno = s.turno || 0;
  }
  async function salirOnline() {
    if (salaId) await emitir('shoppa:abandonar', { id: salaId });
    salaId = null; online = null; J = null; menuOnline();
  }
  const oyentes = [];
  addEventListener('pagehide', () => {
    for (const [so, ev, fn] of oyentes.splice(0)) { try { so.off(ev, fn); } catch { /* el chat ya no esta */ } }
    escuchando = false; online = null; J = null;
  });
  function escuchar() {
    if (escuchando) return; const s = socketDelChat(); if (!s) return; escuchando = true;
    const on = (ev, fn) => { s.on(ev, fn); oyentes.push([s, ev, fn]); };
    on('shoppa:estado', (v) => {
      if (!v || v.id !== salaId) return;
      if (!J && v.estado === 'jugando') verSala(v.id);
      else if (!J || v.estado !== 'jugando') mostrarSala(v);
    });
    on('shoppa:turno', (d) => {
      if (!d || d.id !== salaId) return;
      if (!J || !online || online.id !== d.id) { online = { socket: s, id: d.id, miSeat: d.miSeat }; practica = null; nuevaPartida(equiposDe(d.jugadores), d.semilla || 1, d.turno, d.modo); }
      if (Array.isArray(d.cr) && !d.inicio) sincronizarCrateres(d.cr);
      if (d.snapshot && !d.inicio) aplicar(d.snapshot);
      turno = d.turno; online.miSeat = d.miSeat;
      empezarTurno(d.viento);
    });
    on('shoppa:snapshot', (d) => { if (d && online && d.id === online.id && !simulaYo()) aplicar(d.snapshot); });
    on('shoppa:fin', (d) => { if (d && online && d.id === online.id) { if (d.snapshot) aplicar(d.snapshot); fin(d.ganador); } });
    on('shoppa:revancha', (d) => { if (d && online && d.de === online.id) { salaId = d.id; online = null; J = null; } });
  }

  // ── Arranque: ?mesa=id entra directo a esa sala ──
  const mesa = new URLSearchParams(location.search).get('mesa');
  if (mesa && /^[a-f0-9]{6,20}$/.test(mesa) && socketDelChat()) { escuchar(); verSala(mesa); } else menuPrincipal();
})();
