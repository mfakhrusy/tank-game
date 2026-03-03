## Arras.io-Inspired Design — Customizable Tanks

Reference: `image.png` (drone/overlord class in combat), `image2.png` (upgrade tree + stat UI).

---

### 1) What to keep from arras.io

| Element | Arras.io | Our Game |
|---|---|---|
| Visual style | 2D top-down, geometric shapes, thick outlines, flat colors | Same — circle body + rectangular/trapezoidal barrels |
| Grid background | Light gray graph-paper grid | Same |
| Movement | WASD + mouse aim, smooth acceleration | Same |
| Shooting | Auto-fire or click-to-fire | Click-to-fire (more deliberate) |
| Stat system | 10 sliders you dump points into | **Replaced** — stats come from parts |
| Tank classes | Preset upgrade tree (Basic → Twin → Triplet, etc.) | **Replaced** — build your own from parts |
| Neutral shapes | Squares/triangles/pentagons as "food" for XP | Keep — destroyed for scrap/materials |
| Leaderboard | Top players ranked by score | Keep |
| Minimap | Corner minimap with dots | Keep |

---

### 2) Core difference: workshop replaces upgrade tree

In arras.io, at level 15/30/45 you **pick a preset class** (Twin, Sniper, Overlord, etc.).

In our game, you **build your own class** by combining parts:

```
┌──────────────────────────────────────────┐
│             WORKSHOP SCREEN              │
│                                          │
│  [BODY]     ○ Light Hull    ○ Heavy Hull │
│  [BARRELS]  + Add barrel (max 4)         │
│  [MODULE]   ○ Shield Gen   ○ Drone Bay   │
│  [ENGINE]   ○ Boost Engine ○ Steady Engine│
│                                          │
│  ┌─ LIVE PREVIEW ─┐   ┌─ STAT BARS ──┐  │
│  │   (tank drawn   │   │ HP ████░░░░  │  │
│  │    with current  │   │ SPD ██████░  │  │
│  │    parts)        │   │ DPS ███░░░░  │  │
│  │                  │   │ HEAT ██░░░░  │  │
│  └──────────────────┘   │ MASS ████░░  │  │
│                         └──────────────┘  │
│                                          │
│          [ ENTER BATTLE ]                │
└──────────────────────────────────────────┘
```

---

### 3) Part system (replaces arras.io class tree)

#### 3a) Body (circle size + HP + slots)

| Part | Radius | HP | Max Barrels | Module Slots | Mass |
|---|---|---|---|---|---|
| Scout Hull | 20px | 60 | 2 | 1 | 8 |
| Standard Hull | 28px | 100 | 3 | 2 | 15 |
| Heavy Hull | 36px | 160 | 4 | 2 | 25 |
| Fortress Hull | 44px | 220 | 4 | 3 | 40 |

Bigger body = more HP and slots, but larger hitbox and heavier.

#### 3b) Barrels (attach to body edge, player chooses position + angle)

Each barrel is a rectangle/trapezoid attached to the body circle, just like arras.io.

| Barrel | Width | Length | Damage | Reload (ms) | Bullet Speed | Recoil | Mass |
|---|---|---|---|---|---|---|---|
| Peashooter | 10px | 24px | 5 | 200 | 400 | 0.2 | 2 |
| Cannon | 14px | 28px | 15 | 500 | 350 | 0.6 | 4 |
| Sniper Barrel | 8px | 40px | 20 | 800 | 600 | 0.3 | 3 |
| Shotgun | 18px | 20px | 3×6 | 700 | 300 | 1.0 | 5 |
| Trapper | 16px | 22px | 0 | 400 | 200 | 0.1 | 3 |
| Drone Spawner | 16px | 18px | — | 1500 | — | 0.0 | 6 |

**Barrel placement rules:**
- Player drags barrels onto the body circle, snapping to 15° increments (24 positions). Barrels point outward from their placement angle.
- 0° = front (direction of travel/aim), 90° = right, 180° = rear, 270° = left.
- This recreates arras.io classes organically:
  - 2× Peashooter at 345° and 15° = **Twin** (parallel front)
  - 1× Sniper at 0° = **Sniper**
  - 1× Cannon at 0° + 1× Peashooter at 180° = **Flank Guard**
  - 1× Peashooter at 0° + 2× Peashooter at 150° and 210° = **Tri-Angle**
  - 2× Drone Spawner at 90° and 270° = **Overlord**
  - Mix and match = **your own thing**

#### 3c) Modules (utility slots)

