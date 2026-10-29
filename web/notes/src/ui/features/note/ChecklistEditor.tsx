/**
 * The checklist editor, with Keep's keyboard habits: Enter starts the next
 * item (splitting at the caret), Backspace on an empty item removes it and
 * returns to the one above (at the start of a full one, merges it up), a paste
 * of several lines becomes several items, and the arrows walk between items.
 * Checked items drop to a collapsible section at the foot, struck through,
 * still there.
 *
 * Reordering: drag an item by its grip (a line shows where it will land), or
 * Alt+↑ / Alt+↓ from the keyboard. A move writes one new position for that one
 * item, never a renumbering.
 *
 * Items glide to their new place when one is ticked, added, removed or dropped,
 * and fade as they arrive or leave, as on the phone (`useListMotion`).
 */
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { flushSync } from 'react-dom';
import { useShallow } from 'zustand/react/shallow';

import { t } from '@unlease/core/i18n';
import { plural } from '@unlease/core/services/format';
import { TEXT_LIMITS } from '@unlease/notes/sync/types';

import { addCheck, deleteCheck, moveCheck, saveTypedText, toggleCheck } from '../../../app/store/actions';
import { mergeIntoPrevious, pasteLines, splitCheck, splitPastedLines } from '../../../app/store/editing';
import { useLibraryStore } from '../../../app/store/library';
import { showUndo } from '../../../app/store/ui';
import { onBeforePause } from '../../../app/sync/loop';
import { Checkbox } from '../../components/Checkbox';
import { Icon } from '../../components/Icon';
import { IconButton } from '../../components/IconButton';
import styles from './editor.module.css';
import { useAutoGrow } from './useAutoGrow';
import { useKeptCaret } from './useKeptCaret';
import { useListMotion } from './useListMotion';

interface Focus {
  readonly id: string;
  /** Caret offset, or 'end'. */
  readonly caret: number | 'end';
}

interface Slot {
  readonly id: string;
  readonly top: number;
  readonly bottom: number;
}

interface Drag {
  readonly id: string;
  readonly startY: number;
  readonly pointerId: number;
  /** The other open rows, in order, measured at drag start (relative to the list). */
  readonly slots: readonly Slot[];
  readonly rowTop: number;
  readonly rowHeight: number;
}

/** Where a drag would drop: the index among the other rows, and the line's offset. */
interface Drop {
  readonly index: number;
  readonly top: number;
}

/** What a row hands its parent with a key: commit the typed text now, or drop it (a batch writes it). */
export interface RowDraft {
  readonly commit: () => void;
  readonly discard: () => void;
}

function dropAt(slots: readonly Slot[], center: number): Drop {
  const index = slots.filter(slot => (slot.top + slot.bottom) / 2 < center).length;
  const after = slots[index];
  const before = slots[index - 1];
  return { index, top: after ? after.top : before ? before.bottom : 0 };
}

export interface ChecklistEditorProps {
  readonly noteId: string;
  readonly editable: boolean;
  readonly autoFocusFirst?: boolean;
}

