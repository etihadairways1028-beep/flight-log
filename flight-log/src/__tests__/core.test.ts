import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { ingestRows, findAirport, toRef, searchAirports } from '../lib/airports';
import { haversineKm, greatCirclePoints, isOceanCrossing } from '../lib/geo';
import { wallToUtc, utcToWall, minutesBetween, deriveDurations, parseDurationInput, fmtDuration, timingIssues } from '../lib/time';
import { kmTo, toKm, ftTo, toFt, ktTo, toKt, fmtDistance } from '../lib/units';
import { emptyFlight, finalizeFlight, coerceFlight, dupKey } from '../lib/flight';
import { summarize, monthly, groupBy, pctChange, airportVisits, domesticSplit } from '../lib/stats';
import { applyFilters, emptyFilters } from '../lib/filters';
import { flightsToCsv, parseCsv, autoMap, rowsToFlights } from '../lib/csv';
import { evaluateAchievements } from '../lib/achievements';
import { generateDemoFlights } from '../lib/demo';
import { generateInsights } from '../lib/insights';
import { DEFAULT_SETTINGS } from '../store/useStore';
import type { Flight } from '../lib/types';

ingestRows(JSON.parse(readFileSync('public/data/airports.json', 'utf8')));

function mk(dep: string, arr: string, date: string, out: string, off: string, on: string, inn: string, depZone = true): Flight {
  const f = emptyFlight();
  f.date = date;
  f.dep = toRef(findAirport(dep)!);
  f.arr = toRef(findAirport(arr)!);
  const dz = f.dep.tz, az = f.arr.tz;
  const [od, ot] = out.split(' '), [fd, ft] = off.split(' '), [ld, lt] = on.split(' '), [id, it] = inn.split(' ');
  f.times.offBlock = wallToUtc(date, ot, dz, Number(od));
  f.times.takeoff = wallToUtc(date, ft, dz, Number(fd));
  f.times.landing = wallToUtc(date, lt, az, Number(ld));
  f.times.onBlock = wallToUtc(date, it, az, Number(id));
  return finalizeFlight(f);
}

describe('airports', () => {
  it('resolves ICAO and IATA', () => {
    expect(findAirport('OMAA')?.iata).toBe('AUH');
    expect(findAirport('auh')?.ident).toBe('OMAA');
    expect(findAirport('LHR')?.ident).toBe('EGLL');
    expect(findAirport('JFK')?.tz).toBe('America/New_York');
  });
  it('searches by city', () => {
    expect(searchAirports('singapore')[0].ident).toBe('WSSS');
    expect(searchAirports('heathrow')[0].ident).toBe('EGLL');
  });
  it('demo airports all exist', () => {
    const fs = generateDemoFlights();
    expect(fs.length).toBeGreaterThan(60);
    expect(fs.every((f) => f.dep && f.arr && f.distanceKm! > 0)).toBe(true);
  });
});

describe('geo', () => {
  it('haversine AUH–SIN ≈ 5,860 km', () => {
    const a = findAirport('OMAA')!, b = findAirport('WSSS')!;
    expect(haversineKm(a.lat!, a.lon!, b.lat!, b.lon!)).toBeGreaterThan(5800);
    expect(haversineKm(a.lat!, a.lon!, b.lat!, b.lon!)).toBeLessThan(5920);
  });
  it('LHR–JFK ≈ 5,540 km', () => {
    const a = findAirport('EGLL')!, b = findAirport('KJFK')!;
    const d = haversineKm(a.lat!, a.lon!, b.lat!, b.lon!);
    expect(Math.abs(d - 5540)).toBeLessThan(30);
  });
  it('great circle across the antimeridian is continuous', () => {
    const pts = greatCirclePoints(35.55, 139.78, 21.32, -157.92, 40); // HND–HNL
    for (let i = 1; i < pts.length; i++) expect(Math.abs(pts[i][0] - pts[i - 1][0])).toBeLessThan(20);
    expect(pts[pts.length - 1][0]).toBeGreaterThan(180);
  });
  it('ocean crossing rule', () => {
    expect(isOceanCrossing('NA', 'EU')).toBe(true);
    expect(isOceanCrossing('EU', 'AS')).toBe(false);
    expect(isOceanCrossing('SA', 'NA')).toBe(false);
  });
});

