import { router, useLocalSearchParams } from 'expo-router';
import { Flag, Route } from 'lucide-react-native';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useCorridor } from '@/api/hooks';
import { DetailShell } from '@/components/DetailShell';
import { RainTiles, VerdictCard, WhyRisky } from '@/components/StretchParts';
import { Button, Disclaimer, Notice, SectionTitle, Txt } from '@/components/ui';
import { planParamsFor } from '@/domain/stretch';
import { updatedLabel } from '@/domain/time';
import { colors } from '@/theme/tokens';

export default function StretchScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { corridor } = useCorridor();
  const stretch = corridor?.byId[id ?? ''];

  if (!corridor) return <ActivityIndicator style={{ flex: 1 }} color={colors.navy} />;
  if (!stretch) {
    return (
      <View style={{ flex: 1, padding: 24, justifyContent: 'center' }}>
        <Txt variant="h2">Stretch not found</Txt>
        <Button label="Back to the map" onPress={() => router.replace('/')} style={{ marginTop: 16 }} />
      </View>
    );
  }

  return (
    <DetailShell stretches={corridor.stretches} stretch={stretch}>
      <Txt variant="h1" style={{ fontSize: 26, lineHeight: 29 }}>
        {stretch.name}
      </Txt>
      <Txt color={colors.inkMuted} style={{ fontSize: 14, marginTop: 4, marginBottom: 16 }}>
        NH-7 · km {Math.round(stretch.kmStart)} to {Math.round(stretch.kmEnd)} · {updatedLabel(stretch.updatedAt)}
      </Txt>

      <VerdictCard stretch={stretch} />

      {stretch.closure && stretch.closure.status !== 'closed' ? (
        <View style={{ marginTop: 12 }}>
          <Notice
            tone="warn"
            title={stretch.closure.status === 'one_way' ? 'One-way traffic' : 'Traffic restricted'}
            body={`${stretch.closure.reason} · ${stretch.closure.source}`}
          />
        </View>
      ) : null}
      {stretch.node?.reason ? (
        <View style={{ marginTop: 12 }}>
          <Notice tone="error" title="Slope sensor alert" body={stretch.node.reason} />
        </View>
      ) : null}

      <View style={{ marginTop: 16 }}>
        <RainTiles stretch={stretch} />
      </View>

      <SectionTitle>Why it is risky</SectionTitle>
      <WhyRisky stretch={stretch} />

      <View style={styles.actions}>
        <Button
          label="Check a trip"
          icon={Route}
          style={{ flex: 1.15 }}
          onPress={() => router.push({ pathname: '/plan', params: planParamsFor(stretch) })}
        />
        <Button
          label="Report"
          icon={Flag}
          kind="outline"
          style={{ flex: 1 }}
          onPress={() => router.push({ pathname: '/reports', params: { stretch: stretch.id } })}
        />
      </View>
      <Disclaimer />
    </DetailShell>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: 14, marginTop: 28 },
});
