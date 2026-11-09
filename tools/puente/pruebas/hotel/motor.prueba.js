// Pruebas de motor.js. Las primeras son las de PawHotel portadas tal cual (cambia solo el
// arnes); despues vienen las de lo nuevo. Correr: node motor.prueba.js
'use strict';
const { describir, prueba, fin, assert } = require('./arnes.js');
const M = require('../../web/hotel/motor.js');
const igual = assert.deepStrictEqual;

// ===================== Portadas: tests/game/directionHelpers.test.js =====================
describir('angleToDir8', () => {
  prueba('cada vector unitario vuelve a su propio id', () => {
    for (let i = 0; i < 8; i++) {
      const { dx, dy } = M.DIR_VECTORS[i];
      igual(M.angleToDir8(dx, dy), i);
    }
  });
  prueba('el vector cero da 4 (S, de frente)', () => igual(M.angleToDir8(0, 0), 4));
  prueba('las diagonales casi cardinales caen a la cardinal', () => {
    igual(M.angleToDir8(10, 1), 6);
    igual(M.angleToDir8(1, -10), 0);
  });
  prueba('las diagonales de 45 grados quedan diagonales', () => {
    igual(M.angleToDir8(5, 5), 5);
    igual(M.angleToDir8(-5, -5), 1);
  });
});

describir('poses de sentado', () => {
  prueba('Math.floor(dir/2): (0,1)->0, (2,3)->1, (4,5)->2, (6,7)->3', () => {
    const esperado = [0, 0, 1, 1, 2, 2, 3, 3];
    for (let d = 0; d < 8; d++) igual(M.bodyDirToSittingPose(d), esperado[d]);
  });
  prueba('negativos y mayores que 7 dan la vuelta', () => {
    igual(M.bodyDirToSittingPose(-1), M.bodyDirToSittingPose(7));
    igual(M.bodyDirToSittingPose(8), 0);
    igual(M.bodyDirToSittingPose(16), 0);
  });
  prueba('sittingPoseToBodyDir da la cardinal de cada pose', () => {
    igual(M.sittingPoseToBodyDir(0), 0);
    igual(M.sittingPoseToBodyDir(1), 2);
    igual(M.sittingPoseToBodyDir(2), 4);
    igual(M.sittingPoseToBodyDir(3), 6);
  });
  prueba('ida y vuelta pose -> dir -> pose', () => {
    for (let p = 0; p < 4; p++) igual(M.bodyDirToSittingPose(M.sittingPoseToBodyDir(p)), p);
  });
});

describir('clampHeadDir sin nuca', () => {
  prueba('si cabeza y cuerpo coinciden, no cambia', () => {
    for (let b = 0; b < 8; b++) igual(M.clampHeadDir(b, b), b);
  });
  prueba('nunca da una cabeza opuesta (delta 4) al cuerpo', () => {
    for (let b = 0; b < 8; b++) for (let h = 0; h < 8; h++) {
      const c = M.clampHeadDir(h, b);
      assert.notEqual(((c - b) % 8 + 8) % 8, 4);
    }
  });
  prueba('respeta lo pedido si no es opuesto', () => {
    for (let b = 0; b < 8; b++) for (let h = 0; h < 8; h++) {
      if (((h - b) % 8 + 8) % 8 === 4) continue;
      igual(M.clampHeadDir(h, b), h);
    }
  });
  prueba('el opuesto exacto cae siempre en el vecino de -3', () => {
    igual(M.clampHeadDir(4, 0), 5);
    igual(M.clampHeadDir(0, 4), 1);
  });
  prueba('acepta valores fuera de rango y los da vuelta', () => {
    igual(M.clampHeadDir(8, 0), 0);
    igual(M.clampHeadDir(-1, 0), 7);
    igual(M.clampHeadDir(9, 1), 1);
  });
});

describir('headDirFromTileTarget', () => {
  prueba('mira al objetivo si no queda a la espalda', () => {
    igual(M.headDirFromTileTarget(0, 0, 5, 0, 4), 6);
    igual(M.headDirFromTileTarget(0, 0, -3, 3, 6), 3);
  });
  prueba('si el objetivo esta justo atras, se corrige', () => {
    igual(M.headDirFromTileTarget(0, 0, 0, 5, 0), 5);
  });
});

// ===================== Portadas: tests/game/furnitureGeometry.test.js =====================
describir('furnitureGeometry: asientos viejos', () => {
  prueba('normaliza la lista vieja con valores por defecto', () => {
    igual(M.getSeatsForRotation({ seats: [{ shapeTileIndex: 0 }] }, 0), [
      { shapeTileIndex: 0, id: 'seat_0', direction: 4, visualOffset: { x: 0, y: -8 } },
    ]);
  });
  prueba('ubica los asientos viejos sobre las baldosas ocupadas', () => {
    const seats = M.getSeatsForRotation({ seats: [{ shapeTileIndex: 1, direction: 2 }] }, 0);
    igual(M.getSeatTiles(5, 6, seats, [{ dx: 0, dy: 0 }, { dx: 1, dy: 0 }], 0), [
      { tx: 6, ty: 6, seatId: 'seat_0', direction: 2, visualOffset: { x: 0, y: -8 } },
    ]);
  });
});

