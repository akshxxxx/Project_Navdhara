import { Bell, Flag, Map, Phone, Route, Siren, type LucideIcon } from 'lucide-react';
import { Link, NavLink } from 'react-router-dom';

// The five client pages from frontend.md. Nothing for officials (Admin, Sensors, Verify) appears here.
const PAGES: { to: string; label: string; icon: LucideIcon }[] = [
  { to: '/', label: 'Map', icon: Map },
  { to: '/plan', label: 'Plan trip', icon: Route },
  { to: '/alerts', label: 'Alerts', icon: Bell },
  { to: '/reports', label: 'Reports', icon: Flag },
  { to: '/emergency', label: 'Emergency', icon: Siren },
];

export function AppHeader() {
  return (
    <>
      <header className="app-header">
        <Link to="/" className="brand" aria-label="Raah, NH-7 landslide risk: home">
          <span className="brand-chip">NH7</span>
          <span className="brand-name">Raah</span>
          <span className="brand-sub">NH-7 landslide risk</span>
        </Link>
        <nav className="nav" aria-label="Main">
          {PAGES.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/'}>
              <Icon size={20} aria-hidden />
              {label}
            </NavLink>
          ))}
        </nav>
        <a className="call-112" href="tel:112" aria-label="Call 112, emergency">
          <Phone size={18} aria-hidden />
          Call 112
        </a>
      </header>
      <nav className="bottom-nav" aria-label="Main">
        {PAGES.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === '/'}>
            <Icon size={22} aria-hidden />
            {label}
          </NavLink>
        ))}
      </nav>
    </>
  );
}
