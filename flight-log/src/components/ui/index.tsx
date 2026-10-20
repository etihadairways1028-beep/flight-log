import React, { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import * as RDialog from '@radix-ui/react-dialog';
import * as RTooltip from '@radix-ui/react-tooltip';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { X, Info, Star } from 'lucide-react';
import type { Photo } from '../../lib/images';
import { photoSrcSet, photoUrl } from '../../lib/images';
import type { FlightCategory, FlightStatus } from '../../lib/types';
import { CATEGORY_LABEL, STATUS_LABEL } from '../../lib/types';
import { useStore } from '../../store/useStore';

export const cx = clsx;

// ── Surfaces ────────────────────────────────────────────────────────────────
export function Glass({ className, hover, strong, as: As = 'div', ...p }: React.HTMLAttributes<HTMLElement> & { hover?: boolean; strong?: boolean; as?: any }) {
  return <As className={cx(strong ? 'glass-strong' : 'glass', hover && 'glass-hover', className)} {...p} />;
}

export function SectionTitle({ eyebrow, title, action, className }: { eyebrow?: string; title: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cx('flex items-end justify-between gap-3', className)}>
      <div className="min-w-0">
        {eyebrow && <div className="label mb-1">{eyebrow}</div>}
        <h2 className="text-[15px] font-semibold tracking-tight text-fg">{title}</h2>
      </div>
      {action}
    </div>
  );
}

export function PageHeader({ eyebrow, title, sub, actions }: { eyebrow?: string; title: React.ReactNode; sub?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="label mb-2 text-ice/80">{eyebrow}</div>}
        <h1 className="text-[28px] leading-[1.1] md:text-[34px] font-semibold tracking-[-0.025em] text-balance">{title}</h1>
        {sub && <p className="mt-2 max-w-2xl text-sm text-muted leading-relaxed">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

// ── Aircraft glyph (custom, top-down) ───────────────────────────────────────
export function PlaneGlyph({ className, rotate = 90 }: { className?: string; rotate?: number }) {
  return (
    <svg viewBox="0 0 24 24" className={className} style={{ transform: `rotate(${rotate}deg)` }} aria-hidden="true">
      <path fill="currentColor" d="M12 1.6c.7 0 1.2.9 1.2 2.2v5.3l8 4.6c.4.2.6.6.6 1v1.1c0 .3-.3.5-.6.4l-8-2.5v4.6l2.3 1.7c.2.2.3.4.3.6v.9c0 .3-.3.5-.6.4L12 21l-3.2.9c-.3.1-.6-.1-.6-.4v-.9c0-.2.1-.5.3-.6l2.3-1.7v-4.6l-8 2.5c-.3.1-.6-.1-.6-.4v-1.1c0-.4.2-.8.6-1l8-4.6V3.8c0-1.3.5-2.2 1.2-2.2Z" />
    </svg>
  );
}

// ── Photography with graceful fallback ─────────────────────────────────────
export function Photo({ photo, src, alt, className, imgClassName, sizes = '(max-width: 768px) 100vw, 60vw', overlay = true, priority, children }: {
  photo?: Photo; src?: string; alt?: string; className?: string; imgClassName?: string; sizes?: string; overlay?: boolean; priority?: boolean; children?: React.ReactNode;
}) {
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');
  const showPhotos = useStore((s) => s.settings.showPhotos);
  const ref = useRef<HTMLImageElement>(null);
  useEffect(() => {
    setState('loading');
    if (ref.current?.complete && ref.current.naturalWidth > 0) setState('ok');
  }, [photo?.id, src]);
  const url = src ?? (photo && showPhotos ? photoUrl(photo, 1200) : undefined);
  return (
    <div className={cx('relative overflow-hidden bg-deep', className)} data-photo={photo?.id}>
      {/* fallback art: dusk gradient + horizon + glyph — always present underneath */}
      <div className="absolute inset-0" aria-hidden="true" style={{ background: 'radial-gradient(120% 80% at 70% 0%, rgb(59 130 246 / .35), transparent 60%), linear-gradient(180deg, rgb(20 36 72), rgb(8 14 30))' }}>
        <div className="absolute inset-x-0 bottom-[34%] h-px bg-gradient-to-r from-transparent via-ice/30 to-transparent" />
        <PlaneGlyph rotate={60} className={cx('absolute right-[18%] top-[26%] h-10 w-10 text-white/15 transition-opacity', state === 'ok' && 'opacity-0')} />
      </div>
      {url && state !== 'error' && (
        <img
          ref={ref}
          src={url}
          srcSet={photo && !src ? photoSrcSet(photo) : undefined}
          sizes={sizes}
          alt={alt ?? photo?.alt ?? ''}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          onLoad={() => setState('ok')}
          onError={() => setState('error')}
          style={{ objectPosition: photo?.pos }}
          className={cx('absolute inset-0 h-full w-full object-cover transition-[opacity,transform] duration-700', state === 'ok' ? 'opacity-100 scale-100' : 'opacity-0 scale-[1.03]', imgClassName)}
        />
      )}
      {overlay && <div className="absolute inset-0 bg-gradient-to-t from-ink/90 via-ink/30 to-transparent" aria-hidden="true" />}
      {children && <div className="relative h-full">{children}</div>}
    </div>
  );
}

// ── Numbers ────────────────────────────────────────────────────────────────
export function AnimatedNumber({ value, format = (n) => Math.round(n).toLocaleString('en-GB'), className }: { value: number; format?: (n: number) => string; className?: string }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    if (reduce || !Number.isFinite(value)) { setShown(value); from.current = value; return; }
    const start = performance.now(), a = from.current, b = value, dur = 650;
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      setShown(a + (b - a) * e);
      if (k < 1) raf = requestAnimationFrame(tick); else from.current = b;
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); from.current = b; };
  }, [value, reduce]);
  return <span className={cx('num', className)}>{Number.isFinite(shown) ? format(shown) : '—'}</span>;
}

