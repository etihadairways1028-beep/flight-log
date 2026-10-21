// Fictional DEMO workspace. Airports are real (so the map and distances work),
// but airlines, flight numbers, registrations and people are invented and every
// record is tagged `demo`. Demo flights live in a separate store and are never
// mixed into the personal logbook.
import { DateTime } from 'luxon';
import type { Flight, FlightCategory, FlightRole } from './types';
import { emptyFlight, finalizeFlight } from './flight';
import { findAirport, toRef } from './airports';
import { aircraftType } from './aircraftTypes';
import { haversineKm } from './geo';
import { wallToUtc } from './time';
import { estimateNightMinutes, isNight } from './pilot';
import { emptyPilot } from './types';
import type { TrackPoint } from './types';
import { geoInterpolate } from 'd3-geo';

function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const REAL_ROUTES: [string, string][] = [
  ['OMAA', 'EGLL'], ['OMAA', 'WSSS'], ['OMAA', 'LFPG'], ['OMAA', 'VTBS'], ['OMAA', 'KJFK'], ['OMAA', 'RJTT'], ['OMAA', 'EDDF'],
  ['OMAA', 'LGAV'], ['OMAA', 'LCLK'], ['OMAA', 'VIDP'], ['OMAA', 'VCBI'], ['OMAA', 'VRMM'], ['OMAA', 'LSZH'], ['OMAA', 'OOMS'],
  ['OMDB', 'EHAM'], ['OMDB', 'YSSY'], ['OMDB', 'LTFM'], ['OMDB', 'HECA'], ['OMDB', 'OBBI'], ['OMAA', 'VABB'], ['OMAA', 'FAOR'],
];
const EURO_LEGS: [string, string][] = [['EGLL', 'EHAM'], ['LFPG', 'LIRF'], ['EDDF', 'EDDM'], ['WSSS', 'YSSY'], ['RJTT', 'RJFF'], ['KJFK', 'KBOS'], ['LGAV', 'LGSR']];
const SIM_ROUTES: [string, string][] = [
  ['KSEA', 'KSFO'], ['EGLL', 'LFPG'], ['LOWI', 'LSZH'], ['KJFK', 'EGLL'], ['PHNL', 'KLAX'], ['NZAA', 'NZQN'], ['RJTT', 'RJCC'],
  ['WSSS', 'VHHH'], ['LPMA', 'LPPT'], ['KASE', 'KDEN'], ['TNCM', 'TFFJ'], ['ENGM', 'ENTC'], ['YSSY', 'NZAA'], ['OMDB', 'OERK'], ['LXGB', 'LEMG'],
];

const AIRLINES = [
  { name: 'Meridian Air', code: 'MR' },
  { name: 'Aurora Gulf', code: 'AG' },
  { name: 'Northwind Regional', code: 'NW' },
];

function typeFor(km: number, r: () => number, sim: boolean): string {
  if (sim) {
    if (km < 350) return ['C172', 'TBM9', 'DA62', 'PC12'][Math.floor(r() * 4)];
    if (km < 2500) return ['A20N', 'B738', 'A321', 'B38M', 'CRJ7'][Math.floor(r() * 5)];
    return ['B789', 'A359', 'B77W', 'A388'][Math.floor(r() * 4)];
  }
  if (km < 900) return ['A20N', 'E190', 'AT76', 'A321'][Math.floor(r() * 4)];
  if (km < 4000) return ['A321', 'A20N', 'B738', 'A21N', 'B789'][Math.floor(r() * 5)];
  if (km < 9000) return ['B789', 'A359', 'B77W', 'A35K', 'A388'][Math.floor(r() * 5)];
  return ['B77W', 'A359', 'A388', 'B789'][Math.floor(r() * 4)];
}

