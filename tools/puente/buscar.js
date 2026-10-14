// Buscador de mensajes como el de Discord (parte del puente).
//
// Haven ya busca (texto con su indice FTS5, from:, in:, has:, pinned:, before:,
// after:, during:, tag:), pero los mensajes que vinieron de Discord estan a
// nombre de un usuario interno: en los resultados salen con ese nombre y from:
// no los encuentra. Este modulo atiende el mismo pedido de Haven
// ("search-messages", con la misma respuesta "search-results") y ademas:
//
//  - Los mensajes de Discord salen con el nombre de quien los escribio, y
//    from:Nombre los encuentra (por el nombre con que llegaron de Discord).
//  - mentions:Nombre (mensajes que mencionan a alguien), como Discord.
//  - Valores con espacios entre comillas: from:"MEGA MONO".
//  - has: tambien en castellano (enlace, imagen, video, archivo, audio).
//
// Solo busca en los canales que la persona puede ver (los mismos que Haven:
// sus canales, sin mensajes directos; los mensajes directos los busca Haven en
// el navegador, porque estan cifrados). Si algo falla, el pedido sigue de largo
// y lo contesta Haven como siempre.
//
//  GET /puente/api/buscar/personas?q=   para completar from: y mentions: (vincular.js)

const PAGE = 25;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const HAS_ES = { enlace: 'link', enlaces: 'link', link: 'link', imagen: 'image', imagenes: 'image', image: 'image', foto: 'image',
  video: 'video', videos: 'video', archivo: 'file', archivos: 'file', file: 'file', audio: 'audio', audios: 'audio' };

let db, log, warn, fts = null;

function setup(ctx) {
  ({ db, log, warn } = ctx);
  try { fts = require('/app/src/searchIndex.js'); } catch (err) { warn('buscador: no encuentro el indice de Haven:', err.message); return; }
  // Para from: con los nombres de Discord (los mensajes importados): sin esto,
  // buscar por persona recorre todos los mensajes
  try {
    db.exec('CREATE INDEX IF NOT EXISTS puente_idx_mensajes_autor_discord ON messages(webhook_username COLLATE NOCASE)');
  } catch (err) { warn('buscador: no pude crear el indice de autores:', err.message); }
  ctx.io.on('connection', (socket) => {
    const times = [];
    socket.use((packet, next) => {
      if (!packet || packet[0] !== 'search-messages') return next();
      try {
        const now = Date.now();
        while (times.length && now - times[0] > 10000) times.shift();
        if (times.length >= 8) { socket.emit('search-throttled', { token: packet[1] && packet[1].token }); return; }
        times.push(now);
        if (search(socket, packet[1])) return; // contestado
      } catch (err) { warn('buscador:', err.message); }
      next(); // que lo conteste Haven
    });
  });
  log('buscador listo (from: y mentions: con los autores de Discord)');
}

const esc = s => String(s).replace(/[\\%_]/g, c => '\\' + c);
const utc = s => (!s || s.endsWith('Z') ? s : s.replace(' ', 'T') + 'Z');

// Saca un filtro del texto: from:valor o from:"valor con espacios"
function take(query, name, out) {
  const re = new RegExp(`\\b${name}:(?:"([^"]+)"|(\\S+))`, 'gi');
  return query.replace(re, (_, quoted, bare) => { out[name] = (quoted || bare).trim(); return ' '; });
}