describe('time', () => {
  it('converts airport wall time to UTC', () => {
    expect(wallToUtc('2026-03-14', '02:05', 'Asia/Dubai')).toBe('2026-03-13T22:05:00Z');
    expect(utcToWall('2026-03-13T22:05:00Z', 'Asia/Dubai', '2026-03-14')).toEqual({ time: '02:05', dayOffset: 0 });
    expect(utcToWall('2026-03-13T22:05:00Z', 'UTC', '2026-03-14')).toEqual({ time: '22:05', dayOffset: -1 });
  });
  it('overnight + time zones: AUH 21:50 → SIN 09:10 next day', () => {
    const f = mk('OMAA', 'WSSS', '2026-03-14', '0 21:50', '0 22:10', '1 08:55', '1 09:10');
    expect(f.blockMinutes).toBe(440); // 7h20
    expect(f.flightMinutes).toBe(405); // 6h45
    expect(f.flightMinutesSource).toBe('computed');
    expect(timingIssues(f)).toEqual([]);
  });
  it('westbound date line: SYD → LAX arrives "earlier" local date', () => {
    const f = mk('YSSY', 'KLAX', '2026-01-10', '0 09:45', '0 10:05', '-1 06:20', '-1 06:35');
    // Entering arrival as "previous day" is wrong here: it lands before takeoff, so it must be flagged.
    expect(f.times.takeoff).toBe('2026-01-09T23:05:00Z');
    expect(f.times.landing).toBe('2026-01-09T14:20:00Z');
    expect(f.flightMinutes).toBeNull(); // negative → invalid, flagged
    expect(timingIssues(f).length).toBeGreaterThan(0);
    const g = mk('YSSY', 'KLAX', '2026-01-10', '0 09:45', '0 10:05', '0 06:20', '0 06:35');
    expect(g.flightMinutes).toBe(15 * 60 + 15); // SYD is UTC+11 in January (DST)
  });
  it('DST: Europe/London spring forward', () => {
    expect(minutesBetween(wallToUtc('2026-03-29', '00:30', 'Europe/London'), wallToUtc('2026-03-29', '03:30', 'Europe/London'))).toBe(120);
  });
  it('never infers block time from flight time', () => {
    const f = emptyFlight();
    f.flightMinutes = 90; f.flightMinutesSource = 'manual';
    const d = deriveDurations(f);
    expect(d.flightMinutes).toBe(90);
    expect(d.blockMinutes).toBeNull();
  });
  it('parses durations', () => {
    expect(parseDurationInput('7:25')).toBe(445);
    expect(parseDurationInput('1.5')).toBe(90);
    expect(parseDurationInput('2h 05')).toBe(125);
    expect(parseDurationInput('45m')).toBe(45);
    expect(parseDurationInput('abc')).toBeNull();
    expect(fmtDuration(445)).toBe('7:25');
    expect(fmtDuration(90, 'decimal')).toBe('1.5');
    expect(fmtDuration(null)).toBe('—');
  });
});

describe('units', () => {
  it('round-trips', () => {
    expect(kmTo(1.852, 'nm')).toBeCloseTo(1);
    expect(toKm(1, 'mi')).toBeCloseTo(1.609344);
    expect(ftTo(1000, 'm')).toBeCloseTo(304.8);
    expect(toFt(304.8, 'm')).toBeCloseTo(1000);
    expect(ktTo(100, 'kmh')).toBeCloseTo(185.2);
    expect(toKt(185.2, 'kmh')).toBeCloseTo(100);
    expect(fmtDistance(5859.8, 'nm')).toBe('3,164 NM');
    expect(fmtDistance(null, 'km')).toBe('—');
  });
});

