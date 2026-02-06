#include "crafting.h"
#include "parts.h"
#include "tank.h"
#include "game.h"
#include <string.h>
#include <stdio.h>

#define PANEL_WIDTH      300
#define SLOT_BUTTON_SIZE 60
#define PART_LIST_HEIGHT 400

typedef enum {
    CRAFT_MODE_SLOTS,      /* Selecting a slot to modify */
    CRAFT_MODE_PARTS,      /* Choosing a part for selected slot */
    CRAFT_MODE_UPGRADE     /* Upgrading a part */
} CraftMode;

typedef struct {
    bool is_open;
    Tank *tank;
    CraftMode mode;
    PartSlot selected_slot;
    int selected_part_index;
    int scroll_offset;
    float preview_rotation;
} CraftingState;

static CraftingState s_state = {0};

void crafting_init(void)
{
    memset(&s_state, 0, sizeof(s_state));
}

void crafting_open(Tank *tank)
{
    s_state.is_open = true;
    s_state.tank = tank;
    s_state.mode = CRAFT_MODE_SLOTS;
    s_state.selected_slot = SLOT_FRONT;
    s_state.selected_part_index = -1;
    s_state.scroll_offset = 0;
    s_state.preview_rotation = 0.0f;
}

void crafting_close(void)
{
    s_state.is_open = false;
    s_state.tank = NULL;
}

bool crafting_is_open(void)
{
    return s_state.is_open;
}

Tank *crafting_get_tank(void)
{
    return s_state.tank;
}

static Rectangle get_panel_rect(void)
{
    int screen_w = GetScreenWidth();
    int screen_h = GetScreenHeight();
    return (Rectangle){
        screen_w - PANEL_WIDTH - 20,
        20,
        PANEL_WIDTH,
        screen_h - 40
    };
}

static Rectangle get_slot_button_rect(PartSlot slot)
{
    Rectangle panel = get_panel_rect();
    float cx = panel.x + panel.width * 0.5f;
    float cy = panel.y + 150.0f;
    float offset = 70.0f;
    
    Vector2 pos;
    switch (slot) {
        case SLOT_FRONT: pos = (Vector2){cx + offset, cy}; break;
        case SLOT_BACK:  pos = (Vector2){cx - offset, cy}; break;
        case SLOT_LEFT:  pos = (Vector2){cx, cy - offset}; break;
        case SLOT_RIGHT: pos = (Vector2){cx, cy + offset}; break;
        case SLOT_TOP:   pos = (Vector2){cx, cy}; break;
        default:         pos = (Vector2){cx, cy}; break;
    }
    
    return (Rectangle){
        pos.x - SLOT_BUTTON_SIZE * 0.5f,
        pos.y - SLOT_BUTTON_SIZE * 0.5f,
        SLOT_BUTTON_SIZE,
        SLOT_BUTTON_SIZE
    };
}

static const char *slot_name(PartSlot slot)
{
    switch (slot) {
        case SLOT_FRONT: return "Front";
        case SLOT_BACK:  return "Back";
        case SLOT_LEFT:  return "Left";
        case SLOT_RIGHT: return "Right";
        case SLOT_TOP:   return "Top";
        default:         return "?";
    }
}

static Part *get_part_in_slot(Tank *tank, PartSlot slot)
{
    for (int i = 0; i < tank->part_count; i++) {
        if (tank->parts[i].slot == slot) {
            return &tank->parts[i];
        }
    }
    return NULL;
}

