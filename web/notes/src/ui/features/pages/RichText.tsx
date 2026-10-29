/**
 * A block's text, typed in place. The browser types into a contenteditable; what it holds is read
 * back as rich text and saved as typed text (`saveBlockText`: merged with another device's edit,
 * one undo step per burst), 350 ms after the last key, on blur, when the tab hides and when the
 * block goes. The stored text is drawn again only when it changes from elsewhere, the caret kept
 * in its words. Keys that act on blocks (Enter, Backspace at the start, Tab, arrows at an edge)
 * and pastes go to the editor.
 */
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, type ClipboardEvent, type KeyboardEvent } from 'react';

import { markupToPlain, parseRich, serializeRich, type Run } from '@unlease/core/services/richText';
import { mapCaret } from '@unlease/core/sync/textMerge';

import { useLibraryStore } from '../../../app/store/library';
import type { Caret } from '../../../app/store/pageHistory';
import { saveBlockText, updateBlock } from '../../../app/store/pages';
import { onBeforePause } from '../../../app/sync/loop';
import { copyWords } from './clipboard';
import { applyPendingFocus, registerRich, type RichHandle } from './editorStore';
import { lookOf, mentionsKey } from './mentions';
import { isCanonical, readRich, renderRich, selectionOffsets, setSelectionOffsets } from './richDom';
import { useToday } from './today';

const SAVE_DELAY_MS = 350;

export interface RichTextProps {
  readonly page: string;
  readonly id: string;
  readonly markup: string;
  readonly placeholder: string;
  /** Shown only while the block has the caret (a paragraph's hint), not whenever it is empty (a heading's). */
  readonly hintOnFocus?: boolean;
  readonly className: string;
  readonly label: string;
  readonly readOnly?: boolean;
  readonly onKeyDown: (event: KeyboardEvent<HTMLDivElement>, handle: RichHandle) => void;
  readonly onTyped: (handle: RichHandle) => void;
  readonly onPaste: (event: ClipboardEvent<HTMLDivElement>, handle: RichHandle) => void;
}

const look = (target: Parameters<typeof lookOf>[1]) => lookOf(useLibraryStore.getState(), target);

/** A caret kept in its words while the text under it changes. */
const mapped = (before: string, after: string, offset: number): number => mapCaret(markupToPlain(before), markupToPlain(after), offset);

