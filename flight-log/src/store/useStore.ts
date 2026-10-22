import { create } from 'zustand';
import type { Friend, AppNotification, CustomAircraft, FilterPreset, Flight, IntegrationState, PhotoRecord, Settings, WorkspaceData, WorkspaceId } from '../lib/types';
import { localRepo as repo, requestPersistence } from './db';
import { loadAirports, loadExtendedAirports, findAirport } from '../lib/airports';
import { loadAirlines } from '../lib/airlines';
import { finalizeFlight, uid, normalizeStoredFlight } from '../lib/flight';
import { evaluateAchievements } from '../lib/achievements';
import { generateDemoFlights } from '../lib/demo';
import { configureSound, sound } from '../lib/sound';
import * as cloud from '../lib/cloud';
import { dupKey } from '../lib/flight';

/** Bring workspace data from any app version (or another device) into the current shape. */
function normalizeWorkspace(raw: any): WorkspaceData {
  const base = emptyWorkspace();
  if (!raw || typeof raw !== 'object') return base;
  const arr = (v: any) => (Array.isArray(v) ? v : []);
  return {
    ...base, ...raw,
    flights: arr(raw.flights).map(normalizeStoredFlight).filter(Boolean) as Flight[],
    presets: arr(raw.presets), notifications: arr(raw.notifications).filter((n: any) => n && typeof n === 'object'),
    achievementsSeen: arr(raw.achievementsSeen).filter((x: any) => typeof x === 'string'),
    integrations: raw.integrations && typeof raw.integrations === 'object' ? raw.integrations : {},
    customAircraft: arr(raw.customAircraft).filter((x: any) => x && typeof x === 'object'),
    friends: arr(raw.friends).filter((x: any) => x && typeof x === 'object' && x.profile && typeof x.profile === 'object'),
  };
}

export const DEFAULT_SETTINGS: Settings = {
  onboarded: false,
  displayName: '',
  avatar: null,
  profile: 'enthusiast',
  homeAirport: '',
  distanceUnit: 'km',
  altitudeUnit: 'ft',
  speedUnit: 'kt',
  timeFormat: '24h',
  dateFormat: 'dd MMM yyyy',
  timeZone: 'local',
  timeEntryZone: 'airport',
  durationFormat: 'hm',
  theme: 'midnight',
  reduceTransparency: false,
  glassLevel: 55,
  defaultCategory: 'real',
  defaultAircraft: '',
  defaultSimulator: 'MSFS 2024',
  dashboardCards: ['flights', 'hours', 'distance', 'airports', 'aircraft', 'routes', 'block', 'airlines', 'month', 'average', 'longest', 'topType'],
  dashboardCharts: ['monthlyHours', 'flightsPerMonth', 'cumulative', 'byType', 'byAirline', 'byCategory', 'topAirports', 'domestic'],
  showPhotos: true,
  privacyHideRegistrations: false,
  privacyHideDatesInShare: false,
  achievementsEnabled: true,
  calendarConvention: 'departure-local',
  simbriefUser: '',
  sounds: true,
  soundVolume: 0.5,
  goals: { yearFlights: null, yearHours: null, monthFlights: null, yearNewAirports: null },
  networkProvider: 'vatsim',
  networkId: '',
  profileHandle: '',
  profileBio: '',
};

/** Merge stored settings over the defaults, dropping values of the wrong type (older versions, other devices). */
function normalizeSettings(...parts: any[]): Settings {
  const out: any = { ...DEFAULT_SETTINGS };
  for (const p of parts) {
    if (!p || typeof p !== 'object') continue;
    for (const [k, v] of Object.entries(p)) {
      const d = (DEFAULT_SETTINGS as any)[k];
      if (v === undefined) continue;
      if (d === null || d === undefined || (Array.isArray(d) ? Array.isArray(v) : typeof v === typeof d)) out[k] = v;
    }
  }
  const g = out.goals && typeof out.goals === 'object' ? out.goals : {};
  const num = (v: any) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);
  out.glassLevel = Math.min(100, Math.max(0, Math.round(Number(out.glassLevel)))); if (!Number.isFinite(out.glassLevel)) out.glassLevel = 55;
  out.goals = { yearFlights: num(g.yearFlights), yearHours: num(g.yearHours), monthFlights: num(g.monthFlights), yearNewAirports: num(g.yearNewAirports) };
  if (out.networkProvider !== 'ivao') out.networkProvider = 'vatsim';
  return out as Settings;
}

