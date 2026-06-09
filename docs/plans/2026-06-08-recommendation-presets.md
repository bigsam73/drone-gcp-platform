# GCP Recommendation Presets Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** GCP 권장 개수 계산을 6개 프리셋 중 선택할 수 있게 확장한다. (Standard, Pix4D Default, Pix4D Precision, Agisoft, 국토지리정보원, ASPRS)

**Architecture:** `lib/recommendation-presets.ts`에 프리셋 정의를 모은다. `recommendCount`에 선택 인자를 추가하여 하위 호환을 지킨다. Zustand store에 `preset` 상태와 `setPreset` 액션을 더하고 localStorage로 영속화한다. Sidebar에 shadcn `RadioGroup`과 `Tooltip`을 추가해 사용자가 선택할 수 있게 한다.

**Tech Stack:** Next.js 16, React 19, TypeScript, Zustand, shadcn/ui (RadioGroup + Tooltip), Vitest

---

## Task 1: recommendation-presets 모듈 (TDD)

**Files:**
- Create: `lib/recommendation-presets.ts`
- Create: `lib/__tests__/recommendation-presets.test.ts`

**Step 1: 실패하는 테스트 작성**

`lib/__tests__/recommendation-presets.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  PRESETS,
  getPreset,
  isValidPresetId,
  DEFAULT_PRESET_ID,
  type RecommendationPresetId,
} from '../recommendation-presets';

describe('PRESETS array', () => {
  it('정확히 6개 프리셋 포함', () => {
    expect(PRESETS).toHaveLength(6);
  });

  it('모든 프리셋의 id가 고유', () => {
    const ids = PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('각 프리셋이 필수 필드 보유', () => {
    PRESETS.forEach((p) => {
      expect(typeof p.id).toBe('string');
      expect(typeof p.name).toBe('string');
      expect(typeof p.description).toBe('string');
      expect(typeof p.source).toBe('string');
      expect(typeof p.formula).toBe('function');
    });
  });

  it('6개 ID 모두 존재', () => {
    const ids = PRESETS.map((p) => p.id);
    expect(ids).toContain('standard');
    expect(ids).toContain('pix4d-default');
    expect(ids).toContain('pix4d-precision');
    expect(ids).toContain('agisoft');
    expect(ids).toContain('ngii');
    expect(ids).toContain('asprs');
  });
});

describe('Preset formulas — 0/negative area', () => {
  it.each(['standard', 'pix4d-default', 'pix4d-precision', 'agisoft', 'ngii', 'asprs'] as const)(
    '%s: ha<=0 → 0',
    (id) => {
      const p = getPreset(id);
      expect(p.formula(0)).toBe(0);
      expect(p.formula(-1)).toBe(0);
    },
  );
});

describe('Standard preset formula', () => {
  const f = getPreset('standard').formula;
  it('1 ha → 5', () => expect(f(1)).toBe(5));
  it('10 ha → 5', () => expect(f(10)).toBe(5));
  it('11 ha → 6', () => expect(f(11)).toBe(6));
  it('100 ha → 14', () => expect(f(100)).toBe(14));
});

describe('Pix4D Default formula', () => {
  const f = getPreset('pix4d-default').formula;
  it('1 ha → 5', () => expect(f(1)).toBe(5));
  it('20 ha → 5', () => expect(f(20)).toBe(5));
  it('21 ha → 6', () => expect(f(21)).toBe(6));
  it('100 ha → 9', () => expect(f(100)).toBe(9));
});

describe('Pix4D Precision formula', () => {
  const f = getPreset('pix4d-precision').formula;
  it('1 ha → 10', () => expect(f(1)).toBe(10));
  it('10 ha → 10', () => expect(f(10)).toBe(10));
  it('11 ha → 11', () => expect(f(11)).toBe(11));
  it('100 ha → 19', () => expect(f(100)).toBe(19));
});

describe('Agisoft Metashape formula', () => {
  const f = getPreset('agisoft').formula;
  it('1 ha → 5', () => expect(f(1)).toBe(5));
  it('15 ha → 5', () => expect(f(15)).toBe(5));
  it('16 ha → 6', () => expect(f(16)).toBe(6));
  it('100 ha → 11', () => expect(f(100)).toBe(11));
});

describe('NGII formula', () => {
  const f = getPreset('ngii').formula;
  it('1 ha → 9', () => expect(f(1)).toBe(9));
  it('100 ha → 9', () => expect(f(100)).toBe(9));
  it('111 ha → 10', () => expect(f(111)).toBe(10));
});

describe('ASPRS formula', () => {
  const f = getPreset('asprs').formula;
  it('1 ha → 5', () => expect(f(1)).toBe(5));
  it('20 ha → 5', () => expect(f(20)).toBe(4)); // 4 < 5 → max(5, ...) = 5? 재계산: ceil(20/20)+3 = 1+3 = 4 → max(5,4)=5
  it('40 ha → 5', () => expect(f(40)).toBe(5));
  it('41 ha → 6', () => expect(f(41)).toBe(6));
  it('100 ha → 8', () => expect(f(100)).toBe(8));
});

describe('getPreset / isValidPresetId / DEFAULT_PRESET_ID', () => {
  it('getPreset이 ID에 해당하는 프리셋 반환', () => {
    expect(getPreset('standard').id).toBe('standard');
    expect(getPreset('ngii').id).toBe('ngii');
  });

  it('isValidPresetId는 유효 ID에 true', () => {
    expect(isValidPresetId('standard')).toBe(true);
    expect(isValidPresetId('ngii')).toBe(true);
  });

  it('isValidPresetId는 잘못된 값에 false', () => {
    expect(isValidPresetId('invalid')).toBe(false);
    expect(isValidPresetId('')).toBe(false);
  });

  it('DEFAULT_PRESET_ID는 standard', () => {
    expect(DEFAULT_PRESET_ID).toBe('standard');
  });
});
```

