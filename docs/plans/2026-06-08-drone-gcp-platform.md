# Drone GCP Platform Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Google 지도에서 다각형으로 드론 매핑 구역을 그리면 기하학적 분포 알고리즘으로 GCP를 자동 추천하고 KML 파일로 다운로드할 수 있는 Next.js 웹 앱을 빌드한다.

**Architecture:** Next.js 15 App Router 클라이언트 사이드 SPA. Zustand로 폴리곤/GCP 상태를 관리하고, `@react-google-maps/api`로 지도와 폴리곤 그리기를 처리한다. GCP 추천 알고리즘과 KML 생성은 순수 함수로 분리하여 단위 테스트로 검증한다.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind CSS v4, shadcn/ui, Zustand, @react-google-maps/api, @turf/turf, Vitest

---

## Task 1: 프로젝트 스캐폴딩

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `app/layout.tsx`, `app/page.tsx`, `app/globals.css`, `.gitignore`, `.env.local.example`, `README.md`

**Step 1: Next.js 프로젝트 생성**

Run:
```bash
cd ~/Projects && npx create-next-app@latest drone-gcp-platform-tmp \
  --typescript --tailwind --eslint --app --src-dir=false \
  --import-alias "@/*" --no-turbopack --no-interactive
```

(이미 디렉토리가 있으므로 임시 폴더에 만든 뒤 파일 복사)

**Step 2: 생성된 파일을 기존 프로젝트로 이동**

```bash
cd ~/Projects/drone-gcp-platform-tmp
rsync -a --exclude='.git' --exclude='node_modules' ./ ~/Projects/drone-gcp-platform/
cd ~/Projects && rm -rf drone-gcp-platform-tmp
```

**Step 3: 추가 의존성 설치**

Run:
```bash
cd ~/Projects/drone-gcp-platform
npm install zustand @react-google-maps/api @turf/turf
npm install -D vitest @vitest/ui jsdom @testing-library/react @testing-library/jest-dom
```

**Step 4: shadcn/ui 초기화 및 필요 컴포넌트 설치**

```bash
npx shadcn@latest init -d
npx shadcn@latest add button slider card
```

**Step 5: `.env.local.example` 작성**

```env
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your_google_maps_javascript_api_key_here
```

**Step 6: README.md 기본 내용 작성**

```markdown
# Drone GCP Platform

드론 매핑 구역에 대한 GCP(Ground Control Point) 자동 추천 및 KML 출력 도구.

## Setup

1. `.env.local.example`을 `.env.local`로 복사
2. Google Maps JavaScript API 키 발급 후 입력
   - https://console.cloud.google.com → APIs & Services → Credentials
   - Maps JavaScript API 활성화
3. `npm install`
4. `npm run dev`

## 사용법

1. 사이드바에서 "구역 그리기" 시작
2. 지도에서 다각형 꼭짓점 클릭, 마지막 점 더블클릭으로 완료
3. GCP 자동 추천됨. 슬라이더로 개수 조정 가능
4. GCP 마커 드래그(이동), 우클릭(삭제), 빈 곳 클릭(추가)
5. 헤더의 "KML 다운로드"
```

**Step 7: package.json scripts에 test 추가**

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "next lint",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

**Step 8: vitest.config.ts 생성**

```ts
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './') },
  },
});
```

**Step 9: 빌드 확인 후 커밋**

```bash
npm run build
git add -A
git commit -m "chore: scaffold Next.js project with deps"
```

Expected: Build 성공

---

## Task 2: 지오메트리 헬퍼 (TDD)

**Files:**
- Create: `lib/geometry.ts`
- Test: `lib/__tests__/geometry.test.ts`

**Step 1: 실패하는 테스트 작성**

