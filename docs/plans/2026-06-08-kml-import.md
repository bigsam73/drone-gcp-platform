# KML Import Feature Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 사용자가 KML 파일을 업로드해 폴리곤 구역과 GCP 마커를 한 번에 복원할 수 있는 기능을 추가한다.

**Architecture:** DOMParser로 KML XML을 파싱하는 순수 함수를 `lib/kml-parser.ts`에 분리하고 TDD로 검증한다. 스토어에 `importFromKml` 액션을 추가해 폴리곤·GCP를 일괄 교체한다. 헤더에 KmlImportButton을 마운트해 파일 선택과 결과 메시지를 표시한다. MapContainer는 폴리곤이 새로 들어오면 한 줄짜리 panTo로 지도 중심을 옮긴다.

**Tech Stack:** Next.js 16, React 19, TypeScript, DOMParser (브라우저 내장), FileReader, Zustand, Vitest

---

## Task 1: KML 파서 (TDD)

**Files:**
- Create: `lib/kml-parser.ts`
- Create: `lib/__tests__/kml-parser.test.ts`

**Step 1: 실패하는 테스트 작성**

`lib/__tests__/kml-parser.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseKml } from '../kml-parser';

const OUR_KML = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Drone Mapping GCP Plan</name>
    <Placemark>
      <name>Mapping Area</name>
      <Polygon>
        <outerBoundaryIs><LinearRing><coordinates>
          127.000000,37.500000,0 127.001134,37.500000,0 127.001134,37.500902,0 127.000000,37.500902,0 127.000000,37.500000,0
        </coordinates></LinearRing></outerBoundaryIs>
      </Polygon>
    </Placemark>
    <Placemark>
      <name>GCP-01</name>
      <Point><coordinates>127.000000,37.500000,0</coordinates></Point>
    </Placemark>
    <Placemark>
      <name>GCP-02</name>
      <Point><coordinates>127.001134,37.500902,0</coordinates></Point>
    </Placemark>
  </Document>
</kml>`;

describe('parseKml — success cases', () => {
  it('우리가 생성한 KML을 round-trip으로 복원', () => {
    const r = parseKml(OUR_KML);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.polygon).toHaveLength(4);
    expect(r.data.polygon![0]).toEqual({ lat: 37.5, lng: 127.0 });
    expect(r.data.gcps).toHaveLength(2);
    expect(r.data.gcps[0].lat).toBeCloseTo(37.5, 5);
    expect(r.data.gcps[0].lng).toBeCloseTo(127.0, 5);
    expect(r.data.gcps[0].label).toBe('GCP-01');
    expect(r.data.gcps[1].label).toBe('GCP-02');
  });

  it('Polygon만 있는 KML', () => {
    const kml = `<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>
      <Placemark><Polygon><outerBoundaryIs><LinearRing><coordinates>
        127,37,0 128,37,0 128,38,0 127,37,0
      </coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>
    </Document></kml>`;
    const r = parseKml(kml);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.polygon).not.toBeNull();
    expect(r.data.polygon).toHaveLength(3);
    expect(r.data.gcps).toEqual([]);
  });

  it('Point만 있는 KML', () => {
    const kml = `<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>
      <Placemark><name>foo</name><Point><coordinates>127.1,37.5</coordinates></Point></Placemark>
      <Placemark><name>bar</name><Point><coordinates>127.2,37.6</coordinates></Point></Placemark>
    </Document></kml>`;
    const r = parseKml(kml);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.polygon).toBeNull();
    expect(r.data.gcps).toHaveLength(2);
    // 모두 GCP-01, GCP-02로 재번호
    expect(r.data.gcps[0].label).toBe('GCP-01');
    expect(r.data.gcps[1].label).toBe('GCP-02');
  });

  it('coordinates에 줄바꿈/탭/다중 공백 혼재 처리', () => {
    const kml = `<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>
      <Placemark><Polygon><outerBoundaryIs><LinearRing><coordinates>
        127,37,0
        \t128,37,0   128,38,0
        127,37,0
      </coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>
    </Document></kml>`;
    const r = parseKml(kml);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.polygon).toHaveLength(3);
  });

  it('고도값 없어도 처리', () => {
    const kml = `<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>
      <Placemark><Point><coordinates>127.1,37.5</coordinates></Point></Placemark>
    </Document></kml>`;
    const r = parseKml(kml);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.gcps[0]).toEqual({ lat: 37.5, lng: 127.1, label: 'GCP-01' });
  });

  it('다중 Polygon은 첫 번째만 사용', () => {
    const kml = `<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>
      <Placemark><Polygon><outerBoundaryIs><LinearRing><coordinates>
        127,37,0 128,37,0 128,38,0 127,37,0
      </coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>
      <Placemark><Polygon><outerBoundaryIs><LinearRing><coordinates>
        125,35,0 126,35,0 126,36,0 125,35,0
      </coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>
    </Document></kml>`;
    const r = parseKml(kml);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.polygon![0]).toEqual({ lat: 37, lng: 127 });
  });
});

