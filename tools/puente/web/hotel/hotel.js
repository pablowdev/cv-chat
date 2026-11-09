// CV Hotel (cliente). Va adentro de un iframe de CV Chat y usa su socket (window.parent.app.socket).
// Sale de index.module.js de PawHotel sin Firebase, sin login ni registro, sin idiomas y sin
// escrituras directas: todo pasa por los eventos de contrato.js y el servidor decide.
//
//   arranque: hotel:hola (la identidad viene del servidor) -> catalogo -> muñeco (si es la primera
//             vez, la bienvenida) -> hotel:entrar a la ultima sala o a la principal
//   window.cvHotel = { atras, cerrar, sala, irA }   (lo usa aviso.js: el boton de atras del chat)
import { crearTransporte, socketDelChat } from './src/red/transporte.js';
import { crearApi } from './src/red/api.js';
import { crearSalaEventos, armarSala, recalcularPuedo, aplicarMov, baldosaActual } from './src/red/salaEventos.js';
import { crearVista } from './src/ui/vista.js';
import { $, toast, prepararPaneles, prepararDialogo, abrirPanel, cerrarPanel, alternarPanel, cerrarUltimo, cerrarTodos, dialogoAbierto, cerrarDialogo, panelAbierto } from './src/ui/uiRuntime.js';
import { crearEscena } from './src/app/escena.js';
import { crearCatalogo } from './src/app/catalogo.js';
import { instalarChat } from './src/app/chat.js';
import { instalarNavegador } from './src/app/navegador.js';
import { instalarMochila } from './src/app/mochila.js';
import { instalarMuneco } from './src/app/muneco.js';
import { instalarFichas } from './src/app/fichas.js';
import { GESTOS_TXT } from './src/config/hotel.js';
import { alCargarImagenes, precargar } from './src/game/imagenes.js';

const C = window.HotelContrato;
const M = window.HotelMotor;
const raiz = $('hotel');
const parametros = new URLSearchParams(location.search);
const PRUEBA = parametros.get('prueba') === '1';

// ── Estado ──
const est = {
  yo: null, avatar: null, estadoTexto: '', config: {},
  sala: null,            // la sala local (ver salaEventos.armarSala)
  colocar: null,         // { fila, m, rot, mover }
  hover: null, hoverPared: null, hoverJugador: null,
  elegido: null,         // { tipo:'jugador'|'mueble', id }
  ultimaSala: null,
  listo: false,
};
let sucio = true;
const marcar = () => { sucio = true; };

// ── Red ──
const transporte = crearTransporte({ contrato: C, obtenerSocket: socketDelChat, alError: (e) => console.warn('hotel:', e) });
const api = crearApi(transporte, C);

// ── Pantalla ──
const canvas = $('lienzo');
const vista = crearVista({
  canvas,
  margenArriba: () => 54,
  margenAbajo: () => ($('abajo').offsetHeight || 100) + 4,
  alCambiar: marcar,
  alTocar: (x, y) => tocar(x, y),
  alMover: (x, y) => mover(x, y),
  alSalir: () => { est.hover = null; est.hoverJugador = null; marcar(); },
});
const escena = crearEscena({ canvas, vista, M });
const cat = crearCatalogo({ M });
// los muebles con imagen propia: cuando llega una imagen se vuelve a dibujar la sala
alCargarImagenes(marcar);
const precargarArte = () => { for (const f of cat.lista()) precargar(f.arte); };

const H = {
  C, M, api, est, vista, escena, cat, raiz,
  entrarA: (slug) => entrarA(slug),
  empezarColocar: (k) => empezarColocar(k),
  elegir: (x) => { est.elegido = x; marcar(); },
  alCambiarMuneco: () => { pintarMiMuneco(); marcar(); },
};
prepararPaneles();
prepararDialogo();
const chat = instalarChat(H);
const nav = instalarNavegador(H);
const mochila = instalarMochila(H);
const muneco = instalarMuneco(H);
const fichas = instalarFichas(H);
H.chat = chat;

