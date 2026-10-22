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

import { sunAltitude, estimateNightMinutes, computeRecency } from '../lib/pilot';
describe('pilot', () => {
  it('sun altitude is plausible', () => {
    // Abu Dhabi, equinox local noon (≈08:20Z) → high sun; local midnight → well below horizon
    expect(sunAltitude(new Date('2026-03-20T08:20:00Z'), 24.45, 54.65)).toBeGreaterThan(60);
    expect(sunAltitude(new Date('2026-03-20T20:20:00Z'), 24.45, 54.65)).toBeLessThan(-30);
  });
  it('overnight AUH→SIN is mostly night', () => {
    const f = mk('OMAA', 'WSSS', '2026-03-14', '0 21:50', '0 22:10', '1 08:55', '1 09:10');
    const n = estimateNightMinutes(f)!;
    expect(n).toBeGreaterThan(240);
    expect(n).toBeLessThanOrEqual(f.flightMinutes!);
  });
  it('recency counts 3 landings in 90 days', () => {
    const today = DT.fromISO('2026-10-20');
    const a = { ...mk('OMAA', 'OMDB', '2026-10-01', '0 10:00', '0 10:10', '0 10:40', '0 10:50'), takeoffsDay: 2, landingsDay: 2 };
    const b = { ...mk('OMDB', 'OMAA', '2026-09-15', '0 10:00', '0 10:10', '0 10:40', '0 10:50'), takeoffsDay: 1, landingsDay: 1 };
    const r = computeRecency([a, b], today)[0];
    expect(r.met).toBe(true);
    expect(r.validUntil).toBe('2026-12-14');
    expect(computeRecency([a], today)[0].met).toBe(false);
  });
});

import { parseOfp } from '../lib/simbrief';
import { plannedPath } from '../lib/flight';
describe('simbrief OFP', () => {
  const ofp = {
    params: { request_id: '123', units: 'kgs', airac: '2610', time_generated: '1773500000' },
    general: { icao_airline: 'TST', flight_number: '101', route: 'DCT TESTA UL123 TESTB DCT', route_distance: '2830', air_distance: '2950', costindex: '30', initial_altitude: '37000', avg_wind_comp: '-25' },
    origin: { icao_code: 'OMAA' }, destination: { icao_code: 'WSSS' }, alternate: { icao_code: 'WMKK' },
    aircraft: { icaocode: 'B789', reg: 'TEST1' }, atc: { callsign: 'TST101' },
    times: { sched_out: '1773521400', sched_off: '1773522600', sched_on: '1773546900', sched_in: '1773547800', est_time_enroute: '24300' },
    fuel: { plan_ramp: '42000', plan_takeoff: '41700', est_burn: '33800', reserve: '2900', alternate_burn: '1800', contingency: '1700', plan_landing: '7900' },
    files: { directory: 'https://www.simbrief.com/ofp/flightplans/', pdf: { link: 'OMAAWSSS_PDF_1.pdf' } },
    navlog: { fix: [
      { ident: 'TESTA', type: 'wpt', pos_lat: '23.10', pos_long: '58.20', altitude_feet: '24000', via_airway: 'DCT', stage: 'CLB', time_total: '1200' },
      { ident: 'TOC', type: 'ltlg', pos_lat: '22.50', pos_long: '60.00', altitude_feet: '37000', via_airway: 'UL123', stage: 'CRZ', time_total: '1800' },
      { ident: 'TESTB', type: 'vor', pos_lat: '10.00', pos_long: '85.00', altitude_feet: '37000', via_airway: 'UL123', stage: 'CRZ', time_total: '14000' },
      { ident: 'WSSS', type: 'apt', pos_lat: '1.35', pos_long: '103.99', altitude_feet: '22', via_airway: 'DCT', stage: 'DSC', time_total: '24300' },
    ] },
  };
  it('keeps the whole flight plan', () => {
    const f = parseOfp(ofp, { asFlown: true });
    expect(f.dep?.ident).toBe('OMAA');
    expect(f.flightPlan?.fixes.length).toBe(4);
    expect(f.flightPlan?.alternate).toBe('WMKK');
    expect(f.flightPlan?.routeDistanceNm).toBe(2830);
    expect(f.flightPlan?.fuel.trip).toBe(33800);
    expect(f.flightPlan?.ofpUrl).toBe('https://www.simbrief.com/ofp/flightplans/OMAAWSSS_PDF_1.pdf');
    expect(f.flightPlan?.avgWind).toBe('Headwind 25 kt');
    expect(f.status).toBe('completed');
    expect(f.flightMinutes).toBe(405);
    const p = plannedPath(f)!;
    expect(p[0]).toEqual([f.dep!.lon, f.dep!.lat]);
    expect(p.length).toBe(5); // dep + 3 fixes (destination fix dropped) + arr
  });
  it('survives a JSON backup round trip', () => {
    const f = parseOfp(ofp);
    expect(coerceFlight(JSON.parse(JSON.stringify(f))).flight!.flightPlan!.fixes.length).toBe(4);
  });
});