`lib/__tests__/geometry.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { polygonAreaHa, isPointInPolygon, polygonDiameterMeters } from '../geometry';

describe('polygonAreaHa', () => {
  it('1km × 1km 정사각형은 100 ha', () => {
    const poly = [
      { lat: 37.5, lng: 127.0 },
      { lat: 37.5, lng: 127.01134 },
      { lat: 37.50902, lng: 127.01134 },
      { lat: 37.50902, lng: 127.0 },
    ];
    const area = polygonAreaHa(poly);
    expect(area).toBeGreaterThan(95);
    expect(area).toBeLessThan(105);
  });

  it('점이 3개 미만이면 0 반환', () => {
    expect(polygonAreaHa([{ lat: 0, lng: 0 }, { lat: 1, lng: 1 }])).toBe(0);
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
});

describe('polygonDiameterMeters', () => {
  it('정사각형의 대각선 길이를 반환', () => {
    const poly = [
      { lat: 37.5, lng: 127.0 },
      { lat: 37.5, lng: 127.01 },
      { lat: 37.51, lng: 127.01 },
      { lat: 37.51, lng: 127.0 },
    ];
    const d = polygonDiameterMeters(poly);
    expect(d).toBeGreaterThan(1000);
    expect(d).toBeLessThan(2000);
  });
});
```

**Step 2: 실패 확인**

Run: `npm test`
Expected: FAIL (module not found)

**Step 3: 구현**

`lib/geometry.ts`:
```ts
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

export function polygonBoundingBox(coords: LatLng[]) {
  const poly = toTurfPolygon(coords);
  if (!poly) return null;
  const [minLng, minLat, maxLng, maxLat] = turf.bbox(poly);
  return { minLat, maxLat, minLng, maxLng };
}
```

**Step 4: 테스트 통과 확인**

Run: `npm test`
Expected: PASS

**Step 5: 커밋**

```bash
git add lib/geometry.ts lib/__tests__/geometry.test.ts
git commit -m "feat(geometry): polygon area, containment, diameter helpers"
```

---

## Task 3: GCP 추천 알고리즘 (TDD)

**Files:**
- Create: `lib/gcp-algorithm.ts`
- Test: `lib/__tests__/gcp-algorithm.test.ts`

**Step 1: 실패하는 테스트 작성**

`lib/__tests__/gcp-algorithm.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { recommendCount, generateGCPs } from '../gcp-algorithm';
import { isPointInPolygon } from '../geometry';

const square1ha = [
  { lat: 37.5,       lng: 127.0       },
  { lat: 37.5,       lng: 127.001134  },
  { lat: 37.500902,  lng: 127.001134  },
  { lat: 37.500902,  lng: 127.0       },
];

describe('recommendCount', () => {
  it('1 ha → 5', () => expect(recommendCount(1)).toBe(5));
  it('10 ha → 5', () => expect(recommendCount(10)).toBe(5));
  it('11 ha → 6', () => expect(recommendCount(11)).toBe(6));
  it('100 ha → 14', () => expect(recommendCount(100)).toBe(14));
  it('0 → 0', () => expect(recommendCount(0)).toBe(0));
});

describe('generateGCPs', () => {
  it('정사각형 1ha에 5개 생성, 모든 점이 폴리곤 내부 또는 경계에 있음', () => {
    const gcps = generateGCPs(square1ha, 5);
    expect(gcps).toHaveLength(5);
    gcps.forEach((g) => {
      // 모서리 또는 내부
      expect(typeof g.lat).toBe('number');
      expect(typeof g.lng).toBe('number');
      expect(g.label).toMatch(/^GCP-\d{2}$/);
    });
  });

  it('첫 4개는 모서리(꼭짓점)와 일치', () => {
    const gcps = generateGCPs(square1ha, 5);
    const corners = gcps.slice(0, 4);
    const matchedCorners = square1ha.filter((c) =>
      corners.some((g) => Math.abs(g.lat - c.lat) < 1e-6 && Math.abs(g.lng - c.lng) < 1e-6),
    );
    expect(matchedCorners.length).toBeGreaterThanOrEqual(3);
  });

  it('count가 4 이하면 모서리만 반환', () => {
    const gcps = generateGCPs(square1ha, 3);
    expect(gcps).toHaveLength(3);
  });

  it('빈 폴리곤은 빈 배열 반환', () => {
    expect(generateGCPs([], 5)).toEqual([]);
  });

  it('라벨이 GCP-01, GCP-02 순서로 부여됨', () => {
    const gcps = generateGCPs(square1ha, 6);
    expect(gcps[0].label).toBe('GCP-01');
    expect(gcps[5].label).toBe('GCP-06');
  });
});
```

