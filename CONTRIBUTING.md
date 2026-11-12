# Contributing

Thank you for helping. Issues and pull requests are welcome in English or French. Everyone taking part follows the [code of conduct](CODE_OF_CONDUCT.md).

## Before you start

- For anything larger than a fix, open an issue first, so we agree on the shape before you spend time on it.
- Read `CLAUDE.md`: it is the list of conventions every change follows (the suite's layout, layers, how records are written and synced, the design system's rules, translations). It is written for coding agents and people alike. `docs/ARCHITECTURE.md` explains the suite, the sync and Carnet's link reading, `DESIGN.md` the design system.

## Set up

Node 24, plus Java 17 and the Android SDK for the phone apps.

```bash
npm install                                    # the root workspace: the shared packages' tools, the web apps, the server
cp server/.env.example server/.env             # set UNLEASE_TOKEN and UNLEASE_DATA_DIR=./data
(cd mobile/notes && npm install)               # Carnet for Android: its own install (React Native pins its own React, ESLint, Jest, Babel)
(cd mobile/pages && npm install)               # Pages for Android: the same, on the same shared layer (mobile/shared)
```

- The web apps: `npm run dev -w web`, then http://localhost:5173/notes (Carnet) and /pages (Pages). `?demo` runs them against a fake server inside the page (no server, no key, nothing spent).
- Server: `npm run dev -w server`.
- An Android app: `npm start` (Metro) and `npm run android` in `mobile/notes` or `mobile/pages`, on a device or emulator ([mobile/README.md](mobile/README.md)). It installs a dev build (« Carnet Dev », `com.stephenprn.carnet.dev`) beside the app you use, never over it: connect it to a server of your own ([mobile/README.md#dev-builds](mobile/README.md#dev-builds)).

## Where things go

- `packages/core`: what every app shares (sync, ids, references, rich text, i18n, formatting, search, the apps' registry, the setup). `packages/design`: the design system's data. `packages/<app>`: an app's domain (`notes` for Carnet, `pages` for Pages), shared by its phone app, its web app and its part of the server.
- `web/shared`: the shell every web app shares (setup, Réglages, the Administration, storage, sync, components); `web/<app>`: an app's web app (its page, entry and screens). `mobile/shared`: what every phone app shares; `mobile/<app>`: an app's APK. `server/src/apps/<app>`: its part of the server; the rest of `server/src` is the platform, the same for every app.

## Checks

Each part has one command that runs its typecheck, lint and tests; CI runs them all and the dictionary check on every pull request.

```bash
npm run verify                                 # shared packages
npm run verify -w web
npm run verify -w server
(cd mobile/notes && LANG=fr_FR.UTF-8 npm run verify)
(cd mobile/pages && LANG=fr_FR.UTF-8 npm run verify)
node tools/i18n/check.mjs
```

## A few rules that bite

- `packages/` is compiled into the phone, the web and the server: no dependency, no React, React Native, Node or DOM API there, and `core` and `design` know no app, Carnet's package never imports Pages' (lint enforces all three).
- Every sentence the interface shows goes through `t()` from `@unlease/core/i18n`, French as the key, with its English in its package's dictionary (Carnet's: `packages/notes/src/i18n/en/`, Pages': `packages/pages/src/i18n/en/`, the shell's: `packages/core/src/i18n/en/`; `node tools/i18n/check.mjs` lists what is missing, `--move` files a sentence where every code using it can count on it).
- A synced field is added to its record type's declaration (`packages/<app>/src/sync/types.ts`) and to that package's `sync/entities.ts`; ship the server before the apps.
- New records get `createId()` (a UUIDv7); a mention or an embed points at a type and an id (`packages/core/src/refs.ts`).
- Generated files (icons, widget resources, textures, the emoji catalogue, fonts) are rebuilt with their scripts in `tools/`, never edited by hand.
- Keep a change to what it is about: no unrelated reformatting or refactoring in the same pull request.

## Pull requests

One subject per pull request, with a short description of what changes for the person using the app and how you checked it (screenshots for anything visible, on both clients when both change). Commit messages are one line, `type: subject` (`fix: keep the caret when a block is turned into a list`).

Anything a person running Unlease would notice adds its line to `CHANGELOG.md`, under Unreleased and the right heading (Added, Changed, Deprecated, Removed, Fixed, Security), written for them; a break starts with **Breaking:** and says what to do. Leave the versions alone: a release sets them (`docs/RELEASING.md`).

By contributing you agree that your contribution is licensed under the MIT licence.
