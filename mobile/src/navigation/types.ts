export type RootStackParamList = {
  Tabs: undefined;
  TaskEditor: { taskId: string };
  NoteEditor: { noteId?: string };
  ListDetail: { listId: string; name: string };
};

export type TabParamList = {
  Tasks: undefined;
  Habits: undefined;
  Notes: undefined;
  Lists: undefined;
  Settings: undefined;
};