import { fullRouteString, procedures } from '../lib/simbrief';
describe('full route', () => {
  const fx = (ident: string, airway: string, sid = false) => ({ ident, name: '', type: 'wpt', lat: 0, lon: 0, altFt: null, airway, stage: '', elapsedMin: null, isSidStar: sid });
  const fixes = [fx('RW31R', 'BUBI1A', true), fx('BUBIN', 'BUBI1A', true), fx('KAPAX', 'UL425'), fx('PURNI', 'UL425'), fx('TOTAL', 'DCT'), fx('ELALO', 'DCT'), fx('BIKTA', 'KITO1B', true), fx('KITOR', 'KITO1B', true)];
  it('reconstructs SID, airways, DCT legs and STAR', () => {
    expect(procedures(fixes as any)).toEqual({ sid: 'BUBI1A', star: 'KITO1B' });
    expect(fullRouteString('OMAA', 'WSSS', '31R', '20C', fixes as any)).toBe('OMAA/31R BUBI1A BUBIN UL425 PURNI DCT TOTAL DCT ELALO KITO1B KITOR WSSS/20C');
  });
});

import { toMsfsPln, toXplaneFms } from '../lib/planExport';
describe('plan export', () => {
  it('writes MSFS .pln and X-Plane .fms', () => {
    const f = parseOfp({
      params: { airac: '2610', units: 'kgs' }, general: { route: 'BUBI1A BUBIN UL425 PURNI', initial_altitude: '37000' },
      origin: { icao_code: 'OMAA', plan_rwy: '31R', elevation: '88' }, destination: { icao_code: 'WSSS', plan_rwy: '20C', elevation: '22' }, aircraft: { icaocode: 'B789' },
      navlog: { fix: [
        { ident: 'BUBIN', type: 'wpt', pos_lat: '24.9', pos_long: '55.3', via_airway: 'BUBI1A', is_sid_star: '1', icao_region: 'OM', altitude_feet: '9000', distance: '20' },
        { ident: 'PURNI', type: 'wpt', pos_lat: '22.0', pos_long: '62.0', via_airway: 'UL425', is_sid_star: '0', icao_region: 'OO', altitude_feet: '37000', distance: '400' },
        { ident: 'VTK', type: 'vor', frequency: '113.500', pos_lat: '3.0', pos_long: '101.0', via_airway: 'DCT', is_sid_star: '0', altitude_feet: '37000', distance: '2000' },
        { ident: 'KITOR', type: 'wpt', pos_lat: '1.8', pos_long: '103.5', via_airway: 'KITO1B', is_sid_star: '1', altitude_feet: '6000', distance: '150' },
      ] },
    });
    expect(f.flightPlan!.sid).toBe('BUBI1A');
    expect(f.flightPlan!.star).toBe('KITO1B');
    expect(f.flightPlan!.fixes[3].cumNm).toBe(2570);
    expect(f.flightPlan!.fullRoute).toBe('OMAA/31R BUBI1A BUBIN UL425 PURNI DCT VTK KITO1B KITOR WSSS/20C');
    const pln = toMsfsPln(f);
    expect(pln).toContain('<DepartureID>OMAA</DepartureID>');
    expect(pln).toContain('<DepartureFP>BUBI1A</DepartureFP>');
    expect(pln).toContain('<RunwayNumberFP>31</RunwayNumberFP>');
    expect(pln).toContain('<ATCAirway>UL425</ATCAirway>');
    expect(pln).toContain('<ArrivalFP>KITO1B</ArrivalFP>');
    expect(pln).toContain('<ICAORegion>OM</ICAORegion>');
    expect(pln).toMatch(/<DepartureLLA>N24° 26' \d/);
    const fms = toXplaneFms(f);
    expect(fms.split('\n').slice(0, 2)).toEqual(['I', '1100 Version']);
    expect(fms).toContain('SID BUBI1A');
    expect(fms).toContain('DEPRWY RW31R');
    expect(fms).toContain('STAR KITO1B');
    expect(fms).toContain('NUMENR 4');
    expect(fms).toContain('11 PURNI UL425 37000.000000 22.000000 62.000000');
    expect(fms).toContain('3 VTK DRCT');
  });
});

import { newRecording, step, recordingToFlight, landingRating } from '../lib/recorder';
describe('flight recorder', () => {
  it('detects off-block, takeoff, landing, on-block and landing rate', () => {
    const A = findAirport('OMAA')!, D = findAirport('OMDB')!;
    let st = newRecording();
    let t = 1773500000;
    const S = (o: any) => ({ t, lat: A.lat!, lon: A.lon!, altFt: 88, aglFt: 0, gsKt: 0, iasKt: 0, hdg: 310, vsFpm: 0, onGround: true, parkingBrake: true, engines: 2, paused: false, ...o });
    st = step(st, S({}));
    expect(st.phase).toBe('preflight');
    t += 60; st = step(st, S({ gsKt: 12, parkingBrake: false }));
    expect(st.phase).toBe('taxi-out'); expect(st.offBlock).toBe(t);
    t += 600; st = step(st, S({ gsKt: 150, onGround: false, altFt: 400, vsFpm: 2000 }));
    expect(st.phase).toBe('airborne'); expect(st.takeoff).toBe(t);
    // fly towards Dubai in 10 steps
    for (let i = 1; i <= 10; i++) { t += 120; st = step(st, S({ lat: A.lat! + (D.lat! - A.lat!) * i / 10, lon: A.lon! + (D.lon! - A.lon!) * i / 10, gsKt: 280, onGround: false, altFt: i < 9 ? 15000 : 1500, vsFpm: i < 9 ? 0 : -700 })); }
    t += 2; st = step(st, S({ lat: D.lat!, lon: D.lon!, gsKt: 140, onGround: false, altFt: 70, vsFpm: -180 }));
    t += 1; st = step(st, S({ lat: D.lat!, lon: D.lon!, gsKt: 135, onGround: true, altFt: 62, vsFpm: -150 }));
    expect(st.phase).toBe('taxi-in'); expect(st.landingVs).toBe(-180);
    t += 300; st = step(st, S({ lat: D.lat!, lon: D.lon!, gsKt: 0, parkingBrake: true }));
    t += 6; st = step(st, S({ lat: D.lat!, lon: D.lon!, gsKt: 0, parkingBrake: true }));
    expect(st.phase).toBe('arrived');
    const f = recordingToFlight({ ...st, sim: 'X-Plane 12', aircraft: 'B738' }, DEFAULT_SETTINGS);
    expect(f.dep?.ident).toBe('OMAA');
    expect(f.arr?.ident).toBe('OMDB');
    expect(f.flightMinutes).toBe(Math.round((st.landing! - st.takeoff!) / 60));
    expect(f.blockMinutes).toBe(Math.round((st.onBlock! - st.offBlock!) / 60));
    expect(f.recordedDistanceKm).toBeGreaterThan(100);
    expect(f.landingRateFpm).toBe(-180);
    expect(f.aircraft.typeCode).toBe('B738');
    expect(f.simulator).toBe('X-Plane 12');
    expect((f.landingsDay ?? 0) + (f.landingsNight ?? 0)).toBe(1);
    expect(landingRating(-180)?.label).toBe('Smooth');
  });
});

import { normalizeStoredFlight, normalizePlan } from '../lib/flight';
import { toKml, toGpx } from '../lib/planExport';
describe('robustness', () => {
  it('SimBrief empty elements ({}) never leak into the flight', () => {
    const f = parseOfp({ general: { icao_airline: {}, flight_number: '470', route: {} }, atc: { callsign: {} }, origin: { icao_code: 'OMAA', metar: {}, plan_rwy: {} }, destination: { icao_code: 'WSSS', taf: {} }, aircraft: { icaocode: 'B789', reg: {} }, navlog: { fix: [] } });
    expect(f.flightNumber).toBe('470');
    expect(f.callsign).toBe('');
    expect(f.aircraft.registration).toBe('');
    expect(JSON.stringify(f)).not.toContain('[object Object]');
  });
  it('repairs records from older versions', () => {
    const f = normalizeStoredFlight({ id: 'x', date: '2025-01-01', dep: null, arr: null, aircraft: null, times: null, tags: null, callsign: {}, flightPlan: { fixes: [{ ident: 'A', lat: '1', lon: '2' }, { ident: 'bad' }] } })!;
    expect(f.id).toBe('x');
    expect(f.times.offBlock).toBeNull();
    expect(f.tags).toEqual([]);
    expect(f.callsign).toBe('');
    expect(f.flightPlan!.fixes).toHaveLength(1);
    expect(f.flightPlan!.fuel.trip).toBeNull();
    expect(normalizeStoredFlight({ id: 'y', date: 'bad' })!.id).toBe('y');
    expect(normalizePlan(null)).toBeUndefined();
  });
  it('exports KML and GPX', () => {
    const f = parseOfp({ origin: { icao_code: 'OMAA' }, destination: { icao_code: 'WSSS' }, aircraft: { icaocode: 'B789' }, navlog: { fix: [] } });
    const kml = toKml([f]);
    expect(kml).toContain('<kml');
    expect(kml).toContain('<LineString>');
    expect(kml).toContain('>AUH<');
    expect(toGpx([f])).toContain('<trkpt lat="24.4');
  });
});

import { streaks, goalProgress } from '../lib/stats';
import { DateTime as LDT } from 'luxon';
describe('goals and streaks', () => {
  const mk = (date: string) => ({ ...emptyFlight(), date, status: 'completed', flightMinutes: 60 } as any);
  it('counts day, week and month streaks', () => {
    const now = LDT.fromISO('2026-10-21');
    const s = streaks([mk('2026-08-03'), mk('2026-09-10'), mk('2026-10-02'), mk('2026-03-01'), mk('2026-04-01'), mk('2026-05-01'), mk('2026-06-01')], now);
    expect(s.months.current).toBe(3);
    expect(s.months.best).toBe(4);
    expect(s.months.atRisk).toBe(false);
    const s2 = streaks([mk('2026-08-03'), mk('2026-09-10')], now);
    expect(s2.months.current).toBe(2);
    expect(s2.months.atRisk).toBe(true);
    // 2026-10-19 is a Monday: weeks of 19th, 12th and 5th
    expect(streaks([mk('2026-10-19'), mk('2026-10-14'), mk('2026-10-06')], now).weeks.current).toBe(3);
    // Sunday 18th and Monday 19th are different ISO weeks
    expect(streaks([mk('2026-10-18'), mk('2026-10-19')], now).weeks.current).toBe(2);
    const d = streaks([mk('2026-10-21'), mk('2026-10-20'), mk('2026-10-19'), mk('2026-10-17'), mk('2026-10-16')], now);
    expect(d.days.current).toBe(3); expect(d.days.best).toBe(3); expect(d.days.atRisk).toBe(false);
    const y = streaks([mk('2026-10-20'), mk('2026-10-19')], now);
    expect(y.days.current).toBe(2); expect(y.days.atRisk).toBe(true);
    // duplicates on one day count once; future-dated and planned flights never count
    const dup = streaks([mk('2026-10-21'), mk('2026-10-21'), mk('2026-10-22'), { ...mk('2026-10-20'), status: 'planned' }], now);
    expect(dup.days.current).toBe(1);
    expect(streaks([mk('2026-10-25')], now).days.current).toBe(0);
    expect(streaks([], now).months.current).toBe(0);
  });
  it('measures goal progress', () => {
    const now = LDT.fromISO('2026-10-21');
    const g = goalProgress([mk('2026-01-05'), mk('2026-10-01'), mk('2025-05-05')], { yearFlights: 10, yearHours: 5, monthFlights: null, yearNewAirports: null }, now);
    expect(g).toHaveLength(2);
    expect(g[0].value).toBe(2);
    expect(g[1].value).toBe(2);
  });
});

import { parseVatsimPilot, parseIvaoPilot, findPilot } from '../lib/network';
import { cleanProfile, encodeProfile, decodeProfile } from '../pages/Friends';
describe('online networks', () => {
  it('parses VATSIM and IVAO pilots', () => {
    const v = findPilot('vatsim', { pilots: [{ cid: 1234567, callsign: 'ETD123', name: 'A B', latitude: 24.4, longitude: 54.6, altitude: 37012, groundspeed: 480, heading: 95, transponder: '2200', last_updated: '2026-10-21T04:00:00Z',
      flight_plan: { departure: 'omaa', arrival: 'WSSS', aircraft_short: 'B789', route: 'BUBIN UL425 PURNI', altitude: '37000', flight_rules: 'I' } }] }, '1234567')!;
    expect(v.callsign).toBe('ETD123');
    expect(v.dep).toBe('OMAA');
    expect(v.cruise).toBe('FL370');
    expect(v.aircraft).toBe('B789');
    const i = parseIvaoPilot({ userId: 654321, callsign: 'IVA1', lastTrack: { latitude: 51.4, longitude: -0.4, altitude: 1200, groundSpeed: 160, heading: 270, timestamp: '2026-10-21T04:00:00Z' }, flightPlan: { departureId: 'EGLL', arrivalId: 'LFPG', level: 'F350', aircraft: { icaoCode: 'A320' } } })!;
    expect(i.arr).toBe('LFPG');
    expect(i.cruise).toBe('FL350');
    expect(i.aircraft).toBe('A320');
    expect(parseVatsimPilot({})).toBeNull();
    expect(findPilot('vatsim', { pilots: [] }, '1')).toBeNull();
  });
});
describe('public profiles', () => {
  const p = { v: 1, name: 'Ana', handle: 'ana', bio: '<b>hi</b>', home: 'OMAA', updated: '2026-10-21', totals: { flights: 3, minutes: 600, km: 9000, airports: 3, countries: 2, types: 2, realFlights: 2, simFlights: 1 }, routes: [['OMAA', 'EGLL', 2], ['bad id!', 'X', 1]], topTypes: [['A388', 2]], topAirports: [['OMAA', 3]], firstDate: '2024-01-01', lastDate: '2026-10-01', badges: 4 };
  it('validates untrusted profiles', () => {
    const c = cleanProfile(p)!;
    expect(c.routes).toHaveLength(1);
    expect(cleanProfile({ v: 2 })).toBeNull();
    expect(cleanProfile({ ...p, totals: { flights: -5 } })!.totals.flights).toBe(0);
  });
  it('round-trips a share code', async () => {
    const code = await encodeProfile(cleanProfile(p)!);
    expect(code.length).toBeLessThan(600);
    expect((await decodeProfile(code))!.name).toBe('Ana');
    expect(await decodeProfile('zgarbage')).toBeNull();
  });
});

import { parseRouteString, parseRouteFile, parseLatLon, routeToPlan } from '../lib/planExport';
describe('route import', () => {
  it('reads coordinates in common formats', () => {
    expect(parseLatLon('2530N05500E')).toEqual({ lat: 25.5, lon: 55 });
    expect(parseLatLon('25N060E')).toEqual({ lat: 25, lon: 60 });
    expect(parseLatLon('N25E055')).toEqual({ lat: 25, lon: 55 });
    expect(parseLatLon('S3330W07000')!.lat).toBeCloseTo(-33.5);
    expect(parseLatLon('BUBIN')).toBeNull();
  });
  it('parses a typed route', () => {
    const r = parseRouteString('OMAA/31R BUBI1A BUBIN UL425 25N060E N0480F370 DCT 20N070E KITO1B WSSS/20C');
    expect(r.depIdent).toBe('OMAA'); expect(r.depRwy).toBe('31R');
    expect(r.arrIdent).toBe('WSSS'); expect(r.arrRwy).toBe('20C');
    expect(r.sid).toBe('BUBI1A'); expect(r.star).toBe('KITO1B');
    expect(r.cruiseFt).toBe(37000);
    expect(r.fixes.map((x) => x.ident)).toEqual(['25N060E', '20N070E']);
    expect(r.fixes[0].airway).toBe('UL425');
    expect(r.unresolved).toContain('BUBIN');
  });
  it('reads MSFS .pln and X-Plane .fms files back', () => {
    const f = parseOfp({ general: { route: 'BUBI1A BUBIN UL425 PURNI' }, origin: { icao_code: 'OMAA', plan_rwy: '31R' }, destination: { icao_code: 'WSSS', plan_rwy: '20C' }, aircraft: { icaocode: 'B789' },
      navlog: { fix: [{ ident: 'BUBIN', type: 'wpt', pos_lat: '24.9', pos_long: '55.3', via_airway: 'BUBI1A', is_sid_star: '1' }, { ident: 'PURNI', type: 'wpt', pos_lat: '22.0', pos_long: '62.0', via_airway: 'UL425', is_sid_star: '0' }] } });
    const a = parseRouteFile('x.pln', toMsfsPln(f));
    expect(a.depIdent).toBe('OMAA'); expect(a.arrIdent).toBe('WSSS');
    expect(a.fixes.map((x) => x.ident)).toContain('PURNI');     // SID/STAR fixes are left to the sim's procedure in .pln
    expect(a.fixes.find((x) => x.ident === 'PURNI')!.lat).toBeCloseTo(22, 3);
    const b = parseRouteFile('x.fms', toXplaneFms(f));
    expect(b.fixes.map((x) => x.ident)).toEqual(['PURNI']);
    expect(b.sid).toBe('BUBI1A');
    const plan = routeToPlan(b, f.dep, f.arr);
    expect(plan.fixes[0].cumNm).toBeGreaterThan(300);
    expect(plan.routeDistanceNm).toBeGreaterThan(2500);
  });
  it('imports a GPX track as the flown path', () => {
    const gpx = `<?xml version="1.0"?><gpx version="1.1"><trk><trkseg><trkpt lat="24.43" lon="54.65"><ele>30</ele><time>2026-01-01T10:00:00Z</time></trkpt><trkpt lat="24.6" lon="54.9"><ele>3000</ele><time>2026-01-01T10:05:00Z</time></trkpt><trkpt lat="25.2" lon="55.3"><ele>20</ele><time>2026-01-01T10:20:00Z</time></trkpt></trkseg></trk></gpx>`;
    const r = parseRouteFile('t.gpx', gpx);
    expect(r.track).toHaveLength(3);
    expect(r.track![1].altFt).toBe(9843);
    expect(r.track![1].gsKt).toBeGreaterThan(100);
  });
});

// ─── Logbook check, ordering, recorder merge, debrief, month comparison ─────
import { findDuplicates, sortByDateDesc, compareMonths } from '../lib/stats';
import { findMatchingFlight } from '../lib/recorder';
import { buildDebrief } from '../lib/stats';

describe('logbook check & debrief', () => {
  const base = (dep: string, arr: string, date: string, extra: Partial<Flight> = {}): Flight => finalizeFlight({ ...emptyFlight(), date, dep: toRef(findAirport(dep)!), arr: toRef(findAirport(arr)!), status: 'completed', flightMinutes: 70, flightMinutesSource: 'manual', createdAt: `${date}T10:00:00Z`, ...extra } as Flight);
  it('flags the same flight saved twice, not a return leg or a later repeat', () => {
    const a = base('OMAA', 'OTHH', '2026-10-21', { createdAt: '2026-10-21T08:00:00Z' });
    const b = base('OMAA', 'OTHH', '2026-10-21', { createdAt: '2026-10-21T12:00:00Z', track: [{ t: 1, lat: 24, lon: 54, altFt: 0, gsKt: 0, hdg: 0 }, { t: 2, lat: 25, lon: 52, altFt: 0, gsKt: 0, hdg: 0 }] as any });
    const back = base('OTHH', 'OMAA', '2026-10-21');
    const later = base('OMAA', 'OTHH', '2026-10-25');
    const g = findDuplicates([a, b, back, later]);
    expect(g).toHaveLength(1);
    expect(g[0].flights.map((f) => f.id).sort()).toEqual([a.id, b.id].sort());
  });
  it('orders same-day flights by time, then by when they were saved', () => {
    const x = base('OMDB', 'OMAA', '2026-10-21', { createdAt: '2026-10-21T15:00:00Z' });
    const y = base('OMAA', 'OTHH', '2026-10-21', { createdAt: '2026-10-21T16:00:00Z' });
    expect(sortByDateDesc([x, y])[0].id).toBe(y.id);
    const t1 = base('OMDB', 'OMAA', '2026-10-21', { times: { ...emptyFlight().times, takeoff: '2026-10-21T18:00:00Z' } });
    const t2 = base('OMAA', 'OTHH', '2026-10-21', { times: { ...emptyFlight().times, takeoff: '2026-10-21T09:00:00Z' }, createdAt: '2026-10-22T00:00:00Z' });
    expect(sortByDateDesc([t2, t1])[0].id).toBe(t1.id);
  });
  it('a sim recording joins the matching SimBrief entry instead of adding a copy', () => {
    const sb = base('OMAA', 'OTHH', '2026-10-21', { source: 'simbrief' } as any);
    const other = base('OMAA', 'OTHH', '2026-10-10');
    expect(findMatchingFlight([sb, other], 'OMAA', 'OTHH', '2026-10-21')?.id).toBe(sb.id);
    expect(findMatchingFlight([sb], 'OMAA', 'OTHH', '2026-10-24')).toBeNull();
    expect(findMatchingFlight([{ ...sb, track: [{}, {}] as any }], 'OMAA', 'OTHH', '2026-10-21')).toBeNull();
  });
  it('compares this month with last month', () => {
    const now = LDT.fromISO('2026-10-21');
    const fs = [base('OMAA', 'OTHH', '2026-10-02', { flightMinutes: 60 }), base('OTHH', 'OMAA', '2026-10-20', { flightMinutes: 60 }), base('OMAA', 'OMDB', '2026-09-05', { flightMinutes: 30 })];
    const mc = compareMonths(fs, now);
    expect(mc.cur.flights).toBe(2); expect(mc.cur.minutes).toBe(120);
    expect(mc.last.minutes).toBe(30); expect(mc.months).toHaveLength(13);
  });
  it('debrief lists firsts and month totals from real records only', () => {
    const now = LDT.fromISO('2026-10-21');
    const first = base('OMAA', 'OMDB', '2026-09-05', { createdAt: '2026-09-05T10:00:00Z' });
    const f = base('OMAA', 'OTHH', '2026-10-21', { landingRateFpm: -140 });
    const d = buildDebrief(f, [first, f], DEFAULT_SETTINGS.goals, now);
    expect(d.number).toBe(2);
    expect(d.firsts.map((x) => x.label)).toEqual(expect.arrayContaining(['New airport', 'New country', 'New route']));
    expect(d.landing?.label).toBe('Smooth');
    expect(d.month.flights).toBe(1);
  });
});
