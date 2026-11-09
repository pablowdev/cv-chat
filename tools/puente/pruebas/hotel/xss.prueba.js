// XSS de verdad, en un navegador: levanta servir.js en un puerto libre y abre la pagina de prueba
// con ?demo=xss en Chrome sin ventana. Ahi una sala se llama 'Sala <img src=x onerror=...>', una
// persona se llama igual, su frase y lo que dice tambien: nada se tiene que ejecutar, no tiene que
// aparecer ningun <img> en el hotel y el nombre tiene que verse como texto.
// Tambien revisa la CSP con la que se sirve juego.html.
// Si no hay Chrome, avisa y no falla. Correr: node xss.prueba.js
'use strict';
const { spawn, execFile } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { describir, prueba, fin, assert } = require('./arnesAsincrono.js');

const CHROMES = [
  process.env.CHROME,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);
const chrome = CHROMES.find((p) => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } });

function levantar() {
  return new Promise((ok, mal) => {
    const s = spawn(process.execPath, [path.join(__dirname, 'servir.js'), '0'], { stdio: ['ignore', 'pipe', 'inherit'] });
    let buf = '';
    s.stdout.on('data', (d) => { buf += d; const m = /localhost:(\d+)/.exec(buf); if (m) ok({ s, puerto: Number(m[1]) }); });
    s.on('error', mal);
    setTimeout(() => mal(new Error('el servidor de prueba no arranco')), 8000);
  });
}
function cabeceras(url) {
  return new Promise((ok, mal) => http.get(url, (r) => { r.resume(); ok(r.headers); }).on('error', mal));
}
function dom(url) {
  const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'cvhotel-xss-'));
  return new Promise((ok) => {
    execFile(chrome, ['--headless=new', '--disable-gpu', '--no-first-run', '--user-data-dir=' + perfil, '--window-size=1000,800', '--virtual-time-budget=12000', '--dump-dom', url],
      { maxBuffer: 20 * 1024 * 1024, timeout: 90000 }, (e, out) => { try { fs.rmSync(perfil, { recursive: true, force: true }); } catch (x) { /* queda */ } ok(String(out || '')); });
  });
}

describir('XSS', () => {
  if (!chrome) {
    prueba('(no hay Chrome: esta prueba no se corrio)', () => { console.log('AVISO: no encontre Chrome; seteá CHROME=ruta para correrla'); });
    return;
  }
  let srv = null;
  prueba('levanta el servidor de prueba', async () => { srv = await levantar(); assert.ok(srv.puerto > 0); });
  prueba('juego.html sale con la CSP del plan (script-src self, sin unsafe-inline para scripts)', async () => {
    const h = await cabeceras('http://127.0.0.1:' + srv.puerto + '/puente/hotel/juego.html');
    const csp = h['content-security-policy'] || '';
    assert.ok(/script-src 'self'(;|$)/.test(csp), csp);
    assert.ok(/object-src 'none'/.test(csp) && /base-uri 'none'/.test(csp) && /frame-ancestors 'self'/.test(csp), csp);
  });
  prueba('un nombre de sala <img onerror> (y gente, frase y charla) no ejecuta nada', async () => {
    const html = await dom('http://127.0.0.1:' + srv.puerto + '/prueba/prueba.html?demo=xss');
    const m = /id="estado"[^>]*>([^<]*)</.exec(html);
    assert.ok(m, 'la pagina de prueba no termino');
    const estado = m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
    assert.ok(/^XSS BIEN/.test(estado), estado);
  });
  prueba('apaga el servidor', () => { if (srv) srv.s.kill(); assert.ok(true); });
});

fin();
