import { create } from 'zustand';
import { LatLng, polygonAreaHa } from './geometry';
import { GCP, generateGCPs, recommendCount } from './gcp-algorithm';

type State = {
  polygon: LatLng[] | null;
  gcps: GCP[];
  userCountOverride: number | null;
  drawingMode: boolean;
};

type Actions = {
  setDrawingMode: (mode: boolean) => void;
  setPolygon: (coords: LatLng[]) => void;
  setUserCount: (n: number) => void;
  regenerate: () => void;
  addGCP: (lat: number, lng: number) => void;
  moveGCP: (id: string, lat: number, lng: number) => void;
  removeGCP: (id: string) => void;
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

  setDrawingMode: (mode) => set({ drawingMode: mode }),

  setPolygon: (coords) => {
    const area = polygonAreaHa(coords);
    const recommended = recommendCount(area);
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
    const { polygon, userCountOverride } = get();
    if (!polygon) return;
    const area = polygonAreaHa(polygon);
    const count = userCountOverride ?? recommendCount(area);
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

  reset: () =>
    set({ polygon: null, gcps: [], userCountOverride: null, drawingMode: false }),
}));

// Derived hooks
export const useArea = () => {
  const polygon = useStore((s) => s.polygon);
  return polygon ? polygonAreaHa(polygon) : 0;
};

export const useRecommendedCount = () => {
  const area = useArea();
  return recommendCount(area);
};
