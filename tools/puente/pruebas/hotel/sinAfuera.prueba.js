// "Sin afuera": el cliente de CV Hotel (web/hotel/) no carga nada de otro sitio ni arrastra nada
// de Habbo/Sulake ni de la vieja PawHotel en Firebase, y no tiene puertas para inyectar HTML.
// Revisa el texto de todos los archivos. Correr: node sinAfuera.prueba.js
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { describir, prueba, fin, assert } = require('./arnes.js');

const RAIZ = path.resolve(__dirname, '../../web/hotel');
function archivos(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...archivos(p)); else out.push(p);
  }
  return out;
}
const todos = archivos(RAIZ);
const texto = (p) => fs.readFileSync(p, 'utf8');
const rel = (p) => path.relative(RAIZ, p).split(path.sep).join('/');
const codigo = todos.filter((p) => /\.(js|html|css)$/.test(p));
const cliente = codigo.filter((p) => !/^(contrato|motor)\.js$/.test(rel(p))); // los compartidos se prueban aparte

// buscar: en todo el texto (comentarios incluidos). buscarCodigo: sin las lineas de comentario.
function buscar(re, lista, sinComentarios) {
  const hallados = [];
  for (const p of lista || codigo) {
    texto(p).split('\n').forEach((l, i) => {
      if (sinComentarios && /^\s*(\/\/|\/?\*)/.test(l)) return;
      if (re.test(l)) hallados.push(rel(p) + ':' + (i + 1) + ': ' + l.trim().slice(0, 100));
    });
  }
  return hallados;
}
const buscarCodigo = (re, lista) => buscar(re, lista, true);

describir('nada de afuera', () => {
  prueba('solo hay archivos de texto propios (sin imagenes bajadas)', () => {
    const raros = todos.filter((p) => !/\.(js|html|css)$/.test(p)).map(rel);
    assert.deepEqual(raros, []);
  });
  prueba('ningun http:// ni https:// en web/hotel', () => assert.deepEqual(buscar(/https?:\/\//i), []));
  prueba('ninguna direccion que empiece con // (protocolo relativo a otro sitio)', () => assert.deepEqual(buscar(/(src|href)\s*=\s*["']\/\//i), []));
  prueba('sin CDNs, Google Fonts, flagcdn, gstatic ni Firebase', () => {
    assert.deepEqual(buscar(/cdnjs|jsdelivr|unpkg|googleapis|gstatic|flagcdn|firebaseio|firebasejs|firebase-app|netlify/i), []);
    assert.deepEqual(buscarCodigo(/firebase|getDatabase|onValue\(|serverTimestamp|onDisconnect/i), []);
  });
  prueba('sin imports que no sean relativos', () => {
    assert.deepEqual(buscar(/^\s*import\s[^'"]*['"](?!\.\.?\/)/, codigo.filter((p) => p.endsWith('.js'))), []);
    assert.deepEqual(buscar(/import\(\s*['"](?!\.\.?\/)/), []);
  });
  prueba('juego.html: todo con prefijo de version y del mismo sitio', () => {
    const h = texto(path.join(RAIZ, 'juego.html'));
    const refs = [...h.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
    assert.ok(refs.length >= 4);
    for (const r of refs) assert.ok(/^v\/__V__\//.test(r), r);
  });
});

describir('nada de Habbo ni de la PawHotel vieja', () => {
  prueba('ningun nombre de Habbo/Sulake ni de sus muebles', () => {
    assert.deepEqual(buscar(/habbo|sulake|holo|plasto|yukka|hc_?sofa|stickies|pixel ?hotel/i), []);
  });
  prueba('ni rastros de la cuenta vieja (pawhotel2000, firebaseio, Infinite Rooms, pawbbo)', () => {
    assert.deepEqual(buscar(/pawhotel2000|infinite rooms|pawbbo|PAWDEBUG/i), []);
  });
  prueba('los muebles que se sacaron no estan: heladera, silla de plastico, DJ, holodice, yukka, sofa HC', () => {
    assert.deepEqual(buscar(/fridge|heladera|chair_a|chair_b|pl[aá]stico|dj_set|['"]dj['"]|holodice|yukka|hcsofa/i), []);
  });
  prueba('sin ingles para la gente: no hay selector de idioma ni en.json', () => {
    assert.deepEqual(todos.filter((p) => /en\.json|i18n/.test(rel(p))).map(rel), []);
    assert.deepEqual(buscar(/data-i18n|setLocale|English/), []);
  });
  prueba('sin login, registro ni contraseña', () => {
    assert.deepEqual(buscarCodigo(/signIn|createUserWith|password|contraseña|login|registrarse/i, cliente), []);
  });
});

describir('sin puertas para inyectar HTML (va con CSP script-src self)', () => {
  prueba('ni innerHTML, outerHTML, insertAdjacentHTML ni document.write', () => {
    assert.deepEqual(buscarCodigo(/innerHTML|outerHTML|insertAdjacentHTML|document\.write/), []);
  });
  prueba('ni eval, new Function ni setTimeout con texto', () => {
    assert.deepEqual(buscar(/\beval\(|new Function|setTimeout\(\s*['"`]|setInterval\(\s*['"`]/), []);
  });
  prueba('juego.html sin scripts en linea ni onclick/onload', () => {
    const h = texto(path.join(RAIZ, 'juego.html'));
    assert.deepEqual([...h.matchAll(/<script(?![^>]*\bsrc=)[^>]*>/g)].map((m) => m[0]), []);
    assert.deepEqual([...h.matchAll(/\son[a-z]+\s*=/gi)].map((m) => m[0]), []);
    assert.ok(!/javascript:/i.test(h));
  });
  prueba('nadie arma estilos con texto de la gente (cssText)', () => {
    assert.deepEqual(buscarCodigo(/cssText/, cliente), []);
  });
});

fin();
