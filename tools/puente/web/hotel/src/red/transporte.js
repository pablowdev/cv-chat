// La capa de red del hotel: usa el socket de CV Chat (window.parent.app.socket), el mismo del chat.
//
//  - Haven corta a quien manda mas de 60 eventos cada 10 s sumando todo el chat, asi que el hotel
//    no manda mas de contrato.TOPES.CLIENTE (20 cada 10 s). Lo que se pasa se descarta con un error
//    (caminar, mirar, escribir) o espera su turno si es importante (hola, entrar, salir, perfil, sigo).
//  - Cada pedido se valida con contrato.validar antes de salir: si esta mal, ni se manda.
//  - Los oyentes se registran aca y se sueltan todos juntos en `pagehide` (el socket sobrevive
//    al iframe del hotel: si no se sueltan, quedan colgados en la ventana del chat).
//  - Si el socket se reconecta, avisa con alReconectar despues de 3 a 4,5 s (TOPES.REENTRAR_MS),
//    para que no vuelvan a entrar todos juntos.
//
// Sin dependencias del DOM: se prueba en node (pruebas/hotel/transporte.prueba.js).

export const ERROR_SIN_CONEXION = 'Sin conexión con CV Chat.';
export const ERROR_TOPE = 'Pará un poco: estás mandando muchas cosas juntas.';
export const ERROR_SIN_RESPUESTA = 'No respondió el servidor.';

