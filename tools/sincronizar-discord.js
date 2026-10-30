// Sincroniza un servidor de Discord con Haven, solo en sentido Discord -> Haven.
//
//  - La primera vez importa todo el historial de todos los canales que el bot
//    Ferry puede leer, con los hilos dentro de su canal (y las publicaciones de
//    foro como temas del foro) y los canales privados ya marcados como privados.
//  - Las siguientes veces trae solo los mensajes nuevos de cada canal e hilo.
//
// Escribe los mensajes con el mismo formato que el importador oficial de Haven
// (imported_from = 'discord' y el ID de Discord guardado), asi que nunca
// duplica: ni consigo mismo ni con lo importado desde la interfaz.
// No publica nada en Discord: solo lee.
//
// Uso (dentro del contenedor de Haven, con Haven encendido):
//   node sincronizar-discord.js            -> sincroniza (revisa hilos archivados cada 6 h)
//   node sincronizar-discord.js --completo -> fuerza revisar tambien todos los hilos archivados
//   node sincronizar-discord.js --orden    -> ademas copia categorias y orden de TODOS los
//                                             canales desde Discord (pisa el orden de Haven)
// Los canales nuevos siempre se crean en su categoria y posicion de Discord.
//
// Limitaciones: no sincroniza ediciones ni borrados hechos en Discord despues
// de traer un mensaje, ni hilos privados (Haven no tiene hilos privados).

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Database = require('/app/node_modules/better-sqlite3');
const adjuntos = require(path.join(__dirname, 'puente', 'adjuntos.js'));

const DB_PATH = process.env.HAVEN_DB || '/data/haven.db';
const ESTADO_PATH = path.join(__dirname, 'sincronizacion-estado.json');
const BACKUP_DIR = '/data/backups';
const API = 'https://discord.com/api/v10';
const CONCURRENCY = 4;               // Discord limita por canal: 4 a la vez es seguro
const DOWNLOADS_AT_ONCE = 16;        // adjuntos descargados a la vez por canal
const ARCHIVED_EVERY_MS = 6 * 3600e3; // cada cuanto revisar hilos archivados
// --rehacer: vuelve a leer TODO el historial y corrige el texto de los mensajes
// ya guardados que vinieron de Discord (por ejemplo, despues de cambiar
// buildContent). No toca mensajes escritos en Haven. Implica --completo.
// --rehacer-pendientes: igual, pero en cada canal o hilo empieza por el primer
// mensaje que todavia tiene un adjunto sin copiar ("📎 [nombre](enlace)") y
// se saltea los que no tienen nada pendiente. Sirve para retomar un --rehacer
// cortado sin volver a leer lo que ya se corrigio.
const PENDING_ONLY = process.argv.includes('--rehacer-pendientes');
const REBUILD = PENDING_ONLY || process.argv.includes('--rehacer');
const FULL = REBUILD || process.argv.includes('--completo');
const LAYOUT_ALL = process.argv.includes('--orden');
let rebuilt = 0;

const TEXT_TYPES = new Set([0, 5]);       // texto, anuncios
const FORUM_TYPES = new Set([15, 16]);    // foro, media
const PUBLIC_THREAD_TYPES = new Set([10, 11]);
const PRIVATE_THREAD = 12;
const VIEW_CHANNEL = 1024n;

const log = (...a) => console.log(new Date().toISOString().slice(0, 19).replace('T', ' '), ...a);

const db = new Database(DB_PATH);
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 60000');

const tokenRow = db.prepare("SELECT value FROM server_settings WHERE key = 'ferry_bot_token'").get();
if (!tokenRow || !tokenRow.value) { log('No hay token de Ferry configurado en Haven.'); process.exit(1); }
const headers = { Authorization: `Bot ${tokenRow.value}`, 'User-Agent': 'HavenDiscordSync (local, 1.0)' };

