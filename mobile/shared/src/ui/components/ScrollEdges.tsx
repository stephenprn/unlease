/**
 * A scroller's edges, softened where content slides under something on screen (both clients: the
 * web's `useScrollEdges`): it dissolves over `EDGE_FADE` on an eased curve, no blur, so a row slides
 * under a still bar, a sheet's title or a form's foot instead of being cut there. An edge that is
 * the screen's own (the foot of a page, of the drawer, of a sheet without actions, the status bar,
 * the keyboard) stays a plain cut: Android finds it from where the scroller lies. A list in a card of
 * its own (a popover) turns both off (`top`, `bottom`). Each edge shows in step with how much lies
 * beyond it, so the top of a list and a list that fits stay crisp. A list right under a search field
 * turns its top off (the field is no bar). Android draws it around the scroller (`ScrollEdgesView`).
 *
 * `ScrollEdges` wraps any vertical scroller (an `Animated.FlatList`, a list in a pull-to-refresh);
 * `EdgeScrollView`, `EdgeFlatList` and `EdgeSectionList` are the plain ones already wrapped, taking
 * the scroller's own props: its layout (flex, size, margins, position) goes to the wrapper, the rest
 * stays on the scroller. A sheet's `SheetScroll` and `SheetFlatList` are wrapped already.
 */
import React from 'react';
import {
  FlatList,
  ScrollView,
  SectionList,
  StyleSheet,
  type FlatListProps,
  type ScrollViewProps,
  type SectionListProps,
  type StyleProp,
  type ViewProps,
  type ViewStyle,
} from 'react-native';

import { ScrollEdgesNativeView } from '@shared/platform/scrollEdges';

/** How long an edge's fade is, the web's `--edge-fade` too. */
export const EDGE_FADE = 24;

export interface EdgeProps {
  /** Soften the top edge where it lies under something (default); off for a list whose top is its own card's. */
  readonly top?: boolean;
  /** Soften the bottom edge where it lies over something (default); off for a list whose foot is its own card's. */
  readonly bottom?: boolean;
  /** Where the top edge stands below the scroller's own top, under a band that hides what scrolls beneath it (the status bar's). */
  readonly insetTop?: number;
}

export interface ScrollEdgesProps extends ViewProps, EdgeProps {
  readonly children: React.ReactNode;
}

/** A scroller, as a ScrollView is laid out by default: it fills what its column leaves it and gives way when there is less. */
const FILL: ViewStyle = { flexGrow: 1, flexShrink: 1 };

export function ScrollEdges({ top = true, bottom = true, insetTop = 0, style, children, ...rest }: ScrollEdgesProps) {
  return (
    <ScrollEdgesNativeView collapsable={false} length={EDGE_FADE} top={top} bottom={bottom} insetTop={insetTop} style={[FILL, style]} {...rest}>
      {children}
    </ScrollEdgesNativeView>
  );
}

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

export function EdgeScrollView({ style, top, bottom, insetTop, ref, ...rest }: ScrollViewProps & EdgeProps & { readonly ref?: React.Ref<React.ComponentRef<typeof ScrollView>> }) {
  const { outer, inner } = splitScrollStyle(style);
  return (
    <ScrollEdges style={outer} top={top} bottom={bottom} insetTop={insetTop}>
      <ScrollView ref={ref} style={inner} {...rest} />
    </ScrollEdges>
  );
}

export function EdgeFlatList<T>({ style, top, bottom, insetTop, ref, ...rest }: FlatListProps<T> & EdgeProps & { readonly ref?: React.Ref<FlatList<T>> }) {
  const { outer, inner } = splitScrollStyle(style);
  return (
    <ScrollEdges style={outer} top={top} bottom={bottom} insetTop={insetTop}>
      <FlatList<T> ref={ref} style={inner} {...rest} />
    </ScrollEdges>
  );
}

export function EdgeSectionList<T, S>({ style, top, bottom, insetTop, ref, ...rest }: SectionListProps<T, S> & EdgeProps & { readonly ref?: React.Ref<SectionList<T, S>> }) {
  const { outer, inner } = splitScrollStyle(style);
  return (
    <ScrollEdges style={outer} top={top} bottom={bottom} insetTop={insetTop}>
      <SectionList<T, S> ref={ref} style={inner} {...rest} />
    </ScrollEdges>
  );
}
