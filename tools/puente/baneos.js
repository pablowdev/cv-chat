// Baneos sincronizados entre Discord y Haven (cuentas vinculadas).
//
//  - Baneo en Discord -> la cuenta vinculada queda baneada en Haven (sin borrar
//    sus mensajes: eso lo decide cada lado). Desbaneo en Discord -> desbaneo.
//  - Baneo de un admin o moderador en Haven -> baneo en Discord, con el motivo
//    en el registro de auditoria. Desbaneo en Haven -> desbaneo en Discord.
//  - Las expulsiones no se copian: en Haven son de un canal, y la de Discord
//    (del servidor) ya le saca los canales de Discord en Haven (accesos.js).
//  - Los admins de Haven no se banean desde Discord, por seguridad.
//  - Si se borra la cuenta de Haven, el baneo de Discord queda como estaba.
//
// La tabla puente_baneos guarda los baneos que ya estan en los dos lados. Asi
// el baneo que pone el puente no vuelve como si fuera uno nuevo, y los cambios
// hechos con el puente apagado se ponen al dia al encender. Haven banea desde
// su propio codigo (socketHandlers/moderation.js): los baneos de Haven se ven
// mirando su tabla bans cada pocos segundos.

let db, io, api, log, warn, getGuildId;
const CHECK_MS = 5000;
const RECONCILE_MS = 10 * 60 * 1000;
let discordBanned = new Set(); // ids de Discord baneados (de la ultima lista completa)
let busy = false;

function setup(ctx) {
  ({ db, io, api, log, warn, getGuildId } = ctx);
  db.exec(`CREATE TABLE IF NOT EXISTS puente_baneos (
    haven_user_id INTEGER PRIMARY KEY,
    discord_user_id TEXT NOT NULL,
    origen TEXT NOT NULL,
    en_discord INTEGER NOT NULL DEFAULT 1,
    at INTEGER NOT NULL
  )`);
  setInterval(() => { checkHaven().catch(err => warn('baneos:', err.message)); }, CHECK_MS);
  setInterval(() => { reconcile().catch(err => warn('baneos:', err.message)); }, RECONCILE_MS);
}

const linkOfDiscord = id => db.prepare('SELECT haven_user_id FROM puente_vinculos WHERE discord_user_id = ?').get(String(id));
const record = (havenId, discordId, origen, enDiscord = 1) =>
  db.prepare('INSERT OR REPLACE INTO puente_baneos (haven_user_id, discord_user_id, origen, en_discord, at) VALUES (?, ?, ?, ?, ?)')
    .run(havenId, String(discordId), origen, enDiscord ? 1 : 0, Date.now());
const userName = id => { const u = db.prepare('SELECT COALESCE(display_name, username) n FROM users WHERE id = ?').get(id); return u ? u.n : '#' + id; };

// Que la persona baneada en Haven salga en el momento (como hace Haven al banear)
function kickOut(havenId, reason) {
  if (!io) return;
  for (const [, s] of io.sockets.sockets) {
    if (s.user && s.user.id === havenId) { s.emit('banned', { reason }); s.disconnect(true); }
  }
}

// ── Discord -> Haven ─────────────────────────────────────────────────────
async function onDiscordBan(d) {
  if (!d || !d.user) return;
  discordBanned.add(String(d.user.id));
  const l = linkOfDiscord(d.user.id);
  if (!l) return;
  const known = db.prepare('SELECT 1 FROM puente_baneos WHERE haven_user_id = ?').get(l.haven_user_id);
  const inHaven = db.prepare('SELECT 1 FROM bans WHERE user_id = ?').get(l.haven_user_id);
  if (known || inHaven) { if (!known) record(l.haven_user_id, d.user.id, 'haven'); return; } // el que puso el puente, o ya estaba
  let reason = '';
  const ban = await api('GET', `/guilds/${getGuildId()}/bans/${d.user.id}`);
  if (ban && !ban.__error && ban.reason) reason = String(ban.reason);
  banInHaven(l.haven_user_id, d.user.id, reason);
}

