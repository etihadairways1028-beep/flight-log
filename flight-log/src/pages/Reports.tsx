import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { DateTime } from 'luxon';
import { Globe2, Route, FileText, Download, Upload, Printer, FileJson, FileSpreadsheet, AlertTriangle, CheckCircle2, Copy, ShieldAlert, RefreshCw } from 'lucide-react';
import { useStore } from '../store/useStore';
import { useFmt } from '../lib/useFmt';
import { summarize, groupBy, airportVisits, monthly, sortByDateDesc } from '../lib/stats';
import { aircraftLabel, typeKey, routeKey, isCounted, coerceFlight, dupKey } from '../lib/flight';
import { CSV_FIELDS, autoMap, parseCsv, rowsToFlights, flightsToCsv, csvTemplate, type CsvKey, type RowResult } from '../lib/csv';
import { downloadText, readFileText } from '../lib/download';
import { localRepo } from '../store/db';
import { code, countryName } from '../lib/airports';
import { CATEGORY_LABEL, type Flight } from '../lib/types';
import { ConfirmDialog, Glass, PageHeader, Segmented, cx } from '../components/ui';
import { monthLabel } from '../lib/time';
import { sound } from '../lib/sound';
import { pilotTotals } from '../lib/pilot';
import { PILOT_FIELDS } from '../lib/types';
import { loadExtendedAirports } from '../lib/airports';
import { toKml, toGpx } from '../lib/planExport';
import { plural } from '../lib/units';

type ReportKind = 'review' | 'monthly' | 'annual' | 'aircraft' | 'routes' | 'airports' | 'hours' | 'pilot' | 'custom';
const KINDS: { value: ReportKind; label: string }[] = [
  { value: 'review', label: 'Year in review' }, { value: 'monthly', label: 'Monthly summary' }, { value: 'annual', label: 'Annual report' }, { value: 'aircraft', label: 'Aircraft usage' },
  { value: 'routes', label: 'Routes' }, { value: 'airports', label: 'Airport visits' }, { value: 'hours', label: 'Flight hours' }, { value: 'pilot', label: 'Pilot logbook' }, { value: 'custom', label: 'Custom range' },
];

export default function Reports() {
  const loc = useLocation();
  const importRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (loc.hash === '#import') setTimeout(() => importRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300); }, [loc.hash]);
  const profile = useStore((s) => s.settings.profile);
  return (
    <div className="flex flex-col gap-6">
      <div className="no-print"><PageHeader eyebrow="Reports & export" title="Reports & Export" sub="Printable reports, CSV export, full JSON backups and imports with preview and duplicate detection." /></div>
      {(profile === 'pilot' || profile === 'student') && (
        <div className="no-print flex gap-3 rounded-xl2 bg-warn/[0.07] px-4 py-3 text-[13px] ring-1 ring-warn/20"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warn" /><span>Flight Log is not an officially approved pilot logbook and doesn't claim compliance with EASA, FAA, GCAA or any other authority's logbook requirements. Use these reports as a personal record alongside your official logbook.</span></div>
      )}
      <ReportBuilder />
      <div className="no-print grid gap-5 lg:grid-cols-2">
        <ExportPanel />
        <div ref={importRef} id="import" className="scroll-mt-24"><ImportPanel /></div>
      </div>
    </div>
  );
}

