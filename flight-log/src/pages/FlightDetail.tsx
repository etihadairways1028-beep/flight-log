import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Share2, CheckCircle2, ArrowLeft, Pencil, Copy, Trash2, MapPin, Plane, Clock, Ruler, Mountain, Gauge, Users, CloudSun, Tag, NotebookPen, AlertTriangle, Fuel, Armchair, Info, Sparkles } from 'lucide-react';
import { DebriefDialog } from '../components/flight/Debrief';
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
  const [params, setParams] = useSearchParams();
  const debrief = params.get('debrief') === '1';
  const setDebrief = (v: boolean) => setParams((p) => { if (v) p.set('debrief', '1'); else p.delete('debrief'); return p; }, { replace: true });

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
  const replay = useReplay(f?.track);

  if (!f) {
    return <EmptyState title="Flight not found" body="It may have been deleted, or it belongs to the other workspace (demo / personal)." action={<Link to="/flights" className="btn-glass">Back to logbook</Link>} />;
  }

  const t = aircraftType(f.aircraft.typeCode);
  const hero = photoForBody(t?.body, hashStr(f.id));
  const miss = missingFields(f);
  const course = f.dep?.lat != null && f.arr?.lat != null ? Math.round(initialBearing(f.dep.lat, f.dep.lon!, f.arr.lat, f.arr.lon!)) : null;
  const planPath = plannedPath(f);
  const trackPts = f.track && f.track.length > 1 ? f.track.map((p) => [p.lon, p.lat] as [number, number]) : null;
  const fitPts = trackPts && planPath ? [...trackPts, ...planPath] : trackPts ?? planPath ?? (f.dep?.lon != null && f.arr?.lon != null ? [[f.dep.lon, f.dep.lat!], [f.arr.lon, f.arr.lat!]] as [number, number][] : undefined);
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
        <div className="ml-auto flex flex-wrap justify-end gap-2">
          {(f.status === 'completed' || f.status === 'diverted') && <button className="btn-glass" onClick={() => setDebrief(true)}><Sparkles className="h-4 w-4" /><span className="hidden sm:inline">Debrief</span></button>}
          {f.status === 'planned' && <button className="btn-primary" onClick={() => markFlown()}><CheckCircle2 className="h-4 w-4" />Mark as flown</button>}
          <button className="btn-glass" onClick={() => openForm(f, 'edit')} aria-label="Edit flight"><Pencil className="h-4 w-4" /><span className={f.status === 'planned' ? 'hidden sm:inline' : ''}>Edit</span></button>
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
          <div className="pt-12"><RouteBar f={f} size="lg" /></div>
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
              <WorldMap routes={map.routes} airports={map.airports} fit={fitPts} height={360} selectedRoute={map.routes[0]?.key} lines={[...(trackPts && planPath ? [{ pts: planPath, color: 'rgb(94 224 239 / .6)', dash: '4 5', width: 1.4 }] : []), ...(replay.active && replay.flown.length > 1 ? [{ pts: replay.flown, color: '#ffffff', width: 3 }] : [])]} live={replay.active ? replay.pos : null} fixes={fp?.fixes.filter((x) => x.ident !== f.dep?.ident && x.ident !== f.arr?.ident && x.type !== 'toc' && x.type !== 'tod')} />
              <div className="flex items-center justify-between border-t border-white/[0.06] px-4 py-2.5 text-[12px] text-muted">
                <span>{trackPts ? `Recorded track: ${f.track!.length} points${f.recordedDistanceKm != null ? ` · ${fmt.dist(f.recordedDistanceKm)} flown` : ''}${planPath ? ' · dashed line is the filed route' : ''}${f.landingRateFpm != null ? ` · landed at ${Math.abs(f.landingRateFpm)} fpm` : ''}` : planPath ? `Filed route: ${fp!.fixes.length} fixes${fp!.routeDistanceNm ? ` · ${fmt.dist(fp!.routeDistanceNm * 1.852)} planned vs ${fmt.dist(f.distanceKm)} great-circle` : ''}` : 'Great-circle path between the airport coordinates'}</span>
                <Link to="/map" className="link">Open full map</Link>
              </div>
              {replay.ok && <ReplayBar r={replay} />}
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
              {f.landingRateFpm != null && <KV k="Landing rate" v={`${Math.abs(f.landingRateFpm)} fpm · ${landingRating(f.landingRateFpm)?.label ?? ''}`} />}
              <KV k="Source" v={{ manual: 'Entered by hand', csv: 'CSV import', json: 'Backup restore', simbrief: 'SimBrief OFP', demo: 'Demo data (fictional)', duplicate: 'Duplicated', sim: 'Recorded from the simulator' }[f.source]} />
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
      <DebriefDialog flight={f} open={debrief && (f.status === 'completed' || f.status === 'diverted')} onOpenChange={setDebrief} />
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

