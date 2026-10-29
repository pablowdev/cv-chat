// La wiki de la web (circulovicioso.club/wiki). Las paginas son las de la web
// (wiki.html, detail_wiki.html...), que web/wiki.js llena con lo que da esta API.
// Las entradas se guardan aca (puente_wiki); cada cambio es una version
// (puente_wiki_rev). Cualquiera con la cuenta unica (cuenta.js) propone un
// articulo o una edicion; queda pendiente hasta que un administrador la aprueba.
// Lo de los administradores se publica directo. Nada se borra: las entradas
// borradas y las versiones viejas quedan, y se puede volver a una anterior.
//
//  GET  /puente/api/wiki/lista        entradas (?categoria=), categorias, quien soy
//  GET  /puente/api/wiki/entrada      una entrada (?slug=), con las relacionadas y el historial
//  GET  /puente/api/wiki/version      una version vieja o pendiente (?id=)
//  POST /puente/api/wiki/proponer     articulo nuevo o edicion { slug?, titulo, categoria, contenido, imagen }
//  POST /puente/api/wiki/imagen       sube una foto (el cuerpo es la imagen) -> { url }
//  GET  /puente/api/wiki/pendientes   (administradores) las propuestas por revisar
//  POST /puente/api/wiki/revisar      (administradores) { id, accion: aprobar|rechazar, nota }
//  POST /puente/api/wiki/volver       (administradores) { id }: vuelve a esa version
//  POST /puente/api/wiki/borrar       (administradores) { slug }: la saca de la wiki (se puede volver)
//  GET  /puente/api/wiki/mias         mis propuestas y como quedaron

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const MAX_TITULO = 120, MAX_CATEGORIA = 40, MAX_CONTENIDO = 60000, MAX_FOTO = 8 * 1024 * 1024;
const POR_HORA = 15;
const FOTOS = path.join(path.dirname(process.env.PUENTE_ADJUNTOS_DIR || '/data/uploads/discord'), 'wiki');

let db, log, warn, h, publicUrl, cuenta;

function setup(ctx) {
  ({ db, log, warn, publicUrl, helpers: h } = ctx);
  cuenta = require('./cuenta.js');
  db.exec(`
    CREATE TABLE IF NOT EXISTS puente_wiki (
      id INTEGER PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      titulo TEXT NOT NULL,
      categoria TEXT,
      contenido TEXT NOT NULL,
      imagen TEXT,
      autor_id INTEGER,
      creada INTEGER NOT NULL,
      actualizada INTEGER NOT NULL,
      estado TEXT NOT NULL DEFAULT 'publicada',
      rev_id INTEGER
    );
    CREATE TABLE IF NOT EXISTS puente_wiki_rev (
      id INTEGER PRIMARY KEY,
      wiki_id INTEGER,
      base_rev_id INTEGER,
      titulo TEXT NOT NULL,
      categoria TEXT,
      contenido TEXT NOT NULL,
      imagen TEXT,
      autor_id INTEGER,
      creada INTEGER NOT NULL,
      estado TEXT NOT NULL DEFAULT 'pendiente',
      revisor_id INTEGER,
      revisada INTEGER,
      nota TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_puente_wiki_rev_estado ON puente_wiki_rev(estado);
    CREATE INDEX IF NOT EXISTS idx_puente_wiki_rev_wiki ON puente_wiki_rev(wiki_id);
  `);
}

