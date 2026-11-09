// Pruebas de web/hotel/src/red/salaEventos.js: como el cliente arma la sala con la respuesta de
// hotel:entrar y como le aplica los avisos (llega, se_va, mov, sienta, dijo, mueble, derechos...).
// Correr: node salaEventos.prueba.js
import arnes from './arnesAsincrono.js';
import { createRequire } from 'node:module';
import { armarSala, crearSalaEventos, posicionDe, baldosaActual, recalcularPuedo, jugadorLocal } from '../../web/hotel/src/red/salaEventos.js';
const require = createRequire(import.meta.url);
const C = require('../../web/hotel/contrato.js');
const M = require('../../web/hotel/motor.js');
const { CATALOGO } = require('./falso.js');
const { describir, prueba, fin, assert } = arnes;
const AS = C.A_SALA;

const ENTRADAS = {};
for (const f of CATALOGO) ENTRADAS[f.id] = M.entradaDesdeCatalogo(f);

function respuesta() {
  return {
    ok: true, ahora: 0,
    sala: {
      slug: 'principal', meta: { nombre: 'Sala principal', dueno: null, cap: 40, decor: {} },
      layout: { forma: 'small', ancho: 12, alto: 10 },
      muebles: { 100: { clave: '5,4', c: 'alfombra', rot: 0, s: 0 }, 101: { clave: '8,1', c: 'sofa', rot: 0, s: 0 }, 102: { clave: 'wall:north:5,0:50,55', c: 'cartel_cv', rot: 0, s: 0 } },
      jugadores: { 7: { u: '7', nombre: 'Pablo', avatar: { shirtC: 2 }, x: 2, y: 2, d: 4 }, 9: { u: 9, nombre: 'Rulo', avatar: null, x: 0, y: 0, c: '66', dx: 2, dy: 0, ms: 500 } },
      derechos: [], mensajes: [{ id: 1, u: 9, nombre: 'Rulo', texto: 'hola', t: 1 }], puedo: { poner: false, mover: false, echar: false, levantar: false },
    },
  };
}

function armar() {
  let t = 10000;
  const sala = { s: armarSala(M, respuesta(), t) };
  const llamados = [];
  const g = new Proxy({}, { get: (_o, k) => (...a) => llamados.push([k, ...a]) });
  const ev = crearSalaEventos({ C, M, sala: () => sala.s, yo: () => '7', ahora: () => t, entrada: (c) => ENTRADAS[c], g });
  const H = ev.manejadores;
  return { s: () => sala.s, H, llamados, reloj: (ms) => { t += ms; return t; }, ahora: () => t, cambiarSala: (x) => { sala.s = x; } };
}

describir('armarSala', () => {
  prueba('arma la capa, la puerta, los muebles por id y por clave', () => {
    const { s } = armar();
    const sala = s();
    assert.equal(sala.capa.w, 12); assert.equal(sala.capa.h, 10);
    assert.deepEqual([sala.puerta.x, sala.puerta.y], [0, 3]);
    assert.equal(sala.muebles['101'].x, 8); assert.equal(sala.muebles['101'].y, 1);
    assert.equal(sala.porClave['8,1'], '101');
    assert.deepEqual(sala.muebles['102'].pared, { lado: 'north', tx: 5, ty: 0, ox: 50, oy: 55 });
  });
  prueba('los ids de personas pasan a texto', () => {
    const { s } = armar();
    assert.deepEqual(Object.keys(s().jugadores).sort(), ['7', '9']);
    assert.equal(s().jugadores['9'].u, '9');
    assert.equal(s().mensajes[0].u, '9');
    assert.equal(s().mensajes[0].id, '1');
  });
  prueba('el que entra caminando sigue su camino desde donde iba (ms ya caminados)', () => {
    const { s, ahora } = armar();
    const p = s().jugadores['9'];
    posicionDe(M, p, ahora());
    assert.ok(p.caminando);
    assert.ok(p.px > 1 && p.px < 2, 'px=' + p.px);
    assert.equal(p.dir, 6);
  });
  prueba('el color de la remera sale del muñeco', () => {
    const { s } = armar();
    assert.equal(s().jugadores['7'].color, M.COLORES.shirt[2]);
  });
  prueba('una forma de sala rara cae en la chica (no rompe)', () => {
    const r = respuesta(); r.sala.layout = { forma: 'triangulo' };
    const sala = armarSala(M, r, 0);
    assert.equal(sala.capa.forma, 'small');
  });
});

