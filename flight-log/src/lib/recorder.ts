// Automatic flight recorder. Pure functions: feed telemetry samples in, get flight
// events (off-block, takeoff, landing, on-block), a simplified track and statistics out.
import type { Flight, Settings, TrackPoint, AirportRef } from './types';
import { emptyPilot } from './types';
import { haversineKm } from './geo';
import { allAirports, toRef } from './airports';
import { emptyFlight, finalizeFlight } from './flight';
import { aircraftType } from './aircraftTypes';
import { estimateNightMinutes, isNight } from './pilot';

export interface Sample {
  t: number;            // unix seconds
  lat: number; lon: number;
  altFt: number; aglFt: number;
  gsKt: number; iasKt: number; hdg: number; vsFpm: number;
  onGround: boolean; parkingBrake: boolean; engines: number; paused: boolean;
}

export type Phase = 'waiting' | 'preflight' | 'taxi-out' | 'airborne' | 'taxi-in' | 'arrived';

export interface RecState {
  phase: Phase;
  sim: string;
  aircraft: string;
  test: boolean;
  startedAt: number | null;
  offBlock: number | null;
  takeoff: number | null;
  landing: number | null;
  onBlock: number | null;
  takeoffs: number;          // incl. touch-and-goes
  landings: number;
  nightTakeoffs: number;
  nightLandings: number;
  landingVs: number | null;  // fpm at the final touchdown
  track: TrackPoint[];
  distNm: number;
  maxAltFt: number;
  maxGsKt: number;
  airborneSec: number;
  last: Sample | null;
  vsWindow: [number, number][];  // [t, vs] for the last few seconds
  stillSince: number | null;
  joinedAirborne: boolean;
}

export const newRecording = (): RecState => ({
  phase: 'waiting', sim: '', aircraft: '', test: false, startedAt: null, offBlock: null, takeoff: null, landing: null, onBlock: null,
  takeoffs: 0, landings: 0, nightTakeoffs: 0, nightLandings: 0, landingVs: null, track: [], distNm: 0, maxAltFt: 0, maxGsKt: 0,
  airborneSec: 0, last: null, vsWindow: [], stillSince: null, joinedAirborne: false,
});

const LIFTOFF_KT = 30;

function addPoint(st: RecState, s: Sample, force = false) {
  const p = st.track[st.track.length - 1];
  const air = !s.onGround;
  const due = !p || force || s.t - p.t >= (air ? 15 : 30) || Math.abs(s.altFt - p.altFt) > 500 || (st.last && Math.abs(((s.hdg - st.last.hdg + 540) % 360) - 180) > 8 && s.t - p.t >= 3);
  if (due) st.track.push({ t: Math.round(s.t), lat: +s.lat.toFixed(5), lon: +s.lon.toFixed(5), altFt: Math.round(s.altFt), gsKt: Math.round(s.gsKt) });
  if (st.track.length > 4000) st.track = st.track.filter((_, i) => i % 2 === 0 || i === st.track.length - 1);
}

