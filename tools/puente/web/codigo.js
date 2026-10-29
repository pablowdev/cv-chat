// El codigo por email al entrar desde un dispositivo nuevo (dospasos.js). Cuando el servidor contesta
// { puenteCodigo, ticket } en vez de la sesion, se pide el codigo aca, y la pagina (el inicio de sesion
// de Haven, o entrar con Discord o el foro) recibe la sesion como siempre: no se entera del paso.
(function () {
  'use strict';
  if (window.__puenteCodigo) return;
  window.__puenteCodigo = true;
  const RUTAS = /\/api\/auth\/(login|totp\/validate)(\?|$)|\/puente\/api\/entrar\/sesion(\?|$)/;
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const st = el('style');
  st.textContent = '#puente-codigo{position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(0,0,0,.65);font:15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}'
    + '#puente-codigo .pc{width:100%;max-width:400px;padding:26px 24px 22px;border-radius:14px;background:#2b2d31;color:#dbdee1;box-shadow:0 16px 48px rgba(0,0,0,.5);text-align:center}'
    + '#puente-codigo h2{margin:0 0 8px;color:#f2f3f5;font-size:20px}#puente-codigo p{margin:0 0 14px;color:#b5bac1;font-size:14px}'
    + '#puente-codigo input{box-sizing:border-box;width:100%;margin:0 0 12px;padding:12px 14px;border:0;border-radius:8px;background:#1e1f22;color:#f2f3f5;font:inherit;font-size:18px;text-align:center;letter-spacing:.2em}'
    + '#puente-codigo input[type=email]{letter-spacing:normal;font-size:15px}'
    + '#puente-codigo button{width:100%;padding:12px;border:0;border-radius:8px;background:#5865f2;color:#fff;font:inherit;font-weight:600;cursor:pointer}#puente-codigo button:disabled{opacity:.6}'
    + '#puente-codigo .pc-sec{margin-top:10px;background:none;color:#949cf7;font-weight:400;font-size:13px;padding:4px}'
    + '#puente-codigo .pc-error{min-height:18px;margin:-4px 0 10px;color:#f23f43;font-size:13px}';
  document.head.appendChild(st);

  const post = (p, body) => origFetch('/puente/api/auth/codigo' + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body) })
    .then(r => r.json().then(d => ({ ok: r.ok, d }))).catch(() => ({ ok: false, d: { error: 'No hay conexión. Probá de nuevo.' } }));

  // Muestra el paso y resuelve con la sesion (o null si se cierra)
  function pedirCodigo(paso) {
    return new Promise((resolve) => {
      const viejo = document.getElementById('puente-codigo'); if (viejo) viejo.remove();
      const o = el('div'); o.id = 'puente-codigo';
      const box = el('div', 'pc'); o.appendChild(box); document.body.appendChild(o);
      const error = (t) => { box.querySelector('.pc-error').textContent = t || ''; };
      const cancelar = el('button', 'pc-sec', 'Cancelar'); cancelar.type = 'button';
      cancelar.addEventListener('click', () => { o.remove(); resolve(null); });
      function codigo(email) {
        box.textContent = '';
        box.append(el('h2', null, 'Revisá tu email'),
          el('p', null, `Por seguridad, la primera vez que entrás desde este dispositivo te pedimos un código. Te lo mandamos a ${email || 'tu email'}${paso.noSalio ? ' (si no llega, tocá "Mandar otro")' : ''}.`));
        const i = el('input'); i.inputMode = 'numeric'; i.autocomplete = 'one-time-code'; i.maxLength = 7; i.placeholder = '000000';
        const b = el('button', null, 'Entrar'); b.type = 'button';
        const otro = el('button', 'pc-sec', 'Mandar otro código'); otro.type = 'button';
        box.append(i, el('div', 'pc-error'), b, otro, cancelar);
        setTimeout(() => i.focus(), 50);
        const ir = async () => {
          const c = i.value.replace(/\D/g, '');
          if (c.length !== 6) return error('El código tiene 6 números.');
          b.disabled = true; error('');
          const r = await post('', { ticket: paso.ticket, codigo: c });
          b.disabled = false;
          if (!r.ok) { error(r.d.error || 'No se pudo.'); if (/Se venció|Demasiados/.test(r.d.error || '')) b.disabled = true; return; }
          o.remove(); resolve(r.d);
        };
        b.addEventListener('click', ir);
        i.addEventListener('keydown', (e) => { if (e.key === 'Enter') ir(); });
        i.addEventListener('input', () => { if (i.value.replace(/\D/g, '').length === 6) ir(); });
        otro.addEventListener('click', async () => {
          otro.disabled = true;
          const r = await post('/reenviar', { ticket: paso.ticket });
          error(r.ok ? '' : r.d.error); if (r.ok) otro.textContent = 'Listo: te mandamos otro';
          setTimeout(() => { otro.disabled = false; }, 20000);
        });
      }
      function sinEmail() {
        box.textContent = '';
        box.append(el('h2', null, 'Poné tu email'),
          el('p', null, 'Para entrar desde un dispositivo nuevo te mandamos un código por email. Tu cuenta todavía no tiene uno: ponelo y te mandamos el código ahí.'));
        const i = el('input'); i.type = 'email'; i.autocomplete = 'email'; i.placeholder = 'tu@email.com';
        const b = el('button', null, 'Mandarme el código'); b.type = 'button';
        box.append(i, el('div', 'pc-error'), b, cancelar);
        setTimeout(() => i.focus(), 50);
        const ir = async () => {
          b.disabled = true; error('');
          const r = await post('/email', { ticket: paso.ticket, email: i.value });
          b.disabled = false;
          if (!r.ok) return error(r.d.error || 'No se pudo.');
          codigo(r.d.email);
        };
        b.addEventListener('click', ir);
        i.addEventListener('keydown', (e) => { if (e.key === 'Enter') ir(); });
      }
      if (paso.sinEmail) sinEmail(); else codigo(paso.email);
    });
  }

  const origFetch = window.fetch.bind(window);
  window.fetch = async function (input, init) {
    const r = await origFetch(input, init);
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    if (!RUTAS.test(url) || !r.ok) return r;
    let d;
    try { d = await r.clone().json(); } catch { return r; }
    if (!d || !d.puenteCodigo || !d.ticket) return r;
    const final = await pedirCodigo(d);
    if (!final) return new Response(JSON.stringify({ error: 'Cancelaste el código.' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    return new Response(JSON.stringify(final), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
})();
