import { beforeEach,expect,it,vi } from 'vitest';
import { copyBuild,readBuildLibrary,writeBuildLibrary } from './buildLibrary';
import { DEFAULT_BUILD } from './game/config';
beforeEach(()=>{localStorage.clear();vi.restoreAllMocks();});
it('stores independent build snapshots across reads',()=>{
  const build=copyBuild(DEFAULT_BUILD);
  writeBuildLibrary([{id:'saved',savedAt:123,build}]);
  build.attachments[0].partId='bonker';
  expect(readBuildLibrary()[0].build.attachments[0].partId).toBe('popper');
  const loaded=copyBuild(readBuildLibrary()[0].build);loaded.attachments=[];
  expect(readBuildLibrary()[0].build.attachments.length).toBeGreaterThan(0);
});
it('rejects damaged builds without overwriting the original storage',()=>{
  const raw=JSON.stringify([{id:'bad',savedAt:123,build:{...DEFAULT_BUILD,attachments:[{uid:'bad',partId:'unknown',mount:0,layer:0}]}}]);
  localStorage.setItem('snap-tank-library-v1',raw);
  expect(()=>readBuildLibrary()).toThrow();
  expect(localStorage.getItem('snap-tank-library-v1')).toBe(raw);
});
it('reports storage failures instead of claiming a save succeeded',()=>{
  vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new DOMException('Full','QuotaExceededError');});
  expect(()=>writeBuildLibrary([{id:'saved',savedAt:123,build:DEFAULT_BUILD}])).toThrow();
});
