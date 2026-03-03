mod data;
mod game;

use data::loader;
use game::entities::tank::Tank;
use raylib::prelude::*;

// Arras.io color palette
const BG_COLOR: Color = Color::new(205, 205, 205, 255);
const GRID_COLOR: Color = Color::new(193, 193, 193, 255);
const BODY_FILL: Color = Color::new(0, 178, 225, 255);
const BODY_OUTLINE: Color = Color::new(85, 85, 85, 255);
const BARREL_FILL: Color = Color::new(153, 153, 153, 255);
const BARREL_OUTLINE: Color = Color::new(85, 85, 85, 255);
const BULLET_COLOR: Color = Color::new(0, 178, 225, 255);

const GRID_SPACING: i32 = 40;
const OUTLINE_THICKNESS: f32 = 3.0;

struct Bullet {
    x: f32,
    y: f32,
    vx: f32,
    vy: f32,
    radius: f32,
    lifetime: f32,
}

fn main() {
    let (mut rl, thread) = raylib::init()
        .size(960, 720)
        .title("Tank Workshop")
        .build();

    rl.set_target_fps(60);

    let catalog = loader::load_catalog("assets");
    let build = loader::load_build("assets/builds/default.json");
    let mut tank = Tank::from_build(&build, &catalog);

    let mut bullets: Vec<Bullet> = Vec::new();
    let mut reload_timer: f32 = 0.0;

    while !rl.window_should_close() {
        let dt = rl.get_frame_time();
        let screen_w = rl.get_screen_width() as f32;
        let screen_h = rl.get_screen_height() as f32;

        // --- Input ---
        let mut move_x: f32 = 0.0;
        let mut move_y: f32 = 0.0;
        if rl.is_key_down(KeyboardKey::KEY_W) { move_y -= 1.0; }
        if rl.is_key_down(KeyboardKey::KEY_S) { move_y += 1.0; }
        if rl.is_key_down(KeyboardKey::KEY_A) { move_x -= 1.0; }
        if rl.is_key_down(KeyboardKey::KEY_D) { move_x += 1.0; }

        // Normalize diagonal movement
        let move_len = (move_x * move_x + move_y * move_y).sqrt();
        if move_len > 0.0 {
            move_x /= move_len;
            move_y /= move_len;
        }

        // Mouse aim
        let mouse = rl.get_mouse_position();
        tank.aim_angle = (mouse.y - tank.y).atan2(mouse.x - tank.x);

        // --- Update tank ---
        let accel = tank.stats.acceleration * 300.0;
        let max_speed = tank.stats.max_speed;

        if move_len > 0.0 {
            tank.vel_x += move_x * accel * dt;
            tank.vel_y += move_y * accel * dt;
        } else {
            // Friction
            tank.vel_x *= 1.0 - 5.0 * dt;
            tank.vel_y *= 1.0 - 5.0 * dt;
        }

        // Clamp speed
        let speed = (tank.vel_x * tank.vel_x + tank.vel_y * tank.vel_y).sqrt();
        if speed > max_speed {
            tank.vel_x = tank.vel_x / speed * max_speed;
            tank.vel_y = tank.vel_y / speed * max_speed;
        }

        tank.x += tank.vel_x * dt;
        tank.y += tank.vel_y * dt;

        // Keep tank on screen
        let r = tank.body.radius;
        tank.x = tank.x.clamp(r, screen_w - r);
        tank.y = tank.y.clamp(r, screen_h - r);

        // --- Shooting ---
        reload_timer -= dt;
        if rl.is_mouse_button_down(MouseButton::MOUSE_BUTTON_LEFT) && reload_timer <= 0.0 {
            for barrel_stats in &tank.stats.barrels {
                let barrel_world_angle = tank.aim_angle + barrel_stats.placement_angle.to_radians();
                let spawn_x = tank.x + barrel_world_angle.cos() * (tank.body.radius + barrel_stats.length);
                let spawn_y = tank.y + barrel_world_angle.sin() * (tank.body.radius + barrel_stats.length);

                for _ in 0..barrel_stats.bullet_count {
                    let spread_offset = if barrel_stats.spread > 0.0 {
                        (rand_f32() - 0.5) * barrel_stats.spread * 2.0
                    } else {
                        0.0
                    };
                    let bullet_angle = barrel_world_angle + spread_offset;

                    bullets.push(Bullet {
                        x: spawn_x,
                        y: spawn_y,
                        vx: bullet_angle.cos() * barrel_stats.bullet_speed,
                        vy: bullet_angle.sin() * barrel_stats.bullet_speed,
                        radius: barrel_stats.width * 0.4,
                        lifetime: barrel_stats.reload_ms as f32 / 1000.0 * 5.0,
                    });
                }

                // Recoil
                tank.vel_x -= barrel_world_angle.cos() * barrel_stats.recoil * 50.0;
                tank.vel_y -= barrel_world_angle.sin() * barrel_stats.recoil * 50.0;
            }
            // Use shortest reload among all barrels
            if let Some(min_reload) = tank.stats.barrels.iter().map(|b| b.reload_ms).min() {
                reload_timer = min_reload as f32 / 1000.0;
            }
        }

        // Update bullets
        for bullet in &mut bullets {
            bullet.x += bullet.vx * dt;
            bullet.y += bullet.vy * dt;
            bullet.lifetime -= dt;
        }
        bullets.retain(|b| b.lifetime > 0.0 && b.x > -50.0 && b.x < screen_w + 50.0 && b.y > -50.0 && b.y < screen_h + 50.0);

        // --- Swap parts with keyboard ---
        let mut rebuild = false;
        if rl.is_key_pressed(KeyboardKey::KEY_ONE) {
            tank.body = catalog.bodies.iter().find(|b| b.id == "scout").unwrap().clone();
            rebuild = true;
        }
        if rl.is_key_pressed(KeyboardKey::KEY_TWO) {
            tank.body = catalog.bodies.iter().find(|b| b.id == "standard").unwrap().clone();
            rebuild = true;
        }
        if rl.is_key_pressed(KeyboardKey::KEY_THREE) {
            tank.body = catalog.bodies.iter().find(|b| b.id == "heavy").unwrap().clone();
            rebuild = true;
        }
        if rl.is_key_pressed(KeyboardKey::KEY_FOUR) {
            tank.body = catalog.bodies.iter().find(|b| b.id == "fortress").unwrap().clone();
            rebuild = true;
        }
        // Cycle barrel type on first barrel
        if rl.is_key_pressed(KeyboardKey::KEY_FIVE) {
            if let Some((barrel, _)) = tank.barrels.first_mut() {
                let idx = catalog.barrels.iter().position(|b| b.id == barrel.id).unwrap_or(0);
                let next = (idx + 1) % catalog.barrels.len();
                *barrel = catalog.barrels[next].clone();
                rebuild = true;
            }
        }
        // Cycle engine
        if rl.is_key_pressed(KeyboardKey::KEY_SIX) {
            let idx = catalog.engines.iter().position(|e| e.id == tank.engine.id).unwrap_or(0);
            let next = (idx + 1) % catalog.engines.len();
            tank.engine = catalog.engines[next].clone();
            rebuild = true;
        }

        if rebuild {
            tank.recompute_stats();
        }

        // --- Draw ---
        let mut d = rl.begin_drawing(&thread);
        d.clear_background(BG_COLOR);

        // Grid
        for x in (0..screen_w as i32).step_by(GRID_SPACING as usize) {
            d.draw_line(x, 0, x, screen_h as i32, GRID_COLOR);
        }
        for y in (0..screen_h as i32).step_by(GRID_SPACING as usize) {
            d.draw_line(0, y, screen_w as i32, y, GRID_COLOR);
        }

        // Bullets
        for bullet in &bullets {
            d.draw_circle(bullet.x as i32, bullet.y as i32, bullet.radius + OUTLINE_THICKNESS, BODY_OUTLINE);
            d.draw_circle(bullet.x as i32, bullet.y as i32, bullet.radius, BULLET_COLOR);
        }

        // Tank barrels (drawn behind body)
        for barrel_stats in &tank.stats.barrels {
            let barrel_world_angle = tank.aim_angle + barrel_stats.placement_angle.to_radians();
            let angle_deg = barrel_world_angle.to_degrees();

            let half_w = barrel_stats.width / 2.0;
            let cx = tank.x + barrel_world_angle.cos() * (tank.body.radius + barrel_stats.length / 2.0 - 4.0);
            let cy = tank.y + barrel_world_angle.sin() * (tank.body.radius + barrel_stats.length / 2.0 - 4.0);

            // Outline
            d.draw_rectangle_pro(
                Rectangle::new(cx, cy, barrel_stats.length + OUTLINE_THICKNESS * 2.0, barrel_stats.width + OUTLINE_THICKNESS * 2.0),
                Vector2::new((barrel_stats.length + OUTLINE_THICKNESS * 2.0) / 2.0, half_w + OUTLINE_THICKNESS),
                angle_deg,
                BARREL_OUTLINE,
            );
            // Fill
            d.draw_rectangle_pro(
                Rectangle::new(cx, cy, barrel_stats.length, barrel_stats.width),
                Vector2::new(barrel_stats.length / 2.0, half_w),
                angle_deg,
                BARREL_FILL,
            );
        }

        // Tank body
        let body_r = tank.body.radius;
        d.draw_circle(tank.x as i32, tank.y as i32, body_r + OUTLINE_THICKNESS, BODY_OUTLINE);
        d.draw_circle(tank.x as i32, tank.y as i32, body_r, BODY_FILL);

        // Debug stats overlay
        let stats = &tank.stats;
        d.draw_text(&format!("Body: {} | Engine: {}", tank.body.name, tank.engine.name), 10, 10, 16, Color::BLACK);
        d.draw_text(&format!("HP: {} | Speed: {:.0} | Mass: {:.0}", stats.max_hp, stats.max_speed, stats.total_mass), 10, 30, 16, Color::BLACK);
        d.draw_text(&format!("Barrels: {}", tank.barrels.len()), 10, 50, 16, Color::BLACK);
        if let Some((barrel, _)) = tank.barrels.first() {
            d.draw_text(&format!("  [0] {} (dmg:{:.0} reload:{}ms)", barrel.name, barrel.damage, stats.barrels[0].reload_ms), 10, 70, 16, Color::BLACK);
        }
        d.draw_text("[1-4] Body  [5] Cycle Barrel  [6] Cycle Engine  [LMB] Shoot", 10, screen_h as i32 - 30, 14, Color::DARKGRAY);
    }
}

fn rand_f32() -> f32 {
    // Simple deterministic-enough random using raylib's GetRandomValue
    unsafe { raylib::ffi::GetRandomValue(0, 10000) as f32 / 10000.0 }
}
