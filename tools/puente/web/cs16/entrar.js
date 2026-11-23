// Puente entre la sesión de CV Chat y el servidor de CS 1.6. Corre en el mismo
// origen del chat (por eso puede leer el token de Haven), pide un pase firmado y
// manda el iframe a la página del juego con ?cvchat=<pase>. No muestra ni pide
// contraseña: la web del juego la completa después de verificar el pase.
(function () {
  'use strict';

  const estado = document.getElementById('estado');
  const detalle = document.getElementById('detalle');
  const volver = document.getElementById('volver');

  function mostrar(texto, esError) {
    if (estado) estado.hidden = true;
    if (detalle) {
      detalle.hidden = false;
      detalle.textContent = texto;
      detalle.className = 'estado' + (esError ? ' error' : '');
    }
    if (volver) volver.hidden = false;
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
    const url = String(datos.url);
    const sep = url.includes('?') ? '&' : '?';
    location.replace(url + sep + 'cvchat=' + encodeURIComponent(datos.entrada));
  }

  if (volver) {
    volver.addEventListener('click', () => {
      try { window.top.location.href = '/app?juegos=cs16'; } catch { location.href = '/app?juegos=cs16'; }
    });
  }

  entrar();
})();
