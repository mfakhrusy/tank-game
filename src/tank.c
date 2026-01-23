#include "tank.h"
#include "parts.h"
#include <string.h>
#include <math.h>

static Tank s_tanks[MAX_TANKS];
static int s_tank_count = 0;
static EntityId s_next_id = 1;
static Tank *s_player_tank = NULL;

void tank_system_init(void)
{
    memset(s_tanks, 0, sizeof(s_tanks));
    s_tank_count = 0;
    s_next_id = 1;
    s_player_tank = NULL;
}

Tank *tank_create(Vector2 position, bool is_player)
{
    Tank *tank = NULL;
    
    /* Find an inactive slot */
    for (int i = 0; i < MAX_TANKS; i++) {
        if (!s_tanks[i].active) {
            tank = &s_tanks[i];
            break;
        }
    }
    
    if (!tank) {
        return NULL;
    }
    
    memset(tank, 0, sizeof(Tank));
    tank->id = s_next_id++;
    tank->active = true;
    tank->position = position;
    tank->velocity = (Vector2){0, 0};
    tank->rotation = 0.0f;
    tank->aim_angle = 0.0f;
    tank->body_size = 40.0f;
    tank->body_color = is_player ? MAROON : DARKGRAY;
    tank->is_player = is_player;
    tank->part_count = 0;
    
    /* Base stats */
    tank->base_stats = (Stats){
        .max_health = 100.0f,
        .health_regen = 1.0f,
        .move_speed = 200.0f,
        .rotation_speed = 3.0f,
        .damage = 0.0f,
        .reload_speed = 1.0f,
        .projectile_speed = 400.0f,
        .body_damage = 10.0f
    };
    
    tank_recalc_stats(tank);
    tank->health = tank->current_stats.max_health;
    
    if (is_player) {
        s_player_tank = tank;
    }
    
    s_tank_count++;
    return tank;
}

void tank_destroy(Tank *tank)
{
    if (!tank || !tank->active) {
        return;
    }
    
    if (tank == s_player_tank) {
        s_player_tank = NULL;
    }
    
    tank->active = false;
    s_tank_count--;
}

Tank *tank_get(EntityId id)
{
    for (int i = 0; i < MAX_TANKS; i++) {
        if (s_tanks[i].active && s_tanks[i].id == id) {
            return &s_tanks[i];
        }
    }
    return NULL;
}

Tank *tank_get_player(void)
{
    return s_player_tank;
}

bool tank_attach_part(Tank *tank, Part part)
{
    if (!tank || tank->part_count >= MAX_PARTS_PER_TANK) {
        return false;
    }
    
    /* Check if slot is already occupied */
    for (int i = 0; i < tank->part_count; i++) {
        if (tank->parts[i].slot == part.slot && 
            fabsf(tank->parts[i].angle_offset - part.angle_offset) < 0.01f) {
            return false;
        }
    }
    
    tank->parts[tank->part_count++] = part;
    tank_recalc_stats(tank);
    return true;
}

bool tank_remove_part(Tank *tank, PartSlot slot)
{
    if (!tank) {
        return false;
    }
    
    for (int i = 0; i < tank->part_count; i++) {
        if (tank->parts[i].slot == slot) {
            /* Shift remaining parts */
            for (int j = i; j < tank->part_count - 1; j++) {
                tank->parts[j] = tank->parts[j + 1];
            }
            tank->part_count--;
            tank_recalc_stats(tank);
            return true;
        }
    }
    return false;
}

void tank_recalc_stats(Tank *tank)
{
    if (!tank) {
        return;
    }
    
    tank->current_stats = tank->base_stats;
    
    for (int i = 0; i < tank->part_count; i++) {
        Stats bonus = parts_calc_bonus(&tank->parts[i]);
        tank->current_stats.max_health += bonus.max_health;
        tank->current_stats.health_regen += bonus.health_regen;
        tank->current_stats.move_speed += bonus.move_speed;
        tank->current_stats.rotation_speed += bonus.rotation_speed;
        tank->current_stats.damage += bonus.damage;
        tank->current_stats.reload_speed += bonus.reload_speed;
        tank->current_stats.projectile_speed += bonus.projectile_speed;
        tank->current_stats.body_damage += bonus.body_damage;
    }
}

