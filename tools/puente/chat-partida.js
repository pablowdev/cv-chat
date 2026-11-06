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

// ── El zumbido (como el del Messenger): para avisarle al que le toca que juegue ──
// Le sacude la pantalla y, si no tiene CV Chat delante, le llega al celular. Queda en el chat. Para que nadie
// lo use para molestar: solo cuando le toca a otro y hace 20 segundos que no juega, uno por minuto, como
// mucho 3 por turno y 10 por hora por persona entre todas sus partidas
const zumbidos = new Map(); // "id:user" -> { k, n, at }: los de cada uno en el turno de ahora
const porHora = new Map(); // user -> los de la ultima hora

// Desde cuando le toca al que le toca (cada juego lo llama al guardar la partida): uid y, si el mismo puede
// jugar varias veces seguidas, algo que cambie con cada jugada
function turno(g, uid, jugada) {
  const k = uid + ':' + (jugada == null ? '' : jugada);
  if (!g.zt || g.zt.k !== k) g.zt = { k, at: Date.now() };
}

// o: { g, juego, titulo, url, yo, de (su nombre), quien (como figura en el chat), para (al que le toca; null
// si juega la compu), jugada, io, db, webpush }
function zumbar(o) {
  const g = o.g, now = Date.now();
  if (g.estado !== 'jugando') return { error: 'La partida no está en juego.' };
  if (!(o.para > 0)) return { error: 'Ahora juega la compu.' };
  if (o.para === o.yo) return { error: 'Te toca a vos.' };
  turno(g, o.para, o.jugada);
  const espera = 20e3 - (now - g.zt.at);
  if (espera > 0) return { error: `Dale un momento: podés mandar un zumbido en ${Math.ceil(espera / 1000)} segundos.` };
  const key = g.id + ':' + o.yo;
  let z = zumbidos.get(key);
  if (!z || z.k !== g.zt.k) z = { k: g.zt.k, n: 0, at: 0 };
  if (z.n >= 3) return { error: 'Ya mandaste 3 zumbidos en este turno. Esperá a que juegue.' };
  if (now - z.at < 60e3) return { error: `Esperá ${Math.ceil((60e3 - (now - z.at)) / 1000)} segundos para mandar otro zumbido.` };
  const hora = (porHora.get(o.yo) || []).filter(x => now - x < 3600e3);
  if (hora.length >= 10) return { error: 'Mandaste muchos zumbidos en la última hora. Probá más tarde.' };
  z.n++; z.at = now; zumbidos.set(key, z);
  hora.push(now); porHora.set(o.yo, hora);
  for (const [k, v] of zumbidos) if (now - v.at > 3600e3) zumbidos.delete(k);
  g.chat = (g.chat || []).concat({ de: o.quien, text: '📳 ¡Zumbido!', t: now }).slice(-MAX);
  let delante = false;
  for (const [, s] of o.io.sockets.sockets) {
    if (s.user && s.user.id === o.para) { try { s.emit('juego:zumbido', { juego: o.juego, id: g.id, de: o.de, titulo: o.titulo }); } catch { /* sesion cerrada */ } if (s.hasFocus !== false) delante = true; }
  }
  if (o.webpush && !delante) {
    const payload = JSON.stringify({ title: o.titulo, body: `${o.de} te mandó un zumbido: te toca jugar`, url: o.url, tag: o.juego + '-zumbido-' + g.id, __puente: 1 });
    for (const sub of o.db.prepare('SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?').all(o.para)) {
      o.webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, { TTL: 120, urgency: 'high' }).catch(() => {});
    }
  }
  return { ok: true, quedan: 3 - z.n };
}

module.exports = { chatear, mensajes, turno, zumbar };
