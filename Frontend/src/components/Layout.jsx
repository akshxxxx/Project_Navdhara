import React, { useState, useEffect, createContext, useContext } from 'react';
import { Outlet, Link, useLocation, useSearchParams } from 'react-router-dom';
import { Map, Navigation2, Bell, AlertCircle, Phone, Clock, Info, Menu, X, CloudRain, RotateCcw, Activity, Shield } from 'lucide-react';
import { RainSimulationModal } from './RainSimulationModal';
import { fetchNodeAlerts } from '../api/client';

export const DemoCtx = createContext({
  demo: { active: false },
  setStorm: () => {},
  setTimeMachine: () => {},
  deactivate: () => {},
  openSimModal: () => {},
  closeSimModal: () => {},
});

export function useDemo() { return useContext(DemoCtx); }

// The whole dashboard is the officials' console (NH-7 control room); there is no public view.
const NAV_ITEMS = [
  { key: 'map', name: 'Map', path: '/', icon: Map },
  { key: 'plan', name: 'Plan trip', path: '/plan', icon: Navigation2 },
  { key: 'alerts', name: 'Alerts', path: '/alerts', icon: Bell },
  { key: 'report', name: 'Reports', path: '/report', icon: AlertCircle },
  { key: 'sensors', name: 'Sensors', path: '/sensors', icon: Activity },
  { key: 'admin', name: 'Admin', path: '/admin', icon: Shield },
  { key: 'emergency', name: 'Emergency', path: '/emergency', icon: Phone },
  { key: 'past-events', name: 'Past events', path: '/past-events', icon: Clock },
  { key: 'about', name: 'How it works', path: '/about', icon: Info },
];

