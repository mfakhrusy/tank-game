import { blockLevel } from './combat';

export type EnemyShape = 'orb' | 'box' | 'diamond' | 'hex' | 'shard' | 'capsule' | 'triangle' | 'pentagon' | 'octagon';

export type EnemyVariant = {
  id: string;
  unlockLevel:number;
  shape: EnemyShape;
  size: number;
  color: number;
  moveSpeed: number;
  roamRadius: number;
  healthScale: number;
  damageScale: number;
};

export const ENEMY_VARIANTS: EnemyVariant[] = [
  { id:'bubble', unlockLevel:1, shape:'orb', size:42, color:0x47b8e8, moveSpeed:72, roamRadius:120, healthScale:.72, damageScale:.7 },
  { id:'chunk', unlockLevel:1, shape:'box', size:58, color:0x58c995, moveSpeed:0, roamRadius:0, healthScale:1, damageScale:1 },
  { id:'kite', unlockLevel:1, shape:'diamond', size:54, color:0x936ee8, moveSpeed:96, roamRadius:170, healthScale:.82, damageScale:.86 },
  { id:'honey', unlockLevel:3, shape:'hex', size:72, color:0xf6c453, moveSpeed:0, roamRadius:0, healthScale:1.38, damageScale:1.28 },
  { id:'dart', unlockLevel:5, shape:'shard', size:48, color:0xff725e, moveSpeed:128, roamRadius:210, healthScale:.62, damageScale:1.08 },
  { id:'loaf', unlockLevel:7, shape:'capsule', size:86, color:0xe7658c, moveSpeed:0, roamRadius:0, healthScale:1.65, damageScale:1.45 },
  { id:'prism', unlockLevel:4, shape:'triangle', size:64, color:0x35c6c9, moveSpeed:82, roamRadius:180, healthScale:1.15, damageScale:1.05 },
  { id:'sentinel', unlockLevel:9, shape:'pentagon', size:82, color:0xec9670, moveSpeed:38, roamRadius:100, healthScale:1.9, damageScale:1.5 },
  { id:'bastion', unlockLevel:15, shape:'octagon', size:100, color:0x858fe0, moveSpeed:24, roamRadius:80, healthScale:2.65, damageScale:1.8 },
];

export function enemyVariant(index: number): EnemyVariant {
  return ENEMY_VARIANTS[Math.abs(Math.floor(index)) % ENEMY_VARIANTS.length]!;
}

export function enemyCombatStats(levelIndex: number, variant: EnemyVariant) {
  const level=blockLevel(levelIndex);
  return {
    health:Math.max(1,Math.round(level.health*variant.healthScale)),
    contactDamage:Math.max(1,Math.round(level.contactDamage*variant.damageScale)),
  };
}

// Smooth seeded noise changes course without per-frame randomness or sharp turns.
function wanderNoise(step:number,seed:number):number {
  const hash=(index:number)=>{const value=Math.sin(index*127.1+seed*311.7)*43758.5453;return (value-Math.floor(value))*2-1;};
  const index=Math.floor(step),fraction=step-index,blend=fraction*fraction*(3-2*fraction);
  return hash(index)+(hash(index+1)-hash(index))*blend;
}

export function enemyVelocity(time: number, variant: Pick<EnemyVariant,'moveSpeed'|'roamRadius'>, phase: number, x: number, y: number, homeX: number, homeY: number) {
  if (!variant.moveSpeed) return { x:0, y:0 };
  const dart=variant.moveSpeed>110,kite=variant.moveSpeed>80&&!dart;
  const seed=phase+1,seconds=time/1000;
  const pace=dart ? .85 : kite ? 1.4 : 2.3;
  const clock=seconds/(pace*(.85+.3*(Math.sin(seed*9)*.5+.5)))+seed*3;
  const heading=phase+wanderNoise(clock,seed)*Math.PI*1.7+wanderNoise(clock*.37,seed+8)*Math.PI;
  const pulse=(wanderNoise(clock*.8,seed+17)+1)/2;
  const speedScale=dart ? .12+1.5*Math.pow(pulse,3) : kite ? .55+.65*pulse : .18+.82*pulse;
  const dx=homeX-x,dy=homeY-y,distance=Math.hypot(dx,dy);
  const wanderX=Math.cos(heading),wanderY=Math.sin(heading);
  const homeXDirection=distance>.001?dx/distance:wanderX,homeYDirection=distance>.001?dy/distance:wanderY;
  const homeWeight=Math.max(0,Math.min(1,(distance-variant.roamRadius*.55)/Math.max(1,variant.roamRadius*.45)));
  const blendedX=wanderX+(homeXDirection-wanderX)*homeWeight,blendedY=wanderY+(homeYDirection-wanderY)*homeWeight;
  const length=Math.max(.001,Math.hypot(blendedX,blendedY));
  const speed=variant.moveSpeed*(speedScale+(1-speedScale)*homeWeight);
  return { x:blendedX/length*speed, y:blendedY/length*speed };
}

// Easy targets never disappear; stronger tiers gradually take more of the mix.
export function enemyTierWeights(level:number):[number,number,number] {
  const clamped=Math.max(1,Math.min(26,level));
  const weak=.94-.82*(clamped-1)/25,strong=.6*Math.max(0,(clamped-4)/22);
  return [weak,1-weak-strong,strong];
}
export function enemyVariantWeight(level:number,unlockLevel:number):number {
  return level<unlockLevel?0:unlockLevel===1?1:Math.min(1.5,(level-unlockLevel+1)*.2);
}
function weightedIndex(weights:number[],roll:number):number {
  const total=weights.reduce((sum,value)=>sum+value,0);let remaining=Math.max(0,Math.min(.999999999,roll))*total;
  for(let i=0;i<weights.length;i++){remaining-=weights[i];if(remaining<0)return i;}
  return 0;
}
export function chooseEnemySpawn(level:number,tierRoll:number,variantRoll:number){
  return {kind:weightedIndex(enemyTierWeights(level),tierRoll),variantIndex:weightedIndex(ENEMY_VARIANTS.map(v=>enemyVariantWeight(level,v.unlockLevel)),variantRoll)};
}

export function enemyWeapon(id:string){
  if(id==='prism')return {cooldown:3200,burst:1,spread:0,speed:260,damage:4};
  if(id==='sentinel')return {cooldown:3800,burst:2,spread:.13,speed:240,damage:5};
  if(id==='bastion')return {cooldown:4400,burst:3,spread:.22,speed:220,damage:6};
  return null;
}
