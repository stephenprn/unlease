# The phone apps

Each app of the suite is its own Android app (its own APK, its own applicationId), built on one shared
phone layer. Three folders:

| Folder | What | Install |
| --- | --- | --- |
| `shared/` | What every phone app shares: storage and its migrations, the library engine and the sync loop, the device's and the server's settings, the components (`AppText`, `Tappable`, `Organic`, `Switch`, sheets, dialogs, the snackbar), the theme and motion, the appearance screens, the first run, the app-off screen, the Administration and the shared Réglages sections; every native spec (`specs/`), the shared Kotlin (`android/`), the fonts and textures (`assets/`) | none: built by each app |
| `notes/` | Carnet (`com.stephenprn.carnet`): notes, checklists, drawings, collections of links, widgets, reminders, the share intake | `(cd notes && npm install)` |
| `pages/` | Pages (`com.stephenprn.pages`, `unlease-pages://`): the pages, their blocks, tables, embeds of Carnet's notes and collections, mentions of contacts, drawings, files, the bin and questions to Claude | `(cd pages && npm install)` |
| `calendar/` | Agenda (`com.stephenprn.agenda`, `unlease-agenda://`): the schedule, the day, three days, the week, the month and the year; events with their repeats, exceptions, reminders (notifications), labels, guests, mentions, files and zones; subscriptions and holidays (read by the server); contacts' birthdays (call, SMS, WhatsApp, gift ideas), Carnet's reminders and Pages' days as layers; quick add, search, Claude's answers, `.ics` import and export; four widgets (schedule, month, next event, a countdown to an event chosen) | `(cd calendar && npm install)` |
| `contacts/` | Contacts (`com.stephenprn.contacts`, `unlease-contacts://`): the address book, favourites, labels, birthdays, calls, SMS and WhatsApp, imports (Google's export, the phone's own contacts, a `.vcf` shared to it), the bin, two widgets (quick calls, a new contact) | `(cd contacts && npm install)` |

## Dev builds

`npm run android` (the `debug` build, its JavaScript from Metro) and `./gradlew assembleDevRelease`
(`devRelease`: the JavaScript bundled and Hermes optimised, as in a release, to try one) make another
app than the released one: `com.stephenprn.<app>.dev`, named « Carnet Dev », its launcher icon
striped, signed with React Native's debug key (`shared/android/dev-builds.gradle`, which every app
applies). One phone keeps both, and the dev build never reaches the released one:

- Android refuses it over a released app (another package, and another key);
- its siblings are the other dev builds: SuiteLink's permission is
  `com.stephenprn.unlease.dev.permission.SUITE` and its `<queries>` name the `.dev` packages, so it
  never reads a released app's server or token;
- its links answer `carnet-dev://`, `unlease-pages-dev://`, `unlease-contacts-dev://`,
  `unlease-agenda-dev://`, so a released app's link never opens it, nor asks which app should.

Give it a server of its own, never the one the released apps use: `npm run dev -w server` with its own
`UNLEASE_DATA_DIR`, reached from the phone through `adb reverse tcp:8080 tcp:8080` (its address in the
setup: `http://localhost:8080`; a dev build allows plain http), and Metro through
`adb reverse tcp:8081 tcp:8081`.

```bash
(cd mobile/notes && npm start)                            # Metro, for the debug build
(cd mobile/notes && npm run android)                      # the debug build (run-android --appIdSuffix dev)
(cd mobile/notes/android && ./gradlew assembleDevRelease) # app/build/outputs/apk/devRelease/app-devRelease.apk
```

After a change under `shared/` alone, run `./gradlew app:createBundleDevReleaseJsAndAssets --rerun`
first: the bundle task watches the app's folder, not `shared/`, and would keep the old JavaScript.