void crafting_update(float dt)
{
    if (!s_state.is_open || !s_state.tank) {
        return;
    }
    
    s_state.preview_rotation += 30.0f * dt;
    
    Vector2 mouse = GetMousePosition();
    bool clicked = IsMouseButtonPressed(MOUSE_LEFT_BUTTON);
    
    /* Handle ESC to go back or close */
    if (IsKeyPressed(KEY_ESCAPE) || IsKeyPressed(KEY_TAB)) {
        if (s_state.mode == CRAFT_MODE_SLOTS) {
            crafting_close();
        } else {
            s_state.mode = CRAFT_MODE_SLOTS;
        }
        return;
    }
    
    Rectangle panel = get_panel_rect();
    
    if (s_state.mode == CRAFT_MODE_SLOTS) {
        /* Check slot button clicks */
        for (int i = 0; i < SLOT_COUNT; i++) {
            Rectangle btn = get_slot_button_rect((PartSlot)i);
            if (CheckCollisionPointRec(mouse, btn) && clicked) {
                s_state.selected_slot = (PartSlot)i;
                s_state.mode = CRAFT_MODE_PARTS;
                s_state.scroll_offset = 0;
                break;
            }
        }
    } 
    else if (s_state.mode == CRAFT_MODE_PARTS) {
        /* Part list area */
        float list_y = panel.y + 250;
        float item_height = 50;
        int part_count = parts_get_count();
        
        /* Add "Remove Part" option at index -1 */
        Part *existing = get_part_in_slot(s_state.tank, s_state.selected_slot);
        int start_index = existing ? -1 : 0;
        
        for (int i = start_index; i < part_count; i++) {
            float y = list_y + (i - start_index) * item_height - s_state.scroll_offset;
            
            if (y < panel.y + 240 || y > panel.y + panel.height - 60) {
                continue;
            }
            
            Rectangle item_rect = {panel.x + 10, y, panel.width - 20, item_height - 5};
            
            if (CheckCollisionPointRec(mouse, item_rect) && clicked) {
                if (i == -1) {
                    /* Remove existing part */
                    tank_remove_part(s_state.tank, s_state.selected_slot);
                } else {
                    /* Remove old part if exists, add new */
                    tank_remove_part(s_state.tank, s_state.selected_slot);
                    Part new_part = parts_create(i, s_state.selected_slot);
                    tank_attach_part(s_state.tank, new_part);
                }
                s_state.mode = CRAFT_MODE_SLOTS;
                break;
            }
        }
        
        /* Scroll with mouse wheel */
        float wheel = GetMouseWheelMove();
        s_state.scroll_offset -= (int)(wheel * 30);
        if (s_state.scroll_offset < 0) {
            s_state.scroll_offset = 0;
        }
    }
}

static void draw_slot_buttons(void)
{
    for (int i = 0; i < SLOT_COUNT; i++) {
        PartSlot slot = (PartSlot)i;
        Rectangle btn = get_slot_button_rect(slot);
        
        Part *part = get_part_in_slot(s_state.tank, slot);
        Color bg_color = part ? DARKGREEN : DARKGRAY;
        
        if (slot == s_state.selected_slot && s_state.mode != CRAFT_MODE_SLOTS) {
            bg_color = SKYBLUE;
        }
        
        Vector2 mouse = GetMousePosition();
        if (CheckCollisionPointRec(mouse, btn)) {
            bg_color = ColorBrightness(bg_color, 0.3f);
        }
        
        DrawRectangleRec(btn, bg_color);
        DrawRectangleLinesEx(btn, 2, WHITE);
        
        /* Draw slot label */
        const char *label = slot_name(slot);
        int font_size = (int)(12.0f * game_get_ui_scale() + 0.5f);
        Font font = game_get_ui_font();
        Vector2 label_size = MeasureTextEx(font, label, (float)font_size, 1.0f);
        DrawTextEx(font, label,
            (Vector2){
                btn.x + btn.width * 0.5f - label_size.x * 0.5f,
                btn.y + btn.height * 0.5f - label_size.y * 0.5f
            },
            (float)font_size, 1.0f, WHITE);
        
        /* Show part name if equipped */
        if (part) {
            const PartDef *def = parts_get_def(part->def_id);
            if (def) {
                int name_size = (int)(10.0f * game_get_ui_scale() + 0.5f);
                Vector2 name_dims = MeasureTextEx(font, def->name, (float)name_size, 1.0f);
                DrawTextEx(font, def->name,
                    (Vector2){
                        btn.x + btn.width * 0.5f - name_dims.x * 0.5f,
                        btn.y + btn.height + 2
                    },
                    (float)name_size, 1.0f, LIGHTGRAY);
            }
        }
    }
}

