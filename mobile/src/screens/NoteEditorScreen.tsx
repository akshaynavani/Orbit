import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Pressable, Text, TextInput } from 'react-native';

import { colors } from '../components/theme';
import { Screen, styles } from '../components/ui';
import { NotesRepo } from '../db/repositories/notes';
import { findById } from '../db/repository';
import { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'NoteEditor'>;

const AUTOSAVE_MS = 800;

/**
 * Notes autosave (debounced) so every keystroke doesn't create a new version
 * to sync. The note row is created lazily on the first non-empty edit.
 */
export default function NoteEditorScreen({ route, navigation }: Props) {
  const [noteId, setNoteId] = useState<string | undefined>(route.params.noteId);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [pinned, setPinned] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const latest = useRef({ title, body, noteId });
  latest.current = { title, body, noteId };

  useEffect(() => {
    if (!route.params.noteId) return;
    findById('notes', route.params.noteId).then((n) => {
      if (!n) return;
      setTitle(n.title);
      setBody(n.body);
      setPinned(n.pinned);
    });
  }, [route.params.noteId]);

  const flush = async () => {
    const { title: t, body: b, noteId: id } = latest.current;
    if (id) {
      const existing = await findById('notes', id);
      if (existing && (existing.title !== t || existing.body !== b)) await NotesRepo.update(id, { title: t, body: b });
    } else if (t.trim() || b.trim()) {
      const created = await NotesRepo.create({ title: t, body: b });
      setNoteId(created.id);
      latest.current.noteId = created.id;
    }
  };

  const schedule = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, AUTOSAVE_MS);
  };

  useEffect(
    () => () => {
      clearTimeout(timer.current);
      flush();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          onPress={async () => {
            await flush();
            const id = latest.current.noteId;
            if (!id) return;
            await NotesRepo.update(id, { pinned: !pinned });
            setPinned(!pinned);
          }}
        >
          <Text style={{ color: colors.accent }}>{pinned ? 'Unpin' : 'Pin'}</Text>
        </Pressable>
      ),
    });
  });

  return (
    <Screen>
      <TextInput
        style={[styles.title, { fontSize: 22, fontWeight: '700', marginBottom: 12 }]}
        placeholder="Title"
        placeholderTextColor={colors.muted}
        value={title}
        onChangeText={(v) => {
          setTitle(v);
          schedule();
        }}
      />
      <TextInput
        style={[styles.title, { flex: 1, textAlignVertical: 'top', lineHeight: 22 }]}
        placeholder="Start writing…"
        placeholderTextColor={colors.muted}
        value={body}
        onChangeText={(v) => {
          setBody(v);
          schedule();
        }}
        multiline
        autoFocus={!route.params.noteId}
      />
      {noteId ? (
        <Pressable
          style={{ paddingVertical: 12, alignItems: 'center' }}
          onPress={async () => {
            clearTimeout(timer.current);
            await NotesRepo.remove(noteId);
            latest.current = { title: '', body: '', noteId: undefined };
            navigation.goBack();
          }}
        >
          <Text style={{ color: colors.danger }}>Delete note</Text>
        </Pressable>
      ) : null}
    </Screen>
  );
}
