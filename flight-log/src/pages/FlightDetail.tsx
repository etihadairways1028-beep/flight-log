import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Share2, CheckCircle2, ArrowLeft, Pencil, Copy, Trash2, MapPin, Plane, Clock, Ruler, Mountain, Gauge, Users, CloudSun, Tag, NotebookPen, AlertTriangle, Fuel, Armchair, Info } from 'lucide-react';
import { useStore } from '../store/useStore';
import { useFmt } from '../lib/useFmt';
import { aircraftLabel, missingFields, routeKey, isCounted, hasPilotData, plannedPath } from '../lib/flight';
import { aircraftType } from '../lib/aircraftTypes';
import { countryName, code, CONTINENT_LABEL } from '../lib/airports';
import { CategoryBadge, ConfirmDialog, EmptyState, Glass, KV, Photo, Stars, StatusBadge, Tip, cx } from '../components/ui';
import { RouteBar, FlightCard } from '../components/flight/FlightBits';
import { WorldMap, buildMapData } from '../components/map/WorldMap';
import { photoForBody, hashStr } from '../lib/images';
import { ROLE_LABEL, PILOT_FIELDS, type Flight } from '../lib/types';
import { fmtDurationLong, minutesBetween } from '../lib/time';
import { initialBearing } from '../lib/geo';
import { sound } from '../lib/sound';

