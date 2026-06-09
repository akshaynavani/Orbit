import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useLayoutEffect } from 'react';
import { FlatList, Pressable, Text } from 'react-native';

import { colors } from '../components/theme';
import { AddBar, Checkbox, EmptyState, Screen, styles } from '../components/ui';
import { ListsRepo } from '../db/repositories/lists';
import { useLiveQuery } from '../hooks/useLiveQuery';
import { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'ListDetail'>;

export default function ListDetailScreen({ route, navigation }: Props) {
  const { listId, name } = route.params;
  const { data: items = [] } = useLiveQuery(() => ListsRepo.items(listId), ['list_items'], [listId]);

  useLayoutEffect(() => {
    navigation.setOptions({ title: name });
  }, [navigation, name]);

  const clearChecked = () => items.filter((i) => i.checked).forEach((i) => ListsRepo.removeItem(i.id));

  return (
    <Screen>
      <AddBar placeholder="Add item" onSubmit={(text) => ListsRepo.addItem(listId, text)} blurOnSubmit={false} />
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        renderItem={({ item }) => (
          <Pressable style={[styles.card, styles.row]} onLongPress={() => ListsRepo.removeItem(item.id)}>
            <Checkbox checked={item.checked} onPress={() => ListsRepo.toggleItem(item)} />
            <Text style={[styles.title, item.checked && { color: colors.muted, textDecorationLine: 'line-through' }]}>
              {item.text}
            </Text>
          </Pressable>
        )}
        ListEmptyComponent={<EmptyState title="Empty list" />}
        ListFooterComponent={
          items.some((i) => i.checked) ? (
            <Pressable onPress={clearChecked} style={{ alignItems: 'center', padding: 12 }}>
              <Text style={{ color: colors.muted }}>Clear checked items</Text>
            </Pressable>
          ) : null
        }
      />
    </Screen>
  );
}
