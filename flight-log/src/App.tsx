import React, { Suspense, lazy, useEffect } from 'react';
import { Route, Routes } from 'react-router-dom';
import { useStore } from './store/useStore';
import { AppShell, Logo } from './components/layout/AppShell';
import { FlightForm } from './components/flight/FlightForm';
import { Skeleton } from './components/ui';
import Overview from './pages/Overview';
import Onboarding from './pages/Onboarding';
import AuthScreen, { AccountDialogs } from './pages/Auth';

const Flights = lazy(() => import('./pages/Flights'));
const FlightDetail = lazy(() => import('./pages/FlightDetail'));
const Analytics = lazy(() => import('./pages/Analytics'));
const MapPage = lazy(() => import('./pages/MapPage'));
const Aircraft = lazy(() => import('./pages/Aircraft'));
const AircraftDetail = lazy(() => import('./pages/AircraftDetail'));
const Airports = lazy(() => import('./pages/Airports'));
const AirportDetail = lazy(() => import('./pages/AirportDetail'));
const CalendarPage = lazy(() => import('./pages/Calendar'));
const Achievements = lazy(() => import('./pages/Achievements'));
const Reports = lazy(() => import('./pages/Reports'));
const SettingsPage = lazy(() => import('./pages/Settings'));
const NotFound = lazy(() => import('./pages/NotFound'));

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
      <Suspense fallback={<PageSkeleton />}>
        <Routes>
          <Route path="/" element={<Overview />} />
          <Route path="/flights" element={<Flights />} />
          <Route path="/flights/:id" element={<FlightDetail />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/map" element={<MapPage />} />
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
      <FlightForm />
      <AccountDialogs />
    </AppShell>
  );
}
