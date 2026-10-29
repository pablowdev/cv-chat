// CV Chat y el foro, con el servicio del foro (deploy/foro/servicio: el codigo del propio vBulletin).
// Para las cuentas unidas (puente_foro):
//  - Mismo avatar y mismo nombre: gana el ultimo que se cambio, de cualquiera de los dos lados. Cada
//    vuelta se compara con lo que se vio la vez anterior (puente_foro_sync); al unirse, solo se anota.
//    Un nombre que viene del foro pasa por las mismas reglas que en CV Chat (identidad.js: no el de otro).
//  - Las notificaciones del foro (te respondieron, te citaron, te mencionaron...) llegan a CV Chat: un
//    cartelito en la app abierta, o la notificacion del telefono (avisos.js).
//  - Los mensajes privados del foro se leen en CV Chat (los nuevos ya van por los mensajes directos, cifrados):
//    GET /puente/api/foro/privados?con=<cuenta>  los del foro con esa persona (en su conversacion de CV Chat)
//    GET /puente/api/foro/privados               todas las conversaciones del foro (tambien con quien no tiene cuenta)
// FORO_SERVICIO_URL (http://foro-servicio:8080) y FORO_SERVICIO_CLAVE (la SERVICIO_CLAVE de /opt/foro/servicio.env).

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CADA_MS = 90 * 1000;
const UPLOADS = path.dirname(process.env.PUENTE_ADJUNTOS_DIR || '/data/uploads/discord');
let db, log, warn, h, url = '', clave = '', andando = false;

