// El muñeco: partes, variantes y colores. Salen de motor.js para que el cliente y el servidor
// validen exactamente lo mismo (motor.validarAvatar).
import M from '../game/motorGlobal.js';

export const PARTS = M.PARTES;
export const VARIANTS = M.VARIANTES;
export const COLORS = M.COLORES;
export const DEFAULT_AVATAR = M.AVATAR_BASE;

export const PART_META = Object.freeze({
  hair: { label: 'Pelo' },
  face: { label: 'Cara' },
  shirt: { label: 'Remera' },
  pants: { label: 'Pantalón' },
  shoes: { label: 'Zapatos' },
});
