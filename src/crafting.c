#include "crafting.h"
#include "parts.h"
#include "tank.h"
#include "game.h"
#include <string.h>
#include <stdio.h>

typedef struct {
    Rectangle panel;
    float slot_button_size;
    float slot_center_y;
    float slot_offset;
    float slot_name_offset_y;
    float list_header_y;
    float list_y;
    float list_item_height;
    float list_item_gap;
    float list_side_pad;
    float list_bg_pad;
    Rectangle list_bg;
    float list_clip_top;
    float list_clip_bottom;
    float stats_y;
    float stats_line_offset;
    float stats_row1_offset;
    float stats_row2_offset;
    float stats_right_column_offset;
    float title_y;
    float edit_label_y;
    float hint_y;
} CraftingLayout;

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
    float scale = game_get_ui_scale();
    float panel_margin = 20.0f * scale;
    float panel_width = 300.0f * scale;
    float max_panel_width = screen_w * 0.45f;
    if (panel_width > max_panel_width) {
        panel_width = max_panel_width;
    }
    return (Rectangle){
        screen_w - panel_width - panel_margin,
        panel_margin,
        panel_width,
        screen_h - panel_margin * 2.0f
    };
}

static CraftingLayout get_layout(void)
{
    float scale = game_get_ui_scale();
    CraftingLayout layout = {0};

    layout.panel = get_panel_rect();
    layout.slot_button_size = 60.0f * scale;
    layout.slot_center_y = layout.panel.y + 150.0f * scale;
    layout.slot_offset = 70.0f * scale;
    layout.slot_name_offset_y = 2.0f * scale;
    layout.list_header_y = layout.panel.y + 220.0f * scale;
    layout.list_y = layout.panel.y + 250.0f * scale;
    layout.list_item_height = 50.0f * scale;
    layout.list_item_gap = 5.0f * scale;
    layout.list_side_pad = 10.0f * scale;
    layout.list_bg_pad = 5.0f * scale;

    float list_bottom_pad = 25.0f * scale;
    layout.list_bg = (Rectangle){
        layout.panel.x + layout.list_bg_pad,
        layout.list_y - layout.list_bg_pad,
        layout.panel.width - layout.list_bg_pad * 2.0f,
        layout.panel.height - (layout.list_y - layout.panel.y) - list_bottom_pad
    };
    layout.list_clip_top = layout.list_y - 10.0f * scale;
    layout.list_clip_bottom = layout.panel.y + layout.panel.height - 60.0f * scale;

    layout.stats_y = layout.panel.y + layout.panel.height - 120.0f * scale;
    layout.stats_line_offset = 10.0f * scale;
    layout.stats_row1_offset = 20.0f * scale;
    layout.stats_row2_offset = 35.0f * scale;
    layout.stats_right_column_offset = 150.0f * scale;
    layout.title_y = layout.panel.y + 15.0f * scale;
    layout.edit_label_y = layout.panel.y + 200.0f * scale;
    layout.hint_y = layout.panel.y + layout.panel.height - 25.0f * scale;

    return layout;
}

static Rectangle get_slot_button_rect(PartSlot slot)
{
    CraftingLayout layout = get_layout();
    float cx = layout.panel.x + layout.panel.width * 0.5f;
    float cy = layout.slot_center_y;
    float offset = layout.slot_offset;
    
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
        pos.x - layout.slot_button_size * 0.5f,
        pos.y - layout.slot_button_size * 0.5f,
        layout.slot_button_size,
        layout.slot_button_size
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
    
    CraftingLayout layout = get_layout();
    Rectangle panel = layout.panel;
    
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
        float list_y = layout.list_y;
        float item_height = layout.list_item_height;
        float item_gap = layout.list_item_gap;
        float list_side_pad = layout.list_side_pad;
        int part_count = parts_get_count();
        
        /* Add "Remove Part" option at index -1 */
        Part *existing = get_part_in_slot(s_state.tank, s_state.selected_slot);
        int start_index = existing ? -1 : 0;
        
        for (int i = start_index; i < part_count; i++) {
            float y = list_y + (i - start_index) * item_height - s_state.scroll_offset;
            
            if (y < layout.list_clip_top || y > layout.list_clip_bottom) {
                continue;
            }

            Rectangle item_rect = {
                panel.x + list_side_pad,
                y,
                panel.width - list_side_pad * 2.0f,
                item_height - item_gap
            };
            
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
        s_state.scroll_offset -= (int)(wheel * (30.0f * game_get_ui_scale()));
        if (s_state.scroll_offset < 0) {
            s_state.scroll_offset = 0;
        }
    }
}

static void draw_slot_buttons(void)
{
    CraftingLayout layout = get_layout();

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
                        btn.y + btn.height + layout.slot_name_offset_y
                    },
                    (float)name_size, 1.0f, LIGHTGRAY);
            }
        }
    }
}

