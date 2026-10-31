// Medallas, rachas, "Tu historia" y el resumen de la semana (#que-paso).
//
// Una persona es su cuenta de Haven y, si la vinculo, su cuenta de Discord:
// cuenta todo lo que escribio de los dos lados (puente_autores dice quien
// escribio cada mensaje de Discord). Los mensajes directos no entran en nada
// de lo que se muestra a otros.
//
//  - Rachas: dias seguidos escribiendo desde Haven (tabla puente_dias, al dia
//    cada 2 minutos). Los dias son de la hora de Argentina (PUENTE_ZONA_HORAS).
//  - Medallas: se calculan al pedirlas (GET /puente/api/logros/medallas?u=<id>).
//  - Tu historia: GET /puente/api/logros/historia (la de la sesion).
//  - Resumen: los lunes a las 10, de la semana anterior, en el canal de Discord
//    PUENTE_RESUMEN_CANAL ("que-paso"); llega a Haven como cualquier mensaje.

let db, api, apiFiles, log, warn, getGuildId, appName, community, publicUrl, postInHaven, locked;
const ZONE_H = Number(process.env.PUENTE_ZONA_HORAS || -3);   // Argentina
const SUMMARY_CHANNEL = String(process.env.PUENTE_RESUMEN_CANAL || 'que-paso');
const SUMMARY_DAY = 1, SUMMARY_HOUR = 10;                      // lunes 10:00
const PIONEER_UNTIL = process.env.PUENTE_PIONEROS_HASTA || '';  // fecha (AAAA-MM-DD) hasta la que se gana "Pionero"
const CACHE_MS = 10 * 60 * 1000;
const cache = new Map();

function setup(ctx) {
  ({ db, api, apiFiles, log, warn, getGuildId, appName, community, publicUrl, postInHaven } = ctx);
  locked = ctx.lockedChannelIds || (() => new Set());
  db.exec(`
    CREATE TABLE IF NOT EXISTS puente_dias (
      haven_user_id INTEGER NOT NULL,
      dia TEXT NOT NULL,
      n INTEGER NOT NULL,
      PRIMARY KEY (haven_user_id, dia)
    );
    CREATE TABLE IF NOT EXISTS puente_recuerdos (
      dia TEXT PRIMARY KEY,
      message_id INTEGER,
      discord_message_id TEXT,
      at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_puente_recuerdos_msg ON puente_recuerdos(message_id);
    CREATE TABLE IF NOT EXISTS puente_semanas (
      semana TEXT PRIMARY KEY,
      datos TEXT NOT NULL,
      discord_message_id TEXT,
      at INTEGER NOT NULL
    );
  `);
  // La primera vez no se publica la semana anterior (puede ser de antes de usar esto)
  if (!db.prepare('SELECT 1 FROM puente_semanas LIMIT 1').get()) {
    db.prepare('INSERT OR IGNORE INTO puente_semanas (semana, datos, at) VALUES (?, ?, ?)').run(weekStartArt(Date.now() - 7 * 864e5).day, '{"omitida":true}', Date.now());
  }
  // "Un día como hoy" arranca al dia siguiente de instalarlo (no de golpe al encender)
  if (!db.prepare('SELECT 1 FROM puente_recuerdos LIMIT 1').get()) {
    db.prepare('INSERT OR IGNORE INTO puente_recuerdos (dia, message_id, at) VALUES (?, NULL, ?)').run(dayOf(Date.now()), Date.now());
  }
  setTimeout(() => { try { updateDays(); } catch (err) { warn('logros: dias:', err.message); } }, 30 * 1000);
  setInterval(() => { try { updateDays(); } catch (err) { warn('logros: dias:', err.message); } }, 2 * 60 * 1000);
  setInterval(() => { maybePostSummary().catch(err => warn('logros: resumen:', err.message)); }, 10 * 60 * 1000);
  setInterval(() => { maybePostMemory().catch(err => warn('logros: recuerdo:', err.message)); }, 10 * 60 * 1000);
  // Rehacer recuerdos editandolos (para el admin del servidor): un archivo
  // /opt/haven/haven-data/puente-recuerdo-editar (en el contenedor /data/...) con
  // una linea por recuerdo: "AAAA-MM-DD" (edita su propio mensaje) o
  // "AAAA-MM-DD <id del mensaje de Discord>" (lo pone en ese otro mensaje del bot).
  setInterval(async () => {
    const flag = '/data/puente-recuerdo-editar';
    if (!fsMedia.existsSync(flag)) return;
    let lines = [];
    try { lines = fsMedia.readFileSync(flag, 'utf8').split('\n').map(l => l.trim()).filter(Boolean); fsMedia.unlinkSync(flag); } catch { return; }
    const ok = lines.every(l => /^\d{4}-\d{2}-\d{2}(?: \d{15,25})?$/.test(l));
    if (!ok) { warn('logros: recuerdo a editar: lineas no validas, no hago nada'); return; }
    for (const l of lines) {
      const [dia, into] = l.split(' ');
      try { log('logros: recuerdo editado:', JSON.stringify(await editMemory(dia, into))); } catch (err) { warn('logros: recuerdo editado:', err.message); }
    }
  }, 30 * 1000).unref();
}

// ── Fechas ───────────────────────────────────────────────────────────────
const parseTs = s => Date.parse(String(s).replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? '' : 'Z'));
const sqlTs = ms => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
const local = ms => new Date(ms + ZONE_H * 3600e3);              // en UTC = hora local
const dayOf = ms => local(ms).toISOString().slice(0, 10);
const SQL_DAY = `date(created_at, '${ZONE_H >= 0 ? '+' : ''}${ZONE_H} hours')`;
// Lunes 00:00 (hora local) de la semana de ms
function weekStartArt(ms) {
  const l = local(ms);
  const back = (l.getUTCDay() + 6) % 7;
  const startLocal = Date.UTC(l.getUTCFullYear(), l.getUTCMonth(), l.getUTCDate() - back);
  return { day: new Date(startLocal).toISOString().slice(0, 10), ms: startLocal - ZONE_H * 3600e3 };
}
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const num = n => Number(n).toLocaleString('es-AR');

