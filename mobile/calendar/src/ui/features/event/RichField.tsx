/**
 * The description's field: rich text (`core/services/richText`) typed in a plain text field, each
 * mention spelled as its name and taken whole (`core/services/richDisplay`), each edit mapped back
 * onto the runs. « @ » where a word starts offers what it may mention as the word after it grows
 * (`MentionSuggestions`): docked on the keyboard by the screen (`onSuggestions`), else right under
 * the field; a tap puts it in place of « @word ». « Mentionner » (`startMention`) types the « @ ».
 */
import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import type { TextInput } from 'react-native';

import type { Ref } from '@unlease/core/refs';
import { closesAfter, displayMentionQuery, placeMention } from '@unlease/core/services/mentionSearch';
import { applyDisplayEdit, displayEdit, displayToModel, modelToDisplay, richDisplay } from '@unlease/core/services/richDisplay';
import { insertRich, parseRich, richToPlain, serializeRich, sliceRich, type Run } from '@unlease/core/services/richText';
import { t } from '@unlease/core/i18n';
import { nameOf } from '@app/mentionNames';
import { useLibraryStore } from '@app/store/libraryStore';

import { AppText, MentionSuggestions, TextField, type SuggestionRow } from '@shared/ui/components';
import { mentionCandidates, mentionSections } from './mentionCandidates';

export interface RichFieldHandle {
  /** A mention where the caret is (at the end when the field never had one). */
  insertMention(target: Ref): void;
  /** « @ » typed where the caret is (a space before it when it would stick to a word), the field focused: the suggestions open. */
  startMention(): void;
}

export interface RichFieldProps {
  readonly value: string;
  readonly onChange: (markup: string) => void;
  readonly label: string;
  readonly placeholder?: string;
  /** The event being edited: it is not offered to itself. */
  readonly except?: string | null;
  /** Where the suggestions go: the screen docks them on the keyboard; without it they show under the field. */
  readonly onSuggestions?: (panel: React.ReactNode | null) => void;
}

export const RichField = forwardRef<RichFieldHandle, RichFieldProps>(function RichFieldView({ value, onChange, label, placeholder, except = null, onSuggestions }, ref) {
  const runs = useMemo(() => parseRich(value), [value]);
  /** The caret while the field holds it and nothing is selected, as shown; else null. */
  const [caret, setCaret] = useState<number | null>(null);
  // A mention named before its record arrived (a link Carnet just saved, « Indisponible ici ») takes
  // its name once the sync brings it; never under the caret, where it would move what is typed.
  const revision = useLibraryStore(state => state.revision);
  const [named, setNamed] = useState(revision);
  if (named !== revision && caret === null) setNamed(revision);
  // `named` is when the names were last read: the names themselves come from the store as it is now.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const display = useMemo(() => richDisplay(runs, target => nameOf(useLibraryStore.getState(), target) ?? t('Not available here')), [runs, named]);
  const input = useRef<React.ComponentRef<typeof TextInput>>(null);
  const selection = useRef({ start: display.text.length, end: display.text.length });
  /** Where the caret goes once the field shows the latest words. */
  const pending = useRef<number | null>(null);

  useEffect(() => {
    const at = pending.current;
    if (at === null) return;
    pending.current = null;
    selection.current = { start: at, end: at };
    setCaret(at);
    input.current?.focus();
    // Once the field has taken its new words.
    requestAnimationFrame(() => input.current?.setSelection?.(at, at));
  }, [display]);

  const write = (next: readonly Run[], modelCaret: number): void => {
    const shown = richDisplay(next, target => nameOf(useLibraryStore.getState(), target) ?? t('Not available here'));
    pending.current = modelToDisplay(shown, modelCaret);
    onChange(serializeRich(next));
  };

  useImperativeHandle(ref, () => ({
    insertMention(target: Ref) {
      const at = displayToModel(display, selection.current.end, 'end');
      write(insertRich(runs, at, [{ kind: 'mention', target }, { kind: 'text', text: ' ', marks: {} }]), at + 2);
    },
    startMention() {
      const at = displayToModel(display, selection.current.end, 'end');
      const before = at > 0 ? richToPlain(sliceRich(runs, at - 1, at)) : '';
      const typed = before === '' || /\s/.test(before) ? '@' : ' @';
      write(insertRich(runs, at, [{ kind: 'text', text: typed, marks: {} }]), at + typed.length);
    },
  }));

  const query = caret === null ? null : displayMentionQuery(display, caret);
  const asking = query !== null;
  const people = useLibraryStore(s => s.people);
  const carnet = useLibraryStore(s => s.carnet);
  const blocks = useLibraryStore(s => s.blocks);
  const events = useLibraryStore(s => s.events);
  // Worked out once « @ » is typed, again only when the records change.
  const sections = useMemo(() => (asking ? mentionSections(useLibraryStore.getState(), except, Date.now()) : []), [asking, except, people, carnet, blocks, events]); // eslint-disable-line react-hooks/exhaustive-deps
  const word = query?.query ?? null;
  const start = query?.start ?? null;
  const rows = useMemo<SuggestionRow[]>(() => {
    if (word === null || start === null) return [];
    return mentionCandidates(sections, word).map(candidate => ({
      key: `${candidate.target.type}:${candidate.target.id}`,
      title: candidate.title,
      detail: candidate.detail(),
      icon: candidate.icon,
      ...(candidate.emoji ? { mark: <AppText style={EMOJI}>{candidate.emoji}</AppText> } : {}),
      onPress: () => {
        const placed = placeMention(runs, start, start + 1 + word.length, { kind: 'mention', target: candidate.target });
        write(placed.runs, placed.caret);
      },
    }));
    // `write` reads the latest runs through `runs`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections, word, start, runs]);
  const open = word !== null && !closesAfter(word, rows.length);
  const panel = useMemo(
    () => (open ? <MentionSuggestions rows={rows} label={t('Mention')} empty={word.trim() ? t('Nothing is called “{query}”.', { query: word.trim() }) : t('Nothing to mention yet.')} docked={!!onSuggestions} /> : null),
    [open, rows, word, onSuggestions],
  );
  useEffect(() => {
    onSuggestions?.(panel);
  }, [panel, onSuggestions]);
  // Gone with the field.
  useEffect(() => () => onSuggestions?.(null), [onSuggestions]);

  const read = (next: { start: number; end: number }): void => {
    selection.current = next;
    setCaret(next.start === next.end ? next.start : null);
  };

  return (
    <>
      <TextField
        ref={input}
        value={display.text}
        multiline
        accessibilityLabel={label}
        placeholder={placeholder}
        onSelectionChange={event => read(event.nativeEvent.selection)}
        onFocus={() => read(selection.current)}
        onBlur={() => setCaret(null)}
        onChangeText={after => {
          const edit = displayEdit(display.text, after, selection.current);
          const { runs: next, caret: modelCaret } = applyDisplayEdit(runs, display, edit);
          const shown = richDisplay(next, target => nameOf(useLibraryStore.getState(), target) ?? t('Not available here'));
          const at = modelToDisplay(shown, modelCaret);
          // Read at once: the selection's own event may come after the next keystroke.
          read({ start: at, end: at });
          // The field shows what was typed; when the runs read otherwise (a mention taken whole), the caret is put back.
          if (shown.text !== after) pending.current = at;
          onChange(serializeRich(next));
        }}
      />
      {onSuggestions ? null : panel}
    </>
  );
});

const EMOJI = { fontSize: 20, lineHeight: 26 } as const;
