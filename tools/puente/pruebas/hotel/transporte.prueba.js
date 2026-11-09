// Pruebas de la capa de red del cliente (web/hotel/src/red/transporte.js y api.js): el tope de
// 20 eventos cada 10 s, la cola de los importantes, la validacion antes de mandar, los oyentes que se
// sueltan en pagehide y el reintento al reconectar. Con reloj y temporizador de mentira.
// Correr: node transporte.prueba.js
import arnes from './arnesAsincrono.js';
import { createRequire } from 'node:module';
import { crearTransporte, ERROR_TOPE, ERROR_SIN_CONEXION, ERROR_SIN_RESPUESTA } from '../../web/hotel/src/red/transporte.js';
import { crearApi, nombreDeFuncion } from '../../web/hotel/src/red/api.js';
const require = createRequire(import.meta.url);
const C = require('../../web/hotel/contrato.js');
const { describir, prueba, fin, assert } = arnes;

// Un reloj que avanza a mano y un temporizador que corre lo vencido.
function reloj() {
  let t = 1000000;
  let tareas = [];
  return {
    ahora: () => t,
    temporizar: (fn, ms) => { tareas.push({ fn, en: t + ms }); return tareas.length; },
    async avanzar(ms) {
      const hasta = t + ms;
      for (;;) {
        tareas.sort((a, b) => a.en - b.en);
        const x = tareas[0];
        if (!x || x.en > hasta) break;
        tareas.shift();
        t = Math.max(t, x.en);
        x.fn();
        await Promise.resolve(); await Promise.resolve();
      }
      t = hasta;
      await Promise.resolve();
    },
    pendientes: () => tareas.length,
  };
}

// Un socket de mentira que contesta {ok:true, ev} enseguida (o nunca, si mudo).
function socketFalso(o) {
  o = o || {};
  const oy = {};
  const s = {
    connected: true, emitidos: [],
    on(ev, fn) { (oy[ev] = oy[ev] || []).push(fn); },
    off(ev, fn) { const l = oy[ev] || []; const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); },
    emit(ev, d, ack) { s.emitidos.push(ev); if (!o.mudo) ack({ ok: true, ev, d }); },
    lanzar(ev, d) { for (const fn of (oy[ev] || []).slice()) fn(d); },
    cuantos: (ev) => (oy[ev] || []).length,
  };
  return s;
}

function armar(o) {
  const r = reloj();
  const s = (o && o.socket) || socketFalso(o);
  let actual = s;
  const t = crearTransporte({ contrato: C, obtenerSocket: () => actual, ahora: r.ahora, temporizar: r.temporizar, azar: () => 0.5 });
  return { r, s, t, cambiarSocket: (n) => { actual = n; } };
}

