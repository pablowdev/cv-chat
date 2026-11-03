// La pagina de los juegos (juegos.html, en su propio dominio: juegos.<dominio>, Caddy la manda a /puente/juegos).
// Los juegos ya vienen en la pagina, como enlaces al chat (/app?juegos=<juego>): con sesion se juega directo;
// sin sesion afuera.js lleva a elegir el nombre de invitado (login.js). Aca se suman las mesas que esperan
// rival (portada.js), que llevan a esa mesa
(function () {
  'use strict';
  const chat = (document.querySelector('meta[name="chat"]') || {}).content || '';
  const box = document.getElementById('mesas');
  const mk = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  fetch('/puente/api/portada').then(r => (r.ok ? r.json() : null)).then(d => {
    const l = (d && d.abiertas) || [];
    if (!l.length || !box) return;
    box.appendChild(mk('h2', '', 'Te están esperando para jugar'));
    const ul = mk('ul', 'puente-mesas');
    for (const m of l) {
      if (!/^\/app\?[a-z]+=[\w-]+$/.test(m.enlace || '')) continue;
      const li = mk('li', 'puente-mesa');
      const t = mk('div', 'puente-mesa-txt'); t.append(mk('b', '', m.nombre + (m.detalle ? ' ' + m.detalle : '')), mk('span', '', m.quien + ' busca rival'));
      const a = mk('a', 'puente-sala-btn', 'Jugar'); a.href = chat + m.enlace;
      li.append(t, a);
      ul.appendChild(li);
    }
    if (ul.children.length) box.appendChild(ul); else box.textContent = '';
  }).catch(() => {});
})();
