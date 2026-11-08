import { Burn, igniteBurn, tickBurn } from './burning';
import { freshProgression, upgradedStats, xpForShape, levelProgress, Progression } from './progression';
import Phaser from 'phaser';
import { coreArt } from './moduleArt';
import { bakeArtwork, bakeModuleAtlas } from './renderArtwork';
import { NetworkMotion, interpolatePosition, interpolateRotation, RenderFrames } from './networkMotion';
import { magnetPullDistance } from './magnet';
import { beamHitsOutline, tankOutline, blockOutline, tankBlockContact, circleOutline } from './collision';
import { Attachment, ShooterBehavior, TankBuild, WeaponSpec, boosterThrustForDirection, calculateStats, getPart, shouldBoomerangReturn, shouldSplitterBurst, wigglerHeading } from './config';
import { useGameStore } from '../store';
import { BLOCKS_PER_CHUNK, CHUNK_SIZE, WORLD_LIMIT, chunkAt, createChunkRandom, rectangularChunkWindow } from './world';
import { canAutoRepair, repairAmount, smasherKnockback, ramImpactDamage, shapeImpactDamage } from './combat';
import { CORE_RADIUS, LAYER_RADII, LAYER_SCALES, attachmentTransform, contraptionRadius, occupiedMountDepths } from './geometry';
import { enemyWeapon, chooseEnemySpawn, ENEMY_VARIANTS, EnemyShape, enemyCombatStats, enemyVariant, enemyVelocity } from './enemies';
import { LocalNetworkState, NetworkEnemy, NetworkPlayer, NetworkProjectile, WorldSnapshot } from '../multiplayer';

type Block = Phaser.Physics.Arcade.Image & { hp:number; maxHp:number; size:number; outline:ReturnType<typeof blockOutline>; variantId:string;nextAttack:number;windupAt:number;kind:number; spawnLevel:number; contactDamage:number; homeX:number; homeY:number; moveSpeed:number; roamRadius:number; moveAngle:number; movePhase:number; targetVelocityX:number; targetVelocityY:number };
type Bullet = Phaser.Physics.Arcade.Image & { damage:number; born:number; behavior:ShooterBehavior; baseAngle:number; baseSpeed:number; phase:number; splitDone:boolean; pierceLeft:number; hitBlocks:Set<string> };
const MAX_ACTIVE_PROJECTILES = 120;
const MAX_EFFECT_BITS = 60;
const ENEMY_STEERING_INTERVAL_MS = 100;
const ACTIVE_ENEMY_RADIUS = 1900;
const MIN_PROJECTILE_BUDGET = 48;

export class TestScene extends Phaser.Scene {
  private shapeContacts=new Map<string,number>();
  private healthBarValues=new WeakMap<Phaser.GameObjects.Image,{health:number;maximum:number;size:number}>();
  private healthBars=new Map<Phaser.GameObjects.Image,Phaser.GameObjects.Graphics>();
  private knockbacks=new Map<Block,{x:number;y:number}>();
  private appliedProgression:Progression|null=null;
  private burns=new Map<Block,Burn>();
  private fireVisualCount=0;
  private lastFireVisual=new WeakMap<Phaser.GameObjects.Image,number>();
  private stats;
  private collisionOutline;
  private tank!: Phaser.Physics.Arcade.Image;
  private machine!: Phaser.GameObjects.Container;
  private bullets!: Phaser.Physics.Arcade.Group;
  private enemyShots!: Phaser.Physics.Arcade.Group;
  private blocks!: Phaser.Physics.Arcade.Group;
  private staticBlocks!: Phaser.Physics.Arcade.StaticGroup;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private lastShots = new Map<string, number>();
  private boosterFlames = new Map<string, Phaser.GameObjects.Container>();
  private blockCounter = 0;
  private lastSpawnRefresh=0;
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
  private lastReportedFiring=false;
  private networkMotion=new NetworkMotion();
  private remotePlayers = new Map<string,{wrapper:Phaser.GameObjects.Container;machine:Phaser.GameObjects.Container;targetX:number;targetY:number;targetRotation:number}>();
  private networkEnemies = new Map<string,{image:Phaser.GameObjects.Image;targetX:number;targetY:number;health:number;maxHealth:number}>();
  private networkProjectiles = new Map<string,{image:Phaser.GameObjects.Image;targetX:number;targetY:number;targetRotation:number}>();
  private multiplayerActive = false;

  constructor(private build: TankBuild,private reportMultiplayerState?:(state:LocalNetworkState)=>void) { super('TestYard'); this.stats = calculateStats(build); this.collisionOutline=tankOutline(build); }

  create() {
    useGameStore.getState().resetProgression();
    this.cameras.main.setBackgroundColor('#fff8e8');
    this.physics.world.setBounds(-WORLD_LIMIT, -WORLD_LIMIT, WORLD_LIMIT * 2, WORLD_LIMIT * 2);
    this.cameras.main.setBounds(-WORLD_LIMIT, -WORLD_LIMIT, WORLD_LIMIT * 2, WORLD_LIMIT * 2);
    this.makeTextures(); this.drawYard();
    this.blocks = this.physics.add.group({ allowGravity:false });
    this.staticBlocks = this.physics.add.staticGroup();
    this.enemyShots=this.physics.add.group({maxSize:64});
    this.bullets = this.physics.add.group({ maxSize: MAX_ACTIVE_PROJECTILES });
    const collisionRadius=contraptionRadius(this.build)+24;
    this.tank = this.physics.add.image(0, 0, 'machine-body').setCircle(collisionRadius, 150-collisionRadius, 150-collisionRadius).setDrag(700).setMaxVelocity(Math.max(90, this.stats.speed)).setAlpha(.001);
    this.machine = this.makeMachine(this.build,true).setPosition(0, 0).setDepth(6);
    this.cameras.main.startFollow(this.tank, true, 1, 1);
    // Arcade writes its final position in POST_UPDATE, after Scene.update.
    // Sync the visible tank afterwards so the camera and artwork use the same frame.
    this.events.on(Phaser.Scenes.Events.POST_UPDATE,()=>this.machine.setPosition(this.tank.x,this.tank.y));
    this.cameras.main.setZoom(useGameStore.getState().cameraZoom);
    this.keys = this.input.keyboard!.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT') as Record<string, Phaser.Input.Keyboard.Key>;
    useGameStore.getState().resetHealth(this.stats.armor);
    this.lastDamageAt = this.time.now;
    this.lastRepairAt = this.time.now;
    this.physics.add.overlap(this.tank,this.enemyShots,this.hitByEnemyShot as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,undefined,this);
    this.physics.add.overlap(this.tank, this.blocks, this.crashBlock as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback, undefined, this);
    this.physics.add.overlap(this.tank, this.staticBlocks, this.crashBlock as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback, undefined, this);
    this.physics.add.overlap(this.bullets, this.blocks, this.hitBlock as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback, undefined, this);
    this.physics.add.overlap(this.bullets, this.staticBlocks, this.hitBlock as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback, undefined, this);
    this.updateChunks(true);
    const practiceBlock=this.createBlock(260,0,0);this.chunks.get('0,0')?.push(practiceBlock);
  }

