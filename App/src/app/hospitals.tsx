import * as Location from 'expo-location';
import { Check, CloudOff, Crosshair } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import { useCorridor, useOfflinePack } from '@/api/hooks';
import { AppHeader } from '@/components/AppHeader';
import { Button, Card, Disclaimer, Notice, Txt } from '@/components/ui';
import { locateOnRoad } from '@/domain/geo';
import { hospitalList } from '@/domain/hospitals';
import { LEVELS } from '@/domain/levels';
import { clock12, parseIso } from '@/domain/time';
import { placeName, useI18n } from '@/i18n';
import { colors, radius } from '@/theme/tokens';

export default function HospitalsScreen() {
  const pack = useOfflinePack();
  const { t } = useI18n();
  const { corridor } = useCorridor();
  const [mine, setMine] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);

  const rows = useMemo(() => {
    if (!pack.data) return [];
    const kmById = Object.fromEntries((corridor?.stretches ?? []).map((s) => [s.id, s.hospitalKm]));
    return hospitalList(pack.data.data, corridor?.stretches, kmById);
  }, [pack.data, corridor]);

  const findMine = async () => {
    setLocError(null);
    setLocating(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') throw new Error('denied');
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const road = corridor ? locateOnRoad([pos.coords.latitude, pos.coords.longitude], corridor.stretches) : null;
      if (!road) throw new Error('no road');
      if (road.offRoadKm > 10)
        setLocError(
          t('You are {km} km from NH-7. Showing the nearest stretch anyway.', { km: Math.round(road.offRoadKm) }),
        );
      setMine(road.stretchId);
    } catch {
      setLocError(t('Could not get your location. Find your stretch in the list below.'));
    } finally {
      setLocating(false);
    }
  };

  const source = pack.data?.source;
  const savedAt = parseIso(pack.data?.savedAt);
  const ordered = mine
    ? [...rows.filter((r) => r.segment_id === mine), ...rows.filter((r) => r.segment_id !== mine)]
    : rows;

  return (
    <View style={{ flex: 1 }}>
      <AppHeader back title={t('Hospitals')} subtitle={t('Along NH-7, Rishikesh to Joshimath')} />
      <ScrollView contentContainerStyle={styles.body}>
        {pack.isPending ? <ActivityIndicator color={colors.navy} /> : null}
        {source === 'live' ? (
          <View style={styles.savedPill}>
            <Check size={20} color="#1E5C3F" />
            <Txt variant="bodyStrong" color="#1E5C3F">
              {t('Saved for offline use')}
              {savedAt ? ` · ${clock12(savedAt)}` : ''}
            </Txt>
          </View>
        ) : null}
        {source === 'saved' ? (
          <Notice
            tone="warn"
            icon={CloudOff}
            title={t('No network: showing your offline copy')}
            body={
              savedAt
                ? t('Saved at {time}. Hospitals rarely change, but call 112 if unsure.', { time: clock12(savedAt) })
                : undefined
            }
          />
        ) : null}
        {source === 'demo' ? (
          <Notice
            tone="warn"
            icon={CloudOff}
            title={t('No network and no saved copy yet')}
            body={t('This is the list bundled with the app. Open this page once online to save the latest.')}
          />
        ) : null}

        <Txt color={colors.inkMuted} style={{ fontSize: 14, marginVertical: 12 }}>
          {t('Nearest hospital to each stretch, from Rishikesh. Distance is from the road.')}
        </Txt>
        <Button
          kind="outline"
          compact
          icon={Crosshair}
          label={t('Show the one nearest me first')}
          loading={locating}
          onPress={findMine}
        />
        {locError ? (
          <View style={{ marginTop: 10 }}>
            <Notice tone="warn" title={locError} />
          </View>
        ) : null}

        <Card padded={false} style={{ marginTop: 14 }}>
          {ordered.map((h, i) => {
            const isMine = h.segment_id === mine;
            return (
              <View
                key={`${h.segment_id}-${h.hospital_name}`}
                style={[styles.row, i > 0 && styles.border, isMine && styles.mine]}>
                <View style={{ flex: 1 }}>
                  {isMine ? (
                    <Txt variant="eyebrow" color={LEVELS.low.ink}>
                      {t('Nearest to you')}
                    </Txt>
                  ) : null}
                  <Txt variant="h3" style={{ fontSize: 15 }}>
                    {h.hospital_name}
                  </Txt>
                  <Txt color={colors.inkMuted}>{placeName(h.segment_name)}</Txt>
                </View>
                <Txt variant="bodyStrong" style={{ fontSize: 15 }}>
                  {h.distance_km != null ? `${h.distance_km.toFixed(1)} ${t('km')}` : '—'}
                </Txt>
              </View>
            );
          })}
        </Card>
        <Disclaimer text={t('In an emergency call 112 first · Not an official list')} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: 20, paddingBottom: 48 },
  savedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    backgroundColor: colors.greenSoft,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radius.pill,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 14 },
  border: { borderTopWidth: 1, borderTopColor: colors.line },
  mine: { backgroundColor: colors.greenSoft },
});
