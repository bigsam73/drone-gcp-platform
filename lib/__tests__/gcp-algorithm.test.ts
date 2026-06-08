import { describe, it, expect } from 'vitest';
import { recommendCount, generateGCPs } from '../gcp-algorithm';
import { isPointInPolygon } from '../geometry';

const square1ha = [
  { lat: 37.5,       lng: 127.0       },
  { lat: 37.5,       lng: 127.001134  },
  { lat: 37.500902,  lng: 127.001134  },
  { lat: 37.500902,  lng: 127.0       },
];

describe('recommendCount', () => {
  it('1 ha → 5', () => expect(recommendCount(1)).toBe(5));
  it('10 ha → 5', () => expect(recommendCount(10)).toBe(5));
  it('11 ha → 6', () => expect(recommendCount(11)).toBe(6));
  it('100 ha → 14', () => expect(recommendCount(100)).toBe(14));
  it('0 → 0', () => expect(recommendCount(0)).toBe(0));
  it('음수 → 0', () => expect(recommendCount(-1)).toBe(0));
});

describe('generateGCPs', () => {
  it('정사각형 1ha에 5개 생성, 각 GCP에 id/lat/lng/label 포함', () => {
    const gcps = generateGCPs(square1ha, 5);
    expect(gcps).toHaveLength(5);
    gcps.forEach((g) => {
      expect(typeof g.id).toBe('string');
      expect(g.id.length).toBeGreaterThan(0);
      expect(typeof g.lat).toBe('number');
      expect(typeof g.lng).toBe('number');
      expect(g.label).toMatch(/^GCP-\d{2}$/);
    });
  });

  it('첫 4개 점은 폴리곤 꼭짓점과 일치 (모서리 배치)', () => {
    const gcps = generateGCPs(square1ha, 5);
    const corners = gcps.slice(0, 4);
    const matched = square1ha.filter((c) =>
      corners.some((g) => Math.abs(g.lat - c.lat) < 1e-6 && Math.abs(g.lng - c.lng) < 1e-6),
    );
    expect(matched.length).toBe(4);
  });

  it('count <= 4 이면 모서리만 반환', () => {
    expect(generateGCPs(square1ha, 3)).toHaveLength(3);
    expect(generateGCPs(square1ha, 1)).toHaveLength(1);
  });

  it('점 < 3 폴리곤은 빈 배열', () => {
    expect(generateGCPs([], 5)).toEqual([]);
    expect(generateGCPs([{ lat: 0, lng: 0 }, { lat: 1, lng: 1 }], 5)).toEqual([]);
  });

  it('count <= 0 이면 빈 배열', () => {
    expect(generateGCPs(square1ha, 0)).toEqual([]);
    expect(generateGCPs(square1ha, -1)).toEqual([]);
  });

  it('라벨이 GCP-01, GCP-02 순서로 부여됨', () => {
    const gcps = generateGCPs(square1ha, 6);
    expect(gcps[0].label).toBe('GCP-01');
    expect(gcps[1].label).toBe('GCP-02');
    expect(gcps[5].label).toBe('GCP-06');
  });

  it('id는 GCP마다 고유함', () => {
    const gcps = generateGCPs(square1ha, 6);
    const ids = new Set(gcps.map((g) => g.id));
    expect(ids.size).toBe(gcps.length);
  });

  it('L자형 폴리곤에서 모든 내부 GCP가 폴리곤 내부에 있음', () => {
    // L자: (0,0)-(0,2)-(1,2)-(1,1)-(2,1)-(2,0)
    const lShape = [
      { lat: 0, lng: 0 },
      { lat: 0, lng: 2 },
      { lat: 1, lng: 2 },
      { lat: 1, lng: 1 },
      { lat: 2, lng: 1 },
      { lat: 2, lng: 0 },
    ];
    const gcps = generateGCPs(lShape, 8);
    expect(gcps.length).toBeGreaterThan(0);
    // 모든 점이 폴리곤 내부 또는 경계에 있어야 함
    gcps.forEach((g) => {
      expect(isPointInPolygon({ lat: g.lat, lng: g.lng }, lShape)).toBe(true);
    });
  });

  it('큰 폴리곤에서 모든 내부 점은 폴리곤 내부 또는 경계에 있음', () => {
    const bigRect = [
      { lat: 37.5,  lng: 127.0  },
      { lat: 37.5,  lng: 127.02 },
      { lat: 37.52, lng: 127.02 },
      { lat: 37.52, lng: 127.0  },
    ];
    const gcps = generateGCPs(bigRect, 9);
    expect(gcps.length).toBeGreaterThan(0);
    // 내부 점들 (모서리 4개 제외)은 폴리곤 내부에 있어야 함
    const interior = gcps.slice(4);
    interior.forEach((g) => {
      expect(isPointInPolygon({ lat: g.lat, lng: g.lng }, bigRect)).toBe(true);
    });
  });
});
