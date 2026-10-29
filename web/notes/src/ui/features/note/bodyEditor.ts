/**
 * A text note's body as the editor types it: a contenteditable holding one block per line
 * (`noteDom`), its lines read back and saved as typed text, 350 ms after the last key, on blur and
 * when it goes (`host.save`, which merges an edit from elsewhere). The stored text is drawn again only
 * when it changes from elsewhere, never over what is being typed, the caret kept in its words.
 *
 * The browser types the letters of a line; the editor makes everything that changes lines (Enter,
 * Backspace at a line's start, Delete at its end, a selection typed or pasted over, a format), so
 * the browser's own undo would lose its way: the editor keeps its own steps (typing grouped until a
 * pause, a move of the caret or another kind of change). Markdown typed at the caret becomes what it
 * writes: `# `, `## `, `### ` at a line's start a heading, `**gras**` bold, `*italique*` italic.
 */
import { clearFormat, headingIn, headingShortcut, linesText, noteLines, noteMarksAt, noteRangeHas, serializeLines, setHeading, setNoteFlag, type HeadingLevel, type NoteLine } from '@unlease/notes/services/noteBody';
import type { Marks } from '@unlease/core/services/richText';
import { mapCaret } from '@unlease/core/sync/textMerge';

import { cutLines, deleteBackward, deleteForward, inlineMarkdown, insertText, linesLength, marksAtStart, replaceRange, splitLine, spotOf, textLines } from './lineEdits';
import { caretOnRoot, isCanonical, linesFromHtml, readLines, renderLines, selectionOffsets, setSelectionOffsets, type TextSelection } from './noteDom';

const SAVE_DELAY_MS = 350;
/** Typing goes on in one step of the undo until a pause this long. */
const STEP_PAUSE_MS = 1000;
const MAX_STEPS = 100;

export type NoteFlag = 'b' | 'i' | 'u';

/** What the formatting bar shows: the words selected, and what they wear. */
export interface SelectionState {
  readonly start: number;
  readonly end: number;
  readonly flags: Readonly<Record<NoteFlag, boolean>>;
  /** The heading every line of the selection is, or null when they differ. */
  readonly heading: HeadingLevel | null;
}

export interface BodyHost {
  /** Saves lines typed since `since` (the stored body when the typing began); returns what is stored now. */
  readonly save: (since: string | null, lines: readonly NoteLine[]) => { readonly body: string; readonly rich: boolean };
  /** The lines changed: typed, formatted, or arrived from elsewhere. */
  readonly changed: (lines: readonly NoteLine[]) => void;
  /** Words selected (the formatting bar), or none. */
  readonly selected: (state: SelectionState | null) => void;
  /** A paste was cut to what the note can hold. */
  readonly cut: () => void;
  /** The most the text may hold. */
  readonly limit: number;
  /** A paste holding pictures is left to the sheet around, which attaches them. */
  readonly takesPictures: boolean;
}

interface Step {
  readonly lines: NoteLine[];
  readonly start: number;
  readonly end: number;
}

const FORMATS: Readonly<Record<string, NoteFlag>> = { formatBold: 'b', formatItalic: 'i', formatUnderline: 'u' };
const MOVES = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown']);

const same = (a: readonly NoteLine[], b: readonly NoteLine[]): boolean => a === b || serializeLines(a) === serializeLines(b);

export class BodyEditor {
  /** The stored body the editable last matched. */
  private base: { body: string; rich: boolean } | null = null;
  /** The stored body as last heard of, drawn or not (it waits while typing is under way). */
  private latest: { body: string; rich: boolean } | null = null;
  /** What the editable shows. */
  private lines: NoteLine[] = [{ heading: 0, runs: [] }];
  /** Typed and not saved yet, and the stored body when the typing began. */
  private draft: { since: string | null; lines: NoteLine[] } | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private composing = false;
  /** Marks the next letter typed at this caret takes (Ctrl+B with nothing selected, a new line after bold words). */
  private pending: { caret: number; marks: Marks } | null = null;
  private undoSteps: Step[] = [];
  private redoSteps: Step[] = [];
  private burst: { kind: 'insert' | 'delete' | null; at: number } = { kind: null, at: 0 };
  /** The caret moved since the last change: the next one is a step of its own. */
  private moved = true;
  private pressing = false;
  /** The selection whose bar Escape put away. */
  private dismissed: string | null = null;
  /** The letters the browser is typing (its input event may not say). */
  private letters: string | null = null;
  private editable = true;

