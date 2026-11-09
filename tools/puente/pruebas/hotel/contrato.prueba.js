// Pruebas de contrato.js: nombres, topes y validar() con entradas buenas y rotas.
// Correr: node contrato.prueba.js
'use strict';
const { describir, prueba, fin, assert } = require('./arnes.js');
const C = require('../../web/hotel/contrato.js');
const M = require('../../web/hotel/motor.js');
const igual = assert.deepStrictEqual;
const E = C.EV;

const ok = (ev, d) => {
  const r = C.validar(ev, d);
  if (!r.ok) throw new Error(ev + ' ' + JSON.stringify(d) + ' -> ' + r.error);
  return r.datos;
};
const mal = (ev, d, re) => {
  const r = C.validar(ev, d);
  if (r.ok || typeof r.error !== 'string' || !r.error) throw new Error(ev + ' aceptó ' + String(JSON.stringify(d)).slice(0, 120));
  if (re) assert.match(r.error, re);
  return r.error;
};

describir('nombres', () => {
  prueba('todos los eventos empiezan con hotel: y no se pisan con valores distintos', () => {
    const grupos = [C.A_SERVIDOR, C.A_PERSONA, C.A_SALA, C.A_NAV, C.A_TODOS];
    const visto = {};
    for (const g of grupos) for (const k of Object.keys(g)) {
      assert.match(g[k], /^hotel:[a-z_]+$/);
      if (visto[k]) igual(visto[k], g[k], k);
      visto[k] = g[k];
    }
  });
  prueba('cada evento del cliente tiene regla y validador', () => {
    for (const ev of Object.values(C.A_SERVIDOR)) {
      assert.ok(C.REGLAS[ev], ev);
      assert.ok(C.TOPES.CUBETAS[C.REGLAS[ev].cubeta], ev + ' cubeta');
      const r = C.validar(ev, {});
      assert.ok(r.ok || (typeof r.error === 'string' && r.error !== 'Ese pedido no existe.'), ev);
    }
  });
  prueba('fases', () => {
    igual(C.eventosDeFase(3), ['hotel:comprar']);
    igual(C.eventosDeFase(4).length, 6);
    assert.ok(C.eventosDeFase(1).includes(E.IR));
    igual(C.eventosDeFase(1).length, 30);
  });
  prueba('los avisos del servidor no se validan como pedidos', () => {
    mal(E.MOV, {}, /no existe/);
    mal(E.CONTEOS, {}, /no existe/);
    mal('hotel:inventado', {}, /no existe/);
    mal('__proto__', {}, /no existe/);
    mal('constructor', {}, /no existe/);
    mal(undefined, {}, /no existe/);
  });
  prueba('salas de socket.io', () => {
    igual(C.salaSocket(41), 'hotel:s:41');
    igual(C.SALAS.NAV, 'hotel:nav');
    igual(C.SALAS.TODOS, 'hotel:todos');
    for (const x of ['principal', 41.5, 0, -1, NaN, '41', null]) assert.throws(() => C.salaSocket(x));
  });
  prueba('slug', () => {
    for (const s of ['principal', 'bar', '0a1b2c3d4e', 'la-sala']) igual(C.slugValido(s), true, s);
    for (const s of ['a', 'Principal', 'la sala', 'x'.repeat(21), 'ñandu', '', 5, null, 'sala\n']) igual(C.slugValido(s), false, String(s));
  });
  prueba('topes del plan', () => {
    const T = C.TOPES;
    igual([T.CLIENTE.eventos, T.CLIENTE.ms], [20, 10000]);
    igual([T.LATIDO_MS, T.CORTE_MS, T.AUSENTE_MS, T.PAYLOAD_BYTES], [30000, 150000, 300000, 8192]);
    igual([T.HAVEN.bytesMensaje, T.HAVEN.eventos, T.HAVEN.ms, T.HAVEN.por], [65536, 60, 10000, 'usuario']);
    igual(T.CUBETAS.ir, [{ n: 3, ms: 1000 }]);
    igual(T.CUBETAS.decir, [{ n: 1, ms: 700 }, { n: 8, ms: 10000 }]);
    igual(T.CUBETAS.muebles, [{ n: 4, ms: 1000 }, { n: 30, ms: 10000 }]);
    igual(C.MS_POR_PASO, 455);
    igual(C.MS_POR_PASO, M.MS_POR_PASO);
    igual(T.PASOS_MAX, M.PASOS_MAX);
    assert.ok(T.PAYLOAD_PROPUESTA_BYTES < T.HAVEN.bytesMensaje);
    assert.ok(Object.isFrozen(T) && Object.isFrozen(T.CUBETAS) && Object.isFrozen(C.EV));
  });
  prueba('listas fijas', () => {
    igual(C.FUERA, ['puerta', 'echado', 'sala_borrada', 'otra_ventana', 'ausente', 'equipo']);
    assert.ok(C.GESTOS.includes('saludo'));
    igual(C.FORMAS.every(f => !M.crearCapa({ forma: f }).error), true);
  });
  prueba('las claves de pared coinciden con las de motor.js', () => {
    for (const k of ['wall:north:3,0:50,40', 'wall:west:0,12:0,100']) {
      igual(C.esClavePared(k), true);
      assert.ok(M.leerClavePared(k));
    }
    for (const k of ['wall:north:3,0:50,140', 'wall:south:3,0:5,4', 'wall:north:03,0:50,40x', 'wall:north:64,0:1,1', '3,0', null]) {
      igual(C.esClavePared(k), false, String(k));
      igual(M.leerClavePared(k), null, String(k));
    }
    igual(C.esClavePiso('3,4'), true);
    igual(C.esClavePiso('64,4'), false);
  });
});