// ── Texto ──
const slugify = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'entrada';
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const limpio = (s, max) => String(s || '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max);
function urlSegura(u, imagen) {
  u = String(u || '').trim();
  if (/^https:\/\//i.test(u)) return u;
  if (!imagen && /^http:\/\//i.test(u)) return u;
  if (!imagen && /^(\/|#)/.test(u) && !u.startsWith('//')) return u;
  return null;
}

// Markdown (lo de siempre: titulos, negrita, cursiva, listas, citas, enlaces, fotos, codigo).
// Todo se escapa primero: no pasa HTML de nadie.
function inline(t) {
  const codes = [];
  t = esc(t).replace(/`([^`\n]+)`/g, (_, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
  t = t.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, alt, u) => { const s = urlSegura(u.replace(/&amp;/g, '&'), true); return s ? `<img src="${esc(s)}" alt="${alt}" loading="lazy">` : m; });
  t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, txt, u) => { const s = urlSegura(u.replace(/&amp;/g, '&'), false); return s ? `<a href="${esc(s)}"${/^https?:/.test(s) ? ' target="_blank" rel="noopener nofollow"' : ''}>${txt}</a>` : m; });
  t = t.replace(/(^|[\s(])(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g, (m, pre, u) => `${pre}<a href="${u}" target="_blank" rel="noopener nofollow">${u}</a>`);
  t = t.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>').replace(/__([^_\n]+)__/g, '<strong>$1</strong>');
  t = t.replace(/(^|[^*\w])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>').replace(/(^|[^_\w])_([^_\n]+)_(?!\w)/g, '$1<em>$2</em>');
  t = t.replace(/~~([^~\n]+)~~/g, '<del>$1</del>');
  return t.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[i]}</code>`);
}
function markdown(md) {
  const lines = String(md || '').replace(/\r\n?/g, '\n').split('\n');
  const out = []; const toc = []; const ids = new Set();
  let para = [], list = null, quote = [];
  const flushPara = () => { if (para.length) { out.push(`<p>${para.map(inline).join('<br>')}</p>`); para = []; } };
  const flushList = () => { if (list) { out.push(`<${list.tag}>${list.items.map(i => `<li>${inline(i)}</li>`).join('')}</${list.tag}>`); list = null; } };
  const flushQuote = () => { if (quote.length) { out.push(`<blockquote>${quote.map(inline).join('<br>')}</blockquote>`); quote = []; } };
  const flush = () => { flushPara(); flushList(); flushQuote(); };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^```/.test(l)) {
      flush(); const code = [];
      for (i++; i < lines.length && !/^```/.test(lines[i]); i++) code.push(lines[i]);
      out.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`); continue;
    }
    let m;
    if ((m = l.match(/^(#{1,4})\s+(.+?)\s*#*\s*$/))) {
      flush();
      const n = Math.min(4, m[1].length + 1); // # es h2: el h1 es el titulo de la entrada
      let id = slugify(m[2]); let k = 2; while (ids.has(id)) id = `${slugify(m[2])}-${k++}`; ids.add(id);
      out.push(`<h${n} id="${id}">${inline(m[2])}</h${n}>`); toc.push({ nivel: n, texto: m[2].replace(/[*_`]/g, ''), id });
      continue;
    }
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(l)) { flush(); out.push('<hr>'); continue; }
    if ((m = l.match(/^>\s?(.*)$/))) { flushPara(); flushList(); quote.push(m[1]); continue; }
    if ((m = l.match(/^\s*([-*+])\s+(.+)$/)) || (m = l.match(/^\s*(\d+)[.)]\s+(.+)$/))) {
      flushPara(); flushQuote();
      const tag = /\d/.test(m[1]) ? 'ol' : 'ul';
      if (!list || list.tag !== tag) { flushList(); list = { tag, items: [] }; }
      list.items.push(m[2]); continue;
    }
    if (!l.trim()) { flush(); continue; }
    flushList(); flushQuote(); para.push(l);
  }
  flush();
  return { html: out.join('\n'), toc };
}
const resumen = md => String(md || '').replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[#*_`>~-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 220);

// ── Quien es ──
const nombreDe = id => { if (!id) return null; const u = db.prepare('SELECT username, display_name FROM users WHERE id = ?').get(id); return u ? (u.display_name || u.username) : null; };
function yoDe(req) {
  const u = cuenta.userFromCookie(req);
  return u ? { id: u.id, usuario: u.username, nombre: u.display_name || u.username, admin: !!u.is_admin } : null;
}
// La web pregunta con la cookie de la cuenta unica: solo desde las paginas propias, y los cambios con JSON
function corsWiki(req, res) {
  const o = req.headers.origin;
  const ok = !o || cuenta.allowedOrigin(o);
  if (o && ok) { res.setHeader('Access-Control-Allow-Origin', o); res.setHeader('Access-Control-Allow-Credentials', 'true'); res.setHeader('Vary', 'Origin'); }
  return ok;
}
const absoluta = p => (!p ? null : /^https?:\/\//.test(p) ? p : `${publicUrl}${p}`);

function entradaPublica(w, conHtml) {
  const r = { slug: w.slug, titulo: w.titulo, categoria: w.categoria, categoriaSlug: w.categoria ? slugify(w.categoria) : null,
    imagen: absoluta(w.imagen), autor: nombreDe(w.autor_id) || 'el archivo', creada: w.creada, actualizada: w.actualizada };
  if (conHtml) { const md = markdown(w.contenido); r.contenido = w.contenido; r.html = md.html; r.toc = md.toc; } else r.resumen = resumen(w.contenido);
  return r;
}
function categorias() {
  const rows = db.prepare("SELECT categoria, COUNT(*) n FROM puente_wiki WHERE estado = 'publicada' AND categoria IS NOT NULL AND categoria != '' GROUP BY categoria ORDER BY categoria COLLATE NOCASE").all();
  return rows.map(r => ({ nombre: r.categoria, slug: slugify(r.categoria), n: r.n }));
}
const pendientesN = () => db.prepare("SELECT COUNT(*) n FROM puente_wiki_rev WHERE estado = 'pendiente'").get().n;

function slugLibre(titulo, exceptoId) {
  const base = slugify(titulo); let s = base, k = 2;
  for (;;) { const r = db.prepare('SELECT id FROM puente_wiki WHERE slug = ?').get(s); if (!r || r.id === exceptoId) return s; s = `${base}-${k++}`; }
}

// Aplica una version: la entrada queda como esa version
function aplicar(rev, revisorId) {
  const now = Date.now();
  return db.transaction(() => {
    let wikiId = rev.wiki_id;
    if (wikiId) {
      db.prepare('UPDATE puente_wiki SET titulo = ?, categoria = ?, contenido = ?, imagen = ?, actualizada = ?, estado = \'publicada\', rev_id = ? WHERE id = ?')
        .run(rev.titulo, rev.categoria, rev.contenido, rev.imagen, now, rev.id, wikiId);
    } else {
      wikiId = db.prepare('INSERT INTO puente_wiki (slug, titulo, categoria, contenido, imagen, autor_id, creada, actualizada, rev_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(slugLibre(rev.titulo), rev.titulo, rev.categoria, rev.contenido, rev.imagen, rev.autor_id, now, now, rev.id).lastInsertRowid;
      db.prepare('UPDATE puente_wiki_rev SET wiki_id = ? WHERE id = ?').run(wikiId, rev.id);
    }
    db.prepare("UPDATE puente_wiki_rev SET estado = 'aprobada', revisor_id = ?, revisada = ? WHERE id = ?").run(revisorId, now, rev.id);
    return db.prepare('SELECT slug FROM puente_wiki WHERE id = ?').get(wikiId).slug;
  })();
}

async function leerCuerpo(req, max) {
  return new Promise(resolve => {
    let size = 0; const parts = [];
    req.on('data', c => { size += c.length; if (size > max) { req.destroy(); resolve(null); } else parts.push(c); });
    req.on('end', () => resolve(Buffer.concat(parts)));
    req.on('error', () => resolve(null));
  });
}
const tipoFoto = b => (b[0] === 0xff && b[1] === 0xd8 ? 'jpg' : b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) ? 'png'
  : b.slice(0, 4).toString() === 'GIF8' ? 'gif' : (b.slice(0, 4).toString() === 'RIFF' && b.slice(8, 12).toString() === 'WEBP') ? 'webp' : null);

async function handle(req, res, p, u) {
  const { json, send, readJson } = h;
  if (!p.startsWith('/puente/api/wiki/')) return false;
  if (!corsWiki(req, res)) return json(res, 403, { error: 'no' });
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return send(res, 204, 'text/plain', '');
  }
  const yo = yoDe(req);
  // Los cambios: con sesion, y en JSON (o la foto) para que otra pagina no los pueda mandar
  if (req.method === 'POST') {
    if (!yo) return json(res, 401, { error: 'Iniciá sesión para aportar a la wiki.' });
    const ct = String(req.headers['content-type'] || '');
    if (p === '/puente/api/wiki/imagen' ? !/^image\//.test(ct) : !/^application\/json/.test(ct)) return json(res, 415, { error: 'no' });
  }

  if (p === '/puente/api/wiki/lista' && req.method === 'GET') {
    const cat = u.searchParams.get('categoria');
    let rows = db.prepare("SELECT * FROM puente_wiki WHERE estado = 'publicada' ORDER BY titulo COLLATE NOCASE").all();
    let categoria = null;
    if (cat) { rows = rows.filter(w => w.categoria && slugify(w.categoria) === cat); categoria = (categorias().find(c => c.slug === cat) || {}).nombre || null; }
    return json(res, 200, { entradas: rows.map(w => entradaPublica(w, false)), categorias: categorias(), categoria,
      yo, pendientes: yo && yo.admin ? pendientesN() : 0, chat: publicUrl });
  }

  if (p === '/puente/api/wiki/entrada' && req.method === 'GET') {
    const w = db.prepare('SELECT * FROM puente_wiki WHERE slug = ?').get(u.searchParams.get('slug') || '');
    if (!w || (w.estado !== 'publicada' && !(yo && yo.admin))) return json(res, 404, { error: 'No hay ninguna entrada con ese nombre.', yo, chat: publicUrl });
    const rel = w.categoria ? db.prepare("SELECT slug, titulo FROM puente_wiki WHERE estado = 'publicada' AND categoria = ? AND id != ? ORDER BY titulo COLLATE NOCASE LIMIT 12").all(w.categoria, w.id) : [];
    const hist = db.prepare("SELECT id, autor_id, creada, revisada, estado FROM puente_wiki_rev WHERE wiki_id = ? AND (estado = 'aprobada' OR (estado = 'pendiente' AND (autor_id = ? OR ?))) ORDER BY id DESC LIMIT 50")
      .all(w.id, yo ? yo.id : -1, yo && yo.admin ? 1 : 0)
      .map(r => ({ id: r.id, autor: nombreDe(r.autor_id) || 'el archivo', fecha: r.revisada || r.creada, estado: r.estado, actual: r.id === w.rev_id }));
    const editores = [...new Set(db.prepare("SELECT autor_id FROM puente_wiki_rev WHERE wiki_id = ? AND estado = 'aprobada'").all(w.id).map(r => nombreDe(r.autor_id)).filter(Boolean))];
    return json(res, 200, { entrada: { ...entradaPublica(w, true), borrada: w.estado !== 'publicada', editores }, relacionadas: rel, historial: hist, categorias: categorias(),
      yo, pendientes: yo && yo.admin ? pendientesN() : 0, chat: publicUrl });
  }

  if (p === '/puente/api/wiki/version' && req.method === 'GET') {
    const r = db.prepare('SELECT * FROM puente_wiki_rev WHERE id = ?').get(Number(u.searchParams.get('id')) || 0);
    if (!r || (r.estado !== 'aprobada' && !(yo && (yo.admin || yo.id === r.autor_id)))) return json(res, 404, { error: 'No encontrada.' });
    const w = r.wiki_id ? db.prepare('SELECT slug, contenido, titulo, categoria FROM puente_wiki WHERE id = ?').get(r.wiki_id) : null;
    return json(res, 200, { version: { id: r.id, titulo: r.titulo, categoria: r.categoria, contenido: r.contenido, html: markdown(r.contenido).html, imagen: absoluta(r.imagen),
      autor: nombreDe(r.autor_id) || 'el archivo', fecha: r.revisada || r.creada, estado: r.estado, nota: r.nota, slug: w && w.slug, actual: w ? { titulo: w.titulo, categoria: w.categoria, contenido: w.contenido } : null } });
  }

  if (p === '/puente/api/wiki/imagen' && req.method === 'POST') {
    const buf = await leerCuerpo(req, MAX_FOTO);
    if (!buf || !buf.length) return json(res, 413, { error: 'La foto es muy grande (hasta 8 MB).' });
    const ext = tipoFoto(buf);
    if (!ext) return json(res, 415, { error: 'Eso no es una foto (JPG, PNG, GIF o WebP).' });
    try {
      fs.mkdirSync(FOTOS, { recursive: true });
      const file = `${crypto.createHash('sha256').update(buf).digest('hex').slice(0, 24)}.${ext}`;
      const dest = path.join(FOTOS, file);
      if (!fs.existsSync(dest)) { fs.writeFileSync(dest + '.part', buf); fs.renameSync(dest + '.part', dest); }
      return json(res, 200, { url: `${publicUrl}/uploads/wiki/${file}` });
    } catch (err) { warn('wiki: foto:', err.message); return json(res, 500, { error: 'No se pudo guardar la foto.' }); }
  }

  if (p === '/puente/api/wiki/proponer' && req.method === 'POST') {
    const body = await readJson(req, MAX_CONTENIDO * 4) || {};
    const titulo = limpio(body.titulo, MAX_TITULO).replace(/\s+/g, ' ');
    const categoria = limpio(body.categoria, MAX_CATEGORIA).replace(/\s+/g, ' ') || null;
    const contenido = limpio(body.contenido, MAX_CONTENIDO);
    const imagen = body.imagen ? urlSegura(body.imagen, true) : null;
    if (titulo.length < 2) return json(res, 400, { error: 'Poné un título.' });
    if (contenido.length < 10) return json(res, 400, { error: 'Escribí el contenido de la entrada.' });
    if (body.imagen && !imagen) return json(res, 400, { error: 'La foto no es válida.' });
    if (!yo.admin && db.prepare('SELECT COUNT(*) n FROM puente_wiki_rev WHERE autor_id = ? AND creada > ?').get(yo.id, Date.now() - 3600e3).n >= POR_HORA)
      return json(res, 429, { error: 'Mandaste muchas propuestas en poco tiempo. Esperá un rato.' });
    let w = null;
    if (body.slug) {
      w = db.prepare('SELECT * FROM puente_wiki WHERE slug = ?').get(String(body.slug));
      if (!w) return json(res, 404, { error: 'Esa entrada ya no existe.' });
      if (w.titulo === titulo && (w.categoria || null) === categoria && w.contenido === contenido && (w.imagen || null) === (imagen || null))
        return json(res, 400, { error: 'No cambiaste nada.' });
    } else if (db.prepare("SELECT 1 FROM puente_wiki WHERE estado = 'publicada' AND slug = ?").get(slugify(titulo))) {
      return json(res, 409, { error: 'Ya hay una entrada con ese título: proponé una edición de esa.', slug: slugify(titulo) });
    }
    const id = db.prepare('INSERT INTO puente_wiki_rev (wiki_id, base_rev_id, titulo, categoria, contenido, imagen, autor_id, creada) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(w ? w.id : null, w ? w.rev_id : null, titulo, categoria, contenido, imagen, yo.id, Date.now()).lastInsertRowid;
    if (yo.admin) {
      const slug = aplicar(db.prepare('SELECT * FROM puente_wiki_rev WHERE id = ?').get(id), yo.id);
      log(`wiki: ${yo.usuario} publico "${titulo}"`);
      return json(res, 200, { ok: true, estado: 'publicada', slug });
    }
    log(`wiki: ${yo.usuario} propuso ${w ? 'una edicion de' : 'la entrada'} "${titulo}" (#${id})`);
    try { h.avisarAdmins && h.avisarAdmins(`📚 ${yo.nombre} propuso ${w ? `una edición de "${w.titulo}"` : `una entrada nueva: "${titulo}"`} en la wiki. Revisala en https://${cuenta.dominio()}/wiki?pendientes=1`); } catch (err) { warn('wiki: aviso:', err.message); }
    return json(res, 200, { ok: true, estado: 'pendiente' });
  }

  if (p === '/puente/api/wiki/mias' && req.method === 'GET') {
    if (!yo) return json(res, 401, { error: 'sin sesion' });
    const rows = db.prepare('SELECT r.id, r.titulo, r.estado, r.creada, r.revisada, r.nota, w.slug FROM puente_wiki_rev r LEFT JOIN puente_wiki w ON w.id = r.wiki_id WHERE r.autor_id = ? ORDER BY r.id DESC LIMIT 30').all(yo.id);
    return json(res, 200, { propuestas: rows });
  }

  // ── Administradores ──
  if (p === '/puente/api/wiki/pendientes' || p === '/puente/api/wiki/revisar' || p === '/puente/api/wiki/volver' || p === '/puente/api/wiki/borrar') {
    if (!yo || !yo.admin) return json(res, 403, { error: 'Solo los administradores.' });
  }
  if (p === '/puente/api/wiki/pendientes' && req.method === 'GET') {
    const rows = db.prepare("SELECT r.*, w.slug, w.titulo AS w_titulo, w.categoria AS w_categoria, w.contenido AS w_contenido, w.imagen AS w_imagen, w.rev_id AS w_rev FROM puente_wiki_rev r LEFT JOIN puente_wiki w ON w.id = r.wiki_id WHERE r.estado = 'pendiente' ORDER BY r.id").all();
    return json(res, 200, { pendientes: rows.map(r => ({ id: r.id, autor: nombreDe(r.autor_id), creada: r.creada, nueva: !r.wiki_id, slug: r.slug,
      titulo: r.titulo, categoria: r.categoria, contenido: r.contenido, html: markdown(r.contenido).html, imagen: absoluta(r.imagen),
      desactualizada: !!(r.wiki_id && r.base_rev_id !== r.w_rev),
      antes: r.wiki_id ? { titulo: r.w_titulo, categoria: r.w_categoria, contenido: r.w_contenido, imagen: absoluta(r.w_imagen) } : null })) });
  }
  if (p === '/puente/api/wiki/revisar' && req.method === 'POST') {
    const body = await readJson(req) || {};
    const r = db.prepare("SELECT * FROM puente_wiki_rev WHERE id = ? AND estado = 'pendiente'").get(Number(body.id) || 0);
    if (!r) return json(res, 404, { error: 'Esa propuesta ya se revisó.' });
    if (body.accion === 'aprobar') {
      if (!r.wiki_id && db.prepare("SELECT 1 FROM puente_wiki WHERE estado = 'publicada' AND slug = ?").get(slugify(r.titulo))) return json(res, 409, { error: 'Ya hay una entrada con ese título.' });
      const slug = aplicar(r, yo.id);
      log(`wiki: ${yo.usuario} aprobo "${r.titulo}" (#${r.id})`);
      return json(res, 200, { ok: true, slug });
    }
    if (body.accion === 'rechazar') {
      db.prepare("UPDATE puente_wiki_rev SET estado = 'rechazada', revisor_id = ?, revisada = ?, nota = ? WHERE id = ?").run(yo.id, Date.now(), limpio(body.nota, 500) || null, r.id);
      log(`wiki: ${yo.usuario} rechazo "${r.titulo}" (#${r.id})`);
      return json(res, 200, { ok: true });
    }
    return json(res, 400, { error: 'accion' });
  }
  if (p === '/puente/api/wiki/volver' && req.method === 'POST') {
    const body = await readJson(req) || {};
    const r = db.prepare("SELECT * FROM puente_wiki_rev WHERE id = ? AND estado = 'aprobada' AND wiki_id IS NOT NULL").get(Number(body.id) || 0);
    if (!r) return json(res, 404, { error: 'No encontrada.' });
    // Una version nueva igual a esa (asi queda en el historial quien volvio)
    const id = db.prepare('INSERT INTO puente_wiki_rev (wiki_id, base_rev_id, titulo, categoria, contenido, imagen, autor_id, creada, nota) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(r.wiki_id, r.id, r.titulo, r.categoria, r.contenido, r.imagen, yo.id, Date.now(), `vuelve a la versión del ${new Date(r.revisada || r.creada).toISOString().slice(0, 10)}`).lastInsertRowid;
    const slug = aplicar(db.prepare('SELECT * FROM puente_wiki_rev WHERE id = ?').get(id), yo.id);
    log(`wiki: ${yo.usuario} volvio "${r.titulo}" a la version #${r.id}`);
    return json(res, 200, { ok: true, slug });
  }
  if (p === '/puente/api/wiki/borrar' && req.method === 'POST') {
    const body = await readJson(req) || {};
    const w = db.prepare('SELECT id, titulo, estado FROM puente_wiki WHERE slug = ?').get(String(body.slug || ''));
    if (!w) return json(res, 404, { error: 'No encontrada.' });
    const estado = body.volver ? 'publicada' : 'borrada';
    db.prepare('UPDATE puente_wiki SET estado = ? WHERE id = ?').run(estado, w.id);
    log(`wiki: ${yo.usuario} ${body.volver ? 'devolvio' : 'saco'} "${w.titulo}"`);
    return json(res, 200, { ok: true, estado });
  }

  return json(res, 404, { error: 'No encontrado' });
}

// Para cargar las entradas de antes (la wiki de Webflow): sin autor, con su fecha
function importar(e) {
  if (db.prepare('SELECT 1 FROM puente_wiki WHERE slug = ?').get(e.slug)) return false;
  const t = e.fecha || Date.now();
  db.transaction(() => {
    const rev = db.prepare("INSERT INTO puente_wiki_rev (titulo, categoria, contenido, imagen, autor_id, creada, estado, revisada, nota) VALUES (?, ?, ?, ?, NULL, ?, 'aprobada', ?, ?)")
      .run(e.titulo, e.categoria || null, e.contenido, e.imagen || null, t, t, e.nota || 'de la wiki de antes').lastInsertRowid;
    const id = db.prepare('INSERT INTO puente_wiki (slug, titulo, categoria, contenido, imagen, autor_id, creada, actualizada, rev_id) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?)')
      .run(e.slug, e.titulo, e.categoria || null, e.contenido, e.imagen || null, t, t, rev).lastInsertRowid;
    db.prepare('UPDATE puente_wiki_rev SET wiki_id = ? WHERE id = ?').run(id, rev);
  })();
  return true;
}

module.exports = { setup, handle, importar, _test: { markdown, slugify } };
