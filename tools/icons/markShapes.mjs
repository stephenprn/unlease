/**
 * What the marks' drafts share (tools/icons/draft_mark.mjs, draft_drive_mark.mjs): a card with
 * habits-garden's four unequal corners, and a turn-then-move of an absolute path, so the data in
 * packages/design stays plain absolute paths on the 100 grid of the visible tile.
 */

export const f = n => Number(n.toFixed(2));

/** A rectangle centred on the origin, four unequal corners (top-left first, clockwise). */
export function card(w, h, [a, b, c, d]) {
  const x = -w / 2;
  const y = -h / 2;
  return `M${x + a} ${y}H${x + w - b}A${b} ${b} 0 0 1 ${x + w} ${y + b}V${y + h - c}A${c} ${c} 0 0 1 ${x + w - c} ${y + h}H${x + d}A${d} ${d} 0 0 1 ${x} ${y + h - d}V${y + a}A${a} ${a} 0 0 1 ${x + a} ${y}Z`;
}

/** Turns a path `degrees`, then moves it (absolute M H V L C Q A Z only). */
export function place(path, { x, y, degrees }) {
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
