import { useQueryClient } from '@tanstack/react-query';
import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import {
  Camera,
  Check,
  CircleCheck,
  Crosshair,
  ImagePlus,
  MapPin,
  RefreshCw,
  Send,
  TriangleAlert,
  X,
} from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

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
import { getReportPhoto, type PhotoSource, type ReportPhoto } from '@/domain/photo';
import { encodeDescription, MAX_DESCRIPTION, parseDescription, REPORT_TYPES, type ReportType } from '@/domain/reports';
import type { LatLng, Stretch } from '@/domain/stretch';
import { relativeStamp } from '@/domain/time';
import { fontFor, townName, useI18n } from '@/i18n';
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
  const { t } = useI18n();
  const [tab, setTab] = useState<'send' | 'recent'>('send');
  const [sentId, setSentId] = useState<number | null>(null);
  const [sentNote, setSentNote] = useState<string | null>(null);
  // "Report" from a stretch page opens the form
  const [seenStretch, setSeenStretch] = useState<string | undefined>(undefined);
  if (params.stretch !== seenStretch) {
    setSeenStretch(params.stretch);
    if (params.stretch) setTab('send');
  }

  return (
    <View style={{ flex: 1 }}>
      <AppHeader title={t('Reports')} />
      <View style={styles.segmented}>
        {(['send', 'recent'] as const).map((key) => (
          <Pressable
            key={key}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === key }}
            onPress={() => setTab(key)}
            style={[styles.segment, tab === key && styles.segmentActive]}>
            <Txt variant="bodyStrong" color={tab === key ? colors.ink : colors.inkMuted} style={{ fontSize: 14 }}>
              {key === 'send' ? t('Send a report') : t('Recent reports')}
            </Txt>
          </Pressable>
        ))}
      </View>
      {tab === 'send' ? (
        <SendReport
          presetStretch={params.stretch}
          onSent={(id, note) => {
            setSentId(id);
            setSentNote(note);
            setTab('recent');
          }}
        />
      ) : (
        <RecentReports sentId={sentId} sentNote={sentNote} />
      )}
    </View>
  );
}

