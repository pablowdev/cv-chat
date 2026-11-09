// Pruebas del servidor falso (falso.js) junto con la capa de red y los avisos del cliente: la
// conversacion completa de la fase 1 de punta a punta, en memoria y con reloj de mentira.
// Sirve de especificacion para el servidor real (tools/puente/hotel.js).
// Correr: node falso.prueba.js
import arnes from './arnesAsincrono.js';
import { createRequire } from 'node:module';
import { crearTransporte } from '../../web/hotel/src/red/transporte.js';
import { crearApi } from '../../web/hotel/src/red/api.js';
import { crearSalaEventos, armarSala, posicionDe } from '../../web/hotel/src/red/salaEventos.js';
const require = createRequire(import.meta.url);
const C = require('../../web/hotel/contrato.js');
const M = require('../../web/hotel/motor.js');
const { crearFalso, CATALOGO } = require('./falso.js');
const { describir, prueba, fin, assert } = arnes;

function reloj() {
  let t = 5000000;
  const tareas = [];
  return {
    ahora: () => t,
    temporizar: (fn, ms) => { tareas.push({ fn, en: t + (ms || 0) }); },
    async avanzar(ms) {
      const hasta = t + ms;
      for (;;) {
        tareas.sort((a, b) => a.en - b.en);
        if (!tareas.length || tareas[0].en > hasta) break;
        const x = tareas.shift();
        t = Math.max(t, x.en);
        x.fn();
        for (let i = 0; i < 4; i++) await Promise.resolve();
      }
      t = hasta;
      for (let i = 0; i < 4; i++) await Promise.resolve();
    },
  };
}

const AVATAR = { hairV: 1, hairC: 2, faceV: 0, faceC: 1, shirtV: 2, shirtC: 3, pantsV: 1, pantsC: 2, shoesV: 2, shoesC: 4 };
const ENTRADAS = {};
for (const f of CATALOGO) ENTRADAS[f.id] = M.entradaDesdeCatalogo(f);

// Un "cliente": transporte + api + sala local alimentada por los avisos, como hotel.js.
function cliente(srv, r, perfil) {
  const sock = srv.conectar(perfil);
  const t = crearTransporte({ contrato: C, obtenerSocket: () => sock, ahora: r.ahora, temporizar: r.temporizar });
  const api = crearApi(t, C);
  const est = { sala: null, fuera: [], dichos: [], inv: [] };
  const ev = crearSalaEventos({ C, M, sala: () => est.sala, yo: () => String(perfil.id), ahora: r.ahora, entrada: (c) => ENTRADAS[c],
    g: { fuera: (m) => { est.fuera.push(m); est.sala = null; }, dijo: (m) => est.dichos.push(m.texto), inventarioCambio: (d) => est.inv.push(d) } });
  ev.atar(t);
  // cada llamada espera la respuesta haciendo correr el reloj
  const llamar = async (nombre, datos) => { const p = api[nombre](datos || {}); await r.avanzar(200); return p; };
  const entrar = async (sala) => { const res = await llamar('entrar', { sala }); if (res.ok) est.sala = armarSala(M, res, r.ahora()); return res; };
  return { sock, t, api, est, llamar, entrar };
}

function nuevo() {
  const r = reloj();
  const srv = crearFalso({ ahora: r.ahora, temporizar: r.temporizar, latencia: 5, azar: (() => { let i = 0; return () => ((i++ * 0.37) % 1); })() });
  return { r, srv };
}

describir('arranque', () => {
  prueba('hola trae la identidad del servidor (nunca se pide login)', async () => {
    const { r, srv } = nuevo();
    const a = cliente(srv, r, { id: 7, nombre: 'Ana' });
    const h = await a.llamar('hola');
    assert.equal(h.yo.id, '7'); assert.equal(h.yo.nombre, 'Ana');
    assert.equal(h.avatar, null);
    assert.equal(h.catalogoV, 1);
  });
  prueba('los invitados no entran', async () => {
    const { r, srv } = nuevo();
    const a = cliente(srv, r, { id: 8, nombre: 'Invitado', invitado: true });
    assert.ok((await a.llamar('hola')).error);
    assert.ok((await a.llamar('entrar', { sala: 'principal' })).error);
  });
  prueba('sin muñeco no se entra; con perfil si', async () => {
    const { r, srv } = nuevo();
    const a = cliente(srv, r, { id: 7, nombre: 'Ana' });
    await a.llamar('hola');
    assert.ok((await a.entrar('principal')).error);
    assert.ok((await a.llamar('perfil', { avatar: AVATAR, estado: 'Hola' })).ok);
    assert.ok((await a.entrar('principal')).ok);
  });
  prueba('un muñeco con colores que no existen se rechaza', async () => {
    const { r, srv } = nuevo();
    const a = cliente(srv, r, { id: 7, nombre: 'Ana' });
    await a.llamar('hola');
    assert.ok((await a.llamar('perfil', { avatar: Object.assign({}, AVATAR, { shirtC: 99 }) })).error);
  });
  prueba('hola dos veces no duplica nada (los avisos llegan una sola vez)', async () => {
    const { r, srv } = nuevo();
    const a = cliente(srv, r, { id: 7, nombre: 'Ana', avatar: AVATAR });
    await a.llamar('hola'); await a.llamar('hola');
    await a.entrar('principal');
    await a.llamar('decir', { texto: 'una vez' });
    assert.deepEqual(a.est.dichos, ['una vez']);
  });
  prueba('lo de fases siguientes contesta que todavia no esta', async () => {
    const { r, srv } = nuevo();
    const a = cliente(srv, r, { id: 7, nombre: 'Ana', avatar: AVATAR });
    await a.llamar('hola');
    assert.equal((await a.llamar('comprar', { catalogo: 'sofa', cantidad: 1 })).error, 'Eso todavía no está.');
    assert.equal((await a.llamar('tratoPedir', { u: 9 })).error, 'Eso todavía no está.');
  });
});

