// "Invitá a alguien": cada cuenta tiene su enlace (/?invita=<usuario>). Quien
// entra por ahi y se crea la cuenta queda anotado como invitado de esa persona
// (tabla puente_invitaciones); cuenta recien cuando vincula su Discord, asi
// nadie suma con cuentas inventadas. Con eso salen la medalla 🤝 Reclutador
// (logros.js) y los reclutadores de la semana en el resumen.
//
//  GET  /puente/api/invitacion/quien?u=<usuario>  nombre y foto de quien invita (para el inicio)
//  GET  /puente/api/invitacion/mia                tu enlace y cuantos trajiste
//  POST /puente/api/invitacion/reclamar {u}       la cuenta nueva dice quien la invito

let db, log, warn, publicUrl;
const NEW_ACCOUNT_MS = 48 * 3600 * 1000; // solo cuentas nuevas pueden decir quien las invito

function setup(ctx) {
  ({ db, log, warn, publicUrl } = ctx);
  db.exec(`CREATE TABLE IF NOT EXISTS puente_invitaciones (
    invitado_id INTEGER PRIMARY KEY,
    invita_id INTEGER NOT NULL,
    at INTEGER NOT NULL
  )`);
}

const userByName = (u) => db.prepare("SELECT id, username, COALESCE(display_name, username) nombre, avatar FROM users WHERE username = ? COLLATE NOCASE AND username != 'discord-historial'").get(String(u || '').slice(0, 40));
const linkFor = (username) => `${String(publicUrl || '').replace(/\/+$/, '')}/?invita=${encodeURIComponent(username)}`;

// Cuantas personas trajo (las que ya vincularon su Discord) y cuantas faltan vincular
function count(havenUserId) {
  const r = db.prepare(`SELECT COUNT(*) total, SUM(CASE WHEN v.haven_user_id IS NOT NULL THEN 1 ELSE 0 END) ok
    FROM puente_invitaciones i LEFT JOIN puente_vinculos v ON v.haven_user_id = i.invitado_id WHERE i.invita_id = ?`).get(havenUserId);
  return { invitados: r.ok || 0, pendientes: (r.total || 0) - (r.ok || 0) };
}

// Los que trajeron gente en una semana (por cuando vinculo el invitado)
function weekTop(fromSql, toSql, n = 3) {
  return db.prepare(`SELECT i.invita_id id, COALESCE(u.display_name, u.username) nombre, COUNT(*) n
    FROM puente_invitaciones i JOIN puente_vinculos v ON v.haven_user_id = i.invitado_id JOIN users u ON u.id = i.invita_id
    WHERE v.linked_at >= ? AND v.linked_at < ? GROUP BY i.invita_id ORDER BY n DESC LIMIT ?`).all(fromSql, toSql, n);
}

async function handle(req, res, p, u, h) {
  if (p === '/puente/api/invitacion/quien' && req.method === 'GET') {
    const who = userByName(u.searchParams.get('u'));
    if (!who) return h.json(res, 404, { error: 'no existe' });
    return h.json(res, 200, { nombre: who.nombre, avatar: who.avatar || null });
  }
  if (p === '/puente/api/invitacion/mia' && req.method === 'GET') {
    const user = h.sessionUser(req);
    if (!user) return h.json(res, 401, { error: 'sin sesion' });
    return h.json(res, 200, { enlace: linkFor(user.username), ...count(user.id) });
  }
  if (p === '/puente/api/invitacion/reclamar' && req.method === 'POST') {
    const user = h.sessionUser(req);
    if (!user) return h.json(res, 401, { error: 'sin sesion' });
    let body = {};
    try { body = (await h.readJson(req)) || {}; } catch { /* vacio */ }
    const who = userByName(body.u);
    const me = db.prepare('SELECT created_at FROM users WHERE id = ?').get(user.id);
    const created = me ? Date.parse(String(me.created_at).replace(' ', 'T') + 'Z') : 0;
    if (!who || who.id === user.id) return h.json(res, 200, { ok: false, motivo: 'invitacion invalida' });
    if (!(Date.now() - created < NEW_ACCOUNT_MS)) return h.json(res, 200, { ok: false, motivo: 'la cuenta no es nueva' });
    if (db.prepare('SELECT 1 FROM puente_invitaciones WHERE invitado_id = ?').get(user.id)) return h.json(res, 200, { ok: false, motivo: 'ya estaba anotado' });
    db.prepare('INSERT INTO puente_invitaciones (invitado_id, invita_id, at) VALUES (?, ?, ?)').run(user.id, who.id, Date.now());
    log(`invitaciones: ${user.username} entro invitado por ${who.username}`);
    return h.json(res, 200, { ok: true, nombre: who.nombre });
  }
  return false;
}

module.exports = { setup, handle, count, weekTop };