const STAT_TONE: Record<string, string> = { 'Flight time': '91 155 255', 'Block time': '167 139 250', 'Great-circle distance': '94 224 239', Cruise: '245 181 68' };
function Stat({ icon: Icon, label, value, sub, tip }: { icon: any; label: string; value: string; sub?: string; tip?: string }) {
  const tone = STAT_TONE[label] ?? '91 155 255';
  return (
    <div className="stat-card glass relative overflow-hidden rounded-xl2 p-4" style={{ ['--tone' as any]: tone }}>
      <div className="flex items-center gap-2 text-[12px] text-muted"><span className="grid h-7 w-7 place-items-center rounded-lg" style={{ background: `rgb(${tone} / .16)`, boxShadow: `inset 0 0 0 1px rgb(${tone} / .35)` }}><Icon className="h-3.5 w-3.5" style={{ color: `rgb(${tone})` }} /></span>{label}{tip && <Tip text={tip}><Info className="h-3 w-3 text-faint" /></Tip>}</div>
      <div className="tone-text mono mt-2.5 text-[26px] font-semibold leading-none">{value}</div>
      {sub && <div className="mt-1.5 truncate text-[11.5px] text-faint">{sub}</div>}
    </div>
  );
}

import { ShareFlightDialog } from '../components/flight/ShareFlight';

import { FileText as FileIcon, ExternalLink, Fuel as FuelIcon, Copy as CopyIcon, Download as DownloadIcon, PlaneTakeoff, PlaneLanding, Navigation } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip as RTooltip, CartesianGrid, ReferenceLine } from 'recharts';
import { Play, Pause } from 'lucide-react';
import type { TrackPoint } from '../lib/types';
import { loadRunways, findRunway, SURFACE } from '../lib/runways';
import { toMsfsPln, toXplaneFms, planFileName } from '../lib/planExport';
import { downloadText } from '../lib/download';
import { useSim } from '../lib/simLink';
import { landingRating } from '../lib/recorder';
import { Send as SendIcon } from 'lucide-react';
import { ChartTooltip, AXIS } from '../components/charts/ChartKit';
import type { AirportBrief } from '../lib/types';

