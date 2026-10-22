import type { AltitudeUnit, DistanceUnit, SpeedUnit } from './types';

export const KM_PER_NM = 1.852;
export const KM_PER_MI = 1.609344;
export const M_PER_FT = 0.3048;
export const KMH_PER_KT = 1.852;
export const MPH_PER_KT = 1.150779448;

export function kmTo(km: number, unit: DistanceUnit): number {
  if (unit === 'nm') return km / KM_PER_NM;
  if (unit === 'mi') return km / KM_PER_MI;
  return km;
}
export function toKm(v: number, unit: DistanceUnit): number {
  if (unit === 'nm') return v * KM_PER_NM;
  if (unit === 'mi') return v * KM_PER_MI;
  return v;
}
export function ftTo(ft: number, unit: AltitudeUnit): number {
  return unit === 'm' ? ft * M_PER_FT : ft;
}
export function toFt(v: number, unit: AltitudeUnit): number {
  return unit === 'm' ? v / M_PER_FT : v;
}
export function ktTo(kt: number, unit: SpeedUnit): number {
  if (unit === 'kmh') return kt * KMH_PER_KT;
  if (unit === 'mph') return kt * MPH_PER_KT;
  return kt;
}
export function toKt(v: number, unit: SpeedUnit): number {
  if (unit === 'kmh') return v / KMH_PER_KT;
  if (unit === 'mph') return v / MPH_PER_KT;
  return v;
}

export const DIST_LABEL: Record<DistanceUnit, string> = { km: 'km', nm: 'NM', mi: 'mi' };
export const ALT_LABEL: Record<AltitudeUnit, string> = { ft: 'ft', m: 'm' };
export const SPEED_LABEL: Record<SpeedUnit, string> = { kt: 'kt', kmh: 'km/h', mph: 'mph' };

const nf0 = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 });

export function fmtInt(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return nf0.format(Math.round(n));
}
export function fmt1(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return nf1.format(n);
}
export function fmtDistance(km: number | null | undefined, unit: DistanceUnit, withUnit = true): string {
  if (km == null || !Number.isFinite(km)) return '—';
  const v = kmTo(km, unit);
  return withUnit ? `${nf0.format(Math.round(v))} ${DIST_LABEL[unit]}` : nf0.format(Math.round(v));
}
export function fmtAltitude(ft: number | null | undefined, unit: AltitudeUnit): string {
  if (ft == null || !Number.isFinite(ft)) return '—';
  return `${nf0.format(Math.round(ftTo(ft, unit)))} ${ALT_LABEL[unit]}`;
}
export function fmtSpeed(kt: number | null | undefined, unit: SpeedUnit): string {
  if (kt == null || !Number.isFinite(kt)) return '—';
  return `${nf0.format(Math.round(ktTo(kt, unit)))} ${SPEED_LABEL[unit]}`;
}
/** Compact distance for big totals, e.g. 128.4k km */
export function fmtDistanceCompact(km: number, unit: DistanceUnit): string {
  if (!Number.isFinite(km)) return '—';
  const v = kmTo(km, unit);
  if (v >= 1_000_000) return `${nf1.format(v / 1_000_000)}M`;
  if (v >= 10_000) return `${nf1.format(v / 1000)}k`;
  return nf0.format(Math.round(v));
}

/** "1 flight", "2 flights", "1 country", "3 countries". */
export function plural(n: number, word: string, many?: string): string {
  const p = many ?? (word.endsWith('y') && !/[aeiou]y$/.test(word) ? word.slice(0, -1) + 'ies' : word + 's');
  return `${typeof n === 'number' ? n.toLocaleString('en-GB') : n} ${n === 1 ? word : p}`;
}
