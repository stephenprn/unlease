/**
 * Onde: Carnet's own icons, drawn here as data on a 24 grid. One even line (GLYPH_STROKE) with round
 * ends; every straight line takes one soft wave, every frame swells a little like a cushion, large
 * circles breathe, dots follow the wave. Letters stay typographic. `build_glyphs.mjs` writes them to
 * packages/design/src/glyphs.ts as a line form (stroked path, filled path) and, for the eleven glyphs a
 * control shows selected, a solid form.
 */

/* ------------------------------------------------------------------ paths */

const r2 = v => {
  const n = Math.round(v * 100) / 100;
  return Object.is(n, -0) ? '0' : String(n);
};

/** A path as absolute M, L, C and Z commands, so it can be moved, turned and joined. */
class Path {
  constructor(cmds = []) {
    this.cmds = cmds;
  }
  static of(...parts) {
    return new Path(parts.flatMap(part => (part instanceof Path ? part.cmds : parse(part).cmds)));
  }
  map(fn) {
    return new Path(
      this.cmds.map(([op, ...v]) => {
        const out = [op];
        for (let i = 0; i < v.length; i += 2) out.push(...fn(v[i], v[i + 1]));
        return out;
      }),
    );
  }
  toString() {
    return this.cmds.map(([op, ...v]) => op + v.map(r2).join(' ')).join('');
  }
}

/** Absolute M, L, H, V, C, S, Q and Z only (the drawings below never need more), as M/L/C/Z. */
function parse(d) {
  const tokens = d.match(/[MLHVCSQZ]|-?\d*\.?\d+(?:e-?\d+)?/gi);
  const cmds = [];
  let x = 0, y = 0, sx = 0, sy = 0, op = null, i = 0, lastC = null;
  const num = () => Number(tokens[i++]);
  while (i < tokens.length) {
    if (/[A-Za-z]/.test(tokens[i])) op = tokens[i++];
    if (op !== op.toUpperCase()) throw new Error(`relative command ${op} in ${d}`);
    switch (op) {
      case 'M': x = num(); y = num(); sx = x; sy = y; cmds.push(['M', x, y]); op = 'L'; lastC = null; break;
      case 'L': x = num(); y = num(); cmds.push(['L', x, y]); lastC = null; break;
      case 'H': x = num(); cmds.push(['L', x, y]); lastC = null; break;
      case 'V': y = num(); cmds.push(['L', x, y]); lastC = null; break;
      case 'C': { const a = num(), b = num(), c = num(), e = num(); x = num(); y = num(); cmds.push(['C', a, b, c, e, x, y]); lastC = [c, e]; break; }
      case 'S': { const a = lastC ? 2 * x - lastC[0] : x, b = lastC ? 2 * y - lastC[1] : y; const c = num(), e = num(); const nx = num(), ny = num(); cmds.push(['C', a, b, c, e, nx, ny]); x = nx; y = ny; lastC = [c, e]; break; }
      case 'Q': { const qx = num(), qy = num(), nx = num(), ny = num(); cmds.push(['C', x + (2 / 3) * (qx - x), y + (2 / 3) * (qy - y), nx + (2 / 3) * (qx - nx), ny + (2 / 3) * (qy - ny), nx, ny]); x = nx; y = ny; lastC = null; break; }
      case 'Z': cmds.push(['Z']); x = sx; y = sy; lastC = null; break;
      default: throw new Error(`unsupported ${op} in ${d}`);
    }
  }
  return new Path(cmds);
}

/* ------------------------------------------------------------- the shapes */

const K = 0.5523;

/** A straight line, for strokes too short to wave. */
const line = (x1, y1, x2, y2) => new Path([['M', x1, y1], ['L', x2, y2]]);

/** A line from (x1,y1) to (x2,y2) as soft bumps on alternate sides: two halves make one wave, one half a bow. */
function wave(x1, y1, x2, y2, amp = 0.6, halves = 2) {
  const len = Math.hypot(x2 - x1, y2 - y1);
  const nx = -(y2 - y1) / len, ny = (x2 - x1) / len;
  const dx = (x2 - x1) / halves, dy = (y2 - y1) / halves;
  const cmds = [['M', x1, y1]];
  for (let i = 0; i < halves; i++) {
    const sx = x1 + dx * i, sy = y1 + dy * i, s = ((i % 2 ? -1 : 1) * amp * 4) / 3;
    cmds.push(['C', sx + dx / 3 + nx * s, sy + dy / 3 + ny * s, sx + (2 * dx) / 3 + nx * s, sy + (2 * dy) / 3 + ny * s, sx + dx, sy + dy]);
  }
  return new Path(cmds);
}
const bow = (x1, y1, x2, y2, amp = 0.35) => wave(x1, y1, x2, y2, amp, 1);

/** A rounded rectangle whose sides swell outward a little, like a cushion; closed. */
function pillow(x, y, w, h, r, swell = 0.45) {
  // A side swells in proportion to its straight length, so a capsule's round ends stay round.
  const kw = ((swell * 4) / 3) * Math.min(1, Math.max(0, (w - 2 * r) / 6)), kh = ((swell * 4) / 3) * Math.min(1, Math.max(0, (h - 2 * r) / 6));
  const sw = (w - 2 * r) / 3, sh = (h - 2 * r) / 3, c = r * K;
  return new Path([
    ['M', x + r, y],
    ['C', x + r + sw, y - kw, x + w - r - sw, y - kw, x + w - r, y],
    ['C', x + w - r + c, y, x + w, y + r - c, x + w, y + r],
    ['C', x + w + kh, y + r + sh, x + w + kh, y + h - r - sh, x + w, y + h - r],
    ['C', x + w, y + h - r + c, x + w - r + c, y + h, x + w - r, y + h],
    ['C', x + w - r - sw, y + h + kw, x + r + sw, y + h + kw, x + r, y + h],
    ['C', x + r - c, y + h, x, y + h - r + c, x, y + h - r],
    ['C', x - kh, y + h - r - sh, x - kh, y + r + sh, x, y + r],
    ['C', x, y + r - c, x + r - c, y, x + r, y],
    ['Z'],
  ]);
}

/** A circle as four cubic quarters. */
function circle(cx, cy, r) {
  const c = r * K;
  return new Path([
    ['M', cx + r, cy],
    ['C', cx + r, cy + c, cx + c, cy + r, cx, cy + r],
    ['C', cx - c, cy + r, cx - r, cy + c, cx - r, cy],
    ['C', cx - r, cy - c, cx - c, cy - r, cx, cy - r],
    ['C', cx + c, cy - r, cx + r, cy - c, cx + r, cy],
    ['Z'],
  ]);
}

/** Closed smooth curve through points (Catmull-Rom, as cubics). */
function smoothLoop(pts) {
  const n = pts.length;
  const cmds = [['M', ...pts[0]]];
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    cmds.push(['C', p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6, p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]]);
  }
  cmds.push(['Z']);
  return new Path(cmds);
}

/** A circle that breathes: its radius rises and falls a little, `lobes` times round. */
function breathe(cx, cy, r, amp = 0.3, lobes = 6, phase = 0) {
  const n = 36, pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r + amp * Math.sin(lobes * a + phase);
    pts.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]);
  }
  return smoothLoop(pts);
}

/** An arc from a0 to a1 degrees (clockwise on screen when a1 > a0), as cubics. */
function arc(cx, cy, r, a0, a1) {
  const steps = Math.max(1, Math.ceil(Math.abs(a1 - a0) / 60));
  const da = (a1 - a0) / steps, rad = a => (a * Math.PI) / 180;
  const k = (4 / 3) * Math.tan(rad(da) / 4);
  const pt = a => [cx + r * Math.cos(rad(a)), cy + r * Math.sin(rad(a))];
  const cmds = [['M', ...pt(a0)]];
  for (let i = 0; i < steps; i++) {
    const s = a0 + da * i, e = s + da;
    const [sx, sy] = pt(s), [ex, ey] = pt(e);
    cmds.push(['C', sx - k * r * Math.sin(rad(s)), sy + k * r * Math.cos(rad(s)), ex + k * r * Math.sin(rad(e)), ey - k * r * Math.cos(rad(e)), ex, ey]);
  }
  return new Path(cmds);
}

