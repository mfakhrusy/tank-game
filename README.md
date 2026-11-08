# Snap Contraption Lab

A kid-friendly 2D contraption builder and action yard. Build unconventional vehicles by snapping shooters, movers, shields, boosters, spikes, and other parts onto two attachment layers, then test them in a solo or shared multiplayer world.

## Local development

Requirements: Node.js 24+, Rust, and Chromium for Playwright. Docker is optional for full-stack local development.

```sh
npm ci
npx playwright install chromium
npm run dev
```

The Vite client runs at `http://127.0.0.1:5173` by default. Multiplayer also requires the Rust backend:

```sh
cargo run --manifest-path backend/Cargo.toml
```

For the production-like full stack:

```sh
docker compose up --build --wait
```

Open `http://127.0.0.1:8080`.

## Quality gate

Run the complete local test matrix with:

```sh
npm run check
```

This runs frontend unit tests, Rust tests, strict Clippy, the production build, and Playwright browser tests. GitHub Actions also builds both Docker images and runs a production-dependency audit.

To smoke-test a deployed URL without starting local servers:

```sh
PLAYWRIGHT_BASE_URL=https://example.workers.dev npx playwright test tests/e2e/deployed.spec.ts
```

## Deployment

The repository includes these deployment paths:

- **Native Linux production (recommended for a small VPS):** build the Rust binary with `sh scripts/build-server.sh`, then install it with `sudo sh scripts/install-server.sh`. See [the native deployment guide](deploy/README.md) for systemd, HTTPS, and building off-server.

- `npm run deploy:cloudflare` deploys the built SPA to Cloudflare Workers Static Assets.
- `docker compose up --build -d` deploys the complete client plus Rust WebSocket backend to a Docker host such as a VPS.

Cloudflare Static Assets alone provides the full solo game. Public multiplayer additionally requires the Rust backend behind HTTPS/WSS, or a Cloudflare Workers Paid account capable of running the included backend image through Cloudflare Containers.

### Separate production multiplayer server

Production builds use the public backend origin in `.env.production` (`VITE_MULTIPLAYER_ORIGIN`). Room creation uses HTTPS and multiplayer uses WSS on that same backend. Local development leaves this unset and uses the Vite proxy. The origin is public configuration, not a secret; changing it requires rebuilding the frontend.

### Share saved builds across computers

The frontend Worker stores immutable build snapshots in Cloudflare D1. Each saved
build automatically receives a three-word ID. Enter the ID in **My builds → Load a
build by ID** on another computer to load and save a local copy. Anyone with the ID
can load it. Editing a saved build creates a new ID; old IDs remain valid.
Existing browser saves are published automatically when the workshop opens.

The production frontend configuration is `wrangler.frontend.jsonc` (the original
`wrangler.jsonc` is retained for custom-domain configuration). To deploy sharing:

```bash
npx wrangler d1 migrations apply BUILD_DB --remote --config wrangler.frontend.jsonc
npm run deploy:cloudflare
```

Local development needs the Worker as well as Vite. Build once, then run the
sharing service in a second terminal; it applies local database migrations:

```bash
npm run build
npm run dev:sharing
# In another terminal:
npm run dev
```

Vite forwards `/api/builds` to the local sharing Worker on port 8788. Multiplayer
continues to use the Rust server on port 8787. Shared builds do not use Linode and
survive Worker deployments independently of active multiplayer rooms.