const adminName = process.env.ADMIN_USERNAME;
const admin = adminName && db.prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE').get(adminName);
if (!admin) { log(`No encuentro al usuario admin "${adminName}" en Haven.`); process.exit(1); }
// Los mensajes de Discord van a nombre de un usuario tecnico sin permisos (no del admin):
// asi no salen con la etiqueta ADMIN y no rompen el conteo de no leidos del admin.
const ghost = db.prepare("SELECT id FROM users WHERE username = 'discord-historial'").get() || admin;

let estado = {};
try { estado = JSON.parse(fs.readFileSync(ESTADO_PATH, 'utf8')); } catch { /* primera vez */ }
const saveEstado = () => fs.writeFileSync(ESTADO_PATH, JSON.stringify(estado, null, 2));

// ── Discord ──────────────────────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function api(endpoint, attempt = 0) {
  let res;
  try {
    res = await fetch(API + endpoint, { headers, signal: AbortSignal.timeout(30000) });
  } catch (err) {
    if (attempt < 5) { await sleep(2000 * (attempt + 1)); return api(endpoint, attempt + 1); }
    throw err;
  }
  if (res.status === 401) throw new Error('Discord rechazo el token del bot Ferry.');
  if (res.status === 429 && attempt < 8) {
    let wait = parseFloat(res.headers.get('retry-after') || '2');
    try { wait = (await res.json()).retry_after ?? wait; } catch { /* sin cuerpo */ }
    await sleep(wait * 1000 + 250);
    return api(endpoint, attempt + 1);
  }
  if (res.status >= 500 && attempt < 5) { await sleep(2000 * (attempt + 1)); return api(endpoint, attempt + 1); }
  if (!res.ok) return { __error: res.status };
  // Si se agoto el cupo de este canal, esperar antes de la siguiente peticion.
  if (res.headers.get('x-ratelimit-remaining') === '0') {
    await sleep(parseFloat(res.headers.get('x-ratelimit-reset-after') || '1') * 1000);
  }
  return res.json();
}

const big = id => BigInt(id);
const isNewer = (a, b) => !b || big(a) > big(b);
function snowflakeToSql(id) {
  const ms = Number((big(id) >> 22n) + 1420070400000n);
  return new Date(ms).toISOString().replace('T', ' ').replace('Z', '');
}
function toSqlTs(iso, fallbackId) {
  const d = new Date(iso);
  return isNaN(d) ? snowflakeToSql(fallbackId) : d.toISOString().replace('T', ' ').replace('Z', '');
}
function hiddenFromEveryone(ch, guildId) {
  const ow = (ch.permission_overwrites || []).find(o => o.id === guildId && Number(o.type) === 0);
  return !!ow && (BigInt(ow.deny || '0') & VIEW_CHANNEL) !== 0n;
}

// Como el importador oficial de Haven, salvo por los embeds: en mensajes de
// personas son siempre la vista previa de un enlace del texto, y Haven genera la
// suya (ver buildContent en puente/puente.js). Solo en mensajes de bots y
// webhooks el embed es parte del mensaje.
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

