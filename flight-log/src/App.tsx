import React, { Suspense, useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { ErrorBoundary, lazyPage } from './components/ErrorBoundary';
import { useStore } from './store/useStore';
import { AppShell, Logo } from './components/layout/AppShell';
import { FlightForm } from './components/flight/FlightForm';
import { Skeleton } from './components/ui';
import Overview from './pages/Overview';
import Onboarding from './pages/Onboarding';
import AuthScreen, { AccountDialogs } from './pages/Auth';

const Flights = lazyPage(() => import('./pages/Flights'));
const FlightDetail = lazyPage(() => import('./pages/FlightDetail'));
const Analytics = lazyPage(() => import('./pages/Analytics'));
const MapPage = lazyPage(() => import('./pages/MapPage'));
const Live = lazyPage(() => import('./pages/Live'));
const Friends = lazyPage(() => import('./pages/Friends'));
const ProfileLink = lazyPage(() => import('./pages/Friends').then((m) => ({ default: m.ProfileLinkPage })));
const Aircraft = lazyPage(() => import('./pages/Aircraft'));
const AircraftDetail = lazyPage(() => import('./pages/AircraftDetail'));
const Airports = lazyPage(() => import('./pages/Airports'));
const AirportDetail = lazyPage(() => import('./pages/AirportDetail'));
const CalendarPage = lazyPage(() => import('./pages/Calendar'));
const Achievements = lazyPage(() => import('./pages/Achievements'));
const Reports = lazyPage(() => import('./pages/Reports'));
const SettingsPage = lazyPage(() => import('./pages/Settings'));
const NotFound = lazyPage(() => import('./pages/NotFound'));

function PageSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-10 w-72" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl2" />)}</div>
      <Skeleton className="h-80 rounded-xl2" />
    </div>
  );
}

function Boot() {
  const err = useStore((s) => s.bootError);
  return (
    <div className="grid min-h-full place-items-center px-6">
      <div className="sky-backdrop" />
      <div className="relative flex flex-col items-center gap-6 text-center">
        <Logo />
        {err ? (
          <div className="max-w-sm">
            <p className="text-sm text-bad">{err}</p>
            <p className="mt-2 text-[13px] text-muted">Check your connection and reload. If you opened index.html directly from disk, serve the folder instead (see README).</p>
            <button className="btn-primary mt-4" onClick={() => location.reload()}>Reload</button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div className="h-1 w-40 overflow-hidden rounded-full bg-white/10"><div className="h-full w-1/3 animate-[shimmer_1.2s_infinite] rounded-full bg-gradient-to-r from-transparent via-ice to-transparent" style={{ transform: 'translateX(-100%)' }} /></div>
            <p className="text-[12px] tracking-wide text-faint">Loading airports and your logbook…</p>
          </div>
        )}
      </div>
    </div>
  );
}

function RouteBoundary({ children }: { children: React.ReactNode }) {
  const loc = useLocation();
  return <ErrorBoundary resetKey={loc.pathname}>{children}</ErrorBoundary>;
}

export default function App() {
  const ready = useStore((s) => s.ready);
  const init = useStore((s) => s.init);
  const onboarded = useStore((s) => s.settings.onboarded);
  const authStatus = useStore((s) => s.auth.status);
  const theme = useStore((s) => s.settings.theme);
  const reduceT = useStore((s) => s.settings.reduceTransparency);
  useEffect(() => { init(); }, [init]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.transparency = reduceT ? 'reduced' : 'full';
  }, [theme, reduceT]);

  if (!ready) return <Boot />;
  if (authStatus === 'signedOut' || authStatus === 'checking') return <AuthScreen />;
  if (!onboarded) return <><Onboarding /><AccountDialogs /></>;
  return (
    <AppShell>
      <RouteBoundary>
      <Suspense fallback={<PageSkeleton />}>
        <Routes>
          <Route path="/" element={<Overview />} />
          <Route path="/flights" element={<Flights />} />
          <Route path="/flights/:id" element={<FlightDetail />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/map" element={<MapPage />} />
          <Route path="/live" element={<Live />} />
          <Route path="/friends" element={<Friends />} />
          <Route path="/u/:code" element={<ProfileLink />} />
          <Route path="/p/:handle" element={<ProfileLink />} />
          <Route path="/aircraft" element={<Aircraft />} />
          <Route path="/aircraft/:key" element={<AircraftDetail />} />
          <Route path="/airports" element={<Airports />} />
          <Route path="/airports/:ident" element={<AirportDetail />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/achievements" element={<Achievements />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
      </RouteBoundary>
      <ErrorBoundary compact><FlightForm /></ErrorBoundary>
      <AccountDialogs />
    </AppShell>
  );
}