static void draw_parts_list(void)
{
    Rectangle panel = get_panel_rect();
    float list_y = panel.y + 250;
    float item_height = 50;
    int part_count = parts_get_count();
    
    /* Header */
    Font font = game_get_ui_font();
    int header_size = (int)(16.0f * game_get_ui_scale() + 0.5f);
    DrawTextEx(font, "Select Part:", (Vector2){panel.x + 10, panel.y + 220},
        (float)header_size, 1.0f, WHITE);
    
    /* Draw list background */
    Rectangle list_bg = {panel.x + 5, list_y - 5, panel.width - 10, panel.height - 270};
    DrawRectangleRec(list_bg, (Color){20, 20, 30, 200});
    
    Vector2 mouse = GetMousePosition();
    
    /* Check if part exists in slot (to show remove option) */
    Part *existing = get_part_in_slot(s_state.tank, s_state.selected_slot);
    int start_index = existing ? -1 : 0;
    
    BeginScissorMode((int)list_bg.x, (int)list_bg.y, 
        (int)list_bg.width, (int)list_bg.height);
    
    for (int i = start_index; i < part_count; i++) {
        float y = list_y + (i - start_index) * item_height - s_state.scroll_offset;
        
        Rectangle item_rect = {panel.x + 10, y, panel.width - 20, item_height - 5};
        
        bool hovered = CheckCollisionPointRec(mouse, item_rect);
        Color item_bg = hovered ? (Color){60, 60, 80, 255} : (Color){40, 40, 50, 255};
        DrawRectangleRec(item_rect, item_bg);
        
        if (i == -1) {
            /* Remove option */
            int remove_size = (int)(14.0f * game_get_ui_scale() + 0.5f);
            int sub_size = (int)(12.0f * game_get_ui_scale() + 0.5f);
            DrawTextEx(font, "[ Remove Part ]", (Vector2){item_rect.x + 10, item_rect.y + 8},
                (float)remove_size, 1.0f, RED);
            DrawTextEx(font, "Clear this slot", (Vector2){item_rect.x + 10, item_rect.y + 26},
                (float)sub_size, 1.0f, GRAY);
        } else {
            const PartDef *def = parts_get_def(i);
            if (def) {
                /* Part color indicator */
                DrawRectangle((int)item_rect.x, (int)item_rect.y, 
                    4, (int)item_rect.height, def->color);
                
                /* Part name */
                int name_size = (int)(14.0f * game_get_ui_scale() + 0.5f);
                DrawTextEx(font, def->name, (Vector2){item_rect.x + 10, item_rect.y + 8},
                    (float)name_size, 1.0f, WHITE);

                /* Part type */
                int type_size = (int)(12.0f * game_get_ui_scale() + 0.5f);
                DrawTextEx(font, parts_type_name(def->type),
                    (Vector2){item_rect.x + 10, item_rect.y + 26},
                    (float)type_size, 1.0f, GRAY);
                
                /* Quick stats */
                char stats[64];
                if (def->stat_bonus.damage > 0) {
                    snprintf(stats, sizeof(stats), "DMG: %.0f", def->stat_bonus.damage);
                } else if (def->stat_bonus.max_health > 0) {
                    snprintf(stats, sizeof(stats), "HP: +%.0f", def->stat_bonus.max_health);
                } else if (def->stat_bonus.move_speed > 0) {
                    snprintf(stats, sizeof(stats), "SPD: +%.0f", def->stat_bonus.move_speed);
                } else {
                    stats[0] = '\0';
                }
                
                int stats_size = (int)(12.0f * game_get_ui_scale() + 0.5f);
                Vector2 stats_dims = MeasureTextEx(font, stats, (float)stats_size, 1.0f);
                DrawTextEx(font, stats,
                    (Vector2){
                        item_rect.x + item_rect.width - stats_dims.x - 10,
                        item_rect.y + 18
                    },
                    (float)stats_size, 1.0f, LIME);
            }
        }
    }
    
    EndScissorMode();
}

