'use client';

import {
  GoogleMap,
  useJsApiLoader,
  DrawingManager,
  Polygon,
  Marker,
} from '@react-google-maps/api';
import { useStore } from '@/lib/store';
import { useCallback, useMemo } from 'react';

const libraries: ('drawing' | 'geometry')[] = ['drawing', 'geometry'];
const containerStyle = { width: '100%', height: '100%' };
const defaultCenter = { lat: 37.5665, lng: 126.978 };

export default function MapContainer() {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';

  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: apiKey,
    libraries,
  });

  const polygon = useStore((s) => s.polygon);
  const gcps = useStore((s) => s.gcps);
  const drawingMode = useStore((s) => s.drawingMode);
  const setPolygon = useStore((s) => s.setPolygon);
  const moveGCP = useStore((s) => s.moveGCP);
  const removeGCP = useStore((s) => s.removeGCP);
  const addGCP = useStore((s) => s.addGCP);

  const polygonPath = useMemo(
    () => (polygon ? polygon.map((p) => ({ lat: p.lat, lng: p.lng })) : []),
    [polygon],
  );

  const onPolygonComplete = useCallback(
    (poly: google.maps.Polygon) => {
      const path = poly.getPath();
      const coords: { lat: number; lng: number }[] = [];
      for (let i = 0; i < path.getLength(); i++) {
        const p = path.getAt(i);
        coords.push({ lat: p.lat(), lng: p.lng() });
      }
      poly.setMap(null); // remove the DrawingManager's temp polygon; store renders ours
      setPolygon(coords);
    },
    [setPolygon],
  );

  const onMapClick = useCallback(
    (e: google.maps.MapMouseEvent) => {
      if (drawingMode || !polygon || !e.latLng) return;
      addGCP(e.latLng.lat(), e.latLng.lng());
    },
    [drawingMode, polygon, addGCP],
  );

  if (!apiKey) {
    return (
      <div className="flex h-full items-center justify-center bg-gray-100 p-8 text-center">
        <div className="max-w-md">
          <h2 className="text-xl font-semibold">Google Maps API Key가 필요합니다</h2>
          <p className="mt-2 text-sm text-gray-600">
            <code>.env.local</code> 파일에{' '}
            <code>NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code>를 설정한 뒤 dev 서버를 재시작하세요.
          </p>
          <p className="mt-2 text-xs text-gray-500">
            Google Cloud Console에서 Maps JavaScript API를 활성화해야 합니다.
          </p>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex h-full items-center justify-center bg-red-50 p-8 text-center text-red-700">
        지도 로딩 실패. API 키와 네트워크를 확인하세요.
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="flex h-full items-center justify-center bg-gray-50 text-gray-500">
        지도 로딩 중...
      </div>
    );
  }

  return (
    <GoogleMap
      mapContainerStyle={containerStyle}
      center={defaultCenter}
      zoom={15}
      mapTypeId="hybrid"
      onClick={onMapClick}
      options={{
        streetViewControl: false,
        mapTypeControl: true,
        fullscreenControl: false,
      }}
    >
      {drawingMode && (
        <DrawingManager
          onPolygonComplete={onPolygonComplete}
          options={{
            drawingControl: false,
            drawingMode: google.maps.drawing.OverlayType.POLYGON,
            polygonOptions: {
              fillColor: '#3b82f6',
              fillOpacity: 0.2,
              strokeColor: '#1d4ed8',
              strokeWeight: 2,
              clickable: false,
              editable: false,
            },
          }}
        />
      )}

      {polygonPath.length > 0 && (
        <Polygon
          paths={polygonPath}
          options={{
            fillColor: '#3b82f6',
            fillOpacity: 0.15,
            strokeColor: '#1d4ed8',
            strokeWeight: 2,
            clickable: false,
          }}
        />
      )}

      {gcps.map((g) => (
        <Marker
          key={g.id}
          position={{ lat: g.lat, lng: g.lng }}
          draggable
          label={{
            text: g.label,
            fontSize: '11px',
            color: '#ffffff',
            fontWeight: '600',
          }}
          onDragEnd={(e) => {
            if (e.latLng) moveGCP(g.id, e.latLng.lat(), e.latLng.lng());
          }}
          onRightClick={() => removeGCP(g.id)}
          icon={{
            path: google.maps.SymbolPath.CIRCLE,
            scale: 11,
            fillColor: '#dc2626',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 2,
          }}
        />
      ))}
    </GoogleMap>
  );
}