describir('validar: formas buenas', () => {
  prueba('sin datos', () => {
    igual(ok(E.HOLA), {});
    igual(ok(E.HOLA, null), {});
    igual(ok(E.SIGO, {}), {});
    igual(ok(E.INVENTARIO, {}), {});
  });
  prueba('perfil', () => {
    igual(ok(E.PERFIL, { estado: '  hola  ' }), { estado: 'hola' });
    igual(ok(E.PERFIL, { avatar: { hairV: 1, shirtC: 3 } }), { avatar: { hairV: 1, shirtC: 3 } });
    igual(ok(E.PERFIL, { estado: '' }), { estado: '' });
    igual(ok(E.PERFIL, { estado: 'é'.repeat(42) }).estado.length, 42);
  });
  prueba('salas', () => {
    igual(ok(E.SALAS, { ver: 'club' }), { ver: 'club' });
    igual(ok(E.SALAS, { ver: 'buscar', q: ' bar ' }), { ver: 'buscar', q: 'bar' });
    igual(ok(E.SALAS, { ver: 'mias', q: 'x' }), { ver: 'mias' });
  });
  prueba('crear y editar sala', () => {
    igual(ok(E.SALA_CREAR, { nombre: 'Mi sala', forma: 'hex', capacidad: 15, acceso: 'abierta' }),
      { nombre: 'Mi sala', forma: 'hex', capacidad: 15, acceso: 'abierta' });
    igual(ok(E.SALA_EDITAR, { sala: 'a1b2c3d4e5', avisar_entradas: true }), { sala: 'a1b2c3d4e5', avisar_entradas: true });
  });
  prueba('entrar', () => igual(ok(E.ENTRAR, { sala: 'principal', volver: true }), { sala: 'principal', volver: true }));
  prueba('ir: baldosa, asiento o puerta', () => {
    igual(ok(E.IR, { x: 3, y: 4 }), { x: 3, y: 4 });
    igual(ok(E.IR, { asiento: { m: 12, s: 0 } }), { asiento: { m: 12, s: 0 } });
    igual(ok(E.IR, { asiento: { m: '12', s: 1 } }), { asiento: { m: 12, s: 1 } });
    igual(ok(E.IR, { puerta: true }), { puerta: true });
  });
  prueba('mirar', () => {
    igual(ok(E.MIRAR, { x: 0, y: 63 }), { x: 0, y: 63 });
    igual(ok(E.MIRAR, { u: '812' }), { u: 812 });
  });
  prueba('decir con emojis y tildes', () => {
    igual(ok(E.DECIR, { texto: '¡Hola! \ud83d\udc4b qué tal \ud83d\udc68\u200d\ud83d\udc69\u200d\ud83d\udc67' }).texto, '¡Hola! \ud83d\udc4b qué tal \ud83d\udc68\u200d\ud83d\udc69\u200d\ud83d\udc67');
    igual(ok(E.DECIR, { texto: '\ud83d\ude00'.repeat(100) }).texto.length, 200);
  });
  prueba('muebles', () => {
    igual(ok(E.PONER, { m: 5, x: 1, y: 2, rot: 3 }), { m: 5, x: 1, y: 2, rot: 3 });
    igual(ok(E.PONER, { m: 5, pared: 'wall:north:3,0:50,40' }), { m: 5, pared: 'wall:north:3,0:50,40' });
    igual(ok(E.MOVER, { m: 5, pared: 'wall:west:0,07:050,40' }).pared, 'wall:west:0,7:50,40');
    igual(ok(E.ROTAR, { m: 5 }), { m: 5 });
    igual(ok(E.PINTAR, { tipo: 'piso', patron: 'solid', color: 0 }), { tipo: 'piso', patron: 'solid', color: 0 });
    igual(ok(E.PINTAR, { tipo: 'pared', patron: 'plain', color: 'azul' }).color, 'azul');
    igual(ok(E.PEDIR, { catalogo: 'silla_plastico' }), { catalogo: 'silla_plastico' });
  });
  prueba('gente', () => {
    igual(ok(E.DERECHOS, { u: 3, dar: false }), { u: 3, dar: false });
    igual(ok(E.VETAR, { u: 3, horas: null }), { u: 3, horas: null });
    igual(ok(E.VETAR, { u: 3 }), { u: 3 });
    igual(ok(E.VETAR, { u: 3, horas: 24 }), { u: 3, horas: 24 });
    igual(ok(E.GESTO, { tipo: 'saludo' }), { tipo: 'saludo' });
    igual(ok(E.DENUNCIAR, { tipo: 'mensaje', ref: '1234', motivo: 'spam' }), { tipo: 'mensaje', ref: '1234', motivo: 'spam' });
  });
  prueba('mod', () => {
    igual(ok(E.MOD, { accion: 'silenciar', u: 3, minutos: 30, motivo: 'flood' }), { accion: 'silenciar', u: 3, minutos: 30, motivo: 'flood' });
    igual(ok(E.MOD, { accion: 'anuncio', texto: 'Cerramos a las 3' }).texto, 'Cerramos a las 3');
    igual(ok(E.MOD, { accion: 'borrar_mensaje', msg: 77, sala: 'bar' }).msg, 77);
  });
  prueba('fases 3 a 6', () => {
    igual(ok(E.COMPRAR, { catalogo: 'sofa', cantidad: 10 }).cantidad, 10);
    igual(ok(E.TRATO_OFRECER, { id: 1, items: [3, '4', 5] }).items, [3, 4, 5]);
    igual(ok(E.TRATO_OFRECER, { id: 1, items: [] }).items, []);
    igual(ok(E.TRATO_CONFIRMAR, { id: 1, version: 0 }).version, 0);
    igual(ok(E.PROPUESTA_GUARDAR, { borrador: { nombre: 'Lámpara', arte: { vistas: { e0r0: 'AAAA' } } } }).borrador.arte.vistas.e0r0, 'AAAA');
    igual(ok(E.NOTA_ESCRIBIR, { m: 4, texto: 'n'.repeat(338) }).texto.length, 338);
  });
});

