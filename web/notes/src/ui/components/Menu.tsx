/**
 * A menu of actions: arrow keys move, Enter or Space runs, Escape closes.
 * Destructive items carry the danger ink and come last. Each 48 row presses as
 * its own tab-shaped pebble inside the menu, as on the phone; the keyboard
 * hints show only where there is a fine pointer, so a keyboard is likely.
 */
import { useRef, type KeyboardEvent, type ReactNode, type RefObject } from 'react';

import type { GlyphName } from '@unlease/design/glyphs';

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
  readonly separatorBefore?: boolean;
  /** Shown in the second ink and doing nothing: it keeps its place, so the menu reads the same every time. */
  readonly disabled?: boolean;
}

export function Menu({ open, anchor, onDismiss, items, label, align = 'end' }: { open: boolean; anchor: RefObject<HTMLElement | null>; onDismiss: () => void; items: readonly MenuItem[]; label: string; align?: 'start' | 'end' }) {
  const list = useRef<HTMLDivElement>(null);
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
  };
  return (
    <Popover open={open} anchor={anchor} onDismiss={onDismiss} label={label} role="menu" align={align} className={styles.menu}>
      <div ref={list} onKeyDown={onKeyDown}>
        {items.map((item, index) => (
          <div key={`${index}:${item.label}`}>
            {item.separatorBefore ? <div className={styles.menuSeparator} role="separator" /> : null}
            <button
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