⚠️ ASPRS 테스트 보정: `ceil(20/20) + 3 = 4`, `max(5, 4) = 5`. 그러므로 20ha → 5. 40ha → `ceil(40/20)+3 = 5`, max(5,5)=5. 41ha → `ceil(41/20)+3 = 3+3 = 6`. 100ha → `ceil(100/20)+3 = 5+3 = 8`.

**Step 2: 실패 확인**

```bash
cd /Users/psy/Projects/drone-gcp-platform && npm test
```

Expected: FAIL — 모듈 없음.

**Step 3: 구현**

`lib/recommendation-presets.ts`:

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
  description: string;
  source: string;
  formula: (areaHa: number) => number;
};

const guard = (ha: number, f: () => number) => (ha <= 0 ? 0 : f());

export const PRESETS: RecommendationPreset[] = [
  {
    id: 'standard',
    name: 'Standard (기본)',
    description: '범용 기본값. 작은 면적은 5개, 큰 면적은 10ha당 1개씩 추가.',
    source: '내부 권장',
    formula: (ha) => guard(ha, () => Math.max(5, Math.ceil(ha / 10) + 4)),
  },
  {
    id: 'pix4d-default',
    name: 'Pix4D Default',
    description: '평범한 프로젝트(5–10개 권장). 면적이 클 때 보수적.',
    source: 'Pix4D 공식 가이드',
    formula: (ha) => guard(ha, () => Math.max(5, Math.ceil(ha / 20) + 4)),
  },
  {
    id: 'pix4d-precision',
    name: 'Pix4D Precision',
    description: '고도 정확도가 중요할 때 (예: 토공량 산정). 최소 10개.',
    source: 'Pix4D 정밀 매핑 권장',
    formula: (ha) => guard(ha, () => Math.max(10, Math.ceil(ha / 10) + 9)),
  },
  {
    id: 'agisoft',
    name: 'Agisoft Metashape',
    description: '4–10개 표준. Pix4D Default와 Standard 중간.',
    source: 'Agisoft Metashape 매뉴얼',
    formula: (ha) => guard(ha, () => Math.max(5, Math.ceil(ha / 15) + 4)),
  },
  {
    id: 'ngii',
    name: '국토지리정보원 (1:1,000)',
    description: '한국 드론공공측량 작업규정. 1km²(100ha)당 9개 이상.',
    source: '국토지리정보원 공공측량 작업규정',
    formula: (ha) => guard(ha, () => Math.max(9, Math.ceil(ha / 11.1))),
  },
  {
    id: 'asprs',
    name: 'ASPRS (RMSE 1px)',
    description: '사진측량 학회 표준. RMSE 1픽셀 목표.',
    source: 'ASPRS Positional Accuracy Standards',
    formula: (ha) => guard(ha, () => Math.max(5, Math.ceil(ha / 20) + 3)),
  },
];

