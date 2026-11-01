// El foro adentro de CV Chat, con el lector del foro (deploy/foro/lector: solo lee, y solo lo publico).
//
//  - Canal del foro, apagado (el foro se abre adentro de CV Chat con su boton, aviso.js). Con FORO_CANAL (el
//    nombre de un canal de texto que crea un administrador): cada tema nuevo del foro es un mensaje, y sus
//    respuestas van en su hilo, con el webhook del canal, con el nombre y la foto de quien lo escribio en el
//    foro. Empieza desde lo que haya cuando se prende: no trae lo viejo. Sin FORO_CANAL_RESPUESTAS=1 (lo de
//    hoy, en #que-paso) solo avisa de cada tema nuevo, sin las respuestas.
//  - Vista previa de los enlaces al foro (vincular.js la pide al pegar un enlace).
//  - GET /puente/api/foro/buscar?q=  temas del foro (el "/foro <texto>" del chat, web/aviso.js)
//
// FORO_LECTOR_URL (http://foro-lector:8080) y FORO_LECTOR_CLAVE (la LECTOR_CLAVE de /opt/foro/lector.env).

const crypto = require('crypto');

const CADA_MS = 60 * 1000, POR_VUELTA = 20;
let db, log, warn, h, url = '', clave = '', canal = '', foroUrl = '', respuestas = false;
let andando = false;

function setup(ctx) {
  ({ db, log, warn, helpers: h } = ctx);
  url = String(process.env.FORO_LECTOR_URL || '').replace(/\/+$/, '');
  clave = String(process.env.FORO_LECTOR_CLAVE || '');
  canal = String(process.env.FORO_CANAL || '').trim().toLowerCase();
  respuestas = process.env.FORO_CANAL_RESPUESTAS === '1';
  foroUrl = String(process.env.FORO_URL || '').replace(/\/+$/, '');
  if (!url || clave.length < 32) return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS puente_foro_estado (clave TEXT PRIMARY KEY, valor TEXT);
    CREATE TABLE IF NOT EXISTS puente_foro_temas (tema_id INTEGER PRIMARY KEY, message_id INTEGER NOT NULL, channel_id INTEGER NOT NULL);
  `);
  if (!canal) { log('foro: lector listo (vistas previas y busqueda; sin canal del foro)'); return; }
  log(`foro: lector listo; el canal #${canal} recibe los temas nuevos${respuestas ? ' y sus respuestas' : ''}`);
  setTimeout(vuelta, 15000);
  setInterval(vuelta, CADA_MS);
}
const on = () => !!(url && clave.length >= 32);

async function lector(p) {
  const r = await fetch(url + p, { headers: { 'X-Lector-Clave': clave }, signal: AbortSignal.timeout(10000) });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error('lector ' + r.status);
  return r.json();
}
const estado = (k, v) => {
  if (v === undefined) { const r = db.prepare('SELECT valor FROM puente_foro_estado WHERE clave = ?').get(k); return r ? r.valor : null; }
  db.prepare('INSERT INTO puente_foro_estado (clave, valor) VALUES (?, ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor').run(k, String(v));
};

