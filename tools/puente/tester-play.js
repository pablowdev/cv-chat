// La medalla "📱 Tester de la app": para quien usa la app de CV Chat de Google Play mientras esta en prueba (la app
// abre /app?app=play; web/aviso.js, una vez por sesion, avisa "puente-tester-play" por el socket). Queda para
// siempre; solo se gana hasta HASTA (despues de que la app salga para todos ya no es "probarla antes").
// Tabla puente_testers_play: quien, desde cuando y la ultima vez que la abrio (cuantos la usan de verdad).

let db = null, warn = () => {};
const HASTA = Date.parse(process.env.PUENTE_TESTER_HASTA || '2027-01-01T03:00:00Z');

function setup(ctx) {
  ({ db, warn } = ctx);
  db.exec('CREATE TABLE IF NOT EXISTS puente_testers_play (user_id INTEGER PRIMARY KEY, desde INTEGER NOT NULL, ultimo INTEGER NOT NULL, veces INTEGER NOT NULL DEFAULT 1)');
  ctx.io.on('connection', (socket) => {
    let hecho = false;
    socket.on('puente-tester-play', () => {
      if (hecho || !socket.user || socket.user.isGuest) return;
      hecho = true;
      try {
        const ahora = Date.now();
        const ya = db.prepare('SELECT 1 FROM puente_testers_play WHERE user_id = ?').get(socket.user.id);
        if (ya) db.prepare('UPDATE puente_testers_play SET ultimo = ?, veces = veces + 1 WHERE user_id = ?').run(ahora, socket.user.id);
        else if (ahora < HASTA) db.prepare('INSERT INTO puente_testers_play (user_id, desde, ultimo) VALUES (?, ?, ?)').run(socket.user.id, ahora, ahora);
      } catch (err) { warn('tester play:', err.message); }
    });
  });
}

// Para logros.js: [[id, emoji, nombre, detalle]]
function insignias(uid) {
  try {
    if (db && db.prepare('SELECT 1 FROM puente_testers_play WHERE user_id = ?').get(Number(uid))) {
      return [['tester-play', '📱', 'Tester de la app', 'Probó la app de CV Chat para Android en Google Play antes de que saliera para todos']];
    }
  } catch { /* sin la tabla */ }
  return [];
}

module.exports = { setup, insignias };
