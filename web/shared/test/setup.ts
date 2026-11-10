/**
 * Test environment: IndexedDB in memory (fake-indexeddb), jest-dom matchers,
 * and the few browser APIs jsdom leaves out, stubbed just enough.
 *
 * Each web app's tests run with its own app installed, as its entry does (vite.config.ts names it,
 * `UNLEASE_TEST_APP`): Carnet's with Contacts' data (the shell's tests run with it too), Pages' with Carnet's and
 * Contacts' data, Agenda's with Contacts', Carnet's and Pages' blocks, or Contacts'.
 */
import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { afterEach, beforeAll, vi } from 'vitest';

import { addPagesEnglish } from '@unlease/pages/i18n';

import { installApp } from '../src/modules';

// Every app's English (Pages' brings Carnet's): a sentence is the same in either app's tests.
addPagesEnglish();
// The app loads once the test file has set its mocks (`vi.mock`), so it takes the mocked modules too.
beforeAll(async () => {
  if (import.meta.env.UNLEASE_TEST_APP === 'calendar') {
    const [{ calendarModule }, { contactsData }, { notesData }, { pageBlocksData }] = await Promise.all([import('@calendar/module'), import('@contacts/data'), import('@notes/data'), import('@calendar/app/store/pageBlocks')]);
    installApp(calendarModule, [contactsData, notesData, pageBlocksData]);
  } else if (import.meta.env.UNLEASE_TEST_APP === 'contacts') {
    const { contactsModule } = await import('@contacts/module');
    installApp(contactsModule);
  } else if (import.meta.env.UNLEASE_TEST_APP === 'pages') {
    const [{ pagesModule }, { notesData }, { contactsData }, { eventsData }] = await Promise.all([import('@pages/module'), import('@notes/data'), import('@contacts/data'), import('@notes/app/events/store')]);
    installApp(pagesModule, [notesData, contactsData, eventsData]);
  } else {
    const [{ notesModule }, { contactsData }, { eventsData }] = await Promise.all([import('@notes/module'), import('@contacts/data'), import('@notes/app/events/store')]);
    installApp(notesModule, [contactsData, eventsData]);
  }
});

afterEach(() => {
  cleanup();
});

if (!URL.createObjectURL) {
  let next = 0;
  URL.createObjectURL = () => `blob:test/${(next += 1)}`;
  URL.revokeObjectURL = () => {};
}

window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
