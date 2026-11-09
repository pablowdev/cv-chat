// Poses del muñeco sentado: datos, editables desde el admin (fase 2).
//
// Cada pose (0..3) es una lista ordenada de "parts" (rectángulos pixel-art).
// El orden importa: cada part se dibuja sobre los anteriores (z-order).
// Coordenadas relativas al ancla de los pies (ox, oy) del avatar.
//
//   part = { id, name?, x, y, w, h, color }
//
// `color` es un alias resuelto en runtime contra los colores del avatar
// (camisa, pantalón, etc.) — ver COLOR_REFS / resolveColor.
//
// Lookup:
//   override de la silla (<id del mueble>.seatPoses.poseN)
//     → default global (_avatarSeatPoses.poseN)
//       → DEFAULT_SEAT_POSES (este archivo, fallback hardcoded)
//
// La pose data incluye `headBottomY`: y (relativa a oy) donde termina el cuello
// — el caller posiciona la cabeza arriba de ese punto.

export const COLOR_REFS = Object.freeze([
  'shirt',          // p.color
  'shirtDark',      // adjustColor(shirt, -40)
  'shirtShade',     // adjustColor(shirt, +18)  highlights
  'shirtBackShade', // adjustColor(shirt, -20)  hombro back
  'pants',
  'shoes',
  'skin',
]);

const HEX_RE = /^#[0-9a-fA-F]{3,8}$/;

export function resolveColor(ref, ctx) {
  switch (ref) {
    case 'shirt':          return ctx.shirt;
    case 'shirtDark':      return ctx.dark;
    case 'shirtShade':     return ctx.adjustColor(ctx.shirt, 18);
    case 'shirtBackShade': return ctx.adjustColor(ctx.shirt, -20);
    case 'pants':          return ctx.pantsC;
    case 'shoes':          return ctx.shoesC;
    case 'skin':           return ctx.skinC;
    default:
      if (typeof ref === 'string' && HEX_RE.test(ref)) return ref;
      return '#000';
  }
}

// Limites razonables para coords relativas (avatar ocupa ~64x80 px).
export const PART_COORD_MIN = -64;
export const PART_COORD_MAX = 64;
export const PART_SIZE_MIN = 1;
export const PART_SIZE_MAX = 64;
export const HEAD_BOTTOM_Y_MIN = -100;
export const HEAD_BOTTOM_Y_MAX = 0;
export const MAX_PARTS_PER_POSE = 64;

// Que fracción del bbox de la silla se redibuja sobre el avatar cuando
// chairOnTop = true. 0 = nada (= chairOnTop off), 1 = silla entera arriba.
// 0.55 = top 55% (= solo el respaldo, default que viene de la heurística
// hardcoded del game render anterior).
export const CHAIR_COVER_RATIO_MIN = 0;
export const CHAIR_COVER_RATIO_MAX = 1;
export const DEFAULT_CHAIR_COVER_RATIO = 0.55;

function clampInt(value, min, max) {
  if (!Number.isFinite(value)) return null;
  const r = Math.round(value);
  if (r < min || r > max) return null;
  return r;
}

// Devuelve part normalizado (clamp + valida) o null si es inválido.
export function clampPart(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const x = clampInt(raw.x, PART_COORD_MIN, PART_COORD_MAX);
  const y = clampInt(raw.y, PART_COORD_MIN, PART_COORD_MAX);
  const w = clampInt(raw.w, PART_SIZE_MIN, PART_SIZE_MAX);
  const h = clampInt(raw.h, PART_SIZE_MIN, PART_SIZE_MAX);
  if (x === null || y === null || w === null || h === null) return null;
  let color = raw.color;
  if (typeof color !== 'string') return null;
  if (!COLOR_REFS.includes(color) && !HEX_RE.test(color)) return null;
  const id = typeof raw.id === 'string' && raw.id.length > 0 && raw.id.length <= 40
    ? raw.id : `p_${x}_${y}`;
  const out = { id, x, y, w, h, color };
  if (typeof raw.name === 'string' && raw.name.length <= 40) out.name = raw.name;
  return out;
}

function clampRatio(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  if (n < CHAIR_COVER_RATIO_MIN) return CHAIR_COVER_RATIO_MIN;
  if (n > CHAIR_COVER_RATIO_MAX) return CHAIR_COVER_RATIO_MAX;
  return Math.round(n * 100) / 100;
}

