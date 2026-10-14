// Pagina "Recuperar la contraseña" (/puente/olvide, email.js del puente).
// Sin ?t= pide el email y manda el enlace; con ?t= (el enlace del mail) deja
// elegir la contraseña nueva.
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const token = new URLSearchParams(location.search).get('t') || '';
  const note = (text, bad) => { const n = $('nota'); n.textContent = text; n.hidden = !text; n.classList.toggle('mal', !!bad); };
  const post = (url, body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    .then(r => r.json().catch(() => ({})).then(d => ({ ok: r.ok, d })));
  const busy = (form, on) => { const b = form.querySelector('button'); b.disabled = on; };

  function start() {
    if (!token) {
      $('pedir').addEventListener('submit', (e) => {
        e.preventDefault();
        const form = $('pedir');
        busy(form, true); note('');
        post('/puente/api/email/olvide', { email: $('email').value.trim() }).then(({ ok, d }) => {
          busy(form, false);
          if (!ok) return note(d.error || 'No se pudo. Probá de nuevo en un rato.', true);
          form.hidden = true;
          $('bajada').textContent = '';
          note('Si hay una cuenta con ese email, te llega un mail con el enlace en unos minutos. Fijate también en la carpeta de spam.');
        }).catch(() => { busy(form, false); note('No hay conexión. Probá de nuevo.', true); });
      });
      return;
    }
    // Con el enlace del mail: sacarlo de la barra de direcciones y pedir la contraseña nueva
    history.replaceState(null, '', location.pathname);
    $('pedir').hidden = true;
    $('titulo').textContent = 'Elegí una contraseña nueva';
    $('bajada').textContent = '';
    fetch('/puente/api/email/restablecer?t=' + encodeURIComponent(token)).then(r => r.json().then(d => ({ ok: r.ok, d }))).then(({ ok, d }) => {
      if (!ok) { note(d.error || 'El enlace caducó. Pedí uno nuevo.', true); $('ir').hidden = false; $('ir').href = '/puente/olvide'; $('ir').textContent = 'Pedir un enlace nuevo'; return; }
      $('bajada').textContent = 'Para la cuenta ' + d.usuario + '.';
      $('cambiar').hidden = false;
      $('clave').focus();
    }).catch(() => note('No hay conexión. Recargá la página.', true));
    $('cambiar').addEventListener('submit', (e) => {
      e.preventDefault();
      const form = $('cambiar');
      const a = $('clave').value, b = $('clave2').value;
      if (a !== b) return note('Las dos contraseñas no coinciden.', true);
      busy(form, true); note('');
      post('/puente/api/email/restablecer', { t: token, password: a }).then(({ ok, d }) => {
        busy(form, false);
        if (!ok) return note(d.error || 'No se pudo. Probá de nuevo.', true);
        form.hidden = true;
        $('otras').hidden = true;
        $('titulo').textContent = '¡Listo!';
        $('bajada').textContent = '';
        note('Tu contraseña nueva quedó guardada. Ya podés iniciar sesión con ' + d.usuario + '.');
        $('ir').hidden = false;
      }).catch(() => { busy(form, false); note('No hay conexión. Probá de nuevo.', true); });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
