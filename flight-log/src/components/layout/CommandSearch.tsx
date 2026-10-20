import { useEffect, useMemo, useRef, useState } from 'react';
import * as RDialog from '@radix-ui/react-dialog';
import { useNavigate } from 'react-router-dom';
import { Search, Plane, TowerControl, NotebookTabs, CornerDownLeft, Plus } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { flightHaystack } from '../../lib/filters';
import { searchAirports, code } from '../../lib/airports';
import { aircraftLabel, typeKey } from '../../lib/flight';
import { sortByDateDesc } from '../../lib/stats';
import { NAV } from './nav';
import { cx } from '../ui';
import { useFmt } from '../../lib/useFmt';

interface Item { id: string; group: string; title: string; sub?: string; icon: any; run: () => void; mono?: string }

export function CommandSearch({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const flights = useStore((s) => s.data.flights);
  const openForm = useStore((s) => s.openForm);
  const nav = useNavigate();
  const fmt = useFmt();
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (open) { setQ(''); setIdx(0); } }, [open]);

  const items = useMemo<Item[]>(() => {
    const go = (to: string) => () => { nav(to); onOpenChange(false); };
    const s = q.trim().toLowerCase();
    const out: Item[] = [];
    if (!s) {
      out.push({ id: 'new', group: 'Actions', title: 'Log a new flight', icon: Plus, run: () => { onOpenChange(false); openForm(); }, mono: 'N' });
      NAV.forEach((n) => out.push({ id: n.to, group: 'Go to', title: n.label, icon: n.icon, run: go(n.to) }));
      sortByDateDesc(flights).slice(0, 4).forEach((f) => out.push({ id: f.id, group: 'Recent flights', title: `${code(f.dep)} → ${code(f.arr)}`, sub: `${fmt.date(f.date)} · ${f.flightNumber || f.callsign || aircraftLabel(f)}`, icon: NotebookTabs, run: go(`/flights/${f.id}`) }));
      return out;
    }
    const words = s.split(/\s+/);
    sortByDateDesc(flights).filter((f) => { const h = flightHaystack(f); return words.every((w) => h.includes(w)); }).slice(0, 6)
      .forEach((f) => out.push({ id: f.id, group: 'Flights', title: `${code(f.dep)} → ${code(f.arr)}${f.flightNumber ? ` · ${f.flightNumber}` : ''}`, sub: `${fmt.date(f.date)} · ${aircraftLabel(f)}`, icon: NotebookTabs, run: go(`/flights/${f.id}`) }));
    const types = new Map<string, string>();
    flights.forEach((f) => { const k = typeKey(f); if (k !== 'UNKNOWN' && `${k} ${aircraftLabel(f)} ${f.aircraft.registration}`.toLowerCase().includes(s)) types.set(k, aircraftLabel(f)); });
    [...types].slice(0, 4).forEach(([k, label]) => out.push({ id: 'ac' + k, group: 'Aircraft', title: label, mono: k, icon: Plane, run: go(`/aircraft/${encodeURIComponent(k)}`) }));
    searchAirports(s, 5).forEach((a) => out.push({ id: 'ap' + a.ident, group: 'Airports', title: a.name, sub: `${a.city}`, mono: a.iata || a.ident, icon: TowerControl, run: go(`/airports/${a.ident}`) }));
    NAV.filter((n) => n.label.toLowerCase().includes(s)).forEach((n) => out.push({ id: n.to, group: 'Go to', title: n.label, icon: n.icon, run: go(n.to) }));
    return out;
  }, [q, flights, nav, onOpenChange, openForm, fmt]);

  useEffect(() => { setIdx(0); }, [q]);
  useEffect(() => { listRef.current?.querySelector(`[data-idx="${idx}"]`)?.scrollIntoView({ block: 'nearest' }); }, [idx]);

  let lastGroup = '';
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <RDialog.Portal>
        <RDialog.Overlay className="fixed inset-0 z-[60] bg-[#020611]/70 backdrop-blur-sm" />
        <RDialog.Content className="fixed left-1/2 top-[10vh] z-[61] w-[calc(100vw-24px)] max-w-xl -translate-x-1/2 glass-strong rounded-xl3 shadow-lift animate-rise focus:outline-none">
          <RDialog.Title className="sr-only">Search Flight Log</RDialog.Title>
          <RDialog.Description className="sr-only">Search flights, airports, aircraft and pages</RDialog.Description>
          <div className="flex items-center gap-3 border-b border-white/[0.07] px-4">
            <Search className="h-4 w-4 text-muted" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(items.length - 1, i + 1)); }
                if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)); }
                if (e.key === 'Enter') { e.preventDefault(); items[idx]?.run(); }
              }}
              placeholder="Search flights, airports (DXB, Heathrow), aircraft (A359)…"
              className="h-14 flex-1 bg-transparent text-[15px] outline-none placeholder:text-faint"
              aria-label="Search"
              role="combobox"
              aria-expanded="true"
              aria-controls="cmd-list"
              aria-activedescendant={items[idx] ? `cmd-${idx}` : undefined}
            />
            <kbd className="rounded-md bg-white/[0.06] px-1.5 py-0.5 font-mono text-[11px] text-faint ring-1 ring-white/10">esc</kbd>
          </div>
          <div ref={listRef} id="cmd-list" role="listbox" className="max-h-[60vh] overflow-y-auto p-2">
            {items.length === 0 && <div className="px-3 py-10 text-center text-sm text-muted">No matches for "{q}".</div>}
            {items.map((it, i) => {
              const header = it.group !== lastGroup ? (lastGroup = it.group) : null;
              return (
                <div key={it.id + i}>
                  {header && <div className="label px-3 pb-1 pt-3">{header}</div>}
                  <button
                    id={`cmd-${i}`}
                    data-idx={i}
                    role="option"
                    aria-selected={i === idx}
                    onMouseMove={() => setIdx(i)}
                    onClick={it.run}
                    className={cx('flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left', i === idx && 'bg-white/[0.07]')}
                  >
                    <it.icon className="h-4 w-4 shrink-0 text-muted" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px]">{it.title}</span>
                      {it.sub && <span className="block truncate text-[12px] text-muted">{it.sub}</span>}
                    </span>
                    {it.mono && <span className="mono text-[12px] text-ice">{it.mono}</span>}
                    {i === idx && <CornerDownLeft className="h-3.5 w-3.5 text-faint" />}
                  </button>
                </div>
              );
            })}
          </div>
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}