void tank_update(Tank *tank, InputState input, float dt)
{
    if (!tank || !tank->active) {
        return;
    }
    
    /* Movement */
    float speed = tank->current_stats.move_speed;
    tank->velocity.x = input.move_dir.x * speed;
    tank->velocity.y = input.move_dir.y * speed;
    
    tank->position.x += tank->velocity.x * dt;
    tank->position.y += tank->velocity.y * dt;
    
    /* Aiming */
    tank->aim_angle = atan2f(
        input.aim_pos.y - tank->position.y,
        input.aim_pos.x - tank->position.x
    ) * RAD2DEG;
    
    /* Update part cooldowns */
    for (int i = 0; i < tank->part_count; i++) {
        if (tank->parts[i].reload_timer > 0) {
            tank->parts[i].reload_timer -= dt;
        }
    }
    
    /* Health regeneration */
    if (tank->health < tank->current_stats.max_health) {
        tank->health += tank->current_stats.health_regen * dt;
        if (tank->health > tank->current_stats.max_health) {
            tank->health = tank->current_stats.max_health;
        }
    }
}

static void draw_part(const Tank *tank, const Part *part)
{
    const PartDef *def = parts_get_def(part->def_id);
    if (!def) {
        return;
    }
    
    float angle = tank->aim_angle + part->angle_offset;
    float rad = angle * DEG2RAD;
    
    /* Calculate part position based on slot */
    float offset_dist = tank->body_size * 0.5f;
    Vector2 part_pos = {
        tank->position.x + cosf(rad) * offset_dist,
        tank->position.y + sinf(rad) * offset_dist
    };
    
    /* Draw based on part type */
    switch (def->type) {
        case PART_CANNON:
        case PART_LAUNCHER: {
            /* Draw as a rectangle (barrel) */
            float width = def->size * 0.4f;
            float length = def->size * 2.0f;
            Rectangle rect = {
                part_pos.x,
                part_pos.y,
                length,
                width
            };
            Vector2 origin = {0, width * 0.5f};
            DrawRectanglePro(rect, origin, angle, def->color);
            break;
        }
        case PART_SHIELD:
        case PART_BOOSTER:
        case PART_DRONE_BAY: {
            /* Draw as a circle */
            DrawCircleV(part_pos, def->size * 0.5f, def->color);
            break;
        }
        default:
            break;
    }
}

void tank_draw(const Tank *tank)
{
    if (!tank || !tank->active) {
        return;
    }
    
    /* Draw parts behind body (back slot) */
    for (int i = 0; i < tank->part_count; i++) {
        if (tank->parts[i].slot == SLOT_BACK) {
            draw_part(tank, &tank->parts[i]);
        }
    }
    
    /* Draw tank body */
    DrawCircleV(tank->position, tank->body_size, tank->body_color);
    DrawCircleV(tank->position, tank->body_size * 0.8f, 
        ColorBrightness(tank->body_color, 0.2f));
    
    /* Draw parts in front of body */
    for (int i = 0; i < tank->part_count; i++) {
        if (tank->parts[i].slot != SLOT_BACK) {
            draw_part(tank, &tank->parts[i]);
        }
    }
    
    /* Draw health bar */
    if (tank->health < tank->current_stats.max_health) {
        float bar_width = tank->body_size * 2.0f;
        float bar_height = 6.0f;
        float health_pct = tank->health / tank->current_stats.max_health;
        
        Vector2 bar_pos = {
            tank->position.x - bar_width * 0.5f,
            tank->position.y - tank->body_size - 15.0f
        };
        
        DrawRectangle((int)bar_pos.x, (int)bar_pos.y, 
            (int)bar_width, (int)bar_height, DARKGRAY);
        DrawRectangle((int)bar_pos.x, (int)bar_pos.y, 
            (int)(bar_width * health_pct), (int)bar_height, GREEN);
    }
}

Tank *tank_get_all(int *out_count)
{
    if (out_count) {
        *out_count = MAX_TANKS;
    }
    return s_tanks;
}
