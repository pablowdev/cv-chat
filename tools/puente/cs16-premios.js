// Premios semanales del ranking de kills de CS 1.6.
// Los usa monedas-fuentes.js para pagar y cs16.js para mostrarlos en la página
// de entrada. Si se cambian los montos, el pago y la vista quedan sincronizados.
module.exports = {
  premios: [150, 100, 50], // 1°, 2° y 3° de la semana
  minimo: 10,             // kills mínimas del 1° para que se pague
  participantes: 3,       // cuentas registradas con kills para que se pague
};