// ── Avisos del servidor ──
const eventos = crearSalaEventos({
  C, M,
  sala: () => est.sala,
  yo: () => (est.yo ? est.yo.id : null),
  entrada: (c) => cat.entrada(c),
  g: {
    cambio: marcar,
    llega: (p) => { fichas.pintarGente(); if (p.u !== est.yo.id) chat.sistema(p.nombre + ' entró a la sala.'); },
    seVa: (p) => { fichas.pintarGente(); fichas.olvidar(p.u); chat.sistema(p.nombre + ' se fue.'); },
    jugador: () => fichas.pintarGente(),
    dijo: (msg, p) => chat.mostrar(msg, p),
    mueble: (m, rec) => { if (!rec) fichas.olvidarMueble(m); else fichas.refrescarMueble(m); if (est.colocar && est.colocar.mover && est.colocar.m === String(m) && !rec) terminarColocar(); },
    derechos: () => { pintarSala(); fichas.pintarGente(); },
    salaMeta: () => { escena.olvidarFondo(); pintarSala(); },
    borrado: () => chat.cargarHistorial(est.sala),
    fuera: (motivo, ms) => fuera(motivo, ms),
    inventarioCambio: (d) => mochila.cambio(d),
    aviso: (texto) => { toast(texto); chat.sistema(texto); },
    conteos: (c) => nav.conteos(c),
    catalogoCambio: (v) => { cat.cargar(v).then(() => { precargarArte(); escena.olvidarFondo(); mochila.pintar(); marcar(); }).catch(() => {}); },
  },
});
eventos.atar(transporte);

// ── Portada (cargando, afuera y errores) ──
function portada(texto, o) {
  o = o || {};
  const p = $('portada');
  p.hidden = false;
  p.classList.toggle('afuera', !!o.afuera);
  $('portada-txt').textContent = texto;
  $('portada-botones').hidden = !(o.salas || o.reintentar);
  $('b-portada-salas').hidden = !o.salas;
  $('b-portada-reintentar').hidden = !o.reintentar;
  $('b-portada-reintentar').textContent = o.reintentarTxt || 'Probar de nuevo';
  reintentar = o.reintentar || null;
}
let reintentar = null;
$('b-portada-reintentar').addEventListener('click', () => { if (reintentar) reintentar(); });
$('b-portada-salas').addEventListener('click', () => nav.abrir());

function afuera(texto) {
  est.sala = null;
  est.colocar = null; est.elegido = null;
  $('colocando').hidden = true;
  raiz.classList.add('afuera');
  $('b-sala-ajustes').hidden = true;
  $('sala-nombre').textContent = 'CV Hotel';
  $('sala-icono').textContent = '🏨';
  fichas.pintarGente();
  chat.limpiar();
  cerrarPanel('p-ficha'); cerrarPanel('p-mueble'); cerrarPanel('p-gente'); cerrarPanel('p-gestos');
  portada(texto || 'Elegí una sala para entrar.', { salas: true, afuera: true });
  marcar();
}

// ── Arranque ──
async function arrancar() {
  portada('Entrando al hotel…');
  if (!socketDelChat()) {
    portada('Abrí CV Hotel desde la sección Juegos de CV Chat.');
    return;
  }
  const r = await api.hola({});
  if (r.error) { portada(r.error, { reintentar: arrancar }); return; }
  est.yo = Object.assign({}, r.yo, { id: String(r.yo.id) });
  est.avatar = r.avatar || null;
  est.estadoTexto = r.estado || '';
  est.config = r.config || {};
  est.ultimaSala = r.ultimaSala || null;
  try { await cat.cargar(r.catalogoV); precargarArte(); } catch (e) { toast('No se pudo bajar el catálogo de muebles. Se van a ver cajas grises.', 'error'); }
  if (!est.avatar) {
    $('portada').hidden = true;
    await muneco.abrir({ bienvenida: true });
  }
  pintarMiMuneco();
  est.listo = true;
  const pedida = parametros.get('sala');
  const slug = C.slugValido(pedida) ? pedida : (est.ultimaSala || 'principal');
  await entrarA(slug);
}

