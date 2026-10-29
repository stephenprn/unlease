# Self-hosting Unlease

One container runs the whole suite: the server (sync, photos and files, backups, and each app's own work: Carnet's link reading) and the web apps it serves, on port 8080. Your phones and your browsers reach it over HTTPS. Today the suite is one app, Carnet (notes, checklists, pages and links); the apps that follow run in the same container, and you install only the clients you want.

## What you need

- A machine with Docker and Docker Compose: a home server, a NAS, a Raspberry Pi 4 or 5 (the image is built for amd64 and arm64), or a small VPS. 1 GB of memory is comfortable: it uses more while it reads links and resizes pictures.
- An HTTPS address for it. The Android app refuses plain `http://` (release builds disallow cleartext), and browsers only install the web app and its offline copy over HTTPS. A reverse proxy with a certificate, or a tunnel, gives you one (below).
- Optionally, an Anthropic API key for link reading, an S3 bucket for backups (Scaleway, OVH, AWS, Backblaze, MinIO…), a Seafile server for your files and a Seerr (Jellyseerr, Overseerr) for requesting films and series.

## Run it

```bash
mkdir unlease && cd unlease
curl -fsSLO https://github.com/stephenprn/unlease/releases/latest/download/docker-compose.yml
curl -fsSL -o .env https://github.com/stephenprn/unlease/releases/latest/download/example.env
openssl rand -hex 32           # paste it as UNLEASE_TOKEN in .env
docker compose up -d
docker compose logs -f unlease # "unlease-server listening", with its version
```

Both files come from the latest release and name its version (`UNLEASE_VERSION` in `.env`), so the server stays on it until you choose to upgrade ([UPGRADING.md](UPGRADING.md)). For a given release, replace `latest/download` with `download/v0.2.0`. Each release lists the SHA-256 of its files in `SHA256SUMS`.

The token is the one secret: every device types it once, and the server answers nothing without it. Ten wrong tokens in a minute from one address are refused for a while.

By default the container listens on `127.0.0.1:8080`, for a reverse proxy on the same machine. For a proxy on another machine, publish `"8080:8080"` instead and let only the proxy reach it.

## HTTPS in front

