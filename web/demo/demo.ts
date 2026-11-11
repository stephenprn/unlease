/**
 * The demo: `?demo=…` on the dev server, and every load of the demo build
 * (`npm run build:demo`, published on GitHub Pages by `.github/workflows/pages.yml`).
 * The server's build drops it: `main.tsx` imports it only in dev or in the `demo` mode.
 *
 *  - `?demo` or `?demo=1`: a lived-in board, connected to a fake server in the
 *    page (`fakeServer.ts`) that syncs, serves images and reads links;
 *  - `?demo=setup`: the first-run screen, the fake server not set up yet (its address is
 *    `DEMO_SERVER`, any token opens it): the apps, « Votre serveur », the appearance;
 *  - `?demo=empty`: an empty board, no server;
 *  - add `&reading=off` for a server without a Claude key (links kept plain), `&apps=notes` for a
 *    server running Carnet alone, `&lang=en` (or `fr`) for its interface's language; without it, the
 *    language it had (the browser's the first time), so another app opened from the launcher speaks
 *    the same. Its notes, pages, events and people are in English whatever the language
 *    (`demoData.ts`).
 *
 * It uses its own database and settings, and starts afresh on every load, so
 * it can never touch real notes kept in the same browser.
 */
import { isReadyApp } from '@unlease/core/apps';

import { setStorageName } from '@shared/app/env';
import { addCheck, createNote } from '@notes/app/store/actions';

import { DEMO_SERVER, FakeServer } from './fakeServer';
import { writeImported } from '@shared/app/store/records';
import { buildDemoRecords } from './demoData';

const NAME = 'unlease-demo';

/** The browser's language, when it is one the demo speaks: French in French, English otherwise. */
function browserLocale(): 'fr' | 'en' {
  return /^fr\b/i.test(navigator.language || '') ? 'fr' : 'en';
}

/** The language of the demo's last load (another app's, or the one picked in its Réglages); the browser's the first time. */
function earlierLocale(): 'fr' | 'en' {
  try {
    const settings = JSON.parse(localStorage.getItem(`${NAME}.settings`) ?? 'null') as { locale?: unknown } | null;
    return settings?.locale === 'en' || settings?.locale === 'fr' ? settings.locale : browserLocale();
  } catch {
    return browserLocale();
  }
}

function deleteDatabase(name: string): Promise<void> {
  return new Promise(resolve => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}

/** Prepares storage and the fake network; returns what to run once the library is loaded. */
export async function startDemo(mode: string): Promise<() => void> {
  setStorageName(NAME);
  await deleteDatabase(NAME);
  const params = new URLSearchParams(location.search);
  const reading = params.get('reading') !== 'off';
  // `&lang=en`: the interface in English; without it, in the language it had.
  const asked = params.get('lang');
  const locale = asked === 'en' || asked === 'fr' ? asked : earlierLocale();
  const apps = (params.get('apps') ?? 'notes,pages,contacts,calendar').split(',').filter(isReadyApp);
  const settings =
    mode === 'setup'
      ? { locale }
      : {
          locale,
          onboarded: true,
          theme: 'system',
          server: mode === 'empty' ? null : { url: DEMO_SERVER, token: 'jeton-de-demonstration' },
          // What the app would have cached from an earlier visit: the apps, and whether Claude reads links.
          serverApps: mode === 'empty' ? null : apps,
          serverFeatures: mode === 'empty' ? {} : { claude: reading },
        };
  localStorage.setItem(`${NAME}.settings`, JSON.stringify(settings));
  // Carnet's own: the board's layout, as an earlier visit left it.
  localStorage.setItem(`${NAME}.notes`, JSON.stringify({ layout: params.get('layout') === 'list' ? 'list' : 'wall' }));

  const server = new FakeServer({ reading, apps, setupDone: mode !== 'setup' });
  // The whole suite's records on the server too, as a real one holds them: what one app asks of another's (where a person is mentioned) finds them.
  const seed = mode === 'setup' || mode === 'empty' ? [] : buildDemoRecords(Date.now());
  server.push(seed);
  // The holidays the real server fetches from Nager.Date (France's, computed here).
  if (seed.length > 0) server.seedHolidays();
  const network = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.href);
    return url.origin === DEMO_SERVER ? server.handle(url, init) : network(input, init);
  };
  // A handle for scripted checks: `__unleaseDemo.bulk(500)` fills the board.
  (window as unknown as { __unleaseDemo: unknown }).__unleaseDemo = {
    bulk(count: number): void {
      for (let i = 0; i < count; i += 1) {
        if (i % 3 === 0) {
          const id = createNote({ kind: 'checklist', title: `List ${i}` });
          for (let j = 0; j < (i % 7) + 1; j += 1) addCheck(id, `Item ${j + 1}`);
        } else {
          createNote({ kind: 'text', title: i % 4 === 0 ? '' : `Note ${i}`, body: 'A line of text to fill the card. '.repeat((i % 5) + 1) });
        }
      }
    },
  };
  return () => {
    if (seed.length > 0) writeImported(seed, Date.now());
  };
}
