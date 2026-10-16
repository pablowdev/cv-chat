// Rol de Discord para quien tiene la cuenta vinculada con Haven (p. ej. "CV Chat ✅").
//
//  - El puente crea el rol una vez (separado en la lista de miembros, con color,
//    sin ningun permiso) y guarda su id en server_settings (puente_rol_vinculado).
//    Si se borra en Discord, se vuelve a crear.
//  - Al vincular se da; al desvincular se saca. Al conectar y cada hora se repasa
//    la lista de miembros entera: lo tienen exactamente las cuentas vinculadas.
//  - Necesita "Gestionar roles", con el rol del bot mas arriba que este.

let db, api, log, warn, getGuildId, appName;
const KEY = 'puente_rol_vinculado';
const COLOR = 0x3BA55C;
const REPASO_MS = 60 * 60 * 1000;
let roleId = null;
let timer = null;
let running = null;

function setup(ctx) {
  ({ db, api, log, warn, getGuildId } = ctx);
  appName = ctx.appName;
  const row = db.prepare('SELECT value FROM server_settings WHERE key = ?').get(KEY);
  roleId = row ? row.value : null;
  setInterval(() => soon(0), REPASO_MS);
}

const roleName = () => `${appName()} ✅`;

async function ensureRole() {
  const g = getGuildId();
  const roles = await api('GET', `/guilds/${g}/roles`);
  if (!Array.isArray(roles)) return null;
  let role = roles.find(r => r.id === roleId) || roles.find(r => r.name === roleName());
  if (!role) {
    role = await api('POST', `/guilds/${g}/roles`, { name: roleName(), color: COLOR, hoist: true, mentionable: false, permissions: '0', __reason: `Cuentas vinculadas con ${appName()}` });
    if (!role || role.__error) { warn(`rol: no se pudo crear "${roleName()}" (${role && role.__error})`); return null; }
    log(`rol: creado "${roleName()}"`);
  }
  if (role.id !== roleId) {
    roleId = role.id;
    db.prepare('INSERT OR REPLACE INTO server_settings (key, value) VALUES (?, ?)').run(KEY, roleId);
  }
  return roleId;
}

async function setRole(discordUserId, on) {
  const g = getGuildId();
  const r = await api(on ? 'PUT' : 'DELETE', `/guilds/${g}/members/${discordUserId}/roles/${roleId}`, { __reason: on ? `Vinculo su cuenta de ${appName()}` : `Desvinculo su cuenta de ${appName()}` });
  if (r && r.__error && r.__error !== 404) { warn(`rol: no se pudo ${on ? 'dar' : 'sacar'} a ${discordUserId} (${r.__error})`); return false; }
  return !(r && r.__error);
}

// Repaso completo: miembros del servidor contra las cuentas vinculadas
async function reconcile() {
  if (!getGuildId() || !await ensureRole()) return;
  const linked = new Set(db.prepare('SELECT discord_user_id FROM puente_vinculos').all().map(r => String(r.discord_user_id)));
  let after = '0', added = 0, removed = 0;
  for (;;) {
    const page = await api('GET', `/guilds/${getGuildId()}/members?limit=1000&after=${after}`);
    if (!Array.isArray(page)) { warn('rol: no se pudo leer la lista de miembros'); return; }
    for (const m of page) {
      if (!m.user || m.user.bot) continue;
      const has = (m.roles || []).includes(roleId), should = linked.has(String(m.user.id));
      if (should && !has && await setRole(m.user.id, true)) added++;
      if (!should && has && await setRole(m.user.id, false)) removed++;
    }
    if (page.length < 1000) break;
    after = page[page.length - 1].user.id;
  }
  if (added || removed) log(`rol: "${roleName()}" +${added} / -${removed}`);
}

// Varios cambios seguidos se juntan en un solo repaso
function soon(ms = 3000) {
  clearTimeout(timer);
  timer = setTimeout(() => {
    if (running) { soon(ms); return; }
    running = reconcile().catch(err => warn('rol:', err.message)).finally(() => { running = null; });
  }, ms);
}

async function onLinked(discordUserId) {
  if (!getGuildId()) return;
  if (!roleId || !await setRole(discordUserId, true)) soon();
}

function onDispatch(t, d) {
  if (t === 'GUILD_CREATE') soon(8000);
  else if (t === 'GUILD_MEMBER_ADD' && d.user && db.prepare('SELECT 1 FROM puente_vinculos WHERE discord_user_id = ?').get(String(d.user.id))) onLinked(d.user.id);
  else if (t === 'GUILD_ROLE_DELETE' && d.role_id === roleId) soon();
}

module.exports = { setup, onDispatch, onLinked, onUnlinked: () => soon(), _test: { reconcile } };
