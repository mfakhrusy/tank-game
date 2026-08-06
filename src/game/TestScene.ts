import Phaser from 'phaser';
import { Attachment, ShooterBehavior, TankBuild, WeaponSpec, boosterThrustForDirection, calculateStats, getPart, shouldBoomerangReturn, shouldSplitterBurst, wigglerHeading } from './config';
import { useGameStore } from '../store';
import { BLOCKS_PER_CHUNK, CHUNK_SIZE, WORLD_LIMIT, chunkAt, createChunkRandom, rectangularChunkWindow } from './world';
import { canAutoRepair, ramDamageAtSpeed, repairAmount } from './combat';
import { CORE_RADIUS, LAYER_RADII, attachmentPose, attachmentTransform, contraptionRadius, occupiedMountDepths } from './geometry';
import { ENEMY_VARIANTS, EnemyShape, enemyCombatStats, enemyVariant, enemyVelocity } from './enemies';
import { LocalNetworkState, NetworkEnemy, NetworkPlayer, NetworkProjectile, WorldSnapshot } from '../multiplayer';

type Block = Phaser.Physics.Arcade.Image & { hp:number; kind:number; contactDamage:number; homeX:number; homeY:number; moveSpeed:number; roamRadius:number; moveAngle:number; movePhase:number; targetVelocityX:number; targetVelocityY:number };
type Bullet = Phaser.Physics.Arcade.Image & { damage:number; born:number; behavior:ShooterBehavior; baseAngle:number; baseSpeed:number; phase:number; splitDone:boolean; pierceLeft:number; hitBlocks:Set<string> };
const MAX_ACTIVE_PROJECTILES = 120;
const MAX_EFFECT_BITS = 60;
const ENEMY_STEERING_INTERVAL_MS = 100;
const ACTIVE_ENEMY_RADIUS = 1900;
const MIN_PROJECTILE_BUDGET = 48;

export class TestScene extends Phaser.Scene {
  private stats;
  private tank!: Phaser.Physics.Arcade.Image;
  private machine!: Phaser.GameObjects.Container;
  private bullets!: Phaser.Physics.Arcade.Group;
  private blocks!: Phaser.Physics.Arcade.Group;
  private staticBlocks!: Phaser.Physics.Arcade.StaticGroup;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private lastShots = new Map<string, number>();
  private boosterFlames = new Map<string, Phaser.GameObjects.Container>();
  private blockCounter = 0;
  private chunks = new Map<string, Block[]>();
  private currentChunk = '';
  private lastPositionReport = 0;
  private contactCooldowns = new Map<string, number>();
  private respawning = false;
  private lastDamageAt = 0;
  private lastRepairAt = 0;
  private lastEnemySteering = 0;
  private lastMetricFlush = 0;
  private lastFpsReport = 0;
  private pendingShots = 0;
  private pendingHits = 0;
  private activeEffectBits = 0;
  private projectileBudget = MAX_ACTIVE_PROJECTILES;
  private lastMultiplayerReport = 0;
  private remotePlayers = new Map<string,{wrapper:Phaser.GameObjects.Container;machine:Phaser.GameObjects.Container;targetX:number;targetY:number;targetRotation:number}>();
  private networkEnemies = new Map<string,{image:Phaser.GameObjects.Image;targetX:number;targetY:number}>();
  private networkProjectiles = new Map<string,{image:Phaser.GameObjects.Image;targetX:number;targetY:number;targetRotation:number}>();
  private multiplayerActive = false;

  constructor(private build: TankBuild,private reportMultiplayerState?:(state:LocalNetworkState)=>void) { super('TestYard'); this.stats = calculateStats(build); }

  create() {
    this.cameras.main.setBackgroundColor('#fff8e8');
    this.physics.world.setBounds(-WORLD_LIMIT, -WORLD_LIMIT, WORLD_LIMIT * 2, WORLD_LIMIT * 2);
    this.cameras.main.setBounds(-WORLD_LIMIT, -WORLD_LIMIT, WORLD_LIMIT * 2, WORLD_LIMIT * 2);
    this.makeTextures(); this.drawYard();
    this.blocks = this.physics.add.group({ allowGravity:false });
    this.staticBlocks = this.physics.add.staticGroup();
    this.bullets = this.physics.add.group({ maxSize: MAX_ACTIVE_PROJECTILES });
    const collisionRadius=contraptionRadius(this.build);
    this.tank = this.physics.add.image(0, 0, 'machine-body').setCircle(collisionRadius, 150-collisionRadius, 150-collisionRadius).setDrag(700).setMaxVelocity(Math.max(90, this.stats.speed)).setAlpha(.001);
    this.machine = this.makeMachine(this.build,true).setPosition(0, 0).setDepth(6);
    this.cameras.main.startFollow(this.tank, true, .08, .08);
    this.cameras.main.setZoom(useGameStore.getState().cameraZoom);
    this.keys = this.input.keyboard!.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT') as Record<string, Phaser.Input.Keyboard.Key>;
    useGameStore.getState().resetHealth(this.stats.armor);
    this.lastDamageAt = this.time.now;
    this.lastRepairAt = this.time.now;
    this.physics.add.collider(this.tank, this.blocks, this.crashBlock as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback, undefined, this);
    this.physics.add.collider(this.tank, this.staticBlocks, this.crashBlock as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback, undefined, this);
    this.physics.add.overlap(this.bullets, this.blocks, this.hitBlock as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback, undefined, this);
    this.physics.add.overlap(this.bullets, this.staticBlocks, this.hitBlock as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback, undefined, this);
    this.updateChunks(true);
    const practiceBlock=this.createBlock(260,0,0);this.chunks.get('0,0')?.push(practiceBlock);
  }