void crafting_draw(void)
{
    if (!s_state.is_open || !s_state.tank) {
        return;
    }
    
    /* Dim the background */
    DrawRectangle(0, 0, GetScreenWidth(), GetScreenHeight(), (Color){0, 0, 0, 100});
    
    /* Main panel */
    Rectangle panel = get_panel_rect();
    DrawRectangleRec(panel, (Color){30, 30, 40, 240});
    DrawRectangleLinesEx(panel, 2, (Color){100, 100, 120, 255});
    
    /* Title */
    const char *title = "CUSTOMIZE TANK";
    int title_w = MeasureText(title, 20);
    Font font = game_get_ui_font();
    int title_size = (int)(20.0f * game_get_ui_scale() + 0.5f);
    Vector2 title_dims = MeasureTextEx(font, title, (float)title_size, 1.0f);
    DrawTextEx(font, title,
        (Vector2){panel.x + panel.width * 0.5f - title_dims.x * 0.5f, panel.y + 15},
        (float)title_size, 1.0f, WHITE);
    
    /* Mode-specific content */
    if (s_state.mode == CRAFT_MODE_SLOTS || s_state.mode == CRAFT_MODE_PARTS) {
        draw_slot_buttons();
    }
    
    if (s_state.mode == CRAFT_MODE_PARTS) {
        /* Show which slot we're editing */
        char slot_text[64];
        snprintf(slot_text, sizeof(slot_text), "Editing: %s Slot", 
            slot_name(s_state.selected_slot));
        int slot_size = (int)(14.0f * game_get_ui_scale() + 0.5f);
        DrawTextEx(font, slot_text, (Vector2){panel.x + 10, panel.y + 200},
            (float)slot_size, 1.0f, YELLOW);
        
        draw_parts_list();
    }
    
    /* Stats display at bottom */
    float stats_y = panel.y + panel.height - 120;
    DrawLine((int)panel.x + 10, (int)stats_y - 10, 
        (int)(panel.x + panel.width - 10), (int)stats_y - 10, GRAY);
    
    int stats_title_size = (int)(14.0f * game_get_ui_scale() + 0.5f);
    DrawTextEx(font, "STATS", (Vector2){panel.x + 10, stats_y},
        (float)stats_title_size, 1.0f, WHITE);
    
    Stats *s = &s_state.tank->current_stats;
    char stat_buf[128];
    
    snprintf(stat_buf, sizeof(stat_buf), "Health: %.0f", s->max_health);
    int stats_size = (int)(12.0f * game_get_ui_scale() + 0.5f);
    DrawTextEx(font, stat_buf, (Vector2){panel.x + 10, stats_y + 20},
        (float)stats_size, 1.0f, LIGHTGRAY);
    
    snprintf(stat_buf, sizeof(stat_buf), "Speed: %.0f", s->move_speed);
    DrawTextEx(font, stat_buf, (Vector2){panel.x + 10, stats_y + 35},
        (float)stats_size, 1.0f, LIGHTGRAY);
    
    snprintf(stat_buf, sizeof(stat_buf), "Damage: %.0f", s->damage);
    DrawTextEx(font, stat_buf, (Vector2){panel.x + 150, stats_y + 20},
        (float)stats_size, 1.0f, LIGHTGRAY);
    
    snprintf(stat_buf, sizeof(stat_buf), "Reload: %.1f/s", s->reload_speed);
    DrawTextEx(font, stat_buf, (Vector2){panel.x + 150, stats_y + 35},
        (float)stats_size, 1.0f, LIGHTGRAY);
    
    /* Instructions */
    const char *hint = s_state.mode == CRAFT_MODE_SLOTS 
        ? "Click a slot to modify" 
        : "ESC to go back";
    int hint_size = (int)(12.0f * game_get_ui_scale() + 0.5f);
    Vector2 hint_dims = MeasureTextEx(font, hint, (float)hint_size, 1.0f);
    DrawTextEx(font, hint,
        (Vector2){panel.x + panel.width * 0.5f - hint_dims.x * 0.5f,
            panel.y + panel.height - 25},
        (float)hint_size, 1.0f, GRAY);
}
