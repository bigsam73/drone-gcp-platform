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
4. GCP 마커 드래그(이동), 우클릭(삭제), 지도 빈 곳 클릭(추가 — 폴리곤 외부도 가능)
5. 헤더의 "KML 다운로드"

## 테스트

```bash
npm test            # 한 번 실행
npm run test:watch  # 변경 감시 모드
npm run typecheck   # TypeScript 검사
npm run build       # 프로덕션 빌드 검증
```

## 알고리즘 메모

GCP 추천 공식:
- 권장 개수: `max(5, ceil(면적_ha / 10) + 4)`
- 사용자 슬라이더로 권장 개수의 ±50% 조정 가능

배치 전략 (3단계):
1. **모서리 (최대 4점)**: 폴리곤 꼭짓점 중 greedy farthest-first로 선택. 시드는 가장 멀리 떨어진 두 점의 한쪽
2. **변 (~남은 점의 1/3)**: 변 길이에 비례 분배, 각 변에서 균등 간격
3. **내부 (나머지)**: 폴리곤 내부 격자 후보 중 최소 거리(폴리곤 직경 × 0.15) 이상 떨어진 점 선택

좌표계: WGS84 (EPSG:4326). 고도는 0으로 고정.

## 트러블슈팅

- **지도가 회색 화면으로 표시됨**: API 키 제한이 잘못 걸려 있거나 Maps JavaScript API가 활성화되지 않았습니다. Google Cloud Console → APIs & Services → Library에서 "Maps JavaScript API"를 활성화하고, Credentials에서 키의 HTTP referrer 설정을 확인하세요.
- **다각형 그리기 도구가 작동하지 않음**: `@react-google-maps/api`의 `libraries`에 `drawing`이 포함되어 있는지 확인. 이미 코드에 포함되어 있으니 일반적으로는 문제 없음.
- **KML 다운로드가 안 됨**: 브라우저의 팝업/다운로드 차단 설정 확인. 또는 폴리곤이 3점 미만인 상태에서 GCP도 없으면 버튼이 비활성화됩니다.
- **개발 서버에서 환경변수가 적용 안 됨**: `.env.local`을 수정한 뒤 `npm run dev`를 재시작하세요. Next.js는 환경변수 변경시 자동으로 reload하지 않습니다.

## 스택

- Next.js 16 + React 19 + TypeScript
- Tailwind CSS v4 + shadcn/ui
- Zustand (전역 상태)
- @react-google-maps/api (Google Maps)
- @turf/turf (지오메트리)
- Vitest (테스트)

## 프로젝트 구조

```
drone-gcp-platform/
├── app/                          # Next.js App Router
│   ├── layout.tsx
│   └── page.tsx                  # 메인 페이지
├── components/
│   ├── Header.tsx                # KML 다운로드 버튼
│   ├── Sidebar.tsx               # 컨트롤 패널
│   ├── MapContainer.tsx          # Google Map
│   └── ui/                       # shadcn 컴포넌트
├── lib/
│   ├── geometry.ts               # 폴리곤 면적/거리/bbox 헬퍼
│   ├── gcp-algorithm.ts          # GCP 추천 알고리즘
│   ├── kml-generator.ts          # KML 직렬화
│   ├── store.ts                  # Zustand 스토어
│   └── __tests__/                # 단위 테스트
└── docs/plans/                   # 설계 문서, 실행 계획
```
