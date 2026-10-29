/**
 * A field whose text changes under the caret (an edit from another device landing while it is
 * focused): the caret stays where it was, moved by what was inserted or removed before it,
 * instead of jumping to the end. The person's own typing is left to the browser.
 */
import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

import { mapCaret } from '@unlease/core/sync/textMerge';

interface Seen {
  value: string;
  start: number;
  end: number;
}

export function useKeptCaret(ref: RefObject<HTMLTextAreaElement | null>, value: string): void {
  const seen = useRef<Seen>({ value, start: 0, end: 0 });

  // What the person does (typing, moving the caret) is the new reference.
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const note = (): void => {
      seen.current = { value: element.value, start: element.selectionStart, end: element.selectionEnd };
    };
    const events = ['input', 'select', 'keyup', 'mouseup', 'focus'] as const;
    for (const event of events) element.addEventListener(event, note);
    return () => {
      for (const event of events) element.removeEventListener(event, note);
    };
  }, [ref]);

  useLayoutEffect(() => {
    const element = ref.current;
    const before = seen.current;
    if (element && document.activeElement === element && before.value !== value && element.value === value) {
      element.setSelectionRange(mapCaret(before.value, value, before.start), mapCaret(before.value, value, before.end));
    }
    if (element) seen.current = { value, start: element.selectionStart, end: element.selectionEnd };
  }, [ref, value]);
}
