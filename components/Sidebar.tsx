'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useStore, useArea, useRecommendedCount } from '@/lib/store';
import {
  PRESETS,
  isValidPresetId,
  type RecommendationPresetId,
} from '@/lib/recommendation-presets';

export default function Sidebar() {
  const preset = useStore((s) => s.preset);
  const setPreset = useStore((s) => s.setPreset);
  const drawingMode = useStore((s) => s.drawingMode);
  const setDrawingMode = useStore((s) => s.setDrawingMode);
  const polygon = useStore((s) => s.polygon);
  const gcps = useStore((s) => s.gcps);
  const setUserCount = useStore((s) => s.setUserCount);
  const reset = useStore((s) => s.reset);
  const regenerate = useStore((s) => s.regenerate);

  const area = useArea();
  const recommended = useRecommendedCount();
  const min = Math.max(3, Math.ceil(recommended * 0.5));
  const max = Math.max(min + 1, Math.ceil(recommended * 1.5), gcps.length);

  // Restore preset from localStorage on mount (SSR-safe pattern)
  useEffect(() => {
    try {
      const saved = localStorage.getItem('drone-gcp-preset');
      if (saved && isValidPresetId(saved)) {
        setPreset(saved);
      }
    } catch {
      // ignore (Safari private mode etc.)
    }
    // setPreset is stable from zustand; only run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          <label className="text-sm font-medium">GCP 기준</label>
          <TooltipProvider delay={150}>
            <RadioGroup
              value={preset}
              onValueChange={(v) => setPreset(v as RecommendationPresetId)}
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
                    <TooltipTrigger
                      type="button"
                      className="rounded-full px-1.5 text-xs text-gray-400 hover:text-gray-700"
                      aria-label={`${p.name} 설명`}
                    >
                      ⓘ
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-xs text-xs">
                      <p className="font-medium">{p.name}</p>
                      <p className="mt-1">{p.description}</p>
                      <p className="mt-1 opacity-70">출처: {p.source}</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
              ))}
            </RadioGroup>
          </TooltipProvider>
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
          <Button
            variant="outline"
            size="sm"
            className="mt-3 w-full"
            onClick={() => regenerate()}
            disabled={gcps.length === recommended}
          >
            권장값({recommended}개)으로 재추천
          </Button>
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
