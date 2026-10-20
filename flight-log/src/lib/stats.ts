import type { Flight } from './types';
import { aircraftLabel, isCounted, isSim, routeKey, typeKey } from './flight';
import { aircraftType, classify } from './aircraftTypes';
import { monthKey, monthRange } from './time';

export interface Group {
  key: string;
  label: string;
  flights: number;
  minutes: number;
  distanceKm: number;
  last: string;
  first: string;
}

export interface Summary {
  flights: number;
  realFlights: number;
  simFlights: number;
  flightMinutes: number;
  flightTimeKnown: number;   // flights with a flight-time value
  realMinutes: number;
  simMinutes: number;
  blockMinutes: number;
  blockKnown: number;
  distanceKm: number;
  distanceKnown: number;
  uniqueTypes: number;
  uniqueRegistrations: number;
  uniqueAirports: number;
  uniqueCountries: number;
  uniqueRoutes: number;
  airlines: number;
  avgMinutes: number | null;
  medianMinutes: number | null;
  longest: Flight | null;      // by duration
  shortest: Flight | null;
  longestDistance: Flight | null;
  topType: Group | null;
  firstDate: string | null;
  lastDate: string | null;
  excluded: number;            // planned / cancelled
}

/** Best available duration for "time" totals: flight time, else nothing (block is tracked separately). */
export const durationOf = (f: Flight): number | null => f.flightMinutes;

export function summarize(all: Flight[]): Summary {
  const flights = all.filter(isCounted);
  const durs: number[] = [];
  let flightMinutes = 0, realMinutes = 0, simMinutes = 0, blockMinutes = 0, blockKnown = 0, distanceKm = 0, distanceKnown = 0;
  const types = new Set<string>(), regs = new Set<string>(), airports = new Set<string>(), countries = new Set<string>(), routes = new Set<string>(), airlines = new Set<string>();
  let longest: Flight | null = null, shortest: Flight | null = null, longestDistance: Flight | null = null;
  let firstDate: string | null = null, lastDate: string | null = null;
  for (const f of flights) {
    const m = durationOf(f);
    if (m != null) {
      durs.push(m);
      flightMinutes += m;
      if (isSim(f)) simMinutes += m; else realMinutes += m;
      if (!longest || m > (longest.flightMinutes ?? -1)) longest = f;
      if (!shortest || m < (shortest.flightMinutes ?? Infinity)) shortest = f;
    }
    if (f.blockMinutes != null) { blockMinutes += f.blockMinutes; blockKnown++; }
    if (f.distanceKm != null) {
      distanceKm += f.distanceKm; distanceKnown++;
      if (!longestDistance || f.distanceKm > (longestDistance.distanceKm ?? -1)) longestDistance = f;
    }
    const tk = typeKey(f);
    if (tk !== 'UNKNOWN') types.add(tk);
    if (f.aircraft.registration) regs.add(f.aircraft.registration.toUpperCase());
    for (const a of [f.dep, f.arr]) if (a) { airports.add(a.ident); if (a.country) countries.add(a.country); }
    const rk = routeKey(f);
    if (rk) routes.add(rk);
    if (f.airline) airlines.add(f.airline.toLowerCase());
    if (!firstDate || f.date < firstDate) firstDate = f.date;
    if (!lastDate || f.date > lastDate) lastDate = f.date;
  }
  durs.sort((a, b) => a - b);
  const median = durs.length ? (durs.length % 2 ? durs[(durs.length - 1) / 2] : (durs[durs.length / 2 - 1] + durs[durs.length / 2]) / 2) : null;
  const byType = groupBy(flights, (f) => typeKey(f), (f) => aircraftLabel(f)).filter((g) => g.key !== 'UNKNOWN');
  return {
    flights: flights.length,
    realFlights: flights.filter((f) => !isSim(f)).length,
    simFlights: flights.filter(isSim).length,
    flightMinutes, flightTimeKnown: durs.length, realMinutes, simMinutes, blockMinutes, blockKnown, distanceKm, distanceKnown,
    uniqueTypes: types.size, uniqueRegistrations: regs.size, uniqueAirports: airports.size, uniqueCountries: countries.size,
    uniqueRoutes: routes.size, airlines: airlines.size,
    avgMinutes: durs.length ? flightMinutes / durs.length : null,
    medianMinutes: median, longest, shortest, longestDistance,
    topType: byType[0] ?? null, firstDate, lastDate,
    excluded: all.length - flights.length,
  };
}

/** Group counted flights by a key; sorted by flights desc, then minutes. */
export function groupBy(flights: Flight[], key: (f: Flight) => string | null | undefined, label?: (f: Flight) => string): Group[] {
  const m = new Map<string, Group>();
  for (const f of flights) {
    if (!isCounted(f)) continue;
    const k = key(f);
    if (!k) continue;
    let g = m.get(k);
    if (!g) { g = { key: k, label: label ? label(f) : k, flights: 0, minutes: 0, distanceKm: 0, first: f.date, last: f.date }; m.set(k, g); }
    g.flights++;
    g.minutes += durationOf(f) ?? 0;
    g.distanceKm += f.distanceKm ?? 0;
    if (f.date < g.first) g.first = f.date;
    if (f.date > g.last) g.last = f.date;
  }
  return [...m.values()].sort((a, b) => b.flights - a.flights || b.minutes - a.minutes);
}