function ChecklistEditorComponent({ noteId, editable, autoFocusFirst = false }: ChecklistEditorProps) {
  const { open, done } = useLibraryStore(
    useShallow(s => {
      const ids = s.checksByNote[noteId] ?? [];
      const openIds: string[] = [];
      const doneIds: string[] = [];
      for (const id of ids) {
        const item = s.checks[id];
        if (!item) continue;
        (item.checked ? doneIds : openIds).push(id);
      }
      return { open: openIds.join(','), done: doneIds.join(',') };
    }),
  );
  const openIds = useMemo(() => (open ? open.split(',') : []), [open]);
  const doneIds = useMemo(() => (done ? done.split(',') : []), [done]);
  const [showDone, setShowDone] = useState(true);
  const inputs = useRef(new Map<string, HTMLTextAreaElement>());
  const rows = useRef(new Map<string, HTMLLIElement>());
  const list = useRef<HTMLUListElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const settle = useListMotion(root);
  const pendingFocus = useRef<Focus | null>(autoFocusFirst && openIds[0] ? { id: openIds[0], caret: 'end' } : null);
  const drag = useRef<Drag | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [drop, setDrop] = useState<Drop | null>(null);

  // Focus an item that was just created or merged into, once its field exists.
  useLayoutEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    const input = inputs.current.get(target.id);
    if (!input) return;
    pendingFocus.current = null;
    input.focus({ preventScroll: false });
    const caret = target.caret === 'end' ? input.value.length : Math.min(target.caret, input.value.length);
    input.setSelectionRange(caret, caret);
  });

  const focusItem = useCallback((id: string, caret: number | 'end') => {
    pendingFocus.current = { id, caret };
    const input = inputs.current.get(id);
    if (input) {
      pendingFocus.current = null;
      input.focus();
      const at = caret === 'end' ? input.value.length : Math.min(caret, input.value.length);
      input.setSelectionRange(at, at);
    }
  }, []);

  const register = useCallback((id: string, element: HTMLTextAreaElement | null) => {
    if (element) inputs.current.set(id, element);
    else inputs.current.delete(id);
  }, []);

  const registerRow = useCallback((id: string, element: HTMLLIElement | null) => {
    if (element) rows.current.set(id, element);
    else rows.current.delete(id);
  }, []);

  const onKey = useCallback(
    (id: string, event: KeyboardEvent<HTMLTextAreaElement>, draft: RowDraft) => {
      const input = event.currentTarget;
      const index = openIds.indexOf(id);
      const { selectionStart: start, selectionEnd: end, value } = input;
      if (event.key === 'Enter' && !event.nativeEvent.isComposing && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        draft.discard();
        const next = splitCheck(id, value, start);
        if (next) pendingFocus.current = { id: next, caret: 0 };
        return;
      }
      if (event.key === 'Backspace' && start === 0 && end === 0) {
        const previous = index > 0 ? openIds[index - 1] : undefined;
        if (value === '') {
          event.preventDefault();
          draft.discard();
          deleteCheck(id);
          if (previous) focusItem(previous, 'end');
          else if (openIds[index + 1]) focusItem(openIds[index + 1]!, 0);
        } else if (previous) {
          event.preventDefault();
          draft.discard();
          const caret = mergeIntoPrevious(previous, id, value);
          pendingFocus.current = { id: previous, caret };
        }
        return;
      }
      if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
        event.preventDefault();
        draft.commit();
        if (event.key === 'ArrowUp' && index > 0) {
          moveCheck(id, openIds[index - 2] ?? null, openIds[index - 1] ?? null);
          pendingFocus.current = { id, caret: start };
        } else if (event.key === 'ArrowDown' && index < openIds.length - 1) {
          moveCheck(id, openIds[index + 1] ?? null, openIds[index + 2] ?? null);
          pendingFocus.current = { id, caret: start };
        }
        return;
      }
      // The arrows leave an item at its first or last line, as in a single text.
      if (event.key === 'ArrowUp' && index > 0 && !value.slice(0, start).includes('\n') && start === end && isFirstVisualLine(input)) {
        event.preventDefault();
        focusItem(openIds[index - 1]!, Math.min(start, inputs.current.get(openIds[index - 1]!)?.value.length ?? 0));
        return;
      }
      if (event.key === 'ArrowDown' && index < openIds.length - 1 && !value.slice(end).includes('\n') && start === end && isLastVisualLine(input)) {
        event.preventDefault();
        focusItem(openIds[index + 1]!, start);
      }
    },
    [openIds, focusItem],
  );

  const onPaste = useCallback((id: string, event: ClipboardEvent<HTMLTextAreaElement>, draft: RowDraft) => {
    const text = event.clipboardData.getData('text/plain');
    if (!text.includes('\n')) return;
    const lines = splitPastedLines(text);
    event.preventDefault();
    draft.discard();
    const input = event.currentTarget;
    const added = pasteLines(id, input.value, input.selectionStart, input.selectionEnd, lines);
    const last = added[added.length - 1];
    pendingFocus.current = last ? { id: last, caret: lines[lines.length - 1]!.length } : { id, caret: 'end' };
  }, []);

  const onDelete = useCallback((id: string) => {
    const index = openIds.indexOf(id);
    const undo = deleteCheck(id);
    showUndo(t('Élément supprimé'), undo);
    const neighbour = openIds[index - 1] ?? openIds[index + 1];
    if (neighbour) focusItem(neighbour, 'end');
  }, [openIds, focusItem]);

  // ── dragging by the grip ──────────────────────────────────────────────
  const onGripDown = useCallback(
    (id: string, event: ReactPointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0) return;
      const row = rows.current.get(id);
      if (!row) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      const origin = list.current?.getBoundingClientRect().top ?? 0;
      const rect = row.getBoundingClientRect();
      const slots = openIds
        .filter(other => other !== id)
        .map(other => {
          const box = rows.current.get(other)?.getBoundingClientRect();
          return { id: other, top: (box?.top ?? 0) - origin, bottom: (box?.bottom ?? 0) - origin };
        });
      drag.current = { id, startY: event.clientY, pointerId: event.pointerId, rowTop: rect.top - origin, rowHeight: rect.height, slots };
      setDragging(id);
      setDrop(dropAt(slots, rect.top - origin + rect.height / 2));
    },
    [openIds],
  );

  const onGripMove = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const dy = event.clientY - current.startY;
    const row = rows.current.get(current.id);
    if (row) row.style.transform = `translateY(${dy}px)`;
    setDrop(dropAt(current.slots, current.rowTop + current.rowHeight / 2 + dy));
  }, []);

  const onGripUp = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      const current = drag.current;
      if (!current || current.pointerId !== event.pointerId) return;
      drag.current = null;
      const row = rows.current.get(current.id);
      // Let go, it settles from where the hand left it: into its new place, or back into its own.
      if (row) settle(row);
      const others = current.slots.map(slot => slot.id);
      const target = dropAt(current.slots, current.rowTop + current.rowHeight / 2 + (event.clientY - current.startY)).index;
      setDragging(null);
      setDrop(null);
      if (target === openIds.indexOf(current.id)) return;
      moveCheck(current.id, others[target - 1] ?? null, others[target] ?? null);
    },
    [openIds, settle],
  );

  return (
    <div ref={root} className={styles.checklist}>
      <ul ref={list} className={styles.checkList} aria-label={t('Éléments à faire')}>
        {openIds.map(id => (
          <CheckRow
            key={id}
            id={id}
            editable={editable}
            dragging={dragging === id}
            register={register}
            registerRow={registerRow}
            onKey={onKey}
            onPaste={onPaste}
            onDelete={onDelete}
            onGripDown={onGripDown}
            onGripMove={onGripMove}
            onGripUp={onGripUp}
          />
        ))}
        {drop && dragging ? <li className={styles.dropLine} style={{ top: drop.top - 1 }} aria-hidden="true" /> : null}
      </ul>
      {editable ? (
        <button
          type="button"
          className={styles.addItem}
          data-motion="add"
          onClick={() => {
            const id = addCheck(noteId, '', openIds[openIds.length - 1] ?? null);
            pendingFocus.current = { id, caret: 0 };
          }}
        >
          <Icon name="plus" size={20} />
          {t('Élément de liste')}
        </button>
      ) : null}
      {doneIds.length > 0 ? (
        <div className={styles.doneSection} data-motion="done" data-motion-late>
          <button type="button" className={styles.doneToggle} aria-expanded={showDone} onClick={() => setShowDone(value => !value)}>
            <Icon name={showDone ? 'chevronDown' : 'chevronRight'} size={20} />
            {plural(doneIds.length, 'élément coché', 'éléments cochés')}
          </button>
          {showDone ? (
            <ul className={styles.doneList} aria-label={t('Éléments cochés')}>
              {doneIds.map(id => (
                <DoneRow key={id} id={id} editable={editable} />
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function lineHeightOf(input: HTMLTextAreaElement): number {
  return parseFloat(getComputedStyle(input).lineHeight) || 26;
}

function isFirstVisualLine(input: HTMLTextAreaElement): boolean {
  return input.selectionStart === 0 || input.scrollHeight <= lineHeightOf(input) * 1.5 + 24;
}

function isLastVisualLine(input: HTMLTextAreaElement): boolean {
  return input.selectionEnd === input.value.length || input.scrollHeight <= lineHeightOf(input) * 1.5 + 24;
}

interface CheckRowProps {
  readonly id: string;
  readonly editable: boolean;
  readonly dragging: boolean;
  readonly register: (id: string, element: HTMLTextAreaElement | null) => void;
  readonly registerRow: (id: string, element: HTMLLIElement | null) => void;
  readonly onKey: (id: string, event: KeyboardEvent<HTMLTextAreaElement>, draft: RowDraft) => void;
  readonly onPaste: (id: string, event: ClipboardEvent<HTMLTextAreaElement>, draft: RowDraft) => void;
  readonly onDelete: (id: string) => void;
  readonly onGripDown: (id: string, event: ReactPointerEvent<HTMLButtonElement>) => void;
  readonly onGripMove: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  readonly onGripUp: (event: ReactPointerEvent<HTMLButtonElement>) => void;
}

const SAVE_DELAY_MS = 300;

const CheckRow = memo(function CheckRow({ id, editable, dragging, register, registerRow, onKey, onPaste, onDelete, onGripDown, onGripMove, onGripUp }: CheckRowProps) {
  const item = useLibraryStore(s => s.checks[id]);
  // What is typed and not yet saved; null shows the stored text (and edits from other devices).
  const [draft, setDraft] = useState<string | null>(null);
  // The tick is drawn before the item leaves for the ticked group, so it fades out ticked (the phone's order).
  const [ticked, setTicked] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const field = useRef<HTMLTextAreaElement | null>(null);
  /** What the line held when the draft began: the base for merging an edit from another device. */
  const from = useRef<string | null>(null);
  const value = draft ?? item?.text ?? '';
  useAutoGrow(field, value);
  useKeptCaret(field, value);

  const save = useCallback(
    (text: string) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      saveTypedText('check', id, 'text', from.current, text);
      from.current = null;
      setDraft(null);
    },
    [id],
  );
  // Leaving the tab: a line being typed is saved before the last push.
  useEffect(
    () =>
      onBeforePause(() => {
        if (from.current !== null && field.current) save(field.current.value.replace(/\r?\n/g, ' '));
      }),
    [save],
  );

  const setRef = useCallback(
    (element: HTMLTextAreaElement | null) => {
      field.current = element;
      register(id, element);
    },
    [id, register],
  );
  const setRowRef = useCallback((element: HTMLLIElement | null) => registerRow(id, element), [id, registerRow]);
  const rowDraft: RowDraft = {
    commit: () => {
      if (field.current && draft !== null) save(field.current.value);
    },
    discard: () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      from.current = null;
      setDraft(null);
    },
  };

  if (!item) return null;
  return (
    <li ref={setRowRef} className={styles.checkItem} data-motion={`open:${id}`} data-dragging={dragging || undefined} style={{ paddingLeft: item.indent ? 28 : 0 }}>
      {editable ? (
        <button
          type="button"
          className={styles.grip}
          aria-label={t('Glisser pour déplacer (ou Alt + flèches)')}
          tabIndex={-1}
          onPointerDown={event => onGripDown(id, event)}
          onPointerMove={onGripMove}
          onPointerUp={onGripUp}
          onPointerCancel={onGripUp}
        >
          <Icon name="grip" size={18} />
        </button>
      ) : (
        <span className={styles.gripSpace} />
      )}
      <Checkbox
        checked={ticked}
        onToggle={() => {
          if (draft !== null) save(draft);
          flushSync(() => setTicked(true));
          toggleCheck(id);
        }}
        label={t('Cocher « {item} »', { item: value || t('élément vide') })}
        disabled={!editable}
      />
      <textarea
        ref={setRef}
        className={`${styles.checkInput} t-editor-body`}
        value={value}
        rows={1}
        readOnly={!editable}
        placeholder={t('Élément')}
        maxLength={TEXT_LIMITS.check.text}
        aria-label={t('Texte de l’élément')}
        onChange={event => {
          const text = event.target.value.replace(/\r?\n/g, ' ');
          // The ref, not the rendered draft: a keystroke can come before the render that follows a save.
          if (from.current === null) from.current = useLibraryStore.getState().checks[id]?.text ?? '';
          setDraft(text);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => save(text), SAVE_DELAY_MS);
        }}
        onBlur={event => {
          if (draft !== null) save(event.target.value);
        }}
        onKeyDown={event => onKey(id, event, rowDraft)}
        onPaste={event => onPaste(id, event, rowDraft)}
      />
      {editable ? <IconButton icon="close" label={t('Supprimer l’élément')} compact size={18} className={styles.removeItem} onClick={() => onDelete(id)} /> : null}
    </li>
  );
});

const DoneRow = memo(function DoneRow({ id, editable }: { id: string; editable: boolean }) {
  const item = useLibraryStore(s => s.checks[id]);
  // Unticked, it leaves for the open list unticked.
  const [unticked, setUnticked] = useState(false);
  if (!item) return null;
  return (
    <li className={styles.checkItem} data-motion={`done:${id}`} data-motion-late data-done>
      <span className={styles.gripSpace} />
      <Checkbox
        checked={!unticked}
        onToggle={() => {
          flushSync(() => setUnticked(true));
          toggleCheck(id);
        }}
        label={t('Décocher « {item} »', { item: item.text || t('élément vide') })}
        disabled={!editable}
      />
      <span className={`${styles.doneText} t-editor-body`}>{item.text}</span>
      {editable ? (
        <IconButton
          icon="close"
          label={t('Supprimer l’élément')}
          compact
          size={18}
          className={styles.removeItem}
          onClick={() => showUndo(t('Élément supprimé'), deleteCheck(id))}
        />
      ) : null}
    </li>
  );
});

export const ChecklistEditor = memo(ChecklistEditorComponent);
