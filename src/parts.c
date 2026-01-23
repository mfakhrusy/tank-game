#include "parts.h"
#include <string.h>

static PartDef s_part_defs[MAX_PART_TYPES];
static int s_part_count = 0;

static void register_part(PartType type, const char *name, Stats bonus, float size, Color color)
{
    if (s_part_count >= MAX_PART_TYPES) {
        return;
    }
    
    PartDef *def = &s_part_defs[s_part_count];
    def->id = s_part_count;
    def->type = type;
    def->name = name;
    def->stat_bonus = bonus;
    def->size = size;
    def->color = color;
    
    s_part_count++;
}

void parts_init(void)
{
    s_part_count = 0;
    memset(s_part_defs, 0, sizeof(s_part_defs));
    
    /* Basic cannon - balanced stats */
    register_part(
        PART_CANNON,
        "Basic Cannon",
        (Stats){
            .damage = 10.0f,
            .reload_speed = 1.0f,
            .projectile_speed = 400.0f
        },
        20.0f,
        DARKGREEN
    );
    
    /* Sniper cannon - high damage, slow reload */
    register_part(
        PART_CANNON,
        "Sniper Cannon",
        (Stats){
            .damage = 25.0f,
            .reload_speed = 0.5f,
            .projectile_speed = 600.0f
        },
        15.0f,
        DARKBLUE
    );
    
    /* Machine gun - low damage, fast reload */
    register_part(
        PART_CANNON,
        "Machine Gun",
        (Stats){
            .damage = 4.0f,
            .reload_speed = 3.0f,
            .projectile_speed = 350.0f
        },
        12.0f,
        ORANGE
    );
    
    /* Rocket launcher - high damage, slow, splash */
    register_part(
        PART_LAUNCHER,
        "Rocket Launcher",
        (Stats){
            .damage = 40.0f,
            .reload_speed = 0.3f,
            .projectile_speed = 250.0f
        },
        25.0f,
        RED
    );
    
    /* Shield generator - defensive */
    register_part(
        PART_SHIELD,
        "Shield Generator",
        (Stats){
            .max_health = 50.0f,
            .health_regen = 2.0f
        },
        18.0f,
        SKYBLUE
    );
    
    /* Booster - mobility */
    register_part(
        PART_BOOSTER,
        "Thruster",
        (Stats){
            .move_speed = 50.0f,
            .rotation_speed = 0.5f
        },
        16.0f,
        YELLOW
    );
    
    /* Drone bay - spawns drones */
    register_part(
        PART_DRONE_BAY,
        "Drone Bay",
        (Stats){
            .damage = 5.0f
        },
        22.0f,
        PURPLE
    );
}

const PartDef *parts_get_def(int def_id)
{
    if (def_id < 0 || def_id >= s_part_count) {
        return NULL;
    }
    return &s_part_defs[def_id];
}

int parts_get_count(void)
{
    return s_part_count;
}

Part parts_create(int def_id, PartSlot slot)
{
    Part part = {0};
    part.def_id = def_id;
    part.slot = slot;
    part.angle_offset = 0.0f;
    part.reload_timer = 0.0f;
    part.rarity = RARITY_COMMON;
    part.upgrade_level = 0;
    return part;
}

Stats parts_calc_bonus(const Part *part)
{
    const PartDef *def = parts_get_def(part->def_id);
    if (!def) {
        return (Stats){0};
    }
    
    /* Rarity multiplier: 1.0, 1.2, 1.5, 2.0, 3.0 */
    float rarity_mult = 1.0f + (float)part->rarity * 0.25f;
    if (part->rarity >= RARITY_EPIC) {
        rarity_mult += 0.5f;
    }
    
    /* Upgrade multiplier: +10% per level */
    float upgrade_mult = 1.0f + (float)part->upgrade_level * 0.1f;
    
    float total_mult = rarity_mult * upgrade_mult;
    
    Stats bonus = def->stat_bonus;
    bonus.max_health *= total_mult;
    bonus.health_regen *= total_mult;
    bonus.move_speed *= total_mult;
    bonus.rotation_speed *= total_mult;
    bonus.damage *= total_mult;
    bonus.reload_speed *= total_mult;
    bonus.projectile_speed *= total_mult;
    bonus.body_damage *= total_mult;
    
    return bonus;
}

const char *parts_type_name(PartType type)
{
    switch (type) {
        case PART_NONE:      return "None";
        case PART_CANNON:    return "Cannon";
        case PART_LAUNCHER:  return "Launcher";
        case PART_SHIELD:    return "Shield";
        case PART_BOOSTER:   return "Booster";
        case PART_DRONE_BAY: return "Drone Bay";
        default:             return "Unknown";
    }
}

Color parts_rarity_color(Rarity rarity)
{
    switch (rarity) {
        case RARITY_COMMON:    return GRAY;
        case RARITY_UNCOMMON:  return GREEN;
        case RARITY_RARE:      return BLUE;
        case RARITY_EPIC:      return PURPLE;
        case RARITY_LEGENDARY: return GOLD;
        default:               return WHITE;
    }
}
