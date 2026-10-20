import { DateTime } from 'luxon';
import type { Flight, Settings } from './types';

export const DAY_MS = 86_400_000;

/** Validate an IANA zone, falling back to UTC. */
export function safeZone(zone: string | null | undefined): string {
  if (!zone) return 'UTC';
  if (zone === 'local') return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  return DateTime.local().setZone(zone).isValid ? zone : 'UTC';
}

/**
 * Convert a wall-clock time at an airport into a UTC instant.
 * `date` is YYYY-MM-DD, `time` HH:mm, `dayOffset` shifts the date (overnight flights).
 */
export function wallToUtc(date: string, time: string, zone: string, dayOffset = 0): string | null {
  if (!date || !/^\d{1,2}:\d{2}$/.test(time)) return null;
  const [h, m] = time.split(':').map(Number);
  if (h > 23 || m > 59) return null;
  const dt = DateTime.fromISO(date, { zone: safeZone(zone) }).plus({ days: dayOffset }).set({ hour: h, minute: m, second: 0, millisecond: 0 });
  return dt.isValid ? dt.toUTC().toISO({ suppressMilliseconds: true }) : null;
}

/** Split a UTC instant into wall-clock parts at a zone, relative to a reference date. */
export function utcToWall(iso: string | null, zone: string, refDate: string): { time: string; dayOffset: number } {
  if (!iso) return { time: '', dayOffset: 0 };
  const dt = DateTime.fromISO(iso, { zone: 'utc' }).setZone(safeZone(zone));
  if (!dt.isValid) return { time: '', dayOffset: 0 };
  const ref = DateTime.fromISO(refDate, { zone: safeZone(zone) }).startOf('day');
  const dayOffset = Math.round(dt.startOf('day').diff(ref, 'days').days);
  return { time: dt.toFormat('HH:mm'), dayOffset: Number.isFinite(dayOffset) ? dayOffset : 0 };
}

export function minutesBetween(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  const ta = Date.parse(a), tb = Date.parse(b);
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return null;
  const m = Math.round((tb - ta) / 60000);
  return m >= 0 ? m : null;
}

/** Recalculate derived durations. Manual durations survive when timestamps are missing; block time is never inferred from flight time. */
export function deriveDurations(f: Flight): Pick<Flight, 'flightMinutes' | 'flightMinutesSource' | 'blockMinutes' | 'blockMinutesSource'> {
  const fm = minutesBetween(f.times.takeoff, f.times.landing);
  const bm = minutesBetween(f.times.offBlock, f.times.onBlock);
  return {
    flightMinutes: fm ?? (f.flightMinutesSource === 'manual' ? f.flightMinutes : null),
    flightMinutesSource: fm != null ? 'computed' : f.flightMinutesSource === 'manual' && f.flightMinutes != null ? 'manual' : null,
    blockMinutes: bm ?? (f.blockMinutesSource === 'manual' ? f.blockMinutes : null),
    blockMinutesSource: bm != null ? 'computed' : f.blockMinutesSource === 'manual' && f.blockMinutes != null ? 'manual' : null,
  };
}

/** Timing sanity checks that block saving obviously wrong sequences. */
export function timingIssues(f: Flight): string[] {
  const out: string[] = [];
  const seq: [keyof Flight['times'], string][] = [['offBlock', 'Off-block'], ['takeoff', 'Takeoff'], ['landing', 'Landing'], ['onBlock', 'On-block']];
  const known = seq.filter(([k]) => f.times[k]);
  for (let i = 1; i < known.length; i++) {
    const a = Date.parse(f.times[known[i - 1][0]]!), b = Date.parse(f.times[known[i][0]]!);
    if (b < a) out.push(`${known[i][1]} is earlier than ${known[i - 1][1].toLowerCase()}. Check the day (+1) or time zone.`);
  }
  const fm = minutesBetween(f.times.takeoff, f.times.landing);
  if (fm != null && fm > 22 * 60) out.push('Flight time is longer than 22 hours. Check the dates.');
  const bm = minutesBetween(f.times.offBlock, f.times.onBlock);
  if (bm != null && fm != null && bm < fm) out.push('Block time is shorter than flight time.');
  return out;
}

