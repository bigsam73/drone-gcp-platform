import { describe, it, expect } from 'vitest';
import {
  looksLikeAddress,
  parsePlaceResult,
  parseAddressResult,
} from '../search';

describe('looksLikeAddress', () => {
  it('숫자가 포함된 도로명은 주소로 판정', () => {
    expect(looksLikeAddress('테헤란로 152')).toBe(true);
    expect(looksLikeAddress('강남대로 396')).toBe(true);
  });

  it('숫자가 포함된 동/리는 주소로 판정', () => {
    expect(looksLikeAddress('삼성동 152-3')).toBe(true);
  });

  it('숫자 없는 동 이름은 주소 아님 (장소 검색으로)', () => {
    expect(looksLikeAddress('삼성동')).toBe(false);
    expect(looksLikeAddress('강남구')).toBe(false);
  });

  it('장소명은 주소 아님', () => {
    expect(looksLikeAddress('스타벅스 강남역')).toBe(false);
    expect(looksLikeAddress('잠실 롯데타워')).toBe(false);
  });

  it('빈 입력은 false', () => {
    expect(looksLikeAddress('')).toBe(false);
  });
});

describe('parsePlaceResult', () => {
  it('카카오 Places 응답을 SearchResult로 변환', () => {
    const raw = {
      id: '123',
      place_name: '스타벅스 강남역점',
      address_name: '서울 강남구 역삼동 123-4',
      road_address_name: '서울 강남구 강남대로 396',
      x: '127.0276',
      y: '37.4979',
      category_group_name: '카페',
    };
    const result = parsePlaceResult(raw, 0);
    expect(result.name).toBe('스타벅스 강남역점');
    expect(result.address).toBe('서울 강남구 강남대로 396');
    expect(result.lat).toBeCloseTo(37.4979, 4);
    expect(result.lng).toBeCloseTo(127.0276, 4);
    expect(result.source).toBe('place');
    expect(result.id).toMatch(/^place_/);
  });

  it('도로명 주소가 없으면 지번 주소 사용', () => {
    const raw = {
      id: '456',
      place_name: '시골 가게',
      address_name: '강원 평창군 봉평면 어딘가',
      road_address_name: '',
      x: '128.0',
      y: '37.5',
      category_group_name: '',
    };
    const result = parsePlaceResult(raw, 1);
    expect(result.address).toBe('강원 평창군 봉평면 어딘가');
  });
});

describe('parseAddressResult', () => {
  it('카카오 Geocoder 응답을 SearchResult로 변환', () => {
    const raw = {
      address_name: '서울 강남구 강남대로 396',
      road_address: {
        address_name: '서울 강남구 강남대로 396',
        building_name: '강남빌딩',
      },
      address: { address_name: '서울 강남구 역삼동 123-4' },
      x: '127.0276',
      y: '37.4979',
    };
    const result = parseAddressResult(raw, 0);
    expect(result.name).toBe('서울 강남구 강남대로 396');
    expect(result.address).toBe('서울 강남구 역삼동 123-4');
    expect(result.lat).toBeCloseTo(37.4979, 4);
    expect(result.lng).toBeCloseTo(127.0276, 4);
    expect(result.source).toBe('address');
    expect(result.id).toMatch(/^addr_/);
  });

  it('지번 주소만 있을 때도 처리', () => {
    const raw = {
      address_name: '서울 강남구 역삼동 123-4',
      x: '127.0',
      y: '37.5',
    };
    const result = parseAddressResult(raw, 0);
    expect(result.name).toBe('서울 강남구 역삼동 123-4');
    expect(result.address).toBe('');
  });
});