  update(time: number, delta: number) {
    const progression=useGameStore.getState().progression;
    if(progression!==this.appliedProgression){
      const oldArmor=this.stats.armor;
      this.stats=upgradedStats(calculateStats(this.build),progression);this.appliedProgression=progression;
      this.tank.setMaxVelocity(Math.max(90,this.stats.speed));
      if(!this.multiplayerActive&&oldArmor!==this.stats.armor){const state=useGameStore.getState();state.setHealth(state.health+this.stats.armor-oldArmor,this.stats.armor);}
    }
    if(this.respawning){this.machine.setPosition(this.tank.x,this.tank.y);return;}
    const targetZoom=useGameStore.getState().cameraZoom,currentZoom=this.cameras.main.zoom,nextZoom=Math.abs(targetZoom-currentZoom)<.002?targetZoom:Phaser.Math.Linear(currentZoom,targetZoom,.14);if(Math.abs(nextZoom-currentZoom)>.0001)this.cameras.main.setZoom(nextZoom);
    const world = this.input.activePointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
    const {autoSpin,autoShoot}=useGameStore.getState();
    const aim = autoSpin ? Phaser.Math.Angle.Wrap(this.machine.rotation+Math.min(delta,50)*Math.PI/3000) : Phaser.Math.Angle.Between(this.tank.x,this.tank.y,world.x,world.y);
    const firing=autoShoot||(this.input.activePointer.isDown&&this.input.activePointer.downElement===this.game.canvas);
    let x = Number(this.keys.D.isDown || this.keys.RIGHT.isDown) - Number(this.keys.A.isDown || this.keys.LEFT.isDown);
    let y = Number(this.keys.S.isDown || this.keys.DOWN.isDown) - Number(this.keys.W.isDown || this.keys.UP.isDown);
    if (x || y) { const length = Math.hypot(x,y); x/=length; y/=length; const boost=boosterThrustForDirection(this.stats.boosters,aim,x,y); this.tank.setAcceleration(x*(this.stats.acceleration+boost),y*(this.stats.acceleration+boost)); }
    else this.tank.setAcceleration(0).setVelocity(this.tank.body!.velocity.x*.88,this.tank.body!.velocity.y*.88);
    for(const booster of this.stats.boosters){const thrustAngle=aim+booster.mount*Math.PI/4+Math.PI;const alignment=x||y?Math.max(0,x*Math.cos(thrustAngle)+y*Math.sin(thrustAngle)):0;const flame=this.boosterFlames.get(booster.uid);if(flame){const active=alignment>.08;flame.setVisible(true).setAlpha(active ? .55+Math.random()*.45 : .3).setScale(active ? .8+alignment*.55 : .55);}}
    this.machine.setPosition(this.tank.x,this.tank.y).setRotation(aim);
    this.updateRemotePlayers(delta);
    this.updateNetworkEntities();
    if(this.multiplayerActive){this.resolveNetworkContacts();this.machine.setPosition(this.tank.x,this.tank.y);}
    if(this.reportMultiplayerState&&(time-this.lastMultiplayerReport>=67||firing!==this.lastReportedFiring)){this.lastMultiplayerReport=time;this.lastReportedFiring=firing;this.reportMultiplayerState({x:this.tank.x,y:this.tank.y,rotation:aim,firing});}
    if(!this.multiplayerActive){this.updateChunks();this.refreshEnemySpawns(time);this.updateKnockbacks(delta);this.updateEnemies(time,delta);this.updateEnemyAttacks(time);this.updateBurns(time);this.updateMagnet(delta);this.updateShapeCollisions(time);this.tryAutoRepair(time);}
    if(time-this.lastPositionReport>250){this.lastPositionReport=time;useGameStore.getState().recordPosition(this.tank.x,this.tank.y);}
    if(!this.multiplayerActive){for (const child of this.bullets.getChildren()) { const bullet=child as Bullet; if(bullet.active)this.updateBullet(bullet,time); }if (firing) for (const weapon of this.stats.weapons) this.pendingShots+=this.tryFire(time,aim,weapon);if(time-this.lastMetricFlush>=100)this.flushCombatMetrics(time);}
    if(!this.multiplayerActive)for(const group of [this.blocks,this.staticBlocks])for(const child of group.getChildren()){
      const block=child as Block;this.renderBurning(block,this.burns.has(block),time);this.updateShapeHealthBar(block,block.hp,block.maxHp,block.size);
    }
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
    const coreKey=`core-${build.color}`;
    bakeArtwork(this,coreKey,coreArt(build.color));
    container.add(this.add.image(0,0,coreKey).setScale(.5));
    return container;
  }

  private addPartShape(container: Phaser.GameObjects.Container,item:Attachment,trackBoosters:boolean) {
    const part=getPart(item.partId),pose=attachmentTransform(item.mount,item.layer);
    const shape=this.add.container(pose.x,pose.y).setRotation(pose.angle).setScale(pose.scale);container.add(shape);
    bakeModuleAtlas(this);
    shape.add(this.add.image(0,0,'module-atlas',part.id).setScale(.5));
    if(part.shape==='booster'){
      const flameKey=`flame-${part.id}`;
      const flame=this.add.container(35,0).setAlpha(.3).setScale(.55);
      flame.add(this.add.image(0,0,'module-atlas',flameKey).setScale(.5));shape.add(flame);
      if(trackBoosters)this.boosterFlames.set(item.uid,flame);
    }
  }

  private tryFire(time:number,aim:number,weapon:WeaponSpec) {
    if(time-(this.lastShots.get(weapon.uid)??0)<1000/weapon.fireRate)return 0;
    this.lastShots.set(weapon.uid,time);
    const mountAngle=weapon.mount*Math.PI/4, base=aim+mountAngle, radius=LAYER_RADII[weapon.layer]+((weapon.behavior==='railgun'||weapon.behavior==='flamethrower')?48*LAYER_SCALES[weapon.layer]:30);
    if(weapon.behavior==='railgun'){
      const x=this.tank.x+Math.cos(base)*radius,y=this.tank.y+Math.sin(base)*radius;
      this.showRailBeam(x,y,base,weapon.projectileSpeed);
      for(const object of [...this.blocks.getChildren(),...this.staticBlocks.getChildren()]){
        const block=object as Block;
        if(!block.active||!beamHitsOutline(x,y,base,weapon.projectileSpeed,block.outline,block.x,block.y,block.rotation))continue;
        block.hp-=weapon.damage;this.pendingHits++;
        block.setTint(0xffffff);this.time.delayedCall(70,()=>block.active&&block.clearTint());
        this.pop(block.x,block.y,weapon.color,4);
        if(block.hp<=0)this.destroyBlock(block);
      }
      return 1;
    }
    let fired=0;
    for(let i=0;i<weapon.burst;i++){
      const offset=(i-(weapon.burst-1)/2)*weapon.spread,shotAngle=base+offset+(weapon.behavior==='flamethrower'?(Math.random()-.5)*.18:0);
      const bullet=this.spawnProjectile(this.tank.x+Math.cos(base)*radius,this.tank.y+Math.sin(base)*radius,shotAngle,weapon.projectileSpeed,weapon.damage,weapon.projectileSize,weapon.color,weapon.behavior,time);
      if(bullet)fired+=1;
    }
    return fired;
  }

