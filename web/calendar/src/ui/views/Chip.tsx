/**
 * An occurrence as the views draw it: a box on the hours' grid (its title, its hours, its place), a
 * bar across days (the all-day strip, the month), or a dot and a line (a timed event in the month,
 * as Google draws it). Its colour's wash, its pigment's edge; a layer's item (a birthday, a
 * reminder of Carnet's, a day written in a page) wears a dotted edge.
 */
import { memo, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';

import { t } from '@unlease/core/i18n';
import type { LineColor } from '@unlease/design/colors';
import { clockWords, timeRange } from '@unlease/calendar/services/eventText';
import type { Occurrence } from '@unlease/calendar/services/occurrences';
import { formatClock } from '@unlease/core/services/format';

import { kindOf } from '../../app/hooks/useItems';
import styles from '../calendar.module.css';

export type ChipVariant = 'box' | 'bar' | 'dot';

export interface ChipProps {
  readonly item: Occurrence;
  readonly color: LineColor | null;
  readonly variant: ChipVariant;
  readonly twelveHours: boolean;
  /** A box's room, in lines of text: one puts its time after its title, more give the title what it needs and its time and place under it. */
  readonly lines?: number;
  readonly dragging?: boolean;
  readonly onOpen: (item: Occurrence, element: HTMLElement) => void;
  /** Starts a drag (one's own events only); the click after a drag is the drag's. */
  readonly onPointerDown?: (event: ReactPointerEvent<HTMLButtonElement>, item: Occurrence) => void;
  readonly children?: ReactNode;
}

/** What a screen reader reads of it: its title, then when. */
export function chipLabel(item: Occurrence, twelveHours: boolean): string {
  const title = item.event.title.trim() || t('Sans titre');
  return `${title}, ${timeRange(item, twelveHours)}`;
}

function ChipComponent({ item, color, variant, twelveHours, lines = 1, dragging = false, onOpen, onPointerDown, children }: ChipProps) {
  const title = item.event.title.trim() || t('Sans titre');
  const layer = kindOf(item.key) !== 'event';
  const start = item.allDay ? null : clockWords(formatClock(item.startAt), twelveHours);
  return (
    <button
      type="button"
      className={[styles.chip, variant === 'box' ? '' : styles.chipLine, variant === 'dot' ? styles.chipDot : ''].join(' ')}
      data-short={(variant === 'box' && lines < 2) || undefined}
      data-line={color ?? undefined}
      data-layer={layer || undefined}
      data-dragging={dragging || undefined}
      data-key={item.key}
      aria-label={chipLabel(item, twelveHours)}
      onClick={event => onOpen(item, event.currentTarget)}
      onPointerDown={onPointerDown ? event => onPointerDown(event, item) : undefined}
    >
      {variant === 'box' && lines < 2 ? (
        <span className={styles.chipOneLine}>
          <span className={styles.chipTitle}>{title}</span>
          {start ? <span className={`${styles.chipMeta} tabular`}>{start}</span> : null}
        </span>
      ) : variant === 'box' ? (
        <>
          <span className={styles.chipTitle} data-wrap="" style={{ WebkitLineClamp: Math.max(1, lines - 1) }}>
            {title}
          </span>
          <span className={`${styles.chipMeta} tabular`}>{[timeRange(item, twelveHours), lines >= 3 ? item.event.place.trim() : ''].filter(Boolean).join(' · ')}</span>
        </>
      ) : (
        <>
          {start && variant === 'dot' ? <span className={`${styles.chipMeta} tabular`}>{start}</span> : null}
          <span className={styles.chipTitle}>{title}</span>
        </>
      )}
      {children}
    </button>
  );
}

export const Chip = memo(ChipComponent);
