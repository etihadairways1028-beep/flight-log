import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { DateTime } from 'luxon';
import { Target, User, Ruler, Palette, Volume2, NotebookPen, LayoutDashboard, Shield, Plug, Database, Info, Cloud, CloudOff, LogOut, LogIn, RefreshCw, Trash2, Upload, Download, Gauge, ArrowUp, ArrowDown, Play, Settings2, KeyRound } from 'lucide-react';
import { useStore } from '../store/useStore';
import { Field, Glass, PageHeader, Segmented, Toggle, ConfirmDialog, Dialog, cx } from '../components/ui';
import { Avatar } from '../components/layout/AppShell';
import { AircraftTypePicker, AirportPicker } from '../components/flight/Pickers';
import { CATEGORY_LABEL, PROFILE_LABEL, type FlightCategory, type FlyingProfile, type Settings } from '../lib/types';
import { findAirport, toRef } from '../lib/airports';
import { storageEstimate, isMemoryOnly } from '../store/db';
import { sound } from '../lib/sound';
import { fetchLatestOfp } from '../lib/simbrief';
import * as cloud from '../lib/cloud';
import { CloudSetupDialog } from './Auth';

const CARD_LABELS: Record<string, string> = { flights: 'Total flights', hours: 'Flight hours', block: 'Block hours', distance: 'Distance', aircraft: 'Aircraft types', airports: 'Airports', routes: 'Unique routes', airlines: 'Airlines', month: 'This month', average: 'Average flight', longest: 'Longest flight', topType: 'Most-flown aircraft' };
const ALL_CARDS = Object.keys(CARD_LABELS);
const CHART_LABELS: Record<string, string> = { monthlyHours: 'Monthly flight hours', flightsPerMonth: 'Flights per month', cumulative: 'Cumulative hours', byType: 'Flights by aircraft type', byAirline: 'Flights by airline', byCategory: 'Flights by category', topAirports: 'Most visited airports', domestic: 'Domestic vs international' };

const SECTIONS = [
  { id: 'account', label: 'Account', icon: Cloud }, { id: 'profile', label: 'Profile', icon: User }, { id: 'goals', label: 'Goals', icon: Target }, { id: 'units', label: 'Units & formats', icon: Ruler },
  { id: 'appearance', label: 'Appearance', icon: Palette }, { id: 'sound', label: 'Sound', icon: Volume2 }, { id: 'defaults', label: 'Logbook defaults', icon: NotebookPen },
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard }, { id: 'charts', label: 'Charts', icon: LayoutDashboard }, { id: 'privacy', label: 'Privacy', icon: Shield }, { id: 'integrations', label: 'Integrations', icon: Plug },
  { id: 'data', label: 'Data', icon: Database }, { id: 'about', label: 'About', icon: Info },
];