  update(time: number) {
    if(this.respawning){this.machine.setPosition(this.tank.x,this.tank.y);return;}
    const targetZoom=useGameStore.getState().cameraZoom,currentZoom=this.cameras.main.zoom,nextZoom=Math.abs(targetZoom-currentZoom)<.002?targetZoom:Phaser.Math.Linear(currentZoom,targetZoom,.14);if(Math.abs(nextZoom-currentZoom)>.0001)this.cameras.main.setZoom(nextZoom);
    const world = this.input.activePointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
    const aim = Phaser.Math.Angle.Between(this.tank.x,this.tank.y,world.x,world.y);
    let x = Number(this.keys.D.isDown || this.keys.RIGHT.isDown) - Number(this.keys.A.isDown || this.keys.LEFT.isDown);
    let y = Number(this.keys.S.isDown || this.keys.DOWN.isDown) - Number(this.keys.W.isDown || this.keys.UP.isDown);
    if (x || y) { const length = Math.hypot(x,y); x/=length; y/=length; const boost=boosterThrustForDirection(this.stats.boosters,aim,x,y); this.tank.setAcceleration(x*(this.stats.acceleration+boost),y*(this.stats.acceleration+boost)); }
    else this.tank.setAcceleration(0).setVelocity(this.tank.body!.velocity.x*.88,this.tank.body!.velocity.y*.88);
    for(const booster of this.stats.boosters){const thrustAngle=aim+booster.mount*Math.PI/4+Math.PI;const alignment=x||y?Math.max(0,x*Math.cos(thrustAngle)+y*Math.sin(thrustAngle)):0;const flame=this.boosterFlames.get(booster.uid);if(flame){const active=alignment>.08;flame.setVisible(true).setAlpha(active ? .55+Math.random()*.45 : .3).setScale(active ? .8+alignment*.55 : .55);}}
    this.machine.setPosition(this.tank.x,this.tank.y).setRotation(aim);
    this.updateRemotePlayers();
    this.updateNetworkEntities();
    if(this.reportMultiplayerState&&time-this.lastMultiplayerReport>=67){this.lastMultiplayerReport=time;this.reportMultiplayerState({x:this.tank.x,y:this.tank.y,rotation:aim,firing:this.input.activePointer.isDown});}
    if(!this.multiplayerActive){this.updateChunks();this.updateEnemies(time);this.tryAutoRepair(time);}
    if(time-this.lastPositionReport>250){this.lastPositionReport=time;useGameStore.getState().recordPosition(this.tank.x,this.tank.y);}
    if(!this.multiplayerActive){for (const child of this.bullets.getChildren()) { const bullet=child as Bullet; if(bullet.active)this.updateBullet(bullet,time); }if (this.input.activePointer.isDown) for (const weapon of this.stats.weapons) this.pendingShots+=this.tryFire(time,aim,weapon);if(time-this.lastMetricFlush>=100)this.flushCombatMetrics(time);}
    if(time-this.lastFpsReport>=1000){this.lastFpsReport=time;this.tunePerformance(this.game.loop.actualFps);}
  }

