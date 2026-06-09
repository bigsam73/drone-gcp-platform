import { describe, it, expect } from 'vitest';
import { parseKml } from '../kml-parser';

const OUR_KML = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Drone Mapping GCP Plan</name>
    <Placemark>
      <name>Mapping Area</name>
      <Polygon>
        <outerBoundaryIs><LinearRing><coordinates>
          127.000000,37.500000,0 127.001134,37.500000,0 127.001134,37.500902,0 127.000000,37.500902,0 127.000000,37.500000,0
        </coordinates></LinearRing></outerBoundaryIs>
      </Polygon>
    </Placemark>
    <Placemark>
      <name>GCP-01</name>
      <Point><coordinates>127.000000,37.500000,0</coordinates></Point>
    </Placemark>
    <Placemark>
      <name>GCP-02</name>
      <Point><coordinates>127.001134,37.500902,0</coordinates></Point>
    </Placemark>
  </Document>
</kml>`;

describe('parseKml — success cases', () => {
  it('우리가 생성한 KML을 round-trip으로 복원', () => {
    const r = parseKml(OUR_KML);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.polygon).toHaveLength(4);
    expect(r.data.polygon![0]).toEqual({ lat: 37.5, lng: 127.0 });
    expect(r.data.gcps).toHaveLength(2);
    expect(r.data.gcps[0].lat).toBeCloseTo(37.5, 5);
    expect(r.data.gcps[0].lng).toBeCloseTo(127.0, 5);
    expect(r.data.gcps[0].label).toBe('GCP-01');
    expect(r.data.gcps[1].label).toBe('GCP-02');
  });

  it('Polygon만 있는 KML', () => {
    const kml = `<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>
      <Placemark><Polygon><outerBoundaryIs><LinearRing><coordinates>
        127,37,0 128,37,0 128,38,0 127,37,0
      </coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>
    </Document></kml>`;
    const r = parseKml(kml);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.polygon).not.toBeNull();
    expect(r.data.polygon).toHaveLength(3);
    expect(r.data.gcps).toEqual([]);
  });

  it('Point만 있는 KML', () => {
    const kml = `<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>
      <Placemark><name>foo</name><Point><coordinates>127.1,37.5</coordinates></Point></Placemark>
      <Placemark><name>bar</name><Point><coordinates>127.2,37.6</coordinates></Point></Placemark>
    </Document></kml>`;
    const r = parseKml(kml);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.polygon).toBeNull();
    expect(r.data.gcps).toHaveLength(2);
    expect(r.data.gcps[0].label).toBe('GCP-01');
    expect(r.data.gcps[1].label).toBe('GCP-02');
  });

  it('coordinates에 줄바꿈/탭/다중 공백 혼재 처리', () => {
    const kml = `<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>
      <Placemark><Polygon><outerBoundaryIs><LinearRing><coordinates>
        127,37,0
        \t128,37,0   128,38,0
        127,37,0
      </coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>
    </Document></kml>`;
    const r = parseKml(kml);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.polygon).toHaveLength(3);
  });

  it('고도값 없어도 처리', () => {
    const kml = `<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>
      <Placemark><Point><coordinates>127.1,37.5</coordinates></Point></Placemark>
    </Document></kml>`;
    const r = parseKml(kml);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.gcps[0]).toEqual({ lat: 37.5, lng: 127.1, label: 'GCP-01' });
  });

  it('다중 Polygon은 첫 번째만 사용', () => {
    const kml = `<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>
      <Placemark><Polygon><outerBoundaryIs><LinearRing><coordinates>
        127,37,0 128,37,0 128,38,0 127,37,0
      </coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>
      <Placemark><Polygon><outerBoundaryIs><LinearRing><coordinates>
        125,35,0 126,35,0 126,36,0 125,35,0
      </coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>
    </Document></kml>`;
    const r = parseKml(kml);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.polygon![0]).toEqual({ lat: 37, lng: 127 });
  });
});

describe('parseKml — error cases', () => {
  it('잘못된 XML은 invalid-xml', () => {
    const r = parseKml('<not valid xml');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe('invalid-xml');
  });

  it('KML 루트가 아니면 not-kml', () => {
    const r = parseKml('<?xml version="1.0"?><gpx><wpt lat="37" lon="127"/></gpx>');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe('not-kml');
  });

  it('Polygon, Point 둘 다 없으면 empty', () => {
    const kml = `<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>x</name></Document></kml>`;
    const r = parseKml(kml);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe('empty');
  });

  it('5MB 초과는 too-large', () => {
    const r = parseKml('x'.repeat(5 * 1024 * 1024 + 1));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe('too-large');
  });

  it('좌표 < 3개인 Polygon은 polygon=null로', () => {
    const kml = `<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>
      <Placemark><Polygon><outerBoundaryIs><LinearRing><coordinates>
        127,37,0 128,38,0
      </coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>
      <Placemark><Point><coordinates>127,37</coordinates></Point></Placemark>
    </Document></kml>`;
    const r = parseKml(kml);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.polygon).toBeNull();
    expect(r.data.gcps).toHaveLength(1);
  });

  it('NaN 좌표는 스킵', () => {
    const kml = `<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>
      <Placemark><Point><coordinates>abc,xyz</coordinates></Point></Placemark>
      <Placemark><Point><coordinates>127.1,37.5</coordinates></Point></Placemark>
    </Document></kml>`;
    const r = parseKml(kml);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.gcps).toHaveLength(1);
    expect(r.data.gcps[0].label).toBe('GCP-01');
  });
});
