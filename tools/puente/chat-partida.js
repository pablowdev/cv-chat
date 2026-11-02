// El chat de una partida (Funball, Ajedrez y GlobalSiege; el Truco tiene el suyo, igual): para que
// los que juegan hablen mientras juegan. Es temporal: vive solo dentro de la partida (en su fila de
// puente_*_mesas) y se borra con ella cuando se cierra la mesa (una hora despues de terminar). No va
// a ningun otro lado ni queda en ningun historial.
const MAX = 60;

// Agrega un mensaje de "quien" (el lugar en la mesa o el id de la persona). Devuelve el error o null
function chatear(g, quien, texto) {
  const text = String(texto || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 200);
  if (!text) return 'Escribí algo.';
  const now = Date.now();
  g.chatT = g.chatT || {};
  if (now - (g.chatT[quien] || 0) < 700) return 'Más despacio.';
  g.chatT[quien] = now;
  g.chat = (g.chat || []).concat({ de: quien, text, t: now }).slice(-MAX);
  return null;
}

// Los mensajes como los ve cada uno: mio (si lo mando el), quien (el nombre) y color (opcional)
function mensajes(g, yo, nombre) {
  return (g.chat || []).map(m => ({ mio: m.de === yo, text: m.text, t: m.t, ...nombre(m.de) }));
}

module.exports = { chatear, mensajes };
