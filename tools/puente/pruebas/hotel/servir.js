// Servidor local para ver CV Hotel sin CV Chat: sirve web/hotel/ como lo va a servir vincular.js
// (juego.html sin prefijo y con la CSP del plan, el resto en /puente/hotel/v/<huella>/...), el
// catalogo del servidor falso y la pagina de prueba (pruebas/hotel/prueba.html), que hace de
// ventana de CV Chat con el socket falso de falso.js.
//
//   node tools/puente/pruebas/hotel/servir.js [puerto]
//   -> http://localhost:8765/prueba/prueba.html            (el hotel con gente de mentira)
//      http://localhost:8765/prueba/prueba.html?demo=...   (principal, mueble, bienvenida, salas, catalogo)
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { crearFalso } = require('./falso.js');

const WEB = path.resolve(__dirname, '../../web/hotel');
const PRUEBAS = __dirname;
const PUERTO = process.argv[2] == null ? 8765 : Number(process.argv[2]); // 0: uno libre
const HUELLA = 'dev';
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; media-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'";
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.wav': 'audio/wav', '.json': 'application/json' };
const catalogo = JSON.stringify(crearFalso({ temporizar: () => 0 }).catalogo());

function dentro(base, rel) {
  const p = path.resolve(base, '.' + path.sep + rel);
  return p.startsWith(base + path.sep) ? p : null;
}
function mandar(res, codigo, tipo, cuerpo, extra) {
  res.writeHead(codigo, Object.assign({ 'Content-Type': tipo, 'X-Content-Type-Options': 'nosniff' }, extra || {}));
  res.end(cuerpo);
}
function archivo(res, p, extra) {
  fs.readFile(p, (e, b) => {
    if (e) return mandar(res, 404, 'text/plain; charset=utf-8', 'No está.');
    mandar(res, 200, TIPOS[path.extname(p)] || 'application/octet-stream', b, extra);
  });
}

const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost');
  const r = decodeURIComponent(u.pathname);
  if (r === '/puente/hotel/juego.html' || r === '/puente/hotel/') {
    const html = fs.readFileSync(path.join(WEB, 'juego.html'), 'utf8').split('__V__').join(HUELLA);
    return mandar(res, 200, TIPOS['.html'], html, { 'Content-Security-Policy': CSP, 'Cache-Control': 'no-cache', 'X-Robots-Tag': 'noindex' });
  }
  let m = /^\/puente\/hotel\/v\/[a-z0-9]{1,40}\/(.+)$/.exec(r);
  if (m) {
    const p = dentro(WEB, m[1]);
    if (!p || /\.html$/.test(p)) return mandar(res, 404, 'text/plain; charset=utf-8', 'No está.');
    return archivo(res, p, { 'Cache-Control': 'no-cache' });
  }
  if (r === '/puente/api/hotel/catalogo') return mandar(res, 200, TIPOS['.json'], catalogo, { 'Cache-Control': 'no-cache' });
  m = /^\/prueba\/(.+)$/.exec(r);
  if (m) {
    if (m[1] === 'contrato.js' || m[1] === 'motor.js') return archivo(res, path.join(WEB, m[1]));
    const p = dentro(PRUEBAS, m[1]);
    if (!p || !/\.(html|js|css)$/.test(p)) return mandar(res, 404, 'text/plain; charset=utf-8', 'No está.');
    return archivo(res, p, { 'Cache-Control': 'no-cache' });
  }
  if (r === '/') { res.writeHead(302, { Location: '/prueba/prueba.html' }); return res.end(); }
  mandar(res, 404, 'text/plain; charset=utf-8', 'No está.');
});
srv.listen(PUERTO, '127.0.0.1', () => console.log('CV Hotel de prueba: http://localhost:' + srv.address().port + '/prueba/prueba.html'));
