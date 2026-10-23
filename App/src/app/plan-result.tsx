import { router, useLocalSearchParams } from 'expo-router';
import { ChevronRight, CloudRain, Construction, RefreshCw, Server } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ApiError, connectionHelp, getApiUrl } from '@/api/client';
import { useCorridor, useTrip } from '@/api/hooks';
import type { RouteRiskResponse, RouteSegment } from '@/api/types';
import { AppHeader } from '@/components/AppHeader';
import { CorridorMap } from '@/components/CorridorMap';
import { ServerSheet } from '@/components/ServerSheet';
import { Button, Card, Disclaimer, LevelBadge, Notice, SectionTitle, StatTile, Txt } from '@/components/ui';
import { routeSegments, segmentInfo, townByName, TOWNS, WAIT_TOWNS } from '@/domain/corridor';
import { LEVELS, levelFromText, worst, type LevelKey } from '@/domain/levels';
import type { LatLng } from '@/domain/stretch';
import { clock24, dayLabel, durationLabel, hoursBetween, istDateKey, parseIso, shortDay } from '@/domain/time';
import { colors, radius } from '@/theme/tokens';

const ACTIONS: Record<string, { tag: string; title: string; level: LevelKey }> = {
  REC_AVOID: { tag: 'Avoid', title: 'Avoid this trip for now', level: 'severe' },
  REC_DELAY: { tag: 'Delay', title: 'Delay your trip if you can', level: 'high' },
  REC_CAUTION: { tag: 'Caution', title: 'Go with caution', level: 'moderate' },
  REC_LOW_RISK_CAUTION: { tag: 'Low risk', title: 'Low risk – proceed with caution', level: 'low' },
};

/** Risk when you reach a stretch, never lower than its live adjusted level (reports, sensors) */
function levelAtEta(s: RouteSegment): LevelKey {
  if (s.closure?.status === 'closed') return 'closed';
  const atEta = levelFromText(s.risk_level_at_eta ?? s.risk_level);
  return s.adjusted_risk_level ? worst(atEta, levelFromText(s.adjusted_risk_level)) : atEta;
}

const townAtKm = (km: number) => TOWNS.find((t) => Math.abs(t.km - km) < 0.01)?.name ?? `km ${Math.round(km)}`;

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

  const rows = segs.map((s) => {
    const info = segmentInfo(s.id);
    const km = info ? (forward ? info.kmStart : info.kmEnd) : 0;
    return { id: s.id, town: townAtKm(km), km, eta: parseIso(s.eta_ist), level: levels[s.id] as LevelKey | null };
  });
  rows.push({ id: 'arrive', town: toTown, km: townByName(toTown)?.km ?? 0, eta: arrive, level: null });

  const maxOf = (pick: (s: RouteSegment) => number | null | undefined) => {
    const vals = segs.map(pick).filter((v): v is number => typeof v === 'number');
    return vals.length ? Math.max(...vals) : null;
  };
  const fromKm = townByName(fromTown)?.km ?? 0;
  const toKm = townByName(toTown)?.km ?? 0;
  return {
    forward,
    levels,
    overall,
    risky: segs.filter((s) => LEVELS[levels[s.id]].rank >= 2),
    closures: segs.filter((s) => s.closure),
    start,
    hours: start && arrive ? (arrive.getTime() - start.getTime()) / 3600000 : null,
    distance: Math.round(Math.abs(toKm - fromKm)),
    rows,
    weather: {
      rain24: maxOf((s) => s.rain_24h_mm),
      next24: maxOf((s) => s.forecast_24h_mm),
      next72: maxOf((s) => s.forecast_72h_mm),
      atEta: maxOf((s) => s.rain_72h_at_eta_mm),
    },
    waitTowns: WAIT_TOWNS.filter((w) => {
      const km = townByName(w)?.km ?? -1;
      return km > Math.min(fromKm, toKm) && km < Math.max(fromKm, toKm);
    }),
  };
}