  private showRailBeam(x:number,y:number,angle:number,length:number){
    const beam=this.add.image(x,y,'rail-beam').setOrigin(0,.5).setRotation(angle).setDisplaySize(length,16).setDepth(4);
    this.tweens.add({targets:beam,alpha:0,scaleY:beam.scaleY*.3,duration:70,onComplete:()=>beam.destroy()});
  }

  private spawnProjectile(x:number,y:number,angle:number,speed:number,damage:number,size:number,color:number,behavior:ShooterBehavior,time:number){
    if(this.bullets.getLength()>=this.projectileBudget)return null;
    const texture=behavior==='flamethrower'?'fire-puff':behavior==='boomerang'?'bullet-boomerang':behavior==='ricochet'?'bullet-square':'bullet';
    const bullet=this.bullets.create(x,y,texture) as Bullet|null;
    if(!bullet)return null;
    bullet.setActive(true).setVisible(true).setDepth(4).setScale(size/10).setTint(color).setVelocity(Math.cos(angle)*speed,Math.sin(angle)*speed);
    bullet.damage=damage;bullet.born=time;bullet.behavior=behavior;bullet.baseAngle=angle;bullet.baseSpeed=speed;bullet.phase=Math.random()*Math.PI*2;bullet.splitDone=false;bullet.pierceLeft=behavior==='flamethrower'?99:behavior==='bonker'?2:1;bullet.hitBlocks=new Set();
    if(behavior==='flamethrower'){bullet.clearTint().setFrame('0').setRotation(angle).setDisplaySize(44,16).setBlendMode(Phaser.BlendModes.NORMAL);(bullet.body as Phaser.Physics.Arcade.Body).setSize(14/bullet.scaleX,14/bullet.scaleY,true);}
    return bullet;
  }

  private updateBullet(bullet:Bullet,time:number){
    const age=time-bullet.born;
    if(bullet.behavior==='flamethrower'){
      const progress=Math.min(1,age/800),speed=bullet.baseSpeed*(1-.5*progress);
      bullet.setVelocity(Math.cos(bullet.baseAngle)*speed,Math.sin(bullet.baseAngle)*speed);
      bullet.setFrame('0').setRotation(bullet.baseAngle+Math.sin(age*.025+bullet.phase)*.1).setDisplaySize(44+progress*46,16+progress*30).setAlpha(Math.max(0,Math.pow(1-progress,.7)*.9));
      const body=bullet.body as Phaser.Physics.Arcade.Body;const diameter=2*(7+progress*14);body.setSize(diameter/bullet.scaleX,diameter/bullet.scaleY,true);
      if(age>=800)bullet.destroy();return;
    }
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
    const variant=ENEMY_VARIANTS.find(item=>item.id===block.variantId)!;
    if(!tankBlockContact([circleOutline(bullet.behavior==='flamethrower'?7+Math.min(1,(this.time.now-bullet.born)/800)*14:bullet.displayWidth/2)],bullet.x,bullet.y,0,blockOutline(variant.shape,variant.size),block.x,block.y,block.rotation))return;
    if(bullet.behavior==='flamethrower')this.burns.set(block,igniteBurn(this.burns.get(block),this.time.now,1.5*bullet.damage/1.25));
    bullet.hitBlocks.add(block.name);block.hp-=bullet.damage;this.pendingHits+=1;block.setTint(0xffffff);this.time.delayedCall(70,()=>block.active&&block.clearTint());this.pop(block.x,block.y,block.kind===2?0xff725e:0xf6c453,4);
    if(bullet.behavior==='ricochet'){
      const dx=bullet.x-block.x,dy=bullet.y-block.y,vx=bullet.body!.velocity.x,vy=bullet.body!.velocity.y;
      if(Math.abs(dx)>Math.abs(dy))bullet.setVelocity(-vx,vy);else bullet.setVelocity(vx,-vy);
      const speed=Math.max(1,bullet.body!.velocity.length());bullet.x+=bullet.body!.velocity.x/speed*18;bullet.y+=bullet.body!.velocity.y/speed*18;
    }else if(bullet.behavior!=='boomerang'){bullet.pierceLeft-=1;if(bullet.pierceLeft<=0)bullet.destroy();}
    if(block.hp<=0)this.destroyBlock(block);
  }

  private crashBlock(_tankObject:Phaser.Types.Physics.Arcade.GameObjectWithBody,blockObject:Phaser.Types.Physics.Arcade.GameObjectWithBody){
    const block=blockObject as Block;if(!block.active||this.respawning)return;
    const variant=ENEMY_VARIANTS.find(item=>item.id===block.variantId)!;
    const contact=tankBlockContact(this.collisionOutline,this.tank.x,this.tank.y,this.machine.rotation,blockOutline(variant.shape,variant.size),block.x,block.y,block.rotation);
    if(!contact)return;
    this.tank.setPosition(this.tank.x+contact.x,this.tank.y+contact.y);
    (this.tank.body as Phaser.Physics.Arcade.Body).updateFromGameObject();
    const now=this.time.now,last=this.contactCooldowns.get(block.name)??-Infinity;if(now-last<520)return;this.contactCooldowns.set(block.name,now);
    const speed=this.tank.body!.velocity.length(),ram=ramImpactDamage(this.stats.ramDamage,speed,Math.max(1,this.stats.speed),block.maxHp,1+.12*useGameStore.getState().progression.upgrades.ram);
    useGameStore.getState().damageHealth(block.contactDamage);this.lastDamageAt=now;block.hp-=ram;
    this.machine.setAlpha(.35);this.tweens.add({targets:this.machine,alpha:1,duration:180});this.pop(this.tank.x,this.tank.y,0xff725e,7);this.pop(block.x,block.y,0xf6c453,Math.min(10,3+Math.round(ram/10)));
    this.tank.setVelocity(-this.tank.body!.velocity.x*.38,-this.tank.body!.velocity.y*.38);
    if(block.hp<=0)this.destroyBlock(block);
    else {
      const impulse=smasherKnockback(this.stats.ramDamage,speed,this.stats.speed);
      const dx=block.x-this.tank.x,dy=block.y-this.tank.y,distance=Math.hypot(dx,dy);
      if(impulse>0&&distance>0)this.knockbacks.set(block,{x:dx/distance*impulse,y:dy/distance*impulse});
    }
    if(useGameStore.getState().health<=0)this.knockOut();
  }

  private tryAutoRepair(time:number){
    const state=useGameStore.getState();
    if(!canAutoRepair(time,this.lastDamageAt,this.lastRepairAt,state.health,state.maxHealth))return;
    this.lastRepairAt=time;state.repairHealth(repairAmount(state.maxHealth));this.pop(this.tank.x,this.tank.y,0x58c995,6);
  }

  private destroyBlock(block:Block){if(!block.active)return;const{x,y}=block;useGameStore.getState().awardXp(xpForShape(block.kind));this.burns.delete(block);block.destroy();useGameStore.getState().recordBlock();this.pop(x,y,0xffb83e,12);}