export const DEFAULT_PRESET_ID: RecommendationPresetId = 'standard';

const PRESET_MAP = new Map(PRESETS.map((p) => [p.id, p]));

export function getPreset(id: RecommendationPresetId): RecommendationPreset {
  return PRESET_MAP.get(id) ?? PRESETS[0];
}

export function isValidPresetId(id: string): id is RecommendationPresetId {
  return PRESET_MAP.has(id as RecommendationPresetId);
}
```

**Step 4: 테스트 통과 확인**

```bash
cd /Users/psy/Projects/drone-gcp-platform && npm test
```

Expected: ALL pass. 기존 68 + 신규 약 18-22 = ~88-90개.

**Step 5: typecheck + lint**

```bash
cd /Users/psy/Projects/drone-gcp-platform && npm run typecheck && npm run lint
```

Expected: clean.

**Step 6: 커밋**

```bash
cd /Users/psy/Projects/drone-gcp-platform
git add lib/recommendation-presets.ts lib/__tests__/recommendation-presets.test.ts
git commit -m "feat(presets): 6 GCP recommendation presets with TDD"
```

---

## Task 2: gcp-algorithm.recommendCount 확장 (TDD)

**Files:**
- Modify: `lib/gcp-algorithm.ts`
- Modify: `lib/__tests__/gcp-algorithm.test.ts`

**Step 1: 추가 테스트 작성**

`lib/__tests__/gcp-algorithm.test.ts`의 기존 `describe('recommendCount', ...)` 블록 안에 추가:

```ts
  // 신규 — preset 인자
  it('두 번째 인자 생략 시 standard preset 사용', () => {
    expect(recommendCount(100)).toBe(recommendCount(100, 'standard'));
    expect(recommendCount(50)).toBe(recommendCount(50, 'standard'));
  });

  it('preset 인자에 따라 다른 값 반환', () => {
    // pix4d-precision은 100ha → 19, standard는 14
    expect(recommendCount(100, 'pix4d-precision')).toBe(19);
    expect(recommendCount(100, 'standard')).toBe(14);
    expect(recommendCount(100, 'ngii')).toBe(9);
  });

  it('preset 인자로 0 면적은 항상 0', () => {
    expect(recommendCount(0, 'pix4d-precision')).toBe(0);
    expect(recommendCount(0, 'ngii')).toBe(0);
  });
```

또한 기존 import 라인에 `RecommendationPresetId` 추가는 필요 없습니다 (테스트에서 문자열 리터럴 사용).

**Step 2: 실패 확인**

```bash
cd /Users/psy/Projects/drone-gcp-platform && npm test
```

Expected: FAIL — `recommendCount`가 두 번째 인자를 받지 않음.

**Step 3: gcp-algorithm.ts 수정**

`lib/gcp-algorithm.ts`의 import 라인에 추가:

```ts
import {
  type RecommendationPresetId,
  DEFAULT_PRESET_ID,
  getPreset,
} from './recommendation-presets';
```

기존 `recommendCount` 함수 교체:

```ts
// 기존
export function recommendCount(areaHa: number): number {
  if (areaHa <= 0) return 0;
  return Math.max(5, Math.ceil(areaHa / 10) + 4);
}