static void draw_parts_list(void)
{
    CraftingLayout layout = get_layout();
    Rectangle panel = layout.panel;
    float list_y = layout.list_y;
    float item_height = layout.list_item_height;
    float item_gap = layout.list_item_gap;
    float list_side_pad = layout.list_side_pad;
    int part_count = parts_get_count();
    
    /* Header */
    Font font = game_get_ui_font();
    int header_size = (int)(16.0f * game_get_ui_scale() + 0.5f);
    DrawTextEx(font, "Select Part:", (Vector2){panel.x + list_side_pad, layout.list_header_y},
        (float)header_size, 1.0f, WHITE);

    /* Draw list background */
    DrawRectangleRec(layout.list_bg, (Color){20, 20, 30, 200});
    
    Vector2 mouse = GetMousePosition();
    
    /* Check if part exists in slot (to show remove option) */
    Part *existing = get_part_in_slot(s_state.tank, s_state.selected_slot);
    int start_index = existing ? -1 : 0;
    
    BeginScissorMode((int)layout.list_bg.x, (int)layout.list_bg.y,
        (int)layout.list_bg.width, (int)layout.list_bg.height);
    
    for (int i = start_index; i < part_count; i++) {
        float y = list_y + (i - start_index) * item_height - s_state.scroll_offset;
        
        Rectangle item_rect = {
            panel.x + list_side_pad,
            y,
            panel.width - list_side_pad * 2.0f,
            item_height - item_gap
        };
        
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

    CraftingLayout layout = get_layout();
    
    /* Dim the background */
    DrawRectangle(0, 0, GetScreenWidth(), GetScreenHeight(), (Color){0, 0, 0, 100});
    
    /* Main panel */
    Rectangle panel = layout.panel;
    DrawRectangleRec(panel, (Color){30, 30, 40, 240});
    DrawRectangleLinesEx(panel, 2, (Color){100, 100, 120, 255});
    
    /* Title */
    const char *title = "CUSTOMIZE TANK";
    Font font = game_get_ui_font();
    int title_size = (int)(20.0f * game_get_ui_scale() + 0.5f);
    Vector2 title_dims = MeasureTextEx(font, title, (float)title_size, 1.0f);
    DrawTextEx(font, title,
        (Vector2){panel.x + panel.width * 0.5f - title_dims.x * 0.5f, layout.title_y},
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
        DrawTextEx(font, slot_text, (Vector2){panel.x + layout.list_side_pad, layout.edit_label_y},
            (float)slot_size, 1.0f, YELLOW);
        
        draw_parts_list();
    }
    
    /* Stats display at bottom */
    float stats_y = layout.stats_y;
    DrawLine((int)panel.x + (int)layout.list_side_pad, (int)stats_y - (int)layout.stats_line_offset,
        (int)(panel.x + panel.width - layout.list_side_pad),
        (int)stats_y - (int)layout.stats_line_offset, GRAY);
    
    int stats_title_size = (int)(14.0f * game_get_ui_scale() + 0.5f);
    DrawTextEx(font, "STATS", (Vector2){panel.x + layout.list_side_pad, stats_y},
        (float)stats_title_size, 1.0f, WHITE);
    
    Stats *s = &s_state.tank->current_stats;
    char stat_buf[128];
    
    snprintf(stat_buf, sizeof(stat_buf), "Health: %.0f", s->max_health);
    int stats_size = (int)(12.0f * game_get_ui_scale() + 0.5f);
    DrawTextEx(font, stat_buf,
        (Vector2){panel.x + layout.list_side_pad, stats_y + layout.stats_row1_offset},
        (float)stats_size, 1.0f, LIGHTGRAY);
    
    snprintf(stat_buf, sizeof(stat_buf), "Speed: %.0f", s->move_speed);
    DrawTextEx(font, stat_buf,
        (Vector2){panel.x + layout.list_side_pad, stats_y + layout.stats_row2_offset},
        (float)stats_size, 1.0f, LIGHTGRAY);
    
    snprintf(stat_buf, sizeof(stat_buf), "Damage: %.0f", s->damage);
    DrawTextEx(font, stat_buf,
        (Vector2){panel.x + layout.stats_right_column_offset, stats_y + layout.stats_row1_offset},
        (float)stats_size, 1.0f, LIGHTGRAY);
    
    snprintf(stat_buf, sizeof(stat_buf), "Reload: %.1f/s", s->reload_speed);
    DrawTextEx(font, stat_buf,
        (Vector2){panel.x + layout.stats_right_column_offset, stats_y + layout.stats_row2_offset},
        (float)stats_size, 1.0f, LIGHTGRAY);
    
    /* Instructions */
    const char *hint = s_state.mode == CRAFT_MODE_SLOTS 
        ? "Click a slot to modify" 
        : "ESC to go back";
    int hint_size = (int)(12.0f * game_get_ui_scale() + 0.5f);
    Vector2 hint_dims = MeasureTextEx(font, hint, (float)hint_size, 1.0f);
    DrawTextEx(font, hint,
        (Vector2){panel.x + panel.width * 0.5f - hint_dims.x * 0.5f,
            layout.hint_y},
        (float)hint_size, 1.0f, GRAY);
}
