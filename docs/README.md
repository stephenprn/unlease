# Unlease's documentation

Sorted by what you came for (the [Diátaxis](https://diataxis.fr/) split): learning, doing one thing, looking something up, or understanding why.

## Get started

- [Install](../README.md#install): a server and Carnet, from the latest release.

## How-to guides

- [Self-hosting](SELF-HOSTING.md): HTTPS in front (Caddy, nginx, Traefik, Cloudflare Tunnel), the first run, your data, hosting a web app elsewhere, a server without a public address.
- [Upgrading](UPGRADING.md): to a new release, the server first; pinning a version; going back.
- [Backups and restores](SELF-HOSTING.md#your-data): what to copy, Unlease's own S3 backups, restoring from the Administration.
- [Contributing](../CONTRIBUTING.md): set up the repository, the checks, a pull request.
- [Releasing](RELEASING.md) (maintainers): a version, the changelog, the tag, what the release publishes; signing and building the APK.

## Reference

- [Configuration](SELF-HOSTING.md#settings): every environment variable.
- [Server API](../server/README.md): every route, the settings, the data on disk.
- [Changelog](../CHANGELOG.md): what each release changed, breaking changes marked.
- [Security policy](../SECURITY.md): reporting a vulnerability, supported versions.

## Explanation

- [Architecture](ARCHITECTURE.md): one repository and one server for the suite, data across apps (ids, record types, references), the sync, Carnet's link reading, pages and search.
- [Privacy and costs](PRIVACY.md): what leaves your server, when, and what Claude costs.
- [Design system](../DESIGN.md): the look every app shares; [design research](DESIGN-RESEARCH.md) behind it.
- [Product](../PRODUCT.md): who it is for and the principles it keeps.
- [Conventions](../CLAUDE.md): the rules every change follows, written for people and coding agents alike.
