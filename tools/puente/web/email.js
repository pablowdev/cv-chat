// Cartel "Agregá un email" en /app (email.js del puente), con el aspecto del de
// instalar la app: para quien todavia no tiene un email confirmado, que sirve
// para recuperar la contraseña. Se escribe a mano (llega un mail para
// confirmarlo) o se usa el de la cuenta de Discord. "Ahora no" lo vuelve a
// mostrar a los pocos dias. window.puenteEmail.open() lo abre desde la tarjeta
// de la cuenta, tambien para cambiar el email.
(function () {
  'use strict';
  const SNOOZE_KEY = 'puente_email_luego';
  const SNOOZE_MS = 3 * 24 * 60 * 60 * 1000;
  const store = fn => { try { return fn(localStorage); } catch { return null; } };
  const token = () => store(s => s.getItem('haven_token'));
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text) n.textContent = text; return n; };
  const call = (method, url, body) => fetch(url, {
    method, headers: Object.assign({ Authorization: 'Bearer ' + token() }, body ? { 'Content-Type': 'application/json' } : {}),
    body: body ? JSON.stringify(body) : undefined,
  }).then(r => r.json().catch(() => ({})).then(d => ({ ok: r.ok, d })));

  // El campo y los botones con el aspecto de la app
  function styles() {
    if (document.getElementById('puente-email-css')) return;
    const s = el('style');
    s.id = 'puente-email-css';
    s.textContent = '#puente-email-modal .puente-email-form{display:flex;flex-direction:column;gap:.5rem;width:100%;max-width:22rem;margin:0 auto}' +
      '#puente-email-modal .puente-email-form input{box-sizing:border-box;width:100%;height:2.75rem;padding:0 .875rem;border:1px solid #2e2d32;' +
      'border-radius:.5rem;background:#121214;color:#dbdee1;font:inherit;font-size:1rem;outline:none}' +
      '#puente-email-modal .puente-email-form input:focus{border-color:#5865f2}' +
      '#puente-email-modal .puente-email-form button,#puente-email-modal .puente-email-discord{width:100%;height:2.75rem;margin:0}' +
      '#puente-email-modal .puente-email-discord{display:block;max-width:22rem;margin:0 auto;background:#5865f2;color:#fff;border:0}' +
      '#puente-email-modal .android-beta-promo-actions{margin-top:.75rem}';
    document.head.appendChild(s);
  }

  let overlay = null;
  function close() { if (overlay) { overlay.remove(); overlay = null; } }
  function snooze() { store(s => s.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_MS))); close(); }

  // state: { email, confirmado, discord } ; msg: texto de resultado opcional
  function build(state, msg) {
    close();
    styles();
    overlay = el('div', 'modal-overlay');
    overlay.id = 'puente-email-modal';
    overlay.style.display = 'flex';
    const card = el('div', 'modal android-beta-promo');

    const icon = el('div', 'android-beta-promo-icon', '✉️');
    icon.style.cssText = 'font-size:2.5rem;display:flex;align-items:center;justify-content:center';
    const badge = el('span', 'android-beta-promo-badge', 'TU CUENTA');
    badge.style.background = 'var(--accent-bright,#5865f2)';
    const pending = state.email && !state.confirmado;
    const title = el('h3', 'android-beta-promo-title', state.confirmado ? 'Tu email de recuperación' : pending ? 'Confirmá tu email' : 'Agregá un email');
    const sub = el('p', 'android-beta-promo-subtitle', state.confirmado
      ? 'Tu email confirmado es ' + state.email + '. Si olvidás tu contraseña, te mandamos ahí un enlace para recuperarla.'
      : pending
        ? 'Te mandamos un mail a ' + state.email + '. Tocá el enlace del mail para confirmarlo; fijate también en la carpeta de spam.'
        : 'Si alguna vez perdés tu contraseña, te mandamos un enlace a este email para recuperarla. No se muestra a nadie.');

    const status = el('p', 'puente-email-msg', msg || '');
    status.style.cssText = 'margin:0 0 .75rem;font-size:.875rem;min-height:1.2em;color:var(--text-secondary,#b5bac1)';

    const form = el('form', 'puente-email-form');
    const input = el('input');
    input.type = 'email'; input.required = true; input.maxLength = 200; input.autocomplete = 'email';
    input.placeholder = 'tu@email.com';
    if (pending) input.value = state.email;
    const save = el('button', 'btn btn-accent android-beta-submit', pending ? 'Mandar el mail de nuevo' : state.confirmado ? 'Cambiar el email' : 'Guardar el email');
    save.type = 'submit';
    form.append(input, save);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const value = input.value.trim();
      save.disabled = true; status.textContent = 'Mandando…';
      const same = pending && value.toLowerCase() === String(state.email).toLowerCase();
      (same ? call('POST', '/puente/api/email/reenviar') : call('POST', '/puente/api/email/guardar', { email: value })).then(({ ok, d }) => {
        save.disabled = false;
        if (!ok) { status.textContent = d.error || 'No se pudo. Probá de nuevo en un rato.'; return; }
        if (d.confirmado) { build({ email: value, confirmado: true, discord: state.discord }, '¡Listo!'); return; }
        build({ email: value, confirmado: false, discord: state.discord }, '¡Mail enviado! Revisá tu bandeja de entrada.');
      }).catch(() => { save.disabled = false; status.textContent = 'No hay conexión. Probá de nuevo.'; });
    });

    const parts = [icon, badge, title, sub, status, form];
    if (state.discord && !state.confirmado) {
      const or = el('div', '', 'o');
      or.style.cssText = 'margin:.75rem 0;font-size:.8125rem;color:var(--text-muted,#80848e)';
      const dc = el('button', 'btn puente-email-discord', 'Usar el email de mi Discord');
      dc.type = 'button';
      dc.addEventListener('click', () => {
        dc.disabled = true;
        call('POST', '/puente/api/email/discord').then(({ ok, d }) => {
          if (ok && d.url) { location.href = d.url; return; }
          dc.disabled = false; status.textContent = d.error || 'No se pudo. Probá de nuevo.';
        }).catch(() => { dc.disabled = false; status.textContent = 'No hay conexión. Probá de nuevo.'; });
      });
      parts.push(or, dc);
    }

    const actions = el('div', 'android-beta-promo-actions');
    const later = el('button', 'btn android-beta-promo-later', state.confirmado ? 'Cerrar' : 'Ahora no');
    later.type = 'button';
    later.addEventListener('click', () => (state.confirmado ? close() : snooze()));
    actions.appendChild(later);
    parts.push(actions);

    card.append(...parts);
    overlay.appendChild(card);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) (state.confirmado ? close() : snooze()); });
    document.body.appendChild(overlay);
    if (!state.confirmado && !pending) setTimeout(() => input.focus(), 50);
  }

  function open(msg) {
    if (!token()) return;
    call('GET', '/puente/api/email/estado').then(({ ok, d }) => { if (ok) build(d, msg); }).catch(() => {});
  }
  window.puenteEmail = { open: () => open() };

  // Vuelta de Discord con el boton "Usar el email de mi Discord"
  const RESULTS = {
    ok: '¡Listo! Guardamos el email de tu cuenta de Discord.',
    'sin-email': 'Tu cuenta de Discord no tiene un email confirmado. Escribí uno acá.',
    'email-ocupado': 'El email de tu Discord ya está en uso en otra cuenta. Escribí otro.',
  };
  function fromUrl() {
    const q = new URLSearchParams(location.search);
    const r = q.get('puente_email');
    if (!r) return null;
    q.delete('puente_email');
    const rest = q.toString();
    history.replaceState(history.state, '', location.pathname + (rest ? '?' + rest : '') + location.hash);
    return RESULTS[r] || 'No se pudo usar el email de Discord. Probá de nuevo.';
  }

  function maybeShow() {
    if (overlay) return;
    // No encima de otro cartel (el de instalar la app, los de Haven)
    const busy = [...document.querySelectorAll('.modal-overlay')].some(m => m.id !== 'puente-email-modal' && getComputedStyle(m).display !== 'none');
    if (busy) { setTimeout(maybeShow, 5000); return; }
    call('GET', '/puente/api/email/estado').then(({ ok, d }) => {
      if (!ok || d.confirmado) return;
      build(d);
    }).catch(() => {});
  }

  function start() {
    const msg = fromUrl();
    let tries = 0;
    (function wait() {
      if (!token()) { if (++tries < 120) setTimeout(wait, 5000); return; }
      if (msg) { setTimeout(() => open(msg), 1500); return; }
      const until = parseInt(store(s => s.getItem(SNOOZE_KEY)) || '0', 10);
      if (until > Date.now()) return;
      setTimeout(maybeShow, 6000);
    })();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