  private makeMachine(build:TankBuild,trackBoosters:boolean) {
    const container = this.add.container();
    for(const {mount,layer} of occupiedMountDepths(build.attachments)){
      const angle=mount*Math.PI/4,start=CORE_RADIUS-6,end=LAYER_RADII[layer]+30,length=end-start,center=start+length/2;
      container.add(this.add.rectangle(Math.cos(angle)*center,Math.sin(angle)*center,length,18,0x29324a).setRotation(angle));
      container.add(this.add.rectangle(Math.cos(angle)*center,Math.sin(angle)*center,length,9,0xcbd1dc).setRotation(angle));
    }
    const ordered = [...build.attachments].sort((a,b)=>b.layer-a.layer);
    ordered.forEach(item => this.addPartShape(container,item,trackBoosters));
    container.add(this.add.circle(0,0,CORE_RADIUS+8,0x29324a));
    container.add(this.add.circle(0,0,CORE_RADIUS,Phaser.Display.Color.HexStringToColor(build.color).color));
    container.add(this.add.circle(0,0,29,0xf8f3e8).setStrokeStyle(7,0x29324a));
    const badge=this.add.graphics().lineStyle(8,Phaser.Display.Color.HexStringToColor(build.color).color,1).beginPath().moveTo(-12,3).lineTo(-4,11).lineTo(14,-12).strokePath();
    container.add(badge);
    for(const item of build.attachments){const bolt=attachmentPose(item.mount,item.layer,-28);container.add(this.add.circle(bolt.x,bolt.y,5,0xf6c453).setStrokeStyle(3,0x29324a));}
    return container;
  }

  private addPartShape(container: Phaser.GameObjects.Container,item:Attachment,trackBoosters:boolean) {
    const part=getPart(item.partId),pose=attachmentTransform(item.mount,item.layer);
    const shape=this.add.container(pose.x,pose.y).setRotation(pose.angle).setScale(pose.scale);container.add(shape);
    const polygon=(points:number[],color:number,stroke?:number,width=0)=>{const graphic=this.add.graphics().fillStyle(color,1);const vertices=[];for(let i=0;i<points.length;i+=2)vertices.push(new Phaser.Math.Vector2(points[i],points[i+1]));graphic.fillPoints(vertices,true);if(stroke!==undefined)graphic.lineStyle(width,stroke,1).strokePoints(vertices,true);return graphic;};
    if(part.shape==='barrel'){
      const outerHeight=part.behavior==='bonker'?34:26,innerHeight=part.behavior==='bonker'?22:16;
      shape.add(this.add.rectangle(19,0,58,outerHeight,0x29324a).setOrigin(.5));
      shape.add(this.add.rectangle(19,0,48,innerHeight,part.color).setOrigin(.5));
      if(part.behavior==='ricochet')shape.add(this.add.rectangle(44,0,20,20,0x29324a).setOrigin(.5));else shape.add(this.add.circle(43,0,9,0x29324a));
      shape.add(this.add.circle(43,0,5,0xffffff,.25));
    }else if(part.shape==='pod'){
      shape.add(polygon([-15,-18,24,-18,46,0,24,18,-15,18],0x29324a));
      shape.add(polygon([-9,-12,21,-12,37,0,21,12,-9,12],part.color));
      if(part.behavior==='sprinkler')for(const [px,py] of [[25,-8],[32,0],[25,8]])shape.add(this.add.circle(px,py,5,0x29324a));
      if(part.behavior==='boomerang')shape.add(this.add.arc(8,0,13,35,325,false,0xf8f3e8).setStrokeStyle(4,0x29324a));
      if(part.behavior==='wiggler'){const wave=this.add.graphics().lineStyle(5,0xffffff,1).beginPath().moveTo(-1,8);for(let i=1;i<=16;i++)wave.lineTo(-1+i*2,8-Math.sin(i*Math.PI/4)*9);wave.strokePath();shape.add(wave);}
      if(part.behavior==='splitter')shape.add(polygon([9,0,20,-11,31,0,20,11],0xf8f3e8,0x29324a,3));
    }else if(part.shape==='booster'){
      shape.add(polygon([-28,-19,11,-19,31,-10,31,10,11,19,-28,19],0x29324a));
      shape.add(polygon([-21,-12,8,-12,23,-5,23,5,8,12,-21,12],part.color));
      shape.add(this.add.rectangle(27.5,0,15,30,0x29324a).setOrigin(.5));
      const flame=this.add.container(47,0).setAlpha(.3).setScale(.55);flame.add(polygon([-12,-9,12,0,-12,9],0xf6c453,0x29324a,4));flame.add(polygon([-9,-4,6,0,-9,4],0xff725e));shape.add(flame);if(trackBoosters)this.boosterFlames.set(item.uid,flame);
    }else if(part.shape==='plate'){
      shape.add(polygon([-18,-28,17,-28,30,-20,38,-7,38,7,30,20,17,28,-18,28],0x29324a));
      shape.add(polygon([-13,-21,15,-21,25,-14,31,-5,31,5,25,14,15,21,-13,21],part.color));
      shape.add(this.add.rectangle(2,-14,14,5,0xffffff,.35).setOrigin(.5));
    }else if(part.shape==='wheel'){
      shape.add(this.add.ellipse(4,0,62,44,0x29324a));shape.add(this.add.ellipse(4,0,46,30,part.color));shape.add(this.add.circle(4,0,7,0xffffff,.4));
      shape.add(this.add.rectangle(-13,0,4,22,0x29324a));shape.add(this.add.rectangle(21,0,4,22,0x29324a));
    }else if(part.shape==='spike'){
      shape.add(polygon([-25,-22,38,0,-25,22],0x29324a));shape.add(polygon([-17,-13,27,0,-17,13],part.color));shape.add(polygon([-5,-7,41,0,-5,7,9,0],0xf8f3e8,0x29324a,3));
    }else{
      shape.add(this.add.circle(2,0,25,0x29324a));shape.add(this.add.circle(2,0,18,part.color));shape.add(this.add.circle(-4,-6,6,0xffffff,.45));shape.add(this.add.text(3,0,part.icon,{fontFamily:'Arial Black',fontSize:'17px',color:'#29324a'}).setOrigin(.5));
    }
  }

