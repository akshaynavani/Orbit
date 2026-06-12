import { EntityName } from '../types';

/** 'local' = user edit on this device, 'remote' = merged from the server. */
export type ChangeOrigin = 'local' | 'remote';

type Listener = (entities: Set<EntityName>, origin: ChangeOrigin) => void;

const listeners = new Set<Listener>();

/** Tiny pub/sub so screens re-query when local data changes (user edits or sync). */
export const dataEvents = {
  subscribe(fn: Listener): () => void {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
  emit(entities: EntityName[] | Set<EntityName>, origin: ChangeOrigin = 'local'): void {
    const set = new Set(entities);
    if (set.size === 0) return;
    listeners.forEach((fn) => fn(set, origin));
  },
};