// ===================== Portadas: tests/game/rooms.test.js =====================
describir('rooms', () => {
  prueba('baldosa existente con limites y mascara', () => {
    const mask = (tx, ty) => !(tx === 0 && ty === 0);
    igual(M.tileExistsInRoom(1, 1, 4, 4, null), true);
    igual(M.tileExistsInRoom(-1, 1, 4, 4, null), false);
    igual(M.tileExistsInRoom(0, 0, 4, 4, mask), false);
  });
  prueba('fila de la puerta en la pared oeste, la valida mas cercana', () => {
    const tileExists = (tx, ty) => tx === 0 && [2, 4].includes(ty);
    igual(M.getDoorTyForRoom(6, tileExists), 2);
  });
  prueba('primer candidato valido de puerta hexagonal', () => {
    const valid = new Set(['3,3', '4,3']);
    const tileExists = (tx, ty) => valid.has(`${tx},${ty}`);
    igual(M.getHexDoorTileForRoom(12, 10, tileExists, () => 5), { tx: 3, ty: 3 });
  });
  prueba('donde aparece en la puerta, normal y hexagonal', () => {
    igual(M.getDoorSpawnForRoom({ isLShapeLayout: false, isHexRoomLayout: false, getHexDoorTile: () => ({ tx: 4, ty: 3 }), getDoorTy: () => 6 }), { x: -1, y: 6 });
    igual(M.getDoorSpawnForRoom({ isLShapeLayout: false, isHexRoomLayout: true, getHexDoorTile: () => ({ tx: 4, ty: 3 }), getDoorTy: () => 6 }), { x: 3, y: 3 });
  });
  prueba('detecta a quien esta parado en la puerta', () => {
    igual(M.isDoorPlayerAtSpawn({ px: 2.2, py: 4.4 }, { x: 2, y: 4 }), true);
    igual(M.isDoorPlayerAtSpawn({ px: 3, py: 4 }, { x: 2, y: 4 }), false);
  });
});

// ===================== Portadas: tests/rooms/roomRuntime.test.js (lo que no es Firebase) ====
describir('roomRuntime', () => {
  prueba('medidas de las salas del club con minimo', () => {
    const rooms = [{ id: 'tiny', width: 2, height: 3 }];
    igual(M.getPublicRoomSize('tiny', { publicRooms: rooms }, rooms), { width: 6, height: 6 });
  });
  prueba('limpia patrones y usa el de respaldo si no sirven', () => {
    const fallback = [{ id: 'plain', name: 'Lisa', desc: '' }];
    igual(M.sanitizePatterns([], fallback, structuredClone), fallback);
    igual(M.sanitizePatterns([{ id: ' brick ', name: 'Ladrillo', desc: 12 }], fallback, structuredClone), [{ id: 'brick', name: 'Ladrillo', desc: '12' }]);
  });
  prueba('limpia colores y rechaza los hex invalidos', () => {
    const fallback = [{ name: 'Blanco', hex: '#ffffff' }];
    igual(M.sanitizeColors([{ name: 'Bad', hex: 'red' }], fallback, structuredClone), fallback);
    igual(M.sanitizeColors([{ name: 'Azul', hex: '#112233' }], fallback, structuredClone), [{ name: 'Azul', hex: '#112233' }]);
  });
  prueba('derechos: el dueño o quien los tenga', () => {
    igual(M.hasRights({ isRoomOwner: () => true, roomRights: new Set(), uid: 'a' }), true);
    igual(M.hasRights({ isRoomOwner: () => false, roomRights: new Set(['a']), uid: 'a' }), true);
    igual(M.hasRights({ isRoomOwner: () => false, roomRights: new Set(['a']), uid: 'b' }), false);
  });
});

