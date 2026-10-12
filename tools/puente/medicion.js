// Medicion temporal (PUENTE_MEDIR=1): cuanto tarda Haven en contestar al abrir
// un canal (get-messages -> message-history) y cuanto ocupa la respuesta.
// Escribe en /tools/tiempos.log. Solo mide, no cambia nada.

const fs = require('fs');
const LOG = '/tools/tiempos.log';

function setup({ io, db }) {
  if (process.env.PUENTE_MEDIR !== '1') return;
  const nameOf = db.prepare('SELECT name FROM channels WHERE code = ?');
  io.on('connection', socket => {
    const pending = [];
    socket.use((packet, next) => {
      if (packet[0] === 'get-messages') pending.push({ t0: process.hrtime.bigint(), data: packet[1] || {} });
      next();
    });
    const emit = socket.emit.bind(socket);
    socket.emit = (event, payload, ...rest) => {
      if (event === 'message-history' && pending.length) {
        const p = pending.shift();
        const ms = Number(process.hrtime.bigint() - p.t0) / 1e6;
        let kb = 0;
        try { kb = Math.round(Buffer.byteLength(JSON.stringify(payload)) / 1024); } catch { /* */ }
        const ch = p.data.code ? (nameOf.get(p.data.code) || {}).name : '?';
        const kind = p.data.before ? 'anteriores' : p.data.around ? 'salto' : 'abrir';
        fs.appendFile(LOG, `${new Date().toISOString()} ${kind} #${ch}: ${ms.toFixed(0)} ms, ${(payload && payload.messages || []).length} mensajes, ${kb} KB\n`, () => {});
      }
      return emit(event, payload, ...rest);
    };
  });
}

module.exports = { setup };
