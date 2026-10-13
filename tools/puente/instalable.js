// La app instalable (Chrome > "Instalar app" / "Agregar a pantalla principal")
// con el nombre y el icono del servidor en vez de "Haven".
//
//  /manifest.webmanifest       el de Haven, con nombre PUENTE_TITULO, colores
//                              del tema Discord+ y el icono del servidor
//  /puente/icono-192.png       icono del servidor achicado (y 512, y la version
//                              "maskable" con margen, que Android recorta en circulo)
//
// Solo se activa si PUENTE_TITULO esta configurado. Si el servidor no tiene icono
// o no es PNG, se dejan los iconos de Haven.

const fs = require('fs');
const path = require('path');

const BG = [0x12, 0x12, 0x14]; // fondo del tema Discord+ (#121214)
const BG_HEX = '#121214';
const cache = new Map(); // "archivo|mtime|tam|maskable" -> Buffer PNG

let PNG = null;
try { PNG = require('/app/node_modules/pngjs').PNG; } catch { /* sin pngjs no hay iconos propios */ }

function title() {
  return String(process.env.PUENTE_TITULO || '').replace(/[\u0000-\u001f"<>\\]/g, '').trim().slice(0, 60);
}

// Ruta en disco del icono del servidor (setting server_icon = "/uploads/...png")
function iconFile(db) {
  if (!PNG) return null;
  const row = db.prepare("SELECT value FROM server_settings WHERE key = 'server_icon'").get();
  const v = row && String(row.value || '');
  if (!/^\/uploads\/[\w.-]+\.png$/i.test(v)) return null;
  const file = path.join('/data/uploads', path.basename(v));
  return fs.existsSync(file) ? file : null;
}

// Achica la imagen promediando cada bloque de pixeles (alfa premultiplicado).
// maskable: el logo ocupa el 80% central sobre el fondo, como pide Android.
function resize(src, size, maskable) {
  // Margen del color de la esquina del logo si es opaco (asi no queda un marco)
  const bg = src.data[3] === 255 ? [src.data[0], src.data[1], src.data[2]] : BG;
  const out = new PNG({ width: size, height: size });
  const inner = maskable ? Math.round(size * 0.8) : size;
  const off = (size - inner) / 2;
  const sx = src.width / inner, sy = src.height / inner;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      const ix = x - off, iy = y - off;
      if (ix >= 0 && iy >= 0 && ix < inner && iy < inner) {
        const x0 = Math.floor(ix * sx), x1 = Math.max(x0 + 1, Math.floor((ix + 1) * sx));
        const y0 = Math.floor(iy * sy), y1 = Math.max(y0 + 1, Math.floor((iy + 1) * sy));
        for (let yy = y0; yy < y1 && yy < src.height; yy++) {
          for (let xx = x0; xx < x1 && xx < src.width; xx++) {
            const i = (yy * src.width + xx) * 4, al = src.data[i + 3];
            r += src.data[i] * al; g += src.data[i + 1] * al; b += src.data[i + 2] * al; a += al; n++;
          }
        }
      }
      const o = (y * size + x) * 4;
      const alpha = n ? a / n : 0;
      let cr = a ? r / a : 0, cg = a ? g / a : 0, cb = a ? b / a : 0;
      if (maskable) { // fondo opaco: se mezcla el logo con el color del tema
        const t = alpha / 255;
        cr = cr * t + bg[0] * (1 - t); cg = cg * t + bg[1] * (1 - t); cb = cb * t + bg[2] * (1 - t);
      }
      out.data[o] = Math.round(cr); out.data[o + 1] = Math.round(cg); out.data[o + 2] = Math.round(cb);
      out.data[o + 3] = maskable ? 255 : Math.round(alpha);
    }
  }
  return PNG.sync.write(out);
}

function icon(db, size, maskable) {
  const file = iconFile(db);
  if (!file) return null;
  const key = `${file}|${fs.statSync(file).mtimeMs}|${size}|${maskable ? 1 : 0}`;
  if (!cache.has(key)) {
    for (const k of cache.keys()) if (!k.startsWith(file + '|')) cache.delete(k); // cambio el icono
    cache.set(key, resize(PNG.sync.read(fs.readFileSync(file)), size, maskable));
  }
  return cache.get(key);
}

function manifest(db, base) {
  const name = title();
  const server = db.prepare("SELECT value FROM server_settings WHERE key = 'server_name'").get();
  const m = { ...base, name, short_name: name, background_color: BG_HEX, theme_color: BG_HEX };
  if (server && server.value) m.description = 'Chat de ' + String(server.value).slice(0, 80);
  if (iconFile(db)) {
    m.icons = [
      { src: '/puente/icono-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/puente/icono-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/puente/icono-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ];
  }
  return m;
}

// En las paginas de Haven (/app y el login): color de la barra del celular y
// icono de la pestana iguales a los de la app instalada.
function pageHead(db, html) {
  if (!title()) return html;
  html = html.replace(/<meta name="theme-color" content="[^"]*">/, `<meta name="theme-color" content="${BG_HEX}">`);
  if (iconFile(db)) {
    html = html.replace(/<link rel="icon"[^>]*>/, '<link rel="icon" type="image/png" href="/puente/icono-192.png">' +
      '<link rel="apple-touch-icon" href="/puente/icono-maskable-512.png">');
  }
  return html;
}

// Devuelve true si atendio el pedido.
function handle(db, req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;
  const p = req.url.split('?')[0];
  if (!title()) return false;
  if (p === '/manifest.webmanifest') {
    let base = {};
    try { base = JSON.parse(fs.readFileSync('/app/public/manifest.webmanifest', 'utf8')); } catch { /* se arma uno minimo */ }
    if (!base.start_url) Object.assign(base, { id: '/app', start_url: '/app', scope: '/', display: 'standalone' });
    const body = JSON.stringify(manifest(db, base), null, 2);
    res.writeHead(200, { 'Content-Type': 'application/manifest+json; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : body);
    return true;
  }
  const m = p.match(/^\/puente\/icono-(maskable-)?(192|512)\.png$/);
  if (m) {
    const png = icon(db, Number(m[2]), !!m[1]);
    if (!png) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Sin icono'); return true; }
    res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': png.length, 'Cache-Control': 'public, max-age=3600' });
    res.end(req.method === 'HEAD' ? undefined : png);
    return true;
  }
  return false;
}

module.exports = { handle, pageHead, title };