  private flushCombatMetrics(time:number){if(this.pendingShots||this.pendingHits)useGameStore.getState().recordCombat(this.pendingShots,this.pendingHits);this.pendingShots=0;this.pendingHits=0;this.lastMetricFlush=time;}
  private tunePerformance(fps:number){if(fps<54)this.projectileBudget=Math.max(MIN_PROJECTILE_BUDGET,this.projectileBudget-24);else if(fps>58)this.projectileBudget=Math.min(MAX_ACTIVE_PROJECTILES,this.projectileBudget+12);const parent=this.game.canvas.parentElement;if(parent){parent.dataset.fps=String(Math.round(fps));parent.dataset.projectileBudget=String(this.projectileBudget);}}

  upsertRemotePlayer(player:NetworkPlayer){const current=this.remotePlayers.get(player.id);if(current){current.targetX=player.x;current.targetY=player.y;current.targetRotation=player.rotation;return;}const machine=this.makeMachine(player.build,false).setRotation(player.rotation);const label=this.add.text(0,-contraptionRadius(player.build)-24,player.build.name,{fontFamily:'Arial Black',fontSize:'13px',color:'#29324a',backgroundColor:'#fffdf8cc',padding:{x:6,y:3}}).setOrigin(.5);const wrapper=this.add.container(player.x,player.y,[machine,label]).setDepth(5).setAlpha(.86);this.remotePlayers.set(player.id,{wrapper,machine,targetX:player.x,targetY:player.y,targetRotation:player.rotation});this.reportRemoteCount();}
  removeRemotePlayer(playerId:string){const remote=this.remotePlayers.get(playerId);if(remote){remote.wrapper.destroy(true);this.remotePlayers.delete(playerId);this.reportRemoteCount();}}
  clearRemotePlayers(){for(const id of [...this.remotePlayers.keys()])this.removeRemotePlayer(id);}
  private updateRemotePlayers(delta:number){const blend=1-Math.exp(-Math.min(delta,100)/65);for(const remote of this.remotePlayers.values()){remote.wrapper.x=Phaser.Math.Linear(remote.wrapper.x,remote.targetX,blend);remote.wrapper.y=Phaser.Math.Linear(remote.wrapper.y,remote.targetY,blend);remote.machine.rotation=Phaser.Math.Angle.RotateTo(remote.machine.rotation,remote.targetRotation,Math.min(delta,100)*.011);}}
  private reportRemoteCount(){const parent=this.game.canvas.parentElement;if(parent)parent.dataset.remotePlayers=String(this.remotePlayers.size);}

  setMultiplayerMode(active:boolean){if(this.multiplayerActive===active)return;this.multiplayerActive=active;useGameStore.getState().resetProgression();this.networkMotion.clear();if(active){this.knockbacks.clear();for(const blocks of this.chunks.values())blocks.forEach(block=>block.active&&block.destroy());this.chunks.clear();this.currentChunk='';this.blocks.clear(true,true);this.staticBlocks.clear(true,true);this.bullets.clear(true,true);this.enemyShots.clear(true,true);this.burns.clear();useGameStore.getState().resetMetrics();}else{this.clearNetworkWorld();useGameStore.getState().resetHealth(this.stats.armor);this.updateChunks(true);}}
  applyNetworkWorld(snapshot:WorldSnapshot,selfId:string){this.setMultiplayerMode(true);if(!this.networkMotion.push(snapshot,performance.now()))return;const remoteIds=new Set<string>();for(const player of snapshot.players){if(player.id===selfId){
      useGameStore.getState().setProgression(player.progression??freshProgression());
      if(player.health<useGameStore.getState().health){this.machine.setAlpha(.5);this.tweens.add({targets:this.machine,alpha:1,duration:180});}
      useGameStore.getState().setHealth(player.health,player.maxHealth);continue;}remoteIds.add(player.id);this.upsertRemotePlayer(player);}for(const id of [...this.remotePlayers.keys()])if(!remoteIds.has(id))this.removeRemotePlayer(id);const parent=this.game.canvas.parentElement;if(parent){parent.dataset.worldRevision=String(snapshot.revision);parent.dataset.networkEnemies=String(snapshot.enemies.length);parent.dataset.networkEnemyIds=snapshot.enemies.map(enemy=>enemy.id).sort().join(',');parent.dataset.networkProjectiles=String(snapshot.projectiles.length);}}
  private syncNetworkEnemies(frame:RenderFrames){
    for(const enemy of frame.from.enemies.values()){
      const position=interpolatePosition(enemy,frame.to.enemies.get(enemy.id),frame.alpha);
      let current=this.networkEnemies.get(enemy.id);
      if(!current){
        const image=this.add.image(position.x,position.y,'enemy-atlas',`enemy-${enemy.variant}-${enemy.level}`).setDepth(3);
        current={image,targetX:position.x,targetY:position.y,health:enemy.health,maxHealth:enemy.maxHealth};this.networkEnemies.set(enemy.id,current);
      }
      current.image.setPosition(position.x,position.y);
      if(enemy.charging)current.image.setTint(0xff8a6a);else current.image.clearTint();
      this.renderBurning(current.image,enemy.burning??false,this.time.now);
      this.updateShapeHealthBar(current.image,enemy.health,enemy.maxHealth,current.image.width-12);
    }
    for(const [id,enemy] of this.networkEnemies)if(!frame.from.enemies.has(id)){enemy.image.destroy();this.networkEnemies.delete(id);}
  }
  private syncNetworkProjectiles(frame:RenderFrames){
    for(const projectile of frame.from.projectiles.values()){
      const next=frame.to.projectiles.get(projectile.id),position=interpolatePosition(projectile,next,frame.alpha);
      const rotation=interpolateRotation(projectile.rotation,next?.rotation??projectile.rotation,frame.alpha);
      let current=this.networkProjectiles.get(projectile.id);
      if(!current){
        const texture=projectile.behavior==='flamethrower'?'fire-puff':projectile.behavior==='hostile'?'enemy-shot':projectile.behavior==='railgun'?'rail-beam':projectile.behavior==='boomerang'?'bullet-boomerang':projectile.behavior==='ricochet'?'bullet-square':'bullet';
        const image=this.add.image(position.x,position.y,texture).setTint(projectile.color).setScale(projectile.size/10).setDepth(4);
        if(projectile.behavior==='railgun')image.setOrigin(0,.5).setDisplaySize(projectile.length??1100,16).clearTint();
        current={image,targetX:position.x,targetY:position.y,targetRotation:rotation};this.networkProjectiles.set(projectile.id,current);
      }
      current.image.setPosition(position.x,position.y).setRotation(rotation);
      if(projectile.behavior==='flamethrower'){
        const age=(projectile.ageMs??0)+((next?.ageMs??projectile.ageMs??0)-(projectile.ageMs??0))*frame.alpha,progress=Math.min(1,age/800);
        current.image.setFrame('0').setRotation(rotation+Math.sin(age*.025)*.1).clearTint().setBlendMode(Phaser.BlendModes.NORMAL).setDisplaySize(44+progress*46,16+progress*30).setAlpha(Math.pow(1-progress,.7)*.9);
      }
      if(projectile.behavior==='railgun'){
        const age=(projectile.ageMs??0)+((next?.ageMs??projectile.ageMs??0)-(projectile.ageMs??0))*frame.alpha;
        current.image.setAlpha(Math.max(0,1-age/70));
      }
    }
    for(const [id,projectile] of this.networkProjectiles)if(!frame.from.projectiles.has(id)){projectile.image.destroy();this.networkProjectiles.delete(id);}
  }
  private updateNetworkEntities(){
    const frame=this.networkMotion.sample(performance.now());if(!frame)return;
    this.syncNetworkEnemies(frame);this.syncNetworkProjectiles(frame);
  }
  private resolveNetworkContacts(){
    // Match the visible, interpolated silhouettes without predicting health or kills.
    for(let pass=0;pass<2;pass++)for(const enemy of this.networkEnemies.values()){
      const image=enemy.image;
      if(Math.hypot(image.x-this.tank.x,image.y-this.tank.y)>contraptionRadius(this.build)+image.width)continue;
      const variant=ENEMY_VARIANTS.find(item=>String(image.frame.name).startsWith(`enemy-${item.id}-`));if(!variant)continue;
      const contact=tankBlockContact(this.collisionOutline,this.tank.x,this.tank.y,this.machine.rotation,blockOutline(variant.shape,variant.size),image.x,image.y,0);
      if(!contact)continue;
      this.tank.setPosition(this.tank.x+contact.x,this.tank.y+contact.y);
      const body=this.tank.body as Phaser.Physics.Arcade.Body;body.updateFromGameObject();
      const depth=Math.hypot(contact.x,contact.y);if(depth<.001)continue;
      const nx=contact.x/depth,ny=contact.y/depth,inward=body.velocity.x*nx+body.velocity.y*ny;
      if(inward<0)this.tank.setVelocity(body.velocity.x-inward*nx,body.velocity.y-inward*ny);
    }
  }

