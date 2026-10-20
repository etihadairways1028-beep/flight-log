// Runway data from OurAirports (public domain), lazy-loaded.
export interface Runway { le: string; he: string; lengthFt: number | null; widthFt: number | null; surface: string; lighted: boolean; leHeading: number | null }
let data: Record<string, [string, string, number | null, number | null, string, number, number | null][]> | null = null;
let p: Promise<void> | null = null;

export function loadRunways(): Promise<void> {
  if (!p) {
    const base = (import.meta as any).env?.BASE_URL ?? './';
    p = fetch(`${base}data/runways.json`).then((r) => (r.ok ? r.json() : {})).then((d) => { data = d; }).catch(() => { p = null; });
  }
  return p;
}
export function runwaysAt(ident: string | undefined): Runway[] {
  if (!data || !ident) return [];
  return (data[ident] ?? []).map(([le, he, lengthFt, widthFt, surface, lighted, leHeading]) => ({ le, he, lengthFt, widthFt, surface, lighted: lighted === 1, leHeading }));
}
/** The runway (and which end) matching a designator such as "31R" or "RW31R". */
export function findRunway(ident: string | undefined, designator: string | undefined) {
  const d = (designator ?? '').replace(/^RW/i, '').toUpperCase();
  if (!d) return null;
  for (const r of runwaysAt(ident)) {
    if (r.le.toUpperCase() === d) return { rw: r, end: r.le, heading: r.leHeading };
    if (r.he.toUpperCase() === d) return { rw: r, end: r.he, heading: r.leHeading != null ? (r.leHeading + 180) % 360 : null };
  }
  return null;
}
export const SURFACE: Record<string, string> = { ASP: 'Asphalt', ASPH: 'Asphalt', CON: 'Concrete', CONC: 'Concrete', PEM: 'Asphalt/concrete', GRS: 'Grass', GRASS: 'Grass', GRE: 'Gravel', GRAVEL: 'Gravel', TURF: 'Turf', DIRT: 'Dirt', WATER: 'Water', BIT: 'Bitumen' };
