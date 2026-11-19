/**
 * A note written over the home screen (Actions rapides, a label's widget): the editor's title and
 * words, or its items for a list, the photos picked for it above them, and what it wears (its
 * reminder, its label) at its foot as on its card. Nothing is written before « Enregistrer », then all
 * of it at once; closing on something typed asks first, as the link field does.
 */
import React, { useRef, useState } from 'react';
import { Image, Keyboard, StyleSheet, View } from 'react-native';

import { SHAPES } from '@unlease/design/shapes';
import { t } from '@unlease/core/i18n';
import { formatReminder } from '@unlease/core/services/format';
import { TEXT_LIMITS } from '@unlease/notes/sync/types';
import type { MediaFile } from '@shared/platform/media';
import { useLibraryStore } from '@app/store/libraryStore';
import type { CapturedNote } from '@app/store/actions';

import { AppText, Button, CheckMark, EdgeScrollView, FormFoot, Icon, LabelMark, NewItemField, Organic, Sheet, SHEET_INSET, SheetScroll, Tappable, TextField, useUnsaved } from '../../components';
import { corners } from '@shared/ui/theme/shape';
import { useTheme } from '@shared/ui/theme/ThemeProvider';
import { ReminderSheet } from '../note/ReminderSheet';

export interface QuickNoteSheetProps {
  readonly visible: boolean;
  readonly kind: 'text' | 'checklist';
  /** The label it is born with ('' for none). */
  readonly labelId: string;
  /** Picked or taken before the sheet opened. */
  readonly photos: readonly MediaFile[];
  /** Opens on the reminder's choice first (« Rappel » in Actions rapides). */
  readonly askReminder: boolean;
  readonly onDismiss: () => void;
  readonly onSave: (note: Omit<CapturedNote, 'photos'>) => void;
}

const CHIP = corners(SHAPES.chip);
const FRAME = corners(SHAPES.frame);
/** A photo's frame in the strip: the height of two lines of words, as wide as the photo makes it (3:4 to 4:3). */
const PHOTO_HEIGHT = 72;

