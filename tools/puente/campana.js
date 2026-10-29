// La campanita de la barra de la web (barra.js): las respuestas, citas y menciones del foro
// (foro-servicio.js las anota) y las de CV Chat (te mencionaron con @usuario o te respondieron un
// mensaje, en un canal; los mensajes directos tienen su boton aparte). Se guardan en puente_campana
// (puente_campana: las ultimas 100 por persona) y se marcan como vistas al abrir la campanita.
//
//  GET  /puente/api/cuenta/avisos        (cuenta.js) { sinLeer, avisos: [...] }
//  POST /puente/api/cuenta/avisos/leer   todas vistas

const MAX_POR_PERSONA = 100;
let db, log, warn, publicUrl = '';

function setup(ctx) {
  ({ db, log, warn, publicUrl } = ctx);
  // Si algo de esto falla, el resto del puente arranca igual
  try { preparar(); } catch (err) { warn('campana: no arranco:', err.message); return; }
  escuchar(ctx.io);
}
function preparar() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS puente_campana (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      origen TEXT NOT NULL,
      titulo TEXT NOT NULL,
      texto TEXT,
      url TEXT,
      clave TEXT,
      fecha INTEGER NOT NULL,
      leido INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_puente_campana_user ON puente_campana(user_id, id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_puente_campana_clave ON puente_campana(user_id, clave) WHERE clave IS NOT NULL;
  `);
}

function registrar(userId, { origen, titulo, texto, url, clave }) {
  try {
    db.prepare('INSERT OR IGNORE INTO puente_campana (user_id, origen, titulo, texto, url, clave, fecha) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(userId, origen, String(titulo).slice(0, 160), texto ? String(texto).slice(0, 240) : null, url || null, clave || null, Date.now());
    const sobran = db.prepare('SELECT id FROM puente_campana WHERE user_id = ? ORDER BY id DESC LIMIT -1 OFFSET ?').all(userId, MAX_POR_PERSONA);
    if (sobran.length) db.prepare(`DELETE FROM puente_campana WHERE id IN (${sobran.map(() => '?').join(',')})`).run(...sobran.map(r => r.id));
  } catch (err) { warn('campana:', err.message); }
}
const sinLeer = userId => { try { return db.prepare('SELECT COUNT(*) n FROM puente_campana WHERE user_id = ? AND leido = 0').get(userId).n; } catch { return 0; } };
const lista = userId => db.prepare('SELECT id, origen, titulo, texto, url, fecha, leido FROM puente_campana WHERE user_id = ? ORDER BY id DESC LIMIT 40').all(userId)
  .map(r => ({ ...r, leido: !!r.leido }));
const leer = userId => db.prepare('UPDATE puente_campana SET leido = 1 WHERE user_id = ? AND leido = 0').run(userId);

// ── Lo de CV Chat: cada mensaje nuevo de un canal (el de Haven o el que trae el puente de Discord) ──
const plano = t => String(t || '').replace(/!\[[^\]]*\]\([^)]*\)/g, '[foto]').replace(/[*`~>#|]+/g, '').replace(/\s+/g, ' ').trim();
function deMensaje(payload, enHilo) {
  const m = payload && payload.message;
  if (!m || !m.id || !payload.channelCode) return;
  const ch = db.prepare('SELECT id, name, code, is_dm FROM channels WHERE code = ?').get(payload.channelCode);
  if (!ch || ch.is_dm) return;
  const autorId = m.user_id || null;
  const autor = m.username || 'Alguien';
  const para = new Map(); // id -> que
  // Respuesta a un mensaje tuyo (o de tu cuenta de Discord unida, si lo trajo el puente)
  if (m.reply_to) {
    const p = db.prepare('SELECT m.user_id, pa.discord_user_id d FROM messages m LEFT JOIN puente_autores pa ON pa.message_id = m.id WHERE m.id = ?').get(m.reply_to);
    let uid = p && p.user_id;
    if (p && p.d) { const l = db.prepare('SELECT haven_user_id FROM puente_vinculos WHERE discord_user_id = ?').get(String(p.d)); uid = l ? l.haven_user_id : null; }
    if (uid) para.set(uid, 'te respondió');
  }
  // @usuario
  for (const x of String(m.content || '').matchAll(/(^|[^\w@])@([A-Za-z0-9_]{3,20})\b/g)) {
    const u = db.prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?)').get(x[2]);
    if (u && !para.has(u.id)) para.set(u.id, 'te mencionó');
  }
  if (!para.size) return;
  const url = `${publicUrl}/app?channel=${ch.code}&message=${m.id}${enHilo && payload.parentId ? '&thread=' + payload.parentId : ''}`;
  const texto = plano(m.content);
  for (const [uid, que] of para) {
    if (uid === autorId) continue;
    registrar(uid, { origen: 'chat', titulo: `${autor} ${que} en #${ch.name}`, texto, url, clave: `chat-${m.id}` });
  }
}
function escuchar(io) {
  if (!io) return;
  for (const metodo of ['to', 'in']) {
    const orig = io[metodo].bind(io);
    io[metodo] = function (room) {
      const op = orig(room);
      const emit = op.emit.bind(op);
      op.emit = function (event, payload, ...rest) {
        if (typeof room === 'string' && room.startsWith('channel:') && (event === 'new-message' || event === 'new-thread-message')) {
          try { deMensaje(payload, event === 'new-thread-message'); } catch (err) { warn('campana:', err.message); }
        }
        return emit(event, payload, ...rest);
      };
      return op;
    };
  }
}

module.exports = { setup, registrar, sinLeer, lista, leer };
