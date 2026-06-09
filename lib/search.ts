export type SearchResult = {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  source: 'place' | 'address';
};

export function looksLikeAddress(q: string): boolean {
  if (!q) return false;
  if (!/\d/.test(q)) return false;
  return /(동|로|길|읍|면|리|가|번지)\s*\d/.test(q);
}

export type RawPlace = {
  id?: string;
  place_name: string;
  address_name: string;
  road_address_name?: string;
  x: string;
  y: string;
  category_group_name?: string;
};

export type RawAddress = {
  address_name: string;
  address?: { address_name: string };
  road_address?: { address_name: string; building_name?: string };
  x: string;
  y: string;
};

export function parsePlaceResult(raw: RawPlace, index: number): SearchResult {
  return {
    id: `place_${raw.id ?? index}`,
    name: raw.place_name,
    address: raw.road_address_name?.trim() || raw.address_name,
    lat: parseFloat(raw.y),
    lng: parseFloat(raw.x),
    source: 'place',
  };
}

export function parseAddressResult(raw: RawAddress, index: number): SearchResult {
  const roadName = raw.road_address?.address_name;
  const jibunName = raw.address?.address_name;
  const primary = roadName ?? raw.address_name;
  const secondary = roadName && jibunName ? jibunName : '';
  return {
    id: `addr_${index}_${hash(raw.address_name)}`,
    name: primary,
    address: secondary,
    lat: parseFloat(raw.y),
    lng: parseFloat(raw.x),
    source: 'address',
  };
}

function hash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}
