// La mudanza a CV Chat con fecha (del 9/11 al 24/11/2026): un cronograma que el servidor cumple solo,
// aunque nadie tenga la compu prendida. Cada paso tiene dia y hora (de Argentina) y se hace una sola
// vez; si el chat se reinicia, sigue donde quedo.
//
//  - anuncio:      el bot publica en #círculo-vicioso de Discord (con @everyone o @here si el paso lo
//                  dice) y el mismo mensaje entra a CV Chat
//  - privados:     el bot les escribe por privado a los que escriben en Discord sin cuenta vinculada
//  - emails:       a los que tienen cuenta (y email confirmado) pero siguen escribiendo desde Discord
//  - lento:        modo lento en los canales de Discord (1 mensaje por minuto)
//  - solo_lectura: en Discord nadie puede escribir ni reaccionar (se sigue viendo todo, tambien lo que
//                  se escribe en CV Chat); se abre #pasate-a-cv-chat, donde el bot explica como pasarse,
//                  y en cada canal queda fijado un aviso
//  - resumen:      un email a los administradores con como va la mudanza
//
// Insignias (logros.js): "Fundador" a quien escribio en CV Chat antes del corte, y "Campeón de la Copa
// Mudanza" a quien mas partidas de truco gano entre el anuncio y el corte.
//
// Todo lo que toca Discord se puede deshacer: antes de cambiar un canal se guardan sus permisos y su
// modo lento (puente_mudanza_permisos). Desde la pagina Admin (pestaña Mudanza) se ve el cronograma,
// los numeros, y se puede pausar, posponer, ejecutar un paso, cambiar un texto o deshacer.
//
// En la copia de prueba (PUENTE_PRUEBA=1) no toca Discord ni manda emails: solo anota lo que haria.

'use strict';

let db, api, log, warn, appName, publicUrl, getGuildId, getBotUserId, postInHaven;
const ENSAYO = process.env.PUENTE_PRUEBA === '1';
const ar = (s) => Date.parse(s + ':00-03:00'); // '2026-11-09T12:30' en hora de Argentina
const HORA = 3600e3, DIA = 24 * HORA;
const GHOST = 2; // "discord-historial"

// Permisos de Discord
const P = { ADD_REACTIONS: 1n << 6n, VIEW: 1n << 10n, SEND: 1n << 11n, MANAGE_MESSAGES: 1n << 13n, HISTORY: 1n << 16n,
  CREATE_PUBLIC_THREADS: 1n << 35n, CREATE_PRIVATE_THREADS: 1n << 36n, SEND_IN_THREADS: 1n << 38n };
const ESCRIBIR = P.SEND | P.SEND_IN_THREADS | P.CREATE_PUBLIC_THREADS | P.CREATE_PRIVATE_THREADS | P.ADD_REACTIONS;
const TIPOS_TEXTO = new Set([0, 5, 15, 16]); // texto, anuncios, foro, multimedia (la voz no se toca)

// ── Textos ──────────────────────────────────────────────────────────────────
// {enlace} {cuentas} {copa} {fundadores} {campeon} se completan al mandar. Se pueden cambiar desde el panel.
const T = {
  principal: [
    '🏠 **Nos mudamos del todo a CV Chat** @everyone',
    '',
    'Desde el **martes 24/11 a las 12**, este Discord queda **solo para leer**. Para seguir charlando, entrá a CV Chat: es un clic con tu cuenta de Discord, y **todos tus mensajes de antes pasan a tu cuenta**, con tu nombre y tu foto.',
    '',
    '**¿Por qué?** Porque CV siempre fue así: lo hacemos nosotros, a nuestra manera.',
    '🛠️ **Es nuestro.** CV Chat corre en un servidor propio. No dependemos de una empresa que mañana cambie las reglas, nos llene de publicidad, nos cobre por subir un video o nos cierre el servidor.',
    '🗳️ **Nos gobernamos nosotros.** Las reglas, los canales y lo que se puede hacer los decidimos acá, no un algoritmo ni los términos de otro.',
    '🗄️ **Nada se pierde.** Todo lo que escribimos desde 2020 queda guardado y archivado: búsquedas, fotos y videos originales. Discord borra adjuntos, limita la búsqueda y en cualquier momento puede desaparecer todo. Acá la memoria del club es nuestra.',
    '',
    'Además: juegos (truco, ajedrez, funball), marketplace, guardados, archivos más pesados y el foro integrado. Sin publicidad y gratis.',
    '',
    '🏅 Quien escriba en CV Chat antes del 24/11 se lleva la insignia **Fundador**. Y arranca la **Copa Mudanza**: quien más partidas de truco gane hasta el 24/11 se lleva la de **Campeón**.',
    '',
    '👉 Entrá acá: {enlace}',
  ].join('\n'),
  recordatorio: [
    '@here 🏠 Recordatorio: desde el **martes 24/11** este Discord queda solo para leer y la charla sigue en CV Chat. Es un clic con tu Discord y tus mensajes de siempre se vienen con vos: {enlace}',
    'CV Chat es nuestro: servidor propio, reglas propias y la historia del club guardada para siempre.',
    '🏆 Copa Mudanza: {copa}',
  ].join('\n'),
  semana: [
    '@everyone ⏳ **Falta una semana.** El **martes 24/11 a las 12** este Discord queda solo para leer.',
    'Desde hoy, acá hay **modo lento** (un mensaje por minuto). En CV Chat no hay límites.',
    'Ya somos **{cuentas}** en CV Chat. Pasate en un clic con tu Discord, con todo tu historial: {enlace}',
    '🏅 Quien escriba en CV Chat antes del 24/11 queda como **Fundador**. 🏆 Copa Mudanza: {copa}',
  ].join('\n'),
  martes: [
    '@here 📅 **El martes 24/11 a las 12, este Discord queda solo para leer.**',
    'Cómo pasarte (un minuto):',
    '1. Entrá a {enlace}',
    '2. Tocá "Entrar con Discord" y aceptá.',
    '3. Listo: estás en CV Chat con tu nombre, tu foto y todos tus mensajes.',
    'Si querés, bajate la app para el celu o la PC: https://circulovicioso.club/descargar',
  ].join('\n'),
  ultimo: [
    '@everyone 🔒 **Mañana a las 12, este Discord queda solo para leer.** Vas a poder seguir viendo todo, pero para escribir hay que estar en CV Chat.',
    'Es un clic: {enlace}',
    'Hasta mañana a las 12 todavía te llevás la insignia **Fundador**. 🏆 Copa Mudanza: {copa}',
  ].join('\n'),
  corte: [
    '🏠 **Listo: nos mudamos.** Desde ahora la charla es en CV Chat y este Discord queda para leer.',
    '🏅 Fundadores: **{fundadores}** personas. 🏆 Campeón de la Copa Mudanza: **{campeon}**.',
    '¿Te quedaste afuera? Entrá con tu Discord en {enlace} o escribí en #pasate-a-cv-chat.',
  ].join('\n'),
  privados1: [
    '👋 ¡Hola! Te escribo desde el servidor **Círculo Vicioso**. Desde el **martes 24/11** el Discord queda solo para leer: la charla sigue en **CV Chat**, nuestro chat propio.',
    'Pasarte es un clic con tu cuenta de Discord, y tus mensajes de siempre quedan en tu cuenta: {enlace}',
    'CV Chat es del club: servidor propio, reglas propias y toda la historia guardada. Además tiene juegos, marketplace y el foro.',
  ].join('\n'),
  privados2: [
    '👋 Último aviso: el **martes 24/11 a las 12** el Discord de **Círculo Vicioso** queda solo para leer. Para seguir charlando, pasate a CV Chat en un clic con tu Discord: {enlace}',
    'Si escribís antes del 24 te llevás la insignia **Fundador**.',
  ].join('\n'),
  email: [
    '¡Hola {nombre}! Ya tenés tu cuenta en CV Chat, con tu Discord vinculado, pero seguís escribiendo desde Discord.',
    'Desde el martes 24/11 a las 12, el Discord del club queda solo para leer: para seguir charlando hay que estar en CV Chat.',
    'Ahí está todo: los mismos canales y tu historial completo, y además juegos, marketplace, guardados y el foro. Es del club: servidor propio, reglas propias y nada se pierde.',
    'Entrá con el mismo usuario de siempre. Si escribís antes del 24/11 te llevás la insignia Fundador.',
  ].join('\n\n'),
  canal: '🔒 **Este canal quedó solo para leer.** La charla sigue en CV Chat, con los mismos canales y todo el historial. Pasate en un clic con tu Discord: {enlace}',
  pasate: [
    '👋 **¿Querés seguir charlando? Pasate a CV Chat en un minuto:**',
    '1. Entrá a {enlace}',
    '2. Tocá "Entrar con Discord" y aceptá.',
    '3. Listo: estás en CV Chat con tu nombre, tu foto y todos tus mensajes de Discord.',
    'También podés bajarte la app: https://circulovicioso.club/descargar',
  ].join('\n'),
  respuesta: '¡Hola! Para pasarte a CV Chat: entrá a {enlace}, tocá "Entrar con Discord" y listo, con todo tu historial. Si algo no anda, contalo acá con detalle y lo vemos.',
};

