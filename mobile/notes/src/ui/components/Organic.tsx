/**
 * A surface in Carnet's shapes, as the web draws them, which a View cannot draw on Android (a React
 * Native radius is one plain circle). A container takes an `outline` (its kind, `outline.ts` in
 * core): a sheet with the continuous corner at its kind's radius. A control reads its corners from
 * the radii in its style (`corners()`), or from `shape`, drawn with the same continuous corner; a
 * radius in % of the box is a dot. A `pebble` (its turn, `pebbles.ts` in core) draws the brand's
 * stone instead, which gives toward round while `pressed` and springs back. Either way it draws its
 * background, border and shadow in that shape and, with `overflow: 'hidden'`, clips what it holds
 * to the inside of its border. One border colour; a side may go without.
 */
import React, { forwardRef, memo, useMemo } from 'react';
import { StyleSheet, type ViewProps, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';

import { OUTLINES, type OutlineKind } from '@unlease/design/outline';
import { pebbleNumbers, pebbleTurn } from '@unlease/design/pebbles';
import type { Corners, CornerValue } from '@unlease/design/shapes';
import { OrganicNativeView } from '@platform/organic';

export type { OutlineKind };

export interface OrganicProps extends ViewProps {
  /** A container: drawn in its kind's outline (the style's radii are then ignored). */
  readonly outline?: OutlineKind | null;
  /** The shape, when the style does not carry it. */
  readonly shape?: Corners | null;
  /** The brand's pebble, this turn of it (`pebbleTurn`): drawn instead of any corners. */
  readonly pebble?: number | null;
  /** A pebble given under the finger (it springs back when this turns false). */
  readonly pressed?: boolean;
  /** Drawn this much inside its radii: a layer laid inside a border meets it exactly. */
  readonly inset?: number;
}

type Radius = ViewStyle['borderTopLeftRadius'];

const NO_CORNERS: Corners = [0, 0, 0, 0];

const cornerValue = (value: Radius): CornerValue | null =>
  typeof value === 'number' ? value : typeof value === 'string' && value.endsWith('%') ? (value as `${number}%`) : null;

/** The shape a style's corner radii give (what `corners()` wrote), or null without any. */
export function shapeOfStyle(style: ViewStyle): Corners | null {
  const all = style.borderRadius;
  const [topLeft, topRight, bottomRight, bottomLeft] = [style.borderTopLeftRadius ?? all, style.borderTopRightRadius ?? all, style.borderBottomRightRadius ?? all, style.borderBottomLeftRadius ?? all].map(cornerValue);
  if (topLeft === null && topRight === null && bottomRight === null && bottomLeft === null) return null;
  return [topLeft ?? 0, topRight ?? 0, bottomRight ?? 0, bottomLeft ?? 0];
}

/** Any rounded corner: a View would draw it as a plain circle, so the organic view draws it, continuous. */
export function isOrganic(shape: Corners | null): shape is Corners {
  return shape !== null && shape.some(value => value !== 0);
}

/** The native view's radii: each corner's horizontal then vertical radius (the same), in dp, or (a dot) in % of the box. */
function nativeRadii(shape: Corners, inset: number): { radii: number[]; relative: boolean } {
  const relative = shape.some(value => typeof value !== 'number');
  const read = (value: CornerValue): number => (typeof value === 'number' ? Math.max(0, value - inset) : parseFloat(value));
  return { radii: shape.flatMap(value => [read(value), read(value)]), relative };
}

const PEBBLES = Array.from({ length: 4 }, (_, turn) => ({ rest: pebbleNumbers(turn), given: pebbleNumbers(turn, 1) }));

const OrganicView = forwardRef<React.ComponentRef<typeof OrganicNativeView>, OrganicProps>(function OrganicSurface({ outline, shape, pebble, pressed = false, inset = 0, style, ...rest }, ref) {
  const native = useMemo(() => {
    const own = outline ? OUTLINES[outline] : (shape ?? shapeOfStyle((StyleSheet.flatten(style) ?? {}) as ViewStyle));
    return nativeRadii(own ?? NO_CORNERS, inset);
  }, [outline, shape, style, inset]);
  const stone = pebble === null || pebble === undefined ? null : PEBBLES[pebbleTurn(pebble)]!;
  return <OrganicNativeView ref={ref} {...rest} style={style} radii={native.radii} relative={native.relative} pebble={stone?.rest} pebbleGiven={stone?.given} given={stone ? pressed : false} />;
});

export const Organic = memo(OrganicView);

/** For Reanimated: animated styles, entering and exiting. */
export const AnimatedOrganic = Animated.createAnimatedComponent(OrganicView);
