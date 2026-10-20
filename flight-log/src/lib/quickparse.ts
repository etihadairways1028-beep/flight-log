// Quick-entry parsers: IATA boarding-pass barcodes (BCBP, Resolution 792) and
// free text such as booking confirmations, e-tickets or "EY470 AUH-SIN 14 Mar 22:10".
// Parsers only read what is actually present — nothing is guessed silently; every
// recognised field is reported back so the person can review it before saving.
import { DateTime } from 'luxon';
import { findAirport, toRef } from './airports';
import { airlineByIata, airlineByIcao } from './airlines';
import { AIRCRAFT_TYPES, aircraftType, searchAircraftTypes } from './aircraftTypes';
import type { AirportRef } from './types';

export interface QuickResult {
  date?: string;            // YYYY-MM-DD (local departure date)
  flightNumber?: string;
  airline?: string;
  airlineCode?: string;
  dep?: AirportRef;
  arr?: AirportRef;
  depTime?: string;         // HH:mm local at departure
  arrTime?: string;         // HH:mm local at arrival
  arrDayOffset?: number;
  typeCode?: string;
  registration?: string;
  seat?: string;
  pnr?: string;
  passenger?: string;
  cabin?: string;
  recognised: string[];     // human-readable list of what was found
}

// ── Boarding pass (BCBP) ───────────────────────────────────────────────────
const CABIN: Record<string, string> = { F: 'First', A: 'First', P: 'First', J: 'Business', C: 'Business', D: 'Business', I: 'Business', Z: 'Business', W: 'Premium economy', E: 'Premium economy' };

/** Julian day-of-year → the closest matching calendar date to today (boarding passes omit the year). */
export function julianToDate(doy: number, today: DateTime = DateTime.local()): string | null {
  if (!(doy >= 1 && doy <= 366)) return null;
  const cands = [today.year - 1, today.year, today.year + 1]
    .map((y) => DateTime.fromObject({ year: y, month: 1, day: 1 }).plus({ days: doy - 1 }))
    .filter((d) => d.isValid && d.ordinal === doy);
  // prefer dates within the last ~11 months or next 2 months
  cands.sort((a, b) => Math.abs(a.diff(today, 'days').days + (a > today ? 120 : 0)) - Math.abs(b.diff(today, 'days').days + (b > today ? 120 : 0)));
  return cands[0]?.toISODate() ?? null;
}

export function looksLikeBcbp(s: string): boolean {
  return /^M[1-4].{20}[E ]/.test(s) && s.length >= 58;
}

export function parseBcbp(raw: string): QuickResult[] {
  const s = raw.replace(/\r?\n/g, '');
  if (!looksLikeBcbp(s)) throw new Error('This barcode isn’t an IATA boarding pass.');
  const legs = Number(s[1]);
  const passenger = s.slice(2, 22).trim().replace('/', ' / ');
  const out: QuickResult[] = [];
  let pos = 23;
  for (let i = 0; i < legs && pos + 37 <= s.length; i++) {
    const pnr = s.slice(pos, pos + 7).trim();
    const from = s.slice(pos + 7, pos + 10).trim();
    const to = s.slice(pos + 10, pos + 13).trim();
    const carrier = s.slice(pos + 13, pos + 16).trim();
    const fno = s.slice(pos + 16, pos + 21).trim().replace(/^0+(?=\d)/, '');
    const doy = Number(s.slice(pos + 21, pos + 24));
    const cabin = s.slice(pos + 24, pos + 25);
    const seat = s.slice(pos + 25, pos + 29).trim().replace(/^0+(?=\d)/, '');
    const varSize = parseInt(s.slice(pos + 35, pos + 37), 16) || 0;
    pos += 37 + varSize;
    const r: QuickResult = { recognised: ['boarding pass'], passenger, pnr };
    const a = findAirport(from), b = findAirport(to);
    if (a) { r.dep = toRef(a); r.recognised.push(`from ${from}`); }
    if (b) { r.arr = toRef(b); r.recognised.push(`to ${to}`); }
    if (carrier && fno) {
      r.flightNumber = `${carrier} ${fno}`;
      const al = airlineByIata(carrier);
      if (al) { r.airline = al.name; r.airlineCode = al.icao; }
      r.recognised.push(`flight ${r.flightNumber}`);
    }
    const d = julianToDate(doy);
    if (d) { r.date = d; r.recognised.push(`date ${d}`); }
    if (seat && seat !== '0000' && /\d/.test(seat)) { r.seat = seat; r.recognised.push(`seat ${seat}`); }
    if (CABIN[cabin]) { r.cabin = CABIN[cabin]; r.recognised.push(CABIN[cabin]); }
    out.push(r);
  }
  if (!out.length) throw new Error('The boarding pass didn’t contain a readable flight.');
  return out;
}