// El canal #foro y su webhook (se crea solo, con un token al azar)
function webhook() {
  const ch = db.prepare('SELECT id, code FROM channels WHERE LOWER(name) = ? AND COALESCE(is_dm, 0) = 0 ORDER BY id LIMIT 1').get(canal);
  if (!ch) return null;
  let w = db.prepare("SELECT token FROM webhooks WHERE channel_id = ? AND name = 'Foro' AND is_active = 1").get(ch.id);
  if (!w) {
    const token = crypto.randomBytes(32).toString('hex');
    const admin = db.prepare('SELECT id FROM users WHERE is_admin = 1 ORDER BY id LIMIT 1').get();
    db.prepare("INSERT INTO webhooks (channel_id, name, token, created_by) VALUES (?, 'Foro', ?, ?)").run(ch.id, token, admin ? admin.id : null);
    log(`foro: webhook creado para #${canal}`);
    w = { token };
  }
  return { ...ch, token: w.token };
}
async function publicar(w, body) {
  const r = await fetch(`http://127.0.0.1:${process.env.PORT || 3000}/api/webhooks/${w.token}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`webhook ${r.status} ${d.error || ''}`);
  return d.message_id;
}
const corto = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);
const nombre = n => corto(`${n || 'Alguien'} · foro`, 32);

async function vuelta() {
  if (andando || !on()) return;
  andando = true;
  try {
    const w = webhook();
    if (!w) return; // todavia no hay #foro
    // Hasta donde se publico, por canal: al cambiar de canal empieza de nuevo desde lo ultimo
    const K = 'desde:' + canal;
    let desde = estado(K);
    if (desde == null) { const u = await lector('/ultimo'); estado(K, u.ultimo); log(`foro: #${canal} empieza desde el tema ${u.ultimo}`); return; }
    const d = await lector(`/novedades?desde=${Number(desde)}&limite=${POR_VUELTA}`);
    for (const n of d.novedades) {
      const map = db.prepare('SELECT message_id FROM puente_foro_temas WHERE tema_id = ? AND channel_id = ?').get(n.tema_id, w.id);
      let id;
      if (!respuestas) {
        // Solo el aviso de cada tema nuevo
        // Los de tejemanejes no (quedo de archivo: la compra/venta se avisa desde el Marketplace, mercado.js)
        if (n.es_tema && !/\/tejemanejes\//.test(n.url)) {
          await publicar(w, { username: nombre(n.autor), avatar_url: n.foto || undefined,
            content: `📝 **Tema nuevo en el foro: ${n.tema}**\n${n.texto ? '> ' + corto(n.texto, 280).replace(/\n+/g, '\n> ') + '\n' : ''}[Leelo en el foro](${n.url}) · ${n.canal}` });
        }
      } else if (n.es_tema) {
        id = await publicar(w, { username: nombre(n.autor), avatar_url: n.foto || undefined,
          content: `**${n.tema}**\n${n.texto ? n.texto + '\n' : ''}\n[Leer en el foro](${n.url}) · ${n.canal}` });
        db.prepare('INSERT OR REPLACE INTO puente_foro_temas (tema_id, message_id, channel_id) VALUES (?, ?, ?)').run(n.tema_id, id, w.id);
      } else if (map) {
        await publicar(w, { username: nombre(n.autor), avatar_url: n.foto || undefined, thread_id: map.message_id,
          content: `${n.texto || '(sin texto)'}\n[ver en el foro](${n.url})` });
      } else {
        // Respuesta a un tema de antes de que existiera #foro
        await publicar(w, { username: nombre(n.autor), avatar_url: n.foto || undefined,
          content: `💬 respondió en **${n.tema}**\n${n.texto ? '> ' + corto(n.texto, 240) + '\n' : ''}[ver en el foro](${n.url})` });
      }
      estado(K, n.id);
    }
    estado(K, Math.max(Number(estado(K)), d.hasta));
  } catch (err) {
    warn('foro: canal #' + canal + ':', err.message);
  } finally { andando = false; }
}

