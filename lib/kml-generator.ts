import { LatLng } from './geometry';
import { GCP } from './gcp-algorithm';

const fmt = (n: number) => n.toFixed(6);

const escapeXml = (s: string) =>
  s.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case "'": return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });

function polygonPlacemark(coords: LatLng[]): string {
  if (coords.length < 3) return '';
  const ring = [...coords, coords[0]];
  const coordStr = ring.map((p) => `${fmt(p.lng)},${fmt(p.lat)},0`).join(' ');
  return `    <Placemark>
      <name>Mapping Area</name>
      <styleUrl>#areaStyle</styleUrl>
      <Polygon>
        <outerBoundaryIs>
          <LinearRing>
            <coordinates>${coordStr}</coordinates>
          </LinearRing>
        </outerBoundaryIs>
      </Polygon>
    </Placemark>`;
}

function gcpPlacemark(g: GCP): string {
  return `    <Placemark>
      <name>${escapeXml(g.label)}</name>
      <styleUrl>#gcpStyle</styleUrl>
      <Point><coordinates>${fmt(g.lng)},${fmt(g.lat)},0</coordinates></Point>
    </Placemark>`;
}

export function generateKML(polygon: LatLng[], gcps: GCP[]): string {
  const placemarks = [
    polygonPlacemark(polygon),
    ...gcps.map(gcpPlacemark),
  ].filter(Boolean);

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Drone Mapping GCP Plan</name>
    <Style id="areaStyle">
      <LineStyle><color>ff0000ff</color><width>2</width></LineStyle>
      <PolyStyle><color>4400ffff</color></PolyStyle>
    </Style>
    <Style id="gcpStyle">
      <IconStyle>
        <Icon><href>http://maps.google.com/mapfiles/kml/paddle/red-circle.png</href></Icon>
      </IconStyle>
    </Style>
${placemarks.join('\n')}
  </Document>
</kml>`;
}

export function downloadKML(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'application/vnd.google-earth.kml+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
