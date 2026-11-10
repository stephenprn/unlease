/**
 * A little plan drawn for an address: not a map (no tile is fetched, nothing leaves the device), a
 * paper cut-out of a town around a pin, the same for the same address on every device. Two avenues
 * cross near the pin, a few streets run beside them, a river may bend through a corner and a park lie
 * in another. Both clients paint it from these numbers (`PLAN_WIDTH` by `PLAN_HEIGHT`): the town on
 * the well, the streets in the paper, the water and the park in their washes, the pin cut from a
 * pigment (`PLAN_PIN`).
 */

export const PLAN_WIDTH = 120;
export const PLAN_HEIGHT = 90;

/** Where the pin's tip stands. */
export const PLAN_PIN_TIP = { x: 60, y: 52 } as const;

/** The pin, a cut-out tip down at `PLAN_PIN_TIP` (its hole at `PLAN_PIN_HOLE`, radius 3). */
export const PLAN_PIN = 'M60 52 C56.5 46.2 51 41.6 51 35.4 C51 30.2 55 26.4 60 26.4 C65 26.4 69 30.2 69 35.4 C69 41.6 63.5 46.2 60 52 Z';
export const PLAN_PIN_HOLE = { x: 60, y: 35.2, r: 3.2 } as const;

export interface PlanStreet {
  readonly d: string;
  readonly width: number;
}

export interface Plan {
  /** A river's course, stroked at `waterWidth`; null for none. */
  readonly water: string | null;
  readonly waterWidth: number;
  /** A park's outline, filled (and stroked 6 round, for its soft corners); null for none. */
  readonly park: string | null;
  /** The avenues first, then the streets. */
  readonly streets: readonly PlanStreet[];
}

/** A small number from the address, the same everywhere (FNV-1a). */
function hash(key: string): number {
  let value = 2166136261;
  for (let i = 0; i < key.length; i += 1) {
    value ^= key.charCodeAt(i);
    value = Math.imul(value, 16777619) >>> 0;
  }
  return value;
}

/** Numbers in [0, 1) drawn from a seed (mulberry32). */
function draws(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round = (value: number): number => Math.round(value * 10) / 10;

/** A straight street through (x, y) at `angle` degrees, long enough to cross the whole plan. */
function line(x: number, y: number, angle: number): string {
  const radians = (angle * Math.PI) / 180;
  const reach = 160;
  const dx = Math.cos(radians) * reach;
  const dy = Math.sin(radians) * reach;
  return `M${round(x - dx)} ${round(y - dy)} L${round(x + dx)} ${round(y + dy)}`;
}

/** The plan of an address (its one line, as `addressLine` writes it). */
export function addressPlan(key: string): Plan {
  const next = draws(hash(key.trim().toLowerCase()));
  const between = (low: number, high: number): number => low + (high - low) * next();
  const { x: px, y: py } = PLAN_PIN_TIP;

  // Two avenues crossing a little off the pin, then streets beside each.
  const first = between(-28, 28);
  const second = first + 90 + between(-18, 18);
  const crossX = px + between(-16, 16);
  const crossY = py + between(-10, 10);
  const streets: PlanStreet[] = [
    { d: line(crossX, crossY, first), width: 7 },
    { d: line(crossX, crossY, second), width: 6 },
  ];
  const sides = 3 + Math.floor(next() * 3);
  for (let i = 0; i < sides; i += 1) {
    const along = next() < 0.5 ? first : second;
    const across = ((along + 90) * Math.PI) / 180;
    const offset = (next() < 0.5 ? -1 : 1) * between(20, 46);
    streets.push({ d: line(crossX + Math.cos(across) * offset, crossY + Math.sin(across) * offset, along + between(-8, 8)), width: between(2.6, 3.6) });
  }

  // A river bending through one corner, kept off the pin.
  let water: string | null = null;
  const waterWidth = round(between(9, 15));
  if (next() < 0.5) {
    const corner = Math.floor(next() * 4);
    const right = corner === 1 || corner === 2;
    const below = corner >= 2;
    const x0 = right ? PLAN_WIDTH + 8 : -8;
    const y1 = below ? PLAN_HEIGHT + 8 : -8;
    const startY = below ? between(52, 74) : between(14, 36);
    const endX = right ? between(70, 100) : between(20, 50);
    const bendX = right ? between(78, 96) : between(24, 42);
    const bendY = below ? between(60, 78) : between(12, 30);
    water = `M${round(x0)} ${round(startY)} C${round(bendX)} ${round(startY + (below ? 6 : -6))} ${round(bendX)} ${round(bendY)} ${round(endX)} ${round(y1)}`;
  }

  // A park in a corner the river left, a soft quadrilateral.
  let park: string | null = null;
  if (next() < 0.65) {
    const left = next() < 0.5;
    const top = next() < 0.5;
    const cx = left ? between(16, 30) : between(90, 104);
    const cy = top ? between(14, 24) : between(66, 76);
    const w = between(12, 18);
    const h = between(8, 13);
    const tilt = (first * Math.PI) / 180;
    const corners = [
      [-w, -h],
      [w, -h],
      [w, h],
      [-w, h],
    ].map(([x, y]) => [cx + x! * Math.cos(tilt) - y! * Math.sin(tilt), cy + x! * Math.sin(tilt) + y! * Math.cos(tilt)]);
    park = `M${corners.map(([x, y]) => `${round(x!)} ${round(y!)}`).join(' L')} Z`;
  }

  return { water, waterWidth, park, streets };
}
