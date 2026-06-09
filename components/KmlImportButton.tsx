'use client';

import { useRef, useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { parseKml } from '@/lib/kml-parser';
import { useStore } from '@/lib/store';

type Status =
  | { kind: 'idle' }
  | { kind: 'success'; message: string }
  | { kind: 'error'; message: string };

const STATUS_TIMEOUT_MS = 5000;

export default function KmlImportButton() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const importFromKml = useStore((s) => s.importFromKml);

  // 5초 후 자동 초기화
  useEffect(() => {
    if (status.kind === 'idle') return;
    const timer = setTimeout(() => setStatus({ kind: 'idle' }), STATUS_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [status]);

  const handleClick = () => {
    inputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // 같은 파일을 다시 선택할 수 있도록 input value 리셋
    e.target.value = '';

    try {
      const content = await file.text();
      const result = parseKml(content);
      if (!result.ok) {
        setStatus({ kind: 'error', message: result.message });
        return;
      }
      importFromKml(result.data);
      const polyMsg = result.data.polygon ? '구역 1' : '구역 없음';
      const gcpMsg = `GCP ${result.data.gcps.length}개`;
      setStatus({
        kind: 'success',
        message: `불러왔습니다 (${polyMsg}, ${gcpMsg}).`,
      });
    } catch {
      setStatus({ kind: 'error', message: '파일을 읽을 수 없습니다.' });
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <input
        ref={inputRef}
        type="file"
        accept=".kml,application/vnd.google-earth.kml+xml"
        onChange={handleFileChange}
        className="hidden"
      />
      <Button variant="outline" onClick={handleClick}>
        KML 불러오기
      </Button>
      {status.kind !== 'idle' && (
        <p
          className={`text-xs ${
            status.kind === 'success' ? 'text-green-700' : 'text-red-600'
          }`}
        >
          {status.message}
        </p>
      )}
    </div>
  );
}
