# Upgrading

Unlease ships as releases: one version (`X.Y.Z`, [Semantic Versioning](https://semver.org/)) for the server, every app and the Docker image, each with its notes in the [changelog](../CHANGELOG.md) and on [GitHub](https://github.com/stephenprn/unlease/releases).

## An upgrade, step by step

1. **Read the changelog** from your version up to the new one. Anything marked **Breaking:** says what to do; do it in the order it gives.
2. **Back up**: the Administration's « Sauvegarder maintenant » (Back up now) when S3 is set, or « Télécharger une sauvegarde complète » (Download a full backup). The server also keeps a copy of its database from each day (`backups/` in its data).
3. **The server first**: in `.env`, set `UNLEASE_VERSION` to the new version, then

   ```bash
   docker compose pull && docker compose up -d
   docker compose logs -f unlease    # "unlease-server listening", with the version
   ```

   The Administration shows the server's version too.
4. **Then the apps**: on each phone, install the release's APK over the one there (it keeps the phone's data; the same signing key is needed). The web app comes with the server: reload the page.

Keep your `docker-compose.yml` unless the release notes say to change it: the one attached to each release is the reference.

## Why the server goes first

An app sends what it knows. A server older than the app drops a field or a record type it does not know, for good: the app will not send it again. A server newer than the apps is fine: older apps just do not use what is new.

## Which version to run

| `UNLEASE_VERSION` | Follows | For |
| --- | --- | --- |
| `0.2.0` | Nothing: exactly this release | A server you rely on (recommended) |
| `0.2` | The fixes of 0.2 (0.2.1, 0.2.2) | Fixes without a minor version's changes |
| `latest` | Every release | A server you watch and upgrade often |
| `edge` | Every change on `main`, unreleased | Trying what comes next, never on data you care about |

Until 1.0.0, a minor version (0.2 to 0.3) may break things; a patch (0.2.0 to 0.2.1) only fixes. A release candidate (`0.3.0-rc.1`) is a prerelease: its image has no other tag, and `latest` stays on the last release.

## Going back

The server upgrades its database when it starts, and an older server refuses a database a newer one upgraded (`database schema N is newer than this server knows`), as it refuses an archive made by a newer server. To go back:

1. Stop the server.
2. In its data, replace `unlease.sqlite` with a daily copy from before the upgrade day (`backups/unlease-YYYY-MM-DD.sqlite`, dated in UTC: the upgrade day's copy may already be the upgraded one), and delete `unlease.sqlite-wal` and `unlease.sqlite-shm`.
3. Set the older `UNLEASE_VERSION` and start it.

Each daily copy counts as a dataset of its own, so every device then sends back everything it holds: what was written since the copy returns. A phone keeps its newer app (Android installs an older APK only after uninstalling, which erases the phone's copy), and the older server drops what only the newer app knows.