function SendReport({
  presetStretch,
  onSent,
}: {
  presetStretch?: string;
  onSent: (id: number, note: string | null) => void;
}) {
  const { corridor } = useCorridor();
  const { t, lang } = useI18n();
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
  const [photo, setPhoto] = useState<ReportPhoto | null>(null);
  const [photoBusy, setPhotoBusy] = useState<PhotoSource | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);

  const addPhoto = async (source: PhotoSource) => {
    setPhotoError(null);
    setPhotoBusy(source);
    try {
      const p = await getReportPhoto(source);
      if (p) setPhoto(p);
    } catch (e) {
      setPhotoError(
        e instanceof Error && e.message === 'permission'
          ? t('Allow camera or photo access for Raah to add a photo.')
          : t('Could not add the photo. Try again.'),
      );
    } finally {
      setPhotoBusy(null);
    }
  };

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
        setLocError(t('Location is off for Raah. Allow it, or pick the stretch with Change.'));
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const point: LatLng = [pos.coords.latitude, pos.coords.longitude];
      const road = locateOnRoad(point, stretches);
      if (!road) throw new Error('no road');
      setKmText('');
      setSpot({ point, km: road.km, town: road.town, offRoadKm: road.offRoadKm, source: 'gps' });
    } catch {
      setLocError(t('Could not get your location. Pick the stretch with Change instead.'));
    } finally {
      setLocating(false);
    }
  };

  const applyKm = (value: string) => {
    setKmText(value);
    const km = Number(value.replace(',', '.'));
    if (!value.trim() || Number.isNaN(km)) return;
    if (km < 0 || km > CORRIDOR_KM) {
      setLocError(t('NH-7 runs from km 0 (Rishikesh) to km {max} (Joshimath).', { max: Math.floor(CORRIDOR_KM) }));
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
    !type && t('what you saw'),
    !spot && t('where it is'),
    !textOk && t('a short description (5+ letters)'),
    !consent && t('your agreement to share'),
  ].filter(Boolean) as string[];

  const send = async () => {
    if (!ready || !type || !spot) return;
    setSending(true);
    setSendError(null);
    try {
      // The photo goes first; its URL then travels with the report
      let photoUrl: string | undefined;
      let note: string | null = null;
      if (photo) {
        try {
          photoUrl = (await api.uploadPhoto(photo.uri)).photo_url;
        } catch (e) {
          const pe = e instanceof ApiError ? e : null;
          if (pe && (pe.status === 404 || pe.status === 405)) {
            note = t('Sent without the photo: this server does not take photos yet.');
          } else if (pe && (pe.status === 413 || pe.status === 415)) {
            note = t('Sent without the photo: the photo could not be used.');
          } else {
            throw e;
          }
        }
      }
      const res = await api.sendReport({
        lat: spot.point[0],
        lng: spot.point[1],
        description: encodeDescription(type, spot.km, text),
        reporter_name: name.trim() || 'Traveller',
        ...(photoUrl ? { photo_url: photoUrl } : null),
      });
      const mine = (await readJson<number[]>(KEYS.myReports)) ?? [];
      await writeJson(KEYS.myReports, [res.report_id, ...mine].slice(0, 50));
      await queryClient.invalidateQueries({ queryKey: ['field-reports'] });
      setType(null);
      setText('');
      setConsent(false);
      setPhoto(null);
      onSent(res.report_id, note);
    } catch (e) {
      const err = e instanceof ApiError ? e : null;
      if (!err || err.status === 0)
        setSendError(`${connectionHelp(e)} ${t('Your report is still here: try again when you have signal.')}`);
      else if (err.status === 409)
        setSendError(t('You already reported this place in the last 10 minutes. Thank you, one report is enough.'));
      else if (err.status === 429)
        setSendError(t('Too many reports from this network in the last minute. Wait a minute and send again.'));
      else if (err.status === 422)
        setSendError(
          err.detail?.includes('3.0 km')
            ? t('This place is more than 3 km from NH-7. Reports must be on or next to the road.')
            : err.detail || t('Please check the report and try again.'),
        );
      else setSendError(err.detail || t('The report could not be sent. Try again.'));
    } finally {
      setSending(false);
    }
  };

  const spotTitle = spot
    ? t('Near {town}, km {km}', { town: townName(spot.town), km: Math.round(spot.km) })
    : t('Not set yet');
  const spotSub = spot
    ? spot.source === 'gps'
      ? tooFar
        ? t('From your GPS · {km} km from NH-7', { km: spot.offRoadKm.toFixed(1) })
        : t('From your GPS · on NH-7')
      : spot.source === 'km'
        ? t('From the km you typed')
        : t('Middle of the stretch you picked')
    : t('Use your location or pick the stretch');

  return (
    <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
      <Txt variant="h3" style={styles.q}>
        {t('What did you see?')}
      </Txt>
      <View style={styles.grid}>
        {REPORT_TYPES.map((rt) => {
          const active = type?.id === rt.id;
          const Icon = rt.icon;
          return (
            <Pressable
              key={rt.id}
              accessibilityRole="radio"
              accessibilityState={{ checked: active }}
              onPress={() => setType(rt)}
              style={[styles.typeTile, active && styles.typeActive]}>
              <Icon size={28} color={colors.ink} strokeWidth={1.8} />
              <Txt variant="smallStrong" style={{ fontSize: 13, textAlign: 'center' }}>
                {t(rt.label)}
              </Txt>
            </Pressable>
          );
        })}
      </View>

      <Txt variant="h3" style={styles.q}>
        {t('Where is it?')}
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
          <Button compact kind="outline" label={t('Change')} onPress={() => setPicker(true)} />
        </View>
        <Button
          kind="outline"
          icon={Crosshair}
          label={t('Use my current location')}
          loading={locating}
          onPress={locateMe}
          compact
        />
        <View style={styles.kmRow}>
          <Txt color={colors.inkMuted} style={{ flex: 1 }}>
            {t('NH-7 km stone, if you know it')}
          </Txt>
          <TextInput
            value={kmText}
            onChangeText={applyKm}
            placeholder={t('e.g. 114')}
            placeholderTextColor={colors.inkFaint}
            keyboardType="decimal-pad"
            style={[styles.input, { width: 110, height: 48, fontFamily: fontFor(fonts.body, lang) }]}
            accessibilityLabel={t('NH-7 kilometre')}
            maxLength={6}
          />
        </View>
        {locError ? <Notice tone="warn" title={locError} /> : null}
        {tooFar ? (
          <Notice
            tone="error"
            title={t('Too far from NH-7')}
            body={t(
              'Reports must be within 3 km of the road. Pick the stretch with Change if you are reporting for someone else.',
            )}
          />
        ) : null}
      </Card>

      <Txt variant="h3" style={styles.q}>
        {t('What is happening?')}
      </Txt>
      <TextInput
        value={text}
        onChangeText={(v) => setText(v.slice(0, MAX_DESCRIPTION))}
        placeholder={t('For example: small stones falling on the uphill side near the bend. One lane is open.')}
        placeholderTextColor={colors.inkFaint}
        multiline
        style={[styles.input, styles.textarea, { fontFamily: fontFor(fonts.body, lang) }]}
        accessibilityLabel={t('Describe what is happening')}
      />
      <Txt variant="small" color={colors.inkMuted} style={{ textAlign: 'right', marginTop: 6 }}>
        {text.length} / {MAX_DESCRIPTION}
      </Txt>

      <Txt variant="h3" style={styles.q}>
        {t('Add a photo (optional)')}
      </Txt>
      {photo ? (
        <View style={styles.photoWrap}>
          <Image
            source={{ uri: photo.uri }}
            style={[styles.photo, { aspectRatio: photo.width / photo.height || 4 / 3 }]}
            accessibilityLabel={t('Photo for this report')}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('Remove the photo')}
            onPress={() => setPhoto(null)}
            hitSlop={8}
            style={styles.photoRemove}>
            <X size={20} color={colors.white} />
          </Pressable>
        </View>
      ) : (
        <View style={styles.photoButtons}>
          <Button
            compact
            kind="outline"
            icon={Camera}
            label={t('Take photo')}
            loading={photoBusy === 'camera'}
            onPress={() => addPhoto('camera')}
            style={{ flex: 1 }}
          />
          <Button
            compact
            kind="outline"
            icon={ImagePlus}
            label={t('From gallery')}
            loading={photoBusy === 'library'}
            onPress={() => addPhoto('library')}
            style={{ flex: 1 }}
          />
        </View>
      )}
      {photoError ? (
        <View style={{ marginTop: 8 }}>
          <Notice tone="warn" title={photoError} />
        </View>
      ) : null}
      <Txt variant="small" color={colors.inkMuted} style={{ marginTop: 6 }}>
        {t('Officials see the photo. Location details inside the photo file are removed before it is sent.')}
      </Txt>

      <TextInput
        value={name}
        onChangeText={setName}
        placeholder={t('Your name or role (optional), e.g. taxi driver')}
        placeholderTextColor={colors.inkFaint}
        style={[styles.input, { marginTop: 8, height: 48, fontFamily: fontFor(fonts.body, lang) }]}
        maxLength={60}
        accessibilityLabel={t('Your name or role, optional')}
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
          {t('I agree to share this report, its place and the name above to help keep NH-7 safe.')}
        </Txt>
      </Pressable>

      {sendError ? (
        <View style={{ marginTop: 14 }}>
          <Notice tone="error" icon={TriangleAlert} title={t('Not sent')} body={sendError} />
        </View>
      ) : null}

      <Button
        label={t('Send report')}
        icon={Send}
        onPress={send}
        disabled={!ready}
        loading={sending}
        style={{ marginTop: 18, minHeight: 54 }}
      />
      {!ready && missing.length ? (
        <Txt variant="small" color={colors.inkMuted} style={{ textAlign: 'center', marginTop: 8 }}>
          {t('Still needed: {list}.', { list: missing.join(', ') })}
        </Txt>
      ) : null}
      <Pressable onPress={() => router.navigate('/emergency')} accessibilityRole="link">
        <Txt
          variant="bodyStrong"
          color={LEVELS.severe.ink}
          style={{ textAlign: 'center', marginTop: 18, fontSize: 14 }}>
          {t('Someone hurt or in danger? Call 112 first.')}
        </Txt>
      </Pressable>

      <Card style={{ marginTop: 24, gap: 6 }}>
        <Txt variant="bodyStrong" style={{ fontSize: 14 }}>
          {t('What happens to your report')}
        </Txt>
        {[
          'Officials check every report. Until then it shows as Pending.',
          'A verified report can raise its stretch by one level on everyone’s map. The effect fades over about two days.',
          'A rejected report changes nothing.',
          'Report only what you see yourself. Stop safely before you type.',
        ].map((line) => (
          <Txt key={line}>• {t(line)}</Txt>
        ))}
      </Card>

      <PickerSheet
        visible={picker}
        title={t('Which stretch?')}
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

function RecentReports({ sentId, sentNote }: { sentId: number | null; sentNote: string | null }) {
  const reports = useFieldReports();
  const { corridor } = useCorridor();
  const [mine, setMine] = useState<number[]>([]);
  const [filter, setFilter] = useState<string>('all');
  const { t } = useI18n();

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
    if (km != null) return `${townName(nearestTown(km).name)}, km ${Math.round(km)}`;
    const pos = corridor ? locateOnRoad([r.lat, r.lng], corridor.stretches) : null;
    return pos ? `${townName(pos.town)}, km ${Math.round(pos.km)}` : `${r.lat.toFixed(3)}, ${r.lng.toFixed(3)}`;
  };

  return (
    <ScrollView contentContainerStyle={styles.body}>
      {sentId ? (
        <Notice
          tone="ok"
          icon={CircleCheck}
          title={t('Report sent. Thank you!')}
          body={t("It is Pending until officials check it. If verified, the stretch's risk goes up on the map.")}
        />
      ) : null}
      {sentId && sentNote ? (
        <View style={{ marginTop: 10 }}>
          <Notice tone="warn" title={sentNote} />
        </View>
      ) : null}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 10, paddingVertical: 14 }}>
        <Chip label={t('All')} active={filter === 'all'} onPress={() => setFilter('all')} />
        {REPORT_TYPES.map((rt) => (
          <Chip key={rt.id} label={t(rt.label)} active={filter === rt.id} onPress={() => setFilter(rt.id)} />
        ))}
      </ScrollView>

      {reports.isPending ? <ActivityIndicator color={colors.navy} style={{ marginTop: 24 }} /> : null}
      {reports.isError ? (
        <View style={{ gap: 12 }}>
          <Notice tone="error" title={t('Could not load reports')} body={connectionHelp(reports.error)} />
          <Button kind="outline" icon={RefreshCw} label={t('Try again')} onPress={() => reports.refetch()} />
        </View>
      ) : null}
      {reports.data && !items.length ? (
        <Card>
          <Txt>{filter === 'all' ? t('No reports yet.') : t('No reports of this type yet.')}</Txt>
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
                    ? `${t('YOUR REPORT')} · ${relativeStamp(r.created_at)}`
                    : `${relativeStamp(r.created_at)} · ${r.reporter_name}`}
                </Txt>
                <View
                  style={[
                    styles.status,
                    { backgroundColor: statusStyle.backgroundColor, borderColor: statusStyle.borderColor },
                  ]}>
                  <Txt variant="eyebrow" color={statusStyle.color}>
                    {t(status)}
                  </Txt>
                </View>
              </View>
              <Txt variant="h3" style={{ fontSize: 16, marginTop: 8, fontFamily: fonts.bodyBold }}>
                {t(p.type.label)} · {place(r, p.km)}
              </Txt>
              <Txt color={colors.inkMuted} style={{ fontSize: 14, marginTop: 4 }}>
                {p.text}
              </Txt>
              {r.photo_url ? (
                <Image
                  source={{ uri: r.photo_url }}
                  style={styles.cardPhoto}
                  resizeMode="cover"
                  accessibilityLabel={t('Photo with this report')}
                />
              ) : null}
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
  cardPhoto: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: radius.md,
    marginTop: 10,
    backgroundColor: colors.chip,
  },
  photoButtons: { flexDirection: 'row', gap: 10 },
  photoWrap: { borderRadius: radius.md, overflow: 'hidden' },
  photo: { width: '100%', maxHeight: 320, backgroundColor: colors.chip },
  photoRemove: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(11,26,34,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reportMine: { borderWidth: 3, borderColor: colors.navy, padding: 15 },
  status: { borderWidth: 1.5, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 4 },
});