function ReportBuilder() {
  const flights = useStore((s) => s.data.flights);
  const s = useStore((x) => x.settings);
  const ws = useStore((x) => x.workspace);
  const fmt = useFmt();
  const now = DateTime.local();
  const [kind, setKind] = useState<ReportKind>('review');
  const [month, setMonth] = useState(now.toFormat('yyyy-MM'));
  const [year, setYear] = useState(String(now.year));
  const [from, setFrom] = useState(now.minus({ months: 3 }).toISODate()!);
  const [to, setTo] = useState(now.toISODate()!);
  const years = useMemo(() => [...new Set([String(now.year), ...flights.map((f) => f.date.slice(0, 4))])].sort().reverse(), [flights]);

  const [rFrom, rTo, period] = kind === 'monthly' ? [month + '-01', DateTime.fromISO(month + '-01').endOf('month').toISODate()!, monthLabel(month, true)]
    : kind === 'annual' || kind === 'review' ? [`${year}-01-01`, `${year}-12-31`, year]
    : kind === 'custom' ? [from, to, `${fmt.date(from)} – ${fmt.date(to)}`]
    : ['', '', 'All time'];
  const fs = useMemo(() => flights.filter(isCounted).filter((f) => (!rFrom || f.date >= rFrom) && (!rTo || f.date <= rTo)), [flights, rFrom, rTo]);
  const sum = useMemo(() => summarize(fs), [fs]);
  const types = useMemo(() => groupBy(fs, typeKey, aircraftLabel).filter((g) => g.key !== 'UNKNOWN'), [fs]);
  const regs = useMemo(() => groupBy(fs.filter((f) => f.aircraft.registration), (f) => f.aircraft.registration), [fs]);
  const routes = useMemo(() => groupBy(fs, (f) => routeKey(f)), [fs]);
  const visits = useMemo(() => airportVisits(fs), [fs]);
  const months = useMemo(() => monthly(fs), [fs]);
  const cats = useMemo(() => groupBy(fs, (f) => f.category), [fs]);
  const list = sortByDateDesc(fs).reverse();

  const th = 'px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wider text-faint';
  const td = 'px-3 py-2 text-[12.5px]';
  const Table = ({ head, rows }: { head: string[]; rows: (string | number)[][] }) => (
    <div className="overflow-x-auto"><table className="w-full"><thead><tr className="border-b border-white/10">{head.map((h, i) => <th key={h} className={cx(th, i > 0 && 'text-right')}>{h}</th>)}</tr></thead>
      <tbody className="divide-y divide-white/[0.05]">{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={cx(td, j > 0 ? 'mono text-right' : '')}>{c}</td>)}</tr>)}</tbody></table></div>
  );

  return (
    <section>
      <div className="no-print mb-3 flex flex-wrap items-center gap-2">
        <h2 className="mr-2 text-[17px] font-semibold tracking-tight">Reports</h2>
        <div className="hidden overflow-x-auto md:block"><Segmented label="Report type" size="sm" value={kind} onChange={setKind} options={KINDS} /></div>
        <select aria-label="Report type" className="input h-9 w-auto md:hidden" value={kind} onChange={(e) => setKind(e.target.value as ReportKind)}>{KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}</select>
      </div>
      <div className="no-print mb-3 flex flex-wrap items-center gap-2">
        {kind === 'monthly' && <input type="month" aria-label="Month" className="input mono h-9 w-auto" value={month} onChange={(e) => setMonth(e.target.value)} />}
        {(kind === 'annual' || kind === 'review') && <select aria-label="Year" className="input h-9 w-28" value={year} onChange={(e) => setYear(e.target.value)}>{years.map((y) => <option key={y}>{y}</option>)}</select>}
        {kind === 'custom' && <><input type="date" aria-label="From" className="input mono h-9 w-auto" value={from} onChange={(e) => setFrom(e.target.value)} /><span className="text-faint">→</span><input type="date" aria-label="To" className="input mono h-9 w-auto" value={to} onChange={(e) => setTo(e.target.value)} /></>}
        <div className="ml-auto flex gap-2">
          <button className="btn-glass" onClick={() => downloadText(`flightlog-report-${kind}.csv`, flightsToCsv(list), 'text/csv')} disabled={!fs.length}><FileSpreadsheet className="h-4 w-4" />CSV</button>
          <button className="btn-primary" onClick={() => window.print()} disabled={!fs.length}><Printer className="h-4 w-4" />Print / Save as PDF</button>
        </div>
      </div>
      <Glass className="print-area p-6 md:p-8">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-white/10 pb-5">
          <div>
            <div className="label text-ice">Flight Log · {KINDS.find((k) => k.value === kind)!.label}{ws === 'demo' && ' · DEMO DATA'}</div>
            <h3 className="mt-1 text-[26px] font-semibold tracking-tight">{period}</h3>
            {s.displayName && <div className="text-[13px] text-muted">{s.displayName}</div>}
          </div>
          <div className="text-right text-[11.5px] text-faint">Generated {fmt.date(now.toISODate())}<br />Personal record, not an official logbook</div>
        </div>
        {fs.length === 0 ? <p className="py-10 text-center text-[13px] text-muted">No completed flights in this period.</p> : (
          <div className="flex flex-col gap-6 pt-5">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
              {[['Flights', String(sum.flights)], ['Flight time', fmt.dur(sum.flightMinutes)], ['Block time', sum.blockKnown ? fmt.dur(sum.blockMinutes) : '—'], ['Distance', fmt.dist(sum.distanceKm)], ['Airports', String(sum.uniqueAirports)], ['Aircraft types', String(sum.uniqueTypes)]].map(([l, v]) => (
                <div key={l}><div className="text-[11px] uppercase tracking-wider text-faint">{l}</div><div className="mono mt-1 text-[20px] font-semibold">{v}</div></div>
              ))}
            </div>
            {sum.simMinutes > 0 && sum.realMinutes > 0 && <p className="text-[12px] text-muted">Of which real-world {fmt.dur(sum.realMinutes)} and simulator {fmt.dur(sum.simMinutes)}. Flight time is recorded on {sum.flightTimeKnown} of {plural(sum.flights, 'flight')}.</p>}
            {kind === 'review' && <YearReview fs={fs} all={flights} year={year} />}
            {(kind === 'annual' || kind === 'hours' || kind === 'custom') && <div><h4 className="mb-2 text-[14px] font-semibold">By month</h4><Table head={['Month', 'Flights', 'Flight time', 'Real', 'Sim', 'Block']} rows={months.map((m) => [monthLabel(m.month, true), m.flights, fmt.dur(m.minutes), fmt.dur(m.realMinutes), fmt.dur(m.simMinutes), fmt.dur(m.blockMinutes)])} /></div>}
            {kind === 'hours' && <div><h4 className="mb-2 text-[14px] font-semibold">By category</h4><Table head={['Category', 'Flights', 'Flight time', 'Distance']} rows={cats.map((c) => [CATEGORY_LABEL[c.key as keyof typeof CATEGORY_LABEL], c.flights, fmt.dur(c.minutes), fmt.dist(c.distanceKm)])} /></div>}
            {(kind === 'aircraft' || kind === 'annual' || kind === 'hours') && <div><h4 className="mb-2 text-[14px] font-semibold">Aircraft types</h4><Table head={['Type', 'Flights', 'Flight time', 'Distance', 'Last flown']} rows={types.map((t) => [`${t.key} · ${t.label}`, t.flights, fmt.dur(t.minutes), fmt.dist(t.distanceKm), fmt.date(t.last)])} /></div>}
            {kind === 'aircraft' && regs.length > 0 && <div><h4 className="mb-2 text-[14px] font-semibold">Registrations</h4><Table head={['Registration', 'Flights', 'Flight time', 'First', 'Last']} rows={regs.map((r) => [r.key, r.flights, fmt.dur(r.minutes), fmt.date(r.first), fmt.date(r.last)])} /></div>}
            {(kind === 'routes' || kind === 'annual') && <div><h4 className="mb-2 text-[14px] font-semibold">Routes</h4><Table head={['Route', 'Flights', 'Flight time', 'Distance each']} rows={routes.slice(0, kind === 'annual' ? 15 : 200).map((r) => [r.key, r.flights, fmt.dur(r.minutes), fmt.dist(r.distanceKm / r.flights)])} /></div>}
            {kind === 'airports' && <div><h4 className="mb-2 text-[14px] font-semibold">Airport visits</h4><Table head={['Airport', 'Departures', 'Arrivals', 'Total', 'Last visit']} rows={visits.map((v) => [`${v.label} · ${v.name}`, v.departures, v.arrivals, v.total, fmt.date(v.last)])} /></div>}
            {kind === 'pilot' && (() => { const real = fs.filter((f) => f.category !== 'simulator'), sim = fs.filter((f) => f.category === 'simulator'); const rows = [['Real-world', pilotTotals(real)], ['Simulator', pilotTotals(sim)]] as const; return (
              <>
                <div><h4 className="mb-2 text-[14px] font-semibold">Totals</h4><Table head={['', 'Flights', 'Total', 'Block', ...PILOT_FIELDS.map((p) => p.label), 'T/O', 'LDG', 'Night LDG']} rows={rows.filter(([, t]) => t.flights).map(([l, t]) => [l, t.flights, fmt.dur(t.total), fmt.dur(t.block), ...PILOT_FIELDS.map((p) => (p.kind === 'time' ? fmt.dur(t[p.key]) : t[p.key])), t.takeoffs, t.landings, t.nightLandings])} /></div>
                <div><h4 className="mb-2 text-[14px] font-semibold">Flights</h4><Table head={['Date', 'Aircraft', 'Reg', 'Route', 'Total', 'PIC', 'SIC', 'Dual', 'Night', 'IFR', 'LDG D/N', 'Remarks']} rows={list.map((f) => [fmt.date(f.date), f.aircraft.typeCode || '—', fmt.reg(f), `${code(f.dep)}–${code(f.arr)}`, fmt.dur(f.flightMinutes), fmt.dur(f.pilot?.pic), fmt.dur(f.pilot?.sic), fmt.dur(f.pilot?.dual), fmt.dur(f.pilot?.night), fmt.dur((f.pilot?.ifrActual ?? 0) + (f.pilot?.ifrSim ?? 0) || null), `${f.landingsDay ?? 0}/${f.landingsNight ?? 0}`, f.category === 'simulator' ? `SIM ${f.simulator}`.trim() : f.purpose || ''])} /></div>
              </>
            ); })()}
            {(kind === 'monthly' || kind === 'custom') && <div><h4 className="mb-2 text-[14px] font-semibold">Flights</h4><Table head={['Date', 'Flight', 'Route', 'Aircraft', 'Reg', 'Flight', 'Block']} rows={list.map((f) => [fmt.date(f.date), f.flightNumber || f.callsign || '—', `${code(f.dep)}–${code(f.arr)}`, f.aircraft.typeCode || '—', fmt.reg(f), fmt.dur(f.flightMinutes), fmt.dur(f.blockMinutes)])} /></div>}
          </div>
        )}
      </Glass>
      <p className="no-print mt-2 text-[11.5px] text-faint">PDF: choose “Save as PDF” in your browser's print dialog. The report prints on white paper with navigation hidden.</p>
    </section>
  );
}

