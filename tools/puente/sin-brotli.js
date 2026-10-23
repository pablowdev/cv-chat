// Sin Brotli: una falla de Node.js (CVE-2026-111497, corregida en Node 22.23.4) deja que una pagina
// mande una respuesta comprimida con Brotli armada a proposito para correr codigo en el servidor. Haven
// pide paginas de afuera para las vistas previas de los enlaces, asi que cualquiera que pegue un
// enlace podria usarla. Haven 4.26.4 lo arregla igual que aca; hasta actualizar:
//  - ningun pedido a otro sitio (http/https de Node y fetch) ofrece Brotli: los sitios mandan gzip;
//  - si un sitio lo manda igual sin que se lo pidan, no se descomprime: ese pedido falla.
// Se carga antes que Haven (cargar.js). No cambia nada de lo que el servidor manda a los navegadores.

const zlib = require('zlib');
const http = require('http');
const https = require('https');
const { Transform } = require('stream');

const AVISO = 'Brotli desactivado en el servidor (CVE-2026-111497)';

const sinBr = (valor) => String(valor).split(',').map(s => s.trim()).filter(s => s && !/^br(?:\s*;|$)/i.test(s)).join(', ') || 'identity';

function limpiar(headers) {
  if (!headers || typeof headers !== 'object' || Array.isArray(headers)) return;
  for (const k of Object.keys(headers)) if (k.toLowerCase() === 'accept-encoding') headers[k] = sinBr(headers[k]);
}

for (const mod of [http, https]) {
  for (const fn of ['request', 'get']) {
    const orig = mod[fn];
    mod[fn] = function (...args) {
      for (const a of args) if (a && typeof a === 'object' && !(a instanceof URL)) limpiar(a.headers);
      return orig.apply(this, args);
    };
  }
}

if (typeof globalThis.fetch === 'function') {
  const origFetch = globalThis.fetch;
  globalThis.fetch = function (input, init) {
    const base = init && init.headers ? init.headers : (input && typeof input === 'object' && input.headers) || undefined;
    const headers = new Headers(base);
    headers.set('accept-encoding', headers.has('accept-encoding') ? sinBr(headers.get('accept-encoding')) : 'gzip, deflate');
    return origFetch.call(this, input, { ...(init || {}), headers });
  };
}

zlib.createBrotliDecompress = function () {
  return new Transform({ transform(chunk, enc, cb) { cb(new Error(AVISO)); } });
};
zlib.brotliDecompress = function (buf, opts, cb) {
  const done = typeof opts === 'function' ? opts : cb;
  process.nextTick(() => done(new Error(AVISO)));
};
zlib.brotliDecompressSync = function () { throw new Error(AVISO); };
