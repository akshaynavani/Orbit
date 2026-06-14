import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider, useAuth } from './src/auth/AuthContext';
import { colors } from './src/components/theme';
import { getDb } from './src/db/database';
import RootNavigator from './src/navigation/RootNavigator';
import { useSyncTriggers } from './src/sync/useSync';

function Loading() {
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={colors.accent} />
    </View>
  );
}

function Main() {
  const { ready, email } = useAuth();
  // Sync only runs while signed in; the app is fully functional offline either way.
  useSyncTriggers(ready && email !== null);
  if (!ready) return <Loading />;
  return <RootNavigator />;
}

export default function App() {
  const [dbReady, setDbReady] = useState(false);

  useEffect(() => {
    // Open + migrate the local database before rendering any screen.
    getDb().then(() => setDbReady(true));
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      {dbReady ? (
        <AuthProvider>
          <Main />
        </AuthProvider>
      ) : (
        <Loading />
      )}
    </SafeAreaProvider>
  );
}
