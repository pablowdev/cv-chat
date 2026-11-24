// Puente entre la sesión de CV Chat y el servidor de CS 1.6. Corre en el mismo
// origen del chat (por eso puede leer el token de Haven), pide un pase firmado,
// pide el ranking de kills y recién cuando la persona toca «Entrar a la partida»
// la manda a la página del juego con ?cvchat=<pase>. No muestra ni pide
// contraseña: la web del juego la completa después de verificar el pase.
(function () {
  'use strict';

  const estado = document.getElementById('estado');
  const detalle = document.getElementById('detalle');
  const ranking = document.getElementById('ranking');
  const lista = document.getElementById('ranking-lista');
  const vacio = document.getElementById('ranking-vacio');
  const tabs = document.getElementById('ranking-tabs');
  const premiosEl = document.getElementById('ranking-premios');
  const semanaEl = document.getElementById('ranking-semana');
  const acciones = document.getElementById('acciones');
  const entrarBtn = document.getElementById('entrar');
  const volver = document.getElementById('volver');
  let destino = '';
  let pase = '';
  let rankingDatos = null;
  let tab = 'semana';
  let premios = [150, 100, 50];
  let minimo = 10;
  let participantesMin = 3;

  function mostrar(texto, esError) {
    if (estado) estado.hidden = true;
    if (ranking) ranking.hidden = true;
    if (detalle) {
      detalle.hidden = false;
      detalle.textContent = texto;
      detalle.classList.toggle('error', !!esError);
    }
    if (acciones) acciones.hidden = false;
    if (volver) volver.hidden = false;
    if (entrarBtn) entrarBtn.hidden = true;
  }

  const fechaCorta = (s) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
    return m ? m[3] + '/' + m[2] : '';
  };

  function textoPremios() {
    if (!Array.isArray(premios) || !premios.length) return '';
    return 'Premios: ' + premios.map((n, i) => (i + 1) + '° ' + n).join(' · ') + ' monedas';
  }

  function textoCondiciones() {
    const s = rankingDatos && rankingDatos.semana;
    if (!s) return '';
    const partes = [];
    const desde = fechaCorta(s.desde), hasta = fechaCorta(s.hasta);
    if (desde && hasta) partes.push('Semana del ' + desde + ' al ' + hasta);
    partes.push('se paga el lunes');
    const minimos = [];
    if (minimo > 0) minimos.push(minimo + ' kills');
    if (participantesMin > 0) minimos.push(participantesMin + ' jugadores');
    if (minimos.length) partes.push('mínimo ' + minimos.join(' y '));
    return partes.join(' · ');
  }

  function pintarTab() {
    if (!lista) return;
    const semanal = tab === 'semana';
    const top = semanal
      ? (rankingDatos && rankingDatos.semana && Array.isArray(rankingDatos.semana.top) ? rankingDatos.semana.top.slice(0, 10) : [])
      : (rankingDatos && Array.isArray(rankingDatos.top) ? rankingDatos.top.slice(0, 10) : []);
    if (premiosEl) {
      premiosEl.hidden = !semanal;
      if (semanal) premiosEl.textContent = textoPremios();
    }
    if (semanaEl) {
      const texto = semanal ? textoCondiciones() : '';
      semanaEl.hidden = !texto;
      if (texto) semanaEl.textContent = texto;
    }
    lista.textContent = '';
    if (!top.length) {
      if (vacio) {
        vacio.hidden = false;
        vacio.textContent = semanal
          ? 'Todavía no hay kills esta semana. ¡Jugá y aparecé acá!'
          : 'Todavía no hay kills registradas. ¡Jugá y aparecé acá!';
      }
      return;
    }
    if (vacio) vacio.hidden = true;
    for (let i = 0; i < top.length; i++) {
      const j = top[i] || {};
      const li = document.createElement('li');
      const pos = document.createElement('span');
      pos.className = 'pos';
      pos.textContent = String(i + 1);
      const nombre = document.createElement('span');
      nombre.className = 'nombre';
      nombre.textContent = String(j.nombre || 'Jugador');
      const kills = document.createElement('span');
      kills.className = 'kills';
      const num = document.createElement('b');
      num.textContent = String(Math.max(0, Number(j.kills) || 0));
      kills.append(num, ' kills');
      li.append(pos, nombre, kills);
      lista.appendChild(li);
    }
  }

  function pintarRanking(d) {
    rankingDatos = d || null;
    if (!ranking) return;
    ranking.hidden = false;
    if (tabs) {
      const haySemana = !!(d && d.semana && Array.isArray(d.semana.top));
      tabs.hidden = !haySemana;
      if (!haySemana) tab = 'historico';
    }
    pintarTab();
  }

  async function cargarRanking(url) {
    if (!url || !pase) { pintarRanking(null); return; }
    try {
      const api = new URL('/api/ranking', url);
      api.searchParams.set('cvchat', pase);
      const control = new AbortController();
      const corte = setTimeout(() => control.abort(), 5000);
      const r = await fetch(api, { cache: 'no-store', signal: control.signal });
      clearTimeout(corte);
      const d = r.ok ? await r.json().catch(() => null) : null;
      pintarRanking(d);
    } catch {
      pintarRanking(null);
    }
  }

  function entrarAlJuego() {
    if (!destino || !pase) return;
    const sep = destino.includes('?') ? '&' : '?';
    location.replace(destino + sep + 'cvchat=' + encodeURIComponent(pase));
  }

  function token() {
    try { return localStorage.getItem('haven_token') || ''; } catch { return ''; }
  }

  async function entrar() {
    const tk = token();
    if (!tk) {
      mostrar('Abrí el juego desde tu sesión de CV Chat para entrar.', true);
      return;
    }
    let r, resp;
    try {
      r = await fetch('/puente/api/cs16/entrada', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + tk, 'Content-Type': 'application/json' },
        body: '{}',
        cache: 'no-store',
      });
      resp = await r.json().catch(() => null);
    } catch {
      mostrar('No se pudo hablar con CV Chat. Revisá tu conexión y probá de nuevo.', true);
      return;
    }
    if (!r.ok || !resp || !resp.entrada || !resp.url) {
      mostrar((resp && resp.error) || 'No se pudo entrar. Probá de nuevo.', true);
      return;
    }
    destino = String(resp.url);
    pase = String(resp.entrada);
    if (Array.isArray(resp.premios) && resp.premios.length) premios = resp.premios.map(Number).filter((n) => n > 0);
    if (Number(resp.minimo) > 0) minimo = Number(resp.minimo);
    if (Number(resp.participantes) > 0) participantesMin = Number(resp.participantes);
    if (estado) estado.hidden = true;
    if (detalle) detalle.hidden = true;
    if (acciones) acciones.hidden = false;
    if (volver) volver.hidden = false;
    if (entrarBtn) {
      entrarBtn.hidden = false;
      entrarBtn.addEventListener('click', entrarAlJuego, { once: true });
    }
    await cargarRanking(destino);
  }

  if (tabs) {
    tabs.addEventListener('click', (e) => {
      const b = e.target && e.target.closest ? e.target.closest('button[data-tab]') : null;
      if (!b) return;
      tab = b.dataset.tab === 'historico' ? 'historico' : 'semana';
      tabs.querySelectorAll('.tab').forEach((x) => x.classList.toggle('activo', x === b));
      pintarTab();
    });
  }

  if (volver) {
    volver.addEventListener('click', () => {
      try { window.top.location.href = '/app?juegos=cs16'; } catch { location.href = '/app?juegos=cs16'; }
    });
  }

  entrar();
})();
