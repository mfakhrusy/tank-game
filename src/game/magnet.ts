// Range starts beyond the chassis; diminishing returns keep stacked magnets controllable.
export function magnetPullDistance(
  power: number,
  distance: number,
  stopRadius: number,
  deltaMs: number,
): number {
  if (power <= 0 || distance <= stopRadius) return 0;
  const strength = Math.sqrt(power / 60),
    range = stopRadius + 240 * strength;
  if (distance >= range) return 0;
  const speed =
    150 * strength * (0.25 + 0.75 * (1 - (distance - stopRadius) / (range - stopRadius)));
  return Math.min(distance - stopRadius, (speed * Math.max(0, Math.min(deltaMs, 50))) / 1000);
}
