export const BLOCK_LEVELS = [
  { level: 1, health: 28, contactDamage: 6, label: 'Soft' },
  { level: 2, health: 52, contactDamage: 12, label: 'Sturdy' },
  { level: 3, health: 85, contactDamage: 21, label: 'Strong' },
] as const;

export const REPAIR_INTERVAL_MS = 5_000;
export const REPAIR_GRACE_MS = 3_000;

export function repairAmount(maximumHealth: number): number {
  return Math.max(4, Math.round(Math.max(0, maximumHealth) * .08));
}

export function repairedHealth(currentHealth: number, maximumHealth: number, amount: number): number {
  return Math.min(maximumHealth, Math.max(0, currentHealth) + Math.max(0, amount));
}

export function canAutoRepair(time: number, lastDamageAt: number, lastRepairAt: number, health: number, maximumHealth: number): boolean {
  return health > 0
    && health < maximumHealth
    && time - lastDamageAt >= REPAIR_GRACE_MS
    && time - lastRepairAt >= REPAIR_INTERVAL_MS;
}

export function blockLevel(kind: number) {
  return BLOCK_LEVELS[Math.max(0, Math.min(BLOCK_LEVELS.length - 1, Math.floor(kind)))]!;
}

export function ramDamageAtSpeed(baseRamDamage: number, speed: number, maximumSpeed: number): number {
  const impact = Math.max(0, Math.min(1, speed / Math.max(1, maximumSpeed)));
  return Math.max(1, Math.round(baseRamDamage * (.3 + impact * .7)));
}
