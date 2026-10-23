import { router } from 'expo-router';
import { ChevronRight, Phone, SquarePlus } from 'lucide-react-native';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { useOfflinePack } from '@/api/hooks';
import type { EmergencyContact } from '@/api/types';
import { AppHeader, call } from '@/components/AppHeader';
import { Card, Disclaimer, SectionTitle, Txt } from '@/components/ui';
import { LEVELS } from '@/domain/levels';
import { colors, radius } from '@/theme/tokens';

// Short names and what each line is for. Numbers come only from the backend's offline pack:
// the backend leaves unverified numbers blank, and so does the app.
const LABELS: { match: RegExp; name: string; use: string }[] = [
  { match: /sdma|disaster/i, name: 'SDMA Uttarakhand', use: 'Landslides, rescue' },
  { match: /police/i, name: 'Highway Police', use: 'Accidents, traffic' },
  { match: /bro|border roads/i, name: 'BRO control room', use: 'Road blocked or damaged' },
  { match: /ambulance|medical/i, name: 'Ambulance', use: 'Medical emergency' },
];

const FALLBACK: EmergencyContact[] = [
  { name: 'State Disaster Management (SDMA Uttarakhand)', number: '' },
  { name: 'Highway Police Control Room', number: '' },
  { name: 'Border Roads Organisation (BRO) Control Room', number: '' },
];

export default function EmergencyScreen() {
  const pack = useOfflinePack();
  const contacts = (pack.data?.data.emergency_contacts ?? FALLBACK).filter((c) => c.number.trim() !== '112');
  const saved = pack.data && pack.data.source !== 'demo';

  return (
    <View style={{ flex: 1 }}>
      <AppHeader title="Emergency" showCall={false} />
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.hero}>
          <Txt variant="eyebrow" color="#F6C9D1" style={{ fontSize: 12, textAlign: 'center' }}>
            Police · Ambulance · Fire · Disaster
          </Txt>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Call 112"
            onPress={() => call('112')}
            style={({ pressed }) => [styles.bigCall, pressed && { opacity: 0.9 }]}>
            <Phone size={36} color={LEVELS.severe.color} strokeWidth={2.3} />
            <Txt variant="display" color={LEVELS.severe.color} style={{ fontSize: 40, lineHeight: 45 }}>
              Call 112
            </Txt>
          </Pressable>
          <Txt color={colors.white} style={{ textAlign: 'center', fontSize: 14 }}>
            Free, 24 × 7, from any phone
          </Txt>
          <View style={styles.tell}>
            <Txt variant="bodyStrong" color={colors.white} style={{ fontSize: 15 }}>
              Tell them
            </Txt>
            <Txt color={colors.white} style={{ fontSize: 14, lineHeight: 20 }}>
              Where you are (NH-7, nearest town, km stone) · what happened · how many people are hurt.
            </Txt>
          </View>
        </View>

        <SectionTitle>Other helplines</SectionTitle>
        <Card padded={false}>
          {contacts.map((c, i) => {
            const label = LABELS.find((l) => l.match.test(c.name));
            const has = c.number.trim() !== '';
            return (
              <View key={c.name} style={[styles.line, i > 0 && styles.lineBorder]}>
                <View style={{ flex: 1 }}>
                  <Txt variant="h3" style={{ fontSize: 16 }}>
                    {label?.name ?? c.name}
                  </Txt>
                  <Txt color={colors.inkMuted}>{c.description || label?.use || ''}</Txt>
                </View>
                {has ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Call ${label?.name ?? c.name}, ${c.number}`}
                    onPress={() => call(c.number)}
                    style={styles.callNow}>
                    <Phone size={18} color={colors.white} />
                    <Txt variant="smallStrong" color={colors.white}>
                      {c.number}
                    </Txt>
                  </Pressable>
                ) : (
                  <View style={styles.unconfirmed} accessible accessibilityLabel="Number not confirmed yet">
                    <Txt variant="smallStrong" color={colors.inkMuted}>
                      [number to confirm]
                    </Txt>
                  </View>
                )}
              </View>
            );
          })}
        </Card>

        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/hospitals')}
          style={({ pressed }) => [styles.hospitals, pressed && { opacity: 0.85 }]}>
          <View style={styles.hospitalIcon}>
            <SquarePlus size={26} color={colors.teal} />
          </View>
          <View style={{ flex: 1 }}>
            <Txt variant="h3" style={{ fontSize: 16 }}>
              Hospitals along NH-7
            </Txt>
            <Txt variant="smallStrong" color={saved ? '#1E5C3F' : colors.inkMuted} style={{ fontSize: 13 }}>
              {saved ? 'Saved for offline use' : 'Nearest hospital for each stretch'}
            </Txt>
          </View>
          <ChevronRight size={24} color={colors.inkMuted} />
        </Pressable>

        <Card style={{ marginTop: 16 }}>
          <Txt variant="h3" style={{ fontSize: 16, marginBottom: 6 }}>
            When to call 112
          </Txt>
          {[
            'Someone is hurt or trapped.',
            'A vehicle is hit or buried by a slide.',
            'You see a slide block the road with traffic moving towards it.',
          ].map((t) => (
            <Txt key={t} style={{ fontSize: 14 }}>
              • {t}
            </Txt>
          ))}
          <Txt color={colors.inkMuted} style={{ marginTop: 8 }}>
            For anything else, send a report from the Reports tab.
          </Txt>
        </Card>

        <Card style={{ marginTop: 16 }}>
          <Txt variant="h3" style={{ fontSize: 16, marginBottom: 6 }}>
            If a landslide happens near you
          </Txt>
          <Txt style={{ fontSize: 14, lineHeight: 20 }}>
            Move sideways out of its path, never downhill. Do not cross fresh debris. Keep away from streams.
          </Txt>
        </Card>
        <Card style={{ marginTop: 16 }}>
          <Txt variant="h3" style={{ fontSize: 16, marginBottom: 6 }}>
            If the road is blocked
          </Txt>
          <Txt style={{ fontSize: 14, lineHeight: 20 }}>
            Stop well back from the debris, away from the slope. Turn back to the last town if you can, and wait for BRO
            or police to clear it. Do not try to drive over rubble.
          </Txt>
        </Card>
        <Disclaimer text="Not an official warning · Follow BRO, SDRF and police instructions" />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: 20, paddingBottom: 48 },
  hero: { backgroundColor: LEVELS.severe.color, borderRadius: radius.xl, padding: 20, gap: 14 },
  bigCall: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    backgroundColor: colors.white,
    borderRadius: radius.xl,
    height: 88,
  },
  tell: { backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: radius.lg, padding: 18, gap: 4 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 16 },
  lineBorder: { borderTopWidth: 1, borderTopColor: colors.line },
  unconfirmed: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.lineStrong,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  callNow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.navy,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    height: 46,
  },
  hospitals: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: 18,
    marginTop: 16,
  },
  hospitalIcon: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.tealSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
