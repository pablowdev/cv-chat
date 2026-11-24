// node --test tools/puente/cs16-ronda.test.mjs
// El aviso de ronda va solo a los que tienen el juego en segundo plano.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const avisosPath = require.resolve('./avisos.js');
const llamadas = [];

require.cache[avisosPath] = {
    id: avisosPath,
    filename: avisosPath,
    loaded: true,
    exports: {
        avisarUsuario: (uid, msg) => llamadas.push({ uid, msg }),
    },
};

const { _avisarRonda } = require('./cs16.js');

test('avisa solo a los conectados con el juego en segundo plano', () => {
    llamadas.length = 0;
    _avisarRonda({
        map: 'de_dust2',
        conectados: [
            { uid: 45, nombre: 'MEGA MONO', sinFoco: true },
            { uid: 1, nombre: 'PabloW', sinFoco: false },
            { uid: 'x', nombre: 'sin cuenta', sinFoco: true },
        ],
    });
    assert.deepEqual(llamadas.map((x) => x.uid), [45]);
    assert.match(llamadas[0].msg.title, /ronda nueva/i);
    assert.match(llamadas[0].msg.body, /de_dust2/);
    assert.equal(llamadas[0].msg.url, '/app?juegos=cs16');
});

test('si nadie está en segundo plano, no manda nada', () => {
    llamadas.length = 0;
    _avisarRonda({ map: 'de_dust2', conectados: [{ uid: 45, sinFoco: false }, { uid: 1 }] });
    assert.deepEqual(llamadas, []);
});
