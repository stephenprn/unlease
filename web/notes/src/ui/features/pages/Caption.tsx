/**
 * A block's caption: one line of plain text under a code block, a table, a media, a bookmark or an
 * embed. It shows once written, or while it has the caret (« Ajouter une légende » in the block's
 * menu puts it there); left empty, it hides again. Saved as typed text, like a block's own. The caret
 * reaches it like any block's text: the arrows, Enter goes on in a new paragraph under the block,
 * Échap selects the block.
 */
import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';

import { t } from '@unlease/core/i18n';
import type { Block } from '@unlease/notes/models/blocks';
import { TEXT_LIMITS } from '@unlease/notes/sync/types';

import type { Caret } from '../../../app/store/pageHistory';
import { insertAfter, saveBlockText } from '../../../app/store/pages';
import { onBeforePause } from '../../../app/sync/loop';
import { useAutoGrow } from '../note/useAutoGrow';
import { historyKey } from './editing';
import { applyPendingFocus, captionCaret, editableOutline, editorRoot, focusBlock, holdCaption, neighbour, registerFlusher, registerFocuser, releaseCaption, selectBlocks, useEditorStore, type FocusAt } from './editorStore';
import { usePageContext } from './PageContext';
import styles from './pages.module.css';

const SAVE_DELAY_MS = 350;

/** What is pasted on several lines comes as one. */
const oneLine = (value: string): string => value.replace(/\s*\r?\n\s*/g, ' ');

function CaptionComponent({ block }: { block: Block }) {
  const { page, readOnly } = usePageContext();
  const open = useEditorStore(s => s.caption === block.id);
  const field = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState<string | null>(null);
  /** Typed and not saved: what it is, what it was when the typing began, where the caret was then. */
  const typed = useRef<{ value: string; since: string; before: Caret | null } | null>(null);
  const caretBefore = useRef<Caret | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const caret = captionCaret(block.id);
  const text = draft ?? block.caption;
  const shown = text !== '' || open;
  useAutoGrow(field, text);

  const flush = useCallback((): void => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const current = typed.current;
    if (!current) return;
    typed.current = null;
    saveBlockText(page, block.id, current.since, current.value, { before: current.before, after: { block: caret, offset: field.current?.selectionEnd ?? 'end' } }, 'caption');
    setDraft(null);
  }, [page, block.id, caret]);

  const flushRef = useRef(flush);
  useLayoutEffect(() => {
    flushRef.current = flush;
  });
  useEffect(() => onBeforePause(() => flushRef.current()), []);
  // An undo saves what was typed here first, as it does a paragraph's.
  useEffect(() => registerFlusher(() => flushRef.current()), []);
  useEffect(() => () => flushRef.current(), []);

  useLayoutEffect(() => {
    if (!shown) return;
    const off = registerFocuser(caret, (at: FocusAt) => {
      const node = field.current;
      if (!node) return;
      node.focus({ preventScroll: true });
      const end = node.value.length;
      const offset = typeof at === 'number' ? Math.min(at, end) : at === 'start' || (typeof at === 'object' && at.edge === 'top') ? 0 : end;
      node.setSelectionRange(offset, offset);
      node.scrollIntoView({ block: 'nearest' });
    });
    applyPendingFocus();
    return off;
  }, [caret, shown]);

  if (!shown) return null;

  const edit = (value: string): void => {
    if (typed.current) typed.current.value = value;
    else typed.current = { value, since: block.caption, before: caretBefore.current };
    setDraft(value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => flushRef.current(), SAVE_DELAY_MS);
  };

  /** The caret into the text before or after the caption, if there is some. */
  const leave = (step: -1 | 1): boolean => {
    const next = neighbour(editableOutline(), caret, step);
    if (!next) return false;
    flush();
    focusBlock(next, step === -1 ? 'end' : 'start');
    return true;
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    const node = event.currentTarget;
    if (readOnly) return;
    if (!typed.current) caretBefore.current = { block: caret, offset: node.selectionStart };
    if (historyKey(event, page) || event.nativeEvent.isComposing) return;
    const atStart = node.selectionStart === 0 && node.selectionEnd === 0;
    const atEnd = node.selectionStart === node.value.length && node.selectionEnd === node.value.length;
    switch (event.key) {
      case 'Enter': {
        event.preventDefault();
        flush();
        const id = insertAfter(page, block.id, { kind: 'text', text: '' });
        if (id) focusBlock(id, 'start');
        return;
      }
      case 'Escape':
        event.preventDefault();
        flush();
        selectBlocks([block.id]);
        editorRoot()?.focus({ preventScroll: true });
        return;
      case 'Backspace':
        // An empty caption goes back to its block: into a code block's text, or the block selected.
        if (node.value !== '') return;
        event.preventDefault();
        if (editableOutline().includes(block.id)) focusBlock(block.id, 'end');
        else {
          selectBlocks([block.id]);
          editorRoot()?.focus({ preventScroll: true });
        }
        return;
      case 'ArrowUp':
      case 'ArrowLeft':
        if ((event.key === 'ArrowUp' || atStart) && !event.shiftKey && leave(-1)) event.preventDefault();
        return;
      case 'ArrowDown':
      case 'ArrowRight':
        if ((event.key === 'ArrowDown' || atEnd) && !event.shiftKey && leave(1)) event.preventDefault();
        return;
    }
  };

  return (
    <textarea
      ref={field}
      className={styles.caption}
      value={text}
      rows={1}
      readOnly={readOnly}
      placeholder={t('Écrivez une légende…')}
      aria-label={t('Légende')}
      maxLength={TEXT_LIMITS.block.caption}
      spellCheck
      data-caret-block={caret}
      onChange={event => edit(oneLine(event.target.value))}
      onKeyDown={onKeyDown}
      onFocus={() => holdCaption(block.id)}
      onBlur={event => {
        flush();
        // Not when the window only lost the focus: the caret is still here.
        if (document.activeElement !== event.currentTarget) releaseCaption(block.id);
      }}
    />
  );
}

export const Caption = memo(CaptionComponent);
