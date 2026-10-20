import { useMemo } from 'react';
import { ShieldCheck, ShieldAlert } from 'lucide-react';
import type { Flight } from '../../lib/types';
import { computeRecency } from '../../lib/pilot';
import { useFmt } from '../../lib/useFmt';
import { Glass, cx } from '../ui';

export function RecencyCards({ flights, compact }: { flights: Flight[]; compact?: boolean }) {
  const fmt = useFmt();
  const rec = useMemo(() => computeRecency(flights), [flights]);
  const any = flights.some((f) => (f.landingsDay ?? 0) + (f.landingsNight ?? 0) + (f.takeoffsDay ?? 0) + (f.takeoffsNight ?? 0) > 0);
  return (
    <div className={cx('grid gap-3', compact ? 'sm:grid-cols-2' : 'md:grid-cols-2')}>
      {rec.map((r) => {
        const tone = !any ? 'idle' : r.met ? (r.daysLeft! <= 14 ? 'warn' : 'good') : 'bad';
        return (
          <Glass key={r.label} className="p-4">
            <div className="flex items-start gap-3">
              <div className={cx('grid h-10 w-10 shrink-0 place-items-center rounded-xl ring-1', tone === 'good' ? 'bg-good/15 text-good ring-good/30' : tone === 'warn' ? 'bg-warn/15 text-warn ring-warn/30' : tone === 'bad' ? 'bg-bad/15 text-bad ring-bad/30' : 'bg-white/5 text-faint ring-white/10')}>{tone === 'good' || tone === 'warn' ? <ShieldCheck className="h-5 w-5" /> : <ShieldAlert className="h-5 w-5" />}</div>
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] font-semibold">{r.label}</div>
                <div className="text-[11.5px] text-muted">{r.rule}</div>
              </div>
              <div className="text-right">
                {!any ? <span className="text-[12px] text-faint">No landings logged</span> : r.met ? <><div className="mono text-[20px] font-semibold">{r.daysLeft}</div><div className="text-[11px] text-muted">days left</div></> : <span className="chip text-bad ring-bad/30">Not current</span>}
              </div>
            </div>
            {any && <div className="mt-3 text-[11.5px] text-faint">{r.validUntil ? `Valid until ${fmt.date(r.validUntil)} · ` : ''}{r.count} landing{r.count === 1 ? '' : 's'} in the last 90 days</div>}
          </Glass>
        );
      })}
    </div>
  );
}

