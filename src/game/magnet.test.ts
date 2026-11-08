import { expect, it } from 'vitest';
import { magnetPullDistance } from './magnet';
it('only attracts blocks within reach and stops at the chassis', () => {
  expect(magnetPullDistance(0, 200, 100, 33)).toBe(0);
  expect(magnetPullDistance(60, 340, 100, 33)).toBe(0);
  expect(magnetPullDistance(60, 99, 100, 33)).toBe(0);
  expect(magnetPullDistance(60, 100.1, 100, 33)).toBeCloseTo(0.1);
  expect(magnetPullDistance(60, 200, 100, 33)).toBeGreaterThan(0);
});
it('stacking extends reach and strength, with frame-rate independent pull', () => {
  expect(magnetPullDistance(240, 400, 100, 33)).toBeGreaterThan(0);
  expect(magnetPullDistance(240, 200, 100, 33)).toBeGreaterThan(
    magnetPullDistance(60, 200, 100, 33),
  );
  expect(magnetPullDistance(60, 200, 100, 20)).toBeCloseTo(
    2 * magnetPullDistance(60, 200, 100, 10),
  );
  expect(magnetPullDistance(60, 200, 100, 1000)).toBe(magnetPullDistance(60, 200, 100, 50));
});