function RichTextComponent({ page, id, markup, placeholder, hintOnFocus, className, label, readOnly, onKeyDown, onTyped, onPaste }: RichTextProps) {
  const ref = useRef<HTMLDivElement>(null);
  /** The markup the editable shows. */
  const shown = useRef<string | null>(null);
  /** Typed and not saved: what it is, and what it was when the typing began. */
  const draft = useRef<{ value: string; since: string; caret: Caret | null } | null>(null);
  /** Where the caret was before the first key of a burst, for its undo. */
  const caretBefore = useRef<Caret | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const composing = useRef(false);
  /** The next letter typed at the caret leaves the mark it is at the end of (once). */
  const leaving = useRef(false);
  // A date reads « Demain » until midnight: the day is part of how the text looks.
  const today = useToday();
  const looks = useLibraryStore(s => mentionsKey(s, markup)) + (markup.includes('{@date=') ? today : '');
  const drawnLooks = useRef(looks);

  const caretNow = useCallback((): Caret | null => {
    const root = ref.current;
    const selection = root && document.activeElement === root ? selectionOffsets(root) : null;
    return selection ? { block: id, offset: selection.end } : null;
  }, [id]);

  const show = useCallback((value: string, caretFrom: string | null) => {
    const root = ref.current;
    if (!root) return;
    const selection = document.activeElement === root ? selectionOffsets(root) : null;
    renderRich(root, parseRich(value), look);
    if (selection && caretFrom !== null) setSelectionOffsets(root, mapped(caretFrom, value, selection.start), mapped(caretFrom, value, selection.end));
    else if (selection) setSelectionOffsets(root, selection.start, selection.end);
    shown.current = value;
  }, []);

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const current = draft.current;
    if (!current) return;
    draft.current = null;
    const stored = saveBlockText(page, id, current.since, current.value, { before: current.caret, after: caretNow() });
    // Merged with another device's edit: the merge shows, the caret kept in its words.
    if (stored !== current.value) show(stored, current.value);
    else shown.current = stored;
  }, [page, id, caretNow, show]);

  const read = useCallback((): Run[] => (ref.current ? readRich(ref.current) : parseRich(markup)), [markup]);

  const write = useCallback(
    (runs: readonly Run[], select: { readonly start: number; readonly end?: number } | null): void => {
      const root = ref.current;
      if (!root) return;
      flush();
      const before = caretNow();
      const value = serializeRich(runs);
      renderRich(root, runs, look);
      shown.current = value;
      if (select) {
        root.focus({ preventScroll: true });
        setSelectionOffsets(root, select.start, select.end ?? select.start);
      }
      updateBlock(page, id, { text: value }, { before, after: select ? { block: id, offset: select.end ?? select.start } : null });
    },
    [page, id, flush, caretNow],
  );

  // The handle the editor keeps: stable, always calling this render's functions.
  const api = useRef({ flush, read, write });
  useLayoutEffect(() => {
    api.current = { flush, read, write };
  });
  const handle = useMemo<RichHandle>(
    () => ({
      get element() {
        return ref.current!;
      },
      flush: () => api.current.flush(),
      runs: () => api.current.read(),
      write: (runs, select) => api.current.write(runs, select),
      leaveMark: () => {
        leaving.current = true;
      },
    }),
    [],
  );

  // The stored text, drawn when it changes from elsewhere (never over what is being typed).
  useLayoutEffect(() => {
    if (draft.current || composing.current) return;
    if (shown.current === markup && drawnLooks.current === looks) return;
    const from = shown.current;
    drawnLooks.current = looks;
    show(markup, from);
  }, [markup, looks, show]);

  useLayoutEffect(() => {
    const off = registerRich(id, handle);
    applyPendingFocus();
    return off;
  }, [id, handle]);

  const typed = (): void => {
    const root = ref.current;
    if (!root) return;
    const runs = readRich(root);
    // The browser left something of its own (a `<br>` in an emptied line, a styled span): drawn again, the caret kept.
    if (!isCanonical(root) || (runs.length === 0 && root.childNodes.length > 0)) {
      const selection = selectionOffsets(root);
      renderRich(root, runs, look);
      if (selection) setSelectionOffsets(root, selection.start, selection.end);
    }
    const value = serializeRich(runs);
    const before = shown.current ?? markup;
    shown.current = value;
    if (value !== before) {
      if (!draft.current) draft.current = { value, since: before, caret: caretBefore.current };
      else draft.current.value = value;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => api.current.flush(), SAVE_DELAY_MS);
    }
    onTyped(handle);
  };

  const typedRef = useRef(typed);
  useLayoutEffect(() => {
    typedRef.current = typed;
  });

  // Before the browser types: where the caret was, for the undo; and letters typed at the very end of a
  // link, of code or of keys (or of a mark a shortcut just closed) go after it, not into it.
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const onBeforeInput = (event: InputEvent): void => {
      if (!draft.current) caretBefore.current = caretNow();
      const once = leaving.current;
      leaving.current = false;
      if (event.inputType !== 'insertText' || !event.data || event.isComposing) return;
      const selection = window.getSelection();
      const node = selection?.isCollapsed ? selection.anchorNode : null;
      if (!(node instanceof Text) || selection!.anchorOffset !== node.data.length) return;
      const mark = node.parentElement;
      if (!mark || mark === root || mark.parentElement !== root || mark.nextSibling instanceof Text) return;
      if (!once && mark.tagName !== 'A' && mark.dataset.c === undefined && mark.dataset.k === undefined) return;
      event.preventDefault();
      const letters = document.createTextNode(event.data);
      mark.after(letters);
      selection!.setBaseAndExtent(letters, letters.data.length, letters, letters.data.length);
      typedRef.current();
    };
    root.addEventListener('beforeinput', onBeforeInput);
    return () => root.removeEventListener('beforeinput', onBeforeInput);
  }, [caretNow]);

  // Typed text is saved on the way out: the block going, or the tab hiding.
  useEffect(() => onBeforePause(() => api.current.flush()), []);
  useEffect(() => () => api.current.flush(), []);

  return (
    <div
      ref={ref}
      className={className}
      contentEditable={readOnly ? false : true}
      suppressContentEditableWarning
      role="textbox"
      aria-multiline="true"
      aria-label={label}
      aria-readonly={readOnly || undefined}
      data-placeholder={placeholder}
      data-hint-on-focus={hintOnFocus || undefined}
      data-rich-block={id}
      data-caret-block={id}
      spellCheck
      onInput={() => {
        if (!composing.current) typed();
      }}
      onCompositionStart={() => {
        composing.current = true;
      }}
      onCompositionEnd={() => {
        composing.current = false;
        typed();
      }}
      onBlur={flush}
      onKeyDown={event => {
        if (event.nativeEvent.isComposing || composing.current) return;
        onKeyDown(event, handle);
      }}
      onPaste={event => onPaste(event, handle)}
      onCopy={event => copyWords(event, handle, false)}
      onCut={event => {
        if (!readOnly) copyWords(event, handle, true);
      }}
    />
  );
}

export const RichText = memo(RichTextComponent);
