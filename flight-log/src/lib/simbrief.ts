// SimBrief integration — fetches the latest OFP for a SimBrief username via the
// public XML fetcher (https://www.simbrief.com/api/xml.fetcher.php?username=…&json=1).
// No API key is needed for reading your own latest flight plan. Requests go straight
// from the browser; if SimBrief blocks the request (CORS / network), we report it.
import type { Flight, PlanFix } from './types';
import { emptyFlight, finalizeFlight } from './flight';
import { findAirport, toRef } from './airports';
import { aircraftType } from './aircraftTypes';
import { DateTime } from 'luxon';

export async function fetchLatestOfp(username: string, opts: { asFlown?: boolean } = {}): Promise<Flight> {
  const u = username.trim();
  if (!u) throw new Error('Enter your SimBrief username first.');
  let res: Response;
  try {
    res = await fetch(`https://www.simbrief.com/api/xml.fetcher.php?${/^\d+$/.test(u) ? 'userid' : 'username'}=${encodeURIComponent(u)}&json=1`, { headers: { Accept: 'application/json' } });
  } catch {
    throw new Error('Could not reach SimBrief from your browser (network or cross-origin block). Try again later, or import the OFP as CSV.');
  }
  if (res.status === 400 || res.status === 404) throw new Error(`SimBrief has no flight plan for “${u}”. Check the username (not your Navigraph email).`);
  if (res.status === 429) throw new Error('SimBrief is rate-limiting requests. Wait a minute and try again.');
  if (!res.ok) throw new Error(`SimBrief returned HTTP ${res.status}.`);
  const j = await res.json().catch(() => null);
  if (!j || j.fetch?.status && !/success/i.test(j.fetch.status)) throw new Error(j?.fetch?.status || 'SimBrief returned an unexpected response.');
  return parseOfp(j, opts);
}

const asList = <T,>(v: T | T[] | undefined | null): T[] => (Array.isArray(v) ? v : v ? [v] : []);
const numOr = (v: unknown): number | null => { const n = Number(v); return v !== '' && v != null && Number.isFinite(n) ? n : null; };