export interface MonthPoint { month: string; flights: number; minutes: number; realMinutes: number; simMinutes: number; blockMinutes: number; distanceKm: number; cumulativeMinutes: number; cumulativeFlights: number }

export function monthly(all: Flight[], fromKey?: string, toKey?: string): MonthPoint[] {
  const flights = all.filter(isCounted);
  if (!flights.length && !(fromKey && toKey)) return [];
  const keys = flights.map((f) => monthKey(f.date)).sort();
  const start = fromKey ?? keys[0], end = toKey ?? keys[keys.length - 1];
  const map = new Map(monthRange(start, end).map((k) => [k, { month: k, flights: 0, minutes: 0, realMinutes: 0, simMinutes: 0, blockMinutes: 0, distanceKm: 0, cumulativeMinutes: 0, cumulativeFlights: 0 }]));
  for (const f of flights) {
    const p = map.get(monthKey(f.date));
    if (!p) continue;
    p.flights++;
    const m = durationOf(f) ?? 0;
    p.minutes += m;
    if (isSim(f)) p.simMinutes += m; else p.realMinutes += m;
    p.blockMinutes += f.blockMinutes ?? 0;
    p.distanceKm += f.distanceKm ?? 0;
  }
  // cumulative includes everything before the window
  let cm = 0, cf = 0;
  for (const f of flights) if (monthKey(f.date) < start) { cm += durationOf(f) ?? 0; cf++; }
  const out = [...map.values()];
  for (const p of out) { cm += p.minutes; cf += p.flights; p.cumulativeMinutes = cm; p.cumulativeFlights = cf; }
  return out;
}

export interface AirportVisit { ident: string; label: string; name: string; city: string; country: string; departures: number; arrivals: number; total: number; lat: number | null; lon: number | null; last: string; first: string }

export function airportVisits(all: Flight[]): AirportVisit[] {
  const m = new Map<string, AirportVisit>();
  const touch = (a: Flight['dep'], f: Flight, kind: 'departures' | 'arrivals') => {
    if (!a) return;
    let v = m.get(a.ident);
    if (!v) { v = { ident: a.ident, label: a.iata || a.ident, name: a.name, city: a.city, country: a.country, departures: 0, arrivals: 0, total: 0, lat: a.lat, lon: a.lon, last: f.date, first: f.date }; m.set(a.ident, v); }
    v[kind]++; v.total++;
    if (f.date > v.last) v.last = f.date;
    if (f.date < v.first) v.first = f.date;
  };
  for (const f of all) {
    if (!isCounted(f)) continue;
    touch(f.dep, f, 'departures');
    touch(f.arr, f, 'arrivals');
  }
  return [...m.values()].sort((a, b) => b.total - a.total);
}

export function domesticSplit(all: Flight[]) {
  let domestic = 0, international = 0, unknown = 0;
  for (const f of all) {
    if (!isCounted(f)) continue;
    if (!f.dep?.country || !f.arr?.country) unknown++;
    else if (f.dep.country === f.arr.country) domestic++;
    else international++;
  }
  return { domestic, international, unknown };
}

export function categoryLabelOfType(code: string) {
  return classify(code);
}

export function bodySplit(all: Flight[]): Group[] {
  return groupBy(all, (f) => aircraftType(f.aircraft.typeCode)?.body ?? 'Unclassified');
}
export function engineSplit(all: Flight[]): Group[] {
  return groupBy(all, (f) => aircraftType(f.aircraft.typeCode)?.engine ?? 'Unclassified');
}
export function manufacturerSplit(all: Flight[]): Group[] {
  return groupBy(all, (f) => f.aircraft.manufacturer || aircraftType(f.aircraft.typeCode)?.manufacturer || null);
}

/** Daily counts for a calendar heatmap. */
export function dailyCounts(all: Flight[], dateOf: (f: Flight) => string = (f) => f.date): Map<string, { flights: number; minutes: number; ids: string[] }> {
  const m = new Map<string, { flights: number; minutes: number; ids: string[] }>();
  for (const f of all) {
    if (!isCounted(f)) continue;
    const d = dateOf(f);
    const v = m.get(d) ?? { flights: 0, minutes: 0, ids: [] };
    v.flights++; v.minutes += durationOf(f) ?? 0; v.ids.push(f.id);
    m.set(d, v);
  }
  return m;
}

export function pctChange(a: number, b: number): number | null {
  // change from b (baseline) to a; meaningless when the baseline is zero
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return null;
  return ((a - b) / b) * 100;
}

export function sortByDateDesc(flights: Flight[]): Flight[] {
  return [...flights].sort((a, b) => (b.date + (b.times.offBlock ?? b.times.takeoff ?? '')).localeCompare(a.date + (a.times.offBlock ?? a.times.takeoff ?? '')));
}
