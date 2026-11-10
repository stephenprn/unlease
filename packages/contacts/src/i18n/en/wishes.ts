/**
 * English for « Souhaiter » (a birthday's wish and the ways it goes: `services/wishes.ts`, both
 * clients and Agenda's birthday page), what the phone says of its birthday notifications
 * (`services/birthdayReminders.ts`), and a contact's row slid to call or text (the phone's list).
 * Keys are the French exactly as written in `t()` / `tx()`, single-quoted, one per line.
 */
import type { Dictionary } from '@unlease/core/i18n';

export const EN_WISHES: Dictionary = {
  // The wish itself, written into the app it goes through
  'Joyeux anniversaire, {name} !': 'Happy birthday, {name}!',
  'Joyeux anniversaire !': 'Happy birthday!',
  'Joyeux anniversaire': 'Happy birthday',
  // Where it is offered
  'Souhaiter': 'Send wishes',
  'Souhaiter son anniversaire à {name}': 'Wish {name} a happy birthday',
  '« {message} »': '“{message}”',
  'Ni numéro ni e-mail pour lui écrire : « Modifier » en ajoute.': 'No number or email to write to: “Edit” adds one.',
  'Son anniversaire': 'Their birthday',
  'Hier': 'Yesterday',
  // The phone's birthday notifications, said on a birthday's page
  'Rappel le jour même à {hour}, et la veille': 'Reminder on the day at {hour}, and the day before',
  'Rappel le jour même à {hour}': 'Reminder on the day at {hour}',
  'Prévenir la veille': 'Remind me the day before',
  'Pour tous les anniversaires, sur ce téléphone': 'For every birthday, on this phone',
  // A row of the list slid sideways (its TalkBack action)
  'Écrire un SMS': 'Send a text',
};
