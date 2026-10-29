/**
 * A textarea as tall as its text. CSS `field-sizing: content` does it where
 * supported; elsewhere the height follows `scrollHeight` after each change.
 */
import { useLayoutEffect, type RefObject } from 'react';

const NATIVE = typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('field-sizing', 'content');

export function useAutoGrow(ref: RefObject<HTMLTextAreaElement | null>, value: string): void {
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || NATIVE) return;
    element.style.height = 'auto';
    element.style.height = `${element.scrollHeight}px`;
  }, [ref, value]);
}
