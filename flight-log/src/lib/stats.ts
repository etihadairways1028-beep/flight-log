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

/** Best guess at when a flight happened, for ordering flights on the same day. */
export function flightMoment(f: Flight): number | null {
  for (const v of [f.times.offBlock, f.times.takeoff, f.times.landing, f.times.onBlock, f.times.schedOut]) {
    if (!v) continue;
    const t = Date.parse(v);
    if (!Number.isNaN(t)) return t;
  }
  return null;
}
/** Newest first: by date, then by actual time when both are known, then by when the entry was saved. */
export function sortByDateDesc(flights: Flight[]): Flight[] {
  return [...flights].sort((a, b) => {
    const d = b.date.localeCompare(a.date);
    if (d) return d;
    const ta = flightMoment(a), tb = flightMoment(b);
    if (ta != null && tb != null && ta !== tb) return tb - ta;
    return (b.createdAt ?? '').localeCompare(a.createdAt ?? '');
  });
}

// ─── Logbook check: entries that look like the same flight twice ────────────
export interface DupGroup { key: string; flights: Flight[] }
const dayNum = (d: string) => Math.round(Date.parse(d + 'T00:00:00Z') / 86400000);
/** Counted flights with the same departure and arrival within a day of each other. */
export function findDuplicates(all: Flight[]): DupGroup[] {
  const byRoute = new Map<string, Flight[]>();
  for (const f of all) {
    if (!isCounted(f) || !f.dep?.ident || !f.arr?.ident || !f.date) continue;
    const k = `${f.dep.ident}>${f.arr.ident}`;
    byRoute.set(k, [...(byRoute.get(k) ?? []), f]);
  }
  const out: DupGroup[] = [];
  for (const [k, fs] of byRoute) {
    if (fs.length < 2) continue;
    const sorted = [...fs].sort((a, b) => a.date.localeCompare(b.date));
    let cur: Flight[] = [sorted[0]];
    const flush = () => { if (cur.length > 1) out.push({ key: `${k}@${cur.map((x) => x.id).sort().join(',')}`, flights: sortByDateDesc(cur) }); };
    for (const f of sorted.slice(1)) {
      const prev = cur[cur.length - 1];
      const ta = flightMoment(prev), tb = flightMoment(f);
      // same day (±1 for time zones); if both have real times they must also be within 6 hours
      const near = Math.abs(dayNum(f.date) - dayNum(prev.date)) <= 1 && (ta == null || tb == null || Math.abs(ta - tb) < 6 * 3600e3);
      if (near) cur.push(f); else { flush(); cur = [f]; }
    }
    flush();
  }
  return out;
}

// ─── Month comparison ────────────────────────────────────────────────────────
export interface MonthCompare { month: string; prev: string; cur: MonthPoint; last: MonthPoint; avg: { flights: number; minutes: number; distanceKm: number }; best: MonthPoint | null; months: MonthPoint[] }
/** This month against last month and the average of the 12 months before it. */
export function compareMonths(all: Flight[], now: DT = DT.local()): MonthCompare {
  const to = now.toFormat('yyyy-MM'), from = now.minus({ months: 12 }).toFormat('yyyy-MM');
  const months = monthly(all, from, to);
  const cur = months[months.length - 1], last = months[months.length - 2];
  const hist = months.slice(0, -1).filter((m) => m.flights > 0);
  const n = Math.max(1, hist.length);
  const avg = { flights: hist.reduce((a, m) => a + m.flights, 0) / n, minutes: hist.reduce((a, m) => a + m.minutes, 0) / n, distanceKm: hist.reduce((a, m) => a + m.distanceKm, 0) / n };
  const best = [...months].sort((a, b) => b.minutes - a.minutes)[0];
  return { month: to, prev: last.month, cur, last, avg, best: best && best.minutes > 0 ? best : null, months };
}

// ─── Goals and streaks ──────────────────────────────────────────────────────
import type { Goals } from './types';
import { DateTime as DT } from 'luxon';

export interface StreakRun { current: number; best: number; atRisk: boolean; activeNow: boolean }
export interface Streaks { days: StreakRun; weeks: StreakRun; months: StreakRun; lastDate: string | null }

/** Longest and current run of consecutive integers in a set (days, ISO weeks or months as numbers). */
function runs(nums: Set<number>, nowIdx: number): StreakRun {
  const sorted = [...nums].filter((n) => n <= nowIdx).sort((a, b) => a - b);
  let best = 0, len = 0, prev = NaN;
  for (const n of sorted) { len = n === prev + 1 ? len + 1 : 1; prev = n; best = Math.max(best, len); }
  const activeNow = nums.has(nowIdx);
  // a run is still alive if it reaches this period, or the one before (you still have time to extend it)
  let cur = 0, k = activeNow ? nowIdx : nowIdx - 1;
  while (nums.has(k)) { cur++; k--; }
  return { current: cur, best: Math.max(best, cur), atRisk: !activeNow && cur > 0, activeNow };
}

/**
 * Flying streaks by day, ISO week (Monday start) and calendar month, from the local departure
 * date of every counted flight. Flights dated after today never extend a streak.
 */
