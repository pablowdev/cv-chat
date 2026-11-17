// La pagina de los juegos (juegos.html, en su propio dominio: juegos.<dominio>, Caddy la manda a /puente/juegos).
// Los juegos ya vienen en la pagina, como enlaces al chat (/app?juegos=<juego>): con sesion se juega directo;
// sin sesion afuera.js lleva a elegir el nombre de invitado (login.js). Aca se suma lo que pasa ahora (portada.js):
// en cada juego, cuantas partidas se estan jugando y cuantas mesas esperan rival (en Capa 2, cuanta gente hay en la
// ciudad), y abajo las mesas que esperan rival, que llevan a esa mesa. Se actualiza cada minuto mientras se ve.
(function () {
  'use strict';
  const chat = (document.querySelector('meta[name="chat"]') || {}).content || '';
  const box = document.getElementById('mesas');
  const mk = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const plural = (n, uno, varios) => n + ' ' + (n === 1 ? uno : varios);
  // Lo que pasa en cada juego, en su tarjeta (si no pasa nada, queda solo su descripcion)
  function vivos(por) {
    for (const a of document.querySelectorAll('.puente-sala-juego[data-juego]')) {
      const v = a.querySelector('.puente-sala-vivo');
      if (!v) continue;
      const d = por[a.dataset.juego] || {}, bits = [];
      if (d.ciudad > 0) bits.push(plural(d.ciudad, 'persona en la ciudad', 'personas en la ciudad'));
      if (d.jugando > 0) bits.push(plural(d.jugando, 'partida ahora', 'partidas ahora'));
      if (d.esperando > 0) bits.push(plural(d.esperando, 'mesa esperando', 'mesas esperando'));
      v.textContent = bits.join(' · ');
      v.hidden = !bits.length;
    }
  }
  function mesas(l) {
    if (!box) return;
    box.textContent = '';
    if (!l.length) return;
    const ul = mk('ul', 'puente-mesas');
    for (const m of l) {
      if (!/^\/app\?[a-z]+=[\w-]+$/.test(m.enlace || '')) continue;
      const li = mk('li', 'puente-mesa');
      const t = mk('div', 'puente-mesa-txt'); t.append(mk('b', '', m.nombre + (m.detalle ? ' ' + m.detalle : '')), mk('span', '', m.quien + ' busca rival'));
      const a = mk('a', 'puente-sala-btn', 'Jugar'); a.href = chat + m.enlace;
      li.append(t, a);
      ul.appendChild(li);
    }
    if (!ul.children.length) return;
    box.append(mk('h2', '', 'Te están esperando para jugar'), ul);
  }
  let ultimo = 0;
  function pedir() {
    ultimo = Date.now();
    fetch('/puente/api/portada').then(r => (r.ok ? r.json() : null)).then(d => {
      if (!d) return;
      vivos(d.porJuego || {});
      mesas(d.abiertas || []);
    }).catch(() => {});
  }
  pedir();
  setInterval(() => { if (document.visibilityState === 'visible' && Date.now() - ultimo > 55e3) pedir(); }, 15e3);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && Date.now() - ultimo > 30e3) pedir(); });
})();