describir('caminar', () => {
  prueba('hotel:mov arranca el camino y se interpola a 455 ms por paso', () => {
    const { s, H, reloj } = armar();
    H[AS.MOV]({ sala: 'principal', u: '9', x: 2, y: 0, c: '444', dx: 2, dy: 3 });
    const p = s().jugadores['9'];
    reloj(455 + 227);
    posicionDe(M, p, reloj(0));
    assert.equal(p.px, 2);
    assert.ok(Math.abs(p.py - 1.5) < 0.01, 'py=' + p.py);
    assert.equal(p.dir, 4);
    reloj(2000);
    posicionDe(M, p, reloj(0));
    assert.equal(p.py, 3); assert.equal(p.caminando, false);
    assert.deepEqual(baldosaActual(M, p, reloj(0)), { x: 2, y: 3 });
  });
  prueba('una cadena rara no mueve a nadie', () => {
    const { s, H, ahora } = armar();
    H[AS.MOV]({ sala: 'principal', u: '9', x: 2, y: 0, c: '49<', dx: 2, dy: 3 });
    const p = s().jugadores['9'];
    posicionDe(M, p, ahora() + 5000);
    assert.deepEqual([p.px, p.py], [2, 0]);
  });
  prueba('mi propio camino, si ya lo estaba caminando igual, no vuelve a empezar', () => {
    const { s, H, reloj } = armar();
    const yo = s().jugadores['7'];
    H[AS.MOV]({ sala: 'principal', u: '7', x: 2, y: 2, c: '66', dx: 4, dy: 2 });
    const t0 = yo.t0;
    reloj(300);
    H[AS.MOV]({ sala: 'principal', u: '7', x: 2, y: 2, c: '66', dx: 4, dy: 2 });
    assert.equal(yo.t0, t0);
  });
  prueba('sentarse pone al jugador en el asiento con su direccion; moverse lo para', () => {
    const { s, H } = armar();
    H[AS.SIENTA]({ sala: 'principal', u: '7', m: 101, s: 1, d: 4, ox: 0, oy: -12 });
    const yo = s().jugadores['7'];
    assert.deepEqual([yo.sentado.tx, yo.sentado.ty, yo.sentado.d, yo.sentado.mueble], [9, 1, 4, 'sofa']);
    H[AS.MOV]({ sala: 'principal', u: '7', x: 9, y: 1, c: '4', dx: 9, dy: 2 });
    assert.equal(yo.sentado, null);
  });
  prueba('la cabeza mira por un rato (ms relativos)', () => {
    const { s, H, ahora } = armar();
    H[AS.CABEZA]({ sala: 'principal', u: '9', d: 2, ms: 4000 });
    const p = s().jugadores['9'];
    assert.equal(p.cabeza, 2);
    assert.equal(p.cabezaHasta, ahora() + 4000);
  });
});

describir('gente', () => {
  prueba('llega y se va', () => {
    const { s, H, llamados } = armar();
    H[AS.LLEGA]({ sala: 'principal', j: { u: 12, nombre: 'Mica', x: -1, y: 3, c: '6', dx: 0, dy: 3 } });
    assert.ok(s().jugadores['12']);
    H[AS.SE_VA]({ sala: 'principal', u: 12 });
    assert.equal(s().jugadores['12'], undefined);
    assert.deepEqual(llamados.filter((l) => l[0] === 'llega' || l[0] === 'seVa').map((l) => l[0]), ['llega', 'seVa']);
  });
  prueba('cambia el muñeco y la frase', () => {
    const { s, H } = armar();
    H[AS.JUGADOR]({ sala: 'principal', u: 9, avatar: { shirtC: 5 }, estado: 'nuevo' });
    assert.equal(s().jugadores['9'].estado, 'nuevo');
    assert.equal(s().jugadores['9'].color, M.COLORES.shirt[5]);
  });
  prueba('escribiendo se apaga solo a los 8 s y al hablar', () => {
    const { s, H, ahora } = armar();
    H[AS.ESCRIBE]({ sala: 'principal', u: 9, si: true });
    assert.equal(s().jugadores['9'].escribeHasta, ahora() + C.TOPES.ESCRIBE_APAGA_MS);
    H[AS.DIJO]({ sala: 'principal', id: 5, u: 9, texto: 'che', t: 1 });
    assert.equal(s().jugadores['9'].escribe, false);
  });
  prueba('ausente y gestos', () => {
    const { s, H } = armar();
    H[AS.AUSENTE]({ sala: 'principal', u: 9, si: true });
    assert.equal(s().jugadores['9'].ausente, true);
    H[AS.GESTO]({ sala: 'principal', u: 9, tipo: 'saludo' });
    assert.equal(s().jugadores['9'].gesto.tipo, 'saludo');
    H[AS.GESTO]({ sala: 'principal', u: 9, tipo: 'cualquiera' });
    assert.equal(s().jugadores['9'].gesto.tipo, 'saludo');
  });
});

