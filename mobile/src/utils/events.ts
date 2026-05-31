import { EntityName } from '../types';

type Listener = (entities: Set<EntityName>) => void;

const listeners = new Set<Listener>();

/** Tiny pub/sub so screens re-query when local data changes (user edits or sync). */
export const dataEvents = {
  subscribe(fn: Listener): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  emit(entities: EntityName[] | Set<EntityName>): void {
    const set = new Set(entities);
    if (set.size === 0) return;
    listeners.forEach((fn) => fn(set));
  },
};
