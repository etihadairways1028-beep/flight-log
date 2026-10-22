// Friends and public profiles. A profile is a small summary of your logbook — totals,
// route map, top aircraft and airports — never individual flights, registrations, notes
// or photos. Share it as a link (works for everyone, no account needed) or, when cloud
// accounts are set up, publish it under a handle that friends can look up.
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Users, Link2, UserPlus, Trash2, Globe2, RefreshCw, ArrowLeft, Check, CloudUpload, ShieldCheck, Plane, MapPin, Clock, Ruler, Flag, Layers } from 'lucide-react';
import { useStore } from '../store/useStore';
import { useFmt } from '../lib/useFmt';
import { summarize, groupBy, airportVisits } from '../lib/stats';
import { isCounted, routeKey, typeKey, uid } from '../lib/flight';
import { evaluateAchievements } from '../lib/achievements';
import { findAirport, loadExtendedAirports, countryName } from '../lib/airports';
import { Glass, PageHeader, EmptyState, ConfirmDialog, cx } from '../components/ui';
import { WorldMap, type MapRoute, type MapAirport } from '../components/map/WorldMap';
import * as cloud from '../lib/cloud';
import type { Flight, Friend, PublicProfile, Settings } from '../lib/types';
import { plural } from '../lib/units';

// ─── building, encoding and validating profiles ─────────────────────────────
export function buildProfile(flights: Flight[], s: Settings): PublicProfile {
  const fs = flights.filter(isCounted);
  const sum = summarize(fs);
  const routes = new Map<string, [string, string, number]>();
  for (const f of fs) {
    if (!f.dep || !f.arr || f.dep.ident === f.arr.ident) continue;
    const k = routeKey(f)!;
    const r = routes.get(k) ?? [f.dep.ident, f.arr.ident, 0];
    r[2]++; routes.set(k, r);
  }
  const dates = fs.map((f) => f.date).sort();
  return {
    v: 1, name: s.displayName || 'Pilot', handle: s.profileHandle, bio: s.profileBio, home: s.homeAirport,
    updated: new Date().toISOString().slice(0, 10),
    totals: { flights: sum.flights, minutes: Math.round(sum.flightMinutes), km: Math.round(sum.distanceKm), airports: sum.uniqueAirports, countries: sum.uniqueCountries, types: sum.uniqueTypes, realFlights: sum.realFlights, simFlights: sum.simFlights },
    routes: [...routes.values()].sort((a, b) => b[2] - a[2]).slice(0, 400),
    topTypes: groupBy(fs, typeKey).filter((g) => g.key !== 'UNKNOWN').slice(0, 6).map((g) => [g.key, g.flights]),
    topAirports: airportVisits(fs).slice(0, 8).map((a) => [a.ident, a.total]),
    firstDate: dates[0] ?? null, lastDate: dates[dates.length - 1] ?? null,
    badges: evaluateAchievements(flights).filter((a) => a.unlocked).length,
  };
}

const str = (v: unknown, max = 80) => (typeof v === 'string' ? v.slice(0, max) : '');
const int = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : 0);
const ident = (v: unknown) => (typeof v === 'string' && /^[A-Z0-9-]{2,8}$/i.test(v) ? v.toUpperCase() : null);

/** Profiles arrive from links and other people: accept only the expected shape. */
export function cleanProfile(p: any): PublicProfile | null {
  if (!p || typeof p !== 'object' || p.v !== 1 || !p.totals) return null;
  const t = p.totals;
  return {
    v: 1, name: str(p.name, 60) || 'Pilot', handle: str(p.handle, 30).replace(/[^a-z0-9_.-]/gi, ''), bio: str(p.bio, 280), home: ident(p.home) ?? '',
    updated: /^\d{4}-\d{2}-\d{2}$/.test(p.updated) ? p.updated : '',
    totals: { flights: int(t.flights), minutes: int(t.minutes), km: int(t.km), airports: int(t.airports), countries: int(t.countries), types: int(t.types), realFlights: int(t.realFlights), simFlights: int(t.simFlights) },
    routes: (Array.isArray(p.routes) ? p.routes : []).slice(0, 400).map((r: any) => (Array.isArray(r) && ident(r[0]) && ident(r[1]) ? [ident(r[0])!, ident(r[1])!, Math.max(1, int(r[2]))] : null)).filter(Boolean) as [string, string, number][],
    topTypes: (Array.isArray(p.topTypes) ? p.topTypes : []).slice(0, 10).map((r: any) => (Array.isArray(r) && ident(r[0]) ? [ident(r[0])!, int(r[1])] : null)).filter(Boolean) as [string, number][],
    topAirports: (Array.isArray(p.topAirports) ? p.topAirports : []).slice(0, 10).map((r: any) => (Array.isArray(r) && ident(r[0]) ? [ident(r[0])!, int(r[1])] : null)).filter(Boolean) as [string, number][],
    firstDate: /^\d{4}-\d{2}-\d{2}$/.test(p.firstDate) ? p.firstDate : null, lastDate: /^\d{4}-\d{2}-\d{2}$/.test(p.lastDate) ? p.lastDate : null,
    badges: int(p.badges),
  };
}

