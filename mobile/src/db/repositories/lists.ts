import { ListItem, OrbitList } from '../../types';
import { insert, query, remove, update } from '../repository';

export const ListsRepo = {
  list(): Promise<OrbitList[]> {
    return query('lists', '1=1', [], 'sort_order ASC, created_at ASC');
  },

  async create(name: string, color = '#00B894') {
    const existing = await ListsRepo.list();
    return insert('lists', { name: name.trim(), color, sort_order: existing.length });
  },

  rename(id: string, name: string) {
    return update('lists', id, { name: name.trim() });
  },

  /** Deleting a list tombstones its items too so every device converges. */
  async remove(id: string) {
    const items = await ListsRepo.items(id);
    for (const item of items) await remove('list_items', item.id);
    await remove('lists', id);
  },

  items(listId: string): Promise<ListItem[]> {
    return query('list_items', 'list_id = ?', [listId], 'checked ASC, sort_order ASC');
  },

  async addItem(listId: string, text: string) {
    const items = await ListsRepo.items(listId);
    return insert('list_items', { list_id: listId, text: text.trim(), checked: false, sort_order: items.length });
  },

  toggleItem(item: ListItem) {
    return update('list_items', item.id, { checked: !item.checked });
  },

  removeItem(id: string) {
    return remove('list_items', id);
  },
};