/** A polygon or polyline whose corners are rounded by `r` (quarter-ish fillets), straight or bowed edges. */
function soft(points, { closed = true, r = 1.2, swell = 0 } = {}) {
  const n = points.length;
  const at = i => points[(i + n) % n];
  const cmds = [];
  const corner = i => {
    const p = at(i), a = at(i - 1), b = at(i + 1);
    const la = Math.hypot(a[0] - p[0], a[1] - p[1]), lb = Math.hypot(b[0] - p[0], b[1] - p[1]);
    const ra = Math.min(r, la / 2.2), rb = Math.min(r, lb / 2.2);
    const s = [p[0] + ((a[0] - p[0]) * ra) / la, p[1] + ((a[1] - p[1]) * ra) / la];
    const e = [p[0] + ((b[0] - p[0]) * rb) / lb, p[1] + ((b[1] - p[1]) * rb) / lb];
    return { s, e, p };
  };
  const edge = (from, to) => {
    if (!swell) return ['L', ...to];
    const len = Math.hypot(to[0] - from[0], to[1] - from[1]);
    const nx = (to[1] - from[1]) / len, ny = -(to[0] - from[0]) / len;
    const k = (swell * 4) / 3;
    return ['C', from[0] + (to[0] - from[0]) / 3 + nx * k, from[1] + (to[1] - from[1]) / 3 + ny * k, from[0] + ((to[0] - from[0]) * 2) / 3 + nx * k, from[1] + ((to[1] - from[1]) * 2) / 3 + ny * k, ...to];
  };
  if (closed) {
    const cs = points.map((_, i) => corner(i));
    cmds.push(['M', ...cs[0].e]);
    for (let i = 1; i <= n; i++) {
      const c = cs[i % n];
      cmds.push(edge(cs[i - 1].e, c.s));
      cmds.push(['C', c.s[0] + (c.p[0] - c.s[0]) * 0.55, c.s[1] + (c.p[1] - c.s[1]) * 0.55, c.e[0] + (c.p[0] - c.e[0]) * 0.55, c.e[1] + (c.p[1] - c.e[1]) * 0.55, ...c.e]);
    }
    cmds.push(['Z']);
  } else {
    cmds.push(['M', ...points[0]]);
    let from = points[0];
    for (let i = 1; i < n - 1; i++) {
      const c = corner(i);
      cmds.push(edge(from, c.s));
      cmds.push(['C', c.s[0] + (c.p[0] - c.s[0]) * 0.55, c.s[1] + (c.p[1] - c.s[1]) * 0.55, c.e[0] + (c.p[0] - c.e[0]) * 0.55, c.e[1] + (c.p[1] - c.e[1]) * 0.55, ...c.e]);
      from = c.e;
    }
    cmds.push(edge(from, points[n - 1]));
  }
  return new Path(cmds);
}

/** An arrowhead: two arms meeting at (tx,ty), pointing along `deg`, its tip softly rounded. */
function head(tx, ty, deg, arm = 5.4) {
  const rad = (deg * Math.PI) / 180;
  const b = [tx - Math.cos(rad) * arm * 0.72, ty - Math.sin(rad) * arm * 0.72];
  const s = [-Math.sin(rad) * arm * 0.72, Math.cos(rad) * arm * 0.72];
  return soft([[b[0] + s[0], b[1] + s[1]], [tx, ty], [b[0] - s[0], b[1] - s[1]]], { closed: false, r: 0.9 });
}

/** Turn a path by `deg` about (cx, cy), or move it. */
const turn = (p, deg, cx = 12, cy = 12) => {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return p.map((x, y) => [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c]);
};
const move = (p, dx, dy) => p.map((x, y) => [x + dx, y + dy]);
const flipX = p => p.map((x, y) => [24 - x, y]);

/* ------------------------------------------- outlines (for cut-out holes) */

function sampleCubic(p0, c1, c2, p1, n) {
  const out = [];
  for (let i = 1; i <= n; i++) {
    const t = i / n, u = 1 - t;
    out.push([u * u * u * p0[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * p1[0], u * u * u * p0[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * p1[1]]);
  }
  return out;
}

/** The outline of an open, smooth stroke of `width`, with round ends: used to cut a line out of a solid shape. */
function outline(path, width = 1.9) {
  let pts = [];
  let cur = null;
  for (const [op, ...v] of path.cmds) {
    if (op === 'M') { cur = [v[0], v[1]]; pts.push(cur); }
    else if (op === 'L') { const end = [v[0], v[1]]; for (let i = 1; i <= 8; i++) pts.push([cur[0] + ((end[0] - cur[0]) * i) / 8, cur[1] + ((end[1] - cur[1]) * i) / 8]); cur = end; }
    else if (op === 'C') { pts.push(...sampleCubic(cur, [v[0], v[1]], [v[2], v[3]], [v[4], v[5]], 16)); cur = [v[4], v[5]]; }
  }
  pts = pts.filter((p, i) => i === 0 || Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) > 0.01);
  const h = width / 2, left = [], right = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const nx = -(b[1] - a[1]) / len, ny = (b[0] - a[0]) / len;
    left.push([pts[i][0] + nx * h, pts[i][1] + ny * h]);
    right.push([pts[i][0] - nx * h, pts[i][1] - ny * h]);
  }
  const cap = (from, to, center) => {
    // A half circle from `from` to `to` around `center`, bulging away from the stroke.
    const a0 = Math.atan2(from[1] - center[1], from[0] - center[0]);
    const steps = 6, out = [];
    for (let i = 1; i <= steps; i++) {
      const a = a0 - (Math.PI * i) / steps;
      out.push([center[0] + h * Math.cos(a), center[1] + h * Math.sin(a)]);
    }
    out[out.length - 1] = to;
    return out;
  };
  const ring = [...left, ...cap(left[left.length - 1], right[right.length - 1], pts[pts.length - 1]), ...right.slice().reverse(), ...cap(right[0], left[0], pts[0])];
  return new Path([['M', ...ring[0]], ...ring.slice(1).map(p => ['L', ...p]), ['Z']]);
}

/* ---------------------------------------------------------------- the set */

const S = (...parts) => Path.of(...parts);
/** `a` then `b` from where `a` ends (b's own start dropped), closed: one filled outline from two strokes. */
const closeWith = (a, b) => new Path([...S(a).cmds, ...S(b).cmds.slice(1), ['Z']]);
const dots = list => Path.of(...list.map(([x, y, r = 1.5]) => circle(x, y, r)));
const form = (stroke, fill = null) => ({ stroke: stroke ? S(...[].concat(stroke)).toString() : null, fill: fill ? S(...[].concat(fill)).toString() : null });

