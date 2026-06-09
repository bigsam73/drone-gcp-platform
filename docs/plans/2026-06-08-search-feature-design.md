# Address / Place Search Feature — Design

Date: 2026-06-08
Status: Approved

## 1. Purpose

드론 매핑 현장 위치를 빠르게 찾을 수 있도록 주소·장소 검색 기능을 추가한다. 산악·논밭 지역은 정확한 주소가 모호하므로 장소(상호·랜드마크) 검색을 함께 지원한다. 검색 결과를 클릭하면 지도가 해당 위치로 이동하고 임시 마커를 표시해 사용자가 폴리곤 그리기를 시작할 정확한 지점을 확인할 수 있다.

## 2. Goals

- 지도 상단 중앙의 검색바에서 주소 또는 장소를 입력할 수 있다.
- 입력 형태에 따라 자동으로 적절한 카카오 API(Geocoder / Places)를 호출한다.
- 결과 드롭다운에서 항목 선택 시 지도가 해당 위치로 이동하고 임시 마커가 표시된다.
- 임시 마커는 GCP 마커(빨강)와 시각적으로 구분된다.

## 3. Non-Goals (YAGNI)

- 검색 결과를 GCP로 직접 추가하는 기능
- 키보드 단축키(↑↓ Enter) 네비게이션
- 검색 히스토리, 즐겨찾기
- 카테고리 필터
- 다음 우편번호 팝업 통합

## 4. Tech Choice

- **Kakao Maps SDK `services` 라이브러리** 사용
- SDK URL에 `libraries=drawing,services` 추가
- 추가 키 발급 불필요, 백엔드 API Route 불필요
- 현재 MapContainer 클라이언트 컴포넌트 구조와 자연스럽게 통합

## 5. Search Routing Heuristic

```ts
const looksLikeAddress = (q: string) =>
  /\d/.test(q) && /(동|로|길|읍|면|리|가|번지)\s*\d/.test(q);
```

- `true` → `Geocoder.addressSearch()` 호출
- `false` → `Places.keywordSearch()` 호출
- 응답 0건일 경우 반대 API로 폴백 (1회만)

단순 휴리스틱이라 완벽하지 않지만, "삼성동", "스타벅스 강남역", "테헤란로 152" 같은 일반적인 입력에서 잘 동작한다.

## 6. Unified Result Model

```ts
type SearchResult = {
  id: string;          // place id 또는 address_name 해시
  name: string;        // 표시명 (장소명 또는 주소)
  address: string;     // 보조 정보 (도로명/지번)
  lat: number;
  lng: number;
  source: 'place' | 'address';
};
```

- 카카오 응답에서 `y`(위도)와 `x`(경도)는 문자열 → `parseFloat` 필요
- `id` 생성: place는 `place_${index}`, address는 `addr_${hash(address_name)}`

## 7. UI Layout

```
지도 영역 (relative)
┌──────────────────────────────────────────────────┐
│              ┌──────────────────────────┐         │
│              │ 🔍 주소·장소 검색      ✕│ ← 상단 │
│              ├──────────────────────────┤         │
│              │ ▢ 결과 이름             │         │
│              │   보조 주소             │         │
│              │ ▢ ...                   │         │
│              └──────────────────────────┘         │
│                                                  │
│                                    [타입토글]    │
│                  지도                            │
└──────────────────────────────────────────────────┘
```

- 검색바: `absolute top-3 left-1/2 -translate-x-1/2 w-80 z-10`
- 입력란 + 우측 X 버튼 + 아래 드롭다운
- 결과는 최대 5개
- 결과 클릭 시 드롭다운 닫힘, 입력 텍스트는 유지
- 외부 클릭 시 드롭다운 닫힘

## 8. Component Structure

```
MapContainer
├── 지도 컨테이너 div
├── SearchBar (신규 분리)
│   ├── 입력란
│   ├── X 버튼
│   └── 결과 드롭다운
└── 타입 토글 (기존)
```

`SearchBar` 분리 이유: MapContainer가 이미 350줄이므로 검색 로직(디바운스, API 호출, 결과 관리)을 분리해 가독성 유지.

