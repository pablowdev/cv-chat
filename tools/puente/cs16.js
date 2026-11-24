// CS 1.6 (Counter-Strike 1.6 en el navegador) para la seccion Juegos de CV Chat.
// El juego corre en su propio stack (Docker, otra pagina de este VPS) y aca vive
// solo el puente de identidad:
//
//  - POST /puente/api/cs16/entrada (sesion) -> { entrada, url, premios, minimo,
//    participantes }: un pase firmado con el nombre de la cuenta y si es
//    invitado. Vale 12 horas; el servidor del juego lo revisa con el mismo
//    secreto (CS16_SECRETO / CVCHAT_SECRETO). La contraseña de la sala no viaja:
//    la web del juego la inyecta despues de verificar el pase. Los premios son
//    el podio semanal de kills (ver cs16-premios.js).
//  - cs16:inicio (socket, con respuesta) -> lo que muestra la tarjeta: cuanta
//    gente hay en de_dust2.
//
// Variables:
//   CS16_SECRETO   clave compartida con el juego (la misma CVCHAT_SECRETO del juego)
//   CS16_URL       direccion publica del juego (https://cs.circulovicioso.club)
//   CS16_INTERNO   direccion interna para leer el estado (http://cs16-web:27016)
//   CS16_ABIERTO   1 (por defecto) también deja entrar a invitados; 0, solo
//                  cuentas registradas. Los invitados siempre ven la tarjeta,
//                  pero se les pide registrarse para jugar.
const crypto = require('crypto');
const PREMIOS = require('./cs16-premios.js');

const SECRETO = () => String(process.env.CS16_SECRETO || '');
const URL_JUEGO = () => String(process.env.CS16_URL || '').replace(/\/+$/, '');
const INTERNO = () => String(process.env.CS16_INTERNO || 'http://cs16-web:27016').replace(/\/+$/, '');
const ABIERTO = () => process.env.CS16_ABIERTO !== '0';
const TTL_MS = 12 * 60 * 60 * 1000;
const b64 = (x) => Buffer.from(x).toString('base64url');

let db = null, io = null, warn = () => {};
let estado = { gente: 0, max: 12, mapa: 'de_dust2', online: false, cuando: 0 };
let pidiendo = false;
let ultimaPartida = null;
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

// Quien puede entrar: con ABIERTO=1 también los invitados; con 0, solo
// cuentas registradas (los invitados ven la tarjeta y el aviso de registrarse).
const puede = (c) => !!c && SECRETO().length >= 24 && (ABIERTO() || !c.is_guest);

function urlJuego() {
  const u = URL_JUEGO();
  return /^https?:\/\/[^\s]+$/i.test(u) ? u : '';
}

// Avisa a los que tienen el juego abierto pero en otra ventana que empezó una
// ronda. El servidor del juego marca «sinFoco» con lo que reporta el cliente.
function avisarRonda(d) {
  const gente = Array.isArray(d && d.conectados) ? d.conectados : [];
  if (!gente.length) return;
  let avisos;
  try { avisos = require('./avisos.js'); } catch { return; }
  const mapa = String((d && d.map) || 'de_dust2');
  for (const c of gente) {
    if (!c || !c.sinFoco) continue;
    const uid = Number(c.uid);
    if (!Number.isInteger(uid) || uid <= 0) continue;
    try {
      avisos.avisarUsuario(uid, {
        title: 'CS 1.6: empezó una ronda nueva',
        body: `Hay una ronda nueva en ${mapa}. Volvé a la partida.`,
        url: '/app?juegos=cs16',
        tag: 'cs16-ronda',
      });
    } catch { /* sin avisos */ }
  }
}

// Cuantos hay en Dust2 y quiénes están: se le pregunta al servidor del juego,
// como mucho cada 15 s. Con el secreto usa /api/estado (trae los conectados y
// el número de ronda); sin secreto, el /api/status público de siempre.
function refrescar() {
  if (pidiendo || Date.now() - estado.cuando < 15000 || SECRETO().length < 24) return;
  pidiendo = true;
  const conSecreto = SECRETO().length >= 24;
  const headers = conSecreto ? { 'x-cvchat-clave': SECRETO() } : {};
  fetch(INTERNO() + (conSecreto ? '/api/estado' : '/api/status'), { headers, signal: AbortSignal.timeout(4000) })
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => {
      estado = d ? {
        gente: Math.max(Number(d.webPlayers) || 0, 0),
        max: Math.max(Number(d.maxPlayers) || 12, 1),
        mapa: String(d.map || 'de_dust2').slice(0, 32),
        online: d.online === true || d.serverOnline === true,
        cuando: Date.now(),
      } : { gente: 0, max: 12, mapa: 'de_dust2', online: false, cuando: Date.now() };
      if (d && d.partida) {
        const n = Number(d.partida.numero) || 0;
        if (ultimaPartida === null) ultimaPartida = n;
        else if (n !== ultimaPartida) {
          ultimaPartida = n;
          avisarRonda(d);
        }
      }
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
      // Al invitado se le muestra igual la tarjeta, con el cartel y el aviso
      // para crear la cuenta (soloUsuarios); los demás errores son de config.
      if (!puede(c)) return reply({ error: 'Para jugar a CS 1.6 necesitás una cuenta de CV Chat.', soloUsuarios: !!(c && c.is_guest) });
      refrescar();
      reply({
        ok: true,
        gente: estado.gente,
        max: estado.max,
        mapa: estado.mapa,
        online: estado.online,
        prueba: false,
      });
    });
  });
  // La tarjeta y el aviso de ronda se actualizan aunque nadie abra la vista.
  setTimeout(() => refrescar(), 5000).unref?.();
  setInterval(() => refrescar(), 15000).unref?.();
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
  if (!puede(c)) return json(res, 403, { error: 'Para jugar a CS 1.6 necesitás una cuenta de CV Chat.' });
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
  return json(res, 200, {
    entrada,
    url,
    premios: PREMIOS.premios,
    minimo: PREMIOS.minimo,
    participantes: PREMIOS.participantes,
  });
}

module.exports = {
  setup,
  handle,
  firmar,
  rutas: ['/puente/api/cs16/entrada'],
  // «abierto» es para la pagina publica de juegos: si esta configurado, se
  // muestra siempre (con el cartel "Solo usuarios" si no es para invitados).
  // No confundir con ABIERTO(), que decide quien puede entrar.
  abierto: () => !!(urlJuego() && SECRETO().length >= 24),
  _avisarRonda: avisarRonda,
};
