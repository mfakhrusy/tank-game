import { useState } from 'react';
import { FolderOpen, Save, Trash2 } from 'lucide-react';
import { copyBuild, readBuildLibrary, SavedBuild, writeBuildLibrary } from '../buildLibrary';
import { useGameStore } from '../store';

export function BuildLibrary({onLoad}:{onLoad:()=>void}) {
  const build=useGameStore(state=>state.build),loadBuild=useGameStore(state=>state.loadBuild);
  const [initial]=useState(()=>{try{return {builds:readBuildLibrary(),error:''};}catch{return {builds:[],error:'Cannot read saved builds. Browser storage may be unavailable or damaged.'};}});
  const [saved,setSaved]=useState<SavedBuild[]>(initial.builds),[message,setMessage]=useState(initial.error);
  const commit=(next:SavedBuild[],success:string)=>{
    try{writeBuildLibrary(next);setSaved(next);setMessage(success);}catch{setMessage('Could not save changes. Browser storage may be full or unavailable.');}
  };
  const snapshot=()=>({...copyBuild(build),name:build.name.trim()||'Untitled tank'});
  return <section className="build-library" aria-label="Saved builds">
    <div className="library-heading"><h2><FolderOpen size={18}/> My builds <small>{saved.length}</small></h2>
      <button disabled={!!initial.error} onClick={()=>commit([{id:crypto.randomUUID(),savedAt:Date.now(),build:snapshot()},...saved], 'Build saved.')}><Save size={15}/> Save build</button>
    </div>
    <p className="library-note">Saved in this browser. Your current draft autosaves separately.</p>
    {!saved.length&&<p className="library-empty">Save your first tank to start your collection.</p>}
    <ul>{saved.map(item=><li key={item.id}>
      <div className="saved-build-title"><i style={{background:item.build.color}}/><div><strong>{item.build.name}</strong><small>{item.build.attachments.length} parts · {new Date(item.savedAt).toLocaleDateString()}</small></div></div>
      <div className="saved-build-actions">
        <button aria-label={`Load ${item.build.name}`} onClick={()=>{loadBuild(item.build);onLoad();setMessage(`${item.build.name} loaded.`);}}>Load</button>
        <button aria-label={`Update ${item.build.name}`} title="Replace this save with your current build" onClick={()=>commit(saved.map(entry=>entry.id===item.id?{...entry,build:snapshot(),savedAt:Date.now()}:entry), 'Saved build updated.')}>Update</button>
        <button className="delete-build" aria-label={`Delete ${item.build.name}`} onClick={()=>commit(saved.filter(entry=>entry.id!==item.id),'Saved build deleted.')}><Trash2 size={14}/></button>
      </div>
    </li>)}</ul>
    <p className="library-message" role="status">{message}</p>
  </section>;
}
