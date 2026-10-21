import type { AirportRef, Flight, FlightCategory, FlightStatus, Settings, FlightPlan, PlanFix } from './types';
import { emptyPilot, PILOT_FIELDS } from './types';
import { deriveDurations, isValidISODate, todayISO } from './time';
import { distanceBetween } from './geo';
import { aircraftType } from './aircraftTypes';

export const uid = (p = 'f') => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export function emptyFlight(s?: Partial<Settings>): Flight {
  const now = new Date().toISOString();
  const t = aircraftType(s?.defaultAircraft);
  return {
    id: uid(),
    date: todayISO(),
    flightNumber: '',
    callsign: '',
    category: s?.defaultCategory ?? 'real',
    status: 'completed',
    airline: '',
    airlineCode: '',
    operator: '',
    dep: null,
    arr: null,
    aircraft: { typeCode: t?.code ?? '', manufacturer: t?.manufacturer ?? '', model: t?.model ?? '', variant: '', registration: '', nickname: '' },
    times: { schedOut: null, schedIn: null, offBlock: null, takeoff: null, landing: null, onBlock: null },
    flightMinutes: null,
    flightMinutesSource: null,
    blockMinutes: null,
    blockMinutesSource: null,
    plannedRoute: '',
    actualRoute: '',
    distanceKm: null,
    recordedDistanceKm: null,
    cruiseAltitudeFt: null,
    flightLevel: '',
    avgGroundSpeedKt: null,
    maxGroundSpeedKt: null,
    configNotes: '',
    purpose: '',
    seat: '',
    role: s?.defaultCategory === 'simulator' ? 'sim-pilot' : s?.profile === 'enthusiast' ? 'passenger' : '',
    crew: '',
    weather: '',
    passengers: null,
    fuel: null,
    fuelUnit: 'kg',
    takeoffsDay: null,
    takeoffsNight: null,
    landingsDay: null,
    landingsNight: null,
    rating: null,
    tags: [],
    photos: [],
    notes: '',
    simulator: s?.defaultCategory === 'simulator' ? s?.defaultSimulator ?? '' : '',
    pilot: emptyPilot(),
    source: 'manual',
    createdAt: now,
    updatedAt: now,
  };
}

/** Recompute derived fields before saving. */
export function finalizeFlight(f: Flight): Flight {
  const d = deriveDurations(f);
  return { ...f, ...d, distanceKm: distanceBetween(f.dep, f.arr), updatedAt: new Date().toISOString() };
}

/** Which useful fields are still missing — drives the "incomplete" amber state. */
export function missingFields(f: Flight): string[] {
  const m: string[] = [];
  if (!f.dep) m.push('departure');
  if (!f.arr) m.push('arrival');
  if (!f.aircraft.typeCode && !f.aircraft.model) m.push('aircraft');
  if (f.status === 'completed' && f.flightMinutes == null && f.blockMinutes == null) m.push('duration');
  return m;
}

export const COUNTED_STATUSES: FlightStatus[] = ['completed', 'diverted', 'draft'];
/** Flights that count toward totals. Planned and cancelled flights never do. */
export const isCounted = (f: Flight) => COUNTED_STATUSES.includes(f.status);
export const isSim = (f: Flight) => f.category === 'simulator';

export function routeKey(f: Flight, directional = false): string | null {
  if (!f.dep || !f.arr) return null;
  const a = f.dep.iata || f.dep.ident, b = f.arr.iata || f.arr.ident;
  if (directional) return `${a}→${b}`;
  return [a, b].sort().join('–');
}

export function aircraftLabel(f: Flight): string {
  const t = aircraftType(f.aircraft.typeCode);
  if (f.aircraft.model) return `${f.aircraft.manufacturer ? f.aircraft.manufacturer + ' ' : ''}${f.aircraft.model}${f.aircraft.variant ? ' ' + f.aircraft.variant : ''}`.trim();
  if (t) return `${t.manufacturer} ${t.model}`;
  return f.aircraft.typeCode || 'Unknown aircraft';
}
export function aircraftShort(f: Flight): string {
  const t = aircraftType(f.aircraft.typeCode);
  if (f.aircraft.model) return f.aircraft.model + (f.aircraft.variant ? ` ${f.aircraft.variant}` : '');
  return t?.model ?? f.aircraft.typeCode ?? '—';
}
export function typeKey(f: Flight): string {
  return (f.aircraft.typeCode || f.aircraft.model || '').toUpperCase() || 'UNKNOWN';
}

