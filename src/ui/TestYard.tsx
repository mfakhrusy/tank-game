import { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import { ArrowLeft, RotateCcw, Target } from 'lucide-react';
import { TestScene } from '../game/TestScene';
import { getPart } from '../game/config';
import { useGameStore } from '../store';
import { TankPreview } from './TankPreview';

export function TestYard() {
  const host = useRef<HTMLDivElement>(null);
  const { build, metrics, setMode, resetMetrics } = useGameStore();
  useEffect(() => {
    if (!host.current) return;
    const game = new Phaser.Game({ type: Phaser.AUTO, parent: host.current, width: host.current.clientWidth, height: host.current.clientHeight, backgroundColor: '#fff8e8', physics: { default: 'arcade', arcade: { debug: false } }, scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH }, scene: new TestScene(build), render: { antialias: true } });
    return () => game.destroy(true);
  }, [build]);
  const accuracy = metrics.shots ? Math.round(metrics.hits / metrics.shots * 100) : 0;
  return <main className="yard-screen">
    <div ref={host} className="game-canvas" />
    <header className="yard-header">
      <button onClick={() => setMode('workshop')}><ArrowLeft /> Workshop</button>
      <div className="yard-title"><Target /><span><strong>Smash Yard</strong><small>Test your creation!</small></span></div>
      <button onClick={resetMetrics}><RotateCcw /> Reset score</button>
    </header>
    <aside className="yard-build"><TankPreview build={build} compact /><div><small>Testing</small><strong>{getPart(build.cannon).name} + {getPart(build.engine).name}</strong></div></aside>
    <section className="score-card">
      <div><strong>{metrics.blocks}</strong><span>Blocks<br />smashed</span></div>
      <div><strong>{accuracy}%</strong><span>Target<br />hits</span></div>
      <div><strong>{metrics.shots}</strong><span>Shots<br />fired</span></div>
    </section>
    <div className="yard-help"><b>WASD</b> Drive <span>•</span> <b>Mouse</b> Aim <span>•</span> <b>Hold click</b> Shoot</div>
  </main>;
}
