// Menciones de Discord en el historial ya importado -> texto de Haven.
//
// El importador deja las menciones como las guarda Discord: <@123...> para una
// persona, <#123...> para un canal, <@&123...> para un rol. Haven las muestra
// asi, con el numero. Este script las cambia por @usuario (si la cuenta de
// Discord esta vinculada, la mencion de Haven), @Nombre (si no), #canal y @rol.
// El puente hace lo mismo con los mensajes nuevos (adjuntos.mentionsToHaven).
//
// Los nombres salen de las cuentas vinculadas y del historial; los que faltan
// se le piden a Discord. El texto original de cada mensaje cambiado queda en la
// tabla puente_menciones_original (para deshacer: --deshacer).
//
// Uso (dentro del contenedor de Haven):
//   node menciones-discord.js            -> solo muestra lo que haria
//   node menciones-discord.js --aplicar  -> aplica
//   node menciones-discord.js --deshacer -> vuelve los mensajes a su texto original

const Database = require('/app/node_modules/better-sqlite3');
const adjuntos = require('./puente/adjuntos.js');

const APPLY = process.argv.includes('--aplicar');
const UNDO = process.argv.includes('--deshacer');
const db = new Database(process.env.HAVEN_DB || '/data/haven.db');
db.pragma('busy_timeout = 60000');
const API = 'https://discord.com/api/v10';
const token = (db.prepare("SELECT value FROM server_settings WHERE key = 'ferry_bot_token'").get() || {}).value;
const H = token ? { Authorization: `Bot ${token}` } : null;

db.exec(`CREATE TABLE IF NOT EXISTS puente_menciones_original (
  message_id INTEGER PRIMARY KEY,
  content TEXT NOT NULL
)`);

const USER_RE = /<@!?(\d{5,25})>/g, ROLE_RE = /<@&(\d{5,25})>/g, CHANNEL_RE = /<#(\d{5,25})>/g;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function get(pathname) {
  if (!H) return null;
  for (let i = 0; i < 5; i++) {
    const res = await fetch(API + pathname, { headers: H });
    if (res.status === 429) { await sleep(1000 * ((await res.json().catch(() => ({}))).retry_after || 1) + 100); continue; }
    if (!res.ok) return null;
    return res.json();
  }
  return null;
}

async function main() {
  if (UNDO) {
    const rows = db.prepare('SELECT message_id, content FROM puente_menciones_original').all();
    const put = db.prepare('UPDATE messages SET content = ? WHERE id = ?');
    db.transaction(() => { for (const r of rows) put.run(r.content, r.message_id); db.exec('DELETE FROM puente_menciones_original'); })();
    console.log(`${rows.length} mensajes vueltos a su texto original.`);
    return;
  }

  const rows = db.prepare(`SELECT id, content FROM messages
    WHERE content LIKE '%<@%>%' OR content LIKE '%<#%>%'`).all()
    .filter(r => /<@!?\d{5,25}>|<@&\d{5,25}>|<#\d{5,25}>/.test(r.content));
  console.log(`${rows.length} mensajes con menciones de Discord.`);
  if (!rows.length) return;

  // Ids que no se conocen localmente: se le preguntan a Discord
  const users = new Set(), channels = new Set(), roles = new Set();
  for (const r of rows) {
    for (const m of r.content.matchAll(USER_RE)) users.add(m[1]);
    for (const m of r.content.matchAll(CHANNEL_RE)) channels.add(m[1]);
    for (const m of r.content.matchAll(ROLE_RE)) roles.add(m[1]);
  }
  const unknownUsers = [...users].filter(id => !adjuntos.mentionUser(db, id));
  const unknownChannels = [...channels].filter(id => !adjuntos.mentionChannel(db, id));
  console.log(`personas: ${users.size} (${unknownUsers.length} se buscan en Discord), canales: ${channels.size} (${unknownChannels.length}), roles: ${roles.size}`);

  const any = db.prepare('SELECT discord_channel_id d FROM channels WHERE discord_channel_id IS NOT NULL LIMIT 1').get();
  const ch = any && await get(`/channels/${any.d}`);
  if (ch && ch.guild_id && roles.size) adjuntos.rememberRoles(await get(`/guilds/${ch.guild_id}/roles`) || []);
  let found = 0;
  for (const id of unknownUsers) {
    const member = ch && ch.guild_id ? await get(`/guilds/${ch.guild_id}/members/${id}`) : null;
    const u = (member && member.user) || await get(`/users/${id}`);
    const name = (member && member.nick) || (u && (u.global_name || u.username));
    if (name) { adjuntos.rememberUser(id, name); found++; }
  }
  for (const id of unknownChannels) {
    const c = await get(`/channels/${id}`);
    if (c && c.name) { adjuntos.rememberChannel(c); found++; }
  }
  if (unknownUsers.length + unknownChannels.length) console.log(`${found} nombres encontrados en Discord; el resto queda como @usuario / #canal.`);

  const changes = rows.map(r => ({ id: r.id, before: r.content, after: adjuntos.mentionsToHaven(db, r.content, null) }))
    .filter(c => c.after !== c.before);
  for (const c of changes.slice(0, 8)) console.log(`  ${c.id}: ${c.before.slice(0, 90).replace(/\n/g, ' ')}\n    -> ${c.after.slice(0, 90).replace(/\n/g, ' ')}`);

  if (!APPLY) { console.log(`\n${changes.length} mensajes cambiarian. Para aplicar: --aplicar`); return; }
  const keep = db.prepare('INSERT OR IGNORE INTO puente_menciones_original (message_id, content) VALUES (?, ?)');
  const put = db.prepare('UPDATE messages SET content = ? WHERE id = ?');
  db.transaction(() => { for (const c of changes) { keep.run(c.id, c.before); put.run(c.after, c.id); } })();
  console.log(`\n${changes.length} mensajes actualizados.`);
}

main().catch(err => { console.error(err); process.exit(1); });
