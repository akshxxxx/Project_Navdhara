import { useQueryClient } from '@tanstack/react-query';
import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import { Check, CircleCheck, Crosshair, MapPin, RefreshCw, Send, TriangleAlert } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { ApiError, api, connectionHelp } from '@/api/client';
import { useCorridor, useFieldReports } from '@/api/hooks';
import { KEYS, readJson, writeJson } from '@/api/storage';
import type { FieldReport } from '@/api/types';
import { AppHeader } from '@/components/AppHeader';
import { PickerSheet } from '@/components/PickerSheet';
import { Button, Card, Chip, Notice, Txt } from '@/components/ui';
import { CORRIDOR_KM, nearestTown } from '@/domain/corridor';
import { locateOnRoad, midpoint, pointAtKm } from '@/domain/geo';
import { LEVELS } from '@/domain/levels';
import { encodeDescription, MAX_DESCRIPTION, parseDescription, REPORT_TYPES, type ReportType } from '@/domain/reports';
import type { LatLng, Stretch } from '@/domain/stretch';
import { relativeStamp } from '@/domain/time';
import { colors, fonts, radius } from '@/theme/tokens';

interface Spot {
  point: LatLng;
  km: number;
  town: string;
  offRoadKm: number;
  source: 'gps' | 'stretch' | 'km';
}

export default function ReportsScreen() {
  const params = useLocalSearchParams<{ stretch?: string; tab?: string }>();
  const [tab, setTab] = useState<'send' | 'recent'>('send');
  const [sentId, setSentId] = useState<number | null>(null);
  // "Report" from a stretch page opens the form
  const [seenStretch, setSeenStretch] = useState<string | undefined>(undefined);
  if (params.stretch !== seenStretch) {
    setSeenStretch(params.stretch);
    if (params.stretch) setTab('send');
  }

  return (
    <View style={{ flex: 1 }}>
      <AppHeader title="Reports" />
      <View style={styles.segmented}>
        {(['send', 'recent'] as const).map((t) => (
          <Pressable
            key={t}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === t }}
            onPress={() => setTab(t)}
            style={[styles.segment, tab === t && styles.segmentActive]}>
            <Txt variant="bodyStrong" color={tab === t ? colors.ink : colors.inkMuted} style={{ fontSize: 14 }}>
              {t === 'send' ? 'Send a report' : 'Recent reports'}
            </Txt>
          </Pressable>
        ))}
      </View>
      {tab === 'send' ? (
        <SendReport
          presetStretch={params.stretch}
          onSent={(id) => {
            setSentId(id);
            setTab('recent');
          }}
        />
      ) : (
        <RecentReports sentId={sentId} />
      )}
    </View>
  );
}

