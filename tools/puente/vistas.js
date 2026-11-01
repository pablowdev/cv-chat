// Vistas previas de los enlaces (parte del puente): la imagen (og:image, 1200x630) que se ve al compartir
// un enlace en WhatsApp, Telegram, X, Discord o CV Chat, con un pedacito de lo que hay del otro lado.
//
//  - Un canal o un mensaje de CV Chat (/app?channel=<codigo>[&message=<id>]): los ultimos mensajes del canal,
//    o los que rodean al mensaje, con nombres y fotos, como se ven en la app. Solo los canales que ve
//    cualquiera con cuenta (sin candadito, accesos.js): nunca mensajes directos, canales cerrados ni +18.
//    Los demas enlaces de la app siguen con el logo (vincular.js, shareTags).
//  - Un tema, un foro o la portada del foro: el titulo, quien lo escribio y el principio del texto, con lo
//    que da el lector del foro (solo lo publico). El foro pide la imagen desde su cabecera (deploy/foro/estilo,
//    ajustes.php: un gancho de plantilla en header_head).
//  - La web: cada pagina (su titulo y su descripcion) y la wiki: cada entrada y cada categoria tienen su
//    vista previa. Las paginas de la wiki son una sola (wiki.html, que llena web/wiki.js): el Caddy principal
//    las manda aca (/puente/vista/pagina/wiki/...) y se devuelve wiki.html con el titulo y la imagen de esa
//    entrada; si el chat no contesta, Caddy da wiki.html tal cual.
//
//  GET /puente/vista/chat.jpg?c=<codigo>[&m=<id>]
//  GET /puente/vista/foro.jpg?u=<direccion del foro, sin el dominio>
//  GET /puente/vista/web.jpg?p=<pagina>          (inicio, wiki, full-fat-search, descargar...)
//  GET /puente/vista/wiki.jpg?s=<entrada> | ?cat=<categoria>
//  GET /puente/vista/pagina/wiki/<entrada>, /puente/vista/pagina/wiki-categorias/<categoria>
//
// Sin sesion: lo que muestran ya es publico (o, en el chat, lo eligio quien comparte el enlace). Si algo
// falla, la imagen es el logo.

const fs = require('fs');
const path = require('path');

let db, log, warn, publicUrl = '', sharp = null;
const W = 1200, H = 630;
const ROSA = '#ee2d6f', FONDO = '#211c1f', FONDO_2 = '#2b2528', BLANCO = '#f2eef0', GRIS = '#a89ca2', TEXTO = '#ddd5d9';
const UPLOADS = '/data/uploads';

function setup(ctx) {
  ({ db, log, warn, publicUrl } = ctx);
  publicUrl = String(publicUrl || '').replace(/\/+$/, '');
  try { sharp = require('./vendor/node_modules/sharp'); } catch { warn('vistas: sin sharp, las vistas previas van con el logo'); }
}
const on = () => !!sharp;
const DOMINIO = () => { try { const c = require('./cuenta.js'); return c.on() ? c.dominio() : ''; } catch { return ''; } };
const FORO = () => String(process.env.FORO_URL || '').replace(/\/+$/, '');

// ── Dibujo ──
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// Los emojis de color no estan en la letra del servidor (saldrian como cuadraditos): afuera
const sinEmojis = s => String(s).replace(/\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic}|[\u{1F3FB}-\u{1F3FF}])*/gu, '')
  .replace(/[️‍\u{1F3FB}-\u{1F3FF}\u{1F1E6}-\u{1F1FF}]/gu, '');
const corto = (s, n) => { s = String(s); return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s; };

