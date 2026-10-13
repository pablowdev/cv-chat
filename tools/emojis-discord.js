// Emojis personalizados de Discord -> Haven.
//
//  1. Copia los emojis del servidor de Discord a los emojis de Haven (mismo
//     nombre en minusculas, como los guarda Haven; los animados siguen animados).
//     Guarda la relacion en la tabla puente_emojis, que usa el puente para
//     traducir :nombre: <-> <:nombre:id> en los dos sentidos.
//  2. En los mensajes ya importados cambia <:nombre:id> por :nombre:, que Haven
//     dibuja como el emoji.
//  3. En las reacciones importadas cambia "nombre" por ":nombre:".
//
// Se puede ejecutar de nuevo cuando se agreguen emojis en Discord: lo que ya
// esta copiado no se toca. Uso (dentro del contenedor de Haven):
//   node emojis-discord.js            -> solo muestra lo que haria
//   node emojis-discord.js --aplicar  -> copia de seguridad y aplica

const fs = require('fs');
const path = require('path');
const Database = require('/app/node_modules/better-sqlite3');

const APPLY = process.argv.includes('--aplicar');
const DB_PATH = process.env.HAVEN_DB || '/data/haven.db';
const DIR = '/data/uploads/discord';
const API = 'https://discord.com/api/v10';

const db = new Database(DB_PATH);
db.pragma('busy_timeout = 60000');
const token = (db.prepare("SELECT value FROM server_settings WHERE key = 'ferry_bot_token'").get() || {}).value;
if (!token) { console.error('No hay token de Ferry.'); process.exit(1); }
const H = { Authorization: `Bot ${token}` };
const admin = db.prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE').get(process.env.ADMIN_USERNAME || '');

db.exec(`CREATE TABLE IF NOT EXISTS puente_emojis (
  discord_id TEXT PRIMARY KEY,
  discord_name TEXT NOT NULL,
  name TEXT NOT NULL UNIQUE,
  animated INTEGER NOT NULL DEFAULT 0
)`);

// Nombre valido en Haven: [a-z0-9_-], hasta 30 caracteres.
const havenName = n => String(n).toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 30) || 'emoji';

async function main() {
  const any = db.prepare('SELECT discord_channel_id d FROM channels WHERE discord_channel_id IS NOT NULL LIMIT 1').get();
  const guildId = (await (await fetch(`${API}/channels/${any.d}`, { headers: H })).json()).guild_id;
  const emojis = await (await fetch(`${API}/guilds/${guildId}/emojis`, { headers: H })).json();
  if (!Array.isArray(emojis)) throw new Error('Discord no devolvio la lista de emojis');

  // 1) Que nombre de Haven le toca a cada emoji (sin pisar emojis propios de Haven)
  const known = new Map(db.prepare('SELECT discord_id, name FROM puente_emojis').all().map(r => [r.discord_id, r.name]));
  const taken = new Set(db.prepare('SELECT name FROM custom_emojis').all().map(r => r.name));
  const plan = [];
  for (const e of emojis) {
    if (!e.id || !e.name) continue;
    if (known.has(e.id)) { plan.push({ e, name: known.get(e.id), nuevo: false }); continue; }
    let name = havenName(e.name), i = 2;
    while (taken.has(name)) name = (havenName(e.name).slice(0, 27) + '_' + i++);
    taken.add(name);
    plan.push({ e, name, nuevo: true });
  }
  const nuevos = plan.filter(p => p.nuevo);
  console.log(`Emojis en Discord: ${emojis.length} | nuevos para copiar: ${nuevos.length}`);

  // 2) Mensajes con <:nombre:id> y 3) reacciones con el nombre suelto
  const byId = new Map(plan.map(p => [p.e.id, p.name]));
  const byDiscordName = new Map(plan.map(p => [p.e.name, p.name]));
  const rows = db.prepare("SELECT id, content FROM messages WHERE content LIKE '%<%:%:%>%'").all();
  const msgFixes = [];
  for (const r of rows) {
    const fixed = r.content.replace(/<a?:([A-Za-z0-9_~]{1,32}):(\d{5,25})>/g, (full, n, id) => `:${byId.get(id) || havenName(n)}:`);
    if (fixed !== r.content) msgFixes.push([fixed, r.id]);
  }
  const reacts = db.prepare('SELECT emoji, COUNT(*) n FROM reactions GROUP BY emoji').all().filter(r => byDiscordName.has(r.emoji));
  console.log(`Mensajes a corregir: ${msgFixes.length} | reacciones a corregir: ${reacts.reduce((a, r) => a + r.n, 0)} (${reacts.length} emojis)`);

  if (!APPLY) { console.log('Modo prueba: no se cambio nada. Ejecuta con --aplicar.'); return; }

  fs.mkdirSync('/data/backups', { recursive: true });
  await db.backup(`/data/backups/antes-de-emojis-${new Date().toISOString().replace(/[:.]/g, '-')}.db`);
  fs.mkdirSync(DIR, { recursive: true });

  let copied = 0;
  for (const p of nuevos) {
    const ext = p.e.animated ? 'gif' : 'png';
    const file = `emoji-${p.e.id}.${ext}`;
    const res = await fetch(`https://cdn.discordapp.com/emojis/${p.e.id}.${ext}?size=96&quality=lossless`);
    if (!res.ok) { console.log(`  ! no pude bajar ${p.e.name}`); continue; }
    fs.writeFileSync(path.join(DIR, file), Buffer.from(await res.arrayBuffer()));
    db.transaction(() => {
      db.prepare('INSERT OR REPLACE INTO custom_emojis (name, filename, uploaded_by) VALUES (?, ?, ?)').run(p.name, `discord/${file}`, admin ? admin.id : null);
      db.prepare('INSERT OR REPLACE INTO puente_emojis (discord_id, discord_name, name, animated) VALUES (?, ?, ?, ?)').run(p.e.id, p.e.name, p.name, p.e.animated ? 1 : 0);
    })();
    copied++;
  }
  console.log(`Emojis copiados: ${copied}`);

  const setContent = db.prepare('UPDATE messages SET content = ? WHERE id = ?');
  for (let i = 0; i < msgFixes.length; i += 2000) db.transaction(batch => { for (const [c, id] of batch) setContent.run(c, id); })(msgFixes.slice(i, i + 2000));
  console.log(`Mensajes corregidos: ${msgFixes.length}`);

  let fixedReacts = 0;
  db.transaction(() => {
    for (const r of reacts) {
      const to = `:${byDiscordName.get(r.emoji)}:`;
      fixedReacts += db.prepare('UPDATE OR IGNORE reactions SET emoji = ? WHERE emoji = ?').run(to, r.emoji).changes;
      db.prepare('DELETE FROM reactions WHERE emoji = ?').run(r.emoji); // duplicados que ya existian con el nombre nuevo
    }
  })();
  console.log(`Reacciones corregidas: ${fixedReacts}`);
}

main().catch(err => { console.error('Error:', err.message); process.exitCode = 1; }).finally(() => db.close());
