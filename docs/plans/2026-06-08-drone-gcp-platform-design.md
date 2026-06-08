# Drone Mapping GCP Recommendation Platform — Design

Date: 2026-06-08
Status: Approved

## 1. Purpose

드론 매핑 작업 시 사용자가 Google 지도에서 매핑 구역을 다각형으로 그리면, 해당 구역에 적합한 GCP(Ground Control Point, 지상기준점)를 기하학적 분포 알고리즘으로 자동 추천하고, 결과를 KML 파일로 내보내는 웹 플랫폼.

GCP는 드론으로 촬영한 영상의 절대 위치 정확도를 결정하는 지상의 기준점이다. 적절한 개수와 분포가 매핑 정확도를 좌우한다.

## 2. Goals

- 사용자가 지도에서 다각형으로 매핑 구역을 그릴 수 있다.
- 구역 면적과 형태에 맞춰 GCP 위치를 자동 추천한다.
- 추천된 GCP를 사용자가 수동으로 이동, 삭제, 추가할 수 있다.
- 구역과 GCP 점들을 KML 파일로 다운로드할 수 있다.

## 3. Non-Goals (YAGNI)

- 사용자 인증, 다중 사용자 지원
- 프로젝트 저장/불러오기 (로컬 저장 포함)
- 지형 데이터 기반 GCP 분석 (DEM/경사도)
- 모바일 최적화 (데스크톱 우선)
- 다국어 (한국어 기본)

## 4. Tech Stack

- **Framework**: Next.js 15 (App Router), React 19, TypeScript
- **지도**: Google Maps JavaScript API + Drawing Library (`@react-google-maps/api`)
- **상태관리**: Zustand
- **스타일**: Tailwind CSS v4 + shadcn/ui
- **지오메트리**: `@turf/turf` (면적, 점-폴리곤 판정, 그리드 생성)
- **테스트**: Vitest

## 5. Architecture

### 5.1 화면 구성

```
┌────────────────────────────────────────────┐
│  Header (앱 이름, KML 다운로드 버튼)          │
├──────────────┬─────────────────────────────┤
│              │                             │
│   사이드바    │      Google Map (메인)      │
│              │                             │
│ - 그리기 모드 │   - 다각형 그리기            │
│ - GCP 개수    │   - GCP 마커 표시            │
│   슬라이더    │   - 마커 드래그              │
│ - 면적 표시   │   - 우클릭 삭제              │
│ - 초기화      │   - 빈 곳 클릭으로 추가      │
└──────────────┴─────────────────────────────┘
```

### 5.2 컴포넌트 트리

```
app/page.tsx
├── Sidebar
│   ├── DrawingModeToggle
│   ├── GCPCountSlider
│   ├── AreaDisplay
│   └── ResetButton
├── MapContainer
│   ├── GoogleMap
│   ├── DrawingManager (polygon drawing)
│   ├── PolygonRenderer
│   └── GCPMarkers (draggable + clickable)
└── Header
    └── KMLDownloadButton
```

### 5.3 상태 관리 (Zustand)

```ts
type Store = {
  polygon: LatLng[] | null;
  gcps: GCP[];           // { id, lat, lng, label }
  recommendedCount: number;
  userCount: number;     // slider override

  setPolygon: (coords: LatLng[]) => void;
  addGCP: (lat: number, lng: number) => void;
  moveGCP: (id: string, lat: number, lng: number) => void;
  removeGCP: (id: string) => void;
  setUserCount: (n: number) => void;
  regenerateGCPs: () => void;
  reset: () => void;
};
```

## 6. GCP Recommendation Algorithm

### 6.1 권장 개수

```
recommendedCount = max(5, ceil(area_ha / 10) + 4)
```

- 5개: PIX4D/AgiSoft 최소 권장
- +1/10ha: 면적 증가분 보정
- 사용자 슬라이더로 ±50% 조정 가능

### 6.2 배치 전략

1. **모서리 (최대 4점)**
   - Convex Hull 계산 후 가장 멀리 떨어진 점부터 선택
   - 폴리곤 꼭짓점이 4개 미만이면 가용 꼭짓점 모두 사용