// ── Vista previa de un enlace al foro ──
// Que es el enlace: un tema o una respuesta (/node/123, /forum/.../123-titulo, con ?p=456 o #post456 la
// respuesta), un perfil (/member/12-nombre), o la portada o un foro (/, /forum, /forum/tech/hardware)
function nodoDe(enlace) {
  try {
    const u = new URL(enlace);
    if (!foroUrl || u.origin !== new URL(foroUrl).origin) return null;
    const p = u.pathname.replace(/\/+$/, '');
    const post = Number(u.searchParams.get('p')) || Number((u.hash.match(/^#post(\d+)$/) || [])[1]) || 0;
    let m = p.match(/^\/member\/(\d+)(?:-[^/]*)?$/);
    if (m) return { tipo: 'miembro', id: Number(m[1]) };
    if ((m = p.match(/^\/node\/(\d+)$/) || p.match(/^\/forum\/.*\/(\d+)-[^/]*$/))) return { tipo: 'tema', id: post || Number(m[1]) };
    if (p === '' || p === '/forum' || /^\/forum\/[^.]+$/.test(p)) return { tipo: 'canal', ruta: decodeURIComponent(p.slice(1)) };
    return null;
  } catch { return null; }
}
const SITIO = 'Foro de Círculo Vicioso', ROSA = '#ee2d6f';
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
// La tarjeta: el titulo arriba (en azul, como las de los sitios) y abajo de quien es, donde y el texto.
// Un perfil va con la foto y el nombre, como las de las redes
async function tarjeta(d) {
  if (d.tipo === 'tema') {
    const t = ((await lector(`/tema?id=${d.id}`)) || {}).tema;
    if (!t) return null;
    const linea = `${t.es_tema ? 'Tema de' : 'Respuesta de'} ${t.autor} en ${t.canal}${t.respuestas != null ? ' · ' + plural(t.respuestas, 'respuesta', 'respuestas') : ''}`;
    return { siteName: SITIO, accentColor: ROSA, title: t.tema, description: `${linea}${t.texto ? '\n\n' + t.texto : ''}` };
  }
  if (d.tipo === 'canal') {
    const c = ((await lector(`/canal?ruta=${encodeURIComponent(d.ruta)}`)) || {}).canal;
    if (!c) return null;
    const u = c.ultimo;
    const lineas = [c.portada ? 'Los temas del club, en el foro de siempre.' : c.descripcion,
      `${plural(c.temas, 'tema', 'temas')} · ${plural(c.mensajes, 'mensaje', 'mensajes')}`,
      u ? `Último tema: «${u.tema}», de ${u.autor}` : ''].filter(Boolean);
    return { siteName: SITIO, accentColor: ROSA, title: c.portada ? SITIO : c.nombre, description: lineas.join('\n') };
  }
  if (d.tipo === 'miembro') {
    const m = ((await lector(`/miembro?id=${d.id}`)) || {}).miembro;
    if (!m) return null;
    const desde = new Date(m.desde);
    return { siteName: SITIO, accentColor: ROSA, author: m.nombre, handle: 'en el foro', avatar: m.foto || undefined,
      description: `${plural(m.mensajes, 'mensaje', 'mensajes')} · en el foro desde ${MESES[desde.getUTCMonth()]} de ${desde.getUTCFullYear()}` };
  }
  return null;
}
// Lo que da el lector de un tema, un canal o un miembro, tal cual (vistas.js dibuja la imagen), guardado 10 minutos
const crudos = new Map();
async function datos(d) {
  if (!d || !on()) return null;
  const k = JSON.stringify(d), c = crudos.get(k);
  if (c && Date.now() - c.at < 10 * 60 * 1000) return c.data;
  const r = d.tipo === 'tema' ? await lector(`/tema?id=${d.id}`) : d.tipo === 'canal' ? await lector(`/canal?ruta=${encodeURIComponent(d.ruta)}`) : d.tipo === 'miembro' ? await lector(`/miembro?id=${d.id}`) : null;
  const data = r ? (r.tema || r.canal || r.miembro || null) : null;
  crudos.set(k, { at: Date.now(), data });
  if (crudos.size > 1000) crudos.delete(crudos.keys().next().value);
  return data;
}
const cache = new Map();
async function vistaPrevia(enlace) {
  const d = nodoDe(enlace);
  if (!d || !on()) return null;
  const k = JSON.stringify(d);
  const c = cache.get(k);
  if (c && Date.now() - c.at < 10 * 60 * 1000) return c.data;
  const data = await tarjeta(d);
  cache.set(k, { at: Date.now(), data });
  if (cache.size > 1000) cache.delete(cache.keys().next().value);
  return data;
}

// El foro que se actualiza solo (web/foro-vivo.js, en cada pagina del foro): pregunta cada tanto cual es
// el ultimo tema o respuesta y, si cambio, trae la parte de la pagina que cambio. Es un numero publico,
// sin sesion, guardado unos segundos para que muchas pestañas abiertas no lleguen a la base
let vivo = { at: 0, ultimo: null, pidiendo: null };
async function ultimoPublico() {
  if (Date.now() - vivo.at < 5000) return vivo.ultimo;
  if (!vivo.pidiendo) vivo.pidiendo = lector('/vivo').then(r => { vivo = { at: Date.now(), ultimo: r ? r.ultimo : null, pidiendo: null }; return vivo.ultimo; })
    .catch(err => { vivo.pidiendo = null; throw err; });
  return vivo.pidiendo;
}

async function handle(req, res, p, u) {
  if (p === '/puente/api/foro/vivo' && req.method === 'GET') {
    const { json } = h;
    if (foroUrl) { res.setHeader('Access-Control-Allow-Origin', new URL(foroUrl).origin); res.setHeader('Vary', 'Origin'); }
    res.setHeader('Cache-Control', 'no-store');
    if (!on()) return json(res, 503, { error: 'no' });
    try { return json(res, 200, { u: await ultimoPublico() }); } catch { return json(res, 503, { error: 'no' }); }
  }
  if (p !== '/puente/api/foro/buscar' || req.method !== 'GET') return false;
  const { json, sessionUser } = h;
  if (!sessionUser(req)) return json(res, 401, { error: 'sin sesion' });
  if (!on()) return json(res, 503, { error: 'La búsqueda en el foro no está disponible ahora.' });
  const q = String(u.searchParams.get('q') || '').trim().slice(0, 80);
  if (q.length < 2) return json(res, 200, { resultados: [] });
  try { return json(res, 200, await lector('/buscar?q=' + encodeURIComponent(q)) || { resultados: [] }); }
  catch (err) { warn('foro: buscar:', err.message); return json(res, 503, { error: 'El foro no contestó. Probá de nuevo.' }); }
}

module.exports = { setup, handle, vistaPrevia, nodoDe, on, datos };
