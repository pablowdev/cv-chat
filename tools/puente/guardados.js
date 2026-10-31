// Guardados (como los marcadores de X): cada persona guarda mensajes desde el menu del mensaje o la
// barrita (web/aviso.js) y los ve despues en su seccion "Guardados". Son solo suyos: nadie mas ve que
// guardo.
//
//  GET  /puente/api/guardados/ids          los ids guardados (para pintar el marcador lleno)   (sesion)
//  POST /puente/api/guardados  { id, si }  guardar (si = true) o quitar                         (sesion)
//  GET  /puente/api/guardados?antes=<n>    la lista, de a 30, lo ultimo guardado primero        (sesion)
//    - Solo mensajes de canales o conversaciones donde esta la persona; si despues pierde el
//      acceso, no se muestran (y vuelven si lo recupera).
//    - Los mensajes privados estan cifrados: el servidor no lee su texto, se muestran como
//      "Mensaje privado" con el nombre de la otra persona.
//    - Si el mensaje se borro, sale de la lista.

const POR_PAGINA = 30;
const MAXIMO = 2000;
let db = null, warn = () => {}, publicUrl = '';

function setup(ctx) {
  ({ db, warn } = ctx);
  publicUrl = String(process.env.PUBLIC_URL || '').replace(/\/+$/, '');
  db.exec(`
    CREATE TABLE IF NOT EXISTS puente_guardados (
      user_id INTEGER NOT NULL,
      message_id INTEGER NOT NULL,
      creado INTEGER NOT NULL,
      PRIMARY KEY (user_id, message_id)
    ) WITHOUT ROWID;
    CREATE INDEX IF NOT EXISTS puente_idx_guardados_creado ON puente_guardados (user_id, creado);
  `);
}

// El mensaje con su canal, si la persona lo puede ver
function visible(userId, messageId) {
  const m = db.prepare(`SELECT m.id, m.channel_id, m.user_id, m.content, m.webhook_username, m.persona_username, m.webhook_avatar,
                               m.created_at, m.thread_id, c.name, c.code, c.is_dm
                        FROM messages m JOIN channels c ON c.id = m.channel_id WHERE m.id = ?`).get(messageId);
  if (!m) return null;
  if (db.prepare('SELECT 1 FROM channel_members WHERE channel_id = ? AND user_id = ?').get(m.channel_id, userId)) return m;
  const admin = (db.prepare('SELECT is_admin FROM users WHERE id = ?').get(userId) || {}).is_admin;
  return admin && !m.is_dm ? m : null;
}

// En un privado, el nombre de la otra persona
function otraPersona(channelId, userId) {
  const r = db.prepare(`SELECT u.username, u.display_name FROM channel_members cm JOIN users u ON u.id = cm.user_id
                        WHERE cm.channel_id = ? AND cm.user_id != ? LIMIT 1`).get(channelId, userId);
  return r ? (r.display_name || r.username) : null;
}

function lista(userId, antes) {
  const a = require('./actividad.js');
  const filas = db.prepare(`SELECT message_id, creado FROM puente_guardados WHERE user_id = ? AND creado < ?
                            ORDER BY creado DESC LIMIT ?`).all(userId, antes, POR_PAGINA + 1);
  const mas = filas.length > POR_PAGINA;
  const pers = a.personalizados();
  const usados = {};
  const out = [];
  for (const f of filas.slice(0, POR_PAGINA)) {
    const m = visible(userId, f.message_id);
    if (!m) {
      // borrado: sale de la lista; sin acceso: queda guardado pero no se muestra
      if (!db.prepare('SELECT 1 FROM messages WHERE id = ?').get(f.message_id)) {
        db.prepare('DELETE FROM puente_guardados WHERE user_id = ? AND message_id = ?').run(userId, f.message_id);
      }
      continue;
    }
    const url = `${publicUrl}/app?channel=${m.code}&message=${m.id}${m.thread_id ? '&thread=' + m.thread_id : ''}`;
    const item = { id: m.id, guardado: f.creado, fecha: String(m.created_at).replace(' ', 'T') + 'Z', autor: a.persona(m), url };
    if (m.is_dm) {
      item.privado = true;
      item.canal = otraPersona(m.channel_id, userId) || 'Mensaje privado';
    } else {
      item.canal = m.name;
      const foto = (/(\/uploads\/[^\s)"']+\.(?:png|jpe?g|gif|webp))/i.exec(String(m.content || '')) || [])[1] || null;
      let texto = a.plano(m.content).slice(0, 400);
      if (foto && /^(\[(foto|archivo)\]\s*)+$/.test(texto)) texto = '';
      for (const k of texto.matchAll(/:([\w~-]+):/g)) if (pers.has(k[1])) usados[k[1]] = pers.get(k[1]);
      item.texto = texto;
      item.foto = foto;
    }
    out.push(item);
  }
  const ultimo = filas.length ? filas[Math.min(filas.length, POR_PAGINA) - 1].creado : null;
  return { mensajes: out, mas, antes: mas ? ultimo : null, personalizados: usados };
}

async function handle(req, res, p, u, h) {
  if (p !== '/puente/api/guardados' && p !== '/puente/api/guardados/ids') return false;
  const user = h.sessionUser(req);
  if (!user) return h.json(res, 401, { error: 'sin sesion' });
  try {
    if (p === '/puente/api/guardados/ids' && req.method === 'GET') {
      const ids = db.prepare('SELECT message_id FROM puente_guardados WHERE user_id = ? ORDER BY creado DESC LIMIT ?').all(user.id, MAXIMO).map(r => r.message_id);
      return h.json(res, 200, { ids });
    }
    if (p === '/puente/api/guardados' && req.method === 'GET') {
      const antes = Number(u.searchParams.get('antes')) || Number.MAX_SAFE_INTEGER;
      return h.json(res, 200, lista(user.id, antes));
    }
    if (p === '/puente/api/guardados' && req.method === 'POST') {
      const body = (await h.readJson(req, 2000)) || {};
      const id = Number(body.id) || 0;
      if (!body.si) {
        db.prepare('DELETE FROM puente_guardados WHERE user_id = ? AND message_id = ?').run(user.id, id);
        return h.json(res, 200, { ok: true, guardado: false });
      }
      if (!visible(user.id, id)) return h.json(res, 404, { error: 'Ese mensaje ya no está.' });
      if (db.prepare('SELECT COUNT(*) n FROM puente_guardados WHERE user_id = ?').get(user.id).n >= MAXIMO) {
        return h.json(res, 429, { error: `Ya tenés ${MAXIMO} mensajes guardados. Quitá alguno para guardar otro.` });
      }
      db.prepare('INSERT OR IGNORE INTO puente_guardados (user_id, message_id, creado) VALUES (?, ?, ?)').run(user.id, id, Date.now());
      return h.json(res, 200, { ok: true, guardado: true });
    }
    return h.json(res, 405, { error: 'metodo' });
  } catch (err) { warn('guardados:', err.message); return h.json(res, 500, { error: 'No se pudo. Probá de nuevo en un rato.' }); }
}

module.exports = { setup, handle };
