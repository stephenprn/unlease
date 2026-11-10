/** One's own events saved as `Agenda.ics` (iCalendar, `writeIcs`): what any calendar imports. */
import { markupToPlain } from '@unlease/core/services/richText';
import { SUITE_NAME } from '@unlease/core/apps';
import { isOwn } from '@unlease/calendar/models/events';
import { APP_NAME } from '@unlease/calendar/brand';
import { writeIcs } from '@unlease/calendar/services/ics';

import { mentionWords } from '../../app/names';
import { useCalendarStore } from '../../app/store/library';

export function exportCalendar(): void {
  const { events, labels } = useCalendarStore.getState();
  const own = Object.values(events).filter(event => event.deletedAt === null && event.trashedAt === null && isOwn(event));
  const text = writeIcs(own, {
    name: APP_NAME,
    productId: `-//${SUITE_NAME}//${APP_NAME}//FR`,
    now: Date.now(),
    plain: event => markupToPlain(event.description, mentionWords),
    categories: event => event.labelIds.map(id => labels[id]).filter(label => label && label.deletedAt === null).map(label => label!.name),
  });
  const url = URL.createObjectURL(new Blob([text], { type: 'text/calendar;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${APP_NAME}.ics`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
