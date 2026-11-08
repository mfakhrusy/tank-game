import { validBuild } from './buildValidation';
import type { TankBuild } from './game/config';
export const normalizeBuildId=(value:string)=>value.trim().toLowerCase().replace(/[\s-]+/g,'_');
export const isBuildId=(id:string)=>/^[a-z]{2,12}_[a-z]{2,12}_[a-z]{2,12}$/.test(id);
async function sharingRequest(path:string,options?:RequestInit){
  let response:Response;
  try{response=await fetch(path,{...options,signal:AbortSignal.timeout(12000)});}catch{throw new Error('Could not reach build sharing. Check your connection and try again.');}
  const result:unknown=await response.json().catch(()=>null);
  if(!response.ok)throw new Error(result&&typeof result==='object'&&'error' in result&&typeof result.error==='string'?result.error:'Build sharing is temporarily unavailable. Please try again.');
  return result;
}
export async function publishBuild(build:TankBuild):Promise<string>{
  const result=await sharingRequest('/api/builds',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(build)}) as {id?:unknown}|null;
  if(!result||typeof result.id!=='string'||!isBuildId(result.id))throw new Error('Build sharing returned an invalid ID. Please try again.');
  return result.id;
}
export async function fetchSharedBuild(value:string){
  const id=normalizeBuildId(value);
  if(!isBuildId(id))throw new Error('Enter a three-word build ID, like horse_staple_battery.');
  const result=await sharingRequest(`/api/builds/${encodeURIComponent(id)}`) as {build?:unknown}|null;
  if(!result||!validBuild(result.build))throw new Error('This shared build could not be loaded. It may use newer modules.');
  return {id,build:result.build};
}
