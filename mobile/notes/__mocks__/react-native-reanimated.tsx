/**
 * Reanimated under Jest: the JSI runtime is missing, and the library's own mock still needs it.
 * Animations jump to their final value; worklets run inline, so a broken one still fails.
 */
import React from 'react';
import { FlatList, View, ScrollView, Image, Text, type ViewProps } from 'react-native';

/** Layout-animation props mean nothing to a plain View, and React would warn about them. */
const ANIMATION_PROPS = ['entering', 'exiting', 'layout', 'sharedTransitionTag', 'itemLayoutAnimation', 'skipEnteringExitingAnimations'] as const;

function stripAnimationProps<T extends Record<string, unknown>>(props: T): T {
  const rest: Record<string, unknown> = { ...props };
  for (const key of ANIMATION_PROPS) delete rest[key];
  return rest as T;
}

function createAnimatedComponent<P extends object>(
  Component: React.ComponentType<P>,
): React.ComponentType<P> {
  const Animated = React.forwardRef<unknown, P>((props, ref) =>
    React.createElement(Component as React.ComponentType<Record<string, unknown>>, {
      ...stripAnimationProps(props as Record<string, unknown>),
      ref,
    }),
  );
  Animated.displayName = `Animated(${Component.displayName ?? Component.name ?? 'Component'})`;
  return Animated as unknown as React.ComponentType<P>;
}

const AnimatedView = createAnimatedComponent<ViewProps>(View);

export const useSharedValue = <T,>(initial: T): { value: T; modify: (modifier?: (value: T) => T) => void } => {
  const ref = React.useRef({
    value: initial,
    modify(modifier?: (value: T) => T) {
      if (modifier) this.value = modifier(this.value);
    },
  });
  return ref.current;
};

export const useAnimatedStyle = <T,>(factory: () => T): T => factory();

export const useAnimatedProps = <T,>(factory: () => T): T => factory();

export const useDerivedValue = <T,>(factory: () => T): { value: T } => ({ value: factory() });

/** A scroll handler that does nothing: the list still scrolls, nothing reads the offset. */
export const useAnimatedScrollHandler = (): (() => void) => () => {};

/** Skipping entering or exiting animations means nothing when there are none. */
export function LayoutAnimationConfig({ children }: { children?: React.ReactNode }): React.ReactElement {
  return <>{children}</>;
}

export const withTiming = <T,>(value: T): T => value;
export const withSpring = <T,>(value: T): T => value;
export const withDelay = <T,>(_delay: number, value: T): T => value;
export const withRepeat = <T,>(value: T): T => value;
export const withSequence = <T,>(...steps: T[]): T => steps[steps.length - 1] as T;
export const cancelAnimation = (): void => {};

export const runOnJS =
  <A extends unknown[], R>(fn: (...args: A) => R) =>
  (...args: A): R =>
    fn(...args);
export const runOnUI =
  <A extends unknown[], R>(fn: (...args: A) => R) =>
  (...args: A): R =>
    fn(...args);

export const Extrapolation = {
  IDENTITY: 'identity',
  CLAMP: 'clamp',
  EXTEND: 'extend',
} as const;

export function interpolate(
  value: number,
  input: readonly number[],
  output: readonly number[],
): number {
  const first = input[0] ?? 0;
  const last = input[input.length - 1] ?? 1;
  const from = output[0] ?? 0;
  const to = output[output.length - 1] ?? 0;
  if (last === first) return from;
  const t = Math.max(0, Math.min(1, (value - first) / (last - first)));
  return from + (to - from) * t;
}

/** Snaps to the nearer endpoint: tests assert endpoints, not blends. */
export function interpolateColor(
  value: number,
  input: readonly number[],
  output: readonly string[],
): string {
  const first = input[0] ?? 0;
  const last = input[input.length - 1] ?? 1;
  const midpoint = (first + last) / 2;
  return (value >= midpoint ? output[output.length - 1] : output[0]) ?? '#000000';
}

const easingFn = (t: number): number => t;

export const Easing = {
  bezier: () => easingFn,
  linear: easingFn,
  ease: easingFn,
  quad: easingFn,
  cubic: easingFn,
  in: () => easingFn,
  out: () => easingFn,
  inOut: () => easingFn,
};

export type ReanimatedKeyframe = Keyframe;
export type AnimatedStyle<T> = T;
export type SharedValue<T> = { value: T };

export class Keyframe {
  constructor(public definitions: Record<string | number, unknown>) {}
  duration(): this {
    return this;
  }
  delay(): this {
    return this;
  }
  withCallback(): this {
    return this;
  }
  reduceMotion(): this {
    return this;
  }
}

class EntryExitBuilder {
  static duration(): EntryExitBuilder {
    return new EntryExitBuilder();
  }
  static delay(): EntryExitBuilder {
    return new EntryExitBuilder();
  }
  static springify(): EntryExitBuilder {
    return new EntryExitBuilder();
  }
  duration(): this {
    return this;
  }
  delay(): this {
    return this;
  }
  springify(): this {
    return this;
  }
  easing(): this {
    return this;
  }
  reduceMotion(): this {
    return this;
  }
  withCallback(): this {
    return this;
  }
  build(): this {
    return this;
  }
}

export const FadeIn = EntryExitBuilder;
export const FadeOut = EntryExitBuilder;
export const FadeOutDown = EntryExitBuilder;
export const SlideInRight = EntryExitBuilder;
export const SlideOutRight = EntryExitBuilder;
export const SlideInDown = EntryExitBuilder;
export const SlideOutDown = EntryExitBuilder;
export const SlideInLeft = EntryExitBuilder;
export const SlideOutLeft = EntryExitBuilder;
export const ZoomIn = EntryExitBuilder;
export const LinearTransition = EntryExitBuilder;

/** Gesture handler drives its callbacks through these when Reanimated is present. */
export const useEvent = <T,>(handler: T): T => handler;
export const useHandler = () => ({ context: {}, doDependenciesDiffer: false, useWeb: false });
export const useComposedEventHandler = <T,>(handlers: T[]): T | undefined => handlers[0];
export const isSharedValue = (value: unknown): boolean => typeof value === 'object' && value !== null && 'value' in value;

export const useReducedMotion = (): boolean => false;

const Animated = {
  View: AnimatedView,
  Text: createAnimatedComponent(Text),
  Image: createAnimatedComponent(Image),
  ScrollView: createAnimatedComponent(ScrollView),
  FlatList: createAnimatedComponent(FlatList),
  createAnimatedComponent,
};

export default Animated;
