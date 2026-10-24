import { Info, LoaderCircle, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import type { Source } from '@/api/hooks';
import { LEVELS, type LevelKey } from '@/domain/levels';
import { whenLabel } from '@/domain/time';

export function LevelBadge({ level, text, dot = true }: { level: LevelKey; text?: string; dot?: boolean }) {
  const m = LEVELS[level];
  return (
    <span className="badge" style={{ background: m.tint, color: m.ink }}>
      {dot ? <span className="dot" style={{ background: m.color }} /> : null}
      {text ?? m.label}
    </span>
  );
}

export function Notice({
  tone,
  title,
  children,
  icon: Icon,
  action,
}: {
  tone: 'error' | 'warn' | 'ok' | 'info';
  title: ReactNode;
  children?: ReactNode;
  icon?: LucideIcon;
  action?: ReactNode;
}) {
  return (
    <div className={`notice ${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      {Icon ? <Icon size={22} style={{ flexShrink: 0, marginTop: 1 }} aria-hidden /> : null}
      <div style={{ flex: 1 }}>
        <div className="notice-title">{title}</div>
        {children ? <div className="notice-body small">{children}</div> : null}
      </div>
      {action}
    </div>
  );
}

export function Stat({ label, value, unit, color }: { label: string; value: ReactNode; unit?: string; color?: string }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={color ? { color } : undefined}>
        {value}
        {unit ? <span className="unit">{unit}</span> : null}
      </div>
    </div>
  );
}

export function Disclaimer({ children }: { children?: ReactNode }) {
  return (
    <p className="disclaimer">
      <Info size={18} aria-hidden />
      <span>
        {children ??
          'Raah supports your decision; it is not an official warning. Low risk does not mean safe. Follow BRO, SDRF and police instructions. Emergency: 112.'}
      </span>
    </p>
  );
}

export function Loading({ children }: { children: ReactNode }) {
  return (
    <div className="loading">
      <LoaderCircle className="spin" size={26} aria-hidden />
      <span>{children}</span>
    </div>
  );
}

/** Live / Offline copy / Demo data: a saved or sample copy must never look live */
export function SourceLabel({ source, savedAt }: { source: Source; savedAt: string | null }) {
  const label = source === 'live' ? 'Live' : source === 'saved' ? 'Offline copy' : 'Demo data, not live';
  const when = source === 'saved' ? whenLabel(savedAt) : null;
  return (
    <span className={`source-pill ${source}`}>
      <span className="live-dot" aria-hidden />
      <span className="label">{label}</span>
      {when ? <span className="muted">saved {when}</span> : null}
    </span>
  );
}

/** Shown under the page when the risk data is not live */
export function SourceWarning({ source }: { source: Source }) {
  if (source === 'live') return null;
  return source === 'saved' ? (
    <Notice tone="warn" title="Showing the last saved copy.">
      The Raah server cannot be reached right now. Conditions may have changed since then.
    </Notice>
  ) : (
    <Notice tone="error" title="Demo data, not today's conditions.">
      The Raah server cannot be reached and this browser has no saved copy yet. The colours below are a sample.
    </Notice>
  );
}
