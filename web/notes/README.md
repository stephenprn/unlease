# Carnet on the web

The desktop (and phone browser) app of Carnet, Unlease's notes app: the same notes, checklists, collections of links and pages as the Android app (`mobile/notes`), synced through the Unlease server. A static single-page app (React, Vite, TypeScript). In French or English (`@unlease/core/i18n`), no Google service, no analytics; the Signika font is self-hosted.

It shares the repository's packages with the phone and the server (`../../packages`): the platform (`@unlease/core`: the sync engine and merge, ids, references, rich text, search, formatting), the design system (`@unlease/design`: the palette, the shapes, the icons, the mark) and Carnet's domain (`@unlease/notes`: models, the brick wall, the Keep Takeout parser, the English dictionary).

## Develop

Node 24 (see `.nvmrc`). Installed with the repository's workspace, from its root:

```sh
npm install                  # at the repository's root
npm run dev -w web/notes     # http://localhost:5173 (or `npm run dev` here)
```

The demo (its own database, reset on each load, with a fake server in the page that syncs, serves images and reads links), never in the server's build:

- `/?demo` a lived-in board and pages, connected
- `/?demo=setup` the first-run screen
- `/?demo=empty` an empty board, no server

`npm run build:demo` builds it as a static site into `dist-demo/`, where every load is the demo (`?demo=setup` and `?demo=empty` still apply); `-- --base /sub/path/` for a host that serves it under a path. Each release publishes it on GitHub Pages (`.github/workflows/pages.yml`), at `https://stephenprn.github.io/unlease/`.

| Script | |
| --- | --- |
| `npm run build` | type-check, then build to `dist/` |
| `npm run build:demo` | the demo as a static site, in `dist-demo/` |
| `npm run preview` | serve `dist/` |
| `npm test` | Vitest (store, IndexedDB, sync loop, Keep import, board, editor, line page, pages) |
| `npm run lint` | ESLint, zero warnings |
| `npm run typecheck` | both TypeScript programs (app, build tooling) |
| `npm run verify` | all of the above, then a build |
| `npm run screenshots` | every surface, light and dark, 1440 and 390 px, into `../../.impeccable/review/web/` (Playwright; run `npx playwright install chromium` once) |

## Deploy

The simplest is to let the server serve it: the published image builds this app and hands it out at `/` beside the API, on the same address (`docs/SELF-HOSTING.md`). The first-run screen then fills in the server's address by itself.

It is also plain static files (`npm run build`, then `dist/`), for any static host. Two things a host must do: answer an unknown path with `index.html` (deep links such as `/page/:id`), and send the headers in `public/_headers` (Cloudflare Pages and Netlify read that file; elsewhere copy them into the host's config). The server must then allow the site's origin: `UNLEASE_CORS_ORIGINS=https://<the site>`.

### Cloudflare Pages

| Setting | Value |
| --- | --- |
| Root directory | `/` (the repository's root: the workspace installs there) |
| Build command | `npm run build -w web/notes` |
| Build output directory | `web/notes/dist` |
| Node version | from `web/notes/.nvmrc` (24), or `NODE_VERSION=24` |

Pages clones the whole repository, so `packages/` is there at build time. With no `404.html`, Pages serves `index.html` for unknown paths: deep links (`/note/:id`, `/line/:id`, `/link/:id`, `/page/:id`, `/settings`, `/admin`…) need no `_redirects`. `public/_headers` sets the CSP (which lets pages play videos, show PDFs and frame YouTube, Vimeo and Dailymotion players) and security headers and caches `/assets` and `/fonts` for a year.

## The server

Set on first run (or in Administration): the server's address (filled in when the server serves this app) and its token (`UNLEASE_TOKEN`). Hosted apart, the server must allow this site's origin: `UNLEASE_CORS_ORIGINS=https://<the site>` (and `http://localhost:5173` for development).

- `POST /api/sync` with `Authorization: Bearer <token>`: one loop while the tab is visible. Local edits push after 700 ms; otherwise a 25 s long-poll waits for the server's changes. Errors back off from 2 s to 60 s; a refused token stops until the settings change; a hidden tab stops.
- `GET /api/blobs/:id?variant=display|original` (images, shown through object URLs) and `PUT /api/blobs/:id` (photos added here, multipart field `file`); `PUT /api/files/:id` for a page's videos, PDFs and files, kept as sent.
- `GET /api/health` and a probe sync check an address and token; `GET /api/usage` feeds the Claude spending in Administration.
- `GET/PUT /api/settings`: the Claude key (checked by the server, never stored in the browser), the model and the monthly budget; the S3 backup and the Seafile folder (keys and tokens tested by the server, kept there). Without a key, links are kept plain (`skipped`) and nothing is read.
- `GET /api/admin` (asked again every 3 s while a backup, a pass over the drive or a restore runs), `/api/admin/backups`, `/api/admin/drive/sync`, `/api/admin/restore` (a snapshot by name, or the archive as the body) and `/api/admin/downloads` (a short-lived address the browser downloads from without the token): the Administration (`@unlease/core/sync/admin`).
- `POST /api/sort`: Claude sorting saved links ("Ranger Non classé", "Vérifier les liens", a new collection taking from Non classé, a deleted collection's links); the app writes the moves it answers as one undoable batch.

## Storage

- IndexedDB (`carnet`): every record with its field clocks and pending mark, the sync cursor, this browser's clock node, and photos and page files waiting for upload. Memory is the working copy; writes reach disk a tick later.
- localStorage (`carnet.settings`): server address and token, theme, board layout, grain, the interface language (also the language Claude writes the links saved here in); `carnet.pages`: the tree's open branches, the toggles open and the last page read.
- Several tabs share the database: each posts its writes to the others (BroadcastChannel) and ticks its own clock.

## Keyboard

| Key | |
| --- | --- |
| `/` | search |
| `C` / `L` | new note / new checklist |
| `K` | classify a link |
| `V` | classify the copied link |
| `Ctrl V` on the board | file the pasted link (on a line's page: add it there) |
| `X`, `Shift` click, `Ctrl` click | select notes |
| `E` / `#` | archive / delete (the note open, the focused card, or the selection; collections holding links ask where those go first) |
| `Ctrl Entrée` | close the editor |
| `Échap` | close, or clear the selection or the search |
| `?` | all shortcuts |

In a checklist: `Entrée` splits the item at the caret, `Retour` on an empty item removes it, `Alt ↑ / ↓` moves it.

In a page: `/` adds a block and `@` cites a page, a note, a collection or a link; Markdown at a line's start turns it into its block (`#` to `####`, `-`, `1.`, `[]`, `>` a toggle, `"` a callout, ```` ``` ```` code) and `**`, `*`, `~~`, `` ` `` mark words. `Ctrl B / I / U / E` bold, italic, underline, code; `Ctrl Maj S` strikethrough; `Ctrl K` a link; `Tab` / `Maj Tab` nest and unnest; `Ctrl Maj ↑ / ↓` move the block; `Ctrl D` duplicates it; `Échap` selects it (then arrows, `Retour` deletes); `Ctrl A` twice selects every block; `Ctrl Z` / `Ctrl Maj Z` undo and redo in the page.
