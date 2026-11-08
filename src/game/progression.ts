import type { TankStats } from './config';

export const UPGRADE_IDS = ['damage', 'reload', 'speed', 'health', 'ram'] as const;
export type UpgradeId = (typeof UPGRADE_IDS)[number];
export type Progression = { xp: number; upgrades: Record<UpgradeId, number> };
export const MAX_LEVEL = 26,
  MAX_UPGRADE_RANK = 5;
export const UPGRADES: { id: UpgradeId; name: string; bonus: string }[] = [
  { id: 'damage', name: 'Shot power', bonus: '+12% damage' },
  { id: 'reload', name: 'Reload', bonus: '+8% fire rate' },
  { id: 'speed', name: 'Movement', bonus: '+6% speed & acceleration' },
  { id: 'health', name: 'Hull strength', bonus: '+15% max health' },
  { id: 'ram', name: 'Ramming', bonus: '+12% impact damage' },
];
export const freshProgression = (): Progression => ({
  xp: 0,
  upgrades: { damage: 0, reload: 0, speed: 0, health: 0, ram: 0 },
});
export const xpForShape = (kind: number) => [12, 24, 40][Math.max(0, Math.min(2, kind))];
export function levelProgress(progression: Progression) {
  let level = 1,
    remaining = progression.xp;
  while (level < MAX_LEVEL && remaining >= 30 + 15 * (level - 1)) {
    remaining -= 30 + 15 * (level - 1);
    level++;
  }
  return {
    level,
    current: level === MAX_LEVEL ? 0 : remaining,
    required: level === MAX_LEVEL ? 0 : 30 + 15 * (level - 1),
    points: level - 1 - UPGRADE_IDS.reduce((sum, id) => sum + progression.upgrades[id], 0),
  };
}
export function buyUpgrade(progression: Progression, id: UpgradeId): Progression {
  if (levelProgress(progression).points <= 0 || progression.upgrades[id] >= MAX_UPGRADE_RANK)
    return progression;
  return {
    ...progression,
    upgrades: { ...progression.upgrades, [id]: progression.upgrades[id] + 1 },
  };
}
export function upgradedStats(base: TankStats, { upgrades: u }: Progression): TankStats {
  return {
    ...base,
    speed: base.speed * (1 + 0.06 * u.speed),
    acceleration: base.acceleration * (1 + 0.06 * u.speed),
    armor: Math.round(base.armor * (1 + 0.15 * u.health)),
    ramDamage: base.ramDamage * (1 + 0.12 * u.ram),
    weapons: base.weapons.map((w) => ({
      ...w,
      damage: w.damage * (1 + 0.12 * u.damage),
      fireRate: w.fireRate * (1 + 0.08 * u.reload),
    })),
  };
}
