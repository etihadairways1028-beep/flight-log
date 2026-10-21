// Connection to the Flight Log sim bridge (a small program on the simulator PC that
// serves live data on ws://127.0.0.1:8765). The site never invents telemetry: if the
// bridge isn't running, the status simply stays "not connected".
import { create } from 'zustand';
import { newRecording, step, type RecState, type Sample } from './recorder';

export type LinkStatus = 'off' | 'connecting' | 'bridge' | 'live' | 'error';

interface Hello { bridge: string; sim: string; test: boolean; canSavePlans: boolean; canNet: boolean }
interface Telemetry extends Sample { sim: string; aircraft: string; test: boolean; title?: string }

interface SimState {
  url: string;
  status: LinkStatus;
  message: string;
  hello: Hello | null;
  tel: Telemetry | null;
  rec: RecState;
  recording: boolean;
  setUrl(u: string): void;
  connect(): void;
  disconnect(): void;
  sendPlan(name: string, content: string): Promise<{ ok: boolean; message: string; loaded?: boolean }>;
  /** Ask the bridge to look up a VATSIM/IVAO pilot (the bridge isn't subject to browser CORS rules). */
  netFetch(network: string, cid: string): Promise<{ ok: boolean; message?: string; pilot?: any; fetched?: number }>;
  startRecording(): void;
  resetRecording(): void;
}

const URL_KEY = 'skylog:bridge-url';
const REC_KEY = 'skylog:recording';
const readLS = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const writeLS = (k: string, v: string | null) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* ignore */ } };

let ws: WebSocket | null = null;
let wanted = false;
let retry: ReturnType<typeof setTimeout> | null = null;
let liveTimer: ReturnType<typeof setTimeout> | null = null;
let lastSave = 0;
const pending = new Map<number, (r: any) => void>();
let reqId = 0;

function savedRecording(): { rec: RecState; recording: boolean } {
  try {
    const v = JSON.parse(readLS(REC_KEY) || 'null');
    if (v?.rec && Array.isArray(v.rec.track)) return v;
  } catch { /* ignore */ }
  return { rec: newRecording(), recording: false };
}

export const useSim = create<SimState>((set, get) => ({
  url: readLS(URL_KEY) || 'ws://127.0.0.1:8765',
  status: 'off',
  message: '',
  hello: null,
  tel: null,
  ...savedRecording(),

  setUrl(u) { writeLS(URL_KEY, u); set({ url: u }); },

  connect() {
    wanted = true;
    if (retry) { clearTimeout(retry); retry = null; }
    try { ws?.close(); } catch { /* ignore */ }
    set({ status: 'connecting', message: 'Looking for the bridge on this computer…' });
    let sock: WebSocket;
    try { sock = new WebSocket(get().url); } catch (e) { set({ status: 'error', message: 'That bridge address isn’t valid.' }); return; }
    ws = sock;
    sock.onopen = () => set({ status: 'bridge', message: 'Bridge connected. Waiting for the simulator…' });
    sock.onmessage = (ev) => {
      let m: any;
      try { m = JSON.parse(String(ev.data)); } catch { return; }
      if (m.type === 'hello') set({ hello: { bridge: m.bridge, sim: m.sim, test: !!m.test, canSavePlans: !!m.canSavePlans, canNet: !!m.canNet } });
      else if (m.type === 'status') set({ status: 'bridge', message: m.message || 'Waiting for the simulator…' });
      else if (m.type === 'netResult') { const cb = pending.get(m.id); if (cb) { pending.delete(m.id); cb(m); } }
      else if (m.type === 'planResult') { const id = pending.has(m.id) ? m.id : [...pending.keys()][0]; const cb = pending.get(id); if (cb) { pending.delete(id); cb(m); } }
      else if (m.type === 'telemetry') {
        const tel = m as Telemetry;
        const st = get();
        let rec = st.rec;
        if (st.recording) {
          rec = step({ ...rec, sim: tel.sim || rec.sim, aircraft: tel.aircraft || rec.aircraft, test: tel.test || rec.test }, tel);
          if (Date.now() - lastSave > 5000) { writeLS(REC_KEY, JSON.stringify({ rec, recording: true })); lastSave = Date.now(); }
        }
        set({ tel, rec, status: 'live', message: tel.test ? 'TEST DATA from the bridge’s --test mode' : `Receiving live data from ${tel.sim}` });
        if (liveTimer) clearTimeout(liveTimer);
        liveTimer = setTimeout(() => { if (get().status === 'live') set({ status: 'bridge', message: 'No data for a few seconds — is the sim paused or loading?' }); }, 6000);
      }
    };
    sock.onerror = () => { /* onclose follows */ };
    sock.onclose = (ev) => {
      if (ws !== sock) return;
      ws = null;
      const refused = ev.code === 1008;
      set({ status: wanted ? 'error' : 'off', tel: null, message: refused ? 'The bridge refused this page. Start it with --allow-origin and this site’s address.' : wanted ? 'Can’t reach the bridge. Is flightlog_bridge.py running on this computer?' : '' });
      if (wanted && !refused) retry = setTimeout(() => get().connect(), 4000);
    };
  },

  disconnect() {
    wanted = false;
    if (retry) { clearTimeout(retry); retry = null; }
    try { ws?.close(); } catch { /* ignore */ }
    ws = null;
    set({ status: 'off', message: '', tel: null });
  },

  sendPlan(name, content) {
    return new Promise((resolve) => {
      if (!ws || ws.readyState !== WebSocket.OPEN) return resolve({ ok: false, message: 'Not connected to the bridge.' });
      const id = ++reqId;
      pending.set(id, resolve);
      ws.send(JSON.stringify({ type: 'plan', id, name, content }));
      setTimeout(() => { if (pending.has(id)) { pending.delete(id); resolve({ ok: false, message: 'The bridge didn’t answer.' }); } }, 8000);
    });
  },

  netFetch(network, cid) {
    return new Promise((resolve) => {
      if (!ws || ws.readyState !== WebSocket.OPEN || !get().hello?.canNet) return resolve({ ok: false, message: 'Bridge not connected.' });
      const id = ++reqId;
      pending.set(id, resolve);
      ws.send(JSON.stringify({ type: 'net', id, network, cid }));
      setTimeout(() => { if (pending.has(id)) { pending.delete(id); resolve({ ok: false, message: 'The bridge didn’t answer.' }); } }, 20000);
    });
  },

  startRecording() {
    const rec = newRecording();
    writeLS(REC_KEY, JSON.stringify({ rec, recording: true }));
    set({ rec, recording: true });
  },
  resetRecording() {
    writeLS(REC_KEY, null);
    set({ rec: newRecording(), recording: false });
  },
}));
