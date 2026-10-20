import type { AirportRef } from './types';

// Rows: [ident, iata, name, city, country, lat, lon, elevFt, tz, size, continent, scheduled]
type Row = [string, string, string, string, string, number, number, number | null, string, 'L' | 'M' | 'S', string, 0 | 1];

export interface Airport extends AirportRef {
  elevationFt: number | null;
  size: 'L' | 'M' | 'S';
  scheduled: boolean;
}

const byIdent = new Map<string, Airport>();
const byIata = new Map<string, Airport>();
let list: Airport[] = [];
let corePromise: Promise<void> | null = null;
let extPromise: Promise<void> | null = null;
let extLoaded = false;
const listeners = new Set<() => void>();

function toAirport(r: Row): Airport {
  return {
    ident: r[0], iata: r[1], name: r[2], city: r[3], country: r[4], lat: r[5], lon: r[6], elevationFt: r[7],
    tz: r[8] || 'UTC', size: r[9], continent: r[10], scheduled: r[11] === 1, source: 'dataset',
  };
}
function ingest(rows: Row[]) {
  for (const r of rows) {
    const a = toAirport(r);
    if (!byIdent.has(a.ident)) {
      byIdent.set(a.ident, a);
      list.push(a);
    }
    if (a.iata && (!byIata.has(a.iata) || (a.size === 'L' && byIata.get(a.iata)!.size !== 'L'))) byIata.set(a.iata, a);
  }
}

/** Exposed for tests and offline tooling. */
export function ingestRows(rows: unknown[]) {
  ingest(rows as Row[]);
}

const base = () => (import.meta as any).env?.BASE_URL ?? './';

export function loadAirports(): Promise<void> {
  if (!corePromise) {
    corePromise = fetch(`${base()}data/airports.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`Airport data failed to load (HTTP ${r.status}).`);
        return r.json();
      })
      .then((rows: Row[]) => {
        ingest(rows);
        listeners.forEach((l) => l());
      })
      .catch((e) => {
        corePromise = null;
        throw e;
      });
  }
  return corePromise;
}

/** ~10k additional small airfields (ICAO idents) — fetched only when a search needs them. */
export function loadExtendedAirports(): Promise<void> {
  if (!extPromise) {
    extPromise = fetch(`${base()}data/airports-ext.json`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: Row[]) => {
        ingest(rows);
        extLoaded = true;
        listeners.forEach((l) => l());
      })
      .catch(() => {
        extPromise = null;
      });
  }
  return extPromise;
}

export function onAirportsChange(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const airportsLoaded = () => list.length > 0;
export const extendedLoaded = () => extLoaded;
export const airportCount = () => list.length;
export const allAirports = () => list;

export function findAirport(code: string | null | undefined): Airport | undefined {
  if (!code) return undefined;
  const c = code.trim().toUpperCase();
  if (!c) return undefined;
  return byIdent.get(c) ?? (c.length === 3 ? byIata.get(c) : undefined);
}

export function toRef(a: Airport): AirportRef {
  const { ident, iata, name, city, country, continent, lat, lon, tz } = a;
  return { ident, iata, name, city, country, continent, lat, lon, tz, source: 'dataset' };
}

const sizeRank = { L: 0, M: 1, S: 2 } as const;

export function searchAirports(q: string, limit = 10): Airport[] {
  const s = q.trim().toLowerCase();
  if (!s) return [];
  const up = s.toUpperCase();
  const scored: [number, Airport][] = [];
  const exact = findAirport(up);
  if (exact) scored.push([-1, exact]);
  const words = s.split(/\s+/).filter(Boolean);
  for (const a of list) {
    if (a === exact) continue;
    let score = -1;
    if (a.iata.toLowerCase() === s || a.ident.toLowerCase() === s) score = 0;
    else if (a.iata.toLowerCase().startsWith(s) || a.ident.toLowerCase().startsWith(s)) score = 2;
    else {
      const name = a.name.toLowerCase(), city = a.city.toLowerCase();
      if (city.startsWith(s)) score = 3;
      else if (name.startsWith(s)) score = 4;
      else if (words.every((w) => name.includes(w) || city.includes(w) || countryName(a.country).toLowerCase().includes(w))) score = 6;
    }
    if (score >= 0) scored.push([score + sizeRank[a.size] * 0.9, a]);
  }
  scored.sort((x, y) => x[0] - y[0]);
  return scored.slice(0, limit).map((x) => x[1]);
}

let dn: Intl.DisplayNames | null = null;
try {
  dn = new Intl.DisplayNames(['en'], { type: 'region' });
} catch {
  dn = null;
}
export function countryName(code: string | null | undefined): string {
  if (!code) return 'Unknown';
  try {
    return dn?.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

export const CONTINENT_LABEL: Record<string, string> = {
  AF: 'Africa', AN: 'Antarctica', AS: 'Asia', EU: 'Europe', NA: 'North America', OC: 'Oceania', SA: 'South America',
};

/** Display code: IATA if available, else ICAO ident. */
export function code(a: AirportRef | null | undefined): string {
  if (!a) return '—';
  return a.iata || a.ident || '—';
}
