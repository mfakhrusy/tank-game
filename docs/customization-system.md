## Tank Customization System — Detailed Design

This doc covers everything needed to implement the workshop + tank builder.
Game loop, arena, scoring, and progression are out of scope here.

---

### 1) Slot Architecture

A tank is composed of exactly these slots:

```
Tank {
    body:     Body,           // 1 required
    engine:   Engine,         // 1 required
    barrels:  Vec<BarrelSlot>, // 1..N (max count set by body, placed at any 15° increment)
    modules:  Vec<Module>,    // 0..N (max set by body)
}
```

The **body** determines how many barrel and module slots are available.
All other slots are filled by the player in the workshop.

---

### 2) Part Definitions

#### 2a) Body

Controls tank size, HP, and available slots.

| Field | Type | Description |
|---|---|---|
| id | string | Unique key |
| name | string | Display name |
| radius | f32 | Circle radius in pixels (hitbox) |
| hp | i32 | Base hit points |
| body_damage | f32 | Contact damage multiplier (ramming) |
| max_barrels | u8 | Max barrels attachable (placed at any 15° increment) |
| module_slots | u8 | Max modules attachable |
| mass | f32 | Base mass (affects acceleration) |

Parts:

| id | name | radius | hp | body_damage | max_barrels | module_slots | mass |
|---|---|---|---|---|---|---|---|
| scout | Scout Hull | 20 | 60 | 0.5 | 2 | 1 | 8 |
| standard | Standard Hull | 28 | 100 | 1.0 | 3 | 2 | 15 |
| heavy | Heavy Hull | 36 | 160 | 1.5 | 4 | 2 | 25 |
| fortress | Fortress Hull | 44 | 220 | 2.0 | 4 | 3 | 40 |

#### 2b) Engine

Controls speed and acceleration.

| Field | Type | Description |
|---|---|---|
| id | string | Unique key |
| name | string | Display name |
| max_speed | f32 | Top speed (px/sec) |
| acceleration | f32 | How fast you reach max speed |
| mass | f32 | Added mass |

Parts:

| id | name | max_speed | acceleration | mass |
|---|---|---|---|---|
| stock | Stock Motor | 150 | 0.8 | 5 |
| turbo | Turbo Engine | 200 | 1.2 | 8 |
| diesel | Heavy Diesel | 120 | 0.5 | 4 |

#### 2c) Barrel

Barrels are the most interesting part. Each barrel has **stats** and a **placement** on the body.

**Barrel stats (from part data):**

| Field | Type | Description |
|---|---|---|
| id | string | Unique key |
| name | string | Display name |
| width | f32 | Visual width in pixels |
| length | f32 | Visual length in pixels |
| damage | f32 | Per-bullet damage |
| reload_ms | u32 | Time between shots |
| bullet_speed | f32 | Projectile speed (px/sec) |
| bullet_lifetime_ms | u32 | How long bullet lives |
| bullet_count | u8 | Bullets per shot (1 for most, 6 for shotgun) |
| spread | f32 | Random angle spread (radians, 0 = perfectly accurate) |
| recoil | f32 | Pushback force on tank when firing |
| mass | f32 | Added mass |

Parts:

| id | name | w | l | dmg | reload | bspd | life | count | spread | recoil | mass |
|---|---|---|---|---|---|---|---|---|---|---|---|
| peashooter | Peashooter | 10 | 24 | 5 | 200 | 400 | 1500 | 1 | 0.0 | 0.2 | 2 |
| cannon | Cannon | 14 | 28 | 15 | 500 | 350 | 2000 | 1 | 0.02 | 0.6 | 4 |
| sniper | Sniper Barrel | 8 | 40 | 20 | 800 | 600 | 3000 | 1 | 0.0 | 0.3 | 3 |
| shotgun | Shotgun | 18 | 20 | 3 | 700 | 300 | 800 | 6 | 0.15 | 1.0 | 5 |
| minigun | Minigun | 10 | 26 | 3 | 80 | 380 | 1200 | 1 | 0.06 | 0.1 | 5 |
| trapper | Trapper | 16 | 22 | 0 | 400 | 200 | 5000 | 1 | 0.0 | 0.1 | 3 |
| drone_spawner | Drone Spawner | 16 | 18 | 8 | 1500 | 0 | — | 1 | 0.0 | 0.0 | 6 |

