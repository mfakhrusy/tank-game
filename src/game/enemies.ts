import { blockLevel } from './combat';

export type EnemyShape = 'orb' | 'box' | 'diamond' | 'hex' | 'shard' | 'capsule';

export type EnemyVariant = {
  id: string;
  shape: EnemyShape;
  size: number;
  color: number;
  moveSpeed: number;
  roamRadius: number;
  healthScale: number;
  damageScale: number;
};

export const ENEMY_VARIANTS: EnemyVariant[] = [
  { id:'bubble', shape:'orb', size:42, color:0x47b8e8, moveSpeed:72, roamRadius:120, healthScale:.72, damageScale:.7 },
  { id:'chunk', shape:'box', size:58, color:0x58c995, moveSpeed:0, roamRadius:0, healthScale:1, damageScale:1 },
  { id:'kite', shape:'diamond', size:54, color:0x936ee8, moveSpeed:96, roamRadius:170, healthScale:.82, damageScale:.86 },
  { id:'honey', shape:'hex', size:72, color:0xf6c453, moveSpeed:0, roamRadius:0, healthScale:1.38, damageScale:1.28 },
  { id:'dart', shape:'shard', size:48, color:0xff725e, moveSpeed:128, roamRadius:210, healthScale:.62, damageScale:1.08 },
  { id:'loaf', shape:'capsule', size:86, color:0xe7658c, moveSpeed:0, roamRadius:0, healthScale:1.65, damageScale:1.45 },
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