function banInHaven(havenId, discordId, discordReason) {
  const u = db.prepare('SELECT id, is_admin FROM users WHERE id = ?').get(havenId);
  if (!u) return;
  if (u.is_admin) { warn(`baneos: ${userName(havenId)} es admin de Haven: no se banea en Haven por un baneo de Discord`); return; }
  const admin = db.prepare('SELECT id FROM users WHERE is_admin = 1 ORDER BY id LIMIT 1').get();
  if (!admin) return;
  const reason = ('Baneo en Discord' + (discordReason ? ': ' + discordReason : '')).slice(0, 200);
  db.transaction(() => {
    db.prepare('INSERT OR IGNORE INTO bans (user_id, banned_by, reason) VALUES (?, ?, ?)').run(havenId, admin.id, reason);
    record(havenId, discordId, 'discord');
  })();
  kickOut(havenId, reason);
  log(`baneos: ${userName(havenId)} baneado en Haven (baneo de Discord)`);
}

function onDiscordUnban(d) {
  if (!d || !d.user) return;
  discordBanned.delete(String(d.user.id));
  const row = db.prepare('SELECT haven_user_id FROM puente_baneos WHERE discord_user_id = ?').get(String(d.user.id));
  if (!row) return; // no lo baneo el puente ni lo sabe: Haven no se toca
  db.transaction(() => {
    db.prepare('DELETE FROM puente_baneos WHERE haven_user_id = ?').run(row.haven_user_id);
    db.prepare('DELETE FROM bans WHERE user_id = ?').run(row.haven_user_id);
    try { db.prepare('DELETE FROM ban_appeals WHERE user_id = ?').run(row.haven_user_id); } catch { /* sin tabla */ }
  })();
  log(`baneos: ${userName(row.haven_user_id)} desbaneado en Haven (desbaneo de Discord)`);
}

// ── Haven -> Discord ─────────────────────────────────────────────────────
async function banInDiscord(havenId, discordId, bannedBy, reason) {
  const g = getGuildId();
  if (!g) return false;
  const by = userName(bannedBy);
  const r = await api('PUT', `/guilds/${g}/bans/${discordId}`,
    { delete_message_seconds: 0, __reason: `Baneado en CV Chat por ${by}${reason ? ': ' + reason : ''}`.slice(0, 500) });
  if (r && r.__error) { warn(`baneos: Discord no dejo banear a ${userName(havenId)} (${r.__error}${r.__body && r.__body.message ? ', ' + r.__body.message : ''})`); return false; }
  discordBanned.add(String(discordId));
  log(`baneos: ${userName(havenId)} baneado en Discord (baneo de ${by} en Haven)`);
  return true;
}

async function unbanInDiscord(havenId, discordId) {
  const g = getGuildId();
  if (!g) return false;
  const r = await api('DELETE', `/guilds/${g}/bans/${discordId}`, { __reason: 'Desbaneado en CV Chat' });
  if (r && r.__error && r.__error !== 404) { warn(`baneos: Discord no dejo desbanear a ${userName(havenId)} (${r.__error})`); return false; }
  discordBanned.delete(String(discordId));
  log(`baneos: ${userName(havenId)} desbaneado en Discord (desbaneo en Haven)`);
  return true;
}

