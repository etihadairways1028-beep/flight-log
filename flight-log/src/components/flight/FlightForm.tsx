import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { GraduationCap, ChevronDown, Clock, Plane, Route as RouteIcon, NotebookPen, Users, Info, AlertTriangle, ImagePlus, Trash2, ArrowLeftRight, Sparkles, Globe2 } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { Dialog, Field, Segmented, Stars, Tip, cx } from '../ui';
import { AirportPicker, AircraftTypePicker, AirlineInput } from './Pickers';
import { emptyFlight, finalizeFlight, missingFields } from '../../lib/flight';
import type { Flight, FlightCategory, FlightRole, FlightStatus, FlightTimes } from '../../lib/types';
import { CATEGORY_LABEL, ROLE_LABEL, STATUS_LABEL, PILOT_FIELDS, emptyPilot } from '../../lib/types';
import { estimateNightMinutes } from '../../lib/pilot';
import { hasPilotData } from '../../lib/flight';
import { deriveDurations, fmtDurationLong, isValidISODate, minutesBetween, parseDurationInput, timingIssues, utcToWall, wallToUtc, zoneOffsetLabel, fmtDuration } from '../../lib/time';
import { distanceBetween } from '../../lib/geo';
import { useFmt } from '../../lib/useFmt';
import { toFt, ftTo, toKt, ktTo, toKm, kmTo, ALT_LABEL, SPEED_LABEL, DIST_LABEL } from '../../lib/units';
import { sound } from '../../lib/sound';
import { QuickFill, type QuickApply } from './QuickFill';
import { findAirport, toRef, code as apCode } from '../../lib/airports';
import { airlineByIata, airlineByIcao, loadAirlines } from '../../lib/airlines';
import { aircraftType } from '../../lib/aircraftTypes';
import { groupBy } from '../../lib/stats';
import { routeKey, isCounted } from '../../lib/flight';

type TimeKey = keyof FlightTimes;
const TIME_ROWS: { key: TimeKey; label: string; at: 'dep' | 'arr'; tip?: string }[] = [
  { key: 'schedOut', label: 'Scheduled departure', at: 'dep' },
  { key: 'schedIn', label: 'Scheduled arrival', at: 'arr' },
  { key: 'offBlock', label: 'Off-block', at: 'dep', tip: 'Off-block (OUT): the aircraft first moves under its own power or pushback. Starts block time.' },
  { key: 'takeoff', label: 'Takeoff', at: 'dep', tip: 'Wheels-off. Starts flight (airborne) time.' },
  { key: 'landing', label: 'Landing', at: 'arr', tip: 'Wheels-on. Ends flight (airborne) time.' },
  { key: 'onBlock', label: 'On-block', at: 'arr', tip: 'On-block (IN): the aircraft stops at the stand. Ends block time.' },
];
const ACTUAL_SEQ: TimeKey[] = ['offBlock', 'takeoff', 'landing', 'onBlock'];
type Wall = { time: string; offset: number; auto: boolean };
type Walls = Record<TimeKey, Wall>;

const numOrNull = (s: string) => (s.trim() === '' || !Number.isFinite(Number(s)) ? null : Number(s));

function Section({ id, icon: Icon, title, hint, open, onToggle, children }: { id: string; icon: any; title: string; hint?: string; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <section className="well overflow-hidden" aria-labelledby={`${id}-h`}>
      <button type="button" id={`${id}-h`} onClick={onToggle} aria-expanded={open} aria-controls={`${id}-body`} className="flex w-full items-center gap-3 px-4 py-3.5 text-left">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/[0.05] text-ice ring-1 ring-white/[0.07]"><Icon className="h-4 w-4" /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-semibold">{title}</span>
          {hint && <span className="block truncate text-[12px] text-muted">{hint}</span>}
        </span>
        <ChevronDown className={cx('h-4 w-4 text-muted transition-transform', open && 'rotate-180')} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div id={`${id}-body`} initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25, ease: [0.2, 0.7, 0.2, 1] }}>
            <div className="border-t border-white/[0.06] px-4 pb-4 pt-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

async function compressImage(file: File, max = 1600): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Could not read that image.')); i.src = url; });
    const k = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function PilotField({ label, tip, kind, value, total, onChange, extra }: { label: string; tip: string; kind: 'time' | 'count'; value: number | null; total: number | null; onChange: (v: number | null) => void; extra?: React.ReactNode }) {
  const [text, setText] = useState('');
  useEffect(() => { setText(value == null ? '' : kind === 'time' ? fmtDuration(value) : String(value)); }, [value, kind]);
  const bad = text.trim() !== '' && (kind === 'time' ? parseDurationInput(text) == null : !/^\d{1,3}$/.test(text.trim()));
  return (
    <div className="min-w-0">
      <div className="mb-1 flex items-center gap-1.5 text-[12px] font-medium text-muted">
        <Tip text={tip}><span>{label}</span></Tip>
        <span className="ml-auto flex gap-2">
          {extra}
          {kind === 'time' && total != null && <button type="button" className="text-[11px] text-ice hover:text-white" onClick={() => onChange(total)}>= flight</button>}
        </span>
      </div>
      <input aria-label={label} className={cx('input mono', bad && 'ring-bad/60')} inputMode={kind === 'time' ? 'text' : 'numeric'} placeholder={kind === 'time' ? 'H:MM' : '0'} value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => { const t = text.trim(); if (!t) return onChange(null); const v = kind === 'time' ? parseDurationInput(t) : /^\d{1,3}$/.test(t) ? Number(t) : null; if (v != null) onChange(v); }} />
    </div>
  );
}

