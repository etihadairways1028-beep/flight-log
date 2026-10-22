import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, BadgeCheck, PenLine, Plus } from 'lucide-react';
import { DateTime } from 'luxon';
import { useStore } from '../store/useStore';
import { useFmt } from '../lib/useFmt';
import { findAirport, countryName, CONTINENT_LABEL, loadExtendedAirports, onAirportsChange, toRef } from '../lib/airports';
import { groupBy, sortByDateDesc } from '../lib/stats';
import { isCounted, routeKey, emptyFlight } from '../lib/flight';
import { AIRPORT_PHOTOS, hashStr } from '../lib/images';
import { EmptyState, Glass, KV, Photo } from '../components/ui';
import { RankBars, ChartCard } from '../components/charts/ChartKit';
import { FlightCard } from '../components/flight/FlightBits';
import { WorldMap, buildMapData } from '../components/map/WorldMap';
import type { AirportRef } from '../lib/types';
import { plural } from '../lib/units';

export default function AirportDetail() {
  const { ident = '' } = useParams();
  const flights = useStore((s) => s.data.flights);
  const settings = useStore((s) => s.settings);
  const openForm = useStore((s) => s.openForm);
  const fmt = useFmt();
  const nav = useNavigate();
  const [, force] = useState(0);
  useEffect(() => onAirportsChange(() => force((n) => n + 1)) as any, []);
  const ds = findAirport(ident);
  useEffect(() => { if (!ds) loadExtendedAirports(); }, [ds]);
  const related = useMemo(() => flights.filter((f) => isCounted(f) && (f.dep?.ident === ident || f.arr?.ident === ident)), [flights, ident]);
  const fromFlight: AirportRef | undefined = useMemo(() => related.map((f) => (f.dep?.ident === ident ? f.dep : f.arr)).find(Boolean) ?? undefined, [related, ident]);
  const a = ds ?? fromFlight;
  const deps = related.filter((f) => f.dep?.ident === ident).length;
  const arrs = related.filter((f) => f.arr?.ident === ident).length;
  const routes = useMemo(() => groupBy(related, (f) => routeKey(f)).slice(0, 8), [related]);
  const map = useMemo(() => buildMapData(related), [related]);
  const latest = sortByDateDesc(related)[0];

  if (!a) return <EmptyState title="Airport not found" body={`“${ident}” isn't in the dataset or your logbook.`} action={<Link to="/airports?filter=all" className="btn-glass">Search airports</Link>} />;
  const verified = !!ds;
  const now = DateTime.now().setZone(a.tz);

  return (
    <div className="flex flex-col gap-5">
      <button className="btn-ghost -ml-2 self-start" onClick={() => nav(-1)}><ArrowLeft className="h-4 w-4" />Back</button>
      <Photo photo={AIRPORT_PHOTOS[hashStr(a.ident) % AIRPORT_PHOTOS.length]} className="h-60 rounded-xl3 shadow-glass md:h-72" priority>
        <div className="flex h-full flex-col justify-end p-6 md:p-8">
          <div className="flex items-baseline gap-3"><span className="mono text-[48px] font-semibold leading-none tracking-tight md:text-[64px]">{a.iata || a.ident}</span><span className="mono text-[16px] text-fg/70">{a.ident}</span></div>
          <h1 className="mt-2 text-[22px] font-semibold tracking-tight md:text-[28px]">{a.name}</h1>
          <div className="text-[13px] text-fg/75">{[a.city, countryName(a.country)].filter(Boolean).join(', ')}{a.continent && ` · ${CONTINENT_LABEL[a.continent] ?? ''}`}</div>
          <div className="mt-1 text-[11px] text-fg/50">Representative photo</div>
        </div>
      </Photo>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[['Total visits', related.length ? String(deps + arrs) : '0'], ['Departures', String(deps)], ['Arrivals', String(arrs)], ['Most recent visit', latest ? fmt.date(latest.date) : '—']].map(([l, v]) => (
          <Glass key={l} className="p-4"><div className="text-[12px] text-muted">{l}</div><div className="mono mt-1.5 text-[22px] font-semibold">{v}</div></Glass>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Glass className="p-5">
          <div className="mb-1 flex items-center justify-between">
            <h3 className="text-[14px] font-semibold">Reference data</h3>
            {verified ? <span className="chip text-good ring-good/25"><BadgeCheck className="h-3 w-3" />Dataset</span> : <span className="chip text-warn ring-warn/25"><PenLine className="h-3 w-3" />User-entered</span>}
          </div>
          <div className="divide-y divide-white/[0.06]">
            <KV k="ICAO" v={a.ident} mono />
            <KV k="IATA" v={a.iata || '—'} mono />
            <KV k="Coordinates" v={a.lat != null ? `${a.lat.toFixed(4)}, ${a.lon!.toFixed(4)}` : '—'} mono />
            {ds?.elevationFt != null && <KV k="Elevation" v={fmt.alt(ds.elevationFt)} mono />}
            <KV k="Time zone" v={<>{a.tz} <span className="text-faint">{fmt.zone(a.tz)}</span></>} />
            <KV k="Local time now" v={now.isValid ? now.toFormat(settings.timeFormat === '12h' ? 'h:mm a' : 'HH:mm') : '—'} mono />
            {ds && <KV k="Size" v={{ L: 'Large airport', M: 'Medium airport', S: 'Small airfield' }[ds.size]} />}
            {ds && <KV k="Scheduled service" v={ds.scheduled ? 'Yes' : 'No'} />}
          </div>
          <button className="btn-glass btn-sm mt-4 w-full" onClick={() => { const f = emptyFlight(settings); f.dep = ds ? toRef(ds) : a; openForm(f, 'create'); }}><Plus className="h-3.5 w-3.5" />Log a flight from {a.iata || a.ident}</button>
        </Glass>
        <ChartCard className="lg:col-span-2" eyebrow="Connections" title="Most common routes" empty={!routes.length}>
          <RankBars rows={routes.map((r) => ({ key: r.key, label: <span className="mono">{r.key}</span>, value: r.flights }))} format={(v) => `${v}×`} onClick={(k) => nav(`/flights?route=${encodeURIComponent(k)}`)} />
        </ChartCard>
      </div>

      {a.lon != null && (
        <Glass className="overflow-hidden p-0">
          <WorldMap routes={map.routes} airports={map.airports.length ? map.airports : [{ ident: a.ident, label: a.iata || a.ident, name: a.name, lon: a.lon, lat: a.lat!, visits: 1 }]} fit={map.routes.length ? undefined : [[a.lon, a.lat!]]} center={a.lon > 100 || a.lon < -100 ? 150 : 0} selectedAirport={a.ident} height={340} onAirport={(x) => x.ident !== a.ident && nav(`/airports/${x.ident}`)} />
        </Glass>
      )}

      <div>
        <h3 className="mb-3 text-[15px] font-semibold">Flights at {a.iata || a.ident}</h3>
        {related.length ? (
          <>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{sortByDateDesc(related).slice(0, 12).map((f) => <FlightCard key={f.id} f={f} />)}</div>
            {related.length > 12 && <Link to={`/flights?airport=${a.ident}`} className="btn-glass mt-4">All {plural(related.length, 'flight')}</Link>}
          </>
        ) : <p className="text-[13px] text-muted">You haven't logged a flight here yet.</p>}
      </div>
    </div>
  );
}
