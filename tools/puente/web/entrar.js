// Pagina "Entrar con Discord" (/puente/entrar, vincular.js del puente).
//  ?listo=<codigo>  la cuenta ya estaba vinculada: se toma la sesion y a la app
//  ?nuevo=<codigo>  Discord sin cuenta: elegir el usuario, aceptar y crearla
//  ?error=<motivo>  algo no se pudo (cancelado, admin, 2fa, ban...)
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const q = new URLSearchParams(location.search);
  history.replaceState(null, '', location.pathname); // los codigos no quedan en el historial
  const note = (text, bad) => { const n = $('nota'); n.textContent = text; n.hidden = !text; n.classList.toggle('mal', !!bad); };
  const post = (url, body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    .then(r => r.json().catch(() => ({})).then(d => ({ ok: r.ok, d })));
  const title = (t, sub) => { $('titulo').textContent = t; $('bajada').textContent = sub || ''; };
  const backToLogin = (text) => { $('ir').hidden = false; if (text) $('ir').textContent = text; };

  // La sesion, guardada igual que la guarda Haven al iniciar sesion
  function enter(d) {
    try {
      localStorage.setItem('haven_token', d.token);
      localStorage.setItem('haven_user', JSON.stringify(d.user));
    } catch {
      note('Tu navegador no deja guardar la sesión (¿modo privado?).', true);
      return backToLogin();
    }
    location.replace('/app');
  }

  const ERRORS = {
    cancelado: ['No se completó', 'Cancelaste el inicio de sesión con Discord.'],
    caducado: ['Se venció el paso', 'Tardó demasiado. Volvé a tocar "Entrar con Discord".'],
    discord: ['No se pudo', 'Discord no respondió bien. Probá de nuevo en un momento.'],
    admin: ['Entrá con tu contraseña', 'Las cuentas de administrador entran con usuario y contraseña, por seguridad.'],
    '2fa': ['Entrá con tu contraseña', 'Tu cuenta tiene verificación en dos pasos: entrá con usuario, contraseña y el código.'],
    ban: ['No podés entrar', 'Esta cuenta está suspendida en este servidor.'],
  };

  if (q.get('listo')) {
    title('Entrando…');
    post('/puente/api/entrar/sesion', { codigo: q.get('listo') }).then(({ ok, d }) => {
      if (ok && d.token) return enter(d);
      title('Se venció el paso', d.error || 'Volvé a tocar "Entrar con Discord".'); backToLogin();
    }).catch(() => { title('No hay conexión', 'Probá de nuevo.'); backToLogin(); });
    return;
  }

  if (q.get('nuevo')) {
    const code = q.get('nuevo');
    title('Crear tu cuenta', '');
    fetch('/puente/api/entrar/nuevo?codigo=' + encodeURIComponent(code)).then(r => r.json().then(d => ({ ok: r.ok, d }))).then(({ ok, d }) => {
      if (!ok) { title('Se venció el paso', d.error || ''); return backToLogin(); }
      title('Crear tu cuenta en ' + d.app, 'Con tu cuenta de Discord, en un paso.');
      $('avatar').src = d.avatar;
      $('nombre').textContent = d.nombre;
      $('discord').textContent = '@' + d.discord;
      $('usuario').value = d.usuario;
      $('crear').hidden = false;
      $('otras').hidden = false;
      // Las condiciones: las mismas que muestra Haven al registrarse
      $('terminos').addEventListener('click', (e) => { e.preventDefault(); window.open('/?terminos=1', '_blank', 'noopener'); });
    }).catch(() => { title('No hay conexión', 'Recargá la página.'); backToLogin(); });
    $('crear').addEventListener('submit', (e) => {
      e.preventDefault();
      const btn = $('crear').querySelector('button');
      btn.disabled = true; note('');
      post('/puente/api/entrar/crear', { codigo: code, usuario: $('usuario').value.trim(), acepto: $('acepto').checked }).then(({ ok, d }) => {
        if (ok && d.token) return enter(d);
        btn.disabled = false;
        note(d.error || 'No se pudo crear la cuenta.', true);
      }).catch(() => { btn.disabled = false; note('No hay conexión. Probá de nuevo.', true); });
    });
    return;
  }

  const [t, sub] = ERRORS[q.get('error')] || ['Entrar con Discord', 'Tocá "Entrar con Discord" en la pantalla de inicio.'];
  title(t, sub);
  backToLogin();
})();
