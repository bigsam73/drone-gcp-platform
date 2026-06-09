import { create } from 'zustand';
import { LatLng, polygonAreaHa } from './geometry';
import { GCP, generateGCPs, recommendCount } from './gcp-algorithm';
import {
  type RecommendationPresetId,
  DEFAULT_PRESET_ID,
} from './recommendation-presets';

type State = {
  polygon: LatLng[] | null;
  gcps: GCP[];
  userCountOverride: number | null;
  drawingMode: boolean;
  preset: RecommendationPresetId;
};

type Actions = {
  setDrawingMode: (mode: boolean) => void;
  setPolygon: (coords: LatLng[]) => void;
  setUserCount: (n: number) => void;
  regenerate: () => void;
  addGCP: (lat: number, lng: number) => void;
  moveGCP: (id: string, lat: number, lng: number) => void;
  removeGCP: (id: string) => void;
  setPreset: (id: RecommendationPresetId) => void;
  importFromKml: (data: {
    polygon: LatLng[] | null;
    gcps: { lat: number; lng: number; label: string }[];
  }) => void;
  reset: () => void;
};

const labelOf = (i: number) => `GCP-${String(i + 1).padStart(2, '0')}`;

const relabel = (gcps: GCP[]): GCP[] =>
  gcps.map((g, i) => ({ ...g, label: labelOf(i) }));

export const useStore = create<State & Actions>((set, get) => ({
  polygon: null,
  gcps: [],
  userCountOverride: null,
  drawingMode: false,
  preset: DEFAULT_PRESET_ID,

  setDrawingMode: (mode) => set({ drawingMode: mode }),

  setPolygon: (coords) => {
    const area = polygonAreaHa(coords);
    const recommended = recommendCount(area, get().preset);
    const gcps = generateGCPs(coords, recommended);
    set({ polygon: coords, gcps, userCountOverride: null, drawingMode: false });
  },

  setUserCount: (n) => {
    const { polygon } = get();
    if (!polygon) return;
    const gcps = generateGCPs(polygon, n);
    set({ userCountOverride: n, gcps });
  },

  regenerate: () => {
    const { polygon, userCountOverride, preset } = get();
    if (!polygon) return;
    const area = polygonAreaHa(polygon);
    const count = userCountOverride ?? recommendCount(area, preset);
    set({ gcps: generateGCPs(polygon, count) });
  },

  addGCP: (lat, lng) => {
    const { gcps } = get();
    const id = crypto.randomUUID();
    const label = labelOf(gcps.length);
    set({ gcps: [...gcps, { id, lat, lng, label }] });
  },

  moveGCP: (id, lat, lng) =>
    set({ gcps: get().gcps.map((g) => (g.id === id ? { ...g, lat, lng } : g)) }),

  removeGCP: (id) =>
    set({ gcps: relabel(get().gcps.filter((g) => g.id !== id)) }),

  setPreset: (id) => {
    set({ preset: id });

    // localStorage 저장 (Safari private mode 등 대비 try/catch)
    try {
      localStorage.setItem('drone-gcp-preset', id);
    } catch {
      // ignore
    }

    // 폴리곤 있고 userCountOverride 없으면 새 preset으로 재추천
    const { polygon, userCountOverride } = get();
    if (polygon && userCountOverride === null) {
      const area = polygonAreaHa(polygon);
      const recommended = recommendCount(area, id);
      set({ gcps: generateGCPs(polygon, recommended) });
    }
  },

  importFromKml: (data) => {
    if (data.polygon && data.gcps.length > 0) {
      // 폴리곤 + GCP 모두 KML에서 가져옴 → 라벨 재번호, 자동 추천 없음
      const gcps: GCP[] = data.gcps.map((g, i) => ({
        id: crypto.randomUUID(),
        lat: g.lat,
        lng: g.lng,
        label: labelOf(i),
      }));
      set({
        polygon: data.polygon,
        gcps,
        userCountOverride: gcps.length,
        drawingMode: false,
      });
      return;
    }
    if (data.polygon) {
      // 폴리곤만 → setPolygon과 동일 (자동 추천)
      const area = polygonAreaHa(data.polygon);
      const recommended = recommendCount(area, get().preset);
      const gcps = generateGCPs(data.polygon, recommended);
      set({
        polygon: data.polygon,
        gcps,
        userCountOverride: null,
        drawingMode: false,
      });
      return;
    }
    // GCP만 (polygon === null)
    const gcps: GCP[] = data.gcps.map((g, i) => ({
      id: crypto.randomUUID(),
      lat: g.lat,
      lng: g.lng,
      label: labelOf(i),
    }));
    set({ polygon: null, gcps, userCountOverride: null, drawingMode: false });
  },

  reset: () =>
    set({
      polygon: null,
      gcps: [],
      userCountOverride: null,
      drawingMode: false,
      preset: DEFAULT_PRESET_ID,
    }),
}));

// Derived hooks
export const useArea = () => {
  const polygon = useStore((s) => s.polygon);
  return polygon ? polygonAreaHa(polygon) : 0;
};

export const useRecommendedCount = () => {
  const area = useArea();
  const preset = useStore((s) => s.preset);
  return recommendCount(area, preset);
};
