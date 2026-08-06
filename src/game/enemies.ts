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

export function enemyVelocity(time: number, variant: Pick<EnemyVariant,'moveSpeed'|'roamRadius'>, phase: number, x: number, y: number, homeX: number, homeY: number) {
  if (!variant.moveSpeed) return { x:0, y:0 };
  const dx=homeX-x,dy=homeY-y,distance=Math.hypot(dx,dy);
  const wanderAngle=phase+Math.sin(time*.00065+phase)*.85+Math.sin(time*.00021+phase*2.3)*.35;
  const wanderX=Math.cos(wanderAngle),wanderY=Math.sin(wanderAngle);
  const homeXDirection=distance>.001?dx/distance:wanderX,homeYDirection=distance>.001?dy/distance:wanderY;
  const returnStart=variant.roamRadius*.55,returnRange=Math.max(1,variant.roamRadius-returnStart);
  const homeWeight=Math.max(0,Math.min(1,(distance-returnStart)/returnRange));
  const blendedX=wanderX+(homeXDirection-wanderX)*homeWeight,blendedY=wanderY+(homeYDirection-wanderY)*homeWeight;
  const length=Math.max(.001,Math.hypot(blendedX,blendedY));
  return { x:blendedX/length*variant.moveSpeed, y:blendedY/length*variant.moveSpeed };
}
