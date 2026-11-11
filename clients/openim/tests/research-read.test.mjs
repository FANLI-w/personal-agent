import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

async function fixture(options={}) {
  const slots=[],effects=[],timers=new Map();let cursor=0,dirty=false,clock=0,nextTimer=0;
  const actor={generation:1},f={calls:0,mode:'success',value:'first',reader:undefined};
  const store=Object.assign(select=>select(actor),{getState:()=>actor});
  const same=(a,b)=>a&&b&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
  const react={
    useState(initial){const i=cursor++;if(!(i in slots))slots[i]={value:typeof initial==='function'?initial():initial};return[slots[i].value,value=>{const next=typeof value==='function'?value(slots[i].value):value;if(!Object.is(next,slots[i].value)){slots[i].value=next;dirty=true}}]},
    useRef(value){const i=cursor++;return slots[i]||=( {current:value} )},
    useCallback(callback,deps){const i=cursor++;if(!same(slots[i]?.deps,deps))slots[i]={deps,value:callback};return slots[i].value},
    useEffect(callback,deps){const i=cursor++;if(!same(slots[i]?.deps,deps)){const old=slots[i];slots[i]={deps,cleanup:old?.cleanup};effects.push(()=>{slots[i].cleanup?.();slots[i].cleanup=callback()})}},
  };
  const timer=(callback,ms,interval=false)=>{const id=++nextTimer;timers.set(id,{callback,at:clock+ms,ms,interval});return id};
  const imports={react,'./store':{useResearchStore:store}};
  const load=async file=>{
    const source=await readFile(new URL('../src/research/'+file,import.meta.url),'utf8'),module={exports:{}};
    vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{
      module,exports:module.exports,require:name=>{assert(Object.hasOwn(imports,name),name);return imports[name]},
      AbortController,DOMException,Error,Date:{now:()=>clock},document:{visibilityState:'visible'},
      setTimeout:(fn,ms)=>timer(fn,ms),clearTimeout:id=>timers.delete(id),setInterval:(fn,ms)=>timer(fn,ms,true),clearInterval:id=>timers.delete(id),
    });return module.exports;
  };
  imports['./request-deadline']=await load('request-deadline.ts');
  const {transientReadFailure}=await load('read-errors.ts');
  const {useResearchRead}=await load('useResearchRead.ts');
  f.options={timeoutMs:100,keepDataOnError:transientReadFailure,...options};
  const reader=signal=>{f.calls++;if(f.reader)return f.reader(signal);if(f.mode==='stall')return new Promise(()=>{});if(f.mode==='fail')return Promise.reject(f.failure);return Promise.resolve(f.value)};
  f.render=()=>{dirty=false;cursor=0;f.read=useResearchRead(reader,'task-list',true,f.options);effects.splice(0).forEach(fn=>fn())};
  f.settle=async()=>{for(let i=0;i<16;i++){await Promise.resolve();if(dirty)f.render()}};
  f.advance=async ms=>{clock+=ms;for(const[id,t]of [...timers])if(t.at<=clock){if(t.interval)t.at=clock+t.ms;else timers.delete(id);t.callback()}await f.settle()};
  f.switchActor=async()=>{actor.generation++;f.render();await f.settle()};
  f.close=()=>{slots.forEach(s=>s?.cleanup?.())};
  f.render();await f.settle();return f;
}

test('a stalled first task read ends loading at its deadline and can retry successfully',async t=>{
 const f=await fixture();t.after(f.close);f.mode='stall';void f.read.refresh();await f.settle();
 // Remove the first data as an actor change would, then let the actual deadline fire.
 await f.switchActor();assert.equal(f.read.data,undefined);assert.equal(f.read.loading,true);
 await f.advance(100);assert.equal(f.read.loading,false);assert.match(f.read.error,/读取超时/);
 f.mode='success';f.value='recovered';await f.read.refresh();await f.settle();assert.equal(f.read.data,'recovered');assert.equal(f.read.error,'');
});
test('transport failure retains clearly stale data, recovery clears the error, and 401/403 remove it',async t=>{
 const f=await fixture();t.after(f.close);assert.equal(f.read.data,'first');
 f.mode='fail';f.failure=Object.assign(Error('offline'),{status:0,code:'NETWORK_ERROR'});await f.read.refresh();await f.settle();assert.equal(f.read.data,'first');assert.equal(f.read.error,'offline');
 f.mode='success';f.value='latest';await f.read.refresh();await f.settle();assert.equal(f.read.data,'latest');assert.equal(f.read.error,'');
 for(const status of[401,403]){f.mode='fail';f.failure=Object.assign(Error('forbidden'),{status});await f.read.refresh();await f.settle();assert.equal(f.read.data,undefined)}
});
test('invalid responses and validation errors cannot retain previous task facts',async t=>{
 const f=await fixture();t.after(f.close);f.mode='fail';f.failure=Object.assign(Error('bad payload'),{status:200,code:'INVALID_RESPONSE'});
 await f.read.refresh();await f.settle();assert.equal(f.read.data,undefined);assert.equal(f.read.loading,false);
});
test('account generation clears old facts immediately and ignores late successful reads',async t=>{
 const f=await fixture();t.after(f.close);let finish;
 f.reader=()=>new Promise(resolve=>{finish=resolve});void f.read.refresh();await f.settle();const old=finish;
 await f.switchActor();assert.equal(f.read.data,undefined);old('old private data');await f.settle();assert.equal(f.read.data,undefined);
 finish('new account');await f.settle();assert.equal(f.read.data,'new account');
});
test('polling and repeated refreshes coalesce a pending read instead of restarting it',async t=>{
 const f=await fixture({timeoutMs:30000});t.after(f.close);let finish;
 f.reader=()=>new Promise(resolve=>{finish=resolve});void f.read.refresh();await f.settle();const count=f.calls;
 void f.read.refresh();await f.advance(5000);assert.equal(f.calls,count);finish('done');await f.settle();assert.equal(f.read.data,'done');assert.equal(f.read.loading,false);
});
test('disabling polling permits an explicit retry without perpetual background checks',async t=>{
 const f=await fixture({poll:false});t.after(f.close);const count=f.calls;await f.advance(20000);assert.equal(f.calls,count);
 await f.read.refresh();await f.settle();assert.equal(f.calls,count+1);
});
