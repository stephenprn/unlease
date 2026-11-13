/**
 * French for « Souhaiter » (a birthday's wish and the ways it goes: `services/wishes.ts`, both
 * clients and Agenda's birthday page), what the phone says of its birthday notifications
 * (`services/birthdayReminders.ts`), and a contact's row slid to call or text (the phone's list).
 * Keys are the English exactly as written in `t()` / `tx()`, single-quoted, one per line.
 */
import type { Dictionary } from '@unlease/core/i18n';

export const FR_WISHES: Dictionary = {
  // The wish itself, written into the app it goes through
  'Happy birthday, {name}!': 'Joyeux anniversaire, {name} !',
  'Happy birthday!': 'Joyeux anniversaire !',
  'Happy birthday': 'Joyeux anniversaire',
  // Where it is offered
  'Send wishes': 'Souhaiter',
  'Wish {name} a happy birthday': 'Souhaiter son anniversaire à {name}',
  '“{message}”': '« {message} »',
  'No number or email to write to: “Edit” adds one.': 'Ni numéro ni e-mail pour lui écrire : « Modifier » en ajoute.',
  'Their birthday': 'Son anniversaire',
  'Yesterday': 'Hier',
  // The phone's birthday notifications, said on a birthday's page
  'Reminder on the day at {hour}, and the day before': 'Rappel le jour même à {hour}, et la veille',
  'Reminder on the day at {hour}': 'Rappel le jour même à {hour}',
  'Remind me the day before': 'Prévenir la veille',
  'For every birthday, on this phone': 'Pour tous les anniversaires, sur ce téléphone',
  // A row of the list slid sideways (its TalkBack action)
  'Send a text': 'Écrire un SMS',
};
