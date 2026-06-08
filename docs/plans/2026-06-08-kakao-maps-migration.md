# Kakao Maps Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Google Maps 기반 `MapContainer.tsx`를 카카오맵 SDK로 완전 교체하고, 지도 타입 토글 UI를 추가한다.

**Architecture:** 카카오 vanilla SDK를 `<script>` 동적 삽입으로 로드. React state 밖(`useRef`)에서 명령형 카카오 객체(map, polygon, markers, drawing manager)를 관리하고, store 구독자 `useEffect`로 React state ↔ 카카오 객체를 동기화한다. lib/*, store, 사이드바, 헤더, 단위 테스트는 변경 없음.

**Tech Stack:** Next.js 16, React 19, TypeScript, Kakao Maps JavaScript SDK (Drawing Library 포함), Zustand

---

## Task 1: Kakao SDK 타입 정의 + 의존성 교체

**Files:**
- Create: `types/kakao.d.ts`
- Modify: `tsconfig.json` (include 추가)
- Modify: `package.json` (의존성 변경)
- Modify: `.env.local.example` (환경변수 변경)
- Delete: `node_modules/@react-google-maps/api` (npm uninstall 통해)

**Step 1: Kakao SDK 타입 파일 생성**

`types/kakao.d.ts`:

```ts
// Minimal type definitions for Kakao Maps JavaScript SDK
// Only covers the surface we actually use.

declare global {
  interface Window {
    kakao: typeof kakao;
  }

  namespace kakao.maps {
    function load(callback: () => void): void;

    class LatLng {
      constructor(lat: number, lng: number);
      getLat(): number;
      getLng(): number;
    }

    class LatLngBounds {
      constructor();
      extend(latlng: LatLng): void;
    }

    interface MapOptions {
      center: LatLng;
      level?: number;
      mapTypeId?: MapTypeIdValue;
    }

    class Map {
      constructor(container: HTMLElement, options: MapOptions);
      setCenter(latlng: LatLng): void;
      setLevel(level: number): void;
      setMapTypeId(mapTypeId: MapTypeIdValue): void;
      getCenter(): LatLng;
    }

    type MapTypeIdValue = number;
    const MapTypeId: {
      ROADMAP: MapTypeIdValue;
      SKYVIEW: MapTypeIdValue;
      HYBRID: MapTypeIdValue;
    };

    interface MarkerOptions {
      position: LatLng;
      map?: Map;
      draggable?: boolean;
      title?: string;
    }

    class Marker {
      constructor(options: MarkerOptions);
      setMap(map: Map | null): void;
      setPosition(latlng: LatLng): void;
      getPosition(): LatLng;
      setDraggable(draggable: boolean): void;
    }

    interface CustomOverlayOptions {
      position: LatLng;
      content: string | HTMLElement;
      xAnchor?: number;
      yAnchor?: number;
      zIndex?: number;
      map?: Map;
      clickable?: boolean;
    }

    class CustomOverlay {
      constructor(options: CustomOverlayOptions);
      setMap(map: Map | null): void;
      setPosition(latlng: LatLng): void;
    }

    interface PolygonOptions {
      path: LatLng[];
      strokeWeight?: number;
      strokeColor?: string;
      strokeOpacity?: number;
      strokeStyle?: string;
      fillColor?: string;
      fillOpacity?: number;
      map?: Map;
    }

    class Polygon {
      constructor(options: PolygonOptions);
      setMap(map: Map | null): void;
      setPath(path: LatLng[]): void;
    }

    namespace event {
      function addListener(
        target: Map | Marker | Polygon | CustomOverlay,
        type: string,
        handler: (event?: { latLng?: LatLng }) => void,
      ): void;
      function removeListener(
        target: Map | Marker | Polygon | CustomOverlay,
        type: string,
        handler: (event?: { latLng?: LatLng }) => void,
      ): void;
    }

    namespace drawing {
      type OverlayTypeValue = string;
      const OverlayType: {
        MARKER: OverlayTypeValue;
        POLYLINE: OverlayTypeValue;
        RECTANGLE: OverlayTypeValue;
        CIRCLE: OverlayTypeValue;
        POLYGON: OverlayTypeValue;
        ARROW: OverlayTypeValue;
      };

      interface DrawingManagerOptions {
        map: Map;
        drawingMode?: OverlayTypeValue[];
        guideTooltip?: ('draw' | 'drag' | 'edit')[];
        polygonOptions?: {
          draggable?: boolean;
          removable?: boolean;
          editable?: boolean;
          strokeColor?: string;
          fillColor?: string;
          fillOpacity?: number;
          hintStrokeStyle?: string;
          hintStrokeOpacity?: number;
        };
      }

      interface DrawendEvent {
        overlayType: OverlayTypeValue;
        data: {
          points?: { x: number; y: number }[];
        };
        target: { getPath?: () => LatLng[] };
      }

      class DrawingManager {
        constructor(options: DrawingManagerOptions);
        select(overlayType: OverlayTypeValue): void;
        cancel(): void;
        getOverlays(): unknown;
        addListener(eventName: 'drawend', handler: (event: DrawendEvent) => void): void;
      }
    }
  }
}

export {};
```

**Step 2: tsconfig.json에 types 디렉터리 포함 확인**

`tsconfig.json`을 읽고 `include` 배열에 `"types/**/*.d.ts"`가 포함되어 있는지 확인. 없으면 추가.