export function clampPoseData(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const partsRaw = Array.isArray(raw.parts) ? raw.parts : [];
  if (partsRaw.length > MAX_PARTS_PER_POSE) return null;
  const parts = [];
  for (const p of partsRaw) {
    const c = clampPart(p);
    if (c) parts.push(c);
  }
  const headBottomY = clampInt(raw.headBottomY, HEAD_BOTTOM_Y_MIN, HEAD_BOTTOM_Y_MAX);
  if (headBottomY === null) return null;
  const chairOnTop = raw.chairOnTop === true;
  const chairCoverHeightRatio = clampRatio(raw.chairCoverHeightRatio, DEFAULT_CHAIR_COVER_RATIO);
  return { parts, headBottomY, chairOnTop, chairCoverHeightRatio };
}

// ── DEFAULT POSES ─────────────────────────────────────────────────────
// Cada pose tiene torso de 18w x 18h y cabeza
// terminando en y=-36. Front poses muestran 2 piernas escalonadas. Back
// poses muestran pies asomando del frente del asiento.

const NECK = { id: 'neck', x: -4, y: -39, w: 8, h: 5, color: 'skin', name: 'Cuello' };

function frontTorso() {
  return [
    { id: 'torso',       x: -9, y: -36, w: 18, h: 18, color: 'shirt',     name: 'Torso' },
    { id: 'torsoShadow', x: -9, y: -36, w: 18, h:  2, color: 'shirtDark', name: 'Sombra hombro' },
  ];
}

function backTorso() {
  return [
    { id: 'torso',       x: -9, y: -36, w: 18, h: 18, color: 'shirt',          name: 'Torso (espalda)' },
    { id: 'torsoShadow', x: -9, y: -36, w: 18, h:  2, color: 'shirtBackShade', name: 'Sombra hombro' },
  ];
}

function arms() {
  return [
    { id: 'leftArm',   x: -13, y: -34, w: 4, h: 11, color: 'shirtDark', name: 'Brazo izq' },
    { id: 'rightArm',  x:   9, y: -34, w: 4, h: 11, color: 'shirtDark', name: 'Brazo der' },
    { id: 'leftHand',  x: -13, y: -23, w: 4, h:  5, color: 'skin',      name: 'Mano izq' },
    { id: 'rightHand', x:   9, y: -23, w: 4, h:  5, color: 'skin',      name: 'Mano der' },
  ];
}

export const DEFAULT_SEAT_POSES = Object.freeze({
  // ── POSE 0 (↗ NE — back, pies asoman a la derecha) ──────────────
  0: Object.freeze({
    headBottomY: -36,
    chairOnTop: true,
    chairCoverHeightRatio: DEFAULT_CHAIR_COVER_RATIO,
    parts: Object.freeze([
      ...backTorso(),
      ...arms(),
      { id: 'farPantCuff',  x:  2, y: -7, w: 4, h: 2, color: 'pants', name: 'Tobillo lejano' },
      { id: 'farFoot',      x:  1, y: -5, w: 7, h: 3, color: 'shoes', name: 'Pie lejano' },
      { id: 'nearPantCuff', x:  5, y: -4, w: 4, h: 2, color: 'pants', name: 'Tobillo cercano' },
      { id: 'nearFoot',     x:  4, y: -2, w: 7, h: 3, color: 'shoes', name: 'Pie cercano' },
      NECK,
    ]),
  }),

  // ── POSE 1 (↖ NW — back, pies asoman a la izquierda) ────────────
  1: Object.freeze({
    headBottomY: -36,
    chairOnTop: true,
    chairCoverHeightRatio: DEFAULT_CHAIR_COVER_RATIO,
    parts: Object.freeze([
      ...backTorso(),
      ...arms(),
      { id: 'farPantCuff',  x: -6,  y: -7, w: 4, h: 2, color: 'pants', name: 'Tobillo lejano' },
      { id: 'farFoot',      x: -8,  y: -5, w: 7, h: 3, color: 'shoes', name: 'Pie lejano' },
      { id: 'nearPantCuff', x: -9,  y: -4, w: 4, h: 2, color: 'pants', name: 'Tobillo cercano' },
      { id: 'nearFoot',     x: -11, y: -2, w: 7, h: 3, color: 'shoes', name: 'Pie cercano' },
      NECK,
    ]),
  }),

  // ── POSE 2 (↙ SW — front, pies hacia abajo-izquierda) ───────────
  2: Object.freeze({
    headBottomY: -36,
    chairOnTop: false,
    chairCoverHeightRatio: DEFAULT_CHAIR_COVER_RATIO,
    parts: Object.freeze([
      // Pierna lejana (z atrás)
      { id: 'farThigh', x: -6, y: -18, w: 10, h: 4, color: 'pants', name: 'Muslo lejano' },
      { id: 'farShin',  x: -7, y: -14, w:  5, h: 7, color: 'pants', name: 'Tibia lejana' },
      { id: 'farFoot',  x: -9, y: -7,  w:  8, h: 3, color: 'shoes', name: 'Pie lejano' },
      ...frontTorso(),
      // Pierna cercana (z encima del torso bottom)
      { id: 'nearThigh', x:  -8, y: -14, w: 12, h: 4, color: 'pants', name: 'Muslo cercano' },
      { id: 'nearShin',  x:  -9, y: -10, w:  5, h: 7, color: 'pants', name: 'Tibia cercana' },
      { id: 'nearFoot',  x: -11, y: -3,  w:  8, h: 3, color: 'shoes', name: 'Pie cercano' },
      ...arms(),
      NECK,
    ]),
  }),

  // ── POSE 3 (↘ SE — front, pies hacia abajo-derecha) ─────────────
  3: Object.freeze({
    headBottomY: -36,
    chairOnTop: false,
    chairCoverHeightRatio: DEFAULT_CHAIR_COVER_RATIO,
    parts: Object.freeze([
      { id: 'farThigh', x: -4, y: -18, w: 10, h: 4, color: 'pants', name: 'Muslo lejano' },
      { id: 'farShin',  x:  2, y: -14, w:  5, h: 7, color: 'pants', name: 'Tibia lejana' },
      { id: 'farFoot',  x:  1, y: -7,  w:  8, h: 3, color: 'shoes', name: 'Pie lejano' },
      ...frontTorso(),
      { id: 'nearThigh', x: -4, y: -14, w: 12, h: 4, color: 'pants', name: 'Muslo cercano' },
      { id: 'nearShin',  x:  4, y: -10, w:  5, h: 7, color: 'pants', name: 'Tibia cercana' },
      { id: 'nearFoot',  x:  3, y: -3,  w:  8, h: 3, color: 'shoes', name: 'Pie cercano' },
      ...arms(),
      NECK,
    ]),
  }),
});

