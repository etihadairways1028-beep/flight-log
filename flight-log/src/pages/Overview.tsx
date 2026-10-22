import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { DateTime } from 'luxon';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, AreaChart, Area } from 'recharts';
import { Target, Shuffle, Plus, Upload, ArrowUpRight, TrendingUp, TrendingDown, Lightbulb, Plane, Clock, Route, MapPin, Building2, CalendarRange, Timer, Trophy, Ruler, Gauge, Layers, Globe2, ChevronRight } from 'lucide-react';
import { useStore } from '../store/useStore';
import { useFmt } from '../lib/useFmt';
import { summarize, monthly, groupBy, airportVisits, domesticSplit, sortByDateDesc, streaks, goalProgress } from '../lib/stats';
import { generateInsights } from '../lib/insights';
import { aircraftLabel, aircraftShort, isCounted, typeKey } from '../lib/flight';
import { CATEGORY_LABEL, PROFILE_LABEL, type FlightCategory } from '../lib/types';
import { AnimatedNumber, CategoryBadge, Glass, Partial, Photo, Segmented, StatusBadge, cx, CAT_COLOR, Tip } from '../components/ui';
import { ChartCard, ChartTooltip, RankBars, AXIS, Legend } from '../components/charts/ChartKit';
import { FlightCard, RouteBar } from '../components/flight/FlightBits';
import { WorldMap, buildMapData } from '../components/map/WorldMap';
import { PHOTOS, photoForBody, hashStr, nextHeroPhoto } from '../lib/images';
import { aircraftType } from '../lib/aircraftTypes';
import { code } from '../lib/airports';
import { monthLabel } from '../lib/time';
import { plural } from '../lib/units';

type Range = '12' | '24' | 'all';

