'use client';

import dynamic from 'next/dynamic';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';

// MapContainer uses Google Maps which requires window. SSR disabled.
// Next.js 16: `ssr: false` is only supported in Client Components, so this
// page is marked `'use client'`.
const MapContainer = dynamic(() => import('@/components/MapContainer'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-gray-50 text-gray-500">
      지도 초기화 중...
    </div>
  ),
});

export default function Page() {
  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1">
          <MapContainer />
        </main>
      </div>
    </div>
  );
}
