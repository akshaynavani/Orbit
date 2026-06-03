import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, TextInputProps, View, ViewStyle } from 'react-native';

import { colors, spacing } from './theme';

export function Screen({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.screen, style]}>{children}</View>;
}

export function Checkbox({ checked, onPress, color = colors.accent }: { checked: boolean; onPress: () => void; color?: string }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      style={[styles.checkbox, { borderColor: color }, checked && { backgroundColor: color }]}
    >
      {checked ? <Text style={styles.check}>✓</Text> : null}
    </Pressable>
  );
}

/** Single-line input that submits on enter and clears itself. */
export function AddBar({ placeholder, onSubmit, ...rest }: { placeholder: string; onSubmit: (text: string) => void } & TextInputProps) {
  const [value, setValue] = useState('');
  const submit = () => {
    const text = value.trim();
    if (!text) return;
    onSubmit(text);
    setValue('');
  };
  return (
    <View style={styles.addBar}>
      <TextInput
        style={styles.addInput}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        value={value}
        onChangeText={setValue}
        onSubmitEditing={submit}
        returnKeyType="done"
        {...rest}
      />
      <Pressable onPress={submit} style={styles.addButton} accessibilityLabel="Add">
        <Text style={styles.addButtonText}>+</Text>
      </Pressable>
    </View>
  );
}

export function Chip({ label, active, onPress }: { label: string; active?: boolean; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && { color: colors.text }]}>{label}</Text>
    </Pressable>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>{title}</Text>
      {hint ? <Text style={styles.emptyHint}>{hint}</Text> : null}
    </View>
  );
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, padding: spacing(4) },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: spacing(3),
    marginBottom: spacing(2),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  title: { color: colors.text, fontSize: 16 },
  subtitle: { color: colors.muted, fontSize: 12, marginTop: 2 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing(3),
  },
  check: { color: '#fff', fontSize: 13, fontWeight: '700' },
  addBar: { flexDirection: 'row', marginBottom: spacing(3) },
  addInput: {
    flex: 1,
    backgroundColor: colors.card,
    color: colors.text,
    borderRadius: 10,
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(2.5),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  addButton: {
    marginLeft: spacing(2),
    width: 44,
    borderRadius: 10,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonText: { color: '#fff', fontSize: 22, fontWeight: '600' },
  chip: {
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(1.5),
    borderRadius: 16,
    backgroundColor: colors.card,
    marginRight: spacing(2),
  },
  chipActive: { backgroundColor: colors.accent },
  chipText: { color: colors.muted, fontSize: 13 },
  empty: { alignItems: 'center', marginTop: spacing(16) },
  emptyTitle: { color: colors.text, fontSize: 16, fontWeight: '600' },
  emptyHint: { color: colors.muted, marginTop: spacing(1), textAlign: 'center' },
});
