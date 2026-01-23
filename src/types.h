#ifndef TYPES_H
#define TYPES_H

#include "raylib.h"
#include <stdbool.h>
#include <stdint.h>

/*
 * Core type definitions for the tank game.
 * All shared structs and enums are defined here to avoid circular dependencies.
 */

#define MAX_PARTS_PER_TANK   16
#define MAX_PART_TYPES       64
#define MAX_TANKS            128
#define MAX_PROJECTILES      512

typedef uint32_t EntityId;
#define INVALID_ENTITY_ID 0

/* Part slot positions on tank body */
typedef enum {
    SLOT_FRONT = 0,
    SLOT_BACK,
    SLOT_LEFT,
    SLOT_RIGHT,
    SLOT_TOP,
    SLOT_COUNT
} PartSlot;

/* Categories of parts that can be attached */
typedef enum {
    PART_NONE = 0,
    PART_CANNON,
    PART_LAUNCHER,
    PART_SHIELD,
    PART_BOOSTER,
    PART_DRONE_BAY,
    PART_TYPE_COUNT
} PartType;

/* Rarity affects stats and visuals */
typedef enum {
    RARITY_COMMON = 0,
    RARITY_UNCOMMON,
    RARITY_RARE,
    RARITY_EPIC,
    RARITY_LEGENDARY,
    RARITY_COUNT
} Rarity;

/* Stats that can be modified by parts and upgrades */
typedef struct {
    float max_health;
    float health_regen;
    float move_speed;
    float rotation_speed;
    float damage;
    float reload_speed;
    float projectile_speed;
    float body_damage;
} Stats;

/* Definition of a part type (template) */
typedef struct {
    int id;
    PartType type;
    const char *name;
    Stats stat_bonus;
    float size;
    Color color;
} PartDef;

/* Instance of a part attached to a tank */
typedef struct {
    int def_id;
    PartSlot slot;
    float angle_offset;
    float reload_timer;
    Rarity rarity;
    int upgrade_level;
} Part;

/* Tank entity */
typedef struct {
    EntityId id;
    bool active;
    Vector2 position;
    Vector2 velocity;
    float rotation;
    float aim_angle;
    Stats base_stats;
    Stats current_stats;
    float health;
    Color body_color;
    float body_size;
    Part parts[MAX_PARTS_PER_TANK];
    int part_count;
    bool is_player;
} Tank;

/* Projectile entity */
typedef struct {
    EntityId id;
    bool active;
    EntityId owner_id;
    Vector2 position;
    Vector2 velocity;
    float damage;
    float lifetime;
    float size;
    Color color;
} Projectile;

/* Game scene/state */
typedef enum {
    SCENE_MENU = 0,
    SCENE_CRAFTING,
    SCENE_GAME,
    SCENE_COUNT
} GameScene;

/* Input state snapshot */
typedef struct {
    Vector2 move_dir;
    Vector2 aim_pos;
    bool fire;
    bool use_ability;
    bool open_crafting;
} InputState;

#endif /* TYPES_H */