// ── Quien es quien ───────────────────────────────────────────────────────
const ghost = () => { const g = db.prepare("SELECT id FROM users WHERE username = 'discord-historial'").get(); return g ? g.id : -1; };
const linkOf = havenId => db.prepare('SELECT discord_user_id FROM puente_vinculos WHERE haven_user_id = ?').get(havenId);
const userRow = id => db.prepare('SELECT id, username, COALESCE(display_name, username) nombre, avatar, created_at, is_admin FROM users WHERE id = ?').get(id);
// Mensajes escritos desde Haven (ni importados ni traidos de Discord)
const FROM_HAVEN = `m.imported_from IS NULL AND COALESCE(m.is_webhook, 0) = 0 AND NOT EXISTS (SELECT 1 FROM puente_autores pa WHERE pa.message_id = m.id)`;

// ── Rachas ───────────────────────────────────────────────────────────────
function updateDays() {
  const key = 'puente_dias_ultimo';
  const last = Number((db.prepare('SELECT value FROM server_settings WHERE key = ?').get(key) || {}).value || 0);
  const max = (db.prepare('SELECT MAX(id) id FROM messages').get() || {}).id || 0;
  if (max <= last) return;
  const rows = db.prepare(`SELECT m.user_id u, ${SQL_DAY.replace('created_at', 'm.created_at')} dia, COUNT(*) n FROM messages m
    WHERE m.id > ? AND m.id <= ? AND m.user_id IS NOT NULL AND m.user_id != ? AND ${FROM_HAVEN} GROUP BY 1, 2`).all(last, max, ghost());
  const up = db.prepare('INSERT INTO puente_dias (haven_user_id, dia, n) VALUES (?, ?, ?) ON CONFLICT(haven_user_id, dia) DO UPDATE SET n = n + excluded.n');
  db.transaction(() => {
    for (const r of rows) if (r.dia) up.run(r.u, r.dia, r.n);
    db.prepare('INSERT OR REPLACE INTO server_settings (key, value) VALUES (?, ?)').run(key, String(max));
  })();
}

function streaks(havenId) {
  const days = db.prepare('SELECT dia FROM puente_dias WHERE haven_user_id = ? ORDER BY dia').all(havenId).map(r => r.dia);
  let best = 0, run = 0, prev = null;
  for (const d of days) {
    run = prev && Date.parse(d) - Date.parse(prev) === 864e5 ? run + 1 : 1;
    best = Math.max(best, run); prev = d;
  }
  const today = dayOf(Date.now()), yesterday = dayOf(Date.now() - 864e5);
  const current = prev === today || prev === yesterday ? run : 0;
  return { actual: current, mejor: best, dias: days.length, hoy: prev === today };
}

// ── Mensajes de una persona ──────────────────────────────────────────────
function personMessages(havenId) {
  const l = linkOf(havenId);
  const cols = 'm.id, m.channel_id, m.created_at, m.content, m.reply_to';
  const discord = l ? db.prepare(`SELECT ${cols}, 0 h FROM puente_autores pa JOIN messages m ON m.id = pa.message_id WHERE pa.discord_user_id = ?`).all(String(l.discord_user_id)) : [];
  const haven = db.prepare(`SELECT ${cols}, 1 h FROM messages m WHERE m.user_id = ? AND ${FROM_HAVEN}`).all(havenId);
  return { link: l, rows: discord.concat(haven) };
}

const channelMap = () => {
  const m = new Map();
  for (const c of db.prepare('SELECT id, name, code, is_dm, discord_channel_id, parent_channel_id FROM channels').all()) m.set(c.id, c);
  return m;
};
// Canales que cualquiera puede ver: ni mensajes directos ni privados
function publicChannel(c, lockedIds) { return c && !c.is_dm && !lockedIds.has(c.id); }

// Cuantos mensajes tiene cada persona (para el puesto), cada hora
let rankCache = null;
function ranking() {
  if (rankCache && Date.now() - rankCache.at < 3600e3) return rankCache;
  const counts = new Map();
  for (const r of db.prepare('SELECT discord_user_id d, COUNT(*) n FROM puente_autores GROUP BY 1').all()) counts.set('d' + r.d, r.n);
  const links = new Map(db.prepare('SELECT haven_user_id h, discord_user_id d FROM puente_vinculos').all().map(r => [r.h, r.d]));
  for (const r of db.prepare(`SELECT m.user_id u, COUNT(*) n FROM messages m WHERE m.user_id IS NOT NULL AND m.user_id != ? AND ${FROM_HAVEN} GROUP BY 1`).all(ghost())) {
    const k = links.has(r.u) ? 'd' + links.get(r.u) : 'h' + r.u;
    counts.set(k, (counts.get(k) || 0) + r.n);
  }
  const sorted = [...counts.values()].sort((a, b) => b - a);
  rankCache = { at: Date.now(), sorted, counts, total: sorted.length };
  return rankCache;
}
const placeOf = n => { const r = ranking(); let lo = 0; while (lo < r.sorted.length && r.sorted[lo] > n) lo++; return { puesto: lo + 1, de: r.total }; };

// Emojis personalizados de Haven: nombre -> imagen, y el id de Discord de los importados -> nombre
let customCache = null;
function customEmojis() {
  if (customCache && Date.now() - customCache.at < CACHE_MS) return customCache;
  const url = new Map(db.prepare('SELECT name, filename FROM custom_emojis').all().map(r => [r.name, '/uploads/' + r.filename]));
  let byDiscord = new Map();
  try { byDiscord = new Map(db.prepare('SELECT discord_id, name FROM puente_emojis').all().map(r => [String(r.discord_id), r.name])); } catch { /* sin la tabla */ }
  customCache = { at: Date.now(), url, byDiscord };
  return customCache;
}

