export const BLOCK_LEVELS = [
  { level: 1, health: 28, contactDamage: 3, label: 'Soft' },
  { level: 2, health: 52, contactDamage: 6, label: 'Sturdy' },
  { level: 3, health: 85, contactDamage: 10, label: 'Strong' },
] as const;

export const REPAIR_INTERVAL_MS = 5_000;
export const REPAIR_GRACE_MS = 3_000;

export function repairAmount(maximumHealth: number): number {
  return Math.max(4, Math.round(Math.max(0, maximumHealth) * 0.08));
}

export function repairedHealth(
  currentHealth: number,
  maximumHealth: number,
  amount: number,
): number {
  return Math.min(maximumHealth, Math.max(0, currentHealth) + Math.max(0, amount));
}

export function canAutoRepair(
  time: number,
  lastDamageAt: number,
  lastRepairAt: number,
  health: number,
  maximumHealth: number,
): boolean {
  return (
    health > 0 &&
    health < maximumHealth &&
    time - lastDamageAt >= REPAIR_GRACE_MS &&
    time - lastRepairAt >= REPAIR_INTERVAL_MS
  );
}

export function blockLevel(kind: number) {
  return BLOCK_LEVELS[Math.max(0, Math.min(BLOCK_LEVELS.length - 1, Math.floor(kind)))]!;
}

export function ramDamageAtSpeed(
  baseRamDamage: number,
  speed: number,
  maximumSpeed: number,
): number {
  const impact = Math.max(0, Math.min(1, speed / Math.max(1, maximumSpeed)));
  return Math.max(1, Math.round(baseRamDamage * (0.3 + impact * 0.7)));
}

// Only dedicated ram parts add power above the bare chassis's eight damage.
export function smasherKnockback(ramDamage: number, speed: number, maximumSpeed: number): number {
  if (ramDamage <= 8 || speed < 30) return 0;
  const impact = Math.max(0, Math.min(1, speed / Math.max(1, maximumSpeed)));
  return Math.min(480, 220 * Math.sqrt((ramDamage - 8) / 28)) * (0.3 + 0.7 * impact);
}

export function ramImpactDamage(
  baseRamDamage: number,
  speed: number,
  maximumSpeed: number,
  targetMaxHealth: number,
  upgradeMultiplier = 1,
): number {
  const damage = ramDamageAtSpeed(baseRamDamage, speed, maximumSpeed);
  return baseRamDamage > 8
    ? Math.min(damage, Math.max(1, Math.ceil(targetMaxHealth * 0.3 * upgradeMultiplier)))
    : damage;
}

export function shapeImpactDamage(closingSpeed: number, maximumHealth: number): number {
  if (closingSpeed < 60) return 0;
  return Math.min(Math.ceil(maximumHealth * 0.3), Math.max(2, Math.round(closingSpeed / 18)));
}
