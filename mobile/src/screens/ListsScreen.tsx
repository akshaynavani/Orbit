import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React from 'react';
import { Alert, FlatList, Pressable, Text, View } from 'react-native';

import { AddBar, EmptyState, Screen, styles } from '../components/ui';
import { ListsRepo } from '../db/repositories/lists';
import { query } from '../db/repository';
import { useLiveQuery } from '../hooks/useLiveQuery';
import { RootStackParamList } from '../navigation/types';
import { OrbitList } from '../types';

interface ListSummary {
  list: OrbitList;
  open: number;
  total: number;
}

async function loadLists(): Promise<ListSummary[]> {
  const [lists, items] = await Promise.all([ListsRepo.list(), query('list_items')]);
  return lists.map((list) => {
    const mine = items.filter((i) => i.list_id === list.id);
    return { list, open: mine.filter((i) => !i.checked).length, total: mine.length };
  });
}

export default function ListsScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { data = [] } = useLiveQuery(loadLists, ['lists', 'list_items']);

  return (
    <Screen>
      <AddBar placeholder="New list — Groceries, Packing, Books…" onSubmit={(name) => ListsRepo.create(name)} />
      <FlatList
        data={data}
        keyExtractor={(s) => s.list.id}
        renderItem={({ item: { list, open, total } }) => (
          <Pressable
            style={[styles.card, styles.row]}
            onPress={() => nav.navigate('ListDetail', { listId: list.id, name: list.name })}
            onLongPress={() =>
              Alert.alert('Delete list?', `${list.name} and its ${total} items`, [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Delete', style: 'destructive', onPress: () => ListsRepo.remove(list.id) },
              ])
            }
          >
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: list.color, marginRight: 12 }} />
            <Text style={[styles.title, { flex: 1 }]}>{list.name}</Text>
            <Text style={styles.subtitle}>
              {open}/{total}
            </Text>
          </Pressable>
        )}
        ListEmptyComponent={<EmptyState title="No lists yet" />}
      />
    </Screen>
  );
}