// ── Haven ────────────────────────────────────────────────────────────────
const q = {
  channelByDiscord: db.prepare('SELECT id, name, is_forum FROM channels WHERE discord_channel_id = ?'),
  codeTaken: db.prepare('SELECT 1 FROM channels WHERE code = ?'),
  insertChannel: db.prepare('INSERT INTO channels (name, code, created_by, topic, discord_channel_id, is_private, is_forum) VALUES (?, ?, ?, ?, ?, ?, ?)'),
  joinAdmin: db.prepare('INSERT OR IGNORE INTO channel_members (channel_id, user_id) VALUES (?, ?)'),
  byDiscordId: db.prepare('SELECT id, channel_id FROM messages WHERE discord_message_id = ?'),
  insertMsg: db.prepare(`
    INSERT OR IGNORE INTO messages (channel_id, user_id, content, created_at, webhook_username, webhook_avatar, is_webhook, imported_from, reply_to, discord_message_id, thread_id, title)
    VALUES (?, ?, ?, ?, ?, ?, 0, 'discord', ?, ?, ?, ?)`),
  pin: db.prepare('INSERT INTO pinned_messages (message_id, channel_id, pinned_by) VALUES (?, ?, ?)'),
  reaction: db.prepare('INSERT OR IGNORE INTO reactions (message_id, user_id, emoji) VALUES (?, ?, ?)'),
  lastInChannel: db.prepare(`SELECT discord_message_id AS d FROM messages
    WHERE channel_id = ? AND thread_id IS NULL AND discord_message_id GLOB '[0-9]*'
    ORDER BY length(discord_message_id) DESC, discord_message_id DESC LIMIT 1`),
  lastInThread: db.prepare(`SELECT discord_message_id AS d FROM messages
    WHERE thread_id = ? AND discord_message_id GLOB '[0-9]*'
    ORDER BY length(discord_message_id) DESC, discord_message_id DESC LIMIT 1`),
  // Para --rehacer-pendientes: el mensaje mas viejo con un adjunto sin copiar
  // ("📎 [nombre](enlace de Discord)"; no los enlaces a Discord pegados como texto).
  firstPendingInChannel: db.prepare(`SELECT discord_message_id AS d FROM messages
    WHERE channel_id = ? AND thread_id IS NULL AND discord_message_id GLOB '[0-9]*' AND content LIKE '%📎 [%](https://cdn.discordapp.com/attachments/%'
    ORDER BY length(discord_message_id), discord_message_id LIMIT 1`),
  firstPendingInThread: db.prepare(`SELECT discord_message_id AS d FROM messages
    WHERE thread_id = ? AND discord_message_id GLOB '[0-9]*' AND content LIKE '%📎 [%](https://cdn.discordapp.com/attachments/%'
    ORDER BY length(discord_message_id), discord_message_id LIMIT 1`),
};

const createdThisRun = [];
function ensureChannel(ch, guildId) {
  const existing = q.channelByDiscord.get(ch.id);
  if (existing) return existing.id;
  let code;
  do { code = crypto.randomBytes(4).toString('hex'); } while (q.codeTaken.get(code));
  // En el periodo de migracion (PUENTE_ACCESO=vinculados) todo canal de Discord es privado:
  // el puente da acceso segun los permisos de Discord de cada cuenta vinculada.
  const isPrivate = (process.env.PUENTE_ACCESO === 'vinculados' || hiddenFromEveryone(ch, guildId)) ? 1 : 0;
  const isForum = FORUM_TYPES.has(ch.type) ? 1 : 0;
  const id = db.transaction(() => {
    const newId = q.insertChannel.run([...ch.name].slice(0, 50).join(''), code, admin.id, ch.topic || '', ch.id, isPrivate, isForum).lastInsertRowid;
    q.joinAdmin.run(newId, admin.id);
    return newId;
  })();
  log(`+ canal nuevo #${ch.name}${isPrivate ? ' (privado)' : ''}${isForum ? ' (foro)' : ''}`);
  createdThisRun.push(ch.id);
  return id;
}

// Tablas del puente (puente/vincular.js): autor de Discord de cada mensaje y
// cuentas vinculadas. Si el puente nunca arranco, no existen y se omiten.
try {
  q.author = db.prepare('INSERT OR IGNORE INTO puente_autores (message_id, discord_user_id) VALUES (?, ?)');
  q.linkOf = db.prepare('SELECT haven_user_id FROM puente_vinculos WHERE discord_user_id = ?');
  q.insertLinked = db.prepare(`
    INSERT OR IGNORE INTO messages (channel_id, user_id, content, created_at, webhook_username, webhook_avatar, is_webhook, reply_to, discord_message_id, thread_id)
    VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`);
} catch { /* sin puente */ }
// Tambien quien desvinculo su Discord: el historial sigue siendo suyo (puente_historial)
try {
  const st = db.prepare(`SELECT haven_user_id FROM puente_vinculos WHERE discord_user_id = ?
    UNION ALL SELECT haven_user_id FROM puente_historial WHERE discord_user_id = ? LIMIT 1`);
  q.linkOf = { get: (id) => st.get(id, id) };
} catch { /* puente sin puente_historial todavia */ }