const b64u = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream) {
  const out = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}
/** z… = deflate-compressed JSON, j… = plain JSON (browsers without CompressionStream). */
export async function encodeProfile(p: PublicProfile): Promise<string> {
  const raw = new TextEncoder().encode(JSON.stringify(p));
  if (typeof CompressionStream !== 'undefined') return 'z' + b64u(await pipe(raw, new CompressionStream('deflate-raw')));
  return 'j' + b64u(raw);
}
export async function decodeProfile(code: string): Promise<PublicProfile | null> {
  try {
    if (code.length > 60000) return null;
    const bytes = unb64u(code.slice(1));
    const json = code[0] === 'z' ? new TextDecoder().decode(await pipe(bytes, new DecompressionStream('deflate-raw'))) : new TextDecoder().decode(bytes);
    return cleanProfile(JSON.parse(json));
  } catch { return null; }
}
export const shareUrl = (code: string) => `${location.origin}${location.pathname}#/u/${code}`;

const PROFILES = 'skylog_profiles';
async function publishProfile(userId: string, p: PublicProfile) {
  const sb = cloud.supa();
  if (!sb) throw new Error('Cloud accounts are not set up for this site.');
  const { error } = await sb.from(PROFILES).upsert({ user_id: userId, handle: p.handle.toLowerCase(), data: p, updated_at: new Date().toISOString() });
  if (error) throw new Error(/relation|does not exist|schema cache/i.test(error.message) ? 'The profiles table is missing. Run the updated supabase/schema.sql once in your Supabase project.' : /duplicate|unique/i.test(error.message) ? 'That handle is taken. Choose another.' : error.message);
}
async function unpublishProfile(userId: string) {
  const sb = cloud.supa(); if (!sb) return;
  await sb.from(PROFILES).delete().eq('user_id', userId);
}
async function fetchProfileByHandle(handle: string): Promise<PublicProfile | null> {
  const sb = cloud.supa();
  if (!sb) throw new Error('Handles work when cloud accounts are set up. Ask your friend for their profile link instead.');
  const { data, error } = await sb.from(PROFILES).select('data').eq('handle', handle.toLowerCase().replace(/^@/, '')).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? cleanProfile((data as any).data) : null;
}