export function FlightForm() {
  const form = useStore((s) => s.form);
  const close = useStore((s) => s.closeForm);
  const saveFlight = useStore((s) => s.saveFlight);
  const settings = useStore((s) => s.settings);
  const flights = useStore((s) => s.data.flights);
  const putPhoto = useStore((s) => s.putPhoto);
  const getPhoto = useStore((s) => s.getPhoto);
  const toast = useStore((s) => s.toast);
  const nav = useNavigate();
  const fmt = useFmt();

  const [f, setF] = useState<Flight>(() => emptyFlight(settings));
  const [zoneMode, setZoneMode] = useState<'airport' | 'utc'>(settings.timeEntryZone);
  const [walls, setWalls] = useState<Walls>(() => blankWalls());
  const [manualFlight, setManualFlight] = useState('');
  const [manualBlock, setManualBlock] = useState('');
  const [open, setOpen] = useState<Record<string, boolean>>({ basics: true, route: true, aircraft: true, timing: true, details: false, story: false });
  const [tagDraft, setTagDraft] = useState('');
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [triedSave, setTriedSave] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // initialise on open
  useEffect(() => {
    if (!form.open) return;
    sound.open();
    loadAirlines();
    let base: Flight;
    if (form.flight) {
      base = structuredClone(form.flight);
      if (form.mode === 'duplicate') {
        base.id = emptyFlight().id;
        base.source = 'duplicate';
        base.createdAt = new Date().toISOString();
        base.photos = [];
      }
    } else base = emptyFlight(settings);
    setF(base);
    setZoneMode(settings.timeEntryZone);
    setWalls(wallsFrom(base, settings.timeEntryZone));
    setManualFlight(base.flightMinutesSource === 'manual' && base.flightMinutes != null ? fmtDuration(base.flightMinutes) : '');
    setManualBlock(base.blockMinutesSource === 'manual' && base.blockMinutes != null ? fmtDuration(base.blockMinutes) : '');
    setTriedSave(false);
    setDirty(false);
    const pilotish = settings.profile === 'pilot' || settings.profile === 'student' || ['pic', 'sic', 'dual', 'instructor'].includes(base.role) || hasPilotData(base);
    setOpen((o) => ({ ...o, pilot: pilotish, details: pilotish || (form.mode !== 'create' && !!(base.role || base.seat || base.crew || base.weather)), story: form.mode !== 'create' && !!(base.notes || base.tags.length || base.photos.length) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.open, form.flight, form.mode]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const out: Record<string, string> = {};
      for (const id of f.photos) {
        if (photoUrls[id]) { out[id] = photoUrls[id]; continue; }
        const p = await getPhoto(id);
        if (p) out[id] = p.dataUrl;
      }
      if (alive) setPhotoUrls(out);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.photos]);

  function blankWalls(): Walls {
    return Object.fromEntries(TIME_ROWS.map((r) => [r.key, { time: '', offset: 0, auto: true }])) as Walls;
  }
  function zoneFor(at: 'dep' | 'arr', mode = zoneMode, fl = f) {
    if (mode === 'utc') return 'UTC';
    return (at === 'dep' ? fl.dep?.tz : fl.arr?.tz) || 'UTC';
  }
  function wallsFrom(fl: Flight, mode: 'airport' | 'utc'): Walls {
    const w = blankWalls();
    for (const r of TIME_ROWS) {
      const z = mode === 'utc' ? 'UTC' : (r.at === 'dep' ? fl.dep?.tz : fl.arr?.tz) || 'UTC';
      const { time, dayOffset } = utcToWall(fl.times[r.key], z, fl.date);
      w[r.key] = { time, offset: dayOffset, auto: !fl.times[r.key] };
    }
    return w;
  }

  /** Load a quick-fill result into the form. Nothing is saved until the person presses Save. */
  function applyQuick(a: QuickApply) {
    let next: Flight;
    if (a.flight) {
      next = { ...a.flight, id: form.mode === 'edit' ? f.id : a.flight.id };
    } else {
      const r = a.result!;
      next = { ...f, aircraft: { ...f.aircraft } };
      if (r.date) next.date = r.date;
      if (r.dep) next.dep = r.dep;
      if (r.arr) next.arr = r.arr;
      if (r.flightNumber) next.flightNumber = r.flightNumber;
      if (r.airline) { next.airline = r.airline; next.airlineCode = r.airlineCode ?? ''; }
      if (r.typeCode) { const t = aircraftType(r.typeCode); next.aircraft = { ...next.aircraft, typeCode: r.typeCode, manufacturer: t?.manufacturer ?? next.aircraft.manufacturer, model: t?.model ?? next.aircraft.model }; }
      if (r.registration) next.aircraft.registration = r.registration;
      if (r.seat) { next.seat = r.seat; if (!next.role) next.role = 'passenger'; }
      if (r.cabin && !next.notes) next.notes = `${r.cabin} cabin`;
      if (r.pnr && !next.tags.includes(`pnr-${r.pnr.toLowerCase()}`)) next.notes = [next.notes, `Booking ref ${r.pnr}`].filter(Boolean).join(' · ');
      const depKey = a.timesAre === 'actual' ? 'offBlock' : 'schedOut';
      const arrKey = a.timesAre === 'actual' ? 'onBlock' : 'schedIn';
      const dz = next.dep?.tz || 'UTC', az = next.arr?.tz || 'UTC';
      next.times = { ...next.times };
      if (r.depTime) next.times[depKey] = wallToUtc(next.date, r.depTime, dz, 0);
      if (r.arrTime) {
        let off = r.arrDayOffset ?? 0;
        let t = wallToUtc(next.date, r.arrTime, az, off);
        if (r.arrDayOffset == null && t && next.times[depKey]) {
          for (let o = 0; o <= 2 && t && Date.parse(t) < Date.parse(next.times[depKey]!); o++) { off = o + 1; t = wallToUtc(next.date, r.arrTime, az, off); }
        }
        next.times[arrKey] = t;
      }
    }
    setF(next);
    setWalls(wallsFrom(next, zoneMode));
    setManualFlight(next.flightMinutesSource === 'manual' && next.flightMinutes != null ? fmtDuration(next.flightMinutes) : '');
    setManualBlock(next.blockMinutesSource === 'manual' && next.blockMinutes != null ? fmtDuration(next.blockMinutes) : '');
    setOpen((o) => ({ ...o, route: true, timing: true }));
    setDirty(true);
    toast({ kind: 'success', title: `${a.label} loaded`, body: 'Check the details, then save.' });
  }

  /** Fill the airline from the flight number's designator (EY 470 → Etihad Airways). */
  function airlineFromFlightNumber(v: string) {
    if (f.airline) return;
    const m = v.trim().toUpperCase().match(/^([A-Z][A-Z0-9]|[A-Z0-9][A-Z])\s?\d{1,4}[A-Z]?$/) || v.trim().toUpperCase().match(/^([A-Z]{3})\s?\d{1,4}$/);
    if (!m) return;
    const al = m[1].length === 2 ? airlineByIata(m[1]) : airlineByIcao(m[1]);
    if (al) upd({ airline: al.name, airlineCode: al.icao });
  }

  /** Instants from wall inputs, with automatic day roll-over for overnight sequences. */
  const computed = useMemo(() => {
    const times = {} as FlightTimes;
    const next = { ...walls };
    for (const r of TIME_ROWS) times[r.key] = null;
    const calc = (k: TimeKey, offset: number) => {
      const row = TIME_ROWS.find((r) => r.key === k)!;
      return wallToUtc(f.date, walls[k].time, zoneFor(row.at), offset);
    };
    // scheduled pair
    times.schedOut = walls.schedOut.time ? calc('schedOut', walls.schedOut.offset) : null;
    times.schedIn = walls.schedIn.time ? calc('schedIn', walls.schedIn.offset) : null;
    if (times.schedOut && times.schedIn && walls.schedIn.auto) {
      for (let o = -1; o <= 2; o++) { const t = calc('schedIn', o); if (t && Date.parse(t) >= Date.parse(times.schedOut)) { times.schedIn = t; next.schedIn = { ...walls.schedIn, offset: o }; break; } }
    }
    let prev: string | null = null;
    for (const k of ACTUAL_SEQ) {
      if (!walls[k].time) continue;
      let t = calc(k, walls[k].offset);
      if (prev && walls[k].auto) {
        for (let o = -1; o <= 2; o++) { const c = calc(k, o); if (c && Date.parse(c) >= Date.parse(prev)) { t = c; next[k] = { ...walls[k], offset: o }; break; } }
      }
      times[k] = t;
      if (t) prev = t;
    }
    return { times, walls: next };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walls, f.date, f.dep?.tz, f.arr?.tz, zoneMode]);

  const draft: Flight = useMemo(() => {
    const d: Flight = { ...f, times: computed.times };
    const mf = parseDurationInput(manualFlight), mb = parseDurationInput(manualBlock);
    d.flightMinutes = mf; d.flightMinutesSource = mf != null ? 'manual' : null;
    d.blockMinutes = mb; d.blockMinutesSource = mb != null ? 'manual' : null;
    return { ...d, ...deriveDurations(d), distanceKm: distanceBetween(d.dep, d.arr) };
  }, [f, computed.times, manualFlight, manualBlock]);

  const issues = timingIssues(draft);
  const missing = missingFields(draft);
  const errors: Record<string, string | null> = {
    date: isValidISODate(f.date) ? null : 'Enter a valid date.',
    route: f.dep && f.arr && f.dep.ident === f.arr.ident && f.status !== 'cancelled' ? 'Departure and arrival are the same airport. Local flights are fine — just confirm this is intended.' : null,
    manualFlight: manualFlight && parseDurationInput(manualFlight) == null ? 'Use H:MM (7:25) or decimal hours (7.4).' : null,
    manualBlock: manualBlock && parseDurationInput(manualBlock) == null ? 'Use H:MM (7:25) or decimal hours (7.4).' : null,
  };
  const blocking = !!errors.date || !!errors.manualFlight || !!errors.manualBlock || issues.length > 0 || ((f.status === 'completed' || f.status === 'diverted') && (!f.dep || !f.arr));

  const upd = (p: Partial<Flight>) => { setF((x) => ({ ...x, ...p })); setDirty(true); };
  const updAc = (p: Partial<Flight['aircraft']>) => { setF((x) => ({ ...x, aircraft: { ...x.aircraft, ...p } })); setDirty(true); };
  const setWall = (k: TimeKey, p: Partial<Wall>) => { setWalls((w) => ({ ...w, [k]: { ...w[k], ...p } })); setDirty(true); };

  const switchZone = (m: 'airport' | 'utc') => {
    if (m === zoneMode) return;
    const fl = { ...f, times: computed.times };
    setZoneMode(m);
    setWalls(wallsFrom(fl, m));
  };

  const knownRegs = useMemo(() => {
    const m = new Map<string, Flight['aircraft']>();
    flights.forEach((x) => { if (x.aircraft.registration) m.set(x.aircraft.registration, x.aircraft); });
    return [...m.values()].slice(-40).reverse();
  }, [flights]);
  const recentRoutes = useMemo(() => {
    const seen = new Map<string, Flight>();
    for (const x of [...flights].filter(isCounted).sort((a, b) => b.date.localeCompare(a.date))) { const k = routeKey(x, true); if (k && !seen.has(k)) seen.set(k, x); }
    const freq = new Map(groupBy(flights, (x) => routeKey(x, true)).map((g) => [g.key, g.flights]));
    return [...seen.entries()].sort((a, b) => (freq.get(b[0]) ?? 0) - (freq.get(a[0]) ?? 0)).slice(0, 6).map(([k, x]) => ({ k, dep: x.dep!, arr: x.arr! }));
  }, [flights]);
  const knownAirlines = useMemo(() => [...new Set(flights.map((x) => x.airline).filter(Boolean))], [flights]);
  const knownTags = useMemo(() => [...new Set(flights.flatMap((x) => x.tags))].filter((t) => !f.tags.includes(t)).slice(0, 8), [flights, f.tags]);

  async function save() {
    setTriedSave(true);
    if (blocking) {
      sound.warn();
      if (!f.dep || !f.arr) setOpen((o) => ({ ...o, route: true }));
      if (issues.length) setOpen((o) => ({ ...o, timing: true }));
      return;
    }
    setSaving(true);
    try {
      const status: FlightStatus = f.status === 'completed' && missingFields(draft).includes('duration') ? 'draft' : f.status;
      const saved = await saveFlight(finalizeFlight({ ...draft, status }), { celebrate: form.mode !== 'edit' && status !== 'planned' });
      close();
      if (form.mode === 'edit') { sound.success(); toast({ kind: 'success', title: 'Flight updated', body: 'Every total and chart has been recalculated.' }); }
      else if (status === 'draft') toast({ kind: 'info', title: 'Saved as incomplete', body: 'Add a flight or block time later to complete it.' });
      else if (status === 'planned') { sound.success(); toast({ kind: 'success', title: 'Planned flight saved' }); }
      if (form.mode !== 'edit') nav(`/flights/${saved.id}`);
    } catch (e) {
      toast({ kind: 'error', title: 'Could not save', body: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  async function addPhotos(files: FileList | null) {
    if (!files) return;
    const ids: string[] = [];
    for (const file of Array.from(files).slice(0, 8)) {
      if (!file.type.startsWith('image/')) continue;
      try { ids.push(await putPhoto(await compressImage(file))); }
      catch (e) { toast({ kind: 'error', title: 'Photo skipped', body: (e as Error).message }); }
    }
    if (ids.length) upd({ photos: [...f.photos, ...ids] });
  }

  const title = form.mode === 'edit' ? 'Edit flight' : form.mode === 'duplicate' ? 'Duplicate flight' : 'Log a flight';
  const isSim = f.category === 'simulator';
  const depZone = zoneFor('dep'), arrZone = zoneFor('arr');

  return (
    <Dialog
      open={form.open}
      onOpenChange={(v) => { if (!v) close(); }}
      side
      title={title}
      description={isSim ? 'Simulator flights are tracked separately and never counted as real-world time.' : 'Only the route and date are needed. Everything else is optional.'}
      footer={
        <>
          {triedSave && blocking && <span className="mr-auto flex items-center gap-1.5 text-[12.5px] text-bad"><AlertTriangle className="h-3.5 w-3.5" />{!f.dep || !f.arr ? 'Add departure and arrival airports.' : issues[0] ?? 'Fix the highlighted fields.'}</span>}
          {!triedSave && missing.length > 0 && f.status === 'completed' && <span className="mr-auto hidden text-[12px] text-warn sm:block">Missing: {missing.join(', ')}</span>}
          <button className="btn-glass" onClick={close}>Cancel</button>
          <button className="btn-primary min-w-[120px]" onClick={save} disabled={saving}>{saving ? 'Saving…' : form.mode === 'edit' ? 'Save changes' : 'Save flight'}</button>
        </>
      }
    >
      <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); save(); }}>
        {form.mode !== 'edit' && <QuickFill key={String(form.open)} initial={form.quick ?? null} onApply={applyQuick} />}
        {/* Live summary strip */}
        <div className="glass relative overflow-hidden rounded-xl2 p-4">
          <div className="flex items-center gap-4">
            <div className="min-w-0">
              <div className="mono text-[28px] font-semibold leading-none">{draft.dep ? draft.dep.iata || draft.dep.ident : '———'}</div>
              <div className="mt-1 truncate text-[11.5px] text-muted">{draft.dep?.city || 'Departure'}</div>
            </div>
            <div className="relative flex-1">
              <div className="relative"><div className="h-px w-full route-line" /><Plane className="absolute left-1/2 top-0 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rotate-45 text-white" /></div>
              <div className="mt-2 flex justify-center gap-3 text-[11.5px] text-muted num">
                <span>{draft.distanceKm != null ? fmt.dist(draft.distanceKm) : '— km'}</span>
                <span>·</span>
                <span>{draft.flightMinutes != null ? fmtDurationLong(draft.flightMinutes) : draft.blockMinutes != null ? `${fmtDurationLong(draft.blockMinutes)} block` : '—'}</span>
              </div>
            </div>
            <div className="min-w-0 text-right">
              <div className="mono text-[28px] font-semibold leading-none">{draft.arr ? draft.arr.iata || draft.arr.ident : '———'}</div>
              <div className="mt-1 truncate text-[11.5px] text-muted">{draft.arr?.city || 'Arrival'}</div>
            </div>
          </div>
        </div>

        <Section id="basics" icon={NotebookPen} title="Basic information" hint={`${CATEGORY_LABEL[f.category]} · ${STATUS_LABEL[f.status]}`} open={open.basics} onToggle={() => setOpen({ ...open, basics: !open.basics })}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Date" htmlFor="ff-date" error={triedSave ? errors.date : null} help="Departure date, local to the departure airport.">
              <input id="ff-date" type="date" className="input mono" value={f.date} onChange={(e) => upd({ date: e.target.value })} required />
            </Field>
            <Field label="Status" htmlFor="ff-status">
              <select id="ff-status" className="input" value={f.status} onChange={(e) => upd({ status: e.target.value as FlightStatus })}>
                {(Object.keys(STATUS_LABEL) as FlightStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </select>
            </Field>
            <div className="sm:col-span-2">
              <div className="mb-1.5 text-[12px] font-medium text-muted">Category</div>
              <div className="flex flex-wrap gap-1.5">
                {(Object.keys(CATEGORY_LABEL) as FlightCategory[]).map((c) => (
                  <button key={c} type="button" onClick={() => { sound.tap(); upd({ category: c, role: c === 'simulator' && !f.role ? 'sim-pilot' : f.role, simulator: c === 'simulator' && !f.simulator ? settings.defaultSimulator : f.simulator }); }} className={cx('chip h-8 px-3 text-[12.5px]', f.category === c && 'chip-on')} aria-pressed={f.category === c}>
                    {CATEGORY_LABEL[c]}
                  </button>
                ))}
              </div>
            </div>
            <Field label="Flight number" htmlFor="ff-fn"><input id="ff-fn" className="input-mono" placeholder="EY 470" value={f.flightNumber} onChange={(e) => upd({ flightNumber: e.target.value.toUpperCase() })} onBlur={(e) => airlineFromFlightNumber(e.target.value)} /></Field>
            <Field label="Callsign" htmlFor="ff-cs"><input id="ff-cs" className="input-mono" placeholder="ETD470" value={f.callsign} onChange={(e) => upd({ callsign: e.target.value.toUpperCase() })} /></Field>
            <Field label={isSim ? 'Virtual airline / operator' : 'Airline / operator'} htmlFor="ff-al">
              <AirlineInput id="ff-al" value={f.airline} suggestions={knownAirlines} onChange={(v) => upd({ airline: v })} onPickAirline={(a) => upd({ airline: a.name, airlineCode: a.icao })} />
            </Field>
            <Field label="Operating carrier" htmlFor="ff-op" help="Only if different (codeshare, wet lease).">
              <input id="ff-op" className="input" value={f.operator} onChange={(e) => upd({ operator: e.target.value })} />
            </Field>
            {isSim && (
              <Field label="Simulator" htmlFor="ff-sim" className="sm:col-span-2">
                <input id="ff-sim" className="input" list="sim-list" value={f.simulator} onChange={(e) => upd({ simulator: e.target.value })} placeholder="MSFS 2024" />
                <datalist id="sim-list">{['MSFS 2024', 'MSFS 2020', 'X-Plane 12', 'X-Plane 11', 'Prepar3D v6', 'Aerofly FS 4', 'DCS World'].map((x) => <option key={x} value={x} />)}</datalist>
              </Field>
            )}
          </div>
        </Section>

        <Section id="route" icon={RouteIcon} title="Route" hint={f.dep && f.arr ? `${f.dep.ident} → ${f.arr.ident}${draft.distanceKm ? ' · ' + fmt.dist(draft.distanceKm) + ' great-circle' : ''}` : 'Departure and arrival'} open={open.route} onToggle={() => setOpen({ ...open, route: !open.route })}>
          {recentRoutes.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-[12px] text-muted">Your routes</span>
              {recentRoutes.map((r) => (
                <button type="button" key={r.k} className={cx('chip h-7 font-mono', f.dep?.ident === r.dep.ident && f.arr?.ident === r.arr.ident && 'chip-on')} onClick={() => { sound.tap(); upd({ dep: r.dep, arr: r.arr }); }}>{apCode(r.dep)} → {apCode(r.arr)}</button>
              ))}
            </div>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
            <Field label="Departure" error={triedSave && !f.dep && f.status !== 'planned' && f.status !== 'draft' ? 'Required' : null}><AirportPicker label="Departure airport" value={f.dep} onChange={(a) => upd({ dep: a })} invalid={triedSave && !f.dep} /></Field>
            <button type="button" className="btn-icon btn-glass mx-auto mb-3 rotate-90 sm:rotate-0" aria-label="Swap departure and arrival" onClick={() => { sound.tap(); upd({ dep: f.arr, arr: f.dep }); }}><ArrowLeftRight className="h-4 w-4" /></button>
            <Field label="Arrival" error={triedSave && !f.arr && f.status !== 'planned' && f.status !== 'draft' ? 'Required' : null}><AirportPicker label="Arrival airport" value={f.arr} onChange={(a) => upd({ arr: a })} invalid={triedSave && !f.arr} /></Field>
          </div>
          {errors.route && <p className="mt-2 text-[12px] text-warn">{errors.route}</p>}
          {f.flightPlan && (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-live/[0.07] px-3 py-2 text-[12.5px] ring-1 ring-live/20">
              <span className="text-live">Flight plan attached</span>
              <span className="text-muted">{f.flightPlan.fixes.length} fixes{f.flightPlan.routeDistanceNm ? ` · ${fmt.dist(f.flightPlan.routeDistanceNm * 1.852)} planned` : ''}{f.flightPlan.alternate ? ` · ALTN ${f.flightPlan.alternate}` : ''}</span>
              <button type="button" className="btn-ghost btn-sm ml-auto" onClick={() => upd({ flightPlan: undefined })}>Remove</button>
            </div>
          )}
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Planned route" htmlFor="ff-pr" className="sm:col-span-2"><input id="ff-pr" className="input-mono normal-case" placeholder="DCT ITLAN UL425 … (optional)" value={f.plannedRoute} onChange={(e) => upd({ plannedRoute: e.target.value.toUpperCase() })} /></Field>
            <Field label="Actual route" htmlFor="ff-ar" className="sm:col-span-2"><input id="ff-ar" className="input-mono" placeholder="If different from planned" value={f.actualRoute} onChange={(e) => upd({ actualRoute: e.target.value.toUpperCase() })} /></Field>
            <Field label={`Recorded distance (${DIST_LABEL[settings.distanceUnit]})`} htmlFor="ff-rd" tip="Distance actually flown, from a tracker or simulator. The great-circle distance is always calculated from the airports.">
              <input id="ff-rd" className="input mono" inputMode="decimal" value={f.recordedDistanceKm != null ? String(Math.round(kmTo(f.recordedDistanceKm, settings.distanceUnit))) : ''} onChange={(e) => { const n = numOrNull(e.target.value); upd({ recordedDistanceKm: n == null ? null : toKm(n, settings.distanceUnit) }); }} placeholder={draft.distanceKm ? `GC ${fmt.distNum(draft.distanceKm)}` : ''} />
            </Field>
            <Field label={`Cruise altitude (${ALT_LABEL[settings.altitudeUnit]})`} htmlFor="ff-alt">
              <input id="ff-alt" className="input mono" inputMode="numeric" value={f.cruiseAltitudeFt != null ? String(Math.round(ftTo(f.cruiseAltitudeFt, settings.altitudeUnit))) : ''} onChange={(e) => { const n = numOrNull(e.target.value); upd({ cruiseAltitudeFt: n == null ? null : Math.round(toFt(n, settings.altitudeUnit)), flightLevel: n != null && settings.altitudeUnit === 'ft' && n >= 10000 ? `FL${Math.round(n / 100)}` : f.flightLevel }); }} />
            </Field>
            <Field label="Flight level" htmlFor="ff-fl"><input id="ff-fl" className="input-mono" placeholder="FL370" value={f.flightLevel} onChange={(e) => upd({ flightLevel: e.target.value.toUpperCase() })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={`Avg GS (${SPEED_LABEL[settings.speedUnit]})`} htmlFor="ff-gs"><input id="ff-gs" className="input mono" inputMode="numeric" value={f.avgGroundSpeedKt != null ? String(Math.round(ktTo(f.avgGroundSpeedKt, settings.speedUnit))) : ''} onChange={(e) => { const n = numOrNull(e.target.value); upd({ avgGroundSpeedKt: n == null ? null : toKt(n, settings.speedUnit) }); }} /></Field>
              <Field label={`Max GS (${SPEED_LABEL[settings.speedUnit]})`} htmlFor="ff-mgs"><input id="ff-mgs" className="input mono" inputMode="numeric" value={f.maxGroundSpeedKt != null ? String(Math.round(ktTo(f.maxGroundSpeedKt, settings.speedUnit))) : ''} onChange={(e) => { const n = numOrNull(e.target.value); upd({ maxGroundSpeedKt: n == null ? null : toKt(n, settings.speedUnit) }); }} /></Field>
            </div>
          </div>
        </Section>

        <Section id="aircraft" icon={Plane} title="Aircraft" hint={[f.aircraft.typeCode, f.aircraft.model, f.aircraft.registration].filter(Boolean).join(' · ') || 'Type and registration'} open={open.aircraft} onToggle={() => setOpen({ ...open, aircraft: !open.aircraft })}>
          {knownRegs.length > 0 && (
            <div className="mb-3">
              <div className="mb-1.5 text-[12px] font-medium text-muted">Recent aircraft</div>
              <div className="flex flex-wrap gap-1.5">
                {knownRegs.slice(0, 6).map((a) => (
                  <button type="button" key={a.registration} className={cx('chip h-7 font-mono', f.aircraft.registration === a.registration && 'chip-on')} onClick={() => { sound.tap(); updAc({ ...a }); }}>{a.registration} <span className="text-faint">{a.typeCode}</span></button>
                ))}
              </div>
            </div>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="ICAO type designator" htmlFor="ff-type" tip="The four-character ICAO Doc 8643 code, e.g. A359 for an A350-900 or B789 for a 787-9.">
              <AircraftTypePicker id="ff-type" value={f.aircraft.typeCode} onPick={(t, raw) => t ? updAc({ typeCode: t.code, manufacturer: t.manufacturer, model: t.model }) : updAc({ typeCode: raw })} />
            </Field>
            <Field label="Registration / tail number" htmlFor="ff-reg"><input id="ff-reg" className="input-mono" placeholder="A6-BLA" value={f.aircraft.registration} onChange={(e) => updAc({ registration: e.target.value.toUpperCase() })} /></Field>
            <Field label="Manufacturer" htmlFor="ff-man"><input id="ff-man" className="input" value={f.aircraft.manufacturer} onChange={(e) => updAc({ manufacturer: e.target.value })} /></Field>
            <Field label="Model" htmlFor="ff-mod"><input id="ff-mod" className="input" value={f.aircraft.model} onChange={(e) => updAc({ model: e.target.value })} /></Field>
            <Field label="Variant" htmlFor="ff-var" help="Optional, e.g. ER, 200F, LR"><input id="ff-var" className="input" value={f.aircraft.variant} onChange={(e) => updAc({ variant: e.target.value })} /></Field>
            <Field label="Name or nickname" htmlFor="ff-nick"><input id="ff-nick" className="input" value={f.aircraft.nickname} onChange={(e) => updAc({ nickname: e.target.value })} /></Field>
          </div>
        </Section>

        <Section id="timing" icon={Clock} title="Timing" hint={draft.flightMinutes != null || draft.blockMinutes != null ? `Flight ${fmt.dur(draft.flightMinutes)} · Block ${fmt.dur(draft.blockMinutes)}` : 'Optional — times or durations'} open={open.timing} onToggle={() => setOpen({ ...open, timing: !open.timing })}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <Segmented label="Time entry zone" size="sm" value={zoneMode} onChange={switchZone} options={[{ value: 'airport', label: 'Airport local' }, { value: 'utc', label: 'UTC' }]} />
            <div className="flex items-center gap-1.5 text-[11.5px] text-muted">
              <Globe2 className="h-3.5 w-3.5" />
              {zoneMode === 'utc' ? 'All times in UTC' : <>Dep {zoneOffsetLabel(depZone, computed.times.offBlock)} · Arr {zoneOffsetLabel(arrZone, computed.times.landing)}</>}
            </div>
          </div>
          {zoneMode === 'airport' && (!f.dep || !f.arr) && <p className="mb-3 text-[12px] text-warn">Choose both airports first so local times convert with the right time zones.</p>}
          <div className="grid grid-cols-1 gap-x-4 gap-y-2.5 sm:grid-cols-2">
            {TIME_ROWS.map((r) => {
              const w = computed.walls[r.key];
              const bad = issues.length > 0 && ACTUAL_SEQ.includes(r.key) && !!walls[r.key].time;
              return (
                <div key={r.key} className={cx(r.key === 'offBlock' && 'sm:col-start-1')}>
                  <label htmlFor={`ff-t-${r.key}`} className="mb-1 flex items-center gap-1.5 text-[12px] font-medium text-muted">
                    {r.label}
                    {r.tip && <Tip text={r.tip}><Info className="h-3.5 w-3.5 text-faint" /></Tip>}
                    <span className="ml-auto mono text-[10.5px] text-faint">{r.at === 'dep' ? (f.dep?.iata || f.dep?.ident || 'DEP') : (f.arr?.iata || f.arr?.ident || 'ARR')}</span>
                  </label>
                  <div className="flex gap-1.5">
                    <input id={`ff-t-${r.key}`} type="time" className={cx('input mono flex-1', bad && 'ring-warn/60')} value={walls[r.key].time} onChange={(e) => setWall(r.key, { time: e.target.value })} />
                    <select aria-label={`${r.label} day offset`} className={cx('input mono w-[76px] text-[12px]', w.offset !== 0 && 'text-ice')} value={w.offset} onChange={(e) => setWall(r.key, { offset: Number(e.target.value), auto: false })}>
                      <option value={-1}>−1d</option><option value={0}>±0</option><option value={1}>+1d</option><option value={2}>+2d</option>
                    </select>
                  </div>
                </div>
              );
            })}
          </div>
          {issues.length > 0 && <div className="mt-3 rounded-xl bg-warn/10 px-3 py-2 text-[12.5px] text-warn ring-1 ring-warn/25">{issues.map((i) => <div key={i}>{i}</div>)}</div>}
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-white/[0.03] p-3 ring-1 ring-white/[0.06]">
              <div className="flex items-center gap-1.5 text-[12px] font-medium text-muted">Flight time <Tip text="Airborne time, from takeoff to landing. Calculated from those two times when both are entered; otherwise you can type a duration."><Info className="h-3.5 w-3.5 text-faint" /></Tip></div>
              {minutesBetween(computed.times.takeoff, computed.times.landing) != null ? (
                <div className="mt-1 flex items-baseline gap-2"><span className="mono text-xl">{fmt.dur(draft.flightMinutes)}</span><span className="text-[11px] text-good">calculated</span></div>
              ) : (
                <>
                  <input aria-label="Flight time duration" className="input mono mt-1.5" placeholder="H:MM or decimal" value={manualFlight} onChange={(e) => { setManualFlight(e.target.value); setDirty(true); }} />
                  {errors.manualFlight && <p className="mt-1 text-[12px] text-bad">{errors.manualFlight}</p>}
                </>
              )}
            </div>
            <div className="rounded-xl bg-white/[0.03] p-3 ring-1 ring-white/[0.06]">
              <div className="flex items-center gap-1.5 text-[12px] font-medium text-muted">Block time <Tip text="Off-block to on-block, including taxi. Flight Log never fills block time in from flight time — they're different measurements."><Info className="h-3.5 w-3.5 text-faint" /></Tip></div>
              {minutesBetween(computed.times.offBlock, computed.times.onBlock) != null ? (
                <div className="mt-1 flex items-baseline gap-2"><span className="mono text-xl">{fmt.dur(draft.blockMinutes)}</span><span className="text-[11px] text-good">calculated</span></div>
              ) : (
                <>
                  <input aria-label="Block time duration" className="input mono mt-1.5" placeholder="H:MM or decimal" value={manualBlock} onChange={(e) => { setManualBlock(e.target.value); setDirty(true); }} />
                  {errors.manualBlock && <p className="mt-1 text-[12px] text-bad">{errors.manualBlock}</p>}
                </>
              )}
            </div>
          </div>
        </Section>

        <Section id="pilot" icon={GraduationCap} title="Pilot log" hint={hasPilotData(f) ? PILOT_FIELDS.filter((p) => f.pilot?.[p.key]).map((p) => `${p.label} ${p.kind === 'time' ? fmt.dur(f.pilot![p.key]) : f.pilot![p.key]}`).join(' · ') : 'PIC, dual, night, instrument, cross-country, approaches'} open={!!open.pilot} onToggle={() => setOpen({ ...open, pilot: !open.pilot })}>
          <p className="mb-3 text-[12px] text-muted">For pilots and students. Use H:MM or decimal hours. Tap <span className="text-ice">= flight</span> to copy this flight's total time.{isSim ? ' Simulator time stays separate in every total.' : ''}</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {PILOT_FIELDS.map((p) => (
              <PilotField key={p.key} label={p.label} tip={p.tip} kind={p.kind} value={f.pilot?.[p.key] ?? null}
                total={draft.flightMinutes ?? draft.blockMinutes}
                onChange={(v) => upd({ pilot: { ...emptyPilot(), ...f.pilot, [p.key]: v } })}
                extra={p.key === 'night' ? (
                  <button type="button" className="text-[11px] text-ice hover:text-white disabled:text-faint" disabled={estimateNightMinutes(draft) == null}
                    title="Estimate from the great-circle path and the sun's position (night = sun more than 6° below the horizon)"
                    onClick={() => { const n = estimateNightMinutes(draft); if (n != null) { upd({ pilot: { ...emptyPilot(), ...f.pilot, night: n } }); toast({ kind: 'info', title: `Estimated ${fmt.dur(n)} of night`, body: 'Calculated from the route and the sun’s position. Adjust it if needed.' }); } }}>Estimate</button>
                ) : undefined}
              />
            ))}
          </div>
        </Section>

        <Section id="details" icon={Users} title="Crew, cabin & technical" hint="Role, seat, weather, fuel, landings" open={open.details} onToggle={() => setOpen({ ...open, details: !open.details })}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Your role" htmlFor="ff-role">
              <select id="ff-role" className="input" value={f.role} onChange={(e) => upd({ role: e.target.value as FlightRole })}>
                {(Object.keys(ROLE_LABEL) as FlightRole[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
              </select>
            </Field>
            <Field label={f.role === 'passenger' || !f.role ? 'Seat' : 'Seat / cockpit position'} htmlFor="ff-seat"><input id="ff-seat" className="input mono" placeholder={f.role === 'passenger' ? '32A' : 'Left seat'} value={f.seat} onChange={(e) => upd({ seat: e.target.value })} /></Field>
            <Field label="Purpose" htmlFor="ff-pur"><input id="ff-pur" className="input" placeholder="Holiday, checkride, positioning…" value={f.purpose} onChange={(e) => upd({ purpose: e.target.value })} /></Field>
            <Field label="Passengers on board" htmlFor="ff-pax"><input id="ff-pax" className="input mono" inputMode="numeric" value={f.passengers ?? ''} onChange={(e) => upd({ passengers: numOrNull(e.target.value) })} /></Field>
            <Field label="Crew" htmlFor="ff-crew" className="sm:col-span-2" help="Captain, first officer, instructor or crew notes."><input id="ff-crew" className="input" value={f.crew} onChange={(e) => upd({ crew: e.target.value })} /></Field>
            <Field label="Weather" htmlFor="ff-wx" className="sm:col-span-2"><input id="ff-wx" className="input mono normal-case" placeholder="METAR or a few words" value={f.weather} onChange={(e) => upd({ weather: e.target.value })} /></Field>
            <Field label="Fuel used" htmlFor="ff-fuel">
              <div className="flex gap-1.5">
                <input id="ff-fuel" className="input mono flex-1" inputMode="decimal" value={f.fuel ?? ''} onChange={(e) => upd({ fuel: numOrNull(e.target.value) })} />
                <select aria-label="Fuel unit" className="input w-20" value={f.fuelUnit} onChange={(e) => upd({ fuelUnit: e.target.value as Flight['fuelUnit'] })}><option value="kg">kg</option><option value="lb">lb</option><option value="l">L</option><option value="gal">gal</option></select>
              </div>
            </Field>
            <Field label="Aircraft configuration" htmlFor="ff-cfg"><input id="ff-cfg" className="input" placeholder="e.g. 3-class, 42J/302Y" value={f.configNotes} onChange={(e) => upd({ configNotes: e.target.value })} /></Field>
            <div className="sm:col-span-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {([['takeoffsDay', 'T/O day'], ['takeoffsNight', 'T/O night'], ['landingsDay', 'LDG day'], ['landingsNight', 'LDG night']] as const).map(([k, l]) => (
                <Field key={k} label={l} htmlFor={`ff-${k}`}><input id={`ff-${k}`} className="input mono" inputMode="numeric" value={f[k] ?? ''} onChange={(e) => upd({ [k]: numOrNull(e.target.value) } as any)} /></Field>
              ))}
            </div>
          </div>
        </Section>

        <Section id="story" icon={Sparkles} title="Notes, tags & photos" hint="The memorable bits" open={open.story} onToggle={() => setOpen({ ...open, story: !open.story })}>
          <div className="flex flex-col gap-3">
            <div><div className="mb-1.5 text-[12px] font-medium text-muted">Your rating</div><Stars value={f.rating} onChange={(v) => { sound.tap(); upd({ rating: v }); }} size={20} /></div>
            <Field label="Tags" htmlFor="ff-tag">
              <div className="input flex h-auto min-h-10 flex-wrap items-center gap-1.5 py-1.5">
                {f.tags.map((t) => <button type="button" key={t} className="chip chip-on" onClick={() => upd({ tags: f.tags.filter((x) => x !== t) })} aria-label={`Remove tag ${t}`}>{t} ×</button>)}
                <input id="ff-tag" className="min-w-[120px] flex-1 bg-transparent outline-none placeholder:text-faint" placeholder={f.tags.length ? '' : 'Type and press Enter'} value={tagDraft} onChange={(e) => setTagDraft(e.target.value)} onKeyDown={(e) => {
                  if ((e.key === 'Enter' || e.key === ',') && tagDraft.trim()) { e.preventDefault(); const t = tagDraft.trim().toLowerCase(); if (!f.tags.includes(t)) upd({ tags: [...f.tags, t] }); setTagDraft(''); }
                  if (e.key === 'Backspace' && !tagDraft && f.tags.length) upd({ tags: f.tags.slice(0, -1) });
                }} />
              </div>
              {knownTags.length > 0 && <div className="mt-1.5 flex flex-wrap gap-1">{knownTags.map((t) => <button type="button" key={t} className="chip" onClick={() => upd({ tags: [...f.tags, t] })}>+ {t}</button>)}</div>}
            </Field>
            <Field label="Notes and memorable moments" htmlFor="ff-notes"><textarea id="ff-notes" rows={4} className="input" value={f.notes} onChange={(e) => upd({ notes: e.target.value })} placeholder="Sunrise over the Hindu Kush, smooth landing on 20C…" /></Field>
            <div>
              <div className="mb-1.5 text-[12px] font-medium text-muted">Photos <span className="text-faint">· stored on this device, resized to 1600px</span></div>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {f.photos.map((id) => (
                  <div key={id} className="group relative aspect-[4/3] overflow-hidden rounded-xl bg-deep ring-1 ring-white/10">
                    {photoUrls[id] && <img src={photoUrls[id]} alt="Flight photo" className="h-full w-full object-cover" />}
                    <button type="button" className="absolute right-1.5 top-1.5 btn-icon h-7 w-7 bg-black/60 text-white opacity-90 hover:opacity-100" onClick={() => upd({ photos: f.photos.filter((p) => p !== id) })} aria-label="Remove photo"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                ))}
                <button type="button" onClick={() => fileRef.current?.click()} className="grid aspect-[4/3] place-items-center rounded-xl border border-dashed border-white/15 text-muted hover:border-ice/50 hover:text-ice transition" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); addPhotos(e.dataTransfer.files); }}>
                  <span className="flex flex-col items-center gap-1 text-[12px]"><ImagePlus className="h-5 w-5" />Add photos</span>
                </button>
              </div>
              <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { addPhotos(e.target.files); e.target.value = ''; }} />
            </div>
          </div>
        </Section>
        <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
      </form>
    </Dialog>
  );
}