describir('validar: entradas rotas', () => {
  prueba('lo que no es un objeto plano', () => {
    const raros = [5, 'hola', true, [], [1, 2], () => 1, new Date(), new Map(), /x/, new (class A {})(),
      Object.create({ x: 1 }), Symbol('s'), Buffer.from('x'), new Uint8Array(2), Promise.resolve(), new Error('x')];
    for (const d of raros) mal(E.IR, d);
  });
  prueba('NaN, infinitos, decimales, negativos y textos en los numeros', () => {
    for (const v of [NaN, Infinity, -Infinity, 1.5, -1, 64, '3', '', null, true, [3], { v: 3 }, 1e300, -0.5, Number.MAX_SAFE_INTEGER + 2]) {
      mal(E.IR, { x: v, y: 1 });
      mal(E.PONER, { m: 1, x: 1, y: 1, rot: v });
    }
    igual(ok(E.IR, { x: -0, y: 0 }), { x: 0, y: 0 });
    igual(Object.is(ok(E.IR, { x: -0, y: 0 }).x, 0), true);
  });
  prueba('ids raros', () => {
    for (const v of [0, -3, 1.2, '0', '01', '1e3', ' 12', '12 ', 'abc', '9'.repeat(16), Number.MAX_SAFE_INTEGER + 1, NaN, null, {}, []]) {
      mal(E.ECHAR, { u: v });
      mal(E.ROTAR, { m: v });
    }
  });
  prueba('textos enormes', () => {
    mal(E.DECIR, { texto: 'a'.repeat(101) }, /largo/);
    mal(E.DECIR, { texto: 'a'.repeat(5000) }, /largo/);
    mal(E.DECIR, { texto: 'a'.repeat(9000) }, /largo/);  // pasa los 8 KB
    mal(E.DECIR, { texto: '\ud83d\ude00'.repeat(101) }, /largo/);
    mal(E.PERFIL, { estado: 'x'.repeat(43) }, /largo/);
    mal(E.SALA_CREAR, { nombre: 'x'.repeat(41), forma: 'small', capacidad: 5, acceso: 'abierta' }, /largo/);
    mal(E.SALAS, { ver: 'buscar', q: 'x'.repeat(31) }, /largo/);
    mal(E.DENUNCIAR, { tipo: 'sala', ref: 'bar', motivo: 'otro', detalle: 'x'.repeat(501) }, /largo/);
  });
  prueba('vacios y controles', () => {
    mal(E.DECIR, { texto: '' }, /Escribí/);
    mal(E.DECIR, { texto: '    ' }, /Escribí/);
    for (const t of ['hola\nchau', 'a\u0000b', 'a\u0007', 'x\u202ey', 'x\u2028y', 'a\u200bb', 'ho\ufeffla', 'a\u0085b', 'a\u2066b']) mal(E.DECIR, { texto: t }, /caracteres/);
    mal(E.DECIR, { texto: 'a\ud800b' }, /caracteres/);   // sustituto suelto
    mal(E.DECIR, { texto: 'a\udc00' }, /caracteres/);
    mal(E.SALA_CREAR, { nombre: 'a\tb', forma: 'small', capacidad: 5, acceso: 'abierta' }, /caracteres/);
  });
  prueba('el texto no es texto', () => {
    for (const v of [5, null, true, ['hola'], { toString: () => 'hola' }, NaN]) mal(E.DECIR, { texto: v });
  });
  prueba('datos de mas y datos que faltan', () => {
    mal(E.DECIR, { texto: 'hola', sistema: true }, /de más/);
    mal(E.DECIR, { texto: 'hola', system: true }, /de más/);
    mal(E.HOLA, { x: 1 }, /de más/);
    mal(E.IR, { x: 1 }, /Falta/);
    mal(E.IR, { x: 1, y: 1, puerta: true }, /de más/);
    mal(E.IR, { asiento: { m: 1 } }, /Falta/);
    mal(E.IR, { asiento: { m: 1, s: 0, extra: 1 } }, /de más/);
    mal(E.IR, {}, /Faltan/);
    mal(E.IR, { puerta: false });
    mal(E.IR, { puerta: 'true' });
    mal(E.PERFIL, {}, /nada/);
    mal(E.SALA_EDITAR, { sala: 'bar' }, /nada/);
    mal(E.SALAS, { ver: 'buscar' }, /buscás/);
    mal(E.SALAS, { ver: 'buscar', q: '   ' }, /buscás/);
    mal(E.MOD, { accion: 'silenciar' }, /Falta/);
    mal(E.MOD, { accion: 'renombrar_sala', sala: 'bar' }, /Falta/);
    mal(E.MOD, { accion: 'renombrar_sala', sala: 'bar', texto: 'x'.repeat(41) }, /largo/);
    mal(E.MOD, { accion: 'borrar_todo', u: 1 });
  });
  prueba('prototipos contaminados', () => {
    const contaminados = [
      JSON.parse('{"__proto__":{"x":1},"y":1}'),
      JSON.parse('{"x":1,"y":1,"__proto__":{"admin":true}}'),
      JSON.parse('{"x":1,"y":1,"constructor":{"prototype":{"admin":true}}}'),
      JSON.parse('{"x":1,"y":1,"prototype":1}'),
    ];
    for (const d of contaminados) mal(E.IR, d);
    mal(E.IR, JSON.parse('{"asiento":{"__proto__":{"m":1,"s":0}}}'));
    mal(E.IR, { asiento: Object.create({ m: 1, s: 0 }) });
    mal(E.PERFIL, { avatar: JSON.parse('{"__proto__":{"hairV":1}}') });
    mal(E.PROPUESTA_GUARDAR, { borrador: JSON.parse('{"a":{"b":{"__proto__":{"admin":1}}}}') });
    mal(E.PROPUESTA_GUARDAR, { borrador: JSON.parse('{"a":[{"constructor":{}}]}') });
    // y no contaminó nada
    igual({}.admin, undefined);
    igual({}.x, undefined);
    igual(Object.prototype.hasOwnProperty.call(Object.prototype, 'admin'), false);
  });
  prueba('un objeto con prototipo nulo vale (no hereda nada)', () => {
    const d = Object.create(null); d.x = 1; d.y = 2;
    igual(ok(E.IR, d), { x: 1, y: 2 });
  });
  prueba('getters que tiran y objetos ciclicos', () => {
    const g = {}; Object.defineProperty(g, 'x', { enumerable: true, get() { throw new Error('boom'); } });
    mal(E.IR, g);
    const ciclo = { m: 1 }; ciclo.asiento = ciclo;
    mal(E.IR, ciclo);
    const b = { borrador: {} }; b.borrador.yo = b.borrador;
    mal(E.PROPUESTA_GUARDAR, b);
  });
  prueba('BigInt y funciones adentro', () => {
    mal(E.IR, { x: 1n, y: 1 });
    mal(E.DECIR, { texto: () => 'hola' });
    mal(E.PROPUESTA_GUARDAR, { borrador: { f: () => 1 } });
    mal(E.PROPUESTA_GUARDAR, { borrador: { n: NaN } });
  });
  prueba('payload de mas de 8 KB aunque los campos sean chicos', () => {
    mal(E.PERFIL, { avatar: { hairV: 1 }, estado: 'hola', relleno: 'x'.repeat(9000) }, /largo/);
    mal(E.TRATO_OFRECER, { id: 1, items: Array.from({ length: 3000 }, (_, i) => i + 1) }, /largo/);
  });
  prueba('borradores muy profundos o gigantes', () => {
    let hondo = {}; const raizB = hondo;
    for (let i = 0; i < 20; i++) { hondo.a = {}; hondo = hondo.a; }
    mal(E.PROPUESTA_GUARDAR, { borrador: raizB });
    mal(E.PROPUESTA_GUARDAR, { borrador: { grilla: 'x'.repeat(61000) } }, /largo/);
    igual(ok(E.PROPUESTA_GUARDAR, { borrador: { grilla: 'x'.repeat(30000) } }).borrador.grilla.length, 30000);
  });
  prueba('listas de items', () => {
    mal(E.TRATO_OFRECER, { id: 1, items: [1, 1] }, /repetidos/);
    mal(E.TRATO_OFRECER, { id: 1, items: Array.from({ length: 31 }, (_, i) => i + 1) }, /demasiados/);
    mal(E.TRATO_OFRECER, { id: 1, items: '1,2' });
    mal(E.TRATO_OFRECER, { id: 1, items: { 0: 1, length: 1 } });
    mal(E.TRATO_OFRECER, { id: 1, items: [1, -2] });
  });
  prueba('listas fijas: nada fuera de la lista', () => {
    mal(E.GESTO, { tipo: 'insulto' });
    mal(E.GESTO, { tipo: 'toString' });
    mal(E.GESTO, { tipo: '__proto__' });
    mal(E.SALA_CREAR, { nombre: 'x', forma: 'propia', capacidad: 5, acceso: 'abierta' });
    mal(E.SALA_CREAR, { nombre: 'x', forma: 'small', capacidad: 51, acceso: 'abierta' });
    mal(E.SALA_CREAR, { nombre: 'x', forma: 'small', capacidad: 5, acceso: 'privada' });
    mal(E.DENUNCIAR, { tipo: 'sala', ref: 'bar', motivo: 'feo' });
    mal(E.DENUNCIAR, { tipo: 'sala', ref: '<script>', motivo: 'spam' });
    mal(E.PINTAR, { tipo: 'techo', patron: 'plain', color: 0 });
    mal(E.PINTAR, { tipo: 'piso', patron: 'Plain Bonito', color: 0 });
    mal(E.PINTAR, { tipo: 'piso', patron: 'plain', color: 1.5 });
    mal(E.PEDIR, { catalogo: 'Sofa' });
    mal(E.PEDIR, { catalogo: '../sofa' });
    mal(E.SALAS, { ver: 'todas' });
  });
  prueba('salas y paredes raras', () => {
    for (const s of ['Principal', 'a', '../x', 'x'.repeat(21), 41, null]) mal(E.ENTRAR, { sala: s });
    mal(E.ENTRAR, { sala: 'bar', volver: 1 });
    for (const p of ['wall:north:3,0', 'wall:up:3,0:1,1', 'wall:north:3,0:101,1', 'wall:north:-3,0:1,1', 'WALL:north:3,0:1,1', 5]) mal(E.PONER, { m: 1, pared: p });
    mal(E.PONER, { m: 1, pared: 'wall:north:3,0:1,1', x: 3, y: 0, rot: 0 }, /de más/);
  });
  prueba('el avatar: forma en el contrato, rangos en el motor', () => {
    for (const a of [null, [], 'x', { hairV: -1 }, { hairV: 1.5 }, { hairV: '1' }, { 'hair-V': 1 }, { hairX: 1 },
      Object.fromEntries(Array.from({ length: 17 }, (_, i) => ['aa' + 'abcdefghijklmnopq'[i] + 'V', 0]))]) mal(E.PERFIL, { avatar: a });
    const d = ok(E.PERFIL, { avatar: { hairV: 50 } });
    assert.ok(M.validarAvatar(d.avatar).error);
  });
  prueba('fuzz: nada tira y todo contesta ok o error en texto', () => {
    let semilla = 12345;
    const azar = () => (semilla = (semilla * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const valores = [0, 1, -1, 63, 64, 1.5, NaN, Infinity, '', 'x', '1', 'principal', 'wall:north:3,0:50,40', null, true, false,
      [], [1], {}, { m: 1, s: 0 }, JSON.parse('{"__proto__":{}}'), 'a'.repeat(200), '\ud83d\ude00', '\u0000'];
    const claves = ['x', 'y', 'u', 'm', 'sala', 'texto', 'si', 'asiento', 'puerta', 'tipo', 'pared', 'rot', 'id', 'items',
      'avatar', 'estado', 'ver', 'q', 'accion', 'catalogo', 'cantidad', 'version', 'borrador', '__proto__', 'constructor'];
    const eventos = Object.values(C.A_SERVIDOR);
    for (let i = 0; i < 20000; i++) {
      const d = {};
      const n = Math.floor(azar() * 5);
      for (let j = 0; j < n; j++) d[claves[Math.floor(azar() * claves.length)]] = valores[Math.floor(azar() * valores.length)];
      const r = C.validar(eventos[Math.floor(azar() * eventos.length)], d);
      assert.ok(r && (r.ok === true ? typeof r.datos === 'object' : typeof r.error === 'string' && r.error.length > 0 && r.error.length < 80));
    }
    igual({}.admin, undefined);
  });
});

describir('UMD', () => {
  prueba('en un navegador queda en window.HotelContrato', () => {
    const vm = require('node:vm');
    const fs = require('node:fs');
    const ventana = {};
    ventana.window = ventana;
    vm.runInNewContext(fs.readFileSync(require.resolve('../../web/hotel/contrato.js'), 'utf8'), ventana);
    igual(ventana.HotelContrato.EV.IR, 'hotel:ir');
    igual(ventana.HotelContrato.validar('hotel:ir', { puerta: true }).ok, true);
  });
  prueba('sin URLs externas, sin rastros de otras marcas', () => {
    const fs = require('node:fs');
    for (const f of ['../../web/hotel/contrato.js', '../../web/hotel/motor.js', './arnes.js', './motor.prueba.js']) {
      const s = fs.readFileSync(require.resolve(f), 'utf8');
      assert.doesNotMatch(s, /https?:\/\//, f);
      assert.doesNotMatch(s, new RegExp(['hab' + 'bo', 'sul' + 'ake', 'pawhotel2000', 'firebase' + 'io', 'stick' + 'ies'].join('|'), 'i'), f);
    }
  });
});

fin();
