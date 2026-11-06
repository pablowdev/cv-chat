// Shoppa: el motor (fisica y reglas basicas). Corre igual en el navegador y en el servidor: 50 pasos por
// segundo, unidades en pixeles por paso. Sin dibujo: lo dibuja juego.js.
//
// La fisica imita el "sentir" de los juegos de artilleria de los 90 con soga (medidas de la documentacion
// de la comunidad): gravedad ~0.24 px/paso², caminar 1 px/paso, subir escalones de hasta 8 px, saltos
// con Enter (adelante / doble: atras) y Retroceso (arriba / doble: mortal), caida que lastima desde 8 px/paso,
// y la soga: rigida, que se enrolla en las esquinas, se acorta y se alarga, y al acortarla gira mas rapido.
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
    DOBLE: 12,                // pasos para el doble toque (Enter Enter, Retroceso Retroceso)
    REBOTE: 0.3,              // al chocar volando contra una pared
    ROCE: 0.96,               // deslizando por el piso (pierde 4% por paso)
    CAIDA_DESDE: 8, CAIDA_COEF: 50, // daño por caida: ((v - 8) * coef + 18) / 18
    MIRA: 0.049,              // radianes por paso al apuntar
    // la soga
    SOGA_LARGO: 462, SOGA_MIN: 10, SOGA_VEL: 18,
    SOGA_ACORTA: 3.2, SOGA_ALARGA: 4.4,
    SOGA_EMPUJE: 0.11,        // el balanceo con izquierda/derecha (horizontal)
    SOGA_ROCE: 0.998,         // lo que conserva de la velocidad tangencial en cada paso
    SOGA_VMAX: 16,            // tope de velocidad colgado
    SOGA_REBOTE: 0.45,        // al chocar colgado contra el terreno
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
    // los saltos: un toque o dos (espera unos pasos para saber)
    if (s.salto) {
      s.salto.t--;
      if (e.enter && s.salto.tecla === 'enter') { s.salto = null; return saltar(s, C.SALTO_ATRAS, true); }
      if (e.retro && s.salto.tecla === 'retro') { s.salto = null; return saltar(s, C.MORTAL, true); }
      if (s.salto.t <= 0) { const k = s.salto.tecla; s.salto = null; return saltar(s, k === 'enter' ? C.SALTO_ADELANTE : C.SALTO_ARRIBA, false); }
    } else if (e.enter) { s.salto = { tecla: 'enter', t: C.DOBLE }; }
    else if (e.retro) { s.salto = { tecla: 'retro', t: C.DOBLE }; }
    // caminar
    const d = e.izq && !e.der ? -1 : e.der && !e.izq ? 1 : 0;
    if (d && !s.salto) {
      if (s.dir !== d) { s.dir = d; s.mira = s.mira; }
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

  function pasoAire(J, s) {
    const T = J.T;
    s.vy = Math.min(C.VMAX, s.vy + C.GRAV);
    s.vx = Math.max(-C.VMAX, Math.min(C.VMAX, s.vx));
    if (s.vx) s.dir = s.vx > 0 ? 1 : -1;
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(s.vx), Math.abs(s.vy))));
    for (let i = 0; i < n && s.estado === 'aire'; i++) {
      const dx = s.vx / n, dy = s.vy / n;
      if (dx) {
        if (!choca(T, s.x + dx, s.y)) s.x += dx;
        else if (s.vy >= 0 && !choca(T, s.x + dx, s.y - 1)) { s.x += dx; s.y -= 1; }
        else s.vx = -s.vx * C.REBOTE;
      }
      if (dy) {
        if (!choca(T, s.x, s.y + dy)) s.y += dy;
        else if (dy > 0) {
          // cae: se apoya (y si venia rapido, se lastima)
          while (!choca(T, s.x, s.y + 0.25)) s.y += 0.25;
          const v = s.vy;
          if (s.sinCaida) s.sinCaida = false;
          else if (v > C.CAIDA_DESDE) {
            const dano = Math.floor(((v - C.CAIDA_DESDE + 1 / 65536) * C.CAIDA_COEF + 18) / 18);
            s.caida = dano; s.vida = Math.max(0, s.vida - dano);
          }
          s.vy = 0;
          // (los saltos aterrizan quietos; lo que venia volando rapido, por una explosion, se desliza)
          s.estado = Math.abs(s.vx) > 2.5 ? 'desliza' : 'suelo';
          if (s.estado === 'suelo') s.vx = 0;
          s.y = Math.floor(s.y); // (apoyada justo encima del piso, sin meterse en el)
        } else s.vy = 0; // el techo
      }
    }
  }

  // ── La soga ──
  function tirarGancho(s) {
    // nunca por debajo de la horizontal
    const a = Math.min(0, s.mira);
    s.gancho = { x: s.x, y: s.y - 4, dx: Math.cos(a) * s.dir, dy: Math.sin(a), d: 0 };
  }
  function volarGancho(J, s) {
    const T = J.T, g = s.gancho;
    for (let i = 0; i < C.SOGA_VEL; i++) {
      const nx = g.x + g.dx, ny = g.y + g.dy;
      if (T.solido(nx, ny)) {
        // se engancha en el ultimo pixel libre
        const L = Math.hypot(g.x - s.x, g.y - s.y);
        s.gancho = null;
        if (L < C.SOGA_MIN) return;
        s.soga = { piv: [{ x: g.x, y: g.y, s: 0 }], L: Math.min(C.SOGA_LARGO, L), fijo: 0 };
        s.estado = 'soga'; s.salto = null;
        return;
      }
      g.x = nx; g.y = ny; g.d++;
      if (g.d >= C.SOGA_LARGO || g.y < -50 || g.x < -50 || g.x > T.w + 50) { s.gancho = null; return; }
    }
  }

  function pasoSoga(J, s, e) {
    const T = J.T, R = s.soga;
    let p = R.piv[R.piv.length - 1];
    let r = R.L - R.fijo;
    // la distancia ahora y la direccion desde el ultimo punto de enganche
    let dx = s.x - p.x, dy = s.y - p.y, d = Math.hypot(dx, dy) || 1;
    const tensa = d >= r - 0.5;
    // acortar / alargar (al acortar, gira mas rapido: se conserva el momento angular)
    if (e.arr || e.aba) {
      const nL = Math.max(R.fijo + C.SOGA_MIN, Math.min(C.SOGA_LARGO, R.L + (e.arr ? -C.SOGA_ACORTA : C.SOGA_ALARGA)));
      const nr = nL - R.fijo;
      if (e.arr && nr < d) {
        const nx = p.x + dx / d * nr, ny = p.y + dy / d * nr;
        if (!choca(T, nx, ny)) {
          const ux = dx / d, uy = dy / d, vr = s.vx * ux + s.vy * uy;
          const tx = s.vx - vr * ux, ty = s.vy - vr * uy, k = d / nr;
          if (tensa) { s.vx = tx * k + vr * ux; s.vy = ty * k + vr * uy; }
          s.x = nx; s.y = ny; R.L = nL;
        }
      } else if (e.aba) R.L = nL;
      r = R.L - R.fijo;
    }
    // el balanceo: empuja de costado (solo tensa)
    if (tensa) {
      if (e.izq && !e.der) { s.vx -= C.SOGA_EMPUJE; s.dir = -1; }
      if (e.der && !e.izq) { s.vx += C.SOGA_EMPUJE; s.dir = 1; }
    }
    s.vy += C.GRAV;
    // el roce de la soga (la parte tangencial)
    dx = s.x - p.x; dy = s.y - p.y; d = Math.hypot(dx, dy) || 1;
    {
      const ux = dx / d, uy = dy / d, vr = s.vx * ux + s.vy * uy;
      const tx = (s.vx - vr * ux) * C.SOGA_ROCE, ty = (s.vy - vr * uy) * C.SOGA_ROCE;
      s.vx = tx + vr * ux; s.vy = ty + vr * uy;
    }
    // tope de velocidad
    const v = Math.hypot(s.vx, s.vy);
    if (v > C.SOGA_VMAX) { s.vx *= C.SOGA_VMAX / v; s.vy *= C.SOGA_VMAX / v; }
    // moverse de a poco, chocando, enrollando y restringiendo
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(s.vx), Math.abs(s.vy))));
    for (let i = 0; i < n && s.estado === 'soga'; i++) {
      const ax = s.x, ay = s.y;
      const mx = s.vx / n, my = s.vy / n;
      if (mx) { if (!choca(T, s.x + mx, s.y)) s.x += mx; else s.vx = -s.vx * C.SOGA_REBOTE; }
      if (my) { if (!choca(T, s.x, s.y + my)) s.y += my; else s.vy = -s.vy * C.SOGA_REBOTE; }
      enrollar(T, s, ax, ay);
      restringir(T, s, ax, ay);
    }
  }

  // ¿la soga se apoya en una esquina? (el tramo del ultimo enganche a la serpiente cruza terreno)
  function enrollar(T, s, ax, ay) {
    const R = s.soga;
    // desenrollar: el tramo quedo derecho (cambio de lado respecto del enganche anterior)
    while (R.piv.length > 1) {
      const p = R.piv[R.piv.length - 1], q = R.piv[R.piv.length - 2];
      const lado = Math.sign((p.x - q.x) * (s.y - p.y) - (p.y - q.y) * (s.x - p.x));
      if (lado !== 0 && lado !== p.s) { R.piv.pop(); R.fijo -= Math.hypot(p.x - q.x, p.y - q.y); }
      else break;
    }
    // enrollar: el tramo cruza terreno. Busca entre donde estaba (libre) y donde esta el punto exacto en
    // que se apoya, y engancha la soga en la esquina
    for (let vuelta = 0; vuelta < 3; vuelta++) {
      const p = R.piv[R.piv.length - 1];
      if (T.libre(p.x, p.y, s.x, s.y, 2)) return;
      let lo = 0, hi = 1;
      for (let k = 0; k < 10; k++) {
        const m = (lo + hi) / 2;
        if (T.libre(p.x, p.y, ax + (s.x - ax) * m, ay + (s.y - ay) * m, 2)) lo = m; else hi = m;
      }
      const bx = ax + (s.x - ax) * hi, by = ay + (s.y - ay) * hi;
      // la esquina: el ultimo pixel libre antes del terreno, en la linea del enganche al punto bloqueado
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

  // la soga no se estira: si quedo mas lejos, vuelve al circulo y pierde la velocidad hacia afuera
  function restringir(T, s, ax, ay) {
    const R = s.soga, p = R.piv[R.piv.length - 1], r = R.L - R.fijo;
    const dx = s.x - p.x, dy = s.y - p.y, d = Math.hypot(dx, dy) || 1;
    if (d <= r) return;
    const nx = p.x + dx / d * r, ny = p.y + dy / d * r;
    if (!choca(T, nx, ny)) { s.x = nx; s.y = ny; } else { s.x = ax; s.y = ay; }
    const ux = dx / d, uy = dy / d, vr = s.vx * ux + s.vy * uy;
    if (vr > 0) { s.vx -= vr * ux; s.vy -= vr * uy; }
  }

  // ── La granada de prueba (rebota y explota a los 3 segundos) ──
  function lanzar(J, s, carga) {
    const v = C.GRANADA_V * Math.max(0.1, carga);
    const a = s.mira;
    J.cosas.push({ tipo: 'granada', x: s.x + s.dir * 6, y: s.y - 4, vx: Math.cos(a) * s.dir * v, vy: Math.sin(a) * v, t: J.mecha * 50 });
  }
  function pasoCosas(J) {
    const T = J.T;
    for (const g of J.cosas) {
      g.vy = Math.min(C.VMAX, g.vy + C.GRAV);
      const n = Math.max(1, Math.ceil(Math.max(Math.abs(g.vx), Math.abs(g.vy))));
      for (let i = 0; i < n; i++) {
        const mx = g.vx / n, my = g.vy / n;
        if (T.solido(g.x + mx, g.y)) { g.vx = -g.vx * C.GRANADA_REBOTE_X; } else g.x += mx;
        if (T.solido(g.x, g.y + my)) { g.vy = -g.vy * C.GRANADA_REBOTE_Y; g.vx *= C.GRANADA_REBOTE_X; } else g.y += my;
      }
      if (--g.t <= 0 || g.y > T.agua + 20) { g.fin = true; if (g.y <= T.agua) explotar(J, g.x, g.y); }
    }
    J.cosas = J.cosas.filter(g => !g.fin);
  }
  function explotar(J, x, y) {
    const T = J.T, R = C.EXPLOSION_R;
    if (C.ROMPE) { T.borrar(x, y, R * 0.75); J.borrados.push([x, y, R * 0.75]); }
    J.efectos.push({ x, y, r: R, t: 0 });
    for (const s of J.serps) {
      if (s.estado === 'muerta') continue;
      const dx = s.x - x, dy = s.y - y, d = Math.hypot(dx, dy);
      if (d > R) continue;
      const k = 1 - d / R;
      s.vida = Math.max(0, s.vida - Math.round(C.EXPLOSION_DANO * k));
      const ux = d ? dx / d : 0, uy = d ? dy / d : -1;
      s.soga = null; s.gancho = null; s.estado = 'aire'; s.sinCaida = true;
      s.vx += ux * C.EXPLOSION_EMPUJE * k; s.vy += uy * C.EXPLOSION_EMPUJE * k - 1.5 * k;
    }
  }

  function nuevoJuego(T) {
    return { T, serps: [], cosas: [], efectos: [], borrados: [], mecha: 3, paso: 0 };
  }
  function pasoJuego(J, entradas) {
    J.paso++;
    J.serps.forEach((s, i) => paso(J, s, entradas[i] || {}));
    pasoCosas(J);
  }

  const API = { C, Terreno, Serpiente, nuevoJuego, pasoJuego, lanzar, explotar, choca };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else raiz.ShoppaMotor = API;
})(typeof window !== 'undefined' ? window : globalThis);
