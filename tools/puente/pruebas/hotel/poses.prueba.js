// Pruebas de PawHotel que siguen sirviendo, portadas a node puro: tests/app/avatarPoseTuning.test.js y
// tests/config/avatarSeatPoses.test.js tal cual (cambia solo el arnes: vitest -> arnesAsincrono.js, y la
// ruta de los modulos, que ahora estan en web/hotel/src/config/). Correr: node poses.prueba.js
import arnes from './arnesAsincrono.js';
const { describe, it, expect, fin } = arnes;

// ===================== tests/app/avatarPoseTuning.test.js =====================
import {
  readPoseOffset,
  hasChairOverride,
  clampPoseOffsetValue,
  normalizePoseIndex,
  POSE_OFFSET_MIN,
  POSE_OFFSET_MAX,
} from '../../web/hotel/src/config/avatarPoseTuning.js';

describe('clampPoseOffsetValue', () => {
  it('rounds and clamps to range', () => {
    expect(clampPoseOffsetValue(0)).toBe(0);
    expect(clampPoseOffsetValue(3.4)).toBe(3);
    expect(clampPoseOffsetValue(-3.6)).toBe(-4);
    expect(clampPoseOffsetValue(POSE_OFFSET_MAX + 5)).toBe(POSE_OFFSET_MAX);
    expect(clampPoseOffsetValue(POSE_OFFSET_MIN - 5)).toBe(POSE_OFFSET_MIN);
  });
  it('returns 0 on garbage', () => {
    expect(clampPoseOffsetValue('foo')).toBe(0);
    expect(clampPoseOffsetValue(NaN)).toBe(0);
    expect(clampPoseOffsetValue(undefined)).toBe(0);
  });
});

describe('normalizePoseIndex', () => {
  it('accepts 0..3', () => {
    for (let i = 0; i <= 3; i += 1) expect(normalizePoseIndex(i)).toBe(i);
  });
  it('rejects out of range and garbage', () => {
    expect(normalizePoseIndex(-1)).toBe(null);
    expect(normalizePoseIndex(4)).toBe(null);
    expect(normalizePoseIndex('x')).toBe(null);
  });
});

describe('readPoseOffset', () => {
  it('returns (0,0)/none when nothing set', () => {
    const r = readPoseOffset({ rawCatalog: {}, furniId: 'chair_a', pose: 2 });
    expect(r).toEqual({ dx: 0, dy: 0, source: 'none' });
  });
  it('falls back to global default', () => {
    const rawCatalog = { _avatarPoseDefaults: { pose2: { dx: 1, dy: -3 } } };
    const r = readPoseOffset({ rawCatalog, furniId: 'chair_a', pose: 2 });
    expect(r).toEqual({ dx: 1, dy: -3, source: 'global' });
  });
  it('chair override takes precedence over global', () => {
    const rawCatalog = {
      _avatarPoseDefaults: { pose2: { dx: 1, dy: -3 } },
      chair_a: { poseOffsets: { pose2: { dx: 5, dy: 0 } } },
    };
    const r = readPoseOffset({ rawCatalog, furniId: 'chair_a', pose: 2 });
    expect(r).toEqual({ dx: 5, dy: 0, source: 'chair' });
  });
  it('chair without override for that pose still uses global', () => {
    const rawCatalog = {
      _avatarPoseDefaults: { pose2: { dx: 1, dy: -3 } },
      chair_a: { poseOffsets: { pose0: { dx: 9, dy: 9 } } },
    };
    const r = readPoseOffset({ rawCatalog, furniId: 'chair_a', pose: 2 });
    expect(r).toEqual({ dx: 1, dy: -3, source: 'global' });
  });
  it('clamps stored values that exceed range', () => {
    const rawCatalog = { _avatarPoseDefaults: { pose0: { dx: 999, dy: -999 } } };
    const r = readPoseOffset({ rawCatalog, furniId: null, pose: 0 });
    expect(r).toEqual({ dx: POSE_OFFSET_MAX, dy: POSE_OFFSET_MIN, source: 'global' });
  });
  it('returns none for invalid pose index', () => {
    expect(readPoseOffset({ rawCatalog: {}, furniId: 'x', pose: 7 }))
      .toEqual({ dx: 0, dy: 0, source: 'none' });
  });
  it('handles missing rawCatalog', () => {
    expect(readPoseOffset({ rawCatalog: null, furniId: 'x', pose: 0 }))
      .toEqual({ dx: 0, dy: 0, source: 'none' });
  });
});

