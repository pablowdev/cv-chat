// BACITY: la ciudad de mundo abierto de los Juegos. El juego corre aparte (su propio servidor, en otro
// contenedor, detras de /bacity/ en este mismo dominio; el codigo esta en su propio repositorio). Aca va solo lo
// que lo une con el chat:
//
//  - POST /puente/api/bacity/entrada (sesion) -> { entrada }: un pase firmado que le dice al juego quien es
//    (la cuenta, el nombre, si es invitado, si es administrador). Vale un minuto y una sola vez; el servidor del
//    juego lo revisa con la misma clave. El juego (un iframe del mismo origen) lo pide con la sesion del chat.
//  - bacity:inicio (por el socket, con respuesta) -> lo que muestra la tarjeta de Juegos: cuantos hay en la ciudad.
//    A quien todavia no puede entrar se le responde sin tableros, y la tarjeta no se le muestra.
//  - el aviso en #que-paso cuando alguien entra a la ciudad (como mucho uno cada media hora).
//
// Variables:
//   BACITY_SECRETO   la clave compartida con el servidor del juego (la misma en los dos). Sin ella, no hay juego.
//   BACITY_INTERNO   la direccion del servidor del juego vista desde aca (por defecto http://bacity:8787/bacity)
//   BACITY_ABIERTO   1: entra todo el mundo. Sin eso, solo los administradores (mientras esta en prueba).
//   BACITY_AVISO     1: avisa en #que-paso cuando alguien entra a la ciudad. Sin eso, no avisa.
const crypto = require('crypto');
const { anunciar } = require('./juegos-aviso.js');

const SECRETO = () => String(process.env.BACITY_SECRETO || '');
const INTERNO = () => String(process.env.BACITY_INTERNO || 'http://bacity:8787/bacity').replace(/\/+$/, '');
const ABIERTO = () => process.env.BACITY_ABIERTO === '1';
const AVISO = () => process.env.BACITY_AVISO === '1';
const b64 = (x) => Buffer.from(x).toString('base64url');
let db = null, io = null, warn = () => {};
let estado = { gente: 0, nombres: [], cuando: 0 }, pidiendo = false, ultimoAviso = 0;
const pedidos = new Map(); // cuenta -> [momentos de los ultimos pases] (un tope, por las dudas)

// El pase: base64url(JSON) + '.' + base64url(HMAC-SHA256(esa primera parte)). Lo mismo que revisa el juego
// (servidor/entrada.js en su repositorio): si cambia aca, cambia alla.
function firmar(datos, clave = SECRETO(), duraMs = 60000) {
  const cuerpo = b64(JSON.stringify({ ...datos, exp: Date.now() + duraMs, k: crypto.randomBytes(9).toString('base64url') }));
  return cuerpo + '.' + b64(crypto.createHmac('sha256', clave).update(cuerpo).digest());
}

function cuenta(id) {
  try { return db.prepare('SELECT id, COALESCE(display_name, username) nombre, is_admin, is_guest FROM users WHERE id = ?').get(id) || null; } catch { return null; }
}
// Quien puede entrar: con el juego configurado, los administradores; y todos cuando se abre (BACITY_ABIERTO=1)
const puede = (c) => !!c && SECRETO().length >= 24 && (ABIERTO() || !!c.is_admin);

// Cuantos hay en la ciudad: se le pregunta al servidor del juego, como mucho cada 15 segundos y solo si alguien mira
function refrescar() {
  if (pidiendo || Date.now() - estado.cuando < 15000 || SECRETO().length < 24) return;
  pidiendo = true;
  fetch(INTERNO() + '/interno/estado', { headers: { 'x-bacity-clave': SECRETO() }, signal: AbortSignal.timeout(4000) })
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => { estado = d ? { gente: d.jugadores | 0, nombres: Array.isArray(d.nombres) ? d.nombres.slice(0, 30).map(String) : [], cuando: Date.now() } : { gente: 0, nombres: [], cuando: Date.now() }; })
    .catch(() => { estado = { gente: 0, nombres: [], cuando: Date.now() }; })
    .finally(() => { pidiendo = false; });
}

function setup(ctx) {
  db = ctx.db; io = ctx.io; warn = ctx.warn || warn;
  io.on('connection', (socket) => {
    socket.on('bacity:inicio', (data, reply) => {
      if (typeof data === 'function') reply = data;
      if (typeof reply !== 'function') return;
      const c = socket.user && cuenta(socket.user.id);
      if (!puede(c)) return reply({ mias: [], abiertas: [], activas: 0, tableros: [] });
      refrescar();
      reply({ mias: [], abiertas: [], activas: 0, tableros: ['centro'], gente: estado.gente, nombres: estado.nombres, prueba: !ABIERTO() });
    });
  });
  if (SECRETO() && SECRETO().length < 24) warn('bacity: BACITY_SECRETO es muy corta (hacen falta 24 caracteres o más): el juego queda apagado');
}

// POST /puente/api/bacity/entrada
function handle(req, res, p, u, { sessionUser, json }) {
  if (p !== '/puente/api/bacity/entrada') return false;
  if (req.method !== 'POST') return json(res, 405, { error: 'metodo' });
  const user = sessionUser(req);
  if (!user) return json(res, 401, { error: 'sin sesion' });
  const c = cuenta(user.id);
  if (!puede(c)) return json(res, 403, { error: 'BACITY todavía está en prueba.' });
  const ahora = Date.now(), lista = (pedidos.get(c.id) || []).filter((t) => ahora - t < 60000);
  if (lista.length >= 12) return json(res, 429, { error: 'Esperá un momento.' });
  lista.push(ahora); pedidos.set(c.id, lista);
  if (pedidos.size > 2000) pedidos.delete(pedidos.keys().next().value);
  // el aviso en #que-paso: solo con el juego abierto a todos, y no mas de uno cada media hora
  if (ABIERTO() && AVISO() && !c.is_guest && ahora - ultimoAviso > 30 * 60e3) {
    ultimoAviso = ahora;
    anunciar(db, io, warn, { juego: 'bacity', quien: c.id, texto: 'anda por la ciudad de **BACITY**', enlace: '/app?juegos=bacity' });
  }
  return json(res, 200, { entrada: firmar({ u: c.id, n: String(c.nombre || '').slice(0, 32), a: null, i: c.is_guest ? 1 : 0, ad: c.is_admin ? 1 : 0 }) });
}

module.exports = { setup, handle, firmar };