**Step 2: 실패 확인**

Run: `npm test`
Expected: FAIL

**Step 3: 구현**

`lib/gcp-algorithm.ts`:
```ts
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

function makeId() {
  return Math.random().toString(36).slice(2, 10);
}

function labelOf(index: number): string {
  return `GCP-${String(index + 1).padStart(2, '0')}`;
}

function distanceMeters(a: LatLng, b: LatLng): number {
  return turf.distance(turf.point([a.lng, a.lat]), turf.point([b.lng, b.lat]), {
    units: 'meters',
  });
}

/** 폴리곤 꼭짓점 중 서로 가장 멀리 떨어진 N개 선택 (greedy farthest-first) */
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

/** 변 위에 균등하게 점을 분배 */
function pickEdgePoints(coords: LatLng[], n: number): LatLng[] {
  if (n <= 0 || coords.length < 2) return [];
  const edges = coords.map((c, i) => ({
    a: c,
    b: coords[(i + 1) % coords.length],
    len: distanceMeters(c, coords[(i + 1) % coords.length]),
  }));
  const totalLen = edges.reduce((s, e) => s + e.len, 0);
  const result: LatLng[] = [];
  // 변 길이에 비례 분배, 각 변에서 중점 사용
  const allocations = edges.map((e) => Math.round((e.len / totalLen) * n));
  // 합계 보정
  let diff = n - allocations.reduce((s, a) => s + a, 0);
  for (let i = 0; diff !== 0 && i < edges.length; i++) {
    const j = diff > 0 ? i : edges.length - 1 - i;
    allocations[j] += Math.sign(diff);
    diff -= Math.sign(diff);
  }
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

/** 폴리곤 내부에 그리드 후보 생성 후, 기존 점들로부터 충분히 떨어진 점 선택 */
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
  const gridSize = Math.max(6, Math.ceil(Math.sqrt(n) * 3));

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
  while (picked.length < n && minDistance > 0) {
    for (const c of candidates) {
      if (picked.length >= n) break;
      const all = [...existing, ...picked];
      const ok = all.every((p) => distanceMeters(c, p) >= minDistance);
      if (ok) picked.push(c);
    }
    if (picked.length < n) minDistance *= 0.7;
    if (minDistance < 1) break;
  }
  return picked.slice(0, n);
}

export function generateGCPs(polygon: LatLng[], count: number): GCP[] {
  if (polygon.length < 3 || count <= 0) return [];

  const cornerCount = Math.min(4, polygon.length, count);
  const corners = pickFarthestCorners(polygon, cornerCount);
  const remaining = count - corners.length;

  // 둘레 점: 면적 대비 둘레 비중에 따라 결정 (단순화: 남은 점의 1/3)
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
```

**Step 4: 테스트 통과 확인**

Run: `npm test`
Expected: PASS

**Step 5: 커밋**

```bash
git add lib/gcp-algorithm.ts lib/__tests__/gcp-algorithm.test.ts
git commit -m "feat(gcp): geometric distribution algorithm with TDD"
```

---

## Task 4: KML 생성기 (TDD)

**Files:**
- Create: `lib/kml-generator.ts`
- Test: `lib/__tests__/kml-generator.test.ts`

**Step 1: 실패하는 테스트 작성**

