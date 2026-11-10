/**
 * A multiline input that grows with what is typed keeps its words where they are as lines come:
 * Android would scroll a new line into view a frame before the field is a line taller, the first
 * line jumping out of sight and back (`platform/textFields`). It is held from the start; one with a
 * cap (its `maxHeight`) is let go once its words reach it, and scrolls them from there.
 */
import { useCallback, useRef } from 'react';
import type { TextInput, TextInputContentSizeChangeEvent } from 'react-native';

import { holdScroll } from '../../platform/textFields';

type Input = React.ComponentRef<typeof TextInput>;
type SizeEvent = TextInputContentSizeChangeEvent;

export interface GrowingInput {
  /** Call from the input's ref. */
  readonly attach: (input: Input | null) => void;
  /** Pass on (or call from the input's own): it tells a capped input when its words reach the cap. */
  readonly onContentSizeChange: (event: SizeEvent) => void;
}

export function useGrowingInput(cap?: number): GrowingInput {
  const node = useRef<Input | null>(null);
  const held = useRef(true);
  const attach = useCallback((input: Input | null) => {
    if (input === node.current) return;
    node.current = input;
    held.current = true;
    holdScroll(input, true);
  }, []);
  const onContentSizeChange = useCallback(
    (event: SizeEvent) => {
      if (cap === undefined) return;
      // A pixel short of the cap still grows; at it, the words scroll.
      const hold = event.nativeEvent.contentSize.height < cap - 1;
      if (hold === held.current) return;
      held.current = hold;
      holdScroll(node.current, hold);
    },
    [cap],
  );
  return { attach, onContentSizeChange };
}
