import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';

import { AppHeader } from './components/AppHeader';
import { AlertsPage } from './pages/AlertsPage';
import { EmergencyPage } from './pages/EmergencyPage';
import { MapPage } from './pages/MapPage';
import { PlanPage } from './pages/PlanPage';
import { ReportsPage } from './pages/ReportsPage';

const TITLES: Record<string, string> = {
  '/': 'Map',
  '/plan': 'Plan trip',
  '/alerts': 'Alerts',
  '/reports': 'Reports',
  '/emergency': 'Emergency',
};

export function App() {
  const { pathname } = useLocation();
  useEffect(() => {
    document.title = `${TITLES[pathname] ?? 'Raah'} · Raah NH-7`;
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <>
      <AppHeader />
      <main>
        <Routes>
          <Route path="/" element={<MapPage />} />
          <Route path="/plan" element={<PlanPage />} />
          <Route path="/alerts" element={<AlertsPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/emergency" element={<EmergencyPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </>
  );
}