`lib/__tests__/kml-generator.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { generateKML } from '../kml-generator';

describe('generateKML', () => {
  const polygon = [
    { lat: 37.5, lng: 127.0 },
    { lat: 37.5, lng: 127.01 },
    { lat: 37.51, lng: 127.01 },
  ];
  const gcps = [
    { id: 'a', lat: 37.5, lng: 127.0, label: 'GCP-01' },
    { id: 'b', lat: 37.505, lng: 127.005, label: 'GCP-02' },
  ];

  it('XML 헤더와 kml 루트 포함', () => {
    const kml = generateKML(polygon, gcps);
    expect(kml).toMatch(/^<\?xml/);
    expect(kml).toContain('<kml xmlns="http://www.opengis.net/kml/2.2">');
  });

  it('폴리곤 좌표를 포함', () => {
    const kml = generateKML(polygon, gcps);
    expect(kml).toContain('127.000000,37.500000,0');
    // 닫힘 보장: 첫 점이 마지막에 반복
    const matches = kml.match(/127\.000000,37\.500000,0/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it('각 GCP가 Placemark Point로 포함', () => {
    const kml = generateKML(polygon, gcps);
    expect(kml).toContain('<name>GCP-01</name>');
    expect(kml).toContain('<name>GCP-02</name>');
    expect(kml).toContain('127.005000,37.505000,0');
  });

  it('GCP만 있고 폴리곤이 없으면 Point만 출력', () => {
    const kml = generateKML([], gcps);
    expect(kml).not.toContain('<Polygon>');
    expect(kml).toContain('<name>GCP-01</name>');
  });

  it('폴리곤만 있고 GCP가 없어도 정상 출력', () => {
    const kml = generateKML(polygon, []);
    expect(kml).toContain('<Polygon>');
    expect(kml).not.toContain('GCP-');
  });
});
```

**Step 2: 실패 확인**

Run: `npm test`
Expected: FAIL

**Step 3: 구현**

`lib/kml-generator.ts`:
```ts
import { LatLng } from './geometry';
import { GCP } from './gcp-algorithm';

const fmt = (n: number) => n.toFixed(6);
const escapeXml = (s: string) =>
  s.replace(/[<>&'"]/g, (c) =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]!),
  );

function polygonPlacemark(coords: LatLng[]): string {
  if (coords.length < 3) return '';
  const ring = [...coords, coords[0]];
  const coordStr = ring.map((p) => `${fmt(p.lng)},${fmt(p.lat)},0`).join(' ');
  return `    <Placemark>
      <name>Mapping Area</name>
      <styleUrl>#areaStyle</styleUrl>
      <Polygon>
        <outerBoundaryIs>
          <LinearRing>
            <coordinates>${coordStr}</coordinates>
          </LinearRing>
        </outerBoundaryIs>
      </Polygon>
    </Placemark>`;
}

function gcpPlacemark(g: GCP): string {
  return `    <Placemark>
      <name>${escapeXml(g.label)}</name>
      <styleUrl>#gcpStyle</styleUrl>
      <Point><coordinates>${fmt(g.lng)},${fmt(g.lat)},0</coordinates></Point>
    </Placemark>`;
}

export function generateKML(polygon: LatLng[], gcps: GCP[]): string {
  const placemarks = [
    polygonPlacemark(polygon),
    ...gcps.map(gcpPlacemark),
  ].filter(Boolean);

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Drone Mapping GCP Plan</name>
    <Style id="areaStyle">
      <LineStyle><color>ff0000ff</color><width>2</width></LineStyle>
      <PolyStyle><color>4400ffff</color></PolyStyle>
    </Style>
    <Style id="gcpStyle">
      <IconStyle>
        <Icon><href>http://maps.google.com/mapfiles/kml/paddle/red-circle.png</href></Icon>
      </IconStyle>
    </Style>
${placemarks.join('\n')}
  </Document>
</kml>`;
}