/** Advance the recorder with one telemetry sample. Returns a new state (does not mutate the input). */
export function step(prev: RecState, s: Sample): RecState {
  if (s.paused || !Number.isFinite(s.lat) || !Number.isFinite(s.lon)) return prev;
  const st: RecState = { ...prev, track: prev.track, vsWindow: [...prev.vsWindow.filter(([t]) => s.t - t <= 4), [s.t, s.vsFpm]] };
  const night = (t: number) => isNight(new Date(t * 1000), s.lat, s.lon);
  const l = prev.last;

  if (l) {
    const dt = s.t - l.t;
    if (dt > 0 && dt <= 300 && s.gsKt > 2) st.distNm += haversineKm(l.lat, l.lon, s.lat, s.lon) / 1.852;
    if (!s.onGround && dt > 0 && dt <= 300) st.airborneSec += dt;
  }
  st.maxAltFt = Math.max(st.maxAltFt, s.onGround ? 0 : s.altFt);
  st.maxGsKt = Math.max(st.maxGsKt, s.gsKt);

  switch (prev.phase) {
    case 'waiting':
      st.startedAt = s.t;
      if (s.onGround) st.phase = s.gsKt > 3 ? 'taxi-out' : 'preflight';
      else { st.phase = 'airborne'; st.joinedAirborne = true; }
      if (st.phase === 'taxi-out') st.offBlock = s.t;
      addPoint(st, s, true);
      break;
    case 'preflight':
      if (s.gsKt > 3 && (!s.parkingBrake || s.gsKt > 6)) { st.phase = 'taxi-out'; st.offBlock = s.t; addPoint(st, s, true); }
      if (!s.onGround && s.gsKt > LIFTOFF_KT) { st.phase = 'airborne'; st.offBlock ??= s.t; st.takeoff = s.t; st.takeoffs++; if (night(s.t)) st.nightTakeoffs++; addPoint(st, s, true); }
      break;
    case 'taxi-out':
      if (!s.onGround && s.gsKt > LIFTOFF_KT) { st.phase = 'airborne'; st.takeoff = s.t; st.takeoffs++; if (night(s.t)) st.nightTakeoffs++; addPoint(st, s, true); }
      else addPoint(st, s);
      break;
    case 'airborne':
      if (s.onGround) {
        st.phase = 'taxi-in';
        st.landing = s.t;
        st.landings++;
        if (night(s.t)) st.nightLandings++;
        // touchdown rate: steepest descent in the last ~1.5 s before contact (the bridge sends 4 samples/s)
        const vs = st.vsWindow.filter(([t]) => s.t - t <= 1.5 && t < s.t).map(([, v]) => v);
        const lastAir = prev.last && !prev.last.onGround ? prev.last.vsFpm : null;
        st.landingVs = vs.length ? Math.round(Math.min(...vs, 0)) : lastAir != null ? Math.round(Math.min(lastAir, 0)) : null;
        addPoint(st, s, true);
      } else addPoint(st, s);
      break;
    case 'taxi-in':
      if (!s.onGround && s.gsKt > LIFTOFF_KT) { st.phase = 'airborne'; st.takeoffs++; if (night(s.t)) st.nightTakeoffs++; addPoint(st, s, true); break; } // touch-and-go
      if (s.gsKt < 1 && (s.parkingBrake || s.engines === 0)) {
        st.stillSince ??= s.t;
        if (s.t - st.stillSince >= 5) { st.phase = 'arrived'; st.onBlock = st.stillSince; addPoint(st, s, true); }
      } else st.stillSince = null;
      addPoint(st, s);
      break;
    case 'arrived':
      // a new departure after arriving starts a fresh leg — handled by the UI (save first)
      break;
  }
  st.last = s;
  return st;
}

export function nearestAirport(lat: number, lon: number, maxKm = 8): AirportRef | null {
  let best: { d: number; a: ReturnType<typeof allAirports>[number] } | null = null;
  for (const a of allAirports()) {
    if (a.lat == null || a.lon == null || Math.abs(a.lat - lat) > 0.2) continue;
    const d = haversineKm(lat, lon, a.lat, a.lon);
    if (d <= maxKm && (!best || d < best.d)) best = { d, a };
  }
  return best ? toRef(best.a) : null;
}

export function landingRating(fpm: number | null): { label: string; tone: 'good' | 'ok' | 'warn' | 'bad' } | null {
  if (fpm == null) return null;
  const v = Math.abs(fpm);
  if (v < 120) return { label: 'Butter', tone: 'good' };
  if (v < 250) return { label: 'Smooth', tone: 'good' };
  if (v < 400) return { label: 'Firm', tone: 'ok' };
  if (v < 600) return { label: 'Hard', tone: 'warn' };
  return { label: 'Very hard', tone: 'bad' };
}

const iso = (t: number | null) => (t == null ? null : new Date(t * 1000).toISOString().replace('.000Z', 'Z'));