// ===================== Portadas: tests/functions/adminAvatarSeatPose.test.js (18) ==========
// Cambia la forma del pedido: scope/furniId -> ambito ('global' o el id del mueble) y se suma
// tipo:'partes'. Las dos de buildSeatPosePath (rutas de Firebase) pasan a mirar la clave de
// puente_hotel_poses (tipo, ambito, pose).
describir('validarPose partes', () => {
  const okPart = { id: 'torso', x: -9, y: -36, w: 18, h: 18, color: 'shirt' };
  const P = (o) => M.validarPose(Object.assign({ tipo: 'partes' }, o));
  prueba('acepta una pose global', () => {
    const v = P({ ambito: 'global', pose: 0, parts: [okPart], headBottomY: -36, chairOnTop: false });
    igual(v.error, undefined); igual(v.ambito, 'global'); igual(v.datos.parts.length, 1); igual(v.datos.headBottomY, -36);
  });
  prueba('acepta la de una silla', () => {
    const v = P({ ambito: 'chair_a', pose: 2, parts: [okPart], headBottomY: -30, chairOnTop: true });
    igual(v.error, undefined); igual(v.ambito, 'chair_a'); igual(v.datos.chairOnTop, true);
  });
  prueba('acepta borrar sin partes', () => {
    const v = P({ ambito: 'global', pose: 1, borrar: true });
    igual(v.error, undefined); igual(v.borrar, true);
  });
  prueba('rechaza un tipo que no existe', () => assert.ok(M.validarPose({ tipo: 'foo', ambito: 'global', pose: 0 }).error));
  prueba('rechaza la pose fuera de rango', () => {
    assert.ok(P({ ambito: 'global', pose: 4, parts: [okPart], headBottomY: 0 }).error);
    assert.ok(P({ ambito: 'global', pose: -1, parts: [okPart], headBottomY: 0 }).error);
  });
  prueba('rechaza la silla sin id valido', () => {
    assert.ok(P({ pose: 0, parts: [okPart], headBottomY: 0 }).error);
    assert.ok(P({ ambito: 'bad space', pose: 0, parts: [okPart], headBottomY: 0 }).error);
  });
  prueba('rechaza partes vacias', () => assert.ok(P({ ambito: 'global', pose: 0, parts: [], headBottomY: 0 }).error));
  prueba('rechaza partes invalidas', () => assert.ok(P({ ambito: 'global', pose: 0, parts: [{ x: 0, y: 0, w: 5, h: 5, color: 'not-a-color' }], headBottomY: 0 }).error));
  prueba('rechaza mas de 64 partes', () => assert.ok(P({ ambito: 'global', pose: 0, parts: Array.from({ length: 65 }, () => ({ ...okPart })), headBottomY: 0 }).error));
  prueba('rechaza headBottomY fuera de rango', () => assert.ok(P({ ambito: 'global', pose: 0, parts: [okPart], headBottomY: 1000 }).error));
  prueba('acepta un color hex en una parte', () => {
    igual(P({ ambito: 'global', pose: 0, parts: [{ id: 't', x: 0, y: 0, w: 5, h: 5, color: '#ff00aa' }], headBottomY: -10 }).error, undefined);
  });
  prueba('redondea las coordenadas', () => {
    const v = P({ ambito: 'global', pose: 0, parts: [{ id: 'p', x: 1.7, y: -2.4, w: 5.5, h: 5, color: 'shirt' }], headBottomY: -20 });
    igual(v.datos.parts[0].x, 2); igual(v.datos.parts[0].y, -2); igual(v.datos.parts[0].w, 6);
  });
  prueba('chairCoverHeightRatio: 0.55 si no viene', () => igual(P({ ambito: 'global', pose: 0, parts: [okPart], headBottomY: -36 }).datos.chairCoverHeightRatio, 0.55));
  prueba('chairCoverHeightRatio: acepta 0..1', () => igual(P({ ambito: 'global', pose: 0, parts: [okPart], headBottomY: -36, chairCoverHeightRatio: 0.42 }).datos.chairCoverHeightRatio, 0.42));
  prueba('chairCoverHeightRatio: rechaza fuera de rango', () => {
    assert.ok(P({ ambito: 'global', pose: 0, parts: [okPart], headBottomY: -36, chairCoverHeightRatio: 1.5 }).error);
    assert.ok(P({ ambito: 'global', pose: 0, parts: [okPart], headBottomY: -36, chairCoverHeightRatio: -0.1 }).error);
  });
  prueba('chairCoverHeightRatio: redondea a 2 decimales', () => igual(P({ ambito: 'global', pose: 0, parts: [okPart], headBottomY: -36, chairCoverHeightRatio: 0.557 }).datos.chairCoverHeightRatio, 0.56));
  prueba('la clave global es (partes, global, pose)', () => {
    const v = P({ ambito: 'global', pose: 3, parts: [okPart], headBottomY: 0 });
    igual([v.tipo, v.ambito, v.pose], ['partes', 'global', 3]);
  });
  prueba('la clave de una silla es (partes, id, pose)', () => {
    const v = P({ ambito: 'chair_a', pose: 2, parts: [okPart], headBottomY: 0 });
    igual([v.tipo, v.ambito, v.pose], ['partes', 'chair_a', 2]);
  });
});

// Portadas de tests/functions/handlers.test.js (admin-avatar-pose-offset).
describir('validarPose corrimiento', () => {
  prueba('acepta uno global', () => igual(M.validarPose({ tipo: 'corrimiento', ambito: 'global', pose: 2, dx: 1, dy: 2 }),
    { ok: true, tipo: 'corrimiento', ambito: 'global', pose: 2, borrar: false, datos: { dx: 1, dy: 2 } }));
  prueba('acepta borrar', () => igual(M.validarPose({ tipo: 'corrimiento', ambito: 'chair_a', pose: 0, borrar: true }),
    { ok: true, tipo: 'corrimiento', ambito: 'chair_a', pose: 0, borrar: true, datos: null }));
  prueba('rechaza pose 7', () => assert.ok(M.validarPose({ tipo: 'corrimiento', ambito: 'global', pose: 7, dx: 0, dy: 0 }).error));
  prueba('rechaza dx fuera de rango', () => assert.match(M.validarPose({ tipo: 'corrimiento', ambito: 'global', pose: 0, dx: 99, dy: 0 }).error, /dx/));
  prueba('rechaza un mueble con id raro', () => assert.ok(M.validarPose({ tipo: 'corrimiento', ambito: 'bad id!', pose: 0, dx: 0, dy: 0 }).error));
  prueba('rechaza dx como texto o NaN', () => {
    assert.ok(M.validarPose({ tipo: 'corrimiento', ambito: 'global', pose: 0, dx: '3', dy: 0 }).error);
    assert.ok(M.validarPose({ tipo: 'corrimiento', ambito: 'global', pose: 0, dx: NaN, dy: 0 }).error);
  });
  prueba('chairRotToPose como avatarSeatPoses', () => {
    igual([0, 1, 2, 3, 4, -1].map(M.chairRotToPose), [0, 3, 2, 1, 0, 1]);
  });
});

