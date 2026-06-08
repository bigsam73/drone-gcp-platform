import { describe, it, expect } from 'vitest';
import { generateKML } from '../kml-generator';

describe('generateKML', () => {
  const polygon = [
    { lat: 37.5, lng: 127.0 },
    { lat: 37.5, lng: 127.01 },
    { lat: 37.51, lng: 127.01 },
  ];
  const gcps = [
    { id: 'a', lat: 37.5, lng: 127.0, label: 'GCP-01' },
    { id: 'b', lat: 37.505, lng: 127.005, label: 'GCP-02' },
  ];

  it('XML 헤더와 kml 루트 포함', () => {
    const kml = generateKML(polygon, gcps);
    expect(kml).toMatch(/^<\?xml/);
    expect(kml).toContain('<kml xmlns="http://www.opengis.net/kml/2.2">');
  });

  it('폴리곤 좌표를 포함하며 LinearRing이 닫힘', () => {
    const kml = generateKML(polygon, gcps);
    expect(kml).toContain('127.000000,37.500000,0');
    // 첫 점이 마지막에 한 번 더 등장해야 닫힌 LinearRing
    const matches = kml.match(/127\.000000,37\.500000,0/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it('각 GCP가 Placemark Point로 포함되며 좌표가 정확', () => {
    const kml = generateKML(polygon, gcps);
    expect(kml).toContain('<name>GCP-01</name>');
    expect(kml).toContain('<name>GCP-02</name>');
    expect(kml).toContain('127.005000,37.505000,0');
  });

  it('GCP만 있고 폴리곤이 없으면 Polygon 태그 없이 Point만 출력', () => {
    const kml = generateKML([], gcps);
    expect(kml).not.toContain('<Polygon>');
    expect(kml).toContain('<name>GCP-01</name>');
    expect(kml).toContain('<kml xmlns');
  });

  it('폴리곤만 있고 GCP가 없어도 정상 출력', () => {
    const kml = generateKML(polygon, []);
    expect(kml).toContain('<Polygon>');
    expect(kml).not.toContain('GCP-');
  });

  it('Mapping Area Placemark가 존재', () => {
    const kml = generateKML(polygon, gcps);
    expect(kml).toContain('<name>Mapping Area</name>');
  });

  it('Style 정의 포함 (areaStyle, gcpStyle)', () => {
    const kml = generateKML(polygon, gcps);
    expect(kml).toContain('id="areaStyle"');
    expect(kml).toContain('id="gcpStyle"');
  });

  it('XML 특수문자 이스케이프 (label에 <, &, > 포함시)', () => {
    const evilGCP = [{ id: 'x', lat: 0, lng: 0, label: 'A & B <test>' }];
    const kml = generateKML([], evilGCP);
    expect(kml).toContain('A &amp; B &lt;test&gt;');
    expect(kml).not.toContain('A & B <test>');
  });

  it('점 < 3 폴리곤은 Polygon 태그 제외', () => {
    const kml = generateKML([{ lat: 0, lng: 0 }, { lat: 1, lng: 1 }], gcps);
    expect(kml).not.toContain('<Polygon>');
  });
});
