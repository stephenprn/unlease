# syntax=docker/dockerfile:1
#
# Unlease in one image: the server (sync, files, backups, and each app's own part: Carnet's, Pages', Contacts', Agenda's)
# and the web apps it serves on the same port (each app's own, under its path: /notes, /pages, /contacts, /agenda). One image for every app, as the apps share one
# process, one database and one sync: an app is turned on or off from the setup or the
# Administration, never by running another container. From the repository root:
#   docker build -t unlease .
# Published as ghcr.io/stephenprn/unlease by .github/workflows/image.yml.

# The server and the web apps share one npm workspace (the root lockfile); only their own
# dependencies are installed, never the phone apps'.
FROM node:24-alpine AS deps
WORKDIR /repo
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci -w server -w web --no-audit --no-fund

# The server bundled with the shared packages into dist/server.mjs, and each web app built into static files (web/dist/<app>).
FROM deps AS build
# The shared packages compile under the root tsconfig, as in a checkout.
COPY tsconfig.json ./
COPY packages packages
COPY server server
COPY web web
RUN npm run build -w server
RUN cd web && node scripts/build.mjs

# Runtime dependencies: only sharp (a native addon) is not bundled.
FROM node:24-alpine AS runtime-deps
WORKDIR /repo
COPY package.json package-lock.json ./
COPY server/package.json server/
RUN npm ci -w server --omit=dev --no-audit --no-fund && rm -rf node_modules/@unlease && npm cache clean --force

FROM node:24-alpine
LABEL org.opencontainers.image.title="Unlease" \
      org.opencontainers.image.description="Stop leasing your data to Google: your own suite of apps on your own server: Carnet (notes, lists, links that read themselves), Pages (a wiki), Contacts (an address book) and Agenda (a calendar)" \
      org.opencontainers.image.source="https://github.com/stephenprn/unlease" \
      org.opencontainers.image.licenses="MIT"
ENV NODE_ENV=production \
    UNLEASE_DATA_DIR=/data \
    UNLEASE_WEB_DIR=/app/web \
    PORT=8080
WORKDIR /app
COPY --from=runtime-deps /repo/node_modules ./node_modules
COPY --from=build /repo/server/dist ./dist
COPY --from=build /repo/web/dist ./web
# The `node` user (uid 1000) owns the data volume; a new named volume inherits this ownership.
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 8080) + '/api/health').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
# node:sqlite still prints an ExperimentalWarning on Node 24; it is stable enough for this use.
CMD ["node", "--enable-source-maps", "--disable-warning=ExperimentalWarning", "dist/server.mjs"]