`SearchBar`가 받는 props:
```ts
type Props = {
  onSelect: (result: SearchResult) => void;
};
```

지도 이동과 임시 마커 그리기는 MapContainer가 `onSelect`에서 처리.

## 9. Debouncing and Race Condition Handling

```ts
// SearchBar 내부
useEffect(() => {
  if (query.trim().length < 2) {
    setResults([]);
    return;
  }
  const requestId = ++latestRequestRef.current;
  const timer = setTimeout(() => {
    runSearch(query).then((res) => {
      if (requestId !== latestRequestRef.current) return; // stale
      setResults(res);
    });
  }, 300);
  return () => clearTimeout(timer);
}, [query]);
```

- 디바운스 300ms
- `latestRequestRef`로 stale 응답 무시
- 입력 < 2자는 검색 안 함

## 10. Temporary Marker

MapContainer가 관리:

```ts
const searchMarkerRef = useRef<{
  marker: kakao.maps.Marker;
  overlay: kakao.maps.CustomOverlay;
} | null>(null);
```

- 새 선택 시 기존 제거 → 새로 추가
- 색: 파란색 (#2563eb) — 폴리곤보다 진한 파랑으로 구분
- 라벨: 선택 결과의 `name` (CSS 클래스 `.search-label`)
- `clickable: false` (GCP 추가 클릭과 혼동 방지)
- 컴포넌트 언마운트 시 제거

## 11. SDK Loading Change

`loadKakaoSdk` 함수의 URL만 변경:

```ts
script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${appKey}&libraries=drawing,services&autoload=false`;
```

`window.kakao.maps.services.Places`와 `Geocoder`가 `kakao.maps.load` 콜백 내에서 즉시 사용 가능.

## 12. Error Handling

| 케이스 | 처리 |
|---|---|
| `services` 라이브러리 로드 실패 | 검색바를 렌더링하지 않음. 지도는 정상 동작 |
| 입력 < 2자 | 검색 실행 안 함, 드롭다운 비표시 |
| API 응답 `ZERO_RESULT` | 드롭다운에 "검색 결과가 없습니다" 표시 |
| API 응답 `ERROR` | 콘솔 경고 + 드롭다운에 "검색 실패" 표시 |
| 빠른 연속 입력 | 디바운스 + request id로 안전 |

## 13. Testing

**단위 테스트 (Vitest):**
- `lib/search.ts`로 분리한 `looksLikeAddress` 휴리스틱
- 카카오 응답을 `SearchResult`로 변환하는 `parsePlaceResult`, `parseAddressResult` 순수 함수

**통합 테스트는 생략** (SDK 의존 컴포넌트는 수동 검증).

**수동 검증:**
- "삼성동" → 장소 결과
- "강남대로 396" → 주소 결과
- "스타벅스 강남역" → 장소 결과
- 빠르게 타이핑 시 디바운스 동작
- 결과 클릭 시 지도 이동 + 임시 마커
- X 버튼으로 입력/드롭다운/마커 초기화

## 14. File Changes Summary

```
Modified:
  components/MapContainer.tsx   — SDK URL에 services 추가, 임시 마커 관리, SearchBar 마운트
  types/kakao.d.ts              — services namespace 추가
  app/globals.css               — .search-label 스타일 추가

New:
  components/SearchBar.tsx      — 검색바 UI + 디바운스 + API 호출
  lib/search.ts                 — looksLikeAddress + 응답 파서 (TDD)
  lib/__tests__/search.test.ts  — 휴리스틱·파서 단위 테스트

Unchanged:
  lib/geometry.ts, lib/gcp-algorithm.ts, lib/kml-generator.ts, lib/store.ts
  components/Sidebar.tsx, components/Header.tsx
  기존 43개 단위 테스트
```

## 15. Out of Scope

- 검색 결과를 GCP로 직접 추가
- 키보드 네비게이션
- 다국어
- 검색 자동완성
- 위치 기반 검색 우선순위 (지도 중심 근처 우선)
