import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { X, Layers, Plus, ArrowRight } from 'lucide-react';
import { useStore } from '../store/useStore';
import { useFmt } from '../lib/useFmt';
import { applyFilters, emptyFilters } from '../lib/filters';
import { aircraftLabel, typeKey, routeKey, isCounted } from '../lib/flight';
import { WorldMap, buildMapData, type MapRoute, type MapAirport } from '../components/map/WorldMap';
import { Glass, PageHeader, Segmented, cx } from '../components/ui';
import { airportVisits, summarize } from '../lib/stats';
import type { FlightCategory } from '../lib/types';
import { CATEGORY_LABEL } from '../lib/types';
import { findAirport, countryName } from '../lib/airports';

type Sel = { kind: 'route'; r: MapRoute; x: number; y: number } | { kind: 'airport'; a: MapAirport; x: number; y: number } | null;

export default function MapPage() {
  const all = useStore((s) => s.data.flights);
  const openForm = useStore((s) => s.openForm);
  const fmt = useFmt();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [cat, setCat] = useState<'all' | 'real' | 'sim'>('all');
  const [aircraft, setAircraft] = useState('');
  const [center, setCenter] = useState<'0' | '150'>('0');
  const [heat, setHeat] = useState(false);
  const [sel, setSel] = useState<Sel>(null);
  const [panel, setPanel] = useState(true);

  const flights = useMemo(() => applyFilters(all, { ...emptyFilters(), from, to, aircraft, categories: cat === 'all' ? [] : cat === 'sim' ? ['simulator'] : (Object.keys(CATEGORY_LABEL) as FlightCategory[]).filter((c) => c !== 'simulator') }).filter(isCounted), [all, from, to, aircraft, cat]);
  const data = useMemo(() => buildMapData(flights), [flights]);
  const sum = useMemo(() => summarize(flights), [flights]);
  const visits = useMemo(() => new Map(airportVisits(flights).map((v) => [v.ident, v])), [flights]);
  const types = useMemo(() => [...new Map(all.filter((f) => typeKey(f) !== 'UNKNOWN').map((f) => [typeKey(f), aircraftLabel(f)])).entries()].sort(), [all]);
  const empty = all.filter(isCounted).length === 0;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader eyebrow="Routes & Map" title="Your flights, worldwide" sub="Historical routes from your logbook drawn as great-circle paths between real airport coordinates. This is not live tracking." />
      <div className="relative overflow-hidden rounded-xl3 glass p-0">
        <WorldMap
          routes={data.routes}
          airports={data.airports}
          height="min(72vh, 720px)"
          center={Number(center)}
          heat={heat}
          wheelZoom
          selectedRoute={sel?.kind === 'route' ? sel.r.key : null}
          selectedAirport={sel?.kind === 'airport' ? sel.a.ident : null}
          onRoute={(r, at) => setSel({ kind: 'route', r, ...at })}
          onAirport={(a, at) => setSel({ kind: 'airport', a, ...at })}
          onBackground={() => setSel(null)}
          className="min-h-[420px]"
        >
          {/* filter panel */}
          {panel ? (
            <Glass strong className="absolute left-3 top-3 w-[min(300px,calc(100%-72px))] p-3.5">
              <div className="mb-3 flex items-center justify-between"><div className="label">Filters</div><button className="btn-icon btn-ghost h-7 w-7" onClick={() => setPanel(false)} aria-label="Hide filters"><X className="h-3.5 w-3.5" /></button></div>
              <div className="flex flex-col gap-2.5">
                <Segmented label="Map category" size="sm" value={cat} onChange={setCat} options={[{ value: 'all', label: 'All' }, { value: 'real', label: 'Real' }, { value: 'sim', label: 'Sim' }]} />
                <div className="grid grid-cols-2 gap-2">
                  <input type="date" aria-label="From" className="input mono h-8 text-[12px]" value={from} onChange={(e) => setFrom(e.target.value)} />
                  <input type="date" aria-label="To" className="input mono h-8 text-[12px]" value={to} onChange={(e) => setTo(e.target.value)} />
                </div>
                <select aria-label="Aircraft" className="input h-8 text-[12.5px]" value={aircraft} onChange={(e) => setAircraft(e.target.value)}><option value="">All aircraft</option>{types.map(([k, l]) => <option key={k} value={k}>{k} · {l}</option>)}</select>
                <div className="flex items-center gap-2">
                  <Segmented label="Map centre" size="sm" value={center} onChange={setCenter} options={[{ value: '0', label: 'Atlantic' }, { value: '150', label: 'Pacific' }]} />
                  <button className={cx('chip h-8 px-3', heat && 'chip-on')} onClick={() => setHeat(!heat)} aria-pressed={heat}>Density</button>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 border-t border-white/[0.07] pt-3 text-center">
                <div><div className="mono text-[17px] font-semibold">{sum.uniqueRoutes}</div><div className="text-[10.5px] text-muted">routes</div></div>
                <div><div className="mono text-[17px] font-semibold">{sum.uniqueAirports}</div><div className="text-[10.5px] text-muted">airports</div></div>
                <div><div className="mono text-[17px] font-semibold">{fmt.distCompact(sum.distanceKm)}</div><div className="text-[10.5px] text-muted">{fmt.distUnit}</div></div>
              </div>
            </Glass>
          ) : (
            <button className="btn-glass absolute left-3 top-3" onClick={() => setPanel(true)}><Layers className="h-4 w-4" />Filters</button>
          )}

          {/* legend */}
          <div className="absolute bottom-3 left-3 flex flex-wrap items-center gap-3 rounded-xl bg-ink/70 px-3 py-2 text-[11px] text-muted ring-1 ring-white/10 backdrop-blur-md">
            <span className="flex items-center gap-1.5"><span className="h-0.5 w-5 rounded bg-gradient-to-r from-accent to-ice" />Route (thicker = more frequent)</span>
            <span className="flex items-center gap-1.5"><span className="h-0 w-5 border-t-2 border-dashed border-live" />Simulator only</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-ice" />Airport</span>
            <span className="hidden sm:inline text-faint">Scroll or pinch to zoom · drag to pan</span>
          </div>

          {/* popover */}
          {sel && (
            <Glass strong className="absolute z-10 w-[min(300px,calc(100%-24px))] p-4 shadow-lift animate-rise" style={{ left: Math.max(12, Math.min(sel.x + 12, 9999)), top: Math.max(12, sel.y - 20), maxWidth: 'calc(100% - 24px)', transform: sel.x > 600 ? 'translateX(calc(-100% - 24px))' : undefined }}>
              <button className="btn-icon btn-ghost absolute right-2 top-2 h-7 w-7" onClick={() => setSel(null)} aria-label="Close"><X className="h-3.5 w-3.5" /></button>
              {sel.kind === 'route' ? <RoutePop r={sel.r} /> : <AirportPop a={sel.a} visits={visits.get(sel.a.ident)} />}
            </Glass>
          )}

          {empty && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center p-6">
              <Glass strong className="pointer-events-auto max-w-sm p-6 text-center">
                <div className="text-[16px] font-semibold">No routes to draw yet</div>
                <p className="mt-1.5 text-[13px] text-muted">Pan and zoom freely. Your routes appear here as soon as you log a flight. Nothing is shown until it's real.</p>
                <button className="btn-primary mt-4" onClick={() => openForm()}><Plus className="h-4 w-4" />Log a flight</button>
              </Glass>
            </div>
          )}
        </WorldMap>
      </div>
    </div>
  );

  function RoutePop({ r }: { r: MapRoute }) {
    const fl = all.filter((f) => r.flights.includes(f.id)).sort((a, b) => b.date.localeCompare(a.date));
    return (
      <div>
        <div className="label mb-1">Route</div>
        <div className="mono text-[20px] font-semibold">{r.key}</div>
        <div className="mt-1 text-[12.5px] text-muted">{r.count} flight{r.count === 1 ? '' : 's'} · {fmt.dist(fl[0]?.distanceKm)}{r.sim ? ` · ${r.sim} sim` : ''}</div>
        <ul className="mt-3 max-h-40 divide-y divide-white/[0.06] overflow-y-auto">
          {fl.slice(0, 8).map((f) => <li key={f.id}><Link to={`/flights/${f.id}`} className="flex items-center justify-between py-1.5 text-[12.5px] hover:text-ice"><span className="num">{fmt.date(f.date)}</span><span className="mono text-muted">{f.flightNumber || f.aircraft.typeCode}</span></Link></li>)}
        </ul>
        <Link to={`/flights?route=${encodeURIComponent(r.key)}`} className="btn-glass btn-sm mt-3 w-full">Open in logbook<ArrowRight className="h-3.5 w-3.5" /></Link>
      </div>
    );
  }
  function AirportPop({ a, visits: v }: { a: MapAirport; visits?: ReturnType<typeof airportVisits>[number] }) {
    const full = findAirport(a.ident);
    return (
      <div>
        <div className="label mb-1">Airport</div>
        <div className="flex items-baseline gap-2"><span className="mono text-[20px] font-semibold">{a.label}</span><span className="mono text-[12px] text-faint">{a.ident}</span></div>
        <div className="text-[13px]">{a.name}</div>
        <div className="text-[12px] text-muted">{[full?.city, countryName(full?.country)].filter(Boolean).join(', ')}</div>
        {v && <div className="mt-3 grid grid-cols-3 gap-2 text-center"><div><div className="mono font-semibold">{v.departures}</div><div className="text-[10.5px] text-muted">departures</div></div><div><div className="mono font-semibold">{v.arrivals}</div><div className="text-[10.5px] text-muted">arrivals</div></div><div><div className="mono font-semibold">{v.total}</div><div className="text-[10.5px] text-muted">visits</div></div></div>}
        <Link to={`/airports/${a.ident}`} className="btn-glass btn-sm mt-3 w-full">Airport details<ArrowRight className="h-3.5 w-3.5" /></Link>
      </div>
    );
  }
}