describir('charla', () => {
  prueba('dijo agrega el mensaje con el nombre que trajo llega', () => {
    const { s, H, llamados } = armar();
    H[AS.DIJO]({ sala: 'principal', id: 2, u: 9, texto: 'qué tal', t: 5 });
    const m = s().mensajes[s().mensajes.length - 1];
    assert.deepEqual([m.id, m.u, m.nombre, m.texto], ['2', '9', 'Rulo', 'qué tal']);
    assert.ok(llamados.some((l) => l[0] === 'dijo'));
  });
  prueba('el mismo mensaje (por id) no se muestra dos veces', () => {
    const { s, H } = armar();
    H[AS.DIJO]({ sala: 'principal', id: 3, u: 7, texto: 'yo', t: 5 });
    H[AS.DIJO]({ sala: 'principal', id: 3, u: 7, texto: 'yo', t: 5 });
    assert.equal(s().mensajes.filter((m) => m.id === '3').length, 1);
  });
  prueba('borrado saca el mensaje', () => {
    const { s, H } = armar();
    H[AS.BORRADO]({ sala: 'principal', id: 1 });
    assert.equal(s().mensajes.length, 0);
  });
  prueba('el texto se guarda tal cual (el que lo muestra usa textContent)', () => {
    const { s, H } = armar();
    H[AS.DIJO]({ sala: 'principal', id: 9, u: 9, texto: '<img src=x onerror=alert(1)>', t: 5 });
    assert.equal(s().mensajes[s().mensajes.length - 1].texto, '<img src=x onerror=alert(1)>');
  });
});

describir('muebles', () => {
  prueba('aparece, se mueve (cambia la clave) y se va', () => {
    const { s, H } = armar();
    H[AS.MUEBLE]({ sala: 'principal', m: 200, clave: '3,3', rec: { c: 'mesa', rot: 0, s: 0 } });
    assert.equal(s().porClave['3,3'], '200');
    H[AS.MUEBLE]({ sala: 'principal', m: 200, clave: '4,4', rec: { c: 'mesa', rot: 0, s: 0 } });
    assert.equal(s().porClave['3,3'], undefined);
    assert.equal(s().porClave['4,4'], '200');
    assert.equal(s().muebles['200'].x, 4);
    H[AS.MUEBLE]({ sala: 'principal', m: 200, clave: null, rec: null });
    assert.equal(s().muebles['200'], undefined);
    assert.equal(s().porClave['4,4'], undefined);
  });
  prueba('los sentados en un mueble que gira o se va se paran', () => {
    const { s, H } = armar();
    H[AS.SIENTA]({ sala: 'principal', u: '7', m: 101, s: 0, d: 4, ox: 0, oy: -12 });
    H[AS.MUEBLE]({ sala: 'principal', m: 101, clave: '8,1', rec: { c: 'sofa', rot: 1, s: 0 } });
    assert.equal(s().jugadores['7'].sentado, null);
  });
  prueba('usar cambia el estado', () => {
    const { s, H } = armar();
    H[AS.MUEBLE]({ sala: 'principal', m: 300, clave: '1,1', rec: { c: 'lampara', rot: 0, s: 1 } });
    assert.equal(s().muebles['300'].s, 1);
  });
});