function excerpt(s, n = 140) {
  let t = String(s || '').replace(/!\[[^\]]*\]\([^)]*\)/g, '🖼️').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/(^|\s)\/uploads\/\S+/g, '$1🖼️').replace(/<a?:(\w+):\d+>/g, ':$1:').replace(/\s+/g, ' ').trim();
  if (t.length > n) t = t.slice(0, n - 1).trimEnd() + '…';
  return t.replace(/@(everyone|here)/gi, '@​$1'); // citado, nunca avisa a todos
}
function messageUrl(m, channels) {
  const c = channels.get(m.channel_id);
  if (!c) return null;
  const base = (publicUrl || '').replace(/\/+$/, '');
  return `${base}/app?channel=${encodeURIComponent(c.code)}&message=${m.id}`;
}

// ── Tu historia ──────────────────────────────────────────────────────────
function historia(havenId) {
  const hit = cache.get('h' + havenId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.data;
  const u = userRow(havenId);
  if (!u) return null;
  const { link, rows } = personMessages(havenId);
  const channels = channelMap(), lockedIds = locked();
  const pub = rows.filter(m => publicChannel(channels.get(m.channel_id), lockedIds)).sort((a, b) => a.id - b.id);
  const byTime = pub.slice().sort((a, b) => parseTs(a.created_at) - parseTs(b.created_at));
  const perChannel = new Map(), perYear = new Map(), hours = new Array(24).fill(0), weekdays = new Array(7).fill(0), emojis = new Map();
  const custom = customEmojis();
  let words = 0, fromHaven = 0;
  for (const m of pub) {
    const ms = parseTs(m.created_at);
    if (!Number.isFinite(ms)) continue;
    const l = local(ms);
    hours[l.getUTCHours()]++; weekdays[l.getUTCDay()]++;
    perYear.set(l.getUTCFullYear(), (perYear.get(l.getUTCFullYear()) || 0) + 1);
    const c = channels.get(m.channel_id);
    // Los hilos cuentan para su canal
    perChannel.set(c.id, (perChannel.get(c.id) || 0) + 1);
    if (m.h) fromHaven++;
    const text = String(m.content || '');
    words += (text.replace(/!?\[[^\]]*\]\([^)]*\)/g, '').match(/[\p{L}\p{N}]+/gu) || []).length;
    for (const e of text.match(/\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*/gu) || []) emojis.set(e, (emojis.get(e) || 0) + 1);
    // Los personalizados (:nombre:, o <:nombre:id> en mensajes viejos de Discord)
    for (const m of text.matchAll(/<a?:\w+:(\d+)>|:([\w~-]+):/g)) {
      const name = m[1] ? custom.byDiscord.get(m[1]) : m[2];
      if (name && custom.url.has(name)) emojis.set(':' + name, (emojis.get(':' + name) || 0) + 1);
    }
  }
  const top = (map, n) => [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
  const first = byTime[0];
  // A quien le respondio mas
  const replyIds = pub.filter(m => m.reply_to).map(m => m.reply_to);
  const repliedTo = new Map();
  for (let i = 0; i < replyIds.length; i += 500) {
    const chunk = replyIds.slice(i, i + 500);
    for (const p of db.prepare(`SELECT p.user_id, p.webhook_username, pa.discord_user_id d FROM messages p LEFT JOIN puente_autores pa ON pa.message_id = p.id WHERE p.id IN (${chunk.map(() => '?').join(',')})`).all(...chunk)) {
      if (link && p.d === String(link.discord_user_id)) continue;
      if (!p.d && p.user_id === havenId) continue;
      const name = nameOf(p);
      if (name) repliedTo.set(name, (repliedTo.get(name) || 0) + 1);
    }
  }
  // Reacciones que recibieron sus mensajes, y el mas reaccionado
  let reactions = 0, best = null;
  const ids = pub.map(m => m.id);
  for (let i = 0; i < ids.length; i += 900) {
    const chunk = ids.slice(i, i + 900);
    const rs = db.prepare(`SELECT message_id id, COUNT(*) n FROM reactions WHERE message_id IN (${chunk.map(() => '?').join(',')}) GROUP BY 1`).all(...chunk);
    for (const r of rs) { reactions += r.n; if (!best || r.n > best.n) best = r; }
  }
  const bestMsg = best ? pub.find(m => m.id === best.id) : null;
  const total = pub.length;
  const data = {
    nombre: u.nombre, usuario: u.username, avatar: u.avatar || null, app: appName(), comunidad: community(),
    vinculado: !!link,
    desde: first ? first.created_at : null,
    primero: first ? { texto: excerpt(first.content, 200), canal: (channels.get(first.channel_id) || {}).name, url: messageUrl(first, channels), fecha: first.created_at } : null,
    mensajes: total, desdeApp: fromHaven, palabras: words,
    ...placeOf(ranking().counts.get(link ? 'd' + link.discord_user_id : 'h' + havenId) || total),
    canales: top(perChannel, 3).map(([id, n]) => ({ nombre: channels.get(id).name, n })),
    anios: [...perYear.entries()].sort((a, b) => a[0] - b[0]).map(([anio, n]) => ({ anio, n })),
    horas: hours, dias: weekdays,
    emojis: top(emojis, 3).map(([e, n]) => (e.startsWith(':') ? { nombre: e.slice(1), url: custom.url.get(e.slice(1)), n } : { e, n })),
    respuestas: top(repliedTo, 3).map(([nombre, n]) => ({ nombre, n })),
    reacciones: reactions,
    masReaccionado: bestMsg ? { texto: excerpt(bestMsg.content, 160), n: best.n, canal: (channels.get(bestMsg.channel_id) || {}).name, url: messageUrl(bestMsg, channels) } : null,
    racha: streaks(havenId),
    medallas: medallas(havenId, { total, first, hours }),
  };
  // Las imagenes de los emojis personalizados que aparecen en las citas
  data.personalizados = {};
  for (const t of [data.primero && data.primero.texto, data.masReaccionado && data.masReaccionado.texto]) {
    for (const m of String(t || '').matchAll(/:([\w~-]+):/g)) if (custom.url.has(m[1])) data.personalizados[m[1]] = custom.url.get(m[1]);
  }
  cache.set('h' + havenId, { at: Date.now(), data });
  return data;
}
function nameOf(p) {
  if (p.d) {
    const l = db.prepare('SELECT u.display_name, u.username FROM puente_vinculos v JOIN users u ON u.id = v.haven_user_id WHERE v.discord_user_id = ?').get(p.d);
    if (l) return l.display_name || l.username;
    return p.webhook_username || null;
  }
  if (p.user_id && p.user_id !== ghost()) { const u = userRow(p.user_id); return u ? u.nombre : null; }
  return p.webhook_username || null;
}

