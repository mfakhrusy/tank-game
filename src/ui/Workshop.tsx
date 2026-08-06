import { useState } from 'react';
import { Dices, Play, Sparkles, Trash2, X } from 'lucide-react';
import { MountIndex, PARTS, PartKind, buildCost, getPart, nextLayerAt } from '../game/config';
import { useGameStore } from '../store';
import { mountPoint, TankPreview } from './TankPreview';

const KINDS: { id: PartKind; label: string }[] = [
  { id: 'shooter', label: 'Shooters' }, { id: 'mover', label: 'Movers' }, { id: 'shell', label: 'Shields' }, { id: 'gadget', label: 'Weird stuff' },
];

export function Workshop() {
  const { build, attach, remove, replace, setColor, setName, randomize, clear, setMode, resetMetrics } = useGameStore();
  const [kind, setKind] = useState<PartKind>('shooter');
  const [selectedPart, setSelectedPart] = useState('popper');
  const [swapUid, setSwapUid] = useState<string | null>(null);
  const [message, setMessage] = useState('Pick a part, then tap any glowing socket.');
  const cost = buildCost(build);

  const addAt = (mount: MountIndex, partId = selectedPart) => {
    setSwapUid(null);
    if (attach(partId, mount)) setMessage(`${getPart(partId).name} snapped on! Add another—or stack it.`);
    else setMessage(nextLayerAt(build, mount) === null ? 'That socket already has two layers. Try another glowing socket.' : 'That part could not snap there.');
  };
  const choosePart = (partId: string) => {
    setSelectedPart(partId);
    if (swapUid) {
      replace(swapUid, partId);
      setMessage(`${getPart(partId).name} swapped in. Same socket, brand-new behavior!`);
      setSwapUid(null);
    } else setMessage(`${getPart(partId).name} is ready. Now tap a glowing socket to add it.`);
  };
  const beginSwap = (uid: string) => {
    const attachment = build.attachments.find(item => item.uid === uid);
    if (!attachment) return;
    const part = getPart(attachment.partId);
    setSwapUid(uid); setKind(part.kind); setSelectedPart(part.id);
    setMessage(`Swapping ${part.name}: choose its replacement on the left.`);
  };
  const launch = () => { resetMetrics(); setMode('yard'); };

  return <main className="workshop flexible-workshop">
    <header className="topbar">
      <div className="brand-mark">SC</div>
      <div><h1>Snap Contraption Lab</h1><p>There is no wrong way to build.</p></div>
      <button className="clear-button" onClick={clear}><Trash2 size={18}/> Clear</button>
      <button className="surprise-button" onClick={randomize}><Dices size={20}/> Wild build</button>
    </header>
    <section className="contraption-layout">
      <aside className="parts-panel flexible-parts">
        <div className="step-heading"><span>1</span><div><h2>Choose anything</h2><p>Mix as many kinds as you like</p></div></div>
        <nav className="kind-tabs" aria-label="Part kind">{KINDS.map((item) => <button key={item.id} className={kind === item.id ? 'active' : ''} onClick={() => { setKind(item.id); const first = PARTS.find(p => p.kind === item.id); if(first) setSelectedPart(first.id); }}>{item.label}</button>)}</nav>
        <div className="part-grid flexible-grid">{PARTS.filter(part => part.kind === kind).map((part) => <button key={part.id} draggable onDragStart={(event) => event.dataTransfer.setData('part', part.id)} onClick={() => choosePart(part.id)} className={`part-card ${selectedPart === part.id ? 'selected' : ''}`}>
          <span className="part-icon" style={{ background:`#${part.color.toString(16).padStart(6,'0')}22`,color:`#${part.color.toString(16).padStart(6,'0')}` }}>{part.icon}</span>
          <span className="part-copy"><strong>{part.name}</strong><small>{part.kidLabel}</small></span>
          <span className="part-bolts">{part.cost} bolt{part.cost > 1 ? 's' : ''}</span>
        </button>)}</div>
        <div className={`selected-tip ${swapUid ? 'swap-mode' : ''}`}><strong>{swapUid ? 'SWAP MODE' : getPart(selectedPart).name}</strong><p>{swapUid ? 'Tap a different part above to replace it.' : getPart(selectedPart).description}</p></div>
      </aside>

      <section className="freeform-bay">
        <div className="bay-title"><span>2</span><div><h2>Snap anywhere</h2><p>Each socket holds two stacked layers</p></div></div>
        <div className="freeform-board">
          <span className="direction-label front-label">FRONT →</span>
          <span className="direction-label rear-label">← BOOSTER SPOT</span>
          <TankPreview build={build}/>
          {([0,1,2,3,4,5,6,7] as MountIndex[]).map((mount) => {
            const point = mountPoint(mount, 1, 38);
            const count = build.attachments.filter(a => a.mount === mount).length;
            return <button key={mount} aria-label={`Socket ${mount + 1}, ${count} of 2 layers`} className={`mount-socket ${mount === 4 ? 'rear-socket' : ''} ${count === 2 ? 'full' : ''}`} style={{ left:`${point.x / 3.2}%`, top:`${point.y / 3.2}%` }} onClick={() => addAt(mount)} onDragOver={e => e.preventDefault()} onDrop={e => addAt(mount, e.dataTransfer.getData('part'))}>
              <b>{count < 2 ? '+' : '✓'}</b><small>{count}/2</small>
            </button>;
          })}
        </div>
        <p className="build-message">{message}</p>
        <div className="assembly-strip">
          {build.attachments.length === 0 ? <div className="empty-build">Your core is ready. Snap on something weird!</div> : build.attachments.map(item => { const part = getPart(item.partId); return <div key={item.uid} className={`attached-chip ${swapUid === item.uid ? 'swapping' : ''}`}><button className="chip-swap" aria-label={`Swap ${part.name}`} onClick={() => beginSwap(item.uid)}><span style={{color:`#${part.color.toString(16).padStart(6,'0')}`}}>{part.icon}</span><p><strong>{part.name}</strong><small>tap to swap · socket {item.mount + 1}</small></p></button><button className="chip-remove" aria-label={`Remove ${part.name}`} onClick={() => { remove(item.uid); if(swapUid===item.uid)setSwapUid(null); }}><X size={14}/></button></div>; })}
        </div>
      </section>

      <aside className="ready-panel flexible-ready">
        <div className="step-heading"><span>3</span><div><h2>Name your thing</h2><p>Tank? Robot? Moving pancake?</p></div></div>
        <input className="build-name" aria-label="Contraption name" value={build.name} onChange={e => setName(e.target.value)} />
        <div className="bolt-budget complexity-card"><div><strong>Build complexity</strong><span>{cost} bolts</span></div><div className="complexity-pips">{Array.from({length:Math.min(12,Math.max(1,Math.ceil(cost/2)))}).map((_,i)=><i key={i}/>)}</div><small>No limit—bolts only show how elaborate it is.</small></div>
        <div className="mini-stats">
          <div><strong>{build.attachments.filter(a=>getPart(a.partId).kind==='shooter').length}</strong><span>shooters</span></div>
          <div><strong>{build.attachments.filter(a=>getPart(a.partId).kind==='mover').length}</strong><span>movers</span></div>
          <div><strong>{build.attachments.length}</strong><span>all parts</span></div>
        </div>
        <div className="paint-row"><span>Core</span>{['#5b7cfa','#ff725e','#30b27a','#936ee8','#f08a24'].map(color=><button aria-label={`Paint ${color}`} key={color} className={build.color===color?'active':''} onClick={()=>setColor(color)} style={{background:color}}/>)}</div>
        <button className="launch-button" onClick={launch}><Play fill="currentColor"/> Test this thing! <Sparkles size={18}/></button>
        <p className="controls-hint"><kbd>WASD</kbd> or arrows to move<br/>Mouse to aim · Hold to fire everything</p>
      </aside>
    </section>
  </main>;
}