function YearReview({ fs, all, year }: { fs: Flight[]; all: Flight[]; year: string }) {
  const fmt = useFmt();
  const r = useMemo(() => {
    const before = all.filter(isCounted).filter((f) => f.date < `${year}-01-01`);
    const seenA = new Set(before.flatMap((f) => [f.dep?.ident, f.arr?.ident]).filter(Boolean));
    const seenT = new Set(before.map((f) => f.aircraft.typeCode).filter(Boolean));
    const seenC = new Set(before.flatMap((f) => [f.dep?.country, f.arr?.country]).filter(Boolean));
    const aps = new Set(fs.flatMap((f) => [f.dep?.ident, f.arr?.ident]).filter(Boolean) as string[]);
    const types = new Set(fs.map((f) => f.aircraft.typeCode).filter(Boolean));
    const ctry = new Set(fs.flatMap((f) => [f.dep?.country, f.arr?.country]).filter(Boolean) as string[]);
    const months = monthly(fs).filter((m) => m.flights > 0).sort((a, b) => b.flights - a.flights || b.minutes - a.minutes);
    const top = (k: (f: Flight) => string | null | undefined) => groupBy(fs, k)[0] ?? null;
    const byDist = [...fs].filter((f) => f.distanceKm != null).sort((a, b) => b.distanceKm! - a.distanceKm!);
    const byTime = [...fs].filter((f) => f.flightMinutes != null).sort((a, b) => b.flightMinutes! - a.flightMinutes!);
    const visits = airportVisits(fs);
    const landings = fs.filter((f) => f.landingRateFpm != null).sort((a, b) => Math.abs(a.landingRateFpm!) - Math.abs(b.landingRateFpm!));
    const sorted = sortByDateDesc(fs);
    return {
      newAirports: [...aps].filter((a) => !seenA.has(a)).length, airports: aps.size, newTypes: [...types].filter((t) => !seenT.has(t)).length, types: types.size,
      newCountries: [...ctry].filter((c) => !seenC.has(c)), countries: ctry.size, busiest: months[0] ?? null, route: top((f) => routeKey(f)), airline: top((f) => f.airline || null),
      type: groupBy(fs, typeKey, aircraftLabel).filter((g) => g.key !== 'UNKNOWN')[0] ?? null, far: byDist[0] ?? null, long: byTime[0] ?? null, airport: visits[0] ?? null,
      butter: landings[0] ?? null, first: sorted[sorted.length - 1] ?? null, last: sorted[0] ?? null,
      km: fs.reduce((a, f) => a + (f.distanceKm ?? 0), 0), min: fs.reduce((a, f) => a + (f.flightMinutes ?? 0), 0),
    };
  }, [fs, all, year]);
  const route = (f: Flight) => `${code(f.dep)} → ${code(f.arr)}`;
  const Tile = ({ k, v, sub }: { k: string; v: string; sub?: string }) => (
    <div className="rounded-xl bg-white/[0.03] p-4 ring-1 ring-white/[0.06]"><div className="text-[11px] uppercase tracking-wider text-faint">{k}</div><div className="mt-1 text-[18px] font-semibold">{v}</div>{sub && <div className="mt-0.5 text-[12px] text-muted">{sub}</div>}</div>
  );
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl2 bg-gradient-to-br from-accent/20 to-live/10 p-5 ring-1 ring-white/10">
        <div className="text-[13px] text-muted">In {year} you flew</div>
        <div className="mt-1 text-[28px] font-semibold tracking-tight">{fmt.dist(r.km)}</div>
        <div className="text-[13px] text-muted">That's {(r.km / 40075).toFixed(r.km / 40075 >= 10 ? 0 : 1)}× around the Earth{r.km > 384400 ? ` and ${(r.km / 384400).toFixed(1)}× the distance to the Moon` : ''}, over {fmt.dur(r.min)} in the air.</div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Tile k="Airports" v={`${r.airports}`} sub={r.newAirports ? `${r.newAirports} new to your logbook` : 'No new airports'} />
        <Tile k="Countries" v={`${r.countries}`} sub={r.newCountries.length ? `New: ${r.newCountries.slice(0, 5).map(countryName).join(', ')}${r.newCountries.length > 5 ? ` +${r.newCountries.length - 5}` : ''}` : 'No new countries'} />
        <Tile k="Aircraft types" v={`${r.types}`} sub={r.newTypes ? `${r.newTypes} flown for the first time` : undefined} />
        {r.far && <Tile k="Farthest flight" v={route(r.far)} sub={`${fmt.dist(r.far.distanceKm)} · ${fmt.date(r.far.date)}`} />}
        {r.long && <Tile k="Longest in the air" v={fmt.dur(r.long.flightMinutes)} sub={`${route(r.long)} · ${fmt.date(r.long.date)}`} />}
        {r.busiest && <Tile k="Busiest month" v={monthLabel(r.busiest.month, true)} sub={`${plural(r.busiest.flights, 'flight')} · ${fmt.dur(r.busiest.minutes)}`} />}
        {r.route && r.route.flights > 1 && <Tile k="Favourite route" v={r.route.key} sub={`${plural(r.route.flights, 'time')}`} />}
        {r.airport && <Tile k="Most visited airport" v={r.airport.label} sub={`${r.airport.name} · ${r.airport.total} visits`} />}
        {r.type && <Tile k="Most flown type" v={r.type.key} sub={`${r.type.label} · ${plural(r.type.flights, 'flight')}`} />}
        {r.airline && <Tile k="Top airline" v={r.airline.key} sub={`${plural(r.airline.flights, 'flight')}`} />}
        {r.butter && <Tile k="Smoothest landing" v={`${Math.abs(r.butter.landingRateFpm!)} fpm`} sub={`${route(r.butter)} · ${fmt.date(r.butter.date)}`} />}
        {r.first && <Tile k="First and last" v={`${route(r.first)}`} sub={`${fmt.date(r.first.date)}${r.last && r.last !== r.first ? ` … ${route(r.last)} on ${fmt.date(r.last.date)}` : ''}`} />}
      </div>
    </div>
  );
}

