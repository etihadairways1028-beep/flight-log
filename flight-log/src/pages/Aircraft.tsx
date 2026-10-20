import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Plus, Plane, ImagePlus } from 'lucide-react';
import { useStore } from '../store/useStore';
import { useFmt } from '../lib/useFmt';
import { aircraftLabel, typeKey, isCounted, uid } from '../lib/flight';
import { aircraftType } from '../lib/aircraftTypes';
import { groupBy } from '../lib/stats';
import { photoForBody, hashStr } from '../lib/images';
import { Dialog, EmptyState, Field, PageHeader, Photo, Segmented } from '../components/ui';
import { AircraftTypePicker } from '../components/flight/Pickers';
import type { CustomAircraft } from '../lib/types';

export default function Aircraft() {
  const flights = useStore((s) => s.data.flights);
  const custom = useStore((s) => s.data.customAircraft);
  const fmt = useFmt();
  const [view, setView] = useState<'types' | 'regs'>('types');
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<CustomAircraft | null>(null);
  const counted = useMemo(() => flights.filter(isCounted), [flights]);

  const types = useMemo(() => groupBy(counted, typeKey, aircraftLabel).filter((g) => g.key !== 'UNKNOWN').map((g) => ({
    ...g, regs: new Set(counted.filter((f) => typeKey(f) === g.key && f.aircraft.registration).map((f) => f.aircraft.registration)).size, t: aircraftType(g.key),
  })), [counted]);
  const regs = useMemo(() => {
    const g = groupBy(counted.filter((f) => f.aircraft.registration), (f) => f.aircraft.registration.toUpperCase(), (f) => aircraftLabel(f));
    const map = new Map(g.map((x) => [x.key, { ...x, type: counted.find((f) => f.aircraft.registration.toUpperCase() === x.key)?.aircraft.typeCode ?? '', operator: counted.find((f) => f.aircraft.registration.toUpperCase() === x.key)?.airline ?? '', custom: null as CustomAircraft | null }]));
    for (const c of custom) {
      const k = c.registration.toUpperCase();
      const e = map.get(k);
      if (e) e.custom = c;
      else map.set(k, { key: k, label: `${c.manufacturer} ${c.model}`.trim() || c.typeCode, flights: 0, minutes: 0, distanceKm: 0, first: '', last: '', type: c.typeCode, operator: c.operator, custom: c });
    }
    return [...map.values()].sort((a, b) => b.flights - a.flights || a.key.localeCompare(b.key));
  }, [counted, custom]);

  const s = q.trim().toLowerCase();
  const ft = types.filter((t) => !s || `${t.key} ${t.label} ${t.t?.family ?? ''}`.toLowerCase().includes(s));
  const fr = regs.filter((r) => !s || `${r.key} ${r.label} ${r.type} ${r.operator} ${r.custom?.nickname ?? ''}`.toLowerCase().includes(s));

  return (
    <div className="flex flex-col gap-5">
      <PageHeader eyebrow="Aircraft library" title="Aircraft" sub="Built from your own records. A type (e.g. A359) is the model; a registration (e.g. A6-XWA) is one individual airframe." actions={<button className="btn-glass" onClick={() => setEdit({ id: uid('ac'), registration: '', typeCode: '', manufacturer: '', model: '', variant: '', operator: '', nickname: '', notes: '', photo: null })}><Plus className="h-4 w-4" />Add aircraft</button>} />
      <div className="flex flex-wrap items-center gap-2">
        <Segmented label="Aircraft view" value={view} onChange={setView} options={[{ value: 'types', label: `Types · ${types.length}` }, { value: 'regs', label: `Registrations · ${regs.length}` }]} />
        <div className="relative ml-auto min-w-[220px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <input className="input pl-9" placeholder="Search aircraft" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search aircraft" />
        </div>
      </div>

      {view === 'types' ? (
        ft.length === 0 ? <EmptyState icon={<Plane className="h-5 w-5" />} title={types.length ? 'No aircraft match' : 'No aircraft yet'} body={types.length ? undefined : 'Aircraft appear here when you log flights with an ICAO type.'} /> : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {ft.map((t) => (
              <Link key={t.key} to={`/aircraft/${encodeURIComponent(t.key)}`} className="glass glass-hover group overflow-hidden rounded-xl2">
                <Photo photo={photoForBody(t.t?.body, hashStr(t.key))} className="h-40" sizes="(max-width: 640px) 100vw, 33vw">
                  <div className="flex h-full flex-col justify-between p-4">
                    <span className="mono self-start rounded-lg bg-black/40 px-2 py-0.5 text-[13px] font-semibold text-ice backdrop-blur-md">{t.key}</span>
                    <div>
                      <div className="text-[18px] font-semibold leading-tight">{t.label}</div>
                      <div className="text-[12px] text-fg/70">{t.t ? `${t.t.body} · ${t.t.engine}` : 'Unclassified type'}</div>
                    </div>
                  </div>
                </Photo>
                <div className="grid grid-cols-3 gap-2 p-4 text-center">
                  <div><div className="mono text-[17px] font-semibold">{t.flights}</div><div className="text-[11px] text-muted">flights</div></div>
                  <div><div className="mono text-[17px] font-semibold">{fmt.hours(t.minutes)}</div><div className="text-[11px] text-muted">hours</div></div>
                  <div><div className="mono text-[17px] font-semibold">{t.regs}</div><div className="text-[11px] text-muted">airframes</div></div>
                </div>
              </Link>
            ))}
          </div>
        )
      ) : (
        fr.length === 0 ? <EmptyState icon={<Plane className="h-5 w-5" />} title="No registrations yet" body="Add the tail number when logging a flight, or add an aircraft by hand." /> : (
          <div className="glass overflow-hidden rounded-xl2">
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead><tr className="text-left text-[11px] uppercase tracking-[0.1em] text-faint">{['Registration', 'Type', 'Operator', 'Flights', 'Hours', 'Last flown', ''].map((h) => <th key={h} className="px-4 py-3 font-medium whitespace-nowrap">{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-white/[0.05]">
                  {fr.map((r) => (
                    <tr key={r.key} className="table-row">
                      <td className="px-4 py-3"><Link to={`/aircraft/${encodeURIComponent('reg:' + r.key)}`} className="mono font-medium text-ice hover:text-white">{r.key}</Link>{r.custom?.nickname && <span className="ml-2 text-[12px] text-muted">“{r.custom.nickname}”</span>}</td>
                      <td className="px-4 py-3 whitespace-nowrap"><span className="mono mr-1.5 text-[11.5px] text-faint">{r.type}</span>{r.label}</td>
                      <td className="px-4 py-3 text-muted">{r.operator || '—'}</td>
                      <td className="px-4 py-3 mono">{r.flights}</td>
                      <td className="px-4 py-3 mono">{fmt.hours(r.minutes)}</td>
                      <td className="px-4 py-3 num text-muted whitespace-nowrap">{r.last ? fmt.date(r.last) : '—'}</td>
                      <td className="px-4 py-3 text-right"><button className="btn-ghost btn-sm" onClick={() => setEdit(r.custom ?? { id: uid('ac'), registration: r.key, typeCode: r.type, manufacturer: aircraftType(r.type)?.manufacturer ?? '', model: aircraftType(r.type)?.model ?? '', variant: '', operator: r.operator, nickname: '', notes: '', photo: null })}>{r.custom ? 'Edit' : 'Add details'}</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}
      <AircraftEditor value={edit} onClose={() => setEdit(null)} />
    </div>
  );
}

export function AircraftEditor({ value, onClose }: { value: CustomAircraft | null; onClose: () => void }) {
  const save = useStore((s) => s.saveCustomAircraft);
  const remove = useStore((s) => s.deleteCustomAircraft);
  const exists = useStore((s) => (value ? s.data.customAircraft.some((c) => c.id === value.id) : false));
  const toast = useStore((s) => s.toast);
  const [v, setV] = useState<CustomAircraft | null>(value);
  const fileRef = useRef<HTMLInputElement>(null);
  if (value && (!v || v.id !== value.id)) setV(value);
  if (!value || !v) return <Dialog open={false} onOpenChange={onClose} title="">{null}</Dialog>;
  const set = (p: Partial<CustomAircraft>) => setV({ ...v, ...p });
  const ok = v.registration.trim().length >= 2;
  return (
    <Dialog open={!!value} onOpenChange={(o) => !o && onClose()} title={exists ? `Edit ${v.registration}` : 'Add aircraft'} description="Your own details for an individual airframe. Stored with your logbook; Flight Log doesn't look up registrations online." footer={<>
      {exists && <button className="btn-ghost mr-auto hover:text-bad" onClick={async () => { await remove(v.id); onClose(); toast({ kind: 'info', title: 'Aircraft details removed' }); }}>Remove details</button>}
      <button className="btn-glass" onClick={onClose}>Cancel</button>
      <button className="btn-primary" disabled={!ok} onClick={async () => { await save({ ...v, registration: v.registration.trim().toUpperCase() }); onClose(); toast({ kind: 'success', title: 'Aircraft saved' }); }}>Save</button>
    </>}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Registration" htmlFor="ac-reg"><input id="ac-reg" className="input-mono" value={v.registration} onChange={(e) => set({ registration: e.target.value.toUpperCase() })} /></Field>
        <Field label="ICAO type" htmlFor="ac-type"><AircraftTypePicker id="ac-type" value={v.typeCode} onPick={(t, raw) => set(t ? { typeCode: t.code, manufacturer: t.manufacturer, model: t.model } : { typeCode: raw })} /></Field>
        <Field label="Manufacturer" htmlFor="ac-man"><input id="ac-man" className="input" value={v.manufacturer} onChange={(e) => set({ manufacturer: e.target.value })} /></Field>
        <Field label="Model" htmlFor="ac-mod"><input id="ac-mod" className="input" value={v.model} onChange={(e) => set({ model: e.target.value })} /></Field>
        <Field label="Variant" htmlFor="ac-var"><input id="ac-var" className="input" value={v.variant} onChange={(e) => set({ variant: e.target.value })} /></Field>
        <Field label="Operator" htmlFor="ac-op"><input id="ac-op" className="input" value={v.operator} onChange={(e) => set({ operator: e.target.value })} /></Field>
        <Field label="Name or nickname" htmlFor="ac-nick" className="sm:col-span-2"><input id="ac-nick" className="input" value={v.nickname} onChange={(e) => set({ nickname: e.target.value })} /></Field>
        <Field label="Notes" htmlFor="ac-notes" className="sm:col-span-2"><textarea id="ac-notes" rows={3} className="input" value={v.notes} onChange={(e) => set({ notes: e.target.value })} /></Field>
        <div className="sm:col-span-2">
          <div className="mb-1.5 text-[12px] font-medium text-muted">Your photo of this aircraft</div>
          <div className="flex items-center gap-3">
            {v.photo ? <img src={v.photo} alt="" className="h-20 w-32 rounded-xl object-cover ring-1 ring-white/10" /> : <div className="grid h-20 w-32 place-items-center rounded-xl bg-deep text-faint ring-1 ring-white/10"><Plane className="h-5 w-5" /></div>}
            <button className="btn-glass btn-sm" onClick={() => fileRef.current?.click()}><ImagePlus className="h-3.5 w-3.5" />{v.photo ? 'Replace' : 'Upload'}</button>
            {v.photo && <button className="btn-ghost btn-sm" onClick={() => set({ photo: null })}>Remove</button>}
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={async (e) => {
            const file = e.target.files?.[0]; if (!file) return;
            const url = URL.createObjectURL(file);
            const img = new Image();
            img.onload = () => { const k = Math.min(1, 1400 / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = img.width * k; c.height = img.height * k; c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height); set({ photo: c.toDataURL('image/jpeg', 0.82) }); URL.revokeObjectURL(url); };
            img.src = url;
          }} />
        </div>
      </div>
    </Dialog>
  );
}
