// La charla de la sala: globitos arriba de la escena, el registro y el "escribiendo...".
// Reemplaza bubbleRuntime, socialUiRuntime y la parte de chat de socialRuntime: todo texto de la
// gente entra con textContent y el color del globito se valida (antes iba crudo en cssText,
// socialRuntime.js:32).
import { $, el, vaciar, toast } from '../ui/uiRuntime.js';

const COLOR_RE = /^#[0-9a-fA-F]{3,8}$/;
export function colorSeguro(c, porDefecto) { return typeof c === 'string' && COLOR_RE.test(c) ? c : (porDefecto || '#9a9aab'); }

export function instalarChat(H) {
  const capa = $('capa-burbujas');
  const input = $('chat');
  const log = $('lista-log');
  let burbujas = [];          // { el, y, h }
  let ultimaSubida = 0;
  let escribiendo = false, ultimoEscribe = 0, apagarEscribe = null;
  const PASO = 30, TOPE_ARRIBA = 52, MAX = 12;

  function subir(px) {
    for (const b of burbujas) b.y -= px;
    burbujas = burbujas.filter((b) => { if (b.y + b.h < TOPE_ARRIBA) { b.el.remove(); return false; } return true; });
    for (const b of burbujas) b.el.style.top = Math.round(b.y) + 'px';
  }

  function burbuja(msg, p) {
    const color = colorSeguro(p && p.color, '#9a9aab');
    const b = el('div', 'burbuja');
    b.style.setProperty('--c', color);
    b.appendChild(el('b', null, (msg.nombre || (p && p.nombre) || '') + ':'));
    b.appendChild(document.createTextNode(msg.texto));
    b.style.visibility = 'hidden';
    capa.appendChild(b);
    const w = b.offsetWidth || 120, h = b.offsetHeight || 26;
    const anchoVista = capa.clientWidth || 360, altoVista = capa.clientHeight || 600;
    // x: arriba del que hablo; y: una fila fija y los viejos suben
    let x = anchoVista / 2;
    const j = p && H.escena.pantallaDeJugador(p.u);
    if (j) x = H.vista.aPantalla(j.sx, j.headSy).x;
    const left = Math.max(6, Math.min(anchoVista - w - 6, x - w / 2));
    b.style.left = Math.round(left) + 'px';
    b.style.setProperty('--pico', Math.max(10, Math.min(w - 10, x - left)) + 'px');
    const y = Math.max(TOPE_ARRIBA + 40, Math.round(altoVista * 0.22));
    subir(h + 6);
    b.style.top = y + 'px';
    b.style.visibility = '';
    burbujas.push({ el: b, y, h });
    while (burbujas.length > MAX) burbujas.shift().el.remove();
    ultimaSubida = Date.now();
  }

  // Cada tanto, si nadie habla, los globitos suben solos.
  function tic() {
    if (burbujas.length && Date.now() - ultimaSubida > 6000) { subir(PASO); ultimaSubida = Date.now(); }
  }
  setInterval(tic, 1000);

  function hora(t) {
    const d = new Date(t || Date.now());
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }
  function lineaLog(msg, sistema) {
    const li = el('li', sistema ? 'sistema' : null);
    li.appendChild(el('time', null, hora(msg.t)));
    if (!sistema) li.appendChild(el('b', null, (msg.nombre || '') + ':'));
    li.appendChild(document.createTextNode(msg.texto));
    log.appendChild(li);
    while (log.children.length > 150) log.removeChild(log.firstChild);
    log.scrollTop = log.scrollHeight;
  }

  function mostrar(msg, p) {
    burbuja(msg, p);
    lineaLog(msg, false);
  }
  function sistema(texto) { lineaLog({ texto, t: Date.now() }, true); }

  function limpiar() {
    for (const b of burbujas) b.el.remove();
    burbujas = [];
    vaciar(log);
  }
  function cargarHistorial(sala) {
    limpiar();
    for (const m of sala.mensajes) lineaLog(m, false);
  }

  function marcarEscribe(si) {
    if (!H.est.sala) return;
    if (si === escribiendo) return;
    const ahora = Date.now();
    if (si && ahora - ultimoEscribe < 1100) return; // la cubeta del servidor deja 1 por segundo
    escribiendo = si; ultimoEscribe = ahora;
    H.api.escribe({ si });
  }

  async function enviar() {
    const texto = input.value.trim();
    if (!texto || !H.est.sala) return;
    const largo = H.C.LARGOS.texto;
    if ([...texto].length > largo) { toast('El mensaje es muy largo (hasta ' + largo + ').', 'error'); return; }
    input.value = '';
    clearTimeout(apagarEscribe); escribiendo = false;
    const r = await H.api.decir({ texto });
    if (r.error) { toast(r.error, 'error'); if (!input.value) input.value = texto; return; }
    const s = H.est.sala;
    if (!s) return;
    const id = r.id == null ? null : String(r.id);
    if (id && s.mensajes.some((x) => x.id === id)) return; // ya llego el aviso
    const yo = s.jugadores[String(H.est.yo.id)];
    const msg = { id, u: String(H.est.yo.id), nombre: H.est.yo.nombre, texto, t: Date.now() };
    s.mensajes.push(msg);
    mostrar(msg, yo);
  }

  $('f-chat').addEventListener('submit', (e) => { e.preventDefault(); enviar(); });
  input.addEventListener('input', () => {
    clearTimeout(apagarEscribe);
    if (input.value.trim()) { marcarEscribe(true); apagarEscribe = setTimeout(() => marcarEscribe(false), 4000); }
    else marcarEscribe(false);
  });
  input.addEventListener('blur', () => { clearTimeout(apagarEscribe); marcarEscribe(false); });

  return { mostrar, sistema, limpiar, cargarHistorial, enviar, resetEscribe: () => { escribiendo = false; } };
}
