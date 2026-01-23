#ifndef CRAFTING_H
#define CRAFTING_H

#include "types.h"

/*
 * Crafting UI system - allows players to customize their tank.
 * This is the main focus of the game's building/customization system.
 */

/* Initialize crafting system */
void crafting_init(void);

/* Open/close the crafting UI */
void crafting_open(Tank *tank);
void crafting_close(void);
bool crafting_is_open(void);

/* Update crafting UI (handles input) */
void crafting_update(float dt);

/* Draw crafting UI */
void crafting_draw(void);

/* Get the tank currently being edited */
Tank *crafting_get_tank(void);

#endif /* CRAFTING_H */