export function downloadKML(filename: string, content: string) {
  const blob = new Blob([content], { type: 'application/vnd.google-earth.kml+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
```

**Step 4: 테스트 통과 확인**

Run: `npm test`
Expected: PASS

**Step 5: 커밋**

```bash
git add lib/kml-generator.ts lib/__tests__/kml-generator.test.ts
git commit -m "feat(kml): KML serialization and download helper"
```

---

## Task 5: Zustand 스토어

**Files:**
- Create: `lib/store.ts`

**Step 1: 스토어 작성**

`lib/store.ts`:
```ts
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
    const id = Math.random().toString(36).slice(2, 10);
    const { gcps } = get();
    const label = `GCP-${String(gcps.length + 1).padStart(2, '0')}`;
    set({ gcps: [...gcps, { id, lat, lng, label }] });
  },

  moveGCP: (id, lat, lng) =>
    set({ gcps: get().gcps.map((g) => (g.id === id ? { ...g, lat, lng } : g)) }),

  removeGCP: (id) => {
    const gcps = get()
      .gcps.filter((g) => g.id !== id)
      .map((g, i) => ({ ...g, label: `GCP-${String(i + 1).padStart(2, '0')}` }));
    set({ gcps });
  },

  reset: () => set({ polygon: null, gcps: [], userCountOverride: null, drawingMode: false }),
}));

export const useArea = () => {
  const polygon = useStore((s) => s.polygon);
  return polygon ? polygonAreaHa(polygon) : 0;
};

export const useRecommendedCount = () => {
  const area = useArea();
  return recommendCount(area);
};
```

**Step 2: 빌드 확인**

Run: `npm run build`
Expected: 성공

**Step 3: 커밋**

```bash
git add lib/store.ts
git commit -m "feat(store): Zustand store for polygon and GCPs"
```

---

## Task 6: 지도 컨테이너 + 폴리곤 그리기

**Files:**
- Create: `components/MapContainer.tsx`

**Step 1: 컴포넌트 작성**

`components/MapContainer.tsx`:
```tsx
'use client';

import { GoogleMap, useJsApiLoader, DrawingManager, Polygon, Marker } from '@react-google-maps/api';
import { useStore } from '@/lib/store';
import { useCallback, useMemo } from 'react';

const libraries: ('drawing' | 'geometry')[] = ['drawing', 'geometry'];
const containerStyle = { width: '100%', height: '100%' };
const defaultCenter = { lat: 37.5665, lng: 126.978 };

export default function MapContainer() {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: apiKey,
    libraries,
  });

  const polygon = useStore((s) => s.polygon);
  const gcps = useStore((s) => s.gcps);
  const drawingMode = useStore((s) => s.drawingMode);
  const setPolygon = useStore((s) => s.setPolygon);
  const moveGCP = useStore((s) => s.moveGCP);
  const removeGCP = useStore((s) => s.removeGCP);
  const addGCP = useStore((s) => s.addGCP);

  const polygonPath = useMemo(
    () => (polygon ? polygon.map((p) => ({ lat: p.lat, lng: p.lng })) : []),
    [polygon],
  );

  const onPolygonComplete = useCallback(
    (poly: google.maps.Polygon) => {
      const path = poly.getPath();
      const coords = [];
      for (let i = 0; i < path.getLength(); i++) {
        const p = path.getAt(i);
        coords.push({ lat: p.lat(), lng: p.lng() });
      }
      poly.setMap(null); // remove the temp polygon, store renders it
      setPolygon(coords);
    },
    [setPolygon],
  );

  const onMapClick = useCallback(
    (e: google.maps.MapMouseEvent) => {
      if (drawingMode || !polygon || !e.latLng) return;
      addGCP(e.latLng.lat(), e.latLng.lng());
    },
    [drawingMode, polygon, addGCP],
  );

  if (!apiKey) {
    return (
      <div className="flex h-full items-center justify-center bg-gray-100 p-8 text-center">
        <div>
          <h2 className="text-xl font-semibold">Google Maps API Key가 필요합니다</h2>
          <p className="mt-2 text-sm text-gray-600">
            `.env.local` 파일에 `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`를 설정한 뒤 재실행하세요.
          </p>
        </div>
      </div>
    );
  }
  if (loadError) return <div>지도 로딩 실패</div>;
  if (!isLoaded) return <div>지도 로딩 중...</div>;

  return (
    <GoogleMap
      mapContainerStyle={containerStyle}
      center={defaultCenter}
      zoom={15}
      mapTypeId="hybrid"
      onClick={onMapClick}
    >
      {drawingMode && (
        <DrawingManager
          onPolygonComplete={onPolygonComplete}
          options={{
            drawingControl: false,
            drawingMode: google.maps.drawing.OverlayType.POLYGON,
            polygonOptions: {
              fillColor: '#3b82f6',
              fillOpacity: 0.2,
              strokeColor: '#1d4ed8',
              strokeWeight: 2,
              clickable: false,
              editable: false,
            },
          }}
        />
      )}

      {polygonPath.length > 0 && (
        <Polygon
          paths={polygonPath}
          options={{
            fillColor: '#3b82f6',
            fillOpacity: 0.15,
            strokeColor: '#1d4ed8',
            strokeWeight: 2,
            clickable: false,
          }}
        />
      )}

      {gcps.map((g) => (
        <Marker
          key={g.id}
          position={{ lat: g.lat, lng: g.lng }}
          draggable
          label={{ text: g.label, fontSize: '11px', color: '#fff' }}
          onDragEnd={(e) => e.latLng && moveGCP(g.id, e.latLng.lat(), e.latLng.lng())}
          onRightClick={() => removeGCP(g.id)}
          icon={{
            path: google.maps.SymbolPath.CIRCLE,
            scale: 9,
            fillColor: '#dc2626',
            fillOpacity: 1,
            strokeColor: '#fff',
            strokeWeight: 2,
          }}
        />
      ))}
    </GoogleMap>
  );
}
```

**Step 2: 빌드 확인**

Run: `npm run build`
Expected: 성공 (API 키 없어도 빌드는 통과해야 함)

**Step 3: 커밋**

```bash
git add components/MapContainer.tsx
git commit -m "feat(map): Google Map with polygon drawing and GCP markers"
```

---

## Task 7: 사이드바 + 헤더

**Files:**
- Create: `components/Sidebar.tsx`, `components/Header.tsx`

**Step 1: Sidebar 작성**

`components/Sidebar.tsx`:
```tsx
'use client';

