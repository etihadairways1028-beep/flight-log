import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { DateTime } from 'luxon';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, AreaChart, Area, LineChart, Line, Cell, ReferenceLine } from 'recharts';
import { BarChart3, Lightbulb, TrendingUp, TrendingDown, X, Info } from 'lucide-react';
import { useStore } from '../store/useStore';
import { useFmt } from '../lib/useFmt';
import { applyFilters, emptyFilters } from '../lib/filters';
import { compareMonths, summarize, monthly, groupBy, airportVisits, domesticSplit, bodySplit, engineSplit, manufacturerSplit, pctChange, type Summary } from '../lib/stats';
import { aircraftLabel, isCounted, isSim, routeKey, typeKey } from '../lib/flight';
import { generateInsights } from '../lib/insights';
import type { Flight, FlightCategory, FlightFilters } from '../lib/types';
import { CATEGORY_LABEL } from '../lib/types';
import { EmptyState, Glass, PageHeader, Segmented, Tip, cx } from '../components/ui';
import { ChartCard, ChartTooltip, RankBars, AXIS, Legend, SERIES } from '../components/charts/ChartKit';
import { YearHeatmap } from '../components/charts/Heatmap';
import { WorldMap, buildMapData } from '../components/map/WorldMap';
import { FlightCard } from '../components/flight/FlightBits';
import { monthLabel, calendarDate } from '../lib/time';
import { code } from '../lib/airports';
import { plural } from '../lib/units';

type Tab = 'time' | 'aircraft' | 'routes' | 'pilot' | 'activity' | 'compare' | 'insights';
const TABS: { value: Tab; label: string }[] = [
  { value: 'time', label: 'Time' }, { value: 'aircraft', label: 'Aircraft' }, { value: 'routes', label: 'Routes' },
  { value: 'pilot', label: 'Pilot' }, { value: 'activity', label: 'Activity' }, { value: 'compare', label: 'Compare' }, { value: 'insights', label: 'Insights' },
];

export default function Analytics() {
  const all = useStore((s) => s.data.flights);
  const openForm = useStore((s) => s.openForm);
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'time';
  const setTab = (t: Tab) => setParams((p) => { p.set('tab', t); return p; }, { replace: true });
  const [f, setF] = useState<FlightFilters>(emptyFilters());
  const flights = useMemo(() => applyFilters(all, f).filter(isCounted), [all, f]);

  if (!all.filter(isCounted).length) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader eyebrow="Analytics" title="Flight Analytics" />
        <EmptyState icon={<BarChart3 className="h-5 w-5" />} title="Analytics appear once you've logged flights" body="Every figure here is calculated from your saved records. Nothing is estimated or invented, so there's nothing to show yet." action={<button className="btn-primary" onClick={() => openForm()}>Log a flight</button>} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader eyebrow="Analytics" title="Flight Analytics" sub="Calculated live from your saved flights. Planned and cancelled flights are never counted; simulator time is always kept separate from real-world time." />
      <FilterBar all={all} f={f} setF={setF} count={flights.length} />
      <div className="overflow-x-auto -mx-1 px-1"><Segmented label="Analytics section" value={tab} onChange={setTab} options={TABS} /></div>
      {flights.length === 0 ? <EmptyState title="No flights match these filters" action={<button className="btn-glass" onClick={() => setF(emptyFilters())}>Clear filters</button>} /> : (
        <>
          {tab === 'time' && <TimeTab flights={flights} />}
          {tab === 'aircraft' && <AircraftTab flights={flights} />}
          {tab === 'routes' && <RoutesTab flights={flights} />}
          {tab === 'pilot' && <PilotTab flights={flights} />}
          {tab === 'activity' && <ActivityTab flights={flights} />}
          {tab === 'compare' && <CompareTab flights={flights} />}
          {tab === 'insights' && <InsightsTab flights={flights} />}
        </>
      )}
    </div>
  );
}

function FilterBar({ all, f, setF, count }: { all: Flight[]; f: FlightFilters; setF: (f: FlightFilters) => void; count: number }) {
  const opts = useMemo(() => ({
    aircraft: [...new Map(all.filter((x) => typeKey(x) !== 'UNKNOWN').map((x) => [typeKey(x), aircraftLabel(x)])).entries()].sort((a, b) => a[0].localeCompare(b[0])),
    airlines: [...new Set(all.map((x) => x.airline).filter(Boolean))].sort(),
    airports: [...new Map(all.flatMap((x) => [x.dep, x.arr]).filter(Boolean).map((a) => [a!.ident, a!])).values()].sort((a, b) => (a.iata || a.ident).localeCompare(b.iata || b.ident)),
    routes: [...new Set(all.map((x) => routeKey(x)).filter(Boolean) as string[])].sort(),
    operators: [...new Set(all.map((x) => x.operator).filter(Boolean))].sort(),
  }), [all]);
  const now = DateTime.local();
  const presets: [string, string, string][] = [
    ['All time', '', ''],
    ['This year', now.startOf('year').toISODate()!, ''],
    ['Last year', now.minus({ years: 1 }).startOf('year').toISODate()!, now.minus({ years: 1 }).endOf('year').toISODate()!],
    ['Last 12 months', now.minus({ months: 12 }).toISODate()!, ''],
  ];
  const catMode = f.categories.length === 0 ? 'all' : f.categories.length === 1 && f.categories[0] === 'simulator' ? 'sim' : 'real';
  const dirty = JSON.stringify(f) !== JSON.stringify(emptyFilters());
  return (
    <Glass className="flex flex-col gap-3 p-3.5">
      <div className="flex flex-wrap items-center gap-2">
        {presets.map(([l, from, to]) => <button key={l} className={cx('chip h-7', f.from === from && f.to === to && 'chip-on')} onClick={() => setF({ ...f, from, to })}>{l}</button>)}
        <input type="date" aria-label="From date" className="input mono h-8 w-[150px] text-[12.5px]" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} />
        <span className="text-faint">→</span>
        <input type="date" aria-label="To date" className="input mono h-8 w-[150px] text-[12.5px]" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} />
        <span className="ml-auto text-[12px] text-muted"><span className="num text-fg">{count}</span> flights in view</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Segmented label="Category" size="sm" value={catMode} onChange={(v) => setF({ ...f, categories: v === 'all' ? [] : v === 'sim' ? ['simulator'] : (Object.keys(CATEGORY_LABEL) as FlightCategory[]).filter((c) => c !== 'simulator') })} options={[{ value: 'all', label: 'Combined' }, { value: 'real', label: 'Real-world' }, { value: 'sim', label: 'Simulator' }]} />
        <select aria-label="Aircraft" className="input h-8 w-auto text-[12.5px]" value={f.aircraft} onChange={(e) => setF({ ...f, aircraft: e.target.value })}><option value="">All aircraft</option>{opts.aircraft.map(([k, l]) => <option key={k} value={k}>{k} · {l}</option>)}</select>
        <select aria-label="Airline" className="input h-8 w-auto text-[12.5px]" value={f.airline} onChange={(e) => setF({ ...f, airline: e.target.value })}><option value="">All airlines</option>{opts.airlines.map((a) => <option key={a}>{a}</option>)}</select>
        <select aria-label="Airport" className="input h-8 w-auto text-[12.5px]" value={f.airport} onChange={(e) => setF({ ...f, airport: e.target.value })}><option value="">All airports</option>{opts.airports.map((a) => <option key={a.ident} value={a.ident}>{a.iata || a.ident} · {a.city || a.name}</option>)}</select>
        <select aria-label="Route" className="input h-8 w-auto text-[12.5px]" value={f.route} onChange={(e) => setF({ ...f, route: e.target.value })}><option value="">All routes</option>{opts.routes.map((r) => <option key={r}>{r}</option>)}</select>
        {opts.operators.length > 0 && <select aria-label="Operator" className="input h-8 w-auto text-[12.5px]" value={f.operator} onChange={(e) => setF({ ...f, operator: e.target.value })}><option value="">All operators</option>{opts.operators.map((r) => <option key={r}>{r}</option>)}</select>}
        {dirty && <button className="btn-ghost btn-sm" onClick={() => setF(emptyFilters())}><X className="h-3.5 w-3.5" />Reset</button>}
      </div>
    </Glass>
  );
}

