// El registro de los Juegos: cada juego vive en su propio repositorio y, al instalarse, deja su ficha en
// tools/puente/juegos/<id>.json (su registro.json). Con las fichas, el chat sabe que juegos hay sin que haya que
// tocar cv-chat para sumar uno: el nombre y la tapa de su tarjeta, sus archivos, sus eventos y su enlace.
//
//   GET /puente/api/juegos/registro          -> { juegos: [ficha, ...] } (ordenadas por "orden")
//   GET /puente/<web>/<archivo>              -> un archivo que la ficha lista en "archivos", de web/<web>/
//                                               (solo para los juegos que no tienen ya su propia ruta en vincular.js)
//
// Una ficha (registro.json en el repositorio del juego):
//   {
//     "id": "truco",                       letras, numeros y guiones
//     "nombre": "Truco", "sub": "Argentino, 1 contra 1", "orden": 10,
//     "tapa": "/puente/cartas/banner.webp?v=5", "fondo": "#0d1410", "ajuste": "contain" (opcional),
//     "web": "truco",                      su carpeta en tools/puente/web/ (y su direccion /puente/<web>/)
//     "archivos": ["juego.js", "juego.css"],   lo que se sirve de esa carpeta
//     "cliente": { "tipo": "pantalla" | "ventana", "global": "puenteTruco", "js": "juego.js", "css": "juego.css" },
//     "eventos": { "inicio": "truco:inicio", "estado": "truco:estado", "cambio": "truco:cambio", ... },
//     "enlace": { "param": "truco", "desc": "..." },
//     "servidor": ["truco.js"]             sus modulos en tools/puente/
//   }
// Una ficha que no cumple se ignora (y queda anotado), asi un error en un juego no tira a los demas.
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, 'juegos');
const WEB = path.join(__dirname, 'web');
let warn = () => {};
let cache = { cuando: 0, juegos: [], firma: '' };

const ID = /^[a-z0-9-]{2,24}$/, ARCHIVO = /^[\w-]+(\.[\w-]+)*\.[a-z0-9]{1,5}$/i, EVENTO = /^[a-z0-9-]{2,24}:[a-z0-9-]{2,24}$/i;
const texto = (v, max) => (typeof v === 'string' && v.trim() && v.length <= max ? v.trim() : null);

// Revisa una ficha y devuelve la version limpia (o null con el motivo anotado)
function limpiar(f, archivo) {
  const mal = (m) => { warn(`juegos: ${archivo}: ${m} (se ignora)`); return null; };
  if (!f || typeof f !== 'object') return mal('no es un objeto');
  if (!ID.test(f.id || '')) return mal('id invalido');
  if (path.basename(archivo, '.json') !== f.id) return mal('el archivo no se llama como su id');
  const nombre = texto(f.nombre, 40); if (!nombre) return mal('falta el nombre');
  const web = f.web == null ? null : ID.test(f.web) ? f.web : undefined; if (web === undefined) return mal('web invalida');
  const archivos = Array.isArray(f.archivos) ? f.archivos : [];
  if (archivos.some((a) => typeof a !== 'string' || !ARCHIVO.test(a))) return mal('un archivo con nombre invalido');
  const tapa = f.tapa == null ? null : texto(f.tapa, 200);
  if (tapa && !/^\/[\w./?=&%-]*$/.test(tapa)) return mal('tapa invalida (tiene que ser una ruta del sitio)');
  const cli = f.cliente || {};
  const tipo = ['pantalla', 'ventana'].includes(cli.tipo) ? cli.tipo : null;
  if (cli.tipo != null && !tipo) return mal('cliente.tipo invalido');
  const eventos = {};
  for (const [k, v] of Object.entries(f.eventos || {})) { if (!/^[a-z]{2,16}$/.test(k) || !EVENTO.test(v || '')) return mal(`evento ${k} invalido`); eventos[k] = v; }
  const servidor = Array.isArray(f.servidor) ? f.servidor : [];
  if (servidor.some((m) => typeof m !== 'string' || !/^[\w-]+\.(js|cjs)$/.test(m))) return mal('un modulo de servidor con nombre invalido');
  const param = f.enlace && f.enlace.param;
  if (param != null && !ID.test(param)) return mal('enlace.param invalido');
  return {
    id: f.id, nombre, sub: texto(f.sub, 80) || '', orden: Number.isFinite(f.orden) ? f.orden : 100,
    tapa, fondo: texto(f.fondo, 120) || '#1e1f22', ajuste: f.ajuste === 'contain' ? 'contain' : null,
    web, archivos,
    cliente: tipo ? { tipo, global: /^[A-Za-z_$][\w$]{0,40}$/.test(cli.global || '') ? cli.global : null, js: ARCHIVO.test(cli.js || '') ? cli.js : null, css: ARCHIVO.test(cli.css || '') ? cli.css : null } : null,
    eventos, enlace: param ? { param, desc: texto(f.enlace.desc, 200) || '' } : null, servidor,
  };
}