// Un texto con renglones (Pango): hasta "renglones" renglones del ancho dado; si no entra, se acorta con "…"
async function texto(str, { size = 24, color = TEXTO, bold = false, mono = false, width = 1000, renglones = 3 } = {}) {
  str = sinEmojis(str).replace(/\s+/g, ' ').trim();
  if (!str) return null;
  const alto = renglones * size * 1.25 + size * 0.5;
  let n = Math.ceil(renglones * width / (size * 0.52));
  for (let i = 0; i < 6; i++) {
    const t = str.length > n ? str.slice(0, n - 1).trimEnd() + '…' : str;
    const { data, info } = await sharp({ text: { text: `<span foreground="${color}">${esc(t)}</span>`, font: `${mono ? 'DejaVu Sans Mono' : 'DejaVu Sans'}${bold ? ' Bold' : ''} ${size}`,
      width, rgba: true, dpi: 72, wrap: 'word-char' } }).png().toBuffer({ resolveWithObject: true });
    if (info.height <= alto || t.length < 8) return { buf: data, w: info.width, h: info.height };
    n = Math.floor(Math.min(t.length, n) * 0.85);
  }
  return null;
}
const svg = (w, h, cuerpo) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${cuerpo}</svg>`);
// Foto redonda (o la inicial sobre un color, si no hay foto)
async function avatar(archivo, nombre, s) {
  if (archivo) {
    try {
      return await sharp(archivo).rotate().resize(s, s, { fit: 'cover' }).composite([{ input: svg(s, s, `<circle cx="${s / 2}" cy="${s / 2}" r="${s / 2}"/>`), blend: 'dest-in' }]).png().toBuffer();
    } catch { /* foto rota: la inicial */ }
  }
  const colores = ['#ee2d6f', '#5865f2', '#3ba55d', '#faa61a', '#9b59b6', '#1abc9c', '#e67e22'];
  let k = 0; for (const c of String(nombre)) k = (k * 31 + c.codePointAt(0)) >>> 0;
  const ini = (sinEmojis(nombre).trim()[0] || '?').toUpperCase();
  return sharp(svg(s, s, `<circle cx="${s / 2}" cy="${s / 2}" r="${s / 2}" fill="${colores[k % colores.length]}"/>
    <text x="${s / 2}" y="${s / 2 + s * 0.17}" text-anchor="middle" font-family="DejaVu Sans" font-weight="bold" font-size="${s * 0.46}" fill="#fff">${esc(ini)}</text>`)).png().toBuffer();
}
// Un archivo de /uploads/... (solo los de aca)
function subido(rel) {
  const m = /^\/uploads\/((?:[a-z-]+\/)?[A-Za-z0-9._-]+)$/.exec(String(rel || ''));
  if (!m || m[1].includes('..')) return null;
  const f = path.join(UPLOADS, m[1]);
  return fs.existsSync(f) ? f : null;
}
// La cabecera: el titulo a la izquierda y de donde es a la derecha
function cabecera(titulo, lugar) {
  return `<rect width="${W}" height="${H}" fill="${FONDO}"/>
    <text x="40" y="56" font-family="DejaVu Sans" font-weight="bold" font-size="38" fill="${BLANCO}">${esc(corto(sinEmojis(titulo).trim(), 34))}</text>
    <rect x="40" y="70" width="64" height="4" fill="${ROSA}"/>
    <text x="${W - 40}" y="54" text-anchor="end" font-family="DejaVu Sans Mono" font-size="22" fill="${GRIS}">${esc(lugar)}</text>`;
}
const jpg = (base, capas) => sharp(base).composite(capas).jpeg({ quality: 84, mozjpeg: true }).toBuffer();

// Una tarjeta: rotulo, titulo grande, una linea, el texto y, si hay, una foto a la derecha o una lista
async function tarjeta({ lugar, rotulo, titulo, linea, cuerpo, foto, lista, autorFoto, autor }) {
  const capas = [];
  let ancho = W - 80;
  if (foto) {
    try {
      capas.push({ input: await sharp(foto).rotate().resize(400, 470, { fit: 'cover' }).toBuffer(), left: W - 440, top: 120 });
      ancho = W - 80 - 440;
    } catch { /* sin la foto */ }
  }
  let y = 120;
  if (rotulo) { const t = await texto(rotulo.toUpperCase(), { size: 20, color: ROSA, mono: true, width: ancho, renglones: 1 }); if (t) { capas.push({ input: t.buf, left: 40, top: y }); y += t.h + 14; } }
  const tt = await texto(titulo, { size: 46, color: BLANCO, bold: true, width: ancho, renglones: 2 });
  if (tt) { capas.push({ input: tt.buf, left: 40, top: y }); y += tt.h + 16; }
  if (!autor && !linea) y += 8;
  if (autor) {
    let x = 40;
    if (autorFoto !== undefined) { capas.push({ input: await avatar(autorFoto, autor, 40), left: 40, top: y - 4 }); x = 92; }
    const t = await texto(linea ? `${autor} · ${linea}` : autor, { size: 22, color: GRIS, width: ancho - (x - 40), renglones: 1 });
    if (t) { capas.push({ input: t.buf, left: x, top: y + 4 }); y += Math.max(t.h, 36) + 22; }
  } else if (linea) {
    const t = await texto(linea, { size: 22, color: GRIS, width: ancho, renglones: 1 });
    if (t) { capas.push({ input: t.buf, left: 40, top: y }); y += t.h + 22; }
  }
  const resto = Math.floor((H - 40 - y) / (26 * 1.25 + 2));
  if (lista && lista.length) {
    for (const item of lista) {
      if (y > H - 80) break;
      const t = await texto(item, { size: 26, color: TEXTO, width: ancho - 30, renglones: 1 });
      if (!t) continue;
      capas.push({ input: svg(12, 12, `<rect width="12" height="12" fill="${ROSA}"/>`), left: 40, top: y + 10 }, { input: t.buf, left: 70, top: y });
      y += t.h + 14;
    }
  } else if (cuerpo && resto > 0) {
    const t = await texto(cuerpo, { size: 26, color: TEXTO, width: ancho, renglones: Math.min(resto, 7) });
    if (t) capas.push({ input: t.buf, left: 40, top: y });
  }
  return jpg(svg(W, H, cabecera(lugar.titulo, lugar.sitio)), capas);
}

// ── CV Chat ──
// Los canales que ve cualquiera con cuenta (sin candadito): los unicos que se muestran afuera
function canalPublico(code) {
  if (!/^[a-f0-9]{8}$/i.test(String(code || ''))) return null;
  const ch = db.prepare('SELECT * FROM channels WHERE code = ?').get(code);
  if (!ch || ch.is_dm || ch.is_group || ch.is_self_dm || ch.is_nsfw || ch.text_enabled === 0) return null;
  let a = null; try { a = require('./accesos.js'); } catch { /* sin accesos */ }
  if (a && a.isEnabled()) { if (!a.listo() || a.lockedChannelIds().has(ch.id)) return null; }
  else if (ch.is_private) return null;
  return ch;
}
const autorDe = r => (r.webhook_username || r.persona_username || r.display_name || r.username || 'alguien');
function fotoDe(r) {
  if (r.persona_avatar) return subido(r.persona_avatar);
  if (r.webhook_username) {
    // Los que vienen de Discord: la copia de su foto que ya hay aca (uploads/discord/avatar-<id>-<hash>.png)
    const m = /\/avatars\/(\d+)\/([a-f0-9_]+)\.\w+/.exec(r.webhook_avatar || '');
    return m ? subido(`/uploads/discord/avatar-${m[1]}-${m[2]}.png`) : null;
  }
  return subido(r.avatar);
}
// Si no hay copia aca, la foto de Discord (su CDN), chica y con tiempo limite; guardada un rato
const DISCORD_FOTO = /^https:\/\/cdn\.discordapp\.com\/(?:avatars|embed\/avatars)\/[\w/.-]+\.(?:png|webp|jpg)(?:\?size=\d+)?$/;
const remotas = new Map();
async function fotoDeChat(r) {
  const f = fotoDe(r);
  if (f || !r.webhook_username || !DISCORD_FOTO.test(r.webhook_avatar || '')) return f;
  const c = remotas.get(r.webhook_avatar);
  if (c && Date.now() - c.at < 6 * 3600e3) return c.buf;
  let buf = null;
  try { const x = await fetch(r.webhook_avatar, { signal: AbortSignal.timeout(4000) }); if (x.ok) { const b = Buffer.from(await x.arrayBuffer()); if (b.length < 2e6) buf = b; } } catch { /* sin foto */ }
  remotas.set(r.webhook_avatar, { at: Date.now(), buf });
  if (remotas.size > 300) remotas.delete(remotas.keys().next().value);
  return buf;
}
const FOTO_RE = /^\/uploads\/(?:[a-z-]+\/)?[A-Za-z0-9._-]+\.(?:png|jpe?g|webp|gif)$/i;
// El texto del mensaje como se lee (sin el markdown, los enlaces cortos) y su foto, si es una foto
function leer(content) {
  let foto = null;
  const lineas = [];
  for (let l of String(content || '').split('\n')) {
    l = l.trim();
    if (FOTO_RE.test(l)) { if (!foto) foto = l; continue; }
    if (/^\/uploads\//.test(l)) { lineas.push('[archivo]'); continue; }
    lineas.push(l.replace(/^>\s?/, ''));
  }
  let t = lineas.join(' ')
    .replace(/\|\|[^|]*\|\|/g, '▮▮▮')
    .replace(/<a?:(\w+):\d+>/g, ':$1:')
    .replace(/<@!?&?\d+>/g, '@alguien').replace(/<#\d+>/g, '#canal')
    .replace(/<(https?:\/\/[^>\s]+)>/g, '$1')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '$1')
    .replace(/https?:\/\/[^\s]+/g, u => {
      if (/\.gif(\?|$)|tenor\.com|giphy\.com|klipy\.com/i.test(u)) return '[GIF]';
      if (/\.(png|jpe?g|webp)(\?|$)/i.test(u)) return '[imagen]';
      try { const x = new URL(u); return x.hostname.replace(/^www\./, '') + (x.pathname.length > 1 ? '/…' : ''); } catch { return u; }
    })
    .replace(/(\*\*|__|~~|`)/g, '').replace(/\s+/g, ' ').trim();
  return { texto: t, foto };
}
const hora = s => {
  const d = new Date(String(s).replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? '' : 'Z'));
  if (isNaN(d)) return '';
  const ar = x => new Date(x.getTime() - 3 * 3600e3); // hora de Argentina
  const a = ar(d), hoy = ar(new Date());
  const hm = `${String(a.getUTCHours()).padStart(2, '0')}:${String(a.getUTCMinutes()).padStart(2, '0')}`;
  const dia = x => Math.floor(x.getTime() / 864e5);
  if (dia(a) === dia(hoy)) return 'hoy ' + hm;
  if (dia(a) === dia(hoy) - 1) return 'ayer ' + hm;
  return `${a.getUTCDate()}/${a.getUTCMonth() + 1}/${a.getUTCFullYear()}`;
};
const VISIBLE = "m.nsfw = 0 AND COALESCE(m.burn_seconds, 0) = 0 AND m.destruct_at IS NULL AND m.poll_data IS NULL AND COALESCE(m.is_archived, 0) = 0";
const COLS = 'm.id, m.user_id, m.content, m.created_at, m.thread_id, m.webhook_username, m.webhook_avatar, m.persona_username, m.persona_avatar, u.username, u.display_name, u.avatar';
// Los mensajes del pedacito: los ultimos del canal, o el del enlace con algunos de antes y de despues (en su hilo, si es de un hilo)
function pedacito(ch, msgId, n = 8) {
  const q = (cond, orden, lim, ...args) => db.prepare(`SELECT ${COLS} FROM messages m LEFT JOIN users u ON u.id = m.user_id
    WHERE m.channel_id = ? AND ${VISIBLE} AND ${cond} ORDER BY m.id ${orden} LIMIT ${lim}`).all(ch.id, ...args);
  const t = msgId ? db.prepare(`SELECT ${COLS} FROM messages m LEFT JOIN users u ON u.id = m.user_id WHERE m.id = ? AND m.channel_id = ? AND ${VISIBLE}`).get(Number(msgId) || 0, ch.id) : null;
  if (!t) return { filas: q('m.thread_id IS NULL', 'DESC', n).reverse(), marcado: null };
  const hilo = t.thread_id ? 'm.thread_id = ' + Number(t.thread_id) : 'm.thread_id IS NULL';
  return { filas: [...q(`${hilo} AND m.id < ?`, 'DESC', n - 3, t.id).reverse(), t, ...q(`${hilo} AND m.id > ?`, 'ASC', 2, t.id)], marcado: t.id };
}
// El pedacito para mostrar adentro de la app (aviso.js): sin dibujo, los datos
function pedacitoDatos(ch, msgId) {
  const { filas, marcado } = pedacito(ch, msgId, msgId ? 5 : 4);
  return filas.map(r => { const l = leer(r.content); return { id: r.id, autor: autorDe(r), foto: fotoUrl(r), texto: l.texto, imagen: l.foto ? publicUrl + l.foto : null, hora: hora(r.created_at), marcado: r.id === marcado }; });
}
function fotoUrl(r) {
  const f = fotoDe(r);
  if (f) return publicUrl + '/uploads/' + path.relative(UPLOADS, f).split(path.sep).join('/');
  return r.webhook_username && DISCORD_FOTO.test(r.webhook_avatar || '') ? r.webhook_avatar : null;
}

