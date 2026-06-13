import React, { useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';

import { API_URL } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { colors } from '../components/theme';
import { Screen, styles } from '../components/ui';
import { syncEngine } from '../sync/SyncEngine';
import { useSyncState } from '../sync/useSync';

function Button({ label, onPress, danger, busy }: { label: string; onPress: () => void; danger?: boolean; busy?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      style={[styles.card, { alignItems: 'center', backgroundColor: danger ? colors.card : colors.accent }]}
    >
      {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: danger ? colors.danger : '#fff', fontWeight: '600' }}>{label}</Text>}
    </Pressable>
  );
}

function SignInForm() {
  const { signIn, signUp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (fn: typeof signIn) => {
    setBusy(true);
    setError(null);
    try {
      await fn(email.trim(), password);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const input = { ...styles.card, color: colors.text };
  return (
    <View>
      <Text style={[styles.subtitle, { marginBottom: 12 }]}>
        Orbit works fully offline. Sign in to back up and sync across devices.
      </Text>
      <TextInput
        style={input}
        placeholder="Email"
        placeholderTextColor={colors.muted}
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={input}
        placeholder="Password (min 8 characters)"
        placeholderTextColor={colors.muted}
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      {error ? <Text style={{ color: colors.danger, marginBottom: 8 }}>{error}</Text> : null}
      <Button label="Sign in" busy={busy} onPress={() => submit(signIn)} />
      <Button label="Create account" danger busy={busy} onPress={() => submit(signUp)} />
    </View>
  );
}

export default function SettingsScreen() {
  const { email, signOut } = useAuth();
  const sync = useSyncState();

  const last = sync.lastSyncAt ? new Date(sync.lastSyncAt).toLocaleString() : 'never';

  return (
    <Screen>
      {email ? (
        <View>
          <View style={styles.card}>
            <Text style={styles.title}>{email}</Text>
            <Text style={styles.subtitle}>Server: {API_URL}</Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.title}>Sync: {sync.status}</Text>
            <Text style={styles.subtitle}>Last synced {last}</Text>
            <Text style={styles.subtitle}>{sync.pending} change(s) waiting to upload</Text>
            {sync.error ? <Text style={[styles.subtitle, { color: colors.danger }]}>{sync.error}</Text> : null}
          </View>
          <Button label="Sync now" busy={sync.status === 'syncing'} onPress={() => syncEngine.sync()} />
          <Button label="Sign out" danger onPress={signOut} />
        </View>
      ) : (
        <SignInForm />
      )}
    </Screen>
  );
}