describir('tope de eventos', () => {
  prueba('el tope es el del contrato: 20 cada 10 s', () => {
    assert.deepEqual({ eventos: C.TOPES.CLIENTE.eventos, ms: C.TOPES.CLIENTE.ms }, { eventos: 20, ms: 10000 });
  });
  prueba('manda 20 seguidos y el 21 (no importante) se descarta con un error', async () => {
    const { s, t } = armar();
    const rs = [];
    for (let i = 0; i < 21; i++) rs.push(await t.emitir(C.EV.IR, { x: 1, y: i % 10 }));
    assert.equal(s.emitidos.length, 20);
    assert.ok(rs.slice(0, 20).every((r) => r.ok));
    assert.equal(rs[20].error, ERROR_TOPE);
  });
  prueba('despues de 10 s se puede volver a mandar', async () => {
    const { s, t, r } = armar();
    for (let i = 0; i < 20; i++) await t.emitir(C.EV.MIRAR, { x: 1, y: 1 });
    assert.equal((await t.emitir(C.EV.MIRAR, { x: 1, y: 1 })).error, ERROR_TOPE);
    await r.avanzar(10001);
    assert.ok((await t.emitir(C.EV.MIRAR, { x: 1, y: 1 })).ok);
    assert.equal(s.emitidos.length, 21);
  });
  prueba('la ventana es deslizante: nunca hay mas de 20 en ningun tramo de 10 s', async () => {
    const { s, t, r } = armar();
    const momentos = [];
    const orig = s.emit;
    s.emit = (ev, d, ack) => { momentos.push(r.ahora()); orig(ev, d, ack); };
    for (let i = 0; i < 200; i++) { await t.emitir(C.EV.ESCRIBE, { si: i % 2 === 0 }); await r.avanzar(137); }
    for (let i = 0; i < momentos.length; i++) {
      const enTramo = momentos.filter((m) => m >= momentos[i] && m < momentos[i] + 10000).length;
      assert.ok(enTramo <= 20, 'hubo ' + enTramo + ' en un tramo');
    }
    assert.ok(momentos.length >= 50);
  });
  prueba('los importantes esperan su turno en vez de perderse', async () => {
    const { s, t, r } = armar();
    for (let i = 0; i < 20; i++) await t.emitir(C.EV.IR, { x: 0, y: 0 });
    const p = t.emitir(C.EV.ENTRAR, { sala: 'principal' });
    assert.equal(t._enCola(), 1);
    assert.equal(s.emitidos.length, 20);
    await r.avanzar(10001);
    const res = await p;
    assert.ok(res.ok);
    assert.equal(res.ev, C.EV.ENTRAR);
    assert.equal(s.emitidos.length, 21);
  });
  prueba('si el importante espera demasiado, vuelve con error', async () => {
    const r0 = reloj();
    const s = socketFalso();
    const t = crearTransporte({ contrato: C, obtenerSocket: () => s, ahora: r0.ahora, temporizar: r0.temporizar, esperaMax: 2000 });
    for (let i = 0; i < 20; i++) await t.emitir(C.EV.IR, { x: 0, y: 0 });
    const p = t.emitir(C.EV.SALIR, {});
    await r0.avanzar(3000);
    // la cola se atiende cuando hay lugar; vencio antes
    await r0.avanzar(8000);
    assert.equal((await p).error, ERROR_TOPE);
  });
  prueba('con el chat abierto (20 del hotel) el total queda debajo de los 60 de Haven', () => {
    assert.ok(C.TOPES.CLIENTE.eventos * 3 <= C.TOPES.HAVEN.eventos);
  });
});

describir('validacion antes de mandar', () => {
  prueba('un pedido con datos raros no sale', async () => {
    const { s, t } = armar();
    const r = await t.emitir(C.EV.DECIR, { texto: 'hola', extra: 1 });
    assert.ok(r.error);
    assert.equal(s.emitidos.length, 0);
  });
  prueba('un evento que no existe no sale', async () => {
    const { s, t } = armar();
    assert.ok((await t.emitir('hotel:cualquiera', {})).error);
    assert.equal(s.emitidos.length, 0);
  });
  prueba('lo que se rechaza por validacion no gasta el tope', async () => {
    const { t } = armar();
    for (let i = 0; i < 50; i++) await t.emitir(C.EV.DECIR, { texto: '' });
    assert.equal(t._enVentana(), 0);
  });
});

describir('respuestas', () => {
  prueba('sin socket del chat: error sin conexion', async () => {
    const r0 = reloj();
    const t = crearTransporte({ contrato: C, obtenerSocket: () => null, ahora: r0.ahora, temporizar: r0.temporizar });
    assert.equal((await t.emitir(C.EV.HOLA, {})).error, ERROR_SIN_CONEXION);
  });
  prueba('si el servidor no contesta en 8 s: error', async () => {
    const { t, r } = armar({ mudo: true });
    const p = t.emitir(C.EV.HOLA, {});
    await r.avanzar(8001);
    assert.equal((await p).error, ERROR_SIN_RESPUESTA);
  });
  prueba('una respuesta que no es objeto se toma como el error general', async () => {
    const s = socketFalso(); s.emit = (ev, d, ack) => ack('cualquier cosa');
    const { t } = armar({ socket: s });
    assert.equal((await t.emitir(C.EV.HOLA, {})).error, C.ERROR_GENERAL);
  });
});

