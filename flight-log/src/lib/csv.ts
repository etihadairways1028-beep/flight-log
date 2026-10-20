import Papa from 'papaparse';
import type { Flight, FlightCategory, FlightStatus, AirportRef, FlightRole } from './types';
import { emptyFlight, finalizeFlight, aircraftLabel, dupKey } from './flight';
import { findAirport, toRef } from './airports';
import { aircraftType } from './aircraftTypes';
import { isValidISODate, parseDurationInput, fmtDuration } from './time';
import { DateTime } from 'luxon';

/** Flight Log CSV template — documented in the README and downloadable from Reports. */
export const CSV_FIELDS = [
  { key: 'date', label: 'Date', required: true, help: 'YYYY-MM-DD (departure date, local to the departure airport). DD/MM/YYYY is also accepted.' },
  { key: 'departure', label: 'Departure', required: true, help: 'ICAO or IATA code, e.g. OMAA or AUH.' },
  { key: 'arrival', label: 'Arrival', required: true, help: 'ICAO or IATA code.' },
  { key: 'flight_number', label: 'Flight number', help: 'e.g. EY 470' },
  { key: 'callsign', label: 'Callsign', help: 'e.g. ETD470' },
  { key: 'category', label: 'Category', help: 'real, simulator, training, ferry, private, commercial, other' },
  { key: 'status', label: 'Status', help: 'completed, planned, cancelled, diverted, draft' },
  { key: 'airline', label: 'Airline / operator', help: 'Free text' },
  { key: 'aircraft_type', label: 'Aircraft ICAO type', help: 'e.g. A359, B789' },
  { key: 'aircraft_model', label: 'Aircraft model', help: 'Free text when the ICAO type is unknown' },
  { key: 'registration', label: 'Registration', help: 'Tail number' },
  { key: 'off_block_utc', label: 'Off-block (UTC)', help: 'ISO date-time or HH:MM UTC on the flight date' },
  { key: 'takeoff_utc', label: 'Takeoff (UTC)', help: 'ISO date-time or HH:MM UTC' },
  { key: 'landing_utc', label: 'Landing (UTC)', help: 'ISO date-time or HH:MM UTC; rolls to the next day when earlier than takeoff' },
  { key: 'on_block_utc', label: 'On-block (UTC)', help: 'ISO date-time or HH:MM UTC' },
  { key: 'flight_time', label: 'Flight time', help: 'H:MM or decimal hours. Used only when takeoff/landing are missing.' },
  { key: 'block_time', label: 'Block time', help: 'H:MM or decimal hours. Used only when off/on-block are missing.' },
  { key: 'cruise_altitude_ft', label: 'Cruise altitude (ft)', help: 'Number' },
  { key: 'route', label: 'Route', help: 'Planned route string' },
  { key: 'role', label: 'Role', help: 'passenger, pic, sic, dual, instructor, observer, sim-pilot, cabin-crew' },
  { key: 'seat', label: 'Seat', help: 'e.g. 32A' },
  { key: 'simulator', label: 'Simulator', help: 'e.g. MSFS 2024' },
  { key: 'tags', label: 'Tags', help: 'Separated by ; or |' },
  { key: 'rating', label: 'Rating', help: '1–5' },
  { key: 'notes', label: 'Notes', help: 'Free text' },
] as const;
export type CsvKey = (typeof CSV_FIELDS)[number]['key'];

const ALIASES: Record<CsvKey, string[]> = {
  date: ['date', 'flight date', 'dep date', 'departure date', 'day'],
  departure: ['departure', 'from', 'origin', 'dep', 'dep airport', 'departure airport', 'orig', 'from airport'],
  arrival: ['arrival', 'to', 'destination', 'arr', 'dest', 'arr airport', 'arrival airport', 'to airport'],
  flight_number: ['flight number', 'flight', 'flight no', 'flightno', 'flight_no', 'number'],
  callsign: ['callsign', 'call sign', 'atc callsign'],
  category: ['category', 'type of flight', 'flight type', 'kind'],
  status: ['status'],
  airline: ['airline', 'operator', 'carrier', 'company'],
  aircraft_type: ['aircraft type', 'icao type', 'type', 'aircraft_icao', 'type code', 'ac type', 'equipment'],
  aircraft_model: ['aircraft', 'aircraft model', 'model', 'plane'],
  registration: ['registration', 'reg', 'tail', 'tail number', 'tail no', 'ident'],
  off_block_utc: ['off block', 'off-block', 'out', 'block off', 'off block utc', 'out utc'],
  takeoff_utc: ['takeoff', 'take off', 'off', 'departure time', 'dep time', 'takeoff utc', 'atd'],
  landing_utc: ['landing', 'on', 'arrival time', 'arr time', 'landing utc', 'ata'],
  on_block_utc: ['on block', 'on-block', 'in', 'block on', 'on block utc', 'in utc'],
  flight_time: ['flight time', 'air time', 'airtime', 'duration', 'total time', 'time'],
  block_time: ['block time', 'block'],
  cruise_altitude_ft: ['cruise altitude', 'altitude', 'cruise alt', 'fl'],
  route: ['route', 'planned route'],
  role: ['role', 'function', 'position'],
  seat: ['seat'],
  simulator: ['simulator', 'sim', 'platform'],
  tags: ['tags', 'labels'],
  rating: ['rating', 'stars'],
  notes: ['notes', 'remarks', 'comments', 'memo'],
};
// export header for each key is the key itself
const norm = (s: string) => s.toLowerCase().replace(/[_\-]+/g, ' ').replace(/\s+/g, ' ').trim();