// Para --rehacer: el mensaje ya guardado con ese ID de Discord, salvo los que
// salieron de Haven (puente_salientes), cuyo texto es el de Haven.
try {
  q.rowForRebuild = db.prepare(`SELECT m.id, m.content FROM messages m WHERE m.discord_message_id = ?
    AND NOT EXISTS (SELECT 1 FROM puente_salientes s WHERE s.haven_message_id = m.id)`);
} catch {
  q.rowForRebuild = db.prepare('SELECT id, content FROM messages WHERE discord_message_id = ?');
}
q.setContent = db.prepare('UPDATE messages SET content = ? WHERE id = ?');

// Guarda una pagina de mensajes de Discord. `threadRoot` es el mensaje de Haven
// del que cuelgan (null para mensajes normales del canal).
const insertPage = db.transaction((msgs, channelId, threadRoot, attByMsg) => {
  let n = 0;
  for (const msg of msgs) {
    if (msg.type !== 0 && msg.type !== 19) continue; // normales y respuestas, como el importador
    const content = buildContent(msg, attByMsg && attByMsg.get(msg.id));
    if (!content) continue;
    // --rehacer solo corrige mensajes que ya estan: uno viejo agregado ahora se
    // veria al final del canal (Haven ordena por orden de llegada a su base).
    if (REBUILD) {
      const row = q.rowForRebuild && q.rowForRebuild.get(msg.id);
      if (row && row.content !== content) { q.setContent.run(content, row.id); rebuilt++; }
      continue;
    }
    // message_reference de tipo 1 es un reenvio, no una respuesta.
    const ref = msg.message_reference && msg.message_reference.type !== 1 ? msg.message_reference.message_id : null;
    const replyTo = ref ? (q.byDiscordId.get(ref)?.id ?? null) : null;
    const author = msg.author?.global_name || msg.author?.username || 'Unknown';
    const avatar = msg.author?.avatar ? `https://cdn.discordapp.com/avatars/${msg.author.id}/${msg.author.avatar}.png?size=64` : null;
    const link = !msg.webhook_id && msg.author && q.linkOf ? q.linkOf.get(msg.author.id) : null;
    // Cuenta vinculada: sin el nombre de Discord en el mensaje, asi se ve con el de la cuenta (puente/nombres.js)
    const r = link
      ? q.insertLinked.run(channelId, link.haven_user_id, content, toSqlTs(msg.timestamp, msg.id), null, avatar, replyTo, msg.id, threadRoot)
      : q.insertMsg.run(channelId, ghost.id, content, toSqlTs(msg.timestamp, msg.id), author, avatar, replyTo, msg.id, threadRoot, null);
    if (!r.changes) {
      if (REBUILD && q.rowForRebuild) {
        const row = q.rowForRebuild.get(msg.id);
        if (row && row.content !== content) { q.setContent.run(content, row.id); rebuilt++; }
      }
      continue;
    }
    n++;
    if (!msg.webhook_id && msg.author && q.author) q.author.run(r.lastInsertRowid, msg.author.id);
    if (msg.pinned) { try { q.pin.run(r.lastInsertRowid, channelId, admin.id); } catch { /* ya fijado */ } }
    for (const re of msg.reactions || []) {
      const key = adjuntos.reactionKey(db, re.emoji);
      if (key) { try { q.reaction.run(r.lastInsertRowid, ghost.id, key); } catch { /* cosmetico */ } }
    }
  }
  return n;
});

