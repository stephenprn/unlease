/**
 * The only spelling of touch, after habits-garden's OrganicPressable: a press lays a tint inside
 * the control's own corners (an Android ripple spilled past them), on the UI thread.
 * `onDark` lightens instead, `onFill` darkens a filled control harder, `pressScale` squeezes.
 * A control whose visible part is a child (a swatch over its name) gives the tint to that child:
 * `noTint` on the Tappable, a `PressSurface` around the swatch.
 * A control with rounded corners (from `corners()`), a container given an `outline`, or a control
 * on the brand's `pebble`, is painted by an `Organic` layer under its content: fill, border and
 * shadow in that shape, with the continuous corner a View cannot draw; the control keeps its box.
 * A pebble gives under the finger and springs back.
 */
import React, { createContext, memo, useCallback, useContext, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View, type GestureResponderEvent, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';

import type { Corners } from '@unlease/design/shapes';

import { insetCorners } from '../theme/shape';
import { useTheme } from '../theme/ThemeProvider';
import { AnimatedOrganic, isOrganic, Organic, shapeOfStyle, type OutlineKind } from './Organic';

export interface TappableProps extends Omit<PressableProps, 'style' | 'children'> {
  readonly style?: StyleProp<ViewStyle>;
  readonly children?: React.ReactNode;
  /** A light tint, for a dark fill (the slip, the photo viewer). */
  readonly onDark?: boolean;
  /** A stronger tint, for a filled control (a terracotta button, the leaf). */
  readonly onFill?: boolean;
  /** No tint of its own: a `PressSurface` inside takes it, or nothing does (a scrim). */
  readonly noTint?: boolean;
  /** Scale while pressed; 1 does not move. */
  readonly pressScale?: number;
  /** Draws its own disabled state (a button sinks to a well in the second ink): no fade. */
  readonly ownDisabled?: boolean;
  /** A container's outline (a row, a tile): its paint and its press take that shape. */
  readonly outline?: OutlineKind | null;
  /** The brand's pebble, this turn of it: its paint and its press take that shape, and it gives under the finger. */
  readonly pebble?: number | null;
}

const PressContext = createContext<{ readonly pressed: SharedValue<number>; readonly color: string } | null>(null);

const SPRING = { damping: 14, stiffness: 320, mass: 0.5 } as const;
/** The tint comes at once under the finger and lingers a little as it lets go. */
const PRESS_IN = { duration: 60, easing: Easing.out(Easing.quad) } as const;
const PRESS_OUT = { duration: 150, easing: Easing.out(Easing.quad) } as const;
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Above the fill, under the content: it darkens the surface without dimming the label. */
function Tint({ pressed, shape, color }: { pressed: SharedValue<number>; shape: ViewStyle; color: string }) {
  const opacity = useAnimatedStyle(() => ({ opacity: pressed.value }));
  return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, shape, { backgroundColor: color }, opacity]} />;
}

/** The same, in the control's shape: inside its border, in its corners (or its outline, or its pebble, laid inside the border). */
function OrganicTint({ pressed, shape, outline, pebble, down, inset, color }: { pressed: SharedValue<number>; shape: Corners | null; outline?: OutlineKind | null; pebble?: number | null; down?: boolean; inset: number; color: string }) {
  const opacity = useAnimatedStyle(() => ({ opacity: pressed.value }));
  const laid = !!outline || pebble != null;
  const place = laid ? { position: 'absolute' as const, top: inset, left: inset, right: inset, bottom: inset } : StyleSheet.absoluteFill;
  return <AnimatedOrganic pointerEvents="none" shape={shape} outline={outline} pebble={pebble} pressed={down} inset={laid ? 0 : inset} style={[place, { backgroundColor: color }, opacity]} />;
}

/** What a control paints, moved to the organic layer under it. */
const PAINT = [
  'backgroundColor',
  'backgroundImage',
  'experimental_backgroundImage',
  'backgroundSize',
  'experimental_backgroundSize',
  'backgroundPosition',
  'experimental_backgroundPosition',
  'backgroundRepeat',
  'experimental_backgroundRepeat',
  'borderColor',
  'borderStyle',
  'boxShadow',
  'borderRadius',
  'borderTopLeftRadius',
  'borderTopRightRadius',
  'borderBottomRightRadius',
  'borderBottomLeftRadius',
] as const;

interface OrganicPaint {
  /** The control's own style, its paint taken off: it still lays out and takes the touch. */
  readonly box: ViewStyle;
  /** The layer under the content that paints it, or null when there is nothing to paint. */
  readonly layer: ViewStyle | null;
  /** Its corners, or null when it takes an outline or a pebble. */
  readonly shape: Corners | null;
  readonly border: number;
}

