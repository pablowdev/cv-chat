// Arma la web: cada pagina (paginas/*.html, solo el contenido) con la misma cabecera, menu y pie.
// Uso: node armar.js <carpeta de salida>
const fs = require('fs'), path = require('path');
const CHAT = 'https://chat.circulovicioso.club', FORO = 'https://foro.circulovicioso.club';
const out = process.argv[2] || path.join(__dirname, 'listo');
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const NAV = [['inicio', 'Inicio', '/'], ['wiki', 'Wiki', '/wiki'], ['fullfat', 'Full Fat Search', '/full-fat-search'],
  ['marketplace', 'Marketplace', '/marketplace'],
  ['foro', 'Foro', FORO + '/', true], ['chat', 'Chat', CHAT + '/app', true]];

function pagina({ titulo, descripcion, actual, css = [], js = [], cuerpo, canonica, sinIndice, imagen }) {
  const desc = descripcion || 'Círculo Vicioso: club de amigos, comunidad online, rejunto de gordos.';
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titulo)}</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:title" content="${esc(titulo)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${esc(imagen || 'https://circulovicioso.club/images/social-img-3.png')}">${imagen ? '\n<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">' : ''}
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary_large_image">
${canonica ? `<link rel="canonical" href="https://circulovicioso.club${canonica}">\n` : ''}${sinIndice ? '<meta name="robots" content="noindex">\n' : ''}<link rel="icon" href="/images/favicon.png">
<link rel="apple-touch-icon" href="/images/webclip.png">
<meta name="theme-color" content="#211c1f">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Mono:ital,wght@0,400;0,700;1,400&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/css/cv.css">
${css.map(c => `<link rel="stylesheet" href="${c}">`).join('\n')}
<link rel="stylesheet" href="${CHAT}/puente/barra.css"><script src="${CHAT}/puente/barra.js" defer></script>
${js.map(j => `<script src="${j}" defer></script>`).join('\n')}
</head>
<body>
<a class="saltar" href="#contenido">Ir al contenido</a>
<div class="envoltura">
  <header class="cab">
    <div class="cab__marca">
      <a class="cab__logo" href="/" aria-label="Círculo Vicioso, inicio"><img src="/images/wordmark_cv.svg" alt="Círculo Vicioso" width="528" height="64"></a>
      <div class="cab__degrade" aria-hidden="true"></div>
    </div>
    <nav class="nav" aria-label="Secciones">
${NAV.map(([k, t, href, ext]) => `      <a href="${href}"${k === actual ? ' aria-current="page"' : ''}>${t}${ext ? ' <span class="ext">↗</span>' : ''}</a>`).join('\n')}
    </nav>
  </header>
  <main id="contenido">
${cuerpo.trim()}
  </main>
  <footer class="pie">
    <span>Círculo Vicioso Club</span>
    <nav><a href="/descargar">La app</a><a href="/legal">Privacidad</a><a href="mailto:circuloviciosomedia@gmail.com">Contacto</a></nav>
  </footer>
</div>
</body>
</html>
`;
}

// Las paginas de antes que ya no estan: van a donde corresponde
const redirige = (to, title) => `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>${title} - Círculo Vicioso Club</title>
<meta http-equiv="refresh" content="0;url=${to}"><script>location.replace(${JSON.stringify(to)} + (${JSON.stringify(to)}.indexOf('?') < 0 ? location.search : ''))</script></head>
<body style="background:#211c1f;color:#f3f7e2;font-family:monospace;padding:2rem"><p><a href="${to}" style="color:#ee2d6f">${title}</a></p></body></html>\n`;
const VIEJAS = {
  'log-in.html': [`${CHAT}/?volver=https%3A%2F%2Fcirculovicioso.club%2F`, 'Iniciar sesión'],
  'tu-cuenta/logueate.html': [`${CHAT}/?volver=https%3A%2F%2Fcirculovicioso.club%2F`, 'Iniciar sesión'],
  'sign-up.html': [`${CHAT}/?registro=1&volver=https%3A%2F%2Fcirculovicioso.club%2F`, 'Crear una cuenta'],
  'tu-cuenta/registrate.html': [`${CHAT}/?registro=1&volver=https%3A%2F%2Fcirculovicioso.club%2F`, 'Crear una cuenta'],
  'acceso-denegado.html': [`${CHAT}/?volver=https%3A%2F%2Fcirculovicioso.club%2F`, 'Iniciar sesión'],
  'user-account.html': ['/cuenta', 'Tu cuenta'], 'tu-cuenta/vos.html': ['/cuenta', 'Tu cuenta'], 'update-password.html': ['/cuenta', 'Tu cuenta'],
  'reset-password.html': [`${CHAT}/puente/olvide`, 'Recuperar la contraseña'],
  'aporta-un-articulo.html': ['/wiki?aportar=1', 'Aportar a la wiki'],
  'tienda.html': ['/', 'Círculo Vicioso'], 'comprar-merch.html': ['/', 'Círculo Vicioso'], 'detail_productos.html': ['/', 'Círculo Vicioso'],
};

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
for (const d of ['css', 'js', 'images', 'fonts']) fs.cpSync(path.join(__dirname, d), path.join(out, d), { recursive: true });
const PAGINAS = require('./paginas/paginas.js');
for (const [archivo, p] of Object.entries(PAGINAS)) {
  const cuerpo = fs.readFileSync(path.join(__dirname, 'paginas', p.fuente), 'utf8');
  fs.writeFileSync(path.join(out, archivo), pagina({ ...p, cuerpo }));
}
for (const [archivo, [to, t]] of Object.entries(VIEJAS)) {
  fs.mkdirSync(path.dirname(path.join(out, archivo)), { recursive: true });
  fs.writeFileSync(path.join(out, archivo), redirige(to, t));
}
// ediciones.html?articulo=x -> /wiki/x?editar=1
fs.writeFileSync(path.join(out, 'ediciones.html'), `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>Wiki - Círculo Vicioso Club</title>
<script>var a=new URLSearchParams(location.search).get('articulo');location.replace(a?'/wiki/'+encodeURIComponent(a)+'?editar=1':'/wiki')</script></head><body></body></html>\n`);
console.log('listo:', Object.keys(PAGINAS).length, 'paginas y', Object.keys(VIEJAS).length + 1, 'direcciones viejas en', out);