async function chatJpg(code, msgId) {
  const ch = canalPublico(code);
  if (!ch) return null;
  const { filas, marcado } = pedacito(ch, msgId);
  if (!filas.length) return null;
  // Cada mensaje dibujado; los seguidos de la misma persona (menos de 7 minutos) van juntos, como en la app
  const bloques = [];
  let prev = null;
  for (const r of filas) {
    const l = leer(r.content), autor = autorDe(r);
    const junto = prev && prev.autor === autor && Math.abs(new Date(r.created_at.replace(' ', 'T') + 'Z') - new Date(prev.creado.replace(' ', 'T') + 'Z')) < 7 * 60e3 && r.id !== marcado && prev.id !== marcado;
    const b = { id: r.id, autor, creado: r.created_at, junto, marcado: r.id === marcado, capas: [], h: 0 };
    const x0 = 112;
    if (!junto) {
      b.capas.push({ input: await avatar(await fotoDeChat(r), autor, 52), left: 40, top: 4 });
      const nom = await texto(autor, { size: 24, color: BLANCO, bold: true, width: 600, renglones: 1 });
      const hr = await texto(hora(r.created_at), { size: 18, color: GRIS, width: 300, renglones: 1 });
      if (nom) b.capas.push({ input: nom.buf, left: x0, top: 0 });
      if (hr) b.capas.push({ input: hr.buf, left: x0 + (nom ? nom.w : 0) + 14, top: 5 });
      b.h = 34;
    }
    if (l.texto) {
      const t = await texto(l.texto, { size: 24, color: TEXTO, width: W - x0 - 50, renglones: b.marcado ? 4 : 2 });
      if (t) { b.capas.push({ input: t.buf, left: x0, top: b.h }); b.h += t.h + 4; }
    }
    const f = l.foto && subido(l.foto);
    if (f) {
      try {
        const { data, info } = await sharp(f, { animated: false }).rotate().resize(360, 150, { fit: 'inside' }).png().toBuffer({ resolveWithObject: true });
        b.capas.push({ input: data, left: x0, top: b.h + 6 }); b.h += info.height + 12;
      } catch { /* foto rota */ }
    }
    if (!b.h) continue;
    b.h = Math.max(b.h, junto ? b.h : 60);
    bloques.push(b);
    prev = { autor, creado: r.created_at, id: r.id };
  }
  // Los que entran (de 100 a 610): siempre el del enlace; desde abajo hacia arriba
  const ARRIBA = 100, ABAJO = H - 20, SEP = 18, SEP_JUNTO = 6;
  let usados = [], alto = 0;
  const imarc = bloques.findIndex(b => b.marcado);
  const orden = imarc < 0 ? bloques.map((_, i) => bloques.length - 1 - i) : [imarc, ...bloques.map((_, i) => i).filter(i => i > imarc), ...bloques.map((_, i) => i).filter(i => i < imarc).reverse()];
  for (const i of orden) {
    const b = bloques[i], sep = b.junto ? SEP_JUNTO : SEP;
    if (alto + b.h + sep > ABAJO - ARRIBA) { if (i < imarc || imarc < 0) break; continue; }
    usados.push(i); alto += b.h + sep;
  }
  usados.sort((a, b) => a - b);
  // Arriba de todo no queda la continuacion de un mensaje que no entro (sin nombre ni foto)
  while (usados.length > 1 && bloques[usados[0]].junto && !bloques[usados[0]].marcado) usados.shift();
  const capas = [];
  let total = 0;
  for (const [k, i] of usados.entries()) total += bloques[i].h + SEP_JUNTO + (k && !bloques[i].junto ? SEP - SEP_JUNTO : 0);
  let y = Math.max(ARRIBA + 6, ABAJO - total);
  for (const [k, i] of usados.entries()) {
    const b = bloques[i];
    if (k && !b.junto) y += SEP - SEP_JUNTO;
    if (b.marcado) capas.push({ input: svg(W, b.h + 16, `<rect width="${W}" height="${b.h + 16}" fill="#3a2a31"/><rect width="6" height="${b.h + 16}" fill="${ROSA}"/>`), left: 0, top: y - 8 });
    for (const c of b.capas) capas.push({ ...c, top: y + c.top });
    y += b.h + SEP_JUNTO;
  }
  return jpg(svg(W, H, cabecera('# ' + ch.name, 'CV Chat · ' + (DOMINIO() || 'circulovicioso.club'))), capas);
}
// Para la pagina de la app (vincular.js, shareTags): titulo, descripcion e imagen de un enlace a un canal o mensaje
function chatEnlace(code, msgId) {
  const ch = canalPublico(code);
  if (!ch || !sharp) return null;
  const { filas, marcado } = pedacito(ch, msgId, 4);
  if (!filas.length) return null;
  const m = filas.find(r => r.id === marcado);
  const desc = m ? `${autorDe(m)}: ${leer(m.content).texto || '[imagen]'}` : filas.slice(-3).map(r => `${autorDe(r)}: ${leer(r.content).texto || '[imagen]'}`).join(' · ');
  const ult = filas[filas.length - 1].id;
  return { title: `#${ch.name}`, desc: corto(sinEmojis(desc), 300), image: `/puente/vista/chat.jpg?c=${ch.code}${m ? '&m=' + m.id : ''}&v=${ult}` };
}

