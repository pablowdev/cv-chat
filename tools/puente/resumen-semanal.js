// "La semana en CV Chat": un mail los domingos, para la gente del club, con lo que paso en la semana. Lo arman
// reglas fijas con datos que ya hay (sin IA), y cada persona ve solo lo de los canales que puede ver:
//   - lo mas reaccionado de la semana en sus canales (actividad.js destacados)
//   - los temas del foro con movimiento (foro-lector.js recientes)
//   - los juegos: cuantas partidas se jugaron entre gente del club y quien gano mas
//   - lo ultimo del Marketplace (mercado.js ultimas) y cuantos se sumaron al club
//
// A quien: cuenta (no invitados) con el email confirmado, que entro a CV Chat en los ultimos 60 dias y que no se
// dio de baja. Cada mail trae "Dejar de recibir este mail" (y List-Unsubscribe, para el boton de Gmail): un toque
// y listo, sin entrar; en esa pagina se puede volver a recibirlo.
//
// Cuando: los domingos desde las 11 (Argentina). Respeta el cupo de los envios masivos (email.js hayLugarMasivo):
// si no alcanza, sigue el lunes; el martes ya no (seria viejo). Cada envio queda anotado (puente_resumen_envios),
// asi no se repite aunque el servidor se reinicie. PUENTE_RESUMEN=0 lo apaga.
//
//  GET|POST /puente/resumen/baja?u=ID&t=FIRMA          se da de baja (POST: el boton de baja del programa de mail)
//  POST     /puente/resumen/baja?u=ID&t=FIRMA&volver=1 vuelve a recibirlo

const crypto = require('crypto');
const AR = 3 * 3600e3;
const DIA = 864e5;
const PAUSA_MS = 1500;
const ACTIVOS_DIAS = 60;
let db = null, log = () => {}, warn = () => {}, publicUrl = '';
let corriendo = false;

function setup(ctx) {
  ({ db, log, warn } = ctx);
  publicUrl = String(ctx.publicUrl || process.env.PUBLIC_URL || '').replace(/\/+$/, '');
  db.exec(`
    CREATE TABLE IF NOT EXISTS puente_resumen_bajas (user_id INTEGER PRIMARY KEY, cuando INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS puente_resumen_envios (user_id INTEGER NOT NULL, semana TEXT NOT NULL, cuando INTEGER NOT NULL, PRIMARY KEY (user_id, semana));
    CREATE TABLE IF NOT EXISTS puente_resumen_config (clave TEXT PRIMARY KEY, valor TEXT NOT NULL);
  `);
  if (String(process.env.PUENTE_RESUMEN || '1').trim() === '0') return;
  setInterval(() => revisar().catch((err) => warn('resumen:', err.message)), 15 * 60e3).unref();
  setTimeout(() => revisar().catch((err) => warn('resumen:', err.message)), 4 * 60e3).unref();
}

const ahoraAR = () => new Date(Date.now() - AR);
const diaAR = (ms) => new Date(ms - AR).toISOString().slice(0, 10);
const fmt = (n) => Number(n || 0).toLocaleString('es-AR');
const corto = (t, n) => { t = String(t || '').trim(); return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t; };

