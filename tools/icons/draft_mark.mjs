/**
 * Drafts the Carnet mark's paths for packages/design/src/mark.ts: a beige note card with
 * habits-garden's uneven corners, turned a little, a leaf and its stem cut out of it, so the
 * matcha tile shows through as the leaf. Two colours, and the same path makes the one-colour
 * silhouettes. Shapes are drawn on their own axes, then turned and placed on the 100 grid of
 * the visible tile, so the data is plain absolute paths.
 *
 *   node tools/icons/draft_mark.mjs
 */

const f = n => Number(n.toFixed(2));

/** A rectangle centred on the origin, four unequal corners (top-left first, clockwise). */
function card(w, h, [a, b, c, d]) {
  const x = -w / 2;
  const y = -h / 2;
  return `M${x + a} ${y}H${x + w - b}A${b} ${b} 0 0 1 ${x + w} ${y + b}V${y + h - c}A${c} ${c} 0 0 1 ${x + w - c} ${y + h}H${x + d}A${d} ${d} 0 0 1 ${x} ${y + h - d}V${y + a}A${a} ${a} 0 0 1 ${x + a} ${y}Z`;
}

/**
 * The leaf and its stem as one outline, along the x axis: base at the left, a pointed tip at the
 * right, the upper side fuller near the base and the lower one past the middle, and the stem
 * curving out of the base to a rounded end.
 */
function leafWithStem(len, wid) {
  const h = len / 2;
  const w = wid / 2;
  const tip = -w * 0.24;
  const s = wid * 0.075;
  const r = len * 0.2;
  const end = wid * 0.1;
  return (
    `M${-h} ${-s}` +
    `C${-h * 0.62} ${-w * 1.55} ${h * 0.25} ${-w * 1.62} ${h} ${tip}` +
    `C${h * 0.42} ${w * 1.32} ${-h * 0.5} ${w * 1.5} ${-h} ${s}` +
    `Q${-h - r * 0.45} ${s * 1.4} ${-h - r + s * 0.4} ${end + s * 1.4}` +
    `Q${-h - r - s * 0.8} ${end + s * 1.1} ${-h - r} ${end}` +
    `Q${-h - r * 0.5} ${-s * 0.2} ${-h} ${-s}Z`
  );
}

/** Turns a path `degrees`, then moves it (absolute M H V L C Q A Z only). */
function place(path, { x, y, degrees }) {
  const r = (degrees * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const at = (px, py) => `${f(px * cos - py * sin + x)} ${f(px * sin + py * cos + y)}`;
  const tokens = path.match(/[MHVLCQAZ]|-?\d*\.?\d+(?:e-?\d+)?/g);
  let out = '';
  let cx = 0;
  let cy = 0;
  let i = 0;
  const num = () => Number(tokens[i++]);
  while (i < tokens.length) {
    const op = tokens[i++];
    if (op === 'M' || op === 'L') {
      cx = num();
      cy = num();
      out += `${op}${at(cx, cy)}`;
    } else if (op === 'H') {
      cx = num();
      out += `L${at(cx, cy)}`;
    } else if (op === 'V') {
      cy = num();
      out += `L${at(cx, cy)}`;
    } else if (op === 'C') {
      const p = [num(), num(), num(), num(), num(), num()];
      [cx, cy] = [p[4], p[5]];
      out += `C${at(p[0], p[1])} ${at(p[2], p[3])} ${at(p[4], p[5])}`;
    } else if (op === 'Q') {
      const p = [num(), num(), num(), num()];
      [cx, cy] = [p[2], p[3]];
      out += `Q${at(p[0], p[1])} ${at(p[2], p[3])}`;
    } else if (op === 'A') {
      // Circular corners only: a turn keeps them circular.
      const [rx, ry, rot, large, sweep, ex, ey] = [num(), num(), num(), num(), num(), num(), num()];
      [cx, cy] = [ex, ey];
      out += `A${f(rx)} ${f(ry)} ${rot} ${large} ${sweep} ${at(ex, ey)}`;
    } else if (op === 'Z') {
      out += 'Z';
    }
  }
  return out;
}

// On the 100 grid of the visible tile (the launcher shows 72 of its 108 dp).
const CARD = { w: 58, h: 66, corners: [0.3, 0.2, 0.34, 0.24], at: { x: 50, y: 52, degrees: -6 } };
const LEAF = { len: 40, wid: 21, at: { x: 53.5, y: 47, degrees: -50 } };

const side = Math.min(CARD.w, CARD.h);
const cardPath = place(card(CARD.w, CARD.h, CARD.corners.map(k => f(k * side))), CARD.at);
// The box of the card turned with square corners: the rounded card sits inside it.
const corners = [[-CARD.w / 2, -CARD.h / 2], [CARD.w / 2, -CARD.h / 2], [CARD.w / 2, CARD.h / 2], [-CARD.w / 2, CARD.h / 2]].map(([px, py]) => {
  const r = (CARD.at.degrees * Math.PI) / 180;
  return [px * Math.cos(r) - py * Math.sin(r) + CARD.at.x, px * Math.sin(r) + py * Math.cos(r) + CARD.at.y];
});
const xs = corners.map(([x]) => x);
const ys = corners.map(([, y]) => y);
const bounds = { x: f(Math.min(...xs)), y: f(Math.min(...ys)), width: f(Math.max(...xs) - Math.min(...xs)), height: f(Math.max(...ys) - Math.min(...ys)) };

console.log(`export const MARK_CARD =\n  '${cardPath}${place(leafWithStem(LEAF.len, LEAF.wid), LEAF.at)}';\n`);
console.log(`export const MARK_BOUNDS = { x: ${bounds.x}, y: ${bounds.y}, width: ${bounds.width}, height: ${bounds.height} } as const;`);
