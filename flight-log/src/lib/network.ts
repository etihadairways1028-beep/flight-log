// VATSIM and IVAO live tracking. Looks up your pilot connection by CID/VID in the
// networks' public data feeds, every 20 seconds, either directly from the browser or
// (when the browser isn't allowed to read the feed) through the Flight Log bridge.
// Position reports are fed into the same flight recorder as the simulator link, so a
// network flight can be logged automatically. Nothing is invented: when you're not
// connected to the network, the status simply says so.
import { create } from 'zustand';
import type { Flight, Settings } from './types';
import { newRecording, step, recordingToFlight, type RecState, type Sample } from './recorder';
import { useSim } from './simLink';
import { emptyFlight } from './flight';
import { findAirport, toRef } from './airports';
import { aircraftType } from './aircraftTypes';
import { parseRouteString, routeToPlan } from './planExport';

export type Network = 'vatsim' | 'ivao';
export const NETWORK_LABEL: Record<Network, string> = { vatsim: 'VATSIM', ivao: 'IVAO' };
const FEED: Record<Network, string> = { vatsim: 'https://data.vatsim.net/v3/vatsim-data.json', ivao: 'https://api.ivao.aero/v2/tracker/whazzup' };
const POLL_MS = 20000;

export interface NetPilot {
  network: Network;
  id: string;
  callsign: string;
  name: string;
  lat: number; lon: number;
  altFt: number; gsKt: number; hdg: number;
  squawk: string;
  dep: string; arr: string; altn: string;
  aircraft: string;          // ICAO type
  route: string;
  cruise: string;            // e.g. FL350
  rules: string;             // I / V
  logon: string | null;
  t: number;                 // unix seconds of the report
}

const s = (v: unknown) => (typeof v === 'string' ? v : v == null || typeof v === 'object' ? '' : String(v));
const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const typeOf = (raw: string) => { const m = s(raw).toUpperCase().match(/(?:^|\/)([A-Z][A-Z0-9]{1,3})(?:\/|-|$)/); return m ? m[1] : s(raw).toUpperCase().slice(0, 4); };

export function parseVatsimPilot(p: any): NetPilot | null {
  if (!p || !Number.isFinite(+p.latitude) || !Number.isFinite(+p.longitude)) return null;
  const fp = p.flight_plan || {};
  const alt = s(fp.altitude);
  return {
    network: 'vatsim', id: s(p.cid), callsign: s(p.callsign), name: s(p.name),
    lat: +p.latitude, lon: +p.longitude, altFt: n(p.altitude), gsKt: n(p.groundspeed), hdg: n(p.heading), squawk: s(p.transponder),
    dep: s(fp.departure).toUpperCase(), arr: s(fp.arrival).toUpperCase(), altn: s(fp.alternate).toUpperCase(),
    aircraft: s(fp.aircraft_short) || typeOf(fp.aircraft_faa || fp.aircraft), route: s(fp.route),
    cruise: /^\d+$/.test(alt) ? (+alt >= 18000 ? `FL${Math.round(+alt / 100)}` : `${alt} ft`) : alt, rules: s(fp.flight_rules),
    logon: s(p.logon_time) || null, t: Date.parse(s(p.last_updated)) / 1000 || Date.now() / 1000,
  };
}

export function parseIvaoPilot(p: any): NetPilot | null {
  const tr = p?.lastTrack;
  if (!tr || !Number.isFinite(+tr.latitude) || !Number.isFinite(+tr.longitude)) return null;
  const fp = p.flightPlan || {};
  const lvl = s(fp.level);
  return {
    network: 'ivao', id: s(p.userId), callsign: s(p.callsign), name: '',
    lat: +tr.latitude, lon: +tr.longitude, altFt: n(tr.altitude), gsKt: n(tr.groundSpeed), hdg: n(tr.heading), squawk: s(tr.transponder),
    dep: s(fp.departureId).toUpperCase(), arr: s(fp.arrivalId).toUpperCase(), altn: s(fp.alternativeId).toUpperCase(),
    aircraft: s(fp.aircraft?.icaoCode) || s(fp.aircraftId), route: s(fp.route),
    cruise: /^F\d+$/.test(lvl) ? `FL${lvl.slice(1)}` : lvl, rules: s(fp.flightRules),
    logon: s(p.createdAt) || null, t: Date.parse(s(tr.timestamp)) / 1000 || Date.now() / 1000,
  };
}