export default function FlightDetail() {
  const { id } = useParams();
  const flights = useStore((s) => s.data.flights);
  const f = flights.find((x) => x.id === id);
  const openForm = useStore((s) => s.openForm);
  const del = useStore((s) => s.deleteFlights);
  const restore = useStore((s) => s.restoreFlights);
  const toast = useStore((s) => s.toast);
  const getPhoto = useStore((s) => s.getPhoto);
  const fmt = useFmt();
  const nav = useNavigate();
  const [confirm, setConfirm] = useState(false);
  const [share, setShare] = useState(false);
  const [photos, setPhotos] = useState<string[]>([]);
  const [lightbox, setLightbox] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const out: string[] = [];
      for (const pid of f?.photos ?? []) { const p = await getPhoto(pid); if (p) out.push(p.dataUrl); }
      if (alive) setPhotos(out);
    })();
    return () => { alive = false; };
  }, [f?.photos, getPhoto]);

  const related = useMemo(() => {
    if (!f) return [];
    const rk = routeKey(f);
    return flights.filter((x) => x.id !== f.id && isCounted(x) && ((rk && routeKey(x) === rk) || (f.aircraft.registration && x.aircraft.registration === f.aircraft.registration))).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3);
  }, [f, flights]);

  const map = useMemo(() => (f ? buildMapData([{ ...f, status: 'completed' }]) : null), [f]);

  if (!f) {
    return <EmptyState title="Flight not found" body="It may have been deleted, or it belongs to the other workspace (demo / personal)." action={<Link to="/flights" className="btn-glass">Back to logbook</Link>} />;
  }

  const t = aircraftType(f.aircraft.typeCode);
  const hero = photoForBody(t?.body, hashStr(f.id));
  const miss = missingFields(f);
  const course = f.dep?.lat != null && f.arr?.lat != null ? Math.round(initialBearing(f.dep.lat, f.dep.lon!, f.arr.lat, f.arr.lon!)) : null;
  const planPath = plannedPath(f);
  const fitPts = planPath ?? (f.dep?.lon != null && f.arr?.lon != null ? [[f.dep.lon, f.dep.lat!], [f.arr.lon, f.arr.lat!]] as [number, number][] : undefined);
  const fp = f.flightPlan;
  const depDelay = minutesDelta(f.times.schedOut, f.times.offBlock);
  const arrDelay = minutesDelta(f.times.schedIn, f.times.onBlock);

  /** Planned → completed: scheduled times become the recorded gate times, then the form opens to adjust. */
  function markFlown() {
    openForm({ ...f!, status: 'completed', times: { ...f!.times, offBlock: f!.times.offBlock ?? f!.times.schedOut, onBlock: f!.times.onBlock ?? f!.times.schedIn } }, 'edit');
    toast({ kind: 'info', title: 'Marked as flown', body: 'Scheduled times were copied to off-block and on-block. Adjust them and add takeoff and landing if you know them, then save.' });
  }

  async function remove() {
    const removed = await del([f!.id]);
    sound.warn();
    nav('/flights');
    toast({ kind: 'info', title: 'Flight deleted', action: { label: 'Undo', run: () => restore(removed) } });
  }

  const timeline: { label: string; iso: string | null; at: 'dep' | 'arr'; sched?: boolean }[] = [
    { label: 'Scheduled departure', iso: f.times.schedOut, at: 'dep', sched: true },
    { label: 'Off-block', iso: f.times.offBlock, at: 'dep' },
    { label: 'Takeoff', iso: f.times.takeoff, at: 'dep' },
    { label: 'Landing', iso: f.times.landing, at: 'arr' },
    { label: 'On-block', iso: f.times.onBlock, at: 'arr' },
    { label: 'Scheduled arrival', iso: f.times.schedIn, at: 'arr', sched: true },
  ];
  const tl = timeline.filter((x) => x.iso);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn-ghost -ml-2" onClick={() => (history.length > 1 ? nav(-1) : nav('/flights'))}><ArrowLeft className="h-4 w-4" />Back</button>
        <div className="ml-auto flex gap-2">
          {f.status === 'planned' && <button className="btn-primary" onClick={() => markFlown()}><CheckCircle2 className="h-4 w-4" />Mark as flown</button>}
          <button className="btn-glass" onClick={() => openForm(f, 'edit')}><Pencil className="h-4 w-4" />Edit</button>
          <button className="btn-glass" onClick={() => setShare(true)} aria-label="Share flight"><Share2 className="h-4 w-4" /><span className="hidden sm:inline">Share</span></button>
          <button className="btn-glass" onClick={() => openForm(f, 'duplicate')}><Copy className="h-4 w-4" /><span className="hidden sm:inline">Duplicate</span></button>
          <button className="btn-glass hover:text-bad" onClick={() => setConfirm(true)} aria-label="Delete flight"><Trash2 className="h-4 w-4" /></button>
        </div>
      </div>

      {/* Hero record */}
      <section className="overflow-hidden rounded-xl3 glass">
        <Photo photo={photos[0] ? undefined : hero} src={photos[0]} priority className="h-56 md:h-72" sizes="100vw">
          <div className="flex h-full flex-col justify-between p-5 md:p-7">
            <div className="flex flex-wrap items-center gap-2">
              <span className="mono rounded-lg bg-black/35 px-2.5 py-1 text-[15px] font-semibold text-ice backdrop-blur-md">{f.flightNumber || f.callsign || 'Flight'}</span>
              {f.airline && <span className="rounded-lg bg-black/35 px-2.5 py-1 text-[13px] backdrop-blur-md">{f.airline}</span>}
              <CategoryBadge c={f.category} />
              <StatusBadge s={f.status} />
              {f.source === 'demo' && <span className="rounded bg-warn/25 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-warn">DEMO</span>}
            </div>
            <div className="text-[12px] text-fg/75">{photos[0] ? 'Your photo' : 'Representative photo — not the aircraft you flew'}</div>
          </div>
        </Photo>
        <div className="p-5 pb-9 md:p-7 md:pb-10">
          <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
            <span className="num text-fg">{fmt.date(f.date)}</span>
            <span>·</span><span>{aircraftLabel(f)}</span>
            {f.aircraft.registration && <><span>·</span><span className="mono">{fmt.reg(f)}</span></>}
            {f.simulator && <><span>·</span><span className="text-live">{f.simulator}</span></>}
          </div>
          <RouteBar f={f} size="lg" />
        </div>
      </section>

      {miss.length > 0 && f.status !== 'planned' && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl2 bg-warn/[0.08] px-4 py-3 text-[13px] ring-1 ring-warn/25">
          <AlertTriangle className="h-4 w-4 text-warn" />This record is missing {miss.join(', ')}. Totals leave out what isn't recorded.
          <button className="btn-sm btn-glass ml-auto" onClick={() => openForm(f, 'edit')}>Complete it</button>
        </div>
      )}

      {/* Stats strip */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat icon={Clock} label="Flight time" value={fmt.dur(f.flightMinutes)} sub={f.flightMinutesSource === 'manual' ? 'Entered duration' : f.flightMinutesSource === 'computed' ? 'Takeoff → landing' : 'Not recorded'} />
        <Stat icon={Clock} label="Block time" value={fmt.dur(f.blockMinutes)} sub={f.blockMinutesSource === 'manual' ? 'Entered duration' : f.blockMinutesSource === 'computed' ? 'Off-block → on-block' : 'Not recorded'} tip="Block time is never estimated from flight time." />
        <Stat icon={Ruler} label="Great-circle distance" value={fmt.dist(f.distanceKm)} sub={f.recordedDistanceKm != null ? `${fmt.dist(f.recordedDistanceKm)} recorded` : course != null ? `Initial course ${String(course).padStart(3, '0')}°` : undefined} />
        <Stat icon={Mountain} label="Cruise" value={f.flightLevel || fmt.alt(f.cruiseAltitudeFt)} sub={f.avgGroundSpeedKt != null ? `${fmt.speed(f.avgGroundSpeedKt)} avg GS` : f.cruiseAltitudeFt != null && f.flightLevel ? fmt.alt(f.cruiseAltitudeFt) : undefined} />
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-5">
          {/* Map */}
          {map && fitPts && (
            <Glass className="overflow-hidden p-0">
              <WorldMap routes={map.routes} airports={map.airports} fit={fitPts} height={360} selectedRoute={map.routes[0]?.key} fixes={fp?.fixes.filter((x) => x.ident !== f.dep?.ident && x.ident !== f.arr?.ident && x.type !== 'toc' && x.type !== 'tod')} />
              <div className="flex items-center justify-between border-t border-white/[0.06] px-4 py-2.5 text-[12px] text-muted">
                <span>{planPath ? `Filed route: ${fp!.fixes.length} fixes${fp!.routeDistanceNm ? ` · ${fmt.dist(fp!.routeDistanceNm * 1.852)} planned vs ${fmt.dist(f.distanceKm)} great-circle` : ''}` : 'Great-circle path between the airport coordinates'}</span>
                <Link to="/map" className="link">Open full map</Link>
              </div>
            </Glass>
          )}

          {fp && <FlightPlanCard f={f} />}

          {/* Airport cards */}
          <div className="grid gap-4 sm:grid-cols-2">
            {([['Departure', f.dep, 'dep'], ['Arrival', f.arr, 'arr']] as const).map(([label, a]) => (
              <Glass key={label} className="p-4">
                <div className="label mb-2">{label}</div>
                {a ? (
                  <Link to={`/airports/${a.ident}`} className="group block">
                    <div className="flex items-baseline gap-2"><span className="mono text-[26px] font-semibold group-hover:text-ice transition">{a.iata || a.ident}</span><span className="mono text-[12px] text-faint">{a.ident}</span></div>
                    <div className="mt-1 text-[13.5px]">{a.name}</div>
                    <div className="text-[12.5px] text-muted">{[a.city, countryName(a.country)].filter(Boolean).join(', ')}{a.continent && ` · ${CONTINENT_LABEL[a.continent] ?? a.continent}`}</div>
                    <div className="mt-2 text-[11.5px] text-faint mono">{a.lat != null ? `${a.lat.toFixed(4)}, ${a.lon!.toFixed(4)}` : 'No coordinates'} · {a.tz}</div>
                    {a.source === 'custom' && <div className="mt-1 text-[11px] text-warn">User-entered airport</div>}
                  </Link>
                ) : <div className="text-[13px] text-muted">Not recorded</div>}
              </Glass>
            ))}
          </div>

          {/* Timeline */}
          <Glass className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-[14px] font-semibold">Timing</h3>
              <div className="flex gap-2 text-[11.5px]">
                {depDelay != null && <span className={cx('chip', depDelay > 15 ? 'text-warn ring-warn/30' : 'text-good ring-good/25')}>Out {depDelay >= 0 ? '+' : '−'}{Math.abs(depDelay)}m</span>}
                {arrDelay != null && <span className={cx('chip', arrDelay > 15 ? 'text-warn ring-warn/30' : 'text-good ring-good/25')}>In {arrDelay >= 0 ? '+' : '−'}{Math.abs(arrDelay)}m</span>}
              </div>
            </div>
            {tl.length === 0 ? <p className="text-[13px] text-muted">No timestamps recorded{f.flightMinutes != null ? ` — flight time entered as a ${fmtDurationLong(f.flightMinutes)} duration` : ''}.</p> : (
              <ol className="relative ml-1.5 border-l border-white/10">
                {tl.map((x, i) => {
                  const ap = x.at === 'dep' ? f.dep : f.arr;
                  const prev = tl[i - 1];
                  const gap = prev && !x.sched && !prev.sched ? minutesBetween(prev.iso, x.iso) : null;
                  return (
                    <li key={x.label} className="relative pb-4 pl-5 last:pb-0">
                      <span className={cx('absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-ink', x.sched ? 'bg-white/25' : 'bg-ice')} />
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className={cx('text-[13px]', x.sched ? 'text-muted' : 'text-fg')}>{x.label}</span>
                        <span className="mono text-[13px]">{ap ? fmt.timeAt(x.iso, ap.tz) : '—'} <span className="text-faint">{ap ? fmt.zone(ap.tz, x.iso) : ''}</span><span className="ml-2 text-faint">{fmt.timeAt(x.iso, 'UTC')}Z</span></span>
                      </div>
                      {gap != null && gap > 0 && <div className="mt-0.5 text-[11px] text-faint">+{fmtDurationLong(gap)} {x.label === 'Takeoff' ? 'taxi out' : x.label === 'Landing' ? 'airborne' : x.label === 'On-block' ? 'taxi in' : ''}</div>}
                    </li>
                  );
                })}
              </ol>
            )}
          </Glass>

          {(f.notes || photos.length > 0 || f.tags.length > 0 || f.rating) && (
            <Glass className="p-5">
              <div className="mb-3 flex items-center justify-between"><h3 className="text-[14px] font-semibold">Notes & memories</h3>{f.rating && <Stars value={f.rating} />}</div>
              {f.notes && <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-fg/90">{f.notes}</p>}
              {f.tags.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{f.tags.map((t) => <Link key={t} to={`/flights?tag=${encodeURIComponent(t)}`} className="chip hover:text-ice"><Tag className="h-3 w-3" />{t}</Link>)}</div>}
              {photos.length > 0 && (
                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {photos.map((p, i) => <button key={i} className="aspect-[4/3] overflow-hidden rounded-xl ring-1 ring-white/10" onClick={() => setLightbox(p)}><img src={p} alt={`Flight photo ${i + 1}`} className="h-full w-full object-cover transition hover:scale-[1.03]" /></button>)}
                </div>
              )}
            </Glass>
          )}
        </div>

        <div className="flex flex-col gap-5">
          <Glass className="p-5">
            <div className="mb-1 flex items-center gap-2"><Plane className="h-4 w-4 text-ice" /><h3 className="text-[14px] font-semibold">Aircraft</h3></div>
            <div className="divide-y divide-white/[0.06]">
              <KV k="Type" v={aircraftLabel(f)} />
              <KV k="ICAO designator" v={f.aircraft.typeCode || '—'} mono />
              {t && <KV k="Class" v={`${t.body} · ${t.engine}`} />}
              {t && <KV k={<span className="inline-flex items-center gap-1">Wake category <Tip text="ICAO wake turbulence category: L light, M medium, H heavy, J super."><Info className="h-3 w-3" /></Tip></span>} v={{ L: 'Light', M: 'Medium', H: 'Heavy', J: 'Super' }[t.wake]} />}
              <KV k="Registration" v={fmt.reg(f)} mono />
              {f.aircraft.nickname && <KV k="Name" v={f.aircraft.nickname} />}
              {f.configNotes && <KV k="Configuration" v={f.configNotes} />}
              <KV k="Operator" v={f.operator || f.airline || '—'} />
            </div>
            {f.aircraft.typeCode && <Link to={`/aircraft/${encodeURIComponent(f.aircraft.typeCode)}`} className="link mt-3 inline-block text-[12.5px]">All flights on this type</Link>}
            {!t && f.aircraft.typeCode && <p className="mt-2 text-[11.5px] text-faint">Type not in Flight Log's built-in list, so no classification is shown.</p>}
          </Glass>

          <Glass className="p-5">
            <h3 className="mb-1 text-[14px] font-semibold">Flight information</h3>
            <div className="divide-y divide-white/[0.06]">
              {f.callsign && <KV k="Callsign" v={f.callsign} mono />}
              {f.role && <KV k="Role" v={ROLE_LABEL[f.role]} />}
              {f.seat && <KV k={<span className="inline-flex items-center gap-1.5"><Armchair className="h-3.5 w-3.5" />Seat</span>} v={f.seat} mono />}
              {f.purpose && <KV k="Purpose" v={f.purpose} />}
              {f.passengers != null && <KV k={<span className="inline-flex items-center gap-1.5"><Users className="h-3.5 w-3.5" />Passengers</span>} v={f.passengers} mono />}
              {f.fuel != null && <KV k={<span className="inline-flex items-center gap-1.5"><Fuel className="h-3.5 w-3.5" />Fuel</span>} v={`${f.fuel.toLocaleString('en-GB')} ${f.fuelUnit}`} mono />}
              {f.maxGroundSpeedKt != null && <KV k={<span className="inline-flex items-center gap-1.5"><Gauge className="h-3.5 w-3.5" />Max GS</span>} v={fmt.speed(f.maxGroundSpeedKt)} mono />}
              {(f.takeoffsDay ?? f.takeoffsNight ?? f.landingsDay ?? f.landingsNight) != null && <KV k="T/O · LDG (day/night)" v={`${f.takeoffsDay ?? 0}/${f.takeoffsNight ?? 0} · ${f.landingsDay ?? 0}/${f.landingsNight ?? 0}`} mono />}
              {f.crew && <KV k="Crew" v={f.crew} />}
              {f.weather && <KV k={<span className="inline-flex items-center gap-1.5"><CloudSun className="h-3.5 w-3.5" />Weather</span>} v={<span className="mono text-[12px]">{f.weather}</span>} />}
              <KV k="Source" v={{ manual: 'Entered by hand', csv: 'CSV import', json: 'Backup restore', simbrief: 'SimBrief OFP', demo: 'Demo data (fictional)', duplicate: 'Duplicated' }[f.source]} />
            </div>
            {(f.actualRoute || (f.plannedRoute && !f.flightPlan)) && (
              <div className="mt-3">
                <div className="label mb-1.5">{f.actualRoute ? 'Actual route' : 'Planned route'}</div>
                <p className="mono break-words rounded-xl bg-deep/70 p-3 text-[12px] leading-relaxed text-ice/90 ring-1 ring-white/[0.06]">{f.actualRoute || f.plannedRoute}</p>
              </div>
            )}
          </Glass>

          {hasPilotData(f) && (
            <Glass className="p-5">
              <h3 className="mb-1 text-[14px] font-semibold">Pilot log</h3>
              <div className="divide-y divide-white/[0.06]">
                {PILOT_FIELDS.filter((p) => f.pilot?.[p.key]).map((p) => <KV key={p.key} k={p.label} v={p.kind === 'time' ? fmt.dur(f.pilot![p.key]) : f.pilot![p.key]} mono />)}
              </div>
            </Glass>
          )}

          {related.length > 0 && (
            <div>
              <h3 className="mb-3 text-[14px] font-semibold">Related flights</h3>
              <div className="grid gap-3">{related.map((r) => <FlightCard key={r.id} f={r} />)}</div>
            </div>
          )}
        </div>
      </div>

      <ShareFlightDialog f={f} open={share} onOpenChange={setShare} />
      <ConfirmDialog open={confirm} onOpenChange={setConfirm} title="Delete this flight?" body="The record is removed and all totals recalculated. You can undo straight after." onConfirm={remove} />
      {lightbox && (
        <button className="fixed inset-0 z-[80] grid place-items-center bg-black/85 p-6 backdrop-blur" onClick={() => setLightbox(null)} aria-label="Close photo">
          <img src={lightbox} alt="Flight photo" className="max-h-full max-w-full rounded-xl2 shadow-lift" />
        </button>
      )}
    </div>
  );
}

function minutesDelta(sched: string | null, actual: string | null): number | null {
  if (!sched || !actual) return null;
  return Math.round((Date.parse(actual) - Date.parse(sched)) / 60000);
}

function Stat({ icon: Icon, label, value, sub, tip }: { icon: any; label: string; value: string; sub?: string; tip?: string }) {
  return (
    <Glass className="p-4">
      <div className="flex items-center gap-1.5 text-[12px] text-muted"><Icon className="h-3.5 w-3.5 text-ice/80" />{label}{tip && <Tip text={tip}><Info className="h-3 w-3 text-faint" /></Tip>}</div>
      <div className="mono mt-2 text-[24px] font-semibold leading-none">{value}</div>
      {sub && <div className="mt-1.5 truncate text-[11.5px] text-faint">{sub}</div>}
    </Glass>
  );
}

import { ShareFlightDialog } from '../components/flight/ShareFlight';

import { FileText as FileIcon, ExternalLink, Fuel as FuelIcon, Copy as CopyIcon } from 'lucide-react';

function FlightPlanCard({ f }: { f: Flight }) {
  const fmt = useFmt();
  const fp = f.flightPlan!;
  const [all, setAll] = useState(false);
  const toast = useStore((s) => s.toast);
  const shown = all ? fp.fixes : fp.fixes.slice(0, 14);
  const fuel = fp.fuel;
  const fu = (v: number | null) => (v == null ? '—' : `${v.toLocaleString('en-GB')} ${fp.fuelUnit}`);
  return (
    <Glass className="p-5">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <FileIcon className="h-4 w-4 text-ice" />
        <h3 className="text-[14px] font-semibold">Flight plan</h3>
        <span className="chip">{fp.source === 'simbrief' ? 'SimBrief OFP' : 'Manual'}</span>
        {fp.airac && <span className="chip">AIRAC {fp.airac}</span>}
        {fp.ofpUrl && <a href={fp.ofpUrl} target="_blank" rel="noreferrer" className="btn-glass btn-sm ml-auto"><ExternalLink className="h-3.5 w-3.5" />Open OFP</a>}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ['Cruise', fp.cruiseFl || '—'],
          ['Planned distance', fp.routeDistanceNm != null ? fmt.dist(fp.routeDistanceNm * 1.852) : '—'],
          ['Planned time', fp.plannedEteMin != null ? fmt.dur(fp.plannedEteMin) : '—'],
          ['Alternate', fp.alternate || '—'],
          ['Cost index', fp.costIndex || '—'],
          ['Wind', fp.avgWind || '—'],
          ['Air distance', fp.airDistanceNm != null ? fmt.dist(fp.airDistanceNm * 1.852) : '—'],
          ['Fixes', String(fp.fixes.length)],
        ].map(([k, v]) => <div key={k} className="rounded-xl bg-white/[0.03] p-3 ring-1 ring-white/[0.06]"><div className="text-[11px] text-muted">{k}</div><div className="mono mt-1 text-[14px]">{v}</div></div>)}
      </div>
      {fp.route && (
        <div className="mt-4">
          <div className="mb-1.5 flex items-center justify-between"><div className="label">Route</div><button className="btn-ghost btn-sm" onClick={() => { navigator.clipboard?.writeText(fp.route).then(() => toast({ kind: 'success', title: 'Route copied' }), () => {}); }}><CopyIcon className="h-3.5 w-3.5" />Copy</button></div>
          <p className="mono break-words rounded-xl bg-deep/70 p-3 text-[12px] leading-relaxed text-ice/90 ring-1 ring-white/[0.06]">{f.dep?.ident} {fp.route} {f.arr?.ident}</p>
        </div>
      )}
      {fp.fixes.length > 0 && (
        <div className="mt-4">
          <div className="label mb-1.5">Navigation log</div>
          <div className="overflow-x-auto rounded-xl ring-1 ring-white/[0.06]">
            <table className="w-full text-[12px]">
              <thead><tr className="text-left text-[10.5px] uppercase tracking-wider text-faint"><th className="px-3 py-2 font-medium">Fix</th><th className="px-3 py-2 font-medium">Via</th><th className="px-3 py-2 font-medium text-right">Altitude</th><th className="px-3 py-2 font-medium text-right">Elapsed</th><th className="px-3 py-2 font-medium">Position</th></tr></thead>
              <tbody className="divide-y divide-white/[0.05]">
                {shown.map((x, i) => (
                  <tr key={x.ident + i}>
                    <td className="mono px-3 py-1.5 text-ice">{x.ident}{x.type === 'toc' || x.type === 'tod' ? '' : ''}</td>
                    <td className="mono px-3 py-1.5 text-muted">{x.airway || '—'}</td>
                    <td className="mono px-3 py-1.5 text-right">{x.altFt != null ? (x.altFt >= 18000 ? `FL${Math.round(x.altFt / 100)}` : fmt.alt(x.altFt)) : '—'}</td>
                    <td className="mono px-3 py-1.5 text-right text-muted">{x.elapsedMin != null ? fmt.dur(x.elapsedMin) : '—'}</td>
                    <td className="mono px-3 py-1.5 text-faint">{x.lat.toFixed(2)}, {x.lon.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {fp.fixes.length > 14 && <button className="btn-ghost btn-sm mt-2" onClick={() => setAll(!all)}>{all ? 'Show fewer' : `Show all ${fp.fixes.length} fixes`}</button>}
        </div>
      )}
      {(fuel.ramp ?? fuel.trip) != null && (
        <div className="mt-4">
          <div className="label mb-1.5 flex items-center gap-1.5"><FuelIcon className="h-3.5 w-3.5" />Fuel plan</div>
          <div className="grid grid-cols-2 gap-x-6 sm:grid-cols-3">
            {[['Ramp', fuel.ramp], ['Takeoff', fuel.takeoff], ['Trip', fuel.trip], ['Contingency', fuel.contingency], ['Alternate', fuel.alternate], ['Reserve', fuel.reserve], ['Landing', fuel.landing]].filter(([, v]) => v != null).map(([k, v]) => <KV key={k as string} k={k} v={fu(v as number)} mono />)}
          </div>
        </div>
      )}
    </Glass>
  );
}
