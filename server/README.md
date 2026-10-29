# Unlease server

The one server behind every app of Unlease: the platform (sync, files, settings, backups, the drive) and each app's own module (`src/apps/<app>`: Carnet's link reading, modules and bin in `src/apps/notes`). One owner, one bearer token, one SQLite file. The published image (`ghcr.io/stephenprn/unlease`, from the repository's root `Dockerfile`) also serves the web apps on the same port; how to run it: `docs/SELF-HOSTING.md`. How an app plugs in: `docs/ARCHITECTURE.md`, The server's apps.

- **Sync**: `POST /api/sync` merges what a device sends (field-wise last-writer-wins on hybrid logical clocks, the same `@unlease/core/sync` code the apps run, every record type the apps declare) and answers with everything past the device's cursor, holding the answer open for long polling when there is nothing to say.
- **Photos**: notes' images are uploaded once and served back as an original and a WebP display copy.
- **Backups**: to any S3 store (Scaleway, OVH, AWS, MinIO), on a schedule or on demand: a readable archive (Markdown and `unlease.json`) each time, each photo and file once. Any backup restores from the apps' Administration, from S3 or from a downloaded archive.
- **Files in a drive**: with Seafile set, photos, videos and documents live in a folder of a Seafile library, under each app's own folder (`Carnet/`), named after what holds them (a note, a page); the server keeps only the display copies.
- **Carnet's links**: when a Claude key is set from the apps' settings screens, every link synced as `status: 'pending'` is read by the server, described by Claude in the link's language (`lang`, the interface language of the device that saved it: French or English) (title, summary, kind, price, key facts), its images kept as blobs, and, for links from the quick input (`autoFile`), filed into the best-matching URL list or "Non classé". Without a key nothing is read: links become `skipped`.

## Run locally

Node 24 or newer.

```sh
npm install                  # at the repository's root: the workspace installs the server too
cp .env.example .env         # set UNLEASE_TOKEN, and UNLEASE_DATA_DIR=./data (the Claude key is set from the apps)
npm run dev                  # tsx watch, reads .env
npm run verify               # typecheck + tests
npm run build && npm start   # the bundle the image runs (dist/server.mjs)
```

Everything except `sharp` is bundled by esbuild into `dist/server.mjs`, which is why the other packages are devDependencies. The shared packages are imported as `@unlease/core/*`, `@unlease/design/*` and `@unlease/notes/*` (`tsconfig.json` paths, the esbuild alias in `build.mjs`, the vitest alias in `vitest.config.ts`). The platform (everything outside `src/apps/`) never imports an app's package.

## Configuration

| Variable | Default | |
|---|---|---|
| `UNLEASE_TOKEN` | (required) | Bearer token. The server refuses to start without it. |
| `UNLEASE_DATA_DIR` | `/data` | `unlease.sqlite`, `blobs/` and `backups/`. |
| `PORT` | `8080` | |
| `UNLEASE_CORS_ORIGINS` | none | Comma-separated browser origins of a web app hosted apart (a static host) or its dev server, e.g. `https://notes.example.org,http://localhost:5173`. The app this server serves itself needs none. |
| `UNLEASE_WEB_DIR` | none (`/app/web` in the image) | A web app build (`web/notes/dist`) to serve at `/` beside the API; unset, the server answers the API alone. |
| `UNLEASE_CLAUDE_EFFORT` | `low` | `low`, `medium`, `high`, `xhigh`, `max`. |
| `UNLEASE_ANALYSIS_CONCURRENCY` | `2` | Links analysed at once. |
| `ANTHROPIC_API_KEY` | none | Optional fallback for the key set in the apps. |
| `UNLEASE_CLAUDE_MODEL` | `claude-opus-5-5` | Fallback for the model set in the apps: `claude-opus-5-5`, `claude-sonnet-5-5` or `claude-haiku-5-5`. |
| `UNLEASE_MONTHLY_BUDGET_USD` | `15` | Fallback for the budget set in the apps. |
| `TZ` | `UTC` | The time zone of the names the drive and the backups' Markdown give photos (`2026-10-26 14.03.12.jpg`), e.g. `Europe/Paris`. |

The Claude key, the model and the monthly budget are normally set from the apps' Administration (`PUT /api/settings`) and stored in the database: a value set from the apps wins over the environment, which wins over the default. They are read for every link, so a change applies without a restart. The S3 backup and the drive are set from the apps only.

## API

JSON everywhere except blob bytes. Every route needs `Authorization: Bearer <UNLEASE_TOKEN>` except `GET /api/health` and CORS preflights; a wrong token is `401 {"error"}`, and ten failures in a minute from one client (`CF-Connecting-IP`, then `X-Real-IP`, then the socket) turn into `429` with `Retry-After` for that address. Bodies are limited to 1 MB, 4 MB for `/api/sync` (room for any one record with the bases of its text, however escaped), 25 MB for blob uploads and 100 MB for `/api/files`.

### `GET /api/health`

`{ "ok": true, "version": "0.1.0", "apiVersion": 1, "apps": ["notes"], "analysis": true }`: `apps` lists the apps this server runs (`APPS` in `@unlease/core/apps`), `analysis` says whether a Claude key is set right now.

### `GET /api/settings`

`ServerSettings` from `@unlease/core/sync/settings`:

```json
{
  "analysis": { "enabled": true, "keySource": "app", "keyHint": "…k3Xq", "model": "claude-opus-5-5", "budgetUsd": 15 },
  "backup": { "configured": true, "endpoint": "https://s3.fr-par.scw.cloud", "region": "fr-par", "bucket": "unlease", "prefix": "unlease/", "accessKeyId": "SCW…", "secretHint": "…9f2c", "recurrence": "daily", "keep": 30 },
  "drive": { "provider": "seafile", "url": "http://192.168.1.20:8000", "folder": "/Unlease", "library": "Documents", "tokenHint": "…ab12", "leaving": false }
}
```

`keySource` is `app`, `env` or `null`. Keys, secrets and tokens never come back: only their last four characters.

### `PUT /api/settings`

A `SettingsPatch` (`{ anthropicApiKey?, model?, budgetUsd?, backup?, drive? }`, every field optional) answered with the new `ServerSettings`. Nothing is stored unless the whole patch is valid; keys, secrets and tokens are never logged. Refusals are `400 { error }` in French, `502` when the service to try cannot be reached.

- `anthropicApiKey`: tried first with a free call (listing models). `null` removes the key set from the apps (the environment's key, if any, applies again). "Clé refusée par Anthropic", "Clé invalide", "Modèle inconnu", "Budget invalide" (0 to 10 000 dollars), "Impossible de vérifier la clé auprès d’Anthropic" (502).
- `backup` (`BackupPatch`), merged onto what is stored: a change to `endpoint`, `region`, `bucket`, `prefix`, `accessKeyId` or `secretAccessKey` is tried by listing the bucket, then writing and deleting `<prefix>.carnet-essai` (a backup needs all three rights). Addresses are path-style (`<endpoint>/<bucket>/<key>`). `recurrence` is `off`, `6h`, `daily` or `weekly` (`daily` when S3 is first set without one); `keep` the snapshots this server keeps (1 to 365). `null` forgets the S3 settings (S3 keeps what it has). "Clé secrète manquante", "Bucket introuvable", "Clés refusées par S3", "Accès refusé par S3 : vérifiez les droits de la clé", "Mauvaise région pour ce bucket", "Renseignez d’abord le stockage S3", "Stockage S3 injoignable" (502)...
- `drive` (`DrivePatch`, `provider: 'seafile'`), merged: a new `url`, `token` (a library API token with read and write rights) or `folder` is tried: the library's name is read, an upload link asked (a read-only token is refused one), and the folder made if missing (never the library's root). A token for another library is refused while the drive holds files. `null` turns the drive off: `leaving` until every original is back on the server, then forgotten (the files stay in Seafile too). "Jeton refusé par Seafile", "Ce jeton est en lecture seule…", "Cette adresse ne répond pas comme un serveur Seafile", "Seafile injoignable" (502)...

### `POST /api/sync`

Exactly `@unlease/core/sync/protocol`: request `{ node, since, records, wait?, bases?, epoch?, time? }`, response `{ records, cursor, more, serverTime, epoch }`.

- Records are sanitized by the core schema (bad fields are dropped one by one), merged with `mergeRecord` in one transaction, and each change gets a new global `seq`. `time` is the device's own time. Once another device has spoken since the start, a pushed clock more than a day ahead of the latest of what the other devices last said (moved on by the time since), the clocks they stored and the server's date (a device with the wrong date) is replaced by one of the server's. Each of those can only raise the bar: a server or a device whose date is behind never gets the right clocks replaced.
- `bases` gives, for typed text a device edited (a note's title and body, a checklist line, a link's comment), the value and clock its edit started from. When someone else changed that field since (not the same `node`: its own earlier write is simply replaced), the two texts are merged (`core/sync/textMerge.ts`) and stored under a fresh server clock, so every device takes the merge.
- The answer is every record with `seq > since`, in order, at most `MAX_PULL` (1000), with `more: true` when it stopped there; `cursor` is the last `seq` returned, or `since`.
- `epoch` names this dataset; devices send back the one their cursor belongs to. Another name, or a device that has seen more than this dataset holds, answers from 0: a `since` above its last `seq`, or a `head` outside the `run` the device names (each start of the server is a run with a random id and its first `seq`, kept in `meta.runs`; every answer carries `head`, its last `seq`, and the run that handed it out). When the device sending such a `since` names the current epoch, the server picks a new one: every device then sends everything it holds again, which brings back what a restored backup lacks.
- A note the bin emptied comes back, with what the purge took, when a device restores it later.
- With `wait` (up to 25 s), a request that pushed nothing and has nothing to receive is held until something changes.

### `PUT /api/blobs/:id`

The id is a record id (`[A-Za-z0-9_-]{1,64}`); for a photo, the attachment's id. Body: the image bytes with `Content-Type: image/*`, or `multipart/form-data` with a `file` field (what React Native's `FormData` sends). JPEG, PNG, WebP, GIF, HEIC and AVIF are recognised by their bytes; anything else is `415`. Answers `{ id, mime, width, height, bytes }` (size after EXIF rotation). Uploading an id that exists returns the stored description without rewriting it, unless the server lost its original (empty after a power cut, gone from the drive): then the upload is taken again. Files are flushed to the disk before they are named and their row written.