// ── Medallas ─────────────────────────────────────────────────────────────
// Cada una: { id, emoji, nombre, detalle }
function medallas(havenId, pre) {
  const key = 'm' + havenId;
  const hit = cache.get(key);
  if (!pre && hit && Date.now() - hit.at < CACHE_MS) return hit.data;
  const u = userRow(havenId);
  if (!u || u.username === 'discord-historial') return [];
  let total, first, hours;
  if (pre) ({ total, first, hours } = pre);
  else {
    const { rows } = personMessages(havenId);
    const channels = channelMap();
    const pub = rows.filter(m => { const c = channels.get(m.channel_id); return c && !c.is_dm; });
    total = pub.length; hours = new Array(24).fill(0); first = null;
    for (const m of pub) {
      const ms = parseTs(m.created_at);
      if (!Number.isFinite(ms)) continue;
      hours[local(ms).getUTCHours()]++;
      if (!first || ms < parseTs(first.created_at)) first = m;
    }
  }
  const s = streaks(havenId);
  const list = [];
  const add = (id, emoji, nombre, detalle) => list.push({ id, emoji, nombre, detalle });
  const pioneerUntil = PIONEER_UNTIL || firstMonthEnd();
  if (pioneerUntil && String(u.created_at).slice(0, 10) <= pioneerUntil) add('pionero', '🌱', 'Pionero', `Se sumó a ${appName()} en su primer mes`);
  if (linkOf(havenId)) add('puente', '🔗', 'Discord', 'Vinculó su cuenta de Discord');
  if (s.mejor >= 30) add('racha30', '⚡', 'Racha de 30 días', `${s.mejor} días seguidos escribiendo en ${appName()}`);
  else if (s.mejor >= 7) add('racha7', '🔥', 'Racha de 7 días', `${s.mejor} días seguidos escribiendo en ${appName()}`);
  if (total >= 10000) add('leyenda', '🗿', 'Leyenda', `${num(total)} mensajes`);
  else if (total >= 1000) add('mil', '💬', 'Mil mensajes', `${num(total)} mensajes`);
  if (first) {
    const y = local(parseTs(first.created_at)).getUTCFullYear();
    if (Date.now() - parseTs(first.created_at) > 2 * 365 * 864e5) add('veterano', '🏛️', `Desde ${y}`, `Escribe en ${community()} desde ${y}`);
  }
  const night = hours[3] + hours[4] + hours[5];
  if (night >= 200) add('buho', '🦉', 'Búho', `${num(night)} mensajes entre las 3 y las 6 de la mañana`);
  const weeks = destacado(havenId);
  if (weeks) add('destacado', '⭐', 'Destacado de la semana', weeks === 1 ? `Estuvo en el podio de #${SUMMARY_CHANNEL}` : `Estuvo ${weeks} veces en el podio de #${SUMMARY_CHANNEL}`);
  let inv = 0;
  try { inv = require('./invitaciones.js').count(havenId).invitados; } catch { /* sin invitaciones */ }
  // Marketplace (mercado.js): la reputacion, y la medalla con 5 ventas sin ninguna opinion mala
  let rep = null;
  try { rep = require('./mercado.js').summary(havenId); } catch { /* sin marketplace */ }
  if (rep && rep.ventas >= 5 && rep.negativas === 0 && rep.positivas >= 5) add('mercado-confiable', '🏪', 'Vendedor confiable', `${rep.ventas} ventas en el Marketplace, todas con buena opinión`);
  if (rep && rep.porcentaje !== null) add('mercado-rep', '⭐', `${rep.porcentaje}% · ${rep.positivas + rep.negativas}`,
    `Marketplace: ${rep.positivas} 👍 · ${rep.negativas} 👎 (${rep.ventas} ${rep.ventas === 1 ? 'venta' : 'ventas'}, ${rep.compras} ${rep.compras === 1 ? 'compra' : 'compras'})`);
  // Juegos (truco.js): 10 partidas de truco ganadas contra otras personas
  let tr = null;
  try { tr = require('./truco.js').stats(havenId); } catch { /* sin juegos */ }
  if (tr && tr.ganadas >= 10) add('truquero', '🃏', 'Viejo truquero', `Ganó ${tr.ganadas} partidas de truco en ${appName()}`);
  // La mudanza (mudanza-plan.js): Fundador y Campeón de la Copa
  try { for (const m of require('./mudanza-plan.js').insignias(havenId)) add(...m); } catch { /* sin mudanza */ }
  if (inv >= 1) add('reclutador', '🤝', inv >= 25 ? 'Reclutador ×25' : inv >= 10 ? 'Reclutador ×10' : inv >= 3 ? 'Reclutador ×3' : 'Reclutador',
    `Trajo ${inv === 1 ? 'a 1 persona' : `a ${inv} personas`} a ${appName()}`);
  if (!pre) cache.set(key, { at: Date.now(), data: list });
  return list;
}
// Cuando se creo la primera cuenta de verdad, mas un mes
function firstMonthEnd() {
  const r = db.prepare("SELECT MIN(created_at) a FROM users WHERE username != 'discord-historial'").get();
  if (!r || !r.a) return '';
  const d = new Date(parseTs(r.a)); d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString().slice(0, 10);
}
function destacado(havenId) {
  const l = linkOf(havenId);
  const k = l ? 'd' + l.discord_user_id : 'h' + havenId;
  let n = 0;
  for (const r of db.prepare('SELECT datos FROM puente_semanas').all()) {
    try { if ((JSON.parse(r.datos).podio || []).includes(k)) n++; } catch { /* fila vieja */ }
  }
  return n;
}

