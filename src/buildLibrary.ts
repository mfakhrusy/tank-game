import { PARTS, TankBuild } from './game/config';

export type SavedBuild = { id:string; savedAt:number; build:TankBuild };
const STORAGE_KEY='snap-tank-library-v1';
export const copyBuild=(build:TankBuild):TankBuild=>({...build,attachments:build.attachments.map(item=>({...item}))});

function validBuild(value:unknown):value is TankBuild {
  if(!value||typeof value!=='object')return false;
  const build=value as TankBuild;
  if(build.version!==2||typeof build.name!=='string'||build.name.length>24||typeof build.color!=='string'||!/^#[0-9a-f]{6}$/i.test(build.color)||!Array.isArray(build.attachments)||build.attachments.length>16)return false;
  const sockets=new Set<string>(),ids=new Set<string>();
  return build.attachments.every(item=>{
    if(!item||typeof item.uid!=='string'||!item.uid||ids.has(item.uid)||!PARTS.some(part=>part.id===item.partId)||!Number.isInteger(item.mount)||item.mount<0||item.mount>7||(item.layer!==0&&item.layer!==1))return false;
    const socket=`${item.mount}:${item.layer}`;
    if(sockets.has(socket))return false;
    sockets.add(socket);ids.add(item.uid);return true;
  });
}

export function readBuildLibrary():SavedBuild[] {
  const raw=localStorage.getItem(STORAGE_KEY);
  if(!raw)return [];
  const data:unknown=JSON.parse(raw);
  if(!Array.isArray(data))throw new Error('Saved builds could not be read.');
  if(!data.every(item=>item&&typeof item.id==='string'&&Number.isFinite(item.savedAt)&&validBuild(item.build)))throw new Error('Saved builds could not be read.');
  return data;
}

// Write first: a full or unavailable browser store must never report a successful save.
export function writeBuildLibrary(builds:SavedBuild[]):void {
  localStorage.setItem(STORAGE_KEY,JSON.stringify(builds));
}