/** Accepts a profile link, a bare code, or an @handle. */
async function resolveInput(input: string): Promise<{ p: PublicProfile; source: 'link' | 'cloud' } | null> {
  const v = input.trim();
  const m = v.match(/#\/u\/([A-Za-z0-9_-]+)/) ?? v.match(/^([zj][A-Za-z0-9_-]{20,})$/);
  if (m) { const p = await decodeProfile(m[1]); return p ? { p, source: 'link' } : null; }
  const h = v.match(/^@?([a-z0-9_.-]{3,30})$/i) ?? v.match(/#\/p\/([a-z0-9_.-]{3,30})/i);
  if (h) { const p = await fetchProfileByHandle(h[1]); return p ? { p, source: 'cloud' } : null; }
  return null;
}

// ─── views ──────────────────────────────────────────────────────────────────
function profileMap(p: PublicProfile) {
  const airports = new Map<string, MapAirport>();
  const routes: MapRoute[] = [];
  const ap = (id: string, n: number) => {
    const a = findAirport(id);
    if (!a || a.lat == null || a.lon == null) return null;
    const v = airports.get(id) ?? { ident: id, label: a.iata || id, name: a.name, lon: a.lon, lat: a.lat, visits: 0 };
    v.visits += n; airports.set(id, v);
    return v;
  };
  for (const [d, a, n] of p.routes) {
    const x = ap(d, n), y = ap(a, n);
    if (x && y) routes.push({ key: `${x.label}–${y.label}`, a: [x.lon, x.lat], b: [y.lon, y.lat], count: n, flights: [], sim: 0, label: `${x.label}–${y.label}` });
  }
  return { routes: routes.sort((a, b) => a.count - b.count), airports: [...airports.values()].sort((a, b) => a.visits - b.visits) };
}

export function ProfileCard({ p, you, actions }: { p: PublicProfile; you?: boolean; actions?: React.ReactNode }) {
  const fmt = useFmt();
  const [, force] = useState(0);
  useEffect(() => { if (p.routes.some(([d, a]) => !findAirport(d) || !findAirport(a))) loadExtendedAirports().then(() => force((n) => n + 1)); }, [p]);
  const map = useMemo(() => profileMap(p), [p]);
  const initials = p.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  const t = p.totals;
  const stats: [any, string, string][] = [
    [Plane, 'Flights', t.flights.toLocaleString('en-GB')], [Clock, 'Hours', fmt.hours(t.minutes)], [Ruler, 'Distance', fmt.dist(t.km)],
    [MapPin, 'Airports', String(t.airports)], [Flag, 'Countries', String(t.countries)], [Layers, 'Aircraft types', String(t.types)],
  ];
  return (
    <Glass className="overflow-hidden p-0">
      <div className="relative">
        <WorldMap routes={map.routes} airports={map.airports} height={300} interactive={false} showLabels={false} />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-ink to-transparent" />
        <div className="absolute bottom-4 left-5 right-5 flex items-end gap-4">
          <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-accent to-[#1e3a6e] text-[22px] font-semibold ring-2 ring-white/20" aria-hidden>{initials}</div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-2"><h2 className="truncate text-[24px] font-semibold tracking-tight">{p.name}</h2>{p.handle && <span className="mono text-[13px] text-ice">@{p.handle}</span>}{you && <span className="chip">You</span>}</div>
            <div className="text-[12.5px] text-muted">{[p.home && `Home ${p.home}`, p.firstDate && `Flying since ${p.firstDate.slice(0, 4)}`, p.badges ? `${p.badges} achievements` : ''].filter(Boolean).join(' · ')}</div>
          </div>
          {actions && <div className="pointer-events-auto flex shrink-0 gap-2">{actions}</div>}
        </div>
      </div>
      <div className="p-5">
        {p.bio && <p className="mb-4 text-[13.5px] text-fg/90">{p.bio}</p>}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {stats.map(([I, l, v]) => <div key={l} className="rounded-xl bg-white/[0.03] p-3 ring-1 ring-white/[0.06]"><div className="flex items-center gap-1.5 text-[11.5px] text-muted"><I className="h-3.5 w-3.5 text-ice/80" />{l}</div><div className="mono mt-1 truncate text-[17px] font-semibold">{v}</div></div>)}
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div><div className="label mb-2">Most flown aircraft</div><div className="flex flex-wrap gap-1.5">{p.topTypes.length ? p.topTypes.map(([k, n]) => <span key={k} className="chip mono">{k} · {n}</span>) : <span className="text-[12.5px] text-faint">—</span>}</div></div>
          <div><div className="label mb-2">Favourite airports</div><div className="flex flex-wrap gap-1.5">{p.topAirports.length ? p.topAirports.map(([k, n]) => <span key={k} className="chip mono">{findAirport(k)?.iata || k} · {n}</span>) : <span className="text-[12.5px] text-faint">—</span>}</div></div>
        </div>
        <div className="mt-4 text-[11.5px] text-faint">{t.realFlights} real-world · {t.simFlights} simulator · snapshot from {p.updated || 'unknown date'}</div>
      </div>
    </Glass>
  );
}

function Compare({ me, them }: { me: PublicProfile; them: PublicProfile }) {
  const fmt = useFmt();
  const myAps = new Set(me.routes.flatMap(([a, b]) => [a, b])), theirAps = new Set(them.routes.flatMap(([a, b]) => [a, b]));
  const shared = [...myAps].filter((a) => theirAps.has(a));
  const rk = (r: [string, string, number]) => [r[0], r[1]].sort().join('-');
  const myR = new Set(me.routes.map(rk)), sharedRoutes = them.routes.filter((r) => myR.has(rk(r)));
  const rows: [string, number, number, (n: number) => string][] = [
    ['Flights', me.totals.flights, them.totals.flights, (n) => n.toLocaleString('en-GB')], ['Hours', me.totals.minutes, them.totals.minutes, (n) => fmt.hours(n)],
    ['Distance', me.totals.km, them.totals.km, (n) => fmt.dist(n)], ['Airports', me.totals.airports, them.totals.airports, String],
    ['Countries', me.totals.countries, them.totals.countries, String], ['Aircraft types', me.totals.types, them.totals.types, String], ['Achievements', me.badges, them.badges, String],
  ];
  return (
    <Glass className="p-5">
      <h3 className="mb-3 text-[14px] font-semibold">You vs {them.name.split(' ')[0]}</h3>
      <div className="flex flex-col gap-2.5">
        {rows.map(([l, a, b, f]) => {
          const max = Math.max(a, b, 1);
          return (
            <div key={l} className="grid grid-cols-[minmax(0,1fr)_96px_minmax(0,1fr)] items-center gap-3 text-[12.5px]">
              <div className="flex items-center justify-end gap-2"><span className={cx('mono whitespace-nowrap', a >= b && 'text-fg font-semibold')}>{f(a)}</span><div className="h-2 rounded-full bg-accent" style={{ width: `${(a / max) * 100}%`, maxWidth: '60%' }} /></div>
              <div className="text-center text-muted">{l}</div>
              <div className="flex items-center gap-2"><div className="h-2 rounded-full bg-live" style={{ width: `${(b / max) * 100}%`, maxWidth: '60%' }} /><span className={cx('mono whitespace-nowrap', b >= a && 'text-fg font-semibold')}>{f(b)}</span></div>
            </div>
          );
        })}
      </div>
      <p className="mt-4 text-[12.5px] text-muted">{shared.length ? <>You’ve both been to <span className="text-fg">{shared.length}</span> of the same airports{shared.length <= 8 ? `: ${shared.map((x) => findAirport(x)?.iata || x).join(', ')}` : ''}.</> : 'No airports in common yet.'}{sharedRoutes.length ? <> {sharedRoutes.length} route{sharedRoutes.length === 1 ? '' : 's'} flown by both of you.</> : null}</p>
    </Glass>
  );
}

export default function FriendsPage() {
  const flights = useStore((s) => s.data.flights);
  const friends = useStore((s) => s.data.friends ?? []);
  const settings = useStore((s) => s.settings);
  const update = useStore((s) => s.updateSettings);
  const setFriends = useStore((s) => s.setFriends);
  const toast = useStore((s) => s.toast);
  const auth = useStore((s) => s.auth);
  const ws = useStore((s) => s.workspace);
  const me = useMemo(() => buildProfile(flights, settings), [flights, settings]);
  const [code, setCode] = useState('');
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
  const [del, setDel] = useState<Friend | null>(null);
  useEffect(() => { let on = true; encodeProfile(me).then((c) => on && setCode(c)); return () => { on = false; }; }, [me]);
  const selected = friends.find((f) => f.id === sel) ?? null;
  const signedIn = auth.status === 'signedIn' && !!auth.user;

  async function add() {
    setBusy(true);
    try {
      const r = await resolveInput(input);
      if (!r) { toast({ kind: 'error', title: 'Profile not found', body: 'Paste the whole profile link your friend shared, or their @handle.' }); return; }
      const key = r.p.handle || r.p.name;
      const existing = friends.find((f) => (f.handle && f.handle === r.p.handle) || f.name === r.p.name);
      const fr: Friend = { id: existing?.id ?? uid('fr'), handle: r.p.handle, name: r.p.name, addedAt: existing?.addedAt ?? new Date().toISOString(), source: r.source, profile: r.p };
      await setFriends((fs) => [fr, ...fs.filter((f) => f.id !== fr.id)]);
      setInput(''); setSel(fr.id);
      toast({ kind: 'success', title: existing ? `Updated ${key}` : `Added ${key}` });
    } catch (e) { toast({ kind: 'error', title: 'Couldn’t add friend', body: (e as Error).message }); } finally { setBusy(false); }
  }
  async function refresh(f: Friend) {
    if (f.source !== 'cloud' || !f.handle) return;
    try { const p = await fetchProfileByHandle(f.handle); if (p) { await setFriends((fs) => fs.map((x) => (x.id === f.id ? { ...x, profile: p, name: p.name } : x))); toast({ kind: 'success', title: `${p.name} refreshed` }); } } catch (e) { toast({ kind: 'error', title: 'Refresh failed', body: (e as Error).message }); }
  }
  async function publish() {
    if (!auth.user) return;
    if (!/^[a-z0-9_.-]{3,30}$/i.test(settings.profileHandle)) { toast({ kind: 'error', title: 'Choose a handle first', body: '3–30 letters, numbers, dots, dashes or underscores.' }); return; }
    setBusy(true);
    try { await publishProfile(auth.user.id, me); toast({ kind: 'success', title: 'Profile published', body: `Friends can add you as @${settings.profileHandle}.` }); }
    catch (e) { toast({ kind: 'error', title: 'Couldn’t publish', body: (e as Error).message }); } finally { setBusy(false); }
  }
  const copy = (t: string, what: string) => navigator.clipboard?.writeText(t).then(() => toast({ kind: 'success', title: `${what} copied` }), () => toast({ kind: 'error', title: 'Copy blocked by the browser' }));

  return (
    <div className="flex flex-col gap-5">
      <PageHeader eyebrow="Community" title="Friends" sub="Share a profile with your totals and route map, add friends, and see how your flying compares. Profiles never include individual flights, registrations, notes or photos." />
      {ws === 'demo' && <div className="rounded-xl2 bg-warn/[0.07] px-4 py-3 text-[13px] ring-1 ring-warn/20">You’re in the demo workspace, so this profile shows demo flights. Switch to your own logbook to share your real profile.</div>}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <ProfileCard p={me} you />
          <Glass className="p-5">
            <div className="mb-3 flex items-center gap-2"><Globe2 className="h-4 w-4 text-ice" /><h3 className="text-[14px] font-semibold">Your public profile</h3></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-[12px] text-muted">Handle<input className="input mono mt-1" placeholder="e.g. skyfarer" value={settings.profileHandle} onChange={(e) => update({ profileHandle: e.target.value.replace(/[^a-z0-9_.-]/gi, '').slice(0, 30) })} /></label>
              <label className="text-[12px] text-muted">Short bio<input className="input mt-1" maxLength={280} placeholder="A320 sim captain, real-world plane spotter" value={settings.profileBio} onChange={(e) => update({ profileBio: e.target.value })} /></label>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button className="btn-primary" disabled={!code} onClick={() => copy(shareUrl(code), 'Profile link')}><Link2 className="h-4 w-4" />Copy profile link</button>
              {signedIn && cloud.cloudConfig() && <button className="btn-glass" disabled={busy} onClick={publish}><CloudUpload className="h-4 w-4" />Publish as @{settings.profileHandle || 'handle'}</button>}
              {signedIn && cloud.cloudConfig() && <button className="btn-ghost" onClick={async () => { await unpublishProfile(auth.user!.id); toast({ kind: 'info', title: 'Profile unpublished' }); }}>Unpublish</button>}
            </div>
            <p className="mt-3 flex gap-2 text-[12px] text-muted"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />The link contains a snapshot of the profile above, nothing else, and it doesn’t update itself: copy a new link after more flying.{signedIn && cloud.cloudConfig() ? ' A published @handle profile updates whenever you press Publish.' : ''}</p>
          </Glass>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <Glass className="p-5">
            <div className="mb-3 flex items-center gap-2"><UserPlus className="h-4 w-4 text-ice" /><h3 className="text-[14px] font-semibold">Add a friend</h3></div>
            <div className="flex gap-2">
              <input className="input min-w-0 flex-1" placeholder="Paste a profile link or @handle" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && input && add()} aria-label="Profile link or handle" />
              <button className="btn-primary" disabled={!input || busy} onClick={add}>Add</button>
            </div>
          </Glass>
          {friends.length === 0 ? (
            <EmptyState icon={<Users className="h-6 w-6" />} title="No friends yet" body="Send your profile link to a friend who uses Flight Log and paste theirs here." />
          ) : (
            <Glass className="p-2">
              <ul className="flex flex-col">
                {friends.map((f) => (
                  <li key={f.id}>
                    <button className={cx('flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-white/[0.05]', sel === f.id && 'bg-white/[0.07]')} onClick={() => setSel(sel === f.id ? null : f.id)}>
                      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-live/60 to-[#1e3a6e] text-[13px] font-semibold">{f.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase()}</div>
                      <div className="min-w-0 flex-1"><div className="truncate text-[13.5px] font-medium">{f.name}{f.handle && <span className="mono ml-1.5 text-[12px] text-ice">@{f.handle}</span>}</div><div className="text-[12px] text-muted">{plural(f.profile.totals.flights, 'flight')} · {Math.round(f.profile.totals.minutes / 60)} h · {plural(f.profile.totals.countries, 'country')}</div></div>
                      {sel === f.id && <Check className="h-4 w-4 text-ice" />}
                    </button>
                  </li>
                ))}
              </ul>
            </Glass>
          )}
          {selected && (
            <>
              <ProfileCard p={selected.profile} actions={<>
                {selected.source === 'cloud' && <button className="btn-glass btn-sm" onClick={() => refresh(selected)} aria-label="Refresh profile"><RefreshCw className="h-3.5 w-3.5" /></button>}
                <button className="btn-glass btn-sm hover:text-bad" onClick={() => setDel(selected)} aria-label={`Remove ${selected.name}`}><Trash2 className="h-3.5 w-3.5" /></button>
              </>} />
              <Compare me={me} them={selected.profile} />
            </>
          )}
        </div>
      </div>
      <ConfirmDialog open={!!del} onOpenChange={(v) => !v && setDel(null)} title={`Remove ${del?.name}?`} confirmLabel="Remove" body="They’ll disappear from your friends list on this device. You can add them again from their link." onConfirm={async () => { const d = del!; await setFriends((fs) => fs.filter((f) => f.id !== d.id)); setSel(null); setDel(null); }} />
    </div>
  );
}

/** #/u/<code> (shared link) and #/p/<handle> (published profile). */
export function ProfileLinkPage() {
  const { code, handle } = useParams();
  const friends = useStore((s) => s.data.friends ?? []);
  const setFriends = useStore((s) => s.setFriends);
  const toast = useStore((s) => s.toast);
  const nav = useNavigate();
  const [p, setP] = useState<PublicProfile | null | undefined>(undefined);
  const [err, setErr] = useState('');
  useEffect(() => {
    setP(undefined);
    (code ? decodeProfile(code) : handle ? fetchProfileByHandle(handle) : Promise.resolve(null)).then(setP, (e) => { setErr((e as Error).message); setP(null); });
  }, [code, handle]);
  if (p === undefined) return <div className="py-20 text-center text-[13px] text-muted">Loading profile…</div>;
  if (!p) return <EmptyState title="Profile not available" body={err || 'This link is damaged or incomplete. Ask your friend to copy it again.'} action={<Link to="/friends" className="btn-glass">Go to Friends</Link>} />;
  const already = friends.find((f) => (p.handle && f.handle === p.handle) || f.name === p.name);
  async function add() {
    const fr: Friend = { id: already?.id ?? uid('fr'), handle: p!.handle, name: p!.name, addedAt: already?.addedAt ?? new Date().toISOString(), source: code ? 'link' : 'cloud', profile: p! };
    await setFriends((fs) => [fr, ...fs.filter((f) => f.id !== fr.id)]);
    toast({ kind: 'success', title: already ? `${p!.name} updated` : `${p!.name} added to friends` });
    nav('/friends');
  }
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2">
        <Link to="/friends" className="btn-ghost -ml-2"><ArrowLeft className="h-4 w-4" />Friends</Link>
        <button className="btn-primary ml-auto" onClick={add}><UserPlus className="h-4 w-4" />{already ? 'Update friend' : 'Add to friends'}</button>
      </div>
      <ProfileCard p={p} />
      <p className="text-center text-[12px] text-faint">A Flight Log profile: totals and routes only. {p.home && findAirport(p.home) ? `Home airport ${findAirport(p.home)!.name}, ${countryName(findAirport(p.home)!.country)}.` : ''}</p>
    </div>
  );
}
