/**
 * The menu « @ » opens by the caret, in every app (an event's description, a note, a page): what it
 * may mention, a row each (its glyph, or a page's emoji; its name; what tells it apart in the second
 * ink), under small heads when kinds mix; the active row lit and kept in view. The keys stay the
 * field's: the arrows move, Entrée or Tab picks, Échap closes (`useMenuKeys`), and a press picks
 * without taking the caret away. Nothing answering says so in a line.
 */
import { Fragment, useLayoutEffect, useRef, useState } from 'react';

import type { GlyphName } from '@unlease/design/glyphs';

import { EmptyLine } from './EmptyLine';
import { Floating } from './Floating';
import { Icon } from './Icon';
import styles from './mentionMenu.module.css';

export interface MenuRow {
  readonly key: string;
  /** Its kind's head, as shown (translated); rows of a kind follow each other. */
  readonly section?: string;
  readonly label: string;
  readonly detail?: string;
  readonly icon: GlyphName;
  /** Drawn in the glyph's place: a page's own emoji. */
  readonly emoji?: string;
  readonly pick: () => void;
}

/**
 * The arrows, Entrée, Tab and Échap for a list, from whatever field holds the keys: `take` answers
 * whether it used the key. New results start again at the first row; the same rows rebuilt (an
 * autosave, a sync) keep the one chosen.
 */
export function useMenuKeys(rows: readonly MenuRow[], close: () => void): { readonly active: number; readonly setActive: (index: number) => void; readonly take: (key: string) => boolean } {
  const [state, setState] = useState({ keys: '', active: 0 });
  const keys = rows.map(row => row.key).join('\n');
  const active = state.keys === keys ? Math.min(state.active, Math.max(0, rows.length - 1)) : 0;
  const setActive = (index: number): void => setState({ keys, active: index });
  const take = (key: string): boolean => {
    const count = rows.length;
    if (key === 'ArrowDown' || key === 'ArrowUp') {
      // Nothing to move through: the field's own (a line up, a line down).
      if (count === 0) return false;
      setActive((active + (key === 'ArrowDown' ? 1 : -1) + count) % count);
      return true;
    }
    if (key === 'Enter' || key === 'Tab') {
      const row = rows[active];
      if (!row) return false;
      row.pick();
      return true;
    }
    if (key === 'Escape') {
      close();
      return true;
    }
    return false;
  };
  return { active, setActive, take };
}

export interface MentionMenuProps {
  readonly anchor: DOMRect;
  readonly rows: readonly MenuRow[];
  readonly active: number;
  readonly onActive: (index: number) => void;
  /** What the menu is, for a screen reader. */
  readonly label: string;
  /** What its list holds (« Contacts et événements »), when it says more than the menu's name. */
  readonly listLabel?: string;
  /** Said when no row answers. */
  readonly empty: string;
  readonly id: string;
}

export function MentionMenu({ anchor, rows, active, onActive, label, listLabel, empty, id }: MentionMenuProps) {
  const list = useRef<HTMLDivElement>(null);
  // The list alone scrolls to the active row: `scrollIntoView` would scroll the page too.
  useLayoutEffect(() => {
    const node = list.current;
    const row = node?.querySelector<HTMLElement>('[data-active]');
    if (!node || !row) return;
    const box = node.getBoundingClientRect();
    const rect = row.getBoundingClientRect();
    if (rect.top < box.top) node.scrollTop -= box.top - rect.top + (row.previousElementSibling?.hasAttribute('data-section') ? 28 : 0);
    else if (rect.bottom > box.bottom) node.scrollTop += rect.bottom - box.bottom;
  }, [active]);
  return (
    <Floating anchor={anchor} label={label} className={styles.panel} id={id}>
      {rows.length === 0 ? (
        <EmptyLine text={empty} glyph="info" className={styles.empty} />
      ) : (
        <div ref={list} className={styles.list} role="listbox" aria-label={listLabel ?? label}>
          {rows.map((row, index) => (
            <Fragment key={row.key}>
              {row.section && (index === 0 || rows[index - 1]!.section !== row.section) ? (
                <div className={`${styles.section} t-meta-strong`} data-section="" aria-hidden="true">
                  {row.section}
                </div>
              ) : null}
              <button
                type="button"
                role="option"
                id={`${id}-${index}`}
                aria-selected={index === active}
                data-active={index === active || undefined}
                className={styles.row}
                // The caret stays in the field.
                onMouseDown={event => event.preventDefault()}
                onPointerMove={() => index !== active && onActive(index)}
                onClick={row.pick}
              >
                {row.emoji ? (
                  <span className={styles.emoji} aria-hidden="true">
                    {row.emoji}
                  </span>
                ) : (
                  <span className={styles.icon}>
                    <Icon name={row.icon} size={20} />
                  </span>
                )}
                <span className={styles.text}>
                  <span className={`${styles.label} t-body`}>{row.label}</span>
                  {row.detail ? <span className={`${styles.detail} t-meta`}>{row.detail}</span> : null}
                </span>
              </button>
            </Fragment>
          ))}
        </div>
      )}
    </Floating>
  );
}
