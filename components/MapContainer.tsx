'use client';

import { useEffect, useRef, useState } from 'react';
import { useStore } from '@/lib/store';
import type { GCP } from '@/lib/gcp-algorithm';
import SearchBar from './SearchBar';
import type { SearchResult } from '@/lib/search';

const SCRIPT_ID = 'kakao-maps-sdk';
const DEFAULT_CENTER = { lat: 37.5665, lng: 126.978 };
const DEFAULT_LEVEL = 4;
const LOAD_TIMEOUT_MS = 8000;

type MapType = 'SKYVIEW' | 'ROADMAP' | 'HYBRID';

function loadKakaoSdk(appKey: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('window not available'));
      return;
    }
    if (window.kakao?.maps) {
      resolve();
      return;
    }

    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      // Defensive: SDK may already be ready when we discover an existing tag.
      if (window.kakao?.maps) {
        window.kakao.maps.load(() => resolve());
        return;
      }
      const timer = setTimeout(() => reject(new Error('SDK load timeout')), LOAD_TIMEOUT_MS);
      existing.addEventListener('load', () => {
        clearTimeout(timer);
        window.kakao.maps.load(() => resolve());
      });
      existing.addEventListener('error', () => {
        clearTimeout(timer);
        reject(new Error('SDK script error'));
      });
      return;
    }

    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.async = true;
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${appKey}&libraries=drawing,services&autoload=false`;

    const timer = setTimeout(() => {
      if (!window.kakao?.maps) reject(new Error('SDK load timeout'));
    }, LOAD_TIMEOUT_MS);

    script.onload = () => {
      clearTimeout(timer);
      window.kakao.maps.load(() => resolve());
    };
    script.onerror = () => {
      clearTimeout(timer);
      reject(new Error('SDK script error'));
    };
    document.head.appendChild(script);
  });
}

export default function MapContainer() {
  const appKey = process.env.NEXT_PUBLIC_KAKAO_MAP_APP_KEY ?? '';

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<kakao.maps.Map | null>(null);
  const polygonRef = useRef<kakao.maps.Polygon | null>(null);
  const markersRef = useRef<
    Map<string, { marker: kakao.maps.Marker; overlay: kakao.maps.CustomOverlay; label: string }>
  >(new Map());
  const drawingManagerRef = useRef<kakao.maps.drawing.DrawingManager | null>(null);
  const searchMarkerRef = useRef<{
    marker: kakao.maps.Marker;
    overlay: kakao.maps.CustomOverlay;
  } | null>(null);

  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [mapType, setMapType] = useState<MapType>('SKYVIEW');

  const polygon = useStore((s) => s.polygon);
  const gcps = useStore((s) => s.gcps);
  const drawingMode = useStore((s) => s.drawingMode);
  const setPolygon = useStore((s) => s.setPolygon);
  const setDrawingMode = useStore((s) => s.setDrawingMode);
  const moveGCP = useStore((s) => s.moveGCP);
  const removeGCP = useStore((s) => s.removeGCP);

  // 1) SDK load + map init
  useEffect(() => {
    if (!appKey || !containerRef.current) return;

    let cancelled = false;

    loadKakaoSdk(appKey)
      .then(() => {
        if (cancelled || !containerRef.current) return;
        const kakao = window.kakao;
        const map = new kakao.maps.Map(containerRef.current, {
          center: new kakao.maps.LatLng(DEFAULT_CENTER.lat, DEFAULT_CENTER.lng),
          level: DEFAULT_LEVEL,
          mapTypeId: kakao.maps.MapTypeId.SKYVIEW,
        });
        mapRef.current = map;

        kakao.maps.event.addListener(map, 'click', (event?: { latLng?: kakao.maps.LatLng }) => {
          const latLng = event?.latLng;
          if (!latLng) return;
          const state = useStore.getState();
          if (state.drawingMode || !state.polygon) return;
          state.addGCP(latLng.getLat(), latLng.getLng());
        });

        setStatus('ready');
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setErrorMsg(err.message);
        setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [appKey]);

  // 2) mapType sync
  useEffect(() => {
    const map = mapRef.current;
    if (!map || status !== 'ready') return;
    const kakao = window.kakao;
    const id =
      mapType === 'SKYVIEW'
        ? kakao.maps.MapTypeId.SKYVIEW
        : mapType === 'HYBRID'
        ? kakao.maps.MapTypeId.HYBRID
        : kakao.maps.MapTypeId.ROADMAP;
    map.setMapTypeId(id);
  }, [mapType, status]);

  // 3) polygon sync
  useEffect(() => {
    if (status !== 'ready') return;
    const kakao = window.kakao;

    if (polygonRef.current) {
      polygonRef.current.setMap(null);
      polygonRef.current = null;
    }

    if (!polygon || polygon.length < 3) return;

    const path = polygon.map((p) => new kakao.maps.LatLng(p.lat, p.lng));
    const poly = new kakao.maps.Polygon({
      path,
      strokeWeight: 2,
      strokeColor: '#1d4ed8',
      strokeOpacity: 0.9,
      fillColor: '#3b82f6',
      fillOpacity: 0.15,
      map: mapRef.current!,
    });
    polygonRef.current = poly;
  }, [polygon, status]);

  // 4) GCP markers sync (diff-based)
  useEffect(() => {
    if (status !== 'ready') return;
    const kakao = window.kakao;
    const map = mapRef.current;
    if (!map) return;

    const existingIds = new Set(markersRef.current.keys());
    const incomingIds = new Set(gcps.map((g) => g.id));

    for (const id of existingIds) {
      if (!incomingIds.has(id)) {
        const entry = markersRef.current.get(id);
        entry?.marker.setMap(null);
        entry?.overlay.setMap(null);
        markersRef.current.delete(id);
      }
    }

    // NOTE: `removeGCP` in the store relabels remaining GCPs (re-numbering),
    // so we must compare labels to detect when an overlay needs to be rebuilt.
    for (const g of gcps) {
      const pos = new kakao.maps.LatLng(g.lat, g.lng);
      const existing = markersRef.current.get(g.id);
      if (existing) {
        existing.marker.setPosition(pos);
        if (existing.label !== g.label) {
          // Label was reassigned (e.g., after a removeGCP renumbered the list).
          existing.overlay.setMap(null);
          const overlay = makeLabelOverlay(g, pos, map);
          markersRef.current.set(g.id, { marker: existing.marker, overlay, label: g.label });
        } else {
          existing.overlay.setPosition(pos);
        }
        continue;
      }

      const marker = new kakao.maps.Marker({ position: pos, map, draggable: true });
      kakao.maps.event.addListener(marker, 'dragend', () => {
        const p = marker.getPosition();
        moveGCP(g.id, p.getLat(), p.getLng());
      });
      kakao.maps.event.addListener(marker, 'rightclick', () => removeGCP(g.id));
      const overlay = makeLabelOverlay(g, pos, map);
      markersRef.current.set(g.id, { marker, overlay, label: g.label });
    }
  }, [gcps, status, moveGCP, removeGCP]);

  // 5) DrawingManager sync
  useEffect(() => {
    if (status !== 'ready') return;
    const kakao = window.kakao;
    const map = mapRef.current;
    if (!map) return;

    if (!drawingMode) {
      drawingManagerRef.current?.cancel();
      return;
    }

    if (!drawingManagerRef.current) {
      const manager = new kakao.maps.drawing.DrawingManager({
        map,
        drawingMode: [kakao.maps.drawing.OverlayType.POLYGON],
        polygonOptions: {
          draggable: false,
          removable: false,
          editable: false,
          strokeColor: '#1d4ed8',
          fillColor: '#3b82f6',
          fillOpacity: 0.2,
          hintStrokeStyle: 'dash',
          hintStrokeOpacity: 0.5,
        },
      });

      manager.addListener('drawend', (event) => {
        const path = event.target.getPath?.();
        if (!path || path.length < 3) return;
        const coords = path.map((latLng) => ({
          lat: latLng.getLat(),
          lng: latLng.getLng(),
        }));
        setPolygon(coords);
        setDrawingMode(false);
      });

      drawingManagerRef.current = manager;
    }

    drawingManagerRef.current.select(kakao.maps.drawing.OverlayType.POLYGON);
  }, [drawingMode, status, setPolygon, setDrawingMode]);

  // Unmount cleanup
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

  const handleSearchSelect = (result: SearchResult) => {
    const map = mapRef.current;
    if (!map) return;
    const kakao = window.kakao;
    const pos = new kakao.maps.LatLng(result.lat, result.lng);

    map.setCenter(pos);
    map.setLevel(3);

    if (searchMarkerRef.current) {
      searchMarkerRef.current.marker.setMap(null);
      searchMarkerRef.current.overlay.setMap(null);
      searchMarkerRef.current = null;
    }

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

  if (!appKey) {
    return (
      <div className="flex h-full items-center justify-center bg-gray-100 p-8 text-center">
        <div className="max-w-md">
          <h2 className="text-xl font-semibold">카카오맵 앱 키가 필요합니다</h2>
          <p className="mt-2 text-sm text-gray-600">
            <code>.env.local</code>에 <code>NEXT_PUBLIC_KAKAO_MAP_APP_KEY</code>를 설정한 뒤
            dev 서버를 재시작하세요.
          </p>
          <p className="mt-2 text-xs text-gray-500">
            카카오 개발자 콘솔에서 JavaScript 키를 발급받고, 사용할 도메인을 등록해야 합니다.
          </p>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="flex h-full items-center justify-center bg-red-50 p-8 text-center text-red-700">
        <div>
          <p className="font-semibold">지도 로딩 실패</p>
          <p className="mt-1 text-sm">{errorMsg}</p>
          <p className="mt-2 text-xs">앱 키와 등록된 도메인을 확인하세요.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />

      {status === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-50/80 text-gray-500">
          지도 로딩 중...
        </div>
      )}

      {status === 'ready' && <SearchBar onSelect={handleSearchSelect} />}

      {status === 'ready' && (
        <div className="absolute right-3 top-3 z-10 flex overflow-hidden rounded-md border border-gray-200 bg-white shadow">
          {(['SKYVIEW', 'ROADMAP', 'HYBRID'] as MapType[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setMapType(t)}
              className={`px-3 py-1.5 text-xs font-medium transition ${
                mapType === t
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              {t === 'SKYVIEW' ? '스카이뷰' : t === 'ROADMAP' ? '일반' : '하이브리드'}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function makeLabelOverlay(
  g: GCP,
  pos: kakao.maps.LatLng,
  map: kakao.maps.Map,
): kakao.maps.CustomOverlay {
  const kakao = window.kakao;
  const content = document.createElement('div');
  content.className = 'gcp-label';
  content.textContent = g.label;
  return new kakao.maps.CustomOverlay({
    position: pos,
    content,
    yAnchor: 2.4,
    zIndex: 3,
    map,
    clickable: false,
  });
}
