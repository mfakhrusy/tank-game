import { getPart, MountIndex, Part, TankBuild } from '../game/config';
import { CORE_RADIUS, attachmentPose, attachmentTransform, occupiedMountDepths } from '../game/geometry';

const center = 160;
export function mountPoint(mount: MountIndex, layer: 0 | 1, radiusOffset = 0) {
  const pose = attachmentPose(mount, layer, radiusOffset);
  return { x: center + pose.x, y: center + pose.y, angle: mount * 45 };
}

function PartShape({ part, x, y, angle, layer }: { part: Part; x: number; y: number; angle: number; layer: 0 | 1 }) {
  const color = `#${part.color.toString(16).padStart(6, '0')}`;
  const scale = attachmentTransform(0, layer).scale;
  return <g transform={`translate(${x} ${y}) rotate(${angle}) scale(${scale})`} className="svg-part">
    {part.shape === 'barrel' && <><rect x="-10" y={part.behavior==='bonker'?-17:-13} width="58" height={part.behavior==='bonker'?34:26} rx="9" fill="#29324a"/><rect x="-5" y={part.behavior==='bonker'?-11:-8} width="48" height={part.behavior==='bonker'?22:16} rx="6" fill={color}/>{part.behavior==='ricochet'?<rect x="34" y="-10" width="20" height="20" rx="3" fill="#29324a"/>:<circle cx="43" cy="0" r="9" fill="#29324a"/>}<circle cx="43" cy="0" r="5" fill="#fff" opacity=".25"/></>}
    {part.shape === 'pod' && <><path d="M-15-18h39l22 18-22 18h-39z" fill="#29324a"/><path d="M-9-12h30L37 0 21 12h-30z" fill={color}/>{part.behavior==='sprinkler'&&<><circle cx="25" cy="-8" r="5" fill="#29324a"/><circle cx="32" cy="0" r="5" fill="#29324a"/><circle cx="25" cy="8" r="5" fill="#29324a"/></>}{part.behavior==='boomerang'&&<path d="M7-10a13 13 0 1 1 0 20l7-6a6 6 0 1 0 0-8z" fill="#fff" stroke="#29324a" strokeWidth="3"/>}{part.behavior==='wiggler'&&<path d="M-1 8q8-18 16 0t16 0" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round"/>}{part.behavior==='splitter'&&<path d="M9 0l11-11L31 0 20 11z" fill="#fff" stroke="#29324a" strokeWidth="3"/>}{!part.behavior&&<circle cx="8" cy="0" r="5" fill="#fff" opacity=".4"/>}</>}
    {part.shape === 'booster' && <><path d="M-28-19h39l20 9v20L11 19h-39z" fill="#29324a"/><path d="M-21-12H8l15 7v10L8 12h-29z" fill={color}/><rect x="20" y="-15" width="15" height="30" rx="6" fill="#29324a"/><path d="M35-9l24 9-24 9z" fill="#f6c453" stroke="#29324a" strokeWidth="4"/><path d="M37-4l12 4-12 4z" fill="#ff725e"/></>}
    {part.shape === 'plate' && <><path d="M-18-28h35q15 0 21 13v30q-6 13-21 13h-35z" fill="#29324a"/><path d="M-13-21h28q11 0 16 10v22q-5 10-16 10h-28z" fill={color}/><path d="M-5-14h14" stroke="#fff" strokeWidth="5" strokeLinecap="round" opacity=".35"/></>}
    {part.shape === 'wheel' && <><ellipse cx="4" cy="0" rx="31" ry="22" fill="#29324a"/><ellipse cx="4" cy="0" rx="23" ry="15" fill={color}/><circle cx="4" cy="0" r="7" fill="#fff" opacity=".4"/><path d="M-13-11v22M21-11v22" stroke="#29324a" strokeWidth="4"/></>}
    {part.shape === 'orb' && <><circle cx="2" cy="0" r="25" fill="#29324a"/><circle cx="2" cy="0" r="18" fill={color}/><circle cx="-4" cy="-6" r="6" fill="#fff" opacity=".45"/><text x="3" y="8" textAnchor="middle" fontSize="17" fontWeight="900" fill="#29324a">{part.icon}</text></>}
    {part.shape === 'spike' && <><path d="M-25-22L38 0l-63 22z" fill="#29324a"/><path d="M-17-13L27 0l-44 13z" fill={color}/><path d="M-5-7L41 0-5 7 9 0z" fill="#f8f3e8" stroke="#29324a" strokeWidth="3"/></>}
  </g>;
}

export function TankPreview({ build, compact = false }: { build: TankBuild; compact?: boolean }) {
  return <div className={`tank-preview-v2 ${compact ? 'compact' : ''}`} aria-label={`${build.name} preview`}>
    <svg viewBox="0 0 320 320" role="img">
      <ellipse cx="160" cy="270" rx="92" ry="22" fill="#29324a" opacity=".13"/>
      <g className="attachment-connectors">{occupiedMountDepths(build.attachments).map(({mount,layer})=>{const start=mountPoint(mount,0,-CORE_RADIUS+7),end=mountPoint(mount,layer,28);return <g key={`arm-${mount}`}><line x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke="#29324a" strokeWidth="18" strokeLinecap="round"/><line x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke="#cbd1dc" strokeWidth="9" strokeLinecap="round"/></g>;})}</g>
      {[...build.attachments].sort((a,b) => b.layer - a.layer).map((item) => {
        const point = mountPoint(item.mount, item.layer);
        return <PartShape key={item.uid} part={getPart(item.partId)} {...point} layer={item.layer}/>;
      })}
      <circle cx="160" cy="160" r={CORE_RADIUS+8} fill="#29324a"/>
      <circle cx="160" cy="160" r={CORE_RADIUS} fill={build.color}/>
      <circle cx="145" cy="143" r="26" fill="#fff" opacity=".18"/>
      <circle cx="160" cy="160" r="29" fill="#f8f3e8" stroke="#29324a" strokeWidth="7"/>
      <path d="M148 163l8 8 18-23" fill="none" stroke={build.color} strokeWidth="8" strokeLinecap="round" strokeLinejoin="round"/>
      {build.attachments.map((item) => { const p = mountPoint(item.mount, item.layer, -28); return <circle key={`bolt-${item.uid}`} cx={p.x} cy={p.y} r="5" fill="#f6c453" stroke="#29324a" strokeWidth="3"/>; })}
    </svg>
  </div>;
}