// El cronograma (se carga una sola vez; despues manda lo que esta en la base)
const PLAN = [
  ['anuncio-principal', '2026-11-09T12:30', 'anuncio', 'Anuncio principal (@everyone, fijado)', T.principal, { menciona: 'everyone', fijar: true }],
  ['privados-1', '2026-11-10T13:00', 'privados', 'Privados del bot a quienes escriben sin cuenta', T.privados1, { ronda: 1 }],
  ['emails', '2026-11-11T13:00', 'emails', 'Email a los que tienen cuenta y siguen en Discord', T.email, {}],
  ['recordatorio', '2026-11-13T23:00', 'anuncio', 'Recordatorio (@here)', T.recordatorio, { menciona: 'here' }],
  ['falta-semana', '2026-11-16T12:30', 'anuncio', 'Falta una semana (@everyone)', T.semana, { menciona: 'everyone' }],
  ['modo-lento', '2026-11-16T12:31', 'lento', 'Modo lento en Discord (1 por minuto)', null, {}],
  ['privados-2', '2026-11-18T13:00', 'privados', 'Último privado del bot a quienes siguen sin cuenta', T.privados2, { ronda: 2 }],
  ['como-pasarse', '2026-11-20T13:00', 'anuncio', 'Cómo pasarse, paso a paso (@here)', T.martes, { menciona: 'here' }],
  ['ultimo-aviso', '2026-11-23T22:00', 'anuncio', 'Último aviso (@everyone)', T.ultimo, { menciona: 'everyone' }],
  ['solo-lectura', '2026-11-24T12:00', 'solo_lectura', 'Discord solo para leer + #pasate-a-cv-chat', null, {}],
  ['anuncio-corte', '2026-11-24T12:02', 'anuncio', 'Anuncio del corte, con Fundadores y Campeón', T.corte, {}],
  ['resumen-1', '2026-12-01T10:00', 'resumen', 'Resumen por email a los admins', null, {}],
  ['resumen-2', '2026-12-08T10:00', 'resumen', 'Resumen por email a los admins', null, {}],
  ['resumen-3', '2026-12-15T10:00', 'resumen', 'Resumen por email a los admins', null, {}],
];
const INICIO_COPA = ar('2026-11-09T12:30');
const CORTE = 'solo-lectura';