function build(dep: string, arr: string, date: string, r: () => number, cat: FlightCategory, idx: number): Flight | null {
  const a = findAirport(dep), b = findAirport(arr);
  if (!a || !b) return null;
  const km = haversineKm(a.lat!, a.lon!, b.lat!, b.lon!);
  const sim = cat === 'simulator';
  const tc = typeFor(km, r, sim);
  const t = aircraftType(tc)!;
  const cruiseKmh = t.engine === 'Piston' ? 220 : t.engine === 'Turboprop' ? 480 : 820;
  const air = Math.round((km / cruiseKmh) * 60 + 18 + r() * 14);
  const taxiOut = Math.round(10 + r() * 16), taxiIn = Math.round(5 + r() * 9);
  const depHour = sim ? 8 + Math.floor(r() * 13) : [2, 8, 9, 14, 15, 21, 22][Math.floor(r() * 7)];
  const depMin = Math.floor(r() * 12) * 5;
  const out = wallToUtc(date, `${String(depHour).padStart(2, '0')}:${String(depMin).padStart(2, '0')}`, a.tz)!;
  const plus = (iso: string, m: number) => new Date(Date.parse(iso) + m * 60000).toISOString().replace('.000Z', 'Z');
  const f = emptyFlight();
  const al = AIRLINES[idx % 2 === 0 ? 0 : km < 900 ? 2 : 1];
  f.id = `demo_${idx}`;
  f.date = date;
  f.category = cat;
  f.status = 'completed';
  f.source = 'demo';
  f.dep = toRef(a); f.arr = toRef(b);
  f.airline = sim ? 'Virtual Horizon VA' : al.name;
  f.flightNumber = sim ? `VH ${100 + Math.floor(r() * 800)}` : `${al.code} ${100 + Math.floor(r() * 899)}`;
  f.callsign = sim ? `VHZ${Math.floor(r() * 900) + 100}` : '';
  f.aircraft = { typeCode: tc, manufacturer: t.manufacturer, model: t.model, variant: '', registration: `DEMO-${tc.slice(0, 2)}${(idx % 7) + 1}`, nickname: '' };
  const delay = sim ? 0 : Math.round((r() - 0.3) * 30);
  f.times.schedOut = out;
  f.times.schedIn = plus(out, taxiOut + air + taxiIn);
  f.times.offBlock = plus(out, delay);
  f.times.takeoff = plus(f.times.offBlock, taxiOut);
  f.times.landing = plus(f.times.takeoff, air);
  f.times.onBlock = plus(f.times.landing, taxiIn);
  f.cruiseAltitudeFt = t.engine === 'Piston' ? 6500 : t.engine === 'Turboprop' ? 24000 : 33000 + Math.floor(r() * 8) * 1000;
  f.flightLevel = t.engine === 'Piston' ? '' : `FL${Math.round(f.cruiseAltitudeFt / 100)}`;
  f.role = (sim ? 'sim-pilot' : 'passenger') as FlightRole;
  f.seat = sim ? 'Captain (L)' : `${10 + Math.floor(r() * 40)}${'ACDFHK'[Math.floor(r() * 6)]}`;
  f.simulator = sim ? (r() > 0.4 ? 'MSFS 2024' : 'X-Plane 12') : '';
  f.rating = 3 + Math.floor(r() * 3);
  f.tags = ['demo', ...(sim ? ['sim'] : r() > 0.6 ? ['holiday'] : r() > 0.5 ? ['work'] : [])];
  if (sim) {
    // sim sessions: flown as PIC, one takeoff and landing
    const fin0 = finalizeFlight(f);
    const night = estimateNightMinutes(fin0) ?? 0;
    const nightLanding = fin0.arr && fin0.times.landing ? isNight(new Date(fin0.times.landing), fin0.arr.lat!, fin0.arr.lon!) : false;
    f.pilot = { ...emptyPilot(), pic: fin0.flightMinutes, night: night || null, ifrSim: null };
    f.takeoffsDay = 1; f.landingsDay = nightLanding ? 0 : 1; f.landingsNight = nightLanding ? 1 : 0; f.takeoffsNight = 0;
    // most demo sim sessions carry a (fictional) recorded track so replay can be explored
    if (r() > 0.25) {
      f.track = demoTrack(fin0, r);
      f.landingRateFpm = -Math.round(70 + r() * 300);
      f.recordedDistanceKm = Math.round(fin0.distanceKm! * (1.03 + r() * 0.05));
      f.tags = [...(f.tags ?? []), 'recorded'];
    }
  }
  f.notes = sim
    ? 'DEMO — fictional simulator session for exploring Flight Log.'
    : 'DEMO — fictional flight. Delete or reset the demo workspace any time from Settings.';
  return finalizeFlight(f);
}

