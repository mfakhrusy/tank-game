/*******************************************************************************************
 *
 *   Tank Game - A 2D tank crafting/building game
 *
 *   Built with raylib
 *
 *******************************************************************************************/

#include "raylib.h"
#include "game.h"

#if defined(PLATFORM_WEB)
    #include <emscripten/emscripten.h>
#endif

static const int SCREEN_WIDTH = 800;
static const int SCREEN_HEIGHT = 600;

static void update_draw_frame(void)
{
    float dt = GetFrameTime();
    
    game_update(dt);
    
    BeginDrawing();
    game_draw();
    EndDrawing();
}

int main(void)
{
#if defined(PLATFORM_WEB)
    /* Web: get actual canvas size from browser */
    SetConfigFlags(FLAG_WINDOW_RESIZABLE);
    InitWindow(SCREEN_WIDTH, SCREEN_HEIGHT, "Tank Game");
#else
    /* Desktop: enable HiDPI support */
    SetConfigFlags(FLAG_WINDOW_RESIZABLE | FLAG_WINDOW_HIGHDPI);
    InitWindow(SCREEN_WIDTH, SCREEN_HEIGHT, "Tank Game");
    SetWindowMinSize(640, 480);
#endif

    game_init();

#if defined(PLATFORM_WEB)
    emscripten_set_main_loop(update_draw_frame, 0, 1);
#else
    SetTargetFPS(60);
    
    while (!WindowShouldClose()) {
        update_draw_frame();
    }
    
    game_shutdown();
#endif

    CloseWindow();
    return 0;
}