  private tryFire(time:number,aim:number,weapon:WeaponSpec) {
    if(time-(this.lastShots.get(weapon.uid)??0)<1000/weapon.fireRate)return 0;
    this.lastShots.set(weapon.uid,time);
    const mountAngle=weapon.mount*Math.PI/4, base=aim+mountAngle, radius=LAYER_RADII[weapon.layer]+30;
    let fired=0;
    for(let i=0;i<weapon.burst;i++){
      const offset=(i-(weapon.burst-1)/2)*weapon.spread,shotAngle=base+offset;
      const bullet=this.spawnProjectile(this.tank.x+Math.cos(base)*radius,this.tank.y+Math.sin(base)*radius,shotAngle,weapon.projectileSpeed,weapon.damage,weapon.projectileSize,weapon.color,weapon.behavior,time);
      if(bullet)fired+=1;
    }
    return fired;
  }

  private spawnProjectile(x:number,y:number,angle:number,speed:number,damage:number,size:number,color:number,behavior:ShooterBehavior,time:number){
    if(this.bullets.getLength()>=this.projectileBudget)return null;
    const texture=behavior==='boomerang'?'bullet-boomerang':behavior==='ricochet'?'bullet-square':'bullet';
    const bullet=this.bullets.create(x,y,texture) as Bullet|null;
    if(!bullet)return null;
    bullet.setActive(true).setVisible(true).setDepth(4).setScale(size/10).setTint(color).setVelocity(Math.cos(angle)*speed,Math.sin(angle)*speed);
    bullet.damage=damage;bullet.born=time;bullet.behavior=behavior;bullet.baseAngle=angle;bullet.baseSpeed=speed;bullet.phase=Math.random()*Math.PI*2;bullet.splitDone=false;bullet.pierceLeft=behavior==='bonker'?2:1;bullet.hitBlocks=new Set();
    return bullet;
  }

  private updateBullet(bullet:Bullet,time:number){
    const age=time-bullet.born;
    if(bullet.behavior==='boomerang'&&shouldBoomerangReturn(age)){
      const angle=Phaser.Math.Angle.Between(bullet.x,bullet.y,this.tank.x,this.tank.y);bullet.setVelocity(Math.cos(angle)*bullet.baseSpeed*1.15,Math.sin(angle)*bullet.baseSpeed*1.15).setRotation(angle);
      if(Phaser.Math.Distance.Between(bullet.x,bullet.y,this.tank.x,this.tank.y)<38){bullet.destroy();return;}
    }else if(bullet.behavior==='wiggler'){
      const angle=wigglerHeading(bullet.baseAngle,age,bullet.phase);bullet.setVelocity(Math.cos(angle)*bullet.baseSpeed,Math.sin(angle)*bullet.baseSpeed).setRotation(angle);
    }else if(bullet.behavior==='splitter'&&shouldSplitterBurst(age,bullet.splitDone)){
      bullet.splitDone=true;const{x,y,baseAngle,baseSpeed,damage}=bullet;bullet.destroy();
      for(const offset of [-.34,0,.34])this.spawnProjectile(x,y,baseAngle+offset,baseSpeed*1.08,damage*.58,6,0xe7658c,'popper',time);
      this.pop(x,y,0xe7658c,7);return;
    }
    const lifetime=bullet.behavior==='ricochet'?3400:bullet.behavior==='boomerang'?2300:bullet.behavior==='sprinkler'?800:1900;
    if(age>lifetime)bullet.destroy();
  }

