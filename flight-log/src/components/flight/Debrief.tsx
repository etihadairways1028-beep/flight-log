import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Trophy, PlaneLanding, ClipboardCheck, CalendarRange, Target, Clock, Timer, Ruler, Gauge } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { useFmt } from '../../lib/useFmt';
import { buildDebrief } from '../../lib/stats';
import { aircraftLabel, isSim } from '../../lib/flight';
import { code } from '../../lib/airports';
import { Dialog, cx } from '../ui';
import type { Flight } from '../../lib/types';

const TONE: Record<string, string> = { good: 'text-good', ok: 'text-ice', warn: 'text-warn', bad: 'text-bad' };

export function DebriefDialog({ flight: f, open, onOpenChange }: { flight: Flight; open: boolean; onOpenChange: (v: boolean) => void }) {
  const flights = useStore((s) => s.data.flights);
  const goals = useStore((s) => s.settings.goals);
  const fmt = useFmt();
  const nav = useNavigate();
  const d = useMemo(() => buildDebrief(f, flights, goals), [f, flights, goals]);
  const m = d.month;
  const maxM = Math.max(m.minutes, m.lastMinutes, m.avgMinutes, 1);
  const delta = m.minutes - m.lastMinutes;
  const tiles = [
    { icon: Clock, label: 'Flight time', value: fmt.dur(f.flightMinutes) },
    { icon: Timer, label: 'Block time', value: fmt.dur(f.blockMinutes) },
    { icon: Ruler, label: 'Distance', value: fmt.dist(f.recordedDistanceKm || f.distanceKm) },
    { icon: Gauge, label: f.avgGroundSpeedKt ? 'Avg ground speed' : 'Cruise', value: f.avgGroundSpeedKt ? `${f.avgGroundSpeedKt} kt` : f.flightLevel || (f.cruiseAltitudeFt ? `${f.cruiseAltitudeFt.toLocaleString('en-GB')} ft` : '—') },
  ];
  return (
    <Dialog open={open} onOpenChange={onOpenChange} size="lg" title={<span className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-ice" />Flight debrief</span>}
      footer={<>
        <button className="btn-glass" onClick={() => { onOpenChange(false); nav('/analytics?tab=time'); }}>See analytics</button>
        <button className="btn-primary" onClick={() => onOpenChange(false)}>View flight</button>
      </>}>
      <div className="flex flex-col gap-4">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-accent/25 via-white/[0.03] to-cyan-400/10 p-5 ring-1 ring-white/10">
          <div className="text-[12px] font-medium uppercase tracking-[0.14em] text-ice">Flight #{d.number} · complete</div>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="mono text-[34px] font-semibold leading-none tracking-tight">{code(f.dep)}</span>
            <span className="text-faint">→</span>
            <span className="mono text-[34px] font-semibold leading-none tracking-tight">{code(f.arr)}</span>
          </div>
          <div className="mt-2 text-[13px] text-muted">
            {[f.dep?.city, f.arr?.city].filter(Boolean).join(' to ')}{f.dep?.city || f.arr?.city ? ' · ' : ''}{fmt.date(f.date)}
            {f.aircraft.typeCode ? ` · ${aircraftLabel(f)}` : ''}{isSim(f) ? ` · ${f.simulator || 'Simulator'}` : ''}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {tiles.map((t) => (
            <div key={t.label} className="rounded-xl bg-white/[0.04] p-3 ring-1 ring-white/[0.07]">
              <div className="flex items-center gap-1.5 text-[11px] text-muted"><t.icon className="h-3.5 w-3.5" />{t.label}</div>
              <div className="num mt-1 text-[18px] font-semibold">{t.value}</div>
            </div>
          ))}
        </div>

        {d.landing && (
          <div className="flex items-center gap-4 rounded-xl bg-white/[0.04] p-4 ring-1 ring-white/[0.07]">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/[0.06]"><PlaneLanding className={cx('h-5 w-5', TONE[d.landing.tone])} /></div>
            <div className="min-w-0 flex-1">
              <div className="text-[12px] text-muted">Touchdown</div>
              <div className="flex flex-wrap items-baseline gap-2"><span className="num text-[22px] font-semibold">{d.landing.fpm} fpm</span><span className={cx('text-[14px] font-semibold', TONE[d.landing.tone])}>{d.landing.label}</span></div>
              {d.landing.rank && <div className="text-[12px] text-muted">{d.landing.rank}</div>}
            </div>
          </div>
        )}

        {d.plan.length > 0 && (
          <section>
            <h3 className="mb-2 flex items-center gap-2 text-[13px] font-semibold"><ClipboardCheck className="h-4 w-4 text-ice" />Plan vs actual</h3>
            <div className="overflow-hidden rounded-xl ring-1 ring-white/[0.07]">
              {d.plan.map((p) => (
                <div key={p.label} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 border-b border-white/[0.05] px-3 py-2 text-[13px] last:border-0">
                  <span className="text-muted">{p.label}</span>
                  <span className="mono text-faint">{p.planned}</span>
                  <span className="mono">{p.actual}</span>
                  <span className={cx('mono w-20 text-right text-[12px]', TONE[p.tone])}>{p.diff}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {(d.firsts.length > 0 || d.records.length > 0) && (
          <section>
            <h3 className="mb-2 flex items-center gap-2 text-[13px] font-semibold"><Trophy className="h-4 w-4 text-warn" />Firsts & personal bests</h3>
            <div className="flex flex-wrap gap-2">
              {[...d.records, ...d.firsts].map((x, i) => (
                <div key={i} className="rounded-xl bg-white/[0.04] px-3 py-2 ring-1 ring-white/[0.07]">
                  <div className="text-[11px] text-muted">{x.label}</div>
                  <div className="text-[13px] font-medium">{x.detail}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        <section>
          <h3 className="mb-2 flex items-center gap-2 text-[13px] font-semibold"><CalendarRange className="h-4 w-4 text-ice" />{m.label} so far</h3>
          <p className="mb-3 text-[13px] text-muted">
            {m.flights} flight{m.flights === 1 ? '' : 's'} and {fmt.hours(m.minutes)} h this month.{' '}
            {m.lastMinutes > 0 ? <>That's <span className={delta >= 0 ? 'text-good' : 'text-warn'}>{fmt.hours(Math.abs(delta))} h {delta >= 0 ? 'more' : 'less'}</span> than {m.lastLabel}.</> : <>No flights logged in {m.lastLabel}.</>}
          </p>
          <div className="flex flex-col gap-2">
            {[[m.label, m.minutes, 'bg-gradient-to-r from-accent to-cyan-400'], [m.lastLabel, m.lastMinutes, 'bg-white/25'], ['Your monthly average', m.avgMinutes, 'bg-white/15']].map(([l, v, c]) => (
              <div key={l as string} className="grid grid-cols-[130px_1fr_56px] items-center gap-3 text-[12px]">
                <span className="truncate text-muted">{l}</span>
                <div className="h-2.5 overflow-hidden rounded-full bg-white/[0.05]"><div className={cx('h-full rounded-full', c as string)} style={{ width: `${Math.max(2, ((v as number) / maxM) * 100)}%` }} /></div>
                <span className="num text-right">{fmt.hours(v as number)} h</span>
              </div>
            ))}
          </div>
        </section>

        {d.goals.length > 0 && (
          <section>
            <h3 className="mb-2 flex items-center gap-2 text-[13px] font-semibold"><Target className="h-4 w-4 text-good" />Goals</h3>
            <div className="grid gap-2 sm:grid-cols-2">
              {d.goals.map((g) => (
                <div key={g.key} className="rounded-xl bg-white/[0.04] p-3 ring-1 ring-white/[0.07]">
                  <div className="flex justify-between text-[12px]"><span className="text-muted">{g.label}</span><span className="num">{g.unit === 'hours' ? g.value.toFixed(1) : g.value} / {g.target}</span></div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full rounded-full bg-good" style={{ width: `${Math.min(100, (g.value / g.target) * 100)}%` }} /></div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </Dialog>
  );
}
