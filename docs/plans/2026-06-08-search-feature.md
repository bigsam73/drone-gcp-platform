# Address/Place Search Feature Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 카카오맵 `services` 라이브러리를 활용해 주소·장소 통합 검색을 추가하고, 검색 결과 클릭 시 지도 이동 + 임시 마커 표시 기능을 구현한다.

**Architecture:** 검색 휴리스틱과 응답 파서는 순수 함수로 `lib/search.ts`에 분리하여 TDD로 검증한다. `SearchBar` 컴포넌트가 디바운스/API 호출/결과 드롭다운을 담당하고, `MapContainer`는 SDK URL에 `services`를 추가하고 `onSelect` 콜백에서 지도 이동·임시 마커를 처리한다.

**Tech Stack:** Next.js 16, React 19, TypeScript, Kakao Maps SDK (drawing + services), Vitest

---

## Task 1: 검색 휴리스틱 + 응답 파서 (TDD)

**Files:**
- Create: `lib/search.ts`
- Create: `lib/__tests__/search.test.ts`

**Step 1: 실패하는 테스트 작성**

`lib/__tests__/search.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  looksLikeAddress,
  parsePlaceResult,
  parseAddressResult,
  type SearchResult,
} from '../search';

describe('looksLikeAddress', () => {
  it('숫자가 포함된 도로명은 주소로 판정', () => {
    expect(looksLikeAddress('테헤란로 152')).toBe(true);
    expect(looksLikeAddress('강남대로 396')).toBe(true);
  });

  it('숫자가 포함된 동/리는 주소로 판정', () => {
    expect(looksLikeAddress('삼성동 152-3')).toBe(true);
  });

  it('숫자 없는 동 이름은 주소 아님 (장소 검색으로)', () => {
    expect(looksLikeAddress('삼성동')).toBe(false);
    expect(looksLikeAddress('강남구')).toBe(false);
  });

  it('장소명은 주소 아님', () => {
    expect(looksLikeAddress('스타벅스 강남역')).toBe(false);
    expect(looksLikeAddress('잠실 롯데타워')).toBe(false);
  });

  it('빈 입력은 false', () => {
    expect(looksLikeAddress('')).toBe(false);
  });
});

describe('parsePlaceResult', () => {
  it('카카오 Places 응답을 SearchResult로 변환', () => {
    const raw = {
      id: '123',
      place_name: '스타벅스 강남역점',
      address_name: '서울 강남구 역삼동 123-4',
      road_address_name: '서울 강남구 강남대로 396',
      x: '127.0276',
      y: '37.4979',
      category_group_name: '카페',
    };
    const result = parsePlaceResult(raw, 0);
    expect(result.name).toBe('스타벅스 강남역점');
    expect(result.address).toBe('서울 강남구 강남대로 396');
    expect(result.lat).toBeCloseTo(37.4979, 4);
    expect(result.lng).toBeCloseTo(127.0276, 4);
    expect(result.source).toBe('place');
    expect(result.id).toMatch(/^place_/);
  });

  it('도로명 주소가 없으면 지번 주소 사용', () => {
    const raw = {
      id: '456',
      place_name: '시골 가게',
      address_name: '강원 평창군 봉평면 어딘가',
      road_address_name: '',
      x: '128.0',
      y: '37.5',
      category_group_name: '',
    };
    const result = parsePlaceResult(raw, 1);
    expect(result.address).toBe('강원 평창군 봉평면 어딘가');
  });
});

describe('parseAddressResult', () => {
  it('카카오 Geocoder 응답을 SearchResult로 변환', () => {
    const raw = {
      address_name: '서울 강남구 강남대로 396',
      road_address: {
        address_name: '서울 강남구 강남대로 396',
        building_name: '강남빌딩',
      },
      address: { address_name: '서울 강남구 역삼동 123-4' },
      x: '127.0276',
      y: '37.4979',
    };
    const result = parseAddressResult(raw, 0);
    expect(result.name).toBe('서울 강남구 강남대로 396');
    expect(result.address).toBe('서울 강남구 역삼동 123-4');
    expect(result.lat).toBeCloseTo(37.4979, 4);
    expect(result.lng).toBeCloseTo(127.0276, 4);
    expect(result.source).toBe('address');
    expect(result.id).toMatch(/^addr_/);
  });

  it('지번 주소만 있을 때도 처리', () => {
    const raw = {
      address_name: '서울 강남구 역삼동 123-4',
      x: '127.0',
      y: '37.5',
    };
    const result = parseAddressResult(raw, 0);
    expect(result.name).toBe('서울 강남구 역삼동 123-4');
    expect(result.address).toBe('');
  });
});
```

