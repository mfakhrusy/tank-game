import { useEffect, useRef, useState } from 'react';
import Phaser from 'phaser';
import { ArrowLeft, Copy, LogOut, RotateCcw, Target, Users, ZoomIn, ZoomOut } from 'lucide-react';
import { TestScene } from '../game/TestScene';
import { MAX_CAMERA_ZOOM, MIN_CAMERA_ZOOM } from '../game/world';
import { useGameStore } from '../store';
import { TankPreview } from './TankPreview';
import { MultiplayerConnection, RoomStats, createMultiplayerRoom, normalizeRoomCode } from '../multiplayer';

export function TestYard() {
  const host = useRef<HTMLDivElement>(null);
  const sceneRef=useRef<TestScene|null>(null),connectionRef=useRef<MultiplayerConnection|null>(null),remoteIdsRef=useRef(new Set<string>()),selfIdRef=useRef('');
  const [roomInput,setRoomInput]=useState(''),[roomId,setRoomId]=useState(''),[connectionStatus,setConnectionStatus]=useState<'disconnected'|'connecting'|'connected'>('disconnected'),[peerCount,setPeerCount]=useState(0),[roomMessage,setRoomMessage]=useState('');
  const [sharedStats,setSharedStats]=useState<RoomStats>({blocks:0,shots:0,hits:0});
  const { build, metrics, position, health, maxHealth, cameraZoom, setCameraZoom, setMode, resetMetrics } = useGameStore();
  useEffect(() => {
    if (!host.current) return;
    const scene=new TestScene(build,state=>connectionRef.current?.sendState(state));sceneRef.current=scene;
    const game = new Phaser.Game({ type: Phaser.AUTO, parent: host.current, width: host.current.clientWidth, height: host.current.clientHeight, backgroundColor: '#fff8e8', physics: { default: 'arcade', arcade: { debug: false } }, scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH }, fps:{target:60}, scene, render: { antialias: true, powerPreference:'high-performance' } });
    const handleVisibility=()=>document.hidden?game.loop.sleep():game.loop.wake();
    document.addEventListener('visibilitychange',handleVisibility);
    return () => { document.removeEventListener('visibilitychange',handleVisibility);connectionRef.current?.disconnect(false);connectionRef.current=null;sceneRef.current=null;game.destroy(true); };
  }, [build]);
  const joinRoom=(code:string)=>{const normalized=normalizeRoomCode(code);if(normalized.length!==6){setRoomMessage('Room codes have 6 letters or numbers.');return;}connectionRef.current?.disconnect(false);sceneRef.current?.clearRemotePlayers();remoteIdsRef.current.clear();setPeerCount(0);setRoomId(normalized);setRoomMessage('');const connection=new MultiplayerConnection(normalized,build,{welcome:(id,players)=>{selfIdRef.current=id;sceneRef.current?.setMultiplayerMode(true);remoteIdsRef.current=new Set(players.map(player=>player.id));players.forEach(player=>sceneRef.current?.upsertRemotePlayer(player));setPeerCount(players.length+1);},upsert:player=>{if(player.id===selfIdRef.current)return;const isNew=!remoteIdsRef.current.has(player.id);remoteIdsRef.current.add(player.id);sceneRef.current?.upsertRemotePlayer(player);if(isNew)setPeerCount(count=>Math.max(2,count+1));},remove:id=>{const existed=remoteIdsRef.current.delete(id);sceneRef.current?.removeRemotePlayer(id);if(existed)setPeerCount(count=>Math.max(1,count-1));},world:snapshot=>{sceneRef.current?.applyNetworkWorld(snapshot,selfIdRef.current);setSharedStats(snapshot.stats);setPeerCount(snapshot.players.length);},status:(status,message)=>{setConnectionStatus(status);if(message)setRoomMessage(message);if(status==='disconnected'){sceneRef.current?.setMultiplayerMode(false);if(!message)setPeerCount(0);}}});connectionRef.current=connection;connection.connect();};
  const createRoom=async()=>{try{setConnectionStatus('connecting');setRoomMessage('Making a room…');const code=await createMultiplayerRoom();setRoomInput(code);joinRoom(code);}catch(error){setConnectionStatus('disconnected');setRoomMessage(error instanceof Error?error.message:'Could not create a room.');}};
  const leaveRoom=()=>{connectionRef.current?.disconnect();connectionRef.current=null;sceneRef.current?.setMultiplayerMode(false);remoteIdsRef.current.clear();selfIdRef.current='';setRoomId('');setPeerCount(0);setSharedStats({blocks:0,shots:0,hits:0});setRoomMessage('');};
  const activeStats=connectionStatus==='connected'?sharedStats:metrics;
  const accuracy = activeStats.shots ? Math.round(activeStats.hits / activeStats.shots * 100) : 0;
  const distance = Math.round(Math.hypot(position.x, position.y) / 10);
  return <main className="yard-screen" onContextMenu={event => event.preventDefault()} onWheel={event=>setCameraZoom(cameraZoom-Math.sign(event.deltaY)*.1)}>
    <div ref={host} className="game-canvas" />
    <header className="yard-header">
      <button onClick={() => setMode('workshop')}><ArrowLeft /> Workshop</button>
      <div className="yard-title"><Target /><span><strong>{connectionStatus==='connected'?'Co-op Yard':'Solo Yard'}</strong><small>{connectionStatus==='connected'?'One shared world':'Your private practice world'}</small></span></div>
      <button disabled={connectionStatus==='connected'} onClick={resetMetrics}><RotateCcw /> Reset score</button>
    </header>
    <aside className="yard-build"><TankPreview build={build} compact /><div><small>Testing</small><strong>{build.name} · {build.attachments.length} parts</strong></div></aside>
    <section className="score-card">
      <div><strong>{activeStats.blocks}</strong><span>Blocks<br />smashed</span></div>
      <div><strong>{accuracy}%</strong><span>Target<br />hits</span></div>
      <div><strong>{activeStats.shots}</strong><span>Shots<br />fired</span></div>
      <div><strong className="distance-value">{distance}m</strong><span>Distance<br />traveled</span></div>
    </section>
    <section className="zoom-card" aria-label="Camera zoom">
      <button aria-label="Zoom out" disabled={cameraZoom<=MIN_CAMERA_ZOOM} onClick={()=>setCameraZoom(cameraZoom-.1)}><ZoomOut/></button>
      <output aria-live="polite">{Math.round(cameraZoom*100)}%</output>
      <button aria-label="Zoom in" disabled={cameraZoom>=MAX_CAMERA_ZOOM} onClick={()=>setCameraZoom(cameraZoom+.1)}><ZoomIn/></button>
    </section>
    <section className="multiplayer-card" aria-label="Multiplayer room">
      <div className="multiplayer-title"><Users/><strong>Play together</strong></div>
      {connectionStatus==='connected'?<><div className="room-code"><small>ROOM</small><b>{roomId}</b><button aria-label="Copy room code" onClick={()=>navigator.clipboard.writeText(roomId)}><Copy/></button></div><p>{peerCount} player{peerCount===1?'':'s'} connected</p><button className="leave-room" onClick={leaveRoom}><LogOut/> Leave room</button></>:<><button className="create-room" disabled={connectionStatus==='connecting'} onClick={createRoom}>Create a room</button><div className="join-room"><input aria-label="Room code" placeholder="ROOM ID" value={roomInput} maxLength={6} onChange={event=>setRoomInput(normalizeRoomCode(event.target.value))}/><button disabled={connectionStatus==='connecting'} onClick={()=>joinRoom(roomInput)}>Join</button></div>{roomMessage&&<p className="room-message">{roomMessage}</p>}</>}
    </section>
    <section className="hp-card" aria-label={`Health ${health} of ${maxHealth}`}>
      <div><strong>HP</strong><small>Auto-repair · 5s</small><span>{health} / {maxHealth}</span></div>
      <div className="hp-track"><i style={{width:`${Math.max(0,Math.min(100,health/maxHealth*100))}%`}} /></div>
    </section>
    <div className="yard-help"><b>WASD</b> Explore forever <span>•</span> <b>Mouse</b> Aim <span>•</span> <b>Hold click</b> Shoot</div>
  </main>;
}
