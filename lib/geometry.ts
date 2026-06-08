import * as turf from '@turf/turf';

export type LatLng = { lat: number; lng: number };

const toPosition = (p: LatLng): [number, number] => [p.lng, p.lat];

function toTurfPolygon(coords: LatLng[]) {
  if (coords.length < 3) return null;
  const ring = coords.map(toPosition);
  ring.push(ring[0]);
  return turf.polygon([ring]);
}

export function polygonAreaHa(coords: LatLng[]): number {
  const poly = toTurfPolygon(coords);
  if (!poly) return 0;
  const sqm = turf.area(poly);
  return sqm / 10000;
}

export function isPointInPolygon(point: LatLng, coords: LatLng[]): boolean {
  const poly = toTurfPolygon(coords);
  if (!poly) return false;
  return turf.booleanPointInPolygon(turf.point(toPosition(point)), poly);
}

export function distanceMeters(a: LatLng, b: LatLng): number {
  return turf.distance(
    turf.point(toPosition(a)),
    turf.point(toPosition(b)),
    { units: 'meters' },
  );
}

export function polygonDiameterMeters(coords: LatLng[]): number {
  if (coords.length < 2) return 0;
  let max = 0;
  for (let i = 0; i < coords.length; i++) {
    for (let j = i + 1; j < coords.length; j++) {
      const d = turf.distance(
        turf.point(toPosition(coords[i])),
        turf.point(toPosition(coords[j])),
        { units: 'meters' },
      );
      if (d > max) max = d;
    }
  }
  return max;
}

export function polygonCentroid(coords: LatLng[]): LatLng | null {
  const poly = toTurfPolygon(coords);
  if (!poly) return null;
  const c = turf.centroid(poly).geometry.coordinates;
  return { lat: c[1], lng: c[0] };
}

export type BoundingBox = {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
};

export function polygonBoundingBox(coords: LatLng[]): BoundingBox | null {
  const poly = toTurfPolygon(coords);
  if (!poly) return null;
  const [minLng, minLat, maxLng, maxLat] = turf.bbox(poly);
  return { minLat, maxLat, minLng, maxLng };
}
