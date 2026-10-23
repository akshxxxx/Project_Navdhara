import { router, useLocalSearchParams } from 'expo-router';
import { ArrowUpDown, CalendarDays, ChevronRight, Clock, MapPin, Search } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppHeader } from '@/components/AppHeader';
import { PickerSheet, type PickerOption } from '@/components/PickerSheet';
import { Button, Card, Disclaimer, Notice, SectionTitle, Txt } from '@/components/ui';
import { routeSegments, townByName, TOWNS } from '@/domain/corridor';
import { addDays, clock24, dayLabel, istDateKey, nextHourIst } from '@/domain/time';
import { colors, radius, shadow } from '@/theme/tokens';

const POPULAR: [string, string, string?][] = [
  ['Rishikesh', 'Joshimath', 'whole corridor'],
  ['Rishikesh', 'Srinagar'],
  ['Srinagar', 'Joshimath'],
  ['Rishikesh', 'Devprayag'],
  ['Joshimath', 'Rishikesh', 'return'],
];

const distance = (a: string, b: string) => Math.round(Math.abs((townByName(a)?.km ?? 0) - (townByName(b)?.km ?? 0)));

type PickerKind = 'from' | 'to' | 'date' | 'time' | null;

export default function PlanScreen() {
  const params = useLocalSearchParams<{ from?: string; to?: string }>();
  const defaults = useMemo(() => nextHourIst(), []);
  const [from, setFrom] = useState('Rishikesh');
  const [to, setTo] = useState('Joshimath');
  const [date, setDate] = useState(defaults.date);
  const [time, setTime] = useState(defaults.time);
  const [picker, setPicker] = useState<PickerKind>(null);
  const [error, setError] = useState<string | null>(null);

  // "Check a trip" from a stretch or alert fills the form (once per new pair of params)
  const paramKey = `${params.from ?? ''}|${params.to ?? ''}`;
  const [seenParams, setSeenParams] = useState('|');
  if (paramKey !== seenParams) {
    setSeenParams(paramKey);
    if (params.from && townByName(params.from)) setFrom(params.from);
    if (params.to && townByName(params.to)) setTo(params.to);
  }

  const today = nextHourIst().date;
  const dateOptions: PickerOption[] = [0, 1, 2].map((n) => {
    const key = addDays(today, n);
    return {
      value: key,
      label: `${['Today', 'Tomorrow', 'Day after'][n]} · ${dayLabel(key)}`,
      hint: n === 2 ? 'Past the rain forecast: risk uses terrain only' : 'Uses the hourly rain forecast',
    };
  });
  const now = nextHourIst();
  const timeOptions: PickerOption[] = Array.from({ length: 48 }, (_, i) => {
    const t = `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`;
    return { value: t, label: t };
  }).filter((o) => date !== today || o.value >= now.time);

  const check = (f = from, t = to) => {
    if (f === t) {
      setError('From and To are the same town. Pick two different towns.');
      return;
    }
    if (!routeSegments(f, t)) {
      setError('This route is not on the NH-7 corridor.');
      return;
    }
    setError(null);
    // The tab stays mounted, so a time picked earlier can now be in the past: move it to the next hour
    const soon = nextHourIst();
    const nowDate = new Date();
    const stale = date < istDateKey(nowDate) || (date === istDateKey(nowDate) && time < clock24(nowDate));
    const d = stale ? soon.date : date;
    const tm = stale ? soon.time : time;
    if (stale) {
      setDate(d);
      setTime(tm);
    }
    router.push({ pathname: '/plan-result', params: { from: f, to: t, date: d, time: tm } });
  };

  const townOptions = (exclude: string): PickerOption[] =>
    TOWNS.filter((t) => t.name !== exclude).map((t) => ({
      value: t.name,
      label: t.name,
      hint: `NH-7 km ${Math.round(t.km)}`,
    }));

  return (
    <View style={{ flex: 1 }}>
      <AppHeader title="Plan trip" />
      <ScrollView contentContainerStyle={styles.body}>
        <Txt color={colors.inkMuted} style={{ fontSize: 14, lineHeight: 21 }}>
          Check your trip before you leave. Raah checks each stretch for the hour you will reach it.
        </Txt>

        <Card style={[styles.form, shadow.card]}>
          <View>
            <Field icon={<View style={styles.fromDot} />} label="From" value={from} onPress={() => setPicker('from')} />
            <View style={{ height: 14 }} />
            <Field
              icon={<MapPin size={22} color={colors.redDeep} fill={colors.redDeep} />}
              label="To"
              value={to}
              onPress={() => setPicker('to')}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Swap From and To"
              onPress={() => {
                setFrom(to);
                setTo(from);
              }}
              style={styles.swap}>
              <ArrowUpDown size={22} color={colors.ink} />
            </Pressable>
          </View>
          <View style={styles.row}>
            <Field
              icon={<CalendarDays size={24} color={colors.inkMuted} />}
              label="Date"
              value={dayLabel(date).replace(',', '')}
              onPress={() => setPicker('date')}
              style={{ flex: 1 }}
            />
            <Field
              icon={<Clock size={24} color={colors.inkMuted} />}
              label="Leave at"
              value={time}
              onPress={() => setPicker('time')}
              style={{ flex: 1 }}
            />
          </View>
          {error ? <Notice tone="error" title={error} /> : null}
          <Button label="Check route" icon={Search} onPress={() => check()} style={{ minHeight: 54 }} />
        </Card>

        <SectionTitle>Popular routes</SectionTitle>
        <Card padded={false}>
          {POPULAR.map(([a, b, note], i) => (
            <Pressable
              key={`${a}-${b}`}
              accessibilityRole="button"
              onPress={() => {
                setFrom(a);
                setTo(b);
                check(a, b);
              }}
              style={({ pressed }) => [styles.popular, i > 0 && styles.popularBorder, pressed && { opacity: 0.7 }]}>
              <View style={{ flex: 1 }}>
                <Txt variant="h3" style={{ fontSize: 17 }}>
                  {a} → {b}
                </Txt>
                <Txt color={colors.inkMuted}>
                  {distance(a, b)} km{note ? ` · ${note}` : ''}
                </Txt>
              </View>
              <ChevronRight size={24} color={colors.inkMuted} />
            </Pressable>
          ))}
        </Card>
        <Disclaimer text="Raah never says a route is safe · Not an official warning · Emergency 112" />
      </ScrollView>

      <PickerSheet
        visible={picker === 'from'}
        title="From"
        options={townOptions(to)}
        value={from}
        onPick={setFrom}
        onClose={() => setPicker(null)}
      />
      <PickerSheet
        visible={picker === 'to'}
        title="To"
        options={townOptions(from)}
        value={to}
        onPick={setTo}
        onClose={() => setPicker(null)}
      />
      <PickerSheet
        visible={picker === 'date'}
        title="Travel date"
        options={dateOptions}
        value={date}
        onPick={(d) => {
          setDate(d);
          if (d === today && time < now.time) setTime(now.time);
        }}
        onClose={() => setPicker(null)}
      />
      <PickerSheet
        visible={picker === 'time'}
        title="Leave at"
        options={timeOptions}
        value={time}
        onPick={setTime}
        onClose={() => setPicker(null)}
      />
    </View>
  );
}

