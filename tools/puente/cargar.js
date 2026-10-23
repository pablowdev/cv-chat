// Engancha el puente Discord <-> Haven (puente.js) al arranque de Haven sin
// modificar sus archivos. Se carga con NODE_OPTIONS=--require /tools/puente/cargar.js.
//
// Haven llama a initFerry({ db, io, ... }) cuando su capa de sockets ya esta
// lista. Envolvemos esa funcion para recibir los mismos `db` e `io` que usa
// Haven, y arrancamos el puente justo despues.
//
// Ademas, los nombres para mostrar: Haven solo acepta de 2 a 20 caracteres con
// letras, numeros, espacios y "_". Aca se aceptan los mismos que en Discord: de
// 1 a 32 caracteres, cualquiera (sin caracteres de control). Se reemplaza su
// normalizeDisplayName (socketHandlers/helpers.js) antes de que lo use nadie.
// Haven escapa los nombres al mostrarlos (los de Discord ya llegaban asi en los
// mensajes importados).

// Antes que nada: sin Brotli para lo que llega de afuera (sin-brotli.js), solo con un Node.js que
// todavia tiene la falla (anterior a 22.23.4; Haven 4.26.4 ya viene con uno corregido)
if (require('./sin-brotli-hace-falta.js')()) require('./sin-brotli.js');

const Module = require('module');
const path = require('path');

const FERRY_PATH = path.resolve('/app/src/ferry.js');
const HELPERS_PATH = path.resolve('/app/src/socketHandlers/helpers.js');
const origLoad = Module._load;
let ferryHooked = false, namesHooked = false;

const NAME_ERROR = 'El nombre tiene que tener entre 1 y 32 caracteres';
function discordLikeName(raw) {
  if (typeof raw !== 'string') return { error: NAME_ERROR };
  const value = raw.normalize('NFC').replace(/\p{Cc}/gu, '').trim();
  const length = [...value].length;
  if (length < 1 || length > 32) return { error: NAME_ERROR };
  return { value };
}

Module._load = function (request, parent, isMain) {
  const exported = origLoad.apply(this, arguments);
  if (!exported || (typeof exported.initFerry !== 'function' && typeof exported.normalizeDisplayName !== 'function')) return exported;
  let resolved = null;
  try { resolved = Module._resolveFilename(request, parent, isMain); } catch { /* no es un archivo */ }
  if (!namesHooked && resolved === HELPERS_PATH && typeof exported.normalizeDisplayName === 'function') {
    namesHooked = true;
    exported.normalizeDisplayName = discordLikeName;
  }
  if (!ferryHooked && resolved === FERRY_PATH && typeof exported.initFerry === 'function') {
    ferryHooked = true;
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
  if (ferryHooked && namesHooked) Module._load = origLoad; // ya no hace falta mirar mas requires
  return exported;
};

module.exports = { discordLikeName };