export function autoMap(headers: string[]): Record<CsvKey, string> {
  const map = {} as Record<CsvKey, string>;
  const used = new Set<string>();
  for (const { key } of CSV_FIELDS) {
    const exact = headers.find((h) => norm(h) === norm(key) && !used.has(h));
    const alias = exact ?? headers.find((h) => ALIASES[key].includes(norm(h)) && !used.has(h));
    map[key] = alias ?? '';
    if (alias) used.add(alias);
  }
  return map;
}

export interface ParsedCsv { headers: string[]; rows: Record<string, string>[]; errors: string[] }

export function parseCsv(text: string): ParsedCsv {
  const res = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ''), { header: true, skipEmptyLines: 'greedy', transformHeader: (h) => h.trim() });
  return {
    headers: res.meta.fields ?? [],
    rows: res.data,
    errors: res.errors.slice(0, 10).map((e) => `Row ${(e.row ?? 0) + 2}: ${e.message}`),
  };
}

function parseDate(v: string): string | null {
  const s = v.trim();
  if (isValidISODate(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s.slice(0, 10);
  for (const f of ['dd/MM/yyyy', 'd/M/yyyy', 'dd.MM.yyyy', 'MM/dd/yyyy', 'dd MMM yyyy', 'd MMM yyyy']) {
    const dt = DateTime.fromFormat(s, f);
    if (dt.isValid) return dt.toISODate();
  }
  return null;
}

function parseUtc(v: string, date: string, after: string | null): string | null {
  const s = v.trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{1,2}:\d{2}/.test(s)) {
    const dt = DateTime.fromISO(s.replace(' ', 'T'), { zone: 'utc' });
    return dt.isValid ? dt.toUTC().toISO({ suppressMilliseconds: true }) : null;
  }
  const m = s.match(/^(\d{1,2}):?(\d{2})Z?$/i);
  if (!m) return null;
  let dt = DateTime.fromISO(date, { zone: 'utc' }).set({ hour: Number(m[1]), minute: Number(m[2]) });
  if (!dt.isValid) return null;
  if (after && dt.toMillis() < Date.parse(after)) dt = dt.plus({ days: 1 });
  return dt.toISO({ suppressMilliseconds: true });
}

function airport(code: string): AirportRef | null {
  const a = findAirport(code);
  return a ? toRef(a) : null;
}

export interface RowResult { row: number; flight?: Flight; errors: string[]; warnings: string[]; duplicate: boolean }

export function rowsToFlights(rows: Record<string, string>[], map: Record<CsvKey, string>, existing: Flight[]): RowResult[] {
  const seen = new Set(existing.map(dupKey));
  return rows.map((r, i) => {
    const get = (k: CsvKey) => (map[k] ? (r[map[k]] ?? '').toString().trim() : '');
    const errors: string[] = [], warnings: string[] = [];
    const date = parseDate(get('date'));
    if (!date) errors.push(`Date "${get('date')}" is not recognised`);
    const depCode = get('departure'), arrCode = get('arrival');
    const dep = depCode ? airport(depCode) : null, arr = arrCode ? airport(arrCode) : null;
    if (!depCode) errors.push('Departure is missing');
    else if (!dep) errors.push(`Unknown departure airport "${depCode}"`);
    if (!arrCode) errors.push('Arrival is missing');
    else if (!arr) errors.push(`Unknown arrival airport "${arrCode}"`);
    if (errors.length || !date) return { row: i + 2, errors, warnings, duplicate: false };

    const f = emptyFlight();
    f.date = date;
    f.source = 'csv';
    f.dep = dep; f.arr = arr;
    f.flightNumber = get('flight_number');
    f.callsign = get('callsign');
    const cat = get('category').toLowerCase();
    const cats: FlightCategory[] = ['real', 'simulator', 'training', 'ferry', 'private', 'commercial', 'other'];
    f.category = (cats.find((c) => c === cat) ?? (cat.startsWith('sim') ? 'simulator' : cat ? 'other' : 'real')) as FlightCategory;
    if (cat && !cats.includes(cat as FlightCategory) && !cat.startsWith('sim')) warnings.push(`Category "${cat}" saved as Other`);
    const st = get('status').toLowerCase() as FlightStatus;
    f.status = (['completed', 'planned', 'cancelled', 'diverted', 'draft'] as FlightStatus[]).includes(st) ? st : 'completed';
    f.airline = get('airline');
    const tc = get('aircraft_type').toUpperCase();
    const t = aircraftType(tc);
    f.aircraft = { typeCode: tc, manufacturer: t?.manufacturer ?? '', model: get('aircraft_model') || t?.model || '', variant: '', registration: get('registration').toUpperCase(), nickname: '' };
    if (tc && !t) warnings.push(`Aircraft type "${tc}" is not in the built-in list`);
    f.times.offBlock = parseUtc(get('off_block_utc'), date, null);
    f.times.takeoff = parseUtc(get('takeoff_utc'), date, f.times.offBlock);
    f.times.landing = parseUtc(get('landing_utc'), date, f.times.takeoff ?? f.times.offBlock);
    f.times.onBlock = parseUtc(get('on_block_utc'), date, f.times.landing ?? f.times.takeoff ?? f.times.offBlock);
    const ft = parseDurationInput(get('flight_time')), bt = parseDurationInput(get('block_time'));
    if (ft != null) { f.flightMinutes = ft; f.flightMinutesSource = 'manual'; }
    else if (get('flight_time')) warnings.push(`Flight time "${get('flight_time')}" ignored`);
    if (bt != null) { f.blockMinutes = bt; f.blockMinutesSource = 'manual'; }
    const alt = Number(get('cruise_altitude_ft').replace(/^FL/i, ''));
    if (get('cruise_altitude_ft')) f.cruiseAltitudeFt = Number.isFinite(alt) ? (/^FL/i.test(get('cruise_altitude_ft')) ? alt * 100 : alt) : null;
    f.plannedRoute = get('route');
    const role = get('role').toLowerCase() as FlightRole;
    f.role = (['passenger', 'pic', 'sic', 'dual', 'instructor', 'observer', 'sim-pilot', 'cabin-crew'] as FlightRole[]).includes(role) ? role : '';
    f.seat = get('seat');
    f.simulator = get('simulator');
    f.tags = get('tags').split(/[;|]/).map((x) => x.trim()).filter(Boolean);
    const rating = Number(get('rating'));
    f.rating = rating >= 1 && rating <= 5 ? Math.round(rating) : null;
    f.notes = get('notes');
    const fin = finalizeFlight(f);
    const k = dupKey(fin);
    const duplicate = seen.has(k);
    seen.add(k);
    return { row: i + 2, flight: fin, errors, warnings, duplicate };
  });
}

const iso = (s: string | null) => (s ? s.replace('.000Z', 'Z') : '');

export function flightsToCsv(flights: Flight[]): string {
  const rows = flights.map((f) => ({
    date: f.date,
    departure: f.dep?.ident ?? '',
    arrival: f.arr?.ident ?? '',
    flight_number: f.flightNumber,
    callsign: f.callsign,
    category: f.category,
    status: f.status,
    airline: f.airline,
    aircraft_type: f.aircraft.typeCode,
    aircraft_model: aircraftLabel(f),
    registration: f.aircraft.registration,
    off_block_utc: iso(f.times.offBlock),
    takeoff_utc: iso(f.times.takeoff),
    landing_utc: iso(f.times.landing),
    on_block_utc: iso(f.times.onBlock),
    flight_time: f.flightMinutes != null ? fmtDuration(f.flightMinutes) : '',
    block_time: f.blockMinutes != null ? fmtDuration(f.blockMinutes) : '',
    cruise_altitude_ft: f.cruiseAltitudeFt ?? '',
    route: f.plannedRoute,
    role: f.role,
    seat: f.seat,
    simulator: f.simulator,
    tags: f.tags.join(';'),
    rating: f.rating ?? '',
    notes: f.notes,
    distance_km: f.distanceKm != null ? Math.round(f.distanceKm) : '',
  }));
  return Papa.unparse(rows, { columns: [...CSV_FIELDS.map((c) => c.key), 'distance_km'] });
}

export function csvTemplate(): string {
  return Papa.unparse({
    fields: CSV_FIELDS.map((c) => c.key),
    data: [[
      '2026-03-14', 'OMAA', 'WSSS', 'EY 470', 'ETD470', 'real', 'completed', 'Etihad Airways', 'B789', '', '', '', '02:05', '09:21', '', '', '', '', '', 'passenger', '32A', '', 'holiday', '5', 'Window seat, clear skies over the Bay of Bengal',
    ]],
  });
}