| Module | Effect | Mass |
|---|---|---|
| Cooling Loop | −20% heat buildup | 3 |
| Armor Plating | +30 HP, −10% speed | 5 |
| Shield Generator | Regenerating shield (20 HP) | 6 |
| Drone Bay | +2 passive drones | 8 |
| Ammo Feeder | −15% reload time | 4 |
| Boost Thruster | +20% speed, +5% heat | 3 |
| Radar | See further on minimap | 2 |
| Repair Nanites | +2 HP/sec regen | 5 |

#### 3d) Engine

| Engine | Max Speed | Acceleration | Mass |
|---|---|---|---|
| Stock Motor | 150 | 0.8 | 5 |
| Turbo Engine | 200 | 1.2 | 8 |
| Heavy Diesel | 120 | 0.5 | 4 |

---

### 4) Visual rendering (arras.io style in raylib)

All rendering uses simple raylib draw calls:

```
Body:       draw_circle (fill color + thick outline)
Barrel:     draw_rectangle_pro (gray fill + dark outline, rotated)
Bullets:    draw_circle (smaller, team color)
Drones:     draw_triangle (team color, with concave base)
Shapes:     draw_poly (yellow square, red triangle, blue pentagon)
Grid:       draw_line in a loop (light gray)
Health bar: draw_rectangle (green/red bar below body)
```

Color scheme (matching arras.io):
- Player: `#00B2E1` (cyan)
- Enemy: `#F14E54` (red)
- Neutral shapes: `#FFE869` (yellow square), `#FC7677` (red triangle), `#768DFC` (blue pentagon)
- Body outline: `#555555`
- Barrel fill: `#999999`
- Background: `#CDCDCD`
- Grid lines: `#C1C1C1`

---

### 5) Game flow (arras.io style but with workshop)

```
 ┌─────────┐     ┌───────────┐     ┌──────────┐
 │ WORKSHOP │────▸│   ARENA   │────▸│ RESULTS  │
 │ Build    │     │ Fight +   │     │ Score +  │
 │ your tank│     │ collect   │     │ unlocks  │
 └─────────┘     │ scrap     │     └────┬─────┘
      ▲          └───────────┘          │
      └─────────────────────────────────┘
```

**Arena phase (like arras.io):**
1. Spawn with your custom build
2. Destroy neutral shapes → earn scrap
3. Fight other players/bots
4. No mid-match class changes (unlike arras.io)
5. Match ends on timer or last-standing

**Between matches:**
- Spend scrap to unlock new parts
- Tweak build in workshop
- Save/load blueprints

---

### 6) Progression system (replaces arras.io level-up)

Arras.io: kill shapes → gain XP → level up → pick class + dump stat points.

Our game: kill shapes → gain **scrap** → unlock **parts** → build better tanks.

Unlock tiers:
| Tier | Scrap Cost | Example Unlocks |
|---|---|---|
| Starter | 0 | Scout Hull, Peashooter, Stock Motor |
| Tier 1 | 500 | Standard Hull, Cannon, Cooling Loop |
| Tier 2 | 2000 | Heavy Hull, Sniper Barrel, Shield Gen |
| Tier 3 | 5000 | Fortress Hull, Drone Spawner, Boost Thruster |
| Tier 4 | 12000 | Exotic parts (unique effects) |

---

### 7) How arras.io classes map to custom builds

This shows kids they can recreate familiar builds OR invent new ones:

| Arras.io Class | Custom Build Recipe |
|---|---|
| Basic | Scout Hull + 1× Peashooter at 0° |
| Twin | Scout Hull + 2× Peashooter at 345° and 15° |
| Sniper | Standard Hull + 1× Sniper Barrel at 0° |
| Machine Gun | Standard Hull + 1× Shotgun at 0° |
| Flank Guard | Standard Hull + 1× Cannon at 0° + 1× Peashooter at 180° |
| Tri-Angle | Scout Hull + 1× Peashooter at 0° + 2× Peashooter at 150° and 210° |
| Overlord | Heavy Hull + 2× Drone Spawner at 90° and 270° + Drone Bay module |
| Trapper | Heavy Hull + 2× Trapper at 150° and 210° + Armor Plating |
| **Custom** | **Fortress Hull + Sniper at 0° + 2× Peashooter at 345° and 15° + Shield Gen + Boost** |

---

### 8) Day-1 scope (updated with arras.io visuals)

Build only:
1. Grid background + camera follow
2. Circle body + 1-2 barrel rectangles (drawn arras.io style)
3. WASD movement with acceleration/deceleration
4. Mouse aim for barrel rotation
5. Click to shoot circle bullets
6. 3 neutral yellow squares to destroy
7. Debug text overlay showing current stats
8. Keyboard shortcuts to swap parts (same as original day-1 plan)

This gives you the arras.io **feel** on day 1 with customization hooks ready.
