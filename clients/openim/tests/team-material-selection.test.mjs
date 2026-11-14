import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
const source=await readFile(new URL('../src/research/team-material-selection.ts',import.meta.url),'utf8');
const module={exports:{}};
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module,exports:module.exports});
const {findTeamMaterials,selectedTeamEntryIds}=module.exports;
const entry=(id,name,purpose)=>({id,name,purpose,projectId:'group',summary:'',maintainer:'',recommended:false,source:{kind:'git',path:name,sha256:'a'.repeat(64)}});
const manifest={projects:[{id:'group',name:'组会',description:''}],entries:[entry('ppt','组会模板.pptx','template'),entry('fig','实验结果.png','figure'),{...entry('other','报销说明.md','reference'),projectId:'finance'}]};
test('a single request finds actual template and figure candidates without inventing missing originals',()=>{
  const candidates=findTeamMaterials(manifest,'用上次组会的模板，把这次实验图放进去');
  assert.deepEqual(Array.from(candidates,item=>item.id).sort(),['fig','ppt']);
  assert.equal(findTeamMaterials(manifest,'完全不存在的内容xyz').length,0);
});
test('multiple selected entries survive the task URL while legacy single-entry links still work',()=>{
  assert.deepEqual(Array.from(selectedTeamEntryIds(new URLSearchParams('teamEntry=ppt&teamEntry=fig&teamEntry=ppt'))),['ppt','fig']);
  assert.deepEqual(Array.from(selectedTeamEntryIds(new URLSearchParams('teamEntry=ppt'))),['ppt']);
  assert.deepEqual(Array.from(selectedTeamEntryIds(new URLSearchParams('teamEntry='))),[]);
});
