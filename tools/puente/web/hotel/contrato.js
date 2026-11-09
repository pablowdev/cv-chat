// CV Hotel: el contrato entre el cliente y el servidor. Es la unica fuente de los nombres de los
// eventos, las salas de socket.io, los topes y la forma de cada pedido que manda el cliente.
// Lo cargan los tres lados: el servidor (tools/puente/hotel.js, con require), el cliente
// (web/hotel/, como window.HotelContrato) y el servidor falso de las pruebas.
//
// Sin dependencias y sin pantalla. Las validaciones de aca son solo de FORMA (tipos, largos,
// rangos, claves de mas): lo que depende de la base o de la sala (permisos, capacidad, que el
// mueble sea tuyo, que el muñeco use colores que existen) lo revisa el servidor despues, con
// motor.js y con la base.
//
// validar(evento, datos) -> { ok:true, datos:<copia limpia> }  o  { error:'texto en voseo' }
(function (raiz) {
  'use strict';

  // ===== Eventos =====

  // Cliente -> servidor (todos contestan por el ack con {ok:true,...} o {error}).
  const A_SERVIDOR = {
    // fase 1
    HOLA: 'hotel:hola',
    PERFIL: 'hotel:perfil',
    SIGO: 'hotel:sigo',
    AUSENTE: 'hotel:ausente',
    SALIR: 'hotel:salir',
    SALAS: 'hotel:salas',
    NAV: 'hotel:nav',
    SALA_CREAR: 'hotel:sala_crear',
    SALA_EDITAR: 'hotel:sala_editar',
    SALA_BORRAR: 'hotel:sala_borrar',
    ENTRAR: 'hotel:entrar',
    IR: 'hotel:ir',
    MIRAR: 'hotel:mirar',
    DECIR: 'hotel:decir',
    ESCRIBE: 'hotel:escribe',
    GESTO: 'hotel:gesto',
    PEDIR: 'hotel:pedir',
    INVENTARIO: 'hotel:inventario',
    PONER: 'hotel:poner',
    MOVER: 'hotel:mover',
    ROTAR: 'hotel:rotar',
    USAR: 'hotel:usar',
    LEVANTAR: 'hotel:levantar',
    PINTAR: 'hotel:pintar',
    DERECHOS: 'hotel:derechos',
    ECHAR: 'hotel:echar',
    VETAR: 'hotel:vetar',
    FICHA: 'hotel:ficha',
    DENUNCIAR: 'hotel:denunciar',
    MOD: 'hotel:mod',
    // fase 3 (monedas)
    COMPRAR: 'hotel:comprar',
    // fase 4 (intercambios)
    TRATO_PEDIR: 'hotel:trato_pedir',
    TRATO_RESPONDER: 'hotel:trato_responder',
    TRATO_OFRECER: 'hotel:trato_ofrecer',
    TRATO_LISTO: 'hotel:trato_listo',
    TRATO_CONFIRMAR: 'hotel:trato_confirmar',
    TRATO_CANCELAR: 'hotel:trato_cancelar',
    // fase 5 (comunidad)
    PROPUESTAS: 'hotel:propuestas',
    PROPUESTA_GUARDAR: 'hotel:propuesta_guardar',
    PROPUESTA_ENVIAR: 'hotel:propuesta_enviar',
    PROPUESTA_BORRAR: 'hotel:propuesta_borrar',
    // fase 6 (notas en la pared; la forma es provisoria, sale de la seccion D del plan)
    NOTA_PEGAR: 'hotel:nota_pegar',
    NOTA_ESCRIBIR: 'hotel:nota_escribir',
    NOTA_BORRAR: 'hotel:nota_borrar',
  };

  // Servidor -> una persona (a sus sockets).
  const A_PERSONA = {
    FUERA: 'hotel:fuera',                         // {motivo, ms?}
    MONEDAS: 'hotel:monedas',                     // {monedas, delta, tipo}
    INVENTARIO_CAMBIO: 'hotel:inventario_cambio', // {mas, menos}
    TRATO: 'hotel:trato',
    PROPUESTA: 'hotel:propuesta',                 // {id, estado}
    AVISO: 'hotel:aviso',                         // {texto}
  };

  // Servidor -> la sala (hotel:s:<id>). Todos traen `sala` (el slug).
  const A_SALA = {
    JUGADOR: 'hotel:jugador',   // {sala,u,avatar,estado}
    AUSENTE: 'hotel:ausente',   // {sala,u,si}
    SE_VA: 'hotel:se_va',       // {sala,u}
    SALA: 'hotel:sala',         // {sala,meta}
    LLEGA: 'hotel:llega',       // {sala,j}
    MOV: 'hotel:mov',           // {sala,u,x,y,c,dx,dy}
    SIENTA: 'hotel:sienta',     // {sala,u,m,s,d,ox,oy}
    CABEZA: 'hotel:cabeza',     // {sala,u,d,ms}
    DIJO: 'hotel:dijo',         // {sala,id,u,texto,t}
    ESCRIBE: 'hotel:escribe',   // {sala,u,si}
    GESTO: 'hotel:gesto',       // {sala,u,tipo}
    MUEBLE: 'hotel:mueble',     // {sala,m,clave,rec}  (rec:null = se fue)
    LATA: 'hotel:lata',         // {sala,u,ms}
    DERECHOS: 'hotel:derechos', // {sala,lista}
    BORRADO: 'hotel:borrado',   // {sala,id}
  };

  // Servidor -> los que tienen el navegador de salas abierto (hotel:nav).
  const A_NAV = {
    CONTEOS: 'hotel:conteos',   // {slug:n}, cada 3 s como mucho
  };

  // Servidor -> todos los que estan en el hotel (hotel:todos). Nunca io.emit a todo el chat.
  const A_TODOS = {
    CATALOGO_CAMBIO: 'hotel:catalogo_cambio', // {v}
    AVISO: 'hotel:aviso',                     // el anuncio del equipo (hotel:mod accion 'anuncio')
  };

  // Todos juntos. Algunos nombres van en los dos sentidos con datos distintos (ausente, escribe,
  // gesto, derechos): el cliente emite {si} y escucha {sala,u,si}. El servidor falso no tiene
  // que devolverle a quien emitio su propio evento como si fuera el aviso.
  const EV = Object.assign({}, A_SERVIDOR, A_PERSONA, A_SALA, A_NAV, A_TODOS);

  // Quien puede mandar cada evento y en que fase entra. quien: 'cuenta' (cuenta de CV que no es
  // invitado), 'jugador' (cuenta con personaje, no baneada), 'en_sala', 'equipo', 'parte' (de un
  // trato), 'gestor' (dueño de la sala, derechos o equipo; cada manejador afina).
  // cubeta: el nombre de la cubeta de TOPES.CUBETAS que gasta.
  const REGLAS = {};
  function regla(ev, fase, quien, cubeta) { REGLAS[ev] = Object.freeze({ fase: fase, quien: quien, cubeta: cubeta || 'general' }); }
  const S = A_SERVIDOR;
  regla(S.HOLA, 1, 'cuenta'); regla(S.PERFIL, 1, 'cuenta'); regla(S.SIGO, 1, 'en_sala', 'latido');
  regla(S.AUSENTE, 1, 'en_sala'); regla(S.SALIR, 1, 'jugador'); regla(S.SALAS, 1, 'jugador');
  regla(S.NAV, 1, 'jugador'); regla(S.SALA_CREAR, 1, 'jugador', 'sala_crear');
  regla(S.SALA_EDITAR, 1, 'gestor'); regla(S.SALA_BORRAR, 1, 'gestor'); regla(S.ENTRAR, 1, 'jugador');
  regla(S.IR, 1, 'en_sala', 'ir'); regla(S.MIRAR, 1, 'en_sala', 'mirar'); regla(S.DECIR, 1, 'en_sala', 'decir');
  regla(S.ESCRIBE, 1, 'en_sala', 'escribe'); regla(S.GESTO, 1, 'en_sala'); regla(S.PEDIR, 1, 'jugador');
  regla(S.INVENTARIO, 1, 'jugador'); regla(S.PONER, 1, 'gestor', 'muebles'); regla(S.MOVER, 1, 'gestor', 'muebles');
  regla(S.ROTAR, 1, 'gestor', 'muebles'); regla(S.USAR, 1, 'en_sala', 'usar'); regla(S.LEVANTAR, 1, 'gestor', 'muebles');
  regla(S.PINTAR, 1, 'gestor'); regla(S.DERECHOS, 1, 'gestor'); regla(S.ECHAR, 1, 'gestor'); regla(S.VETAR, 1, 'gestor');
  regla(S.FICHA, 1, 'jugador'); regla(S.DENUNCIAR, 1, 'jugador', 'denunciar'); regla(S.MOD, 1, 'equipo');
  regla(S.COMPRAR, 3, 'jugador');
  regla(S.TRATO_PEDIR, 4, 'en_sala', 'trato_par'); regla(S.TRATO_RESPONDER, 4, 'parte'); regla(S.TRATO_OFRECER, 4, 'parte');
  regla(S.TRATO_LISTO, 4, 'parte'); regla(S.TRATO_CONFIRMAR, 4, 'parte'); regla(S.TRATO_CANCELAR, 4, 'parte');
  regla(S.PROPUESTAS, 5, 'jugador'); regla(S.PROPUESTA_GUARDAR, 5, 'jugador'); regla(S.PROPUESTA_ENVIAR, 5, 'jugador');
  regla(S.PROPUESTA_BORRAR, 5, 'jugador');
  regla(S.NOTA_PEGAR, 6, 'gestor', 'muebles'); regla(S.NOTA_ESCRIBIR, 6, 'en_sala', 'muebles'); regla(S.NOTA_BORRAR, 6, 'en_sala', 'muebles');

  function eventosDeFase(f) { return Object.keys(REGLAS).filter(function (e) { return REGLAS[e].fase === f; }); }

  // ===== Salas de socket.io =====
  const SALAS = {
    PREFIJO: 'hotel:s:',
    NAV: 'hotel:nav',
    TODOS: 'hotel:todos',
  };
  // La sala de socket.io usa el id INTERNO (entero), nunca el slug.
  function salaSocket(id) {
    if (typeof id !== 'number' || !Number.isSafeInteger(id) || id < 1) throw new Error('id de sala invalido');
    return SALAS.PREFIJO + id;
  }

  // ===== Ids y formatos =====
  const SLUG_RE = /^[a-z0-9-]{2,20}$/;               // salas: 'principal', 'bar' o 10 hex
  const CATALOGO_RE = /^[a-z0-9_]{2,60}$/;            // ids del catalogo
  const DECO_RE = /^[a-z0-9_-]{1,30}$/;               // patrones y colores de decoracion
  const REF_RE = /^[A-Za-z0-9_:,-]{1,80}$/;           // ref de una denuncia
  const ID_TEXTO_RE = /^[1-9][0-9]{0,14}$/;           // ids enteros que llegan como String()
  // Clave de un mueble de pared: "wall:north|west:tx,ty:ox,oy" (ox,oy en % de la pared, 0-100).
  const PARED_RE = /^wall:(north|west):([0-9]{1,2}),([0-9]{1,2}):([0-9]{1,3}),([0-9]{1,3})$/;
  // Clave de un mueble de piso: "tx,ty".
  const PISO_RE = /^([0-9]{1,2}),([0-9]{1,2})$/;

  function slugValido(s) { return typeof s === 'string' && SLUG_RE.test(s); }

  // ===== Topes =====
  const TOPES = Object.freeze({
    // El cliente no manda mas de 20 eventos cada 10 s en total (transporte.js lo hace cumplir).
    CLIENTE: Object.freeze({ eventos: 20, ms: 10000 }),
    // Haven: corta los mensajes de mas de 64 KB y los usuarios que mandan mas de 60 eventos cada
    // 10 s (cuenta por USUARIO, sumando todo el chat, no solo el hotel).
    HAVEN: Object.freeze({ bytesMensaje: 65536, eventos: 60, ms: 10000, por: 'usuario' }),
    // Lo que puede pesar un pedido (JSON) antes de mirarlo.
    PAYLOAD_BYTES: 8192,
    // Excepcion: el borrador de una propuesta lleva la grilla del dibujo (hasta 64 KB en la base)
    // y tiene que entrar en un mensaje de Haven con el sobre de socket.io.
    PAYLOAD_PROPUESTA_BYTES: 60000,
    // Cubetas del servidor: cada una es una lista de ventanas {n, ms}; hay que entrar en todas.
    CUBETAS: Object.freeze({
      general: Object.freeze([{ n: 5, ms: 1000 }, { n: 20, ms: 10000 }]),
      latido: Object.freeze([{ n: 2, ms: 10000 }]),
      ir: Object.freeze([{ n: 3, ms: 1000 }]),
      decir: Object.freeze([{ n: 1, ms: 700 }, { n: 8, ms: 10000 }]),
      escribe: Object.freeze([{ n: 1, ms: 1000 }]),
      mirar: Object.freeze([{ n: 2, ms: 1000 }]),
      muebles: Object.freeze([{ n: 4, ms: 1000 }, { n: 30, ms: 10000 }]),
      usar: Object.freeze([{ n: 4, ms: 1000 }]),          // por mueble
      sala_crear: Object.freeze([{ n: 1, ms: 30000 }]),
      denunciar: Object.freeze([{ n: 20, ms: 3600000 }]),
      trato_par: Object.freeze([{ n: 1, ms: 10000 }]),    // por par de personas
    }),
    LATIDO_MS: 30000,          // hotel:sigo
    CORTE_MS: 150000,          // sin sigo durante esto, afuera
    AUSENTE_MS: 300000,        // ausente 5 min -> fuera:'ausente'
    GRACIA_VOLVER_MS: 15000,   // entrar con volver:true conserva la posicion
    REENTRAR_MS: Object.freeze([3000, 4500]), // el cliente vuelve a entrar entre 3 y 4,5 s despues de connect
    ESCRIBE_APAGA_MS: 8000,
    CABEZA_MS: 4000,
    LATA_MS: 300000,
    CONTEOS_MS: 3000,
    JUGADOR_CACHE_MS: 60000,
    MS_POR_PASO: 455,          // 2,2 baldosas por segundo
    PASOS_MAX: 256,
    MENSAJES_AL_ENTRAR: 30,
    SALAS_FILAS_MAX: 50,
    DERECHOS_MAX: 30,
    REPETIDO: Object.freeze({ veces: 3, ms: 30000 }), // el mismo texto 3 veces en 30 s, no
    COMPRA_MAX: 10,
    TRATO_ITEMS_MAX: 30,
    TRATO_CONFIRMAR_MS: 3000,
    TRATO_VENCE_MS: 300000,
    PROPUESTAS_PENDIENTES_MAX: 3,
  });

  const LARGOS = Object.freeze({
    texto: 100, estado: 42, nombreSala: 40, descripcion: 140, q: 30, detalle: 500,
    motivoMod: 200, anuncio: 200, nota: 338, nombrePropuesta: 48,
  });

  // ===== Listas fijas =====
  const FUERA = Object.freeze(['puerta', 'echado', 'sala_borrada', 'otra_ventana', 'ausente', 'equipo']);
  const GESTOS = Object.freeze(['saludo', 'aplauso', 'risa', 'baile', 'pensar', 'si', 'no']);
  const FORMAS = Object.freeze(['small', 'rect', 'l_shape', 'hex']);   // las que elige la gente
  const ACCESOS = Object.freeze(['abierta', 'cerrada']);
  const VER_SALAS = Object.freeze(['club', 'gente', 'mias', 'derechos', 'buscar']);
  const TIPOS_DENUNCIA = Object.freeze(['mensaje', 'nota', 'sala', 'mueble', 'propuesta', 'jugador']);
  const MOTIVOS_DENUNCIA = Object.freeze(['menores', 'acoso', 'odio', 'sexual', 'spam', 'otro']); // los de denuncias.js
  const ACCIONES_MOD = Object.freeze(['silenciar', 'quitar_silencio', 'sacar', 'fuera_hotel', 'cerrar_sala',
    'abrir_sala', 'renombrar_sala', 'borrar_nota', 'borrar_mensaje', 'anuncio']);
  const VER_PROPUESTAS = Object.freeze(['mias', 'votacion']);
  const ERROR_GENERAL = 'Algo salió mal.';

  // ===== Validacion =====

  const hasOwn = Object.prototype.hasOwnProperty;
  // Ojo: un literal { '__proto__': 1 } no crea la clave, cambia el prototipo; por eso una funcion.
  function peligrosa(k) { return k === '__proto__' || k === 'constructor' || k === 'prototype'; }
  const DATOS_RAROS = 'Mandaste datos raros.';

  function esPlano(o) {
    if (o === null || typeof o !== 'object' || Array.isArray(o)) return false;
    if (Object.prototype.toString.call(o) !== '[object Object]') return false;
    // El prototipo tiene que ser el Object.prototype de ESTA ventana o de otra (el cliente recibe
    // objetos armados por el socket de la ventana de CV), o null.
    const p = Object.getPrototypeOf(o);
    if (p === null || p === Object.prototype) return true;
    return Object.getPrototypeOf(p) === null && hasOwn.call(p, 'isPrototypeOf') && hasOwn.call(p, 'hasOwnProperty');
  }

  // Recorre un objeto que viene de afuera buscando claves peligrosas, valores que no son JSON
  // o demasiada profundidad. Devuelve true si esta todo bien.
  function sanoProfundo(v, prof, cuenta) {
    if (cuenta.n++ > 20000) return false;
    if (v === null) return true;
    const t = typeof v;
    if (t === 'string' || t === 'boolean') return true;
    if (t === 'number') return Number.isFinite(v);
    if (t !== 'object' || prof > 8) return false;
    if (Array.isArray(v)) {
      for (let i = 0; i < v.length; i++) if (!sanoProfundo(v[i], prof + 1, cuenta)) return false;
      return true;
    }
    if (!esPlano(v)) return false;
    const ks = Object.keys(v);
    for (let i = 0; i < ks.length; i++) {
      if (peligrosa(ks[i])) return false;
      if (!sanoProfundo(v[ks[i]], prof + 1, cuenta)) return false;
    }
    return true;
  }

  // Cuantos bytes ocupa en UTF-8 el JSON (sin armar un Buffer, sirve en los dos lados).
  function bytesJson(v) {
    let s;
    try { s = JSON.stringify(v); } catch (e) { return Infinity; }
    if (typeof s !== 'string') return 0;
    let b = 0;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      if (c < 0x80) b += 1; else if (c < 0x800) b += 2;
      else if (c >= 0xd800 && c <= 0xdbff) { b += 4; i++; } else b += 3;
    }
    return b;
  }

  // Caracteres de control y de formato que no van en ningun texto (deja pasar el ZWJ de los emojis).
  const CONTROLES = /[\u0000-\u001f\u007f-\u009f\u200b\u2028-\u202e\u2060-\u2064\u2066-\u2069\ufeff\ufff9-\ufffb]/;

  // Largo en caracteres (puntos de codigo), o -1 si el texto tiene sustitutos sueltos.
  function largoTexto(s) {
    let n = 0;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      if (c >= 0xd800 && c <= 0xdbff) {
        const d = s.charCodeAt(i + 1);
        if (!(d >= 0xdc00 && d <= 0xdfff)) return -1;
        i++;
      } else if (c >= 0xdc00 && c <= 0xdfff) return -1;
      n++;
    }
    return n;
  }

  // --- Revisores de un campo: devuelven {v} o {e} ---
  function entero(min, max, que) {
    return function (v) {
      if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) return { e: que + ' no es válido.' };
      return { v: v === 0 ? 0 : v };
    };
  }
  function idEntero(que) {
    return function (v) {
      if (typeof v === 'number' && Number.isSafeInteger(v) && v >= 1) return { v: v };
      if (typeof v === 'string' && ID_TEXTO_RE.test(v)) return { v: Number(v) };
      return { e: que + ' no es válido.' };
    };
  }
  function bool(que) {
    return function (v) { return typeof v === 'boolean' ? { v: v } : { e: que + ' no es válido.' }; };
  }
  function siempre(valor, que) {
    return function (v) { return v === valor ? { v: v } : { e: que + ' no es válido.' }; };
  }
  function uno(lista, que) {
    return function (v) { return (typeof v === 'string' && lista.indexOf(v) >= 0) ? { v: v } : { e: que + ' no es válido.' }; };
  }
  function patron(re, que) {
    return function (v) { return (typeof v === 'string' && re.test(v)) ? { v: v } : { e: que + ' no es válido.' }; };
  }
  // texto(que, min, max): sin controles, recortado, largo en caracteres.
  function texto(que, min, max) {
    return function (v) {
      if (typeof v !== 'string') return { e: que + ' no es válido.' };
      if (v.length > max * 2 + 16) return { e: que + ' es demasiado largo.' };
      const t = v.trim();
      if (CONTROLES.test(t)) return { e: que + ' tiene caracteres que no van.' };
      const n = largoTexto(t);
      if (n < 0) return { e: que + ' tiene caracteres que no van.' };
      if (n > max) return { e: que + ' es demasiado largo (hasta ' + max + ').' };
      if (n < min) return { e: min === 1 ? 'Escribí algo.' : que + ' es demasiado corto.' };
      return { v: t };
    };
  }
  function nulable(revisor) {
    return function (v) { return v === null ? { v: null } : revisor(v); };
  }
  function clavePared(que) {
    return function (v) {
      if (typeof v !== 'string') return { e: que + ' no es válida.' };
      const r = PARED_RE.exec(v);
      if (!r) return { e: que + ' no es válida.' };
      const tx = +r[2], ty = +r[3], ox = +r[4], oy = +r[5];
      if (tx > 63 || ty > 63 || ox > 100 || oy > 100) return { e: que + ' no es válida.' };
      return { v: 'wall:' + r[1] + ':' + tx + ',' + ty + ':' + ox + ',' + oy };
    };
  }
  // Objeto plano de enteros chicos con claves de letras (el muñeco). Lo fino lo hace motor.validarAvatar.
  function objetoAvatar(v) {
    if (!esPlano(v)) return { e: 'El muñeco no es válido.' };
    const ks = Object.keys(v);
    if (ks.length > 16) return { e: 'El muñeco no es válido.' };
    const out = {};
    for (let i = 0; i < ks.length; i++) {
      const k = ks[i], x = v[k];
      if (!/^[a-z]{2,12}[VC]$/.test(k)) return { e: 'El muñeco no es válido.' };
      if (typeof x !== 'number' || !Number.isInteger(x) || x < 0 || x > 99) return { e: 'El muñeco no es válido.' };
      out[k] = x;
    }
    return { v: out };
  }
  function objetoLibre(que) {
    return function (v) {
      if (!esPlano(v) || !sanoProfundo(v, 0, { n: 0 })) return { e: que + ' no es válido.' };
      return { v: JSON.parse(JSON.stringify(v)) };
    };
  }
  function listaIds(que, max) {
    return function (v) {
      if (!Array.isArray(v)) return { e: que + ' no es válida.' };
      if (v.length > max) return { e: 'Son demasiados (hasta ' + max + ').' };
      const rev = idEntero(que), out = [], vistos = {};
      for (let i = 0; i < v.length; i++) {
        const r = rev(v[i]);
        if (r.e) return r;
        if (vistos[r.v]) return { e: que + ' tiene repetidos.' };
        vistos[r.v] = 1; out.push(r.v);
      }
      return { v: out };
    };
  }
  function sub(spec, que) {
    return function (v) {
      if (!esPlano(v)) return { e: que + ' no es válido.' };
      const r = revisar(v, spec);
      return r.error ? { e: r.error } : { v: r.datos };
    };
  }
  // pintar: el color de la sala hoy es un indice (default {"color":0}) y en la decoracion es un id.
  function colorDeco(v) {
    if (typeof v === 'number') return entero(0, 999, 'El color')(v);
    return patron(DECO_RE, 'El color')(v);
  }

  // spec: { campo: [revisor, opcional?] }
  function revisar(d, spec, extra) {
    const ks = Object.keys(d);
    for (let i = 0; i < ks.length; i++) {
      if (peligrosa(ks[i])) return { error: DATOS_RAROS };
      if (!hasOwn.call(spec, ks[i])) return { error: 'Mandaste datos de más.' };
    }
    const out = {};
    let hay = 0;
    const campos = Object.keys(spec);
    for (let i = 0; i < campos.length; i++) {
      const k = campos[i], rev = spec[k][0], opcional = spec[k][1];
      if (!hasOwn.call(d, k) || d[k] === undefined) {
        if (opcional) continue;
        return { error: 'Falta un dato.' };
      }
      const r = rev(d[k]);
      if (r.e) return { error: r.e };
      out[k] = r.v;
      hay++;
    }
    if (extra && extra.alMenosUno && hay <= (extra.fijos || 0)) return { error: 'No mandaste nada para cambiar.' };
    return { ok: true, datos: out };
  }

  // Varias formas posibles: prueba en orden la que coincide por sus claves.
  function variantes(lista) {
    return function (d) {
      for (let i = 0; i < lista.length; i++) {
        const marca = lista[i][0];
        if (hasOwn.call(d, marca)) return revisar(d, lista[i][1]);
      }
      return { error: 'Faltan datos.' };
    };
  }

  const X = entero(0, 63, 'La baldosa');
  const SALA = patron(SLUG_RE, 'La sala');
  const U = idEntero('La persona');
  const M = idEntero('El mueble');
  const ROT = entero(0, 3, 'El giro');
  const ID = idEntero('El id');
  const VACIO = {};

  const VALIDADORES = {};
  function forma(ev, spec, extra) {
    VALIDADORES[ev] = typeof spec === 'function' ? spec : function (d) { return revisar(d, spec, extra); };
  }
  forma(S.HOLA, VACIO);
  forma(S.PERFIL, { avatar: [objetoAvatar, true], estado: [texto('El estado', 0, LARGOS.estado), true] }, { alMenosUno: true });
  forma(S.SIGO, VACIO);
  forma(S.AUSENTE, { si: [bool('El estado')] });
  forma(S.SALIR, VACIO);
  forma(S.SALAS, function (d) {
    const r = revisar(d, { ver: [uno(VER_SALAS, 'La lista')], q: [texto('La búsqueda', 0, LARGOS.q), true] });
    if (r.error) return r;
    if (r.datos.ver === 'buscar' && !r.datos.q) return { error: 'Escribí qué buscás.' };
    if (r.datos.ver !== 'buscar' && hasOwn.call(r.datos, 'q')) delete r.datos.q;
    return r;
  });
  forma(S.NAV, { abierto: [bool('El navegador')] });
  forma(S.SALA_CREAR, {
    nombre: [texto('El nombre', 1, LARGOS.nombreSala)],
    descripcion: [texto('La descripción', 0, LARGOS.descripcion), true],
    forma: [uno(FORMAS, 'La forma')],
    capacidad: [entero(1, 50, 'La capacidad')],
    acceso: [uno(ACCESOS, 'El acceso')],
  });
  forma(S.SALA_EDITAR, {
    sala: [SALA],
    nombre: [texto('El nombre', 1, LARGOS.nombreSala), true],
    descripcion: [texto('La descripción', 0, LARGOS.descripcion), true],
    capacidad: [entero(1, 50, 'La capacidad'), true],
    acceso: [uno(ACCESOS, 'El acceso'), true],
    avisar_entradas: [bool('El aviso de entradas'), true],
  }, { alMenosUno: true, fijos: 1 });
  forma(S.SALA_BORRAR, { sala: [SALA] });
  forma(S.ENTRAR, { sala: [SALA], volver: [bool('Volver'), true] });
  forma(S.IR, variantes([
    ['x', { x: [X], y: [X] }],
    ['asiento', { asiento: [sub({ m: [M], s: [entero(0, 63, 'El asiento')] }, 'El asiento')] }],
    ['puerta', { puerta: [siempre(true, 'La puerta')] }],
  ]));
  forma(S.MIRAR, variantes([
    ['x', { x: [X], y: [X] }],
    ['u', { u: [U] }],
  ]));
  forma(S.DECIR, { texto: [texto('El mensaje', 1, LARGOS.texto)] });
  forma(S.ESCRIBE, { si: [bool('El estado')] });
  forma(S.GESTO, { tipo: [uno(GESTOS, 'El gesto')] });
  forma(S.PEDIR, { catalogo: [patron(CATALOGO_RE, 'El mueble')] });
  forma(S.INVENTARIO, VACIO);
  const PONER = variantes([
    ['pared', { m: [M], pared: [clavePared('La pared')] }],
    ['x', { m: [M], x: [X], y: [X], rot: [ROT] }],
  ]);
  forma(S.PONER, PONER);
  forma(S.MOVER, PONER);
  forma(S.ROTAR, { m: [M] });
  forma(S.USAR, { m: [M] });
  forma(S.LEVANTAR, { m: [M] });
  forma(S.PINTAR, { tipo: [uno(['pared', 'piso'], 'Lo que pintás')], patron: [patron(DECO_RE, 'El patrón')], color: [colorDeco] });
  forma(S.DERECHOS, { u: [U], dar: [bool('Dar o sacar')] });
  forma(S.ECHAR, { u: [U] });
  forma(S.VETAR, { u: [U], horas: [nulable(entero(1, 8760, 'Las horas')), true] });
  forma(S.FICHA, { u: [U] });
  forma(S.DENUNCIAR, {
    tipo: [uno(TIPOS_DENUNCIA, 'Lo que denunciás')],
    ref: [patron(REF_RE, 'Lo que denunciás')],
    motivo: [uno(MOTIVOS_DENUNCIA, 'El motivo')],
    detalle: [texto('El comentario', 0, LARGOS.detalle), true],
  });
  // hotel:mod: lo que hace falta segun la accion.
  const MOD_PIDE = {
    silenciar: ['u'], quitar_silencio: ['u'], sacar: ['u'], fuera_hotel: ['u'],
    cerrar_sala: ['sala'], abrir_sala: ['sala'], renombrar_sala: ['sala', 'texto'],
    borrar_nota: ['m'], borrar_mensaje: ['msg'], anuncio: ['texto'],
  };
  forma(S.MOD, function (d) {
    const r = revisar(d, {
      accion: [uno(ACCIONES_MOD, 'La acción')],
      u: [U, true], sala: [SALA, true], m: [M, true], msg: [idEntero('El mensaje'), true],
      minutos: [nulable(entero(1, 525600, 'Los minutos')), true],
      motivo: [texto('El motivo', 0, LARGOS.motivoMod), true],
      texto: [texto('El texto', 1, LARGOS.anuncio), true],
    });
    if (r.error) return r;
    const pide = MOD_PIDE[r.datos.accion];
    for (let i = 0; i < pide.length; i++) if (!hasOwn.call(r.datos, pide[i])) return { error: 'Falta un dato.' };
    if (r.datos.accion === 'renombrar_sala' && largoTexto(r.datos.texto) > LARGOS.nombreSala) return { error: 'El nombre es demasiado largo (hasta ' + LARGOS.nombreSala + ').' };
    return r;
  });
  forma(S.COMPRAR, { catalogo: [patron(CATALOGO_RE, 'El mueble')], cantidad: [entero(1, TOPES.COMPRA_MAX, 'La cantidad')] });
  forma(S.TRATO_PEDIR, { u: [U] });
  forma(S.TRATO_RESPONDER, { id: [ID], si: [bool('La respuesta')] });
  forma(S.TRATO_OFRECER, { id: [ID], items: [listaIds('La lista', TOPES.TRATO_ITEMS_MAX)] });
  forma(S.TRATO_LISTO, { id: [ID], version: [entero(0, 1e9, 'La versión')] });
  forma(S.TRATO_CONFIRMAR, { id: [ID], version: [entero(0, 1e9, 'La versión')] });
  forma(S.TRATO_CANCELAR, { id: [ID] });
  forma(S.PROPUESTAS, { ver: [uno(VER_PROPUESTAS, 'La lista')] });
  forma(S.PROPUESTA_GUARDAR, { id: [ID, true], borrador: [objetoLibre('El borrador')] });
  forma(S.PROPUESTA_ENVIAR, { id: [ID] });
  forma(S.PROPUESTA_BORRAR, { id: [ID] });
  forma(S.NOTA_PEGAR, { m: [M], pared: [clavePared('La pared')] });
  forma(S.NOTA_ESCRIBIR, { m: [M], texto: [texto('La nota', 1, LARGOS.nota)] });
  forma(S.NOTA_BORRAR, { m: [M] });

  function validar(evento, datos) {
    if (typeof evento !== 'string' || !hasOwn.call(VALIDADORES, evento)) return { error: 'Ese pedido no existe.' };
    if (datos === undefined || datos === null) datos = {};
    if (!esPlano(datos)) return { error: DATOS_RAROS };
    const tope = evento === S.PROPUESTA_GUARDAR ? TOPES.PAYLOAD_PROPUESTA_BYTES : TOPES.PAYLOAD_BYTES;
    if (bytesJson(datos) > tope) return { error: 'Es demasiado largo.' };
    try {
      return VALIDADORES[evento](datos);
    } catch (e) {
      return { error: DATOS_RAROS };
    }
  }

  // Claves de muebles (las mismas que usa motor.js).
  function esClavePiso(k) { const r = typeof k === 'string' && PISO_RE.exec(k); return !!r && +r[1] <= 63 && +r[2] <= 63; }
  function esClavePared(k) { const r = clavePared('')(k); return !r.e && r.v === k; }

  const API = {
    EV: Object.freeze(EV),
    A_SERVIDOR: Object.freeze(A_SERVIDOR),
    A_PERSONA: Object.freeze(A_PERSONA),
    A_SALA: Object.freeze(A_SALA),
    A_NAV: Object.freeze(A_NAV),
    A_TODOS: Object.freeze(A_TODOS),
    REGLAS: Object.freeze(REGLAS),
    eventosDeFase: eventosDeFase,
    SALAS: Object.freeze(SALAS),
    salaSocket: salaSocket,
    SLUG_RE: SLUG_RE, CATALOGO_RE: CATALOGO_RE, DECO_RE: DECO_RE, PARED_RE: PARED_RE, PISO_RE: PISO_RE,
    slugValido: slugValido, esClavePiso: esClavePiso, esClavePared: esClavePared,
    TOPES: TOPES,
    LARGOS: LARGOS,
    FUERA: FUERA, GESTOS: GESTOS, FORMAS: FORMAS, ACCESOS: ACCESOS, VER_SALAS: VER_SALAS,
    TIPOS_DENUNCIA: TIPOS_DENUNCIA, MOTIVOS_DENUNCIA: MOTIVOS_DENUNCIA, ACCIONES_MOD: ACCIONES_MOD,
    VER_PROPUESTAS: VER_PROPUESTAS,
    MS_POR_PASO: TOPES.MS_POR_PASO,
    ERROR_GENERAL: ERROR_GENERAL,
    validar: validar,
    bytesJson: bytesJson,
    esPlano: esPlano,
  };
  Object.freeze(API);
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else raiz.HotelContrato = API;
})(typeof window !== 'undefined' ? window : globalThis);
