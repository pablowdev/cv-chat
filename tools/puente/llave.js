// Llave de CV Chat: la conexion en vivo (socket.io, por donde pasan los mensajes) solo se abre desde
// la pagina de CV Chat (la web, la app de Android y la de Windows, que son esa misma pagina). Otros
// programas que hablan con el servidor (la app de Haven de Google Play, la de escritorio de Haven,
// otras apps) no la traen y no se conectan, aunque cambien como se identifican.
//
//  - La llave se arma sola la primera vez (puente_llave) y va en /puente/tema-fijo.js, que corre
//    antes que Haven: al crear la conexion, Haven la manda junto con la sesion (auth.puente).
//  - Las primeras horas despues de prenderla todavia entran las conexiones sin llave (las pestañas
//    que ya estaban abiertas, hasta que se recargan solas) y quedan anotadas en el registro.

const crypto = require('crypto');

const GRACIA_MS = 6 * 3600 * 1000;

let llave = null;

function setup({ db, io, log, appName, publicUrl }) {
  // La llave viaja en /puente/tema-fijo.js, que solo se pone en la pagina con el tema fijo
  if (process.env.PUENTE_TEMA_FIJO !== '1') { log('llave: apagada (sin PUENTE_TEMA_FIJO)'); return; }
  db.exec(`CREATE TABLE IF NOT EXISTS puente_llave (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    valor TEXT NOT NULL,
    desde INTEGER NOT NULL
  )`);
  let row = db.prepare('SELECT valor, desde FROM puente_llave WHERE id = 1').get();
  if (!row) {
    row = { valor: crypto.randomBytes(24).toString('hex'), desde: Date.now() };
    db.prepare('INSERT INTO puente_llave (id, valor, desde) VALUES (1, ?, ?)').run(row.valor, row.desde);
  }
  llave = row.valor;
  const hasta = row.desde + GRACIA_MS;
  const anotados = new Set();
  const mensaje = () => `Para usar ${appName()}, entrá desde la web o la app de ${appName()}: ${publicUrl || ''}/puente/descargar`;

  io.use((socket, next) => {
    const auth = socket.handshake.auth || {};
    if (typeof auth.puente === 'string' && auth.puente.length === llave.length &&
        crypto.timingSafeEqual(Buffer.from(auth.puente), Buffer.from(llave))) return next();
    const ua = String(socket.handshake.headers['user-agent'] || '').slice(0, 160);
    if (Date.now() < hasta) {
      if (!anotados.has(ua)) { anotados.add(ua); log('llave: entra sin llave (todavia se deja):', ua); }
      return next();
    }
    if (!anotados.has('x' + ua)) { anotados.add('x' + ua); log('llave: no entra (sin llave):', ua); }
    next(new Error(mensaje()));
  });
  log(Date.now() < hasta ? `llave: las conexiones sin llave entran hasta ${new Date(hasta).toISOString()}` : 'llave: solo entran las conexiones de CV Chat');
}

// Va en /puente/tema-fijo.js: cuando carga socket.io (window.io), cada conexion lleva la llave
function script() {
  if (!llave) return '';
  return `(function(){var K=${JSON.stringify(llave)},real;` +
    `function envolver(f){if(typeof f!=='function'||f.__puente)return f;` +
      `var w=function(u,o){if(u&&typeof u==='object'){o=u;u=undefined;}o=o||{};var a=o.auth;` +
        `if(typeof a==='function'){o.auth=function(cb){a(function(d){d=d||{};d.puente=K;cb(d);});};}else{a=a||{};a.puente=K;o.auth=a;}` +
        `return u===undefined?f(o):f(u,o);};` +
      `for(var k in f)w[k]=f[k];['Manager','Socket','io','connect','protocol'].forEach(function(k){if(f[k]!==undefined)w[k]=f[k];});` +
      `w.__puente=1;return w;}` +
    `try{Object.defineProperty(window,'io',{configurable:true,get:function(){return real;},set:function(v){real=envolver(v);}});}catch(e){}})();`;
}

module.exports = { setup, script };