describir('en la sala', () => {
  async function dos() {
    const { r, srv } = nuevo();
    const a = cliente(srv, r, { id: 7, nombre: 'Ana', avatar: AVATAR });
    const b = cliente(srv, r, { id: 9, nombre: 'Beto', avatar: AVATAR });
    await a.llamar('hola'); await b.llamar('hola');
    await a.entrar('principal'); await b.entrar('principal');
    await r.avanzar(1000);
    return { r, srv, a, b };
  }
  prueba('los dos se ven', async () => {
    const { a, b } = await dos();
    assert.ok(a.est.sala.jugadores['9']);
    assert.ok(b.est.sala.jugadores['7']);
  });
  prueba('caminar: el otro ve el camino y llega al destino', async () => {
    const { r, a, b } = await dos();
    assert.ok((await a.llamar('ir', { x: 4, y: 3 })).ok);
    await r.avanzar(6000);
    const p = b.est.sala.jugadores['7'];
    posicionDe(M, p, r.ahora());
    assert.deepEqual([p.px, p.py], [4, 3]);
  });
  prueba('no se puede caminar a una baldosa con un mueble', async () => {
    const { a } = await dos();
    assert.ok((await a.llamar('ir', { x: 9, y: 3 })).error); // la mesa
  });
  prueba('hablar: el otro recibe el mensaje', async () => {
    const { a, b } = await dos();
    await a.llamar('decir', { texto: 'hola Beto' });
    assert.ok(b.est.dichos.indexOf('hola Beto') >= 0);
  });
  prueba('sentarse en el sillon del club', async () => {
    const { r, srv, a, b } = await dos();
    const sofa = Object.values(srv.items()).find((it) => it.c === 'sofa');
    assert.ok((await a.llamar('ir', { asiento: { m: Number(sofa.m), s: 0 } })).ok);
    await r.avanzar(8000);
    assert.ok(b.est.sala.jugadores['7'].sentado);
    assert.equal(b.est.sala.jugadores['7'].sentado.d, 4);
  });
  prueba('salir por la puerta: hotel:fuera {motivo:puerta} y el otro ve que se fue', async () => {
    const { r, a, b } = await dos();
    assert.ok((await a.llamar('ir', { puerta: true })).ok);
    await r.avanzar(8000);
    assert.deepEqual(a.est.fuera, ['puerta']);
    assert.equal(b.est.sala.jugadores['7'], undefined);
  });
  prueba('en las salas del club la gente comun no pone muebles', async () => {
    const { a } = await dos();
    const it = await a.llamar('pedir', { catalogo: 'mesa' });
    assert.ok(it.ok);
    assert.ok((await a.llamar('poner', { m: Number(it.item.m), x: 2, y: 2, rot: 0 })).error);
  });
});

