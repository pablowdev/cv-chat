// Invitacion a probar la app de Google Play (prueba cerrada) a las cuentas con el email confirmado.
// Se corre a mano adentro del contenedor, una vez por dia hasta terminar:
//   docker exec -w /app haven node /tools/puente/invitar-play.js ver      (cuantos faltan, no manda nada)
//   docker exec -w /app haven node /tools/puente/invitar-play.js mandar   (hasta POR_DIA mas)
// Usa el mismo envio de email.js (Resend) y cuenta para su limite diario. A cada cuenta le llega
// una sola vez (puente_invitaciones_play), asi que se puede cortar y volver a correr.

const Database = require(require.resolve('better-sqlite3', { paths: ['/app'] })); // la de Haven
const email = require('/tools/puente/email.js');

const POR_DIA = 75; // el plan gratis manda 100 por dia y CV Chat usa unos 10 para confirmar emails
const PAUSA_MS = 1200; // Resend acepta 2 por segundo
const GRUPO = 'https://groups.google.com/g/cv-chat-testers';
const PRUEBA = 'https://play.google.com/apps/testing/club.circulovicioso.chat';

const ASUNTO = 'Probá CV Chat en Google Play antes que nadie';
const TITULO = 'CV Chat llega a Google Play';
const PARRAFOS = [
  '¡Hola! CV Chat, la app del club, está por salir en Google Play. Antes de publicarla para todos, Google nos pide que por lo menos 12 personas la prueben durante 14 días. ¿Nos das una mano?',
  'Necesitás un celular Android y la cuenta de Google que usás en él:',
  `1. Sumate al grupo de prueba: entrá a ${GRUPO} y tocá "Unirse al grupo".`,
  `2. Activá la prueba: entrá a ${PRUEBA} y tocá "Convertirse en verificador".`,
  '3. Instalá CV Chat desde Google Play y dejala instalada por lo menos 14 días. Usala como siempre, con tu misma cuenta.',
  'Si ya tenés instalada la app que se baja desde la página, desinstalala antes: es la misma, pero Play no deja instalarla encima.',
  'Si algo no anda, escribinos a pablowdev@gmail.com.',
  '¡Gracias por bancar al club!',
];
const BOTON = ['Sumarme al grupo de prueba', GRUPO];
const PIE = 'Te llega porque tenés una cuenta en CV Chat con este email confirmado.';

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const modo = process.argv[2];
  if (modo !== 'ver' && modo !== 'mandar') { console.log('uso: node invitar-play.js ver|mandar'); process.exit(1); }
  const db = new Database('/data/haven.db');
  db.pragma('busy_timeout = 5000');
  const log = (...a) => console.log('[invitar-play]', ...a), warn = (...a) => console.warn('[invitar-play]', ...a);
  const appName = () => {
    const r = db.prepare("SELECT value FROM server_settings WHERE key = 'server_name'").get();
    return String(process.env.PUENTE_APP || (r && r.value) || 'CV Chat');
  };
  email.setup({ db, log, warn, publicUrl: String(process.env.PUBLIC_URL || '').replace(/\/+$/, ''), appName, setPassword: () => {} });
  if (!email.on()) { console.log('el email esta apagado (falta PUENTE_RESEND_KEY o PUENTE_EMAIL_DE)'); process.exit(1); }
  db.exec('CREATE TABLE IF NOT EXISTS puente_invitaciones_play (haven_user_id INTEGER PRIMARY KEY, enviado INTEGER NOT NULL)');
  const faltan = db.prepare(`SELECT e.haven_user_id id, e.email FROM puente_emails e JOIN users u ON u.id = e.haven_user_id
    WHERE e.confirmado = 1 AND e.haven_user_id NOT IN (SELECT haven_user_id FROM puente_invitaciones_play) ORDER BY e.haven_user_id`).all();
  const ya = db.prepare('SELECT COUNT(*) n FROM puente_invitaciones_play').get().n;
  console.log(`mandadas: ${ya} | faltan: ${faltan.length}`);
  if (modo === 'ver') process.exit(0);

  let enviadas = 0, fallas = 0;
  for (const p of faltan.slice(0, POR_DIA)) {
    const ok = await email.sendMail(p.email, ASUNTO, TITULO, PARRAFOS, BOTON, PIE);
    if (ok) {
      db.prepare('INSERT OR IGNORE INTO puente_invitaciones_play (haven_user_id, enviado) VALUES (?, ?)').run(p.id, Date.now());
      db.prepare('INSERT INTO puente_email_envios (enviado, tipo, clave) VALUES (?, ?, ?)').run(Date.now(), 'invitacion-play', String(p.id));
      enviadas++; fallas = 0;
    } else if (++fallas >= 3) { console.log('tres fallas seguidas: se corta (puede ser el limite del dia)'); break; }
    await sleep(PAUSA_MS);
  }
  console.log(`listo: ${enviadas} mandadas ahora | faltan ${faltan.length - enviadas}`);
  process.exit(0);
})();
