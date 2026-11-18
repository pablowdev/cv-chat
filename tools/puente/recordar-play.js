// Segunda vuelta de la prueba de Google Play (18/11/2026): Google pidio 14 dias mas con testers que usen la app de
// verdad. Un unico mail a quien ya fue invitado a probarla (puente_invitaciones_play) o uso CV Chat en los ultimos 60
// dias, con el email confirmado: que use la app de Android estas dos semanas y que mande su opinion.
// Se corre a mano adentro del contenedor, como invitar-play.js:
//   docker exec -w /app haven node /tools/puente/recordar-play.js ver      (cuantos faltan, no manda nada)
//   docker exec -w /app haven node /tools/puente/recordar-play.js mandar   (respeta el cupo masivo de email.js)
// A cada cuenta le llega una sola vez (puente_recordatorio_play), asi que se puede cortar y volver a correr.

const Database = require(require.resolve('better-sqlite3', { paths: ['/app'] })); // la de Haven
const email = require('/tools/puente/email.js');

const PAUSA_MS = 1200;
const DESCARGAR = 'https://circulovicioso.club/descargar#play';
const OPINION = 'https://chat.circulovicioso.club/app?opinion=1';

const ASUNTO = 'Una mano con la app de CV Chat para Android';
const TITULO = 'Usá la app de Android estas dos semanas';
const parrafos = (nombre) => [
  `¡Hola ${nombre}! La app de CV Chat para Android ya está en Google Play, todavía en prueba.`,
  'Antes de publicarla para todos, Google nos pidió dos semanas más de prueba, y lo que mira es que la gente la use de verdad. Si tenés Android, nos ayudás un montón usando la app en vez de la página hasta el 2 de diciembre, aunque sea un ratito por día.',
  'Si todavía no la bajaste, son tres pasos (sumarte al grupo de prueba, activarla e instalarla desde Play):',
  { texto: 'Cómo bajar la app de Android →', url: DESCARGAR },
  'Y si algo anda mal o se te ocurre una mejora, contanos. En la app, mantené apretado el ícono y tocá "Opinar", o entrá acá:',
  { texto: 'Mandar mi opinión →', url: OPINION },
  'Lo leemos todo y lo vamos arreglando en las versiones nuevas. ¡Gracias por bancar al club!',
];
const BOTON = ['Cómo bajar la app', DESCARGAR];
const PIE = 'Te llega porque tenés una cuenta en CV Chat con este email confirmado. Es un único mail.';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const modo = process.argv[2];
  if (modo !== 'ver' && modo !== 'mandar' && modo !== 'probar') { console.log('uso: node recordar-play.js ver|mandar|probar <id>'); process.exit(1); }
  const db = new Database('/data/haven.db');
  db.pragma('busy_timeout = 5000');
  const log = (...a) => console.log('[recordar-play]', ...a), warn = (...a) => console.warn('[recordar-play]', ...a);
  const appName = () => {
    const r = db.prepare("SELECT value FROM server_settings WHERE key = 'server_name'").get();
    return String(process.env.PUENTE_APP || (r && r.value) || 'CV Chat');
  };
  email.setup({ db, log, warn, publicUrl: String(process.env.PUBLIC_URL || '').replace(/\/+$/, ''), appName, setPassword: () => {} });
  if (!email.on()) { console.log('el email esta apagado'); process.exit(1); }
  db.exec('CREATE TABLE IF NOT EXISTS puente_recordatorio_play (haven_user_id INTEGER PRIMARY KEY, enviado INTEGER NOT NULL)');
  db.exec('CREATE TABLE IF NOT EXISTS puente_invitaciones_play (haven_user_id INTEGER PRIMARY KEY, enviado INTEGER NOT NULL)');
  const desde = new Date(Date.now() - 3 * 3600e3 - 60 * 864e5).toISOString().slice(0, 10);
  let activos = '0';
  try { db.prepare('SELECT 1 FROM puente_activos LIMIT 1').get(); activos = 'EXISTS (SELECT 1 FROM puente_activos a WHERE a.user_id = u.id AND a.dia >= @desde)'; } catch { /* sin la tabla */ }
  const faltan = db.prepare(`SELECT u.id, COALESCE(u.display_name, u.username) nombre, e.email FROM users u
    JOIN puente_emails e ON e.haven_user_id = u.id AND e.confirmado = 1
    WHERE IFNULL(u.is_guest, 0) = 0 AND u.username != 'discord-historial'
      AND (u.id IN (SELECT haven_user_id FROM puente_invitaciones_play) OR ${activos})
      AND u.id NOT IN (SELECT haven_user_id FROM puente_recordatorio_play)
    ORDER BY u.id`).all({ desde });
  const ya = db.prepare('SELECT COUNT(*) n FROM puente_recordatorio_play').get().n;
  console.log(`mandados: ${ya} | faltan: ${faltan.length}`);
  if (modo === 'ver') process.exit(0);
  // probar <id>: solo a esa cuenta, sin anotarlo (para ver como llega)
  if (modo === 'probar') {
    const u = db.prepare("SELECT u.id, COALESCE(u.display_name, u.username) nombre, e.email FROM users u JOIN puente_emails e ON e.haven_user_id = u.id AND e.confirmado = 1 WHERE u.id = ?").get(Number(process.argv[3]));
    if (!u) { console.log('esa cuenta no tiene email confirmado'); process.exit(1); }
    console.log(await email.sendMail(u.email, ASUNTO, TITULO, parrafos(u.nombre), BOTON, PIE) ? 'prueba mandada' : 'no salio');
    process.exit(0);
  }

  let enviados = 0, fallas = 0;
  for (const p of faltan) {
    if (!email.hayLugarMasivo()) { console.log('se para aca (cupo del dia): lo que queda es para los mails de confirmar, recuperar y los codigos'); break; }
    const ok = await email.sendMail(p.email, ASUNTO, TITULO, parrafos(p.nombre), BOTON, PIE);
    if (ok) {
      db.prepare('INSERT OR IGNORE INTO puente_recordatorio_play (haven_user_id, enviado) VALUES (?, ?)').run(p.id, Date.now());
      db.prepare('INSERT INTO puente_email_envios (enviado, tipo, clave) VALUES (?, ?, ?)').run(Date.now(), 'recordatorio-play', String(p.id));
      enviados++; fallas = 0;
    } else if (++fallas >= 3) { console.log('tres fallas seguidas: se corta (puede ser el limite del dia)'); break; }
    await sleep(PAUSA_MS);
  }
  console.log(`listo: ${enviados} mandados ahora | faltan ${faltan.length - enviados}`);
  process.exit(0);
})();
