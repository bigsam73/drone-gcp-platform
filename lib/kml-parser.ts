export type ParsedKml = {
  polygon: { lat: number; lng: number }[] | null;
  gcps: { lat: number; lng: number; label: string }[];
};

export type KmlParseError = 'invalid-xml' | 'not-kml' | 'empty' | 'too-large';

export type ParseResult =
  | { ok: true; data: ParsedKml }
  | { ok: false; error: KmlParseError; message: string };

const MAX_KML_SIZE = 5 * 1024 * 1024;

const labelOf = (i: number) => `GCP-${String(i + 1).padStart(2, '0')}`;

/** "lng,lat[,alt]" 한 항목을 파싱. 실패 시 null. */
function parseCoordPair(token: string): { lat: number; lng: number } | null {
  const parts = token.trim().split(',');
  if (parts.length < 2) return null;
  const lng = parseFloat(parts[0]);
  const lat = parseFloat(parts[1]);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  return { lat, lng };
}

/** coordinates 텍스트를 LatLng 배열로 변환 */
function parseCoordList(text: string): { lat: number; lng: number }[] {
  return text
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map(parseCoordPair)
    .filter((p): p is { lat: number; lng: number } => p !== null);
}

export function parseKml(content: string): ParseResult {
  if (content.length > MAX_KML_SIZE) {
    return { ok: false, error: 'too-large', message: '파일이 너무 큽니다 (5MB 이내).' };
  }

  if (!content.trim()) {
    return { ok: false, error: 'invalid-xml', message: '빈 파일입니다.' };
  }

  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(content, 'application/xml');
  } catch {
    return { ok: false, error: 'invalid-xml', message: 'XML 파싱 실패.' };
  }

  if (doc.querySelector('parsererror')) {
    return { ok: false, error: 'invalid-xml', message: '잘못된 XML 형식입니다.' };
  }

  const root = doc.documentElement;
  if (!root || root.localName.toLowerCase() !== 'kml') {
    return { ok: false, error: 'not-kml', message: 'KML 파일이 아닙니다.' };
  }

  let polygon: { lat: number; lng: number }[] | null = null;
  const gcps: { lat: number; lng: number; label: string }[] = [];

  const placemarks = root.getElementsByTagName('Placemark');
  for (const pm of Array.from(placemarks)) {
    // Polygon (첫 번째만 사용)
    if (!polygon) {
      const coordsEl = pm.querySelector('Polygon outerBoundaryIs LinearRing coordinates');
      if (coordsEl?.textContent) {
        const ring = parseCoordList(coordsEl.textContent);
        if (ring.length >= 3) {
          // 마지막 점이 첫 점과 같으면 (LinearRing 닫힘) 마지막 제거
          const last = ring[ring.length - 1];
          const first = ring[0];
          const closed =
            Math.abs(last.lat - first.lat) < 1e-9 && Math.abs(last.lng - first.lng) < 1e-9;
          polygon = closed ? ring.slice(0, -1) : ring;
          if (polygon.length < 3) polygon = null;
        }
      }
    }

    // Point
    const pointEl = pm.querySelector('Point > coordinates');
    if (pointEl?.textContent) {
      const p = parseCoordPair(pointEl.textContent);
      if (p) {
        gcps.push({ ...p, label: labelOf(gcps.length) });
      }
    }
  }

  if (!polygon && gcps.length === 0) {
    return { ok: false, error: 'empty', message: 'Polygon이나 Point가 없습니다.' };
  }

  return { ok: true, data: { polygon, gcps } };
}