/** A control with rounded corners (or given an outline or a pebble), split into its box and the layer that paints it; null for any other. */
function organicPaint(style: StyleProp<ViewStyle>, outlined: boolean): OrganicPaint | null {
  const flat = (StyleSheet.flatten(style) ?? {}) as Record<string, unknown>;
  const own = shapeOfStyle(flat as ViewStyle);
  const shape = isOrganic(own) ? own : null;
  if (!shape && !outlined) return null;
  const border = typeof flat.borderWidth === 'number' ? flat.borderWidth : 0;
  const box: Record<string, unknown> = { ...flat };
  const paint: Record<string, unknown> = {};
  for (const key of PAINT) {
    if (box[key] === undefined) continue;
    paint[key] = box[key];
    delete box[key];
  }
  // The border keeps its width in the box, so the content sits where it did; the layer draws it.
  if (border > 0) box.borderColor = 'transparent';
  // A box can only clip square, which would cut the layer's corners (and its ring): content that
  // must stay inside the shape sits in an `Organic` that clips.
  delete box.overflow;
  const paints = Object.keys(paint).some(key => !key.endsWith('Radius'));
  const layer = paints ? { ...paint, borderWidth: border, position: 'absolute', top: -border, left: -border, right: -border, bottom: -border } : null;
  return { box: box as ViewStyle, layer: layer as ViewStyle | null, shape, border };
}

/** Only the few controls that squeeze pay for a second animated style. */
function Squeeze({ pressed, pressScale, style, ...rest }: PressableProps & { pressed: SharedValue<number>; pressScale: number; style: StyleProp<ViewStyle> }) {
  const scale = useAnimatedStyle(() => ({ transform: [{ scale: 1 + (pressScale - 1) * pressed.value }] }), [pressScale]);
  return <AnimatedPressable {...rest} style={[style, scale]} />;
}

/** The control's own corners, taken inside its border so the tint meets the edge. */
function tintShape(style: StyleProp<ViewStyle>): ViewStyle {
  const flat = (StyleSheet.flatten(style) ?? {}) as ViewStyle;
  return insetCorners(flat, typeof flat.borderWidth === 'number' ? flat.borderWidth : 0);
}

/** The part of a control that shows its press: the enclosing Tappable's tint, in this view's own shape (or on its pebble). */
export function PressSurface({ style, pebble = null, children }: { style: StyleProp<ViewStyle>; pebble?: number | null; children?: React.ReactNode }) {
  const press = useContext(PressContext);
  const flat = useMemo(() => (StyleSheet.flatten(style) ?? {}) as ViewStyle, [style]);
  const organic = useMemo(() => {
    const own = shapeOfStyle(flat);
    return isOrganic(own) ? own : null;
  }, [flat]);
  const shape = useMemo(() => (organic || pebble != null ? null : tintShape(style)), [organic, pebble, style]);
  if (organic || pebble != null) {
    const border = typeof flat.borderWidth === 'number' ? flat.borderWidth : 0;
    return (
      <Organic style={style} pebble={pebble}>
        {press ? <OrganicTint pressed={press.pressed} shape={organic} pebble={pebble} inset={border} color={press.color} /> : null}
        {children}
      </Organic>
    );
  }
  return (
    <View style={style}>
      {press && shape ? <Tint pressed={press.pressed} shape={shape} color={press.color} /> : null}
      {children}
    </View>
  );
}

function TappableComponent({ style, children, onDark = false, onFill = false, noTint = false, pressScale = 1, ownDisabled = false, outline = null, pebble = null, accessibilityRole = 'button', disabled, onPressIn, onPressOut, ...rest }: TappableProps) {
  const theme = useTheme();
  const pressed = useSharedValue(0);
  // Only a pebble re-renders on the press: it hands the press to its native view, which gives and springs back.
  const [down, setDown] = useState(false);
  const stone = pebble != null;
  const organic = useMemo(() => organicPaint(style, !!outline || stone), [style, outline, stone]);
  const shape = useMemo(() => (noTint || organic ? null : tintShape(style)), [noTint, organic, style]);
  const color = onDark ? theme.press.onDark : onFill ? theme.press.onFill : theme.press.tint;

  const handleIn = useCallback(
    (event: GestureResponderEvent) => {
      pressed.value = pressScale === 1 ? withTiming(1, PRESS_IN) : withSpring(1, SPRING);
      if (stone) setDown(true);
      onPressIn?.(event);
    },
    [pressed, pressScale, onPressIn, stone],
  );
  const handleOut = useCallback(
    (event: GestureResponderEvent) => {
      pressed.value = pressScale === 1 ? withTiming(0, PRESS_OUT) : withSpring(0, SPRING);
      if (stone) setDown(false);
      onPressOut?.(event);
    },
    [pressed, pressScale, onPressOut, stone],
  );

  const props = { accessibilityRole, disabled, onPressIn: handleIn, onPressOut: handleOut, ...rest };
  const rootStyle = [organic ? organic.box : style, disabled && !ownDisabled ? styles.disabled : null];
  const surface = useMemo(() => ({ pressed, color }), [pressed, color]);
  const content = (
    <PressContext.Provider value={surface}>
      {organic?.layer ? <Organic pointerEvents="none" shape={organic.shape} outline={outline} pebble={pebble} pressed={down} style={organic.layer} /> : null}
      {organic && !noTint ? <OrganicTint pressed={pressed} shape={organic.shape} outline={outline} pebble={pebble} down={down} inset={organic.border} color={color} /> : null}
      {shape ? <Tint pressed={pressed} shape={shape} color={color} /> : null}
      {children}
    </PressContext.Provider>
  );
  if (pressScale === 1) {
    return (
      <Pressable {...props} style={rootStyle}>
        {content}
      </Pressable>
    );
  }
  return (
    <Squeeze {...props} pressed={pressed} pressScale={pressScale} style={rootStyle}>
      {content}
    </Squeeze>
  );
}

const styles = StyleSheet.create({
  disabled: { opacity: 0.45 },
});

export const Tappable = memo(TappableComponent);
