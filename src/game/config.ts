export type PartKind = 'shooter' | 'mover' | 'shell' | 'gadget';
export type MountIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type ShooterBehavior = 'popper' | 'bonker' | 'sprinkler' | 'boomerang' | 'wiggler' | 'splitter' | 'ricochet';

export type Part = {
  id: string;
  kind: PartKind;
  name: string;
  kidLabel: string;
  description: string;
  icon: string;
  cost: number;
  color: number;
  shape: 'barrel' | 'pod' | 'booster' | 'plate' | 'wheel' | 'orb' | 'spike';
  behavior?: ShooterBehavior;
  stats: Partial<PartStats>;
};

export type PartStats = {
  speed: number; acceleration: number; armor: number; magnet: number; thrust: number; ramDamage: number;
  damage: number; fireRate: number; projectileSpeed: number; projectileSize: number; spread: number; burst: number;
};

export type Attachment = {
  uid: string;
  partId: string;
  mount: MountIndex;
  layer: 0 | 1;
};

export type TankBuild = {
  version: 2;
  name: string;
  color: string;
  attachments: Attachment[];
};

export type WeaponSpec = {
  uid: string;
  mount: MountIndex;
  layer: 0 | 1;
  damage: number;
  fireRate: number;
  projectileSpeed: number;
  projectileSize: number;
  spread: number;
  burst: number;
  color: number;
  behavior: ShooterBehavior;
};

export type BoosterSpec = { uid: string; mount: MountIndex; layer: 0 | 1; thrust: number; color: number };

export type TankStats = {
  speed: number;
  acceleration: number;
  armor: number;
  magnet: number;
  weapons: WeaponSpec[];
  boosters: BoosterSpec[];
  ramDamage: number;
};

export const MAX_LAYERS = 2;
export const WILD_BUILD_TARGET = 18;
// Kept as a finite compatibility value so an older Workshop module can safely
// finish a Vite hot reload. New code treats bolts as informational only.
export const MAX_BOLTS = 64;

