// Arreglos despues de cada importacion de Discord:
//  1. Convierte los hilos que el importador de Haven creo como canales sueltos
//     en hilos de verdad dentro de su canal original.
//  2. Marca como privados en Haven los canales que en Discord estan ocultos
//     para @everyone (el importador no copia permisos). Solo marca, nunca
//     desmarca: si haces publico un canal a mano, el script no lo toca.
//
// Uso (dentro del contenedor de Haven, puede estar encendido):
//   node hilos-discord.js                   -> solo muestra lo que haria (no toca nada)
//   node hilos-discord.js --aplicar         -> hace copia de seguridad y aplica
//   node hilos-discord.js --aplicar --auto  -> igual, pero solo escribe si hay cambios
//                                              (lo usa el temporizador cada 5 minutos)
//
// Se puede ejecutar todas las veces que haga falta: lo que ya esta convertido
// no se toca dos veces, y los canales ya revisados se recuerdan en ESTADO_PATH
// para no preguntar a Discord por ellos cada vez.

const fs = require('fs');
const path = require('path');
const Database = require('/app/node_modules/better-sqlite3');

const APPLY = process.argv.includes('--aplicar');
const AUTO = process.argv.includes('--auto');
const DB_PATH = process.env.HAVEN_DB || '/data/haven.db';
const ESTADO_PATH = path.join(__dirname, 'estado.json');
const BACKUP_DIR = '/data/backups';
const BACKUPS_TO_KEEP = 10;
const DISCORD_API = 'https://discord.com/api/v10';
const THREAD_TYPES = new Set([10, 11, 12]); // hilo de anuncios, publico, privado
const PRIVATE_THREAD = 12;
const FORUM_TYPES = new Set([15, 16]);      // foro, media
const VIEW_CHANNEL = 1024n;

// En Discord un canal es privado cuando @everyone (cuyo ID es el del servidor)
// tiene denegado "Ver canal".
function hiddenFromEveryone(info) {
  const ow = (info.permission_overwrites || []).find(o => o.id === info.guild_id && Number(o.type) === 0);
  return !!ow && (BigInt(ow.deny || '0') & VIEW_CHANNEL) !== 0n;
}

const db = new Database(DB_PATH);
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 60000'); // si Haven esta escribiendo (p. ej. importando), espera

// Canales normales ya revisados (su privacidad ya se aplico). Los hilos no se
// guardan: desaparecen al convertirse, o se reintentan hasta que llegue su canal.
let estado = { revisados: [] };
try { estado = JSON.parse(fs.readFileSync(ESTADO_PATH, 'utf8')); } catch { /* primera vez */ }
const revisados = new Set(estado.revisados);
function guardarEstado() {
  fs.writeFileSync(ESTADO_PATH, JSON.stringify({ revisados: [...revisados], avisados: estado.avisados || [] }));
}

const tokenRow = db.prepare("SELECT value FROM server_settings WHERE key = 'ferry_bot_token'").get();
if (!tokenRow || !tokenRow.value) {
  console.error('No hay token de Ferry configurado en Haven.');
  process.exit(1);
}
const headers = { Authorization: `Bot ${tokenRow.value}`, 'User-Agent': 'HavenThreadFix (local, 1.0)' };

const channelCache = new Map();
async function discordChannel(id, retries = 3) {
  if (channelCache.has(id)) return channelCache.get(id);
  const res = await fetch(`${DISCORD_API}/channels/${id}`, { headers, signal: AbortSignal.timeout(30000) });
  if (res.status === 429 && retries > 0) {
    const wait = parseFloat(res.headers.get('retry-after') || '2');
    await new Promise(r => setTimeout(r, wait * 1000));
    return discordChannel(id, retries - 1);
  }
  const info = res.ok ? await res.json() : { error: res.status };
  channelCache.set(id, info);
  return info;
}

// Hora de creacion a partir del ID de Discord, en el formato que usa el importador.
function snowflakeToSql(id) {
  const ms = Number((BigInt(id) >> 22n) + 1420070400000n);
  return new Date(ms).toISOString().replace('T', ' ').replace('Z', '');
}

// Los hilos sin mensaje de origen reciben un mensaje inicial creado por este
// script, marcado asi para reconocerlo en ejecuciones posteriores.
const syntheticKey = threadId => `thread-${threadId}`;

