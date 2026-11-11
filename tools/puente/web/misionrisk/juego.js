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
    // El banner (banner.webp, de tools/misionrisk/armar-banner.js): el mapa del juego con su nombre
    const ban = el('img', 'jg-banner'); ban.alt = 'GlobalSiege'; ban.src = ARTE + 'banner.webp?v=1';
    ban.addEventListener('load', () => { hero.querySelector('.jg-hero-t')?.remove(); hero.classList.add('jg-con-banner'); });
    ban.addEventListener('error', () => ban.remove());
    hero.prepend(ban);
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
    hero.append(acc, credito()); b.appendChild(hero);
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
    const mesaTxt = (m) => `${m.flexible ? `entran hasta ${m.total}` : `${m.total} ejércitos`} · ${m.sentados} ${m.sentados === 1 ? 'persona' : 'personas'}${m.misiones === false ? ' · sin misiones' : ''}${m.amistosa ? ' · amistosa' : ''}`;
    section('Te invitaron', d.abiertas.filter(a => a.paraVos), (a) => row(a.creador, `${a.creador.nombre} te invitó a una guerra`, mesaTxt(a), 'Entrar', 'azul', () => unirse(a.id)));
    section('Tus partidas', d.mias, (m) => {
      const top = m.estado === 'esperando' ? (m.flexible ? `Esperando gente (${m.sentados} en la mesa)` : `Esperando gente (${m.sentados} de ${m.total})`) : `Con ${m.rival.nombre}`;
      const bottom = m.estado === 'terminada' ? (m.ganaste ? '🏆 Ganaste' : 'Perdiste') : m.estado === 'jugando' ? `${m.ejercito}${m.vivo ? '' : ' (aniquilado)'} · ronda ${m.ronda}` : m.flexible ? `entran hasta ${m.total}` : `${m.total} ejércitos`;
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
    if (s.amistosasGanadas || s.amistosasPerdidas) box.appendChild(el('div', 'jg-ayuda', `Amistosas: ${s.amistosasGanadas} ${s.amistosasGanadas === 1 ? 'ganada' : 'ganadas'} y ${s.amistosasPerdidas} ${s.amistosasPerdidas === 1 ? 'perdida' : 'perdidas'} (no suman al ranking).`));
    const rk = el('div', 'jg-rankings'); b.appendChild(rk);
    for (const [k, title] of [['mes', 'Ranking del mes'], ['total', 'Ranking histórico']]) {
      const list = d.ranking[k];
      rk.appendChild(el('div', 'jg-sub', title));
      if (!list.length) { rk.appendChild(el('div', 'jg-vacio', 'Todavía nadie ganó una guerra contra otras personas.')); continue; }
      const l = el('div', 'jg-lista');
      list.forEach((p, i) => { const r = el('div', 'jg-fila jg-rank'); r.append(el('span', 'jg-pos', ['🥇', '🥈', '🥉'][i] || String(i + 1)), A.avatar(p), el('span', 'jg-fnombre', p.nombre), el('span', 'jg-chip', `${p.ganadas} ${p.ganadas === 1 ? 'victoria' : 'victorias'}`)); l.appendChild(r); });
      rk.appendChild(l);
    }
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
    const data = { total: 4, modo: 'compu', nivel: 2, misiones: true, buitre: false, privada: false, invitados: [], amistosa: false };
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
    const cuantos = seg('Cuántos ejércitos', 'total', [[2, '2'], [3, '3'], [4, '4'], [5, '5'], [6, '6']]);
    seg('Contra quién', 'modo', [['compu', 'La compu'], ['gente', 'Gente del chat']], () => {
      const conGente = data.modo === 'gente';
      gente.hidden = !conGente; cuantos.hidden = conGente; nivel.hidden = conGente; hint.textContent = HINT[data.modo];
    });
    const HINT = {
      compu: 'Vos contra la compu: los demás ejércitos los juega ella. No cuenta para el ranking.',
      gente: 'La mesa queda en la sala y entra quien quiera, hasta 6 (con 6 empieza sola). Cuando quieras tocá "Empezar" y la guerra arranca con los que estén, al menos 2. Cada turno tiene 4 minutos; si alguien no juega, la compu juega por él hasta que vuelva.',
    };
    const hint = el('div', 'jg-ayuda', HINT.compu); f.appendChild(hint);
    const nivel = seg('Nivel de la compu', 'nivel', [[1, 'Promedio'], [2, 'Sagaz']]);
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
      // Competitiva (suma al ranking) o amistosa (queda en el récord, sin sumar)
      const AHINT = { false: 'Suma al ranking del mes y al histórico.', true: 'Queda en tu récord como amistosa, pero no suma al ranking.' };
      const wa = el('div', 'jg-campo'); wa.appendChild(el('span', 'jg-etq', 'Ranking'));
      const sa = el('div', 'jg-seg');
      const ah = el('div', 'jg-ayuda', AHINT.false);
      for (const [v, l] of [[false, 'Competitiva'], [true, 'Amistosa']]) {
        const x = el('button', 'jg-seg-op', l); x.type = 'button'; x.classList.toggle('on', data.amistosa === v);
        x.addEventListener('click', () => { data.amistosa = v; sa.querySelectorAll('.jg-seg-op').forEach(y => y.classList.toggle('on', y === x)); ah.textContent = AHINT[v]; });
        sa.appendChild(x);
      }
      wa.appendChild(sa); gente.append(wa, ah);
      if (window.app && window.app.user && window.app.user.isGuest) wa.hidden = ah.hidden = true; // para un invitado siempre es amistosa
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
              if (data.invitados.length >= 5) { A.toast('En una guerra entran hasta 6: podés invitar a 5.', 'error'); return; }
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
      const r = await A.emit('mr:crear', { total: data.total, modo: data.modo, nivel: data.nivel, misiones: data.misiones, buitre: data.buitre, privada: data.privada, invitados: data.invitados.map(p => p.id), amistosa: data.modo === 'gente' && data.amistosa });
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
    M.cuerpo = b; M.izq = izq;
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
    izq.append(M.wrap, M.barra);
    // el panel (se rearma entero) y, en la pantalla ancha, el chat abajo de todo en esta columna
    M.der = der; M.panel = el('div', 'mr-panel'); der.appendChild(M.panel);
    M.cv.addEventListener('click', tocar);
    M.cv.addEventListener('mousemove', (e) => { const p = puntoDe(e); M.cv.title = p ? `${P[p].nombre}` : ''; });
    // (se mira la columna, no el mapa: el mapa cambia de ancho solo, para entrar en la pantalla)
    // a la derecha (o, con una sola columna, debajo): el panel, el chat y el credito
    der.append(M.chatBox, credito());
    cajonChat(page);
    M.ro = new ResizeObserver(() => dibujar()); M.ro.observe(izq); M.ro.observe(M.barra); M.ro.observe(M.chatBox);
    if (A.page()) M.ro.observe(A.page());
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
    if (M.cajon) { M.cajon.fondo.remove(); M.cajon.panel.remove(); M.cajon.boton.remove(); removeEventListener('resize', M.cajon.lugar); }
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
    if (M.cuerpo) M.cuerpo.classList.toggle('mr-espera', s.estado === 'esperando');
    dibujar();
    barra();
    panel();
    if (A.chat) A.chat(M.chatBox, s, (t) => A.emit('mr:accion', { id: s.id, tipo: 'chat', texto: t }), 'mr');
    avisoChat(s);
  }

  // ── El mapa ──
  function puntoDe(e) {
    const r = M.cv.getBoundingClientRect();
    if (!r.width || !arte.alfa) return 0;
    return paisEn((e.clientX - r.left) / r.width * MAPA.ANCHO, (e.clientY - r.top) / r.height * MAPA.ALTO);
  }
  // El ancho del mapa para que la pantalla entera (el mapa, lo que pasa y el chat) entre sin scroll: el mapa
  // crece parejo con el ancho, asi que alcanza con una cuenta. En el celular (y con la lupa), todo el ancho
  // ── El chat en un panel de costado (con una sola columna) ──
  // El panel entra desde la derecha: deslizando el dedo desde el borde derecho hacia la izquierda, o con el boton de
  // arriba a la derecha (que muestra cuantos mensajes nuevos hay). Se cierra deslizando hacia la derecha, tocando
  // afuera o con la X. Con dos columnas (la compu) el chat sigue a la derecha, como siempre
  const UNA_COLUMNA = () => innerWidth < 1000;
  function cajonChat(page) {
    const fondo = el('div', 'mr-cajon-fondo'), panel = el('div', 'mr-cajon');
    const cab = el('div', 'mr-cajon-cab');
    const cerrar = el('button', 'mr-cajon-x', '✕'); cerrar.type = 'button'; cerrar.setAttribute('aria-label', 'Cerrar el chat');
    cab.append(el('b', null, 'Chat de la partida'), cerrar);
    const lugar = el('div', 'mr-cajon-lugar');
    panel.append(cab, lugar);
    const boton = el('button', 'mr-chat-btn'); boton.type = 'button'; boton.setAttribute('aria-label', 'Abrir el chat');
    boton.append(el('span', 'mr-chat-ico', '💬'), el('span', 'mr-chat-n'));
    // (el boton, en la barra de arriba, al lado de Abandonar; si no esta la barra, flotando arriba a la derecha)
    const barraArriba = M.salirBtn && M.salirBtn.parentElement;
    page.append(fondo, panel);
    if (barraArriba) { barraArriba.insertBefore(boton, M.salirBtn); boton.classList.add('en-barra'); } else page.appendChild(boton);
    const C = M.cajon = { fondo, panel, boton, lugar, abierto: false, visto: null };
    const abrir = (si) => {
      C.abierto = si; panel.classList.toggle('abierto', si); fondo.classList.toggle('abierto', si);
      if (si) avisoChat(M && M.s);
    };
    C.abrir = abrir;
    boton.addEventListener('click', () => abrir(!C.abierto));
    cerrar.addEventListener('click', () => abrir(false));
    fondo.addEventListener('click', () => abrir(false));
    // deslizar con el dedo: desde el borde derecho abre, sobre el panel hacia la derecha cierra
    let t0 = null;
    page.addEventListener('touchstart', (e) => {
      if (!UNA_COLUMNA() || !M || !M.cajon || boton.hidden || e.touches.length !== 1) return;
      const x = e.touches[0].clientX, y = e.touches[0].clientY;
      if (C.abierto ? panel.contains(e.target) : x > innerWidth - 28) t0 = { x, y };
    }, { passive: true });
    page.addEventListener('touchmove', (e) => {
      if (!t0) return;
      const dx = e.touches[0].clientX - t0.x, dy = e.touches[0].clientY - t0.y;
      if (Math.abs(dy) > Math.abs(dx) * 1.2) { t0 = null; return; }
      if (!C.abierto && dx < -40) { abrir(true); t0 = null; } else if (C.abierto && dx > 60) { abrir(false); t0 = null; }
    }, { passive: true });
    page.addEventListener('touchend', () => { t0 = null; }, { passive: true });
    // el chat va al panel con una columna y a la derecha con dos
    C.lugar = () => {
      if (!M || !M.cajon) return;
      const una = UNA_COLUMNA(), donde = una ? lugar : M.der;
      if (una && M.chatBox.parentElement !== lugar) lugar.appendChild(M.chatBox);
      else if (!una && M.chatBox.parentElement !== M.der) M.der.insertBefore(M.chatBox, M.der.querySelector(':scope > .mr-credito'));
      if (!una && C.abierto) abrir(false);
      avisoChat(M.s);
      return donde;
    };
    addEventListener('resize', C.lugar);
    C.lugar();
  }
  // el boton del chat: se ve con una columna y si la partida tiene chat; dice cuantos mensajes nuevos de otros hay
  function avisoChat(s) {
    const C = M && M.cajon;
    if (!C) return;
    // (las partidas contra la compu no tienen chat: ahi no hay boton)
    C.boton.hidden = !UNA_COLUMNA() || !M.chatBox.firstChild;
    // (lo visto se cuenta por la hora del ultimo mensaje, la del servidor: no depende del reloj del celular. Al entrar a
    // la partida, lo que ya habia cuenta como visto)
    const chat = s && Array.isArray(s.chat) ? s.chat : [];
    const ultimo = chat.reduce((x, m) => Math.max(x, m.t || 0), 0);
    if (C.visto == null || C.abierto) C.visto = Math.max(C.visto || 0, ultimo);
    const nuevos = chat.filter(m => !m.mio && m.t > C.visto).length;
    const n = C.boton.querySelector('.mr-chat-n');
    n.textContent = nuevos > 9 ? '9+' : nuevos ? String(nuevos) : '';
    const antes = C.nuevos || 0;
    C.nuevos = nuevos;
    C.boton.classList.toggle('con-nuevos', nuevos > 0);
    // (un saltito cuando llega uno nuevo)
    if (nuevos > antes) { C.boton.classList.remove('salta'); void C.boton.offsetWidth; C.boton.classList.add('salta'); }
  }
  function anchoMapa() {
    const libre = Math.max(200, M.izq.clientWidth), page = A.page();
    // con una sola columna (celular, tablet, el Fold abierto) el mapa va de todo el ancho y lo demas abajo, en
    // orden: lo que pasa, las cartas y los ejercitos, la guerra y el chat. El ajuste al alto, solo con dos columnas
    const dos = innerWidth >= 1000;
    if (M.zoom || !page || !dos) { M.wrap.style.maxWidth = ''; M.der.style.maxHeight = ''; return libre; }
    const pr = page.getBoundingClientRect(), padB = parseFloat(getComputedStyle(M.cuerpo).paddingBottom) || 0;
    const fondo = (y) => y - pr.top + page.scrollTop + padB; // hasta donde llega algo, contando desde arriba de todo
    const h = M.cv.offsetHeight;
    // el panel de la derecha: lo que quede, con su propio scroll si hace falta
    M.der.style.maxHeight = Math.max(320, page.clientHeight - fondo(M.der.getBoundingClientRect().top)) + 'px';
    if (!h) { requestAnimationFrame(dibujar); return libre; }
    const sobra = fondo(M.izq.getBoundingClientRect().bottom) - page.clientHeight;
    const w = Math.round(Math.max(320, Math.min(libre, (h - sobra - 2) * MAPA.ANCHO / MAPA.ALTO)));
    M.wrap.style.maxWidth = w < libre ? w + "px" : "";
    return w;
  }
  function dibujar() {
    if (!M || !M.cv || !arte.alfa) return;
    if (M.s && M.s.estado === 'esperando') return; // (en la espera el mapa no se ve)
    const s = M.s;
    const cssW = anchoMapa() * (M.zoom ? 2 : 1);
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
    // (si no marco "Estoy listo", la partida empezo sin el: se le avisa una vez)
    if (s.quedeAfuera && !M.avisoAfuera) { M.avisoAfuera = true; A.toast('La partida empezó sin vos porque no marcaste «Estoy listo». Podés mirarla.', 'info'); }
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

  // La sala de espera: arriba una franja del mapa con como esta la mesa, las reglas, los lugares (quien armo la
  // mesa puede sacar a alguien) y los botones. El mapa grande se esconde hasta que empieza la guerra
  function esperando(b, s) {
    const n = s.asientos.filter(a => a.nombre).length, nl = s.asientos.filter(a => a.nombre && a.listo).length;
    const yo = s.asientos.find(a => a.yo);
    const sala = el('div', 'mr-sala');
    const banda = el('div', 'mr-sala-banda');
    const tit = el('div', 'mr-sala-tit');
    const sub = s.sacado ? 'Quien armó la mesa te sacó: podés seguir mirando, pero no volver a entrar.'
      : s.flexible ? `${n} de hasta ${s.maximo} · ${s.soyCreador ? (n < 2 ? 'cuando entre alguien más, la arrancás vos' : nl < 2 ? 'esperando que alguien marque «Estoy listo»' : `${nl} listos: la arrancás cuando quieras`) : s.soyJugador ? (yo && yo.listo ? 'estás listo: arranca cuando la empiece quien armó la mesa' : 'marcá «Estoy listo» para jugar esta partida') : 'arranca cuando la empiece quien armó la mesa'}`
      : `Mesa de ${s.asientos.length} ejércitos · los lugares vacíos los juega la compu (${s.nivel})`;
    tit.append(el('div', 'mr-sala-h', s.sacado ? 'Te sacaron de esta mesa' : 'Esperando gente'), el('div', 'mr-sala-s', sub));
    banda.appendChild(tit);
    sala.appendChild(banda);
    // las reglas de la mesa
    const chips = el('div', 'mr-sala-chips');
    const chip = (t, c) => chips.appendChild(el('span', 'mr-sala-chip' + (c ? ' ' + c : ''), t));
    chip(s.opciones.misiones ? '🎯 Con misiones secretas' : '🌍 Conquistar el mundo', 'oro');
    chip(s.publica ? '🌐 Mesa pública' : '🔒 Mesa privada');
    chip(s.amistosa ? '🤝 Amistosa' : '🏆 Suma al ranking');
    if (s.flexible) chip('⏱ 4 min por turno');
    sala.appendChild(chips);
    // los lugares: los que estan y, en la que crece, los libres hasta el maximo
    sala.appendChild(el('div', 'mr-sala-sub', 'En la mesa'));
    const lug = el('div', 'mr-lugares');
    const total = s.flexible ? s.maximo : s.asientos.length;
    for (let k = 0; k < total; k++) {
      const a = s.asientos[k] || {};
      const color = (s.asientos[k] && s.asientos[k].color) || (window.MRMapa.ejercitos[k + 1] || {}).color || '#5865f2';
      const r = el('div', 'mr-lugar' + (a.nombre ? (s.flexible && !a.listo ? ' no-listo' : '') : ' libre'));
      r.style.setProperty('--c', color);
      const tx = el('div', 'mr-lugar-tx');
      if (a.nombre) {
        r.appendChild(A.avatar(a));
        const nom = el('b', null, a.yo ? `${a.nombre} (vos)` : a.nombre);
        if (a.creador) { const c = el('span', 'mr-lugar-corona', '★'); c.title = 'Armó la mesa'; nom.append(' ', c); }
        tx.append(nom, !s.flexible ? el('span', null, a.creador ? 'Armó la mesa' : 'En la mesa')
          : a.listo ? el('span', 'mr-lugar-ok', a.creador ? '✓ Armó la mesa' : '✓ Listo') : el('span', 'mr-lugar-falta', 'Todavía no está listo'));
        // quien armo la mesa puede sacar a los demas (antes de empezar)
        if (s.soyCreador && a.id && !a.yo) {
          const x = el('button', 'mr-lugar-x', '✕'); x.type = 'button'; x.title = `Sacar a ${a.nombre} de la mesa`; x.setAttribute('aria-label', x.title);
          x.addEventListener('click', () => A.confirmar(`¿Sacar a ${a.nombre}?`, 'Se levanta de la mesa y no puede volver a entrar a esta partida.', 'Sacar', 'Volver').then(ok => {
            if (ok) A.emit('mr:sacar', { id: s.id, uid: a.id }).then(rr => { if (rr.error) A.toast(rr.error, 'error'); else A.toast(`Sacaste a ${a.nombre} de la mesa`, 'success'); });
          }));
          r.appendChild(x);
        }
      } else {
        r.appendChild(el('div', 'mr-lugar-vacio', s.flexible ? '+' : '🤖'));
        tx.append(el('b', null, s.flexible ? 'Lugar libre' : 'La compu'), el('span', null, s.flexible ? 'Invitá a alguien' : `Juega ${(s.nivel || '').toLowerCase()}`));
      }
      r.appendChild(tx);
      lug.appendChild(r);
    }
    sala.appendChild(lug);
    if (s.invitados.length) sala.appendChild(el('div', 'mr-sala-inv', 'Invitados: ' + s.invitados.map(p => p.nombre).join(', ')));
    const acc = el('div', 'mr-sala-acc');
    if (!s.soyJugador && !s.sacado) acc.appendChild(btn('Entrar a la mesa', 'jg-primario mr-sala-btn', () => unirse(s.id)));
    // "Estoy listo" (los que entraron; quien armo la mesa ya esta)
    if (s.flexible && s.soyJugador && !s.soyCreador && yo) {
      const lb = btn(yo.listo ? '✓ Estoy listo' : '✋ Estoy listo', yo.listo ? 'mr-sala-btn mr-listo-on' : 'jg-primario mr-sala-btn mr-listo', async () => {
        lb.disabled = true;
        const r = await A.emit('mr:listo', { id: s.id, listo: !yo.listo });
        if (r.error) { lb.disabled = false; A.toast(r.error, 'error'); }
      });
      if (yo.listo) lb.title = 'Tocá de nuevo si todavía no estás listo';
      acc.appendChild(lb);
    }
    if (s.soyCreador) {
      const empezar = async () => { const r = await A.emit('mr:empezar', { id: s.id }); if (r.error) A.toast(r.error, 'error'); };
      const emp = btn(s.flexible ? `⚔ Empezar con ${nl}` : '⚔ Empezar', 'jg-primario mr-sala-btn', () => {
        // (los que no estan listos quedan afuera: se pregunta antes)
        const faltan = s.asientos.filter(a => a.nombre && !a.listo);
        if (!s.flexible || !faltan.length) return empezar();
        const quienes = faltan.map(a => a.nombre).join(', ');
        A.confirmar(faltan.length === 1 ? `${quienes} no está listo` : `${faltan.length} no están listos`, `Si empezás ahora, ${faltan.length === 1 ? 'queda' : 'quedan'} afuera de esta partida (${quienes}) y la ${faltan.length === 1 ? 'puede' : 'pueden'} mirar.`, 'Empezar igual', 'Esperar').then(ok => { if (ok) empezar(); });
      });
      if (s.flexible && n < 2) { emp.disabled = true; emp.title = 'Hace falta que entre alguien más'; }
      else if (s.flexible && nl < 2) { emp.disabled = true; emp.title = 'Hace falta que alguien más marque «Estoy listo»'; }
      acc.appendChild(emp);
    }
    if (!s.sacado) acc.appendChild(btn('🔗 Copiar invitación', 'mr-sala-btn', () => {
      const url = `${location.origin}/app?globalsiege=${s.id}`;
      const t = `¡Vení a jugar una guerra de GlobalSiege! Entrá acá: ${url}`;
      if (navigator.clipboard) navigator.clipboard.writeText(t).then(() => A.toast('Invitación copiada: pegala en un canal o en un mensaje', 'success'), () => prompt('Copiá la invitación:', t));
      else prompt('Copiá la invitación:', t);
    }));
    if (s.flexible && !s.sacado) acc.appendChild(el('div', 'mr-sala-nota', 'Solo juegan los que marcaron «Estoy listo». Los colores se sortean al empezar.' + (s.soyCreador && n > 1 ? ' Tocá ✕ para sacar a alguien de la mesa.' : '')));
    sala.appendChild(acc);
    b.appendChild(sala);
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
    // Quien jugo sin cuenta (invitado): la invitacion a hacerse la cuenta, como en los otros juegos (aviso.js)
    if (window.app && window.app.user && window.app.user.isGuest) {
      w.appendChild(el('div', 'mr-final-s', 'Jugaste como invitado. Con tu cuenta (gratis) quedan tus partidas y el ranking, y entrás al chat del club.'));
      acc.insertBefore(btn('Crear mi cuenta', 'jg-primario', () => {
        try { ['haven_token', 'haven_user'].forEach(k => localStorage.removeItem(k)); sessionStorage.removeItem('puente_jugar'); } catch { /* sin almacenamiento */ }
        location.href = '/?registro=1';
      }), acc.firstChild);
    }
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
    if (s.estado === 'esperando') return;
    // Mis cartas y mi mision
    if (s.soyJugador && s.misCartas) {
      const c = el('div', 'mr-caja mr-c-cartas');
      const t = el('div', 'mr-caja-t');
      // (bien a la vista, para no olvidarse de la mision)
      t.append(el('span', null, 'Tus cartas'), btn('🎯 Tu misión', 'mr-btn-mision', verMision));
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
    const ej = el('div', 'mr-caja mr-c-ej');
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
    const lg = el('div', 'mr-caja mr-c-log');
    lg.appendChild(el('div', 'mr-caja-t', 'La guerra'));
    const l = el('div', 'mr-log');
    for (const t of (s.log || []).slice().reverse()) l.appendChild(el('div', null, t));
    lg.appendChild(l);
    d.appendChild(lg);
  }

  // ── Para aviso.js ──
  window.puenteMR = {
    usar(api) { A = api; },
    inicio, crear, reglas, mesa, salir,
    estado(s) { if (M && s && s.id === M.id) render(s); },
    abierta: () => M && M.id,
  };
})();
