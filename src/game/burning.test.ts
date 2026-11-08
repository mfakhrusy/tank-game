import { expect, it } from 'vitest';
import { igniteBurn, tickBurn } from './burning';
it('burns for 3 seconds after contact and then stops', () => {
  let burn = igniteBurn(undefined, 0, 1.5);
  expect(tickBurn(burn, 249).damage).toBe(0);
  const first = tickBurn(burn, 250);
  expect(first.damage).toBe(1.5);
  burn = first.burn!;
  const end = tickBurn(burn, 3000);
  expect(end.damage).toBe(16.5);
  expect(end.burn).toBeNull();
});
it('refreshes without stacking damage or delaying ticks, preserving the strongest source', () => {
  let burn = igniteBurn(undefined, 0, 2);
  for (let i = 1; i <= 20; i++) burn = igniteBurn(burn, i * 10, 1);
  expect(burn.nextTick).toBe(250);
  expect(burn.damage).toBe(2);
  expect(tickBurn(burn, 250).damage).toBe(2);
  burn = igniteBurn(burn, 220, 3.2);
  expect(burn.damage).toBe(3.2);
  expect(igniteBurn(burn, 5000, 1)).toEqual({ until: 8000, nextTick: 5250, damage: 1 });
});
