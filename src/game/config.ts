export type SlotType = 'cannon' | 'armor' | 'engine';

export type Part = {
  id: string;
  slot: SlotType;
  name: string;
  kidLabel: string;
  description: string;
  icon: string;
  cost: number;
  color: number;
  stats: Partial<TankStats>;
};

export type TankBuild = Record<SlotType, string> & { color: string };
export type TankStats = {
  speed: number;
  acceleration: number;
  damage: number;
  fireRate: number;
  projectileSpeed: number;
  projectileSize: number;
  armor: number;
  barrels: number;
  spread: number;
};

export const MAX_BOLTS = 10;

export const PARTS: Part[] = [
  { id: 'popper', slot: 'cannon', name: 'Popper', kidLabel: 'Fast & bouncy', description: 'Lots of little zippy shots.', icon: '●', cost: 2, color: 0x47b8e8, stats: { damage: 10, fireRate: 5, projectileSpeed: 480, projectileSize: 7, barrels: 1, spread: 0 } },
  { id: 'bonker', slot: 'cannon', name: 'Bonker', kidLabel: 'Big boom', description: 'One huge, powerful ball.', icon: '⬤', cost: 4, color: 0xff725e, stats: { damage: 35, fireRate: 1.4, projectileSpeed: 330, projectileSize: 14, barrels: 1, spread: 0 } },
  { id: 'twins', slot: 'cannon', name: 'Twins', kidLabel: 'Double trouble', description: 'Two shots fly out together.', icon: '●●', cost: 3, color: 0x936ee8, stats: { damage: 12, fireRate: 3, projectileSpeed: 430, projectileSize: 7, barrels: 2, spread: 0.12 } },
  { id: 'cardboard', slot: 'armor', name: 'Cardboard', kidLabel: 'Quick & light', description: 'Light armor means fast driving.', icon: '◇', cost: 1, color: 0xf0ad4e, stats: { armor: 70, speed: 230 } },
  { id: 'bubble', slot: 'armor', name: 'Bubble Shell', kidLabel: 'Safe & round', description: 'A bouncy shield for exploring.', icon: '◉', cost: 3, color: 0x58c995, stats: { armor: 130, speed: 195 } },
  { id: 'brick', slot: 'armor', name: 'Brick Box', kidLabel: 'Super sturdy', description: 'Strong, chunky, and a bit slow.', icon: '▣', cost: 4, color: 0xe7658c, stats: { armor: 210, speed: 160 } },
  { id: 'windup', slot: 'engine', name: 'Wind-up', kidLabel: 'Easy rider', description: 'Smooth and simple to steer.', icon: '⌁', cost: 1, color: 0xffce54, stats: { acceleration: 600 } },
  { id: 'rocket', slot: 'engine', name: 'Rocket', kidLabel: 'Zoom zoom!', description: 'Fast starts and speedy turns.', icon: '▲', cost: 4, color: 0xff725e, stats: { acceleration: 1200, speed: 55 } },
  { id: 'crawler', slot: 'engine', name: 'Crawler', kidLabel: 'Strong push', description: 'Heavy tracks with steady control.', icon: '∞', cost: 2, color: 0x6c7a89, stats: { acceleration: 850, speed: 15 } },
];

export const DEFAULT_BUILD: TankBuild = { cannon: 'popper', armor: 'bubble', engine: 'windup', color: '#5b7cfa' };

export function getPart(id: string): Part {
  const part = PARTS.find((item) => item.id === id);
  if (!part) throw new Error(`Unknown tank part: ${id}`);
  return part;
}

export function buildCost(build: TankBuild): number {
  return getPart(build.cannon).cost + getPart(build.armor).cost + getPart(build.engine).cost;
}

export function canAttach(build: TankBuild, nextPartId: string): boolean {
  const part = getPart(nextPartId);
  const next = { ...build, [part.slot]: part.id };
  return buildCost(next) <= MAX_BOLTS;
}

export function calculateStats(build: TankBuild): TankStats {
  const result: TankStats = { speed: 150, acceleration: 450, damage: 8, fireRate: 2, projectileSpeed: 350, projectileSize: 6, armor: 50, barrels: 1, spread: 0 };
  for (const slot of ['cannon', 'armor', 'engine'] as SlotType[]) {
    const additions = getPart(build[slot]).stats;
    for (const key of Object.keys(additions) as (keyof TankStats)[]) {
      const value = additions[key];
      if (value !== undefined) result[key] = key === 'speed' && slot === 'engine' ? result[key] + value : value;
    }
  }
  return result;
}

export function randomBuild(random = Math.random): TankBuild {
  const build = { ...DEFAULT_BUILD };
  for (const slot of ['cannon', 'armor', 'engine'] as SlotType[]) {
    const choices = PARTS.filter((part) => part.slot === slot).sort(() => random() - 0.5);
    for (const choice of choices) if (canAttach(build, choice.id)) { build[slot] = choice.id; break; }
  }
  const colors = ['#5b7cfa', '#ff725e', '#30b27a', '#936ee8', '#f08a24'];
  build.color = colors[Math.floor(random() * colors.length)];
  return build;
}
