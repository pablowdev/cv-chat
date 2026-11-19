// La prueba de la app de Android en Google Play: quienes la usan, cuanto y en que, para la pestaña "App" del panel
// de administradores (web/aviso.js), y la medalla "📱 Tester de la app".
//
//  - Medalla: la app de Play abre /app?app=play; web/aviso.js, una vez por sesion, avisa "puente-tester-play" por
//    el socket. Queda para siempre; solo se gana hasta HASTA.
//  - Uso en la app: el contador de uso (uso.js) dice si el tiempo es de la app ({ a: 'play' | 'apk' }); aca se
//    guarda aparte, por dia, persona y seccion (puente_app_uso). Solo totales, como uso.js: nada de lo que se escribe.
//
//  GET  /puente/api/admin/app            (solo administradores) -> todo lo de la pestaña "App"
//  POST /puente/api/admin/app/invitado   { id } (solo administradores): CV Chat lo invita a ser tester (un aviso en su
//                                        campanita y al celular, con el enlace a /tester) y queda anotado

let db = null, warn = () => {};
const HASTA = Date.parse(process.env.PUENTE_TESTER_HASTA || '2027-01-01T03:00:00Z');
// La segunda vuelta de la prueba (Google pidio 14 dias mas desde el 18/11/2026, con 12 testers o mas)
const PRUEBA = { desde: '2026-11-18', hasta: '2026-12-02', minimo: 12 };
const AR = 3 * 3600e3;
const URL_TESTER = 'https://circulovicioso.club/tester';
const URL_PLAY = 'https://play.google.com/store/apps/details?id=club.circulovicioso.chat';
const diaAR = (ms) => new Date(ms - AR).toISOString().slice(0, 10);

function setup(ctx) {
  ({ db, warn } = ctx);
  db.exec(`
    CREATE TABLE IF NOT EXISTS puente_testers_play (user_id INTEGER PRIMARY KEY, desde INTEGER NOT NULL, ultimo INTEGER NOT NULL, veces INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS puente_app_uso (
      dia TEXT NOT NULL, user_id INTEGER NOT NULL, app TEXT NOT NULL, seccion TEXT NOT NULL, seg INTEGER NOT NULL DEFAULT 0, visitas INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (dia, user_id, app, seccion)
    ) WITHOUT ROWID;
    CREATE TABLE IF NOT EXISTS puente_invitados_tester (user_id INTEGER PRIMARY KEY, cuando INTEGER NOT NULL, por INTEGER);
    CREATE TABLE IF NOT EXISTS puente_pedidos_opinion (user_id INTEGER PRIMARY KEY, cuando INTEGER NOT NULL, por INTEGER);
  `);
  // por donde llego cada tester (la cookie cv_tester_de: la pagina /tester, el cartel del chat...)
  if (!db.prepare("SELECT 1 FROM pragma_table_info('puente_testers_play') WHERE name = 'origen'").get()) db.exec('ALTER TABLE puente_testers_play ADD COLUMN origen TEXT');
  ctx.io.on('connection', (socket) => {
    let hecho = false;
    socket.on('puente-tester-play', (d) => {
      if (hecho || !socket.user || socket.user.isGuest) return;
      hecho = true;
      const de = d && typeof d.de === 'string' && /^[a-z0-9-]{1,20}$/.test(d.de) ? d.de : null;
      try {
        const ahora = Date.now();
        const ya = db.prepare('SELECT 1 FROM puente_testers_play WHERE user_id = ?').get(socket.user.id);
        if (ya) db.prepare('UPDATE puente_testers_play SET ultimo = ?, veces = veces + 1, origen = COALESCE(origen, ?) WHERE user_id = ?').run(ahora, de, socket.user.id);
        else if (ahora < HASTA) db.prepare('INSERT INTO puente_testers_play (user_id, desde, ultimo, origen) VALUES (?, ?, ?, ?)').run(socket.user.id, ahora, ahora, de);
      } catch (err) { warn('tester play:', err.message); }
    });
  });
}

