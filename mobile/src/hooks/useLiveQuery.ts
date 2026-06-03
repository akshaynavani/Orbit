import { DependencyList, useCallback, useEffect, useRef, useState } from 'react';

import { EntityName } from '../types';
import { dataEvents } from '../utils/events';

/**
 * Runs `fetcher` and re-runs it whenever any of `entities` change locally
 * (user edits or records merged by sync).
 */
export function useLiveQuery<T>(
  fetcher: () => Promise<T>,
  entities: EntityName[],
  deps: DependencyList = [],
): { data: T | undefined; loading: boolean; refresh: () => Promise<void> } {
  const [data, setData] = useState<T>();
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(fetcher, deps);

  const refresh = useCallback(async () => {
    const result = await run();
    if (mounted.current) {
      setData(result);
      setLoading(false);
    }
  }, [run]);

  useEffect(() => {
    mounted.current = true;
    refresh();
    const unsubscribe = dataEvents.subscribe((changed) => {
      if (entities.some((e) => changed.has(e))) refresh();
    });
    return () => {
      mounted.current = false;
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh, entities.join(',')]);

  return { data, loading, refresh };
}
