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

int main(void) {
	const int screenWidth = 800;
	const int screenHeight = 450;

	InitWindow(screenWidth, screenHeight, "Tank Game");

	SetTargetFPS(60);

	Vector2 playerPos = {0, 0};
	int score = 0;

	int tankSize = 80;
	int tankXSize = tankSize;
	int tankYSize = tankSize;
	int cannonXSize = 20;
	int cannonYSize = 100;

	Vector2 mousePosition = GetMousePosition();

	// rotation in degrees
	float rot = 0.0f;

	float tankFrontDegree = 0;

	while (!WindowShouldClose()) {
		// playerPos.x += 2;

		if (IsKeyDown(KEY_LEFT)) {
			playerPos.x -= 5;
		}

		if (IsKeyDown(KEY_RIGHT)) {
			playerPos.x += 5;
		}

		if (IsKeyDown(KEY_DOWN)) {
			playerPos.y += 5;
		}

		if (IsKeyDown(KEY_UP)) {
			playerPos.y -= 5;
		}

		// float diffInX = playerPos.x - mousePosition.x;
		// float diffInY = playerPos.y - mousePosition.y;
		// float diffDegress = atan2f(diffInY, diffInX) * RAD2DEG;

		Vector2 cannonBase = { playerPos.x, playerPos.y };
		float angleToMouse = atan2f(mousePosition.y - cannonBase.y, mousePosition.x - cannonBase.x) * RAD2DEG;

		// printf("diff in X: %f\n", diffInX);
		// printf("diff in Y: %f\n", diffInY);
		// printf("diff in deg: %f\n", diffDegress);

		// rot += 10 * GetFrameTime();

		mousePosition = GetMousePosition();

		// printf("mousePosition X: %f\n", mousePosition.x);
		// printf("mousePosition Y: %f\n", mousePosition.y);

		BeginDrawing();
			ClearBackground(RAYWHITE);

			// DrawRectangle(playerPos.x, playerPos.y, tankXSize, tankYSize, MAROON);
			// DrawRectangle(playerPos.x + (tankXSize/2 - cannonXSize/2), playerPos.y + tankYSize, cannonXSize, tankYSize, GREEN);
			// DrawRectanglePro((Rectangle){playerPos.x + (tankXSize/2 - cannonXSize/2), playerPos.y + tankYSize, cannonXSize, tankYSize}, (Vector2){tankSize/2, tankSize/2}, angleToMouse, GREEN);
			DrawRectanglePro((Rectangle){playerPos.x, playerPos.y, tankXSize, tankYSize}, (Vector2){tankSize/2, tankSize/2}, 0, MAROON);
			DrawRectanglePro(
    			(Rectangle){ cannonBase.x, cannonBase.y, cannonXSize, cannonYSize },
    			(Vector2){ cannonXSize / 2, tankYSize / 2 },
    			angleToMouse,
    			GREEN
			);


			// DrawLineV(playerPos, mousePosition, LIGHTGRAY);

		EndDrawing();
	}

	CloseWindow();

	return 0;
}
