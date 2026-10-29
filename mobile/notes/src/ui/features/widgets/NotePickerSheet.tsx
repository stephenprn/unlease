/**
 * "Quelle note ?": the notes and lists as the board orders them (pinned first, the archive after),
 * or what a search finds; collections are not offered (they have their own widget).
 */
import React, { memo, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { SHAPES } from '@unlease/design/shapes';
import { t } from '@unlease/core/i18n';
import { plural } from '@unlease/core/services/format';
import type { Note } from '@unlease/notes/models/entities';
import { bodyText } from '@unlease/notes/services/noteBody';
import { useSearch } from '@app/hooks/useBoard';
import { useLibraryStore, type LibraryState } from '@app/store/libraryStore';

import { AppText, Icon, Sheet, SheetScroll, Tappable, TextField } from '../../components';
import { corners } from '../../theme/shape';
import { useTheme } from '../../theme/ThemeProvider';

/** Rows shown before a search narrows them. */
const SHOWN = 80;

export interface NotePickerSheetProps {
  readonly visible: boolean;
  /** The note shown now, ticked. */
  readonly current: string | null;
  readonly title: string;
  readonly onDismiss: () => void;
  readonly onPick: (noteId: string) => void;
}

const pickable = (note: Note | undefined): note is Note => !!note && note.deletedAt === null && note.trashedAt === null && note.kind !== 'links';

/** A row's two lines: its title (or its first words), then what follows or how much is left to do. */
function summary(note: Note, state: LibraryState): { readonly title: string; readonly detail: string } {
  if (note.kind === 'checklist') {
    const items = (state.checksByNote[note.id] ?? []).map(id => state.checks[id]).filter(item => !!item && item.text.trim());
    const open = items.filter(item => !item!.checked);
    const title = note.title.trim() || open[0]?.text || items[0]?.text || t('Liste sans titre');
    return { title, detail: open.length > 0 ? plural(open.length, 'élément à faire', 'éléments à faire') : t('Tout est coché') };
  }
  const lines = bodyText(note).split('\n').map(line => line.trim()).filter(Boolean);
  if (note.title.trim()) return { title: note.title.trim(), detail: lines[0] ?? '' };
  return { title: lines[0] ?? t('Note sans texte'), detail: lines[1] ?? '' };
}

export function NotePickerSheet({ visible, current, title, onDismiss, onPick }: NotePickerSheetProps) {
  const [query, setQuery] = useState('');
  const hits = useSearch(query);
  const notes = useLibraryStore(s => s.notes);
  const order = useLibraryStore(s => s.noteOrder);
  const ids = useMemo(() => {
    if (query.trim()) return hits.filter(id => pickable(notes[id]));
    const live = order.map(id => notes[id]).filter(pickable);
    const active = live.filter(note => !note.archived);
    return [...active.filter(note => note.pinned), ...active.filter(note => !note.pinned), ...live.filter(note => note.archived)].slice(0, SHOWN).map(note => note.id);
  }, [query, hits, notes, order]);

  return (
    <Sheet visible={visible} onDismiss={onDismiss} title={title} tall>
      <View style={styles.search}>
        <TextField value={query} onChangeText={setQuery} placeholder={t('Rechercher une note')} returnKeyType="search" autoCorrect={false} accessibilityLabel={t('Rechercher une note')} />
      </View>
      <SheetScroll contentContainerStyle={styles.body}>
        {ids.length === 0 ? (
          <AppText variant="meta" style={styles.empty}>
            {query.trim() ? t('Aucune note ne correspond.') : t('Aucune note pour l’instant.')}
          </AppText>
        ) : null}
        {ids.map(id => (
          <NoteRow
            key={id}
            id={id}
            current={id === current}
            onPress={() => {
              onDismiss();
              if (id !== current) onPick(id);
            }}
          />
        ))}
      </SheetScroll>
    </Sheet>
  );
}

const NoteRow = memo(function NoteRowView({ id, current, onPress }: { id: string; current: boolean; onPress: () => void }) {
  const theme = useTheme();
  const note = useLibraryStore(s => s.notes[id]);
  const checks = useLibraryStore(s => s.checksByNote[id]);
  // `checks` stands for the note's items: the row's words are read again when they change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const text = useMemo(() => (note ? summary(note, useLibraryStore.getState()) : null), [note, checks]);
  if (!note || !text) return null;
  return (
    <Tappable onPress={onPress} accessibilityLabel={text.title} accessibilityState={{ selected: current }} style={styles.row}>
      <Icon name={note.kind === 'checklist' ? 'checklist' : note.kind === 'drawing' ? 'draw' : 'note'} size={24} color={theme.color.ink} />
      <View style={styles.text}>
        <AppText variant="body" numberOfLines={1}>
          {text.title}
        </AppText>
        {text.detail ? (
          <AppText variant="meta" numberOfLines={1}>
            {text.detail}
          </AppText>
        ) : null}
      </View>
      {current ? <Icon name="check" size={22} color={theme.color.focus} /> : null}
    </Tappable>
  );
});

const styles = StyleSheet.create({
  search: { marginHorizontal: 8, marginBottom: 8 },
  body: { paddingBottom: 8 },
  empty: { marginHorizontal: 8, marginTop: 8 },
  // A list row's anatomy (`ListRow`), its lines cut to one each.
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 16, marginHorizontal: 6, paddingHorizontal: 10, paddingVertical: 8, ...corners(SHAPES.tab) },
  text: { flex: 1, gap: 2 },
});