So the code never writes a package or a scheme of the suite out: JavaScript asks `appPackage(id)` and
`appScheme(id)` (`shared/src/app/variant.ts`, from the native `SuiteLink.ownPackage()`), Kotlin
`BuildConfig.APP_SCHEME` (and `SCHEME_SUFFIX` for another app's), a manifest `${suiteSuffix}` and
`${appScheme}`. Resource XML takes no placeholder: the script writes the dev build's static shortcuts,
its names (`app_name` and every label of the manifest that says it, in every language) and its launcher
layers from the app's own, at each build (`build/generated/unlease/devRes`).

## How the shared layer is built

`shared/` has no `node_modules`: each app builds it with its own install, so a bare import in a
shared file (`react-native`, `zustand`…) is the app's copy, never the web's React at the repository
root.

- **JavaScript**: imported as `@shared/<layer>/…` (`@shared/app/store/settingsStore`,
  `@shared/ui/components`). `shared/config/index.cjs` gives each app's Babel (`babelAliases`), Metro
  (`metroConfig`: watch `shared/` and `packages/`, resolve their bare imports from the app) and Jest
  (`jestModuleNameMapper`, the resolver `jestResolver.cjs`) the same aliases; the app's `tsconfig.json`
  lists them (TypeScript cannot read that file), with the third-party packages the shared code imports
  mapped to the app's own copies. Each app runs the shared tests (`roots`, `testMatch`).
- **Lint**: `shared/config/eslint.cjs` holds the phone rules and the layering
  (`ui -> app -> data/platform -> packages`); `shared/eslint.config.cjs` adds that the shared code
  imports no app (no `@app/*`, no `@unlease/notes`, no `@unlease/pages`): what an app adds comes in
  through props (`SetupScreen`'s `app` and `claudeExtra`, `AdminScreen`'s `appSections`) and
  registrations (`createLibrary`, `addSyncTask`). An app lints both trees with ESLint's lookup from the
  file (`--flag v10_config_lookup_from_file … ../shared/src`). Its words count on core's and design's
  dictionaries only (`tools/i18n/check.mjs`).
- **Native**: every TurboModule and native component spec is in `shared/specs`; each app's codegen
  reads them (`codegenConfig`: name `UnleaseSpec`, `jsSrcsDir` `../shared/specs`, package
  `com.stephenprn.unlease.specs`). A spec only one app implements (Carnet's widgets and share intake)
  stays listed there, its Kotlin in that app. The shared Kotlin (`com.stephenprn.unlease.*`: the
  organic view and `Squircle.kt`, haptics, connectivity, media, the clipboard, the suite link, the
  phone's maps apps, the headless tasks) is in `shared/android/src/main`, which each app's `app/build.gradle` adds to its
  source sets (`java.srcDirs`, `res.srcDirs`); the reminders' module (`shared/android/src/reminders`:
  what Android allows, the refresh with the app closed, on WorkManager) only in the apps that ring
  (Carnet, Contacts, Agenda), with its receiver in their manifests.
- **Assets**: the Signika fonts and the paper and ground textures are in `shared/assets`
  (`react-native.config.js`: `assets: ['../shared/assets/fonts']`; the generators in `tools/` write
  there).
- **Test doubles**: the node modules' (`@op-engineering/op-sqlite` on `node:sqlite`, Reanimated) are
  in `shared/__mocks__`, which Jest finds because each app lists `../shared` in its `roots`; the
  specs' doubles there are mapped in each app's `jest.setup.js`. Only what one app uses stays in it
  (Carnet's Notifee).
- **Components every home uses**: `SearchHeader` and `SyncLine` (the search strip and its sync dot;
  the app says where its things stay without a server), `FabMenu` (the capture pebble floating at
  the foot; with several things to make, the menu of them it opens), `NavDrawer` with `DrawerItem`, `DrawerHeading`, `DrawerDivider` (the drawer's frame and
  rows; the app lists its places, the frame adds the suite's other apps at its foot), `BrandMark app=…` (each app's mark), `ReadingTrack`,
  `LineColorPicker`.

## The library and the sync

`shared/src/app/store/library.ts` is the engine: every record in memory, written through to SQLite,
merged field by field, typed text with its bases. An app gives it its **projection** (what its screens
read: Carnet's notes, checks, links, labels and attachments with their indexes; Pages' blocks, combined
with Carnet's and Contacts' with `combineProjections`; Contacts' people and labels), and the sync loop names the record types the app syncs in
every request (`syncedTypes(app)`: its own and those of the apps it reads, `appsShownBy`). The cursor is
kept with that list and starts again from 0 when it changes.

## One app showing another's pieces

Pages shows Carnet's collections, notes, links and drawings in its pages. Its library combines
Carnet's projection with its own, and it borrows the few of Carnet's files that draw them through
the `@carnet/*` alias (Babel, Metro, Jest and its tsconfig): `app/store/notesProjection`, and
`ui/features/drawing`, `links` (`LinkRowView`: the row as drawn, handed its link and its writes;
Carnet's `LinkRow` and Pages' each connect it to their own library) and `note`. A borrowed file is a
leaf: it imports only the shared code, the packages and its own folder, never its app's layers
(`@app/…` would resolve to the borrowing app's): `borrowGuard` (`shared/config/index.cjs`) refuses it
in the borrower's Babel, and its lint refuses any other `@carnet/*` (Carnet's store, actions or
navigation would make a second library in the process). Carnet never imports Pages.

Pages also names the people its pages mention: it borrows Contacts' projection alone
(`@contacts-app/app/store/contactsProjection`, a leaf as well) and keeps it under one key, `people`
(`app/store/peopleProjection.ts`), since Contacts' `labels` would meet Carnet's in one state. A
mention of a person opens it in Contacts (`contactPlace(id)`: `unlease-contacts://contact/<id>`).
Carnet and Contacts never import each other.

Agenda shows what the three others hold: it borrows Carnet's projection (kept under `carnet`: notes'
reminders, the gift ideas of « Cadeaux », the names of what a description mentions), Contacts'
(under `people`: birthdays, guests) and Pages' (`@pages-app/app/store/blocksProjection`: the days
written in pages, the pages mentioned), each a leaf, beside its own (`app/store/calendarProjection.ts`:
`events`, `calendarLabels`, `feeds`). Everything it opens of them opens in their app.

## Between the apps on one phone

Each app hands its siblings its server's address, its token and its appearance through `SuiteLink`
(a native module and a `ContentProvider`, authority `<applicationId>.suite`), guarded by the signature
permission `com.stephenprn.unlease.permission.SUITE`: only an app signed with the same key reads it
(the token is a secret). The second app installed offers « Utiliser la connexion de … » on its welcome
and starts from the same colours. The grains and the language are the suite's: each choice goes with
its time, and an app takes a sibling's later one at start and whenever it comes to the front, keeping
that time so nothing echoes back (`followSiblings`: `grainAt`, `localeAt`). The look (the theme, the
colours and the ground, taken whole) is each app's: « Appliquer aux autres » hands on a `lookOffer`
naming the apps ticked (`applyLookTo`), which each takes the same way when it was sent after its own
choice (`lookAt`); which apps are installed is asked of their schemes (`useInstalledApps`). A dev build
declares a permission of its own (`com.stephenprn.unlease.dev.permission.SUITE`), so it installs beside
a released one and neither reads the other ([Dev builds](#dev-builds)). A place in another app opens there when it is installed
(`openInApp` with `pagePlace(id)`: `unlease-pages://page/<id>`, `#block-<id>` for a block; or
`notesPlace('note' | 'line' | 'link', id)`: `carnet://note/<id>`; or `contactPlace(id)`:
`unlease-contacts://contact/<id>`; or `eventPlace(id)`: `unlease-agenda://event/<id>`, and
`newEventPlace(query)`: Agenda's form filled, `unlease-agenda://new?…`; each scheme `-dev` in a dev
build), else in the web app on the server.
Every drawer lists, under « Applications », each other app of the suite while it can be opened
(`NavDrawer`, `useReachableApps`: installed, or run by the server). The dev builds of every app are signed with the same `debug.keystore` (copied in each
app), so they read each other; release builds share the upload key (`keystore.properties`, the same
in every app). Without it a release build refuses to run, since React Native's debug key is public:
`./gradlew assembleRelease -PallowDebugSigning` builds one signed with it anyway, for your own phone only
(`docs/RELEASING.md`, *Signing the APKs*).

## Adding an app

1. Its domain in `packages/<name>` and its entry in `core/apps.ts` (scheme, `reads`).
2. `mobile/<name>`: a React Native app (copy Carnet's `package.json` dependencies, `babel.config.js`,
   `metro.config.js`, `jest.config.js`, `jest.setup.js`, `eslint.config.js`, `tsconfig.json` paths,
   `react-native.config.js`), its applicationId `com.stephenprn.<slug>`.
3. Its library: `createLibrary('<id>', projection)` in its `app/store/libraryStore.ts`, its database
   `<slug>.sqlite` opened in its bootstrap with `startSuiteLink()` and `startLauncherIcon()`.
4. Its root: `AppShell` with its navigator; its first run `SetupScreen app="<id>"`, its Administration
   `AdminScreen app="<id>"` with its own sections.
5. Android: start from an app's `android/` (Pages' is the smallest), with its own `namespace` and
   `applicationId`, `rootProject.name`, `MainActivity`'s component name (its `app.json` name), and
   `shared/android/dev-builds.gradle` applied at the end of its `app/build.gradle` with its scheme
   (`ext.suiteScheme`, [Dev builds](#dev-builds)). The
   shared source sets and codegen as above, the shared packages registered in its
   `MainApplication` (Media, Haptics, Connectivity, Organic, Clipboard, SuiteLink, LauncherIcon;
   MapApps where it opens places, with a `<queries>` for `geo:`), and in its manifest
   the SUITE permission (declared and used, `com.stephenprn.unlease${suiteSuffix}.permission.SUITE`),
   the `SuiteProvider` (read with it), the `FileProvider` (`<applicationId>.files`, the camera), the
   `<queries>` naming every app of the suite (`com.stephenprn.<app>${suiteSuffix}`), its scheme's
   intent filter (`${appScheme}`), and no LAUNCHER filter on `MainActivity`: the two marks of the launcher's entries
   right after it, which the generator fills (step 6). Its `android` script names the activity to
   start and the dev build's suffix (`react-native run-android --main-activity .MainActivity --appIdSuffix dev`), and its notifications' taps
   `launchActivity()` (`@shared/platform/launcherIcon`), never `'default'`. Add its applicationId to `SUITE_PACKAGES` (`shared/src/app/variant.ts`) and to
   every app's `<queries>`; its folder to `PHONE_APPS` (`tools/release/version.mjs`, which keeps its
   `versionName` and `versionCode` with the others) and to the matrices of `.github/workflows/ci.yml`
   and `android.yml`.
6. Its launcher: its mark's shape in `packages/design/src/mark.ts` (drafted by a script in
   `tools/icons/`, as `draft_page_mark.mjs` draws Pages' sheet), drawn by `BrandMark` and written as
   its adaptive icon by `tools/icons/build_android_drawables.mjs` (`launcher(…)`), never by hand; the
   same script writes it in every palette's primary and its launcher entries, one per palette
   (`launcherPalettes(…)`), which the app switches between as its primary changes
   (`docs/ARCHITECTURE.md`, *The launcher's icon*).

## Testing notifications' timing

A notification late on a device is mostly Android holding it: these put a phone (or an emulator) in
the states that do, `<pkg>` being a dev build's `com.stephenprn.agenda.dev`, `com.stephenprn.carnet.dev`
or `com.stephenprn.contacts.dev` (try these on a released app only on a phone whose data you can lose).

```bash
adb shell dumpsys alarm | grep -A3 <pkg>                  # the alarms armed: exact ones say "window=0"
adb shell cmd appops get <pkg> SCHEDULE_EXACT_ALARM        # Android 12's grant (13+ holds USE_EXACT_ALARM)
adb shell dumpsys deviceidle force-idle                    # Doze now; `unforce` to leave it
adb shell am set-standby-bucket <pkg> restricted           # the rarest bucket; `active` to come back
adb shell cmd appops set <pkg> RUN_ANY_IN_BACKGROUND ignore # the battery's « Restreinte »; `allow` to undo
adb shell am force-stop <pkg>                              # every alarm gone: the next start arms them again
adb shell cmd jobscheduler run -f <pkg> <job-id>           # the hourly refresh now (`dumpsys jobscheduler | grep <pkg>` for its id)
```
