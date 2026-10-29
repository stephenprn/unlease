# Changelog

All notable changes to Unlease are written here: the server and every app share one version. The format follows [Keep a Changelog](https://keepachangelog.com/en/2.0.0/) and versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Until 1.0.0, a minor version (0.2.0) may break things: each break is marked **Breaking:** with what to do about it, and [docs/UPGRADING.md](docs/UPGRADING.md) says how to upgrade.

## [Unreleased]

## [0.1.0] - 2026-10-29

The first release: the Unlease server and its first app, Carnet.

### Added

- The Unlease server, one Docker image for the whole suite (`ghcr.io/stephenprn/unlease`, amd64 and arm64): sync for every app, photos and files, a daily copy of its database, backups to any S3 storage as a readable archive, files kept in a Seafile library, and the Administration that sets all of it from the apps.
- Carnet, the notes app, on Android (an APK) and on the web (served by the server): notes, checklists and drawings Keep's way, collections of links read and filed by Claude with small modules on them, and pages, a Notion-like knowledge base. In French or English.
- A demo of Carnet on the web, on GitHub Pages (https://stephenprn.github.io/unlease/): made-up notes and pages and a server simulated in the page, so nothing leaves the browser. Each release updates it.
- A first run that connects a device in two steps and, on a new server, lists what it can do on top: restore a backup, Claude, S3, Seafile, Seerr.
- Carnet's look in the services beside it: « Habiller vos autres services… » (under the background's choices, in Réglages and in the first run) gives the stylesheet with the device's colours and background for Seafile, Seerr and Immich, ready to copy into each (Seafile's and Immich's custom CSS setting; Seerr has none yet, so a browser extension or your proxy), and Seafile's logo, favicon and login background in the same colours (downloaded on the web, saved through Android's save screen on the phone). A slip points to it after the colours change.
- Carnet's logo in the device's primary colour, in the app and in the web app's tab.

[Unreleased]: https://github.com/stephenprn/unlease/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/stephenprn/unlease/releases/tag/v0.1.0
