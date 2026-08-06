import { Attachment, MountIndex, TankBuild } from './config';

export const CORE_RADIUS = 52;
export const LAYER_RADII = [62, 104] as const;
export const PART_REACH = 34;
export const LAYER_SCALES = [1, .88] as const;

export function mountAngle(mount: MountIndex): number { return mount * Math.PI / 4; }

export function attachmentPose(mount: MountIndex, layer: 0 | 1, radiusOffset = 0) {
  const angle = mountAngle(mount);
  const radius = LAYER_RADII[layer] + radiusOffset;
  return { angle, radius, x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
}

export function attachmentTransform(mount: MountIndex, layer: 0 | 1) {
  return { ...attachmentPose(mount, layer), scale: LAYER_SCALES[layer] };
}

export function occupiedMountDepths(attachments: Attachment[]): Array<{ mount: MountIndex; layer: 0 | 1 }> {
  const layers = new Map<MountIndex, 0 | 1>();
  for (const attachment of attachments) layers.set(attachment.mount, Math.max(layers.get(attachment.mount) ?? 0, attachment.layer) as 0 | 1);
  return [...layers].map(([mount, layer]) => ({ mount, layer }));
}

export function contraptionRadius(build: TankBuild): number {
  if (!build.attachments.length) return CORE_RADIUS;
  return Math.max(...build.attachments.map(item => LAYER_RADII[item.layer] + PART_REACH));
}
