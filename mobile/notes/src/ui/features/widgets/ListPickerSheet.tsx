/**
 * The head of a lists widget, opened: which of the label's notes it shows (the label's view on the
 * board: pinned first, the archive and the bin left out, collections aside), a new list wearing the
 * label made right here, and another label.
 */
import React, { useMemo, useState } from 'react';
import { StyleSheet } from 'react-native';

import { t } from '@unlease/core/i18n';
import { createNote } from '@app/store/actions';
import { useLibraryStore } from '@app/store/libraryStore';
import { listsOf } from '@app/widgetPayloads';
import { useMinute } from '@shared/app/hooks/useMinute';

import { EmptyLine, ListRow, NewItemField, Sheet, SHEET_INSET, SheetScroll } from '../../components';
import { NoteRow } from './NotePickerSheet';

export interface ListPickerSheetProps {
  readonly visible: boolean;
  readonly label: string;
  /** The note shown now, ticked. */
  readonly current: string | null;
  readonly title: string;
  readonly onDismiss: () => void;
  readonly onPick: (noteId: string) => void;
  /** Another label: its picker takes this one's place. */
  readonly onOtherLabel: () => void;
}

export function ListPickerSheet({ visible, label, current, title, onDismiss, onPick, onOtherLabel }: ListPickerSheetProps) {
  const now = useMinute();
  const notes = useLibraryStore(s => s.notes);
  const order = useLibraryStore(s => s.noteOrder);
  // `notes` and `order` stand for what the label's view reads: read again when they change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const ids = useMemo(() => listsOf(useLibraryStore.getState(), label, now), [label, notes, order, now]);
  const [name, setName] = useState('');

  const pick = (id: string) => {
    onDismiss();
    if (id !== current) onPick(id);
  };
  const create = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setName('');
    pick(createNote({ kind: 'checklist', title: trimmed, labelIds: [label] }));
  };

  return (
    <Sheet visible={visible} onDismiss={onDismiss} title={title} tall>
      <SheetScroll contentContainerStyle={styles.body}>
        {ids.length === 0 ? <EmptyLine glyph="checklist" text={t('No notes with this label yet: name the first list.')} slot={24} gap={16} style={styles.empty} /> : null}
        {ids.map(id => (
          <NoteRow key={id} id={id} current={id === current} onPress={() => pick(id)} />
        ))}
        {/* On the rows' columns, its ✓ inside it: a new list wearing the label, shown at once. */}
        <NewItemField value={name} onChangeText={setName} onSubmit={create} placeholder={t('New list')} accessibilityLabel={t('New list’s title')} submitLabel={t('Create')} maxLength={200} icon="checklist" style={styles.create} />
        <ListRow icon="tag" title={t('Show another label')} onPress={onOtherLabel} />
      </SheetScroll>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { paddingBottom: 8 },
  empty: { marginHorizontal: SHEET_INSET, marginBottom: 8 },
  create: { marginVertical: 8 },
});