// ── Base ────────────────────────────────────────────────────────────────────
function setup(ctx) {
  ({ db, api, log, warn, appName, publicUrl, getGuildId, getBotUserId, postInHaven } = ctx);
  db.exec(`
    CREATE TABLE IF NOT EXISTS puente_mudanza_pasos (clave TEXT PRIMARY KEY, cuando INTEGER NOT NULL, tipo TEXT NOT NULL, nombre TEXT NOT NULL,
      texto TEXT, opciones TEXT, estado TEXT NOT NULL DEFAULT 'pendiente', hecho INTEGER, detalle TEXT);
    CREATE TABLE IF NOT EXISTS puente_mudanza_config (clave TEXT PRIMARY KEY, valor TEXT);
    CREATE TABLE IF NOT EXISTS puente_mudanza_permisos (canal_id TEXT PRIMARY KEY, nombre TEXT, overwrites TEXT, lento INTEGER, cambiado INTEGER);
    CREATE TABLE IF NOT EXISTS puente_mudanza_envios (tipo TEXT NOT NULL, destino TEXT NOT NULL, cuando INTEGER NOT NULL, ok INTEGER, PRIMARY KEY (tipo, destino));
    CREATE TABLE IF NOT EXISTS puente_mudanza_fundadores (user_id INTEGER PRIMARY KEY, desde INTEGER);
    CREATE TABLE IF NOT EXISTS puente_mudanza_campeones (user_id INTEGER PRIMARY KEY, puntos INTEGER);
  `);
  if (!db.prepare('SELECT COUNT(*) n FROM puente_mudanza_pasos').get().n) {
    const ins = db.prepare('INSERT INTO puente_mudanza_pasos (clave, cuando, tipo, nombre, texto, opciones) VALUES (?, ?, ?, ?, ?, ?)');
    for (const [clave, cuando, tipo, nombre, texto, op] of PLAN) ins.run(clave, ar(cuando), tipo, nombre, texto, JSON.stringify(op));
    cfg('estado', 'activo');
  }
  // Lo que quedo a medias por un reinicio se retoma (los envios ya hechos no se repiten)
  db.prepare("UPDATE puente_mudanza_pasos SET estado = 'pendiente' WHERE estado = 'en curso'").run();
  setInterval(() => { tick().catch(e => warn('mudanza-plan:', e.message)); }, 60e3);
  setTimeout(() => { tick().catch(e => warn('mudanza-plan:', e.message)); }, 20e3);
  log(`mudanza: cronograma ${cfg('estado')}${ENSAYO ? ' (ensayo: no toca Discord ni manda emails)' : ''}`);
}

function cfg(clave, valor) {
  if (valor === undefined) { const r = db.prepare('SELECT valor FROM puente_mudanza_config WHERE clave = ?').get(clave); return r ? r.valor : null; }
  db.prepare('INSERT INTO puente_mudanza_config (clave, valor) VALUES (?, ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor').run(clave, valor === null ? null : String(valor));
}
const paso = (clave) => db.prepare('SELECT * FROM puente_mudanza_pasos WHERE clave = ?').get(clave);
const marcar = (clave, estado, detalle) => db.prepare('UPDATE puente_mudanza_pasos SET estado = ?, detalle = ?, hecho = CASE WHEN ? IN (\'hecho\', \'error\', \'vencido\') THEN ? ELSE hecho END WHERE clave = ?')
  .run(estado, detalle == null ? null : String(detalle).slice(0, 2000), estado, Date.now(), clave);
const corteMs = () => (paso(CORTE) || {}).cuando || ar('2026-11-24T12:00');
const enlace = () => (publicUrl || 'https://chat.circulovicioso.club') + '/puente/entrar';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ── El reloj ────────────────────────────────────────────────────────────────
let corriendo = false;
async function tick() {
  actualizarFundadores();
  if (corriendo || cfg('estado') !== 'activo') return;
  const p = db.prepare("SELECT * FROM puente_mudanza_pasos WHERE estado = 'pendiente' AND cuando <= ? ORDER BY cuando LIMIT 1").get(Date.now());
  if (!p) return;
  // Un anuncio o un envio de hace mas de 12 h ya no tiene sentido (el chat estuvo apagado): se saltea.
  // Lo de Discord (modo lento, solo lectura) se hace igual.
  if (['anuncio', 'privados', 'emails', 'resumen'].includes(p.tipo) && Date.now() - p.cuando > 12 * HORA) { marcar(p.clave, 'vencido', 'El chat estaba apagado a esa hora; se salteó.'); return; }
  await ejecutar(p.clave);
}

async function ejecutar(clave) {
  const p = paso(clave);
  if (!p || corriendo) return { error: 'ocupado' };
  corriendo = true;
  marcar(clave, 'en curso', p.detalle);
  try {
    const op = JSON.parse(p.opciones || '{}');
    let r;
    if (p.tipo === 'anuncio') r = await anuncio(p, op);
    else if (p.tipo === 'privados') r = await privados(p, op);
    else if (p.tipo === 'emails') r = await emails(p);
    else if (p.tipo === 'lento') r = await lento(true);
    else if (p.tipo === 'solo_lectura') r = await soloLectura();
    else if (p.tipo === 'resumen') r = await resumen();
    else r = { estado: 'error', detalle: 'tipo desconocido' };
    marcar(clave, r.estado || 'hecho', r.detalle);
    log(`mudanza: ${clave} -> ${r.estado || 'hecho'}${r.detalle ? ' (' + r.detalle + ')' : ''}`);
    if (r.reintentar) db.prepare("UPDATE puente_mudanza_pasos SET estado = 'pendiente', cuando = ? WHERE clave = ?").run(Date.now() + r.reintentar, clave);
    return r;
  } catch (err) {
    marcar(clave, 'error', err.message);
    warn(`mudanza: ${clave}:`, err.message);
    return { estado: 'error', detalle: err.message };
  } finally { corriendo = false; }
}

