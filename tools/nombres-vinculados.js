// Un solo nombre por persona en las cuentas vinculadas (ver puente/nombres.js).
//
// Para las cuentas que ya estaban vinculadas antes de este cambio:
//  1. Trae de Discord el nombre para mostrar actual de cada una.
//  2. Se lo pone como nombre en CV Chat, salvo que la persona tenga uno propio
//     (o que no cumpla las reglas de Haven, o que ya lo use otra persona).
//  3. Saca el nombre de Discord guardado en sus mensajes (webhook_username), asi
//     se ven todos con el nombre de la cuenta, el actual. De a poco, para no
//     frenar a Haven.
//
// Uso (dentro del contenedor de Haven):
//   node nombres-vinculados.js            -> solo muestra lo que haria
//   node nombres-vinculados.js --aplicar  -> copia de seguridad y aplica
//   --sin-discord: usa los nombres de Discord ya guardados (sin preguntarle a Discord)

const fs = require('fs');
const Database = require('/app/node_modules/better-sqlite3');
const nombres = require('./puente/nombres.js');

const APPLY = process.argv.includes('--aplicar');
const OFFLINE = process.argv.includes('--sin-discord');
const DB_PATH = process.env.HAVEN_DB || '/data/haven.db';
const API = 'https://discord.com/api/v10';
const BATCH = 2000;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const db = new Database(DB_PATH);
db.pragma('busy_timeout = 60000');
const token = (db.prepare("SELECT value FROM server_settings WHERE key = 'ferry_bot_token'").get() || {}).value;
if (!token) { console.error('No hay token del bot.'); process.exit(1); }

async function discordUser(id) {
  for (let i = 0; i < 4; i++) {
    const res = await fetch(`${API}/users/${id}`, { headers: { Authorization: `Bot ${token}` }, signal: AbortSignal.timeout(20000) }).catch(() => null);
    if (res && res.status === 429) { await sleep(((await res.json().catch(() => ({}))).retry_after || 1) * 1000 + 200); continue; }
    if (res && res.ok) return res.json();
    if (res && res.status === 404) return null;
    await sleep(1000 * (i + 1));
  }
  return undefined; // Discord no contesto: se usa el nombre guardado
}

async function main() {
  nombres.ensureColumn(db);
  const links = db.prepare(`SELECT v.haven_user_id, v.discord_user_id, v.discord_username, v.discord_global_name, u.username, u.display_name
                            FROM puente_vinculos v JOIN users u ON u.id = v.haven_user_id ORDER BY u.username COLLATE NOCASE`).all();
  const countMsgs = db.prepare(`SELECT COUNT(*) c FROM messages WHERE user_id = ? AND imported_from IS NULL AND is_webhook = 0 AND webhook_username IS NOT NULL`);
  const plans = [];
  for (const l of links) {
    const d = OFFLINE ? undefined : await discordUser(l.discord_user_id);
    if (d) {
      l.discord_username = d.username; l.discord_global_name = d.global_name || null;
      if (APPLY) db.prepare('UPDATE puente_vinculos SET discord_username = ?, discord_global_name = ? WHERE discord_user_id = ?').run(d.username, d.global_name || null, l.discord_user_id);
    }
    const want = l.discord_global_name || l.discord_username;
    const p = nombres.plan(db, l.haven_user_id, want);
    plans.push({ l, want, p, msgs: countMsgs.get(l.haven_user_id).c });
  }
  let changes = 0;
  for (const { l, want, p, msgs } of plans) {
    const now = l.display_name || l.username;
    const what = p.name ? `"${now}" -> "${p.name}"` : `queda "${now}" (${p.skip})`;
    console.log(`  ${l.username.padEnd(20)} Discord: "${want}"`.padEnd(60) + what + (msgs ? ` | ${msgs} mensajes con nombre guardado` : ''));
    if (p.name) changes++;
  }
  const total = plans.reduce((a, x) => a + x.msgs, 0);
  console.log(`\nCuentas vinculadas: ${links.length} | nombres que cambian: ${changes} | mensajes a los que se les saca el nombre guardado: ${total}`);
  if (!APPLY) { console.log('Modo prueba: no se cambio nada. Ejecuta con --aplicar.'); return; }

  fs.mkdirSync('/data/backups', { recursive: true });
  const backup = `/data/backups/antes-de-nombres-${new Date().toISOString().replace(/[:.]/g, '-')}.db`;
  await db.backup(backup);
  console.log(`Copia de seguridad: ${backup}`);

  for (const { l } of plans) {
    const n = nombres.applyName(db, l.haven_user_id, l.discord_global_name || l.discord_username);
    if (n) console.log(`  nombre: ${l.username} -> ${n}`);
  }
  const ids = db.prepare('SELECT haven_user_id FROM puente_vinculos').all().map(r => r.haven_user_id);
  const next = db.prepare(`SELECT id FROM messages WHERE user_id = ? AND imported_from IS NULL AND is_webhook = 0 AND webhook_username IS NOT NULL LIMIT ${BATCH}`);
  const clear = db.prepare('UPDATE messages SET webhook_username = NULL WHERE id = ?');
  const batch = db.transaction(rows => { for (const r of rows) clear.run(r.id); });
  let done = 0;
  for (const uid of ids) {
    for (;;) {
      const rows = next.all(uid);
      if (!rows.length) break;
      batch(rows);
      done += rows.length;
      if (done % 20000 < BATCH) console.log(`  mensajes: ${done}/${total}`);
      await sleep(150); // que Haven siga atendiendo
    }
  }
  console.log(`Listo: ${changes} nombres y ${done} mensajes.`);
}

main().catch(err => { console.error('Error:', err); process.exit(1); });