const emptyWorkspace = (): WorkspaceData => ({ flights: [], presets: [], notifications: [], achievementsSeen: [], integrations: {}, customAircraft: [] });

export interface Toast { id: string; kind: 'success' | 'error' | 'info'; title: string; body?: string; action?: { label: string; run: () => void } }

interface FormState { open: boolean; flight: Flight | null; mode: 'create' | 'edit' | 'duplicate'; quick?: 'simbrief' | 'paste' | 'scan' | null }

export interface AuthState { status: 'checking' | 'signedOut' | 'signedIn' | 'local'; user: { id: string; email: string } | null; recovery: boolean }
export interface SyncState { state: 'idle' | 'syncing' | 'error'; lastSync: string | null; error: string | null }
export interface SyncConflict { local: WorkspaceData; remote: WorkspaceData | null }

interface State {
  auth: AuthState;
  sync: SyncState;
  conflict: SyncConflict | null;
  ready: boolean;
  bootError: string | null;
  airportsReady: boolean;
  settings: Settings;
  workspace: WorkspaceId;
  data: WorkspaceData;
  toasts: Toast[];
  form: FormState;
  celebrate: { id: number; title: string; sub: string } | null;
  saveError: string | null;

  init(): Promise<void>;
  updateSettings(p: Partial<Settings>): Promise<void>;
  setWorkspace(id: WorkspaceId): Promise<void>;
  saveFlight(f: Flight, opts?: { celebrate?: boolean }): Promise<Flight>;
  importFlights(fs: Flight[], label: string): Promise<number>;
  replaceFlights(fs: Flight[]): Promise<void>;
  deleteFlights(ids: string[]): Promise<Flight[]>;
  restoreFlights(fs: Flight[]): Promise<void>;
  savePreset(name: string, filters: FilterPreset['filters']): Promise<void>;
  deletePreset(id: string): Promise<void>;
  notify(n: Omit<AppNotification, 'id' | 'at' | 'read'>): Promise<void>;
  markAllRead(): Promise<void>;
  clearNotifications(): Promise<void>;
  saveCustomAircraft(a: CustomAircraft): Promise<void>;
  setFriends(mut: (f: Friend[]) => Friend[]): Promise<void>;
  deleteCustomAircraft(id: string): Promise<void>;
  setIntegration(id: string, patch: Partial<IntegrationState>): Promise<void>;
  resetDemo(): Promise<void>;
  wipeWorkspace(id: WorkspaceId): Promise<void>;
  toast(t: Omit<Toast, 'id'>): void;
  dismissToast(id: string): void;
  openForm(flight?: Flight | null, mode?: FormState['mode'], quick?: FormState['quick']): void;
  closeForm(): void;
  putPhoto(dataUrl: string, caption?: string): Promise<string>;
  getPhoto(id: string): Promise<PhotoRecord | undefined>;
  signedIn(session: { user: { id: string; email?: string | null } }): Promise<void>;
  continueLocally(): void;
  logout(): Promise<void>;
  syncNow(): Promise<void>;
  resolveConflict(choice: 'merge' | 'cloud' | 'device'): Promise<void>;
  setRecovery(v: boolean): void;
}

let saveQueue: Promise<unknown> = Promise.resolve();