import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Card } from '@/components/ui/card';
import { useStore, useArea, useRecommendedCount } from '@/lib/store';

export default function Sidebar() {
  const drawingMode = useStore((s) => s.drawingMode);
  const setDrawingMode = useStore((s) => s.setDrawingMode);
  const polygon = useStore((s) => s.polygon);
  const gcps = useStore((s) => s.gcps);
  const setUserCount = useStore((s) => s.setUserCount);
  const reset = useStore((s) => s.reset);

  const area = useArea();
  const recommended = useRecommendedCount();
  const min = Math.max(3, Math.ceil(recommended * 0.5));
  const max = Math.max(min + 1, Math.ceil(recommended * 1.5));

  return (
    <aside className="flex h-full w-80 flex-col gap-4 border-r bg-gray-50 p-4">
      <h2 className="text-lg font-semibold">컨트롤</h2>

      <Button
        variant={drawingMode ? 'default' : 'outline'}
        onClick={() => setDrawingMode(!drawingMode)}
        disabled={drawingMode}
      >
        {drawingMode ? '지도에서 다각형을 그리세요...' : polygon ? '구역 다시 그리기' : '구역 그리기'}
      </Button>

      {polygon && (
        <Card className="p-3 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">면적</span>
            <span className="font-medium">{area.toFixed(2)} ha</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">권장 GCP</span>
            <span className="font-medium">{recommended}개</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">현재 GCP</span>
            <span className="font-medium">{gcps.length}개</span>
          </div>
        </Card>
      )}

      {polygon && (
        <div>
          <label className="text-sm font-medium">GCP 개수 조정 ({gcps.length})</label>
          <Slider
            min={min}
            max={max}
            step={1}
            value={[gcps.length]}
            onValueChange={(v) => setUserCount(v[0])}
            className="mt-2"
          />
          <p className="mt-2 text-xs text-gray-500">
            마커 드래그로 이동, 우클릭으로 삭제, 빈 곳 클릭으로 추가.
          </p>
        </div>
      )}

      <div className="flex-1" />

      {polygon && (
        <Button variant="outline" onClick={reset}>
          전체 초기화
        </Button>
      )}
    </aside>
  );
}
```

**Step 2: Header 작성**

`components/Header.tsx`:
```tsx
'use client';

