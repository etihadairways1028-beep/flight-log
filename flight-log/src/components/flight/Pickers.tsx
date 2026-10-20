import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Check, MapPin, Plane, Plus, Search, X } from 'lucide-react';
import { cx } from '../ui';
import { searchAirports, loadExtendedAirports, extendedLoaded, countryName, onAirportsChange, toRef } from '../../lib/airports';
import { searchAircraftTypes, type AircraftType } from '../../lib/aircraftTypes';
import { searchAirlines, loadAirlines, type Airline } from '../../lib/airlines';
import type { AirportRef } from '../../lib/types';
import { zoneOffsetLabel } from '../../lib/time';

/** Generic accessible combobox list. */
function useListNav<T>(items: T[], onPick: (t: T) => void) {
  const [idx, setIdx] = useState(0);
  useEffect(() => setIdx(0), [items]);
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(items.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)); }
    else if (e.key === 'Enter' && items[idx]) { e.preventDefault(); onPick(items[idx]); }
  };
  return { idx, setIdx, onKeyDown };
}

export function AirportPicker({ value, onChange, label, id, invalid }: { value: AirportRef | null; onChange: (a: AirportRef | null) => void; label: string; id?: string; invalid?: boolean }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [, force] = useState(0);
  const [custom, setCustom] = useState(false);
  useEffect(() => onAirportsChange(() => force((n) => n + 1)) as any, []);
  const results = useMemo(() => searchAirports(q, 8), [q, extendedLoaded()]);
  const pick = (a: AirportRef) => { onChange(a); setOpen(false); setQ(''); };
  const nav = useListNav(results, (a) => pick(toRef(a)));
  const listId = useId();

  return (
    <Popover.Root open={open} onOpenChange={(v) => { setOpen(v); if (!v) setCustom(false); }}>
      <Popover.Trigger asChild>
        <button id={id} type="button" aria-label={label} className={cx('input flex h-auto min-h-[64px] items-center gap-3 py-2.5 text-left', invalid && 'ring-bad/60')}>
          {value ? (
            <>
              <span className="mono text-[22px] font-semibold tracking-tight text-fg">{value.iata || value.ident}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] text-fg">{value.name}</span>
                <span className="block truncate text-[11.5px] text-muted">{value.city ? `${value.city}, ` : ''}{countryName(value.country)} · <span className="mono">{value.ident}</span> · {zoneOffsetLabel(value.tz)}{value.source === 'custom' && ' · custom'}</span>
              </span>
              <span role="button" tabIndex={0} aria-label={`Clear ${label}`} className="btn-icon btn-ghost h-7 w-7" onClick={(e) => { e.stopPropagation(); onChange(null); }} onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onChange(null); } }}><X className="h-3.5 w-3.5" /></span>
            </>
          ) : (
            <span className="flex items-center gap-2 text-faint"><MapPin className="h-4 w-4" />Search airport, city or code</span>
          )}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="start" sideOffset={6} className="z-[75] w-[min(420px,calc(100vw-24px))] glass-strong rounded-xl2 p-2 shadow-lift animate-rise" onOpenAutoFocus={(e) => { e.preventDefault(); (document.getElementById(listId + '-q') as HTMLInputElement)?.focus(); }}>
          {custom ? <CustomAirportForm initial={q} onDone={(a) => { pick(a); setCustom(false); }} onCancel={() => setCustom(false)} /> : (
            <>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
                <input id={listId + '-q'} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={nav.onKeyDown} placeholder="AUH, OMAA, Abu Dhabi…" className="input pl-9" role="combobox" aria-expanded aria-controls={listId} aria-label={`Search ${label}`} />
              </div>
              <div id={listId} role="listbox" className="mt-1.5 max-h-72 overflow-y-auto">
                {q && results.length === 0 && <div className="px-3 py-4 text-[13px] text-muted">No airport matches "{q}".</div>}
                {!q && <div className="px-3 py-4 text-[12.5px] text-muted">Type an ICAO or IATA code, a city or an airport name.</div>}
                {results.map((a, i) => (
                  <button type="button" role="option" aria-selected={i === nav.idx} key={a.ident} onMouseMove={() => nav.setIdx(i)} onClick={() => pick(toRef(a))} className={cx('flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left', i === nav.idx && 'bg-white/[0.07]')}>
                    <span className="mono w-11 text-[15px] font-semibold text-ice">{a.iata || '—'}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px]">{a.name}</span>
                      <span className="block truncate text-[11.5px] text-muted">{a.city ? `${a.city}, ` : ''}{countryName(a.country)}</span>
                    </span>
                    <span className="mono text-[11.5px] text-faint">{a.ident}</span>
                  </button>
                ))}
              </div>
              <div className="mt-1 flex flex-wrap gap-1.5 border-t border-white/[0.07] pt-2">
                {!extendedLoaded() && <button type="button" className="btn-ghost btn-sm" onClick={() => loadExtendedAirports()}>Include small airfields</button>}
                <button type="button" className="btn-ghost btn-sm" onClick={() => setCustom(true)}><Plus className="h-3.5 w-3.5" />Custom airport</button>
              </div>
            </>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function CustomAirportForm({ initial, onDone, onCancel }: { initial: string; onDone: (a: AirportRef) => void; onCancel: () => void }) {
  const [v, setV] = useState({ ident: initial.toUpperCase().slice(0, 7), name: '', city: '', country: '', lat: '', lon: '', tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' });
  const lat = v.lat === '' ? null : Number(v.lat), lon = v.lon === '' ? null : Number(v.lon);
  const coordsOk = (lat == null && lon == null) || (lat != null && lon != null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180);
  const ok = v.ident.trim().length >= 2 && v.name.trim() && coordsOk;
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value });
  return (
    <div className="p-1.5">
      <div className="mb-2 text-[13px] font-semibold">Custom airport</div>
      <p className="mb-3 text-[12px] text-muted">For strips and sim-only fields that aren't in the dataset. Marked as user-entered. Add coordinates to show it on the map and compute distances.</p>
      <div className="grid grid-cols-2 gap-2">
        <input className="input-mono" placeholder="Ident" value={v.ident} onChange={set('ident')} aria-label="Identifier" />
        <input className="input" placeholder="Country code (AE)" value={v.country} onChange={set('country')} maxLength={2} aria-label="Country code" />
        <input className="input col-span-2" placeholder="Airport name" value={v.name} onChange={set('name')} aria-label="Airport name" />
        <input className="input" placeholder="City" value={v.city} onChange={set('city')} aria-label="City" />
        <input className="input" placeholder="Time zone (IANA)" value={v.tz} onChange={set('tz')} aria-label="Time zone" />
        <input className="input-mono" placeholder="Latitude" value={v.lat} onChange={set('lat')} inputMode="decimal" aria-label="Latitude" />
        <input className="input-mono" placeholder="Longitude" value={v.lon} onChange={set('lon')} inputMode="decimal" aria-label="Longitude" />
      </div>
      {!coordsOk && <p className="mt-2 text-[12px] text-bad">Latitude must be −90…90 and longitude −180…180.</p>}
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" className="btn-ghost btn-sm" onClick={onCancel}>Back</button>
        <button type="button" className="btn-primary btn-sm" disabled={!ok} onClick={() => onDone({ ident: v.ident.trim().toUpperCase(), iata: '', name: v.name.trim(), city: v.city.trim(), country: v.country.trim().toUpperCase(), continent: '', lat, lon, tz: v.tz.trim() || 'UTC', source: 'custom' })}>
          <Check className="h-3.5 w-3.5" />Use airport
        </button>
      </div>
    </div>
  );
}

export function AircraftTypePicker({ value, onPick, id }: { value: string; onPick: (t: AircraftType | null, raw: string) => void; id?: string }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState(value);
  useEffect(() => setQ(value), [value]);
  const results = useMemo(() => searchAircraftTypes(q === value ? '' : q, 10), [q, value]);
  const nav = useListNav(results, (t) => { onPick(t, t.code); setOpen(false); });
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Anchor asChild>
        <div className="relative">
          <Plane className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <input
            id={id}
            value={q}
            onChange={(e) => { setQ(e.target.value.toUpperCase()); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onBlur={() => { if (q !== value) onPick(null, q.trim()); }}
            onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); nav.onKeyDown(e); }}
            placeholder="A359, B789, C172…"
            className="input-mono pl-9"
            role="combobox"
            aria-expanded={open}
            aria-autocomplete="list"
          />
        </div>
      </Popover.Anchor>
      <Popover.Portal>
        <Popover.Content align="start" sideOffset={6} onOpenAutoFocus={(e) => e.preventDefault()} onInteractOutside={(e) => { if ((e.target as HTMLElement)?.id === id) e.preventDefault(); }} className="z-[75] w-[min(360px,calc(100vw-24px))] glass-strong rounded-xl2 p-1.5 shadow-lift">
          <div role="listbox" className="max-h-64 overflow-y-auto">
            {results.map((t, i) => (
              <button type="button" role="option" aria-selected={i === nav.idx} key={t.code} onMouseDown={(e) => e.preventDefault()} onMouseMove={() => nav.setIdx(i)} onClick={() => { onPick(t, t.code); setOpen(false); }} className={cx('flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left', i === nav.idx && 'bg-white/[0.07]')}>
                <span className="mono w-12 text-[13px] font-semibold text-ice">{t.code}</span>
                <span className="min-w-0 flex-1 truncate text-[13px]">{t.manufacturer} {t.model}</span>
                <span className="text-[11px] text-faint">{t.body}</span>
              </button>
            ))}
            {results.length === 0 && <div className="px-3 py-3 text-[12.5px] text-muted">Not in the built-in list. "{q}" will be saved as typed — fill in manufacturer and model below.</div>}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function AirlineInput({ value, onChange, onPickAirline, id, suggestions = [] }: { value: string; onChange: (v: string) => void; onPickAirline?: (a: Airline) => void; id?: string; suggestions?: string[] }) {
  const [open, setOpen] = useState(false);
  useEffect(() => { loadAirlines(); }, []);
  const res = useMemo(() => {
    const own = suggestions.filter((s) => s.toLowerCase().includes(value.toLowerCase()) && s !== value).slice(0, 3).map((name) => ({ icao: '', iata: '', name, callsign: '', country: 'Your log' }));
    return [...own, ...searchAirlines(value, 6)];
  }, [value, suggestions]);
  const nav = useListNav(res, (a) => { onChange(a.name); onPickAirline?.(a); setOpen(false); });
  const ref = useRef<HTMLInputElement>(null);
  return (
    <Popover.Root open={open && res.length > 0} onOpenChange={setOpen}>
      <Popover.Anchor asChild>
        <input ref={ref} id={id} value={value} onChange={(e) => { onChange(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); nav.onKeyDown(e); }} className="input" placeholder="Airline or operator" autoComplete="off" role="combobox" aria-expanded={open} />
      </Popover.Anchor>
      <Popover.Portal>
        <Popover.Content align="start" sideOffset={6} onOpenAutoFocus={(e) => e.preventDefault()} onInteractOutside={(e) => { if (e.target === ref.current) e.preventDefault(); }} className="z-[75] w-[min(340px,calc(100vw-24px))] glass-strong rounded-xl2 p-1.5 shadow-lift">
          {res.map((a, i) => (
            <button type="button" key={a.name + i} onMouseDown={(e) => e.preventDefault()} onMouseMove={() => nav.setIdx(i)} onClick={() => { onChange(a.name); onPickAirline?.(a); setOpen(false); }} className={cx('flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left', i === nav.idx && 'bg-white/[0.07]')}>
              <span className="mono w-9 text-[12px] text-ice">{a.icao || '·'}</span>
              <span className="min-w-0 flex-1 truncate text-[13px]">{a.name}</span>
              <span className="truncate text-[11px] text-faint">{a.country}</span>
            </button>
          ))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