function ExportPanel() {
  const flights = useStore((s) => s.data.flights);
  const data = useStore((s) => s.data);
  const settings = useStore((s) => s.settings);
  const ws = useStore((s) => s.workspace);
  const toast = useStore((s) => s.toast);
  const [withPhotos, setWithPhotos] = useState(true);
  const stamp = new Date().toISOString().slice(0, 10);
  async function backup() {
    const photos: Record<string, string> = {};
    if (withPhotos) for (const f of flights) for (const id of f.photos) { const p = await localRepo.getPhoto(id); if (p) photos[id] = p.dataUrl; }
    const payload = { app: 'Flight Log', format: 1, exportedAt: new Date().toISOString(), workspace: ws, settings: { ...settings, avatar: null }, flights, presets: data.presets, customAircraft: data.customAircraft, photos };
    downloadText(`flightlog-backup-${ws}-${stamp}.json`, JSON.stringify(payload, null, 1), 'application/json');
    sound.success();
    toast({ kind: 'success', title: 'Backup downloaded', body: `${plural(flights.length, 'flight')}${withPhotos ? `, ${Object.keys(photos).length} photos` : ''}` });
  }
  return (
    <Glass className="p-5">
      <div className="mb-4 flex items-center gap-2"><Download className="h-4 w-4 text-ice" /><h2 className="text-[15px] font-semibold">Export</h2></div>
      <div className="flex flex-col gap-3">
        <Row icon={FileSpreadsheet} title="CSV of all flights" body="Opens in Excel, Numbers or Google Sheets. Uses the documented Flight Log columns." action={<button className="btn-glass btn-sm" disabled={!flights.length} onClick={() => { downloadText(`flightlog-flights-${stamp}.csv`, flightsToCsv(sortByDateDesc(flights).reverse()), 'text/csv'); sound.success(); }}>Download</button>} />
        <Row icon={FileJson} title="Full JSON backup" body={<>Every field, saved filters and custom aircraft.<label className="mt-1.5 flex items-center gap-2 text-[12px]"><input type="checkbox" className="accent-[rgb(59,130,246)]" checked={withPhotos} onChange={(e) => setWithPhotos(e.target.checked)} />Include photos (larger file)</label></>} action={<button className="btn-primary btn-sm" onClick={backup}>Back up</button>} />
        <Row icon={Globe2} title="Google Earth (KML)" body="Every flight as a line: recorded tracks in 3D, filed routes, or the great circle, plus your airports." action={<button className="btn-glass btn-sm" disabled={!flights.length} onClick={() => { downloadText(`flightlog-${stamp}.kml`, toKml(sortByDateDesc(flights).filter((f) => f.status !== 'cancelled')), 'application/vnd.google-earth.kml+xml'); sound.success(); }}>KML</button>} />
        <Row icon={Route} title="GPX tracks" body="For mapping apps (Strava-style viewers, QGIS, Garmin). Recorded sim flights keep altitude and time." action={<button className="btn-glass btn-sm" disabled={!flights.length} onClick={() => { downloadText(`flightlog-${stamp}.gpx`, toGpx(sortByDateDesc(flights).filter((f) => f.status !== 'cancelled')), 'application/gpx+xml'); sound.success(); }}>GPX</button>} />
        <Row icon={FileText} title="CSV import template" body="Column headers with one example row. Fill it in and import below." action={<button className="btn-glass btn-sm" onClick={() => downloadText('flightlog-import-template.csv', csvTemplate(), 'text/csv')}>Template</button>} />
      </div>
      <details className="mt-4 rounded-xl bg-white/[0.03] p-3 text-[12px] text-muted ring-1 ring-white/[0.06]">
        <summary className="cursor-pointer text-[12.5px] text-fg">CSV columns</summary>
        <ul className="mt-2 grid gap-1">{CSV_FIELDS.map((c) => <li key={c.key}><span className="mono text-ice">{c.key}</span>{'required' in c && c.required && <span className="text-warn"> *</span>} — {c.help}</li>)}</ul>
      </details>
    </Glass>
  );
}
function Row({ icon: Icon, title, body, action }: { icon: any; title: string; body: React.ReactNode; action: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-xl bg-white/[0.03] p-3 ring-1 ring-white/[0.06]">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
      <div className="min-w-0 flex-1"><div className="text-[13.5px] font-medium">{title}</div><div className="text-[12px] text-muted">{body}</div></div>
      <div className="shrink-0">{action}</div>
    </div>
  );
}