const Layout = () => {
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [demo, setDemo] = useState({ active: false, simulateRainMm: null, asOf: null });
  const [searchParams] = useSearchParams();

  const [simModalOpen, setSimModalOpen] = useState(false);
  const [sensorAlerts, setSensorAlerts] = useState({});

  // Live slope-sensor escalations, shown as a header pill on every page (polls /node/alerts)
  useEffect(() => {
    let alive = true;
    const load = () => fetchNodeAlerts()
      .then(d => { if (alive) setSensorAlerts(d.alerts || {}); })
      .catch(() => {});
    load();
    const id = setInterval(load, 5000);
    return () => { alive = false; clearInterval(id); };
  }, []);
  const sensorAlertList = Object.entries(sensorAlerts);
  const topSensorAlert = sensorAlertList.find(([, a]) => a.avoid) || sensorAlertList[0];

  // Activate demo mode via ?demo=1
  const demoParam = searchParams.get('demo');
  const isDemoActive = demo.active || demoParam === '1' || demo.simulateRainMm != null;

  const setStorm = (mm) => setDemo({ active: true, simulateRainMm: mm, asOf: null });
  const setTimeMachine = (date) => setDemo({ active: true, simulateRainMm: null, asOf: date });
  const deactivate = () => setDemo({ active: false, simulateRainMm: null, asOf: null });
  const openSimModal = () => setSimModalOpen(true);
  const closeSimModal = () => setSimModalOpen(false);

  const demoCtxValue = {
    demo: { ...demo, active: isDemoActive },
    setStorm,
    setTimeMachine,
    deactivate,
    openSimModal,
    closeSimModal,
  };

  return (
    <DemoCtx.Provider value={demoCtxValue}>
      <div className="min-h-[100dvh] flex flex-col bg-glacier">
        {/* Header matching design */}
        <header className="h-[60px] bg-[#0c1821] text-white flex items-center px-4 md:px-6 shrink-0 shadow-md z-30 sticky top-0 border-b border-white/5">
          <Link to="/" className="flex items-center gap-2 sm:gap-2.5 mr-2 sm:mr-6 shrink-0 focus:outline-none" aria-label="NH7 Raah home">
            <div className="bg-[#f59e0b] text-[#0c1821] font-condensed font-black px-2.5 py-0.5 rounded text-base tracking-wider border border-[#d97706]">
              NH7
            </div>
            <div className="flex flex-col">
              <span className="font-condensed font-bold text-xl leading-none text-white tracking-wide">Raah</span>
              <span className="text-[10px] text-gray-400 font-sans tracking-tight hidden sm:inline lg:hidden 2xl:inline">Officials' control console</span>
            </div>
          </Link>

          {/* Full nav row from xl (1280 px); below that the ☰ menu lists the pages */}
          <nav className="hidden xl:flex gap-1 2xl:gap-1.5 items-center flex-1 min-w-0" aria-label="Main navigation">
            {NAV_ITEMS.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`text-xs font-medium px-2.5 2xl:px-3.5 py-1.5 rounded-full transition-all whitespace-nowrap ${
                    isActive
                      ? 'bg-[#1e293b] text-white shadow-inner font-semibold border border-white/10'
                      : 'text-gray-300 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {item.name}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-1.5 sm:gap-2.5 min-w-0">
            {/* Slope-sensor alert pill: visible on every page while a node escalates a segment */}
            {topSensorAlert && (
              <Link
                to="/sensors"
                className="flex items-center gap-1.5 text-xs px-2 sm:px-3 py-1.5 rounded-full font-bold text-white whitespace-nowrap shrink-0 animate-pulse shadow-[0_0_12px_rgba(239,68,68,0.5)]"
                style={{ background: topSensorAlert[1].status === 'SENSOR_LOST' ? '#a855f7' : (topSensorAlert[1].avoid ? '#dc2626' : '#ea580c') }}
                title={topSensorAlert[1].reason}
              >
                <Activity className="w-3.5 h-3.5" />
                <span>
                  {/* Phones: just the state; wider screens: "Sensor ALARM" */}
                  {topSensorAlert[1].status === 'SENSOR_LOST'
                    ? 'Lost'
                    : <><span className="hidden sm:inline">Sensor </span>{topSensorAlert[1].state}</>}
                </span>
                <span className="hidden xl:inline">
                  {' · '}{topSensorAlert[0]}
                  {topSensorAlert[1].kind === 'mock' ? ' (mock)' : topSensorAlert[1].kind === 'replay' ? ' (replay)' : ''}
                </span>
              </Link>
            )}

            {/* Rain Simulation Trigger Button for presentation */}
            <button
              onClick={() => setSimModalOpen(true)}
              className={`flex items-center gap-1.5 text-xs px-2 sm:px-3 py-1.5 rounded-full transition-all font-semibold border shadow-sm whitespace-nowrap shrink-0 ${
                demo.simulateRainMm != null
                  ? 'bg-amber-500/20 text-amber-300 border-amber-400 font-bold shadow-[0_0_12px_rgba(245,158,11,0.35)] animate-pulse'
                  : 'bg-[#1e293b] text-sky-300 hover:text-white hover:bg-[#334155] border-white/10'
              }`}
              title="Rainfall Simulation Override (For Presentation & Stress-Testing)"
            >
              <CloudRain className={`w-3.5 h-3.5 ${demo.simulateRainMm != null ? 'text-amber-400' : 'text-sky-400'}`} />
              {/* Phones: icon only (plus the mm while a simulation runs) */}
              <span className={demo.simulateRainMm != null ? '' : 'hidden sm:inline lg:hidden xl:inline'}>
                {demo.simulateRainMm != null ? `${demo.simulateRainMm} mm` : 'Simulate Rain'}
              </span>
            </button>

            {/* Quick Reset Button if Simulation is active */}
            {demo.simulateRainMm != null && (
              <button
                onClick={deactivate}
                className="hidden md:flex items-center gap-1 text-[11px] text-rose-300 hover:text-white bg-rose-950/60 hover:bg-rose-900 border border-rose-800/60 px-2.5 py-1 rounded-full transition-colors font-medium"
                title="Reset rainfall simulation to live weather"
              >
                <RotateCcw className="w-3 h-3 text-rose-400" />
                <span>Reset</span>
              </button>
            )}

            {/* Time Machine chip */}
            {demo.asOf && (
              <span className="hidden sm:inline text-xs font-condensed font-semibold px-2 py-0.5 rounded bg-amber-200 text-amber-900 border border-amber-300">
                Replay: {demo.asOf}
              </span>
            )}

            {/* Mobile menu toggle */}
            <button
              onClick={() => setMobileMenuOpen(o => !o)}
              className="xl:hidden p-1.5 text-gray-300 hover:text-white rounded-md bg-[#1e293b] shrink-0"
              aria-label="Menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </header>

        {/* Mobile dropdown menu */}
        {mobileMenuOpen && (
          <div className="xl:hidden bg-ink text-white z-10 border-t border-white/10">
            <button
              onClick={() => {
                setSimModalOpen(true);
                setMobileMenuOpen(false);
              }}
              className="w-full flex items-center gap-3 px-4 py-3 text-sm text-sky-400 hover:text-white border-b border-white/10"
            >
              <CloudRain className="w-4 h-4" />
              Rainfall Simulation Studio
            </button>
            {/* The first 4 pages are in the bottom bar below lg; from lg to xl the bottom bar is gone, so list them here */}
            {NAV_ITEMS.map((item, idx) => (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setMobileMenuOpen(false)}
                className={`${idx < 4 ? 'hidden lg:flex' : 'flex'} items-center gap-3 px-4 py-3 text-sm border-b border-white/10 ${
                  location.pathname === item.path ? 'text-white font-semibold' : 'text-mist hover:text-white'
                }`}
              >
                <item.icon className="w-4 h-4" />
                {item.name}
              </Link>
            ))}
          </div>
        )}

        {/* Main content */}
        <main className="flex-1 flex flex-col relative" id="main-content">
          <Outlet context={{
            demo: demoCtxValue.demo,
            setStorm,
            setTimeMachine,
            deactivate,
            openSimModal,
            closeSimModal,
            isSimModalOpen: simModalOpen,
          }} />
        </main>

        {/* Global Rainfall Simulation Modal */}
        <RainSimulationModal
          isOpen={simModalOpen}
          onClose={() => setSimModalOpen(false)}
          currentRainMm={demo.simulateRainMm}
          onApply={(mm) => setStorm(mm)}
          onReset={deactivate}
        />

        {/* Bottom nav - compact only */}
        <nav
          className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-mist flex justify-around items-center z-10"
          style={{ height: '64px', paddingBottom: 'env(safe-area-inset-bottom)' }}
          aria-label="Bottom navigation"
        >
          {NAV_ITEMS.slice(0, 4).map((item) => {
            const Icon = item.icon;
            const active = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex flex-col items-center justify-center w-full h-full text-xs font-condensed gap-0.5 transition-colors ${
                  active ? 'text-river' : 'text-granite'
                }`}
                aria-current={active ? 'page' : undefined}
              >
                <Icon className={`w-5 h-5 ${active ? 'stroke-river' : ''}`} strokeWidth={active ? 2.5 : 1.75} />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </DemoCtx.Provider>
  );
};

export default Layout;