// ── Numeros ─────────────────────────────────────────────────────────────────
function cuentas() { return db.prepare('SELECT COUNT(*) n FROM users').get().n - 1; }
function copa(limite = 5) {
  const desde = INICIO_COPA, hasta = Math.min(Date.now(), corteMs());
  const pts = new Map();
  const sumar = (uid, n) => { if (uid > 0) pts.set(uid, (pts.get(uid) || 0) + n); };
  const compuPorDia = new Map(); // contra la compu: 1 punto, hasta 3 por persona y dia
  const tablas = [
    ['puente_truco_partidas', 'ganador', 'compu', 'fin'], // solo el truco
  ];
  for (const [t, g, c, f] of tablas) {
    let filas = [];
    try { filas = db.prepare(`SELECT ${g} g, ${c} c, ${f} f FROM ${t} WHERE ${f} >= ? AND ${f} < ? AND ${g} > 0`).all(desde, hasta); } catch { continue; }
    for (const r of filas) {
      if (!r.c) { sumar(r.g, 3); continue; }
      const k = r.g + ':' + new Date(r.f - 3 * HORA).toISOString().slice(0, 10);
      const n = compuPorDia.get(k) || 0;
      if (n < 3) { compuPorDia.set(k, n + 1); sumar(r.g, 1); }
    }
  }
  const nombre = (id) => { const u = db.prepare('SELECT username, display_name FROM users WHERE id = ?').get(id); return u ? (u.display_name || u.username) : '?'; };
  return [...pts].sort((a, b) => b[1] - a[1]).slice(0, limite).map(([id, n]) => ({ id, nombre: nombre(id), puntos: n }));
}
function copaTexto() {
  const c = copa(3);
  if (!c.length) return 'todavía no hay partidas: arrancá vos (Juegos → Truco, en CV Chat)';
  return 'va ganando **' + c[0].nombre + '** con ' + c[0].puntos + (c[0].puntos === 1 ? ' punto' : ' puntos') + (c[1] ? ', después ' + c[1].nombre + ' (' + c[1].puntos + ')' : '');
}
function completar(texto, extra = {}) {
  const campeones = db.prepare('SELECT user_id FROM puente_mudanza_campeones').all().map(r => (db.prepare('SELECT username, display_name FROM users WHERE id = ?').get(r.user_id) || {}));
  const v = {
    enlace: enlace(), cuentas: String(cuentas()), fundadores: String(db.prepare('SELECT COUNT(*) n FROM puente_mudanza_fundadores').get().n),
    campeon: campeones.length ? campeones.map(u => u.display_name || u.username).join(' y ') : '—', ...extra,
  };
  return String(texto || '').replace(/\{(\w+)\}/g, (m, k) => (k === 'copa' ? copaTexto() : v[k] !== undefined ? v[k] : m));
}
// Quienes escriben desde Discord (por su autor de Discord, puente_autores)
function escribenEnDiscord(dias) {
  return db.prepare(`SELECT a.discord_user_id d, COUNT(*) n, v.haven_user_id h FROM messages m JOIN puente_autores a ON a.message_id = m.id
    LEFT JOIN puente_vinculos v ON v.discord_user_id = a.discord_user_id
    WHERE m.created_at >= datetime('now', ?) AND a.discord_user_id NOT IN (SELECT discord_user_id FROM puente_bots)
    GROUP BY a.discord_user_id ORDER BY n DESC`).all(`-${dias} days`);
}
let numerosCache = null;
function numeros() {
  if (numerosCache && Date.now() - numerosCache.at < 5 * 60e3) return numerosCache.datos;
  const tot = db.prepare(`SELECT COUNT(*) n FROM messages m JOIN channels c ON c.id = m.channel_id WHERE c.is_dm = 0 AND m.created_at >= datetime('now', '-7 days')`).get().n;
  const dsc = db.prepare(`SELECT COUNT(*) n FROM messages m JOIN channels c ON c.id = m.channel_id JOIN puente_autores a ON a.message_id = m.id WHERE c.is_dm = 0 AND m.created_at >= datetime('now', '-7 days')`).get().n;
  const en = escribenEnDiscord(7);
  const datos = {
    discordPorcentaje: tot ? Math.round(dsc * 100 / tot) : 0, mensajes7: tot,
    enDiscordSinCuenta: en.filter(x => !x.h).length, enDiscordConCuenta: en.filter(x => x.h).length,
    cuentas: cuentas(),
    privados: db.prepare("SELECT COUNT(*) n FROM puente_mudanza_envios WHERE tipo LIKE 'privados-%' AND ok = 1").get().n,
    emails: db.prepare("SELECT COUNT(*) n FROM puente_mudanza_envios WHERE tipo = 'emails' AND ok = 1").get().n,
    fundadores: db.prepare('SELECT COUNT(*) n FROM puente_mudanza_fundadores').get().n,
    copa: copa(5),
  };
  numerosCache = { at: Date.now(), datos };
  return datos;
}

// ── Fundadores: quien escribio en CV Chat (no desde Discord) antes del corte ──
function actualizarFundadores() {
  try {
    const corte = corteMs();
    let desde = Number(cfg('fundadores_id') || 0);
    if (!desde) { const r = db.prepare("SELECT MIN(id) id FROM messages WHERE created_at >= '2026-10-01'").get(); desde = (r && r.id ? r.id : 1) - 1; }
    const filas = db.prepare(`SELECT m.id, m.user_id, m.created_at FROM messages m JOIN channels c ON c.id = m.channel_id AND c.is_dm = 0
      LEFT JOIN puente_autores a ON a.message_id = m.id
      WHERE m.id > ? AND a.message_id IS NULL AND m.imported_from IS NULL AND m.is_webhook = 0 AND m.user_id IS NOT NULL AND m.user_id != ?
      ORDER BY m.id LIMIT 5000`).all(desde, GHOST);
    const ins = db.prepare('INSERT OR IGNORE INTO puente_mudanza_fundadores (user_id, desde) VALUES (?, ?)');
    let ultimo = desde;
    for (const m of filas) {
      ultimo = m.id;
      const ms = Date.parse(String(m.created_at).replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(m.created_at) ? '' : 'Z'));
      if (Number.isFinite(ms) && ms < corte) ins.run(m.user_id, ms);
    }
    if (filas.length) cfg('fundadores_id', ultimo);
  } catch (err) { warn('mudanza fundadores:', err.message); }
}
// Las insignias de la mudanza de una persona (logros.js): [id, emoji, nombre, detalle]
function insignias(userId) {
  const out = [];
  if (db.prepare('SELECT 1 FROM puente_mudanza_fundadores WHERE user_id = ?').get(userId)) out.push(['fundador', '🏠', 'Fundador', 'Se pasó a CV Chat antes de la mudanza (24/11/2026)']);
  if (db.prepare('SELECT 1 FROM puente_mudanza_campeones WHERE user_id = ?').get(userId)) out.push(['campeon-mudanza', '🏆', 'Campeón de la Copa', 'Ganó la Copa Mudanza de truco (noviembre 2026)']);
  return out;
}

// ── Discord ─────────────────────────────────────────────────────────────────
async function discord(method, endpoint, body) {
  if (ENSAYO) { log(`mudanza (ensayo): ${method} ${endpoint}${body && body.content ? ' «' + String(body.content).slice(0, 60).replace(/\n/g, ' ') + '…»' : ''}`); return { id: 'ensayo-' + Date.now(), ensayo: true }; }
  return api(method, endpoint, body);
}
function canalCirculo() {
  const r = db.prepare("SELECT discord_channel_id d FROM channels WHERE name = 'círculo-vicioso' AND discord_channel_id IS NOT NULL").get();
  return r && r.d;
}

