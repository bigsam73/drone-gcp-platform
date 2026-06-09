# KML Import Feature — Design

Date: 2026-06-08
Status: Approved

## 1. Purpose

작업 연속성을 위해 기존에 내보낸 KML 파일을 다시 불러올 수 있게 한다. 외부 도구(Google Earth, Pix4D 등)에서 만든 단순한 KML도 호환한다. 폴리곤은 매핑 구역으로, Point는 GCP로 자동 분류해 적용한다.

## 2. Goals

- 우리가 내보낸 KML을 그대로 다시 읽어 폴리곤과 GCP를 복원할 수 있다.
- 외부에서 만든 일반적인 KML(Polygon + Point 구조)도 지원한다.
- 잘못된 파일은 사용자에게 명확한 메시지로 안내한다.
- 단위 테스트로 파서 정확성을 보장한다.

## 3. Non-Goals (YAGNI)

- 다중 폴리곤, MultiGeometry, hole(내부 구멍)
- KML 자체 스타일·아이콘 보존
- 드래그 앤 드롭 업로드
- KMZ(zip된 KML)
- NetworkLink
- 부분 불러오기(폴리곤만/GCP만 선택)
- 외부 KML의 라벨 보존

## 4. Tech Choice

- **DOMParser** (브라우저 내장) 사용
- 의존성 추가 없음
- 파일 읽기는 FileReader
- 파싱은 순수 함수로 분리해 단위 테스트로 검증

## 5. Parser Output Model

```ts
export type ParsedKml = {
  polygon: { lat: number; lng: number }[] | null;
  gcps: { lat: number; lng: number; label: string }[];
};

export type KmlParseError = 'invalid-xml' | 'not-kml' | 'empty' | 'too-large';

export type ParseResult =
  | { ok: true; data: ParsedKml }
  | { ok: false; error: KmlParseError; message: string };
```

throw 대신 union으로 실패를 표현해 호출자 코드를 단순하게 한다.

## 6. Parsing Rules

```
1. 파일 크기 > 5MB → 'too-large'
2. DOMParser로 파싱 시도
   - parsererror 노드 발견 → 'invalid-xml'
   - 루트가 <kml>이 아니면 → 'not-kml'
3. 모든 <Placemark> 순회
   a. <Polygon><outerBoundaryIs><LinearRing><coordinates> 발견 시:
      - 좌표 텍스트를 공백/줄바꿈으로 분리
      - 각 항목을 "lng,lat[,alt]" 형태로 파싱
      - 유효 좌표가 3개 이상이면 polygon으로 채택
      - 첫 번째 Polygon만 사용 (MVP)
   b. <Point><coordinates> 발견 시:
      - "lng,lat[,alt]"로 파싱
      - 유효하면 GCP에 추가
      - 같은 Placemark의 <name>은 무시 (모두 재번호)
4. polygon, gcps 둘 다 없음 → 'empty'
5. 성공 → polygon 또는 null, gcps 배열
```

**KML 좌표 순서**: KML 표준은 `경도,위도,고도` (lng,lat,alt). 우리는 `{lat, lng}`로 저장하므로 변환 필요. 고도는 무시.

**라벨 정규화**: 외부 KML의 라벨이 일관성 없을 수 있으므로(`Point-1, Point-3, Point-7` 등) 불러온 모든 GCP에 `GCP-01, GCP-02, ...`를 새로 부여한다.

## 7. Store Action

```ts
importFromKml: (data: ParsedKml) => void;
```

내부 로직:
1. `polygon` 세팅 (또는 null)
2. KML에 GCP가 있으면 → 그대로 사용, 라벨을 GCP-01부터 재번호
3. KML에 GCP가 없고 polygon이 있으면 → 자동 추천 GCP 생성 (setPolygon과 동일한 동작)
4. `userCountOverride`를 `gcps.length`로 세팅 (슬라이더 재조정 시 KML 값 유지)
5. `drawingMode = false`

기존 상태는 완전히 대체된다(승인된 사양: "대체").

## 8. UI Components

**KmlImportButton** (`components/KmlImportButton.tsx`):
- shadcn `<Button variant="outline">` 형태
- 클릭 → 숨겨진 `<input type="file" accept=".kml,application/vnd.google-earth.kml+xml">` 트리거
- 파일 선택 → FileReader.readAsText → 파서 호출
- 성공 → `useStore.importFromKml(data)` 호출 + 성공 메시지 5초 표시
- 실패 → 빨간색 에러 메시지 5초 표시

