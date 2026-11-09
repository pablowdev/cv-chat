// Arnes minimo para las pruebas del hotel: node puro, sin vitest. Cada archivo se corre con
// `node archivo.js` y termina con "N bien, M mal" (y codigo de salida 1 si algo fallo).
'use strict';
const assert = require('node:assert/strict');

let bien = 0, mal = 0, grupo = '';

function describir(nombre, fn) {
  const antes = grupo;
  grupo = antes ? antes + ' > ' + nombre : nombre;
  fn();
  grupo = antes;
}

function prueba(nombre, fn) {
  try {
    fn();
    bien++;
  } catch (e) {
    mal++;
    console.log('MAL: ' + (grupo ? grupo + ' > ' : '') + nombre);
    console.log('     ' + String(e && e.message || e).split('\n').join('\n     '));
  }
}

function fin() {
  console.log(bien + ' bien, ' + mal + ' mal');
  if (mal) process.exitCode = 1;
}

module.exports = { describir, prueba, fin, assert };