const KPI_TONES = ['91 155 255', '167 139 250', '94 224 239', '52 211 153', '245 181 68', '247 143 179', '125 211 252', '251 146 60'];
const kpiTone = (label: string) => KPI_TONES[[...label].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) % KPI_TONES.length];
function Kpi({ label, value, sub, tip }: { label: string; value: string; sub?: string; tip?: string }) {
  const tone = kpiTone(label);
  return (
    <div className="stat-card glass relative overflow-hidden rounded-xl2 p-4 pl-5" style={{ ['--tone' as any]: tone }}>
      <span className="absolute inset-y-4 left-0 w-[3px] rounded-r-full" style={{ background: `rgb(${tone})`, boxShadow: `0 0 10px rgb(${tone})` }} />
      <div className="flex items-center gap-1.5 text-[12px] text-muted">{label}{tip && <Tip text={tip}><Info className="h-3 w-3 text-faint" /></Tip>}</div>
      <div className="tone-text mono mt-2 text-[24px] font-semibold leading-none">{value}</div>
      {sub && <div className="mt-1.5 truncate text-[11.5px] text-faint">{sub}</div>}
    </div>
  );
}

function TimeTab({ flights }: { flights: Flight[] }) {
  const fmt = useFmt();
  const nav = useNavigate();
  const s = useMemo(() => summarize(flights), [flights]);
  const nowKey = DateTime.local().toFormat('yyyy-MM');
  const months = useMemo(() => {
    const keys = flights.filter(isCounted).map((f) => f.date.slice(0, 7)).sort();
    const from = [keys[0] ?? nowKey, DateTime.local().minus({ months: 11 }).toFormat('yyyy-MM')].sort()[0];
    const to = [keys[keys.length - 1] ?? nowKey, nowKey].sort().reverse()[0];
    return monthly(flights, from, to).map((m) => ({ ...m, realH: +(m.realMinutes / 60).toFixed(1), simH: +(m.simMinutes / 60).toFixed(1), blockH: +(m.blockMinutes / 60).toFixed(1), cumH: +(m.cumulativeMinutes / 60).toFixed(1) }));
  }, [flights]);
  const activeMonths = months.filter((m) => m.flights > 0).length;
  const years = useMemo(() => {
    const m = new Map<string, { year: string; real: number; sim: number; block: number; flights: number }>();
    for (const f of flights) {
      const y = f.date.slice(0, 4);
      const v = m.get(y) ?? { year: y, real: 0, sim: 0, block: 0, flights: 0 };
      v.flights++;
      if (isSim(f)) v.sim += f.flightMinutes ?? 0; else v.real += f.flightMinutes ?? 0;
      v.block += f.blockMinutes ?? 0;
      m.set(y, v);
    }
    return [...m.values()].sort((a, b) => a.year.localeCompare(b.year));
  }, [flights]);
  const weeks = s.firstDate && s.lastDate ? Math.max(1, DateTime.fromISO(s.lastDate).diff(DateTime.fromISO(s.firstDate), 'weeks').weeks) : 1;
  const hist = useMemo(() => {
    const bins = [[0, 60, '<1h'], [60, 120, '1–2h'], [120, 180, '2–3h'], [180, 300, '3–5h'], [300, 480, '5–8h'], [480, 720, '8–12h'], [720, 9999, '12h+']] as const;
    return bins.map(([a, b, l]) => ({ label: l, n: flights.filter((f) => f.flightMinutes != null && f.flightMinutes >= a && f.flightMinutes < b).length }));
  }, [flights]);
  const byType = useMemo(() => groupBy(flights, typeKey, aircraftLabel).filter((g) => g.key !== 'UNKNOWN').sort((a, b) => b.minutes - a.minutes).slice(0, 8), [flights]);
  const weekly = useMemo(() => {
    const start = DateTime.local().startOf('week').minus({ weeks: 25 });
    return Array.from({ length: 26 }, (_, i) => {
      const w0 = start.plus({ weeks: i }), w1 = w0.plus({ days: 6 });
      const a = w0.toISODate()!, b = w1.toISODate()!;
      return { label: w0.toFormat('d LLL'), flights: flights.filter((f) => f.date >= a && f.date <= b).length };
    });
  }, [flights]);
  const byAirline = useMemo(() => groupBy(flights, (f) => f.airline || null).sort((a, b) => b.minutes - a.minutes).slice(0, 8), [flights]);
  const byRoute = useMemo(() => groupBy(flights, (f) => routeKey(f)).sort((a, b) => b.minutes - a.minutes).slice(0, 8), [flights]);
  const hasSim = s.simMinutes > 0, hasReal = s.realMinutes > 0;

  return (
    <div className="flex flex-col gap-4">
      <MonthCompareCard flights={flights} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label={hasSim && hasReal ? 'Flight time · combined' : 'Flight time'} value={`${fmt.hours(s.flightMinutes)} h`} sub={`${s.flightTimeKnown} of ${plural(s.flights, 'flight')} recorded`} tip="Takeoff to landing. Combined total = real-world + simulator, labelled as such." />
        <Kpi label="Real-world time" value={`${fmt.hours(s.realMinutes)} h`} sub={`${plural(s.realFlights, 'flight')}`} />
        <Kpi label="Simulator time" value={`${fmt.hours(s.simMinutes)} h`} sub={`${plural(s.simFlights, 'flight')}`} />
        <Kpi label="Block time" value={`${fmt.hours(s.blockMinutes)} h`} sub={`${s.blockKnown} of ${plural(s.flights, 'flight')} recorded`} tip="Only flights with block time recorded. Never derived from flight time." />
        <Kpi label="Average flight" value={fmt.dur(s.avgMinutes)} sub={`Median ${fmt.dur(s.medianMinutes)}`} />
        <Kpi label="Longest flight" value={fmt.dur(s.longest?.flightMinutes)} sub={s.longest ? `${code(s.longest.dep)} → ${code(s.longest.arr)} · ${fmt.date(s.longest.date)}` : undefined} />
        <Kpi label="Shortest flight" value={fmt.dur(s.shortest?.flightMinutes)} sub={s.shortest ? `${code(s.shortest.dep)} → ${code(s.shortest.arr)}` : undefined} />
        <Kpi label="Flights per week / month" value={`${(s.flights / weeks).toFixed(2)} / ${(s.flights / Math.max(1, activeMonths)).toFixed(1)}`} sub={`Over ${activeMonths} month${activeMonths === 1 ? '' : 's'} with flights`} />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard className="lg:col-span-2" eyebrow="Monthly totals" title="Flight hours by month" action={<Legend items={[...(hasReal ? [{ label: 'Real-world', color: '#5b9bff' }] : []), ...(hasSim ? [{ label: 'Simulator', color: '#5ee0ef' }] : [])]} />}>
          <div className="h-[260px]"><ResponsiveContainer>
            <BarChart data={months} margin={{ top: 4, right: 4, left: -2, bottom: 0 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="month" tickFormatter={(m) => monthLabel(m)} {...AXIS} minTickGap={20} />
              <YAxis {...AXIS} width={44} />
              <Tooltip cursor={{ fill: 'rgb(255 255 255 / .04)' }} content={<ChartTooltip labelFormat={(m: string) => monthLabel(m, true)} format={(v: number) => `${v} h`} />} />
              {hasReal && <Bar dataKey="realH" name="Real-world" stackId="a" fill="url(#g-blue)" maxBarSize={26} />}
              {hasSim && <Bar dataKey="simH" name="Simulator" stackId="a" fill="url(#g-cyan)" maxBarSize={26} radius={[6, 6, 0, 0]} />}
              {!hasReal && !hasSim && <Bar dataKey="realH" name="Hours" fill="url(#g-blue)" maxBarSize={26} />}
            </BarChart>
          </ResponsiveContainer></div>
        </ChartCard>
        <ChartCard eyebrow="Annual" title="Year over year">
          <div className="h-[170px]"><ResponsiveContainer>
            <BarChart data={years.map((y) => ({ ...y, h: +((y.real + y.sim) / 60).toFixed(1) }))} margin={{ top: 4, right: 4, left: -2, bottom: 0 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="year" {...AXIS} />
              <YAxis {...AXIS} width={44} />
              <Tooltip cursor={{ fill: 'rgb(255 255 255 / .04)' }} content={<ChartTooltip format={(v: number) => `${v} h`} />} />
              <Bar dataKey="h" name="Flight hours" fill="url(#g-violet)" maxBarSize={56} radius={[8, 8, 2, 2]} />
            </BarChart>
          </ResponsiveContainer></div>
          <table className="mt-3 w-full text-[12.5px]">
            <thead><tr className="text-left text-[10.5px] uppercase tracking-wider text-faint"><th className="py-1 font-medium">Year</th><th className="font-medium text-right">Flights</th><th className="font-medium text-right">Hours</th><th className="font-medium text-right">Δ</th></tr></thead>
            <tbody>{years.map((y, i) => { const prev = years[i - 1]; const pc = prev ? pctChange(y.real + y.sim, prev.real + prev.sim) : null; return (
              <tr key={y.year} className="border-t border-white/[0.05]"><td className="py-1.5 mono">{y.year}</td><td className="mono text-right">{y.flights}</td><td className="mono text-right">{fmt.hours(y.real + y.sim)}</td><td className={cx('mono text-right', pc == null ? 'text-faint' : pc >= 0 ? 'text-good' : 'text-warn')}>{pc == null ? '—' : `${pc >= 0 ? '+' : ''}${pc.toFixed(0)}%`}</td></tr>
            ); })}</tbody>
          </table>
          {years.length > 0 && DateTime.local().year === Number(years[years.length - 1].year) && <p className="mt-2 text-[11px] text-faint">{years[years.length - 1].year} is year-to-date.</p>}
        </ChartCard>
        <ChartCard className="lg:col-span-2" eyebrow="Progression" title="Cumulative flight hours">
          <div className="h-[220px]"><ResponsiveContainer>
            <AreaChart data={months} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
              <defs><linearGradient id="cum2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#5b9bff" stopOpacity={0.4} /><stop offset="100%" stopColor="#5b9bff" stopOpacity={0} /></linearGradient></defs>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="month" tickFormatter={(m) => monthLabel(m)} {...AXIS} minTickGap={30} />
              <YAxis {...AXIS} width={52} />
              <Tooltip content={<ChartTooltip labelFormat={(m: string) => monthLabel(m, true)} format={(v: number) => `${v} h`} />} />
              <Area type="monotone" dataKey="cumH" name="Total" stroke="#c4b5fd" strokeWidth={2.5} fill="url(#ga-violet)" />
            </AreaChart>
          </ResponsiveContainer></div>
        </ChartCard>
        <ChartCard eyebrow="Distribution" title="Flight durations" footer="Flights with a recorded flight time.">
          <div className="h-[220px]"><ResponsiveContainer>
            <BarChart data={hist} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="label" {...AXIS} interval={0} />
              <YAxis {...AXIS} allowDecimals={false} width={40} />
              <Tooltip cursor={{ fill: 'rgb(255 255 255 / .04)' }} content={<ChartTooltip />} />
              <Bar dataKey="n" name="Flights" maxBarSize={44} radius={[8, 8, 2, 2]}>{hist.map((_, i) => <Cell key={i} fill={['url(#g-blue)', 'url(#g-cyan)', 'url(#g-violet)', 'url(#g-green)', 'url(#g-amber)', 'url(#g-pink)'][i % 6]} />)}</Bar>
            </BarChart>
          </ResponsiveContainer></div>
        </ChartCard>
        <ChartCard className="lg:col-span-3" eyebrow="Weekly" title="Flights per week (last 26 weeks)" footer="Weeks start on Monday.">
          <div className="h-[180px]"><ResponsiveContainer>
            <BarChart data={weekly} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="label" {...AXIS} minTickGap={24} />
              <YAxis {...AXIS} allowDecimals={false} width={40} />
              <Tooltip cursor={{ fill: 'rgb(255 255 255 / .04)' }} content={<ChartTooltip labelFormat={(l: string) => `Week of ${l}`} />} />
              <Bar dataKey="flights" name="Flights" fill="url(#g-blue)" maxBarSize={22} radius={[6, 6, 2, 2]} />
            </BarChart>
          </ResponsiveContainer></div>
        </ChartCard>
        <ChartCard eyebrow="Time by" title="Aircraft"><RankBars rows={byType.map((g) => ({ key: g.key, label: <><span className="mono mr-2 text-ice">{g.key}</span>{g.label}</>, value: g.minutes / 60 }))} format={(v) => `${v.toFixed(1)} h`} onClick={(k) => nav(`/aircraft/${encodeURIComponent(k)}`)} /></ChartCard>
        <ChartCard eyebrow="Time by" title="Airline" empty={!byAirline.length}><RankBars rows={byAirline.map((g) => ({ key: g.key, label: g.key, value: g.minutes / 60 }))} format={(v) => `${v.toFixed(1)} h`} /></ChartCard>
        <ChartCard eyebrow="Time by" title="Route" empty={!byRoute.length}><RankBars rows={byRoute.map((g) => ({ key: g.key, label: <span className="mono">{g.key}</span>, value: g.minutes / 60, sub: `${g.flights}×` }))} format={(v) => `${v.toFixed(1)} h`} onClick={(k) => nav(`/flights?route=${encodeURIComponent(k)}`)} /></ChartCard>
      </div>
    </div>
  );
}

function AircraftTab({ flights }: { flights: Flight[] }) {
  const nav = useNavigate();
  const byType = useMemo(() => groupBy(flights, typeKey, aircraftLabel).filter((g) => g.key !== 'UNKNOWN'), [flights]);
  const byHours = useMemo(() => [...byType].sort((a, b) => b.minutes - a.minutes), [byType]);
  const variants = useMemo(() => groupBy(flights, (f) => (f.aircraft.model ? `${f.aircraft.model}${f.aircraft.variant ? ' ' + f.aircraft.variant : ''}` : null)).slice(0, 10), [flights]);
  const makers = useMemo(() => manufacturerSplit(flights), [flights]);
  const body = useMemo(() => bodySplit(flights), [flights]);
  const engine = useMemo(() => engineSplit(flights), [flights]);
  const fleet = useMemo(() => {
    const top = byType.slice(0, 5).map((g) => g.key);
    const years = [...new Set(flights.map((f) => f.date.slice(0, 4)))].sort();
    return { top, data: years.map((y) => { const row: any = { year: y }; top.forEach((k) => { row[k] = flights.filter((f) => f.date.startsWith(y) && typeKey(f) === k).length; }); row.Other = flights.filter((f) => f.date.startsWith(y) && !top.includes(typeKey(f))).length; return row; }) };
  }, [flights, byType]);
  const n = flights.length;
  const split = (rows: typeof body) => (
    <>
      <div className="flex h-3 overflow-hidden rounded-full bg-white/[0.06]">{rows.map((g, i) => <div key={g.key} style={{ width: `${(g.flights / n) * 100}%`, background: SERIES[i % SERIES.length] }} title={`${g.key}: ${g.flights}`} />)}</div>
      <ul className="mt-4 flex flex-col gap-2">{rows.map((g, i) => <li key={g.key} className="flex items-center gap-2.5 text-[13px]"><span className="h-2.5 w-2.5 rounded-full" style={{ background: SERIES[i % SERIES.length] }} />{g.key}<span className="mono ml-auto text-muted">{g.flights}</span><span className="mono w-12 text-right text-faint">{Math.round((g.flights / n) * 100)}%</span></li>)}</ul>
    </>
  );
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <ChartCard eyebrow="Most flown" title="By number of flights"><RankBars rows={byType.slice(0, 8).map((g) => ({ key: g.key, label: <><span className="mono mr-2 text-ice">{g.key}</span>{g.label}</>, value: g.flights }))} format={(v) => `${v}`} onClick={(k) => nav(`/aircraft/${encodeURIComponent(k)}`)} /></ChartCard>
      <ChartCard eyebrow="Most flown" title="By hours"><RankBars rows={byHours.slice(0, 8).map((g) => ({ key: g.key, label: <><span className="mono mr-2 text-ice">{g.key}</span>{g.label}</>, value: g.minutes / 60 }))} format={(v) => `${v.toFixed(1)} h`} onClick={(k) => nav(`/aircraft/${encodeURIComponent(k)}`)} /></ChartCard>
      <ChartCard eyebrow="Variants" title="Model & variant breakdown"><RankBars rows={variants.map((g) => ({ key: g.key, label: g.key, value: g.flights }))} format={(v) => `${v}`} /></ChartCard>
      <ChartCard eyebrow="Builders" title="Manufacturer distribution">{split(makers)}</ChartCard>
      <ChartCard eyebrow="Body" title="Wide-body, narrow-body & more" footer="Classification from the ICAO type designator.">{split(body)}</ChartCard>
      <ChartCard eyebrow="Power" title="Jet, turboprop, piston & rotorcraft">{split(engine)}</ChartCard>
      <ChartCard className="lg:col-span-3" eyebrow="Fleet history" title="Aircraft types flown per year" action={<Legend items={[...fleet.top, 'Other'].map((k, i) => ({ label: k, color: k === 'Other' ? '#3a4a6b' : SERIES[i] }))} />}>
        <div className="h-[240px]"><ResponsiveContainer>
          <BarChart data={fleet.data} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="year" {...AXIS} />
            <YAxis {...AXIS} allowDecimals={false} width={40} />
            <Tooltip cursor={{ fill: 'rgb(255 255 255 / .04)' }} content={<ChartTooltip />} />
            {fleet.top.map((k, i) => <Bar key={k} dataKey={k} stackId="a" fill={SERIES[i]} />)}
            <Bar dataKey="Other" stackId="a" fill="#3a4a6b" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer></div>
      </ChartCard>
    </div>
  );
}

function RoutesTab({ flights }: { flights: Flight[] }) {
  const fmt = useFmt();
  const nav = useNavigate();
  const s = useMemo(() => summarize(flights), [flights]);
  const routes = useMemo(() => groupBy(flights, (f) => routeKey(f)), [flights]);
  const longest = useMemo(() => [...flights].filter((f) => f.distanceKm != null).sort((a, b) => b.distanceKm! - a.distanceKm!).filter((f, i, arr) => arr.findIndex((x) => routeKey(x) === routeKey(f)) === i).slice(0, 6), [flights]);
  const deps = useMemo(() => groupBy(flights, (f) => f.dep?.ident, (f) => f.dep?.name ?? '').slice(0, 6), [flights]);
  const arrs = useMemo(() => groupBy(flights, (f) => f.arr?.ident, (f) => f.arr?.name ?? '').slice(0, 6), [flights]);
  const split = useMemo(() => domesticSplit(flights), [flights]);
  const map = useMemo(() => buildMapData(flights), [flights]);
  const visits = useMemo(() => airportVisits(flights), [flights]);
  const trend = useMemo(() => {
    const top = routes.slice(0, 3).map((r) => r.key);
    const ms = monthly(flights).map((m) => m.month);
    return { top, data: ms.map((m) => { const row: any = { month: m }; top.forEach((k) => (row[k] = flights.filter((f) => f.date.startsWith(m) && routeKey(f) === k).length)); return row; }) };
  }, [flights, routes]);
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Total distance" value={fmt.dist(s.distanceKm)} sub={`${plural(s.distanceKnown, 'flight')} with both airports`} />
        <Kpi label="Average route" value={fmt.dist(s.distanceKnown ? s.distanceKm / s.distanceKnown : null)} sub="Great-circle" />
        <Kpi label="Unique routes" value={String(s.uniqueRoutes)} sub="City pairs, either direction" />
        <Kpi label="International share" value={split.domestic + split.international ? `${Math.round((split.international / (split.domestic + split.international)) * 100)}%` : '—'} sub={`${split.international} intl · ${split.domestic} domestic`} />
      </div>
      <ChartCard eyebrow="Heatmap" title="Where you fly" footer="Glow intensity reflects airport visits; lines are great-circle routes. Dashed cyan routes are simulator-only.">
        <div className="-mx-4 -mb-2 md:-mx-5"><WorldMap routes={map.routes} airports={map.airports} heat height={380} onAirport={(a) => nav(`/airports/${a.ident}`)} /></div>
      </ChartCard>
      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard eyebrow="Frequency" title="Most flown routes"><RankBars rows={routes.slice(0, 8).map((r) => ({ key: r.key, label: <span className="mono">{r.key}</span>, value: r.flights }))} format={(v) => `${v}×`} onClick={(k) => nav(`/flights?route=${encodeURIComponent(k)}`)} /></ChartCard>
        <ChartCard eyebrow="Distance" title="Longest routes">
          <ul className="flex flex-col divide-y divide-white/[0.05]">{longest.map((f) => <li key={f.id}><Link to={`/flights/${f.id}`} className="flex items-center justify-between gap-3 py-2 text-[13px] hover:text-ice"><span className="mono">{code(f.dep)} → {code(f.arr)}</span><span className="mono text-muted">{fmt.dist(f.distanceKm)}</span></Link></li>)}</ul>
        </ChartCard>
        <ChartCard eyebrow="Visits" title="Airport visit frequency"><RankBars rows={visits.slice(0, 8).map((v) => ({ key: v.ident, label: <><span className="mono mr-2 text-ice">{v.label}</span>{v.city || v.name}</>, value: v.total }))} format={(v) => `${v}`} onClick={(k) => nav(`/airports/${k}`)} /></ChartCard>
        <ChartCard eyebrow="Origins" title="Top departure airports"><RankBars rows={deps.map((g) => ({ key: g.key, label: <><span className="mono mr-2 text-ice">{g.key}</span>{g.label}</>, value: g.flights }))} format={(v) => `${v}`} onClick={(k) => nav(`/airports/${k}`)} /></ChartCard>
        <ChartCard eyebrow="Destinations" title="Top arrival airports"><RankBars rows={arrs.map((g) => ({ key: g.key, label: <><span className="mono mr-2 text-ice">{g.key}</span>{g.label}</>, value: g.flights }))} format={(v) => `${v}`} onClick={(k) => nav(`/airports/${k}`)} /></ChartCard>
        <ChartCard eyebrow="Over time" title="Top routes by month" action={<Legend items={trend.top.map((k, i) => ({ label: k, color: SERIES[i] }))} />} empty={!trend.top.length}>
          <div className="h-[200px]"><ResponsiveContainer>
            <LineChart data={trend.data} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="month" tickFormatter={(m) => monthLabel(m)} {...AXIS} minTickGap={30} />
              <YAxis {...AXIS} allowDecimals={false} width={40} />
              <Tooltip content={<ChartTooltip labelFormat={(m: string) => monthLabel(m, true)} />} />
              {trend.top.map((k, i) => <Line key={k} type="monotone" dataKey={k} stroke={SERIES[i]} strokeWidth={2} dot={false} />)}
            </LineChart>
          </ResponsiveContainer></div>
        </ChartCard>
      </div>
    </div>
  );
}

function ActivityTab({ flights }: { flights: Flight[] }) {
  const conv = useStore((s) => s.settings.calendarConvention);
  const dateOf = useMemo(() => (f: Flight) => calendarDate(f, conv), [conv]);
  const years = useMemo(() => [...new Set(flights.map((f) => dateOf(f).slice(0, 4)))].sort().reverse(), [flights, dateOf]);
  const [year, setYear] = useState(Number(years[0] ?? DateTime.local().year));
  const [sel, setSel] = useState<string | null>(null);
  const dayFlights = sel ? flights.filter((f) => dateOf(f) === sel) : [];
  return (
    <div className="flex flex-col gap-4">
      <ChartCard eyebrow="Calendar heatmap" title="Daily flight activity" action={<select aria-label="Year" className="input h-8 w-24 text-[13px]" value={year} onChange={(e) => { setYear(Number(e.target.value)); setSel(null); }}>{years.map((y) => <option key={y}>{y}</option>)}</select>} footer={`Grouped by ${conv === 'utc' ? 'UTC departure date' : 'local departure date'} — change this in Settings.`}>
        <YearHeatmap flights={flights} year={year} onSelect={setSel} selected={sel} dateOf={dateOf} />
      </ChartCard>
      {sel && (
        <div>
          <h3 className="mb-3 text-[14px] font-semibold">{DateTime.fromISO(sel).toFormat('cccc d LLLL yyyy')}</h3>
          {dayFlights.length ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{dayFlights.map((f) => <FlightCard key={f.id} f={f} />)}</div> : <p className="text-[13px] text-muted">No flights logged on this day.</p>}
        </div>
      )}
    </div>
  );
}

type CmpMode = 'years' | 'aircraft' | 'airlines' | 'routes' | 'ranges';
function CompareTab({ flights }: { flights: Flight[] }) {
  const fmt = useFmt();
  const [mode, setMode] = useState<CmpMode>('years');
  const options = useMemo(() => {
    switch (mode) {
      case 'years': return [...new Set(flights.map((f) => f.date.slice(0, 4)))].sort().reverse().map((y) => [y, y]);
      case 'aircraft': return groupBy(flights, typeKey, aircraftLabel).filter((g) => g.key !== 'UNKNOWN').map((g) => [g.key, `${g.key} · ${g.label}`]);
      case 'airlines': return groupBy(flights, (f) => f.airline || null).map((g) => [g.key, g.key]);
      case 'routes': return groupBy(flights, (f) => routeKey(f)).map((g) => [g.key, g.key]);
      default: return [];
    }
  }, [flights, mode]) as [string, string][];
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const now = DateTime.local();
  const [ra, setRa] = useState({ from: now.minus({ months: 6 }).toISODate()!, to: now.toISODate()! });
  const [rb, setRb] = useState({ from: now.minus({ months: 12 }).toISODate()!, to: now.minus({ months: 6 }).minus({ days: 1 }).toISODate()! });
  const A = a || options[0]?.[0] || '', B = b || options[1]?.[0] || '';
  const pick = (k: string, which: 'a' | 'b') => {
    if (mode === 'ranges') { const r = which === 'a' ? ra : rb; return flights.filter((f) => f.date >= r.from && f.date <= r.to); }
    return flights.filter((f) => (mode === 'years' ? f.date.startsWith(k) : mode === 'aircraft' ? typeKey(f) === k : mode === 'airlines' ? f.airline === k : routeKey(f) === k));
  };
  const sa = useMemo(() => summarize(pick(A, 'a')), [A, flights, mode, ra]);
  const sb = useMemo(() => summarize(pick(B, 'b')), [B, flights, mode, rb]);
  const labelA = mode === 'ranges' ? `${fmt.date(ra.from)} – ${fmt.date(ra.to)}` : options.find((o) => o[0] === A)?.[1] ?? '—';
  const labelB = mode === 'ranges' ? `${fmt.date(rb.from)} – ${fmt.date(rb.to)}` : options.find((o) => o[0] === B)?.[1] ?? '—';
  const ytdNote = mode === 'years' && (A === String(now.year) || B === String(now.year));
  const rows: { label: string; get: (s: Summary) => number | null; fmt: (v: number) => string; pct: boolean }[] = [
    { label: 'Flights', get: (s) => s.flights, fmt: (v) => String(v), pct: true },
    { label: 'Flight time', get: (s) => s.flightMinutes, fmt: (v) => `${fmt.hours(v)} h`, pct: true },
    { label: 'Block time', get: (s) => s.blockMinutes, fmt: (v) => `${fmt.hours(v)} h`, pct: true },
    { label: 'Distance', get: (s) => s.distanceKm, fmt: (v) => fmt.dist(v), pct: true },
    { label: 'Average flight', get: (s) => s.avgMinutes, fmt: (v) => fmt.dur(v), pct: true },
    { label: 'Unique airports', get: (s) => s.uniqueAirports, fmt: (v) => String(v), pct: false },
    { label: 'Unique routes', get: (s) => s.uniqueRoutes, fmt: (v) => String(v), pct: false },
    { label: 'Aircraft types', get: (s) => s.uniqueTypes, fmt: (v) => String(v), pct: false },
  ];
  const sel = (v: string, set: (v: string) => void, l: string) => <select aria-label={l} className="input" value={v} onChange={(e) => set(e.target.value)}>{options.map(([k, lab]) => <option key={k} value={k}>{lab}</option>)}</select>;
  const range = (r: typeof ra, set: (r: typeof ra) => void, l: string) => <div className="flex gap-2"><input aria-label={`${l} from`} type="date" className="input mono" value={r.from} onChange={(e) => set({ ...r, from: e.target.value })} /><input aria-label={`${l} to`} type="date" className="input mono" value={r.to} onChange={(e) => set({ ...r, to: e.target.value })} /></div>;
  return (
    <div className="flex flex-col gap-4">
      <Segmented label="Comparison type" size="sm" value={mode} onChange={(m) => { setMode(m); setA(''); setB(''); }} options={[{ value: 'years', label: 'Years' }, { value: 'aircraft', label: 'Aircraft' }, { value: 'airlines', label: 'Airlines' }, { value: 'routes', label: 'Routes' }, { value: 'ranges', label: 'Date ranges' }]} />
      {mode !== 'ranges' && options.length < 2 ? <EmptyState title="Need at least two to compare" body={`You have ${options.length} ${mode} in this view. Log more flights or widen the filters.`} /> : (
        <Glass className="overflow-hidden">
          <div className="grid gap-3 border-b border-white/[0.06] p-4 md:grid-cols-2">
            <div><div className="label mb-1.5 text-ice">A</div>{mode === 'ranges' ? range(ra, setRa, 'A') : sel(A, setA, 'Compare A')}</div>
            <div><div className="label mb-1.5">B · baseline</div>{mode === 'ranges' ? range(rb, setRb, 'B') : sel(B, setB, 'Compare B')}</div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead><tr className="text-left text-[11px] uppercase tracking-wider text-faint"><th className="px-4 py-3 font-medium">Metric</th><th className="px-4 py-3 font-medium text-right text-ice">{labelA}</th><th className="px-4 py-3 font-medium text-right">{labelB}</th><th className="px-4 py-3 font-medium text-right">Difference</th><th className="px-4 py-3 font-medium text-right">Change</th></tr></thead>
              <tbody className="divide-y divide-white/[0.05]">
                {rows.map((r) => {
                  const va = r.get(sa), vb = r.get(sb);
                  const diff = va != null && vb != null ? va - vb : null;
                  const pc = r.pct && va != null && vb != null ? pctChange(va, vb) : null;
                  return (
                    <tr key={r.label}>
                      <td className="px-4 py-3 text-muted">{r.label}</td>
                      <td className="px-4 py-3 mono text-right">{va != null ? r.fmt(va) : '—'}</td>
                      <td className="px-4 py-3 mono text-right text-muted">{vb != null ? r.fmt(vb) : '—'}</td>
                      <td className={cx('px-4 py-3 mono text-right', diff == null || diff === 0 ? 'text-faint' : diff > 0 ? 'text-good' : 'text-warn')}>{diff == null ? '—' : `${diff > 0 ? '+' : diff < 0 ? '−' : ''}${r.fmt(Math.abs(diff))}`}</td>
                      <td className={cx('px-4 py-3 mono text-right', pc == null ? 'text-faint' : pc >= 0 ? 'text-good' : 'text-warn')}>{pc == null ? <Tip text={r.pct ? 'Not shown: the baseline is zero, so a percentage would be meaningless.' : 'Percentage change is not meaningful for distinct counts.'}><span>—</span></Tip> : `${pc >= 0 ? '+' : ''}${pc.toFixed(1)}%`}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="border-t border-white/[0.06] px-4 py-3 text-[11.5px] text-faint">Change is measured from B (baseline) to A. {ytdNote && `${now.year} is year-to-date, so it covers fewer days than a full year.`}</p>
        </Glass>
      )}
    </div>
  );
}

function InsightsTab({ flights }: { flights: Flight[] }) {
  const s = useStore((x) => x.settings);
  const list = useMemo(() => generateInsights(flights, s), [flights, s]);
  if (!list.length) return <EmptyState icon={<Lightbulb className="h-5 w-5" />} title="Not enough data for insights yet" body="Insights only appear when your records support them. Log a few more flights." />;
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {list.map((i) => (
        <Glass key={i.id} className="p-5">
          <div className="mb-2 flex items-center gap-2">{i.tone === 'up' ? <TrendingUp className="h-4 w-4 text-good" /> : i.tone === 'down' ? <TrendingDown className="h-4 w-4 text-warn" /> : <Lightbulb className="h-4 w-4 text-ice" />}<span className="text-[15px] font-medium">{i.title}</span></div>
          <p className="text-[13px] text-muted">{i.detail}</p>
          <p className="mt-3 border-t border-white/[0.06] pt-3 text-[12px] text-faint"><span className="text-muted">How it's calculated:</span> {i.how}</p>
          {i.href && <Link to={i.href} className="link mt-2 inline-block text-[12.5px]">See the data</Link>}
        </Glass>
      ))}
    </div>
  );
}

import { pilotWindows } from '../lib/pilot';
import { RecencyCards } from '../components/charts/Recency';
import { PILOT_FIELDS } from '../lib/types';

function PilotTab({ flights }: { flights: Flight[] }) {
  const fmt = useFmt();
  const [sim, setSim] = useState(false);
  const wins = useMemo(() => pilotWindows(flights, sim), [flights, sim]);
  const has = wins[wins.length - 1].totals.flights > 0;
  const cols: { key: string; label: string; get: (t: any) => string }[] = [
    { key: 'flights', label: 'Flights', get: (t) => String(t.flights) },
    { key: 'total', label: 'Total', get: (t) => fmt.dur(t.total) },
    { key: 'block', label: 'Block', get: (t) => fmt.dur(t.block) },
    ...PILOT_FIELDS.map((p) => ({ key: p.key, label: p.label, get: (t: any) => (!t[p.key] ? '—' : p.kind === 'time' ? fmt.dur(t[p.key]) : String(t[p.key])) })),
    { key: 'ldg', label: 'LDG (night)', get: (t) => `${t.landings} (${t.nightLandings})` },
  ];
  return (
    <div className="flex flex-col gap-4">
      {!sim && <RecencyCards flights={flights} />}
      <Glass className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] p-4">
          <h3 className="text-[14px] font-semibold">Pilot totals</h3>
          <Segmented label="Pilot totals source" size="sm" value={sim ? 'sim' : 'real'} onChange={(v) => setSim(v === 'sim')} options={[{ value: 'real', label: 'Real-world' }, { value: 'sim', label: 'Simulator' }]} />
        </div>
        {!has ? <p className="p-6 text-center text-[13px] text-muted">No {sim ? 'simulator' : 'real-world'} flights in view. Pilot times appear once you fill the “Pilot log” section of a flight.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead><tr className="text-left text-[10.5px] uppercase tracking-wider text-faint"><th className="px-4 py-3 font-medium">Period</th>{cols.map((c) => <th key={c.key} className="px-3 py-3 text-right font-medium whitespace-nowrap">{c.label}</th>)}</tr></thead>
              <tbody className="divide-y divide-white/[0.05]">
                {wins.map((w) => <tr key={w.key}><td className="px-4 py-2.5 whitespace-nowrap text-muted">{w.label}</td>{cols.map((c) => <td key={c.key} className="mono px-3 py-2.5 text-right">{c.get(w.totals)}</td>)}</tr>)}
              </tbody>
            </table>
          </div>
        )}
      </Glass>
      <p className="text-[11.5px] text-faint">Recency follows the common “3 takeoffs and landings in 90 days” pattern and only counts real-world flights with takeoffs and landings recorded. It’s an indicator, not legal advice: requirements vary by authority, aircraft class and rating. Flight Log isn't an approved regulatory logbook.</p>
    </div>
  );
}

/** This month vs last month vs your usual month, plus a month-by-month table. */
function MonthCompareCard({ flights }: { flights: Flight[] }) {
  const fmt = useFmt();
  const mc = useMemo(() => compareMonths(flights), [flights]);
  const [showAll, setShowAll] = useState(false);
  const cur = mc.cur, last = mc.last;
  const curL = monthLabel(mc.month, true), lastL = monthLabel(mc.prev, true);
  const pct = (a: number, b: number) => (b > 0 ? Math.round(((a - b) / b) * 100) : null);
  const items = [
    { label: 'Hours', a: cur.minutes / 60, b: last.minutes / 60, avg: mc.avg.minutes / 60, fmtv: (v: number) => `${v.toFixed(1)} h` },
    { label: 'Flights', a: cur.flights, b: last.flights, avg: mc.avg.flights, fmtv: (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1)) },
    { label: `Distance`, a: cur.distanceKm, b: last.distanceKm, avg: mc.avg.distanceKm, fmtv: (v: number) => fmt.dist(v) },
  ];
  const chart = mc.months.map((m) => ({ month: m.month, h: +(m.minutes / 60).toFixed(1), cur: m.month === mc.month }));
  const avgH = +(mc.avg.minutes / 60).toFixed(1);
  const table = [...mc.months].reverse().map((m, i, arr) => ({ ...m, prevMin: arr[i + 1]?.minutes ?? null }));
  const shown = showAll ? table : table.slice(0, 6);
  return (
    <Glass className="p-4 md:p-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-ice">This month</div>
          <h2 className="text-[18px] font-semibold">{curL} compared with {lastL}</h2>
        </div>
        <span className="text-[12px] text-muted">Average = months with flights in the year before</span>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {items.map((it) => {
          const p = pct(it.a, it.b);
          const up = it.a >= it.b;
          const max = Math.max(it.a, it.b, it.avg, 1e-9);
          return (
            <div key={it.label} className="rounded-xl bg-white/[0.04] p-3.5 ring-1 ring-white/[0.07]">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[12px] text-muted">{it.label}</span>
                {p != null ? <span className={cx('flex items-center gap-1 text-[12px] font-medium', up ? 'text-good' : 'text-warn')}>{up ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}{p > 0 ? '+' : ''}{p}%</span> : <span className="text-[12px] text-faint">{it.b ? '' : `none in ${monthLabel(mc.prev)}`}</span>}
              </div>
              <div className="num mt-1 text-[24px] font-semibold">{it.fmtv(it.a)}</div>
              <div className="mt-2 flex flex-col gap-1.5">
                {[[monthLabel(mc.month), it.a, 'bg-gradient-to-r from-accent to-cyan-400'], [monthLabel(mc.prev), it.b, 'bg-white/30'], ['Average', it.avg, 'bg-white/15']].map(([l, v, c]) => (
                  <div key={l as string} className="grid grid-cols-[56px_1fr_64px] items-center gap-2 text-[11px]">
                    <span className="text-muted">{l}</span>
                    <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.05]"><div className={cx('h-full rounded-full', c as string)} style={{ width: `${Math.max(1.5, ((v as number) / max) * 100)}%` }} /></div>
                    <span className="num text-right text-muted">{it.fmtv(v as number)}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <div className="mb-1 text-[12px] text-muted">Hours per month, last 13 months{avgH ? ` · dashed line = your average (${avgH} h)` : ''}</div>
          <div className="h-[200px]"><ResponsiveContainer>
            <BarChart data={chart} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="month" tickFormatter={(m) => monthLabel(m)} {...AXIS} interval={0} tick={{ ...AXIS.tick, fontSize: 10 }} />
              <YAxis {...AXIS} width={38} />
              <Tooltip cursor={{ fill: 'rgb(255 255 255 / .04)' }} content={<ChartTooltip labelFormat={(m: string) => monthLabel(m, true)} format={(v: number) => `${v} h`} />} />
              {avgH > 0 && <ReferenceLine y={avgH} stroke="#a78bfa" strokeDasharray="4 4" />}
              <Bar dataKey="h" name="Hours" maxBarSize={28} radius={[5, 5, 0, 0]}>
                {chart.map((c) => <Cell key={c.month} fill={c.cur ? 'url(#g-cyan)' : 'url(#g-blue)'} fillOpacity={c.cur ? 1 : 0.7} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer></div>
        </div>
        <div>
          <div className="mb-1 text-[12px] text-muted">Month by month</div>
          <div className="overflow-hidden rounded-xl ring-1 ring-white/[0.07]">
            <div className="grid grid-cols-[1fr_52px_64px_64px] gap-2 border-b border-white/[0.07] bg-white/[0.03] px-3 py-1.5 text-[11px] text-muted"><span>Month</span><span className="text-right">Flights</span><span className="text-right">Hours</span><span className="text-right">vs prev</span></div>
            {shown.map((m) => {
              const d = m.prevMin == null ? null : m.minutes - m.prevMin;
              return (
                <div key={m.month} className={cx('grid grid-cols-[1fr_52px_64px_64px] gap-2 border-b border-white/[0.04] px-3 py-1.5 text-[12px] last:border-0', m.month === mc.month && 'bg-accent/10')}>
                  <span>{monthLabel(m.month, true)}</span>
                  <span className="num text-right">{m.flights}</span>
                  <span className="num text-right">{(m.minutes / 60).toFixed(1)}</span>
                  <span className={cx('num text-right', d == null || d === 0 ? 'text-faint' : d > 0 ? 'text-good' : 'text-warn')}>{d == null ? '—' : d === 0 ? '0' : `${d > 0 ? '+' : '−'}${(Math.abs(d) / 60).toFixed(1)}`}</span>
                </div>
              );
            })}
          </div>
          {table.length > 6 && <button className="btn-ghost mt-1 h-8 px-2 text-[12px]" onClick={() => setShowAll((v) => !v)}>{showAll ? 'Show fewer' : `Show all ${plural(table.length, 'month')}`}</button>}
        </div>
      </div>
    </Glass>
  );
}