// 변경
export function recommendCount(
  areaHa: number,
  presetId: RecommendationPresetId = DEFAULT_PRESET_ID,
): number {
  return getPreset(presetId).formula(areaHa);
}
```

`DEFAULT_PRESET_ID === 'standard'`이고 standard 공식 = 기존 공식이므로 하위 호환됨.

**Step 4: 통과 확인**

```bash
cd /Users/psy/Projects/drone-gcp-platform && npm test
```

Expected: ALL pass (기존 + 신규 3개).

**Step 5: typecheck + lint**

```bash
cd /Users/psy/Projects/drone-gcp-platform && npm run typecheck && npm run lint
```

Expected: clean.

**Step 6: 커밋**

```bash
cd /Users/psy/Projects/drone-gcp-platform
git add lib/gcp-algorithm.ts lib/__tests__/gcp-algorithm.test.ts
git commit -m "feat(gcp): recommendCount accepts preset id"
```

---

## Task 3: store에 preset 상태 + setPreset + localStorage (TDD)

**Files:**
- Modify: `lib/store.ts`
- Modify: `lib/__tests__/store.test.ts`

**Step 1: 실패하는 테스트 작성**

`lib/__tests__/store.test.ts`의 `describe('useStore', ...)` 블록 끝에 추가:

```ts
  it('초기 preset은 standard', () => {
    expect(useStore.getState().preset).toBe('standard');
  });

  it('setPreset이 preset 상태 변경', () => {
    useStore.getState().setPreset('pix4d-precision');
    expect(useStore.getState().preset).toBe('pix4d-precision');
  });

  it('setPreset 후 폴리곤 있고 userCountOverride 없으면 GCP 재추천', () => {
    useStore.getState().setPolygon([
      // 약 100 ha 정사각형
      { lat: 37.5, lng: 127.0 },
      { lat: 37.5, lng: 127.01134 },
      { lat: 37.50902, lng: 127.01134 },
      { lat: 37.50902, lng: 127.0 },
    ]);
    // standard에서 추천 개수
    const standardCount = useStore.getState().gcps.length;

    useStore.getState().setPreset('pix4d-precision');
    const precisionCount = useStore.getState().gcps.length;

    // 100ha 정사각형 ~1ha 정도이므로 standard:5, precision:10
    // 어쨌든 다르게 나와야 함
    expect(precisionCount).not.toBe(standardCount);
  });

  it('setPreset 후 userCountOverride 있으면 GCP 유지', () => {
    useStore.getState().setPolygon([
      { lat: 0, lng: 0 },
      { lat: 0, lng: 1 },
      { lat: 1, lng: 1 },
      { lat: 1, lng: 0 },
    ]);
    useStore.getState().setUserCount(7);
    expect(useStore.getState().gcps.length).toBe(7);

    useStore.getState().setPreset('ngii');
    // userCountOverride(7)가 살아있으므로 개수 유지
    expect(useStore.getState().gcps.length).toBe(7);
  });

  it('setPreset은 localStorage에 저장', () => {
    useStore.getState().setPreset('agisoft');
    expect(localStorage.getItem('drone-gcp-preset')).toBe('agisoft');
  });

  it('reset은 preset도 초기화', () => {
    useStore.getState().setPreset('ngii');
    useStore.getState().reset();
    expect(useStore.getState().preset).toBe('standard');
  });
