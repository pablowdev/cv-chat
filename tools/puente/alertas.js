// Alertas para los administradores, al celular (la notificacion push; con la app abierta, el cartelito): lo que
// antes habia que ir a mirar. Cada 10 minutos se revisa:
//   - el respaldo de la noche (tools/backup.sh deja como salio en /data/puente-respaldo.json): si fallo, o si
//     paso mas de un dia y medio sin ninguno
//   - el disco: menos de ALERTA_DISCO_GB libres (15 por defecto), y otra vez si quedan menos de 5
//   - los juegos que no arrancaron al prender el servidor (puente.js los anota con juegosCaidos)
//   - un error grave de Haven (/data/crash.log: una excepcion sin atrapar, la memoria muy alta, el servidor que no
//     pudo escuchar; no los "Event loop lag" ni los apagados normales), una vez por dia y tipo
// Cada alerta sale una sola vez (tabla puente_alertas). Si el chat entero se cae, esto no puede avisar: para eso
// esta tools/vigia.sh, que corre afuera de Haven y manda un mail. PUENTE_ALERTAS=0 lo apaga.

const fs = require('fs');
let db = null, log = () => {}, warn = () => {};
const RESPALDO = '/data/puente-respaldo.json';
const CRASH = '/data/crash.log';
const GB = 1024 ** 3;
const pendientesJuegos = [];

function setup(ctx) {
  ({ db, log, warn } = ctx);
  if (String(process.env.PUENTE_ALERTAS || '1').trim() === '0') return;
  db.exec(`CREATE TABLE IF NOT EXISTS puente_alertas (clave TEXT PRIMARY KEY, cuando INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS puente_alertas_estado (clave TEXT PRIMARY KEY, valor TEXT NOT NULL);`);
  // (lo que ya estaba al estrenar esto no se avisa: solo lo que pase desde ahora)
  if (!db.prepare('SELECT 1 FROM puente_alertas LIMIT 1').get()) {
    marcar('inicio');
    try { const r = JSON.parse(fs.readFileSync(RESPALDO, 'utf8')); if (r && r.ok === false) marcar('respaldo:' + r.fecha); } catch { /* sin estado */ }
  }
  setTimeout(() => revisar(), 2 * 60e3).unref();
  setInterval(() => revisar(), 10 * 60e3).unref();
}

const ya = (k) => !!db.prepare('SELECT 1 FROM puente_alertas WHERE clave = ?').get(k);
const marcar = (k) => db.prepare('INSERT OR IGNORE INTO puente_alertas (clave, cuando) VALUES (?, ?)').run(k, Date.now());
const hoy = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);

function avisar(clave, title, body) {
  if (ya(clave)) return;
  marcar(clave);
  let admins = [];
  try { admins = db.prepare("SELECT id FROM users WHERE is_admin = 1 AND IFNULL(is_guest, 0) = 0 AND username != 'discord-historial'").all().map((r) => r.id); } catch { /* */ }
  const avisos = require('./avisos.js');
  for (const id of admins) avisos.avisarUsuario(id, { title: '⚠️ ' + title, body, url: '/app', tag: 'puente-alerta-' + clave.split(':')[0] });
  log(`alertas: "${title}" a ${admins.length} administrador(es)`);
}

const GRAVES = /^\[[^\]]+\] (Uncaught exception|Unhandled promise rejection|Memory high|Fatal listen error|HTTP server error)[^:]*: ?(.*)$/;
const TITULOS = {
  'Uncaught exception': 'CV Chat tuvo un error sin atrapar', 'Unhandled promise rejection': 'CV Chat tuvo un error sin atrapar',
  'Memory high': 'CV Chat está usando mucha memoria', 'Fatal listen error': 'CV Chat no pudo arrancar', 'HTTP server error': 'Error en el servidor web de CV Chat',
};
// Lo nuevo de crash.log desde la ultima vez (la primera vez, desde el final: lo viejo no se avisa)
function errores() {
  let st;
  try { st = fs.statSync(CRASH); } catch { return; }
  const g = db.prepare("SELECT valor FROM puente_alertas_estado WHERE clave = 'crash'").get();
  let desde = g ? Number(g.valor) : st.size;
  if (st.size < desde) desde = 0; // (Haven lo roto: se empieza de nuevo)
  if (st.size > desde) {
    const largo = Math.min(st.size - desde, 256 * 1024);
    const buf = Buffer.alloc(largo);
    const fd = fs.openSync(CRASH, 'r');
    try { fs.readSync(fd, buf, 0, largo, st.size - largo); } finally { fs.closeSync(fd); }
    for (const l of buf.toString('utf8').split('\n')) {
      const m = GRAVES.exec(l.trim());
      if (m) avisar('error:' + m[1] + ':' + hoy(), TITULOS[m[1]] || 'Error en CV Chat', (m[2] || 'Quedó anotado en /data/crash.log.').slice(0, 180));
    }
  }
  db.prepare("INSERT INTO puente_alertas_estado (clave, valor) VALUES ('crash', ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor").run(String(st.size));
}

function revisar() {
  if (!db) return;
  try {
    // El respaldo de la noche
    let r = null;
    try { r = JSON.parse(fs.readFileSync(RESPALDO, 'utf8')); } catch { /* todavia no hubo */ }
    if (r && r.ok === false) avisar('respaldo:' + r.fecha, 'El respaldo de anoche falló', String(r.error || 'Mirá tools/backup.log en el servidor.').slice(0, 200));
    else if (r && r.fecha && Date.now() - Date.parse(r.fecha) > 36 * 3600e3) avisar('respaldo-viejo:' + hoy(), 'No hubo respaldo anoche', `El último que salió bien es del ${new Date(Date.parse(r.fecha) - 3 * 3600e3).toISOString().slice(0, 16).replace('T', ' ')}. Puede que el timer no haya corrido.`);
    // El disco
    try {
      const s = fs.statfsSync('/data');
      const libres = (s.bavail * s.bsize) / GB, total = (s.blocks * s.bsize) / GB;
      const umbral = Number(process.env.ALERTA_DISCO_GB || 15);
      if (libres < 5) avisar('disco5:' + hoy(), 'El disco del servidor está casi lleno', `Quedan ${libres.toFixed(1)} GB libres de ${Math.round(total)} GB.`);
      else if (libres < umbral) avisar('disco:' + hoy(), 'Queda poco espacio en el servidor', `Quedan ${libres.toFixed(1)} GB libres de ${Math.round(total)} GB.`);
    } catch { /* sin statfs */ }
    errores();
    // Los juegos que no arrancaron
    while (pendientesJuegos.length) {
      const j = pendientesJuegos.shift();
      avisar('juego:' + j.modulo + ':' + j.cuando, `${j.modulo} no arrancó`, String(j.error || '').slice(0, 200) || 'El juego no está andando.');
    }
  } catch (err) { warn('alertas:', err.message); }
}

// puente.js, al prender los juegos: los que fallaron
function juegosCaidos(lista) {
  for (const x of lista || []) pendientesJuegos.push({ modulo: String(x.modulo), error: x.error, cuando: Date.now() });
}

module.exports = { setup, juegosCaidos, _test: { revisar, errores } };
