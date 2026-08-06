# Snap Contraption Lab

A kid-friendly 2D contraption builder and action yard. Build unconventional vehicles by snapping shooters, movers, shields, boosters, spikes, and other parts onto two attachment layers, then test them in a solo or shared multiplayer world.

## Local development

Requirements: Node.js 24+, Rust, Chromium for Playwright, and Docker.

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

The repository includes two deployment paths:

- `npm run deploy:cloudflare` deploys the built SPA to Cloudflare Workers Static Assets.
- `docker compose up --build -d` deploys the complete client plus Rust WebSocket backend to a Docker host such as a VPS.

Cloudflare Static Assets alone provides the full solo game. Public multiplayer additionally requires the Rust backend behind HTTPS/WSS, or a Cloudflare Workers Paid account capable of running the included backend image through Cloudflare Containers.