// ── Resumen de la semana ─────────────────────────────────────────────────
function weekSummary(startMs) {
  const endMs = startMs + 7 * 864e5;
  const channels = channelMap(), lockedIds = locked(), g = ghost();
  const links = new Map(db.prepare('SELECT haven_user_id h, discord_user_id d FROM puente_vinculos').all().map(r => [r.h, String(r.d)]));
  const pubIds = [...channels.values()].filter(c => publicChannel(c, lockedIds)).map(c => c.id);
  const rows = [];
  const q = db.prepare(`SELECT m.id, m.channel_id, m.user_id, m.webhook_username, m.content, m.imported_from, m.is_webhook, pa.discord_user_id d
    FROM messages m LEFT JOIN puente_autores pa ON pa.message_id = m.id WHERE m.channel_id = ? AND m.created_at >= ? AND m.created_at < ?`);
  for (const id of pubIds) rows.push(...q.all(id, sqlTs(startMs), sqlTs(endMs)));
  const people = new Map(), perChannel = new Map();
  let total = 0, fromHaven = 0;
  for (const m of rows) {
    if (/^🧵 \*\*/.test(m.content || '') && m.user_id === g) continue; // inicio de hilo armado por el puente
    const k = m.d ? 'd' + m.d : (m.user_id && m.user_id !== g ? (links.has(m.user_id) ? 'd' + links.get(m.user_id) : 'h' + m.user_id) : null);
    if (!k) continue; // de un bot o un webhook
    total++;
    if (!m.d && !m.imported_from && !m.is_webhook) fromHaven++;
    const p = people.get(k) || { n: 0, sample: m };
    p.n++; people.set(k, p);
    const c = channels.get(m.channel_id);
    perChannel.set(c.id, (perChannel.get(c.id) || 0) + 1);
  }
  const top = (map, n) => [...map.entries()].sort((a, b) => (b[1].n || b[1]) - (a[1].n || a[1])).slice(0, n);
  const podium = top(people, 5).map(([k, p]) => ({ k, nombre: nameOf({ d: p.sample.d || (k.startsWith('d') ? k.slice(1) : null), user_id: p.sample.user_id, webhook_username: p.sample.webhook_username }), n: p.n }));
  // El mensaje con mas reacciones
  let best = null;
  const ids = rows.map(m => m.id);
  for (let i = 0; i < ids.length; i += 900) {
    const chunk = ids.slice(i, i + 900);
    const r = db.prepare(`SELECT message_id id, COUNT(*) n FROM reactions WHERE message_id IN (${chunk.map(() => '?').join(',')}) GROUP BY 1 ORDER BY n DESC LIMIT 1`).get(...chunk);
    if (r && (!best || r.n > best.n)) best = r;
  }
  let destacadoMsg = null;
  if (best && best.n >= 3) {
    const m = rows.find(x => x.id === best.id);
    const c = channels.get(m.channel_id);
    const out = db.prepare('SELECT discord_message_id FROM puente_salientes WHERE haven_message_id = ?').get(m.id);
    const did = (db.prepare('SELECT discord_message_id FROM messages WHERE id = ?').get(m.id) || {}).discord_message_id;
    const discordId = out ? out.discord_message_id : (did && /^\d+$/.test(did) ? did : null);
    destacadoMsg = { texto: excerpt(m.content, 160), n: best.n, nombre: nameOf(m), canal: c, discordId };
  }
  // Rachas que siguen vivas (hoy o ayer)
  const rachas = db.prepare('SELECT DISTINCT haven_user_id h FROM puente_dias WHERE dia >= ?').all(dayOf(Date.now() - 864e5))
    .map(r => ({ h: r.h, s: streaks(r.h) })).filter(r => r.s.actual >= 3).sort((a, b) => b.s.actual - a.s.actual).slice(0, 3)
    .map(r => ({ nombre: (userRow(r.h) || {}).nombre, dias: r.s.actual }));
  const nuevos = db.prepare(`SELECT COALESCE(u.display_name, u.username) n FROM puente_vinculos v JOIN users u ON u.id = v.haven_user_id
    WHERE v.linked_at >= ? AND v.linked_at < ? ORDER BY v.linked_at`).all(sqlTs(startMs), sqlTs(endMs)).map(r => r.n);
  let reclutadores = [];
  try { reclutadores = require('./invitaciones.js').weekTop(sqlTs(startMs), sqlTs(endMs)); } catch { /* sin invitaciones */ }
  return {
    desde: startMs, total, fromHaven, reclutadores,
    canales: top(perChannel, 3).map(([id, n]) => ({ c: channels.get(id), n })),
    podio: podium, destacado: destacadoMsg, rachas, nuevos,
  };
}

