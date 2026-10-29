// El Marketplace (mercado.js) y la compra/venta del foro ("tejemanejes"), en los dos sentidos, con el
// servicio del foro (foro-servicio.js):
//  - Los temas de tejemanejes estan en el Marketplace con su fecha, sus fotos, el precio (si se lee en el
//    titulo o el texto) y un enlace al tema. Si quien lo publico tiene la cuenta unida, es suyo.
//  - Lo que publica en el Marketplace alguien con la cuenta del foro unida sale tambien como tema en
//    tejemanejes, como esa persona, con las fotos y un enlace al Marketplace. Vendido o borrado: el tema
//    lo dice en el titulo.
//  - Si se cambia de un lado, se cambia del otro (gana el ultimo: primero lo de CV Chat).
// foro_hash: como estaba el aviso de CV Chat la ultima vez que se paso; foro_editado: la ultima edicion del foro.

const crypto = require('crypto');

const CADA_MS = 5 * 60 * 1000, MAX_FOTOS = 6;
let db, log, warn, mercado, servicio, publicUrl, andando = false;

function setup(ctx) {
  ({ db, log, warn, publicUrl } = ctx);
  mercado = require('./mercado.js');
  servicio = require('./foro-servicio.js');
  if (!servicio.on()) return;
  log('foro: marketplace y tejemanejes juntos');
  setTimeout(vuelta, 45000);
  setInterval(vuelta, CADA_MS);
}

const ghost = () => (db.prepare("SELECT id FROM users WHERE username = 'discord-historial'").get() || {}).id || null;
const unida = foroId => (db.prepare('SELECT haven_user_id FROM puente_foro WHERE foro_user_id = ?').get(foroId) || {}).haven_user_id || null;
const foroDe = havenId => (db.prepare('SELECT foro_user_id FROM puente_foro WHERE haven_user_id = ?').get(havenId) || {}).foro_user_id || null;
const hashDe = r => crypto.createHash('sha256').update(JSON.stringify([r.titulo, r.descripcion, r.precio, r.moneda, r.zona, r.fotos, r.estado, r.condicion, r.tipo])).digest('hex').slice(0, 24);

// ── Del foro al Marketplace ──
// El texto del foro sin BBCode (los enlaces quedan como direccion; las fotos van aparte)
function plano(raw) {
  let s = String(raw || '');
  s = s.replace(/\[img[^\]]*\][^\[]*\[\/img\]/gi, ' ');
  s = s.replace(/\[url=([^\]]*)\]([\s\S]*?)\[\/url\]/gi, (m, u, t) => (t.trim() && t.trim() !== u ? `${t} (${u})` : u));
  s = s.replace(/\[user=[^\]]*\]([\s\S]*?)\[\/user\]/gi, '@$1');
  s = s.replace(/\[\/?(?:b|i|u|s|font|size|color|left|right|center|quote|indent|list|\*|highlight|attach|video|url|email|noparse|code|php|html)(?:=[^\]]*)?\]/gi, '');
  return s.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#0?39;/g, "'").replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
