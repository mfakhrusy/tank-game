import { memo } from 'react';
import type { VectorArt } from '../game/moduleArt';
import { moduleArt } from '../game/moduleArt';
import type { Part } from '../game/config';
export const VectorArtwork = memo(function VectorArtwork({ art }: { art: VectorArt[] }) {
  return (
    <>
      {art.map((shape, index) => {
        const props = {
          fill: shape.fill ?? 'none',
          stroke: shape.stroke ?? 'none',
          strokeWidth: shape.strokeWidth ?? 0,
          opacity: shape.opacity ?? 1,
        };
        if (shape.type === 'circle')
          return <circle key={index} cx={shape.x} cy={shape.y} r={shape.r} {...props} />;
        if (shape.type === 'ellipse')
          return (
            <ellipse key={index} cx={shape.x} cy={shape.y} rx={shape.rx} ry={shape.ry} {...props} />
          );
        if (shape.type === 'rect')
          return (
            <rect
              key={index}
              x={shape.x}
              y={shape.y}
              width={shape.width}
              height={shape.height}
              rx={shape.rx}
              {...props}
            />
          );
        const points = shape
          .points!.reduce((text, value, i) => text + (i % 2 ? ',' : ' ') + value, '')
          .trim();
        return shape.type === 'polygon' ? (
          <polygon key={index} points={points} strokeLinejoin="round" {...props} />
        ) : (
          <polyline
            key={index}
            points={points}
            strokeLinecap="round"
            strokeLinejoin="round"
            {...props}
          />
        );
      })}
    </>
  );
});
export const ModuleIcon = memo(function ModuleIcon({ part }: { part: Part }) {
  return (
    <svg viewBox="-36 -34 96 68" aria-hidden="true" focusable="false">
      <VectorArtwork art={moduleArt(part)} />
    </svg>
  );
});