// Shapes shared by several glyphs.
const MENU = [wave(4, 6.5, 20, 6.5, 0.75), wave(4, 12, 20, 12, 0.75), wave(4, 17.5, 14.6, 17.5, 0.75)];
const BELL_WIDE = 'M4.2 16.8C5.6 16.6 6.2 15.6 6.2 14.2V11.4C6.2 7.8 8.7 5 12 5C15.3 5 17.8 7.8 17.8 11.4V14.2C17.8 15.6 18.4 16.6 19.8 16.8';
const BELL_RIM = wave(4.2, 16.8, 19.8, 16.8, 0.55);
const BELL_BITS = [line(12, 2.9, 12, 5), 'M10.3 19.7C11.2 20.7 12.8 20.7 13.7 19.7'];
const BELL_NARROW = 'M5 16.6C6.2 16.4 6.8 15.6 6.8 14.2V11.6C6.8 8.2 9.1 5.4 12 5.4C14.9 5.4 17.2 8.2 17.2 11.6V14.2C17.2 15.6 17.8 16.4 19 16.6';
const BELL_NARROW_RIM = wave(5, 16.6, 19, 16.6, 0.5);
const RINGING = ['M3.2 10.6C3.2 8.6 3.9 6.8 5.1 5.4', 'M20.8 10.6C20.8 8.6 20.1 6.8 18.9 5.4'];
const SLASH = wave(3.8, 3.8, 20.2, 20.2, 0.45);
// A label's own tag (design/emblems LABEL_TAG_PATH, the cut-out a label wears) in one line: pointed
// at the left, its eyelet near the point, a notch cut into its right end; the long sides swell a little.
const TAG = soft([[2.6, 12], [6.6, 5.7], [21.4, 5.3], [17.9, 12], [21.4, 18.7], [6.6, 18.3]], { r: 1.1, swell: 0.3 });
const TAG_EYELET = [8.3, 12];
const PAGE = 'M13.8 2.8H7.2C5.8 2.8 4.8 3.8 4.8 5.2C4.6 9.6 4.6 14.4 4.8 18.8C4.8 20.2 5.8 21.2 7.2 21.2H16.8C18.2 21.2 19.2 20.2 19.2 18.8C19.4 15.2 19.4 11.6 19.2 8.2Z';
const PAGE_FOLD = 'M13.8 3V6.6C13.8 7.6 14.4 8.2 15.4 8.2H19';
const BOX = pillow(4, 4, 16, 16, 4.4, 0.55);
const CIRCLE = breathe(12, 12, 8.6, 0.3);
const CHEV_RIGHT = 'M9 5C11.6 7.2 14 9.4 16 12C14 14.6 11.6 16.8 9 19';
const CHECK = 'M5 12.6C6.6 13.9 8 15.4 9.4 17C12.2 13.2 15.4 9.8 19 7.2';
const LINK_LOOPS = [turn(pillow(2.4, 8.7, 11.2, 6.6, 3.3, 0.45), -42), turn(pillow(10.4, 8.7, 11.2, 6.6, 3.3, 0.45), -42)];
const CLOUD = 'M7.4 18.6C5 18.6 3.2 16.8 3.2 14.5C3.2 12.4 4.8 10.6 6.9 10.4C7.4 7.2 10 4.8 13.2 4.8C16.6 4.8 19.4 7.6 19.4 11V11.6C20.4 12.4 21 13.6 21 15C21 17 19.4 18.6 17.4 18.6';
const CLOUD_FLOOR = wave(17.4, 18.6, 7.4, 18.6, 0.35);
const PIN_UP = {
  cap: pillow(8.4, 3, 7.2, 3.4, 1.7, 0.2),
  body: 'M10.2 6.4C10.2 8.4 9.8 10.4 8.6 12.2H15.4C14.2 10.4 13.8 8.4 13.8 6.4',
  bodyClosed: 'M10.2 6.2C10.2 8.3 9.8 10.4 8.6 12.2H15.4C14.2 10.4 13.8 8.3 13.8 6.2Z',
  plate: wave(5.4, 12.6, 18.6, 12.6, 0.4),
  needle: line(12, 13, 12, 20.8),
};
const pinTurn = p => turn(typeof p === 'string' ? parse(p) : p, 45);
const ARCHIVE_BOX = 'M5.2 9.2C5 12.2 5 15 5.3 17.6C5.5 19 6.5 19.9 7.9 20C10.6 20.2 13.4 20.2 16.1 20C17.5 19.9 18.5 19 18.7 17.6C19 15 19 12.2 18.8 9.2';
const TRASH_BIN = 'M6 6.9C6.2 10.8 6.5 14.6 7 18.3C7.2 19.5 8.1 20.4 9.3 20.4H14.7C15.9 20.4 16.8 19.5 17 18.3C17.5 14.6 17.8 10.8 18 6.9';
const TRASH_HANDLE = 'M9.4 6.4V5C9.4 4.1 10.1 3.4 11 3.4H13C13.9 3.4 14.6 4.1 14.6 5V6.4';
const H = 'M3.6 6V18M11.2 6V18M3.6 12H11.2';

export const GLYPH_STROKE = 1.9;

