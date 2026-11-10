# Security

## Reporting a vulnerability

Please do not open a public issue. Report it privately through GitHub: the repository's **Security** tab, **Report a vulnerability**. Say what is affected, how to reproduce it and what an attacker gains. You will get an answer within a week; fixes go into a release with credit to you unless you prefer otherwise.

## Supported versions

Security fixes go into the latest release only, as a new patch release (0.2.1 after 0.2.0); until 1.0.0, older minor versions get none, so upgrade ([docs/UPGRADING.md](docs/UPGRADING.md)). The fix and what to do are in the [changelog](CHANGELOG.md), under Security.

## What Unlease protects, and how

Unlease is built for one person (or one household) per server, whatever apps it runs.

- **One bearer token** guards every route except the health check (which says only what a device needs before it has the token: the sync protocol, the apps that are on, whether the setup is done and whether Claude reads links, never the release), the web apps' static files, the published calendar's secret address and a short-lived download link. Its strength is its length: `openssl rand -hex 32` makes 64 random characters, and the server warns at start about one shorter than 32. Wrong tokens are braked per client address (after ten in a minute, that address's next wrong ones get 429 for a while, logged once rather than line by line); the right token always passes, so a guesser cannot lock you out. The address is the connection's own unless `UNLEASE_TRUSTED_PROXY_HEADER` names the one header your reverse proxy sets ([docs/SELF-HOSTING.md](docs/SELF-HOSTING.md#the-clients-address)).
- **Secrets stay on the server**: the Claude key, the S3 secret and the Seafile token are stored in its database and never sent back to the apps (only their last four characters). Protect the data volume and its backups accordingly.
- **Carnet's link reading fetches arbitrary pages from the server**: requests to private, loopback and link-local addresses are refused, redirects are checked again, and sizes and times are capped (`server/src/apps/notes/analysis/address.ts`, `fetcher.ts`). Page content is treated as data in Claude's prompt, never as instructions.
- **The phone apps share their connection only with each other**: the second app of the suite installed on a phone reads the first one's address, token and colours through a content provider guarded by a signature permission (`com.stephenprn.unlease.permission.SUITE`), which Android grants only to apps signed with the same key; the reader also checks that the provider belongs to the sibling's own package and that this package is signed with its key before reading it.
- **The phone apps keep to themselves**: nothing of theirs goes into Android's backups or a transfer to a new phone (the token included: a new phone connects again and syncs). The components only their own notifications and widgets should reach (Notifee's notification activity, the widgets' routers and tick receiver) are not exported, and a widget's tap names a record the app looks up itself, never a number to call or an address to open.
- **Words from outside are only words**: a subscribed calendar's, the public holidays' or an imported file's text is stored as plain text, never as markup; links open only to the web, mail or a telephone number (`safeLink` in `packages/core/src/services/url.ts`), and a pasted one is dropped otherwise; Pages takes whole blocks from the clipboard only from its own copies in the same browser. An address another site can open (Carnet's capture and share addresses, Agenda's new event) fills a form or asks first: it never saves on arrival.
- **The published calendar** (Agenda, off until turned on) is read without the token, its secret in its address: it holds your own events, and in their descriptions names only contacts and those events, never a note, a link or a page.
- **Files are served safely**: anything that is not an image, a video, audio, a PDF or plain text goes out as a download, never rendered on the server's origin. The web apps are served with a strict Content Security Policy (`server/src/http/web.ts`, `web/root/_headers`): they reach only their own origin or an HTTPS address, never a plain-http or local one.
- **Over HTTPS only** for the phone: release builds refuse cleartext traffic.
- **Releases carry the maintainer's own key**: a release build without the upload key stops (`-PallowDebugSigning` builds one signed with React Native's public debug key, to try on your own phone only), and the release workflow fails without the key, then checks every APK's certificate (never a debug key; the one the repository variable `ANDROID_SIGNING_CERT_SHA256` names, when set). The third-party actions that run beside the key or publish the release are pinned to commits ([docs/RELEASING.md](docs/RELEASING.md#signing-the-apks)).

Out of scope: an attacker who already holds the token, or the server's data volume.
