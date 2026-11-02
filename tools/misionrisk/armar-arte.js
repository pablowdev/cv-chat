// Arma el arte de GlobalSiege (antes MissionRisk) para la seccion Juegos, desde el codigo
// original de Doug Burner (GNU GPL v3): https://github.com/labarks/globalsiege
//
//   node armar-arte.js <carpeta source del original> <salida> [--prueba]
//
// Saca de Mask4.frx (el formulario de VB6 que guarda los dibujos) todo tal cual:
//   mapa.jpg        el mapa (Map1, 944x650)
//   paises-1.png    las mascaras de relieve de los paises (pctMaskArray 1, 2 y 3: gris clara,
//   paises-2.png    gris oscura y azul), recortadas con la silueta de la mascara 0 como
//   paises-3.png    transparencia. La pagina pinta cada pais como el original (ColorCountry):
//                   la mascara del ejercito combinada con su color (mapa.js)
//   cartas.png      las cartas (pctCardSource: 5 de 60x85, abajo las elegidas)
//   cartitas.png    las cartas chicas (pctLittleCrdSource: 5 de 30x41)
//   dados.png       los dados (pctDice: 6 de 39x39; los blancos de la defensa y los rojos del ataque)
//   ding.wav        el sonido del original (cuando te toca)
//   tapa.jpg        la tapa de la biblioteca de Juegos: el mapa pintado
//   enlace.jpg      la vista previa de los enlaces (1200x630): en el servidor va como
//                   tools/puente/web/tapas/globalsiege.jpg
// Con --prueba, ademas prueba.png: el mapa pintado en tamaño original.
// Todo menos enlace.jpg va en tools/puente/web/misionrisk/.
// Necesita jpeg-js y pngjs (npm install jpeg-js pngjs, en cualquier carpeta del NODE_PATH).
'use strict';
const fs = require('fs');
const path = require('path');
const jpeg = require('jpeg-js');
const { PNG } = require('pngjs');
const MAPA = require('../puente/web/misionrisk/mapa.js');

const [src, out] = process.argv.slice(2);
if (!src || !out) { console.error('Uso: node armar-arte.js <carpeta source> <salida> [--prueba]'); process.exit(1); }
fs.mkdirSync(out, { recursive: true });

// Las imagenes de un .frx: el .frm dice en que posicion esta cada una ("Mask4.frx":5E901).
// Cada imagen va precedida de su largo (4 bytes), "lt\0\0" y otra vez el largo.
const frm = fs.readFileSync(path.join(src, 'Mask4.frm'), 'latin1');
const frx = fs.readFileSync(path.join(src, 'Mask4.frx'));
const fotos = {};
let control = '';
for (const linea of frm.split(/\r?\n/)) {
  let m = /Begin \S+ (\S+)/.exec(linea);
  if (m) control = m[1];
  m = /Index\s+=\s+(\d+)/.exec(linea);
  if (m) control = control.replace(/_\d+$/, '') + '_' + m[1];
  m = /^\s*Picture\s+=\s+"Mask4\.frx":([0-9A-F]+)/.exec(linea);
  if (!m) continue;
  let p = parseInt(m[1], 16);
  let largo = frx.readUInt32LE(p);
  if (frx.toString('latin1', p + 4, p + 6) === 'lt') { largo = frx.readUInt32LE(p + 8); p += 12; } else p += 4;
  fotos[control] = frx.subarray(p, p + largo);
}
const hacen = ['Map1', 'pctMaskArray_0', 'pctMaskArray_1', 'pctMaskArray_2', 'pctMaskArray_3', 'pctCardSource', 'pctLittleCrdSource', 'pctDice'];
for (const k of hacen) if (!fotos[k]) { console.error('No encontre', k, 'en Mask4.frx'); process.exit(1); }

// Un BMP de 24 bits (de abajo hacia arriba, filas de a 4 bytes) a PNG
function bmpAPng(b) {
  const off = b.readUInt32LE(10), w = b.readInt32LE(18), h = b.readInt32LE(22), bpp = b.readUInt16LE(28);
  if (bpp !== 24) throw new Error('BMP de ' + bpp + ' bits');
  const fila = Math.ceil(w * 3 / 4) * 4;
  const png = new PNG({ width: w, height: Math.abs(h) });
  for (let y = 0; y < png.height; y++) {
    const sy = h > 0 ? png.height - 1 - y : y;
    for (let x = 0; x < w; x++) {
      const i = off + sy * fila + x * 3, o = (y * w + x) * 4;
      png.data[o] = b[i + 2]; png.data[o + 1] = b[i + 1]; png.data[o + 2] = b[i]; png.data[o + 3] = 255;
    }
  }
  return PNG.sync.write(png, { colorType: 2 });
}
for (const [k, f] of [['pctCardSource', 'cartas.png'], ['pctLittleCrdSource', 'cartitas.png'], ['pctDice', 'dados.png']]) {
  fs.writeFileSync(path.join(out, f), bmpAPng(fotos[k]));
  console.log(f, fs.statSync(path.join(out, f)).size, 'bytes');
}
fs.copyFileSync(path.join(src, 'ding.wav'), path.join(out, 'ding.wav'));
fs.writeFileSync(path.join(out, 'mapa.jpg'), fotos.Map1);