export const PARTS: Part[] = [
  { id: 'popper', kind: 'shooter', name: 'Popper', kidLabel: 'Rapid straight shots', description: 'Pops out fast little pellets in a straight line.', icon: '●', cost: 2, color: 0x47b8e8, shape: 'barrel', behavior: 'popper', stats: { damage: 9, fireRate: 5.2, projectileSpeed: 520, projectileSize: 6, burst: 1, spread: 0 } },
  { id: 'bonker', kind: 'shooter', name: 'Bonker', kidLabel: 'Heavy piercing ball', description: 'A slow giant ball that can bonk through two blocks.', icon: '⬤', cost: 4, color: 0xff725e, shape: 'barrel', behavior: 'bonker', stats: { damage: 34, fireRate: 1.15, projectileSpeed: 320, projectileSize: 14, burst: 1, spread: 0 } },
  { id: 'sprinkler', kind: 'shooter', name: 'Sprinkler', kidLabel: 'Real three-way spray', description: 'Fires three separate pellets in a wide fan.', icon: '∴', cost: 3, color: 0x936ee8, shape: 'pod', behavior: 'sprinkler', stats: { damage: 7, fireRate: 2.4, projectileSpeed: 420, projectileSize: 6, burst: 3, spread: 0.2 } },
  { id: 'boomer', kind: 'shooter', name: 'Boomerang', kidLabel: 'Flies out, comes back', description: 'A returning disc that can hit blocks on both trips.', icon: '↩', cost: 3, color: 0xf08a24, shape: 'pod', behavior: 'boomerang', stats: { damage: 16, fireRate: 1.35, projectileSpeed: 390, projectileSize: 11, burst: 1, spread: 0 } },
  { id: 'wiggler', kind: 'shooter', name: 'Wiggler', kidLabel: 'S-curving shots', description: 'Its glowing pellets weave left and right through the yard.', icon: '〰', cost: 3, color: 0x30b27a, shape: 'pod', behavior: 'wiggler', stats: { damage: 11, fireRate: 2.2, projectileSpeed: 410, projectileSize: 8, burst: 1, spread: 0 } },
  { id: 'splitter', kind: 'shooter', name: 'Splitter', kidLabel: 'One becomes three', description: 'The shell travels forward, then bursts into three smaller shots.', icon: '◆', cost: 4, color: 0xe7658c, shape: 'pod', behavior: 'splitter', stats: { damage: 13, fireRate: 1.4, projectileSpeed: 380, projectileSize: 11, burst: 1, spread: 0 } },
  { id: 'ricochet', kind: 'shooter', name: 'Block Bouncer', kidLabel: 'Bounces off blocks', description: 'Square shots ricochet away after hitting a block.', icon: '◇', cost: 3, color: 0xf6c453, shape: 'barrel', behavior: 'ricochet', stats: { damage: 12, fireRate: 1.8, projectileSpeed: 440, projectileSize: 8, burst: 1, spread: 0 } },
  { id: 'wheel', kind: 'mover', name: 'Zippy Wheel', kidLabel: 'More speed', description: 'Add several for a super-fast build.', icon: '◉', cost: 2, color: 0x30b27a, shape: 'wheel', stats: { speed: 32, acceleration: 120 } },
  { id: 'rocket', kind: 'mover', name: 'Back Booster', kidLabel: 'Forward blast', description: 'Put it on the back socket to blast forward.', icon: '▲', cost: 3, color: 0xff725e, shape: 'booster', stats: { speed: 18, thrust: 520 } },
  { id: 'twin-booster', kind: 'mover', name: 'Twin Booster', kidLabel: 'Double flames', description: 'A wide two-nozzle booster with a mighty push.', icon: '▲▲', cost: 4, color: 0x936ee8, shape: 'booster', stats: { speed: 28, thrust: 760 } },
  { id: 'micro-booster', kind: 'mover', name: 'Micro Booster', kidLabel: 'Tiny side kick', description: 'A small booster for clever sideways movement.', icon: '›', cost: 2, color: 0x47b8e8, shape: 'booster', stats: { speed: 10, thrust: 300 } },
  { id: 'crawler', kind: 'mover', name: 'Crawler Foot', kidLabel: 'Steady grip', description: 'Strong control for heavy builds.', icon: '∞', cost: 2, color: 0x6c7a89, shape: 'wheel', stats: { speed: 18, acceleration: 180 } },
  { id: 'bubble', kind: 'shell', name: 'Bubble Plate', kidLabel: 'Soft shield', description: 'A round shield plate for any side.', icon: '◒', cost: 2, color: 0x58c995, shape: 'plate', stats: { armor: 40 } },
  { id: 'brick', kind: 'shell', name: 'Brick Plate', kidLabel: 'Extra sturdy', description: 'A heavy plate that can be stacked.', icon: '▰', cost: 3, color: 0xe7658c, shape: 'plate', stats: { armor: 75, speed: -8 } },
  { id: 'bumper', kind: 'shell', name: 'Bumper', kidLabel: 'Bouncy edge', description: 'A cheap little protective bumper.', icon: '◡', cost: 1, color: 0xf6c453, shape: 'plate', stats: { armor: 20 } },
  { id: 'spike', kind: 'shell', name: 'Spike Crown', kidLabel: 'Crash damage', description: 'Sharp points that make ramming blocks much stronger.', icon: '✹', cost: 3, color: 0xff725e, shape: 'spike', stats: { armor: 18, ramDamage: 28 } },
  { id: 'drill', kind: 'gadget', name: 'Crash Drill', kidLabel: 'Maximum ramming', description: 'A spinning-looking nose built to smash strong blocks.', icon: '▶', cost: 4, color: 0x936ee8, shape: 'spike', stats: { ramDamage: 45 } },
  { id: 'magnet', kind: 'gadget', name: 'Block Magnet', kidLabel: 'Pulls prizes', description: 'A curious orb with future powers.', icon: 'U', cost: 2, color: 0x47b8e8, shape: 'orb', stats: { magnet: 60 } },
  { id: 'lamp', kind: 'gadget', name: 'Happy Lamp', kidLabel: 'Just for fun', description: 'Glows because every build needs flair.', icon: '✦', cost: 1, color: 0xf6c453, shape: 'orb', stats: {} },
];

let uidCounter = 0;
export function makeAttachment(partId: string, mount: MountIndex, layer: 0 | 1): Attachment {
  uidCounter += 1;
  return { uid: `part-${Date.now().toString(36)}-${uidCounter}`, partId, mount, layer };
}

export const DEFAULT_BUILD: TankBuild = {
  version: 2,
  name: 'My Contraption',
  color: '#5b7cfa',
  attachments: [
    { uid: 'starter-popper', partId: 'popper', mount: 0, layer: 0 },
    { uid: 'starter-wheel-a', partId: 'wheel', mount: 3, layer: 0 },
    { uid: 'starter-wheel-b', partId: 'wheel', mount: 5, layer: 0 },
    { uid: 'starter-bumper', partId: 'bumper', mount: 4, layer: 0 },
  ],
};

export function getPart(id: string): Part {
  const part = PARTS.find((item) => item.id === id);
  if (!part) throw new Error(`Unknown contraption part: ${id}`);
  return part;
}

export function buildCost(build: TankBuild): number {
  return build.attachments.reduce((total, item) => total + getPart(item.partId).cost, 0);
}

