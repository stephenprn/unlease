/** Where a reference opens from Agenda: an event here, anything else in its own app (installed, else on the web). */
import type { Ref } from '@unlease/core/refs';
import { contactPlace, notesPlace, openInApp, pagePlace } from '@shared/app/openApp';
import { later } from '@app/later';

export function openRef(target: Ref, openEvent: (id: string) => void): void {
  switch (target.type) {
    case 'event':
      openEvent(target.id);
      break;
    case 'contact':
      later(openInApp('contacts', contactPlace(target.id)));
      break;
    case 'note':
      later(openInApp('notes', notesPlace('note', target.id)));
      break;
    case 'link':
      later(openInApp('notes', notesPlace('link', target.id)));
      break;
    case 'page':
      later(openInApp('pages', pagePlace(target.id)));
      break;
    default:
      break;
  }
}
