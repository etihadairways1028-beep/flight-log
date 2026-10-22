import React from 'react';
import { Glass, cx } from '../ui';

// Categorical palette tuned for midnight navy — blue-led, distinguishable, never neon.
export const SERIES = ['#5b9bff', '#5ee0ef', '#a78bfa', '#34d399', '#f5b544', '#f78fb3', '#7dd3fc', '#fb923c'];
/** Shared chart gradients, mounted once by the app shell; use fill="url(#g-blue)" or "url(#ga-blue)" in any chart. */
export function GradDefs() {
  const g: [string, string, string][] = [['blue', '#7cb4ff', '#2f6bf0'], ['cyan', '#8ff0fa', '#1fb5c9'], ['violet', '#c4b5fd', '#7c5cf0'], ['green', '#6ee7b7', '#10b981'], ['amber', '#fcd34d', '#f59e0b'], ['pink', '#f9a8d4', '#ec4899']];
  return (
    <svg width="0" height="0" aria-hidden style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}><defs>
      {g.map(([n, a, b]) => <linearGradient key={n} id={`g-${n}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={a} /><stop offset="100%" stopColor={b} stopOpacity={0.85} /></linearGradient>)}
      {g.map(([n, a]) => <linearGradient key={'a' + n} id={`ga-${n}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={a} stopOpacity={0.42} /><stop offset="100%" stopColor={a} stopOpacity={0} /></linearGradient>)}
    </defs></svg>
  );
}
export const AXIS = { stroke: 'transparent', tick: { fill: 'rgb(148 163 189)', fontSize: 11 }, tickLine: false, axisLine: false } as const;

export function ChartCard({ title, eyebrow, action, children, className, footer, empty, hidden }: { title: React.ReactNode; eyebrow?: string; action?: React.ReactNode; children: React.ReactNode; className?: string; footer?: React.ReactNode; empty?: boolean; hidden?: boolean }) {
  if (hidden) return null;
  return (
    <Glass className={cx('flex min-w-0 flex-col p-4 md:p-5', className)}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          {eyebrow && <div className="label mb-1">{eyebrow}</div>}
          <h3 className="text-[15px] font-semibold tracking-tight">{title}</h3>
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
    <ul className="flex flex-col gap-3">
      {rows.map((r, i) => {
        const El: any = onClick ? 'button' : 'div';
        const col = SERIES[i % SERIES.length];
        return (
          <li key={r.key}>
            <El {...(onClick ? { type: 'button', onClick: () => onClick(r.key) } : {})} className={cx('group flex w-full items-center gap-3 text-left', onClick && 'rounded-lg focus-visible:ring-2 focus-visible:ring-ice/60')}>
              <span className="mono grid h-6 w-6 shrink-0 place-items-center rounded-lg text-[11px] font-semibold" style={{ background: `${col}22`, color: col, boxShadow: `inset 0 0 0 1px ${col}44` }}>{i + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="mb-1.5 flex items-baseline justify-between gap-3 text-[12.5px]">
                  <span className={cx('min-w-0 truncate', onClick && 'group-hover:text-ice transition-colors')}>{r.label}</span>
                  <span className="mono shrink-0 text-fg/90">{format(r.value)}{r.sub && <span className="ml-1.5 text-faint">{r.sub}</span>}</span>
                </span>
                <span className="block h-2 overflow-hidden rounded-full bg-white/[0.06]">
                  <span className="block h-full rounded-full transition-[width] duration-700" style={{ width: `${Math.max(3, (r.value / top) * 100)}%`, background: `linear-gradient(90deg, ${col}66, ${col})`, boxShadow: `0 0 12px ${col}55` }} />
                </span>
              </span>
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
