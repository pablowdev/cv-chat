// "Mandar mi opinión" sobre la app (web/aviso.js: en Configuración → Mi cuenta para quien usa la app de Android, una
// tarjeta una sola vez al segundo dia de usarla, y /app?opinion=1 para abrirla desde un mail). Cada opinion se guarda
// (puente_opiniones), llega a #admilinks (denuncias.js aviso, como "Opiniones") y a los admins al celular. Sirve
// para la prueba de Google Play: juntar lo que dicen los testers y arreglarlo en las versiones nuevas.
//
//  POST /puente/api/opinion   { texto, puntaje (1-5, opcional), plataforma, version }   (sesion, no invitados)

let db = null, log = () => {}, warn = () => {};
const POR_DIA = 5;

function setup(ctx) {
  ({ db, log, warn } = ctx);
  db.exec(`CREATE TABLE IF NOT EXISTS puente_opiniones (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, texto TEXT NOT NULL, puntaje INTEGER,
    plataforma TEXT, version TEXT, cuando INTEGER NOT NULL)`);
}

const limpio = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, n);

async function handle(req, res, p, u, h) {
  if (p !== '/puente/api/opinion') return false;
  if (req.method !== 'POST') return h.json(res, 405, { error: 'metodo' });
  const user = h.sessionUser(req);
  if (!user) return h.json(res, 401, { error: 'sin sesion' });
  const yo = db.prepare('SELECT id, username, display_name, IFNULL(is_guest, 0) g FROM users WHERE id = ?').get(user.id);
  if (!yo || yo.g) return h.json(res, 403, { error: 'Solo con cuenta.' });
  const b = (await h.readJson(req, 8000)) || {};
  const texto = limpio(b.texto, 1500);
  if (texto.length < 3) return h.json(res, 400, { error: 'Escribí qué te pareció.' });
  const puntaje = Number.isInteger(b.puntaje) && b.puntaje >= 1 && b.puntaje <= 5 ? b.puntaje : null;
  const plataforma = /^[a-z-]{2,20}$/.test(String(b.plataforma || '')) ? b.plataforma : null;
  const version = /^[\w.-]{1,20}$/.test(String(b.version || '')) ? b.version : null;
  const hoy = Date.now() - 864e5;
  if (db.prepare('SELECT COUNT(*) n FROM puente_opiniones WHERE user_id = ? AND cuando > ?').get(yo.id, hoy).n >= POR_DIA) {
    return h.json(res, 429, { error: 'Ya mandaste varias hoy. ¡Gracias! Probá mañana.' });
  }
  db.prepare('INSERT INTO puente_opiniones (user_id, texto, puntaje, plataforma, version, cuando) VALUES (?, ?, ?, ?, ?, ?)')
    .run(yo.id, texto, puntaje, plataforma, version, Date.now());
  const nombre = yo.display_name || yo.username;
  const donde = plataforma === 'android-app' ? 'la app de Android' : plataforma === 'pc-app' ? 'la app de Windows' : plataforma === 'iphone-app' ? 'el iPhone' : 'la web';
  const estrellas = puntaje ? ' ' + '★'.repeat(puntaje) + '☆'.repeat(5 - puntaje) : '';
  try {
    require('./denuncias.js').aviso(`💬 **Opinión de ${nombre.replace(/[*_~`|]/g, '')}** desde ${donde}${version ? ' ' + version : ''}${estrellas}\n> ${texto.replace(/\n+/g, '\n> ')}`, 'Opiniones');
  } catch (err) { warn('opiniones: aviso:', err.message); }
  try {
    const avisos = require('./avisos.js');
    for (const a of db.prepare("SELECT id FROM users WHERE is_admin = 1 AND IFNULL(is_guest, 0) = 0").all()) {
      if (a.id !== yo.id) avisos.avisarUsuario(a.id, { title: `💬 Opinión de ${nombre}`, body: texto.slice(0, 140), url: '/app', tag: 'puente-opinion' });
    }
  } catch (err) { warn('opiniones: push:', err.message); }
  log(`opiniones: una de #${yo.id} desde ${plataforma || '?'}`);
  return h.json(res, 200, { ok: true });
}

module.exports = { setup, handle };
