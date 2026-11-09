// El creador del muñeco: sirve para editarlo y, la primera vez, como bienvenida (sin poder cerrarlo
// hasta guardar). Reemplaza avatarEditorRuntime (con api.perfil en vez de escribir en Firebase) y
// la parte del creador del login de PawHotel (que ya no existe: la identidad la da CV Chat).
import { $, el, vaciar, abrirPanel, cerrarPanel } from '../ui/uiRuntime.js';
import { PARTS, VARIANTS, COLORS, DEFAULT_AVATAR, PART_META } from '../config/avatar.js';
import { drawCharPreviewRuntime } from './avatarPreviewRuntime.js';
import { adjustColor } from '../game/draw.js';

// Un muñeco al azar para la primera vez (asi no salen todos iguales).
export function munecoAlAzar(azar) {
  const r = azar || Math.random;
  const a = {};
  for (const p of PARTS) { a[p + 'V'] = Math.floor(r() * VARIANTS[p]); a[p + 'C'] = Math.floor(r() * COLORS[p].length); }
  return a;
}

export function dibujarMuneco(canvas, avatar, escala) {
  const g = canvas.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, canvas.width, canvas.height);
  g.imageSmoothingEnabled = false;
  const e = escala || 1;
  g.setTransform(e, 0, 0, e, 0, 0);
  drawCharPreviewRuntime(g, Math.round(canvas.width / e / 2), Math.round(canvas.height / e) - 12, avatar || DEFAULT_AVATAR, { colors: COLORS, adjustColor });
  g.setTransform(1, 0, 0, 1, 0, 0);
}

export function instalarMuneco(H) {
  let cfg = Object.assign({}, DEFAULT_AVATAR);
  let bienvenida = false;
  let alListo = null;

  function fila(part) {
    const nV = VARIANTS[part], cols = COLORS[part];
    const d = el('div', 'parte');
    const lbl = el('span', 'lbl', PART_META[part].label + ' ');
    lbl.appendChild(el('span', 'num', (cfg[part + 'V'] + 1) + '/' + nV));
    d.appendChild(lbl);
    const ant = el('button', { type: 'button', 'aria-label': PART_META[part].label + ': anterior' }, '◀');
    const sig = el('button', { type: 'button', 'aria-label': PART_META[part].label + ': siguiente' }, '▶');
    const mid = el('div', 'muestras');
    cols.forEach((c, i) => {
      const m = el('button', { type: 'button', class: 'muestra' + (cfg[part + 'C'] === i ? ' elegida' : ''), 'aria-label': PART_META[part].label + ': color ' + (i + 1) });
      m.style.background = c;
      m.addEventListener('click', () => { cfg[part + 'C'] = i; refrescar(); });
      mid.appendChild(m);
    });
    ant.addEventListener('click', () => { cfg[part + 'V'] = (cfg[part + 'V'] - 1 + nV) % nV; refrescar(); });
    sig.addEventListener('click', () => { cfg[part + 'V'] = (cfg[part + 'V'] + 1) % nV; refrescar(); });
    d.append(ant, mid, sig);
    return d;
  }

  function refrescar() {
    const cont = $('muneco-partes');
    vaciar(cont);
    for (const p of PARTS) cont.appendChild(fila(p));
    // que el color elegido quede a la vista (las muestras se desplazan de costado)
    requestAnimationFrame(() => {
      for (const mid of cont.querySelectorAll('.muestras')) {
        const e = mid.querySelector('.elegida');
        if (e) mid.scrollLeft = Math.max(0, e.offsetLeft - mid.offsetLeft - mid.clientWidth / 2 + e.offsetWidth / 2);
      }
    });
    dibujarMuneco($('muneco-vista'), cfg, 1.4);
  }

  // abrir({ bienvenida:true, avatar }) -> Promise que se cumple al guardar (en la bienvenida)
  function abrir(o) {
    o = o || {};
    bienvenida = !!o.bienvenida;
    cfg = Object.assign({}, DEFAULT_AVATAR, o.avatar || H.est.avatar || munecoAlAzar());
    $('muneco-estado').value = H.est.estadoTexto || '';
    $('muneco-error').textContent = '';
    $('muneco-bienvenida').hidden = !bienvenida;
    $('t-muneco').textContent = bienvenida ? '¡Hola' + (H.est.yo ? ', ' + H.est.yo.nombre : '') + '! Armá tu muñeco' : 'Tu muñeco';
    $('b-muneco-guardar').textContent = bienvenida ? 'Entrar al hotel' : 'Guardar';
    H.raiz.classList.toggle('bienvenida', bienvenida);
    refrescar();
    abrirPanel('p-muneco');
    return new Promise((ok) => { alListo = ok; });
  }

  $('b-muneco-guardar').addEventListener('click', async () => {
    const v = H.M.validarAvatar(cfg);
    if (v.error) { $('muneco-error').textContent = v.error; return; }
    const estado = $('muneco-estado').value.trim();
    const b = $('b-muneco-guardar');
    b.disabled = true;
    const r = await H.api.perfil({ avatar: v.avatar, estado });
    b.disabled = false;
    if (r.error) { $('muneco-error').textContent = r.error; return; }
    H.est.avatar = v.avatar; H.est.estadoTexto = estado;
    H.alCambiarMuneco();
    H.raiz.classList.remove('bienvenida');
    bienvenida = false;
    cerrarPanel('p-muneco');
    if (alListo) { const f = alListo; alListo = null; f(v.avatar); }
  });

  return { abrir, get enBienvenida() { return bienvenida; } };
}
