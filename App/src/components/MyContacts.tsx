import * as Location from 'expo-location';
import { MessageSquareText, Phone, Plus, Send, Trash2, UserRound, X } from 'lucide-react-native';
import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCorridor } from '@/api/hooks';
import {
  cleanPhone,
  isValidPhone,
  MAX_CONTACTS,
  openSms,
  RELATIONS,
  useContacts,
  type Contact,
} from '@/domain/contacts';
import { locateOnRoad } from '@/domain/geo';
import { fontFor, townName, tr, useI18n } from '@/i18n';
import { colors, fonts, radius } from '@/theme/tokens';

import { call } from './AppHeader';
import { Button, Card, Chip, Notice, Txt } from './ui';

/** Where am I, in words a relative can act on. Falls back to a plain message without GPS. */
async function locationMessage(stretches: Parameters<typeof locateOnRoad>[1]): Promise<string> {
  try {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (perm.status !== 'granted') throw new Error('denied');
    const pos = (await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 9000)),
    ])) as Location.LocationObject;
    const { latitude: lat, longitude: lng } = pos.coords;
    const link = `https://maps.google.com/?q=${lat.toFixed(5)},${lng.toFixed(5)}`;
    const road = stretches.length ? locateOnRoad([lat, lng], stretches) : null;
    if (road && road.offRoadKm <= 3) {
      return tr('I am on NH-7 near {town}, km {km}. My location: {link} (sent from Raah)', {
        town: townName(road.town),
        km: Math.round(road.km),
        link,
      });
    }
    return tr('My location: {link} (sent from Raah)', { link });
  } catch {
    return tr('I am travelling on NH-7 and may need help. Please call me. (sent from Raah)');
  }
}

export function MyContacts() {
  const { t } = useI18n();
  const { contacts, loaded, add, remove } = useContacts();
  const { corridor } = useCorridor();
  const [adding, setAdding] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const message = async (key: string, numbers: string[]) => {
    setBusy(key);
    const body = await locationMessage(corridor?.stretches ?? []);
    setBusy(null);
    await openSms(numbers, body);
  };

  return (
    <Card padded={false} style={{ overflow: 'hidden' }}>
      <View style={styles.head}>
        <UserRound size={22} color={colors.teal} />
        <View style={{ flex: 1 }}>
          <Txt variant="h3" style={{ fontSize: 16 }}>
            {t('My emergency contacts')}
          </Txt>
          <Txt variant="small" color={colors.inkMuted}>
            {t('Saved only on this phone')}
          </Txt>
        </View>
      </View>

      {loaded && contacts.length === 0 ? (
        <Txt color={colors.inkMuted} style={{ paddingHorizontal: 20, paddingBottom: 12 }}>
          {t('Add family or friends so you can call them, or send them your location, in one tap.')}
        </Txt>
      ) : null}

      {contacts.map((c) => (
        <View key={c.id} style={styles.row}>
          <View style={{ flex: 1 }}>
            <Txt variant="bodyStrong" numberOfLines={1}>
              {c.name}
            </Txt>
            <Txt variant="small" color={colors.inkMuted}>
              {t(c.relation)} · {c.phone}
            </Txt>
          </View>
          {confirmRemove === c.id ? (
            <View style={styles.actions}>
              <Button compact kind="danger" label={t('Remove')} onPress={() => remove(c.id)} />
              <Button compact kind="ghost" label={t('Keep')} onPress={() => setConfirmRemove(null)} />
            </View>
          ) : (
            <View style={styles.actions}>
              <RoundButton label={t('Call {name}', { name: c.name })} onPress={() => call(c.phone)} tone="call">
                <Phone size={18} color={colors.white} />
              </RoundButton>
              <RoundButton
                label={t('Send my location to {name}', { name: c.name })}
                onPress={() => message(c.id, [c.phone])}
                busy={busy === c.id}>
                <MessageSquareText size={18} color={colors.ink} />
              </RoundButton>
              <RoundButton label={t('Remove {name}', { name: c.name })} onPress={() => setConfirmRemove(c.id)}>
                <Trash2 size={17} color={colors.inkMuted} />
              </RoundButton>
            </View>
          )}
        </View>
      ))}

      <View style={styles.footer}>
        {contacts.length > 1 ? (
          <Button
            compact
            icon={Send}
            label={t('Send my location to all')}
            loading={busy === 'all'}
            onPress={() =>
              message(
                'all',
                contacts.map((c) => c.phone),
              )
            }
          />
        ) : null}
        {contacts.length < MAX_CONTACTS ? (
          <Button compact kind="outline" icon={Plus} label={t('Add a contact')} onPress={() => setAdding(true)} />
        ) : null}
        <Txt variant="small" color={colors.inkMuted}>
          {t('Messages open in your SMS app with your location filled in. You press Send.')}
        </Txt>
      </View>

      {adding ? (
        <AddContactSheet
          onClose={() => setAdding(false)}
          onSave={(c) => {
            add(c);
            setAdding(false);
          }}
        />
      ) : null}
    </Card>
  );
}

