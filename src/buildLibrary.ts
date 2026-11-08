import { validBuild } from './buildValidation';
import { TankBuild } from './game/config';

export type SavedBuild = { id:string; savedAt:number; build:TankBuild; shareId?:string };
const STORAGE_KEY='snap-tank-library-v1';
export const copyBuild=(build:TankBuild):TankBuild=>({...build,attachments:build.attachments.map(item=>({...item}))});


export function readBuildLibrary():SavedBuild[] {
  const raw=localStorage.getItem(STORAGE_KEY);
  if(!raw)return [];
  const data:unknown=JSON.parse(raw);
  if(!Array.isArray(data))throw new Error('Saved builds could not be read.');
  if(!data.every(item=>item&&typeof item.id==='string'&&Number.isFinite(item.savedAt)&&validBuild(item.build)&&(item.shareId===undefined||typeof item.shareId==='string'&&/^[a-z]+_[a-z]+_[a-z]+$/.test(item.shareId))))throw new Error('Saved builds could not be read.');
  return data;
}

// Write first: a full or unavailable browser store must never report a successful save.
export function writeBuildLibrary(builds:SavedBuild[]):void {
  localStorage.setItem(STORAGE_KEY,JSON.stringify(builds));
}
