/**
 * An app's mark as the app draws it: its beige shape on the pebble in the primary colour
 * (`markColors`), what it holds cut out of it: Carnet's card and its leaf, Pages' sheet and its
 * writing, Contacts' card and its person, Agenda's page and its days (`@unlease/design/mark`), the same as the phone's.
 */
import { memo } from 'react';

import type { AppId } from '@unlease/core/apps';
import { markColors } from '@unlease/design/appearance';
import { MARK_CALENDAR, MARK_CARD, MARK_CONTACT, MARK_PAGE, MARK_PEBBLE, MARK_VIEWBOX } from '@unlease/design/mark';

import { useSettingsStore } from '../../app/store/settings';
import styles from './marks.module.css';

/** Each app's shape on the pebble; an announced app without its own yet wears Carnet's card. */
const SHAPES: Readonly<Partial<Record<AppId, string>>> = { notes: MARK_CARD, pages: MARK_PAGE, calendar: MARK_CALENDAR, contacts: MARK_CONTACT };

/** An app's shape, cut out of the beige of its mark (the tab's icon draws it too). */
export const markShape = (app: AppId): string => SHAPES[app] ?? MARK_CARD;

function BrandMarkComponent({ app = 'notes', size = 32 }: { app?: AppId; size?: number }) {
  const { tile, card } = markColors(useSettingsStore(state => state.appearance.primary));
  return (
    <svg className={styles.mark} width={size} height={size} viewBox={`0 0 ${MARK_VIEWBOX} ${MARK_VIEWBOX}`} aria-hidden="true" focusable="false">
      <path d={MARK_PEBBLE} fill={tile} />
      <path d={markShape(app)} fill={card} fillRule="evenodd" />
    </svg>
  );
}

export const BrandMark = memo(BrandMarkComponent);