describir('permisos y sala', () => {
  prueba('en la sala de alguien, tener derechos deja poner, mover y echar', () => {
    const { s, H } = armar();
    s().meta.dueno = { id: 1, nombre: 'Dueño' };
    H[AS.DERECHOS]({ sala: 'principal', lista: [7] });
    assert.deepEqual(s().puedo, { poner: true, mover: true, echar: true, levantar: true });
    H[AS.DERECHOS]({ sala: 'principal', lista: [] });
    assert.equal(s().puedo.poner, false);
  });
  prueba('en las salas del club los derechos no cuentan', () => {
    const { s } = armar();
    s().derechos = new Set(['7']);
    recalcularPuedo(s(), '7');
    assert.equal(s().puedo.poner, false);
  });
  prueba('hotel:sala actualiza los datos (nombre, decoracion)', () => {
    const { s, H } = armar();
    H[AS.SALA]({ sala: 'principal', meta: { nombre: 'Otra', decor: { piso: { patron: 'parquet', color: 3 } } } });
    assert.equal(s().meta.nombre, 'Otra');
    assert.equal(s().meta.cap, 40);
  });
  prueba('los avisos de otra sala no tocan esta', () => {
    const { s, H } = armar();
    H[AS.LLEGA]({ sala: 'bar', j: { u: 99, nombre: 'X', x: 0, y: 0 } });
    H[AS.DIJO]({ sala: 'bar', id: 77, u: 9, texto: 'otra sala', t: 1 });
    H[AS.SE_VA]({ sala: 'bar', u: 9 });
    assert.equal(s().jugadores['99'], undefined);
    assert.ok(s().jugadores['9']);
    assert.equal(s().mensajes.length, 1);
  });
  prueba('sin sala (afuera) los avisos de sala no hacen nada', () => {
    const x = armar();
    x.cambiarSala(null);
    x.H[AS.LLEGA]({ sala: 'principal', j: { u: 99, nombre: 'X', x: 0, y: 0 } });
    x.H[AS.MUEBLE]({ sala: 'principal', m: 1, clave: '1,1', rec: { c: 'mesa' } });
    assert.ok(true);
  });
  prueba('datos raros no rompen (null, sin sala, sin u)', () => {
    const { H } = armar();
    for (const ev of Object.keys(H)) { H[ev](null); H[ev]({}); H[ev]({ sala: 'principal' }); }
    assert.ok(true);
  });
});

describir('avisos a la persona', () => {
  prueba('fuera trae el motivo; uno desconocido cuenta como del equipo', () => {
    const { H, llamados } = armar();
    H[C.A_PERSONA.FUERA]({ motivo: 'puerta' });
    H[C.A_PERSONA.FUERA]({ motivo: 'cualquiera' });
    assert.deepEqual(llamados.filter((l) => l[0] === 'fuera').map((l) => l[1]), ['puerta', 'equipo']);
  });
  prueba('inventario_cambio, conteos y catalogo_cambio llegan a sus ganchos', () => {
    const { H, llamados } = armar();
    H[C.A_PERSONA.INVENTARIO_CAMBIO]({ mas: [{ m: 1, c: 'mesa' }], menos: [] });
    H[C.A_NAV.CONTEOS]({ principal: 3 });
    H[C.A_TODOS.CATALOGO_CAMBIO]({ v: 2 });
    assert.deepEqual(llamados.map((l) => l[0]), ['inventarioCambio', 'conteos', 'catalogoCambio']);
  });
  prueba('escucha todos los avisos de sala del contrato', () => {
    const { H } = armar();
    for (const ev of Object.values(C.A_SALA)) assert.equal(typeof H[ev], 'function', ev);
    for (const ev of [C.A_PERSONA.FUERA, C.A_PERSONA.INVENTARIO_CAMBIO, C.A_PERSONA.AVISO, C.A_NAV.CONTEOS, C.A_TODOS.CATALOGO_CAMBIO]) assert.equal(typeof H[ev], 'function', ev);
  });
});

describir('jugadorLocal', () => {
  prueba('lo que falta se completa', () => {
    const p = jugadorLocal(M, { u: 3, nombre: 'Ana', x: 1, y: 2 }, 0);
    assert.deepEqual([p.u, p.dir, p.sentado, p.estado], ['3', 4, null, '']);
  });
});

fin();
