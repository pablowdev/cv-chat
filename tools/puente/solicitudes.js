// Solicitudes de mensajes (como en Instagram o X): la primera conversacion 1:1 con alguien con quien nunca
// hablaste no te llega a la bandeja ni te avisa al telefono; queda en "Solicitudes" hasta que la aceptes.
//
//  - Se decide con el primer mensaje de una conversacion nueva (Haven crea el DM con start-dm y recien
//    al escribir se sabe quien empezo). Pasa directo si quien escribe es del equipo, si el otro ya habia
//    escrito en esa conversacion, o si viene del Marketplace ("Escribirle" a quien publico: la publicacion
//    lo autoriza por unos minutos, POST /puente/api/dm/solicitudes/mercado).
//  - Mientras no se acepte, quien escribe puede mandar hasta MAX_MENSAJES mensajes, y como mucho tiene
//    MAX_PENDIENTES solicitudes sin aceptar en los ultimos 7 dias.
//  - Contestar es aceptar. Rechazar la oculta (quien escribio no se entera). Bloquear: no te puede escribir
//    mas, en ninguna conversacion (se deshace en Mi cuenta).
//  - Las conversaciones que ya existian al prender esto quedan aceptadas. Los grupos no cambian.
//  - El texto va cifrado: el servidor no lo lee. El aviso al telefono se corta en cargar.js (sinAviso) y la
//    app (aviso.js) no hace sonar ni cuenta como no leido lo que es solicitud.

const MAX_MENSAJES = 3;
const MAX_PENDIENTES = 5;
const VENCE_MS = 30 * 24 * 60 * 60 * 1000;
const MERCADO_MS = 15 * 60 * 1000;
const NIVEL_EQUIPO = 25; // como equipo.js: "Mod del canal" para arriba

let db, io, log, warn;
const permisosMercado = new Map(); // `${de}:${para}` -> { hasta, titulo }