// ── Free text ──────────────────────────────────────────────────────────────
const MONTHS = 'jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december';

function parseDateText(t: string): string | undefined {
  let m: RegExpMatchArray | null;
  if ((m = t.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/))) return DateTime.fromISO(`${m[1]}-${m[2]}-${m[3]}`).toISODate() ?? undefined;
  if ((m = t.match(new RegExp(`\\b(\\d{1,2})\\s*(${MONTHS})\\.?\\s*,?\\s*(20\\d{2})?\\b`, 'i')))) {
    const y = m[3] ? Number(m[3]) : DateTime.local().year;
    const d = DateTime.fromFormat(`${m[1]} ${m[2].slice(0, 3)} ${y}`, 'd LLL yyyy', { locale: 'en' });
    if (d.isValid) return d.toISODate()!;
  }
  if ((m = t.match(new RegExp(`\\b(${MONTHS})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s*(20\\d{2})?\\b`, 'i')))) {
    const y = m[3] ? Number(m[3]) : DateTime.local().year;
    const d = DateTime.fromFormat(`${m[2]} ${m[1].slice(0, 3)} ${y}`, 'd LLL yyyy', { locale: 'en' });
    if (d.isValid) return d.toISODate()!;
  }
  if ((m = t.match(/\b(\d{1,2})[/.](\d{1,2})[/.](20\d{2})\b/))) {
    // day-first unless that's impossible
    const a = Number(m[1]), b = Number(m[2]);
    const d = a > 12 || b <= 12 ? DateTime.fromObject({ year: +m[3], month: b, day: a }) : DateTime.fromObject({ year: +m[3], month: a, day: b });
    if (d.isValid) return d.toISODate()!;
  }
  return undefined;
}