/** A plausible, clearly fictional track: taxi, climb, cruise with gentle wander, descent, taxi. */
function demoTrack(f: Flight, r: () => number): TrackPoint[] {
  const a = f.dep!, b = f.arr!;
  const t0 = Date.parse(f.times.offBlock!) / 1000, tTo = Date.parse(f.times.takeoff!) / 1000, tLd = Date.parse(f.times.landing!) / 1000, t1 = Date.parse(f.times.onBlock!) / 1000;
  const ip = geoInterpolate([a.lon!, a.lat!], [b.lon!, b.lat!]);
  const cruise = f.cruiseAltitudeFt ?? 30000, air = tLd - tTo;
  const climb = Math.min(air * 0.3, (cruise / 2200) * 60), desc = Math.min(air * 0.35, (cruise / 1800) * 60);
  const n = Math.min(240, Math.max(40, Math.round(air / 60)));
  const ph = r() * 6, amp = Math.min(0.25, 0.02 + (air / 3600) * 0.04);
  const pts: TrackPoint[] = [];
  const cruiseGs = (f.distanceKm! / 1.852) / ((air - climb / 2 - desc / 2) / 3600);
  pts.push({ t: Math.round(t0), lat: a.lat!, lon: a.lon!, altFt: 0, gsKt: 0 });
  pts.push({ t: Math.round((t0 + tTo) / 2), lat: a.lat! + 0.004, lon: a.lon! + 0.004, altFt: 0, gsKt: 16 });
  for (let i = 0; i <= n; i++) {
    const u = i / n, t = tTo + u * air, el = t - tTo;
    const [lon, lat] = ip(u);
    const wob = Math.sin(u * Math.PI) * Math.sin(u * 9 + ph) * amp;
    const alt = el < climb ? cruise * Math.sin((el / climb) * Math.PI / 2) : el > air - desc ? cruise * Math.sin(((air - el) / desc) * Math.PI / 2) : cruise;
    const gs = el < climb ? 160 + (cruiseGs - 160) * (el / climb) : el > air - desc ? 140 + (cruiseGs - 140) * ((air - el) / desc) : cruiseGs + Math.sin(u * 13 + ph) * 12;
    pts.push({ t: Math.round(t), lat: +(lat + wob).toFixed(5), lon: +(lon + wob * 0.6).toFixed(5), altFt: Math.round(Math.max(alt, 0)), gsKt: Math.round(gs) });
  }
  pts.push({ t: Math.round((tLd + t1) / 2), lat: b.lat! + 0.003, lon: b.lon! - 0.003, altFt: 0, gsKt: 14 });
  pts.push({ t: Math.round(t1), lat: b.lat!, lon: b.lon!, altFt: 0, gsKt: 0 });
  return pts;
}