export function defaultPose(pose) {
  const p = ((Number(pose) % 4) + 4) % 4;
  // Devolver una copia mutable de la default (no se exponen Object.freeze al editor).
  const base = DEFAULT_SEAT_POSES[p];
  return {
    parts: base.parts.map((x) => ({ ...x })),
    headBottomY: base.headBottomY,
    chairOnTop: base.chairOnTop,
    chairCoverHeightRatio: base.chairCoverHeightRatio ?? DEFAULT_CHAIR_COVER_RATIO,
  };
}

// Lookup principal. Devuelve siempre {parts, headBottomY, chairOnTop, source}
// con source ∈ 'chair' | 'global' | 'default'.
export function readSeatPose({ rawCatalog, furniId, pose }) {
  const p = ((Number(pose) % 4) + 4) % 4;
  const key = `pose${p}`;

  if (rawCatalog && furniId) {
    const chairOverride = clampPoseData(rawCatalog?.[furniId]?.seatPoses?.[key]);
    if (chairOverride && chairOverride.parts.length > 0) {
      return { ...chairOverride, source: 'chair' };
    }
  }
  const globalOverride = clampPoseData(rawCatalog?._avatarSeatPoses?.[key]);
  if (globalOverride && globalOverride.parts.length > 0) {
    return { ...globalOverride, source: 'global' };
  }
  return { ...defaultPose(p), source: 'default' };
}

export function hasChairSeatPoseOverride({ rawCatalog, furniId, pose }) {
  const p = ((Number(pose) % 4) + 4) % 4;
  if (!rawCatalog || !furniId) return false;
  const node = rawCatalog?.[furniId]?.seatPoses?.[`pose${p}`];
  return !!(node && typeof node === 'object' && Array.isArray(node.parts));
}

// Mapea rotación de silla (0..3) → pose (0..3). Coherente con SIT_POSES del
// admin panel y con el seat.direction que arma `getSeatsForRotation`.
//   rot 0 → pose 0 (↗ NE back)   rot 2 → pose 2 (↙ SW front)
//   rot 3 → pose 1 (↖ NW back)   rot 1 → pose 3 (↘ SE front)
const ROT_TO_POSE = Object.freeze({ 0: 0, 1: 3, 2: 2, 3: 1 });
export function chairRotToPose(rot) {
  const r = ((Number(rot) % 4) + 4) % 4;
  return ROT_TO_POSE[r];
}
