#ifndef PARTS_H
#define PARTS_H

#include "types.h"

/*
 * Part system - definitions and factory functions for tank parts.
 * Parts are the core of the crafting system.
 */

/* Initialize the parts registry with all available part definitions */
void parts_init(void);

/* Get a part definition by ID */
const PartDef *parts_get_def(int def_id);

/* Get the number of registered part definitions */
int parts_get_count(void);

/* Create a new part instance from a definition */
Part parts_create(int def_id, PartSlot slot);

/* Calculate the stat bonus from a part (considering rarity and upgrades) */
Stats parts_calc_bonus(const Part *part);

/* Get display name for a part type */
const char *parts_type_name(PartType type);

/* Get color associated with rarity */
Color parts_rarity_color(Rarity rarity);

#endif /* PARTS_H */
