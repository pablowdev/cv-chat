// Ayudas de pantalla: elementos, avisos (toasts), paneles y la pregunta de si o no.
// Todo texto que viene de la gente entra con textContent (nunca innerHTML).

export const $ = (id) => document.getElementById(id);

// el('li', 'clase', 'texto') o el('button', { class, type, title, dataset }, 'texto')
export function el(tag, op, texto) {
  const e = document.createElement(tag);
  if (typeof op === 'string') e.className = op;
  else if (op && typeof op === 'object') {
    for (const k of Object.keys(op)) {
      if (k === 'class') e.className = op[k];
      else if (k === 'dataset') Object.assign(e.dataset, op[k]);
      else if (k === 'hidden') e.hidden = !!op[k];
      else e.setAttribute(k, String(op[k]));
    }
  }
  if (texto != null) e.textContent = String(texto);
  return e;
}

export function vaciar(e) { while (e.firstChild) e.removeChild(e.firstChild); }

// Avisos cortos abajo de todo
export function toast(texto, tipo) {
  const caja = $('toasts');
  if (!caja || !texto) return;
  const t = el('div', 'toast' + (tipo ? ' ' + tipo : ''), texto);
  caja.appendChild(t);
  while (caja.children.length > 3) caja.removeChild(caja.firstChild);
  setTimeout(() => t.remove(), tipo === 'error' ? 4500 : 3000);
}

// ── Paneles: uno grande a la vez (en el celular tapan media pantalla) ──
const abiertos = [];
const alCerrar = {};
export function enPanel(id, fn) { alCerrar[id] = fn; }

export function abrirPanel(id) {
  const p = $(id);
  if (!p) return null;
  for (const otro of abiertos.slice()) if (otro !== id) cerrarPanel(otro);
  p.hidden = false;
  if (abiertos.indexOf(id) < 0) abiertos.push(id);
  marcarBoton(id, true);
  return p;
}

export function cerrarPanel(id) {
  const p = $(id);
  if (!p || p.hidden) return;
  p.hidden = true;
  const i = abiertos.indexOf(id);
  if (i >= 0) abiertos.splice(i, 1);
  marcarBoton(id, false);
  if (alCerrar[id]) alCerrar[id]();
}

export function alternarPanel(id) {
  const p = $(id);
  if (p && !p.hidden) { cerrarPanel(id); return false; }
  abrirPanel(id); return true;
}

export function panelAbierto(id) { const p = $(id); return !!p && !p.hidden; }
export function hayPanelAbierto() { return abiertos.length > 0; }
export function cerrarUltimo() { const id = abiertos[abiertos.length - 1]; if (!id) return false; cerrarPanel(id); return true; }
export function cerrarTodos() { for (const id of abiertos.slice()) cerrarPanel(id); }

const BOTON_DE = { 'p-salas': 'b-salas', 'p-mochila': 'b-mochila', 'p-catalogo': 'b-catalogo', 'p-muneco': 'b-muneco', 'p-gestos': 'b-gestos', 'p-log': 'b-log' };
function marcarBoton(id, si) { const b = $(BOTON_DE[id]); if (b) b.classList.toggle('activo', si); }

export function prepararPaneles() {
  for (const b of document.querySelectorAll('.panel .cerrar')) {
    b.addEventListener('click', () => cerrarPanel(b.closest('.panel').id));
  }
}

// ── Pregunta de si o no ──
let dialogoListo = null;
export function confirmar(titulo, texto, si, no) {
  const d = $('dialogo');
  $('dialogo-titulo').textContent = titulo || '';
  $('dialogo-texto').textContent = texto || '';
  $('dialogo-si').textContent = si || 'Dale';
  $('dialogo-no').textContent = no || 'Cancelar';
  d.hidden = false;
  if (dialogoListo) dialogoListo(false);
  return new Promise((ok) => {
    dialogoListo = (r) => { dialogoListo = null; d.hidden = true; ok(r); };
    $('dialogo-si').focus();
  });
}
export function prepararDialogo() {
  $('dialogo-si').addEventListener('click', () => dialogoListo && dialogoListo(true));
  $('dialogo-no').addEventListener('click', () => dialogoListo && dialogoListo(false));
  $('dialogo').addEventListener('click', (e) => { if (e.target === $('dialogo') && dialogoListo) dialogoListo(false); });
}
export function dialogoAbierto() { return !!dialogoListo; }
export function cerrarDialogo() { if (dialogoListo) dialogoListo(false); }

// Pestañas con aria-selected
export function elegirPestana(cont, boton) {
  for (const b of cont.querySelectorAll('[role="tab"]')) b.setAttribute('aria-selected', b === boton ? 'true' : 'false');
}