async function entrarA(slug, volver) {
  if (!est.listo) return;
  if (!C.slugValido(slug)) { toast('Esa sala no existe.', 'error'); return; }
  if (!est.sala) portada('Entrando a la sala…');
  const d = { sala: slug };
  if (volver) d.volver = true;
  const r = await api.entrar(d);
  if (r.error) {
    toast(r.error, 'error');
    if (!est.sala) { afuera(r.error); nav.abrir(); }
    return false;
  }
  terminarColocar();
  est.sala = armarSala(M, r, Date.now());
  recalcularPuedo(est.sala, est.yo.id);
  est.ultimaSala = slug;
  est.elegido = null;
  $('portada').hidden = true;
  raiz.classList.remove('afuera');
  pintarSala();
  fichas.pintarGente();
  chat.cargarHistorial(est.sala);
  cerrarPanel('p-ficha'); cerrarPanel('p-mueble');
  encajarSala();
  latido();
  if (document.visibilityState === 'hidden') api.ausente({ si: true });
  marcar();
  return true;
}

// Encaja la sala en la pantalla (en el celular, centrada en uno mismo).
function encajarSala() {
  const s = est.sala;
  if (!s) return;
  const g = escena.geometria(s);
  const yo = s.jugadores[est.yo.id];
  const f = yo ? g.tts(yo.dx, yo.dy) : null;
  vista.encajar(g.bounds, f ? { x: f.x, y: f.y - 40 } : null);
}

function pintarSala() {
  const s = est.sala;
  if (!s) return;
  $('sala-nombre').textContent = s.meta.nombre || 'Sala';
  $('sala-icono').textContent = s.meta.icono || '🏠';
  const yo = est.yo.id;
  const dueno = s.meta.dueno && String(s.meta.dueno.id) === yo;
  $('b-sala-ajustes').hidden = !(dueno || est.yo.equipo || est.yo.admin);
  mochila.pintar();
}

function pintarMiMuneco() { /* el muñeco propio se ve en la sala; aca queda para la tarjeta de CV */ }

const FUERA_TXT = {
  puerta: null,
  echado: 'Te echaron de la sala.',
  sala_borrada: 'La sala se borró.',
  otra_ventana: 'Abriste el hotel en otra ventana.',
  ausente: 'Te sacamos de la sala porque estuviste ausente un rato.',
  equipo: 'El equipo te sacó de la sala.',
};
function fuera(motivo) {
  const txt = FUERA_TXT[motivo];
  if (motivo === 'otra_ventana') {
    const slug = est.sala ? est.sala.slug : est.ultimaSala;
    afuera(txt);
    portada(txt, { reintentar: () => entrarA(slug), reintentarTxt: 'Seguir acá', salas: true, afuera: true });
    return;
  }
  afuera(txt || 'Saliste de la sala.');
  if (txt) toast(txt, motivo === 'echado' || motivo === 'equipo' ? 'error' : null);
  if (motivo === 'puerta') nav.abrir();
}

// ── Caminar, tocar y poner ──
function mueblesParaMotor(s, menos) {
  const out = [];
  for (const mu of Object.values(s.muebles)) {
    if (mu.pared || mu.x == null || mu.m === menos) continue;
    out.push({ m: mu.m, x: mu.x, y: mu.y, rot: mu.rot, entrada: cat.entrada(mu.c) || { footprint: '1x1', walkable: false } });
  }
  return out;
}
function genteParaMotor(s) {
  const js = {};
  const t = Date.now();
  for (const p of Object.values(s.jugadores)) {
    const b = p.sentado ? { x: p.sentado.tx, y: p.sentado.ty } : baldosaActual(M, p, t);
    js[p.u] = { x: b.x, y: b.y };
    if (p.pasos.length) { js[p.u].dx = p.dx; js[p.u].dy = p.dy; }
  }
  return js;
}