```

기존 `beforeEach`에 localStorage 클린업도 추가 필요 — store.test.ts 상단을 확인하고, `beforeEach(() => { useStore.getState().reset(); localStorage.clear(); })`처럼 갱신.

**Step 2: 실패 확인**

```bash
cd /Users/psy/Projects/drone-gcp-platform && npm test
```

Expected: FAIL — `setPreset is not a function`.

**Step 3: store.ts 수정**

`lib/store.ts`:

1. Import 추가:
```ts
import {
  type RecommendationPresetId,
  DEFAULT_PRESET_ID,
} from './recommendation-presets';
```

2. State 타입에 추가 (line 5–10):
```ts
type State = {
  polygon: LatLng[] | null;
  gcps: GCP[];
  userCountOverride: number | null;
  drawingMode: boolean;
  preset: RecommendationPresetId;
};
```

3. Actions 타입에 추가 (reset 위에):
```ts
  setPreset: (id: RecommendationPresetId) => void;
```

4. 초기 상태에 추가:
```ts
preset: DEFAULT_PRESET_ID,
```

5. `setPolygon` 수정 — preset 사용:
```ts
setPolygon: (coords) => {
  const area = polygonAreaHa(coords);
  const recommended = recommendCount(area, get().preset);
  const gcps = generateGCPs(coords, recommended);
  set({ polygon: coords, gcps, userCountOverride: null, drawingMode: false });
},
```

6. `regenerate` 수정 — preset 사용:
```ts
regenerate: () => {
  const { polygon, userCountOverride, preset } = get();
  if (!polygon) return;
  const area = polygonAreaHa(polygon);
  const count = userCountOverride ?? recommendCount(area, preset);
  set({ gcps: generateGCPs(polygon, count) });
},
```

7. `importFromKml` 수정 (polygon만 분기):
```ts
if (data.polygon) {
  // 폴리곤만 → setPolygon과 동일 (자동 추천)
  const area = polygonAreaHa(data.polygon);
  const recommended = recommendCount(area, get().preset);
  const gcps = generateGCPs(data.polygon, recommended);
  ...
}
```

8. `reset` 수정:
```ts
reset: () =>
  set({
    polygon: null,
    gcps: [],
    userCountOverride: null,
    drawingMode: false,
    preset: DEFAULT_PRESET_ID,
  }),
```

9. `setPreset` 액션 추가 (reset 위):
```ts
setPreset: (id) => {
  set({ preset: id });

  // localStorage 저장 (Safari private mode 등 대비)
  try {
    localStorage.setItem('drone-gcp-preset', id);
  } catch {
    // ignore
  }

  // 폴리곤 있고 userCountOverride 없으면 재추천
  const { polygon, userCountOverride } = get();
  if (polygon && userCountOverride === null) {
    const area = polygonAreaHa(polygon);
    const recommended = recommendCount(area, id);
    set({ gcps: generateGCPs(polygon, recommended) });
  }
},
```

10. `useRecommendedCount` derived hook 수정:
```ts
export const useRecommendedCount = () => {
  const area = useArea();
  const preset = useStore((s) => s.preset);
  return recommendCount(area, preset);
};
```

**Step 4: 통과 확인**

```bash
cd /Users/psy/Projects/drone-gcp-platform && npm test
```

Expected: ALL pass.

**Step 5: typecheck + lint**

```bash
cd /Users/psy/Projects/drone-gcp-platform && npm run typecheck && npm run lint
```

Expected: clean.

**Step 6: 커밋**

```bash
cd /Users/psy/Projects/drone-gcp-platform
git add lib/store.ts lib/__tests__/store.test.ts
git commit -m "feat(store): preset state + setPreset action with localStorage"
```

---

## Task 4: Sidebar RadioGroup + Tooltip UI

**Files:**
- Modify: `components/Sidebar.tsx`
- Create: `components/ui/radio-group.tsx` (shadcn add)
- Create: `components/ui/tooltip.tsx` (shadcn add)

**Step 1: shadcn 컴포넌트 추가**

```bash
cd /Users/psy/Projects/drone-gcp-platform
npx --yes shadcn@latest add radio-group tooltip -y
```

`components/ui/radio-group.tsx`와 `components/ui/tooltip.tsx`가 생성됨.

만약 `-y` 플래그가 안 먹히거나 interactive 프롬프트가 뜨면, 패키지 import만 가능하면 됨 — 수동으로 두 파일을 생성:

`components/ui/radio-group.tsx`는 shadcn 표준 RadioGroup (Radix UI 기반)
`components/ui/tooltip.tsx`는 shadcn 표준 Tooltip (Radix UI 기반)

확인:
```bash
ls components/ui/
```

`radio-group.tsx`, `tooltip.tsx`가 있어야 함.

**Step 2: Sidebar에 통합**

`components/Sidebar.tsx`를 읽어 현재 구조 확인:

```bash
cat components/Sidebar.tsx
```

상단 import에 추가:
```tsx
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { PRESETS } from '@/lib/recommendation-presets';
```

기존 store에서 가져오던 라인에 preset/setPreset 추가:
```tsx
const preset = useStore((s) => s.preset);
const setPreset = useStore((s) => s.setPreset);
```

또한 useEffect로 localStorage 복원 — Sidebar 컴포넌트 본문 최상단(`return` 위):
```tsx
import { useEffect } from 'react';
import { isValidPresetId } from '@/lib/recommendation-presets';

