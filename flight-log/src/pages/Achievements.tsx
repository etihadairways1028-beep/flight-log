import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Award, Lock, Download, Share2, Plane, MapPin, Flag, Sparkles, Check } from 'lucide-react';
import { useStore } from '../store/useStore';
import { useFmt } from '../lib/useFmt';
import { evaluateAchievements } from '../lib/achievements';
import { summarize } from '../lib/stats';
import { isCounted, typeKey, aircraftLabel } from '../lib/flight';
import { countryName, code } from '../lib/airports';
import { EmptyState, Glass, Meter, PageHeader, Toggle, cx } from '../components/ui';
import { downloadBlob } from '../lib/download';
import { buildMapData } from '../components/map/WorldMap';
import { geoNaturalEarth1, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import world from 'world-atlas/countries-110m.json';
import { sound } from '../lib/sound';

export default function Achievements() {
  const flights = useStore((s) => s.data.flights);
  const enabled = useStore((s) => s.settings.achievementsEnabled);
  const update = useStore((s) => s.updateSettings);
  const fmt = useFmt();
  const states = useMemo(() => evaluateAchievements(flights), [flights]);
  const unlocked = states.filter((s) => s.unlocked).length;

  const timeline = useMemo(() => {
    const fs = flights.filter(isCounted).sort((a, b) => a.date.localeCompare(b.date));
    const ev: { date: string; title: string; sub: string; icon: any; href: string }[] = [];
    const seenT = new Set<string>(), seenC = new Set<string>();
    for (const f of fs) {
      const t = typeKey(f);
      if (t !== 'UNKNOWN' && !seenT.has(t)) { seenT.add(t); ev.push({ date: f.date, title: `First flight on the ${aircraftLabel(f)}`, sub: `${code(f.dep)} → ${code(f.arr)}`, icon: Plane, href: `/flights/${f.id}` }); }
      for (const a of [f.dep, f.arr]) if (a?.country && !seenC.has(a.country)) { seenC.add(a.country); ev.push({ date: f.date, title: `First visit to ${countryName(a.country)}`, sub: a.name, icon: Flag, href: `/airports/${a.ident}` }); }
    }
    for (const s of states) if (s.unlocked && s.unlockedOn) ev.push({ date: s.unlockedOn, title: s.def.title, sub: s.def.description, icon: Award, href: s.unlockedBy ? `/flights/${s.unlockedBy}` : '/achievements' });
    return ev.sort((a, b) => b.date.localeCompare(a.date) || (a.icon === Award ? -1 : 1)).slice(0, 40);
  }, [flights, states]);

  if (!flights.filter(isCounted).length) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader eyebrow="Milestones" title="Achievements" />
        <EmptyState icon={<Award className="h-5 w-5" />} title="Your first milestone is one flight away" body="Achievements are awarded only when your logged flights meet the stated threshold. Nothing is pre-awarded." />
        <AchGrid states={states} />
      </div>
    );
  }

  const groups = [...new Set(states.map((s) => s.def.group))];
  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow="Milestones" title="Achievements" sub="Flight Log milestones, awarded strictly from your records. They're personal goals, not licences, ratings or any official qualification."
        actions={<label className="flex items-center gap-2.5 text-[13px] text-muted">Show achievements<Toggle checked={enabled} onChange={(v) => update({ achievementsEnabled: v })} label="Show achievements" /></label>} />
      {!enabled ? <EmptyState title="Achievements are turned off" body="Turn them back on any time. Your logbook is unaffected." /> : (
        <>
          <Glass className="flex flex-wrap items-center gap-6 p-5">
            <div className="grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-warn/30 to-warn/5 text-warn ring-1 ring-warn/30"><Award className="h-7 w-7" /></div>
            <div><div className="mono text-[30px] font-semibold leading-none">{unlocked}<span className="text-faint">/{states.length}</span></div><div className="mt-1 text-[13px] text-muted">milestones reached</div></div>
            <Meter value={unlocked / states.length} className="min-w-[160px] flex-1" tone="warn" />
          </Glass>
          {groups.map((g) => (
            <section key={g}>
              <h2 className="label mb-3">{g}</h2>
              <AchGrid states={states.filter((s) => s.def.group === g)} />
            </section>
          ))}
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
            <section>
              <h2 className="mb-3 text-[17px] font-semibold tracking-tight">Your aviation timeline</h2>
              <Glass className="p-5">
                <ol className="relative ml-1.5 border-l border-white/10">
                  {timeline.map((e, i) => (
                    <li key={i} className="relative pb-5 pl-6 last:pb-0">
                      <span className={cx('absolute -left-[11px] top-0 grid h-[22px] w-[22px] place-items-center rounded-full ring-4 ring-ink', e.icon === Award ? 'bg-warn/25 text-warn' : 'bg-accent/25 text-ice')}><e.icon className="h-3 w-3" /></span>
                      <div className="num text-[11.5px] text-faint">{fmt.date(e.date)}</div>
                      <Link to={e.href} className="text-[13.5px] font-medium hover:text-ice">{e.title}</Link>
                      <div className="text-[12px] text-muted">{e.sub}</div>
                    </li>
                  ))}
                </ol>
              </Glass>
            </section>
            <ShareCard />
          </div>
        </>
      )}
    </div>
  );
}

