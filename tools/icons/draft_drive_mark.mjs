/**
 * Drafts the drive's mark for packages/design/src/mark.ts (`MARK_DRIVE`): the mark's beige card
 * become a folder, the same uneven corners and the same small turn, its tab up on the left and the
 * fold of its flap cut out, so the pebble shows through as a line. Seafile wears it (its logo and
 * favicon, `servicePictures.ts`): a drive in Carnet's hand, not the notebook's leaf.
 *
 *   node tools/icons/draft_drive_mark.mjs
 */
import { card, place } from './markShapes.mjs';

/**
 * The folder's outline, centred on the origin: a body `w` by `h` with four unequal corners, and a
 * tab rising `th` over its top left, `tw` long, its right side a soft slope down to the body.
 */
function folder(w, h, [a, b, c, d], tw, th, rt) {
  const x = -w / 2;
  const y = -h / 2;
  const slope = th * 1.4;
  return (
    `M${x} ${y - th + rt}A${rt} ${rt} 0 0 1 ${x + rt} ${y - th}H${x + tw}` +
    `C${x + tw + slope * 0.45} ${y - th} ${x + tw + slope * 0.55} ${y} ${x + tw + slope} ${y}` +
    `H${x + w - b}A${b} ${b} 0 0 1 ${x + w} ${y + b}V${y + h - c}A${c} ${c} 0 0 1 ${x + w - c} ${y + h}H${x + d}A${d} ${d} 0 0 1 ${x} ${y + h - d}V${y - th + rt}Z`
  );
}

// On the 100 grid of the visible tile, where the mark's card sits (centre 50, 52, turned -6°).
const AT = { x: 50, y: 55, degrees: -6 };
const BODY = { w: 66, h: 48, corners: [0, 9, 12, 9] };
const TAB = { w: 22, h: 9, r: 4.5 };
// The flap's fold: a groove across the body, short of both sides so the folder stays one piece.
const FOLD = { inset: 8, y: -BODY.h / 2 + 11, h: 5.5 };

const body = place(folder(BODY.w, BODY.h, BODY.corners, TAB.w, TAB.h, TAB.r), AT);
// The groove is drawn centred on the origin, so its centre turns with the folder before it moves.
const r = (AT.degrees * Math.PI) / 180;
const centre = FOLD.y + FOLD.h / 2;
const groove = place(card(BODY.w - FOLD.inset * 2, FOLD.h, [FOLD.h / 2, FOLD.h / 2, FOLD.h / 2, FOLD.h / 2]), {
  x: AT.x - centre * Math.sin(r),
  y: AT.y + centre * Math.cos(r),
  degrees: AT.degrees,
});

console.log(`export const MARK_DRIVE =\n  '${body}${groove}';`);
