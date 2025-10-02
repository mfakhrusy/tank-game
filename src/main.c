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
#include "weapons.h"
#include <math.h>

typedef struct Projectile {
    Vector2 position;
    Vector2 direction;
    float speed;
    Color color;
    float lifetime;
} Projectile;

typedef struct Tank {
    Rectangle bounds;
    Color color;
    Weapon weapons[3];
    int currentWeapon;
    float fireTimer;
} Tank;

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
    Tank playerTank = {
        .bounds = { screenWidth/2 - 20, screenHeight/2 - 20, 40, 40 },
        .color = DARKGREEN,
        .weapons = { WEAPON_MACHINE_GUN, WEAPON_SHOTGUN, WEAPON_CANNON },
        .currentWeapon = 0,
        .fireTimer = 0
    };
    
    Projectile projectiles[100] = {0};
    int projectileCount = 0;
    
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
        if (IsKeyDown(KEY_RIGHT)) playerTank.bounds.x += 2.0f;
        if (IsKeyDown(KEY_LEFT)) playerTank.bounds.x -= 2.0f;
        if (IsKeyDown(KEY_UP)) playerTank.bounds.y -= 2.0f;
        if (IsKeyDown(KEY_DOWN)) playerTank.bounds.y += 2.0f;

        // Weapon switching
        if (IsKeyPressed(KEY_Q)) {
            playerTank.currentWeapon--;
            if (playerTank.currentWeapon < 0) playerTank.currentWeapon = 2;
        }
        if (IsKeyPressed(KEY_E)) {
            playerTank.currentWeapon++;
            if (playerTank.currentWeapon > 2) playerTank.currentWeapon = 0;
        }

        // Update fire timer
        Weapon currentWeapon = playerTank.weapons[playerTank.currentWeapon];
        if (playerTank.fireTimer > 0) {
            playerTank.fireTimer -= GetFrameTime();
        }
        
        // Cannon rotation
        if (IsKeyDown(KEY_A)) currentAngle -= 2.0f;
        if (IsKeyDown(KEY_D)) currentAngle += 2.0f;
        
        // Fire projectiles
        if (IsKeyDown(KEY_SPACE) && playerTank.fireTimer <= 0) {
            Vector2 basePos = { 
                playerTank.bounds.x + playerTank.bounds.width/2, 
                playerTank.bounds.y + playerTank.bounds.height/2 
            };
            
            for (int i = 0; i < currentWeapon.projectile_count; i++) {
                float angle = currentAngle + (currentWeapon.spread_angle * (i - (currentWeapon.projectile_count-1)/2.0f));
                Vector2 direction = {
                    cos(DEG2RAD * angle),
                    sin(DEG2RAD * angle)
                };
                
                if (projectileCount < 100) {
                    projectiles[projectileCount] = (Projectile){
                        .position = basePos,
                        .direction = direction,
                        .speed = currentWeapon.projectile_speed,
                        .color = currentWeapon.color,
                        .lifetime = 2.0f
                    };
                    projectileCount++;
                }
            }
            
            playerTank.fireTimer = currentWeapon.fire_rate;
        }
        //----------------------------------------------------------------------------------

        // Draw
        //----------------------------------------------------------------------------------
        BeginDrawing();

            ClearBackground(RAYWHITE);

            // Draw tank
            DrawRectangleRec(playerTank.bounds, playerTank.color);

            // Draw weapon
            Vector2 basePos = { 
                playerTank.bounds.x + playerTank.bounds.width/2, 
                playerTank.bounds.y + playerTank.bounds.height/2 
            };
            Vector2 tipPos = {
                basePos.x + cos(DEG2RAD*currentAngle) * 40,
                basePos.y + sin(DEG2RAD*currentAngle) * 40
            };
            DrawLineEx(basePos, tipPos, 5, playerTank.weapons[playerTank.currentWeapon].color);

            // Draw projectiles
            for (int i = 0; i < projectileCount; i++) {
                DrawCircleV(projectiles[i].position, 3, projectiles[i].color);
                projectiles[i].position.x += projectiles[i].direction.x * projectiles[i].speed;
                projectiles[i].position.y += projectiles[i].direction.y * projectiles[i].speed;
                projectiles[i].lifetime -= GetFrameTime();
                
                if (projectiles[i].lifetime <= 0) {
                    projectiles[i] = projectiles[projectileCount - 1];
                    projectileCount--;
                    i--;
                }
            }
            
            // Draw UI
            DrawText(TextFormat("Current Weapon: %s", currentWeapon.name), 10, 40, 20, DARKGRAY);
            DrawText(TextFormat("Fire Rate: %.1f/s", 1.0f/currentWeapon.fire_rate), 10, 70, 20, DARKGRAY);
            DrawText(TextFormat("Damage: %d", currentWeapon.damage), 10, 100, 20, DARKGRAY);
            
            // Draw cannons
            for (int i = 0; i < cannonCount; i++) {
                Vector2 basePos = { playerTank.bounds.x + playerTank.bounds.width/2, playerTank.bounds.y + playerTank.bounds.height/2 };
                Vector2 tipPos = {
                    basePos.x + cos(DEG2RAD*cannons[i].angle) * cannons[i].length,
                    basePos.y + sin(DEG2RAD*cannons[i].angle) * cannons[i].length
                };
                DrawLineEx(basePos, tipPos, 5, cannons[i].color);
            }
            
            DrawText("ARROW KEYS: Move | A/D: Aim | SPACE: Fire | Q/E: Switch Weapons", 10, 10, 20, DARKGRAY);

        EndDrawing();
        //----------------------------------------------------------------------------------
    }

    // De-Initialization
    //--------------------------------------------------------------------------------------
    CloseWindow();        // Close window and OpenGL context
    //--------------------------------------------------------------------------------------

    return 0;
}
