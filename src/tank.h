#ifndef TANK_H
#define TANK_H

#include "types.h"

/*
 * Tank entity management - creation, updates, and part attachment.
 */

/* Initialize the tank system */
void tank_system_init(void);

/* Create a new tank, returns NULL if pool is full */
Tank *tank_create(Vector2 position, bool is_player);

/* Destroy a tank and free its slot */
void tank_destroy(Tank *tank);

/* Get tank by entity ID, returns NULL if not found */
Tank *tank_get(EntityId id);

/* Get the player tank (convenience function) */
Tank *tank_get_player(void);

/* Attach a part to a tank, returns true on success */
bool tank_attach_part(Tank *tank, Part part);

/* Remove a part from a tank by slot */
bool tank_remove_part(Tank *tank, PartSlot slot);

/* Recalculate tank's current stats from base + parts */
void tank_recalc_stats(Tank *tank);

/* Update tank state (movement, aiming, cooldowns) */
void tank_update(Tank *tank, InputState input, float dt);

/* Draw a tank */
void tank_draw(const Tank *tank);

/* Get all active tanks for iteration */
Tank *tank_get_all(int *out_count);

#endif /* TANK_H */
