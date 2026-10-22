import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Mail, Lock, ArrowRight, Laptop, Cloud, KeyRound, CheckCircle2, AlertTriangle, Settings2, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { useStore } from '../store/useStore';
import * as cloud from '../lib/cloud';
import { Dialog, Photo, cx } from '../components/ui';
import { Logo } from '../components/layout/AppShell';
import { Banner, LogoMark } from '../components/layout/Brand';
import { PHOTOS } from '../lib/images';
import { sound } from '../lib/sound';
import { plural } from '../lib/units';

type Mode = 'signin' | 'signup' | 'magic' | 'reset';

export default function AuthScreen() {
  const continueLocally = useStore((s) => s.continueLocally);
  const signedIn = useStore((s) => s.signedIn);
  const configured = !!cloud.cloudConfig();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [setup, setSetup] = useState(false);

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const pwOk = password.length >= 8;
  const canSubmit = emailOk && (mode === 'magic' || mode === 'reset' || pwOk);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || busy) return;
    setBusy(true); setErr(null); setInfo(null);
    try {
      if (mode === 'signin') { const s = await cloud.signIn(email.trim(), password); if (s) { sound.success(); await signedIn(s); } }
      else if (mode === 'signup') {
        const r = await cloud.signUp(email.trim(), password);
        if (r.session) { sound.success(); await signedIn(r.session); }
        else setInfo(`We sent a confirmation link to ${email.trim()}. Open it on this device to finish creating your account.`);
      } else if (mode === 'magic') { await cloud.magicLink(email.trim()); setInfo(`Check ${email.trim()} for a sign-in link. It opens Flight Log already signed in.`); }
      else { await cloud.resetPassword(email.trim()); setInfo(`If an account exists for ${email.trim()}, a reset link is on its way.`); }
    } catch (e) {
      sound.warn();
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const titles: Record<Mode, [string, string]> = {
    signin: ['Welcome back', 'Sign in to your logbook.'],
    signup: ['Create your account', 'Your flights sync securely across every device.'],
    magic: ['Email me a link', 'Sign in without a password.'],
    reset: ['Reset password', 'We’ll email you a link to choose a new one.'],
  };

  return (
    <div className="relative min-h-[100dvh] overflow-hidden">
      <Photo photo={PHOTOS.cockpitNight} className="fixed inset-0" priority sizes="100vw" overlay={false} />
      <div className="fixed inset-0 bg-gradient-to-br from-ink/95 via-ink/80 to-ink/40" />
      <div className="relative mx-auto grid min-h-[100dvh] max-w-6xl items-center gap-10 px-5 py-10 md:grid-cols-[1.1fr_1fr] md:px-10">
        <div className="hidden md:block">
          <Banner className="aspect-[1030/345] w-full max-w-[560px]" />
          <h1 className="mt-8 text-[40px] font-semibold leading-[1.05] tracking-[-0.03em] text-balance">Every flight tells a story.</h1>
          <p className="mt-5 max-w-md text-[15px] leading-relaxed text-muted">A private logbook for the flights you take, fly and simulate, with real airports, great-circle routes and honest statistics.</p>
          <ul className="mt-8 flex flex-col gap-3 text-[13.5px] text-fg/85">
            {['Private by default: your rows are locked to your account', 'Sync across phone, tablet and desktop', 'Export everything as CSV or JSON, any time'].map((t) => <li key={t} className="flex items-center gap-2.5"><ShieldCheck className="h-4 w-4 text-ice" />{t}</li>)}
          </ul>
        </div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="glass-strong mx-auto w-full max-w-md rounded-[28px] p-6 shadow-lift md:p-8">
          <div className="mb-6 md:hidden"><Banner className="aspect-[1030/345] w-full" /></div>
          {configured ? (
            <>
              <AnimatePresence mode="wait">
                <motion.div key={mode} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.2 }}>
                  <h2 className="text-[24px] font-semibold tracking-tight">{titles[mode][0]}</h2>
                  <p className="mt-1 text-[13.5px] text-muted">{titles[mode][1]}</p>
                </motion.div>
              </AnimatePresence>
              {mode !== 'reset' && mode !== 'magic' && (
                <div className="mt-5 grid grid-cols-2 rounded-xl bg-deep/70 p-1 ring-1 ring-white/[0.07]" role="tablist">
                  {(['signin', 'signup'] as const).map((m) => <button key={m} role="tab" aria-selected={mode === m} onClick={() => { setMode(m); setErr(null); setInfo(null); }} className={cx('h-9 rounded-lg text-[13px] font-medium transition', mode === m ? 'bg-white/10 text-fg ring-1 ring-white/10' : 'text-muted hover:text-fg')}>{m === 'signin' ? 'Sign in' : 'Create account'}</button>)}
                </div>
              )}
              <form onSubmit={submit} className="mt-5 flex flex-col gap-3" noValidate>
                <label className="relative block">
                  <span className="sr-only">Email</span>
                  <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
                  <input type="email" autoComplete="email" required className="input h-12 pl-10 text-[15px]" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
                </label>
                {(mode === 'signin' || mode === 'signup') && (
                  <label className="relative block">
                    <span className="sr-only">Password</span>
                    <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
                    <input type={show ? 'text' : 'password'} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} required minLength={8} className="input h-12 pl-10 pr-11 text-[15px]" placeholder={mode === 'signup' ? 'At least 8 characters' : 'Password'} value={password} onChange={(e) => setPassword(e.target.value)} />
                    <button type="button" className="btn-icon btn-ghost absolute right-1.5 top-1/2 h-9 w-9 -translate-y-1/2" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'}>{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
                  </label>
                )}
                {mode === 'signup' && password && !pwOk && <p className="text-[12px] text-warn">Use at least 8 characters.</p>}
                {err && <div role="alert" className="flex gap-2 rounded-xl bg-bad/10 p-3 text-[12.5px] text-bad ring-1 ring-bad/25"><AlertTriangle className="h-4 w-4 shrink-0" />{err}</div>}
                {info && <div role="status" className="flex gap-2 rounded-xl bg-good/10 p-3 text-[12.5px] text-good ring-1 ring-good/25"><CheckCircle2 className="h-4 w-4 shrink-0" />{info}</div>}
                <button type="submit" className="btn-primary mt-1 h-12 text-[15px]" disabled={!canSubmit || busy}>
                  {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : mode === 'magic' ? 'Send sign-in link' : 'Send reset link'}{!busy && <ArrowRight className="h-4 w-4" />}
                </button>
              </form>
              <div className="mt-4 flex flex-wrap justify-between gap-2 text-[12.5px]">
                {mode === 'signin' ? <button className="link" onClick={() => { setMode('reset'); setErr(null); setInfo(null); }}>Forgot password?</button> : <button className="link" onClick={() => { setMode('signin'); setErr(null); setInfo(null); }}>Back to sign in</button>}
                {mode !== 'magic' && <button className="link" onClick={() => { setMode('magic'); setErr(null); setInfo(null); }}>Email me a sign-in link</button>}
              </div>
              <div className="my-6 flex items-center gap-3 text-[11px] uppercase tracking-[0.14em] text-faint"><span className="h-px flex-1 bg-white/10" />or<span className="h-px flex-1 bg-white/10" /></div>
              <button className="btn-glass h-11 w-full" onClick={continueLocally}><Laptop className="h-4 w-4" />Continue without an account</button>
              <p className="mt-2 text-center text-[11.5px] text-faint">Flights then stay only in this browser. You can sign in later from Settings.</p>
            </>
          ) : (
            <>
              <h2 className="text-[24px] font-semibold tracking-tight">Welcome to Flight Log</h2>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">Cloud accounts aren't switched on for this copy of Flight Log yet. You can start right away on this device, and connect accounts later.</p>
              <button className="btn-primary mt-6 h-12 w-full text-[15px]" onClick={continueLocally}><Laptop className="h-4 w-4" />Continue on this device</button>
              <div className="mt-4 rounded-xl2 bg-white/[0.03] p-4 ring-1 ring-white/[0.07]">
                <div className="flex items-center gap-2 text-[13.5px] font-medium"><Cloud className="h-4 w-4 text-ice" />Want sign-in and sync?</div>
                <p className="mt-1 text-[12.5px] leading-relaxed text-muted">Flight Log uses Supabase for secure accounts. The site owner adds two keys when publishing (see README), or you can paste your own project's keys here.</p>
                <button className="btn-glass btn-sm mt-3" onClick={() => setSetup(true)}><Settings2 className="h-3.5 w-3.5" />Connect a Supabase project</button>
              </div>
            </>
          )}
        </motion.div>
      </div>
      <CloudSetupDialog open={setup} onOpenChange={setSetup} />
    </div>
  );
}

