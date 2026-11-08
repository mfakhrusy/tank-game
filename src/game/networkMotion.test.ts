import { expect,it } from 'vitest';
import type { WorldSnapshot } from '../multiplayer';
import { NetworkMotion,interpolatePosition,interpolateRotation } from './networkMotion';
const snapshot=(revision:number,x:number,alive=true):WorldSnapshot=>({revision,players:[],enemies:[],projectiles:alive?[{id:'shot',ownerId:'one',behavior:'popper',x,y:0,rotation:0,size:6,color:0xffffff}]:[],stats:{blocks:0,shots:1,hits:0}});
function position(buffer:NetworkMotion,time:number){
  const frame=buffer.sample(time)!;const shot=frame.from.projectiles.get('shot');
  return shot?interpolatePosition(shot,frame.to.projectiles.get('shot'),frame.alpha).x:null;
}
it('renders uniform shot motion between snapshots despite late packet arrival',()=>{
  const buffer=new NetworkMotion();
  buffer.push(snapshot(2,0),1000);
  buffer.push(snapshot(4,66),1066);
  buffer.push(snapshot(6,132),1145); // 13 ms of jitter, still inside the render buffer.
  buffer.push(snapshot(8,198),1198);
  const positions=Array.from({length:8},(_,i)=>position(buffer,1110+i*16)!);
  const velocities=positions.slice(1).map((x,i)=>(x-positions[i])/16);
  velocities.forEach(v=>expect(v).toBeCloseTo(1));
});
it('keeps disappearance aligned to the playback timeline and never extrapolates indefinitely',()=>{
  const buffer=new NetworkMotion();buffer.push(snapshot(2,0),1000);buffer.push(snapshot(4,66),1066);
  buffer.push(snapshot(6,132,false),1132);
  expect(position(buffer,1210)).not.toBeNull();
  expect(position(buffer,1232)).toBeNull();
  expect(position(buffer,5000)).toBeNull();
});
it('ignores stale snapshots, resets on reconnect, and blends correctly at any frame rate',()=>{
  const buffer=new NetworkMotion();buffer.push(snapshot(20,0),1000);buffer.push(snapshot(22,66),1066);
  expect(buffer.push(snapshot(21,999),1080)).toBe(false);
  expect(position(buffer,1133)).toBeCloseTo(33);
  buffer.clear();expect(buffer.sample(1200)).toBeNull();
  expect(buffer.push(snapshot(2,5),1300)).toBe(true);
  expect(position(buffer,1400)).toBe(5);
  expect(interpolatePosition({x:0,y:0},{x:1000,y:0},.5).x).toBe(0);
});
it('takes the short rotation path through the angle wrap',()=>{
  expect(interpolateRotation(Math.PI-.1,-Math.PI+.1,.5)).toBeCloseTo(Math.PI);
});