describe('parseKml — error cases', () => {
  it('잘못된 XML은 invalid-xml', () => {
    const r = parseKml('<not valid xml');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe('invalid-xml');
  });

  it('KML 루트가 아니면 not-kml', () => {
    const r = parseKml('<?xml version="1.0"?><gpx><wpt lat="37" lon="127"/></gpx>');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe('not-kml');
  });

  it('Polygon, Point 둘 다 없으면 empty', () => {
    const kml = `<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>x</name></Document></kml>`;
    const r = parseKml(kml);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe('empty');
  });

  it('5MB 초과는 too-large', () => {
    const r = parseKml('x'.repeat(5 * 1024 * 1024 + 1));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe('too-large');
  });

  it('좌표 < 3개인 Polygon은 polygon=null로', () => {
    const kml = `<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>
      <Placemark><Polygon><outerBoundaryIs><LinearRing><coordinates>
        127,37,0 128,38,0
      </coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>
      <Placemark><Point><coordinates>127,37</coordinates></Point></Placemark>
    </Document></kml>`;
    const r = parseKml(kml);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.polygon).toBeNull();
    expect(r.data.gcps).toHaveLength(1);
  });

  it('NaN 좌표는 스킵', () => {
    const kml = `<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>
      <Placemark><Point><coordinates>abc,xyz</coordinates></Point></Placemark>
      <Placemark><Point><coordinates>127.1,37.5</coordinates></Point></Placemark>
    </Document></kml>`;
    const r = parseKml(kml);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.gcps).toHaveLength(1);
    expect(r.data.gcps[0].label).toBe('GCP-01');
  });
});
```

**Step 2: 실패 확인**

```bash
cd /Users/psy/Projects/drone-gcp-platform && npm test
```

Expected: FAIL — 모듈 없음.

**Step 3: 구현**

`lib/kml-parser.ts`:

```ts
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
```

**Step 4: 테스트 통과 확인**

```bash
cd /Users/psy/Projects/drone-gcp-platform && npm test
```

Expected: ALL pass. 기존 52개 + 신규 12개 = 64개.

**Step 5: typecheck 확인**

```bash
cd /Users/psy/Projects/drone-gcp-platform && npm run typecheck
```

Expected: clean.

**Step 6: 커밋**

```bash
cd /Users/psy/Projects/drone-gcp-platform
git add lib/kml-parser.ts lib/__tests__/kml-parser.test.ts
git commit -m "feat(kml): parser with DOMParser and TDD"
```

---

## Task 2: 스토어에 importFromKml 액션 추가 (TDD)

**Files:**
- Modify: `lib/store.ts`
- Modify: `lib/__tests__/store.test.ts`

**Step 1: 실패하는 테스트 추가**

`lib/__tests__/store.test.ts`의 기존 `describe('useStore', ...)` 블록 끝에 다음 it 블록을 추가:

```ts
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
    // 먼저 기존 데이터 설정
    useStore.getState().setPolygon([
      { lat: 37.5, lng: 127.0 },
      { lat: 37.5, lng: 127.01134 },
      { lat: 37.50902, lng: 127.01134 },
      { lat: 37.50902, lng: 127.0 },
    ]);
    expect(useStore.getState().gcps.length).toBeGreaterThan(0);

    // 그다음 import
    useStore.getState().importFromKml({
      polygon: null,
      gcps: [{ lat: 1, lng: 1, label: 'GCP-01' }],
    });

    const s = useStore.getState();
    expect(s.polygon).toBeNull();
    expect(s.gcps).toHaveLength(1);
    expect(s.gcps[0].lat).toBe(1);
  });