2. **둘레 점 (가변)**
   - 남은 점 일부를 변 위에 배치
   - 변 길이에 비례 분배 (긴 변에 우선)

3. **내부 점 (나머지)**
   - 폴리곤 bounding box에 균일 그리드 생성
   - 폴리곤 내부에 있는 후보만 선별
   - 모서리/둘레 점에서 최소 거리(폴리곤 직경 × 0.15) 이상 떨어진 점 선택
   - 부족 시 거리 임계값 점진 감소

### 6.3 검증 케이스

- 정사각형 1ha → 5개 (모서리 4 + 중앙 1)
- 직사각형 20ha → 6개 (모서리 4 + 둘레 1 + 내부 1)
- L자형 50ha → 9개 (모서리 4 + 둘레 2 + 내부 3)

## 7. KML Output Format

```xml
<?xml version="1.0" encoding="UTF-8"?>
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
    <Placemark>
      <name>Mapping Area</name>
      <styleUrl>#areaStyle</styleUrl>
      <Polygon>
        <outerBoundaryIs><LinearRing><coordinates>
          lng,lat,0 lng,lat,0 ...
        </coordinates></LinearRing></outerBoundaryIs>
      </Polygon>
    </Placemark>
    <Placemark>
      <name>GCP-01</name>
      <styleUrl>#gcpStyle</styleUrl>
      <Point><coordinates>lng,lat,0</coordinates></Point>
    </Placemark>
    <!-- ... -->
  </Document>
</kml>
```

좌표계는 WGS84 (EPSG:4326). 고도는 0으로 고정 (지형 분석 비포함이므로).

## 8. Data Flow

```
[Drawing] → polygon coords → Zustand
                                ↓
                         area calculation
                                ↓
                         recommendedCount
                                ↓
                         GCP algorithm
                                ↓
                         gcps[] → Map markers
                                ↓
            User edit (drag/delete/add) → gcps[] 업데이트
                                ↓
                         KML serialize → download
```

## 9. Project Structure

```
drone-gcp-platform/
├── app/
│   ├── layout.tsx
│   ├── page.tsx
│   └── globals.css
├── components/
│   ├── Header.tsx
│   ├── Sidebar.tsx
│   ├── MapContainer.tsx
│   ├── DrawingManager.tsx
│   ├── GCPMarkers.tsx
│   └── ui/                    # shadcn
├── lib/
│   ├── gcp-algorithm.ts
│   ├── kml-generator.ts
│   ├── geometry.ts            # 면적, 거리 계산 헬퍼
│   └── store.ts               # Zustand
├── lib/__tests__/
│   ├── gcp-algorithm.test.ts
│   └── kml-generator.test.ts
├── .env.local.example
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── next.config.ts
└── README.md
```

## 10. Edge Cases & Error Handling

| 케이스 | 처리 |
|---|---|
| Google Maps API 키 없음 | 안내 카드 표시 + .env 설정 가이드 |
| 폴리곤 미완성 (점 < 3) | GCP 계산 차단, 사이드바 비활성화 |
| 면적 < 0.1ha | 경고 표시 후 최소 5점 강제 배치 |
| 자기교차 폴리곤 | turf 검증, 사용자에게 경고 토스트 |
| GCP 0개 상태에서 KML 다운로드 | 폴리곤만 포함하여 다운로드 |
| 폴리곤 외부에 수동 GCP 추가 | 허용 (현장에서 인접 지역 필요 가능) |

## 11. Testing

- `gcp-algorithm.test.ts`: 정사각형/직사각형/L자형 폴리곤 입력에 대해 개수와 분포 검증
- `kml-generator.test.ts`: 생성된 XML이 유효 KML이고 정확한 좌표를 포함하는지 검증
- 통합 테스트는 MVP에서 생략 (수동 검증)

## 12. Out of Scope (추후 검토)

- 좌표계 변환 (UTM, KGD2002 등)
- 프로젝트 저장/불러오기
- 다중 폴리곤 (여러 매핑 영역)
- DEM 기반 지형 분석
- 비행 경로 자동 생성
- 협업 기능
