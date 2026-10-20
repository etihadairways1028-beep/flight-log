import { Link } from 'react-router-dom';
import type { Flight } from '../../lib/types';
import { code } from '../../lib/airports';
import { aircraftShort, missingFields } from '../../lib/flight';
import { useFmt } from '../../lib/useFmt';
import { CategoryBadge, PlaneGlyph, StatusBadge, cx } from '../ui';
import { AlertTriangle } from 'lucide-react';

/** Big-code route bar, as on a boarding pass. */
export function RouteBar({ f, size = 'md', showTimes = true }: { f: Flight; size?: 'sm' | 'md' | 'lg'; showTimes?: boolean }) {
  const fmt = useFmt();
  const big = { sm: 'text-[22px]', md: 'text-[30px]', lg: 'text-[44px] md:text-[56px]' }[size];
  const depT = f.times.offBlock ?? f.times.takeoff ?? f.times.schedOut;
  const arrT = f.times.onBlock ?? f.times.landing ?? f.times.schedIn;
  return (
    <div className="flex items-center gap-3 md:gap-5">
      <div className="min-w-0">
        <div className="truncate text-[11.5px] text-muted">{f.dep?.city || f.dep?.name || 'Unknown'}</div>
        <div className={cx('mono font-semibold leading-none tracking-tight', big)}>{code(f.dep)}</div>
        {showTimes && depT && f.dep && <div className="mono mt-1.5 text-[11.5px] text-faint">{fmt.timeAt(depT, f.dep.tz)} <span className="text-faint/70">{fmt.zone(f.dep.tz, depT)}</span></div>}
      </div>
      <div className="relative flex-1 min-w-[48px]">
        <div className="h-[1.5px] w-full rounded-full bg-gradient-to-r from-accent/80 via-ice/70 to-white/10" />
        <PlaneGlyph className="absolute left-[62%] top-1/2 h-4 w-4 -translate-y-1/2 text-white drop-shadow-[0_0_8px_rgb(169_212_255/.7)]" />
        <div className="absolute left-0 right-0 top-3 text-center text-[11px] text-muted num whitespace-nowrap">
          {[f.distanceKm != null ? fmt.dist(f.distanceKm) : null, f.flightMinutes != null ? fmt.dur(f.flightMinutes) : f.blockMinutes != null ? `${fmt.dur(f.blockMinutes)} blk` : null].filter(Boolean).join(' · ')}
        </div>
      </div>
      <div className="min-w-0 text-right">
        <div className="truncate text-[11.5px] text-muted">{f.arr?.city || f.arr?.name || 'Unknown'}</div>
        <div className={cx('mono font-semibold leading-none tracking-tight', big)}>{code(f.arr)}</div>
        {showTimes && arrT && f.arr && <div className="mono mt-1.5 text-[11.5px] text-faint">{fmt.timeAt(arrT, f.arr.tz)} <span className="text-faint/70">{fmt.zone(f.arr.tz, arrT)}</span></div>}
      </div>
    </div>
  );
}

/** Compact flight card used in lists (mobile logbook, recent flights). */
export function FlightCard({ f, className }: { f: Flight; className?: string }) {
  const fmt = useFmt();
  const missing = missingFields(f);
  return (
    <Link to={`/flights/${f.id}`} className={cx('block min-w-0 glass glass-hover rounded-xl2 p-4 focus-visible:ring-2 focus-visible:ring-ice/60', className)}>
      <div className="mb-3 flex items-center gap-2">
        <span className="mono text-[13px] font-medium text-ice">{f.flightNumber || f.callsign || '—'}</span>
        <span className="truncate text-[12px] text-muted">{f.airline}</span>
        <span className="ml-auto flex items-center gap-1.5">
          {f.status !== 'completed' && <StatusBadge s={f.status} />}
          {f.category !== 'real' && <CategoryBadge c={f.category} />}
        </span>
      </div>
      <RouteBar f={f} size="sm" showTimes={false} />
      <div className="mt-7 flex items-center gap-2 text-[11.5px] text-muted">
        <span className="num">{fmt.date(f.date)}</span>
        <span className="text-faint">·</span>
        <span className="truncate">{aircraftShort(f)}</span>
        {f.aircraft.registration && <span className="mono ml-auto rounded-md bg-white/[0.05] px-1.5 py-0.5 text-[10.5px] ring-1 ring-white/10">{fmt.reg(f)}</span>}
        {missing.length > 0 && f.status !== 'planned' && <AlertTriangle className="h-3.5 w-3.5 text-warn" aria-label={`Missing ${missing.join(', ')}`} />}
      </div>
    </Link>
  );
}
