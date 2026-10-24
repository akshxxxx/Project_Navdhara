import { useQueryClient } from '@tanstack/react-query';
import { CircleCheck, Server, TriangleAlert, X } from 'lucide-react-native';
import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { api, AUTO_API_URL, getApiUrl, normaliseApiUrl, setApiUrl } from '@/api/client';
import { useI18n } from '@/i18n';
import { colors, fonts, radius } from '@/theme/tokens';

import { Button, Notice, Txt } from './ui';

type Check = { state: 'idle' } | { state: 'testing' } | { state: 'ok'; url: string } | { state: 'fail'; msg: string };

/**
 * Where the app finds the Raah backend. Needed on a phone when the backend is not on the laptop that
 * runs `expo start`, or when that laptop has more than one network address.
 */
export function ServerSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [text, setText] = useState(getApiUrl());
  const [check, setCheck] = useState<Check>({ state: 'idle' });

  const test = async (): Promise<string | null> => {
    const url = normaliseApiUrl(text);
    if (!url) {
      setCheck({ state: 'fail', msg: t('That does not look like an address. Example: 192.168.1.15:8000') });
      return null;
    }
    setCheck({ state: 'testing' });
    try {
      await api.health(url);
      setCheck({ state: 'ok', url });
      return url;
    } catch {
      setCheck({
        state: 'fail',
        msg: t(
          'No answer from {url}. Check that the backend is running (python run.py), that this phone is on the same Wi-Fi as the laptop, and that the address matches the "Team LAN URL" the backend prints.',
          { url },
        ),
      });
      return null;
    }
  };

  const save = async (url: string | null) => {
    await setApiUrl(url);
    setText(getApiUrl());
    await queryClient.invalidateQueries();
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel={t('Close')} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.head}>
            <Server size={22} color={colors.ink} />
            <Txt variant="h2" style={{ flex: 1 }}>
              {t('Server address')}
            </Txt>
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('Close')}>
              <X size={24} color={colors.ink} />
            </Pressable>
          </View>
          <Txt color={colors.inkMuted}>
            {t('The address of the Raah backend. On the laptop, python run.py prints it as the “Team LAN URL”.')}
          </Txt>
          <TextInput
            value={text}
            onChangeText={(v) => {
              setText(v);
              setCheck({ state: 'idle' });
            }}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType={Platform.OS === 'ios' ? 'url' : 'default'}
            placeholder="192.168.1.15:8000"
            placeholderTextColor={colors.inkFaint}
            style={styles.input}
            accessibilityLabel={t('Server address')}
          />
          <Txt variant="small" color={colors.inkMuted}>
            {t('Automatic: {url}', { url: AUTO_API_URL })}
          </Txt>
          {check.state === 'ok' ? (
            <Notice tone="ok" icon={CircleCheck} title={t('Connected to {url}', { url: check.url })} />
          ) : null}
          {check.state === 'fail' ? (
            <Notice tone="error" icon={TriangleAlert} title={t('Not connected')} body={check.msg} />
          ) : null}
          <View style={styles.row}>
            <Button
              kind="outline"
              compact
              label={t('Test')}
              loading={check.state === 'testing'}
              onPress={test}
              style={{ flex: 1 }}
            />
            <Button
              compact
              label={t('Save and reload')}
              onPress={async () => {
                const url = await test();
                if (url) await save(url === AUTO_API_URL ? null : url);
              }}
              style={{ flex: 1.4 }}
            />
          </View>
          <Button kind="ghost" compact label={t('Use the automatic address')} onPress={() => save(null)} />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(11,26,34,0.45)' },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: 20,
    gap: 12,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  input: {
    borderWidth: 1.5,
    borderColor: colors.lineStrong,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    height: 50,
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.ink,
  },
  row: { flexDirection: 'row', gap: 10 },
});