describe('hasChairOverride', () => {
  it('true when pose has override', () => {
    const rawCatalog = { chair_a: { poseOffsets: { pose1: { dx: 0, dy: 4 } } } };
    expect(hasChairOverride({ rawCatalog, furniId: 'chair_a', pose: 1 })).toBe(true);
  });
  it('false when other pose has override', () => {
    const rawCatalog = { chair_a: { poseOffsets: { pose0: { dx: 0, dy: 4 } } } };
    expect(hasChairOverride({ rawCatalog, furniId: 'chair_a', pose: 1 })).toBe(false);
  });
  it('false when no override at all', () => {
    expect(hasChairOverride({ rawCatalog: {}, furniId: 'chair_a', pose: 0 })).toBe(false);
  });
  it('false when furniId missing', () => {
    const rawCatalog = { chair_a: { poseOffsets: { pose0: { dx: 1, dy: 1 } } } };
    expect(hasChairOverride({ rawCatalog, furniId: null, pose: 0 })).toBe(false);
  });
});

// ===================== tests/config/avatarSeatPoses.test.js =====================
import {
  COLOR_REFS,
  resolveColor,
  clampPart,
  clampPoseData,
  defaultPose,
  readSeatPose,
  hasChairSeatPoseOverride,
  chairRotToPose,
  DEFAULT_SEAT_POSES,
  PART_COORD_MAX,
  PART_SIZE_MAX,
  MAX_PARTS_PER_POSE,
  DEFAULT_CHAIR_COVER_RATIO,
} from '../../web/hotel/src/config/avatarSeatPoses.js';

const colorCtx = {
  shirt: '#abcdef',
  dark: '#222233',
  pantsC: '#1a1a2e',
  shoesC: '#111111',
  skinC: '#f2c38a',
  adjustColor: (hex, _delta) => hex, // identity for tests
};

describe('resolveColor', () => {
  it('resolves all named refs', () => {
    expect(resolveColor('shirt', colorCtx)).toBe('#abcdef');
    expect(resolveColor('shirtDark', colorCtx)).toBe('#222233');
    expect(resolveColor('pants', colorCtx)).toBe('#1a1a2e');
    expect(resolveColor('shoes', colorCtx)).toBe('#111111');
    expect(resolveColor('skin', colorCtx)).toBe('#f2c38a');
  });
  it('returns hex literal as-is', () => {
    expect(resolveColor('#ff00aa', colorCtx)).toBe('#ff00aa');
  });
  it('falls back to black for garbage', () => {
    expect(resolveColor('not-a-color', colorCtx)).toBe('#000');
    expect(resolveColor(undefined, colorCtx)).toBe('#000');
  });
});

describe('clampPart', () => {
  it('clamps integers and validates color', () => {
    const p = clampPart({ id: 'foo', x: 1.6, y: -2, w: 5, h: 8, color: 'shirt' });
    expect(p).toEqual({ id: 'foo', x: 2, y: -2, w: 5, h: 8, color: 'shirt' });
  });
  it('rejects out-of-range coords', () => {
    expect(clampPart({ x: 1000, y: 0, w: 5, h: 5, color: 'shirt' })).toBeNull();
    expect(clampPart({ x: 0, y: 0, w: PART_SIZE_MAX + 1, h: 5, color: 'shirt' })).toBeNull();
  });
  it('rejects invalid colors', () => {
    expect(clampPart({ x: 0, y: 0, w: 5, h: 5, color: 'foo' })).toBeNull();
    expect(clampPart({ x: 0, y: 0, w: 5, h: 5, color: 123 })).toBeNull();
  });
  it('accepts hex literal as color', () => {
    expect(clampPart({ x: 0, y: 0, w: 5, h: 5, color: '#abc' })).toBeTruthy();
    expect(clampPart({ x: 0, y: 0, w: 5, h: 5, color: '#aabbcc' })).toBeTruthy();
  });
  it('synthesizes id if missing', () => {
    const p = clampPart({ x: 3, y: 7, w: 1, h: 1, color: 'pants' });
    expect(p.id).toMatch(/^p_/);
  });
});

