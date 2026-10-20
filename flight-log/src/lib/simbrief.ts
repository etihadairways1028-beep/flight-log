// SimBrief integration — fetches the latest OFP for a SimBrief username via the
// public XML fetcher (https://www.simbrief.com/api/xml.fetcher.php?username=…&json=1).
// No API key is needed for reading your own latest flight plan. Requests go straight
// from the browser; if SimBrief blocks the request (CORS / network), we report it.
import type { AirportBrief, Flight, PlanFix } from './types';
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
  let cum = 0;
  const fixes: PlanFix[] = asList(j.navlog?.fix).map((x: any) => {
    const leg = numOr(x.distance);
    if (leg != null) cum += leg;
    return {
      ident: String(x.ident ?? ''), name: String(x.name ?? ''), type: String(x.type ?? ''),
      lat: Number(x.pos_lat), lon: Number(x.pos_long), altFt: numOr(x.altitude_feet),
      airway: String(x.via_airway ?? ''), stage: String(x.stage ?? ''), elapsedMin: numOr(x.time_total) != null ? Math.round(Number(x.time_total) / 60) : null,
      isSidStar: String(x.is_sid_star ?? '0') === '1',
      frequency: x.frequency && String(x.frequency) !== '0' ? String(x.frequency) : '',
      legNm: leg, cumNm: leg != null ? Math.round(cum) : null,
      trackTrue: numOr(x.track_true), ias: numOr(x.ind_airspeed), tas: numOr(x.true_airspeed),
      mach: x.mach ? String(x.mach) : '', windDir: numOr(x.wind_dir), windKt: numOr(x.wind_spd), oatC: numOr(x.oat),
      fuelOnboard: numOr(x.fuel_plan_onboard), groundFt: numOr(x.ground_height), fir: String(x.fir ?? ''), region: String(x.icao_region ?? ''),
    };
  }).filter((x: PlanFix) => Number.isFinite(x.lat) && Number.isFinite(x.lon) && x.ident);
  const procs = procedures(fixes);
  const brief = (a: any): AirportBrief | undefined => a ? ({
    runway: String(a.plan_rwy ?? ''), transAlt: numOr(a.trans_alt), transLevel: numOr(a.trans_level),
    metar: String(a.metar ?? ''), taf: String(a.taf ?? ''), elevationFt: numOr(a.elevation),
  }) : undefined;
  const altn = asList(j.alternate)[0] as any;
  const pdf = j.files?.pdf?.link ? `${j.files?.directory ?? 'https://www.simbrief.com/ofp/flightplans/'}${j.files.pdf.link}` : '';
  f.flightPlan = {
    source: 'simbrief',
    route: String(j.general?.route ?? ''),
    fullRoute: fullRouteString(f.dep!.ident, f.arr!.ident, String(j.origin?.plan_rwy ?? ''), String(j.destination?.plan_rwy ?? ''), fixes),
    sid: procs.sid, star: procs.star,
    depBrief: brief(j.origin), arrBrief: brief(j.destination),
    altnBrief: altn ? { ...(brief(altn) as AirportBrief), icao: String(altn.icao_code ?? '') } : undefined,
    initialAltFt: numOr(j.general?.initial_altitude),
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
    downloads: Object.entries(j.fms_downloads ?? {}).filter(([k, v]: [string, any]) => k !== 'directory' && v?.link).map(([, v]: [string, any]) => ({ name: String(v.name ?? 'Flight plan file'), url: `${j.fms_downloads.directory ?? ''}${v.link}` })),
    requestId: String(j.params?.request_id ?? ''),
    generatedAt: numOr(j.params?.time_generated) ? new Date(Number(j.params.time_generated) * 1000).toISOString() : null,
  };
  return finalizeFlight(f);
}

/** SID = leading procedure fixes, STAR = trailing procedure fixes (SimBrief flags them with is_sid_star). */
export function procedures(fixes: PlanFix[]): { sid: string; star: string } {
  let sid = '', star = '';
  if (fixes.length && fixes[0].isSidStar) sid = fixes[0].airway;
  for (let i = fixes.length - 1; i >= 0; i--) {
    const f = fixes[i];
    if (!f.isSidStar) break;
    if (f.airway && f.airway !== 'DCT') star = f.airway;
  }
  if (sid === 'DCT') sid = '';
  return { sid, star: star === sid ? '' : star };
}

/** Reconstruct the complete route as "OMAA/31R SID FIX AWY FIX … STAR WSSS/20C" from the navlog. */
export function fullRouteString(dep: string, arr: string, depRwy: string, arrRwy: string, fixes: PlanFix[]): string {
  const parts: string[] = [depRwy ? `${dep}/${depRwy}` : dep];
  let lastVia = '';
  const pts = fixes.filter((f) => f.type !== 'toc' && f.type !== 'tod' && f.ident !== dep && f.ident !== arr && !/^T\/?[OC]D?$/.test(f.ident));
  pts.forEach((f, i) => {
    const via = f.airway || 'DCT';
    const next = pts[i + 1];
    const nextVia = next ? next.airway || 'DCT' : null;
    if (via === 'DCT') { parts.push('DCT', f.ident); lastVia = 'DCT'; return; }
    if (via !== lastVia) { parts.push(via); lastVia = via; }
    // inside an airway or procedure only the fix where it ends is printed
    if (nextVia !== via) parts.push(f.ident);
  });
  parts.push(arrRwy ? `${arr}/${arrRwy}` : arr);
  return parts.join(' ').replace(/\s+/g, ' ');
}
