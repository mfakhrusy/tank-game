use crate::data::model::*;

#[derive(Debug, Clone)]
pub struct BarrelFinalStats {
    pub damage: f32,
    pub reload_ms: u32,
    pub bullet_speed: f32,
    pub bullet_lifetime_ms: u32,
    pub bullet_count: u8,
    pub spread: f32,
    pub recoil: f32,
    pub placement_angle: f32,
    pub facing: f32,
    pub width: f32,
    pub length: f32,
}

#[derive(Debug, Clone)]
pub struct FinalStats {
    // defense
    pub max_hp: i32,
    pub shield_hp: f32,
    pub hp_regen: f32,
    pub shield_regen: f32,
    pub body_damage: f32,

    // movement
    pub max_speed: f32,
    pub acceleration: f32,
    pub total_mass: f32,

    // barrels
    pub barrels: Vec<BarrelFinalStats>,

    // utility
    pub view_range: f32,
    pub drone_limit: u8,
}

fn mass_penalty(total_mass: f32) -> f32 {
    (1.0 - (total_mass - 20.0) * 0.005).clamp(0.4, 1.0)
}

pub fn compose(
    body: &Body,
    engine: &Engine,
    barrels: &[(Barrel, BarrelPlacement)],
    modules: &[Module],
) -> FinalStats {
    // Total mass
    let total_mass = body.mass
        + engine.mass
        + barrels.iter().map(|(b, _)| b.mass).sum::<f32>()
        + modules.iter().map(|m| m.mass).sum::<f32>();

    let penalty = mass_penalty(total_mass);

    // Collect module effects
    let mut hp_bonus: i32 = 0;
    let mut speed_multiplier: f32 = 1.0;
    let mut reload_multiplier: f32 = 1.0;
    let mut shield_hp: f32 = 0.0;
    let mut shield_regen: f32 = 0.0;
    let mut hp_regen: f32 = 0.0;
    let mut view_range_multiplier: f32 = 1.0;
    let mut drone_limit_bonus: u8 = 0;

    for module in modules {
        if let Some(&v) = module.effects.get("hp_bonus") {
            hp_bonus += v as i32;
        }
        if let Some(&v) = module.effects.get("speed_multiplier") {
            speed_multiplier *= v;
        }
        if let Some(&v) = module.effects.get("reload_multiplier") {
            reload_multiplier *= v;
        }
        if let Some(&v) = module.effects.get("shield_hp") {
            shield_hp += v;
        }
        if let Some(&v) = module.effects.get("shield_regen") {
            shield_regen += v;
        }
        if let Some(&v) = module.effects.get("hp_regen") {
            hp_regen += v;
        }
        if let Some(&v) = module.effects.get("view_range_multiplier") {
            view_range_multiplier *= v;
        }
        if let Some(&v) = module.effects.get("drone_limit_bonus") {
            drone_limit_bonus += v as u8;
        }
    }

    // Compute barrel stats
    let barrel_stats: Vec<BarrelFinalStats> = barrels
        .iter()
        .map(|(barrel, placement)| BarrelFinalStats {
            damage: barrel.damage,
            reload_ms: (barrel.reload_ms as f32 * reload_multiplier) as u32,
            bullet_speed: barrel.bullet_speed,
            bullet_lifetime_ms: barrel.bullet_lifetime_ms,
            bullet_count: barrel.bullet_count,
            spread: barrel.spread,
            recoil: barrel.recoil,
            placement_angle: placement.angle,
            facing: placement.facing,
            width: barrel.width,
            length: barrel.length,
        })
        .collect();

    FinalStats {
        max_hp: body.hp + hp_bonus,
        shield_hp,
        hp_regen,
        shield_regen,
        body_damage: body.body_damage,
        max_speed: engine.max_speed * speed_multiplier * penalty,
        acceleration: engine.acceleration * penalty,
        total_mass,
        barrels: barrel_stats,
        view_range: 400.0 * view_range_multiplier,
        drone_limit: 4 + drone_limit_bonus,
    }
}