### `PUT /api/files/:id`

A page's video, PDF or other file (web), kept as sent: the bytes with their `Content-Type`, or `multipart/form-data` with a `file` field. Nothing is decoded or resized; a type other than an image, a video, audio, a PDF or plain text is stored as `application/octet-stream`, so the server never serves a document of its own (HTML, SVG) from a file. Answers like `PUT /api/blobs/:id`, and `GET /api/blobs/:id` serves it (both variants are the file).

### `GET /api/blobs/:id?variant=display|original`

`display` (default) is WebP, at most 1600 px on the long edge, EXIF-rotated; `original` is the uploaded file. `Cache-Control: private, max-age=31536000, immutable`, an `ETag` (a matching `If-None-Match` gets `304`), `404` for an unknown id. Link images keep only their display copy, and HEIC photos (which this build of sharp cannot decode) only their original: either variant then serves the file that exists.

### `GET /api/usage`

```json
{
  "monthToDate": { "analyses": 12, "inputTokens": 61200, "outputTokens": 9800, "costUsd": 0.4412 },
  "total": { "analyses": 40, "inputTokens": 201000, "outputTokens": 33000, "costUsd": 1.4532 },
  "model": "claude-opus-5-5",
  "budgetUsd": 15
}
```

`analyses` counts links read by Claude (cache hits are free and not counted); `costUsd` and the tokens also include the sorting calls of `POST /api/sort`; `inputTokens` includes cached input.

