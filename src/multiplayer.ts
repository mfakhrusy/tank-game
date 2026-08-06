import type { TankBuild } from './game/config';

export type NetworkPlayer = {
  id:string;
  build:TankBuild;
  x:number;
  y:number;
  rotation:number;
  health:number;
  maxHealth:number;
};

export type NetworkEnemy={id:string;variant:string;level:number;x:number;y:number;health:number;maxHealth:number};
export type NetworkProjectile={id:string;ownerId:string;behavior:string;x:number;y:number;rotation:number;size:number;color:number};
export type RoomStats={blocks:number;shots:number;hits:number};
export type WorldSnapshot={revision:number;players:NetworkPlayer[];enemies:NetworkEnemy[];projectiles:NetworkProjectile[];stats:RoomStats};
export type LocalNetworkState = Pick<NetworkPlayer,'x'|'y'|'rotation'>&{firing:boolean};

type Handlers = {
  welcome:(playerId:string,players:NetworkPlayer[])=>void;
  upsert:(player:NetworkPlayer)=>void;
  remove:(playerId:string)=>void;
  world:(snapshot:WorldSnapshot)=>void;
  status:(status:'connecting'|'connected'|'disconnected',message?:string)=>void;
};

export function normalizeRoomCode(value:string){return value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6);}

export async function createMultiplayerRoom(){
  const response=await fetch('/api/rooms',{method:'POST'});
  if(!response.ok)throw new Error('Could not create a room. Is the multiplayer server running?');
  const result=await response.json() as {roomId:string};
  return normalizeRoomCode(result.roomId);
}

export class MultiplayerConnection {
  private socket:WebSocket|null=null;
  constructor(private room:string,private build:TankBuild,private handlers:Handlers){}

  connect(){
    this.disconnect(false);
    this.handlers.status('connecting');
    const protocol=location.protocol==='https:'?'wss:':'ws:';
    this.socket=new WebSocket(`${protocol}//${location.host}/multiplayer/${this.room}`);
    this.socket.addEventListener('open',()=>this.socket?.send(JSON.stringify({type:'join',build:this.build})));
    this.socket.addEventListener('message',event=>this.receive(String(event.data)));
    this.socket.addEventListener('error',()=>this.handlers.status('disconnected','Room not found or the server is unavailable.'));
    this.socket.addEventListener('close',()=>this.handlers.status('disconnected'));
  }

  sendState(state:LocalNetworkState){
    if(this.socket?.readyState===WebSocket.OPEN)this.socket.send(JSON.stringify({type:'state',...state}));
  }

  disconnect(notify=true){
    if(this.socket){this.socket.close(1000,'Leaving room');this.socket=null;}
    if(notify)this.handlers.status('disconnected');
  }

  private receive(raw:string){
    let message:{type:string;[key:string]:unknown};
    try{message=JSON.parse(raw);}catch{return;}
    if(message.type==='welcome'){
      this.handlers.welcome(String(message.player_id),Array.isArray(message.players)?message.players as NetworkPlayer[]:[]);
      this.handlers.status('connected');
    }else if(message.type==='player_joined'||message.type==='player_state')this.handlers.upsert(message.player as NetworkPlayer);
    else if(message.type==='player_left')this.handlers.remove(String(message.player_id));
    else if(message.type==='world_snapshot')this.handlers.world(message as unknown as WorldSnapshot);
    else if(message.type==='error')this.handlers.status('disconnected',String(message.message??'Could not join this room.'));
  }
}
