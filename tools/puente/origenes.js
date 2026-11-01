// De donde llega la gente (parte del puente): por que enlace o sitio entro cada persona que se creo la
// cuenta (X, Discord, WhatsApp, YouTube, Google, una invitacion...), para la pagina "Miembros" de los
// administradores (la columna "Miembro desde" y la pestaña "Estadisticas", con sus graficos). Las cuentas
// de antes de que se anotara, estimadas con lo que se sabe de cada una (estimados).
//
//  - web/origen.js, en la web, el foro (desde barra.js) y CV Chat, anota en una cookie del dominio
//    (cv_origen, 90 dias) por donde se llego: el sitio de donde venia (sin lo que va despues del "?"),
//    la pagina en la que entro, y la etiqueta del enlace si tiene (?de=whatsapp, ?utm_source=..., o
//    ?invita=<usuario>). Lo de afuera reemplaza a lo anterior; pasar de la web al chat no.
//  - Cada vez que eso cambia, suma una visita a esa fuente (puente_origen_visitas: solo cuantas por dia,
//    sin datos de nadie), y la cuenta nueva (de menos de 48 horas) lo reclama una sola vez
//    (puente_origenes). Las cuentas de antes quedan "sin dato".
//  - WhatsApp y Telegram casi nunca dicen de donde viene alguien (abren el enlace sin "sitio anterior"):
//    para esos estan los enlaces con etiqueta (?de=whatsapp), que se arman en "Estadisticas".
//
//  POST /puente/api/origen/visita     (sin sesion, desde las paginas propias) { r, l, d, c, m, i, a }
//  POST /puente/api/origen/reclamar   (sesion) { r, l, d, c, m, i, a }
//  GET  /puente/api/origen/admin?rango=30d|90d|1a|todo   (administradores)

let db, log, warn;
const DAY = 864e5;
const NUEVA_MS = 48 * 3600e3;

function setup(ctx) {
  ({ db, log, warn } = ctx);
  db.exec(`
    CREATE TABLE IF NOT EXISTS puente_origenes (
      user_id INTEGER PRIMARY KEY,
      fuente TEXT NOT NULL,
      detalle TEXT,
      ref TEXT,
      aterrizaje TEXT,
      campania TEXT,
      dispositivo TEXT,
      creado INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS puente_origen_visitas (
      dia TEXT NOT NULL,
      fuente TEXT NOT NULL,
      n INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (dia, fuente)
    );
  `);
}