// ===================== Nuevas: capas y puertas =====================
describir('capas', () => {
  prueba('las mascaras armadas con huecos son iguales a las de PawHotel', () => {
    const lPH = (tx, ty) => !(tx <= 3 && ty <= 3);
    const hexPH = (tx, ty) => !((tx <= 4 && ty <= 2) || (tx <= 2 && ty <= 4));
    for (let x = 0; x < 12; x++) for (let y = 0; y < 10; y++) {
      igual(M.ROOM_LAYOUTS.l_shape.mask(x, y), lPH(x, y));
      igual(M.ROOM_LAYOUTS.hex.mask(x, y), hexPH(x, y));
      igual(M.existe(M.crearCapa({ forma: 'l_shape' }), x, y), lPH(x, y));
      igual(M.existe(M.crearCapa({ forma: 'hex' }), x, y), hexPH(x, y));
    }
  });
  prueba('medidas de cada forma', () => {
    igual(M.getLayoutState(M.ROOM_LAYOUTS, 'rect'), { roomW: 10, roomH: 14, roomMask: null });
    igual(M.getLayoutState(M.ROOM_LAYOUTS, 'nada').roomW, 8);
    const c = M.crearCapa({ forma: 'rect', ancho: 12, alto: 10 });
    igual([c.w, c.h, c.hueco.length], [12, 10, 0]);
    igual(M.contarBaldosas(M.crearCapa({ forma: 'small' })), 64);
  });
  prueba('rechaza formas y medidas raras', () => {
    assert.ok(M.crearCapa({ forma: 'triangulo' }).error);
    assert.ok(M.crearCapa({ forma: 'rect', ancho: 3, alto: 10 }).error);
    assert.ok(M.crearCapa({ forma: 'rect', ancho: 65, alto: 10 }).error);
    assert.ok(M.crearCapa({ forma: 'rect', ancho: NaN, alto: 10 }).error);
    assert.ok(M.crearCapa({ forma: 'rect', ancho: '12', alto: 10 }).error);
    assert.ok(M.crearCapa({ forma: 'propia', ancho: 8, alto: 8, mapa: { hueco: [[0, 0, 'x', 1]] } }).error);
    assert.ok(M.crearCapa({ forma: 'propia', ancho: 8, alto: 8, mapa: { hueco: Array(65).fill([0, 0, 1, 1]) } }).error);
    assert.ok(M.crearCapa({ forma: 'propia', ancho: 8, alto: 8, mapa: { hueco: [[0, 0, 8, 8]] } }).error);
    assert.ok(M.crearCapa(null).error);
  });
  prueba('una sala propia sin baldosas en la pared oeste no tiene puerta', () => {
    assert.ok(M.crearCapa({ forma: 'propia', ancho: 8, alto: 8, mapa: { hueco: [[0, 0, 1, 8]] } }).error);
    const c = M.crearCapa({ forma: 'propia', ancho: 8, alto: 8, mapa: { hueco: [[0, 0, 1, 2]] } });
    igual(c.error, undefined);
  });
  prueba('existe() rechaza coordenadas que no son enteras', () => {
    const c = M.crearCapa({ forma: 'small' });
    igual(M.existe(c, 1.5, 1), false);
    igual(M.existe(c, NaN, 1), false);
    igual(M.existe(c, '1', 1), false);
    igual(M.existe(c, 7, 7), true);
    igual(M.existe(c, 8, 7), false);
  });
});