### Administration: `GET /api/admin` and the routes under it

Exactly `@unlease/core/sync/admin`. Backups, drive passes and restores run on the server; a route that starts one answers `202` with the `AdminStatus`, and the apps ask `GET /api/admin` again while it runs.

- `GET /api/admin`: what the server holds (notes, pages, files and their bytes), the last backup and the next one due, the drive (files held, files waiting, last error) and the last restore.
- `GET /api/admin/backups`: the snapshots on S3, newest first (`409` without S3, `502` with S3's failure in French).
- `POST /api/admin/backups`: a backup now. `POST /api/admin/drive/sync`: a pass over the drive now.
- `POST /api/admin/restore?mode=merge|rollback` (`merge` when absent): JSON `{ "snapshot": "unlease-….tar.gz" }` restores one from S3; any other body is an archive (its bytes, or a multipart `file`, 2 GB at most). `409` while a restore runs.
- `POST /api/admin/downloads`: `{ "snapshot": name }` or `{ "full": true }` answers `{ url, name }`; `GET /api/downloads/<ticket>` (no token: the ticket, random and valid 10 minutes, is the key; an unknown one counts as a failed attempt) sends the snapshot from S3, or a full archive written as it is read, the files included.

### `POST /api/sort`

Claude sorting links already saved, from what their reading found (no page is read again). Exactly `notes/sync/sorting.ts`: request `{ task, from, targets, links }` (at most 400 links and 100 targets; texts clipped), response `{ moves: [{ link, to }], incomplete? }`.

- `task: "file"`: each link moves to the target it clearly belongs in, or stays (no move). `task: "review"`: the links all sit in `from` (one of the targets); only those that clearly no longer belong there move, to another target or to `"inbox"`.
- Batches of 60 links, 3 at a time, each with every target, numbered: Claude answers with numbers, mapped back to ids (unknown numbers, a second move of a link and a move to where it already is are dropped). The app writes the moves itself.
- After a failed batch, or once the month's budget is spent (checked before each batch), no new batch starts; the moves of the batches that answered come back with `incomplete` (the French reason). Each call is billed to the month (`analyses.task = 'sort'`).
- Refusals are `{ error }` in French: `400` "Requête de tri invalide", `409` "Claude ne lit pas les liens : ajoutez une clé dans l’administration." or "Budget mensuel atteint", `502` Claude's failure when no batch answered ("Tri refusé par Claude", "Réponse de Claude illisible"...), "Claude a mis trop de temps" past 90 s.

## Link analysis

A queue in memory (one entry per link, `UNLEASE_ANALYSIS_CONCURRENCY` at a time) takes every link pushed as pending and not deleted, and at startup every link still pending. Each job reads the live settings first. Without a key, the link is not fetched and Claude is not called: one server write sets `status: 'skipped'`, `error: null` and `autoFile: false` (a quick-input link stays in "Non classé"), so the device that pushed it gets it back skipped in the same sync answer. A device sends a skipped link back to `pending` when the owner asks for it to be read. With a key:

1. **Cache**: the same normalized URL analysed in the last 30 days is reused without fetching or calling Claude (filed in the list it went to before, by id even if renamed, else one with that list's name, else one whose name says the kind). A link that was analysed successfully before and is set to `pending` again is a request for a fresh read and skips the cache.
2. **Read** the page: browser user agent, `Accept-Language: fr-FR,fr;q=0.9,en;q=0.8`, 12 s, 3 MB. A 401/403/429/503, a bot wall or a page with no title is fetched again as `facebookexternalhit`. YouTube, Vimeo, TikTok and Spotify links also get their public oEmbed. A URL that is an image becomes a link whose image is that image (and Claude sees it).
3. **Digest**: title, meta and Open Graph tags, prices, simplified JSON-LD (products and offers, films, series, restaurants and other places, recipes, books, articles, videos, events, music), the numbered image candidates and up to 6000 characters of readable text, under 12 000 characters in all.
4. **Claude**, once: structured output (the zod schema in `src/analysis/output.ts`, re-validated and clipped), effort from the configuration, the system prompt cached, the server-side refusal fallback (`fallbacks: "default"`) on the models that offer it, one retry on 429, 5xx or a connection error. Thinking is not configured: Opus 5.5 always thinks, and `effort` is what bounds it. When the server could not read the page at all, Claude gets the `web_fetch` tool (one use, at most 8000 tokens of page) instead of a digest.
5. **Images**: the one Claude chose, then up to two more, downloaded with the same guard (10 MB, raster only, at least 120 px), stored as WebP of at most 1200 px. For a page only Claude could read, the candidates come from what `web_fetch` returned: its `og:image` first, then only the page's images whose alt text names its subject (menus, promotions and logos do not), one per image file (the same picture at another size is skipped), without SVGs or icons.
6. **Write**: one server edit (one fresh server clock, one new `seq`) with the title, summary, kind, price, currency, attributes, site name (Claude's `site`, the name people write: "Komono", "Leroy Merlin", "X"; else the page's own), image ids and URL, `status: 'ready'`, and for quick-input links the list (`noteId`), `filedBy: 'claude'` when it is a real list (not "Non classé") and `autoFile: false`. If the owner moved the link meanwhile, their choice stands; if they deleted it, nothing is written; if they changed its URL, it is read again.

A failure leaves the link `failed` with a short French reason ("Page inaccessible (403)", "Page introuvable (404)", "Délai dépassé", "Adresse non autorisée", "Analyse refusée par Claude", "Budget mensuel atteint"...), keeps what was learned (meta title, site name, first image), and moves a quick-input link to "Non classé".

**Fetch guard**: http and https only; every hop (redirects are followed by hand, five at most) is resolved and refused if any address is loopback, private, link-local, CGNAT, multicast, unspecified, reserved, an IPv6 ULA or link-local address, or one of those inside an IPv6 form (IPv4-mapped, NAT64, 6to4). The connection goes to the checked address, so DNS cannot change between the check and the connect.

**Cost**: a link costs roughly $0.02 to $0.05 with Claude Opus 5.5 at low effort (a few thousand input tokens at $4 per million, under a thousand output tokens at $20 per million, the system prompt read from cache at $0.20 per million), a little more when Claude has to fetch the page itself. `UNLEASE_CLAUDE_MODEL=claude-haiku-5-5` is about 40x cheaper. Costs are computed from each response's usage, per model when a refusal fallback answered.

## Storage and housekeeping

`UNLEASE_DATA_DIR/unlease.sqlite` (WAL, `synchronous = FULL`: a sync is answered only once its changes are on disk; migrations by `PRAGMA user_version`, each in a transaction) holds `records`, `meta` (the `seq` counter, the server's runs, its clock node id and the dataset `epoch`), `blobs`, `analyses`, `settings` (the Claude key, the model, the budget, the S3 settings and the drive's, all set from the apps), `backup_runs`, `backup_files` (each file already on S3) and `drive_files` (each original the drive holds, and where). Secrets are stored as they are, so the data volume and its copies deserve the same care. Blob files live in `UNLEASE_DATA_DIR/blobs/<2 hex chars of the id's hash>/<id>` and `<id>.orig`; archives being written or restored in `UNLEASE_DATA_DIR/tmp/`, emptied at each start.

### Files in a drive (Seafile)

Through a library API token (`/api/v2.1/via-repo-token/…`): the server holds no Seafile account. A pass every 5 minutes (20 s after an upload, and on demand) sends the originals of photos and page files (not link pictures) to `<folder>/Carnet/Notes/<note>/<taken at>.<ext>` and `<folder>/Carnet/Pages/<page>/<sub-page>/<file name>`, moves a file when its note or page is renamed, deletes it once the collector removes its blob, and removes the folders left empty. Names are made safe for every file system and unique among their siblings, oldest first. Ten minutes after a file reached Seafile its original leaves the disk (the display copy stays). A file already at its place in the folder with the same size (a server restored on a new box, its Seafile kept) is taken as it is, never sent a second time, and `GET /api/blobs/:id?variant=original` streams it from Seafile; a page's video or PDF has no display copy, so it opens only while Seafile answers. The server manages its folder: a file moved or deleted by hand in it is sent again while its original is still on disk, else marked lost and named in the status (its display copy still shows). A pass stops as soon as the drive's settings change; turning the drive off waits for every original to come back (a file gone from Seafile is reported, not waited for). Seafile hands back upload and download links on its public address whatever address was called: the server sends them to the address it was given (the LAN one avoids Cloudflare's 100 MB limit).

Every hour (and 10 s after start), each app's chores (`ServerApp.chores`); Carnet's: notes in the bin for more than 7 days (counted from the clock of the write that trashed them) get a `deletedAt` tombstone, as do their checklist lines, links and photos; pages likewise, with every block under them (a sub-page put in the bin on its own waits for its own week); blob files older than 7 days that no app's live record (`ServerApp.filesInUse`: Carnet's attachments, links and page blocks) has referred to for 2 days are deleted (a file block cut and pasted later keeps its file; those of a note the bin emptied are kept 30 days, for a device that restores it); and once a day a consistent copy of the database is written to `UNLEASE_DATA_DIR/backups/unlease-YYYY-MM-DD.sqlite` (`VACUUM INTO`, with an `epoch` of its own), the last 7 kept.

### Backups to S3

A run reads every record at once and writes `unlease-<UTC time>.tar.gz`: `unlease.json` (every record of every app with its clocks, tombstones included, every photo and file's description), `LISEZMOI.md`, and each app's Markdown for people under its folder (Carnet's `Carnet/Notes/`, `Carnet/Collections/`, `Carnet/Pages/`, front matter and links to the files). With a drive (Seafile) set, the files live there only: photos and page files the drive holds are not sent to S3, and `unlease.json` gives each one's place in the library (`drive`); link pictures, which the drive never holds, still go to S3, and so does a file not in the drive yet. It lists `<prefix>fichiers/` and sends there each such file S3 does not hold with its size (`<id>.<ext>`: an upload's original, never a display copy in its place; a link picture's display copy; one that cannot be read is left out and the run says so), so a file deleted from S3 by hand or by a lifecycle rule goes again, and one already there (a server restored on a new box) is not sent twice. Then the archive goes to `<prefix>sauvegardes/` (a run whose S3 location changes meanwhile stops), and the newest `keep` snapshots this server made are kept: another server's (the one a new server was restored from) are never deleted, and when a snapshot sorts after the new one (the server's clock behind) nothing is deleted and the run says so. A file leaves S3 once no kept snapshot names it and either its blob is gone with no live record pointing at it, or the drive holds it (a copy sent before Seafile was set). Every S3 request that fails on the way (the network, a 5xx, throttling) is tried three more times, about 20 s in all; a failed scheduled run is tried again within the hour. No backup runs while the server holds nothing but "Non classé" (a new server about to be restored would only add an empty snapshot), nor during a restore. A full archive (the same, with the files under `Fichiers/`, laid out like the drive) is only written for a download; a file it cannot read is named in its `FICHIERS-MANQUANTS.md`.

A restore (`POST /api/admin/restore`) waits for a backup under way, then reads `unlease.json` and puts back each file the server lacks: from the archive, else from the drive where `unlease.json` says it is (its row points there, nothing is copied to the disk or sent to Seafile again; a photo's display copy is made from it), else from S3's `fichiers/` (photos get their display copy made again; a file that fails counts as missing). Files kept in a drive this server is not linked to yet are counted apart (`needDrive`): set Seafile, then restore again. A file counts as lacking when what a backup keeps of it is not here: an upload's original (on disk, not empty, or in the drive), a link picture's display copy; a display copy alone, or a file the drive lost, comes back. An archive sent as multipart (the phone) is parsed in memory, so it is limited to 200 MB. `merge` merges the records with their own clocks: only what the server lacks comes back, later changes stay. `rollback` writes every value that differs under a fresh server clock, so the backup's state wins on every device; records created since stay. A server that holds nothing but "Non classé" always merges, and its devices then send back what is newer (see `epoch` above). The last restore's state is kept in the database: one the server stopped in the middle reads as interrupted (run it again: what came back is skipped).

### Local snapshots and file copies

Back up `backups/` and `blobs/`, not the live `unlease.sqlite`: a copy of a SQLite file taken while it is written may not open. Blob files are written once, under their final name, and never change. With a drive, originals are in Seafile, not in `blobs/`.

To restore: stop the server, put the chosen snapshot in place as `unlease.sqlite` (delete `unlease.sqlite-wal` and `unlease.sqlite-shm`), put `blobs/` back, start. A copy of the whole data folder taken while the server was stopped restores the same way: the first device that had seen later changes makes the server rename its dataset. Nothing else to do: the snapshot's `epoch` is one no device knows, so every device starts over from it and sends back everything it holds, and what was written after the snapshot returns as each device connects. A photo whose file was lost stays missing until the phone that took it still has it and is asked to upload it again.

## Docker

The image is built from the repository root (`Dockerfile`), because it bundles `packages/` and builds the web app too:

```sh
docker build -t unlease .
docker run -d --name unlease -p 127.0.0.1:8080:8080 -v unlease-data:/data -e UNLEASE_TOKEN=... unlease
```

`.dockerignore` limits the context to `packages/`, `server/` and `web/`. The image runs as `node` (uid 1000) on `node:24-alpine`, keeps its data in the `/data` volume (a bind-mounted directory must be writable by uid 1000), serves the web app at `/` and the API at `/api` on 8080, and has a `HEALTHCHECK` on `/api/health`. The repository's `docker-compose.yml` runs the published image with Compose; GitHub Actions publish it for amd64 and arm64 (`.github/workflows/image.yml`): `:edge` from `main`, and each release's `:x.y.z`, `:x.y` and `:latest` (`docs/RELEASING.md`). On SIGTERM it answers held long polls, stops analyses (they stay pending and resume at the next start) and closes the database.
