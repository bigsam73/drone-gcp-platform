import {
  LatLng,
  polygonBoundingBox,
  polygonDiameterMeters,
  isPointInPolygon,
} from './geometry';
import * as turf from '@turf/turf';

export type GCP = { id: string; lat: number; lng: number; label: string };

export function recommendCount(areaHa: number): number {
  if (areaHa <= 0) return 0;
  return Math.max(5, Math.ceil(areaHa / 10) + 4);
}

function makeId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

function labelOf(index: number): string {
  return `GCP-${String(index + 1).padStart(2, '0')}`;
}

function distanceMeters(a: LatLng, b: LatLng): number {
  return turf.distance(turf.point([a.lng, a.lat]), turf.point([b.lng, b.lat]), {
    units: 'meters',
  });
}

/** Greedy farthest-first: 첫 점에서 시작, 매번 기존 picked로부터 최소거리가 최대인 점 추가 */
function pickFarthestCorners(coords: LatLng[], n: number): LatLng[] {
  if (coords.length <= n) return [...coords];
  const picked: LatLng[] = [coords[0]];
  while (picked.length < n) {
    let best: LatLng | null = null;
    let bestDist = -1;
    for (const c of coords) {
      if (picked.includes(c)) continue;
      const minDist = Math.min(...picked.map((p) => distanceMeters(c, p)));
      if (minDist > bestDist) {
        bestDist = minDist;
        best = c;
      }
    }
    if (!best) break;
    picked.push(best);
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
  let minDistance = diameter * 0.15;
  const gridSize = Math.max(6, Math.ceil(Math.sqrt(n) * 4));

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
  for (let attempt = 0; attempt < 10 && picked.length < n; attempt++) {
    for (const c of candidates) {
      if (picked.length >= n) break;
      const all = [...existing, ...picked];
      const ok = all.every((p) => distanceMeters(c, p) >= minDistance);
      if (ok) picked.push(c);
    }
    if (picked.length < n) minDistance *= 0.7;
    if (minDistance < 0.5) break;
  }
  return picked.slice(0, n);
}

export function generateGCPs(polygon: LatLng[], count: number): GCP[] {
  if (polygon.length < 3 || count <= 0) return [];

  const cornerCount = Math.min(4, polygon.length, count);
  const corners = pickFarthestCorners(polygon, cornerCount);
  const remaining = count - corners.length;

  const edgeCount = Math.min(remaining, Math.floor(remaining / 3));
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