describir('puertas', () => {
  prueba('sala normal 8x8: fila floor(8/3)=2', () => {
    igual(M.puerta(M.crearCapa({ forma: 'small' })), { x: 0, y: 2, afuera: { x: -1, y: 2 }, ty: 2, tipo: 'normal' });
  });
  prueba('principal 12x10: fila 3', () => {
    const p = M.puerta(M.crearCapa({ forma: 'rect', ancho: 12, alto: 10 }));
    igual([p.x, p.y, p.afuera.x, p.afuera.y], [0, 3, -1, 3]);
  });
  prueba('en L: adentro (0,4), afuera (-1,4)', () => {
    const p = M.puerta(M.crearCapa({ forma: 'l_shape' }));
    igual([p.x, p.y, p.afuera.x, p.afuera.y, p.tipo], [0, 4, -1, 4, 'l']);
  });
  prueba('hexagonal: adentro (3,3), afuera (2,3)', () => {
    const p = M.puerta(M.crearCapa({ forma: 'hex' }));
    igual([p.x, p.y, p.afuera.x, p.afuera.y, p.tipo], [3, 3, 2, 3, 'hex']);
  });
  prueba('getDoorRoomTile como doorInteraction.js', () => {
    const base = { getLShapeDoorTile: M.getLShapeDoorTile, getHexDoorTile: () => ({ tx: 3, ty: 3 }), getDoorTy: () => 5 };
    igual(M.getDoorRoomTile(Object.assign({ isLShapeLayout: () => true, isHexRoomLayout: () => false }, base)), { tx: 0, ty: 4 });
    igual(M.getDoorRoomTile(Object.assign({ isLShapeLayout: () => false, isHexRoomLayout: () => true }, base)), { tx: 3, ty: 3 });
    igual(M.getDoorRoomTile(Object.assign({ isLShapeLayout: () => false, isHexRoomLayout: () => false }, base)), { tx: 0, ty: 5 });
  });
});

// ===================== Nuevas: muebles =====================
const silla = M.entradaDesdeCatalogo({ id: 'silla', sentable: 1, huella: '1x1', rotaciones: 4 });
const sofa = M.entradaDesdeCatalogo({ id: 'sofa', sentable: 1, huella: '2x1', rotaciones: 2 });
const mesa = M.entradaDesdeCatalogo({ id: 'mesa', huella: '2x2' });
const alfombra = M.entradaDesdeCatalogo({ id: 'alfombra', caminable: 1, huella: '2x3' });
const raro = M.entradaDesdeCatalogo({ id: 'raro', geometria: JSON.stringify({ shapeByRot: { 1: [{ dx: 0, dy: 0 }, { dx: 0, dy: 1 }] } }) });

describir('muebles', () => {
  prueba('entradaDesdeCatalogo traduce las columnas de CV', () => {
    igual([sofa.sittable, sofa.walkable, sofa.footprint, sofa.rotaciones], [true, false, '2x1', 2]);
    igual(M.entradaDesdeCatalogo({ geometria: '{roto' }).footprint, '1x1');
    igual(M.entradaDesdeCatalogo({ geometria: { __proto__: { shape: [1] } } }).shape, undefined);
  });
  prueba('huella girada (no sentable)', () => {
    igual(M.baldosasDeMueble(4, 4, 0, mesa).map(t => M.clave(t.tx, t.ty)), ['4,4', '5,4', '4,5', '5,5']);
    igual(M.baldosasDeMueble(4, 4, 1, mesa).map(t => M.clave(t.tx, t.ty)), ['4,4', '4,5', '3,4', '3,5']);
  });
  prueba('las sentables no se giran', () => {
    igual(M.baldosasDeMueble(2, 2, 1, sofa).map(t => M.clave(t.tx, t.ty)), ['2,2', '3,2']);
  });
  prueba('shapeByRot con una sola rotacion definida vale para todas', () => {
    for (let r = 0; r < 4; r++) igual(M.getShapeForRotation(raro, r), [{ dx: 0, dy: 0 }, { dx: 0, dy: 1 }]);
  });
  prueba('shapeByRot con dos rotaciones se reparte con modulo', () => {
    const e = { shapeByRot: [null, [{ dx: 0, dy: 0 }], [{ dx: 1, dy: 0 }], null] };
    igual(M.getShapeForRotation(e, 0), [{ dx: 0, dy: 0 }]);
    igual(M.getShapeForRotation(e, 1), [{ dx: 1, dy: 0 }]);
    igual(M.getShapeForRotation(e, 2), [{ dx: 0, dy: 0 }]);
  });
  prueba('una huella gigante no arma millones de baldosas', () => {
    assert.ok(M.getShapeFromEntry({ footprint: '1000000x1000000' }).length <= 64 * 64);
  });
  prueba('asientos de una silla segun la rotacion', () => {
    igual(M.asientosDeMueble(2, 4, 0, silla).map(a => [a.tx, a.ty, a.s, a.direction]), [[2, 4, 0, 0]]);
    igual(M.asientosDeMueble(2, 4, 1, silla)[0].direction, 6);
    igual(M.asientosDeMueble(2, 4, 2, silla)[0].direction, 4);
    igual(M.asientosDeMueble(2, 4, 3, silla)[0].direction, 2);
    igual(M.asientosDeMueble(2, 4, 0, sofa).length, 2);
    igual(M.asientosDeMueble(2, 4, 0, mesa), []);
  });
  prueba('bloqueos: una alfombra grande se pisa entera (ancla y secundarias), la silla bloquea', () => {
    const b = M.bloqueosDeMuebles([{ x: 1, y: 1, rot: 0, entrada: alfombra }, { x: 5, y: 5, rot: 0, entrada: silla }]);
    igual(['1,1', '2,1', '1,2', '2,2'].map((k) => b.has(k)), [false, false, false, false]);
    igual(b.has('5,5'), true);
  });
  prueba('un mueble de varias baldosas que no se pisa bloquea toda su huella', () => {
    const sofa2 = M.entradaDesdeCatalogo({ id: 'sofa', huella: '2x1', rotaciones: 4, sentable: true });
    const b = M.bloqueosDeMuebles([{ x: 3, y: 3, rot: 0, entrada: sofa2 }]);
    igual([b.has('3,3'), b.has('4,3')], [true, true]);
  });
  prueba('se cruza una alfombra grande de punta a punta', () => {
    const capa = M.crearCapa({ forma: 'small' });
    const c = M.camino({ capa, desde: { x: 0, y: 2 }, hasta: { x: 5, y: 2 }, bloqueos: M.bloqueosDeMuebles([{ x: 2, y: 1, rot: 0, entrada: alfombra }]) });
    igual(c.map((p) => p.tx + ',' + p.ty), ['1,2', '2,2', '3,2', '4,2', '5,2']);
  });
  prueba('sin muebles caminables, bloqueosDeMuebles da lo mismo que createIsBlocked + buildOccupiedTilesMap', () => {
    const sofa2 = M.entradaDesdeCatalogo({ id: 'sofa', huella: '2x1', rotaciones: 4 });
    const cat = { mesa, silla, sofa2 };
    const furnitureMap = { '1,1': 'sofa2', '5,5': 'silla', '3,6': 'mesa' };
    const flipped = { '3,6': 1, '1,1': 1 };
    const sec = M.buildOccupiedTilesMap(furnitureMap, flipped, t => cat[t]);
    const ph = M.createIsBlocked({ furnitureMap, walkableFurniTypes: new Set(['alfombra']), normalizeFurniType: t => t, secondaryTilesMap: sec });
    const cv = M.bloqueosDeMuebles([{ x: 1, y: 1, rot: 1, entrada: sofa2 }, { x: 5, y: 5, rot: 0, entrada: silla }, { x: 3, y: 6, rot: 1, entrada: mesa }]);
    for (let x = -1; x < 10; x++) for (let y = -1; y < 10; y++) igual(cv.has(x + ',' + y), ph(x, y), x + ',' + y);
  });
});

