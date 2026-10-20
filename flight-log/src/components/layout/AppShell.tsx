import React, { useEffect, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import * as DM from '@radix-ui/react-dropdown-menu';
import * as Popover from '@radix-ui/react-popover';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, ChevronsLeft, Plus, Search, MoreHorizontal, FlaskConical, User, Upload, LogOut, LogIn, CheckCheck, Trash2, X, AlertTriangle, Cloud, CloudOff, RefreshCw } from 'lucide-react';
import { setAuthChoice } from '../../lib/cloud';
import { NAV } from './nav';
import { cx, PlaneGlyph } from '../ui';
import { useStore } from '../../store/useStore';
import { LogoMark, Wordmark } from './Brand';
import { CommandSearch } from './CommandSearch';
import { Toasts, Celebration } from './Toasts';
import { DateTime } from 'luxon';
import { PROFILE_LABEL } from '../../lib/types';

function readCollapsed() {
  try { return localStorage.getItem('skylog:sidebar') === 'collapsed'; } catch { return false; }
}

export function Logo({ collapsed, size = 38 }: { collapsed?: boolean; size?: number }) {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark size={size} />
      {!collapsed && (
        <div className="leading-none">
          <Wordmark size={22} />
          <div className="mt-1 whitespace-nowrap text-[9.5px] uppercase tracking-[0.2em] text-faint">Aviation logbook</div>
        </div>
      )}
    </div>
  );
}

export function Avatar({ size = 32 }: { size?: number }) {
  const s = useStore((x) => x.settings);
  const initials = (s.displayName || 'Pilot').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  return s.avatar ? (
    <img src={s.avatar} alt="" className="rounded-full object-cover ring-1 ring-white/20" style={{ width: size, height: size }} />
  ) : (
    <div className="grid place-items-center rounded-full bg-gradient-to-br from-accent/60 to-[#1e3a6e] text-[12px] font-semibold ring-1 ring-white/20" style={{ width: size, height: size }} aria-hidden="true">{initials}</div>
  );
}