  private hitBlock(bulletObject:Phaser.Types.Physics.Arcade.GameObjectWithBody,blockObject:Phaser.Types.Physics.Arcade.GameObjectWithBody){
    const bullet=bulletObject as Bullet,block=blockObject as Block;if(!bullet.active||!block.active||bullet.hitBlocks.has(block.name))return;
    bullet.hitBlocks.add(block.name);block.hp-=bullet.damage;this.pendingHits+=1;block.setTint(0xffffff);this.time.delayedCall(70,()=>block.active&&block.clearTint());this.pop(block.x,block.y,block.kind===2?0xff725e:0xf6c453,4);
    if(bullet.behavior==='ricochet'){
      const dx=bullet.x-block.x,dy=bullet.y-block.y,vx=bullet.body!.velocity.x,vy=bullet.body!.velocity.y;
      if(Math.abs(dx)>Math.abs(dy))bullet.setVelocity(-vx,vy);else bullet.setVelocity(vx,-vy);
      const speed=Math.max(1,bullet.body!.velocity.length());bullet.x+=bullet.body!.velocity.x/speed*18;bullet.y+=bullet.body!.velocity.y/speed*18;
    }else if(bullet.behavior!=='boomerang'){bullet.pierceLeft-=1;if(bullet.pierceLeft<=0)bullet.destroy();}
    if(block.hp<=0)this.destroyBlock(block);
  }

  private crashBlock(_tankObject:Phaser.Types.Physics.Arcade.GameObjectWithBody,blockObject:Phaser.Types.Physics.Arcade.GameObjectWithBody){
    const block=blockObject as Block;if(!block.active||this.respawning)return;const now=this.time.now,last=this.contactCooldowns.get(block.name)??-Infinity;if(now-last<520)return;this.contactCooldowns.set(block.name,now);
    const speed=this.tank.body!.velocity.length(),ram=ramDamageAtSpeed(this.stats.ramDamage,speed,Math.max(1,this.stats.speed));
    useGameStore.getState().damageHealth(block.contactDamage);this.lastDamageAt=now;block.hp-=ram;
    this.machine.setAlpha(.35);this.tweens.add({targets:this.machine,alpha:1,duration:180});this.pop(this.tank.x,this.tank.y,0xff725e,7);this.pop(block.x,block.y,0xf6c453,Math.min(10,3+Math.round(ram/10)));
    this.tank.setVelocity(-this.tank.body!.velocity.x*.38,-this.tank.body!.velocity.y*.38);
    if(block.hp<=0)this.destroyBlock(block);
    if(useGameStore.getState().health<=0)this.knockOut();
  }

  private tryAutoRepair(time:number){
    const state=useGameStore.getState();
    if(!canAutoRepair(time,this.lastDamageAt,this.lastRepairAt,state.health,state.maxHealth))return;
    this.lastRepairAt=time;state.repairHealth(repairAmount(state.maxHealth));this.pop(this.tank.x,this.tank.y,0x58c995,6);
  }

  private destroyBlock(block:Block){if(!block.active)return;const{x,y}=block;block.destroy();useGameStore.getState().recordBlock();this.pop(x,y,0xffb83e,12);}

  private flushCombatMetrics(time:number){if(this.pendingShots||this.pendingHits)useGameStore.getState().recordCombat(this.pendingShots,this.pendingHits);this.pendingShots=0;this.pendingHits=0;this.lastMetricFlush=time;}
  private tunePerformance(fps:number){if(fps<54)this.projectileBudget=Math.max(MIN_PROJECTILE_BUDGET,this.projectileBudget-24);else if(fps>58)this.projectileBudget=Math.min(MAX_ACTIVE_PROJECTILES,this.projectileBudget+12);const parent=this.game.canvas.parentElement;if(parent){parent.dataset.fps=String(Math.round(fps));parent.dataset.projectileBudget=String(this.projectileBudget);}}

  upsertRemotePlayer(player:NetworkPlayer){const current=this.remotePlayers.get(player.id);if(current){current.targetX=player.x;current.targetY=player.y;current.targetRotation=player.rotation;return;}const machine=this.makeMachine(player.build,false).setRotation(player.rotation);const label=this.add.text(0,-contraptionRadius(player.build)-24,player.build.name,{fontFamily:'Arial Black',fontSize:'13px',color:'#29324a',backgroundColor:'#fffdf8cc',padding:{x:6,y:3}}).setOrigin(.5);const wrapper=this.add.container(player.x,player.y,[machine,label]).setDepth(5).setAlpha(.86);this.remotePlayers.set(player.id,{wrapper,machine,targetX:player.x,targetY:player.y,targetRotation:player.rotation});this.reportRemoteCount();}
  removeRemotePlayer(playerId:string){const remote=this.remotePlayers.get(playerId);if(remote){remote.wrapper.destroy(true);this.remotePlayers.delete(playerId);this.reportRemoteCount();}}
  clearRemotePlayers(){for(const id of [...this.remotePlayers.keys()])this.removeRemotePlayer(id);}
  private updateRemotePlayers(){for(const remote of this.remotePlayers.values()){remote.wrapper.x=Phaser.Math.Linear(remote.wrapper.x,remote.targetX,.22);remote.wrapper.y=Phaser.Math.Linear(remote.wrapper.y,remote.targetY,.22);remote.machine.rotation=Phaser.Math.Angle.RotateTo(remote.machine.rotation,remote.targetRotation,.18);}}
  private reportRemoteCount(){const parent=this.game.canvas.parentElement;if(parent)parent.dataset.remotePlayers=String(this.remotePlayers.size);}

