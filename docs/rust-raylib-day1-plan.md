## Rust + raylib Day-1 Plan (Fastest Path to Playable)

This is a concrete bootstrap guide for Rust + raylib.

### 1) Why this path

- Fully free stack
- Rust-first (no JS/TS required)
- Fast to prototype tank movement/combat

### 2) Tooling setup

Use:
- Rust stable (via `rustup`)
- Build essentials (`gcc`, `cmake`, `pkg-config`)
- `raylib` crate (with `bundled` feature if needed)

Suggested commands:

```bash
cargo new tank-workshop
cd tank-workshop
cargo add raylib --features bundled
cargo add serde --features derive
cargo add serde_json anyhow
cargo run
```

If your distro already has raylib dev libraries configured, you can omit `--features bundled`.

### 3) Minimal folder structure

```text
assets/
  parts/
    chassis.json
    weapons.json
    modules.json
src/
  main.rs
  game/
    mod.rs
    scenes/
      workshop.rs
      battle.rs
    entities/
      tank.rs
    systems/
      stat_composer.rs
  data/
    model.rs
    loader.rs
```

Optional scale-up (later):

```text
crates/
  game-core/
  game-client/
  game-server/
```

### 4) Day-1 target scope

Build only this:
- A rectangle tank body that moves and rotates
- Turret follows mouse
- Left click shoots bullets
- Keyboard shortcuts to swap body (`1`/`2`), engine (`3`/`4`), and cycle barrel types on existing placements (`5`/`6`)
- Recompute stats when selection changes

> Barrel placement (drag-to-snap on circle at 15° increments) is a day-2 feature; day-1 uses a default front barrel.

Skip polished UI on day 1. Keep it text/debug overlay.

### 5) Data format suggestion

`assets/parts/chassis.json`

```json
[
  {
    "id": "light_chassis",
    "hp": 80,
    "mass": 10.0,
    "base_speed": 180.0,
    "turn_rate": 0.08
  },
  {
    "id": "heavy_chassis",
    "hp": 140,
    "mass": 22.0,
    "base_speed": 120.0,
    "turn_rate": 0.05
  }
]
```

`assets/parts/weapons.json` (renamed to `barrels.json` in the full system; see `docs/customization-system.md` for the complete barrel schema)

```json
[
  {
    "id": "autocannon",
    "damage": 8,
    "reload_ms": 160,
    "heat_per_shot": 2.0,
    "recoil": 0.4
  },
  {
    "id": "slug_launcher",
    "damage": 28,
    "reload_ms": 700,
    "heat_per_shot": 8.0,
    "recoil": 1.1
  }
]
```

`assets/parts/modules.json`

```json
[
  {
    "id": "cooling_loop",
    "heat_multiplier": 0.8,
    "mass": 3.0
  },
  {
    "id": "armor_plating",
    "hp_bonus": 30,
    "speed_multiplier": 0.9,
    "mass": 5.0
  }
]
```

### 6) Rust model + stat composition

Use strongly-typed data and one pure function:

```rust
#[derive(Clone)]
pub struct FinalStats {
    pub hp: i32,
    pub speed: f32,
    pub reload_ms: u32,
}

pub fn compose(chassis: &Chassis, weapon: &Weapon, module: &Module) -> FinalStats {
    let hp = chassis.hp + module.hp_bonus.unwrap_or(0);
    let speed = chassis.base_speed * module.speed_multiplier.unwrap_or(1.0) - (weapon.recoil * 2.0);
    let reload_ms = (weapon.reload_ms as f32 * module.heat_multiplier.unwrap_or(1.0)) as u32;

    FinalStats { hp, speed, reload_ms }
}
```

Keep this function deterministic and separate from rendering.

> The full composition system supports multiple barrels at arbitrary snap-to-angle positions (15° increments) around the body circle. See `docs/customization-system.md` for the complete version.

### 7) Playtest checklist (with your kid)

- Can he explain why one build feels faster/slower?
- Can he intentionally make a "glass cannon" vs "tanky" build?
- Are differences noticeable in 10 seconds?
- Is workshop fun even with simple visuals?

If yes, your core loop is working.

### 8) Browser deployment path (raylib)

Browser support with raylib is possible, but plan it as phase 2:
- Set up emsdk and verify a tiny raylib sample compiles
- Add Rust target `wasm32-unknown-emscripten`
- Produce static web build and host it

Practical note:
- Build desktop first, keep game logic in pure Rust modules, then port rendering/runtime constraints for web.

### 9) Multiplayer deployment options

- LAN first: direct server on your machine
- Hosted: `game-client` static + Rust websocket server
- Suggested server stack: `tokio` + `axum` + websocket rooms

### 10) What to build on day 2-3

- Save/load build presets in JSON
- Add target dummy + DPS meter
- Add overheat meter and cooldown behavior
- Add a simple 2-player room test

That is enough to validate the full vision quickly.
