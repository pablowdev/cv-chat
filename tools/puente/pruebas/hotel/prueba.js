// La pagina de prueba hace de ventana de CV Chat: arma el servidor falso, deja el socket en
// window.app.socket (como el chat) y carga /puente/hotel/juego.html en un iframe.
// Con ?demo=... juega sola para sacar capturas:
//   principal   entra a la sala principal con gente que camina y habla
//   mueble      crea una sala, pide muebles, pone un sillón por la pantalla, cuelga un cartel y se sienta
//   bienvenida  primera vez: el creador del muñeco
//   salas       abre el navegador de salas
//   catalogo    abre el catalogo
//   xss         nombres con <img onerror> en salas, gente y charla: no tiene que ejecutar nada
// Otros: ?nuevo=1 (sin muñeco), ?equipo=1, ?bots=0
(function () {
  'use strict';
  const q = new URLSearchParams(location.search);
  const demo = q.get('demo') || '';
  const estado = document.getElementById('estado');
  const decir = (t, mal) => { estado.hidden = false; estado.textContent = t; estado.className = mal ? 'mal' : ''; };
  window.__xss = 0;

  const srv = HotelFalso.crearFalso({ latencia: 20, log: (t) => console.warn(t) });
  const nuevo = q.get('nuevo') === '1' || demo === 'bienvenida';
  const yo = { id: 7, nombre: demo === 'xss' ? 'Pablo<img src=x onerror="top.__xss=1">' : 'PabloW', equipo: q.get('equipo') === '1', admin: false,
    avatar: nuevo ? null : { hairV: 1, hairC: 1, faceV: 1, faceC: 1, shirtV: 0, shirtC: 2, pantsV: 1, pantsC: 3, shoesV: 2, shoesC: 4 }, estado: 'Probando el hotel',
    inventario: demo === 'mueble' ? ['sofa', 'alfombra', 'cartel_cv', 'planta', 'lampara', 'mesa', 'silla', 'ventana', 'parlante', 'separador', 'alfombra_redonda', 'poster'] : ['silla', 'planta'] };
  window.app = { socket: srv.conectar(yo) };
  window.puenteJuegos = {
    atras() { decir('puenteJuegos.atras()'); },
    mensaje(u) { decir('puenteJuegos.mensaje(' + u + ')'); },
    perfil(u) { decir('puenteJuegos.perfil(' + u + ')'); },
  };
  window.HotelSrv = srv;

  const malo = '<img src=x onerror="top.__xss=1">';
  if (q.get('bots') !== '0' && demo !== 'mueble') {
    srv.bot(demo === 'xss' ? 'Rulo' + malo : 'Rulo', { x: 4, y: 5, decir: demo === 'xss' ? 'hola ' + malo : '¡Buenas! ¿Qué onda?', decirEn: 900, cada: 2500, estado: demo === 'xss' ? malo : 'Fan del truco' });
    srv.bot('Mica', { x: 7, y: 6, decir: 'Qué lindo quedó el hotel', decirEn: 1500, cada: 3000 });
    srv.bot('Tano', { x: 9, y: 2, quieto: true, decir: 'Me encanta el sillón', decirEn: 2200 });
  }

  const params = new URLSearchParams({ prueba: '1' });
  if (q.get('sala')) params.set('sala', q.get('sala'));
  const ifr = document.getElementById('hotel');
  // ?celu=375x812: el iframe con medida de celular (Chrome headless no achica la ventana a menos de 500 px)
  const celu = /^([0-9]{3,4})x([0-9]{3,4})$/.exec(q.get('celu') || '');
  if (celu) { ifr.style.width = celu[1] + 'px'; ifr.style.height = celu[2] + 'px'; ifr.style.right = 'auto'; ifr.style.bottom = 'auto'; }
  ifr.src = '/puente/hotel/juego.html?' + params.toString();

  const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
  async function hasta(fn, ms) {
    const t0 = Date.now();
    while (Date.now() - t0 < (ms || 8000)) { try { const v = fn(); if (v) return v; } catch (e) { /* todavia no */ } await esperar(50); }
    throw new Error('no llegó a tiempo');
  }
  const W = () => ifr.contentWindow;
  const P = () => W().cvHotelPrueba;
  const D = () => ifr.contentDocument;

  function tocarPantalla(x, y) { P().tocar(x, y); }
  async function escribir(texto) {
    const inp = D().getElementById('chat');
    inp.value = texto;
    inp.dispatchEvent(new (W().Event)('input', { bubbles: true }));
    D().getElementById('f-chat').dispatchEvent(new (W().Event)('submit', { bubbles: true, cancelable: true }));
    await esperar(150);
  }

  async function correr() {
    if (!demo) return;
    if (demo === 'bienvenida') {
      await hasta(() => D() && !D().getElementById('p-muneco').hidden);
      if (q.get('guardar') === '1') {
        D().getElementById('b-muneco-guardar').click();
        await hasta(() => P() && P().est.sala);
        decir('bienvenida guardada: sala=' + P().est.sala.slug + ' muñeco=' + !!P().est.avatar);
        return;
      }
      decir('bienvenida lista');
      return;
    }
    await hasta(() => P() && P().est.sala);
    const p = P();
    if (demo === 'principal') {
      await esperar(600);
      const t = p.pantallaDe(6, 6); tocarPantalla(t.x, t.y);
      await esperar(500);
      await escribir('¡Hola, gente! Primera vez en CV Hotel');
      await esperar(2600);
      decir('principal lista');
    } else if (demo === 'mueble') {
      const r = await p.api.salaCrear({ nombre: 'El rancho de Pablo', descripcion: 'Pasen y vean', forma: 'small', capacidad: 10, acceso: 'abierta' });
      if (r.error) return decir(r.error, true);
      await W().cvHotel.irA(r.slug);
      await hasta(() => p.est.sala && p.est.sala.slug === r.slug);
      const inv = await p.api.inventario({});
      const de = (c) => inv.grupos.find((g) => g.c === c).ids[0];
      await esperar(700);
      // el sillon se pone por la pantalla, como lo haria la persona
      const fila = (id) => HotelFalso.CATALOGO.find((f) => f.id === id);
      p.empezarColocar({ fila: fila('sofa'), m: de('sofa'), rot: 0, mover: false });
      const t = p.pantallaDe(3, 2); tocarPantalla(t.x, t.y);
      await hasta(() => Object.values(p.est.sala.muebles).some((m) => m.c === 'sofa'));
      // el resto, directo por la api (la misma que usa la pantalla)
      const poner = (c, x, y, rot) => p.api.poner({ m: de(c), x, y, rot: rot || 0 });
      await poner('alfombra', 3, 4); await poner('mesa', 4, 3); await poner('planta', 7, 0); await poner('lampara', 0, 1);
      await poner('silla', 5, 3, 1); await poner('parlante', 7, 6); await poner('separador', 1, 6, 1); await poner('alfombra_redonda', 6, 5);
      await p.api.poner({ m: de('cartel_cv'), pared: 'wall:north:3,0:50,55' });
      await p.api.poner({ m: de('ventana'), pared: 'wall:north:6,0:50,55' });
      // el poster se cuelga por la pantalla: se busca un punto de la pared oeste donde entre
      p.empezarColocar({ fila: fila('poster'), m: de('poster'), rot: 0, mover: false });
      let punto = null;
      for (let y = 0; y < D().documentElement.clientHeight && !punto; y += 4) {
        for (let x = 0; x < D().documentElement.clientWidth / 2 && !punto; x += 4) {
          const h = p.escena.paredEn(p.est.sala, x, y);
          if (h && h.side === 'west' && h.ty === 5 && h.ox >= 40 && h.ox <= 60 && h.oy >= 45 && h.oy <= 65) punto = { x, y };
        }
      }
      if (punto) await p.colocarEn(punto.x, punto.y);
      else await p.api.poner({ m: de('poster'), pared: 'wall:west:0,5:50,55' });
      await p.api.pintar({ tipo: 'piso', patron: 'parquet', color: 'brown' });
      await p.api.pintar({ tipo: 'pared', patron: 'brick', color: 'red' });
      await esperar(300);
      const sofa = Object.values(p.est.sala.muebles).find((m) => m.c === 'sofa');
      const ts = p.pantallaDe(sofa.x + 1, sofa.y);
      tocarPantalla(ts.x, ts.y - 10);
      await esperar(400);
      await esperar(10500); // el cliente no manda mas de 20 eventos cada 10 s: se espera que se libere
      await escribir('Miren mi sala nueva 🛋️');
      await esperar(600);
      const yo2 = p.est.sala.jugadores['7'];
      decir('mueble listo:' + ' sentado=' + !!(yo2 && yo2.sentado) + ' muebles=' + Object.keys(p.est.sala.muebles).length + ' charla=' + D().querySelectorAll('#lista-log li').length + ' poster=' + (Object.values(p.est.sala.muebles).find((m) => m.c === 'poster') || {}).clave);
    } else if (demo === 'afuera') {
      await esperar(600);
      await p.api.ir({ puerta: true });
      await hasta(() => !p.est.sala, 8000);
      await esperar(800);
      decir('afuera listo');
    } else if (demo === 'salas') {
      await esperar(300); p.nav.abrir(); await esperar(800); decir('salas listo');
    } else if (demo === 'catalogo') {
      await esperar(300); p.mochila.abrirCatalogo(); await esperar(500); decir('catalogo listo');
    } else if (demo === 'xss') {
      const r = await p.api.salaCrear({ nombre: 'Sala ' + malo, descripcion: malo, forma: 'small', capacidad: 10, acceso: 'abierta' });
      await esperar(400);
      p.nav.abrir();
      await hasta(() => D().querySelectorAll('#lista-salas li').length > 0);
      D().querySelector('#p-salas [data-ver="gente"]').click();
      await esperar(900);
      p.fichas.pintarGente();
      D().getElementById('p-gente').hidden = false;
      await escribir('che ' + malo);
      await esperar(2500);
      const imgs = D().querySelectorAll('#hotel img').length;
      const textoSala = [...D().querySelectorAll('#lista-salas b')].map((b) => b.textContent).join(' | ');
      const ok = window.__xss === 0 && imgs === 0 && textoSala.indexOf('<img') >= 0 && r.ok;
      decir('XSS ' + (ok ? 'BIEN' : 'MAL') + ': ejecuto=' + window.__xss + ' imgs=' + imgs + ' salas=' + textoSala, !ok);
    }
  }
  correr().catch((e) => decir('demo: ' + e.message, true));
})();