export function CloudSetupDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const cur = cloud.cloudConfig();
  const [url, setUrl] = useState(cur?.url ?? '');
  const [key, setKey] = useState(cur?.source === 'device' ? cur.anonKey : '');
  const ok = /^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/i.test(url.trim().replace(/\/$/, '')) || /^https:\/\/.+/.test(url.trim());
  const keyOk = key.trim().split('.').length === 3 || key.trim().startsWith('sb_publishable_');
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Connect a Supabase project" description="Paste your project URL and its anon (public) key. Find both in Supabase → Project Settings → API." footer={<>
      {cur?.source === 'device' && <button className="btn-ghost mr-auto" onClick={() => { cloud.clearDeviceConfig(); location.reload(); }}>Disconnect</button>}
      <button className="btn-glass" onClick={() => onOpenChange(false)}>Cancel</button>
      <button className="btn-primary" disabled={!ok || !keyOk} onClick={() => { cloud.saveDeviceConfig(url, key); location.reload(); }}><KeyRound className="h-4 w-4" />Save & reload</button>
    </>}>
      <div className="flex flex-col gap-3">
        <label className="text-[12px] text-muted">Project URL<input className="input mono mt-1" placeholder="https://abcd1234.supabase.co" value={url} onChange={(e) => setUrl(e.target.value)} /></label>
        <label className="text-[12px] text-muted">Anon / publishable key<textarea rows={3} className="input mono mt-1 text-[11.5px] break-all" placeholder="eyJhbGciOi…" value={key} onChange={(e) => setKey(e.target.value)} /></label>
        <ol className="list-decimal space-y-1 pl-5 text-[12.5px] text-muted">
          <li>Create a free project at supabase.com.</li>
          <li>In the SQL editor, run <span className="mono text-ice">supabase/schema.sql</span> from the Flight Log download.</li>
          <li>Under Authentication → URL Configuration, set the Site URL to this page's address.</li>
          <li>Paste the URL and anon key here. Never paste the <em>service_role</em> key.</li>
        </ol>
        {cur?.source === 'build' && <p className="text-[12px] text-good">This site already has cloud accounts configured at build time.</p>}
      </div>
    </Dialog>
  );
}

