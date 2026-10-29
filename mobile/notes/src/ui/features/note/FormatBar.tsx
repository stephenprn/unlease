/**
 * The note editor's bar while words are selected in a text note: their marks (bold, italic,
 * underline), their lines' heading (a level pressed again turns its lines back into text) and a
 * way to take it all off. Each shows its state for the selection; on the note's own colour a chosen
 * one wears the ink veil. A press keeps the selection, and the keyboard, in the text.
 */
import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import type { GlyphName } from '@unlease/design/glyphs';
import { t, tx } from '@unlease/core/i18n';
import { clearFormat, headingIn, noteRangeHas, setHeading, setNoteFlag, type HeadingLevel, type NoteLine } from '@unlease/notes/services/noteBody';
import type { FlagMark } from '@unlease/core/services/richText';

import { IconButton } from '../../components';
import type { NoteBodyEditor, TextRange } from './useNoteBody';

const FLAGS: readonly { readonly flag: FlagMark; readonly icon: GlyphName; readonly label: string }[] = [
  { flag: 'b', icon: 'bold', label: tx('Gras') },
  { flag: 'i', icon: 'italic', label: tx('Italique') },
  { flag: 'u', icon: 'underline', label: tx('Souligné') },
];

const HEADINGS: readonly { readonly level: Exclude<HeadingLevel, 0>; readonly icon: GlyphName; readonly label: string }[] = [
  { level: 1, icon: 'heading1', label: tx('Titre 1') },
  { level: 2, icon: 'heading2', label: tx('Titre 2') },
  { level: 3, icon: 'heading3', label: tx('Titre 3') },
];

export interface FormatBarProps {
  readonly lines: readonly NoteLine[];
  readonly range: TextRange;
  readonly onFormat: NoteBodyEditor['format'];
}

export function FormatBar({ lines, range, onFormat }: FormatBarProps) {
  const heading = headingIn(lines, range.start, range.end);
  return (
    <ScrollView horizontal keyboardShouldPersistTaps="always" showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {FLAGS.map(({ flag, icon, label }, index) => (
        <IconButton
          key={flag}
          icon={icon}
          label={t(label)}
          shape={index % 3}
          tone="ink"
          selected={noteRangeHas(lines, range.start, range.end, flag)}
          onPress={() => onFormat((current, at) => setNoteFlag(current, at.start, at.end, flag, !noteRangeHas(current, at.start, at.end, flag)))}
        />
      ))}
      <View style={styles.gap} />
      {HEADINGS.map(({ level, icon, label }, index) => (
        <IconButton
          key={level}
          icon={icon}
          label={t(label)}
          shape={index % 3}
          tone="ink"
          selected={heading === level}
          onPress={() => onFormat((current, at) => setHeading(current, at.start, at.end, headingIn(current, at.start, at.end) === level ? 0 : level))}
        />
      ))}
      <View style={styles.gap} />
      <IconButton icon="eraser" label={t('Effacer la mise en forme')} shape={0} onPress={() => onFormat((current, at) => clearFormat(current, at.start, at.end))} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // Centred while it fits (seven targets and the gaps fill a 360 wide phone); narrower, it scrolls rather than shrinking a target.
  row: { flexGrow: 1, alignItems: 'center', justifyContent: 'center' },
  // Marks, headings, and the way back to plain words, as three groups.
  gap: { width: 8 },
});
