# Unlease on the web

A web app per app, on the shell they share: **Carnet** (notes, checklists, drawings, collections of links, labels) at `/notes`, **Pages** (nested pages, tables, embeds of Carnet's notes and collections, mentions of contacts) at `/pages` and **Contacts** (the address book: favourites, labels, birthdays, Google's imports) at `/contacts`. Each is its own page, build, manifest, icon, service worker and IndexedDB database, installed on its own, as each has its own APK (`mobile/notes`, `mobile/pages`, `mobile/contacts`); on one origin they share the device's settings, so the next asks nothing again, and a link from one into another opens it. The same data as the Android apps, synced through the Unlease server. Static single-page apps (React, Vite, TypeScript). In French or English (`@unlease/core/i18n`), no Google service, no analytics; the Signika font is self-hosted.

They share the repository's packages with the phones and the server (`../packages`): the platform (`@unlease/core`: the sync engine and merge, ids, references, rich text, search, formatting, the apps' registry, the first run), the design system (`@unlease/design`), and each app's domain (`@unlease/notes`, `@unlease/contacts`, `@unlease/pages`).

## Layout

One install, one lint, one typecheck for all of it; a build per app.

| Where | What |
| --- | --- |
| `shared/src` (`@shared/*`) | The shell: boot, IndexedDB and the records (`app/store/records`), the sync loop and transport, the device's settings and the server's, the router, the components and styles, the setup, Réglages, the Administration, the appearance, the spotlight's frame, the navigation's frame, the app's brand and the suite's launcher (`ui/navigation/AppBrand.tsx`), the start (`start.tsx`). What an app brings is `modules.ts` (`AppModule`, with its `data`: its records' projection; routes, screens, navigation, overlays, spotlight documents, Administration and Réglages sections, keys); `installApp(module, reads)` installs the app and the data of those it reads. It imports no app. |
| `shared/test` (`@test/*`) | The tests' setup and helpers. |
| `notes` (`@notes/*`) | Carnet's web app: its page (`index.html`), its entry (`src/main.tsx`), its module (`src/module.tsx`), its data (`src/data.ts`, `notesData`: its projection, what it seeds, its photos waiting to be sent, its places' addresses, which Pages' app installs too), its screens, its places under `/notes`. It never imports Pages (but Pages' copies' contract). |
| `pages` (`@pages/*`) | Pages' web app: its page, its entry (installing Carnet's data beside it), its module, the editor, its places under `/pages`. It may import Carnet's pieces (it shows its collections, notes and links) and Contacts' data (`@contacts/data`, `@contacts/app/store/library`: the people its pages mention, kept under `contacts` in its library). |
| `contacts` (`@contacts/*`) | Contacts' web app: its page, its entry, its module, its data (`src/data.ts`, `contactsData`, which Pages' app installs too), the list, a contact's page and form, labels, birthdays, the import and export, the bin, its places under `/contacts`. It never imports Carnet, nor Carnet it. |
| `demo` (`@demo/*`) | The demo and its fake server, imported by the entries in the dev server and the demo build only. |
| `build` | The Vite plugin (`suitePlugin`: the design tokens, each app's title, manifest and icons, the dev server serving every app) and each app's brand files (`brand.ts`: its tab and install icons, its mark on the matcha pebble, and its manifest). |
| `public` | What every app's build holds: the fonts, the grain, the app's service worker (`sw.js`, scoped to its path). |
| `root` | What the site's root holds once built: a static host's headers and rewrites (`_headers`, `_redirects`) and the worker that retires v0.1's single one (`sw.js`). |
| `scripts/build.mjs` | Builds each app (`UNLEASE_APP=<app> vite build`, into `dist/<app>/`), then the root's files. |

ESLint enforces the areas (`eslint.config.js`); an area's `ui` reaches IndexedDB only through its `app`.

## Develop

Node 24 (see `.nvmrc`). Installed with the repository's workspace, from its root:

```sh
npm install           # at the repository's root
npm run dev -w web    # every app on http://localhost:5173: /notes, /pages and /contacts (`/` goes to /notes)
```

The dev server serves every app as the server does, so a link from one into the other works there too.

The demo (its own database, reset on each load, with a fake server in the page that syncs, serves images, reads links and makes copies), never in the server's build; `?demo` goes along a link into the other app:

- `/notes?demo`, `/pages?demo`, `/contacts?demo` lived in, connected
- `?demo=setup` the first run, against a server not set up yet (address `https://unlease.maison.example`, any token): the apps, « Votre serveur », the appearance
- `?demo=empty` nothing, no server
- add `&apps=notes` for a server running Carnet alone, `&reading=off` for one without a Claude key, `&lang=en` or `&lang=fr` for its language (else the browser's; kept as you go from one app to another), its records in that language too (`demo/demoEnglish.ts`)

`npm run build:demo` builds every app as a static site into `dist-demo/` (`notes/`, `pages/`, `contacts/`, `agenda/`), where every load is the demo, its root sending to Carnet and its `404.html` sending an app's address to that app's page; `-- --base /sub/path/` for a host that serves it under a path. Each release publishes it on GitHub Pages (`.github/workflows/pages.yml`), at `https://demo.unlease.org` (a fork without a domain of its own: under `/<repository>/` on its `github.io` site).

| Script | |
| --- | --- |
| `npm run build` | type-check, then build every app to `dist/notes/`, `dist/pages/` and `dist/contacts/` (and the root's files) |
| `npm run build:demo` | the demo as a static site, in `dist-demo/` |
| `npm test` | Vitest, a project per app: `notes` (Carnet's tests, the shell's and the demo's, Carnet installed), `pages` (Pages' tests, Pages installed with Carnet's data) |
| `npm run lint` | ESLint, zero warnings |
| `npm run typecheck` | both TypeScript programs (apps, build tooling) |
| `npm run verify` | all of the above, then both builds |
| `npm run screenshots` | every surface, light and dark, 1440 and 390 px, into `../.impeccable/review/web/` (Playwright; run `npx playwright install chromium` once) |
| `npm run readme-images` | the README's pictures, light and dark, into `../docs/images/`: the demo's screens and the diagrams drawn from the design system (`scripts/readme/pictures.mjs`); `-- links run` redraws only those |

## Deploy

The simplest is to let the server serve them: the published image builds both apps and hands each out under its path beside the API, on the same address (`docs/SELF-HOSTING.md`). The first run then shows the server's address, asking only its token.

They are also plain static files (`npm run build`, then `dist/`), for any static host. A host must answer an app's unknown path with that app's `index.html` (deep links such as `/pages/:id`), send `/` to `/notes`, and send the headers in `dist/_headers` (each app's worker needs `Service-Worker-Allowed` for its path); `dist/_redirects` does the first two on Cloudflare Pages. The server must then allow the site's origin: `UNLEASE_CORS_ORIGINS=https://<the site>`.

### Cloudflare Pages

| Setting | Value |
| --- | --- |
| Root directory | `/` (the repository's root: the workspace installs there) |
| Build command | `npm run build -w web` |
| Build output directory | `web/dist` |
| Node version | from `web/.nvmrc` (24), or `NODE_VERSION=24` |

## Places

Carnet: `/notes`, `/notes/reminders`, `/notes/archive`, `/notes/trash`, `/notes/label/:id`, `/notes/note/:id`, `/notes/lines`, `/notes/line/:id`, `/notes/link/:id`, `/notes/labels`, `/notes/capture/:kind` (the installed app's shortcuts and share target; any page can open them, so a share only prefills the capture dialog, or asks before becoming a note, and keeps its first 20 links). Pages: `/pages`, `/pages/trash`, `/pages/:id` (`#block-<id>` for a block). The shell's, under each app's path: `/notes/settings`, `/notes/admin`, `/notes/admin/:section` (the same under `/pages`). An address of the other app loads that app's page. The server sends `/` to the first app it runs, and an address of v0.1's single app (`/note/:id`, `/page/:id`, `/settings`…) to its place. An app the server does not run says so in place of its pages, and turns it on in one tap.

## The server

Set on first run (or in Administration): the server's address (shown when the server serves the app) and its token (`UNLEASE_TOKEN`). On a server whose own setup is not done, the first run also picks its apps (`PUT /api/settings { apps }`, the app being set up kept on) and what it does for them (the app's own forms only: another app's are set from it), then marks it set up (`{ setupDone: true }`). The other app's web app finds all of it done, on the same address.

- `GET /api/health`: the apps the server runs and whether its setup is done (no token).
- `POST /api/sync` with `Authorization: Bearer <token>`: one loop while the tab is visible, naming the record types of the app and of those it reads (`types`: Carnet's alone, or Pages' and Carnet's); a new list pulls again from 0. Local edits push after 700 ms; otherwise a 25 s long-poll waits for the server's changes.
- `GET /api/blobs/:id`, `PUT /api/blobs/:id` (photos), `PUT /api/files/:id` (a page's videos, PDFs and files).
- `GET/PUT /api/settings`: the apps, Claude's key (checked by the server, never stored in the browser), model and budget, S3, Seafile, Seerr, the questions about pages; `GET /api/usage` for Claude's spending.
- `/api/admin…`: the Administration (`@unlease/core/sync/admin`).
- Carnet's routes (`/api/sort`, the link modules) and Pages' (`/api/pages/ask`, `/api/pages/copies`, which « Garder une copie » calls from Carnet: Pages makes the page on the server and sets the link's `copy`). An app turned off answers 404.

## Storage

- IndexedDB, a database per app (`carnet`, as Carnet's web app has always named it, and `pages`): the records it syncs with their field clocks and pending marks, the sync cursor and the types it was pulled with, this browser's clock node, and photos and page files waiting for upload. Memory is the working copy (`shared/src/app/store/records`, the app folding its records); writes reach disk a tick later.
- localStorage, the device's, every app's (`unlease.settings`): server address and token, the apps it runs as last heard, theme, grain, the colours and the ground, the interface language, the first run done; a change in one app's tab is followed in the other's, and v0.1's `carnet.settings` is read until it exists. The app's own, under its slug: `carnet.notes` (the board's layout, what the server said about links), `pages.pages` (the tree's open branches, the last page read), `<slug>.nav` (the folded sections), `<slug>.spotlight`.
- Several tabs of one app share its database: each posts its writes to the others (BroadcastChannel) and ticks its own clock.

## Keyboard

`/` search, `Ctrl K` or `⌘P` the spotlight (the app's own), `?` all shortcuts. Carnet: `C` / `L` / `D` new note / checklist / drawing, `K` classify a link, `V` the copied link, `X` select, `E` / `#` archive / delete. Pages: `P` new page; in a page, `/` adds a block and `@` cites a page, a note, a collection or a link.
