import { describe, expect, it } from 'vitest';
import { ENEMY_VARIANTS, enemyCombatStats, enemyVariant, enemyVelocity } from './enemies';

describe('enemy variety',()=>{
  it('offers meaningfully different silhouettes, sizes, and colors',()=>{
    expect(new Set(ENEMY_VARIANTS.map(enemy=>enemy.shape)).size).toBe(6);
    expect(new Set(ENEMY_VARIANTS.map(enemy=>enemy.color)).size).toBe(6);
    expect(Math.max(...ENEMY_VARIANTS.map(enemy=>enemy.size))-Math.min(...ENEMY_VARIANTS.map(enemy=>enemy.size))).toBeGreaterThan(35);
  });

  it('mixes stationary, slow, and fast roaming enemies',()=>{
    expect(ENEMY_VARIANTS.some(enemy=>enemy.moveSpeed===0)).toBe(true);
    expect(ENEMY_VARIANTS.some(enemy=>enemy.moveSpeed>100)).toBe(true);
  });

  it('makes large variants tougher without erasing block levels',()=>{
    const small=enemyCombatStats(1,enemyVariant(0)),large=enemyCombatStats(1,enemyVariant(5));
    expect(large.health).toBeGreaterThan(small.health);
    expect(large.contactDamage).toBeGreaterThan(small.contactDamage);
    expect(enemyCombatStats(2,enemyVariant(0)).health).toBeGreaterThan(enemyCombatStats(0,enemyVariant(0)).health);
  });

  it('keeps movers roaming near home while stationary enemies stay put',()=>{
    expect(enemyVelocity(1000,enemyVariant(1),0,50,50,0,0)).toEqual({x:0,y:0});
    const returning=enemyVelocity(1000,enemyVariant(4),0,500,0,0,0);
    expect(returning.x).toBeLessThan(0);expect(Math.abs(returning.y)).toBeLessThan(1);
    const roaming=enemyVelocity(1000,enemyVariant(4),1,0,0,0,0);
    expect(Math.hypot(roaming.x,roaming.y)).toBeCloseTo(enemyVariant(4).moveSpeed);
  });

  it('blends back toward home without snapping at the roam boundary',()=>{
    const dart=enemyVariant(4),phase=1.7,time=2400;
    const justInside=enemyVelocity(time,dart,phase,dart.roamRadius-1,0,0,0);
    const justOutside=enemyVelocity(time,dart,phase,dart.roamRadius+1,0,0,0);
    expect(Math.hypot(justInside.x-justOutside.x,justInside.y-justOutside.y)).toBeLessThan(4);
    expect(Math.hypot(justInside.x,justInside.y)).toBeCloseTo(dart.moveSpeed);
    expect(Math.hypot(justOutside.x,justOutside.y)).toBeCloseTo(dart.moveSpeed);
  });
});