export function QuickNoteSheet({ visible, kind, labelId, photos, askReminder, onDismiss, onSave }: QuickNoteSheetProps) {
  const theme = useTheme();
  const label = useLibraryStore(s => (labelId ? s.labels[labelId] : undefined));
  const shownLabel = label && label.deletedAt === null ? label : undefined;
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [item, setItem] = useState('');
  const [items, setItems] = useState<readonly string[]>([]);
  const [reminderAt, setReminderAt] = useState<number | null>(null);
  // The reminder's choice shows in place of the note, never over it: one sheet at a time in the window. The
  // note's sheet draws its fields the first time it shows, so they take the caret then, the reminder chosen.
  const [choosing, setChoosing] = useState(askReminder);
  // The reminder sheet closes itself right after a pick, in the same press: what was picked is known here first.
  const picked = useRef(false);
  const [now] = useState(Date.now);

  const list = kind === 'checklist';
  const typedItems = item.trim() ? [...items, item.trim()] : items;
  const holds = !!title.trim() || (list ? typedItems.length > 0 : !!body.trim()) || photos.length > 0 || reminderAt !== null;
  const unsaved = useUnsaved(visible && holds);
  const dismiss = unsaved.guard(onDismiss);

  const save = () => {
    Keyboard.dismiss();
    unsaved.saved();
    onSave({ kind, title: title.trim(), body: body.replace(/\s+$/, ''), items: typedItems, labelIds: shownLabel ? [shownLabel.id] : [], reminderAt });
  };
  const addItem = () => {
    setItems(current => [...current, item.trim()]);
    setItem('');
  };

  // The label it wears is its chip, as at the foot of its editor.
  const heading = list ? t('New list') : t('New note');

  return (
    <>
      <Sheet visible={visible && !choosing} onDismiss={dismiss} title={heading} keepsKeyboard={list}>
        <SheetScroll contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {photos.length > 0 ? (
            <EdgeScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photos} style={styles.photoStrip}>
              {photos.map(photo => (
                <Organic key={photo.path} style={[styles.photo, FRAME, { width: photoWidth(photo), backgroundColor: theme.color.paperHigh, borderColor: theme.color.hairline }]}>
                  <Image source={{ uri: photo.path.startsWith('file://') ? photo.path : `file://${photo.path}` }} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityIgnoresInvertColors />
                </Organic>
              ))}
            </EdgeScrollView>
          ) : null}
          <TextField kind="text" value={title} onChangeText={setTitle} placeholder={t('Title')} accessibilityLabel={t('Title')} maxLength={TEXT_LIMITS.note.title} returnKeyType="next" submitBehavior="submit" />
          {list ? (
            <>
              {items.map((text, k) => (
                <View key={k} style={styles.item}>
                  <CheckMark checked={false} recede />
                  <AppText variant="body" numberOfLines={2} style={styles.flex}>
                    {text}
                  </AppText>
                </View>
              ))}
              <NewItemField
                value={item}
                onChangeText={setItem}
                onSubmit={addItem}
                placeholder={t('New item')}
                accessibilityLabel={t('New item')}
                submitLabel={t('Add')}
                maxLength={TEXT_LIMITS.check.text}
                keepKeyboard
                autoFocus
                style={styles.newItem}
              />
            </>
          ) : (
            <TextField kind="prose" multiline value={body} onChangeText={setBody} placeholder={t('Note')} accessibilityLabel={t('Note')} maxLength={TEXT_LIMITS.note.body} autoFocus={photos.length === 0} />
          )}
          {/* What it wears, as at the foot of its editor. */}
          {reminderAt !== null || shownLabel ? (
            <View style={styles.chips}>
              {reminderAt !== null ? (
                <Tappable onPress={() => setChoosing(true)} style={[styles.chip, CHIP, { borderColor: theme.color.outline }]} accessibilityLabel={t('Edit the reminder')}>
                  <Icon name="bell" size={16} color={theme.color.inkMuted} />
                  <AppText variant="label">{formatReminder(reminderAt, now)}</AppText>
                </Tappable>
              ) : null}
              {shownLabel ? (
                <View style={[styles.chip, CHIP, { borderColor: theme.color.outline }]} accessibilityLabel={t('Label {name}', { name: shownLabel.name })}>
                  <LabelMark name={shownLabel.name} color={shownLabel.color} />
                </View>
              ) : null}
            </View>
          ) : null}
        </SheetScroll>
        <FormFoot>
          {reminderAt === null ? <Button kind="text" label={t('Reminder')} icon="bell" onPress={() => setChoosing(true)} /> : null}
          <Button label={t('Save')} icon="check" disabled={!holds} onPress={save} />
        </FormFoot>
      </Sheet>
      <ReminderSheet
        visible={visible && choosing}
        current={reminderAt}
        onDismiss={() => {
          setChoosing(false);
          // « Rappel » asked first and left without a time: nothing was written, so nothing is left to show.
          if (askReminder && !picked.current && reminderAt === null && !holds) onDismiss();
        }}
        onSet={time => {
          picked.current = time !== null;
          setReminderAt(time);
          setChoosing(false);
        }}
      />
      {unsaved.dialog}
    </>
  );
}

function photoWidth(photo: MediaFile): number {
  const ratio = photo.width > 0 && photo.height > 0 ? photo.width / photo.height : 1;
  return Math.round(PHOTO_HEIGHT * Math.min(4 / 3, Math.max(3 / 4, ratio)));
}

const styles = StyleSheet.create({
  body: { gap: 14, paddingHorizontal: SHEET_INSET, paddingBottom: 8 },
  flex: { flex: 1 },
  photoStrip: { marginHorizontal: -SHEET_INSET },
  photos: { gap: 8, paddingHorizontal: SHEET_INSET },
  photo: { height: PHOTO_HEIGHT, borderWidth: 1, overflow: 'hidden' },
  // On the new item's columns: the box in its glyph slot, the words on its words.
  item: { flexDirection: 'row', alignItems: 'center', gap: 19, minHeight: 40, paddingLeft: 3 },
  newItem: { marginHorizontal: -SHEET_INSET },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 40, borderWidth: 1, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 6 },
});
