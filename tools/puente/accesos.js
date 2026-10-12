// Acceso a canales segun Discord (parte del puente).
//
// Modo PUENTE_ACCESO=vinculados (periodo de migracion):
//  - Todos los canales que vienen de Discord son privados en Haven.
//  - Una cuenta de Haven vinculada recibe acceso exactamente a los canales que
//    su cuenta de Discord puede ver (roles + permisos por canal, con las mismas
//    reglas que usa Discord). Si cambian sus roles, los permisos de un canal o
//    sale/la expulsan/la banean del servidor, se actualiza al momento.
//  - Las cuentas sin vincular solo ven los canales propios de Haven (p. ej. #bienvenida).
//  - Los administradores de Haven siguen viendo todo.
//
// Solo se quitan accesos que dio este modulo (tabla puente_accesos): las
// membresias que un admin agrego a mano no se tocan.

const VIEW = 1n << 10n;
const ADMINISTRATOR = 1n << 3n;
const THREAD_TYPES = new Set([10, 11, 12]);

let db, io, api, log, warn, getGuildId, channelInfo;
const roles = new Map();   // role id -> BigInt permisos
let ownerId = null;
let enabled = false;
let recomputeTimer = null;

function setup(ctx) {
  ({ db, io, api, log, warn, getGuildId, channelInfo } = ctx);
  enabled = process.env.PUENTE_ACCESO === 'vinculados';
  db.exec(`
    CREATE TABLE IF NOT EXISTS puente_accesos (
      haven_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
      PRIMARY KEY (haven_user_id, channel_id)
    );
  `);
  if (!enabled) { log('accesos: modo abierto (PUENTE_ACCESO no es "vinculados")'); return; }
  const n = db.prepare('UPDATE channels SET is_private = 1 WHERE discord_channel_id IS NOT NULL AND is_private = 0').run().changes;
  guardJoinByCode();
  log(`accesos: modo vinculados${n ? ` (${n} canales pasaron a privados)` : ''}`);
}

// En Haven un canal privado se puede abrir con su codigo (cuadro "Unirse a un
// canal" o un enlace ?channel=). Durante la migracion, a los canales que vienen
// de Discord solo se entra por los permisos de Discord: se rechaza el intento
// de unirse por codigo si no se es admin ni miembro ya. Se responde con el mismo
// error generico de Haven, para no revelar que el codigo existe.
function guardJoinByCode() {
  const isGuarded = db.prepare('SELECT id FROM channels WHERE code = ? COLLATE NOCASE AND discord_channel_id IS NOT NULL');
  const isMember = db.prepare('SELECT 1 FROM channel_members WHERE channel_id = ? AND user_id = ?');
  io.on('connection', socket => {
    socket.use((packet, next) => {
      try {
        const [event, data] = packet;
        if (event !== 'join-channel' || !socket.user || socket.user.isAdmin) return next();
        const code = data && typeof data.code === 'string' ? data.code.trim() : '';
        const ch = code ? isGuarded.get(code) : null;
        if (ch && !isMember.get(ch.id, socket.user.id)) {
          socket.emit('error-msg', 'Invalid channel code. Double-check it');
          return; // no se pasa a Haven
        }
      } catch (err) { warn('accesos: guardia de codigos:', err.message); }
      next();
    });
  });
}

// ── Datos del servidor de Discord ─────────────────────────────────────────
function onGuild(g) {
  ownerId = g.owner_id || ownerId;
  for (const r of g.roles || []) roles.set(r.id, BigInt(r.permissions || '0'));
  scheduleAll();
}
function onRole(event, d) {
  if (event === 'GUILD_ROLE_DELETE') roles.delete(d.role_id);
  else if (d.role) roles.set(d.role.id, BigInt(d.role.permissions || '0'));
  scheduleAll();
}

// Permisos efectivos de un miembro en un canal (algoritmo oficial de Discord).
function permissions(member, ch) {
  const guildId = getGuildId();
  if (member.user.id === ownerId) return ~0n;
  let base = roles.get(guildId) || 0n;
  for (const rid of member.roles || []) base |= roles.get(rid) || 0n;
  if (base & ADMINISTRATOR) return ~0n;
  let p = base;
  const ows = ch.permission_overwrites || [];
  const everyone = ows.find(o => o.id === guildId);
  if (everyone) { p &= ~BigInt(everyone.deny); p |= BigInt(everyone.allow); }
  let allow = 0n, deny = 0n;
  for (const o of ows) {
    if (Number(o.type) === 0 && (member.roles || []).includes(o.id)) { allow |= BigInt(o.allow); deny |= BigInt(o.deny); }
  }
  p &= ~deny; p |= allow;
  const own = ows.find(o => Number(o.type) === 1 && o.id === member.user.id);
  if (own) { p &= ~BigInt(own.deny); p |= BigInt(own.allow); }
  return p;
}

