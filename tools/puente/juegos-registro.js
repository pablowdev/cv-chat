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
//     "vistas": { "mesa": "mesa", "crear": "crear" },   vista de la pila de Juegos -> funcion del juego que la abre
//     "mesa": "mesa",                      la vista de una mesa (para entrar desde la lista de mesas)
//     "antes": ["mapa.js"],                lo que se baja antes que cliente.js (de sus archivos)
//     "version": 1,                        se suma a las direcciones (?v=) para que el navegador no use la vieja
//     "eventos": { "inicio": "truco:inicio", "estado": "truco:estado", "cambio": "truco:cambio", ... },
//     "enlace": { "param": "truco", "desc": "..." },
//     "admin": { "nombre": "Hotel", "url": "/puente/hotel/admin.html" }   su pestaña en el panel de administradores
//                                          (opcional: una pagina suya que se muestra en un marco)
//     "servidor": ["truco.js"]             sus modulos en tools/puente/ (puente.js prende los que tienen setup; el
//                                          que exporta "chat" dice lo que el chat lee del juego: conChat())
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

// Un juego en ventana (WORGS, BACITY, Curveball): un iframe del mismo origen. url: su pagina (una ruta del sitio);
// permisos: lo que el iframe puede pedir; foco: si toma el teclado al abrir; clase: el estilo del marco (jg-...)
const PERMISOS = ['autoplay', 'fullscreen', 'microphone', 'gamepad', 'camera'];
function ventana(cli, mal) {
  const url = typeof cli.url === 'string' && /^\/[\w./-]{1,120}$/.test(cli.url) && !cli.url.includes('..') ? cli.url : null;
  const permisos = Array.isArray(cli.permisos) ? cli.permisos.filter((p) => PERMISOS.includes(p)) : [];
  if (!url) { mal('cliente.url invalida (una ruta del sitio)'); return null; }
  return { tipo: 'ventana', url, permisos, foco: cli.foco === true, clase: /^jg-[a-z-]{2,30}$/.test(cli.clase || '') ? cli.clase : 'jg-gusanos' };
}

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
  // las vistas de la pila de Juegos que son de este juego -> la funcion del juego que abre cada una
  const vistas = {};
  for (const [k, v] of Object.entries(f.vistas || {})) { if (!/^[a-zA-Z]{2,24}$/.test(k) || !/^[a-zA-Z]{2,24}$/.test(v || '') || k === 'inicio') return mal(`vista ${k} invalida`); vistas[k] = v; }
  const mesa = f.mesa == null ? null : vistas[f.mesa] ? f.mesa : undefined; if (mesa === undefined) return mal('mesa no es una de sus vistas');
  const antes = Array.isArray(f.antes) ? f.antes : [];
  if (antes.some((a) => typeof a !== 'string' || !archivos.includes(a))) return mal('antes: tiene que ser de sus archivos');
  const version = Number.isInteger(f.version) && f.version > 0 && f.version < 100000 ? f.version : 1;
  const cliente = !tipo ? null : tipo === 'ventana' ? ventana(cli, mal) : { tipo, global: /^[A-Za-z_$][\w$]{0,40}$/.test(cli.global || '') ? cli.global : null, js: ARCHIVO.test(cli.js || '') ? cli.js : null, css: ARCHIVO.test(cli.css || '') ? cli.css : null };
  if (tipo && !cliente) return null;
  // desde la lista de mesas de la biblioteca: entrar directo a la mesa ("unirse") o abrir su sala ("sala")
  const lista = f.lista === 'unirse' ? 'unirse' : 'sala';
  // en "Ahora en el club": su dibujito y si la mesa "espera rival" (de a dos) o "espera jugadores"
  const icono = typeof f.icono === 'string' && f.icono.length <= 8 && !/[<>&"'\s]/.test(f.icono) ? f.icono : null;
  const jugadores = f.jugadores === 2 ? 2 : 'varios';
  // sin cuenta: si se puede jugar como invitado (la entrada de invitado, login.js) y su lugar en la pagina publica
  // de los juegos (juegos.html; sin "pagina" no aparece ahi, pero sus enlaces igual llevan a jugar como invitado)
  const invitados = f.invitados === true;
  const pagina = invitados && Number.isInteger(f.pagina) && f.pagina > 0 && f.pagina < 1000 ? f.pagina : null;
  // el nombre de sus mesas segun su modo (WORGS: { "": "WORGS: Shoppa", "normal": "WORGS: Normal" })
  let modos = null;
  for (const [k, v] of Object.entries(f.modos || {})) { if (!/^[a-z]{0,16}$/.test(k) || !texto(v, 40)) return mal(`modo ${k} invalido`); (modos = modos || {})[k] = v; }
  // la tarjeta: "aparte" se muestra solo si su "inicio" dice que esta cuenta puede entrar; "vivo": lo que se lee en
  // la tarjeta con un numero de su "inicio" ({ campo: 'gente', uno: '1 en la ciudad', varios: '{n} en la ciudad' })
  const t = f.tarjeta || {}, v = t.vivo || {};
  const vivo = /^[a-z]{2,16}$/i.test(v.campo || '') && texto(v.uno, 40) && texto(v.varios, 40) && v.varios.includes('{n}') ? { campo: v.campo, uno: v.uno, varios: v.varios } : null;
  // en las estadisticas: su nombre y color (WORGS: uno por modo)
  const COLOR = /^#[0-9a-f]{6}$/i;
  let estadisticas = Array.isArray(f.estadisticas) ? f.estadisticas : [{ id: f.id, nombre, color: f.color }];
  estadisticas = estadisticas.filter((e) => e && ID.test(e.id || '') && texto(e.nombre, 40)).map((e) => ({ id: e.id, nombre: e.nombre, color: COLOR.test(e.color || '') ? e.color : '#949ba4' }));
  return {
    id: f.id, nombre, sub: texto(f.sub, 80) || '', orden: Number.isFinite(f.orden) ? f.orden : 100,
    tapa, fondo: texto(f.fondo, 120) || '#1e1f22', ajuste: f.ajuste === 'contain' ? 'contain' : null,
    web, archivos, vistas, mesa, antes, version,
    cliente,
    eventos, servidor, lista, icono, jugadores, modos, estadisticas, invitados, pagina,
    tarjeta: { aparte: t.aparte === true, vivo },
    // su pestaña en el panel de administradores (Admin → <nombre>): una pagina suya, en un marco
    admin: f.admin && texto(f.admin.nombre, 24) && /^\/puente\/[\w./-]{1,120}$/.test(f.admin.url || '') && !f.admin.url.includes('..') ? { nombre: f.admin.nombre, url: f.admin.url } : null,
    // el enlace: su parametro (/app?juegos=<param>), nombres viejos que tambien lo abren, su texto y su imagen apaisada
    // (la vista previa del enlace en los mensajes, y la de WhatsApp o X)
    enlace: param ? {
      param, desc: texto(f.enlace.desc, 200) || '',
      alias: (Array.isArray(f.enlace.alias) ? f.enlace.alias : []).filter((a) => ID.test(a || '')),
      imagen: typeof f.enlace.imagen === 'string' && /^\/[\w./?=&%-]{1,160}$/.test(f.enlace.imagen) && !f.enlace.imagen.includes('..') ? f.enlace.imagen : null,
    } : null,
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

// La firma de las fichas instaladas (cambia si cambia alguna): para lo que se arma con ellas y se guarda armado
function firma() { lista(); return cache.firma; }
// El nombre de la tapa apaisada de un juego (/puente/tapas/<nombre>.jpg, la de su enlace), o null
const tapaDe = (j) => ((j && j.enlace && /^\/puente\/tapas\/([a-z0-9-]{2,24})\.jpg(\?|$)/.exec(j.enlace.imagen || '')) || [])[1] || null;
// El juego de un nombre de enlace (/app?juegos=worgs): su parametro, sus nombres viejos o su id
const deEnlace = (p) => (p ? lista().find((j) => j.id === p || (j.enlace && (j.enlace.param === p || j.enlace.alias.includes(p)))) || null : null);
// Lo que necesitan saber, antes que Haven y sin pedir nada, las paginas de afuera (afuera.js, instalar.js, login.js):
// que claves de la direccion son una mesa (/app?truco=<id>) y a que juegos se entra como invitado (con su nombre y tapa)
function paraPaginas() {
  const mesas = lista().filter((j) => j.mesa).map((j) => j.id);
  const invitados = {};
  for (const j of lista().filter((x) => x.invitados)) {
    const d = { nombre: j.nombre, tapa: (j.enlace && j.enlace.imagen) || null };
    for (const k of [j.id, ...(j.enlace ? [j.enlace.param, ...j.enlace.alias] : [])]) if (!invitados[k]) invitados[k] = d;
  }
  // (JSON dentro de un <script> o un .js: sin "<" ni separadores de linea sueltos)
  return JSON.stringify({ mesas, invitados }).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

// Los modulos de servidor de todos los juegos (su "servidor"), sin repetir, en el orden de las fichas: puente.js los
// prende al arrancar
function servidores() {
  const out = [];
  for (const j of lista()) for (const m of j.servidor) if (!out.includes(m)) out.push(m);
  return out;
}

// Lo que el chat lee de cada juego: el "chat" que exporta su modulo de servidor (mesas, partidas, invitados; ver
// truco.js) -> [{ ficha, chat }]. Los juegos que no lo tienen (o cuyo modulo no esta) no aparecen.
const TABLA = /^puente_[a-z0-9_]{2,40}$/;
function conChat() {
  const out = [];
  for (const j of lista()) {
    for (const m of j.servidor) {
      let x = null;
      try { x = require(path.join(__dirname, m)); } catch { continue; }
      const c = x && x.chat;
      if (!c || typeof c !== 'object') continue;
      // (los nombres de tabla van en el SQL: solo los que tienen forma de tabla del puente)
      const mesas = TABLA.test(c.mesas || '') ? c.mesas : null;
      const p = c.partidas && TABLA.test(c.partidas.tabla || '') && typeof c.partidas.leer === 'function' ? c.partidas : null;
      out.push({ ficha: j, chat: { ...c, mesas, partidas: p, medianas: (p && Array.isArray(p.medianas) ? p.medianas : []).filter((k) => /^[a-z]{2,16}$/.test(k)) } });
      break;
    }
  }
  return out;
}

// Las direcciones propias de cada juego: el modulo de servidor que exporta "rutas" (direcciones exactas, o prefijos
// si terminan en /) y "handle" (req, res, p, u, { sessionUser, json, send }; devuelve false si no era suya). Solo
// valen las que son de ese juego: /puente/api/<x>/... o /puente/<x>/..., con <x> su id, su carpeta web, su enlace
// o un alias (asi un juego no puede tomar una direccion del chat). vincular.js las atiende -> [{ id, rutas, handle }]
const RUTA = /^\/puente\/(?:api\/)?([a-z0-9-]{2,24})\/[\w./-]{0,80}$/;
let rutasHechas = { firma: null, out: [] };
function conRutas() {
  // (se arma de nuevo solo si cambio alguna ficha: lo pregunta cada pedido a /puente/)
  if (firma() === rutasHechas.firma) return rutasHechas.out;
  const out = [];
  for (const j of lista()) {
    const suyos = new Set([j.id, j.web, ...(j.enlace ? [j.enlace.param, ...j.enlace.alias] : [])].filter(Boolean));
    for (const m of j.servidor) {
      let x = null;
      try { x = require(path.join(__dirname, m)); } catch { continue; }
      if (!x || !Array.isArray(x.rutas) || typeof x.handle !== 'function') continue;
      const rutas = x.rutas.filter((r) => { const k = RUTA.exec(typeof r === 'string' ? r : ''); return k && suyos.has(k[1]) && !r.includes('..'); });
      if (rutas.length) out.push({ id: j.id, rutas, handle: x.handle });
    }
  }
  rutasHechas = { firma: cache.firma, out };
  return out;
}

module.exports = { setup, handle, lista, firma, tapaDe, deEnlace, paraPaginas, servidores, conChat, conRutas, _limpiar: limpiar };
