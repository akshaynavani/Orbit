import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { Alert, FlatList, Pressable, ScrollView, Text, View } from 'react-native';

import { colors } from '../components/theme';
import { AddBar, Checkbox, Chip, EmptyState, Screen, styles } from '../components/ui';
import { TaskFilter, TasksRepo } from '../db/repositories/tasks';
import { useLiveQuery } from '../hooks/useLiveQuery';
import { RootStackParamList } from '../navigation/types';
import { Task } from '../types';
import { quickAddTask } from '../sync/quickAdd';
import { formatDue } from '../utils/time';

const FILTERS: { key: TaskFilter; label: string }[] = [
  { key: 'all', label: 'Inbox' },
  { key: 'today', label: 'Today' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'completed', label: 'Done' },
];

function TaskRow({ task, onOpen }: { task: Task; onOpen: () => void }) {
  const due = formatDue(task.due_at);
  const overdue = !task.completed && task.due_at != null && task.due_at < Date.now();
  const tags = task.tags ? task.tags.split(',').filter(Boolean) : [];
  return (
    <Pressable
      onPress={onOpen}
      onLongPress={() =>
        Alert.alert('Delete task?', task.title, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: () => TasksRepo.remove(task.id) },
        ])
      }
      style={[styles.card, styles.row, { borderLeftWidth: 3, borderLeftColor: colors.priority[task.priority] }]}
    >
      <Checkbox checked={task.completed} onPress={() => TasksRepo.toggleComplete(task)} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.title, task.completed && { textDecorationLine: 'line-through', color: colors.muted }]}>
          {task.title}
        </Text>
        {due || tags.length ? (
          <Text style={[styles.subtitle, overdue && { color: colors.danger }]}>
            {[due, ...tags.map((t) => `#${t}`)].filter(Boolean).join('  ')}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

export default function TasksScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [filter, setFilter] = useState<TaskFilter>('all');
  const { data: tasks = [] } = useLiveQuery(() => TasksRepo.list(filter), ['tasks'], [filter]);

  return (
    <Screen>
      <AddBar placeholder='Add a task — "Call mom tomorrow at 5pm #family !high"' onSubmit={quickAddTask} />
      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
          {FILTERS.map((f) => (
            <Chip key={f.key} label={f.label} active={filter === f.key} onPress={() => setFilter(f.key)} />
          ))}
        </ScrollView>
      </View>
      <FlatList
        data={tasks}
        keyExtractor={(t) => t.id}
        renderItem={({ item }) => <TaskRow task={item} onOpen={() => nav.navigate('TaskEditor', { taskId: item.id })} />}
        ListEmptyComponent={<EmptyState title="Nothing here" hint="Add a task above. It works offline." />}
      />
    </Screen>
  );
}