function RoundButton({
  children,
  onPress,
  label,
  tone,
  busy,
}: {
  children: React.ReactNode;
  onPress: () => void;
  label: string;
  tone?: 'call';
  busy?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.round,
        tone === 'call' && { backgroundColor: colors.green, borderColor: colors.green },
        (pressed || busy) && { opacity: 0.6 },
      ]}>
      {children}
    </Pressable>
  );
}

function AddContactSheet({ onClose, onSave }: { onClose: () => void; onSave: (c: Omit<Contact, 'id'>) => void }) {
  const { t, lang } = useI18n();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [relation, setRelation] = useState(RELATIONS[0]);
  const [error, setError] = useState<string | null>(null);
  const font = { fontFamily: fontFor(fonts.body, lang) };

  const save = () => {
    if (name.trim().length < 2) return setError(t('Enter a name.'));
    const p = cleanPhone(phone);
    if (!isValidPhone(p)) return setError(t('Enter a phone number with 10 digits (or with +91).'));
    onSave({ name: name.trim(), phone: p, relation });
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel={t('Close')} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.sheetHead}>
            <Txt variant="h2" style={{ flex: 1 }}>
              {t('Add a contact')}
            </Txt>
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('Close')}>
              <X size={24} color={colors.ink} />
            </Pressable>
          </View>
          <TextInput
            value={name}
            onChangeText={(v) => {
              setName(v);
              setError(null);
            }}
            placeholder={t('Name')}
            placeholderTextColor={colors.inkFaint}
            style={[styles.input, font]}
            maxLength={40}
            accessibilityLabel={t('Name')}
          />
          <TextInput
            value={phone}
            onChangeText={(v) => {
              setPhone(v);
              setError(null);
            }}
            placeholder={t('Phone number')}
            placeholderTextColor={colors.inkFaint}
            keyboardType="phone-pad"
            style={[styles.input, font]}
            maxLength={16}
            accessibilityLabel={t('Phone number')}
          />
          <View style={styles.chips}>
            {RELATIONS.map((r) => (
              <Chip key={r} label={t(r)} active={relation === r} onPress={() => setRelation(r)} />
            ))}
          </View>
          {error ? <Notice tone="error" title={error} /> : null}
          <Button label={t('Save contact')} onPress={save} />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 20, paddingBottom: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  round: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: colors.lineStrong,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: { gap: 10, padding: 20, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.line },
  backdrop: { flex: 1, backgroundColor: 'rgba(11,26,34,0.45)' },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: 20,
    gap: 12,
  },
  sheetHead: { flexDirection: 'row', alignItems: 'center' },
  input: {
    borderWidth: 1.5,
    borderColor: colors.lineStrong,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    height: 50,
    fontSize: 16,
    color: colors.ink,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