  private clearNetworkWorld(){this.networkMotion.clear();this.clearRemotePlayers();for(const enemy of this.networkEnemies.values())enemy.image.destroy();for(const projectile of this.networkProjectiles.values())projectile.image.destroy();this.networkEnemies.clear();this.networkProjectiles.clear();const parent=this.game.canvas.parentElement;if(parent){parent.dataset.networkEnemies='0';parent.dataset.networkEnemyIds='';parent.dataset.networkProjectiles='0';delete parent.dataset.worldRevision;}}

  private knockOut(){if(this.respawning)return;this.respawning=true;this.enemyShots.clear(true,true);this.burns.clear();this.burns.clear();useGameStore.getState().resetProgression();this.stats=calculateStats(this.build);this.tank.setAcceleration(0).setVelocity(0);this.machine.setAlpha(.25);this.time.delayedCall(900,()=>{this.tank.setPosition(0,0).setVelocity(0);this.machine.setPosition(0,0).setAlpha(1);useGameStore.getState().resetHealth(this.stats.armor);this.respawning=false;this.blocks.clear(true,true);this.staticBlocks.clear(true,true);this.chunks.clear();this.currentChunk='';this.updateChunks(true);});}

  private drawYard(){this.add.circle(0,0,115,0xf6c453,.1).setStrokeStyle(4,0xf6c453,.3);this.add.text(0,-105,'START',{fontFamily:'Arial Black',fontSize:'22px',color:'#29324a'}).setOrigin(.5).setAlpha(.25);}
  private makeTextures(){
    const body=this.make.graphics({x:0,y:0});body.fillStyle(0xffffff).fillCircle(150,150,145).generateTexture('machine-body',300,300);body.destroy();
    const ball=this.make.graphics({x:0,y:0});ball.fillStyle(0x29324a).fillCircle(11,11,11).fillStyle(0xffffff).fillCircle(11,11,7).generateTexture('bullet',22,22);ball.clear().fillStyle(0x29324a).fillRoundedRect(1,1,20,20,4).fillStyle(0xffffff).fillRoundedRect(5,5,12,12,2).generateTexture('bullet-square',22,22);ball.clear().lineStyle(7,0x29324a).beginPath().arc(12,12,9,.45,Math.PI*2-.45).strokePath().lineStyle(3,0xffffff).beginPath().arc(12,12,8,.5,Math.PI*2-.5).strokePath().generateTexture('bullet-boomerang',24,24);ball.destroy();
    ENEMY_VARIANTS.forEach(variant=>{for(let kind=0;kind<3;kind++)this.makeEnemyTexture(variant.id,variant.shape,variant.size,variant.color,kind);});
    const atlas=this.textures.createCanvas('enemy-atlas',512,Math.ceil(ENEMY_VARIANTS.length*3/4)*128)!;
    ENEMY_VARIANTS.forEach((variant,index)=>{for(let kind=0;kind<3;kind++){
      const key=`enemy-${variant.id}-${kind}`,tile=index*3+kind,x=tile%4*128,y=Math.floor(tile/4)*128,size=variant.size+12;
      atlas.getContext().drawImage(this.textures.get(key).getSourceImage() as HTMLCanvasElement,x,y);
      atlas.add(key,0,x,y,size,size);this.textures.remove(key);
    }});atlas.refresh();
    for(const smoke of [false,true]){
      const texture=this.textures.createCanvas(smoke?'fire-smoke':'fire-puff',96,64)!,context=texture.getContext();
      for(let frame=0;frame<1;frame++){context.save();context.translate(frame*96,0);
      const gradient=context.createRadialGradient(38+frame*4,30-frame*2,1,48,32,44);
      if(smoke){gradient.addColorStop(0,'rgba(76,65,61,.35)');gradient.addColorStop(.5,'rgba(96,85,78,.2)');gradient.addColorStop(1,'rgba(96,85,78,0)');}
      else {gradient.addColorStop(0,'rgba(255,255,218,1)');gradient.addColorStop(.18,'rgba(255,232,132,.95)');gradient.addColorStop(.43,'rgba(255,123,19,.95)');gradient.addColorStop(.7,'rgba(238,64,15,.55)');gradient.addColorStop(1,'rgba(190,35,9,0)');}
      context.fillStyle=gradient;context.beginPath();context.ellipse(48,32,46,30-frame*2,0,0,Math.PI*2);context.fill();context.restore();if(!smoke)texture.add(String(frame),0,frame*96,0,96,64);
      }texture.refresh();
    }
    const hostile=this.make.graphics({x:0,y:0});hostile.fillStyle(0x29324a).fillCircle(10,10,9).fillStyle(0xff725e).fillCircle(10,10,6).fillStyle(0xfff0ba).fillCircle(10,10,3).generateTexture('enemy-shot',20,20);hostile.destroy();
    const rail=this.make.graphics({x:0,y:0});rail.fillStyle(0x39d9df,.18).fillRect(0,0,64,16).fillStyle(0x39d9df,.7).fillRect(0,5,64,6).fillStyle(0xeaffff).fillRect(0,7,64,2).generateTexture('rail-beam',64,16);rail.destroy();
    const bit=this.make.graphics({x:0,y:0});bit.fillStyle(0xffffff).fillCircle(4,4,4).generateTexture('bit',8,8);bit.destroy();
  }
  private makeEnemyTexture(id:string,shape:EnemyShape,size:number,color:number,kind:number){
    const padding=6,textureSize=size+padding*2,c=textureSize/2,outer=size/2,inner=outer-5,graphic=this.make.graphics({x:0,y:0});
    const points=(radius:number,sides:number,rotation=-Math.PI/2)=>Array.from({length:sides},(_,i)=>new Phaser.Math.Vector2(c+Math.cos(rotation+i*Math.PI*2/sides)*radius,c+Math.sin(rotation+i*Math.PI*2/sides)*radius));
    const draw=(fill:number,inset=0)=>{const radius=outer-inset;graphic.fillStyle(fill,1);if(shape==='orb')graphic.fillCircle(c,c,radius);else if(shape==='box')graphic.fillRoundedRect(c-radius,c-radius,radius*2,radius*2,Math.max(8,radius*.3));else if(shape==='diamond')graphic.fillPoints(points(radius,4),true);else if(shape==='hex')graphic.fillPoints(points(radius,6),true);else if(shape==='triangle'||shape==='pentagon'||shape==='octagon')graphic.fillPoints(points(radius,shape==='triangle'?3:shape==='pentagon'?5:8),true);else if(shape==='shard')graphic.fillPoints([new Phaser.Math.Vector2(c+radius,c),new Phaser.Math.Vector2(c-radius*.72,c-radius*.72),new Phaser.Math.Vector2(c-radius*.42,c),new Phaser.Math.Vector2(c-radius*.72,c+radius*.72)],true);else graphic.fillRoundedRect(c-radius,c-radius*.62,radius*2,radius*1.24,radius*.62);};
    draw(0x29324a);draw(color,5);
    const ink=0x29324a;
    if(shape==='shard'){
      // A dart has no room for the face used on the rounder enemies.
      graphic.lineStyle(3,ink,1).lineBetween(c+2,c,c+8,c);
      for(let pip=0;pip<=kind;pip++)graphic.fillStyle(ink).fillCircle(c-3,c+(pip-kind/2)*4.5,1.2);
    }else{
      const narrow=shape==='diamond'||shape==='triangle',flat=shape==='capsule';
      const eyeY=c-inner*(flat?.16:.12),eyeSpacing=inner*(narrow?.23:.32),eyeRadius=Math.max(2,size*.045);
      graphic.fillStyle(0xffffff,.28);
      if(narrow)graphic.fillEllipse(c-inner*.16,c-inner*.53,inner*.3,inner*.13);
      else graphic.fillEllipse(c-inner*.24,c-inner*(flat?.36:.52),inner*.48,inner*.18);
      graphic.fillStyle(ink).fillCircle(c-eyeSpacing,eyeY,eyeRadius).fillCircle(c+eyeSpacing,eyeY,eyeRadius);
      const mouthY=c+inner*(flat?.12:.2),mouthWidth=inner*(narrow?.15:.2);
      graphic.lineStyle(Math.max(2,size*.035),ink,1).beginPath().moveTo(c-mouthWidth,mouthY);
      for(let i=1;i<=8;i++){
        const t=i/8;
        graphic.lineTo(c-mouthWidth+mouthWidth*2*t,mouthY+Math.sin(t*Math.PI)*inner*.07);
      }
      graphic.strokePath();
      const pipY=c+inner*(shape==='triangle'?.34:narrow?.48:flat?.38:.62),pipRadius=Math.max(1.3,Math.min(2,size*.028)),pipSpacing=pipRadius*3;
      for(let pip=0;pip<=kind;pip++)graphic.fillStyle(ink,.7).fillCircle(c+(pip-kind/2)*pipSpacing,pipY,pipRadius);
    }
    if(enemyWeapon(id)){
      graphic.fillStyle(ink).fillCircle(c,c+inner*.12,6).fillStyle(0xff725e).fillCircle(c,c+inner*.12,3.5);
      graphic.lineStyle(2,ink).lineBetween(c-inner*.4,c-inner*.36,c-inner*.12,c-inner*.23).lineBetween(c+inner*.4,c-inner*.36,c+inner*.12,c-inner*.23);
    }
    graphic.generateTexture(`enemy-${id}-${kind}`,textureSize,textureSize);graphic.destroy();
  }
  private updateChunks(force=false){const center=chunkAt(this.tank.x,this.tank.y),zoom=useGameStore.getState().cameraZoom,radiusX=Math.max(1,Math.ceil(this.scale.width/(2*zoom*CHUNK_SIZE))),radiusY=Math.max(1,Math.ceil(this.scale.height/(2*zoom*CHUNK_SIZE))),windowKey=`${center.key}:${radiusX},${radiusY}`;if(!force&&windowKey===this.currentChunk)return;this.currentChunk=windowKey;for(const chunk of rectangularChunkWindow(center.x,center.y,radiusX,radiusY)){if(!this.chunks.has(chunk.key))this.generateChunk(chunk.x,chunk.y,chunk.key);}for(const[key,blocks]of this.chunks){const chunk=key.split(',').map(Number);if(Math.abs(chunk[0]-center.x)>radiusX||Math.abs(chunk[1]-center.y)>radiusY){blocks.forEach(block=>block.active&&block.destroy());this.chunks.delete(key);}}}
  private updateBurns(time:number){
    for(const [block,burn] of this.burns){
      if(!block.active){this.burns.delete(block);continue;}
      const result=tickBurn(burn,time);block.hp-=result.damage;
      if(result.burn)this.burns.set(block,result.burn);else this.burns.delete(block);
      if(block.hp<=0)this.destroyBlock(block);
    }
  }
  private renderBurning(image:Phaser.GameObjects.Image,burning:boolean,time:number){
    if(!burning||this.fireVisualCount>=64||time-(this.lastFireVisual.get(image)??0)<110||!this.cameras.main.worldView.contains(image.x,image.y))return;
    this.lastFireVisual.set(image,time);this.fireVisualCount++;
    const smoke=Math.random()<.2,spread=Math.min(30,image.width*.28),x=image.x+(Math.random()-.5)*spread*2,y=image.y+image.height*.12;
    const flame=this.add.image(x,y,smoke?'fire-smoke':'fire-puff').setFrame(smoke?'__BASE':'0').setDepth(smoke?5:7).setAngle(-90+(Math.random()-.5)*25).setDisplaySize(smoke?24:32,smoke?20:18).setAlpha(smoke?.5:.9);
    if(!smoke)flame.setBlendMode(Phaser.BlendModes.NORMAL);
    this.tweens.add({targets:flame,x:x+(Math.random()-.5)*18,y:y-25-Math.random()*28,scaleX:flame.scaleX*(smoke?2:1.5),scaleY:flame.scaleY*(smoke?2:.45),alpha:0,angle:flame.angle+20,duration:smoke?850:450,onComplete:()=>{flame.destroy();this.fireVisualCount--;}});
    if(!smoke&&Math.random()<.25){const ember=this.add.image(x,y,'bit').setTint(0xffbd53).setScale(.2).setDepth(7);this.tweens.add({targets:ember,x:x+(Math.random()-.5)*30,y:y-45,alpha:0,duration:400,onComplete:()=>ember.destroy()});}
  }