// uso.js: el tiempo que se uso desde la app (filas: [[seccion, segundos]])
function uso(dia, userId, app, filas, visitas) {
  if (!db || (app !== 'play' && app !== 'apk')) return;
  const poner = db.prepare(`INSERT INTO puente_app_uso (dia, user_id, app, seccion, seg, visitas) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(dia, user_id, app, seccion) DO UPDATE SET seg = seg + excluded.seg, visitas = visitas + excluded.visitas`);
  for (const [k, n] of filas) poner.run(dia, userId, app, k, n, 0);
  if (visitas) poner.run(dia, userId, app, filas.length ? filas[0][0] : 'otros', 0, visitas);
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

// ── La pestaña "App" ──
function nombreSeccion(k, canales, juegos) {
  if (k.startsWith('c:')) { const c = canales.get(Number(k.slice(2))); return c ? '#' + c : 'un canal'; }
  if (k.startsWith('j:')) { const id = k.slice(2); return juegos.get(id) || id; }
  return { dm: 'Mensajes directos', mercado: 'Marketplace', foro: 'Foro', miembros: 'Miembros', otros: 'Otros' }[k] || k;
}

function datos() {
  const ahora = Date.now(), hoy = diaAR(ahora);
  const hace = (n) => diaAR(ahora - n * 864e5);
  const persona = db.prepare('SELECT id, COALESCE(display_name, username) nombre, avatar FROM users WHERE id = ?');
  const canales = new Map(db.prepare('SELECT id, name FROM channels WHERE IFNULL(is_dm, 0) = 0').all().map((c) => [c.id, c.name]));
  const juegos = new Map();
  try { for (const f of require('./juegos-registro.js').lista()) { juegos.set(f.id, f.nombre); for (const e of f.estadisticas || []) if (e && e.id) juegos.set(e.id, e.nombre); } } catch { /* sin registro */ }

  // Los ultimos 14 dias: cuantos usaron la app de Play cada dia (y la del APK, para comparar)
  const dias = [];
  for (let i = 13; i >= 0; i--) dias.push(hace(i));
  const porDia = (app) => {
    const m = new Map(db.prepare(`SELECT dia, COUNT(DISTINCT user_id) n FROM puente_app_uso WHERE app = ? AND dia >= ? AND seg > 0 GROUP BY dia`).all(app, dias[0]).map((r) => [r.dia, r.n]));
    return dias.map((d) => m.get(d) || 0);
  };
  const serie = { dias, play: porDia('play'), apk: porDia('apk') };
  const distintos = (app, desde) => db.prepare('SELECT COUNT(DISTINCT user_id) n FROM puente_app_uso WHERE app = ? AND dia >= ? AND seg > 0').get(app, desde).n;
  const minutos = (app, desde) => Math.round((db.prepare('SELECT COALESCE(SUM(seg), 0) s FROM puente_app_uso WHERE app = ? AND dia >= ?').get(app, desde).s) / 60);

  // Cada tester: desde cuando, la ultima vez, cuantos dias la uso en los ultimos 14, cuanto y en que
  // Por donde llego: lo que trajo de la pagina o el cartel (cookie) o, si no, lo que le llego antes de abrir la app
  const cuando = (sql, id) => { try { const r = db.prepare(sql).get(id); return r ? r.c : null; } catch { return null; } };
  const llego = (t) => {
    if (t.origen) return t.origen;
    const inv = cuando('SELECT cuando c FROM puente_invitados_tester WHERE user_id = ?', t.user_id);
    if (inv && inv < t.desde) return 'aviso';
    const rec = cuando('SELECT enviado c FROM puente_recordatorio_play WHERE haven_user_id = ?', t.user_id);
    if (rec && rec < t.desde) return 'mail';
    const ip = cuando('SELECT enviado c FROM puente_invitaciones_play WHERE haven_user_id = ?', t.user_id);
    if (ip && ip < t.desde) return 'mail-nov';
    return null;
  };
  const testers = db.prepare('SELECT user_id, desde, ultimo, veces, origen FROM puente_testers_play ORDER BY ultimo DESC').all().map((t) => {
    const p = persona.get(t.user_id) || { id: t.user_id, nombre: '(cuenta borrada)', avatar: null };
    const d14 = db.prepare("SELECT COUNT(DISTINCT dia) n, COALESCE(SUM(seg), 0) s FROM puente_app_uso WHERE user_id = ? AND app = 'play' AND dia >= ?").get(t.user_id, dias[0]);
    const hoyS = db.prepare("SELECT COALESCE(SUM(seg), 0) s FROM puente_app_uso WHERE user_id = ? AND app = 'play' AND dia = ?").get(t.user_id, hoy).s;
    const ult = db.prepare("SELECT MAX(dia) d FROM puente_app_uso WHERE user_id = ? AND app = 'play' AND seg > 0").get(t.user_id).d;
    const top = db.prepare("SELECT seccion, SUM(seg) s FROM puente_app_uso WHERE user_id = ? AND app = 'play' AND dia >= ? GROUP BY seccion ORDER BY s DESC LIMIT 3").all(t.user_id, dias[0])
      .filter((r) => r.s > 0).map((r) => ({ que: nombreSeccion(r.seccion, canales, juegos), min: Math.round(r.s / 60) }));
    let opiniones = 0;
    try { opiniones = db.prepare('SELECT COUNT(*) n FROM puente_opiniones WHERE user_id = ?').get(t.user_id).n; } catch { /* sin opiniones */ }
    return { id: p.id, nombre: p.nombre, avatar: p.avatar, desde: t.desde, llego: llego(t), pedidoOpinion: cuando('SELECT cuando c FROM puente_pedidos_opinion WHERE user_id = ?', t.user_id), ultimo: Math.max(t.ultimo, ult ? Date.parse(ult + 'T12:00:00Z') : 0), ultimoDia: ult,
      dias14: d14.n, min14: Math.round(d14.s / 60), minHoy: Math.round(hoyS / 60), aperturas: t.veces, top, opiniones };
  });
  const ids = new Set(testers.map((t) => t.id));

  // A quienes invitar: la gente que mas uso CV Chat en la ultima semana y todavia no es tester
  const candidatos = db.prepare(`SELECT user_id, SUM(seg) s, COUNT(DISTINCT dia) d FROM puente_uso WHERE dia >= ? GROUP BY user_id ORDER BY s DESC LIMIT 80`).all(hace(6))
    .filter((r) => !ids.has(r.user_id)).map((r) => {
      const p = persona.get(r.user_id); const g = p && db.prepare('SELECT IFNULL(is_guest, 0) g, is_admin a FROM users WHERE id = ?').get(r.user_id);
      const inv = p && db.prepare('SELECT cuando FROM puente_invitados_tester WHERE user_id = ?').get(r.user_id);
      return p && !g.g ? { id: p.id, nombre: p.nombre, avatar: p.avatar, min7: Math.round(r.s / 60), dias7: r.d, invitado: inv ? inv.cuando : null, apk: !!db.prepare("SELECT 1 FROM puente_app_uso WHERE user_id = ? AND app = 'apk' AND dia >= ? LIMIT 1").get(r.user_id, hace(13)) } : null;
    }).filter(Boolean).slice(0, 25);

  let opiniones = [];
  try {
    opiniones = db.prepare('SELECT o.id, o.texto, o.puntaje, o.plataforma, o.version, o.cuando, o.user_id FROM puente_opiniones o ORDER BY o.id DESC LIMIT 30').all()
      .map((o) => ({ ...o, nombre: (persona.get(o.user_id) || {}).nombre || '(cuenta borrada)', esTester: ids.has(o.user_id) }));
  } catch { /* sin opiniones */ }

  const activosHoy = testers.filter((t) => t.ultimoDia === hoy).length;
  const transcurridos = Math.max(0, Math.min(14, Math.floor((ahora - Date.parse(PRUEBA.desde + 'T21:56:00Z')) / 864e5)));
  return {
    ahora, hoy, prueba: { ...PRUEBA, transcurridos },
    resumen: {
      testers: testers.length, activosHoy, activos7: distintos('play', hace(6)), activos14: distintos('play', dias[0]),
      minHoy: minutos('play', hoy), min7: minutos('play', hace(6)), apk7: distintos('apk', hace(6)),
      nuevos7: testers.filter((t) => t.desde >= ahora - 7 * 864e5).length,
    },
    serie, testers, candidatos, opiniones,
    origenes: testers.reduce((m, t) => { const k = t.llego || 'sin-dato'; m[k] = (m[k] || 0) + 1; return m; }, {}),
  };
}

async function handle(req, res, p, u, h) {
  if (p !== '/puente/api/admin/app' && p !== '/puente/api/admin/app/invitado' && p !== '/puente/api/admin/app/opinar') return false;
  const user = h.sessionUser(req);
  if (!user) return h.json(res, 401, { error: 'sin sesion' });
  const a = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(user.id);
  if (!a || !a.is_admin) return h.json(res, 403, { error: 'solo administradores' });
  // Pedirle a un tester que deje su opinion en Google Play (los comentarios privados de la prueba, que ve Google):
  // CV Chat le avisa en la campanita y al celular, con el enlace a la pagina de la app en Play
  if (p === '/puente/api/admin/app/opinar') {
    if (req.method !== 'POST') return h.json(res, 405, { error: 'metodo' });
    const b = (await h.readJson(req, 2000).catch(() => null)) || {};
    const id = Number(b.id);
    if (!(id > 0) || !db.prepare('SELECT 1 FROM puente_testers_play WHERE user_id = ?').get(id)) return h.json(res, 400, { error: 'No es tester.' });
    const ya = db.prepare('SELECT cuando FROM puente_pedidos_opinion WHERE user_id = ?').get(id);
    if (ya && Date.now() - ya.cuando < 20 * 3600e3) return h.json(res, 429, { error: 'Ya se lo pediste hoy.' });
    const titulo = 'CV Chat: ¿qué te parece la app? Contalo en Google Play';
    const texto = 'Abrí la app en Google Play, bajá hasta "Comentarios privados para el desarrollador" (o "Enviar comentarios") y contanos qué te gusta y qué mejorarías. ¡Nos ayuda un montón a publicarla!';
    try { require('./campana.js').registrar(id, { origen: 'chat', titulo, texto, url: URL_PLAY, clave: 'tester-op-' + id + '-' + diaAR(Date.now()) }); } catch (err) { warn('tester play: campanita:', err.message); }
    try { require('./avisos.js').avisarUsuario(id, { title: titulo, body: texto, url: URL_PLAY, tag: 'puente-tester-op' }); } catch (err) { warn('tester play: aviso:', err.message); }
    db.prepare('INSERT INTO puente_pedidos_opinion (user_id, cuando, por) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET cuando = excluded.cuando, por = excluded.por').run(id, Date.now(), user.id);
    return h.json(res, 200, { ok: true, cuando: Date.now() });
  }
  if (p === '/puente/api/admin/app/invitado') {
    if (req.method !== 'POST') return h.json(res, 405, { error: 'metodo' });
    const b = (await h.readJson(req, 2000).catch(() => null)) || {};
    const id = Number(b.id);
    if (!(id > 0) || !db.prepare('SELECT 1 FROM users WHERE id = ?').get(id)) return h.json(res, 400, { error: 'No existe esa cuenta.' });
    const ya = db.prepare('SELECT cuando FROM puente_invitados_tester WHERE user_id = ?').get(id);
    if (ya && Date.now() - ya.cuando < 20 * 3600e3) return h.json(res, 429, { error: 'Ya lo invitaste hoy.' });
    // El aviso es de CV Chat, no de quien toca el boton: en la campanita y al celular (o el cartelito, con la app abierta)
    const titulo = 'CV Chat: ¿tenés Android? Sé tester de la app';
    const texto = 'Bajate la app de CV Chat en Google Play antes que nadie y llevate la medalla 📱 Tester de la app. Es un botón y seguís los pasos.';
    try { require('./campana.js').registrar(id, { origen: 'chat', titulo, texto, url: URL_TESTER, clave: 'tester-inv-' + id + '-' + diaAR(Date.now()) }); } catch (err) { warn('tester play: campanita:', err.message); }
    try { require('./avisos.js').avisarUsuario(id, { title: titulo, body: texto, url: URL_TESTER, tag: 'puente-tester-inv' }); } catch (err) { warn('tester play: aviso:', err.message); }
    db.prepare('INSERT INTO puente_invitados_tester (user_id, cuando, por) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET cuando = excluded.cuando, por = excluded.por').run(id, Date.now(), user.id);
    return h.json(res, 200, { ok: true, cuando: Date.now() });
  }
  if (req.method !== 'GET') return h.json(res, 405, { error: 'metodo' });
  try { return h.json(res, 200, datos()); } catch (err) { warn('tester play: admin:', err.message); return h.json(res, 500, { error: 'No se pudo cargar.' }); }
}

module.exports = { setup, insignias, uso, handle, _test: { datos } };
