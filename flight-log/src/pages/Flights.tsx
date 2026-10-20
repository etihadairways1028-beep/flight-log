import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import * as DM from '@radix-ui/react-dropdown-menu';
import * as Popover from '@radix-ui/react-popover';
import { Plus, Search, SlidersHorizontal, Columns3, ArrowUpDown, ArrowUp, ArrowDown, Trash2, Copy, Download, Bookmark, X, ChevronLeft, ChevronRight, AlertTriangle, Pencil, NotebookTabs } from 'lucide-react';
import { useStore } from '../store/useStore';
import { useFmt } from '../lib/useFmt';
import { applyFilters, emptyFilters, activeFilterCount } from '../lib/filters';
import type { Flight, FlightCategory, FlightFilters, FlightStatus } from '../lib/types';
import { CATEGORY_LABEL, STATUS_LABEL } from '../lib/types';
import { aircraftLabel, aircraftShort, missingFields, routeKey, typeKey, isCounted } from '../lib/flight';
import { code } from '../lib/airports';
import { CategoryBadge, ConfirmDialog, EmptyState, PageHeader, StatusBadge, cx, Glass, Tip } from '../components/ui';
import { FlightCard } from '../components/flight/FlightBits';
import { flightsToCsv } from '../lib/csv';
import { downloadText } from '../lib/download';
import { summarize } from '../lib/stats';
import { sound } from '../lib/sound';

type SortKey = 'date' | 'flight' | 'route' | 'aircraft' | 'reg' | 'airline' | 'time' | 'block' | 'distance' | 'category';
const COLUMNS: { key: SortKey | 'status'; label: string; default: boolean }[] = [
  { key: 'date', label: 'Date', default: true },
  { key: 'flight', label: 'Flight', default: true },
  { key: 'route', label: 'Route', default: true },
  { key: 'aircraft', label: 'Aircraft', default: true },
  { key: 'reg', label: 'Registration', default: true },
  { key: 'airline', label: 'Airline', default: true },
  { key: 'time', label: 'Flight time', default: true },
  { key: 'block', label: 'Block time', default: false },
  { key: 'distance', label: 'Distance', default: true },
  { key: 'category', label: 'Category', default: true },
  { key: 'status', label: 'Status', default: false },
];
const sorters: Record<SortKey, (f: Flight) => string | number> = {
  date: (f) => f.date + (f.times.offBlock ?? f.times.takeoff ?? ''),
  flight: (f) => f.flightNumber || f.callsign,
  route: (f) => routeKey(f, true) ?? '',
  aircraft: (f) => aircraftLabel(f),
  reg: (f) => f.aircraft.registration,
  airline: (f) => f.airline.toLowerCase(),
  time: (f) => f.flightMinutes ?? -1,
  block: (f) => f.blockMinutes ?? -1,
  distance: (f) => f.distanceKm ?? -1,
  category: (f) => f.category,
};

function readCols(): string[] {
  try { const v = JSON.parse(localStorage.getItem('skylog:cols') || 'null'); if (Array.isArray(v)) return v; } catch { /* ignore */ }
  return COLUMNS.filter((c) => c.default).map((c) => c.key);
}

