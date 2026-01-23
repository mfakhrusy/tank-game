/*******************************************************************************************
*
*   raylib [core] example - input keys
*
*   Example complexity rating: [★☆☆☆] 1/4
*
*   Example originally created with raylib 1.0, last time updated with raylib 1.0
*
*   Example licensed under an unmodified zlib/libpng license, which is an OSI-certified,
*   BSD-like license that allows static linking with closed source software
*
*   Copyright (c) 2014-2025 Ramon Santamaria (@raysan5)
*
********************************************************************************************/

#include <stdio.h>
#include <math.h>
#include "raylib.h"

#if defined(PLATFORM_WEB)
    #include <emscripten/emscripten.h>
#endif

// Game state (needs to be accessible from UpdateDrawFrame)
typedef struct {
    Vector2 playerPos;
    int score;
    int tankSize;
    int tankXSize;
    int tankYSize;
    int cannonXSize;
    int cannonYSize;
    Vector2 mousePosition;
    float rot;
    float tankFrontDegree;
} GameState;

static GameState game;
static const int screenWidth = 800;
static const int screenHeight = 450;

void UpdateDrawFrame(void) {
    // Input handling
    if (IsKeyDown(KEY_LEFT) || IsKeyDown(KEY_A)) {
        game.playerPos.x -= 5;
    }
    if (IsKeyDown(KEY_RIGHT) || IsKeyDown(KEY_D)) {
        game.playerPos.x += 5;
    }
    if (IsKeyDown(KEY_DOWN) || IsKeyDown(KEY_S)) {
        game.playerPos.y += 5;
    }
    if (IsKeyDown(KEY_UP) || IsKeyDown(KEY_W)) {
        game.playerPos.y -= 5;
    }

    Vector2 cannonBase = { game.playerPos.x, game.playerPos.y };
    game.mousePosition = GetMousePosition();
    float angleToMouse = atan2f(game.mousePosition.y - cannonBase.y, game.mousePosition.x - cannonBase.x) * RAD2DEG;

    // Drawing
    BeginDrawing();
        ClearBackground(RAYWHITE);

        DrawRectanglePro(
            (Rectangle){game.playerPos.x, game.playerPos.y, game.tankXSize, game.tankYSize},
            (Vector2){game.tankSize/2, game.tankSize/2},
            0,
            MAROON
        );
        DrawRectanglePro(
            (Rectangle){ cannonBase.x, cannonBase.y, game.cannonXSize, game.cannonYSize },
            (Vector2){ game.cannonXSize / 2, game.tankYSize / 2 },
            angleToMouse,
            GREEN
        );

    EndDrawing();
}

int main(void) {
    InitWindow(screenWidth, screenHeight, "Tank Game");

    // Initialize game state
    game.playerPos = (Vector2){screenWidth/2, screenHeight/2};
    game.score = 0;
    game.tankSize = 80;
    game.tankXSize = game.tankSize;
    game.tankYSize = game.tankSize;
    game.cannonXSize = 20;
    game.cannonYSize = 100;
    game.mousePosition = GetMousePosition();
    game.rot = 0.0f;
    game.tankFrontDegree = 0;

#if defined(PLATFORM_WEB)
    // For web, we need to let the browser control the main loop
    emscripten_set_main_loop(UpdateDrawFrame, 60, 1);
#else
    SetTargetFPS(60);

    while (!WindowShouldClose()) {
        UpdateDrawFrame();
    }
#endif

    CloseWindow();
    return 0;
}