export function parseDurationInput(s: string): number | null {
  const v = s.trim();
  if (!v) return null;
  let m: RegExpMatchArray | null;
  if ((m = v.match(/^(\d{1,3}):(\d{1,2})$/))) return Number(m[1]) * 60 + Number(m[2]);
  if ((m = v.match(/^(\d{1,3})\s*h(?:\s*(\d{1,2})\s*m?)?$/i))) return Number(m[1]) * 60 + Number(m[2] || 0);
  if ((m = v.match(/^(\d{1,3})\s*m(in)?$/i))) return Number(m[1]);
  if ((m = v.match(/^(\d{1,3}(?:\.\d+)?)$/))) return Math.round(Number(m[1]) * 60);
  return null;
}

export function fmtDuration(min: number | null | undefined, format: Settings['durationFormat'] = 'hm'): string {
  if (min == null || !Number.isFinite(min)) return '—';
  if (format === 'decimal') return (min / 60).toFixed(1);
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return `${h}:${String(m).padStart(2, '0')}`;
}
/** Long-form, e.g. 7h 25m */
export function fmtDurationLong(min: number | null | undefined): string {
  if (min == null || !Number.isFinite(min)) return '—';
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
}
export function fmtHours(min: number, digits = 1): string {
  if (!Number.isFinite(min)) return '—';
  return (min / 60).toLocaleString('en-GB', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function fmtDate(date: string | null | undefined, s: Pick<Settings, 'dateFormat'>): string {
  if (!date) return '—';
  const dt = DateTime.fromISO(date.slice(0, 10));
  return dt.isValid ? dt.toFormat(s.dateFormat) : '—';
}

export function fmtInstant(iso: string | null, zone: string, s: Pick<Settings, 'timeFormat'>): string {
  if (!iso) return '—';
  const dt = DateTime.fromISO(iso, { zone: 'utc' }).setZone(safeZone(zone));
  if (!dt.isValid) return '—';
  return dt.toFormat(s.timeFormat === '12h' ? 'h:mm a' : 'HH:mm');
}

export function zoneOffsetLabel(zone: string, iso?: string | null): string {
  const z = safeZone(zone);
  const dt = (iso ? DateTime.fromISO(iso, { zone: 'utc' }) : DateTime.utc()).setZone(z);
  if (!dt.isValid) return 'UTC';
  const off = dt.offset;
  const sign = off >= 0 ? '+' : '−';
  const h = Math.floor(Math.abs(off) / 60), m = Math.abs(off) % 60;
  return `UTC${sign}${h}${m ? ':' + String(m).padStart(2, '0') : ''}`;
}

export function todayISO(): string {
  return DateTime.local().toISODate()!;
}

export function isValidISODate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && DateTime.fromISO(s).isValid;
}

/** The date a flight is grouped under on calendars. */
export function calendarDate(f: Flight, convention: Settings['calendarConvention']): string {
  if (convention === 'utc') {
    const t = f.times.offBlock || f.times.takeoff || f.times.schedOut;
    if (t) return DateTime.fromISO(t, { zone: 'utc' }).toISODate() || f.date;
  }
  return f.date;
}

export function monthKey(date: string): string {
  return date.slice(0, 7);
}

export function monthLabel(key: string, long = false): string {
  const dt = DateTime.fromISO(key + '-01');
  return dt.isValid ? dt.toFormat(long ? 'LLLL yyyy' : 'LLL yy') : key;
}

/** Inclusive list of month keys between two YYYY-MM keys. */
export function monthRange(fromKey: string, toKey: string): string[] {
  const out: string[] = [];
  let d = DateTime.fromISO(fromKey + '-01');
  const end = DateTime.fromISO(toKey + '-01');
  if (!d.isValid || !end.isValid) return out;
  let guard = 0;
  while (d <= end && guard++ < 1200) {
    out.push(d.toFormat('yyyy-MM'));
    d = d.plus({ months: 1 });
  }
  return out;
}
