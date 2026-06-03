import { Note } from '../../types';
import { insert, query, remove, update } from '../repository';

export const NotesRepo = {
  list(search = ''): Promise<Note[]> {
    if (search.trim()) {
      const like = `%${search.trim()}%`;
      return query('notes', 'title LIKE ? OR body LIKE ?', [like, like], 'pinned DESC, updated_at DESC');
    }
    return query('notes', '1=1', [], 'pinned DESC, updated_at DESC');
  },

  create(input: { title?: string; body?: string }) {
    return insert('notes', { title: input.title ?? '', body: input.body ?? '', pinned: false });
  },

  update(id: string, patch: Partial<Pick<Note, 'title' | 'body' | 'pinned'>>) {
    return update('notes', id, patch);
  },

  remove(id: string) {
    return remove('notes', id);
  },
};
