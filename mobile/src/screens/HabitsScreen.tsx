import React, { useState } from 'react';
import { Alert, FlatList, Pressable, Text, View } from 'react-native';

import { colors } from '../components/theme';
import { AddBar, Chip, EmptyState, Screen, styles } from '../components/ui';
import { HabitsRepo } from '../db/repositories/habits';
import { useLiveQuery } from '../hooks/useLiveQuery';
import { Habit, HabitLog } from '../types';
import { currentStreak, periodProgress } from '../utils/streak';
import { addDays, dayKey } from '../utils/time';

const PALETTE = ['#6C5CE7', '#00B894', '#FD79A8', '#FDCB6E', '#0984E3', '#E17055'];

interface HabitView {
  habit: Habit;
  logs: HabitLog[];
}

async function loadHabits(): Promise<HabitView[]> {
  const habits = await HabitsRepo.list();
  return Promise.all(habits.map(async (habit) => ({ habit, logs: await HabitsRepo.recentLogs(habit.id) })));
}

function WeekStrip({ logs, color }: { logs: HabitLog[]; color: string }) {
  const counts = new Map(logs.map((l) => [l.day, l.count]));
  const days = Array.from({ length: 7 }, (_, i) => dayKey(addDays(new Date(), i - 6)));
  return (
    <View style={[styles.row, { marginTop: 8 }]}>
      {days.map((d) => (
        <View
          key={d}
          style={{
            width: 14,
            height: 14,
            borderRadius: 4,
            marginRight: 4,
            backgroundColor: (counts.get(d) ?? 0) > 0 ? color : colors.border,
          }}
        />
      ))}
    </View>
  );
}

function HabitRow({ habit, logs }: HabitView) {
  const progress = periodProgress(logs, habit.frequency);
  const streak = currentStreak(logs, habit.frequency, habit.target_per_period);
  const done = progress >= habit.target_per_period;
  const unit = habit.frequency === 'daily' ? 'day' : 'week';
  return (
    <Pressable
      onPress={() => HabitsRepo.checkIn(habit.id, 1)}
      onLongPress={() =>
        Alert.alert(habit.name, undefined, [
          { text: 'Undo today', onPress: () => HabitsRepo.checkIn(habit.id, -1) },
          { text: 'Archive', onPress: () => HabitsRepo.archive(habit.id) },
          { text: 'Delete', style: 'destructive', onPress: () => HabitsRepo.remove(habit.id) },
          { text: 'Cancel', style: 'cancel' },
        ])
      }
      style={[styles.card, done && { borderColor: habit.color }]}
    >
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{habit.name}</Text>
          <Text style={styles.subtitle}>
            {progress}/{habit.target_per_period} this {unit} · {streak} {unit} streak
          </Text>
        </View>
        <Text style={{ color: done ? habit.color : colors.muted, fontSize: 22 }}>{done ? '●' : '○'}</Text>
      </View>
      <WeekStrip logs={logs} color={habit.color} />
    </Pressable>
  );
}

export default function HabitsScreen() {
  const [frequency, setFrequency] = useState<'daily' | 'weekly'>('daily');
  const { data = [] } = useLiveQuery(loadHabits, ['habits', 'habit_logs']);

  const add = (text: string) => {
    // "Gym x3" -> target of 3 per period
    const m = text.match(/^(.*?)\s*x(\d+)$/i);
    const name = m ? m[1] : text;
    const target = m ? Number(m[2]) : 1;
    HabitsRepo.create({ name, frequency, target_per_period: target, color: PALETTE[data.length % PALETTE.length] });
  };

  return (
    <Screen>
      <AddBar placeholder='New habit — "Read 20 min" or "Gym x3"' onSubmit={add} />
      <View style={[styles.row, { marginBottom: 12 }]}>
        <Chip label="Daily" active={frequency === 'daily'} onPress={() => setFrequency('daily')} />
        <Chip label="Weekly" active={frequency === 'weekly'} onPress={() => setFrequency('weekly')} />
      </View>
      <FlatList
        data={data}
        keyExtractor={(v) => v.habit.id}
        renderItem={({ item }) => <HabitRow {...item} />}
        ListEmptyComponent={<EmptyState title="No habits yet" hint="Tap a habit to check in, long-press for options." />}
      />
    </Screen>
  );
}