// Trae todos los mensajes posteriores a `after`, de los mas viejos a los nuevos,
// guardando de a 100. Devuelve cuantos guardo, o null si el bot no puede leerlo.
async function pullMessages(discordChannelId, after, channelId, threadRoot, skipId = null) {
  let total = 0;
  let cursor = after || '0';
  for (;;) {
    const page = await api(`/channels/${discordChannelId}/messages?limit=100&after=${cursor}`);
    if (page.__error) return page.__error === 403 || page.__error === 404 ? null : total;
    if (!page.length) break;
    page.sort((a, b) => (big(a.id) < big(b.id) ? -1 : 1));
    const msgs = skipId ? page.filter(m => m.id !== skipId) : page;
    // Los adjuntos se descargan antes de la transaccion (que tiene que ser corta).
    // Varias descargas a la vez (de un CDN, no de la API de Discord, asi que no
    // cuentan para los limites del bot).
    const attByMsg = new Map();
    const withFiles = msgs.filter(m => (m.attachments && m.attachments.length) ||
      (m.message_snapshots || []).some(s => s.message && s.message.attachments && s.message.attachments.length));
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(DOWNLOADS_AT_ONCE, withFiles.length) }, async () => {
      while (next < withFiles.length) {
        const m = withFiles[next++];
        attByMsg.set(m.id, await adjuntos.localizeAll(m));
      }
    }));
    total += insertPage(msgs, channelId, threadRoot, attByMsg);
    cursor = page[page.length - 1].id;
    if (page.length < 100) break;
  }
  return total;
}

// El mensaje de Haven del que cuelga un hilo. En canales normales es el mensaje
// del canal que inicio el hilo (mismo ID que el hilo); si no existe, se crea uno
// marcado 'thread-<id>' (igual que hilos-discord.js). En foros es el primer
// mensaje de la publicacion, convertido en tema con titulo.
async function threadRoot(th, parentChannelId, parentIsForum) {
  const found = q.byDiscordId.get(th.id) || q.byDiscordId.get(`thread-${th.id}`);
  if (found) return found.id;
  if (!parentIsForum) {
    return q.insertMsg.run(parentChannelId, ghost.id, `🧵 **${th.name}**`, snowflakeToSql(th.id), 'Discord', null, null, `thread-${th.id}`, null, null).lastInsertRowid;
  }
  const starter = await api(`/channels/${th.id}/messages/${th.id}`);
  if (!starter.__error) {
    const content = buildContent(starter, await adjuntos.localizeAll(starter)) || th.name;
    const author = starter.author?.global_name || starter.author?.username || 'Unknown';
    const avatar = starter.author?.avatar ? `https://cdn.discordapp.com/avatars/${starter.author.id}/${starter.author.avatar}.png?size=64` : null;
    return q.insertMsg.run(parentChannelId, ghost.id, content, toSqlTs(starter.timestamp, th.id), author, avatar, null, th.id, null, th.name).lastInsertRowid;
  }
  return q.insertMsg.run(parentChannelId, ghost.id, th.name, snowflakeToSql(th.id), 'Discord', null, null, `thread-${th.id}`, null, th.name).lastInsertRowid;
}

// ── Categorias y orden ───────────────────────────────────────────────────
// Haven agrupa por la etiqueta `category` (max. 30 caracteres), ordena las
// categorias segun el ajuste channel_cat_order y los canales por `position`.
const CATEGORY = 4;
function discordLayout(all) {
  const cats = all.filter(c => c.type === CATEGORY).sort((a, b) => a.position - b.position || (big(a.id) < big(b.id) ? -1 : 1));
  const catName = new Map(cats.map(c => [c.id, [...c.name].slice(0, 30).join('')]));
  const rank = c => (c.parent_id ? cats.findIndex(k => k.id === c.parent_id) : -1);
  // Como Discord: primero los canales sin categoria, luego cada categoria en orden.
  const ordered = all.filter(c => c.type !== CATEGORY)
    .sort((a, b) => rank(a) - rank(b) || a.position - b.position || (big(a.id) < big(b.id) ? -1 : 1));
  const layout = new Map();
  ordered.forEach((c, i) => layout.set(c.id, { category: catName.get(c.parent_id) || null, position: i + 1 }));
  return { layout, catOrder: [...cats.map(c => catName.get(c.id)), '__untagged__'] };
}
const setLayout = db.prepare('UPDATE channels SET category = ?, position = ? WHERE discord_channel_id = ?');
const setSetting = db.prepare('INSERT OR REPLACE INTO server_settings (key, value) VALUES (?, ?)');

