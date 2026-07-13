import { describe, expect, it } from 'vitest';
import { DEFAULT_BUILD, MAX_BOLTS, PARTS, buildCost, calculateStats, canAttach, getPart, randomBuild } from './config';

describe('tank configuration', () => {
  it('starts with one valid part in each slot', () => {
    expect(getPart(DEFAULT_BUILD.cannon).slot).toBe('cannon');
    expect(getPart(DEFAULT_BUILD.armor).slot).toBe('armor');
    expect(getPart(DEFAULT_BUILD.engine).slot).toBe('engine');
    expect(buildCost(DEFAULT_BUILD)).toBeLessThanOrEqual(MAX_BOLTS);
  });

  it('rejects a combination that exceeds the bolt budget', () => {
    const expensive = { cannon: 'bonker', armor: 'brick', engine: 'windup', color: '#fff' } as const;
    expect(canAttach(expensive, 'rocket')).toBe(false);
    expect(canAttach(expensive, 'crawler')).toBe(true);
  });

  it('makes light armor faster and heavy armor tougher', () => {
    const light = calculateStats({ ...DEFAULT_BUILD, armor: 'cardboard' });
    const heavy = calculateStats({ ...DEFAULT_BUILD, armor: 'brick' });
    expect(light.speed).toBeGreaterThan(heavy.speed);
    expect(heavy.armor).toBeGreaterThan(light.armor);
  });

  it('gives each part a meaningful child-readable description', () => {
    PARTS.forEach((part) => {
      expect(part.name.length).toBeGreaterThan(2);
      expect(part.kidLabel.length).toBeGreaterThan(3);
      expect(part.description.length).toBeGreaterThan(8);
    });
  });

  it('always creates a valid random build', () => {
    for (let i = 0; i < 50; i++) expect(buildCost(randomBuild())).toBeLessThanOrEqual(MAX_BOLTS);
  });
});