  constructor(
    private readonly root: HTMLElement,
    private readonly host: BodyHost,
  ) {
    root.addEventListener('beforeinput', this.onBeforeInput);
    root.addEventListener('input', this.onInput);
    root.addEventListener('keydown', this.onKeyDown);
    root.addEventListener('paste', this.onPaste);
    root.addEventListener('compositionstart', this.onCompositionStart);
    root.addEventListener('compositionend', this.onCompositionEnd);
    root.addEventListener('focus', this.onFocus);
    root.addEventListener('blur', this.onBlur);
    root.addEventListener('pointerdown', this.onPointerDown);
    document.addEventListener('selectionchange', this.onSelectionChange);
    window.addEventListener('pointerup', this.onPointerUp, true);
    window.addEventListener('pointercancel', this.onPointerUp, true);
  }

  destroy(): void {
    this.flush();
    this.root.removeEventListener('beforeinput', this.onBeforeInput);
    this.root.removeEventListener('input', this.onInput);
    this.root.removeEventListener('keydown', this.onKeyDown);
    this.root.removeEventListener('paste', this.onPaste);
    this.root.removeEventListener('compositionstart', this.onCompositionStart);
    this.root.removeEventListener('compositionend', this.onCompositionEnd);
    this.root.removeEventListener('focus', this.onFocus);
    this.root.removeEventListener('blur', this.onBlur);
    this.root.removeEventListener('pointerdown', this.onPointerDown);
    document.removeEventListener('selectionchange', this.onSelectionChange);
    window.removeEventListener('pointerup', this.onPointerUp, true);
    window.removeEventListener('pointercancel', this.onPointerUp, true);
  }

  /** The stored body, when it is first known and whenever it changes: drawn unless the editable already shows it or typing is under way. */
  stored(body: string, rich: boolean): void {
    this.latest = { body, rich };
    if (this.base && this.base.body === body && this.base.rich === rich) return;
    if (this.base && (this.draft || this.composing)) return;
    const first = this.base === null;
    this.base = { body, rich };
    this.show(noteLines(body, rich));
    // The steps were taken on other words: undoing them now would write over what just came.
    if (!first) this.forget();
  }

  setEditable(editable: boolean): void {
    this.editable = editable;
    if (!editable) {
      this.flush();
      this.host.selected(null);
    }
  }