export function parseFreeText(text: string): QuickResult {
  const r: QuickResult = { recognised: [] };
  const t = text.replace(/\s+/g, ' ').trim();
  if (!t) return r;
  if (looksLikeBcbp(text.trim())) return parseBcbp(text.trim())[0];

  // airports: explicit "AAA-BBB" / "AAA → BBB" / "AAA to BBB" first
  let m = t.match(/\b([A-Z]{3,4})\s*(?:-|–|—|→|->|>|\/|\bto\b)\s*([A-Z]{3,4})\b/);
  let a = m ? findAirport(m[1]) : undefined, b = m ? findAirport(m[2]) : undefined;
  if (!a || !b) {
    // otherwise take the first two uppercase codes that are real airports, in order
    const codes = [...t.matchAll(/\(?\b([A-Z]{3}|[A-Z]{4})\b\)?/g)].map((x) => x[1]).filter((c) => !/^(THE|AND|FOR|PNR|REF|UTC|GMT|SEAT|GATE|TERM)$/.test(c));
    const found = codes.map((c) => findAirport(c)).filter(Boolean) as NonNullable<ReturnType<typeof findAirport>>[];
    const uniq = found.filter((x, i) => found.findIndex((y) => y.ident === x.ident) === i);
    if (uniq.length >= 2) { a = uniq[0]; b = uniq[1]; }
  }
  if (a && b && a.ident !== b.ident) { r.dep = toRef(a); r.arr = toRef(b); r.recognised.push(`route ${a.iata || a.ident}–${b.iata || b.ident}`); }

  // flight number: airline designator + digits, airline must exist
  for (const fm of t.matchAll(/\b([A-Z][A-Z0-9]|[A-Z0-9][A-Z])\s?(\d{1,4})\b/g)) {
    const al = airlineByIata(fm[1]);
    if (al) { r.flightNumber = `${fm[1]} ${fm[2]}`; r.airline = al.name; r.airlineCode = al.icao; r.recognised.push(`flight ${r.flightNumber} (${al.name})`); break; }
  }
  if (!r.flightNumber) {
    const im = t.match(/\b([A-Z]{3})(\d{1,4})\b/);
    const al = im ? airlineByIcao(im[1]) : undefined;
    if (im && al) { r.flightNumber = `${im[1]}${im[2]}`; r.airline = al.name; r.airlineCode = al.icao; r.recognised.push(`callsign ${r.flightNumber}`); }
  }

  const d = parseDateText(t);
  if (d) { r.date = d; r.recognised.push(`date ${d}`); }

  // times (24h or am/pm) — first is departure, second arrival
  const times = [...t.matchAll(/\b([01]?\d|2[0-3])[:.h]([0-5]\d)\s*(am|pm)?\b/gi)].map((x) => {
    let h = Number(x[1]);
    const ap = x[3]?.toLowerCase();
    if (ap === 'pm' && h < 12) h += 12;
    if (ap === 'am' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${x[2]}`;
  });
  if (times[0]) { r.depTime = times[0]; r.recognised.push(`departs ${times[0]}`); }
  if (times[1]) { r.arrTime = times[1]; r.recognised.push(`arrives ${times[1]}`); }
  const plus = t.match(/\+\s?(\d)\s*(?:day|d)?\b/i);
  if (plus) r.arrDayOffset = Number(plus[1]);

  // aircraft: ICAO designator or a model name like "787-9", "A350-900", "777-300ER"
  const icao = [...t.matchAll(/\b([A-Z][A-Z0-9]{2,3})\b/g)].map((x) => x[1]).find((c) => aircraftType(c) && !findAirport(c));
  if (icao) r.typeCode = icao;
  else {
    const model = t.match(/\b(A3[1-8]\d(?:-\d{3,4})?(?:neo)?|7[0-8]7(?:-\d{1,3}(?:ER|LR)?)?|737 MAX ?\d{1,2}|E1[79]\d|E2\d{2}|ATR ?7\d|Dash ?8|CRJ ?\d{3,4}|A220-[13]00)\b/i);
    if (model) {
      const hit = searchAircraftTypes(model[1], 1)[0];
      if (hit) r.typeCode = hit.code;
    }
  }
  if (r.typeCode) r.recognised.push(`aircraft ${r.typeCode}`);

  const reg = t.match(/\b([A-Z]{1,2}-[A-Z0-9]{3,5}|N[1-9]\d{0,4}[A-Z]{0,2})\b/);
  if (reg && !/^N\d{1,3}$/.test(reg[1])) { r.registration = reg[1]; r.recognised.push(`registration ${reg[1]}`); }

  const seat = t.match(/\bseat\s*:?\s*(\d{1,2}[A-K])\b/i);
  if (seat) { r.seat = seat[1].toUpperCase(); r.recognised.push(`seat ${r.seat}`); }

  const pnr = t.match(/\b(?:PNR|booking (?:ref(?:erence)?|code)|confirmation(?: code)?)\s*:?\s*([A-Z0-9]{6})\b/i);
  if (pnr) r.pnr = pnr[1].toUpperCase();
  return r;
}

export const KNOWN_TYPES = AIRCRAFT_TYPES.length;
