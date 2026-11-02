// Mas mediciones para las estadisticas de los administradores (parte del puente; las muestra
// panel-estadisticas.js). Todo queda en el servidor, en totales por dia (nada de lo que se escribe):
//
//  - Funciones: que se usa de CV Chat (reacciones, el buscador, editar, fijar, encuestas, la voz...),
//    contando cada pedido del chat por su nombre (socket.io) y quien lo hizo, por dia.
//  - Errores y velocidad: los errores de JavaScript que les aparecen a las personas en CV Chat y cuanto
//    tarda en abrir, por dispositivo (web/aviso.js los manda).
//  - Paginas: que se mira en la web, la wiki y el foro (cuantas veces, cuanto tiempo a la vista y hasta
//    donde se leyo), y las busquedas (la wiki, Full Fat Search, el Marketplace y el chat) con cuantos
//    resultados: asi se ven las que no encuentran nada. web/origen.js manda lo de las paginas.
//
//  POST /puente/api/medir   (sin sesion, desde las paginas propias, sendBeacon) { t: 'pagina'|'busqueda'|'error'|'carga'|'notif', ... }

const AR = 3 * 3600 * 1000;
const hoyAR = () => new Date(Date.now() - AR).toISOString().slice(0, 10);
const corto = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

// Los pedidos del chat que cuentan como "usar una funcion" (los que no estan aca no se anotan)
const FUNCIONES = {
  'send-message': 'Escribir en canales', 'send-thread-message': 'Responder en hilos', 'add-reaction': 'Reaccionar',
  'edit-message': 'Editar mensajes', 'delete-message': 'Borrar mensajes', 'pin-message': 'Fijar mensajes',
  'get-pinned-messages': 'Ver mensajes fijados', 'search-messages': 'Buscador del chat', 'create-poll': 'Crear encuestas',
  'schedule-message': 'Programar mensajes', 'get-thread-messages': 'Leer hilos', 'get-channel-media': 'Ver archivos del canal',
  'get-user-profile': 'Ver perfiles', 'set-avatar': 'Cambiar la foto', 'set-bio': 'Escribir la biografía',
  'set-border': 'Personalizar el perfil', 'set-avatar-shape': 'Personalizar el perfil', 'set-animate-profile': 'Personalizar el perfil',
  'set-birthday': 'Poner el cumpleaños', 'rename-user': 'Cambiar el nombre', 'push-subscribe': 'Activar notificaciones',
  'register-fcm-token': 'Activar notificaciones', 'mark-all-read': 'Marcar todo como leído', 'voice-join': 'Entrar a la voz',
  'screen-share-started': 'Compartir pantalla', 'music-share': 'Compartir música', 'music-search': 'Buscar música',
  'link-lastfm': 'Conectar Last.fm', 'set-listening': 'Mostrar qué escucha', 'set-game-activity': 'Mostrar a qué juega',
  'invite-group-dm': 'Grupos privados', 'accept-group-dm': 'Grupos privados', 'create-channel': 'Crear canales',
  'create-temp-channel': 'Crear canales', 'get-high-scores': 'Ver récords', 'set-message-highlight': 'Destacar mensajes',
  'truco:accion': 'Juegos · Truco', 'ajedrez:accion': 'Juegos · Ajedrez', 'funball:accion': 'Juegos · Funball', 'mr:accion': 'Juegos · GlobalSiege',
};

let db = null, warn = () => {};
const pend = new Map(); // dia|funcion|user -> veces (se guarda cada minuto)
const busquedasChat = new Map(); // socket -> { q, at }
const porIp = new Map();

