// Pruebas de los muebles del cliente: los 14 dibujados por codigo y los 3 con arte propio cubren
// el catalogo de la fase 1, lo que se ve tapa exactamente las baldosas que dice motor.js, las
// imagenes son del hotel y se ubican como en PawHotel, el dibujante de grillas (fase 2) revisa
// bien los dibujos, y la guardia de rutas del catalogo. Correr: node muebles.prueba.js
import arnes from './arnesAsincrono.js';
import { createRequire } from 'node:module';
import { DIBUJOS_PISO, DIBUJOS_PARED, huellaDibujo, ajusteAsiento, dibujarDelanteDeAsiento, asientoDe } from '../../web/hotel/src/game/mueblesDibujo.js';
import { revisarArte, vistaParaGiro, PALETAS, ALFABETO } from '../../web/hotel/src/game/grilla.js';
import { revisarArteImagen, urlArte, vistaDeGiro, vistaDePared, dibujarImagenPiso, dibujarImagenPared } from '../../web/hotel/src/game/imagenes.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const C = require('../../web/hotel/contrato.js');
const M = require('../../web/hotel/motor.js');
const { CATALOGO } = require('./falso.js');
const { describir, prueba, fin, assert } = arnes;

// rutaPermitida vive en catalogo.js (que importa config/hotel.js, sin DOM): se importa aparte
const { rutaPermitida } = await import('../../web/hotel/src/app/catalogo.js');

const orden = (l) => l.map((o) => o.dx + ',' + o.dy).sort();

