# Changelog

All notable changes to Unlease are written here: the server and every app share one version. The format follows [Keep a Changelog](https://keepachangelog.com/en/2.0.0/) and versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Until 1.0.0, a minor version (0.2.0) may break things: each break is marked **Breaking:** with what to do about it, and [docs/UPGRADING.md](docs/UPGRADING.md) says how to upgrade.

## [Unreleased]

### Changed

- Carnet's fact templates become "Facts Claude notes", on the web and on Android: a collection's menu opens its page, where you keep Claude's usual facts or give it its own and edit them right there, each fact one line that opens in place, its type shown as the shape of the answer (a number, a date…). Each kind's usual facts are changed from the overview, under Administration › Claude. Existing templates keep working as their collections' own facts.
- The demo's notes, pages, events and people are in English; its interface follows your browser (English unless it is French), and `?lang=en` or `?lang=fr` picks one.

## [0.1.1] - 2026-11-10

### Changed

- The demo moves to https://demo.unlease.org (its old address leads there).

### Fixed

- On the web, an app picked in the launcher (or another app's place opened from a menu, the drawer or the search) opens again: the browser no longer stays on the app you were in.
- The demo's "page not found" no longer sends the browser round in circles when the page it sends to is missing too (the address grew until the browser refused it): it says the page is not there.
- The demo keeps its language when you open another app from the launcher: in English, every app stays in English.

## [0.1.0] - 2026-11-10

The first release: the Unlease server and four apps, Carnet, Pages, Contacts and Agenda, on the web and on Android.

### Added

- The Unlease server, one Docker image for the whole suite (`ghcr.io/stephenprn/unlease`, amd64 and arm64): offline-first sync for every app, photos and files, a daily copy of its database, backups to any S3 storage as a readable archive (Markdown, JSON, vCard and iCalendar), and files kept in a Seafile library if you want them there.
- One setup for the whole server, done by the first device: which apps it runs, then Claude, S3, Seafile, Seerr and the public holidays for the apps chosen. The Administration, in every app, changes them later; an app turned off keeps its data.
- **Carnet**, a Google Keep of your own: notes, checklists and drawings Keep's way (labels, colours and papers, reminders, photos, undo), moved in from a Google Keep export; collections of links Claude reads, summarises and files, noting what you choose for each kind of link, with modules on the links (price tracking, promo codes, a recipe scaled with its shopping list, a series' recap, the way to a place, a copy kept as a page, a question to Claude).
- **Pages**, a Notion-like knowledge base: nested pages with headings, tasks, toggles, callouts, tables with typed columns, columns, pictures, files and drawings, templates for a new page, Carnet's notes, collections and links cited or embedded, and Claude answering questions about your pages.
- **Contacts**, a Google Contacts of your own: names, numbers, e-mails, addresses, birthdays, labels and favourites, imported from Google Contacts (vCard or CSV) or from the phone; duplicates found and merged; a call, a message or WhatsApp in one tap; birthday notifications and wishes; gift ideas kept in Carnet.
- **Agenda**, a Google Calendar of your own: day, three days, week, month, year, a schedule and « Aujourd'hui »; repeating events, reminders, time zones, labels, places with their weather and guests from Contacts; subscribed calendars, public holidays, Google Calendar's export imported and your own published at a secret address; an event typed in a few words, and Claude asked about your week. Your contacts' birthdays, Carnet's reminders and the days written in your pages show beside your events.
- The apps' data linked: Pages and Carnet mention contacts and events (type `@`), each lists where it is mentioned, an event's notes become a page in one tap, and a link can be kept as a page.
- On Android, an APK per app (`carnet`, `pages`, `contacts` and `agenda`), all signed with one key: the second app installed reuses the first one's connection and colours. Home-screen widgets in Carnet, Contacts and Agenda, Carnet's share sheet, and notifications that ring on time.
- On the web, each app is its own installable web app under its path (`/notes`, `/pages`, `/contacts`, `/agenda`), served by the server, with a launcher between them, keyboard shortcuts, a search that also finds the settings, and Agenda's reminders as push notifications.
- Each app's look: light or dark, a primary and an accent colour, a ground and the paper's grain, given to the other apps in one tap; the same look for Seafile, Seerr and Immich (« Habiller vos autres services… »).
- French and English.
- A demo on GitHub Pages (https://stephenprn.github.io/unlease/): the four web apps with made-up notes, pages, people and events and a server simulated in the page, so nothing leaves the browser. Each release updates it.

[Unreleased]: https://github.com/stephenprn/unlease/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/stephenprn/unlease/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/stephenprn/unlease/releases/tag/v0.1.0
