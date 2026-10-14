// Control diario de accesos (PUENTE_ACCESO=vinculados): revisa que nadie vea en
// Haven un canal de Discord que en Discord no puede ver. No usa los datos del
// puente: le pide a Discord los roles, los permisos de cada canal y los roles de
// cada cuenta vinculada, recalcula quien puede ver cada canal y lo compara con
// los miembros de cada canal en Haven. Asi detecta tambien un error del puente.
//
// Revisa:
//  1. Canales que vienen de Discord y en Haven son publicos.
//  2. Cuentas sin vincular dentro de un canal de Discord (los admins de Haven no cuentan).
//  3. Cuentas vinculadas dentro de un canal que en Discord no pueden ver.
// Si encuentra algo, lo publica en el canal de admins (AVISO_CANAL, "admilinks"
// por defecto). Si esta todo bien no publica nada. Lo ejecuta haven-auditoria.timer.
//
// Uso (dentro del contenedor de Haven):
//   node auditoria-accesos.js            -> revisa y avisa solo si hay problemas
//   AUDITORIA_PRUEBA=1 node ...          -> publica el resultado aunque este todo bien
//   AUDITORIA_SECO=1 node ...            -> solo muestra el resultado, no publica

const Database = require('/app/node_modules/better-sqlite3');