**Step 2: 실패 확인**

Run: `cd /Users/psy/Projects/drone-gcp-platform && npm test`
Expected: FAIL ("Cannot find module '../search'")

**Step 3: 구현**

`lib/search.ts`:

```ts
export type SearchResult = {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  source: 'place' | 'address';
};

export function looksLikeAddress(q: string): boolean {
  if (!q) return false;
  if (!/\d/.test(q)) return false;
  return /(동|로|길|읍|면|리|가|번지)\s*\d/.test(q);
}

export type RawPlace = {
  id?: string;
  place_name: string;
  address_name: string;
  road_address_name?: string;
  x: string;
  y: string;
  category_group_name?: string;
};

export type RawAddress = {
  address_name: string;
  address?: { address_name: string };
  road_address?: { address_name: string };
  x: string;
  y: string;
};

export function parsePlaceResult(raw: RawPlace, index: number): SearchResult {
  return {
    id: `place_${raw.id ?? index}`,
    name: raw.place_name,
    address: raw.road_address_name?.trim() || raw.address_name,
    lat: parseFloat(raw.y),
    lng: parseFloat(raw.x),
    source: 'place',
  };
}

export function parseAddressResult(raw: RawAddress, index: number): SearchResult {
  const roadName = raw.road_address?.address_name;
  const jibunName = raw.address?.address_name;
  const primary = roadName ?? raw.address_name;
  const secondary = roadName && jibunName ? jibunName : '';
  return {
    id: `addr_${index}_${hash(raw.address_name)}`,
    name: primary,
    address: secondary,
    lat: parseFloat(raw.y),
    lng: parseFloat(raw.x),
    source: 'address',
  };
}

function hash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}
```

**Step 4: 테스트 통과 확인**

Run: `cd /Users/psy/Projects/drone-gcp-platform && npm test`
Expected: 모든 신규 테스트 PASS, 기존 43개 테스트도 PASS (총 ~53개).

**Step 5: typecheck 확인**

Run: `cd /Users/psy/Projects/drone-gcp-platform && npm run typecheck`
Expected: clean.

**Step 6: 커밋**

```bash
cd /Users/psy/Projects/drone-gcp-platform
git add lib/search.ts lib/__tests__/search.test.ts
git commit -m "feat(search): heuristic and response parsers with TDD"
```

---

## Task 2: Kakao SDK 타입 확장 + SDK URL 업데이트 + 임시 마커 라벨 스타일

**Files:**
- Modify: `types/kakao.d.ts`
- Modify: `components/MapContainer.tsx` (SDK URL만, 검색 통합은 Task 3)
- Modify: `app/globals.css`

**Step 1: `types/kakao.d.ts`에 services namespace 추가**

`types/kakao.d.ts` 파일의 `namespace kakao.maps { ... }` 블록 안에 `drawing` namespace 다음에 다음 블록을 추가:

```ts
    namespace services {
      type Status = 'OK' | 'ZERO_RESULT' | 'ERROR';

      interface PlacesSearchResultItem {
        id?: string;
        place_name: string;
        address_name: string;
        road_address_name?: string;
        x: string;
        y: string;
        category_group_name?: string;
      }

      interface AddressSearchResultItem {
        address_name: string;
        address?: { address_name: string };
        road_address?: { address_name: string; building_name?: string };
        x: string;
        y: string;
      }

      interface SearchOptions {
        size?: number;
        page?: number;
      }

      class Places {
        constructor();
        keywordSearch(
          keyword: string,
          callback: (result: PlacesSearchResultItem[], status: Status) => void,
          options?: SearchOptions,
        ): void;
      }

      class Geocoder {
        constructor();
        addressSearch(
          address: string,
          callback: (result: AddressSearchResultItem[], status: Status) => void,
        ): void;
      }
    }
```

위치 주의: `namespace drawing { ... }` 닫는 중괄호 바로 다음, `namespace kakao.maps`의 닫는 중괄호 앞.

**Step 2: `components/MapContainer.tsx`의 SDK URL 업데이트**

`loadKakaoSdk` 함수에서 fresh-load 부분의 `script.src` 라인을 찾는다:

기존:
```ts
script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${appKey}&libraries=drawing&autoload=false`;
```

교체:
```ts
script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${appKey}&libraries=drawing,services&autoload=false`;
```