기존 include 예시: `["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"]`

`**/*.ts`는 `types/kakao.d.ts`를 이미 포함하므로 추가 변경 불필요. 확인만 하고 변경 없으면 그대로 둘 것.

**Step 3: 의존성 교체**

```bash
cd /Users/psy/Projects/drone-gcp-platform
npm uninstall @react-google-maps/api
# @types/google.maps는 transitive였으므로 자동 제거됨
```

**Step 4: .env.local.example 업데이트**

기존:
```env
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your_google_maps_javascript_api_key_here
```

교체:
```env
NEXT_PUBLIC_KAKAO_MAP_APP_KEY=your_kakao_maps_javascript_app_key_here
```

**Step 5: 타입 정의가 통과하는지 확인**

```bash
cd /Users/psy/Projects/drone-gcp-platform
npm run typecheck
```

이 시점에는 `MapContainer.tsx`가 아직 Google Maps를 참조하고 있으므로 typecheck가 실패해도 정상이다. Task 2에서 해결된다.

**다만**, 이번 Step에서는 임시 조치로 `MapContainer.tsx` 상단에 다음을 추가하여 타입체크를 잠시 통과시킬 수 있다:

Option: 가장 깔끔하게 — `MapContainer.tsx`를 빈 placeholder로 잠시 교체.

```tsx
// components/MapContainer.tsx (temporary placeholder for Task 1)
'use client';
export default function MapContainer() {
  return <div>지도 마이그레이션 진행 중 (Task 2에서 완성됨)</div>;
}
```

`npm run typecheck` 통과 확인. `npm run build` 통과 확인.

**Step 6: 단위 테스트 통과 확인**

```bash
npm test
```

Expected: 43/43 PASS (lib/store/components/Sidebar/Header 모두 무관)

**Step 7: 커밋**

```bash
git add -A
git commit -m "chore: remove google maps, add kakao SDK types and env var"
```

---

## Task 2: MapContainer 카카오맵으로 재작성

**Files:**
- Modify: `components/MapContainer.tsx` (placeholder를 실제 구현으로 교체)
- Modify: `app/globals.css` (GCP 라벨 스타일 추가)

**Step 1: globals.css에 GCP 라벨 스타일 추가**

`app/globals.css` 끝에 추가:

```css
.gcp-label {
  display: inline-block;
  background-color: #dc2626;
  color: #ffffff;
  font-size: 11px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 9999px;
  border: 2px solid #ffffff;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
  white-space: nowrap;
  pointer-events: none;
  transform: translate(-50%, 0);
}
```

**Step 2: MapContainer.tsx 완전 재작성**

`components/MapContainer.tsx`:

```tsx
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from '@/lib/store';
import type { GCP } from '@/lib/gcp-algorithm';

const SCRIPT_ID = 'kakao-maps-sdk';
const DEFAULT_CENTER = { lat: 37.5665, lng: 126.978 };
const DEFAULT_LEVEL = 4;
const LOAD_TIMEOUT_MS = 8000;

type MapType = 'SKYVIEW' | 'ROADMAP' | 'HYBRID';

function loadKakaoSdk(appKey: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('window not available'));
      return;
    }
    if (window.kakao?.maps) {
      resolve();
      return;
    }

    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', () => window.kakao.maps.load(() => resolve()));
      existing.addEventListener('error', () => reject(new Error('SDK script error')));
      return;
    }

    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.async = true;
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${appKey}&libraries=drawing&autoload=false`;
    script.onload = () => window.kakao.maps.load(() => resolve());
    script.onerror = () => reject(new Error('SDK script error'));
    document.head.appendChild(script);

    setTimeout(() => {
      if (!window.kakao?.maps) reject(new Error('SDK load timeout'));
    }, LOAD_TIMEOUT_MS);
  });
}