// ── Import / restore validation ─────────────────────────────────────────────
const CATS: FlightCategory[] = ['real', 'simulator', 'training', 'ferry', 'private', 'commercial', 'other'];
const STATUSES: FlightStatus[] = ['completed', 'planned', 'cancelled', 'diverted', 'draft'];
const num = (v: unknown): number | null => {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const str = (v: unknown) => (typeof v === 'string' ? v : v == null || typeof v === 'object' ? '' : String(v));
const inst = (v: unknown): string | null => {
  if (!v) return null;
  const t = Date.parse(String(v));
  return Number.isFinite(t) ? new Date(t).toISOString().replace('.000Z', 'Z') : null;
};
function airportRef(v: any): AirportRef | null {
  if (!v || typeof v !== 'object' || !v.ident) return null;
  return {
    ident: str(v.ident).toUpperCase(), iata: str(v.iata).toUpperCase(), name: str(v.name), city: str(v.city), country: str(v.country),
    continent: str(v.continent), lat: num(v.lat), lon: num(v.lon), tz: str(v.tz) || 'UTC', source: v.source === 'custom' ? 'custom' : 'dataset',
  };
}

/** Coerce an unknown object (JSON backup) into a valid Flight, or return an error. */
export function coerceFlight(raw: any): { flight?: Flight; error?: string } {
  if (!raw || typeof raw !== 'object') return { error: 'Not an object' };
  if (!isValidISODate(str(raw.date))) return { error: `Invalid date "${str(raw.date)}"` };
  const base = emptyFlight();
  const f: Flight = {
    ...base,
    id: str(raw.id) || base.id,
    date: str(raw.date),
    flightNumber: str(raw.flightNumber),
    callsign: str(raw.callsign),
    category: CATS.includes(raw.category) ? raw.category : 'real',
    status: STATUSES.includes(raw.status) ? raw.status : 'completed',
    airline: str(raw.airline),
    airlineCode: str(raw.airlineCode),
    operator: str(raw.operator),
    dep: airportRef(raw.dep),
    arr: airportRef(raw.arr),
    aircraft: {
      typeCode: str(raw.aircraft?.typeCode).toUpperCase(), manufacturer: str(raw.aircraft?.manufacturer), model: str(raw.aircraft?.model),
      variant: str(raw.aircraft?.variant), registration: str(raw.aircraft?.registration).toUpperCase(), nickname: str(raw.aircraft?.nickname),
    },
    times: {
      schedOut: inst(raw.times?.schedOut), schedIn: inst(raw.times?.schedIn), offBlock: inst(raw.times?.offBlock),
      takeoff: inst(raw.times?.takeoff), landing: inst(raw.times?.landing), onBlock: inst(raw.times?.onBlock),
    },
    flightMinutes: num(raw.flightMinutes),
    flightMinutesSource: raw.flightMinutesSource === 'computed' || raw.flightMinutesSource === 'manual' ? raw.flightMinutesSource : num(raw.flightMinutes) != null ? 'manual' : null,
    blockMinutes: num(raw.blockMinutes),
    blockMinutesSource: raw.blockMinutesSource === 'computed' || raw.blockMinutesSource === 'manual' ? raw.blockMinutesSource : num(raw.blockMinutes) != null ? 'manual' : null,
    plannedRoute: str(raw.plannedRoute), actualRoute: str(raw.actualRoute),
    recordedDistanceKm: num(raw.recordedDistanceKm), cruiseAltitudeFt: num(raw.cruiseAltitudeFt), flightLevel: str(raw.flightLevel),
    avgGroundSpeedKt: num(raw.avgGroundSpeedKt), maxGroundSpeedKt: num(raw.maxGroundSpeedKt), configNotes: str(raw.configNotes),
    purpose: str(raw.purpose), seat: str(raw.seat), role: raw.role ?? '', crew: str(raw.crew), weather: str(raw.weather),
    passengers: num(raw.passengers), fuel: num(raw.fuel), fuelUnit: ['kg', 'lb', 'l', 'gal'].includes(raw.fuelUnit) ? raw.fuelUnit : 'kg',
    takeoffsDay: num(raw.takeoffsDay), takeoffsNight: num(raw.takeoffsNight), landingsDay: num(raw.landingsDay), landingsNight: num(raw.landingsNight),
    track: Array.isArray(raw.track) ? raw.track.filter((p: any) => p && Number.isFinite(p.lat) && Number.isFinite(p.lon)).slice(0, 3000) : undefined,
    landingRateFpm: num(raw.landingRateFpm),
    flightPlan: normalizePlan(raw.flightPlan),
    pilot: Object.fromEntries(PILOT_FIELDS.map((p) => [p.key, num(raw.pilot?.[p.key])])) as any,
    rating: num(raw.rating), tags: Array.isArray(raw.tags) ? raw.tags.map(str).filter(Boolean) : [],
    photos: Array.isArray(raw.photos) ? raw.photos.map(str) : [], notes: str(raw.notes), simulator: str(raw.simulator),
    source: raw.source ?? 'json', createdAt: str(raw.createdAt) || base.createdAt, updatedAt: str(raw.updatedAt) || base.updatedAt,
  };
  const fin = finalizeFlight(f);
  fin.updatedAt = f.updatedAt;
  return { flight: fin };
}

const nn = (v: any): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(+v) ? +v : null);
function brief(b: any) {
  if (!b || typeof b !== 'object') return undefined;
  return { ...b, runway: str(b.runway), transAlt: nn(b.transAlt), transLevel: nn(b.transLevel), metar: str(b.metar), taf: str(b.taf), elevationFt: nn(b.elevationFt) };
}
/** Repair a flight plan saved by any app version, so older records can never crash a page. */
export function normalizePlan(fp: any): FlightPlan | undefined {
  if (!fp || typeof fp !== 'object') return undefined;
  const fixes: PlanFix[] = (Array.isArray(fp.fixes) ? fp.fixes : [])
    .filter((x: any) => x && Number.isFinite(+x.lat) && Number.isFinite(+x.lon))
    .map((x: any) => ({ ...x, ident: str(x.ident) || '?', name: str(x.name), type: str(x.type), lat: +x.lat, lon: +x.lon, altFt: nn(x.altFt), airway: str(x.airway), stage: str(x.stage), elapsedMin: nn(x.elapsedMin),
      frequency: x.frequency == null ? undefined : str(x.frequency), mach: x.mach == null ? undefined : str(x.mach), fir: x.fir == null ? undefined : str(x.fir), region: x.region == null ? undefined : str(x.region) }));
  const fu = fp.fuel && typeof fp.fuel === 'object' ? fp.fuel : {};
  return {
    ...fp,
    source: fp.source === 'manual' || fp.source === 'file' ? fp.source : 'simbrief',
    label: fp.label == null ? undefined : str(fp.label),
    unresolved: Array.isArray(fp.unresolved) ? fp.unresolved.map(str).filter(Boolean).slice(0, 200) : undefined,
    route: str(fp.route), fullRoute: fp.fullRoute == null ? undefined : str(fp.fullRoute), sid: fp.sid == null ? undefined : str(fp.sid), star: fp.star == null ? undefined : str(fp.star),
    depBrief: brief(fp.depBrief), arrBrief: brief(fp.arrBrief), altnBrief: fp.altnBrief ? { ...brief(fp.altnBrief)!, icao: str(fp.altnBrief.icao) } : undefined,
    initialAltFt: nn(fp.initialAltFt), fixes,
    routeDistanceNm: nn(fp.routeDistanceNm), airDistanceNm: nn(fp.airDistanceNm), plannedEteMin: nn(fp.plannedEteMin),
    cruiseFl: str(fp.cruiseFl), costIndex: str(fp.costIndex), alternate: str(fp.alternate), airac: str(fp.airac), fuelUnit: fp.fuelUnit === 'lb' ? 'lb' : 'kg',
    fuel: { ramp: nn(fu.ramp), takeoff: nn(fu.takeoff), trip: nn(fu.trip), reserve: nn(fu.reserve), alternate: nn(fu.alternate), contingency: nn(fu.contingency), landing: nn(fu.landing) },
    avgWind: str(fp.avgWind), ofpUrl: str(fp.ofpUrl),
    downloads: Array.isArray(fp.downloads) ? fp.downloads.filter((d: any) => d && typeof d.url === 'string' && /^https:\/\//.test(d.url)).map((d: any) => ({ name: str(d.name) || 'File', url: d.url })) : [],
    requestId: str(fp.requestId), generatedAt: fp.generatedAt ? str(fp.generatedAt) : null,
  };
}

/** Repair a stored record from an older version; falls back to the record as-is if it can't be read. */
export function normalizeStoredFlight(raw: any): Flight | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = coerceFlight(raw);
  if (!c.flight) return { ...emptyFlight(), ...raw, flightPlan: normalizePlan(raw.flightPlan), tags: Array.isArray(raw.tags) ? raw.tags : [], photos: Array.isArray(raw.photos) ? raw.photos : [] };
  return { ...c.flight, id: str(raw.id) || c.flight.id, source: raw.source ?? c.flight.source, createdAt: str(raw.createdAt) || c.flight.createdAt, updatedAt: str(raw.updatedAt) || c.flight.updatedAt };
}

