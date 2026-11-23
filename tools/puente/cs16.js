// CS 1.6 (Counter-Strike 1.6 en el navegador) para la seccion Juegos de CV Chat.
// El juego corre en su propio stack (Docker, otra pagina de este VPS) y aca vive
// solo el puente de identidad:
//
//  - POST /puente/api/cs16/entrada (sesion) -> { entrada, url }: un pase firmado
//    con el nombre de la cuenta y si es invitado. Vale 12 horas; el servidor del
//    juego lo revisa con el mismo secreto (CS16_SECRETO / CVCHAT_SECRETO). La
//    contraseña de la sala no viaja: la web del juego la inyecta despues de
//    verificar el pase.
//  - cs16:inicio (socket, con respuesta) -> lo que muestra la tarjeta: cuanta
//    gente hay en de_dust2.
//
// Variables:
//   CS16_SECRETO   clave compartida con el juego (la misma CVCHAT_SECRETO del juego)
//   CS16_URL       direccion publica del juego (https://cs.circulovicioso.club)
//   CS16_INTERNO   direccion interna para leer el estado (http://cs16-web:27016)
//   CS16_ABIERTO   1 (por defecto) entra todo el mundo; 0, solo administradores
const crypto = require('crypto');

const SECRETO = () => String(process.env.CS16_SECRETO || '');
const URL_JUEGO = () => String(process.env.CS16_URL || '').replace(/\/+$/, '');
const INTERNO = () => String(process.env.CS16_INTERNO || 'http://cs16-web:27016').replace(/\/+$/, '');
const ABIERTO = () => process.env.CS16_ABIERTO !== '0';
const TTL_MS = 12 * 60 * 60 * 1000;
const b64 = (x) => Buffer.from(x).toString('base64url');

let db = null, io = null, warn = () => {};
let estado = { gente: 0, max: 12, mapa: 'de_dust2', online: false, cuando: 0 };
let pidiendo = false;
const pedidos = new Map(); // cuenta -> [momentos de los ultimos pases]

function firmar(datos, clave = SECRETO(), duraMs = TTL_MS) {
  const cuerpo = b64(JSON.stringify({ ...datos, exp: Date.now() + duraMs, k: crypto.randomBytes(9).toString('base64url') }));
  return cuerpo + '.' + b64(crypto.createHmac('sha256', clave).update(cuerpo).digest());
}

function cuenta(id) {
  try {
    return db.prepare('SELECT id, COALESCE(display_name, username) nombre, is_admin, is_guest FROM users WHERE id = ?').get(id) || null;
  } catch {
    return null;
  }
}

// Quien puede entrar: con el juego configurado, todos; en modo cerrado, solo admins.
const puede = (c) => !!c && SECRETO().length >= 24 && (ABIERTO() || !!c.is_admin);

function urlJuego() {
  const u = URL_JUEGO();
  return /^https?:\/\/[^\s]+$/i.test(u) ? u : '';
}

// Cuantos hay en Dust2: se le pregunta al servidor del juego, como mucho cada 15 s.
function refrescar() {
  if (pidiendo || Date.now() - estado.cuando < 15000 || SECRETO().length < 24) return;
  pidiendo = true;
  fetch(INTERNO() + '/api/status', { signal: AbortSignal.timeout(4000) })
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => {
      estado = d ? {
        gente: Math.max(Number(d.webPlayers) || 0, 0),
        max: Math.max(Number(d.maxPlayers) || 12, 1),
        mapa: String(d.map || 'de_dust2').slice(0, 32),
        online: d.serverOnline === true,
        cuando: Date.now(),
      } : { gente: 0, max: 12, mapa: 'de_dust2', online: false, cuando: Date.now() };
    })
    .catch(() => { estado = { gente: 0, max: 12, mapa: 'de_dust2', online: false, cuando: Date.now() }; })
    .finally(() => { pidiendo = false; });
}

function setup(ctx) {
  db = ctx.db; io = ctx.io; warn = ctx.warn || warn;
  io.on('connection', (socket) => {
    socket.on('cs16:inicio', (data, reply) => {
      if (typeof data === 'function') reply = data;
      if (typeof reply !== 'function') return;
      const c = socket.user && cuenta(socket.user.id);
      if (!puede(c)) return reply({ error: 'CS 1.6 todavía está en prueba.' });
      refrescar();
      reply({
        ok: true,
        gente: estado.gente,
        max: estado.max,
        mapa: estado.mapa,
        online: estado.online,
        prueba: !ABIERTO(),
      });
    });
  });
  if (SECRETO() && SECRETO().length < 24) warn('cs16: CS16_SECRETO es muy corta (hacen falta 24 caracteres o más): el juego queda apagado');
  if (!urlJuego()) warn('cs16: falta CS16_URL (la dirección pública del juego)');
}

// POST /puente/api/cs16/entrada
function handle(req, res, p, u, { sessionUser, json }) {
  if (p !== '/puente/api/cs16/entrada') return false;
  if (req.method !== 'POST') return json(res, 405, { error: 'método' });
  const user = sessionUser(req);
  if (!user) return json(res, 401, { error: 'sin sesión' });
  const c = cuenta(user.id);
  if (!puede(c)) return json(res, 403, { error: 'CS 1.6 todavía está en prueba.' });
  const url = urlJuego();
  if (!url) return json(res, 503, { error: 'CS 1.6 todavía no está configurado.' });

  const ahora = Date.now(), lista = (pedidos.get(c.id) || []).filter((t) => ahora - t < 60000);
  if (lista.length >= 12) return json(res, 429, { error: 'Esperá un momento.' });
  lista.push(ahora); pedidos.set(c.id, lista);
  if (pedidos.size > 2000) pedidos.delete(pedidos.keys().next().value);

  const entrada = firmar({
    u: c.id,
    n: String(c.nombre || 'Jugador').slice(0, 31),
    g: c.is_guest ? 1 : 0,
    ad: c.is_admin ? 1 : 0,
    e: '5',
  });
  return json(res, 200, { entrada, url });
}

module.exports = {
  setup,
  handle,
  firmar,
  rutas: ['/puente/api/cs16/entrada'],
  abierto: () => ABIERTO(),
};
