import {
  Ban,
  ChevronRight,
  CircleAlert,
  CloudRain,
  Map as MapIcon,
  Phone,
  Route,
  Search,
  Share2,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { useCorridor } from '@/api/hooks';
import { CorridorMap } from '@/components/CorridorMap';
import { Disclaimer, Loading, SourceLabel, SourceWarning, Stat } from '@/components/ui';
import { LEVELS, type LevelKey } from '@/domain/levels';
import {
  alertCategory,
  alertParagraph,
  cardSubtitle,
  isHeavyRain,
  kmRange,
  planParamsFor,
  type Stretch,
} from '@/domain/stretch';
import { whenLabel } from '@/domain/time';

type Filter = 'all' | 'severe' | 'high' | 'moderate' | 'closed';
const FIRST_SHOWN = 6;

function AlertBadge({ level, suffix }: { level: LevelKey; suffix?: string }) {
  const m = LEVELS[level];
  return (
    <span className="badge" style={{ background: m.tint, color: m.ink }}>
      {level === 'closed' ? 'Road closed' : `${m.label} · ${suffix ?? m.verdict}`}
    </span>
  );
}

export function AlertsPage() {
  const { corridor, isPending } = useCorridor();
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const list = useMemo(() => {
    if (!corridor) return [];
    const q = query.trim().toLowerCase();
    const km = Number(q.replace(/^km\s*/, ''));
    return corridor.worstFirst.filter((s) => {
      if (filter !== 'all' && s.level !== filter) return false;
      if (!q) return true;
      if (q && !Number.isNaN(km) && /^(km\s*)?\d+(\.\d+)?$/.test(q)) return km >= s.kmStart && km <= s.kmEnd;
      return s.name.toLowerCase().includes(q);
    });
  }, [corridor, filter, query]);

  if (isPending || !corridor) return <Loading>Loading alerts…</Loading>;

  const count = (k: LevelKey) => corridor.stretches.filter((s) => s.level === k).length;
  const heavyRain = corridor.stretches.filter(isHeavyRain).length;
  const shown = showAll || query || filter !== 'all' ? list : list.slice(0, FIRST_SHOWN);
  const hidden = list.slice(FIRST_SHOWN);
  const selected = (selectedId ? corridor.byId[selectedId] : null) ?? list[0] ?? corridor.worstFirst[0];
  const updated = whenLabel(corridor.updatedAt);

  const tiles: { key: string; n: number; label: string; icon: LucideIcon; color: string; tint: string }[] = [
    { key: 'severe', n: count('severe'), label: 'Severe', icon: CircleAlert, ...pick('severe') },
    { key: 'high', n: count('high'), label: 'High', icon: TriangleAlert, ...pick('high') },
    { key: 'moderate', n: count('moderate'), label: 'Moderate', icon: CircleAlert, ...pick('moderate') },
    { key: 'closed', n: corridor.closed, label: 'Road closures', icon: Ban, color: '#1B2A33', tint: '#DDE3E6' },
    { key: 'rain', n: heavyRain, label: 'Heavy rain, 3 days', icon: CloudRain, color: '#1F5F6B', tint: '#DCEBEE' },
  ];
  const filters: { key: Filter; label: string; n: number }[] = [
    { key: 'all', label: 'All', n: corridor.stretches.length },
    { key: 'severe', label: 'Severe', n: count('severe') },
    { key: 'high', label: 'High', n: count('high') },
    { key: 'moderate', label: 'Moderate', n: count('moderate') },
    { key: 'closed', label: 'Closures', n: corridor.closed },
  ];

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Alerts on NH-7</h1>
          <p className="lede row" style={{ flexWrap: 'wrap', gap: 10 }}>
            <SourceLabel source={corridor.source} savedAt={corridor.savedAt} />
            <span>
              {updated ? `Updated ${updated}` : 'Update time unknown'} · refreshes every 5 minutes · worst first
            </span>
          </p>
        </div>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <label className="search">
            <span className="sr-only">Search stretch or km</span>
            <Search size={20} aria-hidden />
            <input
              className="input"
              type="search"
              placeholder="Search stretch or km"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <Link to="/emergency" className="btn btn-outline">
            <Phone size={18} aria-hidden /> Emergency contacts
          </Link>
        </div>
      </div>

      {corridor.source !== 'live' ? (
        <div style={{ marginBottom: 20 }}>
          <SourceWarning source={corridor.source} />
        </div>
      ) : null}

      <div className="count-tiles">
        {tiles.map((t) => (
          <div key={t.key} className="count-tile">
            <span className="icon" style={{ background: t.tint, color: t.color }}>
              <t.icon size={26} aria-hidden />
            </span>
            <span>
              <span className="num">{t.n}</span>
              <br />
              <span className="muted">{t.label}</span>
            </span>
          </div>
        ))}
      </div>

      <div className="chips" style={{ margin: '24px 0' }} role="tablist" aria-label="Filter alerts">
        {filters.map((f) => (
          <button
            key={f.key}
            type="button"
            role="tab"
            aria-selected={filter === f.key}
            className={`chip ${filter === f.key ? 'active' : ''}`}
            onClick={() => {
              setFilter(f.key);
              setShowAll(false);
            }}
          >
            {f.label} · {f.n}
          </button>
        ))}
      </div>

      <div className="layout-side" style={{ '--side': '600px' } as React.CSSProperties}>
        <div className="stack" style={{ gap: 14 }}>
          {shown.length ? (
            shown.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`alert-card ${s.id === selected?.id ? 'selected' : ''}`}
                onClick={() => setSelectedId(s.id)}
                aria-pressed={s.id === selected?.id}
              >
                <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span className="row" style={{ flexWrap: 'wrap', gap: 10 }}>
                    <AlertBadge level={s.level} />
                    <span className="muted">{kmRange(s)}</span>
                    <span className="muted small">· {alertCategory(s)}</span>
                  </span>
                  <span className="name">{s.name}</span>
                  <span className="muted">{cardSubtitle(s)}</span>
                </span>
                <ChevronRight size={24} aria-hidden />
              </button>
            ))
          ) : (
            <div className="card empty">
              {query ? `No stretch matches “${query}”.` : 'No stretch is at this level right now.'}
            </div>
          )}
          {!showAll && !query && filter === 'all' && hidden.length ? (
            <button type="button" className="show-more" onClick={() => setShowAll(true)}>
              Show {hidden.length} more stretches ({summaryOf(hidden)})
            </button>
          ) : null}
        </div>

        <aside className="stack">
          {selected ? <AlertDetail s={selected} stretches={corridor.stretches} /> : null}
          <div className="card card-pad">
            <h3>Travel safety tips</h3>
            <ul className="bullets">
              <li>Avoid driving after dark during heavy rain.</li>
              <li>Do not stop below steep slopes or fresh cuttings.</li>
              <li>Watch for falling stones, cracks or water running across the road.</li>
              <li>Carry water, a torch and a charged phone.</li>
              <li>Follow BRO, SDRF and police instructions.</li>
            </ul>
          </div>
          <Disclaimer>
            Raah alerts support your decision; they are not official warnings. Low risk does not mean safe. Emergency:
            112.
          </Disclaimer>
        </aside>
      </div>
    </div>
  );
}