**Header 변경**:
```
[KML 불러오기] [KML 다운로드]   ← 우측 정렬
        ⓘ 상태 메시지 5초간     ← 아래에 표시
```

## 9. Map Auto-Pan

폴리곤이 새로 들어왔을 때 지도가 그 영역으로 자동 이동해야 한다(현재 위치와 무관할 수 있으므로).

**구현**: MapContainer의 polygon 동기화 useEffect에 `map.panTo(centroid)` 한 줄 추가.
- 사용자가 직접 그린 경우에도 한 번 panTo 실행되지만, 이미 그 위치에 있으므로 무해
- 폴리곤 centroid는 `lib/geometry.ts`의 `polygonCentroid` 사용 (이미 존재)

레벨 조정도 함께:
- polygon bounding box 기준 적절한 zoom 계산은 복잡 → MVP에선 fixed level 5 사용

## 10. Status Message UX

토스트 라이브러리 도입하지 않고(YAGNI), 헤더에 inline 메시지:

```tsx
const [status, setStatus] = useState<
  | { kind: 'idle' }
  | { kind: 'success'; message: string }
  | { kind: 'error'; message: string }
>({ kind: 'idle' });

// 성공/실패 후 5초 setTimeout으로 자동 idle
```

5초 후 자동 사라짐. 색은 녹색/빨강.

## 11. Validation & Edge Cases

| 케이스 | 처리 |
|---|---|
| 파일 크기 > 5MB | 'too-large' 에러 |
| 빈 파일 | 'invalid-xml' 에러 |
| 잘못된 XML (태그 미닫힘 등) | 'invalid-xml' 에러 |
| KML 루트 아님 (GPX, SVG 등) | 'not-kml' 에러 |
| Polygon 0, Point 0 | 'empty' 에러 |
| 좌표 < 3개인 Polygon | polygon = null로 처리 |
| Point만 있고 Polygon 없음 | polygon=null, gcps만 채움 |
| Polygon만 있고 Point 없음 | polygon 채움, gcps는 자동 추천으로 생성 |
| 좌표 중 NaN 포함 | 해당 좌표 스킵 |
| Polygon 여러 개 | 첫 번째만 사용 |
| coordinates에 줄바꿈/탭/공백 혼재 | 정규화 후 파싱 |
| 고도값 있음/없음 | 둘 다 처리 (무시) |

## 12. Testing

**`lib/__tests__/kml-parser.test.ts`** (TDD):
- 우리가 생성한 KML round-trip → polygon + gcps 정확히 복원
- Polygon만, Point만, 둘 다 있음 각 케이스
- 좌표 순서 lng,lat 검증 (서울 시청 좌표로)
- coordinates 공백/줄바꿈 처리
- 고도값 포함/미포함
- invalid-xml, not-kml, empty 에러 케이스
- 좌표 < 3개 polygon → null
- NaN 좌표 스킵
- 다중 Polygon → 첫 번째만

**`lib/__tests__/store.test.ts` 확장**:
- `importFromKml(polygon만)` → 폴리곤 + 자동 추천 GCP 생성
- `importFromKml(polygon+gcps)` → KML의 GCP 그대로, 라벨 재번호
- `importFromKml(gcps만)` → polygon=null, GCP 채움
- 기존 상태 있을 때 import → 완전 대체

기존 52개 + 신규 약 13-15개 = 약 65-67개.

KmlImportButton 자체는 통합 수동 검증으로.

## 13. File Changes Summary

```
New:
  lib/kml-parser.ts
  lib/__tests__/kml-parser.test.ts
  components/KmlImportButton.tsx

Modified:
  lib/store.ts                  — importFromKml 액션
  lib/__tests__/store.test.ts   — importFromKml 테스트 추가
  components/Header.tsx         — KmlImportButton 마운트, 상태 메시지
  components/MapContainer.tsx   — polygon 변경 시 panTo (한 줄)
  README.md                     — 사용법, 트러블슈팅

Unchanged:
  lib/geometry.ts, gcp-algorithm.ts, kml-generator.ts, search.ts
  components/Sidebar.tsx, SearchBar.tsx
  types/kakao.d.ts
  기존 52개 테스트
```

## 14. Security

- DOMParser는 브라우저 내장이라 XML 외부 엔티티(XXE) 공격에 안전
- FileReader는 클라이언트 사이드, 외부 전송 없음
- 5MB 상한으로 메모리 보호
- 파싱 실패 시 throw 대신 union 반환으로 화이트 스크린 방지
