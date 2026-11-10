/**
 * A menu of actions: arrow keys move, Enter or Space runs, Escape closes, letters typed jump to the
 * first row they begin, else the first with a word they begin (« new y », America/New York); a space
 * typed within a word is part of it.
 * Destructive items carry the danger ink and come last, under a hairline (`menuSeparated`, the phone's rule too). Each 48 row presses as
 * its own tab-shaped pebble inside the menu, as on the phone; the keyboard
 * hints show only where there is a fine pointer, so a keyboard is likely.
 */
import { useRef, type KeyboardEvent, type ReactNode, type RefObject } from 'react';

import { foldText } from '@unlease/core/services/search';

import type { GlyphName } from '@unlease/design/glyphs';
import { menuSeparated } from '@unlease/design/menus';

import { Icon } from './Icon';
import styles from './layers.module.css';
import { Popover } from './Popover';

export interface MenuItem {
  readonly label: string;
  readonly icon: GlyphName;
  /** Drawn instead of the icon: a page's own emoji. */
  readonly mark?: ReactNode;
  readonly onSelect: () => void;
  readonly danger?: boolean;
  readonly shortcut?: string;
  /** A hairline over it, setting a group apart (the danger items get theirs on their own). */
  readonly separatorBefore?: boolean;
  /** Shown in the second ink and doing nothing: it keeps its place, so the menu reads the same every time. */
  readonly disabled?: boolean;
}

/** Letters typed within this long make one word to jump to. */
const TYPED_PAUSE_MS = 600;

export function Menu({
  open,
  anchor,
  onDismiss,
  items,
  label,
  align = 'end',
  width,
  chosen,
}: {
  open: boolean;
  anchor: RefObject<HTMLElement | null>;
  onDismiss: () => void;
  items: readonly MenuItem[];
  label: string;
  align?: 'start' | 'end';
  /** As wide as this (a select's field), when it is wider than the menu's own. */
  width?: number;
  /** The row the focus starts on (a select's chosen value), brought into view. */
  chosen?: number;
}) {
  const list = useRef<HTMLDivElement>(null);
  const chosenRow = useRef<HTMLButtonElement>(null);
  const typed = useRef({ word: '', at: 0 });
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const buttons = [...(list.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])];
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const move = (next: number) => {
      event.preventDefault();
      buttons[(next + buttons.length) % buttons.length]?.focus();
    };
    if (event.key === 'ArrowDown') move(index + 1);
    else if (event.key === 'ArrowUp') move(index - 1);
    else if (event.key === 'Home') move(0);
    else if (event.key === 'End') move(buttons.length - 1);
    else if (event.key === 'Tab') onDismiss();
    else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const now = event.timeStamp;
      const typing = typed.current.word !== '' && now - typed.current.at < TYPED_PAUSE_MS;
      // A space runs the row, unless a word is being typed: then it is the word's.
      if (event.key === ' ' && !typing) return;
      event.preventDefault();
      // Typed letters: the first row beginning with them (after the one focused when a single letter
      // repeats), else the first with a word beginning with them.
      const word = typing ? typed.current.word + event.key : event.key;
      typed.current = { word, at: now };
      const wanted = foldText(word);
      const repeat = [...wanted].every(letter => letter === wanted[0]);
      const text = (button: HTMLButtonElement): string => foldText(button.textContent ?? '');
      const starts = (button: HTMLButtonElement): boolean => text(button).startsWith(repeat ? wanted[0]! : wanted);
      const wordStarts = (button: HTMLButtonElement): boolean => text(button).split(/[\s/(,.-]+/).some((_, at, words) => words.slice(at).join(' ').startsWith(wanted));
      const after = [...buttons.slice(index + 1), ...buttons.slice(0, index + 1)];
      const order = repeat ? after : [...buttons.slice(Math.max(0, index)), ...buttons.slice(0, Math.max(0, index))];
      (order.find(starts) ?? order.find(wordStarts))?.focus();
    }
  };
  const anchorWidth = width && width > 210 ? width : undefined;
  return (
    <Popover open={open} anchor={anchor} onDismiss={onDismiss} label={label} role="menu" align={align} className={styles.menu} width={anchorWidth} initialFocus={chosen !== undefined ? chosenRow : undefined}>
      <div ref={list} className={styles.menuList} onKeyDown={onKeyDown}>
        {items.map((item, index) => (
          <div key={`${index}:${item.label}`}>
            {menuSeparated(items, index) ? <div className={styles.menuSeparator} role="separator" /> : null}
            <button
              ref={index === chosen ? chosenRow : undefined}
              type="button"
              role="menuitem"
              className={[styles.menuItem, item.danger ? styles.dangerItem : ''].join(' ')}
              aria-disabled={item.disabled || undefined}
              onClick={() => {
                if (item.disabled) return;
                onDismiss();
                item.onSelect();
              }}
            >
              {item.mark ?? <Icon name={item.icon} size={22} />}
              <span>{item.label}</span>
              {item.shortcut ? <kbd className={styles.menuShortcut}>{item.shortcut}</kbd> : null}
            </button>
          </div>
        ))}
      </div>
    </Popover>
  );
}