// ===================== Nuevas: caminos =====================
describir('caminos', () => {
  const capa = M.crearCapa({ forma: 'small' });
  prueba('bfsPath con el mismo resultado que el de PawHotel (orden O, E, N, S)', () => {
    const c = M.camino({ capa, desde: { x: 0, y: 0 }, hasta: { x: 2, y: 2 } });
    // De (0,0) el primero que se expande es E (el O no existe), despues S.
    igual(c, [{ tx: 1, ty: 0 }, { tx: 2, ty: 0 }, { tx: 2, ty: 1 }, { tx: 2, ty: 2 }]);
  });
  prueba('ya esta ahi: []', () => igual(M.camino({ capa, desde: { x: 3, y: 3 }, hasta: { x: 3, y: 3 } }), []));
  prueba('destino bloqueado, ocupado o inexistente: null', () => {
    igual(M.camino({ capa, desde: { x: 0, y: 0 }, hasta: { x: 2, y: 2 }, bloqueos: new Set(['2,2']) }), null);
    igual(M.camino({ capa, desde: { x: 0, y: 0 }, hasta: { x: 2, y: 2 }, gente: new Set(['2,2']) }), null);
    igual(M.camino({ capa, desde: { x: 0, y: 0 }, hasta: { x: 9, y: 2 } }), null);
  });
  prueba('rodea un muro de gente y destinos', () => {
    const gente = M.ocupadasPorGente({ 1: { x: 1, y: 0 }, 2: { x: 1, y: 2, dx: 1, dy: 1 }, 3: { x: 5, y: 5 } }, 3);
    igual(gente.has('5,5'), false);
    const c = M.camino({ capa, desde: { x: 0, y: 0 }, hasta: { x: 2, y: 0 }, gente });
    assert.ok(c && c.every(p => !gente.has(p.tx + ',' + p.ty)));
    igual(c[c.length - 1], { tx: 2, ty: 0 });
  });
  prueba('mas de maxPasos: null', () => {
    const grande = M.crearCapa({ forma: 'rect', ancho: 64, alto: 64 });
    igual(M.camino({ capa: grande, desde: { x: 0, y: 0 }, hasta: { x: 63, y: 63 }, maxPasos: 100 }), null);
    igual(M.camino({ capa: grande, desde: { x: 0, y: 0 }, hasta: { x: 63, y: 63 } }).length, 126);
  });
  prueba('PASOS_MAX corta un laberinto de mas de 256 pasos', () => {
    // Serpentina en 64x64: paredes en columnas impares con un paso alternado arriba y abajo.
    const grande = M.crearCapa({ forma: 'rect', ancho: 64, alto: 64 });
    const bl = new Set();
    for (let x = 1; x < 64; x += 2) for (let y = 0; y < 64; y++) {
      const hueco = ((x - 1) / 2) % 2 === 0 ? 63 : 0;
      if (y !== hueco) bl.add(x + ',' + y);
    }
    igual(M.camino({ capa: grande, desde: { x: 0, y: 0 }, hasta: { x: 62, y: 0 }, bloqueos: bl }), null);
    assert.ok(M.camino({ capa: grande, desde: { x: 0, y: 0 }, hasta: { x: 62, y: 0 }, bloqueos: bl, maxPasos: 5000 }).length > 256);
  });
  prueba('ir a sentarse: pisa el asiento aunque sea mueble', () => {
    const muebles = [{ x: 4, y: 4, rot: 0, entrada: silla }];
    const r = M.caminoAlAsiento({ capa, desde: { x: 0, y: 4 }, bloqueos: M.bloqueosDeMuebles(muebles) }, M.asientosDeMueble(4, 4, 0, silla)[0]);
    igual([r.x, r.y, r.camino.length], [4, 4, 4]);
  });
  prueba('ir a sentarse: si el asiento no existe en la sala, va a la vecina', () => {
    const r = M.caminoAlAsiento({ capa, desde: { x: 0, y: 4 } }, { tx: 4, ty: -1 });
    igual([r.x, r.y], [4, 0]);
  });
  prueba('codificar y decodificar el camino', () => {
    const c = M.camino({ capa, desde: { x: 0, y: 0 }, hasta: { x: 2, y: 2 } });
    const s = M.codificarCamino(0, 0, c);
    igual(s, '6644');
    igual(M.decodificarCamino(0, 0, s), c);
    igual(M.codificarCamino(0, 0, [{ tx: 2, ty: 0 }]), null);
    igual(M.decodificarCamino(3, 3, '1357').map(p => M.clave(p.tx, p.ty)), ['2,2', '1,3', '2,4', '3,3']);
  });
  prueba('decodificar rechaza basura', () => {
    igual(M.decodificarCamino(0, 0, '68'), null);
    igual(M.decodificarCamino(0, 0, 'abc'), null);
    igual(M.decodificarCamino(0, 0, '6'.repeat(257)), null);
    igual(M.decodificarCamino(0, 0, 66), null);
    igual(M.decodificarCamino(NaN, 0, '6'), null);
    igual(M.decodificarCamino(0, 0, ''), []);
  });
  prueba('posicion en el camino a 455 ms por paso', () => {
    igual(M.posicionEnCamino(0, 0, '6644', 0), { x: 0, y: 0, pasos: 0, dir: null, llego: false });
    igual(M.posicionEnCamino(0, 0, '6644', 455 * 2 + 10), { x: 2, y: 0, pasos: 2, dir: 6, llego: false });
    igual(M.posicionEnCamino(0, 0, '6644', 1e9), { x: 2, y: 2, pasos: 4, dir: 4, llego: true });
    igual(M.posicionEnCamino(0, 0, '6644', NaN).pasos, 0);
    igual(M.MS_POR_PASO, Math.round(1000 / 2.2));
  });
});

