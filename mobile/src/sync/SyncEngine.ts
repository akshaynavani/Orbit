import { api } from '../api/client';
import { getMeta, setMeta } from '../db/database';
import { applyRemote, countDirty, getDeviceId, getDirty, markSynced } from '../db/repository';
import { PUSH_ORDER } from '../db/schema';
import { AnyRecord, EntityName } from '../types';
import { Change, PullResponse, PushResponse } from './protocol';

const CURSOR_KEY = 'sync_cursor';
const LAST_SYNC_KEY = 'last_sync_at';
const PUSH_BATCH = 500;
const MAX_PUSH_ROUNDS = 10;
const PULL_PAGE = 500;

export type SyncStatus = 'idle' | 'syncing' | 'error' | 'signed-out';

export interface SyncState {
  status: SyncStatus;
  lastSyncAt: number | null;
  pending: number;
  error: string | null;
}

type Listener = (s: SyncState) => void;

/**
 * Offline-first sync loop:
 *
 *   1. PUSH  – gather dirty rows (the outbox) in parent-before-child order and send
 *              them in batches. Accepted rows are marked clean *only if* they weren't
 *              edited again while the request was in flight. Rows that lost an LWW
 *              conflict ("stale") are overwritten with the server copy.
 *   2. PULL  – page through /sync/pull from the stored cursor, merging each page with
 *              LWW in one SQLite transaction, then persisting the new cursor. The
 *              cursor is only advanced after the page is committed, so a crash mid-sync
 *              just re-downloads that page (merges are idempotent).
 *
 * Calls are coalesced: if a sync is already running, callers get the same promise.
 */
class SyncEngine {
  private inFlight: Promise<SyncState> | null = null;
  private rerunRequested = false;
  private listeners = new Set<Listener>();
  private state: SyncState = { status: 'signed-out', lastSyncAt: null, pending: 0, error: null };

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.state);
    return () => {
      this.listeners.delete(fn);
    };
  }

  getState(): SyncState {
    return this.state;
  }

  private setState(patch: Partial<SyncState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((fn) => fn(this.state));
  }

  async refreshPending(): Promise<void> {
    const [pending, last] = await Promise.all([countDirty(), getMeta(LAST_SYNC_KEY)]);
    this.setState({
      pending,
      lastSyncAt: last ? Number(last) : null,
      status: api.isAuthenticated() ? (this.state.status === 'signed-out' ? 'idle' : this.state.status) : 'signed-out',
    });
  }

  /** Run a sync now (or join the one in progress, scheduling one more pass after it). */
  sync(): Promise<SyncState> {
    if (this.inFlight) {
      this.rerunRequested = true;
      return this.inFlight;
    }
    this.inFlight = this.runLoop().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private async runLoop(): Promise<SyncState> {
    do {
      this.rerunRequested = false;
      await this.runOnce();
    } while (this.rerunRequested && this.state.status !== 'error');
    return this.state;
  }

  private async runOnce(): Promise<void> {
    if (!api.isAuthenticated()) {
      await this.refreshPending();
      return;
    }
    this.setState({ status: 'syncing', error: null });
    try {
      await this.push();
      await this.pull();
      const ts = Date.now();
      await setMeta(LAST_SYNC_KEY, String(ts));
      this.setState({ status: 'idle', lastSyncAt: ts, pending: await countDirty() });
    } catch (e) {
      this.setState({ status: 'error', error: e instanceof Error ? e.message : String(e), pending: await countDirty() });
    }
  }

  private async collectOutbox(): Promise<{ entity: EntityName; record: AnyRecord }[]> {
    const out: { entity: EntityName; record: AnyRecord }[] = [];
    for (const entity of PUSH_ORDER) {
      if (out.length >= PUSH_BATCH) break;
      const rows = await getDirty(entity);
      for (const record of rows.slice(0, PUSH_BATCH - out.length)) out.push({ entity, record });
    }
    return out;
  }

  private async push(): Promise<void> {
    const deviceId = await getDeviceId();
    for (let round = 0; round < MAX_PUSH_ROUNDS; round++) {
      const outbox = await this.collectOutbox();
      if (outbox.length === 0) return;

      const pushedVersion = new Map(outbox.map(({ entity, record }) => [`${entity}/${record.id}`, record.updated_at]));
      const res = await api.post<PushResponse>('/sync/push', {
        device_id: deviceId,
        changes: outbox.map(({ entity, record }) => {
          // server_seq is server-owned; don't send it.
          const { server_seq: _seq, ...rest } = record;
          return { entity, record: rest };
        }),
      });

      const losers: Change[] = [];
      for (const r of res.results) {
        const version = pushedVersion.get(`${r.entity}/${r.id}`);
        if (version === undefined) continue;
        if (r.status === 'stale' && r.record) {
          // Our edit lost to a newer one; take the server copy (unless we edited again since).
          losers.push({ entity: r.entity, record: r.record });
          await markSynced(r.entity, r.id, version, r.server_seq);
        } else {
          // 'applied', or 'rejected' (malformed / not ours): either way it must leave
          // the outbox, otherwise a permanently invalid row would block sync forever.
          if (r.status === 'rejected') console.warn(`[sync] ${r.entity}/${r.id} rejected: ${r.reason}`);
          await markSynced(r.entity, r.id, version, r.server_seq);
        }
      }
      if (losers.length) await applyRemote(losers);

      // Rows edited during the request stay dirty and go out in the next round.
    }
  }

  private async pull(): Promise<void> {
    let cursor = Number((await getMeta(CURSOR_KEY)) ?? 0);
    for (;;) {
      const page = await api.get<PullResponse>(`/sync/pull?cursor=${cursor}&limit=${PULL_PAGE}`);
      if (page.changes.length) await applyRemote(page.changes);
      cursor = page.next_cursor;
      await setMeta(CURSOR_KEY, String(cursor));
      if (!page.has_more) return;
    }
  }

  /** Forget the cursor so the next sync re-downloads everything (after account switch). */
  async resetCursor(): Promise<void> {
    await setMeta(CURSOR_KEY, '0');
    await setMeta(LAST_SYNC_KEY, null);
  }
}

export const syncEngine = new SyncEngine();
