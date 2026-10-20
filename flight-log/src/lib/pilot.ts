// Pilot-logbook helpers: sun-based night-time estimate, recency (currency) and totals.
// Recency follows the common "3 takeoffs and 3 landings in the preceding 90 days"
// pattern (e.g. FAA 61.57, EASA FCL.060). It's an indicator only — rules differ by
// authority, aircraft class and type rating, so always check your own regulations.
import { DateTime } from 'luxon';
import type { Flight, PilotTimes } from './types';
import { PILOT_FIELDS } from './types';
import { greatCirclePoints } from './geo';
import { isCounted, isSim } from './flight';

const rad = Math.PI / 180;

/** Solar elevation in degrees (NOAA low-precision algorithm, ≈0.1° accuracy). */
export function sunAltitude(date: Date, lat: number, lon: number): number {
  const d = date.getTime() / 86400000 + 2440587.5 - 2451545.0;
  const g = (357.529 + 0.98560028 * d) * rad;
  const q = 280.459 + 0.98564736 * d;
  const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * rad;
  const e = (23.439 - 0.00000036 * d) * rad;
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  const gmst = (18.697374558 + 24.06570982441908 * d) % 24;
  const lha = (gmst * 15 + lon) * rad - ra;
  return Math.asin(Math.sin(lat * rad) * Math.sin(dec) + Math.cos(lat * rad) * Math.cos(dec) * Math.cos(lha)) / rad;
}

/** Night = sun more than 6° below the horizon (end of evening to start of morning civil twilight). */
export const isNight = (date: Date, lat: number, lon: number) => sunAltitude(date, lat, lon) < -6;

/**
 * Estimated night minutes between takeoff and landing, sampling the great-circle
 * path once a minute at constant speed. Returns null when times or coordinates are missing.
 */
export function estimateNightMinutes(f: Pick<Flight, 'dep' | 'arr' | 'times'>): number | null {
  const t0 = f.times.takeoff ?? f.times.offBlock, t1 = f.times.landing ?? f.times.onBlock;
  if (!t0 || !t1 || f.dep?.lat == null || f.dep.lon == null || f.arr?.lat == null || f.arr.lon == null) return null;
  const a = Date.parse(t0), b = Date.parse(t1);
  const mins = Math.round((b - a) / 60000);
  if (!(mins > 0) || mins > 24 * 60) return null;
  const pts = greatCirclePoints(f.dep.lat, f.dep.lon, f.arr.lat, f.arr.lon, Math.max(1, mins));
  let night = 0;
  for (let i = 0; i < mins; i++) {
    const [lon, lat] = pts[Math.min(pts.length - 1, i)] ?? pts[pts.length - 1];
    if (isNight(new Date(a + (i + 0.5) * 60000), lat, ((lon + 540) % 360) - 180)) night++;
  }
  return night;
}

export interface Recency { label: string; rule: string; met: boolean; count: number; needed: number; validUntil: string | null; daysLeft: number | null }

function recency(flights: Flight[], label: string, rule: string, pick: (f: Flight) => [number, number], today: DateTime): Recency {
  // newest first; walk back until 3 takeoffs and 3 landings are accumulated
  const sorted = [...flights].sort((x, y) => y.date.localeCompare(x.date));
  let to = 0, ldg = 0, qualifyingDate: string | null = null;
  for (const f of sorted) {
    const [t, l] = pick(f);
    if (!t && !l) continue;
    to += t; ldg += l;
    if (to >= 3 && ldg >= 3) { qualifyingDate = f.date; break; }
  }
  const since = today.minus({ days: 90 }).toISODate()!;
  const inWindow = sorted.filter((f) => f.date > since).reduce((acc, f) => acc + pick(f)[1], 0);
  const validUntil = qualifyingDate ? DateTime.fromISO(qualifyingDate).plus({ days: 90 }).toISODate() : null;
  const daysLeft = validUntil ? Math.floor(DateTime.fromISO(validUntil).diff(today.startOf('day'), 'days').days) : null;
  return { label, rule, met: daysLeft != null && daysLeft >= 0, count: inWindow, needed: 3, validUntil, daysLeft };
}

/** Recency for real-world flights where takeoffs/landings were recorded. */
export function computeRecency(all: Flight[], today: DateTime = DateTime.local()): Recency[] {
  const real = all.filter((f) => isCounted(f) && !isSim(f));
  return [
    recency(real, 'Passenger recency', '3 takeoffs and 3 landings in the last 90 days', (f) => [(f.takeoffsDay ?? 0) + (f.takeoffsNight ?? 0), (f.landingsDay ?? 0) + (f.landingsNight ?? 0)], today),
    recency(real, 'Night recency', '3 night takeoffs and 3 night landings in the last 90 days', (f) => [f.takeoffsNight ?? 0, f.landingsNight ?? 0], today),
  ];
}

export type PilotTotals = Record<keyof PilotTimes, number> & { total: number; block: number; flights: number; takeoffs: number; landings: number; nightLandings: number };

export function pilotTotals(fs: Flight[]): PilotTotals {
  const t = { total: 0, block: 0, flights: 0, takeoffs: 0, landings: 0, nightLandings: 0 } as PilotTotals;
  for (const p of PILOT_FIELDS) t[p.key] = 0;
  for (const f of fs) {
    if (!isCounted(f)) continue;
    t.flights++;
    t.total += f.flightMinutes ?? 0;
    t.block += f.blockMinutes ?? 0;
    t.takeoffs += (f.takeoffsDay ?? 0) + (f.takeoffsNight ?? 0);
    t.landings += (f.landingsDay ?? 0) + (f.landingsNight ?? 0);
    t.nightLandings += f.landingsNight ?? 0;
    for (const p of PILOT_FIELDS) t[p.key] += f.pilot?.[p.key] ?? 0;
  }
  return t;
}

/** Totals over the windows pilots usually track. */
export function pilotWindows(all: Flight[], sim: boolean, today: DateTime = DateTime.local()) {
  const fs = all.filter((f) => isCounted(f) && isSim(f) === sim);
  const since = (d: DateTime) => fs.filter((f) => f.date >= d.toISODate()!);
  return [
    { key: '28d', label: 'Last 28 days', totals: pilotTotals(since(today.minus({ days: 28 }))) },
    { key: '90d', label: 'Last 90 days', totals: pilotTotals(since(today.minus({ days: 90 }))) },
    { key: '12m', label: 'Last 12 months', totals: pilotTotals(since(today.minus({ months: 12 }))) },
    { key: 'cy', label: `Calendar year ${today.year}`, totals: pilotTotals(since(today.startOf('year'))) },
    { key: 'all', label: 'All time', totals: pilotTotals(fs) },
  ];
}