// ===================== Nuevas: poner y colgar =====================
describir('poner y colgar', () => {
  const capa = M.crearCapa({ forma: 'small' });
  prueba('poner una mesa en lugar libre', () => {
    const r = M.puedePoner({ capa, x: 4, y: 4, rot: 0, entrada: mesa });
    igual([r.ok, r.clave, r.baldosas.length], [true, '4,4', 4]);
  });
  prueba('no entra, choca con un mueble o con gente', () => {
    assert.match(M.puedePoner({ capa, x: 7, y: 7, rot: 0, entrada: mesa }).error, /No entra/);
    const oc = M.ocupadasPorMuebles([{ m: 9, x: 5, y: 5, rot: 0, entrada: silla }]);
    assert.match(M.puedePoner({ capa, x: 4, y: 4, rot: 0, entrada: mesa, ocupadasMuebles: oc }).error, /mueble/);
    igual(M.puedePoner({ capa, x: 4, y: 4, rot: 0, entrada: mesa, ocupadasMuebles: M.ocupadasPorMuebles([{ m: 9, x: 5, y: 5, rot: 0, entrada: silla }], 9) }).ok, true);
    assert.match(M.puedePoner({ capa, x: 4, y: 4, rot: 0, entrada: mesa, gente: new Set(['5,4']) }).error, /alguien/);
  });
  prueba('no tapa la puerta (una alfombra si puede)', () => {
    assert.match(M.puedePoner({ capa, x: 0, y: 2, rot: 0, entrada: silla }).error, /puerta/);
    igual(M.puedePoner({ capa, x: 0, y: 1, rot: 0, entrada: alfombra }).ok, true);
  });
  prueba('rechaza coordenadas raras', () => {
    assert.ok(M.puedePoner({ capa, x: NaN, y: 1, rot: 0, entrada: silla }).error);
    assert.ok(M.puedePoner({ capa, x: 1, y: 1, rot: 7, entrada: silla }).error);
    assert.ok(M.puedePoner({ capa, x: -1, y: 1, rot: 0, entrada: silla }).error);
  });
  prueba('limites de pared por tipo y por catalogo', () => {
    igual(M.getWallPlacementLimits('poster'), { minOx: 18, maxOx: 82, minOy: 22, maxOy: 82 });
    igual(M.getWallPlacementLimits('cualquiera'), M.LIMITES_PARED_BASE);
    igual(M.getWallPlacementLimits('__proto__'), M.LIMITES_PARED_BASE);
    igual(M.getWallPlacementLimits({ id: 'x', limitesPared: { minOx: 1, maxOx: 2, minOy: 3, maxOy: 4 } }).maxOy, 4);
    igual(M.getWallPlacementLimits({ id: 'poster', limitesPared: { minOx: 'a' } }).minOx, 18);
    igual(M.isValidWallPlacement({ side: 'north', ox: 50, oy: 50 }, 'poster'), true);
    igual(M.isValidWallPlacement({ side: 'south', ox: 50, oy: 50 }, 'poster'), false);
    igual(M.isValidWallPlacement({ side: 'west', ox: 10, oy: 50 }, 'poster'), false);
    igual(M.getValidWallPlacement({ side: 'west', ox: NaN, oy: 50 }, 'poster'), null);
  });
  prueba('claves de pared', () => {
    igual(M.makeWallKey('north', 3, 0, 50, 40), 'wall:north:3,0:50,40');
    igual(M.parseWallKey('wall:north:3,0:50,40'), { side: 'north', tx: 3, ty: 0, ox: 50, oy: 40 });
    igual(M.parseWallKey('wall:west:0,2'), { side: 'west', tx: 0, ty: 2, ox: 0, oy: 0 });
    igual(M.leerClavePared('wall:west:0,2:30,30'), { lado: 'west', tx: 0, ty: 2, ox: 30, oy: 30 });
    igual(M.leerClavePared('wall:west:0,2:130,30'), null);
    igual(M.leerClavePared('wall:sur:0,2:30,30'), null);
    igual(M.leerClavePared({}), null);
  });
  prueba('colgar solo en el borde y dentro de los limites', () => {
    igual(M.puedeColgar(capa, 'wall:north:3,0:50,50', { id: 'poster' }).ok, true);
    assert.match(M.puedeColgar(capa, 'wall:north:3,1:50,50', { id: 'poster' }).error, /pared/);
    igual(M.puedeColgar(capa, 'wall:west:0,3:50,50', { id: 'poster' }).ok, true);
    assert.match(M.puedeColgar(capa, 'wall:west:0,3:5,50', { id: 'poster' }).error, /No entra/);
    const l = M.crearCapa({ forma: 'l_shape' });
    igual(M.paredEnBorde(l, 'north', 2, 4), true);  // el borde de adentro de la L
    igual(M.paredEnBorde(l, 'west', 4, 2), true);
    igual(M.paredEnBorde(l, 'north', 2, 5), false);
  });
});