export default function MapContainer() {
  const appKey = process.env.NEXT_PUBLIC_KAKAO_MAP_APP_KEY ?? '';

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<kakao.maps.Map | null>(null);
  const polygonRef = useRef<kakao.maps.Polygon | null>(null);
  const markersRef = useRef<
    Map<string, { marker: kakao.maps.Marker; overlay: kakao.maps.CustomOverlay }>
  >(new Map());
  const drawingManagerRef = useRef<kakao.maps.drawing.DrawingManager | null>(null);

  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [mapType, setMapType] = useState<MapType>('SKYVIEW');

  const polygon = useStore((s) => s.polygon);
  const gcps = useStore((s) => s.gcps);
  const drawingMode = useStore((s) => s.drawingMode);
  const setPolygon = useStore((s) => s.setPolygon);
  const setDrawingMode = useStore((s) => s.setDrawingMode);
  const moveGCP = useStore((s) => s.moveGCP);
  const removeGCP = useStore((s) => s.removeGCP);
  const addGCP = useStore((s) => s.addGCP);

  // 1. SDK 로드 + 지도 초기화
  useEffect(() => {
    if (!appKey || !containerRef.current) return;

    let cancelled = false;
    setStatus('loading');

    loadKakaoSdk(appKey)
      .then(() => {
        if (cancelled || !containerRef.current) return;
        const kakao = window.kakao;
        const map = new kakao.maps.Map(containerRef.current, {
          center: new kakao.maps.LatLng(DEFAULT_CENTER.lat, DEFAULT_CENTER.lng),
          level: DEFAULT_LEVEL,
          mapTypeId: kakao.maps.MapTypeId.SKYVIEW,
        });
        mapRef.current = map;

        // 지도 클릭 → 빈 곳 클릭으로 GCP 추가
        kakao.maps.event.addListener(map, 'click', (event?: { latLng?: kakao.maps.LatLng }) => {
          const latLng = event?.latLng;
          if (!latLng) return;
          const state = useStore.getState();
          if (state.drawingMode || !state.polygon) return;
          addGCP(latLng.getLat(), latLng.getLng());
        });

        // 우클릭은 카카오에서 'rightclick' 이벤트
        // 마커별 우클릭은 마커 추가 시 등록

        setStatus('ready');
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setErrorMsg(err.message);
        setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [appKey, addGCP]);

  // 2. mapType 동기화
  useEffect(() => {
    const map = mapRef.current;
    if (!map || status !== 'ready') return;
    const kakao = window.kakao;
    const id =
      mapType === 'SKYVIEW'
        ? kakao.maps.MapTypeId.SKYVIEW
        : mapType === 'HYBRID'
        ? kakao.maps.MapTypeId.HYBRID
        : kakao.maps.MapTypeId.ROADMAP;
    map.setMapTypeId(id);
  }, [mapType, status]);

  // 3. 폴리곤 동기화
  useEffect(() => {
    if (status !== 'ready') return;
    const kakao = window.kakao;

    // 기존 폴리곤 제거
    if (polygonRef.current) {
      polygonRef.current.setMap(null);
      polygonRef.current = null;
    }

    if (!polygon || polygon.length < 3) return;

    const path = polygon.map((p) => new kakao.maps.LatLng(p.lat, p.lng));
    const poly = new kakao.maps.Polygon({
      path,
      strokeWeight: 2,
      strokeColor: '#1d4ed8',
      strokeOpacity: 0.9,
      fillColor: '#3b82f6',
      fillOpacity: 0.15,
      map: mapRef.current!,
    });
    polygonRef.current = poly;
  }, [polygon, status]);

  // 4. GCP 마커 동기화 (diff 기반)
  useEffect(() => {
    if (status !== 'ready') return;
    const kakao = window.kakao;
    const map = mapRef.current;
    if (!map) return;

    const existingIds = new Set(markersRef.current.keys());
    const incomingIds = new Set(gcps.map((g) => g.id));

    // 삭제: 있던 것 중 incoming에 없는 것
    for (const id of existingIds) {
      if (!incomingIds.has(id)) {
        const entry = markersRef.current.get(id);
        entry?.marker.setMap(null);
        entry?.overlay.setMap(null);
        markersRef.current.delete(id);
      }
    }

    // 추가/이동/라벨 업데이트
    for (const g of gcps) {
      const pos = new kakao.maps.LatLng(g.lat, g.lng);
      const existing = markersRef.current.get(g.id);
      if (existing) {
        existing.marker.setPosition(pos);
        existing.overlay.setPosition(pos);
        // 라벨 텍스트 변경 가능성 (removeGCP 후 재라벨 등) → overlay 재생성이 가장 안전
        // 단순화: overlay만 교체
        existing.overlay.setMap(null);
        const overlay = makeLabelOverlay(g, pos, map);
        markersRef.current.set(g.id, { marker: existing.marker, overlay });
        continue;
      }

      const marker = new kakao.maps.Marker({ position: pos, map, draggable: true });
      kakao.maps.event.addListener(marker, 'dragend', () => {
        const p = marker.getPosition();
        moveGCP(g.id, p.getLat(), p.getLng());
      });
      kakao.maps.event.addListener(marker, 'rightclick', () => removeGCP(g.id));
      const overlay = makeLabelOverlay(g, pos, map);
      markersRef.current.set(g.id, { marker, overlay });
    }
  }, [gcps, status, moveGCP, removeGCP]);

  // 5. DrawingManager 동기화
  useEffect(() => {
    if (status !== 'ready') return;
    const kakao = window.kakao;
    const map = mapRef.current;
    if (!map) return;

    if (!drawingMode) {
      drawingManagerRef.current?.cancel();
      return;
    }

    if (!drawingManagerRef.current) {
      const manager = new kakao.maps.drawing.DrawingManager({
        map,
        drawingMode: [kakao.maps.drawing.OverlayType.POLYGON],
        polygonOptions: {
          draggable: false,
          removable: false,
          editable: false,
          strokeColor: '#1d4ed8',
          fillColor: '#3b82f6',
          fillOpacity: 0.2,
          hintStrokeStyle: 'dash',
          hintStrokeOpacity: 0.5,
        },
      });

      manager.addListener('drawend', (event) => {
        const path = event.target.getPath?.();
        if (!path || path.length < 3) return;
        const coords = path.map((latLng) => ({
          lat: latLng.getLat(),
          lng: latLng.getLng(),
        }));
        setPolygon(coords);
        setDrawingMode(false);
      });

      drawingManagerRef.current = manager;
    }

    drawingManagerRef.current.select(kakao.maps.drawing.OverlayType.POLYGON);
  }, [drawingMode, status, setPolygon, setDrawingMode]);

  // 언마운트 정리
  useEffect(() => {
    return () => {
      markersRef.current.forEach(({ marker, overlay }) => {
        marker.setMap(null);
        overlay.setMap(null);
      });
      markersRef.current.clear();
      polygonRef.current?.setMap(null);
      polygonRef.current = null;
    };
  }, []);

  // ───── 렌더링 ─────
  if (!appKey) {
    return (
      <div className="flex h-full items-center justify-center bg-gray-100 p-8 text-center">
        <div className="max-w-md">
          <h2 className="text-xl font-semibold">카카오맵 앱 키가 필요합니다</h2>
          <p className="mt-2 text-sm text-gray-600">
            <code>.env.local</code>에 <code>NEXT_PUBLIC_KAKAO_MAP_APP_KEY</code>를 설정한 뒤
            dev 서버를 재시작하세요.
          </p>
          <p className="mt-2 text-xs text-gray-500">
            카카오 개발자 콘솔에서 JavaScript 키를 발급받고, 사용할 도메인을 등록해야 합니다.
          </p>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="flex h-full items-center justify-center bg-red-50 p-8 text-center text-red-700">
        <div>
          <p className="font-semibold">지도 로딩 실패</p>
          <p className="mt-1 text-sm">{errorMsg}</p>
          <p className="mt-2 text-xs">앱 키와 등록된 도메인을 확인하세요.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />

      {status === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-50/80 text-gray-500">
          지도 로딩 중...
        </div>
      )}

      {status === 'ready' && (
        <div className="absolute right-3 top-3 flex overflow-hidden rounded-md border border-gray-200 bg-white shadow">
          {(['SKYVIEW', 'ROADMAP', 'HYBRID'] as MapType[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setMapType(t)}
              className={`px-3 py-1.5 text-xs font-medium transition ${
                mapType === t
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              {t === 'SKYVIEW' ? '스카이뷰' : t === 'ROADMAP' ? '일반' : '하이브리드'}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function makeLabelOverlay(
  g: GCP,
  pos: kakao.maps.LatLng,
  map: kakao.maps.Map,
): kakao.maps.CustomOverlay {
  const kakao = window.kakao;
  const content = document.createElement('div');
  content.className = 'gcp-label';
  content.textContent = g.label;
  return new kakao.maps.CustomOverlay({
    position: pos,
    content,
    yAnchor: 2.4,
    zIndex: 3,
    map,
    clickable: false,
  });
}
```

**Step 3: typecheck 확인**

```bash
cd /Users/psy/Projects/drone-gcp-platform
npm run typecheck
```

Expected: clean. 타입 에러 발생 시 `types/kakao.d.ts`에 누락된 메서드/속성 추가.

**Step 4: build 확인**

```bash
npm run build
```

Expected: 성공.

**Step 5: 단위 테스트 확인**

```bash
npm test
```

Expected: 43/43 PASS.

**Step 6: 커밋**

```bash
git add -A
git commit -m "feat(map): rewrite MapContainer with Kakao Maps SDK + type toggle"
```

---

## Task 3: README 업데이트 + 최종 검증

**Files:**
- Modify: `README.md`

**Step 1: README 업데이트**

`README.md`의 Setup 섹션을 카카오맵 기준으로 교체. 트러블슈팅 섹션도 갱신.

Setup 섹션 교체:

```markdown
## Setup

1. `.env.local.example`을 `.env.local`로 복사
2. 카카오 개발자 콘솔에서 JavaScript 키 발급
   - https://developers.kakao.com/ → 내 애플리케이션 → 앱 생성
   - 앱 키 → **JavaScript 키** 복사
   - **플랫폼 → Web** 에서 사용할 도메인 등록 (예: `http://localhost:3000`)
3. `.env.local`의 `NEXT_PUBLIC_KAKAO_MAP_APP_KEY`에 키 입력
4. `npm install`
5. `npm run dev`
```

트러블슈팅 섹션 교체:

```markdown
## 트러블슈팅

- **지도가 회색 화면 또는 로딩 실패**: 카카오 개발자 콘솔의 "플랫폼 → Web" 도메인 목록에 현재 접속 중인 origin이 등록되어 있는지 확인. 로컬은 `http://localhost:3000`을 등록해야 함.
- **다각형 그리기가 안 됨**: SDK URL의 `libraries=drawing` 파라미터가 포함되어 있는지 확인 (코드에 이미 포함). 다른 dev 서버 세션이 SDK를 캐싱하고 있을 수 있으니 강력 새로고침(Cmd+Shift+R).
- **KML 다운로드가 안 됨**: 브라우저의 팝업/다운로드 차단 설정 확인. 폴리곤이 3점 미만이고 GCP도 없으면 버튼이 비활성화됨.
- **환경변수가 적용 안 됨**: `.env.local` 수정 후 dev 서버 재시작 필수.
- **타입 토글이 안 보임**: 지도 로드가 완료되기 전이거나 status가 ready가 아닌 상태. 콘솔 에러 확인.
```

스택 섹션 교체 (Google Maps → 카카오맵):

```markdown
## 스택

- Next.js 16 + React 19 + TypeScript
- Tailwind CSS v4 + shadcn/ui
- Zustand (전역 상태)
- Kakao Maps JavaScript SDK (지도 + Drawing Library)
- @turf/turf (지오메트리)
- Vitest (테스트)
```

알고리즘 메모와 사용법 섹션은 그대로 유지 (지도 라이브러리와 무관).

**Step 2: 최종 검증**

```bash
cd /Users/psy/Projects/drone-gcp-platform
npm run typecheck
npm test
npm run build
```

세 가지 모두 통과해야 함.

**Step 3: 패키지 정리 확인**

```bash
cat package.json | grep -E "google|kakao"
```

`@react-google-maps/api`가 deps에 없어야 한다. 카카오 관련 npm 패키지는 없음 (SDK는 외부 스크립트).

**Step 4: 수동 검증 안내**

README에 수동 검증 체크리스트 섹션 추가:

```markdown
## 수동 검증 (배포 전)

1. `.env.local` 설정 후 `npm run dev` 실행
2. http://localhost:3000 접속, 카카오 SDK 로드 확인 (네트워크 탭에서 `dapi.kakao.com` 요청)
3. 우상단 타입 토글로 스카이뷰/일반/하이브리드 전환 확인
4. 사이드바 "구역 그리기" → 지도에 다각형 그리기
5. GCP가 자동 표시되는지 확인
6. 마커 드래그(이동), 우클릭(삭제), 빈 곳 클릭(추가) 동작 확인
7. 슬라이더로 GCP 개수 조정 확인
8. "권장값으로 재추천" 버튼 확인
9. KML 다운로드 → 다운로드된 파일을 Google Earth에서 열어 좌표 검증
```

**Step 5: 커밋**

```bash
git add -A
git commit -m "docs: update README for Kakao Maps setup and troubleshooting"
```

---

## Out of Scope (이번 마이그레이션 제외)

- 카카오 로컬 검색 API (주소·장소 검색)
- 좌표계 변환 (계속 WGS84 사용)
- 다중 지도 라이브러리 동시 지원
- 카카오 SDK 타입 npm 패키지화
