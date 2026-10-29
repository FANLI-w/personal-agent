import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url), client = fileURLToPath(new URL('../', import.meta.url));
const esbuild = createRequire(require.resolve('vite'))('esbuild');
const preload = (await esbuild.build({entryPoints:[path.join(client,'electron/preload/localDsh.ts')],bundle:true,platform:'node',format:'cjs',external:['electron'],write:false})).outputFiles[0].text;

test('DSH file bridge accepts picked Files only, retains browser upload fallback and exposes no app APIs', () => {
  class File { constructor(path) { this.path = path; } }
  for (const [main,protocol,hostname,enabled] of [[true,'http:','127.0.0.1',true],[false,'http:','127.0.0.1',false],[true,'https:','example.com',false]]) {
    const exposed={},calls=[];
    vm.runInNewContext(preload,{File,process:{isMainFrame:main},location:{protocol,hostname},require:id=>{
      assert.equal(id,'electron');return{contextBridge:{exposeInMainWorld:(k,v)=>exposed[k]=v},ipcRenderer:{invoke:k=>calls.push(k)},webUtils:{getPathForFile:f=>f.path||''}};
    }});
    assert.equal(Object.keys(exposed).length,enabled?2:0);
    if(!enabled) continue;
    assert.equal(exposed.__DSH_HOST_PATHS__.pathFor(new File('C:\\public\\paper.pdf')),'C:\\public\\paper.pdf');
    assert.equal(exposed.__DSH_HOST_PATHS__.pathFor(new File()),'');
    assert.equal(exposed.__DSH_HOST_PATHS__.pathFor({path:'C:\\forged.pdf'}),'');
    exposed.__DSH_DIRECTORY_PICKER__.pick();assert.deepEqual(calls,['local-dsh-pick-directory']);
  }
});

const managed = (await esbuild.build({entryPoints:[path.join(client,'electron/main/localDshManage.ts')],bundle:true,platform:'node',format:'cjs',write:false,external:['electron','./localDshRuntime'],
  plugins:[{name:'isolated-native-bridge',setup(build){
    build.onLoad({filter:/localFolderManage\.ts$/},()=>({contents:'export const authority=e=>({contents:e.sender});',loader:'js'}));
    build.onLoad({filter:/localDshAccount\.ts$/},()=>({contents:'export const dshAccount=()=>globalThis.fixtureAccount;export const createDshRelay=async()=>({baseURL:"http://127.0.0.1:1",secret:"synthetic",close:async()=>{}});',loader:'js'}));
    build.onLoad({filter:/taskDshManage\.ts$/},()=>({contents:'export const registerTaskDshBridge=()=>{};',loader:'js'}));
  }}],
})).outputFiles[0].text;

test('native directory picker is restricted to the owned DSH main frame and rechecks account after the dialog', async () => {
  const handlers=new Map();let view,valid=true,afterPick=()=>{},selection={canceled:false,filePaths:['C:\\synthetic']},picks=0;
  const owner={isDestroyed:()=>false,removeBrowserView:()=>{}};
  const contents=Object.assign(new EventEmitter(),{getURL:()=> 'http://app/#/dsh'});
  class View {
    constructor(){view=this;const wc=this.webContents=Object.assign(new EventEmitter(),{isDestroyed:()=>false,close:()=>{},getURL:()=> 'http://127.0.0.1:1234/',loadURL:async()=>{},setWindowOpenHandler:()=>{},debugger:{attach:()=>{},sendCommand:async()=>{}}});wc.mainFrame={url:'http://127.0.0.1:1234/'};}
  }
  const account={identity:'synthetic',lease:'one',metadata:{enabled:true,fingerprint:'one'},valid:async()=>{if(!valid)throw Error('expired');}};
  const mod={exports:{}};
  vm.runInNewContext(managed,{module:mod,exports:mod.exports,process,URL,__dirname:path.join(client,'dist-electron/main'),fixtureAccount:account,
    setInterval:()=>({unref(){}}),require:id=>id==='electron'?{
      app:{isPackaged:false,getAppPath:()=>client,getPath:()=>client,on:()=>{}},BrowserView:View,BrowserWindow:{fromWebContents:()=>owner},
      ipcMain:{handle:(k,v)=>handlers.set(k,v)},session:{fromPartition:()=>({setPermissionRequestHandler(){},setPermissionCheckHandler(){}})},
      dialog:{showOpenDialog:async()=>{picks++;afterPick();return selection;}},shell:{},
    }:id==='./localDshRuntime'?{
      prepareAccountProfile:async()=>'',dshBrowserCompatibility:'',
      LocalDshRuntime:class {state={phase:'stopped'};async start(){this.state.phase='running';return 'http://127.0.0.1:1234/';}async stop(){this.state.phase='stopped';}},
    }:require(id),
  });
  mod.exports.registerLocalDshBridge();const snapshot=await handlers.get('local-dsh-connect')({sender:contents});assert.equal(snapshot.error,undefined);
  const pick=handlers.get('local-dsh-pick-directory'),event=()=>({sender:view.webContents,senderFrame:view.webContents.mainFrame});
  await assert.rejects(pick({sender:contents,senderFrame:{url:'http://app/'}}),/连接已变化/);assert.equal(picks,0);
  await assert.rejects(pick({sender:view.webContents,senderFrame:{url:'http://127.0.0.1:1234/'}}),/连接已变化/);
  assert.equal(await pick(event()),'C:\\synthetic');
  selection={canceled:true,filePaths:[]};assert.equal(await pick(event()),undefined);
  selection={canceled:false,filePaths:['C:\\synthetic']};afterPick=()=>{valid=false;};await assert.rejects(pick(event()),/expired/);
});
