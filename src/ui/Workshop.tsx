import { useState } from 'react';
import { Dices, Play, Sparkles } from 'lucide-react';
import { MAX_BOLTS, PARTS, SlotType, buildCost, getPart } from '../game/config';
import { useGameStore } from '../store';
import { TankPreview } from './TankPreview';

const SLOTS: { id: SlotType; label: string; prompt: string }[] = [
  { id: 'cannon', label: 'Shooter', prompt: 'What should it shoot?' },
  { id: 'armor', label: 'Body', prompt: 'How should it feel?' },
  { id: 'engine', label: 'Mover', prompt: 'How should it drive?' },
];

export function Workshop() {
  const { build, attach, setColor, randomize, setMode, resetMetrics } = useGameStore();
  const [activeSlot, setActiveSlot] = useState<SlotType>('cannon');
  const [shake, setShake] = useState(false);
  const cost = buildCost(build);

  const choose = (id: string) => {
    if (!attach(id)) {
      setShake(true);
      window.setTimeout(() => setShake(false), 450);
    }
  };

  const launch = () => { resetMetrics(); setMode('yard'); };

  return (
    <main className="workshop">
      <header className="topbar">
        <div className="brand-mark">ST</div>
        <div><h1>Snap Tank Lab</h1><p>Build a buddy. Try it out!</p></div>
        <button className="surprise-button" onClick={randomize}><Dices size={20} /> Surprise me</button>
      </header>

      <section className="build-layout">
        <aside className="parts-panel">
          <div className="step-heading"><span>1</span><div><h2>Pick a part</h2><p>Tap it or drag it to your tank</p></div></div>
          <nav className="slot-tabs" aria-label="Part type">
            {SLOTS.map((slot) => <button key={slot.id} className={activeSlot === slot.id ? 'active' : ''} onClick={() => setActiveSlot(slot.id)}>{slot.label}</button>)}
          </nav>
          <p className="slot-question">{SLOTS.find((slot) => slot.id === activeSlot)?.prompt}</p>
          <div className="part-grid">
            {PARTS.filter((part) => part.slot === activeSlot).map((part) => {
              const selected = build[part.slot] === part.id;
              return <button key={part.id} draggable onDragStart={(event) => event.dataTransfer.setData('part', part.id)} onClick={() => choose(part.id)} className={`part-card ${selected ? 'selected' : ''}`}>
                <span className="part-icon" style={{ background: `#${part.color.toString(16).padStart(6, '0')}22`, color: `#${part.color.toString(16).padStart(6, '0')}` }}>{part.icon}</span>
                <span className="part-copy"><strong>{part.name}</strong><small>{part.kidLabel}</small></span>
                <span className="mini-cost">{Array.from({ length: part.cost }).map((_, i) => <i key={i} />)}</span>
              </button>;
            })}
          </div>
        </aside>

        <section className="assembly-bay">
          <div className="step-heading centered"><span>2</span><div><h2>Snap it together</h2><p>Every build can be different</p></div></div>
          <div className="pegboard"><i /><i /><i /><i /><i /></div>
          <TankPreview build={build} />
          <div className="snap-slots">
            {SLOTS.map((slot) => {
              const part = getPart(build[slot.id]);
              return <button key={slot.id} onClick={() => setActiveSlot(slot.id)} onDragOver={(e) => e.preventDefault()} onDrop={(e) => choose(e.dataTransfer.getData('part'))} className={activeSlot === slot.id ? 'focused' : ''}>
                <span>{slot.label}</span><strong>{part.name}</strong><small>tap to swap</small>
              </button>;
            })}
          </div>
          <div className="paint-row"><span>Paint</span>{['#5b7cfa', '#ff725e', '#30b27a', '#936ee8', '#f08a24'].map((color) => <button aria-label={`Paint ${color}`} key={color} className={build.color === color ? 'active' : ''} onClick={() => setColor(color)} style={{ background: color }} />)}</div>
        </section>

        <aside className="ready-panel">
          <div className="step-heading"><span>3</span><div><h2>Ready to roll?</h2><p>Your creation looks awesome</p></div></div>
          <div className={`bolt-budget ${shake ? 'shake' : ''}`}>
            <div><strong>Build bolts</strong><span>{cost} / {MAX_BOLTS}</span></div>
            <div className="bolt-track">{Array.from({ length: MAX_BOLTS }).map((_, i) => <i key={i} className={i < cost ? 'used' : ''} />)}</div>
            <small>Big parts use more bolts</small>
          </div>
          <div className="build-summary">
            {SLOTS.map((slot) => { const part = getPart(build[slot.id]); return <div key={slot.id}><span>{part.icon}</span><p><small>{slot.label}</small><strong>{part.name}</strong></p></div>; })}
          </div>
          <button className="launch-button" onClick={launch}><Play fill="currentColor" /> Test my tank!<Sparkles size={18} /></button>
          <p className="controls-hint"><kbd>WASD</kbd> or arrows to drive<br />Mouse to aim · Hold to shoot</p>
        </aside>
      </section>
    </main>
  );
}
