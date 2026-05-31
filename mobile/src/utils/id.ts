import * as Crypto from 'expo-crypto';

export function newId(): string {
  return Crypto.randomUUID();
}

/** Habit logs use a deterministic id so check-ins from several devices merge. */
export function habitLogId(habitId: string, day: string): string {
  return `${habitId}:${day}`;
}