// ── De donde: la fuente (para agrupar) y el detalle ──
const corto = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f]/g, '').trim().slice(0, n);
const ETIQUETAS = [
  [/^(x|twitter|tw|tweet)$/i, 'X'], [/^(wa|whatsapp|wpp|whats)$/i, 'WhatsApp'], [/^(ig|instagram|insta)$/i, 'Instagram'],
  [/^(yt|youtube)$/i, 'YouTube'], [/^(dc|discord)$/i, 'Discord'], [/^(tg|telegram)$/i, 'Telegram'], [/^(fb|facebook)$/i, 'Facebook'],
  [/^(tiktok|tt)$/i, 'TikTok'], [/^reddit$/i, 'Reddit'], [/^(google|gads)$/i, 'Google'], [/^(foro|forum)$/i, 'El foro'], [/^(web|sitio|pagina)$/i, 'La web'],
  [/^(mail|email|correo|newsletter)$/i, 'Email'],
];
const SITIOS = [
  [/(^|\.)(t\.co|twitter\.com|x\.com)$/, 'X'], [/(^|\.)(discord\.com|discordapp\.com|discord\.gg)$/, 'Discord'],
  [/(^|\.)(youtube\.com|youtu\.be)$/, 'YouTube'], [/(^|\.)(whatsapp\.com|wa\.me)$/, 'WhatsApp'], [/(^|\.)(instagram\.com)$/, 'Instagram'],
  [/(^|\.)(facebook\.com|fb\.com|fb\.me|messenger\.com)$/, 'Facebook'], [/(^|\.)(t\.me|telegram\.org|telegram\.me)$/, 'Telegram'],
  [/(^|\.)(reddit\.com)$/, 'Reddit'], [/(^|\.)(tiktok\.com)$/, 'TikTok'], [/(^|\.)(twitch\.tv)$/, 'Twitch'],
  [/(^|\.)google\.[a-z.]+$/, 'Google'], [/(^|\.)(bing\.com|duckduckgo\.com|search\.yahoo\.com|ecosia\.org|search\.brave\.com)$/, 'Otros buscadores'],
];
function dominio() { try { const c = require('./cuenta.js'); return c.on() ? c.dominio() : ''; } catch { return ''; } }
function clasificar(t, ua) {
  ua = String(ua || '');
  const etiqueta = corto(t.d, 40);
  if (t.i) return { fuente: 'Invitación', detalle: '@' + corto(t.i, 40) };
  if (etiqueta) {
    const e = ETIQUETAS.find(([re]) => re.test(etiqueta));
    return { fuente: e ? e[1] : etiqueta.charAt(0).toUpperCase() + etiqueta.slice(1), detalle: [corto(t.m, 30), corto(t.c, 40)].filter(Boolean).join(' · ') || null };
  }
  let host = '';
  try { host = new URL(t.r).hostname.replace(/^www\./, '').toLowerCase(); } catch { /* sin sitio anterior */ }
  if (host) {
    const dom = dominio();
    if (dom && (host === dom || host === 'www.' + dom)) return { fuente: 'La web', detalle: null };
    if (dom && host === 'foro.' + dom) return { fuente: 'El foro', detalle: null };
    if (dom && host.endsWith('.' + dom)) return { fuente: 'Directo', detalle: 'entró derecho a CV Chat' };
    const s = SITIOS.find(([re]) => re.test(host));
    return s ? { fuente: s[1], detalle: host } : { fuente: 'Otros sitios', detalle: host };
  }
  // Sin sitio anterior: lo que dice el navegador de las apps que abren enlaces adentro
  if (/Instagram/.test(ua)) return { fuente: 'Instagram', detalle: 'navegador de la app' };
  if (/FBAN|FBAV|FB_IAB|FBIOS/.test(ua)) return { fuente: 'Facebook', detalle: 'navegador de la app' };
  if (/musical_ly|BytedanceWebview|TikTok/i.test(ua)) return { fuente: 'TikTok', detalle: 'navegador de la app' };
  if (/Twitter|TwitterAndroid/.test(ua)) return { fuente: 'X', detalle: 'navegador de la app' };
  if (/Telegram/.test(ua)) return { fuente: 'Telegram', detalle: 'navegador de la app' };
  if (/WhatsApp/.test(ua)) return { fuente: 'WhatsApp', detalle: 'navegador de la app' };
  if (t.a === 'android') return { fuente: 'App de Android', detalle: 'se bajó la app' };
  if (/CVChat\//.test(ua)) return { fuente: 'App de PC', detalle: 'se bajó la app' };
  return { fuente: 'Directo', detalle: 'escribió la dirección o el enlace no dice de dónde viene (WhatsApp, Telegram...)' };
}
const dispositivo = (t, ua) => (t.a === 'android' ? 'App de Android' : /CVChat\//.test(ua) ? 'App de PC' : /Android|iPhone|iPad|iPod|Mobile/i.test(ua) ? 'Celular' : 'PC');
function limpio(b) {
  b = b && typeof b === 'object' ? b : {};
  let r = corto(b.r, 300);
  try { const u = new URL(r); r = u.origin + u.pathname; } catch { r = ''; }
  return { r, l: corto(b.l, 200), d: corto(b.d, 40), c: corto(b.c, 60), m: corto(b.m, 40), i: /^[\w.-]{1,40}$/.test(b.i || '') ? b.i : '', a: b.a === 'android' ? 'android' : '', t: Number(b.t) || 0 };
}
const diaAR = ms => new Date(ms - 3 * 3600e3).toISOString().slice(0, 10);

// Visitas: como mucho 30 por hora desde la misma direccion (un apuro no infla los numeros)
const porIp = new Map();
function demasiadas(ip) {
  const ahora = Date.now(), v = porIp.get(ip);
  if (!v || ahora - v.desde > 3600e3) { porIp.set(ip, { desde: ahora, n: 1 }); if (porIp.size > 5000) porIp.delete(porIp.keys().next().value); return false; }
  return ++v.n > 30;
}

async function leerTexto(req, max = 4000) {
  return new Promise(resolve => {
    let size = 0; const parts = [];
    req.on('data', c => { size += c.length; if (size > max) { req.destroy(); resolve(null); } else parts.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(parts).toString('utf8') || '{}')); } catch { resolve(null); } });
    req.on('error', () => resolve(null));
  });
}