// Las fichas instaladas (se vuelven a leer si cambio algo en la carpeta, como mucho cada 5 segundos)
function lista() {
  if (Date.now() - cache.cuando < 5000) return cache.juegos;
  cache.cuando = Date.now();
  let nombres = [];
  try { nombres = fs.readdirSync(DIR).filter((n) => n.endsWith('.json')).sort(); } catch { cache.juegos = []; cache.firma = ''; return cache.juegos; }
  const firma = nombres.map((n) => { try { const st = fs.statSync(path.join(DIR, n)); return n + ':' + st.size + ':' + st.mtimeMs; } catch { return n; } }).join('|');
  if (firma === cache.firma) return cache.juegos;
  const juegos = [];
  for (const n of nombres) {
    let f = null;
    try { f = JSON.parse(fs.readFileSync(path.join(DIR, n), 'utf8')); } catch (err) { warn(`juegos: ${n}: no se pudo leer (${err.message})`); continue; }
    const j = limpiar(f, n);
    if (j && !juegos.some((x) => x.id === j.id)) juegos.push(j);
  }
  juegos.sort((a, b) => a.orden - b.orden || a.id.localeCompare(b.id));
  cache.juegos = juegos; cache.firma = firma;
  return juegos;
}

function setup(ctx) {
  warn = (ctx && ctx.warn) || warn;
  const n = lista().length;
  if (ctx && ctx.log) ctx.log(`juegos: registro con ${n} ${n === 1 ? 'ficha' : 'fichas'}`);
}

// Las rutas. yaServidas: las carpetas que vincular.js ya sirve con su propia ruta (esas no se tocan aca)
function handle(req, res, p, { json, send, appName, mismaHuella, yaServidas }) {
  if (req.method !== 'GET') return false;
  if (p === '/puente/api/juegos/registro') { json(res, 200, { juegos: lista() }); return true; }
  const m = /^\/puente\/([a-z0-9-]{2,24})\/([^/]+)$/.exec(p);
  if (!m || (yaServidas && yaServidas.has(m[1]))) return false;
  const j = lista().find((x) => x.web === m[1]);
  if (!j || !j.archivos.includes(m[2])) return false;
  const file = path.join(WEB, j.web, m[2]);
  if (!file.startsWith(path.join(WEB, j.web) + path.sep)) return false;
  let st; try { st = fs.statSync(file); } catch { send(res, 404, 'text/plain; charset=utf-8', 'No está'); return true; }
  const ext = m[2].slice(m[2].lastIndexOf('.') + 1).toLowerCase();
  const tipo = { js: 'application/javascript', css: 'text/css', html: 'text/html', json: 'application/json', png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', wav: 'audio/wav', mp3: 'audio/mpeg', svg: 'image/svg+xml' }[ext] || 'application/octet-stream';
  const etag = '"' + st.size.toString(36) + '-' + Math.round(st.mtimeMs).toString(36) + '"';
  if (mismaHuella(req.headers['if-none-match'], etag)) { res.writeHead(304, { ETag: etag, 'Cache-Control': 'no-cache' }); res.end(); return true; }
  let body = fs.readFileSync(file);
  if (ext === 'js') body = body.toString('utf8').replace(/__PUENTE_APP__/g, appName().replace(/[\\'"`\r\n<>]/g, ''));
  send(res, 200, tipo, body, { ETag: etag, 'Cache-Control': /^(png|jpe?g|webp|wav|mp3)$/.test(ext) ? 'public, max-age=604800' : 'no-cache' });
  return true;
}

module.exports = { setup, handle, lista, _limpiar: limpiar };
