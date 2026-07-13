import Phaser from 'phaser';
import { TankBuild, calculateStats, getPart } from './config';
import { useGameStore } from '../store';

type Block = Phaser.Physics.Arcade.Image & { hp: number; maxHp: number; kind: number };
type Bullet = Phaser.Physics.Arcade.Image & { damage: number; born: number };

export class TestScene extends Phaser.Scene {
  private build: TankBuild;
  private stats;
  private tank!: Phaser.Physics.Arcade.Image;
  private barrel!: Phaser.GameObjects.Container;
  private bullets!: Phaser.Physics.Arcade.Group;
  private blocks!: Phaser.Physics.Arcade.StaticGroup;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private lastShot = 0;

  constructor(build: TankBuild) {
    super('TestYard');
    this.build = build;
    this.stats = calculateStats(build);
  }

  create() {
    this.cameras.main.setBackgroundColor('#fff8e8');
    this.physics.world.setBounds(0, 0, 1600, 1000);
    this.cameras.main.setBounds(0, 0, 1600, 1000);
    this.drawYard();
    this.makeTextures();

    this.blocks = this.physics.add.staticGroup();
    this.spawnBlocks();
    this.bullets = this.physics.add.group({ maxSize: 80 });
    this.tank = this.physics.add.image(800, 500, 'tank-body');
    this.tank.setCircle(29, 3, 3).setCollideWorldBounds(true).setDrag(700).setMaxVelocity(this.stats.speed);
    this.tank.setDepth(5);

    const cannon = getPart(this.build.cannon);
    this.barrel = this.add.container(this.tank.x, this.tank.y).setDepth(6);
    for (let i = 0; i < cannon.stats.barrels!; i++) {
      const y = cannon.stats.barrels === 2 ? (i === 0 ? -7 : 7) : 0;
      const tube = this.add.rectangle(30, y, cannon.id === 'bonker' ? 55 : 48, cannon.id === 'bonker' ? 17 : 11, cannon.color).setStrokeStyle(4, 0x29324a);
      this.barrel.add(tube);
    }
    this.barrel.add(this.add.circle(0, 0, 22, Phaser.Display.Color.HexStringToColor(this.build.color).color).setStrokeStyle(5, 0x29324a));

    this.cameras.main.startFollow(this.tank, true, 0.08, 0.08);
    this.cameras.main.setZoom(1);
    const keyboard = this.input.keyboard!;
    this.keys = keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT') as Record<string, Phaser.Input.Keyboard.Key>;
    this.physics.add.collider(this.tank, this.blocks);
    this.physics.add.overlap(this.bullets, this.blocks, this.hitBlock as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback, undefined, this);
  }

  update(time: number) {
    const left = this.keys.A.isDown || this.keys.LEFT.isDown;
    const right = this.keys.D.isDown || this.keys.RIGHT.isDown;
    const up = this.keys.W.isDown || this.keys.UP.isDown;
    const down = this.keys.S.isDown || this.keys.DOWN.isDown;
    let x = Number(right) - Number(left);
    let y = Number(down) - Number(up);
    if (x || y) {
      const length = Math.hypot(x, y); x /= length; y /= length;
      this.tank.setAcceleration(x * this.stats.acceleration, y * this.stats.acceleration);
    } else this.tank.setAcceleration(0).setVelocity(this.tank.body!.velocity.x * 0.88, this.tank.body!.velocity.y * 0.88);

    const pointer = this.input.activePointer;
    const world = pointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
    const angle = Phaser.Math.Angle.Between(this.tank.x, this.tank.y, world.x, world.y);
    this.tank.setRotation(angle + Math.PI / 2);
    this.barrel.setPosition(this.tank.x, this.tank.y).setRotation(angle);
    if (pointer.isDown && time - this.lastShot >= 1000 / this.stats.fireRate) this.fire(time, angle);

    for (const child of this.bullets.children) {
      const bullet = child as Bullet;
      if (bullet.active && time - bullet.born > 1800) bullet.destroy();
    }
  }

  private fire(time: number, angle: number) {
    this.lastShot = time;
    const barrelCount = this.stats.barrels;
    for (let i = 0; i < barrelCount; i++) {
      const offset = barrelCount === 2 ? (i === 0 ? -this.stats.spread : this.stats.spread) : 0;
      const shotAngle = angle + offset;
      const bullet = this.bullets.create(this.tank.x + Math.cos(angle) * 54, this.tank.y + Math.sin(angle) * 54, 'bullet') as Bullet;
      bullet.setActive(true).setVisible(true).setDepth(4).setScale(this.stats.projectileSize / 10);
      bullet.setVelocity(Math.cos(shotAngle) * this.stats.projectileSpeed, Math.sin(shotAngle) * this.stats.projectileSpeed);
      bullet.damage = this.stats.damage; bullet.born = time;
      useGameStore.getState().recordShot();
    }
    this.tweens.add({ targets: this.barrel, scaleX: 0.9, duration: 45, yoyo: true });
  }

