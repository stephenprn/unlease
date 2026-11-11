/**
 * A multiline input that grows with what is typed keeps its words where they are as lines come:
 * Android would scroll a new line into view a frame before the field is a line taller, the first
 * line jumping out of sight and back (`platform/textFields`). It is held from the start; one with a
 * cap (its `maxHeight`) is let go once it stands at its cap, and scrolls its words from there (the
 * caret brought into view); shorter again, it is held again. What decides is the input's own height
 * as laid out: Fabric's content size leaves out the padding and stops at the frame, so it never
 * reaches the cap.
 */
import { useCallback, useRef } from 'react';
import type { LayoutChangeEvent, TextInput, TextInputContentSizeChangeEvent } from 'react-native';

import { holdScroll } from '../../platform/textFields';

type Input = React.ComponentRef<typeof TextInput>;
type SizeEvent = TextInputContentSizeChangeEvent;

export interface GrowingInput {
  /** Call from the input's ref. */
  readonly attach: (input: Input | null) => void;
  /** Pass on (or call from the input's own); kept for inputs without a cap, which need nothing more. */
  readonly onContentSizeChange: (event: SizeEvent) => void;
  /** Pass on (or call from the input's own): it tells a capped input when it stands at its cap. */
  readonly onLayout: (event: LayoutChangeEvent) => void;
}

export function useGrowingInput(cap?: number): GrowingInput {
  const node = useRef<Input | null>(null);
  const held = useRef(true);
  const attach = useCallback((input: Input | null) => {
    // React Native's input hands its ref over again at every keystroke (null, then itself): the same
    // input keeps its state, or a field let go at its cap would be held again at the next letter.
    if (input === null || input === node.current) return;
    node.current = input;
    held.current = true;
    holdScroll(input, true);
  }, []);
  const onContentSizeChange = useCallback((_event: SizeEvent) => undefined, []);
  const onLayout = useCallback(
    (event: LayoutChangeEvent) => {
      if (cap === undefined) return;
      // A pixel short of the cap it still grows; at it, the words scroll.
      const hold = event.nativeEvent.layout.height < cap - 1;
      if (hold === held.current) return;
      held.current = hold;
      holdScroll(node.current, hold);
    },
    [cap],
  );
  return { attach, onContentSizeChange, onLayout };
}
