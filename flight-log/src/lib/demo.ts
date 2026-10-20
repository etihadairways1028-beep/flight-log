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
  f.notes = sim
    ? 'DEMO — fictional simulator session for exploring Flight Log.'
    : 'DEMO — fictional flight. Delete or reset the demo workspace any time from Settings.';
  return finalizeFlight(f);
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
  // one planned future trip, so the planned state is visible
  const fut = build('OMAA', 'NZAA', today.plus({ days: 24 }).toISODate()!, r, 'real', idx++);
  if (fut) {
    fut.status = 'planned';
    fut.times = { ...fut.times, offBlock: null, takeoff: null, landing: null, onBlock: null };
    flights.push(finalizeFlight(fut));
  }
  return flights;
}
