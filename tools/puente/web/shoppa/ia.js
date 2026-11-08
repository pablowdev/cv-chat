// Shoppa: la maquina (los rivales de la compu). Piensa con el mismo motor del juego: copia el estado, prueba
// muchas jugadas en un mundo de prueba (el terreno se comparte pero no se rompe) y se queda con la mejor.
//  · Tiros (modo normal, y en Shopper despues de agarrar la caja): prueba armas, angulos y fuerzas (con el
//    viento y la mecha), mira el daño que hace a los otros equipos y el que se haria a si misma o a los suyos,
//    y despues revisa los mejores simulando a las serpientes (si alguna se cae al agua).
//  · Soga (Shopper): prueba cientos de combinaciones al azar (apuntar, saltar o no, tirar la soga, balancearse,
//    acortar o alargar, soltar y volver a tirar) hasta encontrar una que agarre una caja sin caerse al agua; la
//    jugada se repite despues igual en el juego (el motor da lo mismo con las mismas teclas).
// Todo se calcula de a poco (generadores: el juego los avanza unos milisegundos por paso), asi no se traba.
(function (raiz) {
  'use strict';
  const M = raiz.ShoppaMotor || (typeof require === 'function' ? require('./motor.js') : null);
  const C = M.C, A = M.ARMAS;

  // los niveles: error al apuntar (radianes) y en la fuerza, y cuanto prueba
  const NIVELES = {
    // (elige: entre los ataques que dan al menos esa parte del mejor, uno al azar: la facil no siempre ve el mejor)
    facil: { ang: 0.17, fuerza: 0.22, tiros: 0.35, rollouts: 120, piensa: 1.4, elige: 0.35 },
    normal: { ang: 0.035, fuerza: 0.05, tiros: 0.7, rollouts: 260, piensa: 1.1, elige: 0.8 },
    dificil: { ang: 0.008, fuerza: 0.012, tiros: 1, rollouts: 420, piensa: 0.8, elige: 1 },
  };
  const nivelDe = (n) => NIVELES[n] || NIVELES.normal;

  // ── El mundo de prueba ──
  const sinCola = (s) => { const o = {}; for (const k in s) if (k !== 'cola' && k !== 'J' && typeof s[k] !== 'function') o[k] = s[k]; return o; };
  function clonar(s) { const n = new M.Serpiente(0, 0); Object.assign(n, JSON.parse(JSON.stringify(sinCola(s)))); n.cola = []; return n; }
  function mundo(J, serps, cosas) {
    const W = M.nuevoJuego(J.T, { rompe: false });
    W.serps = serps; W.cosas = cosas || []; W.viento = J.viento || 0; W.mecha = J.mecha || 3; W.rebote = J.rebote || 'min';
    return W;
  }
  const VUELA = (g) => { const a = A[g.tipo]; return !!(a && (a.choque || a.mecha)); };
  // un paso solo de lo que vuela (si el motor lo exporta; si no, el paso entero)
  const pasoCosas = (W) => (M.pasoCosas ? M.pasoCosas(W) : M.pasoJuego(W, []));

  // el puntaje de lo que paso: daño a los otros equipos (y si se mueren, mas), menos el propio (mucho menos)
  function puntaje(serps, vida0, yo) {
    let p = 0;
    serps.forEach((o, i) => {
      if (vida0[i] <= 0) return;
      const queda = o.estado === 'muerta' ? 0 : Math.max(0, o.vida);
      const v = (vida0[i] - queda) + (queda <= 0 ? 50 : 0);
      if (!v) return;
      if (o.eq === yo.eq) p -= v * (o === yo ? 4 : 2); else p += v;
    });
    return p;
  }

  // probar una jugada de ataque: acc = { arma, dir, ang, carga, mecha, x, y }. completa: tambien mueve a las
  // serpientes despues (para ver si alguna termina en el agua o se mata de la caida)
  function probar(J, s, acc, completa) {
    const idx = J.serps.indexOf(s);
    const serps = J.serps.map(clonar), yo = serps[idx];
    const cosas = J.cosas.filter(g => g.tipo === 'barril' || g.tipo === 'mina' || g.tipo === 'caja' || g.tipo === 'lapida').map(g => ({ ...g }));
    const W = mundo(J, serps, cosas);
    if (acc.mecha) W.mecha = acc.mecha;
    const vida0 = serps.map(o => (o.estado === 'muerta' ? 0 : o.vida));
    yo.dir = acc.dir; yo.mira = acc.ang;
    const a = acc.arma;
    if (a === 'escopeta') { M.escopetazo(W, yo); M.escopetazo(W, yo); }
    else if (a === 'bate') M.batazo(W, yo);
    else if (a === 'aereo') M.ataqueAereo(W, yo, acc.x, acc.y, acc.dir);
    else if (a === 'dinamita' || a === 'mina') M.poner(W, yo, a);
    else if (a === 'puno') M.punetazo(W, yo);
    else M.lanzar(W, yo, acc.carga, a);
    if (!completa && a !== 'puno' && a !== 'dinamita' && a !== 'mina') {
      for (let k = 0; k < 800 && W.cosas.some(VUELA); k++) pasoCosas(W);
    } else {
      // (con la dinamita o la mina, la serpiente se aleja caminando durante la retirada)
      const lejos = a === 'dinamita' || a === 'mina' ? { izq: yo.dir > 0, der: yo.dir < 0 } : {};
      for (let k = 0; k < 900; k++) {
        const e = J.serps.map((o, i) => (i === idx && k < 250 ? lejos : {}));
        M.pasoJuego(W, e);
        if (k > 30 && !W.cosas.some(VUELA) && M.quieto(W)) break;
      }
    }
    let p = puntaje(serps, vida0, yo);
    if (p === 0) {
      const rivales = serps.filter((o, i) => vida0[i] > 0 && o.eq !== yo.eq);
      let dmin = Infinity;
      for (const ev of W.eventos) {
        if (ev.tipo !== 'explosion') continue;
        const ex = ev.x, ey = ev.y;
        for (const o of rivales) dmin = Math.min(dmin, Math.hypot(o.x - ex, o.y - ey));
      }
      if (Number.isFinite(dmin)) p = 0.99 * (1 - Math.min(1, dmin / 700));
    }
    return p;
  }

  // ── Buscar el mejor ataque desde donde esta ──
  // armas: lista de las que puede usar. Devuelve { arma, dir, ang, carga, mecha, x, y, puntos }
  function* buscarAtaque(J, s, armas, nivel) {
    const N = nivelDe(nivel), cands = [];
    const enemigos = J.serps.filter(o => o.estado !== 'muerta' && o.eq !== s.eq);
    if (!enemigos.length) return null;
    const cerca = enemigos.some(o => Math.abs(o.x - s.x) < 26 && Math.abs(o.y - s.y) < 20);
    const pasoA = 0.07 / Math.max(0.5, N.tiros), pasoF = 0.1 / Math.max(0.5, N.tiros);
    for (const arma of armas) {
      if (arma === 'bazooka' || arma === 'granada' || arma === 'racimo' || arma === 'mandarina' || arma === 'granadota') {
        const mechas = arma === 'granada' || arma === 'racimo' || arma === 'mandarina' ? [J.mecha || 3, 2, 4] : [null];
        for (const dir of [-1, 1]) for (let ang = -1.45; ang <= 1.0; ang += pasoA) for (let carga = 0.25; carga <= 1.001; carga += pasoF) for (const mecha of mechas) cands.push({ arma, dir, ang, carga, mecha });
      } else if (arma === 'escopeta') {
        for (const dir of [-1, 1]) for (let ang = -1.5; ang <= 1.5; ang += 0.03) cands.push({ arma, dir, ang });
      } else if ((arma === 'bate' || arma === 'puno' || arma === 'dinamita') && cerca) {
        for (const dir of [-1, 1]) for (const ang of arma === 'bate' ? [-0.9, -0.6, -0.3, 0] : [0]) cands.push({ arma, dir, ang });
      } else if (arma === 'aereo') {
        for (const o of enemigos) for (const dir of [-1, 1]) cands.push({ arma, dir, ang: 0, x: o.x, y: o.y });
      }
    }
    // mezclados (asi, si se corta antes, lo que probo esta repartido) y por tandas
    for (let i = cands.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [cands[i], cands[j]] = [cands[j], cands[i]]; }
    let k = 0, rapido = null;
    for (const c of cands) {
      c.puntos = probar(J, s, c, c.arma === 'puno');
      if (c.puntos > 0 && (!rapido || c.puntos > rapido.puntos)) rapido = c;
      if (++k % 25 === 0) yield { parcial: rapido };
    }
    // los mejores, otra vez con todo (serpientes que vuelan, agua, caidas), y alrededor de los mejores, mas fino
    cands.sort((a, b) => b.puntos - a.puntos);
    const top = cands.slice(0, 6).filter(c => c.puntos > 0);
    const finos = [];
    for (const c of top) {
      if (c.carga == null) { finos.push(c); continue; }
      for (const da of [-pasoA / 2, 0, pasoA / 2]) for (const df of [-pasoF / 2, 0, pasoF / 2]) finos.push({ ...c, ang: c.ang + da, carga: Math.min(1, Math.max(0.1, c.carga + df)) });
    }
    let mejor = null;
    for (const c of finos) {
      c.puntos = probar(J, s, c, true);
      if (!mejor || c.puntos > mejor.puntos) mejor = c;
      if (++k % 4 === 0) yield { parcial: mejor && mejor.puntos > 0 ? mejor : rapido };
    }
    if (!mejor || mejor.puntos <= 0) return null;
    const buenos = finos.filter(c => c.puntos >= mejor.puntos * N.elige);
    return buenos.length ? buenos[Math.floor(Math.random() * buenos.length)] : mejor;
  }

  // ── Caminar a otro lugar (modo normal, cuando desde aca no hay buen tiro) ──
  // devuelve las posiciones a las que llega caminando para cada lado: [{ pasos, dir, x, y }]
  function lugaresCaminando(J, s) {
    const out = [];
    for (const d of [-1, 1]) for (const salta of [false, true]) {
      const yo = clonar(s), W = mundo(J, [yo]), pasos = [];
      const e = d < 0 ? { izq: true } : { der: true };
      for (let k = 1; k <= 400; k++) {
        // (saltando: cada tanto, un salto para adelante, para salir de los pozos y subir escalones altos)
        const ent = salta && k % 45 === 0 && yo.estado === 'suelo' ? { enter: true } : e;
        pasos.push(ent); M.pasoJuego(W, [ent]);
        if (yo.estado === 'muerta' || yo.vida < s.vida || yo.y > J.T.agua - 40) break;
        if (k % 25 === 0 && yo.estado === 'suelo') out.push({ pasos: pasos.slice(), x: yo.x, y: yo.y });
      }
    }
    return out;
  }

  // ── La soga (Shopper): llegar a una caja ──
  // objetivos: [{x, y}] (cajas quietas). Devuelve { pasos: [entradas], llega: bool, dist } o null
  const TECLA = (h, v) => ({ izq: h < 0, der: h > 0, arr: v < 0, aba: v > 0 });
  function plan() {
    // apuntar (solo en el piso), quizas saltar, tirar la soga, y 1 a 3 tramos de balanceo con soltar y volver a tirar
    const R = Math.random;
    const p = { dir: R() < 0.5 ? -1 : 1, ang: -0.2 - R() * 1.35, salto: R() < 0.35 ? (R() < 0.5 ? 'enter' : 'retro') : null, espera: 4 + Math.floor(R() * 26), tramos: [] };
    const nt = 1 + Math.floor(R() * 3);
    for (let i = 0; i < nt; i++) p.tramos.push({ h: R() < 0.8 ? (R() < 0.5 ? -1 : 1) : 0, v: R() < 0.45 ? (R() < 0.6 ? -1 : 1) : 0, nv: Math.floor(R() * 60), n: 15 + Math.floor(R() * 140), aire: 2 + Math.floor(R() * 25), suelta: i < nt - 1 || R() < 0.6 });
    return p;
  }
  // corre un plan en el mundo de prueba; devuelve el resultado y las entradas paso a paso
  function correr(J, s, p, objetivos, maxPasos) {
    const yo = clonar(s), W = mundo(J, [yo]), pasos = [];
    let mejor = Infinity, llego = -1;
    const vida0 = yo.vida;
    const dar = (e) => {
      pasos.push(e); M.pasoJuego(W, [e]);
      for (const o of objetivos) {
        const dx = Math.abs(o.x - yo.x), dy = Math.abs(o.y - yo.y);
        if (dx < 12 && dy < 16 && llego < 0) llego = pasos.length;
        mejor = Math.min(mejor, Math.hypot(dx, dy));
      }
      return yo.estado !== 'muerta';
    };
    // girar y apuntar en el piso
    if (yo.estado === 'suelo') {
      if (yo.dir !== p.dir) dar(p.dir < 0 ? { izq: true } : { der: true });
      while (Math.abs(yo.mira - p.ang) > C.MIRA && pasos.length < 120) if (!dar(yo.mira > p.ang ? { arr: true } : { aba: true })) break;
      if (p.salto) { dar(p.salto === 'enter' ? { enter: true } : { retro: true }); for (let i = 0; i < p.espera; i++) dar({}); }
    }
    if (yo.estado !== 'soga') dar({ soga: true });
    for (const t of p.tramos) {
      // esperar a que enganche (el gancho vuela unos pasos)
      for (let i = 0; i < 30 && yo.estado !== 'soga' && yo.gancho && llego < 0; i++) if (!dar({})) break;
      for (let i = 0; i < t.n && yo.estado === 'soga' && llego < 0 && pasos.length < maxPasos; i++) if (!dar(TECLA(t.h, i < t.nv ? t.v : 0))) break;
      if (yo.estado === 'soga' && !t.suelta) break;
      if (yo.estado === 'soga') dar({ soga: true });
      for (let i = 0; i < t.aire && yo.estado === 'aire' && llego < 0; i++) if (!dar({})) break;
      if (llego >= 0 || yo.estado !== 'aire' || yo.sinControl) break;
      dar({ soga: true });
    }
    // despues: que pasa si no hace nada mas (o suelta la soga)? Tiene que terminar a salvo
    const corte = llego >= 0 ? llego : pasos.length;
    // (colgada: queda ahi y la etapa siguiente sigue desde ahi; si no, cae hasta el piso)
    const yo2 = clonar(yo), W2 = mundo(J, [yo2]);
    if (yo2.estado !== 'soga') for (let i = 0; i < 250 && yo2.estado !== 'suelo' && yo2.estado !== 'muerta'; i++) M.pasoJuego(W2, [{}]);
    const seguro = yo.estado !== 'muerta' && yo2.estado !== 'muerta' && yo2.y < J.T.agua - 30 && yo2.vida >= vida0 && (yo2.estado === 'suelo' || yo2.estado === 'soga');
    const finDist = Math.min(...objetivos.map(o => Math.hypot(o.x - yo2.x, o.y - yo2.y)));
    return { pasos: pasos.slice(0, corte), llega: llego >= 0, dist: mejor, seguro, fin: { x: yo2.x, y: yo2.y }, finDist };
  }
  // variar un poco un plan (para afinar uno que casi llega)
  function variar(p) {
    const R = Math.random, q = JSON.parse(JSON.stringify(p)), ent = (v, d, lo, hi) => Math.max(lo, Math.min(hi, Math.round(v + (R() - 0.5) * 2 * d)));
    const cual = Math.floor(R() * 4);
    if (cual === 0) q.ang = Math.max(-1.55, Math.min(-0.15, q.ang + (R() - 0.5) * 0.25));
    else if (cual === 1) q.espera = ent(q.espera, 6, 0, 40);
    else {
      const t = q.tramos[Math.floor(R() * q.tramos.length)];
      t.n = ent(t.n, 25, 5, 220); t.aire = ent(t.aire, 6, 1, 40); t.nv = ent(t.nv, 15, 0, 80);
      if (R() < 0.2) t.h = Math.floor(R() * 3) - 1;
      if (R() < 0.2) t.v = Math.floor(R() * 3) - 1;
      if (R() < 0.1) t.suelta = !t.suelta;
      if (R() < 0.15 && q.tramos.length < 4) q.tramos.push(plan().tramos[0]);
    }
    return q;
  }
  // previo: pasos sin tocar nada antes de empezar (colgada se sigue balanceando mientras la maquina piensa: el plan
  // sale de donde va a estar)
  function adelantar(J, s, previo) {
    if (!previo) return s;
    const yo = clonar(s), W = mundo(J, [yo]);
    for (let i = 0; i < previo; i++) M.pasoJuego(W, [{}]);
    return yo;
  }
  function* buscarSoga(J, s, objetivos, nivel, previo) {
    s = adelantar(J, s, previo);
    const N = nivelDe(nivel), d0 = Math.min(...objetivos.map(o => Math.hypot(o.x - s.x, o.y - s.y)));
    // el valor: llegar (cuanto antes mejor); si no, acercarse (lo mas cerca que paso y donde termina parada)
    const valor = (r) => (r.seguro ? 0 : -1e5) + (r.llega ? 5000 - r.pasos.length : -r.dist - 0.6 * r.finDist);
    const prob = [];
    for (let k = 0; k < N.rollouts; k++) {
      const p = plan(), r = correr(J, s, p, objetivos, 700); r.plan = p; r.valor = valor(r); prob.push(r);
      if (k % 6 === 5) { const m = prob.reduce((a, b) => (b.valor > a.valor ? b : a)); yield { parcial: listo(m, d0) }; }
    }
    prob.sort((a, b) => b.valor - a.valor);
    let mejor = prob[0];
    // afinar las mejores
    for (const base of prob.slice(0, 5)) {
      let actual = base;
      for (let k = 0; k < Math.round(N.rollouts / 6); k++) {
        const p = variar(actual.plan), r = correr(J, s, p, objetivos, 700); r.plan = p; r.valor = valor(r);
        if (r.valor > actual.valor) actual = r;
        if (k % 6 === 5) yield { parcial: listo(actual.valor > mejor.valor ? actual : mejor, d0) };
      }
      if (actual.valor > mejor.valor) mejor = actual;
      if (mejor.llega && mejor.seguro) break;
    }
    return listo(mejor, d0);
  }
  // (si no mejora en nada lo que hay, no conviene moverse)
  function listo(r, d0) { r.mejora = r.seguro && (r.llega || r.finDist < d0 - 20); return r; }
  // bajar a salvo de la soga o del aire (despues de agarrar la caja): soltar en el mejor momento
  function* buscarBajar(J, s, previo) {
    s = adelantar(J, s, previo);
    let mejor = null;
    for (let k = 0; k < 80; k++) {
      const h = Math.floor(Math.random() * 3) - 1, n = Math.floor(Math.random() * 160);
      const yo = clonar(s), W = mundo(J, [yo]), pasos = [];
      for (let i = 0; i < n && yo.estado === 'soga'; i++) { const e = TECLA(h, 0); pasos.push(e); M.pasoJuego(W, [e]); }
      if (yo.estado === 'soga') { pasos.push({ soga: true }); M.pasoJuego(W, [{ soga: true }]); }
      let i = 0;
      for (; i < 400 && yo.estado !== 'suelo' && yo.estado !== 'muerta'; i++) { pasos.push({}); M.pasoJuego(W, [{}]); }
      const ok = yo.estado === 'suelo' && yo.y < J.T.agua - 30;
      const v = (ok ? 1000 : -1000) - (s.vida - yo.vida) * 20 - pasos.length * 0.2;
      if (!mejor || v > mejor.v) mejor = { v, pasos, ok };
      if (k % 8 === 7) yield { parcial: mejor };
    }
    return mejor;
  }

  // el error de la maquina al ejecutar (segun el nivel)
  function errar(acc, nivel) {
    const N = nivelDe(nivel), g = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
    const o = { ...acc };
    if (o.ang != null && o.arma !== 'aereo') o.ang = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, o.ang + g() * N.ang));
    if (o.carga != null) o.carga = Math.max(0.1, Math.min(1, o.carga * (1 + g() * N.fuerza)));
    if (o.arma === 'aereo') o.x += g() * N.ang * 300;
    return o;
  }

  const API = { NIVELES, buscarAtaque, buscarSoga, buscarBajar, lugaresCaminando, errar, probar, clonar };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else raiz.ShoppaIA = API;
})(typeof window !== 'undefined' ? window : globalThis);