describe('clampPoseData', () => {
  it('clamps a valid pose', () => {
    const data = clampPoseData({
      parts: [{ x: 0, y: -10, w: 5, h: 5, color: 'shirt' }],
      headBottomY: -36,
      chairOnTop: true,
    });
    expect(data).not.toBeNull();
    expect(data.parts).toHaveLength(1);
    expect(data.headBottomY).toBe(-36);
    expect(data.chairOnTop).toBe(true);
  });
  it('drops invalid parts but keeps valid ones', () => {
    const data = clampPoseData({
      parts: [
        { x: 0, y: 0, w: 5, h: 5, color: 'shirt' },
        { x: 0, y: 0, w: 5, h: 5, color: 'invalid' }, // dropped
        { x: 5000, y: 0, w: 5, h: 5, color: 'shirt' }, // dropped (out of range)
      ],
      headBottomY: -30,
    });
    expect(data.parts).toHaveLength(1);
  });
  it('rejects too many parts', () => {
    const tooMany = Array.from({ length: MAX_PARTS_PER_POSE + 1 }, () => ({
      x: 0, y: 0, w: 1, h: 1, color: 'shirt',
    }));
    expect(clampPoseData({ parts: tooMany, headBottomY: 0 })).toBeNull();
  });
  it('rejects invalid headBottomY', () => {
    expect(clampPoseData({ parts: [], headBottomY: 100 })).toBeNull();
    expect(clampPoseData({ parts: [], headBottomY: -1000 })).toBeNull();
  });
});

describe('DEFAULT_SEAT_POSES', () => {
  it('has 4 poses with valid parts', () => {
    for (const pose of [0, 1, 2, 3]) {
      const data = DEFAULT_SEAT_POSES[pose];
      expect(data).toBeTruthy();
      expect(Array.isArray(data.parts)).toBe(true);
      expect(data.parts.length).toBeGreaterThan(0);
      expect(typeof data.headBottomY).toBe('number');
      // Each part is valid via clampPart
      for (const p of data.parts) {
        expect(clampPart(p)).not.toBeNull();
      }
    }
  });
  it('has back poses (0,1) with no thigh parts (front-only)', () => {
    for (const pose of [0, 1]) {
      const ids = DEFAULT_SEAT_POSES[pose].parts.map((p) => p.id);
      expect(ids).not.toContain('farThigh');
      expect(ids).not.toContain('nearThigh');
    }
  });
  it('has front poses (2,3) with both legs', () => {
    for (const pose of [2, 3]) {
      const ids = DEFAULT_SEAT_POSES[pose].parts.map((p) => p.id);
      expect(ids).toContain('farThigh');
      expect(ids).toContain('nearThigh');
      expect(ids).toContain('farFoot');
      expect(ids).toContain('nearFoot');
    }
  });
});

describe('defaultPose', () => {
  it('returns mutable copy of default', () => {
    const a = defaultPose(2);
    const b = defaultPose(2);
    expect(a).not.toBe(b);
    expect(a.parts).not.toBe(b.parts);
    a.parts.push({ id: 'x', x: 0, y: 0, w: 1, h: 1, color: 'shirt' });
    expect(b.parts.length).not.toBe(a.parts.length);
  });
  it('wraps pose index', () => {
    expect(defaultPose(4).parts.length).toBe(DEFAULT_SEAT_POSES[0].parts.length);
    expect(defaultPose(-1).parts.length).toBe(DEFAULT_SEAT_POSES[3].parts.length);
  });
});

describe('readSeatPose lookup chain', () => {
  it('falls back to default with empty catalog', () => {
    const p = readSeatPose({ rawCatalog: {}, furniId: null, pose: 3 });
    expect(p.source).toBe('default');
    expect(p.parts.length).toBe(DEFAULT_SEAT_POSES[3].parts.length);
  });
  it('uses global override over default', () => {
    const customParts = [{ id: 't', x: 0, y: -10, w: 4, h: 4, color: 'shirt' }];
    const raw = {
      _avatarSeatPoses: {
        pose3: { parts: customParts, headBottomY: -20, chairOnTop: false },
      },
    };
    const p = readSeatPose({ rawCatalog: raw, furniId: null, pose: 3 });
    expect(p.source).toBe('global');
    expect(p.parts).toHaveLength(1);
    expect(p.headBottomY).toBe(-20);
  });
  it('chair override beats global', () => {
    const raw = {
      _avatarSeatPoses: {
        pose3: { parts: [{ id: 'a', x: 0, y: -5, w: 4, h: 4, color: 'shirt' }], headBottomY: -30 },
      },
      chair_a: {
        seatPoses: {
          pose3: { parts: [{ id: 'b', x: 0, y: -5, w: 4, h: 4, color: 'pants' }], headBottomY: -25, chairOnTop: true },
        },
      },
    };
    const p = readSeatPose({ rawCatalog: raw, furniId: 'chair_a', pose: 3 });
    expect(p.source).toBe('chair');
    expect(p.chairOnTop).toBe(true);
    expect(p.parts[0].color).toBe('pants');
  });
  it('skips chair override if parts is empty/invalid', () => {
    const raw = {
      _avatarSeatPoses: {
        pose3: { parts: [{ id: 'g', x: 0, y: -5, w: 4, h: 4, color: 'shirt' }], headBottomY: -30 },
      },
      chair_a: {
        seatPoses: { pose3: { parts: [], headBottomY: -10 } },
      },
    };
    const p = readSeatPose({ rawCatalog: raw, furniId: 'chair_a', pose: 3 });
    expect(p.source).toBe('global');
  });
});

