// Envoltorio: los caminos salen de motor.js (el mismo BFS que usa el servidor).
import M from './motorGlobal.js';
export const createIsBlocked = M.createIsBlocked;
export const bfsPath = M.bfsPath;
export const camino = M.camino;
export const caminoAlAsiento = M.caminoAlAsiento;
export const codificarCamino = M.codificarCamino;
export const decodificarCamino = M.decodificarCamino;
export const posicionEnCamino = M.posicionEnCamino;
export const MS_POR_PASO = M.MS_POR_PASO;
