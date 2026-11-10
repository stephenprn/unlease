/** A role's corners (`design/shapes`) as React Native corner radii; percentages pass through. */
import type { ViewStyle } from 'react-native';

import type { Corners } from '@unlease/design/shapes';

/**
 * The shape as corner radii, which `Organic` (and `Tappable`) read back and draw with the
 * continuous corner; a plain View draws them as plain circles. On a box too short for them, the
 * radii shrink in proportion, as CSS does.
 */
export function corners([topLeft, topRight, bottomRight, bottomLeft]: Corners): ViewStyle {
  return {
    borderTopLeftRadius: topLeft,
    borderTopRightRadius: topRight,
    borderBottomRightRadius: bottomRight,
    borderBottomLeftRadius: bottomLeft,
  };
}

/** The same shape drawn `inset` px inside a border, so a layer laid in it meets the edge exactly. */
export function insetCorners(shape: ViewStyle, inset: number): ViewStyle {
  const shrink = (value: ViewStyle['borderTopLeftRadius']): ViewStyle['borderTopLeftRadius'] =>
    typeof value === 'number' ? Math.max(0, value - inset) : value;
  return {
    borderTopLeftRadius: shrink(shape.borderTopLeftRadius ?? shape.borderRadius),
    borderTopRightRadius: shrink(shape.borderTopRightRadius ?? shape.borderRadius),
    borderBottomRightRadius: shrink(shape.borderBottomRightRadius ?? shape.borderRadius),
    borderBottomLeftRadius: shrink(shape.borderBottomLeftRadius ?? shape.borderRadius),
  };
}