function summaryText(s) {
  const a = local(s.desde), b = local(s.desde + 6 * 864e5);
  const range = a.getUTCMonth() === b.getUTCMonth()
    ? `del ${a.getUTCDate()} al ${b.getUTCDate()} de ${MESES[b.getUTCMonth()]}`
    : `del ${a.getUTCDate()} de ${MESES[a.getUTCMonth()]} al ${b.getUTCDate()} de ${MESES[b.getUTCMonth()]}`;
  const ch = c => (c.discord_channel_id ? `<#${c.discord_channel_id}>` : '#' + c.name);
  const medal = ['🥇', '🥈', '🥉', '4.', '5.'];
  const lines = [`📰 **Qué pasó en ${community()}** · semana ${range}`, ''];
  lines.push(`💬 **${num(s.total)} mensajes**` + (s.total ? ` · ${Math.round(100 * s.fromHaven / s.total)} % desde ${appName()}` : ''));
  if (s.canales.length) lines.push(`📈 **Los canales que más se movieron:** ${s.canales.map(x => `${ch(x.c)} (${num(x.n)})`).join(' · ')}`);
  if (s.podio.length) lines.push(`🗣️ **Los que más hablaron:** ${s.podio.map((p, i) => `${medal[i]} ${p.nombre} (${num(p.n)})`).join(' · ')}`);
  if (s.destacado) {
    const d = s.destacado;
    const g = getGuildId();
    const linkTxt = d.discordId && d.canal.discord_channel_id && g ? ` · [ver mensaje](https://discord.com/channels/${g}/${d.canal.discord_channel_id}/${d.discordId})` : '';
    lines.push(`⭐ **El mensaje con más reacciones** (${d.n}), de ${d.nombre} en ${ch(d.canal)}${linkTxt}`);
    if (d.texto) lines.push('> ' + toDiscordEmojis(d.texto).replace(/\n/g, ' '));
  }
  if (s.rachas.length) lines.push(`🔥 **Rachas en ${appName()}:** ${s.rachas.map(r => `${r.nombre} (${r.dias} días seguidos)`).join(' · ')}`);
  if (s.reclutadores && s.reclutadores.length) lines.push(`🤝 **Reclutadores de la semana:** ${s.reclutadores.map(r => `${r.nombre} (${r.n})`).join(' · ')}`);
  if (s.nuevos.length) lines.push(`🆕 **Se sumaron a ${appName()}:** ${s.nuevos.slice(0, 12).join(', ')}${s.nuevos.length > 12 ? ` y ${s.nuevos.length - 12} más` : ''}. ¡Bienvenidos!`);
  const base = (publicUrl || '').replace(/\/+$/, '');
  if (base) {
    lines.push('');
    lines.push(`👉 ¿Todavía no estás en ${appName()}? Entrá y creá tu cuenta en un clic: <${base}>`);
    lines.push(`📖 Mirá tu historia en ${community()}: <${base}/puente/historia>`);
  }
  let text = lines.join('\n');
  if (text.length > 2000) text = text.slice(0, 1999) + '…';
  return text;
}

async function summaryChannelId() {
  const g = getGuildId();
  if (!g) return null;
  const all = await api('GET', `/guilds/${g}/channels`);
  if (!Array.isArray(all)) return null;
  const c = all.find(x => x.type === 0 && x.name === SUMMARY_CHANNEL);
  return c ? c.id : null;
}

// ── Un día como hoy ──────────────────────────────────────────────────────
// Todos los dias a las RECUERDO_HOUR, en el canal del resumen: el mensaje con
// mas reacciones de esta fecha en años anteriores (de canales que ve
// cualquiera, ni +18), con el enlace a la conversacion en la app. Nunca se
// repite un mensaje (tabla puente_recuerdos).
const RECUERDO_HOUR = 12;
const RECUERDO_YEARS = 8;

function memoryPick(nowMs) {
  const channels = channelMap(), lockedIds = locked();
  const nsfw = new Set(db.prepare('SELECT id FROM channels WHERE COALESCE(is_nsfw, 0) = 1').all().map(r => r.id));
  const pub = [...channels.values()].filter(c => publicChannel(c, lockedIds) && !nsfw.has(c.id) && !(c.parent_channel_id && nsfw.has(c.parent_channel_id)));
  const used = db.prepare('SELECT 1 FROM puente_recuerdos WHERE message_id = ?');
  const today = local(nowMs);
  const q = db.prepare(`SELECT m.id, m.channel_id, m.user_id, m.webhook_username, m.content, m.created_at, pa.discord_user_id d
    FROM messages m LEFT JOIN puente_autores pa ON pa.message_id = m.id WHERE m.channel_id = ? AND m.created_at >= ? AND m.created_at < ?`);
  const g = ghost();
  let best = null;
  for (let k = 1; k <= RECUERDO_YEARS; k++) {
    const startLocal = Date.UTC(today.getUTCFullYear() - k, today.getUTCMonth(), today.getUTCDate());
    const from = sqlTs(startLocal - ZONE_H * 3600e3), to = sqlTs(startLocal - ZONE_H * 3600e3 + 864e5);
    const rows = [];
    for (const c of pub) rows.push(...q.all(c.id, from, to));
    const ok = rows.filter(m => {
      const t = excerpt(m.content, 400);
      // Charla de verdad: ni anuncios a todos, ni solo un enlace o una imagen, ni muy corto
      if (/@(everyone|here)/i.test(m.content || '')) return false;
      if (t.split('🖼️').join('').replace(/https?:\/\/\S+/g, '').trim().length < 15) return false;
      if (/^🧵 \*\*/.test(m.content || '') && m.user_id === g) return false; // inicio de hilo armado por el puente
      return !used.get(m.id);
    });
    for (let i = 0; i < ok.length; i += 900) {
      const chunk = ok.slice(i, i + 900).map(m => m.id);
      const r = db.prepare(`SELECT message_id id, COUNT(*) n FROM reactions WHERE message_id IN (${chunk.map(() => '?').join(',')}) GROUP BY 1 ORDER BY n DESC LIMIT 1`).get(...chunk);
      if (r && (!best || r.n > best.n)) best = { n: r.n, years: k, m: ok.find(x => x.id === r.id) };
    }
  }
  if (!best || best.n < 2) return null; // un recuerdo que nadie reacciono no vale la pena
  return memoryOf(best.m, best.years, best.n, channels);
}

// El recuerdo de un mensaje: canal, quien, texto, imagenes y enlace a la app
function memoryOf(m, years, n, channels = channelMap()) {
  const c = channels.get(m.channel_id);
  if (!c) return null;
  const best = { years, n };
  const base = (publicUrl || '').replace(/\/+$/, '');
  const media = mediaOf(m.content);
  // Con las imagenes adjuntas, sin el 🖼️ que las reemplazaba en el texto
  const texto = media.files.length || media.links.length
    ? excerpt(String(m.content || '').replace(MEDIA_RE, ' ').replace(EXT_IMG_RE, ' '), 300) : excerpt(m.content, 300);
  return {
    id: m.id, years: best.years, n: best.n, canal: c, nombre: nameOf(m) || 'Alguien',
    texto, media, fecha: m.created_at,
    url: `${base}/app?channel=${encodeURIComponent(c.code)}&message=${m.id}`,
  };
}

