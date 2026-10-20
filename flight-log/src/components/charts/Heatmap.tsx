import { useMemo, useState } from 'react';
import { DateTime } from 'luxon';
import type { Flight } from '../../lib/types';
import { dailyCounts } from '../../lib/stats';
import { cx } from '../ui';
import { useFmt } from '../../lib/useFmt';

/** GitHub-style yearly activity grid; weeks start Monday. */
export function YearHeatmap({ flights, year, onSelect, selected, dateOf }: { flights: Flight[]; year: number; onSelect?: (date: string) => void; selected?: string | null; dateOf?: (f: Flight) => string }) {
  const fmt = useFmt();
  const counts = useMemo(() => dailyCounts(flights, dateOf), [flights, dateOf]);
  const [hover, setHover] = useState<string | null>(null);
  const start = DateTime.fromObject({ year, month: 1, day: 1 });
  const gridStart = start.minus({ days: start.weekday - 1 });
  const end = DateTime.fromObject({ year, month: 12, day: 31 });
  const weeks: DateTime[][] = [];
  let d = gridStart;
  while (d <= end) {
    const w: DateTime[] = [];
    for (let i = 0; i < 7; i++) { w.push(d); d = d.plus({ days: 1 }); }
    weeks.push(w);
  }
  const max = Math.max(1, ...[...counts.entries()].filter(([k]) => k.startsWith(String(year))).map(([, v]) => v.flights));
  const level = (n: number) => (n === 0 ? 0 : Math.min(4, Math.ceil((n / max) * 4)));
  const colors = ['rgb(255 255 255 / .045)', 'rgb(59 130 246 / .35)', 'rgb(59 130 246 / .6)', 'rgb(110 170 255 / .85)', 'rgb(169 212 255 / 1)'];
  const cell = 13, gap = 3;
  const total = [...counts.entries()].filter(([k]) => k.startsWith(String(year))).reduce((a, [, v]) => a + v.flights, 0);
  const active = [...counts.keys()].filter((k) => k.startsWith(String(year))).length;
  const hv = hover ? counts.get(hover) : null;

  return (
    <div>
      <div className="overflow-x-auto pb-2">
        <svg width={weeks.length * (cell + gap) + 28} height={7 * (cell + gap) + 22} role="grid" aria-label={`Flight activity in ${year}`} className="block">
          {weeks.map((w, wi) => {
            const first = w.find((x) => x.day === 1 && x.year === year);
            return first ? <text key={'m' + wi} x={28 + wi * (cell + gap)} y={10} fontSize={10} fill="rgb(148 163 189)">{first.toFormat('LLL')}</text> : null;
          })}
          {['Mon', 'Wed', 'Fri'].map((l, i) => <text key={l} x={0} y={22 + (i * 2) * (cell + gap) + 10} fontSize={9.5} fill="rgb(98 114 143)">{l}</text>)}
          {weeks.map((w, wi) => w.map((day, di) => {
            if (day.year !== year) return null;
            const iso = day.toISODate()!;
            const v = counts.get(iso);
            const n = v?.flights ?? 0;
            return (
              <rect
                key={iso}
                x={28 + wi * (cell + gap)}
                y={16 + di * (cell + gap)}
                width={cell}
                height={cell}
                rx={3}
                fill={colors[level(n)]}
                stroke={selected === iso ? '#fff' : hover === iso ? 'rgb(255 255 255 / .5)' : 'none'}
                strokeWidth={1.5}
                className={cx(onSelect && 'cursor-pointer')}
                onMouseEnter={() => setHover(iso)}
                onMouseLeave={() => setHover(null)}
                onClick={() => onSelect?.(iso)}
                role="gridcell"
                aria-label={`${day.toFormat('d LLL yyyy')}: ${n} flight${n === 1 ? '' : 's'}`}
                tabIndex={n > 0 ? 0 : -1}
                onKeyDown={(e) => { if (e.key === 'Enter') onSelect?.(iso); }}
              />
            );
          }))}
        </svg>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3 text-[12px] text-muted">
        <span className="min-h-[18px]">{hover ? <><span className="text-fg">{DateTime.fromISO(hover).toFormat('cccc d LLLL')}</span> · {hv ? `${hv.flights} flight${hv.flights === 1 ? '' : 's'} · ${fmt.dur(hv.minutes)}` : 'No flights'}</> : <><span className="num text-fg">{total}</span> flights on <span className="num text-fg">{active}</span> days in {year}</>}</span>
        <span className="flex items-center gap-1.5">Less{colors.map((c) => <span key={c} className="h-3 w-3 rounded-[3px]" style={{ background: c }} />)}More</span>
      </div>
    </div>
  );
}