describe('aggregates', () => {
  const a = mk('OMAA', 'WSSS', '2026-03-14', '0 21:50', '0 22:10', '1 08:55', '1 09:10');
  const b = mk('WSSS', 'OMAA', '2026-03-20', '0 18:00', '0 18:20', '0 21:40', '0 21:55');
  const c = { ...mk('EGLL', 'LFPG', '2026-04-02', '0 10:00', '0 10:15', '0 12:20', '0 12:30'), category: 'simulator' as const };
  const planned = { ...mk('OMAA', 'EGLL', '2026-05-01', '0 08:00', '0 08:20', '0 12:30', '0 12:40'), status: 'planned' as const };
  const all = [a, b, c, planned];
  it('summary excludes planned & separates sim', () => {
    const s = summarize(all);
    expect(s.flights).toBe(3);
    expect(s.excluded).toBe(1);
    expect(s.simMinutes).toBe(c.flightMinutes);
    expect(s.realMinutes).toBe(a.flightMinutes! + b.flightMinutes!);
    expect(s.flightMinutes).toBe(s.realMinutes + s.simMinutes);
    expect(s.uniqueAirports).toBe(4);
    expect(s.uniqueRoutes).toBe(2); // AUH–SIN both directions = one pair
    expect(Number.isNaN(s.avgMinutes)).toBe(false);
  });
  it('empty summary is safe', () => {
    const s = summarize([]);
    expect(s.avgMinutes).toBeNull();
    expect(s.medianMinutes).toBeNull();
    expect(monthly([])).toEqual([]);
  });
  it('monthly fills gaps & cumulative', () => {
    const m = monthly(all);
    expect(m.map((x) => x.month)).toEqual(['2026-03', '2026-04']);
    expect(m[1].cumulativeFlights).toBe(3);
  });
  it('visits & domestic split', () => {
    const v = airportVisits(all);
    expect(v.find((x) => x.ident === 'OMAA')).toMatchObject({ departures: 1, arrivals: 1, total: 2 });
    expect(domesticSplit(all)).toEqual({ domestic: 0, international: 3, unknown: 0 });
  });
  it('edit and delete recalc', () => {
    const edited = all.map((f) => (f.id === a.id ? finalizeFlight({ ...f, dep: toRef(findAirport('OMDB')!) }) : f));
    expect(summarize(edited).uniqueAirports).toBe(5);
    expect(summarize(all.filter((f) => f.id !== c.id)).simMinutes).toBe(0);
  });
  it('pct change ignores zero baseline', () => {
    expect(pctChange(5, 0)).toBeNull();
    expect(pctChange(15, 10)).toBe(50);
  });
  it('filters combine', () => {
    expect(applyFilters(all, { ...emptyFilters(), categories: ['simulator'] }).length).toBe(1);
    expect(applyFilters(all, { ...emptyFilters(), q: 'singapore', from: '2026-03-15' }).length).toBe(1);
    expect(applyFilters(all, { ...emptyFilters(), airport: 'OMAA' }).length).toBe(3);
  });
  it('achievements only from data', () => {
    const st = evaluateAchievements(all);
    expect(st.find((x) => x.def.id === 'first-flight')!.unlocked).toBe(true);
    expect(st.find((x) => x.def.id === 'first-flight')!.unlockedOn).toBe('2026-03-14');
    expect(st.find((x) => x.def.id === 'ten-flights')!.unlocked).toBe(false);
    expect(evaluateAchievements([]).every((x) => !x.unlocked)).toBe(true);
  });
  it('insights need data', () => {
    expect(generateInsights([], DEFAULT_SETTINGS)).toEqual([]);
    expect(generateInsights(generateDemoFlights(), DEFAULT_SETTINGS).length).toBeGreaterThan(3);
  });
});