function AchGrid({ states }: { states: ReturnType<typeof evaluateAchievements> }) {
  const fmt = useFmt();
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {states.map((s) => (
        <Glass key={s.def.id} className={cx('relative overflow-hidden p-4', !s.unlocked && 'opacity-75')}>
          {s.unlocked && <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-warn/15 blur-2xl" />}
          <div className="flex items-start gap-3">
            <div className={cx('grid h-10 w-10 shrink-0 place-items-center rounded-xl ring-1', s.unlocked ? 'bg-gradient-to-br from-warn/35 to-warn/10 text-warn ring-warn/35' : 'bg-white/[0.04] text-faint ring-white/10')}>{s.unlocked ? <Award className="h-5 w-5" /> : <Lock className="h-4 w-4" />}</div>
            <div className="min-w-0">
              <div className="text-[13.5px] font-semibold">{s.def.title}</div>
              <div className="mt-0.5 text-[12px] leading-snug text-muted">{s.def.description}</div>
            </div>
          </div>
          <div className="mt-4">
            {s.unlocked ? (
              <div className="flex items-center gap-1.5 text-[12px] text-good"><Check className="h-3.5 w-3.5" />Reached {s.unlockedOn ? fmt.date(s.unlockedOn) : ''}{s.unlockedBy && <Link to={`/flights/${s.unlockedBy}`} className="link ml-auto text-[11.5px]">Flight</Link>}</div>
            ) : (
              <>
                <Meter value={s.progress} />
                <div className="mono mt-1.5 flex justify-between text-[11px] text-faint"><span>{fmtVal(s.value, s.def.unit)}</span><span>{fmtVal(s.def.target, s.def.unit)}</span></div>
              </>
            )}
          </div>
        </Glass>
      ))}
    </div>
  );
}
function fmtVal(v: number, unit?: string) {
  if (unit === 'h') return `${v.toFixed(v < 10 ? 1 : 0)} h`;
  if (unit === 'km') return `${Math.round(v).toLocaleString('en-GB')} km`;
  return `${Math.floor(v).toLocaleString('en-GB')}`;
}