**Step 3: `app/globals.css`에 검색 마커 라벨 스타일 추가**

기존 `.gcp-label` 블록 다음에 추가:

```css
.search-label {
  display: inline-block;
  background-color: #2563eb;
  color: #ffffff;
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 9999px;
  border: 2px solid #ffffff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
  white-space: nowrap;
  pointer-events: none;
  transform: translate(-50%, 0);
  max-width: 240px;
  overflow: hidden;
  text-overflow: ellipsis;
}
```

**Step 4: 검증**

```bash
cd /Users/psy/Projects/drone-gcp-platform
npm run typecheck   # clean
npm test            # 모든 테스트 PASS (Task 1의 신규 + 기존 43개)
npm run build       # 성공
```

**Step 5: 커밋**

```bash
cd /Users/psy/Projects/drone-gcp-platform
git add types/kakao.d.ts components/MapContainer.tsx app/globals.css
git commit -m "chore: extend Kakao types for services, add services library, search label style"
```

---

## Task 3: SearchBar 컴포넌트 + MapContainer 통합

**Files:**
- Create: `components/SearchBar.tsx`
- Modify: `components/MapContainer.tsx`

**Step 1: `components/SearchBar.tsx` 작성**

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import {
  looksLikeAddress,
  parseAddressResult,
  parsePlaceResult,
  type SearchResult,
} from '@/lib/search';

type Props = {
  onSelect: (result: SearchResult) => void;
};

const DEBOUNCE_MS = 300;
const MAX_RESULTS = 5;
const MIN_QUERY_LENGTH = 2;

type SearchState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'results'; items: SearchResult[] }
  | { kind: 'empty' }
  | { kind: 'error' };

