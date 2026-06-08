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
});