function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const openForm = useStore((s) => s.openForm);
  return (
    <aside className={cx('fixed inset-y-0 left-0 z-30 hidden md:flex flex-col transition-[width] duration-300', collapsed ? 'w-[84px]' : 'w-[260px]')}>
      <div className="m-3 flex flex-1 flex-col glass-strong rounded-xl3 p-3 overflow-hidden">
        <div className={cx('flex items-center px-1.5 pt-1.5 pb-4', collapsed ? 'justify-center' : 'justify-between')}>
          <NavLink to="/" aria-label="Flight Log overview"><Logo collapsed={collapsed} /></NavLink>
          {!collapsed && <button onClick={onToggle} className="btn-icon btn-ghost h-8 w-8" aria-label="Collapse sidebar"><ChevronsLeft className="h-4 w-4" /></button>}
        </div>
        <button onClick={() => openForm()} className={cx('btn-primary mb-4 h-10', collapsed ? 'px-0' : 'w-full')} aria-label="Log a flight" title="Log a flight (N)">
          <Plus className="h-4 w-4" />{!collapsed && 'Log a flight'}
        </button>
        <nav className="flex flex-col gap-0.5" aria-label="Main">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={'end' in n ? n.end : undefined}
              title={collapsed ? n.label : undefined}
              className={({ isActive }) => cx(
                'group relative flex h-10 items-center gap-3 rounded-xl px-3 text-[13.5px] font-medium transition-colors',
                collapsed && 'justify-center px-0',
                isActive ? 'text-fg' : 'text-muted hover:text-fg hover:bg-white/[0.04]',
              )}
            >
              {({ isActive }) => (
                <>
                  {isActive && <motion.span layoutId="nav-active" className="absolute inset-0 rounded-xl bg-white/[0.08] ring-1 ring-white/[0.1]" transition={{ type: 'spring', bounce: 0.15, duration: 0.45 }} />}
                  <n.icon className={cx('relative h-[18px] w-[18px] shrink-0', isActive && 'text-ice')} />
                  {!collapsed && <span className="relative truncate">{n.label}</span>}
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto pt-3">
          {collapsed ? (
            <button onClick={onToggle} className="btn-icon btn-ghost w-full" aria-label="Expand sidebar"><ChevronsLeft className="h-4 w-4 rotate-180" /></button>
          ) : (
            <WorkspaceSwitch />
          )}
        </div>
      </div>
    </aside>
  );
}

function WorkspaceSwitch() {
  const ws = useStore((s) => s.workspace);
  const setWorkspace = useStore((s) => s.setWorkspace);
  return (
    <div className="well p-1 flex text-[12px]">
      {(['personal', 'demo'] as const).map((w) => (
        <button key={w} onClick={() => setWorkspace(w)} className={cx('flex-1 h-8 rounded-lg font-medium transition', ws === w ? (w === 'demo' ? 'bg-warn/15 text-warn ring-1 ring-warn/30' : 'bg-white/10 text-fg ring-1 ring-white/10') : 'text-muted hover:text-fg')}>
          {w === 'personal' ? 'My logbook' : 'Demo'}
        </button>
      ))}
    </div>
  );
}

function Notifications() {
  const notes = useStore((s) => s.data.notifications);
  const markAllRead = useStore((s) => s.markAllRead);
  const clear = useStore((s) => s.clearNotifications);
  const nav = useNavigate();
  const unread = notes.filter((n) => !n.read).length;
  const [open, setOpen] = useState(false);
  return (
    <Popover.Root open={open} onOpenChange={(v) => { setOpen(v); if (!v) markAllRead(); }}>
      <Popover.Trigger className="btn-icon btn-glass relative" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}>
        <Bell className="h-4 w-4" />
        {unread > 0 && <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] font-semibold num ring-2 ring-ink">{unread}</span>}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={8} className="z-[70] w-[min(360px,calc(100vw-24px))] glass-strong rounded-xl2 p-2 shadow-lift animate-rise">
          <div className="flex items-center justify-between px-2 py-1.5">
            <div className="text-sm font-semibold">Notifications</div>
            <div className="flex gap-1">
              <button className="btn-ghost btn-sm" onClick={markAllRead} disabled={!unread}><CheckCheck className="h-3.5 w-3.5" />Read</button>
              <button className="btn-ghost btn-sm" onClick={clear} disabled={!notes.length} aria-label="Clear notifications"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          </div>
          <div className="max-h-[380px] overflow-y-auto">
            {notes.length === 0 ? (
              <div className="px-3 py-8 text-center text-sm text-muted">You're all caught up. Achievements and import results show up here.</div>
            ) : notes.map((n) => (
              <button key={n.id} onClick={() => { if (n.href) nav(n.href); setOpen(false); markAllRead(); }} className="flex w-full gap-3 rounded-xl px-2.5 py-2.5 text-left hover:bg-white/[0.05]">
                <span className={cx('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.read ? 'bg-white/15' : n.kind === 'warning' ? 'bg-warn' : 'bg-live')} />
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium">{n.title}</span>
                  <span className="block text-[12px] text-muted">{n.body}</span>
                  <span className="mt-0.5 block text-[11px] text-faint">{DateTime.fromISO(n.at).toRelative()}</span>
                </span>
              </button>
            ))}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function ProfileMenu() {
  const s = useStore((x) => x.settings);
  const nav = useNavigate();
  const setWorkspace = useStore((x) => x.setWorkspace);
  const ws = useStore((x) => x.workspace);
  const auth = useStore((x) => x.auth);
  const logout = useStore((x) => x.logout);
  const item = 'flex h-9 cursor-pointer items-center gap-2.5 rounded-lg px-2.5 text-[13px] outline-none data-[highlighted]:bg-white/[0.07]';
  return (
    <DM.Root>
      <DM.Trigger className="rounded-full focus-visible:ring-2 focus-visible:ring-ice/60" aria-label="Profile menu"><Avatar size={36} /></DM.Trigger>
      <DM.Portal>
        <DM.Content align="end" sideOffset={8} className="z-[70] w-60 glass-strong rounded-xl2 p-1.5 shadow-lift animate-rise">
          <div className="flex items-center gap-3 px-2.5 py-2.5">
            <Avatar size={36} />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{s.displayName || 'Pilot'}</div>
              <div className="truncate text-[12px] text-muted">{PROFILE_LABEL[s.profile]}</div>
            </div>
          </div>
          <DM.Separator className="my-1 h-px bg-white/[0.07]" />
          <DM.Item className={item} onSelect={() => nav('/settings')}><User className="h-4 w-4 text-muted" />Profile & settings</DM.Item>
          <DM.Item className={item} onSelect={() => nav('/reports#import')}><Upload className="h-4 w-4 text-muted" />Import flights</DM.Item>
          <DM.Item className={item} onSelect={() => setWorkspace(ws === 'demo' ? 'personal' : 'demo')}><FlaskConical className="h-4 w-4 text-muted" />{ws === 'demo' ? 'Back to my logbook' : 'Open demo workspace'}</DM.Item>
          <DM.Separator className="my-1 h-px bg-white/[0.07]" />
          {auth.status === 'signedIn' ? (
            <>
              <div className="flex items-center gap-2.5 px-2.5 py-2 text-[11.5px] leading-snug text-muted"><Cloud className="h-3.5 w-3.5 shrink-0 text-good" /><span className="min-w-0 truncate">{auth.user?.email}</span></div>
              <DM.Item className={item} onSelect={() => logout()}><LogOut className="h-4 w-4 text-muted" />Sign out</DM.Item>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2.5 px-2.5 py-2 text-[11px] leading-snug text-faint"><CloudOff className="h-3.5 w-3.5 shrink-0" />Not signed in: data stays in this browser.</div>
              <DM.Item className={item} onSelect={() => { setAuthChoice(null); useStore.setState({ auth: { status: 'signedOut', user: null, recovery: false } }); }}><LogIn className="h-4 w-4 text-muted" />Sign in or create account</DM.Item>
            </>
          )}
        </DM.Content>
      </DM.Portal>
    </DM.Root>
  );
}

function TopBar({ onSearch }: { onSearch: () => void }) {
  const openForm = useStore((s) => s.openForm);
  return (
    <header className="sticky top-0 z-20 -mx-4 mb-6 px-4 pt-[max(12px,env(safe-area-inset-top))] pb-3 md:-mx-8 md:px-8 bg-gradient-to-b from-ink via-ink/85 to-transparent">
      <div className="flex items-center gap-2.5">
        <div className="md:hidden"><NavLink to="/" aria-label="Flight Log overview"><Logo collapsed /></NavLink></div>
        <button onClick={onSearch} className="glass flex h-10 min-w-0 flex-1 items-center gap-2.5 rounded-xl px-3.5 text-left text-sm text-faint hover:text-muted transition md:max-w-md">
          <Search className="h-4 w-4 shrink-0" />
          <span className="truncate">Search flights, airports, aircraft…</span>
          <kbd className="ml-auto hidden rounded-md bg-white/[0.06] px-1.5 py-0.5 font-mono text-[11px] text-faint ring-1 ring-white/10 sm:inline">⌘K</kbd>
        </button>
        <div className="ml-auto flex items-center gap-2">
          <SyncBadge />
          <button onClick={() => openForm()} className="btn-primary hidden md:inline-flex lg:hidden" aria-label="Log a flight"><Plus className="h-4 w-4" /></button>
          <Notifications />
          <ProfileMenu />
        </div>
      </div>
    </header>
  );
}

function SyncBadge() {
  const auth = useStore((s) => s.auth);
  const sync = useStore((s) => s.sync);
  const syncNow = useStore((s) => s.syncNow);
  if (auth.status !== 'signedIn') return null;
  const label = sync.state === 'syncing' ? 'Syncing…' : sync.state === 'error' ? 'Sync problem' : 'Synced';
  return (
    <button onClick={() => syncNow()} title={sync.error ?? (sync.lastSync ? `Last synced ${DateTime.fromISO(sync.lastSync).toRelative()}` : 'Sync now')} className={cx('hidden h-9 items-center gap-1.5 rounded-xl px-2.5 text-[12px] ring-1 sm:inline-flex', sync.state === 'error' ? 'text-warn ring-warn/30 bg-warn/10' : 'text-muted ring-white/10 bg-white/[0.04] hover:text-fg')}>
      {sync.state === 'syncing' ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : sync.state === 'error' ? <AlertTriangle className="h-3.5 w-3.5" /> : <Cloud className="h-3.5 w-3.5 text-good" />}{label}
    </button>
  );
}

function MobileNav() {
  const [more, setMore] = useState(false);
  const openForm = useStore((s) => s.openForm);
  const loc = useLocation();
  useEffect(() => setMore(false), [loc.pathname]);
  const main = [NAV[0], NAV[1]];
  const after = [NAV[3]];
  const tab = (n: (typeof NAV)[number]) => (
    <NavLink key={n.to} to={n.to} end={'end' in n ? n.end : undefined} className={({ isActive }) => cx('flex flex-1 flex-col items-center gap-1 py-1.5 text-[10.5px] font-medium', isActive ? 'text-ice' : 'text-muted')}>
      <n.icon className="h-5 w-5" />{n.label.replace('My ', '').replace('Routes & ', '')}
    </NavLink>
  );
  return (
    <>
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 md:hidden px-3 pb-[max(10px,env(safe-area-inset-bottom))]">
        <div className="glass-strong mx-auto flex max-w-md items-center rounded-[22px] px-2 py-1.5">
          {main.map(tab)}
          <button onClick={() => openForm()} className="mx-1 grid h-12 w-12 shrink-0 place-items-center rounded-2xl btn-primary p-0" aria-label="Log a flight"><Plus className="h-5 w-5" /></button>
          {after.map(tab)}
          <button onClick={() => setMore(true)} className={cx('flex flex-1 flex-col items-center gap-1 py-1.5 text-[10.5px] font-medium', more ? 'text-ice' : 'text-muted')} aria-haspopup="dialog" aria-expanded={more}>
            <MoreHorizontal className="h-5 w-5" />More
          </button>
        </div>
      </nav>
      <AnimatePresence>
        {more && (
          <>
            <motion.div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMore(false)} />
            <motion.div role="dialog" aria-label="More pages" className="fixed inset-x-3 bottom-3 z-50 glass-strong rounded-3xl p-3 md:hidden pb-[max(12px,env(safe-area-inset-bottom))]" initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }} transition={{ type: 'spring', bounce: 0.1, duration: 0.4 }}>
              <div className="mb-2 flex items-center justify-between px-2">
                <div className="label">All pages</div>
                <button className="btn-icon btn-ghost h-8 w-8" onClick={() => setMore(false)} aria-label="Close"><X className="h-4 w-4" /></button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {NAV.map((n) => (
                  <NavLink key={n.to} to={n.to} end={'end' in n ? n.end : undefined} className={({ isActive }) => cx('flex flex-col items-center gap-2 rounded-2xl p-3 text-center text-[11.5px] font-medium ring-1', isActive ? 'bg-accent/15 text-ice ring-accent/30' : 'bg-white/[0.04] text-muted ring-white/[0.06]')}>
                    <n.icon className="h-5 w-5" />{n.label}
                  </NavLink>
                ))}
              </div>
              <div className="mt-3"><WorkspaceSwitch /></div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

function DemoBanner() {
  const ws = useStore((s) => s.workspace);
  const setWorkspace = useStore((s) => s.setWorkspace);
  if (ws !== 'demo') return null;
  return (
    <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl2 bg-warn/[0.08] px-4 py-2.5 text-[13px] ring-1 ring-warn/25">
      <span className="rounded-md bg-warn/20 px-1.5 py-0.5 font-mono text-[11px] font-semibold tracking-wider text-warn">DEMO</span>
      <span className="text-fg/90 min-w-0 flex-1">You're exploring a demo workspace of fictional flights. Nothing here touches your own logbook.</span>
      <button className="btn-sm btn-glass" onClick={() => setWorkspace('personal')}>Go to my logbook</button>
    </div>
  );
}

function SaveErrorBanner() {
  const err = useStore((s) => s.saveError);
  if (!err) return null;
  return (
    <div role="alert" className="mb-5 flex items-center gap-3 rounded-xl2 bg-bad/10 px-4 py-2.5 text-[13px] ring-1 ring-bad/30">
      <AlertTriangle className="h-4 w-4 text-bad shrink-0" />
      <span>{err} Export a JSON backup from Reports & Export to keep your data.</span>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [search, setSearch] = useState(false);
  const openForm = useStore((s) => s.openForm);
  const formOpen = useStore((s) => s.form.open);
  const loc = useLocation();
  const toggle = () => {
    setCollapsed((c) => {
      try { localStorage.setItem('skylog:sidebar', c ? 'open' : 'collapsed'); } catch { /* ignore */ }
      return !c;
    });
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target as HTMLElement)?.isContentEditable;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearch(true); }
      else if (!typing && !formOpen && e.key === '/') { e.preventDefault(); setSearch(true); }
      else if (!typing && !formOpen && e.key.toLowerCase() === 'n' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); openForm(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openForm, formOpen]);
  useEffect(() => { window.scrollTo({ top: 0 }); }, [loc.pathname]);

  return (
    <div className="relative min-h-full">
      <div className="sky-backdrop" />
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] btn-primary">Skip to content</a>
      <Sidebar collapsed={collapsed} onToggle={toggle} />
      <div className={cx('relative z-10 transition-[padding] duration-300', collapsed ? 'md:pl-[84px]' : 'md:pl-[260px]')}>
        <main id="main" className="mx-auto max-w-[1440px] pl-[max(16px,env(safe-area-inset-left))] pr-[max(16px,env(safe-area-inset-right))] pb-32 md:px-8 md:pb-16">
          <TopBar onSearch={() => setSearch(true)} />
          <DemoBanner />
          <SaveErrorBanner />
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={loc.pathname} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.22, ease: [0.2, 0.7, 0.2, 1] }}>
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
      <MobileNav />
      <CommandSearch open={search} onOpenChange={setSearch} />
      <Toasts />
      <Celebration />
    </div>
  );
}
