// El desafio del dia (la pantalla de inicio de quien entra como invitado, aviso.js): un juego que tiene compu, que cambia
// cada dia (de Argentina), y quienes con cuenta ya le ganaron hoy a la compu en ese juego.
//
//   GET /puente/api/juegos/desafio   (con la sesion del chat, invitados tambien)
//     -> { dia, juego: { id, nombre, param, imagen } | null, ganadores: [{ nombre, avatar, victorias, primera }], total }
//
// Los juegos y sus partidas salen de sus fichas (juegos-registro.js conChat: "partidas.leer", la misma forma para
// todos: { compu, humanos, ganador, fin }). Entran los que alguna vez tuvieron una partida contra la compu. Las de los
// invitados no se guardan (ningun juego las anota), asi que la lista es solo de gente con cuenta.
'use strict';

let db = null, warn = () => {};
const AR = 3 * 3600e3; // Argentina: UTC-3 todo el año
let guardado = { at: 0, d: null };

function setup(ctx) { db = ctx.db; warn = ctx.warn || warn; }

const diaAR = (ms) => new Date(ms - AR).toISOString().slice(0, 10);

function calcular() {
  const ahora = Date.now(), dia = diaAR(ahora), desde = Date.parse(dia + 'T00:00:00Z') + AR;
  let js = [];
  try { js = require('./juegos-registro.js').conChat().filter((x) => x.chat.partidas && x.ficha.enlace); } catch (err) { warn('desafio: registro:', err.message); }
  const conCompu = [], partidas = new Map();
  for (const x of js) {
    let ps = [];
    try { ps = x.chat.partidas.leer() || []; } catch { continue; } // (sin su tabla todavia)
    if (ps.some((p) => p && p.compu)) { conCompu.push(x); partidas.set(x.ficha.id, ps); }
  }
  if (!conCompu.length) return { dia, juego: null, ganadores: [], total: 0 };
  // el del dia: uno distinto cada dia, en el orden de las fichas
  conCompu.sort((a, b) => a.ficha.orden - b.ficha.orden || a.ficha.id.localeCompare(b.ficha.id));
  const n = Math.floor((desde - AR) / 86400e3);
  const f = conCompu[((n % conCompu.length) + conCompu.length) % conCompu.length].ficha;
  // quienes le ganaron hoy a la compu (el primero que lo logro, primero)
  const porGanador = new Map();
  for (const p of partidas.get(f.id)) {
    if (!p || !p.compu || !(p.fin >= desde) || !(p.ganador > 0) || !(p.humanos || []).includes(p.ganador)) continue;
    const g = porGanador.get(p.ganador) || { id: p.ganador, victorias: 0, primera: p.fin };
    g.victorias++;
    if (p.fin < g.primera) g.primera = p.fin;
    porGanador.set(p.ganador, g);
  }
  const q = db.prepare('SELECT COALESCE(display_name, username) nombre, avatar FROM users WHERE id = ? AND COALESCE(is_guest, 0) = 0');
  const ganadores = [...porGanador.values()].sort((a, b) => a.primera - b.primera)
    .map((g) => { const u = q.get(g.id); return u ? { nombre: u.nombre, avatar: u.avatar || null, victorias: g.victorias, primera: g.primera } : null; })
    .filter(Boolean);
  return { dia, juego: { id: f.id, nombre: f.nombre, param: f.enlace.param, imagen: f.enlace.imagen || null }, ganadores: ganadores.slice(0, 12), total: ganadores.length };
}

async function handle(req, res, p, u, h) {
  if (p !== '/puente/api/juegos/desafio') return false;
  if (req.method !== 'GET') return h.json(res, 405, { error: 'metodo' });
  if (!h.sessionUser(req)) return h.json(res, 401, { error: 'sin sesion' });
  // (se arma como mucho cada 2 minutos: lee las partidas de los juegos; al cambiar el dia, de nuevo)
  if (!guardado.d || Date.now() - guardado.at > 120e3 || guardado.d.dia !== diaAR(Date.now())) {
    try { guardado = { at: Date.now(), d: calcular() }; } catch (err) { warn('desafio:', err.message); if (!guardado.d) return h.json(res, 500, { error: 'No se pudo armar el desafío.' }); }
  }
  return h.json(res, 200, guardado.d);
}

module.exports = { setup, handle, _calcular: calcular };
