// Vigia de la sincronizacion: avisa a los administradores apenas algo puede
// cortar el puente, en vez de enterarse cuando faltan mensajes.
//
//  - Permisos del bot: al arrancar, cada 6 horas y cada vez que en Discord
//    cambian los permisos de un canal o de un rol, revisa que el bot tenga en
//    cada canal unido lo que necesita (ver el canal, leer el historial,
//    gestionar webhooks, gestionar mensajes, agregar reacciones y gestionar
//    canales). Si falta algo, dice en que canal y que tildar.
//  - Mensajes que no salieron: si un mensaje escrito en Haven no se pudo
//    publicar en Discord, avisa (el puente lo sigue reintentando 24 h).
//
// El aviso va al canal de admins (AVISO_CANAL, "admilinks" por defecto) en
// Discord, que notifica en el momento, y tambien en Haven. Cada problema se
// avisa como mucho una vez cada 12 horas mientras siga igual.

const CANAL = () => process.env.AVISO_CANAL || 'admilinks';
const REPEAT_MS = 12 * 3600 * 1000;
const NEED = [
  [1n << 10n, 'View Channel (Ver canal)'],
  [1n << 16n, 'Read Message History (Leer el historial de mensajes)'],
  [1n << 29n, 'Manage Webhooks (Gestionar webhooks)'],
  [1n << 13n, 'Manage Messages (Gestionar mensajes)'],
  [1n << 6n, 'Add Reactions (Agregar reacciones)'],
  [1n << 4n, 'Manage Channel (Gestionar canal)'],
];
const ADMIN = 1n << 3n;

let db, api, log, warn, getGuildId, getBotUserId;
let timer = null, debounce = null;

function setup(deps) {
  ({ db, api, log, warn, getGuildId, getBotUserId } = deps);
  db.exec(`CREATE TABLE IF NOT EXISTS puente_avisos (clave TEXT PRIMARY KEY, texto TEXT, at INTEGER NOT NULL)`);
  setTimeout(() => checkPermissions(), 2 * 60 * 1000);
  timer = setInterval(() => checkPermissions(), 6 * 3600 * 1000);
}

// Algo cambio en Discord (permisos de un canal, un rol, el rol del bot): revisar en un rato
function onDiscordChange() {
  clearTimeout(debounce);
  debounce = setTimeout(() => checkPermissions(), 30 * 1000);
}

async function notify(key, text) {
  const prev = db.prepare('SELECT texto, at FROM puente_avisos WHERE clave = ?').get(key);
  if (prev && prev.texto === text && Date.now() - prev.at < REPEAT_MS) return;
  db.prepare('INSERT OR REPLACE INTO puente_avisos (clave, texto, at) VALUES (?, ?, ?)').run(key, text, Date.now());
  const ch = db.prepare('SELECT id, discord_channel_id FROM channels WHERE name = ? AND is_dm = 0').get(CANAL());
  if (!ch) { warn('vigia: no existe el canal ' + CANAL()); return; }
  // En Haven, como el control diario de accesos (no sale para Discord)
  try { db.prepare('INSERT INTO messages (channel_id, user_id, content, is_webhook, webhook_username) VALUES (?, NULL, ?, 1, ?)').run(ch.id, text, 'Servidor'); } catch (err) { warn('vigia:', err.message); }
  // En Discord, para que llegue la notificacion (el puente no trae de vuelta lo que publica el bot)
  if (ch.discord_channel_id) {
    const r = await api('POST', `/channels/${ch.discord_channel_id}/messages`, { content: text.slice(0, 1990), allowed_mentions: { parse: [] } });
    if (r && r.__error) warn('vigia: no pude avisar en Discord:', r.__error);
  }
  log('vigia: aviso enviado (' + key + ')');
}

async function checkPermissions() {
  try {
    const guildId = getGuildId(), botId = getBotUserId();
    if (!guildId || !botId) return;
    const [member, roles, all] = await Promise.all([api('GET', `/guilds/${guildId}/members/${botId}`), api('GET', `/guilds/${guildId}/roles`), api('GET', `/guilds/${guildId}/channels`)]);
    if (!member || member.__error || !Array.isArray(roles) || !Array.isArray(all)) return; // Discord no contesto: otra vez despues
    let base = 0n;
    for (const r of roles) if (r.id === guildId || member.roles.includes(r.id)) base |= BigInt(r.permissions);
    const chans = db.prepare("SELECT name, discord_channel_id id FROM channels WHERE discord_channel_id IS NOT NULL AND discord_channel_id != '' AND is_dm = 0").all();
    const problems = [];
    for (const c of chans) {
      const dc = all.find(x => x.id === c.id);
      if (!dc) continue; // hilo o canal que ya no esta
      if (base & ADMIN) continue;
      let p = base;
      const ow = dc.permission_overwrites || [];
      const ev = ow.find(o => o.id === guildId); if (ev) p = (p & ~BigInt(ev.deny)) | BigInt(ev.allow);
      let a = 0n, d = 0n;
      for (const o of ow) if (Number(o.type) === 0 && member.roles.includes(o.id)) { a |= BigInt(o.allow); d |= BigInt(o.deny); }
      p = (p & ~d) | a;
      const mo = ow.find(o => Number(o.type) === 1 && o.id === botId); if (mo) p = (p & ~BigInt(mo.deny)) | BigInt(mo.allow);
      const missing = NEED.filter(([bit]) => !(p & bit)).map(([, name]) => name);
      if (missing.length) problems.push(`• **#${c.name}**: ${missing.join(', ')}`);
    }
    if (!problems.length) { db.prepare("DELETE FROM puente_avisos WHERE clave = 'permisos'").run(); return; }
    const text = '⚠️ **La sincronización con Discord puede fallar**: al bot le faltan permisos en estos canales.\n' + problems.join('\n') +
      '\n\nPara arreglarlo, en Discord: clic derecho en el canal → **Editar canal** → **Permisos** → elegí el rol del bot (**CV Chat**) → poné la ✓ verde en lo que falta → **Save Changes**.';
    await notify('permisos', text);
  } catch (err) { warn('vigia:', err.message); }
}

// Un mensaje de Haven que no se pudo publicar en Discord
function deliveryFailed(discordChannelId, reason) {
  try {
    const ch = db.prepare('SELECT name FROM channels WHERE discord_channel_id = ?').get(discordChannelId);
    const name = ch ? '#' + ch.name : discordChannelId;
    notify('envio:' + discordChannelId, `⚠️ **Un mensaje escrito en CV Chat en ${name} no llegó a Discord** (${reason}). Se reintenta solo cada 5 minutos durante 24 horas; si sigue sin llegar, revisá los permisos del bot en ese canal.`)
      .catch(err => warn('vigia:', err.message));
    onDiscordChange(); // de paso, revisar los permisos
  } catch (err) { warn('vigia:', err.message); }
}

module.exports = { setup, onDiscordChange, deliveryFailed, checkPermissions };
