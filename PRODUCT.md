# Product

<!-- impeccable:product-schema 1 -->

## Platform

android

## Stack

- **Android app:** pinned by the maintainer: the same stack as their habit tracker Bonsai, every package at its current version. Bare React Native CLI (never Expo), TypeScript strict, op-sqlite, zustand, React Navigation, Reanimated + worklets, gesture-handler, react-native-svg, Notifee, safe-area-context, screens. Five layers with ESLint-enforced boundaries, with one sanctioned deviation from the maintainer's house structure: this app talks to the network (sync + link analysis), so the release build keeps `INTERNET`.
- **Web app:** React + Vite + TypeScript single-page app, served by the server itself (or any static host).
- **Backend:** a small TypeScript (Node) service with SQLite, one for the whole suite (each app adds its module). One published Docker image runs it and serves the web apps; anyone's infrastructure runs it the same way (`docs/SELF-HOSTING.md`). The maintainer's own deployment lives in their separate infrastructure repository.

## Users

People who run their own server and want Keep (and a little of Notion) without Google: first the maintainer, a French speaker using it every day on an Android phone and in a desktop browser; then anyone self-hosting it, in French or English. One person (or one household) per server, sharing one token. Open source (MIT); the APK comes from GitHub releases, never from a store.

## Product Purpose

Carnet replaces Google Keep. It must be faster to scan and to find things in than Keep, look like something worth opening, and understand links: every URL saved is read by Claude, which extracts what matters (title, price when it is something to buy, category, key facts) and the page's images are saved on the server, so a list stays useful after the page disappears. Links shared from any app land in the right list on their own.

Success: Keep uninstalled; a thought or a link saved in seconds; anything found again later; the URL lists (clothes, films, restaurants…) become lists their owner trusts and uses; someone new runs their own in minutes from the README.

## Positioning

Keep with a reader, self-hosted. Its URL lists read, summarize and file what you save, and the whole thing runs on your own server, with no Google service anywhere.

## Operating Context

- **Phone:** quick capture on the go; links shared from the browser, shopping and social apps through the Android share sheet; a home-screen widget for capture; reminders as notifications. Must work offline and sync when the network returns.
- **Computer:** the web app in a desktop browser for longer writing, organizing, and the one-time Google Keep import (Takeout export).
- **Sync and analysis:** one container on the person's own machine (a home server, a NAS, a small VPS), reached over HTTPS through whatever they already use (a reverse proxy, a tunnel). The maintainer's runs on a Proxmox homelab behind a Cloudflare Tunnel. Link analysis runs on the server, so the Claude API key never ships in a client.
- **Budget:** link analysis spends the person's own Claude API credits under a monthly budget they set, so every call must be lean.

## Capabilities and Constraints

- Note types: **text** (plain, or formatted: bold, italic, underline and three heading levels, from a bar that appears on the selected words), **checklist**, **drawing** (a sheet drawn on with a pen, a felt-tip, a highlighter and an eraser in the palette's inks), **URL list**.
- **URL list:** a list that only holds URLs. Adding a URL triggers server-side extraction with Claude (title, price and currency when it is a product, category, short summary, key attributes) and stores the page's images on the server.
- **Link modules, picked per collection:** small tools under a link's title, only on the links they fit and only in the collections where the owner switched them on (a "Modules" sheet from the collection's menu, so nothing clutters a list that does not need it): promo codes, the same item cheaper elsewhere, second-hand offers (Claude on the web, on request only, as each search costs several readings), a recipe for another number of people, its shopping list into a checklist and a cook mode (a step at a time, the screen on, a timer in one tap), a film's or a book's ratings, a series' recap up to where you stopped (nothing after), the work on SensCritique or in your own Seerr, "Y aller" (Google Maps), other outlets on an article's story, a copy of an article kept as a page, and a question to Claude about any link. Nothing is written to the link itself, unless you add an answer to your note.
- **URL lists act as categories** (e.g. Mode, Films, Restaurants). A default **Non classé** (uncategorized) list always exists. A quick link input, reachable from everywhere, files a link into the best-matching list, or Non classé when nothing fits.
- **Sorting again, never behind the owner's back:** renaming a collection moves nothing (its "Vérifier les liens" proposes moves to keep or untick); deleting one asks where its links go (Claude, Non classé, another collection or the bin); a new collection offers to take what belongs in it from Non classé; "Ranger Non classé" files what fits. Every sort can be undone, and "Ranger Non classé" leaves the links the owner put there by hand.
- Also in the first version: labels, note colors, pin, archive, trash, search, reminders (Android notifications), photos in notes, Google Keep import from a Takeout export, an Android home-screen widget, and the Android share target.
- **Pages** (web from 2026-10-22, the phone from 2026-10-26, kept apart from the notes in their own space on both): a Notion-like knowledge base: pages nested in a tree; blocks (headings, text, bulleted, numbered, task and toggle lists, callouts, code coloured by language, tables with typed columns, pictures, videos, PDFs, files) that can sit side by side in columns; words in bold, italic, underline, strikethrough, code, keyboard keys, links and colours; dates written inline (read relative to today when close, a time if wanted), emojis typed after « : »; notes, collections, links and pages cited inline (« @ », or « [[ » for a page), as a card, or embedded whole; a table of contents of the page's headings; drawings. A video by address plays in its own site's player (YouTube through youtube-nocookie, Vimeo, Dailymotion), loaded only on a page where the owner put one.
- **Interface in French or English**, per device; Claude writes a link's reading in the language of the device that saved it.
- One person per server; the server is protected by a private token.
- Android only on the native side (no Xcode on the development Mac); installed as a sideloaded APK.
- The repository ships the image, a Compose file and the self-hosting guide; any one infrastructure's wiring (DNS, tunnel, Ansible) stays out of it.

## Brand Commitments

- The suite is **Unlease** (the owner's name, 2026-10-28): stop leasing your data to Google, and unleash yourself. `SUITE_NAME` in `core/apps.ts`. Its apps are plain French nouns for paper objects, on purpose, kept in the same registry (`APPS`) so a rename is a one-line change: **Carnet** (renamed from Stif on 2026-10-20) is the first; the next ones (Agenda, Album, Classeur…) share its look and some of its data, beside Bonsai, the habit tracker already published.
- **De-googled:** no Google service, SDK or CDN anywhere (no Firebase, no Play Services dependency, no Google Fonts served at runtime; font files are bundled).
- No analytics, no trackers, no third-party SDK that phones home.

## Evidence on Hand

- The maintainer's habit tracker Bonsai set the conventions and the architecture; `CLAUDE.md` and `docs/ARCHITECTURE.md` hold them here.
- The mark and the icons are Carnet's own (`design/mark.ts`, Onde in `tools/icons/onde.mjs`).
- No real notes are in this repository; sample content (the web demo, screenshots) is synthetic.

## Product Principles

1. **Capture first.** From thought or link to saved in the fewest steps, and never blocked by the network.
2. **Calm at a hundred notes.** The board must stay scannable as it grows; structure and search do the work, not visual noise.
3. **Links are content.** A saved link is read, summarized, filed and kept, images included, so it is still useful when the page is gone.
4. **Own the data.** Self-hosted, offline-first, exportable, no Google, and easy to run for someone who is not the maintainer.
5. **One product, two screens.** Phone and web are the same notes with each platform's own affordances.
