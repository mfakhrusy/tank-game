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

### Request and database rate limits

The Cloudflare sharing Worker checks a native rate limiter before every API call
and before every application D1 read or write. The limiter counters do not use D1.
HTTP 429 responses include `Retry-After: 60`; saved-build backfills pause and resume
without losing local saves.

| Operation                         | Limit                                                       |
| --------------------------------- | ----------------------------------------------------------- |
| Sharing API                       | 120 requests/minute per IP                                  |
| Publish saved builds              | 30 requests/minute per IP                                   |
| D1 read queries                   | 1,200/minute across sharing traffic per Cloudflare location |
| D1 write queries                  | 10/minute across sharing traffic per Cloudflare location    |
| Queries per sharing request       | At most 7                                                   |
| Multiplayer HTTP                  | 120/minute per client, 600/minute server-wide               |
| Create multiplayer rooms          | 10/minute per client, 30/minute server-wide                 |
| WebSocket upgrades                | 20/minute per client                                        |
| Messages on an established socket | 30/second, burst 60                                         |
| Bytes on an established socket    | 64 KiB/second, burst 128 KiB                                |
| Stat upgrade messages             | 5/second, burst 10                                          |

Cloudflare's native rate limits are approximate and local to each Cloudflare
location, not a strict worldwide daily spending cap. Cloudflare Free plan quotas
still apply independently. Multiplayer uses in-memory token buckets with bounded
storage; these reset on server restart. Forwarded client addresses are trusted only
from a loopback reverse proxy, and client-supplied address prefixes are ignored.

### Formatting and linting

Oxfmt formats the frontend, sharing Worker, tests, styles, and project configuration.
Oxlint checks JavaScript/TypeScript correctness with React and TypeScript rules.
Generated Worker types, dependency lockfiles, build output, and local Wrangler
state are excluded. Rust uses its native formatter and Clippy.

```bash
npm run format        # Format supported files with Oxfmt, then Rust with rustfmt
npm run format:check  # Check formatting without changing files
npm run lint          # Run Oxlint; warnings fail the check
npm run lint:fix      # Apply safe Oxlint fixes
npm run check         # Formatting, lint, tests, Rust checks, build, and browser tests
```

The existing GitHub Actions quality gate runs `npm run check`, so formatting and
lint checks are required on pushes and pull requests too.