describe('hasChairSeatPoseOverride', () => {
  it('detects chair override', () => {
    const raw = {
      chair_a: {
        seatPoses: {
          pose0: { parts: [{ x: 0, y: 0, w: 1, h: 1, color: 'shirt' }], headBottomY: 0 },
        },
      },
    };
    expect(hasChairSeatPoseOverride({ rawCatalog: raw, furniId: 'chair_a', pose: 0 })).toBe(true);
    expect(hasChairSeatPoseOverride({ rawCatalog: raw, furniId: 'chair_a', pose: 1 })).toBe(false);
    expect(hasChairSeatPoseOverride({ rawCatalog: raw, furniId: 'other', pose: 0 })).toBe(false);
  });
});

describe('COLOR_REFS', () => {
  it('contains all expected refs', () => {
    expect(COLOR_REFS).toContain('shirt');
    expect(COLOR_REFS).toContain('shirtDark');
    expect(COLOR_REFS).toContain('pants');
    expect(COLOR_REFS).toContain('shoes');
    expect(COLOR_REFS).toContain('skin');
  });
});

describe('chairCoverHeightRatio', () => {
  it('clampPoseData clamps to [0,1] and rounds to 2 decimals', () => {
    const a = clampPoseData({ parts: [], headBottomY: 0, chairCoverHeightRatio: 0.557 });
    expect(a.chairCoverHeightRatio).toBe(0.56);
    const b = clampPoseData({ parts: [], headBottomY: 0, chairCoverHeightRatio: 1.5 });
    expect(b.chairCoverHeightRatio).toBe(1);
    const c = clampPoseData({ parts: [], headBottomY: 0, chairCoverHeightRatio: -0.5 });
    expect(c.chairCoverHeightRatio).toBe(0);
  });
  it('falls back to default when omitted', () => {
    const data = clampPoseData({ parts: [], headBottomY: 0 });
    expect(data.chairCoverHeightRatio).toBe(DEFAULT_CHAIR_COVER_RATIO);
  });
  it('default for back poses (0,1) is chairOnTop=true with 0.55 cover', () => {
    expect(DEFAULT_SEAT_POSES[0].chairOnTop).toBe(true);
    expect(DEFAULT_SEAT_POSES[1].chairOnTop).toBe(true);
    expect(DEFAULT_SEAT_POSES[0].chairCoverHeightRatio).toBe(DEFAULT_CHAIR_COVER_RATIO);
  });
  it('default for front poses (2,3) is chairOnTop=false', () => {
    expect(DEFAULT_SEAT_POSES[2].chairOnTop).toBe(false);
    expect(DEFAULT_SEAT_POSES[3].chairOnTop).toBe(false);
  });
  it('readSeatPose preserves field through global override', () => {
    const raw = {
      _avatarSeatPoses: {
        pose0: {
          parts: [{ x: 0, y: -5, w: 4, h: 4, color: 'shirt' }],
          headBottomY: -10,
          chairOnTop: true,
          chairCoverHeightRatio: 0.42,
        },
      },
    };
    const p = readSeatPose({ rawCatalog: raw, furniId: null, pose: 0 });
    expect(p.chairCoverHeightRatio).toBe(0.42);
  });
  it('defaultPose copy includes the field', () => {
    const p = defaultPose(0);
    expect(p.chairCoverHeightRatio).toBe(DEFAULT_CHAIR_COVER_RATIO);
    expect(p.chairOnTop).toBe(true);
  });
});

describe('chairRotToPose', () => {
  it('maps rot 0..3 to expected pose', () => {
    expect(chairRotToPose(0)).toBe(0); // ↗ NE back
    expect(chairRotToPose(1)).toBe(3); // ↘ SE front
    expect(chairRotToPose(2)).toBe(2); // ↙ SW front
    expect(chairRotToPose(3)).toBe(1); // ↖ NW back
  });
  it('wraps out-of-range rotations', () => {
    expect(chairRotToPose(4)).toBe(0);
    expect(chairRotToPose(-1)).toBe(1);
  });
});

fin();
