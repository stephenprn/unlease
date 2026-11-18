/**
 * Drafts Wallet's mark for packages/design/src/mark.ts (`MARK_WALLET`): the mark's beige card, the
 * same uneven corners and the same small turn, holding a card wallet cut out of it (even-odd), so the
 * pebble shows through: the wallet's pocket, a thumb's dip in its mouth, and a card half slid out of
 * it, standing a gap above the pocket, its band the card's beige again. The card's foot is hidden in
 * the pocket, so the gap is all that parts them. The cuts are as wide as Pages' lines and Clock's
 * ring, so the six marks weigh the same. Carnet's card holds a leaf, Pages' sheet writing, Contacts'
 * card someone, Agenda's card days, Clock's card the morning's alarm; Wallet's card holds cards.
 *
 *   node tools/icons/draft_wallet_mark.mjs
 */
import { card, f, place } from './markShapes.mjs';

// On the 100 grid of the visible tile, where the mark's card sits (centre 50, 52, turned -6°).
const AT = { x: 50, y: 52, degrees: -6 };
const CARD = { w: 58, h: 66, corners: [0.3, 0.2, 0.34, 0.24].map(k => f(k * 58)) };
/** The pocket, from the card's centre: its width, top and bottom, its corners, and the thumb's dip in its mouth. */
const POCKET = { w: 42, top: -3, bottom: 22, rTop: 3, rBottom: 8, dip: { w: 16, depth: 5 } };
/** The card slid out of the pocket: its width, where its top stands, its corners; its foot is hidden in the pocket. */
const SLID = { w: 32, x: 0, top: -23, r: 4 };
/** What parts the slid card from the pocket. */
const GAP = 2.7;
/** The card's band, the beige left across it, from its top. */
const BAND = { from: 4.6, h: 3.4 };

/** The pocket: its mouth dipping in the middle where a thumb pushes the card out. */
function pocket() {
  const { w, top, bottom, rTop: rt, rBottom: rb, dip } = POCKET;
  const x = w / 2;
  const d = dip.w / 2;
  return (
    `M${-x + rt} ${top}` +
    `L${-d} ${top}` +
    `C${f(-d + dip.w * 0.2)} ${top} ${f(-dip.w * 0.26)} ${top + dip.depth} 0 ${top + dip.depth}` +
    `C${f(dip.w * 0.26)} ${top + dip.depth} ${f(d - dip.w * 0.2)} ${top} ${d} ${top}` +
    `L${x - rt} ${top}A${rt} ${rt} 0 0 1 ${x} ${top + rt}` +
    `L${x} ${bottom - rb}A${rb} ${rb} 0 0 1 ${x - rb} ${bottom}` +
    `L${-x + rb} ${bottom}A${rb} ${rb} 0 0 1 ${-x} ${bottom - rb}` +
    `L${-x} ${top + rt}A${rt} ${rt} 0 0 1 ${-x + rt} ${top}Z`
  );
}

/** The slid card's part out of the pocket: round corners at its top, cut square a gap above the pocket. */
function slid() {
  const { w, x: cx, top, r } = SLID;
  const l = cx - w / 2;
  const rr = cx + w / 2;
  const foot = POCKET.top - GAP;
  return `M${l + r} ${top}L${rr - r} ${top}A${r} ${r} 0 0 1 ${rr} ${top + r}L${rr} ${foot}L${l} ${foot}L${l} ${top + r}A${r} ${r} 0 0 1 ${l + r} ${top}Z`;
}

/** The band: the card's beige again across the slid card, inside it (even-odd fills it back). */
function band() {
  const { w, x: cx, top } = SLID;
  const l = cx - w / 2;
  const y = top + BAND.from;
  return `M${l} ${y}L${l + w} ${y}L${l + w} ${y + BAND.h}L${l} ${y + BAND.h}Z`;
}

const body = place(card(CARD.w, CARD.h, CARD.corners), AT);
const wallet = place(pocket(), AT) + place(slid(), AT);
const stripe = place(band(), AT);

console.log(`export const MARK_WALLET =\n  '${body}${wallet}${stripe}';`);
