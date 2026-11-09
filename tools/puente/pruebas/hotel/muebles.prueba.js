// Pruebas de los muebles del cliente: los 14 dibujados por codigo cubren el catalogo de la fase 1,
// lo que se ve tapa exactamente las baldosas que dice motor.js, el dibujante de grillas (fase 2)
// revisa bien los dibujos, y la guardia de rutas del catalogo. Correr: node muebles.prueba.js
import arnes from './arnesAsincrono.js';
import { createRequire } from 'node:module';
import { DIBUJOS_PISO, DIBUJOS_PARED, huellaDibujo } from '../../web/hotel/src/game/mueblesDibujo.js';
import { revisarArte, vistaParaGiro, PALETAS, ALFABETO } from '../../web/hotel/src/game/grilla.js';
const require = createRequire(import.meta.url);
const C = require('../../web/hotel/contrato.js');
const M = require('../../web/hotel/motor.js');
const { CATALOGO } = require('./falso.js');
const { describir, prueba, fin, assert } = arnes;

// rutaPermitida vive en catalogo.js (que importa config/hotel.js, sin DOM): se importa aparte
const { rutaPermitida } = await import('../../web/hotel/src/app/catalogo.js');

const orden = (l) => l.map((o) => o.dx + ',' + o.dy).sort();

describir('los 14 muebles por codigo', () => {
  prueba('son 14 y estan todos en el catalogo de prueba (y al reves)', () => {
    const dibujos = DIBUJOS_PISO.concat(DIBUJOS_PARED);
    assert.equal(dibujos.length, 14);
    assert.deepEqual(CATALOGO.map((f) => f.dibujo).sort(), dibujos.slice().sort());
  });
  prueba('los ids cumplen el formato del contrato', () => {
    for (const f of CATALOGO) assert.ok(C.CATALOGO_RE.test(f.id), f.id);
  });
  prueba('los de pared son de pared y los de piso de piso', () => {
    for (const f of CATALOGO) assert.equal(f.clase === 'pared', DIBUJOS_PARED.indexOf(f.dibujo) >= 0, f.id);
  });
  prueba('lo que se dibuja tapa las mismas baldosas que calcula motor.js, en cada giro', () => {
    for (const f of CATALOGO) {
      if (f.clase === 'pared') continue;
      const e = M.entradaDesdeCatalogo(f);
      for (let rot = 0; rot < (e.rotaciones || 1); rot++) {
        assert.deepEqual(orden(huellaDibujo(f.dibujo, rot)), orden(M.getShapeForRotation(e, rot)), f.id + ' giro ' + rot);
      }
    }
  });
  prueba('los sentables tienen asientos en cada giro y miran para el lado del giro', () => {
    for (const f of CATALOGO.filter((x) => x.sentable)) {
      const e = M.entradaDesdeCatalogo(f);
      const dirs = [];
      for (let rot = 0; rot < 4; rot++) {
        const as = M.asientosDeMueble(0, 0, rot, e);
        assert.ok(as.length >= 1, f.id + ' giro ' + rot);
        dirs.push(as[0].direction);
      }
      assert.deepEqual(dirs, [4, 2, 0, 6], f.id);
    }
  });
  prueba('las alfombras son caminables', () => {
    for (const id of ['alfombra', 'alfombra_chica', 'alfombra_redonda']) assert.ok(M.entradaDesdeCatalogo(CATALOGO.find((f) => f.id === id)).walkable, id);
  });
});

describir('grillas de pixeles (fase 2)', () => {
  const vista = (w, h, px) => ({ w, h, ax: Math.floor(w / 2), ay: h - 1, px });
  prueba('la paleta cv1 tiene un color por letra del alfabeto, todos #rrggbb', () => {
    assert.equal(PALETAS.cv1.length, ALFABETO.length);
    for (const c of PALETAS.cv1) assert.ok(/^#[0-9a-f]{6}$/.test(c), c);
  });
  prueba('un dibujo bien formado pasa', () => {
    assert.ok(revisarArte({ paleta: 'cv1', vistas: [vista(2, 2, '0.a.')] }).ok);
  });
  prueba('se rechazan: otra paleta, pixeles de menos, letras fuera de la paleta, medidas raras', () => {
    assert.ok(revisarArte({ paleta: 'otra', vistas: [vista(1, 1, '0')] }).error);
    assert.ok(revisarArte({ paleta: 'cv1', vistas: [vista(2, 2, '000')] }).error);
    assert.ok(revisarArte({ paleta: 'cv1', vistas: [vista(1, 1, '#')] }).error);
    assert.ok(revisarArte({ paleta: 'cv1', vistas: [vista(1, 1, 'Z')] }).error);
    assert.ok(revisarArte({ paleta: 'cv1', vistas: [{ w: 0, h: 1, px: '' }] }).error);
    assert.ok(revisarArte({ paleta: 'cv1', vistas: [] }).error);
    assert.ok(revisarArte(null).error);
  });
  prueba('el giro elige la vista (y el espejo, si se pide)', () => {
    const a = { paleta: 'cv1', vistas: [vista(1, 1, '0'), vista(1, 1, '1')] };
    assert.deepEqual([0, 1, 2, 3].map((r) => vistaParaGiro(a, r).v), [0, 1, 0, 1]);
    const b = Object.assign({}, a, { rot: [0, 1, { v: 0, espejo: true }, { v: 1, espejo: true }] });
    assert.deepEqual(vistaParaGiro(b, 2), { v: 0, espejo: true });
    assert.deepEqual(vistaParaGiro(b, 3), { v: 1, espejo: true });
    assert.deepEqual(vistaParaGiro(Object.assign({}, a, { rot: [9] }), 0), { v: 0, espejo: false });
  });
});

describir('catalogo', () => {
  prueba('solo se piden rutas del mismo sitio debajo de /puente/ o /uploads/', () => {
    assert.ok(rutaPermitida('/puente/api/hotel/catalogo?v=3'));
    assert.ok(rutaPermitida('/uploads/x.png'));
    for (const r of ['https://evil.com/x', '//evil.com/x', '/otra/cosa', '/puente/../x', 'javascript:alert(1)', null]) assert.ok(!rutaPermitida(r), String(r));
  });
});

fin();
