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

#include "raylib.h"
#include <math.h>

//------------------------------------------------------------------------------------
// Program main entry point
//------------------------------------------------------------------------------------
int main(void)
{
    // Initialization
    //--------------------------------------------------------------------------------------
    const int screenWidth = 800;
    const int screenHeight = 450;

    InitWindow(screenWidth, screenHeight, "raylib [core] example - input keys");

    // Tank properties
    Rectangle tank = { screenWidth/2 - 20, screenHeight/2 - 20, 40, 40 };
    Color tankColor = DARKGREEN;
    
    // Cannon properties
    typedef struct Cannon {
        Vector2 offset;
        float angle;
        float length;
        Color color;
    } Cannon;
    
    Cannon cannons[10] = {0};
    int cannonCount = 0;
    float currentAngle = 0.0f;

    SetTargetFPS(60);               // Set our game to run at 60 frames-per-second
    //--------------------------------------------------------------------------------------

    // Main game loop
    while (!WindowShouldClose())    // Detect window close button or ESC key
    {
        // Update
        //----------------------------------------------------------------------------------
        // Tank movement
        if (IsKeyDown(KEY_RIGHT)) tank.x += 2.0f;
        if (IsKeyDown(KEY_LEFT)) tank.x -= 2.0f;
        if (IsKeyDown(KEY_UP)) tank.y -= 2.0f;
        if (IsKeyDown(KEY_DOWN)) tank.y += 2.0f;
        
        // Cannon rotation
        if (IsKeyDown(KEY_A)) currentAngle -= 2.0f;
        if (IsKeyDown(KEY_D)) currentAngle += 2.0f;
        
        // Add cannon
        if (IsKeyPressed(KEY_SPACE) && cannonCount < 10) {
            cannons[cannonCount] = (Cannon){ .offset = {20, 0}, .angle = currentAngle, .length = 30, .color = GRAY };
            cannonCount++;
        }
        //----------------------------------------------------------------------------------

        // Draw
        //----------------------------------------------------------------------------------
        BeginDrawing();

            ClearBackground(RAYWHITE);

            // Draw tank
            DrawRectangleRec(tank, tankColor);
            
            // Draw cannons
            for (int i = 0; i < cannonCount; i++) {
                Vector2 basePos = { tank.x + tank.width/2, tank.y + tank.height/2 };
                Vector2 tipPos = {
                    basePos.x + cos(DEG2RAD*cannons[i].angle) * cannons[i].length,
                    basePos.y + sin(DEG2RAD*cannons[i].angle) * cannons[i].length
                };
                DrawLineEx(basePos, tipPos, 5, cannons[i].color);
            }
            
            DrawText("ARROW KEYS: Move tank | A/D: Rotate cannon | SPACE: Add cannon", 10, 10, 20, DARKGRAY);

        EndDrawing();
        //----------------------------------------------------------------------------------
    }

    // De-Initialization
    //--------------------------------------------------------------------------------------
    CloseWindow();        // Close window and OpenGL context
    //--------------------------------------------------------------------------------------

    return 0;
}
