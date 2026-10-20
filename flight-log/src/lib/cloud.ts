// Optional cloud accounts via Supabase (Auth + Postgres with row-level security).
// Configure with VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY at build time, or paste
// the two values in the sign-in screen. The anon key is designed to be public;
// every row is protected by RLS so users can only ever read their own data.
import { createClient, type SupabaseClient, type Session } from '@supabase/supabase-js';

export interface CloudConfig { url: string; anonKey: string; source: 'build' | 'device' }
const LS_KEY = 'skylog:cloud-config';
const CHOICE_KEY = 'skylog:auth-choice';
export const TABLE = 'skylog_data';

export function cloudConfig(): CloudConfig | null {
  const env = (import.meta as any).env ?? {};
  if (env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY) return { url: env.VITE_SUPABASE_URL, anonKey: env.VITE_SUPABASE_ANON_KEY, source: 'build' };
  try {
    const v = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
    if (v?.url && v?.anonKey) return { ...v, source: 'device' };
  } catch { /* ignore */ }
  return null;
}
export function saveDeviceConfig(url: string, anonKey: string) {
  try { localStorage.setItem(LS_KEY, JSON.stringify({ url: url.trim().replace(/\/$/, ''), anonKey: anonKey.trim() })); } catch { /* ignore */ }
  client = null;
}
export function clearDeviceConfig() {
  try { localStorage.removeItem(LS_KEY); } catch { /* ignore */ }
  client = null;
}
export function getAuthChoice(): 'local' | null {
  try { return localStorage.getItem(CHOICE_KEY) === 'local' ? 'local' : null; } catch { return null; }
}
export function setAuthChoice(v: 'local' | null) {
  try { v ? localStorage.setItem(CHOICE_KEY, v) : localStorage.removeItem(CHOICE_KEY); } catch { /* ignore */ }
}

let client: SupabaseClient | null = null;
export function supa(): SupabaseClient | null {
  const c = cloudConfig();
  if (!c) return null;
  if (!client) {
    if (!/^https:\/\/.+/.test(c.url)) return null;
    client = createClient(c.url, c.anonKey, { auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'skylog-auth' } });
  }
  return client;
}

export async function currentSession(): Promise<Session | null> {
  const c = supa();
  if (!c) return null;
  try {
    const { data } = await c.auth.getSession();
    // remove ?code= left by the PKCE redirect so the hash router stays clean
    if (location.search.includes('code=')) history.replaceState(null, '', location.pathname + location.hash);
    return data.session;
  } catch {
    return null;
  }
}

const redirectTo = () => location.origin + location.pathname;

export async function signIn(email: string, password: string) {
  const c = supa(); if (!c) throw new Error('Cloud accounts are not configured.');
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw new Error(friendly(error.message));
  return data.session;
}
export async function signUp(email: string, password: string) {
  const c = supa(); if (!c) throw new Error('Cloud accounts are not configured.');
  const { data, error } = await c.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo() } });
  if (error) throw new Error(friendly(error.message));
  return { session: data.session, needsConfirm: !data.session };
}
export async function magicLink(email: string) {
  const c = supa(); if (!c) throw new Error('Cloud accounts are not configured.');
  const { error } = await c.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo() } });
  if (error) throw new Error(friendly(error.message));
}
export async function resetPassword(email: string) {
  const c = supa(); if (!c) throw new Error('Cloud accounts are not configured.');
  const { error } = await c.auth.resetPasswordForEmail(email, { redirectTo: redirectTo() });
  if (error) throw new Error(friendly(error.message));
}
export async function updatePassword(password: string) {
  const c = supa(); if (!c) throw new Error('Cloud accounts are not configured.');
  const { error } = await c.auth.updateUser({ password });
  if (error) throw new Error(friendly(error.message));
}
export async function signOut() {
  await supa()?.auth.signOut().catch(() => {});
}
export function onAuthChange(fn: (s: Session | null, event: string) => void) {
  const c = supa();
  if (!c) return () => {};
  const { data } = c.auth.onAuthStateChange((event, s) => fn(s, event));
  return () => data.subscription.unsubscribe();
}

function friendly(m: string) {
  if (/Invalid login/i.test(m)) return 'That email and password don’t match an account.';
  if (/Email not confirmed/i.test(m)) return 'Confirm your email first — check your inbox for the link.';
  if (/Password should be/i.test(m)) return 'Use a password of at least 8 characters.';
  if (/rate limit/i.test(m)) return 'Too many attempts. Wait a minute and try again.';
  if (/Failed to fetch|NetworkError/i.test(m)) return 'Can’t reach the sign-in service. Check your connection and the project URL.';
  return m;
}

// ── Data sync ───────────────────────────────────────────────────────────────
export async function pull<T>(userId: string, key: string): Promise<{ value: T; updatedAt: string } | null> {
  const c = supa(); if (!c) return null;
  const { data, error } = await c.from(TABLE).select('value, updated_at').eq('user_id', userId).eq('key', key).maybeSingle();
  if (error) throw new Error(tableHint(error.message));
  return data ? { value: data.value as T, updatedAt: data.updated_at } : null;
}
export async function push(userId: string, key: string, value: unknown) {
  const c = supa(); if (!c) return;
  const { error } = await c.from(TABLE).upsert({ user_id: userId, key, value, updated_at: new Date().toISOString() }, { onConflict: 'user_id,key' });
  if (error) throw new Error(tableHint(error.message));
}
export async function deleteAllCloudData(userId: string) {
  const c = supa(); if (!c) return;
  const { error } = await c.from(TABLE).delete().eq('user_id', userId);
  if (error) throw new Error(tableHint(error.message));
}
function tableHint(m: string) {
  if (/relation .* does not exist|Could not find the table/i.test(m)) return 'The skylog_data table is missing. Run supabase/schema.sql in your Supabase SQL editor.';
  if (/JWT|expired/i.test(m)) return 'Your session expired. Sign in again.';
  return m;
}

/** Debounced uploader so rapid edits become one write. */
const timers = new Map<string, ReturnType<typeof setTimeout>>();
export function pushSoon(userId: string, key: string, value: unknown, onDone: (err: string | null) => void, delay = 900) {
  clearTimeout(timers.get(key));
  timers.set(key, setTimeout(() => {
    push(userId, key, value).then(() => onDone(null), (e: Error) => onDone(e.message));
  }, delay));
}