  setMultiplayerMode(active:boolean){if(this.multiplayerActive===active)return;this.multiplayerActive=active;if(active){for(const blocks of this.chunks.values())blocks.forEach(block=>block.active&&block.destroy());this.chunks.clear();this.currentChunk='';this.blocks.clear(true,true);this.staticBlocks.clear(true,true);this.bullets.clear(true,true);useGameStore.getState().resetMetrics();}else{this.clearNetworkWorld();useGameStore.getState().resetHealth(this.stats.armor);this.updateChunks(true);}}
  applyNetworkWorld(snapshot:WorldSnapshot,selfId:string){this.setMultiplayerMode(true);const remoteIds=new Set<string>();for(const player of snapshot.players){if(player.id===selfId){useGameStore.getState().setHealth(player.health,player.maxHealth);continue;}remoteIds.add(player.id);this.upsertRemotePlayer(player);}for(const id of [...this.remotePlayers.keys()])if(!remoteIds.has(id))this.removeRemotePlayer(id);this.syncNetworkEnemies(snapshot.enemies);this.syncNetworkProjectiles(snapshot.projectiles);const parent=this.game.canvas.parentElement;if(parent){parent.dataset.worldRevision=String(snapshot.revision);parent.dataset.networkEnemies=String(snapshot.enemies.length);parent.dataset.networkEnemyIds=snapshot.enemies.map(enemy=>enemy.id).sort().join(',');parent.dataset.networkProjectiles=String(snapshot.projectiles.length);}}
  private syncNetworkEnemies(enemies:NetworkEnemy[]){const live=new Set<string>();for(const enemy of enemies){live.add(enemy.id);const current=this.networkEnemies.get(enemy.id);if(current){current.targetX=enemy.x;current.targetY=enemy.y;continue;}const image=this.add.image(enemy.x,enemy.y,`enemy-${enemy.variant}-${enemy.level}`).setDepth(3);this.networkEnemies.set(enemy.id,{image,targetX:enemy.x,targetY:enemy.y});}for(const[id,enemy]of this.networkEnemies)if(!live.has(id)){enemy.image.destroy();this.networkEnemies.delete(id);}}
  private syncNetworkProjectiles(projectiles:NetworkProjectile[]){const live=new Set<string>();for(const projectile of projectiles){live.add(projectile.id);const current=this.networkProjectiles.get(projectile.id);if(current){current.targetX=projectile.x;current.targetY=projectile.y;current.targetRotation=projectile.rotation;continue;}const texture=projectile.behavior==='boomerang'?'bullet-boomerang':projectile.behavior==='ricochet'?'bullet-square':'bullet';const image=this.add.image(projectile.x,projectile.y,texture).setTint(projectile.color).setScale(projectile.size/10).setRotation(projectile.rotation).setDepth(4);this.networkProjectiles.set(projectile.id,{image,targetX:projectile.x,targetY:projectile.y,targetRotation:projectile.rotation});}for(const[id,projectile]of this.networkProjectiles)if(!live.has(id)){projectile.image.destroy();this.networkProjectiles.delete(id);}}
  private updateNetworkEntities(){for(const enemy of this.networkEnemies.values()){enemy.image.x=Phaser.Math.Linear(enemy.image.x,enemy.targetX,.28);enemy.image.y=Phaser.Math.Linear(enemy.image.y,enemy.targetY,.28);}for(const projectile of this.networkProjectiles.values()){projectile.image.x=Phaser.Math.Linear(projectile.image.x,projectile.targetX,.55);projectile.image.y=Phaser.Math.Linear(projectile.image.y,projectile.targetY,.55);projectile.image.rotation=Phaser.Math.Angle.RotateTo(projectile.image.rotation,projectile.targetRotation,.3);}}
  private clearNetworkWorld(){this.clearRemotePlayers();for(const enemy of this.networkEnemies.values())enemy.image.destroy();for(const projectile of this.networkProjectiles.values())projectile.image.destroy();this.networkEnemies.clear();this.networkProjectiles.clear();const parent=this.game.canvas.parentElement;if(parent){parent.dataset.networkEnemies='0';parent.dataset.networkEnemyIds='';parent.dataset.networkProjectiles='0';delete parent.dataset.worldRevision;}}

