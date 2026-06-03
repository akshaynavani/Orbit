import { Editable, Task } from '../../types';
import { now } from '../../utils/time';
import { insert, query, remove, update } from '../repository';

export type TaskFilter = 'today' | 'upcoming' | 'all' | 'completed';

function endOfToday(): number {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

export const TasksRepo = {
  list(filter: TaskFilter = 'all'): Promise<Task[]> {
    const order = 'due_at IS NULL, due_at ASC, priority DESC, created_at ASC';
    switch (filter) {
      case 'today':
        return query('tasks', 'completed = 0 AND due_at IS NOT NULL AND due_at <= ?', [endOfToday()], order);
      case 'upcoming':
        return query('tasks', 'completed = 0 AND due_at > ?', [endOfToday()], order);
      case 'completed':
        return query('tasks', 'completed = 1', [], 'completed_at DESC');
      default:
        return query('tasks', 'completed = 0', [], order);
    }
  },

  create(input: { title: string; notes?: string | null; due_at?: number | null; priority?: number; tags?: string[] }) {
    return insert('tasks', {
      title: input.title.trim(),
      notes: input.notes ?? null,
      due_at: input.due_at ?? null,
      priority: input.priority ?? 0,
      tags: (input.tags ?? []).map((t) => t.replace(/^#/, '')).join(','),
      completed: false,
      completed_at: null,
    });
  },

  update(id: string, patch: Partial<Editable<Task>>) {
    return update('tasks', id, patch);
  },

  toggleComplete(task: Task) {
    const completed = !task.completed;
    return update('tasks', task.id, { completed, completed_at: completed ? now() : null });
  },

  remove(id: string) {
    return remove('tasks', id);
  },
};
