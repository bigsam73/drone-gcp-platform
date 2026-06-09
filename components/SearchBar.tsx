'use client';

import { useEffect, useRef, useState } from 'react';
import {
  looksLikeAddress,
  parseAddressResult,
  parsePlaceResult,
  type SearchResult,
} from '@/lib/search';

type Props = {
  onSelect: (result: SearchResult) => void;
};

const DEBOUNCE_MS = 300;
const MAX_RESULTS = 5;
const MIN_QUERY_LENGTH = 2;

type SearchState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'results'; items: SearchResult[] }
  | { kind: 'empty' }
  | { kind: 'error' };

export default function SearchBar({ onSelect }: Props) {
  const [query, setQuery] = useState('');
  const [state, setState] = useState<SearchState>({ kind: 'idle' });
  const [open, setOpen] = useState(false);
  const latestRequestRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  // Debounced search. setState is only called from async callbacks (not synchronously
  // in the effect body) to avoid cascading renders. When the query is too short,
  // the dropdown render is gated by the query length check below.
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      // Invalidate any in-flight result so it can't apply
      latestRequestRef.current++;
      return;
    }

    const requestId = ++latestRequestRef.current;

    const timer = setTimeout(() => {
      setState({ kind: 'loading' });
      runSearch(trimmed)
        .then((items) => {
          if (requestId !== latestRequestRef.current) return;
          if (items.length === 0) setState({ kind: 'empty' });
          else setState({ kind: 'results', items: items.slice(0, MAX_RESULTS) });
        })
        .catch(() => {
          if (requestId !== latestRequestRef.current) return;
          setState({ kind: 'error' });
        });
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query]);

  const handleSelect = (result: SearchResult) => {
    onSelect(result);
    setOpen(false);
  };

  const handleClear = () => {
    setQuery('');
    setState({ kind: 'idle' });
    setOpen(false);
  };

  return (
    <div
      ref={containerRef}
      className="absolute left-1/2 top-3 z-10 w-80 -translate-x-1/2"
    >
      <div className="flex items-center rounded-md border border-gray-200 bg-white shadow">
        <span className="pl-3 text-gray-400" aria-hidden>🔍</span>
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="주소·장소 검색"
          className="flex-1 bg-transparent px-2 py-2 text-sm outline-none"
        />
        {query && (
          <button
            type="button"
            onClick={handleClear}
            className="px-3 py-2 text-sm text-gray-400 hover:text-gray-700"
            aria-label="검색 지우기"
          >
            ✕
          </button>
        )}
      </div>

      {open && query.trim().length >= MIN_QUERY_LENGTH && (
        <div className="mt-1 max-h-80 overflow-auto rounded-md border border-gray-200 bg-white shadow">
          {state.kind === 'loading' && (
            <div className="p-3 text-sm text-gray-500">검색 중...</div>
          )}
          {state.kind === 'empty' && (
            <div className="p-3 text-sm text-gray-500">검색 결과가 없습니다.</div>
          )}
          {state.kind === 'error' && (
            <div className="p-3 text-sm text-red-600">검색 실패. 잠시 후 다시 시도하세요.</div>
          )}
          {state.kind === 'results' &&
            state.items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelect(item)}
                className="block w-full border-b border-gray-100 px-3 py-2 text-left text-sm last:border-b-0 hover:bg-blue-50"
              >
                <div className="font-medium text-gray-900">{item.name}</div>
                {item.address && (
                  <div className="mt-0.5 text-xs text-gray-500">{item.address}</div>
                )}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

async function runSearch(query: string): Promise<SearchResult[]> {
  const services = window.kakao?.maps?.services;
  if (!services) throw new Error('services library not loaded');

  const tryAddress = () =>
    new Promise<SearchResult[]>((resolve) => {
      const geocoder = new services.Geocoder();
      geocoder.addressSearch(query, (result, status) => {
        if (status === 'OK') {
          resolve(result.map((r, i) => parseAddressResult(r, i)));
        } else {
          resolve([]);
        }
      });
    });

  const tryPlace = () =>
    new Promise<SearchResult[]>((resolve) => {
      const places = new services.Places();
      places.keywordSearch(
        query,
        (result, status) => {
          if (status === 'OK') {
            resolve(result.map((r, i) => parsePlaceResult(r, i)));
          } else {
            resolve([]);
          }
        },
        { size: 10 },
      );
    });

  const primary = looksLikeAddress(query) ? tryAddress : tryPlace;
  const fallback = looksLikeAddress(query) ? tryPlace : tryAddress;

  const first = await primary();
  if (first.length > 0) return first;
  return fallback();
}
