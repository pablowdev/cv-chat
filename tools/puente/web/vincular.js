(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  let token = null;
  try { token = localStorage.getItem('haven_token'); } catch { /* sin almacenamiento */ }

  const ERRORES = {
    cancelado: 'Cancelaste la vinculación en Discord.',
    caducado: 'El enlace caducó. Volvé a intentarlo.',
    discord: 'Discord no confirmó tu cuenta. Volvé a intentarlo.',
    ocupada: 'Esa cuenta de Discord ya está vinculada a otra cuenta de Haven. Si es tuya, desvinculala primero desde esa cuenta.',
    'sin-vinculo': 'Esa cuenta de Discord no está vinculada a ninguna cuenta de Haven, así que no se puede recuperar por acá. Pedile ayuda a un administrador.',
    'recuperar-admin': 'Las cuentas de administrador no se pueden recuperar con Discord, por seguridad. Usá un código de recuperación.',
    'recuperar-2fa': 'Tu cuenta tiene la verificación en dos pasos activada, así que no se puede recuperar con Discord. Usá un código de recuperación o pedile ayuda a un administrador.',
  };

  function show(id) {
    ['cargando', 'sin-sesion', 'no-disponible', 'sin-vincular', 'vinculada', 'recuperar', 'recuperado'].forEach(s => { $(s).hidden = s !== id; });
  }
  function message(text, isError) {
    const el = $('mensaje');
    el.textContent = text;
    el.className = 'mensaje' + (isError ? ' error' : '');
    el.hidden = !text;
  }
  async function call(method, url) {
    const res = await fetch(url, { method, headers: { Authorization: 'Bearer ' + token } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || 'Error'), { status: res.status });
    return data;
  }

  const params = new URLSearchParams(location.search);
  if (params.get('ok')) {
    const n = Number(params.get('mensajes') || 0);
    message(n > 0 ? `¡Listo! Tu cuenta quedó vinculada y ${n.toLocaleString('es')} mensajes de tu historial de Discord pasaron a tu cuenta.` : '¡Listo! Tu cuenta quedó vinculada.');
  } else if (params.get('error')) {
    message(ERRORES[params.get('error')] || 'Algo salió mal. Volvé a intentarlo.', true);
  }
  const recoveryToken = params.get('recuperar');
  if (params.toString()) history.replaceState(null, '', location.pathname);

  async function load() {
    if (recoveryToken) return loadRecovery();
    if (!token) return show('sin-sesion');
    let st;
    try { st = await call('GET', '/puente/api/estado'); }
    catch (err) { return show(err.status === 401 ? 'sin-sesion' : 'no-disponible'); }
    $('haven-nombre').textContent = st.haven;
    $('haven-nombre-2').textContent = st.haven;
    if (st.vinculado) {
      $('discord-nombre').textContent = st.discord.nombre;
      $('discord-usuario').textContent = '@' + st.discord.usuario;
      if (st.discord.avatar) $('discord-avatar').src = st.discord.avatar; else $('discord-avatar').removeAttribute('src');
      return show('vinculada');
    }
    show(st.disponible ? 'sin-vincular' : 'no-disponible');
  }

  $('btn-vincular').addEventListener('click', async e => {
    e.target.disabled = true;
    try { location.href = (await call('POST', '/puente/api/iniciar')).url; }
    catch (err) { message(err.message, true); e.target.disabled = false; }
  });
  $('btn-desvincular').addEventListener('click', async e => {
    if (!confirm('¿Desvincular tu cuenta de Discord? Tu historial de Discord volverá a quedar como importado.')) return;
    e.target.disabled = true;
    try { await call('POST', '/puente/api/desvincular'); message('Cuenta desvinculada.'); await load(); }
    catch (err) { message(err.message, true); }
    e.target.disabled = false;
  });

  async function loadRecovery() {
    const res = await fetch('/puente/api/recuperar/estado?token=' + encodeURIComponent(recoveryToken));
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { message(data.error || 'El enlace caducó.', true); return show('sin-sesion'); }
    $('recuperar-usuario').textContent = data.usuario;
    show('recuperar');
  }

  $('btn-recuperar').addEventListener('click', async e => {
    e.target.disabled = true;
    try {
      const res = await fetch('/puente/api/recuperar/iniciar', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Error');
      location.href = data.url;
    } catch (err) { message(err.message, true); e.target.disabled = false; }
  });

  $('form-recuperar').addEventListener('submit', async e => {
    e.preventDefault();
    const p1 = $('pass1').value, p2 = $('pass2').value;
    if (p1 !== p2) return message('Las dos contraseñas no coinciden.', true);
    if (p1.length < 8) return message('La contraseña tiene que tener al menos 8 caracteres.', true);
    const btn = e.target.querySelector('button'); btn.disabled = true;
    try {
      const res = await fetch('/puente/api/recuperar/confirmar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: recoveryToken, password: p1 }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Error');
      try { localStorage.removeItem('haven_token'); } catch { /* */ }
      $('recuperado-usuario').textContent = data.usuario;
      message('');
      show('recuperado');
    } catch (err) { message(err.message, true); btn.disabled = false; }
  });

  load();
})();