**Barrel placement (chosen by player in workshop):**

| Field | Type | Description |
|---|---|---|
| angle | f32 | Placement angle on the body circle (snaps to 15° increments, 0°–345°). 0° = front/up, 90° = right, 180° = rear, 270° = left. |
| facing | f32 | Direction the barrel points, relative to outward normal. 0 = points outward (default). Allows slight angling. |

To create symmetric layouts (e.g., twin barrels), simply place two barrels at symmetric angles (e.g., 345° and 15°).

Placement presets for convenience (15° snap positions):
```
Front:          angle = 0°
Front-Right:    angle = 15°, 30°, 45°
Right:          angle = 90°
Rear-Right:     angle = 135°, 150°
Rear:           angle = 180°
Rear-Left:      angle = 210°, 225°
Left:           angle = 270°
Front-Left:     angle = 315°, 330°, 345°
```

The player drags a barrel around the body circle edge; it snaps to the nearest 15° tick (24 positions total).

#### 2d) Module

Passive effects applied to final stats.

| Field | Type | Description |
|---|---|---|
| id | string | Unique key |
| name | string | Display name |
| effects | Map | Key-value stat modifiers (see stat composition) |
| mass | f32 | Added mass |

Parts:

| id | name | effects | mass |
|---|---|---|---|
| cooling | Cooling Loop | `reload_multiplier: 0.85` | 3 |
| armor | Armor Plating | `hp_bonus: 30, speed_multiplier: 0.9` | 5 |
| shield | Shield Generator | `shield_hp: 20, shield_regen: 1.0` | 6 |
| ammo_feed | Ammo Feeder | `reload_multiplier: 0.85` | 4 |
| booster | Boost Thruster | `speed_multiplier: 1.2` | 3 |
| radar | Radar | `view_range_multiplier: 1.3` | 2 |
| nanites | Repair Nanites | `hp_regen: 2.0` | 5 |
| drone_bay | Drone Bay | `drone_limit_bonus: 2` | 8 |

---

### 3) Stat Composition

One pure function computes final stats from parts. No hidden state.

**Inputs:** body, engine, list of (barrel, placement), list of modules

**Output:**

```rust
pub struct FinalStats {
    // defense
    pub max_hp: i32,
    pub shield_hp: i32,
    pub hp_regen: f32,         // HP per second
    pub shield_regen: f32,     // shield HP per second
    pub body_damage: f32,

    // movement
    pub max_speed: f32,        // px/sec after mass penalty
    pub acceleration: f32,
    pub total_mass: f32,

    // per-barrel stats (computed individually)
    pub barrels: Vec<BarrelFinalStats>,

    // utility
    pub view_range: f32,
    pub drone_limit: u8,
}

pub struct BarrelFinalStats {
    pub damage: f32,
    pub reload_ms: u32,
    pub bullet_speed: f32,
    pub bullet_count: u8,
    pub spread: f32,
    pub recoil: f32,
    // placement
    pub placement_angle: f32,   // 0°–345°, snapped to 15° increments
    pub facing: f32,            // relative to outward normal
    pub width: f32,
    pub length: f32,
}
```

**Composition rules:**

