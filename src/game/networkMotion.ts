import type { NetworkEnemy, NetworkProjectile, WorldSnapshot } from '../multiplayer';

const SNAPSHOT_DELAY_MS=100;
const SERVER_TICK_MS=33;
type Frame={time:number;enemies:Map<string,NetworkEnemy>;projectiles:Map<string,NetworkProjectile>};
export type RenderFrames={from:Frame;to:Frame;alpha:number};

// Keep a short history so packet timing does not become visible projectile acceleration.
export class NetworkMotion {
  private frames:Frame[]=[];
  private clockOffset:number|null=null;
  private revision=-1;
  push(snapshot:WorldSnapshot,receivedAt:number):boolean {
    if(snapshot.revision<=this.revision)return false;
    const serverTime=snapshot.revision*SERVER_TICK_MS;
    const offset=serverTime-receivedAt;
    if(this.clockOffset===null||Math.abs(offset-this.clockOffset)>1000){this.frames=[];this.clockOffset=offset;}
    // Lower-latency arrivals improve the estimate; late packets never rewind the clock.
    this.clockOffset=Math.max(this.clockOffset,offset);
    this.revision=snapshot.revision;
    this.frames.push({time:serverTime,enemies:new Map(snapshot.enemies.map(e=>[e.id,e])),projectiles:new Map(snapshot.projectiles.map(p=>[p.id,p]))});
    if(this.frames.length>8)this.frames.shift();
    return true;
  }
  sample(now:number):RenderFrames|null {
    if(!this.frames.length||this.clockOffset===null)return null;
    const time=now+this.clockOffset-SNAPSHOT_DELAY_MS;
    while(this.frames.length>2&&this.frames[1].time<=time)this.frames.shift();
    const from=this.frames[0],to=this.frames[1]??from;
    const alpha=to.time===from.time?0:Math.max(0,Math.min(1,(time-from.time)/(to.time-from.time)));
    // Once the next snapshot is reached, births and removals take effect together.
    return alpha===1?{from:to,to,alpha:0}:{from,to,alpha};
  }
  clear(){this.frames=[];this.clockOffset=null;this.revision=-1;}
}

export function interpolatePosition(from:{x:number;y:number},to:{x:number;y:number}|undefined,alpha:number){
  if(!to||Math.hypot(to.x-from.x,to.y-from.y)>500)return from;
  return {x:from.x+(to.x-from.x)*alpha,y:from.y+(to.y-from.y)*alpha};
}
export function interpolateRotation(from:number,to:number,alpha:number):number {
  const turn=Math.atan2(Math.sin(to-from),Math.cos(to-from));
  return from+turn*alpha;
}
