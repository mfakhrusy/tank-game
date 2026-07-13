import { getPart, TankBuild } from '../game/config';

export function TankPreview({ build, compact = false }: { build: TankBuild; compact?: boolean }) {
  const cannon = getPart(build.cannon);
  const armor = getPart(build.armor);
  const engine = getPart(build.engine);
  return (
    <div className={`tank-preview ${compact ? 'compact' : ''}`} aria-label="Your tank preview">
      <div className="preview-shadow" />
      <div className={`preview-tracks ${engine.id}`}><i /><i /></div>
      <div className={`preview-body ${armor.id}`} style={{ background: build.color }}>
        <span className="body-shine" />
        <span className="body-badge">★</span>
      </div>
      <div className={`preview-turret ${cannon.id}`}>
        {Array.from({ length: cannon.id === 'twins' ? 2 : 1 }).map((_, index) => <i key={index} />)}
        <b style={{ background: build.color }} />
      </div>
    </div>
  );
}
