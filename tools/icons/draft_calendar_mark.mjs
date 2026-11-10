/**
 * Drafts Agenda's mark for packages/design/src/mark.ts (`MARK_CALENDAR`): the mark's beige card,
 * the same uneven corners and the same small turn, become a calendar's page: a band across its top
 * (a slit cut out under it), and two rows of three days cut out below (even-odd), one of them a
 * round day, the one marked, so the pebble shows through. Carnet's card holds a leaf, Pages' sheet
 * writing, Contacts' card someone; Agenda's card holds days.
 *
 *   node tools/icons/draft_calendar_mark.mjs
 */
import { card, f, place } from './markShapes.mjs';

// On the 100 grid of the visible tile, where the mark's card sits (centre 50, 52, turned -6°).
const AT = { x: 50, y: 52, degrees: -6 };
const CARD = { w: 58, h: 66, corners: [0.3, 0.2, 0.34, 0.24].map(k => f(k * 58)) };
/** The slit under the band, from the card's centre. */
const SLIT = { y: -15, w: 40, h: 3.6 };
/** The days: two rows of three squares, their size, gap and where the first row stands. */
const DAY = { size: 9, gap: 4.5, top: -6 };

/** A rounded rectangle centred on (cx, cy). */
const rounded = (cx, cy, w, h, r) => {
  const x = cx - w / 2;
  const y = cy - h / 2;
  return `M${f(x + r)} ${f(y)}H${f(x + w - r)}A${r} ${r} 0 0 1 ${f(x + w)} ${f(y + r)}V${f(y + h - r)}A${r} ${r} 0 0 1 ${f(x + w - r)} ${f(y + h)}H${f(x + r)}A${r} ${r} 0 0 1 ${f(x)} ${f(y + h - r)}V${f(y + r)}A${r} ${r} 0 0 1 ${f(x + r)} ${f(y)}Z`;
};
/** A circle as two half arcs (place() turns circular arcs only). */
const circle = (cx, cy, r) => `M${f(cx - r)} ${f(cy)}A${r} ${r} 0 1 1 ${f(cx + r)} ${f(cy)}A${r} ${r} 0 1 1 ${f(cx - r)} ${f(cy)}Z`;

const body = place(card(CARD.w, CARD.h, CARD.corners), AT);
const slit = place(rounded(0, SLIT.y, SLIT.w, SLIT.h, SLIT.h / 2), AT);
let days = '';
for (let row = 0; row < 2; row += 1) {
  for (let column = 0; column < 3; column += 1) {
    const cx = (column - 1) * (DAY.size + DAY.gap);
    const cy = DAY.top + DAY.size / 2 + row * (DAY.size + DAY.gap);
    // The day marked: round, the others square-ish.
    days += place(row === 1 && column === 1 ? circle(cx, cy, DAY.size / 2 + 0.6) : rounded(cx, cy, DAY.size, DAY.size, 2.2), AT);
  }
}

console.log(`export const MARK_CALENDAR =\n  '${body}${slit}${days}';`);
