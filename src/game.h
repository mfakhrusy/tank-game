#ifndef GAME_H
#define GAME_H

#include "types.h"

/*
 * Main game state and lifecycle management.
 */

/* Initialize all game systems */
void game_init(void);

/* Shutdown and cleanup */
void game_shutdown(void);

/* Main update function, called each frame */
void game_update(float dt);

/* Main draw function, called each frame */
void game_draw(void);

/* Shared UI font */
Font game_get_ui_font(void);

/* Scale UI sizes for current window size */
float game_get_ui_scale(void);

/* Get current game scene */
GameScene game_get_scene(void);

/* Change to a different scene */
void game_set_scene(GameScene scene);

#endif /* GAME_H */
