import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Radio, Plug, PlugZap, Download, Circle, Square, Save, Trash2, Gauge, Mountain, Compass, ArrowUpDown, Wind, Plane, Send, Check, AlertTriangle, Monitor } from 'lucide-react';
import { useStore } from '../store/useStore';
import { useSim } from '../lib/simLink';
import { PHASE_LABEL, landingRating, recordingToFlight, nearestAirport } from '../lib/recorder';
import { Glass, PageHeader, Segmented, Toggle, cx, Tip } from '../components/ui';
import { WorldMap } from '../components/map/WorldMap';
import { useFmt } from '../lib/useFmt';
import { code, loadExtendedAirports, findAirport } from '../lib/airports';
import { bestPath, plannedPath } from '../lib/flight';
import { toMsfsPln, toXplaneFms, planFileName, loadNavaids } from '../lib/planExport';
import { sound } from '../lib/sound';
import { useNet, NETWORK_LABEL, type Network } from '../lib/network';
import { Wifi, WifiOff, Users } from 'lucide-react';

const AUTO_KEY = 'skylog:auto-record';

export default function Live() {
  const sim = useSim();
  const flights = useStore((s) => s.data.flights);
  const settings = useStore((s) => s.settings);
  const saveFlight = useStore((s) => s.saveFlight);
  const toast = useStore((s) => s.toast);
  const fmt = useFmt();
  const nav = useNavigate();
  const [auto, setAuto] = useState(() => { try { return localStorage.getItem(AUTO_KEY) !== 'off'; } catch { return true; } });
  const [linkId, setLinkId] = useState<string>('');
  const [guide, setGuide] = useState<'msfs' | 'xplane'>('msfs');
  const [sending, setSending] = useState(false);
  const planned = useMemo(() => flights.filter((f) => f.status === 'planned').sort((a, b) => a.date.localeCompare(b.date)), [flights]);
  const linked = planned.find((f) => f.id === linkId) ?? null;
  const { tel, rec, status } = sim;

  useEffect(() => { loadExtendedAirports(); loadNavaids(); }, []);
  useEffect(() => { if (status === 'live' && auto && !sim.recording) sim.startRecording(); }, [status, auto, sim.recording]);
  // suggest the planned flight departing from where the aircraft is parked
  useEffect(() => {
    if (linkId || !tel || !planned.length) return;
    const here = nearestAirport(tel.lat, tel.lon, 5);
    const m = here && planned.find((f) => f.dep?.ident === here.ident);
    if (m) setLinkId(m.id);
  }, [tel?.lat, planned.length]);

  const canSave = sim.recording && (rec.landing != null || rec.phase === 'arrived') && rec.track.length > 1;
  async function save() {
    const f = recordingToFlight(rec, settings, linked);
    const saved = await saveFlight(f, { celebrate: true });
    sim.resetRecording();
    nav(`/flights/${saved.id}`);
    toast({ kind: 'success', title: 'Recorded flight saved', body: 'Airports, times, distance, track and landings were filled in from the sim. Edit anything that needs correcting.' });
  }
  async function sendPlan() {
    if (!linked?.flightPlan || !sim.hello) return;
    setSending(true);
    const xp = (tel?.sim ?? sim.hello.sim).startsWith('X-Plane');
    const r = await sim.sendPlan(planFileName(linked, xp ? 'fms' : 'pln'), xp ? toXplaneFms(linked) : toMsfsPln(linked));
    setSending(false);
    toast({ kind: r.ok ? 'success' : 'error', title: r.ok ? (r.loaded ? 'Plan loaded into MSFS' : 'Plan saved for the sim') : 'Couldn’t send the plan', body: r.message });
  }

  const track = rec.track.map((p) => [p.lon, p.lat] as [number, number]);
  const planPts = linked ? plannedPath(linked) ?? bestPath(linked)?.pts ?? null : null;
  const fit = track.length > 1 ? [...track, ...(tel ? [[tel.lon, tel.lat] as [number, number]] : [])] : tel ? [[tel.lon, tel.lat] as [number, number]] : planPts ?? undefined;
  const lr = landingRating(rec.landingVs);
  const pill = { off: ['Not connected', 'bg-white/5 text-faint ring-white/10'], connecting: ['Connecting…', 'bg-accent/15 text-ice ring-accent/30'], bridge: ['Bridge connected', 'bg-warn/10 text-warn ring-warn/30'], live: ['Live', 'bg-good/15 text-good ring-good/30'], error: ['Not connected', 'bg-bad/10 text-bad ring-bad/30'] }[status];
  const time = (t: number | null) => (t == null ? '—' : `${fmt.timeAt(new Date(t * 1000).toISOString(), 'UTC')}Z`);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader eyebrow="Simulator" title="Sim Live" sub="Connect Microsoft Flight Simulator 2020/2024 or X-Plane 11/12 through the Flight Log bridge, or track your VATSIM / IVAO flight online. Your flight is followed live and logged automatically: gate times, takeoff, landing, distance and the exact path you flew." />

      {/* connection */}
      <Glass className="flex flex-wrap items-center gap-4 p-4">
        <div className={cx('grid h-11 w-11 place-items-center rounded-xl ring-1', status === 'live' ? 'bg-good/15 text-good ring-good/30' : 'bg-white/[0.05] text-muted ring-white/10')}>{status === 'live' ? <PlugZap className="h-5 w-5" /> : <Plug className="h-5 w-5" />}</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cx('chip', pill[1])}>{status === 'live' && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-good" />}{pill[0]}</span>
            {tel && <span className="text-[13px] font-medium">{tel.sim}{tel.aircraft ? ` · ${tel.aircraft}` : ''}</span>}
            {(tel?.test || sim.hello?.test) && <span className="rounded bg-warn/20 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-warn">TEST DATA</span>}
          </div>
          <div className="mt-1 text-[12.5px] text-muted">{sim.message || 'Start the bridge on the computer running your simulator, then press Connect.'}</div>
        </div>
        <label className="hidden items-center gap-2 text-[12.5px] text-muted md:flex">Bridge<input className="input mono h-8 w-[210px] text-[12px]" value={sim.url} onChange={(e) => sim.setUrl(e.target.value)} aria-label="Bridge address" /></label>
        {status === 'off' || status === 'error' ? <button className="btn-primary" onClick={() => sim.connect()}><Plug className="h-4 w-4" />Connect</button> : <button className="btn-glass" onClick={() => sim.disconnect()}>Disconnect</button>}
      </Glass>

      <NetworkPanel />

      {status === 'live' && tel ? (
        <>
          <div className="grid grid-cols-3 gap-3 md:grid-cols-6">
            {[
              [Mountain, 'Altitude', tel.altFt >= 18000 ? `FL${Math.round(tel.altFt / 100)}` : `${Math.round(tel.altFt).toLocaleString('en-GB')} ft`],
              [Gauge, 'Ground speed', `${Math.round(tel.gsKt)} kt`],
              [Wind, 'IAS', `${Math.round(tel.iasKt)} kt`],
              [Compass, 'Heading', `${String(Math.round(tel.hdg)).padStart(3, '0')}°`],
              [ArrowUpDown, 'Vertical speed', `${tel.vsFpm > 0 ? '+' : ''}${Math.round(tel.vsFpm / 10) * 10} fpm`],
              [Plane, 'Status', tel.onGround ? (tel.parkingBrake ? 'Parked' : 'On ground') : 'Airborne'],
            ].map(([Icon, l, v]: any) => (
              <Glass key={l} className="p-3.5"><div className="flex items-center gap-1.5 text-[11.5px] text-muted"><Icon className="h-3.5 w-3.5 text-ice/80" />{l}</div><div className="mono mt-1.5 text-[19px] font-semibold">{v}</div></Glass>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <Glass className="overflow-hidden p-0">
              <WorldMap routes={[]} airports={[]} height={440} fit={fit} wheelZoom showLabels={false}
                lines={[...(planPts ? [{ pts: planPts, color: 'rgb(94 224 239 / .7)', dash: '4 5', width: 1.6 }] : []), ...(track.length > 1 ? [{ pts: track, color: '#ffffff', width: 2.4 }] : [])]}
                live={{ lat: tel.lat, lon: tel.lon, hdg: tel.hdg }} closeZoom />
              <div className="flex flex-wrap items-center gap-4 border-t border-white/[0.06] px-4 py-2.5 text-[11.5px] text-muted">
                <span className="flex items-center gap-1.5"><span className="h-0.5 w-5 bg-white" />Flown track</span>
                {planPts && <span className="flex items-center gap-1.5"><span className="h-0 w-5 border-t-2 border-dashed border-live" />Filed route</span>}
                <span className="ml-auto mono">{tel.lat.toFixed(4)}, {tel.lon.toFixed(4)}</span>
              </div>
            </Glass>

            <Glass className="flex flex-col gap-4 p-5">
              <div className="flex items-center justify-between">
                <h3 className="text-[14px] font-semibold">Flight recorder</h3>
                <label className="flex items-center gap-2 text-[12px] text-muted">Auto-record<Toggle checked={auto} onChange={(v) => { setAuto(v); try { localStorage.setItem(AUTO_KEY, v ? 'on' : 'off'); } catch { /* ignore */ } }} label="Record automatically" /></label>
              </div>
              <div className="flex items-center gap-3">
                <span className={cx('chip h-7 px-3', sim.recording ? 'bg-bad/15 text-bad ring-bad/30' : '')}>{sim.recording ? <><Circle className="h-2.5 w-2.5 fill-bad" />Recording</> : 'Not recording'}</span>
                <span className="text-[13px]">{PHASE_LABEL[rec.phase]}</span>
                {!sim.recording && <button className="btn-glass btn-sm ml-auto" onClick={() => sim.startRecording()}><Circle className="h-3.5 w-3.5" />Start</button>}
              </div>
              <ol className="grid grid-cols-2 gap-2 text-[12.5px]">
                {[['Off-block', rec.offBlock], ['Takeoff', rec.takeoff], ['Landing', rec.landing], ['On-block', rec.onBlock]].map(([l, t]) => (
                  <li key={l as string} className={cx('rounded-xl p-2.5 ring-1', t ? 'bg-good/[0.06] ring-good/20' : 'bg-white/[0.03] ring-white/[0.06]')}><div className="text-muted">{l}</div><div className="mono mt-0.5">{time(t as number | null)}</div></li>
                ))}
              </ol>
              <div className="grid grid-cols-3 gap-2 text-center text-[12px]">
                <div><div className="mono text-[16px] font-semibold">{fmt.dist(rec.distNm * 1.852)}</div><div className="text-muted">flown</div></div>
                <div><div className="mono text-[16px] font-semibold">{rec.maxAltFt ? (rec.maxAltFt >= 18000 ? `FL${Math.round(rec.maxAltFt / 100)}` : `${Math.round(rec.maxAltFt / 100) * 100}`) : '—'}</div><div className="text-muted">max altitude</div></div>
                <div><div className="mono text-[16px] font-semibold">{rec.landingVs != null ? `${rec.landingVs}` : '—'}</div><div className="text-muted">landing fpm</div></div>
              </div>
              {lr && <div className={cx('rounded-xl px-3 py-2 text-center text-[13px] font-medium ring-1', lr.tone === 'good' ? 'bg-good/10 text-good ring-good/25' : lr.tone === 'ok' ? 'bg-accent/10 text-ice ring-accent/25' : 'bg-warn/10 text-warn ring-warn/25')}>{lr.label} landing · {Math.abs(rec.landingVs!)} fpm</div>}

              <div>
                <label className="text-[12px] text-muted" htmlFor="link-plan">Planned flight for this leg</label>
                <select id="link-plan" className="input mt-1" value={linkId} onChange={(e) => setLinkId(e.target.value)}>
                  <option value="">None — log as a new flight</option>
                  {planned.map((f) => <option key={f.id} value={f.id}>{fmt.date(f.date)} · {code(f.dep)} → {code(f.arr)} {f.flightNumber}</option>)}
                </select>
                {linked?.flightPlan && sim.hello?.canSavePlans && (
                  <button className="btn-glass btn-sm mt-2" disabled={sending} onClick={sendPlan}><Send className="h-3.5 w-3.5" />Send flight plan to {(tel.sim ?? '').startsWith('X-Plane') ? 'X-Plane' : 'MSFS'}</button>
                )}
              </div>

              <div className="mt-auto flex flex-wrap gap-2">
                <button className="btn-primary flex-1" disabled={!canSave} onClick={save}><Save className="h-4 w-4" />{linked ? 'Complete planned flight' : 'Save flight'}</button>
                {sim.recording && <button className="btn-glass" onClick={() => { sim.resetRecording(); sound.warn(); }} aria-label="Discard recording"><Trash2 className="h-4 w-4" /></button>}
              </div>
              {!canSave && sim.recording && <p className="text-[11.5px] text-faint">Save becomes available after landing. The recording survives a page reload.</p>}
            </Glass>
          </div>
        </>
      ) : (
        <Glass className="p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div><h3 className="text-[15px] font-semibold">Set up the bridge</h3><p className="text-[12.5px] text-muted">A small, open-source Python program that runs next to your simulator. Websites can’t talk to simulators directly; the bridge passes the data to this page on your own computer only.</p></div>
            <Segmented label="Simulator" size="sm" value={guide} onChange={setGuide} options={[{ value: 'msfs', label: 'MSFS 2020 / 2024' }, { value: 'xplane', label: 'X-Plane 11 / 12' }]} />
          </div>
          <div className="mb-4 flex flex-wrap gap-2">
            <a className="btn-primary btn-sm" href="./bridge/flightlog_bridge.py" download><Download className="h-3.5 w-3.5" />flightlog_bridge.py</a>
            <a className="btn-glass btn-sm" href="./bridge/requirements.txt" download><Download className="h-3.5 w-3.5" />requirements.txt</a>
            <a className="btn-glass btn-sm" href="./bridge/start-bridge.bat" download><Download className="h-3.5 w-3.5" />start-bridge.bat (Windows)</a>
          </div>
          {guide === 'msfs' ? (
            <ol className="list-decimal space-y-2 pl-5 text-[13px] text-fg/90">
              <li>Install <span className="text-ice">Python 3.9 or newer</span> from python.org on the gaming PC (tick “Add Python to PATH”).</li>
              <li>Put the three downloaded files in one folder.</li>
              <li>Start MSFS 2020 or 2024 and load into a flight.</li>
              <li>Double-click <span className="mono text-ice">start-bridge.bat</span>. It installs what it needs (websockets, SimConnect) and connects to the sim.</li>
              <li>Come back here and press <span className="text-ice">Connect</span>. Use Chrome, Edge or Firefox on the same PC.</li>
            </ol>
          ) : (
            <ol className="list-decimal space-y-2 pl-5 text-[13px] text-fg/90">
              <li>Install <span className="text-ice">Python 3.9+</span> (Windows: python.org; macOS: <span className="mono">brew install python</span> or python.org).</li>
              <li>No X-Plane plugin is needed: the bridge uses X-Plane’s built-in UDP data output (port 49000) in both X-Plane 11 and 12.</li>
              <li>Windows: double-click <span className="mono text-ice">start-bridge.bat</span>. macOS/Linux: open Terminal in the folder and run<br /><span className="mono text-[12px] text-ice">pip3 install websockets && python3 flightlog_bridge.py --sim xplane --xplane-dir "/path/to/X-Plane 12"</span></li>
              <li><span className="mono">--xplane-dir</span> is optional; it lets Flight Log save .fms flight plans straight into <span className="mono">Output/FMS plans</span>.</li>
              <li>Load a flight in X-Plane, then press <span className="text-ice">Connect</span> here.</li>
            </ol>
          )}
          <div className="mt-4 grid gap-2 text-[12px] text-muted md:grid-cols-3">
            <p className="flex gap-2"><Monitor className="mt-0.5 h-3.5 w-3.5 shrink-0" />Open Flight Log on the same computer as the sim. Safari blocks local connections; use Chrome, Edge or Firefox.</p>
            <p className="flex gap-2"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0" />The bridge only accepts this site and listens on 127.0.0.1, so nothing leaves your PC.</p>
            <p className="flex gap-2"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />Running <span className="mono">python flightlog_bridge.py --test</span> sends a short demo circuit, clearly marked TEST DATA, to check the connection.</p>
          </div>
        </Glass>
      )}
    </div>
  );
}

function NetworkPanel() {
  const net = useNet();
  const settings = useStore((s) => s.settings);
  const update = useStore((s) => s.updateSettings);
  const saveFlight = useStore((s) => s.saveFlight);
  const toast = useStore((s) => s.toast);
  const fmt = useFmt();
  const nav = useNavigate();
  const [id, setId] = useState(settings.networkId);
  const prov = settings.networkProvider as Network;
  const on = net.status !== 'off';
  const p = net.pilot;
  const rec = net.rec;
  const canSave = net.recording && (rec.landing != null || rec.phase === 'arrived') && rec.track.length > 1;
  const track = rec.track.map((x) => [x.lon, x.lat] as [number, number]);
  const dep = p ? findAirportRef(p.dep) : null, arr = p ? findAirportRef(p.arr) : null;
  const planLine = dep && arr ? [[dep.lon!, dep.lat!], [arr.lon!, arr.lat!]] as [number, number][] : null;
  const fit = p ? [...track, [p.lon, p.lat] as [number, number], ...(planLine ?? [])] : undefined;
  async function save() {
    const f = net.toFlight(settings);
    const saved = await saveFlight(f, { celebrate: true });
    net.reset();
    nav(`/flights/${saved.id}`);
    toast({ kind: 'success', title: `${NETWORK_LABEL[prov]} flight saved`, body: 'Built from network position reports. Check the times and add anything missing.' });
  }
  return (
    <Glass className="p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className={cx('grid h-11 w-11 place-items-center rounded-xl ring-1', net.status === 'online' ? 'bg-good/15 text-good ring-good/30' : 'bg-white/[0.05] text-muted ring-white/10')}>{net.status === 'online' ? <Wifi className="h-5 w-5" /> : <Users className="h-5 w-5" />}</div>
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-semibold">Online network <span className="font-normal text-muted">· VATSIM or IVAO</span></div>
          <div className="text-[12.5px] text-muted">{net.message || 'Track your online flight from the network’s public data and log it automatically when you land.'}</div>
        </div>
        <Segmented label="Network" size="sm" value={prov} onChange={(v) => { update({ networkProvider: v }); if (on) net.stop(); }} options={[{ value: 'vatsim', label: 'VATSIM' }, { value: 'ivao', label: 'IVAO' }]} />
        <input className="input mono h-9 w-[130px]" inputMode="numeric" placeholder={prov === 'vatsim' ? 'CID' : 'VID'} aria-label={prov === 'vatsim' ? 'VATSIM CID' : 'IVAO VID'} value={id} onChange={(e) => setId(e.target.value.replace(/\D/g, ''))} />
        {on ? <button className="btn-glass" onClick={() => net.stop()}><WifiOff className="h-4 w-4" />Stop</button>
          : <button className="btn-primary" disabled={!id} onClick={() => { update({ networkId: id }); net.start(prov, id); }}><Wifi className="h-4 w-4" />Track</button>}
      </div>

      {p && (
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <div className="overflow-hidden rounded-xl ring-1 ring-white/[0.06]">
            <WorldMap routes={[]} airports={[]} height={320} fit={fit} wheelZoom showLabels={false} closeZoom
              lines={[...(planLine ? [{ pts: planLine, color: 'rgb(94 224 239 / .6)', dash: '4 5', width: 1.4 }] : []), ...(track.length > 1 ? [{ pts: track, color: '#ffffff', width: 2.4 }] : [])]}
              live={{ lat: p.lat, lon: p.lon, hdg: p.hdg }} />
          </div>
          <div className="flex flex-col gap-3">
            <div className="flex items-baseline gap-2"><span className="mono text-[22px] font-semibold text-ice">{p.callsign}</span><span className="text-[13px] text-muted">{p.aircraft}{p.rules ? ` · ${p.rules === 'I' || p.rules === 'IFR' ? 'IFR' : 'VFR'}` : ''}</span></div>
            <div className="mono text-[15px]">{p.dep || '—'} → {p.arr || '—'}{p.altn ? <span className="text-faint"> (altn {p.altn})</span> : null}</div>
            <div className="grid grid-cols-3 gap-2 text-center text-[12px]">
              <div className="rounded-xl bg-white/[0.03] p-2 ring-1 ring-white/[0.06]"><div className="mono text-[15px] font-semibold">{p.altFt >= 18000 ? `FL${Math.round(p.altFt / 100)}` : `${Math.round(p.altFt)}`}</div><div className="text-muted">altitude</div></div>
              <div className="rounded-xl bg-white/[0.03] p-2 ring-1 ring-white/[0.06]"><div className="mono text-[15px] font-semibold">{Math.round(p.gsKt)}</div><div className="text-muted">GS kt</div></div>
              <div className="rounded-xl bg-white/[0.03] p-2 ring-1 ring-white/[0.06]"><div className="mono text-[15px] font-semibold">{String(Math.round(p.hdg)).padStart(3, '0')}°</div><div className="text-muted">heading</div></div>
            </div>
            {p.route && <p className="mono line-clamp-3 break-words text-[11.5px] text-muted">{p.route}</p>}
            <div className="flex items-center gap-2 text-[12.5px]"><span className={cx('chip', net.recording && 'bg-bad/15 text-bad ring-bad/30')}>{net.recording ? 'Recording' : 'Not recording'}</span><span>{PHASE_LABEL[rec.phase]}</span><span className="ml-auto mono text-muted">{fmt.dist(rec.distNm * 1.852)}</span></div>
            <div className="flex gap-2">
              <button className="btn-primary flex-1" disabled={!canSave} onClick={save}><Save className="h-4 w-4" />Save flight</button>
              {net.recording && <button className="btn-glass" onClick={() => net.reset()} aria-label="Discard network recording"><Trash2 className="h-4 w-4" /></button>}
            </div>
            {!canSave && <p className="text-[11.5px] text-faint">Saving unlocks after you land. Times come from 20-second position reports.</p>}
          </div>
        </div>
      )}
      {!p && canSave && (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl bg-good/[0.07] p-3 text-[13px] ring-1 ring-good/20">
          <Check className="h-4 w-4 text-good" />Your last {NETWORK_LABEL[prov]} flight ({net.lastPilot?.callsign} {net.lastPilot?.dep}→{net.lastPilot?.arr}) is ready to log.
          <button className="btn-primary btn-sm ml-auto" onClick={save}>Save flight</button>
        </div>
      )}
    </Glass>
  );
}

function findAirportRef(ident: string) {
  const a = ident ? findAirport(ident) : null;
  return a && a.lat != null && a.lon != null ? a : null;
}
