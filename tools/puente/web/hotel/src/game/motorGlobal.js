// El motor compartido con el servidor (web/hotel/motor.js, UMD). juego.html lo carga como script
// comun antes que los modulos, asi que aca ya esta en window.HotelMotor. Los envoltorios de este
// directorio (pathfinding, rooms, furnitureGeometry, wallPlacement, directionHelpers) lo reexportan
// con los nombres de siempre para que el resto del cliente no cambie.
const M = (typeof window !== 'undefined' && window.HotelMotor) || globalThis.HotelMotor;
if (!M) throw new Error('Falta motor.js (window.HotelMotor).');
export default M;
