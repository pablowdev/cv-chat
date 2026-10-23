// Si el Node.js de Haven todavia tiene la falla de Brotli (CVE-2026-111497): corregida en 22.23.4,
// 24.22.1 y 26.12.1. Ante la duda (una version que no se entiende), si hace falta.
module.exports = function haceFalta(version = process.versions.node) {
  const [may, men, par] = String(version).split('.').map(n => parseInt(n, 10));
  if (![may, men, par].every(Number.isFinite)) return true;
  const arreglada = { 22: [23, 4], 24: [22, 1], 26: [12, 1] }[may];
  if (!arreglada) return may < 26; // las ramas viejas o sin soporte (20, 23, 25) no tienen arreglo
  return men < arreglada[0] || (men === arreglada[0] && par < arreglada[1]);
};
