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
    MIRA: 0.049,              // radianes por paso al apuntar
    // la soga (5 estrellas: 462 px y tiros ilimitados). Una soga de un solo lado: tira pero se afloja
    // (medido en partidas filmadas). Acortar y alargar: ~4 px por paso (medido: 200-225 px/s)
    SOGA_LARGO: 462, SOGA_MIN: 14, SOGA_VEL: 18,
    SOGA_ACORTA: 4.0, SOGA_ALARGA: 4.4,
    SOGA_EMPUJE: 0.38,        // el balanceo: empuje a lo largo del giro (el valor de Proyecto Gusanos)
    SOGA_VMAX: 32,            // tope de velocidad colgado
    SOGA_REBOTE: 0.6,         // al chocar colgado contra el terreno
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
    this.gancho = null;       // el gancho volando: { x, y, dx, dy, d }
    this.salto = null;        // { tecla, t } esperando el doble toque
    this.caida = 0;           // el ultimo daño por caida (para mostrarlo)
    this.cola = [];           // por donde paso (para dibujar el cuerpo)
  }

  // ── Un paso de fisica de la serpiente. e: lo que se aprieta { izq, der, arr, aba, enter, retro, soga } ──
  // (enter/retro/soga son "recien apretado")
  function paso(J, s, e) {
    const T = J.T;
    if (s.estado === 'muerta') return;
    // la mira (no colgado: ahi arriba/abajo es el largo de la soga)
    if (s.estado !== 'soga') {
      if (e.arr) s.mira = Math.max(-Math.PI / 2, s.mira - C.MIRA);
      if (e.aba) s.mira = Math.min(Math.PI / 2, s.mira + C.MIRA);
    }
    // la soga: tirarla (o soltarla si ya esta colgada)
    if (e.soga) {
      if (s.estado === 'soga') { s.estado = 'aire'; s.soga = null; }
      else if (!s.gancho) tirarGancho(s);
    }
    if (s.gancho) volarGancho(J, s);

    if (s.estado === 'suelo') pasoSuelo(J, s, e);
    else if (s.estado === 'desliza') pasoDesliza(J, s);
    else if (s.estado === 'aire') pasoAire(J, s);
    else if (s.estado === 'soga') pasoSoga(J, s, e);

    // el agua
    if (s.y - 4 > T.agua) { s.estado = 'muerta'; s.vida = 0; s.soga = null; s.gancho = null; }
    // la cola, para el dibujo
    const u = s.cola[0];
    if (!u || Math.abs(u[0] - s.x) + Math.abs(u[1] - s.y) >= 1.2) { s.cola.unshift([s.x, s.y]); if (s.cola.length > 40) s.cola.pop(); }
  }

  function saltar(s, v, atras) {
    const d = atras ? -s.dir : s.dir;
    s.vx = v[0] * d; s.vy = v[1]; s.estado = 'aire';
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

  function aterrizar(s) {
    const v = s.vy;
    if (s.sinCaida) s.sinCaida = false;
    else if (v > C.CAIDA_DESDE) {
      const dano = Math.floor(((v - C.CAIDA_DESDE + 1 / 65536) * C.CAIDA_COEF + 18) / 18);
      s.caida = dano; s.vida = Math.max(0, s.vida - dano); s.golpe = (s.golpe || 0) + dano;
      if (s.J) s.J.eventos.push({ tipo: 'dano', x: s.x, y: s.y - 14, n: dano, caida: true });
    }
    s.vy = 0;
    // los saltos aterrizan quietos; lo que venia volando rapido (una explosion) se desliza
    s.estado = Math.abs(s.vx) > 2.5 ? 'desliza' : 'suelo';
    if (s.estado === 'suelo') s.vx = 0;
    s.tiros = Infinity; // al tocar el piso, la soga vuelve a tener todos sus tiros
  }

  function pasoAire(J, s) {
    const T = J.T;
    s.vy = Math.min(C.VMAX, s.vy + C.GRAV);
    s.vx = Math.max(-C.VMAX, Math.min(C.VMAX, s.vx));
    if (Math.abs(s.vx) > 0.05) s.dir = s.vx > 0 ? 1 : -1;
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(s.vx), Math.abs(s.vy))));
    for (let i = 0; i < n && s.estado === 'aire'; i++) {
      if (s.vx) moverX(T, s, s.vx / n, C.REBOTE);
      const r = moverY(T, s, s.vy / n);
      if (r === 'piso') { aterrizar(s); break; }
      if (r === 'techo') s.vy = 0;
    }
    if (s.estado === 'aire') s.vx *= 0.999;
  }

  // ── La soga ──
  function tirarGancho(s) {
    // nunca por debajo de la horizontal (con todas las estrellas: hasta 90 grados de la vertical)
    let dx = Math.cos(s.mira) * s.dir, dy = Math.sin(s.mira);
    if (dy > -0.015) { dy = -0.015; const n = Math.hypot(dx, dy); dx /= n; dy /= n; }
    s.gancho = { x: s.x, y: s.y - 2, dx, dy, d: 0 };
  }
  function volarGancho(J, s) {
    const T = J.T, g = s.gancho;
    for (let i = 0; i < C.SOGA_VEL; i++) {
      const nx = g.x + g.dx, ny = g.y + g.dy;
      if (T.solido(nx, ny)) {
        // se engancha en el ultimo pixel libre (muy cerca, no engancha)
        const L = Math.hypot(g.x - s.x, g.y - s.y);
        s.gancho = null;
        if (L < 20 || !T.libre(s.x, s.y - 2, g.x, g.y, 2)) return;
        s.soga = { piv: [{ x: g.x, y: g.y, s: 0 }], L: Math.max(C.SOGA_MIN, Math.min(C.SOGA_LARGO, L)), fijo: 0 };
        s.estado = 'soga'; s.salto = null;
        return;
      }
      g.x = nx; g.y = ny; g.d++;
      if (g.d >= C.SOGA_LARGO || g.y < -300 || g.x < -60 || g.x > T.w + 60) { s.gancho = null; return; }
    }
  }

  function pasoSoga(J, s, e) {
    const T = J.T, R = s.soga;
    const ultimo = () => R.piv[R.piv.length - 1];
    // acortar / alargar (medido en partidas: unos 4 px por paso en los dos sentidos)
    if (e.arr) acortar(T, s);
    if (e.aba) R.L = Math.min(C.SOGA_LARGO, R.L + C.SOGA_ALARGA);
    // el balanceo: empuje a lo largo del giro, para el lado que se aprieta
    const d = (e.izq ? -1 : 0) + (e.der ? 1 : 0);
    if (d) {
      const p = ultimo(), dx = s.x - p.x, dy = s.y - p.y, n = Math.hypot(dx, dy) || 1;
      let tx = -dy / n, ty = dx / n;
      if (tx * d < 0) { tx = -tx; ty = -ty; }
      s.vx += tx * C.SOGA_EMPUJE; s.vy += ty * C.SOGA_EMPUJE;
      s.dir = d;
    }
    s.vy += C.GRAV;
    s.vx = Math.max(-C.SOGA_VMAX, Math.min(C.SOGA_VMAX, s.vx));
    s.vy = Math.max(-C.SOGA_VMAX, Math.min(C.SOGA_VMAX, s.vy));
    // moverse de a poco: chocar, enrollar en las esquinas y que la soga no se estire
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(s.vx), Math.abs(s.vy))));
    let apoyada = false;
    for (let i = 0; i < n && s.estado === 'soga'; i++) {
      const ax = s.x, ay = s.y;
      if (s.vx) moverX(T, s, s.vx / n, C.SOGA_REBOTE);
      const r = moverY(T, s, s.vy / n);
      if (r === 'piso') { apoyada = true; s.vy = 0; }
      else if (r === 'techo') s.vy = 0;
      enrollar(T, s, ax, ay);
      restringir(T, s, ax, ay);
    }
    // apoyada en el piso, colgada: roza como caminando
    if (apoyada) { s.vx *= C.ROCE; if (Math.abs(s.vx) < 0.05) s.vx = 0; }
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

  // la soga no se estira (pero se afloja): si quedo mas lejos, vuelve al circulo y pierde la velocidad
  // hacia afuera. Si ese punto cae en el terreno, se desliza por el borde (busca el angulo libre mas cerca)
  function restringir(T, s, ax, ay) {
    const R = s.soga, p = R.piv[R.piv.length - 1], r = R.L - R.fijo;
    const dx = s.x - p.x, dy = s.y - p.y, d = Math.hypot(dx, dy) || 1;
    if (d <= r) return;
    let ux = dx / d, uy = dy / d, tx = p.x + ux * r, ty = p.y + uy * r;
    if (choca(T, tx, ty)) {
      const base = Math.atan2(uy, ux); let libre = null;
      for (let k = 1; k <= 12 && !libre; k++) for (const sg of [-1, 1]) {
        const a = base + sg * k * 0.02, x = p.x + Math.cos(a) * r, y = p.y + Math.sin(a) * r;
        if (!choca(T, x, y)) { libre = [x, y, Math.cos(a), Math.sin(a)]; break; }
      }
      if (!libre) { s.x = ax; s.y = ay; const vr = s.vx * ux + s.vy * uy; if (vr > 0) { s.vx -= vr * ux; s.vy -= vr * uy; } return; }
      [tx, ty, ux, uy] = libre;
    }
    s.x = tx; s.y = ty;
    const vr = s.vx * ux + s.vy * uy;
    if (vr > 0) { s.vx -= vr * ux; s.vy -= vr * uy; }
  }

  // ── Las armas y las cajas ──
  // ARMAS: lo que sale de las cajas. v: velocidad con la carga llena; viento: cuanto la lleva el viento;
  // mecha: segundos (rebota hasta explotar); si no tiene mecha, explota al tocar algo. r: radio; dano: maximo
  const ARMAS = {
    bazooka: { nombre: 'Bazuca', v: 15, viento: 0.0008, r: 50, dano: 50, empuje: 7 },
    granada: { nombre: 'Granada', v: 12, viento: 0, mecha: true, r: 48, dano: 50, empuje: 7, reboteX: 0.96, reboteY: 0.6 },
  };
  // tirar con carga (0 a 1), para donde apunta
  function lanzar(J, s, carga, tipo) {
    const A = ARMAS[tipo || 'granada'], v = A.v * Math.max(0.1, carga), a = s.mira;
    J.cosas.push({ tipo: tipo || 'granada', x: s.x + s.dir * 6, y: s.y - 4, vx: Math.cos(a) * s.dir * v, vy: Math.sin(a) * v, t: (J.mecha || 3) * 50, de: J.serps.indexOf(s) });
  }
  // soltarla desde la soga (o en el aire): sale con la velocidad de la serpiente
  function soltar(J, s, tipo) {
    J.cosas.push({ tipo, x: s.x, y: s.y + 4, vx: s.vx, vy: s.vy, t: (J.mecha || 3) * 50, de: J.serps.indexOf(s) });
  }
  // una caja que cae del cielo en el punto x (y se apoya en lo primero que encuentra)
  function caja(J, x, y, n) { J.cosas.push({ tipo: 'caja', x, y, vx: 0, vy: 0, n }); }

  function pasoCosas(J) {
    const T = J.T;
    for (const g of J.cosas) {
      if (g.tipo === 'caja') {
        // cae con paracaidas (lento) hasta apoyarse
        if (g.quieta) continue;
        g.vy = Math.min(2, g.vy + C.GRAV);
        for (let k = 0; k < Math.ceil(g.vy); k++) { if (T.solido(g.x, g.y + 8) || T.solido(g.x - 6, g.y + 8) || T.solido(g.x + 6, g.y + 8)) { g.quieta = true; g.vy = 0; break; } g.y += g.vy / Math.ceil(g.vy); }
        if (g.y > T.agua) g.fin = true;
        continue;
      }
      const A = ARMAS[g.tipo];
      g.vy = Math.min(C.VMAX, g.vy + C.GRAV);
      g.vx += (J.viento || 0) * A.viento;
      const n = Math.max(1, Math.ceil(Math.max(Math.abs(g.vx), Math.abs(g.vy))));
      for (let i = 0; i < n && !g.fin; i++) {
        const mx = g.vx / n, my = g.vy / n;
        if (!A.mecha) {
          // explota al tocar el terreno o una serpiente (que no sea la que la tiro, al salir)
          g.x += mx; g.y += my; g.vida = (g.vida || 0) + 1;
          const toca = J.serps.some((o, k) => o.estado !== 'muerta' && (k !== g.de || g.vida > 12) && Math.abs(o.x - g.x) < 6 && Math.abs(o.y - g.y) < 10);
          if (T.solido(g.x, g.y) || toca) { g.fin = true; explotar(J, g.x, g.y, A); }
          continue;
        }
        if (T.solido(g.x + mx, g.y)) g.vx = -g.vx * A.reboteX; else g.x += mx;
        if (T.solido(g.x, g.y + my)) { g.vy = -g.vy * A.reboteY; g.vx *= A.reboteX; } else g.y += my;
      }
      if (A.mecha && --g.t <= 0) { g.fin = true; if (g.y <= T.agua) explotar(J, g.x, g.y, A); }
      if (g.y > T.agua + 20 || g.x < -200 || g.x > T.w + 200) g.fin = true;
    }
    J.cosas = J.cosas.filter(g => !g.fin);
  }
  function explotar(J, x, y, A) {
    A = A || ARMAS.granada;
    const T = J.T, R = A.r;
    if (C.ROMPE) { T.borrar(x, y, R * 0.75); J.borrados.push([x, y, R * 0.75]); }
    J.efectos.push({ x, y, r: R, t: 0 });
    J.eventos.push({ tipo: 'explosion', x, y });
    for (const s of J.serps) {
      if (s.estado === 'muerta') continue;
      const dx = s.x - x, dy = s.y - y, d = Math.hypot(dx, dy);
      if (d > R) continue;
      const k = 1 - d / R, dano = Math.max(1, Math.round(A.dano * k));
      s.vida = Math.max(0, s.vida - dano); s.golpe = (s.golpe || 0) + dano;
      J.eventos.push({ tipo: 'dano', x: s.x, y: s.y - 14, n: dano });
      const ux = d ? dx / d : 0, uy = d ? dy / d : -1;
      s.soga = null; s.gancho = null; s.estado = 'aire'; s.sinCaida = true; s.salto = null;
      s.vx += ux * A.empuje * k; s.vy += uy * A.empuje * k - 1.5 * k;
    }
  }
  // ¿quedo todo quieto? (para pasar el turno: nada volando, ninguna serpiente en el aire)
  function quieto(J) {
    if (J.cosas.some(g => g.tipo !== 'caja' || !g.quieta)) return false;
    return J.serps.every(s => s.estado === 'muerta' || s.estado === 'suelo' || s.estado === 'soga');
  }

  function nuevoJuego(T) {
    return { T, serps: [], cosas: [], efectos: [], borrados: [], eventos: [], mecha: 3, paso: 0, viento: 0 };
  }
  function pasoJuego(J, entradas) {
    J.paso++;
    J.serps.forEach((s, i) => paso(J, s, entradas[i] || {}));
    pasoCosas(J);
  }

  const API = { C, ARMAS, Terreno, Serpiente, nuevoJuego, pasoJuego, lanzar, soltar, caja, explotar, quieto, choca };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else raiz.ShoppaMotor = API;
})(typeof window !== 'undefined' ? window : globalThis);
