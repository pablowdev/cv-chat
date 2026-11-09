// Tuning de offsets visuales para el avatar sentado.
//
// Dos niveles, los dos vienen en las poses del catalogo de CV Hotel (GET /puente/api/hotel/catalogo,
// campo poses; el servidor los arma desde puente_hotel_poses):
//   - Default global  : _avatarPoseDefaults.poseN {dx,dy}
//   - Override silla  : <id del mueble>.poseOffsets.poseN {dx,dy}
//
// La pose es 0..3 (la del comentario en drawPixelCharRuntime.js):
//   0 = back-N (↗)   1 = back-W (↖)   2 = front-S (↙)   3 = front-E (↘)
// Se obtiene de bodyDirToSittingPose(sittingDir).
//
// Lookup: si la silla tiene override propio para esa pose lo usa, sino global,
// sino (0,0). Cualquier valor fuera de [-32,32] se ignora (clamp duro a 0).

export const POSE_OFFSET_MIN = -32;
export const POSE_OFFSET_MAX = 32;
export const SITTING_POSE_KEYS = Object.freeze(['pose0', 'pose1', 'pose2', 'pose3']);

function clampInt(value, min, max) {
  if (!Number.isFinite(value)) return 0;
  const r = Math.round(value);
  if (r < min) return min;
  if (r > max) return max;
  return r;
}

export function clampPoseOffsetValue(value) {
  return clampInt(Number(value), POSE_OFFSET_MIN, POSE_OFFSET_MAX);
}

export function normalizePoseIndex(pose) {
  const n = Math.floor(Number(pose));
  if (!Number.isFinite(n)) return null;
  if (n < 0 || n > 3) return null;
  return n;
}

function readOffsetNode(node) {
  if (!node || typeof node !== 'object') return null;
  const dx = clampPoseOffsetValue(node.dx);
  const dy = clampPoseOffsetValue(node.dy);
  return { dx, dy };
}

// Lookup principal. rawCatalog = las poses del catalogo (ver src/app/catalogo.js, posesCrudas).
// Devuelve siempre {dx, dy, source} con source ∈ 'chair' | 'global' | 'none'.
export function readPoseOffset({ rawCatalog, furniId, pose }) {
  const safePose = normalizePoseIndex(pose);
  if (safePose == null) return { dx: 0, dy: 0, source: 'none' };
  const key = SITTING_POSE_KEYS[safePose];

  if (rawCatalog && furniId) {
    const chairOverride = readOffsetNode(rawCatalog?.[furniId]?.poseOffsets?.[key]);
    if (chairOverride) return { ...chairOverride, source: 'chair' };
  }
  const globalDefault = readOffsetNode(rawCatalog?._avatarPoseDefaults?.[key]);
  if (globalDefault) return { ...globalDefault, source: 'global' };
  return { dx: 0, dy: 0, source: 'none' };
}

// Saber si una silla tiene override propio para una pose (sin caer al global).
export function hasChairOverride({ rawCatalog, furniId, pose }) {
  const safePose = normalizePoseIndex(pose);
  if (safePose == null || !rawCatalog || !furniId) return false;
  const node = rawCatalog?.[furniId]?.poseOffsets?.[SITTING_POSE_KEYS[safePose]];
  return !!(node && typeof node === 'object' && (Number.isFinite(node.dx) || Number.isFinite(node.dy)));
}
