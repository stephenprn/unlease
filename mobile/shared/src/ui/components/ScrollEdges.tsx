/**
 * How a scroller meets what stands around it (DESIGN's Scroll Edges; the web's `useScrollEdges`).
 *
 * Under a head (a top bar, a search strip, a sheet's handle and title, a field over its list, Agenda's
 * pinned day), nothing fades: once content has gone under the scroller's top, the head's line comes in
 * there (1, the hairline's ink, across the whole width, as a footer's `footEdge`), over a short fade
 * (Material 3 tints a bar once content scrolls under it; iOS shows its bar's hairline only then), and
 * leaves again when the list is back at its top. The head itself lies on the ground (or its surface)
 * and the scroller clips what goes under it, so the band stays whole. A top that is the screen's own
 * (the status bar's) has no head and no line: Android finds it from where the scroller lies.
 *
 * A fade is only a box's way to say it goes on (`capped`, `horizontal`): a list capped in a card or a
 * panel with nothing at its ends, and every strip that scrolls sideways, dissolve their ends over
 * `EDGE_FADE` on an eased curve, as strongly as content lies beyond, and only while it does. Never under
 * a bar or a head, never where content leaves the screen, never on a field. A scroller's foot under
 * which something lies (a form's actions, a toolbar, a composer) is a footer's: `footEdge`, never a fade.
 * Android draws the fades and says what goes under the head (`ScrollEdgesView`).
 *
 * `ScrollEdges` wraps any scroller (an `Animated.FlatList`, a list in a pull-to-refresh);
 * `EdgeScrollView`, `EdgeFlatList` and `EdgeSectionList` are the plain ones already wrapped, taking
 * the scroller's own props (`horizontal` too): its layout (flex, size, margins, position) goes to the
 * wrapper, the rest stays on the scroller. A sheet's `SheetScroll` and `SheetFlatList`, a form's
 * `RevealScrollView` and Réglages' `SettingsScroll` are wrapped already.
 */
import React, { useCallback, useState } from 'react';
import {
  FlatList,
  ScrollView,
  SectionList,
  StyleSheet,
  type FlatListProps,
  type NativeSyntheticEvent,
  type ScrollViewProps,
  type SectionListProps,
  type StyleProp,
  type ViewProps,
  type ViewStyle,
} from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, withTiming } from 'react-native-reanimated';

import { ScrollEdgesNativeView, type UnderEvent } from '@shared/platform/scrollEdges';

import { duration, standard } from '../theme/motion';
import { useTheme } from '../theme/ThemeProvider';

/** How long a fading end is, the web's `--edge-fade` too. */
export const EDGE_FADE = 24;

/** Which ends of a fading box fade: both, or only one (a table's start held by its first column). */
export type EdgeFade = 'both' | 'start' | 'end';

export interface EdgeProps {
  /**
   * Its top meets a head (default): the head's line shows there once content has gone under it. Off
   * where nothing stands over it. A capped box has no head.
   */
  readonly top?: boolean;
  /** Where the head's line stands below the scroller's own top, under a band inside it that hides what scrolls beneath (a pinned day head). */
  readonly insetTop?: number;
  /** A box capped mid-content (a card's list, a panel, a sheet's region with nothing under it): its ends fade while content continues past them, and no head's line. */
  readonly capped?: boolean;
  /** Which ends fade, when capped or sideways (both by default). */
  readonly fade?: EdgeFade;
}

export interface ScrollEdgesProps extends ViewProps, EdgeProps {
  /** A scroller that runs sideways (a strip, a row of chips): its sides fade while content continues past them. */
  readonly horizontal?: boolean;
  readonly children: React.ReactNode;
}

/** A scroller, as a ScrollView is laid out by default: it fills what its column leaves it and gives way when there is less. */
const FILL: ViewStyle = { flexGrow: 1, flexShrink: 1 };

/** Marks the head's line, for tests. */
export const HEAD_LINE_ID = 'scroll-head-line';