  /** Writes what is typed now: a word still being composed (a phone's keyboard, an input method) included, the page left as it is under it. */
  flush(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.composing) {
      this.edited(readLines(this.root));
      if (this.timer) clearTimeout(this.timer);
      this.timer = null;
    }
    const draft = this.draft;
    if (!draft) return;
    this.draft = null;
    const stored = this.host.save(draft.since, draft.lines);
    const typed = stored.rich ? serializeLines(draft.lines) : linesText(draft.lines);
    // Never drawn again under a composition: the page keeps what it shows, and the next save merges the rest from there.
    if (this.composing) {
      this.base = stored.body === typed ? stored : { body: typed, rich: stored.rich };
      return;
    }
    this.base = stored;
    if (stored.body === typed) return;
    // Merged with an edit from elsewhere: the merge shows, the caret kept in its words.
    this.forget();
    this.show(noteLines(stored.body, stored.rich));
  }

  focus(at: 'start' | 'end'): void {
    this.root.focus({ preventScroll: true });
    setSelectionOffsets(this.root, at === 'start' ? 0 : linesLength(this.lines));
  }

  /** Bold, italic or underline on the words selected (all of them wear it: off); with nothing selected, for the next letters typed. */
  toggle(flag: NoteFlag): void {
    if (!this.editable) return;
    const selection = selectionOffsets(this.root);
    if (!selection) return;
    const { start, end } = selection;
    if (start === end) {
      const marks: { -readonly [K in keyof Marks]: Marks[K] } = { ...(this.pending?.caret === start ? this.pending.marks : noteMarksAt(this.lines, start)) };
      if (marks[flag]) delete marks[flag];
      else marks[flag] = true;
      this.pending = { caret: start, marks };
      return;
    }
    this.format(setNoteFlag(this.lines, start, end, flag, !noteRangeHas(this.lines, start, end, flag)), selection);
  }

  /** The selected lines made a heading of `level`, or text again when they already are one. */
  heading(level: HeadingLevel): void {
    const selection = this.editable ? selectionOffsets(this.root) : null;
    if (!selection) return;
    this.format(setHeading(this.lines, selection.start, selection.end, headingIn(this.lines, selection.start, selection.end) === level ? 0 : level), selection);
  }

  /** The selection's marks and its lines' headings taken off. */
  clear(): void {
    const selection = this.editable ? selectionOffsets(this.root) : null;
    if (!selection) return;
    this.format(clearFormat(this.lines, selection.start, selection.end), selection);
  }

  /** Escape: the bar goes until the selection changes. */
  dismiss(): void {
    const selection = selectionOffsets(this.root);
    this.dismissed = selection ? `${selection.start}:${selection.end}` : null;
    this.host.selected(null);
  }

  undo(): void {
    this.travel(this.undoSteps, this.redoSteps);
  }

  redo(): void {
    this.travel(this.redoSteps, this.undoSteps);
  }

  // ── drawing and saving ──────────────────────────────────────────────────

  /** Draws lines from elsewhere, the caret kept in its words. */
  private show(lines: NoteLine[]): void {
    const selection = document.activeElement === this.root ? selectionOffsets(this.root) : null;
    const before = linesText(this.lines);
    renderLines(this.root, lines);
    this.lines = lines;
    if (selection) {
      const after = linesText(lines);
      setSelectionOffsets(this.root, mapCaret(before, after, selection.start), mapCaret(before, after, selection.end), selection.backward);
    }
    this.host.changed(lines);
    this.updateBar();
  }

  /** The person changed the lines: saved after a pause. */
  private edited(lines: NoteLine[]): void {
    if (same(lines, this.lines)) return;
    this.lines = lines;
    if (this.draft) this.draft.lines = lines;
    else this.draft = { since: this.base?.body ?? null, lines };
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), SAVE_DELAY_MS);
    this.host.changed(lines);
  }

  /** A change made by the editor's own hand: drawn, the selection set, saved after a pause. */
  private apply(lines: NoteLine[], start: number, end: number = start, backward = false): void {
    renderLines(this.root, lines);
    setSelectionOffsets(this.root, start, end, backward);
    this.edited(lines);
    this.updateBar();
  }

  /** A format: one step of its own, saved at once, the words kept selected. */
  private format(lines: NoteLine[], selection: TextSelection): void {
    if (same(lines, this.lines)) return;
    if (document.activeElement !== this.root) this.root.focus({ preventScroll: true });
    this.remember('other');
    this.apply(lines, selection.start, selection.end, selection.backward);
    this.flush();
  }

  /** Reads what the browser typed; draws it again if it left something of its own, and turns Markdown into what it writes. */
  private typed(inputType: string, data: string | null): void {
    let lines = readLines(this.root);
    if (!isCanonical(this.root)) {
      const selection = selectionOffsets(this.root, true);
      renderLines(this.root, lines);
      if (selection) setSelectionOffsets(this.root, selection.start, selection.end, selection.backward);
    }
    if (inputType === 'insertText' && (data === ' ' || data === '*')) {
      const caret = selectionOffsets(this.root);
      const shortcut = caret && caret.start === caret.end ? (data === ' ' ? headingShortcut(lines, caret.start) : inlineMarkdown(lines, caret.start)) : null;
      if (caret && shortcut) {
        // The words as typed are a step: undo brings the `# ` or the stars back.
        this.edited(lines);
        this.push({ lines, start: caret.start, end: caret.end });
        this.burst = { kind: null, at: 0 };
        renderLines(this.root, shortcut.lines);
        setSelectionOffsets(this.root, shortcut.caret);
        lines = shortcut.lines;
        // What is typed next goes on after the mark just closed, not in it.
        if (data === '*') this.pending = { caret: shortcut.caret, marks: {} };
      }
    }
    this.edited(lines);
  }

  // ── undo ────────────────────────────────────────────────────────────────

  private here(): Step {
    const selection = selectionOffsets(this.root);
    const end = linesLength(this.lines);
    return { lines: this.lines, start: selection?.start ?? end, end: selection?.end ?? end };
  }

  private push(step: Step): void {
    this.undoSteps.push(step);
    if (this.undoSteps.length > MAX_STEPS) this.undoSteps.shift();
  }

  /** Before a change: a new step, unless it goes on with the typing of the last one. */
  private remember(kind: 'insert' | 'delete' | 'other'): void {
    const now = Date.now();
    if (kind === 'other' || kind !== this.burst.kind || this.moved || now - this.burst.at > STEP_PAUSE_MS) this.push(this.here());
    this.burst = { kind: kind === 'other' ? null : kind, at: now };
    this.moved = false;
    this.redoSteps = [];
  }

  private travel(from: Step[], to: Step[]): void {
    if (!this.editable) return;
    const step = from.pop();
    if (!step) return;
    to.push(this.here());
    this.burst = { kind: null, at: 0 };
    this.pending = null;
    this.apply(step.lines, step.start, step.end);
    this.flush();
  }

  private forget(): void {
    this.undoSteps = [];
    this.redoSteps = [];
    this.burst = { kind: null, at: 0 };
  }

  // ── what the editor does by its own hand ──────────────────────────────────

  private enter(selection: TextSelection): void {
    this.remember('other');
    const marks = noteMarksAt(this.lines, selection.start);
    const edit = splitLine(this.lines, selection.start, selection.end);
    this.apply(edit.lines, edit.caret);
    // A line started after bold words goes on in bold, once something is typed.
    const { line } = spotOf(edit.lines, edit.caret);
    this.pending = edit.lines[line]!.runs.length === 0 && Object.keys(marks).length > 0 ? { caret: edit.caret, marks } : null;
  }

  /** Lines pasted or dropped over the selection, cut to what the note can hold. */
  private insert(inserted: NoteLine[], selection: TextSelection): void {
    const room = Math.max(0, this.host.limit - (linesLength(this.lines) - (selection.end - selection.start)));
    let lines = inserted;
    if (linesLength(inserted) > room) {
      lines = cutLines(inserted, room);
      this.host.cut();
    }
    if (linesLength(lines) === 0 && lines.length === 1 && selection.start === selection.end) return;
    this.remember('other');
    const edit = replaceRange(this.lines, selection.start, selection.end, lines);
    this.apply(edit.lines, edit.caret);
  }

  /** A caret the browser left on the editable itself (between its lines) goes into a line, where typing belongs. */
  private settle(): void {
    if (!caretOnRoot(this.root)) return;
    const selection = selectionOffsets(this.root);
    if (selection) setSelectionOffsets(this.root, selection.start, selection.end, selection.backward);
  }

  private updateBar(): void {
    const selection = this.editable && !this.pressing && !this.composing && document.activeElement === this.root ? selectionOffsets(this.root) : null;
    const key = selection ? `${selection.start}:${selection.end}` : null;
    if (key !== this.dismissed) this.dismissed = null;
    if (!selection || selection.start === selection.end || key === this.dismissed) {
      this.host.selected(null);
      return;
    }
    const { start, end } = selection;
    this.host.selected({
      start,
      end,
      flags: { b: noteRangeHas(this.lines, start, end, 'b'), i: noteRangeHas(this.lines, start, end, 'i'), u: noteRangeHas(this.lines, start, end, 'u') },
      heading: headingIn(this.lines, start, end),
    });
  }

  // ── events ──────────────────────────────────────────────────────────────

  private readonly onBeforeInput = (event: InputEvent): void => {
    const type = event.inputType;
    if (!this.editable) {
      event.preventDefault();
      return;
    }
    if (type === 'historyUndo' || type === 'historyRedo') {
      event.preventDefault();
      if (type === 'historyUndo') this.undo();
      else this.redo();
      return;
    }
    if (type.startsWith('format')) {
      // Bold, italic and underline from the browser's own menus; nothing else a note can wear.
      event.preventDefault();
      const flag = FORMATS[type];
      if (flag) this.toggle(flag);
      return;
    }
    if (event.isComposing || type === 'insertCompositionText') return;
    this.settle();
    const selection = selectionOffsets(this.root);
    if (!selection) return;
    const { start, end } = selection;
    const collapsed = start === end;
    if (type === 'insertParagraph' || type === 'insertLineBreak') {
      event.preventDefault();
      this.enter(selection);
      return;
    }
    if (type === 'insertText' || type === 'insertFromPaste' || type === 'insertFromDrop' || type === 'insertFromYank' || type === 'insertFromPasteAsQuotation') {
      const text = event.data ?? event.dataTransfer?.getData('text/plain') ?? '';
      if (type !== 'insertText' || /[\r\n]/.test(text)) {
        event.preventDefault();
        if (text) this.insert(textLines(text), type === 'insertFromDrop' ? (this.dropAt(event) ?? selection) : selection);
        return;
      }
      if (!text) return;
      const marks = collapsed && this.pending?.caret === start ? this.pending.marks : null;
      if (collapsed && !marks) {
        if (linesLength(this.lines) >= this.host.limit) event.preventDefault();
        else {
          this.remember('insert');
          this.letters = text;
        }
        return;
      }
      // Over a selection, or with marks waiting: the editor writes the letters.
      event.preventDefault();
      this.remember('insert');
      const edit = insertText(this.lines, start, end, text, marks ?? marksAtStart(this.lines, start, end));
      this.pending = null;
      this.apply(edit.lines, edit.caret);
      return;
    }
    if (type === 'insertReplacementText') {
      // A spelling fix: the browser replaces the word in its line.
      this.remember('other');
      return;
    }
    if (type === 'deleteByDrag') {
      // Words dragged inside the note are copied, not moved.
      event.preventDefault();
      return;
    }
    if (!type.startsWith('delete')) return;
    if (!collapsed) {
      event.preventDefault();
      this.remember(type === 'deleteByCut' ? 'other' : 'delete');
      const edit = replaceRange(this.lines, start, end);
      this.apply(edit.lines, edit.caret);
      return;
    }
    const edit = type.includes('Backward') ? deleteBackward(this.lines, start) : type.includes('Forward') ? deleteForward(this.lines, start) : null;
    if (!edit) {
      this.remember('delete');
      return;
    }
    event.preventDefault();
    if (same(edit.lines, this.lines)) return;
    this.remember('other');
    this.apply(edit.lines, edit.caret);
  };

  /** Where dropped words go: the drop's own caret. */
  private dropAt(event: InputEvent): TextSelection | null {
    const range = event.getTargetRanges?.()[0];
    if (!range) return null;
    const selection = window.getSelection();
    try {
      selection?.setBaseAndExtent(range.startContainer, range.startOffset, range.endContainer, range.endOffset);
    } catch {
      return null;
    }
    return selectionOffsets(this.root);
  }

  private readonly onInput = (event: Event): void => {
    const input = event as InputEvent;
    const letters = this.letters;
    this.letters = null;
    if (this.composing || input.isComposing) return;
    this.typed(input.inputType ?? '', input.data ?? letters);
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.isComposing || this.composing) return;
    if (MOVES.has(event.key)) {
      this.moved = true;
      this.pending = null;
      return;
    }
    if (!this.editable) return;
    const key = event.key.toLowerCase();
    if ((event.ctrlKey || event.metaKey) && !event.altKey) {
      if (!event.shiftKey && (key === 'b' || key === 'i' || key === 'u')) {
        event.preventDefault();
        this.toggle(key);
      } else if (key === 'z') {
        event.preventDefault();
        if (event.shiftKey) this.redo();
        else this.undo();
      } else if (key === 'y' && event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        this.redo();
      }
      // Ctrl+Entrée is the sheet's: it closes the note.
      return;
    }
    if (event.key === 'Enter' && !event.altKey) {
      event.preventDefault();
      this.settle();
      const selection = selectionOffsets(this.root);
      if (selection) this.enter(selection);
    }
  };

  private readonly onPaste = (event: ClipboardEvent): void => {
    const data = event.clipboardData;
    if (!this.editable || !data) return;
    if (this.host.takesPictures && [...data.files].some(file => file.type.startsWith('image/'))) return;
    event.preventDefault();
    const html = data.getData('text/html');
    const lines = (html ? linesFromHtml(html) : null) ?? textLines(data.getData('text/plain'));
    const end = linesLength(this.lines);
    this.insert(lines, selectionOffsets(this.root) ?? { start: end, end, backward: false });
  };

  private readonly onCompositionStart = (): void => {
    this.remember('insert');
    this.composing = true;
    this.host.selected(null);
  };

  private readonly onCompositionEnd = (): void => {
    this.composing = false;
    this.typed('insertCompositionText', null);
    // An edit from elsewhere that came meanwhile shows now, when the composition wrote nothing.
    if (!this.draft && this.latest) this.stored(this.latest.body, this.latest.rich);
  };

  private readonly onFocus = (): void => {
    this.moved = true;
    this.settle();
  };

  private readonly onBlur = (): void => {
    this.flush();
    this.pending = null;
    this.host.selected(null);
  };

  private readonly onPointerDown = (): void => {
    this.pressing = true;
    this.moved = true;
    this.pending = null;
    this.host.selected(null);
  };

  private readonly onPointerUp = (): void => {
    if (!this.pressing) return;
    this.pressing = false;
    // The selection settles after the press ends (a double click's word).
    setTimeout(() => this.updateBar(), 0);
  };

  private readonly onSelectionChange = (): void => {
    if (document.activeElement !== this.root) return;
    if (caretOnRoot(this.root)) {
      this.settle();
      return;
    }
    if (this.pending) {
      const selection = selectionOffsets(this.root);
      if (!selection || selection.start !== this.pending.caret || selection.end !== selection.start) this.pending = null;
    }
    if (!this.pressing) this.updateBar();
  };
}
