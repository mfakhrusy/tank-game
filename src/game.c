#include "game.h"
#include "tank.h"
#include "parts.h"
#include "crafting.h"
#include <math.h>
#include <stdio.h>

static GameScene s_current_scene = SCENE_GAME;
static Camera2D s_camera = {0};
static Font s_ui_font = {0};

static int scale_ui_size(int base_size)
{
    float scale = game_get_ui_scale();
    int scaled = (int)((float)base_size * scale + 0.5f);
    return scaled < base_size ? base_size : scaled;
}

/* Grid drawing for the game area */
static void draw_grid(void)
{
    int grid_size = 50;
    Color grid_color = (Color){200, 200, 200, 50};
    
    /* Calculate visible area */
    Vector2 screen_min = GetScreenToWorld2D((Vector2){0, 0}, s_camera);
    Vector2 screen_max = GetScreenToWorld2D(
        (Vector2){(float)GetScreenWidth(), (float)GetScreenHeight()}, s_camera);
    
    int start_x = ((int)screen_min.x / grid_size - 1) * grid_size;
    int end_x = ((int)screen_max.x / grid_size + 1) * grid_size;
    int start_y = ((int)screen_min.y / grid_size - 1) * grid_size;
    int end_y = ((int)screen_max.y / grid_size + 1) * grid_size;
    
    for (int x = start_x; x <= end_x; x += grid_size) {
        DrawLine(x, start_y, x, end_y, grid_color);
    }
    for (int y = start_y; y <= end_y; y += grid_size) {
        DrawLine(start_x, y, end_x, y, grid_color);
    }
}

void game_init(void)
{
    /* Initialize subsystems */
    parts_init();
    tank_system_init();
    crafting_init();

    s_ui_font = LoadFontEx("resources/fonts/anonymous_pro_bold.ttf", 48, NULL, 0);
    if (s_ui_font.texture.id == 0) {
        s_ui_font = GetFontDefault();
    }
    
    /* Create player tank at center */
    Tank *player = tank_create((Vector2){0, 0}, true);
    
    /* Give player a starting cannon */
    if (player) {
        Part cannon = parts_create(0, SLOT_FRONT);  /* Basic Cannon */
        tank_attach_part(player, cannon);
    }
    
    /* Setup camera */
    s_camera.target = (Vector2){0, 0};
    s_camera.offset = (Vector2){
        GetScreenWidth() * 0.5f,
        GetScreenHeight() * 0.5f
    };
    s_camera.rotation = 0.0f;
    s_camera.zoom = 1.0f;
    
    s_current_scene = SCENE_GAME;
}

void game_shutdown(void)
{
    if (s_ui_font.texture.id != 0 && s_ui_font.texture.id != GetFontDefault().texture.id) {
        UnloadFont(s_ui_font);
    }
}

static InputState get_input(void)
{
    InputState input = {0};
    
    /* Movement */
    if (IsKeyDown(KEY_W) || IsKeyDown(KEY_UP))    input.move_dir.y = -1;
    if (IsKeyDown(KEY_S) || IsKeyDown(KEY_DOWN))  input.move_dir.y = 1;
    if (IsKeyDown(KEY_A) || IsKeyDown(KEY_LEFT))  input.move_dir.x = -1;
    if (IsKeyDown(KEY_D) || IsKeyDown(KEY_RIGHT)) input.move_dir.x = 1;
    
    /* Normalize diagonal movement */
    float len = sqrtf(input.move_dir.x * input.move_dir.x + 
                      input.move_dir.y * input.move_dir.y);
    if (len > 0) {
        input.move_dir.x /= len;
        input.move_dir.y /= len;
    }
    
    /* Aim position (convert screen to world) */
    input.aim_pos = GetScreenToWorld2D(GetMousePosition(), s_camera);
    
    /* Actions */
    input.fire = IsMouseButtonDown(MOUSE_LEFT_BUTTON);
    input.use_ability = IsMouseButtonPressed(MOUSE_RIGHT_BUTTON);
    input.open_crafting = IsKeyPressed(KEY_TAB) || IsKeyPressed(KEY_E);
    
    return input;
}

void game_update(float dt)
{
    InputState input = get_input();
    
    /* Toggle crafting UI */
    if (input.open_crafting && !crafting_is_open()) {
        Tank *player = tank_get_player();
        if (player) {
            crafting_open(player);
        }
    }
    
    /* Update crafting if open */
    if (crafting_is_open()) {
        crafting_update(dt);
        return;  /* Don't update game while crafting */
    }
    
    /* Update player tank */
    Tank *player = tank_get_player();
    if (player) {
        tank_update(player, input, dt);
        
        /* Update camera to follow player */
        s_camera.target = player->position;
        s_camera.offset = (Vector2){
            GetScreenWidth() * 0.5f,
            GetScreenHeight() * 0.5f
        };
    }
    
    /* Update all other tanks (enemies/AI) - placeholder for now */
    int tank_count;
    Tank *tanks = tank_get_all(&tank_count);
    for (int i = 0; i < tank_count; i++) {
        if (tanks[i].active && !tanks[i].is_player) {
            InputState ai_input = {0};  /* AI logic would go here */
            tank_update(&tanks[i], ai_input, dt);
        }
    }
}

void game_draw(void)
{
    ClearBackground((Color){240, 240, 245, 255});
    
    /* World-space drawing */
    BeginMode2D(s_camera);
    
    draw_grid();
    
    /* Draw all tanks */
    int tank_count;
    Tank *tanks = tank_get_all(&tank_count);
    for (int i = 0; i < tank_count; i++) {
        if (tanks[i].active) {
            tank_draw(&tanks[i]);
        }
    }
    
    EndMode2D();
    
    /* Screen-space UI */
    if (crafting_is_open()) {
        crafting_draw();
    } else {
        /* HUD when not crafting */
        Font font = game_get_ui_font();
        int title_size = scale_ui_size(16);
        int hint_size = scale_ui_size(14);
        DrawTextEx(font, "TAB or E: Customize Tank", (Vector2){10, 10},
            (float)title_size, 1.0f, DARKGRAY);
        DrawTextEx(font, "WASD: Move | Mouse: Aim", (Vector2){10, 10 + title_size + 4},
            (float)hint_size, 1.0f, GRAY);
        
        /* Show current stats */
        Tank *player = tank_get_player();
        if (player) {
            char buf[64];
            snprintf(buf, sizeof(buf), "Parts: %d", player->part_count);
            DrawTextEx(font, buf, (Vector2){10, (float)GetScreenHeight() - hint_size - 10},
                (float)hint_size, 1.0f, DARKGRAY);
        }
    }
}

Font game_get_ui_font(void)
{
    return s_ui_font;
}

float game_get_ui_scale(void)
{
    const float base_w = 1920.0f;
    const float base_h = 1080.0f;
    float scale_w = (float)GetScreenWidth() / base_w;
    float scale_h = (float)GetScreenHeight() / base_h;
    float scale = fminf(scale_w, scale_h);
    if (scale < 1.0f) {
        return 1.0f;
    }
    if (scale > 1.5f) {
        return 1.5f;
    }
    return scale;
}

GameScene game_get_scene(void)
{
    return s_current_scene;
}

void game_set_scene(GameScene scene)
{
    s_current_scene = scene;
}
