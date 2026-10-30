// Pagina "Entrar con Discord" (/puente/entrar, vincular.js del puente).
//  ?listo=<codigo>  la cuenta ya estaba vinculada: se toma la sesion y a la app
//  ?nuevo=<codigo>  Discord sin cuenta: elegir el usuario, aceptar y crearla
//  ?error=<motivo>  algo no se pudo (cancelado, admin, 2fa, ban...)
//  ?via=foro        lo mismo, con la cuenta del foro (foro.js)
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const q = new URLSearchParams(location.search);
  history.replaceState(null, '', location.pathname); // los codigos no quedan en el historial
  const foro = q.get('via') === 'foro';
  const QUE = foro ? 'el foro' : 'Discord';
  const API = foro ? '/puente/api/foro/' : '/puente/api/entrar/';
  if (foro) document.title = document.title.replace('Discord', 'el foro');
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
    cancelado: ['No se completó', `Cancelaste el inicio de sesión con ${QUE}.`],
    caducado: ['Se venció el paso', `Tardó demasiado. Volvé a tocar "Entrar con ${QUE}".`],
    discord: ['No se pudo', 'Discord no respondió bien. Probá de nuevo en un momento.'],
    foro: ['No se pudo', 'El foro no confirmó tu cuenta. Probá de nuevo en un momento.'],
    admin: ['Entrá con tu contraseña', 'Las cuentas de administrador entran con usuario y contraseña, por seguridad.'],
    '2fa': ['Entrá con tu contraseña', 'Tu cuenta tiene verificación en dos pasos: entrá con usuario, contraseña y el código.'],
    'con-historial': ['Entrá con tu cuenta', 'El historial de ese Discord ya está en una cuenta de __PUENTE_APP__. Entrá con esa cuenta (usuario y contraseña, o el foro) y, si querés, volvé a vincular Discord desde "Mi cuenta".'],
    ban: ['No podés entrar', foro ? 'Esta cuenta está suspendida en el foro o en este servidor.' : 'Esta cuenta está suspendida en este servidor.'],
  };

  if (q.get('listo')) {
    title('Entrando…');
    post('/puente/api/entrar/sesion', { codigo: q.get('listo') }).then(({ ok, d }) => {
      if (ok && d.token) return enter(d);
      title('Se venció el paso', d.error || `Volvé a tocar "Entrar con ${QUE}".`); backToLogin();
    }).catch(() => { title('No hay conexión', 'Probá de nuevo.'); backToLogin(); });
    return;
  }

  // Su nombre esta en el historial de Discord: el aviso y el boton para entrar con Discord
  function avisoDiscord(texto) {
    let box = $('puente-con-discord');
    if (!box) {
      box = document.createElement('div'); box.id = 'puente-con-discord';
      box.style.cssText = 'margin:0 0 16px;padding:14px 16px;border-radius:10px;background:rgba(88,101,242,.14);border:1px solid rgba(88,101,242,.45);font-size:14px;line-height:1.45;text-align:left';
      const p = document.createElement('p'); p.style.margin = '0 0 10px'; box.appendChild(p);
      const b = document.createElement('button'); b.type = 'button'; b.className = 'puente-btn-discord';
      b.style.cssText = 'width:100%;padding:11px;border:0;border-radius:8px;background:#5865f2;color:#fff;font:inherit;font-weight:600;cursor:pointer';
      b.textContent = 'Entrar con Discord';
      b.addEventListener('click', () => {
        b.disabled = true;
        post('/puente/api/entrar/iniciar', {}).then(({ ok, d }) => { if (ok && d.url) location.href = d.url; else { b.disabled = false; note(d.error || 'No se pudo. Probá de nuevo.', true); } })
          .catch(() => { b.disabled = false; note('No hay conexión. Probá de nuevo.', true); });
      });
      box.appendChild(b);
      $('crear').parentNode.insertBefore(box, $('crear'));
    }
    box.querySelector('p').textContent = texto;
  }

  if (q.get('nuevo')) {
    const code = q.get('nuevo');
    title('Crear tu cuenta', '');
    fetch(API + 'nuevo?codigo=' + encodeURIComponent(code)).then(r => r.json().then(d => ({ ok: r.ok, d }))).then(({ ok, d }) => {
      if (!ok) { title('Se venció el paso', d.error || ''); return backToLogin(); }
      title('Crear tu cuenta en ' + d.app, `Con tu cuenta ${foro ? 'del foro' : 'de Discord'}, en un paso.`);
      if (d.avatar) $('avatar').src = d.avatar; else $('avatar').hidden = true;
      $('nombre').textContent = d.nombre;
      $('discord').textContent = foro ? d.cuenta + ' en el foro' : '@' + d.discord;
      if (foro) {
        $('crear').querySelector('.puente-nota-chica').textContent = `Tu foto del foro se usa en ${d.app}, y tu cuenta del foro queda vinculada.`;
        $('unir').hidden = false;
      }
      $('usuario').value = d.usuario;
      $('crear').hidden = false;
      if (foro && d.historial) avisoDiscord(`Tu nombre (${d.cuenta}) está en el historial de Discord de la comunidad. Si sos vos, entrá con Discord: así tus mensajes de Discord quedan asociados al historial de tu cuenta. Después unís el foro desde "Mi cuenta".`);
      $('otras').hidden = foro;
      // Las condiciones: las mismas que muestra Haven al registrarse
      $('terminos').addEventListener('click', (e) => { e.preventDefault(); window.open('/?terminos=1', '_blank', 'noopener'); });
    }).catch(() => { title('No hay conexión', 'Recargá la página.'); backToLogin(); });
    // Con el foro: unirla a una cuenta que ya existe
    $('unir').addEventListener('submit', (e) => {
      e.preventDefault();
      const btn = $('unir').querySelector('button');
      btn.disabled = true; note('');
      post(API + 'unir', { codigo: code, usuario: $('unir-usuario').value.trim(), password: $('unir-pass').value }).then(({ ok, d }) => {
        if (ok && d.token) return enter(d);
        btn.disabled = false; $('unir-pass').value = '';
        note(d.error || 'No se pudieron unir las cuentas.', true);
      }).catch(() => { btn.disabled = false; note('No hay conexión. Probá de nuevo.', true); });
    });
    $('crear').addEventListener('submit', (e) => {
      e.preventDefault();
      const btn = $('crear').querySelector('button');
      btn.disabled = true; note('');
      post(API + 'crear', { codigo: code, usuario: $('usuario').value.trim(), acepto: $('acepto').checked }).then(({ ok, d }) => {
        if (ok && d.token) return enter(d);
        btn.disabled = false;
        if (d.discord) { note(''); avisoDiscord(d.error); return; }
        note(d.error || 'No se pudo crear la cuenta.', true);
      }).catch(() => { btn.disabled = false; note('No hay conexión. Probá de nuevo.', true); });
    });
    return;
  }

  const [t, sub] = ERRORS[q.get('error')] || [`Entrar con ${QUE}`, `Tocá "Entrar con ${QUE}" en la pantalla de inicio.`];
  title(t, sub);
  backToLogin();
})();