async function anuncio(p, op) {
  const canal = canalCirculo();
  if (!canal) return { estado: 'error', detalle: 'no encontré #círculo-vicioso' };
  const content = completar(p.texto).slice(0, 2000);
  const parse = op.menciona ? ['everyone'] : [];
  const m = await discord('POST', `/channels/${canal}/messages`, { content, allowed_mentions: { parse }, flags: 1 << 2 });
  if (!m || m.__error) return { estado: 'error', detalle: 'Discord: ' + (m && m.__error) };
  if (!m.ensayo && postInHaven) { try { await postInHaven(m); } catch (e) { warn('mudanza: no entró a CV Chat:', e.message); } }
  if (op.fijar && !m.ensayo) await api('PUT', `/channels/${canal}/pins/${m.id}`);
  return { estado: 'hecho', detalle: 'Publicado' + (m.ensayo ? ' (ensayo)' : '') };
}

async function privados(p, op) {
  const tipo = 'privados-' + (op.ronda || 1);
  const ya = new Set(db.prepare('SELECT destino FROM puente_mudanza_envios WHERE tipo = ?').all(tipo).map(r => r.destino));
  const destinos = escribenEnDiscord(30).filter(x => !x.h && !ya.has(String(x.d)));
  const anotar = db.prepare('INSERT OR REPLACE INTO puente_mudanza_envios (tipo, destino, cuando, ok) VALUES (?, ?, ?, ?)');
  let ok = 0, cerrados = 0;
  for (const x of destinos) {
    if (cfg('estado') !== 'activo') return { estado: 'pendiente', detalle: `Pausado: ${ok} mandados`, reintentar: 60e3 };
    if (paso(p.clave).estado !== 'en curso') break;
    anotar.run(tipo, String(x.d), Date.now(), 0);
    const dm = await discord('POST', '/users/@me/channels', { recipient_id: String(x.d) });
    let bien = false;
    if (dm && !dm.__error && dm.id) {
      const r = await discord('POST', `/channels/${dm.id}/messages`, { content: completar(p.texto).slice(0, 2000), allowed_mentions: { parse: [] }, flags: 1 << 2 });
      bien = !!(r && !r.__error);
    }
    if (bien) { ok++; anotar.run(tipo, String(x.d), Date.now(), 1); } else cerrados++;
    await sleep(ENSAYO ? 50 : 3000);
  }
  return { estado: 'hecho', detalle: `${ok} privados mandados${cerrados ? `, ${cerrados} con los privados cerrados` : ''} (de ${destinos.length})` };
}

async function emails(p) {
  const email = require('./email.js');
  if (!email.on() && !ENSAYO) return { estado: 'error', detalle: 'el email está apagado' };
  const ya = new Set(db.prepare("SELECT destino FROM puente_mudanza_envios WHERE tipo = 'emails'").all().map(r => r.destino));
  const conCuenta = escribenEnDiscord(14).filter(x => x.h && !ya.has(String(x.h)));
  const anotar = db.prepare("INSERT OR REPLACE INTO puente_mudanza_envios (tipo, destino, cuando, ok) VALUES ('emails', ?, ?, ?)");
  let ok = 0, sinEmail = 0;
  for (const x of conCuenta) {
    if (cfg('estado') !== 'activo') return { estado: 'pendiente', detalle: `Pausado: ${ok} mandados`, reintentar: 60e3 };
    const e = db.prepare('SELECT e.email, u.username, u.display_name FROM puente_emails e JOIN users u ON u.id = e.haven_user_id WHERE e.haven_user_id = ? AND e.confirmado = 1').get(x.h);
    if (!e) { sinEmail++; anotar.run(String(x.h), Date.now(), 0); continue; }
    // El limite diario de envios (lo comparten con los de confirmar email): si no da, se sigue mañana
    const hoy = db.prepare('SELECT COUNT(*) n FROM puente_email_envios WHERE enviado > ?').get(Date.now() - DIA).n;
    if (hoy >= 85) return { estado: 'pendiente', detalle: `${ok} mandados hoy; sigue mañana (límite diario)`, reintentar: 6 * HORA };
    const parrafos = completar(p.texto, { nombre: e.display_name || e.username }).split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
    let bien = true;
    if (ENSAYO) log(`mudanza (ensayo): email a ${e.username}`);
    else bien = await email.sendMail(e.email, 'Tu cuenta de CV Chat te está esperando', 'Nos mudamos del todo a CV Chat', parrafos,
      ['Abrir CV Chat', (publicUrl || 'https://chat.circulovicioso.club') + '/app'], 'Te llega porque tenés una cuenta en CV Chat con este email confirmado.');
    if (bien) {
      ok++; anotar.run(String(x.h), Date.now(), 1);
      if (!ENSAYO) db.prepare('INSERT INTO puente_email_envios (enviado, tipo, clave) VALUES (?, ?, ?)').run(Date.now(), 'mudanza', String(x.h));
    }
    await sleep(ENSAYO ? 20 : 1200);
  }
  return { estado: 'hecho', detalle: `${ok} emails mandados${sinEmail ? `, ${sinEmail} sin email confirmado` : ''}` };
}

// El servidor y el bot: los del puente, o preguntandole a Discord (la copia de prueba no se conecta al gateway)
let guildCache = null, botCache = null;
async function guild() {
  const g = getGuildId && getGuildId();
  if (g) return g;
  if (!guildCache) {
    const canal = canalCirculo();
    const c = canal ? await api('GET', `/channels/${canal}`) : null;
    if (c && c.guild_id) guildCache = c.guild_id;
    else warn('mudanza: no pude saber el servidor de Discord:', JSON.stringify(c && (c.__error || c)).slice(0, 120));
  }
  if (!guildCache && ENSAYO) guildCache = 'ensayo'; // la copia de prueba no llega a Discord
  if (!guildCache) throw new Error('todavía no hay conexión con Discord');
  return guildCache;
}
async function bot() {
  const b = getBotUserId && getBotUserId();
  if (b) return b;
  if (!botCache) { const yo = await api('GET', '/users/@me'); if (yo && yo.id) botCache = yo.id; }
  if (!botCache && ENSAYO) botCache = 'ensayo-bot';
  if (!botCache) throw new Error('no sé quién es el bot');
  return botCache;
}