export default function Overview() {
  const flights = useStore((s) => s.data.flights);
  const s = useStore((x) => x.settings);
  const ws = useStore((x) => x.workspace);
  const openForm = useStore((x) => x.openForm);
  const nav = useNavigate();
  const fmt = useFmt();
  const [range, setRange] = useState<Range>('12');

  const sum = useMemo(() => summarize(flights), [flights]);
  const counted = useMemo(() => flights.filter(isCounted), [flights]);
  const now = DateTime.local();
  const thisMonth = counted.filter((f) => f.date.startsWith(now.toFormat('yyyy-MM'))).length;
  const latest = useMemo(() => sortByDateDesc(counted)[0], [counted]);
  const upcoming = useMemo(() => flights.filter((f) => f.status === 'planned' && f.date >= now.toISODate()!).sort((a, b) => a.date.localeCompare(b.date))[0], [flights]);

  const months = useMemo(() => {
    if (!counted.length) return [];
    const to = now.toFormat('yyyy-MM');
    const from = range === 'all' ? undefined : now.minus({ months: Number(range) - 1 }).toFormat('yyyy-MM');
    return monthly(counted, from ?? counted.map((f) => f.date.slice(0, 7)).sort()[0], to).map((m) => ({ ...m, realH: +(m.realMinutes / 60).toFixed(1), simH: +(m.simMinutes / 60).toFixed(1), cumH: +(m.cumulativeMinutes / 60).toFixed(1) }));
  }, [counted, range]);
  const rangeFlights = useMemo(() => (range === 'all' ? counted : counted.filter((f) => f.date.slice(0, 7) >= (months[0]?.month ?? ''))), [counted, months, range]);
  const byType = useMemo(() => groupBy(rangeFlights, typeKey, aircraftLabel).filter((g) => g.key !== 'UNKNOWN').slice(0, 6), [rangeFlights]);
  const byAirline = useMemo(() => groupBy(rangeFlights, (f) => f.airline || null).slice(0, 6), [rangeFlights]);
  const byCat = useMemo(() => groupBy(rangeFlights, (f) => f.category), [rangeFlights]);
  const topAirports = useMemo(() => airportVisits(rangeFlights).slice(0, 6), [rangeFlights]);
  const split = useMemo(() => domesticSplit(rangeFlights), [rangeFlights]);
  const insights = useMemo(() => generateInsights(flights, s).slice(0, 4), [flights, s]);
  const recent = useMemo(() => sortByDateDesc(flights.filter((f) => f.status !== 'planned')).slice(0, 6), [flights]);
  const mapData = useMemo(() => buildMapData(counted), [counted]);
  const hasSim = sum.simFlights > 0;

  const spark = useMemo(() => (counted.length ? monthly(counted, now.minus({ months: 11 }).toFormat('yyyy-MM'), now.toFormat('yyyy-MM')) : []), [counted]);
  const greeting = now.hour < 5 ? 'Good evening' : now.hour < 12 ? 'Good morning' : now.hour < 18 ? 'Good afternoon' : 'Good evening';
  const [heroPhoto, setHeroPhoto] = useState(nextHeroPhoto);

  const cards: Record<string, { label: string; icon: any; value: number; format?: (n: number) => string; sub?: React.ReactNode; to: string; partial?: [number, number]; tip?: string }> = {
    flights: { label: 'Total flights', icon: Plane, value: sum.flights, to: '/flights', sub: hasSim ? `${sum.realFlights} real · ${sum.simFlights} sim` : sum.excluded ? `${sum.excluded} planned/cancelled not counted` : undefined },
    hours: { label: hasSim ? 'Flight hours (combined)' : 'Flight hours', icon: Clock, value: sum.flightMinutes / 60, format: (n) => n.toLocaleString('en-GB', { maximumFractionDigits: 1, minimumFractionDigits: 1 }), to: '/analytics?tab=time', sub: hasSim ? `${fmt.hours(sum.realMinutes)} real · ${fmt.hours(sum.simMinutes)} sim` : 'Takeoff to landing', partial: [sum.flightTimeKnown, sum.flights], tip: 'Airborne time from takeoff to landing. Simulator and real-world time are shown separately underneath.' },
    block: { label: 'Block hours', icon: Timer, value: sum.blockMinutes / 60, format: (n) => n.toLocaleString('en-GB', { maximumFractionDigits: 1, minimumFractionDigits: 1 }), to: '/analytics?tab=time', sub: sum.blockKnown ? 'Off-block to on-block' : 'Not recorded yet', partial: [sum.blockKnown, sum.flights], tip: 'Gate-to-gate time. Only counted where off-block and on-block (or a block duration) were recorded.' },
    distance: { label: `Distance (${fmt.distUnit})`, icon: Ruler, value: fmt.distNum(sum.distanceKm), to: '/analytics?tab=routes', sub: sum.distanceKm ? `${(sum.distanceKm / 40075).toFixed(2)}× around the equator` : 'Great-circle', partial: [sum.distanceKnown, sum.flights] },
    aircraft: { label: 'Aircraft types', icon: Layers, value: sum.uniqueTypes, to: '/aircraft', sub: sum.uniqueRegistrations ? `${sum.uniqueRegistrations} registrations` : undefined },
    airports: { label: 'Airports', icon: MapPin, value: sum.uniqueAirports, to: '/airports?filter=visited', sub: sum.uniqueCountries ? `${plural(sum.uniqueCountries, 'country')}` : undefined },
    routes: { label: 'Unique routes', icon: Route, value: sum.uniqueRoutes, to: '/map', sub: 'City pairs, either direction' },
    airlines: { label: 'Airlines & operators', icon: Building2, value: sum.airlines, to: '/analytics?tab=aircraft' },
    month: { label: 'This month', icon: CalendarRange, value: thisMonth, to: '/calendar', sub: now.toFormat('LLLL') },
    average: { label: 'Average flight', icon: Gauge, value: sum.avgMinutes ?? NaN, format: (n) => fmt.dur(n), to: '/analytics?tab=time', sub: sum.medianMinutes != null ? `Median ${fmt.dur(sum.medianMinutes)}` : undefined },
    longest: { label: 'Longest flight', icon: Trophy, value: sum.longest?.flightMinutes ?? NaN, format: (n) => fmt.dur(n), to: sum.longest ? `/flights/${sum.longest.id}` : '/flights', sub: sum.longest ? `${code(sum.longest.dep)} → ${code(sum.longest.arr)}` : undefined },
    topType: { label: 'Most-flown aircraft', icon: Plane, value: sum.topType?.flights ?? NaN, format: (n) => `${Math.round(n)}×`, to: sum.topType ? `/aircraft/${encodeURIComponent(sum.topType.key)}` : '/aircraft', sub: sum.topType?.label },
  };

  if (!flights.length) return <GettingStarted />;

  return (
    <div className="flex flex-col gap-6">
      {/* Hero */}
      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Photo key={heroPhoto.id} photo={heroPhoto} priority className="group/hero min-h-[280px] rounded-xl3 shadow-glass md:min-h-[320px]" sizes="(max-width: 1024px) 100vw, 60vw">
          <button onClick={() => setHeroPhoto(nextHeroPhoto())} className="btn-icon absolute right-4 top-4 z-10 h-9 w-9 rounded-xl bg-black/30 text-white/80 opacity-70 backdrop-blur-md transition hover:opacity-100 hover:text-white" aria-label="Show another photo" title="Show another photo"><Shuffle className="h-4 w-4" /></button>
          <div className="flex h-full flex-col justify-between p-6 md:p-8">
            <div className="flex items-center gap-2 text-[12px] text-fg/80">
              <span className="num">{now.toFormat('cccc, d LLLL yyyy')}</span>
              {ws === 'demo' && <span className="rounded bg-warn/25 px-1.5 font-mono text-[10px] font-semibold text-warn">DEMO</span>}
            </div>
            <div>
              <h1 className="text-[34px] font-semibold leading-[1.05] tracking-[-0.03em] md:text-[46px] text-balance">{greeting}{s.displayName ? `, ${s.displayName.split(' ')[0]}` : ''}.</h1>
              <p className="mt-2 max-w-lg text-[14px] text-fg/75">
                {latest ? <>Last logged: <span className="mono text-fg">{code(latest.dep)} → {code(latest.arr)}</span> on {fmt.date(latest.date)}{latest.aircraft.typeCode ? <> aboard the {aircraftShort(latest)}</> : null}.</> : 'Your logbook is ready.'}
                {' '}{plural(sum.flights, 'flight')} and {fmt.hours(sum.flightMinutes)} hours so far.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <button className="btn-primary h-11 px-5" onClick={() => openForm()}><Plus className="h-4 w-4" />Log a flight</button>
                <Link to="/reports#import" className="btn-glass h-11 px-5 backdrop-blur-md"><Upload className="h-4 w-4" />Import flights</Link>
              </div>
            </div>
          </div>
        </Photo>
        <div className="grid gap-4">
          {upcoming ? (
            <Link to={`/flights/${upcoming.id}`} className="glass glass-hover rounded-xl3 p-5">
              <div className="mb-4 flex items-center justify-between">
                <div className="label">Next planned flight</div>
                <span className="chip chip-on">in {Math.max(0, Math.round(DateTime.fromISO(upcoming.date).diff(now.startOf('day'), 'days').days))} days</span>
              </div>
              <RouteBar f={upcoming} size="sm" showTimes={false} />
              <div className="mt-7 text-[12px] text-muted">{fmt.date(upcoming.date)} · {upcoming.flightNumber || aircraftShort(upcoming)}</div>
            </Link>
          ) : latest && (
            <Link to={`/flights/${latest.id}`} className="glass glass-hover rounded-xl3 p-5">
              <div className="mb-4 flex items-center justify-between"><div className="label">Latest flight</div><span className="mono text-[12px] text-ice">{latest.flightNumber || latest.callsign}</span></div>
              <RouteBar f={latest} size="sm" />
              <div className="mt-7 text-[12px] text-muted">{fmt.date(latest.date)} · {aircraftLabel(latest)}</div>
            </Link>
          )}
          <Link to="/map" className="glass glass-hover relative overflow-hidden rounded-xl3" aria-label="Open routes map">
            <WorldMap routes={mapData.routes} airports={mapData.airports} height={170} interactive={false} showLabels={false} spin />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between bg-gradient-to-t from-ink/90 to-transparent p-4">
              <div><div className="label">Routes & map</div><div className="text-[13px] text-fg/90">{plural(sum.uniqueRoutes, 'route')} · {plural(sum.uniqueAirports, 'airport')} · {plural(sum.uniqueCountries, 'country')}</div></div>
              <ArrowUpRight className="h-4 w-4 text-muted" />
            </div>
          </Link>
        </div>
      </section>

      <LogbookCheck />

      <QuickLogBar latest={latest} />
      <GoalsCard />
      {(s.profile === 'pilot' || s.profile === 'student') && <RecencyCards flights={flights} compact />}

      {/* Key statistics */}
      <section aria-label="Key statistics" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        {s.dashboardCards.filter((k) => cards[k]).map((k) => {
          const c = cards[k];
          return (
            <Link key={k} to={c.to} style={{ ['--tone' as any]: TONE[k] ?? '91 155 255' }} className="stat-card glass glass-hover group relative flex min-w-0 flex-col overflow-hidden rounded-xl2 p-4 focus-visible:ring-2 focus-visible:ring-ice/60">
              <div className="flex items-center gap-2.5 text-muted">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl" style={{ background: `rgb(${TONE[k] ?? '91 155 255'} / .16)`, boxShadow: `inset 0 0 0 1px rgb(${TONE[k] ?? '91 155 255'} / .35)` }}><c.icon className="h-4 w-4" style={{ color: `rgb(${TONE[k] ?? '91 155 255'})` }} /></span>
                <span className="truncate text-[12.5px] font-medium">{c.label}</span>
                {c.partial && <Partial known={c.partial[0]} total={c.partial[1]} />}
                <ChevronRight className="ml-auto h-3.5 w-3.5 opacity-0 transition group-hover:opacity-100" />
              </div>
              <div className="mt-3 flex items-end gap-3">
                <div className="tone-text text-[28px] font-semibold leading-none tracking-tight md:text-[32px]">
                  {Number.isFinite(c.value) ? <AnimatedNumber value={c.value} format={c.format} /> : <span className="text-faint">—</span>}
                </div>
                {SPARK[k] && spark.length > 1 && <Sparkline values={spark.map(SPARK[k]!)} tone={TONE[k] ?? '91 155 255'} />}
              </div>
              {c.sub && <div className="mt-2 truncate text-[11.5px] text-faint">{c.sub}</div>}
            </Link>
          );
        })}
      </section>

      {/* Insights */}
      {insights.length > 0 && (
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4" aria-label="Insights">
          {insights.map((i) => {
            const body = (
              <>
                <div className="mb-2 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.12em] text-ice/80">
                  {i.tone === 'up' ? <TrendingUp className="h-3.5 w-3.5 text-good" /> : i.tone === 'down' ? <TrendingDown className="h-3.5 w-3.5 text-warn" /> : <Lightbulb className="h-3.5 w-3.5" />}Insight
                  <Tip text={i.how}><span className="ml-auto text-faint normal-case tracking-normal">How?</span></Tip>
                </div>
                <div className="text-[14px] font-medium leading-snug text-balance">{i.title}</div>
                <div className="mt-1 text-[12.5px] text-muted">{i.detail}</div>
              </>
            );
            const tone = i.tone === 'up' ? '52 211 153' : i.tone === 'down' ? '245 181 68' : '167 139 250';
            const cls = 'stat-card glass relative overflow-hidden rounded-xl2 p-4 pl-5';
            const bar = <span className="absolute inset-y-3 left-0 w-[3px] rounded-r-full" style={{ background: `rgb(${tone})`, boxShadow: `0 0 12px rgb(${tone})` }} />;
            return i.href ? <Link key={i.id} to={i.href} style={{ ['--tone' as any]: tone }} className={cx(cls, 'glass-hover')}>{bar}{body}</Link> : <div key={i.id} style={{ ['--tone' as any]: tone }} className={cls}>{bar}{body}</div>;
          })}
        </section>
      )}

      {/* Charts */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[17px] font-semibold tracking-tight">Activity</h2>
        <Segmented label="Overview range" size="sm" value={range} onChange={setRange} options={[{ value: '12', label: '12 months' }, { value: '24', label: '24 months' }, { value: 'all', label: 'All time' }]} />
      </div>
      <section className="grid gap-4 lg:grid-cols-3">
        <ChartCard hidden={!s.dashboardCharts.includes('monthlyHours')} className="lg:col-span-2" eyebrow="Monthly" title="Flight hours" action={hasSim ? <Legend items={[{ label: 'Real-world', color: '#5b9bff' }, { label: 'Simulator', color: '#5ee0ef' }]} /> : undefined} empty={!months.length}>
          <div className="h-[240px]">
            <ResponsiveContainer>
              <BarChart data={months} margin={{ top: 4, right: 4, left: -2, bottom: 0 }} barCategoryGap="22%">
                <CartesianGrid vertical={false} />
                <XAxis dataKey="month" tickFormatter={(m) => monthLabel(m)} {...AXIS} interval="preserveStartEnd" minTickGap={18} />
                <YAxis {...AXIS} width={44} allowDecimals={false} />
                <Tooltip cursor={{ fill: 'rgb(255 255 255 / .04)' }} content={<ChartTooltip labelFormat={(m: string) => monthLabel(m, true)} format={(v: number) => `${v.toFixed(1)} h`} />} />
                <Bar dataKey="realH" name="Real-world" stackId="h" fill="url(#g-blue)" maxBarSize={30} radius={hasSim ? [0, 0, 0, 0] : [7, 7, 2, 2]} />
                {hasSim && <Bar dataKey="simH" name="Simulator" stackId="h" fill="url(#g-cyan)" maxBarSize={30} radius={[7, 7, 2, 2]} />}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
        <ChartCard hidden={!s.dashboardCharts.includes('flightsPerMonth')} eyebrow="Monthly" title="Flights per month" empty={!months.length}>
          <div className="h-[240px]">
            <ResponsiveContainer>
              <AreaChart data={months} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                <defs><linearGradient id="fpm" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#5b9bff" stopOpacity={0.45} /><stop offset="100%" stopColor="#5b9bff" stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="month" tickFormatter={(m) => monthLabel(m)} {...AXIS} interval="preserveStartEnd" minTickGap={24} />
                <YAxis {...AXIS} width={40} allowDecimals={false} />
                <Tooltip content={<ChartTooltip labelFormat={(m: string) => monthLabel(m, true)} />} />
                <Area className="chart-glow" type="monotone" dataKey="flights" name="Flights" stroke="#7cb4ff" strokeWidth={2.5} fill="url(#ga-blue)" dot={false} activeDot={{ r: 4, fill: '#fff' }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
        <ChartCard hidden={!s.dashboardCharts.includes('cumulative')} eyebrow="Progression" title="Cumulative flight hours" empty={!months.length} footer="Includes all flights logged before the selected range.">
          <div className="h-[200px]">
            <ResponsiveContainer>
              <AreaChart data={months} margin={{ top: 4, right: 4, left: -2, bottom: 0 }}>
                <defs><linearGradient id="cum" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#5ee0ef" stopOpacity={0.35} /><stop offset="100%" stopColor="#5ee0ef" stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="month" tickFormatter={(m) => monthLabel(m)} {...AXIS} interval="preserveStartEnd" minTickGap={30} />
                <YAxis {...AXIS} width={44} />
                <Tooltip content={<ChartTooltip labelFormat={(m: string) => monthLabel(m, true)} format={(v: number) => `${v.toLocaleString('en-GB')} h`} />} />
                <Area type="monotone" dataKey="cumH" name="Total hours" stroke="#8ff0fa" strokeWidth={2.5} fill="url(#ga-cyan)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
        <ChartCard hidden={!s.dashboardCharts.includes('byType')} eyebrow="Fleet" title="Flights by aircraft type" empty={!byType.length} action={<Link to="/aircraft" className="link text-[12px]">All aircraft</Link>}>
          <RankBars rows={byType.map((g) => ({ key: g.key, label: <><span className="mono mr-2 text-ice">{g.key}</span>{g.label}</>, value: g.flights }))} format={(v) => `${v}`} onClick={(k) => nav(`/aircraft/${encodeURIComponent(k)}`)} />
        </ChartCard>
        <ChartCard hidden={!s.dashboardCharts.includes('byAirline')} eyebrow="Operators" title="Flights by airline" empty={!byAirline.length}>
          <RankBars rows={byAirline.map((g) => ({ key: g.key, label: g.key, value: g.flights }))} format={(v) => `${v}`} onClick={(k) => nav(`/flights?airline=${encodeURIComponent(k)}`)} />
        </ChartCard>
        <ChartCard hidden={!s.dashboardCharts.includes('byCategory')} eyebrow="Mix" title="Flights by category" empty={!byCat.length}>
          <div className="flex h-3 overflow-hidden rounded-full bg-white/[0.06]">
            {byCat.map((g) => <div key={g.key} style={{ width: `${(g.flights / Math.max(1, rangeFlights.length)) * 100}%`, background: CAT_COLOR[g.key as FlightCategory] }} title={`${CATEGORY_LABEL[g.key as FlightCategory]}: ${g.flights}`} />)}
          </div>
          <ul className="mt-4 flex flex-col gap-2">
            {byCat.map((g) => (
              <li key={g.key}>
                <Link to={`/flights?category=${g.key}`} className="flex items-center gap-2.5 rounded-lg text-[13px] hover:text-ice">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: CAT_COLOR[g.key as FlightCategory] }} />
                  {CATEGORY_LABEL[g.key as FlightCategory]}
                  <span className="mono ml-auto text-muted">{g.flights}</span>
                  <span className="mono w-16 text-right text-faint">{fmt.hours(g.minutes)} h</span>
                </Link>
              </li>
            ))}
          </ul>
        </ChartCard>
        <ChartCard hidden={!s.dashboardCharts.includes('topAirports')} eyebrow="Places" title="Most visited airports" empty={!topAirports.length} action={<Link to="/airports?filter=visited" className="link text-[12px]">All airports</Link>}>
          <RankBars rows={topAirports.map((a) => ({ key: a.ident, label: <><span className="mono mr-2 text-ice">{a.label}</span>{a.city || a.name}</>, value: a.total }))} format={(v) => `${v}`} onClick={(k) => nav(`/airports/${k}`)} />
        </ChartCard>
        <ChartCard hidden={!s.dashboardCharts.includes('domestic')} eyebrow="Borders" title="Domestic vs international" empty={split.domestic + split.international === 0} footer={split.unknown ? `${plural(split.unknown, 'flight')} without country data are left out.` : 'Based on the departure and arrival airport countries.'}>
          <div className="flex items-end gap-6">
            <div><div className="text-[30px] font-semibold num leading-none">{split.international}</div><div className="mt-1 text-[12px] text-muted">International</div></div>
            <div><div className="text-[30px] font-semibold num leading-none text-muted">{split.domestic}</div><div className="mt-1 text-[12px] text-muted">Domestic</div></div>
          </div>
          <div className="mt-4 flex h-2.5 overflow-hidden rounded-full bg-white/[0.06]">
            <div className="bg-gradient-to-r from-accent to-ice" style={{ width: `${(split.international / Math.max(1, split.international + split.domestic)) * 100}%` }} />
          </div>
          <div className="mt-2 flex justify-between text-[11.5px] text-faint num"><span>{Math.round((split.international / Math.max(1, split.international + split.domestic)) * 100)}%</span><span>{Math.round((split.domestic / Math.max(1, split.international + split.domestic)) * 100)}%</span></div>
        </ChartCard>
      </section>

      {/* Recent flights */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[17px] font-semibold tracking-tight">Recent flights</h2>
          <Link to="/flights" className="link text-[13px]">Open logbook</Link>
        </div>
        <div className="hidden md:block glass overflow-hidden rounded-xl2">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-[0.1em] text-faint">
                  {['Date', 'Flight', 'Route', 'Aircraft', 'Reg', 'Airline', 'Time', 'Distance', 'Status'].map((h) => <th key={h} className="px-4 py-3 font-medium whitespace-nowrap">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {recent.map((f) => (
                  <tr key={f.id} className="table-row cursor-pointer" onClick={() => nav(`/flights/${f.id}`)}>
                    <td className="px-4 py-3 num text-muted whitespace-nowrap">{fmt.date(f.date)}</td>
                    <td className="px-4 py-3 mono text-ice whitespace-nowrap"><Link to={`/flights/${f.id}`} onClick={(e) => e.stopPropagation()}>{f.flightNumber || f.callsign || '—'}</Link></td>
                    <td className="px-4 py-3 mono whitespace-nowrap">{code(f.dep)} <span className="text-faint">→</span> {code(f.arr)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{aircraftShort(f)}</td>
                    <td className="px-4 py-3 mono text-muted">{fmt.reg(f)}</td>
                    <td className="px-4 py-3 text-muted max-w-[160px] truncate">{f.airline || '—'}</td>
                    <td className="px-4 py-3 mono">{fmt.dur(f.flightMinutes)}</td>
                    <td className="px-4 py-3 mono text-muted whitespace-nowrap">{fmt.dist(f.distanceKm)}</td>
                    <td className="px-4 py-3"><div className="flex gap-1">{f.category !== 'real' && <CategoryBadge c={f.category} />}<StatusBadge s={f.status} /></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="grid gap-3 md:hidden">{recent.slice(0, 4).map((f) => <FlightCard key={f.id} f={f} />)}</div>
      </section>
      {(s.profile === 'pilot' || s.profile === 'student') && (
        <p className="text-[11.5px] text-faint">Flight Log is a personal flight record and is not an approved regulatory pilot logbook.</p>
      )}
    </div>
  );
}

const TONE: Record<string, string> = {
  flights: '91 155 255', hours: '167 139 250', distance: '94 224 239', airports: '52 211 153', aircraft: '245 181 68', routes: '247 143 179',
  block: '125 211 252', airlines: '251 146 60', month: '91 155 255', average: '167 139 250', longest: '245 181 68', topType: '94 224 239',
};
const SPARK: Record<string, ((m: { flights: number; minutes: number; distanceKm: number; blockMinutes: number }) => number) | undefined> = {
  flights: (m) => m.flights, hours: (m) => m.minutes, distance: (m) => m.distanceKm, block: (m) => m.blockMinutes, month: (m) => m.flights,
};
function Sparkline({ values, tone }: { values: number[]; tone: string }) {
  const w = 84, h = 30, mx = Math.max(1, ...values);
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, h - 2 - (v / mx) * (h - 6)] as const);
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('');
  const id = 'sp' + tone.replace(/\s/g, '');
  return (
    <svg width={w} height={h} className="ml-auto shrink-0 overflow-visible" aria-hidden>
      <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={`rgb(${tone})`} stopOpacity=".35" /><stop offset="100%" stopColor={`rgb(${tone})`} stopOpacity="0" /></linearGradient></defs>
      <path d={`${d}L${w},${h}L0,${h}Z`} fill={`url(#${id})`} />
      <path d={d} fill="none" stroke={`rgb(${tone})`} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ filter: `drop-shadow(0 0 4px rgb(${tone} / .6))` }} />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="2.4" fill="#fff" />
    </svg>
  );
}

function Ring({ pct, size = 64, tone = '#5b9bff' }: { pct: number; size?: number; tone?: string }) {
  const r = size / 2 - 5, c = 2 * Math.PI * r, p = Math.max(0, Math.min(1, pct));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90 shrink-0" aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(255 255 255 / .08)" strokeWidth={6} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={tone} strokeWidth={6} strokeLinecap="round" strokeDasharray={`${c * p} ${c}`} style={{ transition: 'stroke-dasharray .8s cubic-bezier(.2,.8,.2,1)' }} />
    </svg>
  );
}

function streakNote(st: ReturnType<typeof streaks>): string {
  if (!st.lastDate) return 'Log a flight to start a streak.';
  if (st.days.atRisk) return `Fly today to make it ${st.days.current + 1} days in a row.`;
  if (st.days.activeNow && st.days.current > 1) return `You've flown ${plural(st.days.current, 'day')} running. Same again tomorrow?`;
  if (st.weeks.atRisk) return `No flight yet this week. One more keeps your ${st.weeks.current}-week streak going.`;
  if (st.months.atRisk) return `Log a flight this month to keep your ${st.months.current}-month streak.`;
  if (st.days.activeNow) return 'You flew today. Fly tomorrow to start a day streak.';
  return `Last flight: ${DateTime.fromISO(st.lastDate).toFormat('d LLL yyyy')}.`;
}

function GoalsCard() {
  const flights = useStore((x) => x.data.flights);
  const goals = useStore((x) => x.settings.goals);
  const st = useMemo(() => streaks(flights), [flights]);
  const gp = useMemo(() => goalProgress(flights, goals), [flights, goals]);
  const fmtV = (v: number, u: string) => (u === 'hours' ? v.toFixed(1) : String(Math.round(v)));
  return (
    <section aria-label="Goals and streaks" className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      <div className="glass rounded-xl2 p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="label">Streaks</div>
          <Tip text="Counted from the departure date of every flight you've logged. Several flights on one day count once; planned flights and future dates never count. Weeks start on Monday."><span className="text-[11px] text-faint">How it works</span></Tip>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {([['Days', st.days], ['Weeks', st.weeks], ['Months', st.months]] as const).map(([l, r]) => (
            <div key={l} className={cx('rounded-xl p-2.5 ring-1', r.current ? 'bg-warn/10 ring-warn/25' : 'bg-white/[0.03] ring-white/[0.07]')}>
              <div className="flex items-baseline gap-1"><span className="num text-[22px] font-semibold leading-none">{r.current}</span>{r.current > 0 && <span aria-hidden className="text-[13px]">🔥</span>}</div>
              <div className="mt-1 text-[11px] text-muted">{l} in a row</div>
              <div className="text-[10.5px] text-faint">Best {r.best}</div>
            </div>
          ))}
        </div>
        <div className="mt-2 text-[12px] text-muted">{streakNote(st)}</div>
      </div>
      <div className="glass rounded-xl2 p-4">
        {gp.length ? (
          <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">
            {gp.map((g) => {
              const pct = g.value / g.target, done = pct >= 1, onPace = (g.pace ?? 0) >= g.target;
              return (
                <div key={g.key} className="flex items-center gap-3">
                  <div className="relative"><Ring pct={pct} tone={done ? '#34d399' : onPace ? '#5b9bff' : '#f5b544'} /><span className="mono absolute inset-0 grid place-items-center text-[12px] font-semibold">{Math.min(999, Math.round(pct * 100))}%</span></div>
                  <div className="min-w-0">
                    <div className="truncate text-[12px] text-muted">{g.label}</div>
                    <div className="mono whitespace-nowrap text-[15px] font-semibold">{fmtV(g.value, g.unit)}<span className="text-faint"> / {g.target}</span></div>
                    <div className={cx('text-[11px]', done ? 'text-good' : onPace ? 'text-ice' : 'text-warn')}>{done ? 'Goal reached' : onPace ? 'On pace' : `Pace: ${fmtV(g.pace ?? 0, g.unit)}`}</div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex h-full flex-wrap items-center gap-3">
            <Target className="h-5 w-5 text-ice" />
            <div className="min-w-0 flex-1"><div className="text-[14px] font-medium">Set yourself a goal</div><div className="text-[12.5px] text-muted">Flights or hours this year, flights this month, new airports. Progress rings show whether you're on pace.</div></div>
            <Link to="/settings?section=goals" className="btn-glass btn-sm">Set goals</Link>
          </div>
        )}
      </div>
    </section>
  );
}

function GettingStarted() {
  const openForm = useStore((s) => s.openForm);
  const setWorkspace = useStore((s) => s.setWorkspace);
  const s = useStore((x) => x.settings);
  const now = DateTime.local();
  const sample = useSampleFlight();
  const [hero] = useState(nextHeroPhoto);
  return (
    <div className="flex flex-col gap-6">
      <Photo photo={hero} priority className="min-h-[340px] rounded-xl3 shadow-glass">
        <div className="flex h-full min-h-[340px] flex-col justify-end p-6 md:p-10">
          <div className="label mb-3 text-ice">{now.toFormat('cccc, d LLLL')}</div>
          <h1 className="max-w-2xl text-[36px] font-semibold leading-[1.04] tracking-[-0.03em] md:text-[52px] text-balance">Welcome aboard{s.displayName ? `, ${s.displayName.split(' ')[0]}` : ''}. Every flight tells a story.</h1>
          <p className="mt-3 max-w-xl text-[14.5px] text-fg/75">Your logbook is empty, and nothing here is made up. Log your first flight and Flight Log builds your stats, map and milestones from it.</p>
          <div className="mt-6 flex flex-wrap gap-2">
            <button className="btn-primary h-11 px-5" onClick={() => openForm()}><Plus className="h-4 w-4" />Log your first flight</button>
            <Link to="/reports#import" className="btn-glass h-11 px-5"><Upload className="h-4 w-4" />Import flights</Link>
          </div>
        </div>
      </Photo>
      <QuickLogBar latest={undefined} />
      <div className="grid gap-4 md:grid-cols-3">
        <button onClick={() => openForm(sample, 'create')} className="glass glass-hover rounded-xl2 p-5 text-left">
          <div className="mb-3 grid h-10 w-10 place-items-center rounded-xl bg-accent/15 text-ice ring-1 ring-accent/30"><Plane className="h-5 w-5" /></div>
          <div className="font-medium">Try a guided sample flight</div>
          <p className="mt-1 text-[13px] text-muted">Opens the form pre-filled with an example overnight trip (Abu Dhabi → Singapore) so you can see how times and time zones work. Save it or discard it.</p>
        </button>
        <button onClick={() => setWorkspace('demo')} className="glass glass-hover rounded-xl2 p-5 text-left">
          <div className="mb-3 grid h-10 w-10 place-items-center rounded-xl bg-warn/15 text-warn ring-1 ring-warn/30"><Layers className="h-5 w-5" /></div>
          <div className="font-medium">Explore the demo workspace</div>
          <p className="mt-1 text-[13px] text-muted">Two years of fictional flights labelled DEMO, kept apart from your own logbook.</p>
        </button>
        <Link to="/map" className="glass glass-hover rounded-xl2 p-5">
          <div className="mb-3 grid h-10 w-10 place-items-center rounded-xl bg-live/10 text-live ring-1 ring-live/25"><Globe2 className="h-5 w-5" /></div>
          <div className="font-medium">Browse the world map</div>
          <p className="mt-1 text-[13px] text-muted">9,500+ airports with real coordinates and time zones. Your routes appear as you log.</p>
        </Link>
      </div>
    </div>
  );
}

import { emptyFlight, finalizeFlight } from '../lib/flight';
import { findAirport, toRef } from '../lib/airports';
import { wallToUtc } from '../lib/time';
function useSampleFlight() {
  const s = useStore((x) => x.settings);
  return useMemo(() => {
    const f = emptyFlight(s);
    const dep = findAirport('OMAA'), arr = findAirport('WSSS');
    const date = DateTime.local().minus({ days: 3 }).toISODate()!;
    f.date = date; f.category = 'real'; f.status = 'completed'; f.role = 'passenger';
    if (dep && arr) { f.dep = toRef(dep); f.arr = toRef(arr); }
    f.flightNumber = 'SAMPLE 1';
    f.airline = 'Sample flight — edit me';
    f.aircraft = { typeCode: 'B789', manufacturer: 'Boeing', model: '787-9 Dreamliner', variant: '', registration: '', nickname: '' };
    f.times.offBlock = wallToUtc(date, '21:50', 'Asia/Dubai');
    f.times.takeoff = wallToUtc(date, '22:10', 'Asia/Dubai');
    f.times.landing = wallToUtc(date, '08:55', 'Asia/Singapore', 1);
    f.times.onBlock = wallToUtc(date, '09:10', 'Asia/Singapore', 1);
    f.seat = '32A';
    f.notes = 'This is a guided sample. Notice the +1d on arrival: Flight Log rolls overnight times forward and converts each airport\'s local time to UTC.';
    f.tags = ['sample'];
    return finalizeFlight(f);
  }, [s]);
}

import { Cloud as CloudIcon, ScanLine, ClipboardPaste, Undo2, PenLine } from 'lucide-react';
import { returnOf } from '../components/flight/QuickFill';
import type { Flight } from '../lib/types';

/** One-tap ways to start logging. */
function QuickLogBar({ latest }: { latest: Flight | undefined }) {
  const openForm = useStore((s) => s.openForm);
  const items: { icon: any; title: string; sub: string; run: () => void; primary?: boolean }[] = [
    { icon: PenLine, title: 'Log manually', sub: 'Shortcut: N', run: () => openForm(), primary: true },
    { icon: CloudIcon, title: 'From SimBrief', sub: 'Latest flight plan', run: () => openForm(null, 'create', 'simbrief') },
    { icon: ScanLine, title: 'Scan boarding pass', sub: 'Camera or photo', run: () => openForm(null, 'create', 'scan') },
    { icon: ClipboardPaste, title: 'Paste details', sub: 'Booking or e-ticket', run: () => openForm(null, 'create', 'paste') },
    ...(latest ? [{ icon: Undo2, title: 'Return flight', sub: `${code(latest.arr)} → ${code(latest.dep)}`, run: () => openForm(returnOf(latest), 'create') }] : []),
  ];
  return (
    <section aria-label="Quick log" className="glass rounded-xl2 p-3">
      <div className="flex gap-2 overflow-x-auto">
        {items.map((it) => (
          <button key={it.title} onClick={it.run} className={cx('flex min-w-[168px] flex-1 items-center gap-3 rounded-xl px-3.5 py-3 text-left transition ring-1', it.primary ? 'bg-accent/20 ring-accent/40 hover:bg-accent/30' : 'bg-white/[0.035] ring-white/[0.07] hover:bg-white/[0.07]')}>
            <span className={cx('grid h-9 w-9 shrink-0 place-items-center rounded-lg', it.primary ? 'bg-accent text-white' : 'bg-white/[0.06] text-ice')}><it.icon className="h-4 w-4" /></span>
            <span className="min-w-0"><span className="block truncate text-[13px] font-medium">{it.title}</span><span className="block truncate text-[11.5px] text-faint">{it.sub}</span></span>
          </button>
        ))}
      </div>
    </section>
  );
}

import { RecencyCards } from '../components/charts/Recency';

// ─── Logbook check: duplicates and bridge test recordings ───────────────────
import { findDuplicates } from '../lib/stats';
import { AlertTriangle, Trash2, Check } from 'lucide-react';
const DUP_OK_KEY = 'skylog:dup-ok';
function LogbookCheck() {
  const flights = useStore((s) => s.data.flights);
  const del = useStore((s) => s.deleteFlights);
  const restore = useStore((s) => s.restoreFlights);
  const toast = useStore((s) => s.toast);
  const fmt = useFmt();
  const nav = useNavigate();
  const [ok, setOk] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem(DUP_OK_KEY) || '[]'); } catch { return []; } });
  const dups = useMemo(() => findDuplicates(flights).filter((g) => !ok.includes(g.key)), [flights, ok]);
  const tests = useMemo(() => flights.filter((f) => isCounted(f) && f.tags.includes('bridge-test')), [flights]);
  if (!dups.length && !tests.length) return null;
  const keep = (k: string) => { const n = [...ok, k]; setOk(n); try { localStorage.setItem(DUP_OK_KEY, JSON.stringify(n)); } catch { /* private mode */ } };
  async function remove(ids: string[], what: string) {
    const removed = await del(ids);
    toast({ kind: 'info', title: `${what} deleted`, body: 'Totals and charts have been recalculated.', action: { label: 'Undo', run: () => restore(removed) } });
  }
  const src = (f: Flight) => f.track && f.track.length > 1 ? 'Recorded track' : f.source === 'simbrief' || f.flightPlan?.source === 'simbrief' ? 'SimBrief plan' : f.source === 'csv' || f.source === 'json' ? 'Imported' : f.source === 'duplicate' ? 'Duplicated' : 'Typed in';
  const row = (f: Flight, extra?: React.ReactNode) => (
    <div key={f.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-white/[0.03] px-3 py-2 ring-1 ring-white/[0.06]">
      <button className="mono text-[13px] font-semibold text-fg hover:text-ice" onClick={() => nav(`/flights/${f.id}`)}>{code(f.dep)} → {code(f.arr)}</button>
      <span className="text-[12px] text-muted">{fmt.date(f.date)}{f.flightMinutes ? ` · ${fmt.dur(f.flightMinutes)}` : ''} · {src(f)}{f.createdAt ? ` · saved ${new Date(f.createdAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}</span>
      <div className="ml-auto flex gap-1">{extra}<button className="btn-ghost h-8 px-2 text-[12px] hover:text-bad" onClick={() => remove([f.id], 'Flight')}><Trash2 className="h-3.5 w-3.5" />Delete</button></div>
    </div>
  );
  return (
    <Glass className="border border-warn/25 p-4 md:p-5">
      <div className="flex items-start gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-warn/15 text-warn"><AlertTriangle className="h-4 w-4" /></div>
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold">Check your logbook</h2>
          <p className="text-[13px] text-muted">These entries are being counted in your totals. If one shouldn't be there, delete it. You can undo straight after.</p>
        </div>
      </div>
      <div className="mt-4 flex flex-col gap-4">
        {dups.map((g) => (
          <div key={g.key}>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[13px]">
              <span><span className="font-medium">Logged {plural(g.flights.length, 'time')}:</span> <span className="text-muted">same route on the same day, which usually means one flight was saved twice (for example from SimBrief and again from the sim recorder).</span></span>
              <button className="btn-ghost h-8 px-2 text-[12px]" onClick={() => keep(g.key)}><Check className="h-3.5 w-3.5" />They're different flights</button>
            </div>
            <div className="flex flex-col gap-1.5">{g.flights.map((f) => row(f))}</div>
          </div>
        ))}
        {tests.length > 0 && (
          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[13px]">
              <span><span className="font-medium">Test recordings:</span> <span className="text-muted">made by the sim bridge's test mode, not a real sim session.</span></span>
              {tests.length > 1 && <button className="btn-ghost h-8 px-2 text-[12px] hover:text-bad" onClick={() => remove(tests.map((t) => t.id), `${tests.length} test recordings`)}><Trash2 className="h-3.5 w-3.5" />Delete all</button>}
            </div>
            <div className="flex flex-col gap-1.5">{tests.map((f) => row(f))}</div>
          </div>
        )}
      </div>
    </Glass>
  );
}
