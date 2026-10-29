// La wiki de la web (wiki.js del puente): llena las paginas de la web (las de
// Webflow: wiki.html, detail_wiki.html, detail_wiki-categorias.html,
// aporta-un-articulo.html y ediciones.html) con las entradas, con su mismo diseño.
//  /wiki                     todas las entradas (y ?pendientes=1: lo que hay que revisar, administradores)
//  /wiki-categorias/<cat>    las de una categoria
//  /wiki/<entrada>           una entrada (y ?version=<id>: una version del historial)
//  /aporta-un-articulo       proponer una entrada nueva
//  /ediciones?articulo=<e>   proponer una edicion
(function () {
  'use strict';
  const CHAT = new URL(document.currentScript.src).origin;
  const API = CHAT + '/puente/api/wiki/';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const q = new URLSearchParams(location.search);
  const ruta = location.pathname.replace(/\.html$/, '').replace(/\/+$/, '') || '/';
  const fecha = t => new Date(t).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
  const entrar = () => CHAT + '/?volver=' + encodeURIComponent(location.href);
  async function api(p, body, raw) {
    const opt = { credentials: 'include', cache: 'no-store' };
    if (raw) Object.assign(opt, { method: 'POST', headers: { 'Content-Type': raw.type || 'image/jpeg' }, body: raw });
    else if (body) Object.assign(opt, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const r = await fetch(API + p, opt);
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(d.error || 'No se pudo. Probá de nuevo.'), { status: r.status, data: d });
    return d;
  }
  const fallo = (box, err) => { box.textContent = ''; box.appendChild(el('p', 'cvw-aviso cvw-aviso--mal', err.message || String(err))); };

  // Una copia del molde de Webflow (el primer item de la lista), sin los datos de ejemplo
  function molde(lista) {
    const item = lista && lista.querySelector('.w-dyn-item');
    if (!item) return null;
    const m = item.cloneNode(true); item.remove();
    return m;
  }
  function vacio(lista, hay, texto) {
    const box = lista.closest('.w-dyn-list');
    const e = box && box.querySelector('.w-dyn-empty');
    if (e) { e.style.display = hay ? 'none' : 'block'; if (texto) e.firstElementChild.innerHTML = texto; }
  }
  function llenarLista(lista, entradas, m) {
    for (const w of entradas) {
      const it = m.cloneNode(true);
      const a = it.querySelector('a'); a.href = '/wiki/' + w.slug;
      const h2 = it.querySelector('h2'); h2.textContent = w.titulo; h2.classList.remove('w-dyn-bind-empty');
      const img = it.querySelector('img');
      if (img) { if (w.imagen) { img.src = w.imagen; img.classList.remove('w-dyn-bind-empty'); } else img.remove(); }
      lista.appendChild(it);
    }
  }
  // Menu del costado: "Aportá un artículo" y, para los administradores, lo que hay que revisar
  function costado(d) {
    for (const a of $$('a.button.is-primary')) if (/aport/i.test(a.textContent)) a.href = '/aporta-un-articulo';
    if (d.yo && d.yo.admin && d.pendientes) {
      const box = $('.sidebar_buttons');
      if (box && !$('.cvw-revisar')) { const a = el('a', 'button is-primary w-button cvw-revisar', `Revisar propuestas (${d.pendientes})`); a.href = '/wiki?pendientes=1'; box.prepend(a); }
    }
  }

  // ── Todas las entradas / una categoria ──
  async function indice(cat) {
    const lista = $('.wiki-container .w-dyn-items');
    const m = molde(lista);
    const filtros = $('.filters_list');
    const mf = molde(filtros);
    let d;
    try { d = await api('lista' + (cat ? '?categoria=' + encodeURIComponent(cat) : '')); } catch (err) { vacio(lista, false, err.message); return; }
    costado(d);
    if (cat) {
      const h1 = $('h1.h1');
      if (h1) h1.appendChild(document.createTextNode(d.categoria || cat));
      document.title = `Wiki // ${d.categoria || cat} - Círculo Vicioso`;
    }
    if (filtros && mf) {
      const todas = mf.cloneNode(true); const a0 = todas.querySelector('a'); a0.textContent = 'todas'; a0.href = '/wiki'; filtros.appendChild(todas);
      for (const c of d.categorias) { const it = mf.cloneNode(true); const a = it.querySelector('a'); a.textContent = `${c.nombre} (${c.n})`; a.href = '/wiki-categorias/' + c.slug; filtros.appendChild(it); }
      vacio(filtros, true);
    }
    // Buscar entre las entradas
    const wrap = $('.categories_wrapper') || (lista && lista.closest('.box'));
    if (wrap && !cat) {
      const s = el('input', 'form-input w-input cvw-buscar'); s.type = 'search'; s.placeholder = 'Buscar en la wiki…';
      wrap.appendChild(s);
      s.addEventListener('input', () => {
        const t = s.value.trim().toLowerCase();
        for (const it of $$('.w-dyn-item', lista)) it.style.display = !t || it.textContent.toLowerCase().includes(t) ? '' : 'none';
      });
    }
    if (m) llenarLista(lista, d.entradas, m);
    vacio(lista, d.entradas.length, 'No hay nada por acá todavía. <a href="/aporta-un-articulo">Aportá un artículo a la wiki</a>');
    if (q.get('pendientes') && d.yo && d.yo.admin) revisar(lista.closest('.box'));
  }

  // ── Revisar (administradores) ──
  // Diferencias por renglon (lo que se saco, en rojo; lo que se agrego, en verde)
  function diff(a, b) {
    const A = String(a || '').split('\n'), B = String(b || '').split('\n');
    const n = A.length, m = B.length, L = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    const box = el('div', 'cvw-diff'); let i = 0, j = 0;
    const line = (cls, t) => box.appendChild(el('div', cls, t || ' '));
    while (i < n && j < m) { if (A[i] === B[j]) { line('cvw-igual', A[i]); i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) line('cvw-sale', A[i++]); else line('cvw-entra', B[j++]); }
    while (i < n) line('cvw-sale', A[i++]); while (j < m) line('cvw-entra', B[j++]);
    return box;
  }
  async function revisar(box) {
    box.textContent = '';
    const head = el('div', 'box-header large'); head.appendChild(el('h2', 'h2', 'propuestas por revisar')); box.appendChild(head);
    const cuerpo = el('div', 'padding-medium'); box.appendChild(cuerpo);
    let d;
    try { d = await api('pendientes'); } catch (err) { return fallo(cuerpo, err); }
    if (!d.pendientes.length) { cuerpo.appendChild(el('p', 'cvw-aviso', 'No hay nada por revisar.')); return; }
    for (const p of d.pendientes) {
      const card = el('div', 'cvw-propuesta');
      card.appendChild(el('h3', 'h3', p.nueva ? `Entrada nueva: ${p.titulo}` : `Edición de "${p.antes.titulo}"`));
      card.appendChild(el('p', 'caption', `${p.autor || '?'} · ${fecha(p.creada)}${p.categoria ? ' · ' + p.categoria : ''}`));
      if (p.desactualizada) card.appendChild(el('p', 'cvw-aviso', 'Ojo: la entrada cambió después de que se escribió esta propuesta.'));
      if (!p.nueva) {
        if (p.titulo !== p.antes.titulo) card.appendChild(el('p', null, `Título: "${p.antes.titulo}" → "${p.titulo}"`));
        if ((p.categoria || '') !== (p.antes.categoria || '')) card.appendChild(el('p', null, `Categoría: ${p.antes.categoria || '(ninguna)'} → ${p.categoria || '(ninguna)'}`));
        if ((p.imagen || '') !== (p.antes.imagen || '')) card.appendChild(el('p', null, p.imagen ? 'Cambia la foto:' : 'Saca la foto.'));
        card.appendChild(diff(p.antes.contenido, p.contenido));
      } else {
        const prev = el('div', 'w-richtext cvw-vista'); prev.innerHTML = p.html; card.appendChild(prev);
      }
      if (p.imagen && (p.nueva || p.imagen !== p.antes.imagen)) { const i = el('img', 'cvw-foto'); i.src = p.imagen; card.appendChild(i); }
      const bot = el('div', 'cvw-botones');
      const ap = el('button', 'button is-primary w-button', 'Aprobar'), re = el('button', 'button w-button cvw-sec', 'Rechazar');
      const estado = el('p', 'caption');
      ap.onclick = async () => { ap.disabled = re.disabled = true; try { const r = await api('revisar', { id: p.id, accion: 'aprobar' }); estado.innerHTML = `Aprobada: <a href="/wiki/${r.slug}">ver la entrada</a>`; } catch (err) { estado.textContent = err.message; ap.disabled = re.disabled = false; } };
      re.onclick = async () => { const nota = prompt('¿Por qué? (lo ve quien la propuso; podés dejarlo vacío)', ''); if (nota === null) return; ap.disabled = re.disabled = true; try { await api('revisar', { id: p.id, accion: 'rechazar', nota }); estado.textContent = 'Rechazada.'; } catch (err) { estado.textContent = err.message; ap.disabled = re.disabled = false; } };
      bot.append(ap, re); card.append(bot, estado); cuerpo.appendChild(card);
    }
  }

  // ── Una entrada ──
  async function entrada(slug) {
    const rich = $('.w-richtext');
    const rel = $('.related-list'); const mr = molde(rel);
    let d;
    try { d = await api('entrada?slug=' + encodeURIComponent(slug)); } catch (err) {
      $('h1.h1').textContent = 'No encontrada'; rich.classList.remove('w-dyn-bind-empty');
      rich.innerHTML = '<p>No hay ninguna entrada con ese nombre. <a href="/wiki">Volver a la wiki</a></p>';
      $('.toc_wrapper') && ($('.toc_wrapper').style.display = 'none'); $$('.wiki-img').forEach(i => i.remove());
      return;
    }
    let w = d.entrada;
    let version = null;
    if (q.get('version')) { try { version = (await api('version?id=' + encodeURIComponent(q.get('version')))).version; } catch { /* la actual */ } }
    const ver = version || w;
    document.title = `${ver.titulo} - Círculo Vicioso`;
    const h1 = $('.html-embed-2 h1.h1') || $('h1.h1'); h1.textContent = ver.titulo;
    const wl = $('.html-embed-2 a.h1'); if (wl) wl.href = '/wiki';
    const img = $('.wiki-img');
    if (img) { if (ver.imagen) { img.src = ver.imagen; img.classList.remove('w-dyn-bind-empty'); } else img.remove(); }
    rich.classList.remove('w-dyn-bind-empty');
    rich.innerHTML = version ? version.html : w.html;
    // Indice de la entrada (los titulos del texto)
    const toc = $('.toc_wrapper .padding-small');
    if (toc) {
      toc.textContent = '';
      const heads = $$('h2[id], h3[id], h4[id]', rich);
      if (!heads.length) $('.toc_wrapper').style.display = 'none';
      for (const hd of heads) { const it = el('div', 'toc_item'); if (hd.tagName !== 'H2') it.classList.add('padding-left', 'padding-small'); const a = el('a', 'link', hd.textContent); a.href = location.pathname + location.search + '#' + hd.id; it.appendChild(a); toc.appendChild(it); }
    }
    // Quien la escribio, cuando, y el historial
    const meta = el('div', 'cvw-meta');
    if (version) {
      const v = el('p', 'cvw-aviso', `Versión del ${fecha(version.fecha)} (de ${version.autor}${version.estado === 'pendiente' ? ', todavía sin aprobar' : ''}). `);
      const a = el('a', null, 'Ver la actual'); a.href = '/wiki/' + w.slug; v.appendChild(a);
      if (d.yo && d.yo.admin && version.estado === 'aprobada') {
        const b = el('button', 'button is-primary w-button', 'Volver a esta versión');
        b.onclick = async () => { b.disabled = true; try { await api('volver', { id: version.id }); location.href = '/wiki/' + w.slug; } catch (err) { alert(err.message); b.disabled = false; } };
        v.appendChild(el('br')); v.appendChild(b);
      }
      meta.appendChild(v);
    }
    if (w.borrada) meta.appendChild(el('p', 'cvw-aviso cvw-aviso--mal', 'Esta entrada está sacada de la wiki: solo la ven los administradores.'));
    const otros = (w.editores || []).filter(n => n !== w.autor);
    meta.appendChild(el('p', 'caption', `Escrita por ${w.autor}${otros.length ? ', con aportes de ' + otros.join(', ') : ''} · actualizada el ${fecha(w.actualizada)}`));
    if (d.historial.length > 1 || (d.historial[0] && d.historial[0].estado === 'pendiente')) {
      const det = el('details', 'cvw-historial'); det.appendChild(el('summary', 'caption', `historial (${d.historial.length})`));
      for (const r of d.historial) {
        const a = el('a', 'link', `${fecha(r.fecha)} · ${r.autor}${r.actual ? ' · actual' : r.estado === 'pendiente' ? ' · sin aprobar' : ''}`);
        a.href = `/wiki/${w.slug}?version=${r.id}`; det.appendChild(el('div', 'toc_item')).appendChild(a);
      }
      meta.appendChild(det);
    }
    rich.after(meta);
    // Botones: proponer una edicion o una entrada nueva; los administradores, sacarla o devolverla
    const botones = $('.wiki-buttons');
    if (botones) {
      const ed = el('a', 'button is-primary w-button', '[+] sugerí una edición'); ed.href = '/ediciones?articulo=' + encodeURIComponent(w.slug);
      const nu = el('a', 'button w-button cvw-sec', '[+] aportá un nuevo artículo'); nu.href = '/aporta-un-articulo';
      botones.append(ed, nu);
      if (d.yo && d.yo.admin) {
        const b = el('button', 'button w-button cvw-sec', w.borrada ? 'Volver a poner en la wiki' : 'Sacar de la wiki');
        b.onclick = async () => { if (!w.borrada && !confirm('¿Sacar esta entrada de la wiki? Se puede volver a poner.')) return; try { await api('borrar', { slug: w.slug, volver: w.borrada }); location.reload(); } catch (err) { alert(err.message); } };
        botones.append(b);
      }
    }
    // El lapiz de arriba: lo mismo que "sugerí una edición"
    const tip = $('.tooltip_cont p');
    if (tip) { tip.textContent = ''; const a = el('a', null, d.yo ? 'Sugerí una edición' : 'Iniciá sesión para sugerir una edición'); a.href = d.yo ? '/ediciones?articulo=' + encodeURIComponent(w.slug) : entrar(); tip.append(a, document.createTextNode(d.yo ? ' o aportá un artículo nuevo.' : ' o aportar artículos nuevos.')); }
    if (rel && mr) {
      for (const r of d.relacionadas) { const it = mr.cloneNode(true); const a = it.querySelector('a'); a.href = '/wiki/' + r.slug; a.textContent = r.titulo; rel.appendChild(it); }
      vacio(rel, d.relacionadas.length, w.categoria ? 'No hay otras entradas en ' + w.categoria + '.' : 'No hay entradas relacionadas.');
      const pie = $('.col-account_links.is-footer');
      if (pie && w.categoria) { const a = el('a', 'link', `[+] todo ${w.categoria}`); a.href = '/wiki-categorias/' + w.categoriaSlug; pie.appendChild(a); }
    }
    if (location.hash) { const t = document.getElementById(decodeURIComponent(location.hash.slice(1))); if (t) t.scrollIntoView(); }
  }

  // ── Proponer una entrada nueva o una edicion ──
  // El formulario de Webflow se reemplaza por este (con las mismas clases), para que no lo mande Webflow
  async function formulario(slug) {
    const caja = $('.w-form');
    if (!caja) return;
    caja.className = 'cvw-form';
    caja.textContent = '';
    const espera = el('p', 'caption', 'Cargando…'); caja.appendChild(espera);
    let lista, actual = null;
    try {
      lista = await api('lista');
      if (slug) actual = (await api('entrada?slug=' + encodeURIComponent(slug))).entrada;
    } catch (err) { return fallo(caja, err); }
    espera.remove();
    costado(lista);
    const h1 = $('h1.h1');
    if (slug && h1) h1.textContent = actual ? `wiki // sugerí una edición: ${actual.titulo}` : 'wiki // sugerí una edición';
    if (!lista.yo) {
      const p = el('p', null, 'Para aportar a la wiki tenés que iniciar sesión con tu cuenta de Círculo Vicioso (la misma del chat y del foro). ');
      const a = el('a', 'button is-primary w-button', 'Iniciar sesión o registrarte'); a.href = entrar();
      caja.append(p, a); return;
    }
    if (slug && !actual) { caja.appendChild(el('p', null, 'Elegí la entrada que querés editar desde la wiki (botón "sugerí una edición").')); return; }
    const f = el('form');
    const campo = (label, input, ayuda) => {
      const d = el('div', 'margin-bottom margin-small'); const l = el('label', 'caption', label); l.htmlFor = input.id;
      d.append(l, input); if (ayuda) d.appendChild(ayuda); f.appendChild(d); return d;
    };
    const tit = el('input', 'form-input w-input'); tit.id = 'cvw-titulo'; tit.maxLength = 120; tit.required = true;
    const cat = el('input', 'form-input w-input'); cat.id = 'cvw-categoria'; cat.maxLength = 40; cat.setAttribute('list', 'cvw-categorias'); cat.placeholder = 'Lore, Efectos…';
    const dl = el('datalist'); dl.id = 'cvw-categorias'; for (const c of lista.categorias) { const o = el('option'); o.value = c.nombre; dl.appendChild(o); }
    const txt = el('textarea', 'form-input is-field w-input'); txt.id = 'cvw-contenido'; txt.maxLength = 60000; txt.required = true; txt.placeholder = 'Tu contenido va acá.'; txt.rows = 14;
    campo('título', tit); campo('categoría', cat).appendChild(dl);
    // Foto principal
    let imagen = actual ? actual.imagen : null;
    const fotoBox = el('div', 'cvw-foto-box');
    const fotoImg = el('img', 'cvw-foto'); const fotoIn = el('input'); fotoIn.type = 'file'; fotoIn.accept = 'image/*'; fotoIn.id = 'cvw-foto';
    const sacar = el('button', 'button w-button cvw-sec cvw-chico', 'Sacar la foto'); sacar.type = 'button';
    const pintar = () => { fotoImg.hidden = !imagen; sacar.hidden = !imagen; if (imagen) fotoImg.src = imagen; };
    sacar.onclick = () => { imagen = null; pintar(); };
    fotoBox.append(fotoImg, fotoIn, sacar); campo('foto (opcional)', fotoIn).appendChild(fotoBox); fotoBox.prepend(fotoImg); pintar();
    const subir = async (file) => { const r = await api('imagen', null, file); return r.url; };
    fotoIn.onchange = async () => { const file = fotoIn.files[0]; if (!file) return; try { imagen = await subir(file); pintar(); } catch (err) { alert(err.message); } fotoIn.value = ''; };
    // Contenido, con un boton para meter fotos en el texto
    const ayuda = el('div', 'align-right');
    const meter = el('label', 'caption xsmall cvw-meter'); const meterIn = el('input'); meterIn.type = 'file'; meterIn.accept = 'image/*'; meterIn.hidden = true;
    meter.append(document.createTextNode('[+] agregar una foto al texto'), meterIn);
    meterIn.onchange = async () => {
      const file = meterIn.files[0]; if (!file) return;
      try { const url = await subir(file); const pos = txt.selectionStart || txt.value.length; txt.value = txt.value.slice(0, pos) + `\n![](${url})\n` + txt.value.slice(pos); } catch (err) { alert(err.message); }
      meterIn.value = '';
    };
    const md = el('label', 'caption xsmall'); md.innerHTML = 'dale formato usando <a href="https://simplemde.com/markdown-guide" target="_blank" rel="noopener">markdown</a>: # título, **negrita**, *cursiva*, - listas, [enlace](https://…).';
    ayuda.append(meter, el('br'), md);
    campo('contenido', txt, ayuda);
    if (actual) { tit.value = actual.titulo; cat.value = actual.categoria || ''; txt.value = actual.contenido; }
    const enviar = el('input', 'button is-primary w-button'); enviar.type = 'submit'; enviar.value = lista.yo.admin ? 'Publicar' : 'Proponer';
    const estado = el('div', 'cvw-estado');
    f.append(enviar, estado);
    caja.appendChild(f);
    if (!lista.yo.admin) caja.appendChild(el('p', 'caption xsmall', 'Un administrador la revisa antes de que aparezca en la wiki.'));
    f.addEventListener('submit', async (e) => {
      e.preventDefault(); e.stopImmediatePropagation();
      enviar.disabled = true; estado.textContent = '';
      try {
        const r = await api('proponer', { slug: actual ? actual.slug : undefined, titulo: tit.value, categoria: cat.value, contenido: txt.value, imagen });
        f.remove();
        const ok = el('div', 'form_output'); caja.appendChild(ok);
        if (r.estado === 'publicada') { ok.innerHTML = '<p>Listo, ya está en la wiki. </p>'; const a = el('a', 'link', '[+] ver la entrada'); a.href = '/wiki/' + r.slug; ok.firstChild.appendChild(a); }
        else ok.appendChild(el('p', null, 'Gracias por tu aporte. Si lo aprobamos, pronto lo vas a ver en la wiki.'));
      } catch (err) {
        enviar.disabled = false;
        estado.appendChild(el('p', 'cvw-aviso cvw-aviso--mal', err.message));
        if (err.data && err.data.slug) { const a = el('a', 'link', '[+] ir a esa entrada'); a.href = '/wiki/' + err.data.slug; estado.appendChild(a); }
      }
    }, true);
    // "Últimas sugerencias" (ediciones.html): las propuestas propias y como quedaron
    const sug = $('.wiki-suggestion') && $('.wiki-suggestion').closest('.box');
    if (sug) {
      sug.textContent = '';
      const head = el('div', 'box-header large'); head.appendChild(el('h2', 'h2', 'tus propuestas')); sug.appendChild(head);
      const cuerpo = el('div', 'padding-medium'); sug.appendChild(cuerpo);
      try {
        const m = await api('mias');
        if (!m.propuestas.length) cuerpo.appendChild(el('p', 'caption', 'Todavía no propusiste nada.'));
        const EST = { pendiente: 'esperando que la revisen', aprobada: 'aprobada', rechazada: 'no se aprobó' };
        for (const p of m.propuestas) {
          const it = el('div', 'toc_item');
          const a = el('a', 'link', `${p.titulo} · ${EST[p.estado] || p.estado} · ${fecha(p.creada)}`);
          a.href = p.slug ? `/wiki/${p.slug}?version=${p.id}` : '#'; it.appendChild(a);
          if (p.nota) it.appendChild(el('p', 'caption xsmall', 'Nota: ' + p.nota));
          cuerpo.appendChild(it);
        }
      } catch { /* sin lista */ }
    }
  }

  // La portada (index.html): las ultimas entradas en la pestaña "wiki"
  async function portada() {
    const lista = $('[data-w-tab="Wiki"] .wiki-container .w-dyn-items');
    if (!lista) return;
    const m = molde(lista);
    try {
      const d = await api('lista');
      const ult = d.entradas.slice().sort((a, b) => b.actualizada - a.actualizada).slice(0, 6);
      if (m) llenarLista(lista, ult, m);
      vacio(lista, ult.length);
    } catch { /* queda el cartel */ }
  }

  function start() {
    let m;
    if (ruta === '/' || ruta === '/index') portada();
    else if (ruta === '/wiki') indice(null);
    else if ((m = ruta.match(/^\/wiki-categorias\/([^/]+)$/))) indice(decodeURIComponent(m[1]));
    else if ((m = ruta.match(/^\/wiki\/([^/]+)$/))) entrada(decodeURIComponent(m[1]));
    else if (ruta === '/aporta-un-articulo') formulario(null);
    else if (ruta === '/ediciones') formulario(q.get('articulo') || '');
  }
  start();
})();
