# Releasing

A release is a version tag. One version, [Semantic Versioning](https://semver.org/), covers the whole repository: the server, every app and the Docker image. Pushing the tag runs `.github/workflows/release.yml`, which checks the tagged commit, publishes the image and Carnet's APK, and makes the GitHub release from the changelog. The apps are not on a store: phones install the APK from the release.

## Versions

- **`X.Y.Z`**. Until 1.0.0, a minor version (0.3.0) may break things and a patch (0.2.1) only fixes. Every break is written in the changelog as **Breaking:**, with what people running Unlease must do.
- **`X.Y.Z-rc.N`**, a release candidate (N from 1 to 98): a prerelease on GitHub, an image tagged only `X.Y.Z-rc.N`, its notes the changelog's Unreleased as it stands.
- One source: `npm run bump` writes the version into the root, `server`, `web/notes` and `mobile/notes` `package.json` and their lockfiles, and into Carnet's `build.gradle`: `versionName`, and `versionCode` computed from it, `(major × 10000 + minor × 100 + patch) × 100`, plus the candidate's number or 99 for the release (0.2.0-rc.1 is 20001, 0.2.0 is 20099), so every release installs over the one before.

## Cutting a release

1. **The changelog**: `CHANGELOG.md`'s Unreleased lists what changed since the last release, for the people running Unlease, under Added, Changed, Deprecated, Removed, Fixed or Security ([Keep a Changelog](https://keepachangelog.com/)), a break marked **Breaking:** with what to do, in the order to do it. Pull requests add their line as they land.
2. **The version**: `npm run bump -- 0.2.0` writes it everywhere, renames Unreleased to `[0.2.0] - <today>` and updates the comparison links (`tools/release/version.mjs`; it refuses an empty Unreleased).
3. **The checks** (below), green.
4. **Commit, tag, push**: `git commit -am "chore: release v0.2.0"`, `git tag v0.2.0`, `git push origin main v0.2.0`.
5. **The workflow** (`release.yml`), in order:
   - the tag must agree with every version and the changelog (`node tools/release/version.mjs --check v0.2.0`), or nothing is published;
   - `ci.yml` runs on the tagged commit;
   - `image.yml` pushes `ghcr.io/stephenprn/unlease:0.2.0`, `:0.2` and `:latest` (amd64 and arm64, with its provenance and an SBOM, and a signed attestation on a public repository), `android.yml` builds the APK (every ABI, signed with the upload key from the secrets);
   - the GitHub release is drafted from the changelog's section (`--notes`), gets `carnet-v0.2.0.apk`, a `docker-compose.yml` and an `example.env` pinned to `UNLEASE_VERSION=0.2.0` (what the install instructions download from `releases/latest/download/`), and `SHA256SUMS`, then is published;
   - the web demo on GitHub Pages moves to the release (`pages.yml`: `npm run build:demo` under the site's path, `index.html` copied to `404.html` for deep links). A release candidate leaves it on the last release; Actions > Pages > Run workflow publishes any branch's.

The first time, make the image public in its GitHub package settings (packages start private), so servers pull it without logging in. `main` alone keeps publishing `:edge` (`image.yml`).

The first time too, for the demo: Settings > Pages > Source **GitHub Actions**, then Settings > Environments > `github-pages` > Deployment branches and tags: add the tag rule `v*` (the environment only lets the default branch deploy, and a release runs on its tag). With the GitHub CLI:

```bash
gh api -X POST repos/stephenprn/unlease/pages -f build_type=workflow
gh api -X POST repos/stephenprn/unlease/environments/github-pages/deployment-branch-policies -f name='v*' -f type=tag
```

## A release candidate

`npm run bump -- 0.3.0-rc.1`, commit, `git tag v0.3.0-rc.1`, push: the same workflow, as a prerelease (`:latest` and `releases/latest` stay on the last release). The final `npm run bump -- 0.3.0` then dates Unreleased as 0.3.0.

## A fix to a release

From `main` when it holds nothing that should wait: the fix and its changelog line, then `npm run bump -- 0.2.1`. When `main` has moved on, branch from the tag (`git switch -c release/0.2 v0.2.0`), fix there, bump and tag `v0.2.1` from that branch, and carry the fix and its line back to `main`.

## Server first

A release that adds a synced field or record type goes to the server before the apps: an older server drops what it does not know for good, and the apps never send it again. The changelog says so, so people upgrading pull the image before installing the APK ([UPGRADING.md](UPGRADING.md)).

## Signing the APK

Without a key the APK is signed with React Native's public debug key: fine to try it, but anyone could sign an update with it, and an APK signed with another key will not install over it (uninstall first, which erases the phone's copy; the server keeps everything that synced). Releases for others should carry your own key:

```bash
keytool -genkeypair -v -keystore carnet-upload.jks -alias upload -keyalg RSA -keysize 4096 -validity 10000
```

- Locally: copy `mobile/notes/android/keystore.properties.example` to `mobile/notes/android/keystore.properties` and fill it in; keep the keystore outside the repository.
- On GitHub: the repository secrets `ANDROID_KEYSTORE_BASE64` (`base64 -i carnet-upload.jks`), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` and `ANDROID_KEY_PASSWORD`.

Keep the keystore safe: a lost key means every phone must uninstall to update.

## Building by hand

```bash
(cd mobile/notes/android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a)   # one ABI: a phone-sized APK
docker build -t unlease .                                                                       # the image, from the repository root
```

The APK is `mobile/notes/android/app/build/outputs/apk/release/app-release.apk`; install it with `adb install -r` or by opening it on the phone.

## Checks before a release

```bash
npm ci && npm run verify
npm run verify -w web/notes
npm run verify -w server
(cd mobile/notes && npm ci && LANG=fr_FR.UTF-8 npm run verify)
node tools/i18n/check.mjs
```

CI runs the same on the tag before publishing; running them first saves a failed release.

The release build keeps the `INTERNET` permission (sync and link reading); check the merged list with `aapt2 dump permissions app-release.apk`: INTERNET, POST_NOTIFICATIONS, RECEIVE_BOOT_COMPLETED, SCHEDULE_EXACT_ALARM, plus what Notifee and AndroidX add (WAKE_LOCK, VIBRATE, ACCESS_NETWORK_STATE).