// ===================== Nuevas: el muñeco =====================
describir('validarAvatar', () => {
  prueba('el de base es valido y completa lo que falta', () => {
    igual(M.validarAvatar({}).avatar, Object.assign({}, M.AVATAR_BASE));
    igual(M.validarAvatar({ hairV: 2, shirtC: 13 }).avatar.shirtC, 13);
  });
  prueba('los limites salen de las variantes y colores de PawHotel', () => {
    igual(M.validarAvatar({ hairV: 3 }).ok, undefined);
    igual(M.validarAvatar({ faceV: 3 }).ok, true);
    assert.match(M.validarAvatar({ faceC: 7 }).error, /color de cara/);
    igual(M.validarAvatar({ faceC: 6 }).ok, true);
    assert.ok(M.validarAvatar({ shoesC: 11 }).error);
  });
  prueba('rechaza entradas rotas', () => {
    const malos = [null, undefined, 5, 'x', [], [1], { hairV: NaN }, { hairV: 1.5 }, { hairV: '1' }, { hairV: -1 },
      { hairV: Infinity }, { sombrero: 1 }, { skinC: 1 }, JSON.parse('{"__proto__":{"hairV":1}}'), new Date(), new Map(),
      Object.create({ hairV: 1 })];
    for (const m of malos) assert.ok(M.validarAvatar(m).error, JSON.stringify(m));
  });
  prueba('no lee claves heredadas', () => {
    const o = Object.create(null); o.hairV = 1;
    igual(M.validarAvatar(o).avatar.hairV, 1);
  });
  prueba('el color de la remera', () => {
    igual(M.colorRemera({ shirtC: 2 }), '#e85d8a');
    igual(M.colorRemera(null), '#7c5cbf');
  });
});

// ===================== La version de navegador =====================
describir('UMD', () => {
  prueba('en un navegador queda en window.HotelMotor', () => {
    const vm = require('node:vm');
    const fs = require('node:fs');
    const ventana = {};
    ventana.window = ventana;
    vm.runInNewContext(fs.readFileSync(require.resolve('../../web/hotel/motor.js'), 'utf8'), ventana);
    igual(typeof ventana.HotelMotor.bfsPath, 'function');
    igual(ventana.HotelMotor.MS_POR_PASO, 455);
  });
});

fin();