// ── Foro ──
async function foroJpg(ruta) {
  const fl = require('./foro-lector.js');
  if (!fl.on() || !FORO()) return null;
  const d = fl.nodoDe(FORO() + '/' + String(ruta || '').replace(/^\/+/, ''));
  if (!d) return null;
  const x = await fl.datos(d);
  if (!x) return null;
  const lugar = { titulo: 'Foro', sitio: FORO().replace(/^https?:\/\//, '') };
  if (d.tipo === 'tema') {
    const linea = [x.es_tema ? '' : 'respuesta', x.respuestas != null ? `${x.respuestas} ${x.respuestas === 1 ? 'respuesta' : 'respuestas'}` : ''].filter(Boolean).join(' · ');
    let foto; try { foto = x.foto ? await descargar(x.foto) : null; } catch { foto = null; }
    return tarjeta({ lugar, rotulo: x.canal, titulo: x.tema, autor: x.autor, autorFoto: foto, linea, cuerpo: x.texto });
  }
  if (d.tipo === 'canal') {
    const u = x.ultimo;
    return tarjeta({ lugar, rotulo: x.portada ? 'el foro del club' : 'foro', titulo: x.portada ? 'Círculo Vicioso' : x.nombre,
      linea: `${x.temas} temas · ${x.mensajes} mensajes`, cuerpo: [x.portada ? 'Los temas del club, en el foro de siempre.' : x.descripcion, u ? `Último tema: «${u.tema}», de ${u.autor}.` : ''].filter(Boolean).join(' ') });
  }
  if (d.tipo === 'miembro') {
    let foto; try { foto = x.foto ? await descargar(x.foto) : null; } catch { foto = null; }
    return tarjeta({ lugar, rotulo: 'miembro del foro', titulo: x.nombre, autor: x.nombre, autorFoto: foto, linea: `${x.mensajes} mensajes` });
  }
  return null;
}
// Una foto del foro (la de quien escribio): solo de su misma direccion, chica y con tiempo limite
async function descargar(url) {
  const u = new URL(url, FORO());
  if (u.origin !== new URL(FORO()).origin) return null;
  const r = await fetch(u, { signal: AbortSignal.timeout(5000) });
  if (!r.ok || !/^image\//.test(r.headers.get('content-type') || '')) return null;
  const b = Buffer.from(await r.arrayBuffer());
  return b.length < 5e6 ? b : null;
}

// ── La web ──
const PAGINAS = { inicio: '/', wiki: '/wiki', 'full-fat-search': '/full-fat-search', descargar: '/descargar', legal: '/legal', 'borrar-cuenta': '/borrar-cuenta', 'seguridad-infantil': '/seguridad-infantil' };
const paginaCache = new Map();
// El HTML de una pagina de la web (guardado 10 minutos)
async function html(ruta) {
  const c = paginaCache.get(ruta);
  if (c && Date.now() - c.at < 10 * 60e3) return c.t;
  const r = await fetch(`https://${DOMINIO()}${ruta}`, { signal: AbortSignal.timeout(8000), redirect: 'manual' });
  if (!r.ok) throw new Error('web ' + r.status);
  const t = await r.text();
  paginaCache.set(ruta, { at: Date.now(), t });
  return t;
}
const deHtml = s => String(s || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
const lugarWeb = () => ({ titulo: 'Círculo Vicioso', sitio: DOMINIO() || 'circulovicioso.club' });
async function webJpg(p) {
  if (!Object.prototype.hasOwnProperty.call(PAGINAS, p) || !DOMINIO()) return null;
  const t = await html(PAGINAS[p]);
  const meta = (deHtml((/<meta name="description" content="([^"]*)"/.exec(t) || [])[1]));
  const h1 = deHtml((/<h1[^>]*>([\s\S]*?)<\/h1>/.exec(t) || [])[1]);
  const titulo = deHtml((/<title>([\s\S]*?)<\/title>/.exec(t) || [])[1]).replace(/ - Círculo Vicioso Club$/, '');
  if (p === 'wiki') {
    const ult = db.prepare("SELECT titulo, categoria FROM puente_wiki WHERE estado = 'publicada' ORDER BY actualizada DESC LIMIT 5").all();
    return tarjeta({ lugar: lugarWeb(), rotulo: 'la wiki del club', titulo: 'Wiki de Círculo Vicioso', linea: meta, lista: ult.map(r => r.titulo + (r.categoria ? ` (${r.categoria})` : '')) });
  }
  if (p === 'inicio') {
    let foto = null;
    try { const r = await fetch(`https://${DOMINIO()}/images/rabbit.png`, { signal: AbortSignal.timeout(5000) }); if (r.ok) foto = Buffer.from(await r.arrayBuffer()); } catch { /* sin el conejo */ }
    return tarjeta({ lugar: lugarWeb(), rotulo: 'el club', titulo: h1 || titulo, cuerpo: meta, foto, lista: ['El chat, el foro y los juegos: CV Chat', 'Full Fat Search: lo que se dijo en el programa', 'La wiki y el Marketplace del club'] });
  }
  return tarjeta({ lugar: lugarWeb(), rotulo: titulo, titulo: h1 || titulo, cuerpo: meta });
}
// La wiki: una entrada o una categoria
const sinMarkdown = s => String(s || '').replace(/!\[[^\]]*\]\([^)]*\)/g, ' ').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/^#+\s*/gm, '').replace(/(\*\*|__|~~|`|^>\s?)/gm, '')
  .replace(/(^|[\s("])[*_]([^*_\n]+)[*_](?=[\s)".,;:!?]|$)/g, '$1$2').replace(/\s+/g, ' ').trim();
const slugify = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
function wikiEntrada(slug) { return db.prepare("SELECT * FROM puente_wiki WHERE slug = ? AND estado = 'publicada'").get(String(slug || '')) || null; }
function wikiCategoria(cs) {
  const filas = db.prepare("SELECT slug, titulo, categoria FROM puente_wiki WHERE estado = 'publicada' AND categoria IS NOT NULL ORDER BY titulo COLLATE NOCASE").all().filter(r => slugify(r.categoria) === cs);
  return filas.length ? { nombre: filas[0].categoria, entradas: filas } : null;
}
function wikiFoto(w) {
  if (!w.imagen) return null;
  const f = path.join(path.dirname(process.env.PUENTE_ADJUNTOS_DIR || '/data/uploads/discord'), 'wiki', path.basename(String(w.imagen).split('?')[0]));
  return fs.existsSync(f) ? f : null;
}
async function wikiJpg(slug, cat) {
  if (slug) {
    const w = wikiEntrada(slug);
    if (!w) return null;
    return tarjeta({ lugar: lugarWeb(), rotulo: 'wiki' + (w.categoria ? ' · ' + w.categoria : ''), titulo: w.titulo, cuerpo: sinMarkdown(w.contenido), foto: wikiFoto(w) });
  }
  const c = wikiCategoria(cat);
  if (!c) return null;
  return tarjeta({ lugar: lugarWeb(), rotulo: 'wiki · categoría', titulo: c.nombre, linea: `${c.entradas.length} ${c.entradas.length === 1 ? 'entrada' : 'entradas'}`, lista: c.entradas.map(r => r.titulo) });
}
// wiki.html con el titulo, la descripcion y la imagen de esa entrada o categoria
async function wikiPagina(ruta) {
  let m, titulo, desc, img;
  if ((m = /^\/wiki\/([^/]+)\/?$/.exec(ruta))) {
    const w = wikiEntrada(decodeURIComponent(m[1]));
    if (w) { titulo = `${w.titulo} - Wiki - Círculo Vicioso Club`; desc = corto(sinMarkdown(w.contenido), 200); img = `/puente/vista/wiki.jpg?s=${encodeURIComponent(w.slug)}&v=${w.actualizada}`; }
  } else if ((m = /^\/wiki-categorias\/([^/]+)\/?$/.exec(ruta))) {
    const c = wikiCategoria(decodeURIComponent(m[1]));
    if (c) { titulo = `${c.nombre} - Wiki - Círculo Vicioso Club`; desc = `Las entradas de ${c.nombre} en la wiki de Círculo Vicioso: ` + corto(c.entradas.map(r => r.titulo).join(', '), 160); img = `/puente/vista/wiki.jpg?cat=${encodeURIComponent(m[1])}&v=${c.entradas.length}`; }
  }
  let t = await html('/wiki.html');
  if (!titulo) return t;
  const meta = (k, attr, v) => { const re = new RegExp(`<meta ${attr}="${k}" content="[^"]*">`); const tag = `<meta ${attr}="${k}" content="${esc(v)}">`; t = re.test(t) ? t.replace(re, tag) : t.replace('</head>', tag + '\n</head>'); };
  t = t.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(titulo)}</title>`);
  meta('description', 'name', desc); meta('og:title', 'property', titulo); meta('og:description', 'property', desc); meta('og:image', 'property', publicUrl + img);
  meta('og:image:width', 'property', '1200'); meta('og:image:height', 'property', '630');
  return t;
}

// ── Pedidos ──
const hechas = new Map(); // clave -> { at, buf | promesa }
const DURA = 10 * 60e3;
function guardada(clave, hacer) {
  const c = hechas.get(clave);
  if (c && Date.now() - c.at < DURA) return c.p;
  const p = hacer().catch(err => { warn('vistas:', clave, err.message); return null; });
  hechas.set(clave, { at: Date.now(), p });
  if (hechas.size > 300) hechas.delete(hechas.keys().next().value);
  return p;
}
async function handle(req, res, p, u, h) {
  // (HEAD tambien: algunos lectores de vistas previas preguntan primero; Node no manda el cuerpo)
  if (!p.startsWith('/puente/vista/') || (req.method !== 'GET' && req.method !== 'HEAD')) return false;
  const q = u.searchParams;
  if (p.startsWith('/puente/vista/pagina/')) {
    let t;
    try { t = await wikiPagina(p.slice('/puente/vista/pagina'.length)); } catch (err) { warn('vistas: pagina:', err.message); return h.send(res, 502, 'text/plain', 'La web no contestó'); }
    return h.send(res, 200, 'text/html', t, { 'Cache-Control': 'no-cache' });
  }
  let clave, hacer;
  if (p === '/puente/vista/chat.jpg') {
    const c = String(q.get('c') || ''), m = /^\d+$/.test(q.get('m') || '') ? q.get('m') : '';
    // sin el mensaje, el pedacito cambia con cada mensaje nuevo: se guarda solo un minuto
    clave = `chat:${c}:${m}:${m ? '' : Math.floor(Date.now() / 60e3)}`; hacer = () => chatJpg(c, m);
  } else if (p === '/puente/vista/foro.jpg') {
    const r = String(q.get('u') || '').slice(0, 300); clave = 'foro:' + r; hacer = () => foroJpg(r);
  } else if (p === '/puente/vista/web.jpg') {
    const pg = String(q.get('p') || ''); clave = 'web:' + pg; hacer = () => webJpg(pg);
  } else if (p === '/puente/vista/wiki.jpg') {
    const s = String(q.get('s') || '').slice(0, 120), cat = String(q.get('cat') || '').slice(0, 120);
    clave = `wiki:${s}:${cat}:${q.get('v') || ''}`; hacer = () => wikiJpg(s, cat);
  } else return h.send(res, 404, 'text/plain', 'No encontrado');
  const buf = sharp ? await guardada(clave, hacer) : null;
  if (!buf) { res.writeHead(302, { Location: '/puente/logo-carga.png', 'Cache-Control': 'public, max-age=300' }); return res.end(); }
  res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Content-Length': buf.length, 'Cache-Control': 'public, max-age=600', 'X-Content-Type-Options': 'nosniff' });
  return res.end(buf);
}

module.exports = { setup, on, handle, chatEnlace, canalPublico, pedacitoDatos };