// Los canales de texto del servidor de Discord (sin el de #pasate)
async function canalesDeTexto() {
  const g = await guild();
  // En el ensayo, sin Discord: los canales que conoce la base, sin permisos propios
  const todos = g === 'ensayo'
    ? db.prepare('SELECT discord_channel_id id, name FROM channels WHERE discord_channel_id IS NOT NULL AND is_dm = 0').all().map(c => ({ ...c, type: 0, permission_overwrites: [], rate_limit_per_user: 0 }))
    : await api('GET', `/guilds/${g}/channels`);
  if (!todos || todos.__error) throw new Error('Discord: ' + (todos && todos.__error));
  const pasate = cfg('canal_pasate');
  return todos.filter(c => TIPOS_TEXTO.has(c.type) && c.id !== pasate);
}
function guardarOriginal(c) {
  db.prepare('INSERT OR IGNORE INTO puente_mudanza_permisos (canal_id, nombre, overwrites, lento) VALUES (?, ?, ?, ?)')
    .run(c.id, c.name, JSON.stringify(c.permission_overwrites || []), c.rate_limit_per_user || 0);
}

async function lento(prender) {
  const canales = (await canalesDeTexto()).filter(c => c.type === 0 || c.type === 5);
  let n = 0, fallas = 0;
  for (const c of canales) {
    guardarOriginal(c);
    const orig = db.prepare('SELECT lento FROM puente_mudanza_permisos WHERE canal_id = ?').get(c.id);
    const valor = prender ? Math.max(60, (orig && orig.lento) || 0) : ((orig && orig.lento) || 0);
    if ((c.rate_limit_per_user || 0) === valor) continue;
    const r = await discord('PATCH', `/channels/${c.id}`, { rate_limit_per_user: valor, __reason: 'Mudanza a CV Chat' });
    if (r && r.__error) fallas++; else n++;
    await sleep(ENSAYO ? 0 : 400);
  }
  cfg('lento', prender ? '1' : '0');
  return { estado: fallas ? 'error' : 'hecho', detalle: `${n} canales ${prender ? 'con modo lento' : 'sin modo lento'}${fallas ? `, ${fallas} fallaron` : ''}` };
}

// Los permisos que el bot puede poner (Discord no deja negar lo que el bot mismo no tiene)
async function permisosDelBot() {
  const g = await guild(), yo = await bot();
  const [miembro, roles] = await Promise.all([api('GET', `/guilds/${g}/members/${yo}`), api('GET', `/guilds/${g}/roles`)]);
  if (!miembro || miembro.__error || !Array.isArray(roles)) throw new Error('no pude leer los permisos del bot');
  const mios = new Set([g, ...(miembro.roles || [])]);
  let p = 0n;
  for (const r of roles) if (mios.has(r.id)) p |= BigInt(r.permissions);
  return p;
}

// soloCanal: probarlo en un solo canal (sin #pasate ni insignias), para ver que anda antes del dia
async function soloLectura(soloCanal) {
  const g = await guild(), yo = await bot();
  const delBot = ENSAYO ? ESCRIBIR | P.VIEW | P.HISTORY : await permisosDelBot();
  const negar = ESCRIBIR & delBot;
  const canales = (await canalesDeTexto()).filter(c => !soloCanal || c.name === soloCanal);
  if (soloCanal && !canales.length) return { estado: 'error', detalle: 'no encontré #' + soloCanal };
  let n = 0, fallas = [];
  for (const c of canales) {
    guardarOriginal(c);
    let fallo = false;
    // El bot sigue pudiendo escribir (para los avisos); los webhooks del puente no dependen de esto
    const r0 = await discord('PUT', `/channels/${c.id}/permissions/${yo}`, { type: 1, allow: String(P.VIEW | P.SEND | P.HISTORY), deny: '0', __reason: 'Mudanza a CV Chat' });
    if (r0 && r0.__error) fallo = true;
    // @everyone: no escribir ni reaccionar
    const todos = (c.permission_overwrites || []).find(o => o.id === g) || { allow: '0', deny: '0' };
    const r1 = await discord('PUT', `/channels/${c.id}/permissions/${g}`, { type: 0, allow: String(BigInt(todos.allow) & ~negar), deny: String(BigInt(todos.deny) | negar), __reason: 'Mudanza a CV Chat: solo lectura' });
    if (r1 && r1.__error) fallo = true;
    // Los roles o personas que tenian permiso de escribir en ese canal, tambien dejan de tenerlo
    for (const o of c.permission_overwrites || []) {
      if (o.id === g || o.id === yo || !(BigInt(o.allow) & negar)) continue;
      const r2 = await discord('PUT', `/channels/${c.id}/permissions/${o.id}`, { type: o.type, allow: String(BigInt(o.allow) & ~negar), deny: o.deny, __reason: 'Mudanza a CV Chat: solo lectura' });
      if (r2 && r2.__error) fallo = true;
    }
    if (fallo) fallas.push(c.name); else { n++; db.prepare('UPDATE puente_mudanza_permisos SET cambiado = ? WHERE canal_id = ?').run(Date.now(), c.id); }
    // Un aviso fijado en los canales de texto (solo en Discord: los mensajes del bot no entran a CV Chat)
    if (!fallo && (c.type === 0 || c.type === 5)) {
      const m = await discord('POST', `/channels/${c.id}/messages`, { content: completar(T.canal), allowed_mentions: { parse: [] }, flags: 1 << 2 });
      if (m && m.id && !m.ensayo && !m.__error) { await api('PUT', `/channels/${c.id}/pins/${m.id}`); cfg('aviso_' + c.id, m.id); }
    }
    await sleep(ENSAYO ? 0 : 700);
  }
  if (soloCanal) { cfg('lento', cfg('lento') || '0'); cfg('solo_lectura', '1'); return { estado: fallas.length ? 'error' : 'hecho', detalle: `#${soloCanal} en solo lectura${fallas.length ? ' (falló)' : ''}` }; }
  await abrirPasate();
  cfg('solo_lectura', '1');
  congelarCopa();
  return { estado: fallas.length ? 'error' : 'hecho', detalle: `${n} canales en solo lectura${fallas.length ? '; fallaron: ' + fallas.join(', ') : ''}; #pasate-a-cv-chat abierto` };
}

