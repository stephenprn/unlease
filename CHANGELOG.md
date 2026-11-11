# Changelog

All notable changes to Unlease are written here: the server and every app share one version. The format follows [Keep a Changelog](https://keepachangelog.com/en/2.0.0/) and versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Until 1.0.0, a minor version (0.2.0) may break things: each break is marked **Breaking:** with what to do about it, and [docs/UPGRADING.md](docs/UPGRADING.md) says how to upgrade.

## [Unreleased]

## [0.1.1] - 2026-11-11

### Added

- On Android, Carnet's collections appear in the share sheet's first row: share a link straight into "Films & series" without choosing afterwards. The collections you filed into last come first.
- On Android, every app's icon holds shortcuts on a long press: a new note, list or link and the search in Carnet; a new page and the search in Pages; a new event, an event in a few words, today and the search in Agenda; a new contact, the favourites, the birthdays and the search in Contacts.
- On Android, text selected in any app can go to Carnet ("Note in Carnet": a link is filed, words become a note) or become an event ("Create event": Agenda's quick add, already filled in).
- On Android, "Add to calendar" and "Add contact" in other apps (a booking in your e-mail, a number in your dialer or Messages) open Agenda's or Contacts' new form, filled in; nothing is saved until you save it.
- On Android, a `webcal://` link opens Agenda's subscriptions with its address, ready to subscribe, and a link that opens the calendar at a moment (from the Clock or another app) opens that day.
- On Android, Quick Settings tiles for a new note (Carnet) and a new event (Agenda), and Pages in the share sheet: shared text becomes a new page.
- On Android, pull Agenda's views down to sync, as in the other apps.
- On the web, `C` makes a page in Pages, as it makes a note, an event or a contact in the other apps (`P` still works); the `?` help lists Agenda's and Contacts' own keys; `E` opens the selected event's form in Agenda and `#` bins the selected contacts in Contacts, as their buttons said.
- Carnet's starter collections (Fashion, Films & series, Restaurants, To read, Home, Travel) come with their own facts for Claude to note, chosen as they are made; one made earlier starts from them when you give it its own.

### Changed

- On the web and on Android, what scrolls under a bar, a dialog's title or a form's buttons gently dissolves as it slides under them, only while there is more beyond, and only there: where it simply runs off the screen (the foot of a page or of the side menu), or under a search field, it stays a plain edge. The line you are typing on always stays clear of it, as when writing on the last line of a note or above a form's buttons. On Android, tapping into a long note or page no longer jumps it to its top before scrolling back to your line: it stays put, then glides just enough to keep the caret above the keyboard. The side menu, and sheets and pickers without buttons, now scroll down to the very bottom of the screen instead of stopping short of it. Dialogs on the web no longer draw a line under their title or over their buttons.
- Every empty place says so and arrives with a little motion, in every app: a search with nothing found lays down its own collage, and pickers, menus and small lists show a line that settles in. A few places that showed nothing now say why (Agenda's search before you type, a time zone or a country with no match, the web's people picker in Agenda).
- Lists move the same way in every app, on the web and on Android: what you remove fades where it was and the rest close ranks; what you add settles in (contacts, bins, labels, Pages' home and tree, Agenda's reminders).
- On Android, Back from Archives, Reminders, the bin or a label in Carnet goes back to your notes instead of leaving the app.
- On Android, swipes follow one rule: a row that acts (a link marked done, a contact called) acts only when you let go past its threshold, which clicks; what goes away (a note archived, a week turned) goes when flung too, with a click.
- On Android, the bins of Pages, Contacts and Agenda look like Carnet's, one card per item, and an item opens from the bin; renaming a label to a name already taken says so under the field and keeps what you typed.
- In Agenda for Android, the event form says what is missing above its fields, and "Save" shows it is saving.
- In Contacts on the web, Favourites and a label with no contacts yet offer to create or import them. On the web, the settings' bin row says "The bin is empty" and does nothing while it is.
- Carnet's fact templates become "Facts Claude notes", on the web and on Android: a collection's menu opens its page, where you keep Claude's usual facts or give it its own and edit them right there, each fact one line that opens in place, its type shown as the shape of the answer (a number, a date…). Each kind's usual facts are changed from the overview, under Administration › Claude. Existing templates keep working as their collections' own facts.
- The demo's notes, pages, events and people are in English; its interface follows your browser (English unless it is French), and `?lang=en` or `?lang=fr` picks one.
- Text fields are frosted in every app, on the web and on Android: the background's grain no longer shows behind what you type.
- On Android, a bottom sheet follows your finger from anywhere on it, as Google's do: pull it down to close it, and a list in it scrolls back to its top before the sheet moves. Photos in a note and pictures in a page close with a pull down, zoom with a pinch or a double tap, and a swipe goes to the next photo.
- On Android, a long text field (an event's description, a contact's note, a question to Claude) grows to eight lines, then scrolls, so the form stays in reach above the keyboard.
- In Agenda for Android, an event's colour is one line that opens the colours, instead of three rows of swatches.
- In Contacts, each letter's people are grouped on their own panel under a larger letter, instead of a thin rule.
- Settings are reorganised the same way in every app, on the web and on Android: the app's own settings come first (Carnet's board layout and reminders, Agenda's calendar, Contacts' order and birthdays), then "Appearance" as one row showing your look, then Language and Data, and the Administration last. "Appearance" opens its own page with the theme, the paper grain, the colours and the background; a search for a colour or the background opens it there, and older links to `…/settings#colors` or `#ground` still land.
- "Paper grain" and "Grain on the background" each say what they texture: the first is a fine paper texture on notes, cards and panels, the second the film grain over the screen's background.
- Help lines and paragraphs in settings, the Administration, the setup, dialogs and the facts pages run the full width of their panel instead of stopping at about two thirds of it.
- What needs a service set up in the Administration shows only once it is set up, in every app, on the web and on Android: without a Claude key, "Facts Claude notes", reading links again, Claude's sorting, asking Claude about a link, Claude's link modules and Agenda's "Ask Claude" no longer show (and the language setting no longer mentions Claude); Seerr's module waits until Seerr is linked. Each device remembers what the server last said, so nothing flickers when it starts offline.
- A collection's large background emblem is laid down as the collection opens, drifting into its slant as it fades in, as the empty states' cut-outs do.
- In Agenda on the web, the quick form of an event drawn on the grid stands beside the slot and holds its day and hours (the slot follows them), a place, people and a description, each a line that opens into its field; "More options" keeps all of it, people included, and Escape asks before dropping what was typed. A day of the month offers "All day" to give it hours.
- Dialogs' buttons sit as far from the dialog's foot as from its side.
- The demo moves to https://demo.unlease.org (its old address leads there).

### Fixed

- Pages: Tab on a block under a closed toggle (a callout just written, for instance) no longer hides it: the toggle opens with the block and the caret in it, and Ctrl+Z puts it back. Ctrl+Z undoes the page even when no text has the focus, instead of the browser's own undo changing blocks' text.
- Highlights, buttons and focus rings in the corner of a panel, menu, popover, dialog or sheet sit as far in from both sides and follow its curve, on the web and on Android (settings, the Administration, the setup, pickers, list dialogs, the facts page, the link page, Agenda's event pages).
- In Agenda on the web, the schedule's empty state is centred, and "Show more" appears only when something lies further ahead, reaching it in one press.
- In Agenda on the web, the event title's underline starts under its first letter.
- On the web, Escape in an open list (a time, a place, people) closes the list alone, not the dialog around it.
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
