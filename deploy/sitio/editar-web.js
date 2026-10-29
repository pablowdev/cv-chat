// Cambios a la web exportada de Webflow (para volver a aplicarlos si se exporta de nuevo):
// la barra de la cuenta unica, sin Memberstack, sin tienda ni Discord en la portada, la wiki
// (tools/puente/web/wiki.js) y las paginas de cuenta viejas van a la cuenta unica.
// Uso: node editar-web.js <carpeta de la web> <direccion del chat>
const fs = require('fs'), path = require('path');
const [dir, CHAT] = process.argv.slice(2);
const all = [];
(function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) { if (!['css', 'js', 'fonts', 'images'].includes(f)) walk(p); } else if (f.endsWith('.html')) all.push(p); } })(dir);

const BARRA = `<link rel="stylesheet" href="${CHAT}/puente/barra.css"><script src="${CHAT}/puente/barra.js" defer></script>`;
const redirige = (to, title) => `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>${title} - Círculo Vicioso</title>
<meta http-equiv="refresh" content="0;url=${to}"><script>location.replace(${JSON.stringify(to)})</script></head><body style="background:#211c1f;color:#f3f7e2;font-family:monospace;padding:2rem">
<p><a href="${to}" style="color:#ee2d6f">${title}</a></p></body></html>\n`;
// Las paginas de cuenta de antes (Memberstack): ahora la cuenta unica
const CUENTA = {
  'log-in.html': [`${CHAT}/?volver=https%3A%2F%2Fcirculovicioso.club%2F`, 'Iniciar sesión'],
  'tu-cuenta/logueate.html': [`${CHAT}/?volver=https%3A%2F%2Fcirculovicioso.club%2F`, 'Iniciar sesión'],
  'sign-up.html': [`${CHAT}/?registro=1&volver=https%3A%2F%2Fcirculovicioso.club%2F`, 'Crear una cuenta'],
  'tu-cuenta/registrate.html': [`${CHAT}/?registro=1&volver=https%3A%2F%2Fcirculovicioso.club%2F`, 'Crear una cuenta'],
  'user-account.html': [`${CHAT}/puente/vincular`, 'Tu cuenta'],
  'tu-cuenta/vos.html': [`${CHAT}/puente/vincular`, 'Tu cuenta'],
  'reset-password.html': [`${CHAT}/puente/olvide`, 'Recuperar la contraseña'],
  'update-password.html': [`${CHAT}/puente/vincular`, 'Tu cuenta'],
  'acceso-denegado.html': [`${CHAT}/?volver=https%3A%2F%2Fcirculovicioso.club%2F`, 'Iniciar sesión'],
};

