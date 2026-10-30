// Puente en tiempo real Discord <-> Haven.
//
//  Discord -> Haven: conexion propia al gateway de Discord. Cada mensaje nuevo,
//    editado o borrado en un canal (o hilo) puenteado se aplica en Haven al
//    instante y se avisa a los clientes conectados con los mismos eventos que
//    usa Haven. Los mensajes guardan su ID de Discord, asi la sincronizacion
//    periodica (sincronizar-discord.js) nunca los duplica.
//
//  Haven -> Discord: escucha los eventos que Haven emite a sus clientes
//    (mensaje nuevo, editado, borrado, respuesta en hilo) y los publica en
//    Discord con un webhook del canal, con el nombre y avatar del autor.
//
//  Identidad: si la cuenta de Haven esta vinculada a una de Discord
//    (tabla puente_vinculos), en Discord sale con su nombre y avatar de Discord
//    y una linea "-# ✅ desde Haven · <@id>" (texto: PUENTE_FIRMA) con una mencion real (que no
//    notifica). Las menciones escritas a mano se convierten en texto, asi que
//    esa linea no se puede falsificar. Las cuentas sin vincular salen como
//    "Nombre ᶜᵛ · sin verificar" (con la marca PUENTE_MARCA), o no salen (PUENTE_SIN_VINCULAR=bloquear).
//
// Configuracion (variables de entorno, en /opt/haven/.env):
//   PUENTE_CANALES       nombres o IDs de canales de Discord separados por comas,
//                        o * para todos. Vacio = puente apagado.
//   PUENTE_SIN_VINCULAR  marcar (por defecto) | bloquear
//   PUBLIC_URL           URL publica de Haven (para avatares y archivos)
//
// Ferry (el puente que trae Haven) debe estar APAGADO: si no, ambos
// publicarian lo mismo dos veces.

const fs = require('fs');
const path = require('path');
const WebSocket = require('/app/node_modules/ws');
const vincular = require('./vincular.js');
const adjuntos = require('./adjuntos.js');
const accesos = require('./accesos.js');
const baneos = require('./baneos.js');
const rol = require('./rol.js');
const escribiendo = require('./escribiendo.js');
const logros = require('./logros.js');
const avisos = require('./avisos.js');
const identidad = require('./identidad.js');
const estadisticas = require('./estadisticas.js');
const reacciones = require('./reacciones.js');
const vigia = require('./vigia.js');
const stickers = require('./stickers.js');
const nombres = require('./nombres.js');
const enlaces = require('./enlaces.js');
const embeds = require('./embeds.js');
const miniaturas = require('./miniaturas.js');

const API = 'https://discord.com/api/v10';
// GUILDS, GUILD_MESSAGES, MESSAGE_CONTENT, mas GUILD_MEMBERS y GUILD_MODERATION
// para los accesos (roles, expulsiones, baneos). Si Discord rechaza los
// miembros (falta "Server Members Intent"), el puente sigue sin ellos.
const MEMBERS_INTENT = 1 << 1;
let intents = (1 << 0) | MEMBERS_INTENT | (1 << 2) | (1 << 9) | (1 << 10) | (1 << 11) | (1 << 15); // + GUILD_MESSAGE_REACTIONS, GUILD_MESSAGE_TYPING
const WEBHOOK_NAME = 'Haven (puente)';
const THREAD_TYPES = new Set([10, 11, 12]);

const log = (...a) => console.log('[puente]', ...a);
const warn = (...a) => console.warn('[puente]', ...a);

let db, io, token, publicUrl, allow, unlinkedPolicy;
let botUserId = null;
let guildId = null;
let guildName = null;
const discordChannels = new Map(); // id -> { id, name, type, parent_id }
const ourWebhookIds = new Set();
const insertedByBridge = new Set();  // ids de Haven que creo el puente (no reenviar)
const markInserted = id => { insertedByBridge.add(id); setTimeout(() => insertedByBridge.delete(id), 120000).unref(); };
const queues = new Map();            // cola por canal de Discord, para mantener el orden

