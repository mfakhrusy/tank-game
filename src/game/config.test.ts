import { describe, expect, it } from 'vitest';
import { BOOMERANG_RETURN_MS, DEFAULT_BUILD, PARTS, SPLITTER_BURST_MS, TankBuild, attachPart, boosterThrustForDirection, buildCost, calculateStats, canAttach, getPart, nextLayerAt, randomBuild, removeAttachment, replaceAttachment, shouldBoomerangReturn, shouldSplitterBurst, wigglerHeading } from './config';

describe('freeform contraption configuration', () => {
  it('allows mixed parts on any socket', () => {
    let build: TankBuild = { ...DEFAULT_BUILD, attachments: [] };
    build = attachPart(build, 'popper', 3);
    build = attachPart(build, 'wheel', 3);
    expect(build.attachments.map(a => getPart(a.partId).kind)).toEqual(['shooter','mover']);
    expect(build.attachments.map(a => a.layer)).toEqual([0,1]);
  });

  it('supports two layers but prevents a third', () => {
    let build: TankBuild = { ...DEFAULT_BUILD, attachments: [] };
    build = attachPart(build, 'bumper', 0);
    build = attachPart(build, 'lamp', 0);
    expect(nextLayerAt(build,0)).toBeNull();
    expect(attachPart(build,'popper',0)).toBe(build);
  });

  it('aggregates many independent shooters', () => {
    let build: TankBuild = { ...DEFAULT_BUILD, attachments: [] };
    build = attachPart(build,'popper',0);
    build = attachPart(build,'sprinkler',2);
    build = attachPart(build,'bonker',6);
    const stats=calculateStats(build);
    expect(stats.weapons).toHaveLength(3);
    expect(stats.weapons.map(w=>w.mount)).toEqual([0,2,6]);
  });

  it('gives every shooter an explicit working behavior contract', () => {
    const shooters=PARTS.filter(part=>part.kind==='shooter');
    expect(shooters).toHaveLength(7);
    expect(new Set(shooters.map(part=>part.behavior)).size).toBe(7);
    shooters.forEach(part=>expect(part.behavior).toBeTruthy());
  });

  it('sends the boomerang out before switching to return mode', () => {
    expect(shouldBoomerangReturn(BOOMERANG_RETURN_MS-1)).toBe(false);
    expect(shouldBoomerangReturn(BOOMERANG_RETURN_MS)).toBe(true);
  });

  it('makes Wiggler headings move to both sides of the base angle', () => {
    const headings=Array.from({length:20},(_,i)=>wigglerHeading(0,i*40));
    expect(Math.min(...headings)).toBeLessThan(-.4);expect(Math.max(...headings)).toBeGreaterThan(.4);
  });

  it('splits a Splitter shell exactly once after its fuse', () => {
    expect(shouldSplitterBurst(SPLITTER_BURST_MS-1,false)).toBe(false);
    expect(shouldSplitterBurst(SPLITTER_BURST_MS,false)).toBe(true);
    expect(shouldSplitterBurst(SPLITTER_BURST_MS+100,true)).toBe(false);
  });

  it('makes a rear booster push forward and not backward', () => {
    let build: TankBuild={...DEFAULT_BUILD,attachments:[]};build=attachPart(build,'rocket',4);
    const {boosters}=calculateStats(build);
    expect(boosters).toHaveLength(1);
    expect(boosterThrustForDirection(boosters,0,1,0)).toBeCloseTo(520);
    expect(boosterThrustForDirection(boosters,0,-1,0)).toBe(0);
  });

  it('allows stacked rear boosters to combine their thrust', () => {
    let build: TankBuild={...DEFAULT_BUILD,attachments:[]};build=attachPart(build,'rocket',4);build=attachPart(build,'twin-booster',4);
    expect(boosterThrustForDirection(calculateStats(build).boosters,0,1,0)).toBeCloseTo(1280);
  });

  it('removes a single instance without affecting copies', () => {
    let build: TankBuild={...DEFAULT_BUILD,attachments:[]};build=attachPart(build,'wheel',3);build=attachPart(build,'wheel',5);
    const removed=removeAttachment(build,build.attachments[0].uid);
    expect(removed.attachments).toHaveLength(1);expect(removed.attachments[0].mount).toBe(5);
  });

  it('swaps a part in place without moving its socket or layer', () => {
    let build: TankBuild={...DEFAULT_BUILD,attachments:[]};build=attachPart(build,'wheel',3);build=attachPart(build,'popper',3);
    const target=build.attachments[0];const swapped=replaceAttachment(build,target.uid,'crawler');
    expect(swapped.attachments[0]).toMatchObject({uid:target.uid,partId:'crawler',mount:3,layer:0});
    expect(swapped.attachments[1].partId).toBe('popper');
  });

  it('treats bolts as information and never blocks a free socket', () => {
    let build: TankBuild={...DEFAULT_BUILD,attachments:[]};
    for(const mount of [0,1,2,3] as const) build=attachPart(build,'bonker',mount);
    expect(buildCost(build)).toBe(16);expect(canAttach(build,'bonker',4)).toBe(true);
    build=attachPart(build,'bonker',4);expect(buildCost(build)).toBe(20);
  });

  it('always creates an interesting valid random build', () => {
    for(let i=0;i<50;i++){const build=randomBuild();expect(build.attachments.length).toBeGreaterThan(0);expect(build.attachments.some(a=>getPart(a.partId).kind==='shooter')).toBe(true);}
  });

  it('keeps all part copy child-readable', () => { PARTS.forEach(part=>{expect(part.kidLabel.length).toBeGreaterThan(3);expect(part.description.length).toBeGreaterThan(8);}); });
});
