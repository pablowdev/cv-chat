// Fichas: la de una persona (Perfil, Mensaje, Denunciar y lo del dueño o el equipo), la de un
// mueble (usar, mover, girar, a la mochila), la lista de gente, los gestos y las denuncias.
// Reemplaza la parte de perfil de socialRuntime/socialUiRuntime, el panel de furnitureCanvasRuntime
// y los botones de derechos y kick de index.module.js (que ahora pasan por hotel:derechos/echar).
import { $, el, vaciar, toast, abrirPanel, cerrarPanel, confirmar } from '../ui/uiRuntime.js';
import { dibujarMuneco } from './muneco.js';
import { dibujarMiniatura } from '../game/mueblesDibujo.js';
import { GESTOS_TXT, GESTOS_NOMBRE } from '../config/hotel.js';

function puente() {
  try { const p = window.parent; return p && p !== window ? p.puenteJuegos || null : null; } catch (e) { return null; }
}

export function instalarFichas(H) {
  const { api, C } = H;
  let fichaU = null, muebleM = null;
  let denuncia = null; // { tipo, ref }

  // ── Persona ──
  async function abrirFicha(u) {
    const s = H.est.sala;
    const p = s && s.jugadores[String(u)];
    if (!p) return;
    fichaU = p.u;
    H.elegir({ tipo: 'jugador', id: p.u });
    $('ficha-nombre').textContent = p.nombre;
    $('ficha-estado').textContent = p.estado ? '“' + p.estado + '”' : '';
    $('ficha-sala').textContent = '';
    dibujarMuneco($('ficha-vista'), p.avatar, 1);
    const yo = String(H.est.yo.id), esYo = p.u === yo;
    const eq = !!(H.est.yo.equipo || H.est.yo.admin);
    const dueno = s.meta.dueno && String(s.meta.dueno.id) === yo;
    const acc = (k) => $('ficha-acciones').querySelector('[data-acc="' + k + '"]');
    acc('perfil').hidden = false;
    acc('mensaje').hidden = esYo;
    acc('mirar').hidden = esYo;
    acc('denunciar').hidden = esYo;
    const der = acc('derechos');
    der.hidden = esYo || !s.meta.dueno || !(dueno || eq);
    der.textContent = s.derechos.has(p.u) ? 'Sacar derechos' : 'Dar derechos';
    acc('echar').hidden = esYo || !s.puedo.echar || p.equipo || (s.meta.dueno && String(s.meta.dueno.id) === p.u);
    acc('silenciar').hidden = esYo || !eq;
    acc('sacar').hidden = esYo || !eq;
    abrirPanel('p-ficha');
    const r = await api.ficha({ u: p.u });
    if (fichaU !== p.u || r.error) return;
    if (r.estado) $('ficha-estado').textContent = '“' + r.estado + '”';
    if (r.sala && r.sala.nombre) $('ficha-sala').textContent = 'Su sala: ' + r.sala.nombre;
  }

  $('ficha-acciones').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-acc]');
    if (!b || !fichaU) return;
    const s = H.est.sala, u = fichaU, p = s && s.jugadores[u];
    const nombre = p ? p.nombre : 'esa persona';
    const pj = puente();
    switch (b.dataset.acc) {
      case 'perfil':
        if (pj && typeof pj.perfil === 'function') pj.perfil(u); else toast('El perfil se abre desde CV Chat.');
        break;
      case 'mensaje':
        if (pj && typeof pj.mensaje === 'function') pj.mensaje(u); else toast('Los mensajes se mandan desde CV Chat.');
        break;
      case 'mirar': { const r = await api.mirar({ u }); if (r.error) toast(r.error, 'error'); break; }
      case 'derechos': {
        const dar = !s.derechos.has(u);
        const r = await api.derechos({ u, dar });
        if (r.error) toast(r.error, 'error'); else { toast(dar ? nombre + ' ahora tiene derechos en tu sala.' : 'Le sacaste los derechos a ' + nombre + '.', 'bien'); }
        cerrarPanel('p-ficha');
        break;
      }
      case 'echar': {
        if (!(await confirmar('Echar a ' + nombre, 'Sale de la sala y no puede volver por un rato.', 'Echar'))) break;
        const r = await api.echar({ u });
        if (r.error) toast(r.error, 'error'); else cerrarPanel('p-ficha');
        break;
      }
      case 'silenciar': { const r = await api.mod({ accion: 'silenciar', u, minutos: 10 }); toast(r.error || nombre + ' no puede hablar por 10 minutos.', r.error ? 'error' : 'bien'); break; }
      case 'sacar': {
        if (!(await confirmar('Sacar a ' + nombre, 'Sale del hotel. Queda en la auditoría del equipo.', 'Sacar'))) break;
        const r = await api.mod({ accion: 'sacar', u });
        if (r.error) toast(r.error, 'error'); else cerrarPanel('p-ficha');
        break;
      }
      case 'denunciar': abrirDenuncia('jugador', u, 'Vas a denunciar a ' + nombre + '.'); break;
      default: break;
    }
  });

  // ── Mueble ──
  function abrirMueble(m) {
    const s = H.est.sala;
    const mu = s && s.muebles[String(m)];
    if (!mu) return;
    muebleM = mu.m;
    H.elegir({ tipo: 'mueble', id: mu.m });
    const f = H.cat.fila(mu.c);
    $('mueble-nombre').textContent = H.cat.nombre(mu.c);
    $('mueble-desc').textContent = (f && f.descripcion) || '';
    dibujarMiniatura($('mueble-vista'), f, mu.rot);
    const e = H.cat.entrada(mu.c);
    $('b-mueble-usar').hidden = !(e && e.estados > 1);
    $('b-mueble-mover').hidden = !s.puedo.mover;
    $('b-mueble-girar').hidden = !s.puedo.mover || !!mu.pared || !(e && e.rotaciones > 1);
    $('b-mueble-levantar').hidden = !s.puedo.levantar || !s.meta.dueno;
    abrirPanel('p-mueble');
  }
  $('b-mueble-usar').addEventListener('click', async () => { const r = await api.usar({ m: muebleM }); if (r.error) toast(r.error, 'error'); });
  $('b-mueble-girar').addEventListener('click', async () => { const r = await api.rotar({ m: muebleM }); if (r.error) toast(r.error, 'error'); });
  $('b-mueble-mover').addEventListener('click', () => {
    const s = H.est.sala, mu = s && s.muebles[muebleM];
    if (!mu) return;
    cerrarPanel('p-mueble');
    H.empezarColocar({ fila: H.cat.fila(mu.c), m: mu.m, rot: mu.rot, mover: true });
  });
  $('b-mueble-levantar').addEventListener('click', async () => {
    const r = await api.levantar({ m: muebleM });
    if (r.error) { toast(r.error, 'error'); return; }
    cerrarPanel('p-mueble');
    toast('Volvió a la mochila de su dueño.');
  });
  $('b-mueble-denunciar').addEventListener('click', () => abrirDenuncia('mueble', String(muebleM), 'Vas a denunciar este mueble.'));

  // ── Gente de la sala ──
  function pintarGente() {
    const s = H.est.sala, ul = $('lista-gente');
    vaciar(ul);
    $('gente-n').textContent = s ? String(Object.keys(s.jugadores).length) : '0';
    if (!s) return;
    const lista = Object.values(s.jugadores).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    for (const p of lista) {
      const li = el('li', { tabindex: '0', role: 'button' });
      const c = el('canvas', { width: '32', height: '40' });
      dibujarMuneco(c, p.avatar, 0.38);
      li.appendChild(c);
      const t = el('div', 'txt');
      t.appendChild(el('b', null, p.nombre + (p.u === String(H.est.yo.id) ? ' (vos)' : '')));
      if (p.estado) t.appendChild(el('small', null, p.estado));
      li.appendChild(t);
      if (s.meta.dueno && String(s.meta.dueno.id) === p.u) li.appendChild(el('span', 'cuenta', 'dueño'));
      else if (s.derechos.has(p.u)) li.appendChild(el('span', 'cuenta', 'derechos'));
      li.addEventListener('click', () => abrirFicha(p.u));
      ul.appendChild(li);
    }
  }
  $('b-denunciar-sala').addEventListener('click', () => { const s = H.est.sala; if (s) abrirDenuncia('sala', s.slug, 'Vas a denunciar la sala «' + (s.meta.nombre || '') + '».'); });

  // ── Gestos ──
  const gl = $('lista-gestos');
  for (const g of C.GESTOS) {
    const b = el('button', { type: 'button' });
    b.appendChild(el('span', null, GESTOS_TXT[g] || '·'));
    b.appendChild(document.createTextNode(GESTOS_NOMBRE[g] || g));
    b.addEventListener('click', async () => { const r = await api.gesto({ tipo: g }); if (r.error) toast(r.error, 'error'); else cerrarPanel('p-gestos'); });
    gl.appendChild(b);
  }

  // ── Denuncias ──
  function abrirDenuncia(tipo, ref, que) {
    denuncia = { tipo, ref: String(ref) };
    $('denuncia-que').textContent = que + ' Lo lee el equipo de CV.';
    $('denuncia-detalle').value = '';
    $('denuncia-error').textContent = '';
    abrirPanel('p-denuncia');
  }
  $('f-denuncia').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!denuncia) return;
    const d = { tipo: denuncia.tipo, ref: denuncia.ref, motivo: $('denuncia-motivo').value };
    const det = $('denuncia-detalle').value.trim();
    if (det) d.detalle = det;
    const r = await api.denunciar(d);
    if (r.error) { $('denuncia-error').textContent = r.error; return; }
    cerrarPanel('p-denuncia');
    toast('Gracias: el equipo la va a ver.', 'bien');
  });

  return {
    abrirFicha, abrirMueble, pintarGente,
    fichaAbierta: () => fichaU,
    olvidar(u) { if (fichaU === String(u)) { cerrarPanel('p-ficha'); fichaU = null; } },
    olvidarMueble(m) { if (muebleM === String(m)) { cerrarPanel('p-mueble'); muebleM = null; } },
    refrescarMueble(m) { if (muebleM === String(m)) abrirMueble(m); },
  };
}