async function caminar(tx, ty) {
  const s = est.sala;
  const yo = s && s.jugadores[est.yo.id];
  if (!yo) return;
  const t = Date.now();
  const cur = yo.sentado ? { x: yo.sentado.tx, y: yo.sentado.ty } : baldosaActual(M, yo, t);
  const gente = M.ocupadasPorGente(genteParaMotor(s), est.yo.id);
  gente.delete(M.clave(s.puerta.x, s.puerta.y)); // la puerta nunca cuenta como ocupada (igual que el servidor)
  const pasos = M.camino({ capa: s.capa, desde: cur, hasta: { x: tx, y: ty }, bloqueos: M.bloqueosDeMuebles(mueblesParaMotor(s)), gente });
  if (!pasos) return; // no se llega: igual que PawHotel, no pasa nada
  if (pasos.length) {
    const c = M.codificarCamino(cur.x, cur.y, pasos);
    aplicarMov(M, yo, { x: cur.x, y: cur.y, c, dx: tx, dy: ty }, t);
    marcar();
  }
  const r = await api.ir({ x: tx, y: ty });
  if (r.error) {
    toast(r.error, 'error');
    if (est.sala === s && s.jugadores[est.yo.id] === yo) { aplicarMov(M, yo, { x: cur.x, y: cur.y, c: '' }, Date.now()); marcar(); }
  }
}

async function sentarseEn(mu, tocada) {
  const e = cat.entrada(mu.c);
  if (!e) return false;
  const as = M.asientosDeMueble(mu.x, mu.y, mu.rot, e);
  if (!as.length) return false;
  let a = as[0];
  if (tocada) a = as.find((x) => x.tx === tocada.tx && x.ty === tocada.ty) || as.reduce((m, x) => (Math.hypot(x.tx - tocada.tx, x.ty - tocada.ty) < Math.hypot(m.tx - tocada.tx, m.ty - tocada.ty) ? x : m), as[0]);
  const r = await api.ir({ asiento: { m: mu.m, s: a.s } });
  if (r.error) toast(r.error, 'error');
  return true;
}

function tocar(sx, sy) {
  const s = est.sala;
  if (!s || muneco.enBienvenida) return;
  if (sucio || anima) dibujarYa();
  if (est.colocar) { colocarEn(sx, sy); return; }
  const q = escena.queHay(s, sx, sy);
  if (!q) { cerrarPanel('p-ficha'); cerrarPanel('p-mueble'); est.elegido = null; marcar(); return; }
  if (q.tipo === 'jugador') {
    fichas.abrirFicha(q.u);
    if (q.u !== est.yo.id) api.mirar({ u: q.u });
    return;
  }
  if (q.tipo === 'mueble') {
    const mu = s.muebles[q.m];
    if (!mu) return;
    fichas.abrirMueble(mu.m);
    const e = cat.entrada(mu.c);
    if (!mu.pared && e && (e.sittable || e.seats || e.seatsByRot)) sentarseEn(mu, escena.baldosaEn(s, sx, sy));
    return;
  }
  cerrarPanel('p-ficha'); cerrarPanel('p-mueble'); est.elegido = null;
  if (q.tipo === 'puerta') { api.ir({ puerta: true }).then((r) => { if (r.error) toast(r.error, 'error'); }); return; }
  if (q.tipo === 'baldosa') caminar(q.tx, q.ty);
}

function mover(sx, sy) {
  const s = est.sala;
  if (!s) return;
  const t = escena.baldosaEn(s, sx, sy);
  const antes = est.hover ? est.hover.tx + ',' + est.hover.ty : '';
  est.hover = t;
  if (est.colocar && est.colocar.fila && est.colocar.fila.clase === 'pared') {
    const h = escena.paredEn(s, sx, sy);
    const v = h && M.getValidWallPlacement(h, cat.entrada(est.colocar.fila.id) || est.colocar.fila.id);
    est.hoverPared = h ? { lado: h.side, tx: h.tx, ty: h.ty, ox: h.ox, oy: h.oy, ok: !!v } : null;
    marcar();
  }
  const q = !est.colocar ? escena.queHay(s, sx, sy) : null;
  const hj = q && q.tipo === 'jugador' ? q.u : null;
  canvas.style.cursor = q && (q.tipo === 'jugador' || q.tipo === 'mueble' || q.tipo === 'puerta') ? 'pointer' : 'default';
  if (hj !== est.hoverJugador || (t ? t.tx + ',' + t.ty : '') !== antes) { est.hoverJugador = hj; marcar(); }
}

