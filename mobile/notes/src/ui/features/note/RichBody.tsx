/**
 * A text note's body, typed in place: one native field drawing the note's lines with their headings
 * and marks (`NoteRuns`), every line on the editor's 26 pitch so a ruled paper stays in step. What
 * it holds and saves is `useNoteBody`'s; this draws it and hands the field's events back.
 */
import React, { useEffect, useRef } from 'react';
import { TextInput, type StyleProp, type TextStyle } from 'react-native';

import { t } from '@unlease/core/i18n';
import { TEXT_LIMITS } from '@unlease/notes/sync/types';

import { useTheme } from '../../theme/ThemeProvider';
import { variantStyle } from '../../theme/typography';
import { NoteRuns } from './noteText';
import type { NoteBodyEditor } from './useNoteBody';

export interface RichBodyProps {
  readonly editor: NoteBodyEditor;
  readonly editable: boolean;
  readonly autoFocus?: boolean;
  readonly style?: StyleProp<TextStyle>;
}

export function RichBody({ editor, editable, autoFocus, style }: RichBodyProps) {
  const theme = useTheme();
  const { input, takeSelection } = editor;
  const shown = useRef(editor.text);
  shown.current = editor.text;

  // A caret or a selection asked for (a heading's « # » taken away, words formatted, an edit from elsewhere): set a frame
  // later, once the field shows the latest lines (set sooner, the new text would move it), unless typing went on meanwhile.
  useEffect(() => {
    const at = takeSelection();
    if (!at) return;
    const text = shown.current;
    requestAnimationFrame(() => {
      if (shown.current === text) input.current?.setSelection(at.start, at.end);
    });
  });

  return (
    <TextInput
      ref={input}
      onChangeText={editor.onChangeText}
      onSelectionChange={event => editor.onSelectionChange(event.nativeEvent.selection)}
      onKeyPress={event => editor.onKeyPress(event.nativeEvent.key)}
      onFocus={editor.onFocus}
      onBlur={editor.onBlur}
      editable={editable}
      placeholder={t('Note')}
      placeholderTextColor={theme.color.inkFaint}
      selectionColor={theme.color.highlight}
      selectionHandleColor={theme.color.focus}
      cursorColor={theme.color.focus}
      multiline
      autoFocus={autoFocus}
      textAlignVertical="top"
      style={[variantStyle(theme, 'editorBody'), style]}
      maxLength={TEXT_LIMITS.note.body}
      accessibilityLabel={t('Texte de la note')}
    >
      <NoteRuns lines={editor.lines} place="editor" />
    </TextInput>
  );
}
