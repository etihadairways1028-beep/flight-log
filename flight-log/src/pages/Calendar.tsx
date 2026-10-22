import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DateTime } from 'luxon';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useStore } from '../store/useStore';
import { useFmt } from '../lib/useFmt';
import { calendarDate } from '../lib/time';
import { emptyFlight, aircraftLabel, typeKey } from '../lib/flight';
import { code } from '../lib/airports';
import { CATEGORY_LABEL, type Flight, type FlightCategory } from '../lib/types';
import { CAT_COLOR, Glass, PageHeader, Segmented, cx } from '../components/ui';
import { YearHeatmap } from '../components/charts/Heatmap';
import { FlightCard } from '../components/flight/FlightBits';
import { plural } from '../lib/units';

export default function CalendarPage() {
  const flights = useStore((s) => s.data.flights);
  const settings = useStore((s) => s.settings);
  const openForm = useStore((s) => s.openForm);
  const fmt = useFmt();
  const [view, setView] = useState<'month' | 'year'>('month');
  const [cursor, setCursor] = useState(DateTime.local().startOf('month'));
  const [cat, setCat] = useState<FlightCategory | ''>('');
  const [aircraft, setAircraft] = useState('');
  const [sel, setSel] = useState<string | null>(null);
  const conv = settings.calendarConvention;
  const dateOf = useMemo(() => (f: Flight) => calendarDate(f, conv), [conv]);

  const shown = useMemo(() => flights.filter((f) => f.status !== 'cancelled' && (!cat || f.category === cat) && (!aircraft || typeKey(f) === aircraft)), [flights, cat, aircraft]);
  const byDay = useMemo(() => {
    const m = new Map<string, Flight[]>();
    for (const f of shown) { const d = dateOf(f); m.set(d, [...(m.get(d) ?? []), f]); }
    return m;
  }, [shown, dateOf]);
  const types = useMemo(() => [...new Map(flights.filter((f) => typeKey(f) !== 'UNKNOWN').map((f) => [typeKey(f), aircraftLabel(f)])).entries()].sort(), [flights]);

  const gridStart = cursor.startOf('month').minus({ days: cursor.startOf('month').weekday - 1 });
  const days = Array.from({ length: 42 }, (_, i) => gridStart.plus({ days: i }));
  const today = DateTime.local().toISODate();
  const monthFlights = shown.filter((f) => dateOf(f).startsWith(cursor.toFormat('yyyy-MM')) && f.status !== 'planned');
  const monthMin = monthFlights.reduce((a, f) => a + (f.flightMinutes ?? 0), 0);
  const selFlights = sel ? byDay.get(sel) ?? [] : [];

  const step = (n: number) => { setCursor(view === 'month' ? cursor.plus({ months: n }) : cursor.plus({ years: n })); setSel(null); };
  const quickAdd = (d: string) => { const f = emptyFlight(settings); f.date = d; openForm(f, 'create'); };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader eyebrow="Calendar" title="Activity calendar" sub={`Flights are placed on their ${conv === 'utc' ? 'UTC departure date' : 'departure date, local to the departure airport'}. An overnight flight appears on the day it left. Change this in Settings.`} />
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <button className="btn-icon btn-glass" onClick={() => step(-1)} aria-label={`Previous ${view}`}><ChevronLeft className="h-4 w-4" /></button>
          <button className="btn-glass btn-sm h-9" onClick={() => { setCursor(DateTime.local().startOf('month')); setSel(today!); }}>Today</button>
          <button className="btn-icon btn-glass" onClick={() => step(1)} aria-label={`Next ${view}`}><ChevronRight className="h-4 w-4" /></button>
        </div>
        <h2 className="min-w-[180px] text-[20px] font-semibold tracking-tight">{view === 'month' ? cursor.toFormat('LLLL yyyy') : cursor.toFormat('yyyy')}</h2>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <select aria-label="Category" className="input h-9 w-auto text-[13px]" value={cat} onChange={(e) => setCat(e.target.value as any)}><option value="">All categories</option>{(Object.keys(CATEGORY_LABEL) as FlightCategory[]).map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}</select>
          <select aria-label="Aircraft" className="input h-9 w-auto text-[13px]" value={aircraft} onChange={(e) => setAircraft(e.target.value)}><option value="">All aircraft</option>{types.map(([k, l]) => <option key={k} value={k}>{k} · {l}</option>)}</select>
          <Segmented label="Calendar view" size="sm" value={view} onChange={setView} options={[{ value: 'month', label: 'Month' }, { value: 'year', label: 'Year' }]} />
        </div>
      </div>

      {view === 'month' ? (
        <>
          <div className="flex flex-wrap gap-4 text-[12.5px] text-muted">
            <span><span className="num text-fg">{monthFlights.length}</span> flights</span>
            <span><span className="num text-fg">{fmt.hours(monthMin)}</span> h flight time</span>
            <span><span className="num text-fg">{new Set(monthFlights.map(dateOf)).size}</span> flying days</span>
          </div>
          <Glass className="overflow-hidden p-0">
            <div className="grid grid-cols-7 border-b border-white/[0.06] text-center text-[11px] uppercase tracking-[0.12em] text-faint">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div key={d} className="py-2.5">{d}</div>)}
            </div>
            <div className="grid grid-cols-7">
              {days.map((d) => {
                const iso = d.toISODate()!;
                const fs = byDay.get(iso) ?? [];
                const inMonth = d.month === cursor.month;
                const mins = fs.reduce((a, f) => a + (f.flightMinutes ?? 0), 0);
                return (
                  <div key={iso} role="button" tabIndex={0} onClick={() => setSel(iso)} onKeyDown={(e) => e.key === 'Enter' && setSel(iso)} aria-label={`${d.toFormat('d LLLL')}: ${plural(fs.length, 'flight')}`}
                    className={cx('group relative min-h-[76px] cursor-pointer border-b border-r border-white/[0.05] p-1.5 text-left transition-colors md:min-h-[112px] md:p-2', !inMonth && 'opacity-35', sel === iso ? 'bg-accent/[0.12]' : 'hover:bg-white/[0.03]')}>
                    <div className="flex items-center justify-between">
                      <span className={cx('num grid h-6 w-6 place-items-center rounded-full text-[12px]', iso === today ? 'bg-accent font-semibold text-white' : 'text-muted')}>{d.day}</span>
                      {mins > 0 && <span className="mono hidden text-[10.5px] text-faint md:inline">{fmt.dur(mins)}</span>}
                      <button className="btn-icon btn-ghost hidden h-6 w-6 opacity-0 group-hover:opacity-100 md:inline-flex" onClick={(e) => { e.stopPropagation(); quickAdd(iso); }} aria-label={`Log a flight on ${d.toFormat('d LLLL')}`}><Plus className="h-3.5 w-3.5" /></button>
                    </div>
                    <div className="mt-1 flex flex-col gap-1">
                      {fs.slice(0, 3).map((f) => (
                        <Link key={f.id} to={`/flights/${f.id}`} onClick={(e) => e.stopPropagation()} className={cx('mono hidden truncate rounded-md px-1.5 py-0.5 text-[10.5px] ring-1 md:block', f.status === 'planned' && 'border border-dashed border-white/20 bg-transparent')} style={{ background: f.status === 'planned' ? undefined : `${CAT_COLOR[f.category]}22`, color: CAT_COLOR[f.category], boxShadow: 'none', borderColor: `${CAT_COLOR[f.category]}44` }}>
                          {code(f.dep)}–{code(f.arr)}
                        </Link>
                      ))}
                      {fs.length > 0 && <div className="flex gap-0.5 md:hidden">{fs.slice(0, 4).map((f) => <span key={f.id} className="h-1.5 w-1.5 rounded-full" style={{ background: CAT_COLOR[f.category] }} />)}</div>}
                      {fs.length > 3 && <span className="hidden text-[10.5px] text-faint md:block">+{fs.length - 3} more</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </Glass>
          <div className="flex flex-wrap gap-3">{(Object.keys(CATEGORY_LABEL) as FlightCategory[]).filter((c) => shown.some((f) => f.category === c)).map((c) => <span key={c} className="flex items-center gap-1.5 text-[12px] text-muted"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: CAT_COLOR[c] }} />{CATEGORY_LABEL[c]}</span>)}<span className="flex items-center gap-1.5 text-[12px] text-muted"><span className="h-2.5 w-2.5 rounded-sm border border-dashed border-white/40" />Planned</span></div>
        </>
      ) : (
        <Glass className="p-5">
          <YearHeatmap flights={shown} year={cursor.year} onSelect={setSel} selected={sel} dateOf={dateOf} />
          <div className="mt-5 grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
            {Array.from({ length: 12 }, (_, i) => cursor.set({ month: i + 1 })).map((m) => {
              const fs = shown.filter((f) => dateOf(f).startsWith(m.toFormat('yyyy-MM')) && f.status !== 'planned');
              return (
                <button key={m.month} onClick={() => { setCursor(m.startOf('month')); setView('month'); }} className="rounded-xl bg-white/[0.03] p-3 text-left ring-1 ring-white/[0.06] hover:bg-white/[0.06]">
                  <div className="text-[12px] text-muted">{m.toFormat('LLLL')}</div>
                  <div className="mono mt-1 text-[18px] font-semibold">{fs.length}</div>
                  <div className="mono text-[11px] text-faint">{fmt.hours(fs.reduce((a, f) => a + (f.flightMinutes ?? 0), 0))} h</div>
                </button>
              );
            })}
          </div>
        </Glass>
      )}

      {sel && (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-[15px] font-semibold">{DateTime.fromISO(sel).toFormat('cccc d LLLL yyyy')}</h3>
            <button className="btn-glass btn-sm" onClick={() => quickAdd(sel)}><Plus className="h-3.5 w-3.5" />Log a flight on this day</button>
          </div>
          {selFlights.length ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{selFlights.map((f) => <FlightCard key={f.id} f={f} />)}</div> : <p className="text-[13px] text-muted">No flights on this day.</p>}
        </div>
      )}
    </div>
  );
}
