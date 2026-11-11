// Los invitados que se fueron, afuera de los juegos (parte del puente)
//
// Un invitado (o una cuenta que ya no existe: los invitados se borran solos) que cerro la app no vuelve, y
// en una mesa no deja jugar a los demas. Cada 15 segundos se mira en todos los juegos quien esta sentado
// sin estar conectado:
//  - En una mesa que espera gente: al minuto se lo levanta (si la habia armado el, en GlobalSiege la mesa
//    pasa al siguiente; en los de dos, la mesa se cierra).
//  - En una partida empezada: tiene 3 minutos para volver (por si se le corto); despues abandona, como si
//    hubiera tocado Abandonar (en GlobalSiege su ejercito lo sigue la compu; en los de dos gana el otro).
// Las cuentas de verdad no se tocan: para ellas estan los plazos de cada juego.

const ESPERA_MS = 60e3, JUEGO_MS = 3 * 60e3;
let db, io, log, warn;
const desde = new Map(); // "juego:mesa:uid" -> cuando se lo vio desconectado por primera vez

// Cada juego: sus mesas, quien esta sentado y como se lo saca (con las funciones de siempre del juego)
const DE_A_DOS = (archivo, nombre) => ({
  nombre,
  mesas: () => require(archivo)._test.games,
  sentados: (g) => (g.jugadores || []).filter(u => u > 0),
  sacar: (g, uid) => {
    const m = require(archivo)._test;
    if (g.estado === 'esperando') return m.cancel(uid, { id: g.id });
    return m.act(uid, { id: g.id, tipo: 'abandonar' });
  },
});
const JUEGOS = [
  DE_A_DOS('./truco.js', 'truco'),
  DE_A_DOS('./pool.js', 'pool'),
  DE_A_DOS('./ajedrez.js', 'ajedrez'),
  DE_A_DOS('./funball.js', 'funball'),
  {
    nombre: 'globalsiege',
    mesas: () => require('./misionrisk.js')._test.games,
    sentados: (g) => (g.asientos || []).filter(a => a.uid > 0 && !a.abandono).map(a => a.uid),
    sacar: (g, uid) => {
      const m = require('./misionrisk.js')._test;
      if (g.estado === 'esperando') {
        // (si la habia armado el y quedan otros, la mesa pasa al que sigue en vez de cerrarse para todos)
        const otro = g.asientos.find(a => a.uid > 0 && a.uid !== uid);
        if (g.creador === uid && otro) g.creador = otro.uid;
        return m.cancel(uid, { id: g.id });
      }
      return m.act(uid, { id: g.id, tipo: 'abandonar' });
    },
  },
  {
    nombre: 'worgs',
    mesas: () => require('./shoppa.js')._test.games,
    sentados: (g) => (g.jugadores || []).filter((u, i) => u > 0 && !(g.fuera || [])[i]),
    sacar: (g, uid) => require('./shoppa.js')._test.abandonar(uid, { id: g.id }),
  },
];

// Si es alguien que no va a volver: un invitado o una cuenta que ya no esta
function esInvitado(uid) {
  try { const u = db.prepare('SELECT COALESCE(is_guest, 0) g FROM users WHERE id = ?').get(uid); return !u || !!u.g; } catch { return false; }
}

function revisar() {
  const conectados = new Set();
  for (const [, s] of io.sockets.sockets) if (s.user && s.user.id) conectados.add(s.user.id);
  const vistos = new Set(), now = Date.now();
  for (const J of JUEGOS) {
    let mesas;
    try { mesas = J.mesas(); } catch { continue; }
    for (const g of [...mesas.values()]) {
      if (g.estado !== 'esperando' && g.estado !== 'jugando') continue;
      for (const uid of J.sentados(g)) {
        if (conectados.has(uid) || !esInvitado(uid)) continue;
        const k = `${J.nombre}:${g.id}:${uid}`;
        vistos.add(k);
        if (!desde.has(k)) { desde.set(k, now); continue; }
        if (now - desde.get(k) < (g.estado === 'esperando' ? ESPERA_MS : JUEGO_MS)) continue;
        desde.delete(k);
        try {
          const r = J.sacar(g, uid);
          if (r && r.error) warn(`invitados: ${J.nombre} ${g.id}: ${r.error}`);
          else log(`invitados: ${J.nombre}: el invitado ${uid} se fue y ${g.estado === 'esperando' || !mesas.has(g.id) ? 'se lo levantó de la mesa' : 'abandonó la partida'} ${g.id}`);
        } catch (err) { warn(`invitados: ${J.nombre} ${g.id}:`, err.message); }
      }
    }
  }
  // (los que volvieron, o cuya mesa ya no esta, empiezan de cero si se van de nuevo)
  for (const k of [...desde.keys()]) if (!vistos.has(k)) desde.delete(k);
}

function setup(ctx) {
  ({ db, io, log, warn } = ctx);
  setInterval(() => { try { revisar(); } catch (err) { warn('invitados:', err.message); } }, 15e3).unref();
}

module.exports = { setup, _test: { revisar, desde, ESPERA_MS, JUEGO_MS } };
