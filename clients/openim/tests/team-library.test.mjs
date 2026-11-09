import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {libraryFixture,TeamLibraryStore,gitRunner,sha} from './helpers/team-library.mjs';
import {TeamLibraryPath} from '../../../packages/contracts/dist/team-library.js';

test('real Git fetch, verified originals, cached reopen and failed refresh preserve the published version',async t=>{
 const f=await libraryFixture(t),snap=await f.store.sync(),selected={revision:snap.revision,entryId:f.entry.id};
 assert.equal((await f.store.read(selected)).bytes.toString(),f.text);
 const original=await f.store.materialize(selected);assert.equal(await fs.readFile(original.file,'utf8'),f.text);
 assert.equal((await new TeamLibraryStore(path.join(f.root,'cache'),f.binding).cached()).revision,snap.revision);
 f.offline(true);await assert.rejects(f.store.sync(),/offline/);assert.equal((await f.store.cached()).revision,snap.revision);f.offline(false);
 const corrupt=structuredClone(f.manifest);corrupt.entries[0].source.sha256='0'.repeat(64);await f.publish(corrupt);
 const next=await f.store.sync();await assert.rejects(f.store.read({...selected,revision:next.revision}),/校验失败/);
 await assert.rejects(f.store.read(selected),/版本已变化/);
});
test('an update creates one recoverable review branch, never moves main and does not overwrite another file',async t=>{
 const f=await libraryFixture(t),snap=await f.store.sync();f.lose();
 const body='# 新的项目要求\n\n保留来源，不编造测量。\n';
 await assert.rejects(f.store.propose(snap.revision,f.entry,body),/response lost/);
 const proposal=await f.store.propose(snap.revision,f.entry,body),again=await f.store.propose(snap.revision,f.entry,body);
 assert.equal(proposal.commit,again.commit);assert.equal(f.git(['--git-dir='+f.remote,'rev-parse','main']).toString().trim(),snap.revision);
 const branches=f.git(['--git-dir='+f.remote,'for-each-ref','--format=%(refname)','refs/heads/acceptcat/']).toString().trim().split('\n');assert.equal(branches.length,1);
 const published=JSON.parse(f.git(['--git-dir='+f.remote,'show',proposal.commit+':acceptcat-library.json']));assert.equal(published.entries[0].source.sha256,sha(body));
 await assert.rejects(f.store.propose(snap.revision,{...f.entry,id:'another'},body),/路径已被|路径已有/);
});
test('invalid manifest and cross-workspace fetch leave last-good cache intact',async t=>{
 const f=await libraryFixture(t),snap=await f.store.sync();await f.publish({...f.manifest,workspaceId:'another'});await assert.rejects(f.store.sync(),/空间ID/);
 assert.equal((await f.store.cached()).revision,snap.revision);
 assert.notEqual(new TeamLibraryStore(path.join(f.root,'cache'),{...f.binding,labId:'another'}).directory,f.store.directory);
 assert.notEqual(new TeamLibraryStore(path.join(f.root,'other-account'),f.binding).directory,f.store.directory);
 for(const name of ['../secret','C:/x','a/../../x','x\\y','a/.git/config','NUL.md','a/con.txt','x.','a/x\u0000.md'])assert.equal(TeamLibraryPath.safeParse(name).success,false,name);
});
test('production runner initializes an owned bare repository and cannot use local/file transport',async t=>{
 const f=await libraryFixture(t),folder=path.join(f.root,'production.git'),run=gitRunner(folder);
 await run(['init','--bare',folder]);await run(['config','remote.origin.url',f.remote]);
 await assert.rejects(run(['fetch','origin','main']),/Git操作未完成/);
 assert.equal((await run(['rev-parse','--is-bare-repository'])).toString().trim(),'true');
});
test('a new project is proposed independently with stable retry and no spurious material entry',async t=>{
 const f=await libraryFixture(t),snapshot=await f.store.sync(),project={id:'patent',name:'专利申请',description:'公开示例项目'};
 const result=await f.store.proposeProject(snapshot.revision,project),again=await f.store.proposeProject(snapshot.revision,project);
 assert.equal(result.commit,again.commit);assert.equal(result.entry,null);
 const manifest=JSON.parse(f.git(['--git-dir='+f.remote,'show',result.commit+':acceptcat-library.json']));
 assert.equal(manifest.projects.length,2);assert.equal(manifest.entries.length,1);
 assert.equal(f.git(['--git-dir='+f.remote,'rev-parse','main']).toString().trim(),snapshot.revision);
});
