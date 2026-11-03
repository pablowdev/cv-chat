// El banner de GlobalSiege para la sala del juego (como el del Truco): el mapa pintado del juego (tapa.jpg,
// de armar-arte.js) en un marco, con el nombre abajo en letras de pixeles. Se arma con sharp (el de las
// vistas previas del puente):
//   node armar-banner.js <carpeta web/misionrisk> <ruta de sharp>
// y deja banner.webp (1080x720) en esa carpeta.
'use strict';
const path = require('path');
const dir = process.argv[2] || path.join(__dirname, '../puente/web/misionrisk');
const sharp = require(process.argv[3] || 'sharp');

const W = 1080, H = 720;
const FONDO = '#0b2552', MARCO = '#d9b44a', OSCURO = '#2a1a10';
const svg = (w, h, s) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${s}</svg>`);

(async () => {
  // El fondo con el marco doble, como el del Truco
  const base = svg(W, H, `<rect width="${W}" height="${H}" fill="${FONDO}"/>
    <rect x="14" y="14" width="${W - 28}" height="${H - 28}" fill="none" stroke="${MARCO}" stroke-width="6"/>
    <rect x="28" y="28" width="${W - 56}" height="${H - 56}" fill="none" stroke="${MARCO}" stroke-opacity="0.45" stroke-width="2"/>`);
  // El mapa, con una sombra
  const mw = 860, mh = Math.round(mw * 413 / 600);
  const mapa = await sharp(path.join(dir, 'tapa.jpg')).resize(mw, mh, { fit: 'fill', kernel: 'nearest' }).toBuffer();
  const mx = (W - mw) / 2, my = 52;
  const sombra = svg(mw, mh, `<rect width="${mw}" height="${mh}" rx="10" fill="#000" fill-opacity="0.55"/>`);
  const borde = svg(mw, mh, `<rect x="2" y="2" width="${mw - 4}" height="${mh - 4}" rx="8" fill="none" stroke="#000" stroke-opacity="0.6" stroke-width="4"/>`);
  // El nombre: chico y agrandado sin suavizar (pixeles), amarillo con sombra, en su cartel
  const chico = 6; // cuanto se agranda
  const tw = 150, th = 22;
  const texto = svg(tw, th, `<defs><linearGradient id="d" x1="0" y1="0" x2="0" y2="1"><stop offset="0.15" stop-color="#fff3b0"/><stop offset="0.5" stop-color="#ffd23f"/><stop offset="0.95" stop-color="#e07a10"/></linearGradient></defs>
    <text x="${tw / 2}" y="17" text-anchor="middle" font-family="DejaVu Sans" font-weight="bold" font-size="17" fill="url(#d)" letter-spacing="0.5">GLOBALSIEGE</text>`);
  // (sin medios tonos: cada pixel es letra o no, como en el del Truco)
  const { data, info } = await sharp(texto).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 3; i < data.length; i += 4) data[i] = data[i] > 110 ? 255 : 0;
  const nombre = await sharp(data, { raw: info }).png().toBuffer();
  const grande = await sharp(nombre).resize(tw * chico, th * chico, { kernel: 'nearest' }).png().toBuffer();
  const cw = tw * chico + 60, ch = th * chico + 36, cx = (W - cw) / 2, cy = H - ch - 46;
  const cartel = svg(cw, ch, `<rect width="${cw}" height="${ch}" fill="${OSCURO}"/>
    <rect x="5" y="5" width="${cw - 10}" height="${ch - 10}" fill="none" stroke="${MARCO}" stroke-width="6"/>`);
  await sharp(base).composite([
    { input: sombra, left: mx + 8, top: my + 10 },
    { input: mapa, left: mx, top: my },
    { input: borde, left: mx, top: my },
    { input: cartel, left: Math.round(cx), top: cy },
    { input: grande, left: Math.round(cx + 30), top: cy + 18 },
  ]).webp({ quality: 88 }).toFile(path.join(dir, 'banner.webp'));
  console.log('banner.webp listo');
})().catch((err) => { console.error(err); process.exit(1); });
