import { memo } from 'react';
import { VectorArtwork } from './VectorArtwork';
import { coreArt, moduleArt, flameArt } from '../game/moduleArt';
import { getPart, MountIndex, Part, TankBuild } from '../game/config';
import {
  CORE_RADIUS,
  attachmentPose,
  attachmentTransform,
  occupiedMountDepths,
} from '../game/geometry';

const center = 160;
export function mountPoint(mount: MountIndex, layer: 0 | 1, radiusOffset = 0) {
  const pose = attachmentPose(mount, layer, radiusOffset);
  return { x: center + pose.x, y: center + pose.y, angle: mount * 45 };
}

function PartShape({
  part,
  x,
  y,
  angle,
  layer,
}: {
  part: Part;
  x: number;
  y: number;
  angle: number;
  layer: 0 | 1;
}) {
  const scale = attachmentTransform(0, layer).scale;
  return (
    <g transform={`translate(${x} ${y}) rotate(${angle}) scale(${scale})`} className="svg-part">
      <VectorArtwork art={moduleArt(part)} />
      {part.shape === 'booster' && (
        <g transform="translate(35 0)" opacity=".7">
          <VectorArtwork art={flameArt(part)} />
        </g>
      )}
    </g>
  );
}

export const TankPreview = memo(function TankPreview({
  build,
  compact = false,
  onPartClick,
  partAction = 'Select',
  highlightedUid,
}: {
  build: TankBuild;
  compact?: boolean;
  onPartClick?: (uid: string) => void;
  partAction?: 'Select' | 'Remove';
  highlightedUid?: string;
}) {
  return (
    <div
      className={`tank-preview-v2 ${compact ? 'compact' : ''}`}
      aria-label={`${build.name} preview`}
    >
      <svg
        viewBox="0 0 320 320"
        role={onPartClick ? 'group' : 'img'}
        aria-label={onPartClick ? 'Tank modules' : undefined}
      >
        <ellipse cx="160" cy="270" rx="92" ry="22" fill="#29324a" opacity=".13" />
        <g className="attachment-connectors">
          {occupiedMountDepths(build.attachments).map(({ mount, layer }) => {
            const start = mountPoint(mount, 0, -CORE_RADIUS + 7),
              end = mountPoint(mount, layer, 28);
            return (
              <g key={`arm-${mount}`}>
                <line
                  x1={start.x}
                  y1={start.y}
                  x2={end.x}
                  y2={end.y}
                  stroke="#29324a"
                  strokeWidth="18"
                  strokeLinecap="round"
                />
                <line
                  x1={start.x}
                  y1={start.y}
                  x2={end.x}
                  y2={end.y}
                  stroke="#cbd1dc"
                  strokeWidth="9"
                  strokeLinecap="round"
                />
              </g>
            );
          })}
        </g>
        {[...build.attachments]
          .sort((a, b) => b.layer - a.layer)
          .map((item) => {
            const point = mountPoint(item.mount, item.layer);
            const part = getPart(item.partId);
            return (
              <g
                key={item.uid}
                role={onPartClick ? 'button' : undefined}
                tabIndex={onPartClick ? 0 : undefined}
                aria-label={
                  onPartClick
                    ? `${partAction} ${part.name}, socket ${item.mount + 1}, ${item.layer === 0 ? 'inner' : 'outer'} layer`
                    : undefined
                }
                className={
                  onPartClick
                    ? `interactive-module ${partAction === 'Remove' ? 'remove-target' : ''} ${highlightedUid === item.uid ? 'selected-module' : ''}`
                    : undefined
                }
                onClick={onPartClick ? () => onPartClick(item.uid) : undefined}
                onKeyDown={
                  onPartClick
                    ? (event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          onPartClick(item.uid);
                        }
                      }
                    : undefined
                }
              >
                <PartShape part={part} {...point} layer={item.layer} />
              </g>
            );
          })}
        <g transform="translate(160 160)">
          <VectorArtwork art={coreArt(build.color)} />
        </g>
      </svg>
    </div>
  );
});
