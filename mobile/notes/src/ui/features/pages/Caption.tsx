/**
 * One quiet line under a code block, a table, a media, a bookmark or an embed, typed in place. It
 * shows once written, or while it has the caret (« Ajouter une légende » in the block's actions
 * puts it there), and hides again when left empty.
 */
import React, { memo, useEffect, useRef, useState } from 'react';
import { StyleSheet, TextInput } from 'react-native';
import { create } from 'zustand';

import { t } from '@unlease/core/i18n';
import { TEXT_LIMITS } from '@unlease/notes/sync/types';
import type { Block } from '@unlease/notes/models/blocks';
import { saveBlockText } from '@app/store/pages';

import { useTheme } from '../../theme/ThemeProvider';
import { fontFamily } from '../../theme/typography';
import { usePageContext } from './PageContext';

const useCaptionStore = create<{ readonly opened: string | null }>(() => ({ opened: null }));

/** « Ajouter une légende »: the block's caption line shows, with the caret in it. */
export function openCaption(id: string): void {
  useCaptionStore.setState({ opened: id });
}

function CaptionComponent({ block }: { block: Block }) {
  const theme = useTheme();
  const { page, readOnly } = usePageContext();
  const opened = useCaptionStore(s => s.opened === block.id);
  const [draft, setDraft] = useState(block.caption);
  const [focused, setFocused] = useState(false);
  const saved = useRef(block.caption);
  const input = useRef<React.ComponentRef<typeof TextInput>>(null);

  useEffect(() => {
    if (focused || block.caption === saved.current) return;
    saved.current = block.caption;
    setDraft(block.caption);
  }, [block.caption, focused]);

  // The line stays shown until it has the caret: cleared at once, it would unmount before its focus.
  useEffect(() => {
    if (!opened) return;
    requestAnimationFrame(() => input.current?.focus());
  }, [opened]);

  const save = (text: string): void => {
    saved.current = saveBlockText(page, block.id, saved.current, text.replace(/\n/g, ' '), {}, 'caption');
  };

  if (!draft && !focused && !opened) return null;
  return (
    <TextInput
      ref={input}
      value={draft}
      editable={!readOnly}
      onChangeText={text => {
        setDraft(text);
        save(text);
      }}
      onFocus={() => {
        setFocused(true);
        if (useCaptionStore.getState().opened === block.id) useCaptionStore.setState({ opened: null });
      }}
      onBlur={() => setFocused(false)}
      placeholder={t('Ajouter une légende')}
      placeholderTextColor={theme.color.inkFaint}
      selectionColor={theme.color.highlight}
      selectionHandleColor={theme.color.focus}
      cursorColor={theme.color.focus}
      multiline
      submitBehavior="blurAndSubmit"
      maxLength={TEXT_LIMITS.block.caption}
      style={[styles.caption, { fontFamily: fontFamily(theme, 'Regular'), color: theme.color.inkMuted }]}
      accessibilityLabel={t('Légende')}
    />
  );
}

const styles = StyleSheet.create({
  caption: { fontSize: 14, lineHeight: 20, marginTop: 6, padding: 0, paddingHorizontal: 2, includeFontPadding: false },
});

export const Caption = memo(CaptionComponent);
