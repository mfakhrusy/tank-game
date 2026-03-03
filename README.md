# Tank Game

A customizable 2D tank game built with Rust + raylib, inspired by arras.io. Instead of preset tank classes, players build their own tanks from modular parts in a workshop.

## Prerequisites

- Rust stable (via [rustup](https://rustup.rs/))
- Build essentials: `gcc`, `cmake`, `pkg-config`
- X11 dev libraries: `libx11-dev`, `libxrandr-dev`, `libxinerama-dev`, `libxcursor-dev`, `libxi-dev`, `libgl-dev`
- `libclang-dev` (for raylib bindgen)

On Ubuntu/Debian:

```bash
sudo apt install build-essential cmake pkg-config libclang-dev \
  libx11-dev libxrandr-dev libxinerama-dev libxcursor-dev libxi-dev libgl-dev
```

> **Note:** If `libclang-dev` isn't available, the project includes a `.cargo/config.toml` that points to an alternative libclang path. You may need to adjust `LIBCLANG_PATH` for your system.

## Getting Started

```bash
cargo run
```

## Controls

| Key | Action |
|---|---|
| WASD | Move tank |
| Mouse | Aim turret |
| Left Click | Shoot |
| 1-4 | Switch body (Scout / Standard / Heavy / Fortress) |
| 5 | Cycle barrel type |
| 6 | Cycle engine |

## Project Structure

```
src/
  main.rs                      # Game loop, rendering, input
  data/
    model.rs                   # Part structs (Body, Engine, Barrel, Module)
    loader.rs                  # JSON asset loader
  game/
    entities/tank.rs           # Tank entity (build → stats → runtime state)
    systems/stat_composer.rs   # Pure stat composition function
assets/
  parts/                       # JSON part catalogs
    bodies.json
    engines.json
    barrels.json
    modules.json
  builds/                      # Saved tank builds
    default.json
docs/                          # Design documents
```

## Design Docs

See [docs/README.md](docs/README.md) for the full design documentation covering the customization system, arras.io visual style reference, and implementation plans.