export default function SettingsPage() {
  const s = useStore((x) => x.settings);
  const update = useStore((x) => x.updateSettings);
  const toast = useStore((x) => x.toast);
  const set = (p: Partial<Settings>) => { update(p); };
  const [params] = useSearchParams();
  useEffect(() => { const sec = params.get('section'); if (sec) setTimeout(() => document.getElementById(`set-${sec}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 250); }, [params]);
  const row = 'flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6';
  const rowLabel = (t: string, d?: string) => <div className="min-w-0"><div className="text-[13.5px] font-medium">{t}</div>{d && <div className="text-[12px] text-muted">{d}</div>}</div>;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow="Preferences" title="Settings" sub="Changes save automatically." />
      <div className="grid gap-6 lg:grid-cols-[200px_1fr]">
        <nav className="hidden lg:block" aria-label="Settings sections">
          <div className="sticky top-24 flex flex-col gap-0.5">
            {SECTIONS.map((x) => <a key={x.id} href={`#${x.id}`} onClick={(e) => { e.preventDefault(); document.getElementById(`set-${x.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }} className="flex h-9 items-center gap-2.5 rounded-lg px-3 text-[13px] text-muted hover:bg-white/[0.04] hover:text-fg"><x.icon className="h-4 w-4" />{x.label}</a>)}
          </div>
        </nav>
        <div className="flex min-w-0 flex-col gap-5">
          <AccountSection />

          <Section id="profile" title="Profile" icon={User}>
            <div className="flex items-center gap-4 py-4">
              <Avatar size={64} />
              <AvatarPicker />
            </div>
            <div className={row}>{rowLabel('Display name')}<input className="input sm:max-w-xs" value={s.displayName} onChange={(e) => set({ displayName: e.target.value })} aria-label="Display name" /></div>
            <div className={row}>{rowLabel('Flying type', 'Sets defaults and wording. Simulator time is never counted as real-world time.')}
              <select className="input sm:max-w-xs" value={s.profile} onChange={(e) => set({ profile: e.target.value as FlyingProfile })} aria-label="Flying type">{(Object.keys(PROFILE_LABEL) as FlyingProfile[]).map((p) => <option key={p} value={p}>{PROFILE_LABEL[p]}</option>)}</select></div>
            <div className={row}>{rowLabel('Home airport')}<div className="sm:w-80"><AirportPicker label="Home airport" value={s.homeAirport ? (findAirport(s.homeAirport) ? toRef(findAirport(s.homeAirport)!) : null) : null} onChange={(a) => set({ homeAirport: a?.ident ?? '' })} /></div></div>
          </Section>

          <Section id="goals" title="Goals" icon={Target} note="Leave a goal empty to hide it. Progress rings on Overview count completed real and simulator flights.">
            {([['yearFlights', `Flights in ${DateTime.local().year}`], ['yearHours', `Flight hours in ${DateTime.local().year}`], ['monthFlights', 'Flights each month'], ['yearNewAirports', `New airports in ${DateTime.local().year}`]] as const).map(([k, l]) => (
              <div key={k} className={row}>{rowLabel(l)}<input type="number" min={0} inputMode="numeric" className="input mono sm:max-w-[140px]" value={s.goals[k] ?? ''} placeholder="No goal" aria-label={l} onChange={(e) => { const v = e.target.value === '' ? null : Math.max(0, Number(e.target.value)) || null; set({ goals: { ...s.goals, [k]: v } }); }} /></div>
            ))}
          </Section>

          <Section id="units" title="Units & formats" icon={Ruler} note="Values are stored in km, ft, kt and minutes, then converted for display, so switching never changes your data.">
            <div className={row}>{rowLabel('Distance')}<Segmented label="Distance unit" size="sm" value={s.distanceUnit} onChange={(v) => set({ distanceUnit: v })} options={[{ value: 'nm', label: 'NM' }, { value: 'km', label: 'km' }, { value: 'mi', label: 'mi' }]} /></div>
            <div className={row}>{rowLabel('Altitude')}<Segmented label="Altitude unit" size="sm" value={s.altitudeUnit} onChange={(v) => set({ altitudeUnit: v })} options={[{ value: 'ft', label: 'ft' }, { value: 'm', label: 'm' }]} /></div>
            <div className={row}>{rowLabel('Speed')}<Segmented label="Speed unit" size="sm" value={s.speedUnit} onChange={(v) => set({ speedUnit: v })} options={[{ value: 'kt', label: 'kt' }, { value: 'kmh', label: 'km/h' }, { value: 'mph', label: 'mph' }]} /></div>
            <div className={row}>{rowLabel('Durations', '7:25 or 7.4 hours')}<Segmented label="Duration format" size="sm" value={s.durationFormat} onChange={(v) => set({ durationFormat: v })} options={[{ value: 'hm', label: 'H:MM' }, { value: 'decimal', label: 'Decimal' }]} /></div>
            <div className={row}>{rowLabel('Clock')}<Segmented label="Time format" size="sm" value={s.timeFormat} onChange={(v) => set({ timeFormat: v })} options={[{ value: '24h', label: '24-hour' }, { value: '12h', label: '12-hour' }]} /></div>
            <div className={row}>{rowLabel('Date format', DateTime.local().toFormat(s.dateFormat))}<select className="input sm:max-w-xs" value={s.dateFormat} onChange={(e) => set({ dateFormat: e.target.value as Settings['dateFormat'] })} aria-label="Date format">{(['dd MMM yyyy', 'yyyy-MM-dd', 'dd/MM/yyyy', 'MM/dd/yyyy'] as const).map((f) => <option key={f} value={f}>{DateTime.local().toFormat(f)}</option>)}</select></div>
            <div className={row}>{rowLabel('Time entry', 'How you type times in the flight form. Stored as UTC either way.')}<Segmented label="Time entry zone" size="sm" value={s.timeEntryZone} onChange={(v) => set({ timeEntryZone: v })} options={[{ value: 'airport', label: 'Airport local' }, { value: 'utc', label: 'UTC' }]} /></div>
            <div className={row}>{rowLabel('Display time zone', 'Used where a time isn\'t tied to an airport.')}<select className="input sm:max-w-xs" value={s.timeZone} onChange={(e) => set({ timeZone: e.target.value })} aria-label="Preferred time zone"><option value="local">This device ({Intl.DateTimeFormat().resolvedOptions().timeZone})</option><option value="UTC">UTC</option>{(Intl as any).supportedValuesOf?.('timeZone').map((z: string) => <option key={z} value={z}>{z}</option>)}</select></div>
            <div className={row}>{rowLabel('Calendar grouping', 'Which date an overnight flight appears on.')}<Segmented label="Calendar convention" size="sm" value={s.calendarConvention} onChange={(v) => set({ calendarConvention: v })} options={[{ value: 'departure-local', label: 'Local departure date' }, { value: 'utc', label: 'UTC date' }]} /></div>
          </Section>

          <Section id="appearance" title="Appearance" icon={Palette}>
            <div className={row}>{rowLabel('Theme')}<Segmented label="Theme" size="sm" value={s.theme} onChange={(v) => set({ theme: v })} options={[{ value: 'midnight', label: 'Midnight' }, { value: 'twilight', label: 'Twilight' }]} /></div>
            <div className={row}>{rowLabel('Reduce transparency', 'Solid panels instead of glass. Easier to read, lighter on older devices.')}<Toggle checked={s.reduceTransparency} onChange={(v) => set({ reduceTransparency: v })} label="Reduce transparency" /></div>
            <InstallRow />
            <p className="pb-3 text-[12px] text-faint">Motion follows your system's “reduce motion” setting automatically. Flight Log also works offline once it has loaded.</p>
          </Section>

          <Section id="sound" title="Sound" icon={Volume2}>
            <div className={row}>{rowLabel('Interface sounds', 'A cabin chime when a flight is logged, a soft chord for achievements and quiet taps.')}<Toggle checked={s.sounds} onChange={(v) => { set({ sounds: v }); if (v) setTimeout(() => sound.tap(), 20); }} label="Interface sounds" /></div>
            <div className={cx(row, !s.sounds && 'opacity-40')}>{rowLabel('Volume')}
              <div className="flex items-center gap-3 sm:w-80">
                <input type="range" min={0} max={1} step={0.05} value={s.soundVolume} disabled={!s.sounds} onChange={(e) => set({ soundVolume: Number(e.target.value) })} onPointerUp={() => sound.tap()} className="flex-1 accent-[rgb(59,130,246)]" aria-label="Volume" />
                <button className="btn-glass btn-sm" disabled={!s.sounds} onClick={() => sound.logged()}><Play className="h-3.5 w-3.5" />Chime</button>
                <button className="btn-glass btn-sm" disabled={!s.sounds} onClick={() => sound.achievement()}>Chord</button>
              </div>
            </div>
          </Section>

          <Section id="defaults" title="Logbook defaults" icon={NotebookPen}>
            <div className={row}>{rowLabel('Default category')}<select className="input sm:max-w-xs" value={s.defaultCategory} onChange={(e) => set({ defaultCategory: e.target.value as FlightCategory })} aria-label="Default category">{(Object.keys(CATEGORY_LABEL) as FlightCategory[]).map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}</select></div>
            <div className={row}>{rowLabel('Default aircraft type')}<div className="sm:w-80"><AircraftTypePicker id="set-defac" value={s.defaultAircraft} onPick={(t, raw) => set({ defaultAircraft: t?.code ?? raw })} /></div></div>
            <div className={row}>{rowLabel('Default simulator')}<input className="input sm:max-w-xs" value={s.defaultSimulator} onChange={(e) => set({ defaultSimulator: e.target.value })} aria-label="Default simulator" /></div>
          </Section>

          <Section id="dashboard" title="Dashboard" icon={LayoutDashboard} note="Choose and order the statistic cards on Overview.">
            <ul className="flex flex-col gap-1.5 py-3">
              {[...s.dashboardCards, ...ALL_CARDS.filter((c) => !s.dashboardCards.includes(c))].map((k) => {
                const on = s.dashboardCards.includes(k);
                const i = s.dashboardCards.indexOf(k);
                return (
                  <li key={k} className={cx('flex items-center gap-3 rounded-xl px-3 py-2 ring-1', on ? 'bg-white/[0.04] ring-white/[0.07]' : 'ring-transparent opacity-60')}>
                    <Toggle checked={on} onChange={(v) => set({ dashboardCards: v ? [...s.dashboardCards, k] : s.dashboardCards.filter((x) => x !== k) })} label={`Show ${CARD_LABELS[k]}`} />
                    <span className="flex-1 text-[13px]">{CARD_LABELS[k]}</span>
                    {on && <>
                      <button className="btn-icon btn-ghost h-7 w-7" disabled={i === 0} onClick={() => { const a = [...s.dashboardCards]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; set({ dashboardCards: a }); }} aria-label={`Move ${CARD_LABELS[k]} up`}><ArrowUp className="h-3.5 w-3.5" /></button>
                      <button className="btn-icon btn-ghost h-7 w-7" disabled={i === s.dashboardCards.length - 1} onClick={() => { const a = [...s.dashboardCards]; [a[i + 1], a[i]] = [a[i], a[i + 1]]; set({ dashboardCards: a }); }} aria-label={`Move ${CARD_LABELS[k]} down`}><ArrowDown className="h-3.5 w-3.5" /></button>
                    </>}
                  </li>
                );
              })}
            </ul>
          </Section>

          <Section id="charts" title="Dashboard charts" icon={LayoutDashboard} note="Choose which charts appear under Activity on Overview.">
            <div className="grid gap-x-6 py-2 sm:grid-cols-2">
              {Object.entries(CHART_LABELS).map(([k, l]) => (
                <label key={k} className="flex items-center justify-between gap-3 py-2.5 text-[13px]">{l}<Toggle checked={s.dashboardCharts.includes(k)} onChange={(v) => set({ dashboardCharts: v ? [...s.dashboardCharts, k] : s.dashboardCharts.filter((x) => x !== k) })} label={`Show ${l}`} /></label>
              ))}
            </div>
          </Section>

          <Section id="privacy" title="Privacy" icon={Shield}>
            <div className={row}>{rowLabel('Hide registrations', 'Mask tail numbers on screen and in reports, for screenshots and sharing.')}<Toggle checked={s.privacyHideRegistrations} onChange={(v) => set({ privacyHideRegistrations: v })} label="Hide registrations" /></div>
            <div className={row}>{rowLabel('Achievements', 'Milestone badges and notifications.')}<Toggle checked={s.achievementsEnabled} onChange={(v) => set({ achievementsEnabled: v })} label="Achievements" /></div>
            <div className={row}>{rowLabel('Show aviation photography')}<Toggle checked={s.showPhotos} onChange={(v) => set({ showPhotos: v })} label="Show photography" /></div>
            <p className="pb-3 text-[12px] text-faint">Flight Log has no analytics or tracking. Photography loads from images.unsplash.com; turning it off stops those requests.</p>
          </Section>

          <IntegrationsSection />
          <DataSection />

          <Section id="about" title="About" icon={Info}>
            <div className="flex flex-col gap-2 py-4 text-[13px] text-muted">
              <p><span className="text-fg">Flight Log 1.0</span> · Every flight tells a story.</p>
              <p>Airport reference data: <a className="link" href="https://ourairports.com/data/" target="_blank" rel="noreferrer">OurAirports</a> (public domain); time zones from <a className="link" href="https://github.com/mwgg/Airports" target="_blank" rel="noreferrer">mwgg/Airports</a> (MIT). Airline names: <a className="link" href="https://openflights.org/data" target="_blank" rel="noreferrer">OpenFlights</a> (ODbL). Country borders: Natural Earth via world-atlas. Photography: <a className="link" href="https://unsplash.com/license" target="_blank" rel="noreferrer">Unsplash</a>.</p>
              <p className="text-[12px] text-faint">Flight Log is a personal record. It isn't an approved regulatory pilot logbook, and achievements aren't qualifications.</p>
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({ id, title, icon: Icon, children, note }: { id: string; title: string; icon: any; children: React.ReactNode; note?: string }) {
  return (
    <Glass id={`set-${id}`} as="section" className="scroll-mt-24 px-5 pt-5">
      <div className="flex items-center gap-2.5 pb-1"><Icon className="h-4 w-4 text-ice" /><h2 className="text-[15px] font-semibold">{title}</h2></div>
      {note && <p className="text-[12px] text-muted">{note}</p>}
      <div className="divide-y divide-white/[0.06] pb-1">{children}</div>
    </Glass>
  );
}

function AvatarPicker() {
  const update = useStore((x) => x.updateSettings);
  const has = useStore((x) => !!x.settings.avatar);
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="flex gap-2">
      <button className="btn-glass btn-sm" onClick={() => ref.current?.click()}><Upload className="h-3.5 w-3.5" />{has ? 'Change photo' : 'Upload photo'}</button>
      {has && <button className="btn-ghost btn-sm" onClick={() => update({ avatar: null })}>Remove</button>}
      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={(e) => {
        const file = e.target.files?.[0]; if (!file) return;
        const url = URL.createObjectURL(file); const img = new Image();
        img.onload = () => { const c = document.createElement('canvas'); const sz = 256; c.width = sz; c.height = sz; const k = Math.max(sz / img.width, sz / img.height); const w = img.width * k, h = img.height * k; c.getContext('2d')!.drawImage(img, (sz - w) / 2, (sz - h) / 2, w, h); update({ avatar: c.toDataURL('image/jpeg', 0.85) }); URL.revokeObjectURL(url); };
        img.src = url; e.target.value = '';
      }} />
    </div>
  );
}

function AccountSection() {
  const auth = useStore((x) => x.auth);
  const sync = useStore((x) => x.sync);
  const syncNow = useStore((x) => x.syncNow);
  const logout = useStore((x) => x.logout);
  const toast = useStore((x) => x.toast);
  const [setup, setSetup] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [pw, setPw] = useState(false);
  const [pw1, setPw1] = useState('');
  const [busyPw, setBusyPw] = useState(false);
  const cfg = cloud.cloudConfig();
  return (
    <Section id="account" title="Account & sync" icon={Cloud}>
      {auth.status === 'signedIn' ? (
        <>
          <div className="flex flex-wrap items-center gap-3 py-4">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-good/15 text-good ring-1 ring-good/30"><Cloud className="h-5 w-5" /></div>
            <div className="min-w-0 flex-1"><div className="truncate text-[13.5px] font-medium">{auth.user?.email}</div><div className="text-[12px] text-muted">{sync.state === 'error' ? <span className="text-warn">{sync.error}</span> : sync.lastSync ? `Synced ${DateTime.fromISO(sync.lastSync).toRelative()}` : 'Connected'}</div></div>
            <button className="btn-glass btn-sm" onClick={syncNow} disabled={sync.state === 'syncing'}><RefreshCw className={cx('h-3.5 w-3.5', sync.state === 'syncing' && 'animate-spin')} />Sync now</button>
            <button className="btn-glass btn-sm" onClick={() => setPw(true)}><KeyRound className="h-3.5 w-3.5" />Change password</button>
            <button className="btn-glass btn-sm" onClick={logout}><LogOut className="h-3.5 w-3.5" />Sign out</button>
          </div>
          <p className="py-3 text-[12px] text-muted">Your personal logbook and settings sync to your account. Photos and the demo workspace stay on each device. Signing out removes this device's copy; your account keeps everything.</p>
          <div className="flex justify-end py-3"><button className="btn-ghost btn-sm hover:text-bad" onClick={() => setConfirm(true)}><Trash2 className="h-3.5 w-3.5" />Delete my cloud data</button></div>
          <ConfirmDialog open={confirm} onOpenChange={setConfirm} title="Delete your cloud data?" confirmLabel="Delete cloud data" body="This permanently removes your synced logbook and settings from the server, then signs you out. Download a JSON backup first if you want to keep your flights." onConfirm={async () => { try { await cloud.deleteAllCloudData(auth.user!.id); await logout(); toast({ kind: 'info', title: 'Cloud data deleted' }); } catch (e) { toast({ kind: 'error', title: 'Could not delete', body: (e as Error).message }); } }} />
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-3 py-4">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-white/[0.05] text-muted ring-1 ring-white/10"><CloudOff className="h-5 w-5" /></div>
          <div className="min-w-0 flex-1"><div className="text-[13.5px] font-medium">Not signed in</div><div className="text-[12px] text-muted">{cfg ? 'Your logbook is stored only in this browser.' : 'Cloud accounts aren\'t configured for this site, so your logbook is stored only in this browser.'}</div></div>
          {cfg && <button className="btn-primary btn-sm" onClick={() => { cloud.setAuthChoice(null); useStore.setState({ auth: { status: 'signedOut', user: null, recovery: false } }); }}><LogIn className="h-3.5 w-3.5" />Sign in / create account</button>}
          {cfg?.source !== 'build' && <button className="btn-glass btn-sm" onClick={() => setSetup(true)}><Settings2 className="h-3.5 w-3.5" />{cfg ? 'Cloud settings' : 'Set up cloud accounts'}</button>}
        </div>
      )}
      <CloudSetupDialog open={setup} onOpenChange={setSetup} />
      <Dialog open={pw} onOpenChange={(v) => { setPw(v); if (!v) setPw1(''); }} title="Change password" size="sm" footer={<button className="btn-primary" disabled={pw1.length < 8 || busyPw} onClick={async () => { setBusyPw(true); try { await cloud.updatePassword(pw1); setPw(false); setPw1(''); toast({ kind: 'success', title: 'Password changed' }); } catch (e) { toast({ kind: 'error', title: 'Could not change password', body: (e as Error).message }); } finally { setBusyPw(false); } }}>Save new password</button>}>
        <input type="password" autoComplete="new-password" className="input h-11" placeholder="New password (at least 8 characters)" value={pw1} onChange={(e) => setPw1(e.target.value)} aria-label="New password" />
      </Dialog>
    </Section>
  );
}

function IntegrationsSection() {
  const s = useStore((x) => x.settings);
  const update = useStore((x) => x.updateSettings);
  const integ = useStore((x) => x.data.integrations);
  const setInteg = useStore((x) => x.setIntegration);
  const openForm = useStore((x) => x.openForm);
  const toast = useStore((x) => x.toast);
  const [busy, setBusy] = useState(false);
  const sb = integ.simbrief;
  async function pull() {
    setBusy(true);
    try {
      const f = await fetchLatestOfp(s.simbriefUser);
      await setInteg('simbrief', { lastSync: new Date().toISOString(), lastError: null });
      openForm(f, 'create');
      toast({ kind: 'success', title: 'SimBrief plan loaded', body: 'Review it, then save. Nothing is saved until you do.' });
    } catch (e) {
      await setInteg('simbrief', { lastError: (e as Error).message });
      toast({ kind: 'error', title: 'SimBrief', body: (e as Error).message });
    } finally { setBusy(false); }
  }
  const Status = ({ state }: { state: 'ready' | 'off' | 'setup' }) => <span className={cx('chip', state === 'ready' ? 'text-good ring-good/25' : state === 'setup' ? 'text-warn ring-warn/25' : 'text-faint')}><span className={cx('h-1.5 w-1.5 rounded-full', state === 'ready' ? 'bg-good' : state === 'setup' ? 'bg-warn' : 'bg-faint')} />{state === 'ready' ? 'Available' : state === 'setup' ? 'Setup needed' : 'Not connected'}</span>;
  return (
    <Section id="integrations" title="Integrations" icon={Plug} note="Each integration shows its real status. Nothing is imported automatically, and nothing pretends to be connected.">
      <div className="py-4">
        <div className="flex flex-wrap items-center gap-2"><div className="text-[13.5px] font-medium">SimBrief</div><Status state={s.simbriefUser ? 'ready' : 'setup'} /></div>
        <p className="mt-1 text-[12px] text-muted">Pull your latest operational flight plan into a new planned simulator flight. Uses SimBrief's public OFP fetcher with your username, no key required.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <input className="input max-w-[220px]" placeholder="SimBrief username" value={s.simbriefUser} onChange={(e) => update({ simbriefUser: e.target.value })} aria-label="SimBrief username" />
          <button className="btn-glass" disabled={!s.simbriefUser || busy} onClick={pull}><Download className="h-4 w-4" />{busy ? 'Fetching…' : 'Fetch latest OFP'}</button>
        </div>
        <div className="mt-2 text-[11.5px] text-faint">{sb?.lastError ? <span className="text-warn">Last attempt failed: {sb.lastError}</span> : sb?.lastSync ? `Last fetched ${DateTime.fromISO(sb.lastSync).toRelative()}` : 'Never fetched'}</div>
      </div>
      {[
        ['Microsoft Flight Simulator', 'Automatic logging needs a SimConnect bridge running on your PC, which a website can’t provide by itself. Until a bridge is set up, log sim flights by hand or via SimBrief/CSV.'],
        ['X-Plane', 'Automatic logging needs a plugin or UDP bridge on your computer. Not connected.'],
        ['Live flight tracking', 'Providers such as FlightAware or AviationStack need an API key held on a server, never in the browser. Not configured. Flight Log never shows live positions it doesn’t have.'],
        ['Weather (METAR)', 'Not configured. Type observations into a flight’s Weather field.'],
      ].map(([t, d]) => (
        <div key={t} className="py-4">
          <div className="flex flex-wrap items-center gap-2"><div className="text-[13.5px] font-medium">{t}</div><Status state="off" /></div>
          <p className="mt-1 text-[12px] text-muted">{d}</p>
        </div>
      ))}
    </Section>
  );
}

function DataSection() {
  const ws = useStore((x) => x.workspace);
  const flights = useStore((x) => x.data.flights);
  const wipe = useStore((x) => x.wipeWorkspace);
  const resetDemo = useStore((x) => x.resetDemo);
  const update = useStore((x) => x.updateSettings);
  const toast = useStore((x) => x.toast);
  const [est, setEst] = useState<{ usage: number; quota: number } | null>(null);
  const [confirm, setConfirm] = useState<'personal' | 'demo' | 'onboard' | null>(null);
  useEffect(() => { storageEstimate().then(setEst); }, [flights.length]);
  const mb = (b: number) => `${(b / 1048576).toFixed(1)} MB`;
  return (
    <Section id="data" title="Data" icon={Database}>
      <div className="flex flex-wrap items-center gap-3 py-4">
        <Gauge className="h-4 w-4 text-muted" />
        <div className="flex-1 text-[13px]">{isMemoryOnly() ? <span className="text-warn">This browser is blocking storage, so changes won't survive a reload. Export a backup.</span> : est ? <>Using <span className="mono">{mb(est.usage)}</span> of <span className="mono">{mb(est.quota)}</span> available in this browser</> : 'Stored in this browser (IndexedDB)'}</div>
        <Link to="/reports" className="btn-glass btn-sm"><Download className="h-3.5 w-3.5" />Export & backup</Link>
        <Link to="/reports#import" className="btn-glass btn-sm"><Upload className="h-3.5 w-3.5" />Import</Link>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 py-4">
        <div><div className="text-[13.5px] font-medium">Demo workspace</div><div className="text-[12px] text-muted">Regenerate the fictional demo flights. Your logbook is untouched.</div></div>
        <button className="btn-glass btn-sm" onClick={() => setConfirm('demo')}><RefreshCw className="h-3.5 w-3.5" />Reset demo</button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 py-4">
        <div><div className="text-[13.5px] font-medium">Replay onboarding</div><div className="text-[12px] text-muted">Walk through the welcome steps again. No data changes.</div></div>
        <button className="btn-glass btn-sm" onClick={() => update({ onboarded: false })}>Replay</button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 py-4">
        <div><div className="text-[13.5px] font-medium text-bad">Delete my logbook</div><div className="text-[12px] text-muted">Permanently removes every flight and photo in your personal logbook{useStore.getState().auth.status === 'signedIn' ? ', including the synced copy' : ''}.</div></div>
        <button className="btn-danger btn-sm" onClick={() => setConfirm('personal')}><Trash2 className="h-3.5 w-3.5" />Delete</button>
      </div>
      <ConfirmDialog open={confirm === 'personal'} onOpenChange={(v) => !v && setConfirm(null)} title="Delete your entire logbook?" confirmLabel="Delete everything" body="All personal flights, photos, presets and custom aircraft will be removed. This can't be undone. Download a JSON backup first if you might want them back." onConfirm={async () => { await wipe('personal'); toast({ kind: 'info', title: 'Logbook deleted' }); }} />
      <ConfirmDialog open={confirm === 'demo'} onOpenChange={(v) => !v && setConfirm(null)} title="Reset the demo workspace?" confirmLabel="Reset" danger={false} body="Demo flights are regenerated from scratch. Your personal logbook isn't affected." onConfirm={async () => { await resetDemo(); toast({ kind: 'success', title: 'Demo reset' }); }} />
      {ws === 'demo' && <p className="pb-3 text-[12px] text-warn">You're in the demo workspace. Imports and edits here stay in the demo.</p>}
    </Section>
  );
}

function InstallRow() {
  const [can, setCan] = useState(!!(window as any).__installPrompt);
  const standalone = typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches;
  useEffect(() => { const on = () => setCan(true); window.addEventListener('installable', on); return () => window.removeEventListener('installable', on); }, []);
  return (
    <div className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="min-w-0"><div className="text-[13.5px] font-medium">Install as an app</div><div className="text-[12px] text-muted">{standalone ? 'Flight Log is installed on this device.' : can ? 'Adds Flight Log to your home screen or dock, opening in its own window.' : 'On iPhone/iPad: Share → Add to Home Screen. On desktop Chrome or Edge: the install icon in the address bar.'}</div></div>
      {can && !standalone && <button className="btn-primary btn-sm" onClick={async () => { const p = (window as any).__installPrompt; if (!p) return; p.prompt(); await p.userChoice.catch(() => {}); (window as any).__installPrompt = null; setCan(false); }}>Install</button>}
    </div>
  );
}
