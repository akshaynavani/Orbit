import { api } from '../api/client';
import { TasksRepo } from '../db/repositories/tasks';
import { ParsedTask, parseQuickAdd } from '../utils/quickAdd';

const NL_TIMEOUT_MS = 1_500;

/**
 * Create a task from free text. When signed in and reachable, the backend's richer
 * natural-language parser is used; otherwise (or if it is slow) the on-device
 * parser. Either way the task itself is written locally first and synced later,
 * so quick add never blocks on the network.
 */
export async function quickAddTask(text: string): Promise<void> {
  let parsed: ParsedTask | null = null;
  if (api.isAuthenticated()) {
    try {
      parsed = await api.post<ParsedTask>(
        '/nl/parse',
        { text, now: Date.now(), tz_offset_minutes: -new Date().getTimezoneOffset() },
        NL_TIMEOUT_MS,
      );
    } catch {
      parsed = null;
    }
  }
  await TasksRepo.create(parsed ?? parseQuickAdd(text));
}
