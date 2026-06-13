import { EntityName } from '../types';

/** Wire types for /sync, mirroring backend app/schemas.py. */
export interface Change {
  entity: EntityName;
  record: Record<string, unknown>;
}

export interface ChangeResult {
  entity: EntityName;
  id: string;
  status: 'applied' | 'stale' | 'rejected';
  server_seq: number | null;
  reason: string | null;
  record: Record<string, unknown> | null;
}

export interface PushResponse {
  results: ChangeResult[];
  applied: number;
  stale: number;
  rejected: number;
}

export interface PullResponse {
  changes: Change[];
  next_cursor: number;
  has_more: boolean;
}