describe('csv & json', () => {
  it('exports and re-imports losslessly for core fields', () => {
    const a = mk('OMAA', 'WSSS', '2026-03-14', '0 21:50', '0 22:10', '1 08:55', '1 09:10');
    a.flightNumber = 'EY 470'; a.aircraft.typeCode = 'B789'; a.tags = ['x', 'y']; a.notes = 'Hello, "world"';
    const csv = flightsToCsv([a]);
    const p = parseCsv(csv);
    const res = rowsToFlights(p.rows, autoMap(p.headers), []);
    expect(res[0].errors).toEqual([]);
    const g = res[0].flight!;
    expect(g.date).toBe(a.date);
    expect(g.times.takeoff).toBe(a.times.takeoff);
    expect(g.times.landing).toBe(a.times.landing);
    expect(g.flightMinutes).toBe(a.flightMinutes);
    expect(g.blockMinutes).toBe(a.blockMinutes);
    expect(g.tags).toEqual(['x', 'y']);
    expect(g.notes).toBe('Hello, "world"');
    // duplicate detection
    expect(rowsToFlights(p.rows, autoMap(p.headers), [a])[0].duplicate).toBe(true);
  });
  it('HH:MM UTC import rolls overnight', () => {
    const p = parseCsv('date,from,to,takeoff,landing\n2026-03-14,AUH,SIN,22:10,04:55\n2026-03-14,XXX,SIN,,');
    const r = rowsToFlights(p.rows, autoMap(p.headers), []);
    expect(r[0].flight!.flightMinutes).toBe(6 * 60 + 45);
    expect(r[1].errors[0]).toMatch(/Unknown departure/);
  });
  it('json coerce validates', () => {
    const a = mk('OMAA', 'WSSS', '2026-03-14', '0 21:50', '0 22:10', '1 08:55', '1 09:10');
    const back = coerceFlight(JSON.parse(JSON.stringify(a))).flight!;
    expect(back.flightMinutes).toBe(a.flightMinutes);
    expect(dupKey(back)).toBe(dupKey(a));
    expect(coerceFlight({ date: 'nope' }).error).toBeTruthy();
  });
});

import { parseBcbp, parseFreeText, julianToDate } from '../lib/quickparse';
import { ingestAirlines } from '../lib/airlines';
import { DateTime as DT } from 'luxon';
ingestAirlines(JSON.parse(readFileSync('public/data/airlines.json', 'utf8')));

describe('quick entry', () => {
  it('parses an IATA boarding pass', () => {
    const bp = 'M1DOE/JANE            EABC123 AUHSINEY 0470 073Y032A0001 100';
    const r = parseBcbp(bp)[0];
    expect(r.dep?.ident).toBe('OMAA');
    expect(r.arr?.ident).toBe('WSSS');
    expect(r.flightNumber).toBe('EY 470');
    expect(r.airline).toMatch(/Etihad/);
    expect(r.seat).toBe('32A');
    expect(DT.fromISO(r.date!).ordinal).toBe(73);
  });
  it('julian date picks a nearby year', () => {
    const today = DT.fromISO('2026-01-05');
    expect(julianToDate(360, today)).toBe('2025-12-26');
    expect(julianToDate(10, today)).toBe('2026-01-10');
  });
  it('parses free text booking details', () => {
    const r = parseFreeText('Your flight EY 470 from Abu Dhabi (AUH) to Singapore (SIN) on 14 Mar 2026, departs 22:10 arrives 08:55 +1. Boeing 787-9, seat 32A');
    expect(r.dep?.iata).toBe('AUH');
    expect(r.arr?.iata).toBe('SIN');
    expect(r.flightNumber).toBe('EY 470');
    expect(r.date).toBe('2026-03-14');
    expect(r.depTime).toBe('22:10');
    expect(r.arrTime).toBe('08:55');
    expect(r.arrDayOffset).toBe(1);
    expect(r.typeCode).toBe('B789');
    expect(r.seat).toBe('32A');
  });
  it('parses compact notation', () => {
    const r = parseFreeText('BA117 LHR-JFK 2026-04-01 10:30 13:20 B77W G-STBA');
    expect(r.dep?.ident).toBe('EGLL');
    expect(r.flightNumber).toBe('BA 117');
    expect(r.typeCode).toBe('B77W');
    expect(r.registration).toBe('G-STBA');
  });
});