const db = new Database(process.env.HAVEN_DB || '/data/haven.db');
db.pragma('busy_timeout = 30000');
const API = 'https://discord.com/api/v10';
const CANAL = process.env.AVISO_CANAL || 'admilinks';
const PRUEBA = process.env.AUDITORIA_PRUEBA === '1';
const SECO = process.env.AUDITORIA_SECO === '1';
const VIEW = 1n << 10n, ADMINISTRATOR = 1n << 3n;
const THREAD_TYPES = new Set([10, 11, 12]);
const token = (db.prepare("SELECT value FROM server_settings WHERE key = 'ferry_bot_token'").get() || {}).value;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function get(path) {
  for (let i = 0; i < 5; i++) {
    const res = await fetch(API + path, { headers: { Authorization: `Bot ${token}` } });
    if (res.status === 429) { await sleep(1000 * ((await res.json().catch(() => ({}))).retry_after || 1) + 100); continue; }
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Discord respondio ${res.status} a ${path.split('?')[0]}`);
    return res.json();
  }
  throw new Error('Discord no respondio (demasiados pedidos)');
}

// El mismo calculo que hace Discord (permisos de servidor + permisos del canal)
function canView(member, ch, guild, roles) {
  if (member.user.id === guild.owner_id) return true;
  let p = roles.get(guild.id) || 0n;
  for (const r of member.roles || []) p |= roles.get(r) || 0n;
  if (p & ADMINISTRATOR) return true;
  const ows = ch.permission_overwrites || [];
  const ev = ows.find(o => o.id === guild.id);
  if (ev) { p &= ~BigInt(ev.deny); p |= BigInt(ev.allow); }
  let allow = 0n, deny = 0n;
  for (const o of ows) if (Number(o.type) === 0 && (member.roles || []).includes(o.id)) { allow |= BigInt(o.allow); deny |= BigInt(o.deny); }
  p &= ~deny; p |= allow;
  const own = ows.find(o => Number(o.type) === 1 && o.id === member.user.id);
  if (own) { p &= ~BigInt(own.deny); p |= BigInt(own.allow); }
  return !!(p & VIEW);
}

async function main() {
  const problems = [];
  const havenChannels = db.prepare('SELECT id, name, discord_channel_id d, is_private FROM channels WHERE discord_channel_id IS NOT NULL').all();
  const byDiscord = new Map(havenChannels.map(c => [c.d, c]));

  // 1. Canales de Discord publicos en Haven
  for (const c of havenChannels) if (!c.is_private) problems.push(`#${c.name} es público en Haven (debería ser privado)`);

  // 2. Cuentas sin vincular dentro de canales de Discord
  const ghost = (db.prepare("SELECT id FROM users WHERE username = 'discord-historial'").get() || {}).id || -1;
  const unlinked = db.prepare(`SELECT c.name canal, u.username, (pa.haven_user_id IS NULL) a_mano FROM channel_members cm
    JOIN channels c ON c.id = cm.channel_id JOIN users u ON u.id = cm.user_id
    LEFT JOIN puente_vinculos v ON v.haven_user_id = u.id
    LEFT JOIN puente_accesos pa ON pa.haven_user_id = u.id AND pa.channel_id = c.id
    WHERE c.discord_channel_id IS NOT NULL AND u.is_admin = 0 AND u.id != ? AND v.haven_user_id IS NULL`).all(ghost);
  for (const r of unlinked) problems.push(`${r.username} está en #${r.canal} sin tener la cuenta de Discord vinculada${r.a_mano ? ' (agregado a mano)' : ''}`);

  // 3. Cuentas vinculadas en canales que Discord no les deja ver
  const any = havenChannels[0];
  if (any) {
    const first = await get(`/channels/${any.d}`);
    const guild = first && await get(`/guilds/${first.guild_id}`);
    const channels = guild && await get(`/guilds/${guild.id}/channels`);
    if (!guild || !Array.isArray(channels)) throw new Error('no pude leer el servidor de Discord');
    const roles = new Map((guild.roles || []).map(r => [r.id, BigInt(r.permissions || '0')]));
    const info = new Map(channels.map(c => [c.id, c]));
    const members = db.prepare(`SELECT v.discord_user_id, u.id, u.username, u.is_admin FROM puente_vinculos v JOIN users u ON u.id = v.haven_user_id`).all();
    const inChannel = db.prepare('SELECT c.discord_channel_id d, c.name, (pa.haven_user_id IS NULL) a_mano FROM channel_members cm JOIN channels c ON c.id = cm.channel_id LEFT JOIN puente_accesos pa ON pa.haven_user_id = cm.user_id AND pa.channel_id = c.id WHERE cm.user_id = ? AND c.discord_channel_id IS NOT NULL');
    for (const m of members) {
      if (m.is_admin) continue;
      const member = await get(`/guilds/${guild.id}/members/${m.discord_user_id}`); // null: ya no esta en el servidor
      for (const c of inChannel.all(m.id)) {
        const ch = info.get(c.d);
        if (!ch || THREAD_TYPES.has(ch.type)) continue;
        if (!member) problems.push(`${m.username} está en #${c.name}, pero ya no está en el servidor de Discord${c.a_mano ? ' (agregado a mano)' : ''}`);
        else if (!canView(member, ch, guild, roles)) problems.push(`${m.username} está en #${c.name}, pero en Discord no puede ver ese canal${c.a_mano ? ' (agregado a mano)' : ''}`);
      }
      await sleep(250);
    }
  }

  const resumen = problems.length
    ? `🛡️ **Control de accesos**: encontré ${problems.length} problema${problems.length === 1 ? '' : 's'}:\n` + problems.slice(0, 25).map(p => `- ${p}`).join('\n') +
      (problems.length > 25 ? `\n- … y ${problems.length - 25} más` : '') +
      '\nRevisalo cuanto antes: alguien podría estar viendo un canal privado.'
    : `🛡️ **Control de accesos**: todo en orden. ${byDiscord.size} canales de Discord revisados; nadie ve un canal que en Discord no puede ver.` + (PRUEBA ? ' (esto es una prueba)' : '');
  console.log(resumen);
  if (SECO || (!problems.length && !PRUEBA)) return;
  publish(resumen);
}

function publish(text) {
  const ch = db.prepare('SELECT id FROM channels WHERE name = ? AND is_dm = 0').get(CANAL);
  if (!ch) { console.error('No existe el canal ' + CANAL); return; }
  db.prepare('INSERT INTO messages (channel_id, user_id, content, is_webhook, webhook_username) VALUES (?, NULL, ?, 1, ?)').run(ch.id, text, 'Servidor');
}

main().catch(err => {
  const text = `🛡️ **Control de accesos**: no pude completar la revisión de hoy (${err.message}). Se vuelve a intentar mañana.`;
  console.error(text);
  if (!SECO) publish(text);
  process.exit(1);
});
