// El navegador de salas y el formulario para crear o editar una sala. Reemplaza
// navigatorRoomsRuntime, ui/navigatorRuntime y roomModalRuntime: las listas salen de hotel:salas
// (no de onValue('rooms')) y los nombres de las salas y de los dueños entran con textContent
// (antes iban por innerHTML en navigatorRuntime.js:226 y :263 y roomModalRuntime.js:350).
import { $, el, vaciar, toast, abrirPanel, cerrarPanel, enPanel, elegirPestana, confirmar } from '../ui/uiRuntime.js';
import { NOMBRES_FORMA, CAPACIDADES, LS } from '../config/hotel.js';

function leerLS(k, d) { try { return localStorage.getItem(k) || d; } catch (e) { return d; } }
function guardarLS(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* sin almacenamiento */ } }

export function instalarNavegador(H) {
  const { C, api } = H;
  const lista = $('lista-salas');
  const tabs = $('p-salas').querySelector('.pestanas');
  let ver = leerLS(LS.pestanaSalas, 'club');
  if (C.VER_SALAS.indexOf(ver) < 0) ver = 'club';
  let filas = [];
  let pedido = 0;

  function filaDeSala(s, conteo) {
    const li = el('li', { tabindex: '0', role: 'button' });
    li.appendChild(el('span', 'icono', s.icono || '🏠'));
    const txt = el('div', 'txt');
    txt.appendChild(el('b', null, s.nombre || 'Sala'));
    const sub = s.dueno ? 'De ' + (s.dueno.nombre || 'alguien') : 'Del club';
    txt.appendChild(el('small', null, sub + (s.acceso === 'cerrada' ? ' · cerrada' : '')));
    li.appendChild(txt);
    const n = conteo != null ? conteo : (s.gente | 0);
    li.appendChild(el('span', 'cuenta' + (n > 0 ? ' hay' : ''), n + '/' + (s.cap | 0)));
    li.dataset.slug = s.slug;
    const ir = () => { cerrarPanel('p-salas'); H.entrarA(s.slug); };
    li.addEventListener('click', ir);
    li.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ir(); } });
    return li;
  }

  function pintar() {
    vaciar(lista);
    if (!filas.length) {
      const msg = ver === 'mias' ? 'Todavía no tenés salas. ¡Creá la primera!' : ver === 'buscar' ? 'Escribí el nombre y tocá Buscar.' : 'No hay salas acá todavía.';
      lista.appendChild(el('li', 'vacio', msg));
      return;
    }
    for (const s of filas) lista.appendChild(filaDeSala(s, null));
  }

  async function cargar(q) {
    const n = ++pedido;
    const datos = { ver };
    if (ver === 'buscar') { if (!q) { filas = []; pintar(); return; } datos.q = q; }
    vaciar(lista); lista.appendChild(el('li', 'vacio', 'Cargando…'));
    const r = await api.salas(datos);
    if (n !== pedido) return;
    if (r.error) { filas = []; vaciar(lista); lista.appendChild(el('li', 'vacio', r.error)); return; }
    filas = Array.isArray(r.salas) ? r.salas : [];
    pintar();
  }

  function elegir(v) {
    ver = v; guardarLS(LS.pestanaSalas, v);
    elegirPestana(tabs, tabs.querySelector('[data-ver="' + v + '"]'));
    $('f-buscar').hidden = v !== 'buscar';
    if (v === 'buscar') { filas = []; pintar(); $('buscar-q').focus(); } else cargar();
  }

  for (const b of tabs.querySelectorAll('[data-ver]')) b.addEventListener('click', () => elegir(b.dataset.ver));
  $('f-buscar').addEventListener('submit', (e) => { e.preventDefault(); cargar($('buscar-q').value.trim()); });

  // Los conteos en vivo mientras el navegador esta abierto (hotel:nav + hotel:conteos)
  function conteos(c) {
    for (const li of lista.querySelectorAll('li[data-slug]')) {
      const n = c[li.dataset.slug];
      if (n == null) continue;
      const s = filas.find((x) => x.slug === li.dataset.slug);
      const span = li.querySelector('.cuenta');
      if (span && s) { span.textContent = n + '/' + (s.cap | 0); span.className = 'cuenta' + (n > 0 ? ' hay' : ''); }
    }
  }

  function abrir() {
    abrirPanel('p-salas');
    elegir(ver);
    api.nav({ abierto: true });
  }
  enPanel('p-salas', () => { api.nav({ abierto: false }); });

  // ── Crear / editar ──
  const forma = $('sala-f-forma'), cap = $('sala-f-cap');
  for (const f of C.FORMAS) forma.appendChild(el('option', { value: f }, NOMBRES_FORMA[f] || f));
  function llenarCap(lista2) {
    vaciar(cap);
    for (const n of lista2) cap.appendChild(el('option', { value: String(n) }, n + ' personas'));
  }
  llenarCap(CAPACIDADES);
  let editando = null; // slug o null

  function llenarPintar() {
    const d = H.cat.deco();
    const op = (sel, l, nombre) => { vaciar(sel); l.forEach((x, i) => sel.appendChild(el('option', { value: x.id != null ? String(x.id) : String(i) }, nombre(x)))); };
    op($('pintar-pared-pat'), d.pared, (x) => x.name);
    op($('pintar-piso-pat'), d.piso, (x) => x.name);
    op($('pintar-pared-color'), d.colores, (x) => x.name);
    op($('pintar-piso-color'), d.colores, (x) => x.name);
  }

  function abrirForm(sala) {
    editando = sala ? sala.slug : null;
    $('t-sala').textContent = sala ? 'Ajustes de la sala' : 'Crear una sala';
    $('b-sala-guardar').textContent = sala ? 'Guardar' : 'Crear';
    $('sala-f-error').textContent = '';
    $('sala-f-forma-l').hidden = !!sala;
    $('b-sala-borrar').hidden = !sala || !sala.meta.dueno;
    $('sala-f-pintar').hidden = !sala;
    const cfg = H.est.config || {};
    llenarCap(Array.isArray(cfg.capacidades) && cfg.capacidades.length ? cfg.capacidades : CAPACIDADES);
    if (sala) {
      const m = sala.meta;
      $('sala-f-nombre').value = m.nombre || '';
      $('sala-f-desc').value = m.descripcion || '';
      if (![...cap.options].some((x) => +x.value === m.cap)) cap.appendChild(el('option', { value: String(m.cap) }, m.cap + ' personas'));
      cap.value = String(m.cap);
      $('sala-f-acceso').value = m.acceso || 'abierta';
      llenarPintar();
      const d = m.decor || {};
      const cols = H.cat.deco().colores;
      const cv = (c) => (typeof c === 'number' && cols[c] ? String(cols[c].id) : String(c));
      if (d.pared) { $('pintar-pared-pat').value = d.pared.patron; $('pintar-pared-color').value = cv(d.pared.color); }
      if (d.piso) { $('pintar-piso-pat').value = d.piso.patron; $('pintar-piso-color').value = cv(d.piso.color); }
    } else {
      $('sala-f-nombre').value = ''; $('sala-f-desc').value = ''; forma.value = 'small'; cap.value = String(CAPACIDADES[1]); $('sala-f-acceso').value = 'abierta';
    }
    abrirPanel('p-sala');
    $('sala-f-nombre').focus();
  }

  $('f-sala').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('sala-f-error'); err.textContent = '';
    const datos = { nombre: $('sala-f-nombre').value.trim(), capacidad: Number(cap.value), acceso: $('sala-f-acceso').value };
    const desc = $('sala-f-desc').value.trim();
    datos.descripcion = desc;
    let r;
    if (editando) r = await api.salaEditar(Object.assign({ sala: editando }, datos));
    else r = await api.salaCrear(Object.assign({ forma: forma.value }, datos));
    if (r.error) { err.textContent = r.error; return; }
    cerrarPanel('p-sala');
    if (!editando && r.slug) { toast('¡Listo! Esta es tu sala nueva.', 'bien'); H.entrarA(r.slug); }
    else toast('Guardado.', 'bien');
  });

  $('b-pintar').addEventListener('click', async () => {
    const color = (v) => (/^[0-9]+$/.test(v) ? Number(v) : v);
    const a = await api.pintar({ tipo: 'pared', patron: $('pintar-pared-pat').value, color: color($('pintar-pared-color').value) });
    if (a.error) { $('sala-f-error').textContent = a.error; return; }
    const b = await api.pintar({ tipo: 'piso', patron: $('pintar-piso-pat').value, color: color($('pintar-piso-color').value) });
    if (b.error) { $('sala-f-error').textContent = b.error; return; }
    toast('La sala quedó pintada.', 'bien');
  });

  $('b-sala-borrar').addEventListener('click', async () => {
    if (!editando) return;
    const ok = await confirmar('Borrar la sala', 'Los muebles vuelven a la mochila de sus dueños y la gente que está adentro sale. No se puede deshacer.', 'Borrarla');
    if (!ok) return;
    const r = await api.salaBorrar({ sala: editando });
    if (r.error) { $('sala-f-error').textContent = r.error; return; }
    cerrarPanel('p-sala');
    toast('La sala se borró.');
  });

  $('b-crear-sala').addEventListener('click', () => { cerrarPanel('p-salas'); abrirForm(null); });

  return { abrir, conteos, abrirForm, recargar: () => cargar() };
}
