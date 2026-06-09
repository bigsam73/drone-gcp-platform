import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../store';

const square = [
  { lat: 37.5,      lng: 127.0      },
  { lat: 37.5,      lng: 127.01134  },
  { lat: 37.50902,  lng: 127.01134  },
  { lat: 37.50902,  lng: 127.0      },
];

describe('useStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useStore.getState().reset();
  });

  it('초기 상태는 비어 있음', () => {
    const s = useStore.getState();
    expect(s.polygon).toBeNull();
    expect(s.gcps).toEqual([]);
    expect(s.userCountOverride).toBeNull();
    expect(s.drawingMode).toBe(false);
  });

  it('setPolygon이 GCP를 자동 생성', () => {
    useStore.getState().setPolygon(square);
    const s = useStore.getState();
    expect(s.polygon).toEqual(square);
    expect(s.gcps.length).toBeGreaterThanOrEqual(5);
    expect(s.drawingMode).toBe(false);
  });

  it('setUserCount가 GCP 개수 변경', () => {
    useStore.getState().setPolygon(square);
    useStore.getState().setUserCount(7);
    const s = useStore.getState();
    expect(s.gcps.length).toBe(7);
    expect(s.userCountOverride).toBe(7);
  });

  it('addGCP는 GCP 추가 및 라벨 부여', () => {
    useStore.getState().setPolygon(square);
    const before = useStore.getState().gcps.length;
    useStore.getState().addGCP(37.505, 127.005);
    const after = useStore.getState().gcps;
    expect(after.length).toBe(before + 1);
    expect(after[after.length - 1].label).toBe(`GCP-${String(after.length).padStart(2, '0')}`);
  });

  it('moveGCP는 좌표를 변경하고 다른 필드는 유지', () => {
    useStore.getState().setPolygon(square);
    const target = useStore.getState().gcps[0];
    useStore.getState().moveGCP(target.id, 37.6, 127.6);
    const after = useStore.getState().gcps.find((g) => g.id === target.id);
    expect(after).toBeDefined();
    expect(after!.lat).toBe(37.6);
    expect(after!.lng).toBe(127.6);
    expect(after!.label).toBe(target.label);
  });

  it('removeGCP는 GCP 제거 및 라벨 재번호', () => {
    useStore.getState().setPolygon(square);
    const target = useStore.getState().gcps[1];
    const beforeLen = useStore.getState().gcps.length;
    useStore.getState().removeGCP(target.id);
    const after = useStore.getState().gcps;
    expect(after.length).toBe(beforeLen - 1);
    expect(after.find((g) => g.id === target.id)).toBeUndefined();
    // 라벨 재번호
    after.forEach((g, i) => {
      expect(g.label).toBe(`GCP-${String(i + 1).padStart(2, '0')}`);
    });
  });

  it('reset은 모든 상태 초기화', () => {
    useStore.getState().setPolygon(square);
    useStore.getState().reset();
    const s = useStore.getState();
    expect(s.polygon).toBeNull();
    expect(s.gcps).toEqual([]);
    expect(s.userCountOverride).toBeNull();
    expect(s.drawingMode).toBe(false);
  });

  it('setDrawingMode toggles 상태', () => {
    useStore.getState().setDrawingMode(true);
    expect(useStore.getState().drawingMode).toBe(true);
    useStore.getState().setDrawingMode(false);
    expect(useStore.getState().drawingMode).toBe(false);
  });

  it('importFromKml(polygon만) → 자동 추천 GCP 생성', () => {
    useStore.getState().importFromKml({
      polygon: [
        { lat: 37.5,      lng: 127.0      },
        { lat: 37.5,      lng: 127.01134  },
        { lat: 37.50902,  lng: 127.01134  },
        { lat: 37.50902,  lng: 127.0      },
      ],
      gcps: [],
    });
    const s = useStore.getState();
    expect(s.polygon).toHaveLength(4);
    expect(s.gcps.length).toBeGreaterThanOrEqual(5);
    expect(s.drawingMode).toBe(false);
  });

  it('importFromKml(polygon+gcps) → KML의 GCP 그대로, 라벨 재번호', () => {
    useStore.getState().importFromKml({
      polygon: [
        { lat: 0, lng: 0 },
        { lat: 0, lng: 1 },
        { lat: 1, lng: 1 },
      ],
      gcps: [
        { lat: 0.1, lng: 0.1, label: 'Foo' },
        { lat: 0.2, lng: 0.2, label: 'Bar' },
        { lat: 0.3, lng: 0.3, label: 'Baz' },
      ],
    });
    const s = useStore.getState();
    expect(s.polygon).toHaveLength(3);
    expect(s.gcps).toHaveLength(3);
    expect(s.gcps[0].label).toBe('GCP-01');
    expect(s.gcps[1].label).toBe('GCP-02');
    expect(s.gcps[2].label).toBe('GCP-03');
    expect(s.gcps[0].lat).toBeCloseTo(0.1, 5);
    expect(s.userCountOverride).toBe(3);
  });

  it('importFromKml(gcps만, polygon=null) → polygon은 null', () => {
    useStore.getState().importFromKml({
      polygon: null,
      gcps: [{ lat: 0, lng: 0, label: 'GCP-01' }],
    });
    const s = useStore.getState();
    expect(s.polygon).toBeNull();
    expect(s.gcps).toHaveLength(1);
  });

  it('importFromKml은 기존 상태를 완전 대체', () => {
    useStore.getState().setPolygon([
      { lat: 37.5, lng: 127.0 },
      { lat: 37.5, lng: 127.01134 },
      { lat: 37.50902, lng: 127.01134 },
      { lat: 37.50902, lng: 127.0 },
    ]);
    expect(useStore.getState().gcps.length).toBeGreaterThan(0);

    useStore.getState().importFromKml({
      polygon: null,
      gcps: [{ lat: 1, lng: 1, label: 'GCP-01' }],
    });

    const s = useStore.getState();
    expect(s.polygon).toBeNull();
    expect(s.gcps).toHaveLength(1);
    expect(s.gcps[0].lat).toBe(1);
  });

  it('초기 preset은 standard', () => {
    expect(useStore.getState().preset).toBe('standard');
  });

  it('setPreset이 preset 상태 변경', () => {
    useStore.getState().setPreset('pix4d-precision');
    expect(useStore.getState().preset).toBe('pix4d-precision');
  });

  it('setPreset 후 폴리곤 있고 userCountOverride 없으면 GCP 재추천', () => {
    useStore.getState().setPolygon(square);
    const standardCount = useStore.getState().gcps.length;

    useStore.getState().setPreset('pix4d-precision');
    const precisionCount = useStore.getState().gcps.length;

    // Standard와 Pix4D Precision은 같은 면적에서 다른 권장 개수를 줘야 함.
    // square는 약 1ha 정도이므로 Standard=5, Precision=10 정도.
    expect(precisionCount).not.toBe(standardCount);
    expect(precisionCount).toBeGreaterThanOrEqual(10);
  });

  it('setPreset 후 userCountOverride 있으면 GCP 개수 유지', () => {
    useStore.getState().setPolygon(square);
    useStore.getState().setUserCount(7);
    expect(useStore.getState().gcps.length).toBe(7);

    useStore.getState().setPreset('ngii');
    // userCountOverride(7)가 살아있으므로 개수 유지
    expect(useStore.getState().gcps.length).toBe(7);
    expect(useStore.getState().preset).toBe('ngii');
  });

  it('setPreset은 localStorage에 저장', () => {
    useStore.getState().setPreset('agisoft');
    expect(localStorage.getItem('drone-gcp-preset')).toBe('agisoft');
  });

  it('reset은 preset도 standard로 초기화', () => {
    useStore.getState().setPreset('ngii');
    useStore.getState().reset();
    expect(useStore.getState().preset).toBe('standard');
  });
});
