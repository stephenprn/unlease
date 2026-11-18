/**
 * « + » on a list's widget (a note widget, a lists widget), over the home screen: items typed one
 * after another, each added at the end of the list's open items as the editor adds them (`addCheck`),
 * the keyboard kept up for the next; what was added here is listed under the field, and the widget
 * shows it at once. The app never opens.
 */
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { t } from '@unlease/core/i18n';
import { shownTitle } from '@unlease/notes/models/entities';
import { TEXT_LIMITS } from '@unlease/notes/sync/types';
import { shownOutsideLock } from '@unlease/notes/services/lock';
import { addCheck } from '@app/store/actions';
import { useLibraryStore } from '@app/store/libraryStore';

import { AppText, CheckMark, EmptyLine, NewItemField, Sheet, SHEET_INSET, SheetScroll } from '../../components';

export interface AddItemSheetProps {
  readonly visible: boolean;
  /** The checklist the items go to. */
  readonly noteId: string;
  readonly onDismiss: () => void;
}

export function AddItemSheet({ visible, noteId, onDismiss }: AddItemSheetProps) {
  const note = useLibraryStore(s => s.notes[noteId]);
  const checks = useLibraryStore(s => s.checks);
  const [text, setText] = useState('');
  const [added, setAdded] = useState<readonly string[]>([]);
  // A list protected since the widget was made takes nothing from the home screen: it says it is gone.
  const live = !!note && note.deletedAt === null && note.trashedAt === null && note.kind === 'checklist' && shownOutsideLock(note);
  const name = note && live ? shownTitle(note).trim() : '';

  const add = () => {
    const typed = text.trim();
    if (!typed || !live) return;
    setText('');
    const id = addCheck(noteId, typed);
    setAdded(ids => [...ids, id]);
  };

  return (
    <Sheet visible={visible} onDismiss={onDismiss} title={name ? t('Add to {list}', { list: name }) : t('Add to this list')} keepsKeyboard>
      <SheetScroll contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {live ? (
          <NewItemField value={text} onChangeText={setText} onSubmit={add} placeholder={t('New item')} accessibilityLabel={t('New item')} submitLabel={t('Add')} maxLength={TEXT_LIMITS.check.text} keepKeyboard autoFocus />
        ) : (
          <EmptyLine glyph="checklist" text={t('This list is no longer here.')} slot={24} gap={16} style={styles.empty} />
        )}
        {/* What was added here, in the order typed: each on the list already. */}
        {added.map(id => {
          const item = checks[id];
          if (!item || item.deletedAt !== null) return null;
          return (
            <View key={id} style={styles.item}>
              <CheckMark checked={item.checked} recede />
              <AppText variant="body" numberOfLines={2} style={styles.text}>
                {item.text}
              </AppText>
            </View>
          );
        })}
      </SheetScroll>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { paddingBottom: 8 },
  empty: { marginHorizontal: SHEET_INSET, marginVertical: 8 },
  // On the field's columns: its box in the field's glyph slot (16 in, 24 wide), its words on the field's words.
  item: { flexDirection: 'row', alignItems: 'center', gap: 19, minHeight: 40, paddingLeft: SHEET_INSET + 3, paddingRight: SHEET_INSET },
  text: { flex: 1 },
});
