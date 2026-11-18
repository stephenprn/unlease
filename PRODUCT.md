# Product

<!-- impeccable:product-schema 1 -->

## Platform

android

## Users

People who run their own server and want Google's everyday apps without Google: first the maintainer, a French speaker using the suite every day on an Android phone and in a desktop browser; then anyone self-hosting it, in French or English. One person (or one household) per server, sharing one token. Open source (MIT); the APKs come from GitHub releases, never from a store.

## Product Purpose

Unlease replaces Google's apps one at a time, as a suite the owner installs on their server and picks apps from: one setup, one look, shared settings (Claude, backups, files) and data each app can show of the others'. Each app has its own APK and its own web app.

- **Carnet** replaces Google Keep. Faster to scan and to find things in than Keep, worth opening, and it understands links: every URL saved is read by Claude, which extracts what matters (title, price, category, key facts), and the page's images are kept on the server, so a list stays useful after the page disappears. Links shared from any app land in the right list on their own.
- **Pages** replaces Notion and Google Docs for the owner's own knowledge: nested pages written in place, citing notes, collections, links, contacts and events.
- **Contacts** replaces Google Contacts: people, their numbers, addresses and birthdays, imported from Google, mentioned in the other apps.
- **Agenda** replaces Google Calendar: events, repeats and reminders, subscriptions and holidays, and the birthdays, reminders and dates the other apps hold.
- **Clock** is the alarm clock: its home is the week of mornings, each alarm beside the day's first event; it shows the weather and Agenda's day as it rings.

Success: Google's apps uninstalled; a thought or a link saved in seconds; anything found again later; the URL lists (clothes, films, restaurants…) become lists their owner trusts and uses; someone new runs their own in minutes from the README.

## Positioning

Google's everyday apps, self-hosted and linked. Carnet's lists read, summarize and file what you save; the whole suite runs on your own server, with no Google service anywhere.

## Operating Context

- **Phone (primary):** quick capture on the go; links shared from the browser, shopping and social apps through the share sheet; home-screen widgets for capture, lists, the day and favourite contacts; reminders and alarms that ring on time. Works offline and syncs when the network returns.
- **Computer:** the web apps in a desktop browser for longer writing, organizing, and the one-time imports (Google Keep's Takeout, Google Contacts, calendars, Notion or Markdown).
- **Server:** one container on the person's own machine (a home server, a NAS, a small VPS), reached over HTTPS through whatever they already use. Link analysis runs on the server, so the Claude API key never ships in a client.
- **Budget:** Claude spends the person's own API credits under a monthly budget they set, so every call must be lean; searches that cost several readings run on request only.

## Capabilities and Constraints

- **Carnet's notes:** text (plain, or formatted from a bar on the selected words), checklist, drawing, and URL list ("collection"); labels, colours and papers, pin, archive, bin, search, reminders, photos, people.
- **Collections act as categories** (Mode, Films, Restaurants…); "Non classé" always exists. A quick link input, reachable from everywhere, files a link into the best-matching collection, or Non classé when nothing fits.
- **Link modules, picked per collection:** small tools under a link's title, only on the links they fit and only where the owner switched them on (promo codes, cheaper elsewhere, second-hand, a recipe scaled with its shopping list and cook mode, ratings, a series' recap up to where you stopped, "Y aller", other outlets on a story, a copy kept as a page, a question to Claude). Nothing is written to the link itself unless the owner adds an answer to their note.
- **Sorting, never behind the owner's back:** renaming a collection moves nothing; deleting one asks where its links go; "Ranger Non classé" files what fits and leaves the links the owner placed by hand. Every sort can be undone.
- **Pages:** blocks (headings, lists, to-dos, toggles, callouts, code, tables with typed columns, media, files, drawings) that can sit side by side; inline dates, emoji and mentions; a question to Claude about one's own pages, never about a page kept private.
- **Interface in French or English**, per device; Claude writes a link's reading in the language of the device that saved it.
- One person per server, protected by a private token. Android only on the native side, installed as a sideloaded APK.
- The repository ships the image, a Compose file and the self-hosting guide; any one infrastructure's wiring stays out of it.

## Brand Commitments

- The suite is **Unlease**: stop leasing your data to Google, and unleash yourself. Its apps are plain nouns for everyday objects, kept in one registry (`APPS` in `core/apps.ts`) so a rename is a one-line change.
- **De-googled:** no Google service, SDK or CDN anywhere (no Firebase, no Play Services dependency, no fonts served at runtime; font files are bundled).
- No analytics, no trackers, no third-party SDK that phones home.

## Evidence on Hand

- `CLAUDE.md` and `docs/ARCHITECTURE.md` hold the conventions and the architecture; `DESIGN.md` the design system.
- The marks and the icons are the suite's own (`design/mark.ts`, Onde in `tools/icons/onde.mjs`).
- No real data is in this repository; sample content (the web demo, screenshots) is synthetic.

## Product Principles

1. **Capture first.** From thought or link to saved in the fewest steps, and never blocked by the network.
2. **Calm at a hundred notes.** A screen must stay scannable as it grows; structure and search do the work, not visual noise.
3. **Links are content.** A saved link is read, summarized, filed and kept, images included, so it is still useful when the page is gone.
4. **Own the data.** Self-hosted, offline-first, exportable, no Google, and easy to run for someone who is not the maintainer.
5. **One product, two screens.** Phone and web are the same data with each platform's own affordances.
6. **As easy as Google's.** Each app is used every day in place of Google's: the familiar patterns win over invention wherever a task is standard.
