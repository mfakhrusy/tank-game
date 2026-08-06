import { describe, expect, it } from 'vitest';
import { DEFAULT_BUILD, TankBuild, attachPart } from './config';
import { CORE_RADIUS, LAYER_RADII, attachmentPose, attachmentTransform, contraptionRadius, occupiedMountDepths } from './geometry';

describe('shared contraption geometry', () => {
  it('places every mount at exact 45 degree intervals', () => {
    const points=([0,1,2,3,4,5,6,7] as const).map(mount=>attachmentPose(mount,0));
    points.forEach(point=>expect(Math.hypot(point.x,point.y)).toBeCloseTo(LAYER_RADII[0]));
    expect(points[0].y).toBeCloseTo(0);expect(points[2].x).toBeCloseTo(0);expect(points[4].x).toBeLessThan(0);
  });

  it('uses the outermost occupied layer for each connector arm', () => {
    let build:TankBuild={...DEFAULT_BUILD,attachments:[]};build=attachPart(build,'popper',2);build=attachPart(build,'spike',2);build=attachPart(build,'wheel',5);
    expect(occupiedMountDepths(build.attachments)).toEqual([{mount:2,layer:1},{mount:5,layer:0}]);
  });

  it('keeps stacked parts on the same ray while scaling the outside layer', () => {
    const inner=attachmentTransform(3,0),outer=attachmentTransform(3,1);
    expect(inner.angle).toBe(outer.angle);
    expect(Math.hypot(outer.x,outer.y)).toBeCloseTo(LAYER_RADII[1]);
    expect(outer.scale).toBe(.88);
    expect(inner.scale).toBe(1);
  });

  it('expands collision radius to include visible outer parts', () => {
    const empty:TankBuild={...DEFAULT_BUILD,attachments:[]};let layered=attachPart(empty,'popper',0);layered=attachPart(layered,'spike',0);
    expect(contraptionRadius(empty)).toBe(CORE_RADIUS);expect(contraptionRadius(layered)).toBeGreaterThan(LAYER_RADII[1]);
  });
});
