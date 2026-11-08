import { useEffect, useRef, useState } from 'react';
import { Copy, FolderOpen, Save, Trash2 } from 'lucide-react';
import { copyBuild, readBuildLibrary, SavedBuild, writeBuildLibrary } from '../buildLibrary';
import { BuildSharingRateLimit, fetchSharedBuild, publishBuild } from '../buildSharing';
import { useGameStore } from '../store';

export function BuildLibrary({onLoad}:{onLoad:()=>void}) {
  const build=useGameStore(state=>state.build),loadBuild=useGameStore(state=>state.loadBuild);
  const [initial]=useState(()=>{try{return {builds:readBuildLibrary(),error:''};}catch{return {builds:[],error:'Cannot read saved builds. Browser storage may be unavailable or damaged.'};}});
  const [saved,setSaved]=useState<SavedBuild[]>(initial.builds),[message,setMessage]=useState(initial.error);
  const [shareErrors,setShareErrors]=useState<Record<string,string>>({});
  const [retryAt,setRetryAt]=useState(0);
  useEffect(()=>{if(!retryAt)return;const timer=setTimeout(()=>setRetryAt(0),Math.max(0,retryAt-Date.now()));return ()=>clearTimeout(timer);},[retryAt]);
  const savedRef=useRef(saved);savedRef.current=saved;
  const [importId,setImportId]=useState(''),[importing,setImporting]=useState(false);
  const commit=(next:SavedBuild[],success:string)=>{
    try{writeBuildLibrary(next);savedRef.current=next;setSaved(next);setMessage(success);}catch{setMessage('Could not save changes. Browser storage may be full or unavailable.');}
  };
  // Backfill old saves and publish new snapshots one at a time. A changed/deleted
  // save cancels its result, so an in-flight upload cannot restore stale content.
  useEffect(()=>{
    const pending=saved.find(item=>!item.shareId&&!shareErrors[`${item.id}:${item.savedAt}`]);
    if(!pending||initial.error||retryAt)return;
    let canceled=false;
    void publishBuild(pending.build).then(shareId=>{
      if(canceled)return;
      const current=savedRef.current,entry=current.find(item=>item.id===pending.id);
      if(!entry||entry.savedAt!==pending.savedAt||JSON.stringify(entry.build)!==JSON.stringify(pending.build))return;
      const next=current.map(item=>item.id===pending.id?{...item,shareId}:item);
      try{writeBuildLibrary(next);savedRef.current=next;setSaved(next);}catch{setShareErrors(errors=>({...errors,[`${pending.id}:${pending.savedAt}`]:'Could not store the share ID. Free some browser storage, then retry.'}));}
    }).catch(error=>{if(!canceled&&error instanceof BuildSharingRateLimit){setRetryAt(Date.now()+error.retryAfterMs);return;}if(!canceled)setShareErrors(errors=>({...errors,[`${pending.id}:${pending.savedAt}`]:error instanceof Error?error.message:'Could not assign a build ID.'}));});
    return ()=>{canceled=true;};
  },[saved,shareErrors,initial.error,retryAt]);
  const snapshot=()=>({...copyBuild(build),name:build.name.trim()||'Untitled tank'});
  const copyId=async(id:string)=>{
    try{await navigator.clipboard.writeText(id);setMessage('Build ID copied. Paste it into Load a build by ID on another computer.');}
    catch{setMessage('Could not copy automatically. Select the ID above and copy it.');}
  };
  const importBuild=async()=>{
    if(importing)return;setImporting(true);setMessage('Loading shared build…');
    try{
      const shared=await fetchSharedBuild(importId);let stored=!initial.error;
      if(stored&&!savedRef.current.some(item=>item.shareId===shared.id)){
        const next=[{id:crypto.randomUUID(),savedAt:Date.now(),build:copyBuild(shared.build),shareId:shared.id},...savedRef.current];
        try{writeBuildLibrary(next);savedRef.current=next;setSaved(next);}catch{stored=false;}
      }
      loadBuild(shared.build);onLoad();setImportId('');setMessage(stored?`${shared.build.name} loaded and saved to My builds.`:'Build loaded, but browser storage could not save a copy.');
    }catch(error){setMessage(error instanceof Error?error.message:'Could not load this build.');}finally{setImporting(false);}
  };
  return <section className="build-library" aria-label="Saved builds">
    <div className="library-heading"><h2><FolderOpen size={18}/> My builds <small>{saved.length}</small></h2>
      <button disabled={!!initial.error||importing} onClick={()=>commit([{id:crypto.randomUUID(),savedAt:Date.now(),build:snapshot()},...saved], 'Build saved. Getting its share ID…')}><Save size={15}/> Save build</button>
    </div>
    <p className="library-note">Saves stay in this browser. A build ID lets you load a copy on any computer.</p>
    <form className="build-import" onSubmit={event=>{event.preventDefault();void importBuild();}}>
      <label htmlFor="shared-build-id">Load a build by ID</label>
      <div><input id="shared-build-id" value={importId} onChange={event=>setImportId(event.target.value)} maxLength={64} placeholder="horse_staple_battery" autoCapitalize="none" autoCorrect="off" spellCheck={false} disabled={importing}/><button disabled={importing||!importId.trim()} type="submit">{importing?'Loading…':'Load ID'}</button></div>
    </form>
    {!saved.length&&<p className="library-empty">Save your first tank to start your collection.</p>}
    <ul>{saved.map(item=><li key={item.id}>
      <div className="saved-build-title"><i style={{background:item.build.color}}/><div><strong>{item.build.name}</strong><small>{item.build.attachments.length} parts · {new Date(item.savedAt).toLocaleDateString()}</small></div></div>
      <div className="saved-build-share">{item.shareId?<><code>{item.shareId}</code><button aria-label={`Copy build ID for ${item.build.name}`} onClick={()=>{void copyId(item.shareId!);}}><Copy size={13}/> Copy ID</button></>:shareErrors[`${item.id}:${item.savedAt}`]?<><small className="share-error">{shareErrors[`${item.id}:${item.savedAt}`]}</small><button onClick={()=>setShareErrors(errors=>{const next={...errors};delete next[`${item.id}:${item.savedAt}`];return next;})}>Retry ID</button></>:<small>{retryAt?'Sharing paused; retrying automatically…':'Getting share ID…'}</small>}</div>
      <div className="saved-build-actions">
        <button disabled={importing} aria-label={`Load ${item.build.name}`} onClick={()=>{loadBuild(item.build);onLoad();setMessage(`${item.build.name} loaded.`);}}>Load</button>
        <button disabled={importing} aria-label={`Update ${item.build.name}`} title="Replace this save; changed builds get a new ID and old IDs keep their original snapshots" onClick={()=>commit(saved.map(entry=>entry.id===item.id?{...entry,build:snapshot(),savedAt:Date.now(),shareId:undefined}:entry), 'Saved build updated. Getting its new share ID…')}>Update</button>
        <button disabled={importing} className="delete-build" aria-label={`Delete ${item.build.name}`} onClick={()=>commit(saved.filter(entry=>entry.id!==item.id),'Saved build deleted.')}><Trash2 size={14}/></button>
      </div>
    </li>)}</ul>
    <p className="library-note">Anyone with an ID can load that snapshot. Editing a save creates a new ID; older IDs keep working.</p>
    <p className="library-message" role="status">{message}</p>
  </section>;
}