  private updateEnemyAttacks(time:number){
    for(const object of this.enemyShots.getChildren()){
      const shot=object as Bullet;if(time-shot.born>3200)shot.destroy();
    }
    for(const object of [...this.blocks.getChildren(),...this.staticBlocks.getChildren()]){
      const block=object as Block,weapon=enemyWeapon(block.variantId);if(!block.active||!weapon)continue;
      const range=Math.hypot(block.x-this.tank.x,block.y-this.tank.y);
      if(range>750){block.windupAt=0;block.clearTint();continue;}
      if(time<block.nextAttack)continue;
      if(!block.windupAt)block.windupAt=time;
      block.setTint(0xff8a6a);if(block.moveSpeed)block.setVelocity(0,0);
      if(time-block.windupAt<500)continue;
      const angle=Math.atan2(this.tank.y-block.y,this.tank.x-block.x);
      for(let i=0;i<weapon.burst;i++){
        const a=angle+(i-(weapon.burst-1)/2)*weapon.spread,r=block.size/2+10;
        const shot=this.enemyShots.create(block.x+Math.cos(a)*r,block.y+Math.sin(a)*r,'enemy-shot') as Bullet|null;
        if(shot){shot.born=time;shot.damage=weapon.damage;shot.setDepth(4).setScale(.65).setVelocity(Math.cos(a)*weapon.speed,Math.sin(a)*weapon.speed);}
      }
      block.nextAttack=time+weapon.cooldown;block.windupAt=0;block.clearTint();
    }
  }
  private hitByEnemyShot(_tankObject:Phaser.Types.Physics.Arcade.GameObjectWithBody,shotObject:Phaser.Types.Physics.Arcade.GameObjectWithBody){
    const shot=shotObject as Bullet;if(!shot.active||this.respawning)return;
    if(!tankBlockContact(this.collisionOutline,this.tank.x,this.tank.y,this.machine.rotation,circleOutline(5),shot.x,shot.y,0))return;
    const damage=shot.damage;shot.destroy();if(this.time.now-this.lastDamageAt<200)return;
    useGameStore.getState().damageHealth(damage);this.lastDamageAt=this.time.now;
    this.machine.setAlpha(.5);this.tweens.add({targets:this.machine,alpha:1,duration:120});
    if(useGameStore.getState().health<=0)this.knockOut();
  }

