import {
  LatLng,
  polygonBoundingBox,
  polygonDiameterMeters,
  isPointInPolygon,
  distanceMeters,
} from './geometry';

// Algorithm tuning constants
const INTERIOR_MIN_DIST_FRACTION = 0.15;  // fraction of polygon diameter
const MIN_GRID_SIZE = 6;
const GRID_DENSITY_FACTOR = 4;             // gridSize = max(MIN_GRID_SIZE, ceil(sqrt(n) * GRID_DENSITY_FACTOR))
const MAX_GRID_SIZE = 50;
const DISTANCE_DECAY = 0.7;
const DISTANCE_FLOOR_M = 0.5;
const MAX_RELAX_ATTEMPTS = 10;

export type GCP = { id: string; lat: number; lng: number; label: string };

export function recommendCount(areaHa: number): number {
  if (areaHa <= 0) return 0;
  return Math.max(5, Math.ceil(areaHa / 10) + 4);
}

function makeId(): string {
  return crypto.randomUUID();
}

function labelOf(index: number): string {
  return `GCP-${String(index + 1).padStart(2, '0')}`;
}

/** Greedy farthest-first: seeded with one endpoint of the longest pairwise edge for determinism */
function pickFarthestCorners(coords: LatLng[], n: number): LatLng[] {
  if (coords.length <= n) return [...coords];
  // Seed with one endpoint of the longest pairwise distance
  let seedIdx = 0;
  let maxDist = -1;
  for (let i = 0; i < coords.length; i++) {
    for (let j = i + 1; j < coords.length; j++) {
      const d = distanceMeters(coords[i], coords[j]);
      if (d > maxDist) {
        maxDist = d;
        seedIdx = i;
      }
    }
  }
  const pickedIndices = new Set<number>([seedIdx]);
  const picked: LatLng[] = [coords[seedIdx]];
  while (picked.length < n) {
    let bestIdx = -1;
    let bestDist = -1;
    for (let i = 0; i < coords.length; i++) {
      if (pickedIndices.has(i)) continue;
      const minDist = Math.min(...picked.map((p) => distanceMeters(coords[i], p)));
      if (minDist > bestDist) {
        bestDist = minDist;
        bestIdx = i;
      }
    }
    if (bestIdx === -1) break;
    pickedIndices.add(bestIdx);
    picked.push(coords[bestIdx]);
  }
  return picked;
}

/** 변 길이에 비례하여 각 변 위에 점 분배 (중점, 1/3, 2/3 식으로) */
function pickEdgePoints(coords: LatLng[], n: number): LatLng[] {
  if (n <= 0 || coords.length < 2) return [];
  const edges = coords.map((c, i) => ({
    a: c,
    b: coords[(i + 1) % coords.length],
    len: distanceMeters(c, coords[(i + 1) % coords.length]),
  }));
  const totalLen = edges.reduce((s, e) => s + e.len, 0);
  if (totalLen === 0) return [];

  const allocations = edges.map((e) => Math.round((e.len / totalLen) * n));
  // 합계 보정
  let diff = n - allocations.reduce((s, a) => s + a, 0);
  for (let i = 0; diff !== 0 && i < edges.length; i++) {
    const j = diff > 0 ? i : edges.length - 1 - i;
    allocations[j] += Math.sign(diff);
    diff -= Math.sign(diff);
  }

  const result: LatLng[] = [];
  edges.forEach((e, idx) => {
    const k = Math.max(0, allocations[idx]);
    for (let i = 1; i <= k; i++) {
      const t = i / (k + 1);
      result.push({
        lat: e.a.lat + (e.b.lat - e.a.lat) * t,
        lng: e.a.lng + (e.b.lng - e.a.lng) * t,
      });
    }
  });
  return result.slice(0, n);
}

/** 폴리곤 내부 grid 후보 → 기존 점과 minDistance 이상 떨어진 점 선택 */
function pickInteriorPoints(
  coords: LatLng[],
  existing: LatLng[],
  n: number,
): LatLng[] {
  if (n <= 0) return [];
  const bbox = polygonBoundingBox(coords);
  if (!bbox) return [];

  const diameter = polygonDiameterMeters(coords);
  let minDistance = diameter * INTERIOR_MIN_DIST_FRACTION;
  const gridSize = Math.min(
    MAX_GRID_SIZE,
    Math.max(MIN_GRID_SIZE, Math.ceil(Math.sqrt(n) * GRID_DENSITY_FACTOR)),
  );

  const candidates: LatLng[] = [];
  for (let i = 1; i < gridSize; i++) {
    for (let j = 1; j < gridSize; j++) {
      const lat = bbox.minLat + ((bbox.maxLat - bbox.minLat) * i) / gridSize;
      const lng = bbox.minLng + ((bbox.maxLng - bbox.minLng) * j) / gridSize;
      const p = { lat, lng };
      if (isPointInPolygon(p, coords)) candidates.push(p);
    }
  }

  const picked: LatLng[] = [];
  // 거리 임계 점진 감소
  for (let attempt = 0; attempt < MAX_RELAX_ATTEMPTS && picked.length < n; attempt++) {
    for (const c of candidates) {
      if (picked.length >= n) break;
      const all = [...existing, ...picked];
      const ok = all.every((p) => distanceMeters(c, p) >= minDistance);
      if (ok) picked.push(c);
    }
    if (picked.length < n) minDistance *= DISTANCE_DECAY;
    if (minDistance < DISTANCE_FLOOR_M) break;
  }
  return picked.slice(0, n);
}

export function generateGCPs(polygon: LatLng[], count: number): GCP[] {
  if (polygon.length < 3 || count <= 0) return [];

  const cornerCount = Math.min(4, polygon.length, count);
  const corners = pickFarthestCorners(polygon, cornerCount);
  const remaining = count - corners.length;

  // Allocate ~1/3 of the remaining budget to edges, rest to interior.
  const edgeCount = Math.floor(remaining / 3);
  const edges = pickEdgePoints(polygon, edgeCount);

  const interiorCount = remaining - edges.length;
  const interior = pickInteriorPoints(polygon, [...corners, ...edges], interiorCount);

  const all = [...corners, ...edges, ...interior];
  return all.slice(0, count).map((p, i) => ({
    id: makeId(),
    lat: p.lat,
    lng: p.lng,
    label: labelOf(i),
  }));
}