function BriefCard({ title, icon: Icon, ident, b, proc, procLabel }: { title: string; icon: any; ident: string; b?: AirportBrief; proc?: string; procLabel: string }) {
  const fmt = useFmt();
  const [, force] = useState(0);
  useEffect(() => { loadRunways().then(() => force((n) => n + 1)); }, []);
  const r = findRunway(ident, b?.runway);
  return (
    <div className="min-w-0 rounded-xl bg-white/[0.03] p-3.5 ring-1 ring-white/[0.06]">
      <div className="mb-2 flex items-center gap-2"><Icon className="h-4 w-4 text-ice" /><span className="label">{title}</span><span className="mono ml-auto text-[13px] text-fg">{ident}</span></div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12.5px]">
        <span className="text-muted">Runway</span><span className="mono text-right">{b?.runway || '—'}</span>
        {r && <><span className="text-muted">Length</span><span className="mono text-right">{r.rw.lengthFt ? `${r.rw.lengthFt.toLocaleString('en-GB')} ft` : '—'}</span></>}
        {r && <><span className="text-muted">Surface</span><span className="text-right">{SURFACE[r.rw.surface] ?? (r.rw.surface || '—')}{r.rw.lighted ? ' · lit' : ''}</span></>}
        {r?.heading != null && <><span className="text-muted">Heading</span><span className="mono text-right">{String(Math.round(r.heading)).padStart(3, '0')}° T</span></>}
        <span className="text-muted">{procLabel}</span><span className="mono text-right text-live">{proc || '—'}</span>
        {(b?.transAlt || b?.transLevel) ? <><span className="text-muted">Trans alt / level</span><span className="mono text-right">{b?.transAlt ? fmt.alt(b.transAlt) : '—'} / {b?.transLevel ? `FL${Math.round(b.transLevel / 100)}` : '—'}</span></> : null}
      </div>
      {b?.metar && <p className="mono mt-2.5 break-words rounded-lg bg-deep/70 p-2 text-[11px] leading-relaxed text-ice/85 ring-1 ring-white/[0.05]"><span className="text-faint">METAR </span>{b.metar}</p>}
      {b?.taf && <details className="mt-1.5"><summary className="cursor-pointer text-[11.5px] text-muted">TAF</summary><p className="mono mt-1 break-words rounded-lg bg-deep/70 p-2 text-[11px] leading-relaxed text-ice/85 ring-1 ring-white/[0.05]">{b.taf}</p></details>}
    </div>
  );
}

// ─── Flight replay ──────────────────────────────────────────────────────────
const SPEEDS = [10, 30, 60, 120, 300, 600];
type Replay = ReturnType<typeof useReplay>;

function useReplay(track?: TrackPoint[]) {
  const pts = useMemo(() => (track ?? []).filter((p) => Number.isFinite(p.t) && Number.isFinite(p.lat) && Number.isFinite(p.lon)).sort((a, b) => a.t - b.t), [track]);
  const ok = pts.length > 2 && pts[pts.length - 1].t > pts[0].t;
  const t0 = ok ? pts[0].t : 0, t1 = ok ? pts[pts.length - 1].t : 0;
  const auto = SPEEDS.find((s) => (t1 - t0) / s <= 75) ?? SPEEDS[SPEEDS.length - 1];
  const [t, setT] = useState(t0);
  const [playing, setPlaying] = useState(false);
  const [active, setActive] = useState(false);
  const [speed, setSpeed] = useState(auto);
  useEffect(() => { setT(t0); setPlaying(false); setActive(false); setSpeed(auto); }, [t0, t1]);
  useEffect(() => {
    if (!playing) return;
    let raf = 0, last = performance.now(), acc = 0;
    const tick = (now: number) => {
      acc += (now - last) / 1000; last = now;
      if (acc > 1 / 30) {
        const dt = acc; acc = 0;
        setT((x) => { const n = x + dt * speed; if (n >= t1) { setPlaying(false); return t1; } return n; });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, t1]);
  // interpolate the aircraft state at time t
  let i = 0, lo = 0, hi = pts.length - 1;
  while (ok && lo <= hi) { const m = (lo + hi) >> 1; if (pts[m].t <= t) { i = m; lo = m + 1; } else hi = m - 1; }
  const a = pts[i], b = pts[Math.min(i + 1, pts.length - 1)];
  const u = ok && b.t > a.t ? Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t))) : 0;
  const lerp = (x: number, y: number) => x + (y - x) * u;
  const lat = ok ? lerp(a.lat, b.lat) : 0, lon = ok ? lerp(a.lon, b.lon) : 0;
  let hdg = 0;
  if (ok) { let j = i; while (j < pts.length - 1 && pts[j + 1].lat === pts[j].lat && pts[j + 1].lon === pts[j].lon) j++; const c = pts[Math.min(j + 1, pts.length - 1)], d = pts[j]; hdg = c === d ? 0 : initialBearing(d.lat, d.lon, c.lat, c.lon); }
  const flown: [number, number][] = ok ? [...pts.slice(0, i + 1).map((p) => [p.lon, p.lat] as [number, number]), [lon, lat]] : [];
  return {
    ok, pts, t, t0, t1, playing, active, speed, flown,
    pos: { lat, lon, hdg },
    altFt: ok ? Math.round(lerp(a.altFt ?? 0, b.altFt ?? 0)) : 0,
    gsKt: ok ? Math.round(lerp(a.gsKt ?? 0, b.gsKt ?? 0)) : 0,
    vsFpm: ok && b.t > a.t ? Math.round((((b.altFt ?? 0) - (a.altFt ?? 0)) / (b.t - a.t)) * 60 / 50) * 50 : 0,
    play() { setActive(true); if (t >= t1) setT(t0); setPlaying(true); },
    pause() { setPlaying(false); },
    seek(x: number) { setActive(true); setT(Math.min(t1, Math.max(t0, x))); },
    setSpeed,
    stop() { setPlaying(false); setActive(false); setT(t0); },
  };
}