function pick(k: LevelKey) {
  return { color: LEVELS[k].color, tint: LEVELS[k].tint };
}

function summaryOf(rest: Stretch[]) {
  const parts = (['severe', 'high', 'moderate', 'low', 'closed'] as LevelKey[])
    .map((k) => [k, rest.filter((s) => s.level === k).length] as const)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${n} ${LEVELS[k].label}`);
  return parts.join(', ');
}

function AlertDetail({ s, stretches }: { s: Stretch; stretches: Stretch[] }) {
  const navigate = useNavigate();
  const [shared, setShared] = useState<string | null>(null);
  const m = LEVELS[s.level];
  const plan = planParamsFor(s);
  const updated = whenLabel(s.updatedAt);
  const mm = (v: number | null) => (v == null ? '—' : String(Math.round(v)));

  const share = async () => {
    const url = `${window.location.origin}/?stretch=${s.id}`;
    const text = `NH-7 ${s.name} (${kmRange(s)}): ${m.label} risk, ${m.verdict.toLowerCase()}. ${alertParagraph(s)}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: `Raah alert: ${s.name}`, text, url });
        return;
      }
      await navigator.clipboard.writeText(`${text} ${url}`);
      setShared('Alert copied. Paste it into a message.');
    } catch {
      /* the person closed the share sheet */
    }
  };

  return (
    <div className="card detail-card">
      <CorridorMap
        stretches={stretches}
        selectedId={s.id}
        focusIds={[s.id]}
        focusKey={s.id}
        controls="compact"
      />
      <div className="card-pad stack" style={{ gap: 16 }}>
        <div>
          <span className="badge" style={{ background: m.tint, color: m.ink }}>
            {s.level === 'closed' ? 'Road closed · official' : `${m.label} risk · active`}
          </span>
          <h2 style={{ fontSize: 32, marginTop: 10 }}>{s.name}</h2>
          <p className="muted" style={{ marginTop: 4 }}>
            NH-7 · km {Math.round(s.kmStart)} to {Math.round(s.kmEnd)}
            {updated ? ` · updated ${updated}` : ''}
          </p>
        </div>
        <p style={{ fontSize: 17 }}>
          <strong>{m.verdict}.</strong> {alertParagraph(s)}
        </p>
        <div className="stat-row">
          {s.rain24h != null ? (
            <Stat label="Rain last 24 h" value={mm(s.rain24h)} unit="mm" />
          ) : (
            <Stat label="Rain last 3 days" value={mm(s.rain3d)} unit={s.rain3d == null ? undefined : 'mm'} />
          )}
          <Stat label="Next 24 h" value={mm(s.next24h)} unit={s.next24h == null ? undefined : 'mm'} />
          <Stat label="Driver reports" value={s.reports24h} unit="in 24 h" />
        </div>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-primary" onClick={() => navigate(`/?stretch=${s.id}`)}>
            <MapIcon size={18} aria-hidden /> View on map
          </button>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => navigate(`/plan?from=${encodeURIComponent(plan.from)}&to=${encodeURIComponent(plan.to)}`)}
          >
            <Route size={18} aria-hidden /> Check a trip
          </button>
          <button type="button" className="btn btn-outline" onClick={share}>
            <Share2 size={18} aria-hidden /> Share
          </button>
        </div>
        {shared ? (
          <p className="small" role="status" style={{ color: 'var(--green-ink)' }}>
            {shared}
          </p>
        ) : null}
      </div>
    </div>
  );
}
