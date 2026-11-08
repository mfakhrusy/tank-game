import {ramImpactDamage} from './combat';
import {expect,it} from 'vitest';
import {DEFAULT_BUILD,calculateStats} from './config';
import {buyUpgrade,freshProgression,levelProgress,upgradedStats,xpForShape,UPGRADE_IDS} from './progression';

it('gives early levels quickly with increasingly longer milestones',()=>{
  const p=freshProgression();
  expect(levelProgress(p)).toEqual({level:1,current:0,required:30,points:0});
  p.xp=29;expect(levelProgress(p).level).toBe(1);
  p.xp=30;expect(levelProgress(p)).toEqual({level:2,current:0,required:45,points:1});
  p.xp=135;expect(levelProgress(p)).toEqual({level:4,current:0,required:75,points:3});
  expect(xpForShape(2)).toBeGreaterThan(xpForShape(0));
});
it('prevents overspending and caps each rank while allowing saved points',()=>{
  let p=freshProgression();expect(buyUpgrade(p,'damage')).toBe(p);
  p={...p,xp:100000};
  for(let i=0;i<6;i++)p=buyUpgrade(p,'damage');
  expect(p.upgrades.damage).toBe(5);expect(levelProgress(p).points).toBe(20);
  for(const id of UPGRADE_IDS)for(let i=0;i<5;i++)p=buyUpgrade(p,id);
  expect(levelProgress(p).points).toBe(0);expect(levelProgress(p).level).toBe(26);
});
it('applies upgrades to the original build without compounding or changing modules',()=>{
  const base=calculateStats(DEFAULT_BUILD),p={...freshProgression(),xp:1000,upgrades:{damage:1,reload:1,speed:1,health:1,ram:1}};
  const result=upgradedStats(base,p);
  expect(result.weapons[0].damage).toBeCloseTo(base.weapons[0].damage*1.12);
  expect(result.weapons[0].fireRate).toBeCloseTo(base.weapons[0].fireRate*1.08);
  expect(result.speed).toBeCloseTo(base.speed*1.06);
  expect(result.armor).toBe(Math.round(base.armor*1.15));
  expect(result.ramDamage).toBeCloseTo(base.ramDamage*1.12);
  expect(upgradedStats(base,freshProgression())).toEqual(base);
});

it('lets ramming upgrades improve capped smasher hits without one-shotting a fresh shape',()=>{
  expect(ramImpactDamage(100,200,200,100)).toBe(30);
  expect(ramImpactDamage(160,200,200,100,1.6)).toBe(48);
});
