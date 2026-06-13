import * as SecureStore from 'expo-secure-store';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { api } from '../api/client';
import { getMeta, resetLocalData, setMeta } from '../db/database';
import { syncEngine } from '../sync/SyncEngine';

const TOKEN_KEY = 'orbit_token';
const EMAIL_KEY = 'orbit_email';

interface TokenOut {
  access_token: string;
  user_id: number;
}

interface AuthState {
  ready: boolean;
  email: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

/**
 * The app is fully usable signed-out (local only). Signing in attaches the local
 * data to the account: if this device was last used by a *different* user, local
 * data is wiped first so accounts never mix; otherwise existing offline edits are
 * pushed on the first sync.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState<string | null>(null);

  const signOut = useCallback(async () => {
    api.setToken(null);
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(EMAIL_KEY);
    setEmail(null);
    await syncEngine.refreshPending();
  }, []);

  useEffect(() => {
    (async () => {
      const [token, savedEmail] = await Promise.all([
        SecureStore.getItemAsync(TOKEN_KEY),
        SecureStore.getItemAsync(EMAIL_KEY),
      ]);
      if (token) {
        api.setToken(token);
        setEmail(savedEmail);
      }
      api.setUnauthorizedHandler(() => {
        signOut();
      });
      await syncEngine.refreshPending();
      setReady(true);
    })();
  }, [signOut]);

  const finish = useCallback(async (address: string, out: TokenOut) => {
    const previousUser = await getMeta('user_id');
    if (previousUser && previousUser !== String(out.user_id)) {
      await resetLocalData();
      await syncEngine.resetCursor();
    }
    await setMeta('user_id', String(out.user_id));
    await SecureStore.setItemAsync(TOKEN_KEY, out.access_token);
    await SecureStore.setItemAsync(EMAIL_KEY, address);
    api.setToken(out.access_token);
    setEmail(address);
    syncEngine.sync();
  }, []);

  const signIn = useCallback(
    async (address: string, password: string) => {
      const out = await api.post<TokenOut>('/auth/login', { email: address, password });
      await finish(address, out);
    },
    [finish],
  );

  const signUp = useCallback(
    async (address: string, password: string) => {
      const out = await api.post<TokenOut>('/auth/register', { email: address, password });
      await finish(address, out);
    },
    [finish],
  );

  const value = useMemo(() => ({ ready, email, signIn, signUp, signOut }), [ready, email, signIn, signUp, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
