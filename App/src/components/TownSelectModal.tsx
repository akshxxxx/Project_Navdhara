import React, { useState } from 'react';
import { View, StyleSheet, Modal, TextInput, FlatList, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { ThemedText } from './ThemedText';
import { AppHeader } from './AppHeader';
import { colors, spacing, radii } from '../design/tokens';
import { type Town } from '../data/towns';

interface TownSelectModalProps {
  visible: boolean;
  towns: Town[];
  onSelect: (townId: string) => void;
  onClose: () => void;
  title: string;
}

export function TownSelectModal({ visible, towns, onSelect, onClose, title }: TownSelectModalProps) {
  const { i18n, t } = useTranslation();
  const [query, setQuery] = useState('');
  
  const isHindi = i18n.language === 'hi';
  
  const filteredTowns = towns.filter(town => {
    const name = isHindi ? town.name_hi : town.name_en;
    return name.toLowerCase().includes(query.toLowerCase());
  });

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe}>
        <AppHeader title={title} onBack={onClose} showBack />
        
        <View style={styles.searchContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder={t('search', 'Search town...')}
            placeholderTextColor={colors.granite}
            value={query}
            onChangeText={setQuery}
            autoFocus
          />
        </View>
        
        <FlatList
          data={filteredTowns}
          keyExtractor={t => t.id}
          renderItem={({ item }) => (
            <TouchableOpacity 
              style={styles.row} 
              onPress={() => {
                onSelect(item.id);
                setQuery('');
                onClose();
              }}
            >
              <ThemedText variant="body" color={colors.ink}>
                {isHindi ? item.name_hi : item.name_en}
              </ThemedText>
            </TouchableOpacity>
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.snow,
  },
  searchContainer: {
    padding: spacing.base,
    borderBottomWidth: 1,
    borderBottomColor: colors.mist,
  },
  searchInput: {
    height: 48,
    backgroundColor: colors.glacier,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.base,
    fontSize: 16,
    fontFamily: 'IBMPlexSans_400Regular',
    color: colors.ink,
  },
  row: {
    padding: spacing.base,
  },
  separator: {
    height: 1,
    backgroundColor: colors.glacier,
  }
});