export function crearTransporte(o) {
  const C = o.contrato;
  const obtenerSocket = o.obtenerSocket;
  const ahora = o.ahora || (() => Date.now());
  const temporizar = o.temporizar || ((fn, ms) => setTimeout(fn, ms));
  const azar = o.azar || Math.random;
  const tope = C.TOPES.CLIENTE;            // { eventos: 20, ms: 10000 }
  // lo importante puede esperar hasta que se libere toda la ventana (y un poco mas)
  const esperaMax = o.esperaMax == null ? tope.ms + 1000 : o.esperaMax;
  const timeoutMs = o.timeoutMs == null ? 8000 : o.timeoutMs;
  // Los que esperan turno en vez de descartarse.
  const PRIORIDAD = new Set([C.EV.HOLA, C.EV.ENTRAR, C.EV.SALIR, C.EV.PERFIL, C.EV.SIGO, C.EV.AUSENTE, C.EV.NAV,
    C.EV.SALA_CREAR, C.EV.SALA_EDITAR, C.EV.SALA_BORRAR, C.EV.PONER, C.EV.LEVANTAR, C.EV.DENUNCIAR]);

  let enviados = [];          // momentos de los ultimos envios (ventana deslizante)
  let cola = [];              // { ev, datos, ok, hasta }
  let colaTimer = null;
  let socketAtado = null;     // el socket al que estan pegados los oyentes
  const oyentes = [];         // { ev, fn, envoltura }
  const alReconectar = [];
  const alCaer = [];
  let vivo = true;

  function socket() {
    let s = null;
    try { s = obtenerSocket(); } catch (e) { s = null; }
    if (s !== socketAtado) atar(s);
    return s;
  }

  function alConectarse() {
    const [a, b] = C.TOPES.REENTRAR_MS;
    const ms = Math.round(a + azar() * (b - a));
    temporizar(() => { if (vivo) for (const fn of alReconectar.slice()) { try { fn(); } catch (e) { /* sigue */ } } }, ms);
  }
  function alDesconectarse() { for (const fn of alCaer.slice()) { try { fn(); } catch (e) { /* sigue */ } } }

  // Pega (o despega) los oyentes al socket actual.
  function atar(s) {
    if (socketAtado && typeof socketAtado.off === 'function') {
      for (const x of oyentes) socketAtado.off(x.ev, x.envoltura);
      socketAtado.off('connect', alConectarse);
      socketAtado.off('disconnect', alDesconectarse);
    }
    socketAtado = s || null;
    if (socketAtado && typeof socketAtado.on === 'function' && vivo) {
      for (const x of oyentes) socketAtado.on(x.ev, x.envoltura);
      socketAtado.on('connect', alConectarse);
      socketAtado.on('disconnect', alDesconectarse);
    }
  }

  function limpiarVentana() {
    const t = ahora() - tope.ms;
    while (enviados.length && enviados[0] <= t) enviados.shift();
  }
  function hayLugar() { limpiarVentana(); return enviados.length < tope.eventos; }
  function msHastaLugar() { limpiarVentana(); return enviados.length < tope.eventos ? 0 : Math.max(1, enviados[0] + tope.ms - ahora() + 1); }

  function mandarYa(ev, datos) {
    const s = socket();
    if (!s || s.connected === false) return Promise.resolve({ error: ERROR_SIN_CONEXION });
    enviados.push(ahora());
    return new Promise((resolver) => {
      let listo = false;
      const fin = (r) => { if (listo) return; listo = true; resolver(r && typeof r === 'object' ? r : { error: C.ERROR_GENERAL }); };
      temporizar(() => fin({ error: ERROR_SIN_RESPUESTA }), timeoutMs);
      try { s.emit(ev, datos, fin); } catch (e) { fin({ error: ERROR_SIN_CONEXION }); }
    });
  }

  function atenderCola() {
    colaTimer = null;
    while (cola.length) {
      const x = cola[0];
      if (ahora() > x.hasta) { cola.shift(); x.ok({ error: ERROR_TOPE }); continue; }
      if (!hayLugar()) break;
      cola.shift();
      mandarYa(x.ev, x.datos).then(x.ok);
    }
    if (cola.length && !colaTimer) colaTimer = temporizar(atenderCola, msHastaLugar());
  }

  // emitir(evento, datos) -> Promise<{ok,...} | {error}>
  function emitir(ev, datos) {
    if (!vivo) return Promise.resolve({ error: ERROR_SIN_CONEXION });
    const v = C.validar(ev, datos || {});
    if (v.error) return Promise.resolve({ error: v.error });
    if (hayLugar() && !cola.length) return mandarYa(ev, v.datos);
    if (!PRIORIDAD.has(ev)) return Promise.resolve({ error: ERROR_TOPE });
    return new Promise((ok) => {
      cola.push({ ev, datos: v.datos, ok, hasta: ahora() + esperaMax });
      if (!colaTimer) colaTimer = temporizar(atenderCola, msHastaLugar());
    });
  }

  // escuchar(evento, fn) -> funcion para dejar de escuchar
  function escuchar(ev, fn) {
    const x = { ev, fn, envoltura: (d) => { try { fn(d); } catch (e) { if (o.alError) o.alError(e); } } };
    socket(); // primero se pega lo que ya estaba (si el socket cambio)
    oyentes.push(x);
    if (socketAtado && typeof socketAtado.on === 'function') socketAtado.on(ev, x.envoltura);
    return () => {
      const i = oyentes.indexOf(x);
      if (i >= 0) oyentes.splice(i, 1);
      if (socketAtado && typeof socketAtado.off === 'function') socketAtado.off(ev, x.envoltura);
    };
  }

  // Suelta todo (pagehide). Despues de esto el transporte no manda mas nada.
  function soltarTodo() {
    atar(null);
    oyentes.length = 0;
    alReconectar.length = 0;
    alCaer.length = 0;
    for (const x of cola) x.ok({ error: ERROR_SIN_CONEXION });
    cola = [];
    vivo = false;
  }

  return {
    emitir,
    escuchar,
    soltarTodo,
    alReconectar: (fn) => { socket(); alReconectar.push(fn); },
    alCaer: (fn) => { socket(); alCaer.push(fn); },
    conectado: () => { const s = socket(); return !!s && s.connected !== false; },
    // para las pruebas
    _enVentana: () => { limpiarVentana(); return enviados.length; },
    _enCola: () => cola.length,
    _oyentes: () => oyentes.length,
  };
}

// El socket de CV Chat desde adentro del iframe (otro origen o sin chat: null).
export function socketDelChat() {
  try {
    const p = window.parent;
    if (!p || p === window) return null;
    return (p.app && p.app.socket) || null;
  } catch (e) {
    return null;
  }
}
