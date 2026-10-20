// SimBrief integration — fetches the latest OFP for a SimBrief username via the
// public XML fetcher (https://www.simbrief.com/api/xml.fetcher.php?username=…&json=1).
// No API key is needed for reading your own latest flight plan. Requests go straight
// from the browser; if SimBrief blocks the request (CORS / network), we report it.
import type { Flight } from './types';
import { emptyFlight, finalizeFlight } from './flight';
import { findAirport, toRef } from './airports';
import { aircraftType } from './aircraftTypes';
import { DateTime } from 'luxon';

export async function fetchLatestOfp(username: string): Promise<Flight> {
  const u = username.trim();
  if (!u) throw new Error('Enter your SimBrief username first.');
  let res: Response;
  try {
    res = await fetch(`https://www.simbrief.com/api/xml.fetcher.php?username=${encodeURIComponent(u)}&json=1`, { headers: { Accept: 'application/json' } });
  } catch {
    throw new Error('Could not reach SimBrief from your browser (network or cross-origin block). Try again later, or import the OFP as CSV.');
  }
  if (res.status === 400 || res.status === 404) throw new Error(`SimBrief has no flight plan for “${u}”. Check the username (not your Navigraph email).`);
  if (res.status === 429) throw new Error('SimBrief is rate-limiting requests. Wait a minute and try again.');
  if (!res.ok) throw new Error(`SimBrief returned HTTP ${res.status}.`);
  const j = await res.json().catch(() => null);
  if (!j || j.fetch?.status && !/success/i.test(j.fetch.status)) throw new Error(j?.fetch?.status || 'SimBrief returned an unexpected response.');

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
  f.notes = `Imported from SimBrief OFP${j.params?.request_id ? ` #${j.params.request_id}` : ''}. Add your actual times after the flight.`;
  f.simulator = '';
  f.role = 'sim-pilot';
  f.tags = ['simbrief'];
  return finalizeFlight(f);
}
