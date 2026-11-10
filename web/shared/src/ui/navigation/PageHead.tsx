/**
 * A page's head (the phone's TopBar). Wide, the title in `t-display` heads the page under the search
 * header, its one action a tonal button at the far end. On a phone-sized window the search header
 * belongs to the board alone: elsewhere the shell draws the phone's top bar (the ground itself, a
 * back pebble, the title centred on it) and the head moves into it, its action a pebble (a menu's,
 * for a page of the knowledge base, whose title shows there once the page's own has scrolled away).
 */
import { createContext, useContext, type RefObject } from 'react';
import { createPortal } from 'react-dom';

import type { GlyphName } from '@unlease/design/glyphs';
import { t } from '@unlease/core/i18n';

import { Button } from '../components/Button';
import { IconButton } from '../components/IconButton';
import { goBack } from '../router';
import { APP_HEADER_ID } from './Header';
import styles from './shell.module.css';

/** The top bar's room for the head, while the shell draws one; null when the head tops its page. */
export const PageHeadSlot = createContext<HTMLElement | null>(null);

export interface PageAction {
  readonly icon: GlyphName;
  readonly label: string;
  readonly onClick: () => void;
  /** The top bar's pebble opens a menu hung from it: its button, and whether the menu is open. */
  readonly menu?: { readonly anchor: RefObject<HTMLButtonElement | null>; readonly open: boolean };
  /** A toggle's state (a panel open): drawn as pressed. */
  readonly pressed?: boolean;
}

export interface PageHeadProps {
  readonly title: string;
  readonly action?: PageAction;
  /** In the top bar only, before the action: a second pebble (a page's « Demander à Claude »). */
  readonly extra?: PageAction;
  /** In the top bar: false keeps the title out of sight (it fades in and out). */
  readonly titleShown?: boolean;
}

export function PageHead({ title, action, extra, titleShown }: PageHeadProps) {
  const slot = useContext(PageHeadSlot);
  if (slot) {
    return createPortal(
      <>
        <h1 className={`${styles.topBarTitle} t-title`} style={titleShown === undefined ? undefined : { opacity: titleShown ? 1 : 0, transition: 'opacity var(--duration-short) var(--ease-standard)' }}>
          {title}
        </h1>
        {extra ? <IconButton icon={extra.icon} label={extra.label} size={24} pressed={extra.pressed} onClick={extra.onClick} /> : null}
        {action ? <IconButton ref={action.menu?.anchor} icon={action.icon} label={action.label} size={24} hasPopup={action.menu ? 'menu' : undefined} expanded={action.menu?.open} onClick={action.onClick} /> : null}
      </>,
      slot,
    );
  }
  return (
    <div className={styles.pageHead}>
      <h1 className={`${styles.pageTitle} t-display`}>{title}</h1>
      {action ? (
        <Button kind="tonal" icon={action.icon} onClick={action.onClick}>
          {action.label}
        </Button>
      ) : null}
    </div>
  );
}

export interface TopBarProps {
  /** Where Back leads when this page is the first the tab opened. */
  readonly fallback: string;
  /**
   * A collection's page: its own head carries the name and the actions, so the bar is the back
   * pebble alone, laid over that head's top row and scrolling away with it, as on the phone.
   */
  readonly over?: boolean;
  readonly onSlot?: (slot: HTMLElement | null) => void;
}

/** The phone's top bar, for a phone-sized window away from the board. */
export function TopBar({ fallback, over = false, onSlot }: TopBarProps) {
  return (
    <header className={over ? styles.topBarOver : styles.topBar} id={over ? undefined : APP_HEADER_ID}>
      <IconButton icon="back" label={t('Retour')} size={24} onClick={() => goBack(fallback)} />
      {over ? null : <div ref={onSlot} className={styles.topBarSlot} />}
    </header>
  );
}