function setup(ctx) {
  ({ db, io, log, warn } = ctx);
  db.exec(`
    CREATE TABLE IF NOT EXISTS puente_dm_solicitudes (
      code TEXT PRIMARY KEY,
      de INTEGER,
      para INTEGER,
      estado TEXT NOT NULL,          -- pendiente | aceptada | rechazada
      origen TEXT,                    -- existente | equipo | conocido | mercado | respuesta | aceptada
      detalle TEXT,                   -- (mercado) el titulo de la publicacion
      enviados INTEGER NOT NULL DEFAULT 0,
      creada INTEGER NOT NULL,
      actualizada INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_puente_dm_solicitudes_para ON puente_dm_solicitudes(para, estado);
    CREATE INDEX IF NOT EXISTS idx_puente_dm_solicitudes_de ON puente_dm_solicitudes(de, estado);
    CREATE TABLE IF NOT EXISTS puente_bloqueos (
      user_id INTEGER NOT NULL,       -- quien bloquea
      bloqueado_id INTEGER NOT NULL,
      desde INTEGER NOT NULL,
      PRIMARY KEY (user_id, bloqueado_id)
    );
  `);
  // Una sola vez: todo lo que ya existia queda aceptado
  const hecho = db.prepare("SELECT value FROM server_settings WHERE key = 'puente_solicitudes_inicio'").get();
  if (!hecho) {
    const ahora = Date.now();
    db.transaction(() => {
      db.prepare(`INSERT OR IGNORE INTO puente_dm_solicitudes (code, de, para, estado, origen, creada, actualizada)
        SELECT c.code, NULL, NULL, 'aceptada', 'existente', ?, ? FROM channels c
        WHERE c.is_dm = 1 AND COALESCE(c.is_group, 0) = 0 AND COALESCE(c.is_self_dm, 0) = 0`).run(ahora, ahora);
      db.prepare("INSERT OR REPLACE INTO server_settings (key, value) VALUES ('puente_solicitudes_inicio', ?)").run(String(ahora));
    })();
    log('solicitudes: las conversaciones que ya existian quedan aceptadas');
  }

  const canal = db.prepare('SELECT id, code, is_dm, is_group, is_self_dm FROM channels WHERE code = ?');
  const otro = db.prepare('SELECT user_id FROM channel_members WHERE channel_id = ? AND user_id != ?');
  const miembros = db.prepare('SELECT COUNT(*) n FROM channel_members WHERE channel_id = ?');
  const fila = db.prepare('SELECT * FROM puente_dm_solicitudes WHERE code = ?');
  const yaEscribio = db.prepare('SELECT 1 FROM messages WHERE channel_id = ? AND user_id = ? LIMIT 1');
  const bloqueo = db.prepare('SELECT 1 FROM puente_bloqueos WHERE user_id = ? AND bloqueado_id = ?');
  const pendientesDe = db.prepare(`SELECT COUNT(*) n FROM puente_dm_solicitudes WHERE de = ? AND estado != 'aceptada' AND creada > ?`);
  const insertar = db.prepare(`INSERT OR REPLACE INTO puente_dm_solicitudes (code, de, para, estado, origen, detalle, enviados, creada, actualizada)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const sumar = db.prepare('UPDATE puente_dm_solicitudes SET enviados = enviados + 1, actualizada = ? WHERE code = ?');

  io.on('connection', (socket) => {
    socket.use((packet, next) => {
      let error = null;
      try {
        const [evento, data] = packet;
        if (evento !== 'send-message' || !socket.user || !data || typeof data !== 'object' || typeof data.code !== 'string') return next();
        const c = canal.get(data.code.trim());
        if (!c || !c.is_dm || c.is_group || c.is_self_dm || miembros.get(c.id).n !== 2) return next();
        const yo = socket.user.id;
        const o = otro.get(c.id, yo);
        if (!o) return next();
        const el = o.user_id;
        if (bloqueo.get(el, yo)) error = 'No podés mandarle mensajes a esta persona.';
        else {
          const ahora = Date.now();
          const s = fila.get(c.code);
          if (!s) {
            // El primer mensaje de una conversacion nueva
            const merc = permisosMercado.get(`${yo}:${el}`);
            if (esEquipo(yo)) insertar.run(c.code, yo, el, 'aceptada', 'equipo', null, 0, ahora, ahora);
            else if (yaEscribio.get(c.id, el)) insertar.run(c.code, yo, el, 'aceptada', 'conocido', null, 0, ahora, ahora);
            else if (merc && merc.hasta > ahora) insertar.run(c.code, yo, el, 'aceptada', 'mercado', merc.titulo, 0, ahora, ahora);
            else if (pendientesDe.get(yo, ahora - 7 * 24 * 3600e3).n >= MAX_PENDIENTES) {
              error = `Tenés ${MAX_PENDIENTES} solicitudes de mensaje sin responder: esperá a que te contesten antes de escribirle a alguien nuevo.`;
            } else {
              insertar.run(c.code, yo, el, 'pendiente', null, null, 1, ahora, ahora);
              avisar(el, { tipo: 'nueva', code: c.code });
              avisar(yo, { tipo: 'enviada', code: c.code });
            }
          } else if (s.estado !== 'aceptada') {
            if (s.para === yo) {
              // Contestar es aceptar
              aceptar(s, 'respuesta');
            } else if (s.de === yo) {
              if (s.enviados >= MAX_MENSAJES) error = `Hasta que acepte tu solicitud podés mandar ${MAX_MENSAJES} mensajes. Esperá a que te conteste.`;
              else { sumar.run(ahora, c.code); if (s.estado === 'pendiente') avisar(el, { tipo: 'nueva', code: c.code }); }
            }
          }
        }
      } catch (err) { warn('solicitudes:', err.message); }
      if (!error) return next();
      const cb = packet[packet.length - 1];
      if (typeof cb === 'function') cb({ error });
      socket.emit('error-msg', error);
    });
  });
  log('solicitudes: listas');
}

function esEquipo(id) {
  try {
    const u = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(id);
    if (u && u.is_admin) return true;
    return !!db.prepare(`SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = ? AND COALESCE(ur.custom_level, r.level) >= ? LIMIT 1`).get(id, NIVEL_EQUIPO);
  } catch { return false; }
}

// Un aviso en vivo a todas las conexiones de una persona (aviso.js vuelve a pedir la lista)
function avisar(userId, datos) {
  try { for (const [, s] of io.sockets.sockets) if (s.user && s.user.id === userId) s.emit('puente-solicitud', datos); } catch { /* sin conexiones */ }
}

function aceptar(s, origen) {
  const ahora = Date.now();
  db.prepare("UPDATE puente_dm_solicitudes SET estado = 'aceptada', origen = ?, actualizada = ? WHERE code = ?").run(origen, ahora, s.code);
  // Por si la app de quien recibio la dejo silenciada en el servidor mientras era solicitud
  try { db.prepare('DELETE FROM user_channel_prefs WHERE user_id = ? AND channel_code = ?').run(s.para, s.code); } catch { /* sin preferencias */ }
  avisar(s.para, { tipo: 'aceptada', code: s.code });
  if (s.de) avisar(s.de, { tipo: 'aceptada', code: s.code });
}

// (cargar.js) A quienes no avisarles al telefono por un mensaje en este canal: quien recibe una solicitud
// sin aceptar (pendiente o rechazada) y quien bloqueo al que escribe.
function sinAviso(dbHaven, channelId, senderUserId) {
  const d = db || dbHaven;
  const fuera = [];
  if (!channelId) return fuera;
  const r = d.prepare(`SELECT s.para FROM puente_dm_solicitudes s JOIN channels c ON c.code = s.code
    WHERE c.id = ? AND s.estado != 'aceptada'`).get(channelId);
  if (r && r.para && r.para !== senderUserId) fuera.push(r.para);
  if (senderUserId) for (const b of d.prepare(`SELECT b.user_id FROM puente_bloqueos b JOIN channel_members m ON m.user_id = b.user_id
    WHERE m.channel_id = ? AND b.bloqueado_id = ?`).all(channelId, senderUserId)) fuera.push(b.user_id);
  return fuera;
}

function nombreDe(id) {
  const u = db.prepare('SELECT id, COALESCE(NULLIF(display_name, \'\'), username) nombre, avatar, created_at FROM users WHERE id = ?').get(id);
  return u || null;
}

// Lo que ayuda a decidir si aceptar, sin leer el mensaje: antiguedad de la cuenta, Discord o foro unido y
// dias que estuvo activo en el club. Las denuncias no se muestran: las ve solo el equipo.
function senales(id) {
  const u = nombreDe(id);
  if (!u) return null;
  const q = (sql, ...a) => { try { return db.prepare(sql).get(...a); } catch { return null; } };
  const creada = Date.parse(String(u.created_at || '').replace(' ', 'T') + 'Z');
  return {
    dias: Number.isFinite(creada) ? Math.max(0, Math.floor((Date.now() - creada) / 86400e3)) : null,
    discord: !!q('SELECT 1 FROM puente_vinculos WHERE haven_user_id = ?', id),
    foro: !!q('SELECT 1 FROM puente_foro WHERE haven_user_id = ?', id),
    activo: (q('SELECT COUNT(*) n FROM puente_monedas_activos WHERE user_id = ?', id) || { n: 0 }).n,
  };
}

async function handle(req, res, p, h) {
  const { json, readJson, sessionUser } = h;
  if (!p.startsWith('/puente/api/dm/solicitudes') && p !== '/puente/api/dm/bloquear') return false;
  const yo = sessionUser(req);
  if (!yo) return json(res, 401, { error: 'sin sesion' });

  if (p === '/puente/api/dm/solicitudes' && req.method === 'GET') {
    const desde = Date.now() - VENCE_MS;
    const recibidas = db.prepare(`SELECT s.code, s.de, s.estado, s.enviados, s.creada, s.actualizada FROM puente_dm_solicitudes s
      JOIN channels c ON c.code = s.code
      WHERE s.para = ? AND s.estado != 'aceptada'`).all(yo.id).map(s => {
      const u = nombreDe(s.de);
      return { code: s.code, estado: s.estado, vencida: s.estado === 'pendiente' && s.actualizada < desde, enviados: s.enviados, creada: s.creada,
        de: u ? { id: u.id, nombre: u.nombre, avatar: u.avatar || null } : null, senales: senales(s.de) };
    });
    const enviadas = db.prepare(`SELECT s.code, s.para FROM puente_dm_solicitudes s JOIN channels c ON c.code = s.code
      WHERE s.de = ? AND s.estado != 'aceptada'`).all(yo.id).map(s => ({ code: s.code, para: s.para, nombre: (nombreDe(s.para) || {}).nombre || '', max: MAX_MENSAJES }));
    const mercado = db.prepare(`SELECT s.code, s.detalle FROM puente_dm_solicitudes s WHERE s.para = ? AND s.origen = 'mercado'`).all(yo.id);
    const bloqueados = db.prepare('SELECT bloqueado_id id FROM puente_bloqueos WHERE user_id = ? ORDER BY desde DESC').all(yo.id)
      .map(b => { const u = nombreDe(b.id); return u ? { id: u.id, nombre: u.nombre } : null; }).filter(Boolean);
    return json(res, 200, { recibidas, enviadas, mercado, bloqueados, max: MAX_MENSAJES });
  }

  if (req.method !== 'POST') return json(res, 405, { error: 'metodo' });
  const body = await readJson(req).catch(() => null) || {};

  if (p === '/puente/api/dm/solicitudes/responder') {
    const code = typeof body.code === 'string' ? body.code : '';
    const s = /^[a-f0-9]{8}$/i.test(code) && db.prepare('SELECT * FROM puente_dm_solicitudes WHERE code = ?').get(code);
    if (!s || s.para !== yo.id) return json(res, 404, { error: 'solicitud' });
    if (body.accion === 'aceptar') aceptar(s, 'aceptada');
    else if (body.accion === 'rechazar' || body.accion === 'bloquear') {
      db.prepare("UPDATE puente_dm_solicitudes SET estado = 'rechazada', actualizada = ? WHERE code = ?").run(Date.now(), code);
      if (body.accion === 'bloquear' && s.de) db.prepare('INSERT OR IGNORE INTO puente_bloqueos (user_id, bloqueado_id, desde) VALUES (?, ?, ?)').run(yo.id, s.de, Date.now());
      avisar(yo.id, { tipo: 'rechazada', code });
    } else return json(res, 400, { error: 'accion' });
    return json(res, 200, { ok: true });
  }

  if (p === '/puente/api/dm/bloquear') {
    const id = Number(body.userId);
    if (!Number.isInteger(id) || id <= 0 || id === yo.id) return json(res, 400, { error: 'cuenta' });
    if (body.bloquear === false) db.prepare('DELETE FROM puente_bloqueos WHERE user_id = ? AND bloqueado_id = ?').run(yo.id, id);
    else {
      if (esEquipo(id)) return json(res, 400, { error: 'No se puede bloquear al equipo de CV Chat.' });
      if (!db.prepare('SELECT 1 FROM users WHERE id = ?').get(id)) return json(res, 404, { error: 'cuenta' });
      db.prepare('INSERT OR IGNORE INTO puente_bloqueos (user_id, bloqueado_id, desde) VALUES (?, ?, ?)').run(yo.id, id, Date.now());
    }
    avisar(yo.id, { tipo: 'bloqueos' });
    return json(res, 200, { ok: true });
  }

  // "Escribirle" desde una publicacion del Marketplace: la conversacion que se abra en los proximos minutos
  // con quien publico pasa directo (con el titulo de la publicacion)
  if (p === '/puente/api/dm/solicitudes/mercado') {
    const it = Number.isInteger(Number(body.id)) && db.prepare("SELECT id, user_id, titulo FROM puente_mercado WHERE id = ? AND COALESCE(oculta, 0) = 0").get(Number(body.id));
    if (!it || it.user_id === yo.id) return json(res, 404, { error: 'publicacion' });
    if (db.prepare('SELECT 1 FROM puente_bloqueos WHERE user_id = ? AND bloqueado_id = ?').get(it.user_id, yo.id)) return json(res, 200, { ok: true });
    permisosMercado.set(`${yo.id}:${it.user_id}`, { hasta: Date.now() + MERCADO_MS, titulo: String(it.titulo || '').slice(0, 120) });
    if (permisosMercado.size > 5000) for (const [k, v] of permisosMercado) if (v.hasta < Date.now()) permisosMercado.delete(k);
    return json(res, 200, { ok: true });
  }

  return json(res, 404, { error: 'ruta' });
}

module.exports = { setup, handle, sinAviso, MAX_MENSAJES };