describir('oyentes', () => {
  prueba('escuchar pega al socket y el que devuelve suelta', () => {
    const { s, t } = armar();
    let n = 0;
    const soltar = t.escuchar(C.A_SALA.DIJO, () => n++);
    s.lanzar(C.A_SALA.DIJO, {});
    soltar();
    s.lanzar(C.A_SALA.DIJO, {});
    assert.equal(n, 1);
    assert.equal(s.cuantos(C.A_SALA.DIJO), 0);
  });
  prueba('soltarTodo (pagehide) deja el socket del chat sin oyentes del hotel', () => {
    const { s, t } = armar();
    for (const ev of Object.values(C.A_SALA)) t.escuchar(ev, () => {});
    t.alReconectar(() => {});
    t.soltarTodo();
    for (const ev of Object.values(C.A_SALA)) assert.equal(s.cuantos(ev), 0, ev);
    assert.equal(s.cuantos('connect'), 0);
    assert.equal(s.cuantos('disconnect'), 0);
    assert.equal(t._oyentes(), 0);
  });
  prueba('despues de soltar no manda nada', async () => {
    const { s, t } = armar();
    t.soltarTodo();
    assert.ok((await t.emitir(C.EV.HOLA, {})).error);
    assert.equal(s.emitidos.length, 0);
  });
  prueba('si el chat cambia de socket, los oyentes se mudan al nuevo', () => {
    const { s, t, cambiarSocket } = armar();
    let n = 0;
    t.escuchar(C.A_SALA.MOV, () => n++);
    const nuevo = socketFalso();
    cambiarSocket(nuevo);
    t.conectado(); // cualquier uso del transporte lo nota
    s.lanzar(C.A_SALA.MOV, {});
    nuevo.lanzar(C.A_SALA.MOV, {});
    assert.equal(n, 1);
    assert.equal(s.cuantos(C.A_SALA.MOV), 0);
  });
  prueba('un error en un oyente no rompe a los demas', () => {
    const { s, t } = armar();
    let n = 0;
    t.escuchar(C.A_SALA.DIJO, () => { throw new Error('x'); });
    t.escuchar(C.A_SALA.DIJO, () => n++);
    s.lanzar(C.A_SALA.DIJO, {});
    assert.equal(n, 1);
  });
});

describir('reconexion', () => {
  prueba('al reconectar avisa entre 3 y 4,5 s despues', async () => {
    const { s, t, r } = armar();
    let llamado = null;
    const t0 = r.ahora();
    t.alReconectar(() => { llamado = r.ahora() - t0; });
    s.lanzar('connect');
    await r.avanzar(2999);
    assert.equal(llamado, null);
    await r.avanzar(2000);
    assert.ok(llamado >= C.TOPES.REENTRAR_MS[0] && llamado <= C.TOPES.REENTRAR_MS[1], 'fue a los ' + llamado);
  });
  prueba('al caerse avisa enseguida', () => {
    const { s, t } = armar();
    let cayo = false;
    t.alCaer(() => { cayo = true; });
    s.lanzar('disconnect');
    assert.ok(cayo);
  });
});

describir('api', () => {
  prueba('hay una funcion por cada pedido de contrato.js y manda ese evento', async () => {
    const { s, t, r } = armar();
    const api = crearApi(t, C);
    const claves = Object.keys(C.A_SERVIDOR);
    assert.equal(Object.keys(api).length, claves.length);
    for (const k of claves) assert.equal(typeof api[nombreDeFuncion(k)], 'function', k);
    // cada una manda su evento (con datos validos minimos)
    const datos = {
      HOLA: {}, SIGO: {}, SALIR: {}, INVENTARIO: {}, SALAS: { ver: 'club' }, NAV: { abierto: true }, ENTRAR: { sala: 'principal' },
      IR: { x: 1, y: 1 }, DECIR: { texto: 'hola' }, ESCRIBE: { si: true }, GESTO: { tipo: 'saludo' }, AUSENTE: { si: true },
    };
    for (const k of Object.keys(datos)) {
      await r.avanzar(600);
      const res = await api[nombreDeFuncion(k)](datos[k]);
      assert.equal(res.ev, C.A_SERVIDOR[k], k);
    }
    assert.ok(s.emitidos.every((ev) => /^hotel:/.test(ev)));
  });
});

fin();