// Cambios en la tabla bans de Haven desde la ultima vez
async function checkHaven() {
  if (busy || !getGuildId()) return;
  busy = true;
  try {
    // Baneos nuevos en Haven de cuentas vinculadas
    const fresh = db.prepare(`SELECT b.user_id, b.banned_by, b.reason, v.discord_user_id FROM bans b
      JOIN puente_vinculos v ON v.haven_user_id = b.user_id
      WHERE b.user_id NOT IN (SELECT haven_user_id FROM puente_baneos)`).all();
    for (const b of fresh) {
      // Ya baneado en Discord (p. ej. un baneo viejo): solo se anota
      if (discordBanned.has(String(b.discord_user_id))) { record(b.user_id, b.discord_user_id, 'haven'); continue; }
      const ok = await banInDiscord(b.user_id, b.discord_user_id, b.banned_by, b.reason);
      record(b.user_id, b.discord_user_id, 'haven', ok); // si fallo, se reintenta en el repaso
    }
    // Desbaneos en Haven
    const gone = db.prepare('SELECT haven_user_id, discord_user_id FROM puente_baneos WHERE haven_user_id NOT IN (SELECT user_id FROM bans)').all();
    for (const g of gone) {
      const exists = db.prepare('SELECT 1 FROM users WHERE id = ?').get(g.haven_user_id);
      // Cuenta borrada: el baneo de Discord se queda
      if (!exists || await unbanInDiscord(g.haven_user_id, g.discord_user_id)) db.prepare('DELETE FROM puente_baneos WHERE haven_user_id = ?').run(g.haven_user_id);
    }
  } finally { busy = false; }
}

// ── Repaso completo (al conectar y cada 10 minutos) ──────────────────────
async function fetchDiscordBans() {
  const g = getGuildId();
  const ids = new Set();
  let after = '0';
  for (;;) {
    const page = await api('GET', `/guilds/${g}/bans?limit=1000&after=${after}`);
    if (!Array.isArray(page)) return null; // sin permiso o sin conexion
    for (const b of page) ids.add(String(b.user.id));
    if (page.length < 1000) return ids;
    after = page[page.length - 1].user.id;
  }
}

async function reconcile() {
  if (!getGuildId()) return;
  const ids = await fetchDiscordBans();
  if (!ids) { warn('baneos: no se pudo leer la lista de baneos de Discord (falta "Banear miembros"?)'); return; }
  discordBanned = ids;
  // Baneos de Haven que no llegaron a Discord
  for (const r of db.prepare('SELECT p.haven_user_id, p.discord_user_id, b.banned_by, b.reason FROM puente_baneos p JOIN bans b ON b.user_id = p.haven_user_id WHERE p.en_discord = 0').all()) {
    if (ids.has(r.discord_user_id) || await banInDiscord(r.haven_user_id, r.discord_user_id, r.banned_by, r.reason)) record(r.haven_user_id, r.discord_user_id, 'haven');
  }
  // Baneados en Discord (vinculados) que en Haven todavia no
  for (const l of db.prepare('SELECT haven_user_id, discord_user_id FROM puente_vinculos').all()) {
    if (!ids.has(String(l.discord_user_id))) continue;
    if (db.prepare('SELECT 1 FROM bans WHERE user_id = ?').get(l.haven_user_id)) {
      if (!db.prepare('SELECT 1 FROM puente_baneos WHERE haven_user_id = ?').get(l.haven_user_id)) record(l.haven_user_id, l.discord_user_id, 'haven');
      continue;
    }
    banInHaven(l.haven_user_id, l.discord_user_id, '');
  }
  // Desbaneados en Discord con el puente apagado
  for (const r of db.prepare('SELECT haven_user_id, discord_user_id FROM puente_baneos WHERE en_discord = 1').all()) {
    if (!ids.has(r.discord_user_id)) onDiscordUnban({ user: { id: r.discord_user_id } });
  }
}

function onDispatch(t, d) {
  if (t === 'GUILD_CREATE') setTimeout(() => reconcile().catch(err => warn('baneos:', err.message)), 5000);
  else if (t === 'GUILD_BAN_ADD') onDiscordBan(d).catch(err => warn('baneos:', err.message));
  else if (t === 'GUILD_BAN_REMOVE') onDiscordUnban(d);
}

// Para "Entrar con Discord": no se crea una cuenta nueva a quien esta baneado en Discord
const isDiscordBanned = id => discordBanned.has(String(id));

module.exports = { setup, onDispatch, isDiscordBanned, _test: { checkHaven, reconcile, onDiscordBan, onDiscordUnban } };
