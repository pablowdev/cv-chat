// El equipo de CV Chat (y con el, la web, que usa los mismos permisos) tiene que tener la verificacion en dos
// pasos: quien es administrador o tiene un rol de moderacion (Mod, Mod del canal, Admin) y no la tiene prendida,
// queda como miembro comun hasta que la prende. Lo que tenia (administrador y esos roles) se guarda en
// puente_equipo y se le devuelve solo al prenderla. Se le cierra la conexion, para que el cambio valga enseguida.
// El del foro lo hace el servicio del foro (foro-servicio.js, /equipo).

const CADA_MS = 60 * 1000;
const NIVEL_EQUIPO = 25; // "Mod del canal" para arriba

let db, io, log, warn;

function setup(ctx) {
  ({ db, io, log, warn } = ctx);
  db.exec(`
    CREATE TABLE IF NOT EXISTS puente_equipo (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      is_admin INTEGER NOT NULL DEFAULT 0,
      roles TEXT NOT NULL DEFAULT '[]',
      desde TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);
  setTimeout(vuelta, 30000);
  setInterval(vuelta, CADA_MS);
}

function reconectar(userId) {
  try { for (const [, s] of io.sockets.sockets) if (s.user && s.user.id === userId) s.disconnect(true); } catch { /* sin conexiones */ }
}

function vuelta() {
  try {
    const rolesEquipo = id => db.prepare(`SELECT ur.role_id, ur.channel_id, ur.granted_by, ur.custom_level FROM user_roles ur JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = ? AND COALESCE(ur.custom_level, r.level) >= ?`).all(id, NIVEL_EQUIPO);
    const sinVerificacion = db.prepare(`SELECT DISTINCT u.id, u.username, u.is_admin FROM users u
      LEFT JOIN user_roles ur ON ur.user_id = u.id LEFT JOIN roles r ON r.id = ur.role_id
      WHERE COALESCE(u.totp_enabled, 0) = 0 AND (u.is_admin = 1 OR COALESCE(ur.custom_level, r.level) >= ?)`).all(NIVEL_EQUIPO);
    for (const u of sinVerificacion) {
      const roles = rolesEquipo(u.id);
      db.transaction(() => {
        // Si ya estaba guardado (alguien le devolvio los permisos a mano), se suman los nuevos a lo guardado
        const ya = db.prepare('SELECT is_admin, roles FROM puente_equipo WHERE user_id = ?').get(u.id);
        const guardados = ya ? JSON.parse(ya.roles) : [];
        for (const r of roles) if (!guardados.some(g => g.role_id === r.role_id && g.channel_id === r.channel_id)) guardados.push(r);
        db.prepare('INSERT INTO puente_equipo (user_id, is_admin, roles) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET is_admin = MAX(is_admin, excluded.is_admin), roles = excluded.roles')
          .run(u.id, u.is_admin ? 1 : 0, JSON.stringify(guardados));
        db.prepare('UPDATE users SET is_admin = 0 WHERE id = ?').run(u.id);
        for (const r of roles) db.prepare('DELETE FROM user_roles WHERE user_id = ? AND role_id = ? AND channel_id IS ?').run(u.id, r.role_id, r.channel_id);
      })();
      reconectar(u.id);
      log(`equipo: ${u.username} (#${u.id}) sin verificacion en dos pasos: queda como miembro comun hasta que la prenda`);
    }
    // Los que la prendieron: lo que tenian, de vuelta
    for (const g of db.prepare('SELECT e.user_id, e.is_admin, e.roles, u.username FROM puente_equipo e JOIN users u ON u.id = e.user_id WHERE u.totp_enabled = 1').all()) {
      db.transaction(() => {
        if (g.is_admin) db.prepare('UPDATE users SET is_admin = 1 WHERE id = ?').run(g.user_id);
        for (const r of JSON.parse(g.roles)) {
          if (!db.prepare('SELECT 1 FROM roles WHERE id = ?').get(r.role_id)) continue;
          db.prepare('INSERT OR IGNORE INTO user_roles (user_id, role_id, channel_id, granted_by, custom_level) VALUES (?, ?, ?, ?, ?)').run(g.user_id, r.role_id, r.channel_id, r.granted_by, r.custom_level);
        }
        db.prepare('DELETE FROM puente_equipo WHERE user_id = ?').run(g.user_id);
      })();
      reconectar(g.user_id);
      log(`equipo: ${g.username} (#${g.user_id}) prendio la verificacion en dos pasos: vuelve a tener sus permisos`);
    }
  } catch (err) { warn('equipo:', err.message); }
}

module.exports = { setup, _test: { vuelta } };
