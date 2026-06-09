import { describe, it, expect } from 'vitest';
import {
  PRESETS,
  getPreset,
  isValidPresetId,
  DEFAULT_PRESET_ID,
} from '../recommendation-presets';

describe('PRESETS array', () => {
  it('정확히 6개 프리셋 포함', () => {
    expect(PRESETS).toHaveLength(6);
  });

  it('모든 프리셋의 id가 고유', () => {
    const ids = PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('각 프리셋이 필수 필드 보유', () => {
    PRESETS.forEach((p) => {
      expect(typeof p.id).toBe('string');
      expect(typeof p.name).toBe('string');
      expect(typeof p.description).toBe('string');
      expect(typeof p.source).toBe('string');
      expect(typeof p.formula).toBe('function');
    });
  });

  it('6개 ID 모두 존재', () => {
    const ids = PRESETS.map((p) => p.id);
    expect(ids).toContain('standard');
    expect(ids).toContain('pix4d-default');
    expect(ids).toContain('pix4d-precision');
    expect(ids).toContain('agisoft');
    expect(ids).toContain('ngii');
    expect(ids).toContain('asprs');
  });
});

describe('Preset formulas — 0/negative area', () => {
  it.each(['standard', 'pix4d-default', 'pix4d-precision', 'agisoft', 'ngii', 'asprs'] as const)(
    '%s: ha<=0 → 0',
    (id) => {
      const p = getPreset(id);
      expect(p.formula(0)).toBe(0);
      expect(p.formula(-1)).toBe(0);
    },
  );
});

describe('Standard preset formula', () => {
  const f = getPreset('standard').formula;
  it('1 ha → 5', () => expect(f(1)).toBe(5));
  it('10 ha → 5', () => expect(f(10)).toBe(5));
  it('11 ha → 6', () => expect(f(11)).toBe(6));
  it('100 ha → 14', () => expect(f(100)).toBe(14));
});

describe('Pix4D Default formula', () => {
  const f = getPreset('pix4d-default').formula;
  it('1 ha → 5', () => expect(f(1)).toBe(5));
  it('20 ha → 5', () => expect(f(20)).toBe(5));
  it('21 ha → 6', () => expect(f(21)).toBe(6));
  it('100 ha → 9', () => expect(f(100)).toBe(9));
});

describe('Pix4D Precision formula', () => {
  const f = getPreset('pix4d-precision').formula;
  it('1 ha → 10', () => expect(f(1)).toBe(10));
  it('10 ha → 10', () => expect(f(10)).toBe(10));
  it('11 ha → 11', () => expect(f(11)).toBe(11));
  it('100 ha → 19', () => expect(f(100)).toBe(19));
});

describe('Agisoft Metashape formula', () => {
  const f = getPreset('agisoft').formula;
  it('1 ha → 5', () => expect(f(1)).toBe(5));
  it('15 ha → 5', () => expect(f(15)).toBe(5));
  it('16 ha → 6', () => expect(f(16)).toBe(6));
  it('100 ha → 11', () => expect(f(100)).toBe(11));
});

describe('NGII formula', () => {
  const f = getPreset('ngii').formula;
  it('1 ha → 9', () => expect(f(1)).toBe(9));
  it('100 ha → 9', () => expect(f(100)).toBe(9));
  it('111 ha → 10', () => expect(f(111)).toBe(10));
});

describe('ASPRS formula', () => {
  const f = getPreset('asprs').formula;
  // ASPRS: max(5, ceil(ha/20) + 3)
  // 1ha → ceil(0.05)+3 = 1+3 = 4 → max(5,4) = 5
  // 20ha → ceil(1)+3 = 1+3 = 4 → max(5,4) = 5
  // 40ha → ceil(2)+3 = 2+3 = 5 → max(5,5) = 5
  // 41ha → ceil(2.05)+3 = 3+3 = 6
  // 100ha → ceil(5)+3 = 5+3 = 8
  it('1 ha → 5', () => expect(f(1)).toBe(5));
  it('20 ha → 5', () => expect(f(20)).toBe(5));
  it('40 ha → 5', () => expect(f(40)).toBe(5));
  it('41 ha → 6', () => expect(f(41)).toBe(6));
  it('100 ha → 8', () => expect(f(100)).toBe(8));
});

describe('getPreset / isValidPresetId / DEFAULT_PRESET_ID', () => {
  it('getPreset이 ID에 해당하는 프리셋 반환', () => {
    expect(getPreset('standard').id).toBe('standard');
    expect(getPreset('ngii').id).toBe('ngii');
  });

  it('isValidPresetId는 유효 ID에 true', () => {
    expect(isValidPresetId('standard')).toBe(true);
    expect(isValidPresetId('ngii')).toBe(true);
  });

  it('isValidPresetId는 잘못된 값에 false', () => {
    expect(isValidPresetId('invalid')).toBe(false);
    expect(isValidPresetId('')).toBe(false);
  });

  it('DEFAULT_PRESET_ID는 standard', () => {
    expect(DEFAULT_PRESET_ID).toBe('standard');
  });
});
