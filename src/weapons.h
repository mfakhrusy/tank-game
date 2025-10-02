#ifndef WEAPONS_H
#define WEAPONS_H

#include "raylib.h"

typedef struct Weapon {
    char name[20];
    float fire_rate;
    int projectile_count;
    float spread_angle;
    Color color;
    int damage;
    float projectile_speed;
} Weapon;

// Predefined weapon templates
static const Weapon WEAPON_MACHINE_GUN = {
    .name = "Machine Gun",
    .fire_rate = 0.1f,
    .projectile_count = 1,
    .spread_angle = 0,
    .color = GRAY,
    .damage = 10,
    .projectile_speed = 15.0f
};

static const Weapon WEAPON_SHOTGUN = {
    .name = "Shotgun",
    .fire_rate = 1.0f,
    .projectile_count = 5,
    .spread_angle = 30.0f,
    .color = ORANGE,
    .damage = 6,
    .projectile_speed = 12.0f
};

static const Weapon WEAPON_CANNON = {
    .name = "Cannon",
    .fire_rate = 2.0f,
    .projectile_count = 1,
    .spread_angle = 0,
    .color = RED,
    .damage = 25,
    .projectile_speed = 8.0f
};

#endif // WEAPONS_H
