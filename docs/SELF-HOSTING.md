# Self-hosting Unlease

One container runs the whole suite: the server (sync, photos and files, backups, and each app's own work: Carnet's link reading, Pages' questions to Claude) and the web apps it serves (Carnet at `/notes`, Pages at `/pages`), on port 8080. Your phones and your browsers reach it over HTTPS. You choose which apps it runs during its setup, and change your mind later in Administration: an app turned off keeps its data, and the container stays the same.

Why one container rather than one per app: the apps share one process, one database, one sync and one set of settings, so splitting them would give you more to run and update for nothing in return. Projects of this shape do the same (Nextcloud's apps, Mealie, Paperless-ngx); suites split their images only for another runtime or heavy optional hardware, as Immich does for its machine learning. [ARCHITECTURE.md](ARCHITECTURE.md#deployment) has the sources.

## Before you start

**Needed**

- A machine with Docker and Docker Compose: a home server, a NAS, a Raspberry Pi 4 or 5 (the image is built for amd64 and arm64), or a small VPS. 1 GB of memory is comfortable: it uses more while it reads links and resizes pictures.
- An HTTPS address for it, such as `https://unlease.example.org`. The Android apps refuse plain `http://` (release builds disallow cleartext), and browsers only install the web apps and their offline copy over HTTPS. A reverse proxy with a certificate, or a tunnel, gives you one ([below](#https-in-front)).

**What the setup may ask, and where you find it.** Only the first two are needed; the rest is optional, can wait for Administration, and is asked once for every app.

| Asked for | For | Where you find it |
| --- | --- | --- |
| The server's address | Every device | Your HTTPS address. Opened from it, a web app fills it in itself. |
| The token | Every device | `UNLEASE_TOKEN` in the `.env` next to `docker-compose.yml`: `grep UNLEASE_TOKEN .env`. A phone app offers the connection of the suite's app already installed on it instead. |
| A Claude API key | Carnet reads and files links; Pages answers questions; Agenda reads an event typed in a few words or found in a saved link, and answers questions | [console.anthropic.com](https://console.anthropic.com/settings/keys), **API Keys**, **Create Key** (it starts with `sk-ant-`). Add credit under **Billing**; the monthly budget you set in the setup stops the server before it spends more. |
| S3: service address, region, bucket, access key and secret | Backups of every app, away from home | Your provider's console. **Scaleway**: create a bucket in **Object Storage** (its region, `fr-par`, gives the address `https://s3.fr-par.scw.cloud`), then **IAM**, **API keys**, **Generate an API key** (the access key and the secret, shown once). **AWS**: an S3 bucket, then an IAM user with access to it and an **access key**. **OVHcloud**: **Public Cloud**, **Object Storage**, a bucket and an **S3 user**. The key needs to list, write and delete in the bucket; the setup tries all three before it keeps it. |
| Seafile: its address and a library API token | Your photos and files in a Seafile library | In Seafile, open the library's menu (⋯), **API Token**, add one with **read-write** rights. A LAN address is fine (`http://192.168.1.20:8000`): only the server talks to Seafile. |
| Seerr: its address and API key | Carnet's films and series modules | In Seerr (Jellyseerr, Overseerr): **Settings**, **General**, **API Key**. Give the address it answers on: the server does not follow redirects. |
| A country, and maybe a region | Agenda's public holidays | Pick it in the list: the server fetches its days from [Nager.Date](https://date.nager.at) (no account, no key). A region adds its own days (Alsace and Moselle's `FR-67`, `FR-68`, `FR-57`). |

## Run it

1. **Download the two files** of the latest release into a folder of their own:

   ```bash
   mkdir unlease && cd unlease
   curl -fsSLO https://github.com/stephenprn/unlease/releases/latest/download/docker-compose.yml
   curl -fsSL -o .env https://github.com/stephenprn/unlease/releases/latest/download/example.env
   ```

   Both name the release's version (`UNLEASE_VERSION` in `.env`), so the server stays on it until you choose to upgrade ([UPGRADING.md](UPGRADING.md)). For a given release, replace `latest/download` with `download/v0.2.0`. Each release lists the SHA-256 of its files in `SHA256SUMS`.

2. **Make your token**, the one secret every device types once (the server answers nothing without it):

   ```bash
   sed -i "s/^UNLEASE_TOKEN=.*/UNLEASE_TOKEN=$(openssl rand -hex 32)/" .env    # on macOS: sed -i ''
   grep UNLEASE_TOKEN .env                                                     # keep it at hand for the setup
   ```

   That makes 64 random characters, which no one guesses. Keep at least 32: the server says so in its log at start (`UNLEASE_TOKEN has N characters`) when the token is shorter, and still starts. To change it, put a new one in `.env`, `docker compose up -d`, and type it again on each device. Wrong tokens are also braked: after ten in a minute from one address, that address's next guesses are refused for a while (the right token always passes, so nobody can lock your devices out); behind a proxy, [tell the server which header names that address](#the-clients-address).

3. **Start it** and check it answers:

   ```bash
   docker compose up -d
   docker compose logs -f unlease    # "unlease-server listening", with its version; Ctrl+C to leave
   ```

   By default the container listens on `127.0.0.1:8080`, for a reverse proxy on the same machine. For a proxy on another machine, publish `"8080:8080"` instead and let only the proxy reach it. Docker keeps its logs in three files of 10 MB at most (`logging:` in `docker-compose.yml`).

4. **Put HTTPS in front** ([below](#https-in-front)), then **open your address in a browser** for the [setup](#the-setup).

## HTTPS in front

Uploads go up to 100 MB (a page's video or PDF) and a sync request may wait up to 25 seconds for news: give the proxy a body limit of at least 100 MB and a read timeout above 30 seconds. No websockets are used.

### The client's address

The server counts wrong tokens per client address. It takes the address from the connection, which nobody can forge; behind a proxy that is the proxy's own, so every guess counts against one address (your devices still pass: only wrong tokens are braked) and the log names the proxy. Set `UNLEASE_TRUSTED_PROXY_HEADER` in `.env` to the header your proxy sets to the client's address, as each example below says: `x-real-ip`, `x-forwarded-for` (its last address, the one your proxy added, is taken) or `cf-connecting-ip`. Name a header only when every request reaches the server through that proxy and the proxy sets the header itself: the server believes it, and a client that can reach the server directly could write any address in it.

### Caddy

```caddyfile
unlease.example.org {
	request_body {
		max_size 110MB
	}
	reverse_proxy 127.0.0.1:8080 {
		header_up X-Real-IP {remote_host}
	}
}
```

With `UNLEASE_TRUSTED_PROXY_HEADER=x-real-ip` in `.env`.

### nginx

```nginx
server {
    listen 443 ssl http2;
    server_name unlease.example.org;
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

With `UNLEASE_TRUSTED_PROXY_HEADER=x-real-ip` in `.env`: nginx sets `X-Real-IP` to the client's address, replacing any a client sent.

### Traefik (labels on the Compose service)

```yaml
    labels:
      - traefik.enable=true
      - traefik.http.routers.unlease.rule=Host(`unlease.example.org`)
      - traefik.http.routers.unlease.entrypoints=websecure
      - traefik.http.routers.unlease.tls.certresolver=letsencrypt
      - traefik.http.services.unlease.loadbalancer.server.port=8080
```

Attach the service to Traefik's network and drop its `ports:` entry. Set `UNLEASE_TRUSTED_PROXY_HEADER=x-forwarded-for` in `.env`: Traefik adds the client's address at the end of `X-Forwarded-For`.

### Cloudflare Tunnel

No port to open at home: run `cloudflared` beside it and route a hostname to `http://unlease:8080` (same Compose network) or `http://localhost:8080`. Cloudflare refuses requests over 100 MB on its free plans, which matches the server's limit; restoring a backup archive larger than that goes through your LAN address or from S3 instead.

Set `UNLEASE_TRUSTED_PROXY_HEADER=cf-connecting-ip` in `.env`: Cloudflare writes the client's address in `CF-Connecting-IP`, which a proxy of yours behind the tunnel passes on (that proxy's own `X-Real-IP` would name the tunnel instead). Only while nothing but the tunnel (and that proxy) reaches the container's port, as the default `127.0.0.1:8080` keeps it.

## The setup

Open your address in a browser: it opens the first app the server runs (Carnet at `/notes`, Pages at `/pages`, Contacts at `/contacts`, Agenda at `/agenda`, each installable on its own). The setup is done once for the whole server; every device that comes after only connects, and the other app's web app in the same browser asks nothing.

1. **Connexion** (Connection): the address is already filled in (the server serves this page), type the token. The language switch sits at the top right.
2. **Vos applications** (Your apps): tick the apps your server runs, Carnet, Pages, Contacts and Agenda by default. Nothing is lost by leaving one out: turn it on later in Administration.
3. **Votre serveur** (Your server): what the server can do on top, for every app you ticked, each row optional and opened on its own; each field says where its value comes from ([the table above](#before-you-start)):
   1. **Retrouver vos données** (Restore), first, only when this server holds nothing yet: the newest backup from S3 (add S3 first, from its row), or an archive kept elsewhere.
   2. **Claude**: the API key, the model and a monthly budget, shared by every app; and, off until you turn them on, the questions about pages (whether a question may read all pages, whether it may search the web, and how much one question may read).
   3. **Sauvegarde sur S3**: service address, region, bucket, an optional folder (`unlease` by default) and the key, then a storage class ([below](#the-storage-class-of-s3-backups)). Daily by default; « Garder les sauvegardes, en jours » is a number of days (30 by default): the server deletes its own snapshots older than that, and always keeps its newest one.
   4. **Fichiers sur Seafile**: the address, the library token and a folder (`/Unlease` by default). Photos and files then live there, each app's under its own folder (`Unlease/Carnet/Notes/<note>/…`, `Unlease/Pages/<page>/…`), named after what holds them, and the server keeps only small previews.
   5. **Films et séries avec Seerr** (with Carnet only): the address and, optionally, the API key. With the key, the films and series modules open the title's own page and say whether it is already there; without it, they open Seerr's search.
   6. **Jours fériés** (with Agenda only): a country, and a region if it has days of its own. The server fetches last year's, this year's and the next two years' days and shows them in every device's calendar, as a calendar of its own you can hide.
4. **Apparence** (Appearance): this device's colours and background, kept as they come with « Garder l’apparence d’origine ».

« Commencer » (Start) opens your first app and marks the server set up. Everything here can be changed later in Administration.

## The phones

Each app has its own APK in every release (`carnet-vX.Y.Z.apk`, `pages-vX.Y.Z.apk`, `contacts-vX.Y.Z.apk`, `agenda-vX.Y.Z.apk`): install those of the apps your server runs. The first one asks for the address and the token (the server is already set up, so it goes on to its colours); the next one finds the first one's connection and colours on the phone and offers them in one tap. They share it only with the suite's own apps (an Android permission granted to apps signed with the same key), so take them all from the same release.

An app whose server does not run it says so and offers to turn it on.

## Turning apps on and off

Administration, « Applications »: a switch per app, on the web or in any phone app. An app turned off says so in its web app and its phone app (with a button to turn it on again), and its work on the server stops (Carnet stops reading links); its records stay on the server, in every backup, and come back as they were when it is turned on again. At least one app stays on.

## Agenda and the outside world

Agenda's server does a few things on its own, all optional:

- **Subscribed calendars**: each address you subscribe to (Google's « Adresse secrète au format iCal », a Nextcloud or Proton calendar's link, a sports team's fixtures) is read by the server when you add it, then every 6 hours, and kept as events every device has offline. The server reads public addresses only (its guard refuses your LAN, as it does for links), up to 10 MB a calendar; Google's address works as it is.
- **Public holidays** come from Nager.Date ([above](#before-you-start)), once when the country is set and once a year after.
- **The weather** of a day with a placed event comes from [Open-Meteo](https://open-meteo.com) (no account, no key), asked by the server, 16 days ahead at most.
- **Places as you type** (an event's place, a contact's address) come from [Photon](https://photon.komoot.io), komoot's geocoder on OpenStreetMap's data (no account, no key), asked by the server with what you typed and nothing else, each answer kept a day. `UNLEASE_PLACES_URL` points it at your own Photon, or `off` turns it off: the apps then offer only the places they already know (your contacts' addresses, the places of your events).
- **Your calendar, published**: Administration, Agenda, « Publication » gives a secret address, `https://unlease.example.org/ical/<secret>.ics`, that Google Calendar (« Autres agendas », « À partir de l'URL »), Apple Calendar or Thunderbird can subscribe to. It is read-only and holds your own events (not your subscriptions, nor what is in the bin); in a description, a mention reads as the contact's name or, for one of these events, its title, and any other (a note, a link, a page) as « … », so the address tells nothing of your other apps. « Nouvelle adresse » makes a new one and the old one stops working. It is the one address the server answers without the token: if your proxy only lets `/api` and the apps through, let `/ical/` through too.
- **Reminders in a browser** are Web Push notifications: the browser asks your permission, then your server sends each reminder through the browser's push service (Google's for Chrome, Mozilla's for Firefox, Apple's for Safari), encrypted so that service cannot read it, on the minute. It needs HTTPS, and the server's clock set right (NTP; Docker uses the host's). On Android, the APK rings its reminders itself, offline, on the minute; it checks the server for new ones every hour with the app closed. If they come late on a phone, its Réglages show « Notifications à l'heure » with what to change (a battery set to « Restreinte », a maker's battery saver).

## Your colours in Seafile, Seerr and Immich

The apps can give the services beside them the colours and background chosen on a device: a stylesheet made from them, by day and at night where the service has both. In Réglages, under the background's choices (and in the first run's appearance step), « Habiller vos autres services… » ("Style your other services…") shows the three, each with its copy button. Copy it again after changing the colours.

- **Seafile** (13 and 14): System Admin, Settings, Branding. Paste it in "Custom CSS" and save it with the tick button beside the box (leaving the box without it drops the paste), then tick "Use custom CSS". Reload the page. Under its stylesheet come three pictures in the same colours, each uploaded in that same Branding section with its "Change" button: « Logo » (a folder drawn like Carnet's mark, on its pebble in your primary colour, square; Seafile shows it 32 pixels high in its header and 40 on its login page, and stretches it only in that settings page's preview), « Favicon » (an ICO at 16, 32 and 48 pixels) and « Fond de connexion » for "Login background image" (2400 × 1600, your background as it is by day, since Seafile shows its login page light to anyone signed out). Make them again after changing the colours.
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
| `UNLEASE_TOKEN` | required | The bearer token every device sends: 32 random characters at least (`openssl rand -hex 32`); a shorter one is warned about at start. |
| `TZ` | `UTC` | The time zone photos are named in, in the drive and in backups (`2026-10-26 14.03.12.jpg`). |
| `UNLEASE_VERSION` | the release's own | (Compose only) the image tag to run: a release such as `0.2.0` ([UPGRADING.md](UPGRADING.md)). |
| `UNLEASE_CORS_ORIGINS` | none | Only for web apps hosted on another origin (below). |
| `UNLEASE_TRUSTED_PROXY_HEADER` | none: the connection's address | Behind a reverse proxy, the header it sets to the client's address, for the brake on wrong tokens: `cf-connecting-ip`, `x-real-ip` or `x-forwarded-for` ([above](#the-clients-address)). |
| `UNLEASE_CLAUDE_EFFORT` | `low` | How hard Claude thinks per link: `low`, `medium`, `high`, `xhigh`, `max`. |
| `UNLEASE_ANALYSIS_CONCURRENCY` | `2` | Links read at once (1 to 16). |
| `UNLEASE_PLACES_URL` | `https://photon.komoot.io` | Where the places offered as you type an event's place or a contact's address are found: a [Photon](https://github.com/komoot/photon) server (komoot's public one, or your own, even on your LAN), or `off`. |
| `ANTHROPIC_API_KEY`, `UNLEASE_CLAUDE_MODEL`, `UNLEASE_MONTHLY_BUDGET_USD` | none, `claude-opus-5-5`, `15` | Fallbacks while the apps have set nothing. |
| `UNLEASE_DATA_DIR`, `UNLEASE_WEB_DIR`, `PORT` | `/data`, `/app/web`, `8080` | Set by the image; change them only when running the server outside it. |

`server/README.md` documents the API and every route.

## Your data

Everything lives in the `/data` volume:

- `unlease.sqlite`: every app's records (Carnet's notes and links, Pages' pages), whether they are on or not, and every setting (the Claude key, the S3 secret, the Seafile token and the Seerr key included: protect the volume).
- `blobs/`: photos, page files and the pictures kept from links (originals move to Seafile when the drive is set).
- `backups/`: a consistent copy of the database each day, the last few kept.

### The storage class of S3 backups

What the server sends to S3 can go in a cheaper storage class, chosen in the same place as the bucket (the first run's « Sauvegarde sur S3 » or Administration). The apps offer what your provider has, read from the service address: on Scaleway Standard, « Accès rare, une zone » (One Zone - IA) and Glacier; on AWS Standard, Standard-IA, Glacier Instant Retrieval, Glacier and Deep Archive; on any other store Standard and Glacier. Whatever you pick is tried on the bucket (a small file sent in it, then deleted) before it is kept, so a class your store refuses says so at once. A new class applies to what is sent from then on: what is already on S3 keeps its own.

Glacier and Deep Archive cost the least to keep, but S3 must bring a file out of them before anyone can read it, which takes hours (up to 48 for Deep Archive). Restoring such a backup asks S3 to bring out the snapshot and every cold file at once, and says so: run the same restore again a few hours later (each file stays readable 7 days). A download of a cold snapshot works the same way. Some providers bill a minimum storage period for their cold classes (90 days for Glacier on AWS, for example), and deleting earlier still costs that period: set « Sauvegardes gardées » at least that long, or the daily pruning pays for days nobody keeps.

Back up `backups/` and `blobs/`, never the live `unlease.sqlite` (a copy taken while it is written may not open), or let the server's own S3 backup do it: a readable archive each time (`unlease.json`, plus each app's Markdown under its folder: Carnet's notes and collections, Pages' pages) and each file once. Any backup restores from Administration, from S3 or from a downloaded archive, merged into what is there or rolled back to it.

## Upgrading

Set `UNLEASE_VERSION` in `.env` to the new release, then `docker compose pull && docker compose up -d`, the server before the apps (a newer app may send fields an older server would drop). [UPGRADING.md](UPGRADING.md) has the steps, the version tags (`0.2.0`, `0.2`, `latest`, `edge`) and how to go back.

## Hosting the web apps elsewhere

The web apps are plain static files. To serve them from a static host (Cloudflare Pages, Netlify, an nginx of your own), build them from the repository's root (`npm ci && npm run build -w web`, output `web/dist`: `notes/`, `pages/`), make the host answer an unknown path under `/notes/` with `notes/index.html` (the same for `/pages/`) and send `/` to `/notes`, send the headers in `web/dist/_headers` (`web/dist/_redirects` does the rest on Cloudflare Pages), and allow that origin on the server: `UNLEASE_CORS_ORIGINS=https://apps.example.org`. The setup's first screen then asks for the server's address.

## Without a public address

On a LAN only, the web apps work over plain HTTP from a browser on that LAN (without its offline copy), but the Android apps need HTTPS. A private mesh with certificates (Tailscale's HTTPS, a VPN to your home with a reverse proxy and a certificate for a name it resolves) works the same as a public address.

The Android apps trust only the certificate authorities Android ships with, not one you made yourself: give the server a certificate from a public authority for a name you own (Let's Encrypt's DNS challenge issues one for a name that only your LAN resolves), or use Tailscale's.

Away from home with the VPN off, every app keeps working on what it holds: what you write waits on the device, and nothing is dropped however long the server stays out of reach. The sync dot turns amber and says how many changes wait, that they are safe on this device, and when the last sync got through. Then:

- **On Android**, each app sends what waits even while it is closed: soon after you leave it, again with a growing wait until the server takes it, every 15 minutes while a network is there, and a few seconds after any network comes up, your VPN included. Photos and files go up the same way. A battery set to « Restreinte » (the app's page in Android's settings, **Battery**), Data Saver on mobile data, a maker's battery saver or a force stop holds that back until you open the app again. Each app tells you when it is held back: a message when you open it (once a day), and « Synchronisation en arrière-plan » in its Réglages and in Administration › Serveur, whose rows open the right page of Android's settings and say what to choose (« Optimisée » or « Sans restriction » for the battery; unrestricted data usage for Data Saver).
- **In a browser**, an app sends what waits while it is open, and from a hidden tab every minute and when the network comes back; a closed tab keeps it (the browser is asked to keep the apps' storage for good) and sends it the next time you open the app.

## Without internet access

The server needs nothing from the internet to run: no account, no licence check; it reaches out only for the features listed below. Bring the image in from a machine that has internet, the same release as the two files:

```bash
# On a machine with internet
docker pull ghcr.io/stephenprn/unlease:0.2.0
docker save ghcr.io/stephenprn/unlease:0.2.0 -o unlease-0.2.0.tar
curl -fsSLO https://github.com/stephenprn/unlease/releases/download/v0.2.0/docker-compose.yml
curl -fsSL -o example.env https://github.com/stephenprn/unlease/releases/download/v0.2.0/example.env

# On the server, with the three files copied over
docker load -i unlease-0.2.0.tar
cp example.env .env    # then set UNLEASE_TOKEN as in Run it
docker compose up -d
```

The APKs come from the same release page, copied to the phones (a USB cable, a shared folder) and opened there.

Everything you write, sync, search, back up to an S3 or a Seafile on your network, and restore works without internet. What reads the outside does not work without it: Claude (reading links, answering questions), a link's page and pictures, Agenda's subscribed calendars, public holidays and weather, and the places offered as you type an address (point `UNLEASE_PLACES_URL` at your own Photon, or turn it off). The certificate for the Android apps is the one part to fetch from outside ([above](#without-a-public-address)); browsers on the LAN need none.
