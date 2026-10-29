/**
 * A container's outline on the web, the phone's `Organic` with `outline` (`outline.ts` in core): a
 * sheet with the continuous corner at its kind's radius. The container's paint is clipped to it
 * (`clip-path: path(...)`, set as `--outline-clip` so a wrapper can hand it down), its edge is drawn
 * along it from inside (`OutlineEdge`), and its lift moves to an unclipped ancestor as a drop
 * shadow (`--drop-*`), since a clip would cut a box-shadow off. Every browser draws the same corner
 * this way (a CSS `corner-shape` reaches only some).
 *
 * A size the caller knows (a card the wall placed) is used at once; otherwise the element is
 * measured (one ResizeObserver for all). Without a size (a test, the first frame) nothing is
 * clipped and the container keeps its CSS corners.
 */
import { forwardRef, useCallback, useRef, useState, type CSSProperties, type HTMLAttributes, type ReactNode, type Ref } from 'react';

import { outlinePath, type OutlineKind } from '@unlease/design/outline';
import { pebblePath } from '@unlease/design/pebbles';

import styles from './outline.module.css';

export type { OutlineKind };

interface Size {
  readonly width: number;
  readonly height: number;
}

const paths = new Map<string, string>();

/** The outline's SVG path for a box, cached by size (to the half pixel); `offset` draws it that far in (negative: out). */
export function outlineD(kind: OutlineKind, width: number, height: number, offset = 0): string {
  const w = Math.round(width * 2) / 2;
  const h = Math.round(height * 2) / 2;
  const key = `${kind}|${w}|${h}|${offset}`;
  let d = paths.get(key);
  if (!d) {
    d = outlinePath(kind, w, h, offset);
    if (paths.size > 4000) paths.clear();
    paths.set(key, d);
  }
  return d;
}

/** How far out a focus ring runs around an outline. */
export const RING_GAP = 4;

/** The clip for an element (or a wrapper handing it down): its outline, or none while it is unknown. */
export function outlineVars(d: string | null): CSSProperties {
  return { '--outline-clip': d ? `path('${d}')` : 'none' } as CSSProperties;
}

const listeners = new WeakMap<Element, (size: Size) => void>();
let observer: ResizeObserver | null = null;

function watch(node: Element, onSize: (size: Size) => void): () => void {
  observer ??= new ResizeObserver(entries => {
    for (const entry of entries) {
      const box = entry.borderBoxSize?.[0];
      const element = entry.target as HTMLElement;
      listeners.get(entry.target)?.({ width: box ? box.inlineSize : element.offsetWidth, height: box ? box.blockSize : element.offsetHeight });
    }
  });
  listeners.set(node, onSize);
  observer.observe(node, { box: 'border-box' });
  return () => {
    listeners.delete(node);
    observer?.unobserve(node);
  };
}

/**
 * An element's outline, kept in step with its size: attach `ref` to the element measured (the
 * clipped one, or a wrapper of the same size), spread `vars` where the clip should start.
 */
export function useOutline<T extends Element>(kind: OutlineKind | null): { readonly ref: (node: T | null) => void; readonly d: string | null; readonly vars: CSSProperties; readonly size: Size | null } {
  const [size, setSize] = useState<Size | null>(null);
  const stop = useRef<(() => void) | null>(null);
  const ref = useCallback((node: T | null) => {
    stop.current?.();
    stop.current = null;
    if (!node || typeof ResizeObserver === 'undefined') return;
    stop.current = watch(node, next => setSize(previous => (previous && Math.abs(previous.width - next.width) < 0.5 && Math.abs(previous.height - next.height) < 0.5 ? previous : next)));
  }, []);
  const d = kind && size && size.width > 0 && size.height > 0 ? outlineD(kind, size.width, size.height) : null;
  return { ref, d, vars: outlineVars(d), size };
}

/**
 * The outline's edge, drawn along it from inside: the element's clip takes the outer half of the
 * stroke. Its colour, width and dashes come from `--edge-color`, `--edge-width` and `--edge-dash`.
 */
export function OutlineEdge({ d, className }: { d: string | null; className?: string }) {
  if (!d) return null;
  return (
    <svg className={className ? `${styles.edge} ${className}` : styles.edge} aria-hidden="true" focusable="false">
      <path d={d} />
    </svg>
  );
}

const PEBBLE_EDGES = [0, 1, 2, 3].map(turn => pebblePath(100, 100, turn));

/**
 * A pebble's edge or ring, for an element painting the pebble (`data-pebble-under`, marked
 * `data-still` so the pebble holds its shape under the press): drawn just inside it, the same width
 * at any size. Its colour and width come from `--edge-color` and `--edge-width`.
 */
export function PebbleEdge({ turn, className }: { turn: number; className?: string }) {
  return (
    <svg className={className ? `${styles.pebbleEdge} ${className}` : styles.pebbleEdge} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <path d={PEBBLE_EDGES[((turn % 4) + 4) % 4]} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** A focus ring around the outline, `RING_GAP` out (drawn by an unclipped ancestor, shown on keyboard focus). */
export function OutlineRing({ kind, width, height, className }: { kind: OutlineKind; width: number | undefined; height: number | undefined; className?: string }) {
  if (!width || !height) return null;
  const d = outlineD(kind, width, height, -RING_GAP);
  return (
    <svg className={className ? `${styles.ring} ${className}` : styles.ring} aria-hidden="true" focusable="false">
      <path d={d} />
    </svg>
  );
}

export interface OutlinedBoxProps extends HTMLAttributes<HTMLDivElement> {
  readonly kind: OutlineKind;
  /** Its lift, cast by a wrapper (a clip would cut it off): `card` on the ground, `float` over it. */
  readonly lift?: 'card' | 'raised' | 'float';
  /** Its edge along the outline (`--edge-color`, `--edge-width`, `--edge-dash`); off for a well with no edge. */
  readonly edge?: boolean;
  /** The wrapper's own class, when it lifts (its place in a layout). */
  readonly liftClassName?: string;
}

/**
 * A container in its own outline: its paint (`className`) clipped to it and edged inside it, its
 * lift cast from a wrapper around it. The forwarded ref is the container's.
 */
export const OutlinedBox = forwardRef<HTMLDivElement, OutlinedBoxProps>(function OutlinedBox({ kind, lift, edge = true, liftClassName, className, style, children, ...rest }, forwarded) {
  const { ref, d, vars } = useOutline<HTMLDivElement>(kind);
  const both = useCallback(
    (node: HTMLDivElement | null) => {
      ref(node);
      assign(forwarded, node);
    },
    [ref, forwarded],
  );
  const box = (
    <div ref={both} className={className ? `${styles.box} ${className}` : styles.box} style={{ ...vars, ...style }} {...rest}>
      {children}
      {edge ? <OutlineEdge d={d} /> : null}
    </div>
  );
  if (!lift) return box;
  return (
    <div className={liftClassName ? `${styles.lift} ${liftClassName}` : styles.lift} data-lift={lift}>
      {box}
    </div>
  );
});

/** A wrapper casting an outlined container's lift (a drop shadow along its outline), for a container that is not an `OutlinedBox` (a form). */
export function OutlineLift({ lift, raise = false, className, children }: { lift: 'card' | 'raised' | 'float'; raise?: boolean; className?: string; children: ReactNode }) {
  return (
    <div className={className ? `${styles.lift} ${className}` : styles.lift} data-lift={lift} data-raise={raise || undefined}>
      {children}
    </div>
  );
}

function assign<T>(target: Ref<T> | undefined, value: T | null): void {
  if (typeof target === 'function') target(value);
  else if (target) (target as { current: T | null }).current = value;
}