/** Find one pilot in a full feed. */
export function findPilot(network: Network, feed: any, id: string): NetPilot | null {
  const list = network === 'vatsim' ? feed?.pilots : feed?.clients?.pilots;
  const p = Array.isArray(list) ? list.find((x: any) => String(network === 'vatsim' ? x.cid : x.userId) === id) : null;
  return p ? (network === 'vatsim' ? parseVatsimPilot(p) : parseIvaoPilot(p)) : null;
}

type Status = 'off' | 'searching' | 'online' | 'offline' | 'error';

interface NetState {
  network: Network;
  id: string;
  status: Status;
  message: string;
  via: 'direct' | 'bridge' | null;
  pilot: NetPilot | null;
  lastCheck: number | null;
  rec: RecState;
  recording: boolean;
  lastPilot: NetPilot | null;     // flight plan of the recording (kept after disconnect)
  start(network: Network, id: string): void;
  stop(): void;
  reset(): void;
  toFlight(settings: Settings, base?: Flight | null): Flight;
}

let timer: ReturnType<typeof setTimeout> | null = null;
let directBlocked: Partial<Record<Network, boolean>> = {};
let prevAlt: { t: number; alt: number } | null = null;
const REC_KEY = 'skylog:net-recording';

async function lookup(network: Network, id: string): Promise<{ pilot: NetPilot | null; via: 'direct' | 'bridge' }> {
  if (!directBlocked[network]) {
    try {
      const r = await fetch(FEED[network], { cache: 'no-store' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return { pilot: findPilot(network, await r.json(), id), via: 'direct' };
    } catch {
      directBlocked[network] = true; // most likely a cross-origin block: use the bridge from now on
    }
  }
  const res = await useSim.getState().netFetch(network, id);
  if (!res.ok) throw new Error(res.message || 'Lookup failed');
  return { pilot: res.pilot ? (network === 'vatsim' ? parseVatsimPilot(res.pilot) : parseIvaoPilot(res.pilot)) : null, via: 'bridge' };
}

const saved = (): Pick<NetState, 'rec' | 'recording' | 'lastPilot'> => {
  try { const v = JSON.parse(localStorage.getItem(REC_KEY) || 'null'); if (v?.rec?.track) return v; } catch { /* ignore */ }
  return { rec: newRecording(), recording: false, lastPilot: null };
};
const persist = (st: Pick<NetState, 'rec' | 'recording' | 'lastPilot'>) => { try { localStorage.setItem(REC_KEY, JSON.stringify({ rec: st.rec, recording: st.recording, lastPilot: st.lastPilot })); } catch { /* ignore */ } };

export const useNet = create<NetState>((set, get) => ({
  network: 'vatsim',
  id: '',
  status: 'off',
  message: '',
  via: null,
  pilot: null,
  lastCheck: null,
  ...saved(),

  start(network, id) {
    if (timer) clearTimeout(timer);
    const cid = id.trim();
    if (!/^\d{3,9}$/.test(cid)) { set({ status: 'error', message: `Enter your ${NETWORK_LABEL[network]} ${network === 'vatsim' ? 'CID' : 'VID'} (numbers only).` }); return; }
    set({ network, id: cid, status: 'searching', message: `Looking for ${cid} on ${NETWORK_LABEL[network]}…` });
    const poll = async () => {
      const st = get();
      if (st.status === 'off') return;
      try {
        const { pilot, via } = await lookup(network, cid);
        if (get().status === 'off') return;
        if (pilot) {
          let { rec, recording, lastPilot } = get();
          if (!recording) { rec = newRecording(); recording = true; prevAlt = null; }
          if (rec.phase !== 'arrived') {
            const vs = prevAlt && pilot.t > prevAlt.t ? ((pilot.altFt - prevAlt.alt) / (pilot.t - prevAlt.t)) * 60 : 0;
            prevAlt = { t: pilot.t, alt: pilot.altFt };
            const sample: Sample = { t: pilot.t, lat: pilot.lat, lon: pilot.lon, altFt: pilot.altFt, aglFt: 0, gsKt: pilot.gsKt, iasKt: pilot.gsKt, hdg: pilot.hdg, vsFpm: vs, onGround: pilot.gsKt < 40, parkingBrake: pilot.gsKt < 1, engines: 1, paused: false };
            if (!rec.last || sample.t > rec.last.t) rec = step({ ...rec, sim: NETWORK_LABEL[network], aircraft: pilot.aircraft }, sample);
          }
          const next = { rec, recording, lastPilot: pilot };
          persist(next);
          set({ ...next, pilot, via, status: 'online', lastCheck: Date.now(), message: `${pilot.callsign} online on ${NETWORK_LABEL[network]}${via === 'bridge' ? ' (via the bridge)' : ''}` });
        } else {
          // went offline: if the flight had landed, close it at the last report
          const { rec, recording, lastPilot } = get();
          if (recording && (rec.phase === 'taxi-in') && rec.last) { const done = { ...rec, phase: 'arrived' as const, onBlock: rec.last.t }; persist({ rec: done, recording, lastPilot }); set({ rec: done }); }
          set({ pilot: null, via, status: 'offline', lastCheck: Date.now(), message: `${cid} isn't connected to ${NETWORK_LABEL[network]} right now. Checking every 20 seconds.` });
        }
      } catch (e) {
        const bridge = useSim.getState();
        set({ status: 'error', lastCheck: Date.now(), message: bridge.status === 'off' || bridge.status === 'error'
          ? `Your browser can't read the ${NETWORK_LABEL[network]} feed directly. Start the Flight Log bridge on this computer and connect it (above); lookups then go through it.`
          : (e as Error).message });
      }
      if (get().status !== 'off') timer = setTimeout(poll, POLL_MS);
    };
    poll();
  },

  stop() {
    if (timer) clearTimeout(timer);
    timer = null;
    set({ status: 'off', message: '', pilot: null });
  },

  reset() {
    prevAlt = null;
    const next = { rec: newRecording(), recording: false, lastPilot: null };
    persist(next);
    set(next);
  },

  toFlight(settings, base) {
    const { rec, lastPilot } = get();
    let b = base ?? null;
    if (!b && lastPilot) {
      b = emptyFlight({ ...settings, defaultCategory: 'simulator' });
      b.source = 'sim';
      const d = findAirport(lastPilot.dep), a = findAirport(lastPilot.arr);
      if (d) b.dep = toRef(d);
      if (a) b.arr = toRef(a);
      b.callsign = lastPilot.callsign;
      b.flightNumber = lastPilot.callsign;
      b.plannedRoute = lastPilot.route;
      const t = aircraftType(lastPilot.aircraft);
      if (t) b.aircraft = { ...b.aircraft, typeCode: t.code, manufacturer: t.manufacturer, model: t.model };
      if (/^FL\d+$/.test(lastPilot.cruise)) b.flightLevel = lastPilot.cruise;
    }
    if (b && lastPilot?.route && !b.flightPlan) {
      const r = parseRouteString(lastPilot.route, b.dep, b.arr);
      if (r.fixes.length || r.route) b.flightPlan = { ...routeToPlan(r, b.dep, b.arr), label: `${NETWORK_LABEL[lastPilot.network]} flight plan` };
    }
    const f = recordingToFlight(rec, settings, b);
    f.landingRateFpm = null; // network position reports are too coarse for a touchdown rate
    f.simulator = settings.defaultSimulator || f.simulator;
    f.tags = [...new Set([...(f.tags ?? []), lastPilot?.network ?? 'online'])];
    f.notes = [f.notes, `Logged from ${NETWORK_LABEL[lastPilot?.network ?? 'vatsim']} position reports (every ~20 s); times are accurate to about half a minute.`].filter(Boolean).join('\n');
    return f;
  },
}));
