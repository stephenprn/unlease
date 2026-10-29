/**
 * A code block on the phone: the source in the monospace on the well of a frame, typed in place
 * (Enter is a new line here, not a new block), its language at its head opening the language sheet.
 * The phone draws it in one ink; the web colours it by language.
 */
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { SHAPES } from '@unlease/design/shapes';
import { t } from '@unlease/core/i18n';
import { codeLanguage } from '@unlease/notes/services/code';
import { richFromPlain, richToPlain } from '@unlease/core/services/richText';
import { TEXT_LIMITS } from '@unlease/notes/sync/types';
import type { Block } from '@unlease/notes/models/blocks';
import { saveBlockText } from '@app/store/pages';

import { AppText, Icon, Organic, Tappable } from '../../components';
import { corners } from '../../theme/shape';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Theme } from '../../theme/theme';
import { registerHandle, setFocused, useEditorStore, type RichHandle } from './editorStore';
import { usePageContext } from './PageContext';
import { openPageSheet } from './sheetStore';

const SAVE_AFTER_MS = 350;

function CodeBlockComponent({ block }: { block: Block }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const { page, readOnly } = usePageContext();
  const [draft, setDraft] = useState(block.text);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const saved = useRef(block.text);
  const dirty = useRef(false);
  const [focused, setFocusedHere] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const input = useRef<React.ComponentRef<typeof TextInput>>(null);
  const selection = useRef({ start: 0, end: 0 });

  useEffect(() => {
    if (focused || block.text === saved.current) return;
    saved.current = block.text;
    setDraft(block.text);
  }, [block.text, focused]);

  const epoch = useEditorStore(s => s.epoch);
  useEffect(() => {
    if (epoch === 0) return;
    saved.current = block.text;
    setDraft(block.text);
    // Only the epoch says when: the text is read as it stands then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [epoch]);

  const save = useCallback(
    (text: string) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      dirty.current = false;
      if (text === saved.current) return;
      const stored = saveBlockText(page, block.id, saved.current, text);
      saved.current = stored;
      if (stored !== text) setDraft(stored);
    },
    [page, block.id],
  );
  const flush = useCallback(() => {
    if (dirty.current) save(draftRef.current);
  }, [save]);
  useEffect(() => () => flush(), [flush]);

  const handle = useMemo<RichHandle>(
    () => ({
      runs: () => richFromPlain(draftRef.current),
      selection: () => selection.current,
      flush,
      write: runs => {
        const text = richToPlain(runs);
        setDraft(text);
        save(text);
      },
    }),
    [flush, save],
  );
  useEffect(() => registerHandle(block.id, handle), [block.id, handle]);
  // A field gone takes the bar with it: its blur never comes.
  useEffect(
    () => () => {
      if (useEditorStore.getState().focused === block.id) setFocused(null);
    },
    [block.id],
  );

  const request = useEditorStore(s => (s.focusRequest?.id === block.id ? s.focusRequest : null));
  useEffect(() => {
    if (!request || readOnly) return;
    useEditorStore.setState({ focusRequest: null });
    const field = input.current;
    if (!field) return;
    const at = request.at === 'start' ? 0 : request.at === 'end' ? draftRef.current.length : Math.min(request.at, draftRef.current.length);
    field.focus();
    requestAnimationFrame(() => field.setSelection(at, at));
  }, [request, readOnly]);

  const language = codeLanguage(block.language);
  return (
    <Organic outline="frame" style={styles.frame}>
      <View style={styles.head}>
        <Tappable accessibilityLabel={t('Langage : {language}', { language: t(language.name) })} disabled={readOnly} ownDisabled onPress={() => openPageSheet({ kind: 'language', block: block.id })} style={styles.language}>
          <AppText variant="labelSmall" color={theme.color.inkMuted}>
            {t(language.name)}
          </AppText>
          <Icon name="chevronDown" size={14} color={theme.color.inkMuted} />
        </Tappable>
      </View>
      <TextInput
        ref={input}
        value={draft}
        editable={!readOnly}
        multiline
        scrollEnabled={false}
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        onChangeText={text => {
          setDraft(text);
          dirty.current = true;
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => save(draftRef.current), SAVE_AFTER_MS);
        }}
        onSelectionChange={event => {
          selection.current = event.nativeEvent.selection;
        }}
        onFocus={() => {
          setFocusedHere(true);
          setFocused(block.id, selection.current);
        }}
        onBlur={() => {
          flush();
          setFocusedHere(false);
          if (useEditorStore.getState().focused === block.id) setFocused(null);
        }}
        placeholder={t('Du code')}
        placeholderTextColor={theme.color.inkFaint}
        selectionColor={theme.color.highlight}
        selectionHandleColor={theme.color.focus}
        cursorColor={theme.color.focus}
        textAlignVertical="top"
        maxLength={TEXT_LIMITS.block.text}
        style={styles.code}
        accessibilityLabel={t('Code')}
      />
    </Organic>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    frame: { backgroundColor: theme.color.paperHigh, borderWidth: 1, borderColor: theme.color.hairline, paddingBottom: 12, overflow: 'hidden' },
    head: { flexDirection: 'row', paddingHorizontal: 6, paddingTop: 4 },
    language: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 36, paddingHorizontal: 8, ...corners(SHAPES.chip) },
    code: { fontFamily: 'monospace', fontSize: 14, lineHeight: 21, color: theme.color.ink, paddingHorizontal: 14, paddingVertical: 0, includeFontPadding: false },
  });

export const CodeBlock = memo(CodeBlockComponent);