  private hitBlock(bulletObject: Phaser.Types.Physics.Arcade.GameObjectWithBody, blockObject: Phaser.Types.Physics.Arcade.GameObjectWithBody) {
    const bullet = bulletObject as Bullet;
    const block = blockObject as Block;
    if (!bullet.active || !block.active) return;
    bullet.destroy();
    block.hp -= bullet.damage;
    useGameStore.getState().recordHit();
    block.setTint(block.kind === 2 ? 0xffc7c1 : 0xffffff);
    this.time.delayedCall(70, () => block.active && block.clearTint());
    this.pop(block.x, block.y, block.kind === 2 ? 0xff725e : 0xf6c453, 4);
    block.setScale(0.94);
    this.tweens.add({ targets: block, scale: 1, duration: 90 });
    if (block.hp <= 0) {
      const x = block.x, y = block.y;
      block.destroy();
      useGameStore.getState().recordBlock();
      this.pop(x, y, 0xffb83e, 12);
      this.time.delayedCall(1800, () => this.createBlock(x, y, Phaser.Math.Between(0, 2)));
    }
  }

  private drawYard() {
    const g = this.add.graphics();
    g.fillStyle(0xfff8e8).fillRect(0, 0, 1600, 1000);
    g.lineStyle(2, 0xe6d9bc, 0.5);
    for (let x = 0; x <= 1600; x += 80) g.lineBetween(x, 0, x, 1000);
    for (let y = 0; y <= 1000; y += 80) g.lineBetween(0, y, 1600, y);
    g.lineStyle(14, 0xf6c453, 1).strokeRoundedRect(10, 10, 1580, 980, 22);
    g.lineStyle(3, 0x29324a, 0.7).strokeRoundedRect(17, 17, 1566, 966, 16);
    this.add.text(800, 90, 'THE SMASH YARD', { fontFamily: 'Arial Black', fontSize: '44px', color: '#29324a' }).setOrigin(0.5).setAlpha(0.14);
  }

  private makeTextures() {
    const body = this.make.graphics({ x: 0, y: 0 });
    const color = Phaser.Display.Color.HexStringToColor(this.build.color).color;
    body.fillStyle(0x29324a).fillRoundedRect(0, 0, 64, 70, 20);
    body.fillStyle(0x46506a).fillRoundedRect(5, 5, 12, 60, 7).fillRoundedRect(47, 5, 12, 60, 7);
    body.fillStyle(color).fillRoundedRect(13, 8, 38, 54, getPart(this.build.armor).id === 'bubble' ? 19 : 10);
    body.fillStyle(0xffffff, .3).fillRoundedRect(19, 13, 8, 33, 4);
    body.generateTexture('tank-body', 64, 70); body.destroy();
    const ball = this.make.graphics({ x: 0, y: 0 });
    ball.fillStyle(0x29324a).fillCircle(11, 11, 11).fillStyle(getPart(this.build.cannon).color).fillCircle(11, 11, 7);
    ball.generateTexture('bullet', 22, 22); ball.destroy();
    [0x58c995, 0x47b8e8, 0xff725e].forEach((colorValue, i) => {
      const block = this.make.graphics({ x: 0, y: 0 });
      block.fillStyle(0x29324a).fillRoundedRect(0, 0, 58, 58, 14).fillStyle(colorValue).fillRoundedRect(5, 5, 48, 48, 10);
      block.fillStyle(0xffffff, .32).fillRoundedRect(11, 10, 25, 8, 4).fillCircle(18, 30, 5).fillCircle(38, 30, 5);
      block.lineStyle(3, 0x29324a).lineBetween(19, 43, 39, 43);
      block.generateTexture(`block-${i}`, 58, 58); block.destroy();
    });
    const bit = this.make.graphics({ x: 0, y: 0 }); bit.fillStyle(0xffffff).fillCircle(4, 4, 4).generateTexture('bit', 8, 8); bit.destroy();
  }

  private spawnBlocks() {
    const safe = new Phaser.Geom.Circle(800, 500, 180);
    for (let i = 0; i < 34; i++) {
      let x = Phaser.Math.Between(100, 1500), y = Phaser.Math.Between(150, 900);
      while (safe.contains(x, y)) { x = Phaser.Math.Between(100, 1500); y = Phaser.Math.Between(150, 900); }
      this.createBlock(x, y, Phaser.Math.Between(0, 2));
    }
  }

  private createBlock(x: number, y: number, kind: number) {
    if (!this.blocks) return;
    const block = this.blocks.create(x, y, `block-${kind}`) as Block;
    block.kind = kind; block.maxHp = [28, 52, 85][kind]; block.hp = block.maxHp;
    block.setAngle(Phaser.Math.Between(-10, 10)); block.refreshBody();
  }

  private pop(x: number, y: number, color: number, count: number) {
    for (let i = 0; i < count; i++) {
      const bit = this.add.image(x, y, 'bit').setTint(color).setDepth(10);
      const angle = Math.random() * Math.PI * 2, distance = Phaser.Math.Between(15, 55);
      this.tweens.add({ targets: bit, x: x + Math.cos(angle) * distance, y: y + Math.sin(angle) * distance, alpha: 0, scale: 0.3, duration: 350, onComplete: () => bit.destroy() });
    }
  }
}
