# GCP Recommendation Presets — Design

Date: 2026-06-08
Status: Approved

## 1. Purpose

GCP 권장 개수 계산을 단일 공식에서 **선택 가능한 프리셋**으로 확장한다. 프로젝트 유형(평범한 매핑, 고도 정확도, 한국 법정 측량 등)에 맞춰 사용자가 6개 기준 중 선택할 수 있게 한다.

배치 알고리즘(모서리→변→내부)은 그대로 유지하고, 권장 개수 공식만 다양화한다.

## 2. Goals

- 사용자가 사이드바에서 6개 GCP 기준 중 선택할 수 있다.
- 선택한 기준이 다음 세션에도 유지된다 (localStorage).
- 기준 변경 시 자동으로 GCP가 재추천된다.
- 각 기준의 출처와 용도를 툴팁으로 확인할 수 있다.
- 기존 동작에 영향 없다 (기본 Standard 동일).

## 3. Non-Goals (YAGNI)

- 사용자 커스텀 공식 입력
- 프리셋 가져오기/내보내기
- 프리셋별 배치 알고리즘 변경
- 다국어
- 프리셋 추가 UI

## 4. The Six Presets

| ID | 이름 | 공식 | 1ha | 10ha | 100ha | 출처 |
|---|---|---|---|---|---|---|
| `standard` | Standard (기본) | `max(5, ceil(ha/10) + 4)` | 5 | 5 | 14 | 내부 권장 |
| `pix4d-default` | Pix4D Default | `max(5, ceil(ha/20) + 4)` | 5 | 5 | 9 | Pix4D 공식 가이드 |
| `pix4d-precision` | Pix4D Precision | `max(10, ceil(ha/10) + 9)` | 10 | 10 | 19 | Pix4D 정밀 매핑 |
| `agisoft` | Agisoft Metashape | `max(5, ceil(ha/15) + 4)` | 5 | 5 | 11 | Agisoft 매뉴얼 |
| `ngii` | 국토지리정보원 (1:1,000) | `max(9, ceil(ha/11.1))` | 9 | 9 | 9 | 국토지리정보원 공공측량 작업규정 |
| `asprs` | ASPRS (RMSE 1px) | `max(5, ceil(ha/20) + 3)` | 5 | 5 | 8 | ASPRS Positional Accuracy Standards |

모든 공식: `ha <= 0` → `0`.

## 5. Architecture

### 5.1 새 모듈: `lib/recommendation-presets.ts`

```ts
export type RecommendationPresetId =
  | 'standard'
  | 'pix4d-default'
  | 'pix4d-precision'
  | 'agisoft'
  | 'ngii'
  | 'asprs';

export type RecommendationPreset = {
  id: RecommendationPresetId;
  name: string;
  formula: (areaHa: number) => number;
  description: string;
  source: string;
};

export const PRESETS: RecommendationPreset[];

export function getPreset(id: RecommendationPresetId): RecommendationPreset;
export function isValidPresetId(id: string): id is RecommendationPresetId;
export const DEFAULT_PRESET_ID: RecommendationPresetId = 'standard';
```

### 5.2 알고리즘 확장: `lib/gcp-algorithm.ts`

`recommendCount` 시그니처에 선택 인자 추가:

```ts
// 기존
export function recommendCount(areaHa: number): number

// 변경 — 두 번째 인자 선택, 생략 시 'standard'
export function recommendCount(
  areaHa: number,
  presetId: RecommendationPresetId = 'standard',
): number {
  return getPreset(presetId).formula(areaHa);
}
```

하위 호환: 기존 호출자(테스트 포함)는 두 번째 인자 생략 → 'standard' → 기존과 동일한 결과.

### 5.3 스토어 확장: `lib/store.ts`

```ts
type State = {
  // 기존 +
  preset: RecommendationPresetId;
};

type Actions = {
  // 기존 +
  setPreset: (id: RecommendationPresetId) => void;
};
```

`setPreset` 동작:
1. preset 상태 업데이트
2. `localStorage.setItem('drone-gcp-preset', id)` 저장
3. 폴리곤이 있으면:
   - `userCountOverride === null` → 새 preset 공식으로 재추천
   - `userCountOverride !== null` → 사용자가 명시적으로 정한 개수 보존

`setPolygon`, `regenerate`, `setUserCount`도 내부에서 `recommendCount` 호출 시 `get().preset`을 전달하도록 수정.

초기 상태:
```ts
preset: DEFAULT_PRESET_ID  // SSR-safe
```

mount 후 useEffect로 localStorage 복원 (별도 컴포넌트에서 처리, 또는 Sidebar에서):
```ts
useEffect(() => {
  const saved = localStorage.getItem('drone-gcp-preset');
  if (saved && isValidPresetId(saved)) {
    useStore.getState().setPreset(saved);
  }
}, []);
```

이렇게 하면 SSR 시점엔 항상 'standard'로 렌더링되고, hydration 후 사용자 선택값으로 갱신.

### 5.4 Sidebar UI