// ── Feedback ───────────────────────────────────────────────────────────────
export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('skeleton', className)} />;
}

export function EmptyState({ icon, title, body, action, className, photo }: { icon?: React.ReactNode; title: string; body?: React.ReactNode; action?: React.ReactNode; className?: string; photo?: Photo }) {
  return (
    <Glass className={cx('overflow-hidden', className)}>
      {photo && <Photo photo={photo} className="h-36 rounded-t-xl2" />}
      <div className="flex flex-col items-center px-6 py-10 text-center">
        {icon && <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-accent/15 text-ice ring-1 ring-accent/30">{icon}</div>}
        <h3 className="text-base font-semibold">{title}</h3>
        {body && <div className="mt-1.5 max-w-md text-sm text-muted leading-relaxed">{body}</div>}
        {action && <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div>}
      </div>
    </Glass>
  );
}

const CAT_STYLE: Record<FlightCategory, string> = {
  real: 'text-ice bg-accent/15 ring-accent/30',
  simulator: 'text-live bg-live/10 ring-live/25',
  training: 'text-good bg-good/10 ring-good/25',
  ferry: 'text-muted bg-white/5 ring-white/10',
  private: 'text-[#c4b5fd] bg-[#8b5cf6]/10 ring-[#8b5cf6]/25',
  commercial: 'text-ice bg-accent/15 ring-accent/30',
  other: 'text-muted bg-white/5 ring-white/10',
};
export const CAT_COLOR: Record<FlightCategory, string> = {
  real: '#5b9bff', simulator: '#5ee0ef', training: '#34d399', ferry: '#94a3bd', private: '#a78bfa', commercial: '#a9d4ff', other: '#62728f',
};
export function CategoryBadge({ c, className }: { c: FlightCategory; className?: string }) {
  return <span className={cx('chip', CAT_STYLE[c], className)}>{c === 'simulator' && <span className="h-1.5 w-1.5 rounded-full bg-live" />}{CATEGORY_LABEL[c]}</span>;
}
const ST_STYLE: Record<FlightStatus, string> = {
  completed: 'text-good bg-good/10 ring-good/25',
  planned: 'text-ice bg-accent/10 ring-accent/25',
  cancelled: 'text-faint bg-white/5 ring-white/10 line-through',
  diverted: 'text-warn bg-warn/10 ring-warn/25',
  draft: 'text-warn bg-warn/10 ring-warn/25',
};
export function StatusBadge({ s, className }: { s: FlightStatus; className?: string }) {
  return <span className={cx('chip', ST_STYLE[s], className)}>{STATUS_LABEL[s]}</span>;
}

export function Stars({ value, onChange, size = 16 }: { value: number | null; onChange?: (v: number | null) => void; size?: number }) {
  return (
    <div className="flex items-center gap-0.5" role={onChange ? 'radiogroup' : undefined} aria-label="Rating">
      {[1, 2, 3, 4, 5].map((n) => {
        const on = (value ?? 0) >= n;
        const el = <Star width={size} height={size} className={on ? 'fill-warn text-warn' : 'text-faint'} />;
        return onChange ? (
          <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} star${n > 1 ? 's' : ''}`} className="rounded p-0.5 hover:scale-110 transition" onClick={() => onChange(value === n ? null : n)}>{el}</button>
        ) : <span key={n}>{el}</span>;
      })}
    </div>
  );
}

// ── Controls ───────────────────────────────────────────────────────────────
export function Segmented<T extends string>({ value, onChange, options, size = 'md', className, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: React.ReactNode }[]; size?: 'sm' | 'md'; className?: string; label?: string }) {
  return (
    <div role="tablist" aria-label={label} className={cx('inline-flex rounded-xl bg-deep/70 p-1 ring-1 ring-white/[0.07]', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          type="button"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx('relative rounded-lg font-medium transition-colors', size === 'sm' ? 'h-7 px-2.5 text-[12px]' : 'h-8 px-3.5 text-[13px]', value === o.value ? 'text-fg' : 'text-muted hover:text-fg')}
        >
          {value === o.value && <motion.span layoutId={`seg-${label ?? ''}`} className="absolute inset-0 rounded-lg bg-white/[0.1] ring-1 ring-white/[0.12]" transition={{ type: 'spring', bounce: 0.15, duration: 0.4 }} />}
          <span className="relative">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

export function Field({ label, help, error, children, className, htmlFor, tip }: { label: string; help?: React.ReactNode; error?: string | null; children: React.ReactNode; className?: string; htmlFor?: string; tip?: string }) {
  return (
    <div className={cx('min-w-0', className)}>
      <label htmlFor={htmlFor} className="mb-1.5 flex items-center gap-1.5 text-[12px] font-medium text-muted">
        {label}
        {tip && <Tip text={tip}><Info className="h-3.5 w-3.5 text-faint" /></Tip>}
      </label>
      {children}
      {error ? <p className="mt-1 text-[12px] text-bad">{error}</p> : help ? <p className="mt-1 text-[12px] text-faint">{help}</p> : null}
    </div>
  );
}

export function Tip({ text, children, side = 'top' }: { text: React.ReactNode; children: React.ReactNode; side?: 'top' | 'bottom' | 'left' | 'right' }) {
  return (
    <RTooltip.Root delayDuration={200}>
      <RTooltip.Trigger asChild>
        <span tabIndex={0} className="inline-flex cursor-help focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ice/60 rounded">{children}</span>
      </RTooltip.Trigger>
      <RTooltip.Portal>
        <RTooltip.Content side={side} sideOffset={6} className="z-[80] max-w-[280px] rounded-lg bg-[#0d1a33]/95 px-3 py-2 text-[12px] leading-relaxed text-fg shadow-lift ring-1 ring-white/10 backdrop-blur-xl animate-rise">
          {text}
          <RTooltip.Arrow className="fill-[#0d1a33]" />
        </RTooltip.Content>
      </RTooltip.Portal>
    </RTooltip.Root>
  );
}

export function Toggle({ checked, onChange, label, id }: { checked: boolean; onChange: (v: boolean) => void; label: string; id?: string }) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cx('relative h-6 w-11 shrink-0 rounded-full transition-colors ring-1', checked ? 'bg-accent ring-accent/60' : 'bg-white/10 ring-white/10')}
    >
      <span className={cx('absolute left-0 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-[22px]' : 'translate-x-0.5')} />
    </button>
  );
}

// ── Dialogs ────────────────────────────────────────────────────────────────
export function Dialog({ open, onOpenChange, title, description, children, size = 'md', footer, side }: {
  open: boolean; onOpenChange: (v: boolean) => void; title: React.ReactNode; description?: React.ReactNode; children: React.ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl'; footer?: React.ReactNode; side?: boolean;
}) {
  const w = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' }[size];
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <RDialog.Portal forceMount>
            <RDialog.Overlay asChild forceMount>
              <motion.div className="fixed inset-0 z-[60] bg-[#020611]/70 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
            </RDialog.Overlay>
            <RDialog.Content asChild forceMount aria-describedby={description ? undefined : undefined}>
              <motion.div
                className={cx(
                  'fixed z-[61] flex flex-col glass-strong shadow-lift focus:outline-none',
                  side
                    ? 'inset-y-0 right-0 w-full max-w-2xl rounded-none md:rounded-l-xl3'
                    : cx('left-1/2 top-1/2 w-[calc(100vw-24px)] max-h-[calc(100dvh-24px)] -translate-x-1/2 -translate-y-1/2 rounded-xl3', w),
                )}
                initial={side ? { x: 40, opacity: 0 } : { opacity: 0, scale: 0.97, y: '-48%', x: '-50%' }}
                animate={side ? { x: 0, opacity: 1 } : { opacity: 1, scale: 1, y: '-50%', x: '-50%' }}
                exit={side ? { x: 40, opacity: 0 } : { opacity: 0, scale: 0.98, y: '-49%', x: '-50%' }}
                transition={{ type: 'spring', bounce: 0.12, duration: 0.42 }}
                style={side ? { paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' } : undefined}
              >
                <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-3 md:px-6">
                  <div className="min-w-0">
                    <RDialog.Title className="text-lg font-semibold tracking-tight">{title}</RDialog.Title>
                    {description ? <RDialog.Description className="mt-1 text-sm text-muted">{description}</RDialog.Description> : <RDialog.Description className="sr-only">Dialog</RDialog.Description>}
                  </div>
                  <RDialog.Close className="btn-icon btn-ghost -mr-2 -mt-1" aria-label="Close"><X className="h-4 w-4" /></RDialog.Close>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 md:px-6">{children}</div>
                {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-white/[0.07] px-5 py-3.5 md:px-6">{footer}</div>}
              </motion.div>
            </RDialog.Content>
          </RDialog.Portal>
        )}
      </AnimatePresence>
    </RDialog.Root>
  );
}

export function ConfirmDialog({ open, onOpenChange, title, body, confirmLabel = 'Delete', onConfirm, danger = true }: {
  open: boolean; onOpenChange: (v: boolean) => void; title: string; body: React.ReactNode; confirmLabel?: string; onConfirm: () => void | Promise<void>; danger?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={title} size="sm" footer={
      <>
        <button className="btn-glass" onClick={() => onOpenChange(false)}>Cancel</button>
        <button className={danger ? 'btn-danger' : 'btn-primary'} disabled={busy} onClick={async () => { setBusy(true); try { await onConfirm(); onOpenChange(false); } finally { setBusy(false); } }}>{confirmLabel}</button>
      </>
    }>
      <div className="text-sm text-muted leading-relaxed">{body}</div>
    </Dialog>
  );
}

// ── Small data atoms ───────────────────────────────────────────────────────
export function KV({ k, v, mono, className }: { k: React.ReactNode; v: React.ReactNode; mono?: boolean; className?: string }) {
  return (
    <div className={cx('flex items-center justify-between gap-3 py-2.5', className)}>
      <span className="text-[13px] text-muted">{k}</span>
      <span className={cx('text-right text-[13px] text-fg', mono && 'mono')}>{v}</span>
    </div>
  );
}

export function Meter({ value, className, tone = 'accent' }: { value: number; className?: string; tone?: 'accent' | 'good' | 'warn' | 'live' }) {
  const color = { accent: 'from-accent to-ice', good: 'from-good/70 to-good', warn: 'from-warn/70 to-warn', live: 'from-live/60 to-live' }[tone];
  return (
    <div className={cx('h-1.5 overflow-hidden rounded-full bg-white/[0.07]', className)} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)}>
      <div className={cx('h-full rounded-full bg-gradient-to-r transition-[width] duration-700', color)} style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
    </div>
  );
}

/** Estimated / partial data marker. */
export function Partial({ known, total, what = 'flights' }: { known: number; total: number; what?: string }) {
  if (total === 0 || known === total) return null;
  return (
    <Tip text={`Based on ${known} of ${total} ${what} that have this value recorded. The rest are left out rather than estimated.`}>
      <span className="chip h-5 px-2 text-[10px] text-warn bg-warn/10 ring-warn/25">{known}/{total}</span>
    </Tip>
  );
}
