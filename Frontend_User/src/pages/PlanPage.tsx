import {
  ArrowLeftRight,
  ChevronRight,
  Clock,
  Construction,
  MapPin,
  RefreshCw,
  Search,
  TriangleAlert,
} from 'lucide-react';
import { useMemo, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';

import { ApiError, connectionHelp } from '@/api/client';
import { useCorridor, useTrip } from '@/api/hooks';
import type { RouteRiskResponse, RouteSegment } from '@/api/types';
import { CorridorMap, Legend } from '@/components/CorridorMap';
import { Disclaimer, LevelBadge, Loading, Notice, Stat } from '@/components/ui';
import { routeSegments, segmentInfo, townByName, TOWNS, WAIT_TOWNS } from '@/domain/corridor';
import { LEVELS, levelFromText, worst, type LevelKey } from '@/domain/levels';
import type { LatLng } from '@/domain/stretch';
import {
  clock24,
  dayLabel,
  durationLabel,
  hoursBetween,
  istDateKey,
  nextHourIst,
  parseIso,
  shortDay,
  weekday,
} from '@/domain/time';
import { weatherSourceText } from '@/domain/weather';

// The four canonical actions from the trip planner (Backend/app/trip_planner.py). Raah never says "safe".
const ACTIONS: Record<string, { tag: string; title: string; level: LevelKey }> = {
  REC_AVOID: { tag: 'Avoid', title: 'Avoid this trip for now', level: 'severe' },
  REC_DELAY: { tag: 'Delay', title: 'Delay your trip if you can', level: 'high' },
  REC_CAUTION: { tag: 'Caution', title: 'Go with caution', level: 'moderate' },
  REC_LOW_RISK_CAUTION: { tag: 'Low risk', title: 'Low risk – proceed with caution', level: 'low' },
};

const POPULAR: [string, string][] = [
  ['Rishikesh', 'Joshimath'],
  ['Rishikesh', 'Srinagar'],
  ['Srinagar', 'Joshimath'],
  ['Rishikesh', 'Devprayag'],
  ['Joshimath', 'Rishikesh'],
];

/** Risk when you reach a stretch, never lower than its live adjusted level (reports, sensors) */
function levelAtEta(s: RouteSegment): LevelKey {
  if (s.closure?.status === 'closed') return 'closed';
  const atEta = levelFromText(s.risk_level_at_eta ?? s.risk_level);
  return s.adjusted_risk_level ? worst(atEta, levelFromText(s.adjusted_risk_level)) : atEta;
}

const townAtKm = (km: number) => TOWNS.find((tw) => Math.abs(tw.km - km) < 0.01)?.name ?? `km ${Math.round(km)}`;

/** Same summary as the app's trip result (App/src/app/plan-result.tsx) */
function summarise(res: RouteRiskResponse, fromTown: string, toTown: string) {
  const forward = (townByName(fromTown)?.km ?? 0) < (townByName(toTown)?.km ?? 0);
  const speed = res.speed_kmph ?? 30;
  const segs = res.segments;
  const levels: Record<string, LevelKey> = {};
  for (const s of segs) levels[s.id] = levelAtEta(s);
  const overall = segs.reduce<LevelKey>((acc, s) => worst(acc, levels[s.id]), 'low');
  const start = parseIso(segs[0]?.eta_ist ?? res.depart_time);
  const last = segs[segs.length - 1];
  const lastInfo = last ? segmentInfo(last.id) : null;
  const lastEta = parseIso(last?.eta_ist);
  const arrive =
    lastEta && lastInfo ? new Date(lastEta.getTime() + ((lastInfo.kmEnd - lastInfo.kmStart) / speed) * 3600000) : null;

  const rows = segs.map((s, i) => {
    const info = segmentInfo(s.id);
    const km = info ? (forward ? info.kmStart : info.kmEnd) : 0;
    const nextInfo = segmentInfo(segs[i + 1]?.id ?? '');
    const nextKm = nextInfo ? (forward ? nextInfo.kmStart : nextInfo.kmEnd) : (townByName(toTown)?.km ?? 0);
    return {
      id: s.id,
      seg: s as RouteSegment | null,
      town: townAtKm(km),
      next: townAtKm(nextKm),
      km,
      eta: parseIso(s.eta_ist),
      level: levels[s.id] as LevelKey | null,
    };
  });
  rows.push({
    id: 'arrive',
    seg: null,
    town: toTown,
    next: '',
    km: townByName(toTown)?.km ?? 0,
    eta: arrive,
    level: null,
  });

  // The 24/72 h figures exist only in the backend's hourly forecast mode
  const avgOf = (pick: (s: RouteSegment) => number | null | undefined) => {
    const vals = segs.map(pick).filter((v): v is number => typeof v === 'number');
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };
  const maxOf = (pick: (s: RouteSegment) => number | null | undefined) => {
    const vals = segs.map(pick).filter((v): v is number => typeof v === 'number');
    return vals.length ? Math.max(...vals) : null;
  };
  const fromKm = townByName(fromTown)?.km ?? 0;
  const toKm = townByName(toTown)?.km ?? 0;
  const risky = segs.filter((s) => LEVELS[levels[s.id]].rank >= 2);
  const firstRiskyKm = risky.length
    ? (() => {
        const info = segmentInfo(risky[0].id);
        return info ? (forward ? info.kmStart : info.kmEnd) : null;
      })()
    : null;
  return {
    forward,
    levels,
    overall,
    risky,
    closures: segs.filter((s) => s.closure),
    start,
    hours: start && arrive ? (arrive.getTime() - start.getTime()) / 3600000 : null,
    distance: Math.round(Math.abs(toKm - fromKm)),
    rows,
    weather: {
      rain24: avgOf((s) => s.rain_24h_mm),
      rain3d: avgOf((s) => s.r3d_mm ?? s.rain_mm_3d),
      next24: avgOf((s) => s.forecast_24h_mm),
      next72: avgOf((s) => s.forecast_72h_mm),
      atEta: maxOf((s) => s.rain_72h_at_eta_mm),
    },
    waitTowns: WAIT_TOWNS.flatMap((w) => {
      const km = townByName(w)?.km ?? -1;
      if (km <= Math.min(fromKm, toKm) || km >= Math.max(fromKm, toKm)) return [];
      const beforeRisk = firstRiskyKm != null && (forward ? km <= firstRiskyKm : km >= firstRiskyKm);
      return [{ name: w, km, beforeRisk }];
    }),
  };
}

export function PlanPage() {
  const [params, setParams] = useSearchParams();
  const defaults = useMemo(() => nextHourIst(), []);
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const date = params.get('date') ?? defaults.date;
  const time = params.get('time') ?? defaults.time;

  const [form, setForm] = useState({ from: from || 'Rishikesh', to: to || 'Joshimath', date, time });
  // Keep the form in step when the URL changes (popular route, Select a safer time, link from the map)
  const [seen, setSeen] = useState(params.toString());
  if (params.toString() !== seen) {
    setSeen(params.toString());
    setForm({ from: from || form.from, to: to || form.to, date, time });
  }

  const segs = from && to ? routeSegments(from, to) : null;
  const departTime = `${date}T${time}:00`;
  const trip = useTrip(segs ? { ...segs, departTime } : null);
  const sameTown = form.from === form.to;

  const run = (next: { from: string; to: string; date: string; time: string }) =>
    setParams({ from: next.from, to: next.to, date: next.date, time: next.time });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!sameTown) run(form);
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Plan your journey on NH-7</h1>
          <p className="lede">
            Raah checks each stretch for the hour you will reach it, and suggests safer times to leave.
          </p>
        </div>
      </div>

      <form className="card card-pad" onSubmit={submit} aria-label="Trip">
        <div className="plan-form">
          <div className="from">
            <label className="field-label" htmlFor="from">
              From
            </label>
            <select
              id="from"
              className="select"
              value={form.from}
              onChange={(e) => setForm({ ...form, from: e.target.value })}
            >
              {TOWNS.map((t) => (
                <option key={t.name}>{t.name}</option>
              ))}
            </select>
          </div>
          <div className="swap">
            <button
              type="button"
              className="swap-btn"
              aria-label="Swap From and To"
              title="Swap From and To"
              onClick={() => setForm({ ...form, from: form.to, to: form.from })}
            >
              <ArrowLeftRight size={22} />
            </button>
          </div>
          <div>
            <label className="field-label" htmlFor="to">
              To
            </label>
            <select id="to" className="select" value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })}>
              {TOWNS.map((t) => (
                <option key={t.name}>{t.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label" htmlFor="date">
              Travel date
            </label>
            <input
              id="date"
              type="date"
              className="input"
              required
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
            />
          </div>
          <div>
            <label className="field-label" htmlFor="time">
              Leave at <span className="opt">(IST)</span>
            </label>
            <input
              id="time"
              type="time"
              className="input"
              required
              step={900}
              value={form.time}
              onChange={(e) => setForm({ ...form, time: e.target.value })}
            />
          </div>
          <div>
            <button type="submit" className="btn btn-primary btn-block" style={{ minHeight: 52 }} disabled={sameTown}>
              <Search size={20} aria-hidden /> Check route
            </button>
          </div>
        </div>
        {sameTown ? (
          <p className="small" style={{ color: LEVELS.severe.ink, marginTop: 10 }}>
            Pick two different towns.
          </p>
        ) : null}
        <div className="popular">
          <span className="small strong muted">Popular routes</span>
          {POPULAR.map(([a, b]) => (
            <button
              key={`${a}-${b}`}
              type="button"
              className={`chip ${from === a && to === b ? 'active' : ''}`}
              onClick={() => run({ ...form, from: a, to: b })}
            >
              {a} → {b}
            </button>
          ))}
        </div>
      </form>

      <div style={{ marginTop: 28 }}>
        {!from || !to ? (
          <Notice tone="info" icon={MapPin} title="Choose where you are going and when you leave, then Check route.">
            Times are Indian Standard Time. For dates more than two days away the check uses the ground only, because
            there is no rain forecast yet.
          </Notice>
        ) : !segs ? (
          <Notice tone="error" title="This route is not on NH-7.">
            Pick two different towns between Rishikesh and Joshimath.
          </Notice>
        ) : trip.isPending ? (
          <Loading>Checking every stretch for the hour you reach it…</Loading>
        ) : trip.isError || !trip.data ? (
          <TripError error={trip.error} retry={() => trip.refetch()} retrying={trip.isFetching} />
        ) : (
          <TripResult
            res={trip.data}
            from={from}
            to={to}
            departTime={departTime}
            onSelectTime={(d) => run({ from, to, date: istDateKey(d), time: clock24(d) })}
            refreshing={trip.isFetching}
          />
        )}
      </div>
    </div>
  );
}

function TripError({ error, retry, retrying }: { error: unknown; retry: () => void; retrying: boolean }) {
  const msg =
    error instanceof ApiError && error.status === 0
      ? `${connectionHelp(error)} The Map page still shows the last saved risk.`
      : error instanceof ApiError && error.detail
        ? error.detail
        : 'The trip check failed. Try again in a minute.';
  return (
    <Notice
      tone="error"
      icon={TriangleAlert}
      title="Could not check this trip"
      action={
        <button type="button" className="btn btn-outline btn-sm" onClick={retry} disabled={retrying}>
          <RefreshCw size={16} className={retrying ? 'spin' : undefined} aria-hidden /> Try again
        </button>
      }
    >
      {msg}
    </Notice>
  );
}

function TripResult({
  res,
  from,
  to,
  departTime,
  onSelectTime,
  refreshing,
}: {
  res: RouteRiskResponse;
  from: string;
  to: string;
  departTime: string;
  onSelectTime: (d: Date) => void;
  refreshing: boolean;
}) {
  const { corridor } = useCorridor();
  const sum = useMemo(() => summarise(res, from, to), [res, from, to]);
  const [focus, setFocus] = useState<{ ids: string[] | null; key: string }>({ ids: null, key: 'route' });
  const optionsRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<HTMLDivElement>(null);

  const rec = res.recommendation;
  const action = ACTIONS[rec?.action_code ?? ''] ?? ACTIONS.REC_CAUTION;
  const am = LEVELS[action.level];
  const requested = parseIso(departTime);
  const routeIds = res.segments.map((s) => s.id);
  const first = corridor?.byId[routeIds[0]];
  const last = corridor?.byId[routeIds[routeIds.length - 1]];
  const startPt: LatLng | undefined = first
    ? sum.forward
      ? first.coords[0]
      : first.coords[first.coords.length - 1]
    : undefined;
  const endPt: LatLng | undefined = last
    ? sum.forward
      ? last.coords[last.coords.length - 1]
      : last.coords[0]
    : undefined;
  const options = rec?.best_departure_options ?? [];
  const highRisk = sum.risky.length;
  const weatherNote = weatherSourceText(res.weather_source);

  const showOnMap = (id: string) => {
    setFocus({ ids: [id], key: `${id}-${Date.now()}` });
    mapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  return (
    <div className="layout-side" aria-busy={refreshing}>
      <div className="stack">
        <div className="rec-banner" style={{ background: am.tint }}>
          <Clock size={44} color={am.color} aria-hidden style={{ flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <span className="rec-tag" style={{ background: am.color }}>
              {action.tag}
            </span>
            <div className="title" style={{ color: am.ink }}>
              {action.title}
            </div>
            <p style={{ marginTop: 6, fontSize: 17 }}>{rec?.reason || res.advisory}</p>
            <p className="small muted" style={{ marginTop: 6 }}>
              {from} → {to} · leaving {requested ? `${dayLabel(istDateKey(requested))}, ${clock24(requested)}` : departTime}{' '}
              IST
            </p>
          </div>
          {options.length ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => optionsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            >
              See safer times <ChevronRight size={18} aria-hidden />
            </button>
          ) : null}
        </div>

        {res.stale_warning ? (
          <Notice tone="warn" title="Weather data is not fresh.">
            {res.stale_warning}
          </Notice>
        ) : null}

        <div className="summary-tiles">
          <div className="summary-tile">
            <Stat label="Distance" value={sum.distance} unit="km" />
          </div>
          <div className="summary-tile">
            <Stat label="Driving time" value={sum.hours != null ? `~${durationLabel(sum.hours)}` : '—'} />
          </div>
          <div className="summary-tile">
            <div className="stat">
              <div className="stat-label">Overall risk</div>
              <div style={{ marginTop: 8 }}>
                <LevelBadge level={sum.overall} />
              </div>
            </div>
          </div>
          <div className="summary-tile">
            <Stat label="High-risk stretches" value={highRisk} unit={`of ${routeIds.length}`} />
          </div>
          <div className="summary-tile">
            <Stat label="Closures on route" value={sum.closures.length} />
          </div>
        </div>

        <div ref={mapRef}>
          {corridor ? (
            <CorridorMap
              className="route-map"
              stretches={corridor.stretches}
              visibleIds={routeIds}
              levelOverride={sum.levels}
              focusIds={focus.ids ?? routeIds}
              focusKey={`${routeIds.join()}-${focus.key}`}
              selectedId={focus.ids?.[0] ?? null}
              markers={{ start: startPt, end: endPt }}
              controls="compact"
              tooltip={(s, level) => (
                <>
                  <strong>{s.name}</strong>
                  <br />
                  <span style={{ color: LEVELS[level].ink, fontWeight: 600 }}>
                    {LEVELS[level].label} when you reach it
                  </span>
                </>
              )}
            >
              <div className="map-overlay-top">
                <div className="map-pill small strong">Colours show the risk when you reach each stretch</div>
              </div>
              <Legend />
            </CorridorMap>
          ) : null}
        </div>

        <div className="card">
          <h2 style={{ padding: '22px 26px 12px', fontSize: 26 }}>Route breakdown</h2>
          {sum.rows.map((r, i) => {
            const hot = r.level === 'severe' || r.level === 'closed';
            return (
              <div key={r.id} className={`breakdown-row ${i === 0 ? 'first' : ''} ${hot ? 'hot' : ''}`}>
                <span className="time">{r.eta ? clock24(r.eta) : '—'}</span>
                <span aria-hidden>
                  {i === 0 ? (
                    <span style={{ display: 'block', width: 16, height: 16, borderRadius: 8, border: '3px solid #2E7D57' }} />
                  ) : r.level ? (
                    <span style={{ display: 'block', width: 10, height: 10, borderRadius: 5, background: '#1B2A33', margin: '0 3px' }} />
                  ) : (
                    <MapPin size={18} color={LEVELS.severe.color} />
                  )}
                </span>
                <span>
                  <span className="strong" style={{ fontSize: 18 }}>
                    {r.town}
                  </span>
                  <br />
                  <span className="small" style={hot ? { color: LEVELS.severe.ink, fontWeight: 600 } : { color: 'var(--ink-muted)' }}>
                    km {Math.round(r.km)}
                    {r.level
                      ? hot && r.seg
                        ? ` · to ${r.next}: ${r.seg.name} ${LEVELS[r.level].label.toLowerCase()} at ~${r.eta ? clock24(r.eta) : '?'}`
                        : ` · ${i === 0 ? 'start · ' : ''}to ${r.next}`
                      : ' · arrive'}
                  </span>
                </span>
                {r.level ? <LevelBadge level={r.level} /> : <span />}
              </div>
            );
          })}
          <p className="small muted" style={{ padding: '12px 26px 20px' }}>
            Times assume about {Math.round(res.speed_kmph ?? 30)} km/h in mountain conditions. Each level is for the
            stretch you enter at that town, at the time you get there.
          </p>
        </div>

        {sum.risky.length ? (
          <div className="card">
            <h2 style={{ padding: '22px 26px 12px', fontSize: 24 }}>High-risk stretches on your route</h2>
            {sum.risky.map((s) => {
              const eta = parseIso(s.eta_ist);
              return (
                <button key={s.id} type="button" className="risky-row" onClick={() => showOnMap(s.id)}>
                  <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
                    <LevelBadge level={sum.levels[s.id]} />
                    <span className="strong">{s.name}</span>
                    <span className="small muted">
                      {eta ? `You reach it around ${clock24(eta)}` : ''}
                      {s.rain_72h_at_eta_mm != null
                        ? ` · ${Math.round(s.rain_72h_at_eta_mm)} mm rain over 3 days by then`
                        : ''}
                    </span>
                  </span>
                  <span className="small strong" style={{ color: 'var(--teal)' }}>
                    Show on map
                  </span>
                  <ChevronRight size={20} aria-hidden />
                </button>
              );
            })}
          </div>
        ) : null}

        {sum.closures.length ? (
          <div className="stack" style={{ gap: 12 }}>
            <h2 className="section-title" style={{ margin: 0 }}>
              Closures on your route
            </h2>
            {sum.closures.map((s) => (
              <Notice
                key={s.id}
                tone="error"
                icon={Construction}
                title={`${s.name}: ${s.closure!.status === 'closed' ? 'closed' : s.closure!.status === 'one_way' ? 'one way' : 'restricted'}`}
                action={
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => showOnMap(s.id)}>
                    Show on map
                  </button>
                }
              >
                {s.closure!.reason} · {s.closure!.source}
              </Notice>
            ))}
          </div>
        ) : null}
      </div>

      <aside className="stack">
        <div ref={optionsRef} className="card card-pad" style={options.length ? { borderWidth: 3, borderColor: 'var(--navy)' } : undefined}>
          <h2 style={{ fontSize: 28 }}>Safer times to leave</h2>
          {options.length ? (
            <>
              <p className="muted" style={{ margin: '6px 0 16px' }}>
                Raah searched the next 48 hours.
                {rec?.action_code === 'REC_DELAY' && options[0] && requested
                  ? (() => {
                      const d = parseIso(options[0].depart_time);
                      const h = d ? hoursBetween(requested, d) : 0;
                      return h > 0 ? ` Waiting about ${h} hours lowers the route risk.` : '';
                    })()
                  : ''}
              </p>
              <div className="stack" style={{ gap: 12 }}>
                {options.slice(0, 4).map((o, i) => {
                  const d = parseIso(o.depart_time);
                  const delta = d && requested ? hoursBetween(requested, d) : 0;
                  const isCurrent = delta === 0;
                  const lvl = levelFromText(o.max_risk_level);
                  const best = i === 0;
                  return (
                    <div key={o.depart_time} className={`option ${best ? 'best' : ''}`}>
                      <div style={{ flex: 1 }}>
                        {best ? (
                          <div className="eyebrow" style={{ color: 'var(--green-ink)' }}>
                            Best window{isCurrent ? ' · your time' : ` · ${delta > 0 ? '+' : ''}${delta} h`}
                          </div>
                        ) : null}
                        <div className="when">{d ? `${shortDay(d)} · ${clock24(d)}` : o.depart_time}</div>
                        <div className="row" style={{ gap: 8, marginTop: 4 }}>
                          <LevelBadge level={lvl} />
                          {!best && !isCurrent ? (
                            <span className="small muted">
                              {delta > 0 ? '+' : ''}
                              {delta} h
                            </span>
                          ) : null}
                        </div>
                      </div>
                      {isCurrent ? (
                        <span className="small strong muted">Selected</span>
                      ) : (
                        <button
                          type="button"
                          className={`btn btn-sm ${best ? 'btn-primary' : 'btn-outline'}`}
                          onClick={() => d && onSelectTime(d)}
                          aria-label={`Select ${d ? `${weekday(d)} ${clock24(d)}` : o.depart_time}`}
                        >
                          Select
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <p className="muted" style={{ marginTop: 8 }}>
              No better time to leave in the next 48 hours than the one you chose.
            </p>
          )}
        </div>

        <div className="card card-pad">
          <h3>Rain along the route</h3>
          <div className="stat-row">
            {sum.weather.rain24 != null ? (
              <Stat label="Last 24 h" value={Math.round(sum.weather.rain24)} unit="mm" />
            ) : (
              <Stat
                label="Last 3 days"
                value={sum.weather.rain3d == null ? '—' : Math.round(sum.weather.rain3d)}
                unit={sum.weather.rain3d == null ? undefined : 'mm'}
              />
            )}
            <Stat
              label="Next 24 h"
              value={sum.weather.next24 == null ? '—' : Math.round(sum.weather.next24)}
              unit={sum.weather.next24 == null ? undefined : 'mm'}
            />
            <Stat
              label="Next 72 h"
              value={sum.weather.next72 == null ? '—' : Math.round(sum.weather.next72)}
              unit={sum.weather.next72 == null ? undefined : 'mm'}
            />
          </div>
          <p className="small muted" style={{ marginTop: 10 }}>
            Average of the stretches on your route.
            {sum.weather.atEta != null
              ? ` Up to ${Math.round(sum.weather.atEta)} mm over 3 days on the wettest stretch by the time you reach it.`
              : ''}
            {weatherNote ? ` Weather: ${weatherNote}.` : ''}
          </p>
        </div>

        <div className="card card-pad">
          <h3>If you have to stop and wait</h3>
          <p className="muted" style={{ marginBottom: 12 }}>
            Wait in a valley town with fuel, food and places to stay, not below steep slopes.
          </p>
          {sum.waitTowns.length ? (
            <div className="stack" style={{ gap: 8 }}>
              {sum.waitTowns.map((w) => (
                <div key={w.name} className="wait-row">
                  <span className="strong">{w.name}</span>
                  <span className="muted">
                    km {Math.round(w.km)}
                    {w.beforeRisk ? ' · before the risky stretches' : ''}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p>Wait in the town you start from. Srinagar, Rudraprayag and Karnaprayag are the main valley towns on NH-7.</p>
          )}
          <ul className="bullets" style={{ marginTop: 16 }}>
            <li>Drive in daylight. Most slides happen during or just after heavy rain.</li>
            <li>Do not stop below steep slopes or fresh cuttings.</li>
            <li>If you see stones falling, stop well back and wait.</li>
            <li>Keep fuel, water and a charged phone. Signal drops on many stretches.</li>
          </ul>
        </div>

        <Disclaimer>
          Raah never says a road is safe. It supports your decision; it is not an official warning. Follow BRO, SDRF and
          police instructions. Emergency: 112.
        </Disclaimer>
      </aside>
    </div>
  );
}