Uploads go up to 100 MB (a page's video or PDF) and a sync request may wait up to 25 seconds for news: give the proxy a body limit of at least 100 MB and a read timeout above 30 seconds. No websockets are used.

### Caddy

```caddyfile
notes.example.org {
	request_body {
		max_size 110MB
	}
	reverse_proxy 127.0.0.1:8080
}
```

### nginx

```nginx
server {
    listen 443 ssl http2;
    server_name notes.example.org;
    # ssl_certificate ... ssl_certificate_key ...
    client_max_body_size 110m;
    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 60s;
    }
}
```

Set `X-Real-IP` (or run behind Cloudflare, which sends `CF-Connecting-IP`): the server counts failed tokens per client address.

### Traefik (labels on the Compose service)

```yaml
    labels:
      - traefik.enable=true
      - traefik.http.routers.unlease.rule=Host(`notes.example.org`)
      - traefik.http.routers.unlease.entrypoints=websecure
      - traefik.http.routers.unlease.tls.certresolver=letsencrypt
      - traefik.http.services.unlease.loadbalancer.server.port=8080
```

Attach the service to Traefik's network and drop its `ports:` entry.

### Cloudflare Tunnel

No port to open at home: run `cloudflared` beside it and route a hostname to `http://unlease:8080` (same Compose network) or `http://localhost:8080`. Cloudflare refuses requests over 100 MB on its free plans, which matches the server's limit; restoring a backup archive larger than that goes through your LAN address or from S3 instead.

## First run

Open your address in a browser. The address is already filled in (the server serves this page); type the token (the language switch sits at the top right). Then come the colours and background of this device (skippable), and, because this server holds nothing yet, **Your server** (« Votre serveur » in French): one list of what the server can do on top, every row optional and opened on its own:

1. **Restore**, first, when this server holds nothing yet: the newest backup from S3 (add S3 first, from its row), or an archive kept elsewhere.
2. **Claude**: the API key, the model and a monthly budget; and, off until you turn them on, the questions about pages ("Demander à Claude" on a page): whether a question may read all pages, whether it may search the web, and how much one question may read.
3. **Backups to S3**: endpoint, region, bucket, an optional prefix and a key with list, write and delete rights. The server tries them before keeping them. Daily by default.
4. **Files in Seafile**: your Seafile's address (a LAN address is fine, only the server talks to it), a library API token with read and write rights, and a folder (`/Unlease` by default). Photos and page files then live there, each app's under its own folder (`Unlease/Carnet/Notes/<note>/…`), named after what holds them, and the server keeps only small previews.
5. **Seerr**: its address (a LAN address is fine, only the server talks to it; give the one it answers on, as the server does not follow redirects) and, optionally, its API key (Seerr's Settings, General). With the key, the films and series modules open the title's own page and say whether it is already there; without it, they open Seerr's search.

"Start" opens the board whenever you like. Everything here can be changed later in Administration. Then on the phone: install the APK from the GitHub releases, enter the same address and token. A device joining a server already in use goes from its colours straight to the board.

## Your colours in Seafile, Seerr and Immich

Carnet can give the services beside it the colours and background chosen on a device: a stylesheet made from them, by day and at night where the service has both. In Réglages, under the background's choices (and in the first run's appearance step), « Habiller vos autres services… » ("Style your other services…") shows the three, each with its copy button. Copy it again after changing the colours.

- **Seafile** (13 and 14): System Admin, Settings, Branding. Paste it in "Custom CSS" and save it with the tick button beside the box (leaving the box without it drops the paste), then tick "Use custom CSS". Reload the page. Under its stylesheet come three pictures in the same colours, each uploaded in that same Branding section with its "Change" button: « Logo » (Carnet's mark in your primary colour, square; Seafile shows it 32 pixels high in its header and 40 on its login page, and stretches it only in that settings page's preview), « Favicon » (an ICO at 16, 32 and 48 pixels) and « Fond de connexion » for "Login background image" (2400 × 1600, your background as it is by day, since Seafile shows its login page light to anyone signed out). Make them again after changing the colours.
- **Immich**: Administration, Settings, Theme Settings (`/admin/system-settings?isOpen=theme`), "Custom CSS", then Save. An Immich configured by a file has the field disabled: put the CSS in the file's `theme.customCss`.
- **Seerr** has no such setting yet, so the stylesheet reaches it from outside. For one browser, an extension such as Stylus ("Write style for" Seerr's address, paste, save). For everyone, your reverse proxy: save the CSS as a file beside it and have it linked from every page, for nginx:

  ```nginx
  location = /unlease/seerr.css {
      alias /etc/nginx/unlease/seerr.css;
      types { } default_type text/css;
      add_header Cache-Control "no-cache";
  }

  location / {
      proxy_pass http://127.0.0.1:5055;
      # ... your usual proxy_set_header lines ...
      proxy_set_header Accept-Encoding "";   # sub_filter needs Seerr's pages uncompressed
      sub_filter '</head>' '<link rel="stylesheet" href="/unlease/seerr.css"></head>';
      sub_filter_once on;
  }
  ```

  It needs nginx's `sub_filter` module (`nginx -V` lists `--with-http_sub_module`). In Nginx Proxy Manager, add the `location /` lines in a custom location `/`, not in the Advanced tab: there, the `location /` it generates sets headers of its own, which cancel the `Accept-Encoding` line.

## Settings

Most of Unlease is set from the apps. The environment holds what must be known at start:

| Variable | Default | |
| --- | --- | --- |
| `UNLEASE_TOKEN` | required | The bearer token every device sends. |
| `TZ` | `UTC` | The time zone photos are named in, in the drive and in backups (`2026-10-26 14.03.12.jpg`). |
| `UNLEASE_VERSION` | the release's own | (Compose only) the image tag to run: a release such as `0.2.0` ([UPGRADING.md](UPGRADING.md)). |
| `UNLEASE_CORS_ORIGINS` | none | Only for a web app hosted on another origin (below). |
| `UNLEASE_CLAUDE_EFFORT` | `low` | How hard Claude thinks per link: `low`, `medium`, `high`, `xhigh`, `max`. |
| `UNLEASE_ANALYSIS_CONCURRENCY` | `2` | Links read at once (1 to 16). |
| `ANTHROPIC_API_KEY`, `UNLEASE_CLAUDE_MODEL`, `UNLEASE_MONTHLY_BUDGET_USD` | none, `claude-opus-5-5`, `15` | Fallbacks while the apps have set nothing. |
| `UNLEASE_DATA_DIR`, `UNLEASE_WEB_DIR`, `PORT` | `/data`, `/app/web`, `8080` | Set by the image; change them only when running the server outside it. |

`server/README.md` documents the API and every route.

## Your data

Everything lives in the `/data` volume:

- `unlease.sqlite`: every app's records (Carnet's notes, links and pages) and every setting (the Claude key, the S3 secret, the Seafile token and the Seerr key included: protect the volume).
- `blobs/`: photos, page files and the pictures kept from links (originals move to Seafile when the drive is set).
- `backups/`: a consistent copy of the database each day, the last few kept.

Back up `backups/` and `blobs/`, never the live `unlease.sqlite` (a copy taken while it is written may not open), or let the server's own S3 backup do it: a readable archive each time (`unlease.json`, plus each app's Markdown under its folder: Carnet's notes, collections and pages) and each file once. Any backup restores from Administration, from S3 or from a downloaded archive, merged into what is there or rolled back to it.

## Upgrading

Set `UNLEASE_VERSION` in `.env` to the new release, then `docker compose pull && docker compose up -d`, the server before the apps (a newer app may send fields an older server would drop). [UPGRADING.md](UPGRADING.md) has the steps, the version tags (`0.2.0`, `0.2`, `latest`, `edge`) and how to go back.

## Hosting a web app elsewhere

A web app is plain static files. To serve Carnet's from a static host (Cloudflare Pages, Netlify, an nginx of your own), build it from the repository's root (`npm ci && npm run build -w web/notes`, output `web/notes/dist`), make the host answer unknown paths with `index.html`, send the headers in `web/notes/public/_headers`, and allow that origin on the server: `UNLEASE_CORS_ORIGINS=https://notes.example.org`. The first-run screen then asks for the server's address.

## Without a public address

On a LAN only, the web app works over plain HTTP from a browser on that LAN (without its offline copy), but the Android app needs HTTPS. A private mesh with certificates (Tailscale's HTTPS, a VPN to your home with a reverse proxy and a certificate for a name it resolves) works the same as a public address.