describir('sala propia y muebles', () => {
  async function propia() {
    const { r, srv } = nuevo();
    const a = cliente(srv, r, { id: 7, nombre: 'Ana', avatar: AVATAR });
    await a.llamar('hola');
    const s = await a.llamar('salaCrear', { nombre: 'Lo de Ana', forma: 'small', capacidad: 10, acceso: 'abierta' });
    assert.ok(C.slugValido(s.slug) && /^[0-9a-f]{10}$/.test(s.slug));
    await a.entrar(s.slug);
    await r.avanzar(1000);
    return { r, srv, a, slug: s.slug };
  }
  prueba('pedir (gratis), ver la mochila, poner, girar, usar y levantar', async () => {
    const { a } = await propia();
    const sofa = await a.llamar('pedir', { catalogo: 'sofa' });
    const inv = await a.llamar('inventario');
    assert.deepEqual(inv.grupos.map((g) => g.c), ['sofa']);
    const m = Number(sofa.item.m);
    const p = await a.llamar('poner', { m, x: 3, y: 3, rot: 0 });
    assert.equal(p.clave, '3,3');
    assert.equal(a.est.sala.porClave['3,3'], String(m));
    assert.ok((await a.llamar('rotar', { m })).ok);
    assert.equal(a.est.sala.muebles[String(m)].rot, 1);
    const lamp = await a.llamar('pedir', { catalogo: 'lampara' });
    await a.llamar('poner', { m: Number(lamp.item.m), x: 6, y: 6, rot: 0 });
    await a.llamar('usar', { m: Number(lamp.item.m) });
    assert.equal(a.est.sala.muebles[String(lamp.item.m)].s, 1);
    assert.ok((await a.llamar('levantar', { m })).ok);
    assert.equal(a.est.sala.muebles[String(m)], undefined);
    assert.ok(a.est.inv.some((d) => d.mas.some((x) => String(x.m) === String(m))));
  });
  prueba('colgar en la pared (y no en el medio del piso)', async () => {
    const { a } = await propia();
    const c = await a.llamar('pedir', { catalogo: 'cartel_cv' });
    const m = Number(c.item.m);
    assert.ok((await a.llamar('poner', { m, x: 3, y: 3, rot: 0 })).error);
    assert.ok((await a.llamar('poner', { m, pared: 'wall:north:3,0:50,55' })).ok);
    assert.ok(a.est.sala.muebles[String(m)].pared);
  });
  prueba('no se tapa la puerta ni se encima un mueble', async () => {
    const { a } = await propia();
    const pu = a.est.sala.puerta;
    const x = await a.llamar('pedir', { catalogo: 'mesa' });
    const y = await a.llamar('pedir', { catalogo: 'mesa' });
    assert.ok((await a.llamar('poner', { m: Number(x.item.m), x: pu.x, y: pu.y, rot: 0 })).error);
    assert.ok((await a.llamar('poner', { m: Number(x.item.m), x: 5, y: 5, rot: 0 })).ok);
    assert.ok((await a.llamar('poner', { m: Number(y.item.m), x: 5, y: 5, rot: 0 })).error);
  });
  prueba('pintar la sala llega como hotel:sala', async () => {
    const { a } = await propia();
    await a.llamar('pintar', { tipo: 'piso', patron: 'parquet', color: 'brown' });
    assert.deepEqual(a.est.sala.meta.decor.piso, { patron: 'parquet', color: 'brown' });
  });
  prueba('dar derechos y echar', async () => {
    const { r, srv, a, slug } = await propia();
    const b = cliente(srv, r, { id: 9, nombre: 'Beto', avatar: AVATAR });
    await b.llamar('hola'); await b.entrar(slug);
    await r.avanzar(500);
    await a.llamar('derechos', { u: 9, dar: true });
    assert.ok(b.est.sala.puedo.poner);
    await a.llamar('derechos', { u: 9, dar: false });
    assert.ok((await a.llamar('echar', { u: 9 })).ok);
    assert.deepEqual(b.est.fuera, ['echado']);
  });
  prueba('borrar la sala saca a todos y devuelve los muebles', async () => {
    const { r, srv, a, slug } = await propia();
    const x = await a.llamar('pedir', { catalogo: 'planta' });
    await a.llamar('poner', { m: Number(x.item.m), x: 2, y: 5, rot: 0 });
    assert.ok((await a.llamar('salaBorrar', { sala: slug })).ok);
    assert.deepEqual(a.est.fuera, ['sala_borrada']);
    void r; void srv;
    const inv = await a.llamar('inventario');
    assert.ok(inv.grupos.some((g) => g.c === 'planta'));
  });
  prueba('la misma persona en otra ventana: la vieja recibe otra_ventana', async () => {
    const { r, srv, a, slug } = await propia();
    const a2 = cliente(srv, r, { id: 7, nombre: 'Ana' });
    await a2.llamar('hola');
    await a2.entrar(slug);
    assert.deepEqual(a.est.fuera, ['otra_ventana']);
  });
});

describir('alfombras (aviso para motor.js)', () => {
  prueba('las baldosas secundarias de una alfombra hoy BLOQUEAN el paso (motor.bloqueosDeMuebles)', () => {
    const e = M.entradaDesdeCatalogo(CATALOGO.find((f) => f.id === 'alfombra'));
    const bl = M.bloqueosDeMuebles([{ x: 3, y: 3, rot: 0, entrada: e }]);
    // el ancla se pisa, las otras tres no: la decision del dueño es que se puedan pisar todas
    assert.equal(bl.has('3,3'), false);
    assert.deepEqual([bl.has('4,3'), bl.has('3,4'), bl.has('4,4')], [true, true, true]);
  });
});

describir('topes', () => {
  prueba('un cliente que camina sin parar nunca pasa el tope de Haven', async () => {
    const { r, srv } = nuevo();
    const a = cliente(srv, r, { id: 7, nombre: 'Ana', avatar: AVATAR });
    await a.llamar('hola'); await a.entrar('principal');
    for (let i = 0; i < 300; i++) { a.api.ir({ x: (i * 3) % 12, y: (i * 7) % 10 }); a.api.escribe({ si: i % 2 === 0 }); await r.avanzar(50); }
    await r.avanzar(20000);
    assert.equal(srv.excesos().length, 0);
  });
});

fin();
