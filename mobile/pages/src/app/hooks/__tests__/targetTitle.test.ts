/** A mention of a contact merged into another names the one kept; one deleted reads as gone. */
import { emptyContact, type Contact } from '@unlease/contacts/models/contacts';
import { targetTitle } from '@app/hooks/usePages';
import type { LibraryState } from '@app/store/libraryStore';

const contact = (id: string, firstName: string, more: Partial<Contact> = {}): Contact => ({ ...emptyContact(id, 1), firstName, lastName: 'Martin', ...more });

it('names a merged contact as the one it was merged into', () => {
  const contacts = {
    kept: contact('kept', 'Léa'),
    merged: contact('merged', 'L.', { mergedInto: 'kept', trashedAt: 5 }),
    gone: contact('gone', 'Paul', { deletedAt: 9 }),
  };
  const state = { people: { contacts } } as unknown as LibraryState;
  expect(targetTitle(state, { type: 'contact', id: 'merged' })).toBe('Léa Martin');
  expect(targetTitle(state, { type: 'contact', id: 'gone' })).toBeNull();
});
