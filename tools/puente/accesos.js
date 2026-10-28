// Acceso a canales segun Discord (parte del puente).
//
// Modo PUENTE_ACCESO=vinculados (periodo de migracion):
//  - Todos los canales que vienen de Discord son privados en Haven.
//  - Una cuenta de Haven vinculada recibe acceso exactamente a los canales que
//    su cuenta de Discord puede ver (roles + permisos por canal, con las mismas
//    reglas que usa Discord). Si cambian sus roles, los permisos de un canal o
//    sale/la expulsan/la banean del servidor, se actualiza al momento.
//  - Las cuentas sin vincular solo ven los canales propios de Haven (p. ej. #bienvenida);
//    con PUENTE_SIN_VINCULAR_VEN=publicos, tambien los de Discord que ve @everyone, con
//    sus permisos, y para escribir ahi necesitan el email confirmado y 10 minutos de cuenta.
//  - Los administradores de Haven siguen viendo todo.
//  - Tambien se copian los permisos de escribir, escribir en hilos, reaccionar y
//    adjuntar archivos de cada canal (tabla puente_permisos): Haven rechaza lo que
//    Discord no dejaria hacer. Las cuentas sin vincular tienen los de @everyone.
//
// Solo se quitan accesos que dio este modulo (tabla puente_accesos): las
// membresias que un admin agrego a mano no se tocan.