export function streaks(all: Flight[], now: DT = DT.local()): Streaks {
  const today = now.toISODate()!;
  const dates = [...new Set(all.filter((f) => isCounted(f) && /^\d{4}-\d{2}-\d{2}$/.test(f.date) && f.date <= today).map((f) => f.date))];
  const dayIdx = (iso: string) => Math.round(Date.parse(iso + 'T00:00:00Z') / 86400000);
  // 1970-01-05 was a Monday: day index 4
  const weekIdx = (d: number) => Math.floor((d - 4) / 7);
  const monthIdx = (iso: string) => Number(iso.slice(0, 4)) * 12 + Number(iso.slice(5, 7)) - 1;
  const days = new Set(dates.map(dayIdx));
  const t = dayIdx(today);
  return {
    days: runs(days, t),
    weeks: runs(new Set([...days].map(weekIdx)), weekIdx(t)),
    months: runs(new Set(dates.map(monthIdx)), monthIdx(today)),
    lastDate: dates.sort().pop() ?? null,
  };
}

export interface GoalProgress { key: keyof Goals; label: string; target: number; value: number; unit: 'flights' | 'hours' | 'airports'; pace: number | null }

/** Progress toward each goal that is set, with the value you'd reach at the current pace. */
export function goalProgress(all: Flight[], goals: Goals, now: DT = DT.local()): GoalProgress[] {
  const fs = all.filter((f) => f.status === 'completed' || f.status === 'diverted');
  const y = String(now.year), m = now.toFormat('yyyy-MM');
  const year = fs.filter((f) => f.date.startsWith(y)), month = fs.filter((f) => f.date.startsWith(m));
  const before = new Set(fs.filter((f) => f.date < `${y}-01-01`).flatMap((f) => [f.dep?.ident, f.arr?.ident]).filter(Boolean));
  const newAp = new Set(year.flatMap((f) => [f.dep?.ident, f.arr?.ident]).filter((a): a is string => !!a && !before.has(a)));
  const yFrac = Math.max(0.02, now.diff(now.startOf('year'), 'days').days / (now.endOf('year').diff(now.startOf('year'), 'days').days || 365));
  const mFrac = Math.max(0.03, (now.day - 1 + now.hour / 24) / now.daysInMonth!);
  const out: GoalProgress[] = [];
  const push = (key: keyof Goals, label: string, value: number, unit: GoalProgress['unit'], frac: number) => { const t = goals[key]; if (t) out.push({ key, label, target: t, value, unit, pace: value / frac }); };
  push('yearFlights', `Flights in ${y}`, year.length, 'flights', yFrac);
  push('yearHours', `Hours in ${y}`, year.reduce((a, f) => a + (f.flightMinutes ?? 0), 0) / 60, 'hours', yFrac);
  push('monthFlights', `Flights in ${now.toFormat('LLLL')}`, month.length, 'flights', mFrac);
  push('yearNewAirports', `New airports in ${y}`, newAp.size, 'airports', yFrac);
  return out;
}

// ─── Post-flight debrief ────────────────────────────────────────────────────
import { countryName } from './airports';
import { landingRating } from './recorder';
import { DateTime } from 'luxon';
export interface Debrief {
  number: number;                       // nth counted flight
  firsts: { label: string; detail: string }[];
  records: { label: string; detail: string }[];
  plan: { label: string; planned: string; actual: string; diff: string | null; tone: 'good' | 'ok' | 'warn' }[];
  landing: { fpm: number; label: string; tone: string; rank: string | null } | null;
  month: { label: string; flights: number; minutes: number; lastLabel: string; lastFlights: number; lastMinutes: number; avgMinutes: number };
  goals: GoalProgress[];
}

const signed = (n: number, unit: string) => `${n > 0 ? '+' : n < 0 ? '−' : '±'}${Math.abs(Math.round(n))} ${unit}`;

