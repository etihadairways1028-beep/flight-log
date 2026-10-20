import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { DateTime } from 'luxon';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, AreaChart, Area } from 'recharts';
import { Shuffle, Plus, Upload, ArrowUpRight, TrendingUp, TrendingDown, Lightbulb, Plane, Clock, Route, MapPin, Building2, CalendarRange, Timer, Trophy, Ruler, Gauge, Layers, Globe2, ChevronRight } from 'lucide-react';
import { useStore } from '../store/useStore';
import { useFmt } from '../lib/useFmt';
import { summarize, monthly, groupBy, airportVisits, domesticSplit, sortByDateDesc } from '../lib/stats';
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

  const greeting = now.hour < 5 ? 'Good evening' : now.hour < 12 ? 'Good morning' : now.hour < 18 ? 'Good afternoon' : 'Good evening';
  const [heroPhoto, setHeroPhoto] = useState(nextHeroPhoto);

  const cards: Record<string, { label: string; icon: any; value: number; format?: (n: number) => string; sub?: React.ReactNode; to: string; partial?: [number, number]; tip?: string }> = {
    flights: { label: 'Total flights', icon: Plane, value: sum.flights, to: '/flights', sub: hasSim ? `${sum.realFlights} real · ${sum.simFlights} sim` : sum.excluded ? `${sum.excluded} planned/cancelled not counted` : undefined },
    hours: { label: hasSim ? 'Flight hours (combined)' : 'Flight hours', icon: Clock, value: sum.flightMinutes / 60, format: (n) => n.toLocaleString('en-GB', { maximumFractionDigits: 1, minimumFractionDigits: 1 }), to: '/analytics?tab=time', sub: hasSim ? `${fmt.hours(sum.realMinutes)} real · ${fmt.hours(sum.simMinutes)} sim` : 'Takeoff to landing', partial: [sum.flightTimeKnown, sum.flights], tip: 'Airborne time from takeoff to landing. Simulator and real-world time are shown separately underneath.' },
    block: { label: 'Block hours', icon: Timer, value: sum.blockMinutes / 60, format: (n) => n.toLocaleString('en-GB', { maximumFractionDigits: 1, minimumFractionDigits: 1 }), to: '/analytics?tab=time', sub: sum.blockKnown ? 'Off-block to on-block' : 'Not recorded yet', partial: [sum.blockKnown, sum.flights], tip: 'Gate-to-gate time. Only counted where off-block and on-block (or a block duration) were recorded.' },
    distance: { label: `Distance (${fmt.distUnit})`, icon: Ruler, value: fmt.distNum(sum.distanceKm), to: '/analytics?tab=routes', sub: sum.distanceKm ? `${(sum.distanceKm / 40075).toFixed(2)}× around the equator` : 'Great-circle', partial: [sum.distanceKnown, sum.flights] },
    aircraft: { label: 'Aircraft types', icon: Layers, value: sum.uniqueTypes, to: '/aircraft', sub: sum.uniqueRegistrations ? `${sum.uniqueRegistrations} registrations` : undefined },
    airports: { label: 'Airports', icon: MapPin, value: sum.uniqueAirports, to: '/airports?filter=visited', sub: sum.uniqueCountries ? `${sum.uniqueCountries} countries` : undefined },
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
                {' '}{sum.flights} flights and {fmt.hours(sum.flightMinutes)} hours so far.
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
            <WorldMap routes={mapData.routes} airports={mapData.airports} height={170} interactive={false} showLabels={false} />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between bg-gradient-to-t from-ink/90 to-transparent p-4">
              <div><div className="label">Routes & map</div><div className="text-[13px] text-fg/90">{sum.uniqueRoutes} routes · {sum.uniqueAirports} airports · {sum.uniqueCountries} countries</div></div>
              <ArrowUpRight className="h-4 w-4 text-muted" />
            </div>
          </Link>
        </div>
      </section>

      <QuickLogBar latest={latest} />
      {(s.profile === 'pilot' || s.profile === 'student') && <RecencyCards flights={flights} compact />}

      {/* Key statistics */}
      <section aria-label="Key statistics" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        {s.dashboardCards.filter((k) => cards[k]).map((k) => {
          const c = cards[k];
          return (
            <Link key={k} to={c.to} className="glass glass-hover group flex min-w-0 flex-col rounded-xl2 p-4 focus-visible:ring-2 focus-visible:ring-ice/60">
              <div className="flex items-center gap-2 text-muted">
                <c.icon className="h-3.5 w-3.5 text-ice/80" />
                <span className="truncate text-[12px] font-medium">{c.label}</span>
                {c.partial && <Partial known={c.partial[0]} total={c.partial[1]} />}
                <ChevronRight className="ml-auto h-3.5 w-3.5 opacity-0 transition group-hover:opacity-100" />
              </div>
              <div className="mt-2.5 text-[26px] font-semibold leading-none tracking-tight md:text-[30px]">
                {Number.isFinite(c.value) ? <AnimatedNumber value={c.value} format={c.format} /> : <span className="text-faint">—</span>}
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
            return i.href ? <Link key={i.id} to={i.href} className="glass glass-hover rounded-xl2 p-4">{body}</Link> : <Glass key={i.id} className="p-4">{body}</Glass>;
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
                <Bar dataKey="realH" name="Real-world" stackId="h" fill="#5b9bff" radius={hasSim ? [0, 0, 0, 0] : [5, 5, 1, 1]} />
                {hasSim && <Bar dataKey="simH" name="Simulator" stackId="h" fill="#5ee0ef" radius={[5, 5, 1, 1]} />}
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
                <Area type="monotone" dataKey="flights" name="Flights" stroke="#a9d4ff" strokeWidth={2} fill="url(#fpm)" dot={false} activeDot={{ r: 4, fill: '#fff' }} />
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
                <Area type="monotone" dataKey="cumH" name="Total hours" stroke="#5ee0ef" strokeWidth={2} fill="url(#cum)" dot={false} />
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
        <ChartCard hidden={!s.dashboardCharts.includes('domestic')} eyebrow="Borders" title="Domestic vs international" empty={split.domestic + split.international === 0} footer={split.unknown ? `${split.unknown} flights without country data are left out.` : 'Based on the departure and arrival airport countries.'}>
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