  private refreshEnemySpawns(time:number){
    if(time-this.lastSpawnRefresh<2000)return;this.lastSpawnRefresh=time;
    const level=levelProgress(useGameStore.getState().progression).level;
    const cameraView=this.cameras.main.worldView,view=new Phaser.Geom.Rectangle(cameraView.x-120,cameraView.y-120,cameraView.width+240,cameraView.height+240);
    let budget=2;
    for(const [key,blocks] of this.chunks){
      const live=blocks.filter(block=>block.active);
      this.chunks.set(key,live);
      const stale=live.find(block=>block.spawnLevel<level&&!view.contains(block.x,block.y));
      let x:number,y:number;
      if(stale){x=stale.x;y=stale.y;stale.destroy();live.splice(live.indexOf(stale),1);}
      else if(live.length<BLOCKS_PER_CHUNK){const [cx,cy]=key.split(',').map(Number);x=(cx+Math.random())*CHUNK_SIZE;y=(cy+Math.random())*CHUNK_SIZE;if(view.contains(x,y)||Math.hypot(x-this.tank.x,y-this.tank.y)<250)continue;}
      else continue;
      const spawn=chooseEnemySpawn(level,Math.random(),Math.random());
      live.push(this.createBlock(x,y,spawn.kind,spawn.variantIndex,Math.random()*Math.PI*2));
      if(--budget<=0)break;
    }
  }

  private generateChunk(cx:number,cy:number,key:string){const random=createChunkRandom(cx,cy),blocks:Block[]=[];for(let i=0;i<BLOCKS_PER_CHUNK;i++){const x=(cx+random())*CHUNK_SIZE,y=(cy+random())*CHUNK_SIZE;if(Phaser.Math.Distance.Between(x,y,this.tank.x,this.tank.y)<190)continue;const spawn=chooseEnemySpawn(levelProgress(useGameStore.getState().progression).level,random(),random());blocks.push(this.createBlock(x,y,spawn.kind,spawn.variantIndex,random()*Math.PI*2));}this.chunks.set(key,blocks);}
  private createBlock(x:number,y:number,kind:number,variantIndex=1,phase=0){const variant=enemyVariant(variantIndex),combat=enemyCombatStats(kind,variant),group=variant.moveSpeed?this.blocks:this.staticBlocks,block=group.create(x,y,'enemy-atlas',`enemy-${variant.id}-${kind}`) as Block;this.blockCounter+=1;block.name=`block-${this.blockCounter}`;block.variantId=variant.id;block.nextAttack=this.time.now+2000+Math.random()*1500;block.windupAt=0;block.kind=kind;block.spawnLevel=levelProgress(useGameStore.getState().progression).level;block.hp=combat.health;block.maxHp=combat.health;block.size=variant.size;block.outline=blockOutline(variant.shape,variant.size);block.contactDamage=combat.contactDamage;block.homeX=x;block.homeY=y;block.moveSpeed=variant.moveSpeed;block.roamRadius=variant.roamRadius;block.moveAngle=phase;block.movePhase=phase;const initialVelocity=enemyVelocity(0,variant,phase,x,y,x,y);block.targetVelocityX=initialVelocity.x;block.targetVelocityY=initialVelocity.y;block.setAngle(((x+y)%21)-10);if(variant.moveSpeed)block.setImmovable(true).setPushable(false).setVelocity(initialVelocity.x,initialVelocity.y);const textureSize=variant.size+12;if(variant.shape==='orb')block.setCircle(variant.size/2,6,6);else{const body=block.body as Phaser.Physics.Arcade.Body|Phaser.Physics.Arcade.StaticBody,bodySize=variant.size*Math.SQRT2,offset=(textureSize-bodySize)/2;body.setSize(bodySize,bodySize).setOffset(offset,offset);}return block;}
  private updateShapeHealthBar(image:Phaser.GameObjects.Image,health:number,maximum:number,size:number){
    let bar=this.healthBars.get(image);
    if(health>=maximum||health<=0){bar?.setVisible(false);return;}
    if(!bar){
      bar=this.add.graphics().setDepth(8);this.healthBars.set(image,bar);
      image.once('destroy',()=>{bar!.destroy();this.healthBars.delete(image);});
    }
    const width=Math.max(28,Math.min(48,size*.7)),ratio=Math.max(0,Math.min(1,health/maximum));
    bar.setVisible(true).setPosition(image.x,image.y-size/2-12);
    const previous=this.healthBarValues.get(image);
    if(previous?.health===health&&previous.maximum===maximum&&previous.size===size)return;
    this.healthBarValues.set(image,{health,maximum,size});bar.clear();
    bar.fillStyle(0x29324a,.9).fillRoundedRect(-width/2-2,-2,width+4,8,4);
    bar.fillStyle(0xfff8e8,1).fillRoundedRect(-width/2,0,width,4,2);
    bar.fillStyle(ratio>.35?0x58c995:0xff725e,1).fillRoundedRect(-width/2,0,Math.max(1,width*ratio),4,2);
  }

