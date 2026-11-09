// La mochila (inventario) y el catalogo. Reemplaza inventoryUiRuntime, inventoryGlueRuntime,
// ui/inventoryCatalogueRuntime y la parte de pantalla de catalogFurnitureRuntime.
// Fase 1: el catalogo solo muestra lo gratis (precio 0) y se pide con hotel:pedir; las monedas,
// la tienda y los intercambios quedan escondidos hasta las fases 3 y 4 (commerceRuntime y
// tradeRuntime no se cargan).
import { $, el, vaciar, toast, abrirPanel, cerrarPanel, elegirPestana } from '../ui/uiRuntime.js';
import { dibujarMiniatura } from '../game/mueblesDibujo.js';

export function instalarMochila(H) {
  const { api } = H;
  let grupos = [];        // [{ c, ids:[m] }]
  let pidiendo = null;
  let catSel = null, catCat = null;
  let recargaPendiente = null;

  function contar() { return grupos.reduce((n, g) => n + g.ids.length, 0); }
  function marcador() {
    const n = contar(), b = $('mochila-n');
    b.hidden = !n; b.textContent = n > 99 ? '99+' : String(n);
  }

  function miniatura(fila, w, h) {
    const c = el('canvas', { width: String(w || 64), height: String(h || 52) });
    if (fila) dibujarMiniatura(c, fila);
    return c;
  }

  function pintar() {
    const ul = $('lista-mochila');
    vaciar(ul);
    marcador();
    if (!grupos.length) { ul.appendChild(el('li', 'vacio', 'Tu mochila está vacía. Pedí muebles en el Catálogo.')); return; }
    const sala = H.est.sala;
    $('mochila-nota').textContent = !sala ? 'Entrá a una sala para poner muebles.' : sala.puedo.poner ? 'Tocá un mueble para ponerlo en la sala.' : 'En esta sala no podés poner muebles: andá a una tuya.';
    for (const g of grupos) {
      const fila = H.cat.fila(g.c);
      const li = el('li', { tabindex: '0', role: 'button', title: H.cat.nombre(g.c) });
      li.appendChild(miniatura(fila));
      li.appendChild(el('span', null, H.cat.nombre(g.c)));
      if (g.ids.length > 1) li.appendChild(el('span', 'n', '×' + g.ids.length));
      const usar = () => {
        const s = H.est.sala;
        if (!s) { toast('Entrá a una sala para poner muebles.'); return; }
        if (!s.puedo.poner) { toast('En esta sala no podés poner muebles.', 'error'); return; }
        if (!fila) { toast('Ese mueble ya no está en el catálogo.', 'error'); return; }
        cerrarPanel('p-mochila');
        H.empezarColocar({ fila, m: g.ids[0], rot: 0, mover: false });
      };
      li.addEventListener('click', usar);
      li.addEventListener('keydown', (e) => { if (e.key === 'Enter') usar(); });
      ul.appendChild(li);
    }
  }

  async function cargar() {
    const r = await api.inventario({});
    if (r.error) { toast(r.error, 'error'); return; }
    grupos = (r.grupos || []).map((g) => ({ c: g.c, ids: (g.ids || []).map(String) })).filter((g) => g.ids.length);
    pintar();
  }

  // hotel:inventario_cambio {mas:[{m,c}], menos:[m]}; si viene otra cosa, se vuelve a pedir
  function cambio(d) {
    const mas = Array.isArray(d.mas) ? d.mas : null, menos = Array.isArray(d.menos) ? d.menos : null;
    if (!mas || !menos || mas.some((x) => !x || x.m == null || typeof x.c !== 'string')) {
      clearTimeout(recargaPendiente); recargaPendiente = setTimeout(cargar, 400); return;
    }
    const fuera = new Set(menos.map(String));
    for (const g of grupos) g.ids = g.ids.filter((m) => !fuera.has(m));
    for (const x of mas) {
      const m = String(x.m);
      let g = grupos.find((y) => y.c === x.c);
      if (!g) { g = { c: x.c, ids: [] }; grupos.push(g); }
      if (g.ids.indexOf(m) < 0) g.ids.push(m);
    }
    grupos = grupos.filter((g) => g.ids.length);
    pintar();
  }

  function quitarLocal(m) { for (const g of grupos) g.ids = g.ids.filter((x) => x !== String(m)); grupos = grupos.filter((g) => g.ids.length); pintar(); }

  // ── Catalogo ──
  function gratis() { return H.cat.lista().filter((f) => (f.precio | 0) === 0); }
  function pintarCatalogo() {
    const tabs = $('cat-pestanas');
    vaciar(tabs);
    const cats = [];
    for (const f of gratis()) { const k = f.categoria || 'Varios'; if (cats.indexOf(k) < 0) cats.push(k); }
    if (!catCat || cats.indexOf(catCat) < 0) catCat = cats[0] || null;
    for (const k of cats) {
      const b = el('button', { type: 'button', role: 'tab' }, k);
      b.addEventListener('click', () => { catCat = k; elegirPestana(tabs, b); pintarItems(); });
      tabs.appendChild(b);
      if (k === catCat) elegirPestana(tabs, b);
    }
    pintarItems();
  }
  function pintarItems() {
    const ul = $('lista-catalogo');
    vaciar(ul);
    const items = gratis().filter((f) => (f.categoria || 'Varios') === catCat);
    if (!items.length) { ul.appendChild(el('li', 'vacio', H.cat.lista().length ? 'No hay nada acá.' : 'El catálogo no cargó todavía.')); $('cat-detalle').hidden = true; return; }
    for (const f of items) {
      const li = el('li', { tabindex: '0', role: 'button' });
      li.appendChild(miniatura(f));
      li.appendChild(el('span', null, f.nombre || f.id));
      const elegir = () => {
        catSel = f;
        for (const x of ul.children) x.classList.toggle('elegido', x === li);
        $('cat-detalle').hidden = false;
        dibujarMiniatura($('cat-vista'), f);
        $('cat-nombre').textContent = f.nombre || f.id;
        $('cat-desc').textContent = f.descripcion || '';
      };
      li.addEventListener('click', elegir);
      li.addEventListener('keydown', (e) => { if (e.key === 'Enter') elegir(); });
      ul.appendChild(li);
      if (catSel && catSel.id === f.id) elegir();
    }
    if (!catSel || items.indexOf(catSel) < 0) ul.firstChild.click();
  }
  $('b-pedir').addEventListener('click', async () => {
    if (!catSel || pidiendo) return;
    pidiendo = catSel.id;
    $('b-pedir').disabled = true;
    const r = await api.pedir({ catalogo: catSel.id });
    $('b-pedir').disabled = false;
    pidiendo = null;
    if (r.error) { toast(r.error, 'error'); return; }
    toast('Te llegó a la mochila: ' + (catSel.nombre || catSel.id) + '.', 'bien');
    if (r.item && r.item.m != null && !grupos.some((g) => g.ids.indexOf(String(r.item.m)) >= 0)) cambio({ mas: [{ m: r.item.m, c: r.item.c || catSel.id }], menos: [] });
  });

  return {
    abrir() { abrirPanel('p-mochila'); pintar(); cargar(); },
    abrirCatalogo() { abrirPanel('p-catalogo'); pintarCatalogo(); },
    cargar, cambio, quitarLocal, pintar,
    tiene: (m) => grupos.some((g) => g.ids.indexOf(String(m)) >= 0),
  };
}
