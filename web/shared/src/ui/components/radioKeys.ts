/** A radio group's keys: the arrows move the choice and carry the focus with it (to `[data-key]`); Tab leaves. */
import type { KeyboardEvent } from 'react';

export function arrowKeys<T>(options: readonly T[], value: T, onChange: (next: T) => void, key: (option: T) => string) {
  return (event: KeyboardEvent<HTMLElement>) => {
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const index = Math.max(0, options.indexOf(value));
    const next = options[(index + step + options.length) % options.length] as T;
    onChange(next);
    event.currentTarget.querySelector<HTMLElement>(`[data-key='${key(next)}']`)?.focus();
  };
}