describir('los muebles del catalogo de prueba', () => {
  prueba('14 dibujos por codigo, todos en el catalogo (y al reves); la cocina va solo con imagen', () => {
    const dibujos = DIBUJOS_PISO.concat(DIBUJOS_PARED);
    assert.equal(dibujos.length, 14);
    assert.deepEqual(CATALOGO.map((f) => f.dibujo).filter(Boolean).sort(), dibujos.slice().sort());
    for (const f of CATALOGO) assert.ok(f.dibujo || (f.arte && revisarArteImagen(f.arte).ok), f.id);
    assert.deepEqual(CATALOGO.filter((f) => f.arte).map((f) => f.id).sort(), ['cartel_cv', 'cocina', 'mesa']);
  });
  prueba('los ids cumplen el formato del contrato', () => {
    for (const f of CATALOGO) assert.ok(C.CATALOGO_RE.test(f.id), f.id);
  });
  prueba('los de pared son de pared y los de piso de piso', () => {
    for (const f of CATALOGO) if (f.dibujo) assert.equal(f.clase === 'pared', DIBUJOS_PARED.indexOf(f.dibujo) >= 0, f.id);
  });
  prueba('lo que se dibuja tapa las mismas baldosas que calcula motor.js, en cada giro', () => {
    for (const f of CATALOGO) {
      if (f.clase === 'pared' || !f.dibujo) continue;
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

const ARTE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../web/hotel/arte');
const medidaPng = (p) => { const b = fs.readFileSync(p); return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }; };
const fila = (id) => CATALOGO.find((f) => f.id === id);

describir('muebles con imagen propia', () => {
  prueba('cada imagen existe en web/hotel/arte/ y mide lo que dice el catalogo', () => {
    for (const f of CATALOGO.filter((x) => x.arte)) {
      assert.ok(revisarArteImagen(f.arte).ok, f.id);
      for (const v of f.arte.vistas) {
        const p = path.join(ARTE_DIR, v.src);
        assert.ok(fs.existsSync(p), v.src);
        assert.deepEqual(medidaPng(p), { w: v.w, h: v.h }, v.src);
      }
    }
  });
  prueba('las imagenes solo se piden del mismo sitio', () => {
    assert.ok(urlArte('cartel-cv-1.png').endsWith('/web/hotel/arte/cartel-cv-1.png'), urlArte('cartel-cv-1.png'));
    assert.equal(urlArte('/puente/hotel/arte/x.png'), '/puente/hotel/arte/x.png');
    for (const r of ['https://evil.com/x.png', '//evil.com/x.png', '../x.png', 'a/b.png', '/otra/x.png', 'X.PNG', 'x.svg', 'data:image/png;base64,AA', null]) assert.equal(urlArte(r), null, String(r));
    assert.ok(revisarArteImagen({ tipo: 'imagen', vistas: [{ src: 'https://evil.com/x.png', w: 1, h: 1 }] }).error);
    assert.ok(revisarArteImagen({ tipo: 'imagen', vistas: [{ src: 'x.png', w: 0, h: 1 }] }).error);
    assert.ok(revisarArteImagen({ tipo: 'imagen', vistas: [] }).error);
  });
  prueba('el cartel CV: cara oeste con la imagen 1 y cara norte con la 2 (como state0_rot0/rot1 de PawHotel)', () => {
    const a = fila('cartel_cv').arte;
    assert.equal(vistaDePared(a, 'west').src, 'cartel-cv-1.png');
    assert.equal(vistaDePared(a, 'north').src, 'cartel-cv-2.png');
  });
  prueba('la cocina: dos giros con su imagen cada uno, y vuelve a empezar', () => {
    const a = fila('cocina').arte, e = M.entradaDesdeCatalogo(fila('cocina'));
    assert.equal(e.rotaciones, 2);
    assert.deepEqual([0, 1, 2, 3].map((r) => vistaDeGiro(a, r).src), ['cocina-1.png', 'cocina-2.png', 'cocina-1.png', 'cocina-2.png']);
    assert.deepEqual(M.baldosasDeMueble(4, 4, 1, e), [{ tx: 4, ty: 4 }]);
  });
  prueba('se ubican como getFloorDrawBox / getWallDrawBox de PawHotel (escala 1, sin imagen igual da el lugar)', () => {
    const ctx = { save() {}, restore() {}, drawImage() { throw new Error('no hay imagen todavia'); } };
    // mesa: 90x83, offset (1,-2), baldosa en (500, 300) de 92x46 -> apoyo (500, 323)
    assert.deepEqual(dibujarImagenPiso(ctx, fila('mesa').arte, 0, 500, 300, 23), { x1: 456, y1: 238, x2: 546, y2: 321, listo: false });
    // cocina giro 0: 69x90, offset (-8,-7)
    const b = dibujarImagenPiso(ctx, fila('cocina').arte, 0, 500, 300, 23);
    assert.deepEqual([b.x1, b.y1, b.x2 - b.x1, b.y2 - b.y1], [Math.round(500 - 34.5 - 8), 323 - 90 - 7, 69, 90]);
    // cartel en la pared: centrado en el punto
    assert.deepEqual(dibujarImagenPared(ctx, fila('cartel_cv').arte, 'north', 700, 200), { x1: Math.round(700 - 46.5), y1: Math.round(200 - 57.5), x2: Math.round(700 - 46.5) + 93, y2: Math.round(200 - 57.5) + 115, listo: false });
  });
  prueba('el cartel colgado nunca se sale por arriba ni por abajo de la pared', () => {
    // alto util del disco sobre la pared inclinada: el alto de la imagen menos la inclinacion (w/2)
    const v = fila('cartel_cv').arte.vistas[1], disco = v.h - v.w / 2;
    const l = M.getWallPlacementLimits('cartel_cv');
    for (const oy of [l.minOy, l.maxOy]) {
      const centro = 118 * oy / 100 + 14; // centroPared: sobre la linea del piso
      assert.ok(centro + disco / 2 <= 118 + 1 && centro - disco / 2 >= 0, 'oy ' + oy);
    }
  });
});

describir('sentarse: el lugar de cada asiento en cada giro', () => {
  const HW = 46, HH = 23;
  const lugares = (id, rot) => M.asientosDeMueble(3, 3, rot, M.entradaDesdeCatalogo(fila(id))).map((a) => [a.tx, a.ty, a.direction]);
  // direccion del cuerpo: 4 = mira a +y (abajo a la izquierda), 2 = a -x, 0 = a -y, 6 = a +x
  prueba('sillon de dos: cada asiento en su baldosa, mirando para donde mira el sillon', () => {
    assert.deepEqual(lugares('sofa', 0), [[3, 3, 4], [4, 3, 4]]);
    assert.deepEqual(lugares('sofa', 1), [[3, 3, 2], [3, 4, 2]]);
    assert.deepEqual(lugares('sofa', 2), [[3, 3, 0], [4, 3, 0]]);
    assert.deepEqual(lugares('sofa', 3), [[3, 3, 6], [3, 4, 6]]);
  });
  prueba('silla: un asiento en su baldosa, en los 4 giros', () => {
    assert.deepEqual([0, 1, 2, 3].map((r) => lugares('silla', r)), [[[3, 3, 4]], [[3, 3, 2]], [[3, 3, 0]], [[3, 3, 6]]]);
  });
  prueba('la cola queda sobre el almohadon: el ancla de los pies, 18 px abajo de la cola, a la altura justa', () => {
    for (const id of ['sofa', 'silla']) {
      const a = asientoDe(fila(id));
      assert.ok(a && a.z > 0, id);
      const esperado = { 4: [-1, 1], 2: [-1, -1], 0: [1, -1], 6: [1, 1] }; // adelante en pantalla
      for (const dir of [0, 2, 4, 6]) {
        const j = ajusteAsiento(fila(id), dir, HW, HH);
        const [sx, sy] = esperado[dir];
        assert.equal(j.x, Math.round(sx * a.f * HW), id + ' dir ' + dir);
        assert.equal(j.y, Math.round(sy * a.f * HH + 18 - a.z), id + ' dir ' + dir);
      }
    }
    // los valores de hoy, para que un cambio se vea
    assert.deepEqual([0, 2, 4, 6].map((d) => ajusteAsiento(fila('sofa'), d, HW, HH)), [{ x: 6, y: -3 }, { x: -6, y: -3 }, { x: -6, y: 3 }, { x: 6, y: 3 }]);
    assert.deepEqual([0, 2, 4, 6].map((d) => ajusteAsiento(fila('silla'), d, HW, HH)), [{ x: 2, y: -3 }, { x: -2, y: -3 }, { x: -2, y: -1 }, { x: 2, y: -1 }]);
    // un mueble sin asiento dibujado (o con imagen) no corre nada: queda lo del servidor
    assert.deepEqual(ajusteAsiento(fila('mesa'), 4, HW, HH), { x: 0, y: 0 });
  });
  prueba('lo que se vuelve a dibujar adelante del sentado: el respaldo si se lo ve de espaldas, nada si de frente', () => {
    const ctx = { save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, fill() {}, fillStyle: '' };
    const delante = (id, rot, dx, dy) => {
      const [a] = M.asientosDeMueble(0, 0, rot, M.entradaDesdeCatalogo(fila(id))).filter((x) => x.tx === dx && x.ty === dy);
      return dibujarDelanteDeAsiento(ctx, fila(id), 0, 0, { hw: HW, hh: HH, rot }, dx, dy, a.direction);
    };
    // silla de frente (giros 0 y 3): nada; de espaldas (1 y 2): el respaldo
    assert.deepEqual([0, 1, 2, 3].map((r) => delante('silla', r, 0, 0)), [0, 1, 1, 0]);
    // sillon de frente: el de atras nada, el de adelante el apoyabrazos de su costado
    assert.deepEqual([delante('sofa', 0, 0, 0), delante('sofa', 0, 1, 0)], [0, 1]);
    assert.deepEqual([delante('sofa', 3, 0, 0), delante('sofa', 3, 0, 1)], [0, 1]);
    // sillon de espaldas: el respaldo (y el apoyabrazos de adelante) tapan a los dos
    for (const [rot, b] of [[1, [[0, 0], [0, 1]]], [2, [[0, 0], [1, 0]]]]) for (const [dx, dy] of b) assert.ok(delante('sofa', rot, dx, dy) >= 1, rot + ' ' + dx + ',' + dy);
    // un mueble con imagen no tiene cajas: false (se usa el recorte de PawHotel)
    assert.equal(dibujarDelanteDeAsiento(ctx, fila('mesa'), 0, 0, { hw: HW, hh: HH, rot: 0 }, 0, 0, 4), false);
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
