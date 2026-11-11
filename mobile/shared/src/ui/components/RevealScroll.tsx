/**
 * A form's scroller that can bring one of its fields up to its top (`useReveal`): a place field
 * whose suggestions open under it, so the field and its rows stand together above the keyboard
 * instead of the rows hiding under it. A field asks as it takes the caret and again as its rows
 * appear; the keyboard rising asks once more, and so does the scroller shortened under it (a
 * `KeyboardAvoidingView` pads after the keyboard has risen), so the field lands where it was meant to.
 */
import React, { createContext, forwardRef, useCallback, useContext, useEffect, useImperativeHandle, useRef } from 'react';
import { Keyboard, ScrollView, type ScrollViewProps, type View } from 'react-native';

import { ScrollEdges, splitScrollStyle, type EdgeProps } from './ScrollEdges';

type Box = React.ComponentRef<typeof View>;
type Scroller = React.ComponentRef<typeof ScrollView>;

/** Brings this field (its wrapping view) up to the scroller's top. */
export type Reveal = (node: Box | null) => void;

const RevealContext = createContext<Reveal | null>(null);

/** The scroller's way to bring a field up, or null outside a `RevealScrollView`. */
export const useReveal = (): Reveal | null => useContext(RevealContext);

/** Room kept above the field (its label stays clear of the top bar's edge). */
const ROOM = 8;
/** How long after a field asked the keyboard's arrival, and the scroller's new height, still move it. */
const KEYBOARD_WAIT_MS = 1200;

export const RevealScrollView = forwardRef<Scroller, ScrollViewProps & EdgeProps>(function RevealScrollView({ children, onLayout, style, top, bottom, ...rest }, ref) {
  const scroller = useRef<Scroller>(null);
  const asked = useRef<{ node: Box; at: number } | null>(null);
  useImperativeHandle(ref, () => scroller.current!, []);

  const bringUp = useCallback((node: Box) => {
    const view = scroller.current;
    const inner = view?.getInnerViewRef();
    if (!view || !inner) return;
    node.measureLayout(
      inner,
      (_x: number, y: number) => view.scrollTo({ y: Math.max(0, y - ROOM), animated: true }),
      () => undefined,
    );
  }, []);

  const reveal = useCallback<Reveal>(
    node => {
      if (!node) return;
      asked.current = { node, at: Date.now() };
      bringUp(node);
    },
    [bringUp],
  );

  // The field asked a moment ago is brought up again once the keyboard is up, and once the scroller has its new height.
  const again = useCallback(() => {
    const last = asked.current;
    if (last && Date.now() - last.at < KEYBOARD_WAIT_MS) bringUp(last.node);
  }, [bringUp]);

  useEffect(() => {
    const subscription = Keyboard.addListener('keyboardDidShow', again);
    return () => subscription.remove();
  }, [again]);

  const { outer, inner } = splitScrollStyle(style);
  return (
    <RevealContext.Provider value={reveal}>
      {/* The form's ends soften under the top bar and the keyboard while it runs on past them. */}
      <ScrollEdges style={outer} top={top} bottom={bottom}>
        <ScrollView
          ref={scroller}
          style={inner}
          onLayout={event => {
            again();
            onLayout?.(event);
          }}
          {...rest}
        >
          {children}
        </ScrollView>
      </ScrollEdges>
    </RevealContext.Provider>
  );
});
