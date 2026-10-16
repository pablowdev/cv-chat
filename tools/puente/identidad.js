// Nombres reservados: que nadie se haga pasar por otro.
//
// Cada nombre conocido es de alguien: los @usuarios y nombres de las cuentas de
// Haven, los de Discord de las cuentas vinculadas, los de la gente del servidor
// de Discord (la lista de miembros) y los de quienes escribieron en Discord (el
// historial importado). Una cuenta no puede ponerse (ni crearse con) el nombre
// de otra persona: se compara sin mayusculas, tildes, espacios ni signos, y con
// las letras parecidas igualadas (0/o, 1/l/i, 3/e, 4/a, 5/s, 7/t...), asi
// "Luch0" o "L.u.c.h.o" no pasan por "Lucho". El nombre propio de Discord de una
// cuenta vinculada siempre es suyo.
//
// "Gana el verdadero": cuando alguien vincula su Discord, a las cuentas sin
// vincular que tenian su nombre se les saca (quedan con su @usuario, o con un
// numero si el @usuario tambien era el suyo).

let db, io, api, log, warn, getGuildId;
let index = new Map();          // clave -> Set de dueños ("h<id de Haven>" o "d<id de Discord>")
let members = [];               // de Discord: [{ id, names: [...] }]
let builtAt = 0;
const REFRESH_MS = 30 * 60 * 1000;