function empezarColocar(k) {
  if (!est.sala || !k.fila) return;
  est.colocar = { fila: k.fila, m: String(k.m), rot: k.rot | 0, mover: !!k.mover };
  const pared = k.fila.clase === 'pared';
  $('colocando-txt').textContent = pared ? 'Tocá una pared para colgar «' + (k.fila.nombre || '') + '»' : 'Tocá una baldosa para poner «' + (k.fila.nombre || '') + '»';
  $('b-colocar-girar').hidden = pared || !((cat.entrada(k.fila.id) || {}).rotaciones > 1);
  $('colocando').hidden = false;
  canvas.classList.add('colocando');
  marcar();
}
function terminarColocar() {
  est.colocar = null; est.hoverPared = null;
  $('colocando').hidden = true;
  canvas.classList.remove('colocando');
  marcar();
}
$('b-colocar-cancelar').addEventListener('click', terminarColocar);
$('b-colocar-girar').addEventListener('click', () => {
  if (!est.colocar) return;
  const n = (cat.entrada(est.colocar.fila.id) || {}).rotaciones || 1;
  est.colocar.rot = (est.colocar.rot + 1) % n;
  marcar();
});

async function colocarEn(sx, sy) {
  const s = est.sala, k = est.colocar;
  if (!s || !k) return;
  let d;
  if (k.fila.clase === 'pared') {
    const h = escena.paredEn(s, sx, sy);
    const v = h && M.getValidWallPlacement(h, cat.entrada(k.fila.id) || k.fila.id);
    if (!v) { toast('Ahí no se puede colgar: probá más al centro de la pared.', 'error'); return; }
    d = { m: k.m, pared: M.makeWallKey(v.side, v.tx, v.ty, v.ox, v.oy) };
  } else {
    const t = escena.baldosaEn(s, sx, sy);
    if (!t) return;
    est.hover = t;
    d = { m: k.m, x: t.tx, y: t.ty, rot: k.rot };
  }
  const r = k.mover ? await api.mover(d) : await api.poner(d);
  if (r.error) { toast(r.error, 'error'); return; }
  if (!k.mover) mochila.quitarLocal(k.m);
  terminarColocar();
}

// ── Botones ──
$('b-salas').addEventListener('click', () => (panelAbierto('p-salas') ? cerrarPanel('p-salas') : nav.abrir()));
$('b-mochila').addEventListener('click', () => (panelAbierto('p-mochila') ? cerrarPanel('p-mochila') : mochila.abrir()));
$('b-catalogo').addEventListener('click', () => (panelAbierto('p-catalogo') ? cerrarPanel('p-catalogo') : mochila.abrirCatalogo()));
$('b-muneco').addEventListener('click', () => (panelAbierto('p-muneco') ? cerrarPanel('p-muneco') : muneco.abrir({})));
$('b-gestos').addEventListener('click', () => alternarPanel('p-gestos'));
$('b-log').addEventListener('click', () => { if (alternarPanel('p-log')) { const l = $('lista-log'); l.scrollTop = l.scrollHeight; } });
$('b-gente').addEventListener('click', () => { fichas.pintarGente(); alternarPanel('p-gente'); });
$('b-encajar').addEventListener('click', () => { if (est.sala) encajarSala(); });
$('b-sala-ajustes').addEventListener('click', () => { if (est.sala) nav.abrirForm(est.sala); });
$('b-volver').addEventListener('click', () => {
  try { const pj = window.parent !== window && window.parent.puenteJuegos; if (pj && typeof pj.atras === 'function') { pj.atras(); return; } } catch (e) { /* otro origen */ }
  if (history.length > 1) history.back();
});

