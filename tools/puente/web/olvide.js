// Pagina "Recuperar la contraseña" (/puente/olvide, email.js del puente).
// Sin ?t= pide el email y manda el enlace; con ?t= (el enlace del mail) deja
// elegir la contraseña nueva.
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const token = new URLSearchParams(location.search).get('t') || '';
  // (el enlace del mail en ingles trae &en=1)
  const en = new URLSearchParams(location.search).get('en') === '1';
  const T = (es, ing) => (en ? ing : es);
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
    if (en) {
      document.documentElement.lang = 'en'; document.title = 'Choose a new password';
      const txt = (sel, t) => { const n = document.querySelector(sel); if (n) n.textContent = t; };
      txt('label[for=clave]', 'New password'); txt('#cambiar small', 'At least 8 characters.'); txt('label[for=clave2]', 'Repeat the password');
      txt('#cambiar button', 'Save the new password'); txt('#ir', 'Sign in'); txt('#con-discord', 'Recover with Discord'); txt('#otras a[href="/"]', 'Back to sign in');
    }
    $('titulo').textContent = T('Elegí una contraseña nueva', 'Choose a new password');
    $('bajada').textContent = '';
    fetch('/puente/api/email/restablecer?t=' + encodeURIComponent(token) + (en ? '&en=1' : '')).then(r => r.json().then(d => ({ ok: r.ok, d }))).then(({ ok, d }) => {
      if (!ok) { note(d.error || T('El enlace caducó. Pedí uno nuevo.', 'The link expired. Ask for a new one.'), true); $('ir').hidden = false; $('ir').href = '/puente/olvide'; $('ir').textContent = T('Pedir un enlace nuevo', 'Ask for a new link'); return; }
      $('bajada').textContent = T('Para la cuenta ', 'For the account ') + d.usuario + '.';
      $('cambiar').hidden = false;
      $('clave').focus();
    }).catch(() => note(T('No hay conexión. Recargá la página.', 'No connection. Reload the page.'), true));
    $('cambiar').addEventListener('submit', (e) => {
      e.preventDefault();
      const form = $('cambiar');
      const a = $('clave').value, b = $('clave2').value;
      if (a !== b) return note(T('Las dos contraseñas no coinciden.', "The two passwords don't match."), true);
      busy(form, true); note('');
      post('/puente/api/email/restablecer', { t: token, password: a, en }).then(({ ok, d }) => {
        busy(form, false);
        if (!ok) return note(d.error || T('No se pudo. Probá de nuevo.', "Couldn't do it. Try again."), true);
        form.hidden = true;
        $('otras').hidden = true;
        $('titulo').textContent = T('¡Listo!', 'Done!');
        $('bajada').textContent = '';
        note(T('Tu contraseña nueva quedó guardada. Ya podés iniciar sesión con ', 'Your new password is saved. You can now sign in as ') + d.usuario + '.');
        $('ir').hidden = false;
      }).catch(() => { busy(form, false); note(T('No hay conexión. Probá de nuevo.', 'No connection. Try again.'), true); });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
