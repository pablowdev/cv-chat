// Prueba el motor de GlobalSiege: juega partidas enteras entre compus y revisa que no se
// rompa nada (cada pais con dueño vivo y al menos una tropa, tropas que no aparecen ni
// desaparecen de la nada, cartas en orden y que la guerra termine).
//   node probar-motor.js [partidas]
'use strict';
const M = require('../puente/misionrisk-motor.js');

let semilla = 12345;
const rng = (n) => { semilla = (semilla * 1103515245 + 12345) % 2147483648; return Math.floor(semilla / 2147483648 * n); };
const partidas = Number(process.argv[2]) || 300;
const res = { ganadas: {}, motivos: {}, rondas: [], jugadas: [], errores: 0, sinTerminar: 0 };

function revisar(S, donde) {
  let tropas = 0;
  for (let p = 1; p <= 42; p++) {
    const d = S.dueno[p];
    if (!(d >= 1 && d <= S.n) || !S.ej[d].vivo) throw new Error(`${donde}: ${p} sin dueño vivo`);
    if (S.tropas[p] < 1 && !(S.ataque)) throw new Error(`${donde}: ${p} con ${S.tropas[p]} tropas`);
    tropas += S.tropas[p];
  }
  for (let e = 1; e <= S.n; e++) if (S.ej[e].cartas.length > (S.opciones.buitre ? 12 : 5) && S.fase !== 'canje') throw new Error(`${donde}: ${e} con ${S.ej[e].cartas.length} cartas`);
  const enMano = S.ej.slice(1).filter(Boolean).reduce((t, x) => t + x.cartas.length, 0);
  if (enMano + S.mazo.reduce((a, b) => a + b, 0) > 44) throw new Error(`${donde}: sobran cartas`);
  return tropas + (S.ataque ? S.ataque.juntadas : 0);
}

for (let g = 0; g < partidas; g++) {
  const n = 2 + (g % 5);
  const niveles = Array.from({ length: n + 1 }, (_, i) => 1 + ((i + g) % 2));
  const S = M.nueva(Array.from({ length: n }, (_, i) => ({ nombre: 'Compu ' + (i + 1) })), { misiones: g % 3 !== 0, buitre: g % 4 === 0 }, rng);
  let pasos = 0;
  while (!S.ganador && pasos < 200000) {
    const e = S.turno;
    const antes = revisar(S, `partida ${g} paso ${pasos}`);
    const faseAntes = S.fase, ponerAntes = S.poner;
    const a = M.compuAccion(S, e, niveles[e], rng);
    const err = M.aplicar(S, e, a, rng);
    if (err) {
      res.errores++;
      if (res.errores < 6) console.log('error de la compu:', err, JSON.stringify(a), 'fase', faseAntes);
      M.aplicar(S, e, { tipo: S.fase === 'poner' ? 'poner' : 'terminar', pais: S.dueno.indexOf(e), n: 99 }, rng);
    }
    const despues = revisar(S, `partida ${g} paso ${pasos} (${a.tipo})`);
    // Las tropas solo cambian al poner (suben lo que se puso) y al tirar los dados (bajan)
    if (a.tipo === 'poner' && !err && despues - antes !== ponerAntes - S.poner) throw new Error(`poner no cuadra en partida ${g}`);
    if (!['poner', 'tirar', 'canjear'].includes(a.tipo) && despues !== antes && !err) throw new Error(`${a.tipo} cambió las tropas (${antes} -> ${despues}) en partida ${g}`);
    pasos++;
  }
  if (!S.ganador) { res.sinTerminar++; continue; }
  res.ganadas[`${n} ejércitos, nivel ${niveles[S.ganador.ej]}`] = (res.ganadas[`${n} ejércitos, nivel ${niveles[S.ganador.ej]}`] || 0) + 1;
  const motivo = S.ganador.texto.replace(/(al|y) .*/, '$1 ...');
  res.motivos[motivo] = (res.motivos[motivo] || 0) + 1;
  res.rondas.push(S.ronda); res.jugadas.push(pasos);
}
const prom = (l) => l.length ? Math.round(l.reduce((a, b) => a + b, 0) / l.length) : 0;
console.log(`${partidas} partidas: ${res.sinTerminar} sin terminar, ${res.errores} jugadas rechazadas`);
console.log('rondas promedio', prom(res.rondas), 'máximo', Math.max(...res.rondas), '· jugadas promedio', prom(res.jugadas));
console.log('motivos', res.motivos);
console.log('ganadores', res.ganadas);
