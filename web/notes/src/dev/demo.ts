/**
 * The demo: `?demo=…` on the dev server, and every load of the demo build
 * (`npm run build:demo`, published on GitHub Pages by `.github/workflows/pages.yml`).
 * The server's build drops it: `main.tsx` imports it only in dev or in the `demo` mode.
 *
 *  - `?demo` or `?demo=1`: a lived-in board, connected to a fake server in the
 *    page (`fakeServer.ts`) that syncs, serves images and reads links;
 *  - `?demo=setup`: the first-run screen;
 *  - `?demo=empty`: an empty board, no server;
 *  - add `&reading=off` for a server without a Claude key (links kept plain).
 *
 * It uses its own database and settings, and starts afresh on every load, so
 * it can never touch real notes kept in the same browser.
 */
import { setStorageName } from '../app/env';
import { addCheck, createNote } from '../app/store/actions';
import { DEMO_SERVER, FakeServer } from './fakeServer';
import { writeImported } from '../app/store/library';
import { buildDemoRecords } from './demoData';

const NAME = 'carnet-demo';

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
  // `&lang=en`: the demo in English.
  const locale = params.get('lang') === 'en' ? 'en' : 'fr';
  const settings =
    mode === 'setup'
      ? { locale }
      : {
          locale,
          onboarded: true,
          theme: 'system',
          layout: params.get('layout') === 'list' ? 'list' : 'wall',
          server: mode === 'empty' ? null : { url: DEMO_SERVER, token: 'jeton-de-demonstration' },
          // What the app would have cached from an earlier visit.
          reading: mode === 'empty' ? null : reading,
        };
  localStorage.setItem(`${NAME}.settings`, JSON.stringify(settings));

  const server = new FakeServer({ reading });
  const network = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.href);
    return url.origin === DEMO_SERVER ? server.handle(url, init) : network(input, init);
  };
  // A handle for scripted checks: `__carnetDemo.bulk(500)` fills the board.
  (window as unknown as { __carnetDemo: unknown }).__carnetDemo = {
    bulk(count: number): void {
      for (let i = 0; i < count; i += 1) {
        if (i % 3 === 0) {
          const id = createNote({ kind: 'checklist', title: `Liste ${i}` });
          for (let j = 0; j < (i % 7) + 1; j += 1) addCheck(id, `Élément ${j + 1}`);
        } else {
          createNote({ kind: 'text', title: i % 4 === 0 ? '' : `Note ${i}`, body: 'Une ligne de texte pour remplir la carte. '.repeat((i % 5) + 1) });
        }
      }
    },
  };
  return () => {
    if (mode !== 'setup' && mode !== 'empty') writeImported(buildDemoRecords(), Date.now());
  };
}