export const useStore = create<State>((setState, get) => {
  /** Persist the active workspace (serialised to avoid interleaved writes). */
  const cloudPush = (key: 'ws:personal' | 'settings', value: unknown) => {
    const { auth, conflict } = get();
    if (auth.status !== 'signedIn' || !auth.user || conflict) return;
    setState({ sync: { ...get().sync, state: 'syncing' } });
    cloud.pushSoon(auth.user.id, key, value, (err) => setState({ sync: err ? { ...get().sync, state: 'error', error: err } : { state: 'idle', error: null, lastSync: new Date().toISOString() } }));
  };
  const settingsForCloud = (st: Settings) => ({ ...st, avatar: st.avatar && st.avatar.length < 250_000 ? st.avatar : null });
  const persist = (ws: WorkspaceId, data: WorkspaceData) => {
    if (ws === 'personal') cloudPush('ws:personal', data);
    saveQueue = saveQueue
      .then(() => repo.saveWorkspace(ws, data))
      .then(() => { if (get().saveError) setState({ saveError: null }); })
      .catch((e: Error) => setState({ saveError: e.message }));
    return saveQueue;
  };
  const setData = async (mut: (d: WorkspaceData) => WorkspaceData) => {
    const { workspace, data } = get();
    const next = mut(data);
    setState({ data: next });
    await persist(workspace, next);
    return next;
  };

  /** Award newly unlocked achievements (personal workspace only). */
  const checkAchievements = async (silent = false) => {
    const { workspace, data, settings } = get();
    if (!settings.achievementsEnabled) return;
    const states = evaluateAchievements(data.flights).filter((a) => a.unlocked);
    const fresh = states.filter((a) => !data.achievementsSeen.includes(a.def.id));
    if (!fresh.length) return;
    const notes: AppNotification[] = silent || workspace === 'demo' ? [] : fresh.map((a) => ({
      id: uid('n'), kind: 'achievement', title: `Achievement unlocked: ${a.def.title}`, body: a.def.description, at: new Date().toISOString(), read: false, href: '/achievements',
    }));
    await setData((d) => ({ ...d, achievementsSeen: [...d.achievementsSeen, ...fresh.map((a) => a.def.id)], notifications: [...notes, ...d.notifications].slice(0, 60) }));
    if (!silent && workspace !== 'demo') setTimeout(() => sound.achievement(), 900);
    if (!silent && workspace !== 'demo') get().toast({ kind: 'success', title: `Achievement unlocked: ${fresh[0].def.title}`, body: fresh.length > 1 ? `+${fresh.length - 1} more` : fresh[0].def.description });
  };

  const loadWs = async (id: WorkspaceId): Promise<WorkspaceData> => {
    const raw = await repo.loadWorkspace(id);
    let data = normalizeWorkspace(raw);
    if (id === 'demo' && !raw) {
      const flights = generateDemoFlights();
      data = { ...data, flights, achievementsSeen: evaluateAchievements(flights).filter((a) => a.unlocked).map((a) => a.def.id) };
      await repo.saveWorkspace('demo', data);
    }
    return data;
  };

  /** Pull the account's data and reconcile it with what is cached on this device. */
  const syncDown = async (userId: string) => {
    setState({ sync: { ...get().sync, state: 'syncing', error: null } });
    try {
      const [rs, rw] = await Promise.all([cloud.pull<Partial<Settings>>(userId, 'settings'), cloud.pull<Partial<WorkspaceData>>(userId, 'ws:personal')]);
      if (rs) {
        const settings = normalizeSettings(get().settings, rs.value, { onboarded: true });
        configureSound(settings.sounds, settings.soundVolume);
        setState({ settings });
        await repo.saveSettings(settings);
      } else {
        await cloud.push(userId, 'settings', settingsForCloud(get().settings));
      }
      const local = ((await repo.loadWorkspace('personal')) ?? emptyWorkspace()) as WorkspaceData;
      const localFull = normalizeWorkspace(local);
      const remote = rw ? normalizeWorkspace(rw.value) : null;
      let syncedUser: string | null = null;
      try { syncedUser = localStorage.getItem('skylog:synced-user'); } catch { /* ignore */ }
      const localOwned = syncedUser === userId;
      if (!localOwned && localFull.flights.length > 0) {
        // device has flights that were never synced to this account → let the person choose
        setState({ conflict: { local: localFull, remote }, sync: { ...get().sync, state: 'idle' } });
        return;
      }
      const data = remote ?? localFull;
      if (!remote) await cloud.push(userId, 'ws:personal', data);
      await repo.saveWorkspace('personal', data);
      try { localStorage.setItem('skylog:synced-user', userId); } catch { /* ignore */ }
      if (get().workspace === 'personal') setState({ data });
      setState({ sync: { state: 'idle', error: null, lastSync: new Date().toISOString() } });
    } catch (e) {
      setState({ sync: { ...get().sync, state: 'error', error: (e as Error).message } });
    }
  };

  return {
    auth: { status: 'checking', user: null, recovery: false },
    sync: { state: 'idle', lastSync: null, error: null },
    conflict: null,
    ready: false,
    bootError: null,
    airportsReady: false,
    settings: DEFAULT_SETTINGS,
    workspace: 'personal',
    data: emptyWorkspace(),
    toasts: [],
    form: { open: false, flight: null, mode: 'create' },
    celebrate: null,
    saveError: null,

    async init() {
      try {
        loadAirlines();
        const [s, ws] = await Promise.all([repo.loadSettings(), repo.getActiveWorkspace()]);
        const settings = normalizeSettings(s);
        configureSound(settings.sounds, settings.soundVolume);
        await loadAirports();
        setState({ airportsReady: true });
        const workspace: WorkspaceId = ws === 'demo' ? 'demo' : 'personal';
        const data = await loadWs(workspace);
        // flights referencing small airfields need the extended dataset
        if (data.flights.some((f) => (f.dep && !findAirport(f.dep.ident)) || (f.arr && !findAirport(f.arr.ident)))) loadExtendedAirports();
        setState({ settings, workspace, data });
        // accounts
        if (cloud.cloudConfig()) {
          const session = await cloud.currentSession();
          if (session) await get().signedIn(session);
          else setState({ auth: { status: cloud.getAuthChoice() === 'local' ? 'local' : 'signedOut', user: null, recovery: false } });
          cloud.onAuthChange((sess, event) => {
            if (event === 'PASSWORD_RECOVERY') setState({ auth: { ...get().auth, recovery: true } });
            if (event === 'SIGNED_IN' && sess && get().auth.user?.id !== sess.user.id) get().signedIn(sess);
            if (event === 'SIGNED_OUT' && get().auth.status === 'signedIn') setState({ auth: { status: 'signedOut', user: null, recovery: false } });
          });
        } else {
          setState({ auth: { status: cloud.getAuthChoice() === 'local' ? 'local' : 'signedOut', user: null, recovery: false } });
        }
        setState({ ready: true });
        requestPersistence();
      } catch (e) {
        setState({ bootError: (e as Error).message || 'Flight Log could not start.' });
      }
    },

    async updateSettings(p) {
      const settings = { ...get().settings, ...p };
      configureSound(settings.sounds, settings.soundVolume);
      setState({ settings });
      try { await repo.saveSettings(settings); } catch (e) { setState({ saveError: (e as Error).message }); }
      cloudPush('settings', settingsForCloud(settings));
    },

    async setWorkspace(id) {
      if (id === get().workspace) return;
      await saveQueue;
      const data = await loadWs(id);
      setState({ workspace: id, data });
      await repo.setActiveWorkspace(id).catch(() => {});
    },

    async saveFlight(f, opts) {
      const fin = finalizeFlight(f);
      await setData((d) => {
        const i = d.flights.findIndex((x) => x.id === fin.id);
        const flights = i >= 0 ? d.flights.map((x) => (x.id === fin.id ? fin : x)) : [...d.flights, { ...fin, createdAt: new Date().toISOString() }];
        return { ...d, flights };
      });
      if (opts?.celebrate) {
        sound.logged();
        setState({ celebrate: { id: Date.now(), title: 'Flight logged', sub: `${fin.dep?.iata || fin.dep?.ident || '—'} → ${fin.arr?.iata || fin.arr?.ident || '—'}` } });
      }
      await checkAchievements();
      return fin;
    },

    async importFlights(fs, label) {
      if (!fs.length) return 0;
      await setData((d) => ({ ...d, flights: [...d.flights, ...fs] }));
      await get().notify({ kind: 'import', title: `Imported ${fs.length} flight${fs.length === 1 ? '' : 's'}`, body: label, href: '/flights' });
      await checkAchievements();
      return fs.length;
    },

    async replaceFlights(fs) {
      await setData((d) => ({ ...d, flights: fs, achievementsSeen: [] }));
      await checkAchievements(true);
    },

    async deleteFlights(ids) {
      const set = new Set(ids);
      const removed = get().data.flights.filter((f) => set.has(f.id));
      await setData((d) => ({ ...d, flights: d.flights.filter((f) => !set.has(f.id)) }));
      return removed;
    },

    async restoreFlights(fs) {
      await setData((d) => {
        const ids = new Set(d.flights.map((f) => f.id));
        return { ...d, flights: [...d.flights, ...fs.filter((f) => !ids.has(f.id))] };
      });
    },

    async savePreset(name, filters) {
      await setData((d) => ({ ...d, presets: [...d.presets, { id: uid('p'), name, filters }] }));
    },
    async deletePreset(id) {
      await setData((d) => ({ ...d, presets: d.presets.filter((p) => p.id !== id) }));
    },

    async notify(n) {
      await setData((d) => ({ ...d, notifications: [{ ...n, id: uid('n'), at: new Date().toISOString(), read: false }, ...d.notifications].slice(0, 60) }));
    },
    async markAllRead() {
      if (!get().data.notifications.some((n) => !n.read)) return;
      await setData((d) => ({ ...d, notifications: d.notifications.map((n) => ({ ...n, read: true })) }));
    },
    async clearNotifications() {
      await setData((d) => ({ ...d, notifications: [] }));
    },

    async setFriends(mut) {
      await setData((d) => ({ ...d, friends: mut(d.friends ?? []) }));
    },

    async saveCustomAircraft(a) {
      await setData((d) => {
        const i = d.customAircraft.findIndex((x) => x.id === a.id);
        return { ...d, customAircraft: i >= 0 ? d.customAircraft.map((x) => (x.id === a.id ? a : x)) : [...d.customAircraft, a] };
      });
    },
    async deleteCustomAircraft(id) {
      await setData((d) => ({ ...d, customAircraft: d.customAircraft.filter((x) => x.id !== id) }));
    },

    async setIntegration(id, patch) {
      await setData((d) => ({ ...d, integrations: { ...d.integrations, [id]: { ...({ id, lastSync: null, lastError: null } as IntegrationState), ...d.integrations[id], ...patch } } }));
    },

    async resetDemo() {
      await repo.clearWorkspace('demo');
      const data = await loadWs('demo');
      if (get().workspace === 'demo') setState({ data });
    },

    async wipeWorkspace(id) {
      if (id === 'demo') return get().resetDemo();
      const ws = await repo.loadWorkspace('personal');
      for (const f of ws?.flights ?? []) for (const p of f.photos) await repo.deletePhoto(p);
      await repo.saveWorkspace('personal', emptyWorkspace());
      cloudPush('ws:personal', emptyWorkspace());
      if (get().workspace === 'personal') setState({ data: emptyWorkspace() });
    },

    toast(t) {
      const id = uid('t');
      setState({ toasts: [...get().toasts, { ...t, id }].slice(-4) });
      setTimeout(() => get().dismissToast(id), t.action ? 7000 : 4200);
    },
    dismissToast(id) {
      setState({ toasts: get().toasts.filter((t) => t.id !== id) });
    },
    openForm(flight = null, mode = 'create', quick = null) {
      setState({ form: { open: true, flight, mode, quick } });
    },
    closeForm() {
      setState({ form: { ...get().form, open: false } });
    },
    async putPhoto(dataUrl, caption = '') {
      const id = uid('ph');
      await repo.putPhoto({ id, dataUrl, caption, createdAt: new Date().toISOString() });
      return id;
    },
    getPhoto: (id) => repo.getPhoto(id),

    async signedIn(session) {
      const user = { id: session.user.id, email: session.user.email ?? '' };
      cloud.setAuthChoice(null);
      setState({ auth: { status: 'signedIn', user, recovery: get().auth.recovery } });
      await syncDown(user.id);
    },
    continueLocally() {
      cloud.setAuthChoice('local');
      setState({ auth: { status: 'local', user: null, recovery: false } });
    },
    async logout() {
      const { auth, data, workspace } = get();
      if (auth.user && !get().conflict) {
        // flush pending changes before leaving
        try {
          const ws = workspace === 'personal' ? data : ((await repo.loadWorkspace('personal')) as WorkspaceData | undefined);
          if (ws) await cloud.push(auth.user.id, 'ws:personal', ws);
        } catch { /* best effort */ }
      }
      await cloud.signOut();
      // the account's data lives in the cloud; clear this device's copy for privacy
      await repo.saveWorkspace('personal', emptyWorkspace());
      try { localStorage.removeItem('skylog:synced-user'); } catch { /* ignore */ }
      setState({ auth: { status: 'signedOut', user: null, recovery: false }, conflict: null, sync: { state: 'idle', lastSync: null, error: null } });
      if (get().workspace === 'personal') setState({ data: emptyWorkspace() });
    },
    async syncNow() {
      const u = get().auth.user;
      if (!u) return;
      setState({ sync: { ...get().sync, state: 'syncing', error: null } });
      try {
        await saveQueue;
        const ws = get().workspace === 'personal' ? get().data : ((await repo.loadWorkspace('personal')) as WorkspaceData);
        await cloud.push(u.id, 'ws:personal', ws);
        await cloud.push(u.id, 'settings', settingsForCloud(get().settings));
        setState({ sync: { state: 'idle', error: null, lastSync: new Date().toISOString() } });
      } catch (e) {
        setState({ sync: { ...get().sync, state: 'error', error: (e as Error).message } });
      }
    },
    async resolveConflict(choice) {
      const c = get().conflict, u = get().auth.user;
      if (!c || !u) return;
      let data: WorkspaceData;
      if (choice === 'cloud') data = c.remote ?? emptyWorkspace();
      else if (choice === 'device') data = c.local;
      else {
        const base = c.remote ?? emptyWorkspace();
        const ids = new Set(base.flights.map((f) => f.id)), keys = new Set(base.flights.map(dupKey));
        data = { ...base, flights: [...base.flights, ...c.local.flights.filter((f) => !ids.has(f.id) && !keys.has(dupKey(f)))], customAircraft: [...base.customAircraft, ...c.local.customAircraft.filter((a) => !base.customAircraft.some((b) => b.id === a.id))], presets: [...base.presets, ...c.local.presets.filter((a) => !base.presets.some((b) => b.id === a.id))] };
      }
      setState({ conflict: null });
      await repo.saveWorkspace('personal', data);
      try { localStorage.setItem('skylog:synced-user', u.id); } catch { /* ignore */ }
      if (get().workspace === 'personal') setState({ data });
      try {
        await cloud.push(u.id, 'ws:personal', data);
        setState({ sync: { state: 'idle', error: null, lastSync: new Date().toISOString() } });
      } catch (e) {
        setState({ sync: { ...get().sync, state: 'error', error: (e as Error).message } });
      }
    },
    setRecovery(v) {
      setState({ auth: { ...get().auth, recovery: v } });
    },
  };
});

/** Personal or demo — used for banners and labelling. */
export const useIsDemo = () => useStore((s) => s.workspace === 'demo');