// 컴포넌트 함수 안:
useEffect(() => {
  try {
    const saved = localStorage.getItem('drone-gcp-preset');
    if (saved && isValidPresetId(saved)) {
      setPreset(saved);
    }
  } catch {
    // ignore
  }
  // setPreset은 zustand에서 안정. eslint disable 필요 시 추가.
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);
```

기존 슬라이더 섹션 위에 GCP 기준 섹션 삽입.

기존 JSX의 면적/권장/현재 Card 다음에 (슬라이더 위), 다음 블록 추가:

```tsx
{polygon && (
  <div>
    <div className="flex items-center gap-1">
      <label className="text-sm font-medium">GCP 기준</label>
      <span className="text-xs text-gray-400">({preset})</span>
    </div>
    <TooltipProvider delayDuration={150}>
      <RadioGroup
        value={preset}
        onValueChange={(v) => setPreset(v as typeof preset)}
        className="mt-2 space-y-1.5"
      >
        {PRESETS.map((p) => (
          <div key={p.id} className="flex items-center gap-2">
            <RadioGroupItem value={p.id} id={`preset-${p.id}`} />
            <label
              htmlFor={`preset-${p.id}`}
              className="flex-1 cursor-pointer text-sm"
            >
              {p.name}
            </label>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="text-gray-400 hover:text-gray-700"
                  aria-label={`${p.name} 설명`}
                >
                  ⓘ
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-xs text-xs">
                <p className="font-medium">{p.name}</p>
                <p className="mt-1">{p.description}</p>
                <p className="mt-1 text-gray-300">출처: {p.source}</p>
              </TooltipContent>
            </Tooltip>
          </div>
        ))}
      </RadioGroup>
    </TooltipProvider>
  </div>
)}
```

`polygon &&` 조건으로 폴리곤 그리기 전엔 표시 안 함 (면적 모르면 무의미).

**Step 3: 검증**

```bash
cd /Users/psy/Projects/drone-gcp-platform
npm run typecheck
npm test
npm run lint
npm run build
```

모두 통과.

만약 shadcn 추가 후 `@radix-ui/react-radio-group` 또는 `@radix-ui/react-tooltip` 누락 에러가 나면:
```bash
npm install @radix-ui/react-radio-group @radix-ui/react-tooltip
```

**Step 4: 커밋**

```bash
cd /Users/psy/Projects/drone-gcp-platform
git add -A
git commit -m "feat(sidebar): preset RadioGroup with tooltip descriptions"
```

---

## Task 5: README 업데이트 + 최종 검증 + push

**Files:**
- Modify: `README.md`

**Step 1: README 사용법 갱신**

기존 사용법 섹션에서 GCP 권장 설정 단계를 새로 안내:

기존 (예시):
```markdown
4. GCP 자동 추천됨. 슬라이더로 개수 조정 가능
```

변경:
```markdown
4. GCP 자동 추천됨. **사이드바에서 GCP 기준(Standard/Pix4D/Agisoft/국토지리정보원/ASPRS) 선택** 가능, 슬라이더로 개수 조정도 가능
```

**Step 2: 알고리즘 메모 섹션 보강**

기존 "알고리즘 메모" 섹션 아래에 GCP 기준 표 추가:

```markdown
### GCP 권장 개수 기준 (프리셋)

| 프리셋 | 공식 | 1ha | 10ha | 100ha | 용도 |
|---|---|---|---|---|---|
| Standard | `max(5, ⌈ha/10⌉+4)` | 5 | 5 | 14 | 기본 |
| Pix4D Default | `max(5, ⌈ha/20⌉+4)` | 5 | 5 | 9 | 평범한 프로젝트 |
| Pix4D Precision | `max(10, ⌈ha/10⌉+9)` | 10 | 10 | 19 | 고도 정확도 |
| Agisoft Metashape | `max(5, ⌈ha/15⌉+4)` | 5 | 5 | 11 | 표준 |
| 국토지리정보원 | `max(9, ⌈ha/11.1⌉)` | 9 | 9 | 9 | 한국 공공측량 |
| ASPRS | `max(5, ⌈ha/20⌉+3)` | 5 | 5 | 8 | RMSE 1px |

선택한 기준은 브라우저에 저장되어 다음 세션에도 유지됩니다.
```

**Step 3: 트러블슈팅 추가**

기존 트러블슈팅 섹션 끝에 추가:
```markdown
- **기준을 바꿔도 GCP 개수가 그대로**: 슬라이더로 수동 조정한 적이 있으면 그 값이 우선됩니다. "권장값으로 재추천" 버튼을 누르면 새 기준 공식으로 다시 계산됩니다.
- **저장된 기준이 다른 브라우저에서 안 보임**: localStorage는 브라우저별 독립. 다른 브라우저나 시크릿 모드는 매번 Standard로 시작.
```

**Step 4: 수동 검증 체크리스트 보강**

기존 수동 검증 항목 끝에 추가:
```markdown
17. 사이드바 **GCP 기준** 라디오 그룹에서 다른 옵션 선택 → GCP 개수 즉시 변경 확인
18. ⓘ 아이콘에 마우스 hover → 툴팁에 설명·출처 표시 확인
19. 브라우저 새로고침 → 선택한 기준 유지되는지 확인
20. 시크릿 모드에서 열기 → 기본값 Standard로 시작하는지 확인
```

**Step 5: 최종 풀 검증**

```bash
cd /Users/psy/Projects/drone-gcp-platform
npm run typecheck
npm test
npm run lint
npm run build
```

모두 통과.

**Step 6: 커밋**

```bash
cd /Users/psy/Projects/drone-gcp-platform
git add README.md
git commit -m "docs: document GCP recommendation presets"
```

**Step 7: GitHub에 push**

```bash
cd /Users/psy/Projects/drone-gcp-platform
git push
```

GitHub 저장소 https://github.com/bigsam73/drone-gcp-platform 에 모든 변경사항 반영됨.

**Step 8: 보고**

`git log --oneline -8`로 5개 Task의 커밋이 깔끔하게 정리됐는지 확인.

---

## Out of Scope (이번 계획 제외)

- 사용자 커스텀 공식 입력 (계수 직접 조정)
- 프리셋 가져오기/내보내기
- 프리셋별 배치 알고리즘 변경 (배치는 동일, 개수만 다름)
- 다국어
- 프리셋 추가 UI
- 면적 외 다른 매개변수 (지형 복잡도, 비행 고도) 반영