async function runPool(items, fn) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++];
      try { await fn(item); } catch (err) { log(`! error en "${item.name}": ${err.message}`); }
    }
  }));
}

async function findGuildId() {
  if (process.env.DISCORD_GUILD_ID) return process.env.DISCORD_GUILD_ID;
  const known = db.prepare('SELECT discord_channel_id AS d FROM channels WHERE discord_channel_id IS NOT NULL LIMIT 1').get();
  if (known) { const ch = await api(`/channels/${known.d}`); if (ch.guild_id) return ch.guild_id; }
  const guilds = await api('/users/@me/guilds');
  if (Array.isArray(guilds) && guilds.length === 1) return guilds[0].id;
  throw new Error('No se en que servidor de Discord trabajar: define DISCORD_GUILD_ID.');
}

async function main() {
  const started = Date.now();
  const guildId = await findGuildId();
  const firstRun = !estado.ultimaSincronizacion;

  if (firstRun) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const backupPath = `${BACKUP_DIR}/antes-de-sincronizar-${new Date().toISOString().replace(/[:.]/g, '-')}.db`;
    await db.backup(backupPath);
    log(`Primera sincronizacion. Copia de seguridad: ${backupPath}`);
  }

  const all = await api(`/guilds/${guildId}/channels`);
  if (all.__error) throw new Error(`Discord respondio ${all.__error} al listar canales.`);
  // SYNC_SOLO=nombre1,nombre2 limita la sincronizacion a esos canales (para pruebas).
  const only = process.env.SYNC_SOLO ? new Set(process.env.SYNC_SOLO.split(',')) : null;
  const wanted = c => !only || only.has(c.name);
  const textChannels = all.filter(c => TEXT_TYPES.has(c.type) && wanted(c));
  const forums = all.filter(c => FORUM_TYPES.has(c.type) && wanted(c));
  const byId = new Map(all.map(c => [c.id, c]));

  // 1) Canales de texto: lo nuevo desde el ultimo mensaje guardado.
  let saved = 0;
  const skipped = [];
  await runPool(textChannels, async ch => {
    const existing = q.channelByDiscord.get(ch.id);
    let last = REBUILD ? null : existing ? q.lastInChannel.get(existing.id)?.d : null;
    if (PENDING_ONLY) {
      const first = existing && q.firstPendingInChannel.get(existing.id);
      if (!first) return; // nada pendiente en este canal
      last = (big(first.d) - 1n).toString();
    }
    if (!REBUILD && existing && last && ch.last_message_id && !isNewer(ch.last_message_id, last)) return; // al dia
    // No crear canales que el bot no puede leer: probar antes de crearlo.
    if (!existing) {
      const probe = await api(`/channels/${ch.id}/messages?limit=1`);
      if (probe.__error) { skipped.push(ch.name); return; }
    }
    const channelId = ensureChannel(ch, guildId);
    const n = await pullMessages(ch.id, last, channelId, null);
    if (n === null) { skipped.push(ch.name); return; }
    if (n) log(`#${ch.name}: ${n} mensajes`);
    saved += n;
  });
  for (const f of forums) {
    // Un foro no tiene mensajes propios; solo se crea si el bot puede verlo.
    const probe = await api(`/channels/${f.id}/threads/archived/public?limit=1`);
    if (!probe.__error) ensureChannel(f, guildId); else skipped.push(f.name);
  }

  // Categorias y orden: a todos con --orden; si no, solo a los canales recien creados.
  const { layout, catOrder } = discordLayout(all);
  const targets = LAYOUT_ALL ? [...layout.keys()] : createdThisRun;
  db.transaction(() => {
    for (const id of targets) { const l = layout.get(id); if (l) setLayout.run(l.category, l.position, id); }
    if (LAYOUT_ALL) {
      setSetting.run('channel_cat_order', JSON.stringify(catOrder));
      setSetting.run('channel_cat_sort', 'manual');
      setSetting.run('channel_sort_mode', 'manual');
    }
  })();
  if (LAYOUT_ALL) log(`Orden copiado de Discord: ${catOrder.filter(c => c !== '__untagged__').join(' > ')}`);

  // 2) Hilos: los activos siempre; los archivados cada ARCHIVED_EVERY_MS (o con --completo).
  const threads = new Map();
  const active = await api(`/guilds/${guildId}/threads/active`);
  for (const th of active.threads || []) { threads.set(th.id, th); adjuntos.rememberChannel(th); }
  const checkArchived = FULL || !estado.ultimosArchivados || Date.now() - estado.ultimosArchivados > ARCHIVED_EVERY_MS;
  if (checkArchived) {
    for (const parent of [...textChannels, ...forums]) {
      if (!q.channelByDiscord.get(parent.id)) continue;
      let before = '';
      for (;;) {
        const page = await api(`/channels/${parent.id}/threads/archived/public?limit=100${before ? '&before=' + encodeURIComponent(before) : ''}`);
        if (page.__error || !page.threads) break;
        for (const th of page.threads) { threads.set(th.id, th); adjuntos.rememberChannel(th); }
        if (!page.has_more || !page.threads.length) break;
        before = page.threads[page.threads.length - 1].thread_metadata?.archive_timestamp;
        if (!before) break;
      }
    }
  }

  const privateThreads = [];
  const work = [];
  for (const th of threads.values()) {
    if (th.type === PRIVATE_THREAD) { privateThreads.push(th.name); continue; }
    if (!PUBLIC_THREAD_TYPES.has(th.type)) continue;
    const parent = q.channelByDiscord.get(th.parent_id);
    if (!parent) continue; // su canal no se pudo leer
    work.push({ th, parent, name: th.name });
  }

  let threadMsgs = 0, threadsUpToDate = 0;
  await runPool(work, async ({ th, parent }) => {
    const parentIsForum = !!parent.is_forum || FORUM_TYPES.has(byId.get(th.parent_id)?.type);
    const existingRoot = q.byDiscordId.get(th.id) || q.byDiscordId.get(`thread-${th.id}`);
    let last = REBUILD ? null : existingRoot ? q.lastInThread.get(existingRoot.id)?.d : null;
    if (PENDING_ONLY) {
      const first = existingRoot && q.firstPendingInThread.get(existingRoot.id);
      if (!first) return; // nada pendiente en este hilo
      last = (big(first.d) - 1n).toString();
    }
    if (!REBUILD && existingRoot && th.last_message_id && last && !isNewer(th.last_message_id, last)) { threadsUpToDate++; return; } // al dia
    const rootId = await threadRoot(th, parent.id, parentIsForum);
    const n = await pullMessages(th.id, last, parent.id, rootId, parentIsForum ? th.id : null);
    if (n) log(`  🧵 ${th.name} (#${parent.name}): ${n} mensajes`);
    threadMsgs += n || 0;
  });

  estado.ultimaSincronizacion = new Date().toISOString();
  if (checkArchived) estado.ultimosArchivados = Date.now();
  saveEstado();

  const secs = Math.round((Date.now() - started) / 1000);
  if (saved || threadMsgs || firstRun || FULL) {
    log(`Listo en ${secs}s: ${saved} mensajes de canales y ${threadMsgs} de hilos (${work.length} hilos revisados, ${threadsUpToDate} ya al dia).`);
    if (REBUILD) log(`Rehacer: ${rebuilt} mensajes corregidos con el texto de Discord.`);
  }
  const avisos = [];
  if (skipped.length) avisos.push(`El bot no puede leer estos canales (dale permiso en Discord si los quieres): ${[...skipped].sort().join(', ')}`);
  if (privateThreads.length) avisos.push(`Hilos privados no sincronizados: ${[...privateThreads].sort().join(', ')}`);
  const resumen = avisos.join(' | ');
  if (resumen && resumen !== estado.ultimoAviso) {
    avisos.forEach(a => log('Aviso: ' + a));
    estado.ultimoAviso = resumen;
    saveEstado();
  }
}

main().catch(err => { log('Error:', err.message); process.exitCode = 1; }).finally(() => db.close());
