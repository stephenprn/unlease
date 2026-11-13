/**
 * A text note's body, typed in place: one native field drawing the note's lines with their headings
 * and marks (`NoteRuns`), every line on the editor's 26 pitch so a ruled paper stays in step (the
 * field itself has no line height: its lines take theirs from their words, so typing after a line
 * break never lays the lines above out wrong). What it holds and saves is `useNoteBody`'s; this
 * draws it and hands the field's events back.
 */
import React, { useEffect, useRef } from 'react';
import { TextInput, type StyleProp, type TextStyle } from 'react-native';

import { t } from '@unlease/core/i18n';
import { TEXT_LIMITS } from '@unlease/notes/sync/types';

import { useGrowingInput } from '@shared/ui/components/useGrowingInput';
import { useTheme } from '@shared/ui/theme/ThemeProvider';
import { NoteRuns, noteFieldStyle } from './noteText';
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
  // The body grows with its lines, which stay still as one is added.
  const growing = useGrowingInput();
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
      ref={node => {
        input.current = node;
        growing.attach(node);
      }}
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
      style={[noteFieldStyle(theme), style]}
      maxLength={TEXT_LIMITS.note.body}
      accessibilityLabel={t('Note text')}
    >
      <NoteRuns lines={editor.lines} place="editor" names={editor.names} />
    </TextInput>
  );
}