// ── Aplicar accesos ───────────────────────────────────────────────────────
// member = objeto miembro de Discord, o null si ya no esta en el servidor.
function apply(havenUserId, member) {
  const channels = db.prepare('SELECT id, name, discord_channel_id FROM channels WHERE discord_channel_id IS NOT NULL').all();
  const want = new Set();
  if (member) {
    for (const c of channels) {
      const info = channelInfo(c.discord_channel_id);
      if (!info || THREAD_TYPES.has(info.type)) continue;
      if (permissions(member, info) & VIEW) want.add(c.id);
    }
  }
  const granted = new Set(db.prepare('SELECT channel_id FROM puente_accesos WHERE haven_user_id = ?').all(havenUserId).map(r => r.channel_id));
  const isMember = db.prepare('SELECT 1 FROM channel_members WHERE channel_id = ? AND user_id = ?');
  let added = 0, removed = 0;
  db.transaction(() => {
    for (const id of want) {
      if (granted.has(id)) continue;
      if (!isMember.get(id, havenUserId)) {
        db.prepare('INSERT OR IGNORE INTO channel_members (channel_id, user_id) VALUES (?, ?)').run(id, havenUserId);
        db.prepare('INSERT OR IGNORE INTO puente_accesos (haven_user_id, channel_id) VALUES (?, ?)').run(havenUserId, id);
        added++;
      }
    }
    for (const id of granted) {
      if (want.has(id)) continue;
      db.prepare('DELETE FROM channel_members WHERE channel_id = ? AND user_id = ?').run(id, havenUserId);
      db.prepare('DELETE FROM puente_accesos WHERE haven_user_id = ? AND channel_id = ?').run(havenUserId, id);
      removed++;
    }
  })();
  if (added || removed) {
    log(`accesos: Haven #${havenUserId} +${added} / -${removed} canales`);
    refreshChannelList(havenUserId);
  }
  return { added, removed };
}

// Pide a Haven que vuelva a mandar la lista de canales a las sesiones abiertas de
// ese usuario (y que las una a las salas de los canales nuevos).
function refreshChannelList(havenUserId) {
  try {
    for (const s of io.of('/').sockets.values()) {
      if (s.user && s.user.id === havenUserId) for (const fn of s.listeners('get-channels')) fn();
    }
  } catch (err) { warn('accesos: no pude refrescar la lista de canales:', err.message); }
}

async function recomputeUser(discordUserId, memberFromEvent = undefined) {
  if (!enabled) return;
  const link = db.prepare('SELECT haven_user_id FROM puente_vinculos WHERE discord_user_id = ?').get(discordUserId);
  if (!link) return;
  let member = memberFromEvent;
  if (member === undefined) {
    const m = await api('GET', `/guilds/${getGuildId()}/members/${discordUserId}`);
    member = m && !m.__error ? m : (m && m.__error === 404 ? null : undefined);
    if (member === undefined) return; // error temporal: no tocar nada
  }
  return apply(link.haven_user_id, member);
}

function revokeAll(havenUserId) { return apply(havenUserId, null); }

function scheduleAll() {
  if (!enabled) return;
  clearTimeout(recomputeTimer);
  recomputeTimer = setTimeout(async () => {
    const links = db.prepare('SELECT discord_user_id FROM puente_vinculos').all();
    for (const l of links) { await recomputeUser(l.discord_user_id); }
  }, 3000);
}

// Eventos del gateway que afectan a los accesos.
function onDispatch(t, d) {
  if (!enabled) return;
  switch (t) {
    case 'GUILD_CREATE': onGuild(d); break;
    case 'GUILD_ROLE_CREATE': case 'GUILD_ROLE_UPDATE': case 'GUILD_ROLE_DELETE': onRole(t, d); break;
    case 'CHANNEL_CREATE': case 'CHANNEL_UPDATE': case 'CHANNEL_DELETE': scheduleAll(); break;
    case 'GUILD_MEMBER_UPDATE': if (d.user) recomputeUser(d.user.id, { user: d.user, roles: d.roles || [] }); break;
    case 'GUILD_MEMBER_REMOVE': if (d.user) recomputeUser(d.user.id, null); break;
    case 'GUILD_BAN_ADD': if (d.user) recomputeUser(d.user.id, null); break;
  }
}

module.exports = { setup, onDispatch, recomputeUser, revokeAll, isEnabled: () => enabled };
