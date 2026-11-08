// Shoppa: el motor (fisica y reglas basicas). Corre igual en el navegador y en el servidor: 50 pasos por
// segundo, unidades en pixeles por paso. Sin dibujo: lo dibuja juego.js.
//
// La fisica imita el "sentir" de los juegos de artilleria de los 90 con soga (medidas de la documentacion
// de la comunidad): gravedad ~0.24 px/paso², caminar 1 px/paso, subir escalones de hasta 8 px, saltos
// con Enter (adelante / doble: atras) y Retroceso (arriba / doble: mortal), caida que lastima desde 8 px/paso,
// y la soga: tira pero se afloja, se enrolla en las esquinas y se acorta y se alarga. La forma de moverse
// chocando (de a 1 pixel, subiendo o bajando 1 pixel contra las paredes) y la soga salen de Proyecto Gusanos,
// el juego del dueño; las medidas, de la wiki de la comunidad y de partidas filmadas analizadas cuadro a cuadro.
(function (raiz) {
  'use strict';

  // ── Las medidas (se pueden ajustar desde la pagina de prueba) ──
  const C = {
    GRAV: 15728 / 65536,      // gravedad, px/paso²
    VMAX: 32,                 // velocidad maxima en el aire (por eje)
    // caminar: el patron de avance por paso (medido cuadro por cuadro: ~27 px por segundo), escalado
    CAMINAR: 1, PATRON: [0.5, 0, 0.5, 0.5, 0.5, 0.5, 1.5, 1.75, 1.5, 1.25, 0.25, 0, 0.25, 0.25, 0.25, 0, 0, 0],
    SUBE: 14, BAJA: 13,       // escalon que sube caminando / que baja sin caerse
    SALTO_ADELANTE: [2.25, -3.897], SALTO_ATRAS: [0.7814, -4.4316], SALTO_ARRIBA: [0, -4.5], MORTAL: [0.42413, -5.98799],
    DOBLE: 9, DOBLE_MINI: 12, // pasos de espera para las combinaciones (0,18 s; el mortal chico, 0,24 s)
    REBOTE: 0.6,              // al chocar volando contra una pared (como en Proyecto Gusanos)
    ROCE: 0.96,               // deslizando por el piso (pierde 4% por paso)
    CAIDA_DESDE: 8, CAIDA_COEF: 50, // daño por caida: ((v - 8) * coef + 18) / 18
    // al apuntar: 1/256 de vuelta por paso (70 grados por segundo). Medido en una partida filmada: 69-78 grados/s
    // en 6 tramos limpios (antes 0.049, el doble de rapido)
    MIRA: 2 * Math.PI / 256,
    // la soga (5 estrellas: 462 px y tiros ilimitados). Una soga de un solo lado: tira pero se afloja
    // (medido en partidas filmadas). Acortar y alargar: ~4 px por paso (medido: 200-225 px/s)
    // Medido cuadro por cuadro en una partida de Shopper filmada a 60 cuadros, con la camara quieta y escala 1:1
    // (la soga llega justo a 462): el gancho vuela 20 px por paso y acortar y alargar son 4 px por paso (confirmado
    // en el tutorial). El rozamiento y el empujon, abajo: los midio mejor el tutorial (balanceos largos, camara quieta).
    SOGA_LARGO: 462, SOGA_MIN: 14, SOGA_VEL: 20,
    SOGA_ACORTA: 4.0, SOGA_ALARGA: 4.0,
    // Medido en el tutorial (balanceos largos sin teclas, 4 de 4 dan lo mismo, error ~1,5 px): colgada pierde 1,5%
    // de la velocidad por paso (un balanceo sin tocar nada se va frenando y se queda quieto). Y con izquierda o
    // derecha apretada, quieta, se queda colgando a 18,3 grados: el empujon horizontal es 0.24 * tan(18,3) = 0.08
    // (antes: 0.19 sin rozamiento, medido en otra partida)
    SOGA_EMPUJE: 0.08,        // el balanceo: empujon horizontal
    SOGA_ROCE: 0.985,         // lo que queda de la velocidad en cada paso colgada
    SOGA_VMAX: 16,            // tope de velocidad colgado (el valor por defecto del juego clasico: 16 px/paso)
    // al chocar colgado contra el terreno (paredes y techo: asi sale el "spike"). Medido en 28 rebotes del tutorial
    // de "power roping": sin flechas conserva ~0,4 de la velocidad; con izquierda o derecha apretada, ~1
    SOGA_REBOTE: 0.4, SOGA_REBOTE_TECLA: 1.0,
    // el giro en el aire despues de soltar la soga ("rope roll"): enrollada, rueda 1/16 de radian por cada pixel
    // que avanza en horizontal (medido en 14 vuelos: 3,58 grados por pixel)
    RUEDA: 1 / 16,
    // Volver a tirarla en el aire (medido cuadro por cuadro en un tutorial con las teclas en pantalla, 28 tiros):
    // sale espejada respecto de la vertical, para el lado en que colgaba la serpiente del enganche anterior y con el
    // mismo angulo, hasta un maximo de ~36 grados de la vertical (colgando mas acostada, o por encima del enganche,
    // sale a ese maximo). El gancho vuela pegado a la serpiente (si cae, la soga sigue saliendo desde ella)
    SOGA_ANG_MAX: 36.4 * Math.PI / 180,
    // la granada de prueba
    GRANADA_V: 12, CARGA: 50, GRANADA_REBOTE_X: 0.96, GRANADA_REBOTE_Y: 0.6,
    EXPLOSION_R: 48, EXPLOSION_DANO: 50, EXPLOSION_EMPUJE: 7,
    ROMPE: false,             // en Shopper el terreno no se rompe (opcion)
  };

  // ── El terreno: una mascara de 1 byte por pixel (1 = macizo) ──
  function Terreno(w, h, agua) {
    this.w = w; this.h = h; this.agua = agua;
    this.m = new Uint8Array(w * h);
  }
  Terreno.prototype.solido = function (x, y) {
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0 || x >= this.w || y < 0 || y >= this.h) return false;
    return this.m[y * this.w + x] === 1;
  };
  // borra un circulo (explosion); devuelve los pixeles borrados para el dibujo
  Terreno.prototype.borrar = function (cx, cy, r) {
    const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(this.w - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(this.h - 1, Math.ceil(cy + r));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      if (dx * dx + dy * dy <= r * r) this.m[y * this.w + x] = 0;
    }
  };
  // ¿la linea de a a b no pasa por terreno? (salta el primer tramo, donde esta apoyado el gancho)
  Terreno.prototype.libre = function (ax, ay, bx, by, saltar) {
    const dx = bx - ax, dy = by - ay, n = Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)));
    for (let i = (saltar || 0); i < n; i++) {
      const t = i / n;
      if (this.solido(ax + dx * t, ay + dy * t)) return false;
    }
    return true;
  };

  // ── La serpiente: su forma de choque (9 de ancho por 16 de alto: 7, 9, 7 y 5 pixeles por fila) ──
  const ANCHOS = [7, 7, 7, 7, 9, 9, 9, 9, 9, 9, 7, 7, 7, 5, 5, 5];
  const CAJA = [];
  ANCHOS.forEach((a, fila) => {
    const y = fila - 8, m = (a - 1) / 2;
    // el borde (alcanza con el contorno: el terreno no entra de a un pixel)
    if (fila === 0 || fila === 15 || ANCHOS[fila - 1] !== a || ANCHOS[fila + 1] !== a) for (let x = -m; x <= m; x++) CAJA.push([x, y]);
    else CAJA.push([-m, y], [m, y]);
  });
  function choca(T, x, y) {
    for (const p of CAJA) if (T.solido(x + p[0], y + p[1])) return true;
    return false;
  }
  const apoyada = (T, x, y) => choca(T, x, y + 1);

  function Serpiente(x, y) {
    this.x = x; this.y = y; this.vx = 0; this.vy = 0;
    this.estado = 'aire';     // suelo | aire | desliza | soga | muerta
    this.dir = 1;             // para donde mira
    this.mira = -0.5;         // angulo de la mira (0 = horizontal, negativo = arriba)
    this.vida = 200;
    this.soga = null;         // { piv: [{x,y,s}], L, fijo }
    this.gancho = null;       // el gancho volando: { x, y, dx, dy, d } (d: cuanto salio desde la serpiente)
    this.sogaAng = null;      // en el aire despues de una soga: el angulo al que colgaba (0 = derecho abajo del enganche,
                              // positivo = a la derecha). La proxima soga sale espejada. En el piso se olvida
    this.sinControl = false;  // se golpeo la cabeza despues de soltar la soga: no puede volver a tirarla hasta el piso
    this.salto = null;        // { tecla, t } esperando el doble toque
    this.caida = 0;           // el ultimo daño por caida (para mostrarlo)
    this.cola = [];           // por donde paso (para dibujar el cuerpo)
  }

  // ── Un paso de fisica de la serpiente. e: lo que se aprieta { izq, der, arr, aba, enter, retro, soga } ──
  // (enter/retro/soga son "recien apretado")
  function paso(J, s, e) {
    const T = J.T;
    if (s.estado === 'muerta') return;
    // la mira: solo parada en el piso (en el aire el juego clasico no la mueve; colgada, arriba/abajo es el largo)
    if (s.estado === 'suelo') {
      if (e.arr) s.mira = Math.max(-Math.PI / 2, s.mira - C.MIRA);
      if (e.aba) s.mira = Math.min(Math.PI / 2, s.mira + C.MIRA);
    }
    // la soga: tirarla (o soltarla si ya esta colgada; al soltarla se acuerda del angulo al que colgaba)
    if (e.paracaidas && s.estado === 'aire' && !s.soga) s.paracaidas = !s.paracaidas;
    if (e.soga && !s.soplete && !s.puno) {
      if (s.estado === 'soga') { s.estado = 'aire'; s.soga = null; }
      else if (!s.gancho && !s.sinControl) tirarGancho(s);
    }

    // el soplete y el puñetazo manejan a la serpiente mientras duran
    if (s.soplete) pasoSoplete(J, s, e);
    else if (s.puno) pasoPuno(J, s);
    else if (s.estado === 'suelo') pasoSuelo(J, s, e);
    else if (s.estado === 'desliza') pasoDesliza(J, s);
    else if (s.estado === 'aire') pasoAire(J, s);
    else if (s.estado === 'soga') pasoSoga(J, s, e);
    // el gancho sale desde donde quedo la serpiente en este paso (asi la acompaña aunque caiga)
    if (s.gancho) volarGancho(J, s);

    // el agua
    if (s.y - 4 > T.agua) { s.estado = 'muerta'; s.vida = 0; s.soga = null; s.gancho = null; s.soplete = null; s.puno = null; }
    // la cola, para el dibujo
    const u = s.cola[0];
    if (!u || Math.abs(u[0] - s.x) + Math.abs(u[1] - s.y) >= 1.2) { s.cola.unshift([s.x, s.y]); if (s.cola.length > 40) s.cola.pop(); }
  }

  function saltar(s, v, atras) {
    const d = atras ? -s.dir : s.dir;
    s.vx = v[0] * d; s.vy = v[1]; s.estado = 'aire';
    // (para el dibujo y para la mira: los saltos para atras no se dan vuelta, y el mortal gira una vuelta)
    s.atras = !!atras; s.giro = v === C.MORTAL ? 1 : 0; s.aireT = 0;
  }

  function pasoSuelo(J, s, e) {
    const T = J.T;
    // los saltos, con las combinaciones del juego clasico (el primer toque espera un poquito por si viene otro):
    //   Enter: adelante · Enter Enter: atras · Retroceso: arriba · Retroceso Retroceso: mortal
    //   Retroceso Enter: atras · Retroceso Retroceso Enter: mortal chico (como el salto atras)
    if (s.salto) {
      const q = s.salto.seq;
      s.salto.t--;
      if (e.enter) { s.salto = null; return saltar(s, C.SALTO_ATRAS, true); } // E E, R E y R R E
      if (e.retro && q === 'r') { s.salto = { seq: 'rr', t: C.DOBLE_MINI - C.DOBLE }; }
      else if (s.salto.t <= 0) {
        s.salto = null;
        if (q === 'e') return saltar(s, C.SALTO_ADELANTE, false);
        if (q === 'r') return saltar(s, C.SALTO_ARRIBA, false);
        return saltar(s, C.MORTAL, true); // rr
      }
    } else if (e.enter) { s.salto = { seq: 'e', t: C.DOBLE }; }
    else if (e.retro) { s.salto = { seq: 'r', t: C.DOBLE }; }
    // caminar (con Shift, sin darse vuelta)
    const d = e.izq && !e.der ? -1 : e.der && !e.izq ? 1 : 0;
    if (d && !s.salto) {
      if (s.dir !== d && !e.shift) s.dir = d;
      else caminar(T, s, d);
    }
    if (!apoyada(T, s.x, s.y)) { s.estado = 'aire'; s.vx = 0; s.vy = 0; }
  }

  function caminar(T, s, d) {
    s.fase = ((s.fase || 0) + 1) % C.PATRON.length;
    const avance = C.PATRON[s.fase] * C.CAMINAR;
    if (!avance) return;
    const nx = s.x + d * avance;
    if (!choca(T, nx, s.y)) {
      // baja (hasta BAJA px) o se cae
      for (let k = 0; k <= C.BAJA; k++) if (apoyada(T, nx, s.y + k)) { s.x = nx; s.y += k; return; }
      s.x = nx; s.estado = 'aire'; s.vx = 0; s.vy = 0; return;
    }
    for (let k = 1; k <= C.SUBE; k++) if (!choca(T, nx, s.y - k)) { s.x = nx; s.y -= k; return; }
  }

  function pasoDesliza(J, s) {
    const T = J.T;
    s.vx *= C.ROCE;
    if (Math.abs(s.vx) < 0.1) { s.vx = 0; s.estado = 'suelo'; return; }
    let resta = Math.abs(s.vx); const d = Math.sign(s.vx);
    while (resta > 0) {
      const m = Math.min(1, resta); resta -= m;
      const nx = s.x + d * m;
      if (!choca(T, nx, s.y)) {
        let ok = false;
        for (let k = 0; k <= 2; k++) if (apoyada(T, nx, s.y + k)) { s.x = nx; s.y += k; ok = true; break; }
        if (!ok) { s.x = nx; s.estado = 'aire'; s.vy = 0; return; }
      } else {
        let ok = false;
        if (!choca(T, nx, s.y - 1)) { s.x = nx; s.y -= 1; ok = true; }
        if (!ok) { s.vx = 0; s.estado = 'suelo'; return; }
      }
    }
  }

  // ── Moverse chocando (como en Proyecto Gusanos, el juego original del dueño): de a 1 pixel; contra una
  // pared, prueba subir o bajar 1 pixel y sigue (pierde un poco: 30/32), y si no puede, rebota ──
  function moverX(T, s, dx, rebote) {
    const sg = Math.sign(dx); let resto = Math.abs(dx);
    while (resto > 1e-6) {
      const p = Math.min(resto, 1) * sg; resto -= Math.min(resto, 1);
      const nx = s.x + p;
      if (!choca(T, nx, s.y)) { s.x = nx; continue; }
      if (!choca(T, nx, s.y - 1)) { s.x = nx; s.y -= 1; s.vx *= 30 / 32; continue; }
      if (!choca(T, nx, s.y + 1)) { s.x = nx; s.y += 1; s.vx *= 30 / 32; continue; }
      s.vx = -s.vx * rebote; if (Math.abs(s.vx) < 0.03) s.vx = 0;
      return false;
    }
    return true;
  }
  // devuelve 'piso' si choco contra el piso, 'techo' contra el techo, o null
  function moverY(T, s, dy) {
    const sg = Math.sign(dy); let resto = Math.abs(dy);
    while (resto > 1e-6) {
      const p = Math.min(resto, 1) * sg; resto -= Math.min(resto, 1);
      const ny = s.y + p;
      if (!choca(T, s.x, ny)) { s.y = ny; continue; }
      return sg > 0 ? 'piso' : 'techo';
    }
    return null;
  }

  function aterrizar(s, J) {
    const v = s.vy;
    if (s.sinCaida) s.sinCaida = false;
    else if (v > C.CAIDA_DESDE) {
      const dano = Math.floor(((v - C.CAIDA_DESDE + 1 / 65536) * C.CAIDA_COEF + 18) / 18);
      s.caida = dano; s.vida = Math.max(0, s.vida - dano); s.golpe = (s.golpe || 0) + dano;
      if (J) J.eventos.push({ tipo: 'dano', x: s.x, y: s.y - 14, n: dano, caida: true });
    }
    s.vy = 0; s.atras = false; s.giro = 0; s.paracaidas = false;
    // los saltos aterrizan quietos; lo que venia volando rapido (una explosion) se desliza
    s.estado = Math.abs(s.vx) > 2.5 ? 'desliza' : 'suelo';
    if (s.estado === 'suelo') s.vx = 0;
    s.tiros = Infinity; // al tocar el piso, la soga vuelve a tener todos sus tiros
    // y se olvida la anterior: la proxima se apunta con la mira. Una soga que venia saliendo se corta
    s.sogaAng = null; s.sinControl = false; s.gancho = null; s.rueda = null;
  }

  function pasoAire(J, s) {
    const T = J.T;
    s.vy = Math.min(C.VMAX, s.vy + C.GRAV);
    s.vx = Math.max(-C.VMAX, Math.min(C.VMAX, s.vx));
    // con el paracaidas abierto: cae despacio y la lleva el viento
    if (s.paracaidas) {
      const P = ARMAS.paracaidas;
      s.vy = Math.min(s.vy, P.caida); s.vx = s.vx * P.roce + (J.viento || 0) * P.viento;
    }
    // en el aire no se da vuelta (en el juego clasico sigue mirando para donde miraba, aunque vuele para el otro lado)
    s.aireT = (s.aireT || 0) + 1;
    // despues de soltar la soga va enrollada y rueda con lo que avanza
    if (Number.isFinite(s.sogaAng)) s.rueda = (s.rueda || 0) + s.vx * C.RUEDA;
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(s.vx), Math.abs(s.vy))));
    for (let i = 0; i < n && s.estado === 'aire'; i++) {
      if (s.vx) moverX(T, s, s.vx / n, C.REBOTE);
      const r = moverY(T, s, s.vy / n);
      if (r === 'piso') { aterrizar(s, J); break; }
      if (r === 'techo') {
        s.vy = 0;
        // golpearse la cabeza despues de soltar la soga: pierde el control (como en el juego clasico por defecto)
        if (Number.isFinite(s.sogaAng)) { s.sinControl = true; s.gancho = null; }
      }
    }
    if (s.estado === 'aire') s.vx *= 0.999;
  }

  // ── La soga ──
  // para donde sale la soga: desde el piso o un salto, con la mira (nunca por debajo de la horizontal; con todas
  // las estrellas, hasta 90 grados de la vertical). En el aire despues de otra soga, espejada: con el mismo angulo
  // al que colgaba, para el lado en que estaba la serpiente, hasta SOGA_ANG_MAX de la vertical
  function direccionSoga(s) {
    if (Number.isFinite(s.sogaAng)) {
      const a = Math.max(-C.SOGA_ANG_MAX, Math.min(C.SOGA_ANG_MAX, s.sogaAng));
      return [Math.sin(a), -Math.cos(a)];
    }
    let dx = Math.cos(s.mira) * s.dir, dy = Math.sin(s.mira);
    if (dy > -0.015) { dy = -0.015; const n = Math.hypot(dx, dy); dx /= n; dy /= n; }
    return [dx, dy];
  }
  function tirarGancho(s) {
    const [dx, dy] = direccionSoga(s);
    s.gancho = { x: s.x, y: s.y - 2, dx, dy, d: 0 }; s.sinCaida = false;
  }
  // el gancho sale SOGA_VEL px por paso desde la serpiente y la acompaña si se mueve (medido: aunque la serpiente
  // caiga, la soga sigue saliendo con el mismo angulo desde ella)
  function volarGancho(J, s) {
    const T = J.T, g = s.gancho, ox = s.x, oy = s.y - 2;
    for (let i = 0; i < C.SOGA_VEL; i++) {
      const nd = g.d + 1, nx = ox + g.dx * nd, ny = oy + g.dy * nd;
      if (T.solido(nx, ny)) {
        // se engancha en el ultimo pixel libre (muy cerca, no engancha)
        const hx = ox + g.dx * g.d, hy = oy + g.dy * g.d;
        const L = Math.hypot(hx - s.x, hy - s.y);
        s.gancho = null;
        if (L < 20 || !T.libre(ox, oy, hx, hy, 2)) return;
        s.soga = { piv: [{ x: hx, y: hy, s: 0 }], L: Math.max(C.SOGA_MIN, Math.min(C.SOGA_LARGO, L)), fijo: 0 };
        s.estado = 'soga'; s.salto = null; s.paracaidas = false;
        s.sogaAng = Math.atan2(s.x - hx, s.y - hy); s.rueda = null; s.giro = 0; s.atras = false;
        return;
      }
      g.d = nd; g.x = nx; g.y = ny;
      if (g.d >= C.SOGA_LARGO || g.y < -300 || g.x < -60 || g.x > T.w + 60) { s.gancho = null; return; }
    }
  }

  function pasoSoga(J, s, e) {
    const T = J.T, R = s.soga;
    const ultimo = () => R.piv[R.piv.length - 1];
    // acortar / alargar (medido en partidas: unos 4 px por paso en los dos sentidos)
    if (e.arr) acortar(T, s);
    if (e.aba) alargar(T, s);
    // el balanceo: un empujon horizontal chico para el lado que se aprieta (la soga se queda con lo que va
    // hacia afuera; abajo empuja entero y con la soga acostada casi no hace nada, como en el juego clasico).
    // No la da vuelta: colgada sigue mirando para donde miraba (medido)
    const d = (e.izq ? -1 : 0) + (e.der ? 1 : 0);
    if (d) s.vx += d * C.SOGA_EMPUJE;
    // al chocar colgada: con izquierda o derecha apretada rebota casi sin perder (medido: ~1, la "potencia" de
    // los power moves); sin apretar nada pierde mas de la mitad (~0,4)
    const reb = d ? C.SOGA_REBOTE_TECLA : C.SOGA_REBOTE;
    s.vy += C.GRAV;
    // el tope de velocidad colgada (en cualquier direccion)
    const v = Math.hypot(s.vx, s.vy);
    if (v > C.SOGA_VMAX) { s.vx *= C.SOGA_VMAX / v; s.vy *= C.SOGA_VMAX / v; }
    // moverse de a poco: chocar, enrollar en las esquinas y que la soga no se estire
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(s.vx), Math.abs(s.vy))));
    let apoyada = false;
    for (let i = 0; i < n && s.estado === 'soga'; i++) {
      const ax = s.x, ay = s.y;
      if (s.vx) moverX(T, s, s.vx / n, reb);
      const r = moverY(T, s, s.vy / n);
      if (r === 'piso') { apoyada = true; s.vy = 0; }
      // contra el techo rebota: el "spike", que despues cae casi derecho
      else if (r === 'techo') s.vy = -s.vy * reb;
      enrollar(T, s, ax, ay);
      restringir(T, s, ax, ay);
    }
    // el rozamiento de la soga
    s.vx *= C.SOGA_ROCE; s.vy *= C.SOGA_ROCE;
    // apoyada en el piso, colgada: roza como caminando
    if (apoyada) { s.vx *= C.ROCE; if (Math.abs(s.vx) < 0.05) s.vx = 0; }
    // el angulo al que cuelga del ultimo enganche (para la proxima soga, si la suelta)
    if (s.estado === 'soga') { const p = R.piv[R.piv.length - 1]; s.sogaAng = Math.atan2(s.x - p.x, s.y - p.y); }
  }

  // acortar: tira de la serpiente hacia el enganche (si no la mete en el terreno)
  function acortar(T, s) {
    const R = s.soga, p = R.piv[R.piv.length - 1];
    const nL = Math.max(R.fijo + C.SOGA_MIN, R.L - C.SOGA_ACORTA);
    const r = nL - R.fijo, dx = s.x - p.x, dy = s.y - p.y, d = Math.hypot(dx, dy) || 1;
    if (d > r) {
      const ux = dx / d, uy = dy / d, tx = p.x + ux * r, ty = p.y + uy * r;
      // el camino tiene que estar libre
      const k = Math.ceil(d - r);
      for (let i = 1; i <= k; i++) if (choca(T, s.x - ux * (d - r) * i / k, s.y - uy * (d - r) * i / k)) return;
      s.x = tx; s.y = ty;
      const vr = s.vx * ux + s.vy * uy;
      if (vr > 0) { s.vx -= vr * ux; s.vy -= vr * uy; }
    }
    R.L = nL;
  }
  // alargar: la vara empuja a la serpiente hacia afuera 4 px (si el terreno no lo impide; si lo impide, no se
  // alarga: en el juego clasico la soga sale de a 4 px y puede quedar corta del piso)
  function alargar(T, s) {
    const R = s.soga, p = R.piv[R.piv.length - 1];
    const nL = Math.min(C.SOGA_LARGO, R.L + C.SOGA_ALARGA);
    const r = nL - R.fijo, dx = s.x - p.x, dy = s.y - p.y, d = Math.hypot(dx, dy) || 1;
    if (r <= d) { R.L = nL; return; }
    const ux = dx / d, uy = dy / d, k = Math.ceil(r - d);
    for (let i = 1; i <= k; i++) if (choca(T, s.x + ux * (r - d) * i / k, s.y + uy * (r - d) * i / k)) return;
    s.x = p.x + ux * r; s.y = p.y + uy * r;
    R.L = nL;
  }

  // ¿la soga se apoya en una esquina? (el tramo del ultimo enganche a la serpiente cruza terreno)
  function enrollar(T, s, ax, ay) {
    const R = s.soga;
    // desenrollar: el tramo quedo derecho (paso al otro lado del enganche anterior)
    while (R.piv.length > 1) {
      const p = R.piv[R.piv.length - 1], q = R.piv[R.piv.length - 2];
      const lado = Math.sign((p.x - q.x) * (s.y - p.y) - (p.y - q.y) * (s.x - p.x));
      if (lado !== 0 && lado !== p.s) { R.piv.pop(); R.fijo -= Math.hypot(p.x - q.x, p.y - q.y); }
      else break;
    }
    // enrollar: busca entre donde estaba (libre) y donde esta el momento exacto en que el tramo toca
    // terreno, y engancha la soga en esa esquina (el ultimo pixel libre)
    for (let vuelta = 0; vuelta < 3; vuelta++) {
      const p = R.piv[R.piv.length - 1];
      if (T.libre(p.x, p.y, s.x, s.y, 2)) return;
      let lo = 0, hi = 1;
      for (let k = 0; k < 10; k++) {
        const m = (lo + hi) / 2;
        if (T.libre(p.x, p.y, ax + (s.x - ax) * m, ay + (s.y - ay) * m, 2)) lo = m; else hi = m;
      }
      const bx = ax + (s.x - ax) * hi, by = ay + (s.y - ay) * hi;
      const ddx = bx - p.x, ddy = by - p.y, nn = Math.ceil(Math.max(Math.abs(ddx), Math.abs(ddy)));
      let cx = null, cy = null;
      for (let k = 2; k <= nn; k++) {
        const x = p.x + ddx * k / nn, y = p.y + ddy * k / nn;
        if (T.solido(x, y)) { cx = p.x + ddx * (k - 1) / nn; cy = p.y + ddy * (k - 1) / nn; break; }
      }
      if (cx === null || Math.hypot(cx - p.x, cy - p.y) < 2) return;
      const lado = Math.sign((cx - p.x) * (s.y - cy) - (cy - p.y) * (s.x - cx)) || 1;
      R.fijo += Math.hypot(cx - p.x, cy - p.y);
      R.piv.push({ x: cx, y: cy, s: lado });
      if (R.fijo > R.L - C.SOGA_MIN) R.L = R.fijo + C.SOGA_MIN;
    }
  }

  // la soga es una vara rigida (medido en el tutorial de "power roping": con abajo apretado la serpiente se aleja
  // 4 px por paso aunque este por encima del enganche, y por encima del enganche sigue el circulo sin caerse):
  // siempre queda a la distancia exacta, del lado que este, y la velocidad gira con la soga (sin parte radial).
  // Si ese punto cae en el terreno, se desliza por el borde (busca el angulo libre mas cerca); si no hay, se queda
  // donde puede (y si el terreno la acerco, la soga queda de ese largo)
  function restringir(T, s, ax, ay) {
    const R = s.soga, p = R.piv[R.piv.length - 1], r = R.L - R.fijo;
    const dx = s.x - p.x, dy = s.y - p.y, d = Math.hypot(dx, dy) || 1;
    if (Math.abs(d - r) < 1e-6) return;
    let ux = dx / d, uy = dy / d, tx = p.x + ux * r, ty = p.y + uy * r;
    // empujarla hacia afuera contra el terreno (apoyada en el piso, por ejemplo): no se la mueve por el arco;
    // avanza hasta el ultimo punto libre y la soga queda de ese largo (asi se apoya y se queda quieta)
    if (d < r && choca(T, tx, ty)) {
      let k = 0; const n = Math.ceil(r - d);
      while (k < n && !choca(T, s.x + ux * (k + 1), s.y + uy * (k + 1))) k++;
      s.x += ux * k; s.y += uy * k;
      R.L = R.fijo + Math.max(C.SOGA_MIN, d + k);
      const vr = s.vx * ux + s.vy * uy; if (vr > 0) { s.vx -= vr * ux; s.vy -= vr * uy; }
      return;
    }
    if (choca(T, tx, ty)) {
      const base = Math.atan2(uy, ux); let libre = null;
      for (let k = 1; k <= 12 && !libre; k++) for (const sg of [-1, 1]) {
        const a = base + sg * k * 0.02, x = p.x + Math.cos(a) * r, y = p.y + Math.sin(a) * r;
        if (!choca(T, x, y)) { libre = [x, y, Math.cos(a), Math.sin(a)]; break; }
      }
      if (!libre) {
        if (d > r) { s.x = ax; s.y = ay; } else R.L = R.fijo + Math.max(C.SOGA_MIN, d);
        const vr = s.vx * ux + s.vy * uy; s.vx -= vr * ux; s.vy -= vr * uy;
        return;
      }
      [tx, ty, ux, uy] = libre;
      s.x = tx; s.y = ty;
      const vr = s.vx * ux + s.vy * uy; s.vx -= vr * ux; s.vy -= vr * uy;
      return;
    }
    // la velocidad gira con la soga: se queda la parte a lo largo del giro (medida donde estaba) y la parte
    // radial se pierde (al soltar no queda la de acortar: medido)
    const ox = ax - p.x, oy = ay - p.y, od = Math.hypot(ox, oy);
    s.x = tx; s.y = ty;
    if (od > 1e-6) {
      const u0x = ox / od, u0y = oy / od;
      const vt = s.vx * -u0y + s.vy * u0x;
      s.vx = vt * -uy; s.vy = vt * ux;
    } else {
      const vr = s.vx * ux + s.vy * uy; s.vx -= vr * ux; s.vy -= vr * uy;
    }
  }

  // ── Las armas, las cajas y lo que anda suelto por el mapa ──
  // ARMAS: v: velocidad con la carga llena; viento: cuanto la lleva el viento (por punto de viento y por paso);
  // choque: explota al tocar algo; mecha: explota a los segundos (rebota hasta entonces; seg: mecha fija, si no
  // la que se elige con 1 a 5); r: radio de la explosion; dano: daño en el centro; empuje: lo que tira en el centro;
  // hijos: lo que larga al explotar (n pedazos con velocidad hasta vh). reboteX/Y: lo que conserva al rebotar
  // (reboteMax: con el rebote al maximo)
  // Los numeros: el daño maximo de cada arma es el de su radio de explosion (bazuca y granada 50, cada bombita del
  // racimo 30, la mandarina y sus gajos 75 como la banana del juego clasico, dinamita 75, mina 50, cada misil del
  // ataque aereo 30, escopeta 25 por tiro, bate 30), sacados de la tabla de armas del juego clasico y de su esquema
  // "intermedio". El viento solo lleva a la bazuca (y al fuego). El barril tiene 50 de vida: el primer golpe lo prende
  // y se quema solo hasta explotar (asi un tiro de escopeta lo hace volar enseguida)
  const ARMAS = {
    bazooka: { nombre: 'Bazuca', v: 15, viento: 0.0008, choque: true, r: 50, dano: 50, empuje: 7 },
    granada: { nombre: 'Granada', v: 12, viento: 0, mecha: true, r: 50, dano: 50, empuje: 7, reboteX: 0.96, reboteY: 0.6, reboteMax: 0.9 },
    racimo: { nombre: 'Racimo', v: 12, viento: 0, mecha: true, r: 20, dano: 20, empuje: 4, reboteX: 0.96, reboteY: 0.6, reboteMax: 0.9, hijos: { tipo: 'racimito', n: 5, vh: 3.5 } },
    racimito: { nombre: 'Racimito', viento: 0, choque: true, r: 30, dano: 30, empuje: 5, sinDueno: true, gracia: 16 },
    mandarina: { nombre: 'Mandarina', v: 12, viento: 0, mecha: true, r: 75, dano: 75, empuje: 9, reboteX: 0.96, reboteY: 0.6, reboteMax: 0.95, hijos: { tipo: 'gajo', n: 5, vh: 6 } },
    gajo: { nombre: 'Gajo', viento: 0, choque: true, r: 75, dano: 75, empuje: 9, sinDueno: true, gracia: 16 },
    dinamita: { nombre: 'Dinamita', v: 0, viento: 0, mecha: true, seg: 5, r: 75, dano: 75, empuje: 10, reboteX: 0.3, reboteY: 0.2 },
    mina: { nombre: 'Mina', v: 0, viento: 0, r: 50, dano: 50, empuje: 7, reboteX: 0.5, reboteY: 0.3, arma: 75, cuenta: 150, radio: 28, falla: 1 / 8 },
    misil: { nombre: 'Misil', viento: 0, choque: true, r: 30, dano: 30, empuje: 5, sinDueno: true },
    escopeta: { nombre: 'Escopeta', dano: 25, r: 5, empuje: 3.2, tiros: 2, alcance: 900 },
    bate: { nombre: 'Bate', dano: 30, empuje: 9 },
    // la granadota (como la granada grande del juego clasico): mecha fija de 3 s, rebota poco, 100 de daño
    granadota: { nombre: 'Granadota', v: 12, viento: 0, mecha: true, seg: 3, r: 100, dano: 100, empuje: 12, reboteX: 0.5, reboteY: 0.3 },
    // el paracaidas: abierto, cae a lo sumo 1,3 px por paso y el viento lo corre (valores a ojo)
    paracaidas: { nombre: 'Paracaídas', caida: 1.3, roce: 0.97, viento: 0.0006 },
    // el puñetazo (el de fuego del juego clasico): sube derecho unos 60 px golpeando lo que tiene adelante: 30 de daño
    // y las manda para arriba
    puno: { nombre: 'Puñetazo', dano: 30, sube: 5, pasos: 12, empuje: [2.5, -7] },
    // el soplete (medido en un duelo de soplete filmado con la camara quieta): 5 s cavando un tunel del alto de una
    // serpiente (~20 px), avanzando 0,45 px por paso (21-23 px/s); arriba/abajo cambian el angulo mientras cava
    // (en el video, de unos 25 grados para arriba a horizontal y bajadas de ~25 grados). Quema a la que toca: 15
    soplete: { nombre: 'Soplete', dura: 250, vel: 0.45, r: 10, cada: 5, adelante: 6, angMax: Math.PI / 4, dano: 15, empuje: 2.5 },
    aereo: { nombre: 'Ataque aéreo', n: 5, sep: 22, vx: 5, vy: 2 },
    barril: { nombre: 'Barril', r: 75, dano: 75, empuje: 9, vida: 50, quema: 0.5, llamas: 20 },
    llama: { dura: [150, 300], dano: 2, cada: 10, radio: 7 },
    muerte: { r: 24, dano: 10, empuje: 3 },  // la que explota al quedarse sin vida
    caja: { r: 40, dano: 30, empuje: 6 },    // una caja que revienta (modo normal)
  };
  // las cosas que no son proyectiles: se mueven como piedras (rebotan poco y se quedan quietas)
  const SUELTAS = { lapida: { reboteX: 0.3, reboteY: 0.15 }, mina: ARMAS.mina, barril: { reboteX: 0.3, reboteY: 0.15 } };

  function nueva(J, s, tipo, x, y, vx, vy) {
    const A = ARMAS[tipo] || {}, g = { tipo, x, y, vx, vy, de: J.serps.indexOf(s) };
    g.t = A.seg ? A.seg * 50 : (J.mecha || 3) * 50;
    if (A.reboteMax && J.rebote === 'max') g.max = true;
    if (tipo === 'mina') { g.arma = A.arma; g.cuenta = null; g.quieta = false; g.falla = Math.random() < A.falla; }
    return g;
  }
  // tirar con carga (0 a 1), para donde apunta
  function lanzar(J, s, carga, tipo) {
    const A = ARMAS[tipo || 'granada'], v = A.v * Math.max(0.1, carga), a = s.mira;
    J.cosas.push(nueva(J, s, tipo || 'granada', s.x + s.dir * 6, s.y - 4, Math.cos(a) * s.dir * v, Math.sin(a) * v));
  }
  // soltarla desde la soga (o en el aire): sale con la velocidad de la serpiente
  function soltar(J, s, tipo) {
    J.cosas.push(nueva(J, s, tipo, s.x, s.y + 4, s.vx, s.vy));
  }
  // dejarla en el piso, adelante (la dinamita y la mina)
  function poner(J, s, tipo) {
    let px = s.x + s.dir * 7, py = s.y + 2;
    if (J.T.solido(px, py)) { px = s.x; py = s.y; }
    J.cosas.push(nueva(J, s, tipo, px, py, s.dir * 0.5, -1));
  }
  // una caja que cae del cielo en el punto x (y se apoya en lo primero que encuentra)
  function caja(J, x, y, n) { J.cosas.push({ tipo: 'caja', x, y, vx: 0, vy: 0, n }); }

  function danar(J, s, n) {
    s.vida = Math.max(0, s.vida - n); s.golpe = (s.golpe || 0) + n;
    J.eventos.push({ tipo: 'dano', x: s.x, y: s.y - 14, n });
  }
  // un golpe la saca volando (de la soga tambien) y pierde el control hasta tocar el piso, como en el juego clasico
  function golpear(s, vx, vy) {
    s.soga = null; s.gancho = null; s.estado = 'aire'; s.sinCaida = true; s.salto = null; s.sinControl = true;
    s.soplete = null; s.puno = null; s.paracaidas = false;
    s.vx += vx; s.vy += vy;
  }
  // un hueco en el terreno (las explosiones, con el terreno que se rompe). Redondeado: asi el mismo hueco da lo mismo
  // en todas las compus (la lista viaja en la foto)
  function crater(J, cx, cy, r) {
    cx = Math.round(cx); cy = Math.round(cy); r = Math.round(r);
    if (r < 1) return;
    J.T.borrar(cx, cy, r);
    J.crateres.push([cx, cy, r]); J.borrados.push([cx, cy, r]);
  }

  function pasoCosas(J) {
    const T = J.T;
    for (const g of J.cosas) {
      if (g.fin) continue;
      if (g.tipo === 'caja') {
        // cae con paracaidas (lento) hasta apoyarse (si se rompe el piso, vuelve a caer)
        if (g.quieta) {
          if (g.y > T.agua) { g.fin = true; continue; }
          if (!(J.rompe || C.ROMPE) || T.solido(g.x, g.y + 8) || T.solido(g.x - 6, g.y + 8) || T.solido(g.x + 6, g.y + 8)) continue;
          g.quieta = false;
        }
        g.vy = Math.min(2, g.vy + C.GRAV);
        for (let k = 0; k < Math.ceil(g.vy); k++) { if (T.solido(g.x, g.y + 8) || T.solido(g.x - 6, g.y + 8) || T.solido(g.x + 6, g.y + 8)) { g.quieta = true; g.vy = 0; break; } g.y += g.vy / Math.ceil(g.vy); }
        if (g.y > T.agua) g.fin = true;
        continue;
      }
      if (g.tipo === 'llama') { pasoLlama(J, g); continue; }
      if (SUELTAS[g.tipo]) {
        rodar(J, g, SUELTAS[g.tipo]);
        if (g.tipo === 'mina') pasoMina(J, g);
        else if (g.tipo === 'barril' && g.prendido && !g.fin) romperBarril(J, g, ARMAS.barril.quema);
        continue;
      }
      const A = ARMAS[g.tipo];
      if (!A) { g.fin = true; continue; }
      g.vy = Math.min(C.VMAX, g.vy + C.GRAV);
      g.vx += (J.viento || 0) * (A.viento || 0);
      const n = Math.max(1, Math.ceil(Math.max(Math.abs(g.vx), Math.abs(g.vy))));
      const rx = A.reboteX, ry = g.max ? Math.max(A.reboteY, A.reboteMax) : A.reboteY, rxx = g.max ? Math.max(rx, A.reboteMax) : rx;
      for (let i = 0; i < n && !g.fin; i++) {
        const mx = g.vx / n, my = g.vy / n;
        if (A.choque) {
          // explota al tocar el terreno, una serpiente (que no sea la que la tiro, al salir) o un barril
          g.x += mx; g.y += my; g.vida = (g.vida || 0) + 1;
          const toca = J.serps.some((o, k) => o.estado !== 'muerta' && (A.sinDueno ? g.vida > (A.gracia || 6) : (k !== g.de || g.vida > 12)) && Math.abs(o.x - g.x) < 6 && Math.abs(o.y - g.y) < 10)
            || J.cosas.some(b => b.tipo === 'barril' && !b.fin && Math.abs(b.x - g.x) < 6 && g.y > b.y - 13 && g.y < b.y + 1);
          if (T.solido(g.x, g.y) || toca) estallar(J, g, A);
          continue;
        }
        if (T.solido(g.x + mx, g.y)) g.vx = -g.vx * rxx; else g.x += mx;
        if (T.solido(g.x, g.y + my)) { g.vy = -g.vy * ry; g.vx *= rxx; } else g.y += my;
      }
      if (A.mecha && !g.fin && --g.t <= 0) { if (g.y <= T.agua) estallar(J, g, A); else g.fin = true; }
      const lejos = g.tipo === 'misil' ? 900 : 200;
      if (g.y > T.agua + 20 || g.x < -lejos || g.x > T.w + lejos) g.fin = true;
    }
    J.cosas = J.cosas.filter(g => !g.fin);
    // lo que revento por otra explosion (barriles, cajas), un paso despues (asi se ve la cadena)
    if (J.pend && J.pend.length) {
      const p = J.pend; J.pend = [];
      for (const [x, y, tipo] of p) { explotar(J, x, y, ARMAS[tipo]); if (tipo === 'barril') llamas(J, x, y - 6, ARMAS.barril.llamas); }
    }
  }

  function estallar(J, g, A) {
    g.fin = true;
    explotar(J, g.x, g.y, A);
    if (A.hijos) {
      const H = A.hijos;
      for (let k = 0; k < H.n; k++) {
        // abiertos hacia arriba, como un abanico (al azar, pero el azar es del que simula: viaja en la foto)
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.6, v = H.vh * (0.55 + Math.random() * 0.45);
        J.cosas.push({ tipo: H.tipo, x: g.x, y: g.y - 2, vx: Math.cos(a) * v, vy: Math.sin(a) * v, de: g.de, t: 999 });
      }
    }
  }

  // ── Lo que anda suelto: lapidas, minas y barriles caen, rebotan poco y se quedan quietos ──
  function rodar(J, g, P) {
    const T = J.T;
    if (g.quieta) {
      if (g.y > T.agua) { g.fin = true; return; }
      if (T.solido(g.x, g.y + 1) || T.solido(g.x - 2, g.y + 1) || T.solido(g.x + 2, g.y + 1)) return;
      g.quieta = false;
    }
    g.vy = Math.min(C.VMAX, g.vy + C.GRAV);
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(g.vx), Math.abs(g.vy))));
    for (let i = 0; i < n; i++) {
      const mx = g.vx / n, my = g.vy / n;
      if (T.solido(g.x + mx, g.y)) g.vx = -g.vx * P.reboteX; else g.x += mx;
      if (T.solido(g.x, g.y + my)) { g.vy = -g.vy * P.reboteY; g.vx *= P.reboteX; } else g.y += my;
    }
    if (Math.abs(g.vx) < 0.08 && Math.abs(g.vy) < 0.6 && T.solido(g.x, g.y + 1)) { g.vx = 0; g.vy = 0; g.quieta = true; }
    if (g.y > T.agua + 20 || g.x < -200 || g.x > T.w + 200) g.fin = true;
  }
  // la mina: se arma al rato de caer; despues, si se le acerca una serpiente, cuenta y explota
  function pasoMina(J, g) {
    const A = ARMAS.mina;
    if (g.fin) return;
    if (g.arma > 0) { if (g.quieta) g.arma--; }
    else if (g.cuenta == null && J.serps.some(o => o.estado !== 'muerta' && (o.x - g.x) * (o.x - g.x) + (o.y - g.y) * (o.y - g.y) < A.radio * A.radio)) g.cuenta = A.cuenta;
    if (g.cuenta != null && --g.cuenta <= 0) {
      g.fin = true;
      if (g.falla) { J.efectos.push({ x: g.x, y: g.y - 3, r: 6, t: 0, humo: true }); J.eventos.push({ tipo: 'falla', x: g.x, y: g.y }); }
      else explotar(J, g.x, g.y - 2, A);
    }
  }
  // el fuego (de los barriles): cada llama cae, se queda en el piso, se corre con el viento, quema a la que la toca
  // y se apaga sola
  function llamas(J, x, y, n) {
    const L = ARMAS.llama;
    for (let k = 0; k < n; k++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4, v = 2 + Math.random() * 4;
      J.cosas.push({ tipo: 'llama', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: L.dura[0] + Math.floor(Math.random() * (L.dura[1] - L.dura[0])) });
    }
  }
  function pasoLlama(J, g) {
    const T = J.T, L = ARMAS.llama;
    if (--g.t <= 0) { g.fin = true; return; }
    g.vy = Math.min(4, g.vy + C.GRAV * 0.5);
    g.vx += (J.viento || 0) * 0.0004;
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(g.vx), Math.abs(g.vy))));
    for (let i = 0; i < n; i++) {
      const mx = g.vx / n, my = g.vy / n;
      if (T.solido(g.x + mx, g.y)) g.vx = 0; else g.x += mx;
      if (T.solido(g.x, g.y + my)) {
        // en el piso: se desliza para abajo si hay pendiente
        g.vy = 0; g.vx *= 0.8;
        if (!T.solido(g.x - 1, g.y + 1)) g.vx -= 0.05; else if (!T.solido(g.x + 1, g.y + 1)) g.vx += 0.05;
      } else g.y += my;
    }
    if (g.y > T.agua) { g.fin = true; return; }
    // quema (cada tanto, a las que estan cerca)
    if (g.t % L.cada === 0) for (const s of J.serps) {
      if (s.estado === 'muerta' || Math.abs(s.x - g.x) > L.radio || Math.abs(s.y - g.y) > 10) continue;
      danar(J, s, L.dano);
    }
    if (g.t % L.cada === 0) for (const b of J.cosas) if (b.tipo === 'barril' && !b.fin && Math.abs(b.x - g.x) < 8 && g.y > b.y - 16 && g.y < b.y + 3) romperBarril(J, b, L.dano);
  }

  // la escopeta: un tiro derecho, al primero que encuentra (serpiente, barril o terreno)
  function escopetazo(J, s) {
    const A = ARMAS.escopeta, T = J.T;
    const ux = Math.cos(s.mira) * s.dir, uy = Math.sin(s.mira);
    const x0 = s.x + ux * 7, y0 = s.y - 4 + uy * 7;
    let px = x0, py = y0, blanco = null, barril = null, pared = false;
    for (let i = 0; i < A.alcance; i++) {
      px = x0 + ux * i; py = y0 + uy * i;
      if (px < -50 || px > T.w + 50 || py < -400 || py > T.agua + 10) break;
      blanco = J.serps.find(o => o !== s && o.estado !== 'muerta' && Math.abs(o.x - px) < 5 && Math.abs(o.y - py) < 9);
      if (blanco) break;
      barril = J.cosas.find(b => b.tipo === 'barril' && !b.fin && Math.abs(b.x - px) < 6 && py > b.y - 13 && py < b.y + 1);
      if (barril) break;
      if (T.solido(px, py)) { pared = true; break; }
    }
    J.eventos.push({ tipo: 'tiro', x0, y0, x1: px, y1: py });
    J.efectos.push({ x: px, y: py, r: A.r, t: 0 });
    if (blanco) { danar(J, blanco, A.dano); golpear(blanco, ux * A.empuje, uy * A.empuje - 1); }
    else if (barril) romperBarril(J, barril, A.dano);
    else if (pared && (J.rompe || C.ROMPE)) crater(J, px, py, A.r);
  }
  // el bate: a las que estan justo adelante, las manda volando para donde apunta
  function batazo(J, s) {
    const A = ARMAS.bate;
    const ux = Math.cos(s.mira) * s.dir, uy = Math.sin(s.mira);
    const cx = s.x + s.dir * 12, cy = s.y - 3;
    J.eventos.push({ tipo: 'bate', x: cx, y: cy, dir: s.dir });
    for (const o of J.serps) {
      if (o === s || o.estado === 'muerta') continue;
      if (Math.abs(o.x - cx) < 14 && Math.abs(o.y - cy) < 15) { danar(J, o, A.dano); golpear(o, ux * A.empuje, uy * A.empuje); }
    }
    for (const b of J.cosas) if ((b.tipo === 'mina' || b.tipo === 'barril' || b.tipo === 'lapida') && Math.abs(b.x - cx) < 12 && Math.abs(b.y - 6 - cy) < 14) { b.vx += ux * A.empuje; b.vy += uy * A.empuje; b.quieta = false; }
  }
  // el ataque aereo: n misiles que caen desde arriba del punto elegido, en fila, viniendo del lado elegido. Salen
  // de forma que sin viento caigan sobre el punto (con viento se corren, como en el juego clasico)
  function ataqueAereo(J, s, x, y, dir) {
    const A = ARMAS.aereo, y0 = -60, g = C.GRAV / 2;
    const t = (-A.vy + Math.sqrt(A.vy * A.vy + 4 * g * Math.max(0, y - y0))) / (2 * g);
    for (let k = 0; k < A.n; k++) {
      const off = (k - (A.n - 1) / 2) * A.sep;
      J.cosas.push({ tipo: 'misil', x: x + off - dir * A.vx * t, y: y0, vx: dir * A.vx, vy: A.vy, de: J.serps.indexOf(s), t: 999 });
    }
  }
  // ── El soplete: la serpiente avanza cavando ──
  function soplete(J, s) {
    s.soplete = { t: ARMAS.soplete.dura, ang: Math.max(-ARMAS.soplete.angMax, Math.min(ARMAS.soplete.angMax, s.mira)), tocadas: [], aire: 0 };
    s.vx = 0; s.vy = 0; s.salto = null; s.gancho = null; s.soga = null;
  }
  function pasoSoplete(J, s, e) {
    const T = J.T, S = s.soplete, A = ARMAS.soplete;
    if (e.arr) S.ang = Math.max(-A.angMax, S.ang - C.MIRA);
    if (e.aba) S.ang = Math.min(A.angMax, S.ang + C.MIRA);
    s.mira = S.ang;
    const ux = Math.cos(S.ang) * s.dir, uy = Math.sin(S.ang);
    // el tunel: un circulo adelante, del alto de la serpiente, con el piso justo debajo de ella. ¿Queda algo para
    // cavar adelante? (si sale al aire libre un rato, se apaga y se cae)
    const cx = s.x + ux * A.adelante, cy = s.y - 2 + uy * A.adelante;
    let hay = false;
    for (let k = -A.r; k <= A.r && !hay; k += 4) hay = T.solido(cx + ux * (A.r - 2), cy + k) || T.solido(cx + ux * k * 0.5, cy + A.r - 1);
    S.aire = hay ? 0 : S.aire + 1;
    if (S.t % A.cada === 0 && (J.rompe || C.ROMPE)) crater(J, cx, cy, A.r);
    const nx = s.x + ux * A.vel, ny = s.y + uy * A.vel;
    if (!choca(T, nx, ny)) { s.x = nx; s.y = ny; } else if (!choca(T, nx, ny - 1)) { s.x = nx; s.y = ny - 1; }
    // quema a las que tiene adelante (una vez a cada una)
    J.serps.forEach((o, k) => {
      if (o === s || o.estado === 'muerta' || S.tocadas.includes(k)) return;
      if (Math.abs(o.x - (s.x + ux * 10)) < 9 && Math.abs(o.y - (s.y + uy * 10)) < 12) { S.tocadas.push(k); danar(J, o, A.dano); golpear(o, ux * A.empuje, -2); }
    });
    if (--S.t <= 0 || S.aire > 25) { s.soplete = null; s.estado = apoyada(T, s.x, s.y) ? 'suelo' : 'aire'; s.vx = 0; s.vy = 0; }
  }
  // ── El puñetazo: sube derecho golpeando ──
  function punetazo(J, s) {
    s.puno = { t: ARMAS.puno.pasos, tocadas: [], y0: s.y }; s.estado = 'aire'; s.vx = 0; s.vy = 0; s.salto = null; s.sinCaida = true; s.gancho = null; s.soga = null;
  }
  function pasoPuno(J, s) {
    const T = J.T, P = s.puno, A = ARMAS.puno;
    const arriba = s.y - 24, abajo = Math.max(s.y, P.y0 == null ? s.y : P.y0) + 10, fx = s.x + s.dir * 7;
    J.serps.forEach((o, k) => {
      if (o === s || o.estado === 'muerta' || P.tocadas.includes(k)) return;
      if (Math.abs(o.x - fx) < 10 && o.y > arriba && o.y < abajo) { P.tocadas.push(k); danar(J, o, A.dano); golpear(o, s.dir * A.empuje[0], A.empuje[1]); }
    });
    for (const b of J.cosas) if (b.tipo === 'barril' && !b.fin && !b.punado && Math.abs(b.x - fx) < 10 && b.y - 6 > arriba && b.y - 6 < abajo) { b.punado = true; romperBarril(J, b, A.dano); }
    for (let k = 0; k < A.sube; k++) if (!choca(T, s.x, s.y - 1)) s.y -= 1; else { P.t = 0; break; }
    if (--P.t <= 0) { s.puno = null; s.estado = 'aire'; s.vy = 0; }
  }
  function romperBarril(J, b, n) {
    b.vida = (b.vida == null ? ARMAS.barril.vida : b.vida) - n; b.prendido = true;
    if (b.vida <= 0 && !b.fin) { b.fin = true; (J.pend || (J.pend = [])).push([b.x, b.y - 6, 'barril']); }
  }

  function explotar(J, x, y, A) {
    A = A || ARMAS.granada;
    const T = J.T, R = A.r;
    if (J.rompe || C.ROMPE) crater(J, x, y, R * 0.75);
    J.efectos.push({ x, y, r: R, t: 0 });
    J.eventos.push({ tipo: 'explosion', x, y, r: R });
    for (const s of J.serps) {
      if (s.estado === 'muerta') continue;
      const dx = s.x - x, dy = s.y - y, d = Math.hypot(dx, dy);
      if (d > R) continue;
      const k = 1 - d / R, dano = Math.max(1, Math.round(A.dano * k));
      danar(J, s, dano);
      const ux = d ? dx / d : 0, uy = d ? dy / d : -1;
      // (si la saca de la soga, pierde el control como en el juego clasico: no puede volver a tirarla hasta el piso)
      golpear(s, ux * A.empuje * k, uy * A.empuje * k - 1.5 * k);
    }
    // lo suelto sale volando; los barriles y las cajas (modo normal) revientan
    for (const g of J.cosas) {
      if (g.fin) continue;
      const dx = g.x - x, dy = g.y - y, d2 = dx * dx + dy * dy;
      if (d2 > R * R) continue;
      if (g.tipo === 'caja') { if (J.rompe) { g.fin = true; (J.pend || (J.pend = [])).push([g.x, g.y, 'caja']); } continue; }
      const d = Math.sqrt(d2), k = 1 - d / R;
      if (g.tipo === 'barril') { romperBarril(J, g, Math.max(1, Math.round(A.dano * k))); if (g.fin) continue; }
      if (ARMAS[g.tipo] && ARMAS[g.tipo].choque) continue;
      const ux = d ? dx / d : 0, uy = d ? dy / d : -1;
      g.vx += ux * A.empuje * k; g.vy += uy * A.empuje * k - 1.5 * k; g.quieta = false;
    }
  }
  // ¿quedo todo quieto? (para pasar el turno: nada volando ni ardiendo, ninguna serpiente en el aire)
  function quieto(J) {
    if (J.cosas.some(g => !(g.quieta && (g.tipo !== 'mina' || g.cuenta == null) && !g.prendido))) return false;
    if (J.pend && J.pend.length) return false;
    return J.serps.every(s => s.estado === 'muerta' || ((s.estado === 'suelo' || s.estado === 'soga') && !s.soplete && !s.puno));
  }

  function nuevoJuego(T, op) {
    return { T, serps: [], cosas: [], efectos: [], borrados: [], crateres: [], pend: [], eventos: [], mecha: 3, rebote: 'min', paso: 0, viento: 0, rompe: !!(op && op.rompe) };
  }
  function pasoJuego(J, entradas) {
    J.paso++;
    J.serps.forEach((s, i) => paso(J, s, entradas[i] || {}));
    pasoCosas(J);
  }

  const API = { C, ARMAS, Terreno, Serpiente, nuevoJuego, pasoJuego, lanzar, soltar, poner, caja, explotar, crater, quieto, choca, escopetazo, batazo, ataqueAereo, soplete, punetazo, danar, golpear };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else raiz.ShoppaMotor = API;
})(typeof window !== 'undefined' ? window : globalThis);
