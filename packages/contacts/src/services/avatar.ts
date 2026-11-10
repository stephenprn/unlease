/**
 * A contact's face without a photo: their initials on a pigment of their own, the same on every
 * device and in every app (the phone's list, the web's, the widgets), from their id, so it never
 * changes when their name does.
 */
import { LINE_COLORS, type LineColor } from '@unlease/design/colors';

/** Every pigment but grey, which reads as « no colour ». */
const PIGMENTS = LINE_COLORS.filter(color => color !== 'grey');

/** The pigment a contact without a photo wears. */
export function avatarColor(id: string): LineColor {
  let hash = 0;
  for (const char of id) hash = (Math.imul(hash, 31) + char.charCodeAt(0)) % 2_147_483_647;
  return PIGMENTS[Math.abs(hash) % PIGMENTS.length]!;
}