function atras() {
  if (dialogoAbierto()) { cerrarDialogo(); return true; }
  if (muneco.enBienvenida) return true;
  if (est.colocar) { terminarColocar(); return true; }
  if (cerrarUltimo()) return true;
  return false;
}
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { atras(); return; }
  const enCampo = e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT');
  if (e.key === 'Enter' && !enCampo && est.sala) { e.preventDefault(); $('chat').focus(); }
});

// ── Ciclo de vida ──
let latidoTimer = null;
function latido() {
  clearInterval(latidoTimer);
  latidoTimer = setInterval(() => { if (est.sala) api.sigo({}); }, C.TOPES.LATIDO_MS);
}
document.addEventListener('visibilitychange', () => {
  if (!est.sala) return;
  api.ausente({ si: document.visibilityState === 'hidden' });
});
transporte.alCaer(() => { $('aviso-red').hidden = false; });
transporte.alReconectar(async () => {
  $('aviso-red').hidden = false;
  const r = await api.hola({});
  if (r.error) { $('aviso-red').hidden = true; portada(r.error, { reintentar: arrancar }); return; }
  $('aviso-red').hidden = true;
  if (est.sala) await entrarA(est.sala.slug, true);
});
let cerrado = false;
function cerrar() {
  if (cerrado) return;
  cerrado = true;
  clearInterval(latidoTimer);
  if (est.sala) api.salir({});
  transporte.soltarTodo();
  est.sala = null;
}
window.addEventListener('pagehide', cerrar);
window.addEventListener('resize', () => { const s = est.sala; vista.medir(); if (s && !vista.manual) encajarSala(); marcar(); });

// ── Dibujo (a demanda: solo si algo cambio o se esta moviendo) ──
let anima = false;
function cuadro() {
  requestAnimationFrame(cuadro);
  if (!sucio && !anima) return;
  dibujarYa();
}
// Dibuja ahora mismo (tambien antes de un toque, para que lo que se toca sea lo que se ve).
function dibujarYa() {
  sucio = false;
  const s = est.sala;
  let r;
  try {
  r = escena.dibujar({
    sala: s, ahora: Date.now(), yo: est.yo ? est.yo.id : null,
    hover: est.hover, hoverPared: est.hoverPared, hoverJugador: est.hoverJugador, colocar: est.colocar, elegido: est.elegido,
    ocultar: est.colocar && est.colocar.mover ? est.colocar.m : null,
    fila: (c) => cat.fila(c), entrada: (c) => cat.entrada(c), rawCatalog: cat.poses(), colores: cat.deco().colores,
    textoGesto: (t) => GESTOS_TXT[t] || '·',
  });
  } catch (e) {
    // un error de dibujo no tiene que frenar el hotel: se avisa una vez y se sigue
    if (!est.errorDibujo) { est.errorDibujo = String(e && e.stack || e); console.error('hotel: dibujo:', e); }
    return;
  }
  anima = !!r.anima;
  if (s && est.yo) {
    const yo = s.jugadores[est.yo.id];
    if (yo && yo.caminando) { const p = r.geo.tts(yo.px, yo.py); vista.seguir(p.x, p.y - 40); }
  }
}
requestAnimationFrame(cuadro);

// ── Lo que usa CV Chat ──
window.cvHotel = Object.freeze({
  atras,
  cerrar,
  sala: () => (est.sala ? est.sala.slug : null),
  irA: (slug) => entrarA(slug),
});

// Solo para la pagina de prueba (pruebas/hotel/prueba.html): ver y tocar la sala desde afuera.
if (PRUEBA) {
  window.cvHotelPrueba = {
    est,
    pantallaDe(tx, ty) { const s = est.sala; if (!s) return null; const g = escena.geometria(s); const w = g.tts(tx, ty); return vista.aPantalla(w.x, w.y); },
    tocar, colocarEn, empezarColocar, caminar, mochila, chat, nav, fichas, muneco, api, escena, vista, transporte,
  };
}

arrancar();