async function main() {
  const channels = db.prepare(`
    SELECT c.id, c.name, c.discord_channel_id AS d, c.created_by, c.is_private,
           (SELECT COUNT(*) FROM messages m WHERE m.channel_id = c.id) AS n
    FROM channels c WHERE c.discord_channel_id IS NOT NULL
  `).all();

  const plan = [];
  const toPrivate = [];
  const notes = [];
  const nuevosRevisados = [];

  for (const c of channels) {
    if (revisados.has(c.d)) continue;
    const info = await discordChannel(c.d);
    if (info.error) { notes.push(`? "${c.name}": Discord respondio ${info.error}, no se puede saber si es un hilo ni si es privado. Se deja como esta.`); continue; }
    if (!THREAD_TYPES.has(info.type)) { // canal normal
      if (!c.is_private && hiddenFromEveryone(info)) toPrivate.push(c);
      nuevosRevisados.push(c.d);
      continue;
    }

    const parent = db.prepare('SELECT id, name FROM channels WHERE discord_channel_id = ?').get(info.parent_id);
    if (!parent) { notes.push(`- "${c.name}": su canal original todavia no esta importado. Importalo y vuelve a ejecutar.`); continue; }
    if (info.type === PRIVATE_THREAD) {
      notes.push(`! "${c.name}": era un HILO PRIVADO en Discord. Como hilo de #${parent.name} lo veria todo el que vea #${parent.name}, asi que no se convierte. Decide tu que hacer con el.`);
      continue;
    }

    const parentInfo = await discordChannel(info.parent_id);
    if (FORUM_TYPES.has(parentInfo.type)) { notes.push(`- "${c.name}": es una publicacion de foro; los foros todavia no se convierten. Se deja como esta.`); continue; }

    const root =
      db.prepare('SELECT id FROM messages WHERE discord_message_id = ? AND channel_id = ?').get(c.d, parent.id) ||
      db.prepare('SELECT id FROM messages WHERE discord_message_id = ? AND channel_id = ?').get(syntheticKey(c.d), parent.id);

    plan.push({ c, parent, rootId: root ? root.id : null, threadName: info.name || c.name });
  }

  // En modo automatico solo se escribe al registro cuando hay algo que hacer,
  // y los avisos de un mismo canal no se repiten cada 5 minutos.
  const nothingToDo = !plan.length && !toPrivate.length;
  if (AUTO) {
    const avisados = new Set(estado.avisados || []);
    const nuevosAvisos = notes.filter(n => !avisados.has(n));
    nuevosAvisos.forEach(n => avisados.add(n));
    estado.avisados = [...avisados];
    if (nothingToDo) {
      if (nuevosAvisos.length) {
        console.log(`\n===== ${new Date().toISOString()} =====\nAvisos:`);
        nuevosAvisos.forEach(n => console.log('  ' + n));
      }
      if (APPLY) { nuevosRevisados.forEach(d => revisados.add(d)); guardarEstado(); }
      return;
    }
  }
  if (AUTO) console.log(`\n===== ${new Date().toISOString()} =====`);

  console.log(`\nHilos a convertir: ${plan.length}`);
  for (const p of plan) {
    const how = p.rootId ? 'desde su mensaje de origen' : 'con un mensaje inicial nuevo (en Discord no tiene mensaje de origen)';
    console.log(`  🧵 "${p.c.name}" (${p.c.n} mensajes) -> #${p.parent.name}, ${how}`);
  }
  console.log(`\nCanales a marcar como privados: ${toPrivate.length}`);
  for (const c of toPrivate) console.log(`  🔒 #${c.name}`);
  if (notes.length) { console.log('\nAvisos:'); notes.forEach(n => console.log('  ' + n)); }

  if (!APPLY) { console.log('\nModo prueba: no se cambio nada. Ejecuta con --aplicar para hacerlo.'); return; }
  if (nothingToDo) { nuevosRevisados.forEach(d => revisados.add(d)); guardarEstado(); console.log('\nNada que hacer.'); return; }

  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `${BACKUP_DIR}/antes-de-hilos-${stamp}.db`;
  await db.backup(backupPath);
  console.log(`\nCopia de seguridad: ${backupPath}`);
  const oldBackups = fs.readdirSync(BACKUP_DIR).filter(f => f.startsWith('antes-de-hilos-')).sort().slice(0, -BACKUPS_TO_KEEP);
  for (const f of oldBackups) fs.unlinkSync(path.join(BACKUP_DIR, f));

  const insertRoot = db.prepare(`
    INSERT INTO messages (channel_id, user_id, content, created_at, webhook_username, webhook_avatar, is_webhook, imported_from, discord_message_id)
    VALUES (?, ?, ?, ?, 'Discord', NULL, 0, 'discord', ?)
  `);
  const moveMessages = db.prepare('UPDATE messages SET channel_id = ?, thread_id = ? WHERE channel_id = ?');
  const movePins = db.prepare('UPDATE pinned_messages SET channel_id = ? WHERE channel_id = ?');
  const deleteChannel = db.prepare('DELETE FROM channels WHERE id = ?');
  const markPrivate = db.prepare('UPDATE channels SET is_private = 1 WHERE id = ?');

  const run = db.transaction(() => {
    for (const c of toPrivate) {
      markPrivate.run(c.id);
      console.log(`  ✔ #${c.name}: marcado como privado`);
    }
    for (const p of plan) {
      let rootId = p.rootId;
      if (!rootId) {
        rootId = insertRoot.run(p.parent.id, (db.prepare("SELECT id FROM users WHERE username = 'discord-historial'").get() || { id: p.c.created_by }).id, `🧵 **${p.threadName}**`, snowflakeToSql(p.c.d), syntheticKey(p.c.d)).lastInsertRowid;
      }
      const moved = moveMessages.run(p.parent.id, rootId, p.c.id).changes;
      movePins.run(p.parent.id, p.c.id);
      deleteChannel.run(p.c.id);
      console.log(`  ✔ "${p.c.name}": ${moved} mensajes movidos al hilo en #${p.parent.name}`);
    }
  });
  run();
  nuevosRevisados.forEach(d => revisados.add(d));
  guardarEstado();
  console.log('\nListo.');
}

main().catch(err => { console.error('Error:', err); process.exit(1); }).finally(() => db.close());
