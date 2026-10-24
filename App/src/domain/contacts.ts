import { useCallback, useEffect, useState } from 'react';
import { Linking, Platform } from 'react-native';

import { KEYS, readJson, writeJson } from '@/api/storage';

// The traveller's own emergency contacts (family, friends, their hotel or driver). Kept only on this
// phone; nothing is sent to the Raah server.

export interface Contact {
  id: string;
  name: string;
  phone: string;
  relation: string;
}

export const RELATIONS = ['Family', 'Friend', 'Hotel or driver', 'Other'];
export const MAX_CONTACTS = 8;

/** Keep digits and a leading +; accept Indian numbers with or without +91 / 0 */
export function cleanPhone(input: string): string {
  const trimmed = input.trim();
  const plus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  return plus ? `+${digits}` : digits;
}

export function isValidPhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 13;
}

export function useContacts() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    readJson<Contact[]>(KEYS.contacts).then((list) => {
      setContacts(Array.isArray(list) ? list : []);
      setLoaded(true);
    });
  }, []);

  const save = useCallback((next: Contact[]) => {
    setContacts(next);
    writeJson(KEYS.contacts, next);
  }, []);

  const add = useCallback(
    (c: Omit<Contact, 'id'>) => save([...contacts, { ...c, id: `${Date.now()}` }].slice(0, MAX_CONTACTS)),
    [contacts, save],
  );
  const remove = useCallback((id: string) => save(contacts.filter((c) => c.id !== id)), [contacts, save]);

  return { contacts, loaded, add, remove };
}

/** Opens the phone's SMS app with the message ready; the person still presses Send themselves */
export function openSms(numbers: string[], body: string) {
  const to = numbers.map(cleanPhone).join(',');
  const sep = Platform.OS === 'ios' ? '&' : '?';
  return Linking.openURL(`sms:${to}${sep}body=${encodeURIComponent(body)}`).catch(() => {});
}
