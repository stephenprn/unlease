/**
 * Test environment: IndexedDB in memory (fake-indexeddb), jest-dom matchers,
 * and the few browser APIs jsdom leaves out, stubbed just enough.
 */
import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

import { addNotesEnglish } from '@unlease/notes/i18n';

// As main.tsx does at start.
addNotesEnglish();

afterEach(() => {
  cleanup();
});

if (!URL.createObjectURL) {
  let next = 0;
  URL.createObjectURL = () => `blob:test/${(next += 1)}`;
  URL.revokeObjectURL = () => {};
}

window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