// Las fotos, GIFs y videos del mensaje original, para que el recuerdo los muestre
// (sin ellos perdia la gracia): los subidos a la app van adjuntos (asi se ven
// igual en Discord y en la app, y los marcados como spoiler siguen tapados); los
// de afuera (GIPHY, Tenor, una imagen de otra pagina) como enlace, que Discord y
// la app muestran como imagen. Hasta 4 y unos 9 MB entre todos.
const fsMedia = require('fs'), pathMedia = require('path');
const MEDIA_RE = /(?:!\[[^\]]*\]\()?((?:spoiler-img:)?\/uploads\/[^\s)|]+?\.(?:png|jpe?g|gif|webp|mp4|webm|mov))(?:\|[^)\s]*)?\)?/gi;
const EXT_IMG_RE = /https?:\/\/(?:[^\s<>]*(?:giphy\.com|tenor\.com)[^\s<>]*|[^\s<>]+\.(?:png|jpe?g|gif|webp)(?:\?[^\s<>]*)?)/gi;
const MEDIA_MAX = 4, MEDIA_BYTES = 9 * 1024 * 1024;
function mediaOf(content) {
  const files = [], links = [];
  let total = 0;
  for (const m of String(content || '').matchAll(MEDIA_RE)) {
    if (files.length + links.length >= MEDIA_MAX) break;
    const spoiler = m[1].startsWith('spoiler-img:');
    const rel = m[1].replace(/^spoiler-img:/, '').replace(/^\/uploads\//, '');
    if (rel.includes('..')) continue;
    const file = pathMedia.join('/data/uploads', rel);
    let size = 0;
    try { size = fsMedia.statSync(file).size; } catch { continue; }
    if (total + size > MEDIA_BYTES) { if (publicUrl) links.push(publicUrl.replace(/\/+$/, '') + '/uploads/' + rel); continue; }
    total += size;
    files.push({ file, name: (spoiler ? 'SPOILER_' : '') + pathMedia.basename(rel) });
  }
  for (const m of String(content || '').matchAll(EXT_IMG_RE)) {
    if (files.length + links.length >= MEDIA_MAX) break;
    if (!links.includes(m[0])) links.push(m[0]);
  }
  return { files, links };
}

// :nombre: de Haven -> el emoji de Discord (<:nombre:id>) si vino de Discord, para que alla se vea la imagen
function toDiscordEmojis(text) {
  let map = new Map();
  try { map = new Map(db.prepare('SELECT name, discord_name, discord_id, animated FROM puente_emojis').all().map(r => [r.name, r])); } catch { return text; }
  return String(text).replace(/:([\w~-]+):/g, (all, n) => { const e = map.get(n); return e ? `<${e.animated ? 'a' : ''}:${e.discord_name}:${e.discord_id}>` : all; });
}

function memoryText(r) {
  const d = local(parseTs(r.fecha));
  const ch = r.canal.discord_channel_id ? `<#${r.canal.discord_channel_id}>` : '#' + r.canal.name;
  const hace = r.years === 1 ? 'hace 1 año' : `hace ${r.years} años`;
  const lines = [
    `📅 **Un día como hoy, ${hace}** (${d.getUTCDate()} de ${MESES[d.getUTCMonth()]} de ${d.getUTCFullYear()}), en ${ch}:`,
    '',
    `**${r.nombre}:**`,
    ...toDiscordEmojis(r.texto).split('\n').map(l => '> ' + l),
    '',
    ...(r.media && r.media.links.length ? ['', ...r.media.links] : []),
    '',
    `⭐ ${r.n} reacciones · 💬 Mirá la conversación completa en ${appName()}: <${r.url}>`,
  ];
  let text = lines.join('\n');
  if (text.length > 2000) text = text.slice(0, 1999) + '…';
  return text;
}

let remembering = false;
async function maybePostMemory(force) {
  if (remembering || !getGuildId()) return;
  const now = Date.now();
  const day = dayOf(now);
  if (!force && local(now).getUTCHours() < RECUERDO_HOUR) return;
  if (!force && db.prepare('SELECT 1 FROM puente_recuerdos WHERE dia = ?').get(day)) return;
  remembering = true;
  try {
    const r = memoryPick(now);
    if (!r) { db.prepare('INSERT OR IGNORE INTO puente_recuerdos (dia, message_id, at) VALUES (?, NULL, ?)').run(day, now); return; }
    const sent = await publishMemory(r);
    if (!sent) return;
    db.prepare('INSERT OR REPLACE INTO puente_recuerdos (dia, message_id, discord_message_id, at) VALUES (?, ?, ?, ?)').run(day, r.id, sent.id, now);
    log(`logros: "Un día como hoy" publicado (mensaje de hace ${r.years} años, ${r.n} reacciones)`);
  } finally { remembering = false; }
}

// Publica un recuerdo en Discord (con sus imagenes) y en la app. Devuelve el mensaje de Discord.
async function publishMemory(r) {
  const channelId = await summaryChannelId();
  if (!channelId) { warn(`logros: no hay un canal #${SUMMARY_CHANNEL} en Discord: el recuerdo no se publica`); return null; }
  // Sin "flags: 4" (sin vistas previas) cuando lleva imagenes de afuera: asi Discord las muestra.
  // El enlace a la app va entre < >, que no arma vista previa.
  const payload = { content: memoryText(r), allowed_mentions: { parse: [] } };
  if (!r.media.links.length) payload.flags = 4;
  const files = [];
  for (const f of r.media.files) { try { files.push({ data: fsMedia.readFileSync(f.file), name: f.name }); } catch { /* ya no esta */ } }
  let sent = files.length && apiFiles ? await apiFiles('POST', `/channels/${channelId}/messages`, payload, files) : await api('POST', `/channels/${channelId}/messages`, payload);
  if (files.length && (!sent || sent.__error)) {
    warn('logros: no pude adjuntar las imagenes del recuerdo, va sin ellas:', sent && sent.__error);
    sent = await api('POST', `/channels/${channelId}/messages`, payload);
  }
  if (!sent || sent.__error) { warn('logros: Discord no dejo publicar el recuerdo:', sent && sent.__error); return null; }
  try { await postInHaven(sent); } catch (err) { warn('logros: recuerdo en Haven:', err.message); }
  return sent;
}

// Rehace el recuerdo de un dia EDITANDO un mensaje del bot que ya esta en
// Discord (por defecto, el suyo): asi no cambia de lugar ni pierde las
// reacciones. Le pone el texto y las imagenes de ahora; la app se actualiza sola
// (llega como edicion). intoId: otro mensaje de recuerdo del bot, para ordenarlos.
async function editMemory(dia, intoId) {
  const row = db.prepare('SELECT dia, message_id, discord_message_id FROM puente_recuerdos WHERE dia = ? AND message_id IS NOT NULL').get(dia);
  if (!row) return { error: 'no hay recuerdo de ese dia' };
  const target = intoId || row.discord_message_id;
  if (!target) return { error: 'ese recuerdo no tiene mensaje en Discord' };
  const r = memoryFor(row);
  if (r.error) return r;
  const channelId = await summaryChannelId();
  if (!channelId) return { error: 'no hay canal del resumen' };
  // Las imagenes reemplazan a las que tenia el mensaje (attachments: las nuevas)
  const files = [];
  for (const f of r.media.files) { try { files.push({ data: fsMedia.readFileSync(f.file), name: f.name }); } catch { /* ya no esta */ } }
  const payload = { content: memoryText(r), allowed_mentions: { parse: [] }, flags: r.media.links.length ? 0 : 4,
    attachments: files.map((f, i) => ({ id: i, filename: f.name })) };
  const url = `/channels/${channelId}/messages/${target}`;
  const res = files.length && apiFiles ? await apiFiles('PATCH', url, payload, files) : await api('PATCH', url, payload);
  if (!res || res.__error) return { error: 'Discord no dejó editarlo: ' + (res && res.__error) };
  db.prepare('UPDATE puente_recuerdos SET discord_message_id = ? WHERE dia = ?').run(target, row.dia);
  log(`logros: "Un día como hoy" del ${row.dia} editado (${files.length} adjuntos)`);
  return { ok: true, dia: row.dia, mensaje: target, adjuntos: files.length };
}

// El recuerdo armado de nuevo a partir de la fila de puente_recuerdos
function memoryFor(row) {
  const m = db.prepare(`SELECT m.id, m.channel_id, m.user_id, m.webhook_username, m.content, m.created_at, pa.discord_user_id d
    FROM messages m LEFT JOIN puente_autores pa ON pa.message_id = m.id WHERE m.id = ?`).get(row.message_id);
  if (!m) return { error: 'el mensaje original ya no está' };
  const n = db.prepare('SELECT COUNT(*) n FROM reactions WHERE message_id = ?').get(m.id).n;
  const when = local(parseTs(row.dia + ' 12:00:00') || Date.now());
  const years = Math.max(1, when.getUTCFullYear() - local(parseTs(m.created_at)).getUTCFullYear());
  const r = memoryOf(m, years, n);
  return r || { error: 'no encuentro el canal del mensaje' };
}

let posting = false;
async function maybePostSummary(force) {
  if (posting || !getGuildId()) return;
  const now = Date.now();
  const thisWeek = weekStartArt(now);
  const due = thisWeek.ms + (SUMMARY_HOUR - ZONE_H) * 3600e3; // lunes a las 10 (hora local)
  if (!force && now < due) return;
  const prev = weekStartArt(thisWeek.ms - 864e5);
  if (!force && db.prepare('SELECT 1 FROM puente_semanas WHERE semana = ?').get(prev.day)) return;
  posting = true;
  try {
    const channelId = await summaryChannelId();
    if (!channelId) { warn(`logros: no hay un canal #${SUMMARY_CHANNEL} en Discord: el resumen no se publica`); return; }
    const s = weekSummary(prev.ms);
    const text = summaryText(s);
    const sent = await api('POST', `/channels/${channelId}/messages`, { content: text, allowed_mentions: { parse: [] }, flags: 4 }); // flags 4: sin vistas previas
    if (!sent || sent.__error) { warn('logros: Discord no dejo publicar el resumen:', sent && sent.__error); return; }
    db.prepare('INSERT OR REPLACE INTO puente_semanas (semana, datos, discord_message_id, at) VALUES (?, ?, ?, ?)')
      .run(prev.day, JSON.stringify({ total: s.total, podio: s.podio.slice(0, 3).map(p => p.k) }), sent.id, Date.now());
    try { await postInHaven(sent); } catch (err) { warn('logros: resumen en Haven:', err.message); }
    cache.clear();
    log(`logros: resumen de la semana del ${prev.day} publicado en #${SUMMARY_CHANNEL}`);
  } finally { posting = false; }
}

// ── Rutas ────────────────────────────────────────────────────────────────
async function handle(req, res, p, u, h) {
  if (p === '/puente/api/logros/historia' && req.method === 'GET') {
    const user = h.sessionUser(req);
    if (!user) return h.json(res, 401, { error: 'sin sesion' });
    return h.json(res, 200, historia(user.id));
  }
  if (p === '/puente/api/logros/medallas' && req.method === 'GET') {
    const user = h.sessionUser(req);
    if (!user) return h.json(res, 401, { error: 'sin sesion' });
    const id = Number(u.searchParams.get('u'));
    if (!Number.isInteger(id) || id <= 0) return h.json(res, 400, { error: 'u' });
    const target = userRow(id);
    if (!target || target.username === 'discord-historial') return h.json(res, 200, { medallas: [], racha: null });
    const s = streaks(id);
    return h.json(res, 200, { medallas: medallas(id), racha: s.actual >= 2 ? s.actual : 0 });
  }
  return false;
}

module.exports = { setup, handle, _test: { updateDays, streaks, historia, medallas, weekSummary, summaryText, weekStartArt, maybePostSummary, memoryPick, memoryText, maybePostMemory } };