/** Build a Flight from a recording, optionally completing a planned flight. */
export function recordingToFlight(st: RecState, settings: Settings, base?: Flight | null): Flight {
  const f: Flight = base ? structuredClone(base) : emptyFlight({ ...settings, defaultCategory: 'simulator' });
  const first = st.track[0], lastP = st.track[st.track.length - 1];
  f.category = base?.category ?? 'simulator';
  f.status = 'completed';
  f.source = base ? base.source : 'sim';
  if (first) f.dep = nearestAirport(first.lat, first.lon) ?? f.dep;
  if (lastP && (st.landing || st.phase === 'arrived')) f.arr = nearestAirport(lastP.lat, lastP.lon) ?? f.arr;
  f.times = { ...f.times, offBlock: iso(st.offBlock), takeoff: iso(st.takeoff), landing: iso(st.landing), onBlock: iso(st.onBlock) };
  f.flightMinutesSource = null; f.blockMinutesSource = null;
  const startT = st.offBlock ?? st.takeoff ?? st.startedAt;
  if (startT && f.dep?.tz) {
    const local = new Date(startT * 1000).toLocaleDateString('en-CA', { timeZone: f.dep.tz });
    if (/^\d{4}-\d{2}-\d{2}$/.test(local)) f.date = local;
  }
  const tc = st.aircraft.toUpperCase();
  if (aircraftType(tc) && (!base || !f.aircraft.typeCode)) { const t = aircraftType(tc)!; f.aircraft = { ...f.aircraft, typeCode: t.code, manufacturer: t.manufacturer, model: t.model }; }
  f.simulator = st.test ? 'Bridge test' : st.sim.startsWith('X-Plane') ? st.sim : st.sim === 'MSFS' ? (/2020|2024/.test(settings.defaultSimulator) ? settings.defaultSimulator : 'MSFS 2024') : f.simulator || st.sim;
  f.recordedDistanceKm = Math.round(st.distNm * 1.852);
  f.cruiseAltitudeFt = st.maxAltFt ? Math.round(st.maxAltFt / 100) * 100 : f.cruiseAltitudeFt;
  if (f.cruiseAltitudeFt && f.cruiseAltitudeFt >= 18000) f.flightLevel = `FL${Math.round(f.cruiseAltitudeFt / 100)}`;
  f.avgGroundSpeedKt = st.airborneSec > 60 ? Math.round((st.distNm / (st.airborneSec / 3600)) * 0.98) : null;
  f.maxGroundSpeedKt = st.maxGsKt ? Math.round(st.maxGsKt) : null;
  f.takeoffsDay = st.takeoffs - st.nightTakeoffs; f.takeoffsNight = st.nightTakeoffs;
  f.landingsDay = st.landings - st.nightLandings; f.landingsNight = st.nightLandings;
  f.landingRateFpm = st.landingVs;
  f.track = st.track.length > 800 ? st.track.filter((_, i) => i % Math.ceil(st.track.length / 800) === 0 || i === st.track.length - 1) : st.track;
  f.role = f.role || 'sim-pilot';
  f.tags = [...new Set([...(f.tags ?? []), 'recorded'])];
  if (st.test) { f.tags.push('bridge-test'); f.notes = [f.notes, 'TEST RECORDING — produced by the bridge’s --test mode, not a real sim session.'].filter(Boolean).join('\n'); }
  const fin = finalizeFlight(f);
  const night = estimateNightMinutes(fin);
  fin.pilot = { ...emptyPilot(), ...fin.pilot, pic: fin.pilot?.pic ?? fin.flightMinutes, night: fin.pilot?.night ?? (night || null) };
  return fin;
}

export const PHASE_LABEL: Record<Phase, string> = {
  waiting: 'Waiting for data', preflight: 'At the gate', 'taxi-out': 'Taxiing out', airborne: 'Airborne', 'taxi-in': 'Taxiing in', arrived: 'Arrived',
};