```

**Step 2: 실패 확인**

```bash
cd /Users/psy/Projects/drone-gcp-platform && npm test
```

Expected: FAIL — `importFromKml is not a function`.

**Step 3: store.ts에 importFromKml 추가**

기존 `lib/store.ts`의 `Actions` 타입에 추가:

```ts
type Actions = {
  setDrawingMode: (mode: boolean) => void;
  setPolygon: (coords: LatLng[]) => void;
  setUserCount: (n: number) => void;
  regenerate: () => void;
  addGCP: (lat: number, lng: number) => void;
  moveGCP: (id: string, lat: number, lng: number) => void;
  removeGCP: (id: string) => void;
  importFromKml: (data: {
    polygon: LatLng[] | null;
    gcps: { lat: number; lng: number; label: string }[];
  }) => void;
  reset: () => void;
};
```

`create<State & Actions>((set, get) => ({...}))`의 actions 블록 안 (reset 위)에 추가:

```ts
  importFromKml: (data) => {
    if (data.polygon && data.gcps.length > 0) {
      // 폴리곤 + GCP 모두 KML에서 가져옴 → 라벨 재번호
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
      // 폴리곤만 → 기존 setPolygon 동작과 동일 (자동 추천)
      const area = polygonAreaHa(data.polygon);
      const recommended = recommendCount(area);
      const gcps = generateGCPs(data.polygon, recommended);
      set({
        polygon: data.polygon,
        gcps,
        userCountOverride: null,
        drawingMode: false,
      });
      return;
    }
    // GCP만
    const gcps: GCP[] = data.gcps.map((g, i) => ({
      id: crypto.randomUUID(),
      lat: g.lat,
      lng: g.lng,
      label: labelOf(i),
    }));
    set({ polygon: null, gcps, userCountOverride: null, drawingMode: false });
  },
```

**Step 4: 테스트 통과 확인**

```bash
cd /Users/psy/Projects/drone-gcp-platform && npm test
```

Expected: ALL pass. 64 + 4 = 68개.

**Step 5: typecheck + lint 확인**

```bash
cd /Users/psy/Projects/drone-gcp-platform && npm run typecheck && npm run lint
```

Expected: clean.

**Step 6: 커밋**

```bash
cd /Users/psy/Projects/drone-gcp-platform
git add lib/store.ts lib/__tests__/store.test.ts
git commit -m "feat(store): importFromKml action for KML restore"
```

---

## Task 3: KmlImportButton 컴포넌트 + Header 통합

**Files:**
- Create: `components/KmlImportButton.tsx`
- Modify: `components/Header.tsx`

**Step 1: KmlImportButton 작성**

`components/KmlImportButton.tsx`:

```tsx
'use client';