```
total_mass = body.mass + engine.mass + sum(barrel.mass) + sum(module.mass)

max_hp = body.hp
       + sum(module.hp_bonus)

max_speed = engine.max_speed
          * product(module.speed_multiplier)
          * mass_penalty(total_mass)

mass_penalty(m) = clamp(1.0 - (m - 20.0) * 0.005, 0.4, 1.0)
  // 20 mass = no penalty, every 1 mass above 20 costs 0.5% speed
  // floor at 40% speed (never immobile)

acceleration = engine.acceleration * mass_penalty(total_mass)

per barrel:
  reload_ms = barrel.reload_ms * product(module.reload_multiplier)
  damage    = barrel.damage  (no module modifier for now — keep simple)

view_range = 400.0 * product(module.view_range_multiplier)
drone_limit = 4 + sum(module.drone_limit_bonus)
```

Key design choice: **modules use multipliers that stack multiplicatively**.
Two `cooling` modules = `0.85 * 0.85 = 0.72` reload multiplier. This naturally diminishes returns.

---

### 4) Barrel Placement Mechanics

This is the main creative tool for the player.

#### How it works in the workshop

```
              0°
         345° · 15°
     330°  ·  │  ·  30°
   315°·      │      ·45°
  300°·       │       ·60°
 285°·────────○────────·75°
  270°·       │       ·90°
   255°·      │      ·105°
     240°  ·  │  ·  120°
         225° · 135°
             180°

  24 snap positions, every 15°
```

1. Body shows 24 tick marks at 15° intervals around the circle edge
2. Player drags a barrel from the parts list onto the circle edge
3. Barrel snaps to the nearest 15° tick, pointing outward
4. Player can adjust the barrel's `facing` offset (slight angling from outward normal)
5. Player can leave positions empty (fewer barrels = less mass = faster)

This gives enough granularity to recreate any arras.io class layout (e.g., Twin = 345° + 15°, Triplet = 345° + 0° + 15°, Tri-Angle = 0° + 135° + 225°).

#### Aiming behavior

All barrels rotate together, following the mouse cursor.
The barrel's **angle offset** is relative to the aim direction:
- A front barrel (offset 0) points at the mouse
- A rear barrel (offset π) points away from the mouse
- A side barrel (offset π/2) points perpendicular

This means your barrel layout creates a fixed firing pattern that rotates as a unit.

#### Recoil