// #pasate-a-cv-chat: el unico canal donde se puede escribir; el bot responde como pasarse
async function abrirPasate() {
  if (cfg('canal_pasate')) return;
  const g = await guild();
  const c = await discord('POST', `/guilds/${g}/channels`, {
    name: 'pasate-a-cv-chat', type: 0, position: 0, rate_limit_per_user: 30,
    topic: 'Este Discord quedó solo para leer. Pasate a CV Chat en un clic con tu Discord: ' + enlace(),
    permission_overwrites: [{ id: g, type: 0, allow: String(P.VIEW | P.SEND | P.HISTORY), deny: String(P.CREATE_PUBLIC_THREADS | P.CREATE_PRIVATE_THREADS) }],
    __reason: 'Mudanza a CV Chat',
  });
  if (!c || c.__error || !c.id) throw new Error('no pude crear #pasate-a-cv-chat: ' + (c && c.__error));
  cfg('canal_pasate', c.id); // antes de cualquier otra cosa: la sincronizacion no lo trae a CV Chat
  const m = await discord('POST', `/channels/${c.id}/messages`, { content: completar(T.pasate), allowed_mentions: { parse: [] }, flags: 1 << 2 });
  if (m && m.id && !m.ensayo && !m.__error) await api('PUT', `/channels/${c.id}/pins/${m.id}`);
}
// Un mensaje de Discord (puente.js, antes de ver si el canal esta puenteado): en #pasate, la respuesta
const respondidos = new Map();
async function enPasate(msg) {
  try {
    const canal = cfg('canal_pasate');
    if (!canal || !msg || msg.channel_id !== canal || !msg.author || msg.author.bot || msg.webhook_id) return;
    const k = String(msg.author.id), ahora = Date.now();
    if (respondidos.get(k) > ahora - 10 * 60e3) return;
    respondidos.set(k, ahora);
    await discord('POST', `/channels/${canal}/messages`, { content: completar(T.respuesta), message_reference: { message_id: msg.id, fail_if_not_exists: false }, allowed_mentions: { parse: [], replied_user: true }, flags: 1 << 2 });
  } catch (err) { warn('mudanza #pasate:', err.message); }
}
const canalExcluido = (id) => !!id && id === cfg('canal_pasate');

// Deshacer: los permisos y el modo lento como estaban, y los avisos fijados afuera
async function deshacer() {
  const g = await guild(), yo = await bot();
  const filas = db.prepare('SELECT * FROM puente_mudanza_permisos').all();
  let n = 0, fallas = [];
  for (const f of filas) {
    const c = ENSAYO ? { id: f.canal_id, name: f.nombre, permission_overwrites: [], rate_limit_per_user: 60 } : await api('GET', `/channels/${f.canal_id}`);
    if (!c || c.__error) { fallas.push(f.nombre); continue; }
    const orig = JSON.parse(f.overwrites || '[]');
    const ids = new Set(orig.map(o => o.id));
    let fallo = false;
    for (const o of orig) {
      const ahora = (c.permission_overwrites || []).find(x => x.id === o.id);
      if (ahora && ahora.allow === o.allow && ahora.deny === o.deny) continue;
      const r = await discord('PUT', `/channels/${c.id}/permissions/${o.id}`, { type: o.type, allow: o.allow, deny: o.deny, __reason: 'Mudanza a CV Chat: deshacer' });
      if (r && r.__error) fallo = true;
    }
    for (const o of c.permission_overwrites || []) {
      if (ids.has(o.id) || (o.id !== yo && o.id !== g)) continue; // solo lo que agrego la mudanza
      const r = await discord('DELETE', `/channels/${c.id}/permissions/${o.id}`);
      if (r && r.__error) fallo = true;
    }
    if ((c.rate_limit_per_user || 0) !== (f.lento || 0)) await discord('PATCH', `/channels/${c.id}`, { rate_limit_per_user: f.lento || 0, __reason: 'Mudanza a CV Chat: deshacer' });
    const aviso = cfg('aviso_' + c.id);
    if (aviso) { await discord('DELETE', `/channels/${c.id}/messages/${aviso}`); cfg('aviso_' + c.id, null); }
    if (fallo) fallas.push(f.nombre); else n++;
    await sleep(ENSAYO ? 0 : 500);
  }
  cfg('solo_lectura', '0'); cfg('lento', '0');
  if (!fallas.length) db.prepare('DELETE FROM puente_mudanza_permisos').run();
  // El paso vuelve a quedar pendiente (desde el panel se lo pospone o se lo vuelve a ejecutar)
  db.prepare("UPDATE puente_mudanza_pasos SET estado = 'pendiente', detalle = 'Deshecho' WHERE tipo IN ('solo_lectura', 'lento') AND estado != 'pendiente'").run();
  return { estado: fallas.length ? 'error' : 'hecho', detalle: `${n} canales como estaban${fallas.length ? '; fallaron: ' + fallas.join(', ') : ''}` };
}

// La tabla de la Copa para cualquiera con sesion (la seccion Juegos de la app la muestra)
function copaApi(req, res, h) {
  const user = h.sessionUser(req);
  if (!user) return h.json(res, 401, { error: 'sin sesion' });
  if (req.method !== 'GET') return h.json(res, 405, { error: 'metodo' });
  const todos = Date.now() >= INICIO_COPA ? copa(1e6) : [];
  const k = todos.findIndex(x => x.id === user.id);
  const campeones = db.prepare('SELECT user_id FROM puente_mudanza_campeones').all()
    .map(r => db.prepare('SELECT username, display_name FROM users WHERE id = ?').get(r.user_id)).filter(Boolean).map(u => u.display_name || u.username);
  return h.json(res, 200, {
    desde: INICIO_COPA, hasta: corteMs(), ahora: Date.now(),
    tabla: todos.slice(0, 10).map(x => ({ nombre: x.nombre, puntos: x.puntos, yo: x.id === user.id })),
    yo: k >= 0 ? { puesto: k + 1, puntos: todos[k].puntos } : null, campeones,
  });
}

function congelarCopa() {
  if (db.prepare('SELECT COUNT(*) n FROM puente_mudanza_campeones').get().n) return;
  const c = copa(10);
  if (!c.length) return;
  const max = c[0].puntos;
  for (const x of c.filter(x => x.puntos === max)) db.prepare('INSERT OR IGNORE INTO puente_mudanza_campeones (user_id, puntos) VALUES (?, ?)').run(x.id, x.puntos);
}

