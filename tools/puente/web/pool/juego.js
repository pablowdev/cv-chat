// Pool (8 bolas) en la seccion Juegos: la sala, crear una partida, las reglas y la mesa. Lo carga
// aviso.js (el marco de Juegos) la primera vez que se abre el juego; el servidor es pool.js y la
// fisica, pool-motor.js (el servidor simula cada tiro y aca se ve el recorrido, cuadro por cuadro).
// La mesa es la del pool que hizo el dueño del servidor: apuntar con el mouse, la fuerza con la
// barra (y espacio para tirar) o arrastrando hacia atras, el efecto con la bola de la derecha y la
// bola en mano arrastrando la blanca.
(function () {
  'use strict';
  let A = null; // lo que presta el marco de Juegos (aviso.js)
  let M = null; // la mesa abierta
  const el = (t, c, x) => A.el(t, c, x);
  const btn = (texto, cls, fn) => { const b = el('button', 'jg-btn' + (cls ? ' ' + cls : ''), texto); b.type = 'button'; if (fn) b.addEventListener('click', fn); return b; };
  const accion = async (d) => { const r = await A.emit('pool:accion', { id: M && M.id, ...d }); if (r.error) A.toast(r.error, 'error'); return r; };
  const esInvitado = () => !!(window.app && window.app.user && window.app.user.isGuest);

  // ── La mesa (las mismas medidas que pool-motor.js) ──
  const W = 1000, H = 500, TL = 50, TR = 950, TT = 50, TB = 450, TW = TR - TL, TH = TB - TT;
  const R = 10, D = R * 2, POCKET_R = 24, HEAD_X = TL + TW / 4;
  const POCKETS = [{ x: TL, y: TT }, { x: TL + TW / 2, y: TT }, { x: TR, y: TT }, { x: TL, y: TB }, { x: TL + TW / 2, y: TB }, { x: TR, y: TB }];
  const COLOR = {
    1: '#f6d31a', 2: '#2a6fe8', 3: '#e8231c', 4: '#8a3ad8', 5: '#f28a1e', 6: '#3cc43a', 7: '#e2389e', 8: '#0c0c0c',
    9: '#f6d31a', 10: '#2a6fe8', 11: '#e8231c', 12: '#8a3ad8', 13: '#f28a1e', 14: '#3cc43a', 15: '#e2389e',
  };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function dibujarMesa(c) {
    c.clearRect(0, 0, W, H);
    const rail = c.createLinearGradient(0, 0, 0, H);
    rail.addColorStop(0, '#a3201c'); rail.addColorStop(0.5, '#8c1714'); rail.addColorStop(1, '#6e100e');
    c.fillStyle = rail; c.fillRect(0, 0, W, H);
    c.strokeStyle = '#4a0a08'; c.lineWidth = 2; c.strokeRect(1, 1, W - 2, H - 2);
    c.fillStyle = '#2f7a2c'; c.fillRect(TL - 14, TT - 14, TW + 28, TH + 28);
    const felt = c.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, W * 0.55);
    felt.addColorStop(0, '#3a8a35'); felt.addColorStop(1, '#2c7429');
    c.fillStyle = felt; c.fillRect(TL, TT, TW, TH);
    c.fillStyle = '#1f5a1d';
    const gc = POCKET_R + 6, gm = POCKET_R - 2;
    for (const [x, y, w, h] of [
      [TL + gc, TT - 14, TW / 2 - gc - gm, 14], [TL + TW / 2 + gm, TT - 14, TW / 2 - gc - gm, 14],
      [TL + gc, TB, TW / 2 - gc - gm, 14], [TL + TW / 2 + gm, TB, TW / 2 - gc - gm, 14],
      [TL - 14, TT + gc, 14, TH - gc * 2], [TR, TT + gc, 14, TH - gc * 2]]) c.fillRect(x, y, w, h);
    for (const p of POCKETS) {
      const esquina = p.x !== TL + TW / 2;
      const g = c.createLinearGradient(p.x - 46, p.y - 46, p.x + 46, p.y + 46);
      g.addColorStop(0, '#f6b860'); g.addColorStop(1, '#d8892e');
      c.fillStyle = g;
      if (esquina) { const q = 66, x0 = p.x < W / 2 ? 0 : W - q, y0 = p.y < H / 2 ? 0 : H - q; c.fillRect(x0, y0, q, q); }
      else { const s = 40, arriba = p.y < H / 2; c.fillRect(p.x - s / 2 - 6, arriba ? 0 : p.y, s + 12, arriba ? p.y : H - p.y); }
    }
    for (const p of POCKETS) {
      c.fillStyle = '#060606'; c.beginPath(); c.arc(p.x, p.y, POCKET_R, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#2a2a2a'; c.lineWidth = 2; c.beginPath(); c.arc(p.x, p.y, POCKET_R - 1, Math.PI * 0.15, Math.PI * 0.85); c.stroke();
    }
    c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(HEAD_X + 0.5, TT); c.lineTo(HEAD_X + 0.5, TB); c.stroke();
  }
  function dibujarBola(c, n, x, y, alfa = 1) {
    c.save(); c.globalAlpha = alfa;
    c.fillStyle = 'rgba(0,0,0,0.3)'; c.beginPath(); c.arc(x + 2, y + 2.5, R, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(x, y, R, 0, Math.PI * 2); c.clip();
    const raya = n >= 9;
    c.fillStyle = n === 0 || raya ? '#f7f7f2' : COLOR[n]; c.fillRect(x - R, y - R, D, D);
    if (raya) { c.fillStyle = COLOR[n]; c.fillRect(x - R, y - R * 0.5, D, R); }
    if (n > 0) { c.fillStyle = '#fff'; c.beginPath(); c.arc(x + R * 0.08, y - R * 0.05, R * 0.42, 0, Math.PI * 2); c.fill(); }
    const sh = c.createRadialGradient(x - R * 0.35, y - R * 0.45, R * 0.05, x, y, R * 1.05);
    sh.addColorStop(0, 'rgba(255,255,255,0.75)'); sh.addColorStop(0.25, 'rgba(255,255,255,0.12)'); sh.addColorStop(0.7, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,0.45)');
    c.fillStyle = sh; c.fillRect(x - R, y - R, D, D);
    c.restore();
  }
  function dibujarTaco(c, x, y, ang, fuerza, alfa = 1) {
    const dx = Math.cos(ang), dy = Math.sin(ang), back = 12 + fuerza * 80;
    const sx = x - dx * back, sy = y - dy * back, ex = sx - dx * 520, ey = sy - dy * 520;
    c.save(); c.globalAlpha = alfa; c.lineCap = 'butt';
    c.strokeStyle = 'rgba(0,0,0,0.25)'; c.lineWidth = 6; c.beginPath(); c.moveTo(sx + 2, sy + 3); c.lineTo(ex + 2, ey + 3); c.stroke();
    const g = c.createLinearGradient(sx, sy, ex, ey);
    g.addColorStop(0, '#d9c9a0'); g.addColorStop(0.5, '#9a5a2a'); g.addColorStop(1, '#5a2a10');
    c.strokeStyle = g; c.lineWidth = 5; c.beginPath(); c.moveTo(sx, sy); c.lineTo(ex, ey); c.stroke();
    c.restore();
  }
  // Hasta donde llega la guia: la primera bola o banda en la direccion del tiro
  function guia(bolas, x, y, ang) {
    const dx = Math.cos(ang), dy = Math.sin(ang);
    let best = Infinity;
    for (const b of bolas) {
      if (b.n === 0 || !b.on) continue;
      const fx = b.x - x, fy = b.y - y, t = fx * dx + fy * dy;
      if (t <= 0) continue;
      const p2 = fx * fx + fy * fy - t * t;
      if (p2 > D * D) continue;
      best = Math.min(best, t - Math.sqrt(D * D - p2));
    }
    const ws = [];
    if (dx > 0) ws.push((TR - R - x) / dx); if (dx < 0) ws.push((TL + R - x) / dx);
    if (dy > 0) ws.push((TB - R - y) / dy); if (dy < 0) ws.push((TT + R - y) / dy);
    best = Math.min(best, ...ws.filter(t => t > 0));
    return { x: x + dx * best, y: y + dy * best };
  }
  function sePuedePoner(bolas, cabecera, x, y) {
    if (!(x >= TL + R && x <= TR - R && y >= TT + R && y <= TB - R)) return false;
    if (cabecera && x > HEAD_X) return false;
    for (const b of bolas) if (b.n !== 0 && b.on && (b.x - x) ** 2 + (b.y - y) ** 2 < D * D) return false;
    for (const p of POCKETS) if ((p.x - x) ** 2 + (p.y - y) ** 2 < (POCKET_R + R) ** 2) return false;
    return true;
  }

  // ── Los sonidos (sintetizados, sin archivos: los del pool original del dueño) ──
  const audio = {
    ctx: null, master: null, ultimo: 0,
    init() {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
      try { const AC = window.AudioContext || window.webkitAudioContext; this.ctx = new AC(); this.master = this.ctx.createGain(); this.master.gain.value = 0.45; this.master.connect(this.ctx.destination); } catch { this.ctx = null; }
    },
    on() { try { return localStorage.getItem('pool-sonido') !== '0'; } catch { return true; } },
    ruido(dur) { const n = Math.max(1, Math.floor(this.ctx.sampleRate * dur)); const b = this.ctx.createBuffer(1, n, this.ctx.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; return b; },
    tono(tipo, f0, f1, dur, vol, t) { const o = this.ctx.createOscillator(); o.type = tipo; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.7); const g = this.ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); o.connect(g).connect(this.master); o.start(t); o.stop(t + dur + 0.01); },
    sopla(dur, vol, filtro, f, t) { const n = this.ctx.createBufferSource(); n.buffer = this.ruido(dur); const q = this.ctx.createBiquadFilter(); q.type = filtro; q.frequency.value = f; const g = this.ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); n.connect(q).connect(g).connect(this.master); n.start(t); },
    play(tipo, k) {
      if (!this.ctx || !this.on()) return;
      const t = this.ctx.currentTime; k = clamp(k || 0.5, 0.05, 1);
      if (tipo === 'bola') { if (t - this.ultimo < 0.018) return; this.ultimo = t; const f = 1400 + Math.random() * 500; this.tono('triangle', f, f * 0.5, 0.09, k * 0.32, t); this.sopla(0.045, k * 0.22, 'bandpass', 2400, t); }
      else if (tipo === 'banda') { this.tono('sine', 180, 60, 0.14, k * 0.32, t); this.tono('triangle', 800, 400, 0.04, k * 0.14, t); }
      else if (tipo === 'tronera') { this.tono('sine', 420, 80, 0.32, 0.38, t); this.sopla(0.3, 0.13, 'lowpass', 800, t); }
      else if (tipo === 'taco') { this.tono('triangle', 300 + k * 400, 120, 0.08, k * 0.38, t); this.sopla(0.03, k * 0.28, 'highpass', 1500, t); }
      else if (tipo === 'falta') { [520, 340].forEach((f, i) => this.tono('square', f, f, 0.18, 0.12, t + i * 0.13)); }
      else if (tipo === 'gano') { [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tono('triangle', f, f, 0.45, 0.22, t + i * 0.11)); }
    },
  };

  // ── La sala ──
  async function inicio() {
    const page = A.page();
    page.appendChild(A.head('Pool', A.botonEnlace('/app?juegos=pool', 'Pool · __PUENTE_APP__')));
    const b = el('div', 'jg-cuerpo jg-inicio pl-ui'); page.appendChild(b);
    const hero = el('div', 'jg-hero pl-hero');
    const dib = el('div', 'pl-hero-dibujo'); dib.innerHTML = tapaSvg();
    hero.append(dib, el('div', 'jg-hero-t', 'Pool'), el('div', 'jg-hero-s', '8 bolas, 1 contra 1'));
    const acc = el('div', 'jg-acciones');
    acc.append(
      btn('Crear partida', 'jg-primario', () => A.go('plCrear')),
      btn('Jugar con la compu', '', async () => { const r = await A.emit('pool:crear', { modo: 'compu', nivel: 2 }); if (r.error) return A.toast(r.error, 'error'); A.go('plMesa', r.id); }),
      btn('Cómo se juega', 'jg-suave', () => A.go('plReglas')),
    );
    hero.appendChild(acc);
    b.appendChild(hero);
    const box = el('div'); box.appendChild(el('div', 'jg-estado', 'Cargando…')); b.appendChild(box);
    const d = await A.emit('pool:inicio');
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
    const rules = (m) => '8 bolas' + (m.amistosa ? ' · amistosa' : '');
    const grupoTxt = (g) => g === 'lisas' ? 'con las lisas' : g === 'rayadas' ? 'con las rayadas' : 'mesa abierta';
    section('Te desafiaron', d.abiertas.filter(a => a.paraVos), (a) => row(a.creador, a.creador.nombre + ' te desafía', rules(a), 'Jugar', 'azul', () => unirse(a.id)));
    section('Tus partidas', d.mias, (m) => {
      const who = m.rival || m.invitado || { nombre: '?' };
      const top = m.estado === 'esperando' ? (m.invitado ? `Esperando a ${m.invitado.nombre}` : 'Esperando rival') : `vs ${who.nombre}`;
      const bottom = m.estado === 'terminada' ? (m.ganaste ? 'Ganaste' : 'Perdiste') : m.estado === 'jugando' ? `Vos ${grupoTxt(m.grupo)}` + (m.amistosa ? ' · amistosa' : '') : rules(m);
      return row(m.estado === 'esperando' && !m.invitado ? { nombre: '?' } : who, top, bottom, m.teToca ? 'Te toca' : '', 'amarillo', () => A.go('plMesa', m.id));
    });
    section('Mesas esperando rival', d.abiertas.filter(a => !a.paraVos), (a) => row(a.creador, a.creador.nombre, rules(a), 'Jugar', 'azul', () => unirse(a.id)));
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
      if (!list.length) { rk.appendChild(el('div', 'jg-vacio', 'Todavía nadie ganó una partida contra otra persona.')); continue; }
      const l = el('div', 'jg-lista');
      list.forEach((p, i) => { const r = el('div', 'jg-fila jg-rank'); r.append(el('span', 'jg-pos', ['🥇', '🥈', '🥉'][i] || String(i + 1)), A.avatar(p), el('span', 'jg-fnombre', p.nombre), el('span', 'jg-chip', `${p.ganadas} ${p.ganadas === 1 ? 'victoria' : 'victorias'}`)); l.appendChild(r); });
      rk.appendChild(l);
    }
  }
  async function unirse(id) {
    const r = await A.emit('pool:unirse', { id });
    if (r.error) return A.toast(r.error, 'error');
    A.go('plMesa', r.id);
  }
  // El dibujo de la tapa: un pedazo de mesa con la blanca y el triangulo
  function tapaSvg() {
    const bola = (x, y, c, raya) => raya
      ? `<circle cx="${x}" cy="${y}" r="9" fill="#f7f7f2"/><path d="M${x - 7.8} ${y - 4.5}h15.6a9 9 0 0 1 0 9h-15.6a9 9 0 0 1 0-9z" fill="${c}"/><circle cx="${x}" cy="${y}" r="9" fill="url(#plb)"/>`
      : `<circle cx="${x}" cy="${y}" r="9" fill="${c}"/><circle cx="${x}" cy="${y}" r="9" fill="url(#plb)"/>`;
    const tri = [[0, 0, 1], [1, -1, 2], [1, 1, 9], [2, -2, 3], [2, 0, 8], [2, 2, 10]];
    return '<svg viewBox="0 0 200 100" aria-hidden="true"><defs><radialGradient id="plb" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#fff" stop-opacity=".8"/><stop offset=".3" stop-color="#fff" stop-opacity=".1"/><stop offset="1" stop-color="#000" stop-opacity=".45"/></radialGradient></defs>'
      + '<rect width="200" height="100" rx="8" fill="#8c1714"/><rect x="10" y="10" width="180" height="80" fill="#2f7a2c"/>'
      + '<circle cx="10" cy="10" r="7" fill="#060606"/><circle cx="190" cy="10" r="7" fill="#060606"/><circle cx="10" cy="90" r="7" fill="#060606"/><circle cx="190" cy="90" r="7" fill="#060606"/><circle cx="100" cy="10" r="6" fill="#060606"/><circle cx="100" cy="90" r="6" fill="#060606"/>'
      + '<line x1="62" y1="50" x2="128" y2="50" stroke="#e6dc78" stroke-width="1" opacity=".8"/>'
      + bola(56, 50, '#f7f7f2') + tri.map(([c, r, n]) => bola(136 + c * 16, 50 + r * 9.5, COLOR[n], n >= 9)).join('')
      + '<line x1="44" y1="50" x2="0" y2="50" stroke="#9a5a2a" stroke-width="4"/></svg>';
  }

  // ── Crear partida ──
  function crear() {
    const page = A.page();
    page.appendChild(A.head('Nueva partida de Pool'));
    const b = el('div', 'jg-cuerpo pl-ui'); page.appendChild(b);
    const f = el('div', 'jg-form'); b.appendChild(f);
    const data = { modo: 'abierta', nivel: 2, rival: null, amistosa: false };
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
    const HINT = {
      abierta: 'La mesa queda en la sala y la toma el primero que quiera jugar.',
      desafio: 'Le mandás un mensaje directo con el enlace a la mesa.',
      compu: 'Para practicar. No cuenta para el ranking.',
    };
    seg('Contra quién', 'modo', [['abierta', 'Mesa abierta'], ['desafio', 'Desafiar a alguien'], ['compu', 'La compu']], () => { pick.hidden = data.modo !== 'desafio'; lvl.hidden = data.modo !== 'compu'; hint.textContent = HINT[data.modo]; verAm(); });
    const hint = el('div', 'jg-ayuda', HINT.abierta); f.appendChild(hint);
    const lvl = seg('Nivel de la compu', 'nivel', [[1, 'Fácil'], [2, 'Normal'], [3, 'Difícil']]); lvl.hidden = true;
    const pick = el('div', 'jg-campo'); pick.hidden = true;
    const sbox = el('label', 'jg-buscar'); sbox.insertAdjacentHTML('beforeend', A.svg(A.I.buscar, 20));
    const q = el('input'); q.type = 'search'; q.placeholder = 'Buscar a quién desafiar'; sbox.appendChild(q);
    const list = el('div', 'jg-lista'), chosen = el('div', 'jg-elegido');
    pick.append(sbox, chosen, list); f.appendChild(pick);
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
          r.addEventListener('click', () => { data.rival = p; chosen.textContent = 'Vas a desafiar a ' + p.nombre; list.textContent = ''; q.value = ''; err.textContent = ''; });
          list.appendChild(r);
        }
      }, 300);
    });
    // Competitiva (suma al ranking) o amistosa (queda en el récord, sin sumar). Con la compu no hace falta
    const AHINT = { false: 'Suma al ranking del mes y al histórico.', true: 'Queda en tu récord como amistosa, pero no suma al ranking.' };
    const am = seg('Ranking', 'amistosa', [[false, 'Competitiva'], [true, 'Amistosa']], () => { ah.textContent = AHINT[data.amistosa]; });
    const ah = el('div', 'jg-ayuda', AHINT.false); f.appendChild(ah);
    const verAm = () => { am.hidden = ah.hidden = data.modo === 'compu' || esInvitado(); }; verAm();
    const err = el('div', 'jg-error'); f.appendChild(err);
    const go2 = btn('Crear partida', 'jg-primario jg-ancho'); f.appendChild(go2);
    go2.addEventListener('click', async () => {
      err.textContent = '';
      if (data.modo === 'desafio' && !data.rival) { err.textContent = 'Elegí a quién desafiar.'; return; }
      go2.disabled = true;
      const r = await A.emit('pool:crear', { modo: data.modo, nivel: data.nivel, rival: data.rival && data.rival.id, amistosa: data.amistosa });
      go2.disabled = false;
      if (r.error) { err.textContent = r.error; return; }
      if (data.modo === 'desafio') { A.desafio(data.rival, `¡Te desafío a un pool${data.amistosa ? ' amistoso (no suma al ranking)' : ''}! Entrá acá: ${location.origin}/app?pool=${r.id}`); return; }
      A.stack().pop(); A.go('plMesa', r.id);
    });
  }

  // ── Reglas ──
  function reglas() {
    const page = A.page();
    page.appendChild(A.head('Cómo se juega'));
    const b = el('div', 'jg-cuerpo jg-reglas pl-ui'); page.appendChild(b);
    const sec = (t, x) => { b.appendChild(el('div', 'jg-sub', t)); b.appendChild(el('p', null, x)); };
    sec('El objetivo', 'Pool de 8 bolas: uno se queda con las lisas (1 a 7) y el otro con las rayadas (9 a 15). Gana el que mete todas las suyas y después la 8.');
    sec('Tirar', 'Apuntás con el mouse (la línea muestra hasta dónde va la blanca). La fuerza la elegís en la barra de la derecha y tirás con la barra espaciadora. También podés apretar sobre la mesa, arrastrar hacia atrás y soltar: cuanto más arrastrás, más fuerte. En el celular, tocá y arrastrá hacia atrás.');
    sec('El efecto', 'En la bola de arriba a la derecha elegís dónde le pega el taco a la blanca. Arriba: después del choque la blanca sigue de largo. Abajo: vuelve para atrás. A un costado: sale más abierta o más cerrada de la primera banda. Doble clic la vuelve al centro.');
    sec('La salida', 'El que rompe tiene la bola en mano detrás de la línea: arrastrá la blanca adonde quieras antes de tirar. Si entra la 8 en la salida, se rearma el triángulo y rompe de nuevo.');
    sec('Los grupos', 'Mientras la mesa está abierta podés pegarle a cualquier bola menos a la 8. El primero que mete una bola sin falta se queda con ese grupo (lisas o rayadas).');
    sec('El turno', 'Si metés una de tus bolas, seguís tirando. Si no metés ninguna, le toca al otro.');
    sec('Las faltas', 'Es falta si la blanca entra en una tronera, si no le pegás a ninguna bola, si le pegás primero a una del rival o a la 8 antes de tiempo. Con una falta le toca al otro, con bola en mano en cualquier lugar de la mesa.');
    sec('La 8', 'Cuando metiste todas las tuyas, vas por la 8. Si la metés sin falta, ganás. Si la metés antes de tiempo o con falta, perdés.');
  }

  // ── La mesa ──
  async function mesa(id) {
    salir();
    const page = A.page();
    M = {
      id, s: null, cv: null, ctx: null, bolas: [], ang: 0, fuerza: 0, barra: 0.5, efecto: { x: 0, y: 0 },
      apuntando: false, desde: null, arrastra: false, valido: true, anim: null, visto: undefined, enviando: false,
      rival: null, raf: 0, ultimoApunta: 0, finVisto: false,
    };
    const yo = M;
    const salirBtn = el('button', 'jg-btn jg-salir'); salirBtn.type = 'button'; salirBtn.style.visibility = 'hidden';
    salirBtn.addEventListener('click', menuSalir);
    page.appendChild(A.head('Pool', salirBtn));
    M.salirBtn = salirBtn;
    const b = el('div', 'jg-cuerpo pl-ui pl-mesa'); page.appendChild(b);
    // la mesa con sus paneles (como el pool original): arriba el aviso y los jugadores, a la derecha efecto y fuerza
    const juego = el('div', 'pl-juego');
    const centro = el('div', 'pl-centro');
    M.msg = el('div', 'pl-msg');
    const barra = el('div', 'pl-barra');
    M.j0 = jugador(); M.j1 = jugador(true);
    M.reloj = el('div', 'pl-reloj', '0:00');
    barra.append(M.j0.w, M.reloj, M.j1.w);
    M.cv = el('canvas', 'pl-lienzo'); M.cv.width = W; M.cv.height = H;
    M.cv.setAttribute('role', 'img'); M.cv.setAttribute('aria-label', 'Mesa de pool');
    M.ctx = M.cv.getContext('2d');
    M.bandeja = el('div', 'pl-bandeja'); M.bolasBandeja = el('div', 'pl-bolas'); M.bandeja.appendChild(M.bolasBandeja);
    M.fin = el('div', 'pl-fin'); M.fin.hidden = true;
    centro.append(M.msg, barra, M.cv, M.bandeja, M.fin);
    const der = el('div', 'pl-der');
    M.efectoEl = el('div', 'pl-efecto'); M.efectoEl.title = 'Efecto: tocá dónde le pega el taco a la blanca (doble clic: al centro)';
    M.punto = el('div', 'pl-punto'); M.efectoEl.appendChild(M.punto);
    M.medidor = el('div', 'pl-fuerza'); const tubo = el('div', 'pl-tubo'); M.lleno = el('div', 'pl-lleno'); tubo.appendChild(M.lleno); M.medidor.append(tubo, el('div', 'pl-marcas'));
    M.sonidoBtn = btn(audio.on() ? '🔊' : '🔇', 'jg-suave pl-sonido', () => { try { localStorage.setItem('pool-sonido', audio.on() ? '0' : '1'); } catch { /* sin almacenamiento */ } M.sonidoBtn.textContent = audio.on() ? '🔊' : '🔇'; audio.init(); });
    M.sonidoBtn.title = 'Sonido';
    der.append(M.efectoEl, el('div', 'pl-etq', 'Efecto'), M.medidor, el('div', 'pl-etq', 'Fuerza'), M.sonidoBtn);
    juego.append(centro, der);
    b.appendChild(juego);
    M.pie = el('div', 'pl-pie');
    M.chatBox = el('div', 'pl-chat');
    b.append(M.pie, M.chatBox);
    controles();
    M.msg.textContent = 'Cargando…';
    const d = await A.emit('pool:ver', { id });
    if (M !== yo) return;
    if (d.error) { M.msg.textContent = d.error; return; }
    render(d.partida);
    const loop = () => { if (M !== yo) return; dibujar(); M.raf = requestAnimationFrame(loop); };
    M.raf = requestAnimationFrame(loop);
  }
  function jugador(der) {
    const w = el('div', 'pl-jug' + (der ? ' der' : ''));
    const flecha = el('span', 'pl-flecha', '➡'), cara = el('span', 'pl-cara'), nombre = el('span', 'pl-nombre'), grupo = el('span', 'pl-grupo');
    w.append(flecha, cara, nombre, grupo);
    return { w, cara, nombre, grupo };
  }
  function salir() {
    if (!M) return;
    cancelAnimationFrame(M.raf);
    if (M.teclas) document.removeEventListener('keydown', M.teclas);
    M = null;
  }

  function menuSalir() {
    const s = M && M.s;
    if (!s) return;
    if (s.estado === 'esperando' && s.soyCreador) { A.confirmar('¿Cancelar la partida?', 'La mesa se cierra y nadie más puede entrar.', 'Cancelar partida', 'Volver').then(ok => { if (ok) A.emit('pool:cancelar', { id: s.id }).then(r => { if (r.error) A.toast(r.error, 'error'); else A.back(); }); }); return; }
    if (s.estado === 'jugando' && s.soyJugador) { A.confirmar('¿Abandonar la partida?', 'Si abandonás, perdés.', 'Abandonar', 'Seguir jugando').then(ok => { if (ok) accion({ tipo: 'abandonar' }); }); return; }
    const url = `${location.origin}/app?pool=${s.id}`;
    if (navigator.clipboard) navigator.clipboard.writeText(url).then(() => A.toast('Enlace copiado', 'success'), () => prompt('Copiá el enlace:', url));
    else prompt('Copiá el enlace:', url);
  }

  const bolasDe = (s) => (s.bolas || []).map(([n, x, y, on]) => ({ n, x, y, on: !!on }));

  function render(s) {
    if (!M || !s || s.id !== M.id) return;
    const antes = M.s;
    M.s = s;
    M.rival = null;
    const t = s.estado === 'esperando' && s.soyCreador ? 'Cancelar partida' : s.estado === 'jugando' && s.soyJugador ? 'Abandonar' : 'Copiar enlace';
    M.salirBtn.textContent = t; M.salirBtn.style.visibility = '';
    M.salirBtn.classList.toggle('jg-peligro', t !== 'Copiar enlace');
    // El tiro nuevo: se ve el recorrido (la primera vez que se abre la mesa, no: queda como esta)
    const nuevo = s.ultima && M.visto !== undefined && s.ultima.n !== M.visto;
    if (M.visto === undefined) M.visto = s.ultima ? s.ultima.n : 0;
    if (nuevo) { M.visto = s.ultima.n; reproducir(s); }
    else if (!M.anim) M.bolas = bolasDe(s);
    if (s.estado === 'jugando' && s.teToca && (!antes || !antes.teToca)) { M.fuerza = 0; M.enviando = false; }
    M.enviando = false;
    hud();
    pie();
    if (A.chat) A.chat(M.chatBox, s, (texto) => A.emit('pool:accion', { id: s.id, tipo: 'chat', texto }));
  }

  // El recorrido del ultimo tiro, cuadro por cuadro (30 por segundo), con sus sonidos
  function reproducir(s) {
    const u = s.ultima;
    const base = u.desde.map(b => ({ ...b }));
    // la bandeja: las que ya estaban y las que entran en este tiro (van apareciendo cuando caen)
    const fin = u.frames[u.frames.length - 1] || [];
    const total = base.filter((b, j) => b.on && b.n !== 0 && fin[j * 2] < 0).length;
    const bj = s.bandeja || [];
    M.anim = { s, u, base, t0: performance.now(), sonado: 0, metidas: 0, antes: bj.slice(0, Math.max(0, bj.length - total)), nuevas: bj.slice(Math.max(0, bj.length - total)) };
    bandeja(M.anim.antes);
    M.bolas = base;
    if (!u.mio) audio.play('taco', u.fuerza);
  }
  function avanzarAnim() {
    const a = M.anim;
    if (!a) return;
    const fr = a.u.frames, f = (performance.now() - a.t0) / 1000 * 30;
    const i = Math.floor(f);
    // los sonidos hasta este cuadro
    while (a.sonado < a.u.sonidos.length && a.u.sonidos[a.sonado][0] <= i) { const [, tipo, k] = a.u.sonidos[a.sonado++]; if (tipo !== 'taco') audio.play(tipo, k); }
    if (i >= fr.length - 1) {
      // quietas: medio segundo con la mesa asi y recien ahi cambia el turno
      if (!a.quietas) { a.quietas = performance.now(); M.bolas = bolasDe(M.s); return; }
      if (performance.now() - a.quietas < 500) return;
      M.anim = null;
      M.bolas = bolasDe(M.s);
      hud(); pie();
      if (M.s.estado === 'terminada') finDeJuego();
      else if (/^Falta/.test(M.s.texto || '')) audio.play('falta');
      return;
    }
    const A0 = fr[i], A1 = fr[i + 1], k = f - i;
    M.bolas = a.base.map((b, j) => {
      const x0 = A0[j * 2], y0 = A0[j * 2 + 1], x1 = A1[j * 2], y1 = A1[j * 2 + 1];
      if (x0 < 0) return { ...b, on: false };
      if (x1 < 0) return { ...b, x: x0, y: y0, on: true };
      return { ...b, x: x0 + (x1 - x0) * k, y: y0 + (y1 - y0) * k, on: true };
    });
    // en la bandeja van entrando las que ya cayeron
    const metidas = a.base.filter((b, j) => b.on && b.n !== 0 && A0[j * 2] < 0).length;
    if (metidas !== a.metidas) { a.metidas = metidas; bandeja(a.antes.concat(a.nuevas.slice(0, metidas))); }
  }

  const puedoTirar = () => M && M.s && M.s.estado === 'jugando' && M.s.teToca && !M.anim && !M.enviando;
  const blanca = () => M.bolas.find(b => b.n === 0);

  function hud() {
    const s = M.s;
    const pinta = (J, p, activo) => {
      J.w.classList.toggle('activo', !!activo);
      J.nombre.textContent = p ? (p === s.yo && s.soyJugador ? `${p.nombre} (vos)` : p.nombre) : 'Esperando…';
      J.cara.textContent = '';
      if (p) J.cara.appendChild(A.avatar(p));
      const g = p && p.grupo;
      J.grupo.className = 'pl-grupo' + (g ? ' ' + g : '');
      J.grupo.title = g === 'lisas' ? 'Lisas (1-7)' : g === 'rayadas' ? 'Rayadas (9-15)' : '';
    };
    const jugando = s.estado === 'jugando' && !M.anim;
    pinta(M.j0, s.yo, jugando && s.turno === 'yo');
    pinta(M.j1, s.rival, jugando && s.turno === 'rival');
    M.msg.textContent = mensaje();
    if (!M.anim) bandeja(s.bandeja || []);
  }
  function mensaje() {
    const s = M.s;
    if (M.anim) return M.anim.u.mio ? 'Tiraste…' : `Tira ${s.rival ? s.rival.nombre : 'el rival'}…`;
    if (s.estado === 'esperando') return s.invitado ? `Esperando a ${s.invitado.nombre}…` : 'Esperando rival… Pasale el enlace a alguien o esperá que alguien entre desde la sala.';
    if (s.estado === 'terminada') {
      const por = s.motivo === 'abandono' ? (s.ganador === 'yo' ? ' (tu rival abandonó)' : ' (abandonaste)') : '';
      return s.soyJugador ? (s.ganador === 'yo' ? `¡Ganaste!${por}` : `Perdiste.${por}`) : 'Terminó la partida.';
    }
    const antes = s.texto ? s.texto + ' ' : '';
    if (s.teToca) return antes + (s.enMano ? 'Podés mover la blanca antes de tirar. ' : '') + 'Presioná espacio para tirar.';
    return antes + `Juega ${s.rival ? s.rival.nombre : 'el rival'}…`;
  }
  function bandeja(lista) {
    const box = M.bolasBandeja;
    const ya = box.children.length;
    if (ya === lista.length && box.dataset.k === lista.join(',')) return;
    box.textContent = '';
    lista.forEach((n, i) => {
      const m = el('span', 'pl-mini');
      const c = COLOR[n];
      m.style.background = n >= 9
        ? `radial-gradient(circle at 50% 50%, #fff 0 22%, transparent 23%), linear-gradient(#f4f4f4 0 25%, ${c} 25% 75%, #f4f4f4 75%)`
        : `radial-gradient(circle at 50% 50%, #fff 0 22%, transparent 23%), ${c}`;
      if (i >= ya) m.classList.add('entra');
      box.appendChild(m);
    });
    box.dataset.k = lista.join(',');
  }
  function pie() {
    const s = M.s;
    M.pie.textContent = '';
    if (s.estado === 'terminada' && s.soyJugador) {
      if (s.siguiente) M.pie.appendChild(btn('Ir a la revancha', 'jg-primario', () => { A.stack().pop(); A.go('plMesa', s.siguiente); }));
      else if (s.revancha && s.revancha.yo) M.pie.appendChild(el('div', 'jg-estado', 'Esperando que el otro acepte la revancha…'));
      else M.pie.appendChild(btn(s.revancha && s.revancha.rival ? 'Aceptar la revancha' : 'Revancha', 'jg-primario', async () => { const r = await accion({ tipo: 'revancha' }); if (r.id) { A.stack().pop(); A.go('plMesa', r.id); } }));
    }
    const ult = (s.log || []).slice(-3);
    if (ult.length) { const l = el('div', 'pl-log'); for (const x of ult) l.appendChild(el('div', null, x)); M.pie.appendChild(l); }
    if (s.compu && s.nivel) M.pie.appendChild(el('div', 'jg-ayuda', `Contra la compu (${s.nivel.toLowerCase()}).`));
    else if (s.amistosa) M.pie.appendChild(el('div', 'jg-ayuda', 'Partida amistosa: no suma al ranking.'));
  }
  function finDeJuego() {
    const s = M.s;
    if (M.finVisto || !s.soyJugador) return;
    M.finVisto = true;
    audio.play(s.ganador === 'yo' ? 'gano' : 'falta');
    M.fin.textContent = '';
    const ok = btn('Aceptar', '', () => { M.fin.hidden = true; });
    M.fin.append(el('div', 'pl-fin-t', 'Fin del juego'), el('div', 'pl-fin-c', s.ganador === 'yo' ? `¡Ganaste la partida!` : `${s.rival ? s.rival.nombre : 'Tu rival'} ganó la partida.`), el('div', 'pl-fin-a'));
    M.fin.lastChild.appendChild(ok);
    M.fin.hidden = false;
  }

  // ── Dibujar (cada cuadro) ──
  function dibujar() {
    if (!M || !M.ctx) return;
    avanzarAnim();
    const c = M.ctx, s = M.s;
    dibujarMesa(c);
    if (!s) return;
    const cue = blanca();
    const mio = puedoTirar();
    // bola en mano: la zona de la cabecera y un aro alrededor de la blanca
    if (s.estado === 'jugando' && s.enMano && !M.anim && cue) {
      if (s.cabecera) { c.fillStyle = 'rgba(255,255,255,0.05)'; c.fillRect(TL, TT, TW / 4, TH); }
      c.save(); c.setLineDash([2, 3]); c.strokeStyle = M.valido ? '#e8e050' : '#ff5050'; c.lineWidth = 1.5;
      c.beginPath(); c.arc(cue.x, cue.y, R + 4, 0, Math.PI * 2); c.stroke(); c.restore();
    }
    for (const b of M.bolas) if (b.on && b.n !== 0) dibujarBola(c, b.n, b.x, b.y);
    if (cue && cue.on) dibujarBola(c, 0, cue.x, cue.y);
    if (!cue || !cue.on || M.anim || s.estado !== 'jugando') return;
    if (mio && !M.arrastra) {
      const g = guia(M.bolas, cue.x, cue.y, M.ang);
      // la guia punteada hasta el circulo de donde va a pegar (como en el video de referencia)
      c.save(); c.setLineDash([3, 4]); c.strokeStyle = 'rgba(230,220,120,0.8)'; c.lineWidth = 1;
      c.beginPath(); c.moveTo(cue.x, cue.y); c.lineTo(g.x, g.y); c.stroke();
      c.setLineDash([2, 3]); c.strokeStyle = '#e8e050'; c.lineWidth = 1.5;
      c.beginPath(); c.arc(g.x, g.y, R, 0, Math.PI * 2); c.stroke(); c.restore();
      dibujarTaco(c, cue.x, cue.y, M.ang, M.apuntando ? M.fuerza : 0);
    } else if (!s.teToca && M.rival && performance.now() - M.rival.t < 4000) {
      // como apunta el rival (y donde pone la blanca si tiene bola en mano)
      const x = M.rival.x != null ? M.rival.x : cue.x, y = M.rival.y != null ? M.rival.y : cue.y;
      if (s.enMano && M.rival.x != null) { cue.x = x; cue.y = y; }
      dibujarTaco(c, x, y, M.rival.ang, M.rival.fuerza || 0, 0.85);
    }
    // la barra de fuerza (en el celular va acostada)
    const pc = ((M.apuntando ? M.fuerza : M.barra) * 100) + '%';
    if (M.medidor.offsetWidth > M.medidor.offsetHeight) { M.lleno.style.width = pc; M.lleno.style.height = ''; } else { M.lleno.style.height = pc; M.lleno.style.width = ''; }
    if (s.inicio) { const sg = Math.max(0, Math.floor((Date.now() - s.inicio) / 1000)); M.reloj.textContent = `${Math.floor(sg / 60)}:${String(sg % 60).padStart(2, '0')}`; }
  }

  // ── Los controles ──
  function controles() {
    const cv = M.cv;
    const punto = (e) => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * (W / r.width), y: (e.clientY - r.top) * (H / r.height) }; };
    const apuntarA = (x, y) => { const cue = blanca(); if (!cue) return; const dx = x - cue.x, dy = y - cue.y; if (Math.hypot(dx, dy) > 1) M.ang = Math.atan2(dy, dx); };
    const contar = () => {
      // la mira, para que el rival la vea (pool.js la reparte; como mucho 12 por segundo)
      const now = performance.now();
      if (now - M.ultimoApunta < 85 || !M.s || M.s.compu) return;
      M.ultimoApunta = now;
      const cue = blanca();
      A.emit('pool:accion', { id: M.id, tipo: 'apunta', ang: M.ang, fuerza: M.apuntando ? M.fuerza : 0, x: cue && cue.x, y: cue && cue.y }).catch(() => {});
    };
    cv.addEventListener('pointermove', (e) => {
      if (!puedoTirar()) return;
      const p = punto(e);
      if (M.arrastra) {
        const q = { x: clamp(p.x, TL + R, TR - R), y: clamp(p.y, TT + R, TB - R) };
        M.valido = sePuedePoner(M.bolas, M.s.cabecera, q.x, q.y);
        if (M.valido) { const cue = blanca(); cue.x = q.x; cue.y = q.y; cue.on = true; }
        contar(); return;
      }
      if (M.apuntando) {
        // arrastrar hacia atras (en contra del tiro) carga la fuerza
        const pull = (M.desde.x - p.x) * Math.cos(M.ang) + (M.desde.y - p.y) * Math.sin(M.ang);
        M.fuerza = clamp(pull / 200, 0, 1);
      } else apuntarA(p.x, p.y);
      contar();
    });
    cv.addEventListener('pointerdown', (e) => {
      audio.init();
      if (!puedoTirar()) return;
      const p = punto(e);
      try { cv.setPointerCapture(e.pointerId); } catch { /* sin captura */ }
      const cue = blanca();
      if (M.s.enMano && cue && Math.hypot(p.x - cue.x, p.y - cue.y) < R * 2.2) { M.arrastra = true; M.valido = true; return; }
      if (e.pointerType === 'touch') apuntarA(p.x, p.y);
      M.apuntando = true; M.fuerza = 0; M.desde = p;
    });
    const soltar = (e) => {
      try { cv.releasePointerCapture(e.pointerId); } catch { /* ya suelto */ }
      if (M.arrastra) { M.arrastra = false; M.valido = true; return; }
      if (!M.apuntando) return;
      M.apuntando = false;
      if (M.fuerza > 0.02) { M.barra = M.fuerza; tirar(M.fuerza); }
      M.fuerza = 0;
    };
    cv.addEventListener('pointerup', soltar);
    cv.addEventListener('pointercancel', () => { M.apuntando = false; M.arrastra = false; M.fuerza = 0; });
    // espacio: tira con la fuerza de la barra (si no se esta escribiendo en el chat)
    M.teclas = (e) => {
      if (e.code !== 'Space' || e.repeat || !M) return;
      const a = document.activeElement;
      if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable)) return;
      if (!document.body.contains(M.cv)) return;
      e.preventDefault();
      audio.init();
      if (!puedoTirar() || M.apuntando || M.arrastra) return;
      tirar(Math.max(0.03, M.barra));
    };
    document.addEventListener('keydown', M.teclas);
    // la barra de fuerza: tocar o arrastrar (abajo poca, arriba mucha)
    const desdeBarra = (e) => {
      const r = M.medidor.querySelector('.pl-tubo').getBoundingClientRect();
      M.barra = clamp(r.width > r.height ? (e.clientX - r.left) / r.width : 1 - (e.clientY - r.top) / r.height, 0.03, 1);
    };
    M.medidor.addEventListener('pointerdown', (e) => { try { M.medidor.setPointerCapture(e.pointerId); } catch { /* sin captura */ } desdeBarra(e); });
    M.medidor.addEventListener('pointermove', (e) => { if (e.buttons) desdeBarra(e); });
    // el efecto
    const ponerEfecto = (x, y) => { const d = Math.hypot(x, y); if (d > 0.8) { x *= 0.8 / d; y *= 0.8 / d; } M.efecto = { x, y }; M.punto.style.left = (50 + x * 50) + '%'; M.punto.style.top = (50 + y * 50) + '%'; };
    const desdeEfecto = (e) => { const r = M.efectoEl.getBoundingClientRect(); ponerEfecto((e.clientX - r.left) / r.width * 2 - 1, (e.clientY - r.top) / r.height * 2 - 1); };
    M.efectoEl.addEventListener('pointerdown', (e) => { try { M.efectoEl.setPointerCapture(e.pointerId); } catch { /* sin captura */ } desdeEfecto(e); });
    M.efectoEl.addEventListener('pointermove', (e) => { if (e.buttons) desdeEfecto(e); });
    M.efectoEl.addEventListener('dblclick', () => ponerEfecto(0, 0));
    M.ponerEfecto = ponerEfecto;
  }
  async function tirar(fuerza) {
    const s = M.s, cue = blanca();
    if (!cue) return;
    M.enviando = true;
    audio.play('taco', fuerza);
    const yo = M;
    const r = await A.emit('pool:accion', { id: M.id, tipo: 'tirar', ang: M.ang, fuerza, efecto: M.efecto, blanca: s.enMano ? { x: cue.x, y: cue.y } : null });
    if (M !== yo) return;
    if (r.error) { M.enviando = false; A.toast(r.error, 'error'); return; }
    // el efecto vuelve al centro despues de cada tiro
    M.ponerEfecto(0, 0);
  }

  // ── Para aviso.js ──
  window.puentePool = {
    usar(api) { A = api; },
    inicio, crear, reglas, mesa, salir,
    estado(s) { if (M && s && s.id === M.id) render(s); },
    apunta(m) { if (M && m && m.id === M.id && M.s && !M.s.teToca) M.rival = { ...m, t: performance.now() }; },
    abierta: () => M && M.id,
  };
})();