/** Convert a SimBrief OFP (JSON) into a Flight with its full filed flight plan. */
export function parseOfp(j: any, opts: { asFlown?: boolean } = {}): Flight {

  const dep = findAirport(j.origin?.icao_code), arr = findAirport(j.destination?.icao_code);
  if (!dep || !arr) throw new Error(`Unknown airport in the OFP (${j.origin?.icao_code} → ${j.destination?.icao_code}).`);
  const f = emptyFlight({ defaultCategory: 'simulator' });
  const ts = (v: unknown) => (v && Number(v) > 0 ? new Date(Number(v) * 1000).toISOString().replace('.000Z', 'Z') : null);
  f.category = 'simulator';
  f.status = 'planned';
  f.source = 'simbrief';
  f.dep = toRef(dep); f.arr = toRef(arr);
  f.airlineCode = j.general?.icao_airline ?? '';
  f.flightNumber = [j.general?.icao_airline, j.general?.flight_number].filter(Boolean).join(' ');
  f.callsign = j.atc?.callsign ?? '';
  const tc = String(j.aircraft?.icaocode ?? j.aircraft?.icao_code ?? '').toUpperCase();
  const t = aircraftType(tc);
  f.aircraft = { typeCode: tc, manufacturer: t?.manufacturer ?? '', model: t?.model ?? String(j.aircraft?.name ?? ''), variant: '', registration: String(j.aircraft?.reg ?? '').toUpperCase(), nickname: '' };
  f.plannedRoute = String(j.general?.route ?? '');
  const alt = Number(j.general?.initial_altitude);
  if (Number.isFinite(alt) && alt > 0) { f.cruiseAltitudeFt = alt; f.flightLevel = `FL${Math.round(alt / 100)}`; }
  f.times.schedOut = ts(j.times?.sched_out);
  f.times.schedIn = ts(j.times?.sched_in);
  f.date = f.times.schedOut ? DateTime.fromISO(f.times.schedOut, { zone: 'utc' }).setZone(dep.tz).toISODate()! : f.date;
  f.passengers = Number(j.weights?.pax_count) || null;
  const ramp = Number(j.fuel?.plan_ramp);
  if (Number.isFinite(ramp) && ramp > 0) { f.fuel = ramp; f.fuelUnit = /lb/i.test(String(j.params?.units ?? '')) ? 'lb' : 'kg'; }
  if (j.alternate?.icao_code) f.configNotes = `Alternate ${j.alternate.icao_code}`;
  if (opts.asFlown) {
    // Log the plan as flown: planned off/on-block, takeoff and landing become the recorded times.
    f.status = 'completed';
    f.times.offBlock = f.times.schedOut;
    f.times.takeoff = ts(j.times?.sched_off) ?? ts(j.times?.est_off);
    f.times.landing = ts(j.times?.sched_on) ?? ts(j.times?.est_on);
    f.times.onBlock = f.times.schedIn;
  }
  f.notes = `Imported from SimBrief OFP${j.params?.request_id ? ` #${j.params.request_id}` : ''}.${opts.asFlown ? ' Times are the planned times; adjust them if your flight differed.' : ' Add your actual times after the flight.'}`;
  f.simulator = '';
  f.role = 'sim-pilot';
  f.tags = ['simbrief'];
  const units: 'kg' | 'lb' = /lb/i.test(String(j.params?.units ?? '')) ? 'lb' : 'kg';
  const fixes: PlanFix[] = asList(j.navlog?.fix).map((x: any) => ({
    ident: String(x.ident ?? ''), name: String(x.name ?? ''), type: String(x.type ?? ''),
    lat: Number(x.pos_lat), lon: Number(x.pos_long), altFt: numOr(x.altitude_feet),
    airway: String(x.via_airway ?? ''), stage: String(x.stage ?? ''), elapsedMin: numOr(x.time_total) != null ? Math.round(Number(x.time_total) / 60) : null,
  })).filter((x: PlanFix) => Number.isFinite(x.lat) && Number.isFinite(x.lon) && x.ident);
  const altn = asList(j.alternate)[0] as any;
  const pdf = j.files?.pdf?.link ? `${j.files?.directory ?? 'https://www.simbrief.com/ofp/flightplans/'}${j.files.pdf.link}` : '';
  f.flightPlan = {
    source: 'simbrief',
    route: String(j.general?.route ?? ''),
    fixes,
    routeDistanceNm: numOr(j.general?.route_distance),
    airDistanceNm: numOr(j.general?.air_distance),
    plannedEteMin: numOr(j.times?.est_time_enroute) != null ? Math.round(Number(j.times.est_time_enroute) / 60) : null,
    cruiseFl: f.flightLevel,
    costIndex: String(j.general?.costindex ?? ''),
    alternate: String(altn?.icao_code ?? ''),
    airac: String(j.params?.airac ?? ''),
    fuelUnit: units,
    fuel: { ramp: numOr(j.fuel?.plan_ramp), takeoff: numOr(j.fuel?.plan_takeoff), trip: numOr(j.fuel?.est_burn), reserve: numOr(j.fuel?.reserve), alternate: numOr(j.fuel?.alternate_burn), contingency: numOr(j.fuel?.contingency), landing: numOr(j.fuel?.plan_landing) },
    avgWind: j.general?.avg_wind_comp != null ? `${Number(j.general.avg_wind_comp) >= 0 ? 'Tailwind' : 'Headwind'} ${Math.abs(Number(j.general.avg_wind_comp))} kt` : '',
    ofpUrl: pdf,
    requestId: String(j.params?.request_id ?? ''),
    generatedAt: numOr(j.params?.time_generated) ? new Date(Number(j.params.time_generated) * 1000).toISOString() : null,
  };
  return finalizeFlight(f);
}