async function resumen() {
  const email = require('./email.js');
  const n = numeros();
  const admins = db.prepare('SELECT e.email FROM puente_emails e JOIN users u ON u.id = e.haven_user_id WHERE u.is_admin = 1 AND e.confirmado = 1').all();
  const parrafos = [
    `Lo escrito desde Discord en los últimos 7 días: ${n.discordPorcentaje}% (de ${n.mensajes7} mensajes).`,
    `Cuentas en CV Chat: ${n.cuentas}. Fundadores: ${n.fundadores}.`,
    `Siguen escribiendo en Discord: ${n.enDiscordConCuenta} con cuenta y ${n.enDiscordSinCuenta} sin cuenta.`,
    `Privados del bot mandados: ${n.privados}. Emails: ${n.emails}.`,
    n.copa.length ? 'Copa Mudanza: ' + n.copa.map((x, i) => `${i + 1}. ${x.nombre} (${x.puntos})`).join(', ') + '.' : 'Copa Mudanza: sin partidas.',
    'El detalle y los botones para pausar o deshacer están en la página Admin, pestaña Mudanza.',
  ];
  let ok = 0;
  for (const a of admins) {
    if (ENSAYO) { log('mudanza (ensayo): resumen a ' + a.email.replace(/^(.).*@/, '$1…@')); ok++; continue; }
    if (await email.sendMail(a.email, 'Mudanza a CV Chat: cómo va', 'Cómo va la mudanza', parrafos, ['Abrir el panel', (publicUrl || '') + '/app'], 'Te llega porque sos administrador de CV Chat.')) ok++;
  }
  return { estado: 'hecho', detalle: `Resumen mandado a ${ok} admins` };
}

// ── Panel (solo administradores) ────────────────────────────────────────────
//  GET  /puente/api/mudanza                 cronograma, numeros y estado
//  POST /puente/api/mudanza { accion, ... } pausar | reanudar | posponer {dias} | ejecutar {clave}
//                                           | texto {clave, texto} | deshacer | saltear {clave}
//                                           | probar {canal}: solo lectura en un canal, para probar
async function handle(req, res, p, u, h) {
  if (p === '/puente/api/copa') return copaApi(req, res, h);
  if (p !== '/puente/api/mudanza') return false;
  const user = h.sessionUser(req);
  if (!user) return h.json(res, 401, { error: 'sin sesion' });
  const adm = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(user.id);
  if (!adm || !adm.is_admin) return h.json(res, 403, { error: 'solo administradores' });
  const estado = () => ({
    estado: cfg('estado'), ensayo: ENSAYO, soloLectura: cfg('solo_lectura') === '1', lento: cfg('lento') === '1', corriendo,
    pasos: db.prepare('SELECT clave, cuando, tipo, nombre, texto, estado, hecho, detalle FROM puente_mudanza_pasos ORDER BY cuando').all(),
    numeros: numeros(),
  });
  if (req.method === 'GET') return h.json(res, 200, estado());
  if (req.method !== 'POST') return h.json(res, 405, { error: 'metodo' });
  const b = await h.readJson(req).catch(() => null);
  if (!b || typeof b.accion !== 'string') return h.json(res, 400, { error: 'falta la acción' });
  const quien = user.username || ('#' + user.id);
  if (b.accion === 'pausar') cfg('estado', 'pausado');
  else if (b.accion === 'reanudar') cfg('estado', 'activo');
  else if (b.accion === 'posponer') {
    // Corre todo lo que falta: los anuncios dicen fechas, asi que hay que revisar los textos
    const dias = Math.max(1, Math.min(60, Number(b.dias) || 7));
    db.prepare("UPDATE puente_mudanza_pasos SET cuando = cuando + ? WHERE estado = 'pendiente'").run(dias * DIA);
  } else if (b.accion === 'texto') {
    const pa = paso(String(b.clave || ''));
    if (!pa || pa.estado !== 'pendiente') return h.json(res, 400, { error: 'Solo se puede cambiar el texto de lo que todavía no salió.' });
    db.prepare('UPDATE puente_mudanza_pasos SET texto = ? WHERE clave = ?').run(String(b.texto || '').slice(0, 4000), pa.clave);
  } else if (b.accion === 'saltear') {
    const pa = paso(String(b.clave || ''));
    if (!pa || pa.estado !== 'pendiente') return h.json(res, 400, { error: 'Ese paso ya no está pendiente.' });
    marcar(pa.clave, 'salteado', 'Salteado por ' + quien);
  } else if (b.accion === 'ejecutar') {
    const pa = paso(String(b.clave || ''));
    if (!pa) return h.json(res, 404, { error: 'No existe ese paso.' });
    if (corriendo) return h.json(res, 409, { error: 'Hay otro paso en curso; probá en un rato.' });
    ejecutar(pa.clave).catch(() => {});
  } else if (b.accion === 'probar') {
    // Solo lectura en un solo canal, para probar (despues: deshacer)
    if (corriendo) return h.json(res, 409, { error: 'Hay un paso en curso; probá en un rato.' });
    corriendo = true;
    let r;
    try { r = await soloLectura(String(b.canal || 'prueba-puente')); } finally { corriendo = false; }
    log('mudanza: probar -> ' + r.detalle + ' (' + quien + ')');
    return h.json(res, 200, { ...estado(), prueba: r });
  } else if (b.accion === 'deshacer') {
    if (corriendo) return h.json(res, 409, { error: 'Hay un paso en curso; probá en un rato.' });
    corriendo = true;
    try { const r = await deshacer(); log('mudanza: deshacer -> ' + r.detalle + ' (' + quien + ')'); } finally { corriendo = false; }
  } else return h.json(res, 400, { error: 'acción desconocida' });
  log(`mudanza: ${b.accion}${b.clave ? ' ' + b.clave : ''} (${quien})`);
  numerosCache = null;
  return h.json(res, 200, estado());
}

// Para probar desde un script (sin el reloj): prepara el modulo con lo que necesita
function preparar(ctx) { ({ db, api, log, warn, appName, publicUrl, getGuildId, getBotUserId, postInHaven } = ctx); }

module.exports = { setup, handle, insignias, enPasate, canalExcluido, _test: { preparar, soloLectura, deshacer, completar, copa, numeros, actualizarFundadores, T, PLAN } };
