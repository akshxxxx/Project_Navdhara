import { Check, X } from 'lucide-react-native';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useI18n } from '@/i18n';
import { colors, radius } from '@/theme/tokens';

import { Txt } from './ui';

export interface PickerOption {
  value: string;
  label: string;
  hint?: string;
}

/** A bottom sheet list; used for towns, dates, times and stretches (works the same on web and phone) */
export function PickerSheet({
  visible,
  title,
  options,
  value,
  onPick,
  onClose,
}: {
  visible: boolean;
  title: string;
  options: PickerOption[];
  value?: string | null;
  onPick: (value: string) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel={t('Close')} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
        <View style={styles.head}>
          <Txt variant="h2" style={{ flex: 1 }}>
            {title}
          </Txt>
          <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('Close')}>
            <X size={28} color={colors.ink} />
          </Pressable>
        </View>
        <ScrollView>
          {options.map((o) => {
            const active = o.value === value;
            return (
              <Pressable
                key={o.value}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => {
                  onPick(o.value);
                  onClose();
                }}
                style={({ pressed }) => [
                  styles.row,
                  active && { backgroundColor: colors.yellowSoft },
                  pressed && { opacity: 0.7 },
                ]}>
                <View style={{ flex: 1 }}>
                  <Txt variant="bodyStrong" style={{ fontSize: 14 }}>
                    {o.label}
                  </Txt>
                  {o.hint ? (
                    <Txt variant="small" color={colors.inkMuted}>
                      {o.hint}
                    </Txt>
                  ) : null}
                </View>
                {active ? <Check size={22} color={colors.ink} /> : null}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(11,26,34,0.45)' },
  sheet: {
    maxHeight: '75%',
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: 12,
  },
  head: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 18 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: radius.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
});
