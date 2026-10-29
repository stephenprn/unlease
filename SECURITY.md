# Security

## Reporting a vulnerability

Please do not open a public issue. Report it privately through GitHub: the repository's **Security** tab, **Report a vulnerability**. Say what is affected, how to reproduce it and what an attacker gains. You will get an answer within a week; fixes go into a release with credit to you unless you prefer otherwise.

## Supported versions

Security fixes go into the latest release only, as a new patch release (0.2.1 after 0.2.0); until 1.0.0, older minor versions get none, so upgrade ([docs/UPGRADING.md](docs/UPGRADING.md)). The fix and what to do are in the [changelog](CHANGELOG.md), under Security.

## What Unlease protects, and how

Unlease is built for one person (or one household) per server, whatever apps it runs.

- **One bearer token** guards every route except the health check, the web app's static files and a short-lived download link. Ten failed tokens in a minute from one address are refused for a while (the address is read from `CF-Connecting-IP`, then `X-Real-IP`, then the socket: run it behind a proxy that sets one of them).
- **Secrets stay on the server**: the Claude key, the S3 secret and the Seafile token are stored in its database and never sent back to the apps (only their last four characters). Protect the data volume and its backups accordingly.
- **Carnet's link reading fetches arbitrary pages from the server**: requests to private, loopback and link-local addresses are refused, redirects are checked again, and sizes and times are capped (`server/src/apps/notes/analysis/address.ts`, `fetcher.ts`). Page content is treated as data in Claude's prompt, never as instructions.
- **Files are served safely**: anything that is not an image, a video, audio, a PDF or plain text goes out as a download, never rendered on the server's origin. The web app is served with a strict Content Security Policy (`server/src/http/web.ts`, `web/notes/public/_headers`).
- **Over HTTPS only** for the phone: release builds refuse cleartext traffic.

Out of scope: an attacker who already holds the token, or the server's data volume.
