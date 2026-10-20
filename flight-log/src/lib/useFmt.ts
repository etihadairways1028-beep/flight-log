import { useMemo } from 'react';
import { useStore } from '../store/useStore';
import { fmtAltitude, fmtDistance, fmtDistanceCompact, fmtSpeed, DIST_LABEL, kmTo } from './units';
import { fmtDate, fmtDuration, fmtInstant, safeZone, zoneOffsetLabel } from './time';
import type { Flight } from './types';

/** Settings-aware formatters. */
export function useFmt() {
  const s = useStore((x) => x.settings);
  return useMemo(() => ({
    s,
    dist: (km: number | null | undefined) => fmtDistance(km, s.distanceUnit),
    distNum: (km: number) => Math.round(kmTo(km, s.distanceUnit)),
    distCompact: (km: number) => fmtDistanceCompact(km, s.distanceUnit),
    distUnit: DIST_LABEL[s.distanceUnit],
    alt: (ft: number | null | undefined) => fmtAltitude(ft, s.altitudeUnit),
    speed: (kt: number | null | undefined) => fmtSpeed(kt, s.speedUnit),
    dur: (m: number | null | undefined) => fmtDuration(m, s.durationFormat),
    hours: (m: number) => (m / 60).toLocaleString('en-GB', { maximumFractionDigits: 1, minimumFractionDigits: m > 0 && m < 600 ? 1 : 0 }),
    date: (d: string | null | undefined) => fmtDate(d, s),
    /** time at an airport's local zone */
    timeAt: (iso: string | null, zone: string) => fmtInstant(iso, zone, s),
    /** time in the user's preferred display zone */
    time: (iso: string | null) => fmtInstant(iso, safeZone(s.timeZone), s),
    zone: (zone: string, iso?: string | null) => zoneOffsetLabel(zone, iso),
    reg: (f: Flight) => (s.privacyHideRegistrations ? '•••' : f.aircraft.registration || '—'),
  }), [s]);
}
