# Drone GCP Platform

드론 매핑 구역에 대한 GCP(Ground Control Point) 자동 추천 및 KML 출력 도구.

## Setup

1. `.env.local.example`을 `.env.local`로 복사
2. 카카오 개발자 콘솔에서 JavaScript 키 발급
   - https://developers.kakao.com/ → 내 애플리케이션 → 앱 생성
   - 앱 키 → **JavaScript 키** 복사
   - **플랫폼 → Web** 에서 사용할 도메인 등록 (로컬은 `http://localhost:3000`)
3. `.env.local`의 `NEXT_PUBLIC_KAKAO_MAP_APP_KEY`에 키 입력
4. `npm install`
5. `npm run dev`

## 사용법

1. 지도 상단 검색바에서 주소 또는 장소(예: "삼성동", "스타벅스 강남역", "강남대로 396") 입력 → 결과 클릭으로 현장 위치 찾기
2. 사이드바에서 "구역 그리기" 시작
3. 지도에서 다각형 꼭짓점 클릭, 마지막 점 더블클릭으로 완료
4. GCP 자동 추천됨. 슬라이더로 개수 조정 가능
5. GCP 마커 드래그(이동), 우클릭(삭제), 지도 빈 곳 클릭(추가 — 폴리곤 외부도 가능)
6. 헤더의 "KML 다운로드"

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

- **지도가 회색 화면 또는 로딩 실패**: 카카오 개발자 콘솔의 "플랫폼 → Web" 도메인 목록에 현재 접속 중인 origin이 등록되어 있는지 확인. 로컬은 `http://localhost:3000`을 등록해야 함.
- **다각형 그리기가 안 됨**: SDK URL의 `libraries=drawing` 파라미터가 포함되어 있는지 확인 (코드에 이미 포함). 브라우저 강력 새로고침(Cmd+Shift+R 또는 Ctrl+Shift+R)으로 캐시된 SDK 제거.
- **KML 다운로드가 안 됨**: 브라우저의 팝업/다운로드 차단 설정 확인. 폴리곤이 3점 미만이고 GCP도 없으면 버튼이 비활성화됨.
- **환경변수가 적용 안 됨**: `.env.local` 수정 후 dev 서버 재시작 필수. Next.js는 환경변수 변경 시 자동으로 reload하지 않음.
- **타입 토글이 안 보임**: 지도 로드가 완료된 후에만 표시됨. 콘솔 에러를 확인하고, 네트워크 탭에서 `dapi.kakao.com` 요청 성공 여부 확인.
- **GCP 라벨이 표시 안 됨**: `app/globals.css`의 `.gcp-label` 스타일이 빌드에 포함되어 있는지 확인.
- **`App(xxx) disabled OPEN_MAP_AND_LOCAL service` 에러**: 카카오 개발자 콘솔의 **제품 설정 → 카카오맵**에서 카카오맵 서비스가 활성화되어 있는지 확인. 도메인 등록과는 별도 설정이며 흔히 빠뜨리는 단계.
- **검색이 안 됨**: SDK URL에 `libraries=drawing,services` 파라미터가 포함되어 있는지 확인 (코드에 이미 포함). 강력 새로고침으로 캐시된 SDK 제거. 검색 결과가 항상 "검색 실패"로 나오면 services 라이브러리 로드 자체에 실패한 것이므로 콘솔 에러 확인.

## 스택

- Next.js 16 + React 19 + TypeScript
- Tailwind CSS v4 + shadcn/ui
- Zustand (전역 상태)
- Kakao Maps JavaScript SDK (지도 + Drawing + Services 라이브러리, 동적 스크립트 로드)
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
│   ├── MapContainer.tsx          # Kakao Map
│   └── ui/                       # shadcn 컴포넌트
├── lib/
│   ├── geometry.ts               # 폴리곤 면적/거리/bbox 헬퍼
│   ├── gcp-algorithm.ts          # GCP 추천 알고리즘
│   ├── kml-generator.ts          # KML 직렬화
│   ├── store.ts                  # Zustand 스토어
│   └── __tests__/                # 단위 테스트
└── docs/plans/                   # 설계 문서, 실행 계획
```

## 수동 검증 체크리스트

배포 전 또는 큰 변경 후 직접 확인:

1. `.env.local` 설정 후 `npm run dev` 실행
2. http://localhost:3000 접속, 네트워크 탭에서 `dapi.kakao.com/v2/maps/sdk.js` 요청 성공 확인 (URL에 `libraries=drawing,services` 포함 확인)
3. 지도 상단 검색바에서 "삼성동" 입력 → 장소 결과 표시 확인
4. 검색바에서 "강남대로 396" 입력 → 주소 결과 표시 확인
5. 결과 클릭 → 지도가 해당 위치로 이동하고 파란색 임시 마커 표시
6. X 버튼 클릭 → 검색 초기화 (입력/드롭다운/임시 마커 모두 사라짐)
7. 지도 우상단 타입 토글로 **스카이뷰 / 일반 / 하이브리드** 전환
8. 사이드바 "구역 그리기" → 지도에 다각형 그리기 (마지막 점 더블클릭으로 완료)
9. GCP가 자동으로 추천 배치되는지 확인 (모서리 4 + 내부 일부)
10. GCP 마커 **드래그**(이동), **우클릭**(삭제), **빈 곳 클릭**(추가) 동작 확인
11. 슬라이더로 GCP 개수 조정
12. **권장값으로 재추천** 버튼 동작 확인
13. **KML 다운로드** → 다운로드 파일을 Google Earth 또는 다른 KML 뷰어에서 열어 좌표 검증