// ══════════════════════════════════════════════════════════════════════════
// Arranque
// ══════════════════════════════════════════════════════════════════════════
function start(deps) {
  db = deps.db;
  io = deps.io;
  const list = (process.env.PUENTE_CANALES || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!list.length) { log('apagado (PUENTE_CANALES vacio)'); return; }
  allow = list.includes('*') ? null : new Set(list);
  unlinkedPolicy = process.env.PUENTE_SIN_VINCULAR === 'bloquear' ? 'bloquear' : 'marcar';
  publicUrl = (process.env.PUBLIC_URL || '').replace(/\/+$/, '');

  const row = db.prepare("SELECT value FROM server_settings WHERE key = 'ferry_bot_token'").get();
  token = row && row.value;
  if (!token) { warn('no hay token de Ferry configurado; puente apagado'); return; }
  const ferryOn = db.prepare("SELECT value FROM server_settings WHERE key = 'ferry_enabled'").get();
  if (ferryOn && (ferryOn.value === 'true' || ferryOn.value === '1')) {
    warn('Ferry esta encendido: apagalo en Settings -> Ferry, o los mensajes saldrian duplicados. Puente apagado.');
    return;
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS puente_webhooks (
      discord_channel_id TEXT PRIMARY KEY,
      webhook_id TEXT NOT NULL,
      webhook_token TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS puente_vinculos (
      discord_user_id TEXT PRIMARY KEY,
      haven_user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      discord_username TEXT,
      discord_global_name TEXT,
      discord_avatar TEXT,
      linked_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS puente_salientes (
      haven_message_id INTEGER PRIMARY KEY,
      discord_message_id TEXT NOT NULL,
      discord_channel_id TEXT NOT NULL,
      discord_thread_id TEXT
    );
    -- Adjuntos de Discord que subio el puente por cada mensaje de Haven (para
    -- sacarlos si se borra solo la imagen de un mensaje que se junto con su texto)
    CREATE TABLE IF NOT EXISTS puente_adjuntos (
      haven_message_id INTEGER PRIMARY KEY,
      attachment_ids TEXT NOT NULL
    );
    -- Bots y webhooks de Discord, para mostrar sus mensajes con la etiqueta "APP"
    -- como en Discord (en vez de "DISCORD"): los mensajes, y las cuentas de bots
    -- (asi tambien los que ya estaban, por su autor en puente_autores)
    CREATE TABLE IF NOT EXISTS puente_apps (message_id INTEGER PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS puente_bots (discord_user_id TEXT PRIMARY KEY);
  `);
  for (const w of db.prepare('SELECT webhook_id FROM puente_webhooks').all()) ourWebhookIds.add(w.webhook_id);

  accesos.setup({ db, io, api: (m, e, b) => api(m, e, b), log, warn, getGuildId: () => guildId, channelInfo: id => discordChannels.get(id) });
  baneos.setup({ db, io, api: (m, e, b) => api(m, e, b), log, warn, getGuildId: () => guildId });
  rol.setup({ db, api: (m, e, b) => api(m, e, b), log, warn, getGuildId: () => guildId, appName });
  // El nombre de la comunidad en los textos: PUENTE_COMUNIDAD, o el del servidor de Discord
  const community = () => String(process.env.PUENTE_COMUNIDAD || '').replace(/[^\p{L}\p{N} ._!?-]/gu, '').trim().slice(0, 40) || guildName || appName();
  avisos.setup({ db, io, log, warn });
  identidad.setup({ db, io, api: (m, e, b) => api(m, e, b), log, warn, getGuildId: () => guildId });
  logros.setup({ db, api: (m, e, b) => api(m, e, b), apiFiles: (m, e, b, f) => apiFiles(m, e, b, f), log, warn, getGuildId: () => guildId, appName, community, publicUrl,
    lockedChannelIds: () => accesos.lockedChannelIds(), postInHaven: msg => inboundCreate({ ...msg, guild_id: msg.guild_id || guildId }, true) });
  vincular.setup({ db, io, api: (m, e, b) => api(m, e, b), log, warn, publicUrl,
    onLinked: async discordUserId => {
      await accesos.recomputeUser(discordUserId); estadisticas.update(); rol.onLinked(discordUserId);
      const l = db.prepare('SELECT haven_user_id FROM puente_vinculos WHERE discord_user_id = ?').get(String(discordUserId));
      if (l) identidad.onLinked(l.haven_user_id); // gana el verdadero
    },
    onUnlinked: havenUserId => { accesos.revokeAll(havenUserId); estadisticas.update(); rol.onUnlinked(); } });
  estadisticas.setup({ db, io, log, warn });
  require('./invitaciones.js').setup({ db, log, warn, publicUrl });
  require('./perfil.js').setup({ db, io, log, warn });
  require('./mercado.js').setup({ db, io, log, warn });
  require('./denuncias.js').setup({ db, io, log, warn });
  require('./truco.js').setup({ db, io, log, warn });
  require('./funball.js').setup({ db, io, log, warn });
  require('./ajedrez.js').setup({ db, io, log, warn });
  require('./leidos.js').setup({ db, io, log, warn });
  escribiendo.setup({ db, io, api: (m, e, b) => api(m, e, b), log, warn, isBridged: id => isBridged(id), getBotUserId: () => botUserId });
  reacciones.setup({ db, io, api: (m, e, b) => api(m, e, b), log, warn, adjuntos, getBotUserId: () => botUserId });
  vigia.setup({ db, api: (m, e, b) => api(m, e, b), log, warn, getGuildId: () => guildId, getBotUserId: () => botUserId });
  require('./tema-fijo.js').setup({ db, io, log });
  require('./medicion.js').setup({ io, db });
  require('./buscar.js').setup({ db, io, log, warn });
  embeds.setup({ db, io, api: (m, e, b) => api(m, e, b), log, warn });
  require('./mudanza.js').setup({ db, api: (m, e, b) => api(m, e, b), log, warn, appName, publicUrl });
  miniaturas.setup({ log, warn });
  stickers.setup({ db, io, api: (m, e, b) => api(m, e, b), log, warn, getGuildId: () => guildId });
  hookHavenEmits();
  connectGateway();
  // Mensajes que no llegaron a Discord: se reintentan (el primero, cuando ya se conecto)
  setTimeout(retryMissing, 60 * 1000);
  setInterval(retryMissing, 5 * 60 * 1000);
  log(`encendido para ${allow ? [...allow].join(', ') : 'todos los canales'}; cuentas sin vincular: ${unlinkedPolicy}`);
}

// ══════════════════════════════════════════════════════════════════════════
// Utilidades
// ══════════════════════════════════════════════════════════════════════════
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function api(method, endpoint, body, attempt = 0) {
  // body.__reason: el motivo para el registro de auditoria de Discord
  const headers = { Authorization: `Bot ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'HavenPuente (local, 1.0)' };
  if (body && body.__reason) { headers['X-Audit-Log-Reason'] = encodeURIComponent(body.__reason); const { __reason, ...rest } = body; body = Object.keys(rest).length ? rest : undefined; }
  const res = await fetch(API + endpoint, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
  }).catch(err => ({ ok: false, status: 0, err }));
  if (res.status === 429 && attempt < 5) {
    let wait = 1;
    try { wait = (await res.json()).retry_after || 1; } catch { /* sin cuerpo */ }
    await sleep(wait * 1000 + 100);
    return api(method, endpoint, body, attempt + 1);
  }
  if ((res.status === 0 || res.status >= 500) && attempt < 3) { await sleep(1000 * (attempt + 1)); return api(method, endpoint, body, attempt + 1); }
  if (res.status === 204) return {};
  let data = null;
  try { data = await res.json(); } catch { /* sin cuerpo */ }
  // Sin respuesta (sin red) el estado es 0, que en un if no cuenta como error: 'sin respuesta' si cuenta
  if (!res.ok) return { __error: res.status || 'sin respuesta', __body: data };
  return data;
}

// Igual que api(), pero subiendo archivos (multipart). files: [{ data, name }]
async function apiFiles(method, endpoint, payload, files, attempt = 0) {
  const form = new FormData();
  form.append('payload_json', JSON.stringify(payload));
  files.forEach((f, i) => form.append(`files[${i}]`, new Blob([f.data]), f.name));
  const res = await fetch(API + endpoint, {
    method,
    headers: { Authorization: `Bot ${token}`, 'User-Agent': 'HavenPuente (local, 1.0)' },
    body: form,
    signal: AbortSignal.timeout(120000),
  }).catch(err => ({ ok: false, status: 0, err }));
  if (res.status === 429 && attempt < 5) {
    let wait = 1;
    try { wait = (await res.json()).retry_after || 1; } catch { /* sin cuerpo */ }
    await sleep(wait * 1000 + 100);
    return apiFiles(method, endpoint, payload, files, attempt + 1);
  }
  if ((res.status === 0 || res.status >= 500) && attempt < 2) { await sleep(2000 * (attempt + 1)); return apiFiles(method, endpoint, payload, files, attempt + 1); }
  let data = null;
  try { data = await res.json(); } catch { /* sin cuerpo */ }
  // Sin respuesta (sin red) el estado es 0, que en un if no cuenta como error: 'sin respuesta' si cuenta
  if (!res.ok) return { __error: res.status || 'sin respuesta', __body: data };
  return data;
}

// Encola trabajo por canal de Discord para que los mensajes salgan en orden.
function enqueue(key, fn) {
  const prev = queues.get(key) || Promise.resolve();
  const next = prev.then(fn).catch(err => warn('error:', err && err.message || err));
  queues.set(key, next);
  next.finally(() => { if (queues.get(key) === next) queues.delete(key); });
  return next;
}

function toSqlTs(iso) {
  const d = iso ? new Date(iso) : new Date();
  return (isNaN(d) ? new Date() : d).toISOString().replace('T', ' ').replace('Z', '');
}
const utc = ts => (ts && !String(ts).endsWith('Z') ? String(ts).replace(' ', 'T') + 'Z' : ts);

function discordAvatar(user) {
  if (!user) return null;
  if (user.avatar) return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`;
  return null;
}

// Como el importador oficial de Haven, salvo por los embeds. Una persona no
// puede crear embeds: en sus mensajes, todos son la vista previa que Discord
// genera de un enlace que ya esta en el texto (aunque Discord a veces las marque
// "rich", como las de fixupx). Haven genera la suya, asi que copiar ese texto
// solo duplica la vista previa (y trae marcas de formato como "15\.6K"). Solo
// en mensajes de bots y webhooks el embed es parte del mensaje.
// attLines: Map id de adjunto -> linea de Haven (adjuntos.localizeAll). Sin ella,
// los adjuntos quedan como enlace a Discord.
function buildContent(msg, attLines) {
  let content = adjuntos.gifInstead(msg) || msg.content || '';
  for (const a of msg.attachments || []) {
    content += '\n' + ((attLines && attLines.get(a.id)) || adjuntos.fallback(a));
  }
  const fw = adjuntos.forwarded(msg, attLines); // mensaje reenviado
  if (fw) content += '\n' + fw;
  for (const line of adjuntos.stickerLines(db, msg)) content += '\n' + line;
  const fromBot = !!(msg.webhook_id || (msg.author && msg.author.bot));
  for (const e of msg.embeds || []) {
    if (!fromBot || (e.type && e.type !== 'rich')) continue;
    if (e.title) content += `\n🔗 **${e.title}**`;
    if (e.description) content += `\n${e.description}`;
    if (e.url && !content.includes(e.url)) content += `\n${e.url}`;
  }
  return adjuntos.mentionsToHaven(db, adjuntos.emojisToHaven(db, content.trim()), msg);
}

const q = () => ({
  channelByDiscord: db.prepare('SELECT id, code, name, is_forum FROM channels WHERE discord_channel_id = ?'),
  channelById: db.prepare('SELECT id, code, name, discord_channel_id FROM channels WHERE id = ?'),
  byDiscordId: db.prepare('SELECT id, channel_id, thread_id, user_id FROM messages WHERE discord_message_id = ?'),
  messageById: db.prepare(`SELECT m.*, COALESCE(u.display_name, u.username) AS uname, u.avatar AS uavatar, u.avatar_shape AS ushape
                           FROM messages m LEFT JOIN users u ON u.id = m.user_id WHERE m.id = ?`),
  linkByDiscord: db.prepare('SELECT * FROM puente_vinculos WHERE discord_user_id = ?'),
  linkByHaven: db.prepare('SELECT * FROM puente_vinculos WHERE haven_user_id = ?'),
  admin: db.prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE'),
});
let Q = null;
const stmts = () => (Q || (Q = q()));

// Los mensajes de cuentas de Discord sin vincular van a nombre de un usuario
// tecnico sin permisos (no del admin): asi no salen con la etiqueta ADMIN y no
// rompen el conteo de no leidos del admin.
function adminId() {
  const a = stmts().admin.get('discord-historial') || stmts().admin.get(process.env.ADMIN_USERNAME || '');
  return a ? a.id : null;
}

function isBridged(discordChannelId) {
  if (!allow) return true;
  const ch = discordChannels.get(discordChannelId);
  if (allow.has(discordChannelId)) return true;
  if (ch && allow.has(ch.name)) return true;
  if (ch && ch.parent_id && THREAD_TYPES.has(ch.type)) return isBridged(ch.parent_id);
  return false;
}

// ══════════════════════════════════════════════════════════════════════════
// Discord -> Haven
// ══════════════════════════════════════════════════════════════════════════
let ws = null, seq = null, sessionId = null, resumeUrl = null, heartbeatTimer = null, acked = true, stopped = false;

async function connectGateway(resume = false) {
  if (stopped) return;
  let url = resume && resumeUrl;
  if (!url) {
    const g = await api('GET', '/gateway/bot');
    // __error es 0 cuando no hubo respuesta (sin red): tambien se reintenta
    if (g.__error !== undefined || !g.url) { warn('no pude pedir el gateway:', g.__error); setTimeout(() => connectGateway(), 15000); return; }
    url = g.url;
  }
  ws = new WebSocket(`${url}/?v=10&encoding=json`);
  ws.on('message', raw => {
    let p; try { p = JSON.parse(raw); } catch { return; }
    if (p.s) seq = p.s;
    if (p.op === 10) { // HELLO
      clearInterval(heartbeatTimer);
      acked = true;
      const beat = () => {
        if (ws.readyState !== WebSocket.OPEN) return;
        if (!acked) { try { ws.terminate(); } catch { /* ya cerrado */ } return; }
        acked = false;
        try { ws.send(JSON.stringify({ op: 1, d: seq })); } catch { /* se reconecta al cerrarse */ }
      };
      setTimeout(beat, Math.random() * p.d.heartbeat_interval);
      heartbeatTimer = setInterval(beat, p.d.heartbeat_interval);
      if (resume && sessionId) ws.send(JSON.stringify({ op: 6, d: { token, session_id: sessionId, seq } }));
      else ws.send(JSON.stringify({ op: 2, d: { token, intents, properties: { os: 'linux', browser: 'haven-puente', device: 'haven-puente' } } }));
    } else if (p.op === 11) acked = true;
    else if (p.op === 1) ws.send(JSON.stringify({ op: 1, d: seq }));
    else if (p.op === 7) { try { ws.close(4000); } catch { /* ya cerrado */ } } // reconnect
    else if (p.op === 9) { if (!p.d) { sessionId = null; seq = null; } setTimeout(() => { try { ws.close(4000); } catch { /* */ } }, 2000); }
    else if (p.op === 0) onDispatch(p.t, p.d);
  });
  ws.on('close', code => {
    clearInterval(heartbeatTimer);
    if (code === 4014 && (intents & MEMBERS_INTENT)) {
      intents &= ~MEMBERS_INTENT; sessionId = null;
      warn('Discord no permite "Server Members Intent": sigo sin el (los cambios de roles se revisan solo al reiniciar). Activalo en el Developer Portal.');
      setTimeout(() => connectGateway(false), 2000);
      return;
    }
    if ([4004, 4010, 4011, 4012, 4013, 4014].includes(code)) { stopped = true; warn(`Discord cerro la conexion (codigo ${code}); puente detenido. 4014 = falta activar Message Content Intent.`); return; }
    setTimeout(() => connectGateway(!!sessionId), 3000);
  });
  ws.on('error', err => warn('gateway:', err.message));
}

function cacheChannel(c) {
  adjuntos.rememberChannel(c); // para convertir menciones de hilos
  if (c && c.id) discordChannels.set(c.id, { id: c.id, name: c.name, type: c.type, parent_id: c.parent_id || null, permission_overwrites: c.permission_overwrites || (discordChannels.get(c.id) || {}).permission_overwrites || [] });
}

function onDispatch(t, d) {
  try {
    switch (t) {
      case 'READY':
        sessionId = d.session_id; resumeUrl = d.resume_gateway_url; botUserId = d.user && d.user.id;
        if (botUserId) db.prepare('INSERT OR IGNORE INTO puente_bots (discord_user_id) VALUES (?)').run(botUserId);
        log(`conectado a Discord como ${d.user && d.user.username}`);
        break;
      case 'GUILD_CREATE': {
        // Solo el servidor del que vienen los canales importados (por si alguien
        // anadiera el bot a otro servidor).
        const ours = (d.channels || []).some(c => db.prepare('SELECT 1 FROM channels WHERE discord_channel_id = ?').get(c.id));
        if (!ours || (guildId && guildId !== d.id)) return;
        guildId = d.id;
        setTimeout(() => identidad.onGuildReady(), 15000);
        guildName = d.name || guildName;
        (d.channels || []).forEach(cacheChannel);
        (d.threads || []).forEach(cacheChannel);
        adjuntos.rememberRoles(d.roles); // para convertir menciones de roles
        // Nombres renombrados en Discord mientras el puente estaba apagado
        (d.channels || []).forEach(c => estadisticas.onDiscordChannelUpdate(c));
        stickers.onGuild(d); // copia los stickers del servidor (y despues cada 6 horas)
        break;
      }
      case 'CHANNEL_CREATE': case 'CHANNEL_UPDATE': case 'THREAD_CREATE': case 'THREAD_UPDATE':
        if (guildId && d.guild_id && d.guild_id !== guildId) return;
        cacheChannel(d);
        if (t === 'CHANNEL_UPDATE') { estadisticas.onDiscordChannelUpdate(d); if (isBridged(d.id)) onDiscordTopic(d); vigia.onDiscordChange(); }
        break;
      case 'GUILD_ROLE_CREATE': case 'GUILD_ROLE_UPDATE':
        if (d.guild_id === guildId) { adjuntos.rememberRoles([d.role]); vigia.onDiscordChange(); }
        break;
      case 'GUILD_ROLE_DELETE':
        if (d.guild_id === guildId) vigia.onDiscordChange();
        break;
      case 'GUILD_MEMBER_UPDATE': // cambiaron los roles del bot
        if (d.guild_id === guildId && d.user && d.user.id === botUserId) vigia.onDiscordChange();
        break;
      case 'MESSAGE_CREATE': if (isBridged(d.channel_id)) enqueue('in:' + d.channel_id, () => inboundCreate(d)); break;
      case 'TYPING_START': if (d.guild_id === guildId && isBridged(d.channel_id)) escribiendo.onDiscordTyping(d); break;
      // El embed de un enlace (de los dos lados) suele llegar en una actualizacion (embeds.js)
      case 'MESSAGE_UPDATE': if (isBridged(d.channel_id)) enqueue('in:' + d.channel_id, async () => { embeds.onDiscordUpdate(d); await inboundUpdate(d); }); break;
      case 'MESSAGE_DELETE': if (isBridged(d.channel_id)) enqueue('in:' + d.channel_id, () => inboundDelete(d.id)); break;
      case 'MESSAGE_REACTION_ADD': case 'MESSAGE_REACTION_REMOVE': case 'MESSAGE_REACTION_REMOVE_ALL': case 'MESSAGE_REACTION_REMOVE_EMOJI':
        if (isBridged(d.channel_id)) enqueue('in:' + d.channel_id, async () => reacciones.onDiscordReaction(t, d));
        break;
      case 'MESSAGE_DELETE_BULK': if (isBridged(d.channel_id)) enqueue('in:' + d.channel_id, async () => { for (const id of d.ids) await inboundDelete(id); }); break;
    }
    if (d && (t === 'GUILD_CREATE' ? d.id === guildId : d.guild_id === guildId)) { accesos.onDispatch(t, d); baneos.onDispatch(t, d); rol.onDispatch(t, d); }
  } catch (err) { warn(`error procesando ${t}:`, err.message); }
}

async function discordChannel(id) {
  if (discordChannels.has(id)) return discordChannels.get(id);
  const c = await api('GET', `/channels/${id}`);
  if (c.__error) return null;
  cacheChannel(c);
  return discordChannels.get(id);
}

// Donde va un mensaje de Discord en Haven: { channel, root } (root = mensaje
// del que cuelga el hilo, o null).
async function havenTarget(discordChannelId, createRoot = true) {
  const S = stmts();
  const direct = S.channelByDiscord.get(discordChannelId);
  if (direct) return { channel: direct, root: null };
  const th = await discordChannel(discordChannelId);
  if (!th || !THREAD_TYPES.has(th.type) || th.type === 12) return null; // los hilos privados no se puentean
  const parent = S.channelByDiscord.get(th.parent_id);
  if (!parent) return null; // canal aun no importado: lo traera la sincronizacion
  const found = S.byDiscordId.get(th.id) || S.byDiscordId.get(`thread-${th.id}`);
  if (found) return { channel: parent, root: found.id };
  if (!createRoot) return null;
  // Hilo nuevo sin mensaje de origen en Haven: crear uno, como la sincronizacion.
  const r = db.prepare(`INSERT INTO messages (channel_id, user_id, content, created_at, webhook_username, is_webhook, imported_from, discord_message_id)
                        VALUES (?, ?, ?, ?, 'Discord', 0, 'discord', ?)`)
    .run(parent.id, adminId(), `🧵 **${th.name}**`, toSqlTs(), `thread-${th.id}`);
  markInserted(r.lastInsertRowid);
  emitNew(parent, r.lastInsertRowid, null);
  return { channel: parent, root: r.lastInsertRowid };
}

// ownBot: un mensaje del propio bot que si va a Haven (el resumen de logros.js)
async function inboundCreate(msg, ownBot = false) {
  if (!msg.guild_id) return;
  if (msg.webhook_id && ourWebhookIds.has(msg.webhook_id)) return; // eco de lo que publicamos
  if (!ownBot && botUserId && msg.author && msg.author.id === botUserId) return;
  if (msg.type !== 0 && msg.type !== 19) return;
  const content = buildContent(msg, await adjuntos.localizeAll(msg));
  if (!content) return;
  const S = stmts();
  if (S.byDiscordId.get(msg.id)) return; // ya estaba (p. ej. lo trajo la sincronizacion)

  const target = await havenTarget(msg.channel_id);
  if (!target) return;
  // message_reference de tipo 1 es un reenvio, no una respuesta.
  const ref = msg.message_reference && msg.message_reference.type !== 1 ? msg.message_reference.message_id : null;
  const replyTo = ref ? ((S.byDiscordId.get(ref) || {}).id || null) : null;
  const link = msg.author && !msg.webhook_id ? S.linkByDiscord.get(msg.author.id) : null;
  // Desvinculo su Discord pero el historial es suyo (puente_historial): lo nuevo tambien va a su cuenta
  const dueno = !link && msg.author && !msg.webhook_id ? vincular.historyOwner(msg.author.id) : null;
  // Mismo nombre que usa el historial importado (no el apodo del servidor).
  const author = (msg.author && (msg.author.global_name || msg.author.username)) || 'Unknown';

  let r;
  if (link) {
    // Sin el nombre de Discord en el mensaje: se ve con el de la cuenta, que es el
    // de Discord salvo que la persona se haya puesto otro (nombres.js). Si cambio
    // su nombre en Discord, se actualiza. Se guarda el avatar de Discord: si un
    // dia desvincula, el mensaje vuelve a mostrarse como importado con el.
    try {
      if (msg.author && (msg.author.username !== link.discord_username || (msg.author.global_name || null) !== link.discord_global_name)) {
        db.prepare('UPDATE puente_vinculos SET discord_username = ?, discord_global_name = ? WHERE discord_user_id = ?')
          .run(msg.author.username, msg.author.global_name || null, msg.author.id);
        nombres.applyName(db, link.haven_user_id, author);
      }
    } catch (err) { warn('nombre:', err.message); }
    r = db.prepare(`INSERT OR IGNORE INTO messages (channel_id, user_id, content, created_at, webhook_username, webhook_avatar, reply_to, discord_message_id, thread_id)
                    VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?)`)
      .run(target.channel.id, link.haven_user_id, content, toSqlTs(msg.timestamp), discordAvatar(msg.author), replyTo, msg.id, target.root);
  } else if (dueno) {
    r = db.prepare(`INSERT OR IGNORE INTO messages (channel_id, user_id, content, created_at, webhook_username, webhook_avatar, reply_to, discord_message_id, thread_id)
                    VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?)`)
      .run(target.channel.id, dueno, content, toSqlTs(msg.timestamp), discordAvatar(msg.author), replyTo, msg.id, target.root);
  } else {
    r = db.prepare(`INSERT OR IGNORE INTO messages (channel_id, user_id, content, created_at, webhook_username, webhook_avatar, is_webhook, imported_from, reply_to, discord_message_id, thread_id)
                    VALUES (?, ?, ?, ?, ?, ?, 0, 'discord', ?, ?, ?)`)
      .run(target.channel.id, adminId(), content, toSqlTs(msg.timestamp), author, discordAvatar(msg.author), replyTo, msg.id, target.root);
  }
  if (!r.changes) return;
  markInserted(r.lastInsertRowid);
  // Sin cuenta vinculada: el aviso de la mudanza (mudanza.js, un privado por Discord, una sola vez)
  if (!link && !ownBot) require('./mudanza.js').aviso(msg);
  if (!msg.webhook_id && msg.author) vincular.recordAuthor(r.lastInsertRowid, msg.author.id);
  if (msg.webhook_id || (msg.author && msg.author.bot)) {
    db.prepare('INSERT OR IGNORE INTO puente_apps (message_id) VALUES (?)').run(r.lastInsertRowid);
    if (!msg.webhook_id) db.prepare('INSERT OR IGNORE INTO puente_bots (discord_user_id) VALUES (?)').run(msg.author.id);
  }
  emitNew(target.channel, r.lastInsertRowid, target.root);
  // Notificaciones de menciones, respuestas y @everyone (Haven solo avisa de lo escrito en Haven)
  if (!ownBot) avisos.onInbound({ channel: target.channel, content, msg, replyToId: replyTo, author });
  if (Array.isArray(msg.embeds) && msg.embeds.length) embeds.capture(r.lastInsertRowid, msg.embeds);
  miniaturas.warmFromContent(content);
}

async function inboundUpdate(msg) {
  if (typeof msg.content !== 'string') return; // actualizacion parcial (vista previa de enlace)
  if (msg.webhook_id && ourWebhookIds.has(msg.webhook_id)) return;
  const S = stmts();
  const row = S.byDiscordId.get(msg.id);
  if (!row || db.prepare('SELECT 1 FROM puente_salientes WHERE haven_message_id = ?').get(row.id)) return;
  const content = buildContent(msg, await adjuntos.localizeAll(msg));
  if (!content) return;
  db.prepare("UPDATE messages SET content = ?, edited_at = datetime('now') WHERE id = ?").run(content, row.id);
  const ch = S.channelById.get(row.channel_id);
  io.to(`channel:${ch.code}`).emit('message-edited', { channelCode: ch.code, messageId: row.id, content, editedAt: new Date().toISOString(), fromPuente: true });
}

async function inboundDelete(discordId) {
  const S = stmts();
  // Tambien los que salieron de Haven: borrados en Discord (por quien lo escribio o
  // por un moderador), se borran aca. Un mensaje de Discord puede llevar varios de
  // Haven (texto + imagen): se borran todos. (El puente solo borra en Discord
  // mensajes que ya se borraron en Haven, asi que eso no borra nada de mas.)
  const ids = new Set();
  const row = S.byDiscordId.get(discordId);
  if (row) ids.add(row.id);
  for (const r of db.prepare('SELECT haven_message_id id FROM puente_salientes WHERE discord_message_id = ?').all(discordId)) ids.add(r.id);
  for (const id of ids) {
    const m = db.prepare('SELECT id, channel_id FROM messages WHERE id = ?').get(id);
    db.prepare('DELETE FROM puente_salientes WHERE haven_message_id = ?').run(id);
    db.prepare('DELETE FROM puente_adjuntos WHERE haven_message_id = ?').run(id);
    if (!m) continue;
    const ch = S.channelById.get(m.channel_id);
    db.prepare('DELETE FROM messages WHERE id = ?').run(m.id);
    if (ch) io.to(`channel:${ch.code}`).emit('message-deleted', { channelCode: ch.code, messageId: m.id, fromPuente: true });
  }
}

// Avisa a los clientes con el mismo formato que usa Haven al cargar el historial.
function emitNew(channel, messageId, rootId) {
  const m = stmts().messageById.get(messageId);
  if (!m) return;
  let replyContext = null;
  if (m.reply_to) {
    const p = stmts().messageById.get(m.reply_to);
    if (p) replyContext = { id: p.id, content: p.content, user_id: p.user_id, username: p.imported_from ? (p.webhook_username || 'Unknown') : (p.uname || 'Unknown') };
  }
  const message = {
    id: m.id,
    content: m.content,
    created_at: utc(m.created_at),
    username: m.imported_from ? (m.webhook_username || 'Unknown') : (m.uname || 'Unknown'),
    user_id: m.user_id,
    avatar: m.imported_from ? (m.webhook_avatar || null) : (m.uavatar || null),
    avatar_shape: m.imported_from ? 'circle' : (m.ushape || 'circle'),
    webhook_username: m.webhook_username,
    webhook_avatar: m.webhook_avatar,
    imported_from: m.imported_from || undefined,
    reply_to: m.reply_to,
    replyContext,
    reactions: [],
    edited_at: null,
    thread: null,
    fromPuente: true,
  };
  if (rootId) {
    message.thread_id = rootId;
    io.to(`channel:${channel.code}`).emit('new-thread-message', { channelCode: channel.code, parentId: rootId, message });
    const count = db.prepare('SELECT COUNT(*) AS n FROM messages WHERE thread_id = ?').get(rootId).n;
    io.to(`channel:${channel.code}`).emit('thread-updated', {
      channelCode: channel.code, parentId: rootId,
      thread: { count, lastReplyAt: message.created_at, lastReplyId: m.id, senderId: m.user_id, participants: [] },
    });
  } else {
    io.to(`channel:${channel.code}`).emit('new-message', { channelCode: channel.code, message });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// Haven -> Discord
// ══════════════════════════════════════════════════════════════════════════
function hookHavenEmits() {
  for (const method of ['to', 'in']) {
    const orig = io[method].bind(io);
    io[method] = function (room) {
      const op = orig(room);
      const emit = op.emit.bind(op);
      op.emit = function (event, payload, ...rest) {
        try { onHavenEmit(event, payload); } catch (err) { warn('hook:', err.message); }
        // Las reacciones de Discord, persona por persona (un objeto nuevo: el de
        // Haven queda igual para el resto del puente)
        if (event === 'reactions-updated' && payload && payload.messageId && Array.isArray(payload.reactions)) {
          try { payload = { ...payload, reactions: reacciones.expandReactions(payload.messageId, payload.reactions) }; } catch (err) { warn('reacciones:', err.message); }
        }
        return emit(event, payload, ...rest);
      };
      return op;
    };
  }
  // Borrados hechos por una persona en Haven: antes de que Haven borre, se
  // anota a que mensaje de Discord corresponde (despues ya no esta en la base),
  // para borrarlo tambien alla cuando Haven confirme. La limpieza automatica de
  // Haven no pasa por aca, asi que no borra historial de Discord.
  // Una PC con Windows, Linux o ChromeOS (las Mac se deciden en aviso.js: un iPad tambien dice ser Mac)
  const esPC = (socket) => { const ua = String((socket.handshake && socket.handshake.headers['user-agent']) || ''); return /Windows NT|CrOS|X11|Linux x86_64/.test(ua) && !/Android|Mobile/i.test(ua); };
  // Las de Windows (Edge) que ya estaban guardadas: fuera
  try { const n = db.prepare("DELETE FROM push_subscriptions WHERE endpoint LIKE 'https://%.notify.windows.com/%'").run().changes; if (n) log(`sin avisos en la PC: ${n} suscripciones de Windows borradas`); } catch (err) { warn('suscripciones de Windows:', err.message); }
  io.on('connection', socket => {
    socket.use((packet, next) => {
      try {
        const [event, data] = packet;
        // El usuario tecnico que representa a la gente de Discord sin vincular no recibe mensajes directos
        if (data && event === 'start-dm' && Number(data.targetUserId) === (db.prepare("SELECT id FROM users WHERE username = 'discord-historial'").get() || {}).id) {
          socket.emit('error-msg', 'Ese usuario representa a la gente de Discord sin cuenta vinculada: no se le pueden mandar mensajes directos.');
          return;
        }
        // En la PC no hay notificaciones del sistema (aviso.js, puente-sin-avisos-pc): no se guarda su suscripcion
        if (event === 'push-subscribe' && esPC(socket)) {
          if (data && typeof data.endpoint === 'string' && socket.user) db.prepare('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?').run(socket.user.id, data.endpoint);
          return;
        }
        if (data && (event === 'rename-channel' || event === 'set-channel-topic') && typeof data.code === 'string') watchChannelEdit(data.code, socket);
        if (data && event === 'delete-message' && Number.isInteger(data.messageId)) rememberDelete(data.messageId);
        else if (data && event === 'delete-messages' && Array.isArray(data.messageIds)) data.messageIds.slice(0, 500).forEach(id => Number.isInteger(id) && rememberDelete(id));
      } catch (err) { warn('borrados:', err.message); }
      next();
    });
  });
  // Lo mismo en el historial de un canal y de un hilo
  io.on('connection', socket => {
    const emit = socket.emit;
    socket.emit = function (event, payload, ...rest) {
      if ((event === 'message-history' || event === 'thread-messages') && payload && Array.isArray(payload.messages)) {
        try {
          payload = { ...payload, messages: payload.messages.map(m => (m && Array.isArray(m.reactions) && m.reactions.length
            ? { ...m, reactions: reacciones.expandReactions(m.id, m.reactions) } : m)) };
        } catch (err) { warn('reacciones:', err.message); }
      }
      return emit.call(this, event, payload, ...rest);
    };
  });
}

function onHavenEmit(event, p) {
  if (!p || p.fromPuente) return;
  if (event === 'new-message' || event === 'new-thread-message') {
    const m = p.message;
    if (m && m.content) miniaturas.warmFromContent(m.content); // las imagenes livianas, listas antes de que las vean
    if (!m || !m.id || !m.user_id || m.imported_from || m.is_webhook || m.from_discord || insertedByBridge.has(m.id)) return;
    setImmediate(() => outboundCreate(m.id));
  } else if (event === 'message-edited') {
    if (p.messageId) setImmediate(() => outboundEdit(p.messageId));
  } else if (event === 'reactions-updated') {
    if (p.messageId) setImmediate(() => enqueue('react:' + p.messageId, () => reacciones.onHavenReactions(p, m => discordTarget(m))));
  } else if (event === 'message-deleted') {
    if (p.messageId) setImmediate(() => outboundDelete(p.messageId));
  }
}

async function ensureWebhook(discordChannelId) {
  const row = db.prepare('SELECT webhook_id, webhook_token FROM puente_webhooks WHERE discord_channel_id = ?').get(discordChannelId);
  if (row) return row;
  let hook = null;
  const existing = await api('GET', `/channels/${discordChannelId}/webhooks`);
  if (Array.isArray(existing)) hook = existing.find(w => w.name === WEBHOOK_NAME && w.token && w.user && w.user.id === botUserId);
  if (!hook) hook = await api('POST', `/channels/${discordChannelId}/webhooks`, { name: WEBHOOK_NAME });
  if (!hook || hook.__error || !hook.token) { warn(`no pude crear el webhook en ${discordChannelId} (¿falta "Gestionar webhooks"?)`); return null; }
  db.prepare('INSERT OR REPLACE INTO puente_webhooks (discord_channel_id, webhook_id, webhook_token) VALUES (?, ?, ?)').run(discordChannelId, hook.id, hook.token);
  ourWebhookIds.add(hook.id);
  return { webhook_id: hook.id, webhook_token: hook.token };
}

// Texto de Haven -> texto seguro para Discord.
function sanitizeOut(text) {
  return adjuntos.emojisToDiscord(db, enlaces.messageLinksToDiscord(db, publicUrl, guildId, String(text || '')))
    // Nada de menciones escritas a mano: solo el puente pone la de verificacion.
    .replace(/<(@[!&]?|#)(\d+)>/g, (_, k, id) => (k.startsWith('@') ? '@' : '#') + id)
    // Archivos de Haven "[file:nombre](/uploads/x|tamaño)" -> "📎 [nombre](enlace)"
    .replace(/^\[file:([^\]\n]+)\]\((\/uploads\/[^\s|)]+)\|[^)\n]*\)$/gm, (_, name, p) => `📎 [${name}](${publicUrl ? publicUrl + p : p})`)
    // Rutas de archivos subidos a Haven -> enlaces publicos
    .replace(/(^|[\s(])(\/uploads\/[^\s)]+)/g, (_, pre, p) => pre + (publicUrl ? publicUrl + p : p));
}

function webhookName(raw, suffix = '') {
  // Discord no admite "discord" ni "clyde" en nombres de webhook; max. 80 caracteres.
  let name = String(raw || 'Usuario').replace(/discord/gi, 'd1scord').replace(/clyde/gi, 'clyd3').trim() || 'Usuario';
  return ([...name].slice(0, 80 - suffix.length).join('') + suffix).trim();
}

const absolute = url => (!url ? null : /^https?:\/\//.test(url) ? url : (publicUrl ? publicUrl + (url.startsWith('/') ? '' : '/') + url : null));

// En que canal o hilo de Discord va un mensaje de Haven: { channelId, threadId } o null.
async function discordTarget(m) {
  const ch = stmts().channelById.get(m.channel_id);
  if (!ch || !ch.discord_channel_id || !isBridged(ch.discord_channel_id)) return null;
  if (!m.thread_id) return { channelId: ch.discord_channel_id, threadId: null, havenChannel: ch };
  const root = stmts().messageById.get(m.thread_id);
  if (!root || !root.discord_message_id) return null; // el mensaje de origen nunca llego a Discord
  const rootDid = String(root.discord_message_id).replace(/^thread-/, '');
  let th = await discordChannel(rootDid);
  if (!th) {
    // Hilo creado en Haven: crearlo tambien en Discord sobre el mismo mensaje.
    const name = [...String(root.content || 'Hilo').replace(/\s+/g, ' ')].slice(0, 90).join('') || 'Hilo';
    const created = await api('POST', `/channels/${ch.discord_channel_id}/messages/${rootDid}/threads`, { name, auto_archive_duration: 10080 });
    if (created.__error) { warn('no pude crear el hilo en Discord:', created.__error); return null; }
    cacheChannel(created);
    th = discordChannels.get(created.id);
  }
  return { channelId: ch.discord_channel_id, threadId: th.id, havenChannel: ch };
}

// ── Imagenes y archivos de Haven como adjuntos de Discord ──
// Haven guarda una foto con texto como dos mensajes seguidos (el texto y la
// imagen). En Discord van juntos en uno solo, con la imagen adjunta como si se
// hubiera subido ahi: si un mensaje de solo imagenes/archivos llega pocos
// segundos despues de otro de la misma persona en el mismo lugar, se le agrega
// a ese. Lo que pasa el limite de Discord para webhooks sigue yendo como enlace.
const UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
const MERGE_MS = 5000;
const MAX_ATTACHMENTS = 10;
const IMG_LINE = /^(spoiler-img:)?(\/uploads\/\S+)$/;
const FILE_LINE = /^\[file:([^\]\n]+)\]\((\/uploads\/[^\s|)]+)\|[^)\n]*\)$/;
const lastOut = new Map(); // "canal:hilo:usuario" -> { discordId, at, createdAt, attachments }

// Separa las lineas de archivos subidos a Haven del resto del texto.
function splitMedia(content) {
  const text = [], media = [];
  for (const line of String(content || '').split('\n')) {
    const l = line.trim();
    let mm = IMG_LINE.exec(l);
    if (mm) { media.push({ rel: mm[2], name: path.basename(mm[2]), spoiler: !!mm[1], line }); continue; }
    mm = FILE_LINE.exec(l);
    if (mm) { media.push({ rel: mm[2], name: mm[1], spoiler: false, line }); continue; }
    text.push(line);
  }
  return { text: text.join('\n').trim(), media };
}

// Lee los archivos para subirlos a Discord, o null si alguno no esta o se pasa del limite.
function readUploads(media) {
  let total = 0;
  const files = [];
  for (const f of media) {
    const p = path.posix.normalize(path.posix.join('/data', f.rel));
    if (!p.startsWith('/data/uploads/')) return null;
    let st;
    try { st = fs.statSync(p); } catch { return null; }
    total += st.size;
    if (total > UPLOAD_MAX_BYTES || files.length >= MAX_ATTACHMENTS) return null;
    const name = String(f.name).replace(/[^\w.\-]+/g, '_').slice(-100) || 'archivo';
    files.push({ data: fs.readFileSync(p), name: (f.spoiler ? 'SPOILER_' : '') + name });
  }
  return files;
}

const sqlMs = s => new Date(String(s || '').replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(String(s)) ? '' : 'Z')).getTime();
// Firma de los mensajes de cuentas vinculadas (PUENTE_FIRMA, por defecto "✅ desde Haven").
// Puede llevar emojis del servidor como :nombre:, que se pasan al emoji de Discord.
function signature() {
  const raw = String(process.env.PUENTE_FIRMA || '').replace(/[\r\n<>@]/g, '').trim().slice(0, 80);
  return adjuntos.emojisToDiscord(db, raw || '✅ desde Haven');
}
// PUENTE_FIRMA=no: sin la linea de firma (mas discreto; ver PUENTE_MARCA). Igual
// nadie puede hacerse pasar por otro: las cuentas sin vincular siempre llevan
// "· sin verificar" en el nombre, y solo las vinculadas salen con su nombre de Discord.
const footerFor = link => (link && String(process.env.PUENTE_FIRMA || '').trim().toLowerCase() !== 'no'
  ? `\n-# ${signature()} · <@${link.discord_user_id}>` : '');
// Marca junto al nombre de las cuentas vinculadas (PUENTE_MARCA, por ejemplo "✦")
const nameMark = () => { const m = String(process.env.PUENTE_MARCA || '').replace(/[\r\n<>@#:`]/g, '').trim().slice(0, 8); return m ? ' ' + m : ''; };
// Nombre de la app (PUENTE_TITULO si esta configurado)
const appName = () => String(process.env.PUENTE_TITULO || '').replace(/[^\p{L}\p{N} ._!?-]/gu, '').trim().slice(0, 30) || 'Haven';
// Linea de firma (la actual o una de antes): "-# ... · <@id>"
const isFooterLine = l => /^-# .* · <@\d+>$/.test(l);

function saveOut(havenId, discordId, target, attachments, ownId) {
  db.transaction(() => {
    db.prepare('INSERT OR REPLACE INTO puente_salientes (haven_message_id, discord_message_id, discord_channel_id, discord_thread_id) VALUES (?, ?, ?, ?)')
      .run(havenId, discordId, target.channelId, target.threadId);
    if (ownId) db.prepare('UPDATE messages SET discord_message_id = ? WHERE id = ? AND discord_message_id IS NULL').run(discordId, havenId);
    if (attachments && attachments.length) {
      db.prepare('INSERT OR REPLACE INTO puente_adjuntos (haven_message_id, attachment_ids) VALUES (?, ?)').run(havenId, JSON.stringify(attachments));
    }
  })();
}

const sentAlready = (id) => !!(db.prepare('SELECT discord_message_id d FROM messages WHERE id = ?').get(id) || {}).d ||
  !!db.prepare('SELECT 1 FROM puente_salientes WHERE haven_message_id = ? LIMIT 1').get(id);

// Reintento: los mensajes escritos en Haven en las ultimas 24 h que no llegaron a
// Discord (por ejemplo, porque al bot le faltaba un permiso en ese canal) se
// mandan en orden cada 5 minutos, hasta que salgan. Los que ya salieron quedan
// anotados (puente_salientes), asi que nunca se repiten.
function retryMissing() {
  try {
    const rows = db.prepare(`SELECT m.id FROM messages m JOIN channels c ON c.id = m.channel_id
      WHERE c.discord_channel_id IS NOT NULL AND c.discord_channel_id != '' AND c.is_dm = 0
        AND m.user_id IS NOT NULL AND m.imported_from IS NULL AND (m.is_webhook IS NULL OR m.is_webhook = 0)
        AND m.discord_message_id IS NULL
        AND m.created_at > datetime('now', '-1 day') AND m.created_at < datetime('now', '-1 minute')
        AND NOT EXISTS (SELECT 1 FROM puente_salientes s WHERE s.haven_message_id = m.id)
      ORDER BY m.id LIMIT 200`).all();
    if (rows.length) log(`reintentando ${rows.length} mensaje(s) que no llegaron a Discord`);
    for (const r of rows) outboundCreate(r.id).catch(err => warn('reintento:', err.message));
  } catch (err) { warn('reintento:', err.message); }
}

// Los webhooks no pueden responder de verdad en Discord: arriba del mensaje va una
// linea chiquita con a quien responde, el comienzo de ese mensaje y el enlace a el.
function replyHeader(m, channelId, threadId) {
  if (!m.reply_to) return '';
  const p = stmts().messageById.get(m.reply_to);
  if (!p) return '';
  const who = p.imported_from ? (p.webhook_username || 'alguien') : (p.uname || 'alguien');
  let did = p.discord_message_id;
  if (!did) { const o = db.prepare('SELECT discord_message_id FROM puente_salientes WHERE haven_message_id = ?').get(p.id); did = o && o.discord_message_id; }
  const jump = did && /^\d+$/.test(did) && guildId ? ` · https://discord.com/channels/${guildId}/${threadId || channelId}/${did}` : '';
  const { text, media } = splitMedia(p.content);
  let snip = sanitizeOut(text).replace(/https?:\/\/\S+/g, '🔗').replace(/[*_~`|\\]/g, '').replace(/\s+/g, ' ').trim();
  if ([...snip].length > 70) snip = [...snip].slice(0, 70).join('').trim() + '…';
  if (!snip && media.length) snip = '📎 archivo';
  return `-# ↪ respondiendo a **${webhookName(who)}**${snip ? ': ' + snip : ''}${jump}\n`;
}

async function outboundCreate(havenMessageId) {
  const m = stmts().messageById.get(havenMessageId);
  if (!m || !m.user_id || m.imported_from || m.is_webhook || m.discord_message_id) return;
  const target = await discordTarget(m);
  if (!target) return;
  const link = stmts().linkByHaven.get(m.user_id);
  if (!link && unlinkedPolicy === 'bloquear') return;

  return enqueue('out:' + target.channelId, async () => {
    // Ya salio mientras esperaba en la fila (por ejemplo, lo mando el reintento): no repetir
    if (sentAlready(m.id)) return;
    const hook = await ensureWebhook(target.channelId);
    if (!hook) { vigia.deliveryFailed(target.channelId, 'el bot no puede crear su webhook en el canal'); return; }
    const key = `${target.channelId}:${target.threadId || ''}:${m.user_id}`;
    const { text, media } = splitMedia(m.content);
    const files = media.length ? readUploads(media) : null;
    const threadQs = target.threadId ? `thread_id=${target.threadId}` : '';

    // Solo imagenes/archivos, justo despues de otro mensaje suyo: se agregan a ese
    const prev = lastOut.get(key);
    if (files && files.length && !text && !m.reply_to && prev && Date.now() - prev.at < MERGE_MS * 2 &&
        Math.abs(sqlMs(m.created_at) - prev.createdAt) <= MERGE_MS && prev.attachments.length + files.length <= MAX_ATTACHMENTS) {
      const payload = { attachments: [...prev.attachments.map(id => ({ id })), ...files.map((f, i) => ({ id: i, filename: f.name }))] };
      const r = await apiFiles('PATCH', `/webhooks/${hook.webhook_id}/${hook.webhook_token}/messages/${prev.discordId}${threadQs ? '?' + threadQs : ''}`, payload, files);
      if (!r.__error && Array.isArray(r.attachments)) {
        const added = r.attachments.map(a => a.id).filter(id => !prev.attachments.includes(id));
        prev.attachments = r.attachments.map(a => a.id);
        prev.at = Date.now();
        saveOut(m.id, prev.discordId, target, added, false);
        return;
      }
      warn(`no pude agregar la imagen ${m.id} al mensaje anterior en Discord:`, r.__error, '- va aparte');
    }

    // Texto: sin las lineas de archivos que se suben como adjuntos
    let content = replyHeader(m, target.channelId, target.threadId) + sanitizeOut(files && files.length ? text : m.content);
    content = (content + footerFor(link)).trim();
    if (content.length > 1990) content = content.slice(0, 1985) + ' […]';

    const body = {
      content,
      username: link ? webhookName(link.discord_global_name || link.discord_username, nameMark()) : webhookName(m.uname, `${nameMark()} · sin verificar`),
      avatar_url: link ? (link.discord_avatar ? `https://cdn.discordapp.com/avatars/${link.discord_user_id}/${link.discord_avatar}.png?size=128` : undefined) : (absolute(m.uavatar) || undefined),
      allowed_mentions: { parse: [] }, // nunca notifica a nadie (ni @everyone, ni @here)
    };
    const url = `/webhooks/${hook.webhook_id}/${hook.webhook_token}?wait=true${threadQs ? '&' + threadQs : ''}`;
    let sent;
    if (files && files.length) {
      sent = await apiFiles('POST', url, { ...body, attachments: files.map((f, i) => ({ id: i, filename: f.name })) }, files);
      if (sent.__error) { // por ejemplo, Discord rechazo el archivo: va como enlace
        warn(`no pude subir los archivos del mensaje ${m.id} a Discord (${sent.__error}); van como enlace`);
        let c = replyHeader(m, target.channelId, target.threadId) + sanitizeOut(m.content) + footerFor(link);
        if (c.length > 1990) c = c.slice(0, 1985) + ' […]';
        sent = await api('POST', url, { ...body, content: c });
      }
    } else {
      sent = await api('POST', url, body);
    }
    if (sent.__error) {
      if (sent.__error === 404) db.prepare('DELETE FROM puente_webhooks WHERE discord_channel_id = ?').run(target.channelId); // lo borraron: se recrea
      warn(`no pude publicar el mensaje ${m.id} en Discord:`, sent.__error, JSON.stringify(sent.__body || '').slice(0, 200));
      vigia.deliveryFailed(target.channelId, 'Discord respondió ' + sent.__error);
      return;
    }
    const attachments = (sent.attachments || []).map(a => a.id);
    saveOut(m.id, sent.id, target, attachments, true);
    if (Array.isArray(sent.embeds) && sent.embeds.length) embeds.capture(m.id, sent.embeds);
    lastOut.set(key, { discordId: sent.id, at: Date.now(), createdAt: sqlMs(m.created_at), attachments });
    if (lastOut.size > 500) lastOut.delete(lastOut.keys().next().value);
  });
}

async function outboundEdit(havenMessageId) {
  const out = db.prepare('SELECT * FROM puente_salientes WHERE haven_message_id = ?').get(havenMessageId);
  if (!out) return;
  const m = stmts().messageById.get(havenMessageId);
  if (!m) return;
  const uploaded = db.prepare('SELECT 1 FROM puente_adjuntos WHERE haven_message_id = ?').get(havenMessageId);
  const { text } = splitMedia(m.content);
  if (uploaded && !text) return; // solo imagenes: no hay texto que cambiar
  return enqueue('out:' + out.discord_channel_id, async () => {
    const hook = await ensureWebhook(out.discord_channel_id);
    if (!hook) return;
    const link = stmts().linkByHaven.get(m.user_id);
    // La linea de "respondiendo a" tambien va al editar (si no, la edicion la borra en Discord)
    let content = (replyHeader(m, out.discord_channel_id, out.discord_thread_id) + sanitizeOut(uploaded ? text : m.content) + footerFor(link)).trim();
    if (content.length > 1990) content = content.slice(0, 1985) + ' […]';
    const qs = out.discord_thread_id ? `?thread_id=${out.discord_thread_id}` : '';
    // Sin "attachments": Discord deja los adjuntos que ya tiene el mensaje
    const r = await api('PATCH', `/webhooks/${hook.webhook_id}/${hook.webhook_token}/messages/${out.discord_message_id}${qs}`, { content, allowed_mentions: { parse: [] } });
    if (r.__error) warn(`no pude editar en Discord el mensaje ${havenMessageId}:`, r.__error);
  });
}

// Mensajes que vinieron de Discord y alguien esta borrando en Haven:
// id de Haven -> { did, channel (canal o hilo de Discord), at }
// Nombre y tema de un canal cambiados en Haven: lo mismo en Discord. Se mira el
// canal antes y despues de que Haven procese el pedido (Haven ya revisa los
// permisos); si cambio, el bot lo cambia alla. Discord deja cambiar el nombre o
// el tema de un canal solo 2 veces cada 10 minutos: si se pasa, se espera.
function watchChannelEdit(code, socket) {
  const sel = db.prepare('SELECT name, topic, discord_channel_id FROM channels WHERE code = ? AND is_dm = 0');
  const before = sel.get(code.trim());
  if (!before || !before.discord_channel_id || !isBridged(before.discord_channel_id)) return;
  setTimeout(() => {
    try {
      const after = sel.get(code.trim());
      if (!after || after.discord_channel_id !== before.discord_channel_id) return;
      const body = {};
      if (after.name !== before.name && after.name) body.name = after.name;
      if ((after.topic || '') !== (before.topic || '')) body.topic = (after.topic || '').slice(0, 1024);
      if (!Object.keys(body).length) return;
      enqueue('canal:' + after.discord_channel_id, async () => {
        const r = await api('PATCH', `/channels/${after.discord_channel_id}`, body);
        if (r && r.__error) {
          warn(`no se pudo cambiar el canal en Discord (${r.__error}):`, JSON.stringify(r.__body || {}).slice(0, 200));
          const why = r.__error === 403 ? 'el bot no tiene el permiso "Gestionar canales" en Discord'
            : r.__error === 429 ? 'Discord deja cambiar el nombre o el tema solo 2 veces cada 10 minutos' : 'Discord respondió ' + r.__error;
          try { socket.emit('error-msg', 'Se cambió en CV Chat, pero no en Discord: ' + why + '.'); } catch { /* sesion cerrada */ }
        } else log(`canal ${after.discord_channel_id} cambiado en Discord:`, Object.keys(body).join(', '));
      });
    } catch (err) { warn('cambio de canal:', err.message); }
  }, 500);
}

// Tema cambiado en Discord: lo mismo en Haven (el nombre ya lo hace estadisticas.js)
function onDiscordTopic(d) {
  if (!d || !d.id || typeof d.topic === 'undefined') return;
  const ch = db.prepare('SELECT id, code, topic FROM channels WHERE discord_channel_id = ? AND is_dm = 0').get(d.id);
  if (!ch) return;
  const topic = [...(d.topic || '')].slice(0, 256).join('');
  if ((ch.topic || '') === topic) return;
  db.prepare('UPDATE channels SET topic = ? WHERE id = ?').run(topic, ch.id);
  try { io.to(`channel:${ch.code}`).emit('channel-topic-changed', { code: ch.code, topic }); } catch { /* sin sesiones */ }
}

const pendingDeletes = new Map();
function rememberDelete(havenId) {
  const m = db.prepare(`SELECT m.discord_message_id did, m.thread_id, c.discord_channel_id ch FROM messages m
    JOIN channels c ON c.id = m.channel_id WHERE m.id = ?`).get(havenId);
  if (!m || !m.did || !/^\d+$/.test(String(m.did)) || !m.ch || !isBridged(m.ch)) return;
  if (db.prepare('SELECT 1 FROM puente_salientes WHERE haven_message_id = ?').get(havenId)) return; // salio de Haven: lo borra el webhook
  let channel = m.ch;
  if (m.thread_id) {
    const root = db.prepare('SELECT discord_message_id did FROM messages WHERE id = ?').get(m.thread_id);
    if (!root || !root.did) return;
    channel = String(root.did).replace(/^thread-/, '');
  }
  const now = Date.now();
  for (const [k, v] of pendingDeletes) if (now - v.at > 120000) pendingDeletes.delete(k);
  pendingDeletes.set(havenId, { did: String(m.did), channel, parent: m.ch, at: now });
}

async function outboundDelete(havenMessageId) {
  const out = db.prepare('SELECT * FROM puente_salientes WHERE haven_message_id = ?').get(havenMessageId);
  if (!out) {
    // Vino de Discord y una persona lo borro en Haven: borrarlo tambien en Discord
    const p = pendingDeletes.get(havenMessageId);
    if (!p) return;
    pendingDeletes.delete(havenMessageId);
    return enqueue('out:' + p.parent, async () => {
      const r = await api('DELETE', `/channels/${p.channel}/messages/${p.did}`);
      if (r && r.__error && r.__error !== 404) {
        warn(`no pude borrar en Discord el mensaje ${p.did}:`, r.__error, r.__error === 403 ? '(al bot le falta "Gestionar mensajes" en ese canal)' : '');
      }
    });
  }
  return enqueue('out:' + out.discord_channel_id, async () => {
    const hook = await ensureWebhook(out.discord_channel_id);
    if (!hook) return;
    const qs = out.discord_thread_id ? `?thread_id=${out.discord_thread_id}` : '';
    const msgUrl = `/webhooks/${hook.webhook_id}/${hook.webhook_token}/messages/${out.discord_message_id}${qs}`;
    const others = db.prepare('SELECT COUNT(*) n FROM puente_salientes WHERE discord_message_id = ? AND haven_message_id != ?').get(out.discord_message_id, havenMessageId).n;
    const mine = JSON.parse((db.prepare('SELECT attachment_ids FROM puente_adjuntos WHERE haven_message_id = ?').get(havenMessageId) || {}).attachment_ids || '[]');
    let r;
    if (others) {
      // El mensaje de Discord tambien lleva otro de Haven (texto + imagen): se
      // saca solo la parte borrada.
      const cur = await api('GET', msgUrl);
      if (cur && !cur.__error) {
        const body = mine.length
          ? { attachments: (cur.attachments || []).filter(a => !mine.includes(a.id)).map(a => ({ id: a.id })) }
          : { content: ((cur.content || '').split('\n').filter(isFooterLine).pop() || '') };
        r = await api('PATCH', msgUrl, { ...body, allowed_mentions: { parse: [] } });
      }
    } else {
      r = await api('DELETE', msgUrl);
    }
    if (r && r.__error && r.__error !== 404) warn(`no pude borrar en Discord el mensaje ${havenMessageId}:`, r.__error);
    db.prepare('DELETE FROM puente_salientes WHERE haven_message_id = ?').run(havenMessageId);
    db.prepare('DELETE FROM puente_adjuntos WHERE haven_message_id = ?').run(havenMessageId);
  });
}

module.exports = { start };
