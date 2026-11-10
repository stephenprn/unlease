/**
 * Drafts Contacts' mark for packages/design/src/mark.ts (`MARK_CONTACT`): the mark's beige card,
 * the same uneven corners and the same small turn, become an address book's card, a person cut out
 * of it (a round head over round shoulders, even-odd) so the pebble shows through. Carnet's card
 * holds a leaf, Pages' sheet writing; Contacts' card holds someone.
 *
 *   node tools/icons/draft_contact_mark.mjs
 */
import { card, f, place } from './markShapes.mjs';

// On the 100 grid of the visible tile, where the mark's card sits (centre 50, 52, turned -6°).
const AT = { x: 50, y: 52, degrees: -6 };
const CARD = { w: 58, h: 66, corners: [0.3, 0.2, 0.34, 0.24].map(k => f(k * 58)) };
/** The person, from the card's centre: the head's centre and radius, the shoulders' radius and where they stand. */
const HEAD = { y: -10, r: 9.2 };
const SHOULDERS = { r: 17.5, base: 21 };

/** A circle as two half arcs (place() turns circular arcs only). */
const circle = (cx, cy, r) => `M${cx - r} ${cy}A${r} ${r} 0 1 1 ${cx + r} ${cy}A${r} ${r} 0 1 1 ${cx - r} ${cy}Z`;
/** The shoulders: half a disc standing on its flat side, its corners eased a little. */
const shoulders = (r, base) => {
  const e = 3;
  return `M${-r + e} ${base}Q${-r} ${base} ${-r} ${base - e}A${r} ${r} 0 0 1 ${r} ${base - e}Q${r} ${base} ${r - e} ${base}Z`;
};

const body = place(card(CARD.w, CARD.h, CARD.corners), AT);
const person = place(circle(0, HEAD.y, HEAD.r), AT) + place(shoulders(SHOULDERS.r, SHOULDERS.base), AT);

console.log(`export const MARK_CONTACT =\n  '${body}${person}';`);
