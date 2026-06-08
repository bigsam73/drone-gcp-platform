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
4. GCP 마커 드래그(이동), 우클릭(삭제), 빈 곳 클릭(추가)
5. 헤더의 "KML 다운로드"