function Field({
  icon,
  label,
  value,
  onPress,
  style,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  onPress: () => void;
  style?: object;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}. Change`}
      onPress={onPress}
      style={({ pressed }) => [styles.field, style, pressed && { borderColor: colors.navy }]}>
      <View style={{ width: 28, alignItems: 'center' }}>{icon}</View>
      <View style={{ flex: 1 }}>
        <Txt color={colors.inkMuted} style={{ fontSize: 13 }}>
          {label}
        </Txt>
        <Txt variant="h3" numberOfLines={1} style={{ fontSize: 17, fontFamily: 'IBMPlexSans_700Bold' }}>
          {value}
        </Txt>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  body: { padding: 20, paddingBottom: 40, gap: 4 },
  form: { marginTop: 20, padding: 20, gap: 16 },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1.5,
    borderColor: colors.lineStrong,
    borderRadius: radius.md,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.white,
  },
  fromDot: { width: 18, height: 18, borderRadius: 9, borderWidth: 4, borderColor: colors.green },
  swap: {
    position: 'absolute',
    right: 20,
    top: '50%',
    marginTop: -23,
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.lineStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: { flexDirection: 'row', gap: 12 },
  popular: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16 },
  popularBorder: { borderTopWidth: 1, borderTopColor: colors.line },
});
