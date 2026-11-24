// node --test tools/puente/cs16-premios.test.mjs
// El reparto del podio semanal de CS 1.6: 150/100/50, empates y mínimos.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { _repartirCS16 } = require('./monedas-fuentes.js');

const filas = (lista) => lista.map((p) => [p.nombre, p.puesto, p.monedas]);

test('paga 150/100/50 cuando hay tres jugadores y el primero llega a 10 kills', () => {
    assert.deepEqual(filas(_repartirCS16([
        { uid: 1, nombre: 'Uno', kills: 20 },
        { uid: 2, nombre: 'Dos', kills: 15 },
        { uid: 3, nombre: 'Tres', kills: 8 },
        { uid: 4, nombre: 'Cuatro', kills: 7 },
    ])), [['Uno', 1, 150], ['Dos', 2, 100], ['Tres', 3, 50]]);
});

test('no paga si hay menos de tres cuentas con kills o el primero no llega a 10', () => {
    assert.deepEqual(_repartirCS16([
        { uid: 1, nombre: 'Uno', kills: 20 },
        { uid: 2, nombre: 'Dos', kills: 15 },
    ]), []);
    assert.deepEqual(_repartirCS16([
        { uid: 1, nombre: 'Uno', kills: 9 },
        { uid: 2, nombre: 'Dos', kills: 8 },
        { uid: 3, nombre: 'Tres', kills: 7 },
    ]), []);
});

test('los empates se reparten la suma de los puestos que ocupan', () => {
    // Dos primeros: (150 + 100) / 2 = 125 cada uno; el tercero cobra 50.
    assert.deepEqual(filas(_repartirCS16([
        { uid: 1, nombre: 'Uno', kills: 20 },
        { uid: 2, nombre: 'Dos', kills: 20 },
        { uid: 3, nombre: 'Tres', kills: 8 },
    ])), [['Dos', 1, 125], ['Uno', 1, 125], ['Tres', 3, 50]]);

    // Tres primeros: (150 + 100 + 50) / 3 = 100 cada uno.
    assert.deepEqual(filas(_repartirCS16([
        { uid: 1, nombre: 'Uno', kills: 20 },
        { uid: 2, nombre: 'Dos', kills: 20 },
        { uid: 3, nombre: 'Tres', kills: 20 },
    ])), [['Dos', 1, 100], ['Tres', 1, 100], ['Uno', 1, 100]]);

    // Segundo y tercero: (100 + 50) / 2 = 75 cada uno.
    assert.deepEqual(filas(_repartirCS16([
        { uid: 1, nombre: 'Uno', kills: 20 },
        { uid: 2, nombre: 'Dos', kills: 15 },
        { uid: 3, nombre: 'Tres', kills: 15 },
    ])), [['Uno', 1, 150], ['Dos', 2, 75], ['Tres', 2, 75]]);
});

test('ignora cuentas inválidas y reparte entre todos los empatados del podio', () => {
    assert.deepEqual(filas(_repartirCS16([
        { uid: 0, nombre: 'Sin cuenta', kills: 50 },
        { uid: 1, nombre: 'Uno', kills: 20 },
        { uid: 2, nombre: 'Dos', kills: 15 },
        { uid: 3, nombre: 'Tres', kills: 15 },
        { uid: 4, nombre: 'Cuatro', kills: 15 },
    ])), [['Uno', 1, 150], ['Cuatro', 2, 50], ['Dos', 2, 50], ['Tres', 2, 50]]);
});
