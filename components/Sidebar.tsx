'use client';

import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { useStore, useArea, useRecommendedCount } from '@/lib/store';

export default function Sidebar() {
  const drawingMode = useStore((s) => s.drawingMode);
  const setDrawingMode = useStore((s) => s.setDrawingMode);
  const polygon = useStore((s) => s.polygon);
  const gcps = useStore((s) => s.gcps);
  const setUserCount = useStore((s) => s.setUserCount);
  const reset = useStore((s) => s.reset);

  const area = useArea();
  const recommended = useRecommendedCount();
  const min = Math.max(3, Math.ceil(recommended * 0.5));
  const max = Math.max(min + 1, Math.ceil(recommended * 1.5));

  return (
    <aside className="flex h-full w-80 flex-col gap-4 border-r bg-gray-50 p-4">
      <h2 className="text-lg font-semibold">컨트롤</h2>

      <Button
        variant={drawingMode ? 'default' : 'outline'}
        onClick={() => setDrawingMode(!drawingMode)}
        disabled={drawingMode}
      >
        {drawingMode
          ? '지도에서 다각형을 그리세요...'
          : polygon
            ? '구역 다시 그리기'
            : '구역 그리기'}
      </Button>

      {polygon && (
        <div className="flex flex-col gap-1 rounded-xl bg-card p-3 text-sm text-card-foreground ring-1 ring-foreground/10">
          <div className="flex justify-between">
            <span className="text-gray-600">면적</span>
            <span className="font-medium">{area.toFixed(2)} ha</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">권장 GCP</span>
            <span className="font-medium">{recommended}개</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">현재 GCP</span>
            <span className="font-medium">{gcps.length}개</span>
          </div>
        </div>
      )}

      {polygon && (
        <div>
          <label className="text-sm font-medium">
            GCP 개수 조정 ({gcps.length})
          </label>
          <Slider
            min={min}
            max={max}
            step={1}
            value={[gcps.length]}
            onValueChange={(v) => {
              const arr = Array.isArray(v) ? v : [v];
              setUserCount(arr[0]);
            }}
            className="mt-2"
          />
          <p className="mt-2 text-xs text-gray-500">
            마커 드래그로 이동, 우클릭으로 삭제, 빈 곳 클릭으로 추가.
          </p>
        </div>
      )}

      <div className="flex-1" />

      {polygon && (
        <Button variant="outline" onClick={reset}>
          전체 초기화
        </Button>
      )}
    </aside>
  );
}