async function handle(req, res, p, u, h) {
  if (!p.startsWith('/puente/api/origen/')) return false;
  const ua = req.headers['user-agent'] || '';

  if (p === '/puente/api/origen/visita' && req.method === 'POST') {
    // Lo manda el navegador (sendBeacon) desde la web, el foro o el chat
    const o = req.headers.origin;
    if (o && !h.allowedOrigin(o) && o !== (process.env.PUBLIC_URL || '').replace(/\/+$/, '')) return h.json(res, 403, { error: 'origen' });
    const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
    const t = limpio(await leerTexto(req));
    if (/bot|crawl|spider|preview|facebookexternalhit|WhatsApp\/|Discordbot|TelegramBot|Twitterbot|Slackbot/i.test(ua) || demasiadas(ip)) return h.json(res, 200, { ok: true });
    const { fuente } = clasificar(t, ua);
    db.prepare('INSERT INTO puente_origen_visitas (dia, fuente, n) VALUES (?, ?, 1) ON CONFLICT(dia, fuente) DO UPDATE SET n = n + 1').run(diaAR(Date.now()), fuente);
    return h.json(res, 200, { ok: true });
  }

  if (p === '/puente/api/origen/reclamar' && req.method === 'POST') {
    const user = h.sessionUser(req);
    if (!user) return h.json(res, 401, { error: 'sin sesion' });
    if (db.prepare('SELECT 1 FROM puente_origenes WHERE user_id = ?').get(user.id)) return h.json(res, 200, { ok: true, ya: true });
    const cu = db.prepare('SELECT created_at, is_guest FROM users WHERE id = ?').get(user.id);
    const creada = cu ? Date.parse(String(cu.created_at).replace(' ', 'T') + (/Z$/.test(cu.created_at) ? '' : 'Z')) : 0;
    if (!cu || cu.is_guest || !creada || Date.now() - creada > NUEVA_MS) return h.json(res, 200, { ok: true, vieja: true });
    const t = limpio(await leerTexto(req));
    // Solo lo que se anoto antes de crear la cuenta (lo de despues no dice por donde llego)
    if (!t.t || t.t > creada + 5 * 60e3) return h.json(res, 200, { ok: true, sinDato: true });
    const { fuente, detalle } = clasificar(t, ua);
    db.prepare(`INSERT OR IGNORE INTO puente_origenes (user_id, fuente, detalle, ref, aterrizaje, campania, dispositivo, creado)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(user.id, fuente, detalle, t.r || null, t.l || null, [t.d, t.m, t.c].filter(Boolean).join(' · ') || null, dispositivo(t, ua), Date.now());
    log(`origen: ${user.username} llegó desde ${fuente}${detalle ? ' (' + detalle + ')' : ''}`);
    return h.json(res, 200, { ok: true });
  }

  if (p === '/puente/api/origen/admin' && req.method === 'GET') {
    const user = h.sessionUser(req);
    if (!user) return h.json(res, 401, { error: 'sin sesion' });
    if (!(db.prepare('SELECT is_admin FROM users WHERE id = ?').get(user.id) || {}).is_admin) return h.json(res, 403, { error: 'solo administradores' });
    return h.json(res, 200, resumen(String(u.searchParams.get('rango') || '30d')));
  }
  return h.json(res, 404, { error: 'no existe' });
}

// Las cuentas sin nada anotado (las de antes): una estimacion con lo que se sabe de cada una. Quien
// entro con Discord o con "Entrar con el foro", o vinculo Discord al crearla, vino de ahi; quien vinculo
// Discord despues ya estaba ahi. La cuenta del foro no cuenta sola: la cuenta unica la crea al rato de
// registrarse. Sin ninguna pista, "Sin dato". Guardado 10 minutos
let estCache = null;
function estimados() {
  if (estCache && Date.now() - estCache.at < 10 * 60e3) return estCache.map;
  const out = new Map();
  const ms = s => (s ? Date.parse(String(s).replace(' ', 'T') + (/Z$/.test(String(s)) ? '' : 'Z')) : 0);
  const q = sql => { try { return db.prepare(sql).all(); } catch { return []; } };
  const email = new Map(q('SELECT haven_user_id, origen FROM puente_emails').map(r => [r.haven_user_id, r.origen]));
  const dc = new Map(q('SELECT haven_user_id, linked_at FROM puente_vinculos').map(r => [r.haven_user_id, ms(r.linked_at)]));
  const inv = new Map(q('SELECT i.invitado_id, u.username FROM puente_invitaciones i JOIN users u ON u.id = i.invita_id').map(r => [r.invitado_id, r.username]));
  for (const u of q("SELECT id, created_at FROM users WHERE username != 'discord-historial' AND COALESCE(is_guest, 0) = 0")) {
    const c = ms(u.created_at), cerca = t => !!t && Math.abs(t - c) < 30 * 60e3;
    let e = null;
    if (inv.has(u.id)) e = { fuente: 'Invitación', detalle: '@' + inv.get(u.id) };
    else if (email.get(u.id) === 'foro') e = { fuente: 'El foro', detalle: 'entró con su cuenta del foro' };
    else if (email.get(u.id) === 'discord' || cerca(dc.get(u.id))) e = { fuente: 'Discord', detalle: 'entró con su cuenta de Discord' };
    else if (dc.has(u.id)) e = { fuente: 'Discord', detalle: 'ya estaba en Discord (lo vinculó después)' };
    if (e) out.set(u.id, { ...e, estimado: true });
  }
  estCache = { at: Date.now(), map: out };
  return out;
}

// ── Para los administradores ──
const RANGOS = { '7d': 7, '4s': 28, '3m': 90, '1a': 365, '30d': 30, '90d': 90, todo: 3650 };
function resumen(rango) {
  const dias = RANGOS[rango] || 30;
  const desde = Date.now() - dias * DAY;
  const paso = dias <= 31 ? 'dia' : dias <= 120 ? 'semana' : 'mes';
  const clave = ms => {
    const d = diaAR(ms);
    if (paso === 'dia') return d;
    if (paso === 'mes') return d.slice(0, 7) + '-01';
    const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7)); return x.toISOString().slice(0, 10);
  };
  const etiquetas = [];
  for (let ms = desde; ms <= Date.now(); ms += DAY) { const k = clave(ms); if (etiquetas[etiquetas.length - 1] !== k) etiquetas.push(k); }
  const utc = s => Date.parse(String(s).replace(' ', 'T') + (/Z$/.test(String(s)) ? '' : 'Z'));
  const cuentas = db.prepare("SELECT u.id, u.username, COALESCE(u.display_name, u.username) nombre, u.avatar, u.created_at FROM users u WHERE u.username != 'discord-historial' AND COALESCE(u.is_guest, 0) = 0").all()
    .map(c => ({ ...c, ms: utc(c.created_at) })).filter(c => c.ms >= desde);
  // Lo anotado y, para las cuentas sin nada anotado (las de antes), la estimacion
  const anotado = new Map(db.prepare('SELECT * FROM puente_origenes').all().map(r => [r.user_id, r]));
  const est = estimados();
  const origen = new Map(cuentas.map(c => [c.id, anotado.get(c.id) || est.get(c.id)]).filter(([, o]) => o));
  const medidoDesde = (db.prepare('SELECT MIN(creado) m FROM puente_origenes').get() || {}).m || null;
  const fuentes = new Map(), estimadas = new Map(), detalles = new Map();
  for (const c of cuentas) {
    const o = origen.get(c.id);
    const f = o ? o.fuente : 'Sin dato';
    fuentes.set(f, (fuentes.get(f) || 0) + 1);
    if (o && o.estimado) estimadas.set(f, (estimadas.get(f) || 0) + 1);
    if (o && o.detalle) { const k = f + ' · ' + o.detalle; detalles.set(k, (detalles.get(k) || 0) + 1); }
  }
  const visitas = new Map();
  for (const r of db.prepare('SELECT fuente, SUM(n) n FROM puente_origen_visitas WHERE dia >= ? GROUP BY fuente').all(diaAR(desde))) visitas.set(r.fuente, r.n);
  // La serie: las 5 fuentes con mas cuentas, y el resto junto
  const orden = [...fuentes.entries()].filter(([f]) => f !== 'Sin dato').sort((a, b) => b[1] - a[1]).map(([f]) => f);
  const top = orden.slice(0, 5);
  const series = Object.fromEntries([...top, 'Otras', 'Sin dato'].map(f => [f, etiquetas.map(() => 0)]));
  for (const c of cuentas) {
    const o = origen.get(c.id), i = etiquetas.indexOf(clave(c.ms));
    if (i < 0) continue;
    const f = !o ? 'Sin dato' : top.includes(o.fuente) ? o.fuente : 'Otras';
    series[f][i]++;
  }
  const visitasSerie = new Map();
  for (const r of db.prepare('SELECT dia, SUM(n) n FROM puente_origen_visitas WHERE dia >= ? GROUP BY dia').all(diaAR(desde))) {
    const k = clave(Date.parse(r.dia + 'T12:00:00Z') + 3 * 3600e3);
    visitasSerie.set(k, (visitasSerie.get(k) || 0) + r.n);
  }
  const todas = new Set([...fuentes.keys(), ...visitas.keys()]);
  return {
    rango, paso, etiquetas, medidoDesde,
    cuentas: cuentas.length, conDato: cuentas.filter(c => anotado.has(c.id)).length, estimadas: cuentas.filter(c => !anotado.has(c.id) && est.has(c.id)).length,
    visitasTotal: [...visitas.values()].reduce((s, n) => s + n, 0),
    fuentes: [...todas].map(f => ({ fuente: f, cuentas: fuentes.get(f) || 0, estimadas: estimadas.get(f) || 0, visitas: visitas.get(f) || 0 }))
      .sort((a, b) => (a.fuente === 'Sin dato') - (b.fuente === 'Sin dato') || b.cuentas - a.cuentas || b.visitas - a.visitas),
    detalles: [...detalles.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, n]) => ({ detalle: k, cuentas: n })),
    serie: Object.entries(series).filter(([, v]) => v.some(Boolean)).map(([fuente, v]) => ({ fuente, v })),
    visitasSerie: etiquetas.map(k => visitasSerie.get(k) || 0),
    recientes: cuentas.filter(c => origen.has(c.id)).sort((a, b) => b.ms - a.ms).slice(0, 40).map(c => {
      const o = origen.get(c.id);
      return { id: c.id, nombre: c.nombre, usuario: c.username, avatar: c.avatar || null, desde: new Date(c.ms).toISOString(),
        fuente: o.fuente, detalle: o.detalle, aterrizaje: o.aterrizaje || null, campania: o.campania || null, dispositivo: o.dispositivo || null, estimado: !!o.estimado };
    }),
    dominio: dominio(),
  };
}

// Para la pagina "Miembros" (vincular.js): de donde llego cada cuenta (lo anotado, o si no la estimacion)
function deCadaUno() {
  const out = new Map();
  try { for (const [id, e] of estimados()) out.set(id, e); } catch { /* sin estimacion */ }
  try { for (const r of db.prepare('SELECT user_id, fuente, detalle FROM puente_origenes').all()) out.set(r.user_id, { fuente: r.fuente, detalle: r.detalle }); } catch { /* sin la tabla */ }
  return out;
}

module.exports = { setup, handle, deCadaUno, clasificar };
