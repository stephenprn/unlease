# Releasing

A release is a version tag. One version, [Semantic Versioning](https://semver.org/), covers the whole repository: the server, every app and the Docker image. Pushing the tag runs `.github/workflows/release.yml`, which checks the tagged commit, publishes the image and the phone apps' APKs (Carnet's, Pages', Contacts', Agenda's), and makes the GitHub release from the changelog. The apps are not on a store: phones install the APKs from the release.

## Versions

- **`X.Y.Z`**. Until 1.0.0, a minor version (0.3.0) may break things and a patch (0.2.1) only fixes. Every break is written in the changelog as **Breaking:**, with what people running Unlease must do.
- **`X.Y.Z-rc.N`**, a release candidate (N from 1 to 98): a prerelease on GitHub, an image tagged only `X.Y.Z-rc.N`, its notes the changelog's Unreleased as it stands.
- One source: `npm run bump` writes the version into the root, `server`, `web` and each phone app's (`mobile/notes`, `mobile/pages`, `mobile/contacts`, `mobile/calendar`) `package.json` and their lockfiles, and into each phone app's `build.gradle`: `versionName`, and `versionCode` computed from it, `(major × 10000 + minor × 100 + patch) × 100`, plus the candidate's number or 99 for the release (0.2.0-rc.1 is 20001, 0.2.0 is 20099), so every release installs over the one before.

## Cutting a release

1. **The changelog**: `CHANGELOG.md`'s Unreleased lists what changed since the last release, for the people running Unlease, under Added, Changed, Deprecated, Removed, Fixed or Security ([Keep a Changelog](https://keepachangelog.com/)), a break marked **Breaking:** with what to do, in the order to do it. Pull requests add their line as they land.
2. **The version**: `npm run bump -- 0.2.0` writes it everywhere, renames Unreleased to `[0.2.0] - <today>` and updates the comparison links (`tools/release/version.mjs`; it refuses an empty Unreleased).
3. **The checks** (below), green.
4. **Commit, tag, push**: `git commit -am "chore: release v0.2.0"`, `git tag v0.2.0`, `git push origin main v0.2.0`.
5. **The workflow** (`release.yml`), in order:
   - the tag must agree with every version and the changelog (`node tools/release/version.mjs --check v0.2.0`), and the upload key's four secrets must be set ([below](#signing-the-apks)), or nothing is published;
   - `ci.yml` runs on the tagged commit;
   - `image.yml` pushes `ghcr.io/stephenprn/unlease:0.2.0`, `:0.2` and `:latest` (amd64 and arm64, with its provenance and an SBOM, and a signed attestation on a public repository), `android.yml` builds the four APKs (every ABI, all signed with the same upload key from the secrets: the apps share a connection through a permission only same-signed apps hold) and checks each one's certificate with `apksigner`: never a debug key, and the one `ANDROID_SIGNING_CERT_SHA256` names when it is set;
   - the GitHub release is drafted from the changelog's section (`--notes`), gets `carnet-v0.2.0.apk`, `pages-v0.2.0.apk`, `contacts-v0.2.0.apk` and `agenda-v0.2.0.apk`, a `docker-compose.yml` and an `example.env` pinned to `UNLEASE_VERSION=0.2.0` (what the install instructions download from `releases/latest/download/`), and `SHA256SUMS`, then is published;
   - the web demo on GitHub Pages, https://demo.unlease.org, moves to the release (`pages.yml`: `npm run build:demo` for the site's path, each app under its own, `/notes/`, `/pages/`, `/contacts/` and `/agenda/`, with a `404.html` that sends a deep link to its app). A release candidate leaves it on the last release; Actions > Pages > Run workflow publishes any branch's.

The first time, make the image public in its GitHub package settings (packages start private), so servers pull it without logging in. `main` alone keeps publishing `:edge` (`image.yml`).

The first time too, for the demo: Settings > Pages > Source **GitHub Actions**, then Settings > Environments > `github-pages` > Deployment branches and tags: add the tag rule `v*` (the environment only lets the default branch deploy, and a release runs on its tag). With the GitHub CLI:

```bash
gh api -X POST repos/stephenprn/unlease/pages -f build_type=workflow
gh api -X POST repos/stephenprn/unlease/environments/github-pages/deployment-branch-policies -f name='v*' -f type=tag
```

The demo's domain (`demo.unlease.org`) is the repository's Pages setting (Settings > Pages > Custom domain, with a `CNAME` record to `<owner>.github.io` at the DNS), not a file in the repository: a workflow deployment needs no `CNAME` file. Without one, a fork's demo is at `https://<owner>.github.io/<repository>/`; `pages.yml` builds for whichever path GitHub gives.

## A release candidate

`npm run bump -- 0.3.0-rc.1`, commit, `git tag v0.3.0-rc.1`, push: the same workflow, as a prerelease (`:latest` and `releases/latest` stay on the last release). The final `npm run bump -- 0.3.0` then dates Unreleased as 0.3.0.

## A fix to a release

From `main` when it holds nothing that should wait: the fix and its changelog line, then `npm run bump -- 0.2.1`. When `main` has moved on, branch from the tag (`git switch -c release/0.2 v0.2.0`), fix there, bump and tag `v0.2.1` from that branch, and carry the fix and its line back to `main`.

## Server first

A release that adds a synced field, a record type or a value a field accepts goes to the server before the apps: an older server drops what it does not know for good, and the apps, told it is stored, never send it again. The changelog says so, so people upgrading pull the image before installing the APKs ([UPGRADING.md](UPGRADING.md)). The other way is safe: an app that dropped what a newer server sent pulls everything again once it is updated (the schema's fingerprint beside its cursor), so nothing it dropped stays missing.

## Signing the APKs

Every app is signed with the same key (one keystore, one alias): they share their connection on the phone through a permission only same-signed apps hold. Make yours once:

```bash
keytool -genkeypair -v -keystore unlease-upload.jks -alias upload -keyalg RSA -keysize 4096 -validity 10000
```

- Locally: copy `mobile/<app>/android/keystore.properties.example` to `mobile/<app>/android/keystore.properties` in each app (`notes`, `pages`, `contacts`, `calendar`) and fill them in with the same keystore; keep the keystore outside the repository.
- On GitHub: the repository secrets `ANDROID_KEYSTORE_BASE64` (`base64 -i unlease-upload.jks`), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` and `ANDROID_KEY_PASSWORD`, and the repository variable (Settings > Secrets and variables > Actions > Variables) `ANDROID_SIGNING_CERT_SHA256`: your certificate's SHA-256, which a release checks every APK against. Read it from the keystore, `keytool -list -v -keystore unlease-upload.jks -alias upload | grep SHA256`, or from an APK you built, `apksigner verify --print-certs app-release.apk` (colons and case do not matter):

  ```bash
  gh secret set ANDROID_KEYSTORE_BASE64 < <(base64 -i unlease-upload.jks)
  gh variable set ANDROID_SIGNING_CERT_SHA256 --body "AB:CD:…"
  ```

A release never goes out signed with a debug key. Without `keystore.properties`, a release build stops before it runs (`./gradlew assembleRelease` says why), since React Native's debug key ships in every project: an APK signed with it is one anyone can sign an "update" for. To try a release build on your own phone without a key, ask for the debug key explicitly with `-PallowDebugSigning` (the build warns; never hand that APK to anyone, and one signed with your key will not install over it: uninstall first, which erases the phone's copy, the server keeping everything that synced). `bundleRelease` refuses even then. On GitHub, a release (`release.yml`) fails without the four secrets, before anything is published, and checks each APK's certificate with `apksigner`: never a debug key, and the one `ANDROID_SIGNING_CERT_SHA256` names when it is set (unset, it warns and prints the certificate it found). Actions > Android > Run workflow without the secrets builds with `-PallowDebugSigning` and says so.

Keep the keystore safe: a lost key means every phone must uninstall to update.

## Building by hand

```bash
(cd mobile/notes/android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a)      # Carnet, one ABI: a phone-sized APK
(cd mobile/pages/android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a)      # Pages
(cd mobile/contacts/android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a)   # Contacts
(cd mobile/calendar/android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a)   # Agenda
docker build -t unlease .                                                                       # the image, from the repository root
```

Each needs the app's `keystore.properties` ([above](#signing-the-apks)); without it, add `-PallowDebugSigning` to build one signed with the public debug key, for your own phone only. Each APK is `mobile/<app>/android/app/build/outputs/apk/release/app-release.apk`; install it with `adb install -r` or by opening it on the phone.

## Checks before a release

```bash
npm ci && npm run verify
npm run verify -w web
npm run verify -w server
(cd mobile/notes && npm ci && LANG=fr_FR.UTF-8 npm run verify)
(cd mobile/pages && npm ci && LANG=fr_FR.UTF-8 npm run verify)
(cd mobile/contacts && npm ci && LANG=fr_FR.UTF-8 npm run verify)
(cd mobile/calendar && npm ci && LANG=fr_FR.UTF-8 npm run verify)
node tools/i18n/check.mjs
```

CI runs the same on the tag before publishing; running them first saves a failed release.

The release build keeps the `INTERNET` permission (sync and link reading); check the merged list with `aapt2 dump permissions app-release.apk`: INTERNET, POST_NOTIFICATIONS, RECEIVE_BOOT_COMPLETED, SCHEDULE_EXACT_ALARM, plus what Notifee and AndroidX add (WAKE_LOCK, VIBRATE, ACCESS_NETWORK_STATE).
