// PARCHE: Haven corta cualquier conexion tras 2 min sin actividad (server.timeout),
// y la busqueda de mensajes del importador de Discord no envia nada hasta terminar,
// asi que las tandas grandes fallan con "Unexpected end of JSON input".
// Esto amplia el limite a 30 min SOLO para /api/import/discord/*.
// Se carga con NODE_OPTIONS=--require; no depende de la version de Haven.
const http = require('http');
const IMPORT_TIMEOUT_MS = 30 * 60 * 1000;
const origEmit = http.Server.prototype.emit;
http.Server.prototype.emit = function (event, req, ...rest) {
  if (event === 'request' && req && typeof req.url === 'string' && req.url.startsWith('/api/import/discord/')) {
    req.socket.setTimeout(IMPORT_TIMEOUT_MS);
  }
  return origEmit.call(this, event, req, ...rest);
};