/** Everything worth telling the pilot right after a flight, from their own records only. */
export function buildDebrief(f: Flight, all: Flight[], goals: Goals, now: DateTime = DateTime.local()): Debrief {
  const counted = sortByDateDesc(all.filter(isCounted));
  const idx = counted.findIndex((x) => x.id === f.id);
  const before = idx >= 0 ? counted.slice(idx + 1) : counted.filter((x) => x.id !== f.id && x.date <= f.date);
  const number = before.length + 1;
  const firsts: Debrief['firsts'] = [];
  const records: Debrief['records'] = [];
  if (before.length) {
    const aps = new Set(before.flatMap((x) => [x.dep?.ident, x.arr?.ident]));
    const ctry = new Set(before.flatMap((x) => [x.dep?.country, x.arr?.country]));
    for (const a of [f.dep, f.arr]) if (a && !aps.has(a.ident)) { firsts.push({ label: 'New airport', detail: `${a.iata || a.ident} · ${a.city || a.name}` }); aps.add(a.ident); }
    for (const a of [f.dep, f.arr]) if (a?.country && !ctry.has(a.country)) { firsts.push({ label: 'New country', detail: countryName(a.country) || a.country }); ctry.add(a.country); }
    const tk = typeKey(f);
    if (tk && tk !== 'UNKNOWN' && !before.some((x) => typeKey(x) === tk)) firsts.push({ label: 'New aircraft type', detail: tk });
    const rk = routeKey(f);
    if (rk && !before.some((x) => routeKey(x) === rk)) firsts.push({ label: 'New route', detail: rk });
    const d = durationOf(f);
    const longest = Math.max(0, ...before.map((x) => durationOf(x) ?? 0));
    if (d && d > longest) records.push({ label: 'Longest flight yet', detail: `${Math.round((d - longest))} min longer than your previous best` });
    const km = f.distanceKm ?? 0, far = Math.max(0, ...before.map((x) => x.distanceKm ?? 0));
    if (km && km > far && far > 0) records.push({ label: 'Furthest flight yet', detail: `${Math.round(km).toLocaleString('en-GB')} km` });
  } else firsts.push({ label: 'First flight in your logbook', detail: 'Everything starts here.' });

  // plan vs actual
  const plan: Debrief['plan'] = [];
  const fp = f.flightPlan;
  const dur = f.flightMinutes;
  if (fp?.plannedEteMin && dur) {
    const diff = dur - fp.plannedEteMin;
    plan.push({ label: 'Flight time', planned: hm(fp.plannedEteMin), actual: hm(dur), diff: signed(diff, 'min'), tone: Math.abs(diff) <= 10 ? 'good' : Math.abs(diff) <= 25 ? 'ok' : 'warn' });
  }
  if (fp?.routeDistanceNm && f.recordedDistanceKm) {
    const flown = f.recordedDistanceKm / 1.852, diff = flown - fp.routeDistanceNm;
    plan.push({ label: 'Distance', planned: `${Math.round(fp.routeDistanceNm)} nm`, actual: `${Math.round(flown)} nm`, diff: signed(diff, 'nm'), tone: Math.abs(diff) / fp.routeDistanceNm < 0.05 ? 'good' : Math.abs(diff) / fp.routeDistanceNm < 0.12 ? 'ok' : 'warn' });
  }
  const planFl = fp?.cruiseFl ? Number(String(fp.cruiseFl).replace(/\D/g, '')) : (fp?.initialAltFt ? fp.initialAltFt / 100 : 0);
  if (planFl && f.cruiseAltitudeFt) {
    const act = Math.round(f.cruiseAltitudeFt / 100), diff = (act - planFl) * 100;
    plan.push({ label: 'Cruise level', planned: `FL${String(planFl).padStart(3, '0')}`, actual: `FL${String(act).padStart(3, '0')}`, diff: signed(diff, 'ft'), tone: Math.abs(diff) <= 1000 ? 'good' : 'ok' });
  }
  const sched = (a: string | null, b: string | null) => (a && b ? Math.round((Date.parse(b) - Date.parse(a)) / 60000) : null);
  const dd = sched(f.times.schedOut, f.times.offBlock), ad = sched(f.times.schedIn, f.times.onBlock);
  if (dd != null) plan.push({ label: 'Departure', planned: 'Scheduled', actual: dd <= 0 ? 'On time' : `${dd} min late`, diff: signed(dd, 'min'), tone: dd <= 5 ? 'good' : dd <= 20 ? 'ok' : 'warn' });
  if (ad != null) plan.push({ label: 'Arrival', planned: 'Scheduled', actual: ad <= 0 ? `${-ad} min early` : `${ad} min late`, diff: signed(ad, 'min'), tone: ad <= 5 ? 'good' : ad <= 20 ? 'ok' : 'warn' });

  // landing
  let landing: Debrief['landing'] = null;
  if (f.landingRateFpm != null) {
    const r = landingRating(f.landingRateFpm)!;
    const others = before.map((x) => x.landingRateFpm).filter((v): v is number => v != null).map(Math.abs);
    const better = others.filter((v) => v < Math.abs(f.landingRateFpm!)).length;
    const rank = others.length ? (better === 0 ? 'Your softest landing on record' : `Softer than ${others.length - better} of your ${others.length} other recorded landings`) : null;
    landing = { fpm: Math.round(f.landingRateFpm), label: r.label, tone: r.tone, rank };
  }

  const mc = compareMonths(all, DateTime.fromISO(f.date).isValid && f.date.slice(0, 7) !== now.toFormat('yyyy-MM') ? DateTime.fromISO(f.date) : now);
  const month = { label: DateTime.fromISO(mc.month + '-01').toFormat('LLLL'), flights: mc.cur.flights, minutes: mc.cur.minutes, lastLabel: DateTime.fromISO(mc.prev + '-01').toFormat('LLLL'), lastFlights: mc.last.flights, lastMinutes: mc.last.minutes, avgMinutes: mc.avg.minutes };
  return { number, firsts, records, plan, landing, month, goals: goalProgress(all, goals, now) };
}

function hm(m: number) { const h = Math.floor(m / 60), mm = Math.round(m % 60); return `${h}h ${String(mm).padStart(2, '0')}m`; }