  private moveShape(block:Block,dx:number,dy:number){
    block.setPosition(block.x+dx,block.y+dy);block.homeX+=dx;block.homeY+=dy;
    if(block.body instanceof Phaser.Physics.Arcade.StaticBody)block.refreshBody();
    else (block.body as Phaser.Physics.Arcade.Body).updateFromGameObject();
  }

  private updateShapeCollisions(time:number){
    for(const [key,last] of this.shapeContacts)if(time-last>520)this.shapeContacts.delete(key);
    const grid=new Map<string,Block[]>(),cellSize=128;
    for(const group of [this.blocks,this.staticBlocks])for(const child of [...group.getChildren()]){
      const block=child as Block;
      if(!block.active||Math.hypot(block.x-this.tank.x,block.y-this.tank.y)>ACTIVE_ENEMY_RADIUS)continue;
      const cx=Math.floor(block.x/cellSize),cy=Math.floor(block.y/cellSize);
      for(let ox=-1;ox<=1;ox++)for(let oy=-1;oy<=1;oy++)for(const other of grid.get(`${cx+ox},${cy+oy}`)??[]){
        if(!block.active||!other.active||Math.hypot(block.x-other.x,block.y-other.y)>(block.size+other.size)*Math.SQRT1_2)continue;
        const contact=tankBlockContact([block.outline],block.x,block.y,block.rotation,other.outline,other.x,other.y,other.rotation);
        if(!contact)continue;
        const depth=Math.hypot(contact.x,contact.y);if(depth<.001)continue;
        const nx=contact.x/depth,ny=contact.y/depth;
        const a=this.knockbacks.get(block)??{x:0,y:0},b=this.knockbacks.get(other)??{x:0,y:0};
        const av=block.body!.velocity,bv=other.body!.velocity;
        const closing=(b.x+bv.x-a.x-av.x)*nx+(b.y+bv.y-a.y-av.y)*ny;
        this.moveShape(block,contact.x*.51,contact.y*.51);this.moveShape(other,-contact.x*.51,-contact.y*.51);
        if(closing<=0)continue;
        const impulse=closing*.8;
        this.knockbacks.set(block,{x:a.x+nx*impulse,y:a.y+ny*impulse});
        this.knockbacks.set(other,{x:b.x-nx*impulse,y:b.y-ny*impulse});
        const key=[block.name,other.name].sort().join(':');
        if(time-(this.shapeContacts.get(key)??-Infinity)<520)continue;
        const damageA=shapeImpactDamage(closing,block.maxHp),damageB=shapeImpactDamage(closing,other.maxHp);
        if(!damageA&&!damageB)continue;
        this.shapeContacts.set(key,time);block.hp-=damageA;other.hp-=damageB;
        this.pop((block.x+other.x)/2,(block.y+other.y)/2,0xf6c453,5);
        if(block.hp<=0)this.destroyBlock(block);if(other.hp<=0)this.destroyBlock(other);
      }
      if(block.active){const key=`${cx},${cy}`;const bucket=grid.get(key)??[];bucket.push(block);grid.set(key,bucket);}
    }
  }

  private updateKnockbacks(delta:number){
    const dt=Math.min(delta,50)/1000,decay=Math.exp(-5*dt);
    for(const [block,velocity] of this.knockbacks){
      if(!block.active){this.knockbacks.delete(block);continue;}
      const dx=velocity.x*(1-decay)/5,dy=velocity.y*(1-decay)/5;
      block.setPosition(block.x+dx,block.y+dy);block.homeX+=dx;block.homeY+=dy;
      if(block.body instanceof Phaser.Physics.Arcade.StaticBody)block.refreshBody();
      else (block.body as Phaser.Physics.Arcade.Body).updateFromGameObject();
      velocity.x*=decay;velocity.y*=decay;
      if(Math.hypot(velocity.x,velocity.y)<8)this.knockbacks.delete(block);
    }
  }

  private updateMagnet(delta:number){
    if(this.stats.magnet<=0)return;
    for(const group of [this.blocks,this.staticBlocks])for(const child of group.getChildren()){
      const block=child as Block;if(!block.active||this.knockbacks.has(block))continue;
      const dx=this.tank.x-block.x,dy=this.tank.y-block.y,distance=Math.hypot(dx,dy);
      const step=magnetPullDistance(this.stats.magnet,distance,contraptionRadius(this.build)+Math.hypot(block.displayWidth,block.displayHeight)/2+24,delta);
      if(step<=0)continue;
      const offsetX=dx/distance*step,offsetY=dy/distance*step;
      block.setPosition(block.x+offsetX,block.y+offsetY);
      block.homeX+=offsetX;block.homeY+=offsetY;
      if(group===this.staticBlocks)block.refreshBody();
      else (block.body as Phaser.Physics.Arcade.Body).reset(block.x,block.y);
    }
  }

  private updateEnemies(time:number,delta:number){const refreshSteering=time-this.lastEnemySteering>=ENEMY_STEERING_INTERVAL_MS;if(refreshSteering)this.lastEnemySteering=time;for(const child of this.blocks.getChildren()){const block=child as Block;if(!block.active||!block.moveSpeed)continue;if(Phaser.Math.Distance.Squared(block.x,block.y,this.tank.x,this.tank.y)>ACTIVE_ENEMY_RADIUS*ACTIVE_ENEMY_RADIUS){block.targetVelocityX=0;block.targetVelocityY=0;if(block.body!.velocity.lengthSq()>0)block.setVelocity(0);continue;}if(refreshSteering){const target=enemyVelocity(time,block,block.movePhase,block.x,block.y,block.homeX,block.homeY);block.targetVelocityX=target.x;block.targetVelocityY=target.y;}const velocity=block.body!.velocity;block.setVelocity(Phaser.Math.Linear(velocity.x,block.targetVelocityX,1-Math.exp(-Math.min(delta,50)/180)),Phaser.Math.Linear(velocity.y,block.targetVelocityY,1-Math.exp(-Math.min(delta,50)/180)));}}
  private pop(x:number,y:number,color:number,count:number){const effectBudget=Math.min(MAX_EFFECT_BITS,Math.max(24,Math.round(this.projectileBudget/2))),available=Math.min(count,Math.max(0,effectBudget-this.activeEffectBits));for(let i=0;i<available;i++){this.activeEffectBits+=1;const bit=this.add.image(x,y,'bit').setTint(color).setDepth(10),a=Math.random()*Math.PI*2,d=Phaser.Math.Between(15,55);this.tweens.add({targets:bit,x:x+Math.cos(a)*d,y:y+Math.sin(a)*d,alpha:0,scale:.3,duration:350,onComplete:()=>{this.activeEffectBits=Math.max(0,this.activeEffectBits-1);bit.destroy();}});}}
}
