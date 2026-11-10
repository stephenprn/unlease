/** How an item is painted: its pigment from the theme (a label's, a calendar's, a layer's), the accent for none. */
import type { LineColor } from '@unlease/design/colors';
import { mix } from '@unlease/design/palette';
import { t } from '@unlease/core/i18n';
import { birthdayTitle, clockWords, timeRange } from '@unlease/calendar/services/eventText';
import { formatClock } from '@unlease/core/services/format';
import { LAYER_COLORS, type AgendaItem } from '@app/agenda';

import type { Theme } from '@shared/ui/theme/theme';

export interface Paint {
  readonly fill: string;
  readonly on: string;
  readonly tint: string;
  readonly text: string;
}

export function paintOf(theme: Theme, color: LineColor | null): Paint {
  // None: the accent's edge on its own pale wash, as the web's chip (`--action` 18% into the paper).
  if (!color) return { fill: theme.color.action, on: theme.color.onAction, tint: mix(theme.color.paper, theme.color.action, 0.18), text: theme.color.link };
  const swatch = theme.line[color];
  return { fill: swatch.fill, on: swatch.on, tint: swatch.tint, text: swatch.text };
}

export function itemColor(item: AgendaItem): LineColor | null {
  return item.kind === 'event' ? item.color : LAYER_COLORS[item.kind];
}

/** What an item is called in a view. */
export function itemTitle(item: AgendaItem): string {
  switch (item.kind) {
    case 'event':
      return item.occurrence.event.title.trim() || t('Sans titre');
    case 'birthday':
      return birthdayTitle(item.birthday.name, item.birthday.age);
    case 'reminder':
      return item.reminder.title || t('Sans titre');
    case 'page':
      return item.page.title || t('Sans titre');
  }
}

/** Its time in a list: « 14:30 – 15:30 », « Toute la journée ». */
export function itemTime(item: AgendaItem, day: string, twelveHours: boolean): string {
  switch (item.kind) {
    case 'event': {
      const occurrence = item.occurrence;
      if (occurrence.allDay || (occurrence.firstDay < day && occurrence.lastDay > day)) return t('Toute la journée');
      if (occurrence.firstDay < day) return t('Jusqu’à {clock}', { clock: clockWords(formatClock(occurrence.endAt), twelveHours) });
      if (occurrence.lastDay > day) return t('À partir de {clock}', { clock: clockWords(formatClock(occurrence.startAt), twelveHours) });
      return timeRange(occurrence, twelveHours);
    }
    case 'reminder':
      return clockWords(formatClock(item.reminder.at), twelveHours);
    case 'page':
      return item.page.time ? clockWords(item.page.time, twelveHours) : t('Toute la journée');
    case 'birthday':
      return t('Toute la journée');
  }
}
