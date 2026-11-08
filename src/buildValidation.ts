import { PARTS, TankBuild } from './game/config';

export function validBuild(value: unknown): value is TankBuild {
  if (!value || typeof value !== 'object') return false;
  const build = value as TankBuild;
  if (
    build.version !== 2 ||
    typeof build.name !== 'string' ||
    build.name.length > 24 ||
    typeof build.color !== 'string' ||
    !/^#[0-9a-f]{6}$/i.test(build.color) ||
    !Array.isArray(build.attachments) ||
    build.attachments.length > 16
  )
    return false;
  const sockets = new Set<string>(),
    ids = new Set<string>();
  return build.attachments.every((item) => {
    if (
      !item ||
      typeof item.uid !== 'string' ||
      !item.uid ||
      ids.has(item.uid) ||
      !PARTS.some((part) => part.id === item.partId) ||
      !Number.isInteger(item.mount) ||
      item.mount < 0 ||
      item.mount > 7 ||
      (item.layer !== 0 && item.layer !== 1)
    )
      return false;
    const socket = `${item.mount}:${item.layer}`;
    if (sockets.has(socket)) return false;
    sockets.add(socket);
    ids.add(item.uid);
    return true;
  });
}