function search(socket, data) {
  const user = socket.user;
  if (!user || !user.id || !data || typeof data !== 'object') return false;
  let query = typeof data.query === 'string' ? data.query.trim().slice(0, 300) : '';
  if (!query) return false;
  const page = Number.isInteger(data.page) && data.page > 0 ? data.page : 1;
  const sort = ['newest', 'oldest', 'relevant'].includes(data.sort) ? data.sort : 'newest';
  const token = data.token;

  const f = {};
  for (const name of ['from', 'mentions', 'tag', 'in', 'has', 'pinned', 'before', 'after', 'during']) query = take(query, name, f);
  query = query.replace(/\s+/g, ' ').trim();
  for (const k of ['before', 'after', 'during']) if (f[k] && !DATE_RE.test(f[k])) f[k] = null;
  if (f.has) f.has = HAS_ES[f.has.toLowerCase()] || f.has.toLowerCase();
  if (f.pinned) f.pinned = f.pinned.toLowerCase();
  let inCode = false;
  if (f.in && f.in.startsWith('#')) { f.in = f.in.slice(1); inCode = true; }
  // Lo que Haven muestra arriba de los resultados
  const filters = { from: f.from || null, in: f.in || null, has: f.has || null, pinned: f.pinned || null, before: f.before || null,
    after: f.after || null, during: f.during || null, tag: f.tag || null, mentions: f.mentions || null };
  const empty = { results: [], total: 0, page: 1, query: data.query, filters, token };
  const reply = (payload) => { socket.emit('search-results', payload); return true; };

  // La etiqueta de un adjunto la sigue resolviendo Haven (vocabulario propio)
  if (f.tag) return false;

  const cond = [], params = [];
  let usesFts = false;
  if (query) {
    const tok = fts.getActiveTokenizer();
    if (query.length < fts.minQueryChars(tok)) return reply(empty);
    const match = fts.buildMatchQuery(query, tok);
    if (match) { cond.push('messages_fts MATCH ?'); params.push(match); usesFts = true; }
  }
  const anyFilter = f.from || f.mentions || f.has || f.in || f.pinned || f.before || f.after || f.during;
  if (!usesFts && !anyFilter) return reply(empty);

  // Canales: los suyos, sin mensajes directos (y sin los cerrados por rol de Haven, por las dudas)
  const mine = db.prepare(`SELECT c.id, c.code, c.name, c.role_gate FROM channel_members cm JOIN channels c ON c.id = cm.channel_id
                           WHERE cm.user_id = ? AND c.is_dm = 0`).all(user.id)
    .filter(c => user.isAdmin || !c.role_gate);
  let ids = mine.map(c => c.id);
  if (f.in) {
    const want = f.in.toLowerCase();
    const hit = mine.find(c => (inCode ? c.code === f.in : String(c.name || '').toLowerCase() === want));
    if (!hit) return reply(empty);
    ids = [hit.id];
  }
  if (!ids.length) return reply(empty);
  cond.push(`m.channel_id IN (${ids.map(() => '?').join(',')})`);
  params.push(...ids);

  if (f.from) {
    // Una cuenta de Haven (sus mensajes, tambien los que paso a su nombre al
    // vincularse) o un nombre con que llegaron mensajes de Discord
    const who = db.prepare(`SELECT id FROM users WHERE username != 'discord-historial'
                             AND (username = ? COLLATE NOCASE OR display_name = ? COLLATE NOCASE)`).all(f.from, f.from).map(x => x.id);
    const own = who.length ? `(m.imported_from IS NULL AND m.user_id IN (${who.map(() => '?').join(',')})) OR ` : '';
    cond.push(`(${own}(m.imported_from IS NOT NULL AND m.webhook_username = ? COLLATE NOCASE))`);
    params.push(...who, f.from);
  }
  if (f.mentions) {
    cond.push("m.content LIKE ? ESCAPE '\\'");
    params.push('%@' + esc(f.mentions.replace(/^@/, '')) + '%');
  }
  const like = (list) => '(' + list.map(p => `m.content LIKE '${p}'`).join(' OR ') + ')';
  if (f.has === 'image') cond.push(like(['%/uploads/%.png%', '%/uploads/%.jpg%', '%/uploads/%.jpeg%', '%/uploads/%.gif%', '%/uploads/%.webp%', '%media%.giphy.com/%', '%tenor.com/%']));
  else if (f.has === 'file') cond.push(like(['%/uploads/%', '%[file:%']));
  else if (f.has === 'link') cond.push(like(['%http://%', '%https://%']));
  else if (f.has === 'video') cond.push(like(['%/uploads/%.mp4%', '%/uploads/%.webm%', '%/uploads/%.mov%', '%youtube.com%', '%youtu.be%']));
  else if (f.has === 'audio') cond.push(like(['%/uploads/%.mp3%', '%/uploads/%.wav%', '%/uploads/%.ogg%', '%/uploads/%.m4a%', '%/uploads/%.opus%']));
  if (f.pinned === 'true') cond.push('m.id IN (SELECT message_id FROM pinned_messages)');
  if (f.after) { cond.push('m.created_at >= ?'); params.push(f.after); }
  if (f.before) { cond.push('m.created_at < ?'); params.push(f.before); }
  if (f.during) { cond.push("m.created_at >= ? AND m.created_at < date(?, '+1 day')"); params.push(f.during, f.during); }

  const from = (usesFts ? 'messages_fts JOIN messages m ON m.id = messages_fts.rowid' : 'messages m') +
    ' LEFT JOIN users u ON m.user_id = u.id LEFT JOIN channels c ON c.id = m.channel_id';
  const order = sort === 'oldest' ? 'm.created_at ASC' : sort === 'relevant' && usesFts ? 'bm25(messages_fts)' : 'm.created_at DESC';
  const where = cond.join(' AND ');
  let total, rows;
  try {
    total = db.prepare(`SELECT count(*) AS n FROM ${from} WHERE ${where}`).get(...params).n;
    rows = db.prepare(`SELECT m.id, m.content, m.created_at, m.imported_from, m.webhook_username,
                         COALESCE(u.display_name, u.username, '[Deleted User]') AS uname, u.id AS uid,
                         c.name AS channel_name, c.code AS channel_code
                       FROM ${from} WHERE ${where} ORDER BY ${order} LIMIT ${PAGE} OFFSET ?`).all(...params, (page - 1) * PAGE);
  } catch (err) {
    warn('buscador: la busqueda fallo:', err.message);
    return false;
  }
  const results = rows.map(r => {
    const discord = !!r.imported_from;
    return {
      id: r.id, content: r.content, created_at: utc(r.created_at),
      // Los de Discord: con el nombre de quien lo escribio (y sin la cuenta interna)
      username: discord ? (r.webhook_username || 'Discord') : r.uname,
      user_id: discord ? null : r.uid,
      channel_name: r.channel_name, channel_code: r.channel_code,
    };
  });
  if (results.length) {
    const ph = results.map(() => '?').join(',');
    const counts = new Map(db.prepare(`SELECT thread_id, COUNT(*) AS n FROM messages WHERE thread_id IN (${ph}) GROUP BY thread_id`)
      .all(...results.map(r => r.id)).map(x => [x.thread_id, x.n]));
    results.forEach(r => { r.thread_count = counts.get(r.id) || 0; });
  }
  return reply({ results, total, page, query: data.query, filters, token });
}