// La firma de los enlaces de baja (una clave propia, guardada en la base la primera vez)
function clave() {
  let r = db.prepare("SELECT valor FROM puente_resumen_config WHERE clave = 'secreto'").get();
  if (!r) {
    db.prepare("INSERT OR IGNORE INTO puente_resumen_config (clave, valor) VALUES ('secreto', ?)").run(crypto.randomBytes(32).toString('hex'));
    r = db.prepare("SELECT valor FROM puente_resumen_config WHERE clave = 'secreto'").get();
  }
  return r.valor;
}
const firma = (uid) => crypto.createHmac('sha256', clave()).update('baja:' + uid).digest('hex').slice(0, 32);
const enlaceBaja = (uid) => `${publicUrl}/puente/resumen/baja?u=${uid}&t=${firma(uid)}`;
function firmaOk(uid, t) {
  const a = Buffer.from(firma(uid)), b = Buffer.from(String(t || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// La semana del envio: el domingo (de Argentina) de esta semana
function semanaDe(a) { const d = new Date(a); d.setUTCDate(d.getUTCDate() - d.getUTCDay()); return d.toISOString().slice(0, 10); }

function destinatarios(semana) {
  const desde = diaAR(Date.now() - ACTIVOS_DIAS * DIA);
  return db.prepare(`SELECT u.id, COALESCE(u.display_name, u.username) nombre, e.email FROM users u
    JOIN puente_emails e ON e.haven_user_id = u.id AND e.confirmado = 1
    WHERE IFNULL(u.is_guest, 0) = 0 AND u.username != 'discord-historial'
      AND EXISTS (SELECT 1 FROM puente_activos a WHERE a.user_id = u.id AND a.dia >= ?)
      AND NOT EXISTS (SELECT 1 FROM puente_resumen_bajas b WHERE b.user_id = u.id)
      AND NOT EXISTS (SELECT 1 FROM puente_resumen_envios s WHERE s.user_id = u.id AND s.semana = ?)
    ORDER BY u.id`).all(desde, semana);
}

// Lo comun a todos (los juegos, el foro, el Marketplace, los nuevos): se arma una vez por tanda
async function comun() {
  const out = { foro: [], mercado: [], juegos: null, nuevos: 0 };
  const desde = Date.now() - 7 * DIA;
  try { out.foro = (await require('./foro-lector.js').recientes(3)).slice(0, 3); } catch (err) { warn('resumen: foro:', err.message); }
  try { out.mercado = require('./mercado.js').ultimas(3); } catch (err) { warn('resumen: mercado:', err.message); }
  try {
    const nombre = (id) => (db.prepare('SELECT COALESCE(display_name, username) n, IFNULL(is_guest, 0) g FROM users WHERE id = ?').get(id) || {});
    let partidas = 0;
    const gana = new Map(), porJuego = new Map();
    for (const { ficha, chat } of require('./juegos-registro.js').conChat()) {
      if (!chat.partidas) continue;
      let filas = [];
      try { filas = chat.partidas.leer() || []; } catch { continue; }
      for (const p of filas) {
        if (!p || !(p.fin >= desde) || !Array.isArray(p.humanos) || new Set(p.humanos).size < 2) continue; // solo entre gente
        partidas++;
        porJuego.set(ficha.nombre, (porJuego.get(ficha.nombre) || 0) + 1);
        if (p.ganador > 0) gana.set(p.ganador, (gana.get(p.ganador) || 0) + 1);
      }
    }
    const top = [...gana].map(([id, n]) => ({ n, u: nombre(id) })).filter((x) => x.u.n && !x.u.g).sort((a, b) => b.n - a.n).slice(0, 3);
    const juego = [...porJuego].sort((a, b) => b[1] - a[1])[0];
    if (partidas) out.juegos = { partidas, top: top.map((x) => ({ nombre: x.u.n, n: x.n })), juego: juego ? juego[0] : null };
  } catch (err) { warn('resumen: juegos:', err.message); }
  try {
    out.nuevos = db.prepare("SELECT COUNT(*) n FROM users WHERE IFNULL(is_guest, 0) = 0 AND username != 'discord-historial' AND created_at >= ?")
      .get(new Date(desde).toISOString().slice(0, 19).replace('T', ' ')).n;
  } catch { /* sin el dato */ }
  return out;
}

// Los parrafos del mail de una persona (null si no hay nada que contar)
function armar(u, c) {
  const p = [`Hola ${u.nombre}: esto es lo que pasó en el club en los últimos 7 días.`];
  let algo = false;
  let dest = [];
  try {
    const d = require('./actividad.js').destacados(u.id);
    dest = d.canales.flatMap((ch) => ch.mensajes.map((m) => ({ ...m, canal: ch.canal }))).filter((m) => m.texto).sort((a, b) => b.n - a.n).slice(0, 4);
  } catch (err) { warn('resumen: destacados:', err.message); }
  if (dest.length) {
    algo = true;
    p.push({ titulo: '🔥 Lo que más gustó' });
    for (const m of dest) {
      // (los enlaces, por su sitio: "un enlace de instagram.com" en vez de la direccion entera)
      const host = (x) => { try { return new URL(x).hostname.replace(/^www\./, ''); } catch { return 'la web'; } };
      const solo = /^https?:\/\/\S+$/.exec(m.texto.trim());
      const texto = solo ? `un enlace de ${host(solo[0])}` : `"${corto(m.texto.replace(/https?:\/\/\S+/g, (x) => host(x)), 110)}"`;
      p.push({ texto: `#${m.canal} · ${m.autor.nombre}: ${texto} (${m.n} ${m.n === 1 ? 'reacción' : 'reacciones'})`, url: m.url });
    }
  }
  if (c.foro.length) {
    algo = true;
    p.push({ titulo: '💬 En el foro' });
    for (const t of c.foro) p.push({ texto: `${corto(t.tema, 90)}${t.respuestas ? ` (${fmt(t.respuestas)} ${t.respuestas === 1 ? 'respuesta' : 'respuestas'})` : ''}`, url: t.url });
  }
  if (c.juegos) {
    algo = true;
    p.push({ titulo: '🎮 En los Juegos' });
    let t = `Se jugaron ${fmt(c.juegos.partidas)} ${c.juegos.partidas === 1 ? 'partida' : 'partidas'} entre gente del club` + (c.juegos.juego ? `; la más jugada fue ${c.juegos.juego}` : '') + '.';
    if (c.juegos.top.length) t += ' ' + (c.juegos.top.length === 1 ? `La que más ganó: ${c.juegos.top[0].nombre} (${c.juegos.top[0].n}).` : `Los que más ganaron: ${c.juegos.top.map((x) => `${x.nombre} (${x.n})`).join(', ')}.`);
    p.push(t);
    p.push({ texto: 'Armá una mesa o sumate a una →', url: `${publicUrl}/app?juegos` });
  }
  if (c.mercado.length) {
    algo = true;
    p.push({ titulo: '🛒 Nuevo en el Marketplace' });
    for (const m of c.mercado) p.push({ texto: `${corto(m.titulo, 70)}${m.precio ? ' · ' + m.precio : ''}${m.zona ? ' · ' + m.zona : ''}`, url: m.url });
  }
  if (c.nuevos > 1) { p.push(`Y esta semana se sumaron ${fmt(c.nuevos)} personas nuevas al club.`); }
  return algo ? p : null;
}

async function mandarA(u, c) {
  const email = require('./email.js');
  const p = armar(u, c);
  if (!p) return 'nada';
  const ok = await email.sendMail(u.email, 'Lo que pasó esta semana en CV Chat', 'La semana en CV Chat', p,
    ['Entrar a CV Chat', `${publicUrl}/app`], 'Te llega porque tenés cuenta en CV Chat.', { baja: enlaceBaja(u.id) });
  return ok ? 'ok' : 'falla';
}

async function revisar() {
  if (corriendo || !db) return;
  const email = require('./email.js');
  if (!email.on()) return;
  const a = ahoraAR();
  const dow = a.getUTCDay(), hora = a.getUTCHours();
  if (!((dow === 0 && hora >= 11) || dow === 1)) return; // domingo desde las 11, o lo que falto el lunes
  const semana = semanaDe(a);
  corriendo = true;
  try {
    const faltan = destinatarios(semana);
    if (!faltan.length) return;
    const c = await comun();
    let ok = 0, fallas = 0;
    for (const u of faltan) {
      if (!email.hayLugarMasivo()) { log(`resumen: ${ok} mandados; el resto sigue despues (cupo del dia)`); break; }
      const r = await mandarA(u, c);
      if (r === 'falla') { if (++fallas >= 3) { warn('resumen: tres fallas seguidas, se corta por ahora'); break; } continue; }
      fallas = 0;
      db.prepare('INSERT OR IGNORE INTO puente_resumen_envios (user_id, semana, cuando) VALUES (?, ?, ?)').run(u.id, semana, Date.now());
      if (r === 'ok') {
        db.prepare('INSERT INTO puente_email_envios (enviado, tipo, clave) VALUES (?, ?, ?)').run(Date.now(), 'resumen', String(u.id));
        ok++;
        await new Promise((res) => setTimeout(res, PAUSA_MS));
      }
    }
    if (ok) log(`resumen: ${ok} mail${ok === 1 ? '' : 's'} de "La semana en CV Chat" (${semana})`);
    db.prepare('DELETE FROM puente_resumen_envios WHERE semana < ?').run(diaAR(Date.now() - 60 * DIA));
  } finally { corriendo = false; }
}

// La pagina de la baja (sin sesion: la firma del enlace dice de quien es)
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function pagina(titulo, texto, form) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>${esc(titulo)} · CV Chat</title><style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#1e1f22;color:#dbdee1;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;padding:16px;box-sizing:border-box}
.c{max-width:26rem;width:100%;background:#2b2d31;border-radius:12px;padding:28px 24px;text-align:center}h1{font-size:1.35rem;color:#f2f3f5;margin:0 0 .75rem}p{line-height:1.45;margin:0 0 1.25rem}
button,a.b{display:inline-block;border:0;border-radius:8px;padding:.75rem 1.25rem;font-size:1rem;font-weight:600;cursor:pointer;text-decoration:none;margin:.25rem}
button{background:#4e5058;color:#fff}a.b{background:#5865f2;color:#fff}</style></head><body><div class="c"><h1>${esc(titulo)}</h1><p>${esc(texto)}</p>${form || ''}<a class="b" href="/app">Ir a CV Chat</a></div></body></html>`;
}

async function handle(req, res, p, u, h) {
  if (p !== '/puente/resumen/baja') return false;
  const uid = Number(u.searchParams.get('u')), t = u.searchParams.get('t');
  const html = (code, body) => { res.writeHead(code, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' }); res.end(body); return true; };
  if (!(uid > 0) || !firmaOk(uid, t)) return html(400, pagina('El enlace no sirve', 'Puede estar cortado. Probá tocándolo de nuevo desde el mail.'));
  if (req.method !== 'GET' && req.method !== 'POST') return html(405, pagina('No se pudo', 'Probá de nuevo desde el mail.'));
  const accion = `/puente/resumen/baja?u=${uid}&t=${esc(t)}`;
  if (req.method === 'POST' && u.searchParams.get('volver') === '1') {
    db.prepare('DELETE FROM puente_resumen_bajas WHERE user_id = ?').run(uid);
    log(`resumen: #${uid} lo vuelve a recibir`);
    return html(200, pagina('Listo, lo vas a volver a recibir', 'Te llega los domingos con lo que pasó en el club.', `<form method="post" action="${accion}"><button type="submit">Dejar de recibirlo</button></form>`));
  }
  db.prepare('INSERT OR IGNORE INTO puente_resumen_bajas (user_id, cuando) VALUES (?, ?)').run(uid, Date.now());
  log(`resumen: #${uid} se dio de baja`);
  return html(200, pagina('Listo, no te lo mandamos más', 'Ya no vas a recibir "La semana en CV Chat". Los mails de tu cuenta (códigos para entrar, recuperar la contraseña) te siguen llegando.',
    `<form method="post" action="${accion}&volver=1"><button type="submit">Volver a recibirlo</button></form>`));
}

module.exports = { setup, handle, _test: { armar, comun, destinatarios, mandarA, enlaceBaja, firmaOk, semanaDe } };
