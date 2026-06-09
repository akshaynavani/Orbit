import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { FlatList, Pressable, Text, TextInput, View } from 'react-native';

import { colors } from '../components/theme';
import { EmptyState, Screen, styles } from '../components/ui';
import { NotesRepo } from '../db/repositories/notes';
import { useLiveQuery } from '../hooks/useLiveQuery';
import { RootStackParamList } from '../navigation/types';

export default function NotesScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [search, setSearch] = useState('');
  const { data: notes = [] } = useLiveQuery(() => NotesRepo.list(search), ['notes'], [search]);

  return (
    <Screen>
      <View style={styles.addBar}>
        <TextInput
          style={styles.addInput}
          placeholder="Search notes"
          placeholderTextColor={colors.muted}
          value={search}
          onChangeText={setSearch}
        />
        <Pressable style={styles.addButton} onPress={() => nav.navigate('NoteEditor', {})} accessibilityLabel="New note">
          <Text style={styles.addButtonText}>+</Text>
        </Pressable>
      </View>
      <FlatList
        data={notes}
        keyExtractor={(n) => n.id}
        renderItem={({ item }) => (
          <Pressable style={styles.card} onPress={() => nav.navigate('NoteEditor', { noteId: item.id })}>
            <Text style={styles.title} numberOfLines={1}>
              {item.pinned ? '📌 ' : ''}
              {item.title || item.body.split('\n')[0] || 'Untitled'}
            </Text>
            <Text style={styles.subtitle} numberOfLines={2}>
              {item.title ? item.body : item.body.split('\n').slice(1).join(' ')}
            </Text>
          </Pressable>
        )}
        ListEmptyComponent={<EmptyState title="No notes" hint={search ? 'Nothing matches your search.' : 'Tap + to write one.'} />}
      />
    </Screen>
  );
}
