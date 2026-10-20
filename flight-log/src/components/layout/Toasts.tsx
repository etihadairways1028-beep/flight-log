import { useEffect } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { PlaneGlyph } from '../ui';

export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismissToast);
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-24 z-[90] flex flex-col items-center gap-2 px-3 md:bottom-6 md:items-end md:pr-6">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            className="pointer-events-auto flex w-full max-w-sm items-start gap-3 glass-strong rounded-xl2 p-3.5 shadow-lift"
            role={t.kind === 'error' ? 'alert' : 'status'}
          >
            {t.kind === 'success' ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-good" /> : t.kind === 'error' ? <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-bad" /> : <Info className="mt-0.5 h-5 w-5 shrink-0 text-ice" />}
            <div className="min-w-0 flex-1">
              <div className="text-[13.5px] font-medium">{t.title}</div>
              {t.body && <div className="mt-0.5 text-[12.5px] text-muted">{t.body}</div>}
            </div>
            {t.action && <button className="btn-sm btn-glass" onClick={() => { t.action!.run(); dismiss(t.id); }}>{t.action.label}</button>}
            <button className="btn-icon btn-ghost h-7 w-7 -mr-1" onClick={() => dismiss(t.id)} aria-label="Dismiss"><X className="h-3.5 w-3.5" /></button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

/** A brief, satisfying "flight logged" moment: a plane traces an arc and lands on a check. */
export function Celebration() {
  const c = useStore((s) => s.celebrate);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (!c) return;
    const t = setTimeout(() => useStore.setState({ celebrate: null }), reduce ? 1200 : 1900);
    return () => clearTimeout(t);
  }, [c, reduce]);
  return (
    <AnimatePresence>
      {c && (
        <motion.div key={c.id} className="pointer-events-none fixed inset-0 z-[95] grid place-items-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} aria-live="polite">
          <div className="absolute inset-0 bg-[#020611]/40 backdrop-blur-[2px]" />
          <motion.div className="relative glass-strong rounded-[28px] px-10 py-8 text-center shadow-lift" initial={{ scale: 0.92, y: 10 }} animate={{ scale: 1, y: 0 }} transition={{ type: 'spring', bounce: 0.25, duration: 0.5 }}>
            <svg viewBox="0 0 220 80" className="mx-auto h-20 w-56" aria-hidden="true">
              <motion.path d="M10 70 Q 110 -10 210 70" fill="none" stroke="rgb(169 212 255 / .5)" strokeWidth="2" strokeDasharray="4 6" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: reduce ? 0 : 1.0, ease: 'easeInOut' }} />
              <circle cx="10" cy="70" r="4" fill="rgb(59 130 246)" />
              <motion.circle cx="210" cy="70" r="4" fill="rgb(52 211 153)" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: reduce ? 0 : 1.0 }} />
            </svg>
            {!reduce && (
              <motion.div className="absolute left-1/2 top-8 text-white" style={{ offsetPath: 'path("M -100 62 Q 0 -18 100 62")', offsetRotate: 'auto' } as any} initial={{ offsetDistance: '0%' } as any} animate={{ offsetDistance: '100%' } as any} transition={{ duration: 1.0, ease: 'easeInOut' }}>
                <PlaneGlyph rotate={0} className="h-6 w-6 -translate-x-1/2 -translate-y-1/2 rotate-90" />
              </motion.div>
            )}
            <div className="mt-2 text-lg font-semibold">{c.title}</div>
            <div className="mono mt-1 text-ice">{c.sub}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
