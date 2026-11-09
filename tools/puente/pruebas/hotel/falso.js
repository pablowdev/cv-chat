// CV Hotel: servidor FALSO para las pruebas. Responde en memoria los eventos de la fase 1 de
// contrato.js (los nombres, la forma de cada pedido y los topes salen de ahi) con la geometria
// de motor.js, igual que va a hacer tools/puente/hotel.js. No es el servidor real: no hay base,
// ni Discord, ni mails; los permisos son los basicos.
//
// Corre en node (require) y en el navegador (window.HotelFalso, para pruebas/hotel/prueba.html).
//
//   const srv = crearFalso({ ahora, temporizar, latencia });
//   const socket = srv.conectar({ id: 7, nombre: 'Ana', equipo: false, avatar: null });
//   socket.emit('hotel:hola', {}, (r) => ...);    // como el socket de socket.io del chat
//   srv.bot('Rulo', { sala: 'principal' });       // gente que camina y habla sola
//   srv.catalogo()                                // lo que contesta GET /puente/api/hotel/catalogo
(function (raiz) {
  'use strict';
  const enNode = typeof module !== 'undefined' && module.exports;
  const C = enNode ? require('../../web/hotel/contrato.js') : raiz.HotelContrato;
  const M = enNode ? require('../../web/hotel/motor.js') : raiz.HotelMotor;
  const EV = C.EV, S = C.A_SERVIDOR, AS = C.A_SALA, AP = C.A_PERSONA;

  // ===== Catalogo de la fase 1: 15 muebles propios, todos gratis =====
  // 13 se dibujan por codigo; el cartel CV, la cocina y la mesa usan el arte original del dueño
  // (web/hotel/arte/*.png, ver src/game/imagenes.js), con las medidas y los corrimientos que
  // tenian en el catalogo de PawHotel (imageMeta offsetX/offsetY, escala 1). La mesa y el cartel
  // conservan su dibujo por codigo para el ratito en que la imagen todavia no llego.
  const dos = (a, b) => [{ dx: 0, dy: 0 }, { dx: a, dy: b }];
  const img = (src, w, h, dx, dy) => ({ src, w, h, dx: dx || 0, dy: dy || 0 });
  const ARTE = {
    mesa: { tipo: 'imagen', vistas: [img('mesa-chica.png', 90, 83, 1, -2)] },
    cocina: { tipo: 'imagen', vistas: [img('cocina-1.png', 69, 90, -8, -7), img('cocina-2.png', 69, 90, -7, -7)], rot: [0, 1] },
    // cara oeste (pared izquierda) = state0_rot0, cara norte (pared derecha) = state0_rot1
    cartel_cv: { tipo: 'imagen', vistas: [img('cartel-cv-1.png', 92, 115), img('cartel-cv-2.png', 93, 115)], pared: { west: 0, north: 1 }, muestra: 0 },
  };
  const CATALOGO = [
    { id: 'alfombra', nombre: 'Alfombra grande', descripcion: 'Roja con guarda amarilla. Se camina encima.', categoria: 'Alfombras', clase: 'piso', caminable: true, huella: '2x2', rotaciones: 1 },
    { id: 'alfombra_chica', nombre: 'Alfombra chica', descripcion: 'Para cualquier rincón.', categoria: 'Alfombras', clase: 'piso', caminable: true, huella: '1x1', rotaciones: 1 },
    { id: 'alfombra_redonda', nombre: 'Alfombra redonda', descripcion: 'Verde y redonda.', categoria: 'Alfombras', clase: 'piso', caminable: true, huella: '1x1', rotaciones: 1 },
    { id: 'sofa', nombre: 'Sillón', descripcion: 'Para dos. Tocalo para sentarte.', categoria: 'Living', clase: 'piso', sentable: true, huella: '2x1', rotaciones: 4,
      geometria: { shapeByRot: { 0: dos(1, 0), 1: dos(0, 1), 2: dos(1, 0), 3: dos(0, 1) }, sittingDir: 4, sittingVisualOffset: { x: 0, y: 0 } } },
    { id: 'mesa', nombre: 'Mesa', descripcion: 'Mesa robusta de madera maciza.', categoria: 'Living', clase: 'piso', huella: '1x1', rotaciones: 1, arte: ARTE.mesa },
    { id: 'cocina', nombre: 'Cocina', descripcion: 'Cocina moderna.', categoria: 'Cocina', clase: 'piso', huella: '1x1', rotaciones: 2, arte: ARTE.cocina, dibujo: null },
    { id: 'silla', nombre: 'Silla de madera', descripcion: 'Tocala para sentarte.', categoria: 'Living', clase: 'piso', sentable: true, huella: '1x1', rotaciones: 4,
      geometria: { sittingDir: 4, sittingVisualOffset: { x: 0, y: 0 } } },
    { id: 'planta', nombre: 'Planta', descripcion: 'Un arbusto en maceta.', categoria: 'Plantas', clase: 'piso', huella: '1x1', rotaciones: 1 },
    { id: 'parlante', nombre: 'Parlante', descripcion: 'Para que suene fuerte.', categoria: 'Música', clase: 'piso', huella: '1x1', rotaciones: 1 },
    { id: 'lampara', nombre: 'Lámpara de pie', descripcion: 'Tocala para prenderla.', categoria: 'Living', clase: 'piso', huella: '1x1', rotaciones: 1, estados: 2 },
    { id: 'separador', nombre: 'Separador', descripcion: 'Dos postes con una cinta.', categoria: 'Varios', clase: 'piso', huella: '1x1', rotaciones: 2 },
    { id: 'poster', nombre: 'Póster', descripcion: 'Un paisaje para la pared.', categoria: 'Pared', clase: 'pared' },
    { id: 'bandera', nombre: 'Bandera', descripcion: 'Roja, blanca y negra.', categoria: 'Pared', clase: 'pared' },
    { id: 'cartel_cv', nombre: 'Cartel CV', descripcion: 'Cartel oficial del Círculo Vicioso Club.', categoria: 'Pared', clase: 'pared', arte: ARTE.cartel_cv },
    { id: 'ventana', nombre: 'Ventana', descripcion: 'Con vista al cielo.', categoria: 'Pared', clase: 'pared' },
  ].map((f) => Object.assign({ caminable: false, sentable: false, huella: '1x1', rotaciones: 1, estados: 1, geometria: {}, precio: 0, visible: true, max_por_persona: 20 }, f, { dibujo: f.dibujo === null ? null : f.id }));
  const CAT = {};
  CATALOGO.forEach((f) => { CAT[f.id] = f; });
  const ENTRADA = {};
  CATALOGO.forEach((f) => { ENTRADA[f.id] = M.entradaDesdeCatalogo(f); });
  const CATALOGO_V = 1;

  function crearFalso(op) {
    op = op || {};
    const ahora = op.ahora || (() => Date.now());
    const temporizar = op.temporizar || ((fn, ms) => setTimeout(fn, ms));
    const latencia = op.latencia == null ? 15 : op.latencia;
    const azar = op.azar || Math.random;
    const log = op.log || (() => {});

    let sigM = 100, sigMsg = 1, sigSock = 1;
    const cuentas = {};       // id -> { id, nombre, equipo, admin, avatar, estado, salaActual, sock, silencioHasta, inventario:Set(m) }
    const items = {};         // m -> { m, c, dueno, sala|null, clave|null, rot, s }
    const salas = {};         // slug -> { slug, id, meta, capa, puerta, muebles:Set(m), jugadores:{u:j}, derechos:Set, mensajes:[], vetos:{} }
    const excesos = [];       // eventos de mas segun el tope de Haven (60 cada 10 s por persona)
    let sigSala = 1;

    function nuevaSala(slug, meta, layout) {
      const capa = M.crearCapa(layout);
      if (capa.error) throw new Error(capa.error);
      salas[slug] = { slug, id: sigSala++, meta: Object.assign({ nombre: slug, descripcion: '', icono: '🏠', dueno: null, cap: 25, forma: layout.forma, acceso: 'abierta', decor: { pared: { patron: 'plain', color: 1 }, piso: { patron: 'solid', color: 0 } } }, meta), capa, puerta: M.puerta(capa), muebles: new Set(), jugadores: {}, derechos: new Set(), mensajes: [], vetos: {} };
      return salas[slug];
    }
    function ponerDelClub(sala, c, x, y, rot) {
      const m = String(sigM++);
      items[m] = { m, c, dueno: null, sala: sala.slug, clave: x + ',' + y, rot: rot || 0, s: 0 };
      sala.muebles.add(m);
    }
    function colgarDelClub(sala, c, clave) {
      const m = String(sigM++);
      items[m] = { m, c, dueno: null, sala: sala.slug, clave, rot: 0, s: 0 };
      sala.muebles.add(m);
    }
    // Las salas del club
    const principal = nuevaSala('principal', { nombre: 'Sala principal', descripcion: 'La entrada del hotel.', icono: '🏨', cap: 40, decor: { pared: { patron: 'brick_sm', color: 1 }, piso: { patron: 'iso_brick', color: 0 } } }, { forma: 'small', ancho: 12, alto: 10 });
    ponerDelClub(principal, 'alfombra', 5, 4); ponerDelClub(principal, 'sofa', 8, 1, 0); ponerDelClub(principal, 'mesa', 9, 3);
    ponerDelClub(principal, 'planta', 11, 0); ponerDelClub(principal, 'lampara', 7, 0); ponerDelClub(principal, 'silla', 2, 7, 1);
    ponerDelClub(principal, 'parlante', 0, 0);
    colgarDelClub(principal, 'cartel_cv', 'wall:north:5,0:50,55'); colgarDelClub(principal, 'ventana', 'wall:north:8,0:50,55');
    colgarDelClub(principal, 'poster', 'wall:west:0,7:50,55');
    const bar = nuevaSala('bar', { nombre: 'El bar', descripcion: 'Para charlar tranqui.', icono: '🍹', cap: 25, decor: { pared: { patron: 'stripe', color: 7 }, piso: { patron: 'checker', color: 9 } } }, { forma: 'l_shape' });
    ponerDelClub(bar, 'mesa', 6, 5); ponerDelClub(bar, 'silla', 5, 5, 3); ponerDelClub(bar, 'silla', 7, 5, 1);
    colgarDelClub(bar, 'bandera', 'wall:north:6,0:50,55');

    // ===== Sockets =====
    const sockets = new Set();
    function copia(d) { return d === undefined ? undefined : JSON.parse(JSON.stringify(d)); }

    function conectar(perfil) {
      const id = String(perfil.id);
      if (!cuentas[id]) cuentas[id] = { id, nombre: perfil.nombre, equipo: !!perfil.equipo, admin: !!perfil.admin, invitado: !!perfil.invitado, avatar: perfil.avatar || null, estado: perfil.estado || '', salaActual: null, ultimaSala: null, socks: new Set(), silencioHasta: 0, inventario: new Set(), hola: false, envios: [] };
      const cu = cuentas[id];
      // inventario inicial (para las demos): perfil.inventario = ['sofa', 'mesa', ...]
      for (const c of (perfil.inventario || [])) {
        if (!CAT[c]) continue;
        const m = String(sigM++);
        items[m] = { m, c, dueno: id, sala: null, clave: null, rot: 0, s: 0 };
        cu.inventario.add(m);
      }
      perfil.inventario = null;
      const oyentes = {};
      const sock = {
        id: 's' + (sigSock++), connected: true, _cuenta: cu,
        on(ev, fn) { (oyentes[ev] = oyentes[ev] || []).push(fn); return sock; },
        off(ev, fn) { const l = oyentes[ev]; if (!l) return sock; const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); return sock; },
        emit(ev, datos, ack) {
          if (!sock.connected) return sock;
          const d = copia(datos);
          temporizar(() => pedido(sock, ev, d, (r) => { if (typeof ack === 'function') temporizar(() => ack(copia(r)), latencia); }), latencia);
          return sock;
        },
        _recibir(ev, d) { for (const fn of (oyentes[ev] || []).slice()) fn(copia(d)); },
        _oyentes(ev) { return ev ? (oyentes[ev] || []).length : Object.keys(oyentes).reduce((n, k) => n + oyentes[k].length, 0); },
        desconectar() { sock.connected = false; sacarDeSala(cu, sock); sock._recibir('disconnect'); },
        reconectar() { sock.connected = true; sock._recibir('connect'); },
      };
      cu.socks.add(sock); sockets.add(sock);
      return sock;
    }

    function aPersona(cu, ev, d) { for (const s of cu.socks) if (s.connected) s._recibir(ev, d); }
    function aSala(sala, ev, d) {
      for (const u of Object.keys(sala.jugadores)) {
        const cu = cuentas[u];
        if (cu) aPersona(cu, ev, d);
      }
    }

    // ===== Posiciones =====
    function posDe(j) {
      if (!j.c) return { x: j.x, y: j.y };
      const p = M.posicionEnCamino(j.x, j.y, j.c, ahora() - j.t0);
      return { x: p.x, y: p.y };
    }
    function jParaCliente(j) {
      const p = posDe(j);
      const out = { u: j.u, nombre: j.nombre, foto: null, avatar: j.avatar, estado: j.estado, equipo: j.equipo, x: j.x, y: j.y, d: j.d, ausente: j.ausente, escribe: j.escribe };
      if (j.c) {
        const el = ahora() - j.t0;
        const pc = M.posicionEnCamino(j.x, j.y, j.c, el);
        if (!pc.llego) { out.c = j.c; out.dx = j.dx; out.dy = j.dy; out.ms = el; } else { out.x = p.x; out.y = p.y; }
      }
      if (j.sienta) out.sienta = j.sienta;
      return out;
    }
    function mueblesDe(sala) {
      const out = [];
      for (const m of sala.muebles) {
        const it = items[m];
        if (!it || it.clave.indexOf('wall:') === 0) continue;
        const p = it.clave.split(',');
        out.push({ m, x: +p[0], y: +p[1], rot: it.rot, entrada: ENTRADA[it.c] });
      }
      return out;
    }
    function gente(sala, menos) {
      const js = {};
      for (const u of Object.keys(sala.jugadores)) {
        const j = sala.jugadores[u], p = posDe(j);
        js[u] = { x: p.x, y: p.y };
        if (j.c) { js[u].dx = j.dx; js[u].dy = j.dy; }
      }
      const set = M.ocupadasPorGente(js, menos);
      // la baldosa de la puerta nunca cuenta como ocupada (como PawHotel: ahi aparece todo el que entra)
      set.delete(M.clave(sala.puerta.x, sala.puerta.y));
      return set;
    }
    function rec(it) { return { c: it.c, rot: it.rot, s: it.s, datos: null }; }

    function puedo(cu, sala) {
      const dueno = sala.meta.dueno && String(sala.meta.dueno.id) === cu.id;
      const club = !sala.meta.dueno;
      const der = sala.derechos.has(cu.id);
      const eq = cu.equipo || cu.admin;
      if (club) return { poner: eq, mover: eq, echar: eq, levantar: eq, dueno: false, eq };
      return { poner: dueno || der || eq, mover: dueno || der || eq, echar: dueno || der || eq, levantar: dueno || der || eq, dueno, eq };
    }

    function sacarDeSala(cu, sockQueSale) {
      const slug = cu.salaActual;
      if (!slug || !salas[slug]) { cu.salaActual = null; return; }
      if (sockQueSale && cu.sockSala && cu.sockSala !== sockQueSale) return;
      const sala = salas[slug];
      delete sala.jugadores[cu.id];
      cu.salaActual = null; cu.sockSala = null;
      aSala(sala, AS.SE_VA, { sala: slug, u: cu.id });
    }

    function filaSala(sala) {
      return { slug: sala.slug, nombre: sala.meta.nombre, icono: sala.meta.icono, dueno: sala.meta.dueno, gente: Object.keys(sala.jugadores).length, cap: sala.meta.cap, forma: sala.meta.forma, acceso: sala.meta.acceso };
    }

    // ===== Movimiento =====
    function caminarA(sala, j, pasos, fin) {
      const cur = posDe(j);
      const c = M.codificarCamino(cur.x, cur.y, pasos);
      const ult = pasos.length ? pasos[pasos.length - 1] : { tx: cur.x, ty: cur.y };
      j.x = cur.x; j.y = cur.y; j.c = c; j.t0 = ahora(); j.dx = ult.tx; j.dy = ult.ty; j.sienta = null;
      const vuelta = ++j.vuelta;
      aSala(sala, AS.MOV, { sala: sala.slug, u: j.u, x: j.x, y: j.y, c, dx: j.dx, dy: j.dy });
      temporizar(() => {
        if (j.vuelta !== vuelta || !sala.jugadores[j.u]) return;
        j.x = j.dx; j.y = j.dy; j.c = ''; j.d = c ? c.charCodeAt(c.length - 1) - 48 : j.d;
        if (fin) fin();
      }, pasos.length * M.MS_POR_PASO + 5);
    }

    // ===== Manejadores =====
    const H = {};
    const OK = { ok: true };
    const err = (t) => ({ error: t });

    H[S.HOLA] = (cu) => {
      if (cu.invitado) return err('Los invitados no pueden entrar al hotel. Creá tu cuenta de CV Chat.');
      cu.hola = true;
      return { ok: true, yo: { id: cu.id, nombre: cu.nombre, foto: null, equipo: cu.equipo, admin: cu.admin }, avatar: cu.avatar, estado: cu.estado, config: { porPersona: 5, capacidades: [5, 10, 15, 20, 25], fase: 1 }, catalogoV: CATALOGO_V, ultimaSala: cu.ultimaSala };
    };
    H[S.PERFIL] = (cu, d) => {
      if (d.avatar) { const v = M.validarAvatar(d.avatar); if (v.error) return err(v.error); cu.avatar = v.avatar; }
      if (typeof d.estado === 'string') cu.estado = d.estado;
      const sala = cu.salaActual && salas[cu.salaActual];
      if (sala && sala.jugadores[cu.id]) {
        const j = sala.jugadores[cu.id]; j.avatar = cu.avatar; j.estado = cu.estado;
        aSala(sala, AS.JUGADOR, { sala: sala.slug, u: cu.id, avatar: cu.avatar, estado: cu.estado });
      }
      return OK;
    };
    H[S.SIGO] = () => OK;
    H[S.AUSENTE] = (cu, d, sala) => { const j = sala.jugadores[cu.id]; if (j.ausente !== d.si) { j.ausente = d.si; aSala(sala, AS.AUSENTE, { sala: sala.slug, u: cu.id, si: d.si }); } return OK; };
    H[S.SALIR] = (cu) => { sacarDeSala(cu); return OK; };
    H[S.SALAS] = (cu, d) => {
      let l = Object.values(salas);
      if (d.ver === 'club') l = l.filter((s) => !s.meta.dueno);
      else if (d.ver === 'gente') l = l.filter((s) => s.meta.dueno);
      else if (d.ver === 'mias') l = l.filter((s) => s.meta.dueno && String(s.meta.dueno.id) === cu.id);
      else if (d.ver === 'derechos') l = l.filter((s) => s.derechos.has(cu.id));
      else if (d.ver === 'buscar') { const q = d.q.toLowerCase(); l = l.filter((s) => s.meta.nombre.toLowerCase().indexOf(q) >= 0); }
      return { ok: true, salas: l.slice(0, C.TOPES.SALAS_FILAS_MAX).map(filaSala) };
    };
    H[S.NAV] = (cu, d, _s, sock) => {
      sock._nav = !!d.abierto;
      if (d.abierto) { const c = {}; for (const s of Object.values(salas)) c[s.slug] = Object.keys(s.jugadores).length; temporizar(() => sock._recibir(C.A_NAV.CONTEOS, c), latencia); }
      return OK;
    };
    H[S.SALA_CREAR] = (cu, d) => {
      const mias = Object.values(salas).filter((s) => s.meta.dueno && String(s.meta.dueno.id) === cu.id);
      if (mias.length >= 5) return err('Ya tenés 5 salas: borrá una para hacer otra.');
      let slug = '';
      do { slug = ''; for (let i = 0; i < 10; i++) slug += '0123456789abcdef'[Math.floor(azar() * 16)]; } while (salas[slug]);
      const capa = M.crearCapa({ forma: d.forma });
      if (capa.error) return err(capa.error);
      nuevaSala(slug, { nombre: d.nombre, descripcion: d.descripcion || '', icono: '🏠', dueno: { id: cu.id, nombre: cu.nombre }, cap: d.capacidad, acceso: d.acceso, forma: d.forma }, { forma: d.forma });
      return { ok: true, slug };
    };
    function gestor(cu, slug) {
      const sala = salas[slug];
      if (!sala) return { e: err('Esa sala no existe.') };
      const p = puedo(cu, sala);
      if (!p.dueno && !p.eq) return { e: err('Solo el dueño de la sala puede hacer eso.') };
      return { sala };
    }
    H[S.SALA_EDITAR] = (cu, d) => {
      const g = gestor(cu, d.sala); if (g.e) return g.e;
      const m = g.sala.meta;
      if (d.nombre != null) m.nombre = d.nombre;
      if (d.descripcion != null) m.descripcion = d.descripcion;
      if (d.capacidad != null) m.cap = d.capacidad;
      if (d.acceso != null) m.acceso = d.acceso;
      aSala(g.sala, AS.SALA, { sala: g.sala.slug, meta: m });
      return OK;
    };
    H[S.SALA_BORRAR] = (cu, d) => {
      const g = gestor(cu, d.sala); if (g.e) return g.e;
      const sala = g.sala;
      for (const u of Object.keys(sala.jugadores)) { const c = cuentas[u]; delete sala.jugadores[u]; if (c) { c.salaActual = null; aPersona(c, AP.FUERA, { motivo: 'sala_borrada' }); } }
      for (const m of sala.muebles) { const it = items[m]; if (it && it.dueno) { it.sala = null; it.clave = null; cuentas[it.dueno].inventario.add(m); aPersona(cuentas[it.dueno], AP.INVENTARIO_CAMBIO, { mas: [{ m, c: it.c }], menos: [] }); } }
      delete salas[sala.slug];
      return OK;
    };
    H[S.ENTRAR] = (cu, d, _s, sock) => {
      const sala = salas[d.sala];
      if (!sala) return err('Esa sala no existe.');
      const p = puedo(cu, sala);
      if (sala.vetos[cu.id] && sala.vetos[cu.id] > ahora()) return err('No podés entrar a esta sala.');
      if (sala.meta.acceso === 'cerrada' && !p.dueno && !p.eq && !sala.derechos.has(cu.id)) return err('La sala está cerrada.');
      if (Object.keys(sala.jugadores).length >= sala.meta.cap && !p.dueno && !p.eq && !sala.jugadores[cu.id]) return err('La sala está llena.');
      // una presencia por persona: la otra ventana queda afuera
      if (cu.sockSala && cu.sockSala !== sock && cu.sockSala.connected) cu.sockSala._recibir(AP.FUERA, { motivo: 'otra_ventana' });
      if (cu.salaActual) sacarDeSala(cu);
      const pu = sala.puerta;
      const c = M.codificarCamino(pu.afuera.x, pu.afuera.y, [{ tx: pu.x, ty: pu.y }]) || '';
      const j = { u: cu.id, nombre: cu.nombre, avatar: cu.avatar, estado: cu.estado, equipo: cu.equipo, x: pu.afuera.x, y: pu.afuera.y, c, t0: ahora(), dx: pu.x, dy: pu.y, d: 6, ausente: false, escribe: false, sienta: null, vuelta: 0 };
      temporizar(() => { if (sala.jugadores[cu.id] === j && j.c === c) { j.x = pu.x; j.y = pu.y; j.c = ''; } }, M.MS_POR_PASO + 5);
      sala.jugadores[cu.id] = j;
      cu.salaActual = sala.slug; cu.ultimaSala = sala.slug; cu.sockSala = sock;
      aSala(sala, AS.LLEGA, { sala: sala.slug, j: jParaCliente(j) });
      const muebles = {};
      for (const m of sala.muebles) muebles[m] = Object.assign({ clave: items[m].clave }, rec(items[m]));
      const jugadores = {};
      for (const u of Object.keys(sala.jugadores)) jugadores[u] = jParaCliente(sala.jugadores[u]);
      return {
        ok: true, ahora: ahora(),
        sala: { slug: sala.slug, meta: sala.meta, layout: { forma: sala.capa.forma, ancho: sala.capa.w, alto: sala.capa.h, mapa: { hueco: sala.capa.hueco } }, muebles, jugadores, derechos: [...sala.derechos], mensajes: sala.mensajes.slice(-C.TOPES.MENSAJES_AL_ENTRAR), puedo: { poner: p.poner, mover: p.mover, echar: p.echar, levantar: p.levantar } },
      };
    };
    H[S.IR] = (cu, d, sala) => {
      const j = sala.jugadores[cu.id];
      const cur = posDe(j);
      const o = { capa: sala.capa, desde: cur, bloqueos: M.bloqueosDeMuebles(mueblesDe(sala)), gente: gente(sala, cu.id) };
      if (d.puerta) {
        const pasos = M.camino(Object.assign({}, o, { hasta: { x: sala.puerta.x, y: sala.puerta.y } }));
        if (!pasos) return err('No llegás a la puerta.');
        caminarA(sala, j, pasos, () => { sacarDeSala(cu); aPersona(cu, AP.FUERA, { motivo: 'puerta' }); });
        return OK;
      }
      if (d.asiento) {
        const it = items[String(d.asiento.m)];
        if (!it || it.sala !== sala.slug || it.clave.indexOf('wall:') === 0) return err('Ese mueble no está acá.');
        const pp = it.clave.split(',');
        const as = M.asientosDeMueble(+pp[0], +pp[1], it.rot, ENTRADA[it.c])[d.asiento.s];
        if (!as) return err('Ahí no te podés sentar.');
        for (const u of Object.keys(sala.jugadores)) { const o2 = sala.jugadores[u]; if (u !== cu.id && o2.sienta && String(o2.sienta.m) === it.m && o2.sienta.s === as.s) return err('Ese lugar está ocupado.'); }
        const r = M.caminoAlAsiento(o, as);
        if (!r) return err('No llegás a ese asiento.');
        const sentar = () => {
          j.x = as.tx; j.y = as.ty; j.c = '';
          j.sienta = { m: it.m, s: as.s, d: as.direction, ox: as.visualOffset.x, oy: as.visualOffset.y };
          aSala(sala, AS.SIENTA, Object.assign({ sala: sala.slug, u: cu.id }, j.sienta));
        };
        if (!r.camino.length) sentar(); else caminarA(sala, j, r.camino, sentar);
        return OK;
      }
      const pasos = M.camino(Object.assign({}, o, { hasta: { x: d.x, y: d.y } }));
      if (!pasos) return err('No podés llegar ahí.');
      if (!pasos.length) { if (j.sienta) { j.sienta = null; caminarA(sala, j, [], null); } return OK; }
      caminarA(sala, j, pasos, null);
      return OK;
    };
    H[S.MIRAR] = (cu, d, sala) => {
      const j = sala.jugadores[cu.id];
      const cur = posDe(j);
      let tx = d.x, ty = d.y;
      if (d.u != null) { const o2 = sala.jugadores[String(d.u)]; if (!o2) return err('No está en la sala.'); const p2 = posDe(o2); tx = p2.x; ty = p2.y; }
      const cuerpo = j.sienta ? j.sienta.d : j.d;
      const dir = M.headDirFromTileTarget(cur.x, cur.y, tx, ty, cuerpo == null ? 4 : cuerpo);
      aSala(sala, AS.CABEZA, { sala: sala.slug, u: cu.id, d: dir, ms: C.TOPES.CABEZA_MS });
      return OK;
    };
    H[S.DECIR] = (cu, d, sala) => {
      if (cu.silencioHasta > ahora()) return err('Te silenciaron un rato.');
      const id = String(sigMsg++);
      const msg = { id, u: cu.id, nombre: cu.nombre, texto: d.texto, t: ahora() };
      sala.mensajes.push(msg);
      const j = sala.jugadores[cu.id]; j.escribe = false;
      aSala(sala, AS.DIJO, { sala: sala.slug, id, u: cu.id, texto: d.texto, t: msg.t });
      return { ok: true, id };
    };
    H[S.ESCRIBE] = (cu, d, sala) => { const j = sala.jugadores[cu.id]; if (j.escribe !== d.si) { j.escribe = d.si; aSala(sala, AS.ESCRIBE, { sala: sala.slug, u: cu.id, si: d.si }); } return OK; };
    H[S.GESTO] = (cu, d, sala) => { aSala(sala, AS.GESTO, { sala: sala.slug, u: cu.id, tipo: d.tipo }); return OK; };
    H[S.PEDIR] = (cu, d) => {
      const f = CAT[d.catalogo];
      if (!f || !f.visible) return err('Ese mueble no existe.');
      if (f.precio !== 0) return err('Ese mueble todavía no se puede pedir.');
      const tengo = Object.values(items).filter((it) => it.dueno === cu.id && it.c === f.id).length;
      if (tengo >= f.max_por_persona) return err('Ya tenés muchos de esos.');
      const m = String(sigM++);
      items[m] = { m, c: f.id, dueno: cu.id, sala: null, clave: null, rot: 0, s: 0 };
      cu.inventario.add(m);
      aPersona(cu, AP.INVENTARIO_CAMBIO, { mas: [{ m, c: f.id }], menos: [] });
      return { ok: true, item: { m, c: f.id } };
    };
    H[S.INVENTARIO] = (cu) => {
      const grupos = {};
      for (const m of cu.inventario) { const it = items[m]; (grupos[it.c] = grupos[it.c] || []).push(m); }
      return { ok: true, grupos: Object.keys(grupos).map((c) => ({ c, ids: grupos[c] })), total: cu.inventario.size };
    };
    function ubicar(sala, it, d, menos) {
      const f = CAT[it.c];
      if (f.clase === 'pared') {
        if (!d.pared) return { e: err('Ese mueble va en la pared.') };
        const r = M.puedeColgar(sala.capa, d.pared, ENTRADA[f.id]);
        return r.error ? { e: err(r.error) } : { clave: r.clave, rot: 0 };
      }
      if (d.pared) return { e: err('Ese mueble va en el piso.') };
      const ocup = M.ocupadasPorMuebles(mueblesDe(sala), menos);
      const r = M.puedePoner({ capa: sala.capa, x: d.x, y: d.y, rot: d.rot, entrada: ENTRADA[f.id], ocupadasMuebles: ocup, gente: ENTRADA[f.id].walkable ? new Set() : gente(sala, null) });
      return r.error ? { e: err(r.error) } : { clave: r.clave, rot: d.rot };
    }
    H[S.PONER] = (cu, d, sala) => {
      if (!puedo(cu, sala).poner) return err('No tenés permiso para poner muebles en esta sala.');
      const m = String(d.m), it = items[m];
      if (!it || it.dueno !== cu.id || !cu.inventario.has(m)) return err('Ese mueble no está en tu inventario.');
      const r = ubicar(sala, it, d, null); if (r.e) return r.e;
      cu.inventario.delete(m); it.sala = sala.slug; it.clave = r.clave; it.rot = r.rot; it.s = 0;
      sala.muebles.add(m);
      aSala(sala, AS.MUEBLE, { sala: sala.slug, m, clave: r.clave, rec: rec(it) });
      aPersona(cu, AP.INVENTARIO_CAMBIO, { mas: [], menos: [m] });
      return { ok: true, clave: r.clave };
    };
    function pararSentados(sala, m) { for (const j of Object.values(sala.jugadores)) if (j.sienta && String(j.sienta.m) === m) j.sienta = null; }
    H[S.MOVER] = (cu, d, sala) => {
      if (!puedo(cu, sala).mover) return err('No tenés permiso para mover muebles acá.');
      const m = String(d.m), it = items[m];
      if (!it || it.sala !== sala.slug) return err('Ese mueble no está acá.');
      const r = ubicar(sala, it, d, m); if (r.e) return r.e;
      it.clave = r.clave; it.rot = r.rot; pararSentados(sala, m);
      aSala(sala, AS.MUEBLE, { sala: sala.slug, m, clave: r.clave, rec: rec(it) });
      return { ok: true, clave: r.clave };
    };
    H[S.ROTAR] = (cu, d, sala) => {
      if (!puedo(cu, sala).mover) return err('No tenés permiso para girar muebles acá.');
      const m = String(d.m), it = items[m];
      if (!it || it.sala !== sala.slug) return err('Ese mueble no está acá.');
      const f = CAT[it.c];
      if (f.clase === 'pared' || f.rotaciones <= 1) return err('Ese mueble no se gira.');
      const rot = (it.rot + 1) % f.rotaciones;
      const p = it.clave.split(',');
      const r = ubicar(sala, it, { x: +p[0], y: +p[1], rot }, m); if (r.e) return r.e;
      it.rot = rot; pararSentados(sala, m);
      aSala(sala, AS.MUEBLE, { sala: sala.slug, m, clave: it.clave, rec: rec(it) });
      return { ok: true, rot };
    };
    H[S.USAR] = (cu, d, sala) => {
      const m = String(d.m), it = items[m];
      if (!it || it.sala !== sala.slug) return err('Ese mueble no está acá.');
      const f = CAT[it.c];
      if (f.estados <= 1) return err('Ese mueble no hace nada.');
      it.s = (it.s + 1) % f.estados;
      aSala(sala, AS.MUEBLE, { sala: sala.slug, m, clave: it.clave, rec: rec(it) });
      return OK;
    };
    H[S.LEVANTAR] = (cu, d, sala) => {
      const m = String(d.m), it = items[m];
      if (!it || it.sala !== sala.slug) return err('Ese mueble no está acá.');
      const p = puedo(cu, sala);
      if (!(p.dueno || p.eq || (sala.derechos.has(cu.id) && it.dueno === cu.id))) return err('No podés levantar ese mueble.');
      if (!it.dueno) return err('Los muebles del club no se levantan.');
      sala.muebles.delete(m); it.sala = null; it.clave = null; pararSentados(sala, m);
      cuentas[it.dueno].inventario.add(m);
      aSala(sala, AS.MUEBLE, { sala: sala.slug, m, clave: null, rec: null });
      aPersona(cuentas[it.dueno], AP.INVENTARIO_CAMBIO, { mas: [{ m, c: it.c }], menos: [] });
      return OK;
    };
    H[S.PINTAR] = (cu, d, sala) => {
      const p = puedo(cu, sala); if (!p.dueno && !p.eq) return err('Solo el dueño pinta la sala.');
      const k = d.tipo === 'pared' ? 'pared' : 'piso';
      sala.meta.decor[k] = { patron: d.patron, color: d.color };
      aSala(sala, AS.SALA, { sala: sala.slug, meta: sala.meta });
      return OK;
    };
    H[S.DERECHOS] = (cu, d, sala) => {
      const p = puedo(cu, sala); if (!p.dueno && !p.eq) return err('Solo el dueño da derechos.');
      if (!sala.meta.dueno) return err('En las salas del club no hay derechos.');
      const u = String(d.u);
      if (d.dar) { if (sala.derechos.size >= C.TOPES.DERECHOS_MAX) return err('Ya hay muchos con derechos.'); sala.derechos.add(u); } else sala.derechos.delete(u);
      aSala(sala, AS.DERECHOS, { sala: sala.slug, lista: [...sala.derechos] });
      return OK;
    };
    function echarDe(cu, d, sala, ms) {
      const p = puedo(cu, sala); if (!p.echar) return err('No podés echar gente de acá.');
      const u = String(d.u), otro = cuentas[u];
      if (!otro || !sala.jugadores[u]) return err('No está en la sala.');
      if (otro.equipo || (sala.meta.dueno && String(sala.meta.dueno.id) === u)) return err('A esa persona no la podés echar.');
      if (!p.dueno && !p.eq && sala.derechos.has(u)) return err('Entre los que tienen derechos no se echan.');
      if (ms) sala.vetos[u] = ahora() + ms;
      sacarDeSala(otro); aPersona(otro, AP.FUERA, { motivo: 'echado', ms: ms || 600000 });
      return OK;
    }
    H[S.ECHAR] = (cu, d, sala) => echarDe(cu, d, sala, 0);
    H[S.VETAR] = (cu, d, sala) => echarDe(cu, d, sala, (d.horas || 8760) * 3600000);
    H[S.FICHA] = (cu, d) => {
      const o2 = cuentas[String(d.u)]; if (!o2) return err('No encontré a esa persona.');
      const suya = Object.values(salas).find((s) => s.meta.dueno && String(s.meta.dueno.id) === o2.id);
      return { ok: true, avatar: o2.avatar, estado: o2.estado, sala: suya ? { slug: suya.slug, nombre: suya.meta.nombre } : null };
    };
    H[S.DENUNCIAR] = () => OK;
    H[S.MOD] = (cu, d) => {
      if (!cu.equipo && !cu.admin) return err('Eso es para el equipo.');
      if (d.accion === 'anuncio') { for (const c of Object.values(cuentas)) aPersona(c, C.A_TODOS.AVISO, { texto: d.texto }); return OK; }
      const o2 = d.u != null ? cuentas[String(d.u)] : null;
      if (d.accion === 'silenciar' && o2) { o2.silencioHasta = ahora() + (d.minutos || 10) * 60000; return OK; }
      if (d.accion === 'quitar_silencio' && o2) { o2.silencioHasta = 0; return OK; }
      if ((d.accion === 'sacar' || d.accion === 'fuera_hotel') && o2) { sacarDeSala(o2); aPersona(o2, AP.FUERA, { motivo: 'equipo' }); return OK; }
      return err('Esa acción todavía no está en el servidor de prueba.');
    };

    function pedido(sock, ev, datos, ack) {
      const cu = sock._cuenta;
      // tope de Haven (por persona): se cuenta para avisar si el cliente se pasa
      const t = ahora();
      cu.envios = cu.envios.filter((x) => x > t - C.TOPES.HAVEN.ms); cu.envios.push(t);
      if (cu.envios.length > C.TOPES.HAVEN.eventos) excesos.push({ u: cu.id, ev, t });
      const regla = C.REGLAS[ev];
      if (!regla) return ack({ error: 'Ese pedido no existe.' });
      if (regla.fase !== 1) return ack({ error: 'Eso todavía no está.' });
      const v = C.validar(ev, datos);
      if (v.error) return ack({ error: v.error });
      if (cu.invitado && ev !== S.HOLA) return ack({ error: 'Los invitados no pueden entrar al hotel.' });
      if (ev !== S.HOLA && !cu.hola) return ack({ error: 'Primero saludá (hotel:hola).' });
      if (ev !== S.HOLA && ev !== S.PERFIL && !cu.avatar) return ack({ error: 'Primero armá tu muñeco.' });
      let sala = null;
      if (regla.quien === 'en_sala' || ['poner', 'mover', 'rotar', 'levantar', 'pintar', 'derechos', 'echar', 'vetar'].indexOf(ev.slice(6)) >= 0) {
        sala = cu.salaActual && salas[cu.salaActual];
        if (!sala || !sala.jugadores[cu.id] || cu.sockSala !== sock) return ack({ error: 'No estás en una sala.' });
      }
      let r;
      try { r = H[ev](cu, v.datos, sala, sock); } catch (e) { log('falso: ' + ev + ': ' + (e && e.stack || e)); r = { error: C.ERROR_GENERAL }; }
      ack(r);
    }

    // ===== Bots: gente que camina, habla y saluda sola (para ver el hotel con vida) =====
    const FRASES = ['¡Buenas!', '¿Qué onda?', 'Qué lindo quedó esto', 'Alguien para un truco?', 'Jajaja', 'Me encanta el sillón', 'Ahora vuelvo', 'Che, ¿vieron el cartel?'];
    const bots = [];
    function bot(nombre, o) {
      o = o || {};
      const id = String(o.id || (9000 + bots.length));
      const av = o.avatar || { hairV: bots.length % 3, hairC: (bots.length * 3) % 13, faceV: bots.length % 4, faceC: (bots.length * 2) % 7, shirtV: bots.length % 4, shirtC: (bots.length * 5) % 14, pantsV: bots.length % 3, pantsC: (bots.length * 3) % 11, shoesV: bots.length % 4, shoesC: (bots.length * 7) % 11 };
      const s = conectar({ id, nombre, avatar: av, estado: o.estado || 'De paseo', equipo: false });
      const b = { s, vivo: true, cada: o.cada || 3500 };
      bots.push(b);
      s.emit(S.HOLA, {}, () => s.emit(S.ENTRAR, { sala: o.sala || 'principal' }, () => {
        if (o.x != null) s.emit(S.IR, { x: o.x, y: o.y });
        if (o.asiento) s.emit(S.IR, { asiento: o.asiento }); // { m, s }: va y se sienta
        if (o.decir) temporizar(() => s.emit(S.DECIR, { texto: o.decir }), o.decirEn || 600);
        if (o.quieto) return;
        const paso = () => {
          if (!b.vivo) return;
          const sala = salas[cuentas[id].salaActual];
          if (sala) {
            const r = azar();
            if (r < 0.6) { s.emit(S.IR, { x: Math.floor(azar() * sala.capa.w), y: Math.floor(azar() * sala.capa.h) }); }
            else if (r < 0.85) { s.emit(S.ESCRIBE, { si: true }); temporizar(() => s.emit(S.DECIR, { texto: FRASES[Math.floor(azar() * FRASES.length)] }), 900); }
            else s.emit(S.GESTO, { tipo: C.GESTOS[Math.floor(azar() * C.GESTOS.length)] });
          }
          temporizar(paso, b.cada + Math.floor(azar() * 1500));
        };
        temporizar(paso, 400 + Math.floor(azar() * 800));
      }));
      return { socket: s, parar() { b.vivo = false; } };
    }

    return {
      conectar,
      bot,
      catalogo: () => ({ ok: true, v: CATALOGO_V, items: CATALOGO, decoracion: null, poses: {} }),
      salas: () => salas,
      items: () => items,
      cuenta: (id) => cuentas[String(id)] || null,
      excesos: () => excesos.slice(),
      contrato: C, motor: M,
    };
  }

  const API = { crearFalso, CATALOGO };
  if (enNode) module.exports = API; else raiz.HotelFalso = API;
})(typeof window !== 'undefined' ? window : globalThis);
