/** « Créer un contact »: its form, empty, or starting from a name typed in the spotlight or the label of the list it was made from. */
import { seedNewContact } from '../../app/store/contactsUi';
import { navigate } from '@shared/ui/router';
import { paths } from '../routes';

export function openNewContact(name = '', labelIds: readonly string[] = []): void {
  seedNewContact(name || labelIds.length > 0 ? { name, labelIds } : null);
  navigate(paths.newContact);
}