function ImportPanel() {
  const flights = useStore((s) => s.data.flights);
  const importFlights = useStore((s) => s.importFlights);
  const replaceFlights = useStore((s) => s.replaceFlights);
  const saveCustom = useStore((s) => s.saveCustomAircraft);
  const toast = useStore((s) => s.toast);
  const ws = useStore((s) => s.workspace);
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [csv, setCsv] = useState<ReturnType<typeof parseCsv> | null>(null);
  const [map, setMap] = useState<Record<CsvKey, string> | null>(null);
  const [json, setJson] = useState<{ flights: Flight[]; errors: string[]; photos: Record<string, string>; custom: any[] } | null>(null);
  const [skipDup, setSkipDup] = useState(true);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const results: RowResult[] = useMemo(() => (csv && map ? rowsToFlights(csv.rows, map, flights) : []), [csv, map, flights]);
  const ok = results.filter((r) => r.flight && (!skipDup || !r.duplicate));
  const bad = results.filter((r) => r.errors.length);
  const dups = results.filter((r) => r.duplicate);
  const jsonDups = useMemo(() => { if (!json) return 0; const k = new Set(flights.map(dupKey)); const ids = new Set(flights.map((f) => f.id)); return json.flights.filter((f) => ids.has(f.id) || k.has(dupKey(f))).length; }, [json, flights]);

  const reset = () => { setCsv(null); setMap(null); setJson(null); setFileName(''); setError(null); };
  async function onFile(file: File) {
    reset();
    setFileName(file.name);
    try {
      const text = await readFileText(file);
      await loadExtendedAirports();
      if (file.name.toLowerCase().endsWith('.json') || text.trim().startsWith('{')) {
        const raw = JSON.parse(text);
        const arr = Array.isArray(raw) ? raw : raw.flights;
        if (!Array.isArray(arr)) throw new Error('This JSON file has no "flights" list. Is it a Flight Log backup?');
        const out: Flight[] = [], errors: string[] = [];
        arr.forEach((r: any, i: number) => { const c = coerceFlight(r); if (c.flight) out.push(c.flight); else errors.push(`Record ${i + 1}: ${c.error}`); });
        setJson({ flights: out, errors, photos: raw.photos ?? {}, custom: raw.customAircraft ?? [] });
      } else {
        const p = parseCsv(text);
        if (!p.headers.length) throw new Error('The CSV has no header row.');
        setCsv(p);
        setMap(autoMap(p.headers));
      }
    } catch (e) {
      setError((e as Error).message.includes('JSON') ? `Couldn't read the file: ${(e as Error).message}` : (e as Error).message);
    }
  }
  async function doCsvImport() {
    setBusy(true);
    const n = await importFlights(ok.map((r) => r.flight!), `${fileName}: ${ok.length} added${dups.length && skipDup ? `, ${dups.length} duplicates skipped` : ''}${bad.length ? `, ${bad.length} rows with errors skipped` : ''}`);
    setBusy(false);
    sound.success();
    toast({ kind: 'success', title: `Imported ${plural(n, 'flight')}`, body: 'Your stats and map are up to date.' });
    reset();
  }
  async function restorePhotos() {
    for (const [id, dataUrl] of Object.entries(json?.photos ?? {})) await localRepo.putPhoto({ id, dataUrl: String(dataUrl), caption: '', createdAt: new Date().toISOString() });
    for (const c of json?.custom ?? []) if (c?.id && c?.registration) await saveCustom(c);
  }
  async function doJsonMerge() {
    if (!json) return;
    setBusy(true);
    await restorePhotos();
    const ids = new Set(flights.map((f) => f.id)), keys = new Set(flights.map(dupKey));
    const add = json.flights.filter((f) => !ids.has(f.id) && (!skipDup || !keys.has(dupKey(f))));
    await importFlights(add, `${fileName}: merged ${add.length}`);
    setBusy(false);
    toast({ kind: 'success', title: `Merged ${plural(add.length, 'flight')}`, body: `${json.flights.length - add.length} already in your logbook were skipped.` });
    reset();
  }
  async function doJsonReplace() {
    if (!json) return;
    await restorePhotos();
    await replaceFlights(json.flights);
    toast({ kind: 'success', title: 'Logbook restored', body: `${plural(json.flights.length, 'flight')} from ${fileName}` });
    reset();
  }

  return (
    <Glass className="p-5">
      <div className="mb-1 flex items-center gap-2"><Upload className="h-4 w-4 text-ice" /><h2 className="text-[15px] font-semibold">Import</h2>{ws === 'demo' && <span className="chip text-warn ring-warn/30">into DEMO workspace</span>}</div>
      <p className="mb-4 text-[12.5px] text-muted">CSV files (any column names; you map them) or a Flight Log JSON backup. You'll see a preview first. Nothing is overwritten without confirmation.</p>
      {!csv && !json && (
        <button className="flex w-full flex-col items-center gap-2 rounded-xl2 border border-dashed border-white/15 px-4 py-10 text-center text-muted transition hover:border-ice/50 hover:text-ice" onClick={() => fileRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) onFile(f); }}>
          <Upload className="h-6 w-6" /><span className="text-[13.5px] font-medium text-fg">Choose a .csv or .json file</span><span className="text-[12px]">or drop it here</span>
        </button>
      )}
      <input ref={fileRef} type="file" accept=".csv,.json,text/csv,application/json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />
      {error && <div role="alert" className="mt-3 flex gap-2 rounded-xl bg-bad/10 p-3 text-[12.5px] text-bad ring-1 ring-bad/25"><AlertTriangle className="h-4 w-4 shrink-0" />{error}</div>}

      {csv && map && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between text-[13px]"><span className="mono truncate text-ice">{fileName}</span><span className="text-muted">{csv.rows.length} rows</span></div>
          <div>
            <div className="label mb-2">Field mapping</div>
            <div className="grid max-h-64 grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
              {CSV_FIELDS.map((c) => (
                <label key={c.key} className="flex items-center gap-2 text-[12px]">
                  <span className={cx('w-28 shrink-0 truncate', 'required' in c && c.required ? 'text-fg' : 'text-muted')}>{c.label}{'required' in c && c.required && <span className="text-warn">*</span>}</span>
                  <select className="input h-8 text-[12px]" value={map[c.key]} onChange={(e) => setMap({ ...map, [c.key]: e.target.value })} aria-label={`Column for ${c.label}`}>
                    <option value="">— not imported —</option>{csv.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                </label>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-good/10 p-2.5 ring-1 ring-good/25"><div className="mono text-[18px] font-semibold text-good">{results.filter((r) => r.flight && !r.duplicate).length}</div><div className="text-[11px] text-muted">ready</div></div>
            <div className="rounded-xl bg-warn/10 p-2.5 ring-1 ring-warn/25"><div className="mono text-[18px] font-semibold text-warn">{dups.length}</div><div className="text-[11px] text-muted">duplicates</div></div>
            <div className="rounded-xl bg-bad/10 p-2.5 ring-1 ring-bad/25"><div className="mono text-[18px] font-semibold text-bad">{bad.length}</div><div className="text-[11px] text-muted">errors</div></div>
          </div>
          <label className="flex items-center gap-2 text-[12.5px]"><input type="checkbox" className="accent-[rgb(59,130,246)]" checked={skipDup} onChange={(e) => setSkipDup(e.target.checked)} />Skip duplicates (same date, route and flight number already logged)</label>
          <div className="max-h-64 overflow-auto rounded-xl ring-1 ring-white/[0.07]">
            <table className="w-full text-[12px]">
              <thead className="sticky top-0 bg-night"><tr className="text-left text-faint"><th className="px-2.5 py-2 font-medium">Row</th><th className="px-2.5 py-2 font-medium">Date</th><th className="px-2.5 py-2 font-medium">Route</th><th className="px-2.5 py-2 font-medium">Time</th><th className="px-2.5 py-2 font-medium">Status</th></tr></thead>
              <tbody className="divide-y divide-white/[0.05]">
                {results.slice(0, 200).map((r) => (
                  <tr key={r.row} className={cx(r.errors.length ? 'bg-bad/[0.06]' : r.duplicate ? 'bg-warn/[0.05]' : '')}>
                    <td className="px-2.5 py-1.5 mono text-faint">{r.row}</td>
                    <td className="px-2.5 py-1.5 mono">{r.flight?.date ?? '—'}</td>
                    <td className="px-2.5 py-1.5 mono">{r.flight ? `${code(r.flight.dep)}–${code(r.flight.arr)}` : '—'}</td>
                    <td className="px-2.5 py-1.5 mono">{r.flight?.flightMinutes != null ? `${Math.floor(r.flight.flightMinutes / 60)}:${String(r.flight.flightMinutes % 60).padStart(2, '0')}` : '—'}</td>
                    <td className="px-2.5 py-1.5">{r.errors.length ? <span className="text-bad">{r.errors.join('; ')}</span> : r.duplicate ? <span className="text-warn">Duplicate</span> : r.warnings.length ? <span className="text-warn">{r.warnings[0]}</span> : <span className="text-good">OK</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {csv.errors.length > 0 && <p className="text-[12px] text-warn">{csv.errors.join(' · ')}</p>}
          <div className="flex justify-end gap-2">
            <button className="btn-glass" onClick={reset}>Cancel</button>
            <button className="btn-primary" disabled={!ok.length || busy || !map.date || !map.departure || !map.arrival} onClick={doCsvImport}><CheckCircle2 className="h-4 w-4" />Import {ok.length} flight{ok.length === 1 ? '' : 's'}</button>
          </div>
        </div>
      )}

      {json && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between text-[13px]"><span className="mono truncate text-ice">{fileName}</span><span className="text-muted">{json.flights.length} valid flights</span></div>
          {json.errors.length > 0 && <div className="rounded-xl bg-bad/10 p-3 text-[12px] text-bad ring-1 ring-bad/25">{json.errors.length} records skipped: {json.errors.slice(0, 3).join('; ')}</div>}
          <div className="grid grid-cols-2 gap-2 text-[12.5px]">
            <div className="rounded-xl bg-white/[0.03] p-3 ring-1 ring-white/[0.06]"><div className="mono text-[18px] font-semibold">{json.flights.length - jsonDups}</div><div className="text-muted">new flights</div></div>
            <div className="rounded-xl bg-white/[0.03] p-3 ring-1 ring-white/[0.06]"><div className="mono text-[18px] font-semibold">{jsonDups}</div><div className="text-muted">already in logbook</div></div>
          </div>
          <label className="flex items-center gap-2 text-[12.5px]"><input type="checkbox" className="accent-[rgb(59,130,246)]" checked={skipDup} onChange={(e) => setSkipDup(e.target.checked)} />Skip duplicates when merging</label>
          <div className="flex flex-wrap justify-end gap-2">
            <button className="btn-glass" onClick={reset}>Cancel</button>
            <button className="btn-glass hover:text-bad" onClick={() => setConfirmReplace(true)}><RefreshCw className="h-4 w-4" />Replace logbook</button>
            <button className="btn-primary" disabled={busy} onClick={doJsonMerge}><Copy className="h-4 w-4" />Merge into logbook</button>
          </div>
        </div>
      )}
      <ConfirmDialog open={confirmReplace} onOpenChange={setConfirmReplace} title="Replace your logbook?" confirmLabel="Replace" body={<>Your current {plural(flights.length, 'flight')} in this workspace will be removed and replaced with the {json?.flights.length ?? 0} flights from <span className="mono">{fileName}</span>. Download a backup first if you might need them.</>} onConfirm={doJsonReplace} />
    </Glass>
  );
}
