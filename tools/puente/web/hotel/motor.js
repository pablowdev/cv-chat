// CV Hotel: la geometria unica. La usan el servidor (require) y el navegador (window.HotelMotor),
// asi los dos calculan exactamente lo mismo: que baldosas existen, donde esta la puerta, que
// tapa cada mueble, donde se sienta uno, por donde se camina y hacia donde puede mirar la cabeza.
// Sin pantalla, sin red, sin dependencias.
//
// Sale del motor de PawHotel (pathfinding, rooms, furnitureGeometry, wallPlacement y
// directionHelpers, mas las medidas de config/rooms y config/avatar). Las funciones de PawHotel
// se exportan con su nombre de siempre para que los envoltorios ESM del cliente
// (src/game/*.js) las reexporten sin tocar a quien las usa; lo nuevo va en castellano.
//
// Convenciones:
//  - Baldosas (tx,ty) enteras; la sala va de 0 a w-1 y de 0 a h-1, menos los huecos.
//  - Direcciones de 8 pasos (0 N, 1 NO, 2 O, 3 SO, 4 S, 5 SE, 6 E, 7 NE), ver DIR_VECTORS.
//  - Clave de mueble de piso "tx,ty"; de pared "wall:north|west:tx,ty:ox,oy".
(function (raiz) {
  'use strict';

  const hasOwn = Object.prototype.hasOwnProperty;

  // ===================================================================================
  // Direcciones (directionHelpers.js)
  // ===================================================================================

  const DIR_VECTORS = Object.freeze([
    Object.freeze({ dx: 0, dy: -1 }),  // 0 N
    Object.freeze({ dx: -1, dy: -1 }), // 1 NO
    Object.freeze({ dx: -1, dy: 0 }),  // 2 O
    Object.freeze({ dx: -1, dy: 1 }),  // 3 SO
    Object.freeze({ dx: 0, dy: 1 }),   // 4 S (de frente, la de siempre)
    Object.freeze({ dx: 1, dy: 1 }),   // 5 SE
    Object.freeze({ dx: 1, dy: 0 }),   // 6 E
    Object.freeze({ dx: 1, dy: -1 }),  // 7 NE
  ]);

  // La direccion de 8 pasos mas cercana a un desplazamiento. Si un eje domina claramente
  // (mas de 2,5 veces), el otro se toma como 0 para no dar diagonales de casualidad.
  function angleToDir8(dx, dy) {
    if (dx === 0 && dy === 0) return 4;
    const ndx = dx > 0 ? 1 : dx < 0 ? -1 : 0;
    const ndy = dy > 0 ? 1 : dy < 0 ? -1 : 0;
    let efx = ndx, efy = ndy;
    const ax = Math.abs(dx), ay = Math.abs(dy);
    if (ax > 0 && ay > 0) {
      const r = ax / ay;
      if (r > 2.5) efy = 0;
      else if (r < 1 / 2.5) efx = 0;
    }
    for (let i = 0; i < 8; i++) {
      const v = DIR_VECTORS[i];
      if (v.dx === efx && v.dy === efy) return i;
    }
    return 4;
  }

  // Direccion del cuerpo 0..7 -> pose sentado 0..3 ({N,NO}->0, {O,SO}->1, {S,SE}->2, {E,NE}->3).
  function bodyDirToSittingPose(dir8) {
    const d = ((dir8 % 8) + 8) % 8;
    return Math.floor(d / 2);
  }

  // Pose sentado 0..3 -> la direccion 0..7 de su cuadrante (0->0, 1->2, 2->4, 3->6).
  function sittingPoseToBodyDir(pose4) {
    const p = ((pose4 % 4) + 4) % 4;
    return p * 2;
  }

  function normalizarDelta8(delta) {
    let d = ((delta % 8) + 8) % 8;
    if (d >= 4) d -= 8;
    return d;
  }

  // La cabeza nunca mira justo al reves que el cuerpo (seria mostrar la nuca de frente): si
  // piden 180 grados, queda en el vecino de -3 (fijo, para que el resultado sea siempre el mismo).
  function clampHeadDir(headDir, bodyDir) {
    const h = ((headDir % 8) + 8) % 8;
    const b = ((bodyDir % 8) + 8) % 8;
    if (normalizarDelta8(h - b) === -4) return (b + 5) % 8;
    return h;
  }

  function headDirFromTileTarget(ox, oy, tx, ty, bodyDir) {
    return clampHeadDir(angleToDir8(tx - ox, ty - oy), bodyDir);
  }

  // ===================================================================================
  // Capas de sala (config/rooms.js, ahora como datos) y baldosas (rooms.js)
  // ===================================================================================

  // hueco: rectangulos [x,y,w,h] que NO son piso.
  const CAPAS = Object.freeze({
    small: Object.freeze({ w: 8, h: 8, hueco: Object.freeze([]) }),
    rect: Object.freeze({ w: 10, h: 14, hueco: Object.freeze([]) }),
    l_shape: Object.freeze({ w: 12, h: 10, hueco: Object.freeze([Object.freeze([0, 0, 4, 4])]) }),
    hex: Object.freeze({ w: 12, h: 10, hueco: Object.freeze([Object.freeze([0, 0, 5, 3]), Object.freeze([0, 0, 3, 5])]) }),
  });
  const LADO_MIN = 4, LADO_MAX = 64, HUECOS_MAX = 64;

  function mascaraDeHuecos(hueco) {
    if (!hueco || !hueco.length) return null;
    return function (tx, ty) {
      for (let i = 0; i < hueco.length; i++) {
        const r = hueco[i];
        if (tx >= r[0] && ty >= r[1] && tx < r[0] + r[2] && ty < r[1] + r[3]) return false;
      }
      return true;
    };
  }

  // Lo mismo que ROOM_LAYOUTS de PawHotel, con la mascara armada desde los huecos.
  const ROOM_LAYOUTS = Object.freeze({
    small: Object.freeze({ nameKey: 'layouts.small', w: 8, h: 8, mask: null }),
    rect: Object.freeze({ nameKey: 'layouts.rectangular', w: 10, h: 14, mask: null }),
    l_shape: Object.freeze({ nameKey: 'layouts.lShape', w: 12, h: 10, mask: mascaraDeHuecos(CAPAS.l_shape.hueco) }),
    hex: Object.freeze({ nameKey: 'layouts.hex', w: 12, h: 10, mask: mascaraDeHuecos(CAPAS.hex.hueco) }),
  });

  function tileExistsInRoom(tx, ty, roomW, roomH, roomMask) {
    if (tx < 0 || ty < 0 || tx >= roomW || ty >= roomH) return false;
    if (roomMask && !roomMask(tx, ty)) return false;
    return true;
  }

  function getLayoutState(layouts, layoutId, fallbackId) {
    const layout = layouts[layoutId] || layouts[fallbackId || 'small'];
    return { roomW: layout.w, roomH: layout.h, roomMask: layout.mask || null };
  }

  // Ojo: en PawHotel este parametro se llama roomW, pero todos lo llaman con el ALTO de la sala
  // (roomGeometryRuntime.js: getDoorTyBase(getRoomState().roomH, ...)). Se deja igual.
  function getDoorTyForRoom(alto, tileExists) {
    const startTy = Math.max(1, Math.floor(alto / 3));
    for (let d = 0; d < alto; d++) {
      if (tileExists(0, startTy + d)) return startTy + d;
      if (d > 0 && tileExists(0, startTy - d)) return startTy - d;
    }
    return Math.floor(alto / 2);
  }

  function isLShapeRoom(roomW, roomH, roomMask, tileExists) {
    return roomW === 12 && roomH === 10 && !!roomMask && !tileExists(0, 0) && tileExists(4, 0) && tileExists(0, 4);
  }

  function isHexRoom(roomW, roomH, roomMask, isLShapeLayout) {
    return roomW === 12 && roomH === 10 && !!roomMask && !isLShapeLayout;
  }

  function getLShapeDoorTile() { return { tx: 0, ty: 3 }; }

  function getHexDoorTileForRoom(roomW, roomH, tileExists, getDoorTy) {
    const candidatos = [
      { tx: 3, ty: 3 }, { tx: 4, ty: 3 }, { tx: 3, ty: 4 },
      { tx: 4, ty: 4 }, { tx: 3, ty: 2 }, { tx: 4, ty: 2 },
    ];
    for (let i = 0; i < candidatos.length; i++) {
      const c = candidatos[i];
      if (tileExists(c.tx, c.ty) && !tileExists(c.tx - 1, c.ty)) return c;
    }
    for (let tx = 0; tx < roomW; tx++) {
      for (let ty = 0; ty < roomH; ty++) {
        if (tileExists(tx, ty) && !tileExists(tx - 1, ty)) return { tx: tx, ty: ty };
      }
    }
    return { tx: 0, ty: getDoorTy() };
  }

  // Donde aparece el muñeco, del lado de afuera de la puerta.
  function getDoorSpawnForRoom(o) {
    if (o.isLShapeLayout) return { x: -1, y: 4 };
    if (o.isHexRoomLayout) {
      const d = o.getHexDoorTile();
      return { x: d.tx - 1, y: d.ty };
    }
    return { x: -1, y: o.getDoorTy() };
  }

  function isDoorPlayerAtSpawn(player, spawn) {
    return Math.round(player.px) === spawn.x && Math.round(player.py) === spawn.y;
  }

  // La baldosa de adentro a la que hay que llegar para salir (doorInteraction.js).
  function getDoorRoomTile(o) {
    if (o.isLShapeLayout()) {
      const d = o.getLShapeDoorTile();
      return { tx: d.tx, ty: d.ty + 1 };
    }
    if (o.isHexRoomLayout()) return o.getHexDoorTile();
    return { tx: 0, ty: o.getDoorTy() };
  }

  // --- Lo nuevo: la capa como dato ---

  function enteroEn(v, min, max) { return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max; }

  // Arma la capa de una sala: { forma, w, h, hueco }. Las formas small y rect aceptan otras
  // medidas (las salas del club, como 'principal' de 12x10); l_shape y hex son fijas de 12x10
  // porque la puerta depende de eso; 'propia' trae su mapa { hueco:[[x,y,w,h]] }.
  // Devuelve la capa o { error }.
  function crearCapa(o) {
    o = o || {};
    const forma = o.forma;
    if (forma === 'l_shape' || forma === 'hex') {
      const c = CAPAS[forma];
      return { forma: forma, w: c.w, h: c.h, hueco: c.hueco.map(function (r) { return r.slice(); }) };
    }
    if (forma === 'small' || forma === 'rect' || forma === 'propia') {
      const base = CAPAS[forma] || {};
      const w = o.ancho == null ? base.w : o.ancho;
      const h = o.alto == null ? base.h : o.alto;
      if (!enteroEn(w, LADO_MIN, LADO_MAX) || !enteroEn(h, LADO_MIN, LADO_MAX)) return { error: 'La sala tiene medidas raras.' };
      let hueco = [];
      if (forma === 'propia') {
        const mapa = o.mapa;
        if (!mapa || typeof mapa !== 'object' || !Array.isArray(mapa.hueco) || mapa.hueco.length > HUECOS_MAX) return { error: 'El mapa de la sala no es válido.' };
        for (let i = 0; i < mapa.hueco.length; i++) {
          const r = mapa.hueco[i];
          if (!Array.isArray(r) || r.length !== 4 || !enteroEn(r[0], 0, w - 1) || !enteroEn(r[1], 0, h - 1) ||
            !enteroEn(r[2], 1, LADO_MAX) || !enteroEn(r[3], 1, LADO_MAX)) return { error: 'El mapa de la sala no es válido.' };
          hueco.push([r[0], r[1], r[2], r[3]]);
        }
      }
      const capa = { forma: forma, w: w, h: h, hueco: hueco };
      if (contarBaldosas(capa) < 4) return { error: 'La sala no tiene lugar.' };
      const pu = puerta(capa);
      if (!existe(capa, pu.x, pu.y)) return { error: 'La sala no tiene por dónde entrar.' };
      return capa;
    }
    return { error: 'Esa forma de sala no existe.' };
  }

  function existe(capa, tx, ty) {
    if (!enteroEn(tx, 0, capa.w - 1) || !enteroEn(ty, 0, capa.h - 1)) return false;
    const hu = capa.hueco;
    for (let i = 0; i < hu.length; i++) {
      const r = hu[i];
      if (tx >= r[0] && ty >= r[1] && tx < r[0] + r[2] && ty < r[1] + r[3]) return false;
    }
    return true;
  }

  function contarBaldosas(capa) {
    let n = 0;
    for (let x = 0; x < capa.w; x++) for (let y = 0; y < capa.h; y++) if (existe(capa, x, y)) n++;
    return n;
  }

  // Todo lo de la puerta, con las mismas reglas que PawHotel:
  //  { x, y }      la baldosa de adentro (ahi se llega al entrar y ahi hay que ir para salir)
  //  afuera {x,y}  donde aparece el muñeco, fuera de la sala
  //  ty            la fila de la puerta en la pared oeste (la que usa el dibujo)
  //  tipo          'normal' | 'l' | 'hex'
  function puerta(capa) {
    const ex = function (x, y) { return existe(capa, x, y); };
    const mascara = capa.hueco.length ? ex : null;
    const getDoorTy = function () { return getDoorTyForRoom(capa.h, ex); };
    const esL = isLShapeRoom(capa.w, capa.h, mascara, ex);
    const esHex = isHexRoom(capa.w, capa.h, mascara, esL);
    const getHex = function () { return getHexDoorTileForRoom(capa.w, capa.h, ex, getDoorTy); };
    const dentro = getDoorRoomTile({
      isLShapeLayout: function () { return esL; }, isHexRoomLayout: function () { return esHex; },
      getLShapeDoorTile: getLShapeDoorTile, getHexDoorTile: getHex, getDoorTy: getDoorTy,
    });
    const afuera = getDoorSpawnForRoom({ isLShapeLayout: esL, isHexRoomLayout: esHex, getHexDoorTile: getHex, getDoorTy: getDoorTy });
    return { x: dentro.tx, y: dentro.ty, afuera: afuera, ty: getDoorTy(), tipo: esL ? 'l' : esHex ? 'hex' : 'normal' };
  }

  // ===================================================================================
  // Muebles (furnitureGeometry.js)
  // ===================================================================================

  // Gira un desplazamiento de baldosa de a 90 grados (horario en pantalla): (dx,dy) -> (-dy,dx).
  function rotateTileOffset(o, rotation) {
    const dx = o.dx, dy = o.dy;
    switch ((rotation || 0) % 4) {
      case 1: return { dx: -dy, dy: dx };
      case 2: return { dx: -dx, dy: -dy };
      case 3: return { dx: dy, dy: -dx };
      default: return { dx: dx, dy: dy };
    }
  }

  // Las baldosas (desplazamientos) de un mueble en una rotacion:
  //  1. entry.shapeByRot: las rotaciones que tienen forma definida, repartidas con modulo
  //     (igual que el dibujo elige la vista), sin girar nada mas;
  //  2. si no, la forma base (shape o footprint "AxB"); las sentables no se giran;
  //  3. el resto se gira desde la forma base.
  // shapeByRot puede venir como lista o como objeto {"0":[...]}: los dos se leen por indice.
  function getShapeForRotation(entry, rotation) {
    const rot = ((rotation || 0) % 4);
    const shapeByRot = entry && entry.shapeByRot;
    if (shapeByRot != null && typeof shapeByRot === 'object') {
      const hay = [];
      for (let r = 0; r < 4; r++) {
        const c = shapeByRot[r];
        if (Array.isArray(c) && c.length > 0) hay.push(r);
      }
      if (hay.length > 0) return shapeByRot[hay[rot % hay.length]];
    }
    const base = getShapeFromEntry(entry);
    if (entry && entry.sittable) return base;
    return base.map(function (o) { return rotateTileOffset(o, rot); });
  }

  // Las baldosas que ocupa un mueble con ancla (x,y), girando la forma (forma vacia: solo el ancla).
  function getOccupiedTiles(anchorTx, anchorTy, shape, rotation) {
    if (!Array.isArray(shape) || shape.length === 0) return [{ tx: anchorTx, ty: anchorTy }];
    return shape.map(function (o) {
      const r = rotateTileOffset(o, rotation);
      return { tx: anchorTx + r.dx, ty: anchorTy + r.dy };
    });
  }

  // Los asientos en una rotacion:
  //  1. sittable: cada baldosa de la forma es un asiento, mirando segun la rotacion
  //     (rot 0 -> dir 0, rot 1 -> 6, rot 2 -> 4, rot 3 -> 2: restar 2 por paso);
  //  2. seatsByRot (lista u objeto);
  //  3. seats, la lista vieja, igual para todas.
  function getSeatsForRotation(entry, rotation) {
    if (entry && entry.sittable) {
      const forma = getShapeForRotation(entry, rotation);
      const baseDir = entry.sittingDir == null ? 0 : entry.sittingDir;
      const dir = (((baseDir - rotation * 2) % 8) + 8) % 8;
      const vo = entry.sittingVisualOffset == null ? { x: 0, y: -8 } : entry.sittingVisualOffset;
      return forma.map(function (o, i) {
        return { id: 'seat_' + i, dx: o.dx, dy: o.dy, direction: dir, visualOffset: vo };
      });
    }
    const seatsByRot = entry && entry.seatsByRot;
    if (seatsByRot != null && typeof seatsByRot === 'object') {
      const deRot = seatsByRot[rotation];
      if (Array.isArray(deRot) && deRot.length > 0) return normalizeSeats(deRot);
      const cero = seatsByRot[0];
      if (Array.isArray(cero) && cero.length > 0) return normalizeSeats(cero);
    }
    return normalizeSeats(entry && entry.seats != null ? entry.seats : []);
  }

  function normalizeSeats(seats) {
    if (!Array.isArray(seats)) return [];
    return seats.map(function (seat, i) {
      const out = Object.assign({}, seat);
      out.id = (seat && seat.id) || ('seat_' + i);
      out.direction = seat && seat.direction != null ? seat.direction : 4;
      out.visualOffset = (seat && seat.visualOffset) || { x: 0, y: -8 };
      return out;
    });
  }

  // Donde queda cada asiento con el ancla en (x,y). Dos formatos: {dx,dy} ya girados, o el viejo
  // {shapeTileIndex} que apunta a una baldosa de la forma.
  function getSeatTiles(anchorTx, anchorTy, seats, shape, rotation) {
    if (!Array.isArray(seats) || seats.length === 0) return [];
    let ocupadas = null;
    return seats.map(function (seat) {
      let tx, ty;
      if (seat.dx != null && seat.dy != null) {
        tx = anchorTx + seat.dx;
        ty = anchorTy + seat.dy;
      } else {
        if (!ocupadas) ocupadas = getOccupiedTiles(anchorTx, anchorTy, shape, rotation);
        const i = seat.shapeTileIndex == null ? 0 : seat.shapeTileIndex;
        const t = ocupadas[i] || ocupadas[0];
        tx = t.tx; ty = t.ty;
      }
      return { tx: tx, ty: ty, seatId: seat.id, direction: seat.direction, visualOffset: seat.visualOffset };
    });
  }

  // La forma base: shape, o la huella "AxB" (A de ancho, B de fondo).
  function getShapeFromEntry(entry) {
    if (entry && Array.isArray(entry.shape) && entry.shape.length > 0) return entry.shape;
    const fp = String((entry && entry.footprint) || '1x1').toLowerCase();
    const p = fp.split('x').map(function (v) { return Math.max(1, parseInt(v, 10) || 1); });
    const fw = Math.min(p[0], LADO_MAX), fh = Math.min(p[1] || 1, LADO_MAX);
    const shape = [];
    for (let dy = 0; dy < fh; dy++) for (let dx = 0; dx < fw; dx++) shape.push({ dx: dx, dy: dy });
    return shape;
  }

  // Map<"tx,ty", {anchorKey}> con las baldosas SECUNDARIAS de cada mueble de varias baldosas.
  function buildOccupiedTilesMap(furnitureMap, furnitureFlipped, getFurniCatalogEntry) {
    const out = new Map();
    const claves = Object.keys(furnitureMap);
    for (let i = 0; i < claves.length; i++) {
      const anchorKey = claves[i], type = furnitureMap[anchorKey];
      if (!type || anchorKey.indexOf('wall:') === 0) continue;
      const partes = anchorKey.split(',');
      if (partes.length !== 2) continue;
      const ax = parseInt(partes[0], 10), ay = parseInt(partes[1], 10);
      if (isNaN(ax) || isNaN(ay)) continue;
      const entry = getFurniCatalogEntry(type);
      const rotRaw = furnitureFlipped[anchorKey];
      const rot = typeof rotRaw === 'number' ? rotRaw : (rotRaw ? 1 : 0);
      const forma = getShapeForRotation(entry, rot);
      if (forma.length <= 1) continue;
      for (let j = 0; j < forma.length; j++) {
        const k = (ax + forma[j].dx) + ',' + (ay + forma[j].dy);
        if (k === anchorKey) continue;
        out.set(k, { anchorKey: anchorKey });
      }
    }
    return out;
  }

  // --- Lo nuevo: muebles como datos del catalogo de CV ---

  // Una fila del catalogo de CV (caminable, sentable, huella, geometria {shapeByRot, seatsByRot,
  // sittingDir, sittingVisualOffset, limitesPared}) a la forma que entienden las funciones de arriba.
  function entradaDesdeCatalogo(fila) {
    fila = fila || {};
    let g = fila.geometria;
    if (typeof g === 'string') { try { g = JSON.parse(g); } catch (e) { g = null; } }
    if (!g || typeof g !== 'object' || Array.isArray(g)) g = {};
    const e = {
      id: fila.id,
      clase: fila.clase || 'piso',
      walkable: !!fila.caminable,
      sittable: !!fila.sentable,
      footprint: typeof fila.huella === 'string' ? fila.huella : '1x1',
      rotaciones: enteroEn(fila.rotaciones, 1, 4) ? fila.rotaciones : 1,
      estados: enteroEn(fila.estados, 1, 8) ? fila.estados : 1,
    };
    const copiar = ['shape', 'shapeByRot', 'seatsByRot', 'seats', 'sittingDir', 'sittingVisualOffset', 'limitesPared'];
    for (let i = 0; i < copiar.length; i++) if (hasOwn.call(g, copiar[i])) e[copiar[i]] = g[copiar[i]];
    return e;
  }

  function clave(x, y) { return x + ',' + y; }

  // Las baldosas que tapa un mueble de piso (ancla incluida), como en buildOccupiedTilesMap.
  function baldosasDeMueble(x, y, rot, entrada) {
    const forma = getShapeForRotation(entrada, rot || 0);
    if (!forma || !forma.length) return [{ tx: x, ty: y }];
    return forma.map(function (o) { return { tx: x + o.dx, ty: y + o.dy }; });
  }

  // Lo que bloquea el paso. muebles: [{x, y, rot, entrada}] (los de pared no cuentan).
  // Un mueble caminable (las alfombras) no bloquea ninguna de sus baldosas; el resto bloquea
  // toda su huella. (En PawHotel las baldosas secundarias de una alfombra grande bloqueaban:
  // el dueño decidio que se pisen todas.)
  function bloqueosDeMuebles(muebles) {
    const set = new Set();
    for (let i = 0; i < muebles.length; i++) {
      const mu = muebles[i];
      if (!mu || mu.pared) continue;
      if (mu.entrada && mu.entrada.walkable) continue;
      const bs = baldosasDeMueble(mu.x, mu.y, mu.rot, mu.entrada);
      for (let j = 0; j < bs.length; j++) set.add(clave(bs[j].tx, bs[j].ty));
    }
    return set;
  }

  // Las baldosas de la gente: donde esta cada uno y adonde va (los destinos tambien bloquean,
  // asi el cliente bloquea lo mismo que el servidor). jugadores: { u: {x,y,dx?,dy?} }.
  function ocupadasPorGente(jugadores, menos) {
    const set = new Set();
    const ids = Object.keys(jugadores || {});
    for (let i = 0; i < ids.length; i++) {
      if (menos != null && String(ids[i]) === String(menos)) continue;
      const j = jugadores[ids[i]];
      if (!j) continue;
      if (Number.isFinite(j.x) && Number.isFinite(j.y)) set.add(clave(Math.round(j.x), Math.round(j.y)));
      if (Number.isFinite(j.dx) && Number.isFinite(j.dy)) set.add(clave(j.dx, j.dy));
    }
    return set;
  }

  // Los asientos de un mueble puesto en (x,y): [{tx, ty, s, seatId, direction, visualOffset}].
  // s es el indice que viaja en hotel:ir {asiento:{m,s}} y en hotel:sienta.
  function asientosDeMueble(x, y, rot, entrada) {
    const seats = getSeatsForRotation(entrada, rot || 0);
    if (!seats.length) return [];
    // getShapeForRotation ya da la forma girada: a getSeatTiles va con rotacion 0.
    const forma = getShapeForRotation(entrada, rot || 0);
    return getSeatTiles(x, y, seats, forma, 0).map(function (t, i) {
      return { tx: t.tx, ty: t.ty, s: i, seatId: t.seatId, direction: t.direction, visualOffset: t.visualOffset };
    });
  }

  // ===================================================================================
  // Caminos (pathfinding.js)
  // ===================================================================================

  function createIsBlocked(o) {
    const furnitureMap = o.furnitureMap, walkable = o.walkableFurniTypes, normalizar = o.normalizeFurniType, sec = o.secondaryTilesMap;
    return function isBlocked(tx, ty) {
      const k = tx + ',' + ty;
      const type = furnitureMap[k];
      if (type && !walkable.has(normalizar(type))) return true;
      if (sec && sec.has(k)) return true;
      return false;
    };
  }

  // BFS de 4 vecinos (en este orden: O, E, N, S). Devuelve los pasos [{tx,ty}] sin el de
  // partida y con el de llegada, [] si ya esta ahi, o null si no se llega.
  // walkableTileOverride "tx,ty": esa baldosa se puede pisar aunque este bloqueada (el asiento).
  // maxPasos (nuevo, opcional): mas lejos que eso cuenta como que no se llega.
  function bfsPath(o) {
    const sx = o.startX, sy = o.startY, ex = o.endX, ey = o.endY;
    const tileExists = o.tileExists, isBlocked = o.isBlocked, ocupadas = o.occupiedTiles, permitida = o.walkableTileOverride;
    const max = o.maxPasos == null ? Infinity : o.maxPasos;
    const fin = ex + ',' + ey;
    if (!tileExists(ex, ey) || (permitida !== fin && isBlocked(ex, ey))) return null;
    if (ocupadas && ocupadas.has(fin)) return null;
    if (sx === ex && sy === ey) return [];
    const inicio = sx + ',' + sy;
    const padre = new Map([[inicio, null]]);
    const cola = [{ x: sx, y: sy, n: 0 }];
    const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (let q = 0; q < cola.length; q++) {
      const cur = cola[q];
      if (cur.n >= max) continue;
      for (let d = 0; d < 4; d++) {
        const nx = cur.x + dirs[d][0], ny = cur.y + dirs[d][1];
        const k = nx + ',' + ny;
        if (padre.has(k)) continue;
        if (!tileExists(nx, ny)) continue;
        if (k !== permitida && isBlocked(nx, ny)) continue;
        if (ocupadas && ocupadas.has(k)) continue;
        padre.set(k, cur.x + ',' + cur.y);
        if (nx === ex && ny === ey) {
          const camino = [];
          let c = k;
          while (c !== inicio) {
            const p = c.split(',');
            camino.push({ tx: +p[0], ty: +p[1] });
            c = padre.get(c);
          }
          return camino.reverse();
        }
        cola.push({ x: nx, y: ny, n: cur.n + 1 });
      }
    }
    return null;
  }

  const PASOS_MAX = 256;
  const MS_POR_PASO = 455; // 2,2 baldosas por segundo, como PawHotel (SPEED_TPS)

  // Camino dentro de una sala. o: {capa, desde:{x,y}, hasta:{x,y}, bloqueos:Set, gente:Set,
  // permitida?:"tx,ty", maxPasos?}. Devuelve [{tx,ty}] o null.
  function camino(o) {
    const capa = o.capa, bl = o.bloqueos || new Set();
    return bfsPath({
      startX: o.desde.x, startY: o.desde.y, endX: o.hasta.x, endY: o.hasta.y,
      tileExists: function (x, y) { return existe(capa, x, y); },
      isBlocked: function (x, y) { return bl.has(clave(x, y)); },
      occupiedTiles: o.gente || null,
      walkableTileOverride: o.permitida || null,
      maxPasos: o.maxPasos == null ? PASOS_MAX : o.maxPasos,
    });
  }

  // Ir a sentarse (sittingRuntime.tryToSit): primero derecho al asiento (se puede pisar aunque
  // sea parte del mueble); si no se llega, a la primera vecina alcanzable (O, E, N, S) y al
  // llegar se acomoda. Devuelve { camino, x, y } (x,y: donde termina de caminar) o null.
  function caminoAlAsiento(o, asiento) {
    let c = camino(Object.assign({}, o, { hasta: { x: asiento.tx, y: asiento.ty }, permitida: clave(asiento.tx, asiento.ty) }));
    if (c) return { camino: c, x: asiento.tx, y: asiento.ty };
    const vecinas = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (let i = 0; i < 4; i++) {
      const x = asiento.tx + vecinas[i][0], y = asiento.ty + vecinas[i][1];
      c = camino(Object.assign({}, o, { hasta: { x: x, y: y }, permitida: null }));
      if (c) return { camino: c, x: x, y: y };
    }
    return null;
  }

  // El camino como cadena de direcciones 0-7 (hotel:mov {x,y,c}).
  function codificarCamino(x, y, pasos) {
    let s = '', cx = x, cy = y;
    for (let i = 0; i < pasos.length; i++) {
      const dx = pasos[i].tx - cx, dy = pasos[i].ty - cy;
      let d = -1;
      for (let j = 0; j < 8; j++) if (DIR_VECTORS[j].dx === dx && DIR_VECTORS[j].dy === dy) { d = j; break; }
      if (d < 0) return null; // pasos que no son vecinos
      s += d;
      cx = pasos[i].tx; cy = pasos[i].ty;
    }
    return s;
  }

  // La cadena de vuelta a pasos [{tx,ty}], o null si trae algo raro o mas de PASOS_MAX.
  function decodificarCamino(x, y, c) {
    if (typeof c !== 'string' || c.length > PASOS_MAX || !/^[0-7]*$/.test(c)) return null;
    if (!Number.isInteger(x) || !Number.isInteger(y)) return null;
    const out = [];
    let cx = x, cy = y;
    for (let i = 0; i < c.length; i++) {
      const v = DIR_VECTORS[c.charCodeAt(i) - 48];
      cx += v.dx; cy += v.dy;
      out.push({ tx: cx, ty: cy });
    }
    return out;
  }

  // Donde va alguien que arranco en (x,y) con la cadena c hace ms milisegundos:
  // { x, y, pasos (dados), dir (la del ultimo paso o null), llego }.
  function posicionEnCamino(x, y, c, ms) {
    const pasos = decodificarCamino(x, y, c) || [];
    const n = Math.max(0, Math.min(pasos.length, Math.floor((Number(ms) || 0) / MS_POR_PASO)));
    const p = n > 0 ? pasos[n - 1] : { tx: x, ty: y };
    return { x: p.tx, y: p.ty, pasos: n, dir: n > 0 ? c.charCodeAt(n - 1) - 48 : null, llego: n >= pasos.length };
  }

  // ===================================================================================
  // Pared (wallPlacement.js)
  // ===================================================================================

  const LIMITES_PARED_BASE = Object.freeze({ minOx: 14, maxOx: 86, minOy: 18, maxOy: 82 });
  // Por tipo. Las notas de PawHotel tenian otros ids; en CV son nota y pad_notas.
  const LIMITES_PARED = Object.freeze({
    nota: Object.freeze({ minOx: 14, maxOx: 86, minOy: 14, maxOy: 84 }),
    pad_notas: Object.freeze({ minOx: 14, maxOx: 86, minOy: 14, maxOy: 84 }),
    cartel_cv: Object.freeze({ minOx: 22, maxOx: 78, minOy: 40, maxOy: 58 }), // la imagen (115 de alto) entra en la pared
    window: Object.freeze({ minOx: 22, maxOx: 78, minOy: 34, maxOy: 78 }),
    ventana: Object.freeze({ minOx: 22, maxOx: 78, minOy: 34, maxOy: 78 }),
    poster: Object.freeze({ minOx: 18, maxOx: 82, minOy: 22, maxOy: 82 }),
    bandera: Object.freeze({ minOx: 18, maxOx: 82, minOy: 24, maxOy: 82 }),
  });

  function limitesValidos(l) {
    return !!l && typeof l === 'object' && enteroEn(l.minOx, 0, 100) && enteroEn(l.maxOx, 0, 100) &&
      enteroEn(l.minOy, 0, 100) && enteroEn(l.maxOy, 0, 100) && l.minOx <= l.maxOx && l.minOy <= l.maxOy;
  }

  // type puede ser el id (string) o la entrada del catalogo (usa entrada.limitesPared si es valida).
  function getWallPlacementLimits(type) {
    if (type && typeof type === 'object') {
      if (limitesValidos(type.limitesPared)) return type.limitesPared;
      type = type.id;
    }
    const k = String(type || '');
    return hasOwn.call(LIMITES_PARED, k) ? LIMITES_PARED[k] : LIMITES_PARED_BASE;
  }

  function isValidWallPlacement(hit, type) {
    if (!hit || (hit.side !== 'north' && hit.side !== 'west')) return false;
    const ox = Number(hit.ox), oy = Number(hit.oy);
    if (!Number.isFinite(ox) || !Number.isFinite(oy)) return false;
    const l = getWallPlacementLimits(type);
    return ox >= l.minOx && ox <= l.maxOx && oy >= l.minOy && oy <= l.maxOy;
  }

  function getValidWallPlacement(hit, type) { return isValidWallPlacement(hit, type) ? hit : null; }

  function makeWallKey(side, tx, ty, ox, oy) { return 'wall:' + side + ':' + tx + ',' + ty + ':' + ox + ',' + oy; }

  // Igual que index.module.js: { side, tx, ty, ox, oy } (sin ox,oy -> 0,0).
  function parseWallKey(key) {
    const p = String(key).split(':');
    const t = String(p[2] || '').split(',').map(Number);
    const o = p[3] ? p[3].split(',').map(Number) : [0, 0];
    return { side: p[1], tx: t[0], ty: t[1], ox: o[0], oy: o[1] };
  }

  // Estricta, para lo que llega de afuera: { lado, tx, ty, ox, oy } o null.
  function leerClavePared(k) {
    const r = typeof k === 'string' && /^wall:(north|west):([0-9]{1,2}),([0-9]{1,2}):([0-9]{1,3}),([0-9]{1,3})$/.exec(k);
    if (!r) return null;
    const v = { lado: r[1], tx: +r[2], ty: +r[3], ox: +r[4], oy: +r[5] };
    if (v.tx > 63 || v.ty > 63 || v.ox > 100 || v.oy > 100) return null;
    return v;
  }

  // La pared existe en esa baldosa: norte si no hay piso arriba, oeste si no hay piso a la izquierda
  // (lo mismo que mira hitTestWall para dibujarla).
  function paredEnBorde(capa, lado, tx, ty) {
    if (!existe(capa, tx, ty)) return false;
    if (lado === 'north') return !existe(capa, tx, ty - 1);
    if (lado === 'west') return !existe(capa, tx - 1, ty);
    return false;
  }

  // ¿Se puede colgar ahi? -> { ok:true, clave } o { error }.
  function puedeColgar(capa, claveP, entrada) {
    const v = leerClavePared(claveP);
    if (!v) return { error: 'Esa pared no es válida.' };
    if (!paredEnBorde(capa, v.lado, v.tx, v.ty)) return { error: 'Ahí no hay pared.' };
    if (!isValidWallPlacement({ side: v.lado, ox: v.ox, oy: v.oy }, entrada)) return { error: 'No entra en ese lugar de la pared.' };
    return { ok: true, clave: makeWallKey(v.lado, v.tx, v.ty, v.ox, v.oy) };
  }

  // ¿Se puede poner un mueble de piso ahi? o: { capa, x, y, rot, entrada, ocupadasMuebles:Set
  // (todas las baldosas tapadas por otros muebles), gente:Set }. Toda la huella tiene que
  // existir, estar libre de muebles y de gente, y no tapar la puerta (salvo que sea caminable).
  // -> { ok:true, clave, baldosas } o { error }.
  function puedePoner(o) {
    const capa = o.capa;
    if (!enteroEn(o.x, 0, capa.w - 1) || !enteroEn(o.y, 0, capa.h - 1) || !enteroEn(o.rot || 0, 0, 3)) return { error: 'Ese lugar no existe.' };
    const bs = baldosasDeMueble(o.x, o.y, o.rot || 0, o.entrada);
    const pu = puerta(capa);
    const muebles = o.ocupadasMuebles || new Set(), gente = o.gente || new Set();
    for (let i = 0; i < bs.length; i++) {
      const t = bs[i], k = clave(t.tx, t.ty);
      if (!existe(capa, t.tx, t.ty)) return { error: 'No entra ahí.' };
      if (muebles.has(k)) return { error: 'Ahí ya hay un mueble.' };
      if (gente.has(k)) return { error: 'Hay alguien parado ahí.' };
      if (t.tx === pu.x && t.ty === pu.y && !(o.entrada && o.entrada.walkable)) return { error: 'No tapes la puerta.' };
    }
    return { ok: true, clave: clave(o.x, o.y), baldosas: bs };
  }

  // Todas las baldosas tapadas por una lista de muebles de piso [{x,y,rot,entrada}] -> Set.
  function ocupadasPorMuebles(muebles, menos) {
    const set = new Set();
    for (let i = 0; i < muebles.length; i++) {
      const mu = muebles[i];
      if (!mu || mu.pared || (menos != null && mu.m === menos)) continue;
      const bs = baldosasDeMueble(mu.x, mu.y, mu.rot, mu.entrada);
      for (let j = 0; j < bs.length; j++) set.add(clave(bs[j].tx, bs[j].ty));
    }
    return set;
  }

  // ===================================================================================
  // El muñeco (config/avatar.js)
  // ===================================================================================

  const PARTES = Object.freeze(['hair', 'face', 'shirt', 'pants', 'shoes']);
  const VARIANTES = Object.freeze({ hair: 3, face: 4, shirt: 4, pants: 3, shoes: 4 });
  // face es la piel: faceC elige el color de piel.
  const COLORES = Object.freeze({
    hair: Object.freeze(['#1a1a1a', '#3b1f0e', '#6b3a1e', '#a0522d', '#c8860a', '#caa04a', '#e8d48b', '#f5f0e8', '#b21f3b', '#d63384', '#9b30ff', '#2266cc', '#3aa86b']),
    face: Object.freeze(['#fddbb4', '#f2c38a', '#e6a56b', '#d1875a', '#b9734a', '#8d5524', '#613c1e']),
    shirt: Object.freeze(['#7c5cbf', '#4a2f8a', '#e85d8a', '#c42b5e', '#37d4ff', '#0a8fd4', '#ffcc4d', '#e67e00', '#34d399', '#15803d', '#f87171', '#1e293b', '#ffffff', '#374151']),
    pants: Object.freeze(['#1a1a2e', '#0f172a', '#2f3b5f', '#1d4ed8', '#374151', '#6b7280', '#8b5a2b', '#5c3d1e', '#166534', '#7f1d1d', '#e2e8f0']),
    shoes: Object.freeze(['#0b0b10', '#1c1c1c', '#374151', '#6b7280', '#8b4513', '#5c3317', '#c8a97e', '#f0f0f0', '#1d4ed8', '#dc2626', '#15803d']),
  });
  const AVATAR_BASE = Object.freeze({ hairV: 0, faceV: 0, shirtV: 0, pantsV: 0, shoesV: 0, hairC: 0, faceC: 0, shirtC: 0, pantsC: 0, shoesC: 0 });
  const NOMBRE_PARTE = { hair: 'pelo', face: 'cara', shirt: 'remera', pants: 'pantalón', shoes: 'zapatos' };

  // -> { ok:true, avatar } (con todas las claves, lo que falta en 0) o { error }.
  function validarAvatar(a) {
    if (a === null || typeof a !== 'object' || Array.isArray(a)) return { error: 'El muñeco no es válido.' };
    const pr = Object.getPrototypeOf(a);
    const plano = pr === null || pr === Object.prototype ||
      (Object.getPrototypeOf(pr) === null && hasOwn.call(pr, 'isPrototypeOf')); // objeto de otra ventana
    if (!plano || Object.prototype.toString.call(a) !== '[object Object]') return { error: 'El muñeco no es válido.' };
    const ks = Object.keys(a);
    for (let i = 0; i < ks.length; i++) if (!hasOwn.call(AVATAR_BASE, ks[i])) return { error: 'El muñeco trae datos raros.' };
    const out = {};
    for (let i = 0; i < PARTES.length; i++) {
      const p = PARTES[i];
      const v = hasOwn.call(a, p + 'V') ? a[p + 'V'] : 0;
      const c = hasOwn.call(a, p + 'C') ? a[p + 'C'] : 0;
      if (!enteroEn(v, 0, VARIANTES[p] - 1)) return { error: 'Elegí un ' + NOMBRE_PARTE[p] + ' que exista.' };
      if (!enteroEn(c, 0, COLORES[p].length - 1)) return { error: 'Elegí un color de ' + NOMBRE_PARTE[p] + ' que exista.' };
      out[p + 'V'] = v; out[p + 'C'] = c;
    }
    return { ok: true, avatar: out };
  }

  // El color de la remera (en PawHotel p.color) sale del avatar.
  function colorRemera(avatar) { return COLORES.shirt[(avatar && avatar.shirtC) || 0] || COLORES.shirt[0]; }

  // ===================================================================================
  // Poses (admin-avatar-seat-pose y admin-avatar-pose-offset -> admin/pose)
  // ===================================================================================

  const POSE = Object.freeze({
    COORD_MIN: -64, COORD_MAX: 64, TAM_MIN: 1, TAM_MAX: 64,
    CABEZA_MIN: -100, CABEZA_MAX: 0, PARTES_MAX: 64,
    CORRIMIENTO_MIN: -32, CORRIMIENTO_MAX: 32, TAPA_SILLA: 0.55,
  });
  const COLOR_REFS = Object.freeze(['shirt', 'shirtDark', 'shirtShade', 'shirtBackShade', 'pants', 'shoes', 'skin']);
  const HEX_RE = /^#[0-9a-fA-F]{3,8}$/;
  const PARTE_ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
  const AMBITO_RE = /^[a-z0-9_]{2,60}$/; // 'global' o el id de un mueble del catalogo

  function enteroRedondo(v, min, max) {
    const n = Number(v);
    if (typeof v !== 'number' || !Number.isFinite(n)) return null;
    const r = Math.round(n);
    if (r < min || r > max) return null;
    return r;
  }

  function validarParte(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const x = enteroRedondo(raw.x, POSE.COORD_MIN, POSE.COORD_MAX);
    const y = enteroRedondo(raw.y, POSE.COORD_MIN, POSE.COORD_MAX);
    const w = enteroRedondo(raw.w, POSE.TAM_MIN, POSE.TAM_MAX);
    const h = enteroRedondo(raw.h, POSE.TAM_MIN, POSE.TAM_MAX);
    if (x === null || y === null || w === null || h === null) return null;
    const color = raw.color;
    if (typeof color !== 'string') return null;
    if (COLOR_REFS.indexOf(color) < 0 && !HEX_RE.test(color)) return null;
    const id = typeof raw.id === 'string' && PARTE_ID_RE.test(raw.id) ? raw.id : 'p_' + x + '_' + y;
    const out = { id: id, x: x, y: y, w: w, h: h, color: color };
    if (typeof raw.name === 'string' && raw.name.length > 0 && raw.name.length <= 40 && !/[\u0000-\u001f\u007f]/.test(raw.name)) out.name = raw.name;
    return out;
  }

  // body: { tipo:'partes'|'corrimiento', ambito:'global'|<id del catalogo>, pose:0..3, borrar?:true, ... }
  //  partes:      parts:[{id,x,y,w,h,color,name?}] (1..64), headBottomY (-100..0), chairOnTop?, chairCoverHeightRatio? (0..1)
  //  corrimiento: dx, dy (-32..32)
  // -> { ok:true, tipo, ambito, pose, borrar, datos } (tipo+ambito+pose es la clave de puente_hotel_poses) o { error }.
  function validarPose(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'La pose no es válida.' };
    const tipo = body.tipo;
    if (tipo !== 'partes' && tipo !== 'corrimiento') return { error: 'Ese tipo de pose no existe.' };
    const ambito = body.ambito;
    if (typeof ambito !== 'string' || !AMBITO_RE.test(ambito)) return { error: 'El mueble de la pose no es válido.' };
    const pose = body.pose;
    if (typeof pose !== 'number' || !Number.isInteger(pose) || pose < 0 || pose > 3) return { error: 'La pose tiene que ser de 0 a 3.' };
    const base = { ok: true, tipo: tipo, ambito: ambito, pose: pose };
    if (body.borrar === true) return Object.assign(base, { borrar: true, datos: null });

    if (tipo === 'corrimiento') {
      if (typeof body.dx !== 'number' || typeof body.dy !== 'number' || !Number.isFinite(body.dx) || !Number.isFinite(body.dy)) return { error: 'El corrimiento no es válido.' };
      const dx = Math.round(body.dx), dy = Math.round(body.dy);
      if (dx < POSE.CORRIMIENTO_MIN || dx > POSE.CORRIMIENTO_MAX) return { error: 'El corrimiento dx se pasa de rango.' };
      if (dy < POSE.CORRIMIENTO_MIN || dy > POSE.CORRIMIENTO_MAX) return { error: 'El corrimiento dy se pasa de rango.' };
      return Object.assign(base, { borrar: false, datos: { dx: dx, dy: dy } });
    }

    if (!Array.isArray(body.parts)) return { error: 'Faltan las partes.' };
    if (body.parts.length === 0) return { error: 'La pose no tiene partes.' };
    if (body.parts.length > POSE.PARTES_MAX) return { error: 'Son demasiadas partes (hasta ' + POSE.PARTES_MAX + ').' };
    const parts = [];
    for (let i = 0; i < body.parts.length; i++) {
      const v = validarParte(body.parts[i]);
      if (!v) return { error: 'Hay una parte que no es válida.' };
      parts.push(v);
    }
    const headBottomY = enteroRedondo(body.headBottomY, POSE.CABEZA_MIN, POSE.CABEZA_MAX);
    if (headBottomY === null) return { error: 'La altura de la cabeza no es válida.' };
    const chairOnTop = body.chairOnTop === true;
    let tapa = POSE.TAPA_SILLA;
    if (body.chairCoverHeightRatio !== undefined) {
      const r = body.chairCoverHeightRatio;
      if (typeof r !== 'number' || !Number.isFinite(r) || r < 0 || r > 1) return { error: 'Lo que tapa la silla no es válido.' };
      tapa = Math.round(r * 100) / 100;
    }
    return Object.assign(base, { borrar: false, datos: { parts: parts, headBottomY: headBottomY, chairOnTop: chairOnTop, chairCoverHeightRatio: tapa } });
  }

  // Rotacion de la silla (0..3) -> pose (0..3), como avatarSeatPoses.chairRotToPose.
  const ROT_A_POSE = Object.freeze([0, 3, 2, 1]);
  function chairRotToPose(rot) { return ROT_A_POSE[((Number(rot) % 4) + 4) % 4]; }

  // ===================================================================================
  // Decoracion y salas del club (rooms/roomRuntime.js, lo que no depende de Firebase)
  // ===================================================================================

  function getPublicRoomSize(roomId, activeDecorConfig, defaultPublicRooms) {
    const lista = (activeDecorConfig && Array.isArray(activeDecorConfig.publicRooms) && activeDecorConfig.publicRooms.length)
      ? activeDecorConfig.publicRooms : defaultPublicRooms;
    const room = (lista || []).find(function (r) { return r.id === roomId; }) || null;
    return {
      width: Math.max(6, Math.floor(Number(room && room.width) || 12)),
      height: Math.max(6, Math.floor(Number(room && room.height) || 10)),
    };
  }

  function sanitizePatterns(list, fallback, cloneJson) {
    if (!Array.isArray(list) || list.length === 0) return cloneJson(fallback);
    return list
      .filter(function (x) { return x && typeof x.id === 'string' && x.id.trim(); })
      .map(function (x) {
        return { id: String(x.id).trim(), name: String(x.name || x.id).trim(), desc: String(x.desc || '').trim() };
      });
  }

  function sanitizeColors(list, defaultDecorColors, cloneJson) {
    if (!Array.isArray(list) || list.length === 0) return cloneJson(defaultDecorColors);
    const hex = /^#([0-9a-fA-F]{6})$/;
    const limpio = list
      .filter(function (x) { return x && typeof x.hex === 'string' && hex.test(String(x.hex).trim()); })
      .map(function (x) { return { name: String(x.name || x.hex).trim(), hex: String(x.hex).trim() }; });
    return limpio.length ? limpio : cloneJson(defaultDecorColors);
  }

  function hasRights(o) { return o.isRoomOwner() || o.roomRights.has(o.uid); }

  // ===================================================================================

  const API = {
    // PawHotel (mismos nombres, para los envoltorios ESM)
    DIR_VECTORS: DIR_VECTORS, angleToDir8: angleToDir8, bodyDirToSittingPose: bodyDirToSittingPose,
    sittingPoseToBodyDir: sittingPoseToBodyDir, clampHeadDir: clampHeadDir, headDirFromTileTarget: headDirFromTileTarget,
    ROOM_LAYOUTS: ROOM_LAYOUTS, tileExistsInRoom: tileExistsInRoom, getLayoutState: getLayoutState,
    getDoorTyForRoom: getDoorTyForRoom, isLShapeRoom: isLShapeRoom, isHexRoom: isHexRoom,
    getLShapeDoorTile: getLShapeDoorTile, getHexDoorTileForRoom: getHexDoorTileForRoom,
    getDoorSpawnForRoom: getDoorSpawnForRoom, isDoorPlayerAtSpawn: isDoorPlayerAtSpawn, getDoorRoomTile: getDoorRoomTile,
    rotateTileOffset: rotateTileOffset, getShapeForRotation: getShapeForRotation, getOccupiedTiles: getOccupiedTiles,
    getSeatsForRotation: getSeatsForRotation, getSeatTiles: getSeatTiles, getShapeFromEntry: getShapeFromEntry,
    buildOccupiedTilesMap: buildOccupiedTilesMap,
    createIsBlocked: createIsBlocked, bfsPath: bfsPath,
    getWallPlacementLimits: getWallPlacementLimits, isValidWallPlacement: isValidWallPlacement,
    getValidWallPlacement: getValidWallPlacement, makeWallKey: makeWallKey, parseWallKey: parseWallKey,
    chairRotToPose: chairRotToPose, COLOR_REFS: COLOR_REFS,
    getPublicRoomSize: getPublicRoomSize, sanitizePatterns: sanitizePatterns, sanitizeColors: sanitizeColors, hasRights: hasRights,
    // CV Hotel
    CAPAS: CAPAS, LADO_MIN: LADO_MIN, LADO_MAX: LADO_MAX, mascaraDeHuecos: mascaraDeHuecos,
    crearCapa: crearCapa, existe: existe, contarBaldosas: contarBaldosas, puerta: puerta,
    entradaDesdeCatalogo: entradaDesdeCatalogo, clave: clave, baldosasDeMueble: baldosasDeMueble,
    bloqueosDeMuebles: bloqueosDeMuebles, ocupadasPorMuebles: ocupadasPorMuebles, ocupadasPorGente: ocupadasPorGente,
    asientosDeMueble: asientosDeMueble,
    PASOS_MAX: PASOS_MAX, MS_POR_PASO: MS_POR_PASO, camino: camino, caminoAlAsiento: caminoAlAsiento,
    codificarCamino: codificarCamino, decodificarCamino: decodificarCamino, posicionEnCamino: posicionEnCamino,
    LIMITES_PARED: LIMITES_PARED, LIMITES_PARED_BASE: LIMITES_PARED_BASE, leerClavePared: leerClavePared,
    paredEnBorde: paredEnBorde, puedeColgar: puedeColgar, puedePoner: puedePoner,
    PARTES: PARTES, VARIANTES: VARIANTES, COLORES: COLORES, AVATAR_BASE: AVATAR_BASE,
    validarAvatar: validarAvatar, colorRemera: colorRemera,
    POSE: POSE, validarParte: validarParte, validarPose: validarPose,
  };
  Object.freeze(API);
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else raiz.HotelMotor = API;
})(typeof window !== 'undefined' ? window : globalThis);
