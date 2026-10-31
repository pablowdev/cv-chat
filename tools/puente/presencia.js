// Desde donde entra cada uno (app de Android, app de PC, iPhone, navegador) y cuando estuvo
// conectado por ultima vez, para la pagina "Miembros" (solo administradores, vincular.js).
//
//  POST /puente/api/presencia   { plataforma }   (sesion) — lo manda web/aviso.js al abrir
//  La ultima vez se anota sola: cuando la persona se conecta y cuando se desconecta.

const PLATAFORMAS = {
  'android-app': 'App de Android',
  'pc-app': 'App de PC',
  'iphone-app': 'App de iPhone',
  'celular-web': 'Navegador del celular',
  'pc-web': 'Navegador de PC',
};

let db = null, marcar = null;

function setup({ db: base, io, warn }) {
  db = base;
  db.exec(`
    CREATE TABLE IF NOT EXISTS puente_presencia (
      haven_user_id INTEGER PRIMARY KEY,
      visto INTEGER NOT NULL,
      plataforma TEXT,
      plataformas TEXT NOT NULL DEFAULT '{}'
    );
  `);
  marcar = db.prepare('INSERT INTO puente_presencia (haven_user_id, visto) VALUES (?, ?) ON CONFLICT(haven_user_id) DO UPDATE SET visto = excluded.visto');
  io.on('connection', (socket) => {
    const id = socket.user && socket.user.id;
    if (!id) return;
    try { marcar.run(id, Date.now()); } catch (err) { warn('presencia:', err.message); }
    socket.on('disconnect', () => { try { marcar.run(id, Date.now()); } catch { /* base cerrandose */ } });
  });
}

async function handle(req, res, p, u, h) {
  if (p !== '/puente/api/presencia') return false;
  if (req.method !== 'POST') return h.json(res, 405, { error: 'metodo' });
  const user = h.sessionUser(req);
  if (!user) return h.json(res, 401, { error: 'sin sesion' });
  const body = (await h.readJson(req, 500)) || {};
  const plat = PLATAFORMAS[body.plataforma] ? body.plataforma : null;
  if (!plat || !db) return h.json(res, 400, { error: 'plataforma' });
  const ahora = Date.now();
  const fila = db.prepare('SELECT plataformas FROM puente_presencia WHERE haven_user_id = ?').get(user.id);
  let todas = {};
  try { todas = JSON.parse((fila && fila.plataformas) || '{}') || {}; } catch { todas = {}; }
  todas[plat] = ahora;
  db.prepare(`INSERT INTO puente_presencia (haven_user_id, visto, plataforma, plataformas) VALUES (?, ?, ?, ?)
              ON CONFLICT(haven_user_id) DO UPDATE SET visto = excluded.visto, plataforma = excluded.plataforma, plataformas = excluded.plataformas`)
    .run(user.id, ahora, plat, JSON.stringify(todas));
  return h.json(res, 200, { ok: true });
}

// Para la pagina "Miembros": por cuenta, ultima vez, desde donde entro la ultima vez y todas las que uso
function todas() {
  const out = new Map();
  if (!db) return out;
  try {
    for (const r of db.prepare('SELECT haven_user_id, visto, plataforma, plataformas FROM puente_presencia').all()) {
      let usadas = {};
      try { usadas = JSON.parse(r.plataformas || '{}') || {}; } catch { usadas = {}; }
      out.set(r.haven_user_id, {
        visto: new Date(r.visto).toISOString(),
        desde: r.plataforma ? PLATAFORMAS[r.plataforma] : null,
        usadas: Object.keys(usadas).sort((a, b) => usadas[b] - usadas[a]).map(k => PLATAFORMAS[k]).filter(Boolean),
        cuando: Object.fromEntries(Object.entries(usadas).filter(([k]) => PLATAFORMAS[k]).map(([k, ms]) => [PLATAFORMAS[k], ms])),
      });
    }
  } catch { /* sin la tabla todavia */ }
  return out;
}

module.exports = { setup, handle, todas, PLATAFORMAS };