export function ScrollEdges({ top = true, insetTop = 0, capped = false, fade = 'both', horizontal = false, style, children, ...rest }: ScrollEdgesProps) {
  const theme = useTheme();
  const reduced = useReducedMotion();
  const fades = capped || horizontal;
  const head = top && !fades;
  const [under, setUnder] = useState(false);
  const onUnder = useCallback((event: NativeSyntheticEvent<UnderEvent>) => setUnder(event.nativeEvent.under), []);
  const shown = head && under;
  // In over a short fade once content goes under the head, out as it comes back to the top; at once under Reduce Motion.
  const line = useAnimatedStyle(() => ({ opacity: withTiming(shown ? 1 : 0, { duration: reduced ? 0 : duration.short, easing: standard }) }), [shown, reduced]);
  return (
    <ScrollEdgesNativeView
      collapsable={false}
      length={EDGE_FADE}
      top={head}
      insetTop={insetTop}
      horizontal={horizontal}
      fadeStart={fades && fade !== 'end'}
      fadeEnd={fades && fade !== 'start'}
      onUnder={head ? onUnder : undefined}
      style={[FILL, style]}
      {...rest}
    >
      {children}
      {head ? (
        <Animated.View
          testID={HEAD_LINE_ID}
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[edgeStyles.line, { top: insetTop, backgroundColor: theme.color.hairline }, line]}
        />
      ) : null}
    </ScrollEdgesNativeView>
  );
}

const edgeStyles = StyleSheet.create({
  // The head's line: across the scroller's whole width, 1 as a footer's edge, over what slides under it.
  line: { position: 'absolute', left: 0, right: 0, height: 1 },
});

/** What of a scroller's style lays it out among its siblings: the wrapper takes it. */
const LAYOUT_KEYS = new Set<keyof ViewStyle>([
  'flex',
  'flexGrow',
  'flexShrink',
  'flexBasis',
  'alignSelf',
  'position',
  'top',
  'bottom',
  'left',
  'right',
  'start',
  'end',
  'inset',
  'insetBlock',
  'insetInline',
  'zIndex',
  'width',
  'height',
  'minWidth',
  'minHeight',
  'maxWidth',
  'maxHeight',
  'margin',
  'marginTop',
  'marginBottom',
  'marginLeft',
  'marginRight',
  'marginStart',
  'marginEnd',
  'marginHorizontal',
  'marginVertical',
  'marginBlock',
  'marginBlockStart',
  'marginBlockEnd',
  'marginInline',
  'marginInlineStart',
  'marginInlineEnd',
]);

/** Splits a scroller's style: its layout for the wrapper, the rest (paddings, colours) for itself, which then fills the wrapper. */
export function splitScrollStyle(style: StyleProp<ViewStyle>): { readonly outer: ViewStyle; readonly inner: ViewStyle } {
  const flat = (StyleSheet.flatten(style) ?? {}) as Record<string, unknown>;
  const outer: Record<string, unknown> = {};
  const inner: Record<string, unknown> = { flexGrow: 1, flexShrink: 1 };
  for (const [key, value] of Object.entries(flat)) {
    if (LAYOUT_KEYS.has(key as keyof ViewStyle)) outer[key] = value;
    else inner[key] = value;
  }
  return { outer: outer as ViewStyle, inner: inner as ViewStyle };
}

type EdgeOwnProps = EdgeProps & { readonly horizontal?: boolean | null };

export function EdgeScrollView({ style, top, insetTop, capped, fade, horizontal, ref, ...rest }: ScrollViewProps & EdgeOwnProps & { readonly ref?: React.Ref<React.ComponentRef<typeof ScrollView>> }) {
  const { outer, inner } = splitScrollStyle(style);
  return (
    <ScrollEdges style={outer} top={top} insetTop={insetTop} capped={capped} fade={fade} horizontal={!!horizontal}>
      <ScrollView ref={ref} style={inner} horizontal={horizontal} {...rest} />
    </ScrollEdges>
  );
}

export function EdgeFlatList<T>({ style, top, insetTop, capped, fade, horizontal, ref, ...rest }: FlatListProps<T> & EdgeOwnProps & { readonly ref?: React.Ref<FlatList<T>> }) {
  const { outer, inner } = splitScrollStyle(style);
  return (
    <ScrollEdges style={outer} top={top} insetTop={insetTop} capped={capped} fade={fade} horizontal={!!horizontal}>
      <FlatList<T> ref={ref} style={inner} horizontal={horizontal} {...rest} />
    </ScrollEdges>
  );
}

export function EdgeSectionList<T, S>({ style, top, insetTop, capped, fade, ref, ...rest }: SectionListProps<T, S> & EdgeProps & { readonly ref?: React.Ref<SectionList<T, S>> }) {
  const { outer, inner } = splitScrollStyle(style);
  return (
    <ScrollEdges style={outer} top={top} insetTop={insetTop} capped={capped} fade={fade}>
      <SectionList<T, S> ref={ref} style={inner} {...rest} />
    </ScrollEdges>
  );
}