function setup(ctx) {
  ({ db, warn } = ctx);
  db.exec(`
    CREATE TABLE IF NOT EXISTS puente_funciones (dia TEXT NOT NULL, funcion TEXT NOT NULL, user_id INTEGER NOT NULL, n INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (dia, funcion, user_id)) WITHOUT ROWID;
    CREATE TABLE IF NOT EXISTS puente_errores (dia TEXT NOT NULL, firma TEXT NOT NULL, mensaje TEXT, donde TEXT, dispositivo TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (dia, firma, dispositivo)) WITHOUT ROWID;
    CREATE TABLE IF NOT EXISTS puente_cargas (dia TEXT NOT NULL, dispositivo TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, ms INTEGER NOT NULL DEFAULT 0, lentas INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (dia, dispositivo)) WITHOUT ROWID;
    CREATE TABLE IF NOT EXISTS puente_paginas (dia TEXT NOT NULL, pagina TEXT NOT NULL, vistas INTEGER NOT NULL DEFAULT 0, seg INTEGER NOT NULL DEFAULT 0, scroll INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (dia, pagina)) WITHOUT ROWID;
    CREATE TABLE IF NOT EXISTS puente_contadores (dia TEXT NOT NULL, clave TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (dia, clave)) WITHOUT ROWID;
    CREATE TABLE IF NOT EXISTS puente_busquedas (dia TEXT NOT NULL, donde TEXT NOT NULL, termino TEXT NOT NULL, veces INTEGER NOT NULL DEFAULT 0, sin INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (dia, donde, termino)) WITHOUT ROWID;
  `);
  if (ctx.io) ctx.io.on('connection', (socket) => {
    socket.use((packet, next) => {
      try {
        const ev = packet && packet[0];
        const uid = socket.user && socket.user.id;
        if (uid && FUNCIONES[ev]) {
          const k = hoyAR() + '|' + FUNCIONES[ev] + '|' + uid;
          pend.set(k, (pend.get(k) || 0) + 1);
        }
        if (ev === 'search-messages' && packet[1] && typeof packet[1].query === 'string' && !(packet[1].page > 1)) busquedasChat.set(socket.id, { q: packet[1].query, at: Date.now() });
      } catch { /* nunca frena el pedido */ }
      next();
    });
    // Lo que encontro el buscador del chat
    const emit = socket.emit.bind(socket);
    socket.emit = (event, payload, ...rest) => {
      if (event === 'search-results') {
        const b = busquedasChat.get(socket.id);
        if (b) { busquedasChat.delete(socket.id); try { busqueda('chat', b.q, payload && typeof payload.total === 'number' ? payload.total : Array.isArray(payload && payload.results) ? payload.results.length : 0); } catch { /* nada */ } }
      }
      return emit(event, payload, ...rest);
    };
    socket.on('disconnect', () => busquedasChat.delete(socket.id));
  });
  setInterval(guardar, 60 * 1000).unref();
}
function guardar() {
  if (!pend.size || !db) return;
  const filas = [...pend]; pend.clear();
  try {
    const put = db.prepare('INSERT INTO puente_funciones (dia, funcion, user_id, n) VALUES (?, ?, ?, ?) ON CONFLICT(dia, funcion, user_id) DO UPDATE SET n = n + excluded.n');
    db.transaction(() => { for (const [k, n] of filas) { const [dia, f, u] = k.split('|'); put.run(dia, f, Number(u), n); } })();
  } catch (err) { warn('medidas (funciones):', err.message); }
}

// Una busqueda (la wiki y el Marketplace la anotan desde el servidor; el chat, arriba)
function busqueda(donde, termino, resultados) {
  const t = corto(termino, 60).toLowerCase();
  if (t.length < 2 || !db) return;
  db.prepare('INSERT INTO puente_busquedas (dia, donde, termino, veces, sin) VALUES (?, ?, ?, 1, ?) ON CONFLICT(dia, donde, termino) DO UPDATE SET veces = veces + 1, sin = sin + excluded.sin')
    .run(hoyAR(), donde, t, resultados ? 0 : 1);
}

const DISPOSITIVOS = ['App de Android', 'App de PC', 'App de iPhone', 'Navegador del celular', 'Navegador de PC'];
function leerTexto(req, limite = 4000) {
  return new Promise(resolve => {
    let n = 0; const partes = [];
    req.on('data', c => { n += c.length; if (n > limite) { req.destroy(); resolve(''); } else partes.push(c); });
    req.on('end', () => resolve(Buffer.concat(partes).toString('utf8')));
    req.on('error', () => resolve(''));
  });
}
function demasiadas(ip) {
  const ahora = Date.now(), r = porIp.get(ip) || { n: 0, desde: ahora };
  if (ahora - r.desde > 60e3) { r.n = 0; r.desde = ahora; }
  r.n++; porIp.set(ip, r);
  if (porIp.size > 5000) porIp.clear();
  return r.n > 60;
}

