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
4. **Then the apps**: on each phone, install the release's APK of each app over the one there (it keeps the phone's data; the same signing key is needed). The web apps come with the server: reload their pages.

Keep your `docker-compose.yml` unless the release notes say to change it: the one attached to each release is the reference.

## Behind a reverse proxy

The server brakes wrong tokens per client address. Releases up to 0.1 took that address from `CF-Connecting-IP` or `X-Real-IP` whoever sent them; it now takes the connection's own unless `UNLEASE_TRUSTED_PROXY_HEADER` names the one header your proxy sets. Nothing stops working without it: the right token always passes, so your devices are never refused. But behind a proxy every request then comes from the proxy, so the brake counts every guess together and the log names the proxy. Add to `.env` the line [SELF-HOSTING.md](SELF-HOSTING.md#the-clients-address) gives for your proxy (`cf-connecting-ip` for a Cloudflare Tunnel, also with a proxy of yours behind it; `x-real-ip` for the nginx and Caddy examples; `x-forwarded-for` for Traefik), then `docker compose up -d`. While you are there, check the log's first lines for `UNLEASE_TOKEN has N characters`: a token under 32 characters deserves a new one (`openssl rand -hex 32`, then on each device).

## Why the server goes first

An app sends what it knows. A server older than the app drops a field or a record type it does not know, for good: the app will not send it again. A server newer than the apps is fine: older apps just do not use what is new. The coming release adds Carnet's fact templates (a new `linkTemplate` record, a collection's template, the version a link was read with) and the price watch's fields: a template made on an app that reached an older server first would be lost.

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
