# Kakao Maps Migration — Design

Date: 2026-06-08
Status: Approved

## 1. Purpose

기존 Google Maps 기반 지도 컴포넌트를 카카오맵 SDK로 완전 교체한다. 한국 내 드론 매핑 용도에 더 적합한 위성 영상 품질과 국내 지명·주소 검색을 활용하기 위함이다.

## 2. Scope

**제거:**
- `@react-google-maps/api` npm 의존성
- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` 환경변수
- `components/MapContainer.tsx`의 Google Maps 코드 (인터페이스/책임은 유지)

**추가:**
- Kakao Maps JavaScript SDK (스크립트 동적 로드)
- `NEXT_PUBLIC_KAKAO_MAP_APP_KEY` 환경변수
- `types/kakao.d.ts` — 우리가 쓰는 API에 한정한 자체 타입 정의
- 지도 타입 토글 UI (스카이뷰 / 일반 / 하이브리드)

**유지 (변경 없음):**
- `lib/geometry.ts`, `lib/gcp-algorithm.ts`, `lib/kml-generator.ts`, `lib/store.ts`
- 43개 단위 테스트
- `components/Sidebar.tsx`, `components/Header.tsx`

## 3. Why Kakao

- 국내 위성 영상(스카이뷰) 해상도 우수
- 한국 지명·주소 데이터 풍부
- 일일 30만 건 무료 할당 (소규모 운용에 충분)
- 도메인 등록 기반 접근 제어로 키 노출 위험 감소

## 4. SDK Loading Strategy

카카오맵은 React 컴포넌트 라이브러리가 빈약하므로 vanilla SDK를 직접 로드한다.

```ts
useEffect(() => {
  if (window.kakao?.maps) { init(); return; }

  // 스크립트 중복 로드 방지
  const existing = document.querySelector('script[data-kakao-maps]');
  if (existing) {
    existing.addEventListener('load', () => window.kakao.maps.load(init));
    return;
  }

  const script = document.createElement('script');
  script.src = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${appKey}&libraries=drawing&autoload=false`;
  script.async = true;
  script.dataset.kakaoMaps = 'true';
  script.onload = () => window.kakao.maps.load(init);
  script.onerror = () => setError('지도 SDK 로드 실패');
  document.head.appendChild(script);
}, [appKey]);
```

`autoload=false` + `window.kakao.maps.load(callback)`는 카카오의 권장 비동기 로드 패턴이다.

## 5. Architecture

### 5.1 MapContainer 책임 (변경 없음)

- 폴리곤 그리기 모드 진입/완료
- 폴리곤 렌더링 (store.polygon 구독)
- GCP 마커 렌더링, 드래그, 우클릭 삭제, 빈 곳 클릭 추가
- 지도 타입 토글 (신규)
- 에러 상태 UI (API 키 없음, 로드 실패, 로딩 중)

### 5.2 내부 상태 관리

지도 객체와 마커는 React state 밖에서 관리 (카카오 SDK는 명령형):

```ts
const mapRef = useRef<KakaoMap | null>(null);
const polygonRef = useRef<KakaoPolygon | null>(null);
const markersRef = useRef<Map<string, { marker: KakaoMarker; overlay: KakaoCustomOverlay }>>(new Map());
const drawingManagerRef = useRef<KakaoDrawingManager | null>(null);
```

`useEffect`로 store 상태와 동기화:
- `polygon` 변경 → 기존 polygon 제거 → 새로 그리기
- `gcps` 변경 → diff 계산 → 추가/삭제/이동 적용
- `drawingMode` 변경 → DrawingManager 활성화/비활성화

### 5.3 GCP 마커 + 라벨

카카오 `Marker`는 라벨을 직접 지원하지 않으므로 `CustomOverlay`를 마커 옆에 띄운다:

```ts
const marker = new kakao.maps.Marker({ position, draggable: true });
const overlay = new kakao.maps.CustomOverlay({
  position,
  content: `<div class="gcp-label">${label}</div>`,
  yAnchor: 2.2,  // 마커 위로 라벨 배치
});
```

마커와 overlay는 함께 추가/제거/이동된다.

## 6. Map Type Toggle

지도 우상단에 떠있는 버튼 그룹 (absolute positioned):

```
┌─────────────────────────────┐
│                  [스카이뷰][일반][하이브리드] │
│                              │
│         지도 영역            │
└─────────────────────────────┘
```

`map.setMapTypeId(kakao.maps.MapTypeId.SKYVIEW | ROADMAP | HYBRID)` 호출.

상태는 React state로 보관 (`useState<'SKYVIEW' | 'ROADMAP' | 'HYBRID'>`).

기본값: `SKYVIEW` (드론 현장 시각화 우선).

## 7. Error Handling

| 케이스 | 처리 |
|---|---|
| 앱키 미설정 | 안내 카드 (기존 동일 형태, 카카오 발급 안내) |
| 스크립트 로드 실패 (네트워크/도메인 제한) | "지도 로딩 실패. 앱키와 도메인 설정을 확인하세요" |
| `kakao.maps.load` 5초 내 미실행 | 타임아웃 에러 |
| 폴리곤 그리기 도중 ESC | DrawingManager 기본 동작에 위임 |

## 8. Type Definitions

선택 A: 자체 `types/kakao.d.ts` 작성 (외부 의존 회피).

우리가 사용하는 표면:
- `kakao.maps.Map`, `LatLng`, `LatLngBounds`
- `kakao.maps.Marker`, `CustomOverlay`, `Polygon`
- `kakao.maps.drawing.DrawingManager`, `OverlayType`
- `kakao.maps.MapTypeId.SKYVIEW | ROADMAP | HYBRID`
- `kakao.maps.event.addListener / removeListener`
- `kakao.maps.load(callback)`

전역 `Window` 확장으로 `window.kakao` 접근 가능하게 한다.

예상 200줄 미만.

## 9. SSR Considerations

`app/page.tsx`는 현재 `'use client'` + `dynamic(MapContainer, { ssr: false })`로 마운트한다.

카카오 SDK는 `useEffect` 내부에서만 `window`에 접근하므로 SSR 안전. 그러나 `next/dynamic + ssr: false` 패턴은 그대로 유지한다 (불필요한 SSR HTML 생성 방지 + 코드 분할 이득).

## 10. Testing

- 단위 테스트 43개: 변경 없음, 통과 유지 확인
- MapContainer는 외부 SDK 의존이므로 단위 테스트 생략
- 수동 검증 체크리스트:
  1. 앱키 없을 때 안내 UI 표시
  2. 앱키 설정 후 지도 로드 (기본 스카이뷰)
  3. 타입 토글로 일반/하이브리드 전환
  4. 다각형 그리기 → 자동 GCP 추천
  5. GCP 드래그/우클릭/빈 곳 클릭
  6. 슬라이더 조정
  7. 재추천 버튼
  8. KML 다운로드 → 좌표 검증 (Google Earth)

## 11. Out of Scope

- 카카오 로컬 검색 API (주소/장소)
- 좌표계 변환 (카카오는 내부 WGS84 사용, 출력도 WGS84 그대로)
- 카카오 외 다른 지도(Google/Leaflet) 동시 지원 (YAGNI)
- 카카오 SDK 타입을 npm 의존으로 분리 배포

## 12. File Changes Summary

```
Modified:
  components/MapContainer.tsx        — 완전 재작성 (인터페이스 동일)
  app/page.tsx                       — dynamic import 옵션 검토 (유지)
  app/globals.css                    — .gcp-label 스타일 추가
  .env.local.example                 — Google 키 제거, 카카오 키 추가
  README.md                          — 카카오맵 설정 안내
  package.json                       — @react-google-maps/api 제거

New:
  types/kakao.d.ts                   — 카카오 SDK 타입 정의
  tsconfig.json                      — include에 types 추가 (필요시)

Unchanged:
  lib/**, components/Sidebar.tsx, components/Header.tsx, lib/__tests__/**
```