function setup(ctx) {
  ({ db, log, warn, helpers: h } = ctx);
  url = String(process.env.FORO_SERVICIO_URL || '').replace(/\/+$/, '');
  clave = String(process.env.FORO_SERVICIO_CLAVE || '');
  if (!on()) return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS puente_foro_sync (
      haven_user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      cv_avatar TEXT, cv_nombre TEXT, foro_foto INTEGER, foro_nombre TEXT
    );
    CREATE TABLE IF NOT EXISTS puente_foro_estado (clave TEXT PRIMARY KEY, valor TEXT);
  `);
  log('foro: servicio listo (avatar y nombre, avisos)');
  setTimeout(vuelta, 20000);
  setInterval(vuelta, CADA_MS);
}
const on = () => !!(url && clave.length >= 32);

async function servicio(p, body) {
  const r = await fetch(url + p, {
    method: body ? 'POST' : 'GET', headers: { 'X-Servicio-Clave': clave, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`servicio ${p.split('?')[0]} ${r.status} ${d.error || ''}`);
  return d;
}
const estado = (k, v) => {
  if (v === undefined) { const r = db.prepare('SELECT valor FROM puente_foro_estado WHERE clave = ?').get(k); return r ? r.valor : null; }
  db.prepare('INSERT INTO puente_foro_estado (clave, valor) VALUES (?, ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor').run(k, String(v));
};

async function vuelta() {
  if (andando || !on()) return;
  andando = true;
  try { await sincronizar(); } catch (err) { warn('foro: avatar y nombre:', err.message); }
  try { await avisos(); } catch (err) { warn('foro: avisos:', err.message); }
  andando = false;
}

// ── Avatar y nombre ──
const nombreCv = u => u.display_name || u.username;
async function bajarFoto(f, foroId) {
  const r = await fetch(f, { signal: AbortSignal.timeout(20000), redirect: 'error' });
  const tipo = String(r.headers.get('content-type') || '').split(';')[0];
  const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' }[tipo];
  if (!r.ok || !ext) throw new Error('foto del foro ' + r.status);
  const buf = Buffer.from(await r.arrayBuffer());
  if (!buf.length || buf.length > 5 * 1024 * 1024) throw new Error('foto del foro muy grande');
  const dir = path.join(UPLOADS, 'foro'); fs.mkdirSync(dir, { recursive: true });
  const file = `avatar-${foroId}-${crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16)}.${ext}`;
  fs.writeFileSync(path.join(dir, file), buf);
  return `/uploads/foro/${file}`;
}
function avisarCambio(userId) {
  // Las demas personas ven la foto y el nombre nuevos al recargar; la propia app, enseguida
  try { h.io.emit('user-profile-updated', { userId }); } catch { /* */ }
}
async function sincronizar() {
  const unidas = db.prepare('SELECT f.haven_user_id, f.foro_user_id, u.username, u.display_name, u.avatar FROM puente_foro f JOIN users u ON u.id = f.haven_user_id').all();
  if (!unidas.length) return;
  const foro = new Map();
  for (let i = 0; i < unidas.length; i += 50) {
    const d = await servicio('/usuarios?ids=' + unidas.slice(i, i + 50).map(x => x.foro_user_id).join(','));
    for (const x of d.usuarios) foro.set(x.id, x);
  }
  const visto = db.prepare('SELECT * FROM puente_foro_sync WHERE haven_user_id = ?');
  const guardar = db.prepare(`INSERT INTO puente_foro_sync (haven_user_id, cv_avatar, cv_nombre, foro_foto, foro_nombre) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(haven_user_id) DO UPDATE SET cv_avatar = excluded.cv_avatar, cv_nombre = excluded.cv_nombre, foro_foto = excluded.foro_foto, foro_nombre = excluded.foro_nombre`);
  for (const u of unidas) {
    const f = foro.get(u.foro_user_id);
    if (!f) continue;
    const v = visto.get(u.haven_user_id);
    let cvAvatar = u.avatar || null, cvNombre = nombreCv(u), foroFoto = f.foto_fecha || 0, foroNombre = f.nombre;
    if (v) {
      try {
        // Avatar: el lado que cambio desde la ultima vez (si cambiaron los dos, gana CV Chat)
        if ((v.cv_avatar || null) !== cvAvatar && cvAvatar) {
          const file = path.join(UPLOADS, cvAvatar.replace(/^\/uploads\//, ''));
          if (cvAvatar.startsWith('/uploads/') && !file.includes('..') && fs.existsSync(file)) {
            const r = await servicio('/avatar', { id: u.foro_user_id, imagen: fs.readFileSync(file).toString('base64') });
            foroFoto = r.foto_fecha || foroFoto;
            log(`foro: avatar de ${u.username} pasado al foro`);
          }
        } else if ((v.foro_foto || 0) !== foroFoto && f.foto) {
          cvAvatar = await bajarFoto(f.foto, u.foro_user_id);
          db.prepare('UPDATE users SET avatar = ? WHERE id = ?').run(cvAvatar, u.haven_user_id);
          avisarCambio(u.haven_user_id);
          log(`foro: avatar de ${u.username} traido del foro`);
        }
        // Nombre visible
        if ((v.cv_nombre || null) !== cvNombre) {
          await servicio('/nombre', { id: u.foro_user_id, nombre: cvNombre });
          foroNombre = cvNombre;
          log(`foro: nombre de ${u.username} pasado al foro`);
        } else if ((v.foro_nombre || null) !== foroNombre && foroNombre && foroNombre !== cvNombre) {
          const n = String(foroNombre).trim().slice(0, 32);
          const problema = require('./identidad.js').problem(u.haven_user_id, n, null);
          if (!problema && n.length >= 2) {
            db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(n, u.haven_user_id);
            cvNombre = n;
            avisarCambio(u.haven_user_id);
            log(`foro: nombre de ${u.username} traido del foro`);
          }
        }
      } catch (err) { warn(`foro: sincronizar a ${u.username}:`, err.message); continue; }
    }
    guardar.run(u.haven_user_id, cvAvatar, cvNombre, foroFoto, foroNombre);
  }
}

// ── Las notificaciones del foro ──
async function avisos() {
  const unidas = db.prepare('SELECT haven_user_id, foro_user_id FROM puente_foro').all();
  const porForo = new Map(unidas.map(x => [x.foro_user_id, x.haven_user_id]));
  const desde = estado('avisos_desde');
  if (desde == null) {
    // La primera vez: desde ahora (no las viejas)
    const d = await servicio('/avisos?desde=0&ids=');
    estado('avisos_desde', d.hasta || 0);
    return;
  }
  if (!porForo.size) return;
  const d = await servicio(`/avisos?desde=${Number(desde)}&ids=${[...porForo.keys()].join(',')}`);
  for (const a of d.avisos) {
    const uid = porForo.get(a.para);
    if (!uid) continue;
    h.avisarUsuario(uid, {
      title: `${a.de} ${a.que}${a.tema ? ': ' + a.tema : ''}`.slice(0, 120),
      body: a.texto || 'En el foro', url: a.url, tag: 'puente-foro-' + a.id,
    });
    // Y en la campanita de la barra de la web (campana.js)
    if (h.campana) h.campana.registrar(uid, { origen: 'foro', titulo: `${a.de} ${a.que}${a.tema ? ' en "' + a.tema + '"' : ''}`, texto: a.texto, url: a.url, clave: 'foro-' + a.id });
  }
  if (d.hasta > Number(desde)) estado('avisos_desde', d.hasta);
}

// ── Los privados del foro ──
const cachePm = new Map(); // foro id -> { at, d }
async function privadosDe(foroId) {
  const c = cachePm.get(foroId);
  if (c && Date.now() - c.at < 5 * 60 * 1000) return c.d;
  const d = await servicio('/privados?id=' + foroId);
  cachePm.set(foroId, { at: Date.now(), d });
  if (cachePm.size > 300) cachePm.delete(cachePm.keys().next().value);
  return d;
}
// El texto del foro sin BBCode (las citas quedan como "> ")
function plano(raw) {
  let s = String(raw || '');
  s = s.replace(/\[quote[^\]]*\]([\s\S]*?)\[\/quote\]/gi, (m, t) => t.trim().split('\n').map(l => '> ' + l).join('\n') + '\n');
  s = s.replace(/\[img[^\]]*\]\s*(https?:\/\/[^\[\s]+)\s*\[\/img\]/gi, '$1');
  s = s.replace(/\[url=([^\]]*)\]([\s\S]*?)\[\/url\]/gi, (m, u, t) => (t.trim() && t.trim() !== u ? `${t} (${u})` : u));
  s = s.replace(/\[\/?[a-z*]+(?:=[^\]]*)?\]/gi, '');
  return s.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#0?39;/g, "'").replace(/\n{3,}/g, '\n\n').trim();
}
async function handle(req, res, p, u) {
  if (p !== '/puente/api/foro/privados' || req.method !== 'GET') return false;
  const { json, sessionUser } = h;
  const yo = sessionUser(req);
  if (!yo) return json(res, 401, { error: 'sin sesion' });
  const mio = (db.prepare('SELECT foro_user_id FROM puente_foro WHERE haven_user_id = ?').get(yo.id) || {}).foro_user_id;
  if (!on() || !mio) return json(res, 200, { unida: !!mio, mensajes: [], conversaciones: [] });
  let d;
  try { d = await privadosDe(mio); } catch (err) { warn('foro: privados:', err.message); return json(res, 503, { error: 'El foro no contestó. Probá de nuevo.' }); }
  const nombre = id => d.nombres[id] || 'Alguien';
  const armar = m => ({ mio: m.de === mio, de: nombre(m.de), texto: plano(m.texto), titulo: m.titulo || null, fecha: m.fecha });
  const con = Number(u.searchParams.get('con')) || 0;
  if (con) {
    // Con esa persona: solo lo que se hablaron de a dos
    const suyo = (db.prepare('SELECT foro_user_id FROM puente_foro WHERE haven_user_id = ?').get(con) || {}).foro_user_id;
    if (!suyo) return json(res, 200, { unida: true, mensajes: [] });
    const dos = d.mensajes.filter(m => { const g = new Set([m.de, ...m.para]); return g.size === 2 && g.has(mio) && g.has(suyo); });
    return json(res, 200, { unida: true, con: nombre(suyo), mensajes: dos.map(armar) });
  }
  // Todas las conversaciones, por con quienes
  const grupos = new Map();
  for (const m of d.mensajes) {
    const otros = [...new Set([m.de, ...m.para])].filter(x => x !== mio).sort((a, b) => a - b);
    const k = otros.join(',');
    if (!grupos.has(k)) grupos.set(k, { con: otros.map(nombre), cuentas: otros.map(x => (db.prepare('SELECT haven_user_id FROM puente_foro WHERE foro_user_id = ?').get(x) || {}).haven_user_id || null), mensajes: [] });
    grupos.get(k).mensajes.push(armar(m));
  }
  const conversaciones = [...grupos.values()].sort((a, b) => b.mensajes[b.mensajes.length - 1].fecha - a.mensajes[a.mensajes.length - 1].fecha);
  return json(res, 200, { unida: true, conversaciones });
}

module.exports = { setup, on, servicio, handle };
