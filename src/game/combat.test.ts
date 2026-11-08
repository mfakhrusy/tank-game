import { describe, expect, it } from 'vitest';
import {
  BLOCK_LEVELS,
  REPAIR_GRACE_MS,
  REPAIR_INTERVAL_MS,
  shapeImpactDamage,
  ramImpactDamage,
  smasherKnockback,
  blockLevel,
  canAutoRepair,
  ramDamageAtSpeed,
  repairAmount,
  repairedHealth,
} from './combat';
import { DEFAULT_BUILD, TankBuild, attachPart, calculateStats } from './config';

describe('body collision combat', () => {
  it('makes stronger block levels deal more contact damage', () => {
    expect(BLOCK_LEVELS[1].contactDamage).toBeGreaterThan(BLOCK_LEVELS[0].contactDamage);
    expect(BLOCK_LEVELS[2].contactDamage).toBeGreaterThan(BLOCK_LEVELS[1].contactDamage);
    expect(blockLevel(2).health).toBe(85);
  });

  it('makes faster impacts deal more ram damage', () => {
    expect(ramDamageAtSpeed(20, 200, 200)).toBeGreaterThan(ramDamageAtSpeed(20, 40, 200));
  });

  it('lets spikes and drills stack body damage', () => {
    let plain: TankBuild = { ...DEFAULT_BUILD, attachments: [] };
    let sharp = attachPart(plain, 'spike', 0);
    sharp = attachPart(sharp, 'drill', 1);
    expect(calculateStats(sharp).ramDamage).toBe(calculateStats(plain).ramDamage + 73);
    expect(calculateStats(sharp).armor).toBeGreaterThan(calculateStats(plain).armor);
  });

  it('repairs eight percent of maximum health with a useful minimum', () => {
    expect(repairAmount(70)).toBe(6);
    expect(repairAmount(120)).toBe(10);
    expect(repairAmount(20)).toBe(4);
  });

  it('waits for both the repair interval and a quiet period after damage', () => {
    expect(canAutoRepair(REPAIR_INTERVAL_MS - 1, 0, 0, 40, 70)).toBe(false);
    expect(canAutoRepair(REPAIR_INTERVAL_MS, 0, 0, 40, 70)).toBe(true);
    expect(canAutoRepair(8_000, 6_000, 0, 40, 70)).toBe(false);
    expect(canAutoRepair(6_000 + REPAIR_GRACE_MS, 6_000, 0, 40, 70)).toBe(true);
    expect(canAutoRepair(10_000, 0, 0, 70, 70)).toBe(false);
  });

  it('never repairs beyond maximum health', () => {
    expect(repairedHealth(67, 70, repairAmount(70))).toBe(70);
    expect(repairedHealth(40, 70, repairAmount(70))).toBe(46);
  });
});

it('only moving smasher builds knock enemies back, with bounded strength', () => {
  expect(smasherKnockback(8, 150, 150)).toBe(0);
  expect(smasherKnockback(36, 0, 150)).toBe(0);
  expect(smasherKnockback(36, 150, 150)).toBeGreaterThan(smasherKnockback(36, 50, 150));
  expect(smasherKnockback(81, 150, 150)).toBeGreaterThan(smasherKnockback(36, 150, 150));
  expect(smasherKnockback(10000, 1000, 150)).toBeLessThanOrEqual(480);
});

it('lets even weak fresh shapes survive a maximum-power smasher hit', () => {
  for (const health of [20, 28, 52, 85]) {
    const damage = ramImpactDamage(800, 300, 150, health);
    expect(damage).toBeLessThan(health);
    expect(damage).toBeLessThanOrEqual(Math.ceil(health * 0.3));
  }
  expect(ramImpactDamage(8, 150, 150, 28)).toBe(ramDamageAtSpeed(8, 150, 150));
});

it('only damaging shape impacts exceed a gentle touch and stay bounded', () => {
  expect(shapeImpactDamage(0, 28)).toBe(0);
  expect(shapeImpactDamage(59, 28)).toBe(0);
  expect(shapeImpactDamage(180, 28)).toBeGreaterThan(0);
  expect(shapeImpactDamage(1000, 28)).toBeLessThan(28);
});