/** Duplicate signature: same date, route and flight number/callsign. */
export function dupKey(f: Pick<Flight, 'date' | 'dep' | 'arr' | 'flightNumber' | 'callsign'>): string {
  return [f.date, f.dep?.ident ?? '', f.arr?.ident ?? '', (f.flightNumber || f.callsign || '').replace(/\s+/g, '').toUpperCase()].join('|');
}

/** Does this flight carry any pilot-log data? */
export const hasPilotData = (f: Flight) => !!f.pilot && Object.values(f.pilot).some((v) => v != null && v !== 0);

/** Coordinates of the filed route (departure → fixes → arrival), when a flight plan exists. */
export function plannedPath(f: Flight): [number, number][] | null {
  const fx = f.flightPlan?.fixes;
  if (!fx || fx.length < 2 || f.dep?.lon == null || f.arr?.lon == null) return null;
  const pts: [number, number][] = [[f.dep.lon, f.dep.lat!]];
  for (const x of fx) if (x.ident !== f.dep.ident && x.ident !== f.arr.ident) pts.push([x.lon, x.lat]);
  pts.push([f.arr.lon, f.arr.lat!]);
  return pts;
}

/** The best path to draw: the recorded track if there is one, else the filed plan. */
export function bestPath(f: Flight): { pts: [number, number][]; kind: 'track' | 'plan' } | null {
  if (f.track && f.track.length >= 2) return { pts: f.track.map((p) => [p.lon, p.lat] as [number, number]), kind: 'track' };
  const p = plannedPath(f);
  return p ? { pts: p, kind: 'plan' } : null;
}
