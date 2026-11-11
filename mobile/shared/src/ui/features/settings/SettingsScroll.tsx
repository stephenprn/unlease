/**
 * Réglages' scroll, landing on the section a search asked for (the `Settings` screen's `section`,
 * `core/services/settingsSearch`): each section with an `anchor` says where it lies as it is laid
 * out, and the scroll goes to the one asked for, following it while the sections above it settle
 * (a status read, a list filled), until the person moves the scroll themself.
 */
import React, { createContext, useCallback, useContext, useRef } from 'react';
import { ScrollView, type LayoutChangeEvent, type ScrollViewProps } from 'react-native';

import { ScrollEdges, splitScrollStyle } from '../../components/ScrollEdges';

type Report = (anchor: string, y: number) => void;

const AnchorContext = createContext<Report | null>(null);

/** Over the section landed on, the room the screen's list keeps at its top (its 12 of padding). */
const LAND_GAP = 12;

export function SettingsScroll({ section, children, onScrollBeginDrag, style, ...props }: ScrollViewProps & { readonly section?: string | null }) {
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const moved = useRef(false);
  const report = useCallback(
    (anchor: string, y: number) => {
      if (anchor !== section || moved.current) return;
      // After this layout pass, so the content is as tall as it will be drawn.
      requestAnimationFrame(() => scroll.current?.scrollTo({ y: Math.max(0, y - LAND_GAP), animated: false }));
    },
    [section],
  );
  const { outer, inner } = splitScrollStyle(style);
  return (
    <AnchorContext.Provider value={report}>
      <ScrollEdges style={outer}>
        <ScrollView
          ref={scroll}
          style={inner}
          {...props}
          onScrollBeginDrag={event => {
            moved.current = true;
            onScrollBeginDrag?.(event);
          }}
        >
          {children}
        </ScrollView>
      </ScrollEdges>
    </AnchorContext.Provider>
  );
}

/** A section's own layout, told to the scroll it lies in, when it is one a search can land on. */
export function useAnchorLayout(anchor: string | undefined): ((event: LayoutChangeEvent) => void) | undefined {
  const report = useContext(AnchorContext);
  if (!anchor || !report) return undefined;
  return event => report(anchor, event.nativeEvent.layout.y);
}
