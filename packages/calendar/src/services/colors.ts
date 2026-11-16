/**
 * An event's colour: its own when it has one, else its first live label's, else its calendar's (a
 * subscription's, the holidays'), else the colour of the person's own events (« Mes événements »,
 * Réglages' choice, `OWN_EVENTS_COLOR` until one is made): a pigment of its own, never the accent,
 * which acts (« Enregistrer », today, the links), nor the primary, which chooses.
 */
import type { LineColor } from '@unlease/design/colors';
import type { CalendarEvent, CalendarFeed, CalendarLabel } from '../models/events';

/** « Mes événements », until Réglages say otherwise: Google's own calendar's blue. */
export const OWN_EVENTS_COLOR: LineColor = 'blue';

export function eventColor(
  event: Pick<CalendarEvent, 'color' | 'labelIds' | 'feedId'>,
  labels: Readonly<Record<string, CalendarLabel>>,
  feeds: Readonly<Record<string, CalendarFeed>>,
  own: LineColor = OWN_EVENTS_COLOR,
): LineColor {
  if (event.color) return event.color;
  for (const id of event.labelIds) {
    const label = labels[id];
    if (label && label.deletedAt === null) return label.color;
  }
  const feed = event.feedId ? feeds[event.feedId] : undefined;
  return feed && feed.deletedAt === null ? feed.color : own;
}

/**
 * What the other apps lay on the calendar, each in its own pigment on every client, as Google gives
 * its birthdays and tasks theirs: the contacts' birthdays, Carnet's reminders, the days written in pages.
 */
export const LAYER_COLORS = { birthday: 'pink', reminder: 'ochre', page: 'sky' } as const satisfies Readonly<Record<string, LineColor>>;

/** The palette's turn for a new label or calendar: the first colour not used yet. */
export function nextColor(used: readonly LineColor[], palette: readonly LineColor[]): LineColor {
  return palette.find(color => !used.includes(color)) ?? palette[used.length % palette.length]!;
}
