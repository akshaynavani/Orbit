export interface Versioned {
  updated_at: number;
  device_id: string | null;
}

/** Compare (updated_at, device_id) pairs exactly like the backend does. */
export function compareVersions(a: Versioned, b: Versioned): number {
  if (a.updated_at !== b.updated_at) return a.updated_at < b.updated_at ? -1 : 1;
  const da = a.device_id ?? '';
  const db = b.device_id ?? '';
  if (da === db) return 0;
  return da < db ? -1 : 1;
}

export type MergeDecision = 'insert' | 'overwrite' | 'keep-local' | 'ack';

/**
 * Decide what to do with a record arriving from the server.
 *
 * - No local row                     -> insert it.
 * - Local row is clean               -> server is authoritative, overwrite.
 * - Local row is dirty (unpushed):
 *     remote newer                   -> overwrite (our edit lost the race).
 *     identical version              -> it's the echo of our own push, just ack.
 *     local newer                    -> keep local; it will win when pushed.
 */
export function decideMerge(
  local: (Versioned & { dirty: boolean }) | null,
  remote: Versioned,
): MergeDecision {
  if (!local) return 'insert';
  if (!local.dirty) return 'overwrite';
  const cmp = compareVersions(remote, local);
  if (cmp > 0) return 'overwrite';
  if (cmp === 0) return 'ack';
  return 'keep-local';
}
