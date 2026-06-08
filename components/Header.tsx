'use client';

import { Button } from '@/components/ui/button';
import { useStore } from '@/lib/store';
import { generateKML, downloadKML } from '@/lib/kml-generator';

export default function Header() {
  const polygon = useStore((s) => s.polygon);
  const gcps = useStore((s) => s.gcps);

  const onDownload = () => {
    const kml = generateKML(polygon ?? [], gcps);
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    downloadKML(`drone-gcp-${ts}.kml`, kml);
  };

  const hasContent = (polygon && polygon.length >= 3) || gcps.length > 0;

  return (
    <header className="flex h-14 items-center justify-between border-b bg-white px-4">
      <h1 className="text-lg font-semibold">Drone GCP Platform</h1>
      <Button onClick={onDownload} disabled={!hasContent}>
        KML 다운로드
      </Button>
    </header>
  );
}
