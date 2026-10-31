// "Actividad" para todos (el boton arriba de los canales, web/aviso.js):
//  - Lo mejor de la semana: los mensajes con mas reacciones de los ultimos 7 dias, por canal, solo
//    de los canales que la persona puede ver.
//  - Ranking del mes: quien escribio mas y quien recibio mas reacciones, entre las cuentas de CV
//    Chat, solo en los canales abiertos (los que ve cualquiera), asi no deja ver nada de los cerrados.
//  - "Tu resumen" usa lo de "Tu historia" (logros.js), no esta aca.
//
//  GET /puente/api/actividad/destacados          (sesion)
//  GET /puente/api/actividad/ranking?mes=YYYY-MM (sesion; el mes actual si no se dice)
// Los mensajes por persona y mes salen del resumen de panel-estadisticas.js (puente_est_u).

const AR = 3 * 3600 * 1000; // Argentina, UTC-3
const CACHE_MS = 10 * 60 * 1000;
let db = null, warn = () => {}, publicUrl = '';
const cache = new Map();

function setup(ctx) { ({ db, warn } = ctx); publicUrl = String(process.env.PUBLIC_URL || '').replace(/\/+$/, ''); }

const sqlFecha = (ms) => new Date(ms).toISOString().slice(0, 19).replace('T', ' '); // como Haven: UTC 'YYYY-MM-DD HH:MM:SS'
const ghost = () => (db.prepare("SELECT id FROM users WHERE username = 'discord-historial'").get() || { id: -1 }).id;
// Canales abiertos: los propios de Haven que no son privados y los de Discord que ve @everyone
function abiertos() {
  let cerrados = new Set();
  try { cerrados = require('./accesos.js').lockedChannelIds(); } catch { /* sin accesos */ }
  return new Set(db.prepare('SELECT id FROM channels WHERE is_dm = 0 AND IFNULL(is_private, 0) = 0').all().map(c => c.id)
    .concat(db.prepare('SELECT id FROM channels WHERE is_dm = 0 AND discord_channel_id IS NOT NULL').all().map(c => c.id))
    .filter(id => !cerrados.has(id)));
}
const plano = (t) => String(t || '').replace(/!\[[^\]]*\]\([^)]*\)/g, '[foto]').replace(/^\s*\S*\/uploads\/\S+\s*$/gm, '[archivo]')
  .replace(/\[file:[^\]]*\]\([^)]*\)/g, '[archivo]').replace(/<a?:(\w+):\d+>/g, ':$1:').replace(/[*_~`>|]+/g, '').replace(/\s+/g, ' ').trim();
function persona(m) {
  if (m.user_id && m.user_id !== ghost()) {
    const u = db.prepare('SELECT id, username, display_name, avatar FROM users WHERE id = ?').get(m.user_id);
    if (u) return { id: u.id, nombre: u.display_name || u.username, avatar: u.avatar || null };
  }
  return { id: null, nombre: m.persona_username || m.webhook_username || 'Alguien de Discord', avatar: m.webhook_avatar || null };
}
function emojisDe(ids) {
  const out = new Map();
  if (!ids.length) return out;
  for (const r of db.prepare(`SELECT message_id, emoji, COUNT(*) n FROM reactions WHERE message_id IN (${ids.map(() => '?').join(',')}) GROUP BY message_id, emoji ORDER BY n DESC`).all(...ids)) {
    if (!out.has(r.message_id)) out.set(r.message_id, []);
    if (out.get(r.message_id).length < 4) out.get(r.message_id).push({ emoji: r.emoji, n: r.n });
  }
  return out;
}
function personalizados() {
  try { return new Map(db.prepare('SELECT name, filename FROM custom_emojis').all().map(r => [r.name, '/uploads/' + r.filename])); } catch { return new Map(); }
}

// Los mas reaccionados de la semana (para todos; despues se filtra por persona)
function destacadosTodos() {
  const c = cache.get('dest');
  if (c && Date.now() - c.at < CACHE_MS) return c.datos;
  const desde = sqlFecha(Date.now() - 7 * 864e5);
  const filas = db.prepare(`SELECT m.id, m.channel_id, m.user_id, m.content, m.webhook_username, m.persona_username, m.webhook_avatar, m.created_at, m.thread_id, COUNT(*) n
                            FROM reactions r JOIN messages m ON m.id = r.message_id
                            WHERE r.created_at >= ? AND m.created_at >= ? AND IFNULL(m.is_webhook, 0) = 0
                            GROUP BY m.id ORDER BY n DESC LIMIT 300`).all(desde, desde);
  cache.set('dest', { at: Date.now(), datos: filas });
  return filas;
}
function destacados(userId) {
  const mios = new Set(db.prepare('SELECT m.channel_id FROM channel_members m JOIN channels c ON c.id = m.channel_id WHERE m.user_id = ? AND c.is_dm = 0').all(userId).map(r => r.channel_id));
  const canales = new Map(db.prepare('SELECT id, name, code FROM channels WHERE is_dm = 0').all().map(c => [c.id, c]));
  const porCanal = new Map();
  for (const m of destacadosTodos()) {
    if (!mios.has(m.channel_id) || !canales.has(m.channel_id)) continue;
    if (!porCanal.has(m.channel_id)) porCanal.set(m.channel_id, []);
    const l = porCanal.get(m.channel_id);
    if (l.length < 3) l.push(m);
  }
  const elegidos = [...porCanal.entries()].sort((a, b) => b[1][0].n - a[1][0].n).slice(0, 8);
  const em = emojisDe(elegidos.flatMap(([, l]) => l.map(m => m.id)));
  const pers = personalizados();
  const usados = {};
  const out = elegidos.map(([id, l]) => ({
    canal: canales.get(id).name, code: canales.get(id).code,
    mensajes: l.map(m => {
      const reacciones = em.get(m.id) || [];
      for (const r of reacciones) { const k = /^:([\w~-]+):$/.exec(r.emoji); if (k && pers.has(k[1])) usados[k[1]] = pers.get(k[1]); }
      // La primera foto del mensaje (se muestra en chiquito); si el mensaje era solo eso, sin texto
      const foto = (/(\/uploads\/[^\s)"']+\.(?:png|jpe?g|gif|webp))/i.exec(String(m.content || '')) || [])[1] || null;
      let texto = plano(m.content).slice(0, 220);
      if (foto && /^(\[(foto|archivo)\]\s*)+$/.test(texto)) texto = '';
      for (const k of texto.matchAll(/:([\w~-]+):/g)) if (pers.has(k[1])) usados[k[1]] = pers.get(k[1]);
      return {
        id: m.id, autor: persona(m), texto, foto, n: m.n, reacciones,
        fecha: m.created_at.replace(' ', 'T') + 'Z',
        url: `${publicUrl}/app?channel=${canales.get(id).code}&message=${m.id}${m.thread_id ? '&thread=' + m.thread_id : ''}`,
      };
    }),
  }));
  return { canales: out, personalizados: usados };
}

// Ranking del mes: mensajes (del resumen por persona y mes) y reacciones recibidas
function ranking(mes, userId) {
  const key = 'rank' + mes;
  let datos = (cache.get(key) || {}).datos;
  if (!datos || Date.now() - cache.get(key).at > CACHE_MS) {
    const pub = [...abiertos()];
    const g = ghost();
    const enPub = pub.length ? `(${pub.join(',')})` : '(-1)';
    const mensajes = db.prepare(`SELECT user_id, SUM(n) n FROM puente_est_u WHERE mes = ? AND canal_id IN ${enPub} AND user_id != ? GROUP BY user_id ORDER BY n DESC LIMIT 100`).all(mes, g);
    // Reacciones recibidas en el mes, a mensajes del mes (sin contar las propias)
    const [a, m] = mes.split('-').map(Number);
    const ini = sqlFecha(Date.UTC(a, m - 1, 1) + AR), fin = sqlFecha(Date.UTC(a, m, 1) + AR);
    const reacciones = db.prepare(`SELECT msg.user_id, COUNT(*) n FROM reactions r JOIN messages msg ON msg.id = r.message_id
                                   WHERE r.created_at >= ? AND r.created_at < ? AND msg.created_at >= ? AND msg.created_at < ?
                                     AND msg.channel_id IN ${enPub} AND msg.user_id IS NOT NULL AND msg.user_id != ? AND r.user_id != msg.user_id
                                   GROUP BY msg.user_id ORDER BY n DESC LIMIT 100`).all(ini, fin, ini, fin, g);
    datos = { mensajes, reacciones };
    cache.set(key, { at: Date.now(), datos });
  }
  const gente = (l) => {
    const top = l.slice(0, 10).map((r, i) => {
      const u = db.prepare('SELECT id, username, display_name, avatar FROM users WHERE id = ?').get(r.user_id);
      return u ? { puesto: i + 1, id: u.id, nombre: u.display_name || u.username, usuario: u.username, avatar: u.avatar || null, n: r.n, yo: u.id === userId } : null;
    }).filter(Boolean);
    const i = l.findIndex(r => r.user_id === userId);
    return { top, yo: i >= 0 ? { puesto: i + 1, n: l[i].n, de: l.length } : null };
  };
  return { mes, mensajes: gente(datos.mensajes), reacciones: gente(datos.reacciones) };
}

async function handle(req, res, p, u, h) {
  if (p !== '/puente/api/actividad/destacados' && p !== '/puente/api/actividad/ranking') return false;
  if (req.method !== 'GET') return h.json(res, 405, { error: 'metodo' });
  const user = h.sessionUser(req);
  if (!user) return h.json(res, 401, { error: 'sin sesion' });
  try {
    if (p === '/puente/api/actividad/destacados') return h.json(res, 200, destacados(user.id));
    const hoy = new Date(Date.now() - AR).toISOString().slice(0, 7);
    const pedido = String(u.searchParams.get('mes') || '');
    const mes = /^\d{4}-\d{2}$/.test(pedido) && pedido <= hoy ? pedido : hoy;
    return h.json(res, 200, ranking(mes, user.id));
  } catch (err) {
    warn('actividad:', err.message);
    return h.json(res, 500, { error: 'No se pudo cargar.' });
  }
}

module.exports = { setup, handle };
