// Arnes para las pruebas del cliente del hotel que necesitan esperar (promesas, relojes): como
// arnes.js pero cada prueba puede ser async y corren en orden al llamar fin(). Trae tambien un
// describe/it/expect minimo para portar las pruebas de PawHotel (que eran de vitest) sin tocarlas.
'use strict';
const assert = require('node:assert/strict');

const cola = [];
const grupos = [];

function describir(nombre, fn) { grupos.push(nombre); try { fn(); } finally { grupos.pop(); } }
function prueba(nombre, fn) { cola.push({ nombre: grupos.concat(nombre).join(' > '), fn }); }

async function fin() {
  let bien = 0, mal = 0;
  for (const t of cola) {
    try { await t.fn(); bien++; } catch (e) {
      mal++;
      console.log('MAL: ' + t.nombre);
      console.log('     ' + String(e && e.message || e).split('\n').join('\n     '));
    }
  }
  console.log(bien + ' bien, ' + mal + ' mal');
  if (mal) process.exitCode = 1;
}

// ── expect al estilo vitest (solo lo que usan las pruebas portadas) ──
function expect(v) {
  const ok = (cond, msg) => { if (!cond) throw new assert.AssertionError({ message: msg }); };
  const show = (x) => { try { return JSON.stringify(x); } catch (e) { return String(x); } };
  function igualdad(a, b) { try { assert.deepStrictEqual(a, b); return true; } catch (e) { return false; } }
  const m = (neg) => ({
    toBe: (x) => ok(Object.is(v, x) !== neg, 'esperaba ' + (neg ? 'distinto de ' : '') + show(x) + ' y vino ' + show(v)),
    toEqual: (x) => ok(igualdad(v, x) !== neg, 'esperaba ' + (neg ? 'distinto de ' : '') + show(x) + ' y vino ' + show(v)),
    toStrictEqual: (x) => ok(igualdad(v, x) !== neg, 'esperaba ' + show(x) + ' y vino ' + show(v)),
    toBeNull: () => ok((v === null) !== neg, 'esperaba ' + (neg ? 'algo' : 'null') + ' y vino ' + show(v)),
    toBeUndefined: () => ok((v === undefined) !== neg, 'esperaba undefined y vino ' + show(v)),
    toBeDefined: () => ok((v !== undefined) !== neg, 'esperaba algo definido'),
    toBeTruthy: () => ok(!!v !== neg, 'esperaba verdadero y vino ' + show(v)),
    toBeFalsy: () => ok(!v !== neg, 'esperaba falso y vino ' + show(v)),
    toBeGreaterThan: (x) => ok((v > x) !== neg, 'esperaba mas de ' + x + ' y vino ' + show(v)),
    toBeLessThan: (x) => ok((v < x) !== neg, 'esperaba menos de ' + x + ' y vino ' + show(v)),
    toBeGreaterThanOrEqual: (x) => ok((v >= x) !== neg, 'esperaba ' + x + ' o mas y vino ' + show(v)),
    toBeLessThanOrEqual: (x) => ok((v <= x) !== neg, 'esperaba ' + x + ' o menos y vino ' + show(v)),
    toContain: (x) => ok((typeof v === 'string' ? v.indexOf(x) >= 0 : Array.prototype.some.call(v, (y) => Object.is(y, x))) !== neg, show(v) + (neg ? ' no tenia que tener ' : ' tenia que tener ') + show(x)),
    toHaveLength: (n) => ok((v && v.length === n) !== neg, 'esperaba largo ' + n + ' y vino ' + (v && v.length)),
    toMatch: (re) => ok((typeof re === 'string' ? String(v).indexOf(re) >= 0 : re.test(String(v))) !== neg, show(v) + ' no coincide con ' + re),
    toThrow: () => { let tiro = false; try { v(); } catch (e) { tiro = true; } ok(tiro !== neg, neg ? 'no tenia que tirar error' : 'tenia que tirar error'); },
  });
  const r = m(false);
  r.not = m(true);
  return r;
}

module.exports = { describir, prueba, fin, assert, describe: describir, it: prueba, expect };
