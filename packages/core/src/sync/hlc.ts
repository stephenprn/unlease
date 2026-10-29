/**
 * Hybrid logical clocks: never behind any clock seen, so a skewed device still orders writes.
 * Fixed width (`<wall ms: 9 base-36>-<counter: 4 base-36>-<node>`): strings compare in order.
 */

export type Hlc = string;

const WALL_WIDTH = 9;
const COUNTER_WIDTH = 4;
const MAX_COUNTER = 36 ** COUNTER_WIDTH - 1;
/** A remote clock this far ahead of our wall time is refused rather than adopted. */
export const MAX_DRIFT_MS = 24 * 60 * 60 * 1000;

export interface ClockState {
  readonly node: string;
  wall: number;
  counter: number;
}

export function createClock(node: string): ClockState {
  if (!/^[a-z0-9]{4,16}$/.test(node)) {
    throw new Error(`invalid clock node id: ${node}`);
  }
  return { node, wall: 0, counter: 0 };
}

export function formatHlc(wall: number, counter: number, node: string): Hlc {
  return `${wall.toString(36).padStart(WALL_WIDTH, '0')}-${counter
    .toString(36)
    .padStart(COUNTER_WIDTH, '0')}-${node}`;
}

export function parseHlc(value: Hlc): { wall: number; counter: number; node: string } | null {
  const match = /^([0-9a-z]{9})-([0-9a-z]{4})-([a-z0-9]{4,16})$/.exec(value);
  if (!match) return null;
  return { wall: parseInt(match[1]!, 36), counter: parseInt(match[2]!, 36), node: match[3]! };
}

export function isHlc(value: unknown): value is Hlc {
  return typeof value === 'string' && parseHlc(value) !== null;
}

export function hlcWall(value: Hlc): number {
  return parseHlc(value)?.wall ?? 0;
}

/** The node that minted a clock. */
export function hlcNode(value: Hlc): string | null {
  return parseHlc(value)?.node ?? null;
}

/** A clock for a local write. Mutates `state`. */
export function tick(state: ClockState, now: number): Hlc {
  if (now > state.wall) {
    state.wall = now;
    state.counter = 0;
  } else {
    state.counter += 1;
    if (state.counter > MAX_COUNTER) {
      // Counter overflow within one millisecond: borrow the next millisecond.
      state.wall += 1;
      state.counter = 0;
    }
  }
  return formatHlc(state.wall, state.counter, state.node);
}

/** Fold a remote clock into ours; one from absurdly far in the future is ignored. */
export function observe(state: ClockState, remote: Hlc, now: number): void {
  const parsed = parseHlc(remote);
  if (!parsed) return;
  if (parsed.wall > now + MAX_DRIFT_MS) return;
  if (parsed.wall > state.wall) {
    state.wall = parsed.wall;
    state.counter = parsed.counter;
  } else if (parsed.wall === state.wall && parsed.counter > state.counter) {
    state.counter = parsed.counter;
  }
}

/** A clock older than any real write: the seed records every device creates alike. */
export const GENESIS_HLC: Hlc = formatHlc(0, 0, 'genesis');

export function randomNodeId(random: () => number = Math.random): string {
  let id = '';
  for (let i = 0; i < 10; i += 1) id += Math.floor(random() * 36).toString(36);
  return id;
}