const imgsDe = raw => [...String(raw || '').matchAll(/\[img[^\]]*\]\s*(https:\/\/[^\[\s]+)\s*\[\/img\]/gi)].map(m => m[1]);
// "$400.000", "97 USDT", "U$S 300", "usd 1.200,50"
function numero(t) {
  t = t.replace(/\s/g, '');
  if (/,\d{1,2}$/.test(t)) t = t.replace(/\./g, '').replace(',', '.'); else t = t.replace(/[.,](?=\d{3}(\D|$))/g, '');
  const n = Number(t);
  return Number.isFinite(n) && n > 0 && n < 1e12 ? n : null;
}
function precioDe(titulo, texto) {
  const pruebas = [
    [/(?:u\$[sd]|us\$|usd|d[oó]lares?)\s*:?\s*([\d.,]+)/i, 'USD'], [/([\d.,]+)\s*(?:u\$[sd]|us\$|usd\b|d[oó]lares)/i, 'USD'],
    [/usdt\s*:?\s*([\d.,]+)/i, 'USDT'], [/([\d.,]+)\s*usdt/i, 'USDT'],
    [/(?:\$|ars|pesos)\s*:?\s*([\d.,]+)/i, 'ARS'], [/([\d.,]+)\s*(?:ars|pesos)/i, 'ARS'],
  ];
  for (const src of [titulo, texto]) for (const [re, moneda] of pruebas) {
    const m = re.exec(src || '');
    const n = m && numero(m[1]);
    if (n) return { precio: n, moneda };
  }
  return { precio: null, moneda: null };
}
const vendido = t => /\b(vendid[oa]s?|ya no est[aá]|reservad[oa])\b/i.test(t || '');
async function fotosDe(t, dueno) {
  const out = [];
  for (const u of [...t.fotos, ...imgsDe(t.texto)].slice(0, MAX_FOTOS)) {
    try {
      const r = await fetch(u, { signal: AbortSignal.timeout(20000) });
      if (!r.ok || !/^image\//.test(r.headers.get('content-type') || '')) continue;
      const buf = Buffer.from(await r.arrayBuffer());
      if (!buf.length || buf.length > 15 * 1024 * 1024) continue;
      out.push(await mercado.guardarFoto(buf, dueno));
    } catch { /* esa foto no */ }
  }
  return out;
}
async function traer(temas) {
  const fantasma = ghost();
  const por = db.prepare('SELECT * FROM puente_mercado WHERE foro_nodo = ?');
  let nuevos = 0, cambiados = 0;
  for (const t of temas) {
    const r = por.get(t.nodo);
    const dueno = unida(t.id) || fantasma;
    if (!dueno) continue;
    const texto = plano(t.texto);
    const { precio, moneda } = precioDe(t.titulo, texto);
    const estado = vendido(t.titulo) ? 'vendida' : 'activa';
    const tipo = /\b(alquil|servicio|clases?|arreglo|reparaci)/i.test(t.titulo) ? 'servicio' : 'producto';
    if (!r) {
      const fotos = await fotosDe(t, dueno);
      db.prepare(`INSERT INTO puente_mercado (user_id, tipo, condicion, titulo, descripcion, precio, moneda, zona, fotos, creado, renovado, estado, origen, foro_nodo, foro_url, foro_autor, foro_editado)
                  VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, 'foro', ?, ?, ?, ?)`)
        .run(dueno, tipo, /\busad[oa]\b/i.test(t.titulo + ' ' + texto) ? 'usado' : /\bnuev[oa]\b/i.test(t.titulo) ? 'nuevo' : null,
          t.titulo.slice(0, 80), texto.slice(0, 2000), precio, moneda, JSON.stringify(fotos), t.fecha, t.fecha, estado, t.nodo, t.url, t.autor, t.editado);
      const nuevo = por.get(t.nodo);
      db.prepare('UPDATE puente_mercado SET foro_hash = ? WHERE id = ?').run(hashDe(nuevo), nuevo.id);
      nuevos++;
      continue;
    }
    // Cambio en el foro (y no en CV Chat desde la ultima vez): se trae
    if (t.editado && t.editado !== r.foro_editado) {
      const cambioAca = r.foro_hash && hashDe(r) !== r.foro_hash;
      if (!cambioAca) {
        db.prepare('UPDATE puente_mercado SET titulo = ?, descripcion = ?, precio = ?, moneda = ?, estado = CASE WHEN estado = \'borrada\' THEN estado ELSE ? END, foro_editado = ?, foro_autor = ?, user_id = ? WHERE id = ?')
          .run(t.titulo.slice(0, 80), texto.slice(0, 2000), precio, moneda, estado, t.editado, t.autor, r.origen === 'foro' ? dueno : r.user_id, r.id);
        db.prepare('UPDATE puente_mercado SET foro_hash = ? WHERE id = ?').run(hashDe(por.get(t.nodo)), r.id);
        cambiados++;
      } else db.prepare('UPDATE puente_mercado SET foro_editado = ? WHERE id = ?').run(t.editado, r.id);
    } else if (r.origen === 'foro' && r.user_id !== dueno && dueno !== fantasma) {
      // Se unio la cuenta despues: el aviso pasa a ser suyo
      db.prepare('UPDATE puente_mercado SET user_id = ? WHERE id = ?').run(dueno, r.id);
    }
  }
  if (nuevos || cambiados) log(`foro: tejemanejes -> marketplace: ${nuevos} nuevos, ${cambiados} cambiados`);
}

// ── Del Marketplace al foro ──
function textoForo(r) {
  const fotos = (JSON.parse(r.fotos || '[]') || []).map(f => `[IMG]${publicUrl}${mercado.URL_DIR}${f}[/IMG]`);
  const precio = r.precio == null ? 'A convenir' : `${r.moneda === 'ARS' || !r.moneda ? '$' : r.moneda + ' '}${Number(r.precio).toLocaleString('es-AR')}`;
  return [r.descripcion || '', '', `Precio: ${precio}`, r.zona ? `Zona: ${r.zona}` : null, r.condicion ? `Estado: ${r.condicion}` : null, '',
    ...fotos, '', `[URL=${publicUrl}/app?mercado=${r.id}]Ver en el Marketplace de CV Chat[/URL]`].filter(x => x !== null).join('\n');
}
const tituloForo = r => (r.estado === 'vendida' ? '[VENDIDO] ' : r.estado === 'borrada' ? '[YA NO ESTÁ] ' : '') + r.titulo;
async function llevar() {
  const filas = db.prepare(`SELECT m.* FROM puente_mercado m JOIN puente_foro f ON f.haven_user_id = m.user_id
    WHERE (m.foro_nodo IS NULL AND m.origen = 'cv' AND m.estado = 'activa' AND m.oculta = 0) OR (m.foro_nodo IS NOT NULL AND (m.foro_hash IS NULL OR m.foro_hash != ''))`).all();
  for (const r of filas) {
    const h = hashDe(r);
    if (r.foro_nodo && r.foro_hash === h) continue;
    const id = foroDe(r.user_id);
    if (!id) continue;
    try {
      if (!r.foro_nodo) {
        const d = await servicio.servicio('/tema', { id, titulo: tituloForo(r), texto: textoForo(r) });
        db.prepare('UPDATE puente_mercado SET foro_nodo = ?, foro_url = ?, foro_hash = ? WHERE id = ?').run(d.nodo, d.url, h, r.id);
        log(`foro: marketplace -> tejemanejes: "${r.titulo}"`);
      } else {
        await servicio.servicio('/editar', { id, nodo: r.foro_nodo, titulo: tituloForo(r), texto: textoForo(r) });
        db.prepare('UPDATE puente_mercado SET foro_hash = ? WHERE id = ?').run(h, r.id);
      }
    } catch (err) {
      // Un tema del foro que no es de esta cuenta (o ya no esta): no se vuelve a intentar
      if (/403|404/.test(err.message)) db.prepare('UPDATE puente_mercado SET foro_hash = ? WHERE id = ?').run(h, r.id);
      warn(`foro: marketplace -> tejemanejes "${r.titulo}":`, err.message);
    }
  }
}

async function vuelta() {
  if (andando) return;
  andando = true;
  try {
    const d = await servicio.servicio('/tejemanejes?desde=0');
    await traer(d.temas);
    await llevar();
  } catch (err) { warn('foro: marketplace y tejemanejes:', err.message); }
  andando = false;
}

module.exports = { setup, _test: { precioDe, plano, numero } };