  private knockOut(){if(this.respawning)return;this.respawning=true;this.tank.setAcceleration(0).setVelocity(0);this.machine.setAlpha(.25);this.time.delayedCall(900,()=>{this.tank.setPosition(0,0).setVelocity(0);this.machine.setPosition(0,0).setAlpha(1);useGameStore.getState().resetHealth(this.stats.armor);this.respawning=false;this.currentChunk='';this.updateChunks(true);});}

  private drawYard(){this.add.circle(0,0,115,0xf6c453,.1).setStrokeStyle(4,0xf6c453,.3);this.add.text(0,-105,'START',{fontFamily:'Arial Black',fontSize:'22px',color:'#29324a'}).setOrigin(.5).setAlpha(.25);}
  private makeTextures(){
    const body=this.make.graphics({x:0,y:0});body.fillStyle(0xffffff).fillCircle(150,150,145).generateTexture('machine-body',300,300);body.destroy();
    const ball=this.make.graphics({x:0,y:0});ball.fillStyle(0x29324a).fillCircle(11,11,11).fillStyle(0xffffff).fillCircle(11,11,7).generateTexture('bullet',22,22);ball.clear().fillStyle(0x29324a).fillRoundedRect(1,1,20,20,4).fillStyle(0xffffff).fillRoundedRect(5,5,12,12,2).generateTexture('bullet-square',22,22);ball.clear().lineStyle(7,0x29324a).beginPath().arc(12,12,9,.45,Math.PI*2-.45).strokePath().lineStyle(3,0xffffff).beginPath().arc(12,12,8,.5,Math.PI*2-.5).strokePath().generateTexture('bullet-boomerang',24,24);ball.destroy();
    ENEMY_VARIANTS.forEach(variant=>{for(let kind=0;kind<3;kind++)this.makeEnemyTexture(variant.id,variant.shape,variant.size,variant.color,kind);});
    const bit=this.make.graphics({x:0,y:0});bit.fillStyle(0xffffff).fillCircle(4,4,4).generateTexture('bit',8,8);bit.destroy();
  }
  private makeEnemyTexture(id:string,shape:EnemyShape,size:number,color:number,kind:number){
    const padding=6,textureSize=size+padding*2,c=textureSize/2,outer=size/2,inner=outer-5,graphic=this.make.graphics({x:0,y:0});
    const points=(radius:number,sides:number,rotation=-Math.PI/2)=>Array.from({length:sides},(_,i)=>new Phaser.Math.Vector2(c+Math.cos(rotation+i*Math.PI*2/sides)*radius,c+Math.sin(rotation+i*Math.PI*2/sides)*radius));
    const draw=(fill:number,inset=0)=>{const radius=outer-inset;graphic.fillStyle(fill,1);if(shape==='orb')graphic.fillCircle(c,c,radius);else if(shape==='box')graphic.fillRoundedRect(c-radius,c-radius,radius*2,radius*2,Math.max(8,radius*.3));else if(shape==='diamond')graphic.fillPoints(points(radius,4),true);else if(shape==='hex')graphic.fillPoints(points(radius,6),true);else if(shape==='shard')graphic.fillPoints([new Phaser.Math.Vector2(c+radius,c),new Phaser.Math.Vector2(c-radius*.72,c-radius*.72),new Phaser.Math.Vector2(c-radius*.42,c),new Phaser.Math.Vector2(c-radius*.72,c+radius*.72)],true);else graphic.fillRoundedRect(c-radius,c-radius*.62,radius*2,radius*1.24,radius*.62);};
    draw(0x29324a);draw(color,5);
    graphic.fillStyle(0xffffff,.3);if(shape==='orb')graphic.fillCircle(c-inner*.32,c-inner*.35,Math.max(4,inner*.2));else graphic.fillRoundedRect(c-inner*.55,c-inner*.48,inner*.72,Math.max(5,inner*.16),4);
    graphic.fillStyle(0x29324a);graphic.fillCircle(c-inner*.34,c,Math.max(3,size*.055));graphic.fillCircle(c+inner*.34,c,Math.max(3,size*.055));graphic.lineStyle(Math.max(2,size*.045),0x29324a,1).lineBetween(c-inner*.28,c+inner*.35,c+inner*.28,c+inner*.35);
    for(let pip=0;pip<=kind;pip++)graphic.fillCircle(c+(pip-kind/2)*7,c+inner*.72,2.5);
    graphic.generateTexture(`enemy-${id}-${kind}`,textureSize,textureSize);graphic.destroy();
  }
  private updateChunks(force=false){const center=chunkAt(this.tank.x,this.tank.y),zoom=useGameStore.getState().cameraZoom,radiusX=Math.max(1,Math.ceil(this.scale.width/(2*zoom*CHUNK_SIZE))),radiusY=Math.max(1,Math.ceil(this.scale.height/(2*zoom*CHUNK_SIZE))),windowKey=`${center.key}:${radiusX},${radiusY}`;if(!force&&windowKey===this.currentChunk)return;this.currentChunk=windowKey;for(const chunk of rectangularChunkWindow(center.x,center.y,radiusX,radiusY)){if(!this.chunks.has(chunk.key))this.generateChunk(chunk.x,chunk.y,chunk.key);}for(const[key,blocks]of this.chunks){const chunk=key.split(',').map(Number);if(Math.abs(chunk[0]-center.x)>radiusX||Math.abs(chunk[1]-center.y)>radiusY){blocks.forEach(block=>block.active&&block.destroy());this.chunks.delete(key);}}}
  private generateChunk(cx:number,cy:number,key:string){const random=createChunkRandom(cx,cy),blocks:Block[]=[];for(let i=0;i<BLOCKS_PER_CHUNK;i++){const x=(cx+random())*CHUNK_SIZE,y=(cy+random())*CHUNK_SIZE;if(Phaser.Math.Distance.Between(x,y,this.tank.x,this.tank.y)<190)continue;blocks.push(this.createBlock(x,y,Math.floor(random()*3),Math.floor(random()*ENEMY_VARIANTS.length),random()*Math.PI*2));}this.chunks.set(key,blocks);}
  private createBlock(x:number,y:number,kind:number,variantIndex=1,phase=0){const variant=enemyVariant(variantIndex),combat=enemyCombatStats(kind,variant),group=variant.moveSpeed?this.blocks:this.staticBlocks,block=group.create(x,y,`enemy-${variant.id}-${kind}`) as Block;this.blockCounter+=1;block.name=`block-${this.blockCounter}`;block.kind=kind;block.hp=combat.health;block.contactDamage=combat.contactDamage;block.homeX=x;block.homeY=y;block.moveSpeed=variant.moveSpeed;block.roamRadius=variant.roamRadius;block.moveAngle=phase;block.movePhase=phase;const initialVelocity=enemyVelocity(0,variant,phase,x,y,x,y);block.targetVelocityX=initialVelocity.x;block.targetVelocityY=initialVelocity.y;block.setAngle(((x+y)%21)-10);if(variant.moveSpeed)block.setImmovable(true).setPushable(false).setVelocity(initialVelocity.x,initialVelocity.y);const textureSize=variant.size+12;if(variant.shape==='orb')block.setCircle(variant.size*.48,6,6);else{const body=block.body as Phaser.Physics.Arcade.Body|Phaser.Physics.Arcade.StaticBody,bodySize=variant.size*.78,offset=(textureSize-bodySize)/2;body.setSize(bodySize,bodySize).setOffset(offset,offset);}return block;}
  private updateEnemies(time:number){const refreshSteering=time-this.lastEnemySteering>=ENEMY_STEERING_INTERVAL_MS;if(refreshSteering)this.lastEnemySteering=time;for(const child of this.blocks.getChildren()){const block=child as Block;if(!block.active||!block.moveSpeed)continue;if(Phaser.Math.Distance.Squared(block.x,block.y,this.tank.x,this.tank.y)>ACTIVE_ENEMY_RADIUS*ACTIVE_ENEMY_RADIUS){block.targetVelocityX=0;block.targetVelocityY=0;if(block.body!.velocity.lengthSq()>0)block.setVelocity(0);continue;}if(refreshSteering){const target=enemyVelocity(time,block,block.movePhase,block.x,block.y,block.homeX,block.homeY);block.targetVelocityX=target.x;block.targetVelocityY=target.y;}const velocity=block.body!.velocity;block.setVelocity(Phaser.Math.Linear(velocity.x,block.targetVelocityX,.12),Phaser.Math.Linear(velocity.y,block.targetVelocityY,.12));}}
  private pop(x:number,y:number,color:number,count:number){const effectBudget=Math.min(MAX_EFFECT_BITS,Math.max(24,Math.round(this.projectileBudget/2))),available=Math.min(count,Math.max(0,effectBudget-this.activeEffectBits));for(let i=0;i<available;i++){this.activeEffectBits+=1;const bit=this.add.image(x,y,'bit').setTint(color).setDepth(10),a=Math.random()*Math.PI*2,d=Phaser.Math.Between(15,55);this.tweens.add({targets:bit,x:x+Math.cos(a)*d,y:y+Math.sin(a)*d,alpha:0,scale:.3,duration:350,onComplete:()=>{this.activeEffectBits=Math.max(0,this.activeEffectBits-1);bit.destroy();}});}}
}
