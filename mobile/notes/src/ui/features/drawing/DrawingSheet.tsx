/**
 * A drawing note's sheet on its screen, under the title: the canvas fills what the screen leaves
 * (it never scrolls the note: two fingers scroll the drawing itself), the tools at its foot above
 * the note's own bar, aside while the title is typed. Nothing waits to be saved: every stroke is
 * kept as it is let go, so the screen's own check for an empty note sees it.
 */
import type React from 'react';
import { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';

import { saveTypedText } from '@app/store/actions';
import { useLibraryStore } from '@app/store/libraryStore';

import { useKeyboardVisible } from '../../components/useKeyboardVisible';
import { DrawingCanvas } from './DrawingCanvas';
import { DrawingTools } from './DrawingTools';
import { useDrawingEditor } from './useDrawingEditor';

/** The note screen's side inset around its title and text: the sheet's tools reach the screen's sides, the canvas keeps clear of the back gesture's edges. */
const NOTE_SIDE = 16;

export function DrawingSheet({ noteId, editable }: { noteId: string; editable: boolean }): React.ReactElement | null {
  const keyboard = useKeyboardVisible();
  const stored = useLibraryStore(s => s.notes[noteId]?.drawing ?? '');
  const read = useCallback(() => useLibraryStore.getState().notes[noteId]?.drawing ?? '', [noteId]);
  const save = useCallback((since: string, typed: string) => saveTypedText('note', noteId, 'drawing', since, typed), [noteId]);
  const editor = useDrawingEditor({ stored, read, save, editable });
  return (
    <View style={styles.sheet}>
      <DrawingCanvas editor={editor} style={styles.canvas} />
      {editable && !keyboard ? <DrawingTools editor={editor} tone="ink" history edge /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, marginHorizontal: -NOTE_SIDE },
  // Room enough to draw in when the note's photos take the top of the screen.
  canvas: { flex: 1, minHeight: 240, marginHorizontal: NOTE_SIDE },
});