export default function PlanResultScreen() {
  const p = useLocalSearchParams<{ from: string; to: string; date: string; time: string }>();
  const segs = p.from && p.to ? routeSegments(p.from, p.to) : null;
  const departTime = `${p.date}T${p.time}:00`;
  const trip = useTrip(segs ? { ...segs, departTime } : null);
  const { corridor } = useCorridor();
  const [serverOpen, setServerOpen] = useState(false);
  const sum = useMemo(() => (trip.data ? summarise(trip.data, p.from, p.to) : null), [trip.data, p.from, p.to]);

  const header = (
    <AppHeader back title={`${p.from} → ${p.to}`} subtitle={`${p.date ? dayLabel(p.date) : ''} · leave ${p.time}`} />
  );

  if (!segs) {
    return (
      <View style={{ flex: 1 }}>
        {header}
        <View style={styles.body}>
          <Notice tone="error" title="This route is not on NH-7" body="Go back and pick two different towns." />
        </View>
      </View>
    );
  }

  if (trip.isPending) {
    return (
      <View style={{ flex: 1 }}>
        {header}
        <View style={[styles.body, { alignItems: 'center', paddingTop: 60 }]}>
          <ActivityIndicator size="large" color={colors.navy} />
          <Txt color={colors.inkMuted} style={{ marginTop: 12 }}>
            Checking every stretch for the hour you reach it…
          </Txt>
          <Txt variant="small" color={colors.inkFaint} style={{ marginTop: 6 }}>
            Asking {getApiUrl()}
          </Txt>
        </View>
      </View>
    );
  }

  if (trip.isError || !trip.data || !sum) {
    const err = trip.error;
    const msg =
      err instanceof ApiError && err.status === 0
        ? `${connectionHelp(err)} Check your connection, or the server address. The Map tab still shows the last saved risk.`
        : err instanceof ApiError && err.detail
          ? err.detail
          : 'The trip check failed. Try again in a minute.';
    return (
      <View style={{ flex: 1 }}>
        {header}
        <View style={[styles.body, { gap: 16 }]}>
          <Notice tone="error" title="Could not check this trip" body={msg} />
          <Button label="Try again" icon={RefreshCw} loading={trip.isFetching} onPress={() => trip.refetch()} />
          {err instanceof ApiError && err.status === 0 ? (
            <Button kind="outline" icon={Server} label="Change server address" onPress={() => setServerOpen(true)} />
          ) : null}
        </View>
        {serverOpen ? (
          <ServerSheet
            visible
            onClose={() => {
              setServerOpen(false);
              trip.refetch();
            }}
          />
        ) : null}
      </View>
    );
  }

  const res = trip.data;
  const rec = res.recommendation;
  const action = ACTIONS[rec?.action_code ?? ''] ?? ACTIONS.REC_CAUTION;
  const actionLevel = LEVELS[action.level];
  const requested = parseIso(departTime);
  const routeIds = res.segments.map((s) => s.id);
  const first = corridor?.byId[routeIds[0]];
  const lastS = corridor?.byId[routeIds[routeIds.length - 1]];
  const startPt: LatLng | undefined = first
    ? sum.forward
      ? first.coords[0]
      : first.coords[first.coords.length - 1]
    : undefined;
  const endPt: LatLng | undefined = lastS
    ? sum.forward
      ? lastS.coords[lastS.coords.length - 1]
      : lastS.coords[0]
    : undefined;

  return (
    <View style={{ flex: 1 }}>
      {header}
      <ScrollView contentContainerStyle={styles.body}>
        <View style={[styles.banner, { backgroundColor: actionLevel.tint }]}>
          <View style={styles.bannerHead}>
            <View style={[styles.tag, { backgroundColor: actionLevel.color }]}>
              <Txt variant="eyebrow" color={colors.white} style={{ fontSize: 15 }}>
                {action.tag}
              </Txt>
            </View>
            <Txt variant="h2" color={actionLevel.ink} style={{ flex: 1, fontSize: 21, lineHeight: 24 }}>
              {action.title}
            </Txt>
          </View>
          <Txt style={{ marginTop: 10, fontSize: 14, lineHeight: 20 }}>{rec?.reason || res.advisory}</Txt>
        </View>

        <View style={styles.stats}>
          <StatTile label="Distance" value={`${sum.distance}`} unit="km" />
          <StatTile label="Driving" value={sum.hours != null ? `~${durationLabel(sum.hours)}` : '—'} />
        </View>
        <View style={styles.stats}>
          <StatTile label="Overall" value={LEVELS[sum.overall].label} valueColor={LEVELS[sum.overall].ink} />
          <StatTile label="Risky stretches" value={String(sum.risky.length)} unit={`of ${routeIds.length}`} />
        </View>

        {corridor ? (
          <View style={styles.mapCard}>
            <CorridorMap
              style={{ height: 280 }}
              stretches={corridor.stretches}
              visibleIds={routeIds}
              levelOverride={sum.levels}
              focusIds={routeIds}
              focusKey={routeIds.join()}
              markers={{ start: startPt, end: endPt }}
              onSelect={(id) => router.push(`/stretch/${id}`)}
            />
          </View>
        ) : null}
        <Txt variant="small" color={colors.inkMuted} style={{ marginTop: 6 }}>
          Route coloured by the risk expected when you reach each stretch. Tap a stretch for details.
        </Txt>

        {rec?.best_departure_options?.length ? (
          <>
            <SectionTitle>Safer times to leave</SectionTitle>
            <View style={{ gap: 12 }}>
              {rec.best_departure_options.slice(0, 4).map((o, i) => {
                const d = parseIso(o.depart_time);
                const delta = d && requested ? hoursBetween(requested, d) : 0;
                const isCurrent = delta === 0;
                const lvl = levelFromText(o.max_risk_level);
                const best = i === 0;
                return (
                  <View key={o.depart_time} style={[styles.option, best && { backgroundColor: colors.greenSoft }]}>
                    <View style={{ flex: 1 }}>
                      {best ? (
                        <Txt variant="eyebrow" color="#1E5C3F">
                          Best window{isCurrent ? ' · your time' : ` · ${delta > 0 ? '+' : ''}${delta} h`}
                        </Txt>
                      ) : null}
                      <Txt variant="h3" style={{ fontSize: 18 }}>
                        {d ? `${shortDay(d)} · ${clock24(d)}` : o.depart_time}
                      </Txt>
                      <Txt variant="bodyStrong" color={LEVELS[lvl].ink}>
                        {LEVELS[lvl].label} route risk
                        {!best && !isCurrent ? ` · ${delta > 0 ? '+' : ''}${delta} h` : ''}
                      </Txt>
                    </View>
                    {isCurrent ? (
                      <Txt variant="smallStrong" color={colors.inkMuted}>
                        Selected
                      </Txt>
                    ) : (
                      <Button
                        compact
                        label="Select"
                        kind={best ? 'primary' : 'outline'}
                        onPress={() => d && router.setParams({ date: istDateKey(d), time: clock24(d) })}
                      />
                    )}
                  </View>
                );
              })}
            </View>
          </>
        ) : null}

        <SectionTitle>Route breakdown</SectionTitle>
        <Card padded={false}>
          {sum.rows.map((r, i) => (
            <View key={r.id} style={[styles.bdRow, i > 0 && styles.bdBorder]}>
              <Txt variant="bodyStrong" style={{ width: 64, fontSize: 14 }}>
                {r.eta ? clock24(r.eta) : '—'}
              </Txt>
              <View style={{ flex: 1 }}>
                <Txt variant="bodyStrong" style={{ fontSize: 15 }}>
                  {r.town}
                </Txt>
                <Txt variant="small" color={colors.inkMuted}>
                  km {Math.round(r.km)}
                  {r.level ? '' : ' · arrive'}
                </Txt>
              </View>
              {r.level ? <LevelBadge level={r.level} text={LEVELS[r.level].label} dot={false} /> : null}
            </View>
          ))}
        </Card>
        <Txt variant="small" color={colors.inkMuted} style={{ marginTop: 6 }}>
          Times assume about {Math.round(res.speed_kmph ?? 30)} km/h. Each level is for the stretch you enter at that
          town, at the time you get there.
        </Txt>

        {sum.risky.length ? (
          <>
            <SectionTitle>High-risk stretches on your route</SectionTitle>
            <Card padded={false}>
              {sum.risky.map((s, i) => {
                const eta = parseIso(s.eta_ist);
                return (
                  <Pressable
                    key={s.id}
                    onPress={() => router.push(`/stretch/${s.id}`)}
                    style={[styles.bdRow, i > 0 && styles.bdBorder]}
                    accessibilityRole="button">
                    <View style={{ flex: 1, gap: 6 }}>
                      <LevelBadge level={sum.levels[s.id]} />
                      <Txt variant="bodyStrong" style={{ fontSize: 14 }}>
                        {s.name}
                      </Txt>
                      <Txt variant="small" color={colors.inkMuted}>
                        {eta ? `You reach it around ${clock24(eta)}` : ''}
                        {s.rain_72h_at_eta_mm != null
                          ? ` · ${Math.round(s.rain_72h_at_eta_mm)} mm rain over 3 days by then`
                          : ''}
                      </Txt>
                    </View>
                    <ChevronRight size={22} color={colors.inkMuted} />
                  </Pressable>
                );
              })}
            </Card>
          </>
        ) : null}

        {sum.closures.length ? (
          <>
            <SectionTitle>Closures on your route</SectionTitle>
            <View style={{ gap: 10 }}>
              {sum.closures.map((s) => (
                <Notice
                  key={s.id}
                  tone="error"
                  icon={Construction}
                  title={`${s.name}: ${s.closure!.status === 'closed' ? 'closed' : s.closure!.status === 'one_way' ? 'one way' : 'restricted'}`}
                  body={`${s.closure!.reason} · ${s.closure!.source}`}
                />
              ))}
            </View>
          </>
        ) : null}

        <SectionTitle>Weather along the route</SectionTitle>
        {/* The 24/72 h figures come only from the hourly forecast mode; hide empty tiles */}
        {sum.weather.rain24 != null || sum.weather.next24 != null || sum.weather.next72 != null ? (
          <View style={styles.stats}>
            <StatTile
              label="Rain 24 h"
              value={fmt(sum.weather.rain24)}
              unit={sum.weather.rain24 == null ? undefined : 'mm'}
            />
            <StatTile
              label="Next 24 h"
              value={fmt(sum.weather.next24)}
              unit={sum.weather.next24 == null ? undefined : 'mm'}
            />
            <StatTile
              label="Next 72 h"
              value={fmt(sum.weather.next72)}
              unit={sum.weather.next72 == null ? undefined : 'mm'}
            />
          </View>
        ) : null}
        <Card style={{ marginTop: 12 }}>
          <Txt>
            {sum.weather.atEta != null
              ? `Up to ${Math.round(sum.weather.atEta)} mm of rain over 3 days on the wettest stretch, by the time you reach it.`
              : 'No rain figures for this route right now.'}
          </Txt>
          <Txt variant="small" color={colors.inkMuted} style={{ marginTop: 4 }}>
            Tiles show the wettest stretch on the route{res.weather_source ? ` · weather ${res.weather_source}` : ''}
          </Txt>
        </Card>

        <SectionTitle>Where to wait</SectionTitle>
        <Card>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <CloudRain size={26} color={colors.teal} />
            <Txt style={{ flex: 1 }}>
              {sum.waitTowns.length
                ? `${sum.waitTowns.join(', ')} ${sum.waitTowns.length > 1 ? 'are valley towns' : 'is a valley town'} on your way with fuel, food and places to stay. Wait there if the rain gets heavy.`
                : 'Wait in the town you start from if the rain gets heavy. Srinagar, Rudraprayag and Karnaprayag are the main valley towns on NH-7.'}
            </Txt>
          </View>
          <View style={{ marginTop: 14, gap: 6 }}>
            {[
              'Drive in daylight. Most slides happen during or just after heavy rain.',
              'Do not stop below steep slopes or fresh cuttings.',
              'If you see stones falling, stop well back and wait.',
              'Keep fuel, water and a charged phone. Signal drops on many stretches.',
            ].map((t) => (
              <Txt key={t}>• {t}</Txt>
            ))}
          </View>
        </Card>

        <Disclaimer text="Raah never says a route is safe · Not an official warning · Emergency 112" />
      </ScrollView>
    </View>
  );
}

const fmt = (v: number | null) => (v == null ? '—' : String(Math.round(v)));

const styles = StyleSheet.create({
  body: { padding: 20, paddingBottom: 48 },
  banner: { borderRadius: radius.lg, padding: 20 },
  bannerHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  tag: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: radius.pill },
  stats: { flexDirection: 'row', gap: 10, marginTop: 12 },
  mapCard: { marginTop: 16, borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1.5, borderColor: colors.line },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: 18,
  },
  bdRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 18, paddingVertical: 14 },
  bdBorder: { borderTopWidth: 1, borderTopColor: colors.line },
});
