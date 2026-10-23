import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, TextInput, Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Check } from 'lucide-react-native';
import { ThemedText } from './ThemedText';
import { Chip } from './Chip';
import { Button } from './Button';
import { postSubscribe } from '../api/client';
import { colors, spacing, radii } from '../design/tokens';

interface SubscribeSheetProps {
  itemId: string; // segment id or 'all'
  itemName: string;
  onClose: () => void;
  onSuccess: (name: string) => void;
}

export function SubscribeSheet({ itemId, itemName, onClose, onSuccess }: SubscribeSheetProps) {
  const { t } = useTranslation();
  
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [channel, setChannel] = useState<'SMS' | 'WhatsApp' | 'Email'>('SMS');
  const [consent, setConsent] = useState(false);
  
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isValidContact = () => {
    if (channel === 'Email') {
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact);
    } else {
      // E.164 roughly: + followed by 1 to 14 digits
      return /^\+[1-9]\d{1,14}$/.test(contact);
    }
  };

  const handleSubscribe = async () => {
    if (name.length < 2) {
      Alert.alert('Error', 'Please enter a valid name (at least 2 characters).');
      return;
    }

    if (!isValidContact()) {
      Alert.alert('Error', channel === 'Email' ? 'Please enter a valid email address.' : 'Please enter a valid E.164 phone number (e.g. +919876543210).');
      return;
    }

    if (!consent) {
      Alert.alert('Error', 'You must agree to receive alerts.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await postSubscribe({
        name,
        phone_or_email: contact,
        segment_id: itemId,
        channel,
        consent,
      });

      if (res?.token) {
        await AsyncStorage.setItem('raah_subscription_token', res.token);
      }

      // Save to local storage for "Following" list
      const data = await AsyncStorage.getItem('raah_following');
      const following = data ? JSON.parse(data) : [];
      
      const idx = following.findIndex((f: any) => f.id === itemId);
      const followData = { id: itemId, name: itemName, channel };
      if (idx >= 0) {
        following[idx] = followData;
      } else {
        following.push(followData);
      }
      
      await AsyncStorage.setItem('raah_following', JSON.stringify(following));
      onSuccess(itemName);
      onClose();
    } catch (e: any) {
      Alert.alert('Subscription Failed', e.message || 'Could not subscribe right now.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <ThemedText variant="h2" color={colors.ink}>
        Alert me about {itemName}
      </ThemedText>
      
      <View style={styles.section}>
        <ThemedText variant="small" color={colors.granite}>Name</ThemedText>
        <TextInput 
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="e.g. Ramesh Negi"
          placeholderTextColor={colors.granite}
        />
      </View>

      <View style={styles.section}>
        <ThemedText variant="small" color={colors.granite}>Alert Channel</ThemedText>
        <View style={styles.row}>
          <Chip label="SMS" selected={channel === 'SMS'} onPress={() => setChannel('SMS')} />
          <Chip label="WhatsApp" selected={channel === 'WhatsApp'} onPress={() => setChannel('WhatsApp')} />
          <Chip label="Email" selected={channel === 'Email'} onPress={() => setChannel('Email')} />
        </View>
      </View>
      
      <View style={styles.section}>
        <ThemedText variant="small" color={colors.granite}>
          {channel === 'Email' ? 'Email Address' : 'Phone Number (E.164)'}
        </ThemedText>
        <TextInput 
          style={styles.input}
          keyboardType={channel === 'Email' ? 'email-address' : 'phone-pad'}
          value={contact}
          onChangeText={setContact}
          placeholder={channel === 'Email' ? "name@example.com" : "+91..."}
          placeholderTextColor={colors.granite}
          autoCapitalize="none"
        />
      </View>
      
      <TouchableOpacity 
        style={styles.checkboxRow} 
        activeOpacity={0.7} 
        onPress={() => setConsent(!consent)}
      >
        <View style={[styles.checkbox, consent && styles.checkboxChecked]}>
          {consent && <Check size={16} color={colors.snow} />}
        </View>
        <ThemedText variant="caption" color={colors.granite} style={{ flex: 1 }}>
          I consent to receive emergency alerts and allow processing of my data.
        </ThemedText>
      </TouchableOpacity>
      
      <Button 
        label={isSubmitting ? "Submitting..." : "Start alerts"} 
        variant="primary" 
        onPress={handleSubscribe} 
        disabled={isSubmitting || !consent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.base, gap: spacing.lg },
  section: { gap: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  input: { 
    borderWidth: 1, borderColor: colors.mist, borderRadius: radii.sm, 
    padding: spacing.sm, color: colors.ink, 
    fontFamily: 'IBMPlexSans_400Regular', fontSize: 16, height: 48 
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: colors.mist,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  checkboxChecked: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
});