Each barrel's recoil pushes the tank **opposite** to the barrel's world direction when firing.
Multiple barrels firing at different angles = interesting movement dynamics.
(Tri-angle build uses rear barrels' recoil for forward thrust — same as arras.io)

---

### 5) Constraints & Validation

Rules enforced in the workshop before entering battle:

| Rule | Reason |
|---|---|
| Must have exactly 1 body | Required |
| Must have exactly 1 engine | Required |
| Must have ≥ 1 barrel | Can't fight with 0 barrels |
| Barrels ≤ body.max_barrels | Max barrel count |
| Modules ≤ body.module_slots | Slot limit |
| No two barrels at the same angle | Can't stack two barrels in same position |
| Total mass ≤ 80 | Hard cap to prevent absurd builds |

If invalid, the **Enter Battle** button is grayed out with a reason tooltip.

---

### 6) Workshop UI Layout

```
┌─────────────────────────────────────────────────────────────┐
│  WORKSHOP                                          [BATTLE] │
├───────────────┬──────────────────────┬──────────────────────┤
│  PARTS LIST   │   TANK PREVIEW       │   STATS              │
│               │                      │                      │
│  ▸ Body       │       ███            │   HP    ████████░░   │
│    · Scout    │       ███            │   SPD   ██████░░░░   │
│    · Standard │    ███ ○ ███         │   DPS   ████░░░░░░   │
│    · Heavy    │       ███            │   MASS  ██████░░░░   │
│    · Fortress │       ███            │   RELOAD ███░░░░░░   │
│               │                      │                      │
│  ▸ Engine     │   (rotatable,        │   ──────────────     │
│    · Stock    │    drag barrels to   │   BARRELS:           │
│    · Turbo    │    15° tick marks)   │   Cannon @ 0°        │
│    · Diesel   │                      │   Peashooter @ 180°  │
│               │                      │                      │
│  ▸ Barrels    │                      │                      │
│    · Peashoot │                      │   MODULES:           │
│    · Cannon   │                      │   #0 Cooling Loop    │
│    · Sniper   │                      │   #1 empty           │
│    · ...      │                      │                      │
│               │                      │   ──────────────     │
│  ▸ Modules    │                      │   Mass: 34 / 80      │
│    · Cooling  │                      │   Barrels: 2/3       │
│    · Armor    │                      │   Modules: 1/2       │
│    · ...      │                      │                      │
├───────────────┴──────────────────────┴──────────────────────┤
│  [SAVE BUILD]  [LOAD BUILD]  [CLEAR]                        │
└─────────────────────────────────────────────────────────────┘
```

The tank preview is interactive:
- Shows the tank drawn in arras.io style (circle + barrel rectangles)
- 24 tick marks at 15° intervals shown around the body circle
- Drag a barrel from parts list onto the circle edge; it snaps to nearest tick
- Click attached barrel to remove or replace
- Tank rotates slowly to show all angles

---

### 7) Data Format (JSON files)

`assets/parts/bodies.json`:
```json
[
  { "id": "scout", "name": "Scout Hull", "radius": 20, "hp": 60, "body_damage": 0.5, "max_barrels": 2, "module_slots": 1, "mass": 8 },
  { "id": "standard", "name": "Standard Hull", "radius": 28, "hp": 100, "body_damage": 1.0, "max_barrels": 3, "module_slots": 2, "mass": 15 },
  { "id": "heavy", "name": "Heavy Hull", "radius": 36, "hp": 160, "body_damage": 1.5, "max_barrels": 4, "module_slots": 2, "mass": 25 },
  { "id": "fortress", "name": "Fortress Hull", "radius": 44, "hp": 220, "body_damage": 2.0, "max_barrels": 4, "module_slots": 3, "mass": 40 }
]
```

`assets/parts/engines.json`:
```json
[
  { "id": "stock", "name": "Stock Motor", "max_speed": 150, "acceleration": 0.8, "mass": 5 },
  { "id": "turbo", "name": "Turbo Engine", "max_speed": 200, "acceleration": 1.2, "mass": 8 },
  { "id": "diesel", "name": "Heavy Diesel", "max_speed": 120, "acceleration": 0.5, "mass": 4 }
]
```

`assets/parts/barrels.json`:
```json
[
  { "id": "peashooter", "name": "Peashooter", "width": 10, "length": 24, "damage": 5, "reload_ms": 200, "bullet_speed": 400, "bullet_lifetime_ms": 1500, "bullet_count": 1, "spread": 0.0, "recoil": 0.2, "mass": 2 },
  { "id": "cannon", "name": "Cannon", "width": 14, "length": 28, "damage": 15, "reload_ms": 500, "bullet_speed": 350, "bullet_lifetime_ms": 2000, "bullet_count": 1, "spread": 0.02, "recoil": 0.6, "mass": 4 },
  { "id": "sniper", "name": "Sniper Barrel", "width": 8, "length": 40, "damage": 20, "reload_ms": 800, "bullet_speed": 600, "bullet_lifetime_ms": 3000, "bullet_count": 1, "spread": 0.0, "recoil": 0.3, "mass": 3 },
  { "id": "shotgun", "name": "Shotgun", "width": 18, "length": 20, "damage": 3, "reload_ms": 700, "bullet_speed": 300, "bullet_lifetime_ms": 800, "bullet_count": 6, "spread": 0.15, "recoil": 1.0, "mass": 5 },
  { "id": "minigun", "name": "Minigun", "width": 10, "length": 26, "damage": 3, "reload_ms": 80, "bullet_speed": 380, "bullet_lifetime_ms": 1200, "bullet_count": 1, "spread": 0.06, "recoil": 0.1, "mass": 5 },
  { "id": "trapper", "name": "Trapper", "width": 16, "length": 22, "damage": 0, "reload_ms": 400, "bullet_speed": 200, "bullet_lifetime_ms": 5000, "bullet_count": 1, "spread": 0.0, "recoil": 0.1, "mass": 3 },
  { "id": "drone_spawner", "name": "Drone Spawner", "width": 16, "length": 18, "damage": 8, "reload_ms": 1500, "bullet_speed": 0, "bullet_lifetime_ms": 0, "bullet_count": 1, "spread": 0.0, "recoil": 0.0, "mass": 6 }
]
```

`assets/parts/modules.json`:
```json
[
  { "id": "cooling", "name": "Cooling Loop", "effects": { "reload_multiplier": 0.85 }, "mass": 3 },
  { "id": "armor", "name": "Armor Plating", "effects": { "hp_bonus": 30, "speed_multiplier": 0.9 }, "mass": 5 },
  { "id": "shield", "name": "Shield Generator", "effects": { "shield_hp": 20, "shield_regen": 1.0 }, "mass": 6 },
  { "id": "ammo_feed", "name": "Ammo Feeder", "effects": { "reload_multiplier": 0.85 }, "mass": 4 },
  { "id": "booster", "name": "Boost Thruster", "effects": { "speed_multiplier": 1.2 }, "mass": 3 },
  { "id": "radar", "name": "Radar", "effects": { "view_range_multiplier": 1.3 }, "mass": 2 },
  { "id": "nanites", "name": "Repair Nanites", "effects": { "hp_regen": 2.0 }, "mass": 5 },
  { "id": "drone_bay", "name": "Drone Bay", "effects": { "drone_limit_bonus": 2 }, "mass": 8 }
]
```

---

### 8) Build Presets (save/load format)

`assets/builds/my_tank.json`:
```json
{
  "name": "Glass Cannon",
  "body": "scout",
  "engine": "turbo",
  "barrels": [
    { "part": "sniper", "angle": 0 },
    { "part": "peashooter", "angle": 180 }
  ],
  "modules": [
    { "part": "cooling" }
  ]
}
```

---

### 9) Example Builds (for balance testing)

**Glass Cannon** — fast, fragile, high single-shot damage
- Scout Hull + Turbo Engine + Sniper @ 0° + Peashooter @ 180° + Cooling Loop
- HP: 60, Speed: ~192, Mass: 21

**Bullet Wall** — slow, tanky, constant stream of fire
- Heavy Hull + Stock Motor + 4× Peashooter @ 345°, 0°, 15°, 30° (front spread) + Armor Plating + Ammo Feeder
- HP: 190, Speed: ~94, Mass: 42

**Drone Lord** — let minions do the work
- Heavy Hull + Diesel + 2× Drone Spawner @ 135°, 225° + Drone Bay + Shield Gen
- HP: 160 + 20 shield, Speed: ~72, Mass: 55

**Rammer** — high body damage, charge into enemies
- Fortress Hull + Turbo Engine + Booster + Armor Plating + Armor Plating
- HP: 280, Speed: ~115, Mass: 54, Body Damage: 2.0

**Balanced Fighter** — Standard all-rounder
- Standard Hull + Stock Motor + Cannon @ 0° + Peashooter @ 270° + Cooling Loop
- HP: 100, Speed: ~130, Mass: 29

---

### 10) Implementation Order

1. **Data layer**: Rust structs + JSON deserialization for all part types
2. **Stat composer**: Pure function `compose(body, engine, barrels, modules) → FinalStats`
3. **Tank renderer**: Draw circle body + barrel rectangles in arras.io style
4. **Workshop scene**: Part list on left, tank preview center, stats on right
5. **Barrel placement**: Drag-to-snap barrels onto 15° tick marks around body circle
6. **Validation**: Enforce constraints, gray out battle button if invalid
7. **Save/load**: Serialize build to JSON, load from file