// Las mascaras: la 0 es la silueta (blanca adentro; es un JPEG, con ruido en los bordes: lo del
// medio queda semitransparente) y la 1, 2 y 3 el relieve de cada color
const silueta = jpeg.decode(fotos.pctMaskArray_0, { useTArray: true });
const alfa = (sx, sy) => {
  if (sx >= silueta.width || sy >= silueta.height) return 0;
  const i = (sy * silueta.width + sx) * 4;
  return Math.max(0, Math.min(255, Math.round(((silueta.data[i] + silueta.data[i + 1] + silueta.data[i + 2]) / 3 - 50) * 255 / 150)));
};
const hojas = {};
for (const k of [1, 2, 3]) {
  const m = jpeg.decode(fotos['pctMaskArray_' + k], { useTArray: true });
  const hoja = new PNG({ width: silueta.width, height: silueta.height });
  hoja.data.fill(0);
  for (let id = 1; id <= 42; id++) {
    const P = MAPA.paises[id];
    for (let y = 0; y < P.h; y++) for (let x = 0; x < P.w; x++) {
      const sx = P.sx + x, sy = P.sy + y, a = alfa(sx, sy);
      if (!a || sx >= m.width || sy >= m.height) continue;
      const i = (sy * m.width + sx) * 4, o = (sy * hoja.width + sx) * 4;
      hoja.data[o] = m.data[i]; hoja.data[o + 1] = m.data[i + 1]; hoja.data[o + 2] = m.data[i + 2]; hoja.data[o + 3] = a;
    }
  }
  hojas[k] = hoja;
  // las grises van en gris con transparencia (mas livianas), la azul en color
  fs.writeFileSync(path.join(out, `paises-${k}.png`), PNG.sync.write(hoja, { colorType: k === 3 ? 6 : 4 }));
  console.log(`paises-${k}.png`, fs.statSync(path.join(out, `paises-${k}.png`)).size, 'bytes');
}

// El mapa con los paises pintados como en el original (cada uno de un ejercito): para la tapa de la
// biblioteca (tapa.jpg, 600x413) y la vista previa de los enlaces (enlace.jpg, 1200x630)
{
  const mapa = jpeg.decode(fotos.Map1, { useTArray: true });
  const hex = (c) => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
  for (let id = 1; id <= 42; id++) {
    const P = MAPA.paises[id];
    const E = MAPA.ejercitos[1 + (id % 6)];
    const col = hex(E.pintura), hoja = hojas[E.mascara];
    for (let y = 0; y < P.h; y++) for (let x = 0; x < P.w; x++) {
      const i = ((P.sy + y) * hoja.width + P.sx + x) * 4;
      const a = hoja.data[i + 3] / 255;
      if (!a) continue;
      const j = ((P.y + y) * mapa.width + P.x + x) * 4;
      for (let k = 0; k < 3; k++) mapa.data[j + k] = Math.round(mapa.data[j + k] * (1 - a) + (hoja.data[i + k] * col[k] / 255) * a);
    }
  }
  // Achicar (o agrandar) con interpolacion bilineal sobre un fondo del azul del mar
  const lienzo = (W, H, escala, ox, oy) => {
    const d = Buffer.alloc(W * H * 4);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const o = (y * W + x) * 4;
        const fx = (x - ox) / escala, fy = (y - oy) / escala;
        if (fx < 0 || fy < 0 || fx > mapa.width - 1 || fy > mapa.height - 1) { d[o] = 10; d[o + 1] = 63; d[o + 2] = 143; d[o + 3] = 255; continue; }
        const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(x0 + 1, mapa.width - 1), y1 = Math.min(y0 + 1, mapa.height - 1), ax = fx - x0, ay = fy - y0;
        for (let k = 0; k < 3; k++) {
          const v = (i, j) => mapa.data[(j * mapa.width + i) * 4 + k];
          d[o + k] = Math.round((v(x0, y0) * (1 - ax) + v(x1, y0) * ax) * (1 - ay) + (v(x0, y1) * (1 - ax) + v(x1, y1) * ax) * ay);
        }
        d[o + 3] = 255;
      }
    }
    return { width: W, height: H, data: d };
  };
  fs.writeFileSync(path.join(out, 'tapa.jpg'), jpeg.encode(lienzo(600, 413, 600 / mapa.width, 0, 0), 86).data);
  const e = 630 / mapa.height;
  fs.writeFileSync(path.join(out, 'enlace.jpg'), jpeg.encode(lienzo(1200, 630, e, (1200 - mapa.width * e) / 2, 0), 86).data);
  console.log('tapa.jpg y enlace.jpg listas');
  if (process.argv.includes('--prueba')) {
    const png = new PNG({ width: mapa.width, height: mapa.height });
    png.data = Buffer.from(mapa.data);
    fs.writeFileSync(path.join(out, 'prueba.png'), PNG.sync.write(png));
    console.log('prueba.png lista');
  }
}
