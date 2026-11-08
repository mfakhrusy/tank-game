import { describe, expect, it } from 'vitest';
import { chooseEnemySpawn, enemyTierWeights, ENEMY_VARIANTS, enemyCombatStats, enemyVariant, enemyVelocity } from './enemies';

describe('enemy variety',()=>{
  it('offers meaningfully different silhouettes, sizes, and colors',()=>{
    expect(new Set(ENEMY_VARIANTS.map(enemy=>enemy.shape)).size).toBe(9);
    expect(new Set(ENEMY_VARIANTS.map(enemy=>enemy.color)).size).toBe(9);
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
    expect(Math.hypot(roaming.x,roaming.y)).toBeGreaterThan(0);
    expect(Math.hypot(roaming.x,roaming.y)).toBeLessThanOrEqual(enemyVariant(4).moveSpeed*1.62);
  });

  it('varies speed and direction with individual timing while staying continuous',()=>{
    for(const index of [0,2,4]){
      const variant=enemyVariant(index);
      const samples=Array.from({length:80},(_,i)=>enemyVelocity(i*400,variant,1.3,0,0,0,0));
      const speeds=samples.map(v=>Math.hypot(v.x,v.y));
      expect(Math.max(...speeds)-Math.min(...speeds)).toBeGreaterThan(variant.moveSpeed*.25);
      const a=enemyVelocity(1700,variant,1.3,0,0,0,0),b=enemyVelocity(1701,variant,1.3,0,0,0,0);
      expect(Math.hypot(a.x-b.x,a.y-b.y)).toBeLessThan(2);
      expect(enemyVelocity(1700,variant,3.2,0,0,0,0)).not.toEqual(a);
    }
  });

  it('blends back toward home without snapping at the roam boundary',()=>{
    const dart=enemyVariant(4),phase=1.7,time=2400;
    const justInside=enemyVelocity(time,dart,phase,dart.roamRadius-1,0,0,0);
    const justOutside=enemyVelocity(time,dart,phase,dart.roamRadius+1,0,0,0);
    expect(Math.hypot(justInside.x-justOutside.x,justInside.y-justOutside.y)).toBeLessThan(4);
    expect(Math.abs(Math.hypot(justInside.x,justInside.y)-dart.moveSpeed)).toBeLessThan(4);
    expect(Math.hypot(justOutside.x,justOutside.y)).toBeCloseTo(dart.moveSpeed);
  });
});

it('smoothly shifts tier probabilities while retaining easy targets',()=>{
  let previous=enemyTierWeights(1);
  for(let level=1;level<=26;level++){
    const weights=enemyTierWeights(level);
    expect(weights.reduce((a,b)=>a+b,0)).toBeCloseTo(1);
    expect(weights.every(w=>w>=0)).toBe(true);
    expect(weights[0]).toBeLessThanOrEqual(previous[0]);expect(weights[2]).toBeGreaterThanOrEqual(previous[2]);
    expect(weights[0]).toBeGreaterThanOrEqual(.119);previous=weights;
  }
  expect(enemyTierWeights(1)[2]).toBe(0);
  expect(enemyTierWeights(26)[2]).toBeCloseTo(.6);
});
it('unlocks new silhouettes gradually and keeps original ones in late-game spawns',()=>{
  for(const level of [1,4,9,15,26]){
    const spawns=Array.from({length:1000},(_,i)=>chooseEnemySpawn(level,i/1000,((i*137)%1000)/1000));
    expect(spawns.every(s=>ENEMY_VARIANTS[s.variantIndex].unlockLevel<=level)).toBe(true);
    expect(spawns.some(s=>s.variantIndex===0)).toBe(true);
    expect(spawns.some(s=>s.kind===0)).toBe(true);
    if(level>=4)expect(spawns.some(s=>s.variantIndex===6)).toBe(true);
    if(level>=9)expect(spawns.some(s=>s.variantIndex===7)).toBe(true);
    if(level>=15)expect(spawns.some(s=>s.variantIndex===8)).toBe(true);
  }
});
