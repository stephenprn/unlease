/**
 * A text note's body, typed in place (`BodyEditor`): plain until a word is marked or a line made a
 * heading, then formatted for good (`saveNoteLines`). Selecting words brings up the formatting bar.
 * The note editor holds it, and so does a note embedded in a page.
 */
import { memo, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type Ref } from 'react';

import { cutNotice } from '@unlease/core/services/format';
import { linesText } from '@unlease/notes/services/noteBody';
import { TEXT_LIMITS } from '@unlease/notes/sync/types';

import { saveNoteLines } from '../../../app/store/actions';
import { useLibraryStore } from '../../../app/store/library';
import { showWarning } from '../../../app/store/ui';
import { onBeforePause } from '../../../app/sync/loop';
import { useMedia } from '../../useMedia';
import { BodyEditor, type SelectionState } from './bodyEditor';
import { FINGER, NoteFormatBar, selectionPlace, type BarPlace } from './NoteFormatBar';
import styles from './richBody.module.css';

export interface RichBodyHandle {
  /** Writes what is typed now. */
  readonly flush: () => void;
  /** Puts the caret at the text's start or end. */
  readonly focus: (at: 'start' | 'end') => void;
}

export interface RichBodyProps {
  readonly noteId: string;
  readonly editable: boolean;
  readonly className?: string;
  readonly placeholder: string;
  readonly label: string;
  readonly handle?: Ref<RichBodyHandle>;
  /** The editable itself (where a layer puts the focus first). */
  readonly inputRef?: Ref<HTMLDivElement>;
  /** A paste holding pictures is left to the sheet around it, which attaches them. */
  readonly takesPictures?: boolean;
  /** The words as they stand, after every change. */
  readonly onText?: (text: string) => void;
  /** The note is leaving (archived, binned, deleted for good): it stays drawn as it was. */
  readonly still?: boolean;
}

interface Bar {
  readonly state: SelectionState;
  readonly place: BarPlace | null;
}

function RichBodyComponent({ noteId, editable, className, placeholder, label, handle, inputRef, takesPictures = false, onText, still = false }: RichBodyProps) {
  const body = useLibraryStore(s => s.notes[noteId]?.body ?? '');
  const rich = useLibraryStore(s => s.notes[noteId]?.rich ?? false);
  const root = useRef<HTMLDivElement>(null);
  const editor = useRef<BodyEditor | null>(null);
  const [bar, setBar] = useState<Bar | null>(null);
  const finger = useMedia(FINGER);
  const textRef = useRef(onText);
  useLayoutEffect(() => {
    textRef.current = onText;
  });

  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    const made = new BodyEditor(element, {
      limit: TEXT_LIMITS.note.body,
      takesPictures,
      save: (since, lines) => {
        const stored = saveNoteLines(noteId, since, lines);
        return { body: stored, rich: useLibraryStore.getState().notes[noteId]?.rich ?? false };
      },
      changed: lines => {
        element.toggleAttribute('data-empty', lines.length === 1 && lines[0]!.heading === 0 && lines[0]!.runs.length === 0);
        textRef.current?.(linesText(lines));
      },
      selected: state => setBar(state ? { state, place: selectionPlace(element) } : null),
      cut: () => showWarning(cutNotice('Texte', TEXT_LIMITS.note.body)),
    });
    editor.current = made;
    return () => {
      made.destroy();
      editor.current = null;
    };
  }, [noteId, takesPictures]);

  // The stored text, drawn when it changes from elsewhere (never over what is being typed).
  useLayoutEffect(() => {
    if (!still) editor.current?.stored(body, rich);
  }, [noteId, body, rich, still]);

  useEffect(() => {
    editor.current?.setEditable(editable);
  }, [noteId, editable]);

  useImperativeHandle(handle, () => ({ flush: () => editor.current?.flush(), focus: at => editor.current?.focus(at) }), []);
  useImperativeHandle(inputRef, () => root.current!, []);

  // What is typed is saved before the tab hides.
  useEffect(() => onBeforePause(() => editor.current?.flush()), []);

  // The bar follows its words as the note scrolls; Escape puts it away (before it closes the note).
  const shown = bar !== null;
  useEffect(() => {
    if (!shown) return;
    const follow = (): void => {
      const element = root.current;
      if (element) setBar(current => (current ? { ...current, place: selectionPlace(element) } : current));
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.isComposing) return;
      event.preventDefault();
      event.stopPropagation();
      editor.current?.dismiss();
    };
    document.addEventListener('scroll', follow, true);
    window.addEventListener('resize', follow);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('scroll', follow, true);
      window.removeEventListener('resize', follow);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [shown]);

  return (
    <>
      <div
        ref={root}
        className={[styles.body, className ?? ''].join(' ')}
        contentEditable={editable}
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label={label}
        aria-readonly={!editable || undefined}
        aria-placeholder={placeholder}
        data-placeholder={placeholder}
        spellCheck
      />
      {bar && editable ? (
        <NoteFormatBar
          state={bar.state}
          place={bar.place}
          docked={finger}
          onFlag={flag => editor.current?.toggle(flag)}
          onHeading={level => editor.current?.heading(level)}
          onClear={() => editor.current?.clear()}
        />
      ) : null}
    </>
  );
}

export const RichBody = memo(RichBodyComponent);
