import { ChevronRight, RefreshCw } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';

import { useCorridor } from '@/api/hooks';
import { CorridorMap } from '@/components/CorridorMap';
import { StretchDetails } from '@/components/StretchDetails';
import { Disclaimer, LevelBadge, Loading, SourceLabel, SourceWarning } from '@/components/ui';
import { LEVELS } from '@/domain/levels';
import { cardSubtitle, kmRange, type Stretch } from '@/domain/stretch';
import { whenLabel } from '@/domain/time';
import { weatherSourceText } from '@/domain/weather';

export function MapPage() {
  const { corridor, isPending, refetch, isFetching } = useCorridor();
  const [params, setParams] = useSearchParams();
  const selectedId = params.get('stretch');
  const select = (id: string | null) => setParams(id ? { stretch: id } : {}, { replace: !!id && !!selectedId });

  if (isPending || !corridor) return <Loading>Loading NH-7 risk…</Loading>;

  const selected = selectedId ? corridor.byId[selectedId] : null;
  const attention = corridor.worstFirst.slice(0, 3);
  const updated = whenLabel(corridor.updatedAt);

  return (
    <div className="map-page">
      <section className="map-main" aria-label="Risk map">
        <CorridorMap
          stretches={corridor.stretches}
          selectedId={selected?.id}
          focusIds={selected ? [selected.id] : null}
          focusKey={selected?.id ?? 'all'}
          onSelect={(id) => select(id)}
          legend
          wheelZoom
          tooltip={(s, level) => (
            <>
              <strong>{s.name}</strong>
              <br />
              <span style={{ color: LEVELS[level].ink, fontWeight: 600 }}>
                {LEVELS[level].label} · risk {Math.round(s.score * 100)}%
              </span>
            </>
          )}
        >
          <div className="map-overlay-top">
            <div className="map-pill">
              <SourceLabel source={corridor.source} savedAt={corridor.savedAt} />
              <span className="muted">{corridor.stretches.length} stretches</span>
              {corridor.highOrSevere ? (
                <span style={{ color: LEVELS.high.ink, fontWeight: 600 }}>{corridor.highOrSevere} High or Severe</span>
              ) : (
                <span className="muted">none High or Severe</span>
              )}
              {corridor.closed ? <span style={{ fontWeight: 600 }}>{corridor.closed} closed</span> : null}
              {updated ? <span className="muted">Updated {updated}</span> : null}
            </div>
          </div>
        </CorridorMap>

        {corridor.source !== 'live' ? (
          <div style={{ marginTop: 16 }}>
            <SourceWarning source={corridor.source} />
          </div>
        ) : null}

        <h2 className="section-title">
          Stretches needing attention today
          <span
            className="count-dot"
            aria-label={`${attention.length} stretches`}
            style={{ background: LEVELS[attention[0]?.level ?? 'low'].color }}
          >
            {attention.length}
          </span>
        </h2>
        <div className="attention-grid">
          {attention.map((s) => (
            <StretchCard key={s.id} s={s} selected={s.id === selected?.id} onClick={() => select(s.id)} />
          ))}
        </div>
      </section>

      <aside className="map-side" aria-label={selected ? `${selected.name} details` : 'Corridor summary'}>
        {selected ? (
          <StretchDetails stretch={selected} onBack={() => select(null)} />
        ) : (
          <CorridorSummary onSelect={select} refresh={() => refetch()} refreshing={isFetching} />
        )}
      </aside>
    </div>
  );
}

function StretchCard({ s, selected, onClick }: { s: Stretch; selected: boolean; onClick: () => void }) {
  return (
    <button type="button" className={`stretch-card ${selected ? 'selected' : ''}`} onClick={onClick}>
      <span className="grow">
        <LevelBadge level={s.level} />
        <span className="name">{s.name}</span>
        <span className="muted small">
          {kmRange(s)} · {cardSubtitle(s)}
        </span>
      </span>
      <ChevronRight size={22} aria-hidden className="muted" />
    </button>
  );
}

function CorridorSummary({
  onSelect,
  refresh,
  refreshing,
}: {
  onSelect: (id: string) => void;
  refresh: () => void;
  refreshing: boolean;
}) {
  const { corridor } = useCorridor();
  if (!corridor) return null;
  const severe = corridor.stretches.filter((s) => s.level === 'severe').length;
  const high = corridor.stretches.filter((s) => s.level === 'high').length;
  const weather = weatherSourceText(corridor.weatherSource);
  return (
    <div className="stack" style={{ gap: 22 }}>
      <div>
        <h2 style={{ fontSize: 30 }}>NH-7 right now</h2>
        <p className="muted" style={{ marginTop: 6 }}>
          Rishikesh to Joshimath · 247 km · 18 stretches. Click a stretch on the map for details.
        </p>
      </div>
      <div className="stat-row">
        <div className="stat">
          <div className="stat-label">Severe</div>
          <div className="stat-value" style={{ color: LEVELS.severe.ink }}>
            {severe}
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">High</div>
          <div className="stat-value" style={{ color: LEVELS.high.ink }}>
            {high}
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">Closed</div>
          <div className="stat-value">{corridor.closed}</div>
        </div>
      </div>
      <p className="small muted">
        {corridor.source === 'live'
          ? `Weather: ${weather ?? 'source not given'}.`
          : corridor.source === 'saved'
            ? 'Weather: last saved copy in this browser.'
            : 'Weather: demo sample, not live.'}{' '}
        The map refreshes itself every 5 minutes.{' '}
        <button type="button" className="link-back" style={{ fontSize: 14 }} onClick={refresh} disabled={refreshing}>
          <RefreshCw size={14} className={refreshing ? 'spin' : undefined} aria-hidden /> Refresh now
        </button>
      </p>

      <div>
        <h3>All stretches, worst first</h3>
        <div className="side-list">
          {corridor.worstFirst.map((s) => (
            <button key={s.id} type="button" className="stretch-card" onClick={() => onSelect(s.id)} style={{ padding: '12px 16px' }}>
              <span className="grow" style={{ gap: 2 }}>
                <span className="strong">{s.name}</span>
                <span className="muted small">{kmRange(s)}</span>
              </span>
              <LevelBadge level={s.level} />
            </button>
          ))}
        </div>
      </div>
      <Disclaimer />
    </div>
  );
}