export default function Flights() {
  const flights = useStore((s) => s.data.flights);
  const presets = useStore((s) => s.data.presets);
  const openForm = useStore((s) => s.openForm);
  const del = useStore((s) => s.deleteFlights);
  const restore = useStore((s) => s.restoreFlights);
  const savePreset = useStore((s) => s.savePreset);
  const deletePreset = useStore((s) => s.deletePreset);
  const toast = useStore((s) => s.toast);
  const fmt = useFmt();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();

  const [filters, setFilters] = useState<FlightFilters>(() => fromParams(params));
  useEffect(() => { setFilters(fromParams(params)); }, [params]);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'date', dir: -1 });
  const [cols, setCols] = useState<string[]>(readCols);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<string[] | null>(null);
  const [presetName, setPresetName] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const setF = (p: Partial<FlightFilters>) => { setFilters((f) => ({ ...f, ...p })); setPage(0); };
  useEffect(() => { try { localStorage.setItem('skylog:cols', JSON.stringify(cols)); } catch { /* ignore */ } }, [cols]);

  const filtered = useMemo(() => applyFilters(flights, filters), [flights, filters]);
  const sorted = useMemo(() => {
    const fn = sorters[sort.key];
    return [...filtered].sort((a, b) => { const x = fn(a), y = fn(b); return (x < y ? -1 : x > y ? 1 : 0) * sort.dir; });
  }, [filtered, sort]);
  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const pageRows = sorted.slice(page * pageSize, page * pageSize + pageSize);
  const sum = useMemo(() => summarize(filtered), [filtered]);
  useEffect(() => { if (page >= pages) setPage(pages - 1); }, [pages, page]);

  const options = useMemo(() => ({
    aircraft: [...new Map(flights.filter((f) => typeKey(f) !== 'UNKNOWN').map((f) => [typeKey(f), aircraftLabel(f)])).entries()].sort((a, b) => a[1].localeCompare(b[1])),
    airlines: [...new Set(flights.map((f) => f.airline).filter(Boolean))].sort(),
    airports: [...new Map(flights.flatMap((f) => [f.dep, f.arr]).filter(Boolean).map((a) => [a!.ident, a!])).values()].sort((a, b) => (a.iata || a.ident).localeCompare(b.iata || b.ident)),
    routes: [...new Set(flights.map((f) => routeKey(f)).filter(Boolean) as string[])].sort(),
    tags: [...new Set(flights.flatMap((f) => f.tags))].sort(),
    regs: [...new Set(flights.map((f) => f.aircraft.registration).filter(Boolean))].sort(),
  }), [flights]);

  const toggleSort = (k: SortKey) => setSort((s) => (s.key === k ? { key: k, dir: (s.dir * -1) as 1 | -1 } : { key: k, dir: k === 'date' || k === 'time' || k === 'distance' ? -1 : 1 }));
  const allOnPage = pageRows.length > 0 && pageRows.every((f) => selected.has(f.id));
  const toggleAll = () => setSelected((s) => { const n = new Set(s); if (allOnPage) pageRows.forEach((f) => n.delete(f.id)); else pageRows.forEach((f) => n.add(f.id)); return n; });
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  async function doDelete(ids: string[]) {
    const removed = await del(ids);
    setSelected(new Set());
    sound.warn();
    toast({ kind: 'info', title: `Deleted ${removed.length} flight${removed.length === 1 ? '' : 's'}`, body: 'Totals and charts have been recalculated.', action: { label: 'Undo', run: () => { restore(removed); sound.success(); } } });
  }
  const nFilters = activeFilterCount(filters);
  const show = (k: string) => cols.includes(k);

  const Th = ({ k, label, className }: { k: SortKey; label: string; className?: string }) => (
    <th className={cx('px-3 py-3 font-medium whitespace-nowrap', className)} aria-sort={sort.key === k ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
      <button className="inline-flex items-center gap-1 hover:text-fg" onClick={() => toggleSort(k)}>
        {label}{sort.key === k ? (sort.dir === 1 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-40" />}
      </button>
    </th>
  );

  if (!flights.length) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader eyebrow="Logbook" title="My Flights" />
        <EmptyState icon={<NotebookTabs className="h-5 w-5" />} title="No flights logged yet" body="Add a flight by hand or import a CSV. Every record you add shows up here, searchable and sortable." action={<><button className="btn-primary" onClick={() => openForm()}><Plus className="h-4 w-4" />Log a flight</button><Link to="/reports#import" className="btn-glass">Import CSV</Link></>} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Logbook"
        title="My Flights"
        sub={<><span className="num">{filtered.length}</span> of <span className="num">{flights.length}</span> flights · <span className="num">{fmt.hours(sum.flightMinutes)}</span> h flight time · <span className="num">{fmt.dist(sum.distanceKm)}</span>{sum.excluded > 0 && <> · {sum.excluded} planned/cancelled not in totals</>}</>}
        actions={<button className="btn-primary" onClick={() => openForm()}><Plus className="h-4 w-4" />Log a flight</button>}
      />

      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <input className="input pl-9" placeholder="Search flight number, airport, aircraft, notes…" value={filters.q} onChange={(e) => setF({ q: e.target.value })} aria-label="Search flights" />
        </div>
        <button className={cx('btn-glass', nFilters > (filters.q ? 1 : 0) && 'ring-accent/50 text-ice')} onClick={() => setShowFilters((v) => !v)} aria-expanded={showFilters}><SlidersHorizontal className="h-4 w-4" />Filters{nFilters - (filters.q ? 1 : 0) > 0 && <span className="chip chip-on h-5 px-1.5">{nFilters - (filters.q ? 1 : 0)}</span>}</button>
        <Popover.Root>
          <Popover.Trigger className="btn-glass"><Bookmark className="h-4 w-4" /><span className="hidden sm:inline">Presets</span></Popover.Trigger>
          <Popover.Portal>
            <Popover.Content align="end" sideOffset={6} className="z-[70] w-72 glass-strong rounded-xl2 p-3 shadow-lift animate-rise">
              <div className="label mb-2">Saved filters</div>
              {presets.length === 0 && <p className="mb-2 text-[12.5px] text-muted">Save the current filters to reuse them.</p>}
              <div className="flex flex-col gap-1">
                {presets.map((p) => (
                  <div key={p.id} className="flex items-center gap-1">
                    <button className="flex-1 truncate rounded-lg px-2 py-1.5 text-left text-[13px] hover:bg-white/[0.06]" onClick={() => { setFilters(p.filters); setPage(0); }}>{p.name}</button>
                    <button className="btn-icon btn-ghost h-7 w-7" onClick={() => deletePreset(p.id)} aria-label={`Delete preset ${p.name}`}><X className="h-3.5 w-3.5" /></button>
                  </div>
                ))}
              </div>
              <form className="mt-2 flex gap-1.5" onSubmit={(e) => { e.preventDefault(); if (presetName.trim()) { savePreset(presetName.trim(), filters); setPresetName(''); toast({ kind: 'success', title: 'Preset saved' }); } }}>
                <input className="input h-9" placeholder="Preset name" value={presetName} onChange={(e) => setPresetName(e.target.value)} aria-label="Preset name" />
                <button className="btn-primary btn-sm h-9" disabled={!presetName.trim() || nFilters === 0}>Save</button>
              </form>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
        <DM.Root>
          <DM.Trigger className="btn-glass hidden md:inline-flex"><Columns3 className="h-4 w-4" />Columns</DM.Trigger>
          <DM.Portal>
            <DM.Content align="end" sideOffset={6} className="z-[70] w-52 glass-strong rounded-xl2 p-1.5 shadow-lift animate-rise">
              {COLUMNS.map((c) => (
                <DM.CheckboxItem key={c.key} checked={cols.includes(c.key)} onSelect={(e) => e.preventDefault()} onCheckedChange={(v) => setCols((cs) => (v ? [...cs, c.key] : cs.filter((x) => x !== c.key)))} className="flex h-8 cursor-pointer items-center gap-2 rounded-lg px-2 text-[13px] outline-none data-[highlighted]:bg-white/[0.07]">
                  <span className={cx('grid h-4 w-4 place-items-center rounded border', cols.includes(c.key) ? 'border-accent bg-accent' : 'border-white/20')}>{cols.includes(c.key) && <span className="h-1.5 w-1.5 rounded-sm bg-white" />}</span>{c.label}
                </DM.CheckboxItem>
              ))}
            </DM.Content>
          </DM.Portal>
        </DM.Root>
        <button className="btn-glass" onClick={() => { downloadText(`flightlog-flights-${new Date().toISOString().slice(0, 10)}.csv`, flightsToCsv(sorted), 'text/csv'); sound.success(); }} title="Export the filtered flights as CSV"><Download className="h-4 w-4" /><span className="hidden sm:inline">Export</span></button>
      </div>

      {showFilters && (
        <Glass className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4 animate-rise">
          <div className="sm:col-span-2 lg:col-span-4 flex flex-wrap gap-1.5">
            <span className="mr-1 self-center text-[12px] text-muted">Category</span>
            {(Object.keys(CATEGORY_LABEL) as FlightCategory[]).map((c) => (
              <button key={c} className={cx('chip h-7', filters.categories.includes(c) && 'chip-on')} aria-pressed={filters.categories.includes(c)} onClick={() => setF({ categories: filters.categories.includes(c) ? filters.categories.filter((x) => x !== c) : [...filters.categories, c] })}>{CATEGORY_LABEL[c]}</button>
            ))}
            <span className="mx-2 w-px self-stretch bg-white/10" />
            {(Object.keys(STATUS_LABEL) as FlightStatus[]).map((c) => (
              <button key={c} className={cx('chip h-7', filters.statuses.includes(c) && 'chip-on')} aria-pressed={filters.statuses.includes(c)} onClick={() => setF({ statuses: filters.statuses.includes(c) ? filters.statuses.filter((x) => x !== c) : [...filters.statuses, c] })}>{STATUS_LABEL[c]}</button>
            ))}
          </div>
          <label className="text-[12px] text-muted">From<input type="date" className="input mono mt-1" value={filters.from} onChange={(e) => setF({ from: e.target.value })} /></label>
          <label className="text-[12px] text-muted">To<input type="date" className="input mono mt-1" value={filters.to} onChange={(e) => setF({ to: e.target.value })} /></label>
          <label className="text-[12px] text-muted">Aircraft type<select className="input mt-1" value={filters.aircraft} onChange={(e) => setF({ aircraft: e.target.value })}><option value="">Any aircraft</option>{options.aircraft.map(([k, l]) => <option key={k} value={k}>{k} · {l}</option>)}</select></label>
          <label className="text-[12px] text-muted">Registration<select className="input mt-1" value={filters.registration} onChange={(e) => setF({ registration: e.target.value })}><option value="">Any registration</option>{options.regs.map((r) => <option key={r} value={r}>{r}</option>)}</select></label>
          <label className="text-[12px] text-muted">Airline<select className="input mt-1" value={filters.airline} onChange={(e) => setF({ airline: e.target.value })}><option value="">Any airline</option>{options.airlines.map((a) => <option key={a} value={a}>{a}</option>)}</select></label>
          <label className="text-[12px] text-muted">Airport<select className="input mt-1" value={filters.airport} onChange={(e) => setF({ airport: e.target.value })}><option value="">Any airport</option>{options.airports.map((a) => <option key={a.ident} value={a.ident}>{a.iata || a.ident} · {a.city || a.name}</option>)}</select></label>
          <label className="text-[12px] text-muted">Route<select className="input mt-1" value={filters.route} onChange={(e) => setF({ route: e.target.value })}><option value="">Any route</option>{options.routes.map((r) => <option key={r} value={r}>{r}</option>)}</select></label>
          <label className="text-[12px] text-muted">Tag<select className="input mt-1" value={filters.tag} onChange={(e) => setF({ tag: e.target.value })}><option value="">Any tag</option>{options.tags.map((t) => <option key={t} value={t}>{t}</option>)}</select></label>
          <div className="sm:col-span-2 lg:col-span-4 flex justify-end">
            <button className="btn-ghost btn-sm" onClick={() => { setFilters(emptyFilters()); setParams({}); setPage(0); }} disabled={nFilters === 0}><X className="h-3.5 w-3.5" />Clear all filters</button>
          </div>
        </Glass>
      )}

      {/* active filter chips */}
      {nFilters > 0 && !showFilters && (
        <div className="flex flex-wrap items-center gap-1.5">
          {filters.categories.map((c) => <button key={c} className="chip chip-on" onClick={() => setF({ categories: filters.categories.filter((x) => x !== c) })}>{CATEGORY_LABEL[c]} ×</button>)}
          {filters.statuses.map((c) => <button key={c} className="chip chip-on" onClick={() => setF({ statuses: filters.statuses.filter((x) => x !== c) })}>{STATUS_LABEL[c]} ×</button>)}
          {(['aircraft', 'registration', 'airline', 'airport', 'route', 'tag', 'operator'] as const).filter((k) => filters[k]).map((k) => <button key={k} className="chip chip-on" onClick={() => setF({ [k]: '' } as any)}>{k}: {filters[k]} ×</button>)}
          {(filters.from || filters.to) && <button className="chip chip-on" onClick={() => setF({ from: '', to: '' })}>{filters.from || '…'} → {filters.to || '…'} ×</button>}
          <button className="btn-ghost btn-sm" onClick={() => { setFilters(emptyFilters()); setParams({}); }}>Clear</button>
        </div>
      )}

      {/* bulk bar */}
      {selected.size > 0 && (
        <div className="sticky top-[76px] z-10 flex flex-wrap items-center gap-2 glass-strong rounded-xl2 px-4 py-2.5 animate-rise">
          <span className="text-[13px]"><span className="num font-semibold">{selected.size}</span> selected</span>
          <button className="btn-ghost btn-sm" onClick={() => setSelected(new Set())}>Clear</button>
          <div className="ml-auto flex gap-2">
            <button className="btn-glass btn-sm" onClick={() => downloadText('flightlog-selected.csv', flightsToCsv(flights.filter((f) => selected.has(f.id))), 'text/csv')}><Download className="h-3.5 w-3.5" />Export CSV</button>
            <button className="btn-danger btn-sm" onClick={() => setConfirm([...selected])}><Trash2 className="h-3.5 w-3.5" />Delete</button>
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState title="No flights match these filters" body="Try widening the date range or clearing a filter." action={<button className="btn-glass" onClick={() => { setFilters(emptyFilters()); setParams({}); }}>Clear filters</button>} />
      ) : (
        <>
          {/* desktop table */}
          <div className="hidden md:block glass overflow-hidden rounded-xl2">
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead className="border-b border-white/[0.06]">
                  <tr className="text-left text-[11px] uppercase tracking-[0.1em] text-faint">
                    <th className="w-10 px-3 py-3"><input type="checkbox" className="h-4 w-4 accent-[rgb(59,130,246)]" checked={allOnPage} onChange={toggleAll} aria-label="Select all on this page" /></th>
                    {show('date') && <Th k="date" label="Date" />}
                    {show('flight') && <Th k="flight" label="Flight" />}
                    {show('route') && <Th k="route" label="Route" />}
                    {show('aircraft') && <Th k="aircraft" label="Aircraft" />}
                    {show('reg') && <Th k="reg" label="Reg" />}
                    {show('airline') && <Th k="airline" label="Airline" />}
                    {show('time') && <Th k="time" label="Flight" className="text-right" />}
                    {show('block') && <Th k="block" label="Block" className="text-right" />}
                    {show('distance') && <Th k="distance" label="Distance" className="text-right" />}
                    {show('category') && <Th k="category" label="Category" />}
                    {show('status') && <th className="px-3 py-3 font-medium">Status</th>}
                    <th className="w-24 px-3 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.045]">
                  {pageRows.map((f) => {
                    const miss = missingFields(f);
                    return (
                      <tr key={f.id} className={cx('table-row group', selected.has(f.id) && 'bg-accent/[0.07]')}>
                        <td className="px-3 py-2.5"><input type="checkbox" className="h-4 w-4 accent-[rgb(59,130,246)]" checked={selected.has(f.id)} onChange={() => toggle(f.id)} aria-label={`Select flight ${code(f.dep)} to ${code(f.arr)} on ${f.date}`} /></td>
                        {show('date') && <td className="px-3 py-2.5 num text-muted whitespace-nowrap">{fmt.date(f.date)}</td>}
                        {show('flight') && <td className="px-3 py-2.5 mono whitespace-nowrap"><Link to={`/flights/${f.id}`} className="text-ice hover:text-white">{f.flightNumber || f.callsign || 'View'}</Link></td>}
                        {show('route') && <td className="px-3 py-2.5 mono whitespace-nowrap"><Link to={`/flights/${f.id}`} className="hover:text-ice">{code(f.dep)} <span className="text-faint">→</span> {code(f.arr)}</Link>{miss.length > 0 && f.status !== 'planned' && <Tip text={`Incomplete: missing ${miss.join(', ')}`}><AlertTriangle className="ml-1.5 inline h-3.5 w-3.5 text-warn" /></Tip>}</td>}
                        {show('aircraft') && <td className="px-3 py-2.5 whitespace-nowrap"><span className="mono mr-1.5 text-[11.5px] text-faint">{f.aircraft.typeCode}</span>{aircraftShort(f)}</td>}
                        {show('reg') && <td className="px-3 py-2.5 mono text-muted">{fmt.reg(f)}</td>}
                        {show('airline') && <td className="px-3 py-2.5 max-w-[180px] truncate text-muted">{f.airline || '—'}</td>}
                        {show('time') && <td className="px-3 py-2.5 mono text-right">{fmt.dur(f.flightMinutes)}{f.flightMinutesSource === 'manual' && <span className="ml-1 text-[10px] text-faint" title="Entered as a duration">m</span>}</td>}
                        {show('block') && <td className="px-3 py-2.5 mono text-right text-muted">{fmt.dur(f.blockMinutes)}</td>}
                        {show('distance') && <td className="px-3 py-2.5 mono text-right text-muted whitespace-nowrap">{fmt.dist(f.distanceKm)}</td>}
                        {show('category') && <td className="px-3 py-2.5"><CategoryBadge c={f.category} /></td>}
                        {show('status') && <td className="px-3 py-2.5"><StatusBadge s={f.status} /></td>}
                        <td className="px-3 py-2.5">
                          <div className="flex justify-end gap-0.5 opacity-60 transition group-hover:opacity-100 focus-within:opacity-100">
                            <button className="btn-icon btn-ghost h-7 w-7" onClick={() => openForm(f, 'edit')} aria-label="Edit flight"><Pencil className="h-3.5 w-3.5" /></button>
                            <button className="btn-icon btn-ghost h-7 w-7" onClick={() => openForm(f, 'duplicate')} aria-label="Duplicate flight"><Copy className="h-3.5 w-3.5" /></button>
                            <button className="btn-icon btn-ghost h-7 w-7 hover:text-bad" onClick={() => setConfirm([f.id])} aria-label="Delete flight"><Trash2 className="h-3.5 w-3.5" /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          {/* mobile cards */}
          <div className="grid gap-3 md:hidden">{pageRows.map((f) => <FlightCard key={f.id} f={f} />)}</div>

          {/* pagination */}
          <div className="flex flex-wrap items-center justify-between gap-3 text-[13px] text-muted">
            <div className="flex items-center gap-2">
              Rows
              <select className="input h-8 w-20 text-[13px]" value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(0); }} aria-label="Rows per page">{[25, 50, 100, 250].map((n) => <option key={n} value={n}>{n}</option>)}</select>
              <span className="num">{page * pageSize + 1}–{Math.min(sorted.length, (page + 1) * pageSize)} of {sorted.length}</span>
            </div>
            <div className="flex items-center gap-1">
              <button className="btn-icon btn-glass h-8 w-8" disabled={page === 0} onClick={() => setPage(page - 1)} aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></button>
              <span className="num px-2">Page {page + 1} / {pages}</span>
              <button className="btn-icon btn-glass h-8 w-8" disabled={page >= pages - 1} onClick={() => setPage(page + 1)} aria-label="Next page"><ChevronRight className="h-4 w-4" /></button>
            </div>
          </div>
        </>
      )}

      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(v) => !v && setConfirm(null)}
        title={confirm && confirm.length > 1 ? `Delete ${confirm.length} flights?` : 'Delete this flight?'}
        body={<>This removes {confirm && confirm.length > 1 ? 'these records' : 'the record'} from your logbook and recalculates every total. You can undo straight after.</>}
        onConfirm={() => doDelete(confirm ?? [])}
      />
    </div>
  );
}

function fromParams(p: URLSearchParams): FlightFilters {
  const f = emptyFilters();
  const cat = p.get('category');
  if (cat) f.categories = cat.split(',') as FlightCategory[];
  const st = p.get('status');
  if (st) f.statuses = st.split(',') as FlightStatus[];
  for (const k of ['aircraft', 'registration', 'airline', 'airport', 'route', 'tag', 'from', 'to', 'q', 'operator'] as const) { const v = p.get(k); if (v) (f as any)[k] = v; }
  return f;
}
