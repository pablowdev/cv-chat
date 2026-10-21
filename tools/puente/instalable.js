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
      // El icono comun (pestaña, app de PC) redondo y sin fondo, como el del foro:
      // recortado en circulo con el borde suavizado; afuera, transparente
      const edge = maskable ? 1 : Math.max(0, Math.min(1, size / 2 - Math.hypot(x - (size - 1) / 2, y - (size - 1) / 2)));
      out.data[o + 3] = maskable ? 255 : Math.round(alpha * edge);
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

// Icono chico de la barra de estado del celular ("badge" de las notificaciones):
// Android lo pinta de un solo color con la forma de lo que no es transparente,
// asi que un logo con fondo queda como un cuadrado blanco. Aca: el logo recortado
// en circulo y solo sus partes claras (letras, dibujo), el resto transparente.
function badge(db, size) {
  const file = iconFile(db);
  if (!file) return null;
  const key = `${file}|${fs.statSync(file).mtimeMs}|${size}|insignia`;
  if (!cache.has(key)) {
    const img = PNG.sync.read(icon(db, size, false));
    const c = (size - 1) / 2, r = size / 2;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const o = (y * size + x) * 4;
        const d = Math.hypot(x - c, y - c);
        const lum = 0.299 * img.data[o] + 0.587 * img.data[o + 1] + 0.114 * img.data[o + 2];
        let a = Math.max(0, Math.min(1, (lum - 70) / 110)) * (img.data[o + 3] / 255);
        a *= Math.max(0, Math.min(1, r - d)); // borde del circulo suavizado
        img.data[o] = img.data[o + 1] = img.data[o + 2] = 255;
        img.data[o + 3] = Math.round(a * 255);
      }
    }
    cache.set(key, PNG.sync.write(img));
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
      { src: '/puente/icono-192.png?v=2', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/puente/icono-512.png?v=2', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/puente/icono-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ];
  }
  return m;
}

// En las paginas de Haven (/app y el login): color de la barra del celular y
// icono de la pestana iguales a los de la app instalada.
function pageHead(db, html) {
  if (!title()) return html;
  // Los textos fijos de la pagina con el nombre de la app (no adentro de los scripts)
  html = html.split(/(<script\b[\s\S]*?<\/script>)/i).map(part => (/^<script\b/i.test(part) ? part
    : part.replace(/>([^<>]*\bHaven\b[^<>]*)</g, (m, t) => (KEEP_HAVEN.test(t) ? m : '>' + t.replace(/\bHaven\b/g, title()) + '<'))
      .replace(/(placeholder|title|aria-label)="([^"]*\bHaven\b[^"]*)"/g, (m, a, t) => (KEEP_HAVEN.test(t) ? m : `${a}="${t.replace(/\bHaven\b/g, title())}"`)))).join('');
  html = html.replace(/<meta name="theme-color" content="[^"]*">/, `<meta name="theme-color" content="${BG_HEX}">`);
  // En /app: los carteles de Haven que recomiendan su app de Android y la de
  // PC se reemplazan por el propio (web/instalar.js). Sin el id, la cola de
  // bienvenida de Haven no los encuentra y los saltea; los botones de la barra
  // superior que los abren tampoco hacen nada.
  if (html.includes('id="android-beta-modal"')) {
    html = html.replace('id="android-beta-modal"', 'id="android-beta-modal-apagado"')
      .replace('id="desktop-promo-modal"', 'id="desktop-promo-modal-apagado"')
      .replace('</head>', '<script src="/puente/instalar.js"></script></head>');
  }
  if (iconFile(db)) {
    html = html.replace(/<link rel="icon"[^>]*>/, '<link rel="icon" type="image/png" href="/puente/icono-192.png?v=2">' +
      '<link rel="apple-touch-icon" href="/puente/icono-maskable-512.png">');
  }
  return html;
}

// Los textos de Haven (sus traducciones, /locales/<idioma>.json) con el nombre de
// la app en vez de "Haven" ("Bienvenido a CV Chat"...). Menos donde se habla de
// Haven como proyecto: donaciones, creditos y el aviso de version nueva.
const localeCache = new Map(); // archivo -> { mtime, body }
const KEEP_HAVEN = /ko-fi|donaci|donation|generosidad|generosity|amnibro|\{\{remote\}\}|\{\{local\}\}/i;
function rename(v, name) {
  if (typeof v === 'string') return KEEP_HAVEN.test(v) ? v : v.replace(/\bHaven\b/g, name);
  if (Array.isArray(v)) return v.map(x => rename(x, name));
  if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) o[k] = rename(v[k], name); return o; }
  return v;
}
function locale(file) {
  const st = fs.statSync(file);
  const hit = localeCache.get(file);
  if (hit && hit.mtime === st.mtimeMs && hit.name === title()) return hit.body;
  const body = Buffer.from(JSON.stringify(rename(JSON.parse(fs.readFileSync(file, 'utf8')), title())), 'utf8');
  localeCache.set(file, { mtime: st.mtimeMs, name: title(), body });
  return body;
}

// Devuelve true si atendio el pedido.
function handle(db, req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;
  const p = req.url.split('?')[0];
  if (!title()) return false;
  const lm = p.match(/^\/locales\/([a-z]{2}(?:-[A-Za-z]{2,4})?)\.json$/);
  if (lm) {
    const file = path.join('/app/public/locales', lm[1] + '.json');
    if (!fs.existsSync(file)) return false;
    let body;
    try { body = locale(file); } catch { return false; } // si algo falla, el de Haven tal cual
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': body.length, 'Cache-Control': 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : body);
    return true;
  }
  if (p === '/manifest.webmanifest') {
    let base = {};
    try { base = JSON.parse(fs.readFileSync('/app/public/manifest.webmanifest', 'utf8')); } catch { /* se arma uno minimo */ }
    if (!base.start_url) Object.assign(base, { id: '/app', start_url: '/app', scope: '/', display: 'standalone' });
    const body = JSON.stringify(manifest(db, base), null, 2);
    res.writeHead(200, { 'Content-Type': 'application/manifest+json; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : body);
    return true;
  }
  // El icono de Haven ("H"): sus notificaciones lo usan de "badge" (el iconito de la barra
  // de estado). Con el icono del servidor configurado: /icon-192.svg es su version para la
  // barra de estado (redonda, sin fondo) y /icon-512.svg el icono tal cual.
  if (p === '/icon-192.svg' || p === '/icon-512.svg') {
    const png = p.includes('512') ? icon(db, 512, false) : badge(db, 96);
    if (!png) return false; // sin icono propio: el de Haven
    res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': png.length, 'Cache-Control': 'public, max-age=3600' });
    res.end(req.method === 'HEAD' ? undefined : png);
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
