import { useMemo, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Pencil } from 'lucide-react';
import { useStore } from '../store/useStore';
import { useFmt } from '../lib/useFmt';
import { aircraftLabel, typeKey, isCounted, routeKey, uid } from '../lib/flight';
import { aircraftType } from '../lib/aircraftTypes';
import { summarize, groupBy, airportVisits, sortByDateDesc } from '../lib/stats';
import { photoForBody, hashStr } from '../lib/images';
import { EmptyState, Glass, KV, Photo } from '../components/ui';
import { RankBars, ChartCard } from '../components/charts/ChartKit';
import { FlightCard } from '../components/flight/FlightBits';
import { AircraftEditor } from './Aircraft';
import { WorldMap, buildMapData } from '../components/map/WorldMap';
import type { CustomAircraft } from '../lib/types';

export default function AircraftDetail() {
  const { key = '' } = useParams();
  const k = decodeURIComponent(key);
  const isReg = k.startsWith('reg:');
  const id = isReg ? k.slice(4).toUpperCase() : k.toUpperCase();
  const flights = useStore((s) => s.data.flights);
  const custom = useStore((s) => s.data.customAircraft.find((c) => isReg && c.registration.toUpperCase() === id));
  const fmt = useFmt();
  const nav = useNavigate();
  const [edit, setEdit] = useState<CustomAircraft | null>(null);
  const list = useMemo(() => flights.filter((f) => isCounted(f) && (isReg ? f.aircraft.registration.toUpperCase() === id : typeKey(f) === id)), [flights, id, isReg]);
  const sum = useMemo(() => summarize(list), [list]);
  const routes = useMemo(() => groupBy(list, (f) => routeKey(f)).slice(0, 8), [list]);
  const airports = useMemo(() => airportVisits(list), [list]);
  const regs = useMemo(() => (isReg ? [] : groupBy(list.filter((f) => f.aircraft.registration), (f) => f.aircraft.registration.toUpperCase())), [list, isReg]);
  const map = useMemo(() => buildMapData(list), [list]);
  const sample = list[0];
  const typeCode = isReg ? custom?.typeCode || sample?.aircraft.typeCode || '' : id;
  const t = aircraftType(typeCode);

  if (!list.length && !custom) return <EmptyState title="No flights on this aircraft" body="It may have been removed or belongs to the other workspace." action={<Link to="/aircraft" className="btn-glass">All aircraft</Link>} />;

  const title = isReg ? id : sample ? aircraftLabel(sample) : t ? `${t.manufacturer} ${t.model}` : id;
  const operators = [...new Set(list.map((f) => f.airline).filter(Boolean))];

  return (
    <div className="flex flex-col gap-5">
      <button className="btn-ghost -ml-2 self-start" onClick={() => nav(-1)}><ArrowLeft className="h-4 w-4" />Back</button>
      <Photo src={custom?.photo ?? undefined} photo={custom?.photo ? undefined : photoForBody(t?.body, hashStr(id))} className="h-60 rounded-xl3 shadow-glass md:h-72" priority>
        <div className="flex h-full flex-col justify-end p-6 md:p-8">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="mono rounded-lg bg-black/40 px-2 py-0.5 text-[13px] font-semibold text-ice backdrop-blur-md">{typeCode || '—'}</span>
            {isReg && <span className="rounded-lg bg-black/40 px-2 py-0.5 text-[12px] backdrop-blur-md">Individual airframe</span>}
            {!isReg && <span className="rounded-lg bg-black/40 px-2 py-0.5 text-[12px] backdrop-blur-md">Aircraft type</span>}
          </div>
          <h1 className={isReg ? 'mono text-[40px] font-semibold tracking-tight' : 'text-[34px] font-semibold tracking-[-0.03em] md:text-[44px]'}>{title}</h1>
          <div className="text-[13px] text-fg/75">{isReg ? `${sample ? aircraftLabel(sample) : `${custom?.manufacturer ?? ''} ${custom?.model ?? ''}`}${custom?.nickname ? ` · “${custom.nickname}”` : ''}` : t ? `${t.manufacturer} · ${t.family} · ${t.body} · ${t.engine}` : 'Not in the built-in type list'}</div>
          <div className="mt-1 text-[11px] text-fg/50">{custom?.photo ? 'Your photo' : 'Representative photo'}</div>
        </div>
      </Photo>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[['Flights', String(sum.flights)], ['Flight time', `${fmt.hours(sum.flightMinutes)} h`], ['Distance', fmt.dist(sum.distanceKm)], ['Airports', String(sum.uniqueAirports)]].map(([l, v]) => (
          <Glass key={l} className="p-4"><div className="text-[12px] text-muted">{l}</div><div className="mono mt-1.5 text-[22px] font-semibold">{v}</div></Glass>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Glass className="p-5">
          <div className="mb-1 flex items-center justify-between"><h3 className="text-[14px] font-semibold">Details</h3>{isReg && <button className="btn-ghost btn-sm" onClick={() => setEdit(custom ?? { id: uid('ac'), registration: id, typeCode, manufacturer: t?.manufacturer ?? '', model: t?.model ?? '', variant: '', operator: operators[0] ?? '', nickname: '', notes: '', photo: null })}><Pencil className="h-3.5 w-3.5" />Edit</button>}</div>
          <div className="divide-y divide-white/[0.06]">
            <KV k="Manufacturer" v={custom?.manufacturer || sample?.aircraft.manufacturer || t?.manufacturer || '—'} />
            <KV k="Model" v={custom?.model || sample?.aircraft.model || t?.model || '—'} />
            {(custom?.variant || sample?.aircraft.variant) && <KV k="Variant" v={custom?.variant || sample?.aircraft.variant} />}
            <KV k="ICAO type" v={typeCode || '—'} mono />
            {isReg && <KV k="Registration" v={id} mono />}
            <KV k={isReg ? 'Operator' : 'Operators flown'} v={custom?.operator || operators.slice(0, 3).join(', ') || '—'} />
            <KV k="First recorded" v={fmt.date(sum.firstDate)} />
            <KV k="Most recent" v={fmt.date(sum.lastDate)} />
          </div>
          {custom?.notes && <p className="mt-3 text-[13px] text-muted">{custom.notes}</p>}
          <p className="mt-3 text-[11px] text-faint">Details come from your records{custom ? ' and the information you added' : ''}. Flight Log doesn't invent registrations or specifications.</p>
        </Glass>
        <ChartCard eyebrow="Routes" title="Routes flown" empty={!routes.length}><RankBars rows={routes.map((r) => ({ key: r.key, label: <span className="mono">{r.key}</span>, value: r.flights }))} format={(v) => `${v}×`} onClick={(k) => nav(`/flights?route=${encodeURIComponent(k)}`)} /></ChartCard>
        {isReg ? (
          <ChartCard eyebrow="Places" title="Airports visited" empty={!airports.length}><RankBars rows={airports.slice(0, 8).map((a) => ({ key: a.ident, label: <><span className="mono mr-2 text-ice">{a.label}</span>{a.city}</>, value: a.total }))} format={(v) => `${v}`} onClick={(k) => nav(`/airports/${k}`)} /></ChartCard>
        ) : (
          <ChartCard eyebrow="Airframes" title="Registrations flown" empty={!regs.length} footer={!regs.length ? undefined : 'Each registration is one individual aircraft of this type.'}>
            <RankBars rows={regs.slice(0, 8).map((r) => ({ key: r.key, label: <span className="mono">{r.key}</span>, value: r.flights }))} format={(v) => `${v}×`} onClick={(k) => nav(`/aircraft/${encodeURIComponent('reg:' + k)}`)} />
          </ChartCard>
        )}
      </div>

      {map.routes.length > 0 && <Glass className="overflow-hidden p-0"><WorldMap routes={map.routes} airports={map.airports} height={340} onAirport={(a) => nav(`/airports/${a.ident}`)} /></Glass>}

      <div>
        <h3 className="mb-3 text-[15px] font-semibold">Flight history</h3>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{sortByDateDesc(list).slice(0, 24).map((f) => <FlightCard key={f.id} f={f} />)}</div>
        {list.length > 24 && <Link to={isReg ? `/flights?registration=${encodeURIComponent(id)}` : `/flights?aircraft=${encodeURIComponent(id)}`} className="btn-glass mt-4">Show all {list.length} in logbook</Link>}
      </div>
      <AircraftEditor value={edit} onClose={() => setEdit(null)} />
    </div>
  );
}