// Personas para completar from: y mentions: (cuentas de Haven y nombres de Discord)
function people(q) {
  const term = String(q || '').trim().slice(0, 40);
  const pre = esc(term) + '%';
  const out = [], seen = new Set();
  const push = (name, sub, avatar, discord) => {
    const k = String(name).toLowerCase();
    if (!name || seen.has(k) || out.length >= 12) return;
    seen.add(k);
    out.push({ nombre: name, usuario: sub || null, avatar: avatar || null, discord: !!discord });
  };
  const haven = db.prepare(`SELECT username, display_name, avatar FROM users
    WHERE username != 'discord-historial' AND (username LIKE ? ESCAPE '\\' OR display_name LIKE ? ESCAPE '\\')
    ORDER BY username COLLATE NOCASE LIMIT 12`).all(pre, pre);
  for (const u of haven) push(u.username, u.display_name && u.display_name !== u.username ? u.display_name : null, u.avatar, false);
  if (term) {
    // Rango sobre el indice (un LIKE recorreria todos los mensajes)
    const dc = db.prepare(`SELECT webhook_username AS name, MAX(webhook_avatar) AS avatar FROM messages
      WHERE webhook_username COLLATE NOCASE >= ? AND webhook_username COLLATE NOCASE < ? AND imported_from IS NOT NULL
      GROUP BY webhook_username COLLATE NOCASE LIMIT 12`).all(term, term + '￿');
    for (const d of dc) push(d.name, null, d.avatar, true);
  }
  return out;
}

module.exports = { setup, people };
