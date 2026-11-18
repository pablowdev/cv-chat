// "Avisame cuando alguien busque partida": cada persona elige de que juegos quiere enterarse (la campanita de la
// pantalla de Juegos, web/aviso.js) y, cuando alguien del club arma una mesa abierta de ese juego (la misma que se
// anuncia en #que-paso, juegos-aviso.js), le llega un aviso: el cartelito si tiene la app abierta, o la notificacion
// del celular si no (avisos.js avisarUsuario).
//
// Para que no moleste:
//   - como mucho TOPE_DIA avisos por persona por dia (de Argentina), de todos los juegos juntos
//   - de una misma persona que arma mesas, como mucho uno cada hora
//   - nunca a quien armo la mesa, a los invitados ni a quien esta jugando ahora una partida de ese juego
//     (la mesa nueva no le sirve)
//
// Socket (con sesion):
//   busco:leer  -> { juegos: [{ id, nombre }], mios: [id, ...] }   los juegos que se pueden pedir y los pedidos
//   busco:poner { juego, si } -> { ok, mios }

let db = null, io = null, log = () => {}, warn = () => {};
const TOPE_DIA = 4;
const MISMO_CREADOR_MS = 60 * 60e3;
const AR = 3 * 3600e3;
// Los juegos que anuncian sus mesas abiertas (llaman a juegos-aviso.anunciar); los demas se suman cuando lo hagan
const AVISAN = ['truco', 'pool', 'ajedrez', 'funball', 'globalsiege'];
const ultimoDe = new Map(); // "destino:creador" -> cuando se aviso

function setup(ctx) {
  ({ db, io, log, warn } = ctx);
  db.exec(`
    CREATE TABLE IF NOT EXISTS puente_busco (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      juego TEXT NOT NULL,
      desde INTEGER NOT NULL,
      PRIMARY KEY (user_id, juego)
    );
    CREATE TABLE IF NOT EXISTS puente_busco_envios (
      user_id INTEGER NOT NULL,
      dia TEXT NOT NULL,
      n INTEGER NOT NULL,
      PRIMARY KEY (user_id, dia)
    );
  `);
  io.on('connection', (socket) => {
    socket.on('busco:leer', (_d, cb) => {
      if (typeof cb !== 'function') return;
      if (!socket.user || socket.user.isGuest) return cb({ error: 'Solo con cuenta.' });
      try { cb({ juegos: juegos(), mios: mios(socket.user.id) }); } catch (err) { warn('busco:', err.message); cb({ error: 'No se pudo cargar.' }); }
    });
    socket.on('busco:poner', (d, cb) => {
      if (typeof cb !== 'function') return;
      if (!socket.user || socket.user.isGuest) return cb({ error: 'Solo con cuenta.' });
      const juego = d && String(d.juego || '');
      if (!juegos().some((j) => j.id === juego)) return cb({ error: 'Ese juego no avisa.' });
      try {
        if (d.si) db.prepare('INSERT OR IGNORE INTO puente_busco (user_id, juego, desde) VALUES (?, ?, ?)').run(socket.user.id, juego, Date.now());
        else db.prepare('DELETE FROM puente_busco WHERE user_id = ? AND juego = ?').run(socket.user.id, juego);
        cb({ ok: true, mios: mios(socket.user.id) });
      } catch (err) { warn('busco:', err.message); cb({ error: 'No se pudo guardar.' }); }
    });
  });
}

// Los que avisan y estan instalados, con el nombre de su ficha
function juegos() {
  let fichas = [];
  try { fichas = require('./juegos-registro.js').lista(); } catch { /* sin registro */ }
  return AVISAN.map((id) => fichas.find((f) => f.id === id)).filter(Boolean).map((f) => ({ id: f.id, nombre: f.nombre }));
}
const mios = (uid) => db.prepare('SELECT juego FROM puente_busco WHERE user_id = ?').all(uid).map((r) => r.juego);
const diaAR = () => new Date(Date.now() - AR).toISOString().slice(0, 10);

// Quien esta jugando ahora una partida de ese juego (sus mesas "jugando" que se movieron en la ultima hora)
function jugando(juego) {
  const out = new Set();
  try {
    const x = require('./juegos-registro.js').conChat().find((c) => c.ficha.id === juego);
    if (!x || !x.chat.mesas) return out;
    const desde = Date.now() - 60 * 60e3;
    for (const r of db.prepare(`SELECT estado FROM ${x.chat.mesas} WHERE actualizado > ?`).all(desde)) {
      try { const g = JSON.parse(r.estado); if (g && g.estado === 'jugando') for (const u of g.jugadores || []) if (u > 0) out.add(u); } catch { /* una mesa rota */ }
    }
  } catch { /* sin la tabla */ }
  return out;
}

// La mesa nueva (juegos-aviso.js, despues de anunciarla): juego, quien la armo, su nombre, lo que dice y el enlace
function avisar({ juego, quien, nombre, texto, enlace }) {
  if (!db || !AVISAN.includes(juego)) return;
  try {
    const ficha = juegos().find((j) => j.id === juego);
    if (!ficha) return;
    const destinos = db.prepare(`SELECT b.user_id id FROM puente_busco b JOIN users u ON u.id = b.user_id
      WHERE b.juego = ? AND b.user_id != ? AND IFNULL(u.is_guest, 0) = 0`).all(juego, quien).map((r) => r.id);
    if (!destinos.length) return;
    const ocupados = jugando(juego);
    const dia = diaAR();
    const cuenta = db.prepare('SELECT n FROM puente_busco_envios WHERE user_id = ? AND dia = ?');
    const sumar = db.prepare('INSERT INTO puente_busco_envios (user_id, dia, n) VALUES (?, ?, 1) ON CONFLICT(user_id, dia) DO UPDATE SET n = n + 1');
    const avisos = require('./avisos.js');
    const limpio = String(texto || '').replace(/[*_~`|]/g, '');
    let n = 0;
    for (const id of destinos) {
      if (ocupados.has(id)) continue;
      const k = id + ':' + quien;
      if (Date.now() - (ultimoDe.get(k) || 0) < MISMO_CREADOR_MS) continue;
      if (((cuenta.get(id, dia) || {}).n || 0) >= TOPE_DIA) continue;
      ultimoDe.set(k, Date.now());
      if (ultimoDe.size > 2000) ultimoDe.delete(ultimoDe.keys().next().value);
      sumar.run(id, dia);
      avisos.avisarUsuario(id, { title: `🎮 ${nombre} busca partida de ${ficha.nombre}`, body: `${nombre} ${limpio}. Tocá para entrar.`, url: enlace, tag: 'puente-busco-' + juego });
      n++;
    }
    if (n) log(`busco: ${n} aviso${n === 1 ? '' : 's'} de una mesa de ${ficha.nombre}`);
    // (los dias viejos no sirven: se borran de a poco)
    if (Math.random() < 0.05) db.prepare('DELETE FROM puente_busco_envios WHERE dia < ?').run(new Date(Date.now() - AR - 7 * 864e5).toISOString().slice(0, 10));
  } catch (err) { warn('busco:', err.message); }
}

module.exports = { setup, avisar, _test: { juegos, jugando } };
