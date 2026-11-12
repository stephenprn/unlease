/**
 * The address the caret stands on in a note's editor, wherever it is typed: the title, a checklist's
 * item (a textarea: its value and its caret) or the body (a contenteditable of one block per line,
 * `noteDom`: the line's words and the caret's place in them). A text field cannot draw a link of its
 * own, so the editor shows the one under the caret in a row of its own (`CaretLink`), to open, and a
 * click with Ctrl (⌘ on a Mac) opens it at once, as in a document.
 */
import { useEffect, useState } from 'react';

import { lineLinkAt } from '@unlease/core/services/url';

/** The words of the field the caret is in (the line, in the body), and the caret's place in them; null outside a field of `root`. */
function caretIn(root: HTMLElement): { readonly text: string; readonly offset: number } | null {
  const active = document.activeElement;
  if ((active instanceof HTMLTextAreaElement || active instanceof HTMLInputElement) && root.contains(active)) {
    const { selectionStart, selectionEnd, value } = active;
    if (selectionStart === null || selectionStart !== selectionEnd) return null;
    return { text: value, offset: selectionStart };
  }
  const selection = document.getSelection();
  if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) return null;
  const node = selection.anchorNode;
  if (!node || !root.contains(node)) return null;
  const element = node instanceof Element ? node : node.parentElement;
  const editable = element?.closest<HTMLElement>('[contenteditable="true"]');
  if (!editable || !root.contains(editable)) return null;
  // The line is the editable's child that holds the caret (one block per line).
  let line: Node = node;
  while (line.parentNode && line.parentNode !== editable) line = line.parentNode;
  if (line.parentNode !== editable) return null;
  const range = document.createRange();
  range.setStart(line, 0);
  range.setEnd(node, selection.anchorOffset);
  return { text: line.textContent ?? '', offset: range.toString().length };
}

/** The address under the caret in `root`'s fields, as a browser may open it, else null. */
export function linkAtCaret(root: HTMLElement): string | null {
  const at = caretIn(root);
  return at ? lineLinkAt(at.text, at.offset) : null;
}

/**
 * Follows the caret in `root`'s fields: the address it stands on, or null. A click with Ctrl (⌘ on a
 * Mac) on an address opens it in a new tab, the caret left where the click put it.
 */
export function useCaretLink(element: HTMLElement | null): string | null {
  const [href, setHref] = useState<string | null>(null);
  useEffect(() => {
    if (!element) return;
    const follow = (): void => {
      const next = linkAtCaret(element);
      setHref(current => (current === next ? current : next));
    };
    const open = (event: MouseEvent): void => {
      if (!(event.ctrlKey || event.metaKey) || event.button !== 0) return;
      // The click has put the caret where it landed: the address there, if any.
      const found = linkAtCaret(element);
      if (!found) return;
      event.preventDefault();
      window.open(found, '_blank', 'noopener,noreferrer');
    };
    // Clicking elsewhere moves the document's selection too, so the row goes once the caret leaves the fields.
    document.addEventListener('selectionchange', follow);
    // A textarea's caret moved by the keys or a click is not told as a `selectionchange` in every browser.
    element.addEventListener('keyup', follow);
    element.addEventListener('mouseup', follow);
    element.addEventListener('click', open);
    return () => {
      document.removeEventListener('selectionchange', follow);
      element.removeEventListener('keyup', follow);
      element.removeEventListener('mouseup', follow);
      element.removeEventListener('click', open);
    };
  }, [element]);
  return element ? href : null;
}