function SendReport({ presetStretch, onSent }: { presetStretch?: string; onSent: (id: number) => void }) {
  const { corridor } = useCorridor();
  const queryClient = useQueryClient();
  const [type, setType] = useState<ReportType | null>(null);
  const [spot, setSpot] = useState<Spot | null>(null);
  const [kmText, setKmText] = useState('');
  const [text, setText] = useState('');
  const [name, setName] = useState('');
  const [consent, setConsent] = useState(false);
  const [locating, setLocating] = useState(false);
  const [picker, setPicker] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const stretches = corridor?.stretches ?? [];

  const spotFromStretch = (s: Stretch): Spot => {
    const point = midpoint(s);
    const pos = locateOnRoad(point, [s]);
    const km = pos?.km ?? (s.kmStart + s.kmEnd) / 2;
    return { point, km, town: nearestTown(km).name, offRoadKm: 0, source: 'stretch' };
  };

  // Pre-fill the place from the stretch the traveller came from, once the map data is in
  const presetKey = presetStretch && corridor ? presetStretch : null;
  const [seenPreset, setSeenPreset] = useState<string | null>(null);
  if (presetKey !== seenPreset) {
    setSeenPreset(presetKey);
    const s = presetKey ? corridor?.byId[presetKey] : null;
    if (s) setSpot(spotFromStretch(s));
  }

  const locateMe = async () => {
    setLocError(null);
    setLocating(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') {
        setLocError('Location is off for Raah. Allow it, or pick the stretch with Change.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const point: LatLng = [pos.coords.latitude, pos.coords.longitude];
      const road = locateOnRoad(point, stretches);
      if (!road) throw new Error('no road');
      setKmText('');
      setSpot({ point, km: road.km, town: road.town, offRoadKm: road.offRoadKm, source: 'gps' });
    } catch {
      setLocError('Could not get your location. Pick the stretch with Change instead.');
    } finally {
      setLocating(false);
    }
  };

  const applyKm = (value: string) => {
    setKmText(value);
    const km = Number(value.replace(',', '.'));
    if (!value.trim() || Number.isNaN(km)) return;
    if (km < 0 || km > CORRIDOR_KM) {
      setLocError(`NH-7 runs from km 0 (Rishikesh) to km ${Math.floor(CORRIDOR_KM)} (Joshimath).`);
      return;
    }
    const point = pointAtKm(km, stretches);
    if (point) {
      setLocError(null);
      setSpot({ point, km, town: nearestTown(km).name, offRoadKm: 0, source: 'km' });
    }
  };

  const tooFar = spot != null && spot.offRoadKm > 3;
  const textOk = text.trim().length >= 5;
  const nameOk = name.trim().length === 0 || name.trim().length >= 2;
  const ready = !!type && !!spot && !tooFar && textOk && nameOk && consent;

  const missing = [
    !type && 'what you saw',
    !spot && 'where it is',
    !textOk && 'a short description (5+ letters)',
    !consent && 'your agreement to share',
  ].filter(Boolean) as string[];

  const send = async () => {
    if (!ready || !type || !spot) return;
    setSending(true);
    setSendError(null);
    try {
      const res = await api.sendReport({
        lat: spot.point[0],
        lng: spot.point[1],
        description: encodeDescription(type, spot.km, text),
        reporter_name: name.trim() || 'Traveller',
      });
      const mine = (await readJson<number[]>(KEYS.myReports)) ?? [];
      await writeJson(KEYS.myReports, [res.report_id, ...mine].slice(0, 50));
      await queryClient.invalidateQueries({ queryKey: ['field-reports'] });
      setType(null);
      setText('');
      setConsent(false);
      onSent(res.report_id);
    } catch (e) {
      const err = e instanceof ApiError ? e : null;
      if (!err || err.status === 0)
        setSendError(`${connectionHelp(e)} Your report is still here: try again when you have signal.`);
      else if (err.status === 409)
        setSendError('You already reported this place in the last 10 minutes. Thank you, one report is enough.');
      else if (err.status === 429)
        setSendError('Too many reports from this network in the last minute. Wait a minute and send again.');
      else if (err.status === 422)
        setSendError(
          err.detail?.includes('3.0 km')
            ? 'This place is more than 3 km from NH-7. Reports must be on or next to the road.'
            : err.detail || 'Please check the report and try again.',
        );
      else setSendError(err.detail || 'The report could not be sent. Try again.');
    } finally {
      setSending(false);
    }
  };

  const spotTitle = spot ? `Near ${spot.town}, km ${Math.round(spot.km)}` : 'Not set yet';
  const spotSub = spot
    ? spot.source === 'gps'
      ? tooFar
        ? `From your GPS · ${spot.offRoadKm.toFixed(1)} km from NH-7`
        : 'From your GPS · on NH-7'
      : spot.source === 'km'
        ? 'From the km you typed'
        : 'Middle of the stretch you picked'
    : 'Use your location or pick the stretch';

  return (
    <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
      <Txt variant="h3" style={styles.q}>
        What did you see?
      </Txt>
      <View style={styles.grid}>
        {REPORT_TYPES.map((t) => {
          const active = type?.id === t.id;
          const Icon = t.icon;
          return (
            <Pressable
              key={t.id}
              accessibilityRole="radio"
              accessibilityState={{ checked: active }}
              onPress={() => setType(t)}
              style={[styles.typeTile, active && styles.typeActive]}>
              <Icon size={28} color={colors.ink} strokeWidth={1.8} />
              <Txt variant="smallStrong" style={{ fontSize: 13, textAlign: 'center' }}>
                {t.label}
              </Txt>
            </Pressable>
          );
        })}
      </View>

      <Txt variant="h3" style={styles.q}>
        Where is it?
      </Txt>
      <Card style={{ gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <View style={[styles.locIcon, { backgroundColor: spot && !tooFar ? colors.greenSoft : colors.chip }]}>
            {spot && !tooFar ? <Check size={28} color={colors.green} /> : <MapPin size={26} color={colors.inkMuted} />}
          </View>
          <View style={{ flex: 1 }}>
            <Txt variant="bodyStrong" style={{ fontSize: 15 }}>
              {spotTitle}
            </Txt>
            <Txt variant="small" color={tooFar ? LEVELS.severe.ink : colors.inkMuted} style={{ fontSize: 15 }}>
              {spotSub}
            </Txt>
          </View>
          <Button compact kind="outline" label="Change" onPress={() => setPicker(true)} />
        </View>
        <Button
          kind="outline"
          icon={Crosshair}
          label="Use my current location"
          loading={locating}
          onPress={locateMe}
          compact
        />
        <View style={styles.kmRow}>
          <Txt color={colors.inkMuted} style={{ flex: 1 }}>
            NH-7 km stone, if you know it
          </Txt>
          <TextInput
            value={kmText}
            onChangeText={applyKm}
            placeholder="e.g. 114"
            placeholderTextColor={colors.inkFaint}
            keyboardType="decimal-pad"
            style={[styles.input, { width: 110, height: 48 }]}
            accessibilityLabel="NH-7 kilometre"
            maxLength={6}
          />
        </View>
        {locError ? <Notice tone="warn" title={locError} /> : null}
        {tooFar ? (
          <Notice
            tone="error"
            title="Too far from NH-7"
            body="Reports must be within 3 km of the road. Pick the stretch with Change if you are reporting for someone else."
          />
        ) : null}
      </Card>

      <Txt variant="h3" style={styles.q}>
        What is happening?
      </Txt>
      <TextInput
        value={text}
        onChangeText={(v) => setText(v.slice(0, MAX_DESCRIPTION))}
        placeholder="For example: small stones falling on the uphill side near the bend. One lane is open."
        placeholderTextColor={colors.inkFaint}
        multiline
        style={[styles.input, styles.textarea]}
        accessibilityLabel="Describe what is happening"
      />
      <Txt variant="small" color={colors.inkMuted} style={{ textAlign: 'right', marginTop: 6 }}>
        {text.length} / {MAX_DESCRIPTION}
      </Txt>

      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="Your name or role (optional), e.g. taxi driver"
        placeholderTextColor={colors.inkFaint}
        style={[styles.input, { marginTop: 8, height: 48 }]}
        maxLength={60}
        accessibilityLabel="Your name or role, optional"
      />

      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: consent }}
        onPress={() => setConsent((v) => !v)}
        style={styles.consent}>
        <View style={[styles.checkbox, consent && { backgroundColor: colors.navy, borderColor: colors.navy }]}>
          {consent ? <Check size={18} color={colors.white} strokeWidth={3} /> : null}
        </View>
        <Txt style={{ flex: 1, fontSize: 14 }}>
          I agree to share this report, its place and the name above to help keep NH-7 safe.
        </Txt>
      </Pressable>

      {sendError ? (
        <View style={{ marginTop: 14 }}>
          <Notice tone="error" icon={TriangleAlert} title="Not sent" body={sendError} />
        </View>
      ) : null}

      <Button
        label="Send report"
        icon={Send}
        onPress={send}
        disabled={!ready}
        loading={sending}
        style={{ marginTop: 18, minHeight: 54 }}
      />
      {!ready && missing.length ? (
        <Txt variant="small" color={colors.inkMuted} style={{ textAlign: 'center', marginTop: 8 }}>
          Still needed: {missing.join(', ')}.
        </Txt>
      ) : null}
      <Pressable onPress={() => router.navigate('/emergency')} accessibilityRole="link">
        <Txt
          variant="bodyStrong"
          color={LEVELS.severe.ink}
          style={{ textAlign: 'center', marginTop: 18, fontSize: 14 }}>
          Someone hurt or in danger? Call 112 first.
        </Txt>
      </Pressable>

      <Card style={{ marginTop: 24, gap: 6 }}>
        <Txt variant="bodyStrong" style={{ fontSize: 14 }}>
          What happens to your report
        </Txt>
        {[
          'Officials check every report. Until then it shows as Pending.',
          'A verified report can raise its stretch by one level on everyone’s map. The effect fades over about two days.',
          'A rejected report changes nothing.',
          'Report only what you see yourself. Stop safely before you type.',
        ].map((t) => (
          <Txt key={t}>• {t}</Txt>
        ))}
      </Card>

      <PickerSheet
        visible={picker}
        title="Which stretch?"
        options={stretches.map((s) => ({
          value: s.id,
          label: s.name,
          hint: `km ${Math.round(s.kmStart)}–${Math.round(s.kmEnd)}`,
        }))}
        value={null}
        onPick={(id) => {
          const s = corridor?.byId[id];
          if (s) {
            setKmText('');
            setLocError(null);
            setSpot(spotFromStretch(s));
          }
        }}
        onClose={() => setPicker(false)}
      />
    </ScrollView>
  );
}

function RecentReports({ sentId }: { sentId: number | null }) {
  const reports = useFieldReports();
  const { corridor } = useCorridor();
  const [mine, setMine] = useState<number[]>([]);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    readJson<number[]>(KEYS.myReports).then((ids) => setMine(ids ?? []));
  }, [sentId]);

  const items = useMemo(() => {
    const list = reports.data ?? [];
    return list
      .map((r) => ({ r, p: parseDescription(r.description) }))
      .filter(({ p }) => filter === 'all' || p.type.id === filter);
  }, [reports.data, filter]);

  const place = (r: FieldReport, km: number | null) => {
    if (km != null) return `${nearestTown(km).name}, km ${Math.round(km)}`;
    const pos = corridor ? locateOnRoad([r.lat, r.lng], corridor.stretches) : null;
    return pos ? `${pos.town}, km ${Math.round(pos.km)}` : `${r.lat.toFixed(3)}, ${r.lng.toFixed(3)}`;
  };

  return (
    <ScrollView contentContainerStyle={styles.body}>
      {sentId ? (
        <Notice
          tone="ok"
          icon={CircleCheck}
          title="Report sent. Thank you!"
          body="It is Pending until officials check it. If verified, the stretch's risk goes up on the map."
        />
      ) : null}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 10, paddingVertical: 14 }}>
        <Chip label="All" active={filter === 'all'} onPress={() => setFilter('all')} />
        {REPORT_TYPES.map((t) => (
          <Chip key={t.id} label={t.label} active={filter === t.id} onPress={() => setFilter(t.id)} />
        ))}
      </ScrollView>

      {reports.isPending ? <ActivityIndicator color={colors.navy} style={{ marginTop: 24 }} /> : null}
      {reports.isError ? (
        <View style={{ gap: 12 }}>
          <Notice tone="error" title="Could not load reports" body={connectionHelp(reports.error)} />
          <Button kind="outline" icon={RefreshCw} label="Try again" onPress={() => reports.refetch()} />
        </View>
      ) : null}
      {reports.data && !items.length ? (
        <Card>
          <Txt>{filter === 'all' ? 'No reports yet.' : 'No reports of this type yet.'}</Txt>
        </Card>
      ) : null}

      <View style={{ gap: 14 }}>
        {items.map(({ r, p }) => {
          const isMine = mine.includes(r.id);
          const status = r.status === 'verified' ? 'Verified' : r.status === 'rejected' ? 'Rejected' : 'Pending';
          const statusStyle =
            status === 'Verified'
              ? { backgroundColor: colors.greenSoft, color: '#1E5C3F', borderColor: colors.greenSoft }
              : status === 'Rejected'
                ? { backgroundColor: LEVELS.severe.tint, color: LEVELS.severe.ink, borderColor: LEVELS.severe.tint }
                : { backgroundColor: colors.white, color: colors.inkMuted, borderColor: colors.lineStrong };
          return (
            <View key={r.id} style={[styles.reportCard, isMine && r.id === sentId && styles.reportMine]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Txt
                  variant={isMine ? 'smallStrong' : 'small'}
                  color={isMine ? colors.teal : colors.inkMuted}
                  style={{ flex: 1, fontSize: 13 }}
                  numberOfLines={1}>
                  {isMine
                    ? `YOUR REPORT · ${relativeStamp(r.created_at)}`
                    : `${relativeStamp(r.created_at)} · ${r.reporter_name}`}
                </Txt>
                <View
                  style={[
                    styles.status,
                    { backgroundColor: statusStyle.backgroundColor, borderColor: statusStyle.borderColor },
                  ]}>
                  <Txt variant="eyebrow" color={statusStyle.color}>
                    {status}
                  </Txt>
                </View>
              </View>
              <Txt variant="h3" style={{ fontSize: 16, marginTop: 8, fontFamily: fonts.bodyBold }}>
                {p.type.label} · {place(r, p.km)}
              </Txt>
              <Txt color={colors.inkMuted} style={{ fontSize: 14, marginTop: 4 }}>
                {p.text}
              </Txt>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  segmented: {
    flexDirection: 'row',
    margin: 20,
    marginBottom: 0,
    padding: 6,
    borderRadius: radius.lg,
    backgroundColor: '#DDE3E7',
  },
  segment: { flex: 1, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md },
  segmentActive: { backgroundColor: colors.white },
  body: { padding: 20, paddingBottom: 48 },
  q: { fontSize: 17, marginTop: 8, marginBottom: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 },
  typeTile: {
    width: '30%',
    flexGrow: 1,
    minHeight: 90,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 8,
  },
  typeActive: { borderWidth: 3, borderColor: colors.navy, backgroundColor: colors.yellowSoft },
  locIcon: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  kmRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  input: {
    borderWidth: 1.5,
    borderColor: colors.lineStrong,
    borderRadius: radius.md,
    backgroundColor: colors.white,
    paddingHorizontal: 16,
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.ink,
  },
  textarea: { minHeight: 120, paddingTop: 14, textAlignVertical: 'top', lineHeight: 21 },
  consent: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 18 },
  checkbox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.lineStrong,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reportCard: { backgroundColor: colors.white, borderRadius: radius.lg, padding: 18 },
  reportMine: { borderWidth: 3, borderColor: colors.navy, padding: 15 },
  status: { borderWidth: 1.5, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 4 },
});
