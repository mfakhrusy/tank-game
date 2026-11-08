# Native production deployment

Run the Rust backend directly under systemd on a Linux VPS. Docker remains available for local full-stack development. The backend needs no Node.js or Docker at runtime and keeps rooms in memory; restarting it disconnects players and clears rooms. Client-side saved builds stay in each player's browser.

## Build the backend

From the repository root, with Rust/Cargo and a C linker installed:

```sh
sh scripts/build-server.sh
```

This builds only the server, in release mode, with one build job. With 1 GB RAM and 500 MB swap, compilation may still run out of memory. Prefer building on a larger Linux machine with the same CPU architecture, then copying the executable to the VPS. Use the same Linux distribution/version, or an older compatible glibc version on the build host. A macOS executable cannot run on Linux.

On a Debian/Ubuntu build host, install the C toolchain with `sudo apt-get install build-essential pkg-config`. Install current stable Rust using <https://rustup.rs/> if Cargo is missing. Check `uname -m` on both machines before copying a native build.

From that Linux build host:

```sh
scp backend/target/release/contraption-room-server USER@SERVER:/tmp/contraption-room-server
```

## Install the service

On the VPS, from the cloned repository root:

```sh
# If built directly on the VPS:
sudo sh scripts/install-server.sh

# Alternatively, if copied from another Linux build host:
sudo sh scripts/install-server.sh /tmp/contraption-room-server
```

The service runs as an unprivileged dynamic user, starts on boot, restarts after failures, and listens only on `127.0.0.1:8787`. No root login is needed for the running server.

```sh
curl --fail http://127.0.0.1:8787/api/health
sudo systemctl status tank-game.service
sudo journalctl -u tank-game.service -f
```

To change settings, use `sudo systemctl edit tank-game.service`, for example:

```ini
[Service]
Environment=RUST_LOG=contraption_room_server=debug,tower_http=info
```

Then `sudo systemctl restart tank-game.service`. The installer replaces the base unit, while systemd overrides survive upgrades.

## Serve the game with HTTPS

Production frontend builds use the HTTPS backend origin in `.env.production` (`VITE_MULTIPLAYER_ORIGIN`), so the frontend can stay on Cloudflare while this VPS runs only the Rust service. For example, a Caddy site block for `tank-game-server.fahru.me` can simply contain `reverse_proxy 127.0.0.1:8787`. The service supports cross-origin frontend requests.

Alternatively, to serve the frontend and backend under one VPS hostname, clear `VITE_MULTIPLAYER_ORIGIN` for that build and follow these steps:

1. Build the frontend on your own computer (Node.js 24+):

   ```sh
   npm ci
   npm run build
   ```

2. Create the static directory on the VPS:

   ```sh
   sudo install -d -m 755 /var/www/tank-game
   ```

3. Copy `dist/` from your computer to the VPS (use an SSH account with permission to write that directory, or upload to a temporary directory and copy with sudo):

   ```sh
   tar -czf /tmp/tank-game-client.tar.gz -C dist .
   scp /tmp/tank-game-client.tar.gz USER@SERVER:/tmp/tank-game-client.tar.gz
   ```

   On the VPS:

   ```sh
   sudo tar -xzf /tmp/tank-game-client.tar.gz -C /var/www/tank-game
   sudo chmod -R a+rX /var/www/tank-game
   ```

4. Install Caddy following <https://caddyserver.com/docs/install>. Replace `game.example.com` in `deploy/Caddyfile.native.example` with a hostname pointing to this VPS. Merge the site block into `/etc/caddy/Caddyfile`. Keep any existing sites. If the hostname currently serves Cloudflare Workers, change its routing to the VPS before using it here.

5. Allow ports 80 and 443 in the VPS/cloud firewall, then validate and reload:

   ```sh
   sudo caddy validate --config /etc/caddy/Caddyfile
   sudo systemctl reload caddy
   ```

   Caddy handles HTTPS and WebSocket proxying. Keep port 8787 private.

6. Open `https://YOUR_HOSTNAME` and test creating/joining a multiplayer room. Check `https://YOUR_HOSTNAME/api/health` if it cannot connect.

If keeping the game on Cloudflare, set `VITE_MULTIPLAYER_ORIGIN` to the public HTTPS VPS hostname before building/deploying the frontend. Both room creation and WSS use that origin. Configure DNS and Caddy for the backend hostname; the service installer does not change DNS or Cloudflare settings.

## Updates

Rebuild or upload the new binary, then rerun the installer. Installation restarts the service, so active rooms are cleared. For frontend updates, rebuild and copy `dist/` again.

```sh
git pull origin main
sh scripts/build-server.sh
sudo sh scripts/install-server.sh
```

No dependencies are downloaded at server startup. Monitor actual runtime use with `systemctl status tank-game.service` and `free -h`; memory and player capacity depend on concurrent rooms.