// Numeros que se usan como letras (los signos se ignoran: "PabloW!" es "PabloW")
const LOOK = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', 9: 'g', l: 'i' };
function key(raw) {
  const s = String(raw || '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/[ᶜᵛ]/g, '')
    .split('').map(c => LOOK[c] || c).join('')
    .replace(/[^\p{L}\p{N}]/gu, '')
    .replace(/(.)\1+/g, '$1'); // "luuucho" = "lucho"
  return s;
}

function add(map, name, owner) {
  const k = key(name);
  if (k.length < 3) return; // los nombres muy cortos no se reservan
  if (!map.has(k)) map.set(k, new Set());
  map.get(k).add(owner);
}

function build() {
  const map = new Map();
  for (const u of db.prepare("SELECT id, username, display_name FROM users WHERE username != 'discord-historial'").all()) {
    add(map, u.username, 'h' + u.id);
    if (u.display_name) add(map, u.display_name, 'h' + u.id);
  }
  for (const v of db.prepare('SELECT haven_user_id h, discord_user_id d, discord_username un, discord_global_name gn FROM puente_vinculos').all()) {
    for (const n of [v.un, v.gn]) if (n) { add(map, n, 'd' + v.d); add(map, n, 'h' + v.h); }
  }
  // Quienes escribieron en Discord (nombre del historial importado)
  try {
    for (const r of db.prepare(`SELECT pa.discord_user_id d, MAX(m.webhook_username) n FROM puente_autores pa JOIN messages m ON m.id = pa.message_id
      WHERE m.webhook_username IS NOT NULL GROUP BY pa.discord_user_id`).all()) add(map, r.n, 'd' + r.d);
  } catch (err) { warn('identidad: historial:', err.message); }
  for (const m of members) for (const n of m.names) add(map, n, 'd' + m.id);
  index = map;
  builtAt = Date.now();
}

async function fetchMembers() {
  const g = getGuildId && getGuildId();
  if (!g) return;
  const out = [];
  let after = '0';
  for (;;) {
    const page = await api('GET', `/guilds/${g}/members?limit=1000&after=${after}`);
    if (!Array.isArray(page)) return;
    for (const m of page) if (m.user && !m.user.bot) out.push({ id: m.user.id, names: [m.user.username, m.user.global_name, m.nick].filter(Boolean) });
    if (page.length < 1000) break;
    after = page[page.length - 1].user.id;
  }
  members = out;
  build();
}

function setup(ctx) {
  ({ db, io, api, log, warn, getGuildId } = ctx);
  try { build(); } catch (err) { warn('identidad:', err.message); }
  setInterval(() => { fetchMembers().catch(err => warn('identidad: miembros:', err.message)); }, REFRESH_MS);
  // El cambio de nombre propio (Haven: "rename-user"): no el de otra persona
  io.on('connection', socket => {
    socket.use((packet, next) => {
      try {
        const [event, data] = packet;
        if (event === 'rename-user' && socket.user && !socket.user.isAdmin && data && typeof data.username === 'string') {
          const err = problem(socket.user.id, data.username);
          if (err) { socket.emit('error-msg', err); return; }
        }
      } catch (e) { warn('identidad: guardia:', e.message); }
      next();
    });
  });
}
function onGuildReady() { fetchMembers().catch(err => warn('identidad: miembros:', err.message)); }

// Dueños que cuentan como "uno mismo" para una cuenta de Haven (o para un Discord que se esta creando cuenta)
function selfOwners(havenUserId, discordUserId) {
  const s = new Set();
  if (havenUserId) {
    s.add('h' + havenUserId);
    const l = db.prepare('SELECT discord_user_id FROM puente_vinculos WHERE haven_user_id = ?').get(havenUserId);
    if (l) s.add('d' + l.discord_user_id);
  }
  if (discordUserId) s.add('d' + discordUserId);
  return s;
}

const MSG = 'Ese nombre es de otra persona de la comunidad. Si es tuyo, vinculá tu Discord para usarlo.';
// null si se puede usar, o el mensaje de error
function problem(havenUserId, name, discordUserId) {
  if (Date.now() - builtAt > REFRESH_MS) { try { build(); } catch { /* el anterior */ } }
  const owners = index.get(key(name));
  if (!owners || !owners.size) return null;
  const me = selfOwners(havenUserId, discordUserId);
  for (const o of owners) if (me.has(o)) return null;
  return MSG;
}

// "Gana el verdadero": al vincular, las cuentas sin vincular con su nombre lo pierden
function onLinked(havenUserId) {
  try {
    const v = db.prepare('SELECT discord_user_id d, discord_username un, discord_global_name gn FROM puente_vinculos WHERE haven_user_id = ?').get(havenUserId);
    if (!v) return;
    const theirs = new Set([v.un, v.gn].filter(Boolean).map(key).filter(k => k.length >= 3));
    if (!theirs.size) return;
    const others = db.prepare(`SELECT id, username, display_name FROM users WHERE id != ? AND username != 'discord-historial'
      AND id NOT IN (SELECT haven_user_id FROM puente_vinculos)`).all(havenUserId);
    for (const o of others) {
      const dn = o.display_name && theirs.has(key(o.display_name));
      const un = theirs.has(key(o.username));
      if (!dn && !un) continue;
      const fresh = un ? `${o.username}_${o.id}` : null;
      db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(fresh, o.id);
      log(`identidad: ${o.username} dejo de usar el nombre de ${v.gn || v.un} (lo vinculo su dueño)`);
      for (const [, s] of io.sockets.sockets) if (s.user && s.user.id === o.id) { s.user.displayName = fresh || o.username; s.emit('error-msg', `Tu nombre se cambió: "${o.display_name || o.username}" es de otra persona, que vinculó su Discord.`); }
    }
    build();
  } catch (err) { warn('identidad: al vincular:', err.message); }
}

// Para revisar a mano: cuentas sin vincular que hoy usan el nombre de otra persona
function collisions() {
  const out = [];
  for (const u of db.prepare(`SELECT id, username, display_name FROM users WHERE username != 'discord-historial' AND id NOT IN (SELECT haven_user_id FROM puente_vinculos)`).all()) {
    // Su nombre tambien es de alguien de Discord (que no es esta cuenta)
    for (const n of [u.username, u.display_name].filter(Boolean)) {
      const owners = index.get(key(n));
      const ajenos = owners ? [...owners].filter(o => o.startsWith('d')) : [];
      if (ajenos.length) out.push({ id: u.id, username: u.username, nombre: n, de: ajenos.length });
    }
  }
  return out;
}

module.exports = { setup, onGuildReady, problem, onLinked, collisions, key, _test: { build, index: () => index } };