let n = 0;
for (const p of all) {
  const rel = path.relative(dir, p).replace(/\\/g, '/');
  if (CUENTA[rel]) { fs.writeFileSync(p, redirige(...CUENTA[rel])); n++; continue; }
  let s = fs.readFileSync(p, 'utf8'); const antes = s;
  // Los scripts que usaban Memberstack (votos de sugerencias, perfil): ya no hay Memberstack
  s = s.replace(/<script(?: type="text\/javascript")?>(?:(?!<\/script>)[\s\S])*?memberstack(?:(?!<\/script>)[\s\S])*?<\/script>/gi, '');
  s = s.replace(/<script data-memberstack-app="[^"]*" src="https:\/\/static\.memberstack\.com\/[^"]*" type="text\/javascript"><\/script>\s*/g, '');
  if (!s.includes('/puente/barra.js')) s = s.replace('</head>', BARRA + '</head>');
  // La wiki (wiki.js del puente): estas paginas se usan tambien en /wiki/<entrada>, /wiki-categorias/<cat>...
  const WIKI = ['index.html', 'wiki.html', 'detail_wiki.html', 'detail_wiki-categorias.html', 'aporta-un-articulo.html', 'ediciones.html'];
  if (WIKI.includes(rel) && !s.includes('/puente/wiki.js')) {
    if (rel !== 'index.html') s = s.replace(/<head>/, '<head><base href="/">');
    s = s.replace('</head>', `<link rel="stylesheet" href="${CHAT}/puente/wiki.css"><script src="${CHAT}/puente/wiki.js" defer></script></head>`);
  }
  // Las entradas de la wiki, con las direcciones de antes (/wiki/<entrada>)
  s = s.replace(/href="(\.\.\/)?wiki\.html"/g, 'href="/wiki"').replace(/href="(\.\.\/)?aporta-un-articulo\.html"/g, 'href="/aporta-un-articulo"');
  // Menu del costado de las paginas de adentro
  const up = rel.includes('/') ? '../' : '';
  s = s.replace(`<a href="${up}tienda.html" class="link">⭑ tienda</a>`, `<a href="https://foro.circulovicioso.club/" class="link">⭑ foro</a>\n                <a href="${CHAT}/app" class="link">⭑ chat</a>\n                <a href="${up}full-fat-search.html" class="link">⭑ episodios</a>`);
  s = s.replace(`<a href="${up}tu-cuenta/vos.html" class="link">[+] visitá tu perfil</a>`, `<a href="${CHAT}/puente/vincular" class="link">[+] tu cuenta</a>`);
  if (rel === 'index.html') {
    // Pestañas: sin tienda ni "comunidad"; foro, chat y episodios van directo
    const tab = (t, href) => `<a href="${href}" class="tab w-inline-block">\n                <div>${t}</div>\n              </a>`;
    s = s.replace(/\s*<a data-w-tab="Comunidad" class="tab w-inline-block w-tab-link">\s*<div>comunidad<\/div>\s*<\/a>/, '\n              ' + tab('foro', 'https://foro.circulovicioso.club/') + '\n              ' + tab('chat', `${CHAT}/app`) + '\n              ' + tab('episodios', 'full-fat-search.html'));
    s = s.replace(/\s*<a data-w-tab="Tienda" class="tab w-inline-block w-tab-link">\s*<div>tienda<\/div>\s*<\/a>/, '');
    s = s.replace(/\s*<div data-w-tab="Comunidad" class="tab-pane w-tab-pane">[\s\S]*?<\/a>\s*<\/div>(?=\s*<div data-w-tab="RRSS")/, '');
    s = s.replace(/\s*<div data-w-tab="Tienda" class="tab-pane w-tab-pane">[\s\S]*?\[\+\] acceder a la tienda<\/a>\s*<\/div>/, '');
    // Los accesos directos se ven igual que las pestañas
    s = s.replace('</head>', '<style>.w-tab-menu > a.tab:not(.w-tab-link){position:relative;padding-top:9px;padding-bottom:9px;text-decoration:none;vertical-align:top}@media (max-width:479px){.w-tab-menu > a.tab:not(.w-tab-link){display:block}}</style></head>');
    // El mail, que estaba en "comunidad", pasa a "rrss"
    s = s.replace(/(<div data-w-tab="RRSS" class="w-tab-pane">[\s\S]*?tiktok<\/div>\s*<\/div>\s*<\/a>)/, `$1
                <a href="mailto:circuloviciosomedia@gmail.com" class="link-wrapper w-inline-block">
                  <div class="row is-small align-left">
                    <div class="caption">escribinos un mail</div>
                  </div>
                </a>`);
    for (const must of ['>foro</div>', '>chat</div>', '>episodios</div>', 'escribinos un mail']) if (!s.includes(must)) throw new Error('index: falta ' + must);
    for (const not of ['data-w-tab="Tienda"', 'data-w-tab="Comunidad"', '/discord"', 'acceder a la tienda']) if (s.includes(not)) throw new Error('index: quedo ' + not);
  }
  if (s !== antes) { fs.writeFileSync(p, s); n++; }
}
console.log('paginas cambiadas:', n, 'de', all.length);
