## Tank Game Kickoff (Rust + raylib, Kid-friendly, Engineering-focused)

### 1) Core Direction (how to make it feel different)

Your strongest differentiator should be **engineering + customization**, not pure arena shooting.

Design pillars:
- **Build before battle**: players assemble tanks from parts and test them in a sandbox.
- **Tradeoffs matter**: better armor means less speed, stronger cannon means slower reload, etc.
- **Visible engineering**: show weight, power draw, heat, recoil, and turning radius in simple bars.
- **Short play sessions**: 3-7 minute matches, with instant rebuild between rounds.

Avoiding plagiarism (while keeping familiar fun):
- Don’t clone upgrade trees from existing io games.
- Use a **part-slot workshop** instead of level-up stat points.
- Add a **test track / obstacle map** mode where optimization matters, not only PvP.

---

### 2) Suggested Game Loop

1. Enter Workshop
2. Pick hull + treads + turret + weapon + utility modules
3. See live stat impact (speed, turn, DPS, stability, heat)
4. Test in simulation room
5. Play mode:
   - 1v1 with friend
   - Co-op survival against bots
   - Obstacle engineering trial (time attack)
6. Earn parts / materials
7. Iterate build

This loop is great for kids who like tinkering because each match gives immediate feedback on design choices.

---

### 3) Tank Customization System (high flexibility, simple implementation)

Use a data-driven module system:
- **Chassis** (base HP, slots, handling)
- **Mobility** (wheels/tracks/hover, acceleration, terrain grip)
- **Turret Base** (rotation speed, recoil control)
- **Weapon** (projectile type, fire rate, heat)
- **Support Modules** (shield, radar, repair drone, ammo feeder)
- **Passive Mods** (weight reduction, coolant, reinforced plating)

Simple formula model (easy to maintain):
- `finalSpeed = baseSpeed - weightPenalty + mobilityBonus`
- `reloadTime = baseReload * heatFactor * ammoFactor`
- `turnRate = chassisTurn * (1 - recoilPenalty)`

Implementation tip:
- Keep each part in JSON and compose tank stats at runtime.
- This lets you add new parts without touching core game logic.

---

### 4) Tech Options (free stack, Rust-first)

#### Option A: Rust + raylib (**Recommended for your preference**)
Pros:
- Fully free/open source, no engine licensing worries
- Very simple API and quick iteration for 2D gameplay
- Great fit for engineering-style stat systems in Rust

Cons:
- Browser export exists but is not as smooth as JS-first engines
- You do more low-level wiring yourself (UI, state flow, tooling)

Best if:
- You want to build in Rust, keep it fun, and control your architecture.

#### Option B: Rust + macroquad (fallback if browser becomes priority)
Pros:
- Rust workflow but easier web story than raylib in many setups
- Still lightweight and fast for 2D arcade games

Cons:
- Smaller ecosystem compared to older engines
- Different API style from raylib

Best if:
- You want Rust and very quick browser output, and can switch from raylib if needed.

#### Option C: Godot 4 (free, editor-driven)
Pros:
- Free and open source
- Excellent 2D editor workflow

Cons:
- Different language/runtime unless you use Rust bindings
- Larger runtime than minimal raylib approach

Best if:
- You later want heavy editor tooling over code-first Rust flow.

---

### 5) Recommendation

If your priorities are:
- free tooling
- Rust coding
- high customization flexibility
- playable together quickly

Use:
- **Rust + raylib** client
- **Data-driven parts in JSON** from day one
- **Desktop-first MVP**, then browser export path with emscripten

Why this stack:
- You keep motivation high (Rust, no JS fatigue).
- You get full control over game-feel and systems.
- It stays 100% free/open-source.

---

### 6) Browser + Multiplayer Path (incremental, low risk)

Phase 1: Offline desktop prototype (fastest)
- One arena
- Bots
- Full workshop customization

Phase 2: Multiplayer desktop (you + kid)
- Small Rust server with WebSocket rooms
- 2-player authoritative state sync

Phase 3: Browser build via emscripten
- Compile Rust target for web (`wasm32-unknown-emscripten`)
- Serve static web client + hosted room server
- Keep rooms small (2-4 players)

Phase 4: Lightweight hosted setup
- Static site on Cloudflare Pages / Netlify
- Rust room server on Fly.io / Railway / Render

Networking model guidance:
- Start with **lockstep-lite / state sync** (not full rollback netcode).
- Keep projectile logic deterministic where possible.

---

### 7) Project Structure Suggestion

```text
/docs
  tank-game-kickoff.md
/crates
  /game-core        # pure rules: stats, parts, combat formulas
  /game-client      # raylib app (desktop/web target)
  /game-server      # websocket room server
/assets
  /parts
    chassis.json
    weapons.json
    modules.json
/src
  (optional if you do single-crate first)
```

Keep all tank parts in `/assets/parts/*.json` (or equivalent) from day one.

---

### 8) First 2-Week Milestone (MVP)

Week 1:
- Basic movement/shooting
- One arena + 2 bot types
- Workshop UI with 3 slots (chassis/weapon/module)
- Stat recomputation in a pure Rust module

Week 2:
- Save/load builds to local JSON file
- Balance pass for 10-15 parts
- 2-player LAN/online room test
- Optional first browser export attempt

Definition of done:
- Your kid can build 3 very different tanks and feel gameplay differences immediately.

---

### 9) Starter Feature Ideas Kids Usually Love

- Paint + stickers + silly turret hats (high emotional value, low code complexity)
- “Engineering grade” score after each match (efficiency, heat control, stability)
- Blueprint sharing code (`AB12-CD34`) for quick build exchange
- Challenge cards: “win with lightweight tank”, “zero overheat run”, etc.

---

### 10) Practical Next Step

If you want the fastest path with your preferred stack, start with Rust + raylib and build only:
- one map
- one enemy type
- one workshop screen
- three meaningful parts

Then test with your kid immediately. Their reactions will guide the next 80% of design better than any long upfront planning.
