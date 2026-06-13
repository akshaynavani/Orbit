import NetInfo from '@react-native-community/netinfo';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { dataEvents } from '../utils/events';
import { syncEngine, SyncState } from './SyncEngine';

const LOCAL_EDIT_DEBOUNCE_MS = 2_000;
const PERIODIC_MS = 60_000;

/**
 * Installs the sync triggers. Mount once near the app root.
 *  - app returns to foreground
 *  - network connectivity is regained
 *  - shortly after local edits (debounced)
 *  - every minute while the app is open
 */
export function useSyncTriggers(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    let debounce: ReturnType<typeof setTimeout> | undefined;
    let online = true;

    const trigger = () => {
      if (online) syncEngine.sync();
    };

    trigger();
    const appSub = AppState.addEventListener('change', (s) => s === 'active' && trigger());
    const netUnsub = NetInfo.addEventListener((s) => {
      const nowOnline = !!s.isConnected && s.isInternetReachable !== false;
      if (nowOnline && !online) {
        online = true;
        trigger();
      }
      online = nowOnline;
    });
    const dataUnsub = dataEvents.subscribe((_entities, origin) => {
      if (origin !== 'local') return;
      syncEngine.refreshPending();
      clearTimeout(debounce);
      debounce = setTimeout(trigger, LOCAL_EDIT_DEBOUNCE_MS);
    });
    const interval = setInterval(trigger, PERIODIC_MS);

    return () => {
      appSub.remove();
      netUnsub();
      dataUnsub();
      clearInterval(interval);
      clearTimeout(debounce);
    };
  }, [enabled]);
}

export function useSyncState(): SyncState {
  const [state, setState] = useState<SyncState>(syncEngine.getState());
  useEffect(() => syncEngine.subscribe(setState), []);
  return state;
}
