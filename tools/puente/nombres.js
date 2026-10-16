// Nombre de las cuentas vinculadas: en CV Chat cada persona tiene un solo
// nombre, el que muestra Discord (su "nombre para mostrar"), salvo que se haya
// puesto uno propio en CV Chat. Lo usan el puente (al vincular y cuando cambia
// el nombre en Discord) y tools/nombres-vinculados.js (una vez, para las cuentas
// que ya estaban vinculadas).
//
// - Solo se toca users.display_name, y solo si esta vacio o tiene el nombre que
//   puso el puente la vez anterior (puente_vinculos.nombre_puesto). Si la
//   persona (o un moderador) le puso otro, se respeta siempre.
// - Las reglas de Haven: 2 a 20 caracteres, letras, numeros, espacios y "_", y
//   sin repetir el nombre de otra persona. Un nombre de Discord con emojis o
//   puntos se adapta (se sacan esos caracteres); si aun asi no sirve o ya lo usa
//   otra persona, queda su nombre de usuario.
// - Los mensajes de una cuenta vinculada no guardan el nombre de Discord
//   (webhook_username): asi Haven muestra siempre el de la cuenta, el actual.
//   Al desvincular se les vuelve a poner el de Discord.

let normalizeDisplayName = null;
try { normalizeDisplayName = require('/app/src/socketHandlers/helpers.js').normalizeDisplayName; } catch { /* fuera de Haven: la regla de abajo */ }

function cleanName(raw) {
  let v = String(raw || '').normalize('NFC').replace(/[^\p{L}\p{N}\p{M}_ ]+/gu, ' ').trim().replace(/\s+/g, ' ');
  v = [...v].slice(0, 20).join('').trim();
  if (normalizeDisplayName) { const c = normalizeDisplayName(v); return c.error ? null : c.value; }
  return [...v].length >= 2 && /^[\p{L}\p{N}\p{M}_ ]+$/u.test(v) ? v : null;
}

function ensureColumn(db) {
  const cols = db.prepare("SELECT name FROM pragma_table_info('puente_vinculos')").all().map(c => c.name);
  if (cols.length && !cols.includes('nombre_puesto')) db.exec('ALTER TABLE puente_vinculos ADD COLUMN nombre_puesto TEXT');
}

// Que nombre le tocaria (sin cambiar nada): { name } o { skip: motivo }
function plan(db, havenUserId, discordName) {
  const u = db.prepare('SELECT id, username, display_name, display_name_locked FROM users WHERE id = ?').get(havenUserId);
  const l = db.prepare('SELECT nombre_puesto FROM puente_vinculos WHERE haven_user_id = ?').get(havenUserId);
  if (!u || !l) return { skip: 'sin vinculo' };
  if (u.display_name != null && u.display_name !== l.nombre_puesto) return { skip: 'nombre propio' };
  if (u.display_name_locked && u.display_name !== l.nombre_puesto) return { skip: 'puesto por un moderador' };
  const name = cleanName(discordName);
  if (!name) return { skip: 'el de Discord no cumple las reglas' };
  if (name === (u.display_name || u.username)) return { skip: 'ya se llama asi' };
  const taken = db.prepare(`SELECT username FROM users WHERE id != ? AND (LOWER(display_name) = LOWER(?) OR (display_name IS NULL AND LOWER(username) = LOWER(?))) LIMIT 1`)
    .get(u.id, name, name);
  if (taken) return { skip: `ya lo usa ${taken.username}` };
  return { name };
}

// Pone el nombre de Discord si corresponde. Devuelve el nombre nuevo, o null.
function applyName(db, havenUserId, discordName) {
  const p = plan(db, havenUserId, discordName);
  if (!p.name) return null;
  db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(p.name, havenUserId);
  db.prepare('UPDATE puente_vinculos SET nombre_puesto = ? WHERE haven_user_id = ?').run(p.name, havenUserId);
  return p.name;
}

// Al desvincular: si el nombre era el que puso el puente, vuelve a su usuario
function releaseName(db, havenUserId) {
  const l = db.prepare('SELECT nombre_puesto FROM puente_vinculos WHERE haven_user_id = ?').get(havenUserId);
  if (l && l.nombre_puesto) db.prepare('UPDATE users SET display_name = NULL WHERE id = ? AND display_name = ?').run(havenUserId, l.nombre_puesto);
}

module.exports = { cleanName, ensureColumn, plan, applyName, releaseName };