import { Button } from '@/components/ui/button';
import { useStore } from '@/lib/store';
import { generateKML, downloadKML } from '@/lib/kml-generator';

export default function Header() {
  const polygon = useStore((s) => s.polygon);
  const gcps = useStore((s) => s.gcps);

  const onDownload = () => {
    const kml = generateKML(polygon ?? [], gcps);
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    downloadKML(`drone-gcp-${ts}.kml`, kml);
  };

  return (
    <header className="flex h-14 items-center justify-between border-b bg-white px-4">
      <h1 className="text-lg font-semibold">Drone GCP Platform</h1>
      <Button onClick={onDownload} disabled={!polygon && gcps.length === 0}>
        KML 다운로드
      </Button>
    </header>
  );
}
```

**Step 3: 빌드 확인**

Run: `npm run build`
Expected: 성공

**Step 4: 커밋**

```bash
git add components/Sidebar.tsx components/Header.tsx
git commit -m "feat(ui): sidebar with controls and header with KML download"
```

---

## Task 8: 메인 페이지 레이아웃 조립

**Files:**
- Modify: `app/layout.tsx`, `app/page.tsx`, `app/globals.css`

**Step 1: layout.tsx 수정 (메타데이터)**

`app/layout.tsx`:
```tsx
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Drone GCP Platform',
  description: '드론 매핑 구역의 GCP 자동 추천 및 KML 출력',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="h-screen w-screen overflow-hidden bg-white text-gray-900">
        {children}
      </body>
    </html>
  );
}
```

**Step 2: page.tsx 작성**

`app/page.tsx`:
```tsx
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import MapContainer from '@/components/MapContainer';

export default function Page() {
  return (
    <div className="flex h-screen w-screen flex-col">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1">
          <MapContainer />
        </main>
      </div>
    </div>
  );
}
```

**Step 3: 빌드 + 개발 서버 확인**

Run:
```bash
npm run build
npm run dev
```

`.env.local`에 API 키 입력 후 http://localhost:3000 접속하여:
- 구역 그리기 → 폴리곤 완성 → GCP 자동 표시 확인
- 슬라이더 조정 → 개수 변경 확인
- 마커 드래그 / 우클릭 / 빈 곳 클릭 동작 확인
- KML 다운로드 → 파일 열어 좌표 검증

**Step 4: 커밋**

```bash
git add app/
git commit -m "feat(app): assemble main page with header, sidebar, map"
```

---

## Task 9: 최종 검증 및 README 보강

**Step 1: 모든 테스트 통과 확인**

Run: `npm test`
Expected: 모든 테스트 PASS

**Step 2: 빌드 통과 확인**

Run: `npm run build`
Expected: 성공, 타입 에러 없음

**Step 3: README에 스크린샷 자리 + 트러블슈팅 섹션 추가**

`README.md`에 추가:
```markdown
## 트러블슈팅

- **지도가 회색 화면**: API 키에 도메인 제한이 걸려 있거나 Maps JavaScript API가 활성화되지 않은 경우. Google Cloud Console에서 확인.
- **DrawingManager 오류**: `libraries` 배열에 `drawing`이 포함되어 있는지 확인.
- **KML 다운로드가 안 됨**: 브라우저 팝업/다운로드 차단 설정 확인.

## 알고리즘 메모

GCP 추천 공식:
- 권장 개수: `max(5, ceil(면적_ha / 10) + 4)`
- 모서리 4개 + 변 위 일부 + 내부 균일 분포
- 사용자 슬라이더로 ±50% 조정 가능
```

**Step 4: 최종 커밋**

```bash
git add README.md
git commit -m "docs: troubleshooting and algorithm notes"
```

---

## Out of Scope (이번 계획에서 제외)

- 사용자 인증, 프로젝트 저장/불러오기
- DEM 기반 지형 분석
- 다중 폴리곤 지원
- 좌표계 변환 (UTM 등)
- E2E 테스트
- 배포 설정 (Vercel 등)