/** Privacy-conscious summary card rendered to a PNG on a canvas. */
function ShareCard() {
  const flights = useStore((s) => s.data.flights);
  const st = useStore((s) => s.settings);
  const update = useStore((s) => s.updateSettings);
  const fmt = useFmt();
  const ref = useRef<HTMLCanvasElement>(null);
  const [opts, setOpts] = useState({ name: true, map: true, period: 'all' as 'all' | 'year' });
  const year = new Date().getFullYear();
  const fs = useMemo(() => flights.filter(isCounted).filter((f) => opts.period === 'all' || f.date.startsWith(String(year))), [flights, opts.period, year]);
  const sum = useMemo(() => summarize(fs), [fs]);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const W = 1080, H = 1350;
    c.width = W; c.height = H;
    const g = c.getContext('2d')!;
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#0d1d3d'); bg.addColorStop(0.55, '#060d1f'); bg.addColorStop(1, '#03070f');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    const glow = g.createRadialGradient(W * 0.8, 0, 0, W * 0.8, 0, 900);
    glow.addColorStop(0, 'rgba(59,130,246,0.35)'); glow.addColorStop(1, 'rgba(59,130,246,0)');
    g.fillStyle = glow; g.fillRect(0, 0, W, H);
    // map
    if (opts.map) {
      const proj = geoNaturalEarth1().fitExtent([[60, 300], [W - 60, 820]], { type: 'Sphere' } as any);
      const path = geoPath(proj, g as any);
      g.beginPath(); path(feature(world as any, (world as any).objects.countries) as any); g.fillStyle = '#16294f'; g.fill();
      const md = buildMapData(fs);
      const max = Math.max(1, ...md.routes.map((r) => r.count));
      for (const r of md.routes) {
        g.beginPath(); path({ type: 'LineString', coordinates: [r.a, r.b] } as any);
        g.strokeStyle = `rgba(169,212,255,${0.35 + 0.6 * (r.count / max)})`; g.lineWidth = 1.5 + 2.5 * Math.sqrt(r.count / max); g.stroke();
      }
      for (const a of md.airports) { const p = proj([a.lon, a.lat]); if (!p) continue; g.beginPath(); g.arc(p[0], p[1], 4, 0, Math.PI * 2); g.fillStyle = '#ffffff'; g.fill(); }
    }
    const font = (w: number, s: number, mono = false) => `${w} ${s}px ${mono ? "'Geist Mono Variable', ui-monospace, monospace" : "'Geist Variable', system-ui, sans-serif"}`;
    g.fillStyle = '#a9d4ff'; g.font = "700 34px 'Fredoka', 'Geist Variable', sans-serif"; g.fillText('Flight Log', 80, 120);
    g.fillStyle = '#ffffff'; g.font = font(600, 68);
    g.fillText(opts.period === 'year' ? `My ${year} in the air` : 'My flying, so far', 80, 210);
    if (opts.name && st.displayName) { g.fillStyle = '#94a3bd'; g.font = font(400, 32); g.fillText(st.displayName, 80, 262); }
    const stats: [string, string][] = [
      [String(sum.flights), 'flights'],
      [fmt.hours(sum.flightMinutes), sum.simMinutes && sum.realMinutes ? 'hours (real + sim)' : 'hours'],
      [fmt.distCompact(sum.distanceKm), fmt.distUnit],
      [String(sum.uniqueAirports), 'airports'],
      [String(sum.uniqueCountries), 'countries'],
      [String(sum.uniqueTypes), 'aircraft types'],
    ];
    stats.forEach(([v, l], i) => {
      const x = 80 + (i % 3) * 320, y = 940 + Math.floor(i / 3) * 170;
      g.fillStyle = '#ffffff'; g.font = font(600, 76, true); g.fillText(v, x, y);
      g.fillStyle = '#94a3bd'; g.font = font(400, 28); g.fillText(l, x, y + 44);
    });
    if (sum.longestDistance?.dep && sum.longestDistance.arr) {
      g.fillStyle = '#62728f'; g.font = font(400, 26);
      g.fillText(`Longest route  ${code(sum.longestDistance.dep)} → ${code(sum.longestDistance.arr)} · ${fmt.dist(sum.longestDistance.distanceKm)}`, 80, 1270);
    }
  }, [fs, sum, opts, st.displayName, fmt, year]);

  const save = () => ref.current?.toBlob((b) => { if (b) { downloadBlob(`flightlog-summary-${opts.period === 'year' ? year : 'all-time'}.png`, b); sound.success(); } }, 'image/png');
  const share = async () => {
    ref.current?.toBlob(async (b) => {
      if (!b) return;
      const file = new File([b], 'flightlog-summary.png', { type: 'image/png' });
      try { if ((navigator as any).canShare?.({ files: [file] })) await navigator.share({ files: [file], title: 'My Flight Log summary' }); else downloadBlob(file.name, b); } catch { /* cancelled */ }
    }, 'image/png');
  };

  return (
    <section>
      <h2 className="mb-3 text-[17px] font-semibold tracking-tight">Share card</h2>
      <Glass className="p-5">
        <div className="grid gap-5 sm:grid-cols-[minmax(0,240px)_1fr]">
          <canvas ref={ref} className="w-full rounded-xl ring-1 ring-white/10" aria-label="Preview of your shareable flight summary" />
          <div className="flex flex-col gap-3">
            <p className="text-[13px] text-muted">A summary image you can save or share. It never includes registrations, exact dates, seat numbers or notes.</p>
            <label className="flex items-center justify-between gap-3 text-[13px]">Show my name<Toggle checked={opts.name} onChange={(v) => setOpts({ ...opts, name: v })} label="Show my name" /></label>
            <label className="flex items-center justify-between gap-3 text-[13px]">Show route map<Toggle checked={opts.map} onChange={(v) => setOpts({ ...opts, map: v })} label="Show route map" /></label>
            <div className="flex gap-1.5">
              {(['all', 'year'] as const).map((p) => <button key={p} className={cx('chip h-8 px-3', opts.period === p && 'chip-on')} onClick={() => setOpts({ ...opts, period: p })}>{p === 'all' ? 'All time' : `${year} only`}</button>)}
            </div>
            <div className="mt-auto flex flex-wrap gap-2 pt-2">
              <button className="btn-primary" onClick={save}><Download className="h-4 w-4" />Save image</button>
              {'share' in navigator && <button className="btn-glass" onClick={share}><Share2 className="h-4 w-4" />Share</button>}
            </div>
          </div>
        </div>
      </Glass>
    </section>
  );
}
