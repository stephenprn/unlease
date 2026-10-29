/**
 * The formatting bar over words selected in a note: « Gras », « Italique », « Souligné », then
 * « Titre 1 » to « Titre 3 » (the lines' own level pressed again makes them text) and « Effacer la
 * mise en forme », each pressed as the selection wears it. Under a mouse it floats over the
 * selection as the pages' bar does, following it and never covering it (under its end once its start
 * has scrolled away); under a finger on a phone-sized window it stands on the keyboard, clear of
 * the system's own menu over the selection. A press on it keeps the selection. Its buttons are icon
 * buttons: hover, press and the pressed state lie on each one's pebble, as the phone's bar draws them.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import type { GlyphName } from '@unlease/design/glyphs';
import { t, tx } from '@unlease/core/i18n';
import { HEADING_LEVELS, type HeadingLevel } from '@unlease/notes/services/noteBody';

import { IconButton } from '../../components/IconButton';
import { overlayRoot } from '../../components/layers';
import { isApple } from '../../dom';
import { Floating } from '../pages/Floating';
import type { NoteFlag, SelectionState } from './bodyEditor';
import styles from './richBody.module.css';

/** Where the bar takes the keyboard's top instead of floating by the words. */
export const FINGER = '(max-width: 719px) and (pointer: coarse)';

const FLAGS: readonly { readonly flag: NoteFlag; readonly icon: GlyphName; readonly label: string; readonly key: string }[] = [
  { flag: 'b', icon: 'bold', label: tx('Gras'), key: 'B' },
  { flag: 'i', icon: 'italic', label: tx('Italique'), key: 'I' },
  { flag: 'u', icon: 'underline', label: tx('Souligné'), key: 'U' },
];

const HEADING_LOOKS: Readonly<Record<Exclude<HeadingLevel, 0>, { readonly icon: GlyphName; readonly label: string }>> = {
  1: { icon: 'heading1', label: tx('Titre 1') },
  2: { icon: 'heading2', label: tx('Titre 2') },
  3: { icon: 'heading3', label: tx('Titre 3') },
};

const keys = (letter: string): string => (isApple() ? `⌘${letter}` : `Ctrl+${letter}`);

export interface BarPlace {
  readonly anchor: DOMRect;
  /** Over the words (their start is in sight), else under their end. */
  readonly above: boolean;
}

/** What of the window a box inside `element` can show: the window, cut by every ancestor that scrolls or clips. */
function visibleBand(element: HTMLElement): { readonly top: number; readonly bottom: number } {
  const view = window.visualViewport;
  let top = view ? view.offsetTop : 0;
  let bottom = view ? view.offsetTop + view.height : window.innerHeight;
  for (let node = element.parentElement; node; node = node.parentElement) {
    const overflow = getComputedStyle(node).overflowY;
    if (overflow === 'visible') continue;
    const box = node.getBoundingClientRect();
    top = Math.max(top, box.top);
    bottom = Math.min(bottom, box.bottom);
  }
  return { top, bottom };
}

/** Where the bar stands for the selection inside `root`; null once the words are out of sight. */
export function selectionPlace(root: HTMLElement): BarPlace | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  // No layout here (a test): the bar still shows, placed nowhere in particular.
  if (typeof range.getClientRects !== 'function') return { anchor: new DOMRect(), above: true };
  const rects = [...range.getClientRects()].filter(rect => rect.width > 0 || rect.height > 0);
  const band = visibleBand(root);
  const seen = rects.filter(rect => rect.bottom > band.top && rect.top < band.bottom);
  if (seen.length === 0) return null;
  const left = Math.min(...seen.map(rect => rect.left));
  const right = Math.max(...seen.map(rect => rect.right));
  const top = Math.max(band.top, Math.min(...seen.map(rect => rect.top)));
  const bottom = Math.min(band.bottom, Math.max(...seen.map(rect => rect.bottom)));
  return { anchor: new DOMRect(left, top, right - left, Math.max(0, bottom - top)), above: Math.min(...rects.map(rect => rect.top)) >= band.top };
}

/** How much of the window's foot the on-screen keyboard covers (none while pinch-zoomed). */
function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const view = window.visualViewport;
    if (!view) return;
    const update = (): void => setInset(view.scale > 1.01 ? 0 : Math.max(0, Math.round(window.innerHeight - view.height - view.offsetTop)));
    update();
    view.addEventListener('resize', update);
    view.addEventListener('scroll', update);
    return () => {
      view.removeEventListener('resize', update);
      view.removeEventListener('scroll', update);
    };
  }, []);
  return inset;
}

/** Under a finger: a strip of the ground standing on the keyboard, where the note's own bar was. */
function DockedBar({ children }: { children: ReactNode }) {
  const inset = useKeyboardInset();
  return createPortal(
    <div
      className={styles.dockedBar}
      role="toolbar"
      aria-label={t('Mise en forme')}
      data-keyboard={inset > 0 || undefined}
      style={{ bottom: inset }}
      // A press here keeps the selection, and the keyboard, in the text.
      onPointerDown={event => event.preventDefault()}
      onMouseDown={event => event.preventDefault()}
    >
      {children}
    </div>,
    overlayRoot('live'),
  );
}

export interface NoteFormatBarProps {
  readonly state: SelectionState;
  /** Null under a mouse while the words are out of sight. */
  readonly place: BarPlace | null;
  readonly docked: boolean;
  readonly onFlag: (flag: NoteFlag) => void;
  readonly onHeading: (level: HeadingLevel) => void;
  readonly onClear: () => void;
}

export function NoteFormatBar({ state, place, docked, onFlag, onHeading, onClear }: NoteFormatBarProps) {
  // Under a finger the buttons and glyphs are a size up, as the phone's; over the words, compact.
  const size = docked ? 22 : 18;
  const compact = !docked;
  const buttons = (
    <>
      {FLAGS.map(({ flag, icon, label, key }, index) => (
        <IconButton key={flag} icon={icon} label={t(label)} shortcut={keys(key)} pressed={state.flags[flag]} shape={index} size={size} compact={compact} onClick={() => onFlag(flag)} />
      ))}
      <span className={styles.formatDivider} aria-hidden="true" />
      {HEADING_LEVELS.filter((level): level is Exclude<HeadingLevel, 0> => level > 0).map(level => (
        <IconButton key={level} icon={HEADING_LOOKS[level].icon} label={t(HEADING_LOOKS[level].label)} pressed={state.heading === level} shape={level + 2} size={size} compact={compact} onClick={() => onHeading(level)} />
      ))}
      <span className={styles.formatDivider} aria-hidden="true" />
      <IconButton icon="eraser" label={t('Effacer la mise en forme')} shape={6} size={size} compact={compact} onClick={onClear} />
    </>
  );
  if (docked) return <DockedBar>{buttons}</DockedBar>;
  if (!place) return null;
  return (
    <Floating anchor={place.anchor} above={place.above} label={t('Mise en forme')} className={styles.formatBar} role="toolbar">
      {/* A press never takes the focus from the text (a browser may focus a button on its mouse down). */}
      <div className={styles.formatRow} onMouseDown={event => event.preventDefault()}>
        {buttons}
      </div>
    </Floating>
  );
}
