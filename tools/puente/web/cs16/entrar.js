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
  const acciones = document.getElementById('acciones');
  const entrarBtn = document.getElementById('entrar');
  const volver = document.getElementById('volver');
  let destino = '';
  let pase = '';

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

  function pintarRanking(d) {
    if (!ranking) return;
    ranking.hidden = false;
    if (!lista) return;
    lista.textContent = '';
    const top = d && Array.isArray(d.top) ? d.top.slice(0, 10) : [];
    if (!top.length) {
      if (vacio) vacio.hidden = false;
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
    let r, datos;
    try {
      r = await fetch('/puente/api/cs16/entrada', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + tk, 'Content-Type': 'application/json' },
        body: '{}',
        cache: 'no-store',
      });
      datos = await r.json().catch(() => null);
    } catch {
      mostrar('No se pudo hablar con CV Chat. Revisá tu conexión y probá de nuevo.', true);
      return;
    }
    if (!r.ok || !datos || !datos.entrada || !datos.url) {
      mostrar((datos && datos.error) || 'No se pudo entrar. Probá de nuevo.', true);
      return;
    }
    destino = String(datos.url);
    pase = String(datos.entrada);
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

  if (volver) {
    volver.addEventListener('click', () => {
      try { window.top.location.href = '/app?juegos=cs16'; } catch { location.href = '/app?juegos=cs16'; }
    });
  }

  entrar();
})();