export function nextLayerAt(build: TankBuild, mount: MountIndex): 0 | 1 | null {
  const used = new Set(build.attachments.filter((item) => item.mount === mount).map((item) => item.layer));
  if (!used.has(0)) return 0;
  if (!used.has(1)) return 1;
  return null;
}

export function canAttach(build: TankBuild, partId: string, mount: MountIndex): boolean {
  getPart(partId); // Validate the part id; cost is informational, never a blocker.
  return nextLayerAt(build, mount) !== null;
}

export function attachPart(build: TankBuild, partId: string, mount: MountIndex): TankBuild {
  const layer = nextLayerAt(build, mount);
  if (layer === null || !canAttach(build, partId, mount)) return build;
  return { ...build, attachments: [...build.attachments, makeAttachment(partId, mount, layer)] };
}

export function removeAttachment(build: TankBuild, uid: string): TankBuild {
  return { ...build, attachments: build.attachments.filter((item) => item.uid !== uid) };
}

export function replaceAttachment(build: TankBuild, uid: string, partId: string): TankBuild {
  getPart(partId);
  if (!build.attachments.some((item) => item.uid === uid)) return build;
  return { ...build, attachments: build.attachments.map((item) => item.uid === uid ? { ...item, partId } : item) };
}

export function calculateStats(build: TankBuild): TankStats {
  const stats: TankStats = { speed: 105, acceleration: 430, armor: 70, magnet: 0, weapons: [], boosters: [], ramDamage: 8 };
  for (const attachment of build.attachments) {
    const part = getPart(attachment.partId);
    stats.speed += part.stats.speed ?? 0;
    stats.acceleration += part.stats.acceleration ?? 0;
    stats.armor += part.stats.armor ?? 0;
    stats.magnet += part.stats.magnet ?? 0;
    stats.ramDamage += part.stats.ramDamage ?? 0;
    if (part.kind === 'shooter') {
      stats.weapons.push({ uid: attachment.uid, mount: attachment.mount, layer: attachment.layer, damage: part.stats.damage!, fireRate: part.stats.fireRate!, projectileSpeed: part.stats.projectileSpeed!, projectileSize: part.stats.projectileSize!, spread: part.stats.spread!, burst: part.stats.burst!, color: part.color, behavior: part.behavior! });
    }
    if (part.shape === 'booster') stats.boosters.push({ uid: attachment.uid, mount: attachment.mount, layer: attachment.layer, thrust: part.stats.thrust!, color: part.color });
  }
  return stats;
}

export function boosterThrustForDirection(boosters: BoosterSpec[], aim: number, moveX: number, moveY: number): number {
  return boosters.reduce((total, booster) => {
    const thrustAngle = aim + booster.mount * Math.PI / 4 + Math.PI;
    const alignment = Math.max(0, moveX * Math.cos(thrustAngle) + moveY * Math.sin(thrustAngle));
    return total + booster.thrust * alignment;
  }, 0);
}

export const BOOMERANG_RETURN_MS = 480;
export const SPLITTER_BURST_MS = 430;
export function shouldBoomerangReturn(ageMs: number): boolean { return ageMs >= BOOMERANG_RETURN_MS; }
export function shouldSplitterBurst(ageMs: number, alreadySplit: boolean): boolean { return !alreadySplit && ageMs >= SPLITTER_BURST_MS; }
export function wigglerHeading(baseAngle: number, ageMs: number, phase = 0): number { return baseAngle + Math.sin(ageMs / 105 + phase) * .58; }

export function randomBuild(random = Math.random): TankBuild {
  let build: TankBuild = { version: 2, name: 'Wild Thing', color: ['#5b7cfa', '#ff725e', '#30b27a', '#936ee8', '#f08a24'][Math.floor(random() * 5)], attachments: [] };
  const shuffledMounts = ([0,1,2,3,4,5,6,7] as MountIndex[]).sort(() => random() - .5);
  build = attachPart(build, ['popper', 'sprinkler', 'bonker'][Math.floor(random() * 3)], shuffledMounts[0]);
  let attempts = 0;
  while (attempts++ < 30 && buildCost(build) < WILD_BUILD_TARGET) {
    const part = PARTS[Math.floor(random() * PARTS.length)];
    const mount = shuffledMounts[Math.floor(random() * shuffledMounts.length)];
    const next = attachPart(build, part.id, mount);
    if (next !== build) build = next;
  }
  return build;
}

export function migrateBuild(value: unknown): TankBuild {
  if (value && typeof value === 'object' && 'version' in value && (value as TankBuild).version === 2) return value as TankBuild;
  return DEFAULT_BUILD;
}
