/**
 * Drafts Pages' mark for packages/design/src/mark.ts (`MARK_PAGE`): the mark's beige card become a
 * sheet of paper, the same uneven corners and the same small turn, its top right corner folded down
 * (the flap apart from the sheet by a crease, so the pebble shows through as a line), a title and
 * three lines of text cut out of it. Carnet's card holds a leaf; Pages' sheet holds writing.
 *
 *   node tools/icons/draft_page_mark.mjs
 */
import { card, f, place } from './markShapes.mjs';

// On the 100 grid of the visible tile, where the mark's card sits (centre 50, 52, turned -6°).
const AT = { x: 50, y: 52, degrees: -6 };
const SHEET = { w: 56, h: 68, corners: [0.3, 0.34, 0.24].map(k => f(k * 56)) };
/** The folded corner: its side, and the crease between the flap and the sheet. */
const FOLD = { side: 18, crease: 2.6 };
/** The writing, from the sheet's centre: a title, then three lines, the last one short. */
const BAR_X = -SHEET.w / 2 + 10;
const BARS = [
  { y: -16, w: 22, h: 7 },
  { y: -2, w: 36, h: 4.6 },
  { y: 8, w: 36, h: 4.6 },
  { y: 18, w: 23, h: 4.6 },
];

/** The sheet centred on the origin, its top right square of `k` cut away (the fold sits there). */
function sheet(w, h, [a, c, d], k) {
  const x = -w / 2;
  const y = -h / 2;
  return (
    `M${x + a} ${y}H${x + w - k}V${y + k}H${x + w}` +
    `V${y + h - c}A${c} ${c} 0 0 1 ${x + w - c} ${y + h}H${x + d}A${d} ${d} 0 0 1 ${x} ${y + h - d}V${y + a}A${a} ${a} 0 0 1 ${x + a} ${y}Z`
  );
}

/**
 * The flap: the corner folded down onto the sheet (the square's lower left half, its long side
 * the fold), a crease `g` away from the sheet along its two short sides.
 */
function flap(w, h, k, g) {
  const x = w / 2 - k;
  const y = -h / 2;
  return `M${f(x + g)} ${f(y + g)}V${f(y + k - g)}H${f(x + k - g)}Z`;
}

/** A shape drawn about its own centre, at (ox, oy) on the sheet's axes: turned with the sheet, then placed. */
function onSheet(path, ox, oy) {
  const r = (AT.degrees * Math.PI) / 180;
  return place(path, { x: AT.x + ox * Math.cos(r) - oy * Math.sin(r), y: AT.y + ox * Math.sin(r) + oy * Math.cos(r), degrees: AT.degrees });
}

const body = place(sheet(SHEET.w, SHEET.h, SHEET.corners, FOLD.side), AT);
const fold = place(flap(SHEET.w, SHEET.h, FOLD.side, FOLD.crease), AT);
const writing = BARS.map(bar => onSheet(card(bar.w, bar.h, [bar.h / 2, bar.h / 2, bar.h / 2, bar.h / 2]), BAR_X + bar.w / 2, bar.y)).join('');

console.log(`export const MARK_PAGE =\n  '${body}${fold}${writing}';`);