import { useRef, useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { parseKml } from '@/lib/kml-parser';
import { useStore } from '@/lib/store';

type Status =
  | { kind: 'idle' }
  | { kind: 'success'; message: string }
  | { kind: 'error'; message: string };

const STATUS_TIMEOUT_MS = 5000;

export default function KmlImportButton() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const importFromKml = useStore((s) => s.importFromKml);

  // 5초 후 자동 초기화
  useEffect(() => {
    if (status.kind === 'idle') return;
    const timer = setTimeout(() => setStatus({ kind: 'idle' }), STATUS_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [status]);

  const handleClick = () => {
    inputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // 같은 파일을 다시 선택할 수 있도록 input value 리셋
    e.target.value = '';

    try {
      const content = await file.text();
      const result = parseKml(content);
      if (!result.ok) {
        setStatus({ kind: 'error', message: result.message });
        return;
      }
      importFromKml(result.data);
      const polyMsg = result.data.polygon ? '구역 1' : '구역 없음';
      const gcpMsg = `GCP ${result.data.gcps.length}개`;
      setStatus({
        kind: 'success',
        message: `불러왔습니다 (${polyMsg}, ${gcpMsg}).`,
      });
    } catch {
      setStatus({ kind: 'error', message: '파일을 읽을 수 없습니다.' });
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".kml,application/vnd.google-earth.kml+xml"
        onChange={handleFileChange}
        className="hidden"
      />
      <div className="flex flex-col items-end gap-1">
        <Button variant="outline" onClick={handleClick}>
          KML 불러오기
        </Button>
        {status.kind !== 'idle' && (
          <p
            className={`text-xs ${
              status.kind === 'success' ? 'text-green-700' : 'text-red-600'
            }`}
          >
            {status.message}
          </p>
        )}
      </div>
    </>
  );
}
```

**Step 2: Header에 마운트**

`components/Header.tsx`를 읽고 현재 구조 확인. 그다음 KmlImportButton을 KML 다운로드 버튼 왼쪽에 추가.

`components/Header.tsx`의 import에 추가:
```tsx
import KmlImportButton from './KmlImportButton';
```

JSX에서 KML 다운로드 버튼을 감싸는 우측 영역을 다음 형태로 변경:

기존(예시):
```tsx
<header className="...">
  <h1>...</h1>
  <Button onClick={onDownload} disabled={...}>KML 다운로드</Button>
</header>
```

변경:
```tsx
<header className="...">
  <h1>...</h1>
  <div className="flex items-start gap-2">
    <KmlImportButton />
    <Button onClick={onDownload} disabled={...}>KML 다운로드</Button>
  </div>
</header>
```

(정확한 className은 기존 헤더 코드를 보고 어울리게 유지)

**Step 3: 검증**

```bash
cd /Users/psy/Projects/drone-gcp-platform
npm run typecheck
npm test
npm run lint
npm run build
```

모두 통과. 테스트 카운트 68 유지 (새 컴포넌트는 통합 수동 검증).

**Step 4: 커밋**

```bash
cd /Users/psy/Projects/drone-gcp-platform
git add components/KmlImportButton.tsx components/Header.tsx
git commit -m "feat(kml): KmlImportButton in header with status message"
```

---

## Task 4: 지도 자동 이동 + 최종 검증 + README

**Files:**
- Modify: `components/MapContainer.tsx`
- Modify: `README.md`

**Step 1: MapContainer의 polygon sync useEffect에 panTo 추가**

`components/MapContainer.tsx`를 읽고 polygon 동기화 useEffect를 찾는다 (코멘트 `// 3) polygon sync` 또는 비슷한 위치).

기존 마지막에 폴리곤을 새로 그리고 `polygonRef.current = poly;` 직후, 카카오 Map의 panTo로 폴리곤 중심으로 이동을 추가.

먼저 `lib/geometry.ts`에 이미 있는 `polygonCentroid` import 확인. 없으면 추가:

```ts
import { polygonCentroid } from '@/lib/geometry';
```

(기존 import 라인을 보고 합치기)

polygon sync useEffect의 마지막에 추가:

```ts
    // 새 폴리곤이 들어오면 그 중심으로 지도 이동
    const centroid = polygonCentroid(polygon);
    if (centroid && mapRef.current) {
      const center = new kakao.maps.LatLng(centroid.lat, centroid.lng);
      mapRef.current.setCenter(center);
      if (mapRef.current.getLevel() > 5) mapRef.current.setLevel(5);
    }
```

위치는 `polygonRef.current = poly;` 바로 다음.

`kakao.maps.LatLng` 클래스 참조를 위해 `const kakao = window.kakao;`가 같은 effect 안에 이미 있는지 확인. 있을 것임 (현재 코드에서 polygon 생성 시 사용 중).

**Step 2: 검증**

```bash
cd /Users/psy/Projects/drone-gcp-platform
npm run typecheck
npm test
npm run lint
npm run build
```

모두 통과.

**Step 3: README 업데이트**

`README.md`의 사용법 섹션을 찾는다. 현재 형태:

```markdown
## 사용법

1. 지도 상단 검색바에서 주소 또는 장소(...) 입력 → 결과 클릭으로 현장 위치 찾기
2. 사이드바에서 "구역 그리기" 시작
3. 지도에서 다각형 꼭짓점 클릭, 마지막 점 더블클릭으로 완료
4. GCP 자동 추천됨. 슬라이더로 개수 조정 가능
5. GCP 마커 드래그(이동), 우클릭(삭제), 지도 빈 곳 클릭(추가 — 폴리곤 외부도 가능)
6. 헤더의 "KML 다운로드"
```

1번 다음에 KML 불러오기 옵션 추가, 나머지 번호 조정:

```markdown
## 사용법

1. 지도 상단 검색바에서 주소 또는 장소(예: "삼성동", "스타벅스 강남역", "강남대로 396") 입력 → 결과 클릭으로 현장 위치 찾기
2. (선택) 헤더의 **"KML 불러오기"**로 기존 KML 파일을 업로드해 구역·GCP 복원
3. 사이드바에서 "구역 그리기" 시작
4. 지도에서 다각형 꼭짓점 클릭, 마지막 점 더블클릭으로 완료
5. GCP 자동 추천됨. 슬라이더로 개수 조정 가능
6. GCP 마커 드래그(이동), 우클릭(삭제), 지도 빈 곳 클릭(추가 — 폴리곤 외부도 가능)
7. 헤더의 "KML 다운로드"
```

수동 검증 체크리스트 섹션 끝에 KML 불러오기 검증 단계 추가:

기존 마지막 항목 ("KML 다운로드 → ...") 다음에:
```markdown
14. **KML 불러오기** → 방금 다운로드한 KML을 다시 불러오기 → 폴리곤과 GCP가 그대로 복원되는지 확인
15. 외부 KML(Point만 있거나 Polygon만 있는 파일) 불러오기 → 해당 데이터만 채워지는지 확인
16. 잘못된 파일(예: .txt) 업로드 → 빨간색 에러 메시지 표시
```

트러블슈팅 섹션 끝에 KML 관련 추가:
```markdown
- **KML 불러오기 실패 "KML 파일이 아닙니다"**: 루트 태그가 `<kml>`이 아니거나 다른 포맷(GPX 등). KML 파일인지 확인.
- **KML 불러오기 실패 "Polygon이나 Point가 없습니다"**: KML에 매핑 구역이나 GCP에 해당하는 요소가 없음. Document 내부에 Placemark가 있는지 확인.
- **불러온 후 지도가 안 움직임**: 폴리곤이 화면 밖에 있을 수 있음. 폴리곤 중심으로 자동 이동하지만 매우 멀리 있는 경우 직접 검색해서 가까이 이동 후 다시 불러오기.
```

**Step 4: 최종 검증 풀 스윕**

```bash
cd /Users/psy/Projects/drone-gcp-platform
npm run typecheck
npm test
npm run lint
npm run build
```

각각:
- typecheck: clean
- test: 68/68 pass (4 files + kml-parser 신규 = 6 files)
- lint: 0 errors, 0 warnings
- build: success

**Step 5: 커밋**

```bash
cd /Users/psy/Projects/drone-gcp-platform
git add -A
git commit -m "feat(map): pan to polygon centroid on update; docs: KML import"
```

---

## Out of Scope (이번 계획 제외)

- 다중 폴리곤 (첫 번째만 사용)
- KML 자체 스타일 보존
- 드래그&드롭 업로드
- KMZ
- NetworkLink
- 외부 KML의 GCP 라벨 보존 (모두 재번호)
- 부분 불러오기(폴리곤만/GCP만 선택 다이얼로그)
- 폴리곤 bounding box 기반 정밀한 zoom level 계산 (fixed level 5)
