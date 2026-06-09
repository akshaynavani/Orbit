import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { colors } from '../components/theme';
import { Chip, Screen, styles } from '../components/ui';
import { TasksRepo } from '../db/repositories/tasks';
import { findById } from '../db/repository';
import { RootStackParamList } from '../navigation/types';
import { Task } from '../types';
import { addDays, formatDue } from '../utils/time';

type Props = NativeStackScreenProps<RootStackParamList, 'TaskEditor'>;

const PRIORITIES = ['None', 'Low', 'Medium', 'High'];

function atNine(date: Date): number {
  const d = new Date(date);
  d.setHours(9, 0, 0, 0);
  return d.getTime();
}

export default function TaskEditorScreen({ route, navigation }: Props) {
  const [task, setTask] = useState<Task | null>(null);
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [tags, setTags] = useState('');

  useEffect(() => {
    findById('tasks', route.params.taskId).then((t) => {
      if (!t) return navigation.goBack();
      setTask(t);
      setTitle(t.title);
      setNotes(t.notes ?? '');
      setTags(t.tags.split(',').filter(Boolean).map((x) => `#${x}`).join(' '));
    });
  }, [route.params.taskId, navigation]);

  if (!task) return <Screen />;

  const patch = async (p: Partial<Task>) => {
    const updated = await TasksRepo.update(task.id, p);
    if (updated) setTask(updated);
  };

  const saveText = () =>
    patch({
      title: title.trim() || task.title,
      notes: notes.trim() || null,
      tags: tags
        .split(/[\s,]+/)
        .map((t) => t.replace(/^#/, '').toLowerCase())
        .filter(Boolean)
        .join(','),
    });

  const input = { ...styles.card, color: colors.text };

  return (
    <Screen>
      <TextInput style={[input, { fontSize: 18 }]} value={title} onChangeText={setTitle} onEndEditing={saveText} />
      <TextInput
        style={[input, { minHeight: 100, textAlignVertical: 'top' }]}
        value={notes}
        onChangeText={setNotes}
        onEndEditing={saveText}
        placeholder="Notes"
        placeholderTextColor={colors.muted}
        multiline
      />
      <TextInput
        style={input}
        value={tags}
        onChangeText={setTags}
        onEndEditing={saveText}
        placeholder="#tags"
        placeholderTextColor={colors.muted}
        autoCapitalize="none"
      />

      <Text style={[styles.subtitle, { marginVertical: 8 }]}>Priority</Text>
      <View style={styles.row}>
        {PRIORITIES.map((label, i) => (
          <Chip key={label} label={label} active={task.priority === i} onPress={() => patch({ priority: i })} />
        ))}
      </View>

      <Text style={[styles.subtitle, { marginVertical: 8 }]}>Due {task.due_at ? `· ${formatDue(task.due_at)}` : ''}</Text>
      <View style={styles.row}>
        <Chip label="Today" onPress={() => patch({ due_at: atNine(new Date()) })} />
        <Chip label="Tomorrow" onPress={() => patch({ due_at: atNine(addDays(new Date(), 1)) })} />
        <Chip label="Next week" onPress={() => patch({ due_at: atNine(addDays(new Date(), 7)) })} />
        <Chip label="Clear" onPress={() => patch({ due_at: null })} />
      </View>

      <Pressable
        style={[styles.card, { marginTop: 24, alignItems: 'center' }]}
        onPress={async () => {
          await TasksRepo.remove(task.id);
          navigation.goBack();
        }}
      >
        <Text style={{ color: colors.danger }}>Delete task</Text>
      </Pressable>
    </Screen>
  );
}