async function handle(req, res, p, u, h) {
  if (p !== '/puente/api/medir') return false;
  if (req.method !== 'POST') return h.json(res, 405, { error: 'metodo' });
  const o = req.headers.origin;
  if (o && !h.allowedOrigin(o) && o !== (process.env.PUBLIC_URL || '').replace(/\/+$/, '')) return h.json(res, 403, { error: 'origen' });
  const ua = req.headers['user-agent'] || '';
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  let b = null;
  try { b = JSON.parse(await leerTexto(req)); } catch { /* nada */ }
  if (!b || typeof b !== 'object' || /bot|crawl|spider|preview/i.test(ua) || demasiadas(ip)) return h.json(res, 200, { ok: true });
  const dia = hoyAR();
  const dis = DISPOSITIVOS.includes(b.dv) ? b.dv : 'Otro';
  try {
    if (b.t === 'pagina') {
      // la direccion sin lo de despues del "?" ni el "#": dominio + camino
      const pag = corto(String(b.p || '').split(/[?#]/)[0].replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, ''), 160);
      if (!/^(chat\.|foro\.)?[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(pag)) return h.json(res, 200, { ok: true });
      const seg = Math.min(3600, Math.max(0, Math.round(Number(b.s) || 0)));
      const sc = Math.min(100, Math.max(0, Math.round(Number(b.sc) || 0)));
      db.prepare('INSERT INTO puente_paginas (dia, pagina, vistas, seg, scroll) VALUES (?, ?, 1, ?, ?) ON CONFLICT(dia, pagina) DO UPDATE SET vistas = vistas + 1, seg = seg + excluded.seg, scroll = scroll + excluded.scroll')
        .run(dia, pag || '/', seg, sc);
    } else if (b.t === 'notif') {
      // alguien toco una notificacion (con CV Chat abierto)
      db.prepare("INSERT INTO puente_contadores (dia, clave, n) VALUES (?, 'notificacion', 1) ON CONFLICT(dia, clave) DO UPDATE SET n = n + 1").run(dia);
    } else if (b.t === 'busqueda' && b.d === 'ffs') {
      busqueda('ffs', b.q, Math.max(0, Number(b.n) || 0));
    } else if (b.t === 'error') {
      const msg = corto(b.m, 200).replace(/https?:\/\/[^\s)]+/g, (x) => x.split(/[?#]/)[0]);
      const donde = corto(String(b.f || '').split(/[?#]/)[0].replace(/^https?:\/\/[^/]+/, ''), 100) + (b.l ? ':' + Math.floor(Number(b.l) || 0) : '');
      if (!msg) return h.json(res, 200, { ok: true });
      const firma = require('crypto').createHash('sha1').update(msg + '|' + donde).digest('hex').slice(0, 16);
      db.prepare('INSERT INTO puente_errores (dia, firma, mensaje, donde, dispositivo, n) VALUES (?, ?, ?, ?, ?, 1) ON CONFLICT(dia, firma, dispositivo) DO UPDATE SET n = n + 1')
        .run(dia, firma, msg, donde, dis);
    } else if (b.t === 'carga') {
      const ms = Math.round(Number(b.ms) || 0);
      if (ms > 0 && ms < 120000) db.prepare('INSERT INTO puente_cargas (dia, dispositivo, n, ms, lentas) VALUES (?, ?, 1, ?, ?) ON CONFLICT(dia, dispositivo) DO UPDATE SET n = n + 1, ms = ms + excluded.ms, lentas = lentas + excluded.lentas')
        .run(dia, dis, ms, ms > 8000 ? 1 : 0);
    }
  } catch (err) { warn('medidas:', err.message); }
  return h.json(res, 200, { ok: true });
}

// ── Para las estadisticas, entre dos dias (incluidos) ──
function datos(ini, fin, iniAnt, finAnt) {
  const q = (sql, ...a) => { try { return db.prepare(sql).all(...a); } catch { return []; } };
  // Funciones: personas distintas y veces, contra el periodo anterior
  const fn = new Map();
  for (const r of q('SELECT funcion, COUNT(DISTINCT user_id) personas, SUM(n) veces FROM puente_funciones WHERE dia >= ? AND dia <= ? GROUP BY funcion', ini, fin)) fn.set(r.funcion, { funcion: r.funcion, personas: r.personas, veces: r.veces, antes: 0 });
  for (const r of q('SELECT funcion, COUNT(DISTINCT user_id) personas FROM puente_funciones WHERE dia >= ? AND dia <= ? GROUP BY funcion', iniAnt, finAnt)) { const x = fn.get(r.funcion); if (x) x.antes = r.personas; }
  const usadas = new Set(fn.keys());
  const nunca = [...new Set(Object.values(FUNCIONES))].filter(f => !usadas.has(f));
  const usuariosFn = (q('SELECT COUNT(DISTINCT user_id) n FROM puente_funciones WHERE dia >= ? AND dia <= ?', ini, fin)[0] || {}).n || 0;
  // Errores: los que mas se repiten, con en que dispositivos
  const err = new Map();
  for (const r of q('SELECT firma, mensaje, donde, dispositivo, SUM(n) n, MAX(dia) ultimo FROM puente_errores WHERE dia >= ? AND dia <= ? GROUP BY firma, dispositivo', ini, fin)) {
    const x = err.get(r.firma) || { mensaje: r.mensaje, donde: r.donde, n: 0, dispositivos: [], ultimo: r.ultimo };
    x.n += r.n; x.dispositivos.push(r.dispositivo); if (r.ultimo > x.ultimo) x.ultimo = r.ultimo;
    err.set(r.firma, x);
  }
  const erroresDia = q('SELECT dia, SUM(n) n FROM puente_errores WHERE dia >= ? AND dia <= ? GROUP BY dia', ini, fin);
  const cargas = q('SELECT dispositivo, SUM(n) n, SUM(ms) ms, SUM(lentas) lentas FROM puente_cargas WHERE dia >= ? AND dia <= ? GROUP BY dispositivo', ini, fin)
    .map(r => ({ dispositivo: r.dispositivo, veces: r.n, segundos: Math.round(r.ms / r.n / 100) / 10, lentas: r.lentas }));
  // Paginas: las mas vistas (por sitio), con el tiempo y la lectura promedio
  const paginas = q('SELECT pagina, SUM(vistas) vistas, SUM(seg) seg, SUM(scroll) scroll FROM puente_paginas WHERE dia >= ? AND dia <= ? GROUP BY pagina ORDER BY vistas DESC LIMIT 60', ini, fin)
    .map(r => ({ pagina: r.pagina, vistas: r.vistas, seg: Math.round(r.seg / r.vistas), lectura: Math.round(r.scroll / r.vistas) }));
  const busquedas = q('SELECT donde, termino, SUM(veces) veces, SUM(sin) sin FROM puente_busquedas WHERE dia >= ? AND dia <= ? GROUP BY donde, termino ORDER BY veces DESC', ini, fin);
  const medidoDesde = (q('SELECT MIN(dia) d FROM (SELECT MIN(dia) dia FROM puente_funciones UNION ALL SELECT MIN(dia) FROM puente_paginas UNION ALL SELECT MIN(dia) FROM puente_cargas)')[0] || {}).d || null;
  return {
    medidoDesde,
    funciones: [...fn.values()].sort((a, b) => b.personas - a.personas || b.veces - a.veces), nunca, usuariosFn,
    errores: [...err.values()].sort((a, b) => b.n - a.n).slice(0, 15), erroresTotal: erroresDia.reduce((s, r) => s + r.n, 0),
    cargas, paginas,
    busquedas: busquedas.slice(0, 25), sinResultado: busquedas.filter(b => b.sin > 0).sort((a, b) => b.sin - a.sin).slice(0, 15),
    busquedasTotal: busquedas.reduce((s, b) => s + b.veces, 0),
  };
}

module.exports = { setup, handle, busqueda, datos, FUNCIONES };