기존 컨트롤 패널에 신규 섹션 추가 (슬라이더 위):

```
GCP 기준                  ← 라벨
  ◉ Standard (기본)   ⓘ
  ○ Pix4D Default     ⓘ
  ○ Pix4D Precision   ⓘ
  ○ Agisoft Metashape ⓘ
  ○ 국토지리정보원     ⓘ
  ○ ASPRS             ⓘ
```

- shadcn `RadioGroup` + `RadioGroupItem`
- 각 항목 옆 `Tooltip` (ⓘ 아이콘) → description 표시
- 라벨 클릭 영역 = 전체 행 (a11y)
- 폴리곤 없으면 비활성화 (아직 면적 계산 불가능)

## 6. Data Flow

```
사용자 RadioGroup 선택
  ↓
store.setPreset(id)
  ├─ preset 상태 업데이트
  ├─ localStorage 저장
  └─ polygon && !userCountOverride → 재추천
        └─ recommendCount(area, id) → generateGCPs() → gcps 교체
  ↓
React 리렌더
  ├─ MapContainer: gcps diff → 마커 업데이트
  └─ Sidebar: 면적/권장/현재 표시 갱신
```

## 7. Error Handling

| 케이스 | 처리 |
|---|---|
| localStorage에서 읽은 값이 유효한 preset ID 아님 | DEFAULT_PRESET_ID로 폴백 |
| localStorage 접근 자체 실패 (Safari private mode 등) | try/catch로 무시, 메모리 상태 유지 |
| `setPreset('invalid')` 호출 | TypeScript 컴파일 에러 (런타임 분기는 없음) |
| 면적 0, 음수 | 모든 preset에서 0 반환 |

## 8. Testing

### `lib/__tests__/recommendation-presets.test.ts` (신규, TDD)

- 6개 프리셋 각각의 공식이 명세대로 동작 (1, 10, 50, 100ha 검증)
- 면적 0, 음수 → 0
- `getPreset(id)` 정상 동작
- `isValidPresetId` 유효성 검사
- `PRESETS` 배열에 6개 모두 포함
- 각 preset의 id는 unique

예상 약 15-20개 테스트.

### `lib/__tests__/gcp-algorithm.test.ts` 보강

- `recommendCount(ha)` (preset 생략) → standard 결과
- `recommendCount(ha, 'pix4d-precision')` → 해당 공식 결과

예상 +2-3개 테스트.

### `lib/__tests__/store.test.ts` 추가

- 초기 preset === 'standard'
- `setPreset('pix4d-default')` → preset 변경
- `setPreset` 후 폴리곤+userCountOverride === null → gcps 재생성
- `setPreset` 후 폴리곤+userCountOverride !== null → gcps 유지

예상 +4개 테스트.

### Sidebar는 통합 수동 검증

기존 68개 + 신규 약 22-27개 ≈ 90-95개.

## 9. localStorage Persistence

- 키: `drone-gcp-preset`
- 값: `RecommendationPresetId` 문자열
- 저장 시점: `setPreset()` 호출 시
- 복원 시점: 컴포넌트 마운트 후 useEffect
- 유효하지 않은 값 → DEFAULT_PRESET_ID로 폴백

SSR-safe: 초기 상태는 항상 DEFAULT_PRESET_ID, 클라이언트 mount 후에만 localStorage 접근.

## 10. File Changes Summary

```
New:
  lib/recommendation-presets.ts
  lib/__tests__/recommendation-presets.test.ts
  components/ui/radio-group.tsx       (shadcn add)
  components/ui/tooltip.tsx           (shadcn add)

Modified:
  lib/gcp-algorithm.ts                — recommendCount 시그니처
  lib/__tests__/gcp-algorithm.test.ts — preset 인자 검증
  lib/store.ts                        — preset 상태 + setPreset + localStorage
  lib/__tests__/store.test.ts         — preset 동작 테스트
  components/Sidebar.tsx              — RadioGroup + Tooltip
  README.md                           — 기준 비교표 + 사용법

Unchanged:
  lib/geometry.ts, kml-generator.ts, kml-parser.ts, search.ts
  components/MapContainer.tsx, Header.tsx, SearchBar.tsx, KmlImportButton.tsx
  types/kakao.d.ts
```

## 11. UX Decisions

- **자동 재추천**: 기준 변경 즉시 GCP 재생성 (응답성)
- **수동 편집 보존**: userCountOverride가 있으면 재추천 안 함 (사용자 의도 보호)
- **툴팁**: 각 옵션 옆 ⓘ 호버 시 설명. 라벨 자체에 hover하지 않고 ⓘ로만 활성화하여 우발 표시 방지.
- **localStorage 영속**: 매번 선택할 필요 없음

## 12. Backwards Compatibility

`recommendCount(areaHa)` 호출 (인자 1개)은 그대로 `'standard'` 공식 사용. 기존 코드와 테스트 100% 호환.

스토어의 `setPolygon`은 내부에서 `get().preset`을 사용하므로, preset이 'standard'면 동작 변화 없음.
