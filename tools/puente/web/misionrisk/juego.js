// GlobalSiege (antes MissionRisk, de Doug Burner, GNU GPL v3: https://github.com/labarks/globalsiege)
// en la seccion Juegos: la sala, crear una partida, las reglas y la mesa con el mapa. Lo carga
// aviso.js (el marco de Juegos) la primera vez que se abre el juego, despues de mapa.js; el
// servidor es misionrisk.js. El mapa es el del original: mapa.jpg y, encima, cada pais pintado
// del color de su ejercito con su silueta de paises.png.
(function () {
  'use strict';
  const MAPA = window.MRMapa;
  const P = MAPA.paises, EJ = MAPA.ejercitos;
  const ARTE = '/puente/misionrisk/';
  const FUENTE = 'https://github.com/labarks/globalsiege';
  let A = null; // lo que presta el marco de Juegos (aviso.js)
  let M = null; // la mesa abierta
  const el = (t, c, x) => A.el(t, c, x);
  const btn = (texto, cls, fn) => { const b = el('button', 'jg-btn' + (cls ? ' ' + cls : ''), texto); b.type = 'button'; if (fn) b.addEventListener('click', fn); return b; };
  const accion = async (d) => { const r = await A.emit('mr:accion', { id: M && M.id, ...d }); if (r.error) A.toast(r.error, 'error'); return r; };

  // ── El arte ──
  // Todo del original (tools/misionrisk/armar-arte.js): el mapa, las mascaras de relieve de los
  // paises (1 gris clara, 2 gris oscura, 3 azul) y los dados; las cartas van por CSS (juego.css)
  const arte = { mapa: new Image(), 1: new Image(), 2: new Image(), 3: new Image(), dados: new Image(), alfa: null, ancho: 0, tintes: new Map() };
  let arteListo = null;
  let ding = null;
  function cargarArte() {
    if (arteListo) return arteListo;
    arteListo = Promise.all([['mapa', 'mapa.jpg'], [1, 'paises-1.png'], [2, 'paises-2.png'], [3, 'paises-3.png'], ['dados', 'dados.png']].map(([k, f]) => new Promise((ok, mal) => {
      arte[k].onload = ok; arte[k].onerror = mal; arte[k].src = ARTE + f;
    }))).then(() => {
      // La transparencia de cada silueta, para saber que pais se toco
      const c = document.createElement('canvas'); c.width = arte[1].width; c.height = arte[1].height;
      const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(arte[1], 0, 0);
      const d = x.getImageData(0, 0, c.width, c.height).data;
      arte.ancho = c.width; arte.alfa = new Uint8Array(c.width * c.height);
      for (let i = 0; i < arte.alfa.length; i++) arte.alfa[i] = d[i * 4 + 3];
    }).catch((e) => { arteListo = null; throw e; });
    return arteListo;
  }
  // El pais en un punto del mapa (si no hay ninguno justo ahi, el mas cercano: las islas chicas)
  function paisEn(x, y) {
    for (let id = 1; id <= 42; id++) {
      const p = P[id];
      if (x < p.x || y < p.y || x >= p.x + p.w || y >= p.y + p.h) continue;
      if (arte.alfa[(p.sy + Math.floor(y - p.y)) * arte.ancho + p.sx + Math.floor(x - p.x)] > 90) return id;
    }
    let mejor = 0, dm = 24 * 24;
    for (let id = 1; id <= 42; id++) { const dx = P[id].nx - x, dy = P[id].ny - y, d = dx * dx + dy * dy; if (d < dm) { dm = d; mejor = id; } }
    return mejor;
  }
  // Cada pais como lo pinta el original (ColorCountry): la mascara de relieve del ejercito
  // combinada con su color (el AND de BitBlt; con colores puros es lo mismo que multiplicar)
  function tinte(id, e, modo) {
    const k = id + ':' + e + modo;
    let c = arte.tintes.get(k);
    if (c) return c;
    const p = P[id], E = EJ[e], hoja = arte[E.mascara];
    c = document.createElement('canvas'); c.width = p.w; c.height = p.h;
    const x = c.getContext('2d');
    x.drawImage(hoja, p.sx, p.sy, p.w, p.h, 0, 0, p.w, p.h);
    x.globalCompositeOperation = 'multiply'; x.fillStyle = E.pintura; x.fillRect(0, 0, p.w, p.h);
    if (modo === 'luz') { x.globalCompositeOperation = 'lighter'; x.fillStyle = 'rgba(255,255,255,0.32)'; x.fillRect(0, 0, p.w, p.h); }
    x.globalCompositeOperation = 'destination-in'; x.drawImage(hoja, p.sx, p.sy, p.w, p.h, 0, 0, p.w, p.h);
    arte.tintes.set(k, c);
    return c;
  }
  // El sonido del original, cuando te toca
  function sonarDing() {
    try { ding = ding || new Audio(ARTE + 'ding.wav'); ding.currentTime = 0; ding.play().catch(() => {}); } catch { /* sin sonido */ }
  }

  // ── Las cartas (las del original: cartas.png, 60x85; abajo, las mismas elegidas) ──
  const CARTA = { 1: 'Artillería', 2: 'Infantería', 3: 'Caballería', 4: 'Comodín' };
  function carta(tipo, sel, fn) {
    const c = el(fn ? 'button' : 'div', 'mr-carta' + (sel ? ' sel' : ''));
    if (fn) { c.type = 'button'; c.addEventListener('click', fn); }
    c.title = CARTA[tipo]; c.setAttribute('aria-label', CARTA[tipo] + (sel ? ' (elegida)' : ''));
    c.style.backgroundPosition = `${-60 * tipo}px ${sel ? -85 : 0}px`;
    return c;
  }
  // Las cartas de los demas, boca abajo y chiquitas (cartitas.png)
  function dorsos(n) {
    const w = el('span', 'mr-dorsos'); w.title = `${n} ${n === 1 ? 'carta' : 'cartas'}`;
    for (let i = 0; i < n; i++) w.appendChild(el('span', 'mr-dorso'));
    if (!n) w.textContent = 'sin cartas';
    return w;
  }
  const valorCartas = (c) => {
    if (c.length !== 3) return 0;
    const com = c.filter(x => x === 4).length, resto = c.filter(x => x !== 4);
    if (com >= 2) return 10;
    if (com === 1) return resto[0] === resto[1] ? { 1: 4, 2: 6, 3: 8 }[resto[0]] : 10;
    if (c[0] === c[1] && c[1] === c[2]) return { 1: 4, 2: 6, 3: 8 }[c[0]];
    return new Set(c).size === 3 ? 10 : 0;
  };

  // ── La sala ──
  async function inicio() {
    const page = A.page();
    page.appendChild(A.head('GlobalSiege', A.botonEnlace('/app?juegos=globalsiege', 'GlobalSiege · __PUENTE_APP__')));
    const b = el('div', 'jg-cuerpo jg-inicio mr-ui'); page.appendChild(b);
    const hero = el('div', 'jg-hero mr-hero');
    hero.append(el('div', 'jg-hero-t', 'GlobalSiege'), el('div', 'jg-hero-s', 'El MissionRisk de siempre: la guerra por el mundo, de 2 a 6 ejércitos'));
    const acc = el('div', 'jg-acciones');
    acc.append(
      btn('Crear partida', 'jg-primario', () => A.go('mrCrear')),
      btn('Jugar con la compu', '', async () => {
        const misiones = await elegirModo();
        if (misiones === null) return;
        const r = await A.emit('mr:crear', { total: 4, modo: 'compu', nivel: 2, misiones });
        if (r.error) return A.toast(r.error, 'error');
        A.go('mrMesa', r.id);
      }),
      btn('Cómo se juega', 'jg-suave', () => A.go('mrReglas')),
    );
    hero.appendChild(acc); b.appendChild(hero);
    const box = el('div'); box.appendChild(el('div', 'jg-estado', 'Cargando…')); b.appendChild(box);
    const d = await A.emit('mr:inicio');
    if (!box.isConnected) return;
    box.textContent = '';
    if (d.error) { box.appendChild(el('div', 'jg-estado', d.error)); return; }
    const section = (title, items, render) => { if (!items.length) return; box.appendChild(el('div', 'jg-sub', title)); const l = el('div', 'jg-lista'); items.forEach(x => l.appendChild(render(x))); box.appendChild(l); };
    const row = (who, top, bottom, label, cls, fn) => {
      const r = el('button', 'jg-fila'); r.type = 'button';
      const t = el('div', 'jg-ftexto'); t.append(el('div', 'jg-fnombre', top), el('div', 'jg-fmeta', bottom));
      r.append(A.avatar(who), t);
      if (label) r.appendChild(el('span', 'jg-chip ' + (cls || ''), label));
      r.addEventListener('click', fn);
      return r;
    };
    const mesaTxt = (m) => `${m.total} ejércitos · ${m.sentados} ${m.sentados === 1 ? 'persona' : 'personas'}${m.misiones === false ? ' · sin misiones' : ''}`;
    section('Te invitaron', d.abiertas.filter(a => a.paraVos), (a) => row(a.creador, `${a.creador.nombre} te invitó a una guerra`, mesaTxt(a), 'Entrar', 'azul', () => unirse(a.id)));
    section('Tus partidas', d.mias, (m) => {
      const top = m.estado === 'esperando' ? `Esperando gente (${m.sentados} de ${m.total})` : `Con ${m.rival.nombre}`;
      const bottom = m.estado === 'terminada' ? (m.ganaste ? '🏆 Ganaste' : 'Perdiste') : m.estado === 'jugando' ? `${m.ejercito}${m.vivo ? '' : ' (aniquilado)'} · ronda ${m.ronda}` : `${m.total} ejércitos`;
      const r = row({ nombre: '⚔' }, top, bottom, m.teToca ? 'Te toca' : '', 'amarillo', () => A.go('mrMesa', m.id));
      if (m.color) { const av = r.querySelector('.jg-av'); if (av) { av.textContent = ''; av.style.background = m.color; } }
      return r;
    });
    section('Mesas esperando gente', d.abiertas.filter(a => !a.paraVos), (a) => row(a.creador, a.creador.nombre, mesaTxt(a), 'Entrar', 'azul', () => unirse(a.id)));
    if (!d.abiertas.length && !d.mias.length) box.appendChild(el('div', 'jg-vacio', 'No hay mesas esperando. ¡Creá una partida o jugá con la compu!'));
    const s = d.stats;
    box.appendChild(el('div', 'jg-sub', 'Tu récord'));
    const st = el('div', 'jg-stats');
    for (const [n, l] of [[s.ganadas, 'ganadas'], [s.perdidas, 'perdidas'], [`${s.compuGanadas}-${s.compuPerdidas}`, 'vs la compu']]) { const x = el('div', 'jg-stat'); x.append(el('div', 'jg-stat-n', String(n)), el('div', 'jg-stat-l', l)); st.appendChild(x); }
    box.appendChild(st);
    const rk = el('div', 'jg-rankings'); b.appendChild(rk);
    for (const [k, title] of [['mes', 'Ranking del mes'], ['total', 'Ranking histórico']]) {
      const list = d.ranking[k];
      rk.appendChild(el('div', 'jg-sub', title));
      if (!list.length) { rk.appendChild(el('div', 'jg-vacio', 'Todavía nadie ganó una guerra contra otras personas.')); continue; }
      const l = el('div', 'jg-lista');
      list.forEach((p, i) => { const r = el('div', 'jg-fila jg-rank'); r.append(el('span', 'jg-pos', ['🥇', '🥈', '🥉'][i] || String(i + 1)), A.avatar(p), el('span', 'jg-fnombre', p.nombre), el('span', 'jg-chip', `${p.ganadas} ${p.ganadas === 1 ? 'victoria' : 'victorias'}`)); l.appendChild(r); });
      rk.appendChild(l);
    }
    b.appendChild(credito());
  }
  // Con misiones secretas o a conquistar el mundo (como la casilla "Misión" del original).
  // Devuelve true, false o null (si se cierra sin elegir)
  function elegirModo() {
    return new Promise((res) => {
      const fondo = el('div', 'jg-aviso-fondo');
      const box = el('div', 'jg-aviso'); box.setAttribute('role', 'dialog');
      const acc = el('div', 'jg-aviso-acc mr-modos');
      const fin = (v) => { fondo.remove(); res(v); };
      acc.append(btn('Con misiones secretas', 'jg-primario', () => fin(true)), btn('Conquistar el mundo', 'jg-primario', () => fin(false)), btn('Cancelar', '', () => fin(null)));
      box.append(el('div', 'jg-aviso-t', '¿Cómo querés jugar?'), el('div', 'jg-aviso-s', 'Con misiones, cada ejército recibe una secreta (aniquilar a otro, conquistar dos continentes u ocupar 18 países). Sin misiones, gana el que conquista el mundo.'), acc);
      fondo.appendChild(box);
      fondo.addEventListener('click', (e) => { if (e.target === fondo) fin(null); });
      A.page().appendChild(fondo);
    });
  }
  function credito() {
    const c = el('div', 'mr-credito');
    c.append('GlobalSiege (antes MissionRisk) es de Doug Burner y es software libre (GNU GPL v3). ');
    const a = el('a', null, 'Código del juego'); a.href = FUENTE; a.target = '_blank'; a.rel = 'noopener';
    c.appendChild(a);
    return c;
  }
  async function unirse(id) {
    const r = await A.emit('mr:unirse', { id });
    if (r.error) return A.toast(r.error, 'error');
    A.go('mrMesa', r.id);
  }

  // ── Crear partida ──
  function crear() {
    const page = A.page();
    page.appendChild(A.head('Nueva guerra'));
    const b = el('div', 'jg-cuerpo mr-ui'); page.appendChild(b);
    const f = el('div', 'jg-form'); b.appendChild(f);
    const data = { total: 4, modo: 'compu', nivel: 2, misiones: true, buitre: false, privada: false, invitados: [] };
    const seg = (label, key, opts, onChange) => {
      const w = el('div', 'jg-campo'); w.appendChild(el('span', 'jg-etq', label));
      const s = el('div', 'jg-seg');
      for (const [v, l] of opts) {
        const x = el('button', 'jg-seg-op', l); x.type = 'button'; x.classList.toggle('on', data[key] === v);
        x.addEventListener('click', () => { data[key] = v; s.querySelectorAll('.jg-seg-op').forEach(y => y.classList.toggle('on', y === x)); if (onChange) onChange(); });
        s.appendChild(x);
      }
      w.appendChild(s); f.appendChild(w); return w;
    };
    seg('Cuántos ejércitos', 'total', [[2, '2'], [3, '3'], [4, '4'], [5, '5'], [6, '6']]);
    seg('Contra quién', 'modo', [['compu', 'La compu'], ['gente', 'Gente del chat']], () => { gente.hidden = data.modo !== 'gente'; hint.textContent = HINT[data.modo]; });
    const HINT = {
      compu: 'Vos contra la compu: los demás ejércitos los juega ella. No cuenta para el ranking.',
      gente: 'La mesa queda en la sala hasta que se llene o hasta que toques "Empezar": los lugares vacíos los juega la compu. Cada turno tiene 4 minutos; si alguien no juega, la compu juega por él hasta que vuelva.',
    };
    const hint = el('div', 'jg-ayuda', HINT.compu); f.appendChild(hint);
    seg('Nivel de la compu', 'nivel', [[1, 'Promedio'], [2, 'Sagaz']]);
    seg('Misiones', 'misiones', [[true, 'Con misiones secretas'], [false, 'Conquistar el mundo']]);
    seg('Cartas del aniquilado', 'buitre', [[false, 'No'], [true, 'Se las queda el que lo aniquila']]);
    // Con gente: abierta o solo para los invitados, y a quien invitar
    const gente = el('div'); gente.hidden = true; f.appendChild(gente);
    {
      const w = el('div', 'jg-campo'); w.appendChild(el('span', 'jg-etq', 'Quién puede entrar'));
      const s = el('div', 'jg-seg');
      for (const [v, l] of [[false, 'Cualquiera'], [true, 'Solo invitados']]) {
        const x = el('button', 'jg-seg-op', l); x.type = 'button'; x.classList.toggle('on', data.privada === v);
        x.addEventListener('click', () => { data.privada = v; s.querySelectorAll('.jg-seg-op').forEach(y => y.classList.toggle('on', y === x)); });
        s.appendChild(x);
      }
      w.appendChild(s); gente.appendChild(w);
      const pick = el('div', 'jg-campo'); pick.appendChild(el('span', 'jg-etq', 'Invitar (les llega un aviso)'));
      const sbox = el('label', 'jg-buscar'); sbox.insertAdjacentHTML('beforeend', A.svg(A.I.buscar, 20));
      const q = el('input'); q.type = 'search'; q.placeholder = 'Buscar a quién invitar'; sbox.appendChild(q);
      const elegidos = el('div', 'mr-invitados');
      const list = el('div', 'jg-lista');
      pick.append(sbox, elegidos, list); gente.appendChild(pick);
      const pintar = () => {
        elegidos.textContent = '';
        for (const p of data.invitados) {
          const c = el('button', 'jg-chip mr-inv', p.nombre + ' ✕'); c.type = 'button'; c.title = 'Sacar';
          c.addEventListener('click', () => { data.invitados = data.invitados.filter(x => x.id !== p.id); pintar(); });
          elegidos.appendChild(c);
        }
      };
      let t = null, seq = 0;
      q.addEventListener('input', () => {
        clearTimeout(t);
        t = setTimeout(async () => {
          const my = ++seq;
          let ps = [];
          if (q.value.trim().length >= 2) {
            try { ps = ((await (await fetch('/puente/api/mercado/personas?q=' + encodeURIComponent(q.value.trim()), { headers: { Authorization: 'Bearer ' + localStorage.getItem('haven_token') } })).json()).personas) || []; } catch { ps = []; }
          }
          if (my !== seq || !list.isConnected) return;
          list.textContent = '';
          for (const p of ps) {
            const r = el('button', 'jg-fila'); r.type = 'button';
            const tx = el('div', 'jg-ftexto'); tx.append(el('div', 'jg-fnombre', p.nombre), el('div', 'jg-fmeta', '@' + p.usuario));
            r.append(A.avatar(p), tx);
            r.addEventListener('click', () => {
              if (data.invitados.length >= data.total - 1) { A.toast(`En una guerra de ${data.total} entran ${data.total - 1} invitados.`, 'error'); return; }
              if (!data.invitados.some(x => x.id === p.id)) data.invitados.push(p);
              pintar(); list.textContent = ''; q.value = '';
            });
            list.appendChild(r);
          }
        }, 300);
      });
    }
    const err = el('div', 'jg-error'); f.appendChild(err);
    const go2 = btn('Crear partida', 'jg-primario jg-ancho'); f.appendChild(go2);
    go2.addEventListener('click', async () => {
      err.textContent = '';
      go2.disabled = true;
      const r = await A.emit('mr:crear', { total: data.total, modo: data.modo, nivel: data.nivel, misiones: data.misiones, buitre: data.buitre, privada: data.privada, invitados: data.invitados.map(p => p.id) });
      go2.disabled = false;
      if (r.error) { err.textContent = r.error; return; }
      A.stack().pop(); A.go('mrMesa', r.id);
    });
  }

  // ── Reglas ──
  function reglas() {
    const page = A.page();
    page.appendChild(A.head('Cómo se juega'));
    const b = el('div', 'jg-cuerpo mr-ui mr-reglas'); page.appendChild(b);
    const sec = (t, ...ps) => { b.appendChild(el('div', 'jg-sub', t)); for (const p of ps) b.appendChild(el('p', null, p)); };
    sec('El objetivo', 'Cada ejército recibe una misión secreta: aniquilar a otro ejército, conquistar dos continentes o ocupar 18 países. Gana el primero que la cumple (las de continentes y países, si las mantiene hasta su próximo turno). Si se juega sin misiones, gana el que conquista el mundo. Conquistar el mundo gana siempre.');
    sec('1. Tropas nuevas', 'Al empezar el turno recibís una tropa cada 3 países (como mínimo 3) y, por cada continente entero que tengas: América del Norte 5, América del Sur 2, Europa 5, África 3, Asia 7 y Australia 2. Tocá tus países para ponerlas (con los botones elegís de a cuántas).');
    sec('2. Atacar', 'Tocá un país enemigo y después tus países vecinos para juntar tropas (de uno o de varios: siempre queda una en cada país). Con "Tirar" se tiran los dados: atacás con hasta 3 y el que defiende con hasta 2; se comparan de mayor a menor y en cada par pierde una tropa el más bajo (el empate lo gana el que defiende). Podés seguir tirando, juntar más tropas o retirarte. Si lo conquistás, entran todas las tropas que juntaste.');
    sec('3. Mover', 'Pasá tropas entre países tuyos vecinos: tocá de dónde salen y después adónde van. Una vez que movés, ya no podés atacar en ese turno. Las tropas pueden dar un paso más después de llegar, pero de a 5 como mucho.');
    sec('4. Las cartas', 'Si conquistaste al menos un país en tu turno, al terminarlo te llevás una carta. Tres iguales se canjean por tropas: artillería 4, infantería 6 y caballería 8; una de cada una, 10. El comodín reemplaza a cualquiera. Con 5 cartas en la mano tenés que canjear.');
    sec('Con gente', 'Cada turno tiene 4 minutos (cada jugada lo estira un poco). Si se te pasa, la compu juega por tu ejército hasta que vuelvas.');
    b.appendChild(credito());
  }

  // ── La mesa ──
  async function mesa(id) {
    salir();
    const page = A.page();
    M = { id, s: null, cant: { poner: 1, juntar: 0, mover: 0 }, origen: 0, sel: [], zoom: false, reloj: null };
    const yo = M;
    const salirBtn = el('button', 'jg-btn jg-salir'); salirBtn.type = 'button'; salirBtn.style.visibility = 'hidden';
    salirBtn.addEventListener('click', menuSalir);
    page.appendChild(A.head('GlobalSiege', salirBtn));
    M.salirBtn = salirBtn;
    const b = el('div', 'jg-cuerpo mr-ui mr-mesa'); page.appendChild(b);
    const izq = el('div', 'mr-izq'), der = el('div', 'mr-der');
    b.append(izq, der);
    M.wrap = el('div', 'mr-mapa');
    M.cv = el('canvas', 'mr-lienzo');
    M.cv.setAttribute('role', 'img'); M.cv.setAttribute('aria-label', 'Mapa de GlobalSiege');
    M.wrap.appendChild(M.cv);
    M.zoomBtn = el('button', 'mr-zoom', '🔍'); M.zoomBtn.type = 'button'; M.zoomBtn.title = 'Agrandar el mapa';
    M.zoomBtn.addEventListener('click', () => { M.zoom = !M.zoom; M.wrap.classList.toggle('grande', M.zoom); dibujar(); });
    M.wrap.appendChild(M.zoomBtn);
    M.barra = el('div', 'mr-barra');
    // el chat con los demas (aviso.js: chatPartida), fijo debajo de lo que pasa
    M.chatBox = el('div', 'mr-chat');
    izq.append(M.wrap, M.barra, M.chatBox);
    M.panel = der;
    M.cv.addEventListener('click', tocar);
    M.cv.addEventListener('mousemove', (e) => { const p = puntoDe(e); M.cv.title = p ? `${P[p].nombre}` : ''; });
    M.ro = new ResizeObserver(() => dibujar()); M.ro.observe(M.wrap);
    M.reloj = setInterval(() => { if (M === yo) relojes(); }, 1000);
    M.barra.appendChild(el('div', 'jg-estado', 'Cargando…'));
    let d;
    try { [d] = await Promise.all([A.emit('mr:ver', { id }), cargarArte()]); } catch { d = { error: 'No se pudo cargar el mapa. Probá de nuevo.' }; }
    if (M !== yo) return;
    if (d.error) { M.barra.textContent = ''; M.barra.appendChild(el('div', 'jg-estado', d.error)); return; }
    render(d.partida);
  }
  function salir() {
    if (!M) return;
    clearInterval(M.reloj); if (M.ro) M.ro.disconnect();
    M = null;
  }

  function menuSalir() {
    const s = M && M.s;
    if (!s) return;
    if (s.estado === 'esperando' && s.soyCreador) { A.confirmar('¿Cancelar la partida?', 'La mesa se cierra y nadie más puede entrar.', 'Cancelar partida', 'Volver').then(ok => { if (ok) A.emit('mr:cancelar', { id: s.id }).then(r => { if (r.error) A.toast(r.error, 'error'); else A.back(); }); }); return; }
    if (s.estado === 'esperando' && s.soyJugador) { A.emit('mr:cancelar', { id: s.id }).then(r => { if (r.error) A.toast(r.error, 'error'); else A.back(); }); return; }
    if (s.estado === 'jugando' && s.soyJugador && !s.abandone) { A.confirmar('¿Abandonar la guerra?', 'Si abandonás, perdés: la compu sigue con tu ejército.', 'Abandonar', 'Seguir jugando').then(ok => { if (ok) accion({ tipo: 'abandonar' }); }); return; }
    const url = `${location.origin}/app?globalsiege=${s.id}`;
    if (navigator.clipboard) navigator.clipboard.writeText(url).then(() => A.toast('Enlace copiado', 'success'), () => prompt('Copiá el enlace:', url));
    else prompt('Copiá el enlace:', url);
  }

  function render(s) {
    if (!M || !s || s.id !== M.id) return;
    const antes = M.s;
    M.s = s;
    const t = s.estado === 'esperando' && s.soyCreador ? 'Cancelar partida' : s.estado === 'esperando' && s.soyJugador ? 'Salir de la mesa' : s.estado === 'jugando' && s.soyJugador && !s.abandone ? 'Abandonar' : 'Copiar enlace';
    M.salirBtn.textContent = t; M.salirBtn.style.visibility = '';
    M.salirBtn.classList.toggle('jg-peligro', t !== 'Copiar enlace');
    // lo elegido deja de valer si cambio el turno (el origen al mover, si ya no se mueve o no le quedan tropas)
    if (!antes || antes.turno !== s.turno) M.sel = [];
    if (M.origen && (s.fase !== 'mover' || !s.teToca || s.tropas[M.origen] <= 1 || s.dueno[M.origen] !== s.miEj)) M.origen = 0;
    if (antes && antes.turno !== s.turno) M.cant = { poner: 1, juntar: 0, mover: 0 };
    if (s.teToca && (!antes || !antes.teToca)) sonarDing();
    // La mision, la primera vez que se entra a la guerra
    if (s.estado === 'jugando' && s.soyJugador && s.miMision) {
      const k = 'mr-mision-' + s.id;
      let vista = true; try { vista = !!localStorage.getItem(k); } catch { /* sin almacenamiento */ }
      if (!vista) { try { localStorage.setItem(k, '1'); } catch { /* sin almacenamiento */ } verMision(); }
    }
    dibujar();
    barra();
    panel();
    if (A.chat) A.chat(M.chatBox, s, (t) => A.emit('mr:accion', { id: s.id, tipo: 'chat', texto: t }));
  }

  // ── El mapa ──
  function puntoDe(e) {
    const r = M.cv.getBoundingClientRect();
    if (!r.width || !arte.alfa) return 0;
    return paisEn((e.clientX - r.left) / r.width * MAPA.ANCHO, (e.clientY - r.top) / r.height * MAPA.ALTO);
  }
  function dibujar() {
    if (!M || !M.cv || !arte.alfa) return;
    const s = M.s;
    const cssW = Math.max(200, M.wrap.clientWidth) * (M.zoom ? 2 : 1);
    const cssH = cssW * MAPA.ALTO / MAPA.ANCHO;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    M.cv.style.width = cssW + 'px'; M.cv.style.height = cssH + 'px';
    const W = Math.round(cssW * dpr), H = Math.round(cssH * dpr);
    if (M.cv.width !== W || M.cv.height !== H) { M.cv.width = W; M.cv.height = H; }
    const x = M.cv.getContext('2d');
    const k = W / MAPA.ANCHO;
    x.setTransform(k, 0, 0, k, 0, 0);
    x.imageSmoothingQuality = 'high';
    x.drawImage(arte.mapa, 0, 0, MAPA.ANCHO, MAPA.ALTO);
    if (!s || !s.dueno) return;
    const A2 = s.ataque;
    for (let id = 1; id <= 42; id++) {
      const d = s.dueno[id];
      if (!d) continue;
      const p = P[id];
      // el pais atacado brilla en rojo; de donde salen las tropas, un poco mas claro
      if (A2 && A2.objetivo === id) {
        x.save(); x.shadowColor = '#ff3b30'; x.shadowBlur = 14 * dpr;
        x.drawImage(tinte(id, d, 'luz'), p.x, p.y); x.drawImage(tinte(id, d, 'luz'), p.x, p.y);
        x.restore();
      } else if ((A2 && A2.origenes[id]) || M.origen === id) {
        x.save(); x.shadowColor = 'rgba(255,255,255,0.9)'; x.shadowBlur = 8 * dpr;
        x.drawImage(tinte(id, d, 'luz'), p.x, p.y);
        x.restore();
      } else x.drawImage(tinte(id, d, ''), p.x, p.y);
    }
    // Los numeros de tropas, como en el original (PrintAllScores): centrados, a la izquierda o a la
    // derecha, con el color de texto del ejercito (o claro si van en el mar) y, si es claro, con una
    // sombra negra corrida un pixel. Con el mapa chico (el celular) van mas grandes, para que se lean
    const kCss = cssW / MAPA.ANCHO;
    M.letra = Math.max(14, Math.min(23, 11 / kCss));
    x.font = `bold ${Math.round(M.letra)}px Arial, Helvetica, sans-serif`;
    x.textBaseline = 'middle';
    const sombra = Math.max(1, M.letra / 13);
    for (let id = 1; id <= 42; id++) {
      const p = P[id];
      const n = String(s.tropas[id]);
      const color = p.regla.includes('W') ? '#dfdfdf' : EJ[s.dueno[id]].texto;
      x.textAlign = p.regla.includes('L') ? 'left' : p.regla.includes('R') ? 'right' : 'center';
      if (color !== '#000000') { x.fillStyle = '#000'; x.fillText(n, p.nx + sombra, p.ny + sombra); }
      x.fillStyle = color; x.fillText(n, p.nx, p.ny);
    }
    // Las tropas juntadas para el ataque, arriba del pais atacado
    if (A2 && A2.juntadas) {
      const p = P[A2.objetivo];
      etiqueta(x, `⚔ ${A2.juntadas}`, p.nx, p.ny - M.letra * 1.4, '#ffd60a', '#000');
    }
    if (s.dados) dados(x, s.dados);
  }
  function etiqueta(x, t, cx, cy, fondo, color) {
    const f = Math.round(M.letra * 0.9);
    x.font = `bold ${f}px Arial, Helvetica, sans-serif`;
    const w = x.measureText(t).width + f * 0.9;
    x.fillStyle = fondo; redondo(x, cx - w / 2, cy - f * 0.75, w, f * 1.5, f * 0.45); x.fill();
    x.fillStyle = color; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(t, cx, cy + 0.5);
  }
  function redondo(x, X, Y, w, h, r) { x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + w, Y, X + w, Y + h, r); x.arcTo(X + w, Y + h, X, Y + h, r); x.arcTo(X, Y + h, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath(); }
  // Los dados del original (DisplayDiceOnBoard): en el mar de arriba, los rojos del ataque arriba y
  // los blancos de la defensa abajo, en los mismos lugares. En la hoja hay dos dibujos de cada uno
  // (el original elegia al azar: aca, segun el lugar). Con el mapa chico van mas grandes
  function dados(x, D) {
    const Dd = MAPA.dados, L = Dd.lado;
    const esc = Math.max(1, M.letra / 15), cx = Dd.x + 221 / 2, cy = Dd.y;
    const uno = (v, fila, pos, i) => {
      const sy = fila === 'ataque' ? L * 2 + (i % 2) * L + 1 : (i % 2) * (L + 1);
      const X = cx + (Dd.x + pos[0] - cx) * esc, Y = cy + (Dd.y + pos[1] - cy) * esc;
      x.drawImage(arte.dados, L * (v - 1), sy, L, L, X, Y, L * esc, L * esc);
    };
    D.a.forEach((v, i) => uno(v, 'ataque', Dd.ataque[D.a.length][i], i));
    D.d.forEach((v, i) => uno(v, 'defensa', Dd.defensa[D.d.length][i], i + 1));
  }

  // ── Tocar el mapa ──
  function tocar(e) {
    const s = M && M.s;
    const p = puntoDe(e);
    if (!s || !p || s.estado !== 'jugando') return;
    if (!s.teToca) { infoPais(p); return; }
    const mio = s.dueno[p] === s.miEj;
    const n = (k) => M.cant[k] || 'todas';
    if (s.fase === 'canje') { A.toast('Con cinco cartas hay que canjear: elegí tres abajo.', 'error'); return; }
    if (s.fase === 'poner') {
      if (!mio) { A.toast('Las tropas nuevas van en tus países.', 'error'); return; }
      const c = n('poner');
      accion({ tipo: 'poner', pais: p, n: c === 'todas' ? s.poner : c });
      return;
    }
    if (s.fase === 'atacar') {
      const At = s.ataque;
      if (!At) {
        if (mio) { A.toast('Tocá un país enemigo vecino para atacarlo.', 'info'); return; }
        accion({ tipo: 'objetivo', pais: p });
        return;
      }
      if (p === At.objetivo) {
        if (!At.juntadas) { A.toast('Primero tocá tus países vecinos para juntar tropas.', 'info'); return; }
        accion({ tipo: 'tirar', veces: 1 });
        return;
      }
      if (mio) {
        if (!P[p].vecinos.includes(At.objetivo)) { A.toast(`${P[p].nombre} no es vecino de ${P[At.objetivo].nombre}.`, 'error'); return; }
        const c = n('juntar');
        accion({ tipo: 'juntar', pais: p, n: c === 'todas' ? 9999 : c });
        return;
      }
      if (At.juntadas) { A.toast('Seguí atacando o retirate antes de elegir otro país.', 'error'); return; }
      accion({ tipo: 'objetivo', pais: p });
      return;
    }
    if (s.fase === 'mover') {
      if (!mio) { A.toast('Las tropas se mueven entre tus países.', 'error'); return; }
      if (!M.origen || M.origen === p) {
        if (M.origen === p) { M.origen = 0; dibujar(); barra(); return; }
        if (s.tropas[p] <= 1) { A.toast('En ese país queda una sola tropa.', 'error'); return; }
        M.origen = p; dibujar(); barra(); return;
      }
      if (!P[M.origen].vecinos.includes(p)) {
        if (s.tropas[p] > 1) { M.origen = p; dibujar(); barra(); } else A.toast(`${P[p].nombre} no es vecino de ${P[M.origen].nombre}.`, 'error');
        return;
      }
      const c = n('mover');
      const de = M.origen;
      accion({ tipo: 'mover', de, a: p, n: c === 'todas' ? 9999 : c }).then(r => { if (!r.error && M && M.s && M.s.tropas[de] <= 1) { M.origen = 0; dibujar(); barra(); } });
    }
  }
  function infoPais(p) {
    const s = M.s, d = s.dueno[p];
    const a = s.asientos[d - 1];
    A.toast(`${P[p].nombre} (${MAPA.continenteDe(p).nombre}): ${s.tropas[p]} ${s.tropas[p] === 1 ? 'tropa' : 'tropas'} del ${EJ[d].nombre}${a && a.nombre ? ' · ' + a.nombre : ''}`, 'info');
  }

  // ── Lo que pasa y los botones ──
  function cantidades(k) {
    const w = el('div', 'mr-cant');
    w.appendChild(el('span', 'mr-cant-t', 'De a'));
    for (const [v, l] of [[1, '1'], [5, '5'], [10, '10'], [0, 'Todas']]) {
      const b = el('button', 'mr-cant-op' + (M.cant[k] === v ? ' on' : ''), l); b.type = 'button';
      b.addEventListener('click', () => { M.cant[k] = v; w.querySelectorAll('.mr-cant-op').forEach(y => y.classList.toggle('on', y === b)); });
      w.appendChild(b);
    }
    return w;
  }
  const nombreEj = (s, e) => { const a = s.asientos[e - 1]; return a.yo ? 'Vos' : a.nombre || EJ[e].nombre; };
  function barra() {
    const s = M.s, b = M.barra;
    b.textContent = '';
    if (s.estado === 'esperando') return esperando(b, s);
    if (s.estado === 'terminada') return final(b, s);
    const quien = el('div', 'mr-quien');
    const punto = el('span', 'mr-punto'); punto.style.background = EJ[s.turno].color;
    const tx = s.teToca ? 'Te toca' : `Juega ${nombreEj(s, s.turno)} · ${EJ[s.turno].nombre}`;
    quien.append(punto, el('b', null, tx), el('span', 'mr-ronda', `Ronda ${s.ronda}`));
    M.relojEl = el('span', 'mr-reloj'); quien.appendChild(M.relojEl);
    b.appendChild(quien);
    relojes();
    if (s.ausente) {
      const w = el('div', 'mr-aviso');
      w.append(el('span', null, 'La compu está jugando por vos.'), btn('Volver a jugar', 'jg-primario', () => accion({ tipo: 'volver' })));
      b.appendChild(w);
      return;
    }
    if (!s.teToca) {
      if (s.soyJugador && s.asientos[s.miEj - 1] && !s.asientos[s.miEj - 1].vivo) b.appendChild(el('div', 'mr-texto', '💀 Tu ejército fue aniquilado. Podés seguir mirando la guerra.'));
      return;
    }
    const At = s.ataque;
    const texto = el('div', 'mr-texto');
    const acc = el('div', 'mr-acc');
    if (s.fase === 'canje') texto.textContent = 'Tenés cinco cartas: elegí tres para canjear.';
    else if (s.fase === 'poner') {
      texto.textContent = `Poné ${s.poner} ${s.poner === 1 ? 'tropa nueva' : 'tropas nuevas'}: tocá tus países.`;
      acc.appendChild(cantidades('poner'));
    } else if (s.fase === 'atacar' && !At) {
      texto.textContent = 'Tocá un país enemigo vecino para atacarlo.';
      acc.append(btn('Pasar a mover', '', () => accion({ tipo: 'pasar' })), btn('Terminar turno', '', () => accion({ tipo: 'terminar' })));
    } else if (s.fase === 'atacar') {
      const def = s.tropas[At.objetivo];
      texto.textContent = At.juntadas
        ? `Atacás ${P[At.objetivo].nombre} (${def}) con ${At.juntadas}. Tocalo para tirar, o sumá tropas de tus países vecinos.`
        : `Atacás ${P[At.objetivo].nombre} (${def}): tocá tus países vecinos para juntar tropas.`;
      acc.appendChild(cantidades('juntar'));
      if (At.juntadas) {
        acc.append(
          btn('Tirar', 'jg-primario', () => accion({ tipo: 'tirar', veces: 1 })),
          btn('Hasta el final', '', () => accion({ tipo: 'tirar', todo: true })),
          btn('Retirarse', '', () => accion({ tipo: 'retirar', n: 'todas' })),
        );
      } else acc.append(btn('Pasar a mover', '', () => accion({ tipo: 'pasar' })), btn('Terminar turno', '', () => accion({ tipo: 'terminar' })));
    } else if (s.fase === 'mover') {
      texto.textContent = M.origen ? `Desde ${P[M.origen].nombre} (${s.tropas[M.origen]}): tocá el país vecino adonde van.` : 'Tocá un país tuyo y después el vecino adonde van las tropas.';
      acc.append(cantidades('mover'), btn('Terminar turno', 'jg-primario', () => accion({ tipo: 'terminar' })));
    }
    b.append(texto, acc);
  }
  function relojes() {
    const s = M && M.s;
    if (!s || !M.relojEl) return;
    if (!s.deadline || s.estado !== 'jugando') { M.relojEl.textContent = ''; return; }
    const r = Math.max(0, Math.round((s.deadline - Date.now()) / 1000));
    M.relojEl.textContent = `⏱ ${Math.floor(r / 60)}:${String(r % 60).padStart(2, '0')}`;
    M.relojEl.classList.toggle('poco', r < 45);
  }

  function esperando(b, s) {
    b.appendChild(el('div', 'mr-texto', `Mesa de ${s.asientos.length} ejércitos${s.opciones.misiones ? ', con misiones secretas' : ''}. Los lugares vacíos los juega la compu (${s.nivel}).`));
    const l = el('div', 'jg-lista');
    for (const a of s.asientos) {
      const r = el('div', 'jg-fila');
      r.append(A.avatar(a.nombre ? a : { nombre: '?' }), el('span', 'jg-fnombre', a.nombre ? (a.yo ? `${a.nombre} (vos)` : a.nombre) : 'Lugar libre'));
      l.appendChild(r);
    }
    b.appendChild(l);
    if (s.invitados.length) b.appendChild(el('div', 'jg-ayuda', 'Invitados: ' + s.invitados.map(p => p.nombre).join(', ')));
    const acc = el('div', 'mr-acc');
    if (!s.soyJugador) acc.appendChild(btn('Entrar a la mesa', 'jg-primario', () => unirse(s.id)));
    if (s.soyCreador) acc.appendChild(btn('Empezar', 'jg-primario', async () => { const r = await A.emit('mr:empezar', { id: s.id }); if (r.error) A.toast(r.error, 'error'); }));
    acc.appendChild(btn('Copiar invitación', '', () => {
      const url = `${location.origin}/app?globalsiege=${s.id}`;
      const t = `¡Vení a jugar una guerra de GlobalSiege (el MissionRisk de siempre)! Entrá acá: ${url}`;
      if (navigator.clipboard) navigator.clipboard.writeText(t).then(() => A.toast('Invitación copiada: pegala en un canal o en un mensaje', 'success'), () => prompt('Copiá la invitación:', t));
      else prompt('Copiá la invitación:', t);
    }));
    b.appendChild(acc);
  }

  function final(b, s) {
    const g = s.ganador;
    const w = el('div', 'mr-final');
    if (g && g.ej) {
      const punto = el('span', 'mr-punto'); punto.style.background = EJ[g.ej].color;
      w.append(el('div', 'mr-final-t', g.yo ? '🏆 ¡Ganaste la guerra!' : `🏆 Ganó ${nombreEj(s, g.ej)}`), el('div', 'mr-final-s', `${EJ[g.ej].nombre}, ${g.texto}.`));
    } else w.appendChild(el('div', 'mr-final-t', 'La guerra terminó sin ganador.'));
    b.appendChild(w);
    const acc = el('div', 'mr-acc');
    acc.append(btn('Otra guerra', 'jg-primario', () => A.go('mrCrear')), btn('Volver a GlobalSiege', '', () => { A.stack().length = 0; A.go('inicio', 'globalsiege'); }));
    b.appendChild(acc);
  }

  function verMision() {
    const s = M && M.s;
    if (!s || !s.miMision) return;
    const fondo = el('div', 'jg-aviso-fondo');
    const box = el('div', 'jg-aviso mr-mision'); box.setAttribute('role', 'dialog');
    const ok = btn('Entendido', 'jg-primario');
    const acc = el('div', 'jg-aviso-acc'); acc.appendChild(ok);
    box.append(el('div', 'mr-mision-sello', 'ULTRA SECRETO'), el('div', 'jg-aviso-t', `Tu misión · ${EJ[s.miEj].nombre}`), el('div', 'jg-aviso-s', s.miMision), acc);
    fondo.appendChild(box);
    const fin = () => fondo.remove();
    ok.addEventListener('click', fin);
    fondo.addEventListener('click', (e) => { if (e.target === fondo) fin(); });
    A.page().appendChild(fondo);
    ok.focus();
  }

  function panel() {
    const s = M.s, d = M.panel;
    d.textContent = '';
    if (s.estado === 'esperando') { d.appendChild(credito()); return; }
    // Mis cartas y mi mision
    if (s.soyJugador && s.misCartas) {
      const c = el('div', 'mr-caja');
      const t = el('div', 'mr-caja-t');
      t.append(el('span', null, 'Tus cartas'), btn('Tu misión', 'jg-suave mr-chico', verMision));
      c.appendChild(t);
      const fila = el('div', 'mr-cartas');
      const puede = s.teToca && ['canje', 'poner', 'atacar'].includes(s.fase) && !s.ataque;
      M.sel = M.sel.filter(i => i < s.misCartas.length);
      s.misCartas.forEach((tipo, i) => fila.appendChild(carta(tipo, M.sel.includes(i), puede ? () => {
        M.sel = M.sel.includes(i) ? M.sel.filter(x => x !== i) : [...M.sel, i].slice(-3);
        panel();
      } : null)));
      if (!s.misCartas.length) fila.appendChild(el('div', 'mr-nada', 'Todavía no tenés cartas: conquistá un país en tu turno para llevarte una.'));
      c.appendChild(fila);
      if (puede && s.misCartas.length >= 3) {
        const v = valorCartas(M.sel.map(i => s.misCartas[i]));
        const acc = el('div', 'mr-acc');
        if (M.sel.length === 3) {
          const b = btn(v ? `Canjear por ${v} tropas` : 'Esas tres no van', 'jg-primario', () => accion({ tipo: 'canjear', cartas: M.sel }).then(r => { if (!r.error) M.sel = []; }));
          b.disabled = !v; acc.appendChild(b);
        } else if (s.canje) acc.appendChild(btn(`Canjear las mejores (${s.canje.v} tropas)`, '', () => accion({ tipo: 'canjear', cartas: s.canje.pos })));
        c.appendChild(acc);
      }
      d.appendChild(c);
    }
    // Los ejercitos
    const ej = el('div', 'mr-caja');
    ej.appendChild(el('div', 'mr-caja-t', 'Ejércitos'));
    for (const a of s.asientos) {
      const r = el('div', 'mr-ej' + (s.turno === a.ej && s.estado === 'jugando' ? ' turno' : '') + (a.vivo === false ? ' muerto' : ''));
      const punto = el('span', 'mr-punto'); punto.style.background = a.color;
      const nom = el('div', 'mr-ej-n');
      nom.append(el('b', null, a.yo ? 'Vos' : a.nombre || '?'), el('span', null, a.ejercito + (a.compu ? ` · compu ${(a.nivel || '').toLowerCase()}` : '') + (a.abandono ? ' · abandonó' : a.ausente ? ' · la compu juega por él' : '')));
      const nums = el('div', 'mr-ej-d', a.vivo === false ? '💀' : `${a.paises} países · ${a.tropas} tropas`);
      r.append(punto, nom, nums);
      if (a.vivo !== false) { const c = el('div', 'mr-ej-c'); c.appendChild(dorsos(a.cartas)); r.appendChild(c); }
      if (s.estado === 'terminada' && a.mision) r.appendChild(el('div', 'mr-ej-m', 'Misión: ' + a.mision));
      ej.appendChild(r);
    }
    d.appendChild(ej);
    // Lo que fue pasando
    const lg = el('div', 'mr-caja');
    lg.appendChild(el('div', 'mr-caja-t', 'La guerra'));
    const l = el('div', 'mr-log');
    for (const t of (s.log || []).slice().reverse()) l.appendChild(el('div', null, t));
    lg.appendChild(l);
    d.appendChild(lg);
    d.appendChild(credito());
  }

  // ── Para aviso.js ──
  window.puenteMR = {
    usar(api) { A = api; },
    inicio, crear, reglas, mesa, salir,
    estado(s) { if (M && s && s.id === M.id) render(s); },
    abierta: () => M && M.id,
  };
})();
