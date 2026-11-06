// La pantalla de entrar para los que todavia no tienen cuenta (web/login.js): lo que esta pasando en el club,
// para que den ganas de quedarse. Sin sesion: solo lo que ya es publico.
//
//  - Cuantos hay conectados (sin los invitados), cuantos mensajes hubo hoy y cuantas partidas se estan jugando
//  - Un pedacito de #círculo-vicioso: los ultimos mensajes, con nombres y fotos, como la vista previa de un
//    enlace (vistas.js: solo si el canal lo ve cualquiera con cuenta; nunca directos, cerrados ni +18)
//  - Las mesas de juegos abiertas esperando rival (las publicas), para entrar a jugar
//  - Las ultimas publicaciones del Marketplace (con foto) y los temas del foro con movimiento mas reciente
//
//  GET /puente/api/portada   (sin sesion; guardada 30 segundos para que muchas visitas no lleguen a la base)

const CANAL = () => String(process.env.PORTADA_CANAL || 'circulo-vicioso');
const sinTildes = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const JUEGOS = [
  { tabla: 'puente_truco_mesas', juego: 'truco', nombre: 'Truco', param: 'truco', detalle: g => `a ${g.puntos || 30}${g.flor ? ' con flor' : ''}` },
  { tabla: 'puente_funball_mesas', juego: 'funball', nombre: 'Funball', param: 'funball', detalle: () => '' },
  { tabla: 'puente_ajedrez_mesas', juego: 'ajedrez', nombre: 'Ajedrez', param: 'ajedrez', detalle: g => (g.ritmo && g.ritmo !== 'libre' ? g.ritmo : 'sin reloj') },
  { tabla: 'puente_mr_mesas', juego: 'globalsiege', nombre: 'GlobalSiege', param: 'globalsiege', detalle: g => `${(g.asientos || []).filter(a => a.uid).length} en la mesa` },
  { tabla: 'puente_pool_mesas', juego: 'pool', nombre: 'Pool', param: 'pool', detalle: () => '8 bolas' },
];

let hecha = { at: 0, datos: null, pidiendo: null };

function nombre(db, id) {
  const u = id > 0 ? db.prepare('SELECT COALESCE(display_name, username) n, is_guest FROM users WHERE id = ?').get(id) : null;
  return u && !u.is_guest ? u.n : null;
}

// Las mesas: en juego (cuantas), las abiertas esperando rival (cuales) y las que se estan jugando ahora
// entre gente del club (enJuego, para la tarjeta "Ahora en el club" de club.js: con movimiento en los
// ultimos 30 minutos, de dos o mas personas con cuenta, sin las de la compu sola ni las de invitados)
// conIds: con los ids de los que juegan (uids), para que club.js no le ofrezca a nadie sus propias partidas
function mesas(db, conIds) {
  let jugando = 0;
  const abiertas = [], enJuego = [];
  for (const j of JUEGOS) {
    let filas = [];
    try { filas = db.prepare(`SELECT estado, actualizado FROM ${j.tabla}`).all(); } catch { continue; }
    for (const r of filas) {
      let g; try { g = JSON.parse(r.estado); } catch { continue; }
      if (g.estado === 'jugando') jugando++;
      // (la ultima jugada de verdad: el chat, los zumbidos y el barrido no cuentan; chat-partida.js)
      const ultima = g.estado === 'jugando' ? require('./chat-partida.js').ultimaJugada(g) : 0;
      if (g.estado === 'jugando' && Date.now() - ultima < 30 * 60e3) {
        const ids = (g.jugadores || (g.asientos || []).map(a => a && a.uid)).filter(x => x > 0);
        const nombres = ids.map(x => nombre(db, x));
        if (ids.length >= 2 && nombres.every(Boolean)) enJuego.push({ juego: j.juego, nombre: j.nombre, quienes: nombres, at: ultima, enlace: g.publica ? `/app?${j.param}=${encodeURIComponent(g.id)}` : null, ...(conIds ? { uids: ids } : {}) });
      }
      if (g.estado !== 'esperando' || !g.publica) continue;
      const quien = nombre(db, g.creador || (g.jugadores && g.jugadores[0]) || (g.asientos && g.asientos[0] && g.asientos[0].uid));
      if (!quien) continue; // (las de los invitados no se muestran)
      const uids = (g.jugadores || (g.asientos || []).map(a => a && a.uid)).filter(x => x > 0);
      abiertas.push({ juego: j.juego, nombre: j.nombre, detalle: j.detalle(g), quien, enlace: `/app?${j.param}=${encodeURIComponent(g.id)}`, creado: g.creado || 0, ...(conIds ? { uids } : {}) });
    }
  }
  abiertas.sort((a, b) => b.creado - a.creado);
  enJuego.sort((a, b) => b.at - a.at);
  // (con ids: todas, para que club.js saque las de cada uno antes de quedarse con 4)
  const n = conIds ? 50 : 4;
  return { jugando, abiertas: abiertas.slice(0, n).map(({ creado, ...x }) => x), enJuego: enJuego.slice(0, n).map(({ at, ...x }) => x) };
}

