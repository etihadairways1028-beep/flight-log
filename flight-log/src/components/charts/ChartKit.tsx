import React from 'react';
import { Glass, cx } from '../ui';

// Categorical palette tuned for midnight navy — blue-led, distinguishable, never neon.
export const SERIES = ['#5b9bff', '#5ee0ef', '#a9d4ff', '#34d399', '#f5b544', '#c4a7ff', '#f78fb3', '#8fa3c4'];
export const AXIS = { stroke: 'transparent', tick: { fill: 'rgb(148 163 189)', fontSize: 11 }, tickLine: false, axisLine: false } as const;

export function ChartCard({ title, eyebrow, action, children, className, footer, empty }: { title: React.ReactNode; eyebrow?: string; action?: React.ReactNode; children: React.ReactNode; className?: string; footer?: React.ReactNode; empty?: boolean }) {
  return (
    <Glass className={cx('flex min-w-0 flex-col p-4 md:p-5', className)}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          {eyebrow && <div className="label mb-1">{eyebrow}</div>}
          <h3 className="text-[14px] font-semibold tracking-tight">{title}</h3>
        </div>
        {action}
      </div>
      <div className="min-h-0 flex-1">
        {empty ? <div className="grid h-full min-h-[160px] place-items-center rounded-xl border border-dashed border-white/10 px-4 text-center text-[12.5px] text-muted">Not enough data yet. This fills in as you log flights.</div> : children}
      </div>
      {footer && <div className="mt-3 text-[11.5px] text-faint">{footer}</div>}
    </Glass>
  );
}

export function ChartTooltip({ active, payload, label, format, labelFormat }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl bg-[#0b1630]/95 px-3 py-2.5 text-[12px] shadow-lift ring-1 ring-white/10 backdrop-blur-xl">
      {label != null && <div className="mb-1.5 font-medium text-fg">{labelFormat ? labelFormat(label) : label}</div>}
      <div className="flex flex-col gap-1">
        {payload.map((p: any) => (
          <div key={p.dataKey ?? p.name} className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full" style={{ background: p.color ?? p.payload?.fill }} />
            <span className="text-muted">{p.name}</span>
            <span className="ml-auto pl-4 mono text-fg">{format ? format(p.value, p) : p.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Horizontal ranked bars — clearer than a pie for "top N" lists. */
export function RankBars({ rows, format, onClick, max }: { rows: { key: string; label: React.ReactNode; value: number; sub?: React.ReactNode }[]; format: (v: number) => string; onClick?: (key: string) => void; max?: number }) {
  const top = max ?? Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="flex flex-col gap-2.5">
      {rows.map((r, i) => {
        const El: any = onClick ? 'button' : 'div';
        return (
          <li key={r.key}>
            <El {...(onClick ? { type: 'button', onClick: () => onClick(r.key) } : {})} className={cx('group block w-full text-left', onClick && 'rounded-lg focus-visible:ring-2 focus-visible:ring-ice/60')}>
              <div className="mb-1 flex items-baseline justify-between gap-3 text-[12.5px]">
                <span className={cx('min-w-0 truncate', onClick && 'group-hover:text-ice transition-colors')}>{r.label}</span>
                <span className="mono shrink-0 text-muted">{format(r.value)}{r.sub && <span className="ml-1.5 text-faint">{r.sub}</span>}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${(r.value / top) * 100}%`, background: `linear-gradient(90deg, ${SERIES[0]}, ${i === 0 ? '#a9d4ff' : '#5b9bffaa'})` }} />
              </div>
            </El>
          </li>
        );
      })}
    </ul>
  );
}

export function Legend({ items }: { items: { label: string; color: string; value?: string }[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5 text-[12px] text-muted">
          <span className="h-2 w-2 rounded-full" style={{ background: i.color }} />{i.label}{i.value && <span className="mono text-fg">{i.value}</span>}
        </span>
      ))}
    </div>
  );
}
