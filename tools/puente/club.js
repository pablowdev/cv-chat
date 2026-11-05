// "Ahora en el club" (la tarjeta de arriba de la lista de canales, web/aviso.js) y "El club hoy" (lo
// que se abre al tocarla). Reemplazan a los canales contador de "SERVER STATS", que solo mostraban un
// numero en el nombre:
//  - Cuantos hay conectados y sus fotos (sin invitados ni los que eligieron aparecer invisibles)
//  - Los mensajes de hoy, cuantos hay en CV Chat y cuantos en Discord (el numero del canal contador de
//    Discord, que un bot de alla le pone en el nombre; cuando Discord quede de solo lectura, queda el
//    ultimo)
//  - Las mesas de juegos esperando rival (portada.js) y los que se sumaron hoy
//
//  GET /puente/api/club   (sesion; lo comun se arma como mucho cada 30 segundos)

const ESTADOS_OCULTOS = new Set(['invisible', 'offline']);
let hecho = { at: 0, datos: null };

// Hoy en Argentina, como texto de la base ("2026-11-04 03:00:00" en UTC)
function desdeHoy() {
  const ar = new Date(Date.now() - 3 * 3600e3);
  return new Date(Date.UTC(ar.getUTCFullYear(), ar.getUTCMonth(), ar.getUTCDate()) + 3 * 3600e3).toISOString().replace('T', ' ').slice(0, 19);
}

// Los de Discord: el numero al final del nombre del canal contador que viene de Discord
function enDiscord(db) {
  try {
    const pre = String(process.env.PUENTE_CONTADOR_DISCORD || '').trim().toLowerCase();
    const filas = db.prepare("SELECT name FROM channels WHERE discord_channel_id IS NOT NULL AND COALESCE(is_dm, 0) = 0 AND category LIKE '%STATS%'").all();
    for (const r of filas) {
      const n = String(r.name || '');
      if (pre && !n.toLowerCase().startsWith(pre)) continue;
      const m = /(\d[\d.,]*)\s*$/.exec(n);
      if (m) { const v = parseInt(m[1].replace(/[.,]/g, ''), 10); if (v > 0) return v; }
    }
  } catch { /* sin contador */ }
  return null;
}

function cuentas(db) {
  return db.prepare("SELECT COUNT(*) n FROM users WHERE username != 'discord-historial' AND COALESCE(is_guest, 0) = 0").get().n;
}

function armar(db, io, warn) {
  const d = { conectados: 0, fotos: [], mensajesHoy: 0, cuentas: 0, discord: null, abiertas: [], nuevos: [] };
  const desde = desdeHoy();
  try {
    const ids = new Set();
    for (const s of io.of('/').sockets.values()) if (s.user && s.user.id && !s.user.isGuest) ids.add(s.user.id);
    const q = db.prepare('SELECT id, COALESCE(display_name, username) n, avatar, status, is_guest FROM users WHERE id = ?');
    const vis = [];
    for (const id of ids) {
      const u = q.get(id);
      if (!u || u.is_guest || ESTADOS_OCULTOS.has(String(u.status || '').toLowerCase())) continue;
      vis.push(u);
    }
    d.conectados = vis.length;
    // Primero los que tienen foto; van todos (El club hoy los muestra a todos, la tarjeta solo algunos)
    vis.sort((a, b) => (b.avatar ? 1 : 0) - (a.avatar ? 1 : 0));
    d.fotos = vis.slice(0, 60).map(u => ({ nombre: u.n, foto: u.avatar || null }));
  } catch (err) { warn('club: conectados:', err.message); }
  try {
    d.mensajesHoy = db.prepare(`SELECT COUNT(*) n FROM messages m JOIN channels c ON c.id = m.channel_id
      WHERE m.created_at >= ? AND COALESCE(c.is_dm, 0) = 0 AND COALESCE(c.is_group, 0) = 0`).get(desde).n;
  } catch (err) { warn('club: mensajes:', err.message); }
  try { d.cuentas = cuentas(db); } catch (err) { warn('club: cuentas:', err.message); }
  d.discord = enDiscord(db);
  try { d.abiertas = require('./portada.js').mesas(db).abiertas; } catch (err) { warn('club: mesas:', err.message); }
  try {
    d.nuevos = db.prepare(`SELECT COALESCE(display_name, username) n, avatar FROM users
      WHERE created_at >= ? AND username != 'discord-historial' AND COALESCE(is_guest, 0) = 0 ORDER BY id DESC LIMIT 12`).all(desde)
      .map(u => ({ nombre: u.n, foto: u.avatar || null }));
  } catch (err) { warn('club: nuevos:', err.message); }
  return d;
}

async function handle(req, res, p, u, { sessionUser, json, db, io, warn }) {
  if (p !== '/puente/api/club') return false;
  if (req.method !== 'GET') return json(res, 405, { error: 'solo GET' });
  const user = sessionUser(req);
  if (!user) return json(res, 401, { error: 'sin sesion' });
  if (!hecho.datos || Date.now() - hecho.at > 30e3) {
    try { hecho = { at: Date.now(), datos: armar(db, io, warn) }; } catch (err) { warn('club:', err.message); if (!hecho.datos) return json(res, 503, { error: 'no' }); }
  }
  res.setHeader('Cache-Control', 'no-store');
  return json(res, 200, hecho.datos);
}

module.exports = { handle, enDiscord, cuentas };
