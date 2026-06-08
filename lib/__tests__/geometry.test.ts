import { describe, it, expect } from 'vitest';
import {
  polygonAreaHa,
  isPointInPolygon,
  polygonDiameterMeters,
  polygonCentroid,
  polygonBoundingBox,
} from '../geometry';

describe('polygonAreaHa', () => {
  it('약 1km × 1km 정사각형은 약 100 ha', () => {
    const poly = [
      { lat: 37.5,      lng: 127.0      },
      { lat: 37.5,      lng: 127.01134  },
      { lat: 37.50902,  lng: 127.01134  },
      { lat: 37.50902,  lng: 127.0      },
    ];
    const area = polygonAreaHa(poly);
    expect(area).toBeGreaterThan(95);
    expect(area).toBeLessThan(105);
  });

  it('점이 3개 미만이면 0 반환', () => {
    expect(polygonAreaHa([{ lat: 0, lng: 0 }, { lat: 1, lng: 1 }])).toBe(0);
    expect(polygonAreaHa([])).toBe(0);
  });
});

describe('isPointInPolygon', () => {
  const square = [
    { lat: 0, lng: 0 },
    { lat: 0, lng: 1 },
    { lat: 1, lng: 1 },
    { lat: 1, lng: 0 },
  ];
  it('내부 점은 true', () => {
    expect(isPointInPolygon({ lat: 0.5, lng: 0.5 }, square)).toBe(true);
  });
  it('외부 점은 false', () => {
    expect(isPointInPolygon({ lat: 2, lng: 2 }, square)).toBe(false);
  });
  it('빈 폴리곤은 false', () => {
    expect(isPointInPolygon({ lat: 0, lng: 0 }, [])).toBe(false);
  });
});

describe('polygonDiameterMeters', () => {
  it('정사각형의 대각선에 가까운 길이를 반환', () => {
    const poly = [
      { lat: 37.5,  lng: 127.0  },
      { lat: 37.5,  lng: 127.01 },
      { lat: 37.51, lng: 127.01 },
      { lat: 37.51, lng: 127.0  },
    ];
    const d = polygonDiameterMeters(poly);
    expect(d).toBeGreaterThan(1000);
    expect(d).toBeLessThan(2000);
  });
  it('점이 2개 미만이면 0', () => {
    expect(polygonDiameterMeters([])).toBe(0);
    expect(polygonDiameterMeters([{ lat: 0, lng: 0 }])).toBe(0);
  });
});

describe('polygonCentroid', () => {
  it('정사각형 중앙을 반환', () => {
    const poly = [
      { lat: 0, lng: 0 },
      { lat: 0, lng: 1 },
      { lat: 1, lng: 1 },
      { lat: 1, lng: 0 },
    ];
    const c = polygonCentroid(poly);
    expect(c).not.toBeNull();
    expect(c!.lat).toBeCloseTo(0.5, 2);
    expect(c!.lng).toBeCloseTo(0.5, 2);
  });
  it('빈 폴리곤은 null', () => {
    expect(polygonCentroid([])).toBeNull();
  });
});

describe('polygonBoundingBox', () => {
  it('정확한 bbox를 반환', () => {
    const poly = [
      { lat: 0,   lng: 0   },
      { lat: 0,   lng: 1   },
      { lat: 1,   lng: 1   },
      { lat: 0.5, lng: 0.5 },
    ];
    const bbox = polygonBoundingBox(poly);
    expect(bbox).not.toBeNull();
    expect(bbox!.minLat).toBe(0);
    expect(bbox!.maxLat).toBe(1);
    expect(bbox!.minLng).toBe(0);
    expect(bbox!.maxLng).toBe(1);
  });
  it('빈 폴리곤은 null', () => {
    expect(polygonBoundingBox([])).toBeNull();
  });
});
