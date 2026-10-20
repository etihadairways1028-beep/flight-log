// Great-circle maths on a spherical Earth (mean radius 6371.0088 km, IUGG).
const R = 6371.0088;
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function distanceBetween(a: { lat: number | null; lon: number | null } | null, b: { lat: number | null; lon: number | null } | null): number | null {
  if (!a || !b || a.lat == null || a.lon == null || b.lat == null || b.lon == null) return null;
  return haversineKm(a.lat, a.lon, b.lat, b.lon);
}

/** Initial true course from A to B, degrees 0–360. */
export function initialBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const y = Math.sin(rad(lon2 - lon1)) * Math.cos(rad(lat2));
  const x = Math.cos(rad(lat1)) * Math.sin(rad(lat2)) - Math.sin(rad(lat1)) * Math.cos(rad(lat2)) * Math.cos(rad(lon2 - lon1));
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

/** Points along the great circle (inclusive). Longitudes are kept continuous (may exceed ±180) so callers can split at the antimeridian. */
export function greatCirclePoints(lat1: number, lon1: number, lat2: number, lon2: number, n = 64): [number, number][] {
  const φ1 = rad(lat1), λ1 = rad(lon1), φ2 = rad(lat2), λ2 = rad(lon2);
  const d = 2 * Math.asin(Math.sqrt(Math.sin((φ2 - φ1) / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin((λ2 - λ1) / 2) ** 2));
  if (d === 0) return [[lon1, lat1]];
  const out: [number, number][] = [];
  let prevLon: number | null = null;
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
    const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
    const z = A * Math.sin(φ1) + B * Math.sin(φ2);
    let lon = deg(Math.atan2(y, x));
    const lat = deg(Math.atan2(z, Math.sqrt(x * x + y * y)));
    if (prevLon != null) {
      while (lon - prevLon > 180) lon -= 360;
      while (lon - prevLon < -180) lon += 360;
    }
    prevLon = lon;
    out.push([lon, lat]);
  }
  return out;
}

/** Does the great-circle path cross the antimeridian? */
export function crossesAntimeridian(lon1: number, lon2: number, lat1 = 0, lat2 = 0): boolean {
  const pts = greatCirclePoints(lat1, lon1, lat2, lon2, 32);
  return pts.some(([lon]) => lon > 180 || lon < -180);
}

const AMERICAS = new Set(['NA', 'SA']);
/** Flight Log's definition of an ocean crossing: one end in the Americas, the other in Europe, Africa, Asia or Oceania (Atlantic or Pacific). */
export function isOceanCrossing(c1: string, c2: string): boolean {
  if (!c1 || !c2) return false;
  return AMERICAS.has(c1) !== AMERICAS.has(c2);
}