export const ICONS = {
  menu: { line: form(MENU) },
  search: { line: form([breathe(10.4, 10.4, 6.4, 0.3), bow(15.3, 15.3, 20.4, 20.4, 0.4)]) },
  close: { line: form([wave(5.6, 5.6, 18.4, 18.4, 0.55), wave(18.4, 5.6, 5.6, 18.4, 0.55)]) },
  plus: { line: form([wave(12, 4.4, 12, 19.6, 0.75), wave(4.4, 12, 19.6, 12, 0.75)]) },
  // Alone, the plus's deep wave reads as a tilde: the minus keeps a shallow one.
  minus: { line: form([wave(4.4, 12, 19.6, 12, 0.3)]) },
  check: { line: form(CHECK) },
  back: { line: form([wave(19.6, 12, 5.2, 12, 0.7), 'M10.8 6C8.6 8 6.6 10 4.8 12C6.6 14 8.6 16 10.8 18']) },
  more: { line: form(null, dots([[11.2, 5.2, 1.6], [12.8, 12, 1.6], [11.2, 18.8, 1.6]])) },
  pin: {
    line: form([pinTurn(PIN_UP.cap), pinTurn(PIN_UP.body), pinTurn(PIN_UP.plate), pinTurn(PIN_UP.needle)]),
    solid: form([pinTurn(PIN_UP.plate), pinTurn(PIN_UP.needle)], [pinTurn(PIN_UP.cap), pinTurn(PIN_UP.bodyClosed)]),
  },
  pinOff: { line: form([pinTurn(PIN_UP.cap), pinTurn(PIN_UP.body), pinTurn(PIN_UP.plate), pinTurn(PIN_UP.needle), SLASH]) },
  bell: {
    line: form([BELL_NARROW, BELL_NARROW_RIM, ...RINGING, line(12, 3.2, 12, 5.4), 'M10.4 19.6C11.3 20.6 12.7 20.6 13.6 19.6']),
    solid: form([...RINGING, line(12, 3.2, 12, 5.4), 'M10.4 19.6C11.3 20.6 12.7 20.6 13.6 19.6'], closeWith(BELL_NARROW, wave(19, 16.6, 5, 16.6, 0.5))),
  },
  bellPlus: { line: form([BELL_WIDE, BELL_RIM, ...BELL_BITS]) },
  bellOff: { line: form([BELL_WIDE, BELL_RIM, ...BELL_BITS, SLASH]) },
  archive: {
    line: form([pillow(3.4, 4.4, 17.2, 4.6, 1.9, 0.35), ARCHIVE_BOX, wave(9.4, 13, 14.6, 13, 0.45)]),
    solid: form(null, [pillow(3.4, 4.4, 17.2, 4.6, 1.9, 0.35), S(ARCHIVE_BOX, 'Z'), outline(wave(9.4, 13, 14.6, 13, 0.45), 1.9)]),
  },
  unarchive: { line: form([pillow(4.4, 11.2, 15.2, 9, 2.6, 0.35), wave(12, 16.2, 12, 3.6, 0.35), head(12, 3.4, -90)]) },
  trash: {
    line: form([wave(3.8, 6.6, 20.2, 6.6, 0.55), TRASH_HANDLE, TRASH_BIN, wave(10.2, 10, 10.2, 16.8, 0.4), wave(13.8, 10, 13.8, 16.8, 0.4)]),
    solid: form([wave(3.8, 6.6, 20.2, 6.6, 0.55), TRASH_HANDLE], [S(TRASH_BIN, 'Z'), outline(wave(10.2, 10, 10.2, 16.8, 0.4), 1.7), outline(wave(13.8, 10, 13.8, 16.8, 0.4), 1.7)]),
  },
  restore: { line: form(['M3.8 9.8C5 6.4 8.4 4.4 12.2 4.6C16.6 4.8 20 8.4 20 12.6C20 16.8 16.6 20.2 12.4 20.2C9.6 20.2 7.2 18.8 5.8 16.6', 'M8.4 9.9C6.8 9.9 5.4 9.8 3.8 9.8C3.8 8.2 3.7 6.8 3.7 5.2']) },
  undo: {
    line: form([wave(3.6, 8.2, 15.4, 8.2, 0.45), arc(15.4, 12.7, 4.5, -90, 90), wave(15.4, 17.2, 8, 17.2, 0.35), head(3.4, 8.2, 180)]),
    solid: form([wave(5.6, 8.2, 15.4, 8.2, 0.45), arc(15.4, 12.7, 4.5, -90, 90), wave(15.4, 17.2, 8, 17.2, 0.35)], soft([[2.8, 8.2], [8, 3.6], [8, 12.8]], { r: 1.1 })),
  },
  palette: { line: form('M12 3.4C7.2 3.4 3.4 7.2 3.4 12C3.4 16.8 7.2 20.6 12 20.6C13.4 20.6 14 19.6 13.6 18.6C13.2 17.4 13.8 16.2 15.2 16.2H17.4C19.2 16.2 20.6 14.8 20.6 13C20.6 7.6 16.8 3.4 12 3.4Z', dots([[7.8, 11.4, 1.35], [9.6, 7.6, 1.35], [14.2, 7.4, 1.35], [16.8, 10.8, 1.35]])) },
  tag: { line: form([TAG, circle(...TAG_EYELET, 1.4)]), solid: form(null, [TAG, circle(...TAG_EYELET, 1.6)]) },
  image: { line: form([pillow(3.5, 4.6, 17, 14.8, 3, 0.5), 'M3.9 16.2C6.4 13.4 8.6 11.6 10.6 12.6C12.4 13.5 13.4 15.6 15.2 14.6C16.8 13.7 18.4 13.6 20.1 15.2', circle(15.4, 8.9, 1.7)]) },
  camera: { line: form([pillow(3, 7.2, 18, 12.6, 3.2, 0.4), 'M8.4 7.2C8.8 5.8 9.6 4.8 10.8 4.8H13.2C14.4 4.8 15.2 5.8 15.6 7.2', circle(12, 13.4, 3.4)]) },
  link: { line: form(LINK_LOOPS) },
  checklist: { line: form(['M3.5 6.9C4.4 7.4 5 8.1 5.5 8.8C6.6 7 7.6 5.6 9 4.6', wave(11.6, 6.7, 20.4, 6.7, 0.55), wave(11.6, 12.2, 20.4, 12.2, 0.55), wave(11.6, 17.8, 20.4, 17.8, 0.55)], dots([[6.1, 12.2, 1.45], [6.1, 17.8, 1.45]])) },
  note: {
    line: form([pillow(4.6, 3.5, 14.8, 17, 3.4, 0.5), wave(8.4, 9.4, 15.6, 9.4, 0.5), wave(8.4, 13.4, 13.4, 13.4, 0.5)]),
    solid: form(null, [pillow(3.65, 2.55, 16.7, 18.9, 4.35, 0.5), outline(wave(8.4, 9.4, 15.6, 9.4, 0.5), 1.8), outline(wave(8.4, 13.4, 13.4, 13.4, 0.5), 1.8)]),
  },
  edit: { line: form(['M14.6 5.4C16.1 6.6 17.4 7.9 18.6 9.4L9.2 18.8L4.8 19.2L5.2 14.8L14.6 5.4Z', bow(12.6, 7.4, 16.6, 11.4, 0.35)]) },
  box: { line: form(BOX) },
  boxChecked: { line: form([BOX, 'M7.8 12.4C9 13.3 10 14.3 10.9 15.4C12.6 12.8 14.4 10.6 16.6 8.8']) },
  external: {
    line: form([
      'M10.6 4.6H7.4C5.8 4.6 4.6 5.8 4.6 7.4C4.4 10.6 4.4 13.8 4.6 16.8C4.6 18.4 5.8 19.6 7.4 19.6C10.4 19.8 13.6 19.8 16.6 19.6C18.2 19.6 19.4 18.4 19.4 16.8V13.4',
      wave(10.8, 13.2, 19.4, 4.6, 0.4),
      'M13.8 4.4C15.7 4.5 17.5 4.6 19.4 4.6C19.4 6.5 19.5 8.3 19.6 10.2',
    ]),
  },
  share: { line: form([circle(17.6, 5.4, 2.3), circle(6.2, 12, 2.3), circle(17.6, 18.6, 2.3), bow(8.3, 10.9, 15.5, 6.5, 0.3), bow(8.3, 13.1, 15.5, 17.5, -0.3)]) },
  refresh: {
    line: form([
      'M19.2 8.6C17.8 5.8 15.2 4.2 12 4.2C8.2 4.2 5 6.9 4.3 10.6',
      'M19.4 4.6C19.4 6 19.4 7.4 19.4 8.8C18 8.8 16.6 8.8 15.2 8.8',
      'M4.8 15.4C6.2 18.2 8.8 19.8 12 19.8C15.8 19.8 19 17.1 19.7 13.4',
      'M4.6 19.4C4.6 18 4.6 16.6 4.6 15.2C6 15.2 7.4 15.2 8.8 15.2',
    ]),
  },
  settings: {
    line: form([wave(3.6, 8, 20.4, 8, 0.6), wave(3.6, 16, 20.4, 16, 0.6)], dots([[9, 8, 2.5], [15, 16, 2.5]])),
    solid: form([wave(3.6, 8, 20.4, 8, 0.6), wave(3.6, 16, 20.4, 16, 0.6)], dots([[9, 8, 3.4], [15, 16, 3.4]])),
  },
  cloud: { line: form([CLOUD, CLOUD_FLOOR]) },
  cloudOff: { line: form([CLOUD, CLOUD_FLOOR, SLASH]) },
  cloudCheck: { line: form([CLOUD, CLOUD_FLOOR, 'M9.2 13.6C10 14.2 10.6 14.8 11.2 15.6C12.4 14 13.6 12.6 15.2 11.4']) },
  grip: { line: form(null, dots([[8.6, 5.2, 1.5], [14.6, 5.2, 1.5], [9.4, 12, 1.5], [15.4, 12, 1.5], [8.6, 18.8, 1.5], [14.6, 18.8, 1.5]])) },
  copy: {
    line: form([
      pillow(3.6, 8.2, 12.2, 12.2, 2.6, 0.35),
      'M8.2 8V6.8C8.2 5.4 9.4 4.2 10.8 4.2C13 4.1 15.2 4.1 17.4 4.2C18.8 4.2 20 5.4 20 6.8C20.1 9 20.1 11.2 20 13.2C20 14.6 18.8 15.8 17.4 15.8H16',
    ]),
  },
  transfer: { line: form([wave(3.8, 8, 19.2, 8, 0.45), head(19.6, 8, 0), wave(20.2, 16, 4.8, 16, 0.45), head(4.4, 16, 180)]) },
  // Two ways crossing, one passing under the other: the clouds laid out again.
  shuffle: {
    line: form([
      'M3.4 7.4C6.8 7.4 8.8 8.8 10.8 11.6C12.8 14.4 14.8 16.6 18.6 16.6',
      head(19.6, 16.6, 0, 4.6),
      'M3.4 16.6C6 16.6 7.6 15.7 9.1 14.1',
      'M12.8 9.6C14.5 8.1 16.2 7.4 18.6 7.4',
      head(19.6, 7.4, 0, 4.6),
    ]),
  },
  // A die showing three: colours drawn at random.
  dice: { line: form(pillow(3.8, 3.8, 16.4, 16.4, 4.2, 0.5), dots([[8.3, 8.3, 1.5], [12, 12, 1.5], [15.7, 15.7, 1.5]])) },
  grid: { line: form([pillow(3.8, 3.8, 7.2, 7.2, 1.8, 0.25), pillow(13, 3.8, 7.2, 7.2, 1.8, 0.25), pillow(3.8, 13, 7.2, 7.2, 1.8, 0.25), pillow(13, 13, 7.2, 7.2, 1.8, 0.25)]) },
  rows: { line: form([pillow(4, 4.6, 16, 5.6, 2.2, 0.45), pillow(4, 13.8, 16, 5.6, 2.2, 0.45)]) },
  sun: {
    line: form([
      breathe(12, 12, 4.2, 0.12),
      ...[0, 45, 90, 135, 180, 225, 270, 315].map(a => {
        const rad = (a * Math.PI) / 180;
        return line(12 + 6.8 * Math.cos(rad), 12 + 6.8 * Math.sin(rad), 12 + 9 * Math.cos(rad), 12 + 9 * Math.sin(rad));
      }),
    ]),
  },
  moon: { line: form('M20.4 14.2C19.2 14.7 17.9 15 16.5 15C11.5 15 7.4 10.9 7.4 5.9C7.4 5 7.6 4.1 7.8 3.2C4.8 4.4 2.8 7.4 2.8 10.8C2.8 16.2 7.2 20.6 12.6 20.6C16.2 20.6 19.2 18.6 20.4 14.2Z') },
  phone: { line: form([pillow(6.4, 2.8, 11.2, 18.4, 2.8, 0.3), line(10.6, 5.8, 13.4, 5.8)]) },
  download: { line: form([wave(12, 3.6, 12, 14.6, 0.4), head(12, 15, 90), wave(4.4, 19.6, 19.6, 19.6, 0.5)]) },
  upload: { line: form([wave(12, 15.2, 12, 4.2, 0.4), head(12, 3.8, -90), wave(4.4, 19.6, 19.6, 19.6, 0.5)]) },
  alert: { line: form([soft([[12, 3.6], [21, 19.4], [3, 19.4]], { r: 2.2, swell: 0.35 }), line(12, 9.6, 12, 13.6)], dots([[12, 16.6, 1.3]])) },
  clock: { line: form([CIRCLE, 'M12 7.6V11.6C12 11.9 12.1 12.1 12.4 12.3L15.4 14.2']) },
  calendar: {
    line: form([pillow(3.6, 5, 16.8, 15.4, 3, 0.4), line(8, 3, 8, 6.6), line(16, 3, 16, 6.6), wave(3.8, 9.6, 20.2, 9.6, 0.4)], dots([[8.4, 13.4, 1.15], [12, 13.4, 1.15], [15.6, 13.4, 1.15], [8.4, 16.8, 1.15], [12, 16.8, 1.15]])),
  },
  mapPin: { line: form(['M12 21.2C12 21.2 4.8 15 4.8 9.6C4.8 5.6 8 2.6 12 2.6C16 2.6 19.2 5.6 19.2 9.6C19.2 15 12 21.2 12 21.2Z', circle(12, 9.6, 2.6)]) },
  bag: { line: form([pillow(3.8, 6.8, 16.4, 13.8, 3, 0.4), 'M8.6 9.8V7.2C8.6 5.2 10.1 3.6 12 3.6C13.9 3.6 15.4 5.2 15.4 7.2V9.8']) },
  film: {
    line: form([pillow(3.6, 10, 16.8, 10.2, 2.4, 0.35), turn(pillow(3.6, 5.2, 16.6, 3.8, 1.6, 0.2), -9, 3.8, 9), line(8.6, 4.8, 7.6, 8.8), line(13.4, 4.1, 12.4, 8.1)]),
  },
  tv: { line: form([pillow(2.8, 7.2, 18.4, 12.8, 3, 0.4), 'M8 3L11.4 6.4C11.7 6.7 12.3 6.7 12.6 6.4L16 3']) },
  utensils: {
    line: form([
      'M4.6 3.2V7.2C4.6 8.8 5.8 10.2 7.2 10.2C8.6 10.2 9.8 8.8 9.8 7.2V3.2',
      line(7.2, 3.2, 7.2, 7.2),
      wave(7.2, 10.2, 7.2, 20.8, 0.3),
      'M17.6 14.4V3.2C15.4 4.4 14.2 7.6 14.2 10.8C14.2 12.6 15.2 14 17.6 14.4Z',
      wave(17.6, 14.4, 17.6, 20.8, 0.25),
    ]),
  },
  book: {
    line: form([
      'M12 7.2C10.4 5.8 8.2 5 5.6 5H3.6V17.8H5.8C8.2 17.8 10.2 18.6 12 20',
      'M12 7.2C13.6 5.8 15.8 5 18.4 5H20.4V17.8H18.2C15.8 17.8 13.8 18.6 12 20',
      wave(12, 7.2, 12, 19.8, 0.3),
    ]),
  },
  music: { line: form([circle(6.8, 17.6, 2.5), circle(16.8, 15.4, 2.5), line(9.3, 17.6, 9.3, 6.6), line(19.3, 15.4, 19.3, 4.4), wave(9.3, 6.6, 19.3, 4.4, 0.35)]) },
  play: { line: form([CIRCLE, soft([[10, 8.4], [16.2, 12], [10, 15.6]], { r: 1.2 })]) },
  newspaper: { line: form([pillow(3, 4, 18, 16, 2.6, 0.4), pillow(6.4, 7.6, 4.6, 4.2, 1, 0.1), wave(13.2, 8.4, 17.6, 8.4, 0.3), wave(13.2, 11.4, 17.6, 11.4, 0.3), wave(6.4, 15.4, 17.6, 15.4, 0.4)]) },
  chefHat: {
    line: form([
      'M7.6 14.6C5.2 14.2 3.6 12.4 3.6 10.2C3.6 7.8 5.6 5.8 8 5.8C8.4 5.8 8.8 5.8 9.2 6C9.8 4.4 11.4 3.4 13.2 3.4C15.4 3.4 17.2 4.8 17.8 6.8C19.6 7.2 20.8 8.8 20.8 10.6C20.8 12.6 19.2 14.2 17.2 14.6',
      'M7.6 14.6V19C7.6 19.8 8.2 20.4 9 20.4H15.8C16.6 20.4 17.2 19.8 17.2 19V14.6',
      wave(7.6, 17.2, 17.2, 17.2, 0.25),
    ]),
  },
  ticket: {
    line: form([
      'M3.6 8.2C3.6 7 4.6 6 5.8 6H18.2C19.4 6 20.4 7 20.4 8.2V9.8C19.2 9.8 18.2 10.8 18.2 12C18.2 13.2 19.2 14.2 20.4 14.2V15.8C20.4 17 19.4 18 18.2 18H5.8C4.6 18 3.6 17 3.6 15.8V14.2C4.8 14.2 5.8 13.2 5.8 12C5.8 10.8 4.8 9.8 3.6 9.8Z',
      wave(14.6, 8.4, 14.6, 15.6, 0.3),
    ]),
  },
  percent: { line: form([circle(7.2, 7.4, 2.6), circle(16.8, 16.6, 2.6), wave(18.4, 4.8, 5.6, 19.2, 0.45)]) },
  trendDown: { line: form([bow(3.4, 7.2, 9.4, 13.2, 0.25), line(9.4, 13.2, 13, 9.6), bow(13, 9.6, 19.4, 16, 0.25), head(19.8, 16.4, 45, 5.2)]) },
  recycle: {
    line: form([
      bow(5.6, 16.4, 10.4, 7.4, 0.35),
      head(10.8, 6.7, -62, 4.2),
      bow(13.6, 7.4, 18.4, 16.4, 0.35),
      head(18.8, 17.1, 62, 4.2),
      bow(17.2, 19.2, 6.8, 19.2, -0.35),
      head(6, 19.2, 180, 4.2),
    ]),
  },
  basket: { line: form([soft([[3.2, 10.4], [20.8, 10.4], [18.6, 19.8], [5.4, 19.8]], { r: 1.2, swell: 0.3 }), 'M6.4 10.4C6.8 6.8 9.2 4.8 12 4.8C14.8 4.8 17.2 6.8 17.6 10.4', line(9.6, 13.6, 10, 16.6), line(14.4, 13.6, 14, 16.6)]) },
  gamepad: { line: form(['M7.2 7.4H16.8C19.2 7.4 20.6 9 21 11.4L21.7 15.8C22 17.6 20.8 19 19.2 19C18.2 19 17.4 18.4 16.9 17.5L16.1 16H7.9L7.1 17.5C6.6 18.4 5.8 19 4.8 19C3.2 19 2 17.6 2.3 15.8L3 11.4C3.4 9 4.8 7.4 7.2 7.4Z', line(6.2, 11.8, 9.8, 11.8), line(8, 10, 8, 13.6)], dots([[15.6, 10.8, 1.15], [17.6, 12.8, 1.15]])) },
  pot: { line: form([pillow(4.2, 10.4, 15.6, 9.4, 3.2, 0.4), wave(2.6, 10.4, 21.4, 10.4, 0.4), bow(9.6, 7.4, 9.6, 3.6, 0.45), bow(14.4, 7.4, 14.4, 3.6, 0.45)]) },
  people: { line: form([circle(9, 8, 3.1), 'M3.4 19.6C3.4 15.9 5.8 13.6 9 13.6C12.2 13.6 14.6 15.9 14.6 19.6', circle(16.4, 8.8, 2.5), 'M15.8 13.8C18.6 13.6 20.6 15.8 20.6 19.2']) },
  rewind: { line: form([soft([[11.6, 6.2], [11.6, 17.8], [3.4, 12]], { r: 1.1, swell: 0.2 }), soft([[20.6, 6.2], [20.6, 17.8], [12.4, 12]], { r: 1.1, swell: 0.2 })]) },
  bubble: { line: form([soft([[3.2, 4.6], [20.8, 4.6], [20.8, 16.2], [11.6, 16.2], [6.8, 20.2], [7.6, 16.2], [3.2, 16.2]], { r: 0.9, swell: 0.25 }), wave(7.4, 9, 16.6, 9, 0.3), wave(7.4, 12.2, 13.4, 12.2, 0.3)]) },
  puzzle: { line: form('M5.2 8.6H8.4C8.4 6.4 9.4 5 10.6 5C11.8 5 12.8 6.4 12.8 8.6H15.8C16.5 8.6 17 9.1 17 9.8V11.4C19.2 11.4 20.4 12.4 20.4 13.6C20.4 14.8 19.2 15.8 17 15.8V18.4C17 19.1 16.5 19.6 15.8 19.6H5.2C4.5 19.6 4 19.1 4 18.4V9.8C4 9.1 4.5 8.6 5.2 8.6Z') },
  globe: { line: form([CIRCLE, 'M12 3.4C9.8 5.6 8.6 8.6 8.6 12C8.6 15.4 9.8 18.4 12 20.6C14.2 18.4 15.4 15.4 15.4 12C15.4 8.6 14.2 5.6 12 3.4Z', wave(3.6, 12, 20.4, 12, 0.4)]) },
  chevronRight: { line: form(CHEV_RIGHT) },
  chevronDown: { line: form(turn(parse(CHEV_RIGHT), 90)) },
  indent: { line: form(['M3.6 8.8C4.8 9.8 6 10.8 7.2 12C6 13.2 4.8 14.2 3.6 15.2', wave(10.6, 5.6, 20.4, 5.6, 0.45), wave(10.6, 10, 20.4, 10, 0.45), wave(10.6, 14.4, 20.4, 14.4, 0.45), wave(3.6, 18.8, 20.4, 18.8, 0.6)]) },
  outdent: { line: form(['M7.2 8.8C6 9.8 4.8 10.8 3.6 12C4.8 13.2 6 14.2 7.2 15.2', wave(10.6, 5.6, 20.4, 5.6, 0.45), wave(10.6, 10, 20.4, 10, 0.45), wave(10.6, 14.4, 20.4, 14.4, 0.45), wave(3.6, 18.8, 20.4, 18.8, 0.6)]) },
  eye: { line: form(['M2.6 12C4.6 7.8 8 5.4 12 5.4C16 5.4 19.4 7.8 21.4 12C19.4 16.2 16 18.6 12 18.6C8 18.6 4.6 16.2 2.6 12Z', circle(12, 12, 3.2)]) },
  eyeOff: { line: form(['M2.6 12C4.6 7.8 8 5.4 12 5.4C16 5.4 19.4 7.8 21.4 12C19.4 16.2 16 18.6 12 18.6C8 18.6 4.6 16.2 2.6 12Z', circle(12, 12, 3.2), SLASH]) },
  key: { line: form([breathe(8, 15.8, 4.6, 0.18, 5), wave(11.4, 12.4, 20.2, 3.6, 0.4), line(16.8, 7, 19, 9.2), line(18.7, 5.1, 20.6, 7)]) },
  server: { line: form([pillow(3.4, 3.8, 17.2, 7.2, 2.4, 0.35), pillow(3.4, 13, 17.2, 7.2, 2.4, 0.35)], dots([[16.4, 7.4, 1.25], [16.4, 16.6, 1.25]])) },
  info: {
    line: form([CIRCLE, line(12, 11, 12, 16.6)], dots([[12, 7.8, 1.3]])),
    solid: form(null, [breathe(12, 12, 9.55, 0.3), outline(line(12, 11, 12, 16.6), 2), circle(12, 7.8, 1.45)]),
  },
  error: { line: form([CIRCLE, line(12, 7.4, 12, 13)], dots([[12, 16.2, 1.3]])) },
  collections: { line: form([circle(8.2, 8.4, 4.4), pillow(12.8, 12.8, 7.6, 7.6, 1.8, 0.25), soft([[16.6, 3.4], [20.8, 10.2], [12.4, 10.2]], { r: 0.9 })]) },
  stamp: { line: form([circle(12, 6.2, 3.2), 'M10.2 8.8C10.6 9.8 10.6 11 10.2 12.4', 'M13.8 8.8C13.4 9.8 13.4 11 13.8 12.4', pillow(4.4, 12.4, 15.2, 4.8, 1.8, 0.3), wave(5.6, 20.2, 18.4, 20.2, 0.35)]) },
  sort: { line: form([wave(7.6, 4, 7.6, 19.2, 0.4), head(7.6, 19.6, 90), wave(16.4, 20, 16.4, 4.8, 0.4), head(16.4, 4.4, -90)]) },
  list: { line: form([wave(9.4, 6.6, 20.4, 6.6, 0.5), wave(9.4, 12, 20.4, 12, 0.5), wave(9.4, 17.4, 20.4, 17.4, 0.5)], dots([[5, 6.6, 1.45], [5, 12, 1.45], [5, 17.4, 1.45]])) },
  star: {
    line: form(
      soft(
        Array.from({ length: 10 }, (_, i) => {
          const a = (-90 + i * 36) * (Math.PI / 180), r = i % 2 ? 4.4 : 9.2;
          return [12 + r * Math.cos(a), 12.8 + r * Math.sin(a)];
        }),
        { r: 1.1 },
      ),
    ),
  },
  inbox: { line: form([pillow(3.6, 4.4, 16.8, 15.6, 2.8, 0.35), 'M3.8 13.6H8C8.6 15.2 10.2 16.4 12 16.4C13.8 16.4 15.4 15.2 16 13.6H20.2']) },
  broom: {
    line: form([wave(20.6, 3.4, 13.4, 10.6, 0.35), 'M13.6 10.4C11.4 8.6 8.4 9 6.8 11L3.6 15C5.4 17.6 8.2 19.6 11.2 20.6L14.4 17C16.2 15 16 12.2 13.6 10.4Z', line(7.4, 16.4, 9.2, 14.2), line(10.6, 18.6, 12.1, 16.2)]),
  },
  scissors: { line: form([circle(6.6, 6.6, 2.8), circle(6.6, 17.4, 2.8), wave(8.8, 8.4, 20.2, 16.8, 0.3), wave(8.8, 15.6, 20.2, 7.2, 0.3)]) },
  sparkle: {
    line: form('M12 3.4C12.8 8.8 15.2 11.2 20.6 12C15.2 12.8 12.8 15.2 12 20.6C11.2 15.2 8.8 12.8 3.4 12C8.8 11.2 11.2 8.8 12 3.4Z'),
    solid: form(null, 'M12 2.5C12.85 8.4 15.6 11.15 21.5 12C15.6 12.85 12.85 15.6 12 21.5C11.15 15.6 8.4 12.85 2.5 12C8.4 11.15 11.15 8.4 12 2.5Z'),
  },
  bold: { line: form(['M7 4.6H13C15.2 4.6 16.8 6.2 16.8 8.2C16.8 10.2 15.2 11.8 13 11.8H7Z', 'M7 11.8H14.2C16.6 11.8 18.4 13.4 18.4 15.6C18.4 17.8 16.6 19.4 14.2 19.4H7V11.8']) },
  italic: { line: form(['M10.4 4.6H17.6', 'M6.4 19.4H13.6', 'M14 4.6L10 19.4']) },
  underline: { line: form(['M7 4V10.6C7 13.4 9.2 15.6 12 15.6C14.8 15.6 17 13.4 17 10.6V4', wave(5.4, 20, 18.6, 20, 0.55)]) },
  strike: {
    line: form([
      'M16.6 7.4C16 5.6 14.2 4.4 12 4.4C9.4 4.4 7.4 6 7.4 8.2C7.4 9.4 8 10.4 9.2 11',
      wave(4, 12, 20, 12, 0.45),
      'M14.8 13.2C16 13.8 16.8 15 16.8 16.2C16.8 18.4 14.6 19.8 12 19.8C9.6 19.8 7.6 18.6 7 16.6',
    ]),
  },
  code: { line: form(['M8.6 6.4C6.6 8.2 4.8 10 3 12C4.8 14 6.6 15.8 8.6 17.6', 'M15.4 6.4C17.4 8.2 19.2 10 21 12C19.2 14 17.4 15.8 15.4 17.6']) },
  codeBlock: { line: form([pillow(3, 3.6, 18, 16.8, 2.8, 0.4), 'M9.6 9C8.6 10 7.8 10.8 6.8 12C7.8 13.2 8.6 14 9.6 15', 'M14.4 9C15.4 10 16.2 10.8 17.2 12C16.2 13.2 15.4 14 14.4 15']) },
  textColor: { line: form(['M2.8 18.6L7.6 5.6L12.4 18.6', line(4.4, 14.4, 10.8, 14.4), circle(16.9, 15.6, 2.8), line(19.7, 12.6, 19.7, 18.6)]) },
  highlight: {
    line: form([
      turn(pillow(10.2, 1.8, 4.8, 9.6, 1.6, 0.2), 40, 12.6, 9.4),
      turn(soft([[10.2, 11.4], [15, 11.4], [14, 14.6], [11.2, 14.6]], { r: 0.7 }), 40, 12.6, 9.4),
      wave(3.8, 20.2, 15.4, 20.2, 0.5),
    ]),
  },
  heading1: { line: form([H, 'M15.2 8.4L17.8 6V18']) },
  heading2: { line: form([H, 'M14.6 8.4C14.8 6.8 16 6 17.4 6C19 6 20.2 7.2 20.2 8.6C20.2 10.4 18.6 11.8 14.6 18H20.4']) },
  heading3: { line: form([H, 'M14.8 7C15.4 6.4 16.4 6 17.4 6C19 6 20.2 7 20.2 8.6C20.2 10.2 19 11.4 17.2 11.4C19.2 11.4 20.6 12.8 20.6 14.6C20.6 16.6 19 18 17.2 18C16 18 15 17.6 14.4 16.8']) },
  heading4: { line: form([H, 'M19.2 18V6L14.2 14.4H21']) },
  text: { line: form(['M5 6H19', 'M12 6V19']) },
  numbered: {
    line: form(['M3.8 5.4L5.6 4.2V9.4', 'M3.8 13.8C4 13 4.6 12.6 5.4 12.6C6.2 12.6 6.8 13.2 6.8 14C6.8 14.8 6 15.6 3.8 17.8H7', wave(10.4, 6.6, 20.4, 6.6, 0.45), wave(10.4, 12, 20.4, 12, 0.45), wave(10.4, 17.4, 20.4, 17.4, 0.45)]),
  },
  toggle: { line: form([CIRCLE, 'M10.6 8.2C11.8 9.4 13 10.6 14.4 12C13 13.4 11.8 14.6 10.6 15.8']) },
  select: { line: form([CIRCLE, 'M8.2 10.6C9.4 11.8 10.6 13 12 14.4C13.4 13 14.6 11.8 15.8 10.6']) },
  callout: {
    line: form([
      'M8.8 16C8.8 14.8 8.2 13.8 7.4 12.8C6.4 11.6 5.8 10.2 5.8 8.6C5.8 5.2 8.6 2.6 12 2.6C15.4 2.6 18.2 5.2 18.2 8.6C18.2 10.2 17.6 11.6 16.6 12.8C15.8 13.8 15.2 14.8 15.2 16',
      wave(8.8, 18.2, 15.2, 18.2, 0.25),
      line(9.8, 21, 14.2, 21),
    ]),
  },
  table: { line: form([pillow(3, 4.4, 18, 15.2, 2.6, 0.4), wave(3.2, 9.6, 20.8, 9.6, 0.4), wave(9.4, 9.6, 9.4, 19.4, 0.3), wave(3.2, 14.6, 20.8, 14.6, 0.4)]) },
  video: { line: form([pillow(2.6, 6.4, 13, 11.2, 2.4, 0.35), 'M15.6 10.4L20.4 7.6C20.8 7.4 21.4 7.6 21.4 8.2V15.8C21.4 16.4 20.8 16.6 20.4 16.4L15.6 13.6']) },
  pdf: { line: form([PAGE, PAGE_FOLD, circle(12.2, 14.2, 2.3), line(9.9, 13.8, 9.9, 18.8)]) },
  file: {
    line: form('M15.6 7.4L8.8 14.2C8 15 8 16.2 8.8 17C9.6 17.8 10.8 17.8 11.6 17L18.8 9.8C20.4 8.2 20.4 5.6 18.8 4C17.2 2.4 14.6 2.4 13 4L5.6 11.4C3.2 13.8 3.2 17.6 5.6 20C8 22.4 11.8 22.4 14.2 20L19.4 14.8'),
  },
  page: {
    line: form([PAGE, PAGE_FOLD, wave(8.2, 12.6, 15.8, 12.6, 0.35), wave(8.2, 16.4, 13.8, 16.4, 0.35)]),
    solid: form(null, [S(PAGE), outline(wave(8.2, 12.6, 15.8, 12.6, 0.35), 1.8), outline(wave(8.2, 16.4, 13.8, 16.4, 0.35), 1.8), outline(parse(PAGE_FOLD), 1.6)]),
  },
  pagePlus: { line: form([PAGE, PAGE_FOLD, line(12, 11.2, 12, 17.4), line(8.9, 14.3, 15.1, 14.3)]) },
  columns: { line: form([pillow(3.4, 4, 7.6, 16, 2.2, 0.3), pillow(13, 4, 7.6, 16, 2.2, 0.3)]) },
  mention: {
    line: form([
      circle(12, 12, 3.4),
      'M15.4 8.6V13.4C15.4 14.8 16.4 15.8 17.8 15.8C19.4 15.8 20.4 14.4 20.4 12C20.4 7.4 16.6 3.6 12 3.6C7.4 3.6 3.6 7.4 3.6 12C3.6 16.6 7.4 20.4 12 20.4C13.8 20.4 15.4 19.8 16.6 19',
    ]),
  },
  bookmark: { line: form('M6.4 4.6C6.4 3.7 7.1 3 8 3H16C16.9 3 17.6 3.7 17.6 4.6C17.8 9.8 17.8 15.2 17.6 20.6L12 16.8L6.4 20.6C6.2 15.2 6.2 9.8 6.4 4.6Z') },
  embed: {
    line: form([
      'M3.6 8.6V6.2C3.6 4.8 4.8 3.6 6.2 3.6H8.6',
      'M15.4 3.6H17.8C19.2 3.6 20.4 4.8 20.4 6.2V8.6',
      'M20.4 15.4V17.8C20.4 19.2 19.2 20.4 17.8 20.4H15.4',
      'M8.6 20.4H6.2C4.8 20.4 3.6 19.2 3.6 17.8V15.4',
    ]),
  },
  smiley: { line: form([circle(12, 12, 8.6), 'M8.4 14C9.2 15.4 10.6 16.2 12 16.2C13.4 16.2 14.8 15.4 15.6 14'], dots([[9, 10, 1.25], [15, 10, 1.25]])) },
  arrowUp: { line: form([wave(12, 20, 12, 4.6, 0.45), head(12, 4.2, -90, 6.2)]) },
  arrowDown: { line: form([wave(12, 4, 12, 19.4, 0.45), head(12, 19.8, 90, 6.2)]) },
  arrowRight: { line: form([wave(4, 12, 19.4, 12, 0.5), head(19.8, 12, 0, 6.2)]) },
  hash: { line: form([wave(4, 9, 20, 9, 0.35), wave(4, 15, 20, 15, 0.35), wave(10.2, 3.6, 8.6, 20.4, 0.3), wave(15.6, 3.6, 14, 20.4, 0.3)]) },
  email: { line: form([pillow(2.8, 5, 18.4, 14, 2.6, 0.4), 'M3.4 6.6C6.2 8.9 9 11.1 12 13.2C15 11.1 17.8 8.9 20.6 6.6']) },
  phoneCall: {
    line: form('M15.1 14.1L13.4 15.5C11.2 14.4 9.6 12.8 8.5 10.6L9.9 8.9C10.3 8.5 10.4 7.9 10.2 7.4L9 4.4C8.8 3.8 8.1 3.4 7.4 3.6L4.6 4.4C3.9 4.6 3.4 5.3 3.5 6C4.2 14.1 9.9 19.8 18 20.5C18.7 20.6 19.4 20.1 19.6 19.4L20.4 16.6C20.6 15.9 20.2 15.2 19.6 15L16.6 13.8C16.1 13.6 15.5 13.7 15.1 14.1Z'),
  },
  multiSelect: { line: form([line(3.6, 6.6, 6, 6.6), line(3.6, 12, 6, 12), line(3.6, 17.4, 6, 17.4), wave(9.4, 6.6, 20.4, 6.6, 0.5), wave(9.4, 12, 20.4, 12, 0.5), wave(9.4, 17.4, 20.4, 17.4, 0.5)]) },
  textAlign: { line: form([wave(3.6, 5.4, 20.4, 5.4, 0.6), wave(3.6, 9.8, 15, 9.8, 0.5), wave(3.6, 14.2, 20.4, 14.2, 0.6), wave(3.6, 18.6, 15, 18.6, 0.5)]) },
  unlink: {
    line: form([
      turn(pillow(1.8, 9, 9, 6, 3, 0.35), -42),
      turn(pillow(13.2, 9, 9, 6, 3, 0.35), -42),
      line(14.08, 14.3, 15.28, 15.64),
      line(9.92, 9.7, 8.72, 8.36),
    ]),
  },
  // A drawing: a pencil and the line it drew.
  draw: {
    line: form([
      'M16.9 3.5C17.7 2.7 19 2.7 19.8 3.5C20.6 4.3 20.6 5.6 19.8 6.4L11.9 14.3L8.6 15L9.3 11.7L16.9 3.5Z',
      bow(15.3, 5.3, 18, 8, 0.3),
      'M3.4 20C4.6 18.2 6 17.4 7.3 18C8.6 18.6 9 20 10.6 20C12 20 13.2 19.1 14.4 17.8',
    ]),
  },
  // The drawing tools: a fine pen, a felt-tip with its round nib, an eraser on its line.
  pen: { line: form(['M15.9 4.3C16.9 3.3 18.5 3.3 19.5 4.3L19.7 4.5C20.7 5.5 20.7 7.1 19.7 8.1L8.6 19.2L3.8 20.2L4.8 15.4L15.9 4.3Z', bow(14.1, 6.1, 17.9, 9.9, 0.3), line(4.9, 16.6, 7.4, 19.1)]) },
  marker: {
    line: form([
      turn(pillow(8.4, 1.8, 7.2, 12.4, 2.4, 0.35), 45, 12, 12),
      turn(parse('M9.9 14.2L10.5 18.6C10.6 19.4 11.2 19.9 11.9 19.9L12.1 19.9C12.8 19.9 13.4 19.4 13.5 18.6L14.1 14.2'), 45, 12, 12),
      turn(line(8.4, 5.4, 15.6, 5.4), 45, 12, 12),
    ]),
  },
  eraser: {
    line: form([
      turn(pillow(5.4, 6.6, 13.2, 8.4, 2.4, 0.35), -45, 12, 10.8),
      wave(8.2, 9.4, 13.6, 14.8, 0.3),
      wave(11.6, 20.2, 20.4, 20.2, 0.45),
    ]),
  },
  // A table of contents: its headings, those of a part set in under it.
  contents: { line: form([wave(3.6, 5.4, 15.6, 5.4, 0.5), wave(8.2, 10, 20.4, 10, 0.5), wave(8.2, 14.6, 18, 14.6, 0.5), wave(3.6, 19.2, 13.6, 19.2, 0.5)]) },
  // Keyboard keys.
  keyboard: {
    line: form([pillow(2.6, 5.6, 18.8, 12.8, 3, 0.4), wave(8.4, 15.2, 15.6, 15.2, 0.3)], dots([[6.6, 9.4, 1.15], [9.8, 9.4, 1.15], [13, 9.4, 1.15], [16.2, 9.4, 1.15], [6.6, 12.4, 1.15], [17.4, 12.4, 1.15]])),
  },
};

/** The eleven glyphs a selected control shows filled. */
export const SOLID = ['note', 'bell', 'tag', 'archive', 'trash', 'settings', 'pin', 'undo', 'info', 'sparkle', 'page'];