async function armar(db, io, warn) {
  const datos = { conectados: 0, mensajesHoy: 0, partidas: 0, chat: null, abiertas: [], mercado: [], foro: [] };
  // Conectados ahora (personas, sin invitados)
  try {
    const ids = new Set();
    for (const s of io.of('/').sockets.values()) if (s.user && s.user.id && !s.user.isGuest) ids.add(s.user.id);
    datos.conectados = ids.size;
  } catch { /* sin conexiones */ }
  // Mensajes de hoy (hora de Argentina) en los canales, sin los directos
  try {
    const ar = new Date(Date.now() - 3 * 3600e3);
    const desde = new Date(Date.UTC(ar.getUTCFullYear(), ar.getUTCMonth(), ar.getUTCDate()) + 3 * 3600e3).toISOString().replace('T', ' ').slice(0, 19);
    datos.mensajesHoy = db.prepare(`SELECT COUNT(*) n FROM messages m JOIN channels c ON c.id = m.channel_id
      WHERE m.created_at >= ? AND COALESCE(c.is_dm, 0) = 0 AND COALESCE(c.is_group, 0) = 0`).get(desde).n;
  } catch (err) { warn('portada: mensajes:', err.message); }
  // Las mesas
  try { const m = mesas(db); datos.partidas = m.jugando; datos.abiertas = m.abiertas; } catch (err) { warn('portada: mesas:', err.message); }
  // El pedacito del chat
  try {
    const vistas = require('./vistas.js');
    const ch = db.prepare('SELECT code, name FROM channels WHERE COALESCE(is_dm, 0) = 0').all().find(c => sinTildes(c.name) === CANAL());
    const pub = ch && vistas.canalPublico(ch.code);
    if (pub) {
      const filas = vistas.ultimosDatos(pub, 6).filter(r => r.texto || r.imagen);
      if (filas.length) datos.chat = { canal: pub.name, mensajes: filas.map(r => ({ autor: r.autor, foto: r.foto, texto: r.texto, emojis: r.emojis, imagen: r.imagen, hora: r.hora })) };
    }
  } catch (err) { warn('portada: chat:', err.message); }
  // El Marketplace y el foro
  try { datos.mercado = require('./mercado.js').ultimas(6); } catch (err) { warn('portada: mercado:', err.message); }
  try {
    datos.foro = (await require('./foro-lector.js').recientes(5)).map(t => ({ tema: t.tema, canal: t.canal, autor: t.autor, respuestas: t.respuestas, url: t.url, ultimo: t.ultimo || t.fecha }));
  } catch (err) { warn('portada: foro:', err.message); }
  return datos;
}

async function handle(req, res, p, u, { json, db, io, warn }) {
  if (p !== '/puente/api/portada') return false;
  if (req.method !== 'GET') return json(res, 405, { error: 'solo GET' });
  res.setHeader('Cache-Control', 'public, max-age=30');
  if (!hecha.datos || Date.now() - hecha.at > 30e3) {
    if (!hecha.pidiendo) hecha.pidiendo = armar(db, io, warn).then(d => { hecha = { at: Date.now(), datos: d, pidiendo: null }; return d; })
      .catch(err => { hecha.pidiendo = null; throw err; });
    try { await hecha.pidiendo; } catch (err) { warn('portada:', err.message); if (!hecha.datos) return json(res, 503, { error: 'no' }); }
  }
  return json(res, 200, hecha.datos);
}

module.exports = { handle, mesas }; // (mesas: tambien lo usa club.js)
