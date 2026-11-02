// Arma el arte de GlobalSiege (antes MissionRisk) para la seccion Juegos, desde el codigo
// original de Doug Burner (GNU GPL v3): https://github.com/labarks/globalsiege
//
//   node armar-arte.js <carpeta source del original> <salida> [--prueba]
//
// Saca de Mask4.frx (el formulario de VB6 que guarda los dibujos) el mapa (Map1, 944x650) y
// dos de las mascaras de los paises: la 0 (las siluetas en blanco) y la 4 (la textura gris).
// Deja en <salida>:
//   mapa.jpg    el mapa tal cual
//   paises.png  la hoja de los 42 paises (690x650, el mismo orden que la mascara original):
//               la textura gris con la silueta como transparencia. La pagina pinta cada pais
//               con el color de su ejercito (mapa.js dice donde esta cada uno en la hoja).
//   tapa.jpg    la tapa de la biblioteca de Juegos: el mapa con los paises pintados
//   enlace.jpg  la vista previa de los enlaces (1200x630): en el servidor va como
//               tools/puente/web/tapas/globalsiege.jpg
// Con --prueba, ademas prueba.png: el mapa pintado en tamaño original.
// Los tres primeros van en tools/puente/web/misionrisk/.
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
for (const k of ['Map1', 'pctMaskArray_0', 'pctMaskArray_4']) if (!fotos[k]) { console.error('No encontre', k, 'en Mask4.frx'); process.exit(1); }

fs.writeFileSync(path.join(out, 'mapa.jpg'), fotos.Map1);
const siluetas = jpeg.decode(fotos.pctMaskArray_0, { useTArray: true });
const textura = jpeg.decode(fotos.pctMaskArray_4, { useTArray: true });
console.log('mapa', fotos.Map1.length, 'bytes; mascaras', siluetas.width + 'x' + siluetas.height, textura.width + 'x' + textura.height);

// La hoja: solo los rectangulos de cada pais. La silueta es un JPEG (con ruido en los bordes):
// negro es afuera, blanco adentro y lo del medio queda semitransparente (borde suave).
const hoja = new PNG({ width: siluetas.width, height: siluetas.height });
hoja.data.fill(0);
for (let id = 1; id <= 42; id++) {
  const P = MAPA.paises[id];
  for (let y = 0; y < P.h; y++) {
    for (let x = 0; x < P.w; x++) {
      const sx = P.sx + x, sy = P.sy + y;
      if (sx >= siluetas.width || sy >= siluetas.height) continue;
      const i = (sy * siluetas.width + sx) * 4;
      const v = (siluetas.data[i] + siluetas.data[i + 1] + siluetas.data[i + 2]) / 3;
      const a = Math.max(0, Math.min(255, Math.round((v - 50) * 255 / 150)));
      if (!a) continue;
      const t = (sy * textura.width + sx) * 4; // la textura mide 692 de ancho y la silueta 690
      const g = (textura.data[t] + textura.data[t + 1] + textura.data[t + 2]) / 3;
      hoja.data[i] = hoja.data[i + 1] = hoja.data[i + 2] = Math.round(g);
      hoja.data[i + 3] = a;
    }
  }
}
fs.writeFileSync(path.join(out, 'paises.png'), PNG.sync.write(hoja, { colorType: 4 })); // gris con transparencia
console.log('paises.png', fs.statSync(path.join(out, 'paises.png')).size, 'bytes');

// El mapa con cada pais pintado de un color (la textura multiplicada por el color del ejercito,
// un poco aclarada para que no quede oscura): para la tapa de la biblioteca de Juegos (tapa.jpg,
// 600x413) y la vista previa de los enlaces (enlace.jpg, 1200x630, va en web/tapas/globalsiege.jpg)
{
  const mapa = jpeg.decode(fotos.Map1, { useTArray: true });
  const hex = (c) => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
  for (let id = 1; id <= 42; id++) {
    const P = MAPA.paises[id];
    const col = hex(MAPA.ejercitos[1 + (id % 6)].color);
    for (let y = 0; y < P.h; y++) {
      for (let x = 0; x < P.w; x++) {
        const i = ((P.sy + y) * hoja.width + P.sx + x) * 4;
        const a = hoja.data[i + 3] / 255;
        if (!a) continue;
        const j = ((P.y + y) * mapa.width + P.x + x) * 4;
        const g = hoja.data[i] / 255;
        for (let k = 0; k < 3; k++) mapa.data[j + k] = Math.round(mapa.data[j + k] * (1 - a) + Math.min(255, col[k] * (0.35 + g * 0.85)) * a);
      }
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
