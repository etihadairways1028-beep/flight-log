import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, TowerControl, BadgeCheck } from 'lucide-react';
import { useStore } from '../store/useStore';
import { useFmt } from '../lib/useFmt';
import { airportVisits } from '../lib/stats';
import { searchAirports, countryName, airportCount, findAirport, loadExtendedAirports, extendedLoaded } from '../lib/airports';
import { EmptyState, PageHeader, Segmented } from '../components/ui';

export default function Airports() {
  const flights = useStore((s) => s.data.flights);
  const fmt = useFmt();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const mode = (params.get('filter') as 'visited' | 'all') || 'visited';
  const visits = useMemo(() => airportVisits(flights), [flights]);
  const visitMap = useMemo(() => new Map(visits.map((v) => [v.ident, v])), [visits]);
  const s = q.trim().toLowerCase();

  const visitedRows = visits.filter((v) => !s || `${v.ident} ${v.label} ${v.name} ${v.city} ${countryName(v.country)}`.toLowerCase().includes(s));
  const results = useMemo(() => (mode === 'all' && s ? searchAirports(s, 60) : []), [mode, s, extendedLoaded()]);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader eyebrow="Airport directory" title="Airports" sub={<>Search {airportCount().toLocaleString('en-GB')} airports by name, ICAO/IATA code, city or country. Reference data from OurAirports, with IANA time zones.</>} />
      <div className="flex flex-wrap items-center gap-2">
        <Segmented label="Airport filter" value={mode} onChange={(m) => setParams((p) => { p.set('filter', m); return p; }, { replace: true })} options={[{ value: 'visited', label: `Visited · ${visits.length}` }, { value: 'all', label: 'All airports' }]} />
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <input className="input pl-9" placeholder={mode === 'all' ? 'Search any airport: OMAA, Heathrow, Tokyo, Iceland…' : 'Filter visited airports'} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search airports" autoFocus={mode === 'all'} />
        </div>
      </div>

      {mode === 'visited' ? (
        visitedRows.length === 0 ? (
          <EmptyState icon={<TowerControl className="h-5 w-5" />} title={visits.length ? 'No visited airports match' : 'No airports visited yet'} body={visits.length ? undefined : 'Airports you fly from or to will be listed here with visit counts.'} action={<button className="btn-glass" onClick={() => setParams({ filter: 'all' })}>Browse all airports</button>} />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {visitedRows.map((v) => (
              <Link key={v.ident} to={`/airports/${v.ident}`} className="glass glass-hover flex min-w-0 items-center gap-4 rounded-xl2 p-4">
                <div className="mono w-14 text-[24px] font-semibold text-ice">{v.label}</div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13.5px] font-medium">{v.name}</div>
                  <div className="truncate text-[12px] text-muted">{[v.city, countryName(v.country)].filter(Boolean).join(', ')}</div>
                  <div className="mt-1 text-[11.5px] text-faint">Last visit {fmt.date(v.last)}</div>
                </div>
                <div className="text-right">
                  <div className="mono text-[20px] font-semibold">{v.total}</div>
                  <div className="text-[10.5px] text-muted">{v.departures}↑ {v.arrivals}↓</div>
                </div>
              </Link>
            ))}
          </div>
        )
      ) : !s ? (
        <EmptyState icon={<Search className="h-5 w-5" />} title="Search the directory" body="Type a code, city, airport name or country to find any of the major and regional airports in the dataset." />
      ) : (
        <div className="glass overflow-hidden rounded-xl2">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead><tr className="text-left text-[11px] uppercase tracking-[0.1em] text-faint">{['IATA', 'ICAO', 'Airport', 'City', 'Country', 'Your visits'].map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-white/[0.05]">
                {results.map((a) => (
                  <tr key={a.ident} className="table-row">
                    <td className="px-4 py-2.5 mono text-ice">{a.iata || '—'}</td>
                    <td className="px-4 py-2.5 mono text-muted">{a.ident}</td>
                    <td className="px-4 py-2.5"><Link to={`/airports/${a.ident}`} className="hover:text-ice">{a.name}</Link></td>
                    <td className="px-4 py-2.5 text-muted">{a.city || '—'}</td>
                    <td className="px-4 py-2.5 text-muted">{countryName(a.country)}</td>
                    <td className="px-4 py-2.5 mono">{visitMap.get(a.ident)?.total ?? <span className="text-faint">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {results.length === 0 && <div className="px-4 py-8 text-center text-[13px] text-muted">No airport matches “{q}”.</div>}
          {!extendedLoaded() && <div className="border-t border-white/[0.06] px-4 py-3 text-[12px] text-muted">Looking for a small airfield? <button className="link" onClick={() => loadExtendedAirports()}>Include 10,000+ small airfields</button></div>}
        </div>
      )}
      <p className="flex items-center gap-1.5 text-[11.5px] text-faint"><BadgeCheck className="h-3.5 w-3.5" />Reference data: OurAirports (public domain) and mwgg/Airports (MIT) for time zones. Custom airports you add are labelled as user-entered.</p>
    </div>
  );
}

export { findAirport };