export function generateDemoFlights(today = DateTime.local()): Flight[] {
  const r = rng(20240611);
  const flights: Flight[] = [];
  let idx = 0;
  let d = today.minus({ months: 26 }).startOf('month');
  while (d < today.minus({ days: 1 })) {
    d = d.plus({ days: 3 + Math.floor(r() * 9) });
    if (d >= today) break;
    const date = d.toISODate()!;
    const roll = r();
    if (roll < 0.34) {
      const [x, y] = SIM_ROUTES[Math.floor(r() * SIM_ROUTES.length)];
      const f = build(r() > 0.5 ? x : y, r() > 0.5 ? y : x, date, r, 'simulator', idx++);
      if (f && f.dep!.ident !== f.arr!.ident) flights.push(f);
    } else if (roll < 0.42) {
      const [x, y] = EURO_LEGS[Math.floor(r() * EURO_LEGS.length)];
      const f = build(x, y, date, r, 'real', idx++);
      if (f) flights.push(f);
    } else {
      const [x, y] = REAL_ROUTES[Math.floor(r() * REAL_ROUTES.length)];
      const out = build(x, y, date, r, 'real', idx++);
      if (out) {
        flights.push(out);
        const back = d.plus({ days: 4 + Math.floor(r() * 10) });
        if (back < today) {
          const ret = build(y, x, back.toISODate()!, r, 'real', idx++);
          if (ret) flights.push(ret);
          d = back;
        }
      }
    }
  }
  // a short block of fictional flight-school training in a Cessna 172 / DA40
  const legs: [string, string][] = [['OMAL', 'OMAD'], ['OMAD', 'OMAL'], ['OMAL', 'OMFJ'], ['OMFJ', 'OMAL'], ['OMAL', 'OMRK'], ['OMRK', 'OMAL'], ['OMAL', 'OMAD'], ['OMAD', 'OMAL']];
  legs.forEach(([x, y], i) => {
    const date = today.minus({ days: 110 - i * 13 }).toISODate()!;
    const fl = build(x, y, date, r, 'training', 1000 + i);
    if (!fl) return;
    const t = i % 3 === 0 ? 'DA40' : 'C172';
    const at = aircraftType(t)!;
    fl.aircraft = { typeCode: t, manufacturer: at.manufacturer, model: at.model, variant: '', registration: `DEMO-T${(i % 2) + 1}`, nickname: '' };
    fl.airline = 'Demo Flight School';
    fl.flightNumber = '';
    fl.callsign = `DMO${21 + (i % 2)}`;
    fl.role = i < 4 ? 'dual' : 'pic';
    fl.seat = 'Left seat';
    fl.cruiseAltitudeFt = 4500; fl.flightLevel = '';
    // rebuild times for a light aircraft at ~105 kt
    const air = Math.round((fl.distanceKm! / 195) * 60) + 12;
    fl.times.takeoff = new Date(Date.parse(fl.times.offBlock!) + 12 * 60000).toISOString().replace('.000Z', 'Z');
    fl.times.landing = new Date(Date.parse(fl.times.takeoff) + air * 60000).toISOString().replace('.000Z', 'Z');
    fl.times.onBlock = new Date(Date.parse(fl.times.landing) + 6 * 60000).toISOString().replace('.000Z', 'Z');
    fl.times.schedOut = null; fl.times.schedIn = null;
    const fin = finalizeFlight(fl);
    fin.pilot = { ...emptyPilot(), pic: i < 4 ? null : fin.flightMinutes, dual: i < 4 ? fin.flightMinutes : null, xc: fin.flightMinutes, night: null, ifrSim: i % 4 === 1 ? 18 : null, approaches: i % 4 === 1 ? 1 : null };
    fin.takeoffsDay = 2; fin.landingsDay = 2; fin.takeoffsNight = i === 7 ? 1 : 0; fin.landingsNight = i === 7 ? 1 : 0;
    fin.notes = 'DEMO — fictional training flight (circuits and a cross-country leg).';
    fin.tags = ['demo', 'training'];
    flights.push(fin);
  });

  // one planned future trip, so the planned state is visible
  const fut = build('OMAA', 'NZAA', today.plus({ days: 24 }).toISODate()!, r, 'real', idx++);
  if (fut) {
    fut.status = 'planned';
    fut.times = { ...fut.times, offBlock: null, takeoff: null, landing: null, onBlock: null };
    flights.push(finalizeFlight(fut));
  }
  return flights;
}
