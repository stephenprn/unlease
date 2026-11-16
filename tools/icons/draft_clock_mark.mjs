/**
 * Drafts Clock's mark for packages/design/src/mark.ts (`MARK_CLOCK`): the mark's beige card, the same
 * uneven corners and the same small turn, holding an alarm clock cut out of it (even-odd), so the
 * pebble shows through: its dial as a ring, the two bells over it, its two feet under it, and its
 * hands at seven o'clock, the hour an alarm rings. The ring's middle is the card's beige again, and
 * the hands are cut out of it, drawn as one outline, since even-odd would fill again where two shapes
 * overlap; bells, feet and ring keep a gap between them for the same reason. The strokes are as wide
 * as Pages' lines, so the five marks weigh the same. Carnet's card holds a leaf, Pages' sheet writing,
 * Contacts' card someone, Agenda's card days; Clock's card holds the morning's alarm.
 *
 *   node tools/icons/draft_clock_mark.mjs
 */
import { card, f, place } from './markShapes.mjs';

// On the 100 grid of the visible tile, where the mark's card sits (centre 50, 52, turned -6°).
const AT = { x: 50, y: 52, degrees: -6 };
const CARD = { w: 58, h: 66, corners: [0.3, 0.2, 0.34, 0.24].map(k => f(k * 58)) };
/** The dial: a ring a little below the card's middle, leaving the bells room above it. */
const DIAL = { cy: 3.5, r: 18.6, ring: 4.4 };
/** What stands apart from the ring, and how far. */
const GAP = 2.7;
/** The bells: domes over the dial, 44° each side of twelve, their flat side towards it. */
const BELL = { degrees: 44, r: 7.6, height: 0.95 };
/** The feet: short bars under the dial, 143° each side of twelve. */
const FOOT = { degrees: 143, length: 4.6, width: 4.3 };
/** The hands, from the centre: the minute hand to twelve, the hour hand to seven (210° clockwise from twelve). */
const HANDS = { minute: 10, hour: 7.2, width: 4.3, hourDegrees: 210 };

/** A circle as two half arcs (place() turns circular arcs only). */
const circle = (cx, cy, r) => `M${f(cx - r)} ${f(cy)}A${r} ${r} 0 1 1 ${f(cx + r)} ${f(cy)}A${r} ${r} 0 1 1 ${f(cx - r)} ${f(cy)}Z`;

/**
 * Both hands as one outline (two bars with round ends meeting at the centre, a round join on the
 * outer side, a sharp corner on the inner one), so nothing inside the dial overlaps.
 */
function hands() {
  const r = HANDS.width / 2;
  const c = [0, DIAL.cy];
  const turn = degrees => [Math.sin((degrees * Math.PI) / 180), -Math.cos((degrees * Math.PI) / 180)];
  const a = turn(0);
  const b = turn(HANDS.hourDegrees);
  // Each hand's right-hand normal on the screen (y down): the bar's east side for the minute hand.
  const right = ([x, y]) => [-y, x];
  const na = right(a);
  const nb = right(b);
  const add = (p, q, k = 1) => [p[0] + q[0] * k, p[1] + q[1] * k];
  const tipA = add(c, a, HANDS.minute);
  const tipB = add(c, b, HANDS.hour);
  // The inner corner: the minute hand's west side meets the hour hand's north-west side.
  const p0 = add(c, na, -r);
  const p1 = add(c, nb, r);
  const det = a[0] * -b[1] - a[1] * -b[0];
  const t = ((p1[0] - p0[0]) * -b[1] - (p1[1] - p0[1]) * -b[0]) / det;
  const inner = add(p0, a, t);
  const pt = ([x, y]) => `${f(x)} ${f(y)}`;
  return [
    `M${pt(add(c, na, r))}`,
    `L${pt(add(tipA, na, r))}`,
    `A${r} ${r} 0 0 0 ${pt(add(tipA, na, -r))}`,
    `L${pt(inner)}`,
    `L${pt(add(tipB, nb, r))}`,
    `A${r} ${r} 0 0 0 ${pt(add(tipB, nb, -r))}`,
    `L${pt(add(c, nb, -r))}`,
    `A${r} ${r} 0 0 0 ${pt(add(c, na, r))}`,
    'Z',
  ].join('');
}

/** A bell: a dome standing GAP off the ring, turned `degrees` from twelve around the dial's centre. */
function bell(degrees) {
  const d = DIAL.r + GAP;
  const { r } = BELL;
  const rise = f(-d - r * BELL.height * 1.1);
  return place(`M${-r} ${-d}C${-r} ${rise} ${r} ${rise} ${r} ${-d}Z`, { x: 0, y: DIAL.cy, degrees });
}

/** A foot: a bar with round ends standing GAP off the ring, turned `degrees` from twelve. */
function foot(degrees) {
  const r = FOOT.width / 2;
  const from = DIAL.r + GAP;
  const to = from + FOOT.length;
  return place(`M${-r} ${-from}L${-r} ${-to}A${r} ${r} 0 0 1 ${r} ${-to}L${r} ${-from}A${r} ${r} 0 0 1 ${-r} ${-from}Z`, { x: 0, y: DIAL.cy, degrees });
}

const body = place(card(CARD.w, CARD.h, CARD.corners), AT);
// The ring: its outer circle cut out, its inner one filled again by even-odd.
const ring = place(circle(0, DIAL.cy, DIAL.r) + circle(0, DIAL.cy, DIAL.r - DIAL.ring), AT);
// Inside the ring's middle, even-odd cuts them out again: the hands show the pebble.
const both = place(hands(), AT);
const bells = place(bell(-BELL.degrees) + bell(BELL.degrees), AT);
const feet = place(foot(-FOOT.degrees) + foot(FOOT.degrees), AT);

console.log(`export const MARK_CLOCK =\n  '${body}${ring}${both}${bells}${feet}';`);
