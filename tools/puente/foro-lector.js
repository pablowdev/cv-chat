// El foro adentro de CV Chat, con el lector del foro (deploy/foro/lector: solo lee, y solo lo publico).
//
//  - Canal del foro, apagado (el foro se abre adentro de CV Chat con su boton, aviso.js). Con FORO_CANAL (el
//    nombre de un canal de texto que crea un administrador): cada tema nuevo del foro es un mensaje, y sus
//    respuestas van en su hilo, con el webhook del canal, con el nombre y la foto de quien lo escribio en el
//    foro. Empieza desde lo que haya cuando se prende: no trae lo viejo.
//  - Vista previa de los enlaces al foro (vincular.js la pide al pegar un enlace).
//  - GET /puente/api/foro/buscar?q=  temas del foro (el "/foro <texto>" del chat, web/aviso.js)
//
// FORO_LECTOR_URL (http://foro-lector:8080) y FORO_LECTOR_CLAVE (la LECTOR_CLAVE de /opt/foro/lector.env).

const crypto = require('crypto');

const CADA_MS = 60 * 1000, POR_VUELTA = 20;
let db, log, warn, h, url = '', clave = '', canal = '', foroUrl = '';
let andando = false;

function setup(ctx) {
  ({ db, log, warn, helpers: h } = ctx);
  url = String(process.env.FORO_LECTOR_URL || '').replace(/\/+$/, '');
  clave = String(process.env.FORO_LECTOR_CLAVE || '');
  canal = String(process.env.FORO_CANAL || '').trim().toLowerCase();
  foroUrl = String(process.env.FORO_URL || '').replace(/\/+$/, '');
  if (!url || clave.length < 32) return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS puente_foro_estado (clave TEXT PRIMARY KEY, valor TEXT);
    CREATE TABLE IF NOT EXISTS puente_foro_temas (tema_id INTEGER PRIMARY KEY, message_id INTEGER NOT NULL, channel_id INTEGER NOT NULL);
  `);
  if (!canal) { log('foro: lector listo (vistas previas y busqueda; sin canal del foro)'); return; }
  log(`foro: lector listo; el canal #${canal} recibe los temas nuevos`);
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
    let desde = estado('desde');
    if (desde == null) { const u = await lector('/ultimo'); estado('desde', u.ultimo); log(`foro: #${canal} empieza desde el tema ${u.ultimo}`); return; }
    const d = await lector(`/novedades?desde=${Number(desde)}&limite=${POR_VUELTA}`);
    for (const n of d.novedades) {
      const map = db.prepare('SELECT message_id FROM puente_foro_temas WHERE tema_id = ? AND channel_id = ?').get(n.tema_id, w.id);
      let id;
      if (n.es_tema) {
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
      estado('desde', n.id);
    }
    estado('desde', Math.max(Number(estado('desde')), d.hasta));
  } catch (err) {
    warn('foro: canal #' + canal + ':', err.message);
  } finally { andando = false; }
}

// ── Vista previa de un enlace al foro (/node/123 o /forum/.../123-titulo) ──
function nodoDe(enlace) {
  try {
    const u = new URL(enlace);
    if (!foroUrl || u.origin !== new URL(foroUrl).origin) return null;
    const m = u.pathname.match(/^\/node\/(\d+)/) || u.pathname.match(/\/(\d+)-[^/]*\/?$/);
    return m ? Number(m[1]) : null;
  } catch { return null; }
}
const cache = new Map();
async function vistaPrevia(enlace) {
  const id = nodoDe(enlace);
  if (!id || !on()) return null;
  const c = cache.get(id);
  if (c && Date.now() - c.at < 10 * 60 * 1000) return c.data;
  const r = await lector(`/tema?id=${id}`);
  const t = r && r.tema;
  const data = t ? {
    siteName: 'Foro de Círculo Vicioso', accentColor: '#ee2d6f', title: t.tema,
    description: `${t.es_tema ? '' : 'Respuesta de '}${t.autor} en ${t.canal}${t.texto ? ': ' + t.texto : ''}`.slice(0, 300),
    author: t.autor, avatar: t.foto, image: null,
  } : null;
  cache.set(id, { at: Date.now(), data });
  if (cache.size > 1000) cache.delete(cache.keys().next().value);
  return data;
}

async function handle(req, res, p, u) {
  if (p !== '/puente/api/foro/buscar' || req.method !== 'GET') return false;
  const { json, sessionUser } = h;
  if (!sessionUser(req)) return json(res, 401, { error: 'sin sesion' });
  if (!on()) return json(res, 503, { error: 'La búsqueda en el foro no está disponible ahora.' });
  const q = String(u.searchParams.get('q') || '').trim().slice(0, 80);
  if (q.length < 2) return json(res, 200, { resultados: [] });
  try { return json(res, 200, await lector('/buscar?q=' + encodeURIComponent(q)) || { resultados: [] }); }
  catch (err) { warn('foro: buscar:', err.message); return json(res, 503, { error: 'El foro no contestó. Probá de nuevo.' }); }
}

module.exports = { setup, handle, vistaPrevia, nodoDe, on };
