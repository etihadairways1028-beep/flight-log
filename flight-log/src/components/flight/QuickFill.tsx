import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Cloud, ClipboardPaste, ScanLine, Undo2, Repeat, Camera, ImageUp, X, Check, Loader2, Sparkles, AlertTriangle } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { fetchLatestOfp } from '../../lib/simbrief';
import { parseBcbp, parseFreeText, type QuickResult } from '../../lib/quickparse';
import { loadAirlines } from '../../lib/airlines';
import { isCounted } from '../../lib/flight';
import { sortByDateDesc } from '../../lib/stats';
import { code } from '../../lib/airports';
import { Toggle, cx } from '../ui';
import { sound } from '../../lib/sound';
import type { Flight } from '../../lib/types';

export type QuickPanel = 'simbrief' | 'paste' | 'scan' | null;

export interface QuickApply {
  flight?: Flight;                                   // a complete flight to load (SimBrief, return, repeat)
  result?: QuickResult;                              // parsed fields to merge
  timesAre?: 'scheduled' | 'actual';
  label: string;
}

/** Fast ways to fill the flight form: SimBrief, pasted text, boarding pass scan, return / repeat. */
export function QuickFill({ initial, onApply }: { initial: QuickPanel; onApply: (a: QuickApply) => void }) {
  const [panel, setPanel] = useState<QuickPanel>(initial);
  useEffect(() => setPanel(initial), [initial]);
  const flights = useStore((s) => s.data.flights);
  const last = useMemo(() => sortByDateDesc(flights.filter(isCounted))[0], [flights]);

  const tile = (id: Exclude<QuickPanel, null>, Icon: any, title: string, sub: string) => (
    <button type="button" onClick={() => { sound.tap(); setPanel(panel === id ? null : id); }} aria-expanded={panel === id}
      className={cx('flex min-w-0 items-center gap-2.5 rounded-xl px-3 py-2.5 text-left ring-1 transition', panel === id ? 'bg-accent/20 ring-accent/50' : 'bg-white/[0.04] ring-white/[0.08] hover:bg-white/[0.07]')}>
      <Icon className={cx('h-4 w-4 shrink-0', panel === id ? 'text-ice' : 'text-muted')} />
      <span className="min-w-0"><span className="block truncate text-[12.5px] font-medium">{title}</span><span className="block truncate text-[11px] text-faint">{sub}</span></span>
    </button>
  );

  return (
    <section aria-label="Quick fill" className="rounded-xl2 bg-gradient-to-b from-accent/[0.08] to-transparent p-3 ring-1 ring-accent/20">
      <div className="mb-2.5 flex items-center gap-2 px-1"><Sparkles className="h-3.5 w-3.5 text-ice" /><span className="text-[12px] font-semibold uppercase tracking-[0.12em] text-ice/90">Quick fill</span><span className="text-[11.5px] text-faint">Fill the form in one step, then review and save</span></div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {tile('simbrief', Cloud, 'SimBrief', 'Latest flight plan')}
        {tile('paste', ClipboardPaste, 'Paste details', 'Booking or e-ticket text')}
        {tile('scan', ScanLine, 'Boarding pass', 'Scan the barcode')}
        {last ? (
          <div className="grid grid-cols-2 gap-1.5">
            <button type="button" title={`Return flight: ${code(last.arr)} → ${code(last.dep)}`} onClick={() => { sound.tap(); onApply({ flight: returnOf(last), label: `Return of ${code(last.dep)}–${code(last.arr)}` }); }} className="flex flex-col items-center justify-center gap-1 rounded-xl bg-white/[0.04] px-1 py-2 text-[11px] ring-1 ring-white/[0.08] hover:bg-white/[0.07]"><Undo2 className="h-4 w-4 text-muted" />Return</button>
            <button type="button" title={`Repeat: ${code(last.dep)} → ${code(last.arr)}`} onClick={() => { sound.tap(); onApply({ flight: repeatOf(last), label: `Repeat of ${code(last.dep)}–${code(last.arr)}` }); }} className="flex flex-col items-center justify-center gap-1 rounded-xl bg-white/[0.04] px-1 py-2 text-[11px] ring-1 ring-white/[0.08] hover:bg-white/[0.07]"><Repeat className="h-4 w-4 text-muted" />Repeat</button>
          </div>
        ) : <div className="hidden sm:block" />}
      </div>
      <AnimatePresence initial={false}>
        {panel && (
          <motion.div key={panel} initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22 }} className="overflow-hidden">
            <div className="pt-3">
              {panel === 'simbrief' && <SimBriefPanel onApply={(a) => { onApply(a); setPanel(null); }} />}
              {panel === 'paste' && <PastePanel onApply={(a) => { onApply(a); setPanel(null); }} />}
              {panel === 'scan' && <ScanPanel onApply={(a) => { onApply(a); setPanel(null); }} />}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

const fresh = (f: Flight): Flight => ({
  ...f, id: `f_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`, date: new Date().toISOString().slice(0, 10), status: 'completed', source: 'manual',
  times: { schedOut: null, schedIn: null, offBlock: null, takeoff: null, landing: null, onBlock: null },
  flightMinutes: null, flightMinutesSource: null, blockMinutes: null, blockMinutesSource: null, photos: [], notes: '', rating: null, weather: '', recordedDistanceKm: null,
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
});
export const returnOf = (f: Flight): Flight => ({ ...fresh(f), dep: f.arr, arr: f.dep, flightNumber: '', callsign: '', seat: '', plannedRoute: '', actualRoute: '' });
export const repeatOf = (f: Flight): Flight => ({ ...fresh(f), seat: '' });

function SimBriefPanel({ onApply }: { onApply: (a: QuickApply) => void }) {
  const st = useStore((s) => s.settings);
  const update = useStore((s) => s.updateSettings);
  const setInteg = useStore((s) => s.setIntegration);
  const [user, setUser] = useState(st.simbriefUser);
  const [flown, setFlown] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function go() {
    setBusy(true); setErr(null);
    try {
      if (user.trim() !== st.simbriefUser) await update({ simbriefUser: user.trim() });
      const f = await fetchLatestOfp(user, { asFlown: flown });
      f.simulator = st.defaultSimulator;
      await setInteg('simbrief', { lastSync: new Date().toISOString(), lastError: null });
      sound.success();
      onApply({ flight: f, label: `SimBrief OFP ${code(f.dep)}–${code(f.arr)}` });
    } catch (e) {
      setErr((e as Error).message);
      await setInteg('simbrief', { lastError: (e as Error).message });
      sound.warn();
    } finally { setBusy(false); }
  }
  return (
    <div className="flex flex-col gap-3 rounded-xl bg-deep/60 p-3.5 ring-1 ring-white/[0.07]">
      <p className="text-[12.5px] text-muted">Loads your most recent SimBrief flight plan: route, aircraft, registration, cruise level, fuel and planned times.</p>
      <div className="flex flex-wrap gap-2">
        <input className="input min-w-[180px] flex-1" placeholder="SimBrief username or Pilot ID" value={user} onChange={(e) => setUser(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } }} aria-label="SimBrief username or Pilot ID" />
        <button type="button" className="btn-primary" onClick={go} disabled={!user.trim() || busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Cloud className="h-4 w-4" />}Load plan</button>
      </div>
      <label className="flex items-center justify-between gap-3 text-[12.5px]"><span>I’ve already flown it: log it as completed using the planned times</span><Toggle checked={flown} onChange={setFlown} label="Log as flown" /></label>
      {err && <p className="flex gap-2 text-[12px] text-warn"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{err}</p>}
    </div>
  );
}

function PastePanel({ onApply }: { onApply: (a: QuickApply) => void }) {
  const [text, setText] = useState('');
  const [timesAre, setTimesAre] = useState<'scheduled' | 'actual'>('scheduled');
  useEffect(() => { loadAirlines(); }, []);
  const r = useMemo(() => (text.trim().length > 5 ? parseFreeText(text) : null), [text]);
  return (
    <div className="flex flex-col gap-3 rounded-xl bg-deep/60 p-3.5 ring-1 ring-white/[0.07]">
      <textarea autoFocus rows={4} className="input text-[13px]" value={text} onChange={(e) => setText(e.target.value)} aria-label="Paste flight details"
        placeholder={'Paste a booking confirmation, e-ticket or a quick note, e.g.\nEY 470 AUH → SIN 14 Mar 2026 22:10 – 08:55 +1, 787-9, seat 32A'} />
      {r && (
        <div className="flex flex-wrap gap-1.5">
          {r.recognised.length ? r.recognised.map((x) => <span key={x} className="chip text-good ring-good/25"><Check className="h-3 w-3" />{x}</span>) : <span className="text-[12px] text-muted">Nothing recognised yet: include airport codes (AUH, SIN) and a flight number or date.</span>}
        </div>
      )}
      {r && (r.depTime || r.arrTime) && (
        <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-muted">These times are
          {(['scheduled', 'actual'] as const).map((v) => <button type="button" key={v} onClick={() => setTimesAre(v)} className={cx('chip h-7 px-3', timesAre === v && 'chip-on')}>{v === 'scheduled' ? 'Scheduled' : 'Actual (gate to gate)'}</button>)}
          <span className="text-faint">local to each airport</span>
        </div>
      )}
      <div className="flex justify-end"><button type="button" className="btn-primary" disabled={!r || !r.recognised.length} onClick={() => { sound.success(); onApply({ result: r!, timesAre, label: 'Pasted details' }); }}><Check className="h-4 w-4" />Fill the form</button></div>
    </div>
  );
}

function ScanPanel({ onApply }: { onApply: (a: QuickApply) => void }) {
  const [mode, setMode] = useState<'idle' | 'camera' | 'busy'>('idle');
  const [err, setErr] = useState<string | null>(null);
  const [legs, setLegs] = useState<QuickResult[] | null>(null);
  const [manual, setManual] = useState('');
  const video = useRef<HTMLVideoElement>(null);
  const controls = useRef<{ stop: () => void } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => { loadAirlines(); return () => controls.current?.stop(); }, []);

  const handle = (raw: string) => {
    try {
      const out = parseBcbp(raw);
      sound.success();
      if (out.length === 1) onApply({ result: out[0], label: 'Boarding pass' }); else setLegs(out);
    } catch (e) { setErr((e as Error).message); sound.warn(); }
  };
  async function reader() {
    const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([import('@zxing/browser'), import('@zxing/library')]);
    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.PDF_417, BarcodeFormat.AZTEC, BarcodeFormat.QR_CODE, BarcodeFormat.DATA_MATRIX]);
    hints.set(DecodeHintType.TRY_HARDER, true);
    return new BrowserMultiFormatReader(hints);
  }
  async function fromImage(file: File) {
    setErr(null); setMode('busy');
    const url = URL.createObjectURL(file);
    try {
      const r = await reader();
      const res = await r.decodeFromImageUrl(url);
      handle(res.getText());
    } catch {
      setErr('No boarding-pass barcode found in that image. Try a sharper, well-lit photo with the whole barcode in frame, or paste the barcode text below.');
      sound.warn();
    } finally { URL.revokeObjectURL(url); setMode('idle'); }
  }
  async function startCamera() {
    setErr(null);
    if (!navigator.mediaDevices?.getUserMedia) { setErr('This browser can’t use the camera here. Upload a photo instead.'); return; }
    setMode('camera');
    try {
      const r = await reader();
      await new Promise((res) => setTimeout(res, 50));
      controls.current = await r.decodeFromVideoDevice(undefined, video.current!, (result) => {
        if (result) { controls.current?.stop(); setMode('idle'); handle(result.getText()); }
      });
    } catch (e) {
      setMode('idle');
      setErr((e as Error)?.name === 'NotAllowedError' ? 'Camera permission was denied. Allow it in your browser settings, or upload a photo instead.' : 'Couldn’t start the camera. Upload a photo instead.');
    }
  }
  const stop = () => { controls.current?.stop(); setMode('idle'); };

  return (
    <div className="flex flex-col gap-3 rounded-xl bg-deep/60 p-3.5 ring-1 ring-white/[0.07]">
      <p className="text-[12.5px] text-muted">Reads the barcode on paper or mobile boarding passes (PDF417, Aztec or QR, IATA standard): route, flight, date and seat. Everything is decoded on your device; nothing is uploaded.</p>
      {mode === 'camera' && (
        <div className="relative overflow-hidden rounded-xl bg-black ring-1 ring-white/10">
          <video ref={video} className="aspect-video w-full object-cover" muted playsInline />
          <div className="pointer-events-none absolute inset-[18%_10%] rounded-xl border-2 border-ice/70 shadow-[0_0_0_9999px_rgb(0_0_0/.35)]" />
          <button type="button" className="btn-glass btn-sm absolute right-2 top-2" onClick={stop}><X className="h-3.5 w-3.5" />Stop</button>
          <div className="absolute inset-x-0 bottom-2 text-center text-[12px] text-white/80">Hold the barcode inside the frame</div>
        </div>
      )}
      {mode !== 'camera' && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-primary" onClick={startCamera}><Camera className="h-4 w-4" />Use camera</button>
          <button type="button" className="btn-glass" onClick={() => fileRef.current?.click()} disabled={mode === 'busy'}>{mode === 'busy' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageUp className="h-4 w-4" />}Photo or screenshot</button>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) fromImage(f); e.target.value = ''; }} />
        </div>
      )}
      {legs && (
        <div className="flex flex-col gap-1.5">
          <div className="text-[12px] text-muted">This pass has {legs.length} flights. Pick one:</div>
          {legs.map((l, i) => <button type="button" key={i} className="btn-glass justify-start" onClick={() => onApply({ result: l, label: 'Boarding pass' })}><span className="mono">{l.flightNumber}</span> {code(l.dep)} → {code(l.arr)} <span className="text-faint">{l.date}</span></button>)}
        </div>
      )}
      <details className="text-[12px] text-muted">
        <summary className="cursor-pointer">Paste barcode text instead</summary>
        <div className="mt-2 flex gap-2"><input className="input mono text-[12px]" placeholder="M1DOE/JANE  EABC123 AUHSINEY 0470 …" value={manual} onChange={(e) => setManual(e.target.value)} aria-label="Barcode text" /><button type="button" className="btn-glass" disabled={manual.length < 58} onClick={() => handle(manual)}>Read</button></div>
      </details>
      {err && <p className="flex gap-2 text-[12px] text-warn"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{err}</p>}
    </div>
  );
}
