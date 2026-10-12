// Engancha el puente Discord <-> Haven (puente.js) al arranque de Haven sin
// modificar sus archivos. Se carga con NODE_OPTIONS=--require /tools/puente/cargar.js.
//
// Haven llama a initFerry({ db, io, ... }) cuando su capa de sockets ya esta
// lista. Envolvemos esa funcion para recibir los mismos `db` e `io` que usa
// Haven, y arrancamos el puente justo despues.

const Module = require('module');
const path = require('path');

const FERRY_PATH = path.resolve('/app/src/ferry.js');
const origLoad = Module._load;
let hooked = false;

Module._load = function (request, parent, isMain) {
  const exported = origLoad.apply(this, arguments);
  if (!hooked && exported && typeof exported.initFerry === 'function') {
    let resolved = null;
    try { resolved = Module._resolveFilename(request, parent, isMain); } catch { /* no es un archivo */ }
    if (resolved === FERRY_PATH) {
      hooked = true;
      Module._load = origLoad; // ya no hace falta mirar mas requires
      const initFerry = exported.initFerry;
      exported.initFerry = function (deps) {
        const result = initFerry.apply(this, arguments);
        try {
          require('./puente.js').start(deps);
        } catch (err) {
          console.error('[puente] no pudo arrancar:', err);
        }
        return result;
      };
    }
  }
  return exported;
};