export default function SearchBar({ onSelect }: Props) {
  const [query, setQuery] = useState('');
  const [state, setState] = useState<SearchState>({ kind: 'idle' });
  const [open, setOpen] = useState(false);
  const latestRequestRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // 외부 클릭 시 드롭다운 닫기
  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  // 디바운스 + 검색 실행
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setState({ kind: 'idle' });
      return;
    }

    const requestId = ++latestRequestRef.current;
    setState({ kind: 'loading' });

    const timer = setTimeout(() => {
      runSearch(trimmed)
        .then((items) => {
          if (requestId !== latestRequestRef.current) return;
          if (items.length === 0) setState({ kind: 'empty' });
          else setState({ kind: 'results', items: items.slice(0, MAX_RESULTS) });
        })
        .catch(() => {
          if (requestId !== latestRequestRef.current) return;
          setState({ kind: 'error' });
        });
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query]);

  const handleSelect = (result: SearchResult) => {
    onSelect(result);
    setOpen(false);
  };

  const handleClear = () => {
    setQuery('');
    setState({ kind: 'idle' });
    setOpen(false);
  };

  return (
    <div
      ref={containerRef}
      className="absolute left-1/2 top-3 z-10 w-80 -translate-x-1/2"
    >
      <div className="flex items-center rounded-md border border-gray-200 bg-white shadow">
        <span className="pl-3 text-gray-400" aria-hidden>🔍</span>
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="주소·장소 검색"
          className="flex-1 bg-transparent px-2 py-2 text-sm outline-none"
        />
        {query && (
          <button
            type="button"
            onClick={handleClear}
            className="px-3 py-2 text-sm text-gray-400 hover:text-gray-700"
            aria-label="검색 지우기"
          >
            ✕
          </button>
        )}
      </div>

      {open && state.kind !== 'idle' && (
        <div className="mt-1 max-h-80 overflow-auto rounded-md border border-gray-200 bg-white shadow">
          {state.kind === 'loading' && (
            <div className="p-3 text-sm text-gray-500">검색 중...</div>
          )}
          {state.kind === 'empty' && (
            <div className="p-3 text-sm text-gray-500">검색 결과가 없습니다.</div>
          )}
          {state.kind === 'error' && (
            <div className="p-3 text-sm text-red-600">검색 실패. 잠시 후 다시 시도하세요.</div>
          )}
          {state.kind === 'results' &&
            state.items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelect(item)}
                className="block w-full border-b border-gray-100 px-3 py-2 text-left text-sm last:border-b-0 hover:bg-blue-50"
              >
                <div className="font-medium text-gray-900">{item.name}</div>
                {item.address && (
                  <div className="mt-0.5 text-xs text-gray-500">{item.address}</div>
                )}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

async function runSearch(query: string): Promise<SearchResult[]> {
  const services = window.kakao?.maps?.services;
  if (!services) throw new Error('services library not loaded');

  const tryAddress = () =>
    new Promise<SearchResult[]>((resolve) => {
      const geocoder = new services.Geocoder();
      geocoder.addressSearch(query, (result, status) => {
        if (status === 'OK') {
          resolve(result.map((r, i) => parseAddressResult(r, i)));
        } else {
          resolve([]);
        }
      });
    });

  const tryPlace = () =>
    new Promise<SearchResult[]>((resolve) => {
      const places = new services.Places();
      places.keywordSearch(
        query,
        (result, status) => {
          if (status === 'OK') {
            resolve(result.map((r, i) => parsePlaceResult(r, i)));
          } else {
            resolve([]);
          }
        },
        { size: 10 },
      );
    });

  const primary = looksLikeAddress(query) ? tryAddress : tryPlace;
  const fallback = looksLikeAddress(query) ? tryPlace : tryAddress;

  const first = await primary();
  if (first.length > 0) return first;
  return fallback();
}
```

**Step 2: `components/MapContainer.tsx`에 SearchBar 통합**

상단 import에 추가:
```ts
import SearchBar from './SearchBar';
import type { SearchResult } from '@/lib/search';
```

`useRef` 그룹에 추가:
```ts
const searchMarkerRef = useRef<{
  marker: kakao.maps.Marker;
  overlay: kakao.maps.CustomOverlay;
} | null>(null);
```

기존 unmount cleanup useEffect를 찾아서 검색 마커 정리 추가:

기존:
```ts
useEffect(() => {
  return () => {
    markersRef.current.forEach(({ marker, overlay }) => {
      marker.setMap(null);
      overlay.setMap(null);
    });
    markersRef.current.clear();
    polygonRef.current?.setMap(null);
    polygonRef.current = null;
    drawingManagerRef.current?.cancel();
    drawingManagerRef.current = null;
  };
}, []);
```

교체:
```ts
useEffect(() => {
  return () => {
    markersRef.current.forEach(({ marker, overlay }) => {
      marker.setMap(null);
      overlay.setMap(null);
    });
    markersRef.current.clear();
    polygonRef.current?.setMap(null);
    polygonRef.current = null;
    drawingManagerRef.current?.cancel();
    drawingManagerRef.current = null;
    searchMarkerRef.current?.marker.setMap(null);
    searchMarkerRef.current?.overlay.setMap(null);
    searchMarkerRef.current = null;
  };
}, []);
```

`handleSearchSelect` 핸들러 함수를 컴포넌트 안 (return 위)에 추가:

```ts
const handleSearchSelect = (result: SearchResult) => {
  const map = mapRef.current;
  if (!map) return;
  const kakao = window.kakao;
  const pos = new kakao.maps.LatLng(result.lat, result.lng);

  map.setCenter(pos);
  map.setLevel(3);

  // 기존 임시 마커 제거
  if (searchMarkerRef.current) {
    searchMarkerRef.current.marker.setMap(null);
    searchMarkerRef.current.overlay.setMap(null);
    searchMarkerRef.current = null;
  }

  // 새 임시 마커
  const marker = new kakao.maps.Marker({ position: pos, map });
  const content = document.createElement('div');
  content.className = 'search-label';
  content.textContent = result.name;
  const overlay = new kakao.maps.CustomOverlay({
    position: pos,
    content,
    yAnchor: 2.4,
    zIndex: 4,
    map,
    clickable: false,
  });
  searchMarkerRef.current = { marker, overlay };
};
```

마지막 return의 JSX에서 status === 'ready' 블록 안 (지도 타입 토글 옆 또는 위)에 SearchBar 마운트:

기존 ready 분기:
```tsx
{status === 'ready' && (
  <div className="absolute right-3 top-3 z-10 flex overflow-hidden rounded-md border border-gray-200 bg-white shadow">
    {(['SKYVIEW', 'ROADMAP', 'HYBRID'] as MapType[]).map((t) => (
      ...
    ))}
  </div>
)}
```

타입 토글 블록 바로 위에 추가:
```tsx
{status === 'ready' && <SearchBar onSelect={handleSearchSelect} />}
```

**Step 3: 검증**

```bash
cd /Users/psy/Projects/drone-gcp-platform
npm run typecheck   # clean
npm test            # 모든 테스트 PASS
npm run build       # 성공
```

**Step 4: 수동 테스트 (`npm run dev` 후 브라우저)**

체크리스트:
- 검색바가 지도 상단 중앙에 표시됨
- "삼성동" 입력 → 장소 결과
- "강남대로 396" 입력 → 주소 결과
- 결과 클릭 시 지도 이동 + 파란색 임시 마커 표시
- X 버튼 클릭 시 입력 초기화 + 드롭다운 닫힘
- 외부 클릭 시 드롭다운 닫힘
- 다른 결과 클릭 시 임시 마커가 새 위치로 교체

(이 단계는 사용자 확인. 동작 안 하면 디버깅 후 다음 단계로.)

**Step 5: 커밋**

```bash
cd /Users/psy/Projects/drone-gcp-platform
git add components/SearchBar.tsx components/MapContainer.tsx
git commit -m "feat(search): SearchBar component and map integration with temp marker"
```

---

## Task 4: README 업데이트

**Files:**
- Modify: `README.md`

**Step 1: 사용법 섹션에 검색 단계 추가**

기존 사용법 항목 위에 검색 단계를 1번으로 삽입하거나, 새 단계로 추가:

기존 사용법이 다음 형태일 것:
```markdown
## 사용법

1. 사이드바에서 "구역 그리기" 시작
2. 지도에서 다각형 꼭짓점 클릭, 마지막 점 더블클릭으로 완료
3. GCP 자동 추천됨. 슬라이더로 개수 조정 가능
4. GCP 마커 드래그(이동), 우클릭(삭제), 지도 빈 곳 클릭(추가 — 폴리곤 외부도 가능)
5. 헤더의 "KML 다운로드"
```

교체:
```markdown
## 사용법

1. 지도 상단 검색바에서 주소 또는 장소(예: "삼성동", "스타벅스 강남역") 입력 → 결과 클릭으로 현장 위치 찾기
2. 사이드바에서 "구역 그리기" 시작
3. 지도에서 다각형 꼭짓점 클릭, 마지막 점 더블클릭으로 완료
4. GCP 자동 추천됨. 슬라이더로 개수 조정 가능
5. GCP 마커 드래그(이동), 우클릭(삭제), 지도 빈 곳 클릭(추가 — 폴리곤 외부도 가능)
6. 헤더의 "KML 다운로드"
```

**Step 2: 트러블슈팅에 카카오맵 서비스 활성화 항목 추가**

(이전 디버깅에서 발견한 내용. 이 시점에 같이 추가)

트러블슈팅 섹션 끝에 추가:

```markdown
- **"App(xxx) disabled OPEN_MAP_AND_LOCAL service" 에러**: 카카오 개발자 콘솔의 **제품 설정 → 카카오맵**에서 카카오맵 서비스가 활성화되어 있는지 확인. 도메인 등록과는 별도 설정.
- **검색이 안 됨**: SDK URL에 `libraries=drawing,services` 파라미터가 포함되어 있는지 확인 (코드에 포함됨). 강력 새로고침으로 캐시된 SDK 제거.
```

**Step 3: 스택 섹션 업데이트**

기존:
```markdown
- Kakao Maps JavaScript SDK (지도 + Drawing Library, 동적 스크립트 로드)
```

교체:
```markdown
- Kakao Maps JavaScript SDK (지도 + Drawing + Services 라이브러리, 동적 스크립트 로드)
```

**Step 4: 수동 검증 체크리스트에 검색 항목 추가**

기존 수동 검증 항목 1번 다음에 삽입:

```markdown
2. 지도 상단 검색바에서 "삼성동" 입력 → 장소 결과 확인
3. 검색바에서 "강남대로 396" 입력 → 주소 결과 확인
4. 결과 클릭 → 지도가 해당 위치로 이동하고 파란색 임시 마커 표시
5. X 버튼 클릭 → 검색 초기화
```

(이후 항목 번호 조정)

**Step 5: 최종 검증**

```bash
cd /Users/psy/Projects/drone-gcp-platform
npm run typecheck
npm test
npm run build
```

세 가지 모두 통과.

**Step 6: 커밋**

```bash
cd /Users/psy/Projects/drone-gcp-platform
git add README.md
git commit -m "docs: document search feature, service activation troubleshooting"
```

---

## Out of Scope (이번 계획 제외)

- 검색 결과를 GCP로 직접 추가 (현재는 임시 마커만)
- 키보드 네비게이션 (↑↓ Enter)
- 검색 히스토리·즐겨찾기
- 위치 기반 우선순위 (지도 중심 근처 우선)
- 자동완성
- 모바일 터치 최적화