/** Global dialogs: unsynced-device conflict and password recovery. */
export function AccountDialogs() {
  const conflict = useStore((s) => s.conflict);
  const resolve = useStore((s) => s.resolveConflict);
  const auth = useStore((s) => s.auth);
  const setRecovery = useStore((s) => s.setRecovery);
  const toast = useStore((s) => s.toast);
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <>
      <Dialog open={!!conflict} onOpenChange={() => {}} title="Flights on this device" description={`Signed in as ${auth.user?.email}`} size="sm">
        {conflict && (
          <div className="flex flex-col gap-3">
            <p className="text-[13.5px] text-muted">This browser has <span className="text-fg">{plural(conflict.local.flights.length, 'flight')}</span> that aren't in your account yet. Your account has <span className="text-fg">{conflict.remote?.flights.length ?? 0}</span>.</p>
            <button className="btn-primary h-11" onClick={() => resolve('merge')}>Merge both (recommended)</button>
            <button className="btn-glass h-11" onClick={() => resolve('cloud')}>Use my account's flights only</button>
            <button className="btn-glass h-11" onClick={() => resolve('device')}>Replace account with this device's flights</button>
            <p className="text-[11.5px] text-faint">Merging skips duplicates (same date, route and flight number).</p>
          </div>
        )}
      </Dialog>
      <Dialog open={auth.recovery} onOpenChange={(v) => setRecovery(v)} title="Choose a new password" size="sm" footer={<button className="btn-primary" disabled={pw.length < 8 || busy} onClick={async () => { setBusy(true); try { await cloud.updatePassword(pw); setRecovery(false); toast({ kind: 'success', title: 'Password updated' }); } catch (e) { toast({ kind: 'error', title: 'Could not update password', body: (e as Error).message }); } finally { setBusy(false); } }}>Save password</button>}>
        <input type="password" autoComplete="new-password" className="input h-11" placeholder="At least 8 characters" value={pw} onChange={(e) => setPw(e.target.value)} aria-label="New password" />
      </Dialog>
    </>
  );
}
