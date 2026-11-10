/**
 * An event's colour: its own when it has one, else its first live label's, else its calendar's (a
 * subscription's, the holidays'), else the device's primary (`null` here: the client paints it).
 */
import type { LineColor } from '@unlease/design/colors';
import type { CalendarEvent, CalendarFeed, CalendarLabel } from '../models/events';

export function eventColor(event: Pick<CalendarEvent, 'color' | 'labelIds' | 'feedId'>, labels: Readonly<Record<string, CalendarLabel>>, feeds: Readonly<Record<string, CalendarFeed>>): LineColor | null {
  if (event.color) return event.color;
  for (const id of event.labelIds) {
    const label = labels[id];
    if (label && label.deletedAt === null) return label.color;
  }
  const feed = event.feedId ? feeds[event.feedId] : undefined;
  return feed && feed.deletedAt === null ? feed.color : null;
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