const VIEW = 1n << 10n;
// PUENTE_SIN_VINCULAR_VEN=publicos: las cuentas sin vincular ven lo que ve @everyone en Discord
const OPEN_UNLINKED = String(process.env.PUENTE_SIN_VINCULAR_VEN || '').trim().toLowerCase() === 'publicos';
const EVERYONE = { user: { id: '0' }, roles: [] };
const ADMINISTRATOR = 1n << 3n;
// Permisos de Discord que se copian, y su bit en puente_permisos.flags
const P = {
  send: { bit: 1, discord: 1n << 11n },     // SEND_MESSAGES
  thread: { bit: 2, discord: 1n << 38n },   // SEND_MESSAGES_IN_THREADS
  react: { bit: 4, discord: 1n << 6n },     // ADD_REACTIONS
  attach: { bit: 8, discord: 1n << 15n },   // ATTACH_FILES
};
const ALL_FLAGS = Object.values(P).reduce((a, x) => a | x.bit, 0);
const toFlags = p => Object.values(P).reduce((a, x) => a | ((p & x.discord) ? x.bit : 0), 0);
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
    CREATE TABLE IF NOT EXISTS puente_permisos (
      haven_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
      flags INTEGER NOT NULL,
      PRIMARY KEY (haven_user_id, channel_id)
    );
  `);
  if (!enabled) { log('accesos: modo abierto (PUENTE_ACCESO no es "vinculados")'); return; }
  const n = db.prepare('UPDATE channels SET is_private = 1 WHERE discord_channel_id IS NOT NULL AND is_private = 0').run().changes;
  guardJoinByCode();
  guardPosting();
  // Sin vincular, con los canales publicos: al conectarse (p. ej. una cuenta recien creada) ya los ve
  if (OPEN_UNLINKED) {
    io.on('connection', socket => {
      if (socket.user && !socket.user.isAdmin) setTimeout(() => { try { recomputeUnlinked(socket.user.id); } catch (err) { warn('accesos: sin vincular:', err.message); } }, 1000);
    });
  }
  log(`accesos: modo vinculados${n ? ` (${n} canales pasaron a privados)` : ''}`);
  // Los canales nuevos los crea la sincronizacion (otro proceso): cuando aparecen, se reparten los accesos
  const bridged = () => { const r = db.prepare('SELECT COUNT(*) n, MAX(id) m FROM channels WHERE discord_channel_id IS NOT NULL').get(); return r.n + ':' + r.m; };
  let known = bridged();
  setInterval(() => { try { const now = bridged(); if (now !== known) { known = now; scheduleAll(); } } catch (err) { warn('accesos: canales nuevos:', err.message); } }, 60 * 1000);
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

// ── Escribir, reaccionar, adjuntar: lo mismo que deja Discord ─────────────
// Permisos (flags) de un usuario de Haven en un canal que viene de Discord, o
// null si el canal no es de Discord (sin restricciones del puente).
function flagsFor(havenUserId, channelId) {
  const ch = db.prepare('SELECT discord_channel_id FROM channels WHERE id = ?').get(channelId);
  if (!ch || !ch.discord_channel_id) return null;
  const row = db.prepare('SELECT flags FROM puente_permisos WHERE haven_user_id = ? AND channel_id = ?').get(havenUserId, channelId);
  if (row) return row.flags;
  // Sin vincular (o sin calcular todavia): los permisos de @everyone en ese canal
  const info = channelInfo(ch.discord_channel_id);
  if (!info || !roles.size) return ALL_FLAGS; // todavia sin datos de Discord: no bloquear
  return toFlags(permissions({ user: { id: '0' }, roles: [] }, info));
}

const NO = {
  send: 'No tenés permiso para enviar mensajes en este canal.',
  thread: 'No tenés permiso para escribir en los hilos de este canal.',
  react: 'No tenés permiso para agregar reacciones nuevas en este canal.',
  attach: 'No tenés permiso para adjuntar archivos en este canal.',
};
const UPLOAD_LINE = /(^|\n)\s*(spoiler-img:)?\/uploads\/\S+|\[file:[^\]\n]+\]\(\/uploads\//;

function guardPosting() {
  const byCode = db.prepare('SELECT id FROM channels WHERE code = ?');
  const byMessage = db.prepare('SELECT channel_id FROM messages WHERE id = ?');
  const hasReaction = db.prepare('SELECT 1 FROM reactions WHERE message_id = ? AND emoji = ? LIMIT 1');
  io.on('connection', socket => {
    socket.use((packet, next) => {
      let deny = null;
      try {
        const [event, data] = packet;
        if (!socket.user || socket.user.isAdmin || !data || typeof data !== 'object') return next();
        let channelId = null, need = [];
        if (event === 'send-message' || event === 'schedule-message' || event === 'create-poll') {
          const c = typeof data.code === 'string' ? byCode.get(data.code.trim()) : null;
          channelId = c && c.id;
          need = ['send'];
          if (typeof data.content === 'string' && UPLOAD_LINE.test(data.content)) need.push('attach');
        } else if (event === 'send-thread-message') {
          const m = byMessage.get(data.parentId);
          channelId = m && m.channel_id;
          need = ['thread'];
          if (typeof data.content === 'string' && UPLOAD_LINE.test(data.content)) need.push('attach');
        } else if (event === 'add-reaction') {
          const m = byMessage.get(data.messageId);
          channelId = m && m.channel_id;
          // Como en Discord: sumarse a una reaccion que ya esta no necesita permiso
          if (m && !hasReaction.get(data.messageId, String(data.emoji || ''))) need = ['react'];
        }
        if (channelId && need.length) {
          const flags = flagsFor(socket.user.id, channelId);
          if (flags !== null) deny = need.find(k => !(flags & P[k].bit)) || null;
          // Sin Discord vinculado: escribir pide el email confirmado y unos minutos de cuenta
          if (!deny && flags !== null && (need.includes('send') || need.includes('thread'))) {
            const why = unlinkedWriteProblem(socket.user.id);
            if (why) deny = { text: why };
          }
        }
      } catch (err) { warn('accesos: guardia de permisos:', err.message); }
      if (!deny) return next();
      const text = typeof deny === 'object' ? deny.text : NO[deny];
      const cb = packet[packet.length - 1];
      if (typeof cb === 'function') cb({ error: text });
      socket.emit('error-msg', text);
      // no se pasa a Haven
    });
  });
}

// Para la aplicacion: que puede hacer el usuario en un canal (por codigo)
function channelPermissions(havenUserId, isAdmin, code) {
  const ch = db.prepare('SELECT id FROM channels WHERE code = ?').get(code);
  if (!ch) return null;
  const flags = isAdmin ? ALL_FLAGS : flagsFor(havenUserId, ch.id);
  const f = flags === null ? ALL_FLAGS : flags;
  const out = { enviar: !!(f & P.send.bit), hilos: !!(f & P.thread.bit), reaccionar: !!(f & P.react.bit), adjuntar: !!(f & P.attach.bit) };
  // Sin Discord vinculado y sin email confirmado (o cuenta recien hecha): no escribe, y se dice por que
  if (!isAdmin && flags !== null && out.enviar) {
    const why = unlinkedWriteProblem(havenUserId);
    if (why) { out.enviar = false; out.hilos = false; out.motivo = why; }
  }
  return out;
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
  const flags = new Map(); // channel id -> flags (escribir, hilos, reaccionar, adjuntar)
  if (member) {
    for (const c of channels) {
      const info = channelInfo(c.discord_channel_id);
      if (!info || THREAD_TYPES.has(info.type)) continue;
      const p = permissions(member, info);
      if (p & VIEW) { want.add(c.id); flags.set(c.id, toFlags(p)); }
    }
  }
  db.transaction(() => {
    db.prepare('DELETE FROM puente_permisos WHERE haven_user_id = ?').run(havenUserId);
    const put = db.prepare('INSERT INTO puente_permisos (haven_user_id, channel_id, flags) VALUES (?, ?, ?)');
    for (const [id, f] of flags) put.run(havenUserId, id, f);
  })();
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

// Al desvincular: con PUENTE_SIN_VINCULAR_VEN=publicos queda con lo de @everyone; si no, sin canales de Discord
function revokeAll(havenUserId) { return apply(havenUserId, OPEN_UNLINKED ? EVERYONE : null); }

// Cuentas sin vincular (PUENTE_SIN_VINCULAR_VEN=publicos): los canales y permisos de
// @everyone en Discord, como cualquiera que entra al servidor.
const isGhost = db_ => db_.prepare("SELECT id FROM users WHERE username = 'discord-historial'").get();
function recomputeUnlinked(havenUserId) {
  if (!enabled || !OPEN_UNLINKED || !roles.size) return;
  if (db.prepare('SELECT 1 FROM puente_vinculos WHERE haven_user_id = ?').get(havenUserId)) return;
  const g = isGhost(db);
  if (g && g.id === havenUserId) return;
  return apply(havenUserId, EVERYONE);
}

// Para escribir en los canales de Discord sin tener Discord vinculado: email
// confirmado (sin esperar minutos de cuenta: nadie tiene que esperar para escribir)
function unlinkedWriteProblem(havenUserId) {
  if (!OPEN_UNLINKED) return null;
  if (db.prepare('SELECT 1 FROM puente_vinculos WHERE haven_user_id = ?').get(havenUserId)) return null;
  let ok = false;
  try { ok = !!db.prepare('SELECT 1 FROM puente_emails WHERE haven_user_id = ? AND confirmado = 1').get(havenUserId); } catch { ok = true; /* sin email en este servidor */ }
  if (!ok) return 'Para escribir en este canal confirmá tu email (te mandamos un enlace).';
  return null;
}

function scheduleAll() {
  if (!enabled) return;
  clearTimeout(recomputeTimer);
  recomputeTimer = setTimeout(async () => {
    const links = db.prepare('SELECT discord_user_id FROM puente_vinculos').all();
    for (const l of links) { await recomputeUser(l.discord_user_id); }
    if (OPEN_UNLINKED) {
      for (const u of db.prepare("SELECT id FROM users WHERE username != 'discord-historial' AND id NOT IN (SELECT haven_user_id FROM puente_vinculos)").all()) recomputeUnlinked(u.id);
    }
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

// Canales "cerrados", con candadito en la lista como en Discord: los de Discord
// que @everyone no puede ver, y los privados propios de Haven. Se calcula con
// los mismos permisos de Discord que el resto del modulo.
let lockedCache = null;
function lockedChannelIds() {
  if (lockedCache && Date.now() - lockedCache.at < 60 * 1000) return lockedCache.ids;
  const ids = new Set();
  const guildId = getGuildId ? getGuildId() : null;
  const everyone = { user: { id: '0' }, roles: [] };
  for (const c of db.prepare('SELECT id, discord_channel_id, is_private FROM channels WHERE is_dm = 0').all()) {
    if (!c.discord_channel_id) { if (c.is_private) ids.add(c.id); continue; }
    if (!guildId || !roles.has(guildId)) continue; // todavia sin los roles de Discord
    const info = channelInfo && channelInfo(c.discord_channel_id);
    if (!info || THREAD_TYPES.has(info.type)) continue;
    if (!(permissions(everyone, info) & VIEW)) ids.add(c.id);
  }
  if (!lockedCache || lockedCache.ids.size !== ids.size) log(`accesos: ${ids.size} canales con candadito`);
  lockedCache = { at: Date.now(), ids };
  return ids;
}

module.exports = { setup, onDispatch, recomputeUser, recomputeUnlinked, revokeAll, channelPermissions, lockedChannelIds, isEnabled: () => enabled, openToUnlinked: () => OPEN_UNLINKED };