function ReplayBar({ r }: { r: Replay }) {
  const fmt = useFmt();
  const chart = useMemo(() => {
    const step = Math.max(1, Math.ceil(r.pts.length / 300));
    return r.pts.filter((_, i) => i % step === 0 || i === r.pts.length - 1).map((p) => ({ t: p.t, alt: p.altFt ?? 0 }));
  }, [r.pts]);
  const el = Math.round(r.t - r.t0);
  const hhmm = (s: number) => `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  return (
    <div className="border-t border-white/[0.06] px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-primary h-9 w-9 rounded-full p-0" onClick={() => (r.playing ? r.pause() : r.play())} aria-label={r.playing ? 'Pause replay' : 'Play replay'}>
          {r.playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 translate-x-[1px]" />}
        </button>
        <div className="min-w-0">
          <div className="text-[13px] font-medium">Flight replay</div>
          <div className="mono text-[11.5px] text-muted">{hhmm(el)} / {hhmm(Math.round(r.t1 - r.t0))} · {new Date(r.t * 1000).toISOString().slice(11, 16)}Z</div>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px]">
          <span><span className="text-faint">ALT </span><span className="mono">{r.altFt >= 18000 ? `FL${Math.round(r.altFt / 100)}` : fmt.alt(r.altFt)}</span></span>
          <span><span className="text-faint">GS </span><span className="mono">{r.gsKt} kt</span></span>
          <span><span className="text-faint">V/S </span><span className="mono">{r.vsFpm > 0 ? '+' : ''}{r.vsFpm}</span></span>
          <span><span className="text-faint">HDG </span><span className="mono">{String(Math.round(r.pos.hdg)).padStart(3, '0')}°</span></span>
          <select aria-label="Replay speed" className="input mono h-8 w-auto py-0 text-[12px]" value={r.speed} onChange={(e) => r.setSpeed(+e.target.value)}>{SPEEDS.map((s) => <option key={s} value={s}>{s}×</option>)}</select>
          {r.active && <button className="btn-ghost btn-sm" onClick={r.stop}>Reset</button>}
        </div>
      </div>
      <div className="relative mt-2 h-16">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chart} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
            <defs><linearGradient id="rpAlt" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#5ee0ef" stopOpacity={0.45} /><stop offset="100%" stopColor="#5ee0ef" stopOpacity={0} /></linearGradient></defs>
            <XAxis dataKey="t" type="number" domain={[r.t0, r.t1]} hide />
            <YAxis hide domain={[0, 'dataMax']} />
            <Area type="monotone" dataKey="alt" stroke="#5ee0ef" strokeWidth={1.5} fill="url(#rpAlt)" isAnimationActive={false} />
            <ReferenceLine x={r.t} stroke="#ffffff" strokeWidth={1.5} />
          </AreaChart>
        </ResponsiveContainer>
        <input type="range" aria-label="Replay position" className="absolute inset-0 h-full w-full cursor-pointer opacity-0" min={r.t0} max={r.t1} step={1} value={Math.round(r.t)} onChange={(e) => r.seek(+e.target.value)} />
      </div>
    </div>
  );
}

function SendToSim({ f }: { f: Flight }) {
  const sim = useSim();
  const toast = useStore((s) => s.toast);
  const [busy, setBusy] = useState(false);
  if (!sim.hello?.canSavePlans || (sim.status !== 'bridge' && sim.status !== 'live')) return null;
  const xp = (sim.tel?.sim ?? sim.hello.sim ?? '').startsWith('X-Plane');
  async function go() {
    setBusy(true);
    const r = await sim.sendPlan(planFileName(f, xp ? 'fms' : 'pln'), xp ? toXplaneFms(f) : toMsfsPln(f));
    setBusy(false);
    toast({ kind: r.ok ? 'success' : 'error', title: r.ok ? (r.loaded ? 'Plan loaded into MSFS' : `Plan saved for ${xp ? 'X-Plane' : 'MSFS'}`) : 'Couldn’t send the plan', body: r.message });
  }
  return <button className="btn-primary btn-sm" disabled={busy} onClick={go}><SendIcon className="h-3.5 w-3.5" />Send to {xp ? 'X-Plane' : 'MSFS'}</button>;
}

function FlightPlanCard({ f }: { f: Flight }) {
  const fmt = useFmt();
  const fp = f.flightPlan!;
  const [all, setAll] = useState(false);
  const toast = useStore((s) => s.toast);
  const fixes = fp.fixes;
  const shown = all ? fixes : fixes.slice(0, 16);
  const fuel = fp.fuel;
  const fu = (v: number | null) => (v == null ? '—' : `${v.toLocaleString('en-GB')} ${fp.fuelUnit}`);
  const route = fp.fullRoute || [f.dep?.ident, fp.route, f.arr?.ident].filter(Boolean).join(' ');
  const profile = fixes.filter((x) => x.cumNm != null).map((x) => ({ nm: x.cumNm, alt: x.altFt ?? 0, ground: x.groundFt ?? 0, ident: x.ident }));
  const copy = (t: string, what: string) => navigator.clipboard?.writeText(t).then(() => toast({ kind: 'success', title: `${what} copied` }), () => toast({ kind: 'error', title: 'Copy blocked by the browser' }));
  return (
    <Glass className="p-5">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <FileIcon className="h-4 w-4 text-ice" />
        <h3 className="text-[14px] font-semibold">Flight plan</h3>
        <span className="chip">{fp.source === 'simbrief' ? 'SimBrief OFP' : fp.label || (fp.source === 'file' ? 'Route file' : 'Typed route')}</span>
        {fp.airac && <span className="chip">AIRAC {fp.airac}</span>}
        {fp.sid && <span className="chip text-live ring-live/25">SID {fp.sid}</span>}
        {fp.star && <span className="chip text-live ring-live/25">STAR {fp.star}</span>}
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        <button className="btn-glass btn-sm" onClick={() => downloadText(planFileName(f, 'pln'), toMsfsPln(f), 'application/xml')}><DownloadIcon className="h-3.5 w-3.5" />MSFS 2020/2024 (.pln)</button>
        <button className="btn-glass btn-sm" onClick={() => downloadText(planFileName(f, 'fms'), toXplaneFms(f), 'text/plain')}><DownloadIcon className="h-3.5 w-3.5" />X-Plane 11/12 (.fms)</button>
        <SendToSim f={f} />
        {fp.ofpUrl && <a href={fp.ofpUrl} target="_blank" rel="noreferrer" className="btn-glass btn-sm"><ExternalLink className="h-3.5 w-3.5" />OFP (PDF)</a>}
        {(fp.downloads ?? []).length > 0 && (
          <details className="relative">
            <summary className="btn-glass btn-sm cursor-pointer list-none">SimBrief files ({fp.downloads!.length})</summary>
            <div className="absolute z-10 mt-1 max-h-64 w-64 overflow-y-auto glass-strong rounded-xl p-1.5 shadow-lift">
              {fp.downloads!.map((d) => <a key={d.url} href={d.url} target="_blank" rel="noreferrer" className="block truncate rounded-lg px-2.5 py-1.5 text-[12.5px] hover:bg-white/[0.07]">{d.name}</a>)}
            </div>
          </details>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <BriefCard title="Departure" icon={PlaneTakeoff} ident={f.dep?.ident ?? ''} b={fp.depBrief} proc={fp.sid} procLabel="SID" />
        <BriefCard title="Arrival" icon={PlaneLanding} ident={f.arr?.ident ?? ''} b={fp.arrBrief} proc={fp.star} procLabel="STAR" />
        <BriefCard title="Alternate" icon={Navigation} ident={fp.altnBrief?.icao || fp.alternate || '—'} b={fp.altnBrief} procLabel="Approach" />
      </div>
      <p className="mt-2 text-[11px] text-faint">Approach procedures and ILS frequencies aren’t part of SimBrief’s plan data or any open dataset, so check your charts or the sim’s FMC for them. Runway data: OurAirports.</p>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ['Cruise', fp.cruiseFl || '—'],
          ['Planned distance', fp.routeDistanceNm != null ? fmt.dist(fp.routeDistanceNm * 1.852) : '—'],
          ['Planned time', fp.plannedEteMin != null ? fmt.dur(fp.plannedEteMin) : '—'],
          ['Alternate', fp.alternate || '—'],
          ['Cost index', fp.costIndex || '—'],
          ['Wind', fp.avgWind || '—'],
          ['Air distance', fp.airDistanceNm != null ? fmt.dist(fp.airDistanceNm * 1.852) : '—'],
          ['Waypoints', String(fixes.length)],
        ].map(([k, v]) => <div key={k} className="rounded-xl bg-white/[0.03] p-3 ring-1 ring-white/[0.06]"><div className="text-[11px] text-muted">{k}</div><div className="mono mt-1 text-[14px]">{v}</div></div>)}
      </div>

      <div className="mt-4">
        <div className="mb-1.5 flex items-center justify-between"><div className="label">Full route</div><button className="btn-ghost btn-sm" onClick={() => copy(route, 'Route')}><CopyIcon className="h-3.5 w-3.5" />Copy</button></div>
        <p className="mono break-words rounded-xl bg-deep/70 p-3 text-[12px] leading-relaxed text-ice/90 ring-1 ring-white/[0.06]">{route}</p>
        {(fp.unresolved?.length ?? 0) > 0 && <p className="mt-1.5 text-[11.5px] text-faint">Not drawn on the map (no coordinates known): <span className="mono">{fp.unresolved!.join(' ')}</span>. Import a .pln, .fms or SimBrief plan to place every waypoint.</p>}
      </div>

      {profile.length > 2 && (
        <div className="mt-4">
          <div className="label mb-1.5">Vertical profile</div>
          <div className="h-[170px]"><ResponsiveContainer>
            <AreaChart data={profile} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="vp" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#5b9bff" stopOpacity={0.45} /><stop offset="100%" stopColor="#5b9bff" stopOpacity={0.02} /></linearGradient>
                <linearGradient id="gr" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#8a7a5a" stopOpacity={0.7} /><stop offset="100%" stopColor="#8a7a5a" stopOpacity={0.2} /></linearGradient>
              </defs>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="nm" type="number" domain={[0, 'dataMax']} {...AXIS} tickFormatter={(v) => `${v} nm`} />
              <YAxis {...AXIS} width={52} tickFormatter={(v) => (v >= 18000 ? `FL${Math.round(v / 100)}` : `${Math.round(v / 1000)}k`)} />
              <RTooltip content={<ChartTooltip labelFormat={(v: number) => `${v} nm from departure`} format={(v: number) => `${Math.round(v).toLocaleString('en-GB')} ft`} />} />
              <Area type="monotone" dataKey="ground" name="Terrain" stroke="#8a7a5a" fill="url(#gr)" strokeWidth={1} isAnimationActive={false} />
              <Area type="monotone" dataKey="alt" name="Planned altitude" stroke="#a9d4ff" strokeWidth={2} fill="url(#vp)" />
            </AreaChart>
          </ResponsiveContainer></div>
        </div>
      )}

      {fixes.length > 0 && (
        <div className="mt-4">
          <div className="label mb-1.5">Navigation log</div>
          <div className="overflow-x-auto rounded-xl ring-1 ring-white/[0.06]">
            <table className="w-full text-[12px]">
              <thead><tr className="text-left text-[10.5px] uppercase tracking-wider text-faint">{['Fix', 'Via', 'Freq', 'Alt', 'Trk', 'Wind', 'OAT', 'Dist', 'Elapsed', 'Fuel'].map((h, i) => <th key={h} className={cx('px-3 py-2 font-medium whitespace-nowrap', i > 2 && 'text-right')}>{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-white/[0.05]">
                {shown.map((x, i) => (
                  <tr key={x.ident + i} className={cx(x.isSidStar && 'bg-live/[0.05]', (x.type === 'toc' || x.type === 'tod') && 'text-faint')}>
                    <td className="mono px-3 py-1.5 text-ice whitespace-nowrap">{x.ident}{x.type === 'vor' || x.type === 'ndb' ? <span className="ml-1 text-[10px] uppercase text-faint">{x.type}</span> : null}</td>
                    <td className={cx('mono px-3 py-1.5 whitespace-nowrap', x.isSidStar ? 'text-live' : 'text-muted')}>{x.airway || '—'}</td>
                    <td className="mono px-3 py-1.5 text-muted">{x.frequency || ''}</td>
                    <td className="mono px-3 py-1.5 text-right">{x.altFt != null ? (x.altFt >= 18000 ? `FL${Math.round(x.altFt / 100)}` : fmt.alt(x.altFt)) : '—'}</td>
                    <td className="mono px-3 py-1.5 text-right text-muted">{x.trackTrue != null ? String(Math.round(x.trackTrue)).padStart(3, '0') : ''}</td>
                    <td className="mono px-3 py-1.5 text-right text-muted whitespace-nowrap">{x.windDir != null && x.windKt != null ? `${String(Math.round(x.windDir)).padStart(3, '0')}/${Math.round(x.windKt)}` : ''}</td>
                    <td className="mono px-3 py-1.5 text-right text-muted">{x.oatC != null ? `${x.oatC}°` : ''}</td>
                    <td className="mono px-3 py-1.5 text-right text-muted">{x.cumNm ?? ''}</td>
                    <td className="mono px-3 py-1.5 text-right text-muted">{x.elapsedMin != null ? fmt.dur(x.elapsedMin) : '—'}</td>
                    <td className="mono px-3 py-1.5 text-right text-muted">{x.fuelOnboard != null ? x.fuelOnboard.toLocaleString('en-GB') : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {fixes.length > 16 && <button className="btn-ghost btn-sm mt-2" onClick={() => setAll(!all)}>{all ? 'Show fewer' : `Show all ${fixes.length} waypoints`}</button>}
          <p className="mt-1.5 text-[11px] text-faint">Highlighted rows are part of the SID or STAR. Distances in NM from departure; fuel on board in {fp.fuelUnit}.</p>
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
